package com.mansha.chatapp.service;

import com.mansha.chatapp.dto.AssistantChatRequest;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Backs the standalone AI Assistant page — a free-form Q&A conversation,
 * as opposed to SmartReplyService which only suggests replies inside a
 * peer-to-peer chat. Shares the same ChatClient/provider setup from
 * AiConfig so both features stay on whichever provider app.ai.provider
 * points at.
 */
@Service
public class AiAssistantService {

    // Same reasoning as SmartReplyService: Ollama can take a while to reload
    // a cold model (observed up to ~30s), so bound the wait rather than let
    // the request hang — but give it the full realistic window before giving
    // up, since unlike smart-replies this feature has no silent fallback.
    private static final long AI_TIMEOUT_SECONDS = 35;
    private static final int HISTORY_LIMIT = 12;

    private final ChatClient openAiChatClient;
    private final ChatClient ollamaChatClient;

    @Value("${app.ai.provider:openai}")
    private String provider;

    public AiAssistantService(@Qualifier("openAiChatClient") ChatClient openAiChatClient,
                              @Qualifier("ollamaChatClient") ChatClient ollamaChatClient) {
        this.openAiChatClient = openAiChatClient;
        this.ollamaChatClient = ollamaChatClient;
    }

    public String chat(String message, List<AssistantChatRequest.AssistantTurn> history) {
        String systemPrompt = """
                You are the AI Assistant built into a real-time chat application.
                Be helpful, clear and friendly. Keep replies conversational and
                reasonably concise unless the user asks for detail.
                """;

        try {
            String prompt = buildPrompt(message, history);
            ChatClient client = activeClient();
            return CompletableFuture
                    .supplyAsync(() -> client
                            .prompt()
                            .system(systemPrompt)
                            .user(prompt)
                            .call()
                            .content())
                    .get(AI_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .trim();
        } catch (Exception e) {
            throw new AiAssistantUnavailableException(
                    "The AI assistant is unavailable right now. Please try again in a moment.", e);
        }
    }

    private ChatClient activeClient() {
        return "ollama".equalsIgnoreCase(provider) ? ollamaChatClient : openAiChatClient;
    }

    private String buildPrompt(String message, List<AssistantChatRequest.AssistantTurn> history) {
        if (history == null || history.isEmpty()) {
            return message;
        }

        StringBuilder sb = new StringBuilder();
        int start = Math.max(0, history.size() - HISTORY_LIMIT);
        for (AssistantChatRequest.AssistantTurn turn : history.subList(start, history.size())) {
            if (turn == null || turn.getContent() == null || turn.getContent().isBlank()) continue;
            String label = "assistant".equalsIgnoreCase(turn.getRole()) ? "Assistant" : "User";
            sb.append(label).append(": ").append(turn.getContent()).append("\n");
        }
        sb.append("User: ").append(message);
        return sb.toString();
    }

    public static class AiAssistantUnavailableException extends RuntimeException {
        public AiAssistantUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
