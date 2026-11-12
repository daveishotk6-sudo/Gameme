import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import VoxelView from "./game/VoxelView";
import AuthPanel from "./AuthPanel";
import { ApiError, clearToken, getToken, me } from "./net/accounts";
import "./styles.css";

function codeSeed(code: string) {
  let s = 0;
  for (const c of code) s = (Math.imul(s, 33) + c.charCodeAt(0)) >>> 0;
  return (s % 90000) + 1000;
}

type Phase = "checking" | "out" | "in" | "down";

function Home() {
  const [playing, setPlaying] = useState(false);
  const [seed, setSeed] = useState(42);
  const [room, setRoom] = useState("hills");
  const [phase, setPhase] = useState<Phase>("checking");
  const [name, setName] = useState("");

  // Is the saved login still valid? (Also wakes a sleeping server.)
  const checkSession = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setPhase("out");
      return;
    }
    setPhase("checking");
    try {
      const r = await me(token);
      setName(r.name);
      setPhase("in");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearToken();
        setPhase("out");
      } else setPhase("down");
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  if (playing && phase === "in") {
    return <VoxelView seed={seed} room={room} name={name} onExit={() => setPlaying(false)} />;
  }

  return (
    <main className="menu">
      <div className="card">
        <p className="kicker">VOXEL SANDBOX</p>
        <h1>GAMEME</h1>

        {phase === "checking" && (
          <p>Connecting to the account server… the first visit can take up to a minute while it wakes up.</p>
        )}

        {phase === "down" && (
          <>
            <p className="err">Can&apos;t reach the account server right now.</p>
            <button type="button" className="play" onClick={() => void checkSession()}>
              Try again
            </button>
          </>
        )}

        {phase === "out" && (
          <>
            <p>Log in to play. Your name is yours alone: nobody else can use it.</p>
            <AuthPanel
              onAuthed={(n) => {
                setName(n);
                setPhase("in");
              }}
            />
          </>
        )}

        {phase === "in" && (
          <>
            <p className="who">
              Playing as <b>{name}</b>{" "}
              <button
                type="button"
                className="linkbtn"
                onClick={() => {
                  clearToken();
                  setName("");
                  setPhase("out");
                }}
              >
                Not you? Log out
              </button>
            </p>
            <p>Same room code is the same world. Friends show up as blue figures.</p>
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
