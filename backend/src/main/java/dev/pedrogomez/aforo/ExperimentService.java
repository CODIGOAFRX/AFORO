package dev.pedrogomez.aforo;

import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

@Service
public class ExperimentService {
    private final JdbcClient db;
    private final boolean enabled;
    public ExperimentService(JdbcClient db, @Value("${aforo.experiments.enabled:true}") boolean enabled) {
        this.db = db; this.enabled = enabled;
    }
    public record Config(int buyers, int intervalSeconds, int seatsPerBuyer) {}
    public record Run(UUID id, int buyers, int intervalSeconds, int seatsPerBuyer, int completed, String status) {}
    public record Attempt(int buyer, String outcome, List<Integer> seatIds, long durationMs, Instant createdAt) {}
    public record Report(Run run, List<Attempt> attempts) {}

    @Transactional
    public Run start(UUID session, Config config) {
        if (!enabled) throw new ApiFailure(SERVICE_UNAVAILABLE, "EXPERIMENTS_DISABLED", "Las pruebas automáticas están desactivadas.");
        if (config.buyers < 1 || config.buyers > 30 || !Set.of(1, 2, 5).contains(config.intervalSeconds)
                || !Set.of(0, 1, 2).contains(config.seatsPerBuyer)) {
            throw new ApiFailure(BAD_REQUEST, "INVALID_EXPERIMENT", "Elige de 1 a 30 compradores, uno o dos asientos y un intervalo de 1, 2 o 5 segundos.");
        }
        // Serialize admission across application instances; capacity is a database decision.
        db.sql("SELECT pg_advisory_xact_lock(7348291)").query((rs, n) -> 1).single();
        int ownActive = db.sql("SELECT count(*) FROM experiment WHERE session_id = :session AND status = 'RUNNING'")
            .param("session", session).query(Integer.class).single();
        if (ownActive > 0) throw new ApiFailure(CONFLICT, "EXPERIMENT_RUNNING", "Ya tienes una ejecución en curso.");
        int global = db.sql("SELECT count(*) FROM experiment WHERE status = 'RUNNING'").query(Integer.class).single();
        int recent = db.sql("SELECT count(*) FROM experiment WHERE session_id = :session AND created_at > clock_timestamp() - interval '1 hour'")
            .param("session", session).query(Integer.class).single();
        if (global >= 4 || recent >= 5) throw new ApiFailure(TOO_MANY_REQUESTS, "EXPERIMENT_LIMIT", "Límite alcanzado: cuatro ejecuciones globales y cinco por sesión y hora.");
        UUID id = UUID.randomUUID();
        db.sql("INSERT INTO experiment(id, session_id, buyers, interval_seconds, seats_per_buyer, status) VALUES (:id, :session, :buyers, :interval, :seats, 'RUNNING')")
            .param("id", id).param("session", session).param("buyers", config.buyers).param("interval", config.intervalSeconds).param("seats", config.seatsPerBuyer).update();
        return new Run(id, config.buyers, config.intervalSeconds, config.seatsPerBuyer, 0, "RUNNING");
    }

    public Report latest(UUID session) {
        var run = db.sql("SELECT * FROM experiment WHERE session_id = :session ORDER BY created_at DESC LIMIT 1")
            .param("session", session).query((rs, n) -> new Run(rs.getObject("id", UUID.class), rs.getInt("buyers"),
                rs.getInt("interval_seconds"), rs.getInt("seats_per_buyer"), rs.getInt("completed"), rs.getString("status"))).optional();
        if (run.isEmpty()) return new Report(null, List.of());
        List<Attempt> attempts = db.sql("""
            SELECT a.*, coalesce((SELECT string_agg(seat_id::text, ',' ORDER BY seat_id) FROM reservation_seat WHERE reservation_id = a.reservation_id), '') AS seats
            FROM experiment_attempt a WHERE experiment_id = :id ORDER BY buyer_number DESC
            """).param("id", run.get().id).query((rs, n) -> new Attempt(rs.getInt("buyer_number"), rs.getString("outcome"),
                rs.getString("seats").isEmpty() ? List.of() : Arrays.stream(rs.getString("seats").split(",")).map(Integer::valueOf).toList(),
                rs.getLong("duration_ms"), rs.getTimestamp("created_at").toInstant())).list();
        return new Report(run.get(), attempts);
    }

    @Transactional
    public void stop(UUID session, UUID id) {
        int changed = db.sql("UPDATE experiment SET status = 'STOPPED', finished_at = clock_timestamp() WHERE id = :id AND session_id = :session AND status = 'RUNNING'")
            .param("id", id).param("session", session).update();
        if (changed == 0 && db.sql("SELECT count(*) FROM experiment WHERE id = :id AND session_id = :session")
                .param("id", id).param("session", session).query(Integer.class).single() == 0) {
            throw new ApiFailure(NOT_FOUND, "EXPERIMENT_NOT_FOUND", "Ejecución no encontrada.");
        }
    }
}
