import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import VoxelView from "./game/VoxelView";

function Home() {
  const [playing, setPlaying] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 99999));

  if (!playing) {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-gradient-to-b from-sky-700 via-sky-900 to-zinc-950 px-4 text-white">
        <div className="w-[min(92vw,380px)] rounded-2xl bg-black/40 p-8 text-center shadow-2xl">
          <p className="text-xs tracking-[0.35em] text-emerald-300">VOXEL SANDBOX</p>
          <h1 className="mt-2 text-5xl font-black tracking-wide">GAMEME</h1>
          <p className="mt-3 text-sm text-white/70">Walk the hills, jump, mine, and build. Horizon stays level.</p>
          <button
            type="button"
            className="mt-6 w-full rounded-xl bg-emerald-500 py-3 text-lg font-bold text-zinc-950"
            onClick={() => {
              setSeed(Math.floor(Math.random() * 99999));
              setPlaying(true);
            }}
          >
            Play
          </button>
          <button
            type="button"
            className="mt-2 w-full rounded-xl bg-sky-500 py-3 font-semibold"
            onClick={() => {
              setSeed(42);
              setPlaying(true);
            }}
          >
            Same world (seed 42)
          </button>
          <ul className="mt-5 space-y-1 text-left text-xs text-white/60">
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
