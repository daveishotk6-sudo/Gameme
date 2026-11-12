import * as THREE from "three";

/**
 * Other players: a small articulated character (head with a face, torso, arms, legs, hair) plus a
 * crisp nametag. Everyone gets their own look, picked deterministically from their name, so the same
 * person looks the same on every screen and friends are easy to tell apart.
 */

// ------------------------------------------------------------------ appearance

export interface Look {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  hat: number;
  eye: number;
  style: "short" | "long" | "spiky" | "beanie";
}

const SKIN = [0xf2c9a0, 0xe5b48a, 0xd39a6c, 0xb87a4e, 0x8d5a36, 0x6b4128, 0xfadfc7];
const HAIR = [0x2b1b10, 0x4a2f1a, 0x7a4a24, 0xc08a3e, 0xe3c675, 0x161616, 0x8c2f23, 0xb8b8b8, 0x5b3fbf, 0x1f8a70];
const SHIRT = [0x3b82f6, 0xef4444, 0x22c55e, 0xf97316, 0xa855f7, 0x14b8a6, 0xec4899, 0xeab308, 0x0ea5e9, 0x84cc16];
const PANTS = [0x1e3a8a, 0x374151, 0x3f3f46, 0x14532d, 0x4c1d95, 0x7c2d12, 0x1f2937, 0x44403c];
const HAT = [0xef4444, 0xfacc15, 0x22d3ee, 0xf472b6, 0x4ade80, 0xfb923c];
const EYES = [0x2a1d12, 0x1e4fa8, 0x2d6a3e, 0x5a3b8c];
const STYLES: Look["style"][] = ["short", "short", "long", "spiky", "beanie"];

function hash32(s: string) {
  let h = 2166136261;
  for (const ch of s.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lookOf(name: string): Look {
  const r = rng(hash32(name));
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  return { skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT), pants: pick(PANTS), hat: pick(HAT), eye: pick(EYES), style: pick(STYLES) };
}

const mixHex = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
const css = (n: number) => "#" + n.toString(16).padStart(6, "0");

// ------------------------------------------------------------------ geometry (shared between all players)

const geoCache = new Map<string, THREE.BufferGeometry>();

/**
 * Box with its shading baked into vertex colours (top bright, bottom dark, sides in between) so the
 * figures have depth without needing lights. `hang` moves the pivot to the top so limbs swing from the joint.
 */
function box(w: number, h: number, d: number, hang = false) {
  const key = `${w}|${h}|${d}|${hang}`;
  let g = geoCache.get(key);
  if (g) return g;
  g = new THREE.BoxGeometry(w, h, d);
  if (hang) g.translate(0, -h / 2, 0);
  const n = g.getAttribute("normal");
  const col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    const s = ny > 0.5 ? 1 : ny < -0.5 ? 0.5 : nz < -0.5 ? 0.92 : nz > 0.5 ? 0.7 : nx > 0.5 ? 0.85 : 0.65;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.userData.shared = true;
  geoCache.set(key, g);
  return g;
}

let facePlane: THREE.PlaneGeometry | null = null;
function faceGeometry() {
  if (!facePlane) {
    facePlane = new THREE.PlaneGeometry(0.46, 0.46);
    facePlane.userData.shared = true;
  }
  return facePlane;
}

// ------------------------------------------------------------------ textures

/** 16x16 pixel-art face: eyebrows, eyes with pupils, and a little smile. */
function faceTexture(look: Look) {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 16;
  const g = c.getContext("2d")!;
  g.fillStyle = css(look.skin);
  g.fillRect(0, 0, 16, 16);
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };
  const brow = css(mixHex(look.hair, 0x000000, 0.25));
  px(3, 5, 4, 1, brow);
  px(9, 5, 4, 1, brow);
  px(3, 7, 4, 3, "#ffffff"); // eye whites
  px(9, 7, 4, 3, "#ffffff");
  px(4, 7, 2, 3, css(look.eye)); // pupils, looking straight ahead
  px(10, 7, 2, 3, css(look.eye));
  px(4, 7, 1, 1, "#ffffff"); // tiny highlight
  px(10, 7, 1, 1, "#ffffff");
  const mouth = css(mixHex(look.skin, 0x7a1f1f, 0.55));
  px(6, 12, 4, 1, mouth);
  px(5, 11, 1, 1, mouth);
  px(10, 11, 1, 1, mouth);
  px(1, 9, 2, 2, css(mixHex(look.skin, 0xff6b6b, 0.18))); // soft cheeks
  px(13, 9, 2, 2, css(mixHex(look.skin, 0xff6b6b, 0.18)));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ nametag

const TAG_FONT = '700 58px system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const TAG_H = 0.27; // world height of a tag, in blocks

function pill(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * High-resolution nametag: rendered at about 4x the size it appears on screen with mip-mapping and
 * anisotropic filtering, so the text stays sharp up close and at an angle.
 */
export function makeNameTag(label: string, ghost: boolean, accent?: number) {
  const text = label.slice(0, 26);
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = TAG_FONT;
  const natural = probe.measureText(text).width;
  const dot = accent !== undefined ? 46 : 0;
  const padX = 36;
  const maxW = 1024;
  const room = maxW - padX * 2 - dot;
  const size = natural > room ? Math.floor(58 * (room / natural)) : 58;
  const textW = Math.min(natural, room);
  const W = Math.ceil(textW + padX * 2 + dot);
  const H = 112;

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.font = TAG_FONT.replace("58px", `${size}px`);
  g.textBaseline = "middle";

  // pill background with a faint rim light
  pill(g, 6, 12, W - 12, H - 24, (H - 24) / 2);
  g.fillStyle = ghost ? "rgba(30,38,55,0.5)" : "rgba(10,14,26,0.66)";
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = ghost ? "rgba(190,205,230,0.35)" : "rgba(255,255,255,0.22)";
  if (ghost) g.setLineDash([12, 9]);
  g.stroke();
  g.setLineDash([]);

  let x = padX;
  if (accent !== undefined) {
    g.beginPath();
    g.arc(padX + 4 + 17, H / 2, 17, 0, Math.PI * 2);
    g.fillStyle = css(accent);
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.stroke();
    x += dot;
  }
  g.textAlign = "left";
  g.lineJoin = "round";
  g.lineWidth = 9;
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.strokeText(text, x, H / 2 + 3);
  g.fillStyle = ghost ? "#bcc8dc" : "#ffffff";
  g.fillText(text, x, H / 2 + 3);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  const w = (TAG_H * W) / H;
  sp.userData.base = [w, TAG_H];
  sp.scale.set(w, TAG_H, 1);
  sp.position.y = 2.3;
  sp.renderOrder = 20;
  return sp;
}

/** Keep a tag readable at any distance (it grows a little with distance) and fade it out when far away. */
export function updateTag(g: THREE.Group, cam: THREE.Vector3) {
  const tag = g.userData.tag as THREE.Sprite;
  const d = Math.hypot(g.position.x - cam.x, g.position.y + 2.3 - cam.y, g.position.z - cam.z);
  const s = THREE.MathUtils.clamp(d / 9, 1, 2.8);
  const [w, h] = tag.userData.base as [number, number];
  tag.scale.set(w * s, h * s, 1);
  const a = THREE.MathUtils.clamp((90 - d) / 25, 0, 1);
  (tag.material as THREE.SpriteMaterial).opacity = a;
  tag.visible = a > 0.01;
}

// ------------------------------------------------------------------ the character

interface Parts {
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  phase: number;
  seed: number;
}

export function buildPlayer(opts: { name: string; label: string; ghost: boolean }): THREE.Group {
  const look = lookOf(opts.name);
  const ghost = opts.ghost;
  const tint = (n: number) => (ghost ? mixHex(n, 0x9fb4d6, 0.55) : n);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mats = new Map<string, THREE.MeshBasicMaterial>();
  const matFor = (color: number, opt: { map?: THREE.Texture; vertex?: boolean } = {}) => {
    const key = `${color}|${opt.map ? "m" : ""}|${opt.vertex === false ? "n" : ""}`;
    let m = mats.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color: tint(color),
        map: opt.map ?? null,
        vertexColors: opt.vertex !== false,
        ...(ghost ? { transparent: true, opacity: 0.42, depthWrite: false } : {}),
      });
      m.userData.base = new THREE.Color(tint(color));
      mats.set(key, m);
    }
    return m;
  };
  const part = (parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, hang = false) => {
    const m = new THREE.Mesh(box(w, h, d, hang), matFor(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // torso, with a lighter chest stripe and a belt
  part(body, 0.52, 0.72, 0.26, look.shirt, 0, 1.06, 0);
  part(body, 0.53, 0.07, 0.27, mixHex(look.shirt, 0xffffff, 0.35), 0, 1.2, 0);
  part(body, 0.53, 0.07, 0.27, 0x3a2a1a, 0, 0.74, 0);

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.42, 0);
  body.add(head);
  const H = 0.46;
  part(head, H, H, H, look.skin, 0, H / 2, 0);
  part(head, 0.04, 0.1, 0.08, look.skin, H / 2 + 0.01, H / 2 - 0.03, 0); // ears
  part(head, 0.04, 0.1, 0.08, look.skin, -H / 2 - 0.01, H / 2 - 0.03, 0);
  const faceMap = faceTexture(look);
  const face = new THREE.Mesh(faceGeometry(), matFor(0xf2f2f2, { map: faceMap, vertex: false }));
  face.position.set(0, H / 2, -(H / 2 + 0.002));
  face.rotation.y = Math.PI;
  head.add(face);

  // hair / hat
  const hc = look.hair;
  const top = H / 2 + H / 2; // top of the head, in head space
  if (look.style === "beanie") {
    part(head, H + 0.08, 0.2, H + 0.08, look.hat, 0, top - 0.06, 0);
    part(head, H + 0.1, 0.05, H + 0.1, mixHex(look.hat, 0xffffff, 0.3), 0, top - 0.15, 0); // folded rim
    part(head, 0.12, 0.08, 0.12, mixHex(look.hat, 0xffffff, 0.3), 0, top + 0.07, 0); // pom
    part(head, H + 0.04, 0.2, 0.05, hc, 0, H / 2 - 0.02, H / 2 + 0.02); // hair at the back
  } else {
    part(head, H + 0.06, 0.15, H + 0.06, hc, 0, top - 0.055, 0); // cap of hair
    part(head, H + 0.06, 0.06, 0.05, hc, 0, top - 0.115, -(H / 2 + 0.02)); // fringe, kept high so the eyebrows show
    part(head, H + 0.06, 0.3, 0.06, hc, 0, top - 0.17, H / 2 + 0.02); // back
    part(head, 0.05, 0.26, H * 0.62, hc, H / 2 + 0.02, top - 0.14, H * 0.18); // sides
    part(head, 0.05, 0.26, H * 0.62, hc, -H / 2 - 0.02, top - 0.14, H * 0.18);
    if (look.style === "long") {
      part(head, H + 0.08, 0.5, 0.07, hc, 0, top - 0.4, H / 2 + 0.03);
      part(head, 0.06, 0.4, 0.2, hc, H / 2 + 0.03, top - 0.34, H * 0.34);
      part(head, 0.06, 0.4, 0.2, hc, -H / 2 - 0.03, top - 0.34, H * 0.34);
    } else if (look.style === "spiky") {
      for (const [sx, sz, sh] of [[-0.14, -0.1, 0.16], [0.14, -0.1, 0.13], [0, 0, 0.2], [-0.13, 0.12, 0.13], [0.13, 0.12, 0.16]]) {
        part(head, 0.1, sh, 0.1, hc, sx, top + sh / 2 - 0.01, sz);
      }
    }
  }

  // arms: sleeve + hand, hanging from the shoulder
  const arm = (sx: number) => {
    const a = new THREE.Group();
    a.position.set(sx * 0.37, 1.38, 0);
    part(a, 0.2, 0.42, 0.22, look.shirt, 0, 0, 0, true);
    part(a, 0.17, 0.27, 0.19, look.skin, 0, -0.42, 0, true);
    body.add(a);
    return a;
  };
  const armR = arm(1);
  const armL = arm(-1);

  // legs: trousers + shoe, hanging from the hip
  const leg = (sx: number) => {
    const l = new THREE.Group();
    l.position.set(sx * 0.13, 0.7, 0);
    part(l, 0.24, 0.59, 0.26, look.pants, 0, 0, 0, true);
    part(l, 0.25, 0.11, 0.31, 0x24262b, 0, -0.59, -0.025, true);
    body.add(l);
    return l;
  };
  const legR = leg(1);
  const legL = leg(-1);

  const tag = makeNameTag(opts.label, ghost, ghost ? undefined : look.shirt);
  root.add(tag);

  const parts: Parts = { body, head, armL, armR, legL, legR, phase: Math.random() * 6, seed: Math.random() * 6 };
  root.userData.parts = parts;
  root.userData.tag = tag;
  root.userData.lit = 1;
  root.userData.mats = [...mats.values()];
  return root;
}

// ------------------------------------------------------------------ animation & lighting

export interface Motion {
  /** Horizontal speed in blocks per second. */
  speed: number;
  /** Vertical speed in blocks per second (jumping, falling, flying). */
  vy: number;
  /** Where they're looking, in radians (positive is up). */
  pitch: number;
  /** True while they are mining or hitting something, so their arm swings. */
  swing?: boolean;
}

/** Walk cycle, idle breathing, arms out in the air, and the head follows where they look. */
export function animatePlayer(g: THREE.Group, dt: number, t: number, m: Motion) {
  const p = g.userData.parts as Parts;
  const moving = THREE.MathUtils.clamp(m.speed / 3.5, 0, 1);
  const air = THREE.MathUtils.clamp(Math.abs(m.vy) / 3, 0, 1);
  p.phase += dt * (2.4 + Math.min(m.speed, 12) * 1.25);
  const swing = Math.sin(p.phase) * moving * 0.85 * (1 - air);
  const breathe = Math.sin(t * 1.8 + p.seed);

  p.legR.rotation.x = swing + air * 0.35;
  p.legL.rotation.x = -swing - air * 0.25;
  p.armR.rotation.x = -swing * 0.9;
  p.armL.rotation.x = swing * 0.9;
  const out = 0.05 + 0.03 * breathe + air * 0.7;
  p.armR.rotation.z = out;
  p.armL.rotation.z = -out;

  // Mining: the right arm raises and chops down; blends in and out smoothly.
  const u = g.userData as { mineP?: number; mineW?: number };
  u.mineW = (u.mineW ?? 0) + ((m.swing ? 1 : 0) - (u.mineW ?? 0)) * Math.min(1, dt * 14);
  u.mineP = m.swing ? (u.mineP ?? 0) + dt * 2.7 : 0;
  if (u.mineW > 0.01) {
    const chop = 0.5 + 0.5 * Math.sin(u.mineP * Math.PI * 2);
    p.armR.rotation.x += (1.0 + chop * 1.2 - p.armR.rotation.x) * u.mineW;
    p.armR.rotation.z += (0.05 - p.armR.rotation.z) * u.mineW;
  }

  p.head.rotation.x = THREE.MathUtils.clamp(m.pitch, -1.1, 1.1) * 0.85;
  p.head.rotation.y = Math.sin(t * 0.7 + p.seed) * 0.1 * (1 - moving);
  p.body.position.y = Math.abs(Math.sin(p.phase)) * 0.035 * moving * (1 - air);
}

/** Dim a player with the time of day so they don't glow at night. `v` is 0..1. */
export function setPlayerLight(g: THREE.Group, v: number) {
  if (Math.abs((g.userData.lit as number) - v) < 0.01) return;
  g.userData.lit = v;
  for (const m of g.userData.mats as THREE.MeshBasicMaterial[]) m.color.copy(m.userData.base as THREE.Color).multiplyScalar(v);
}

/** Free everything this player owns. The shared box geometries are kept for the others. */
export function disposePlayer(g: THREE.Group) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    // Box/plane geometry is shared by every player, and a Sprite uses three.js's own shared quad: leave both alone.
    if (m.geometry && !m.geometry.userData.shared && !(o as THREE.Sprite).isSprite) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      (x as THREE.MeshBasicMaterial).map?.dispose();
      x.dispose();
    }
  });
}
