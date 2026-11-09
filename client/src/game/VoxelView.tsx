import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { buildChunkGeometry, terrainMaterial } from "./mesh";
import {
  AIR,
  BLOCKS,
  CS,
  EYE,
  HOTBAR,
  VOID_Y,
  World,
  heightAt,
  moveBody,
  raycast,
} from "./world";

type Props = { seed: number; onExit: () => void };

const emptyCounts = () => {
  const c: Record<number, number> = {};
  for (const id of HOTBAR) c[id] = id === 1 || id === 2 || id === 3 ? 32 : 16;
  return c;
};

export default function VoxelView({ seed, onExit }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const keys = useRef(new Set<string>());
  const injected = useRef(new Set<string>());
  const joy = useRef({ x: 0, y: 0, id: -1, sx: 0, sy: 0 });
  const look = useRef({ id: -1, lx: 0, ly: 0 });
  const jumpHeld = useRef(false);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const breakQueued = useRef(false);
  const placeQueued = useRef(false);
  const pausedRef = useRef(false);

  const [selected, setSelected] = useState(0);
  const [counts, setCounts] = useState(emptyCounts);
  const [paused, setPaused] = useState(false);
  const selectedRef = useRef(0);
  const countsRef = useRef(counts);
  selectedRef.current = selected;
  countsRef.current = counts;
  pausedRef.current = paused;

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const world = new World(seed);
    const h0 = heightAt(8, 8, seed);
    const pos = { x: 8.5, y: h0 + 1.05, z: 8.5 };
    const vel = { x: 0, y: 0, z: 0 };
    let yaw = 0;
    let pitch = 0;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    renderer.setPixelRatio(1);
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setClearColor(0x87b7e8);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87b7e8);
    scene.fog = new THREE.Fog(0x9ec8ea, 28, 78);
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.85);
    sun.position.set(40, 60, 20);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(84, el.clientWidth / Math.max(1, el.clientHeight), 0.08, 120);
    camera.up.set(0, 1, 0);
    camera.rotation.order = "YXZ";

    const mat = terrainMaterial();
    const meshes = new Map<string, THREE.Mesh>();
    const dirty = new Set<string>();

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.01, 1.01, 1.01),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.85 }),
    );
    box.visible = false;
    scene.add(box);

    const syncChunks = () => {
      const { cx, cz } = world.stream(pos.x, pos.z);
      const live = new Set<string>();
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const k = `${cx + dx},${cz + dz}`;
          live.add(k);
          if (!meshes.has(k) || dirty.has(k)) {
            const chunk = world.chunks.get(k);
            if (!chunk) continue;
            const geo = buildChunkGeometry(world, cx + dx, cz + dz, chunk);
            const old = meshes.get(k);
            if (old) {
              scene.remove(old);
              old.geometry.dispose();
              meshes.delete(k);
            }
            const mesh = new THREE.Mesh(geo, mat);
            mesh.frustumCulled = false;
            scene.add(mesh);
            meshes.set(k, mesh);
            dirty.delete(k);
          }
        }
      }
      for (const [k, mesh] of meshes) {
        if (!live.has(k)) {
          scene.remove(mesh);
          mesh.geometry.dispose();
          meshes.delete(k);
        }
      }
    };

    const mark = (wx: number, wz: number) => {
      dirty.add(`${Math.floor(wx / CS)},${Math.floor(wz / CS)}`);
    };

    const held = (code: string) => keys.current.has(code) || injected.current.has(code);

    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      if (e.code.startsWith("Digit")) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= HOTBAR.length) setSelected(n - 1);
      }
      if (e.code === "Escape") setPaused((p) => !p);
      if (e.code === "KeyQ") breakQueued.current = true;
      if (e.code === "KeyE") placeQueued.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onBlur = () => {
      keys.current.clear();
      jumpHeld.current = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    const canvas = renderer.domElement;
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) placeQueued.current = true;
      else breakQueued.current = true;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      yaw -= e.movementX * 0.0022;
      pitch -= e.movementY * 0.0022;
      pitch = Math.max(-1.35, Math.min(1.35, pitch));
    };
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("click", () => {
      if (matchMedia("(pointer: fine)").matches) canvas.requestPointerLock();
    });

    const onTouchStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const target = t.target as HTMLElement;
        if (target.closest("[data-hud]")) continue;
        if (t.clientX < window.innerWidth * 0.38) {
          joy.current = { x: 0, y: 0, id: t.identifier, sx: t.clientX, sy: t.clientY };
        } else {
          look.current = { id: t.identifier, lx: t.clientX, ly: t.clientY };
        }
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.touches)) {
        if (t.identifier === joy.current.id) {
          joy.current.x = Math.max(-1, Math.min(1, (t.clientX - joy.current.sx) / 52));
          joy.current.y = Math.max(-1, Math.min(1, (t.clientY - joy.current.sy) / 52));
        }
        if (t.identifier === look.current.id) {
          const dx = t.clientX - look.current.lx;
          const dy = t.clientY - look.current.ly;
          yaw -= dx * 0.004;
          pitch -= dy * 0.004;
          pitch = Math.max(-1.35, Math.min(1.35, pitch));
          look.current.lx = t.clientX;
          look.current.ly = t.clientY;
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === joy.current.id) joy.current = { x: 0, y: 0, id: -1, sx: 0, sy: 0 };
        if (t.identifier === look.current.id) look.current.id = -1;
      }
    };
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    const onResize = () => {
      const vv = window.visualViewport;
      const w = Math.max(1, Math.round(vv?.width ?? el.clientWidth));
      const h = Math.max(1, Math.round(vv?.height ?? el.clientHeight));
      el.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    onResize();

    window.__controlsTest = {
      getYaw: () => yaw,
      getSpeed: () => Math.hypot(vel.x, vel.z),
      setKeys: (codes: string[]) => {
        injected.current = new Set(codes);
      },
      getX: () => pos.x,
      getY: () => pos.y,
      getZ: () => pos.z,
    };

    syncChunks();
    let last = performance.now();
    let raf = 0;
    let cd = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      yawRef.current = yaw;
      pitchRef.current = pitch;

      if (!pausedRef.current) {
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);
        let mx = 0;
        let mz = 0;
        if (held("KeyW") || held("ArrowUp")) {
          mx += fx;
          mz += fz;
        }
        if (held("KeyS") || held("ArrowDown")) {
          mx -= fx;
          mz -= fz;
        }
        if (held("KeyD") || held("ArrowRight")) {
          mx += rx;
          mz += rz;
        }
        if (held("KeyA") || held("ArrowLeft")) {
          mx -= rx;
          mz -= rz;
        }
        mx += rx * joy.current.x + fx * -joy.current.y;
        mz += rz * joy.current.x + fz * -joy.current.y;
        const mag = Math.hypot(mx, mz);
        const speed = held("ShiftLeft") ? 7.4 : 4.8;
        if (mag > 0.01) {
          vel.x = (mx / mag) * speed;
          vel.z = (mz / mag) * speed;
        } else {
          vel.x = 0;
          vel.z = 0;
        }

        vel.y += -28 * dt;
        if (vel.y < -42) vel.y = -42;

        const grounded = moveBody(world, pos, vel, dt);
        if (grounded && (held("Space") || jumpHeld.current)) vel.y = 8.6;

        // Deep void only — never snap players who are still on the map.
        if (pos.y < VOID_Y) {
          const hy = heightAt(8, 8, seed);
          pos.x = 8.5;
          pos.y = hy + 4;
          pos.z = 8.5;
          vel.x = vel.y = vel.z = 0;
          syncChunks();
        }

        const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
        const hit = raycast(world, pos.x, pos.y + EYE, pos.z, dir.x, dir.y, dir.z, 6);
        if (hit) {
          box.visible = true;
          box.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
        } else box.visible = false;

        cd -= dt;
        if (cd <= 0 && hit && (breakQueued.current || placeQueued.current)) {
          if (breakQueued.current) {
            const id = world.get(hit.x, hit.y, hit.z);
            world.set(hit.x, hit.y, hit.z, AIR);
            mark(hit.x, hit.z);
            mark(hit.x + hit.faceX, hit.z + hit.faceZ);
            if (id && HOTBAR.includes(id)) {
              const next = { ...countsRef.current, [id]: (countsRef.current[id] ?? 0) + 1 };
              countsRef.current = next;
              setCounts(next);
            }
          } else if (placeQueued.current) {
            const id = HOTBAR[selectedRef.current] ?? 1;
            const px = hit.x + hit.faceX;
            const py = hit.y + hit.faceY;
            const pz = hit.z + hit.faceZ;
            const have = countsRef.current[id] ?? 0;
            const inside =
              Math.abs(pos.x - (px + 0.5)) < 0.8 &&
              Math.abs(pos.z - (pz + 0.5)) < 0.8 &&
              py < pos.y + 1.72 &&
              py + 1 > pos.y;
            if (have > 0 && py >= 0 && py < 32 && !world.solid(px, py, pz) && !inside) {
              world.set(px, py, pz, id);
              mark(px, pz);
              const next = { ...countsRef.current, [id]: have - 1 };
              countsRef.current = next;
              setCounts(next);
            }
          }
          breakQueued.current = false;
          placeQueued.current = false;
          cd = 0.16;
          syncChunks();
        } else if (!hit) {
          breakQueued.current = false;
          placeQueued.current = false;
        }
      }

      camera.up.set(0, 1, 0);
      camera.position.set(pos.x, pos.y + EYE, pos.z);
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      camera.rotation.z = 0;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    const chunkTimer = window.setInterval(syncChunks, 400);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(chunkTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      canvas.removeEventListener("mousedown", onMouseDown);
      renderer.dispose();
      mat.dispose();
      for (const mesh of meshes.values()) mesh.geometry.dispose();
      if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
      delete window.__controlsTest;
    };
  }, [seed]);

  return (
    <div className="stage">
      <div ref={host} className="host" />
      <div className="cross" />

      <div className="topbar">
        <div className="badge">Gameme</div>
        <button data-hud type="button" className="menu-btn" onClick={() => setPaused(true)}>
          Menu
        </button>
      </div>

      <div className="hotbar">
        {HOTBAR.map((id, i) => (
          <button
            data-hud
            key={id}
            type="button"
            onClick={() => setSelected(i)}
            className={i === selected ? "slot on" : "slot"}
            style={{ background: BLOCKS[id]?.color ?? "#333" }}
            aria-label={BLOCKS[id]?.name}
          >
            <span>{counts[id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="joy" />

      <div className="actions">
        <button
          data-hud
          type="button"
          className="round"
          onPointerDown={(e) => {
            e.preventDefault();
            breakQueued.current = true;
          }}
        >
          Mine
        </button>
        <button
          data-hud
          type="button"
          className="round jump"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            jumpHeld.current = true;
          }}
          onPointerUp={() => {
            jumpHeld.current = false;
          }}
          onPointerCancel={() => {
            jumpHeld.current = false;
          }}
          onPointerLeave={() => {
            jumpHeld.current = false;
          }}
        >
          Jump
        </button>
        <button
          data-hud
          type="button"
          className="round"
          onPointerDown={(e) => {
            e.preventDefault();
            placeQueued.current = true;
          }}
        >
          Place
        </button>
      </div>

      {paused && (
        <div className="pause">
          <div className="card">
            <h2>Paused</h2>
            <button type="button" className="resume" onClick={() => setPaused(false)}>
              Resume
            </button>
            <button type="button" className="exit" onClick={onExit}>
              Exit
            </button>
            <p className="note">WASD · Space / Jump · Mine and Place · drag the right side to look</p>
          </div>
        </div>
      )}
    </div>
  );
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys: (codes: string[]) => void;
      getX: () => number;
      getY: () => number;
      getZ: () => number;
    };
  }
}
