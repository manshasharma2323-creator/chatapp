// Regression tests for the browser-side shared code (Frontend/assets/config.js
// and api.js). They run the real files in a Node `vm` sandbox with minimal
// browser stubs — no jsdom or other dependency — via:  node --test tests/frontend/api.test.js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ASSETS = path.join(__dirname, "..", "..", "Frontend", "assets");
const read = (name) => fs.readFileSync(path.join(ASSETS, name), "utf8");

function memoryStorage() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
        _map: m
    };
}

/** Evaluate config.js (+ optionally api.js) as a browser page on `hostname` would. */
function loadPage({ hostname = "localhost", apiBase, fetchImpl, withApi = true } = {}) {
    const localStorage = memoryStorage();
    const sessionStorage = memoryStorage();
    const location = { hostname, href: "" };
    const window = {};
    const listeners = [];
    const document = {
        addEventListener: (ev, fn) => listeners.push([ev, fn]),
        body: { appendChild() {} },
        createElement: () => ({ style: {}, setAttribute() {} }),
        getElementById: () => null
    };
    const sandbox = { window, document, localStorage, sessionStorage, location, fetch: fetchImpl, console };
    window.window = window;
    vm.createContext(sandbox);

    vm.runInContext(read("config.js"), sandbox);
    if (apiBase !== undefined) window.CHATAPP_API_BASE = apiBase;
    if (withApi) vm.runInContext(read("api.js"), sandbox);
    return { App: window.App, window, localStorage, sessionStorage, location, listeners };
}

test("config.js targets localhost:8080 only when served from a local host", () => {
    for (const hostname of ["localhost", "127.0.0.1", ""]) {
        assert.equal(loadPage({ hostname, withApi: false }).window.CHATAPP_API_BASE, "http://localhost:8080");
    }
});

test("config.js never points a deployed site at the visitor's own localhost", () => {
    const { window } = loadPage({ hostname: "chatapp-dun-delta-57.vercel.app", withApi: false });
    assert.notEqual(window.CHATAPP_API_BASE, "http://localhost:8080");
});

test("api.js: unconfigured backend is reported, not silently defaulted to localhost", () => {
    const { App, listeners } = loadPage({ hostname: "example.vercel.app" });
    assert.equal(App.apiConfigured, false);
    assert.equal(App.API_BASE, "");
    assert.ok(listeners.some(([ev]) => ev === "DOMContentLoaded"), "should schedule the warning banner");
});

test("api.js: trailing slashes are stripped from the configured base URL", () => {
    const { App } = loadPage({ apiBase: "https://api.example.com//" });
    assert.equal(App.API_BASE, "https://api.example.com");
    assert.equal(App.apiConfigured, true);
});

test("remember me: unchecked keeps the session in sessionStorage only", () => {
    const { App, localStorage, sessionStorage } = loadPage();
    App.saveSession("tok", "  Bob@Example.com ", false);
    assert.equal(localStorage.getItem("aichathub:token"), null);
    assert.equal(sessionStorage.getItem("aichathub:token"), "tok");
    assert.equal(App.getToken(), "tok");
    assert.equal(App.getEmail(), "bob@example.com");
});

test("remember me: checked (and the default) persist in localStorage", () => {
    const { App, localStorage, sessionStorage } = loadPage();
    App.saveSession("tok", "a@b.co", true);
    assert.equal(localStorage.getItem("aichathub:token"), "tok");
    assert.equal(sessionStorage.getItem("aichathub:token"), null);
    App.saveSession("tok2", "a@b.co"); // default
    assert.equal(localStorage.getItem("aichathub:token"), "tok2");
});

test("saveSession replaces, and clearSession removes, the session from both stores", () => {
    const { App, localStorage, sessionStorage } = loadPage();
    App.saveSession("old", "a@b.co", true);
    App.saveSession("new", "a@b.co", false);
    assert.equal(localStorage.getItem("aichathub:token"), null, "stale persistent token must not linger");
    App.clearSession();
    assert.equal(sessionStorage.getItem("aichathub:token"), null);
    assert.equal(App.getToken(), null);
});

test("authFetch: 401 clears the session and redirects to login", async () => {
    const { App, location } = loadPage({
        apiBase: "https://api.example.com",
        fetchImpl: async () => ({ status: 401, ok: false })
    });
    App.saveSession("tok", "a@b.co");
    await assert.rejects(() => App.authFetch("/api/users/me"), /unauthenticated/);
    assert.equal(location.href, "login.html");
    assert.equal(App.getToken(), null);
});

test("authFetch: 403 does NOT sign the user out", async () => {
    const res = { status: 403, ok: false };
    const { App, location } = loadPage({ apiBase: "https://api.example.com", fetchImpl: async () => res });
    App.saveSession("tok", "a@b.co");
    assert.equal(await App.authFetch("/api/anything"), res);
    assert.equal(location.href, "");
    assert.equal(App.getToken(), "tok");
});

test("authFetch sends the bearer token to the configured base URL", async () => {
    let seen;
    const { App } = loadPage({
        apiBase: "https://api.example.com",
        fetchImpl: async (url, opts) => { seen = { url, opts }; return { status: 200, ok: true }; }
    });
    App.saveSession("tok", "a@b.co");
    await App.authFetch("/api/chat/online", { method: "GET" });
    assert.equal(seen.url, "https://api.example.com/api/chat/online");
    assert.equal(seen.opts.headers.Authorization, "Bearer tok");
});

test("esc() neutralises HTML so message text can't inject markup", () => {
    const { App } = loadPage();
    assert.equal(App.esc('<img src=x onerror="a()">&\''), "&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;");
    assert.equal(App.esc(null), "");
});

test("displayName / initials derive sensible values from an email", () => {
    const { App } = loadPage();
    assert.equal(App.displayName("jane.doe@x.com"), "Jane Doe");
    assert.equal(App.initials("jane.doe@x.com"), "JD");
    assert.equal(App.initials("bob@x.com"), "BO");
});
