package com.mansha.chatapp.service;

import com.mansha.chatapp.dto.ChatMessageDto;
import com.mansha.chatapp.dto.ConversationSummaryDto;
import com.mansha.chatapp.entity.ChatMessage;
import com.mansha.chatapp.repository.ChatMessageRepository;
import com.mansha.chatapp.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

@Service
public class ChatService {

    private final ChatMessageRepository chatMessageRepository;
    private final UserRepository userRepository;

    public ChatService(ChatMessageRepository chatMessageRepository,
                       UserRepository userRepository) {
        this.chatMessageRepository = chatMessageRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public ChatMessageDto saveMessage(String senderEmail, ChatMessageDto dto) {

        String receiverEmail = dto.getReceiverEmail();

        if (receiverEmail == null || receiverEmail.isBlank()) {
            throw new IllegalArgumentException("Receiver email is required");
        }

        if (dto.getContent() == null || dto.getContent().isBlank()) {
            throw new IllegalArgumentException("Message content cannot be empty");
        }

        if (senderEmail.equalsIgnoreCase(receiverEmail)) {
            throw new IllegalArgumentException("Cannot send a message to yourself");
        }

        if (userRepository.findByEmail(receiverEmail).isEmpty()) {
            throw new IllegalArgumentException("Receiver not found: " + receiverEmail);
        }

        ChatMessage entity = new ChatMessage(
                senderEmail,
                receiverEmail,
                dto.getContent()
        );

        ChatMessage saved = chatMessageRepository.save(entity);

        return toDto(saved);
    }

    @Transactional(readOnly = true)
    public List<ChatMessageDto> getConversation(String currentUserEmail,
                                                String otherUserEmail) {

        return chatMessageRepository
                .findConversation(currentUserEmail, otherUserEmail)
                .stream()
                .map(this::toDto)
                .toList();
    }

    /**
     * Marks all messages from peerEmail to currentUserEmail as read.
     */
    @Transactional
    public void markConversationRead(String currentUserEmail, String peerEmail) {
        chatMessageRepository.markConversationAsRead(currentUserEmail, peerEmail);
    }

    /**
     * Unread message count per sender, for seeding sidebar badges.
     */
    @Transactional(readOnly = true)
    public Map<String, Long> getUnreadCounts(String currentUserEmail) {
        Map<String, Long> counts = new HashMap<>();
        for (Object[] row : chatMessageRepository.countUnreadBySender(currentUserEmail)) {
            counts.put((String) row[0], (Long) row[1]);
        }
        return counts;
    }

    /**
     * One row per peer the current user has ever exchanged a message with,
     * newest conversation first — backs the sidebar so it's correct on a
     * fresh browser/device instead of depending on a local cache.
     */
    @Transactional(readOnly = true)
    public List<ConversationSummaryDto> getConversations(String currentUserEmail) {
        List<ChatMessage> messages =
                chatMessageRepository.findBySenderEmailOrReceiverEmailOrderBySentAtDesc(currentUserEmail, currentUserEmail);

        Map<String, Long> unreadCounts = getUnreadCounts(currentUserEmail);

        LinkedHashSet<String> seenPeers = new LinkedHashSet<>();
        List<ConversationSummaryDto> conversations = new ArrayList<>();

        for (ChatMessage m : messages) {
            boolean mine = m.getSenderEmail().equalsIgnoreCase(currentUserEmail);
            String peer = mine ? m.getReceiverEmail() : m.getSenderEmail();

            if (!seenPeers.add(peer)) continue; // already have this peer's most recent message

            conversations.add(new ConversationSummaryDto(
                    peer, m.getContent(), m.getSentAt(), mine, unreadCounts.getOrDefault(peer, 0L)
            ));
        }

        return conversations;
    }

    private ChatMessageDto toDto(ChatMessage entity) {
        return new ChatMessageDto(
                entity.getSenderEmail(),
                entity.getReceiverEmail(),
                entity.getContent(),
                entity.getSentAt()
        );
    }
}