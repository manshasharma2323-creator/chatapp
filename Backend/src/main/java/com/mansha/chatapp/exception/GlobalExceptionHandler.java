package com.mansha.chatapp.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Catches exceptions that escape any controller and turns them into
 * consistent JSON instead of a stack trace or Spring's default HTML page.
 * A controller's own try/catch always takes priority over this — it only
 * runs when nothing closer to the error already handled it.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(IllegalArgumentException ex) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    // A controller throwing ResponseStatusException (e.g. 503 when the AI
    // provider is unreachable) already picked its own status and message —
    // without this, the generic handler below would flatten it to a bare 500.
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatus(ResponseStatusException ex) {
        HttpStatusCode status = ex.getStatusCode();
        return build(HttpStatus.valueOf(status.value()), ex.getReason());
    }

    // Unparseable JSON body / wrong-typed parameter: the client's fault, and
    // neither is modelled as an ErrorResponse by Spring.
    @ExceptionHandler({HttpMessageNotReadableException.class, TypeMismatchException.class})
    public ResponseEntity<Map<String, Object>> handleUnreadable(Exception ex) {
        return build(HttpStatus.BAD_REQUEST, clientMessage(HttpStatus.BAD_REQUEST));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
        // Spring models malformed JSON, missing/ill-typed params, unsupported
        // methods and unknown routes (NoResourceFoundException) as
        // ErrorResponse carrying the right 4xx status. This catch-all used to
        // flatten every one of them into a 500.
        if (ex instanceof ErrorResponse er && er.getStatusCode().is4xxClientError()) {
            HttpStatus status = HttpStatus.valueOf(er.getStatusCode().value());
            return build(status, clientMessage(status));
        }
        log.error("Unhandled exception", ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong. Please try again.");
    }

    private static String clientMessage(HttpStatus status) {
        return switch (status) {
            case BAD_REQUEST -> "Malformed or missing request data.";
            case NOT_FOUND -> "Not found.";
            case METHOD_NOT_ALLOWED -> "Method not allowed.";
            case UNSUPPORTED_MEDIA_TYPE -> "Unsupported content type.";
            default -> status.getReasonPhrase();
        };
    }

    private ResponseEntity<Map<String, Object>> build(HttpStatus status, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", LocalDateTime.now());
        body.put("status", status.value());
        body.put("error", status.getReasonPhrase());
        body.put("message", message);
        return ResponseEntity.status(status).body(body);
    }
}