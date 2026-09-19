package dev.pedrogomez.aforo;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

@Service
public class InventoryService {
    private final JdbcClient db;
    private final SecureRandom random = new SecureRandom();

    public InventoryService(JdbcClient db) { this.db = db; }

    public record Guest(UUID id, String token) {}
    public record Event(String id, String name, String venue, Instant startsAt, int priceCents) {}
    public record Seat(int id, String row, int number, String state) {}
    public record Inventory(Instant serverTime, List<Seat> seats) {}
    public record Hold(UUID id, Instant expiresAt, Instant serverTime, List<Integer> seatIds, String state, String source) {}

    @Transactional
    public Guest createGuest() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        UUID id = UUID.randomUUID();
        db.sql("INSERT INTO demo_session(id, token_hash) VALUES (:id, :hash)")
            .param("id", id).param("hash", hash(token)).update();
        db.sql("INSERT INTO event_seat(session_id, event_id, seat_id) SELECT :id, 'nocturna', id FROM seat")
            .param("id", id).update();
        return new Guest(id, token);
    }

    public UUID authenticate(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) throw unauthorized();
        return db.sql("SELECT id FROM demo_session WHERE token_hash = :hash AND expires_at > clock_timestamp()")
            .param("hash", hash(token)).query(UUID.class).optional().orElseThrow(this::unauthorized);
    }

    private ApiFailure unauthorized() { return new ApiFailure(UNAUTHORIZED, "SESSION_REQUIRED", "Inicia una sesión de demostración."); }

    private static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    public Event event() {
        return db.sql("SELECT * FROM event WHERE id = 'nocturna'").query((rs, n) -> new Event(
            rs.getString("id"), rs.getString("name"), rs.getString("venue"),
            rs.getTimestamp("starts_at").toInstant(), rs.getInt("price_cents"))).single();
    }

    @Transactional(readOnly = true)
    public Inventory inventory(UUID session) {
        Instant now = now();
        List<Seat> seats = db.sql("""
            SELECT s.id, s.row_label, s.number,
                CASE WHEN r.expires_at > :now THEN 'HELD' ELSE 'AVAILABLE' END AS state
            FROM event_seat es JOIN seat s ON s.id = es.seat_id
            LEFT JOIN reservation r ON r.id = es.reservation_id
            WHERE es.session_id = :session AND es.event_id = 'nocturna' ORDER BY s.id
            """).param("session", session).param("now", Timestamp.from(now))
            .query((rs, n) -> new Seat(rs.getInt("id"), rs.getString("row_label"), rs.getInt("number"), rs.getString("state"))).list();
        return new Inventory(now, seats);
    }

    @Transactional
    public Hold reserve(UUID session, List<Integer> requested) {
        return reserveForActor(session, requested, null, null);
    }

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NESTED)
    public Hold reserveAutomated(UUID session, List<Integer> requested, UUID experiment, int buyer) {
        return reserveForActor(session, requested, experiment, buyer);
    }

    private Hold reserveForActor(UUID session, List<Integer> requested, UUID experiment, Integer buyer) {
        if (requested == null || requested.isEmpty() || requested.size() > 6 || requested.stream().anyMatch(Objects::isNull)
                || new HashSet<>(requested).size() != requested.size()) {
            throw new ApiFailure(BAD_REQUEST, "INVALID_SEATS", "Selecciona entre uno y seis asientos distintos.");
        }
        List<Integer> seats = requested.stream().sorted().toList();
        // Lock inventory rows only. Read their current reservation AFTER acquiring every lock.
        List<Integer> locked = db.sql("""
            SELECT seat_id FROM event_seat WHERE session_id = :session AND event_id = 'nocturna'
            AND seat_id IN (:seats) ORDER BY seat_id FOR UPDATE
            """).param("session", session).param("seats", seats).query(Integer.class).list();
        if (locked.size() != seats.size()) throw new ApiFailure(BAD_REQUEST, "INVALID_SEATS", "Algún asiento no existe.");
        Instant now = now(); // Database wall clock AFTER lock waits, not transaction start time.
        int occupied = db.sql("""
            SELECT count(*) FROM event_seat es JOIN reservation r ON r.id = es.reservation_id
            WHERE es.session_id = :session AND es.event_id = 'nocturna'
            AND es.seat_id IN (:seats) AND r.expires_at > :now
            """).param("session", session).param("seats", seats).param("now", Timestamp.from(now)).query(Integer.class).single();
        if (occupied > 0) throw new ApiFailure(CONFLICT, "SEAT_UNAVAILABLE", "Uno de los asientos ya está reservado. Actualiza el plano.");
        UUID id = UUID.randomUUID();
        Instant expires = now.plusSeconds(300);
        db.sql("INSERT INTO reservation(id, session_id, event_id, created_at, expires_at, experiment_id, buyer_number) VALUES (:id, :session, 'nocturna', :now, :expires, :experiment, :buyer)")
            .param("id", id).param("session", session).param("now", Timestamp.from(now)).param("expires", Timestamp.from(expires))
            .param("experiment", experiment).param("buyer", buyer).update();
        for (int seat : seats) {
            db.sql("INSERT INTO reservation_seat(reservation_id, seat_id) VALUES (:id, :seat)")
                .param("id", id).param("seat", seat).update();
        }
        db.sql("UPDATE event_seat SET reservation_id = :id WHERE session_id = :session AND event_id = 'nocturna' AND seat_id IN (:seats)")
            .param("id", id).param("session", session).param("seats", seats).update();
        return new Hold(id, expires, now, seats, "ACTIVE", experiment == null ? "YOU" : "AUTOMATED");
    }

    @Transactional(readOnly = true)
    public Hold reservation(UUID session, UUID id) {
        Instant expires = db.sql("SELECT expires_at FROM reservation WHERE id = :id AND session_id = :session")
            .param("id", id).param("session", session).query((rs, n) -> rs.getTimestamp(1).toInstant())
            .optional().orElseThrow(() -> new ApiFailure(NOT_FOUND, "RESERVATION_NOT_FOUND", "Reserva no encontrada."));
        List<Integer> seats = db.sql("SELECT seat_id FROM reservation_seat WHERE reservation_id = :id ORDER BY seat_id")
            .param("id", id).query(Integer.class).list();
        Instant now = now();
        String source = db.sql("SELECT CASE WHEN experiment_id IS NULL THEN 'YOU' ELSE 'AUTOMATED' END FROM reservation WHERE id = :id")
            .param("id", id).query(String.class).single();
        return new Hold(id, expires, now, seats, expires.isAfter(now) ? "ACTIVE" : "EXPIRED", source);
    }

    @Transactional(readOnly = true)
    public List<Hold> reservations(UUID session) {
        return db.sql("SELECT id FROM reservation WHERE session_id = :session AND experiment_id IS NULL ORDER BY created_at DESC LIMIT 30")
            .param("session", session).query(UUID.class).list().stream().map(id -> reservation(session, id)).toList();
    }

    public record Counts(int total, int yours, int automated, int heldSeats) {}

    public Counts counts(UUID session) {
        return db.sql("""
            SELECT count(*) AS total, count(*) FILTER (WHERE experiment_id IS NULL) AS yours,
                count(*) FILTER (WHERE experiment_id IS NOT NULL) AS automated,
                coalesce(sum((SELECT count(*) FROM reservation_seat rs WHERE rs.reservation_id = r.id)), 0) AS held_seats
            FROM reservation r WHERE session_id = :session AND expires_at > clock_timestamp()
            """).param("session", session).query((rs, n) -> new Counts(rs.getInt("total"), rs.getInt("yours"),
                rs.getInt("automated"), rs.getInt("held_seats"))).single();
    }

    private Instant now() {
        return db.sql("SELECT clock_timestamp()").query((rs, n) -> rs.getTimestamp(1).toInstant()).single();
    }
}
