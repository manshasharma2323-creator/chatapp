package com.mansha.chatapp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.mansha.chatapp.dto.ChatMessageDto;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.converter.CompositeMessageConverter;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.converter.MessageConverter;
import org.springframework.messaging.converter.StringMessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Genuine two-user real-time flow over an actual WebSocket connection (not
 * just calling ChatService directly): User A connects, sends a message,
 * User B receives it live, and the message is independently confirmed
 * persisted via the REST history endpoint.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ChatWebSocketFlowTests {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    private String httpBase() {
        return "http://localhost:" + port;
    }

    private String wsUrl() {
        // SockJS endpoints also expose a plain WebSocket at <endpoint>/websocket,
        // which lets a real STOMP-over-WebSocket client connect directly without
        // speaking the SockJS HTTP framing.
        return "ws://localhost:" + port + "/ws/websocket";
    }

    private String registerAndLogin(String name) {
        String email = "ws-" + name + "-" + UUID.randomUUID() + "@example.com";
        rest.postForEntity(httpBase() + "/api/users/register",
                Map.of("name", name, "email", email, "password", "password123"), Map.class);
        String token = rest.postForEntity(httpBase() + "/api/users/login",
                        Map.of("email", email, "password", "password123"), String.class)
                .getBody().replaceAll("^\"|\"$", "");
        return email + "|" + token;
    }

    @Test
    void messageSentByUserAIsReceivedLiveByUserBAndPersisted() throws Exception {
        String[] alice = registerAndLogin("alice").split("\\|");
        String[] bob = registerAndLogin("bob").split("\\|");
        String aliceEmail = alice[0], aliceToken = alice[1];
        String bobEmail = bob[0], bobToken = bob[1];

        WebSocketStompClient stompClient = newStompClient();

        StompSession aliceSession = connect(stompClient, aliceToken);
        StompSession bobSession = connect(stompClient, bobToken);

        LinkedBlockingQueue<ChatMessageDto> bobInbox = new LinkedBlockingQueue<>();
        LinkedBlockingQueue<ChatMessageDto> aliceInbox = new LinkedBlockingQueue<>();
        subscribe(bobSession, bobInbox);
        subscribe(aliceSession, aliceInbox);
        // subscribe() only sends the SUBSCRIBE frame; give the broker a
        // moment to actually register it server-side before publishing.
        Thread.sleep(500);

        String content = "Hello Bob, this is a live WebSocket test message";
        aliceSession.send("/app/chat.send", Map.of("receiverEmail", bobEmail, "content", content));

        // 1. Bob receives it live over his own WebSocket session.
        ChatMessageDto receivedByBob = bobInbox.poll(10, TimeUnit.SECONDS);
        assertThat(receivedByBob).as("Bob should receive the message in real time").isNotNull();
        assertThat(receivedByBob.getContent()).isEqualTo(content);
        assertThat(receivedByBob.getSenderEmail()).isEqualToIgnoringCase(aliceEmail);

        // 2. Alice also gets her own echo, so her open tab shows the sent message immediately.
        ChatMessageDto echoedToAlice = aliceInbox.poll(10, TimeUnit.SECONDS);
        assertThat(echoedToAlice).as("Alice should get an echo of her own sent message").isNotNull();
        assertThat(echoedToAlice.getContent()).isEqualTo(content);

        aliceSession.disconnect();
        bobSession.disconnect();

        // 3. Independently confirm it was actually persisted to the database,
        // not just relayed in memory — via the plain REST history endpoint.
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + bobToken);
        ResponseEntity<List> historyResponse = rest.exchange(
                httpBase() + "/api/chat/history?with=" + aliceEmail,
                HttpMethod.GET, new HttpEntity<>(headers), List.class);

        assertThat(historyResponse.getStatusCode().is2xxSuccessful()).isTrue();
        List<Map<String, Object>> history = historyResponse.getBody();
        assertThat(history).isNotNull();
        assertThat(history.stream().anyMatch(m -> content.equals(m.get("content")))).isTrue();
    }

    @Test
    void sendingToUnknownReceiverReportsErrorBackToSender() throws Exception {
        String[] alice = registerAndLogin("alice2").split("\\|");
        String aliceToken = alice[1];

        WebSocketStompClient stompClient = newStompClient();
        StompSession aliceSession = connect(stompClient, aliceToken);

        LinkedBlockingQueue<String> errorInbox = new LinkedBlockingQueue<>();
        aliceSession.subscribe("/user/queue/errors", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return String.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                errorInbox.add((String) payload);
            }
        });
        Thread.sleep(500);

        aliceSession.send("/app/chat.send", Map.of(
                "receiverEmail", "nobody-" + UUID.randomUUID() + "@example.com",
                "content", "hi"));

        String error = errorInbox.poll(10, TimeUnit.SECONDS);
        assertThat(error).as("Sender should be told the message could not be delivered").isNotNull();

        aliceSession.disconnect();
    }

    /**
     * The app's own auto-configured ObjectMapper registers the JSR-310
     * module automatically (needed to deserialize ChatMessageDto.sentAt);
     * a test client needs it explicitly. A plain WebSocketStompClient also
     * ships a StringMessageConverter by default for text/plain frames like
     * the /user/queue/errors payload — setting a single Jackson converter
     * would silently drop that, so both are combined explicitly here.
     */
    private WebSocketStompClient newStompClient() {
        WebSocketStompClient stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
        MappingJackson2MessageConverter jacksonConverter = new MappingJackson2MessageConverter();
        jacksonConverter.setObjectMapper(objectMapper);

        List<MessageConverter> converters = new ArrayList<>();
        converters.add(new StringMessageConverter());
        converters.add(jacksonConverter);
        stompClient.setMessageConverter(new CompositeMessageConverter(converters));
        return stompClient;
    }

    private StompSession connect(WebSocketStompClient stompClient, String token) throws Exception {
        StompHeaders connectHeaders = new StompHeaders();
        connectHeaders.add("Authorization", "Bearer " + token);
        return stompClient
                .connectAsync(wsUrl(), (WebSocketHttpHeaders) null, connectHeaders, new StompSessionHandlerAdapter() {})
                .get(10, TimeUnit.SECONDS);
    }

    private void subscribe(StompSession session, LinkedBlockingQueue<ChatMessageDto> inbox) {
        session.subscribe("/user/queue/messages", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return ChatMessageDto.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                inbox.add((ChatMessageDto) payload);
            }
        });
    }
}
