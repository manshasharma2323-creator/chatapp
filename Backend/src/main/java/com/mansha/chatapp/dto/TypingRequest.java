package com.mansha.chatapp.dto;

/**
 * What the client sends to /app/chat.typing.
 */
public class TypingRequest {

    private String receiverEmail;
    private boolean typing;

    public TypingRequest() {
    }

    public String getReceiverEmail() {
        return receiverEmail;
    }

    public void setReceiverEmail(String receiverEmail) {
        this.receiverEmail = receiverEmail;
    }

    public boolean isTyping() {
        return typing;
    }

    public void setTyping(boolean typing) {
        this.typing = typing;
    }
}