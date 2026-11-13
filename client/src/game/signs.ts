import * as THREE from "three";

export interface SignData {
  x: number;
  y: number;
  z: number;
  yaw: number;
  text: string;
}

export const SIGN_LINES = 4;
export const SIGN_COLS = 16;
export const signKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** Trim to four short lines so a sign always fits its board. */
export function cleanSignText(raw: string) {
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .slice(0, SIGN_LINES)
    .map((l) => l.slice(0, SIGN_COLS))
    .join("\n")
    .replace(/\s+$/g, "");
}

function drawBoard(text: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b88b52";
  g.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 128; y += 8) {
    g.fillStyle = y % 16 ? "rgba(90,60,28,0.18)" : "rgba(255,230,180,0.10)";
    g.fillRect(0, y, 256, 4);
  }
  g.strokeStyle = "#6b4a2b";
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 120);
  const lines = text.split("\n");
  let size = 30;
  g.font = `bold ${size}px sans-serif`;
  while (size > 14 && Math.max(...lines.map((l) => g.measureText(l).width)) > 226) {
    size -= 2;
    g.font = `bold ${size}px sans-serif`;
  }
  g.fillStyle = "#24160a";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lh = size + 4;
  const top = 64 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => g.fillText(l, 128, top + i * lh));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface SignObject {
  group: THREE.Group;
  front: THREE.MeshBasicMaterial;
  plain: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[];
  text: string;
}

export function buildSign(s: SignData): SignObject {
  const group = new THREE.Group();
  const post = new THREE.MeshBasicMaterial({ color: 0x6b4a2b });
  const edge = new THREE.MeshBasicMaterial({ color: 0x8a6a3c });
  const back = new THREE.MeshBasicMaterial({ color: 0x9a7544 });
  const front = new THREE.MeshBasicMaterial({ map: drawBoard(s.text) });
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), post);
  p.position.y = 0.275;
  // BoxGeometry face order: +x -x +y -y +z -z. The readable face is +z.
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.5, 0.08), [edge, edge, edge, edge, front, back]);
  b.position.y = 0.78;
  group.add(p, b);
  group.position.set(s.x + 0.5, s.y, s.z + 0.5);
  group.rotation.y = s.yaw;
  return { group, front, plain: [post, edge, back].map((mat) => ({ mat, base: mat.color.clone() })), text: s.text };
}

export function retextSign(o: SignObject, text: string) {
  o.front.map?.dispose();
  o.front.map = drawBoard(text);
  o.front.needsUpdate = true;
  o.text = text;
}

export function disposeSign(o: SignObject) {
  o.group.traverse((m) => {
    const mesh = m as THREE.Mesh;
    mesh.geometry?.dispose();
  });
  o.front.map?.dispose();
  o.front.dispose();
  o.plain.forEach((p) => p.mat.dispose());
}

export function shadeSign(o: SignObject, v: number) {
  o.front.color.setScalar(v);
  // Scale each part's own colour; setting a flat grey here is what turned the frame and back white.
  o.plain.forEach((p) => p.mat.color.copy(p.base).multiplyScalar(v));
}
