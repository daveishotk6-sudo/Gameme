import * as THREE from "three";
import { WH } from "./world";

const DAY_SKY = new THREE.Color(0x87b7e8);
const NIGHT_SKY = new THREE.Color(0x070b1e);
const DUSK = new THREE.Color(0xf0975f);
const tmp = new THREE.Color();

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function disc(color: string, glow: string, inner = 0.42) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, glow);
  gr.addColorStop(inner, glow);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = color;
  const s = 64 * inner;
  g.fillRect(32 - s / 2, 32 - s / 2, s, s);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

const CLOUD_VERT = /* glsl */ `
varying vec2 vUv; varying vec2 vWorld;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const CLOUD_FRAG = /* glsl */ `
uniform sampler2D map; uniform vec2 uCam; uniform float uShade; uniform vec2 uScroll;
varying vec2 vUv; varying vec2 vWorld;
void main(){
  float a = texture2D(map, vUv + uScroll).a;
  float fade = 1.0 - smoothstep(180.0, 320.0, distance(vWorld, uCam));
  vec3 c = vec3(uShade);
  gl_FragColor = vec4(c, a * 0.85 * fade);
  #include <colorspace_fragment>
}`;

export interface SkyState {
  day: number; // 0 night .. 1 day
  color: THREE.Color;
}

export class Sky {
  group = new THREE.Group();
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private stars: THREE.Points;
  private clouds: THREE.Mesh;
  private cloudMat: THREE.ShaderMaterial;
  private state: SkyState = { day: 1, color: new THREE.Color() };

  constructor(scene: THREE.Scene) {
    const mk = (tex: THREE.Texture, size: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }),
      );
      m.renderOrder = -10;
      this.group.add(m);
      return m;
    };
    this.sun = mk(disc("#fff3b0", "rgba(255,220,120,0.35)"), 90);
    this.moon = mk(disc("#dfe6f2", "rgba(180,200,255,0.18)", 0.34), 60);

    const n = 420;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      p[i * 3] = Math.cos(a) * r * 300;
      p[i * 3 + 1] = u * 300;
      p[i * 3 + 2] = Math.sin(a) * r * 300;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(p, 3));
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }),
    );
    this.stars.renderOrder = -11;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    const cv = document.createElement("canvas");
    cv.width = cv.height = 32;
    const cg = cv.getContext("2d")!;
    const img = cg.createImageData(32, 32);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const v =
          Math.sin(x * 0.55 + Math.sin(y * 0.4) * 1.6) + Math.sin(y * 0.5 + Math.cos(x * 0.33) * 2.1) + Math.sin((x + y) * 0.27);
        img.data[(y * 32 + x) * 4 + 3] = v > 1.15 ? 255 : 0;
      }
    }
    cg.putImageData(img, 0, 0);
    const ct = new THREE.CanvasTexture(cv);
    ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
    ct.magFilter = THREE.NearestFilter;
    ct.minFilter = THREE.NearestFilter;
    ct.repeat.set(3, 3);
    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: { map: { value: ct }, uCam: { value: new THREE.Vector2() }, uShade: { value: 1 }, uScroll: { value: new THREE.Vector2() } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(768, 768), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = -5;
    scene.add(this.clouds);
    scene.add(this.group);
  }

  /** t is time of day: 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight. */
  update(t: number, cam: THREE.Vector3, time: number): SkyState {
    const ang = t * Math.PI * 2;
    const elev = Math.sin(ang);
    const day = smooth(-0.14, 0.22, elev);
    const dir = new THREE.Vector3(Math.cos(ang), elev, 0.25).normalize();

    this.group.position.copy(cam);
    this.sun.position.copy(dir).multiplyScalar(200);
    this.moon.position.copy(dir).multiplyScalar(-200);
    this.sun.lookAt(cam);
    this.moon.lookAt(cam);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - day * 2.2);
    this.stars.rotation.z = ang;

    const col = this.state.color;
    col.copy(NIGHT_SKY).lerp(DAY_SKY, day);
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.3) * 0.65;
    col.lerp(tmp.copy(DUSK), dusk * (elev > -0.3 ? 1 : 0));
    this.state.day = day;

    this.clouds.position.set(cam.x, WH + 16, cam.z);
    this.cloudMat.uniforms.uCam!.value.set(cam.x, cam.z);
    this.cloudMat.uniforms.uShade!.value = 0.25 + 0.75 * day;
    // 32px texture covers 768/3 blocks -> 8 blocks per pixel; scroll with the wind.
    this.cloudMat.uniforms.uScroll!.value.set(time * 0.0012 + cam.x / 256 / 3 * 0, 0);
    return this.state;
  }
}
