package com.mansha.chatapp.dto;

import java.util.List;

public class SmartReplyResponse {

    private List<String> suggestions;

    public SmartReplyResponse() {
    }

    public SmartReplyResponse(List<String> suggestions) {
        this.suggestions = suggestions;
    }

    public List<String> getSuggestions() {
        return suggestions;
    }

    public void setSuggestions(List<String> suggestions) {
        this.suggestions = suggestions;
    }
}