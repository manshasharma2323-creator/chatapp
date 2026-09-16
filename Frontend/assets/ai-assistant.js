/* ============================================================
   AI Assistant page — free-form conversation with the backend's
   real AI provider (OpenAI/Ollama, whichever app.ai.provider
   points at). POST /api/ai/assistant -> { message, history } -> { reply }
   No fabricated responses: if the call fails, we show a real error
   state instead of a fake reply.
   ============================================================ */
(function () {
    "use strict";

    const A = window.App;
    const session = A.initShell("assistant");
    if (!session) return;

    const $ = (id) => document.getElementById(id);
    const els = {
        stream: $("stream"), streamEmpty: $("streamEmpty"), promptChips: $("promptChips"),
        aiTyping: $("aiTyping"), input: $("input"), sendBtn: $("sendBtn"), clearBtn: $("clearBtn")
    };

    const STORE_KEY = "aichathub:assistant:" + session.email;
    const PROMPTS = [
        "Summarize what a REST API is",
        "Help me write a friendly follow-up message",
        "Give me 3 icebreaker questions",
        "Explain WebSockets like I'm new to it"
    ];

    let turns = loadTurns(); // [{ role: "user"|"assistant", content }]

    function loadTurns() {
        try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch (e) { return []; }
    }
    function saveTurns() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(turns)); } catch (e) {}
    }

    function renderPromptChips() {
        els.promptChips.innerHTML = PROMPTS.map((p) => '<button class="prompt-chip">' + A.esc(p) + "</button>").join("");
        els.promptChips.querySelectorAll(".prompt-chip").forEach((chip) => {
            chip.addEventListener("click", () => { els.input.value = chip.textContent; autoGrow(); els.input.focus(); });
        });
    }

    function renderStream() {
        if (!turns.length) {
            els.stream.innerHTML = "";
            els.stream.appendChild(els.streamEmpty);
            els.streamEmpty.hidden = false;
            return;
        }

        els.stream.innerHTML = turns.map((t) => (
            '<div class="bubble ' + (t.role === "user" ? "me" : "them") + '"><span class="text">' + A.esc(t.content) + "</span></div>"
        )).join("");
        els.stream.scrollTop = els.stream.scrollHeight;
    }

    async function sendMessage() {
        const text = els.input.value.trim();
        if (!text) return;

        turns.push({ role: "user", content: text });
        saveTurns();
        renderStream();

        els.input.value = "";
        autoGrow();
        els.sendBtn.disabled = true;
        els.aiTyping.hidden = false;
        els.stream.scrollTop = els.stream.scrollHeight;

        try {
            const res = await A.authFetch("/api/ai/assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text, history: turns.slice(0, -1).slice(-12) })
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || "The AI assistant is unavailable right now (" + res.status + ").");
            }

            const data = await res.json();
            const reply = (data && data.reply) ? data.reply : null;

            if (!reply) throw new Error("The AI assistant returned an empty response.");

            turns.push({ role: "assistant", content: reply });
            saveTurns();
            renderStream();
        } catch (err) {
            A.toast(err.message || "Couldn't reach the AI assistant.", "bad");
            // Don't fake a response — just leave the user's message in the
            // thread and let them retry.
        } finally {
            els.aiTyping.hidden = true;
            els.sendBtn.disabled = false;
        }
    }

    function autoGrow() {
        els.input.style.height = "auto";
        els.input.style.height = Math.min(els.input.scrollHeight, 132) + "px";
    }

    els.sendBtn.addEventListener("click", sendMessage);
    els.input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    els.input.addEventListener("input", autoGrow);

    els.clearBtn.addEventListener("click", () => {
        turns = [];
        saveTurns();
        renderStream();
        A.toast("Conversation cleared");
    });

    renderPromptChips();
    renderStream();
})();
