package com.mansha.chatapp.dto;

import java.time.Instant;

/**
 * The object that travels over the WebSocket between client and server.
 * Kept separate from the entity so we never expose database internals
 * (ids, read flags, future columns) to clients unintentionally.
 */
public class ChatMessageDto {

    private String senderEmail;
    private String receiverEmail;
    private String content;
    // Instant serializes as ISO-8601 with a trailing "Z". A zone-less
    // LocalDateTime was parsed by browsers as *their local time*, so every
    // timestamp was shifted by the viewer's UTC offset.
    private Instant sentAt;

    public ChatMessageDto() {
    }

    public ChatMessageDto(String senderEmail, String receiverEmail,
                          String content, Instant sentAt) {
        this.senderEmail = senderEmail;
        this.receiverEmail = receiverEmail;
        this.content = content;
        this.sentAt = sentAt;
    }

    public String getSenderEmail() {
        return senderEmail;
    }

    public void setSenderEmail(String senderEmail) {
        this.senderEmail = senderEmail;
    }

    public String getReceiverEmail() {
        return receiverEmail;
    }

    public void setReceiverEmail(String receiverEmail) {
        this.receiverEmail = receiverEmail;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public Instant getSentAt() {
        return sentAt;
    }

    public void setSentAt(Instant sentAt) {
        this.sentAt = sentAt;
    }
}