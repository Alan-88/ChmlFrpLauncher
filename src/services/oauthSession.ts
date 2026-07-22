import {
  ACCOUNT_OAUTH_CLIENT_ID,
  ACCOUNT_OAUTH_CLIENT_SECRET,
  ACCOUNT_OAUTH_ISSUER,
  DEVICE_CODE_DEFAULT_SCOPE,
} from "./oauthConfig";
import {
  clearStoredUser,
  getStoredUser,
  getStoredUserPersistence,
  saveStoredUser,
  type StoredUser,
} from "./authSession";

export const AUTH_SESSION_EXPIRED_MESSAGE = "登录信息已过期，请重新登录";

const AUTHENTICATION_ERROR_PATTERNS = [
  "登录信息错误",
  "登录信息已过期",
  "无效的登录状态",
  "token无效",
  "token失效",
  "token过期",
  "invalid token",
  "invalid_grant",
  "unauthorized",
  "http 401",
];

export interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
}

export interface DeviceTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

export interface OAuthAuthorization {
  value: string;
  sessionAccessToken?: string;
}

interface RawHttpResponse {
  status: number;
  body: string;
}

// ponytail: this launcher has one active account; use a token-keyed Map for multi-account sessions.
let refreshInFlight:
  | { refreshToken: string; promise: Promise<StoredUser> }
  | undefined;

export function isAuthenticationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return AUTHENTICATION_ERROR_PATTERNS.some((pattern) =>
    normalized.includes(pattern.toLowerCase()),
  );
}

function getOAuthUrl(path: string): string {
  return new URL(path, ACCOUNT_OAUTH_ISSUER).toString();
}

function getOAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (ACCOUNT_OAUTH_CLIENT_SECRET.trim()) {
    headers.Authorization = `Basic ${btoa(
      `${ACCOUNT_OAUTH_CLIENT_ID}:${ACCOUNT_OAUTH_CLIENT_SECRET}`,
    )}`;
  }

  return headers;
}

function getOAuthErrorMessage(
  response: DeviceTokenResponse | undefined,
  fallback: string,
): string {
  return response?.error_description || response?.error || fallback;
}

function getCurrentAccessToken(user: StoredUser | null): string | undefined {
  return user?.accessToken?.trim() || undefined;
}

function isAccessTokenExpiring(user: StoredUser): boolean {
  return Boolean(
    user.accessTokenExpiresAt &&
    Date.now() >= user.accessTokenExpiresAt - 60_000,
  );
}

function toBearerHeader(token: string): string {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

function toAuthorization(accessToken: string): OAuthAuthorization {
  return {
    value: toBearerHeader(accessToken),
    sessionAccessToken: accessToken,
  };
}

async function oauthRequest(options: {
  path: string;
  body: URLSearchParams;
}): Promise<RawHttpResponse> {
  const response = await fetch(getOAuthUrl(options.path), {
    method: "POST",
    headers: getOAuthHeaders(),
    body: options.body.toString(),
    cache: "no-store",
    credentials: "omit",
  });

  return { status: response.status, body: await response.text() };
}

function parseOAuthJson<T>(response: RawHttpResponse, fallback: string): T {
  try {
    return JSON.parse(response.body) as T;
  } catch {
    const content = response.body.trim().toLowerCase();
    if (content.startsWith("<!doctype html") || content.startsWith("<html")) {
      throw new Error(
        "账户中心返回了登录页而不是 OAuth 响应，请确认当前请求必须使用浏览器环境发起，且 client_id 已开启设备码授权。",
      );
    }
    if (response.status === 401) {
      throw new Error(
        "账户中心拒绝了当前客户端，请检查 client_id 或 client_secret 是否正确。",
      );
    }
    throw new Error(fallback);
  }
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<DeviceTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  if (!ACCOUNT_OAUTH_CLIENT_SECRET.trim()) {
    body.set("client_id", ACCOUNT_OAUTH_CLIENT_ID);
  }

  return parseOAuthJson<DeviceTokenResponse>(
    await oauthRequest({ path: "/oauth2/token", body }),
    "账户服务返回了无法解析的刷新响应",
  );
}

function clearStoredUserIfCurrentAccessToken(accessToken: string) {
  if (getCurrentAccessToken(getStoredUser()) === accessToken) {
    clearStoredUser();
  }
}

async function refreshStoredUser(storedUser: StoredUser): Promise<StoredUser> {
  const currentAccessToken = getCurrentAccessToken(storedUser);
  if (!currentAccessToken || !storedUser.refreshToken) {
    throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
  }

  const refreshed = await refreshAccessToken(storedUser.refreshToken);
  if (!refreshed.access_token) {
    clearStoredUserIfCurrentAccessToken(currentAccessToken);
    throw new Error(
      getOAuthErrorMessage(refreshed, AUTH_SESSION_EXPIRED_MESSAGE),
    );
  }

  const updatedUser: StoredUser = {
    ...storedUser,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || storedUser.refreshToken,
    accessTokenExpiresAt: refreshed.expires_in
      ? Date.now() + refreshed.expires_in * 1000
      : storedUser.accessTokenExpiresAt,
    tokenType: refreshed.token_type || storedUser.tokenType || "Bearer",
  };
  saveStoredUser(updatedUser, getStoredUserPersistence());
  return updatedUser;
}

async function refreshStoredUserOnce(
  storedUser: StoredUser,
): Promise<StoredUser> {
  const refreshToken = storedUser.refreshToken;
  if (!refreshToken) throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);

  const inFlight = refreshInFlight;
  if (inFlight?.refreshToken === refreshToken) {
    return inFlight.promise;
  }

  const promise = refreshStoredUser(storedUser);
  refreshInFlight = { refreshToken, promise };
  try {
    return await promise;
  } finally {
    if (refreshInFlight?.promise === promise) {
      refreshInFlight = undefined;
    }
  }
}

export async function getAuthorization(
  explicitToken?: string,
): Promise<OAuthAuthorization> {
  if (explicitToken?.trim()) {
    return { value: toBearerHeader(explicitToken.trim()) };
  }

  const storedUser = getStoredUser();
  const accessToken = getCurrentAccessToken(storedUser);
  if (!storedUser || !accessToken) {
    throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
  }

  if (storedUser.refreshToken && isAccessTokenExpiring(storedUser)) {
    return toAuthorization(
      getCurrentAccessToken(await refreshStoredUserOnce(storedUser))!,
    );
  }

  return toAuthorization(accessToken);
}

export async function getRetryAuthorization(
  failedAccessToken: string,
): Promise<OAuthAuthorization | null> {
  const storedUser = getStoredUser();
  const currentAccessToken = getCurrentAccessToken(storedUser);
  if (!storedUser || !currentAccessToken) return null;

  if (currentAccessToken !== failedAccessToken) {
    return toAuthorization(currentAccessToken);
  }
  if (!storedUser.refreshToken) return null;

  try {
    return toAuthorization(
      getCurrentAccessToken(await refreshStoredUserOnce(storedUser))!,
    );
  } catch {
    return null;
  }
}

export function clearSessionForAccessToken(accessToken: string) {
  clearStoredUserIfCurrentAccessToken(accessToken);
}

export async function createDeviceAuthorization(
  scope = DEVICE_CODE_DEFAULT_SCOPE,
): Promise<DeviceAuthorizationResponse> {
  const body = new URLSearchParams({ client_id: ACCOUNT_OAUTH_CLIENT_ID });
  const normalizedScope = scope
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" ");
  if (normalizedScope) body.set("scope", normalizedScope);

  const response = await oauthRequest({
    path: "/oauth2/device_authorization",
    body,
  });
  const data = parseOAuthJson<
    DeviceAuthorizationResponse | DeviceTokenResponse
  >(response, "账户服务返回了无法解析的响应");
  if (
    response.status >= 200 &&
    response.status < 300 &&
    "device_code" in data
  ) {
    return data;
  }
  throw new Error(getOAuthErrorMessage(data, "申请设备授权失败"));
}

export async function exchangeDeviceCodeForToken(
  deviceCode: string,
): Promise<DeviceTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    device_code: deviceCode,
  });
  if (!ACCOUNT_OAUTH_CLIENT_SECRET.trim()) {
    body.set("client_id", ACCOUNT_OAUTH_CLIENT_ID);
  }

  return parseOAuthJson<DeviceTokenResponse>(
    await oauthRequest({ path: "/oauth2/token", body }),
    "账户服务返回了无法解析的令牌响应",
  );
}
