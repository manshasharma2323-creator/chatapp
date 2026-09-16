package com.mansha.chatapp.controller;

import com.mansha.chatapp.dto.UserSummaryDto;
import com.mansha.chatapp.repository.UserRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.List;

/**
 * Separate from UserController on purpose — this endpoint (/api/users/contacts)
 * is new and doesn't touch the register/login/profile routes you already have.
 */
@RestController
@RequestMapping("/api/users")
public class UserContactsController {

    private final UserRepository userRepository;

    public UserContactsController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * GET /api/users/contacts
     * All registered users except the caller — used to populate the
     * "start a new conversation" picker instead of requiring a typed email.
     */
    @GetMapping("/contacts")
    public List<UserSummaryDto> getContacts(Principal principal) {
        String currentEmail = principal.getName();

        return userRepository.findAll().stream()
                .filter(u -> !u.getEmail().equalsIgnoreCase(currentEmail))
                .map(u -> new UserSummaryDto(u.getName(), u.getEmail()))
                .toList();
    }
}