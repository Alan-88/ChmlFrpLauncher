// Run with: pnpm exec vite build --ssr scripts/oauth-session-check.ts --outDir /tmp/chmlfrp-oauth-check && node /tmp/chmlfrp-oauth-check/oauth-session-check.js
import assert from "node:assert/strict";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const localStorage = createStorage();
const sessionStorage = createStorage();

Object.defineProperties(globalThis, {
  window: { value: {}, configurable: true },
  localStorage: { value: localStorage, configurable: true },
  sessionStorage: { value: sessionStorage, configurable: true },
});

let refreshCalls = 0;
let tunnelCalls = 0;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith("/oauth2/token")) {
    refreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(
      JSON.stringify({
        access_token: "fresh-access-token",
        refresh_token: "fresh-refresh-token",
        expires_in: 600,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  assert.match(url, /\/tunnel$/);
  tunnelCalls += 1;
  const authorization = new Headers(init?.headers).get("authorization");
  if (tunnelCalls === 1) {
    assert.equal(authorization, "Bearer retry-access-token");
    return Response.json({ code: 401, msg: "token过期" });
  }
  assert.equal(authorization, "Bearer fresh-access-token");
  return Response.json({ code: 200, data: [] });
};

const { getStoredUser, saveStoredUser } =
  await import("../src/services/authSession");
const { clearSessionForAccessToken, getAuthorization, getRetryAuthorization } =
  await import("../src/services/oauthSession");
const { fetchTunnels } = await import("../src/services/api");

saveStoredUser(
  {
    username: "test",
    usergroup: "test",
    accessToken: "expired-access-token",
    refreshToken: "refresh-token",
    accessTokenExpiresAt: Date.now() - 1,
  },
  "persistent",
);

const [first, second] = await Promise.all([
  getAuthorization(),
  getAuthorization(),
]);
assert.equal(first.value, "Bearer fresh-access-token");
assert.equal(second.value, "Bearer fresh-access-token");
assert.equal(refreshCalls, 1);

assert.equal(
  (await getRetryAuthorization("expired-access-token"))?.value,
  "Bearer fresh-access-token",
);
clearSessionForAccessToken("expired-access-token");
assert.equal(getStoredUser()?.accessToken, "fresh-access-token");

refreshCalls = 0;
saveStoredUser(
  {
    username: "test",
    usergroup: "test",
    accessToken: "retry-access-token",
    refreshToken: "retry-refresh-token",
    accessTokenExpiresAt: Date.now() + 600_000,
  },
  "persistent",
);
assert.deepEqual(await fetchTunnels(), []);
assert.equal(refreshCalls, 1);
assert.equal(tunnelCalls, 2);
assert.equal(getStoredUser()?.accessToken, "fresh-access-token");

console.log("oauth session check passed");
