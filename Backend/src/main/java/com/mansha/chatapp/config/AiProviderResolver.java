package com.mansha.chatapp.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Resolves which AI provider (openai/ollama) Smart Reply, the AI Assistant,
 * and the Ollama warmup runner should actually use.
 *
 * app.ai.provider can be set explicitly to "openai" or "ollama" to force
 * one — but its default is "auto": pick "openai" if a real OPENAI_API_KEY
 * is configured, otherwise fall back to "ollama". Without this, a backend
 * deployed with the property left at its old hardcoded "ollama" default
 * would silently point at http://localhost:11434 forever in production
 * (where no Ollama exists), even if the deployer only set OPENAI_API_KEY
 * and assumed that was enough.
 */
@Component
public class AiProviderResolver {

    @Value("${app.ai.provider:auto}")
    private String configuredProvider;

    private final Environment environment;

    public AiProviderResolver(Environment environment) {
        this.environment = environment;
    }

    public String activeProvider() {
        if (!"auto".equalsIgnoreCase(configuredProvider)) {
            return configuredProvider;
        }
        return hasRealOpenAiKey() ? "openai" : "ollama";
    }

    public boolean isOllama() {
        return "ollama".equalsIgnoreCase(activeProvider());
    }

    private boolean hasRealOpenAiKey() {
        // Deliberately reads the raw OPENAI_API_KEY env var directly rather
        // than the derived spring.ai.openai.api-key=${OPENAI_API_KEY}
        // property: that derived property is itself a placeholder
        // expression, and Spring Boot 3.5 throws PlaceholderResolutionException
        // when resolving it eagerly (e.g. via @Value) if OPENAI_API_KEY is
        // genuinely unset — which is exactly the case this needs to detect
        // safely, not crash the app over.
        return StringUtils.hasText(environment.getProperty("OPENAI_API_KEY"));
    }
}
