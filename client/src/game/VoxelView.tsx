import { useEffect, useRef, useState } from "react";
import { Engine, type HudState } from "./engine";
import { block, CREATIVE_PALETTE } from "./blocks";
import { loadSave } from "./save";

type Props = { seed: number; resume: boolean; onExit: () => void };

export default function VoxelView({ seed, resume, onExit }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const e = new Engine({ host: el, seed, save: resume ? loadSave() : null, touch, onHud: setHud });
    engine.current = e;
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, [seed, resume]);

  const e = () => engine.current;
  const paused = hud?.paused ?? false;

  return (
    <div className="stage">
      <div ref={host} className="host" />
      <div className="cross" />
      {hud?.submerged && <div className="water-tint" />}

      <div className="topbar">
        <div className="badge">
          Gameme{hud ? ` · ${hud.pos[0]}, ${hud.pos[1]}, ${hud.pos[2]}` : ""}
          {hud?.target ? ` · ${hud.target}` : ""}
        </div>
        <button data-hud type="button" className="menu-btn" onClick={() => e()?.setPaused(true)}>
          Menu
        </button>
      </div>

      <div className="hotbar">
        {hud?.hotbar.map((id, i) => (
          <button
            data-hud
            key={i}
            type="button"
            onClick={() => (i === hud.selected ? setPicker(true) : e()?.select(i))}
            className={i === hud.selected ? "slot on" : "slot"}
            style={{ background: block(id).color }}
            aria-label={block(id).name}
          >
            <span>{i + 1}</span>
          </button>
        ))}
      </div>

      <div className="joy" />

      <div className="actions">
        <button data-hud type="button" className="round"
          onPointerDown={(ev) => { ev.preventDefault(); if (e()) e()!.mineHeld = true; }}
          onPointerUp={() => { if (e()) e()!.mineHeld = false; }}
          onPointerCancel={() => { if (e()) e()!.mineHeld = false; }}
          onPointerLeave={() => { if (e()) e()!.mineHeld = false; }}>
          Mine
        </button>
        <button data-hud type="button" className="round jump"
          onPointerDown={(ev) => { ev.preventDefault(); if (e()) e()!.jumpHeld = true; }}
          onPointerUp={() => { if (e()) e()!.jumpHeld = false; }}
          onPointerCancel={() => { if (e()) e()!.jumpHeld = false; }}
          onPointerLeave={() => { if (e()) e()!.jumpHeld = false; }}>
          Jump
        </button>
        <button data-hud type="button" className="round"
          onPointerDown={(ev) => { ev.preventDefault(); if (e()) { e()!.placeQueued = true; e()!.placeHeld = true; } }}
          onPointerUp={() => { if (e()) e()!.placeHeld = false; }}
          onPointerCancel={() => { if (e()) e()!.placeHeld = false; }}
          onPointerLeave={() => { if (e()) e()!.placeHeld = false; }}>
          Place
        </button>
      </div>

      {picker && (
        <div className="pause" onClick={() => setPicker(false)}>
          <div className="card picker" onClick={(ev) => ev.stopPropagation()}>
            <h2>Pick a block</h2>
            <div className="grid">
              {CREATIVE_PALETTE.filter((id) => id < 100).map((id) => (
                <button key={id} type="button" className="slot" style={{ background: block(id).color }}
                  title={block(id).name} onClick={() => { e()?.setHotbar(hud?.selected ?? 0, id); setPicker(false); }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {paused && (
        <div className="pause">
          <div className="card">
            <h2>Paused</h2>
            <button type="button" className="resume" onClick={() => { e()?.setPaused(false); e()?.lockPointer(); }}>
              Resume
            </button>
            <button type="button" className="exit" onClick={onExit}>Save &amp; Exit</button>
            <p className="note">WASD · Space jump (double-tap to fly, Shift down) · Left click mine · Right click place · 1-9 or wheel to pick · tap the selected slot to change its block</p>
          </div>
        </div>
      )}
    </div>
  );
}
