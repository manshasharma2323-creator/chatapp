package com.mansha.chatapp.security;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.List;

/**
 * Runs on every inbound STOMP message.
 * On the CONNECT frame it reads the JWT, validates it, and attaches the
 * user's identity to the WebSocket session. Every later frame on that same
 * connection is then automatically associated with that user.
 */
@Component
public class JwtChannelInterceptor implements ChannelInterceptor {

    private final JwtService jwtService;

    public JwtChannelInterceptor(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {

        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor == null) {
            return message;
        }

        // Only the CONNECT frame carries the token.
        if (StompCommand.CONNECT.equals(accessor.getCommand())) {

            String token = resolveToken(accessor);

            if (token == null || !jwtService.isTokenValid(token)) {
                throw new IllegalArgumentException("Invalid or missing JWT token");
            }

            String email = jwtService.extractEmail(token);

            // This is what makes convertAndSendToUser(email, ...) work later.
            accessor.setUser(new StompPrincipal(email));
        }

        return message;
    }

    /**
     * Reads the "Authorization: Bearer xxx" header from the STOMP frame.
     */
    private String resolveToken(StompHeaderAccessor accessor) {

        List<String> authHeaders = accessor.getNativeHeader("Authorization");

        if (authHeaders == null || authHeaders.isEmpty()) {
            return null;
        }

        String bearer = authHeaders.get(0);

        if (bearer != null && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }

        return null;
    }

    /**
     * Minimal Principal whose name is the user's email.
     * Spring uses this name to route private messages.
     */
    public record StompPrincipal(String email) implements Principal {
        @Override
        public String getName() {
            return email;
        }
    }
}