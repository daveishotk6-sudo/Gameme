import * as THREE from "three";

export interface SignData {
  x: number;
  y: number;
  z: number;
  yaw: number;
  text: string;
}

/** About 4.7x the old 4 lines of 16 characters. Long text wraps and shrinks to fit the board. */
export const SIGN_MAX_CHARS = 300;
export const SIGN_MAX_BREAKS = 11;
export const signKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** Normalise line breaks and cap the length; wrapping is done when the board is drawn. */
export function cleanSignText(raw: string) {
  let t = raw.replace(/\r/g, "");
  const parts = t.split("\n");
  if (parts.length > SIGN_MAX_BREAKS + 1) t = parts.slice(0, SIGN_MAX_BREAKS + 1).join("\n");
  return t.slice(0, SIGN_MAX_CHARS).replace(/\s+$/g, "");
}

const BOARD_W = 512;
const BOARD_H = 416;

/** Word-wrap `text` to `maxW` pixels with the current canvas font. Very long words are split. */
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (para === "") { out.push(""); continue; }
    let line = "";
    for (const word of para.split(" ")) {
      let w = word;
      while (g.measureText(w).width > maxW) {
        let n = w.length - 1;
        while (n > 1 && g.measureText(w.slice(0, n)).width > maxW) n--;
        if (line) { out.push(line); line = ""; }
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      const test = line ? `${line} ${w}` : w;
      if (g.measureText(test).width <= maxW) line = test;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

function drawBoard(text: string) {
  const c = document.createElement("canvas");
  c.width = BOARD_W;
  c.height = BOARD_H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b88b52";
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  for (let y = 0; y < BOARD_H; y += 16) {
    g.fillStyle = y % 32 ? "rgba(90,60,28,0.18)" : "rgba(255,230,180,0.10)";
    g.fillRect(0, y, BOARD_W, 8);
  }
  g.strokeStyle = "#6b4a2b";
  g.lineWidth = 14;
  g.strokeRect(7, 7, BOARD_W - 14, BOARD_H - 14);

  // Largest font that lets the whole text fit inside the frame.
  const maxW = BOARD_W - 56;
  const maxH = BOARD_H - 48;
  let size = 44;
  let lines: string[] = [];
  for (; size >= 12; size -= 2) {
    g.font = `bold ${size}px sans-serif`;
    lines = wrap(g, text, maxW);
    if (lines.length * (size + 6) <= maxH) break;
  }
  g.fillStyle = "#24160a";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lh = size + 6;
  const top = BOARD_H / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => g.fillText(l, BOARD_W / 2, top + i * lh));
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
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), post);
  p.position.y = 0.25;
  // BoxGeometry face order: +x -x +y -y +z -z. The readable face is +z.
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.8, 0.08), [edge, edge, edge, edge, front, back]);
  b.position.y = 0.88;
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
