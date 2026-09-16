# chatapp

AI-powered real-time chat application, split into two independent projects:

```
Backend/    Spring Boot API + WebSocket server (Java/Maven)
Frontend/   Static HTML/CSS/JS client
```

## Backend

```
cd Backend
./mvnw spring-boot:run
```

Runs on `http://localhost:8080`. Configure the database and secrets in
`Backend/src/main/resources/application.properties` (or via env vars, e.g.
`JWT_SECRET`, `OPENAI_API_KEY`). See `Backend/HELP.md` for Spring Boot
reference docs.

## Frontend

Serve `Frontend/` with any static file server, e.g.:

```
cd Frontend
npx serve .
```

By default it talks to the backend at `http://localhost:8080`. To point it
at a different backend URL, set `window.CHATAPP_API_BASE` before `chat.js`
loads, e.g. add this to `Frontend/index.html` above the `chat.js` script tag:

```html
<script>window.CHATAPP_API_BASE = "http://localhost:8080";</script>
```

The two projects are fully decoupled — the backend exposes a CORS-enabled
REST/WebSocket API and no longer serves any HTML/CSS/JS.
