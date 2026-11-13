import { useState } from "react";
import { banInfoFrom, explain, loginAccount, registerAccount, saveAccount, validateName, type Account, type BanInfo } from "./net/playfab";

type Mode = "login" | "register";

export default function AuthPanel({ onAuthed, onBanned }: { onAuthed: (a: Account) => void; onBanned: (b: BanInfo) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const go = (m: Mode) => {
    setMode(m);
    setError("");
  };

  const nameProblem = mode === "register" && name ? validateName(name) : null;
  const canSubmit =
    !busy &&
    (mode === "login"
      ? name.length > 0 && password.length > 0
      : !validateName(name) && password.length >= 6 && password === confirm && ack);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const a = mode === "register" ? await registerAccount({ name, password }) : await loginAccount(name, password);
      saveAccount(a);
      onAuthed(a);
    } catch (e) {
      const ban = banInfoFrom(e);
      if (ban) onBanned(ban);
      else setError(explain(e));
      setBusy(false);
    }
  };

  return (
    <form className="auth" onSubmit={submit}>
      <div className="tabs">
        <button type="button" className={mode === "login" ? "tab on" : "tab"} onClick={() => go("login")}>
          Log in
        </button>
        <button type="button" className={mode === "register" ? "tab on" : "tab"} onClick={() => go("register")}>
          Create account
        </button>
      </div>

      <label className="field">
        {mode === "register" ? "Choose your name" : "Your name"}
        <input
          value={name}
          maxLength={mode === "register" ? 16 : 100}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setName(e.target.value.trim())}
        />
      </label>
      {nameProblem && <p className="hint bad">{nameProblem}</p>}

      <label className="field">
        Password
        <input
          type="password"
          value={password}
          maxLength={100}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      {mode === "register" && (
        <>
          <label className="field">
            Repeat password
            <input type="password" value={confirm} maxLength={100} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {password.length > 0 && password.length < 6 && <p className="hint bad">Use at least 6 characters.</p>}
          {confirm.length > 0 && password !== confirm && <p className="hint bad">Passwords don&apos;t match.</p>}
          <label className="check">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>
              I understand my name is <b>permanent</b> and can&apos;t be changed, and that there is <b>no password reset</b>, so I&apos;ll remember my password.
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
