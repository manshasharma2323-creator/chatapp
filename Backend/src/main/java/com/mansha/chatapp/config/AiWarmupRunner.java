package com.mansha.chatapp.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

/**
 * Ollama unloads its model from memory after a period of idleness, so the
 * first smart-reply request after a cold start can otherwise stall for
 * 20-30s while it reloads. Firing one throwaway prompt in the background
 * right after startup keeps the model warm for real user requests.
 */
@Component
public class AiWarmupRunner implements ApplicationRunner {

    private final ChatClient ollamaChatClient;
    private final AiProviderResolver aiProviderResolver;

    public AiWarmupRunner(@Qualifier("ollamaChatClient") ChatClient ollamaChatClient,
                           AiProviderResolver aiProviderResolver) {
        this.ollamaChatClient = ollamaChatClient;
        this.aiProviderResolver = aiProviderResolver;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!aiProviderResolver.isOllama()) return;

        CompletableFuture.runAsync(() -> {
            try {
                ollamaChatClient.prompt().user("Hi").call().content();
            } catch (Exception e) {
                // Ollama isn't up yet — smart replies fall back until it is.
            }
        });
    }
}
