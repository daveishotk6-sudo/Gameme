import { useEffect, useState } from "react";
import { ApiError, checkName, login, register, setToken, validateName } from "./net/accounts";

type Avail = { state: "idle" | "checking" | "ok" | "bad"; msg?: string };

export default function AuthPanel({ onAuthed }: { onAuthed: (name: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [avail, setAvail] = useState<Avail>({ state: "idle" });

  // While creating an account, tell the player right away whether the name is free.
  useEffect(() => {
    if (mode !== "register") return;
    if (!name) {
      setAvail({ state: "idle" });
      return;
    }
    const local = validateName(name);
    if (local) {
      setAvail({ state: "bad", msg: local });
      return;
    }
    setAvail({ state: "checking" });
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const r = await checkName(name);
        if (!stale) setAvail(r.available ? { state: "ok", msg: "That name is available." } : { state: "bad", msg: r.reason });
      } catch {
        if (!stale) setAvail({ state: "idle" });
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [name, mode]);

  const switchMode = (m: "login" | "register") => {
    setMode(m);
    setError("");
  };

  const canSubmit =
    !busy &&
    name.length > 0 &&
    password.length > 0 &&
    (mode === "login" || (avail.state !== "bad" && password.length >= 6 && password === confirm && ack));

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const r = mode === "register" ? await register(name, password) : await login(name, password);
      setToken(r.token);
      onAuthed(r.name);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <form className="auth" onSubmit={submit}>
      <div className="tabs">
        <button type="button" className={mode === "login" ? "tab on" : "tab"} onClick={() => switchMode("login")}>
          Log in
        </button>
        <button type="button" className={mode === "register" ? "tab on" : "tab"} onClick={() => switchMode("register")}>
          Create account
        </button>
      </div>

      <label className="field">
        {mode === "register" ? "Choose your name" : "Your name"}
        <input
          value={name}
          maxLength={16}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setName(e.target.value.trim())}
        />
      </label>
      {mode === "register" && avail.state !== "idle" && (
        <p className={avail.state === "ok" ? "hint ok" : avail.state === "bad" ? "hint bad" : "hint"}>
          {avail.state === "checking" ? "Checking…" : avail.msg}
        </p>
      )}

      <label className="field">
        Password
        <input
          type="password"
          value={password}
          maxLength={128}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      {mode === "register" && (
        <>
          <label className="field">
            Repeat password
            <input type="password" value={confirm} maxLength={128} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {password.length > 0 && password.length < 6 && <p className="hint bad">Use at least 6 characters.</p>}
          {confirm.length > 0 && password !== confirm && <p className="hint bad">Passwords don&apos;t match.</p>}
          <label className="check">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>
              I understand my name is <b>permanent</b>: it can&apos;t be changed, and there is no password reset, so I&apos;ll remember my password.
            </span>
          </label>
        </>
      )}

      {error && <p className="err">{error}</p>}

      <button type="submit" className="play" disabled={!canSubmit}>
        {busy ? "Please wait…" : mode === "register" ? "Create my account" : "Log in"}
      </button>
    </form>
  );
}
