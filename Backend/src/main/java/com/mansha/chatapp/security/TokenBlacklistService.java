package com.mansha.chatapp.security;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A JWT is stateless by design — "logout" alone can't invalidate it, since
 * the server never stored it to begin with. This tracks explicitly revoked
 * tokens (from POST /api/users/logout) in memory so a signed-out token stops
 * working immediately instead of staying valid until its natural expiry.
 * In-memory is enough for a single-instance deployment; entries are dropped
 * once the token would have expired anyway, so this never grows unbounded.
 */
@Service
public class TokenBlacklistService {

    private final Map<String, Instant> revokedUntilExpiry = new ConcurrentHashMap<>();

    public void revoke(String token, Instant tokenExpiry) {
        purgeExpired();
        revokedUntilExpiry.put(token, tokenExpiry);
    }

    public boolean isRevoked(String token) {
        return revokedUntilExpiry.containsKey(token);
    }

    private void purgeExpired() {
        Instant now = Instant.now();
        revokedUntilExpiry.entrySet().removeIf(entry -> entry.getValue().isBefore(now));
    }
}
