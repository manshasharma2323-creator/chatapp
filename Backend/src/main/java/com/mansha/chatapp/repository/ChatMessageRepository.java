package com.mansha.chatapp.repository;

import com.mansha.chatapp.entity.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    @Query("""
            SELECT m FROM ChatMessage m
            WHERE (m.senderEmail = :userA AND m.receiverEmail = :userB)
               OR (m.senderEmail = :userB AND m.receiverEmail = :userA)
            ORDER BY m.sentAt ASC
            """)
    List<ChatMessage> findConversation(@Param("userA") String userA,
                                       @Param("userB") String userB);

    @Query("""
            SELECT m FROM ChatMessage m
            WHERE (m.senderEmail = :userA AND m.receiverEmail = :userB)
               OR (m.senderEmail = :userB AND m.receiverEmail = :userA)
            ORDER BY m.sentAt DESC
            LIMIT :limit
            """)
    List<ChatMessage> findRecentMessages(@Param("userA") String userA,
                                         @Param("userB") String userB,
                                         @Param("limit") int limit);

    /**
     * Marks every unread message FROM peerEmail TO currentUser as read.
     * Called when currentUser opens that conversation.
     */
    @Modifying
    @Query("""
            UPDATE ChatMessage m
            SET m.read = true
            WHERE m.senderEmail = :peerEmail
              AND m.receiverEmail = :currentUser
              AND m.read = false
            """)
    int markConversationAsRead(@Param("currentUser") String currentUser,
                               @Param("peerEmail") String peerEmail);

    /**
     * Unread message count per sender, for the currently logged-in user.
     * Powers the sidebar badges — persisted server-side, so it survives
     * a page refresh instead of resetting.
     */
    @Query("""
            SELECT m.senderEmail, COUNT(m)
            FROM ChatMessage m
            WHERE m.receiverEmail = :currentUser
              AND m.read = false
            GROUP BY m.senderEmail
            """)
    List<Object[]> countUnreadBySender(@Param("currentUser") String currentUser);

    /**
     * Every message currentUser has sent or received, newest first — the
     * source for building their conversation list server-side (most
     * recent message per peer) instead of relying on browser-local cache,
     * so a fresh device/browser still sees prior conversations.
     */
    List<ChatMessage> findBySenderEmailOrReceiverEmailOrderBySentAtDesc(String senderEmail, String receiverEmail);
}