import * as THREE from "three";
import { AIR, WATER, block, isReplaceable, CREATIVE_PALETTE, SIGN, FURNACE, COAL, SMELT, itemInfo, NETHER_PORTAL, OBSIDIAN, TNT, BASALT, LAST_BLOCK, STONE } from "./blocks";
import {
  spawnHerd, topUpMobs, updateMob, hitMob, disposeMob, mobDrop, mobName, spawnMonsters, isHostile, mobAim,
  createArrow, updateArrow, disposeArrow, type Arrow, type Mob, type MobCtx,
} from "./mobs";
import { buildChunk, createTerrainMaterials } from "./mesh";
import { writeSave, type SaveData } from "./save";
import { Sky } from "./sky";
import { sfx, materialOf } from "./audio";
import { buildPlayer, animatePlayer, updateTag, setPlayerLight, disposePlayer, lookOf } from "./avatar";
import { MiningFx } from "./mining";
import { buildSign, cleanSignText, disposeSign, retextSign, shadeSign, signKey, type SignData, type SignObject } from "./signs";
import { DAY_MS, DAY_START } from "./daycycle";
import { CS, EYE, HALF_W, HEIGHT, VOID_Y, WH, World, ck, ckX, ckZ, findSpawn, moveBody, overlaps, raycast, type Hit } from "./world";

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
  flying: boolean;
  tip: string;
  mobMode: "all" | "passive" | "off";
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
  tx: number; ty: number; tz: number; tyaw: number; tpitch: number;
  /** Smoothed values the walk animation is driven from. */
  pitch: number; speed: number; vy: number;
  mine: boolean;
  name: string;
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
  /** Touch "Down" button: descend while flying. */
  descendHeld = false;

  hotbar = [...HOTBAR_DEFAULT];
  selected = 0;
  paused = false;
  rd: number;
  clock = DAY_START;

  onLocalBlock?: (x: number, y: number, z: number, id: number) => void;
  onPose?: (p: { x: number; y: number; z: number; yaw: number; pitch: number; mine: boolean }) => void;
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
  private fps = 60;
  private fuses: { x: number; y: number; z: number; t: number }[] = [];
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
  private flyGrace = 0;
  private flyLift = 0;
  private stepDist = 0;
  private mineSfxT = 0;
  private mobs: Mob[] = [];
  private arrows: Arrow[] = [];
  private monsterT = 2;
  /** all = animals and monsters, passive = animals only, off = no mobs at all. Saved on this device. */
  mobMode: "all" | "passive" | "off" = (() => {
    try {
      const v = localStorage.getItem("gameme:mobmode");
      return v === "passive" || v === "off" ? v : "all";
    } catch {
      return "all";
    }
  })();
  private mobTopUpT = 0;
  /** Time spent standing inside a nether portal (seconds). */
  private portalT = 0;
  private portalCooldown = 0;
  private furnaceProgress = 0;
  private furnaceTarget: { x: number; y: number; z: number } | null = null;
  private smeltMsg = "";
  private smeltMsgT = 0;

  signs = new Map<string, SignData>();
  private signObjs = new Map<string, SignObject>();
  private signT = 0;
  /** True while a dialog (sign editor) has the keyboard; the world is frozen but no pause menu shows. */
  modal = false;
  onEditSign?: (s: SignData) => void;
  onLocalSign?: (s: SignData) => void;
  private fx!: MiningFx;
  private fxProgress = 0;
  private fxMining = false;
  private hSpeed = 0;
  private wasInWater = false;
  private t0 = performance.now();
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
      for (const [x, y, z, yaw, text] of save.signs ?? []) this.signs.set(signKey(x, y, z), { x, y, z, yaw, text: cleanSignText(text) });
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
    this.fx = new MiningFx(this.scene, this.camera, lookOf(this.o.name));
    this.applyFog();
    this.world.stream(this.pos.x, this.pos.z, this.rd + 1);
    // Don't spawn inside terrain after loading a save.
    for (let i = 0; i < 64 && overlaps(this.world, this.pos.x, this.pos.y, this.pos.z); i++) this.pos.y += 1;
    this.syncChunks(true);
    // Dense passive animals near the player so they're visible immediately.
    if (this.mobMode !== "off") {
      this.mobs = spawnHerd(this.world, this.pos, 6);
      for (const m of this.mobs) this.scene.add(m.group);
    }
    this.mobTopUpT = 0;
    this.bindInput(host);
    this.raf = requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------ public

  /** A block change that arrived from another player. */
  applyRemoteBlock(x: number, y: number, z: number, id: number) {
    const old = this.world.get(x, y, z);
    // Quiet, distance-faded sound for other players' edits (skipped while the room's block history replays on join).
    if (old !== id && performance.now() - this.t0 > 3000) {
      const d = Math.hypot(x + 0.5 - this.pos.x, y - this.pos.y - 1, z + 0.5 - this.pos.z);
      const vol = Math.max(0, 1 - d / 28) * 0.7;
      if (vol > 0.03) sfx.block(id === AIR ? old : id, id === AIR ? "break" : "place", vol);
    }
    this.world.set(x, y, z, id);
    this.markEdit(x, z);
    if (old === SIGN && id !== SIGN) this.signs.delete(signKey(x, y, z));
    if (id === SIGN && !this.signs.has(signKey(x, y, z))) this.signs.set(signKey(x, y, z), { x, y, z, yaw: 0, text: "" });
  }

  /** A sign's text/orientation that arrived from another player. */
  applyRemoteSign(s: SignData) {
    this.signs.set(signKey(s.x, s.y, s.z), { ...s, text: cleanSignText(s.text) });
    this.syncSigns();
  }

  /** Save edited text from the sign dialog and share it. */
  setSignText(x: number, y: number, z: number, raw: string) {
    const s = this.signs.get(signKey(x, y, z));
    if (!s) return;
    s.text = cleanSignText(raw);
    this.onLocalSign?.({ ...s });
    this.syncSigns();
  }

  closeSign() {
    this.modal = false;
    this.lockPointer();
    this.emit();
  }

  removeSign(x: number, y: number, z: number) {
    this.breakBlock(x, y, z);
    this.closeSign();
  }

  private openSign(x: number, y: number, z: number) {
    const k = signKey(x, y, z);
    let s = this.signs.get(k);
    if (!s) {
      s = { x, y, z, yaw: 0, text: "" };
      this.signs.set(k, s);
    }
    this.modal = true;
    this.mineHeld = false;
    this.placeHeld = false;
    this.keys.clear();
    this.joy.x = this.joy.y = 0;
    if (document.pointerLockElement) document.exitPointerLock();
    this.onEditSign?.({ ...s });
    this.emit();
  }

  private syncSigns() {
    for (const [k, s] of this.signs) {
      const loaded = this.world.chunks.has(ck(Math.floor(s.x / CS), Math.floor(s.z / CS)));
      const near = Math.hypot(s.x - this.pos.x, s.z - this.pos.z) < (this.rd + 1) * CS;
      const valid = loaded && near && this.world.get(s.x, s.y, s.z) === SIGN;
      const o = this.signObjs.get(k);
      if (valid && !o) {
        const so = buildSign(s);
        this.scene.add(so.group);
        this.signObjs.set(k, so);
      } else if (!valid && o) {
        this.scene.remove(o.group);
        disposeSign(o);
        this.signObjs.delete(k);
      } else if (o) {
        if (o.text !== s.text) retextSign(o, s.text);
        o.group.rotation.y = s.yaw;
      }
    }
    // Objects whose data was deleted (sign broken) go away too.
    for (const [k, o] of this.signObjs) {
      if (!this.signs.has(k)) {
        this.scene.remove(o.group);
        disposeSign(o);
        this.signObjs.delete(k);
      }
    }
  }

  setRemote(actor: number, p: { x: number; y: number; z: number; yaw: number; name: string; pitch?: number; mine?: boolean }) {
    const pitch = Number.isFinite(p.pitch) ? (p.pitch as number) : 0;
    let r = this.remotes.get(actor);
    if (!r) {
      const g = buildPlayer({ name: p.name, label: p.name, ghost: false });
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.yaw;
      this.scene.add(g);
      r = { group: g, tx: p.x, ty: p.y, tz: p.z, tyaw: p.yaw, tpitch: pitch, pitch, speed: 0, vy: 0, mine: !!p.mine, name: p.name };
      this.remotes.set(actor, r);
    }
    r.tx = p.x; r.ty = p.y; r.tz = p.z; r.tyaw = p.yaw; r.tpitch = pitch; r.mine = !!p.mine;
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
        disposePlayer(g);
        this.ghosts.delete(who);
      }
    }
    for (const [who, p] of Object.entries(map)) {
      if (who === this.o.name) continue;
      let g = this.ghosts.get(who);
      if (!g) {
        g = buildPlayer({ name: who, label: `[Offline] ${who}`, ghost: true });
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
    disposePlayer(r.group);
    this.remotes.delete(actor);
  }

  select(i: number) {
    this.selected = ((i % 9) + 9) % 9;
    sfx.click();
    this.emit();
  }

  /** Turn fly mode on/off. Turning it on gives a short takeoff hop (about a block) so it's obvious it worked. */
  setFly(on: boolean) {
    if (on === this.flying || this.dead) return;
    this.flying = on;
    if (on) {
      this.flyLift = 5;
      this.grounded = false;
      this.flyGrace = 0.4; // don't let ground contact right at takeoff switch it straight back off
    } else {
      this.flyLift = 0;
      this.descendHeld = false;
    }
    this.emit();
  }
  toggleFly() {
    this.setFly(!this.flying);
  }
  /** Jump pressed (key or touch button). Pressing twice quickly toggles fly mode. */
  jumpPress() {
    const now = performance.now();
    if (now - this.lastJump < 280) this.toggleFly();
    this.lastJump = now;
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
    if (this.health > 0) sfx.hurt();
    if (this.health <= 0) {
      sfx.death();
      this.dead = true;
      this.flying = false;
      this.descendHeld = false;
      this.mineHeld = false;
      this.placeHeld = false;
      this.keys.clear();
      this.vel.x = this.vel.z = 0;
      if (document.pointerLockElement) document.exitPointerLock();
    }
    this.emit();
  }

  /** MX6 debug only. Full heal, and clear a death if one is in progress. */
  mx6Heal() {
    if (!isMx6(this.o.name)) return;
    this.health = 20;
    this.air = 10;
    this.dead = false;
    this.emit();
  }

  /** MX6 debug only. Drop a block of TNT a few steps ahead, already burning. */
  spawnLitTnt() {
    if (!isMx6(this.o.name)) return;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const x = Math.floor(this.pos.x - sin * 4);
    let y = Math.floor(this.pos.y + 0.2);
    const z = Math.floor(this.pos.z - cos * 4);
    for (let i = 0; i < 4 && !isReplaceable(this.world.get(x, y, z)); i++) y++;
    if (y < 1 || y >= WH - 1 || !isReplaceable(this.world.get(x, y, z))) return;
    this.world.set(x, y, z, TNT);
    this.markEdit(x, z);
    this.onLocalBlock?.(x, y, z, TNT);
    sfx.block(TNT, "place");
    this.fuses.push({ x, y, z, t: 2.2 });
  }

  mx6Debug() {
    return {
      fps: Math.round(this.fps),
      seed: this.world.seed,
      chunks: this.world.chunks.size,
      yaw: this.yaw,
      pitch: this.pitch,
      fuses: this.fuses.length,
      flying: this.flying,
      health: this.health,
    };
  }

  /**
   * MX6 only: turn a photo into a 64×64 wall of in-game blocks in front of the player.
   * Maps each pixel to the nearest solid block color.
   */
  mx6BuildPortraitFromImage(img: CanvasImageSource, srcW: number, srcH: number): number {
    if (!isMx6(this.o.name)) return 0;
    const SIZE = 64;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    // Cover-crop to square then scale to 64²
    const side = Math.min(srcW, srcH);
    const sx = (srcW - side) / 2;
    const sy = (srcH - side) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

    const palette = portraitPalette();
    // Facing direction + right vector so the wall faces the player
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const dist = 6;
    const ox = Math.floor(this.pos.x + fx * dist);
    const oz = Math.floor(this.pos.z + fz * dist);
    const oy = Math.floor(this.pos.y);

    let placed = 0;
    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const i = (py * SIZE + px) * 4;
        const a = data[i + 3]!;
        if (a < 20) continue;
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        const id = nearestBlock(palette, r, g, b);
        // px left→right on wall, py bottom→top (image y is top→bottom)
        const wx = Math.round(ox + rx * (px - SIZE / 2));
        const wy = oy + (SIZE - 1 - py);
        const wz = Math.round(oz + rz * (px - SIZE / 2));
        if (wy < 1 || wy >= WH - 1) continue;
        this.world.set(wx, wy, wz, id);
        this.onLocalBlock?.(wx, wy, wz, id);
        placed++;
      }
    }
    this.syncChunks(true);
    this.smeltMsg = `Portrait: ${placed} blocks`;
    this.smeltMsgT = 3;
    return placed;
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
    sfx.respawn();
    this.emit();
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) {
      this.mineHeld = false;
      this.placeHeld = false;
      this.descendHeld = false;
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
      selected: this.selected, clock: this.clock, health: this.health, signs: [...this.signs.values()].map((s) => [s.x, s.y, s.z, s.yaw, s.text] as [number, number, number, number, string]), edits: this.world.dumpEdits(),
      },
      this.o.slot,
    );
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.saveNow();
    for (const c of this.cleanup) c();
    for (const k of [...this.meshes.keys()]) this.dropMesh(k);
    this.fx.dispose();
    for (const o of this.signObjs.values()) { this.scene.remove(o.group); disposeSign(o); }
    this.signObjs.clear();
    for (const a of [...this.remotes.keys()]) this.removeRemote(a);
    for (const g of this.ghosts.values()) { this.scene.remove(g); disposePlayer(g); }
    this.ghosts.clear();
    for (const m of this.mobs) { this.scene.remove(m.group); disposeMob(m); }
    this.mobs = [];
    this.clearArrows();
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
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement | null)?.tagName ?? "")) return;
      if (e.repeat) return;
      if (/^Digit[1-9]$/.test(e.code)) this.select(Number(e.code.slice(5)) - 1);
      else if (e.code === "KeyF") this.toggleFly();
      else if (e.code === "Space") this.jumpPress();
      if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    on("keyup", (e) => this.keys.delete(e.code));
    on("blur", () => { this.keys.clear(); this.mineHeld = false; this.placeHeld = false; this.descendHeld = false; });
    // Browsers only allow audio after a user gesture, so any of these switches sound on.
    const unlock = () => sfx.unlock();
    on("pointerup", unlock);
    on("touchend", unlock);
    on("click", unlock);
    on("keydown", unlock);
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
      if (!this.o.touch && document.pointerLockElement !== canvas && !this.paused && !this.modal) this.setPaused(true);
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
    if (this.world.dim === -1) {
      // Classic Nether Wastes atmosphere: deep red fog, warm ambient light
      this.dayFactor = 0.4;
      this.fogColor.set(0x330808);
      (this.scene.background as THREE.Color).set(0x1c0606);
      this.mats.setSun(0.72); // brighter so glowstone + magma read well
      const far = this.rd * CS + 8;
      this.mats.setFog(this.fogColor, 6, Math.max(18, far * 0.55));
      return;
    }
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
      target: h ? this.targetLabel(h.x, h.y, h.z) : "",
      submerged: this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z)) === WATER,
      health: this.health,
      air: Math.max(0, Math.ceil(this.air)),
      hurt: this.hurt,
      dead: this.dead,
      mobMode: this.mobMode,
      flying: this.flying,
      tip: this.smeltMsgT > 0 ? this.smeltMsg : "",
    });
  }

  private targetLabel(x: number, y: number, z: number) {
    const id = this.world.get(x, y, z);
    if (id !== SIGN) return block(id).name;
    const t = this.signs.get(signKey(x, y, z))?.text.replace(/\n/g, " / ") ?? "";
    return t ? `Sign: ${t.slice(0, 40)}` : "Sign (empty)";
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.08;
    if (!this.paused && !this.modal) this.update(dt);
    this.signT -= dt;
    if (this.signT <= 0) {
      this.signT = 0.4;
      this.syncSigns();
    }
    const signShade = 0.3 + 0.7 * this.dayFactor;
    for (const o of this.signObjs.values()) shadeSign(o, signShade);

    for (const k of this.dirty) if (this.meshes.has(k)) this.rebuild(k);
    this.dirty.clear();
    for (let i = 0; i < 2 && this.queue.length; i++) {
      const k = this.queue.shift()!;
      if (!this.meshes.has(k) && this.world.chunks.has(k)) this.rebuild(k);
    }

    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.fx.setHeld(this.hotbar[this.selected] ?? 0);
    this.fx.update(dt, {
      mining: this.fxMining,
      progress: this.fxProgress,
      target: this.hit ? { x: this.hit.x, y: this.hit.y, z: this.hit.z } : null,
      speed: this.hSpeed,
      visible: !this.paused && !this.dead,
    });
    this.updateSky(dt);
    const k2 = Math.min(1, dt * 10);
    // Other players: glide to their latest position, walk/idle animation, look direction, light and nametag.
    const light = 0.3 + 0.7 * this.dayFactor;
    const cam = this.camera.position;
    for (const r of this.remotes.values()) {
      const g = r.group;
      const ox = g.position.x, oy = g.position.y, oz = g.position.z;
      g.position.x += (r.tx - g.position.x) * k2;
      g.position.y += (r.ty - g.position.y) * k2;
      g.position.z += (r.tz - g.position.z) * k2;
      let dy = r.tyaw - g.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      g.rotation.y += dy * k2;
      r.pitch += (r.tpitch - r.pitch) * k2;
      if (dt > 0) {
        const ks = Math.min(1, dt * 8);
        const sp = Math.min(14, Math.hypot(g.position.x - ox, g.position.z - oz) / dt);
        const vy = Math.max(-12, Math.min(12, (g.position.y - oy) / dt));
        r.speed += (sp - r.speed) * ks;
        r.vy += (vy - r.vy) * ks;
      }
      animatePlayer(g, dt, this.elapsed, { speed: r.speed, vy: r.vy, pitch: r.pitch, swing: r.mine });
      setPlayerLight(g, light);
      updateTag(g, cam);
    }
    for (const g of this.ghosts.values()) {
      g.position.y = (g.userData.baseY as number) + Math.sin(this.elapsed * 1.6) * 0.1;
      animatePlayer(g, dt, this.elapsed, { speed: 0, vy: 0, pitch: 0 });
      setPlayerLight(g, light);
      updateTag(g, cam);
    }
    this.poseT += dt;
    if (this.poseT > 0.12) {
      this.poseT = 0;
      this.onPose?.({ x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch, mine: this.fxMining });
    }
    this.renderer.render(this.scene, this.camera);

    this.hudT += dt;
    if (this.hudT > 0.15) { this.hudT = 0; this.emit(); }
    this.saveT += dt;
    if (this.saveT > 20) { this.saveT = 0; this.saveNow(); }
  };

  private update(dt: number) {
    this.tickFuses(dt);
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
    const vyBefore = this.vel.y;
    this.flyGrace = Math.max(0, this.flyGrace - dt);
    if (this.flying) {
      this.flyLift *= Math.max(0, 1 - dt * 4);
      this.vel.y = (jump ? 7 : 0) - (k.has("ShiftLeft") || this.descendHeld ? 7 : 0) + this.flyLift;
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
    this.hSpeed = this.grounded ? Math.hypot(this.vel.x, this.vel.z) : 0;
    if (this.grounded && jump && !this.flying) { this.vel.y = 8.6; this.grounded = false; sfx.jump(); }
    if (this.grounded && this.flying && this.flyGrace <= 0) this.setFly(false);

    // Sounds: splashes and footsteps.
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (inWater !== this.wasInWater) {
      this.wasInWater = inWater;
      if (this.elapsed > 1) sfx.splash(Math.min(1, Math.abs(vyBefore) / 12 + 0.25));
    }
    const below = materialOf(w.get(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.2), Math.floor(this.pos.z)));
    if (this.grounded && !this.flying && !inWater && hs > 0.8) {
      this.stepDist += hs * dt;
      if (this.stepDist > 2.3) { this.stepDist = 0; sfx.step(below, sprint); }
    } else if (inWater && hs > 0.8) {
      this.stepDist += hs * dt;
      if (this.stepDist > 1.8) { this.stepDist = 0; sfx.swim(); }
    } else if (!this.grounded) this.stepDist = 1.4;

    // Fall damage: measured from the highest point of the current fall.
    if (this.flying || inWater) {
      this.peakY = this.pos.y;
      this.airborne = false;
    } else if (this.grounded) {
      if (this.airborne) {
        const fall = this.peakY - this.pos.y;
        if (fall > 0.9) sfx.land(fall, below);
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
        if (this.air > 0) { this.air -= 1; sfx.bubble(); }
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

    // Passive mobs (overworld only — nether is hostile terrain for now)
    if (this.world.dim === 0) this.updateMobs(dt);
    this.smeltMsgT = Math.max(0, this.smeltMsgT - dt);
    this.updatePortal(dt);

    this.interact(dt);
  }

  /** Stand in a Nether Portal block to travel between overworld and nether. */
  private updatePortal(dt: number) {
    this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    const bx = Math.floor(this.pos.x);
    const by = Math.floor(this.pos.y + 0.2);
    const bz = Math.floor(this.pos.z);
    const inPortal =
      this.world.get(bx, by, bz) === NETHER_PORTAL ||
      this.world.get(bx, by + 1, bz) === NETHER_PORTAL;

    if (inPortal && this.portalCooldown <= 0) {
      this.portalT += dt;
      this.smeltMsg = this.world.dim === 0
        ? `Entering Nether… ${Math.min(100, Math.floor((this.portalT / 1.6) * 100))}%`
        : `Returning… ${Math.min(100, Math.floor((this.portalT / 1.6) * 100))}%`;
      this.smeltMsgT = 0.3;
      if (this.portalT >= 1.6) {
        this.portalT = 0;
        this.portalCooldown = 3;
        this.travelDimension(this.world.dim === 0 ? -1 : 0);
      }
    } else if (!inPortal) {
      this.portalT = 0;
    }
  }

  private travelDimension(dim: number) {
    // Drop chunk meshes
    for (const k of [...this.meshes.keys()]) this.dropMesh(k);
    // Clear mobs when leaving overworld
    for (const m of this.mobs) {
      this.scene.remove(m.group);
      disposeMob(m);
    }
    this.mobs = [];
    this.clearArrows();

    this.world.setDim(dim);
    let x = this.pos.x;
    let y = this.pos.y;
    let z = this.pos.z;
    if (dim === 0) {
      // Fixed overworld exit from the Nether
      x = 7.5;
      y = 29.05;
      z = 125.5;
    } else {
      // Entering nether: keep XZ, find safe footing
      this.world.stream(x, z, this.rd + 1);
      y = 32;
      for (let yy = WH - 4; yy > 2; yy--) {
        if (this.world.solid(Math.floor(x), yy - 1, Math.floor(z)) && !this.world.solid(Math.floor(x), yy, Math.floor(z))) {
          y = yy + 0.05;
          break;
        }
      }
    }
    this.world.stream(x, z, this.rd + 1);
    this.pos.x = x;
    this.pos.y = y;
    this.pos.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.syncChunks(true);
    if (dim === 0 && this.mobMode !== "off") {
      this.mobs = spawnHerd(this.world, this.pos, 6);
      for (const m of this.mobs) this.scene.add(m.group);
    }
    this.smeltMsg = dim === -1 ? "The Nether" : "Overworld";
    this.smeltMsgT = 2.5;
    sfx.block(OBSIDIAN, "place");
  }


  /** Switch mobs on or off; applies immediately and is remembered on this device. */
  setMobMode(mode: "all" | "passive" | "off") {
    this.mobMode = mode;
    try {
      localStorage.setItem("gameme:mobmode", mode);
    } catch {
      /* storage unavailable */
    }
    const keep: Mob[] = [];
    for (const m of this.mobs) {
      if (mode === "off" || (mode === "passive" && isHostile(m.kind))) {
        this.scene.remove(m.group);
        disposeMob(m);
      } else keep.push(m);
    }
    this.mobs = keep;
    if (mode !== "all") this.clearArrows();
    this.mobTopUpT = 0;
    this.emit();
  }

  private clearArrows() {
    for (const a of this.arrows) {
      this.scene.remove(a.mesh);
      disposeArrow(a);
    }
    this.arrows = [];
  }

  /** Damage from a monster, with a short grace period and a shove away from the attacker. */
  private hurtByMob(dmg: number, fromX: number, fromZ: number) {
    if (this.dead || this.hurtCd < 0.5) return;
    this.damage(dmg);
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.vel.x += (dx / d) * 5;
    this.vel.z += (dz / d) * 5;
    this.vel.y = Math.max(this.vel.y, 4.5);
    sfx.hurt();
  }

  private updateMobs(dt: number) {
    if (this.mobMode === "off") return;
    const ctx: MobCtx = {
      hostileOn: this.mobMode === "all" && !this.dead,
      hurtPlayer: (dmg, fx, fz) => this.hurtByMob(dmg, fx, fz),
      shoot: (from, to) => {
        const a = createArrow(from, to);
        this.scene.add(a.mesh);
        this.arrows.push(a);
      },
    };
    const sunny = this.dayFactor > 0.6;
    const keep: Mob[] = [];
    for (const m of this.mobs) {
      // Cull mobs that wandered very far away so we can respawn near the player.
      const far = Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z) > 64;
      // Surface monsters burn away in daylight; ones in caves stay.
      if (isHostile(m.kind) && sunny && this.world.exposure(m.pos.x, m.pos.y + 1, m.pos.z) > 0.99) {
        m.hp -= dt * 4;
        m.hurtT = Math.max(m.hurtT, 0.1);
        if (m.hp <= 0) m.dead = true;
      }
      if (far || !updateMob(m, this.world, dt, this.pos, ctx)) {
        this.scene.remove(m.group);
        disposeMob(m);
        continue;
      }
      keep.push(m);
    }
    this.mobs = keep;

    // Arrows in flight.
    this.arrows = this.arrows.filter((a) => {
      const alive = updateArrow(a, this.world, dt, this.pos, (fx, fz) => this.hurtByMob(3, fx, fz));
      if (!alive) {
        this.scene.remove(a.mesh);
        disposeArrow(a);
      }
      return alive;
    });

    // Keep the area stocked with animals.
    this.mobTopUpT -= dt;
    if (this.mobTopUpT <= 0) {
      this.mobTopUpT = 4;
      const added = topUpMobs(this.world, this.mobs.filter((m) => !isHostile(m.kind)), this.pos, 6);
      for (const m of added) {
        this.scene.add(m.group);
        this.mobs.push(m);
      }
    }

    // Monsters: more of them at night on the surface, a few in dark caves, none by day in the open.
    if (this.mobMode === "all" && !this.dead) {
      this.monsterT -= dt;
      if (this.monsterT <= 0) {
        this.monsterT = 3;
        const hostile = this.mobs.filter((m) => isHostile(m.kind)).length;
        const headLight = this.world.exposure(this.pos.x, this.pos.y + 1, this.pos.z);
        const where = this.dayFactor < 0.3 && headLight > 0.99 ? "surface" : headLight < 0.3 ? "cave" : null;
        const cap = where === "surface" ? 5 : where === "cave" ? 3 : 0;
        if (where && hostile < cap) {
          for (const m of spawnMonsters(this.world, this.pos, Math.min(2, cap - hostile), where)) {
            this.scene.add(m.group);
            this.mobs.push(m);
          }
        }
      }
    }
  }

  /** Put an item into the first empty hotbar slot, or replace the selected slot. */
  private giveItem(id: number) {
    for (let i = 0; i < 9; i++) {
      if (!this.hotbar[i] || this.hotbar[i] === 0) {
        this.hotbar[i] = id;
        this.emit();
        return;
      }
    }
    this.hotbar[this.selected] = id;
    this.emit();
  }

  /** True if any hotbar slot holds coal. Consumes one (sets slot empty). */
  private consumeCoal(): boolean {
    for (let i = 0; i < 9; i++) {
      if (this.hotbar[i] === COAL) {
        this.hotbar[i] = 0;
        this.emit();
        return true;
      }
    }
    return false;
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

    // --- hit mobs with left click (priority over blocks when aiming at one) ---
    let aimedMob: Mob | null = null;
    {
      const reach = 4.5;
      let best = reach;
      for (const m of this.mobs) {
        if (m.dead) continue;
        const aim = mobAim(m);
        const mx = m.pos.x - ex, my = aim.cy - ey, mz = m.pos.z - ez;
        const t = mx * dx + my * dy + mz * dz;
        if (t < 0.3 || t > best) continue;
        const px = ex + dx * t, py = ey + dy * t, pz = ez + dz * t;
        if (Math.hypot(px - m.pos.x, py - aim.cy, pz - m.pos.z) < aim.r) {
          best = t;
          aimedMob = m;
        }
      }
    }

    this.fxMining = false;
    this.fxProgress = 0;
    if (this.mineHeld && aimedMob && this.mineCd <= 0) {
      this.fx.swingOnce();
      const held = this.hotbar[this.selected] ?? 0;
      const info = itemInfo(held);
      const dmg = (info.kind === "sword" || info.kind === "axe" || info.kind === "bow")
        ? (info.dmg ?? 4)
        : 2;
      const died = hitMob(aimedMob, dmg);
      aimedMob.vel.x += dx * 4;
      aimedMob.vel.z += dz * 4;
      aimedMob.vel.y = Math.max(aimedMob.vel.y, 4);
      sfx.hurt();
      this.mineCd = 0.35;
      this.fxMining = true;
      if (died) {
        const drop = mobDrop(aimedMob.kind);
        this.giveItem(drop);
        this.smeltMsg = `${mobName(aimedMob.kind)} → ${itemInfo(drop).name}`;
        this.smeltMsgT = 2.5;
        this.scene.remove(aimedMob.group);
        disposeMob(aimedMob);
        this.mobs = this.mobs.filter((x) => x !== aimedMob);
      }
    } else if (this.mineHeld && hit && !aimedMob) {
      const id = w.get(hit.x, hit.y, hit.z);
      const def = block(id);
      const tk = `${hit.x},${hit.y},${hit.z}`;
      if (tk !== this.mineKey) { this.mineKey = tk; this.mineProgress = 0; }
      if (def.hardness !== Infinity) {
        const held = this.hotbar[this.selected] ?? 0;
        const tool = itemInfo(held);
        let need = def.hardness;
        // Tool speed shortens break time (creative still feels snappy)
        if (tool.speed && (tool.kind === "pick" || tool.kind === "axe" || tool.kind === "shovel")) {
          need = Math.max(0.08, def.hardness / tool.speed);
        } else {
          need = Math.min(def.hardness, 0.45);
        }
        this.mineProgress += dt;
        this.mineSfxT -= dt;
        this.fxMining = true;
        this.fxProgress = Math.min(1, this.mineProgress / need);
        if (this.mineSfxT <= 0) {
          this.mineSfxT = 0.2;
          sfx.block(id, "hit");
          this.fx.burst(hit.x + hit.faceX * 0.45, hit.y + hit.faceY * 0.45, hit.z + hit.faceZ * 0.45, id, 2, 1.6);
        }
        if (this.mineProgress >= need && this.mineCd <= 0) {
          this.breakBlock(hit.x, hit.y, hit.z);
          this.mineProgress = 0;
          this.mineCd = 0.18;
        }
      }
    } else this.mineProgress = 0;

    // --- furnace smelting: hold right-click on furnace while holding raw meat + coal in hotbar ---
    if (hit && w.get(hit.x, hit.y, hit.z) === FURNACE && (this.placeHeld || this.placeQueued)) {
      this.placeQueued = false;
      const held = this.hotbar[this.selected] ?? 0;
      const cooked = SMELT[held];
      const key = `${hit.x},${hit.y},${hit.z}`;
      if (cooked) {
        if (!this.furnaceTarget || this.furnaceTarget.x !== hit.x || this.furnaceTarget.y !== hit.y || this.furnaceTarget.z !== hit.z) {
          this.furnaceTarget = { x: hit.x, y: hit.y, z: hit.z };
          this.furnaceProgress = 0;
        }
        // Need coal somewhere in the hotbar
        const hasCoal = this.hotbar.some((id) => id === COAL);
        if (!hasCoal) {
          this.smeltMsg = "Need coal in hotbar";
          this.smeltMsgT = 1.5;
          this.furnaceProgress = 0;
        } else {
          this.furnaceProgress += dt;
          this.fxProgress = Math.min(1, this.furnaceProgress / 2.4);
          this.fxMining = true;
          if (this.furnaceProgress >= 2.4) {
            if (this.consumeCoal()) {
              this.hotbar[this.selected] = cooked;
              this.emit();
              this.smeltMsg = `Cooked → ${itemInfo(cooked).name}`;
              this.smeltMsgT = 2.5;
              sfx.block(FURNACE, "place");
            }
            this.furnaceProgress = 0;
            this.placeCd = 0.4;
          }
        }
      } else {
        this.smeltMsg = "Hold raw meat to cook";
        this.smeltMsgT = 1.2;
        this.furnaceProgress = 0;
      }
      // Don't also place a block while using the furnace
    } else {
      this.furnaceProgress = 0;
      this.furnaceTarget = null;

      if ((this.placeQueued || this.placeHeld) && this.placeCd <= 0 && hit) {
        this.placeQueued = false;
        const target = w.get(hit.x, hit.y, hit.z);
        if (target === SIGN) {
          this.placeQueued = false;
          this.placeHeld = false;
          this.placeCd = 0.4;
          this.openSign(hit.x, hit.y, hit.z);
          return;
        }
        const px = isReplaceable(target) ? hit.x : hit.x + hit.faceX;
        const py = isReplaceable(target) ? hit.y : hit.y + hit.faceY;
        const pz = isReplaceable(target) ? hit.z : hit.z + hit.faceZ;
        const id = this.hotbar[this.selected]!;
        const def = block(id);
        const supported = id !== SIGN || w.solid(px, py - 1, pz);
        if (id > 0 && id < 100 && supported && isReplaceable(w.get(px, py, pz)) && py >= 0) {
          const blocks = def.solid &&
            this.pos.x - HALF_W < px + 1 && this.pos.x + HALF_W > px &&
            this.pos.z - HALF_W < pz + 1 && this.pos.z + HALF_W > pz &&
            this.pos.y < py + 1 && this.pos.y + HEIGHT > py;
          if (!blocks) {
            w.set(px, py, pz, id);
            this.markEdit(px, pz);
            sfx.block(id, "place");
            this.fx.swingOnce();
            this.onLocalBlock?.(px, py, pz, id);
            this.placeCd = 0.22;
            if (id === SIGN) {
              const snap = Math.PI / 8;
              this.signs.set(signKey(px, py, pz), { x: px, y: py, z: pz, yaw: Math.round(this.yaw / snap) * snap, text: "" });
              this.onLocalSign?.({ ...this.signs.get(signKey(px, py, pz))! });
              this.syncSigns();
              this.openSign(px, py, pz);
            }
          }
        }
      } else this.placeQueued = false;
    }
  }

  private tickFuses(dt: number) {
    if (!this.fuses.length) return;
    const due: { x: number; y: number; z: number }[] = [];
    const left: { x: number; y: number; z: number; t: number }[] = [];
    for (const f of this.fuses) {
      f.t -= dt;
      if (f.t <= 0) due.push(f);
      else left.push(f);
    }
    this.fuses = left;
    for (const f of due) this.explode(f.x, f.y, f.z);
  }

  private explode(cx: number, cy: number, cz: number) {
    const R = 3;
    this.fx.burst(cx, cy, cz, TNT, 28, 6);
    sfx.block(TNT, "break");
    for (let x = cx - R; x <= cx + R; x++) {
      for (let y = cy - R; y <= cy + R; y++) {
        for (let z = cz - R; z <= cz + R; z++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 > R * R + 1) continue;
          if (y < 1 || y >= WH) continue;
          const id = this.world.get(x, y, z);
          if (id === AIR || id === BASALT) continue;
          if (block(id).hardness === Infinity) continue;
          if (id === SIGN) this.signs.delete(signKey(x, y, z));
          this.world.set(x, y, z, AIR);
          this.markEdit(x, z);
          this.onLocalBlock?.(x, y, z, AIR);
        }
      }
    }
    const dx = this.pos.x - (cx + 0.5);
    const dy = (this.pos.y + 1) - cy;
    const dz = this.pos.z - (cz + 0.5);
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 6 && !this.dead) {
      this.damage(Math.max(1, Math.round((6 - dist) * 2.2)));
      const d = dist || 1;
      this.vel.x += (dx / d) * 9;
      this.vel.z += (dz / d) * 9;
      this.vel.y = Math.max(this.vel.y, 7);
    }
  }

  private breakBlock(x: number, y: number, z: number) {
    const w = this.world;
    const oldId = w.get(x, y, z);
    sfx.block(oldId, "break");
    this.fx.burst(x, y, z, oldId, 16, 3);
    if (oldId === SIGN) this.signs.delete(signKey(x, y, z));
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


/** Solid, opaque blocks good for photo→voxel portraits. */
function portraitPalette(): { id: number; r: number; g: number; b: number }[] {
  const out: { id: number; r: number; g: number; b: number }[] = [];
  for (let id = 1; id <= LAST_BLOCK; id++) {
    const d = block(id);
    if (!d || !d.solid || !d.opaque || d.invisible || d.liquid) continue;
    const hex = d.color.replace("#", "");
    if (hex.length < 6) continue;
    out.push({
      id,
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    });
  }
  return out;
}

function nearestBlock(
  palette: { id: number; r: number; g: number; b: number }[],
  r: number, g: number, b: number,
): number {
  let best = palette[0]?.id ?? STONE;
  let bestD = Infinity;
  for (const p of palette) {
    const dr = r - p.r, dg = g - p.g, db = b - p.b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = p.id; }
  }
  return best;
}

function isMx6(name: string) {
  return name.trim().toLowerCase() === "mx6";
}
