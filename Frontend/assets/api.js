/* ============================================================
   AI Chat Hub — shared utilities
   Loaded by every page before its own script. Owns: backend
   location, session storage, authenticated fetch, formatting
   helpers, toasts, and the shared topbar/nav shell.
   Backend contract (unchanged from the original single-page app):
     POST /api/users/register       -> { name, email, password }
     POST /api/users/login          -> JWT (string or {token:...})
     GET  /api/users/contacts       -> [{ name, email }]
     GET  /api/chat/history?with=.. -> [ChatMessageDto]
     GET  /api/chat/online          -> [{ email, online }]
     GET  /api/chat/unread-counts   -> { email: count }
     POST /api/chat/mark-read?with=..
     POST /api/ai/smart-replies     -> { peerEmail } -> { suggestions:[...] }
     POST /api/ai/assistant         -> { message, history } -> { reply }
     WS   /ws (SockJS + STOMP, Authorization: Bearer <jwt>)
   ============================================================ */

window.App = (function () {
    "use strict";

    const API_BASE = window.CHATAPP_API_BASE || "http://localhost:8080";

    /* ---------- session ---------- */
    const SK = { token: "aichathub:token", email: "aichathub:email" };

    function getToken() { try { return localStorage.getItem(SK.token); } catch (e) { return null; } }
    function getEmail() { try { return localStorage.getItem(SK.email); } catch (e) { return null; } }

    function saveSession(token, email) {
        try {
            localStorage.setItem(SK.token, token);
            localStorage.setItem(SK.email, email.toLowerCase());
        } catch (e) { /* ignore */ }
    }

    function clearSession() {
        try {
            localStorage.removeItem(SK.token);
            localStorage.removeItem(SK.email);
        } catch (e) { /* ignore */ }
    }

    /** Redirects to login.html if there's no session; returns {token,email} otherwise. */
    function requireSession() {
        const token = getToken(), email = getEmail();
        if (!token || !email) {
            location.href = "login.html";
            return null;
        }
        return { token, email };
    }

    function signOut() {
        clearSession();
        location.href = "login.html";
    }

    /* ---------- fetch ---------- */
    function authHeaders(extra) {
        return Object.assign({ Authorization: "Bearer " + getToken() }, extra || {});
    }

    async function authFetch(path, options) {
        options = options || {};
        const headers = Object.assign({}, options.headers || {});
        headers.Authorization = "Bearer " + getToken();
        const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
        if (res.status === 401 || res.status === 403) {
            // token missing/expired/rejected — bounce to sign-in
            clearSession();
            location.href = "login.html";
            throw new Error("unauthenticated");
        }
        return res;
    }

    /* ---------- formatting helpers ---------- */
    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
            { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
        ));
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

    // Every avatar stays inside the yellow/amber family — only the depth
    // of the gradient varies per person, so the palette never drifts off
    // white + yellow while conversations still stay visually distinct.
    const AVATAR_RAMP = [
        "linear-gradient(135deg,#ffe066,#f6c100)",
        "linear-gradient(135deg,#ffd23f,#e0a300)",
        "linear-gradient(135deg,#fff0bf,#e0ac00)",
        "linear-gradient(135deg,#f6c100,#b98900)",
        "linear-gradient(135deg,#ffdd66,#c98f00)"
    ];
    function ramp(email) {
        let h = 0;
        const s = email || "";
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return AVATAR_RAMP[h % AVATAR_RAMP.length];
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
        const today = new Date(), yest = new Date();
        yest.setDate(today.getDate() - 1);
        if (d.toDateString() === today.toDateString()) return "Today";
        if (d.toDateString() === yest.toDateString()) return "Yesterday";
        return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
    }

    function relativeTime(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "";
        const diffMs = Date.now() - d.getTime();
        const min = Math.round(diffMs / 60000);
        if (min < 1) return "Just now";
        if (min < 60) return min + "m ago";
        const hr = Math.round(min / 60);
        if (hr < 24) return hr + "h ago";
        const day = Math.round(hr / 24);
        if (day < 7) return day + "d ago";
        return dayLabel(iso);
    }

    /* ---------- local chat cache (per signed-in user) ----------
       Same storage shape the original single-page app used, so any
       conversations already cached in someone's browser keep working:
       aichathub:<email> -> { [peerEmail]: { messages: [...], unread } } */
    function chatStoreKey(email) { return "aichathub:" + email; }

    function loadChats(email) {
        try {
            const raw = localStorage.getItem(chatStoreKey(email));
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }

    function saveChats(email, chats) {
        try { localStorage.setItem(chatStoreKey(email), JSON.stringify(chats)); } catch (e) { /* ignore */ }
    }

    /* ---------- toasts ---------- */
    function ensureToastArea() {
        let area = document.getElementById("toastArea");
        if (!area) {
            area = document.createElement("div");
            area.className = "toast-area";
            area.id = "toastArea";
            document.body.appendChild(area);
        }
        return area;
    }

    function toast(message, kind) {
        const area = ensureToastArea();
        const el = document.createElement("div");
        el.className = "toast " + (kind || "ok");
        el.innerHTML =
            '<i class="fa-solid ' + (kind === "bad" ? "fa-circle-exclamation" : "fa-circle-check") + '"></i>' +
            "<span>" + esc(message) + "</span>";
        area.appendChild(el);
        setTimeout(() => {
            el.style.transition = "opacity .3s, transform .3s";
            el.style.opacity = "0";
            el.style.transform = "translateY(8px)";
            setTimeout(() => el.remove(), 320);
        }, 2600);
    }

    /* ---------- shared topbar/nav shell ----------
       Every authenticated page has <div id="shell"></div> right after
       <body>; this injects the topbar + mobile nav + aurora background
       and wires sign-out / mobile menu, so nav markup lives in one
       place instead of six duplicated copies. */
    const NAV_ITEMS = [
        { key: "dashboard", href: "dashboard.html", icon: "fa-grid-2", label: "Dashboard" },
        { key: "messages", href: "messages.html", icon: "fa-comments", label: "Messages" },
        { key: "assistant", href: "ai-assistant.html", icon: "fa-wand-magic-sparkles", label: "AI Assistant" },
        { key: "contacts", href: "contacts.html", icon: "fa-address-book", label: "Contacts" }
    ];

    function initShell(active) {
        const session = requireSession();
        if (!session) return null;

        const shell = document.getElementById("shell");
        if (!shell) return session;

        const email = session.email;

        const navLinks = (cls) => NAV_ITEMS.map((item) =>
            '<a class="' + (item.key === active ? "active" : "") + '" href="' + item.href + '">' +
            '<i class="fa-solid ' + item.icon + '"></i><span>' + item.label + "</span>" +
            '<span class="badge-dot" id="navBadge_' + item.key + '" hidden></span>' +
            "</a>"
        ).join("");

        shell.innerHTML =
            '<div class="aurora" aria-hidden="true"><span class="a1"></span><span class="a2"></span><span class="a3"></span></div>' +
            '<header class="topbar">' +
            '<a class="topbar-brand" href="dashboard.html">' +
            '<div class="logo"><i class="fa-solid fa-bolt"></i></div>' +
            '<div><div class="brand-name">AI Chat Hub</div><div class="brand-tag">Real-time messaging</div></div>' +
            "</a>" +
            '<nav class="topbar-nav">' + navLinks() + "</nav>" +
            '<div class="topbar-spacer"></div>' +
            '<div class="topbar-user">' +
            '<div><div class="me-name">' + esc(displayName(email)) + '</div><div class="me-mail">' + esc(email) + "</div></div>" +
            '<div class="avatar avatar-sm" style="background:' + ramp(email) + '"><span>' + esc(initials(email)) + "</span></div>" +
            '<button class="icon-btn" id="shellSignOut" title="Sign out" aria-label="Sign out"><i class="fa-solid fa-right-from-bracket"></i></button>' +
            '<button class="icon-btn topbar-burger" id="shellBurger" aria-label="Menu"><i class="fa-solid fa-bars"></i></button>' +
            "</div>" +
            "</header>" +
            '<nav class="topbar-mobile-nav" id="shellMobileNav">' + navLinks() + "</nav>";

        document.getElementById("shellSignOut").addEventListener("click", signOut);

        const burger = document.getElementById("shellBurger");
        const mobileNav = document.getElementById("shellMobileNav");
        if (burger && mobileNav) {
            burger.addEventListener("click", () => {
                const open = mobileNav.style.display === "flex";
                mobileNav.style.display = open ? "none" : "flex";
                burger.querySelector("i").className = open ? "fa-solid fa-bars" : "fa-solid fa-xmark";
            });
        }

        // Real unread-count badge on the Messages nav item — same server
        // endpoint the messages page itself uses.
        authFetch("/api/chat/unread-counts")
            .then((r) => (r.ok ? r.json() : {}))
            .then((counts) => {
                const total = Object.values(counts || {}).reduce((a, b) => a + b, 0);
                setNavBadge("messages", total);
            })
            .catch(() => { /* non-fatal */ });

        return session;
    }

    function setNavBadge(key, count) {
        document.querySelectorAll('[id="navBadge_' + key + '"]').forEach((el) => {
            if (count > 0) { el.hidden = false; el.textContent = count > 99 ? "99+" : String(count); }
            else { el.hidden = true; }
        });
    }

    return {
        API_BASE,
        getToken, getEmail, saveSession, clearSession, requireSession, signOut,
        authFetch, authHeaders,
        esc, initials, displayName, ramp, clockTime, dayKey, dayLabel, relativeTime,
        loadChats, saveChats,
        toast,
        initShell, setNavBadge
    };
})();
