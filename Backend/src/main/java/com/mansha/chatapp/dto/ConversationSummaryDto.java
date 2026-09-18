package com.mansha.chatapp.dto;

import java.time.LocalDateTime;

/**
 * One row in the conversation list: the peer plus their most recent
 * message, so the frontend can render the sidebar without pulling full
 * history for every contact.
 */
public class ConversationSummaryDto {

    private String peerEmail;
    private String lastMessage;
    private LocalDateTime lastMessageAt;
    private boolean lastMessageMine;
    private long unreadCount;

    public ConversationSummaryDto() {
    }

    public ConversationSummaryDto(String peerEmail, String lastMessage, LocalDateTime lastMessageAt,
                                   boolean lastMessageMine, long unreadCount) {
        this.peerEmail = peerEmail;
        this.lastMessage = lastMessage;
        this.lastMessageAt = lastMessageAt;
        this.lastMessageMine = lastMessageMine;
        this.unreadCount = unreadCount;
    }

    public String getPeerEmail() {
        return peerEmail;
    }

    public void setPeerEmail(String peerEmail) {
        this.peerEmail = peerEmail;
    }

    public String getLastMessage() {
        return lastMessage;
    }

    public void setLastMessage(String lastMessage) {
        this.lastMessage = lastMessage;
    }

    public LocalDateTime getLastMessageAt() {
        return lastMessageAt;
    }

    public void setLastMessageAt(LocalDateTime lastMessageAt) {
        this.lastMessageAt = lastMessageAt;
    }

    public boolean isLastMessageMine() {
        return lastMessageMine;
    }

    public void setLastMessageMine(boolean lastMessageMine) {
        this.lastMessageMine = lastMessageMine;
    }

    public long getUnreadCount() {
        return unreadCount;
    }

    public void setUnreadCount(long unreadCount) {
        this.unreadCount = unreadCount;
    }
}
