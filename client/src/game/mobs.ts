import * as THREE from "three";
import { World, HALF_W, HEIGHT, moveBody, overlaps } from "./world";
import { RAW_PORK, RAW_BEEF, RAW_CHICKEN, itemInfo } from "./blocks";

export type MobKind = "pig" | "cow" | "chicken";

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
}

const KIND: Record<MobKind, { hp: number; speed: number; drop: number; scale: number; color: number; accent: number }> = {
  pig:     { hp: 8,  speed: 2.4, drop: RAW_PORK,    scale: 0.85, color: 0xffb6c1, accent: 0xff7a8a },
  cow:     { hp: 14, speed: 2.0, drop: RAW_BEEF,    scale: 1.15, color: 0x6b4a36, accent: 0xf5f5f5 },
  chicken: { hp: 5,  speed: 3.2, drop: RAW_CHICKEN, scale: 0.55, color: 0xfff8e7, accent: 0xffb020 },
};

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
  const light = shade(color, 0.12);
  const snoutC = accent;
  const hoof = shade(accent, -0.25);

  // Torso + belly
  g.add(part(0.95 * s, 0.52 * s, 0.62 * s, bodyC, 0, 0.48 * s, 0));
  g.add(part(0.82 * s, 0.18 * s, 0.5 * s, light, 0, 0.28 * s, 0)); // belly

  // Head
  g.add(part(0.42 * s, 0.4 * s, 0.42 * s, bodyC, 0, 0.58 * s, 0.48 * s));
  // Snout
  g.add(part(0.26 * s, 0.2 * s, 0.22 * s, snoutC, 0, 0.5 * s, 0.7 * s));
  // Nostrils
  g.add(part(0.05 * s, 0.05 * s, 0.04 * s, dark, -0.06 * s, 0.52 * s, 0.82 * s));
  g.add(part(0.05 * s, 0.05 * s, 0.04 * s, dark, 0.06 * s, 0.52 * s, 0.82 * s));
  // Eyes
  g.add(part(0.07 * s, 0.07 * s, 0.04 * s, 0x1a1a1a, -0.12 * s, 0.68 * s, 0.68 * s));
  g.add(part(0.07 * s, 0.07 * s, 0.04 * s, 0x1a1a1a, 0.12 * s, 0.68 * s, 0.68 * s));
  g.add(part(0.03 * s, 0.03 * s, 0.02 * s, 0xffffff, -0.11 * s, 0.7 * s, 0.7 * s));
  g.add(part(0.03 * s, 0.03 * s, 0.02 * s, 0xffffff, 0.13 * s, 0.7 * s, 0.7 * s));
  // Ears
  g.add(part(0.14 * s, 0.12 * s, 0.06 * s, dark, -0.2 * s, 0.78 * s, 0.4 * s));
  g.add(part(0.14 * s, 0.12 * s, 0.06 * s, dark, 0.2 * s, 0.78 * s, 0.4 * s));
  // Legs
  for (const [lx, lz] of [[-0.28, 0.2], [0.28, 0.2], [-0.28, -0.22], [0.28, -0.22]] as const) {
    g.add(part(0.16 * s, 0.32 * s, 0.16 * s, bodyC, lx * s, 0.16 * s, lz * s));
    g.add(part(0.16 * s, 0.08 * s, 0.16 * s, hoof, lx * s, 0.04 * s, lz * s));
  }
  // Tiny curly tail stub
  g.add(part(0.08 * s, 0.08 * s, 0.12 * s, accent, 0, 0.55 * s, -0.38 * s));
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
  };
}

export function mobDrop(kind: MobKind): number {
  return KIND[kind].drop;
}

export function mobName(kind: MobKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** Simple wander + gravity AI. Returns true if still alive. */
export function updateMob(m: Mob, world: World, dt: number, playerPos: { x: number; y: number; z: number }) {
  if (m.dead) return false;
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
export function spawnHerd(world: World, origin: { x: number; y: number; z: number }, count = 2): Mob[] {
  const kinds: MobKind[] = [
    "pig", "pig", "pig", "cow", "cow", "cow",
    "chicken", "chicken", "chicken", "chicken", "pig", "chicken",
  ];
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
  target = 2,
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
