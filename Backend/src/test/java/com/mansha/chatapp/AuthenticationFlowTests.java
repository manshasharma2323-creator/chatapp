package com.mansha.chatapp;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Exercises REGISTER -> LOGIN -> authenticated request -> rejected access
 * end-to-end over real HTTP, against the isolated H2 test database
 * (src/test/resources/application.properties).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthenticationFlowTests {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    private String baseUrl(String path) {
        return "http://localhost:" + port + path;
    }

    private String uniqueEmail() {
        return "user-" + UUID.randomUUID() + "@example.com";
    }

    private Map<String, Object> registerBody(String name, String email, String password) {
        return Map.of("name", name, "email", email, "password", password);
    }

    @Test
    void registerThenLoginReturnsUsableJwt() {
        String email = uniqueEmail();

        ResponseEntity<Map> registerResponse = rest.postForEntity(
                baseUrl("/api/users/register"), registerBody("Test User", email, "password123"), Map.class);
        assertThat(registerResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(registerResponse.getBody()).doesNotContainKey("password");

        ResponseEntity<String> loginResponse = rest.postForEntity(
                baseUrl("/api/users/login"), Map.of("email", email, "password", "password123"), String.class);
        assertThat(loginResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        String token = loginResponse.getBody().replaceAll("^\"|\"$", "");
        assertThat(token.split("\\.")).hasSize(3); // header.payload.signature

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        ResponseEntity<Map> meResponse = rest.exchange(
                baseUrl("/api/users/me"), HttpMethod.GET, new HttpEntity<>(headers), Map.class);
        assertThat(meResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(meResponse.getBody().get("email")).isEqualTo(email);
    }

    @Test
    void registerRejectsDuplicateEmail() {
        String email = uniqueEmail();
        rest.postForEntity(baseUrl("/api/users/register"), registerBody("First", email, "password123"), Map.class);

        ResponseEntity<Map> second = rest.postForEntity(
                baseUrl("/api/users/register"), registerBody("Second", email, "password123"), Map.class);
        assertThat(second.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void registerRejectsInvalidEmailAndShortPassword() {
        ResponseEntity<Map> badEmail = rest.postForEntity(
                baseUrl("/api/users/register"), registerBody("Test", "not-an-email", "password123"), Map.class);
        assertThat(badEmail.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        ResponseEntity<Map> shortPassword = rest.postForEntity(
                baseUrl("/api/users/register"), registerBody("Test", uniqueEmail(), "123"), Map.class);
        assertThat(shortPassword.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void loginRejectsWrongPassword() {
        String email = uniqueEmail();
        rest.postForEntity(baseUrl("/api/users/register"), registerBody("Test", email, "password123"), Map.class);

        ResponseEntity<Map> loginResponse = rest.postForEntity(
                baseUrl("/api/users/login"), Map.of("email", email, "password", "wrong-password"), Map.class);
        assertThat(loginResponse.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void loginRejectsUnknownEmail() {
        ResponseEntity<Map> loginResponse = rest.postForEntity(
                baseUrl("/api/users/login"), Map.of("email", uniqueEmail(), "password", "password123"), Map.class);
        assertThat(loginResponse.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void protectedEndpointRejectsMissingToken() {
        ResponseEntity<Map> response = rest.getForEntity(baseUrl("/api/users/me"), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void protectedEndpointRejectsInvalidToken() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer not-a-real-token");
        ResponseEntity<Map> response = rest.exchange(
                baseUrl("/api/users/me"), HttpMethod.GET, new HttpEntity<>(headers), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void logoutRevokesTokenImmediately() {
        String email = uniqueEmail();
        rest.postForEntity(baseUrl("/api/users/register"), registerBody("Test", email, "password123"), Map.class);
        String token = rest.postForEntity(baseUrl("/api/users/login"),
                        Map.of("email", email, "password", "password123"), String.class)
                .getBody().replaceAll("^\"|\"$", "");

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);

        // Works before logout.
        ResponseEntity<Map> before = rest.exchange(baseUrl("/api/users/me"), HttpMethod.GET, new HttpEntity<>(headers), Map.class);
        assertThat(before.getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<Void> logout = rest.exchange(baseUrl("/api/users/logout"), HttpMethod.POST, new HttpEntity<>(headers), Void.class);
        assertThat(logout.getStatusCode()).isEqualTo(HttpStatus.OK);

        // Same token is rejected immediately after logout, well before its 24h expiry.
        ResponseEntity<Map> after = rest.exchange(baseUrl("/api/users/me"), HttpMethod.GET, new HttpEntity<>(headers), Map.class);
        assertThat(after.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void aiAssistantEndpointRequiresAuthAndRejectsBlankMessage() {
        ResponseEntity<Map> unauthenticated = rest.postForEntity(
                baseUrl("/api/ai/assistant"), Map.of("message", "hi"), Map.class);
        assertThat(unauthenticated.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        String email = uniqueEmail();
        rest.postForEntity(baseUrl("/api/users/register"), registerBody("Test", email, "password123"), Map.class);
        String token = rest.postForEntity(baseUrl("/api/users/login"),
                        Map.of("email", email, "password", "password123"), String.class)
                .getBody().replaceAll("^\"|\"$", "");

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
        ResponseEntity<Map> blankMessage = rest.exchange(
                baseUrl("/api/ai/assistant"), HttpMethod.POST,
                new HttpEntity<>(Map.of("message", ""), headers), Map.class);
        assertThat(blankMessage.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
