/* ============================================================
   Settings page.
   Account settings + Security information reflect real backend
   state (JWT auth, bcrypt password hashing, the signed-in email).
   Notification preferences and Chat settings are local-only —
   there is no backend concept of either, so they're stored in
   localStorage (assets/api.js loadPrefs/setPref) and clearly
   labelled "Saved on this device" rather than presented as if
   they were synced account settings.
   ============================================================ */
(function () {
    "use strict";

    const A = window.App;
    const session = A.initShell("settings");
    if (!session) return;

    const $ = (id) => document.getElementById(id);
    $("settingsEmail").textContent = session.email;

    const TOGGLES = [
        { id: "toggleDesktop", pref: "notifyDesktop", onEnable: enableDesktopNotifications },
        { id: "toggleTeaser", pref: "notifyPreview" },
        { id: "toggleSound", pref: "notifySound" },
        { id: "toggleEnterSend", pref: "sendWithEnter" },
        { id: "toggleTyping", pref: "shareTypingStatus" }
    ];

    let prefs = A.loadPrefs(session.email);

    function paintToggle(el, on) {
        el.classList.toggle("on", on);
        el.querySelector("input").checked = on;
    }

    TOGGLES.forEach(({ id, pref }) => {
        const el = $(id);
        paintToggle(el, !!prefs[pref]);
    });

    async function enableDesktopNotifications() {
        const result = await A.requestNotificationPermission();
        if (result === "granted") return true;

        if (result === "unsupported") {
            A.toast("Your browser doesn't support desktop notifications.", "bad");
        } else {
            A.toast("Notifications are blocked for this site in your browser settings.", "bad");
        }
        return false;
    }

    TOGGLES.forEach(({ id, pref, onEnable }) => {
        const el = $(id);
        el.addEventListener("click", async (e) => {
            e.preventDefault();
            const turningOn = !el.classList.contains("on");

            if (turningOn && onEnable) {
                const ok = await onEnable();
                if (!ok) return; // permission refused — leave the toggle off
            }

            paintToggle(el, turningOn);
            prefs = A.setPref(session.email, pref, turningOn);
            A.toast(turningOn ? "Preference enabled" : "Preference disabled");
        });
    });

    $("testSoundBtn").addEventListener("click", () => A.playPing());

    $("logoutBtn").addEventListener("click", A.signOut);
})();
