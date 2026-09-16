package com.mansha.chatapp.controller;

import com.mansha.chatapp.dto.AssistantChatRequest;
import com.mansha.chatapp.dto.AssistantChatResponse;
import com.mansha.chatapp.dto.SmartReplyRequest;
import com.mansha.chatapp.dto.SmartReplyResponse;
import com.mansha.chatapp.service.AiAssistantService;
import com.mansha.chatapp.service.SmartReplyService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.security.Principal;
import java.util.List;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final SmartReplyService smartReplyService;
    private final AiAssistantService aiAssistantService;

    public AiController(SmartReplyService smartReplyService, AiAssistantService aiAssistantService) {
        this.smartReplyService = smartReplyService;
        this.aiAssistantService = aiAssistantService;
    }

    /**
     * POST /api/ai/smart-replies
     * Body: { "peerEmail": "friend@example.com" }
     * Protected by the same JWT filter as everything else — no SecurityConfig
     * change needed, since only whitelisted routes skip authentication.
     */
    @PostMapping("/smart-replies")
    public SmartReplyResponse getSmartReplies(@RequestBody SmartReplyRequest request,
                                              Principal principal) {
        List<String> suggestions =
                smartReplyService.generateSmartReplies(principal.getName(), request.getPeerEmail());

        return new SmartReplyResponse(suggestions);
    }

    /**
     * POST /api/ai/assistant
     * Body: { "message": "...", "history": [{ "role": "user"|"assistant", "content": "..." }] }
     * Standalone AI Assistant page — free-form Q&A, not tied to a peer
     * conversation. Same JWT protection as every other /api/** route.
     */
    @PostMapping("/assistant")
    public AssistantChatResponse chatWithAssistant(@RequestBody AssistantChatRequest request,
                                                    Principal principal) {
        if (request.getMessage() == null || request.getMessage().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "message must not be blank");
        }

        try {
            String reply = aiAssistantService.chat(request.getMessage(), request.getHistory());
            return new AssistantChatResponse(reply);
        } catch (AiAssistantService.AiAssistantUnavailableException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, e.getMessage());
        }
    }
}