/** OAuth metadata for this public desktop client. */
export const ACCOUNT_OAUTH_ISSUER = "https://account-api.qzhua.net";
const UPSTREAM_OAUTH_CLIENT_ID = "019d4334b34972ca9fd41513e5703dfd";

// .env.local is ignored by Git. Vite bakes this public client ID into local builds.
export const ACCOUNT_OAUTH_CLIENT_ID =
  import.meta.env.VITE_CHMLFRP_OAUTH_CLIENT_ID?.trim() ||
  UPSTREAM_OAUTH_CLIENT_ID;

// A public desktop client must never embed a client secret.
export const ACCOUNT_OAUTH_CLIENT_SECRET = "";

export const DEVICE_CODE_DEFAULT_SCOPE =
  "profile email offline_access chmlfrp_api";
