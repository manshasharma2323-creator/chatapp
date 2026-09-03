package com.mansha.chatapp.service;

import com.mansha.chatapp.dto.PresenceDto;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class PresenceService {

    private final SimpMessagingTemplate messagingTemplate;

    // Thread-safe set of currently connected user emails
    private final Set<String> onlineUsers =
            Collections.newSetFromMap(new ConcurrentHashMap<>());

    public PresenceService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    public void userConnected(String email) {
        onlineUsers.add(email);
        broadcast(email, true);
    }

    public void userDisconnected(String email) {
        onlineUsers.remove(email);
        broadcast(email, false);
    }

    public boolean isOnline(String email) {
        return onlineUsers.contains(email);
    }

    public Set<String> getOnlineUsers() {
        return Collections.unmodifiableSet(onlineUsers);
    }

    private void broadcast(String email, boolean online) {
        messagingTemplate.convertAndSend(
                "/topic/presence",
                new PresenceDto(email, online)
        );
    }
}