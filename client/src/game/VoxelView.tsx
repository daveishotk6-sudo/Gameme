import { useEffect, useRef, useState } from "react";
import { Engine, type HudState } from "./engine";
import { block, CREATIVE_PALETTE, itemInfo } from "./blocks";
import { loadSave } from "./save";
import { iconURL } from "./icons";
import { SIGN_MAX_BREAKS, SIGN_MAX_CHARS, type SignData } from "./signs";
import { sfx } from "./audio";
import { connectPhoton, type Ghosts, type PhotonLink } from "../net/photon";
import { fetchWorld, makeHolderSync } from "../net/holder";

type Props = {
  seed: number;
  room: string;
  name: string;
  onExit: () => void;
};

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
  const [mx6Open, setMx6Open] = useState(false);
  const [mx6, setMx6] = useState({ fps: 0, seed: 0, chunks: 0, yaw: 0, pitch: 0, fuses: 0, flying: false, health: 20, breakRadius: 1 });
  const admin = name.trim().toLowerCase() === "mx6";

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

    // Permanent world store (Railway Holder) — survives everyone leaving.
    const holder = makeHolderSync(room);
    const dumpSigns = (): [number, number, number, number, string][] =>
      [...e.signs.values()].map((s) => [s.x, s.y, s.z, s.yaw, s.text] as [number, number, number, number, string]);
    const saveHolder = () => holder.queue(e.world.dumpEdits(), dumpSigns());

    e.onLocalBlock = (x, y, z, id) => {
      net.current?.block(x, y, z, id);
      saveHolder();
    };
    e.onEditSign = (s) => {
      setSign(s);
      setSignText(s.text);
    };
    e.onLocalSign = (s) => {
      net.current?.sign(s);
      saveHolder();
    };
    e.onPose = (p) => net.current?.move({ ...p, name });
    e.timeSource = () => net.current?.time() ?? null;

    // Load permanent builds from Holder first, then join live multiplayer.
    let cancelled = false;
    (async () => {
      const world = await fetchWorld(room);
      if (cancelled || !world) return;
      const flat = world.edits || [];
      for (let i = 0; i + 3 < flat.length; i += 4) {
        e.applyRemoteBlock(flat[i]!, flat[i + 1]!, flat[i + 2]!, flat[i + 3]!);
      }
      for (const s of world.signs || []) {
        if (s.length >= 4) {
          e.applyRemoteSign({
            x: s[0]!, y: s[1]!, z: s[2]!, yaw: s[3]!, text: String(s[4] ?? ""),
          });
        }
      }
      // Upload anything only we had locally so Holder stays complete.
      const local = e.world.dumpEdits();
      if (local.length) saveHolder();
    })();

    let link: PhotonLink | null = null;
    try {
      link = connectPhoton(room, name, {
        onStatus: setStatus,
        onCount: setOnline,
        onPos: (actor, pos) => {
          e.setRemote(actor, pos);
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
            if (!saved) e.teleport(mine);
            link?.setGhost(name, null);
          }
        },
        onBlock: (x, y, z, id) => e.applyRemoteBlock(x, y, z, id),
        onSign: (s) => e.applyRemoteSign(s),
        onWorld: (edits) => {
          for (const ed of edits) e.applyRemoteBlock(ed.x, ed.y, ed.z, ed.id);
        },
      });
      try {
        const flat = e.world.dumpEdits();
        if (flat.length) link?.pushWorld(flat);
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error("[photon] connect failed", err);
      setStatus(err instanceof Error ? err.message : "Offline");
    }
    net.current = link;
    return () => {
      cancelled = true;
      saveHolder();
      holder.flushNow();
      holder.close();
      net.current = null;
      link?.close();
      e.dispose();
      engine.current = null;
    };
  }, [seed, room, name]);

  useEffect(() => {
    if (!admin || !mx6Open) return;
    const read = () => {
      const info = engine.current?.mx6Debug();
      if (info) setMx6(info);
    };
    read();
    const id = window.setInterval(read, 250);
    return () => window.clearInterval(id);
  }, [admin, mx6Open]);

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
          {admin && (
            <button data-hud type="button" className="menu-btn" onClick={() => setMx6Open((v) => !v)}>
              MX6 Debug
            </button>
          )}
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
            onClick={() => e()?.select(i)}
            onDoubleClick={() => {
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

      {admin && mx6Open && (
        <div className="mx6" data-hud>
          <h2>MX6 Debug</h2>
          <p>FPS {mx6.fps} · chunks {mx6.chunks} · seed {mx6.seed}</p>
          <p>
            pos {hud ? `${hud.pos[0]} ${hud.pos[1]} ${hud.pos[2]}` : "…"} · hp {mx6.health}
            {mx6.flying ? " · flying" : ""}
          </p>
          <p>
            look {mx6.yaw.toFixed(2)} / {mx6.pitch.toFixed(2)} · fuses {mx6.fuses}
          </p>
          <p>{status || "online"} · {online} in room</p>
          <label className="mx6-file">
            Photo → 32×32 new blocks
            <input
              type="file"
              accept="image/*"
              onChange={(ev) => {
                const file = ev.target.files?.[0];
                if (!file) return;
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                  const n = engine.current?.mx6BuildPortraitFromImage(img, img.naturalWidth, img.naturalHeight) ?? 0;
                  URL.revokeObjectURL(url);
                  ev.target.value = "";
                  if (n > 0) sfx.click();
                };
                img.onerror = () => URL.revokeObjectURL(url);
                img.src = url;
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              engine.current?.mx6ToggleBreakRadius();
              const info = engine.current?.mx6Debug();
              if (info) setMx6(info);
              sfx.click();
            }}
          >
            Break radius: {mx6.breakRadius}
          </button>
          <button type="button" onClick={() => engine.current?.spawnLitTnt()}>Spawn lit TNT</button>
          <button type="button" onClick={() => engine.current?.mx6Heal()}>Heal</button>
          <button type="button" onClick={() => setMx6Open(false)}>Close</button>
        </div>
      )}

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
              rows={7}
              maxLength={SIGN_MAX_CHARS}
              value={signText}
              placeholder="Write something…"
              onChange={(ev) =>
                setSignText(
                  ev.target.value
                    .replace(/\r/g, "")
                    .split("\n")
                    .slice(0, SIGN_MAX_BREAKS + 1)
                    .join("\n")
                    .slice(0, SIGN_MAX_CHARS),
                )
              }
            />
            <p className="note">
              {signText.length}/{SIGN_MAX_CHARS} characters. Long text wraps and shrinks to fit the board. Everyone in the room can read it.
            </p>
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
            <div className="seg-label">Mobs</div>
            <div className="seg">
              {(
                [
                  ["all", "All"],
                  ["passive", "Animals only"],
                  ["off", "Off"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={hud?.mobMode === mode ? "on" : ""}
                  onClick={() => e()?.setMobMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="exit" onClick={onExit}>Save &amp; Exit</button>
            <p className="note">WASD · Space jump · Fly: F or double-tap Space/Jump, or the Fly button (Up/Down buttons or Space/Shift to climb and descend) · Left click mine · Right click place · 1-9 or wheel to pick · tap the selected slot to change its block</p>
          </div>
        </div>
      )}
    </div>
  );
}
