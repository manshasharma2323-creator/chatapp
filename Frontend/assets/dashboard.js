(function () {
    "use strict";

    const A = window.App;
    const session = A.initShell("dashboard");
    if (!session) return;

    const $ = (id) => document.getElementById(id);
    const email = session.email;

    $("welcomeHeading").textContent = "Welcome back, " + A.displayName(email).split(" ")[0];

    /* ---------- conversations + recent activity (local cache, same
       source of truth the Messages page reads/writes) ---------- */
    const chats = A.loadChats(email);
    const entries = Object.keys(chats)
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
        .filter((e) => e.at); // only conversations that actually have a message

    entries.sort((a, b) => new Date(b.at) - new Date(a.at));

    $("statConversations").textContent = entries.length;

    const activityList = $("activityList");
    if (!entries.length) {
        activityList.innerHTML = A.emptyState(
            "fa-regular fa-comment-dots",
            "No conversations on this device yet.<br>Start one from Contacts or Messages."
        );
    } else {
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
