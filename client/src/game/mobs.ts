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
  pig:     { hp: 8,  speed: 2.4, drop: RAW_PORK,    scale: 0.85, color: 0xf0a0a8, accent: 0xe07080 },
  cow:     { hp: 14, speed: 2.0, drop: RAW_BEEF,    scale: 1.15, color: 0x4a3428, accent: 0xf0f0f0 },
  chicken: { hp: 5,  speed: 3.2, drop: RAW_CHICKEN, scale: 0.55, color: 0xf5f0e6, accent: 0xe8a030 },
};

let nextId = 1;

function box(w: number, h: number, d: number, color: number, y = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.position.y = y;
  m.castShadow = false;
  return m;
}

function buildMobMesh(kind: MobKind): THREE.Group {
  const g = new THREE.Group();
  const k = KIND[kind];
  const s = k.scale;

  if (kind === "pig") {
    const body = box(0.9 * s, 0.55 * s, 0.55 * s, k.color, 0.45 * s);
    const head = box(0.4 * s, 0.35 * s, 0.35 * s, k.color, 0.5 * s);
    head.position.z = 0.4 * s;
    const snout = box(0.22 * s, 0.16 * s, 0.18 * s, k.accent, 0.45 * s);
    snout.position.z = 0.58 * s;
    const leg = (x: number, z: number) => {
      const l = box(0.16 * s, 0.35 * s, 0.16 * s, k.accent, 0.18 * s);
      l.position.set(x * s, 0, z * s);
      return l;
    };
    g.add(body, head, snout, leg(0.28, 0.18), leg(-0.28, 0.18), leg(0.28, -0.18), leg(-0.28, -0.18));
  } else if (kind === "cow") {
    const body = box(1.1 * s, 0.7 * s, 0.55 * s, k.color, 0.65 * s);
    const head = box(0.4 * s, 0.4 * s, 0.4 * s, k.color, 0.85 * s);
    head.position.z = 0.5 * s;
    const spot = box(0.35 * s, 0.35 * s, 0.02 * s, k.accent, 0.75 * s);
    spot.position.set(0.3 * s, 0, 0);
    const leg = (x: number, z: number) => {
      const l = box(0.18 * s, 0.5 * s, 0.18 * s, 0x2a2018, 0.25 * s);
      l.position.set(x * s, 0, z * s);
      return l;
    };
    g.add(body, head, spot, leg(0.35, 0.2), leg(-0.35, 0.2), leg(0.35, -0.2), leg(-0.35, -0.2));
  } else {
    // chicken
    const body = box(0.4 * s, 0.35 * s, 0.45 * s, k.color, 0.4 * s);
    const head = box(0.28 * s, 0.28 * s, 0.28 * s, k.color, 0.65 * s);
    head.position.z = 0.22 * s;
    const beak = box(0.12 * s, 0.08 * s, 0.14 * s, k.accent, 0.6 * s);
    beak.position.z = 0.4 * s;
    const comb = box(0.08 * s, 0.12 * s, 0.16 * s, 0xd03030, 0.82 * s);
    comb.position.z = 0.18 * s;
    const leg = (x: number) => {
      const l = box(0.06 * s, 0.28 * s, 0.06 * s, k.accent, 0.14 * s);
      l.position.set(x * s, 0, 0);
      return l;
    };
    g.add(body, head, beak, comb, leg(0.1), leg(-0.1));
  }

  g.userData.kind = kind;
  return g;
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
  if (m.grounded && Math.hypot(m.vel.x, m.vel.z) > 0.3) {
    m.group.position.y += Math.sin(m.age * 10) * 0.03;
  }
  // Flash when hurt
  m.group.traverse((c) => {
    if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshLambertMaterial) {
      c.material.emissive?.setHex(m.hurtT > 0 ? 0x880000 : 0x000000);
      if (!c.material.emissive) c.material.color.setHex(m.hurtT > 0 ? 0xffaaaa : (c.userData.baseColor ?? c.material.color.getHex()));
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

/** Spawn a small herd near a point on solid ground. */
export function spawnHerd(world: World, origin: { x: number; y: number; z: number }, count = 8): Mob[] {
  const kinds: MobKind[] = ["pig", "pig", "cow", "cow", "chicken", "chicken", "chicken", "pig"];
  const out: Mob[] = [];
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length]!;
    let placed = false;
    for (let tryN = 0; tryN < 20 && !placed; tryN++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 18;
      const x = origin.x + Math.cos(ang) * r;
      const z = origin.z + Math.sin(ang) * r;
      // Find ground
      let y = Math.floor(origin.y) + 8;
      while (y > 0 && !world.solid(Math.floor(x), y - 1, Math.floor(z))) y--;
      if (y <= 1) continue;
      if (overlaps(world, x, y, z, 0.3, 0.9)) continue;
      out.push(createMob(kind, x, y + 0.05, z));
      placed = true;
    }
  }
  return out;
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
