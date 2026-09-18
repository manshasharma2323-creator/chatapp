/* ============================================================
   Deployment config — the ONE place to point this frontend at a
   backend. Loaded before assets/api.js on every authenticated page.

   Local development (Spring Boot running on your machine):
     leave this as-is, it already targets http://localhost:8080.

   Production (after you deploy the Spring Boot backend somewhere
   like Render/Railway/EC2/Fly.io):
     replace the URL below with that backend's public HTTPS URL,
     e.g. "https://chatapp-backend.onrender.com" (no trailing slash).
     Then redeploy the frontend — that's the only change needed.
   ============================================================ */
window.CHATAPP_API_BASE = "http://localhost:8080";
