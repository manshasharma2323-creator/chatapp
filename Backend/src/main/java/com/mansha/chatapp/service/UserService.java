package com.mansha.chatapp.service;

import com.mansha.chatapp.entity.User;
import com.mansha.chatapp.repository.UserRepository;
import com.mansha.chatapp.security.JwtService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    public User registerUser(User user) {
        userRepository.findByEmail(user.getEmail()).ifPresent(existing -> {
            throw new IllegalArgumentException("An account with this email already exists.");
        });

        user.setPassword(passwordEncoder.encode(user.getPassword()));
        return userRepository.save(user);
    }

    public String loginUser(String email, String password) {

        User user = userRepository.findByEmail(email).orElse(null);

        if (user != null && passwordMatches(user, password)) {
            // Generate JWT token
            return jwtService.generateToken(user.getEmail());
        }

        // A 401 (rather than 200 with an error string) lets the frontend
        // tell "wrong credentials" apart from "signed in, unexpected body".
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
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
            return passwordEncoder.matches(rawPassword, stored);
        }

        if (stored.equals(rawPassword)) {
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