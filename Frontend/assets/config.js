/* ============================================================
   Deployment config — the ONE place to point this frontend at a
   backend. Loaded before assets/api.js on every page that talks
   to the API.

   Local development (Spring Boot on your machine, frontend served
   from localhost / 127.0.0.1 / file://):
     nothing to do — it targets http://localhost:8080 automatically.

   Production (e.g. Vercel):
     set PROD_API_BASE below to your deployed Spring Boot backend's
     public HTTPS URL, e.g. "https://chatapp-backend.onrender.com"
     (no trailing slash), then redeploy the frontend. It MUST be
     https:// — browsers block http:// calls from an https:// page.
     Also add this site's origin to the backend's ALLOWED_ORIGINS.

   Until PROD_API_BASE is set, a deployed (non-local) site shows a
   "backend not configured" notice instead of silently sending every
   visitor's requests to *their own* localhost:8080, which can never work.
   ============================================================ */
(function () {
    var PROD_API_BASE = "";

    var host = location.hostname;
    var isLocal = host === "" || host === "localhost" || host === "127.0.0.1" || host === "[::1]";

    window.CHATAPP_API_BASE = isLocal ? "http://localhost:8080" : PROD_API_BASE;
})();
