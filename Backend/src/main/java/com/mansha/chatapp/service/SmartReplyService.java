package com.mansha.chatapp.service;

import com.mansha.chatapp.config.AiProviderResolver;
import com.mansha.chatapp.entity.ChatMessage;
import com.mansha.chatapp.repository.ChatMessageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class SmartReplyService {

    private static final Logger log = LoggerFactory.getLogger(SmartReplyService.class);

    private static final int HISTORY_LIMIT = 10;

    // Ollama unloads its model when idle, so a cold call can take 20-30s to
    // reload it — and on CPU-only hardware, even a warm model can take well
    // over 12s for a full prompt. Bound the wait so the chat UI never hangs
    // indefinitely — past this, fall back to the static suggestions below.
    // Configurable since the right value depends on the AI provider/hardware.
    @Value("${app.ai.smart-reply-timeout-seconds:12}")
    private long aiTimeoutSeconds;

    private final ChatClient openAiChatClient;
    private final ChatClient ollamaChatClient;
    private final ChatMessageRepository chatMessageRepository;
    private final AiProviderResolver aiProviderResolver;

    public SmartReplyService(@Qualifier("openAiChatClient") ChatClient openAiChatClient,
                             @Qualifier("ollamaChatClient") ChatClient ollamaChatClient,
                             ChatMessageRepository chatMessageRepository,
                             AiProviderResolver aiProviderResolver) {
        this.openAiChatClient = openAiChatClient;
        this.ollamaChatClient = ollamaChatClient;
        this.chatMessageRepository = chatMessageRepository;
        this.aiProviderResolver = aiProviderResolver;
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
            ChatClient client = activeClient();
            String raw = CompletableFuture
                    .supplyAsync(() -> client
                            .prompt()
                            .system(systemPrompt)
                            .user(userPrompt)
                            .call()
                            .content())
                    .get(aiTimeoutSeconds, TimeUnit.SECONDS);

            List<String> suggestions = parseSuggestions(raw);
            if (!suggestions.isEmpty()) {
                return suggestions;
            }
            log.warn("AI provider returned no usable suggestions (raw response was blank or unparseable); falling back to static suggestions. Raw: {}", raw);
        } catch (Exception e) {
            // AI provider unreachable, no key, model not pulled, etc.
            // Fall through to the static fallback below so the chat UI
            // never breaks because of the AI layer — but log it so a
            // silent AI outage in production is actually diagnosable.
            log.warn("Smart Reply AI call failed, falling back to static suggestions: {}", e.toString());
        }

        return List.of("Sounds good", "Tell me more", "Got it, thanks");
    }

    private ChatClient activeClient() {
        return aiProviderResolver.isOllama() ? ollamaChatClient : openAiChatClient;
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