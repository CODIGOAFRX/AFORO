package dev.pedrogomez.aforo;

import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ApiFailure.class)
    ResponseEntity<ProblemDetail> domain(ApiFailure error) {
        var detail = ProblemDetail.forStatusAndDetail(error.status, error.getMessage());
        detail.setProperty("code", error.code);
        return ResponseEntity.status(error.status).body(detail);
    }

    @ExceptionHandler(TransientDataAccessException.class)
    ResponseEntity<ProblemDetail> busy(TransientDataAccessException error) {
        var detail = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "El inventario está ocupado. Consulta tu reserva antes de reintentar.");
        detail.setProperty("code", "INVENTORY_BUSY");
        return ResponseEntity.status(503).header("Retry-After", "1").body(detail);
    }
}
