import * as THREE from "three";
import { block, itemInfo } from "./blocks";
import type { Look } from "./avatar";

const FACE_SHADE = [0.8, 0.8, 1, 0.55, 0.9, 0.9]; // +x -x +y -y +z -z

function shadedBox(w: number, h: number, d: number, color: number) {
  const base = new THREE.Color(color);
  const mats = FACE_SHADE.map(
    (s) => new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(s), transparent: true, depthTest: false, depthWrite: false }),
  );
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  m.renderOrder = 200;
  return m;
}

function crackTexture() {
  const STAGES = 10;
  const c = document.createElement("canvas");
  c.width = 16 * STAGES;
  c.height = 16;
  const g = c.getContext("2d")!;
  // Deterministic cracks that spread a little further with every stage.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cracks: [number, number][][] = [];
  for (let k = 0; k < 7; k++) {
    let x = 7 + Math.floor(rnd() * 3);
    let y = 7 + Math.floor(rnd() * 3);
    const ang = rnd() * Math.PI * 2;
    const path: [number, number][] = [[x, y]];
    for (let s = 0; s < 14; s++) {
      x += Math.round(Math.cos(ang + (rnd() - 0.5) * 1.5) * 1.2);
      y += Math.round(Math.sin(ang + (rnd() - 0.5) * 1.5) * 1.2);
      if (x < 0 || y < 0 || x > 15 || y > 15) break;
      path.push([x, y]);
    }
    cracks.push(path);
  }
  for (let st = 0; st < STAGES; st++) {
    const reach = Math.ceil(((st + 1) / STAGES) * 14);
    const nCracks = Math.min(cracks.length, 2 + Math.floor(st * 0.55));
    g.fillStyle = `rgba(0,0,0,${0.35 + st * 0.05})`;
    for (let k = 0; k < nCracks; k++) {
      for (const [px, py] of cracks[k]!.slice(0, reach)) g.fillRect(st * 16 + px, py, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.repeat.set(1 / STAGES, 1);
  return t;
}

interface Chip {
  mesh: THREE.Mesh;
  vx: number; vy: number; vz: number;
  life: number;
  max: number;
}

export interface FxState {
  /** Left mouse / Mine button is held and something breakable is targeted. */
  mining: boolean;
  /** 0..1 progress towards breaking the targeted block. */
  progress: number;
  target: { x: number; y: number; z: number } | null;
  /** Horizontal speed, for a gentle walking sway. */
  speed: number;
  /** Hidden while paused, dead, or in the menu. */
  visible: boolean;
}

/**
 * First-person arm, block cracks and flying chips. Everything here is purely visual and is driven by
 * the engine each frame; it never touches the world.
 */
export class MiningFx {
  private arm = new THREE.Group();
  private pivot = new THREE.Group();
  private held = new THREE.Group();
  private heldId = -1;
  private crack: THREE.Mesh;
  private crackTex: THREE.Texture;
  private chips: Chip[] = [];
  private chipGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  private chipMats = new Map<string, THREE.MeshBasicMaterial>();
  private phase = 0;
  private strike = -1; // one-shot swing timer for placing, 0..1
  private weight = 0;
  private walk = 0;

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, look: Look) {
    scene.add(camera); // so the arm can ride on the camera

    const sleeve = shadedBox(0.2, 0.46, 0.2, look.shirt);
    sleeve.position.y = -0.23;
    const hand = shadedBox(0.2, 0.2, 0.2, look.skin);
    hand.position.y = -0.56;
    this.pivot.add(sleeve, hand, this.held);
    this.held.position.set(-0.06, -0.62, -0.17);
    this.held.rotation.set(0.2, 0.7, 0);
    this.arm.add(this.pivot);
    this.arm.position.set(0.42, -0.3, -0.55);
    this.arm.renderOrder = 200;
    camera.add(this.arm);

    this.crackTex = crackTexture();
    this.crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.01, 1.01, 1.01),
      new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    this.crack.visible = false;
    this.crack.renderOrder = 5;
    scene.add(this.crack);
  }

  /** Show the selected block (or tool) in the hand. */
  setHeld(id: number) {
    if (id === this.heldId) return;
    this.heldId = id;
    for (const c of [...this.held.children]) {
      this.held.remove(c);
      const m = c as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material[]).forEach((x) => x.dispose());
    }
    if (id <= 0) return;
    const color = id < 100 ? block(id).color : itemInfo(id).color;
    const cube = shadedBox(0.2, 0.2, 0.2, new THREE.Color(color).getHex());
    if (id >= 100) cube.scale.set(0.35, 1.5, 0.35);
    this.held.add(cube);
  }

  /** A single quick swing, used when placing a block. */
  swingOnce() {
    if (this.strike < 0) this.strike = 0;
  }

  /** Burst of chips from a block, in its colour. */
  burst(x: number, y: number, z: number, id: number, count = 14, power = 2.6) {
    const key = block(id).color;
    let mat = this.chipMats.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(key).multiplyScalar(0.85) });
      this.chipMats.set(key, mat);
    }
    for (let i = 0; i < count; i++) {
      if (this.chips.length > 90) break;
      const m = new THREE.Mesh(this.chipGeo, mat);
      m.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6);
      const s = 0.6 + Math.random() * 0.7;
      m.scale.setScalar(s);
      this.scene.add(m);
      const max = 0.45 + Math.random() * 0.4;
      this.chips.push({
        mesh: m,
        vx: (Math.random() - 0.5) * power,
        vy: Math.random() * power * 1.1 + 0.8,
        vz: (Math.random() - 0.5) * power,
        life: max,
        max,
      });
    }
  }

  update(dt: number, s: FxState) {
    this.arm.visible = s.visible;

    // Arm: loops while mining, otherwise settles back to rest.
    const goal = s.mining ? 1 : 0;
    this.weight += (goal - this.weight) * Math.min(1, dt * 14);
    if (s.mining) this.phase += dt * 2.7;
    else this.phase = 0;
    this.walk += dt * (2 + s.speed * 1.6);
    const sway = Math.min(1, s.speed / 4);

    let swing = 0;
    if (this.strike >= 0) {
      this.strike += dt * 4.2;
      swing = Math.sin(Math.min(1, this.strike) * Math.PI);
      if (this.strike >= 1) this.strike = -1;
    }
    const chop = Math.sin(this.phase * Math.PI * 2);
    const mineAmt = this.weight * (0.5 + 0.5 * chop); // 0..1 along the strike

    // Resting pose points the arm forward and down so the hand sits in the lower right of the view;
    // mining lifts it and brings it back down in a chop.
    this.pivot.rotation.x = 1.05 + mineAmt * 0.85 + swing * 0.7;
    this.pivot.rotation.y = -0.25 - mineAmt * 0.3 - swing * 0.2;
    this.pivot.rotation.z = 0.1 + mineAmt * 0.15;
    this.arm.position.set(
      0.4 - mineAmt * 0.1 + Math.cos(this.walk) * 0.012 * sway,
      -0.3 + mineAmt * 0.06 + Math.abs(Math.sin(this.walk)) * 0.018 * sway,
      -0.5 - mineAmt * 0.08 - swing * 0.06,
    );

    // Cracks over the block being mined.
    if (s.mining && s.target && s.progress > 0.02) {
      const stage = Math.min(9, Math.floor(s.progress * 10));
      this.crackTex.offset.x = stage / 10;
      this.crack.position.set(s.target.x + 0.5, s.target.y + 0.5, s.target.z + 0.5);
      this.crack.visible = true;
    } else this.crack.visible = false;

    // Chips fall and shrink away.
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const c = this.chips[i]!;
      c.life -= dt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.chips.splice(i, 1);
        continue;
      }
      c.vy -= 16 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.rotation.x += dt * 7;
      c.mesh.rotation.y += dt * 5;
      c.mesh.scale.setScalar(Math.max(0.05, c.life / c.max) * 0.9);
    }
  }

  dispose() {
    this.camera.remove(this.arm);
    this.scene.remove(this.crack);
    this.crack.geometry.dispose();
    (this.crack.material as THREE.Material).dispose();
    this.crackTex.dispose();
    for (const c of this.chips) this.scene.remove(c.mesh);
    this.chips = [];
    this.chipGeo.dispose();
    for (const m of this.chipMats.values()) m.dispose();
    this.setHeld(-2);
    this.arm.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      }
    });
  }
}
