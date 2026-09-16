package com.mansha.chatapp.dto;

import java.time.LocalDateTime;

/**
 * The object that travels over the WebSocket between client and server.
 * Kept separate from the entity so we never expose database internals
 * (ids, read flags, future columns) to clients unintentionally.
 */
public class ChatMessageDto {

    private String senderEmail;
    private String receiverEmail;
    private String content;
    private LocalDateTime sentAt;

    public ChatMessageDto() {
    }

    public ChatMessageDto(String senderEmail, String receiverEmail,
                          String content, LocalDateTime sentAt) {
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

    public LocalDateTime getSentAt() {
        return sentAt;
    }

    public void setSentAt(LocalDateTime sentAt) {
        this.sentAt = sentAt;
    }
}