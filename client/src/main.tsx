import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import VoxelView from "./game/VoxelView";
import AuthPanel from "./AuthPanel";
import BanScreen from "./BanScreen";
import { BAN_CHECK_MS, banInfoFrom, checkSession, clearAccount, explain, gameName, loadAccount, PlayFabError, saveAccount, type Account, type BanInfo } from "./net/playfab";
import "./styles.css";
import { HOLDER_URL } from "./net/holder";
import { clearRoomLocal } from "./game/save";

function safeRoom(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48) || "world";
}

/** /api/reset/:room — SPA path; falls back to /reset.html if anything throws. */
function ResetWorld({ room }: { room: string }) {
  const [msg, setMsg] = useState("Resetting…");
  const [err, setErr] = useState(false);
  useEffect(() => {
    const r = safeRoom(room);
    let cancelled = false;
    void (async () => {
      try {
        const base = (HOLDER_URL || "https://holder-production.up.railway.app").replace(/\/$/, "");
        const res = await fetch(`${base}/api/worlds/${encodeURIComponent(r)}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        try { clearRoomLocal(r); } catch { /* ignore */ }
        if (cancelled) return;
        if (res.ok) {
          setMsg(`Room "${r}" wiped on Holder and local cache cleared.`);
        } else {
          setErr(true);
          setMsg(`Holder returned ${res.status}: ${JSON.stringify(data)}`);
        }
      } catch (e) {
        try { clearRoomLocal(r); } catch { /* ignore */ }
        if (cancelled) return;
        setErr(true);
        setMsg(`Network error: ${String(e)}. Local cache still cleared. You can also open /reset.html?room=${encodeURIComponent(r)}`);
      }
    })();
    return () => { cancelled = true; };
  }, [room]);
  return (
    <main className="menu">
      <div className="card">
        <p className="kicker">WORLD RESET</p>
        <h1>{err ? "Error" : "Done"}</h1>
        <p className={err ? "err" : undefined}>{msg}</p>
        <button type="button" className="play" onClick={() => { window.location.href = "/"; }}>
          Back to Gameme
        </button>
        <p style={{ marginTop: 12, fontSize: 13 }}>
          Backup: <a href={`/reset.html?room=${encodeURIComponent(safeRoom(room))}`}>/reset.html?room={safeRoom(room)}</a>
        </p>
      </div>
    </main>
  );
}


function codeSeed(code: string) {
  let s = 0;
  for (const c of code) s = (Math.imul(s, 33) + c.charCodeAt(0)) >>> 0;
  return (s % 90000) + 1000;
}

/** checking: verifying a saved login · out: show login · in: logged in · down: PlayFab unreachable */
/** checking: verifying a saved login · out: show login · in: logged in · down: PlayFab unreachable · banned: ban screen */
type Phase = "checking" | "out" | "in" | "down" | "banned";

function Home() {
  const [playing, setPlaying] = useState(false);
  const [seed, setSeed] = useState(42);
  const [room, setRoom] = useState("hills");
  const [phase, setPhase] = useState<Phase>("checking");
  const [account, setAccount] = useState<Account | null>(null);
  const [notice, setNotice] = useState("");
  const [ban, setBan] = useState<BanInfo | null>(null);

  /** Leave the game and show why the player is banned. */
  const showBan = useCallback((b: BanInfo) => {
    clearAccount();
    setAccount(null);
    setPlaying(false);
    setBan(b);
    setPhase("banned");
  }, []);

  const logOut = useCallback((message = "") => {
    clearAccount();
    setAccount(null);
    setPlaying(false);
    setNotice(message);
    setPhase("out");
  }, []);

  // Is the saved login still good?
  const verify = useCallback(async () => {
    const saved = loadAccount();
    if (!saved) {
      setPhase("out");
      return;
    }
    setPhase("checking");
    try {
      const fresh = await checkSession(saved);
      saveAccount(fresh);
      setAccount(fresh);
      setPhase("in");
    } catch (e) {
      const b = banInfoFrom(e);
      if (b) {
        showBan(b);
        return;
      }
      if (e instanceof PlayFabError && e.expired) {
        clearAccount();
        setNotice(explain(e));
        setPhase("out");
      } else setPhase("down");
    }
  }, [showBan]);

  useEffect(() => {
    void verify();
  }, [verify]);

  // While playing, notice a ban within a minute and show it (otherwise it would only show at the next login).
  useEffect(() => {
    if (!playing || !account) return;
    const id = window.setInterval(async () => {
      try {
        await checkSession(account);
      } catch (e) {
        const b = banInfoFrom(e);
        if (b) showBan(b);
        else if (e instanceof PlayFabError && e.expired) logOut("Your login expired. Please log in again.");
      }
    }, BAN_CHECK_MS);
    return () => window.clearInterval(id);
  }, [playing, account, showBan, logOut]);

  if (playing && phase === "in" && account) {
    return (
      <VoxelView
        seed={seed}
        room={room}
        name={gameName(account)}
        onExit={() => setPlaying(false)}
      />
    );
  }

  if (phase === "banned" && ban) {
    return (
      <BanScreen
        ban={ban}
        onBack={() => {
          setBan(null);
          setNotice("");
          setPhase("out");
        }}
      />
    );
  }

  return (
    <main className="menu">
      <div className="card">
        <p className="kicker">VOXEL SANDBOX</p>
        <h1>GAMEME</h1>

        {phase === "checking" && <p>Checking your login…</p>}

        {phase === "down" && (
          <>
            <p className="err">Can&apos;t reach PlayFab right now.</p>
            <button type="button" className="play" onClick={() => void verify()}>
              Try again
            </button>
          </>
        )}

        {phase === "out" && (
          <>
            <p>Log in to play. Your name belongs to your account alone: nobody else can use it.</p>
            {notice && <p className="err">{notice}</p>}
            <AuthPanel
              onBanned={showBan}
              onAuthed={(a) => {
                setAccount(a);
                setNotice("");
                setPhase("in");
              }}
            />
          </>
        )}

        {phase === "in" && account && (
          <>
            <p className="who">
              Playing as <b>{gameName(account)}</b>
              <button type="button" className="linkbtn" onClick={() => logOut()}>
                Not you? Log out
              </button>
            </p>
            <p>Same room code is the same world. Friends show up as characters with their name above them.</p>
            <label className="field">
              Room code
              <input value={room} maxLength={16} onChange={(e) => setRoom(e.target.value)} />
            </label>
            <button
              type="button"
              className="play"
              onClick={() => {
                const code = room.trim() || "hills";
                setRoom(code);
                setSeed(codeSeed(code));
                setPlaying(true);
              }}
            >
              Play
            </button>
            <ul className="help">
              <li>iPad: left side moves, right side looks, green Jump, Fly button to fly</li>
              <li>Your room saves on this device.</li>
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

function Root() {
  const m = window.location.pathname.match(/^\/api\/reset\/([^/]+)\/?$/i);
  if (m?.[1]) return <ResetWorld room={decodeURIComponent(m[1])} />;
  return <Home />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
