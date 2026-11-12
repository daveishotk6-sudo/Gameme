"use strict";
/**
 * Player accounts for Gameme. No dependencies.
 *
 *  - A name can be claimed once, ever. Names are compared in a canonical form so lookalikes
 *    ("Mike1" / "MikeI" / "mike_") count as taken.
 *  - Passwords are stored only as salted scrypt hashes.
 *  - Everything lives in one JSON file (DATA_DIR/users.json), written atomically with a .bak copy.
 *  - Sessions are signed tokens (HMAC), so they survive restarts without a session table.
 *
 * Endpoints (all JSON):
 *   GET  /api/health
 *   GET  /api/name-available?name=Foo
 *   POST /api/register   { name, password }  -> { token, name }
 *   POST /api/login      { name, password }  -> { token, name }
 *   GET  /api/me         (Authorization: Bearer <token>) -> { name }
 *   GET  /api/admin/export, POST /api/admin/import   (only when ADMIN_TOKEN is set; x-admin-token header)
 */
const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const RESERVED = [
  "admin", "administrator", "owner", "server", "system", "moderator", "mod", "staff", "support",
  "gameme", "you", "guest", "anonymous", "offline", "null", "undefined",
];
const MAX_FAILS = 5; // wrong passwords per name+connection ...
const FAIL_WINDOW_MS = 10 * 60 * 1000; // ... before a 10 minute lock

/** Canonical form used to decide whether two names "overlap". */
function canon(name) {
  return name.toLowerCase().replace(/_/g, "").replace(/0/g, "o").replace(/[1i]/g, "l");
}
const RESERVED_SET = new Set(RESERVED.map(canon));

class HttpError extends Error {
  constructor(status, message, code, headers) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function createAccounts(opts = {}) {
  const env = process.env;
  const num = (v, d) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
  const cfg = {
    dataDir: opts.dataDir ?? (env.DATA_DIR || path.join(__dirname, "data")),
    maxPerIp: opts.maxAccountsPerIp ?? num(env.MAX_ACCOUNTS_PER_IP, 1),
    windowHours: opts.limitWindowHours ?? num(env.ACCOUNT_LIMIT_WINDOW_HOURS, 24),
    proxyHops: opts.trustProxyHops ?? num(env.TRUST_PROXY_HOPS, 1),
    origins: String(opts.allowedOrigins ?? env.ALLOWED_ORIGINS ?? "*").split(",").map((s) => s.trim()).filter(Boolean),
    adminToken: opts.adminToken ?? env.ADMIN_TOKEN ?? "",
    tokenDays: opts.tokenDays ?? 30,
    scryptN: opts.scryptN ?? 16384,
    requestsPerMinute: opts.requestsPerMinute ?? 120,
  };
  const DB_FILE = path.join(cfg.dataDir, "users.json");
  const BAK_FILE = DB_FILE + ".bak";

  // ------------------------------------------------------------ database file

  function validDb(d) {
    return !!d && typeof d === "object" && typeof d.secret === "string" && d.secret.length >= 16 &&
      !!d.users && typeof d.users === "object" && !Array.isArray(d.users);
  }

  function loadDb() {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    let sawFile = false;
    for (const f of [DB_FILE, BAK_FILE]) {
      if (!fs.existsSync(f)) continue;
      sawFile = true;
      try {
        const d = JSON.parse(fs.readFileSync(f, "utf8"));
        if (!validDb(d)) throw new Error("not a valid account database");
        if (f === BAK_FILE) console.warn(`[accounts] ${DB_FILE} was unreadable; restored from ${BAK_FILE}`);
        return d;
      } catch (e) {
        console.error(`[accounts] cannot read ${f}: ${e.message}`);
      }
    }
    // Never quietly start empty when a database exists: that would free every claimed name.
    if (sawFile) {
      throw new Error(`Account database in ${cfg.dataDir} exists but cannot be read. Fix or restore users.json before starting.`);
    }
    const fresh = { version: 1, secret: crypto.randomBytes(32).toString("hex"), users: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }

  let db = loadDb();
  const secret = () => env.AUTH_SECRET || db.secret;

  let writeChain = Promise.resolve();
  /** Write the database atomically (temp file, fsync, keep previous as .bak, rename). Resolves when on disk. */
  function save() {
    const json = JSON.stringify(db, null, 2);
    writeChain = writeChain.catch(() => {}).then(async () => {
      const tmp = DB_FILE + ".tmp";
      const fh = await fsp.open(tmp, "w");
      try {
        await fh.writeFile(json);
        await fh.sync();
      } finally {
        await fh.close();
      }
      if (fs.existsSync(DB_FILE)) await fsp.copyFile(DB_FILE, BAK_FILE);
      await fsp.rename(tmp, DB_FILE);
    });
    return writeChain;
  }

  let saveTimer = null;
  /** For low-value changes (last login time): save soon, but not on every request. */
  function saveSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      save().catch((e) => console.error("[accounts] save failed:", e.message));
    }, 10000);
    saveTimer.unref?.();
  }
  async function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      await save();
    }
    await writeChain;
  }

  // ------------------------------------------------------------ rate limits (in memory)

  const hits = new Map();
  /** Seconds to wait if over the limit, else 0. */
  function overLimit(key, limit, windowMs) {
    const now = Date.now();
    let h = hits.get(key);
    if (!h || now > h.end) {
      h = { n: 0, end: now + windowMs };
      hits.set(key, h);
    }
    h.n++;
    return h.n > limit ? Math.ceil((h.end - now) / 1000) : 0;
  }
  const fails = new Map();
  function lockedFor(key) {
    const f = fails.get(key);
    if (!f) return 0;
    if (Date.now() > f.end) {
      fails.delete(key);
      return 0;
    }
    return f.n >= MAX_FAILS ? Math.ceil((f.end - Date.now()) / 1000) : 0;
  }
  function addFail(key) {
    const now = Date.now();
    let f = fails.get(key);
    if (!f || now > f.end) f = { n: 0, end: now + FAIL_WINDOW_MS };
    f.n++;
    fails.set(key, f);
  }
  const prune = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now > v.end) hits.delete(k);
    for (const [k, v] of fails) if (now > v.end) fails.delete(k);
  }, 5 * 60 * 1000);
  prune.unref?.();

  // ------------------------------------------------------------ helpers

  function clientIp(req) {
    const xff = req.headers["x-forwarded-for"];
    if (cfg.proxyHops > 0 && typeof xff === "string") {
      const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
      const i = parts.length - cfg.proxyHops; // count from the right: only the proxy's own entry is trustworthy
      if (i >= 0) return parts[i];
    }
    return req.socket.remoteAddress || "unknown";
  }
  const ipHash = (ip) => crypto.createHmac("sha256", secret()).update(String(ip)).digest("hex").slice(0, 32);

  function send(res, status, body, headers) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(headers || {}),
    });
    res.end(JSON.stringify(body));
  }

  function setCors(req, res) {
    const origin = req.headers.origin;
    if (cfg.origins.includes("*")) res.setHeader("Access-Control-Allow-Origin", "*");
    else if (origin && cfg.origins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  function readJson(req, max) {
    return new Promise((resolve, reject) => {
      let size = 0;
      let tooBig = false;
      const chunks = [];
      req.on("data", (c) => {
        size += c.length;
        if (size > max) tooBig = true;
        else chunks.push(c);
      });
      req.on("end", () => {
        if (tooBig) return reject(new HttpError(413, "Request too large", "TOO_LARGE", { Connection: "close" }));
        try {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve(text ? JSON.parse(text) : {});
        } catch {
          reject(new HttpError(400, "Invalid JSON", "BAD_JSON"));
        }
      });
      req.on("error", reject);
    });
  }

  function checkName(raw) {
    if (typeof raw !== "string" || !NAME_RE.test(raw) || canon(raw).length < 3) {
      throw new HttpError(400, "Use 3 to 16 letters, numbers or underscores.", "BAD_NAME");
    }
    const c = canon(raw);
    if (RESERVED_SET.has(c)) throw new HttpError(400, "That name isn't allowed.", "RESERVED");
    return c;
  }
  /** null if free, otherwise why not. */
  function takenReason(raw, c) {
    const u = db.users[c];
    if (!u) return null;
    return u.name.toLowerCase() === raw.toLowerCase() ? "That name is already taken." : "That name is too similar to an existing name.";
  }
  function checkPassword(pw) {
    if (typeof pw !== "string" || pw.length < 6 || pw.length > 128) {
      throw new HttpError(400, "Password must be 6 to 128 characters.", "BAD_PASSWORD");
    }
    return pw;
  }

  async function hashPassword(pw, salt, n) {
    const buf = await scrypt(pw.normalize("NFKC"), salt, 64, { N: n, r: 8, p: 1 });
    return buf.toString("hex");
  }
  const sameHex = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  const DUMMY_SALT = crypto.randomBytes(16).toString("hex");

  function sign(user, c) {
    const body = Buffer.from(JSON.stringify({ c, cr: user.created, exp: Date.now() + cfg.tokenDays * 86400e3 })).toString("base64url");
    const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
    return `${body}.${sig}`;
  }
  function userFromToken(req) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    if (!m) return null;
    const [body, sig] = m[1].split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      const user = db.users[p.c];
      // `cr` ties the token to this exact account, so a deleted-and-reclaimed name can't reuse old tokens.
      if (!user || user.created !== p.cr || !(p.exp > Date.now())) return null;
      return user;
    } catch {
      return null;
    }
  }

  function adminCheck(req) {
    if (!cfg.adminToken) throw new HttpError(404, "Not found", "NOT_FOUND");
    const got = String(req.headers["x-admin-token"] || "");
    const a = crypto.createHash("sha256").update(got).digest();
    const b = crypto.createHash("sha256").update(cfg.adminToken).digest();
    if (!crypto.timingSafeEqual(a, b)) throw new HttpError(401, "Unauthorized", "UNAUTHORIZED");
  }

  function ipAccountCount(h) {
    const cutoff = Date.now() - cfg.windowHours * 3600e3;
    let n = 0;
    for (const u of Object.values(db.users)) if (u.ip === h && Date.parse(u.created) > cutoff) n++;
    return n;
  }
  const ipLimitError = () =>
    new HttpError(
      429,
      `Only ${cfg.maxPerIp} account${cfg.maxPerIp === 1 ? "" : "s"} can be created from one connection every ${cfg.windowHours} hours.`,
      "ACCOUNT_LIMIT",
    );

  // ------------------------------------------------------------ routes

  async function route(req, res, url) {
    const p = url.pathname.replace(/\/+$/, "");
    const m = req.method;

    if (p === "/api/health" && m === "GET") return send(res, 200, { ok: true });

    if (p.startsWith("/api/admin/")) {
      adminCheck(req);
      if (p === "/api/admin/export" && m === "GET") {
        return send(res, 200, db, { "Content-Disposition": 'attachment; filename="users.json"' });
      }
      if (p === "/api/admin/import" && m === "POST") {
        const incoming = await readJson(req, 20 * 1024 * 1024);
        if (!validDb(incoming)) throw new HttpError(400, "Not a valid account database", "BAD_DB");
        const previous = db;
        db = incoming;
        try {
          await save();
        } catch (e) {
          db = previous;
          throw e;
        }
        return send(res, 200, { ok: true, users: Object.keys(db.users).length });
      }
      throw new HttpError(404, "Not found", "NOT_FOUND");
    }

    const ip = clientIp(req);
    const wait = overLimit("req:" + ip, cfg.requestsPerMinute, 60e3);
    if (wait) throw new HttpError(429, "Too many requests. Slow down.", "RATE_LIMIT", { "Retry-After": String(wait) });

    if (p === "/api/name-available" && m === "GET") {
      const raw = url.searchParams.get("name") || "";
      try {
        const c = checkName(raw);
        const why = takenReason(raw, c);
        return send(res, 200, why ? { available: false, reason: why } : { available: true });
      } catch (e) {
        if (e instanceof HttpError && e.status === 400) return send(res, 200, { available: false, reason: e.message });
        throw e;
      }
    }

    if (p === "/api/register" && m === "POST") {
      const body = await readJson(req, 4096);
      const c = checkName(body.name);
      const pw = checkPassword(body.password);
      const h = ipHash(ip);
      if (ipAccountCount(h) >= cfg.maxPerIp) throw ipLimitError();
      const taken = takenReason(body.name, c);
      if (taken) throw new HttpError(409, taken, "NAME_TAKEN");

      const salt = crypto.randomBytes(16).toString("hex");
      const hash = await hashPassword(pw, salt, cfg.scryptN);

      // Re-check now that we're back from the async hash: two people can race for the same name.
      const takenNow = takenReason(body.name, c);
      if (takenNow) throw new HttpError(409, takenNow, "NAME_TAKEN");
      if (ipAccountCount(h) >= cfg.maxPerIp) throw ipLimitError();

      const user = { name: body.name, salt, hash, kdf: { n: cfg.scryptN }, created: new Date().toISOString(), lastLogin: null, ip: h };
      db.users[c] = user;
      try {
        await save(); // only say "created" once it is really on disk
      } catch (e) {
        delete db.users[c];
        console.error("[accounts] could not save new account:", e.message);
        throw new HttpError(500, "Could not save your account. Try again.", "SAVE_FAILED");
      }
      console.log(`[accounts] created "${user.name}" (${Object.keys(db.users).length} total)`);
      return send(res, 201, { token: sign(user, c), name: user.name });
    }

    if (p === "/api/login" && m === "POST") {
      const body = await readJson(req, 4096);
      if (typeof body.name !== "string" || typeof body.password !== "string" || body.password.length > 128) {
        throw new HttpError(400, "Enter your name and password.", "BAD_LOGIN");
      }
      const c = canon(body.name);
      const keyName = `fail:${ip}:${c}`;
      const keyIp = `failip:${ip}`;
      const lock = Math.max(lockedFor(keyName), lockedFor(keyIp));
      if (lock) throw new HttpError(429, `Too many wrong attempts. Try again in ${Math.ceil(lock / 60)} minute(s).`, "LOCKED", { "Retry-After": String(lock) });

      const user = db.users[c];
      const exact = user && user.name.toLowerCase() === body.name.toLowerCase();
      // Always do the same amount of hashing work so response time doesn't reveal which names exist.
      const hash = await hashPassword(body.password, exact ? user.salt : DUMMY_SALT, exact ? user.kdf.n : cfg.scryptN);
      if (!exact || !sameHex(hash, user.hash)) {
        addFail(keyName);
        addFail(keyIp);
        throw new HttpError(401, "Wrong name or password.", "BAD_CREDENTIALS");
      }
      fails.delete(keyName);
      user.lastLogin = new Date().toISOString();
      saveSoon();
      return send(res, 200, { token: sign(user, c), name: user.name });
    }

    if (p === "/api/me" && m === "GET") {
      const user = userFromToken(req);
      if (!user) throw new HttpError(401, "Please log in again.", "UNAUTHORIZED");
      return send(res, 200, { name: user.name });
    }

    throw new HttpError(404, "Not found", "NOT_FOUND");
  }

  /** Returns true if the request was an /api/ request (and has been answered). */
  async function handle(req, res) {
    let url;
    try {
      url = new URL(req.url || "/", "http://localhost");
    } catch {
      return false;
    }
    if (!url.pathname.startsWith("/api/") && url.pathname !== "/api") return false;
    setCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return true;
    }
    try {
      await route(req, res, url);
    } catch (e) {
      if (e instanceof HttpError) send(res, e.status, { error: e.message, code: e.code }, e.headers);
      else {
        console.error("[accounts] error:", e);
        send(res, 500, { error: "Server error", code: "SERVER_ERROR" });
      }
    }
    return true;
  }

  return { handle, flush, userCount: () => Object.keys(db.users).length, dataFile: DB_FILE };
}

module.exports = { createAccounts, canon };
