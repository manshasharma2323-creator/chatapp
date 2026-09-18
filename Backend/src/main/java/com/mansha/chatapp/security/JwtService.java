package com.mansha.chatapp.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

@Service
public class JwtService {

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
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
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