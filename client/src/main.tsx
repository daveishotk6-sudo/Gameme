import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import VoxelView from "./game/VoxelView";
import { loadSave } from "./game/save";
import "./styles.css";

function Home() {
  const [playing, setPlaying] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 99999));
  const [resume, setResume] = useState(false);
  const saved = loadSave();

  if (!playing) {
    return (
      <main className="menu">
        <div className="card">
          <p className="kicker">VOXEL SANDBOX</p>
          <h1>GAMEME</h1>
          <p>Explore oceans, deserts, snowy peaks and caves. Mine, build and swim. Your world saves automatically.</p>
          {saved && (
            <button
              type="button"
              className="play"
              onClick={() => {
                setSeed(saved.seed);
                setResume(true);
                setPlaying(true);
              }}
            >
              Continue
            </button>
          )}
          <button
            type="button"
            className={saved ? "seed" : "play"}
            onClick={() => {
              setSeed(Math.floor(Math.random() * 99999));
              setResume(false);
              setPlaying(true);
            }}
          >
            New world
          </button>
          <button
            type="button"
            className="seed"
            onClick={() => {
              setSeed(42);
              setResume(false);
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

  return <VoxelView seed={seed} resume={resume} onExit={() => setPlaying(false)} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
