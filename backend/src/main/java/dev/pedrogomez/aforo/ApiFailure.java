package dev.pedrogomez.aforo;

import org.springframework.http.HttpStatus;

class ApiFailure extends RuntimeException {
    final HttpStatus status;
    final String code;

    ApiFailure(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
