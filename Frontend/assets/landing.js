/* ============================================================
   Landing page — purely presentational. No session check, no auth
   guard: unlike every other page in this app, index.html is meant to
   be visible whether or not someone is signed in. Login/Register
   handle their own "already signed in? go to the dashboard" redirect.
   ============================================================ */
(function () {
    "use strict";

    const mobileNav = document.getElementById("landingMobileNav");
    const burger = document.getElementById("landingBurger");

    function closeMobileNav() {
        if (mobileNav) mobileNav.classList.remove("open");
    }

    if (burger && mobileNav) {
        burger.addEventListener("click", () => mobileNav.classList.toggle("open"));
    }

    // Let the browser handle the actual jump (native anchor navigation,
    // smoothed by landing.css's `scroll-behavior: smooth`) — just close
    // the mobile drawer afterwards instead of re-implementing scrolling.
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener("click", closeMobileNav);
    });
})();
