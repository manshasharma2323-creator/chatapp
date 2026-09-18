(function () {
    "use strict";

    const A = window.App;
    const session = A.initShell("dashboard");
    if (!session) return;

    const $ = (id) => document.getElementById(id);
    const email = session.email;

    $("welcomeHeading").textContent = "Welcome back, " + A.displayName(email).split(" ")[0];

    /* ---------- conversations + recent activity ----------
       Local cache (same source of truth the Messages page reads/writes)
       seeded with anything from the server this device hasn't cached yet,
       so a fresh browser/device still shows real recent activity. */
    const chats = A.loadChats(email);

    function buildEntries() {
        return Object.keys(chats)
            .map((peer) => {
                const c = chats[peer] || {};
                const messages = c.messages || [];
                const last = messages[messages.length - 1];
                return {
                    peer,
                    unread: c.unread || 0,
                    preview: last ? (last.mine ? "You: " : "") + last.content : "No messages yet",
                    at: last ? last.sentAt : null
                };
            })
            .filter((e) => e.at) // only conversations that actually have a message
            .sort((a, b) => new Date(b.at) - new Date(a.at));
    }

    function renderActivity(entries) {
        $("statConversations").textContent = entries.length;

        const activityList = $("activityList");
        if (!entries.length) {
            activityList.innerHTML = A.emptyState(
                "fa-regular fa-comment-dots",
                "No conversations yet.<br>Start one from Contacts or Messages."
            );
            return;
        }

        activityList.innerHTML = entries.slice(0, 6).map((e) => (
            '<button class="activity-item" data-peer="' + A.esc(e.peer) + '">' +
            '<div class="avatar avatar-sm" style="background:' + A.ramp(e.peer) + '"><span>' + A.esc(A.initials(e.peer)) + "</span></div>" +
            '<div class="meta"><div class="name">' + A.esc(A.displayName(e.peer)) + '</div><div class="preview">' + A.esc(e.preview) + "</div></div>" +
            '<div class="time">' + A.esc(A.relativeTime(e.at)) + "</div>" +
            "</button>"
        )).join("");

        activityList.querySelectorAll(".activity-item").forEach((btn) => {
            btn.addEventListener("click", () => {
                location.href = "messages.html?with=" + encodeURIComponent(btn.dataset.peer);
            });
        });
    }

    renderActivity(buildEntries());

    A.authFetch("/api/chat/conversations")
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => {
            let changed = false;
            (list || []).forEach((c) => {
                const peer = (c.peerEmail || "").toLowerCase();
                if (!peer || chats[peer]) return; // already have this peer's real history locally
                chats[peer] = { messages: [{ mine: !!c.lastMessageMine, content: c.lastMessage, sentAt: c.lastMessageAt }], unread: c.unreadCount || 0 };
                changed = true;
            });
            if (changed) {
                A.saveChats(email, chats);
                renderActivity(buildEntries());
            }
        })
        .catch(() => {});

    /* ---------- live stats from the backend ---------- */
    A.authFetch("/api/chat/unread-counts")
        .then((r) => (r.ok ? r.json() : {}))
        .then((counts) => {
            const total = Object.values(counts || {}).reduce((a, b) => a + b, 0);
            $("statUnread").textContent = total;
        })
        .catch(() => { $("statUnread").textContent = "—"; });

    A.authFetch("/api/chat/online")
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => { $("statOnline").textContent = (list || []).length; })
        .catch(() => { $("statOnline").textContent = "—"; });

    A.authFetch("/api/users/contacts")
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => { $("statContacts").textContent = (list || []).length; })
        .catch(() => { $("statContacts").textContent = "—"; });

    $("qaNewChat").addEventListener("click", () => { location.href = "contacts.html"; });
})();
