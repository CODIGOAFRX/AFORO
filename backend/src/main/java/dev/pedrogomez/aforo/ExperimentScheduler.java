package dev.pedrogomez.aforo;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
@ConditionalOnProperty(name = "aforo.experiments.scheduling", havingValue = "true", matchIfMissing = true)
class ExperimentScheduler {
    private static final Logger LOG = LoggerFactory.getLogger(ExperimentScheduler.class);
    private final ExperimentRunner runner;
    ExperimentScheduler(ExperimentRunner runner) { this.runner = runner; }
    @Scheduled(fixedDelay = 250)
    void advance() {
        try { runner.tick(); }
        catch (RuntimeException failure) { LOG.error("Experiment tick failed; transaction rolled back", failure); }
    }
}
