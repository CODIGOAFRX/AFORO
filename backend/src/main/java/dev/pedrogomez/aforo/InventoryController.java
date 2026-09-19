package dev.pedrogomez.aforo;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class InventoryController {
    private final InventoryService service;
    private final boolean secureCookie;

    public InventoryController(InventoryService service, @Value("${aforo.secure-cookie}") boolean secureCookie) {
        this.service = service;
        this.secureCookie = secureCookie;
    }

    @PostMapping(value = "/session", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> session(@CookieValue(name = "aforo_session", required = false) String token) {
        if (token != null) {
            try { return ResponseEntity.ok(Map.of("id", service.authenticate(token), "demo", true)); }
            catch (ApiFailure ignored) { /* Replace an expired/invalid anonymous session. */ }
        }
        var guest = service.createGuest();
        var cookie = ResponseCookie.from("aforo_session", guest.token()).httpOnly(true).secure(secureCookie)
            .sameSite("Strict").path("/api").maxAge(Duration.ofDays(1)).build();
        return ResponseEntity.status(201).header(HttpHeaders.SET_COOKIE, cookie.toString())
            .body(Map.of("id", guest.id(), "demo", true));
    }

    @GetMapping("/event")
    public InventoryService.Event event() { return service.event(); }

    @GetMapping("/inventory")
    public InventoryService.Inventory inventory(@CookieValue(name = "aforo_session", required = false) String token) {
        return service.inventory(service.authenticate(token));
    }

    public record ReserveRequest(List<Integer> seatIds) {}

    @GetMapping("/reservation-counts")
    public InventoryService.Counts counts(@CookieValue(name = "aforo_session", required = false) String token) {
        return service.counts(service.authenticate(token));
    }

    @GetMapping("/reservations")
    public List<InventoryService.Hold> reservations(@CookieValue(name = "aforo_session", required = false) String token) {
        return service.reservations(service.authenticate(token));
    }

    @PostMapping(value = "/reservations", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public InventoryService.Hold reserve(@CookieValue(name = "aforo_session", required = false) String token,
                                         @RequestBody ReserveRequest body) {
        return service.reserve(service.authenticate(token), body.seatIds());
    }

    @GetMapping("/reservations/{id}")
    public InventoryService.Hold reservation(@CookieValue(name = "aforo_session", required = false) String token,
                                             @PathVariable UUID id) {
        return service.reservation(service.authenticate(token), id);
    }
}
