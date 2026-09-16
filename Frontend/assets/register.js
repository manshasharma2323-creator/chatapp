(function () {
    "use strict";

    const A = window.App;
    const $ = (id) => document.getElementById(id);

    const els = {
        name: $("regName"),
        nameField: $("nameField"),
        email: $("regEmail"),
        emailField: $("emailField"),
        password: $("regPassword"),
        passwordField: $("passwordField"),
        confirm: $("regConfirm"),
        confirmField: $("confirmField"),
        pwToggle1: $("pwToggle1"),
        pwToggle2: $("pwToggle2"),
        registerBtn: $("registerBtn"),
        authError: $("authError")
    };

    if (A.getToken() && A.getEmail()) {
        location.href = "dashboard.html";
        return;
    }

    function showError(msg) {
        els.authError.textContent = msg;
        els.authError.hidden = false;
    }
    function hideError() { els.authError.hidden = true; }

    function clearInvalid() {
        [els.nameField, els.emailField, els.passwordField, els.confirmField].forEach((f) => f.classList.remove("invalid"));
    }

    function validate() {
        clearInvalid();
        const name = els.name.value.trim();
        const email = els.email.value.trim();
        const password = els.password.value;
        const confirm = els.confirm.value;

        if (!name) { els.nameField.classList.add("invalid"); return "Enter your full name."; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { els.emailField.classList.add("invalid"); return "Enter a valid email address."; }
        if (password.length < 6) { els.passwordField.classList.add("invalid"); return "Password must be at least 6 characters."; }
        if (password !== confirm) { els.confirmField.classList.add("invalid"); return "Passwords don't match."; }
        return null;
    }

    function togglePw(input, btn) {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.innerHTML = show ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
    }
    els.pwToggle1.addEventListener("click", () => togglePw(els.password, els.pwToggle1));
    els.pwToggle2.addEventListener("click", () => togglePw(els.confirm, els.pwToggle2));

    async function register() {
        const err = validate();
        if (err) { showError(err); return; }
        hideError();

        const name = els.name.value.trim();
        const email = els.email.value.trim();
        const password = els.password.value;

        els.registerBtn.disabled = true;
        els.registerBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>&nbsp; Creating account';

        try {
            const res = await fetch(A.API_BASE + "/api/users/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password })
            });

            const raw = await res.text();
            let parsed = raw;
            try { parsed = JSON.parse(raw); } catch (e) { /* not JSON */ }

            if (!res.ok) {
                showError((parsed && parsed.message) || "Registration failed (" + res.status + "). That email may already be in use.");
                return;
            }

            location.href = "login.html?registered=1&email=" + encodeURIComponent(email);
        } catch (err2) {
            showError("Could not reach the server. Is the backend running?");
        } finally {
            els.registerBtn.disabled = false;
            els.registerBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i>&nbsp; Create account';
        }
    }

    els.registerBtn.addEventListener("click", register);
    [els.name, els.email, els.password, els.confirm].forEach((f) =>
        f.addEventListener("keydown", (e) => { if (e.key === "Enter") register(); })
    );
})();
