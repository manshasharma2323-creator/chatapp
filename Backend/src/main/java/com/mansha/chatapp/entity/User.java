package com.mansha.chatapp.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    // Unique so concurrent registrations can't create duplicate accounts.
    // Existing databases pick this up via ddl-auto=update (if legacy rows
    // already contain duplicates MySQL refuses the index and logs a warning
    // at startup — dedupe those rows manually, see README troubleshooting).
    @Column(unique = true, length = 150)
    private String email;

    private String password;

    public User() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }


    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    // Accept a password on the way in (register/login request bodies) but
    // never echo it back out (e.g. the register response), hashed or not.
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}