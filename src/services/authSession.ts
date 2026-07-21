import { ACCOUNT_OAUTH_CLIENT_ID } from "./oauthConfig";

const USER_STORAGE_KEY = "chmlfrp_user";
const isBrowser = typeof window !== "undefined";

export interface StoredUser {
  username: string;
  usergroup: string;
  userimg?: string | null;
  usertoken?: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  tokenType?: string;
  tunnelCount?: number;
  tunnel?: number;
  oauthClientId?: string;
}

export type UserSessionPersistence = "persistent" | "session";

function normalizeStoredUser(user: StoredUser): StoredUser | null {
  const accessToken = user.accessToken?.trim();
  if (!accessToken) return null;

  const expiresAt =
    user.accessTokenExpiresAt == null
      ? Number.NaN
      : Number(user.accessTokenExpiresAt);
  return {
    ...user,
    accessToken,
    accessTokenExpiresAt: Number.isFinite(expiresAt) ? expiresAt : undefined,
  };
}

function readStoredUser(storage: Storage): StoredUser | null {
  const saved = storage.getItem(USER_STORAGE_KEY);
  if (!saved) return null;

  try {
    const user = normalizeStoredUser(JSON.parse(saved) as StoredUser);
    if (
      !user ||
      (user.oauthClientId && user.oauthClientId !== ACCOUNT_OAUTH_CLIENT_ID)
    ) {
      storage.removeItem(USER_STORAGE_KEY);
      return null;
    }
    return user;
  } catch {
    storage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

export function getStoredUser(): StoredUser | null {
  if (!isBrowser) return null;
  return readStoredUser(localStorage) ?? readStoredUser(sessionStorage);
}

export function getStoredUserPersistence(): UserSessionPersistence {
  if (!isBrowser || readStoredUser(localStorage)) return "persistent";
  return readStoredUser(sessionStorage) ? "session" : "persistent";
}

export function saveStoredUser(
  user: StoredUser,
  persistence = getStoredUserPersistence(),
) {
  if (!isBrowser) return;

  const normalized = normalizeStoredUser(user);
  if (!normalized) {
    clearStoredUser();
    return;
  }

  const storage = persistence === "persistent" ? localStorage : sessionStorage;
  const otherStorage =
    persistence === "persistent" ? sessionStorage : localStorage;
  storage.setItem(
    USER_STORAGE_KEY,
    JSON.stringify({ ...normalized, oauthClientId: ACCOUNT_OAUTH_CLIENT_ID }),
  );
  otherStorage.removeItem(USER_STORAGE_KEY);
}

export function clearStoredUser() {
  if (!isBrowser) return;
  localStorage.removeItem(USER_STORAGE_KEY);
  sessionStorage.removeItem(USER_STORAGE_KEY);
}
