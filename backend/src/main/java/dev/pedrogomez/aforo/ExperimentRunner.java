package dev.pedrogomez.aforo;

import java.util.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Paced service calls, not a load benchmark or thirty simultaneous users. */
@Service
public class ExperimentRunner {
    private final JdbcClient db;
    private final InventoryService inventory;
    private final boolean enabled;
    public ExperimentRunner(JdbcClient db, InventoryService inventory, @org.springframework.beans.factory.annotation.Value("${aforo.experiments.enabled:true}") boolean enabled) {
        this.db = db; this.inventory = inventory; this.enabled = enabled;
    }
    private record Work(UUID id, UUID session, int buyer, int buyers, int interval, int seats) {}

    @Transactional
    public void tick() {
        if (!enabled) {
            db.sql("UPDATE experiment SET status = 'STOPPED', finished_at = clock_timestamp() WHERE status = 'RUNNING'").update();
            return;
        }
        db.sql("UPDATE experiment SET status = 'STOPPED', finished_at = clock_timestamp() WHERE status = 'RUNNING' AND created_at < clock_timestamp() - interval '5 minutes'").update();
        var next = db.sql("""
            SELECT * FROM experiment WHERE status = 'RUNNING' AND next_at <= clock_timestamp()
            ORDER BY next_at LIMIT 1 FOR UPDATE SKIP LOCKED
            """).query((rs, n) -> new Work(rs.getObject("id", UUID.class), rs.getObject("session_id", UUID.class), rs.getInt("completed") + 1,
                rs.getInt("buyers"), rs.getInt("interval_seconds"), rs.getInt("seats_per_buyer"))).optional();
        if (next.isEmpty()) return;
        Work work = next.get();
        long start = System.nanoTime();
        var available = inventory.inventory(work.session).seats().stream().filter(s -> s.state().equals("AVAILABLE")).toList();
        List<Integer> choice = List.of();
        if (work.seats == 0) {
            var random = java.util.concurrent.ThreadLocalRandom.current();
            int size = random.nextInt(1, 4);
            List<List<Integer>> candidates = new ArrayList<>();
            for (var seat : available) {
                if (seat.number() + size - 1 > 10) continue;
                List<Integer> group = new ArrayList<>();
                for (int offset = 0; offset < size; offset++) group.add(seat.id() + offset);
                if (group.stream().allMatch(id -> available.stream().anyMatch(s -> s.id() == id))) candidates.add(group);
            }
            if (!candidates.isEmpty()) choice = candidates.get(random.nextInt(candidates.size()));
        } else {
        for (var seat : available) {
            if (work.seats == 1) { choice = List.of(seat.id()); break; }
            if (available.stream().anyMatch(s -> s.row().equals(seat.row()) && s.number() == seat.number() + 1)) {
                choice = List.of(seat.id(), seat.id() + 1); break;
            }
        }
        }
        // A savepoint lets business conflicts be recorded without rolling back the experiment.
        // Actual reservation execution is delegated to a NESTED transactional boundary below.
        String outcome = "NO_AVAILABILITY";
        UUID reservation = null;
        if (!choice.isEmpty()) {
            try {
                reservation = inventory.reserveAutomated(work.session, choice, work.id, work.buyer).id();
                outcome = "RESERVED";
            } catch (ApiFailure failure) {
                if (!failure.code.equals("SEAT_UNAVAILABLE")) throw failure;
                outcome = "CONFLICT";
            } catch (RuntimeException failure) {
                org.slf4j.LoggerFactory.getLogger(ExperimentRunner.class).error("Automatic reservation failed for experiment {} buyer {}", work.id, work.buyer, failure);
                outcome = "ERROR";
            }
        }
        db.sql("INSERT INTO experiment_attempt(experiment_id, buyer_number, outcome, reservation_id, duration_ms) VALUES (:id, :buyer, :outcome, :reservation, :ms)")
            .param("id", work.id).param("buyer", work.buyer).param("outcome", outcome).param("reservation", reservation)
            .param("ms", (System.nanoTime() - start) / 1_000_000).update();
        db.sql("""
            UPDATE experiment SET completed = :buyer, status = CASE WHEN :failed THEN 'FAILED' WHEN :buyer = buyers THEN 'COMPLETED' ELSE 'RUNNING' END,
                finished_at = CASE WHEN :buyer = buyers OR :failed THEN clock_timestamp() ELSE NULL END,
                next_at = clock_timestamp() + make_interval(secs => :interval) WHERE id = :id
            """).param("buyer", work.buyer).param("failed", outcome.equals("ERROR")).param("interval", work.interval).param("id", work.id).update();
    }
}
