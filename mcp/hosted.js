// The hosted, many-person door. One process serves many people; each person who signs in gets (or reconnects to) a node of their own
// on a FoodOS host, and every assistant they connect reaches only that node. Authorization follows the MCP authorization spec (OAuth 2.1:
// protected-resource metadata, authorization-server metadata, dynamic client registration, authorization code + PKCE, refresh, revocation).
//
//   sign-in      "Sign in with Google" (openid email profile only), and a reviewer sign-in for directory reviewers (a fixed passphrase, demo people)
//   a person     one account -> one FoodBlock identity -> one hosted node. Their signing keys are kept sealed (AES-GCM under the operator's master
//                secret): hosted custody, so the door can sign on their tap. Leaving is one pull from the host (the node is theirs).
//   a token      belongs to one person AND one assistant (OAuth client), carries scopes foodblock:read / foodblock:draft, is kept only as a hash,
//                and dies on revoke (the account page, or RFC 7009 /revoke). Binding authority is never a scope: it is a grant the person signs.
//   the tap      a draft is approved on /approve/<id> by the signed-in person; the page of one person can never show or sign another's draft.
// Everything durable (clients, tokens, sessions, accounts) is in one file on a durable disk (store.js). Nothing here imports the kernel:
// the host is reached through `provision(genesis) -> { base, token }`, so a FoodOS host, a remote one, or a test stub all fit.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import express from "express";
import { InvalidTokenError, InvalidGrantError, InvalidRequestError, InvalidClientMetadataError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createDoor, newPerson } from "./door.js";
import { remoteNode } from "./remote.js";
import { durableState, sealer } from "./store.js";

export const SCOPES = ["foodblock:read", "foodblock:draft"];
const ACCESS_S = 3600, REFRESH_S = 30 * 86400, CODE_MS = 5 * 60e3, SESSION_MS = 14 * 86400e3, PENDING_MS = 15 * 60e3;
const secret = () => randomBytes(32).toString("base64url");
const keyOf = (v) => createHash("sha256").update(String(v)).digest("hex");
const same = (a, b) => { const x = Buffer.from(String(a ?? "")), y = Buffer.from(String(b ?? "")); return x.length === y.length && timingSafeEqual(x, y); };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#14301f"/><rect x="14" y="14" width="16" height="16" rx="3" fill="#f2e8cf"/><rect x="34" y="14" width="16" height="16" rx="3" fill="#a7c957"/><rect x="14" y="34" width="16" height="16" rx="3" fill="#a7c957"/><rect x="34" y="34" width="16" height="16" rx="3" fill="#f2e8cf"/></svg>`;

const STYLE = `:root{color-scheme:light dark;--bg:#faf8f2;--fg:#17211b;--mut:#5d675f;--line:#d9d5c7;--ac:#14301f;--acfg:#fff;--bad:#a4281c}@media(prefers-color-scheme:dark){:root{--bg:#101611;--fg:#ecebe3;--mut:#9aa59c;--line:#2a352d;--ac:#a7c957;--acfg:#101611;--bad:#ff8b7e}}
body{font:17px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg);max-width:34rem;margin:0 auto;padding:2rem 1rem}h1,h2{font-weight:600;line-height:1.2}a{color:inherit}
.card{border:1px solid var(--line);border-radius:12px;padding:1rem 1.25rem;margin:1rem 0}.mut{color:var(--mut);font-size:15px}.bad{color:var(--bad)}
button,.btn,input{font:inherit}button,.btn{display:inline-block;background:var(--ac);color:var(--acfg);border:0;border-radius:10px;padding:.6rem 1.1rem;text-decoration:none;cursor:pointer}button.quiet{background:transparent;color:var(--fg);border:1px solid var(--line)}
input[type=text],input[type=password]{width:100%;box-sizing:border-box;padding:.55rem .7rem;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit}label{display:block;margin:.4rem 0}`;
const page = (title, body, status = 200) => ({ status, html: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="icon" href="/icon.svg" type="image/svg+xml"><style>${STYLE}</style><body>${body}<p class="mut"><a href="https://foodx.network/privacy">Privacy</a> · <a href="https://foodx.network/terms">Terms</a> · <a href="mailto:hello@foodx.network">Support</a></p><p class="mut" style="font-size:13px">Built on the open FoodBlock protocol.</p></body></html>` });

/** A fixed-window limiter: allow(key, max, windowMs) -> { ok, retry } . In memory: a restart only forgives, it never blocks. */
function limiter(now) {
  const windows = new Map();
  setInterval(() => { const t = now(); for (const [k, w] of windows) if (w.until < t) windows.delete(k); }, 60e3).unref();
  return (key, max, windowMs) => {
    const t = now();
    let w = windows.get(key);
    if (!w || w.until < t) { w = { n: 0, until: t + windowMs }; windows.set(key, w); }
    w.n++;
    return { ok: w.n <= max, retry: Math.max(1, Math.ceil((w.until - t) / 1000)) };
  };
}

const cookies = (req) => Object.fromEntries(String(req.headers.cookie || "").split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf("="); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));

/**
 * @param stateFile   durable JSON file (EFS)            master  >=32-byte secret that seals people's keys
 * @param publicUrl   https://mcp.example               provision  async ({ id, genesis }) => { base, token }: the person's window on a host
 * @param index       a remoteIndex (find), shared       google  { clientId, clientSecret, redirectUri, authUrl?, tokenUrl? } (openid email profile)
 * @param reviewer    { passphrase }: enables reviewer sign-in as reviewer-<name>   openaiChallenge  token for /.well-known/openai-apps-challenge
 * @param extend      (api) => void: more pages for the signed-in person on this same app and session (api: app, express, send, page, esc, sessionOf, ask, requestGrant, custodyOf, doorFor, accountOfPerson)
 */
// `chat` (optional) is the person's own autonomous system on every chat door, from the FoodOS host: { custody(personId) -> { keys, encryption, genesis } | null (people who first wrote from a chat
// are held by FoodX as custodian, and sign in here with a code sent to a chat they use), signin: { start(phone), check(phone, code) -> personId | null }, talk(personId, words) -> the autonomous system's answer }.
export function createHub({ stateFile, master, publicUrl, provision, index = null, google = null, reviewer = null, openaiChallenge = null, now = () => Date.now(), fetch: request = globalThis.fetch, mcp, limits = {}, extend = null, draftsFor = null, chat = null }) {
  const state = durableState(stateFile), seal = sealer(master), allow = limiter(now);
  const secure = publicUrl.startsWith("https:");
  const resourceUrl = new URL("/mcp", publicUrl).href;
  const pending = new Map(), codes = new Map(), googleStates = new Map(), doors = new Map();
  const cap = { mcp: limits.mcp ?? 120, register: limits.register ?? 20, signin: limits.signin ?? 30, token: limits.token ?? 60 };
  const ip = (req) => String(req.headers["x-foodos-ip"] || req.socket?.remoteAddress || "?");
  const tooMany = (res, r, json = true) => { res.status(429).set("retry-after", String(r.retry)); if (json) res.json({ error: "rate_limited", error_description: `slow down; retry in ${r.retry}s` }); else res.type("html").send(page("Slow down", `<h2>Too many tries</h2><p>Please wait ${r.retry} seconds and try again.</p>`).html); };
  const send = (res, p) => res.status(p.status).type("html").set("cache-control", "no-store").send(p.html);

  state.clients.prune((c) => !c.last_used && c.client_id_issued_at * 1000 < now() - 7 * 86400e3);
  state.access.prune((t) => t.expiresAt * 1000 < now());
  state.refresh.prune((t) => t.expires < now());
  state.sessions.prune((s) => s.expires < now());

  // ---- people ----
  /** The account for a sign-in identity ("google:<sub>", "reviewer:<name>"): made on first sign-in, the same one every time after. */
  function accountFor(key, profile) {
    let account = state.accounts.get(key);
    if (!account) {
      const person = newPerson();
      state.identities.set(person.id, seal.seal({ keys: person.keys, encryption: person.encryption, genesis: person.genesis, recovery: person.recovery }));
      account = state.accounts.set(key, { person: person.id, email: profile.email || null, name: profile.name || null, created: new Date(now()).toISOString() });
    }
    return account;
  }
  /** The person's door (their node, their drafts), built once and kept; it holds nothing of anyone else. */
  function doorFor(personId) {
    let held = doors.get(personId);
    if (!held) {
      held = (async () => {
        const sealed = state.identities.get(personId);
        const held = sealed ? seal.open(sealed) : chat?.custody(personId);
        if (!held) throw new Error("no such person here");
        const saved = held, person = { ...saved, id: saved.genesis.hash, chain: [saved.genesis] };
        const { base, token } = await provision({ id: person.id, genesis: person.genesis });
        const door = createDoor({ node: remoteNode({ base, token }), person, code: randomBytes(10).toString("hex").toUpperCase(), drafts: draftsFor?.(person.id) });
        if (index) door.index = index;
        if (chat?.talk) door.talk = (words) => chat.talk(personId, words);
        door.base = publicUrl.replace(/\/$/, "");
        return door;
      })();
      held.catch(() => doors.delete(personId));
      doors.set(personId, held);
    }
    return held;
  }

  // ---- sessions (the browser's sign-in, for the consent and approval pages) ----
  const startSession = (res, personId) => {
    const token = secret(), csrf = secret();
    state.sessions.set(keyOf(token), { person: personId, csrf, expires: now() + SESSION_MS });
    res.append("set-cookie", `fb_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure ? "; Secure" : ""}`);
  };
  const sessionOf = (req) => { const t = cookies(req).fb_session; const s = t && state.sessions.get(keyOf(t)); return s && s.expires > now() ? { ...s, key: keyOf(t) } : null; };
  const accountOfPerson = (personId) => state.accounts.entries().find(([, a]) => a.person === personId)?.[1];

  // ---- the sign-in page and its two ways in ----
  const signInPage = (id, why, note = "") => page("Sign in to FoodX", `<h2>Sign in to FoodX</h2><p>${esc(why)}</p>${note ? `<p class="bad">${esc(note)}</p>` : ""}
    ${google ? `<p><a class="btn" href="/signin/google?request=${esc(id)}">Sign in with Google</a></p><p class="mut">We read only your name and email address, to know which node is yours.</p>` : ""}
    ${chat?.signin ? `<form class="card" method="post" action="/signin/code"><b>A code in your chat</b><p class="mut">Already talk to FoodX on Telegram, WhatsApp or SMS? Enter the phone number you shared there and we send a code to a chat you use.</p><input type="hidden" name="request" value="${esc(id)}">
      <label>Phone number <input type="tel" name="phone" placeholder="+254700000000" autocomplete="tel"></label><button>Send me a code</button></form>` : ""}
    ${reviewer ? `<form class="card" method="post" action="/signin/reviewer"><b>Reviewer sign-in</b><p class="mut">For directory reviewers: a demo person, no codes.</p><input type="hidden" name="request" value="${esc(id)}">
      <label>Name <input type="text" name="name" placeholder="reviewer-one" autocomplete="username"></label><label>Passphrase <input type="password" name="passphrase" autocomplete="current-password"></label><button>Sign in</button></form>` : ""}`);
  const codePage = (id, phone, note = "") => page("Enter your code", `<h2>Enter your code</h2><p class="mut">If that number talks to FoodX, a code is on its way to a chat it uses. It lasts 10 minutes.</p>${note ? `<p class="bad">${esc(note)}</p>` : ""}
    <form method="post" action="/signin/code"><input type="hidden" name="request" value="${esc(id)}"><input type="hidden" name="phone" value="${esc(phone)}"><label>Code <input type="text" name="code" inputmode="numeric" autocomplete="one-time-code"></label><button>Sign in</button></form>`);
  const ask = (res, what, why) => { const id = secret(); pending.set(id, { ...what, expires: now() + PENDING_MS }); send(res, signInPage(id, why)); };
  const afterSignIn = (res, id) => res.redirect(302, `/oauth/continue?request=${encodeURIComponent(id)}`);

  /**
   * One more thing a signed-in person says yes to at Google (a read of their mail, say), through the same sign-in and the same callback.
   * Returns { url, cookie } for the page to go to, or null when nobody is signed in or Google is not set up. `done({ tokens, person, email })` runs when
   * Google sends them back having said yes; `next` is where they land afterwards.
   */
  function requestGrant(req, { scopes, done, next = "/account" }) {
    const session = sessionOf(req), who = session && accountOfPerson(session.person);
    if (!google || !session) return null;
    const stateValue = secret();
    googleStates.set(keyOf(stateValue), { kind: "grant", person: session.person, done, next, expires: now() + PENDING_MS });
    const url = new URL(google.authUrl || "https://accounts.google.com/o/oauth2/v2/auth");
    Object.entries({ client_id: google.clientId, redirect_uri: google.redirectUri, response_type: "code", scope: ["openid", "email", ...scopes].join(" "), state: stateValue, access_type: "offline", prompt: "consent", include_granted_scopes: "true", ...(who?.email ? { login_hint: who.email } : {}) }).forEach(([k, v]) => url.searchParams.set(k, v));
    return { url: url.href, cookie: `fb_state=${stateValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900${secure ? "; Secure" : ""}` };
  }
  /** The keys of a person this hub holds (hosted custody), opened for the host that signs for them. */
  const custodyOf = (personId) => { const sealed = state.identities.get(personId); const held = sealed ? seal.open(sealed) : chat?.custody(personId); if (!held) throw new Error("no such person here"); const { keys, encryption } = held; return { keys, encryption }; };

  async function signedIn(res, id, key, profile) {
    const account = accountFor(key, profile);
    startSession(res, account.person);
    afterSignIn(res, id);
  }

  // ---- the consent page ----
  const consentPage = (held, id, session) => {
    const { client, params } = held, who = accountOfPerson(session.person);
    return page("Connect an assistant", `<h2>Connect ${esc(client.client_name || "an assistant")}?</h2>
      <p class="mut">Signed in as ${esc(who?.email || who?.name || "you")}. <a href="/account">Your connections</a></p>
      <p>This assistant would reach <b>only your own FoodX node</b>. It cannot send or bind anything for you: what it drafts waits for your tap, and binding for you needs a separate grant you sign.</p>
      <form method="post" action="/oauth/consent"><input type="hidden" name="request" value="${esc(id)}"><input type="hidden" name="csrf" value="${esc(session.csrf)}">
      <label><input type="checkbox" checked disabled> Find and read</label>
      <label><input type="checkbox" name="draft" value="1" ${params.scopes.includes("foodblock:draft") ? "checked" : ""}> Draft asks and pair itself (you still tap to send)</label>
      <p class="mut">It will return to ${esc(new URL(params.redirectUri).host || new URL(params.redirectUri).protocol)}.</p>
      <button name="do" value="allow">Connect</button> <button class="quiet" name="do" value="deny">Cancel</button></form>`);
  };

  // ---- tokens ----
  const issue = (client, scopes, resource, personId) => {
    const token = secret(), again = secret();
    state.access.set(keyOf(token), { clientId: client.client_id, person: personId, scopes, expiresAt: Math.floor(now() / 1000) + ACCESS_S, resource });
    state.refresh.set(keyOf(again), { clientId: client.client_id, person: personId, scopes, expires: now() + REFRESH_S * 1000, resource });
    const c = state.clients.get(client.client_id); if (c) state.clients.set(client.client_id, { ...c, last_used: now() });
    return { access_token: token, token_type: "Bearer", expires_in: ACCESS_S, refresh_token: again, scope: scopes.join(" ") };
  };
  const dropTokens = (personId, clientId) => { state.access.prune((t) => t.person === personId && (!clientId || t.clientId === clientId)); state.refresh.prune((t) => t.person === personId && (!clientId || t.clientId === clientId)); };

  const provider = {
    clientsStore: {
      getClient: (id) => state.clients.get(id),
      registerClient: (meta) => {
        if (state.clients.size() > (limits.maxClients ?? 20000)) throw new InvalidClientMetadataError("registrations are full for now; try again later");
        for (const uri of meta.redirect_uris || []) {
          const u = new URL(uri);
          if (!(u.protocol === "https:" || (u.protocol === "http:" && LOOPBACK.test(u.hostname)) || !/^(https?|javascript|data|file|vbscript):$/.test(u.protocol))) throw new InvalidClientMetadataError("redirect_uris must be https, loopback http, or an app scheme");
        }
        const full = { ...meta, client_id: randomUUID(), client_id_issued_at: Math.floor(now() / 1000) };
        state.clients.set(full.client_id, full);
        return full;
      },
    },
    async authorize(client, params, res) {
      if (params.resource && params.resource.href !== resourceUrl) throw new InvalidRequestError("invalid_target: this door is " + resourceUrl);
      const wanted = params.scopes?.length ? params.scopes : SCOPES, bad = wanted.filter((s) => !SCOPES.includes(s));
      if (bad.length) throw new InvalidRequestError(`unknown scope: ${bad.join(" ")}`);
      const held = { kind: "oauth", client, params: { ...params, scopes: wanted, resource: params.resource?.href }, expires: now() + PENDING_MS };
      const id = secret(); pending.set(id, held);
      const session = sessionOf(res.req);
      if (session) return send(res, consentPage(held, id, session));
      send(res, signInPage(id, `${client.client_name || "An assistant"} wants to connect to your FoodX node. Sign in first.`));
    },
    async challengeForAuthorizationCode(client, code) {
      const held = codes.get(keyOf(code));
      if (!held || held.client !== client.client_id || held.expires < now()) throw new InvalidGrantError("unknown or expired authorization code");
      return held.challenge;
    },
    async exchangeAuthorizationCode(client, code, _verifier, redirectUri) {
      const held = codes.get(keyOf(code)); codes.delete(keyOf(code));
      if (!held || held.client !== client.client_id || held.expires < now()) throw new InvalidGrantError("unknown or expired authorization code");
      if (redirectUri && redirectUri !== held.redirectUri) throw new InvalidGrantError("redirect_uri does not match");
      return issue(client, held.scopes, held.resource, held.person);
    },
    async exchangeRefreshToken(client, token, scopes) {
      const held = state.refresh.get(keyOf(token)); state.refresh.delete(keyOf(token)); // rotated: used once
      if (!held || held.clientId !== client.client_id || held.expires < now()) throw new InvalidGrantError("unknown or expired refresh token");
      return issue(client, scopes?.length ? scopes.filter((s) => held.scopes.includes(s)) : held.scopes, held.resource, held.person);
    },
    async verifyAccessToken(token) {
      const held = state.access.get(keyOf(token));
      if (!held || held.expiresAt * 1000 < now()) throw new InvalidTokenError("unknown, expired or revoked token");
      return { token, clientId: held.clientId, scopes: held.scopes, expiresAt: held.expiresAt, resource: held.resource ? new URL(held.resource) : undefined, extra: { person: held.person } };
    },
    async revokeToken(client, { token }) { for (const t of [state.access, state.refresh]) { const held = t.get(keyOf(token)); if (held?.clientId === client.client_id) t.delete(keyOf(token)); } },
  };

  // ---- the web app ----
  const app = express();
  app.disable("x-powered-by");
  const form = express.urlencoded({ extended: false, limit: "8kb" });
  const guarded = (name, max, windowMs, json = true) => (req, res, next) => { const r = allow(`${name}:${ip(req)}`, max, windowMs); r.ok ? next() : tooMany(res, r, json); };
  app.use((req, res, next) => { res.set({ "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" }); next(); });

  app.get("/", (req, res) => send(res, page("FoodX", `<h1>FoodX</h1><p>Talk to your own FoodX agent from any assistant, and let it find food offers and people and draft asks and promises that you approve with one tap. Each person who signs in gets a node of their own; an assistant reaches only its person's node.</p>
    <div class="card"><b>Connect an assistant</b><p class="mut">Add <code>${esc(resourceUrl)}</code> as a remote MCP server (Streamable HTTP, OAuth). You sign in when it asks.</p></div>
    <p><a href="/account">Your connections</a> · <a href="https://foodx.network/docs/mcp">Docs</a></p>`)));
  app.get("/icon.svg", (req, res) => res.type("image/svg+xml").set("cache-control", "public, max-age=86400").send(ICON_SVG));
  if (openaiChallenge) app.get("/.well-known/openai-apps-challenge", (req, res) => res.type("text/plain").send(openaiChallenge));

  app.get("/signin/google", guarded("signin", cap.signin, 600e3, false), (req, res) => {
    if (!google) return res.status(404).end();
    const id = String(req.query.request || ""), held = pending.get(id);
    if (!held || held.expires < now()) return send(res, page("Expired", "<p>This request has expired. Start again from your assistant.</p>", 400));
    const stateValue = secret(), nonce = secret();
    googleStates.set(keyOf(stateValue), { id, nonce, expires: now() + PENDING_MS });
    const url = new URL(google.authUrl || "https://accounts.google.com/o/oauth2/v2/auth");
    Object.entries({ client_id: google.clientId, redirect_uri: google.redirectUri, response_type: "code", scope: "openid email profile", state: stateValue, nonce, prompt: "select_account" }).forEach(([k, v]) => url.searchParams.set(k, v));
    res.append("set-cookie", `fb_state=${stateValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900${secure ? "; Secure" : ""}`);
    res.redirect(302, url.href);
  });
  /** Google sent a signed-in person back from a grant: the same person, the same Google account, then the grant's own work. */
  async function finishGrant(req, res, held) {
    const session = sessionOf(req);
    if (!session || session.person !== held.person) return send(res, page("Sign in again", "<p>Your sign-in is missing or old. Start again.</p>", 403));
    if (req.query.error || !req.query.code) return res.redirect(302, `${held.next}${held.next.includes("?") ? "&" : "?"}google=denied`);
    const r = await request(google.tokenUrl || "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: String(req.query.code), client_id: google.clientId, client_secret: google.clientSecret, redirect_uri: google.redirectUri, grant_type: "authorization_code" }) });
    const tokens = await r.json();
    const claims = tokens.id_token && JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8"));
    const ok = claims && ["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) && claims.aud === google.clientId && claims.exp * 1000 > now() && claims.sub;
    if (!ok || state.accounts.get(`google:${claims.sub}`)?.person !== held.person) return send(res, page("Not the same account", "<p>That Google account is not the one you signed in with. Start again and choose the same one.</p>", 403));
    await held.done({ tokens, person: held.person, email: claims.email });
    res.redirect(302, `${held.next}${held.next.includes("?") ? "&" : "?"}google=ok`);
  }

  /**
   * Link Google to a person who signs in with a passkey: the phone (signed in by its passkey) asks the host for a single-use link, opens it, and the Google
   * account then reaches the SAME person. A Google account already tied to someone else is refused, never moved.
   */
  const linkCodes = new Map();
  const linkGoogle = (personId) => { const code = secret(); linkCodes.set(keyOf(code), { person: personId, expires: now() + PENDING_MS }); return `${publicUrl.replace(/\/$/, "")}/link/google?code=${code}`; };
  app.get("/link/google", guarded("signin", cap.signin, 600e3, false), (req, res) => {
    const code = keyOf(String(req.query.code || "")), held = google && linkCodes.get(code);
    linkCodes.delete(code);
    if (!held || held.expires < now()) return send(res, page("Expired", "<p>This link has expired. Start again from the app.</p>", 400));
    const stateValue = secret(), nonce = secret();
    googleStates.set(keyOf(stateValue), { kind: "link", person: held.person, nonce, expires: now() + PENDING_MS });
    const url = new URL(google.authUrl || "https://accounts.google.com/o/oauth2/v2/auth");
    Object.entries({ client_id: google.clientId, redirect_uri: google.redirectUri, response_type: "code", scope: "openid email profile", state: stateValue, nonce, prompt: "select_account" }).forEach(([k, v]) => url.searchParams.set(k, v));
    res.append("set-cookie", `fb_state=${stateValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900${secure ? "; Secure" : ""}`);
    res.redirect(302, url.href);
  });

  app.get("/oauth/google/callback", guarded("signin", cap.signin, 600e3, false), async (req, res) => {
    try {
      const sv = String(req.query.state || ""), held = googleStates.get(keyOf(sv));
      googleStates.delete(keyOf(sv));
      if (!google || !held || held.expires < now() || !same(cookies(req).fb_state, sv)) return send(res, page("Expired", "<p>This sign-in has expired. Start again from your assistant.</p>", 400));
      if (held.kind === "grant") return await finishGrant(req, res, held);
      if (req.query.error || !req.query.code) return send(res, page("Not signed in", "<p>Google did not sign you in. You can try again from your assistant.</p>", 403));
      const r = await request(google.tokenUrl || "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: String(req.query.code), client_id: google.clientId, client_secret: google.clientSecret, redirect_uri: google.redirectUri, grant_type: "authorization_code" }) });
      const answer = await r.json();
      const claims = answer.id_token && JSON.parse(Buffer.from(answer.id_token.split(".")[1], "base64url").toString("utf8")); // straight from Google over TLS: the OpenID Connect rule for the code flow
      const ok = claims && ["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) && claims.aud === google.clientId && claims.exp * 1000 > now() && claims.nonce === held.nonce && claims.sub;
      if (!ok) return send(res, page("Not signed in", "<p>Google's answer did not check out. Try again.</p>", 403));
      if (held.kind === "link") {
        const key = `google:${claims.sub}`, had = state.accounts.get(key);
        if (had && had.person !== held.person) return send(res, page("Already in use", "<p>That Google account already belongs to another FoodX person. Choose a different one.</p>", 409));
        if (!had) state.accounts.set(key, { person: held.person, email: claims.email_verified === false ? null : claims.email || null, name: claims.name || null, created: new Date(now()).toISOString(), linked: true });
        startSession(res, held.person);
        return res.redirect(302, "/account");
      }
      await signedIn(res, held.id, `google:${claims.sub}`, { email: claims.email_verified === false ? null : claims.email, name: claims.name });
    } catch { send(res, page("Not signed in", "<p>Sign-in failed. Try again in a moment.</p>", 502)); }
  });
  app.post("/signin/code", guarded("code", limits.code ?? 8, 600e3, false), form, async (req, res) => {
    const id = String(req.body?.request || ""), held = pending.get(id);
    if (!chat?.signin || !held || held.expires < now()) return send(res, page("Expired", "<p>This request has expired. Start again.</p>", 400));
    const phone = String(req.body.phone || "").slice(0, 32);
    if (req.body.code) {   // the second step: the code she was sent
      const person = await chat.signin.check(phone, String(req.body.code).slice(0, 12)).catch(() => null);
      if (!person) return send(res, { ...codePage(id, phone, "That code did not match or has run out."), status: 403 });
      startSession(res, person);
      return afterSignIn(res, id);
    }
    await chat.signin.start(phone).catch(() => {});
    send(res, codePage(id, phone));   // the same page whether or not that number has an account: nothing says who is here
  });
  app.post("/signin/reviewer", guarded("reviewer", limits.reviewer ?? 10, 600e3, false), form, (req, res) => {
    const id = String(req.body?.request || ""), held = pending.get(id);
    if (!reviewer || !held || held.expires < now()) return send(res, page("Expired", "<p>This request has expired. Start again from your assistant.</p>", 400));
    const name = String(req.body.name || "").trim().toLowerCase();
    if (!/^reviewer-[a-z0-9]{1,16}$/.test(name) || !same(req.body.passphrase, reviewer.passphrase)) return send(res, { ...signInPage(id, "Reviewer sign-in.", "That name or passphrase is not right."), status: 403 });
    signedIn(res, id, `reviewer:${name}`, { name });
  });
  app.get("/oauth/continue", (req, res) => {
    const id = String(req.query.request || ""), held = pending.get(id), session = sessionOf(req);
    if (!held || held.expires < now() || !session) return send(res, page("Expired", "<p>This request has expired. Start again.</p>", 400));
    if (held.kind === "next") { pending.delete(id); return res.redirect(302, held.next); }
    send(res, consentPage(held, id, session));
  });
  app.post("/oauth/consent", form, (req, res) => {
    const id = String(req.body?.request || ""), held = pending.get(id), session = sessionOf(req);
    if (!held || held.kind !== "oauth" || held.expires < now()) return send(res, page("Expired", "<p>This request has expired. Start again from your assistant.</p>", 400));
    if (!session || !same(req.body.csrf, session.csrf)) return send(res, page("Sign in again", "<p>Your sign-in is missing or old. Start again from your assistant.</p>", 403));
    pending.delete(id);
    const back = (q) => { const url = new URL(held.params.redirectUri); Object.entries(q).forEach(([k, v]) => v != null && url.searchParams.set(k, v)); res.redirect(302, url.href); };
    if (req.body.do !== "allow") return back({ error: "access_denied", state: held.params.state });
    const scopes = held.params.scopes.filter((s) => s === "foodblock:read" || (s === "foodblock:draft" && req.body.draft === "1"));
    const code = secret();
    codes.set(keyOf(code), { client: held.client.client_id, person: session.person, challenge: held.params.codeChallenge, redirectUri: held.params.redirectUri, scopes, resource: held.params.resource, expires: now() + CODE_MS });
    back({ code, state: held.params.state });
  });

  // The account page: who is signed in, which assistants hold a token for them, revoke.
  app.get("/account", (req, res) => {
    const session = sessionOf(req);
    if (!session) return ask(res, { kind: "next", next: "/account" }, "Sign in to see which assistants are connected to your node.");
    const mine = new Map();
    for (const [, t] of [...state.refresh.entries(), ...state.access.entries()]) if (t.person === session.person) mine.set(t.clientId, [...new Set([...(mine.get(t.clientId) || []), ...t.scopes])]);
    const who = accountOfPerson(session.person);
    send(res, page("Your FoodX connections", `<h2>Your connections</h2><p class="mut">Signed in as ${esc(who?.email || who?.name || "you")}. Your node is <code>${esc(session.person.slice(0, 12))}</code>.</p>
      ${[...mine].map(([cid, sc]) => `<form class="card" method="post" action="/account/revoke"><input type="hidden" name="csrf" value="${esc(session.csrf)}"><input type="hidden" name="client" value="${esc(cid)}"><b>${esc(state.clients.get(cid)?.client_name || "An assistant")}</b><div class="mut">${esc(sc.map((s) => s.replace("foodblock:", "")).join(", "))}</div><button class="quiet">Disconnect</button></form>`).join("") || "<p>No assistants are connected.</p>"}
      <form method="post" action="/account/signout"><input type="hidden" name="csrf" value="${esc(session.csrf)}"><button class="quiet">Sign out</button></form>`));
  });
  app.post("/account/revoke", form, (req, res) => {
    const session = sessionOf(req);
    if (!session || !same(req.body?.csrf, session.csrf)) return send(res, page("Sign in again", "<p>Your sign-in is missing or old.</p>", 403));
    dropTokens(session.person, String(req.body.client || ""));
    res.redirect(303, "/account");
  });
  app.post("/account/signout", form, (req, res) => {
    const session = sessionOf(req);
    if (session && same(req.body?.csrf, session.csrf)) state.sessions.delete(session.key);
    res.append("set-cookie", "fb_session=; Path=/; Max-Age=0"); res.redirect(303, "/");
  });

  // The person's tap, on a draft. Only the signed-in person's own door is ever consulted.
  const draftPage = (door, id) => { const item = door.drafts.get(id); return item; };
  app.all("/approve/:id", form, async (req, res) => {
    const id = req.params.id, session = sessionOf(req);
    if (!/^[0-9a-f]{64}$/.test(id)) return send(res, page("Not found", "<p>No such draft.</p>", 404));
    if (!session) return ask(res, { kind: "next", next: `/approve/${id}` }, "Sign in to read exactly what would be sent and tap to send it.");
    const door = await doorFor(session.person), item = draftPage(door, id);
    if (!item) return send(res, page("Not found", "<p>No such draft here.</p>", 404));
    if (req.method === "POST") {
      if (!same(req.body?.csrf, session.csrf)) return send(res, page("Sign in again", "<p>Your sign-in is old. Reload and try again.</p>", 403));
      let result;
      try { await door.sync(); result = req.body.do === "discard" ? door.discard(id, door.approvalCode) : door.approve(id, door.approvalCode); if (result.ok) await door.flush(); }
      catch (error) { result = { ok: false, reason: `the node did not take it: ${error.message}` }; }
      return send(res, result.ok ? page("Done", `<h2>${req.body.do === "discard" ? "Discarded" : "Sent"}</h2>${result.receipt ? `<p>Receipt <b>${esc(result.receipt)}</b></p>` : ""}`) : page("Not done", `<h2>Not done</h2><p>${esc(result.reason || "not done")}</p>`, 403));
    }
    if (req.method !== "GET") return res.status(405).end();
    if (item.status !== "pending") return send(res, page("Draft", `<p>This draft is ${esc(item.status)}.</p>`));
    send(res, page("Approve", `<h2>${esc(item.kind)}</h2><p>${esc(item.summary)}</p><p>Receipt <b>${esc(item.receipt)}</b></p>
      <form method="post"><input type="hidden" name="csrf" value="${esc(session.csrf)}"><button name="do" value="send">Send as me</button> <button class="quiet" name="do" value="discard">Discard</button></form>
      <p class="mut">Nothing is sent or bound until you tap. A recipient who asked for no contact is checked again at the tap.</p>`));
  });

  // ---- OAuth endpoints (the SDK's router, with our limits instead of its per-address ones: behind the proxy it would see one address) ----
  const url = new URL(publicUrl);
  const off = { rateLimit: false };
  app.use("/register", guarded("register", cap.register, 3600e3));
  app.use("/token", guarded("token", cap.token, 60e3));
  app.use("/authorize", guarded("signin", cap.signin, 600e3, false));
  // Discovery fallbacks the MCP authorization spec (2025-11-25) has clients try: the root protected-resource URL (after the path-suffixed one the 401 names)
  // and OpenID Connect discovery for the authorization server. Same documents, so any client finds them.
  app.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") {
      if (req.path === "/.well-known/oauth-protected-resource") req.url = "/.well-known/oauth-protected-resource/mcp" + req.url.slice(req.path.length);
      else if (req.path === "/.well-known/openid-configuration" || req.path === "/.well-known/openid-configuration/mcp") req.url = "/.well-known/oauth-authorization-server" + req.url.slice(req.path.length);
    }
    next();
  });
  app.use(mcpAuthRouter({ provider, issuerUrl: url, baseUrl: url, scopesSupported: SCOPES, resourceName: "FoodX", resourceServerUrl: new URL(resourceUrl), serviceDocumentationUrl: new URL("https://foodx.network/docs/mcp"),
    authorizationOptions: off, tokenOptions: off, clientRegistrationOptions: off, revocationOptions: off }));

  // ---- the MCP endpoint: bearer -> that person's door ----
  const bearer = requireBearerAuth({ verifier: provider, requiredScopes: [SCOPES[0]], resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(resourceUrl)) });
  app.all("/mcp", (req, res, next) => bearer(req, res, next), express.json({ limit: "4mb" }), async (req, res) => {
    const person = req.auth?.extra?.person, r = allow(`mcp:${person}`, cap.mcp, 60e3);
    if (!r.ok) return tooMany(res, r);
    try { const door = await doorFor(person); await mcp(req, res, req.method === "POST" ? req.body : undefined, req.auth, door, person); }
    catch (error) { if (!res.headersSent) res.status(500).json({ error: "server_error", error_description: "the door could not serve this request" }); else res.end(); }
  });
  if (extend) extend({ app, express, send, page, esc, sessionOf, ask, requestGrant, custodyOf, doorFor, accountOfPerson, form, allow, ip });
  app.use((req, res) => res.status(404).end());

  return { app, state, doorFor, provider, accountFor, doors, custodyOf, requestGrant, linkGoogle };
}
