(function () {
    "use strict";

    const A = window.App;
    const session = A.initShell("contacts");
    if (!session) return;

    const $ = (id) => document.getElementById(id);
    const els = { grid: $("contactsGrid"), search: $("searchInput"), count: $("contactsCount") };

    let contacts = [];
    let online = new Set();

    function render() {
        const filter = els.search.value.trim().toLowerCase();
        const visible = contacts.filter((c) =>
            !filter || c.name.toLowerCase().includes(filter) || c.email.toLowerCase().includes(filter)
        );

        els.count.textContent = visible.length + (visible.length === 1 ? " person" : " people");

        if (!visible.length) {
            els.grid.innerHTML = '<div class="empty-hint" style="grid-column:1/-1"><i class="fa-regular fa-face-frown"></i>No one matches that search.</div>';
            return;
        }

        els.grid.innerHTML = visible.map((c) => {
            const isOn = online.has(c.email);
            return (
                '<div class="contact-card">' +
                '<div class="contact-card-top">' +
                '<div class="avatar" style="background:' + A.ramp(c.email) + '"><span>' + A.esc(A.initials(c.email)) + "</span></div>" +
                '<div class="meta"><div class="name">' + A.esc(c.name) + '</div><div class="mail">' + A.esc(c.email) + "</div></div>" +
                "</div>" +
                '<span class="presence-pill' + (isOn ? " on" : "") + '"><span class="dot"></span>' + (isOn ? "Online" : "Offline") + "</span>" +
                '<button class="start-btn" data-email="' + A.esc(c.email) + '"><i class="fa-solid fa-paper-plane"></i> Start chat</button>' +
                "</div>"
            );
        }).join("");

        els.grid.querySelectorAll(".start-btn").forEach((btn) => {
            btn.addEventListener("click", () => { location.href = "messages.html?with=" + encodeURIComponent(btn.dataset.email); });
        });
    }

    function load() {
        Promise.all([
            A.authFetch("/api/users/contacts").then((r) => (r.ok ? r.json() : [])),
            A.authFetch("/api/chat/online").then((r) => (r.ok ? r.json() : []))
        ]).then(([contactList, onlineList]) => {
            contacts = (contactList || []).map((u) => ({
                name: u.name || A.displayName((u.email || "").toLowerCase()),
                email: (u.email || "").toLowerCase()
            }));
            online = new Set((onlineList || []).map((p) => (p.email || "").toLowerCase()));

            if (!contacts.length) {
                els.grid.innerHTML = '<div class="empty-hint" style="grid-column:1/-1"><i class="fa-regular fa-address-book"></i>No other registered users yet.</div>';
                els.count.textContent = "";
                return;
            }
            render();
        }).catch(() => {
            els.grid.innerHTML = '<div class="empty-hint" style="grid-column:1/-1"><i class="fa-solid fa-triangle-exclamation"></i>Couldn\'t load contacts. Try refreshing.</div>';
        });
    }

    els.search.addEventListener("input", render);
    load();
})();
