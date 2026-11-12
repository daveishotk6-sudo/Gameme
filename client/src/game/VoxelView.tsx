import { useEffect, useRef, useState } from "react";
import { Engine, type HudState } from "./engine";
import { block, CREATIVE_PALETTE } from "./blocks";
import { loadSave } from "./save";
import { iconURL } from "./icons";
import { connectPhoton, type PhotonLink } from "../net/photon";

type Props = { seed: number; room: string; name: string; onExit: () => void };

export default function VoxelView({ seed, room, name, onExit }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const net = useRef<PhotonLink | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [picker, setPicker] = useState(false);
  const [online, setOnline] = useState(1);
  const [status, setStatus] = useState("Connecting");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const slot = `room-${room}`;
    const e = new Engine({
      host: el, seed, save: loadSave(slot), touch, slot, onHud: setHud,
    });
    engine.current = e;
    e.onLocalBlock = (x, y, z, id) => net.current?.block(x, y, z, id);
    e.onPose = (p) => net.current?.move({ ...p, name });
    e.timeSource = () => net.current?.time() ?? null;

    let link: PhotonLink | null = null;
    try {
      link = connectPhoton(room, name, {
        onStatus: setStatus,
        onCount: setOnline,
        onPos: (actor, pos) => e.setRemote(actor, pos),
        onLeave: (actor) => e.removeRemote(actor),
        onBlock: (x, y, z, id) => e.applyRemoteBlock(x, y, z, id),
      });
    } catch {
      setStatus("Offline");
    }
    net.current = link;
    return () => {
      net.current = null;
      link?.close();
      e.dispose();
      engine.current = null;
    };
  }, [seed, room, name]);

  const e = () => engine.current;
  const paused = hud?.paused ?? false;

  return (
    <div className="stage">
      <div ref={host} className="host" />
      <div className="cross" />
      {hud?.submerged && <div className="water-tint" />}

      <div className="topbar">
        <div className="badge">
          Gameme · {online} online{status ? ` · ${status}` : ""}
          {hud ? ` · ${hud.pos[0]}, ${hud.pos[1]}, ${hud.pos[2]}` : ""}
          {hud?.target ? ` · ${hud.target}` : ""}
        </div>
        <div className="top-actions">
          <button data-hud type="button" className="menu-btn" onClick={() => e()?.setPaused(true)}>
            Menu
          </button>
        </div>
      </div>

      <div className="hotbar">
        {hud?.hotbar.map((id, i) => (
          <button
            data-hud
            key={i}
            type="button"
            onClick={() => (i === hud.selected ? setPicker(true) : e()?.select(i))}
            className={i === hud.selected ? "slot on" : "slot"}
            aria-label={block(id).name}
          >
            <img src={iconURL(id)} alt="" draggable={false} />
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
                <button key={id} type="button" className="slot" title={block(id).name}
                  onClick={() => { e()?.setHotbar(hud?.selected ?? 0, id); setPicker(false); }}>
                  <img src={iconURL(id)} alt="" draggable={false} />
                </button>
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
