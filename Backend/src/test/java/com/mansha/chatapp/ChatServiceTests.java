package com.mansha.chatapp;

import com.mansha.chatapp.dto.ChatMessageDto;
import com.mansha.chatapp.dto.ConversationSummaryDto;
import com.mansha.chatapp.entity.User;
import com.mansha.chatapp.service.ChatService;
import com.mansha.chatapp.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Covers message validation and persistence directly against ChatService
 * (the WebSocket layer just delegates to it), including that history
 * survives a fresh read — the same guarantee "refresh the page" relies on.
 */
@SpringBootTest
class ChatServiceTests {

    @Autowired
    private ChatService chatService;

    @Autowired
    private UserService userService;

    private String newUser() {
        String email = "user-" + UUID.randomUUID() + "@example.com";
        User u = new User();
        u.setName("Test User");
        u.setEmail(email);
        u.setPassword("password123");
        userService.registerUser(u);
        return email;
    }

    @Test
    void messagePersistsAndIsReturnedInConversationOrder() {
        String alice = newUser();
        String bob = newUser();

        ChatMessageDto sent = chatService.saveMessage(alice, dto(bob, "Hello Bob"));
        assertThat(sent.getSentAt()).isNotNull();

        List<ChatMessageDto> conversation = chatService.getConversation(alice, bob);
        assertThat(conversation).hasSize(1);
        assertThat(conversation.get(0).getContent()).isEqualTo("Hello Bob");
        assertThat(conversation.get(0).getSenderEmail()).isEqualToIgnoringCase(alice);
    }

    @Test
    void conversationsListShowsBothSidesLastMessage() {
        String alice = newUser();
        String bob = newUser();

        chatService.saveMessage(alice, dto(bob, "First"));
        chatService.saveMessage(bob, dto(alice, "Second"));

        List<ConversationSummaryDto> aliceConversations = chatService.getConversations(alice);
        assertThat(aliceConversations).hasSize(1);
        assertThat(aliceConversations.get(0).getPeerEmail()).isEqualToIgnoringCase(bob);
        assertThat(aliceConversations.get(0).getLastMessage()).isEqualTo("Second");
    }

    @Test
    void rejectsEmptyContent() {
        String alice = newUser();
        String bob = newUser();
        assertThatThrownBy(() -> chatService.saveMessage(alice, dto(bob, "   ")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsMessagingYourself() {
        String alice = newUser();
        assertThatThrownBy(() -> chatService.saveMessage(alice, dto(alice, "hi me")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsUnknownReceiver() {
        String alice = newUser();
        assertThatThrownBy(() -> chatService.saveMessage(alice, dto("nobody-" + UUID.randomUUID() + "@example.com", "hi")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void markingConversationReadClearsUnreadCount() {
        String alice = newUser();
        String bob = newUser();

        chatService.saveMessage(alice, dto(bob, "Unread from Alice"));
        assertThat(chatService.getUnreadCounts(bob)).containsEntry(alice.toLowerCase(), 1L);

        chatService.markConversationRead(bob, alice);
        assertThat(chatService.getUnreadCounts(bob)).doesNotContainKey(alice.toLowerCase());
    }

    private ChatMessageDto dto(String receiverEmail, String content) {
        ChatMessageDto dto = new ChatMessageDto();
        dto.setReceiverEmail(receiverEmail);
        dto.setContent(content);
        return dto;
    }
}
