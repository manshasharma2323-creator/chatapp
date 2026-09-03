package com.mansha.chatapp.service;

import com.mansha.chatapp.entity.User;
import com.mansha.chatapp.repository.UserRepository;
import com.mansha.chatapp.security.JwtService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtService jwtService;

    public User registerUser(User user) {
        return userRepository.save(user);
    }

    public String loginUser(String email, String password) {

        User user = userRepository.findByEmail(email).orElse(null);

        if (user != null && user.getPassword().equals(password)) {

            // Generate JWT token
            return jwtService.generateToken(user.getEmail());
        }

        return "Invalid email or password";
    }
}