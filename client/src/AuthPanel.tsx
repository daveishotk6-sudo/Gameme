import { useState } from "react";
import { explain, loginAccount, registerAccount, saveAccount, sendRecoveryEmail, validateEmail, validateName, type Account } from "./net/playfab";

type Mode = "login" | "register" | "forgot";

export default function AuthPanel({ onAuthed }: { onAuthed: (a: Account) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const go = (m: Mode) => {
    setMode(m);
    setError("");
    setNotice("");
  };

  const nameProblem = mode === "register" && name ? validateName(name) : null;
  const emailProblem = (mode === "register" || mode === "forgot") && email && !validateEmail(email) ? "That email address doesn't look right." : null;

  const canSubmit =
    !busy &&
    (mode === "login"
      ? name.length > 0 && password.length > 0
      : mode === "forgot"
        ? validateEmail(email)
        : !validateName(name) && validateEmail(email) && password.length >= 6 && password === confirm && ack);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "forgot") {
        await sendRecoveryEmail(email);
        setNotice("If that email has an account, a password reset link is on its way. Check your spam folder too.");
        setBusy(false);
        return;
      }
      const a = mode === "register" ? await registerAccount({ name, email, password }) : await loginAccount(name, password);
      saveAccount(a);
      onAuthed(a);
    } catch (e) {
      setError(explain(e));
      setBusy(false);
    }
  };

  return (
    <form className="auth" onSubmit={submit}>
      {mode !== "forgot" && (
        <div className="tabs">
          <button type="button" className={mode === "login" ? "tab on" : "tab"} onClick={() => go("login")}>
            Log in
          </button>
          <button type="button" className={mode === "register" ? "tab on" : "tab"} onClick={() => go("register")}>
            Create account
          </button>
        </div>
      )}
      {mode === "forgot" && <p className="who">Reset your password</p>}

      {mode !== "forgot" && (
        <label className="field">
          {mode === "register" ? "Choose your name" : "Name or email"}
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
      )}
      {nameProblem && <p className="hint bad">{nameProblem}</p>}

      {mode !== "login" && (
        <label className="field">
          Email
          <input
            type="email"
            value={email}
            maxLength={100}
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setEmail(e.target.value.trim())}
          />
        </label>
      )}
      {emailProblem && <p className="hint bad">{emailProblem}</p>}

      {mode !== "forgot" && (
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
      )}

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
              I understand my name is <b>permanent</b> and can&apos;t be changed, and that this email is how I reset my password.
            </span>
          </label>
        </>
      )}

      {error && <p className="err">{error}</p>}
      {notice && <p className="hint ok">{notice}</p>}

      <button type="submit" className="play" disabled={!canSubmit}>
        {busy ? "Please wait…" : mode === "register" ? "Create my account" : mode === "forgot" ? "Send reset email" : "Log in"}
      </button>

      {mode === "login" && (
        <button type="button" className="linkbtn block" onClick={() => go("forgot")}>
          Forgot your password?
        </button>
      )}
      {mode === "forgot" && (
        <button type="button" className="linkbtn block" onClick={() => go("login")}>
          Back to log in
        </button>
      )}
    </form>
  );
}
