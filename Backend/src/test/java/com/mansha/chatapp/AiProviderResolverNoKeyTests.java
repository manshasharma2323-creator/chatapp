package com.mansha.chatapp;

import com.mansha.chatapp.config.AiProviderResolver;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The other half of the "auto" provider contract: with no real OpenAI key
 * configured, it must fall back to ollama rather than silently trying (and
 * failing every request against) a misconfigured OpenAI client.
 */
@SpringBootTest
class AiProviderResolverNoKeyTests {

    @DynamicPropertySource
    static void aiProperties(DynamicPropertyRegistry registry) {
        registry.add("app.ai.provider", () -> "auto");
        // Deliberately does NOT set OPENAI_API_KEY — this is the real
        // scenario a fresh production deployment starts from before anyone
        // configures an AI provider at all.
    }

    @Autowired
    private AiProviderResolver aiProviderResolver;

    @Test
    void autoFallsBackToOllamaWithNoRealKey() {
        assertThat(aiProviderResolver.activeProvider()).isEqualTo("ollama");
        assertThat(aiProviderResolver.isOllama()).isTrue();
    }
}
