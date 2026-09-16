package com.mansha.chatapp.dto;

public class AssistantChatResponse {

    private String reply;

    public AssistantChatResponse() {
    }

    public AssistantChatResponse(String reply) {
        this.reply = reply;
    }

    public String getReply() {
        return reply;
    }

    public void setReply(String reply) {
        this.reply = reply;
    }
}
