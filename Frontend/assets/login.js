(function () {
    "use strict";

    const A = window.App;
    const $ = (id) => document.getElementById(id);

    const els = {
        email: $("loginEmail"),
        password: $("loginPassword"),
        pwToggle: $("pwToggle"),
        loginBtn: $("loginBtn"),
        authError: $("authError"),
        forgotBtn: $("forgotBtn"),
        tokenToggle: $("tokenToggle"),
        tokenBlock: $("tokenBlock"),
        manualToken: $("manualToken"),
        manualEmail: $("manualEmail"),
        tokenLoginBtn: $("tokenLoginBtn")
    };

    // Already signed in? Skip straight past the login screen.
    if (A.getToken() && A.getEmail()) {
        location.href = "dashboard.html";
        return;
    }

    function showError(msg) {
        els.authError.textContent = msg;
        els.authError.hidden = false;
    }
    function hideError() { els.authError.hidden = true; }

    function extractToken(body) {
        if (!body) return null;
        if (typeof body === "string") {
            const trimmed = body.trim().replace(/^"|"$/g, "");
            return trimmed.split(".").length === 3 ? trimmed : null;
        }
        const direct = body.token || body.jwt || body.accessToken || body.access_token || body.jwtToken;
        if (typeof direct === "string") return direct;
        if (body.data) return extractToken(body.data);
        return null;
    }

    async function login() {
        const email = els.email.value.trim();
        const password = els.password.value;

        if (!email || !password) { showError("Enter your email and password."); return; }

        hideError();
        els.loginBtn.disabled = true;
        els.loginBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Signing in';

        try {
            const res = await fetch(A.API_BASE + "/api/users/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });

            const raw = await res.text();
            let parsed = raw;
            try { parsed = JSON.parse(raw); } catch (e) { /* plain text token */ }

            if (!res.ok) {
                showError((parsed && parsed.message) || "Sign in failed (" + res.status + "). Check your email and password.");
                return;
            }

            const token = extractToken(parsed);
            if (!token) {
                showError("Signed in, but no JWT was found in the response. Use \"Paste it instead\" below.");
                return;
            }

            A.saveSession(token, email);
            A.toast("Welcome back, " + A.displayName(email));
            location.href = "dashboard.html";
        } catch (err) {
            showError("Could not reach the server. Is the backend running?");
        } finally {
            els.loginBtn.disabled = false;
            els.loginBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i>&nbsp; Sign in';
        }
    }

    function loginWithToken() {
        const token = els.manualToken.value.trim();
        const email = els.manualEmail.value.trim();
        if (!token || !email) { showError("Paste both the token and your email."); return; }
        A.saveSession(token, email);
        location.href = "dashboard.html";
    }

    els.loginBtn.addEventListener("click", login);
    [els.email, els.password].forEach((f) => f.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); }));

    els.pwToggle.addEventListener("click", () => {
        const show = els.password.type === "password";
        els.password.type = show ? "text" : "password";
        els.pwToggle.innerHTML = show ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
    });

    els.forgotBtn.addEventListener("click", () => {
        A.toast("Password reset isn't available yet — contact an admin to reset your password.", "bad");
    });

    els.tokenToggle.addEventListener("click", () => {
        els.tokenBlock.hidden = !els.tokenBlock.hidden;
        els.tokenToggle.textContent = els.tokenBlock.hidden ? "Have a JWT instead? Paste it" : "Use email and password instead";
    });
    els.tokenLoginBtn.addEventListener("click", loginWithToken);

    // Prefill from a successful registration redirect (?email=...)
    const params = new URLSearchParams(location.search);
    if (params.get("email")) els.email.value = params.get("email");
    if (params.get("registered")) A.toast("Account created! Sign in to continue.");
})();
