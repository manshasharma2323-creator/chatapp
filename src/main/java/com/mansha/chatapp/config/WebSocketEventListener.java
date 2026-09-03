package com.mansha.chatapp.config;

import com.mansha.chatapp.service.PresenceService;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;

/**
 * Listens for Spring's built-in WebSocket lifecycle events.
 * No polling, no extra endpoint — Spring fires these automatically.
 */
@Component
public class WebSocketEventListener {

    private final PresenceService presenceService;

    public WebSocketEventListener(PresenceService presenceService) {
        this.presenceService = presenceService;
    }

    @EventListener
    public void handleConnect(SessionConnectedEvent event) {
        Principal principal = event.getUser();
        if (principal != null && principal.getName() != null) {
            presenceService.userConnected(principal.getName());
        }
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor =
                StompHeaderAccessor.wrap(event.getMessage());
        Principal principal = accessor.getUser();
        if (principal != null && principal.getName() != null) {
            presenceService.userDisconnected(principal.getName());
        }
    }
}