package com.mansha.chatapp;

import com.mansha.chatapp.config.AiProviderResolver;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the "auto" AI provider actually resolves to openai when a real
 * key is configured — the scenario a production deployment relies on
 * without having to remember to also set app.ai.provider=openai.
 */
@SpringBootTest
class AiProviderResolverTests {

    @DynamicPropertySource
    static void aiProperties(DynamicPropertyRegistry registry) {
        registry.add("app.ai.provider", () -> "auto");
        registry.add("OPENAI_API_KEY", () -> "sk-test-fake-key-not-real");
    }

    @Autowired
    private AiProviderResolver aiProviderResolver;

    @Test
    void autoResolvesToOpenAiWhenARealKeyIsConfigured() {
        assertThat(aiProviderResolver.activeProvider()).isEqualTo("openai");
        assertThat(aiProviderResolver.isOllama()).isFalse();
    }
}
