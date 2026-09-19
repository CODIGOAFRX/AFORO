package dev.pedrogomez.aforo;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "aforo.experiments.scheduling=false")
class ReservationIntegrationTest {
    static final String EXTERNAL_URL = System.getenv("AFORO_TEST_DATABASE_URL");
    static final PostgreSQLContainer POSTGRES;
    static {
        POSTGRES = EXTERNAL_URL == null ? new PostgreSQLContainer("postgres:17.6-alpine") : null;
        if (POSTGRES != null) POSTGRES.start();
    }
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        if (POSTGRES != null) {
            properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
            properties.add("spring.datasource.username", POSTGRES::getUsername);
            properties.add("spring.datasource.password", POSTGRES::getPassword);
        } else {
            properties.add("spring.datasource.url", () -> EXTERNAL_URL);
            properties.add("spring.datasource.username", () -> System.getenv().getOrDefault("AFORO_TEST_DATABASE_USER", "aforo"));
            properties.add("spring.datasource.password", () -> System.getenv().getOrDefault("AFORO_TEST_DATABASE_PASSWORD", "aforo_local"));
        }
    }

    @LocalServerPort int port;
    @Autowired JdbcClient db;
    @Autowired DataSource dataSource;
    @Autowired ExperimentRunner experimentRunner;

    @Test
    void automatedBuyersFillTheRoomWithoutAppearingAsOwnReservations() throws Exception {
        Guest guest = guest();
        var started = send("POST", "/experiments", guest.cookie, "{\"buyers\":30,\"intervalSeconds\":1,\"seatsPerBuyer\":2}");
        assertThat(started.statusCode()).isEqualTo(201);
        UUID runId = UUID.fromString(tree(started).get("id").asText());
        for (int i = 0; i < 30; i++) {
            db.sql("UPDATE experiment SET next_at = clock_timestamp() WHERE id = :id").param("id", runId).update();
            experimentRunner.tick();
        }
        var report = tree(send("GET", "/experiments/latest", guest.cookie, null));
        assertThat(report.get("run").get("status").asText()).isEqualTo("COMPLETED");
        assertThat(report.get("attempts").size()).isEqualTo(30);
        for (var attempt : report.get("attempts")) {
            assertThat(attempt.get("outcome").asText()).isEqualTo("RESERVED");
            int first = attempt.get("seatIds").get(0).asInt();
            int second = attempt.get("seatIds").get(1).asInt();
            assertThat(second).isEqualTo(first + 1);
            assertThat((first - 1) / 10).isEqualTo((second - 1) / 10);
        }
        assertThat(heldCount(guest)).isEqualTo(60);
        assertThat(tree(send("GET", "/reservations", guest.cookie, null)).size()).isZero();
        var counts = tree(send("GET", "/reservation-counts", guest.cookie, null));
        assertThat(counts.get("total").asInt()).isEqualTo(30);
        assertThat(counts.get("yours").asInt()).isZero();
        assertThat(counts.get("automated").asInt()).isEqualTo(30);
        assertThat(counts.get("heldSeats").asInt()).isEqualTo(60);
        assertThat(send("POST", "/reservations", guest.cookie, "{\"seatIds\":[1]}").statusCode()).isEqualTo(409);
    }

    @Test
    void experimentAccessLimitsStopAndPacingAreEnforced() throws Exception {
        Guest guest = guest();
        Guest stranger = guest();
        assertThat(send("POST", "/experiments", guest.cookie, "{\"buyers\":31,\"intervalSeconds\":1,\"seatsPerBuyer\":1}").statusCode()).isEqualTo(400);
        var started = send("POST", "/experiments", guest.cookie, "{\"buyers\":3,\"intervalSeconds\":5,\"seatsPerBuyer\":1}");
        UUID runId = UUID.fromString(tree(started).get("id").asText());
        assertThat(send("POST", "/experiments", guest.cookie, "{\"buyers\":3,\"intervalSeconds\":5,\"seatsPerBuyer\":1}").statusCode()).isEqualTo(409);
        assertThat(send("POST", "/experiments/" + runId + "/stop", stranger.cookie, "{}").statusCode()).isEqualTo(404);
        assertThat(tree(send("GET", "/experiments/latest", stranger.cookie, null)).get("run").isNull()).isTrue();
        db.sql("UPDATE experiment SET next_at = clock_timestamp() + interval '1 hour' WHERE id = :id").param("id", runId).update();
        experimentRunner.tick();
        assertThat(reservationCount(guest)).isZero();
        assertThat(send("POST", "/experiments/" + runId + "/stop", guest.cookie, "{}").statusCode()).isEqualTo(204);
        experimentRunner.tick();
        assertThat(reservationCount(guest)).isZero();
        assertThat(tree(send("GET", "/experiments/latest", guest.cookie, null)).get("run").get("status").asText()).isEqualTo("STOPPED");
    }

    @Test
    void pairSelectionNeverCrossesRowsAndReportsNoAvailability() throws Exception {
        Guest guest = guest();
        var ids = java.util.stream.IntStream.rangeClosed(1, 60).filter(i -> i != 10 && i != 11).boxed().toList();
        for (int i = 0; i < ids.size(); i += 6) {
            String body = "{\"seatIds\":" + ids.subList(i, Math.min(i + 6, ids.size())) + "}";
            assertThat(send("POST", "/reservations", guest.cookie, body).statusCode()).isEqualTo(201);
        }
        assertThat(send("POST", "/experiments", guest.cookie, "{\"buyers\":1,\"intervalSeconds\":1,\"seatsPerBuyer\":2}").statusCode()).isEqualTo(201);
        experimentRunner.tick();
        var report = tree(send("GET", "/experiments/latest", guest.cookie, null));
        assertThat(report.get("attempts").get(0).get("outcome").asText()).isEqualTo("NO_AVAILABILITY");
        assertThat(heldCount(guest)).isEqualTo(58);
        assertThat(tree(send("GET", "/reservation-counts", guest.cookie, null)).get("automated").asInt()).isZero();
    }
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper json = new ObjectMapper();
    record Guest(String cookie, UUID id) {}

    @Test
    void concurrentRequestsForOneSeatProduceOnePersistedReservation() throws Exception {
        Guest guest = guest();
        List<HttpResponse<String>> responses = race(guest, 1, "{\"seatIds\":[1]}", "{\"seatIds\":[1]}");
        assertThat(responses.stream().map(HttpResponse::statusCode)).containsExactlyInAnyOrder(201, 409);
        assertThat(responses.stream().filter(r -> r.statusCode() == 409).findFirst().orElseThrow().body()).contains("SEAT_UNAVAILABLE");
        assertThat(reservationCount(guest)).isEqualTo(1);
        assertThat(heldCount(guest)).isEqualTo(1);
    }

    @Test
    void overlappingGroupsAreAllOrNothing() throws Exception {
        Guest guest = guest();
        var results = race(guest, 3, "{\"seatIds\":[3,2]}", "{\"seatIds\":[4,3]}");
        assertThat(results.stream().map(HttpResponse::statusCode)).containsExactlyInAnyOrder(201, 409);
        assertThat(reservationCount(guest)).isEqualTo(1);
        assertThat(heldCount(guest)).isEqualTo(2);
        assertThat(db.sql("SELECT count(*) FROM reservation_seat rs JOIN reservation r ON r.id = rs.reservation_id WHERE r.session_id = :id")
            .param("id", guest.id).query(Integer.class).single()).isEqualTo(2);
    }

    @Test
    void expiredInventoryCanBeReservedWithoutCleaner() throws Exception {
        Guest guest = guest();
        var original = send("POST", "/reservations", guest.cookie, "{\"seatIds\":[1,2]}");
        assertThat(original.statusCode()).isEqualTo(201);
        UUID oldId = UUID.fromString(tree(original).get("id").asText());
        db.sql("UPDATE reservation SET created_at = clock_timestamp() - interval '6 minutes', expires_at = clock_timestamp() - interval '1 minute' WHERE id = :id")
            .param("id", oldId).update();
        assertThat(heldCount(guest)).isZero();
        assertThat(send("POST", "/reservations", guest.cookie, "{\"seatIds\":[1,2]}").statusCode()).isEqualTo(201);
        var expired = tree(send("GET", "/reservations/" + oldId, guest.cookie, null));
        assertThat(expired.get("state").asText()).isEqualTo("EXPIRED");
        assertThat(expired.get("seatIds").size()).isEqualTo(2); // Historical association survives reclamation.
        assertThat(heldCount(guest)).isEqualTo(2);
    }

    @Test
    void sessionsHaveSeparateInventoryAndCannotReadEachOthersReservations() throws Exception {
        Guest first = guest();
        Guest second = guest();
        var hold = send("POST", "/reservations", first.cookie, "{\"seatIds\":[1]}");
        assertThat(hold.statusCode()).isEqualTo(201);
        assertThat(send("GET", "/reservations/" + tree(hold).get("id").asText(), second.cookie, null).statusCode()).isEqualTo(404);
        assertThat(send("POST", "/reservations", second.cookie, "{\"seatIds\":[1]}").statusCode()).isEqualTo(201);
        var ownList = tree(send("GET", "/reservations", first.cookie, null));
        assertThat(ownList.size()).isEqualTo(1);
        assertThat(ownList.get(0).get("id").asText()).isEqualTo(tree(hold).get("id").asText());
        var otherList = tree(send("GET", "/reservations", second.cookie, null));
        assertThat(otherList.size()).isEqualTo(1);
        assertThat(otherList.get(0).get("id").asText()).isNotEqualTo(tree(hold).get("id").asText());
        assertThat(tree(send("POST", "/session", first.cookie, "{}")).get("id").asText()).isEqualTo(first.id.toString());
    }

    @Test
    void invalidInputNeverCreatesPartialReservations() throws Exception {
        Guest guest = guest();
        for (String body : List.of("{}", "{\"seatIds\":[]}", "{\"seatIds\":[1,1]}", "{\"seatIds\":[1,null]}",
                "{\"seatIds\":[1,999]}", "{\"seatIds\":[1,2,3,4,5,6,7]}")) {
            assertThat(send("POST", "/reservations", guest.cookie, body).statusCode()).as(body).isEqualTo(400);
        }
        assertThat(reservationCount(guest)).isZero();
        assertThat(heldCount(guest)).isZero();
        assertThat(tree(send("GET", "/inventory", guest.cookie, null)).get("seats").size()).isEqualTo(60);
    }

    @Test
    void missingForgedAndExpiredSessionsAreRejected() throws Exception {
        assertThat(send("GET", "/inventory", null, null).statusCode()).isEqualTo(401);
        assertThat(send("POST", "/reservations", "aforo_session=" + "a".repeat(43), "{\"seatIds\":[1]}").statusCode()).isEqualTo(401);
        Guest guest = guest();
        db.sql("UPDATE demo_session SET expires_at = clock_timestamp() - interval '1 second' WHERE id = :id")
            .param("id", guest.id).update();
        assertThat(send("GET", "/inventory", guest.cookie, null).statusCode()).isEqualTo(401);
    }

    @Test
    void foreignOriginsCannotCreateSessions() throws Exception {
        var request = HttpRequest.newBuilder(uri("/session")).header("Content-Type", "application/json")
            .header("Origin", "https://untrusted.example").POST(HttpRequest.BodyPublishers.ofString("{}")).build();
        assertThat(http.send(request, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(403);
    }

    private List<HttpResponse<String>> race(Guest guest, int contestedSeat, String first, String second) throws Exception {
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var blocker = dataSource.getConnection(); var executor = Executors.newFixedThreadPool(2)) {
            blocker.setAutoCommit(false);
            try (var lock = blocker.prepareStatement("SELECT seat_id FROM event_seat WHERE session_id = ? AND seat_id = ? FOR UPDATE")) {
                lock.setObject(1, guest.id);
                lock.setInt(2, contestedSeat);
                lock.executeQuery().close();
            }
            List<Future<HttpResponse<String>>> futures = new ArrayList<>();
            for (String body : List.of(first, second)) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Start barrier timed out");
                    return send("POST", "/reservations", guest.cookie, body);
                }));
            }
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            // Verify BOTH real HTTP requests are waiting inside PostgreSQL, not merely scheduled.
            try {
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
                int waiting;
                do {
                    waiting = db.sql("""
                        SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
                        AND wait_event_type = 'Lock' AND query LIKE '%FROM event_seat%'
                        AND query LIKE '%FOR UPDATE%'
                        """).query(Integer.class).single();
                    if (waiting < 2) Thread.sleep(20);
                } while (waiting < 2 && System.nanoTime() < deadline);
                assertThat(waiting).as("Both requests must contend for database locks").isEqualTo(2);
            } finally { blocker.commit(); }
            return List.of(futures.get(0).get(15, TimeUnit.SECONDS), futures.get(1).get(15, TimeUnit.SECONDS));
        }
    }

    private Guest guest() throws Exception {
        var response = send("POST", "/session", null, "{}");
        assertThat(response.statusCode()).isEqualTo(201);
        String cookie = response.headers().firstValue("set-cookie").orElseThrow();
        assertThat(cookie).contains("HttpOnly", "SameSite=Strict");
        return new Guest(cookie.split(";", 2)[0], UUID.fromString(tree(response).get("id").asText()));
    }

    private int reservationCount(Guest guest) {
        return db.sql("SELECT count(*) FROM reservation WHERE session_id = :id").param("id", guest.id).query(Integer.class).single();
    }

    private long heldCount(Guest guest) throws Exception {
        long held = 0;
        var inventory = tree(send("GET", "/inventory", guest.cookie, null));
        for (var seat : inventory.get("seats")) if (seat.get("state").asText().equals("HELD")) held++;
        return held;
    }

    private URI uri(String path) { return URI.create("http://localhost:" + port + "/api" + path); }
    private JsonNode tree(HttpResponse<String> response) { return json.readTree(response.body()); }
    private HttpResponse<String> send(String method, String path, String cookie, String body) throws Exception {
        var request = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(10));
        if (cookie != null) request.header("Cookie", cookie);
        if (body != null) request.header("Content-Type", "application/json");
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
}
