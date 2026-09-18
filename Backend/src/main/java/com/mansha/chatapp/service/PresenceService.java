package com.mansha.chatapp.service;

import com.mansha.chatapp.dto.PresenceDto;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks who's online by WebSocket session, not just by email — a user can
 * have several sessions open at once (multiple tabs/devices, or a brief
 * reconnect), so a single disconnect must only mark them offline once their
 * LAST session is gone, not the first.
 */
@Service
public class PresenceService {

    private final SimpMessagingTemplate messagingTemplate;

    // email -> set of open WebSocket session ids for that user
    private final ConcurrentHashMap<String, Set<String>> sessionsByUser = new ConcurrentHashMap<>();

    public PresenceService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    public void userConnected(String email, String sessionId) {
        Set<String> sessions = sessionsByUser.computeIfAbsent(
                email, e -> Collections.newSetFromMap(new ConcurrentHashMap<>())
        );
        boolean wasOffline = sessions.isEmpty();
        sessions.add(sessionId);
        if (wasOffline) {
            broadcast(email, true);
        }
    }

    public void userDisconnected(String email, String sessionId) {
        Set<String> sessions = sessionsByUser.get(email);
        if (sessions == null) return;

        sessions.remove(sessionId);
        if (sessions.isEmpty()) {
            sessionsByUser.remove(email, sessions);
            broadcast(email, false);
        }
    }

    public Set<String> getOnlineUsers() {
        return Collections.unmodifiableSet(sessionsByUser.keySet());
    }

    private void broadcast(String email, boolean online) {
        messagingTemplate.convertAndSend(
                "/topic/presence",
                new PresenceDto(email, online)
        );
    }
}