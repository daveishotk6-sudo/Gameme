import { useEffect, useRef, useState } from "react";
import { Engine, type HudState } from "./engine";
import { block, CREATIVE_PALETTE, itemInfo } from "./blocks";
import { loadSave } from "./save";
import { iconURL } from "./icons";
import { SIGN_COLS, SIGN_LINES, type SignData } from "./signs";
import { sfx } from "./audio";
import { connectPhoton, type Ghosts, type PhotonLink } from "../net/photon";

type Props = { seed: number; room: string; name: string; onExit: () => void };

export default function VoxelView({ seed, room, name, onExit }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const net = useRef<PhotonLink | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [picker, setPicker] = useState(false);
  /** Which hotbar slot (0-8) the inventory is editing. */
  const [editSlot, setEditSlot] = useState(0);
  const [sign, setSign] = useState<SignData | null>(null);
  const [signText, setSignText] = useState("");
  const [online, setOnline] = useState(1);
  const [status, setStatus] = useState("Connecting");
  const [muted, setMuted] = useState(sfx.muted);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const slot = `room-${room}`;
    const saved = loadSave(slot);
    let placed = false;
    let known: Ghosts = {};
    const e = new Engine({
      host: el, seed, save: saved, touch, slot, name, onHud: setHud,
    });
    engine.current = e;
    e.onLocalBlock = (x, y, z, id) => net.current?.block(x, y, z, id);
    e.onEditSign = (s) => {
      setSign(s);
      setSignText(s.text);
    };
    e.onLocalSign = (s) => net.current?.sign(s);
    e.onPose = (p) => net.current?.move({ ...p, name });
    e.timeSource = () => net.current?.time() ?? null;

    let link: PhotonLink | null = null;
    try {
      link = connectPhoton(room, name, {
        onStatus: setStatus,
        onCount: setOnline,
        onPos: (actor, pos) => {
          e.setRemote(actor, pos);
          // They are back online, so their ghost goes away.
          if (known[pos.name]) link?.setGhost(pos.name, null);
        },
        onLeave: (actor) => {
          const r = e.remoteInfo(actor);
          e.removeRemote(actor);
          if (r) link?.setGhost(r.name, { x: r.x, y: r.y, z: r.z, yaw: r.yaw, t: Date.now() });
        },
        onGhosts: (g) => {
          known = g;
          e.setGhosts(g);
          const mine = g[name];
          if (mine && !placed) {
            placed = true;
            // Rejoining without a local save: stand where we were last seen instead of the default spawn.
            if (!saved) e.teleport(mine);
            link?.setGhost(name, null);
          }
        },
        onBlock: (x, y, z, id) => e.applyRemoteBlock(x, y, z, id),
        onSign: (s) => e.applyRemoteSign(s),
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
  const toggleSound = () => {
    sfx.unlock();
    sfx.setMuted(!sfx.muted);
    setMuted(sfx.muted);
    sfx.click();
  };
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
          <button data-hud type="button" className="menu-btn" onClick={toggleSound} aria-label={muted ? "Turn sound on" : "Turn sound off"}>
            {muted ? "🔇" : "🔊"}
          </button>
          <button data-hud type="button" className="menu-btn" onClick={() => e()?.setPaused(true)}>
            Menu
          </button>
        </div>
      </div>

      {hud && hud.hurt > 0 && <div key={hud.hurt} className="hurt-flash" />}

      {hud?.tip && <div className="tip">{hud.tip}</div>}

      <div className="vitals">
        <div className="hearts" aria-label={`Health ${hud?.health ?? 20} of 20`}>
          {Array.from({ length: 10 }, (_, i) => {
            const hp = hud?.health ?? 20;
            const cls = hp >= i * 2 + 2 ? "full" : hp === i * 2 + 1 ? "half" : "empty";
            return <span key={i} className={`heart ${cls}`}>♥</span>;
          })}
        </div>
        {hud && (hud.submerged || hud.air < 10) && (
          <div className="bubbles">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={i < hud.air ? "bubble" : "bubble gone"} />
            ))}
          </div>
        )}
      </div>

      <div className="hotbar">
        {hud?.hotbar.map((id, i) => (
          <button
            data-hud
            key={i}
            type="button"
            onClick={() => {
              e()?.select(i);
              setEditSlot(i);
              setPicker(true);
            }}
            className={i === hud.selected ? "slot on" : "slot"}
            aria-label={`Slot ${i + 1}: ${itemInfo(id).name}`}
          >
            <img src={iconURL(id)} alt="" draggable={false} />
            <span>{i + 1}</span>
          </button>
        ))}
      </div>

      <div className="joy" />

      <div className="fly-actions">
        <button data-hud type="button" className={hud?.flying ? "round on" : "round"} onClick={() => e()?.toggleFly()}>
          Fly
        </button>
        {hud?.flying && (
          <button data-hud type="button" className="round"
            onPointerDown={(ev) => { ev.preventDefault(); if (e()) e()!.descendHeld = true; }}
            onPointerUp={() => { if (e()) e()!.descendHeld = false; }}
            onPointerCancel={() => { if (e()) e()!.descendHeld = false; }}
            onPointerLeave={() => { if (e()) e()!.descendHeld = false; }}>
            Down
          </button>
        )}
      </div>

      <div className="actions">
        <button data-hud type="button" className="round"
          onPointerDown={(ev) => { ev.preventDefault(); if (e()) e()!.mineHeld = true; }}
          onPointerUp={() => { if (e()) e()!.mineHeld = false; }}
          onPointerCancel={() => { if (e()) e()!.mineHeld = false; }}
          onPointerLeave={() => { if (e()) e()!.mineHeld = false; }}>
          Mine
        </button>
        <button data-hud type="button" className="round jump"
          onPointerDown={(ev) => { ev.preventDefault(); e()?.jumpPress(); if (e()) e()!.jumpHeld = true; }}
          onPointerUp={() => { if (e()) e()!.jumpHeld = false; }}
          onPointerCancel={() => { if (e()) e()!.jumpHeld = false; }}
          onPointerLeave={() => { if (e()) e()!.jumpHeld = false; }}>
          {hud?.flying ? "Up" : "Jump"}
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
          <div className="card picker inv" onClick={(ev) => ev.stopPropagation()}>
            <h2>Inventory</h2>
            <p className="inv-hint">Tap a hotbar slot below, then choose a block or item for that slot.</p>

            <div className="inv-slots">
              {(hud?.hotbar ?? [0, 0, 0, 0, 0, 0, 0, 0, 0]).map((id, i) => (
                <button
                  key={i}
                  type="button"
                  className={i === editSlot ? "slot on" : "slot"}
                  title={`Slot ${i + 1}`}
                  onClick={() => {
                    setEditSlot(i);
                    e()?.select(i);
                  }}
                >
                  <img src={iconURL(id)} alt="" draggable={false} />
                  <span>{i + 1}</span>
                </button>
              ))}
            </div>

            <p className="inv-editing">Editing slot <strong>{editSlot + 1}</strong></p>

            <div className="grid">
              {CREATIVE_PALETTE.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="slot"
                  title={itemInfo(id).name}
                  onClick={() => {
                    e()?.setHotbar(editSlot, id);
                    e()?.select(editSlot);
                    sfx.click();
                    // stay open so you can fill multiple slots
                  }}
                >
                  <img src={iconURL(id)} alt="" draggable={false} />
                </button>
              ))}
            </div>

            <button type="button" className="inv-done" onClick={() => setPicker(false)}>
              Done
            </button>
          </div>
        </div>
      )}

      {sign && (
        <div className="pause">
          <div className="card sign-card" data-hud>
            <h2>Sign</h2>
            <textarea
              autoFocus
              rows={SIGN_LINES}
              value={signText}
              placeholder="Write something…"
              onChange={(ev) =>
                setSignText(
                  ev.target.value
                    .replace(/\r/g, "")
                    .split("\n")
                    .slice(0, SIGN_LINES)
                    .map((l) => l.slice(0, SIGN_COLS))
                    .join("\n"),
                )
              }
            />
            <p className="note">Up to {SIGN_LINES} lines of {SIGN_COLS} characters. Everyone in the room can read it.</p>
            <button
              type="button"
              className="resume"
              onClick={() => {
                e()?.setSignText(sign.x, sign.y, sign.z, signText);
                setSign(null);
                e()?.closeSign();
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="exit"
              onClick={() => {
                setSign(null);
                e()?.closeSign();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="exit"
              onClick={() => {
                e()?.removeSign(sign.x, sign.y, sign.z);
                setSign(null);
              }}
            >
              Remove sign
            </button>
          </div>
        </div>
      )}

      {hud?.dead && (
        <div className="pause dead">
          <div className="card">
            <h2>You died</h2>
            <button type="button" className="resume" onClick={() => e()?.respawn()}>
              Respawn
            </button>
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
            <button type="button" className="seed" onClick={toggleSound}>Sound: {muted ? "Off" : "On"}</button>
            <button type="button" className="exit" onClick={onExit}>Save &amp; Exit</button>
            <p className="note">WASD · Space jump · Fly: F or double-tap Space/Jump, or the Fly button (Up/Down buttons or Space/Shift to climb and descend) · Left click mine · Right click place · 1-9 or wheel to pick · tap the selected slot to change its block</p>
          </div>
        </div>
      )}
    </div>
  );
}
