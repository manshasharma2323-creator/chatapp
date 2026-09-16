package com.mansha.chatapp.dto;

/**
 * Broadcast over /topic/presence whenever a user connects or disconnects.
 */
public class PresenceDto {

    private String email;
    private boolean online;

    public PresenceDto() {
    }

    public PresenceDto(String email, boolean online) {
        this.email = email;
        this.online = online;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public boolean isOnline() {
        return online;
    }

    public void setOnline(boolean online) {
        this.online = online;
    }
}