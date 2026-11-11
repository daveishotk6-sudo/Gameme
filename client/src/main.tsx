import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import VoxelView from "./game/VoxelView";
import "./styles.css";

function codeSeed(code: string) {
  let s = 0;
  for (const c of code) s = (Math.imul(s, 33) + c.charCodeAt(0)) >>> 0;
  return (s % 90000) + 1000;
}

function Home() {
  const [playing, setPlaying] = useState(false);
  const [seed, setSeed] = useState(42);
  const [room, setRoom] = useState("hills");
  const [name, setName] = useState("You");

  if (!playing) {
    return (
      <main className="menu">
        <div className="card">
          <p className="kicker">VOXEL SANDBOX</p>
          <h1>GAMEME</h1>
          <p>Same room code is the same world. Friends show up as blue figures.</p>
          <label className="field">
            Your name
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
          </label>
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
            <li>iPad: left side moves, right side looks, green Jump</li>
            <li>Chat is at the lower left. Craft is next to Menu.</li>
          </ul>
        </div>
      </main>
    );
  }

  return (
    <VoxelView
      seed={seed}
      room={room}
      name={name.trim() || "You"}
      onExit={() => setPlaying(false)}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
