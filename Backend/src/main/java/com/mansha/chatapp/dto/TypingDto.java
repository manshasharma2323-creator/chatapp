package com.mansha.chatapp.dto;

/**
 * What the server broadcasts to the receiver on /user/queue/typing.
 * senderEmail always comes from the authenticated Principal, never
 * from the client payload, so nobody can spoof someone else's typing state.
 */
public class TypingDto {

    private String senderEmail;
    private boolean typing;

    public TypingDto() {
    }

    public TypingDto(String senderEmail, boolean typing) {
        this.senderEmail = senderEmail;
        this.typing = typing;
    }

    public String getSenderEmail() {
        return senderEmail;
    }

    public void setSenderEmail(String senderEmail) {
        this.senderEmail = senderEmail;
    }

    public boolean isTyping() {
        return typing;
    }

    public void setTyping(boolean typing) {
        this.typing = typing;
    }
}