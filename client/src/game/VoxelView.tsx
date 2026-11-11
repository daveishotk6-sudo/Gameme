import { useEffect, useRef, useState } from "react";
import { Engine, type HudState } from "./engine";
import { block, CREATIVE_PALETTE } from "./blocks";
import { loadSave } from "./save";
import { connectPhoton, type PhotonLink } from "../net/photon";

type Props = { seed: number; room: string; name: string; onExit: () => void };

export default function VoxelView({ seed, room, name, onExit }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const net = useRef<PhotonLink | null>(null);
  const chatDraft = useRef<HTMLInputElement>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [picker, setPicker] = useState(false);
  const [chat, setChat] = useState<string[]>([]);
  const [online, setOnline] = useState(1);
  const [status, setStatus] = useState("Connecting");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const slot = `room-${room}`;
    const e = new Engine({
      host: el, seed, save: loadSave(slot), touch, slot, onHud: setHud,
      onChatKey: () => chatDraft.current?.focus(),
    });
    engine.current = e;
    e.onLocalBlock = (x, y, z, id) => net.current?.block(x, y, z, id);
    e.onPose = (p) => net.current?.move({ ...p, name });

    let link: PhotonLink | null = null;
    try {
      link = connectPhoton(room, name, {
        onStatus: setStatus,
        onCount: setOnline,
        onPos: (actor, pos) => e.setRemote(actor, pos),
        onLeave: (actor) => e.removeRemote(actor),
        onBlock: (x, y, z, id) => e.applyRemoteBlock(x, y, z, id),
        onChat: (from, text) => setChat((prev) => [...prev.slice(-7), `${from.replace(/-[a-z0-9]{5}$/, "")}: ${text}`]),
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

  const sendChat = () => {
    const text = chatDraft.current?.value.trim() ?? "";
    if (text) net.current?.say(text);
    if (chatDraft.current) chatDraft.current.value = "";
  };
  const endTyping = () => {
    const eng = e();
    if (eng) {
      eng.typing = false;
      eng.lockPointer();
    }
  };

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
            style={{ background: block(id).color }}
            aria-label={block(id).name}
          >
            <span>{i + 1}</span>
          </button>
        ))}
      </div>

      <div className="joy" />

      <form
        className="chat"
        data-hud
        onSubmit={(ev) => {
          ev.preventDefault();
          sendChat();
          chatDraft.current?.blur();
          endTyping();
        }}
      >
        <div className="chat-log">
          {chat.length === 0 ? <p>Chat is live for this room. Press Enter to type.</p> : chat.map((line, i) => <p key={i}>{line}</p>)}
        </div>
        <input
          ref={chatDraft}
          data-hud
          maxLength={140}
          placeholder="Message"
          enterKeyHint="send"
          onFocus={() => { if (engine.current) engine.current.typing = true; }}
          onBlur={() => { if (engine.current) engine.current.typing = false; }}
        />
      </form>

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
            <p className="note">WASD · Space jump (double-tap to fly, Shift down) · Left click mine · Right click place · 1-9 or wheel to pick · Enter to chat · tap the selected slot to change its block</p>
          </div>
        </div>
      )}
    </div>
  );
}
