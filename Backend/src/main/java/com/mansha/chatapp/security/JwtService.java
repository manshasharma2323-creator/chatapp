package com.mansha.chatapp.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Date;

@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);
    private static final String PLACEHOLDER_PREFIX = "CHANGE-ME";

    @Value("${app.jwt.secret}")
    private String secret;

    @Value("${app.jwt.expiration-ms:86400000}")
    private long expirationMs;

    private final TokenBlacklistService tokenBlacklistService;

    private SecretKey key;

    public JwtService(TokenBlacklistService tokenBlacklistService) {
        this.tokenBlacklistService = tokenBlacklistService;
    }

    @PostConstruct
    private void init() {
        // application.properties ships an obviously-fake fallback so a missing
        // JWT_SECRET is noticed — but that string is public (it's in the repo),
        // so signing with it would let anyone forge a valid token. Use a random
        // per-process secret instead: safe, but tokens stop working on restart
        // (and across multiple instances) until a real JWT_SECRET is set.
        if (secret == null || secret.isBlank() || secret.startsWith(PLACEHOLDER_PREFIX)) {
            log.warn("JWT_SECRET is not set — using a random in-memory secret. Logins will be "
                    + "invalidated on every restart. Set JWT_SECRET (32+ chars) for production.");
            byte[] random = new byte[48];
            new SecureRandom().nextBytes(random);
            this.key = Keys.hmacShaKeyFor(random);
            return;
        }
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException(
                    "JWT_SECRET must be at least 32 characters (256 bits) for HS256; got " + bytes.length + ".");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
    }

    public String generateToken(String email) {
        return Jwts.builder()
                .subject(email)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(key)
                .compact();
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /**
     * Throws if the token's signature/expiry is invalid, OR if it was
     * explicitly revoked via /api/users/logout — a stateless JWT would
     * otherwise keep working right up to its natural expiry even after
     * the user signed out.
     */
    public String extractEmail(String token) {
        if (tokenBlacklistService.isRevoked(token)) {
            throw new io.jsonwebtoken.JwtException("Token has been revoked (signed out)");
        }
        return parseClaims(token).getSubject();
    }

    public Instant extractExpiry(String token) {
        return parseClaims(token).getExpiration().toInstant();
    }

    public boolean isTokenValid(String token) {
        try {
            extractEmail(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public void revokeToken(String token) {
        try {
            tokenBlacklistService.revoke(token, extractExpiry(token));
        } catch (Exception e) {
            // Malformed/already-expired token — nothing meaningful to revoke.
        }
    }
}