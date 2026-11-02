import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import VoxelView from "./game/VoxelView";
import "./styles.css";

function Home() {
  const [playing, setPlaying] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 99999));

  if (!playing) {
    return (
      <main className="menu">
        <div className="card">
          <p className="kicker">VOXEL SANDBOX</p>
          <h1>GAMEME</h1>
          <p>Walk the hills, jump, mine, and build. The camera stays level.</p>
          <button
            type="button"
            className="play"
            onClick={() => {
              setSeed(Math.floor(Math.random() * 99999));
              setPlaying(true);
            }}
          >
            Play
          </button>
          <button
            type="button"
            className="seed"
            onClick={() => {
              setSeed(42);
              setPlaying(true);
            }}
          >
            Same world (seed 42)
          </button>
          <ul className="help">
            <li>Desktop: click to look, WASD, Space jump, left click mine, right click place</li>
            <li>iPad: left stick move, right drag look, green Jump button</li>
          </ul>
        </div>
      </main>
    );
  }

  return <VoxelView seed={seed} onExit={() => setPlaying(false)} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
