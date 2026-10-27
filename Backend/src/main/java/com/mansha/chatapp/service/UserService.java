package com.mansha.chatapp.service;

import com.mansha.chatapp.dto.UpdateProfileRequest;
import com.mansha.chatapp.entity.User;
import com.mansha.chatapp.repository.UserRepository;
import com.mansha.chatapp.security.JwtService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

@Service
public class UserService {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    // BCrypt only uses the first 72 bytes of a password, and Spring's encoder
    // rejects longer ones outright — cap it up front with a clear message.
    private static final int MAX_PASSWORD_BYTES = 72;
    private static final int MAX_NAME_LENGTH = 100;
    private static final int MAX_EMAIL_LENGTH = 150; // matches chat_messages.*_email columns

    /** Emails are stored and compared trimmed + lower-cased everywhere. */
    private static String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase();
    }

    private static void requireValidPassword(String password, String field) {
        if (password == null || password.length() < 6) {
            throw new IllegalArgumentException(field + " must be at least 6 characters.");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new IllegalArgumentException(field + " must be at most " + MAX_PASSWORD_BYTES + " bytes.");
        }
    }

    public User registerUser(User user) {
        if (user.getName() == null || user.getName().isBlank()) {
            throw new IllegalArgumentException("Name is required.");
        }
        if (user.getName().trim().length() > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException("Name must be at most " + MAX_NAME_LENGTH + " characters.");
        }

        String email = normalizeEmail(user.getEmail());
        if (email == null || email.length() > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.matcher(email).matches()) {
            throw new IllegalArgumentException("Enter a valid email address.");
        }
        requireValidPassword(user.getPassword(), "Password");

        // Check the *normalized* address: "Bob@x.com" and "bob@x.com" are
        // the same account, and this check used to run on the raw input.
        userRepository.findByEmail(email).ifPresent(existing -> {
            throw new IllegalArgumentException("An account with this email already exists.");
        });

        user.setId(null); // never let a client-supplied id overwrite an existing row
        user.setName(user.getName().trim());
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        try {
            return userRepository.save(user);
        } catch (DataIntegrityViolationException e) {
            // Two simultaneous registrations passed the check above; the
            // unique constraint on users.email caught the loser.
            throw new IllegalArgumentException("An account with this email already exists.");
        }
    }

    public String loginUser(String email, String password) {

        // Missing fields are just bad credentials (401), not a server error.
        User user = (email == null || password == null)
                ? null
                : userRepository.findByEmail(normalizeEmail(email)).orElse(null);

        if (user != null && passwordMatches(user, password)) {
            // Generate JWT token
            return jwtService.generateToken(user.getEmail());
        }

        // A 401 (rather than 200 with an error string) lets the frontend
        // tell "wrong credentials" apart from "signed in, unexpected body".
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
    }

    public User getByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    /**
     * Backs the Profile/Settings "edit profile" forms. Name and password
     * are independently optional — send only what changed. Changing the
     * password requires the correct current one, checked the same way a
     * login would (legacy plain-text accounts included).
     */
    public User updateProfile(String email, UpdateProfileRequest request) {
        User user = getByEmail(email);

        if (request.getName() != null && !request.getName().isBlank()) {
            if (request.getName().trim().length() > MAX_NAME_LENGTH) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Name must be at most " + MAX_NAME_LENGTH + " characters.");
            }
            user.setName(request.getName().trim());
        }

        if (request.getNewPassword() != null && !request.getNewPassword().isBlank()) {
            if (request.getCurrentPassword() == null || !passwordMatches(user, request.getCurrentPassword())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Current password is incorrect.");
            }
            try {
                requireValidPassword(request.getNewPassword(), "New password");
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
            }
            user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        }

        return userRepository.save(user);
    }

    /**
     * Accounts created before password hashing was added still have their
     * password stored in plain text. Accept either form so those accounts
     * keep working, and transparently upgrade a matching legacy password to
     * a proper hash the moment its owner next logs in.
     */
    private boolean passwordMatches(User user, String rawPassword) {
        String stored = user.getPassword();

        if (looksHashed(stored)) {
            try {
                return passwordEncoder.matches(rawPassword, stored);
            } catch (IllegalArgumentException e) {
                return false; // e.g. over-long password — can't be the right one
            }
        }

        if (stored != null && stored.equals(rawPassword)) {
            user.setPassword(passwordEncoder.encode(rawPassword));
            userRepository.save(user);
            return true;
        }

        return false;
    }

    private boolean looksHashed(String password) {
        return password != null && password.startsWith("$2");
    }
}