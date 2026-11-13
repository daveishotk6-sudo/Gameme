/**
 * PlayFab accounts (title 15169B). Talks to PlayFab's REST API directly, so there is no extra server
 * to run and no SDK to install. Only the public Title ID lives in this file: the Secret Key must
 * never be put in client code.
 *
 * Players sign up with just a username + password (no email). The username is stored lowercase, so
 * "Dave" and "dave" can never both exist. The name shown in game is the display name the player picked
 * when signing up. With no email there is no password reset: a lost password means a lost account.
 */

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export const TITLE_ID = env.VITE_PLAYFAB_TITLE_ID || "15169B";
const BASE = `https://${TITLE_ID}.playfabapi.com`;

const ACCOUNT_KEY = "gameme:playfab";
const SIGNUP_KEY = "gameme:signup";
/** One new account per device per this many hours (a speed bump, not real protection: see README). */
export const SIGNUP_COOLDOWN_HOURS = 24;

export type Account = {
  playFabId: string;
  sessionTicket: string;
  /** Lowercase login name. */
  username: string;
  /** The name shown in game, with the capitals the player chose. */
  displayName: string;
};

export class PlayFabError extends Error {
  constructor(
    public status: number,
    message: string,
    /** PlayFab's error name, e.g. "UsernameNotAvailable", or "NETWORK". */
    public code = "",
    public errorCode = 0,
  ) {
    super(message);
  }
  /** The login is over (session ran out, was revoked, or the account was banned): back to the login screen. */
  get expired() {
    return this.status === 401 || /NotAuthenticated|InvalidSessionTicket|ExpiredAuthToken|SessionTicket|AccountBanned|AccountDeleted/i.test(this.code);
  }
}

// ------------------------------------------------------------------ names & storage

/** 3 to 16 letters, numbers or underscores (and at least 3 that aren't underscores). Returns a message, or null if fine. */
export function validateName(name: string): string | null {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name) || name.replace(/_/g, "").length < 3) {
    return "Use 3 to 16 letters, numbers or underscores.";
  }
  return null;
}

/** The name used in game: always safe characters, at most 16 long. */
export function gameName(a: Account): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "").slice(0, 16);
  return clean(a.displayName) || clean(a.username) || "Player";
}

export function loadAccount(): Account | null {
  try {
    const a = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null");
    return a && typeof a.playFabId === "string" && typeof a.sessionTicket === "string" ? (a as Account) : null;
  } catch {
    return null;
  }
}
export function saveAccount(a: Account) {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a));
  } catch {
    /* private mode: the login lasts until the tab closes */
  }
}
export function clearAccount() {
  try {
    localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* ignore */
  }
}

function signupWaitMs(): number {
  try {
    const t = Number(localStorage.getItem(SIGNUP_KEY) || 0);
    return Math.max(0, t + SIGNUP_COOLDOWN_HOURS * 3600e3 - Date.now());
  } catch {
    return 0;
  }
}

// ------------------------------------------------------------------ REST

type Json = Record<string, unknown>;

async function call<T>(endpoint: string, body: Json, ticket?: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(BASE + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(ticket ? { "X-Authorization": ticket } : {}) },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new PlayFabError(0, "Can't reach PlayFab. Check your connection and try again.", "NETWORK");
  } finally {
    clearTimeout(timer);
  }
  let json: { code?: number; error?: string; errorCode?: number; errorMessage?: string; errorDetails?: Record<string, string[]>; data?: unknown } | null = null;
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !json || (json.code !== undefined && json.code !== 200)) {
    const detail = json?.errorDetails ? Object.values(json.errorDetails).flat().join(" ") : "";
    throw new PlayFabError(res.status, json?.errorMessage ? `${json.errorMessage}${detail ? " " + detail : ""}` : `PlayFab error (${res.status})`, json?.error || "", json?.errorCode || 0);
  }
  return json.data as T;
}

/** Plain-English message for a PlayFab error. */
export function explain(e: unknown): string {
  if (!(e instanceof PlayFabError)) return "Something went wrong. Try again.";
  const code = e.code;
  const n = e.errorCode;
  if (code === "NETWORK" || code === "SignupCooldown") return e.message;
  if (code === "InvalidParams") {
    // PlayFab's catch-all for a bad field: say which one in plain words.
    if (/password/i.test(e.message)) return "Passwords must be 6 to 100 characters.";
    if (/username/i.test(e.message)) return "Use 3 to 16 letters, numbers or underscores for your name.";
  }
  if (code === "UsernameNotAvailable" || n === 1009 || code === "NameNotAvailable") return "That name is already taken. Try another.";
  if (code === "InvalidUsername" || n === 1007) return "Use 3 to 16 letters, numbers or underscores for your name.";
  if (code === "InvalidPassword" || n === 1008) return "Passwords must be 6 to 100 characters.";
  if (code === "AccountBanned" || n === 1002) return "This account has been banned.";
  if (code === "AccountDeleted") return "This account no longer exists.";
  if (/InvalidUsernameOrPassword|InvalidEmailOrPassword|AccountNotFound/.test(code) || n === 1001) return "Wrong name or password.";
  if (e.status === 429 || /Throttled|RateLimit/i.test(code)) return "Too many attempts. Wait a minute and try again.";
  if (e.expired) return "Your login expired. Please log in again.";
  return e.message || "Something went wrong. Try again.";
}

// ------------------------------------------------------------------ accounts

const INFO = { GetUserAccountInfo: true, GetPlayerProfile: true, ProfileConstraints: { ShowDisplayName: true } };

type LoginData = {
  PlayFabId: string;
  SessionTicket: string;
  Username?: string;
  InfoResultPayload?: {
    AccountInfo?: { Username?: string; TitleInfo?: { DisplayName?: string } };
    PlayerProfile?: { DisplayName?: string };
  };
};

function accountFrom(d: LoginData, fallbackName: string): Account {
  const info = d.InfoResultPayload;
  const username = (info?.AccountInfo?.Username || d.Username || fallbackName).toLowerCase();
  return {
    playFabId: d.PlayFabId,
    sessionTicket: d.SessionTicket,
    username,
    displayName: info?.PlayerProfile?.DisplayName || info?.AccountInfo?.TitleInfo?.DisplayName || fallbackName,
  };
}

/** Create an account. The name is permanent. Throws a PlayFabError. */
export async function registerAccount(input: { name: string; password: string }): Promise<Account> {
  const bad = validateName(input.name);
  if (bad) throw new PlayFabError(400, bad, "InvalidUsername");
  const wait = signupWaitMs();
  if (wait > 0) {
    const h = Math.ceil(wait / 3600e3);
    throw new PlayFabError(429, `This device already made an account. You can make another in about ${h} hour${h === 1 ? "" : "s"}.`, "SignupCooldown");
  }
  const d = await call<LoginData>("/Client/RegisterPlayFabUser", {
    TitleId: TITLE_ID,
    Username: input.name.toLowerCase(),
    DisplayName: input.name,
    Password: input.password,
    RequireBothUsernameAndEmail: false, // name + password is enough
    InfoRequestParameters: INFO,
  });
  try {
    localStorage.setItem(SIGNUP_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  const a = accountFrom(d, input.name);
  a.displayName = input.name; // a brand-new profile has nothing to read back yet
  return a;
}

/** Log in with a name (an email also works, for accounts made before email was dropped). */
export async function loginAccount(nameOrEmail: string, password: string): Promise<Account> {
  const id = nameOrEmail.trim();
  const d = id.includes("@")
    ? await call<LoginData>("/Client/LoginWithEmailAddress", { TitleId: TITLE_ID, Email: id, Password: password, InfoRequestParameters: INFO })
    : await call<LoginData>("/Client/LoginWithPlayFab", { TitleId: TITLE_ID, Username: id.toLowerCase(), Password: password, InfoRequestParameters: INFO });
  return accountFrom(d, id.includes("@") ? "" : id);
}

/** Is a saved login still good? Throws a PlayFabError (with `.expired`) if not. */
export async function checkSession(a: Account): Promise<Account> {
  const d = await call<{ AccountInfo?: { Username?: string; TitleInfo?: { DisplayName?: string } } }>("/Client/GetAccountInfo", {}, a.sessionTicket);
  return { ...a, displayName: d.AccountInfo?.TitleInfo?.DisplayName || a.displayName };
}
