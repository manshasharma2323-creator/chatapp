# AI Chat Hub

A full-stack, real-time chat application with JWT authentication, live
WebSocket messaging, and AI-powered Smart Replies. Built as a two-project
monorepo: a Spring Boot API/WebSocket backend and a static HTML/CSS/JS
frontend, fully decoupled from each other.

```
Backend/    Spring Boot 3 + WebSocket (STOMP) + Spring AI + MySQL (Java/Maven)
Frontend/   Static HTML/CSS/JS client (no build step, deploys as-is)
```

## Architecture

```
┌──────────────────┐        HTTPS (REST, JWT bearer)        ┌───────────────────────┐
│                  │ ───────────────────────────────────────▶│                       │
│  Frontend        │        WSS (SockJS + STOMP, JWT)         │  Spring Boot backend  │
│  (static HTML/   │ ◀───────────────────────────────────────│  (Backend/)           │
│  CSS/JS, Vercel) │                                          │                       │
└──────────────────┘                                          └───────┬───────────────┘
                                                                        │
                                                          ┌─────────────┼─────────────┐
                                                          ▼             ▼             ▼
                                                       MySQL      Spring AI      Spring AI
                                                    (users,     (OpenAI)        (Ollama,
                                                  chat_messages)               local model)
```

- The frontend is a plain static site — no React/Vite/npm build step. Every
  page loads `assets/api.js` for shared session/fetch/UI helpers, plus its
  own small script.
- The backend exposes a stateless, CORS-enabled REST API and a STOMP
  WebSocket endpoint (`/ws`). It never serves HTML — the two projects
  deploy and scale independently.
- Auth is a JWT bearer token, validated both on regular HTTP requests
  (`JwtAuthenticationFilter`) and on the WebSocket handshake
  (`JwtChannelInterceptor`), so an unauthenticated client can't open a chat
  session either.

## Features

- **Authentication** — register/login with bcrypt-hashed passwords, JWT
  issuance and validation, profile editing (name + password change).
- **Real-time messaging** — WebSocket chat via STOMP/SockJS: instant
  delivery, typing indicators, online/offline presence, read receipts,
  per-conversation unread counts.
- **Message persistence** — every message is stored in MySQL and survives
  a refresh or a login from a different device (`GET /api/chat/history`,
  `GET /api/chat/conversations`).
- **AI Smart Reply** — three short, context-aware reply suggestions
  generated from the last 10 messages of a conversation, with a graceful
  static fallback if the AI provider is slow, down, or not configured.
- **AI Assistant** — a standalone free-form chat page backed by the same
  configurable AI provider.
- **Contacts, Chat History, Profile, Settings, About** pages, all backed
  by real API calls — no mock data.

## Tech stack

| Layer      | Technology |
|------------|------------|
| Backend    | Java 21, Spring Boot 3.5, Spring Security, Spring Data JPA, Spring WebSocket (STOMP), Spring AI (OpenAI + Ollama), JJWT, BCrypt, Maven |
| Database   | MySQL 8 (Hibernate `ddl-auto=update`) |
| Frontend   | HTML5, CSS3, vanilla JavaScript (ES2017+), SockJS, @stomp/stompjs — no framework, no build step |
| Testing    | JUnit 5, Spring Boot Test, AssertJ, H2 (in-memory, test-only) |

## Folder structure

```
chatapp/
├── Backend/
│   ├── src/main/java/com/mansha/chatapp/
│   │   ├── config/       WebSocket, AI client, warmup, WS lifecycle events
│   │   ├── controller/   REST + STOMP @MessageMapping controllers
│   │   ├── dto/          Request/response shapes (never expose entities directly)
│   │   ├── entity/       JPA entities (User, ChatMessage)
│   │   ├── exception/    Centralized error → JSON mapping
│   │   ├── repository/   Spring Data JPA repositories
│   │   ├── security/     JWT service/filter/channel-interceptor, SecurityConfig
│   │   └── service/      Business logic (chat, presence, AI, users)
│   ├── src/main/resources/application.properties   main config (env-var driven)
│   ├── src/test/         JUnit tests, running against an isolated H2 DB
│   └── pom.xml
├── Frontend/
│   ├── assets/           one .js/.css pair per page, plus shared api.js/theme.css
│   ├── index.html        marketing/landing page
│   ├── login.html, register.html
│   ├── dashboard.html, messages.html, contacts.html, chat-history.html
│   ├── ai-assistant.html, profile.html, settings.html, about.html
│   └── vercel.json       static-site deploy config (see Deployment below)
└── README.md
```

## Prerequisites

- Java 21+
- Maven (or use the bundled `./mvnw` / `mvnw.cmd` wrapper — no separate install needed)
- MySQL 8+ running locally (or reachable via `DB_URL`)
- A modern browser. No Node/npm needed for the frontend.
- Optional, for AI features: an OpenAI API key, and/or a local
  [Ollama](https://ollama.com) install with a pulled model (default `llama3.2`)

## MySQL setup

```sql
CREATE DATABASE ai_chat_app;
```

Tables are created/updated automatically on startup (`spring.jpa.hibernate.ddl-auto=update`) —
no manual migration step needed.

## Environment variables

All of these have safe local-dev defaults baked into
`Backend/src/main/resources/application.properties` — you only need to set
them for production, or to override a default.

| Variable | Purpose | Default |
|----------|---------|---------|
| `DB_URL` | JDBC URL for MySQL | `jdbc:mysql://localhost:3306/ai_chat_app` |
| `DB_USERNAME` | MySQL username | `root` |
| `DB_PASSWORD` | MySQL password | `root` |
| `JWT_SECRET` | HMAC signing key for JWTs — **must** be set to a real random secret before deploying | an obviously-insecure placeholder, so you notice if you forgot |
| `ALLOWED_ORIGINS` | Comma-separated list of origins allowed to call the API / open a WebSocket (CORS) | localhost dev ports + the deployed Vercel frontend |
| `OPENAI_API_KEY` | OpenAI API key, only needed if `app.ai.provider=openai` | unset |
| `app.ai.provider` (in `application.properties`) | `openai` or `ollama` | `ollama` |

The frontend has exactly one configuration point:
**`Frontend/assets/config.js`** sets `window.CHATAPP_API_BASE` — the
backend's base URL. It's loaded before every other script on every
authenticated page.

## Backend setup (local)

```bash
cd Backend
./mvnw spring-boot:run
```

Runs on `http://localhost:8080`. On first boot it connects to MySQL using
the defaults above (`root`/`root`) unless you override them with env vars.

## Frontend setup (local)

```bash
cd Frontend
npx serve .
```

Any static file server works — there's no build step. By default
`Frontend/assets/config.js` points at `http://localhost:8080`, matching the
backend above.

## AI setup

Pick a provider in `Backend/src/main/resources/application.properties`:

```properties
app.ai.provider=ollama   # or: openai
```

**Ollama (local, free, no API key):**
```bash
ollama pull llama3.2
ollama serve
```
The backend warms the model in the background on startup
(`AiWarmupRunner`) so the first real request isn't stuck behind a cold
model load.

**OpenAI:**
```bash
export OPENAI_API_KEY=sk-...
```
and set `app.ai.provider=openai`.

Either way, if the AI call fails, times out, or isn't configured, Smart
Reply falls back to static suggestions and the AI Assistant returns a
clear error — the rest of the app is unaffected.

## WebSocket explanation

- Endpoint: `/ws` (SockJS-wrapped STOMP, so it degrades gracefully without
  native WebSocket support).
- **Auth**: the client sends `Authorization: Bearer <jwt>` as a STOMP
  `CONNECT` header. `JwtChannelInterceptor` validates it before the
  connection is accepted — an invalid/missing token is rejected outright,
  no unauthenticated session is ever created.
- **Sending a message**: client publishes to `/app/chat.send` with
  `{ receiverEmail, content }`. The server persists it, then delivers it to
  both the sender and receiver's private queue (`/user/queue/messages`) so
  every open tab of either user stays in sync.
- **Typing indicators**: `/app/chat.typing` → relayed to
  `/user/queue/typing`, not persisted.
- **Presence**: connect/disconnect events broadcast to `/topic/presence`.
  Presence is tracked per WebSocket session, not just per user, so having
  multiple tabs/devices open doesn't flip you to "offline" until the last
  one disconnects.
- **Errors**: a rejected `chat.send` (empty message, unknown receiver,
  messaging yourself) is sent back to the sender on
  `/user/queue/errors` instead of vanishing silently.

## Smart Reply explanation

`POST /api/ai/smart-replies` with `{ peerEmail }`. The backend pulls the
last 10 messages of that conversation, asks the configured AI provider for
exactly 3 short, distinct reply suggestions, and returns them. Bounded by a
12-second timeout — if the provider is slow/unreachable, the endpoint
still responds instantly with generic fallback suggestions rather than
leaving the chat UI hanging.

## API endpoints

All `/api/**` routes except register/login require `Authorization: Bearer <jwt>`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/users/register` | Create an account |
| POST | `/api/users/login` | Returns a JWT (raw string body) |
| GET | `/api/users/me` | Current user's name + email |
| PATCH | `/api/users/me` | Update name and/or password |
| GET | `/api/users/contacts` | All other registered users |
| GET | `/api/chat/conversations` | Every peer you've messaged, with last message + unread count |
| GET | `/api/chat/history?with=<email>` | Full message history with one peer |
| GET | `/api/chat/online` | Currently connected users |
| POST | `/api/chat/mark-read?with=<email>` | Mark a conversation's messages as read |
| GET | `/api/chat/unread-counts` | Unread message count per sender |
| POST | `/api/ai/smart-replies` | `{ peerEmail }` → 3 suggested replies |
| POST | `/api/ai/assistant` | `{ message, history }` → AI Assistant reply |

WebSocket (`/ws`, STOMP over SockJS):

| Direction | Destination | Payload |
|-----------|-------------|---------|
| publish | `/app/chat.send` | `{ receiverEmail, content }` |
| publish | `/app/chat.typing` | `{ receiverEmail, typing }` |
| subscribe | `/user/queue/messages` | Incoming/echoed chat messages |
| subscribe | `/user/queue/typing` | Peer typing status |
| subscribe | `/user/queue/errors` | Rejected send errors |
| subscribe | `/topic/presence` | `{ email, online }` broadcasts |

## Deployment

**Backend** — deploy the Spring Boot app anywhere that runs a JAR
(Render, Railway, Fly.io, EC2, etc.):
```bash
cd Backend
./mvnw clean package
java -jar target/chatapp-0.0.1-SNAPSHOT.jar
```
Set `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `JWT_SECRET`, and
`ALLOWED_ORIGINS` (your frontend's exact deployed origin) as environment
variables on whatever platform you use.

**Frontend** — deploy `Frontend/` on Vercel (or any static host):
1. Edit `Frontend/assets/config.js` and set `window.CHATAPP_API_BASE` to
   your deployed backend's URL.
2. Push. `vercel.json` at the repo root already tells Vercel this is a
   static site (no build command, `Frontend/` as the output directory) —
   no framework/build configuration needed on Vercel's side.

## Troubleshooting

- **`vite: command not found` on Vercel** — this project has no Vite/React
  build; `vercel.json` disables the build step entirely. If you see this
  error, check the Vercel dashboard's Framework Preset is set to *Other*
  and the Build/Install Command overrides are off.
- **Frontend can't reach the backend / CORS errors in the console** —
  check `Frontend/assets/config.js` points at the right backend URL, and
  that the backend's `ALLOWED_ORIGINS` includes your frontend's exact
  origin (scheme + host, no trailing slash).
- **Login works but the chat never connects** — the WebSocket handshake
  uses the same JWT; an expired/cleared token will show "Rejected" in the
  connection indicator. Sign out and back in.
- **Smart Reply always shows generic suggestions** — means the AI
  provider isn't reachable (Ollama not running, or no `OPENAI_API_KEY`).
  This is a deliberate fallback, not a bug — check the backend logs for
  the underlying AI error.

## Running tests

```bash
cd Backend
./mvnw test
```

Tests run against an isolated in-memory H2 database
(`src/test/resources/application.properties`) — they never touch your real
MySQL data. Coverage includes the full register → login → authenticated
request flow, JWT rejection (missing/invalid token), chat message
validation and persistence, unread-count tracking, and AI endpoint
auth/validation contracts.
