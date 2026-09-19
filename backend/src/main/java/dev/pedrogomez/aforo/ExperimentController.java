package dev.pedrogomez.aforo;

import java.util.UUID;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/experiments")
class ExperimentController {
    private final InventoryService inventory;
    private final ExperimentService experiments;
    ExperimentController(InventoryService inventory, ExperimentService experiments) { this.inventory = inventory; this.experiments = experiments; }
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    ExperimentService.Run start(@CookieValue(name = "aforo_session", required = false) String token, @RequestBody ExperimentService.Config config) {
        return experiments.start(inventory.authenticate(token), config);
    }
    @GetMapping("/latest")
    ExperimentService.Report latest(@CookieValue(name = "aforo_session", required = false) String token) {
        return experiments.latest(inventory.authenticate(token));
    }
    @PostMapping(value = "/{id}/stop", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void stop(@CookieValue(name = "aforo_session", required = false) String token, @PathVariable UUID id) {
        experiments.stop(inventory.authenticate(token), id);
    }
}
