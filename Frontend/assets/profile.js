/* ============================================================
   Profile page — real data from the backend:
     GET   /api/users/me            -> { name, email }
     PATCH /api/users/me            -> update name and/or password
     GET   /api/chat/online         -> is the current user connected right now
     GET   /api/users/contacts      -> registered-users count
   ============================================================ */
(function () {
    "use strict";

    const A = window.App;
    const session = A.initShell("profile");
    if (!session) return;

    const $ = (id) => document.getElementById(id);
    const els = {
        avatar: $("profileAvatar"), name: $("profileName"), mail: $("profileMail"), presence: $("profilePresence"),
        saveOk: $("profileSaveOk"), error: $("profileError"),
        nameInput: $("profileNameInput"), saveNameBtn: $("saveNameBtn"),
        currentPw: $("currentPassword"), newPw: $("newPassword"), confirmPw: $("confirmNewPassword"),
        savePasswordBtn: $("savePasswordBtn"),
        pwToggle1: $("pwToggle1"), pwToggle2: $("pwToggle2"), pwToggle3: $("pwToggle3"),
        infoEmail: $("infoEmail"), infoPresence: $("infoPresence"),
        infoConversations: $("infoConversations"), infoContacts: $("infoContacts")
    };

    function showOk(msg) { els.saveOk.textContent = msg; els.saveOk.hidden = false; els.error.hidden = true; setTimeout(() => { els.saveOk.hidden = true; }, 3200); }
    function showErr(msg) { els.error.textContent = msg; els.error.hidden = false; els.saveOk.hidden = true; }

    function togglePw(input, btn) {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.innerHTML = show ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
    }
    els.pwToggle1.addEventListener("click", () => togglePw(els.currentPw, els.pwToggle1));
    els.pwToggle2.addEventListener("click", () => togglePw(els.newPw, els.pwToggle2));
    els.pwToggle3.addEventListener("click", () => togglePw(els.confirmPw, els.pwToggle3));

    function paint(name, email) {
        els.avatar.style.background = A.ramp(email);
        els.avatar.innerHTML = "<span>" + A.esc(A.initials(email)) + "</span>"; // replaces the loading skeleton, not just its text
        els.name.textContent = name;
        els.mail.textContent = email;
        els.nameInput.value = name;
        els.infoEmail.textContent = email;
    }

    // Load the real profile first; fall back to the email-derived display
    // name (same heuristic used everywhere else) only if the call fails.
    A.authFetch("/api/users/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
            if (data && data.email) paint(data.name || A.displayName(data.email), data.email);
            else paint(A.displayName(session.email), session.email);
        })
        .catch(() => paint(A.displayName(session.email), session.email));

    A.authFetch("/api/chat/online")
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => {
            const isOnline = (list || []).some((p) => (p.email || "").toLowerCase() === session.email);
            const label = isOnline ? "Online now" : "Offline";
            els.presence.className = "presence-pill" + (isOnline ? " on" : "");
            els.presence.innerHTML = '<span class="dot"></span>' + label;
            els.infoPresence.textContent = label;
        })
        .catch(() => { els.presence.innerHTML = '<span class="dot"></span>Unknown'; });

    const chats = A.loadChats(session.email);
    els.infoConversations.textContent = Object.values(chats).filter((c) => (c.messages || []).length).length;

    A.authFetch("/api/users/contacts")
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => { els.infoContacts.textContent = (list || []).length; })
        .catch(() => { els.infoContacts.textContent = "—"; });

    els.saveNameBtn.addEventListener("click", async () => {
        const name = els.nameInput.value.trim();
        if (!name) { showErr("Name can't be empty."); return; }

        els.saveNameBtn.disabled = true;
        try {
            const res = await A.authFetch("/api/users/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) { showErr(body.message || "Couldn't save your name."); return; }
            els.name.textContent = body.name || name;
            showOk("Name updated.");
        } catch (err) {
            showErr("Could not reach the server.");
        } finally {
            els.saveNameBtn.disabled = false;
        }
    });

    els.savePasswordBtn.addEventListener("click", async () => {
        const currentPassword = els.currentPw.value;
        const newPassword = els.newPw.value;
        const confirm = els.confirmPw.value;

        if (!currentPassword) { showErr("Enter your current password."); return; }
        if (newPassword.length < 6) { showErr("New password must be at least 6 characters."); return; }
        if (newPassword !== confirm) { showErr("New passwords don't match."); return; }

        els.savePasswordBtn.disabled = true;
        try {
            const res = await A.authFetch("/api/users/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) { showErr(body.message || "Couldn't update your password."); return; }
            els.currentPw.value = ""; els.newPw.value = ""; els.confirmPw.value = "";
            showOk("Password updated.");
        } catch (err) {
            showErr("Could not reach the server.");
        } finally {
            els.savePasswordBtn.disabled = false;
        }
    });
})();
