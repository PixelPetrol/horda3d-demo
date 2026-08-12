// HORDA 3D v4 — teren 3D + kamera za plecami + meta-progresja (monety/sklep)
import * as THREE from './lib/three.module.js';
import { SPRITEDATA } from './spritedata.js?v=5';
import { icon, ico } from './icons.js?v=1';
import { AUDIO } from './audio.js?v=2';            // muzyka wg fazy gry + kwestie głosowe + efekty

// ============================== USTAWIENIA ==============================
const PX2U = 1 / 55;
const WORLD_R = 130;
// kamera: na wąskim/niskim ekranie (telefon poziomo) mocno bliżej postaci
let CAM_DIST = 9.2, CAM_H = 6.4;
function fitCamera() {
  const wys = innerHeight, poziomo = innerWidth > innerHeight;
  if (poziomo && wys <= 560) { CAM_DIST = 3.6; CAM_H = 4.3; camera.fov = 60; }   // telefon poziomo
  else if (wys <= 560) { CAM_DIST = 5.0; CAM_H = 5.4; camera.fov = 58; }
  else if (innerWidth <= 520) { CAM_DIST = 5.5; CAM_H = 5.8; camera.fov = 58; }  // telefon pionowo
  else { CAM_DIST = 6.8; CAM_H = 7.0; camera.fov = 58; }                          // desktop
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
  // ===== VEGGIE FAMIGLIA (statystyki wg biblii postaci v1.1) =====
  carrotello: { nm: 'Carrotello Squattello', ds: 'Marchewino Dresino — szybki, ogromny magnes. Starter.',
                char: 'carrotello_squattello', price: 0, spd: 1.15, hp: 0, dmg: 0.9, mag: 1.3, scale: 1.22 },
  beetino:    { nm: 'Beetino Bouncerino', ds: 'Buraczino Betonino — czołg z bramki. Wolny, ale twardy.',
                char: 'beetino_bouncerino', price: 250, spd: 0.85, hp: 3, dmg: 1.1, mag: 0.9, scale: 1.32 },
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
let charKey = 'carrotello';

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

scene.add(new THREE.HemisphereLight(0xd8ecff, 0x3e6b2f, 0.85));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.35);
sun.position.set(45, 70, 25);
scene.add(sun);
scene.add(sun.target);

// ---- PRAWDZIWE CIENIE (shadow map słońca, ramka podąża za graczem) ----
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0014;
sun.shadow.normalBias = 0.03;
{
  const d = 42;                                    // obszar objęty cieniami wokół gracza
  const sc = sun.shadow.camera;
  sc.left = -d; sc.right = d; sc.top = d; sc.bottom = -d;
  sc.near = 1; sc.far = 220;
  sc.updateProjectionMatrix();
}
const SUN_OFF = new THREE.Vector3(38, 60, 26);     // kierunek padania promieni
function updateSun(x, z) {
  sun.position.set(x + SUN_OFF.x, SUN_OFF.y, z + SUN_OFF.z);
  sun.target.position.set(x, 0, z);
  sun.target.updateMatrixWorld();
}

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
  g.fillStyle = '#9ad557'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = Math.random() < .5 ? '#93cf50' : (Math.random() < .7 ? '#a3e05e' : '#8bc74a');
    g.fillRect(x, y, 2, 2);
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 8 + Math.random() * 16;
    g.fillStyle = 'rgba(90,150,60,0.10)';
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
// WODA (stylizowana, Genshin/BotW): pasy głębi + animowana piana przy brzegu
// + fale w vertex shaderze + iskierki. Research: Roystan „Toon Water" (piana
// z różnicy głębi + próg na szumie), Alisavakis „Stylized water" (3 pasy koloru,
// linie piany z sin() biegnące do brzegu), Codrops R3F (bufor głębi za drogi →
// liczymy głębię z terenu), forum three.js „Unlit water shader with foam".
// U NAS nie ma depth-textury sceny — mamy za to `terrainH(x,z)` w JS, więc
// wypiekamy MAPĘ GŁĘBI wokół gracza do DataTexture i czytamy ją PER PIKSEL
// (siatka wierzchołków ma ~3 j. na segment — o wiele za mało na ostry brzeg).
const waterCamU = { value: new THREE.Vector2() };
const WD_RES = 144, WD_SIZE = 340;                 // rozdz. i zasięg mapy głębi (2.36 j./texel)
const wdData = new Uint8Array(WD_RES * WD_RES);
const waterDepthTex = new THREE.DataTexture(wdData, WD_RES, WD_RES, THREE.RedFormat);
waterDepthTex.minFilter = waterDepthTex.magFilter = THREE.LinearFilter;
waterDepthTex.wrapS = waterDepthTex.wrapT = THREE.ClampToEdgeWrapping;
waterDepthTex.unpackAlignment = 1;
waterDepthTex.needsUpdate = true;
const waterDepthU = { value: waterDepthTex };
const wdCenterU = { value: new THREE.Vector2(1e9, 1e9) };
// bezszwowy szum (ten sam pnoise co chmury) — piana, iskierki, faktura pasów
function waterNoiseTexture() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const OKT = [[4, 0.52], [8, 0.28], [16, 0.20]];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const [per, w] of OKT) v += pnoise(x / S * per, y / S * per, per) * w;
    const b = Math.max(0, Math.min(255, v * 255)) | 0;
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const waterNzU = { value: waterNoiseTexture() };
// 3 j. na segment (było 6.2) — dopiero teraz widać długie fale
const waterGeo = new THREE.PlaneGeometry(420, 420, 140, 140);
waterGeo.rotateX(-Math.PI / 2);
const waterMat = new THREE.MeshLambertMaterial({
  color: 0xffffff, transparent: true, opacity: 1 });
waterMat.onBeforeCompile = sh => {
  sh.uniforms.uTime = windU;
  sh.uniforms.uCam = waterCamU;
  sh.uniforms.uWDep = waterDepthU;
  sh.uniforms.uWDepC = wdCenterU;
  sh.uniforms.uWNz = waterNzU;
  // dekoder mapy głębi: 0..1 → -4..+4 j. (>0 = ile wody nad dnem)
  const DEK = `
    float wDepth(vec2 wp){
      vec2 duv = (wp - uWDepC) * ${(1 / WD_SIZE).toFixed(7)} + 0.5;
      float ins = smoothstep(0.0, 0.04, duv.x) * (1.0 - smoothstep(0.96, 1.0, duv.x))
                * smoothstep(0.0, 0.04, duv.y) * (1.0 - smoothstep(0.96, 1.0, duv.y));
      return mix(3.5, (texture2D(uWDep, duv).r - 0.5) * 8.0, ins);
    }`;
  sh.vertexShader =
    'uniform float uTime;uniform vec2 uCam;uniform sampler2D uWDep;uniform vec2 uWDepC;\n' +
    'varying vec3 vWP;varying float vFala;\n' + DEK + '\n' +
    sh.vertexShader.replace('#include <begin_vertex>',
    `#include <begin_vertex>
     vec2 wp = transformed.xz + uCam;                       // pozycja w świecie
     // fale GASNĄ przy brzegu (inaczej tafla przebija plażę)
     float tlum = smoothstep(0.05, 1.10, wDepth(wp));
     float f = ( sin(wp.x * 0.21 + uTime * 1.05) * 0.085
               + sin(wp.y * 0.26 - uTime * 0.85) * 0.075
               + sin((wp.x * 0.62 + wp.y * 0.78) * 0.135 + uTime * 0.55) * 0.10 ) * tlum;
     transformed.y += f;
     vWP = vec3(wp.x, 0.0, wp.y);
     vFala = f;`);
  sh.fragmentShader =
    'uniform float uTime;uniform sampler2D uWDep;uniform vec2 uWDepC;uniform sampler2D uWNz;\n' +
    'varying vec3 vWP;varying float vFala;float gPiana;float gIsk;\n' + DEK + '\n' +
    sh.fragmentShader.replace('#include <color_fragment>',
    `#include <color_fragment>
     vec2 wp = vWP.xz;
     float dep = wDepth(wp);                                // głębia pod pikselem
     float t = uTime;
     // ODLEGŁOŚĆ OD BRZEGU W METRACH: głębia / spadek dna (gradient z mapy głębi).
     // Bez tego piana ma szerokość w „metrach głębi" i na stromym brzegu jest nitką,
     // a na płaskim zalewa pół jeziora. Roystan liczy to samo z bufora głębi.
     const float DS = 2.4;                                  // krok = 1 texel mapy
     float gx = wDepth(wp + vec2(DS, 0.0)) - wDepth(wp - vec2(DS, 0.0));
     float gz = wDepth(wp + vec2(0.0, DS)) - wDepth(wp - vec2(0.0, DS));
     float nach = max(length(vec2(gx, gz)) / (2.0 * DS), 0.012);
     float brzeg = dep / nach;                              // ~metry od linii brzegu

     float nz  = texture2D(uWNz, wp * 0.075 + vec2( t * 0.0080, -t * 0.0056)).r;
     float nz2 = texture2D(uWNz, wp * 0.020 + vec2(-t * 0.0030,  t * 0.0021)).r;
     float nz3 = texture2D(uWNz, wp * 0.290 + vec2( t * 0.0140,  t * 0.0090)).r;  // drobna faktura

     // --- PASY GŁĘBI (3 płaskie kolory; jeziora mają max ~1.7 j. głębi) ---
     float dw = dep + (nz2 - 0.5) * 0.26 + sin(wp.x * 0.26 + wp.y * 0.19 + t * 0.5) * 0.06;
     vec3 col = mix(vec3(0.30, 0.82, 0.68), vec3(0.035, 0.36, 0.56), smoothstep(0.40, 0.58, dw));
     col = mix(col, vec3(0.012, 0.13, 0.33), smoothstep(0.94, 1.14, dw));

     // --- PIANA PRZY BRZEGU: wąski mokry rąbek + rzadka, poszarpana kipiel ---
     float szer = 1.05 + (nz - 0.5) * 1.3 + (nz3 - 0.5) * 0.6;  // ~0.1 .. 2.0 m, poszarpana
     float linie = sin((brzeg / max(szer, 0.5) - t * 0.42) * 12.6);
     float kipiel = (1.0 - smoothstep(szer * 0.30, szer, brzeg))     // zanik w głąb
                  * smoothstep(-0.15, 0.75, linie)                    // pasma biegnące do brzegu
                  * smoothstep(0.28, 0.62, nz3) * 0.85;               // dziury = kipiel, nie płyta
     float rabek = (1.0 - smoothstep(0.10, 0.50, brzeg)) * 0.92;      // stały mokry rąbek ~0.5 m
     float piana = clamp(max(rabek, kipiel), 0.0, 1.0) * step(0.004, dep);
     // wąski jaśniejszy „mokry" pas tuż za pianą (bez tego brzeg tnie jak nożem)
     col = mix(col, vec3(0.45, 0.90, 0.80), (1.0 - smoothstep(szer * 0.9, szer * 1.7, brzeg)) * 0.34);
     col = mix(col, vec3(1.0, 1.0, 1.0), piana);

     // --- GRZBIETY FAL (delikatne smugi na szczytach) + ISKIERKI ---
     float grzb = smoothstep(0.175, 0.225, vFala) * smoothstep(0.2, 0.7, dep) * (1.0 - piana);
     col = mix(col, vec3(0.72, 0.95, 1.0), grzb * 0.24);
     float s1 = texture2D(uWNz, wp * 0.62 + vec2( t * 0.030, -t * 0.019)).r;
     float s2 = texture2D(uWNz, wp * 0.71 + vec2(-t * 0.024,  t * 0.033)).r;
     float isk = smoothstep(0.99, 1.10, s1 * s2 * 2.2) * smoothstep(0.2, 0.7, dep) * (1.0 - piana);

     gPiana = piana; gIsk = isk;
     diffuseColor.rgb = col;
     // płycizna półprzezroczysta (widać dno), głębia gęsta, piana kryje
     diffuseColor.a = max(mix(0.74, 0.96, smoothstep(0.0, 0.9, dep)), piana * 0.96);`)
    // piana i iskierki DOŚWIETLONE — inaczej cień drzewa/chmury robi z piany szarość
    .replace('#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
     totalEmissiveRadiance += vec3(0.30, 0.34, 0.36) * gPiana + vec3(0.85, 0.95, 1.0) * gIsk;`);
};
const water = new THREE.Mesh(waterGeo, waterMat);
water.position.y = WATER_Y;
water.receiveShadow = true;
scene.add(water);
// wypiekanie MAPY GŁĘBI (WATER_Y - terrainH) wokół gracza; ~2 ms na 144²,
// więc przebudowa dopiero po 18 j. ruchu (mapa ma 170 j. zapasu w każdą stronę)
function updateWaterColors() {
  const ox = water.position.x, oz = water.position.z;
  if (Math.abs(ox - wdCenterU.value.x) < 18 && Math.abs(oz - wdCenterU.value.y) < 18) return;
  const st = WD_SIZE / WD_RES;
  const x0 = ox - WD_SIZE / 2 + st * 0.5, z0 = oz - WD_SIZE / 2 + st * 0.5;
  let i = 0;
  for (let j = 0; j < WD_RES; j++) {
    const wz = z0 + j * st;
    for (let k = 0; k < WD_RES; k++) {
      const g = (WATER_Y - terrainH(x0 + k * st, wz)) * 0.125 + 0.5;   // -4..4 → 0..1
      wdData[i++] = g < 0 ? 0 : g > 1 ? 255 : (g * 255) | 0;
    }
  }
  waterDepthTex.needsUpdate = true;
  wdCenterU.value.set(ox, oz);
}
updateWaterColors();                 // żeby pierwsza klatka nie była biała

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

// ============================== WIATR + CIENIE CHMUR ==============================
const windU = { value: 0 };

// Cienie chmur: proceduralna tekstura plam przesuwana po świecie (projekcja z góry).
// Wpinana do materiałów terenu/trawy/postaci — przyciemnia fragmenty wg pozycji XZ.
// OKRESOWY szum (kafelkuje się bezszwowo) — lattice wrapowany modulo `per`
function pnoise(x, z, per) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const w = i => ((i % per) + per) % per;
  const a = hash2(w(ix), w(iz)), b = hash2(w(ix + 1), w(iz));
  const c2 = hash2(w(ix), w(iz + 1)), d = hash2(w(ix + 1), w(iz + 1));
  return a + (b - a) * sx + (c2 - a) * sz + (a - b - c2 + d) * sx * sz;
}
// MAPA SZUMU (fBm, 4 oktawy) → realnie poszarpane kształty chmur zamiast kółek
function cloudShadowTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const OKT = [[3, 0.52], [6, 0.26], [12, 0.14], [24, 0.08]];   // okres, waga
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const [per, waga] of OKT) v += pnoise(x / S * per, y / S * per, per) * waga;
      // ostre krawędzie: próg + wąska strefa przejścia
      const cien = Math.max(0, Math.min(1, (v - 0.46) * 6.5 + 0.5));
      const b = cien * 255;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const cloudShadowU = { value: null };
const cloudOffU = { value: new THREE.Vector2() };
const CLOUD_SCALE = 0.016, CLOUD_SPD = 9.0;          // skala plam i prędkość dryfu

// wpina cienie chmur do dowolnego materiału (po pozycji w świecie)
function addCloudShadow(mat) {
  const stary = mat.onBeforeCompile;
  mat.onBeforeCompile = sh => {
    if (stary) stary(sh);
    sh.uniforms.uCloud = cloudShadowU;
    sh.uniforms.uCloudOff = cloudOffU;
    // UWAGA: przy instancingu three.js mnoży przez instanceMatrix dopiero w project_vertex,
    // więc trzeba to zrobić RĘCZNIE — inaczej wszystkie instancje mają tę samą pozycję
    // i cała trawa ciemnieje naraz (albo wcale).
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <fog_vertex>',
      `#include <fog_vertex>
       vec4 _wp = vec4(transformed, 1.0);
       #ifdef USE_INSTANCING
         _wp = instanceMatrix * _wp;
       #endif
       vWPos = (modelMatrix * _wp).xyz;`);
    sh.fragmentShader = 'uniform sampler2D uCloud;uniform vec2 uCloudOff;varying vec3 vWPos;\n' +
      sh.fragmentShader.replace('#include <dithering_fragment>',
      `#include <dithering_fragment>
       float cs = texture2D(uCloud, vWPos.xz * ${CLOUD_SCALE.toFixed(5)} + uCloudOff).r;
       gl_FragColor.rgb *= mix(0.48, 1.06, cs);`);
  };
  mat.needsUpdate = true;
  return mat;
}
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

// ---- KARTY LIŚCI: kępka liści na quadzie z alfą (pixel art) ----
function leafCardTexture(odcien) {
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // POJEDYNCZY LIŚĆ: spiczasty, z ząbkowaną krawędzią i nerwem (nie owalna plamka)
  const SK = 96 / 64;                                       // skala wzgl. dawnego 64 px
  const listek = (x0, y0, dl0, kat, kolor, jasny) => {
    const x = x0 * SK, y = y0 * SK, dl = dl0 * SK;
    g.save(); g.translate(x, y); g.rotate(kat);
    const sz = dl * 0.52;
    g.fillStyle = kolor;
    g.beginPath();
    g.moveTo(0, -dl / 2);                                  // czubek
    for (let i = 1; i <= 6; i++) {                         // prawa krawędź z ząbkami
      const t = i / 6, zab = (i % 2 ? 1.0 : 0.78);
      g.lineTo(Math.sin(t * Math.PI) * sz * zab, -dl / 2 + t * dl);
    }
    for (let i = 5; i >= 0; i--) {                         // lewa krawędź
      const t = i / 6, zab = (i % 2 ? 1.0 : 0.78);
      g.lineTo(-Math.sin(t * Math.PI) * sz * zab, -dl / 2 + t * dl);
    }
    g.closePath(); g.fill();
    g.strokeStyle = jasny; g.lineWidth = 1;                // nerw główny
    g.beginPath(); g.moveTo(0, -dl / 2 + 1); g.lineTo(0, dl / 2 - 1); g.stroke();
    g.restore();
  };
  // kępka: listki rozłożone promieniście, ciemniejsze w środku
  const listki = 22;
  for (let i = 0; i < listki; i++) {
    const a = (i / listki) * Math.PI * 2 + Math.random() * 0.5;
    const r = 6 + Math.random() * 18;
    const x = 32 + Math.cos(a) * r, y = 34 + Math.sin(a) * r * 0.8;
    const j = Math.random();
    const kol = j < 0.32 ? odcien[0] : (j < 0.72 ? odcien[1] : odcien[2]);
    listek(x, y, 13 + Math.random() * 9, a + Math.PI / 2 + (Math.random() - .5), kol, odcien[2]);
  }
  for (let i = 0; i < 8; i++) {                            // wypełnienie środka
    const a = Math.random() * Math.PI * 2, r = Math.random() * 9;
    listek(32 + Math.cos(a) * r, 34 + Math.sin(a) * r, 12 + Math.random() * 6,
      Math.random() * Math.PI * 2, odcien[0], odcien[1]);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let leafCardMats = null;
const leafCardGeo = new THREE.PlaneGeometry(1, 1);
// biały atrybut koloru — przy vertexColors:true jego brak = mnożenie przez zero = CZARNE liście
leafCardGeo.setAttribute('color', new THREE.Float32BufferAttribute(
  new Float32Array(leafCardGeo.attributes.position.count * 3).fill(1), 3));
// materiał kart liści: BILLBOARD w vertex shaderze (zawsze przodem do kamery)
// + kołysanie wiatrem. Dzięki temu korona jest gęsta z KAŻDEJ strony.
function makeLeafMaterial(paleta, amp) {
  const m = new THREE.MeshBasicMaterial({
    map: leafCardTexture(paleta), transparent: false, alphaTest: 0.45,
    side: THREE.DoubleSide, vertexColors: true });
  addCloudShadow(m);
  const _prev = m.onBeforeCompile;
  m.onBeforeCompile = sh => {
    if (_prev) _prev(sh);
    sh.uniforms.uTime = windU;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <project_vertex>',
      `vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float sx = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
       float sy = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
       float sway = sin(uTime * 1.35 + iPos.x * 0.4 + iPos.z * 0.3) * ${amp.toFixed(3)}
                  + sin(uTime * 0.55 + iPos.z * 0.11) * ${(amp * 0.6).toFixed(3)};
       vec4 mvPosition = modelViewMatrix * vec4(iPos + vec3(sway, 0.0, sway * 0.4), 1.0);
       mvPosition.xy += vec2(position.x * sx, position.y * sy);
       gl_Position = projectionMatrix * mvPosition;
       vWPos = iPos;`);
    sh.fragmentShader = sh.fragmentShader;
  };
  m.needsUpdate = true;
  return m;
}
function initLeafCards() {
  const palety = [
    ['#2f6b28', '#4a9138', '#6fbc4c'],   // soczysta zieleń
    ['#35722c', '#57a03f', '#83cc58'],   // jaśniejsza
    ['#2a5f34', '#43884a', '#63ad63'],   // chłodna
    ['#6b5220', '#9c7a2a', '#c9a23c'],   // jesienna (rzadka)
  ];
  leafCardMats = palety.map((p, i) => makeLeafMaterial(p, i === 3 ? 0.16 : 0.13));
}

// ==== SOLIDNA KORONA: bryła z cieniowaniem góra-dół zapieczonym w wierzchołkach ====
const leafPalety = [0, 1, 2, 3];
const leafBlobGeo = (() => {
  const g = new THREE.IcosahedronGeometry(1, 1);      // 80 ścian — tanio, a trzyma kształt
  // nieregularność: rozrusz wierzchołki, żeby nie była to idealna kula
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = 0.82 + hash2(Math.round(p.getX(i) * 97), Math.round(p.getZ(i) * 89)) * 0.36;
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  // vertex colors: jasno na górze, ciemno pod spodem (klucz do stylizowanego wyglądu)
  const kol = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, p.getY(i) * 0.5 + 0.5));
    const v = 0.55 + t * 0.65;
    kol[i * 3] = kol[i * 3 + 1] = kol[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(kol, 3));
  return g;
})();
let leafSolidMats = null;
function initLeafSolids() {
  const bazy = [0x4e9c36, 0x5aa83f, 0x3f8a3c, 0xb08a2c];   // 3 zielenie + jesienna
  leafSolidMats = bazy.map(c => addCloudShadow(new THREE.MeshLambertMaterial({
    color: c, vertexColors: true, flatShading: true })));
}

// drzewo = pień + KORONA Z KART LIŚCI (zbierane do wspólnego bufora chunka)
function makeTree(x, z, rng, out, karty, sway) {
  const g0 = terrainH(x, z);
  const h = 2.6 + rng() * 2.0;
  const iglaste = rng() < 0.28;
  const tr = new THREE.Mesh(trunkGeo, trunkMat);
  // GRUBSZY i krótszy pień — wcześniej był jak patyk
  const grubosc = 1.9 + rng() * 0.7;
  tr.scale.set(grubosc, h * (iglaste ? 0.5 : 0.42), grubosc);
  tr.position.set(x, g0, z);
  tr.castShadow = true; tr.receiveShadow = true;
  scene.add(tr); out.push(tr);

  if (iglaste) {                                   // świerk: stożki (zostają bryłami)
    for (let i = 0; i < 3; i++) {
      const s = (1.5 - i * 0.35) * (0.75 + rng() * 0.3);
      const c = new THREE.Mesh(coneGeo, pineMat);
      c.scale.set(s, h * 0.55 - i * 0.28, s);
      c.position.set(x, g0 + h * 0.32 + i * h * 0.28, z);
      c.rotation.y = rng() * 3;
      c.castShadow = true;
      scene.add(c); out.push(c);
    }
  } else {
    // ==== KORONA = SOLIDNE BRYŁY (czytelna sylwetka + PRAWDZIWY CIEŃ) ====
    // Billboardowe karty nie rzucały cienia i rozłaziły się — bryły trzymają kształt.
    const paleta = leafPalety[Math.floor(rng() * leafPalety.length)];
    const cy = g0 + h * 0.44;
    const bryly = [
      [0, 0.62, 0, 1.00],                              // główna masa
      [-0.62, 0.30, 0.34, 0.70],
      [0.58, 0.26, -0.40, 0.66],
      [0.10, 1.05, 0.14, 0.62],                        // czubek
    ];
    if (rng() < 0.5) bryly.push([-0.20, 0.10, -0.62, 0.55]);
    const skalaKorony = 1.25 + rng() * 0.55;
    for (const [dx, dy, dz, s] of bryly) {
      const b = new THREE.Mesh(leafBlobGeo, leafSolidMats[paleta]);
      const r = s * skalaKorony;
      b.scale.set(r * (1.05 + rng() * 0.2), r * (0.82 + rng() * 0.2), r * (1.05 + rng() * 0.2));
      b.position.set(x + dx * skalaKorony, cy + dy * skalaKorony, z + dz * skalaKorony);
      b.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      b.castShadow = true; b.receiveShadow = true;
      scene.add(b); out.push(b);
      sway.push({ mesh: b, faza: rng() * 6.28, bx: b.position.x, bz: b.position.z,
                  amp: 0.05 + dy * 0.05 });           // im wyżej, tym mocniej się kołysze
    }
  }
  return { c: 1, x, z, r: 0.42, top: 99 };          // kolizja pnia
}

// ============ TRAWA — DYWAN ŹDŹBEŁ (BotW/Genshin style) ============
// Jedna InstancedMesh z tysiącami źdźbeł, zakotwiona w siatce ŚWIATA (bez migotania),
// przebudowywana gdy gracz odejdzie od środka. Gradient w vertex colors + wiatr w shaderze.
// ---- KĘPKA TRAWY: alfa-tekstura pęku źdźbeł (technika z forum three.js:
// „image of a grass clump on a 2 triangle quad" — kilka razy taniej niż osobne źdźbła) ----
function clumpTexture() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const zdzbla = 16;
  for (let i = 0; i < zdzbla; i++) {
    const bx = 12 + (i / (zdzbla - 1)) * (S - 24) + (Math.random() - 0.5) * 6;
    const wys = S * (0.42 + Math.random() * 0.5);
    const szer = 5 + Math.random() * 5;
    const wygiecie = (Math.random() - 0.5) * 26;
    // gradient: ciemno u nasady, jasno na czubku
    const gr = g.createLinearGradient(0, S, 0, S - wys);
    const j = Math.random();
    gr.addColorStop(0, j < 0.5 ? '#3f7f2a' : '#4a8f30');
    gr.addColorStop(0.55, j < 0.5 ? '#6fbc45' : '#7cc94f');
    gr.addColorStop(1, j < 0.5 ? '#a8e46a' : '#bdf07d');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(bx - szer / 2, S);
    g.quadraticCurveTo(bx - szer / 2 + wygiecie * 0.5, S - wys * 0.55, bx + wygiecie, S - wys);
    g.quadraticCurveTo(bx + szer / 2 + wygiecie * 0.5, S - wys * 0.55, bx + szer / 2, S);
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// dwa skrzyżowane quady = kępka czytelna z każdej strony
function clumpGeometry() {
  const w = 1, h = 1;
  const poz = [], uv = [], idx = [], nor = [], kol = [];
  const dodajQuad = (kat) => {
    const s = Math.sin(kat), c2 = Math.cos(kat), o = poz.length / 3;
    poz.push(-w / 2 * c2, 0, -w / 2 * s,  w / 2 * c2, 0, w / 2 * s,
             -w / 2 * c2, h, -w / 2 * s,  w / 2 * c2, h, w / 2 * s);
    uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    for (let i = 0; i < 4; i++) { nor.push(0, 1, 0); kol.push(1, 1, 1); }
    idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
  };
  dodajQuad(0); dodajQuad(Math.PI / 2);
  const gm = new THREE.BufferGeometry();
  gm.setAttribute('position', new THREE.Float32BufferAttribute(poz, 3));
  gm.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  gm.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  // BIAŁY atrybut koloru jest KONIECZNY przy vertexColors:true — bez niego
  // shader mnoży przez zero i wszystko renderuje się na czarno.
  gm.setAttribute('color', new THREE.Float32BufferAttribute(kol, 3));
  gm.setIndex(idx);
  return gm;
}

// KWIATKI: kępka 3-4 łodyg z kwiatem na czubku. Płatki są BIAŁE, bo barwę
// nadaje instanceColor — dzięki temu jedna tekstura daje białe, żółte, różowe
// i liliowe łany (kolor losowany per PLAMA terenu, nie per kwiatek, więc
// tworzą się pola jednego koloru jak w Genshinie).
function flowerTexture() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // TYLKO 3 kwiaty na kępkę, za to z DUŻĄ główką — przy 128 px tekstury i kamerze
  // z góry mniejsze płatki gubiły się w dywanie trawy (sprawdzone: były kropkami).
  const ile = 3;
  for (let i = 0; i < ile; i++) {
    const bx = 26 + (i / (ile - 1)) * (S - 52) + (Math.random() - 0.5) * 8;
    const wys = S * (0.55 + Math.random() * 0.3);
    const gy = S - wys;                                    // czubek = główka kwiatu
    const wygiecie = (Math.random() - 0.5) * 14;
    // łodyga
    g.strokeStyle = '#3c7a2b'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(bx, S);
    g.quadraticCurveTo(bx + wygiecie * 0.6, S - wys * 0.5, bx + wygiecie, gy + 6);
    g.stroke();
    // dwa listki
    g.fillStyle = '#4b9134';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(bx + wygiecie * 0.4 + s * 6, S - wys * 0.45, 7, 3.2, s * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    // płatki (6) + środek
    const px = bx + wygiecie, r = 11 + Math.random() * 3;
    g.fillStyle = '#ffffff';
    for (let p = 0; p < 6; p++) {
      const a = p / 6 * Math.PI * 2 + Math.random() * 0.2;
      g.beginPath();
      g.ellipse(px + Math.cos(a) * r * 0.85, gy + Math.sin(a) * r * 0.85, r * 0.6, r * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.arc(px, gy, r * 0.5, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// WYSOKIE TRAWY (drugi wariant źdźbeł): suche łodygi z kłosem — na płowych łąkach
function stalkTexture() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const ile = 7;
  for (let i = 0; i < ile; i++) {
    const bx = 16 + (i / (ile - 1)) * (S - 32) + (Math.random() - 0.5) * 8;
    const wys = S * (0.62 + Math.random() * 0.36);
    const gy = S - wys;
    const wygiecie = (Math.random() - 0.5) * 30;           // suche łodygi mocniej się kładą
    const gr = g.createLinearGradient(0, S, 0, gy);
    gr.addColorStop(0, '#7d8f45'); gr.addColorStop(1, '#cfc274');
    g.strokeStyle = gr; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(bx, S);
    g.quadraticCurveTo(bx + wygiecie * 0.5, S - wys * 0.55, bx + wygiecie, gy);
    g.stroke();
    // kłos: kilka ziarenek wzdłuż czubka
    g.fillStyle = '#e2d489';
    for (let k = 0; k < 5; k++) {
      const t2 = k / 5;
      g.beginPath();
      g.ellipse(bx + wygiecie * (1 - t2 * 0.25), gy + t2 * wys * 0.22, 2.6, 4.2, wygiecie * 0.01, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bladeGeometry() {
  const w = 0.055, h = 1;                       // wąskie źdźbło (było za szerokie = słoma)
  const P = [], C = [], I = [];
  const lvl = [[0, w, 0], [0.5, w * 0.85, 0.03], [0.82, w * 0.6, 0.08], [1, 0, 0.14]];
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
const bladeGeo = clumpGeometry();   // KĘPKI (2 skrzyżowane quady) — tanio i gęsto
let bladeMat = null, grassField = null;
let flowerMat = null, flowerField = null;      // kwiatki (kolor z instanceColor)
let stalkMat = null, stalkField = null;        // wysokie suche trawy z kłosem
// uniformy dywanu: środek (gracz) + promień — do PŁYNNEGO WYRASTANIA (bez wyskakiwania)
const grassCenterU = { value: new THREE.Vector2() };
const grassRU = { value: 20 };
function makeBladeMaterial(mapa = null) {
  const m = new THREE.MeshBasicMaterial({ map: mapa || clumpTexture(), alphaTest: 0.42,
    side: THREE.DoubleSide, vertexColors: true });
  addCloudShadow(m);
  const _wind = m.onBeforeCompile;
  m.onBeforeCompile = sh => {
    if (_wind) _wind(sh);
    sh.uniforms.uTime = windU;
    sh.uniforms.uCenter = grassCenterU;
    sh.uniforms.uR = grassRU;
    sh.vertexShader = 'uniform float uTime;uniform vec2 uCenter;uniform float uR;\n' +
      sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 iP = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float dC = distance(iP.xz, uCenter);
       float fade = 1.0 - smoothstep(uR - 22.0, uR - 0.5, dC);  // bardzo szerokie wtapianie
       transformed.y *= fade;
       float h = max(position.y, 0.0);
       float sw = sin(uTime * 2.2 + iP.x * 0.45 + iP.z * 0.35) * 0.28 * h * fade
                + sin(uTime * 0.7 + iP.x * 0.08) * 0.10 * h * fade;   // druga, wolna fala
       transformed.x += sw;
       transformed.z += sw * 0.45;`);
  };
  return m;
}
const GRASS_STEP = 0.66;
let GRASS_R = 24, GRASS_MAX = 14000;
const grassCenter = new THREE.Vector2(1e9, 1e9);
const waterKol = new THREE.Vector2(1e9, 1e9);
const _gm = new THREE.Object3D(), _gc = new THREE.Color();

// pomocnik: jedno pole instancji na tej samej geometrii kępki (wiatr + wtapianie w shaderze)
function makeField(mat, max) {
  const f = new THREE.InstancedMesh(bladeGeo, mat, max);
  f.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  f.frustumCulled = false;
  f.count = 0;
  scene.add(f);
  return f;
}
function initGrassField() {
  const maloMocy = matchMedia('(pointer:coarse)').matches || innerWidth < 700;
  GRASS_R = maloMocy ? 34 : 56;
  GRASS_MAX = maloMocy ? 9000 : 26000;
  for (const f of [grassField, flowerField, stalkField]) if (f) { scene.remove(f); f.dispose(); }
  grassField  = makeField(bladeMat, GRASS_MAX);
  flowerField = makeField(flowerMat, Math.round(GRASS_MAX * 0.14));
  stalkField  = makeField(stalkMat, Math.round(GRASS_MAX * 0.12));
  grassCenter.set(1e9, 1e9);
}
// palety kwiatów — losowane per PLAMA terenu, więc powstają łany jednego koloru
const KWIAT_KOL = [[1.00, 1.00, 1.00], [1.00, 0.90, 0.42], [1.00, 0.70, 0.80], [0.80, 0.76, 1.00]];
function updateGrassField() {
  if (!grassField || MAPS[mapKey].indoor) {
    for (const f of [grassField, flowerField, stalkField]) if (f) f.count = 0;
    return;
  }
  grassCenterU.value.set(P.pos.x, P.pos.z);        // shader ściemnia/skraca źdźbła przy brzegu
  grassRU.value = GRASS_R;
  if (Math.hypot(P.pos.x - grassCenter.x, P.pos.z - grassCenter.y) < 1.2) return;  // częściej = płynniej
  grassCenter.set(P.pos.x, P.pos.z);
  const cx = Math.round(P.pos.x / GRASS_STEP), cz = Math.round(P.pos.z / GRASS_STEP);
  const cells = Math.ceil(GRASS_R / GRASS_STEP);
  const maxK = flowerField.instanceMatrix.count, maxS = stalkField.instanceMatrix.count;
  let n = 0, nk = 0, ns = 0;
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
      const r4 = hash2(gx + 555, gz + 999);
      // ---- co rośnie w tej komórce: kwiatek / wysoka trawa / zwykła kępka ----
      // Kwiatki tylko w ŁANACH (plama szumu), inaczej wyglądają jak posypka.
      // KOLEJNOŚĆ WARUNKÓW MA ZNACZENIE: vnoise jest najdroższy, więc odpala się
      // dopiero po tanich testach — inaczej liczylibyśmy go ~28 tys. razy na przebudowę.
      const kwiat = nk < maxK && r4 > 0.72 && b < 0.66 && vnoise(x / 15 - 5.5, z / 15 + 2.2) > 0.52;
      const klos  = !kwiat && ns < maxS && b > 0.34 && r4 < 0.05;
      _gm.position.set(x, y - 0.02, z);
      if (kwiat) {
        _gm.rotation.set((r2 - 0.5) * 0.16, r1 * Math.PI * 2, (r3 - 0.5) * 0.16);
        const h = 0.62 + r1 * 0.26;                            // czubek ponad dywan trawy
        _gm.scale.set(0.85 + r2 * 0.3, h, 0.85 + r2 * 0.3);
        _gm.updateMatrix();
        flowerField.setMatrixAt(nk, _gm.matrix);
        const pal = KWIAT_KOL[Math.floor(vnoise(x / 33 + 11.7, z / 33 - 4.2) * 3.999)];
        const v = 0.92 + r3 * 0.14;
        _gc.setRGB(pal[0] * v, pal[1] * v, pal[2] * v);
        flowerField.setColorAt(nk, _gc);
        nk++;
        continue;
      }
      if (klos) {
        _gm.rotation.set((r2 - 0.5) * 0.3, r1 * Math.PI * 2, (r3 - 0.5) * 0.3);  // mocniej się kładą
        const h = 0.95 + r1 * 0.55;                              // wyraźnie wyższe od dywanu
        _gm.scale.set(0.8 + r2 * 0.3, h, 0.8 + r2 * 0.3);
        _gm.updateMatrix();
        stalkField.setMatrixAt(ns, _gm.matrix);
        const v = 0.9 + r3 * 0.2;
        _gc.setRGB(v, v * (0.98 - b * 0.05), v * 0.9);
        stalkField.setColorAt(ns, _gc);
        ns++;
        continue;
      }
      const hgt = 0.55 + r1 * 0.35 - b * 0.10;                   // wysokość kępki
      // prawie pionowo (lekkie pochylenie) — inaczej wygląda jak rozsypana słoma
      _gm.rotation.set((r2 - 0.5) * 0.22, r1 * Math.PI * 2, (r3 - 0.5) * 0.22);  // różne kierunki
      _gm.scale.set(0.95 + r2 * 0.5, hgt, 0.95 + r2 * 0.5);
      _gm.updateMatrix();
      grassField.setMatrixAt(n, _gm.matrix);
      // kolor: las = soczysta zieleń, sucha łąka = cieplejsza; delikatna wariacja
      const plama = vnoise(x / 9 + 3.1, z / 9 + 8.4);            // miękkie łaty
      const v = 0.86 + plama * 0.26 + r3 * 0.06;
      _gc.setRGB((0.98 + b * 0.22) * v, (1.02 - b * 0.03) * v, (0.86 - b * 0.16) * v);
      grassField.setColorAt(n, _gc);
      n++;
    }
  }
  for (const [f, ile] of [[grassField, n], [flowerField, nk], [stalkField, ns]]) {
    f.count = ile;
    f.instanceMatrix.needsUpdate = true;
    if (f.instanceColor) f.instanceColor.needsUpdate = true;
  }
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
        // cienie chmur także na postaciach (ten sam kod shadera = jeden program w cache)
        mats.push(addCloudShadow(new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide })));
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

// ============================== POCHYLENIE SPRITE'ÓW ==============================
// Arkusze z PixelLaba są malowane W PERSPEKTYWIE (widok 3/4 z góry), a pionowy
// billboard przy kamerze patrzącej z góry tę perspektywę SKRACA — postać wygląda
// jak przyklejona do szyby i niższa niż na arkuszu. Dlatego płaszczyznę
// pochylamy tak, żeby stała PROSTOPADLE do osi patrzenia: rysunek pokazuje się
// dokładnie tak, jak go narysowano.
// Pivot geometrii siedzi w stopach (`unitGeo.translate(0, 0.5, 0)`), więc
// pochylenie obraca sprite'a WOKÓŁ STÓP — nie odkleja się od ziemi.
// 0 = stara wersja (pionowo), 1 = pełne obrócenie do kamery.
let SPRITE_TILT = 1;
let tiltKat = 0;
const _cdir = new THREE.Vector3();
const AX_Y = new THREE.Vector3(0, 1, 0), AX_X = new THREE.Vector3(1, 0, 0), AX_Z = new THREE.Vector3(0, 0, 1);
const _qx = new THREE.Quaternion(), _qz = new THREE.Quaternion();
function refreshSpriteTilt() {                    // raz na klatkę, nie raz na sprite'a
  camera.getWorldDirection(_cdir);
  tiltKat = Math.asin(Math.max(-1, Math.min(1, -_cdir.y))) * SPRITE_TILT;
}
// obrót billboardu: yaw kamery × pochylenie w stronę kamery × opcjonalny przewrót
function billboardQuat(q, roll = 0) {
  q.setFromAxisAngle(AX_Y, camYaw);
  _qx.setFromAxisAngle(AX_X, -tiltKat);
  q.multiply(_qx);
  if (roll) { _qz.setFromAxisAngle(AX_Z, roll); q.multiply(_qz); }
  return q;
}

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
    if (!LIB[this.char].anims[an]) {
      // brak takiej animacji (np. Beetino nie ma 'idle') — bierz pierwszą dostępną,
      // ale tylko gdy nic jeszcze nie gramy, żeby nie przerywać bieżącej
      if (this.anim) return;
      an = Object.keys(LIB[this.char].anims)[0];
      if (!an) return;
    }
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
    billboardQuat(this.mesh.quaternion);           // twarzą do kamery + pochylenie do jej osi
    this.shadow.position.set(pos.x, groundY + 0.04, pos.z);
  }
  dispose() { scene.remove(this.mesh); scene.remove(this.shadow); }
}
const faceAngle = (x, z) => { const a = Math.atan2(x, z); return a < 0 ? a + Math.PI * 2 : a; };

// ---- LIŚĆ SAŁATY (lotnia) — pixelowa tekstura + mesh nad postacią ----
function lettuceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // falisty liść: kilka warstw zieleni z ząbkowaną krawędzią
  const warstwy = [['#3f7a2e', 30], ['#5aa83c', 26], ['#7cc94f', 20], ['#a5e072', 12]];
  for (const [col, r] of warstwy) {
    g.fillStyle = col;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 14) {
      const fala = 1 + 0.16 * Math.sin(a * 7);
      const x = 32 + Math.cos(a) * r * fala * 1.35;
      const y = 34 + Math.sin(a) * r * fala * 0.75;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath(); g.fill();
  }
  g.strokeStyle = '#dff0b8'; g.lineWidth = 2;      // nerwy liścia
  g.beginPath(); g.moveTo(6, 34); g.lineTo(58, 34); g.stroke();
  for (let i = -2; i <= 2; i++) {
    g.beginPath(); g.moveTo(32, 34); g.lineTo(32 + i * 12, 34 + (i % 2 ? -12 : 12)); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// SZNURKI: liść wisiał nad głową „sam z siebie" i wyglądał jak naklejka.
// Rysujemy je jako osobny billboard rozciągnięty między barkami i czaszą —
// odległość jest stała, ale sznurki muszą trzymać PION do kamery niezależnie
// od przechyłu czaszy, dlatego to własny mesh, a nie część tekstury liścia.
function sznurkiTexture() {
  const S = 128;                                   // duża tekstura = CIENKIE linie po rozciągnięciu
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // ciemna oliwka, nie krem: na jasnym tle marketu jasne linie czytały się
  // jak promienie słońca. Dwa główne sznurki od krawędzi czaszy + dwa ledwo
  // widoczne w środku, wszystkie prawie pionowe (fan pod 30° wyglądał jak gwiazda).
  const linie = [[3, 60, '#3f5c22', 2], [124, 68, '#3f5c22', 2],
                 [34, 62, '#4d6b2c', 1], [93, 66, '#4d6b2c', 1]];
  for (const [gx, dx, kol, w] of linie) {
    g.strokeStyle = kol; g.lineWidth = w;
    g.beginPath(); g.moveTo(gx, 1); g.lineTo(dx, S - 2); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let lettuce = null, sznurki = null;
function initLettuce() {
  const m = new THREE.MeshBasicMaterial({ map: lettuceTexture(), transparent: true,
    alphaTest: 0.4, side: THREE.DoubleSide, depthWrite: false });
  lettuce = new THREE.Mesh(unitGeo, m);
  lettuce.scale.set(2.2, 1.3, 1);
  lettuce.visible = false;
  scene.add(lettuce);
  const ms = new THREE.MeshBasicMaterial({ map: sznurkiTexture(), transparent: true,
    alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: false });
  sznurki = new THREE.Mesh(unitGeo, ms);       // pivot w dole = przy barkach
  sznurki.visible = false;
  scene.add(sznurki);
}
function updateLettuce(dt) {
  if (!lettuce) return;
  lettuce.visible = sznurki.visible = !!P.gliding;
  if (!P.gliding) return;
  const kolysanie = Math.sin(G.time * 5) * 0.12;
  const czaszaY = P.y + 2.5 + Math.sin(G.time * 3) * 0.07;
  lettuce.position.set(P.pos.x, czaszaY, P.pos.z);
  lettuce.rotation.set(-0.9 + kolysanie * 0.4, camYaw, kolysanie);
  // sznurki: od barków (P.y + 1.1) do dolnej krawędzi czaszy, kołyszą się z nią
  const barki = P.y + 1.1;
  sznurki.position.set(P.pos.x + kolysanie * 0.25, barki, P.pos.z);
  // szerokość ~ czasza (2.2), inaczej sznurki wiszą w powietrzu obok jej krawędzi
  sznurki.scale.set(2.0, Math.max(0.2, czaszaY - 0.30 - barki), 1);
  billboardQuat(sznurki.quaternion, kolysanie * 0.8);
}

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
  hitFlash.quaternion.copy(playerBB.mesh.quaternion);   // billboardy chodzą na kwaternionach
}

// ============================== META (localStorage) ==============================
const META_KEY = 'horda3d_meta_v1';
function loadMeta() {
  const def = () => ({
    coins: 0, up: { serce: 0, dmg: 0, szyb: 0, magnes: 0 }, unlocked: {},
    chars: { carrotello: 1 }, lastChar: 'carrotello', lastMap: 'laki',
    st: { kills: 0, runs: 0, time: 0, best: 0, bestKills: 0, bosses: 0, coins: 0, chests: 0, lvl: 0 },
    bestiary: {},                                  // typ wroga -> ile razy zabity (bestiariusz)
    audio: { muz: 0.55, glos: 0.9, efe: 0.7, mute: 0 },   // głośności i wyciszenie (zakładka Dźwięk)
  });
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY)) || {};
    const d = def();
    return {
      coins: m.coins || 0,
      up: Object.assign(d.up, m.up),
      unlocked: Object.assign(d.unlocked, m.unlocked),
      chars: Object.assign(d.chars, m.chars),
      lastChar: m.lastChar || 'carrotello', lastMap: m.lastMap || 'laki',
      st: Object.assign(d.st, m.st),
      // stare zapisy nie mają bestiariusza — domyślnie pusty, nic nie psujemy
      bestiary: Object.assign(d.bestiary, m.bestiary),
      // stare zapisy nie mają ustawień dźwięku — biorą domyślne
      audio: Object.assign(d.audio, m.audio),
    };
  } catch { return def(); }
}
const META = loadMeta();
const saveMeta = () => localStorage.setItem(META_KEY, JSON.stringify(META));
// zapis „za chwilę" — liczniki bestiariusza tykają co zabicie, nie chcemy pisać
// do localStorage kilkaset razy na minutę
let saveT = 0;
function saveMetaSoon() {
  if (saveT) return;
  saveT = setTimeout(() => { saveT = 0; saveMeta(); }, 2000);
}
AUDIO.init(META, saveMeta);                        // dźwięk czyta/zapisuje głośności w META

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
  { key: 'glide',    ico: 'skok', nm: 'Liść sałaty',            ds: 'PRZYTRZYMAJ skok w locie = szybujesz i uciekasz hordzie', price: 250 },
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

// ---- BESTIARIUSZ: wpis o wrogu odblokowuje się po pierwszym jego zabiciu ----
function renderBestiary() {
  const wrap = document.getElementById('bestGrid');
  if (!wrap) return;
  wrap.innerHTML = '';
  const klucze = Object.keys(ENEMY_TYPES);
  let odkryte = 0;
  for (const key of klucze) {
    const T = ENEMY_TYPES[key];
    const n = META.bestiary[key] || 0;
    const znany = n > 0;
    if (znany) odkryte++;
    const staty = znany
      ? `HP ${T.hp} · TEMPO ${T.speed} · CIOS ${T.dmg} · XP ${T.xp}`
      : 'HP ? · TEMPO ? · CIOS ? · XP ?';
    const d = document.createElement('div');
    // .dark = zablokowany wpis: sylwetka na czarno (CSS brightness(0)) i „???"
    d.className = 'tile bst' + (znany ? '' : ' dark');
    d.innerHTML =
      `<div class="ico"><img class="pxi" src="${portret(T.char || key)}" style="height:70px"></div>
       <div class="nm">${znany ? T.nm : '???'}</div>
       <div class="ds">${znany ? T.ds : '???'}</div>
       <div class="bs">${staty}</div>
       <div class="pr">${ico('czaszka', 14)} ${n}</div>`;
    wrap.appendChild(d);
  }
  document.getElementById('bestProg').textContent = odkryte + '/' + klucze.length;
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
  lobs: [], boomers: [], bolts: [], pops: [], hps: [], kury: [], okruchy: [], puffs: [],
  padajace: [],                                    // regały w trakcie przewracania (market)
  hitstop: 0,                                      // krótkie zatrzymanie czasu przy grubym zabójstwie
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
    gliding: false, runGlide: false,
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
const hasGlide = () => META.unlocked.glide || P.runGlide;
let jumpHeld = false;                              // przytrzymanie = SZYBOWANIE
function tryJump() {
  if (!G.running || G.paused) return;
  if (!P.airborne) { P.vy = 8.2; P.airborne = true; AUDIO.sfx('skok'); }
  else if (hasDjump() && !P.usedDouble) {          // podwójny skok
    P.vy = 7.6; P.usedDouble = true;
    dmgPop(P.pos.x, P.y + 0.4, P.pos.z, 'HOP!', '#aaeeff', 1.1);
    AUDIO.sfx('skok');
  }
}
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); if (!jumpHeld) tryJump(); jumpHeld = true; }
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Space') jumpHeld = false;
});

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
{
  const jb = document.getElementById('jbtn');
  jb.addEventListener('pointerdown', e => { e.stopPropagation(); jumpHeld = true; tryJump(); });
  const puscil = () => { jumpHeld = false; };
  jb.addEventListener('pointerup', puscil);
  jb.addEventListener('pointercancel', puscil);
  jb.addEventListener('pointerleave', puscil);
  addEventListener('pointerup', puscil);            // gdy palec zjedzie poza przycisk
}

// ============================== KONTROLER (Gamepad API) ==============================
// Handheldy (Retroid Pocket) + pady Xbox/PS. Mapowanie: lewy drążek = ruch,
// prawy = obrót kamery, A(0) = skok (przytrzymanie = szybowanie), B(1) = wstecz,
// Start(9) = pauza, D-pad = nawigacja po menu.
const PAD = { on: false, mx: 0, mz: 0, jump: false, prev: [], navT: 0 };
const PAD_DZ = 0.18;                               // martwa strefa drążków
let gpSel = null;                                  // zaznaczony kafelek menu

function padToast(txt) {
  toastBuff(txt);
  setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2500);
}
addEventListener('gamepadconnected', e => {
  PAD.on = true;
  padToast('KONTROLER: ' + String(e.gamepad && e.gamepad.id || 'pad').slice(0, 22));
});
addEventListener('gamepaddisconnected', () => {
  PAD.on = false; PAD.mx = PAD.mz = 0; PAD.jump = false; PAD.prev = [];
  padToast('Kontroler odłączony');
});

// martwa strefa + ruch proporcjonalny (po odjęciu strefy skala rośnie do 1)
function padStick(x, y) {
  const d = Math.hypot(x, y);
  if (d < PAD_DZ) return [0, 0];
  const k = Math.min(1, (d - PAD_DZ) / (1 - PAD_DZ)) / d;
  return [x * k, y * k];
}
// najwyższy widoczny overlay (startOv jest pierwszy w DOM, więc reszta go przebija)
function topOverlay() {
  let ov = null;
  for (const o of document.querySelectorAll('.ov')) if (o.offsetWidth) ov = o;
  return ov;
}
const navItems = ov => [...ov.querySelectorAll('.tab,.tile,.card,.bigbtn,.btn2')].filter(el => el.offsetWidth);
function gpMark(el) {
  if (gpSel === el) return;
  if (gpSel) gpSel.classList.remove('gp-sel');
  gpSel = el || null;
  if (gpSel) { gpSel.classList.add('gp-sel'); gpSel.scrollIntoView({ block: 'nearest' }); }
}
// sąsiad w zadanym kierunku: najbliższy środek, z karą za zboczenie w bok
function gpMove(items, dx, dy) {
  if (!gpSel) { gpMark(items[0]); return; }
  const a = gpSel.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bd = 1e9;
  for (const el of items) {
    if (el === gpSel) continue;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2 - ax, y = r.top + r.height / 2 - ay;
    const along = x * dx + y * dy, side = Math.abs(x * dy - y * dx);
    if (along < 6) continue;                       // tylko w tę stronę
    const d = along + side * 2.2;
    if (d < bd) { bd = d; best = el; }
  }
  if (best) gpMark(best);
}
function gpBack(ov) {                              // B = wstecz / zamknij
  if (ov.id === 'pauseOv') togglePause(false);
  else if (ov.id === 'overOv') document.getElementById('btnMenu').click();
  else if (ov.id === 'startOv') {
    const t = document.querySelector('.tab[data-tab="graj"]');
    if (t && !t.classList.contains('sel')) t.click();
  }                                                // karty/wymiennik: trzeba wybrać
}

// odpytywanie padów MUSI iść co klatkę (stan nie przychodzi zdarzeniami)
function pollPads(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of pads) if (p && p.connected !== false) { gp = p; break; }
  if (!gp) { PAD.mx = PAD.mz = 0; return; }
  const B = gp.buttons || [], ax = gp.axes || [];
  const btn = i => !!(B[i] && (B[i].pressed || B[i].value > 0.5));
  const hit = i => btn(i) && !PAD.prev[i];         // zbocze narastające
  const [lx, ly] = padStick(ax[0] || 0, ax[1] || 0);
  const [rx] = padStick(ax[2] || 0, ax[3] || 0);
  const ov = topOverlay();

  if (ov) {                                        // ---- nawigacja po menu/overlayu ----
    PAD.mx = PAD.mz = 0;
    if (PAD.jump) { PAD.jump = false; jumpHeld = false; }
    const items = navItems(ov);
    if (!gpSel || !items.includes(gpSel)) gpMark(items[0]);
    let dx = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0);
    let dy = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
    if (!dx && !dy && (Math.abs(lx) > 0.5 || Math.abs(ly) > 0.5)) {
      if (Math.abs(lx) > Math.abs(ly)) dx = Math.sign(lx); else dy = Math.sign(ly);
    }
    if (!dx && !dy) PAD.navT = 0;
    else if ((PAD.navT -= dt) <= 0) { gpMove(items, dx, dy); PAD.navT = 0.22; }
    if (hit(0) && gpSel) gpSel.click();
    if (hit(1)) gpBack(ov);
    if (hit(9) && ov.id === 'pauseOv') togglePause(false);
  } else {                                         // ---- sterowanie w grze ----
    if (gpSel) gpMark(null);
    PAD.mx = lx; PAD.mz = ly;
    camYaw -= rx * 2.6 * dt;
    if (hit(0)) { PAD.jump = true; jumpHeld = true; tryJump(); }
    if (PAD.jump && !btn(0)) { PAD.jump = false; jumpHeld = false; }
    if (hit(9)) togglePause(true);
  }
  for (let i = 0; i < B.length; i++) PAD.prev[i] = btn(i);
}

// ============================== WROGOWIE ==============================
// nm/ds = wpis do BESTIARIUSZA (odblokowywany po pierwszym zabiciu danego typu)
const ENEMY_TYPES = {
  // ===== LA FAMIGLIA SNACKONI (wg biblii v1.1; HP/3.5, speed×2.5) =====
  chipsetti: { hp: 3, okrKol: 0xf2c14a, speed: 2.75, dmg: 1, scale: 0.85, xp: 1, walk: 'run', char: 'chipsetti_soldatetti',
    nm: 'Chipsetti Soldatetti',
    ds: 'Szeregowy Famiglii — wymięty chips z ambicjami. Atakuje wyłącznie w rojach, bo w pojedynkę jest tylko okruchem. Łamie się efektownie i to jego jedyny talent.' },
  marshmallini: { hp: 8, okrKol: 0xfff2f6, speed: 1.75, dmg: 1, scale: 1.0, xp: 2, walk: 'run', char: 'marshmallini_fluffini',
    dzieli: true, bigXp: true,
    nm: 'Marshmallini Fluffini',
    ds: 'Gąbczasty bandzior o konsystencji poduszki. Powolny i miękki, ale gdy go rozwalisz, robią się z niego DWA mniejsze problemy. Fizyka pianki, logika hydry.' },
  gummini: { hp: 4, okrKol: 0xe04a3c, speed: 3.0, dmg: 1, scale: 0.9, xp: 1, walk: 'run', char: 'gummini_bouncini',
    skacze: true, bezKb: true,
    nm: 'Gummini Bouncini',
    ds: 'Żelkowy miś, który nie chodzi — on się odbija. Nie da się go odepchnąć, bo cała jego istota to sprężyna. Galaretowaty, uparty i lepki jak wyrzut sumienia.' },
  friesetti: { hp: 4, okrKol: 0xf6cd51, speed: 4.0, dmg: 1, scale: 0.95, xp: 2, walk: 'run', char: 'friesetti_spearetti',
    bigXp: true,
    nm: 'Friesetti Spearetti',
    ds: 'Frytka-włócznik, szarżuje w porcjach po pięć. Chuda, długa i boleśnie szybka. Zostawia za sobą smugę soli i poczucie, że to była zła decyzja.' },
  sodino: { hp: 6, okrKol: 0x7a4426, speed: 2.5, dmg: 1, scale: 0.95, xp: 2, walk: 'run', char: 'sodino_explodino',
    kamikaze: true, bigXp: true,
    nm: 'Sodino Explodino',
    ds: 'Wstrząśnięta puszka z zapłonem zamiast rozumu. Syczy, biegnie i wybucha — w tej kolejności, zawsze. Po nim zostaje kałuża coli i cisza.' },
  lollini: { hp: 17, okrKol: 0xff6fa5, speed: 1.25, dmg: 2, scale: 1.35, xp: 4, walk: 'run', char: 'lollini_spinnini',
    wiruje: true, bigXp: true,
    nm: 'Lollini Spinnini',
    ds: 'Wielki lizak na patyku, który obraca się jak tarcza pilarska. Wolny jak niedziela, ale kto podejdzie za blisko, ten poznaje smak wiśniowej przemocy.' },
  // ===== BOSS: DON CHIPSO (wg biblii — torba chipsów; do czasu własnego sprite'a
  //          używamy powiększonego Chipsettiego, bo to ten sam „materiał") =====
  boss: { hp: 90, okrKol: 0xf2c14a, speed: 2.2, dmg: 2, scale: 2.7, xp: 25, walk: 'run',
    char: 'chipsetti_soldatetti', boss: true,
    nm: 'Don Chipso',
    ds: 'Głowa Famiglii. Mówi szeptem, bo kto ma sól, nie musi krzyczeć. Wymięty jak jego sumienie, tłusty jak jego interesy. Osiedle traktuje jak talerz: co na nim leży, uważa za swoje.' },
};

let eliteRingMat = null;
// ---- PROGRESJA: poziom zagrożenia rośnie co minutę ----
const tier = () => 1 + Math.floor(G.time / 60);
const hpScale = () => 1 + G.time / 60 * 0.55 + Math.pow(G.time / 300, 2) * 1.5;  // późno rośnie ostro
const spdScale = () => Math.min(1.5, 1 + G.time / 60 * 0.035);
const dmgScale = () => G.time > 600 ? 3 : (G.time > 330 ? 2 : 1);               // 5.5 min → 2, 10 min → 3

function spawnEnemy(type, angle = null, przy = null) {
  const T = ENEMY_TYPES[type];
  const a = angle === null ? Math.random() * Math.PI * 2 : angle;
  const r = 34 + Math.random() * 10;
  const hpMul = hpScale();
  const elite = !T.boss && G.time > 60 && Math.random() < 0.06 + G.time / 60 * 0.015;
  const e = {
    type, T, elite,
    pos: przy ? new THREE.Vector3(przy.x, 0, przy.z)
              : new THREE.Vector3(P.pos.x + Math.sin(a) * r, 0, P.pos.z + Math.cos(a) * r),
    hp: T.hp * (T.boss ? 1 : hpMul) * (elite ? 6 : 1),
    dying: false, hitCd: 0, kb: new THREE.Vector3(), orbCd: 0, climbing: false,
    ty: 0, vy: 0, jumpCd: 1 + Math.random() * 3, faza: Math.random() * 6.28,
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
  return e;
}

function killEnemy(e, i) {
  G.kills++;
  document.getElementById('kills').innerHTML = ico('czaszka', 15) + ' ' + G.kills;
  // ---- BESTIARIUSZ: licznik zabitych per typ (zostaje na stałe w META) ----
  const pierwszyRaz = !META.bestiary[e.type];
  META.bestiary[e.type] = (META.bestiary[e.type] || 0) + 1;
  if (pierwszyRaz) {
    saveMeta();                                    // odblokowanie zapisujemy od razu
    toastBuff('NOWY WPIS W ENCYKLOPEDII: ' + (e.T.nm || e.type));
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2600);
  } else saveMetaSoon();
  // KILL + combo (kille w oknie 1.3 s nabijają serię)
  G.streak = (G.time - G.streakT < 1.3) ? G.streak + 1 : 1;
  G.streakT = G.time;
  G.shake = Math.max(G.shake, Math.min(0.5, 0.06 + G.streak * 0.03));
  AUDIO.sfx(e.T.boss ? 'bossdown' : 'kill', { seria: G.streak });   // ton rośnie z serią
  AUDIO.seria(G.streak);                           // przy dużej serii postać się odezwie (rzadko)
  if (e.T.boss) { dmgPop(e.pos.x, e.ty + 1.2, e.pos.z, 'BOSS DOWN!', '#ff5555', 2.6); META.st.bosses++; saveMeta();
    // muzyka bossa wraca do utworu z biegu dopiero, gdy padnie OSTATNI boss
    if (!G.enemies.some(o => o !== e && o.T.boss && !o.dying)) AUDIO.bossOff();
  }
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
  // Marshmallini po śmierci DZIELI SIĘ na dwa mniejsze (wg biblii)
  if (e.T.dzieli && !e.mini) {
    for (const bok of [-1, 1]) {
      const m = spawnEnemy(e.type, null, { x: e.pos.x + bok * 0.8, z: e.pos.z });
      if (m) { m.mini = true; m.hp = m.maxHp = e.T.hp * 0.5 * hpScale(); m.bb.mesh.scale.multiplyScalar(0.62); }
    }
  }
  if (e.ring) { scene.remove(e.ring); e.ring = null; }
  if (e.T.death && LIB[e.T.char || e.type].anims[e.T.death]) {
    e.dying = true; e.bb.play(e.T.death, false);
  } else {
    startRozpad(e);                                // brak arkusza `death` → śmierć z kodu
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

// ============================== OKRUCHY (cząstki po śmierci) ==============================
// Materiał per KOLOR, nie per okruch: przy 200 zabójstwach na minutę klonowanie
// materiału na każdą cząstkę byłoby czystą stratą (dlatego gasną skalą, nie alfą).
const okruchGeo = new THREE.PlaneGeometry(0.17, 0.17);
const okruchMats = new Map();
function okruchMat(kol) {
  let m = okruchMats.get(kol);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: kol, side: THREE.DoubleSide }); okruchMats.set(kol, m); }
  return m;
}
function okruchy(x, y, z, kol, ile) {
  if (G.okruchy.length > 140) return;              // hamulec na wypadek rzezi
  const mat = okruchMat(kol);
  for (let i = 0; i < ile; i++) {
    const m = new THREE.Mesh(okruchGeo, mat);
    m.position.set(x, y, z);
    scene.add(m);
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2.5;
    G.okruchy.push({ mesh: m, t: 0, vx: Math.cos(a) * s, vz: Math.sin(a) * s,
                     vy: 2.4 + Math.random() * 2.8, spin: (Math.random() - 0.5) * 16 });
  }
}

// ============================== PUFF (świetlny obłok, blending additive) ==============================
function glowTexture() {
  const S = 64;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let glowMat = null;
function puff(x, y, z, kol, skala = 1) {
  if (!glowMat || G.puffs.length > 40) return;
  const m = new THREE.Mesh(unitGeo, glowMat.clone());   // klon = ten sam program, inny kolor
  m.material.color.setHex(kol);
  m.position.set(x, y, z);
  m.quaternion.copy(camera.quaternion);
  scene.add(m);
  G.puffs.push({ mesh: m, t: 0, skala });
}

// ============================== PROCEDURALNA ŚMIERĆ WROGA ==============================
// Snackoni nie mają arkusza `death` (patrz POSTACIE-DO-ZROBIENIA.md), a znikanie
// pstryknięciem zabijało całą satysfakcję z zabójstwa. Zamiast czekać na grafikę:
// sprite przewraca się, spłaszcza, blaknie i zostawia obłoczek okruchów.
const ROZPAD_T = 0.46;
const FLASH_T = 0.09;                              // biały błysk na starcie (klasyk juice'u)
// Łatka shadera dla UMIERAJĄCEGO sprite'a: pixelowy DISSOLVE (bloki UV znikają
// losowo, nie gładkie blaknięcie) + wybielenie na błysk.
// Uniformy trzymamy w `userData`, bo `onBeforeCompile` jest wołane jako METODA
// materiału — `this` to materiał, więc każdy klon dostaje swoje wartości.
// Źródło shadera jest identyczne dla wszystkich klonów, więc three.js kompiluje
// program RAZ i potem go cache'uje — inaczej każde zabójstwo dawałoby zadyszkę.
function rozpadShader(sh) {
  sh.uniforms.uProg = this.userData.uProg;
  sh.uniforms.uFlash = this.userData.uFlash;
  sh.fragmentShader = 'uniform float uProg;uniform float uFlash;\n' + sh.fragmentShader
    .replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec2 _blk = floor(vMapUv * 26.0);
        float _h = fract(sin(_blk.x * 12.9898 + _blk.y * 78.233) * 43758.5453);
        if (_h < uProg) discard;                    // kwadratowe piksele wypadają po kolei
      #endif
      #include <map_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), uFlash);`);
}
function startRozpad(e) {
  e.dying = true;
  e.rozpad = 0;
  e.rozpadBase = e.bb.mesh.scale.clone();          // mini-Marshmallini ma inną skalę
  e.rozpadY = e.bb.mesh.position.y;
  e.rozpadObrot = (Math.random() < 0.5 ? -1 : 1) * (1.0 + Math.random() * 0.6);
  // UWAGA: materiał klatki jest WSPÓLNY dla wszystkich wrogów tego typu
  // (`LIB[postać][anim].dirs[kier][klatka]`). Bez klona zgasłby cały rój naraz.
  const m = e.bb.mesh.material;
  if (m) {
    const k = m.clone();
    k.userData = { uProg: { value: 0 }, uFlash: { value: 1 } };
    k.onBeforeCompile = rozpadShader;
    k.needsUpdate = true;
    e.rozpadMat = k;
    e.bb.mesh.material = k;
  }
  const kol = e.T.okrKol || 0xffffff;
  const duzy = e.T.boss || e.elite;
  okruchy(e.pos.x, e.ty + e.bb.h * 0.45, e.pos.z, kol,
          e.T.boss ? 12 : (e.T.dzieli && !e.mini ? 7 : 4));
  puff(e.pos.x, e.ty + e.bb.h * 0.5, e.pos.z, kol, e.bb.h * (duzy ? 1.5 : 0.9));
  if (e.T.dzieli && !e.mini) novaRing(e.pos.x, e.pos.z, 1.3);   // widoczne PĘKNIĘCIE na dwa
  if (duzy) G.hitstop = Math.max(G.hitstop, e.T.boss ? 0.12 : 0.05);  // ciężar dużego zabójstwa
}
function updateRozpad(e, dt) {
  e.rozpad += dt;
  const k = Math.min(1, e.rozpad / ROZPAD_T);
  const b = e.rozpadBase;
  // POP: przez pierwsze klatki sprite PUCHNIE (anticipation), potem się spłaszcza
  const pop = e.rozpad < FLASH_T ? 1 + 0.28 * (1 - e.rozpad / FLASH_T) : 1;
  const sy = (1 - 0.72 * k) * pop, sx = (1 + 0.4 * k) * pop;
  e.bb.mesh.scale.set(b.x * sx, b.y * sy, b.z);
  // przewraca się z przyspieszeniem, ale dalej trzyma obrót i pochylenie kamery
  billboardQuat(e.bb.mesh.quaternion, e.rozpadObrot * k * k);
  e.bb.mesh.position.y = e.rozpadY - b.y * (1 - sy) * 0.5;   // osiada na ziemi, nie wisi
  if (e.rozpadMat) {
    e.rozpadMat.userData.uFlash.value = Math.max(0, 1 - e.rozpad / FLASH_T);
    e.rozpadMat.userData.uProg.value = Math.max(0, (k - 0.18) / 0.82);   // dissolve po błysku
  }
  e.bb.shadow.scale.set(b.x * 0.5 * (1 + k * 0.5), 1, b.x * 0.3 * (1 + k * 0.5));
  return k >= 1;
}

// ---- wyskakujące napisy (obrażenia, KILL) — tekstury cache'owane per napis ----
const popCache = new Map();
// ---- WŁASNY FONT BITMAPOWY 5×7: pixelowy I czytelny (Pixelify mylił 5 z S) ----
const GLIF = {
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01110','10001','10000','10000','10000','10001','01110'],
  'D': ['11110','10001','10001','10001','10001','10001','11110'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01110','10001','10000','10111','10001','10001','01111'],
  'I': ['01110','00100','00100','00100','00100','00100','01110'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'W': ['10001','10001','10001','10101','10101','11011','10001'],
  'X': ['10001','10001','01010','00100','01010','10001','10001'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  'Z': ['11111','00001','00010','00100','01000','10000','11111'],
  'Ą': ['01110','10001','10001','11111','10001','10001','10011'],
  'Ę': ['11111','10000','10000','11110','10000','10000','11111'],
  'Ń': ['10001','11001','10101','10011','10001','10001','10001'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '.': ['00000','00000','00000','00000','00000','00110','00110'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
};
function popMat(str, color) {
  const key = color + '|' + str;
  let m = popCache.get(key);
  if (m) return m;
  const txt = str.toUpperCase();
  const PX = 7, ODST = 1, MARG = 2;                 // wielkość piksela, odstęp, margines (w pikselach fontu)
  const znaki = [...txt].map(z => GLIF[z] || GLIF['?']);
  const szerZn = 5, wysZn = 7;
  const wPx = znaki.length * (szerZn + ODST) - ODST + MARG * 2;
  const hPx = wysZn + MARG * 2;
  const c = document.createElement('canvas');
  c.width = wPx * PX; c.height = hPx * PX;
  const g = c.getContext('2d');
  // 1) KONTUR: ten sam napis w czerni, przesunięty w 8 kierunkach (pixelowa obwódka)
  const rysuj = (kolor, ox, oy) => {
    g.fillStyle = kolor;
    znaki.forEach((gl, n) => {
      const bx = MARG + n * (szerZn + ODST);
      for (let y = 0; y < wysZn; y++)
        for (let x = 0; x < szerZn; x++)
          if (gl[y][x] === '1') g.fillRect((bx + x + ox) * PX, (MARG + y + oy) * PX, PX, PX);
    });
  };
  for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) rysuj('#0b0b0f', ox, oy);
  rysuj(color, 0, 0);                                // 2) właściwy napis
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;   // twarde piksele
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, fog: false });
  m.userData.aspect = c.width / c.height;
  popCache.set(key, m);
  return m;
}
function dmgPop(x, ty, z, str, color = '#ffe066', scale = 1) {
  if (G.pops.length > 70) return;                 // bezpiecznik przy hordach
  const mat = popMat(str, color);
  const mesh = new THREE.Mesh(unitGeo, mat.clone());
  const asp = mat.userData.aspect || 2.9;
  const wys = 0.85 * scale;
  mesh.scale.set(wys * asp, wys, 1);
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
      AUDIO.sfx('strzal');
      while (targets.length < count) targets.push(targets[targets.length - 1]);
      for (const { e } of targets) {
        const dir = e.pos.clone().sub(P.pos).setY(0).normalize();
        const m = new THREE.Mesh(shotGeo, shotMat);
        m.position.set(P.pos.x, P.y + 1.0, P.pos.z);      // z POSTACI (też gdy stoi na regale)
        scene.add(m);
        G.shots.push({ mesh: m, dir, life: 1.3, pierce, hit: new Set(), y: P.y + 1.0 });
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
        AUDIO.sfx('piorun');
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
  buty:   { ico: 'but', nm: 'Klapki Carrotella', ds: '+10% szybkości ruchu', max: 5 },
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
  const wszystkie = Object.keys(WEAPONS).filter(k =>
    !hasWeapon(k) && (!WEAPONS[k].locked || META.unlocked[k]));
  if (!wszystkie.length) { G.runCoins += 15; drawCoins(); return; }
  // LOSUJEMY 2 propozycje (nie pokazujemy całej listy — wybór ma coś znaczyć)
  const opts = [];
  const pula = wszystkie.slice();
  while (opts.length < 2 && pula.length) opts.push(pula.splice(Math.floor(Math.random() * pula.length), 1)[0]);
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
  const wszystkie = Object.keys(WEAPONS).filter(k =>
    !hasWeapon(k) && (!WEAPONS[k].locked || META.unlocked[k]));
  if (!wszystkie.length) { G.runCoins += 15; drawCoins(); return closeSwap(); }
  const opts = [];
  const pula = wszystkie.slice();
  while (opts.length < 2 && pula.length) opts.push(pula.splice(Math.floor(Math.random() * pula.length), 1)[0]);
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
      cr = 0.90 + b * 0.32; cg = 1.04; cb = 0.60 - b * 0.14;   // ton jak źdźbła
      if (h < WATER_Y + 0.5) { cr *= 0.72; cg *= 0.78; cb *= 0.62; }
    }
    cols[i * 3] = cr; cols[i * 3 + 1] = cg; cols[i * 3 + 2] = cb;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
  const mesh = new THREE.Mesh(geo, MAPS[mapKey].indoor ? chunkMatIndoor : chunkMat);
  mesh.position.set(wx0, 0, wz0);
  mesh.receiveShadow = true;
  scene.add(mesh);
  const rng = chunkRng(cx, cz);
  const deco = [], rocks = [], solids = [], spills = [], leaves = [], sway = [];
  const shelves = [];                            // regały do przewrócenia (tylko market)
  let grass = null;

  if (MAPS[mapKey].indoor) {
    // ======== MARKET: rozlana woda (ŚLISKO!) ========
    const nPlam = rng() < 0.75 ? 1 + Math.floor(rng() * 3) : 0;
    for (let i = 0; i < nPlam; i++) {
      const x = wx0 + (rng() - 0.5) * CHUNK, z = wz0 + (rng() - 0.5) * CHUNK;
      if (Math.abs(x) < 7 && Math.abs(z) < 7) continue;
      const r = 4.0 + rng() * 4.5;
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
          // REGAŁ: korpus + 2 wystające półki (bryły) = lepiej czytelny.
          // Wszystkie części siedzą w GRUPIE, której pivot leży na KRAWĘDZI
          // podstawy od strony upadku — dzięki temu przewracanie to jeden obrót
          // `rotation.x`, a nie ręczne przeliczanie pozycji pięciu bryłek.
          const len = 7;
          const kier = rng() < 0.5 ? 1 : -1;               // w którą stronę się przewróci
          // PARA PLECAMI DO SIEBIE (40% miejsc): przewrócony regał sięga 2.3 j.,
          // a rzędy stoją 8 j. od siebie — bez pary DOMINO nie ma czego trącić.
          // Oba regały w parze padają w TĘ SAMĄ stronę, więc pierwszy wywala drugi.
          const para = rng() < 0.4;
          const offs = para ? [-1.25 * kier, 1.25 * kier] : [0];
          for (const oz of offs) {
            const zz = z + oz;
            const pivotZ = zz + kier * 0.8;                // krawędź podstawy od strony upadku
            const grupa = new THREE.Group();
            grupa.position.set(x, g0, pivotZ);
            const dodaj = (mat, sx, sy, sz, ly, lz) => {
              const mm = new THREE.Mesh(shelfGeo, mat);
              mm.scale.set(sx, sy, sz);
              mm.position.set(0, ly, lz - kier * 0.8);      // lokalnie względem pivotu
              grupa.add(mm);
            };
            dodaj(shelfMat, len, SHELF_H, 1.6, SHELF_H / 2, 0);
            for (const [hy, dz] of [[0.8, 1.05], [1.6, 1.05], [0.8, -1.05], [1.6, -1.05]])
              dodaj(plankMat, len, 0.14, 0.6, hy, dz);
            dodaj(plankMat, len + 0.3, 0.16, 2.1, SHELF_H + 0.08, 0);
            scene.add(grupa); rocks.push(grupa);
            const solid = { x, z: zz, hw: len / 2, hl: 1.1, top: g0 + SHELF_H + 0.16 };
            solids.push(solid);
            shelves.push({ grupa, solid, x, z: zz, g0, len, kier, pivotZ, t: 0, stan: 'stoi' });
          }
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
    // ======== ŁĄKI: DRZEWA (pnie + karty liści) + dekoracje ========
    const las = biome(wx0, wz0) <= 0.45;
    const nTrees = las ? 4 + Math.floor(rng() * 4) : (rng() < 0.5 ? 1 : 0);
    const karty = [];
    for (let i = 0; i < nTrees; i++) {
      const x = wx0 + (rng() - 0.5) * CHUNK, z = wz0 + (rng() - 0.5) * CHUNK;
      if (terrainH(x, z) < WATER_Y + 0.5) continue;
      solids.push(makeTree(x, z, rng, rocks, karty, sway));
    }
    // wszystkie liście chunka → po jednej InstancedMesh na paletę (mało draw calli)
    if (karty.length) {
      const _o = new THREE.Object3D();
      for (let mi = 0; mi < leafCardMats.length; mi++) {
        const grupa = karty.filter(k => k.mat === mi);
        if (!grupa.length) continue;
        const inst = new THREE.InstancedMesh(leafCardGeo, leafCardMats[mi], grupa.length);
        const _kol = new THREE.Color();
        grupa.forEach((k, i) => {
          _o.position.set(k.x, k.y, k.z);
          _o.rotation.set(0, 0, 0);                 // obrót załatwia billboard w shaderze
          _o.scale.set(k.sc, k.sc * 0.82, 1);
          _o.updateMatrix();
          inst.setMatrixAt(i, _o.matrix);
          _kol.setScalar(k.cien);                   // spód korony ciemniejszy = głębia
          inst.setColorAt(i, _kol);
        });
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        inst.frustumCulled = false;
        scene.add(inst);
        leaves.push(inst);
      }
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
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        rocks.push(m);
        // niski głaz — do przeskoczenia!
        solids.push({ c: 1, x, z, r: s * 0.9, top: terrainH(x, z) + s * 0.75 });
      }
    }
  }
  return { mesh, deco, rocks, solids, spills, grass, leaves, sway, shelves };
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
    if (ch.leaves) for (const l of ch.leaves) { scene.remove(l); l.dispose(); }
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
    if (ch.leaves) for (const l of ch.leaves) { scene.remove(l); l.dispose(); }
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
  AUDIO.sfx('skrzynia');
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
    AUDIO.sfx('zlota');
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
  AUDIO.sfx('wybuch');
  przewrocRegaly(x, z, r + 1.2);                 // w markecie fala kładzie regały
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

// ============================== PRZEWRACANE REGAŁY (market) ==============================
// Każda fala uderzeniowa (tupnięcie, wybuch butelki, meteoryt, Sodino) przewraca
// regały w zasięgu. Regał przygniata wszystko na swojej długości, otwiera przejście
// i zostawia rumowisko, na które da się WSKOCZYĆ — a przewracając się, popycha
// sąsiednie regały, więc jedno tupnięcie może pójść jak domino przez pół alejki.
const PAD_T = 0.5;                               // czas upadku
function przewrocRegaly(x, z, r, opoznienie = 0) {
  if (!MAPS[mapKey].indoor) return 0;
  let ile = 0;
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
    const ch = chunkMap.get(gx + ',' + gz);
    if (!ch || !ch.shelves || !ch.shelves.length) continue;
    for (const s of ch.shelves) {
      if (s.stan !== 'stoi') continue;
      // odległość do PROSTOKĄTA regału, nie do środka — inaczej fala u końca
      // siedmiometrowego regału nie ruszałaby go wcale
      const dx = Math.max(0, Math.abs(x - s.x) - s.len / 2);
      const dz = Math.max(0, Math.abs(z - s.z) - 1.1);
      if (dx * dx + dz * dz > r * r) continue;
      s.stan = 'pada'; s.t = -opoznienie; s.zadal = false;
      G.padajace.push(s);
      ile++;
    }
  }
  return ile;
}
function updatePadajace(dt) {
  for (let i = G.padajace.length - 1; i >= 0; i--) {
    const s = G.padajace[i];
    if (!s.grupa.parent) { G.padajace.splice(i, 1); continue; }   // chunk zniknął pod nogami
    s.t += dt;
    if (s.t < 0) continue;                                        // czeka na swoją kolej (domino)
    const k = Math.min(1, s.t / PAD_T);
    const kat = (Math.PI / 2) * k * k;                            // przyspiesza jak pod grawitacją
    s.grupa.rotation.x = s.kier * kat;
    // Pivot leży na posadzce, a korpus ma 1.6 j. głębokości liczonej OD ŚRODKA,
    // więc sam obrót wkopywałby połowę regału pod podłogę. Podnosimy go w trakcie
    // upadku, żeby leżał NA posadzce — i żeby szczyt (1.25) dało się przeskoczyć
    // jednym skokiem (1.46 j.), bo to jest cały sens rumowiska.
    s.grupa.position.y = s.g0 + 0.45 * Math.sin(kat);
    if (!s.zadal && k > 0.55) {                                   // moment uderzenia w podłogę
      s.zadal = true;
      const dmg = 6 * dmgAll() + 4;
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        if (Math.abs(e.pos.x - s.x) > s.len / 2 + 0.7) continue;
        const wzdluz = (e.pos.z - s.pivotZ) * s.kier;             // leży od pivotu w stronę upadku
        if (wzdluz < -0.7 || wzdluz > SHELF_H + 0.7) continue;
        e.hp -= dmg;
        e.kb.set(0, 0, s.kier * 3);
        dmgPop(e.pos.x, e.ty + 0.6, e.pos.z, dmgNum(dmg), '#ffd75e', 1.5);
        if (e.hp <= 0) killEnemy(e, j);
      }
      // gracz też dostanie, jeśli stoi w linii upadku — regały nie wybierają
      if (Math.abs(P.pos.x - s.x) < s.len / 2 + 0.6 && P.iframes <= 0 && !P.airborne) {
        const wzdluz = (P.pos.z - s.pivotZ) * s.kier;
        if (wzdluz > -0.6 && wzdluz < SHELF_H + 0.6) {
          P.hp -= 1; P.iframes = 1.1; drawHearts(); AUDIO.sfx('hurt'); G.shake = 0.5;
          if (P.hp <= 0) startDeath();
        }
      }
      AUDIO.sfx('wybuch');
      G.shake = Math.max(G.shake, 0.4);
      G.hitstop = Math.max(G.hitstop, 0.05);
      okruchy(s.x, s.g0 + 0.5, s.pivotZ + s.kier * SHELF_H * 0.5, 0xb98a4e, 8);   // drewno
      // rozsypany TOWAR — bez tego przewrócony regał to sama deska
      for (const kol of [0xd94f4f, 0x4f8fd9, 0xf2c14a])
        okruchy(s.x + (Math.random() - 0.5) * s.len, s.g0 + 1.2, s.pivotZ, kol, 3);
      puff(s.x, s.g0 + 0.4, s.pivotZ + s.kier * SHELF_H * 0.5, 0xd8c49a, 3.5);
      novaRing(s.x, s.pivotZ + s.kier * SHELF_H * 0.5, 3);
      // DOMINO: koniec leżącego regału trąca to, co tam stoi (para plecami do siebie)
      przewrocRegaly(s.x, s.pivotZ + s.kier * SHELF_H, 1.0, 0.08);
    }
    if (k >= 1) {
      s.stan = 'lezy';
      // Bryła kolizji z pionowej ściany (top 2.3) robi się RUMOWISKIEM, na które
      // wskoczysz jednym skokiem. Wymiary MUSZĄ zgadzać się z tym, co widać,
      // inaczej przenika się przez deski: leżący regał sięga od pivotu na
      // 2.46 j. (korpus 2.3 + blat 0.16), a blat jest szerszy od korpusu o 0.3.
      s.solid.z = s.pivotZ + s.kier * 1.23;
      s.solid.hl = 1.23;
      s.solid.hw = s.len / 2 + 0.15;
      s.solid.top = s.g0 + 1.25;
      // KTO ZOSTAŁ POD REGAŁEM, LĄDUJE NA NIM. Bez tego stoi się WEWNĄTRZ świeżej
      // bryły kolizji: przy parze regałów dwie bryły stoją stykiem, więc
      // wypchnięcia z obu stron znoszą się i nie ma gdzie uciec — stąd przenikanie.
      const wSrodku = (px, pz) => Math.abs(px - s.solid.x) < s.solid.hw + 0.4 &&
                                  Math.abs(pz - s.solid.z) < s.solid.hl + 0.4;
      if (wSrodku(P.pos.x, P.pos.z) && P.y < s.solid.top) {
        P.y = s.solid.top; P.vy = 0; P.airborne = false; P.usedDouble = false;
      }
      for (const e of G.enemies) if (!e.dying && wSrodku(e.pos.x, e.pos.z) && e.ty < s.solid.top) e.ty = s.solid.top;
      G.padajace.splice(i, 1);
    }
  }
}

// ============================== PĘTLA ==============================
let playerBB = null;
const clock = new THREE.Clock();

function update(dt) {
  if (G.dying) { updateDeath(dt); return; }
  // HITSTOP: zabicie elity/bossa na moment prawie zatrzymuje świat. Kosztuje
  // jedną linijkę, a robi połowę „ciężaru" ciosu — czas realny odejmujemy
  // PRZED spowolnieniem, żeby hitstop nie przedłużał się sam.
  if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.14; }
  refreshSpriteTilt();                             // pochylenie billboardów liczymy raz na klatkę
  G.time += dt;
  document.getElementById('timer').textContent = fmtTime(G.time);
  // komunikat o wzroście poziomu zagrożenia
  const tr = tier();
  if (tr !== G.tier) {
    G.tier = tr;
    document.getElementById('tier').innerHTML = ico('ostrzezenie', 14) + ' ZAGROŻENIE ' + tr;
    if (tr > 1) {
      AUDIO.sfx('zagrozenie');
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
  else if (PAD.mx || PAD.mz) { mx = PAD.mx; mz = PAD.mz; }   // lewy drążek pada
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  // przód = od kamery; prawo = prostopadle
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const rx = -fz, rz = fx;
  const wx = fx * -mz + rx * mx, wz = fz * -mz + rz * mx;
  const inWater = !P.airborne && terrainH(P.pos.x, P.pos.z) < WATER_Y - 0.04;
  let spd = speedF() * (inWater ? 0.6 : 1);
  if (G.buff.key === 'szyb') spd *= 1.45;
  if (P.gliding) spd *= 1.45;                    // szybując lecisz szybciej = ucieczka od hordy
  // strome zbocze (mesa): pieszo wolno POD GÓRĘ, ale skokiem normalnie
  if (ml > 0.05 && !P.airborne) {
    const inv = 1 / Math.max(ml, 0.001);
    const ahead = terrainH(P.pos.x + wx * inv * 0.7, P.pos.z + wz * inv * 0.7) - terrainH(P.pos.x, P.pos.z);
    if (ahead > 0.35) spd *= 0.5;
  }
  // ŚLISKO na rozlanej wodzie (market): bezwładność zamiast sterowania 1:1
  const slip = !P.airborne && MAPS[mapKey].indoor && onSpill(P.pos.x, P.pos.z);
  const grip = slip ? 0.85 : 18;                    // jak szybko prędkość goni wejście
  P.vx += (wx * spd - P.vx) * Math.min(1, grip * dt);
  P.vz += (wz * spd - P.vz) * Math.min(1, grip * dt);
  P.pos.x += P.vx * dt;
  P.pos.z += P.vz * dt;                  // mapa bez końca — zero klamry
  solveSolids(P.pos, 0.4, P.y);          // regały/pnie/głazy odpychają
  const pTy = terrainH(P.pos.x, P.pos.z);
  ensureChunks();
  updateSun(P.pos.x, P.pos.z);
  updateGrassField();
  water.position.set(P.pos.x, WATER_Y, P.pos.z);
  waterCamU.value.set(P.pos.x, P.pos.z);
  if (MAPS[mapKey].water && Math.hypot(P.pos.x - waterKol.x, P.pos.z - waterKol.y) > 8) {
    waterKol.set(P.pos.x, P.pos.z);
    updateWaterColors();
  }

  // ---- fizyka pionowa (spadanie z krawędzi, skok, SZYBOWANIE, lądowanie) ----
  const ground = supportY(P.pos.x, P.pos.z, P.y);
  if (P.airborne) {
    P.vy -= 22 * dt;
    // LIŚĆ SAŁATY: przytrzymanie skoku podczas opadania = powolne szybowanie
    P.gliding = hasGlide() && jumpHeld && P.vy < -0.6;
    if (P.gliding) P.vy = Math.max(P.vy, -1.5);
    P.y += P.vy * dt;
    if (P.vy <= 0 && P.y <= ground) {                    // lądowanie
      const mocno = P.vy < -4;                           // z byle stopnia nie ma co dudnić
      P.y = ground; P.vy = 0; P.airborne = false; P.usedDouble = false; P.gliding = false;
      if (mocno) AUDIO.sfx('ladowanie');
      if (stompLvl() > 0) nova(P.pos.x, P.pos.z, stompRad(stompLvl()), stompDmg(stompLvl()));
    }
  } else {
    P.gliding = false;
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
  updateLettuce(dt);

  // ---- spawner: krzywa trudności (1 min ~lekko, 4 min = ~4× więcej naraz) ----
  const min = G.time / 60;
  G.spawnT -= dt;
  const interval = Math.max(0.13, 1.3 / (1 + min * 0.55));      // 1.3 s → 0.28 s w 4. min
  const CAP = 500;
  if (G.spawnT <= 0 && G.enemies.length < CAP) {
    G.spawnT = interval;
    const batch = Math.round(1 + min * 1.6);                     // 4. min: ~7 na raz
    // TIMELINE wg biblii: chipsetti od 0:00, marshmallini 1:00, gummini 2:00,
    // friesetti 3:00, sodino 4:00, lollini 4:30
    const pula = ['chipsetti'];
    if (G.time > 60) pula.push('marshmallini');
    if (G.time > 120) pula.push('gummini');
    if (G.time > 180) pula.push('friesetti');
    if (G.time > 240) pula.push('sodino');
    if (G.time > 270) pula.push('lollini');
    for (let b = 0; b < batch && G.enemies.length < CAP; b++) {
      // chipsetti zawsze dominują (szeregowi), reszta doprawia hordę
      const type = Math.random() < 0.45 ? 'chipsetti' : pula[Math.floor(Math.random() * pula.length)];
      spawnEnemy(type);
    }
  }
  // FALA OKRĄŻAJĄCA co 30 s od 1. minuty: pierścień wrogów ZE WSZYSTKICH STRON
  if (G.time > 60 && G.time > G.ringAt) {
    G.ringAt = G.time + 30;
    const n = Math.round(10 + min * 5);
    const typy = G.time > 180 ? ['chipsetti', 'gummini', 'friesetti', 'marshmallini']
                              : ['chipsetti', 'chipsetti', 'marshmallini'];
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
    AUDIO.sfx('boss');                                           // niski róg = „coś dużego weszło"
    AUDIO.bossOn();                                              // muzyka przełącza się na walkę z bossem
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
      let koniec;
      if (e.rozpad !== undefined) koniec = updateRozpad(e, dt);   // śmierć z kodu (bez arkusza)
      else { e.bb.update(dt, e.pos, e.ty); koniec = e.bb.done; }
      if (koniec) {
        e.bb.dispose();
        if (e.rozpadMat) e.rozpadMat.dispose();      // klon materiału trzeba oddać
        if (e.ring) scene.remove(e.ring);
        G.enemies.splice(i, 1);
      }
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
    if (!e.T.bezKb) {                                  // Gummini są odporne na odrzut
      e.pos.add(e.kb.clone().multiplyScalar(dt * 8));
      e.kb.multiplyScalar(Math.max(0, 1 - dt * 10));
    } else e.kb.set(0, 0, 0);
    if (e.T.wiruje) {
      // Lollini kręci się jak piła TARCZOWA — ale że to billboard, symulujemy to
      // ściskaniem w poziomie (jak obracający się dysk oglądany z boku) + chwile spoczynku
      const cykl = (G.time * 0.55 + e.faza) % 3.0;
      if (cykl < 1.9) {                                  // faza wirowania
        const spin = Math.cos(G.time * 9 + e.faza);
        e.bb.mesh.scale.x = e.bb.h * (0.32 + 0.68 * Math.abs(spin));
      } else {
        e.bb.mesh.scale.x = e.bb.h;                      // chwila przerwy — po prostu idzie
      }
    }
    if (e.T.kamikaze && d < 2.2 && !e.zapalony) {                 // Sodino: syczy i wybucha
      e.zapalony = true; e.lont = 1.0;
    }
    if (e.zapalony) {
      e.lont -= dt;
      e.bb.mesh.scale.setScalar(e.bb.h * (1 + Math.sin(G.time * 30) * 0.12));
      if (e.lont <= 0) {
        nova(e.pos.x, e.pos.z, 2.6, 0);                           // wybuch rani TYLKO gracza
        if (e.pos.distanceTo(P.pos) < 2.6 && P.iframes <= 0 && P.y - e.ty < 1.2) {
          P.hp -= 1; P.iframes = 0.9; drawHearts(); G.shake = 0.4; AUDIO.sfx('hurt');
          if (P.hp <= 0) { startDeath(); }
        }
        dmgPop(e.pos.x, e.ty + 0.8, e.pos.z, 'BUM!', '#ff9d3f', 1.6);
        killEnemy(e, i);
        continue;
      }
    }

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
    } else if (e.T.skacze) {
      e.climbing = false;
      const podskok = Math.abs(Math.sin(G.time * 4.5 + e.faza)) * 0.75;   // ciągłe odbijanie
      e.ty = eGround + podskok;
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
        AUDIO.sfx('tarcza');
        toastBuff('TARCZA zablokowała cios!');
        setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 1500);
        novaRing(P.pos.x, P.pos.z, 2);
      } else {
        P.hp -= e.T.dmg * (e.T.boss ? 1 : dmgScale()); P.iframes = 0.9;
        drawHearts();
        AUDIO.sfx('hurt');
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
    // leci na wysokości wystrzału, płynnie schodząc do poziomu terenu
    const docel = terrainH(s.mesh.position.x, s.mesh.position.z) + 1.0;
    s.y += (docel - s.y) * Math.min(1, 3 * dt);
    s.mesh.position.y = s.y;
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
        AUDIO.sfx(crit ? 'kryt' : 'traf');
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

  // ---- okruchy po zabitych (odbijają się od terenu i gasną skalą) ----
  for (let i = G.okruchy.length - 1; i >= 0; i--) {
    const o = G.okruchy[i]; o.t += dt;
    o.vy -= 16 * dt;
    o.mesh.position.x += o.vx * dt;
    o.mesh.position.z += o.vz * dt;
    o.mesh.position.y += o.vy * dt;
    o.mesh.rotation.z += o.spin * dt;
    o.mesh.rotation.y = camYaw;
    const ziemia = terrainH(o.mesh.position.x, o.mesh.position.z) + 0.06;
    if (o.mesh.position.y < ziemia) {               // jedno odbicie i leży
      o.mesh.position.y = ziemia;
      o.vy *= -0.34; o.vx *= 0.55; o.vz *= 0.55;
    }
    if (o.t > 0.95) { scene.remove(o.mesh); G.okruchy.splice(i, 1); }
    else if (o.t > 0.62) o.mesh.scale.setScalar(Math.max(0, 1 - (o.t - 0.62) / 0.33));
  }

  // ---- świetlne puffy (rozszerzają się i gasną) ----
  for (let i = G.puffs.length - 1; i >= 0; i--) {
    const p = G.puffs[i]; p.t += dt;
    const k = p.t / 0.3;
    p.mesh.scale.setScalar(p.skala * (0.7 + k * 1.8));
    p.mesh.quaternion.copy(camera.quaternion);
    p.mesh.material.opacity = Math.max(0, 0.85 * (1 - k));
    if (k >= 1) { scene.remove(p.mesh); p.mesh.material.dispose(); G.puffs.splice(i, 1); }
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
  if (G.padajace.length) updatePadajace(dt);

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
        AUDIO.sfx('totem');
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
      AUDIO.sfx('xp');
      scene.remove(g.mesh); G.gems.splice(i, 1);
      if (P.xp >= P.xpNeed) {
        P.xp -= P.xpNeed; P.lvl++;
        P.xpNeed = Math.round(5 + P.lvl * 3.2);
        document.getElementById('lvl').textContent = 'POZIOM ' + P.lvl;
        AUDIO.sfx('awans');
        AUDIO.event('awans');
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
      AUDIO.sfx('moneta');
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
      AUDIO.sfx('serce');
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

  // ---- kołysanie koron drzew ----
  for (const ch of chunkMap.values()) {
    if (!ch.sway || !ch.sway.length) continue;
    for (const s2 of ch.sway) {
      const w = Math.sin(G.time * 1.15 + s2.faza) * s2.amp;
      s2.mesh.position.x = s2.bx + w;
      s2.mesh.position.z = s2.bz + w * 0.45;
    }
  }

  // ---- dekoracje twarzą do kamery ----
  for (const ch of chunkMap.values())
    for (const m of ch.deco) m.rotation.y = camYaw;

  windU.value = G.time;
  cloudOffU.value.set(G.time * CLOUD_SPD * 0.004, G.time * CLOUD_SPD * 0.0022);

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
  AUDIO.sfx('koniec');
  document.getElementById('vign').style.opacity = 1;
  dmgPop(P.pos.x, P.y + 1.2, P.pos.z, 'KONIEC!', '#ff4a4a', 2.4);
  novaRing(P.pos.x, P.pos.z, 6);
  if (hitFlash) hitFlash.visible = false;
  AUDIO.event('smierc');                           // ostatnia kwestia postaci
}
function updateDeath(dt) {
  G.deathT += dt;
  const t = G.deathT;
  // postać przewraca się na bok i zapada w ziemię (przewrót doklejony do obrotu billboardu)
  refreshSpriteTilt();
  billboardQuat(playerBB.mesh.quaternion, Math.min(Math.PI / 2, t * 3.2));
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
  AUDIO.endRun();                                  // koniec biegu = powrót do motywu głównego
  document.getElementById('vign').style.opacity = 0;
  playerBB.mesh.rotation.z = 0;
  META.coins += G.runCoins;
  const s = META.st;
  s.kills += G.kills; s.runs++; s.time += G.time; s.coins += G.runCoins; s.lvl += P.lvl - 1;
  if (G.time > s.best) s.best = G.time;
  if (G.kills > s.bestKills) s.bestKills = G.kills;
  saveMeta(); renderShop(); renderStats(); renderBestiary();
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
  for (const e of G.enemies) {
    e.bb.dispose();
    if (e.rozpadMat) e.rozpadMat.dispose();
    if (e.ring) scene.remove(e.ring);
  }
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
  for (const o of G.okruchy) scene.remove(o.mesh);
  for (const p of G.puffs) { scene.remove(p.mesh); p.mesh.material.dispose(); }
  G.enemies = []; G.gems = []; G.coins = []; G.shots = []; G.orbs = []; G.sparks = []; G.rings = [];
  G.lobs = []; G.boomers = []; G.bolts = []; G.pops = []; G.hps = []; G.kury = []; G.okruchy = [];
  G.puffs = []; G.hitstop = 0; G.padajace = [];
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
  AUDIO.startRun(charKey);                         // losowy utwór na bieg + kwestia na start
  camYaw = 0;
  camera.position.set(0, terrainH(0, 0) + CAM_H, CAM_DIST);
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  pollPads(dt);                                   // pady odpytujemy co klatkę
  if (G.running && !G.paused) {
    try { update(dt); } catch (err) { console.error(err); }
  }
  renderer.render(scene, camera);
}

// ============================== START ==============================
// ---- EKRAN ŁADOWANIA: pasek postępu + rotujące porady ----
const PORADY = [
  'Złota skrzynia = nowa broń. Idź za strzałką na ekranie.',
  'Marshmallini po śmierci dzieli się na dwa mniejsze. Planuj kolejność.',
  'Sodino syczy przed wybuchem — to Twoja sekunda na ucieczkę.',
  'Gummini odbija się i nie da się go odepchnąć. Nie licz na knockback.',
  'Lollini kręci się jak piła. Wolny, ale nie właź pod tarczę.',
  'Liść sałaty: PRZYTRZYMAJ skok w locie, żeby szybować nad hordą.',
  'Na regale w markecie horda wspina się powoli — to Twoja chwila oddechu.',
  'Woda spowalnia i Ciebie, i przekąski. Skokiem przeskoczysz zatoczkę.',
  'Totem daje buff na 18 sekund. Warto po niego zboczyć z trasy.',
  'Monety zostają po śmierci — każdy przegrany bieg i tak coś daje.',
];
const loadOv = document.getElementById('loadOv');
const loadBar = document.getElementById('loadBar');
const loadTxt = document.getElementById('loadTxt');
const loadTip = document.getElementById('loadTip');
let krokLad = 0;
const KROKOW = 13;                                   // ile etapów startu (dopasowane do boot)
function ladowanie(opis) {
  krokLad++;
  if (loadBar) loadBar.style.width = Math.min(100, krokLad / KROKOW * 100) + '%';
  if (loadTxt) loadTxt.textContent = opis;
  // Oddaj klatkę przeglądarce, żeby pasek się przerysował. UWAGA: rAF jest
  // WSTRZYMYWANY w karcie w tle — bez awaryjnego setTimeout ładowanie wisiałoby
  // w nieskończoność u każdego, kto przełączy kartę podczas startu.
  return new Promise(r => {
    let gotowe = false;
    const koniec = () => { if (!gotowe) { gotowe = true; r(); } };
    requestAnimationFrame(() => setTimeout(koniec, 0));
    setTimeout(koniec, 150);
  });
}
if (loadTip) {
  loadTip.textContent = PORADY[Math.floor(Math.random() * PORADY.length)];
  setInterval(() => {
    if (loadOv && !loadOv.classList.contains('znika'))
      loadTip.textContent = PORADY[Math.floor(Math.random() * PORADY.length)];
  }, 2600);
}

(async function boot() {
  await ladowanie('Rozpakowywanie kości…');
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
  await buildChar('kura_braz', ['walk']);
  // postacie grywalne (potrzebne też do portretów w menu)
  // ===== VEGGIE FAMIGLIA =====
  await ladowanie('Budzenie Carrotella…');
  await buildChar('carrotello_squattello', ['idle', 'run', 'jump']);
  await ladowanie('Beetino zakłada okulary…');
  await buildChar('beetino_bouncerino', ['run', 'jump']);
  await ladowanie('Zwoływanie Famiglia Snackoni…');
  for (const w of ['chipsetti_soldatetti', 'marshmallini_fluffini', 'gummini_bouncini',
                   'friesetti_spearetti', 'sodino_explodino', 'lollini_spinnini']) {
    await buildChar(w, ['run']);
  }
  await ladowanie('Sadzenie krzaków…');
  await loadDecoMats();
  chunkMat = addCloudShadow(new THREE.MeshLambertMaterial({ map: grassTexC, vertexColors: true }));
  chunkMatIndoor = new THREE.MeshLambertMaterial({ map: floorTexC, vertexColors: true });
  shelfMat = new THREE.MeshLambertMaterial({ map: shelfTexture() });
  coolerMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#9fc6d8', '#5d8ba3', 5) });
  spillMat = new THREE.MeshBasicMaterial({ map: spillTexture(), transparent: true, depthWrite: false });
  grassMat = addWind(new THREE.MeshLambertMaterial({ map: bladeTexture(), alphaTest: 0.45,
    side: THREE.DoubleSide, transparent: false }), 0.22, 2.1);
  cloudShadowU.value = cloudShadowTexture();
  bladeMat = makeBladeMaterial();
  flowerMat = makeBladeMaterial(flowerTexture());
  stalkMat = makeBladeMaterial(stalkTexture());
  glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 });
  initLeafCards();
  initLeafSolids();
  initGrassField();
  crateMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#b98a4e', '#7d5a2e', 4) });
  plankMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#a9793f', '#6d4a22', 6) });
  stoneMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#9a9c96', '#6f7169', 3) });

  charKey = (META.chars[META.lastChar] && CHARS[META.lastChar]) ? META.lastChar : 'carrotello';
  mapKey = MAPS[META.lastMap] ? META.lastMap : 'laki';
  P.pos = new THREE.Vector3(0, 0, 0);
  P.y = terrainH(0, 0);
  playerBB = new Billboard(CHARS[charKey].char, CHARS[charKey].scale);
  initHitFlash();
  initLettuce();
  resetStats();          // P.pos musi istnieć PRZED chunkami i skrzyniami
  setMap(mapKey);        // buduje świat + rozstawia skrzynie/totemy
  await ladowanie('Ukrywanie skrzyń…');
  spawnChests(9);
  await ladowanie('Stawianie totemów…');
  spawnTotems(3, colImg);
  drawHearts();
  await ladowanie('Otwieranie sklepu…');
  renderShop(); renderMaps(); renderChars(); renderStats(); renderBestiary(); renderPick();
  AUDIO.initUI();        // suwaki głośności w zakładce Dźwięk
  // KLIK w UI: jeden delegat na cały dokument zamiast dopisywania dźwięku
  // do każdego przycisku osobno (menu jest generowane w kilku miejscach).
  addEventListener('pointerdown', ev => {
    if (ev.target.closest && ev.target.closest('.tab,.tile,.card,.bigbtn,.btn2,#jumpBtn')) AUDIO.sfx('klik');
  }, true);
  AUDIO.setPostac(charKey);
  AUDIO.menu();          // motyw główny — ruszy przy pierwszym kliknięciu (autoplay policy)
  fitCamera();
  camera.position.set(0, terrainH(0, 0) + CAM_H, CAM_DIST);
  camera.lookAt(0, 1.3, -2.2);
  refreshSpriteTilt();                   // pierwsza klatka też ma mieć poprawne pochylenie
  playerBB.update(0, P.pos, P.y, P.y);
  await ladowanie('Sól i cukier na pozycjach…');
  loop();
  await ladowanie('Gotowe!');
  if (loadOv) { loadOv.classList.add('znika'); setTimeout(() => loadOv.remove(), 500); }

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
  // ---- KODY ----
  const kodInfo = document.getElementById('kodInfo');
  const kodInput = document.getElementById('kodInput');
  function uzyjKodu() {
    const kod = (kodInput.value || '').trim();
    if (kod.toLowerCase() === 'rudeuszek2123') {
      for (const k of Object.keys(CHARS)) META.chars[k] = 1;          // wszystkie postacie
      for (const it of SHOP_UNLOCKS) META.unlocked[it.key] = 1;       // bronie i zdolności
      for (const it of SHOP) META.up[it.key] = it.max;                // ulepszenia na max
      META.coins += 5000;
      saveMeta();
      renderShop(); renderChars(); renderPick();
      if (typeof renderBestiary === 'function') renderBestiary();
      kodInfo.className = '';
      kodInfo.textContent = 'KOD PRZYJĘTY! Odblokowano wszystko + 5000 monet.';
      kodInput.value = '';
    } else if (kod) {
      kodInfo.className = 'zle';
      kodInfo.textContent = 'Nieznany kod.';
    }
  }
  document.getElementById('kodBtn').onclick = uzyjKodu;
  kodInput.addEventListener('keydown', e => {
    e.stopPropagation();                       // żeby spacja/WSAD nie sterowały grą
    if (e.code === 'Enter') uzyjKodu();
  });

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
    if (t.dataset.tab === 'bestia') renderBestiary();
    if (t.dataset.tab === 'sklep') renderShop();
  });
  // pauza
  document.getElementById('pauseBtn').onclick = () => togglePause(!G.paused);
  document.getElementById('btnResume').onclick = () => togglePause(false);
  document.getElementById('btnQuit').onclick = () => {
    togglePause(false);
    G.running = false; clearWorld();
    AUDIO.endRun();                               // z powrotem motyw główny
    document.getElementById('wArrow').style.display = 'none';
    menu.style.display = 'flex';
    saveMeta();                                   // zapisz liczniki bestiariusza z przerwanego biegu
    renderStats(); renderShop(); renderBestiary();
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
    wchest, META, CHARS, MAPS, ENEMY_TYPES, spawnEnemy, killEnemy, renderBestiary, saveMeta,
    setPlayerChar, togglePause, get charKey() { return charKey; }, AUDIO,
    setTilt(v) { SPRITE_TILT = v; refreshSpriteTilt(); },   // 0 = pionowe billboardy, 1 = do kamery
    przewrocRegaly, nova,
    get tilt() { return { SPRITE_TILT, kat: +(tiltKat * 180 / Math.PI).toFixed(1) }; },
    get grass() { return grassField; },
    PAD, pollPads, get camYaw() { return camYaw; }, get gpSel() { return gpSel; },
    step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) { pollPads(dt); if (G.running && !G.paused) update(dt); }
      renderer.render(scene, camera);
    },
  };
})();
