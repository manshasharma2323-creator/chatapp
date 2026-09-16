/* ============================================================
   Messages page — real-time chat.
   Same backend contract the app has always used:
     WS   /ws                       (SockJS + STOMP, Authorization: Bearer <jwt>)
     SEND /app/chat.send            -> { receiverEmail, content }
     SEND /app/chat.typing          -> { receiverEmail, typing }
     SUB  /user/queue/messages      -> { senderEmail, receiverEmail, content, sentAt }
     SUB  /user/queue/typing        -> { senderEmail, typing }
     SUB  /topic/presence           -> { email, online }
     GET  /api/chat/history?with=..
     GET  /api/chat/online
     GET  /api/chat/unread-counts
     POST /api/chat/mark-read?with=..
     GET  /api/users/contacts
     POST /api/ai/smart-replies
   ============================================================ */
(function () {
    "use strict";

    const A = window.App;
    const session = A.initShell("messages");
    if (!session) return;

    const $ = (id) => document.getElementById(id);

    const els = {
        sidebar: $("sidebar"), scrim: $("scrim"),
        openDrawer: $("openDrawer"),
        connDot: $("connDot"), connText: $("connText"),
        searchInput: $("searchInput"), newChatBtn: $("newChatBtn"), chatList: $("chatList"),
        peerAvatar: $("peerAvatar"), peerName: $("peerName"), peerSub: $("peerSub"), clearChatBtn: $("clearChatBtn"),
        stream: $("stream"), streamEmpty: $("streamEmpty"), peerTyping: $("peerTyping"), aiTyping: $("aiTyping"),
        aiStrip: $("aiStrip"), chipRow: $("chipRow"), aiBtn: $("aiBtn"),
        emojiTray: $("emojiTray"), emojiBtn: $("emojiBtn"), attachBtn: $("attachBtn"),
        input: $("input"), sendBtn: $("sendBtn"),
        newChatModal: $("newChatModal"), newChatEmail: $("newChatEmail"), newChatError: $("newChatError"),
        newChatCancel: $("newChatCancel"), newChatConfirm: $("newChatConfirm"), contactsList: $("contactsList")
    };

    const state = {
        myEmail: session.email,
        token: session.token,
        client: null,
        connected: false,
        active: null,
        chats: A.loadChats(session.email),
        onlineUsers: new Set(),
        iAmTypingTo: null,
        stopTypingTimer: null,
        peerTypingFrom: null,
        peerTypingSafetyTimer: null
    };

    function persistChats() { A.saveChats(state.myEmail, state.chats); }

    /* ============================================================
       WEBSOCKET
       ============================================================ */
    function setConnected(on, label) {
        state.connected = on;
        els.connDot.style.background = on ? "var(--ok)" : "var(--muted)";
        els.connText.textContent = label || (on ? "Online" : "Offline");
        els.sendBtn.disabled = !on || !state.active;
    }

    function connect() {
        setConnected(false, "Connecting…");

        state.client = new StompJs.Client({
            webSocketFactory: () => new SockJS(A.API_BASE + "/ws"),
            connectHeaders: { Authorization: "Bearer " + state.token },
            reconnectDelay: 4000,
            heartbeatIncoming: 10000,
            heartbeatOutgoing: 10000,
            debug: () => {}
        });

        state.client.onConnect = function () {
            setConnected(true, "Online");
            A.toast("Connected");

            state.client.subscribe("/user/queue/messages", (frame) => {
                let msg; try { msg = JSON.parse(frame.body); } catch (e) { return; }
                receive(msg);
            });

            state.client.subscribe("/topic/presence", (frame) => {
                let p; try { p = JSON.parse(frame.body); } catch (e) { return; }
                if (!p || !p.email) return;
                const email = p.email.toLowerCase();
                if (p.online) state.onlineUsers.add(email);
                else {
                    state.onlineUsers.delete(email);
                    if (state.peerTypingFrom === email) hidePeerTyping();
                }
                renderChatList();
                updatePeerStatus();
            });

            state.client.subscribe("/user/queue/typing", (frame) => {
                let t; try { t = JSON.parse(frame.body); } catch (e) { return; }
                if (!t || !t.senderEmail) return;
                handleIncomingTyping(t.senderEmail.toLowerCase(), !!t.typing);
            });

            A.authFetch("/api/chat/online")
                .then((r) => (r.ok ? r.json() : []))
                .then((list) => {
                    (list || []).forEach((p) => { if (p && p.email) state.onlineUsers.add(p.email.toLowerCase()); });
                    renderChatList();
                    updatePeerStatus();
                })
                .catch(() => {});

            loadUnreadCounts();
            maybeOpenFromQuery();
        };

        state.client.onStompError = (frame) => {
            setConnected(false, "Rejected");
            A.toast(frame.headers.message || "Connection rejected — token invalid", "bad");
        };
        state.client.onWebSocketClose = () => setConnected(false, "Reconnecting…");

        state.client.activate();
    }

    /* ============================================================
       CONVERSATIONS
       ============================================================ */
    function ensureChat(email) {
        const key = email.toLowerCase();
        if (!state.chats[key]) state.chats[key] = { messages: [], unread: 0 };
        return state.chats[key];
    }

    function updatePeerStatus() {
        if (!state.active) return;
        const on = state.onlineUsers.has(state.active);
        const dot = els.peerAvatar.querySelector(".status");
        if (dot) dot.classList.toggle("on", on);
        if (state.peerTypingFrom !== state.active) {
            els.peerSub.textContent = on ? "Online" : state.active;
        }
    }

    const TYPING_STOP_DELAY = 2200;

    function notifyTyping() {
        if (!state.connected || !state.active || !state.client) return;
        if (state.iAmTypingTo !== state.active) {
            state.iAmTypingTo = state.active;
            publishTyping(state.active, true);
        }
        clearTimeout(state.stopTypingTimer);
        state.stopTypingTimer = setTimeout(() => {
            publishTyping(state.active, false);
            state.iAmTypingTo = null;
        }, TYPING_STOP_DELAY);
    }

    function stopTypingNow() {
        clearTimeout(state.stopTypingTimer);
        if (state.iAmTypingTo) {
            publishTyping(state.iAmTypingTo, false);
            state.iAmTypingTo = null;
        }
    }

    function publishTyping(peerEmail, isTyping) {
        if (!state.connected || !state.client) return;
        // Chat setting (local preference, not a server capability): if the
        // user has opted out of sharing their typing status, simply never
        // publish it — the composer/autosize UX is unaffected either way.
        if (!A.loadPrefs(state.myEmail).shareTypingStatus) return;
        try {
            state.client.publish({ destination: "/app/chat.typing", body: JSON.stringify({ receiverEmail: peerEmail, typing: isTyping }) });
        } catch (e) {}
    }

    function handleIncomingTyping(senderEmail, isTyping) {
        if (senderEmail !== state.active) return;
        if (isTyping) showPeerTyping(senderEmail); else hidePeerTyping();
    }

    function showPeerTyping(senderEmail) {
        state.peerTypingFrom = senderEmail;
        els.peerTyping.hidden = false;
        els.peerSub.textContent = "Typing…";
        clearTimeout(state.peerTypingSafetyTimer);
        state.peerTypingSafetyTimer = setTimeout(hidePeerTyping, 5000);
    }

    function hidePeerTyping() {
        clearTimeout(state.peerTypingSafetyTimer);
        state.peerTypingFrom = null;
        els.peerTyping.hidden = true;
        updatePeerStatus();
    }

    function openChat(email) {
        const key = email.toLowerCase();
        if (state.active === key) { closeDrawer(); return; }

        stopTypingNow();
        hidePeerTyping();
        state.active = key;

        const chat = ensureChat(key);
        chat.unread = 0;
        persistChats();
        markReadOnServer(key);

        els.peerName.textContent = A.displayName(key);
        els.peerName.title = key;
        els.peerSub.textContent = key;
        els.peerAvatar.style.background = A.ramp(key);
        els.peerAvatar.querySelector("span").textContent = A.initials(key);
        document.documentElement.style.setProperty("--peer-accent", A.ramp(key));

        els.sendBtn.disabled = !state.connected;
        els.input.focus();

        renderChatList();
        renderStream();
        refreshSmartReplies();
        updatePeerStatus();
        closeDrawer();

        loadHistory(key);
    }

    async function loadHistory(peerEmail) {
        try {
            const res = await A.authFetch("/api/chat/history?with=" + encodeURIComponent(peerEmail));
            if (!res.ok) return;
            const history = await res.json();
            if (!Array.isArray(history) || !history.length) return;

            const chat = ensureChat(peerEmail);
            // The live WebSocket echo and the REST history endpoint can
            // serialize the same instant with different fractional-second
            // precision (e.g. ".7552932" vs ".755293"), so dedup on
            // whole-second precision rather than the raw string.
            const dedupKey = (sentAt, content) => (sentAt || "").slice(0, 19) + "|" + content;
            const known = new Set(chat.messages.map((m) => dedupKey(m.sentAt, m.content)));

            let added = 0;
            history.forEach((m) => {
                const key = dedupKey(m.sentAt, m.content || "");
                if (!known.has(key)) {
                    chat.messages.push({ mine: (m.senderEmail || "").toLowerCase() === state.myEmail, content: m.content, sentAt: m.sentAt });
                    added++;
                }
            });

            if (added > 0) {
                chat.messages.sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
                persistChats();
                if (state.active === peerEmail.toLowerCase()) {
                    renderStream(); renderChatList(); refreshSmartReplies();
                }
            }
        } catch (err) {}
    }

    function markReadOnServer(peerEmail) {
        A.authFetch("/api/chat/mark-read?with=" + encodeURIComponent(peerEmail), { method: "POST" }).catch(() => {});
    }

    function loadUnreadCounts() {
        A.authFetch("/api/chat/unread-counts")
            .then((r) => (r.ok ? r.json() : {}))
            .then((counts) => {
                Object.keys(counts || {}).forEach((email) => {
                    const key = email.toLowerCase();
                    if (state.active === key) return;
                    ensureChat(key).unread = counts[email];
                });
                persistChats();
                renderChatList();
            })
            .catch(() => {});
    }

    async function loadContacts() {
        if (!els.contactsList) return;
        els.contactsList.innerHTML = '<div style="padding:4px">' + A.skeletonRows(3, 46) + "</div>";
        try {
            const res = await A.authFetch("/api/users/contacts");
            if (!res.ok) throw new Error("failed");
            const list = await res.json();

            if (!Array.isArray(list) || !list.length) {
                els.contactsList.innerHTML = A.emptyState("fa-regular fa-address-book", "No other registered users yet.", "padding:16px");
                return;
            }

            els.contactsList.innerHTML = list.map((u) => {
                const email = (u.email || "").toLowerCase();
                const name = u.name || A.displayName(email);
                return (
                    '<button type="button" class="contact-item" data-email="' + A.esc(email) + '">' +
                    '<div class="avatar avatar-sm" style="background:' + A.ramp(email) + '"><span>' + A.esc(A.initials(email)) + "</span></div>" +
                    '<div class="meta"><div class="name">' + A.esc(name) + '</div><div class="mail">' + A.esc(email) + "</div></div>" +
                    "</button>"
                );
            }).join("");

            els.contactsList.querySelectorAll(".contact-item").forEach((btn) => {
                btn.addEventListener("click", () => { els.newChatEmail.value = btn.dataset.email; });
            });
        } catch (err) {
            els.contactsList.innerHTML = A.emptyState("fa-solid fa-triangle-exclamation", "Couldn't load users. You can still add someone by email below.", "padding:16px");
        }
    }

    function receive(msg) {
        const peer = (msg.senderEmail || "").toLowerCase() === state.myEmail
            ? (msg.receiverEmail || "").toLowerCase()
            : (msg.senderEmail || "").toLowerCase();
        if (!peer) return;

        const chat = ensureChat(peer);
        const mine = (msg.senderEmail || "").toLowerCase() === state.myEmail;
        chat.messages.push({ mine, content: msg.content, sentAt: msg.sentAt || new Date().toISOString() });
        if (!mine && state.active !== peer) chat.unread += 1;

        persistChats();
        renderChatList();
        A.setNavBadge("messages", Object.values(state.chats).reduce((a, c) => a + (c.unread || 0), 0));

        if (state.active === peer) {
            renderStream();
            if (!mine) refreshSmartReplies();
        } else if (!mine) {
            A.toast(A.displayName(peer) + " sent a message");
        }

        if (!mine) notifyIncoming(peer, msg.content);
    }

    /**
     * Notification/chat settings are local-only preferences, never sent to
     * the backend — this is the one place that reads them for real-time
     * messages (a fresh page load ignores them, since there's nothing to
     * alert about there).
     */
    function notifyIncoming(peer, content) {
        const prefs = A.loadPrefs(state.myEmail);
        if (prefs.notifySound && (state.active !== peer || document.hidden)) {
            A.playPing();
        }
        if (prefs.notifyDesktop && document.hidden) {
            A.showDesktopNotification(
                A.displayName(peer),
                prefs.notifyPreview ? content : "Sent you a new message"
            );
        }
    }

    function send() {
        const text = els.input.value.trim();
        if (!text) return;
        if (!state.active) { A.toast("Pick a conversation first", "bad"); return; }
        if (!state.connected) { A.toast("Not connected", "bad"); return; }

        state.client.publish({ destination: "/app/chat.send", body: JSON.stringify({ receiverEmail: state.active, content: text }) });
        stopTypingNow();

        els.input.value = "";
        autoGrow();
        els.aiStrip.hidden = true;
        els.emojiTray.hidden = true;
    }

    /* ============================================================
       RENDERING
       ============================================================ */
    function renderChatList() {
        const filter = els.searchInput.value.trim().toLowerCase();

        const entries = Object.keys(state.chats).map((email) => {
            const c = state.chats[email];
            const last = c.messages[c.messages.length - 1];
            return {
                email, unread: c.unread,
                preview: last ? (last.mine ? "You: " : "") + last.content : "No messages yet",
                at: last ? last.sentAt : null
            };
        });

        entries.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
        const visible = entries.filter((e) => !filter || e.email.includes(filter) || A.displayName(e.email).toLowerCase().includes(filter));

        if (!visible.length) {
            els.chatList.innerHTML = A.emptyState(
                "fa-regular fa-comment-dots",
                filter ? "Nothing matches that search." : 'No conversations yet.<br>Tap <strong>New</strong> to add someone.'
            );
            return;
        }

        els.chatList.innerHTML = visible.map((e) => {
            const active = e.email === state.active;
            return (
                '<button class="chat-item' + (active ? " active" : "") + (e.unread ? " unread" : "") +
                '" data-email="' + A.esc(e.email) + '" style="--accent:' + A.ramp(e.email) + '">' +
                '<div class="avatar" style="background:' + A.ramp(e.email) + '"><span>' + A.esc(A.initials(e.email)) + '</span>' +
                '<span class="status' + (state.onlineUsers.has(e.email) ? " on" : "") + '"></span></div>' +
                '<div class="meta"><div class="row"><span class="name">' + A.esc(A.displayName(e.email)) + '</span>' +
                '<span class="time">' + (e.at ? A.clockTime(e.at) : "") + "</span></div>" +
                '<div class="preview">' + A.esc(e.preview) + "</div></div>" +
                (e.unread ? '<span class="badge">' + e.unread + "</span>" : "") +
                "</button>"
            );
        }).join("");

        els.chatList.querySelectorAll(".chat-item").forEach((btn) => btn.addEventListener("click", () => openChat(btn.dataset.email)));
    }

    function renderStream() {
        const chat = state.active ? state.chats[state.active] : null;

        if (!chat || !chat.messages.length) {
            els.stream.innerHTML = "";
            els.stream.appendChild(els.streamEmpty);
            els.streamEmpty.hidden = false;
            if (state.active) {
                els.streamEmpty.querySelector("h2").textContent = "Say hello to " + A.displayName(state.active);
                els.streamEmpty.querySelector("p").textContent = "No messages here yet. Whatever you send arrives instantly.";
            }
            return;
        }

        let html = "", lastDay = null;
        chat.messages.forEach((m) => {
            const key = A.dayKey(m.sentAt);
            if (key && key !== lastDay) { html += '<div class="day-sep">' + A.esc(A.dayLabel(m.sentAt)) + "</div>"; lastDay = key; }
            html += '<div class="bubble ' + (m.mine ? "me" : "them") + '"><span class="text">' + A.esc(m.content) +
                '</span><span class="stamp">' + A.clockTime(m.sentAt) + "</span></div>";
        });

        els.stream.innerHTML = html;
        els.stream.scrollTop = els.stream.scrollHeight;
    }

    /* ============================================================
       AI SMART REPLIES
       ============================================================ */
    async function fetchSuggestions(peerEmail) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await A.authFetch("/api/ai/smart-replies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ peerEmail }),
                signal: controller.signal
            });
            if (!res.ok) throw new Error("smart-replies request failed");
            const data = await res.json();
            if (Array.isArray(data.suggestions) && data.suggestions.length) return data.suggestions;
            throw new Error("empty suggestions");
        } catch (err) {
            return ["Sounds good", "Tell me more", "Got it, thanks"];
        } finally {
            clearTimeout(timeout);
        }
    }

    async function refreshSmartReplies() {
        const chat = state.active ? state.chats[state.active] : null;
        if (!chat || !chat.messages.length) { els.aiStrip.hidden = true; return; }

        const incoming = [...chat.messages].reverse().find((m) => !m.mine);
        if (!incoming) { els.aiStrip.hidden = true; return; }

        els.aiStrip.hidden = false;
        els.chipRow.innerHTML = '<button class="chip loading">Thinking…</button><button class="chip loading">Thinking…</button>';
        els.aiTyping.hidden = false;

        const suggestions = await fetchSuggestions(state.active);

        els.aiTyping.hidden = true;
        els.chipRow.innerHTML = suggestions.map((s) => '<button class="chip">' + A.esc(s) + "</button>").join("");
        els.chipRow.querySelectorAll(".chip").forEach((chip) => {
            chip.addEventListener("click", () => { els.input.value = chip.textContent; autoGrow(); els.input.focus(); });
        });
    }

    /* ============================================================
       COMPOSER
       ============================================================ */
    function autoGrow() {
        els.input.style.height = "auto";
        els.input.style.height = Math.min(els.input.scrollHeight, 132) + "px";
    }

    const EMOJI = ["😀","😄","😅","😂","🙂","😉","😍","😘","🤔","🤗","😎","🥳",
        "😴","😢","😭","😡","👍","👏","🙏","💪","🔥","✨","🎉","❤️",
        "💜","✅","❌","⚡","🚀","💡","📌","☕"];

    function buildEmojiTray() {
        els.emojiTray.innerHTML = EMOJI.map((e) => "<button>" + e + "</button>").join("");
        els.emojiTray.querySelectorAll("button").forEach((b) => {
            b.addEventListener("click", () => { els.input.value += b.textContent; autoGrow(); els.input.focus(); });
        });
    }

    function openDrawer() { els.sidebar.classList.add("open"); els.scrim.hidden = false; }
    function closeDrawer() { els.sidebar.classList.remove("open"); els.scrim.hidden = true; }

    function maybeOpenFromQuery() {
        const params = new URLSearchParams(location.search);
        const with_ = params.get("with");
        if (with_) openChat(with_);
    }

    /* ============================================================
       EVENTS
       ============================================================ */
    els.sendBtn.addEventListener("click", send);
    els.input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        // Chat setting (local preference): Enter sends by default (Shift+Enter
        // for a newline); if turned off, Enter always makes a newline and
        // Ctrl/Cmd+Enter sends instead — a common alternate binding.
        const enterSends = A.loadPrefs(state.myEmail).sendWithEnter;
        const wantsSend = enterSends ? !e.shiftKey : (e.ctrlKey || e.metaKey);
        if (wantsSend) { e.preventDefault(); send(); }
    });
    els.input.addEventListener("input", () => { autoGrow(); notifyTyping(); });
    els.searchInput.addEventListener("input", renderChatList);

    els.emojiBtn.addEventListener("click", () => { els.emojiTray.hidden = !els.emojiTray.hidden; });
    els.attachBtn.addEventListener("click", () => A.toast("File sharing is not part of the backend yet", "bad"));
    els.aiBtn.addEventListener("click", () => { if (!state.active) { A.toast("Open a conversation first", "bad"); return; } refreshSmartReplies(); });

    els.openDrawer.addEventListener("click", openDrawer);
    els.scrim.addEventListener("click", closeDrawer);

    els.newChatBtn.addEventListener("click", () => {
        els.newChatError.hidden = true;
        els.newChatEmail.value = "";
        els.newChatModal.hidden = false;
        els.newChatEmail.focus();
        loadContacts();
    });
    els.newChatCancel.addEventListener("click", () => { els.newChatModal.hidden = true; });
    els.newChatConfirm.addEventListener("click", () => {
        const email = els.newChatEmail.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { els.newChatError.textContent = "Enter a valid email address."; els.newChatError.hidden = false; return; }
        if (email === state.myEmail) { els.newChatError.textContent = "That's your own address."; els.newChatError.hidden = false; return; }
        ensureChat(email);
        persistChats();
        els.newChatModal.hidden = true;
        openChat(email);
    });
    els.newChatEmail.addEventListener("keydown", (e) => { if (e.key === "Enter") els.newChatConfirm.click(); });

    els.clearChatBtn.addEventListener("click", () => {
        if (!state.active) return;
        state.chats[state.active].messages = [];
        persistChats();
        renderStream();
        renderChatList();
        els.aiStrip.hidden = true;
        A.toast("Conversation cleared on this device");
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { els.newChatModal.hidden = true; els.emojiTray.hidden = true; closeDrawer(); }
    });

    /* ============================================================
       BOOT
       ============================================================ */
    buildEmojiTray();
    renderChatList();
    connect();
})();
