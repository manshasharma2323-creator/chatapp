package com.mansha.chatapp.repository;

import com.mansha.chatapp.entity.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatRepository extends JpaRepository<ChatMessage, Long> {

}