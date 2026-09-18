package com.mansha.chatapp.controller;

import com.mansha.chatapp.dto.UpdateProfileRequest;
import com.mansha.chatapp.dto.UserSummaryDto;
import com.mansha.chatapp.entity.User;
import com.mansha.chatapp.security.JwtService;
import com.mansha.chatapp.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserService userService;

    @Autowired
    private JwtService jwtService;

    // Register
    @PostMapping("/register")
    public User registerUser(@RequestBody User user) {
        return userService.registerUser(user);
    }

    // Login - returns JWT token
    @PostMapping("/login")
    public String login(@RequestBody User user) {
        return userService.loginUser(
                user.getEmail(),
                user.getPassword()
        );
    }

    /**
     * POST /api/users/logout — revokes the caller's own JWT so it stops
     * working immediately instead of staying valid until its natural
     * expiry. A JWT is otherwise stateless, so this is what actually makes
     * "logout" mean something server-side, not just a client-side redirect.
     */
    @PostMapping("/logout")
    public void logout(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            jwtService.revokeToken(authHeader.substring(7));
        }
    }

    /**
     * GET /api/users/me — the caller's own name + email, for the Profile page.
     * Separate from /contacts on purpose: /contacts explicitly excludes the
     * caller, since it's meant for "who else can I message".
     */
    @GetMapping("/me")
    public UserSummaryDto me(Principal principal) {
        User user = userService.getByEmail(principal.getName());
        return new UserSummaryDto(user.getName(), user.getEmail());
    }

    /**
     * PATCH /api/users/me — edit-profile form on the Profile/Settings pages.
     * Body: { name?, currentPassword?, newPassword? } — everything optional,
     * send only what changed. Email is intentionally not editable here: it's
     * the identity key used throughout chat history and JWTs.
     */
    @PatchMapping("/me")
    public UserSummaryDto updateMe(@RequestBody UpdateProfileRequest request, Principal principal) {
        User updated = userService.updateProfile(principal.getName(), request);
        return new UserSummaryDto(updated.getName(), updated.getEmail());
    }
}