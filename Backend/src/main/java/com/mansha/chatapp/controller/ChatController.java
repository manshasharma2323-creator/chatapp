package com.mansha.chatapp.controller;

import com.mansha.chatapp.dto.ChatMessageDto;
import com.mansha.chatapp.dto.PresenceDto;
import com.mansha.chatapp.dto.TypingDto;
import com.mansha.chatapp.dto.TypingRequest;
import com.mansha.chatapp.service.ChatService;
import com.mansha.chatapp.service.PresenceService;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Controller
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chatService;
    private final PresenceService presenceService;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatController(ChatService chatService,
                          PresenceService presenceService,
                          SimpMessagingTemplate messagingTemplate) {
        this.chatService = chatService;
        this.presenceService = presenceService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/chat.send")
    public void sendMessage(@Payload ChatMessageDto dto, Principal principal) {
        String senderEmail = principal.getName();

        ChatMessageDto saved = chatService.saveMessage(senderEmail, dto);

        messagingTemplate.convertAndSendToUser(
                saved.getReceiverEmail(),
                "/queue/messages",
                saved
        );

        messagingTemplate.convertAndSendToUser(
                senderEmail,
                "/queue/messages",
                saved
        );
    }

    /**
     * WebSocket: client publishes to /app/chat.typing whenever the user
     * starts or stops typing. Not persisted anywhere — it's a live-only
     * signal, purely relayed to the intended receiver.
     */
    @MessageMapping("/chat.typing")
    public void typing(@Payload TypingRequest request, Principal principal) {
        if (request.getReceiverEmail() == null || request.getReceiverEmail().isBlank()) {
            return; // malformed payload — ignore rather than error out over the socket
        }

        String senderEmail = principal.getName();

        messagingTemplate.convertAndSendToUser(
                request.getReceiverEmail(),
                "/queue/typing",
                new TypingDto(senderEmail, request.isTyping())
        );
    }

    @GetMapping("/history")
    @ResponseBody
    public List<ChatMessageDto> getHistory(@RequestParam("with") String peerEmail,
                                           Principal principal) {
        return chatService.getConversation(principal.getName(), peerEmail);
    }

    @GetMapping("/online")
    @ResponseBody
    public List<PresenceDto> getOnlineUsers() {
        return presenceService.getOnlineUsers()
                .stream()
                .map(email -> new PresenceDto(email, true))
                .collect(Collectors.toList());
    }

    @PostMapping("/mark-read")
    @ResponseBody
    public void markRead(@RequestParam("with") String peerEmail, Principal principal) {
        chatService.markConversationRead(principal.getName(), peerEmail);
    }

    @GetMapping("/unread-counts")
    @ResponseBody
    public Map<String, Long> getUnreadCounts(Principal principal) {
        return chatService.getUnreadCounts(principal.getName());
    }
}