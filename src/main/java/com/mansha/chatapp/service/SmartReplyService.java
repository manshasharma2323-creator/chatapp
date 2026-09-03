package com.mansha.chatapp.service;

import com.mansha.chatapp.entity.ChatMessage;
import com.mansha.chatapp.repository.ChatMessageRepository;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class SmartReplyService {

    private static final int HISTORY_LIMIT = 10;

    private final ChatClient openAiChatClient;
    private final ChatClient ollamaChatClient;
    private final ChatMessageRepository chatMessageRepository;

    @Value("${app.ai.provider:openai}")
    private String provider;

    public SmartReplyService(@Qualifier("openAiChatClient") ChatClient openAiChatClient,
                             @Qualifier("ollamaChatClient") ChatClient ollamaChatClient,
                             ChatMessageRepository chatMessageRepository) {
        this.openAiChatClient = openAiChatClient;
        this.ollamaChatClient = ollamaChatClient;
        this.chatMessageRepository = chatMessageRepository;
    }

    /**
     * Generates 3 short reply suggestions for currentUser to send to peerEmail,
     * grounded in the last HISTORY_LIMIT messages of their conversation.
     * This recent-message window is the "conversation memory" — the model
     * sees the shape of the whole exchange, not just the last line.
     */
    public List<String> generateSmartReplies(String currentUser, String peerEmail) {

        List<ChatMessage> recent =
                chatMessageRepository.findRecentMessages(currentUser, peerEmail, HISTORY_LIMIT);

        if (recent.isEmpty()) {
            return List.of("Hey! How are you?", "Hi there 👋", "Hello! What's up?");
        }

        // Repository returns newest-first; the prompt needs chronological order.
        Collections.reverse(recent);

        String transcript = buildTranscript(recent, currentUser);

        String systemPrompt = """
                You are a smart-reply assistant inside a chat application.
                Read the conversation so far and suggest exactly 3 short replies
                that the CURRENT USER could send next.
                Rules:
                - Each suggestion must be under 12 words.
                - The 3 suggestions must differ from each other in tone or intent.
                - No quotes, no numbering, no explanations.
                - Reply with exactly 3 lines, one suggestion per line, nothing else.
                """;

        String userPrompt = "Conversation so far (Me = the current user):\n" + transcript +
                "\nSuggest 3 short replies for \"Me\" to send next.";

        try {
            String raw = activeClient()
                    .prompt()
                    .system(systemPrompt)
                    .user(userPrompt)
                    .call()
                    .content();

            List<String> suggestions = parseSuggestions(raw);
            if (!suggestions.isEmpty()) {
                return suggestions;
            }
        } catch (Exception e) {
            // AI provider unreachable, no key, model not pulled, etc.
            // Fall through to the static fallback below so the chat UI
            // never breaks because of the AI layer.
        }

        return List.of("Sounds good", "Tell me more", "Got it, thanks");
    }

    private ChatClient activeClient() {
        return "ollama".equalsIgnoreCase(provider) ? ollamaChatClient : openAiChatClient;
    }

    private String buildTranscript(List<ChatMessage> messages, String currentUser) {
        StringBuilder sb = new StringBuilder();
        for (ChatMessage m : messages) {
            String label = m.getSenderEmail().equalsIgnoreCase(currentUser) ? "Me" : "Them";
            sb.append(label).append(": ").append(m.getContent()).append("\n");
        }
        return sb.toString();
    }

    private List<String> parseSuggestions(String raw) {
        if (raw == null || raw.isBlank()) return List.of();

        List<String> lines = Arrays.stream(raw.split("\n"))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                // strip leading bullets/numbering like "1.", "-", "*"
                .map(s -> s.replaceFirst("^[-*\\d.\\)]+\\s*", ""))
                .limit(3)
                .collect(Collectors.toCollection(ArrayList::new));

        return lines;
    }
}