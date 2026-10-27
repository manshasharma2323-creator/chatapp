package com.mansha.chatapp;

import com.mansha.chatapp.dto.ChatMessageDto;
import com.mansha.chatapp.security.JwtService;
import com.mansha.chatapp.security.TokenBlacklistService;
import com.mansha.chatapp.service.ChatService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Regression tests for bugs found in the audit: each test fails against the
 * pre-fix code and documents the behaviour that is now guaranteed.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApiRegressionTests {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private ChatService chatService;

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private String uniqueLocalPart() {
        return "user-" + UUID.randomUUID();
    }

    private void register(String email) {
        ResponseEntity<Map> r = rest.postForEntity(url("/api/users/register"),
                Map.of("name", "Test", "email", email, "password", "password123"), Map.class);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private String login(String email) {
        ResponseEntity<String> r = rest.postForEntity(url("/api/users/login"),
                Map.of("email", email, "password", "password123"), String.class);
        assertThat(r.getStatusCode()).as("login as %s", email).isEqualTo(HttpStatus.OK);
        return r.getBody().replaceAll("^\"|\"$", "");
    }

    private HttpHeaders bearer(String token) {
        HttpHeaders h = new HttpHeaders();
        h.set("Authorization", "Bearer " + token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }

    // ---------------------------------------------------------------- auth

    @Test
    void emailsAreCaseInsensitiveForRegistrationAndLogin() {
        String local = uniqueLocalPart();
        register("  " + local.toUpperCase() + "@Example.com ");

        // Same address, different casing -> duplicate, not a second account.
        ResponseEntity<Map> duplicate = rest.postForEntity(url("/api/users/register"),
                Map.of("name", "Dup", "email", local + "@example.com", "password", "password123"), Map.class);
        assertThat(duplicate.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        // And the user can sign in however they type it.
        assertThat(login(local + "@example.com")).isNotBlank();
        assertThat(login(local.toUpperCase() + "@EXAMPLE.COM")).isNotBlank();
    }

    @Test
    void registrationCannotOverwriteAnExistingAccountViaClientSuppliedId() {
        String victim = uniqueLocalPart() + "@example.com";
        register(victim);

        ResponseEntity<Map> r = rest.postForEntity(url("/api/users/register"),
                Map.of("id", 1, "name", "Attacker", "email", uniqueLocalPart() + "@example.com",
                        "password", "password123"), Map.class);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
        // Victim can still sign in with their original password.
        assertThat(login(victim)).isNotBlank();
    }

    @Test
    void overlongPasswordIsRejectedWith400NotServerError() {
        ResponseEntity<Map> r = rest.postForEntity(url("/api/users/register"),
                Map.of("name", "T", "email", uniqueLocalPart() + "@example.com", "password", "x".repeat(100)),
                Map.class);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void loginWithMissingFieldsIs401NotServerError() {
        ResponseEntity<Map> noPassword = rest.postForEntity(url("/api/users/login"),
                Map.of("email", "someone@example.com"), Map.class);
        assertThat(noPassword.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        ResponseEntity<Map> empty = rest.postForEntity(url("/api/users/login"), Map.of(), Map.class);
        assertThat(empty.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void unauthenticatedRequestsGet401() {
        assertThat(rest.getForEntity(url("/api/chat/conversations"), Map.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(rest.getForEntity(url("/api/users/contacts"), Map.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void usersOnlySeeTheirOwnConversations() {
        String a = uniqueLocalPart() + "@example.com";
        String b = uniqueLocalPart() + "@example.com";
        String c = uniqueLocalPart() + "@example.com";
        register(a); register(b); register(c);
        chatService.saveMessage(a, msg(b, "secret between a and b"));

        // c asks for the a<->b conversation by passing a as the peer: only c<->a messages are returned.
        ResponseEntity<List> asC = rest.exchange(url("/api/chat/history?with=" + a), HttpMethod.GET,
                new HttpEntity<>(bearer(login(c))), List.class);
        assertThat(asC.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(asC.getBody()).isEmpty();
    }

    // ------------------------------------------------------- error handling

    @Test
    void malformedJsonIs400NotServerError() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<Map> r = rest.postForEntity(url("/api/users/login"), new HttpEntity<>("{not json", h), Map.class);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void unknownRouteIs404AndMissingParamIs400() {
        String email = uniqueLocalPart() + "@example.com";
        register(email);
        HttpEntity<Void> auth = new HttpEntity<>(bearer(login(email)));

        ResponseEntity<Map> unknown = rest.exchange(url("/api/nope"), HttpMethod.GET, auth, Map.class);
        assertThat(unknown.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        ResponseEntity<Map> noParam = rest.exchange(url("/api/chat/history"), HttpMethod.GET, auth, Map.class);
        assertThat(noParam.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void aiAssistantRejectsOversizedMessage() {
        String email = uniqueLocalPart() + "@example.com";
        register(email);
        ResponseEntity<Map> r = rest.exchange(url("/api/ai/assistant"), HttpMethod.POST,
                new HttpEntity<>(Map.of("message", "x".repeat(4001)), bearer(login(email))), Map.class);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // ------------------------------------------------------------- messages

    @Test
    void historyTimestampsAreUtcInstantsWithZoneDesignator() {
        String a = uniqueLocalPart() + "@example.com";
        String b = uniqueLocalPart() + "@example.com";
        register(a); register(b);
        chatService.saveMessage(a, msg(b, "hello"));

        ResponseEntity<List> r = rest.exchange(url("/api/chat/history?with=" + b), HttpMethod.GET,
                new HttpEntity<>(bearer(login(a))), List.class);
        Map<?, ?> first = (Map<?, ?>) r.getBody().get(0);
        // A zone-less "2026-01-01T10:00:00" was parsed by browsers as local time.
        assertThat((String) first.get("sentAt")).endsWith("Z");

        ResponseEntity<List> convs = rest.exchange(url("/api/chat/conversations"), HttpMethod.GET,
                new HttpEntity<>(bearer(login(a))), List.class);
        assertThat((String) ((Map<?, ?>) convs.getBody().get(0)).get("lastMessageAt")).endsWith("Z");
    }

    @Test
    void messageToDifferentlyCasedReceiverIsStoredUnderTheirRegisteredEmail() {
        String a = uniqueLocalPart() + "@example.com";
        String b = uniqueLocalPart() + "@example.com";
        register(a); register(b);

        ChatMessageDto saved = chatService.saveMessage(a, msg(b.toUpperCase(), "hi"));
        assertThat(saved.getReceiverEmail()).isEqualTo(b);
        assertThat(chatService.getConversation(b, a)).hasSize(1);
        assertThat(chatService.getUnreadCounts(b)).containsEntry(a, 1L);
    }

    @Test
    void overlongMessageIsRejected() {
        String a = uniqueLocalPart() + "@example.com";
        String b = uniqueLocalPart() + "@example.com";
        register(a); register(b);
        assertThatThrownBy(() -> chatService.saveMessage(a, msg(b, "x".repeat(ChatService.MAX_MESSAGE_LENGTH + 1))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("too long");
    }

    // ------------------------------------------------------------------ JWT

    @Test
    void placeholderJwtSecretIsNeverUsedForSigning() {
        JwtService withPlaceholder = newJwtService("CHANGE-ME-set-JWT_SECRET-env-var-before-deploying");
        JwtService attackerWhoReadTheRepo = newJwtService("CHANGE-ME-set-JWT_SECRET-env-var-before-deploying");

        // Two instances with the public placeholder must not trust each other's tokens.
        String forged = attackerWhoReadTheRepo.generateToken("victim@example.com");
        assertThat(withPlaceholder.isTokenValid(forged)).isFalse();
        assertThat(withPlaceholder.isTokenValid(withPlaceholder.generateToken("me@example.com"))).isTrue();
    }

    @Test
    void tooShortJwtSecretFailsFastWithClearMessage() {
        assertThatThrownBy(() -> newJwtService("short"))
                .hasMessageContaining("JWT_SECRET must be at least 32");
    }

    private static JwtService newJwtService(String secret) {
        JwtService svc = new JwtService(new TokenBlacklistService());
        ReflectionTestUtils.setField(svc, "secret", secret);
        ReflectionTestUtils.setField(svc, "expirationMs", 60_000L);
        ReflectionTestUtils.invokeMethod(svc, "init");
        return svc;
    }

    private static ChatMessageDto msg(String to, String content) {
        ChatMessageDto dto = new ChatMessageDto();
        dto.setReceiverEmail(to);
        dto.setContent(content);
        return dto;
    }
}
