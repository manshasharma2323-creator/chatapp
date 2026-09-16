package com.mansha.chatapp.dto;

import java.util.List;

public class AssistantChatRequest {

    private String message;
    private List<AssistantTurn> history;

    public AssistantChatRequest() {
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public List<AssistantTurn> getHistory() {
        return history;
    }

    public void setHistory(List<AssistantTurn> history) {
        this.history = history;
    }

    public static class AssistantTurn {
        private String role;   // "user" or "assistant"
        private String content;

        public AssistantTurn() {
        }

        public String getRole() {
            return role;
        }

        public void setRole(String role) {
            this.role = role;
        }

        public String getContent() {
            return content;
        }

        public void setContent(String content) {
            this.content = content;
        }
    }
}
