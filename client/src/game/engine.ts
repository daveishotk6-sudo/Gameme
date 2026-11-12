import * as THREE from "three";
import { AIR, WATER, block, isReplaceable, CREATIVE_PALETTE } from "./blocks";
import { buildChunk, createTerrainMaterials } from "./mesh";
import { writeSave, type SaveData } from "./save";
import { Sky } from "./sky";
import { DAY_MS, DAY_START } from "./daycycle";
import { CS, EYE, HALF_W, HEIGHT, VOID_Y, World, ck, ckX, ckZ, findSpawn, moveBody, overlaps, raycast, type Hit } from "./world";

export interface HudState {
  selected: number;
  hotbar: number[];
  paused: boolean;
  pos: [number, number, number];
  target: string;
  submerged: boolean;
  health: number;
  air: number;
  hurt: number;
  dead: boolean;
}

export interface EngineOpts {
  host: HTMLElement;
  seed: number;
  save: SaveData | null;
  touch: boolean;
  slot: string;
  name: string;
  onHud: (s: HudState) => void;
}

const HOTBAR_DEFAULT = [1, 2, 3, 4, 9, 10, 11, 17, 7];

interface Remote {
  group: THREE.Group;
  tx: number; ty: number; tz: number; tyaw: number;
  name: string;
}

function nameTag(name: string, dim = false) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 48;
  const g = c.getContext("2d")!;
  g.font = (dim ? "italic bold 26px" : "bold 28px") + " sans-serif";
  g.textAlign = "center";
  g.fillStyle = "rgba(0,0,0,0.55)";
  const w = Math.min(250, g.measureText(name).width + 22);
  g.fillRect(128 - w / 2, 4, w, 40);
  g.fillStyle = dim ? "#b8c4d8" : "#fff";
  g.fillText(name.slice(0, 22), 128, 35);
  const t = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sp.scale.set(dim ? 2.2 : 1.6, dim ? 0.38 : 0.3, 1);
  sp.position.y = 2.1;
  sp.renderOrder = 20;
  return sp;
}

function buildFigure(ghost: boolean, label: string) {
  const g = new THREE.Group();
  const add = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial(ghost ? { color: c, transparent: true, opacity: 0.42, depthWrite: false } : { color: c }),
    );
    m.position.set(x, y, z);
    g.add(m);
  };
  const body = ghost ? 0x9fb4d6 : 0x3b82f6;
  const legs = ghost ? 0x7d92b8 : 0x1e40af;
  const skin = ghost ? 0xc9d6ea : 0xf2c9a0;
  add(0.5, 0.75, 0.28, body, 0, 1.05, 0);
  add(0.42, 0.42, 0.42, skin, 0, 1.65, 0);
  add(0.08, 0.08, 0.02, 0x222222, -0.1, 1.68, -0.22);
  add(0.08, 0.08, 0.02, 0x222222, 0.1, 1.68, -0.22);
  add(0.22, 0.68, 0.24, legs, -0.13, 0.34, 0);
  add(0.22, 0.68, 0.24, legs, 0.13, 0.34, 0);
  g.add(nameTag(label, ghost));
  return g;
}

function disposeGroup(g: THREE.Group) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | undefined;
    mat?.dispose();
  });
}

export class Engine {
  world: World;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  mats = createTerrainMaterials();
  meshes = new Map<number, THREE.Mesh[]>();
  outline: THREE.LineSegments;
  sky: Sky;
  dayFactor = 1;
  private elapsed = 0;
  private under = false;

  pos = { x: 0, y: 40, z: 0 };
  vel = { x: 0, y: 0, z: 0 };
  yaw = 0;
  pitch = 0;
  grounded = false;
  flying = false;

  keys = new Set<string>();
  joy = { x: 0, y: 0 };
  jumpHeld = false;
  mineHeld = false;
  placeHeld = false;
  placeQueued = false;

  hotbar = [...HOTBAR_DEFAULT];
  selected = 0;
  paused = false;
  rd: number;
  clock = DAY_START;

  onLocalBlock?: (x: number, y: number, z: number, id: number) => void;
  onPose?: (p: { x: number; y: number; z: number; yaw: number }) => void;
  /** Shared multiplayer time of day (0..1), or null when not synced (offline / still connecting). */
  timeSource?: () => number | null;
  private remotes = new Map<number, Remote>();
  private ghosts = new Map<string, THREE.Group>();
  health = 20;
  air = 10;
  dead = false;
  private hurt = 0;
  private hurtCd = 99;
  private regenT = 0;
  private airT = 0;
  private peakY = 0;
  private airborne = false;
  private poseT = 0;
  private raf = 0;
  private last = performance.now();
  private dirty = new Set<number>();
  private queue: number[] = [];
  private lastChunk = "";
  private mineCd = 0;
  private placeCd = 0;
  private mineProgress = 0;
  private mineKey = "";
  private hit: Hit | null = null;
  private saveT = 0;
  private hudT = 0;
  private lastJump = 0;
  private spawn: { x: number; y: number; z: number };
  private cleanup: (() => void)[] = [];

  constructor(private o: EngineOpts) {
    const { host, seed, save, touch } = o;
    this.rd = touch ? 2 : 3;
    this.world = new World(seed);
    if (save) {
      this.world.loadEdits(save.edits);
      this.selected = Math.max(0, Math.min(8, save.selected | 0));
      this.clock = save.clock;
      this.health = Math.max(1, Math.min(20, save.health ?? 20));
    }
    this.spawn = findSpawn(seed);
    const p = save ? save.pos : [this.spawn.x, this.spawn.y, this.spawn.z];
    this.pos = { x: p[0]!, y: p[1]!, z: p[2]! };
    if (save) { this.yaw = save.yaw; this.pitch = save.pitch; }

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(touch ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(72, host.clientWidth / Math.max(1, host.clientHeight), 0.08, 700);
    this.camera.rotation.order = "YXZ";
    this.scene.background = new THREE.Color(0x87b7e8);

    const box = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x000000 }));
    this.outline.visible = false;
    this.scene.add(this.outline);

    this.sky = new Sky(this.scene);
    this.applyFog();
    this.world.stream(this.pos.x, this.pos.z, this.rd + 1);
    // Don't spawn inside terrain after loading a save.
    for (let i = 0; i < 64 && overlaps(this.world, this.pos.x, this.pos.y, this.pos.z); i++) this.pos.y += 1;
    this.syncChunks(true);
    this.bindInput(host);
    this.raf = requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------ public

  /** A block change that arrived from another player. */
  applyRemoteBlock(x: number, y: number, z: number, id: number) {
    this.world.set(x, y, z, id);
    this.markEdit(x, z);
  }

  setRemote(actor: number, p: { x: number; y: number; z: number; yaw: number; name: string }) {
    let r = this.remotes.get(actor);
    if (!r) {
      const g = buildFigure(false, p.name);
      g.position.set(p.x, p.y, p.z);
      this.scene.add(g);
      r = { group: g, tx: p.x, ty: p.y, tz: p.z, tyaw: p.yaw, name: p.name };
      this.remotes.set(actor, r);
    }
    r.tx = p.x; r.ty = p.y; r.tz = p.z; r.tyaw = p.yaw;
  }

  remoteInfo(actor: number) {
    const r = this.remotes.get(actor);
    return r ? { name: r.name, x: r.tx, y: r.ty, z: r.tz, yaw: r.tyaw } : null;
  }

  /** Show players who left as faded ghosts tagged [Offline] where they were last seen. */
  setGhosts(map: Record<string, { x: number; y: number; z: number; yaw: number }>) {
    for (const [who, g] of this.ghosts) {
      if (!map[who] || who === this.o.name) {
        this.scene.remove(g);
        disposeGroup(g);
        this.ghosts.delete(who);
      }
    }
    for (const [who, p] of Object.entries(map)) {
      if (who === this.o.name) continue;
      let g = this.ghosts.get(who);
      if (!g) {
        g = buildFigure(true, `[Offline] ${who}`);
        this.scene.add(g);
        this.ghosts.set(who, g);
      }
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.yaw;
      g.userData.baseY = p.y;
    }
  }

  /** Move to a saved position, but only if we are still near where we spawned. */
  teleport(p: { x: number; y: number; z: number; yaw: number }) {
    const dx = this.pos.x - this.spawn.x, dz = this.pos.z - this.spawn.z;
    if (Math.hypot(dx, dz) > 6) return;
    this.pos = { x: p.x, y: p.y, z: p.z };
    this.yaw = p.yaw;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.world.stream(this.pos.x, this.pos.z, this.rd + 1);
    for (let i = 0; i < 64 && overlaps(this.world, this.pos.x, this.pos.y, this.pos.z); i++) this.pos.y += 1;
    this.peakY = this.pos.y;
    this.lastChunk = "";
    this.syncChunks(true);
  }

  removeRemote(actor: number) {
    const r = this.remotes.get(actor);
    if (!r) return;
    this.scene.remove(r.group);
    disposeGroup(r.group);
    this.remotes.delete(actor);
  }

  select(i: number) {
    this.selected = ((i % 9) + 9) % 9;
    this.emit();
  }
  setHotbar(slot: number, id: number) {
    this.hotbar[slot] = id;
    this.emit();
  }
  damage(n: number) {
    if (this.dead || n <= 0) return;
    this.health = Math.max(0, this.health - n);
    this.hurt++;
    this.hurtCd = 0;
    if (this.health <= 0) {
      this.dead = true;
      this.mineHeld = false;
      this.placeHeld = false;
      this.keys.clear();
      this.vel.x = this.vel.z = 0;
      if (document.pointerLockElement) document.exitPointerLock();
    }
    this.emit();
  }

  respawn() {
    this.health = 20;
    this.air = 10;
    this.dead = false;
    this.hurtCd = 99;
    this.pos = { x: this.spawn.x, y: this.spawn.y + 1, z: this.spawn.z };
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.flying = false;
    this.peakY = this.pos.y;
    this.world.stream(this.pos.x, this.pos.z, this.rd + 1);
    this.lastChunk = "";
    this.syncChunks(true);
    this.lockPointer();
    this.emit();
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) {
      this.mineHeld = false;
      this.placeHeld = false;
      if (document.pointerLockElement) document.exitPointerLock();
    }
    this.emit();
  }
  lockPointer() {
    if (!this.o.touch) this.renderer.domElement.requestPointerLock?.();
  }
  saveNow() {
    writeSave(
      {
      v: 1, seed: this.world.seed,
      pos: [this.pos.x, this.pos.y, this.pos.z], yaw: this.yaw, pitch: this.pitch,
      selected: this.selected, clock: this.clock, health: this.health, edits: this.world.dumpEdits(),
      },
      this.o.slot,
    );
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.saveNow();
    for (const c of this.cleanup) c();
    for (const k of [...this.meshes.keys()]) this.dropMesh(k);
    for (const a of [...this.remotes.keys()]) this.removeRemote(a);
    for (const g of this.ghosts.values()) { this.scene.remove(g); disposeGroup(g); }
    this.ghosts.clear();
    this.mats.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------- input

  private bindInput(host: HTMLElement) {
    const canvas = this.renderer.domElement;
    const on = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(t, f as EventListener);
      this.cleanup.push(() => window.removeEventListener(t, f as EventListener));
    };
    on("keydown", (e) => {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (e.repeat) return;
      if (/^Digit[1-9]$/.test(e.code)) this.select(Number(e.code.slice(5)) - 1);
      else if (e.code === "KeyF") this.flying = !this.flying;
      else if (e.code === "Space") {
        const now = performance.now();
        if (now - this.lastJump < 280) this.flying = !this.flying;
        this.lastJump = now;
      }
      if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    on("keyup", (e) => this.keys.delete(e.code));
    on("blur", () => { this.keys.clear(); this.mineHeld = false; this.placeHeld = false; });
    on("mousemove", (e) => {
      if (document.pointerLockElement !== canvas || this.paused) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.0022));
    });
    on("mouseup", (e) => { if (e.button === 0) this.mineHeld = false; if (e.button === 2) this.placeHeld = false; });
    on("resize", () => this.resize(host));
    const wheel = (e: WheelEvent) => { e.preventDefault(); this.select(this.selected + (e.deltaY > 0 ? 1 : -1)); };
    canvas.addEventListener("wheel", wheel, { passive: false });
    this.cleanup.push(() => canvas.removeEventListener("wheel", wheel));
    const ctx = (e: Event) => e.preventDefault();
    canvas.addEventListener("contextmenu", ctx);
    this.cleanup.push(() => canvas.removeEventListener("contextmenu", ctx));
    const down = (e: MouseEvent) => {
      if (this.o.touch || this.paused) return;
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
      if (e.button === 0) this.mineHeld = true;
      if (e.button === 2) { this.placeHeld = true; this.placeQueued = true; }
    };
    canvas.addEventListener("mousedown", down);
    this.cleanup.push(() => canvas.removeEventListener("mousedown", down));
    const lockChange = () => {
      if (!this.o.touch && document.pointerLockElement !== canvas && !this.paused) this.setPaused(true);
    };
    document.addEventListener("pointerlockchange", lockChange);
    this.cleanup.push(() => document.removeEventListener("pointerlockchange", lockChange));

    // Touch: left half = floating stick, right half = look.
    let joyId = -1, joyX = 0, joyY = 0, lookId = -1, lx = 0, ly = 0;
    const ts = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest("[data-hud]")) return;
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < window.innerWidth * 0.45 && joyId < 0) { joyId = t.identifier; joyX = t.clientX; joyY = t.clientY; }
        else if (lookId < 0) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    };
    const tm = (e: TouchEvent) => {
      if (this.paused) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === joyId) {
          const dx = (t.clientX - joyX) / 48, dy = (t.clientY - joyY) / 48;
          const m = Math.hypot(dx, dy);
          const k = m > 1 ? 1 / m : 1;
          this.joy.x = dx * k; this.joy.y = dy * k;
        } else if (t.identifier === lookId) {
          this.yaw -= (t.clientX - lx) * 0.0045;
          this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - (t.clientY - ly) * 0.0045));
          lx = t.clientX; ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const te = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === joyId) { joyId = -1; this.joy.x = 0; this.joy.y = 0; }
        if (t.identifier === lookId) lookId = -1;
      }
    };
    canvas.addEventListener("touchstart", ts, { passive: false });
    canvas.addEventListener("touchmove", tm, { passive: false });
    canvas.addEventListener("touchend", te);
    canvas.addEventListener("touchcancel", te);
    this.cleanup.push(() => {
      canvas.removeEventListener("touchstart", ts);
      canvas.removeEventListener("touchmove", tm);
      canvas.removeEventListener("touchend", te);
      canvas.removeEventListener("touchcancel", te);
    });
    const vis = () => { if (document.hidden) this.saveNow(); };
    document.addEventListener("visibilitychange", vis);
    this.cleanup.push(() => document.removeEventListener("visibilitychange", vis));
    window.visualViewport?.addEventListener("resize", () => this.resize(host));
  }

  private resize(host: HTMLElement) {
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
    this.camera.updateProjectionMatrix();
  }

  private fogColor = new THREE.Color(0x87b7e8);
  private applyFog() {
    const far = this.rd * CS + 8;
    if (this.under) this.mats.setFog(new THREE.Color(0x1d4fa0), 2, 22);
    else this.mats.setFog(this.fogColor, far * 0.55, far);
  }

  private updateSky(dt: number) {
    this.elapsed += dt;
    const st = this.sky.update(this.clock % 1, this.camera.position, this.elapsed);
    this.dayFactor = st.day;
    this.fogColor.copy(st.color);
    (this.scene.background as THREE.Color).copy(this.under ? new THREE.Color(0x1d4fa0) : st.color);
    this.mats.setSun(0.14 + 0.86 * st.day);
    this.applyFog();
  }

  // ------------------------------------------------------------ chunks

  private dropMesh(k: number) {
    const ms = this.meshes.get(k);
    if (!ms) return;
    for (const m of ms) { this.scene.remove(m); m.geometry.dispose(); }
    this.meshes.delete(k);
  }

  private rebuild(k: number) {
    this.dropMesh(k);
    const cx = ckX(k), cz = ckZ(k);
    const g = buildChunk(this.world, cx, cz);
    const ms: THREE.Mesh[] = [];
    if (g.opaque) ms.push(new THREE.Mesh(g.opaque, this.mats.opaque));
    if (g.trans) { const m = new THREE.Mesh(g.trans, this.mats.trans); m.renderOrder = 1; ms.push(m); }
    for (const m of ms) this.scene.add(m);
    this.meshes.set(k, ms);
  }

  private syncChunks(initial = false) {
    const { cx, cz } = this.world.stream(this.pos.x, this.pos.z, this.rd + 1);
    const want: number[] = [];
    for (let dx = -this.rd; dx <= this.rd; dx++) {
      for (let dz = -this.rd; dz <= this.rd; dz++) {
        const k = ck(cx + dx, cz + dz);
        if (!this.meshes.has(k)) want.push(k);
      }
    }
    want.sort((a, b) => Math.hypot(ckX(a) - cx, ckZ(a) - cz) - Math.hypot(ckX(b) - cx, ckZ(b) - cz));
    this.queue = want;
    for (const k of [...this.meshes.keys()]) {
      if (Math.abs(ckX(k) - cx) > this.rd + 1 || Math.abs(ckZ(k) - cz) > this.rd + 1) this.dropMesh(k);
    }
    if (initial) {
      for (let i = 0; i < 9 && this.queue.length; i++) this.rebuild(this.queue.shift()!);
    }
  }

  private markEdit(x: number, z: number) {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    this.dirty.add(ck(cx, cz));
    const lx = ((x % CS) + CS) % CS, lz = ((z % CS) + CS) % CS;
    if (lx === 0) this.dirty.add(ck(cx - 1, cz));
    if (lx === CS - 1) this.dirty.add(ck(cx + 1, cz));
    if (lz === 0) this.dirty.add(ck(cx, cz - 1));
    if (lz === CS - 1) this.dirty.add(ck(cx, cz + 1));
  }

  // ------------------------------------------------------------- frame

  private emit() {
    const h = this.hit;
    this.o.onHud({
      selected: this.selected,
      hotbar: [...this.hotbar],
      paused: this.paused,
      pos: [Math.round(this.pos.x), Math.round(this.pos.y), Math.round(this.pos.z)],
      target: h ? block(this.world.get(h.x, h.y, h.z)).name : "",
      submerged: this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z)) === WATER,
      health: this.health,
      air: Math.max(0, Math.ceil(this.air)),
      hurt: this.hurt,
      dead: this.dead,
    });
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.update(dt);

    for (const k of this.dirty) if (this.meshes.has(k)) this.rebuild(k);
    this.dirty.clear();
    for (let i = 0; i < 2 && this.queue.length; i++) {
      const k = this.queue.shift()!;
      if (!this.meshes.has(k) && this.world.chunks.has(k)) this.rebuild(k);
    }

    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.updateSky(dt);
    const k2 = Math.min(1, dt * 10);
    for (const r of this.remotes.values()) {
      const g = r.group;
      g.position.x += (r.tx - g.position.x) * k2;
      g.position.y += (r.ty - g.position.y) * k2;
      g.position.z += (r.tz - g.position.z) * k2;
      let dy = r.tyaw - g.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      g.rotation.y += dy * k2;
    }
    for (const g of this.ghosts.values()) g.position.y = (g.userData.baseY as number) + Math.sin(this.elapsed * 1.6) * 0.1;
    this.poseT += dt;
    if (this.poseT > 0.12) {
      this.poseT = 0;
      this.onPose?.({ x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw });
    }
    this.renderer.render(this.scene, this.camera);

    this.hudT += dt;
    if (this.hudT > 0.15) { this.hudT = 0; this.emit(); }
    this.saveT += dt;
    if (this.saveT > 20) { this.saveT = 0; this.saveNow(); }
  };

  private update(dt: number) {
    const w = this.world;
    if (this.dead) return;
    this.hurtCd += dt;
    this.clock += (dt * 1000) / DAY_MS;
    const shared = this.timeSource?.();
    if (shared != null) {
      // Pull our clock toward the room's clock by the shortest way around the day.
      let d = shared - (this.clock % 1);
      d -= Math.round(d);
      this.clock += Math.abs(d) > 0.02 ? d : d * Math.min(1, dt * 3);
    }
    this.under = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z)) === WATER;
    const k = this.keys;
    let mx = this.joy.x;
    let mz = this.joy.y;
    if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;
    if (k.has("KeyW") || k.has("ArrowUp")) mz -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) mz += 1;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const sprint = k.has("ShiftLeft") && !this.flying;
    const inWater = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z)) === WATER;
    const speed = this.flying ? (k.has("ShiftLeft") ? 14 : 9) : (sprint ? 6.2 : 4.4) * (inWater ? 0.55 : 1);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const tx = (mx * cos + mz * sin) * speed;
    const tz = (-mx * sin + mz * cos) * speed;
    const a = Math.min(1, dt * (this.grounded || this.flying || inWater ? 14 : 4));
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.z += (tz - this.vel.z) * a;

    const jump = k.has("Space") || this.jumpHeld;
    if (this.flying) {
      this.vel.y = (jump ? 7 : 0) - (k.has("ShiftLeft") ? 7 : 0);
    } else if (inWater) {
      this.vel.y -= 9 * dt;
      this.vel.y = Math.max(-3, this.vel.y);
      if (jump) {
        const headAir = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z)) !== WATER;
        this.vel.y = headAir ? 6.2 : 3.4;
      }
    } else {
      this.vel.y -= 28 * dt;
      this.vel.y = Math.max(-45, this.vel.y);
    }
    this.grounded = moveBody(w, this.pos, this.vel, dt);
    if (this.grounded && jump && !this.flying) { this.vel.y = 8.6; this.grounded = false; }
    if (this.grounded && this.flying) this.flying = false;

    // Fall damage: measured from the highest point of the current fall.
    if (this.flying || inWater) {
      this.peakY = this.pos.y;
      this.airborne = false;
    } else if (this.grounded) {
      if (this.airborne) {
        const fall = this.peakY - this.pos.y;
        if (fall > 3.2) this.damage(Math.floor(fall - 3));
      }
      this.airborne = false;
      this.peakY = this.pos.y;
    } else {
      this.airborne = true;
      this.peakY = Math.max(this.peakY, this.pos.y);
    }

    // Drowning and natural regeneration.
    if (this.under) {
      this.airT += dt;
      if (this.airT >= 1) {
        this.airT = 0;
        if (this.air > 0) this.air -= 1;
        else this.damage(2);
      }
    } else {
      this.air = Math.min(10, this.air + dt * 4);
      this.airT = 0;
    }
    if (this.health < 20 && this.hurtCd > 4) {
      this.regenT += dt;
      if (this.regenT >= 3) { this.regenT = 0; this.health = Math.min(20, this.health + 1); }
    } else this.regenT = 0;

    // Auto-jump up single steps (touch only).
    if (this.o.touch && this.grounded && ml > 0.2) {
      const d = Math.hypot(tx, tz) || 1;
      const fx = this.pos.x + (tx / d) * 0.5, fz = this.pos.z + (tz / d) * 0.5;
      const fy = Math.floor(this.pos.y + 0.05);
      if (w.solid(Math.floor(fx), fy, Math.floor(fz)) && !w.solid(Math.floor(fx), fy + 1, Math.floor(fz)) &&
          !w.solid(Math.floor(fx), fy + 2, Math.floor(fz)) && !w.solid(Math.floor(this.pos.x), fy + 2, Math.floor(this.pos.z))) {
        this.vel.y = 8.6;
      }
    }

    if (this.pos.y < VOID_Y) {
      this.pos.x = this.spawn.x; this.pos.y = this.spawn.y + 2; this.pos.z = this.spawn.z;
      this.vel.x = this.vel.y = this.vel.z = 0;
      this.peakY = this.pos.y;
      this.damage(4);
    }

    // Chunk streaming when crossing a chunk edge.
    const key = `${Math.floor(this.pos.x / CS)},${Math.floor(this.pos.z / CS)}`;
    if (key !== this.lastChunk) { this.lastChunk = key; this.syncChunks(); }

    this.interact(dt);
  }

  private interact(dt: number) {
    const w = this.world;
    const ex = this.pos.x, ey = this.pos.y + EYE, ez = this.pos.z;
    const dx = -Math.sin(this.yaw) * Math.cos(this.pitch);
    const dy = Math.sin(this.pitch);
    const dz = -Math.cos(this.yaw) * Math.cos(this.pitch);
    this.hit = raycast(w, ex, ey, ez, dx, dy, dz, 5.5);
    const hit = this.hit;
    if (hit) {
      this.outline.visible = true;
      this.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else this.outline.visible = false;

    this.mineCd -= dt;
    this.placeCd -= dt;

    if (this.mineHeld && hit) {
      const id = w.get(hit.x, hit.y, hit.z);
      const def = block(id);
      const tk = `${hit.x},${hit.y},${hit.z}`;
      if (tk !== this.mineKey) { this.mineKey = tk; this.mineProgress = 0; }
      if (def.hardness !== Infinity) {
        this.mineProgress += dt;
        if (this.mineProgress >= Math.min(def.hardness, 0.35) && this.mineCd <= 0) {
          this.breakBlock(hit.x, hit.y, hit.z);
          this.mineProgress = 0;
          this.mineCd = 0.18;
        }
      }
    } else this.mineProgress = 0;

    if ((this.placeQueued || this.placeHeld) && this.placeCd <= 0 && hit) {
      this.placeQueued = false;
      const target = w.get(hit.x, hit.y, hit.z);
      const px = isReplaceable(target) ? hit.x : hit.x + hit.faceX;
      const py = isReplaceable(target) ? hit.y : hit.y + hit.faceY;
      const pz = isReplaceable(target) ? hit.z : hit.z + hit.faceZ;
      const id = this.hotbar[this.selected]!;
      const def = block(id);
      if (id > 0 && id < 100 && isReplaceable(w.get(px, py, pz)) && py >= 0) {
        const blocks = def.solid &&
          this.pos.x - HALF_W < px + 1 && this.pos.x + HALF_W > px &&
          this.pos.z - HALF_W < pz + 1 && this.pos.z + HALF_W > pz &&
          this.pos.y < py + 1 && this.pos.y + HEIGHT > py;
        if (!blocks) {
          w.set(px, py, pz, id);
          this.markEdit(px, pz);
          this.onLocalBlock?.(px, py, pz, id);
          this.placeCd = 0.22;
        }
      }
    } else this.placeQueued = false;
  }

  private breakBlock(x: number, y: number, z: number) {
    const w = this.world;
    w.set(x, y, z, AIR);
    this.markEdit(x, z);
    this.onLocalBlock?.(x, y, z, AIR);
    // Plants sitting on the removed block pop off.
    if (block(w.get(x, y + 1, z)).cross) {
      w.set(x, y + 1, z, AIR);
      this.markEdit(x, z);
      this.onLocalBlock?.(x, y + 1, z, AIR);
    }
  }
}

export { CREATIVE_PALETTE };
