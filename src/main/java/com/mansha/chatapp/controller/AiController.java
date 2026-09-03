package com.mansha.chatapp.controller;

import com.mansha.chatapp.dto.SmartReplyRequest;
import com.mansha.chatapp.dto.SmartReplyResponse;
import com.mansha.chatapp.service.SmartReplyService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.List;

@RestController
@RequestMapping("/api/ai")
public class AiController {

    private final SmartReplyService smartReplyService;

    public AiController(SmartReplyService smartReplyService) {
        this.smartReplyService = smartReplyService;
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
}