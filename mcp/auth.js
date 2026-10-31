// Authorization for the hosted door, per the MCP authorization spec (OAuth 2.1: protected-resource metadata, authorization-server
// metadata, dynamic client registration, authorization code with PKCE, bearer access tokens, refresh). The MCP SDK serves the protocol;
// this file is the one thing it asks of us, the provider: who may connect, and what a token is worth.
//
// What a token is worth is small on purpose. OAuth here only says "this assistant may reach the door": scopes
//   foodblock:read    find and read                 foodblock:draft   ask, connect, and the promise or accept that a grant allows
//   foodblock:talk    send what the person says to her own agent, which the host runs (a host that has one), which may draft things for her to approve
// Authority to BIND the person is never an OAuth scope. It is a grant block the person signs after the assistant calls
// `foodblock_connect` (door.js), so the OAuth token cannot be stretched into binding anyone. The person says yes to a
// client on the consent page with their approval code, which the assistant never sees. No secret is ever in a URL
// except the single-use, PKCE-bound authorization code the spec itself puts in the redirect.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import express from "express";
import { InvalidTokenError, InvalidGrantError, InvalidRequestError, InvalidClientMetadataError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";

export const SCOPES = ["foodblock:read", "foodblock:draft", "foodblock:talk"];
const ACCESS_SECONDS = 3600, REFRESH_SECONDS = 30 * 86400, CODE_MS = 5 * 60e3, TRIES = 5, MAX_CLIENTS = 5000;
const secret = () => randomBytes(32).toString("base64url");
const keyOf = (value) => createHash("sha256").update(String(value)).digest("hex"); // tokens are kept only as hashes
const same = (a, b) => { const x = Buffer.from(String(a || "").trim().toUpperCase()), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const page = (body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect an assistant</title><body style="font:18px system-ui;max-width:32rem;margin:2rem auto;padding:0 1rem">${body}</body>`;

/** The OAuth provider for one door. `approvalCode` is the person's, as door.approvalCode. */
export function doorProvider({ approvalCode, now = () => Date.now() }) {
  const used = new Set(), clients = new Map(), pending = new Map(), codes = new Map(), access = new Map(), refresh = new Map();
  const clientsStore = {
    getClient: (id) => clients.get(id),
    // registrations are bounded: one nobody has used in a week is dropped as a new one comes, and past MAX_CLIENTS no more are taken (release 52)
    registerClient: (client) => {
      for (const [id, c] of clients) if (!used.has(id) && c.client_id_issued_at * 1000 < now() - 7 * 86400e3) clients.delete(id);
      if (clients.size >= MAX_CLIENTS) throw new InvalidClientMetadataError("registrations are full for now; try again later");
      const full = { ...client, client_id: randomUUID(), client_id_issued_at: Math.floor(now() / 1000) }; clients.set(full.client_id, full); return full;
    },
  };
  const scopesFor = (asked) => { const wanted = asked?.length ? asked : SCOPES; const bad = wanted.filter((s) => !SCOPES.includes(s)); if (bad.length) throw new InvalidRequestError(`unknown scope: ${bad.join(" ")}`); return wanted; };
  const issue = (client, scopes, resource) => {
    used.add(client.client_id);
    const token = secret(), again = secret();
    access.set(keyOf(token), { clientId: client.client_id, scopes, expiresAt: Math.floor(now() / 1000) + ACCESS_SECONDS, resource });
    refresh.set(keyOf(again), { clientId: client.client_id, scopes, expires: now() + REFRESH_SECONDS * 1000, resource });
    return { access_token: token, token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token: again, scope: scopes.join(" ") };
  };
  const consentPage = (request, note = "") => {
    const { client, params } = pending.get(request);
    return page(`<h2>Connect ${esc(client.client_name || "an assistant")}?</h2>
      <p>It would be able to <b>${params.scopes.includes("foodblock:read") ? "find and read" : ""}${params.scopes.includes("foodblock:draft") ? " and draft" : ""}</b> on your node.${params.scopes.includes("foodblock:talk") ? " It would also <b>send what you say to your own agent, which may draft things for you to approve</b>." : ""}
      It cannot send or bind anything for you. Anything it drafts waits for your tap, and binding for you needs a separate grant you sign.</p>
      <p style="color:#555">It will return to ${esc(new URL(params.redirectUri).host)}.</p>${note ? `<p style="color:#a00">${esc(note)}</p>` : ""}
      <form method="post" action="/oauth/consent"><input type="hidden" name="request" value="${esc(request)}">
      <p>Your approval code: <input name="code" autocomplete="off" autofocus style="font:inherit;width:12rem"></p>
      <button name="do" value="allow" style="font:inherit">Connect</button> <button name="do" value="deny" style="font:inherit">Cancel</button></form>`);
  };
  return {
    clientsStore,
    async authorize(client, params, res) {
      const scopes = scopesFor(params.scopes);
      const request = secret();
      pending.set(request, { client, params: { ...params, scopes }, tries: 0, expires: now() + CODE_MS });
      res.status(200).type("html").set("cache-control", "no-store").send(consentPage(request));
    },
    /** The consent form's POST: the person's approval code is the yes. Redirects back to the client with a single-use code. */
    consent(req, res) {
      const request = req.body?.request, held = pending.get(request);
      const back = (query) => { const url = new URL(held.params.redirectUri); Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, v)); res.redirect(302, url.toString()); };
      if (!held || held.expires < now()) { res.status(400).type("html").send(page("<p>This request has expired. Start again from your assistant.</p>")); return; }
      if (req.body.do === "deny") { pending.delete(request); return back({ error: "access_denied", state: held.params.state }); }
      if (!same(req.body.code, approvalCode)) {
        if (++held.tries >= TRIES) { pending.delete(request); return back({ error: "access_denied", error_description: "too many wrong codes", state: held.params.state }); }
        res.status(403).type("html").send(consentPage(request, "That is not your approval code.")); return;
      }
      pending.delete(request);
      const code = secret();
      codes.set(keyOf(code), { client: held.client.client_id, challenge: held.params.codeChallenge, redirectUri: held.params.redirectUri, scopes: held.params.scopes, resource: held.params.resource, expires: now() + CODE_MS });
      back({ code, state: held.params.state });
    },
    async challengeForAuthorizationCode(client, code) {
      const held = codes.get(keyOf(code));
      if (!held || held.client !== client.client_id || held.expires < now()) throw new InvalidGrantError("unknown or expired authorization code");
      return held.challenge;
    },
    async exchangeAuthorizationCode(client, code, _verifier, redirectUri) {
      const held = codes.get(keyOf(code));
      codes.delete(keyOf(code)); // single use, whatever happens next
      if (!held || held.client !== client.client_id || held.expires < now()) throw new InvalidGrantError("unknown or expired authorization code");
      if (redirectUri && redirectUri !== held.redirectUri) throw new InvalidGrantError("redirect_uri does not match");
      return issue(client, held.scopes, held.resource);
    },
    async exchangeRefreshToken(client, token, scopes) {
      const held = refresh.get(keyOf(token));
      refresh.delete(keyOf(token)); // rotated: a refresh token is used once
      if (!held || held.clientId !== client.client_id || held.expires < now()) throw new InvalidGrantError("unknown or expired refresh token");
      const narrowed = scopes?.length ? scopes.filter((s) => held.scopes.includes(s)) : held.scopes;
      return issue(client, narrowed, held.resource);
    },
    async verifyAccessToken(token) {
      const held = access.get(keyOf(token));
      if (!held || held.expiresAt * 1000 < now()) throw new InvalidTokenError("unknown or expired token");
      return { token, clientId: held.clientId, scopes: held.scopes, expiresAt: held.expiresAt, ...(held.resource ? { resource: held.resource } : {}) };
    },
    async revokeToken(client, { token }) { for (const store of [access, refresh]) { const held = store.get(keyOf(token)); if (held?.clientId === client.client_id) store.delete(keyOf(token)); } },
  };
}

/**
 * The door's HTTP face with authorization: OAuth endpoints, the consent page, the approval page, and /mcp behind a bearer token.
 * @param mcp  async (req, res, body, auth) handling one MCP request
 * @returns    { app, mount(baseUrl) }: call mount once the public base URL is known
 */
export function authorizedApp({ door, mcp, approve, provider }) {
  const app = express();
  let router = null;
  app.disable("x-powered-by");
  const verifier = { verifyAccessToken: (token) => provider.verifyAccessToken(token) };
  let bearer = null;
  app.use((req, res, next) => (router ? router(req, res, next) : res.status(503).end()));
  return {
    app,
    mount(base) {
      const url = new URL(base), resource = new URL("/mcp", url);
      const metadata = getOAuthProtectedResourceMetadataUrl(resource);
      bearer = requireBearerAuth({ verifier, requiredScopes: [SCOPES[0]], resourceMetadataUrl: metadata });
      const inner = express.Router();
      inner.use((req, _res, next) => { // discovery fallbacks the spec has clients try (root protected-resource URL, OpenID Connect discovery)
        if (req.method === "GET" || req.method === "HEAD") {
          if (req.path === "/.well-known/oauth-protected-resource") req.url = "/.well-known/oauth-protected-resource/mcp" + req.url.slice(req.path.length);
          else if (req.path === "/.well-known/openid-configuration" || req.path === "/.well-known/openid-configuration/mcp") req.url = "/.well-known/oauth-authorization-server" + req.url.slice(req.path.length);
        }
        next();
      });
      inner.use(mcpAuthRouter({ provider, issuerUrl: url, baseUrl: url, scopesSupported: SCOPES, resourceName: "FoodBlock", resourceServerUrl: resource }));
      inner.post("/oauth/consent", express.urlencoded({ extended: false, limit: "8kb" }), (req, res) => provider.consent(req, res));
      inner.use(async (req, res, next) => { try { if (await approve(req, res)) return; next(); } catch (error) { next(error); } });
      inner.all("/mcp", (req, res, next) => bearer(req, res, next), express.json({ limit: "4mb" }), async (req, res) => {
        try { await mcp(req, res, req.method === "POST" ? req.body : undefined, req.auth); }
        catch (error) { if (!res.headersSent) res.status(500); res.end(String(error.message)); }
      });
      inner.use((req, res) => res.status(404).end());
      router = inner;
    },
  };
}
