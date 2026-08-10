// HORDA 3D v4 — teren 3D + kamera za plecami + meta-progresja (monety/sklep)
import * as THREE from './lib/three.module.js';
import { SPRITEDATA } from './spritedata.js?v=2';
import { icon, ico } from './icons.js?v=1';

// ============================== USTAWIENIA ==============================
const PX2U = 1 / 55;
const WORLD_R = 130;
// kamera: na wąskim/niskim ekranie (telefon poziomo) mocno bliżej postaci
let CAM_DIST = 9.2, CAM_H = 6.4;
function fitCamera() {
  const wys = innerHeight, poziomo = innerWidth > innerHeight;
  if (poziomo && wys <= 560) { CAM_DIST = 4.2; CAM_H = 4.4; camera.fov = 60; }   // telefon poziomo: BLISKO
  else if (wys <= 560) { CAM_DIST = 6.2; CAM_H = 5.4; camera.fov = 58; }
  else if (innerWidth <= 520) { CAM_DIST = 6.8; CAM_H = 5.8; camera.fov = 58; }  // telefon pionowo
  else { CAM_DIST = 8.4; CAM_H = 7.2; camera.fov = 58; }                          // desktop: wyżej
  camera.updateProjectionMatrix();
}
const DIR_ROWS = ['south','south-east','east','north-east','north','north-west','west','south-west'];
let camYaw = 0;                                    // obrót kamery wokół gracza

// ============================== MAPY ==============================
const MAPS = {
  laki:   { nm: 'Łąki', ico: 'laka', ds: 'Otwarty teren, jeziora, mesy do wskakiwania',
            sky: 0x9cc8ec, fog: [80, 190], water: true, indoor: false, price: 0 },
  market: { nm: 'Market', ico: 'market', ds: 'Ciasne alejki, regały, śliska rozlana woda',
            sky: 0xb8bfc7, fog: [34, 95], water: false, indoor: true, price: 0 },
};
let mapKey = 'laki';

// ============================== POSTACIE ==============================
const CHARS = {
  kasia:      { nm: 'Kasia', ds: 'Zbalansowana. Nic Cię nie zaskoczy.',
                char: 'kasia', price: 0, spd: 1, hp: 0, dmg: 1, mag: 1, scale: 1 },
  piotr:      { nm: 'Piotr', ds: '+1 serce, +25% obrażeń, ale wolniejszy',
                char: 'piotr', price: 200, spd: 0.88, hp: 1, dmg: 1.25, mag: 1, scale: 1 },
  rudeusz:    { nm: 'Rudeusz', ds: 'Bardzo szybki i mały, ale kruchy (-1 serce)',
                char: 'rudeusz', price: 300, spd: 1.35, hp: -1, dmg: 0.9, mag: 1.4, scale: 1.05 },
  przyjaciel: { nm: 'Kapturek', ds: 'Ogromny magnes i +2 serca, słabsze ciosy',
                char: 'przyjaciel', price: 400, spd: 0.95, hp: 2, dmg: 0.8, mag: 2.0, scale: 1 },
  wegielek:   { nm: 'Węgielek', ds: 'Mały demon: +45% obrażeń, tylko 3 serca',
                char: 'wegielek', price: 500, spd: 1.1, hp: -2, dmg: 1.45, mag: 1.2, scale: 1.1 },
};
// portret postaci = pierwsza klatka jej arkusza (pixel art zamiast emoji)
const portretCache = new Map();
function portret(charName) {
  if (portretCache.has(charName)) return portretCache.get(charName);
  const def = SPRITEDATA[charName];
  const img = LIB[charName] && LIB[charName].img;
  if (!img) return '';
  const s = def.size;
  const a = def.anims.idle || def.anims.walk || def.anims.run;
  const row = a.rows.south ?? 0;
  // przytnij ciasno do postaci (sprite jest mały w środku ramki) + kwadrat
  const cw = Math.round(s * 0.52), chh = Math.round(s * 0.62);
  const sx = Math.round((s - cw) / 2), sy = Math.round(s * 0.20);
  const c = document.createElement('canvas');
  c.width = cw; c.height = chh;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, sx, row * s + sy, cw, chh, 0, 0, cw, chh);
  const url = c.toDataURL();
  portretCache.set(charName, url);
  return url;
}
let charKey = 'kasia';

// ============================== TEREN (value noise) ==============================
function hash2(ix, iz) {
  let n = ix * 374761393 + iz * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967295;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
// MESY — strome płaskowyże-platformy (wskakujesz, horda wspina się powoli)
function mesaH(x, z) {
  const C = 90;                                  // komórka siatki mes
  const cx = Math.floor(x / C), cz = Math.floor(z / C);
  if (hash2(cx * 3 + 11, cz * 3 + 7) < 0.5) return 0;   // nie każda komórka ma mesę
  const mx = (cx + 0.3 + 0.4 * hash2(cx + 5, cz + 9)) * C;
  const mz = (cz + 0.3 + 0.4 * hash2(cx + 17, cz + 3)) * C;
  const r = 9 + 6 * hash2(cx + 2, cz + 13);
  const d = Math.hypot(x - mx, z - mz);
  if (d > r) return 0;
  const t = 1 - d / r;
  const s = Math.min(1, t / 0.32);               // strome zbocze, płaski wierzch
  return (4 + 3 * hash2(cx + 8, cz + 21)) * s * s * (3 - 2 * s);
}
function terrainH(x, z) {
  if (MAPS[mapKey].indoor) return 1.55;              // market: idealnie płaska podłoga
  const raw = 5.4 * vnoise(x / 40 + 37.7, z / 40 + 11.3)
            + 1.6 * vnoise(x / 14 + 91.1, z / 14 + 55.5) - 1.15;
  const r = Math.hypot(x, z);
  const f = Math.min(1, Math.max(0, (r - 6) / 14));
  return (raw + mesaH(x, z)) * f + 1.55 * (1 - f);   // start płaski, NAD wodą
}
const WATER_Y = 0.75;                            // doliny poniżej = jeziora
const biome = (x, z) => vnoise(x / 62 + 7.7, z / 62 + 3.3);  // 0=las, 1=sucha łąka

// ============================== SCENA ==============================
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
// Rozdzielczość natywna — sprite'y są JUŻ pixel-artem, downsampling by je psuł.
// (PIXEL_SCALE > 1 = eksperymentalna pikselizacja całego 3D; domyślnie wyłączona)
let PIXEL_SCALE = 1;
function applyResolution() {
  if (PIXEL_SCALE <= 1) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    canvas.style.imageRendering = 'auto';
    return;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(Math.ceil(innerWidth / PIXEL_SCALE), Math.ceil(innerHeight / PIXEL_SCALE), false);
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.imageRendering = 'pixelated';
}
applyResolution();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc8ec);
scene.fog = new THREE.Fog(0x9cc8ec, 80, 190);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);

scene.add(new THREE.HemisphereLight(0xd8ecff, 0x3e6b2f, 1.0));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.25);
sun.position.set(45, 70, 25);
scene.add(sun);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  applyResolution();
  fitCamera();
});
addEventListener('orientationchange', () => setTimeout(fitCamera, 250));

// -------- tekstura trawy --------
function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#68a63a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = Math.random() < .5 ? '#639f37' : (Math.random() < .7 ? '#72b241' : '#5b9433');
    g.fillRect(x, y, 2, 2);
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 8 + Math.random() * 16;
    g.fillStyle = 'rgba(60,110,45,0.10)';
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(64, 64);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// -------- siatka terenu (pofalowana, cieniowana światłem) --------
// tafla wody — jedna, podąża za graczem (mapa jest nieskończona)
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(520, 520),
  new THREE.MeshLambertMaterial({ color: 0x3f86c9, transparent: true, opacity: 0.78 })
);
water.rotation.x = -Math.PI / 2;
water.position.y = WATER_Y;
scene.add(water);

const grassTexC = grassTexture();
grassTexC.repeat.set(1, 1);      // skala siedzi w UV chunków

// -------- podłoga marketu (kafle lastryko) --------
function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d5cf'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = Math.random() < .5 ? '#cfccc5' : '#e2dfd9';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = '#b8b5ae'; g.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  g.fillStyle = '#cdbfa3'; g.fillRect(64, 128, 64, 64);   // beżowy akcent
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const floorTexC = floorTexture();

// -------- regał sklepowy (tekstura z "towarem") --------
function shelfTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#8a6440'; g.fillRect(0, 0, 128, 64);          // korpus
  const kolory = ['#d84f4f', '#4f9ed8', '#57b85a', '#e8c33f', '#b06fd8', '#e88b3f'];
  for (let row = 0; row < 3; row++) {
    const y = 4 + row * 20;
    g.fillStyle = '#6e4d2e'; g.fillRect(0, y + 14, 128, 4);    // deska półki
    for (let x = 4; x < 120; x += 10) {                        // produkty
      g.fillStyle = kolory[Math.floor(Math.random() * kolory.length)];
      g.fillRect(x, y + 2 + Math.random() * 3, 7, 10);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let shelfMat = null, coolerMat = null;   // tworzone w boot
const shelfGeo = new THREE.BoxGeometry(1, 1, 1);
const SHELF_H = 2.3;   // za wysoko na 1 skok — trzeba 🦘🦘 albo obejść

// rozlana woda w markecie — ślisko!
function spillTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 6, 32, 32, 31);
  gr.addColorStop(0, 'rgba(150,205,240,0.75)');
  gr.addColorStop(0.75, 'rgba(120,190,235,0.5)');
  gr.addColorStop(1, 'rgba(120,190,235,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2;
  g.beginPath(); g.arc(26, 26, 9, 0.5, 2.6); g.stroke();
  return new THREE.CanvasTexture(c);
}
let spillMat = null;

// proste materiały struktur (skrzynie, deski, kamień)
function stripeTexture(base, dark, n) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  g.fillStyle = dark;
  for (let i = 0; i < 64; i += 64 / n) g.fillRect(0, i, 64, 2);
  g.strokeStyle = dark; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 61, 61);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let crateMat = null, plankMat = null, stoneMat = null;

// -------- chmury --------
function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  for (const [x, y, r] of [[38, 40, 22], [64, 32, 26], [92, 42, 20], [64, 44, 24]]) {
    const gr = g.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return new THREE.CanvasTexture(c);
}
const clouds = [];
{
  const mat = new THREE.MeshBasicMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, opacity: 0.85, fog: false });
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    const s = 18 + Math.random() * 26;
    m.scale.set(s, s * 0.5, 1);
    m.position.set((Math.random() - .5) * 260, 26 + Math.random() * 14, (Math.random() - .5) * 260);
    scene.add(m);
    clouds.push({ m, v: 0.6 + Math.random() * 0.8 });
  }
}

// -------- głazy 3D (bryły rozstawiane per-chunk) --------
const rockMat = new THREE.MeshLambertMaterial({ color: 0x8a8f85, flatShading: true });
const rockGeo = new THREE.IcosahedronGeometry(1, 0);

// ============================== WIATR (wspólny czas dla shaderów) ==============================
const windU = { value: 0 };
function addWind(mat, amp = 0.16, freq = 1.7) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = windU;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         vec3 iP = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       #else
         vec3 iP = vec3(0.0);
       #endif
       float h = max(position.y, 0.0);
       float sw = sin(uTime * ${freq.toFixed(2)} + iP.x * 0.4 + iP.z * 0.33) * ${amp.toFixed(3)} * h;
       transformed.x += sw;
       transformed.z += sw * 0.45;`);
  };
  mat.needsUpdate = true;
  return mat;
}

// -------- DRZEWA 3D (low-poly: pień + bryły korony) --------
const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 1, 6);
trunkGeo.translate(0, 0.5, 0);
const leafGeo = new THREE.IcosahedronGeometry(1, 0);
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b, flatShading: true });
const leafMats = [0x3f7a34, 0x4b8f3c, 0x356b2c, 0x5a9a42].map(c =>
  addWind(new THREE.MeshLambertMaterial({ color: c, flatShading: true }), 0.09, 1.2));
const pineMat = addWind(new THREE.MeshLambertMaterial({ color: 0x2f5f3a, flatShading: true }), 0.06, 1.1);
const coneGeo = new THREE.ConeGeometry(1, 1, 7);
coneGeo.translate(0, 0.5, 0);

function makeTree(x, z, rng, out) {
  const g0 = terrainH(x, z);
  const h = 2.4 + rng() * 2.2;
  const iglaste = rng() < 0.35;
  const tr = new THREE.Mesh(trunkGeo, trunkMat);
  tr.scale.set(1, h * (iglaste ? 0.45 : 0.62), 1);
  tr.position.set(x, g0, z);
  scene.add(tr); out.push(tr);
  if (iglaste) {                                   // świerk: 3 stożki
    for (let i = 0; i < 3; i++) {
      const s = (1.5 - i * 0.35) * (0.75 + rng() * 0.3);
      const c = new THREE.Mesh(coneGeo, pineMat);
      c.scale.set(s, h * 0.55 - i * 0.28, s);
      c.position.set(x, g0 + h * 0.32 + i * h * 0.28, z);
      c.rotation.y = rng() * 3;
      scene.add(c); out.push(c);
    }
  } else {                                          // liściaste: 2-3 bryły korony
    const lm = leafMats[Math.floor(rng() * leafMats.length)];
    const n = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const s = (1.15 - i * 0.22) * (0.85 + rng() * 0.4);
      const b = new THREE.Mesh(leafGeo, lm);
      b.scale.set(s * 1.15, s * 0.95, s * 1.15);
      b.position.set(x + (rng() - .5) * 0.7, g0 + h * 0.66 + i * 0.5, z + (rng() - .5) * 0.7);
      b.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      scene.add(b); out.push(b);
    }
  }
  return { c: 1, x, z, r: 0.42, top: 99 };          // kolizja pnia
}

// ============ TRAWA — DYWAN ŹDŹBEŁ (BotW/Genshin style) ============
// Jedna InstancedMesh z tysiącami źdźbeł, zakotwiona w siatce ŚWIATA (bez migotania),
// przebudowywana gdy gracz odejdzie od środka. Gradient w vertex colors + wiatr w shaderze.
function bladeGeometry() {
  const w = 0.026, h = 1;                       // wąskie źdźbło (było za szerokie = słoma)
  const P = [], C = [], I = [];
  const lvl = [[0, w, 0], [0.45, w * 0.8, 0.03], [0.78, w * 0.5, 0.09], [1, 0, 0.17]];
  const dolem = [0.24, 0.52, 0.14], gora = [0.78, 1.00, 0.42];
  for (let i = 0; i < lvl.length; i++) {
    const [y, hw, z] = lvl[i], t = y;
    const col = [dolem[0] + (gora[0] - dolem[0]) * t, dolem[1] + (gora[1] - dolem[1]) * t,
                 dolem[2] + (gora[2] - dolem[2]) * t];
    if (hw > 0) { P.push(-hw, y * h, z, hw, y * h, z); C.push(...col, ...col); }
    else { P.push(0, y * h, z); C.push(...col); }
  }
  I.push(0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}
const bladeGeo = bladeGeometry();
let bladeMat = null, grassField = null;
// uniformy dywanu: środek (gracz) + promień — do PŁYNNEGO WYRASTANIA (bez wyskakiwania)
const grassCenterU = { value: new THREE.Vector2() };
const grassRU = { value: 20 };
function makeBladeMaterial() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = windU;
    sh.uniforms.uCenter = grassCenterU;
    sh.uniforms.uR = grassRU;
    sh.vertexShader = 'uniform float uTime;uniform vec2 uCenter;uniform float uR;\n' +
      sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 iP = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float dC = distance(iP.xz, uCenter);
       float fade = 1.0 - smoothstep(uR - 7.0, uR - 0.5, dC);   // źdźbła wyrastają z ziemi
       transformed.y *= fade;
       float h = max(position.y, 0.0);
       float sw = sin(uTime * 2.2 + iP.x * 0.45 + iP.z * 0.35) * 0.28 * h * fade
                + sin(uTime * 0.7 + iP.x * 0.08) * 0.10 * h * fade;   // druga, wolna fala
       transformed.x += sw;
       transformed.z += sw * 0.45;`);
  };
  return m;
}
const GRASS_STEP = 0.20;
let GRASS_R = 24, GRASS_MAX = 14000;
const grassCenter = new THREE.Vector2(1e9, 1e9);
const _gm = new THREE.Object3D(), _gc = new THREE.Color();

function initGrassField() {
  const maloMocy = matchMedia('(pointer:coarse)').matches || innerWidth < 700;
  GRASS_R = maloMocy ? 15 : 23;
  GRASS_MAX = maloMocy ? 14000 : 42000;
  if (grassField) { scene.remove(grassField); grassField.dispose(); }
  grassField = new THREE.InstancedMesh(bladeGeo, bladeMat, GRASS_MAX);
  grassField.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GRASS_MAX * 3), 3);
  grassField.frustumCulled = false;
  grassField.count = 0;
  scene.add(grassField);
  grassCenter.set(1e9, 1e9);
}
function updateGrassField() {
  if (!grassField || MAPS[mapKey].indoor) { if (grassField) grassField.count = 0; return; }
  grassCenterU.value.set(P.pos.x, P.pos.z);        // shader ściemnia/skraca źdźbła przy brzegu
  grassRU.value = GRASS_R;
  if (Math.hypot(P.pos.x - grassCenter.x, P.pos.z - grassCenter.y) < 3) return;   // dopiero po ruchu
  grassCenter.set(P.pos.x, P.pos.z);
  const cx = Math.round(P.pos.x / GRASS_STEP), cz = Math.round(P.pos.z / GRASS_STEP);
  const cells = Math.ceil(GRASS_R / GRASS_STEP);
  let n = 0;
  for (let ix = -cells; ix <= cells && n < GRASS_MAX; ix++) {
    for (let iz = -cells; iz <= cells && n < GRASS_MAX; iz++) {
      if (ix * ix + iz * iz > cells * cells) continue;
      const gx = cx + ix, gz = cz + iz;
      const r1 = hash2(gx, gz), r2 = hash2(gx + 7777, gz - 313), r3 = hash2(gx - 99, gz + 1234);
      if (r3 > 0.975) continue;                                  // minimum łysin
      const x = gx * GRASS_STEP + (r1 - 0.5) * GRASS_STEP * 0.9;
      const z = gz * GRASS_STEP + (r2 - 0.5) * GRASS_STEP * 0.9;
      const y = terrainH(x, z);
      if (y < WATER_Y + 0.12) continue;                          // nie w wodzie
      const b = biome(x, z);
      const hgt = 0.46 + r1 * 0.30 - b * 0.10;                   // do kolan (postać ~2.2 j.)
      _gm.position.set(x, y - 0.02, z);
      // prawie pionowo (lekkie pochylenie) — inaczej wygląda jak rozsypana słoma
      _gm.rotation.set((r2 - 0.5) * 0.07, r1 * Math.PI * 2, (r1 - 0.5) * 0.07);
      _gm.scale.set(1, hgt, 1);
      _gm.updateMatrix();
      grassField.setMatrixAt(n, _gm.matrix);
      // kolor: las = soczysta zieleń, sucha łąka = cieplejsza; delikatna wariacja
      const plama = vnoise(x / 9 + 3.1, z / 9 + 8.4);            // miękkie łaty
      const v = 0.88 + plama * 0.24 + r3 * 0.05;
      _gc.setRGB((0.86 + b * 0.30) * v, (1.06 - b * 0.04) * v, (0.46 - b * 0.10) * v);
      grassField.setColorAt(n, _gc);
      n++;
    }
  }
  grassField.count = n;
  grassField.instanceMatrix.needsUpdate = true;
  if (grassField.instanceColor) grassField.instanceColor.needsUpdate = true;
}

// -------- stare kępki (zostawione dla marketu/dekoracji) --------
function bladeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  // szersze, jaśniejsze źdźbła z rozjaśnionymi końcówkami (styl Zeldy)
  const blades = [
    [3, 7, 30, 6, '#5fae4a', '#8fd96e'],
    [11, 9, 30, 1, '#74c95c', '#a6e884'],
    [20, 8, 30, 5, '#569f43', '#84cd63'],
    [26, 6, 30, 11, '#68bb52', '#9ade78'],
  ];
  for (const [x, w, base, top, col, tip] of blades) {
    const grd = g.createLinearGradient(0, base, 0, top);
    grd.addColorStop(0, col); grd.addColorStop(1, tip);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x, base);
    g.lineTo(x + w, base);
    g.quadraticCurveTo(x + w * 0.75, (base + top) / 2, x + w * 0.5 + 1, top);
    g.quadraticCurveTo(x + w * 0.25, (base + top) / 2, x, base);
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let grassMat = null;
const grassGeo = new THREE.PlaneGeometry(1.15, 0.95);
grassGeo.translate(0, 0.475, 0);
const GRASS_PER_CHUNK = 150;
function makeGrass(cx, cz, rng) {
  const wx0 = cx * CHUNK, wz0 = cz * CHUNK;
  const inst = new THREE.InstancedMesh(grassGeo, grassMat, GRASS_PER_CHUNK);
  const m = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < GRASS_PER_CHUNK; i++) {
    const x = wx0 + (rng() - 0.5) * CHUNK, z = wz0 + (rng() - 0.5) * CHUNK;
    const y = terrainH(x, z);
    if (y < WATER_Y + 0.25) continue;
    if (biome(x, z) > 0.62) continue;               // na suchych łąkach rzadziej
    m.position.set(x, y - 0.05, z);
    m.rotation.set(0, rng() * Math.PI, 0);
    const s = 0.75 + rng() * 0.7;
    m.scale.set(s, s * (0.8 + rng() * 0.5), s);
    m.updateMatrix();
    inst.setMatrixAt(n++, m.matrix);
  }
  inst.count = n;
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = false;
  scene.add(inst);
  return inst;
}

// -------- cień-plamka --------
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  gr.addColorStop(0, 'rgba(0,0,0,0.40)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
const blobGeo = new THREE.PlaneGeometry(1, 1);
blobGeo.rotateX(-Math.PI / 2);

function ringTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = color; g.lineWidth = 5;
  g.beginPath(); g.arc(32, 32, 26, 0, 7); g.stroke();
  return new THREE.CanvasTexture(c);
}

// ============================== SPRITE LIB ==============================
const texLoader = new THREE.ImageLoader();
const LIB = {};
const loadImage = src => new Promise((res, rej) => texLoader.load(src, res, undefined, rej));

async function buildChar(name, anims) {
  const def = SPRITEDATA[name];
  const img = await loadImage(def.img);
  const size = def.size;
  LIB[name] = { size, footOff: def.footOff || 0, anims: {}, img };
  for (const an of anims) {
    const a = def.anims[an]; if (!a) continue;
    const entry = { fps: a.fps, dirs: {} };
    for (const dir of Object.keys(a.rows)) {
      const row = a.rows[dir], n = a.frames[dir];
      const mats = [];
      for (let f = 0; f < n; f++) {
        const cv = document.createElement('canvas'); cv.width = cv.height = size;
        cv.getContext('2d').drawImage(img, f * size, row * size, size, size, 0, 0, size, size);
        const t = new THREE.CanvasTexture(cv);
        t.magFilter = t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        t.colorSpace = THREE.SRGBColorSpace;
        mats.push(new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide }));
      }
      entry.dirs[dir] = mats;
    }
    LIB[name].anims[an] = entry;
  }
}

async function flatMat(src) {
  const img = await loadImage(src);
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  cv.getContext('2d').drawImage(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return { mat: new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide }), w: img.width, h: img.height };
}

const unitGeo = new THREE.PlaneGeometry(1, 1);
unitGeo.translate(0, 0.5, 0);

// ============================== BILLBOARD ==============================
class Billboard {
  constructor(char, scaleMul = 1) {
    this.char = char;
    const L = LIB[char];
    this.h = L.size * PX2U * scaleMul;
    this.mesh = new THREE.Mesh(unitGeo, null);
    this.mesh.scale.set(this.h, this.h, 1);
    this.footY = -L.footOff * PX2U * scaleMul;
    this.anim = null; this.t = 0; this.loop = true; this.done = false;
    this.facing = 0;
    this.shadow = new THREE.Mesh(blobGeo, blobMat);
    this.shadow.scale.set(this.h * 0.5, 1, this.h * 0.3);
    scene.add(this.mesh); scene.add(this.shadow);
    this.play('idle');
  }
  play(an, loop = true) {
    if (this.anim === an) return;
    if (!LIB[this.char].anims[an]) return;
    this.anim = an; this.t = 0; this.loop = loop; this.done = false;
  }
  update(dt, pos, ty, groundY = ty) {
    const A = LIB[this.char].anims[this.anim];
    this.t += dt;
    // kierunek klatki względem AKTUALNEGO obrotu kamery
    const rel = this.facing - camYaw;
    let idx = Math.round(rel / (Math.PI / 4)) & 7;
    if (idx < 0) idx += 8;
    const dir = DIR_ROWS[idx] in A.dirs ? DIR_ROWS[idx] : 'south';
    const mats = A.dirs[dir];
    let f = Math.floor(this.t * A.fps);
    if (this.loop) f %= mats.length;
    else if (f >= mats.length) { f = mats.length - 1; this.done = true; }
    this.mesh.material = mats[f];
    this.mesh.position.set(pos.x, ty + this.footY, pos.z);
    this.mesh.rotation.y = camYaw;                 // billboard twarzą do kamery
    this.shadow.position.set(pos.x, groundY + 0.04, pos.z);
  }
  dispose() { scene.remove(this.mesh); scene.remove(this.shadow); }
}
const faceAngle = (x, z) => { const a = Math.atan2(x, z); return a < 0 ? a + Math.PI * 2 : a; };

// czerwony błysk na postaci przy obrażeniach (nakładka z tą samą klatką sprite'a)
let hitFlash = null, hitFlashMat = null;
function initHitFlash() {
  hitFlashMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0,
    depthTest: false, alphaTest: 0.5, side: THREE.DoubleSide });
  hitFlash = new THREE.Mesh(unitGeo, hitFlashMat);
  hitFlash.renderOrder = 5;
  hitFlash.visible = false;
  scene.add(hitFlash);
}
function updateHitFlash() {
  if (!hitFlash) return;
  const on = P.iframes > 0 && !G.dying;
  hitFlash.visible = on;
  if (!on) return;
  hitFlashMat.map = playerBB.mesh.material.map;          // ta sama klatka co postać
  hitFlashMat.opacity = 0.35 + 0.45 * Math.abs(Math.sin(P.iframes * 22));
  hitFlashMat.needsUpdate = true;
  hitFlash.scale.copy(playerBB.mesh.scale);
  hitFlash.position.copy(playerBB.mesh.position);
  hitFlash.rotation.copy(playerBB.mesh.rotation);
}

// ============================== META (localStorage) ==============================
const META_KEY = 'horda3d_meta_v1';
function loadMeta() {
  const def = () => ({
    coins: 0, up: { serce: 0, dmg: 0, szyb: 0, magnes: 0 }, unlocked: {},
    chars: { kasia: 1 }, lastChar: 'kasia', lastMap: 'laki',
    st: { kills: 0, runs: 0, time: 0, best: 0, bestKills: 0, bosses: 0, coins: 0, chests: 0, lvl: 0 },
  });
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY)) || {};
    const d = def();
    return {
      coins: m.coins || 0,
      up: Object.assign(d.up, m.up),
      unlocked: Object.assign(d.unlocked, m.unlocked),
      chars: Object.assign(d.chars, m.chars),
      lastChar: m.lastChar || 'kasia', lastMap: m.lastMap || 'laki',
      st: Object.assign(d.st, m.st),
    };
  } catch { return def(); }
}
const META = loadMeta();
const saveMeta = () => localStorage.setItem(META_KEY, JSON.stringify(META));

const SHOP = [
  { key: 'serce',  ico: 'serce', nm: 'Twarde serce',   ds: '+1 serce na start',      base: 50, max: 3 },
  { key: 'dmg',    ico: 'fala', nm: 'Siła', ds: '+10% obrażeń na stałe',  base: 40, max: 5 },
  { key: 'szyb',   ico: 'but', nm: 'Kondycja',       ds: '+8% szybkości na stałe', base: 40, max: 5 },
  { key: 'magnes', ico: 'magnes', nm: 'Przyciąganie',   ds: '+20% magnesu na stałe',  base: 30, max: 5 },
];
// odblokowania broni i pasywów (jednorazowe — wchodzą do puli kart w biegu)
const SHOP_UNLOCKS = [
  { key: 'piorun',   ico: 'pioruny', nm: 'Piorun',          ds: 'Grom bije losowych wrogów',      price: 150 },
  { key: 'butelka',  ico: 'butelka', nm: 'Butelka żula',    ds: 'Leci łukiem i wybucha',          price: 200 },
  { key: 'bumerang', ico: 'radio', nm: 'Radio-bumerang',  ds: 'Leci i wraca, kosząc po drodze', price: 250 },
  { key: 'tarcza',   ico: 'tarcza', nm: 'Tarcza',         ds: 'Blokuje 1 trafienie co jakiś czas', price: 120 },
  { key: 'djump',    ico: 'skok', nm: 'Podwójny skok',         ds: 'Drugi skok w powietrzu — przeskakuj regały (bywa też w skrzyniach)', price: 300 },
  { key: 'skarpeta', ico: 'skarpeta', nm: 'Skarpeta', ds: 'Śmierdząca aura truje wokół', price: 180 },
  { key: 'wiatrowka', ico: 'wiatr', nm: 'Wiatrówka',      ds: 'Promień przeszywa całą linię', price: 220 },
  { key: 'kura',     ico: 'kura', nm: 'Kura-kamikaze',   ds: 'Biegnie i wybucha. Kura.', price: 350 },
];
const shopPrice = it => it.base * Math.pow(2, META.up[it.key]);

// ---- MENU: mapy / postacie / statystyki ----
function renderMaps() {
  const wrap = document.getElementById('mapGrid'); wrap.innerHTML = '';
  for (const key of Object.keys(MAPS)) {
    const M = MAPS[key];
    const d = document.createElement('div');
    d.className = 'tile' + (key === mapKey ? ' sel' : '');
    d.innerHTML = `<div class="ico">${ico(M.ico, 46)}</div><div class="nm">${M.nm}</div><div class="ds">${M.ds}</div>`;
    d.onclick = () => { setMap(key); META.lastMap = key; saveMeta(); renderMaps(); renderPick(); };
    wrap.appendChild(d);
  }
}
function renderChars() {
  const wrap = document.getElementById('charGrid'); wrap.innerHTML = '';
  for (const key of Object.keys(CHARS)) {
    const C = CHARS[key];
    const owned = !!META.chars[key];
    const d = document.createElement('div');
    d.className = 'tile' + (key === charKey ? ' sel' : '') + (owned ? '' : ' lock');
    d.innerHTML = `<div class="ico"><img class="pxi" src="${portret(C.char)}" style="height:62px"></div>
      <div class="nm">${C.nm}</div>
      <div class="ds">${C.ds}</div>${owned ? '' : `<div class="pr">${ico('moneta', 15)} ${C.price}</div>`}`;
    d.onclick = () => {
      if (!owned) {
        if (META.coins < C.price) { d.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
          { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 200 }); return; }
        META.coins -= C.price; META.chars[key] = 1;
      }
      charKey = key; META.lastChar = key; saveMeta();
      setPlayerChar(key);
      renderChars(); renderShop(); renderPick();
    };
    wrap.appendChild(d);
  }
}
function renderPick() {
  document.getElementById('selMapNm').innerHTML = ico(MAPS[mapKey].ico, 16) + ' ' + MAPS[mapKey].nm;
  document.getElementById('selCharNm').innerHTML =
    `<img class="pxi" src="${portret(CHARS[charKey].char)}" style="height:22px"> ` + CHARS[charKey].nm;
}
function renderStats() {
  const s = META.st;
  const dane = [
    ['czaszka', s.kills, 'Zabitych łącznie'],
    ['play', s.runs, 'Rozegranych biegów'],
    ['zegar', fmtTime(s.best), 'Najdłuższy bieg'],
    ['puchar', s.bestKills, 'Rekord zabitych'],
    ['korona', s.bosses, 'Pokonanych bossów'],
    ['skrzynia', s.chests, 'Skrzyń z bronią'],
    ['gwiazda', s.lvl, 'Zdobytych poziomów'],
    ['moneta', s.coins, 'Monet zebranych'],
    ['zegar', fmtTime(s.time), 'Łączny czas gry'],
  ];
  document.getElementById('statsList').innerHTML = dane.map(([i, v, k]) =>
    `<div class="stat"><div class="v">${ico(i, 20)} ${v}</div><div class="k">${k}</div></div>`).join('');
}

function renderShop() {
  document.getElementById('shopCoins').innerHTML = ico('moneta', 16) + ' ' + META.coins;
  const wrap = document.getElementById('shopItems'); wrap.innerHTML = '';
  const deny = d => d.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 200 });
  for (const it of SHOP) {
    const lvl = META.up[it.key], maxed = lvl >= it.max;
    const d = document.createElement('div');
    d.className = 'tile' + (maxed ? ' lock' : '');
    d.innerHTML = `<div class="ico">${ico(it.ico, 40)}</div><div class="nm">${it.nm} ${lvl}/${it.max}</div>
      <div class="ds">${it.ds}</div><div class="pr">${maxed ? 'MAX' : ico('moneta', 15) + ' ' + shopPrice(it)}</div>`;
    if (!maxed) d.onclick = () => {
      const pr = shopPrice(it);
      if (META.coins < pr) return deny(d);
      META.coins -= pr; META.up[it.key]++; saveMeta(); renderShop();
    };
    wrap.appendChild(d);
  }
  for (const it of SHOP_UNLOCKS) {
    const owned = !!META.unlocked[it.key];
    const d = document.createElement('div');
    d.className = 'tile' + (owned ? ' lock' : '');
    d.innerHTML = `<div class="ico">${ico(it.ico, 40)}</div><div class="nm">${it.nm}</div>
      <div class="ds">${it.ds}</div><div class="pr">${owned ? 'MASZ' : ico('moneta', 15) + ' ' + it.price}</div>`;
    if (!owned) d.onclick = () => {
      if (META.coins < it.price) return deny(d);
      META.coins -= it.price; META.unlocked[it.key] = 1; saveMeta(); renderShop();
    };
    wrap.appendChild(d);
  }
}

// ============================== STAN GRY ==============================
const G = {
  running: false, over: false, paused: false,
  time: 0, kills: 0, runCoins: 0,
  enemies: [], gems: [], coins: [], shots: [], orbs: [], sparks: [], rings: [],
  lobs: [], boomers: [], bolts: [], pops: [], hps: [], kury: [],
  spawnT: 0, shake: 0, bossAt: 120, ringAt: 60, tier: 0,
  vacuum: 0, buff: { key: null, t: 0 },
  streak: 0, streakT: -9,
  dying: false, deathT: 0,
};
const P = {};

function resetStats() {
  const C = CHARS[charKey];
  const maxHp = Math.max(2, 5 + META.up.serce + C.hp);
  Object.assign(P, {
    pos: new THREE.Vector3(0, 0, 0),
    hp: maxHp, maxHp,
    iframes: 0, y: 1.55, vy: 0, airborne: false, usedDouble: false, runDjump: false, shieldCd: 0,
    vx: 0, vz: 0,
    weapons: [{ key: 'kule', lvl: 1, t: 0 }],   // max 3 sloty
    passives: {},                                // key -> poziom
    evo: {},                                     // key -> true
    xp: 0, lvl: 1, xpNeed: 5,
  });
}
// ---- statystyki pochodne (meta + pasywy + buffy) ----
const dmgAll  = () => CHARS[charKey].dmg * (1 + 0.10 * META.up.dmg) * Math.pow(1.15, P.passives.moc || 0) * (G.buff.key === 'dmg' ? 2 : 1);
const fireMul = () => Math.pow(1.12, P.passives.tempo || 0);
const critC   = () => 0.10 * (P.passives.krytyk || 0);
const rangeF  = () => 14 * Math.pow(1.2, P.passives.zasieg || 0);
const magnetF = () => CHARS[charKey].mag * 2.6 * (1 + 0.20 * META.up.magnes) * Math.pow(1.35, P.passives.magnes || 0);
const speedF  = () => CHARS[charKey].spd * 6.2 * (1 + 0.08 * META.up.szyb) * Math.pow(1.10, P.passives.buty || 0);
const hasWeapon = k => P.weapons.find(w => w.key === k);

// ============================== WEJŚCIE ==============================
const keys = {};
const hasDjump = () => META.unlocked.djump || P.runDjump;
function tryJump() {
  if (!G.running || G.paused) return;
  if (!P.airborne) { P.vy = 8.2; P.airborne = true; }
  else if (hasDjump() && !P.usedDouble) {          // 🦘🦘 podwójny skok
    P.vy = 7.6; P.usedDouble = true;
    dmgPop(P.pos.x, P.y + 0.4, P.pos.z, 'HOP!', '#aaeeff', 1.1);
  }
}
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); tryJump(); }
});
addEventListener('keyup', e => { keys[e.code] = false; });

// dotyk: lewa połowa = joystick; mysz / prawa połowa dotyku = obrót kamery
const stickEl = document.getElementById('stick'), knobEl = document.getElementById('knob');
const touch = { on: false, id: null, cx: 0, cy: 0, vx: 0, vy: 0 };
const camDrag = { on: false, id: null, lx: 0 };
addEventListener('pointerdown', e => {
  if (!G.running || G.paused || e.target.closest('.ov') || e.target.id === 'jbtn') return;
  const joyZone = e.pointerType === 'touch' && e.clientX < innerWidth * 0.55;
  if (joyZone && !touch.on) {
    touch.on = true; touch.id = e.pointerId; touch.cx = e.clientX; touch.cy = e.clientY;
    touch.vx = touch.vy = 0;
    stickEl.style.display = 'block';
    stickEl.style.left = (e.clientX - 55) + 'px'; stickEl.style.top = (e.clientY - 55) + 'px';
  } else if (!camDrag.on) {
    camDrag.on = true; camDrag.id = e.pointerId; camDrag.lx = e.clientX;
  }
});
addEventListener('pointermove', e => {
  if (touch.on && e.pointerId === touch.id) {
    let dx = e.clientX - touch.cx, dy = e.clientY - touch.cy;
    const d = Math.hypot(dx, dy), m = Math.min(d, 45);
    if (d > 0) { dx /= d; dy /= d; }
    touch.vx = dx * (m / 45); touch.vy = dy * (m / 45);
    knobEl.style.transform = `translate(calc(-50% + ${dx * m}px), calc(-50% + ${dy * m}px))`;
  } else if (camDrag.on && e.pointerId === camDrag.id) {
    camYaw -= (e.clientX - camDrag.lx) * 0.008;
    camDrag.lx = e.clientX;
  }
});
function endTouch(e) {
  if (e.pointerId === touch.id) {
    touch.on = false; touch.vx = touch.vy = 0;
    stickEl.style.display = 'none';
    knobEl.style.transform = 'translate(-50%,-50%)';
  }
  if (e.pointerId === camDrag.id) camDrag.on = false;
}
addEventListener('pointerup', endTouch);
addEventListener('pointercancel', endTouch);
document.getElementById('jbtn').addEventListener('pointerdown', e => { e.stopPropagation(); tryJump(); });

// ============================== WROGOWIE ==============================
const ENEMY_TYPES = {
  dresiarz: { hp: 3, speed: 2.7, dmg: 1, scale: 1.0, xp: 1, walk: 'run', death: 'death' },
  zul:      { hp: 6, speed: 2.0, dmg: 1, scale: 1.05, xp: 3, walk: 'walk', death: 'death', char: 'enemy', bigXp: true },
  wegielek: { hp: 1, speed: 3.9, dmg: 1, scale: 0.9, xp: 1, walk: 'run' },
  dzik:     { hp: 5, speed: 5.2, dmg: 1, scale: 2.1, xp: 4, walk: 'run', bigXp: true },
  boss:     { hp: 90, speed: 2.4, dmg: 2, scale: 1.9, xp: 25, walk: 'run', char: 'doctorAngry', boss: true },
};

let eliteRingMat = null;
// ---- PROGRESJA: poziom zagrożenia rośnie co minutę ----
const tier = () => 1 + Math.floor(G.time / 60);
const hpScale = () => 1 + G.time / 60 * 0.55 + Math.pow(G.time / 300, 2) * 1.5;  // późno rośnie ostro
const spdScale = () => Math.min(1.5, 1 + G.time / 60 * 0.035);
const dmgScale = () => G.time > 600 ? 3 : (G.time > 330 ? 2 : 1);               // 5.5 min → 2, 10 min → 3

function spawnEnemy(type, angle = null) {
  const T = ENEMY_TYPES[type];
  const a = angle === null ? Math.random() * Math.PI * 2 : angle;
  const r = 34 + Math.random() * 10;
  const hpMul = hpScale();
  const elite = !T.boss && G.time > 60 && Math.random() < 0.06 + G.time / 60 * 0.015;
  const e = {
    type, T, elite,
    pos: new THREE.Vector3(P.pos.x + Math.sin(a) * r, 0, P.pos.z + Math.cos(a) * r),
    hp: T.hp * (T.boss ? 1 : hpMul) * (elite ? 6 : 1),
    dying: false, hitCd: 0, kb: new THREE.Vector3(), orbCd: 0, climbing: false,
    ty: 0, vy: 0, jumpCd: 1 + Math.random() * 3,
    bb: new Billboard(T.char || type, T.scale * (elite ? 1.45 : 1)),
  };
  e.ty = terrainH(e.pos.x, e.pos.z);
  if (elite) {                              // złota obwódka pod elitą
    e.ring = new THREE.Mesh(blobGeo, eliteRingMat);
    e.ring.scale.set(1.8, 1, 1.8);
    scene.add(e.ring);
  }
  e.bb.play(T.walk);
  G.enemies.push(e);
}

function killEnemy(e, i) {
  G.kills++;
  document.getElementById('kills').innerHTML = ico('czaszka', 15) + ' ' + G.kills;
  // KILL + combo (kille w oknie 1.3 s nabijają serię)
  G.streak = (G.time - G.streakT < 1.3) ? G.streak + 1 : 1;
  G.streakT = G.time;
  G.shake = Math.max(G.shake, Math.min(0.5, 0.06 + G.streak * 0.03));
  if (e.T.boss) { dmgPop(e.pos.x, e.ty + 1.2, e.pos.z, 'BOSS DOWN!', '#ff5555', 2.6); META.st.bosses++; saveMeta(); }
  else if (e.elite) dmgPop(e.pos.x, e.ty + 0.8, e.pos.z, 'ELITA!', '#ffd75e', 1.9);
  else dmgPop(e.pos.x, e.ty + 0.5, e.pos.z, G.streak > 1 ? 'KILL x' + G.streak : 'KILL',
    '#ff6a5e', Math.min(1.1 + G.streak * 0.12, 2.2));
  // XP: nie każdy dropi — duzi zawsze, mali 65% (za to szybciej ich kosisz)
  const dropXp = e.T.boss || e.elite || e.T.bigXp || Math.random() < 0.65;
  if (dropXp) {
    const xpTotal = e.T.xp * (e.elite ? 4 : 1);
    const n = e.T.boss ? 10 : (e.elite ? 3 : 1);
    for (let k = 0; k < n; k++) {
      G.gems.push(makeGem(e.pos.x + (Math.random() - .5) * 1.5, e.pos.z + (Math.random() - .5) * 1.5, xpTotal / n));
    }
  }
  // monety: 9% szansy, elita 2 szt. gwarantowane, boss garść
  if (e.T.boss) { for (let k = 0; k < 12; k++) G.coins.push(makeCoin(e.pos.x + (Math.random() - .5) * 2.5, e.pos.z + (Math.random() - .5) * 2.5)); }
  else if (e.elite) { G.coins.push(makeCoin(e.pos.x, e.pos.z)); G.coins.push(makeCoin(e.pos.x + 0.6, e.pos.z)); }
  else if (Math.random() < 0.09) G.coins.push(makeCoin(e.pos.x, e.pos.z));
  // serca: elity 30%, boss zawsze 2
  if (e.T.boss) { G.hps.push(makeHeart(e.pos.x - 0.8, e.pos.z)); G.hps.push(makeHeart(e.pos.x + 0.8, e.pos.z)); }
  else if (e.elite && Math.random() < 0.3) G.hps.push(makeHeart(e.pos.x, e.pos.z));
  if (e.ring) { scene.remove(e.ring); e.ring = null; }
  if (e.T.death && LIB[e.T.char || e.type].anims[e.T.death]) {
    e.dying = true; e.bb.play(e.T.death, false);
  } else {
    e.bb.dispose(); G.enemies.splice(i, 1);
  }
}

// ============================== POCISKI / DROPY ==============================
const shotGeo = new THREE.SphereGeometry(0.18, 8, 8);
const shotMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
const sparkGeo = new THREE.SphereGeometry(0.3, 6, 6);
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });

let boneMatCache = null, boneAspect = 1;
function makeGem(x, z, val) {
  const m = new THREE.Mesh(unitGeo, boneMatCache);
  m.scale.set(0.55 * boneAspect, 0.55, 1);
  m.position.set(x, terrainH(x, z) + 0.1, z);
  scene.add(m);
  return { mesh: m, pos: new THREE.Vector3(x, 0, z), val, t: Math.random() * 6 };
}

function coinTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#c9930a'; g.beginPath(); g.arc(16, 17, 13, 0, 7); g.fill();
  g.fillStyle = '#ffd75e'; g.beginPath(); g.arc(16, 15, 13, 0, 7); g.fill();
  g.fillStyle = '#c9930a'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.fillText('$', 16, 21);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
let coinMat = null;
function makeCoin(x, z) {
  const m = new THREE.Mesh(unitGeo, coinMat);
  m.scale.set(0.5, 0.5, 1);
  m.position.set(x, terrainH(x, z) + 0.1, z);
  scene.add(m);
  return { mesh: m, pos: new THREE.Vector3(x, 0, z), t: Math.random() * 6 };
}

// materiały nowych broni + efekt pioruna
let bottleMat = null, radioMat = null;
const boltGeo = new THREE.CylinderGeometry(0.07, 0.16, 14, 5);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, fog: false });
function boltFx(x, ty, z) {
  const m = new THREE.Mesh(boltGeo, boltMat.clone());
  m.position.set(x, ty + 7, z);
  scene.add(m);
  G.bolts.push({ mesh: m, t: 0 });
  spark(x, ty + 1.2, z);
  G.shake = Math.max(G.shake, 0.12);
}

function spark(x, y, z) {
  const m = new THREE.Mesh(sparkGeo, sparkMat.clone());
  m.position.set(x, y, z);
  scene.add(m);
  G.sparks.push({ mesh: m, t: 0 });
}

// ---- wyskakujące napisy (obrażenia, KILL) — tekstury cache'owane per napis ----
const popCache = new Map();
function popMat(str, color) {
  const key = color + '|' + str;
  let m = popCache.get(key);
  if (m) return m;
  const c = document.createElement('canvas'); c.width = 160; c.height = 56;
  const g = c.getContext('2d');
  g.font = "700 30px 'Pixel', monospace";
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.9)'; g.strokeText(str, 80, 28);
  g.fillStyle = color; g.fillText(str, 80, 28);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false });
  popCache.set(key, m);
  return m;
}
function dmgPop(x, ty, z, str, color = '#ffe066', scale = 1) {
  if (G.pops.length > 70) return;                 // bezpiecznik przy hordach
  const mesh = new THREE.Mesh(unitGeo, popMat(str, color).clone());
  mesh.scale.set(2.6 * scale, 0.9 * scale, 1);
  mesh.position.set(x + (Math.random() - .5) * 0.7, ty + 1.7, z);
  scene.add(mesh);
  G.pops.push({ mesh, t: 0 });
}
// wyświetlana liczba obrażeń (dopaminowa skala ×250, zaokrąglona do 10)
const dmgNum = d => String(Math.max(50, Math.round(d * 250 / 10) * 10));

// ---- serca-dropy ❤️ ----
let heartMat = null;
function makeHeart(x, z) {
  const m = new THREE.Mesh(unitGeo, heartMat);
  m.scale.set(0.7, 0.7, 1);
  m.position.set(x, terrainH(x, z) + 0.2, z);
  scene.add(m);
  return { mesh: m, pos: new THREE.Vector3(x, 0, z), t: Math.random() * 6 };
}
function emojiMat(emoji) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = '48px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, 32, 36);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
}

// ============================== BRONIE (rejestr) ==============================
// tick(w, dt) woła się co klatkę dla każdej posiadanej broni; w = {key, lvl, t}
const WEAPONS = {
  kule: {
    ico: 'kula', nm: 'Kule energii', ds: 'Samonaprowadzające pociski', max: 5,
    lvlDs: l => ['1 pocisk', '2 pociski', '+1 przebicie', '3 pociski', '+2 przebicia (→ ewolucja!)'][l - 1],
    evoKey: 'meteor', evoIco: 'kula', evoNm: 'KULE METEORYCZNE', evoDs: 'EWOLUCJA: pociski WYBUCHAJĄ przy trafieniu',
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const count = [1, 2, 2, 3, 3][w.lvl - 1], pierce = [0, 0, 1, 1, 2][w.lvl - 1];
      let targets = G.enemies.filter(e => !e.dying)
        .map(e => ({ e, d: e.pos.distanceTo(P.pos) }))
        .filter(o => o.d < rangeF())
        .sort((a, b) => a.d - b.d).slice(0, count);
      if (!targets.length) return;
      w.t = 1 / (1.15 * fireMul());
      while (targets.length < count) targets.push(targets[targets.length - 1]);
      for (const { e } of targets) {
        const dir = e.pos.clone().sub(P.pos).setY(0).normalize();
        const m = new THREE.Mesh(shotGeo, shotMat);
        m.position.set(P.pos.x, terrainH(P.pos.x, P.pos.z) + 1.0, P.pos.z);
        scene.add(m);
        G.shots.push({ mesh: m, dir, life: 1.3, pierce, hit: new Set() });
      }
    },
  },
  kosc: {
    ico: 'kosc', nm: 'Kość orbitalna', ds: 'Kości krążą i biją wrogów', max: 5,
    lvlDs: l => l + (l === 1 ? ' kość' : ' kości') + (l === 5 ? ' (→ ewolucja!)' : ''),
    evoKey: 'kosci', evoIco: 'kosc', evoNm: 'KOŚCIOTRZĘSIENIE', evoDs: 'EWOLUCJA: kości ×1.5 większe, szybsze i 2× mocniejsze',
    tick(w, dt) {
      while (G.orbs.length < w.lvl) {
        const m = new THREE.Mesh(unitGeo, boneMatCache);
        m.scale.set(0.8 * boneAspect, 0.8, 1);
        scene.add(m);
        G.orbs.push({ mesh: m });
      }
      const evo = P.evo.kosci;
      const orbSpd = evo ? 4.8 : 2.6, orbRR = evo ? 2.6 : 1.0, oDmg = 2 * (evo ? 2 : 1) * dmgAll();
      for (let k = 0; k < G.orbs.length; k++) {
        const o = G.orbs[k];
        const a = G.time * orbSpd + k * (Math.PI * 2 / G.orbs.length);
        const ox = P.pos.x + Math.cos(a) * 2.1, oz = P.pos.z + Math.sin(a) * 2.1;
        o.mesh.position.set(ox, terrainH(ox, oz) + 0.9 + Math.sin(G.time * 5 + k) * 0.1, oz);
        o.mesh.rotation.set(0, camYaw, -a);
        if (evo && Math.abs(o.mesh.scale.y - 1.2) > 0.01) o.mesh.scale.set(1.2 * boneAspect, 1.2, 1);
        for (let j = G.enemies.length - 1; j >= 0; j--) {
          const e = G.enemies[j];
          if (e.dying || e.orbCd > 0) continue;
          const dx = o.mesh.position.x - e.pos.x, dz = o.mesh.position.z - e.pos.z;
          if (dx * dx + dz * dz < orbRR) {
            e.hp -= oDmg; e.orbCd = 0.5;
            e.kb.copy(e.pos).sub(P.pos).setY(0).normalize().multiplyScalar(2.2);
            spark(e.pos.x, e.ty + 1.0, e.pos.z);
            dmgPop(e.pos.x, e.ty, e.pos.z, dmgNum(oDmg), '#cfe8ff', 0.9);
            if (e.hp <= 0) killEnemy(e, j);
          }
        }
      }
    },
  },
  tupniecie: {
    ico: 'fala', nm: 'Tupnięcie', ds: 'Fala uderzeniowa (też przy lądowaniu ze skoku!)', max: 3,
    lvlDs: l => 'promień i moc fali +' + l,
    evoKey: 'sejsm', evoIco: 'fala', evoNm: 'TRZĘSIENIE ZIEMI', evoDs: 'EWOLUCJA: fale częstsze, większe i 2× mocniejsze',
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = P.evo.sejsm ? 2.0 : 3.2;
      nova(P.pos.x, P.pos.z, stompRad(w.lvl), stompDmg(w.lvl));
    },
  },
  piorun: {
    ico: 'pioruny', nm: 'Piorun', ds: 'Grom bije losowych wrogów', max: 5, locked: true,
    lvlDs: l => `${Math.ceil(l / 2)} grom(y), co ${(2.8 - 0.25 * l).toFixed(1)} s`,
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const alive = G.enemies.filter(e => !e.dying && e.pos.distanceTo(P.pos) < 15);
      if (!alive.length) return;
      w.t = 2.8 - 0.25 * w.lvl;
      for (let b = 0; b < Math.ceil(w.lvl / 2); b++) {
        const e = alive[Math.floor(Math.random() * alive.length)];
        boltFx(e.pos.x, e.ty, e.pos.z);
        const bd = 3 * dmgAll();
        e.hp -= bd;
        dmgPop(e.pos.x, e.ty + 0.4, e.pos.z, dmgNum(bd), '#e8f4ff', 1.2);
        e.kb.set(0, 0, 0);
        const j = G.enemies.indexOf(e);
        if (e.hp <= 0 && j >= 0) killEnemy(e, j);
      }
    },
  },
  butelka: {
    ico: 'butelka', nm: 'Butelka żula', ds: 'Leci łukiem i WYBUCHA', max: 5, locked: true,
    lvlDs: l => `wybuch r=${(2 + 0.3 * l).toFixed(1)}, co ${(3.6 - 0.25 * l).toFixed(1)} s`,
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const alive = G.enemies.filter(e => !e.dying && e.pos.distanceTo(P.pos) < 13);
      if (!alive.length) return;
      w.t = 3.6 - 0.25 * w.lvl;
      const e = alive[Math.floor(Math.random() * alive.length)];
      const m = new THREE.Mesh(unitGeo, bottleMat);
      m.scale.set(0.7, 0.7, 1);
      scene.add(m);
      G.lobs.push({ mesh: m, from: P.pos.clone(), to: e.pos.clone(), t: 0, dur: 0.7, lvl: w.lvl });
    },
  },
  bumerang: {
    ico: 'radio', nm: 'Radio-bumerang', ds: 'Grające radio leci i WRACA, kosząc po drodze', max: 5, locked: true,
    lvlDs: l => `zasięg ${(8 + 0.6 * l).toFixed(0)}, co ${(2.8 - 0.2 * l).toFixed(1)} s`,
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = 2.8 - 0.2 * w.lvl;
      const m = new THREE.Mesh(unitGeo, radioMat);
      m.scale.set(0.9, 0.9, 1);
      scene.add(m);
      const dir = new THREE.Vector3(Math.sin(playerBB.facing), 0, Math.cos(playerBB.facing));
      G.boomers.push({ mesh: m, dir, t: 0, dur: 1.6, dist: 8 + 0.6 * w.lvl, lvl: w.lvl, hit: new Set() });
    },
  },
  skarpeta: {
    ico: 'skarpeta', nm: 'Skarpeta biologiczna', ds: 'Śmierdząca AURA truje wszystko wokół Ciebie', max: 5, locked: true,
    lvlDs: l => `promień ${(2.2 + 0.35 * l).toFixed(1)}, trucie co 0.7 s`,
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = 0.7;
      const r = 2.2 + 0.35 * w.lvl, ad = (0.8 + 0.25 * w.lvl) * dmgAll();
      novaRing(P.pos.x, P.pos.z, r * 0.9);
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
        if (dx * dx + dz * dz < r * r) {
          e.hp -= ad;
          dmgPop(e.pos.x, e.ty, e.pos.z, dmgNum(ad), '#a8e05f', 0.75);
          if (e.hp <= 0) killEnemy(e, j);
        }
      }
    },
  },
  wiatrowka: {
    ico: 'wiatr', nm: 'Wiatrówka z bazaru', ds: 'PROMIEŃ przeszywa wszystko na linii strzału', max: 5, locked: true,
    lvlDs: l => `co ${(2.2 - 0.15 * l).toFixed(2)} s, obrażenia +${l}`,
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const alive = G.enemies.filter(e => !e.dying && e.pos.distanceTo(P.pos) < 18);
      if (!alive.length) return;
      w.t = 2.2 - 0.15 * w.lvl;
      let far = alive[0], fd = 0;
      for (const e of alive) { const d = e.pos.distanceTo(P.pos); if (d > fd) { fd = d; far = e; } }
      const dir = far.pos.clone().sub(P.pos).setY(0).normalize();
      // tracer poziomy
      const tr = new THREE.Mesh(boltGeo, boltMat.clone());
      tr.scale.set(0.6, 18 / 14, 0.6);
      tr.position.set(P.pos.x + dir.x * 9, terrainH(P.pos.x, P.pos.z) + 1.0, P.pos.z + dir.z * 9);
      tr.rotation.set(Math.PI / 2, 0, -Math.atan2(dir.x, dir.z));
      scene.add(tr);
      G.bolts.push({ mesh: tr, t: 0 });
      const wd = (2 + 0.5 * w.lvl) * dmgAll();
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        const ex = e.pos.x - P.pos.x, ez = e.pos.z - P.pos.z;
        const along = ex * dir.x + ez * dir.z;
        if (along < 0 || along > 18) continue;
        const perp = Math.abs(ex * dir.z - ez * dir.x);
        if (perp < 0.9) {
          e.hp -= wd;
          e.kb.copy(dir).multiplyScalar(2);
          spark(e.pos.x, e.ty + 1.0, e.pos.z);
          dmgPop(e.pos.x, e.ty, e.pos.z, dmgNum(wd), '#e0f0ff', 1);
          if (e.hp <= 0) killEnemy(e, j);
        }
      }
    },
  },
  kura: {
    ico: 'kura', nm: 'Kura-kamikaze', ds: 'Kura biegnie do wroga i WYBUCHA', max: 5, locked: true,
    lvlDs: l => `wybuch r=${(2.5 + 0.3 * l).toFixed(1)}, co ${(4.5 - 0.35 * l).toFixed(1)} s`,
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const alive = G.enemies.filter(e => !e.dying && e.pos.distanceTo(P.pos) < 16);
      if (!alive.length) return;
      w.t = 4.5 - 0.35 * w.lvl;
      const bb = new Billboard('kura_braz', 1.3);
      bb.play('walk');
      G.kury.push({ bb, pos: P.pos.clone(), t: 0, lvl: w.lvl });
    },
  },
};
const stompLvl = () => { const w = hasWeapon('tupniecie'); return w ? w.lvl : 0; };
const stompRad = l => 3 + l * 0.7 + (P.evo.sejsm ? 2 : 0);
const stompDmg = l => l * 1.5 * (P.evo.sejsm ? 2 : 1) * dmgAll();

// ============================== PASYWY (bufy zbierane kartami) ==============================
const PASSIVES = {
  moc:    { ico: 'fala', nm: 'Moc',     ds: '+15% obrażeń wszystkiego', max: 5 },
  tempo:  { ico: 'pioruny', nm: 'Tempo',   ds: '+12% szybkości ataków',    max: 5 },
  buty:   { ico: 'but', nm: 'Buty dresiarza', ds: '+10% szybkości ruchu', max: 5 },
  magnes: { ico: 'magnes', nm: 'Magnes',  ds: '+35% zasięgu zbierania',   max: 5 },
  krytyk: { ico: 'celownik', nm: 'Krytyk',  ds: '+10% szansy na cios ×3',   max: 5 },
  serce:  { ico: 'serce', nm: 'Serducho', ds: '+1 max serce i pełne leczenie', max: 5 },
  zasieg: { ico: 'celownik', nm: 'Sokoli wzrok', ds: '+20% zasięgu broni',  max: 4 },
  tarcza: { ico: 'tarcza', nm: 'Tarcza brainrota', ds: 'Blokuje 1 trafienie (ładuje się z czasem)', max: 3, locked: true },
};

// ============================== KARTY ULEPSZEŃ ==============================
function cardPool() {
  const pool = [];
  for (const w of P.weapons) {
    const W = WEAPONS[w.key];
    if (w.lvl < W.max) pool.push({
      ico: W.ico, nm: W.nm + ' → poz. ' + (w.lvl + 1), ds: W.lvlDs(w.lvl + 1),
      do: () => { w.lvl++; renderWpns(); },
    });
    else if (W.evoKey && !P.evo[W.evoKey]) pool.push({
      gold: true, ico: W.evoIco, nm: W.evoNm, ds: W.evoDs,
      do: () => { P.evo[W.evoKey] = true; renderWpns(); },
    });
  }
  // NOWE BRONIE NIE MA W KARTACH — znajduje się je w złotych skrzyniach 🎁
  for (const key of Object.keys(PASSIVES)) {
    const S = PASSIVES[key];
    if (S.locked && !META.unlocked[key]) continue;
    const lvl = P.passives[key] || 0;
    if (lvl >= S.max) continue;
    pool.push({
      ico: S.ico, nm: S.nm + (lvl ? ` (${lvl}→${lvl + 1})` : ''), ds: S.ds,
      do: () => {
        P.passives[key] = lvl + 1;
        if (key === 'serce') { P.maxHp++; P.hp = P.maxHp; drawHearts(); }
      },
    });
  }
  return pool;
}

function showCards() {
  G.paused = true;
  const wrap = document.getElementById('cards'); wrap.innerHTML = '';
  const pool = cardPool();
  const picks = [];
  const goldIdx = pool.findIndex(u => u.gold);      // ewolucja ma pierwszeństwo, max 1
  if (goldIdx >= 0) picks.push(pool.splice(goldIdx, 1)[0]);
  for (let i = pool.length - 1; i >= 0; i--) if (pool[i].gold) pool.splice(i, 1);
  while (picks.length < 3 && pool.length) {
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  if (!picks.length) picks.push({ ico: 'moneta', nm: 'Znaleźne', ds: '+20 monet', do: () => { G.runCoins += 20; drawCoins(); } });
  for (const u of picks) {
    const d = document.createElement('div');
    d.className = 'card' + (u.gold ? ' gold' : '');
    d.innerHTML = `<div class="ico">${ico(u.ico, 42)}</div><div class="nm">${u.nm}</div><div class="ds">${u.ds}</div>`;
    d.onclick = () => { u.do(); document.getElementById('cardsOv').style.display = 'none'; G.paused = false; };
    wrap.appendChild(d);
  }
  document.getElementById('cardsOv').style.display = 'flex';
}

// ============================== WYMIENNIK BRONI 🔄 ==============================
function openSwap() {
  G.paused = true;
  const wrap = document.getElementById('swapList'); wrap.innerHTML = '';
  document.getElementById('swapTitle').textContent = 'WYMIENNIK! Którą broń oddajesz?';
  for (const w of P.weapons) {
    const W = WEAPONS[w.key];
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<div class="ico">${ico(W.ico, 42)}</div><div class="nm">${W.nm} poz. ${w.lvl}</div><div class="ds">kliknij, by ODDAĆ</div>`;
    d.onclick = () => pickNewWeapon(w);
    wrap.appendChild(d);
  }
  const skip = document.createElement('div');
  skip.className = 'card';
  skip.innerHTML = `<div class="ico">✋</div><div class="nm">Zostaw jak jest</div><div class="ds">+10 monet pocieszenia</div>`;
  skip.onclick = () => { G.runCoins += 10; drawCoins(); closeSwap(); };
  wrap.appendChild(skip);
  document.getElementById('swapOv').style.display = 'flex';
}
// skrzynia przy WOLNYM slocie: prezent — wybór nowej broni bez oddawania
function openNewWeapon() {
  const opts = Object.keys(WEAPONS).filter(k =>
    !hasWeapon(k) && (!WEAPONS[k].locked || META.unlocked[k]));
  if (!opts.length) { G.runCoins += 15; drawCoins(); return; }
  G.paused = true;
  const wrap = document.getElementById('swapList'); wrap.innerHTML = '';
  document.getElementById('swapTitle').textContent = 'ZNALEZIONA BROŃ! Co bierzesz?';
  for (const key of opts) {
    const W = WEAPONS[key];
    const d = document.createElement('div');
    d.className = 'card gold';
    d.innerHTML = `<div class="ico">${ico(W.ico, 42)}</div><div class="nm">${W.nm}</div><div class="ds">${W.ds}</div>`;
    d.onclick = () => {
      P.weapons.push({ key, lvl: 1, t: 0 });
      renderWpns();
      closeSwap();
    };
    wrap.appendChild(d);
  }
  const skip = document.createElement('div');
  skip.className = 'card';
  skip.innerHTML = `<div class="ico">${ico('wymiana', 42)}</div><div class="nm">Nie, dzięki</div><div class="ds">+10 monet</div>`;
  skip.onclick = () => { G.runCoins += 10; drawCoins(); closeSwap(); };
  wrap.appendChild(skip);
  document.getElementById('swapOv').style.display = 'flex';
}

function pickNewWeapon(oldW) {
  const opts = Object.keys(WEAPONS).filter(k =>
    !hasWeapon(k) && (!WEAPONS[k].locked || META.unlocked[k]));
  if (!opts.length) { G.runCoins += 15; drawCoins(); return closeSwap(); }
  const wrap = document.getElementById('swapList'); wrap.innerHTML = '';
  document.getElementById('swapTitle').textContent = 'Co bierzesz w zamian?';
  for (const key of opts) {
    const W = WEAPONS[key];
    const d = document.createElement('div');
    d.className = 'card gold';
    d.innerHTML = `<div class="ico">${ico(W.ico, 42)}</div><div class="nm">${W.nm}</div><div class="ds">${W.ds}</div>`;
    d.onclick = () => {
      if (oldW.key === 'kosc') { for (const o of G.orbs) scene.remove(o.mesh); G.orbs = []; }
      Object.assign(oldW, { key, lvl: 1, t: 0 });
      renderWpns();
      closeSwap();
    };
    wrap.appendChild(d);
  }
}
function closeSwap() {
  document.getElementById('swapOv').style.display = 'none';
  G.paused = false;
}

// ============================== HUD ==============================
function drawHearts() {
  const hp = Math.max(0, P.hp);
  document.getElementById('hearts').innerHTML = P.maxHp > 12
    ? ico('serce', 18) + ` ${hp} / ${P.maxHp}`      // dużo serc = licznik zamiast rzędu
    : ico('serce', 18).repeat(hp) + ico('sercePuste', 18).repeat(P.maxHp - hp);
}
const fmtTime = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const drawCoins = () => document.getElementById('coins').innerHTML = ico('moneta', 15) + ' ' + G.runCoins;
function renderWpns() {
  document.getElementById('wpns').innerHTML = P.weapons.map(w => {
    const W = WEAPONS[w.key];
    const evo = W.evoKey && P.evo[W.evoKey];
    return `<span class="wp${evo ? ' evo' : ''}">${ico(evo ? W.evoIco : W.ico, 20)}<b>${w.lvl}</b></span>`;
  }).join('') + '<span class="wp empty">' + '·'.repeat(Math.max(0, 3 - P.weapons.length)) + '</span>';
}

// ============================== DEKORACJE (materiały dla chunków) ==============================
let decoMats = null;   // [{mat, aspect, h, forest, weight}]
async function loadDecoMats() {
  const defs = [
    // [plik, wysokość, gdzie: true=las / false=łąka / null=wszędzie, waga]
    // (drzewa są teraz PRAWDZIWE 3D — patrz makeTree)
    ['assets/rock1.png', 1.1, null, 1.2], ['assets/rock2.png', 1.0, null, 1],
    ['assets/bush1.png', 1.2, true, 2.5], ['assets/bush3.png', 1.1, null, 2],
    ['assets/trawa_kepa.png', 0.8, false, 3], ['assets/kwiat1.png', 0.6, false, 3],
    ['assets/kwiat2.png', 0.6, false, 3], ['assets/scarecrow.png', 1.6, false, 0.3],
  ];
  decoMats = [];
  for (const [src, h, forest, weight] of defs) {
    const { mat, w, h: ih } = await flatMat(src);
    decoMats.push({ mat, aspect: w / ih, h, forest, weight });
  }
}

// losowa pozycja na lądzie W POBLIŻU GRACZA (mapa nieskończona)
const _probe = new THREE.Vector3();
function landSpot(rMin = 14, rMax = 85) {
  for (let tries = 0; tries < 60; tries++) {
    const a = Math.random() * Math.PI * 2, r = rMin + Math.sqrt(Math.random()) * (rMax - rMin);
    const x = P.pos.x + Math.sin(a) * r, z = P.pos.z + Math.cos(a) * r;
    if (terrainH(x, z) < WATER_Y + 0.35 && !MAPS[mapKey].indoor) continue;   // nie w wodzie
    _probe.set(x, 0, z);
    solveSolids(_probe, 0.7, 0);
    if (Math.hypot(_probe.x - x, _probe.z - z) > 0.3) continue;              // nie w regale/pniu
    return { x, z };
  }
  return null;
}

// ============================== CHUNKI TERENU (mapa bez końca) ==============================
const CHUNK = 40, CHUNK_SEG = 20, VIEW = 4;   // 9×9 chunków wokół gracza
const chunkMap = new Map();                    // "cx,cz" -> {mesh, deco[], rocks[]}
// deterministyczny generator per chunk
function chunkRng(cx, cz) {
  let s = (hash2(cx, cz) * 4294967296) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function buildChunk(cx, cz) {
  const wx0 = cx * CHUNK, wz0 = cz * CHUNK;
  const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, CHUNK_SEG, CHUNK_SEG);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  const cols = new Float32Array(p.count * 3);
  const norms = new Float32Array(p.count * 3);
  const E = 0.4;
  for (let i = 0; i < p.count; i++) {
    const wx = wx0 + p.getX(i), wz = wz0 + p.getZ(i);
    const h = terrainH(wx, wz);
    p.setY(i, h);
    uv.setXY(i, wx / 5, wz / 5);               // UV globalne = bezszwowa trawa
    // normalne z gradientu szumu (spójne między chunkami — zero szwów cienia)
    const dhx = (terrainH(wx + E, wz) - terrainH(wx - E, wz)) / (2 * E);
    const dhz = (terrainH(wx, wz + E) - terrainH(wx, wz - E)) / (2 * E);
    const il = 1 / Math.hypot(dhx, 1, dhz);
    norms[i * 3] = -dhx * il; norms[i * 3 + 1] = il; norms[i * 3 + 2] = -dhz * il;
    const b = biome(wx, wz);
    let cr, cg, cb;
    if (MAPS[mapKey].indoor) {                   // market: jasna podłoga
      cr = cg = cb = 0.96 + 0.04 * hash2(Math.round(wx), Math.round(wz));
    } else {
      cr = 0.92 + b * 0.34; cg = 1.06; cb = 0.72 - b * 0.16;
      if (h < WATER_Y + 0.5) { cr *= 0.72; cg *= 0.78; cb *= 0.62; }
    }
    cols[i * 3] = cr; cols[i * 3 + 1] = cg; cols[i * 3 + 2] = cb;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
  const mesh = new THREE.Mesh(geo, MAPS[mapKey].indoor ? chunkMatIndoor : chunkMat);
  mesh.position.set(wx0, 0, wz0);
  scene.add(mesh);
  const rng = chunkRng(cx, cz);
  const deco = [], rocks = [], solids = [], spills = [];
  let grass = null;

  if (MAPS[mapKey].indoor) {
    // ======== MARKET: rozlana woda (ŚLISKO!) ========
    const nPlam = rng() < 0.55 ? 1 + Math.floor(rng() * 2) : 0;
    for (let i = 0; i < nPlam; i++) {
      const x = wx0 + (rng() - 0.5) * CHUNK, z = wz0 + (rng() - 0.5) * CHUNK;
      if (Math.abs(x) < 7 && Math.abs(z) < 7) continue;
      const r = 2.2 + rng() * 2.4;
      const m = new THREE.Mesh(blobGeo, spillMat);
      m.scale.set(r * 2, 1, r * 2);
      m.position.set(x, terrainH(x, z) + 0.03, z);
      scene.add(m);
      rocks.push(m);
      spills.push({ x, z, r });
    }
    // ======== MARKET: regały (2 poziomy półek), palety, lady, ciasne alejki ========
    for (let rowZ = -CHUNK / 2 + 4; rowZ < CHUNK / 2; rowZ += 8) {
      for (let sx = -CHUNK / 2 + 5; sx < CHUNK / 2 - 3; sx += 10) {
        const x = wx0 + sx, z = wz0 + rowZ;
        if (Math.abs(x) < 7 && Math.abs(z) < 7) continue;   // czysty spawn
        const g0 = terrainH(x, z);
        const co = rng();
        if (co < 0.22) {
          // PALETA ze skrzynkami — NISKA (0.95), wskoczysz bez podwójnego skoku
          const pal = new THREE.Mesh(shelfGeo, plankMat);
          pal.scale.set(3.4, 0.35, 2.6);
          pal.position.set(x, g0 + 0.175, z);
          scene.add(pal); rocks.push(pal);
          const box = new THREE.Mesh(shelfGeo, crateMat);
          box.scale.set(2.6, 0.6, 2);
          box.position.set(x, g0 + 0.65, z);
          scene.add(box); rocks.push(box);
          solids.push({ x, z, hw: 1.7, hl: 1.3, top: g0 + 0.95 });
        } else if (co < 0.34) {
          // LADA / stoisko chłodnicze — średnia (1.5), przeskok ze skoku z rozbiegu
          const lada = new THREE.Mesh(shelfGeo, coolerMat);
          lada.scale.set(6, 1.5, 2.2);
          lada.position.set(x, g0 + 0.75, z);
          scene.add(lada); rocks.push(lada);
          solids.push({ x, z, hw: 3, hl: 1.1, top: g0 + 1.5 });
        } else if (co < 0.62) {
          continue;                               // przerwa = przejście w alejce
        } else {
          // REGAŁ: korpus + 2 wystające półki (bryły) = lepiej czytelny
          const len = 7;
          const m = new THREE.Mesh(shelfGeo, shelfMat);
          m.scale.set(len, SHELF_H, 1.6);
          m.position.set(x, g0 + SHELF_H / 2, z);
          scene.add(m); rocks.push(m);
          for (const [hy, dz] of [[0.8, 1.05], [1.6, 1.05], [0.8, -1.05], [1.6, -1.05]]) {
            const p2 = new THREE.Mesh(shelfGeo, plankMat);
            p2.scale.set(len, 0.14, 0.6);
            p2.position.set(x, g0 + hy, z + dz);
            scene.add(p2); rocks.push(p2);
          }
          const top = new THREE.Mesh(shelfGeo, plankMat);   // blat na górze
          top.scale.set(len + 0.3, 0.16, 2.1);
          top.position.set(x, g0 + SHELF_H + 0.08, z);
          scene.add(top); rocks.push(top);
          solids.push({ x, z, hw: len / 2, hl: 1.1, top: g0 + SHELF_H + 0.16 });
        }
      }
    }
  } else {
    // ======== ŁĄKI: struktury do wskakiwania (proste bryły) ========
    const rr = rng();
    if (rr < 0.30) {
      // STOSY SKRZYŃ — schodki 0.9 / 1.7 (wskakujesz bez podwójnego skoku)
      const x = wx0 + (rng() - 0.5) * CHUNK * 0.7, z = wz0 + (rng() - 0.5) * CHUNK * 0.7;
      if (terrainH(x, z) > WATER_Y + 0.4) {
        const g0 = terrainH(x, z);
        const uklad = [[0, 0, 0.9], [1.5, 0.3, 1.7], [0.7, 1.6, 1.3]];
        for (const [ox, oz, h] of uklad) {
          const m = new THREE.Mesh(shelfGeo, crateMat);
          m.scale.set(1.4, h, 1.4);
          m.position.set(x + ox, g0 + h / 2, z + oz);
          m.rotation.y = rng() * 0.5;
          scene.add(m); rocks.push(m);
          solids.push({ x: x + ox, z: z + oz, hw: 0.7, hl: 0.7, top: g0 + h });
        }
      }
    } else if (rr < 0.48) {
      // DREWNIANY PODEST NA PALACH — wysoki taras (2.1), wejście po skrzyni obok
      const x = wx0 + (rng() - 0.5) * CHUNK * 0.7, z = wz0 + (rng() - 0.5) * CHUNK * 0.7;
      if (terrainH(x, z) > WATER_Y + 0.4) {
        const g0 = terrainH(x, z), H = 2.1;
        const deck = new THREE.Mesh(shelfGeo, plankMat);
        deck.scale.set(5.4, 0.35, 5.4);
        deck.position.set(x, g0 + H, z);
        scene.add(deck); rocks.push(deck);
        solids.push({ x, z, hw: 2.7, hl: 2.7, top: g0 + H + 0.18 });
        for (const [px, pz] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]) {
          const p2 = new THREE.Mesh(shelfGeo, plankMat);
          p2.scale.set(0.4, H, 0.4);
          p2.position.set(x + px, g0 + H / 2, z + pz);
          scene.add(p2); rocks.push(p2);
        }
        // stopień wejściowy
        const st = new THREE.Mesh(shelfGeo, crateMat);
        st.scale.set(1.6, 1.1, 1.6);
        st.position.set(x + 3.6, g0 + 0.55, z);
        scene.add(st); rocks.push(st);
        solids.push({ x: x + 3.6, z, hw: 0.8, hl: 0.8, top: g0 + 1.1 });
      }
    } else if (rr < 0.60) {
      // KAMIENNE SCHODY na wzniesienie (3 stopnie)
      const x = wx0 + (rng() - 0.5) * CHUNK * 0.7, z = wz0 + (rng() - 0.5) * CHUNK * 0.7;
      if (terrainH(x, z) > WATER_Y + 0.4) {
        const g0 = terrainH(x, z);
        for (let s2 = 0; s2 < 3; s2++) {
          const h = 0.6 + s2 * 0.6;
          const m = new THREE.Mesh(shelfGeo, stoneMat);
          m.scale.set(3, h, 1.5);
          m.position.set(x, g0 + h / 2, z + s2 * 1.5);
          scene.add(m); rocks.push(m);
          solids.push({ x, z: z + s2 * 1.5, hw: 1.5, hl: 0.75, top: g0 + h });
        }
      }
    }
    // ======== ŁĄKI: DRZEWA 3D + trawa + dekoracje ========
    const las = biome(wx0, wz0) <= 0.45;
    const nTrees = las ? 4 + Math.floor(rng() * 4) : (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < nTrees; i++) {
      const x = wx0 + (rng() - 0.5) * CHUNK, z = wz0 + (rng() - 0.5) * CHUNK;
      if (terrainH(x, z) < WATER_Y + 0.5) continue;
      solids.push(makeTree(x, z, rng, rocks));
    }
    const nDeco = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < nDeco; i++) {
      const x = wx0 + (rng() - 0.5) * CHUNK, z = wz0 + (rng() - 0.5) * CHUNK;
      if (terrainH(x, z) < WATER_Y + 0.3) continue;
      const lasTu = biome(x, z) <= 0.45;
      const cands = decoMats.filter(d => d.forest === null || d.forest === lasTu);
      let tw = 0; for (const d of cands) tw += d.weight;
      let roll = rng() * tw, pick = cands[0];
      for (const d of cands) { roll -= d.weight; if (roll <= 0) { pick = d; break; } }
      const m = new THREE.Mesh(unitGeo, pick.mat);
      m.position.set(x, terrainH(x, z) - 0.04, z);
      m.scale.set(pick.h * pick.aspect, pick.h, 1);
      m.rotation.y = camYaw;
      scene.add(m);
      deco.push(m);
    }
    if (rng() < 0.4) {                            // głaz 3D
      const x = wx0 + (rng() - 0.5) * CHUNK, z = wz0 + (rng() - 0.5) * CHUNK;
      if (terrainH(x, z) > WATER_Y + 0.3) {
        const s = 0.5 + rng() * 1.6;
        const m = new THREE.Mesh(rockGeo, rockMat);
        m.scale.set(s * (1 + rng() * .5), s * (0.55 + rng() * .3), s);
        m.position.set(x, terrainH(x, z) + s * 0.2, z);
        m.rotation.y = rng() * 7;
        scene.add(m);
        rocks.push(m);
        // niski głaz — do przeskoczenia!
        solids.push({ c: 1, x, z, r: s * 0.9, top: terrainH(x, z) + s * 0.75 });
      }
    }
  }
  return { mesh, deco, rocks, solids, spills, grass };
}

// czy punkt jest na rozlanej wodzie (market) — wtedy ŚLIZG
function onSpill(x, z) {
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
    const ch = chunkMap.get(gx + ',' + gz);
    if (!ch || !ch.spills.length) continue;
    for (const s of ch.spills) {
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < s.r * s.r) return true;
    }
  }
  return false;
}

// ---- kolizje ze SOLIDAMI (regały-AABB, pnie/głazy-okręgi) ----
// zwraca wysokość NAJWYŻSZEJ przeszkody, która zablokowała (0 = nic) — do wspinaczki
function solveSolids(pos, r, feetY) {
  let blockTop = 0;
  const cx = Math.floor(pos.x / CHUNK), cz = Math.floor(pos.z / CHUNK);
  for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
    const ch = chunkMap.get(gx + ',' + gz);
    if (!ch || !ch.solids.length) continue;
    for (const s of ch.solids) {
      if (feetY > s.top - 0.25) continue;         // jesteś NAD przeszkodą
      if (s.c) {
        const dx = pos.x - s.x, dz = pos.z - s.z, rr = s.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), p = (rr - d) / d;
          pos.x += dx * p; pos.z += dz * p;
          if (s.top < 90) blockTop = Math.max(blockTop, s.top);
        }
      } else {
        const dx = pos.x - s.x, dz = pos.z - s.z;
        const ox = s.hw + r - Math.abs(dx), oz = s.hl + r - Math.abs(dz);
        if (ox > 0 && oz > 0) {
          if (ox < oz) pos.x += (dx > 0 ? ox : -ox);
          else pos.z += (dz > 0 ? oz : -oz);
          blockTop = Math.max(blockTop, s.top);
        }
      }
    }
  }
  return blockTop;
}
// wysokość podparcia: teren LUB szczyt regału, na którym stoisz
function supportY(x, z, feetY) {
  let g = terrainH(x, z);
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
    const ch = chunkMap.get(gx + ',' + gz);
    if (!ch || !ch.solids.length) continue;
    for (const s of ch.solids) {
      if (s.c || s.top > feetY + 0.25) continue;
      if (Math.abs(x - s.x) < s.hw && Math.abs(z - s.z) < s.hl) g = Math.max(g, s.top);
    }
  }
  return g;
}
let chunkMat = null, chunkMatIndoor = null;   // tworzone w boot
let lastCC = null;
function rebuildWorld() {
  for (const [, ch] of chunkMap) {
    scene.remove(ch.mesh); ch.mesh.geometry.dispose();
    for (const m of ch.deco) scene.remove(m);
    for (const m of ch.rocks) scene.remove(m);
    if (ch.grass) { scene.remove(ch.grass); ch.grass.dispose(); }
  }
  chunkMap.clear();
  lastCC = null;
  ensureChunks();
}
function setMap(key) {
  mapKey = key;
  const M = MAPS[key];
  scene.background.setHex(M.sky);
  scene.fog.color.setHex(M.sky);
  scene.fog.near = M.fog[0]; scene.fog.far = M.fog[1];
  water.visible = M.water;
  for (const c of clouds) c.m.visible = !M.indoor;
  rebuildWorld();
  grassCenter.set(1e9, 1e9);
  updateGrassField();
  for (const c of chests) placeChest(c);
  for (const t of totems) placeTotem(t);
}
function ensureChunks() {
  const pcx = Math.round(P.pos.x / CHUNK), pcz = Math.round(P.pos.z / CHUNK);
  const cc = pcx + ',' + pcz;
  if (cc === lastCC) return;
  lastCC = cc;
  const keep = new Set();
  for (let cx = pcx - VIEW; cx <= pcx + VIEW; cx++)
    for (let cz = pcz - VIEW; cz <= pcz + VIEW; cz++) {
      const key = cx + ',' + cz;
      keep.add(key);
      if (!chunkMap.has(key)) chunkMap.set(key, buildChunk(cx, cz));
    }
  for (const [key, ch] of chunkMap) {
    if (keep.has(key)) continue;
    scene.remove(ch.mesh); ch.mesh.geometry.dispose();
    for (const m of ch.deco) scene.remove(m);
    for (const m of ch.rocks) scene.remove(m);
    if (ch.grass) { scene.remove(ch.grass); ch.grass.dispose(); }
    chunkMap.delete(key);
  }
}

// ============================== SKRZYNIE ==============================
const chests = [];        // {mesh, pos, opened, t}
let chestMats = null;     // 4 klatki chest0..3
function placeChest(c) {
  const s = landSpot(16, 70) || { x: P.pos.x + 20, z: P.pos.z + 20 };
  c.pos.set(s.x, 0, s.z);
  c.opened = false; c.t = 0;
  c.mesh.material = chestMats[0];
  c.mesh.position.set(s.x, terrainH(s.x, s.z) - 0.02, s.z);
}
function spawnChests(n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(unitGeo, chestMats[0]);
    m.scale.set(1.1, 1.1, 1);
    scene.add(m);
    const c = { mesh: m, pos: new THREE.Vector3(), opened: false, t: 0 };
    placeChest(c);
    chests.push(c);
  }
}
function chestReward(c) {
  const roll = Math.random();
  if (roll < 0.14 && !hasDjump()) {   // 🦘🦘 PODWÓJNY SKOK (na ten bieg)
    P.runDjump = true;
    toastBuff('PODWÓJNY SKOK do końca biegu!');
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2500);
  } else if (roll < 0.62) {          // monety
    for (let k = 0; k < 5 + Math.floor(Math.random() * 6); k++)
      G.coins.push(makeCoin(c.pos.x + (Math.random() - .5) * 2, c.pos.z + (Math.random() - .5) * 2));
  } else if (roll < 0.87) {          // kości XP
    for (let k = 0; k < 6; k++)
      G.gems.push(makeGem(c.pos.x + (Math.random() - .5) * 2, c.pos.z + (Math.random() - .5) * 2, 1));
  } else {                           // wielki magnes: zasysa WSZYSTKO
    G.vacuum = 2.0;
    toastBuff('MAGNES! Wszystko leci do Ciebie');
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2000);
  }
}

// ============================== ZŁOTA SKRZYNIA Z BRONIĄ 🎁 ==============================
// Jedna naraz; po zabraniu następna pojawia się po chwili. Strzałka w HUD prowadzi do niej.
const wchest = { mesh: null, ring: null, pos: new THREE.Vector3(), active: false, t: 0, wait: 0 };
function spawnWeaponChest() {
  const s = landSpot(22, 60);
  if (!s) { wchest.wait = 2; return; }
  wchest.pos.set(s.x, 0, s.z);
  wchest.mesh.position.set(s.x, terrainH(s.x, s.z) - 0.02, s.z);
  wchest.mesh.material = chestMats[0];
  wchest.ring.position.set(s.x, terrainH(s.x, s.z) + 0.07, s.z);
  wchest.mesh.visible = wchest.ring.visible = true;
  wchest.active = true;
  toastBuff('NOWA BROŃ czeka w złotej skrzyni — idź za strzałką!');
  setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2200);
}
function updateWeaponChest(dt) {
  const arrow = document.getElementById('wArrow');
  if (!wchest.active) {
    arrow.style.display = 'none';
    wchest.wait -= dt;
    if (wchest.wait <= 0) spawnWeaponChest();
    return;
  }
  wchest.t += dt;
  wchest.mesh.rotation.y = camYaw;
  wchest.mesh.position.y = terrainH(wchest.pos.x, wchest.pos.z) + 0.1 + Math.sin(wchest.t * 2.2) * 0.12;
  wchest.ring.scale.setScalar(3.4 + Math.sin(wchest.t * 3) * 0.5);
  const d = wchest.pos.distanceTo(P.pos);
  if (d < 1.6) {                                   // ZEBRANA
    wchest.active = false;
    wchest.mesh.visible = wchest.ring.visible = false;
    wchest.wait = 25 + Math.random() * 20;
    G.shake = Math.max(G.shake, 0.2);
    novaRing(wchest.pos.x, wchest.pos.z, 3);
    META.st.chests++; saveMeta();
    if (P.weapons.length < 3) openNewWeapon(); else openSwap();
    arrow.style.display = 'none';
    return;
  }
  // strzałka: rzut kierunku do skrzyni na osie EKRANU (kamera ma yaw = camYaw)
  const dx = wchest.pos.x - P.pos.x, dz = wchest.pos.z - P.pos.z;
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);       // przód kamery
  const rx = -fz, rz = fx;                                     // prawo kamery
  const sx = dx * rx + dz * rz;                                // ekran: w prawo
  const sy = dx * fx + dz * fz;                                // ekran: w górę
  const ar = arrow.querySelector('.ar');
  if (!ar.style.backgroundImage) ar.style.backgroundImage = `url(${icon('strzalka', 4)})`;
  arrow.style.display = 'flex';
  ar.style.transform = `rotate(${Math.atan2(-sy, sx)}rad)`;    // ikona wskazuje w prawo przy 0°
  arrow.querySelector('.dist').textContent = Math.round(d) + ' m';
}

// ============================== TOTEMY BUFFÓW ==============================
const totems = [];        // {mesh, ring, pos, cd, mat}
const BUFFS = [
  { key: 'dmg',  label: '💥 PODWÓJNE OBRAŻENIA', dur: 18 },
  { key: 'szyb', label: '👟 PRZYSPIESZENIE',     dur: 18 },
  { key: 'slow', label: '🥶 WROGOWIE ZWOLNILI',  dur: 14 },
];
function spawnTotems(n, colMat) {
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(120,220,255,0.9)'; g.lineWidth = 6;
    g.beginPath(); g.arc(32, 32, 24, 0, 7); g.stroke();
    return new THREE.CanvasTexture(c);
  })();
  for (let i = 0; i < n; i++) {
    const mat = colMat.mat.clone(); mat.transparent = true;
    const m = new THREE.Mesh(unitGeo, mat);
    m.scale.set(2.2 * (colMat.w / colMat.h), 2.2, 1);
    scene.add(m);
    const ring = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false }));
    ring.scale.set(3, 1, 3);
    scene.add(ring);
    const t = { mesh: m, ring, pos: new THREE.Vector3(), cd: 0, mat };
    placeTotem(t);
    totems.push(t);
  }
}
function placeTotem(t) {
  const s = landSpot(18, 70) || { x: P.pos.x - 20, z: P.pos.z - 20 };
  t.pos.set(s.x, 0, s.z);
  t.mesh.position.set(s.x, terrainH(s.x, s.z) - 0.02, s.z);
  t.ring.position.set(s.x, terrainH(s.x, s.z) + 0.06, s.z);
  t.cd = 0; t.mat.opacity = 1; t.ring.visible = true;
}
function toastBuff(txt) {
  const el = document.getElementById('buff');
  el.textContent = txt;
  el.style.opacity = 1;
}

// ============================== FALA UDERZENIOWA (nova) ==============================
let ringMat = null;
function novaRing(x, z, rMax) {
  const m = new THREE.Mesh(blobGeo, ringMat.clone());
  m.position.set(x, terrainH(x, z) + 0.1, z);
  scene.add(m);
  G.rings.push({ mesh: m, t: 0, rMax });
}
function nova(x, z, r, dmg) {
  novaRing(x, z, r);
  for (let j = G.enemies.length - 1; j >= 0; j--) {
    const e = G.enemies[j];
    if (e.dying) continue;
    const dx = e.pos.x - x, dz = e.pos.z - z;
    if (dx * dx + dz * dz < r * r) {
      e.hp -= dmg;
      e.kb.set(dx, 0, dz).normalize().multiplyScalar(4.5);
      spark(e.pos.x, e.ty + 1.0, e.pos.z);
      dmgPop(e.pos.x, e.ty, e.pos.z, dmgNum(dmg), '#ffb56e', 0.85);
      if (e.hp <= 0) killEnemy(e, j);
    }
  }
}

// ============================== PĘTLA ==============================
let playerBB = null;
const clock = new THREE.Clock();

function update(dt) {
  if (G.dying) { updateDeath(dt); return; }
  G.time += dt;
  document.getElementById('timer').textContent = fmtTime(G.time);
  // komunikat o wzroście poziomu zagrożenia
  const tr = tier();
  if (tr !== G.tier) {
    G.tier = tr;
    document.getElementById('tier').innerHTML = ico('ostrzezenie', 14) + ' ZAGROŻENIE ' + tr;
    if (tr > 1) {
      toastBuff('POZIOM ZAGROŻENIA ' + tr + (dmgScale() > 1 ? ' — wrogowie biją mocniej!' : ''));
      setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2200);
      G.shake = Math.max(G.shake, 0.25);
    }
  }

  // ---- obrót kamery klawiszami ----
  if (keys.KeyQ) camYaw += 2.2 * dt;
  if (keys.KeyE) camYaw -= 2.2 * dt;

  // ---- ruch gracza (względem kamery) ----
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (touch.on) { mx = touch.vx; mz = touch.vy; }
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  // przód = od kamery; prawo = prostopadle
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const rx = -fz, rz = fx;
  const wx = fx * -mz + rx * mx, wz = fz * -mz + rz * mx;
  const inWater = !P.airborne && terrainH(P.pos.x, P.pos.z) < WATER_Y - 0.04;
  let spd = speedF() * (inWater ? 0.6 : 1);
  if (G.buff.key === 'szyb') spd *= 1.45;
  // strome zbocze (mesa): pieszo wolno POD GÓRĘ, ale skokiem normalnie
  if (ml > 0.05 && !P.airborne) {
    const inv = 1 / Math.max(ml, 0.001);
    const ahead = terrainH(P.pos.x + wx * inv * 0.7, P.pos.z + wz * inv * 0.7) - terrainH(P.pos.x, P.pos.z);
    if (ahead > 0.35) spd *= 0.5;
  }
  // ŚLISKO na rozlanej wodzie (market): bezwładność zamiast sterowania 1:1
  const slip = !P.airborne && MAPS[mapKey].indoor && onSpill(P.pos.x, P.pos.z);
  const grip = slip ? 1.2 : 18;                    // jak szybko prędkość goni wejście
  P.vx += (wx * spd - P.vx) * Math.min(1, grip * dt);
  P.vz += (wz * spd - P.vz) * Math.min(1, grip * dt);
  P.pos.x += P.vx * dt;
  P.pos.z += P.vz * dt;                  // mapa bez końca — zero klamry
  solveSolids(P.pos, 0.4, P.y);          // regały/pnie/głazy odpychają
  const pTy = terrainH(P.pos.x, P.pos.z);
  ensureChunks();
  updateGrassField();
  water.position.set(P.pos.x, WATER_Y, P.pos.z);

  // ---- fizyka pionowa (spadanie z krawędzi, skok, lądowanie na regale) ----
  const ground = supportY(P.pos.x, P.pos.z, P.y);
  if (P.airborne) {
    P.vy -= 22 * dt;
    P.y += P.vy * dt;
    if (P.vy <= 0 && P.y <= ground) {                    // lądowanie
      P.y = ground; P.vy = 0; P.airborne = false; P.usedDouble = false;
      if (stompLvl() > 0) nova(P.pos.x, P.pos.z, stompRad(stompLvl()), stompDmg(stompLvl()));
    }
  } else {
    if (ground < P.y - 0.5) { P.airborne = true; P.vy = 0; }   // zszedłeś z krawędzi → SPADASZ
    else P.y = ground;                                          // podążanie za terenem
  }
  if (P.shieldCd > 0) P.shieldCd -= dt;

  const moving = ml > 0.05;
  if (moving) playerBB.facing = faceAngle(wx, wz);
  if (P.airborne) playerBB.play('jump', false);
  else playerBB.play(moving ? 'run' : 'idle');
  if (P.iframes > 0) P.iframes -= dt;
  playerBB.mesh.visible = true;
  playerBB.update(dt, P.pos, P.y, ground);
  updateHitFlash();

  // ---- spawner: krzywa trudności (1 min ~lekko, 4 min = ~4× więcej naraz) ----
  const min = G.time / 60;
  G.spawnT -= dt;
  const interval = Math.max(0.13, 1.3 / (1 + min * 0.55));      // 1.3 s → 0.28 s w 4. min
  const CAP = 500;
  if (G.spawnT <= 0 && G.enemies.length < CAP) {
    G.spawnT = interval;
    const batch = Math.round(1 + min * 1.6);                     // 4. min: ~7 na raz
    for (let b = 0; b < batch && G.enemies.length < CAP; b++) {
      const roll = Math.random();
      let type = 'dresiarz';
      if (G.time > 40 && roll < 0.32) type = 'zul';
      if (G.time > 75 && roll > 0.72) type = 'wegielek';
      if (G.time > 130 && roll > 0.88) type = 'dzik';
      spawnEnemy(type);
    }
  }
  // FALA OKRĄŻAJĄCA co 30 s od 1. minuty: pierścień wrogów ZE WSZYSTKICH STRON
  if (G.time > 60 && G.time > G.ringAt) {
    G.ringAt = G.time + 30;
    const n = Math.round(10 + min * 5);
    const typy = G.time > 130 ? ['dresiarz', 'zul', 'wegielek', 'dzik'] : ['dresiarz', 'zul', 'wegielek'];
    for (let k = 0; k < n && G.enemies.length < CAP; k++) {
      spawnEnemy(typy[Math.floor(Math.random() * typy.length)], (k / n) * Math.PI * 2);
    }
    toastBuff('FALA OKRĄŻAJĄCA — biegną ze wszystkich stron!');
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 1600);
  }
  if (G.time > G.bossAt) {                                       // bossy co 2 min, coraz więcej
    G.bossAt += 120;
    const ile = 1 + Math.floor(G.time / 300);
    for (let b = 0; b < ile; b++) spawnEnemy('boss');
  }

  // ---- separacja wrogów ----
  const grid = new Map(), CELL = 1.4;
  for (const e of G.enemies) {
    if (e.dying) continue;
    const key = Math.floor(e.pos.x / CELL) * 4096 + Math.floor(e.pos.z / CELL);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(e);
  }
  for (const e of G.enemies) {
    if (e.dying) continue;
    const cx = Math.floor(e.pos.x / CELL), cz = Math.floor(e.pos.z / CELL);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const cell = grid.get(gx * 4096 + gz); if (!cell) continue;
      for (const o of cell) {
        if (o === e) continue;
        const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
        const d2 = dx * dx + dz * dz, min = 0.85;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) / d * 0.5 * dt * 14;
          e.pos.x += dx * push; e.pos.z += dz * push;
        }
      }
    }
  }

  // ---- wrogowie ----
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.dying) {
      e.bb.update(dt, e.pos, e.ty);
      if (e.bb.done) { e.bb.dispose(); if (e.ring) scene.remove(e.ring); G.enemies.splice(i, 1); }
      continue;
    }
    const to = P.pos.clone().sub(e.pos).setY(0);
    const d = to.length(); to.normalize();
    let es = e.T.speed * (e.elite ? 0.85 : 1) * spdScale();
    if (e.ty < WATER_Y - 0.04) es *= 0.7;               // woda spowalnia też ich
    if (G.buff.key === 'slow') es *= 0.6;
    // wspinaczka na mesę = powolutku (chwila oddechu dla gracza na górce)
    const wspin = terrainH(e.pos.x + to.x * 0.7, e.pos.z + to.z * 0.7) - e.ty;
    if (wspin > 0.18) es *= 0.35;
    if (MAPS[mapKey].indoor && onSpill(e.pos.x, e.pos.z)) es *= 0.55;   // im też ślisko
    e.pos.addScaledVector(to, es * dt);
    e.pos.add(e.kb.clone().multiplyScalar(dt * 8));
    e.kb.multiplyScalar(Math.max(0, 1 - dt * 10));

    // ---- kolizja, SKOKI i WSPINACZKA na półki ----
    const blockTop = solveSolids(e.pos, 0.35, e.ty);
    const eGround = supportY(e.pos.x, e.pos.z, e.ty);
    e.jumpCd -= dt;
    if (e.vy !== 0) {                                    // w locie (po skoku)
      e.vy -= 22 * dt;
      e.ty += e.vy * dt;
      if (e.vy < 0 && e.ty <= eGround) { e.ty = eGround; e.vy = 0; }
    } else if (blockTop > e.ty + 0.1 && P.y > e.ty + 0.6) {
      // przeszkoda + gracz wyżej: podskocz (niska) albo mozolnie się wspinaj (wysoka)
      if (blockTop - e.ty < 1.5 && e.jumpCd <= 0) { e.vy = 6.6; e.jumpCd = 1.6; }
      else { e.ty = Math.min(blockTop + 0.06, e.ty + 0.95 * dt); e.climbing = true; }
    } else {
      e.climbing = false;
      // co jakiś czas podskakują z radości (i przeskakują drobne nierówności)
      if (e.jumpCd <= 0 && d < 22 && Math.random() < 0.35 * dt) { e.vy = 5.4; e.jumpCd = 2.5 + Math.random() * 3; }
      if (eGround < e.ty - 0.05) e.ty = Math.max(eGround, e.ty - 9 * dt);  // schodzenie/spadanie
      else e.ty = eGround;
    }
    e.bb.facing = faceAngle(to.x, to.z);
    e.orbCd -= dt;
    e.bb.update(dt, e.pos, e.ty);
    if (e.ring) e.ring.position.set(e.pos.x, e.ty + 0.06, e.pos.z);
    if (d < 0.9 + (e.T.boss ? 0.8 : 0) && P.iframes <= 0 && P.y - e.ty < 1.0) {
      const tarczaLvl = P.passives.tarcza || 0;
      if (tarczaLvl > 0 && P.shieldCd <= 0) {           // 🛡️ tarcza zjada cios
        P.shieldCd = [30, 24, 18][tarczaLvl - 1];
        P.iframes = 0.9;
        toastBuff('TARCZA zablokowała cios!');
        setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 1500);
        novaRing(P.pos.x, P.pos.z, 2);
      } else {
        P.hp -= e.T.dmg * (e.T.boss ? 1 : dmgScale()); P.iframes = 0.9;
        drawHearts();
        G.shake = 0.35;
        const v = document.getElementById('vign');
        v.style.opacity = 1; setTimeout(() => v.style.opacity = 0, 180);
        if (P.hp <= 0) return startDeath();
      }
    }
  }

  // ---- BRONIE: tick każdej posiadanej ----
  for (const w of P.weapons) WEAPONS[w.key].tick(w, dt);

  // ---- pociski kul ----
  const boomQ = [];                      // wybuchy meteorów PO pętli (bezpieczne indeksy)
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i];
    s.mesh.position.addScaledVector(s.dir, 16 * dt);
    s.mesh.position.y = terrainH(s.mesh.position.x, s.mesh.position.z) + 1.0;
    s.life -= dt;
    let dead = s.life <= 0;
    if (!dead) for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying || s.hit.has(e)) continue;
      const rr = e.T.boss ? 1.4 : 0.75;
      const dx = s.mesh.position.x - e.pos.x, dz = s.mesh.position.z - e.pos.z;
      if (dx * dx + dz * dz < rr * rr) {
        let dmg = 1 * dmgAll();
        const crit = Math.random() < critC();
        if (crit) { dmg *= 3; spark(e.pos.x, e.ty + 1.5, e.pos.z); }
        e.hp -= dmg; s.hit.add(e);
        e.kb.copy(s.dir).multiplyScalar(crit ? 2.6 : 1.6);
        spark(e.pos.x, e.ty + 1.1, e.pos.z);
        dmgPop(e.pos.x, e.ty, e.pos.z, dmgNum(dmg), crit ? '#ff9d3f' : '#ffe066', crit ? 1.5 : 1);
        if (P.evo.meteor) boomQ.push({ x: e.pos.x, z: e.pos.z, dmg: dmg * 0.6 });
        if (e.hp <= 0) killEnemy(e, j);
        if (s.pierce-- <= 0) { dead = true; break; }
      }
    }
    if (dead) { scene.remove(s.mesh); G.shots.splice(i, 1); }
  }
  for (const b of boomQ) nova(b.x, b.z, 1.8, b.dmg);

  // ---- butelki żula (lot łukiem → wybuch) ----
  for (let i = G.lobs.length - 1; i >= 0; i--) {
    const L = G.lobs[i]; L.t += dt;
    const k = Math.min(1, L.t / L.dur);
    const x = L.from.x + (L.to.x - L.from.x) * k, z = L.from.z + (L.to.z - L.from.z) * k;
    L.mesh.position.set(x, terrainH(x, z) + 1 + Math.sin(k * Math.PI) * 3.2, z);
    L.mesh.rotation.set(0, camYaw, L.t * 9);
    if (k >= 1) {
      scene.remove(L.mesh); G.lobs.splice(i, 1);
      nova(x, z, 2 + 0.3 * L.lvl, (2 + 0.6 * L.lvl) * dmgAll());
      G.shake = Math.max(G.shake, 0.1);
    }
  }

  // ---- radio-bumerangi (tam i z powrotem) ----
  for (let i = G.boomers.length - 1; i >= 0; i--) {
    const B = G.boomers[i]; B.t += dt;
    const k = B.t / B.dur;
    if (k >= 1) { scene.remove(B.mesh); G.boomers.splice(i, 1); continue; }
    const r = Math.sin(k * Math.PI) * B.dist;          // wylot i powrót
    const x = P.pos.x + B.dir.x * r, z = P.pos.z + B.dir.z * r;
    B.mesh.position.set(x, terrainH(x, z) + 1.0, z);
    B.mesh.rotation.set(0, camYaw, B.t * 12);
    if (k > 0.55 && B.hit.size) B.hit.clear();          // w drodze powrotnej bije ponownie
    for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying || B.hit.has(e)) continue;
      const dx = x - e.pos.x, dz = z - e.pos.z;
      if (dx * dx + dz * dz < 1.1) {
        B.hit.add(e);
        const rd = (2 + 0.5 * B.lvl) * dmgAll();
        e.hp -= rd;
        e.kb.set(dx, 0, dz).normalize().multiplyScalar(-2.4);
        spark(e.pos.x, e.ty + 1.0, e.pos.z);
        dmgPop(e.pos.x, e.ty, e.pos.z, dmgNum(rd), '#d9b3ff', 1);
        if (e.hp <= 0) killEnemy(e, j);
      }
    }
  }

  // ---- kury-kamikaze 🐔💥 ----
  for (let i = G.kury.length - 1; i >= 0; i--) {
    const K = G.kury[i]; K.t += dt;
    let near = null, nd = 1e9;
    for (const e of G.enemies) {
      if (e.dying) continue;
      const d = e.pos.distanceTo(K.pos);
      if (d < nd) { nd = d; near = e; }
    }
    if (near) {
      const dir = near.pos.clone().sub(K.pos).setY(0).normalize();
      K.pos.addScaledVector(dir, 5.2 * dt);
      K.bb.facing = faceAngle(dir.x, dir.z);
    }
    K.bb.update(dt, K.pos, terrainH(K.pos.x, K.pos.z));
    if ((near && nd < 1.0) || K.t > 4) {                  // BUM!
      nova(K.pos.x, K.pos.z, 2.5 + 0.3 * K.lvl, (3 + 0.7 * K.lvl) * dmgAll());
      dmgPop(K.pos.x, terrainH(K.pos.x, K.pos.z) + 0.6, K.pos.z, 'KO-KO-BUM!', '#ffd75e', 1.5);
      G.shake = Math.max(G.shake, 0.15);
      K.bb.dispose(); G.kury.splice(i, 1);
    }
  }

  // ---- pioruny (efekt wizualny) ----
  for (let i = G.bolts.length - 1; i >= 0; i--) {
    const b = G.bolts[i]; b.t += dt;
    b.mesh.material.opacity = Math.max(0, 1 - b.t * 6);
    if (b.t > 0.18) { scene.remove(b.mesh); G.bolts.splice(i, 1); }
  }

  // ---- iskry ----
  for (let i = G.sparks.length - 1; i >= 0; i--) {
    const s = G.sparks[i]; s.t += dt;
    s.mesh.scale.setScalar(1 + s.t * 6);
    s.mesh.material.opacity = Math.max(0, 1 - s.t * 5);
    if (s.t > 0.2) { scene.remove(s.mesh); G.sparks.splice(i, 1); }
  }

  // ---- skrzynie ----
  for (const c of chests) {
    c.mesh.rotation.y = camYaw;
    if (!c.opened) {
      const cd = c.pos.distanceTo(P.pos);
      if (cd < 1.3) {
        c.opened = true; c.t = 0;
        chestReward(c);
        G.shake = Math.max(G.shake, 0.15);
      } else if (cd > 95) placeChest(c);      // mapa nieskończona — skrzynia goni gracza
    } else {
      c.t += dt;
      const f = Math.min(3, Math.floor(c.t * 8));
      c.mesh.material = chestMats[f];
      if (c.t > 45) placeChest(c);            // respawn gdzie indziej
    }
  }

  updateWeaponChest(dt);

  // ---- totemy ----
  for (const t of totems) {
    t.mesh.rotation.y = camYaw;
    if (t.pos.distanceTo(P.pos) > 110) placeTotem(t);   // przenosiny bliżej gracza
    if (t.cd > 0) {
      t.cd -= dt;
      t.mat.opacity = 0.35;
      t.ring.visible = false;
      if (t.cd <= 0) { t.mat.opacity = 1; t.ring.visible = true; }
    } else {
      t.ring.scale.setScalar(3 + Math.sin(G.time * 3) * 0.4);
      if (t.pos.distanceTo(P.pos) < 1.6) {
        const b = BUFFS[Math.floor(Math.random() * BUFFS.length)];
        G.buff = { key: b.key, t: b.dur };
        toastBuff(b.label);
        t.cd = 45;
        novaRing(t.pos.x, t.pos.z, 4);
      }
    }
  }

  // ---- aktywny buff ----
  if (G.buff.key) {
    G.buff.t -= dt;
    if (G.buff.t <= 0) { G.buff = { key: null, t: 0 }; document.getElementById('buff').style.opacity = 0; }
  }
  if (G.vacuum > 0) G.vacuum -= dt;

  // ---- pierścienie fal ----
  for (let i = G.rings.length - 1; i >= 0; i--) {
    const r = G.rings[i]; r.t += dt;
    const k = r.t / 0.45;
    r.mesh.scale.set(r.rMax * 2 * k, 1, r.rMax * 2 * k);
    r.mesh.material.opacity = Math.max(0, 1 - k);
    if (k >= 1) { scene.remove(r.mesh); G.rings.splice(i, 1); }
  }

  // ---- dropy (kości XP + monety) ----
  const mag = G.vacuum > 0 ? 999 : magnetF();
  for (let i = G.gems.length - 1; i >= 0; i--) {
    const g = G.gems[i]; g.t += dt;
    const d = g.pos.distanceTo(P.pos);
    if (d < mag) g.pos.addScaledVector(P.pos.clone().sub(g.pos).normalize(), Math.max(14 - d, 8) * dt);
    g.mesh.position.set(g.pos.x, terrainH(g.pos.x, g.pos.z) + 0.25 + Math.sin(g.t * 4) * 0.12, g.pos.z);
    g.mesh.rotation.set(0, camYaw, g.t * 2);
    if (d < 0.7) {
      P.xp += g.val;
      scene.remove(g.mesh); G.gems.splice(i, 1);
      if (P.xp >= P.xpNeed) {
        P.xp -= P.xpNeed; P.lvl++;
        P.xpNeed = Math.round(5 + P.lvl * 3.2);
        document.getElementById('lvl').textContent = 'POZIOM ' + P.lvl;
        showCards();
      }
      document.getElementById('xpbar').style.width = (P.xp / P.xpNeed * 100) + '%';
    }
  }
  for (let i = G.coins.length - 1; i >= 0; i--) {
    const c = G.coins[i]; c.t += dt;
    const d = c.pos.distanceTo(P.pos);
    if (d < mag) c.pos.addScaledVector(P.pos.clone().sub(c.pos).normalize(), Math.max(14 - d, 8) * dt);
    c.mesh.position.set(c.pos.x, terrainH(c.pos.x, c.pos.z) + 0.3 + Math.sin(c.t * 5) * 0.1, c.pos.z);
    c.mesh.rotation.y = camYaw;
    if (d < 0.7) {
      G.runCoins++; drawCoins();
      scene.remove(c.mesh); G.coins.splice(i, 1);
    }
  }
  // serca ❤️ (zbierane tylko gdy brakuje HP)
  for (let i = G.hps.length - 1; i >= 0; i--) {
    const h = G.hps[i]; h.t += dt;
    const d = h.pos.distanceTo(P.pos);
    if (d < mag && P.hp < P.maxHp) h.pos.addScaledVector(P.pos.clone().sub(h.pos).normalize(), Math.max(14 - d, 8) * dt);
    h.mesh.position.set(h.pos.x, terrainH(h.pos.x, h.pos.z) + 0.35 + Math.sin(h.t * 4) * 0.15, h.pos.z);
    h.mesh.rotation.y = camYaw;
    if (d < 0.8 && P.hp < P.maxHp) {
      P.hp++; drawHearts();
      dmgPop(P.pos.x, pTy + 0.6, P.pos.z, '+SERCE', '#ff8080', 1.4);
      scene.remove(h.mesh); G.hps.splice(i, 1);
    }
  }
  // wyskakujące napisy (obrażenia / KILL)
  for (let i = G.pops.length - 1; i >= 0; i--) {
    const p = G.pops[i]; p.t += dt;
    p.mesh.position.y += 1.8 * dt;
    p.mesh.rotation.y = camYaw;
    p.mesh.material.opacity = Math.max(0, 1 - p.t / 0.75);
    if (p.t > 0.75) { scene.remove(p.mesh); p.mesh.material.dispose(); G.pops.splice(i, 1); }
  }

  // ---- kamera (orbituje wg camYaw; nie wbija się w teren) ----
  const cx = P.pos.x + Math.sin(camYaw) * CAM_DIST, cz = P.pos.z + Math.cos(camYaw) * CAM_DIST;
  let cy = P.y + CAM_H;
  cy = Math.max(cy, terrainH(cx, cz) + 2.2);
  camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 8));
  if (G.shake > 0) {
    G.shake -= dt;
    camera.position.x += (Math.random() - .5) * G.shake * 0.7;
    camera.position.y += (Math.random() - .5) * G.shake * 0.7;
  }
  camera.lookAt(P.pos.x + fx * 2.2, P.y + 1.3, P.pos.z + fz * 2.2);

  // ---- dekoracje twarzą do kamery ----
  for (const ch of chunkMap.values())
    for (const m of ch.deco) m.rotation.y = camYaw;

  windU.value = G.time;

  // ---- chmury ----
  for (const c of clouds) {
    c.m.position.x += c.v * dt;
    if (c.m.position.x > P.pos.x + 150) c.m.position.x = P.pos.x - 150;
    c.m.quaternion.copy(camera.quaternion);
  }
}

// ŚMIERĆ: slow-motion, zbliżenie, postać pada — dopiero potem ekran końca
function startDeath() {
  if (G.dying) return;
  G.dying = true; G.deathT = 0;
  G.shake = 0.9;
  document.getElementById('vign').style.opacity = 1;
  dmgPop(P.pos.x, P.y + 1.2, P.pos.z, 'KONIEC!', '#ff4a4a', 2.4);
  novaRing(P.pos.x, P.pos.z, 6);
  if (hitFlash) hitFlash.visible = false;
}
function updateDeath(dt) {
  G.deathT += dt;
  const t = G.deathT;
  // postać przewraca się na bok i zapada w ziemię
  playerBB.mesh.rotation.z = Math.min(Math.PI / 2, t * 3.2);
  playerBB.mesh.position.y = P.y - Math.min(0.55, t * 0.5);
  // kamera zjeżdża blisko i niżej
  const k = Math.min(1, t / 1.4);
  const dist = CAM_DIST * (1 - 0.55 * k), hgt = CAM_H * (1 - 0.45 * k);
  const cx = P.pos.x + Math.sin(camYaw) * dist, cz = P.pos.z + Math.cos(camYaw) * dist;
  camera.position.set(cx, P.y + hgt + 0.4, cz);
  camera.lookAt(P.pos.x, P.y + 0.5, P.pos.z);
  if (G.shake > 0) {
    G.shake -= dt;
    camera.position.x += (Math.random() - .5) * G.shake;
    camera.position.y += (Math.random() - .5) * G.shake;
  }
  // wrogowie zwalniają i rozchodzą się (slow-motion)
  for (const e of G.enemies) {
    const away = e.pos.clone().sub(P.pos).setY(0).normalize().multiplyScalar(1.2 * dt);
    e.pos.add(away);
    e.bb.update(dt * 0.25, e.pos, e.ty);
  }
  for (let i = G.pops.length - 1; i >= 0; i--) {
    const p = G.pops[i]; p.t += dt * 0.4;
    p.mesh.position.y += 0.9 * dt;
    p.mesh.rotation.y = camYaw;
    p.mesh.material.opacity = Math.max(0, 1 - p.t / 1.4);
    if (p.t > 1.4) { scene.remove(p.mesh); p.mesh.material.dispose(); G.pops.splice(i, 1); }
  }
  if (t > 1.8) { G.dying = false; gameOver(); }
}

function gameOver() {
  G.over = true; G.running = false;
  document.getElementById('vign').style.opacity = 0;
  playerBB.mesh.rotation.z = 0;
  META.coins += G.runCoins;
  const s = META.st;
  s.kills += G.kills; s.runs++; s.time += G.time; s.coins += G.runCoins; s.lvl += P.lvl - 1;
  if (G.time > s.best) s.best = G.time;
  if (G.kills > s.bestKills) s.bestKills = G.kills;
  saveMeta(); renderShop(); renderStats();
  document.getElementById('overStats').innerHTML =
    `Przetrwano: <b>${fmtTime(G.time)}</b> · Pokonano: <b>${G.kills}</b> · Poziom: <b>${P.lvl}</b><br>` +
    `Zebrano: <b>${ico('moneta',15)} ${G.runCoins}</b> (łącznie ${ico('moneta',15)} ${META.coins})` +
    (G.time >= s.best ? '<br><b style="color:#ffd75e">' + ico('puchar',18) + ' NOWY REKORD CZASU!</b>' : '');
  document.getElementById('overOv').style.display = 'flex';
  document.getElementById('wArrow').style.display = 'none';
}
// ---- PAUZA ----
function togglePause(on) {
  if (!G.running) return;
  G.paused = on;
  document.getElementById('pauseOv').style.display = on ? 'flex' : 'none';
  if (on) {
    document.getElementById('pauseStats').innerHTML =
      `<p>Czas: <b>${fmtTime(G.time)}</b> · Zabici: <b>${G.kills}</b> · Poziom: <b>${P.lvl}</b> · ${ico('moneta',15)} <b>${G.runCoins}</b></p>` +
      `<p>Postać: <b>${CHARS[charKey].nm}</b> · Mapa: <b>${MAPS[mapKey].nm}</b></p>` +
      `<p>Bronie: ${P.weapons.map(w => ico(WEAPONS[w.key].ico, 18) + ' ' + WEAPONS[w.key].nm + ' ' + w.lvl).join(' · ')}</p>`;
  }
}
function setPlayerChar(key) {
  charKey = key;
  const C = CHARS[key];
  if (playerBB) playerBB.dispose();
  playerBB = new Billboard(C.char, C.scale);
  playerBB.update(0, P.pos, P.y || terrainH(0, 0), P.y || terrainH(0, 0));
}

function clearWorld() {
  for (const e of G.enemies) { e.bb.dispose(); if (e.ring) scene.remove(e.ring); }
  for (const g of G.gems) scene.remove(g.mesh);
  for (const c of G.coins) scene.remove(c.mesh);
  for (const s of G.shots) scene.remove(s.mesh);
  for (const o of G.orbs) scene.remove(o.mesh);
  for (const s of G.sparks) scene.remove(s.mesh);
  for (const r of G.rings) scene.remove(r.mesh);
  for (const l of G.lobs) scene.remove(l.mesh);
  for (const b of G.boomers) scene.remove(b.mesh);
  for (const b of G.bolts) scene.remove(b.mesh);
  for (const p of G.pops) { scene.remove(p.mesh); p.mesh.material.dispose(); }
  for (const h of G.hps) scene.remove(h.mesh);
  for (const k of G.kury) k.bb.dispose();
  G.enemies = []; G.gems = []; G.coins = []; G.shots = []; G.orbs = []; G.sparks = []; G.rings = [];
  G.lobs = []; G.boomers = []; G.bolts = []; G.pops = []; G.hps = []; G.kury = [];
  G.streak = 0; G.streakT = -9;
  G.vacuum = 0; G.buff = { key: null, t: 0 };
  document.getElementById('buff').style.opacity = 0;
  for (const c of chests) placeChest(c);
  for (const t of totems) { t.cd = 0; t.mat.opacity = 1; t.ring.visible = true; }
}

function newGame() {
  clearWorld();
  resetStats();
  Object.assign(G, { running: true, over: false, paused: false, dying: false, deathT: 0, time: 0, kills: 0, runCoins: 0, spawnT: 0.5, bossAt: 120, ringAt: 60, tier: 0, shake: 0 });
  P.pos.set(0, 0, 0);
  P.y = terrainH(0, 0);
  wchest.active = false; wchest.wait = 8;
  if (wchest.mesh) wchest.mesh.visible = wchest.ring.visible = false;
  document.getElementById('lvl').textContent = 'POZIOM 1';
  document.getElementById('kills').innerHTML = ico('czaszka', 15) + ' 0';
  document.getElementById('tier').innerHTML = ico('ostrzezenie', 14) + ' ZAGROŻENIE 1';
  document.getElementById('xpbar').style.width = '0%';
  drawHearts(); drawCoins(); renderWpns();
  camYaw = 0;
  camera.position.set(0, terrainH(0, 0) + CAM_H, CAM_DIST);
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.running && !G.paused) {
    try { update(dt); } catch (err) { console.error(err); }
  }
  renderer.render(scene, camera);
}

// ============================== START ==============================
(async function boot() {
  const bone = await flatMat('assets/bone.png');
  boneMatCache = bone.mat; boneAspect = bone.w / bone.h;
  coinMat = new THREE.MeshBasicMaterial({ map: coinTexture(), transparent: true, depthWrite: false });
  ringMat = new THREE.MeshBasicMaterial({ map: ringTexture('rgba(255,235,150,0.95)'), transparent: true, depthWrite: false });
  eliteRingMat = new THREE.MeshBasicMaterial({ map: ringTexture('rgba(255,200,40,0.9)'), transparent: true, depthWrite: false });
  chestMats = [];
  for (let i = 0; i < 4; i++) chestMats.push((await flatMat('assets/chest' + i + '.png')).mat);
  // złota skrzynia z bronią (ta sama grafika, złota poświata + pierścień)
  wchest.mesh = new THREE.Mesh(unitGeo, chestMats[0]);
  wchest.mesh.scale.set(1.5, 1.5, 1);
  wchest.mesh.visible = false;
  scene.add(wchest.mesh);
  wchest.ring = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({
    map: ringTexture('rgba(255,215,94,0.95)'), transparent: true, depthWrite: false }));
  wchest.ring.scale.setScalar(3.4);
  wchest.ring.visible = false;
  scene.add(wchest.ring);
  const colImg = await flatMat('assets/column1.png');
  bottleMat = (await flatMat('assets/bottle.png')).mat;
  radioMat = (await flatMat('assets/radio.png')).mat;
  heartMat = emojiMat('❤️');
  await buildChar('kasia', ['idle', 'run', 'jump']);
  await buildChar('dresiarz', ['run', 'death']);
  await buildChar('enemy', ['walk', 'death']);
  await buildChar('wegielek', ['run']);
  await buildChar('dzik', ['run']);
  await buildChar('doctorAngry', ['run']);
  await buildChar('kura_braz', ['walk']);
  // postacie grywalne (potrzebne też do portretów w menu)
  await buildChar('piotr', ['idle', 'run', 'jump']);
  await buildChar('przyjaciel', ['idle', 'run']);
  await buildChar('rudeusz', ['idle', 'run']);
  await loadDecoMats();
  chunkMat = new THREE.MeshLambertMaterial({ map: grassTexC, vertexColors: true });
  chunkMatIndoor = new THREE.MeshLambertMaterial({ map: floorTexC, vertexColors: true });
  shelfMat = new THREE.MeshLambertMaterial({ map: shelfTexture() });
  coolerMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#9fc6d8', '#5d8ba3', 5) });
  spillMat = new THREE.MeshBasicMaterial({ map: spillTexture(), transparent: true, depthWrite: false });
  grassMat = addWind(new THREE.MeshLambertMaterial({ map: bladeTexture(), alphaTest: 0.45,
    side: THREE.DoubleSide, transparent: false }), 0.22, 2.1);
  bladeMat = makeBladeMaterial();
  initGrassField();
  crateMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#b98a4e', '#7d5a2e', 4) });
  plankMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#a9793f', '#6d4a22', 6) });
  stoneMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#9a9c96', '#6f7169', 3) });

  charKey = META.chars[META.lastChar] ? META.lastChar : 'kasia';
  mapKey = MAPS[META.lastMap] ? META.lastMap : 'laki';
  P.pos = new THREE.Vector3(0, 0, 0);
  P.y = terrainH(0, 0);
  playerBB = new Billboard(CHARS[charKey].char, CHARS[charKey].scale);
  initHitFlash();
  resetStats();          // P.pos musi istnieć PRZED chunkami i skrzyniami
  setMap(mapKey);        // buduje świat + rozstawia skrzynie/totemy
  spawnChests(9);
  spawnTotems(3, colImg);
  drawHearts();
  renderShop(); renderMaps(); renderChars(); renderStats(); renderPick();
  fitCamera();
  camera.position.set(0, terrainH(0, 0) + CAM_H, CAM_DIST);
  camera.lookAt(0, 1.3, -2.2);
  playerBB.update(0, P.pos, P.y, P.y);
  loop();

  const menu = document.getElementById('startOv');
  document.getElementById('btnStart').onclick = () => { menu.style.display = 'none'; newGame(); };
  document.getElementById('btnRetry').onclick = () => {
    document.getElementById('overOv').style.display = 'none';
    newGame();
  };
  document.getElementById('btnMenu').onclick = () => {
    document.getElementById('overOv').style.display = 'none';
    menu.style.display = 'flex';
  };
  // ikonki w zakładkach + przycisku pauzy
  document.querySelectorAll('.tab[data-ico]').forEach(t =>
    t.insertAdjacentHTML('afterbegin', ico(t.dataset.ico, 16) + ' '));
  document.getElementById('pauseBtn').innerHTML = ico('pauza', 16);
  // zakładki menu
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('sel'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('on'));
    t.classList.add('sel');
    document.getElementById('p-' + t.dataset.tab).classList.add('on');
    if (t.dataset.tab === 'staty') renderStats();
    if (t.dataset.tab === 'sklep') renderShop();
  });
  // pauza
  document.getElementById('pauseBtn').onclick = () => togglePause(!G.paused);
  document.getElementById('btnResume').onclick = () => togglePause(false);
  document.getElementById('btnQuit').onclick = () => {
    togglePause(false);
    G.running = false; clearWorld();
    document.getElementById('wArrow').style.display = 'none';
    menu.style.display = 'flex';
    renderStats(); renderShop();
  };
  addEventListener('keydown', e => {
    if (e.code === 'Escape' && G.running &&
        document.getElementById('cardsOv').style.display !== 'flex' &&
        document.getElementById('swapOv').style.display !== 'flex') togglePause(!G.paused);
  });
  // debug (usunąć przed wydaniem); step = ręczne krokowanie pętli,
  // bo podgląd dławi rAF bez fokusa (pułapka znana z Rudeusza)
  window.HORDA = {
    G, P, terrainH, chests, totems, openSwap, renderWpns, chunkMap, supportY, onSpill, setMap,
    wchest, META, CHARS, MAPS, setPlayerChar, togglePause, get charKey() { return charKey; },
    get grass() { return grassField; },
    step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) if (G.running && !G.paused) update(dt);
      renderer.render(scene, camera);
    },
  };
})();
