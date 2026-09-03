/* ============================================================
   AI Chat Hub — frontend logic
   Backend contract used (unchanged from your project):
     POST /api/users/login          -> returns a JWT
     WS   /ws            (SockJS + STOMP, Authorization: Bearer <jwt>)
     SEND /app/chat.send            -> { receiverEmail, content }
     SUB  /user/queue/messages      -> { senderEmail, receiverEmail, content, sentAt }
     GET  /api/chat/history?with=.. -> [ ChatMessageDto ]   ← NEW
   ============================================================ */

(function () {
    "use strict";

    /* ---------- element lookup ---------- */
    const $ = (id) => document.getElementById(id);

    const els = {
        authScreen: $("authScreen"),
        loginEmail: $("loginEmail"),
        loginPassword: $("loginPassword"),
        loginBtn: $("loginBtn"),
        authError: $("authError"),
        tokenToggle: $("tokenToggle"),
        tokenBlock: $("tokenBlock"),
        manualToken: $("manualToken"),
        manualEmail: $("manualEmail"),
        tokenLoginBtn: $("tokenLoginBtn"),

        app: $("app"),
        sidebar: $("sidebar"),
        scrim: $("scrim"),
        openDrawer: $("openDrawer"),
        closeDrawer: $("closeDrawer"),

        meAvatar: $("meAvatar"),
        meName: $("meName"),
        meCard: $("meCard"),
        connText: $("connText"),
        signOutBtn: $("signOutBtn"),

        searchInput: $("searchInput"),
        newChatBtn: $("newChatBtn"),
        chatList: $("chatList"),

        peerAvatar: $("peerAvatar"),
        peerName: $("peerName"),
        peerSub: $("peerSub"),
        clearChatBtn: $("clearChatBtn"),

        stream: $("stream"),
        streamEmpty: $("streamEmpty"),
        peerTyping: $("peerTyping"),
        aiTyping: $("aiTyping"),

        aiStrip: $("aiStrip"),
        chipRow: $("chipRow"),
        aiBtn: $("aiBtn"),

        emojiTray: $("emojiTray"),
        emojiBtn: $("emojiBtn"),
        attachBtn: $("attachBtn"),

        input: $("input"),
        sendBtn: $("sendBtn"),

        newChatModal: $("newChatModal"),
        newChatEmail: $("newChatEmail"),
        newChatError: $("newChatError"),
        newChatCancel: $("newChatCancel"),
        newChatConfirm: $("newChatConfirm"),
        contactsList: $("contactsList"),

        toastArea: $("toastArea")
    };

    /* ---------- state ---------- */
    const state = {
        token: null,
        myEmail: null,
        client: null,
        connected: false,
        active: null,          // email of the open conversation
        chats: {},             // email -> { messages: [], unread: 0 }
        onlineUsers: new Set(), // emails currently connected, from /topic/presence

        // Outgoing typing signal (me -> server)
        iAmTypingTo: null,      // peer email I last told the server I'm typing to
        stopTypingTimer: null,  // fires "stopped typing" after a pause

        // Incoming typing signal (peer -> me), shown only for the open conversation
        peerTypingFrom: null,
        peerTypingSafetyTimer: null
    };

    const AVATAR_RAMPS = [
        "linear-gradient(135deg,#7c5cff,#4f46e5)",
        "linear-gradient(135deg,#2fe0d5,#3b82f6)",
        "linear-gradient(135deg,#ff5fa2,#7c5cff)",
        "linear-gradient(135deg,#f59e0b,#ef4444)",
        "linear-gradient(135deg,#6ee7a8,#2fe0d5)",
        "linear-gradient(135deg,#818cf8,#c084fc)"
    ];

    /* ---------- small helpers ---------- */
    function ramp(email) {
        let h = 0;
        for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
        return AVATAR_RAMPS[h % AVATAR_RAMPS.length];
    }

    function initials(email) {
        const local = (email || "?").split("@")[0];
        const parts = local.split(/[._-]+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return local.slice(0, 2).toUpperCase();
    }

    function displayName(email) {
        const local = (email || "").split("@")[0];
        return local
            .split(/[._-]+/)
            .filter(Boolean)
            .map((w) => w[0].toUpperCase() + w.slice(1))
            .join(" ") || email;
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, (c) => (
            { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
        ));
    }

    function clockTime(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "";
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function dayKey(iso) {
        const d = new Date(iso);
        return isNaN(d) ? "" : d.toDateString();
    }

    function dayLabel(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "";
        const today = new Date();
        const yest = new Date();
        yest.setDate(today.getDate() - 1);

        if (d.toDateString() === today.toDateString()) return "Today";
        if (d.toDateString() === yest.toDateString()) return "Yesterday";
        return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
    }

    function toast(message, kind) {
        const el = document.createElement("div");
        el.className = "toast " + (kind || "ok");
        el.innerHTML =
            '<i class="fa-solid ' +
            (kind === "bad" ? "fa-circle-exclamation" : "fa-circle-check") +
            '"></i><span>' + esc(message) + "</span>";
        els.toastArea.appendChild(el);
        setTimeout(() => {
            el.style.transition = "opacity .3s, transform .3s";
            el.style.opacity = "0";
            el.style.transform = "translateY(8px)";
            setTimeout(() => el.remove(), 320);
        }, 2600);
    }

    /* ---------- local persistence ---------- */
    const store = {
        key: () => "aichathub:" + state.myEmail,
        save() {
            try {
                localStorage.setItem(store.key(), JSON.stringify(state.chats));
            } catch (e) { /* storage full or blocked — not fatal */ }
        },
        load() {
            try {
                const raw = localStorage.getItem(store.key());
                state.chats = raw ? JSON.parse(raw) : {};
            } catch (e) {
                state.chats = {};
            }
        },
        saveSession(token, email) {
            try {
                localStorage.setItem("aichathub:token", token);
                localStorage.setItem("aichathub:email", email);
            } catch (e) { /* ignore */ }
        },
        clearSession() {
            try {
                localStorage.removeItem("aichathub:token");
                localStorage.removeItem("aichathub:email");
            } catch (e) { /* ignore */ }
        }
    };

    /* ============================================================
       AUTH
       ============================================================ */
    function showAuthError(msg) {
        els.authError.textContent = msg;
        els.authError.hidden = false;
    }

    function extractToken(body) {
        if (!body) return null;

        if (typeof body === "string") {
            const trimmed = body.trim().replace(/^"|"$/g, "");
            return trimmed.split(".").length === 3 ? trimmed : null;
        }

        const direct = body.token || body.jwt || body.accessToken ||
            body.access_token || body.jwtToken;
        if (typeof direct === "string") return direct;

        if (body.data) return extractToken(body.data);
        return null;
    }

    async function login() {
        const email = els.loginEmail.value.trim();
        const password = els.loginPassword.value;

        if (!email || !password) {
            showAuthError("Enter your email and password.");
            return;
        }

        els.authError.hidden = true;
        els.loginBtn.disabled = true;
        els.loginBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Signing in';

        try {
            const res = await fetch("/api/users/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email, password: password })
            });

            const raw = await res.text();
            let parsed = raw;
            try { parsed = JSON.parse(raw); } catch (e) { /* plain text token */ }

            if (!res.ok) {
                showAuthError(
                    (parsed && parsed.message) ||
                    "Sign in failed (" + res.status + "). Check your email and password."
                );
                return;
            }

            const token = extractToken(parsed);

            if (!token) {
                showAuthError(
                    "Signed in, but no JWT was found in the response. " +
                    "Use \"Paste it instead\" below, or tell me the field name your API returns."
                );
                return;
            }

            startSession(token, email);
        } catch (err) {
            showAuthError("Could not reach the server. Is the application running?");
        } finally {
            els.loginBtn.disabled = false;
            els.loginBtn.innerHTML =
                '<i class="fa-solid fa-arrow-right-to-bracket"></i>&nbsp; Sign in';
        }
    }

    function loginWithToken() {
        const token = els.manualToken.value.trim();
        const email = els.manualEmail.value.trim();

        if (!token || !email) {
            showAuthError("Paste both the token and your email.");
            return;
        }
        startSession(token, email);
    }

    function startSession(token, email) {
        state.token = token;
        state.myEmail = email.toLowerCase();

        store.saveSession(token, state.myEmail);
        store.load();

        els.authScreen.hidden = true;
        els.app.hidden = false;

        els.meName.textContent = displayName(state.myEmail);
        els.meName.title = state.myEmail;
        els.meAvatar.style.background = ramp(state.myEmail);
        els.meAvatar.querySelector("span").textContent = initials(state.myEmail);

        renderChatList();
        connect();
    }

    function signOut() {
        if (state.client) {
            try { state.client.deactivate(); } catch (e) { /* ignore */ }
        }
        store.clearSession();
        location.reload();
    }

    /* ============================================================
       WEBSOCKET
       ============================================================ */
    function setConnected(on, label) {
        state.connected = on;
        els.meCard.classList.toggle("is-online", on);
        els.connText.textContent = label || (on ? "Online" : "Offline");
        els.sendBtn.disabled = !on || !state.active;
    }

    function connect() {
        setConnected(false, "Connecting");

        state.client = new StompJs.Client({
            webSocketFactory: () => new SockJS("/ws"),
            connectHeaders: { Authorization: "Bearer " + state.token },
            reconnectDelay: 4000,
            heartbeatIncoming: 10000,
            heartbeatOutgoing: 10000,
            debug: () => {}
        });

        state.client.onConnect = function () {
            setConnected(true, "Online");
            toast("Connected");

            state.client.subscribe("/user/queue/messages", function (frame) {
                let msg;
                try { msg = JSON.parse(frame.body); } catch (e) { return; }
                receive(msg);
            });

            // Live presence broadcasts: someone connects or disconnects
            state.client.subscribe("/topic/presence", function (frame) {
                let p;
                try { p = JSON.parse(frame.body); } catch (e) { return; }
                if (!p || !p.email) return;

                const email = p.email.toLowerCase();

                if (p.online) {
                    state.onlineUsers.add(email);
                } else {
                    state.onlineUsers.delete(email);
                    // If the peer we're watching went offline mid-type, clear the dots.
                    if (state.peerTypingFrom === email) {
                        hidePeerTyping();
                    }
                }
                renderChatList();
                updatePeerStatus();
            });

            // Someone is typing to me (or stopped)
            state.client.subscribe("/user/queue/typing", function (frame) {
                let t;
                try { t = JSON.parse(frame.body); } catch (e) { return; }
                if (!t || !t.senderEmail) return;
                handleIncomingTyping(t.senderEmail.toLowerCase(), !!t.typing);
            });

            // Snapshot of who is already online, so status is correct
            // even for users who connected before this session started.
            fetch("/api/chat/online", {
                headers: { Authorization: "Bearer " + state.token }
            })
                .then((r) => (r.ok ? r.json() : []))
                .then((list) => {
                    (list || []).forEach((p) => {
                        if (p && p.email) state.onlineUsers.add(p.email.toLowerCase());
                    });
                    renderChatList();
                    updatePeerStatus();
                })
                .catch(() => { /* non-fatal — live broadcasts still work */ });

            // Server is now authoritative for unread counts (read-state is
            // persisted in the database), so pull the real numbers on connect.
            loadUnreadCounts();
        };

        state.client.onStompError = function (frame) {
            setConnected(false, "Rejected");
            toast(frame.headers.message || "Connection rejected — token invalid", "bad");
        };

        state.client.onWebSocketClose = function () {
            setConnected(false, "Reconnecting");
        };

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

    /**
     * Syncs the chat-header avatar dot and subtitle with live presence
     * for whichever conversation is currently open.
     */
    function updatePeerStatus() {
        if (!state.active) return;
        const on = state.onlineUsers.has(state.active);
        const dot = els.peerAvatar.querySelector(".status");
        if (dot) dot.classList.toggle("on", on);

        // Don't stomp on an active "typing…" label with the online status
        if (state.peerTypingFrom !== state.active) {
            els.peerSub.textContent = on ? "Online" : state.active;
        }
    }

    /* ---------- OUTGOING: tell the server I'm typing (debounced) ---------- */

    const TYPING_STOP_DELAY = 2200; // ms of silence before we say "stopped"

    function notifyTyping() {
        if (!state.connected || !state.active || !state.client) return;

        // Only send the "start" signal once per burst of typing, not on
        // every keystroke — the server/network doesn't need a flood.
        if (state.iAmTypingTo !== state.active) {
            state.iAmTypingTo = state.active;
            publishTyping(state.active, true);
        }

        // Reset the "stop" timer on every keystroke
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
        try {
            state.client.publish({
                destination: "/app/chat.typing",
                body: JSON.stringify({ receiverEmail: peerEmail, typing: isTyping })
            });
        } catch (e) { /* non-fatal — worst case the dots just don't show */ }
    }

    /* ---------- INCOMING: someone is typing to me ---------- */

    function handleIncomingTyping(senderEmail, isTyping) {
        // Only reflect it in the UI if that's the conversation currently open
        if (senderEmail !== state.active) return;

        if (isTyping) {
            showPeerTyping(senderEmail);
        } else {
            hidePeerTyping();
        }
    }

    function showPeerTyping(senderEmail) {
        state.peerTypingFrom = senderEmail;
        els.peerTyping.hidden = false;
        els.peerSub.textContent = "Typing…";

        // Safety net: if a "stopped typing" event is ever lost (dropped
        // frame, tab closed abruptly), don't leave the dots on forever.
        clearTimeout(state.peerTypingSafetyTimer);
        state.peerTypingSafetyTimer = setTimeout(hidePeerTyping, 5000);
    }

    function hidePeerTyping() {
        clearTimeout(state.peerTypingSafetyTimer);
        state.peerTypingFrom = null;
        els.peerTyping.hidden = true;
        updatePeerStatus(); // restore "Online"/"Offline" text
    }

    // ── CHANGED: now calls loadHistory after rendering ──────────
    function openChat(email) {
        const key = email.toLowerCase();
        if (state.active === key) return; // already open — nothing to switch

        // Leaving the previous conversation: if I was mid-typing there,
        // tell the server I've stopped, and clear their "typing…" display.
        stopTypingNow();
        hidePeerTyping();

        state.active = key;

        const chat = ensureChat(key);
        chat.unread = 0;
        store.save();
        markReadOnServer(key);

        els.peerName.textContent = displayName(key);
        els.peerName.title = key;
        els.peerSub.textContent = key;
        els.peerAvatar.style.background = ramp(key);
        els.peerAvatar.querySelector("span").textContent = initials(key);

        els.sendBtn.disabled = !state.connected;
        els.input.focus();

        renderChatList();
        renderStream();
        refreshSmartReplies();
        updatePeerStatus();
        closeDrawer();

        // Pull server-side history and merge with any messages
        // already received live this session.
        loadHistory(key);
    }

    // ── NEW: fetch history from GET /api/chat/history?with=... ──
    async function loadHistory(peerEmail) {
        try {
            const res = await fetch(
                "/api/chat/history?with=" + encodeURIComponent(peerEmail),
                { headers: { Authorization: "Bearer " + state.token } }
            );

            if (!res.ok) return;

            const history = await res.json();
            if (!Array.isArray(history) || !history.length) return;

            const chat = ensureChat(peerEmail);

            // Deduplicate: skip messages already in the local list
            // (they arrived over the socket during this session).
            const known = new Set(
                chat.messages.map((m) => m.sentAt + "|" + m.content)
            );

            let added = 0;
            history.forEach((m) => {
                const key = (m.sentAt || "") + "|" + (m.content || "");
                if (!known.has(key)) {
                    chat.messages.push({
                        mine: (m.senderEmail || "").toLowerCase() === state.myEmail,
                        content: m.content,
                        sentAt: m.sentAt
                    });
                    added++;
                }
            });

            if (added > 0) {
                // Keep messages in chronological order after merging
                chat.messages.sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
                store.save();

                // Only re-render if the user is still looking at this conversation
                if (state.active === peerEmail.toLowerCase()) {
                    renderStream();
                    renderChatList();
                    refreshSmartReplies();
                }
            }
        } catch (err) {
            // Non-fatal: live session keeps working even if history fails
        }
    }

    /**
     * Tells the server this conversation has been seen, persisting the
     * read state instead of only zeroing the badge in the browser.
     */
    function markReadOnServer(peerEmail) {
        fetch("/api/chat/mark-read?with=" + encodeURIComponent(peerEmail), {
            method: "POST",
            headers: { Authorization: "Bearer " + state.token }
        }).catch(() => { /* non-fatal */ });
    }

    /**
     * Seeds sidebar unread badges from the server on connect/reconnect,
     * so counts survive a page refresh instead of resetting to zero.
     */
    function loadUnreadCounts() {
        fetch("/api/chat/unread-counts", {
            headers: { Authorization: "Bearer " + state.token }
        })
            .then((r) => (r.ok ? r.json() : {}))
            .then((counts) => {
                Object.keys(counts || {}).forEach((email) => {
                    const key = email.toLowerCase();
                    if (state.active === key) return; // already open = already read

                    const chat = ensureChat(key);
                    chat.unread = counts[email];
                });
                store.save();
                renderChatList();
            })
            .catch(() => { /* non-fatal — local counts still work */ });
    }

    /**
     * Populates the "New conversation" modal with every registered user,
     * so starting a chat doesn't require memorizing someone's exact email.
     */
    async function loadContacts() {
        if (!els.contactsList) return;

        els.contactsList.innerHTML = '<div class="empty-hint" style="padding:16px">Loading…</div>';

        try {
            const res = await fetch("/api/users/contacts", {
                headers: { Authorization: "Bearer " + state.token }
            });
            if (!res.ok) throw new Error("failed");

            const list = await res.json();

            if (!Array.isArray(list) || !list.length) {
                els.contactsList.innerHTML =
                    '<div class="empty-hint" style="padding:16px">No other registered users yet.</div>';
                return;
            }

            els.contactsList.innerHTML = list.map((u) => {
                const email = (u.email || "").toLowerCase();
                const name = u.name || displayName(email);
                return (
                    '<button type="button" class="contact-item" data-email="' + esc(email) + '">' +
                    '<div class="avatar avatar-sm" style="background:' + ramp(email) + '">' +
                    "<span>" + esc(initials(email)) + "</span>" +
                    "</div>" +
                    '<div class="meta">' +
                    '<div class="name">' + esc(name) + "</div>" +
                    '<div class="mail">' + esc(email) + "</div>" +
                    "</div>" +
                    "</button>"
                );
            }).join("");

            els.contactsList.querySelectorAll(".contact-item").forEach((btn) => {
                btn.addEventListener("click", () => {
                    els.newChatEmail.value = btn.dataset.email;
                });
            });
        } catch (err) {
            els.contactsList.innerHTML =
                '<div class="empty-hint" style="padding:16px">' +
                "Couldn't load users. You can still add someone by email below.</div>";
        }
    }

    function receive(msg) {
        const peer = (msg.senderEmail || "").toLowerCase() === state.myEmail
            ? (msg.receiverEmail || "").toLowerCase()
            : (msg.senderEmail || "").toLowerCase();

        if (!peer) return;

        const chat = ensureChat(peer);
        const mine = (msg.senderEmail || "").toLowerCase() === state.myEmail;

        chat.messages.push({
            mine: mine,
            content: msg.content,
            sentAt: msg.sentAt || new Date().toISOString()
        });

        if (!mine && state.active !== peer) chat.unread += 1;

        store.save();
        renderChatList();

        if (state.active === peer) {
            renderStream();
            if (!mine) refreshSmartReplies();
        } else if (!mine) {
            toast(displayName(peer) + " sent a message");
        }
    }

    function send() {
        const text = els.input.value.trim();

        if (!text) return;
        if (!state.active) { toast("Pick a conversation first", "bad"); return; }
        if (!state.connected) { toast("Not connected", "bad"); return; }

        state.client.publish({
            destination: "/app/chat.send",
            body: JSON.stringify({ receiverEmail: state.active, content: text })
        });

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
                email: email,
                unread: c.unread,
                preview: last ? (last.mine ? "You: " : "") + last.content : "No messages yet",
                at: last ? last.sentAt : null
            };
        });

        entries.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

        const visible = entries.filter((e) =>
            !filter || e.email.includes(filter) ||
            displayName(e.email).toLowerCase().includes(filter)
        );

        if (!visible.length) {
            els.chatList.innerHTML =
                '<div class="empty-hint">' +
                '<i class="fa-regular fa-comment-dots"></i>' +
                (filter
                    ? "Nothing matches that search."
                    : 'No conversations yet.<br>Tap <strong>New</strong> to add someone by email.') +
                "</div>";
            return;
        }

        els.chatList.innerHTML = visible.map((e) => {
            const active = e.email === state.active;
            return (
                '<button class="chat-item' + (active ? " active" : "") +
                (e.unread ? " unread" : "") + '" data-email="' + esc(e.email) + '">' +
                '<div class="avatar" style="background:' + ramp(e.email) + '">' +
                "<span>" + esc(initials(e.email)) + "</span>" +
                '<span class="status' + (state.onlineUsers.has(e.email) ? " on" : "") + '"></span>' +
                "</div>" +
                '<div class="meta">' +
                '<div class="row">' +
                '<span class="name">' + esc(displayName(e.email)) + "</span>" +
                '<span class="time">' + (e.at ? clockTime(e.at) : "") + "</span>" +
                "</div>" +
                '<div class="preview">' + esc(e.preview) + "</div>" +
                "</div>" +
                (e.unread ? '<span class="badge">' + e.unread + "</span>" : "") +
                "</button>"
            );
        }).join("");

        els.chatList.querySelectorAll(".chat-item").forEach((btn) => {
            btn.addEventListener("click", () => openChat(btn.dataset.email));
        });
    }

    function renderStream() {
        const chat = state.active ? state.chats[state.active] : null;

        if (!chat || !chat.messages.length) {
            els.stream.innerHTML = "";
            els.stream.appendChild(els.streamEmpty);
            els.streamEmpty.hidden = false;

            if (state.active) {
                els.streamEmpty.querySelector("h2").textContent =
                    "Say hello to " + displayName(state.active);
                els.streamEmpty.querySelector("p").textContent =
                    "No messages here yet. Whatever you send arrives instantly.";
            }
            return;
        }

        let html = "";
        let lastDay = null;

        chat.messages.forEach((m) => {
            const key = dayKey(m.sentAt);
            if (key && key !== lastDay) {
                html += '<div class="day-sep">' + esc(dayLabel(m.sentAt)) + "</div>";
                lastDay = key;
            }
            html +=
                '<div class="bubble ' + (m.mine ? "me" : "them") + '">' +
                '<span class="text">' + esc(m.content) + "</span>" +
                '<span class="stamp">' + clockTime(m.sentAt) + "</span>" +
                "</div>";
        });

        els.stream.innerHTML = html;
        els.stream.scrollTop = els.stream.scrollHeight;
    }

    /* ============================================================
       AI SMART REPLIES
       ============================================================ */
    /**
     * Calls the real Spring AI-backed endpoint. The backend reads the last
     * 10 messages of this conversation itself (conversation memory lives
     * server-side), so the client only needs to send who the peer is.
     */
    async function fetchSuggestions(peerEmail) {
        try {
            const res = await fetch("/api/ai/smart-replies", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer " + state.token
                },
                body: JSON.stringify({ peerEmail: peerEmail })
            });

            if (!res.ok) throw new Error("smart-replies request failed");

            const data = await res.json();
            if (Array.isArray(data.suggestions) && data.suggestions.length) {
                return data.suggestions;
            }
            throw new Error("empty suggestions");
        } catch (err) {
            // AI backend unreachable or erroring — keep the UI usable
            return ["Sounds good", "Tell me more", "Got it, thanks"];
        }
    }

    async function refreshSmartReplies() {
        const chat = state.active ? state.chats[state.active] : null;
        if (!chat || !chat.messages.length) {
            els.aiStrip.hidden = true;
            return;
        }

        const incoming = [...chat.messages].reverse().find((m) => !m.mine);
        if (!incoming) { els.aiStrip.hidden = true; return; }

        els.aiStrip.hidden = false;
        els.chipRow.innerHTML =
            '<button class="chip loading">Thinking…</button>' +
            '<button class="chip loading">Thinking…</button>';

        els.aiTyping.hidden = false;

        const suggestions = await fetchSuggestions(state.active);

        els.aiTyping.hidden = true;
        els.chipRow.innerHTML = suggestions
            .map((s) => '<button class="chip">' + esc(s) + "</button>")
            .join("");

        els.chipRow.querySelectorAll(".chip").forEach((chip) => {
            chip.addEventListener("click", () => {
                els.input.value = chip.textContent;
                autoGrow();
                els.input.focus();
            });
        });
    }

    /* ============================================================
       COMPOSER BEHAVIOUR
       ============================================================ */
    function autoGrow() {
        els.input.style.height = "auto";
        els.input.style.height = Math.min(els.input.scrollHeight, 132) + "px";
    }

    const EMOJI = ["😀","😄","😅","😂","🙂","😉","😍","😘","🤔","🤗","😎","🥳",
        "😴","😢","😭","😡","👍","👏","🙏","💪","🔥","✨","🎉","❤️",
        "💜","✅","❌","⚡","🚀","💡","📌","☕"];

    function buildEmojiTray() {
        els.emojiTray.innerHTML = EMOJI
            .map((e) => "<button>" + e + "</button>")
            .join("");

        els.emojiTray.querySelectorAll("button").forEach((b) => {
            b.addEventListener("click", () => {
                els.input.value += b.textContent;
                autoGrow();
                els.input.focus();
            });
        });
    }

    /* ---------- drawer ---------- */
    function openDrawer() {
        els.sidebar.classList.add("open");
        els.scrim.hidden = false;
    }
    function closeDrawer() {
        els.sidebar.classList.remove("open");
        els.scrim.hidden = true;
    }

    /* ============================================================
       EVENTS
       ============================================================ */
    els.loginBtn.addEventListener("click", login);
    els.tokenLoginBtn.addEventListener("click", loginWithToken);

    [els.loginEmail, els.loginPassword].forEach((f) =>
        f.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); })
    );

    els.tokenToggle.addEventListener("click", () => {
        els.tokenBlock.hidden = !els.tokenBlock.hidden;
        els.tokenToggle.textContent = els.tokenBlock.hidden
            ? "Paste it instead" : "Use email and password";
    });

    els.signOutBtn.addEventListener("click", signOut);

    els.sendBtn.addEventListener("click", send);

    els.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });

    els.input.addEventListener("input", () => {
        autoGrow();
        notifyTyping();
    });

    els.searchInput.addEventListener("input", renderChatList);

    els.emojiBtn.addEventListener("click", () => {
        els.emojiTray.hidden = !els.emojiTray.hidden;
    });

    els.attachBtn.addEventListener("click", () =>
        toast("File sharing is not part of the backend yet", "bad")
    );

    els.aiBtn.addEventListener("click", () => {
        if (!state.active) { toast("Open a conversation first", "bad"); return; }
        refreshSmartReplies();
    });

    els.openDrawer.addEventListener("click", openDrawer);
    els.closeDrawer.addEventListener("click", closeDrawer);
    els.scrim.addEventListener("click", closeDrawer);

    /* new conversation modal */
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

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            els.newChatError.textContent = "Enter a valid email address.";
            els.newChatError.hidden = false;
            return;
        }
        if (email === state.myEmail) {
            els.newChatError.textContent = "That's your own address.";
            els.newChatError.hidden = false;
            return;
        }

        ensureChat(email);
        store.save();
        els.newChatModal.hidden = true;
        openChat(email);
    });

    els.newChatEmail.addEventListener("keydown", (e) => {
        if (e.key === "Enter") els.newChatConfirm.click();
    });

    els.clearChatBtn.addEventListener("click", () => {
        if (!state.active) return;
        state.chats[state.active].messages = [];
        store.save();
        renderStream();
        renderChatList();
        els.aiStrip.hidden = true;
        toast("Conversation cleared on this device");
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            els.newChatModal.hidden = true;
            els.emojiTray.hidden = true;
            closeDrawer();
        }
    });

    /* ============================================================
       BOOT
       ============================================================ */
    buildEmojiTray();

    (function restore() {
        let token = null, email = null;
        try {
            token = localStorage.getItem("aichathub:token");
            email = localStorage.getItem("aichathub:email");
        } catch (e) { /* ignore */ }

        if (token && email) startSession(token, email);
    })();
})();