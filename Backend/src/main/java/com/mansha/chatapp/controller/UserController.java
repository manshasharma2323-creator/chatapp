package com.mansha.chatapp.controller;

import com.mansha.chatapp.entity.User;
import com.mansha.chatapp.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserService userService;

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

    // Protected Profile API
    @GetMapping("/profile")
    public String profile() {
        return "Welcome! You are authenticated.";
    }
}