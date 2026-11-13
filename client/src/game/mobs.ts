import * as THREE from "three";
import { World, HALF_W, HEIGHT, moveBody, overlaps } from "./world";
import { RAW_PORK, RAW_BEEF, RAW_CHICKEN, ROTTEN_FLESH, BONE, STRING, WATER, itemInfo } from "./blocks";

export type MobKind = "pig" | "cow" | "chicken" | "zombie" | "skeleton" | "spider";

export interface Mob {
  id: number;
  kind: MobKind;
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  yaw: number;
  hp: number;
  maxHp: number;
  age: number;
  wanderT: number;
  hurtT: number;
  grounded: boolean;
  group: THREE.Group;
  dead: boolean;
  /** Melee / bite cooldown (hostile mobs). */
  cd?: number;
  shootT?: number;
  leapT?: number;
  atkT?: number;
}

interface KindDef {
  hp: number; speed: number; drop: number; scale: number; color: number; accent: number;
  hostile?: boolean;
  hw?: number; h?: number; // collision box
  sight?: number;
  aimY?: number; aimR?: number; // where a swing/look has to land to hit it
}

const KIND: Record<MobKind, KindDef> = {
  pig:     { hp: 8,  speed: 2.4, drop: RAW_PORK,    scale: 0.78, color: 0xffb0bc, accent: 0xff7a8a },
  cow:     { hp: 14, speed: 2.0, drop: RAW_BEEF,    scale: 1.05, color: 0x6b4a36, accent: 0xf5f5f5 },
  chicken: { hp: 5,  speed: 3.2, drop: RAW_CHICKEN, scale: 0.62, color: 0xfff8e7, accent: 0xffb020 },
  zombie:   { hp: 20, speed: 2.5, drop: ROTTEN_FLESH, scale: 0.92, color: 0x5f8f4a, accent: 0x3a6ea5, hostile: true, hw: 0.3,  h: 1.8, sight: 22, aimY: 0.95, aimR: 0.75 },
  skeleton: { hp: 16, speed: 2.3, drop: BONE,         scale: 0.92, color: 0xe8e6da, accent: 0x6b4a2b, hostile: true, hw: 0.28, h: 1.8, sight: 22, aimY: 0.95, aimR: 0.7 },
  spider:   { hp: 14, speed: 3.6, drop: STRING,       scale: 1,    color: 0x2a2024, accent: 0xe02020, hostile: true, hw: 0.5,  h: 0.8, sight: 20, aimY: 0.45, aimR: 0.8 },
};

export const isHostile = (k: MobKind) => !!KIND[k].hostile;

/** Centre and radius used for "is the crosshair on this mob". */
export function mobAim(m: Mob) {
  const d = KIND[m.kind];
  return { cy: m.pos.y + (d.aimY ?? 0.4), r: d.aimR ?? 0.7 };
}

let nextId = 1;

function part(
  w: number, h: number, d: number,
  color: number,
  x = 0, y = 0, z = 0,
): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ color });
  mat.userData.base = color;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = false;
  return m;
}

/** Slightly darker/lighter variants for fake shading without lights. */
function shade(hex: number, amount: number): number {
  const c = new THREE.Color(hex);
  if (amount >= 0) c.lerp(new THREE.Color(0xffffff), amount);
  else c.lerp(new THREE.Color(0x000000), -amount);
  return c.getHex();
}

function buildPig(s: number, color: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const bodyC = color;
  const dark = shade(color, -0.18);
  const light = shade(color, 0.1);
  const snoutC = accent;
  const hoof = shade(accent, -0.3);

  // Slimmer, longer body (less barrel)
  g.add(part(1.05 * s, 0.42 * s, 0.48 * s, bodyC, 0, 0.44 * s, 0));
  g.add(part(0.9 * s, 0.12 * s, 0.4 * s, light, 0, 0.26 * s, 0));

  // Head slightly smaller / higher
  g.add(part(0.36 * s, 0.34 * s, 0.36 * s, bodyC, 0, 0.52 * s, 0.52 * s));
  g.add(part(0.22 * s, 0.16 * s, 0.18 * s, snoutC, 0, 0.46 * s, 0.72 * s));
  g.add(part(0.04 * s, 0.04 * s, 0.03 * s, dark, -0.05 * s, 0.48 * s, 0.82 * s));
  g.add(part(0.04 * s, 0.04 * s, 0.03 * s, dark, 0.05 * s, 0.48 * s, 0.82 * s));
  g.add(part(0.06 * s, 0.06 * s, 0.03 * s, 0x1a1a1a, -0.1 * s, 0.6 * s, 0.68 * s));
  g.add(part(0.06 * s, 0.06 * s, 0.03 * s, 0x1a1a1a, 0.1 * s, 0.6 * s, 0.68 * s));
  g.add(part(0.025 * s, 0.025 * s, 0.02 * s, 0xffffff, -0.09 * s, 0.62 * s, 0.7 * s));
  g.add(part(0.025 * s, 0.025 * s, 0.02 * s, 0xffffff, 0.11 * s, 0.62 * s, 0.7 * s));
  // Floppy ears
  g.add(part(0.12 * s, 0.1 * s, 0.05 * s, dark, -0.18 * s, 0.7 * s, 0.42 * s));
  g.add(part(0.12 * s, 0.1 * s, 0.05 * s, dark, 0.18 * s, 0.7 * s, 0.42 * s));
  // Longer legs
  for (const [lx, lz] of [[-0.22, 0.16], [0.22, 0.16], [-0.22, -0.18], [0.22, -0.18]] as const) {
    g.add(part(0.12 * s, 0.36 * s, 0.12 * s, bodyC, lx * s, 0.18 * s, lz * s));
    g.add(part(0.12 * s, 0.06 * s, 0.12 * s, hoof, lx * s, 0.03 * s, lz * s));
  }
  g.add(part(0.06 * s, 0.06 * s, 0.14 * s, accent, 0, 0.48 * s, -0.4 * s));
  return g;
}

function buildCow(s: number, color: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const bodyC = color;
  const dark = shade(color, -0.2);
  const light = shade(color, 0.15);
  const cream = accent;
  const hoof = 0x2a2018;
  const pink = 0xe8a0a8;

  // Body
  g.add(part(1.15 * s, 0.7 * s, 0.65 * s, bodyC, 0, 0.7 * s, 0));
  g.add(part(0.7 * s, 0.25 * s, 0.5 * s, dark, 0, 0.42 * s, 0)); // underside
  // White patches
  g.add(part(0.35 * s, 0.4 * s, 0.04 * s, cream, 0.4 * s, 0.75 * s, 0.1 * s));
  g.add(part(0.28 * s, 0.28 * s, 0.04 * s, cream, -0.35 * s, 0.8 * s, -0.15 * s));
  g.add(part(0.3 * s, 0.22 * s, 0.04 * s, cream, 0.15 * s, 0.55 * s, -0.32 * s));

  // Head
  g.add(part(0.42 * s, 0.4 * s, 0.48 * s, bodyC, 0, 0.95 * s, 0.55 * s));
  // Snout / muzzle
  g.add(part(0.32 * s, 0.22 * s, 0.2 * s, pink, 0, 0.82 * s, 0.78 * s));
  g.add(part(0.05 * s, 0.04 * s, 0.03 * s, 0x3a2020, -0.07 * s, 0.84 * s, 0.88 * s));
  g.add(part(0.05 * s, 0.04 * s, 0.03 * s, 0x3a2020, 0.07 * s, 0.84 * s, 0.88 * s));
  // Eyes
  g.add(part(0.08 * s, 0.08 * s, 0.04 * s, 0x1a1a1a, -0.14 * s, 1.05 * s, 0.76 * s));
  g.add(part(0.08 * s, 0.08 * s, 0.04 * s, 0x1a1a1a, 0.14 * s, 1.05 * s, 0.76 * s));
  g.add(part(0.03 * s, 0.03 * s, 0.02 * s, 0xffffff, -0.13 * s, 1.07 * s, 0.78 * s));
  g.add(part(0.03 * s, 0.03 * s, 0.02 * s, 0xffffff, 0.15 * s, 1.07 * s, 0.78 * s));
  // Ears
  g.add(part(0.16 * s, 0.1 * s, 0.06 * s, dark, -0.28 * s, 1.1 * s, 0.5 * s));
  g.add(part(0.16 * s, 0.1 * s, 0.06 * s, dark, 0.28 * s, 1.1 * s, 0.5 * s));
  // Horn stubs
  g.add(part(0.06 * s, 0.12 * s, 0.06 * s, cream, -0.16 * s, 1.22 * s, 0.48 * s));
  g.add(part(0.06 * s, 0.12 * s, 0.06 * s, cream, 0.16 * s, 1.22 * s, 0.48 * s));
  // Legs
  for (const [lx, lz] of [[-0.35, 0.22], [0.35, 0.22], [-0.35, -0.24], [0.35, -0.24]] as const) {
    g.add(part(0.18 * s, 0.48 * s, 0.18 * s, bodyC, lx * s, 0.24 * s, lz * s));
    g.add(part(0.18 * s, 0.08 * s, 0.18 * s, hoof, lx * s, 0.04 * s, lz * s));
  }
  // Udder hint
  g.add(part(0.28 * s, 0.12 * s, 0.22 * s, pink, 0, 0.38 * s, -0.05 * s));
  // Tail
  g.add(part(0.06 * s, 0.06 * s, 0.35 * s, dark, 0, 0.85 * s, -0.45 * s));
  g.add(part(0.1 * s, 0.12 * s, 0.1 * s, 0x1a1a1a, 0, 0.78 * s, -0.62 * s));
  return g;
}

function buildChicken(s: number, color: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  const bodyC = color;
  const dark = shade(color, -0.12);
  const comb = 0xe03030;
  const wattle = 0xd02828;
  const beak = accent;
  const legC = 0xf0a020;
  const eye = 0x1a1a1a;

  // Body (round-ish stack)
  g.add(part(0.42 * s, 0.38 * s, 0.5 * s, bodyC, 0, 0.42 * s, 0));
  g.add(part(0.36 * s, 0.12 * s, 0.4 * s, dark, 0, 0.28 * s, 0));
  // Tail feathers
  g.add(part(0.28 * s, 0.22 * s, 0.12 * s, dark, 0, 0.55 * s, -0.28 * s));
  g.add(part(0.12 * s, 0.18 * s, 0.08 * s, bodyC, -0.1 * s, 0.62 * s, -0.32 * s));
  g.add(part(0.12 * s, 0.18 * s, 0.08 * s, bodyC, 0.1 * s, 0.62 * s, -0.32 * s));
  // Wings
  g.add(part(0.08 * s, 0.22 * s, 0.32 * s, dark, -0.26 * s, 0.45 * s, 0));
  g.add(part(0.08 * s, 0.22 * s, 0.32 * s, dark, 0.26 * s, 0.45 * s, 0));
  // Head
  g.add(part(0.3 * s, 0.3 * s, 0.3 * s, bodyC, 0, 0.72 * s, 0.22 * s));
  // Comb
  g.add(part(0.06 * s, 0.14 * s, 0.18 * s, comb, 0, 0.92 * s, 0.22 * s));
  g.add(part(0.05 * s, 0.1 * s, 0.08 * s, comb, 0, 0.95 * s, 0.32 * s));
  // Beak
  g.add(part(0.12 * s, 0.08 * s, 0.14 * s, beak, 0, 0.68 * s, 0.4 * s));
  // Wattle
  g.add(part(0.06 * s, 0.1 * s, 0.06 * s, wattle, 0, 0.58 * s, 0.36 * s));
  // Eyes
  g.add(part(0.06 * s, 0.06 * s, 0.03 * s, eye, -0.1 * s, 0.78 * s, 0.36 * s));
  g.add(part(0.06 * s, 0.06 * s, 0.03 * s, eye, 0.1 * s, 0.78 * s, 0.36 * s));
  g.add(part(0.025 * s, 0.025 * s, 0.02 * s, 0xffffff, -0.09 * s, 0.79 * s, 0.37 * s));
  g.add(part(0.025 * s, 0.025 * s, 0.02 * s, 0xffffff, 0.11 * s, 0.79 * s, 0.37 * s));
  // Legs + feet
  for (const lx of [-0.1, 0.1]) {
    g.add(part(0.05 * s, 0.28 * s, 0.05 * s, legC, lx * s, 0.14 * s, 0));
    g.add(part(0.14 * s, 0.04 * s, 0.1 * s, legC, lx * s, 0.02 * s, 0.04 * s));
  }
  return g;
}

function buildMobMesh(kind: MobKind): THREE.Group {
  const k = KIND[kind];
  const s = k.scale;
  if (kind === "zombie") return buildZombie(s);
  if (kind === "skeleton") return buildSkeleton(s);
  if (kind === "spider") return buildSpider();
  if (kind === "pig") return buildPig(s, k.color, k.accent);
  if (kind === "cow") return buildCow(s, k.color, k.accent);
  return buildChicken(s, k.color, k.accent);
}

export function createMob(kind: MobKind, x: number, y: number, z: number): Mob {
  const def = KIND[kind];
  const group = buildMobMesh(kind);
  group.position.set(x, y, z);
  return {
    id: nextId++,
    kind,
    pos: { x, y, z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: Math.random() * Math.PI * 2,
    hp: def.hp,
    maxHp: def.hp,
    age: 0,
    wanderT: 1 + Math.random() * 3,
    hurtT: 0,
    grounded: false,
    group,
    dead: false,
    cd: 0.8,
    shootT: 1 + Math.random(),
    leapT: 0,
    atkT: 0,
  };
}

export function mobDrop(kind: MobKind): number {
  return KIND[kind].drop;
}

export function mobName(kind: MobKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** Simple wander + gravity AI. Returns true if still alive. */
export function updateMob(m: Mob, world: World, dt: number, playerPos: { x: number; y: number; z: number }, ctx?: MobCtx) {
  if (m.dead) return false;
  if (KIND[m.kind].hostile) return updateMonster(m, world, dt, playerPos, ctx);
  m.age += dt;
  m.hurtT = Math.max(0, m.hurtT - dt);
  m.wanderT -= dt;

  const def = KIND[m.kind];
  const distToPlayer = Math.hypot(m.pos.x - playerPos.x, m.pos.z - playerPos.z);

  // Flee if recently hurt or player is very close while swinging (simple flee).
  if (m.hurtT > 0 || distToPlayer < 2.2) {
    const dx = m.pos.x - playerPos.x;
    const dz = m.pos.z - playerPos.z;
    const len = Math.hypot(dx, dz) || 1;
    m.vel.x = (dx / len) * def.speed * 1.6;
    m.vel.z = (dz / len) * def.speed * 1.6;
    m.yaw = Math.atan2(-m.vel.x, -m.vel.z);
    m.wanderT = 0.8 + Math.random();
  } else if (m.wanderT <= 0) {
    // New wander direction
    m.yaw = Math.random() * Math.PI * 2;
    m.wanderT = 1.5 + Math.random() * 4;
    const spd = def.speed * (0.4 + Math.random() * 0.6);
    m.vel.x = -Math.sin(m.yaw) * spd;
    m.vel.z = -Math.cos(m.yaw) * spd;
  }

  // Gravity
  m.vel.y -= 28 * dt;
  m.vel.y = Math.max(-30, m.vel.y);

  // Slightly smaller collision box than the player
  const hw = 0.28 * def.scale;
  const h = 0.9 * def.scale;
  m.grounded = moveBody(world, m.pos, m.vel, dt, hw, h);

  // Keep them from falling forever
  if (m.pos.y < -50) {
    m.dead = true;
    return false;
  }

  // Sync mesh
  m.group.position.set(m.pos.x, m.pos.y, m.pos.z);
  m.group.rotation.y = m.yaw;
  // Bob / walk animation
  const moving = m.grounded && Math.hypot(m.vel.x, m.vel.z) > 0.25;
  if (moving) {
    m.group.position.y += Math.abs(Math.sin(m.age * 12)) * 0.04;
    m.group.rotation.z = Math.sin(m.age * 12) * 0.04;
  } else {
    m.group.rotation.z *= 0.8;
  }
  // Flash red when hurt (MeshBasicMaterial — no lights in this scene).
  m.group.traverse((c) => {
    if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
      const base = (c.material.userData.base as number) ?? 0xffffff;
      if (m.hurtT > 0) c.material.color.setHex(0xff6666);
      else c.material.color.setHex(base);
    }
  });

  return true;
}

export function hitMob(m: Mob, dmg: number): boolean {
  if (m.dead) return false;
  m.hp -= dmg;
  m.hurtT = 0.35;
  if (m.hp <= 0) {
    m.dead = true;
    return true; // died
  }
  return false;
}

/**
 * Spawn animals near a point. Very dense by default so the world feels populated.
 * Forces chunks under each candidate so solid() works even at the edge of the stream.
 */
export function spawnHerd(world: World, origin: { x: number; y: number; z: number }, count = 6): Mob[] {
  // Round-robin so small herds still get cows + chickens, not only pigs.
  const kinds: MobKind[] = ["cow", "chicken", "pig", "cow", "chicken", "pig"];
  const out: Mob[] = [];
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length]!;
    let placed = false;
    for (let tryN = 0; tryN < 40 && !placed; tryN++) {
      const ang = Math.random() * Math.PI * 2;
      // Many close, some a bit further — majority within ~8 blocks.
      const r = tryN < 12
        ? 1.5 + Math.random() * 6
        : 4 + Math.random() * 14;
      const x = origin.x + Math.cos(ang) * r;
      const z = origin.z + Math.sin(ang) * r;
      // Ensure the chunk exists so solid() is real terrain, not AIR.
      world.ensure(Math.floor(x / 16), Math.floor(z / 16));
      // Scan down from well above the player for solid ground.
      let y = Math.max(Math.floor(origin.y) + 12, 40);
      let found = false;
      for (; y > 2; y--) {
        if (world.solid(Math.floor(x), y - 1, Math.floor(z)) && !world.solid(Math.floor(x), y, Math.floor(z))) {
          found = true;
          break;
        }
      }
      if (!found) continue;
      if (overlaps(world, x, y, z, 0.3, 0.9)) continue;
      out.push(createMob(kind, x + (Math.random() - 0.5) * 0.3, y + 0.05, z + (Math.random() - 0.5) * 0.3));
      placed = true;
    }
  }
  return out;
}

/** Top up animals around the player when the local population is low. */
export function topUpMobs(
  world: World,
  existing: Mob[],
  origin: { x: number; y: number; z: number },
  target = 6,
): Mob[] {
  const nearby = existing.filter((m) => {
    if (m.dead) return false;
    const d = Math.hypot(m.pos.x - origin.x, m.pos.z - origin.z);
    return d < 40;
  });
  const need = target - nearby.length;
  if (need <= 0) return [];
  return spawnHerd(world, origin, need);
}

export function disposeMob(m: Mob) {
  m.group.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.geometry.dispose();
      if (Array.isArray(c.material)) c.material.forEach((mat) => mat.dispose());
      else (c.material as THREE.Material).dispose();
    }
  });
}


// ===================================================================================
// Hostile mobs: zombie, skeleton, spider
// ===================================================================================

export interface MobCtx {
  /** Deal damage to the player; the engine applies invulnerability frames and knockback. */
  hurtPlayer: (dmg: number, fromX: number, fromZ: number) => void;
  /** Fire an arrow from a point towards a target point. */
  shoot: (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) => void;
  /** False when monsters are switched off; they stand down and ignore the player. */
  hostileOn: boolean;
}

/** A limb that swings from its top: the pivot sits at the joint, the mesh hangs below it. */
function limb(w: number, h: number, d: number, color: number, px: number, py: number, pz: number, extra?: THREE.Mesh[]) {
  const pivot = new THREE.Group();
  pivot.position.set(px, py, pz);
  const mesh = part(w, h, d, color, 0, -h / 2, 0);
  pivot.add(mesh);
  for (const e of extra ?? []) pivot.add(e);
  return pivot;
}

interface Rig {
  legs?: THREE.Group[];
  arms?: THREE.Group[];
  head?: THREE.Object3D;
  spiderLegs?: { g: THREE.Group; base: number; side: number; i: number }[];
  bow?: THREE.Group;
}

function buildZombie(s: number): THREE.Group {
  const g = new THREE.Group();
  const skin = 0x5f8f4a, skinD = shade(skin, -0.22), skinL = shade(skin, 0.1);
  const shirt = 0x3a6ea5, shirtD = shade(shirt, -0.25);
  const pants = 0x3b3f8c, pantsD = shade(pants, -0.3);
  const rig: Rig = {};

  rig.legs = [
    limb(0.23 * s, 0.72 * s, 0.25 * s, pants, -0.13 * s, 0.72 * s, 0, [part(0.25 * s, 0.1 * s, 0.27 * s, pantsD, 0, -0.67 * s, 0.01)]),
    limb(0.23 * s, 0.72 * s, 0.25 * s, pantsD, 0.13 * s, 0.72 * s, 0, [part(0.25 * s, 0.1 * s, 0.27 * s, pantsD, 0, -0.67 * s, 0.01)]),
  ];
  g.add(...rig.legs);

  // Torn shirt: a lighter band and a ragged hem.
  g.add(part(0.52 * s, 0.74 * s, 0.3 * s, shirt, 0, 1.09 * s, 0));
  g.add(part(0.54 * s, 0.12 * s, 0.32 * s, shirtD, 0, 0.8 * s, 0));
  g.add(part(0.2 * s, 0.14 * s, 0.32 * s, skin, 0.1 * s, 0.98 * s, 0.01)); // rip showing skin
  g.add(part(0.3 * s, 0.06 * s, 0.32 * s, shirtD, -0.08 * s, 1.3 * s, 0));

  // Arms stretched forward: sleeve at the shoulder, bare green forearm.
  const arm = (x: number) => {
    const a = limb(0.2 * s, 0.4 * s, 0.22 * s, shirt, x * s, 1.4 * s, 0, [
      part(0.2 * s, 0.38 * s, 0.22 * s, skin, 0, -0.58 * s, 0),
      part(0.22 * s, 0.1 * s, 0.24 * s, skinD, 0, -0.78 * s, 0),
    ]);
    a.rotation.x = -1.45;
    return a;
  };
  rig.arms = [arm(-0.37), arm(0.37)];
  g.add(...rig.arms);

  // Head with sunken eyes, brow, and a crooked mouth.
  const head = new THREE.Group();
  head.position.set(0, 1.46 * s, 0);
  head.add(part(0.5 * s, 0.5 * s, 0.5 * s, skin, 0, 0.25 * s, 0));
  head.add(part(0.52 * s, 0.08 * s, 0.52 * s, skinL, 0, 0.5 * s, 0)); // hair-less crown
  head.add(part(0.46 * s, 0.07 * s, 0.05 * s, skinD, 0, 0.34 * s, 0.26 * s)); // brow
  head.add(part(0.11 * s, 0.09 * s, 0.04 * s, 0x111111, -0.12 * s, 0.28 * s, 0.26 * s));
  head.add(part(0.11 * s, 0.09 * s, 0.04 * s, 0x111111, 0.12 * s, 0.28 * s, 0.26 * s));
  head.add(part(0.04 * s, 0.04 * s, 0.03 * s, 0xd8e86a, -0.12 * s, 0.28 * s, 0.285 * s));
  head.add(part(0.04 * s, 0.04 * s, 0.03 * s, 0xd8e86a, 0.12 * s, 0.28 * s, 0.285 * s));
  head.add(part(0.22 * s, 0.07 * s, 0.04 * s, 0x2a1a1a, 0.02 * s, 0.1 * s, 0.26 * s));
  head.add(part(0.05 * s, 0.07 * s, 0.04 * s, 0xe8e0c0, -0.04 * s, 0.1 * s, 0.285 * s)); // tooth
  g.add(head);
  rig.head = head;
  g.userData.rig = rig;
  return g;
}

function buildSkeleton(s: number): THREE.Group {
  const g = new THREE.Group();
  const bone = 0xe8e6da, boneD = shade(bone, -0.2), dark = 0x25252a;
  const rig: Rig = {};

  rig.legs = [
    limb(0.12 * s, 0.74 * s, 0.12 * s, bone, -0.12 * s, 0.74 * s, 0, [part(0.16 * s, 0.07 * s, 0.22 * s, boneD, 0, -0.71 * s, 0.04)]),
    limb(0.12 * s, 0.74 * s, 0.12 * s, bone, 0.12 * s, 0.74 * s, 0, [part(0.16 * s, 0.07 * s, 0.22 * s, boneD, 0, -0.71 * s, 0.04)]),
  ];
  g.add(...rig.legs);
  g.add(part(0.36 * s, 0.1 * s, 0.18 * s, boneD, 0, 0.78 * s, 0)); // pelvis
  g.add(part(0.09 * s, 0.62 * s, 0.09 * s, boneD, 0, 1.1 * s, -0.02)); // spine
  // Ribs with dark gaps behind them.
  g.add(part(0.4 * s, 0.5 * s, 0.14 * s, dark, 0, 1.18 * s, 0.0));
  for (let i = 0; i < 4; i++) g.add(part(0.44 * s, 0.06 * s, 0.2 * s, bone, 0, (1.0 + i * 0.12) * s, 0.01));
  g.add(part(0.46 * s, 0.07 * s, 0.18 * s, boneD, 0, 1.43 * s, 0)); // collar

  const arm = (x: number) => limb(0.1 * s, 0.72 * s, 0.1 * s, bone, x * s, 1.4 * s, 0, [part(0.12 * s, 0.1 * s, 0.12 * s, boneD, 0, -0.7 * s, 0)]);
  const armL = arm(-0.3);
  const armR = arm(0.3);
  // Bow held in the right hand, string towards the body.
  const bow = new THREE.Group();
  bow.position.set(0, -0.62 * s, 0.1 * s);
  const wood = 0x6b4a2b;
  bow.add(part(0.05 * s, 0.38 * s, 0.05 * s, wood, 0, 0, 0));
  bow.add(part(0.05 * s, 0.26 * s, 0.05 * s, wood, 0, 0.3 * s, -0.07 * s));
  bow.add(part(0.05 * s, 0.26 * s, 0.05 * s, wood, 0, -0.3 * s, -0.07 * s));
  bow.add(part(0.015 * s, 0.82 * s, 0.015 * s, 0xdddddd, 0, 0, -0.12 * s));
  armR.add(bow);
  rig.bow = bow;
  rig.arms = [armL, armR];
  g.add(armL, armR);
  armR.rotation.x = -0.35;

  const head = new THREE.Group();
  head.position.set(0, 1.46 * s, 0);
  head.add(part(0.46 * s, 0.46 * s, 0.46 * s, bone, 0, 0.23 * s, 0));
  head.add(part(0.48 * s, 0.06 * s, 0.48 * s, boneD, 0, 0.44 * s, 0));
  head.add(part(0.12 * s, 0.12 * s, 0.05 * s, dark, -0.11 * s, 0.28 * s, 0.235 * s));
  head.add(part(0.12 * s, 0.12 * s, 0.05 * s, dark, 0.11 * s, 0.28 * s, 0.235 * s));
  head.add(part(0.04 * s, 0.04 * s, 0.03 * s, 0xb02020, -0.11 * s, 0.28 * s, 0.26 * s));
  head.add(part(0.04 * s, 0.04 * s, 0.03 * s, 0xb02020, 0.11 * s, 0.28 * s, 0.26 * s));
  head.add(part(0.06 * s, 0.07 * s, 0.05 * s, dark, 0, 0.18 * s, 0.235 * s)); // nose
  head.add(part(0.26 * s, 0.05 * s, 0.05 * s, dark, 0, 0.08 * s, 0.235 * s)); // teeth line
  for (let i = -2; i <= 2; i++) head.add(part(0.02 * s, 0.06 * s, 0.05 * s, bone, i * 0.05 * s, 0.08 * s, 0.24 * s));
  g.add(head);
  rig.head = head;
  g.userData.rig = rig;
  return g;
}

function buildSpider(): THREE.Group {
  const g = new THREE.Group();
  const body = 0x2a2024, bodyL = shade(body, 0.12), mark = 0x7a2b2b, legC = 0x1d171a;
  const rig: Rig = { spiderLegs: [] };

  g.add(part(0.8, 0.52, 0.95, body, 0, 0.52, -0.58)); // abdomen
  g.add(part(0.3, 0.06, 0.55, mark, 0, 0.8, -0.58)); // stripe
  g.add(part(0.16, 0.06, 0.18, mark, 0, 0.8, -0.2));
  g.add(part(0.84, 0.1, 0.5, bodyL, 0, 0.3, -0.58)); // underside highlight
  g.add(part(0.5, 0.4, 0.5, shade(body, 0.05), 0, 0.5, 0.1)); // thorax
  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.5);
  head.add(part(0.44, 0.38, 0.4, body, 0, 0, 0));
  head.add(part(0.1, 0.1, 0.04, 0xe02020, -0.1, 0.07, 0.21));
  head.add(part(0.1, 0.1, 0.04, 0xe02020, 0.1, 0.07, 0.21));
  for (const [x, y] of [[-0.17, 0.1], [0.17, 0.1], [-0.05, 0.14], [0.05, 0.14]] as const) head.add(part(0.05, 0.05, 0.03, 0xa01818, x, y, 0.21));
  head.add(part(0.06, 0.16, 0.06, 0xd8d0c0, -0.09, -0.2, 0.18)); // fangs
  head.add(part(0.06, 0.16, 0.06, 0xd8d0c0, 0.09, -0.2, 0.18));
  g.add(head);
  rig.head = head;

  const fan = [-0.55, -0.2, 0.2, 0.55];
  for (const side of [-1, 1]) {
    fan.forEach((a, i) => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.22, 0.52, 0.2 - i * 0.22);
      const upper = part(0.7, 0.09, 0.09, legC, side * 0.34, 0.07, 0);
      upper.rotation.z = side * 0.4;
      const lower = part(0.09, 0.62, 0.09, legC, side * 0.7, -0.2, 0);
      lower.rotation.z = side * 0.16;
      leg.add(upper, lower);
      const base = side > 0 ? a : -a;
      leg.rotation.y = base;
      g.add(leg);
      rig.spiderLegs!.push({ g: leg, base, side, i });
    });
  }
  g.userData.rig = rig;
  return g;
}

function flash(m: Mob) {
  m.group.traverse((c) => {
    if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial) {
      const base = (c.material.userData.base as number) ?? 0xffffff;
      c.material.color.setHex(m.hurtT > 0 ? 0xff6666 : base);
    }
  });
}

function updateMonster(m: Mob, world: World, dt: number, player: { x: number; y: number; z: number }, ctx?: MobCtx) {
  const def = KIND[m.kind];
  const hw = def.hw ?? 0.3;
  const h = def.h ?? 1.8;
  m.age += dt;
  m.hurtT = Math.max(0, m.hurtT - dt);
  m.cd = (m.cd ?? 0) - dt;
  m.shootT = (m.shootT ?? 0) - dt;
  m.leapT = (m.leapT ?? 0) - dt;
  m.atkT = Math.max(0, (m.atkT ?? 0) - dt);
  m.wanderT -= dt;

  const dx = player.x - m.pos.x, dz = player.z - m.pos.z, dy = player.y - m.pos.y;
  const dist = Math.hypot(dx, dz) || 0.001;
  const ux = dx / dist, uz = dz / dist;
  const active = !!ctx?.hostileOn && dist < (def.sight ?? 20) && Math.abs(dy) < 10;
  let tx = 0, tz = 0;
  const sp = def.speed;

  if (active) {
    m.yaw = Math.atan2(-dx, -dz);
    if (m.kind === "zombie") {
      if (dist > 1.0) { tx = ux * sp; tz = uz * sp; }
      if (dist < 1.35 && Math.abs(dy) < 1.7 && m.cd! <= 0) {
        m.cd = 1.0;
        m.atkT = 0.35;
        ctx!.hurtPlayer(3, m.pos.x, m.pos.z);
      }
    } else if (m.kind === "spider") {
      if (dist > 0.9) { tx = ux * sp; tz = uz * sp; }
      if (dist < 4 && dist > 1.6 && m.grounded && m.leapT! <= 0) {
        m.leapT = 1.6;
        m.vel.y = 6.5;
        m.vel.x = ux * 8;
        m.vel.z = uz * 8;
      }
      if (dist < 1.25 && Math.abs(dy) < 1.2 && m.cd! <= 0) {
        m.cd = 0.8;
        m.atkT = 0.25;
        ctx!.hurtPlayer(2, m.pos.x, m.pos.z);
      }
    } else {
      // Skeleton: hold a distance, strafe, and shoot.
      if (dist < 6) { tx = -ux * sp; tz = -uz * sp; }
      else if (dist > 11) { tx = ux * sp; tz = uz * sp; }
      else {
        const side = Math.sin(m.age * 0.7) > 0 ? 1 : -1;
        tx = -uz * side * sp * 0.5;
        tz = ux * side * sp * 0.5;
      }
      if (dist < 18 && m.shootT! <= 0) {
        m.shootT = 1.6 + Math.random() * 0.8;
        m.atkT = 0.4;
        ctx!.shoot(
          { x: m.pos.x, y: m.pos.y + 1.45, z: m.pos.z },
          { x: player.x + (Math.random() - 0.5) * 0.9, y: player.y + 1.1, z: player.z + (Math.random() - 0.5) * 0.9 },
        );
      }
    }
  } else if (m.wanderT <= 0) {
    // Idle: shuffle about slowly.
    m.wanderT = 1.5 + Math.random() * 3;
    if (Math.random() < 0.6) {
      m.yaw = Math.random() * Math.PI * 2;
      tx = -Math.sin(m.yaw) * sp * 0.35;
      tz = -Math.cos(m.yaw) * sp * 0.35;
    }
    m.vel.x = tx; m.vel.z = tz;
  }

  // Steer: smooth on the ground so knockback and leaps carry through the air.
  if (active || m.grounded) {
    const k = Math.min(1, dt * (m.grounded ? 9 : 2));
    m.vel.x += (tx - m.vel.x) * k;
    m.vel.z += (tz - m.vel.z) * k;
  }

  // Float in water, otherwise fall.
  const inWater = world.get(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.3), Math.floor(m.pos.z)) === WATER;
  if (inWater) m.vel.y = Math.min(2.5, m.vel.y + 30 * dt);
  else m.vel.y = Math.max(-30, m.vel.y - 28 * dt);

  // Hop up single-block steps while chasing.
  const spd = Math.hypot(tx, tz);
  if (m.grounded && spd > 0.3) {
    const fx = Math.floor(m.pos.x + (tx / spd) * (hw + 0.3));
    const fz = Math.floor(m.pos.z + (tz / spd) * (hw + 0.3));
    const fy = Math.floor(m.pos.y + 0.1);
    if (world.solid(fx, fy, fz) && !world.solid(fx, fy + 1, fz) && !world.solid(fx, fy + 2, fz)) m.vel.y = 8.2;
  }

  m.grounded = moveBody(world, m.pos, m.vel, dt, hw, h);
  if (m.pos.y < -50) { m.dead = true; return false; }

  m.group.position.set(m.pos.x, m.pos.y, m.pos.z);
  // Hostile models are built facing +z, and yaw points along the direction of travel (-sin, -cos).
  m.group.rotation.y = m.yaw + Math.PI;

  // Animation.
  const rig = m.group.userData.rig as Rig;
  const moveAmt = Math.min(1, Math.hypot(m.vel.x, m.vel.z) / 2.2) * (m.grounded ? 1 : 0.3);
  const swing = Math.sin(m.age * (m.kind === "spider" ? 16 : 9)) * moveAmt;
  const atk = (m.atkT ?? 0) > 0 ? Math.sin(((m.atkT ?? 0) / 0.35) * Math.PI) : 0;
  if (m.kind === "zombie" && rig.legs && rig.arms) {
    rig.legs[0]!.rotation.x = swing * 0.8;
    rig.legs[1]!.rotation.x = -swing * 0.8;
    const sway = Math.sin(m.age * 2.2) * 0.07;
    rig.arms[0]!.rotation.x = -1.45 + sway - atk * 0.7;
    rig.arms[1]!.rotation.x = -1.45 - sway - atk * 0.7;
    rig.arms[0]!.rotation.z = 0.06;
    rig.arms[1]!.rotation.z = -0.06;
    if (rig.head) rig.head.rotation.x = 0.12 + Math.sin(m.age * 1.4) * 0.03;
  } else if (m.kind === "skeleton" && rig.legs && rig.arms) {
    rig.legs[0]!.rotation.x = swing * 0.8;
    rig.legs[1]!.rotation.x = -swing * 0.8;
    rig.arms[0]!.rotation.x = -swing * 0.5;
    // Raise the bow while it has a target; pull back when about to shoot.
    const aiming = active ? -1.35 : -0.35;
    rig.arms[1]!.rotation.x += (aiming - rig.arms[1]!.rotation.x) * Math.min(1, dt * 8);
    rig.arms[1]!.rotation.y = active ? -0.1 + atk * 0.05 : 0;
  } else if (m.kind === "spider" && rig.spiderLegs) {
    for (const l of rig.spiderLegs) {
      const phase = (l.i % 2 === 0 ? 0 : Math.PI) + (l.side > 0 ? 0 : Math.PI * 0.5);
      l.g.rotation.y = l.base + Math.sin(m.age * 16 + phase) * 0.35 * moveAmt;
      l.g.rotation.z = Math.max(0, Math.sin(m.age * 16 + phase + Math.PI / 2)) * 0.18 * moveAmt * l.side;
    }
    if (rig.head) rig.head.rotation.x = Math.sin(m.age * 3) * 0.03;
  }
  flash(m);
  return true;
}

/** Spawn monsters out of sight: on the surface at night, or in dark caves. */
export function spawnMonsters(
  world: World,
  origin: { x: number; y: number; z: number },
  count: number,
  where: "surface" | "cave",
): Mob[] {
  const kinds: MobKind[] = ["zombie", "zombie", "skeleton", "spider", "zombie", "skeleton", "spider"];
  const out: Mob[] = [];
  for (let i = 0; i < count; i++) {
    for (let tryN = 0; tryN < 30; tryN++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * 14;
      const x = Math.floor(origin.x + Math.cos(ang) * r);
      const z = Math.floor(origin.z + Math.sin(ang) * r);
      world.ensure(Math.floor(x / 16), Math.floor(z / 16));
      let y = where === "cave" ? Math.floor(origin.y) + 8 : Math.max(Math.floor(origin.y) + 12, 40);
      const floor = where === "cave" ? Math.max(2, Math.floor(origin.y) - 12) : 2;
      let found = false;
      for (; y > floor; y--) {
        if (world.solid(x, y - 1, z) && !world.solid(x, y, z) && !world.solid(x, y + 1, z)) { found = true; break; }
      }
      if (!found) continue;
      const light = world.exposure(x, y + 1, z);
      if (where === "surface" ? light < 0.99 : light > 0.35) continue;
      const kind = kinds[Math.floor(Math.random() * kinds.length)]!;
      if (overlaps(world, x + 0.5, y + 0.05, z + 0.5, KIND[kind].hw ?? 0.3, KIND[kind].h ?? 1.8)) continue;
      out.push(createMob(kind, x + 0.5, y + 0.05, z + 0.5));
      break;
    }
  }
  return out;
}

// --------------------------------------------------------------------------- arrows

export interface Arrow {
  mesh: THREE.Group;
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  life: number;
  stuck: number;
}

export function createArrow(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): Arrow {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const speed = 17;
  const g = new THREE.Group();
  g.add(part(0.04, 0.04, 0.6, 0xc9b48a, 0, 0, 0));
  g.add(part(0.08, 0.08, 0.1, 0x8a8a90, 0, 0, 0.32));
  g.add(part(0.1, 0.02, 0.1, 0xeeeeee, 0, 0, -0.3));
  g.add(part(0.02, 0.1, 0.1, 0xeeeeee, 0, 0, -0.3));
  const a: Arrow = {
    mesh: g,
    pos: { ...from },
    // A little extra lift to cover gravity over the flight.
    vel: { x: (dx / d) * speed, y: (dy / d) * speed + d * 0.22, z: (dz / d) * speed },
    life: 4,
    stuck: 0,
  };
  g.position.set(from.x, from.y, from.z);
  return a;
}

/** Moves arrows; returns false for ones that should be removed. */
export function updateArrow(
  a: Arrow,
  world: World,
  dt: number,
  player: { x: number; y: number; z: number },
  onHitPlayer: (fromX: number, fromZ: number) => void,
): boolean {
  a.life -= dt;
  if (a.life <= 0) return false;
  if (a.stuck > 0) {
    a.stuck -= dt;
    return a.stuck > 0;
  }
  a.vel.y -= 9 * dt;
  const steps = 3;
  for (let i = 0; i < steps; i++) {
    a.pos.x += (a.vel.x * dt) / steps;
    a.pos.y += (a.vel.y * dt) / steps;
    a.pos.z += (a.vel.z * dt) / steps;
    if (world.solid(Math.floor(a.pos.x), Math.floor(a.pos.y), Math.floor(a.pos.z))) {
      a.stuck = 1.2;
      break;
    }
    if (Math.abs(a.pos.x - player.x) < 0.4 && Math.abs(a.pos.z - player.z) < 0.4 && a.pos.y > player.y && a.pos.y < player.y + 1.8) {
      onHitPlayer(a.pos.x - a.vel.x, a.pos.z - a.vel.z);
      return false;
    }
  }
  a.mesh.position.set(a.pos.x, a.pos.y, a.pos.z);
  if (a.stuck <= 0) a.mesh.lookAt(a.pos.x + a.vel.x, a.pos.y + a.vel.y, a.pos.z + a.vel.z);
  return true;
}

export function disposeArrow(a: Arrow) {
  a.mesh.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.geometry.dispose();
      (c.material as THREE.Material).dispose();
    }
  });
}
