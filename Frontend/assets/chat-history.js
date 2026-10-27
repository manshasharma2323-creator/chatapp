/* ============================================================
   Chat History page — every past conversation, built entirely from
   your existing backend APIs (no new endpoint needed):
     GET /api/chat/conversations   -> every peer + latest message + unread count
     GET /api/users/contacts       -> display names for those peers
   A conversation only appears here once it has at least one message.
   ============================================================ */
(function () {
    "use strict";

    const A = window.App;
    const session = A.initShell("chatHistory");
    if (!session) return;

    const $ = (id) => document.getElementById(id);
    const els = { list: $("historyList"), search: $("searchInput"), count: $("historyCount") };

    let conversations = [];

    function render() {
        const filter = els.search.value.trim().toLowerCase();
        const visible = conversations.filter((c) =>
            !filter ||
            c.name.toLowerCase().includes(filter) ||
            c.email.toLowerCase().includes(filter) ||
            c.preview.toLowerCase().includes(filter)
        );

        els.count.textContent = visible.length + (visible.length === 1 ? " conversation" : " conversations");

        if (!visible.length) {
            els.list.innerHTML = conversations.length
                ? A.emptyState("fa-regular fa-face-frown", "Nothing matches that search.")
                : emptyStateHtml();
            return;
        }

        els.list.innerHTML = visible.map((c, i) => (
            '<div class="history-item" style="animation-delay:' + Math.min(i * 0.03, 0.3) + 's">' +
            '<div class="avatar" style="background:' + A.ramp(c.email) + '"><span>' + A.esc(A.initials(c.email)) + "</span></div>" +
            '<div class="meta">' +
            '<div class="row"><span class="name">' + A.esc(c.name) + '</span><span class="when">' + A.esc(A.relativeTime(c.lastAt)) + "</span></div>" +
            '<div class="preview">' + A.esc(c.preview) + '</div>' +
            '<div class="mail">' + A.esc(c.email) + "</div>" +
            "</div>" +
            (c.unread ? '<span class="badge">' + c.unread + "</span>" : "") +
            '<button class="history-open" data-email="' + A.esc(c.email) + '"><i class="fa-solid fa-arrow-right"></i> Open</button>' +
            "</div>"
        )).join("");

        els.list.querySelectorAll(".history-open").forEach((btn) => {
            btn.addEventListener("click", () => { location.href = "messages.html?with=" + encodeURIComponent(btn.dataset.email); });
        });
    }

    function emptyStateHtml() {
        return A.emptyState("fa-regular fa-clock", "No conversations yet.<br>Start one from " +
            '<a class="link-btn" href="contacts.html">Contacts</a>.');
    }

    async function load() {
        try {
            // One request for every conversation (latest message + unread
            // count each) instead of fetching the full history of every
            // registered user, which grew linearly with the user base.
            const [contactsRes, convRes] = await Promise.all([
                A.authFetch("/api/users/contacts"),
                A.authFetch("/api/chat/conversations")
            ]);
            if (!convRes.ok) throw new Error("conversations request failed");

            const contacts = contactsRes.ok ? await contactsRes.json() : [];
            const list = await convRes.json();
            const names = {};
            (contacts || []).forEach((u) => { names[(u.email || "").toLowerCase()] = u.name; });

            conversations = (list || []).map((c) => {
                const email = (c.peerEmail || "").toLowerCase();
                return {
                    email,
                    name: names[email] || A.displayName(email),
                    preview: (c.lastMessageMine ? "You: " : "") + (c.lastMessage || ""),
                    lastAt: c.lastMessageAt,
                    unread: c.unreadCount || 0
                };
            }).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

            render();
        } catch (err) {
            els.list.innerHTML = A.emptyState("fa-solid fa-triangle-exclamation", "Couldn't load chat history. Try refreshing.");
        }
    }

    els.search.addEventListener("input", render);
    load();
})();
