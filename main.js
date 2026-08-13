// HORDA 3D v4 — teren 3D + kamera za plecami + meta-progresja (monety/sklep)
import * as THREE from './lib/three.module.js';
import { SPRITEDATA } from './spritedata.js?v=10';
import { icon, ico } from './icons.js?v=4';
import { AUDIO } from './audio.js?v=4';            // muzyka wg fazy gry + kwestie głosowe + efekty

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
                // dmg 0.9 → 1.0: jedyna postać w grze z KARĄ do obrażeń była
                // jednocześnie tą, którą gra się na starcie. Jej tożsamość to
                // szybkość (1.15) i magnes (1.3), nie słabsze ciosy.
                char: 'carrotello_squattello', price: 0, spd: 1.15, hp: 0, dmg: 1.0, mag: 1.3, scale: 1.22 },
  // Beetino idzie za ZABÓJSTWA, nie za monety (250 monet uzbierało się już
  // w drugim biegu, więc jako zakup nie był żadnym celem).
  // PRÓG 450 = TRZECI BIEG. Zmierzona ścieżka nowego gracza: bieg 1 ≈ 60 zabójstw,
  // bieg 2 ≈ 150, bieg 3 ≈ 250 → łącznie ~460. Nagroda ma przyjść, GDY GRACZ
  // JESZCZE NIE WIE, czy zostaje — nie po ośmiu biegach.
  beetino:    { nm: 'Beetino Bouncerino', ds: 'Buraczino Betonino — czołg z bramki. Wolny, ale twardy.',
                char: 'beetino_bouncerino', price: 0, killGoal: 450, startWpn: 'wypad',
                spd: 0.85, hp: 3, dmg: 1.1, mag: 0.9, scale: 1.32 },
  // Statystyki wprost z biblii postaci (HP 110 · Speed 0.9 · Might 1.0 · Pickup 1.1).
  // Postac DO KUPIENIA: przy nowej ekonomii 700 monet wypada na ~6. biegu, czyli
  // dokladnie tam, gdzie mial byc drugi przystanek progresji.
  // Radishetta Razoretta — szybka i krucha: seria scyzorykow przed siebie.
  // Cena 500: ma wpasc miedzy Beetina (450 zabojstw) a Granny (700 monet).
  razoretta:  { nm: 'Radishetta Razoretta', ds: 'Rzodkiewka z piornikiem — seria scyzorykow, ale cienka skora.',
                char: 'radishetta_razoretta', price: 500, startWpn: 'scyzoryk',
                spd: 1.2, hp: -1, dmg: 1.25, mag: 1.0, scale: 1.2 },
  granny:     { nm: 'Granny Smithella', ds: 'Babuszkina Jabłuszkina — kapeć wraca jak bumerang.',
                char: 'granny_smithella', price: 700, startWpn: 'ciabatta',
                spd: 0.9, hp: 1, dmg: 1.0, mag: 1.1, scale: 1.28 },
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

// ============================== TRYB DEWELOPERSKI ==============================
// Recznie wycinanie debugu przed kazdym wydaniem to gwarancja, ze kiedys sie zapomni
// (albo, co gorsza, wyciagnie sie za duzo i `tester-gry` przestanie dzialac).
// Podglad i agenci chodza po localhoscie, wiec na localhoscie DEV jest wlaczony,
// a GitHub Pages / Capacitor / Steam dostaja wersje bez `window.HORDA`, bez lapacza
// bledow i bez pola na kody. `?dev=1` wlacza go recznie do diagnostyki na telefonie.
// ⚠️ PORT JEST TU KLUCZOWY, nie sama nazwa hosta. Pierwsza wersja tej flagi
// (13.08) sprawdzala `hostname === 'localhost' || hostname === ''` i przez to
// WLACZALA DEV DOKLADNIE TAM, GDZIE MIALA GO WYLACZYC:
//   • Capacitor na Androidzie serwuje z `http://localhost` (bez portu),
//   • Electron / webview Steama laduje z `file://`, czyli `hostname === ''`.
// Czyli `window.HORDA` z edytowalnym `META.coins` i pole na kod jechalyby na
// telefony i na Steama. Nasz podglad chodzi na porcie 8123 — to on rozstrzyga.
const DEV = location.search.includes('dev=1')
  || ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      && location.port === '8123');

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

// ============================== NIEBO Z GRADIENTEM ==============================
// Kopuła jeżdżąca za kamerą (r=1 × skala 300 przy camera.far = 400). `fog:false`,
// `depthWrite:false` i renderOrder −1000 → rysuje się PIERWSZA i nie wchodzi nikomu
// w z-bufor. KOLOR DOLNY MUSI RÓWNAĆ SIĘ `scene.fog.color` (czyli `MAPS[...].sky`),
// inaczej dalekie wzgórza wtapiają się w inny kolor niż niebo za nimi = szew.
// Gradient jest KWANTOWANY na pasy — gładkie przejście wygląda jak z Unity,
// a nie jak tło pixel-artowej gry.
const SKY = {
  laki:   { dol: 0x9cc8ec, srodek: 0x7fb6e6, gora: 0x4a86cf, slonce: 0xfff0c4, pasy: 16 },
  market: { dol: 0xb8bfc7, srodek: 0xacb4bd, gora: 0x939ba5, slonce: 0xd8d8d0, pasy: 0 },
};
const skyU = {
  uDol:    { value: new THREE.Color(SKY.laki.dol) },
  uSrodek: { value: new THREE.Color(SKY.laki.srodek) },
  uGora:   { value: new THREE.Color(SKY.laki.gora) },
  uSlonce: { value: new THREE.Color(SKY.laki.slonce) },
  uSunDir: { value: SUN_OFF.clone().normalize() },
  uPasy:   { value: SKY.laki.pasy },
};
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uDol, uSrodek, uGora, uSlonce, uSunDir;
    uniform float uPasy;
    varying vec3 vDir;
    void main() {
      float h = clamp(vDir.y, -0.2, 1.0);
      float hq = uPasy > 0.5 ? floor(h * uPasy + 0.5) / uPasy : h;   // pasy zamiast gładzi
      vec3 col = mix(uDol, uSrodek, smoothstep(0.00, 0.24, hq));
      col = mix(col, uGora,        smoothstep(0.20, 0.80, hq));
      float sd = max(dot(vDir, normalize(uSunDir)), 0.0);            // ciepła poświata od słońca
      col = mix(col, uSlonce, pow(sd, 7.0) * 0.55);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
}));
skyDome.scale.setScalar(300);
skyDome.frustumCulled = false;
skyDome.renderOrder = -1000;
scene.add(skyDome);
function setSky(key) {
  const S = SKY[key] || SKY.laki;
  skyU.uDol.value.setHex(S.dol);
  skyU.uSrodek.value.setHex(S.srodek);
  skyU.uGora.value.setHex(S.gora);
  skyU.uSlonce.value.setHex(S.slonce);
  skyU.uPasy.value = S.pasy;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  applyResolution();
  fitCamera();
  if (typeof przeliczWylot === 'function') przeliczWylot();   // wylot lufy zmienia miejsce z rozmiarem okna
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
// Sześć osobnych bryłek na regał (a regałów jest ~850) dawało 5100 mesh'y
// i 610 draw calli tylko na market — pomiar audytu: 4.73 ms renderu przy PUSTEJ
// arenie i wzrost do 6.44 ms po ZMNIEJSZENIU okna, czyli koszt siedzi w liczbie
// obiektów, nie w pikselach. Scalamy więc bryłki w jedną geometrię i wystawiamy
// je jako INSTANCJE per chunk: 3 draw calle na chunk zamiast 3 na regał.
// Geometrię budujemy dla kier = +1; kier = -1 to ta sama bryła obrócona o 180°.
function scalBryly(bryly) {
  const poz = [], nor = [], uv = [], idx = [];
  for (const b of bryly) {
    const g = new THREE.BoxGeometry(b.sx, b.sy, b.sz);
    g.translate(0, b.ly, b.lz);
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, ind = g.index;
    const off = poz.length / 3;
    for (let i = 0; i < p.count; i++) {
      poz.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
    }
    for (let i = 0; i < ind.count; i++) idx.push(ind.getX(i) + off);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(poz, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
let regalGeo = null;          // { korpus, polkiDol, polkiGora }
function initRegalGeo() {
  const len = 7, O = -0.8;                        // O = przesunięcie względem pivotu (krawędź podstawy)
  regalGeo = {
    korpus: scalBryly([{ sx: len, sy: SHELF_H, sz: 1.6, ly: SHELF_H / 2, lz: O }]),
    // dolne półki + blat: to, co zostaje widoczne po przewróceniu
    polkiDol: scalBryly([
      { sx: len, sy: 0.14, sz: 0.6, ly: 0.8, lz: 1.05 + O },
      { sx: len, sy: 0.14, sz: 0.6, ly: 1.6, lz: 1.05 + O },
      { sx: len + 0.3, sy: 0.16, sz: 2.1, ly: SHELF_H + 0.08, lz: O },
    ]),
    // te dwie po obrocie STAJĄ PIONOWO i wystają na 2.15 j., więc na czas
    // leżenia chowamy je (zerowa skala instancji)
    polkiGora: scalBryly([
      { sx: len, sy: 0.14, sz: 0.6, ly: 0.8, lz: -1.05 + O },
      { sx: len, sy: 0.14, sz: 0.6, ly: 1.6, lz: -1.05 + O },
    ]),
  };
}
const _rm = new THREE.Matrix4(), _rq = new THREE.Quaternion(), _rp = new THREE.Vector3(), _rs = new THREE.Vector3(1, 1, 1);
const _rzero = new THREE.Vector3(0, 0, 0);
// zapisuje macierz instancji regału (obrót przewracania + yaw dla kierunku)
function ustawRegal(s, kat) {
  _rp.set(s.x, s.g0, s.pivotZ);
  _rq.setFromEuler(new THREE.Euler(kat, s.kier === 1 ? 0 : Math.PI, 0));
  _rm.compose(_rp, _rq, _rs);
  s.inst.korpus.setMatrixAt(s.i, _rm);
  s.inst.polkiDol.setMatrixAt(s.i, _rm);
  if (s.stan === 'lezy') { _rm.compose(_rp, _rq, _rzero); }      // schowane górne półki
  s.inst.polkiGora.setMatrixAt(s.i, _rm);
  s.inst.korpus.instanceMatrix.needsUpdate = true;
  s.inst.polkiDol.instanceMatrix.needsUpdate = true;
  s.inst.polkiGora.instanceMatrix.needsUpdate = true;
}

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

// ================= POLE NACISKU: TRAWA UGINA SIĘ POD HORDĄ =================
// 500 pozycji wrogów nie da się przekazać do shadera uniformami, więc — jak w każdym
// dużym silniku — trzymamy je w TEKSTURZE wokół gracza, a vertex shader czyta ją per kępkę.
// RESEARCH (Ghost of Tsushima, GDC 2022: „displacement buffer"; Helio/Pulsar foliage
// system; tutoriale UE4 Kodeco i Unity): NIKT nie liczy kierunku z gradientu skalara.
// Standard to POLE WEKTOROWE (flowmap) wokół gracza:
//   • RG = kierunek położenia trawy, 128 = zero (jak w normal mapie: v*0.5+0.5),
//     zapisywany PROSTO z ruchu interaktora — trawa kładzie się TAM, GDZIE KTOŚ PRZEBIEGŁ,
//   • B  = siła zgniecenia (max, nie suma — inaczej tłum zeruje wszystko),
//   • pole snapowane do texela i przesuwane o CAŁE texele (zero resamplingu),
//   • zanik WYKŁADNICZY (`v *= exp(-dt/tau)`) — trawa wstaje, za hordą zostaje ślad.
// ⚠️ PIERWSZA WERSJA (v89) brała kierunek z GRADIENTU skalarnego pola i wyglądała jak
// KRATER: trawa kładła się promieniście wokół gracza (kółko jak po eksplozji), plama
// miała 4 j. średnicy przy postaci szerokiej na 0.6, przeskakiwała o cały texel (0.75 j.),
// falloff miał trzy stopnie → widoczne kwadraty texeli, a amplituda (0.95 j. w LOKALNYCH
// jednostkach, przy skali instancji xz≈1.2 / y≈0.7) wywalała czubek DWA RAZY DALEJ niż
// kępka jest wysoka — stąd „rozsypana słoma" zamiast położonej trawy.
const TR_RES = 160, TR_SPAN = 56;                  // 0.35 j./texel (było 0.75 = widoczna krata)
const TR_ST = TR_SPAN / TR_RES;
const trBuf = new Uint8Array(TR_RES * TR_RES * 4);
const trU32 = new Uint32Array(trBuf.buffer);       // szybkie przesuwanie + test „texel spokojny"
const trampleTex = new THREE.DataTexture(trBuf, TR_RES, TR_RES, THREE.RGBAFormat);
trampleTex.minFilter = trampleTex.magFilter = THREE.LinearFilter;
trampleTex.wrapS = trampleTex.wrapT = THREE.ClampToEdgeWrapping;
trampleTex.needsUpdate = true;
// Stan spoczynku trzymamy jako jedno uint32, żeby pętla zaniku przeskakiwała pusty
// texel JEDNYM porównaniem (przy pustym polu cała aktualizacja jest wtedy darmowa).
trBuf[0] = 128; trBuf[1] = 128; trBuf[2] = 0; trBuf[3] = 255;
const TR_REST = trU32[0];
trU32.fill(TR_REST);
const trampleU = { value: trampleTex };
const trCenterU = { value: new THREE.Vector2(1e9, 1e9) };
const trKatU = { value: 1.02 };                    // maks. pochylenie kępki w radianach (~58°)
let trCx = 1e9, trCz = 1e9;
let trAktywne = 0;                                 // zajęte texele (diagnostyka wydajności)

// STEMPEL. Środek jest PODTEXELOWY (plama płynie za postacią, zamiast przeskakiwać
// o texel), spadek gładki (smoothstep — zero plateau i schodków), a kierunek to
// mieszanka RUCHU interaktora i rozpychania na boki: postać stojąca rozgarnia trawę
// promieniście (mały krążek pod stopami), biegnąca kładzie ją w stronę biegu.
function stampTrample(x, z, vx, vz, promien, moc) {
  const cx = (x - trCx) / TR_ST + TR_RES * 0.5;
  const cz = (z - trCz) / TR_ST + TR_RES * 0.5;
  const rT = promien / TR_ST;
  const i0 = Math.max(0, Math.ceil(cx - rT)), i1 = Math.min(TR_RES - 1, Math.floor(cx + rT));
  const j0 = Math.max(0, Math.ceil(cz - rT)), j1 = Math.min(TR_RES - 1, Math.floor(cz + rT));
  if (i1 < i0 || j1 < j0) return;
  const vl = Math.sqrt(vx * vx + vz * vz);
  const wR = vl < 3.2 ? vl / 3.2 : 1;              // im szybciej, tym mocniej rządzi kierunek biegu
  const mx = vl > 0.02 ? vx / vl : 0, mz = vl > 0.02 ? vz / vl : 0;
  const invR = 1 / rT, wPro = 1 - wR * 0.55;
  for (let j = j0; j <= j1; j++) {
    const dz = j - cz, dz2 = dz * dz;
    for (let i = i0; i <= i1; i++) {
      const dx = i - cx;
      const d = Math.sqrt(dx * dx + dz2);
      if (d > rT) continue;
      const t = 1 - d * invR;
      const s = t * t * (3 - 2 * t) * moc;
      const inv = d > 0.001 ? wPro / d : 0;
      let kx = mx * wR + dx * inv, kz = mz * wR + dz * inv;
      const kl = Math.sqrt(kx * kx + kz * kz) || 1;
      const o = (j * TR_RES + i) * 4;
      // RG = SUMA wektorów: naciski z przeciwnych stron znoszą się, więc w środku
      // ciżby zostaje samo zgniecenie w dół (B) bez losowego kierunku — tak jak w naturze.
      const r = trBuf[o] - 128 + kx / kl * s * 110, g = trBuf[o + 1] - 128 + kz / kl * s * 110;
      trBuf[o] = r < -127 ? 1 : r > 127 ? 255 : 128 + r;
      trBuf[o + 1] = g < -127 ? 1 : g > 127 ? 255 : 128 + g;
      const b = s * 255;
      if (b > trBuf[o + 2]) trBuf[o + 2] = b;
      trBuf[o + 3] = 255;                          // A pilnuje, by texel nie udawał spoczynku
    }
  }
}
function updateTrample(dt) {
  if (MAPS[mapKey].indoor) return;                 // w markecie nie ma trawy
  // ŚRODEK SNAPOWANY DO TEXELA: bez tego te same punkty świata wypadałyby po każdym
  // przesunięciu w innym miejscu texela i cały dywan drgałby przy marszu.
  const nx = Math.round(P.pos.x / TR_ST) * TR_ST, nz = Math.round(P.pos.z / TR_ST) * TR_ST;
  if (nx !== trCx || nz !== trCz) {
    const dx = Math.round((nx - trCx) / TR_ST), dz = Math.round((nz - trCz) / TR_ST);
    if (!isFinite(dx) || !isFinite(dz) || Math.abs(dx) >= TR_RES || Math.abs(dz) >= TR_RES) {
      trU32.fill(TR_REST);
    } else {
      // Przesunięcie o CAŁE texele = ślady przyklejone do świata (wygięta trawa nie
      // jedzie za graczem). Kopiujemy CAŁYMI RZĘDAMI przez copyWithin (memmove),
      // bez bufora pomocniczego; kolejność rzędów wg znaku dz, żeby nie nadpisać źródła.
      const i0 = Math.max(0, -dx), i1 = Math.min(TR_RES, TR_RES - dx);
      const rzad = j => {
        const src = j + dz, d0 = j * TR_RES;
        if (src < 0 || src >= TR_RES || i1 <= i0) { trU32.fill(TR_REST, d0, d0 + TR_RES); return; }
        const s0 = src * TR_RES;
        trU32.copyWithin(d0 + i0, s0 + i0 + dx, s0 + i1 + dx);
        if (i0 > 0) trU32.fill(TR_REST, d0, d0 + i0);
        if (i1 < TR_RES) trU32.fill(TR_REST, d0 + i1, d0 + TR_RES);
      };
      if (dz > 0) for (let j = 0; j < TR_RES; j++) rzad(j);
      else for (let j = TR_RES - 1; j >= 0; j--) rzad(j);
    }
    trCx = nx; trCz = nz;
    trCenterU.value.set(nx, nz);
  }
  // ZANIK WYKŁADNICZY (tau 0.45 s): trawa wstaje, więc za hordą zostaje ślad na ~1.2 s.
  const zanik = Math.exp(-dt / 0.45);
  let akt = 0;
  for (let k = 0, o = 0; k < trU32.length; k++, o += 4) {
    if (trU32[k] === TR_REST) continue;            // pusty texel = jedno porównanie
    const r = (trBuf[o] - 128) * zanik, g = (trBuf[o + 1] - 128) * zanik, b = trBuf[o + 2] * zanik;
    if (b < 2 && r > -2 && r < 2 && g > -2 && g < 2) { trU32[k] = TR_REST; continue; }
    trBuf[o] = 128 + r; trBuf[o + 1] = 128 + g; trBuf[o + 2] = b;
    akt++;
  }
  trAktywne = akt;
  // Promienie stempli ~= promień postaci (0.4-0.6), nie 2 j. jak w v89. Kierunek gracza
  // z jego prędkości, wrogów — z wektora do celu (i tak wszyscy idą po gracza).
  stampTrample(P.pos.x, P.pos.z, P.vx, P.vz, 0.62, 1);
  for (const e of G.enemies) {
    if (e.dying) continue;
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1, s = e.T.speed / d;
    stampTrample(e.pos.x, e.pos.z, dx * s, dz * s,
                 e.T.boss ? 1.5 : e.elite ? 0.66 : 0.44, e.T.boss ? 1 : 0.92);
  }
  trampleTex.needsUpdate = true;
}
function makeBladeMaterial(mapa = null, gietkosc = 1) {
  const m = new THREE.MeshBasicMaterial({ map: mapa || clumpTexture(), alphaTest: 0.42,
    side: THREE.DoubleSide, vertexColors: true });
  addCloudShadow(m);
  const _wind = m.onBeforeCompile;
  m.onBeforeCompile = sh => {
    if (_wind) _wind(sh);                          // ⚠️ łańcuch onBeforeCompile — nie nadpisywać
    sh.uniforms.uTime = windU;
    sh.uniforms.uCenter = grassCenterU;
    sh.uniforms.uR = grassRU;
    sh.uniforms.uTr = trampleU;
    sh.uniforms.uTrC = trCenterU;
    sh.uniforms.uTrKat = trKatU;
    sh.vertexShader = 'uniform float uTime;uniform vec2 uCenter;uniform float uR;' +
      'uniform sampler2D uTr;uniform vec2 uTrC;uniform float uTrKat;\n' +
      sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 iP = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float dC = distance(iP.xz, uCenter);
       float fade = 1.0 - smoothstep(uR - 22.0, uR - 0.5, dC);  // bardzo szerokie wtapianie
       transformed.y *= fade;
       float h = max(position.y, 0.0);
       // ---- POLE NACISKU: RG = kierunek położenia, B = siła ----
       vec2 tuv = (iP.xz - uTrC) * ${(1 / TR_SPAN).toFixed(7)} + 0.5;
       // okno wygasza pole na krawędzi tekstury: bez tego ClampToEdge rozsmarowałby
       // brzegowy texel na CAŁĄ dalszą trawę w tym kierunku
       vec2 tw = smoothstep(0.0, 0.04, tuv) * (1.0 - smoothstep(0.96, 1.0, tuv));
       vec4 tr = texture2D(uTr, tuv);
       float nac = tr.b * tw.x * tw.y;
       float sw = sin(uTime * 2.2 + iP.x * 0.45 + iP.z * 0.35) * 0.28 * h * fade
                + sin(uTime * 0.7 + iP.x * 0.08) * 0.10 * h * fade;   // druga, wolna fala
       sw *= 1.0 - nac * 0.85;                     // przygnieciona trawa nie kołysze się na wiatrze
       transformed.x += sw;
       transformed.z += sw * 0.45;
       // ---- UGINANIE POD HORDĄ ----
       if (nac > 0.004) {
         vec2 kier = tr.rg * 2.0 - 1.0;
         float kl = length(kier);
         if (kl > 0.06) {
           // Kładziemy kępkę KĄTEM (bok = sin, wysokość = cos), a nie samym przesunięciem
           // w poziomie — czubek zostaje wtedy na łuku wokół nasady, zamiast odjeżdżać
           // od korzenia (to była „rozsypana słoma" z v89). Kąt maks. ~58°, bo przy
           // płasko leżących skrzyżowanych quadach widać teksturę z boku = kreski.
           float hs = fract(sin(dot(iP.xz, vec2(12.9898, 78.233))) * 43758.5453);
           float kat = uTrKat * ${gietkosc.toFixed(3)} * nac * (0.78 + 0.44 * hs);
           // KOREKTA PROPORCJI INSTANCJI: kępka jest szersza niż wyższa (skala xz ~1.2,
           // y ~0.7), a przesunięcie liczymy w LOKALNYCH jednostkach — bez tego ten sam
           // „kąt" wywala czubek dwa razy dalej, niż kępka jest wysoka.
           float sxz = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
           transformed.xz += (kier / kl) * sin(kat) * h * fade * (sy / max(sxz, 0.001));
           transformed.y *= cos(kat);
         }
       }`);
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
  // Przebudowa kosztuje ~9.6 ms (siatka 171x171). Przy progu 1.2 j. i predkosci
  // 7.1 j./s wypadala SZESC RAZY NA SEKUNDE = 58 ms/s zjedzone i szesc zadlawien.
  // Shader wtapia zdzbla w 22 j., wiec 6 j. progu nikomu nie wyskoczy przed nosem.
  if (Math.hypot(P.pos.x - grassCenter.x, P.pos.z - grassCenter.y) < 6) return;
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

// ile PUSTYCH pikseli jest pod stopami w pierwszej klatce arkusza
function dolnaKrawedz(img, size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0, size, size, 0, 0, size, size);
  const d = g.getImageData(0, 0, size, size).data;
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) if (d[(y * size + x) * 4 + 3] > 8) return size - 1 - y;
  }
  return 0;
}
async function buildChar(name, anims) {
  const def = SPRITEDATA[name];
  const img = await loadImage(def.img);
  const size = def.size;
  // FOOTOFF LICZONY Z ALFY, a nie brany z pliku: packer wpisuje tam zero na
  // sztywno, wiec kazda nowo zapakowana postac unosila sie nad trawa o tyle
  // pustego miejsca, ile arkusz ma pod stopami (Carrotello mial 23 wpisane
  // recznie, przepakowany Beetino dostal 0 i zaczal lewitowac).
  LIB[name] = { size, footOff: dolnaKrawedz(img, size), anims: {}, img };
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
    // MATERIAŁ MUSI BYĆ OD RAZU. Mesh powstaje z `null`, a materiał dostaje
    // dopiero w `update()` — jeśli cokolwiek zrenderuje scenę PRZED pierwszym
    // update'em tego billboardu, three.js czyta `material.visible` z null
    // i cała klatka leci wyjątkiem (WebGLRenderer.projectObject).
    // Trafia to każdy byt tworzony w środku pętli, po której iterujemy od końca
    // (np. mini-ziarna bomby kasetowej dopisywane na koniec `G.kury`).
    const A0 = LIB[char].anims[this.anim];
    if (A0) {
      const d0 = A0.dirs.south || A0.dirs[Object.keys(A0.dirs)[0]];
      if (d0 && d0.length) this.mesh.material = d0[0];
    }
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
    // FOOTY MUSI BYĆ SKRÓCONE O `cos(pochylenia)`. Zsuwamy sprite'a w dół o tyle
    // pustych pikseli, ile arkusz ma pod stopami — ale to przesunięcie było liczone
    // dla PIONOWEGO billboardu. Po pochyleniu do kamery każdy odcinek wysokości
    // skraca się o cos(kąt), więc stopy schodziły pod ziemię (u Carrotella 0.11 j.
    // przy 32°). Na Łąkach zasłaniała to trawa, w markecie gładka podłoga ucinała nogi.
    this.mesh.position.set(pos.x, ty + this.footY * Math.cos(tiltKat), pos.z);
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
  const linie = [[3, 60, '#2b3550', 2], [124, 68, '#2b3550', 2],
                 [34, 62, '#3d4a6b', 1], [93, 66, '#3d4a6b', 1]];
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
// ============================== FOLIOWA TORBA (spadochron) ==============================
// Był to płaski billboard z liściem sałaty i wyglądał źle z prostego powodu:
// spadochron czyta się dopiero jako WYGIĘTA CZASZA. Teraz jest to kopuła 3D
// (górna czapa sfery) z falującym rantem, a motyw zmieniono na nadmuchującą się
// torbę z marketu — śmieszniej i spójnie ze sklepem.
function torbaTexture() {
  const W = 64, H = 32;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#eef3fa'; g.fillRect(0, 0, W, H);                 // biała folia
  for (let x = 0; x < W; x += 4) {                                  // pionowe zagniecenia
    g.fillStyle = (x / 4) % 2 ? '#dde5f0' : '#f7fbff';
    g.fillRect(x, 0, 2, H);
  }
  g.fillStyle = '#c9d4e2';                                          // cień pod rantem
  g.fillRect(0, H - 6, W, 6);
  g.fillStyle = '#e0524f'; g.fillRect(0, 11, W, 5);                 // czerwony pas „marketu"
  g.fillStyle = '#f2f6fb'; g.fillRect(0, 13, W, 1);
  g.fillStyle = '#2b3550';                                          // pixelowy napis-plamka na pasie
  for (const x of [8, 14, 20, 30, 36, 46, 52]) g.fillRect(x, 12, 3, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let lettuce = null, sznurki = null, salataMat = null;
function initLettuce() {
  // GÓRNA CZAPA SFERY = czasza. thetaLength 0.46π daje kopułę trochę większą niż
  // półkula, więc rant lekko podwija się do dołu tak jak w napełnionej torbie.
  const geo = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.46);
  const m = new THREE.MeshBasicMaterial({ map: torbaTexture(), transparent: true,
    opacity: 0.93, side: THREE.DoubleSide, depthWrite: false });
  // FALOWANIE RANTU w vertex shaderze: im dalej od czubka (position.y niżej), tym
  // mocniejszy ruch — czubek jest napięty, dół trzepocze.
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = windU;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float kraw = 1.0 - clamp(position.y, 0.0, 1.0);          // 0 na czubku, 1 na rancie
       float kat = atan(position.z, position.x);
       transformed.y += sin(uTime * 7.0 + kat * 3.0) * 0.11 * kraw * kraw;
       transformed.x *= 1.0 + sin(uTime * 5.0 + kat * 2.0) * 0.05 * kraw;
       transformed.z *= 1.0 + cos(uTime * 5.4 + kat * 2.0) * 0.05 * kraw;`);
  };
  lettuce = new THREE.Mesh(geo, m);
  lettuce.scale.set(1.75, 1.25, 1.75);
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
  const czaszaY = P.y + 2.35 + Math.sin(G.time * 3) * 0.07;
  lettuce.position.set(P.pos.x, czaszaY, P.pos.z);
  // czasza jest bryłą obrotową, więc NIE billboardujemy jej do kamery — tylko
  // przechylamy na boki razem z kołysaniem lotu (obrót w Y daje ruch tekstury)
  lettuce.rotation.set(kolysanie * 0.5, G.time * 0.35, kolysanie);
  // uchwyty: od barków (P.y + 1.1) do rantu czaszy, kołyszą się z nią
  const barki = P.y + 1.1;
  sznurki.position.set(P.pos.x + kolysanie * 0.25, barki, P.pos.z);
  sznurki.scale.set(1.9, Math.max(0.2, czaszaY - 0.22 - barki), 1);
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
  // Ta sama nakładka obsługuje DWA stany: czerwony błysk po ciosie i złotą
  // poświatę NIETYKALNOŚCI. Zero nowych obiektów w scenie.
  const niet = G.buff.key === 'niet';
  const on = (P.iframes > 0 || niet) && !G.dying && !G.fps.on;
  hitFlash.visible = on;
  if (!on) return;
  hitFlashMat.color.setHex(niet ? 0xffd75e : 0xff2a2a);
  hitFlashMat.map = playerBB.mesh.material.map;          // ta sama klatka co postać
  hitFlashMat.opacity = niet ? 0.28 + 0.22 * Math.abs(Math.sin(G.time * 7))
                             : 0.35 + 0.45 * Math.abs(Math.sin(P.iframes * 22));
  hitFlashMat.needsUpdate = true;
  hitFlash.scale.copy(playerBB.mesh.scale);
  hitFlash.position.copy(playerBB.mesh.position);
  hitFlash.quaternion.copy(playerBB.mesh.quaternion);   // billboardy chodzą na kwaternionach
}

// ============================== META (localStorage) ==============================
const META_KEY = 'horda3d_meta_v1';
function loadMeta() {
  const def = () => ({
    coins: 0, up: { serce: 0, dmg: 0, szyb: 0, magnes: 0, klatwa: 0, karabin: 0 }, unlocked: {},
    chars: { carrotello: 1 }, lastChar: 'carrotello', lastMap: 'laki',
    // `chests` = złote skrzynie z bronią, `skrzynki` = zwykłe (od nich zależy
    // wyreżyserowana sekwencja pierwszych sześciu nagród)
    st: { kills: 0, runs: 0, time: 0, best: 0, bestKills: 0, bosses: 0, coins: 0, chests: 0, skrzynki: 0, lvl: 0 },
    bestiary: {},                                  // typ wroga -> ile razy zabity (bestiariusz)
    audio: { muz: 0.15, glos: 0.9, efe: 0.7, mute: 0 },   // głośności i wyciszenie (zakładka Dźwięk)
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
// dopisanie na siłę czekającego zapisu (patrz handlery `pagehide`/`visibilitychange`)
function flushMeta() {
  if (!saveT) return;
  clearTimeout(saveT); saveT = 0;
  saveMeta();
}
AUDIO.init(META, saveMeta);                        // dźwięk czyta/zapisuje głośności w META

// Ceny wejścia podniesione razem z dopływem monet (×1.8): przy starych 30-40
// pierwszy bieg wystarczał na 2-3 zakupy i sklep nie stawiał żadnego pytania.
const SHOP = [
  { key: 'serce',  ico: 'serce', nm: 'Twarde serce',   ds: '+1 serce na start',      base: 80, max: 3 },
  { key: 'dmg',    ico: 'fala', nm: 'Siła', ds: '+10% obrażeń na stałe',  base: 60, max: 5 },
  { key: 'szyb',   ico: 'but', nm: 'Kondycja',       ds: '+8% szybkości na stałe', base: 60, max: 5 },
  { key: 'magnes', ico: 'magnes', nm: 'Przyciąganie',   ds: '+20% magnesu na stałe',  base: 50, max: 5 },
  // KLĄTWA: gracz KUPUJE SOBIE WIĘCEJ WROGÓW. Chwyt z Vampire Survivors (Curse
  // i Charm) — to wentyl na „wykupiłem cały sklep i nie mam po co grać": zamiast
  // końca progresji dostajesz dźwignię. Więcej wrogów = więcej XP i monet.
  { key: 'klatwa', ico: 'ostrzezenie', nm: 'Klątwa Nonny',
    ds: 'Wrogowie twardsi i liczniejsi, ale monety sypią się gęściej', base: 120, max: 5 },
  // Sam KARABIN wypada ze skrzyni (nie da się go kupić) — w sklepie kupujesz tylko
  // DŁUŻSZY tryb. Inaczej najmocniejsza rzecz w grze byłaby na stałe za monety.
  { key: 'karabin', ico: 'celownik', nm: 'Magazynek Nonny',
    ds: '+5 s trybu KARABIN (baza 20 s)', base: 300, max: 3 },
];
// odblokowania broni i pasywów (jednorazowe — wchodzą do puli kart w biegu)
const SHOP_UNLOCKS = [
  { key: 'piorun',   ico: 'pioruny', nm: 'Piorun',          ds: 'Grom bije losowych wrogów',      price: 150 },
  { key: 'butelka',  ico: 'butelka', nm: 'Butelka żula',    ds: 'Leci łukiem i wybucha',          price: 200 },
  { key: 'bumerang', ico: 'pizza', nm: 'Pizza Volante',   ds: 'Koło pizzy leci i wraca, kosząc po drodze', price: 250 },
  { key: 'tarcza',   ico: 'tarcza', nm: 'Tarcza',         ds: 'Blokuje 1 trafienie co jakiś czas', price: 120 },
  { key: 'djump',    ico: 'skok', nm: 'Podwójny skok',         ds: 'Drugi skok w powietrzu — przeskakuj regały (bywa też w skrzyniach)', price: 300 },
  { key: 'glide',    ico: 'skok', nm: 'Foliowa torba',           ds: 'PRZYTRZYMAJ skok w locie = szybujesz na torbie i uciekasz hordzie', price: 250 },
  { key: 'skarpeta', ico: 'skarpeta', nm: 'Skarpeta', ds: 'Śmierdząca aura truje wokół', price: 180 },
  { key: 'wiatrowka', ico: 'wiatr', nm: 'Wiatrówka',      ds: 'Promień przeszywa całą linię', price: 220 },
  { key: 'kura',     ico: 'kukurydza', nm: 'Kernello Boomello', ds: 'Ziarno biegnie do wroga i strzela jak popcorn', price: 350 },
  { key: 'pipsini', ico: 'pestka', nm: 'Pipsini Nipotini', ds: 'Pestka-towarzysz: biega, tłucze i sadzi kiełki', price: 320 },
  { key: 'sokowirowka', ico: 'sokowirowka', nm: 'Sokowirówka', ds: 'STAWIASZ ją i sama miele wrogów — ustaw ją w alejce', price: 280 },
];
// Cena rośnie nie tylko z poziomem POZYCJI, ale i z liczbą WSZYSTKICH zakupów
// (+10% każdy). U Vampire Survivors 91% pełnego kosztu maksowania meta-sklepu to
// sam narzut skalowania — to on robi całą długość gry, nie liczba pozycji.
const zakupyRazem = () => Object.values(META.up).reduce((a, b) => a + b, 0);
const shopPrice = it => Math.round(it.base * Math.pow(2, META.up[it.key]) * (1 + 0.10 * zakupyRazem()));

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
// czy postać jest już nasza (kupiona ALBO wypracowana zabójstwami)
const maszPostac = (key) => !!META.chars[key] ||
  (CHARS[key].killGoal && META.st.kills >= CHARS[key].killGoal);
// Wywoływane z `killEnemy`: odblokowanie ma wystrzelić W TRAKCIE biegu, bo toast
// w środku walki jest mocniejszy niż komunikat na ekranie śmierci.
// Kamienie milowe co 500 dzielą duży cel na cztery mniejsze.
function sprawdzOdblokowaniaPostaci() {
  for (const key of Object.keys(CHARS)) {
    const C = CHARS[key];
    if (!C.killGoal || META.chars[key]) continue;
    if (META.st.kills >= C.killGoal) {
      META.chars[key] = 1; saveMeta(); renderChars();
      toastBuff('NOWA POSTAĆ: ' + C.nm.toUpperCase() + '!');
      AUDIO.sfx('zlota');
    } else if (META.st.kills % Math.max(50, Math.round(C.killGoal / 3)) === 0) {
      // kamienie milowe LICZONE OD CELU (trzy przystanki), nie na sztywno co 500 —
      // przy progu 450 komunikat co 500 nie pojawiłby się ani razu
      toastBuff(C.nm.split(' ')[0].toUpperCase() + ': ' + META.st.kills + '/' + C.killGoal);
    }
  }
}
function renderChars() {
  const wrap = document.getElementById('charGrid'); wrap.innerHTML = '';
  for (const key of Object.keys(CHARS)) {
    const C = CHARS[key];
    const owned = maszPostac(key);
    const d = document.createElement('div');
    d.className = 'tile' + (key === charKey ? ' sel' : '') + (owned ? '' : ' lock');
    // postać za zabójstwa pokazuje POSTĘP, nie cenę — inaczej nie wiadomo, po co grać
    const cel = C.killGoal
      ? `<div class="pr">${ico('czaszka', 15)} ${Math.min(META.st.kills, C.killGoal)}/${C.killGoal}</div>
         <div class="pbar"><i style="width:${Math.min(100, META.st.kills / C.killGoal * 100).toFixed(1)}%"></i></div>`
      : `<div class="pr">${ico('moneta', 15)} ${C.price}</div>`;
    d.innerHTML = `<div class="ico"><img class="pxi" src="${portret(C.char)}" style="height:62px"></div>
      <div class="nm">${C.nm}</div>
      <div class="ds">${C.ds}</div>${owned ? '' : cel}`;
    d.onclick = () => {
      if (!owned) {
        if (C.killGoal) {                          // tej się nie kupi, trzeba wyrobić
          d.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
            { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 200 });
          return;
        }
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
  time: 0, kills: 0, runCoins: 0, zebrane: 0,
  ranga: 0, rangaKille: 0,               // ranga w biegu (zabijanie = sila)
  enemies: [], gems: [], coins: [], shots: [], orbs: [], sparks: [], rings: [],
  lobs: [], boomers: [], bolts: [], pops: [], hps: [], kury: [], okruchy: [], puffs: [],
  padajace: [],                                    // regały w trakcie przewracania (market)
  turrets: [],                                     // postawione sokowirówki (TD-lite)
  pestki: [], kielki: [],                          // Pipsini i jego kiełki
  karabinPoc: [],                                  // ziarna kukurydzy z karabinu (tryb FPP)
  gluty: [], kaluze: [],                           // globy ketchupu w locie + kałuże po nich
  seria: [],                                       // kolejka rzutów scyzorykiem
  hitstop: 0,                                      // krótkie zatrzymanie czasu przy grubym zabójstwie
  spawnT: 0, shake: 0, bossAt: 120, ringAt: 60, tier: 0,
  vacuum: 0, buff: { key: null, t: 0 },
  streak: 0, streakT: -9,
  dying: false, deathT: 0,
  // TRYB KARABINU (pierwsza osoba). `zycia` to LICZNIK TRAFIEŃ W TRYBIE, nie serca:
  // po trzecim ciosie wracamy do widoku za plecami, ale HP zostaje nietknięte —
  // tryb ma być nagrodą, a nie sposobem na zgon w nagrodzie.
  fps: { on: false, t: 0, max: 0, zycia: 0, fireT: 0, pitch: 0, wejscie: 0, wyjscie: 0, kick: 0 },
};
const P = {};

function resetStats() {
  const C = CHARS[charKey];
  const maxHp = Math.max(2, 5 + META.up.serce + C.hp);
  Object.assign(P, {
    pos: new THREE.Vector3(0, 0, 0),
    hp: maxHp, maxHp,
    iframes: 0, y: 1.55, vy: 0, airborne: false, usedDouble: false, runDjump: false, shieldCd: 0,
    // karabin: `karabinRun` = już wypadł w tym biegu, `karabinMa` = leży w kieszeni gotowy
    gliding: false, runGlide: false, karabinRun: false, karabinMa: false,
    sokoPierwszy: false,                             // komunikat o klawiszu F raz na bieg
    vx: 0, vz: 0,
    weapons: [{ key: CHARS[charKey].startWpn || 'kule', lvl: 1, t: 0 }],   // max 3 sloty (broń z biblii)
    passives: {},                                // key -> poziom
    repeat: {},                                  // key -> ile razy wzięte (karty bez limitu)
    evo: {},                                     // key -> true
    xp: 0, lvl: 1, xpNeed: 5,                    // pierwszy poziom świadomie tani (dalej wg xpDoNast)
  });
}
// ---- statystyki pochodne (meta + pasywy + buffy) ----
// ============================== RANGA W BIEGU ==============================
// HP wrogow rosnie KWADRATOWO (`hpScale`), a sila gracza dotad rosla tylko
// kartami, ktore wypadaja coraz rzadziej (kazdy poziom wymaga wiecej XP).
// Ranga zamyka te luke: samo zabijanie podnosi obrazenia, wiec agresywna gra
// nadaza za krzywa trudnosci. Prog rosnie liniowo, wiec ranga nie ucieka w gore.
const RANGA_CAP = 150;            // cap 40 wypadal w 8,5 min i od tego momentu hpScale rosl w pustke
const rangaProg = r => 20 + 14 * r;               // ile zabojstw do NASTEPNEJ rangi
const rangaDmg = () => 1 + 0.05 * G.ranga;        // +5% obrazen za range
const rangaFire = () => 1 + 0.04 * Math.floor(G.ranga / 4);   // co 4. ranga tez +4% tempa
function sprawdzRange() {
  while (G.ranga < RANGA_CAP && G.rangaKille >= rangaProg(G.ranga)) {
    G.rangaKille -= rangaProg(G.ranga);
    G.ranga++;
    AUDIO.sfx('awans');
    dmgPop(P.pos.x, P.y + 2.0, P.pos.z, 'RANGA ' + G.ranga, '#ffd75e', 1.8);
    if (G.ranga % 4 === 0) toastBuff('RANGA ' + G.ranga + ' — obrażenia +' + Math.round((rangaDmg() - 1) * 100) + '%, tempo +' + Math.round((rangaFire() - 1) * 100) + '%');
  }
  const el = document.getElementById('ranga');
  if (el) {
    el.innerHTML = ico('czaszka', 13) + ' RANGA ' + G.ranga;
    const b = document.getElementById('rangabar');
    if (b) b.style.width = (G.ranga >= RANGA_CAP ? 100 : G.rangaKille / rangaProg(G.ranga) * 100) + '%';
  }
}

// ============================== KRZYWA XP ==============================
// Do 13.08 próg rósł LINIOWO (`5 + 3.2L`): w 5:00 wychodził poziom 55, awans co ~5 s
// i wszystkie osiem pasywów na maksie w 4. minucie — dalej karty degenerowały się
// do jednej („Znaleźne”), czyli 29 obowiązkowych kliknięć pod rząd (zmierzone).
// Człon kwadratowy 0.30L² zostawia pierwsze ~8 poziomów prawie bez zmian
// (L=8: 51 vs 31 XP), a późną grę rozciąga: ~31 poziom w 5:00 zamiast 55.
const xpDoNast = l => Math.round(5 + 3.2 * l + 0.30 * l * l);

const dmgAll  = () => CHARS[charKey].dmg * (1 + 0.10 * META.up.dmg) * Math.pow(1.15, P.passives.moc || 0) * (1 + 0.03 * (P.repeat.sol || 0)) * (G.buff.key === 'dmg' ? 2 : 1) * rangaDmg();
const fireMul = () => Math.pow(1.12, P.passives.tempo || 0) * (1 + 0.03 * (P.repeat.oliwa || 0)) * rangaFire();
// clamp 0.75: pasyw daje najwyżej 0.50, ale „Pieprz Nonny” jest bez limitu i bez
// tego setny poziom oznaczałby krytyk na 100% (crit ×3 przestaje być zdarzeniem).
const critC   = () => Math.min(0.75, 0.10 * (P.passives.krytyk || 0) + 0.02 * (P.repeat.pieprz || 0));
const rangeF  = () => 14 * Math.pow(1.2, P.passives.zasieg || 0) * (1 + 0.04 * (P.repeat.bazylia || 0));
const magnetF = () => CHARS[charKey].mag * 2.6 * (1 + 0.20 * META.up.magnes) * Math.pow(1.35, P.passives.magnes || 0);
const speedF  = () => CHARS[charKey].spd * 6.2 * (1 + 0.08 * META.up.szyb) * Math.pow(1.10, P.passives.buty || 0);
const hasWeapon = k => P.weapons.find(w => w.key === k);

// ============================== WEJŚCIE ==============================
const keys = {};
// Utrata fokusa gubiła `keyup`, więc trzymany klawisz zostawał wciśnięty
// na zawsze — po powrocie do gry postać sama jechała w skos. Czyścimy wszystko.
const puscWszystko = () => { for (const k in keys) keys[k] = false; jumpHeld = false; };
addEventListener('blur', puscWszystko);
// FLUSH ZAPISU. `saveMetaSoon()` ma debounce 2 s, a przez niego idą liczniki
// bestiariusza i `META.st.skrzynki` (od tego zależy wyreżyserowana szóstka skrzyń).
// Bez tego zamknięcie karty w ciągu 2 s po zabójstwie kasowało progres — a na
// Capacitorze Android potrafi ubić proces natychmiast po minimalizacji, więc to
// nie edge case. `beforeunload` na iOS nie odpala; właściwym zdarzeniem jest `pagehide`.
addEventListener('visibilitychange', () => { if (document.hidden) { puscWszystko(); flushMeta(); } });
addEventListener('pagehide', flushMeta);
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
  if (e.code === KARABIN_KLAWISZ && G.running && !G.paused) startKarabin();
  if (e.code === STAW_KLAWISZ) postawWiezyczke();          // Sokowirówka na żądanie
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Space') jumpHeld = false;
});

// dotyk: lewa połowa = joystick; mysz / prawa połowa dotyku = obrót kamery
const stickEl = document.getElementById('stick'), knobEl = document.getElementById('knob');
const touch = { on: false, id: null, cx: 0, cy: 0, vx: 0, vy: 0 };
const camDrag = { on: false, id: null, lx: 0, ly: 0 };
// ============ MYSZ JAK W FPS: KLIK PRZECHWYTUJE KURSOR ============
// Na PC obracanie kamery wymagalo PRZYTRZYMANIA i przeciagania — przy jednoczesnym
// biegu na WSAD to niewykonalne. Teraz jedno kliknięcie w obraz przechwytuje kursor
// (Pointer Lock) i od tej pory SAM RUCH myszy obraca kamere, jak w kazdym FPS-ie.
// Escape zwalnia kursor (i przy okazji pauzuje — to samo, czego gracz oczekuje).
// Przeciaganie zostaje jako awaryjne, gdy przegladarka odmowi blokady.
let myszLock = false;
const MYSZ_CZULOSC = 0.0032;           // rad na piksel ruchu
function chwycMysz() {
  if (!G.running || G.paused || G.dying) return;
  if (document.pointerLockElement === canvas) return;
  try { canvas.requestPointerLock && canvas.requestPointerLock(); } catch { /* odmowa = zostaje drag */ }
}
function puscMysz() {
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* nic */ }
}
document.addEventListener('pointerlockchange', () => {
  myszLock = document.pointerLockElement === canvas;
});
// ruch myszy przy przechwyconym kursorze — bez wcisniętego przycisku
addEventListener('mousemove', e => {
  if (!myszLock || !G.running || G.paused) return;
  camYaw -= e.movementX * MYSZ_CZULOSC;
  if (G.fps.on) dodajPitch(-e.movementY * MYSZ_CZULOSC * 0.8);
});
// W trybie karabinu pion myszy/palca CELUJE. Clamp jest ciasny (±20°) świadomie:
// przy 500 wrogach zadarcie kamery w niebo znaczy zgon, a i tak nie ma w co strzelać.
const PITCH_MAX = 0.35;
const dodajPitch = d => { G.fps.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, G.fps.pitch + d)); };
addEventListener('pointerdown', e => {
  if (!G.running || G.paused || e.target.closest('.ov') || e.target.id === 'jbtn') return;
  const joyZone = e.pointerType === 'touch' && e.clientX < innerWidth * 0.55;
  if (joyZone && !touch.on) {
    touch.on = true; touch.id = e.pointerId; touch.cx = e.clientX; touch.cy = e.clientY;
    touch.vx = touch.vy = 0;
    stickEl.style.display = 'block';
    stickEl.style.left = (e.clientX - 55) + 'px'; stickEl.style.top = (e.clientY - 55) + 'px';
  } else if (!camDrag.on) {
    // mysz: przechwyc kursor; dotyk/pad: zostaje przeciaganie
    if (e.pointerType === 'mouse') chwycMysz();
    camDrag.on = true; camDrag.id = e.pointerId; camDrag.lx = e.clientX; camDrag.ly = e.clientY;
  }
});
addEventListener('pointermove', e => {
  if (touch.on && e.pointerId === touch.id) {
    let dx = e.clientX - touch.cx, dy = e.clientY - touch.cy;
    const d = Math.hypot(dx, dy), m = Math.min(d, 45);
    if (d > 0) { dx /= d; dy /= d; }
    touch.vx = dx * (m / 45); touch.vy = dy * (m / 45);
    knobEl.style.transform = `translate(calc(-50% + ${dx * m}px), calc(-50% + ${dy * m}px))`;
  } else if (camDrag.on && e.pointerId === camDrag.id && !myszLock) {
    camYaw -= (e.clientX - camDrag.lx) * 0.008;
    if (G.fps.on) dodajPitch(-(e.clientY - camDrag.ly) * 0.005);
    camDrag.lx = e.clientX; camDrag.ly = e.clientY;
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
  const kb = document.getElementById('karabinBtn');
  kb.addEventListener('pointerdown', e => { e.stopPropagation(); startKarabin(); });
  const sb = document.getElementById('stawBtn');
  sb.addEventListener('pointerdown', e => { e.stopPropagation(); postawWiezyczke(); });
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
  const [rx, ry] = padStick(ax[2] || 0, ax[3] || 0);   // ry = celowanie w pionie (tylko tryb karabinu)
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
    if (G.fps.on && ry) dodajPitch(-ry * 1.3 * dt);
    if (hit(0)) { PAD.jump = true; jumpHeld = true; tryJump(); }
    if (PAD.jump && !btn(0)) { PAD.jump = false; jumpHeld = false; }
    if (hit(2)) startKarabin();                      // X = karabin (jeśli leży w kieszeni)
    if (hit(3)) postawWiezyczke();                   // Y = postaw Sokowirówkę
    if (hit(9)) togglePause(true);
  }
  for (let i = 0; i < B.length; i++) PAD.prev[i] = btn(i);
}

// ============================== OPRAWA BOSSA ==============================
// Do 13.08 Don Chipso wchodzil BEZ ZAPOWIEDZI i byl tylko duzym chipsem: przy 359
// wrogach na ekranie gracz czesto w ogole nie wiedzial, ze walczy z bossem. Teraz:
// przyciemnienie + imie na caly ekran na wejsciu, a potem pasek HP u gory, ktory
// pokazuje NAJMOCNIEJ RANNEGO bossa (przy kilku naraz to on jest celem gracza).
function wejscieBossa() {
  const ov = document.getElementById('bossOv'), nm = document.getElementById('bossNm');
  nm.innerHTML = 'DON CHIPSO<small>GLOWA FAMIGLII</small>';
  ov.classList.add('on'); nm.classList.add('on');
  G.shake = Math.max(G.shake, 0.5);
  G.hitstop = Math.max(G.hitstop, 0.18);           // swiat na moment przystaje
  AUDIO.sfx('boss');
  AUDIO.event('boss');
  setTimeout(() => { ov.classList.remove('on'); nm.classList.remove('on'); }, 1500);
}
function updateBossHp() {
  const el = document.getElementById('bossHp');
  let naj = null;
  for (const e of G.enemies) if (e.T.boss && !e.dying)
    if (!naj || e.hp / e.maxHp < naj.hp / naj.maxHp) naj = e;
  if (!naj) { if (el.classList.contains('on')) el.classList.remove('on'); return; }
  el.classList.add('on');
  const k = Math.max(0, naj.hp / naj.maxHp);
  el.querySelector('.bf').style.width = (k * 100) + '%';
  const ile = G.enemies.filter(e => e.T.boss && !e.dying).length;
  el.querySelector('.bn').textContent = 'DON CHIPSO' + (ile > 1 ? '  x' + ile : '');
  el.querySelector('.bl').textContent = Math.ceil(naj.hp) + ' / ' + Math.ceil(naj.maxHp);
}

// ============================== KETCHUPINO: ARTYLERIA ==============================
// Wg biblii postaci: „butelka ketchupu-artylerzysta. Trzyma dystans, pluje globami
// po łuku (telegraf: czerwony krąg na ziemi), kałuże slow 40% przez 4 s."
// To pierwszy wróg w grze, który atakuje na odległość — dotąd KAŻDY po prostu
// wbiegał w gracza, więc jedyną odpowiedzią na wszystko był ruch.
const KETCH_BLISKO = 9;         // bliżej = cofa się
const KETCH_DALEKO = 15;        // dalej = podchodzi; w środku stoi i pluje
const KETCH_CD = 3.0;           // co ile plunie
const KETCH_LOT = 1.05;         // s lotu globu — TO JEST TELEGRAF, gracz ma czas zejść
const KETCH_R = 2.5;            // promień plaśnięcia
const KETCH_KALUZA = 4.0;       // s życia kałuży (biblia: 4 s)
const KETCH_SLOW = 0.6;         // gracz w kałuży ×0.6 (biblia: slow 40%)
let ketchMat = null, ketchKalMat = null, ketchKragMat = null;
function ketchupTexture(kropla) {
  const S = 16, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const d = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - 7.5, dy = y - 7.5, r = Math.hypot(dx, dy * (kropla ? 0.78 : 1));
    let kol = null;
    if (r < 7.4) kol = r > 6.2 ? [120, 22, 20] : r > 3.4 ? [186, 42, 36] : [214, 74, 62];
    const i = (y * S + x) * 4;
    if (kol) { d.data[i] = kol[0]; d.data[i+1] = kol[1]; d.data[i+2] = kol[2]; d.data[i+3] = 255; }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// glob leci łukiem, a POD CELEM od razu rośnie czerwony krąg — telegraf jest
// tym, co zamienia atak dystansowy z „nagłej kary" w decyzję gracza.
function plunKetchupem(e) {
  if (!ketchMat) {
    ketchMat = new THREE.MeshBasicMaterial({ map: ketchupTexture(true), transparent: true,
      alphaTest: 0.4, side: THREE.DoubleSide });
    ketchKalMat = new THREE.MeshBasicMaterial({ map: ketchupTexture(false), transparent: true,
      opacity: 0.5, depthWrite: false });
    // TELEGRAF TO OBWÓDKA, NIE PLAMA. Wypełniona plama przed uderzeniem wyglądała, jakby
    // ketchup już wylądował — plama pojawia się dopiero po plaśnięciu (uwaga właściciela).
    ketchKragMat = new THREE.MeshBasicMaterial({ map: ringTexture('rgba(232,64,52,0.95)'),
      transparent: true, depthWrite: false });
  }
  // celuje z WYPRZEDZENIEM w miejsce, gdzie gracz BĘDZIE — inaczej wystarczy iść prosto
  const cx = P.pos.x + P.vx * KETCH_LOT * 0.55, cz = P.pos.z + P.vz * KETCH_LOT * 0.55;
  const wylot = e.ty + 1.7;                        // glob wychodzi z góry butli, nie z jej stóp
  const glob = new THREE.Mesh(unitGeo, ketchMat);
  glob.scale.setScalar(0.55);
  glob.position.set(e.pos.x, wylot, e.pos.z);
  scene.add(glob);
  const krag = new THREE.Mesh(blobGeo, ketchKragMat);
  krag.scale.set(KETCH_R * 2, 1, KETCH_R * 2);
  krag.position.set(cx, terrainH(cx, cz) + 0.05, cz);
  scene.add(krag);
  e.bb.play('punch', false);                       // wyciska się, żeby plunąć
  G.gluty.push({ mesh: glob, krag, t: 0, from: { x: e.pos.x, y: wylot, z: e.pos.z },
                 to: { x: cx, z: cz } });
  AUDIO.sfx('strzal');
}
function updateGluty(dt) {
  for (let i = G.gluty.length - 1; i >= 0; i--) {
    const gl = G.gluty[i];
    gl.t += dt;
    const k = Math.min(1, gl.t / KETCH_LOT);
    const x = gl.from.x + (gl.to.x - gl.from.x) * k, z = gl.from.z + (gl.to.z - gl.from.z) * k;
    gl.mesh.position.set(x, gl.from.y + Math.sin(k * Math.PI) * 3.4
      + (terrainH(x, z) + 0.4 - gl.from.y) * k, z);
    gl.mesh.rotation.set(0, camYaw, gl.t * 6);
    // obwódka ZACISKA SIĘ do miejsca uderzenia i pulsuje — czyta się jako „tu spadnie",
    // a nie jako „tu już leży ketchup"
    const rk = KETCH_R * 2 * (1.35 - 0.35 * k);
    gl.krag.scale.set(rk, 1, rk);
    if (k < 1) continue;
    // PLAŚNIĘCIE
    scene.remove(gl.mesh);
    scene.remove(gl.krag);
    G.gluty.splice(i, 1);
    okruchy(gl.to.x, terrainH(gl.to.x, gl.to.z) + 0.4, gl.to.z, 0xba2a24, 7);
    AUDIO.sfx('wybuch');
    if (Math.hypot(P.pos.x - gl.to.x, P.pos.z - gl.to.z) < KETCH_R
        && P.iframes <= 0 && !ciosPochloniety()) {
      P.hp -= 1 * dmgScale(); P.iframes = 0.9; drawHearts(); AUDIO.sfx('hurt'); G.shake = 0.3;
      const v = document.getElementById('vign');
      v.style.opacity = 1; setTimeout(() => v.style.opacity = 0, 180);
      if (P.hp <= 0) startDeath();
    }
    G.kaluze.push({ x: gl.to.x, z: gl.to.z, r: KETCH_R, t: KETCH_KALUZA,
                    mesh: (() => { const m = new THREE.Mesh(blobGeo, ketchKalMat.clone());
                      m.scale.set(KETCH_R * 2, 1, KETCH_R * 2);
                      m.position.set(gl.to.x, terrainH(gl.to.x, gl.to.z) + 0.04, gl.to.z);
                      scene.add(m); return m; })() });
  }
}
function updateKaluze(dt) {
  for (let i = G.kaluze.length - 1; i >= 0; i--) {
    const k = G.kaluze[i];
    k.t -= dt;
    // max 0.5, nie 0.8: kilka nachodzących kałuż dawało niemal jednolitą czerwień
    // i nie było widać pod nimi terenu ani wrogów
    k.mesh.material.opacity = Math.min(0.5, k.t * 0.35);
    if (k.t <= 0) { scene.remove(k.mesh); k.mesh.material.dispose(); G.kaluze.splice(i, 1); }
  }
}
// czy gracz stoi w ketchupie (spowolnienie z biblii: 40%)
function wKetchupie(x, z) {
  for (const k of G.kaluze) if (Math.hypot(x - k.x, z - k.z) < k.r) return true;
  return false;
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
  // WLASNY ARKUSZ (13.08): worek chipsow w fedorze i plaszczu. Do tej pory boss byl
  // dosłownie tym samym plikiem co szeregowy Chipsetti, tylko rozciagnietym x2.7 —
  // czyli obok biegalo 200 identycznych kopii „bossa". Skala zeszla z 2.7 na 2.1,
  // bo teraz rysunek sam niesie powage i nie trzeba jej udawac rozmiarem.
  // ELITA-ARTYLERZYSTA wg biblii (HP 220 w skali biblii = 63 w silniku; ZBITE DO 26,
  // bo pierwszy wróg dystansowy przy 63 HP byłby mini-bossem, a gracz nie ma jeszcze
  // żadnej odpowiedzi na atak z 15 j.). Pojawia się od 3. minuty, rzadko.
  // scale 1.7 (Chipsetti ma 0.85): WYSTAJE NAD TŁUM. Ta sama zasada co przy
  // Sokowirówce — byt, który zmienia sposób gry, musi być widoczny w kupie wrogów.
  ketchupino: { hp: 26, okrKol: 0xd23b3b, speed: 1.9, dmg: 1, scale: 1.7, xp: 8, walk: 'run',
    char: 'ketchupino_splatterino', artyleria: true,
    nm: 'Ketchupino Splatterino',
    ds: 'Butla ketchupu, która nauczyła się moździerza. Nie podejdzie — nie musi. Ściska sobie brzuch i pluje po łuku, a to, co po nim zostaje, trzyma za nogi lepiej niż rozlana woda.' },
  boss: { hp: 90, okrKol: 0xf2c14a, speed: 2.2, dmg: 2, scale: 2.1, xp: 25, walk: 'run',
    char: 'don_chipso', boss: true,
    nm: 'Don Chipso',
    ds: 'Głowa Famiglii. Mówi szeptem, bo kto ma sól, nie musi krzyczeć. Wymięty jak jego sumienie, tłusty jak jego interesy. Osiedle traktuje jak talerz: co na nim leży, uważa za swoje.' },
};

let eliteRingMat = null;
// ---- PROGRESJA: poziom zagrożenia rośnie co minutę ----
const tier = () => 1 + Math.floor(G.time / 60);
// KLĄTWA: kupione poziomy podnoszą HP wrogów i zagęszczają spawn, a w zamian
// mnożą monety (patrz `monetyMul`). Świadomie kupowana trudność.
const klatwa = () => META.up.klatwa || 0;
const monetyMul = () => (1 + 0.20 * klatwa()) * (G.buff.key === 'kasa' ? 2 : 1);
const hpScale = () => (1 + G.time / 60 * 0.55 + Math.pow(G.time / 300, 2) * 1.5) * (1 + 0.10 * klatwa());  // późno rośnie ostro
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
    // Boss dotad NIE skalowal sie wcale: w 20. minucie mial 90 HP, gdy szeregowy
    // mial 108, a elita 648. Teraz rosnie jak wszyscy (bez mnoznika elity).
    hp: T.hp * hpMul * (elite ? 6 : 1),
    // `maxHp` NIE ISTNIALO na wrogach — pasek HP bossa liczyl „100 / NaN".
    // Ustawiamy je od razu przy spawnie: potrzebne do kazdego paska i do procentow.
    maxHp: T.hp * hpMul * (elite ? 6 : 1),
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
  if (e.dying) return;                             // strażnik: drugie wywołanie na tym
  G.kills++;                                       // samym wrogu powtarzało drop i podział
  document.getElementById('kills').innerHTML = ico('czaszka', 15) + ' ' + G.kills;
  // ---- BESTIARIUSZ: licznik zabitych per typ (zostaje na stałe w META) ----
  const pierwszyRaz = !META.bestiary[e.type];
  META.bestiary[e.type] = (META.bestiary[e.type] || 0) + 1;
  if (pierwszyRaz) {
    saveMeta();                                    // odblokowanie zapisujemy od razu
    toastBuff('NOWY WPIS W ENCYKLOPEDII: ' + (e.T.nm || e.type));
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2600);
  } else saveMetaSoon();
  // ŁĄCZNY LICZNIK ZABÓJSTW liczymy TUTAJ, nie w `gameOver()` — inaczej wyjście
  // do menu z pauzy kasowało cały bieg, a na tym liczniku wisi odblokowanie postaci.
  META.st.kills++;
  sprawdzOdblokowaniaPostaci();
  G.rangaKille++;
  sprawdzRange();
  // KILL + combo (kille w oknie 1.3 s nabijają serię)
  G.streak = (G.time - G.streakT < 1.3) ? G.streak + 1 : 1;
  G.streakT = G.time;
  if (G.streak === 12 || G.streak === 30) toastBuff('SERIA x' + G.streak + ' — MONETY ×' + (G.streak >= 30 ? 3 : 2));
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
  // MONETY. Zmierzone: przy starych stawkach zabijanie hordy dawało tylko 14%
  // dochodu (elity 34%, skrzynie 20%) — czyli najmniej płaciła czynność, którą
  // gracz faktycznie wykonuje. Stawki w górę, a elita/boss dostają JEDNĄ monetę
  // o dużej wartości zamiast garści (mniej śmieci na ekranie przy 500 wrogach).
  // MNOŻNIK ZA SERIĘ nagradza stanie w hordzie, a nie kitowanie w pustce.
  const mnoznikSerii = G.streak >= 30 ? 3 : (G.streak >= 12 ? 2 : 1);
  const wyplac = (n, val, rozrzut = 0) => {
    for (let k = 0; k < n; k++)
      G.coins.push(makeCoin(e.pos.x + (Math.random() - .5) * rozrzut,
                            e.pos.z + (Math.random() - .5) * rozrzut, val * mnoznikSerii));
  };
  if (e.T.boss) wyplac(3, 10, 2.5);
  else if (e.elite) wyplac(1, 4);
  else if (Math.random() < 0.16) wyplac(1, 1);
  // serca: elity 30%, boss zawsze 2
  // SERCA SA RZADKIE (zyczenie wlasciciela). Bylo: boss zawsze 2, elita 30%.
  // Przy udziale elit rosnacym o 1.5%/min (14% w 5. min, 21% w 10.) leczenie sypalo
  // sie tak gestio, ze utrata serca przestawala cokolwiek znaczyc — a to ona jest
  // jedyna realna kara w tej grze. Teraz: boss 1 (drugie tylko gdy naprawde boli),
  // elita 8%.
  if (e.T.boss) {
    // GWARANTOWANA NAGRODA: dotad boss placil mniej niz zwykla skrzynia, wiec zabicie
    // najtwardszego przeciwnika w grze bylo slabsza nagroda niz podejscie do pudelka.
    wchest.wait = Math.min(wchest.wait, 0.4);      // zlota skrzynia (bron) prawie natychmiast
    G.hps.push(makeHeart(e.pos.x, e.pos.z));
    if (P.hp <= P.maxHp * 0.34) G.hps.push(makeHeart(e.pos.x + 0.8, e.pos.z));   // litosc przy 1/3 zycia
  } else if (e.elite && Math.random() < 0.08) G.hps.push(makeHeart(e.pos.x, e.pos.z));
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

// XP zbiera sie jako PIGULKI (glosy Carrotella i tak mowia o witaminach),
// a bron na lince to CZOSNEK — dwa osobne sprite'y, bo dotad oba szly z bone.png
let pigulkaMat = null, pigulkaAspect = 1;
let czosnekMat = null, czosnekAspect = 1;
function makeGem(x, z, val) {
  const m = new THREE.Mesh(unitGeo, pigulkaMat);
  m.scale.set(0.5 * pigulkaAspect, 0.5, 1);
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
// Moneta ma WARTOŚĆ: 12 osobnych brzdęków z bossa czyta się jak nic, a jeden
// duży „+30" jak nagroda — i jest tańsze, bo to jeden mesh zamiast dwunastu.
const coinMats = new Map();
function coinMat4Val(val) {
  let m = coinMats.get(val);
  if (!m) {
    m = coinMat.clone();
    m.color.setHex(val >= 10 ? 0xffc14a : (val >= 4 ? 0xcfe8ff : 0xffffff));
    coinMats.set(val, m);
  }
  return m;
}
function makeCoin(x, z, val = 1) {
  const m = new THREE.Mesh(unitGeo, val > 1 ? coinMat4Val(val) : coinMat);
  const s = val >= 10 ? 0.8 : (val >= 4 ? 0.62 : 0.5);
  m.scale.set(s, s, 1);
  m.position.set(x, terrainH(x, z) + 0.1, z);
  scene.add(m);
  return { mesh: m, pos: new THREE.Vector3(x, 0, z), t: Math.random() * 6, val };
}

// materiały nowych broni + efekt pioruna
let bottleMat = null, radioMat = null;
// ============================== PIZZA VOLANTE ==============================
// „Radio-bumerang" był reliktem po starej obsadzie (żul z boomboxem) i nie miał
// nic wspólnego z warzywami walczącymi z mafią przekąsek — zgłoszenie właściciela.
// Biblia postaci przewidywała tu `pizza.png` („koło pizzy z góry — bumerang"), więc
// do czasu dostawy grafiki rysujemy koło proceduralnie. KLUCZ BRONI ZOSTAJE
// `bumerang` — wisi na nim `META.unlocked`, czyli zakupy graczy w starych zapisach.
function pizzaTexture() {
  const S = 32, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const d = g.createImageData(S, S);
  const pep = [[10, 9], [20, 11], [15, 17], [9, 20], [22, 20], [16, 8]];   // pepperoni
  const bazyl = [[13, 13], [19, 16], [12, 24]];                            // bazylia
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - 15.5, dy = y - 15.5, r = Math.hypot(dx, dy);
    let kol = null;
    if (r < 15.5) {
      kol = r > 12.6 ? [206, 150, 76]                    // skórka
          : r > 11.4 ? [226, 176, 96]                    // rant jaśniejszy
          : [242, 196, 88];                              // ser
      for (const [px, py] of pep) if (Math.hypot(x - px, y - py) < 2.6) kol = [198, 58, 46];
      for (const [px, py] of bazyl) if (Math.hypot(x - px, y - py) < 1.5) kol = [86, 150, 62];
      if (r > 14.6) kol = [27, 27, 34];                  // kontur
    }
    const i = (y * S + x) * 4;
    if (kol) { d.data[i] = kol[0]; d.data[i + 1] = kol[1]; d.data[i + 2] = kol[2]; d.data[i + 3] = 255; }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let kapecMat = null, kapecAspect = 1.4;
let scyzorykMat = null, scyzorykAspect = 2.2;
// SCYZORYK — mala pixelowa ostrz z rekojescia (do podmiany na sprite z generatora)
function scyzorykTexture() {
  const W = 44, H = 20;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#d9e2ec'; g.fillRect(14, 7, 26, 5);        // ostrze
  g.fillStyle = '#f2f7fb'; g.fillRect(14, 7, 26, 2);        // blysk
  g.fillStyle = '#9aa5b1'; g.fillRect(36, 7, 4, 5);         // czubek
  g.fillStyle = '#e0453c'; g.fillRect(3, 5, 12, 9);         // rekojesc
  g.fillStyle = '#ff8a80'; g.fillRect(3, 5, 12, 2);
  g.fillStyle = '#1b1b22'; g.fillRect(13, 5, 2, 9);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// KAPEĆ w kratkę — rysowany w kodzie, dopóki nie przyjdzie sprite z generatora
function kapecTexture() {
  const W = 56, H = 40;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#3f5c8a';                                   // podeszwa
  g.beginPath(); g.ellipse(28, 24, 25, 13, 0, 0, 7); g.fill();
  g.fillStyle = '#6f8fc4';                                   // wierzch
  g.beginPath(); g.ellipse(20, 20, 17, 11, 0, 0, 7); g.fill();
  g.fillStyle = '#8fb0e0';                                   // krata
  for (let x = 6; x < 34; x += 6) g.fillRect(x, 11, 2, 18);
  for (let y = 12; y < 28; y += 6) g.fillRect(5, y, 30, 2);
  g.fillStyle = '#2a3b5c';                                   // kontur pięty
  g.fillRect(44, 16, 8, 3); g.fillRect(46, 19, 6, 3);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
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

// ============================== PLAMY NA ZIEMI (ślad po rzezi) ==============================
// Dowód, że gracz TU BYŁ i co tu zrobił. Przy 500 wrogach nie da się dodawać
// mesha na każdą śmierć, więc pula 48 kwadratów krąży w kółko: najstarsza plama
// jest przejmowana przez nowego trupa. Zero alokacji w trakcie biegu.
const PLAM_MAX = 48;
let plamaGeo = null, plamaMat = null, plamy = [], plamaIdx = 0;
function plamaTexture() {
  const S = 64;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // nieregularny placek + kilka kropel obok
  g.fillStyle = '#ffffff';
  g.beginPath();
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 9) {
    const r = S * (0.26 + Math.random() * 0.14);
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.85;
    a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.closePath(); g.fill();
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, d = S * (0.3 + Math.random() * 0.16);
    const r = 1.5 + Math.random() * 3.5;
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d * 0.85, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
function splat(x, z, kol, skala) {
  if (!plamaGeo) {
    plamaGeo = new THREE.PlaneGeometry(1, 1);
    plamaGeo.rotateX(-Math.PI / 2);
    plamaMat = new THREE.MeshBasicMaterial({ map: plamaTexture(), transparent: true,
      depthWrite: false, opacity: 0.75 });
  }
  let p = plamy[plamaIdx];
  if (!p) {
    // materiał klonowany per plama: każda ma swój kolor i własne gaśnięcie
    const m = new THREE.Mesh(plamaGeo, plamaMat.clone());
    m.renderOrder = 1;
    scene.add(m);
    p = { mesh: m, t: 0 };
    plamy[plamaIdx] = p;
  }
  plamaIdx = (plamaIdx + 1) % PLAM_MAX;
  p.t = 0;
  p.mesh.material.color.setHex(kol);
  p.mesh.material.opacity = 0.75;
  p.mesh.visible = true;
  p.mesh.scale.set(skala, 1, skala * 0.9);
  p.mesh.rotation.y = Math.random() * Math.PI * 2;
  p.mesh.position.set(x, terrainH(x, z) + 0.035, z);
}
function updatePlamy(dt) {
  for (const p of plamy) {
    if (!p || !p.mesh.visible) continue;
    p.t += dt;
    if (p.t > 6) {                                 // gaśnie przez 2 s po 6 s leżenia
      const k = (p.t - 6) / 2;
      p.mesh.material.opacity = Math.max(0, 0.75 * (1 - k));
      if (k >= 1) p.mesh.visible = false;
    }
  }
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
  // WYBUCH SKALOWANY DO WROGA: szeregowy pyka, gruby robi hukiem. Przy 500 wrogach
  // pierścień na każdą śmierć byłby kaszą, więc dostają go tylko duzi i wirujący.
  const gruby = duzy || e.T.scale >= 1.2;
  okruchy(e.pos.x, e.ty + e.bb.h * 0.45, e.pos.z, kol,
          e.T.boss ? 16 : (gruby ? 10 : (e.T.dzieli && !e.mini ? 8 : 6)));
  puff(e.pos.x, e.ty + e.bb.h * 0.5, e.pos.z, kol, e.bb.h * (duzy ? 1.9 : 1.15));
  splat(e.pos.x, e.pos.z, kol, e.bb.h * (duzy ? 1.5 : 0.85));    // ślad zostaje na ziemi
  if (gruby) {
    novaRing(e.pos.x, e.pos.z, e.T.boss ? 4.5 : (duzy ? 2.6 : 1.6));
    AUDIO.sfx('wybuch');
    G.shake = Math.max(G.shake, e.T.boss ? 0.55 : 0.22);
  }
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
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['01110','00100','00100','00100','00100','00100','01110'],
  'J': ['00111','00010','00010','00010','00010','10010','01100'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'Q': ['01110','10001','10001','10001','10101','01110','00011'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
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
const POP_CACHE_MAX = 200;
function popMat(str, color) {
  const key = color + '|' + str;
  let m = popCache.get(key);
  if (m) { popCache.delete(key); popCache.set(key, m); return m; }   // odswiez w LRU
  // LRU: bez tego cache rosl w nieskonczonosc — zmierzone 2470 tekstur po 4:43
  // gry i ZERO usuniec, czyli ~140 MB VRAM w 4 minuty. Na telefonie to zgon.
  if (popCache.size >= POP_CACHE_MAX) {
    const naj = popCache.keys().next().value;
    const stary = popCache.get(naj);
    popCache.delete(naj);
    if (stary) { if (stary.map) stary.map.dispose(); stary.dispose(); }
  }
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
//
// ⚠️ KAŻDY COOLDOWN DZIEL PRZEZ `fireMul()`. Do 13.08 robiły to TYLKO Kule, a reszta
// miała czas przeładowania zapisany na sztywno — więc pasyw TEMPO (do +76%) i bonus
// „+4% tempa co 4. ranga" były dla większości buildów DOSŁOWNIE ZEROWE. Karta Tempo
// była pułapką: gracz brał ją co kilka awansów i nie dostawał nic.
// Dodając nową broń: `w.t = (bazowy_czas) / fireMul()`, nigdy samo `w.t = bazowy_czas`.
const WEAPONS = {
  // ⚠️ OBRAŻENIA KUL ROSNĄ Z POZIOMEM. Do 13.08 `dmg` pocisku było zaszyte na
  // sztywno jako 1 (pocisk bez pola `dmg` dostaje `s.dmg || 1` w pętli pocisków),
  // a poziomy dawały TYLKO liczbę pocisków i przebicie. Skutek zmierzony w grze:
  // Carrotello — postać, którą gra się przez pierwsze TRZY biegi — zabijał
  // 1 wroga na 10 s, gdy każda inna postać zabijała 18-20. Chipsetti ma 3.01 HP,
  // a kula robiła 1 × 0.9 (kara postaci) = 0.9, czyli CZTERY trafienia na
  // najsłabszego wroga w grze, co 0.87 s. To były najgorsze 3 minuty w grze
  // i pierwsze, jakie widzi nowy gracz.
  kule: {
    ico: 'kula', nm: 'Kule energii', ds: 'Samonaprowadzające pociski', max: 5, postac: 'carrotello',
    lvlDs: l => ['1 pocisk', '2 pociski, mocniejsze', '3 pociski i przebicie',
                 'jeszcze mocniejsze', '4 pociski, +2 przebicia (→ ewolucja!)'][l - 1],
    evoKey: 'meteor', evoIco: 'kula', evoNm: 'KULE METEORYCZNE', evoDs: 'EWOLUCJA: pociski WYBUCHAJĄ przy trafieniu',
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const count = [1, 2, 3, 3, 4][w.lvl - 1], pierce = [0, 0, 1, 1, 2][w.lvl - 1];
      // POZIOM 1 MUSI ZABIJAĆ CHIPSETTIEGO JEDNĄ KULĄ (ma 3.01 HP na starcie).
      // To chwyt z Vampire Survivors, gdzie bicz kasuje pierwsze nietoperze za jednym
      // ciosem — i to on daje pierwsze 30 sekund „mam moc". Okno zamyka się samo,
      // bo `hpScale` rośnie: w 2. minucie Chipsetti ma już ~6.6 HP i trzeba ulepszeń.
      const dmg = [3.2, 3.9, 4.6, 5.4, 6.2][w.lvl - 1];
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
        G.shots.push({ mesh: m, dir, life: 1.3, pierce, hit: new Set(), y: P.y + 1.0, dmg });
      }
    },
  },
  kosc: {
    ico: 'czosnek', nm: 'Czosnek na lince', ds: 'Kręci się na giętkiej lince i odpycha hordę', max: 5,
    lvlDs: l => l + (l === 1 ? ' czosnek' : ' czosnki') + (l === 5 ? ' (→ ewolucja!)' : ''),
    evoKey: 'kosci', evoIco: 'czosnek', evoNm: 'CZOSNKOWY MŁYN', evoDs: 'EWOLUCJA: dłuższa linka, szybszy obrót i 2× mocniejsze',
    tick(w, dt) {
      while (G.orbs.length < w.lvl) G.orbs.push(nowyCzosnek(G.orbs.length));
      updateCzosnki(dt, w.lvl);
    },
  },
  tupniecie: {
    ico: 'fala', nm: 'Tupnięcie', ds: 'Fala uderzeniowa (też przy lądowaniu ze skoku!)', max: 3,
    lvlDs: l => 'promień i moc fali +' + l,
    evoKey: 'sejsm', evoIco: 'fala', evoNm: 'TRZĘSIENIE ZIEMI', evoDs: 'EWOLUCJA: fale częstsze, większe i 2× mocniejsze',
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = (P.evo.sejsm ? 2.0 : 3.2) / fireMul();
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
      w.t = (2.8 - 0.25 * w.lvl) / fireMul();
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
      w.t = (3.6 - 0.25 * w.lvl) / fireMul();
      const e = alive[Math.floor(Math.random() * alive.length)];
      const m = new THREE.Mesh(unitGeo, bottleMat);
      m.scale.set(0.7, 0.7, 1);
      scene.add(m);
      G.lobs.push({ mesh: m, from: P.pos.clone(), to: e.pos.clone(), t: 0, dur: 0.7, lvl: w.lvl });
    },
  },
  bumerang: {
    ico: 'pizza', nm: 'Pizza Volante', ds: 'Koło pizzy leci i WRACA, kosząc po drodze', max: 5, locked: true,
    lvlDs: l => `zasięg ${(8 + 0.6 * l).toFixed(0)}, co ${(2.8 - 0.2 * l).toFixed(1)} s`,
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = (2.8 - 0.2 * w.lvl) / fireMul();
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
      w.t = 0.7 / fireMul();
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
      w.t = (2.2 - 0.15 * w.lvl) / fireMul();
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
    ico: 'kukurydza', nm: 'Kernello Boomello', ds: 'Ziarno kukurydzy biegnie do wroga i STRZELA', max: 5, locked: true,
    lvlDs: l => `wybuch r=${(2.5 + 0.3 * l).toFixed(1)}, co ${(4.5 - 0.35 * l).toFixed(1)} s`
      + (l === 5 ? ' (→ ewolucja!)' : ''),
    evoKey: 'kaseta', evoIco: 'kukurydza', evoNm: 'BOMBA KASETOWA',
    evoDs: 'EWOLUCJA: wybuch rozsypuje 6 mniejszych ziaren, każde z własnym lontem',
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const alive = G.enemies.filter(e => !e.dying && e.pos.distanceTo(P.pos) < 16);
      if (!alive.length) return;
      w.t = (4.5 - 0.35 * w.lvl) / fireMul();
      const bb = new Billboard('kernello_boomello', 1.0);
      bb.play('run');
      G.kury.push({ bb, pos: P.pos.clone(), t: 0, lvl: w.lvl });
    },
  },
  // ===== SCYZORYK (startowa broń Razoretty) =====
  // Nie „kolejny pocisk samonaprowadzający": to SERIA trzech-pięciu rzutów w tę
  // samą stronę, jeden po drugim, mocnych i przebijających. Gracz musi ustawić
  // się w linii z tłumem — to jedyna broń w grze nagradzająca celowanie ciałem.
  scyzoryk: {
    ico: 'celownik', nm: 'Scyzoryki', ds: 'Seria mocnych rzutów przed siebie — przebijają', max: 5, postac: 'razoretta',
    lvlDs: l => `${2 + l} rzutów w serii, co ${(2.2 - 0.15 * l).toFixed(1)} s`
      + (l === 5 ? ' (→ ewolucja!)' : ''),
    evoKey: 'wachlarz', evoIco: 'celownik', evoNm: 'WACHLARZ RZODKIEWKI',
    evoDs: 'EWOLUCJA: każdy rzut to trzy scyzoryki w wachlarzu',
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = (2.2 - 0.15 * w.lvl) / fireMul();
      // kierunek liczony RAZ dla całej serii — inaczej seria rozjeżdżałaby się
      // za obracającym się graczem i przestałaby być „linią"
      let cel = null, najl = rangeF();
      for (const e of G.enemies) { if (e.dying) continue;
        const d = e.pos.distanceTo(P.pos); if (d < najl) { najl = d; cel = e; } }
      const kat = cel ? Math.atan2(cel.pos.x - P.pos.x, cel.pos.z - P.pos.z) : playerBB.facing;
      const ile = 2 + w.lvl;
      for (let i = 0; i < ile; i++) {
        G.seria.push({ kat, opoznienie: i * 0.11, lvl: w.lvl });
      }
    },
  },
  // ===== LA CIABATTA (startowa broń Granny, wg biblii) =====
  // Kapeć-bumerang: leci, przebija WSZYSTKO i wraca, bijąc drugi raz w drodze
  // powrotnej. Korzysta z tej samej maszynerii co radio-bumerang (`G.boomers`),
  // ale rzuca DWA kapcie w wachlarzu i celuje w najbliższego wroga, nie w przód.
  ciabatta: {
    ico: 'kapec', nm: 'La Ciabatta', ds: 'Kapeć leci, przebija wszystko i WRACA', max: 5, postac: 'granny',
    lvlDs: l => `${l >= 3 ? 2 : 1} kapeć(cie), zasięg ${(6 + 0.5 * l).toFixed(0)}, co ${(1.9 - 0.12 * l).toFixed(1)} s`
      + (l === 5 ? ' (→ ewolucja!)' : ''),
    evoKey: 'doppia', evoIco: 'kapec', evoNm: 'CIABATTA DOPPIA',
    evoDs: 'EWOLUCJA: kapcie krążą wokół Ciebie bez przerwy',
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = (1.9 - 0.12 * w.lvl) / fireMul();
      // celujemy w najbliższego wroga — babcia nie pudłuje (biblia: „celność samonaprowadzająca")
      let cel = null, najl = 1e9;
      for (const e of G.enemies) { if (e.dying) continue;
        const d = e.pos.distanceTo(P.pos); if (d < najl) { najl = d; cel = e; } }
      const baza = cel ? Math.atan2(cel.pos.x - P.pos.x, cel.pos.z - P.pos.z) : playerBB.facing;
      const ile = (w.lvl >= 3 ? 2 : 1) * (P.evo.doppia ? 2 : 1);
      for (let i = 0; i < ile; i++) {
        const a = baza + (i - (ile - 1) / 2) * 0.34;
        const m = new THREE.Mesh(unitGeo, kapecMat);
        m.scale.set(0.85 * kapecAspect, 0.85, 1);
        scene.add(m);
        G.boomers.push({ mesh: m, dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
                         t: 0, dur: 1.5, dist: 6 + 0.5 * w.lvl, lvl: w.lvl + 1, hit: new Set() });
      }
    },
  },
  // ===== WYPAD! (startowa broń Beetina, wg biblii) =====
  // Pchnięcie falą w stożku 60° przed sobą: mały zasięg, ale OGROMNY knockback —
  // bramkarz nie zabija, on odprowadza. Skalowanie: zasięg → knockback → obrażenia.
  wypad: {
    ico: 'fala', nm: 'Wypad!', ds: 'Pchnięcie w stożku — ogromny knockback', max: 5, postac: 'beetino',
    lvlDs: l => `stożek ${(3.4 + 0.4 * l).toFixed(1)} j., odrzut ${(5 + l).toFixed(0)}, co ${(1.5 - 0.08 * l).toFixed(2)} s`
      + (l === 5 ? ' (→ ewolucja!)' : ''),
    evoKey: 'selekcja', evoIco: 'tarcza', evoNm: 'DZIŚ NIE WEJDZIESZ',
    evoDs: 'EWOLUCJA: pchnięcie ogłusza i zadaje podwójne obrażenia',
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = (1.5 - 0.08 * w.lvl) / fireMul();
      const zasieg = 3.4 + 0.4 * w.lvl, odrzut = 5 + w.lvl;
      const fx = Math.sin(playerBB.facing), fz = Math.cos(playerBB.facing);
      const dmg = (2.5 + 0.8 * w.lvl) * (P.evo.selekcja ? 2 : 1) * dmgAll();
      let trafil = 0;
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > zasieg || d < 1e-3) continue;
        if ((dx / d) * fx + (dz / d) * fz < 0.5) continue;      // stożek ~60°
        e.hp -= dmg;
        e.kb.set(dx / d, 0, dz / d).multiplyScalar(odrzut);
        if (P.evo.selekcja) e.stun = Math.max(e.stun || 0, 0.6);
        dmgPop(e.pos.x, e.ty, e.pos.z, dmgNum(dmg), '#ff9d7a', 1.1);
        trafil++;
        if (e.hp <= 0) killEnemy(e, j);
      }
      novaRing(P.pos.x + fx * zasieg * 0.5, P.pos.z + fz * zasieg * 0.5, zasieg * 0.55);
      if (trafil) { AUDIO.sfx('wybuch'); G.shake = Math.max(G.shake, 0.12); }
    },
  },
  // ===== PIPSINI NIPOTINI: TOWARZYSZ, nie pocisk =====
  // Jedyna broń, na którą gracz ma wpływ POZYCJĄ: pestka goni najbliższego wroga
  // w swoim promieniu, a gdy nikogo nie ma, wraca do gracza. Co chwilę wbija
  // KIEŁEK, który tłucze wszystko wokół siebie — czyli zostawia ścieżkę
  // mini-wieżyczek. Spirala (życzenie właściciela) siedzi w umiejętności
  // specjalnej: co kilkanaście sekund pestka rozpędza się w koło przez hordę.
  pipsini: {
    ico: 'pestka', nm: 'Pipsini Nipotini', ds: 'Pestka biega, tłucze i sadzi kiełki', max: 5, locked: true,
    lvlDs: l => `${PIPS_ILE(l)} pestka(i), kiełek co ${PIPS_SADZ(l).toFixed(1)} s`
      + (l === 5 ? ' (→ ewolucja!)' : ''),
    evoKey: 'jablon', evoIco: 'pestka', evoNm: 'JABŁOŃ',
    evoDs: 'EWOLUCJA: kiełki żyją 2× dłużej i biją 2× mocniej',
    tick(w, dt) {
      while (G.pestki.length < PIPS_ILE(w.lvl)) G.pestki.push(nowaPestka());
      updatePestki(dt, w.lvl);
    },
  },
  // ===== WIEŻYCZKA: jedyny element „tower defense", jaki pasuje do survivorsa =====
  // Pełny TD bije się z rdzeniem gatunku (ciągły ruch), ale POSTAWIENIE czegoś,
  // co strzela samo przez chwilę, dodaje decyzję „gdzie", nie odbierając ruchu.
  // W markecie zaczyna grać z alejkami i przewróconymi regałami jako lejem.
  sokowirowka: {
    ico: 'sokowirowka', nm: 'Sokowirówka', ds: 'Stawiasz ją i sama miele wrogów w miejscu', max: 5, locked: true,
    lvlDs: l => `${SOKO_ILE(l)} naraz, ${SOKO_ZYCIE(l).toFixed(0)} s, ładunek co ${(6.5 - 0.5 * l).toFixed(1)} s`,
    // TOWER DEFENSE: broń NIE stawia się sama — nabija ŁADUNKI, a gracz stawia
    // wieżyczkę klawiszem F / przyciskiem / Y na padzie (decyzja właściciela).
    // Powód: wieżyczka WABI wrogów w promieniu 9.5 j., a stawiana automatycznie
    // lądowała pod stopami gracza — czyli ściągała hordę dokładnie tam, gdzie stał,
    // i cała jej wartość (zablokuj alejkę, odciągnij bossa) była nieosiągalna.
    // Celowaniem jest RUCH: dobiegasz tam, gdzie chcesz ją mieć, i wciskasz.
    tick(w, dt) {
      const maxLad = SOKO_LAD(w.lvl);
      if ((w.lad || 0) >= maxLad) return;                    // zapas pełny — licznik stoi
      w.tMax = (6.5 - 0.5 * w.lvl) / fireMul();
      w.t -= dt;
      if (w.t > 0) return;
      w.t = w.tMax;
      w.lad = (w.lad || 0) + 1;
      if (!P.sokoPierwszy) {                                // raz na bieg: naucz gracza przycisku
        P.sokoPierwszy = true;
        toastBuff('SOKOWIRÓWKA GOTOWA — wciśnij F, żeby POSTAWIĆ', 'sokowirowka');
        setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 4000);
      }
    },
  },
};
// ============================== PIPSINI: TOWARZYSZ I KIEŁKI ==============================
const PIPS_ILE = l => 1 + Math.floor(l / 2);      // 1 / 1 / 2 / 2 / 3 pestki
// dzielone przez fireMul() jak kazdy inny cooldown — inaczej Pipsini ignoruje Tempo
const PIPS_SADZ = l => (1.8 - 0.16 * l) / fireMul();   // kiełek co 1.64 → 1.0 s
const PIPS_ZASIEG = 7.5;                          // jak daleko od gracza pestka poluje
const KIELEK_ZYCIE = () => (P.evo.jablon ? 8 : 4);
const KIELEK_DMG = () => (P.evo.jablon ? 1.6 : 0.8) * dmgAll();
let kielekMat = null;
function kielekTexture() {
  const S = 32;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#6b4a24'; g.fillRect(13, 24, 6, 8);            // ziemia/łupina
  g.fillStyle = '#4e8f2e'; g.fillRect(15, 12, 2, 13);           // łodyżka
  g.fillStyle = '#7cc94f';                                       // dwa listki
  g.beginPath(); g.ellipse(11, 14, 5, 3, -0.5, 0, 7); g.fill();
  g.beginPath(); g.ellipse(21, 12, 5, 3, 0.5, 0, 7); g.fill();
  g.fillStyle = '#a8e06a'; g.fillRect(15, 8, 2, 4);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function nowaPestka() {
  const bb = new Billboard('pipsini_nipotini', 0.8);
  bb.play('run');
  return { bb, pos: P.pos.clone(), cel: null, sadzT: 0, spiralaCd: 12, spirala: 0, kat: Math.random() * 7 };
}
function usunPestki() {
  for (const p of G.pestki) p.bb.dispose();
  G.pestki = [];
  for (const k of G.kielki) scene.remove(k.mesh);
  G.kielki = [];
}
function sadzKielek(x, z) {
  if (G.kielki.length > 40) return;                // hamulec: przy 3 pestkach sypie się gęsto
  if (!kielekMat) kielekMat = new THREE.MeshBasicMaterial({ map: kielekTexture(),
    transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const m = new THREE.Mesh(unitGeo, kielekMat);
  m.scale.set(0.55, 0.55, 1);
  m.position.set(x, terrainH(x, z), z);
  scene.add(m);
  G.kielki.push({ mesh: m, pos: new THREE.Vector3(x, 0, z), t: 0, cd: 0 });
}
function updatePestki(dt, lvl) {
  for (const p of G.pestki) {
    // ---- cel: najbliższy wróg w promieniu, inaczej wracamy do gracza ----
    let cel = null, najl = PIPS_ZASIEG;
    for (const e of G.enemies) {
      if (e.dying) continue;
      const d = e.pos.distanceTo(p.pos);
      if (d < najl) { najl = d; cel = e; }
    }
    p.spiralaCd -= dt;
    if (p.spiralaCd <= 0 && G.enemies.length > 6) { p.spirala = 2.2; p.spiralaCd = 12; p.kat = 0; }
    let doX, doZ, spd = 6.4;
    if (p.spirala > 0) {
      // SPIRALA: rozkręcający się łuk wokół gracza — przelot przez hordę
      p.spirala -= dt;
      p.kat += dt * 5.5;
      const r = 1.4 + (2.2 - p.spirala) * 2.6;
      doX = P.pos.x + Math.cos(p.kat) * r;
      doZ = P.pos.z + Math.sin(p.kat) * r;
      spd = 11;
    } else if (cel) { doX = cel.pos.x; doZ = cel.pos.z; }
    else {                                          // trzyma się przy nodze gracza
      p.kat += dt * 1.6;
      doX = P.pos.x + Math.cos(p.kat) * 1.6;
      doZ = P.pos.z + Math.sin(p.kat) * 1.6;
      spd = 5.2;
    }
    const dx = doX - p.pos.x, dz = doZ - p.pos.z;
    const dl = Math.hypot(dx, dz) || 1e-6;
    p.pos.x += (dx / dl) * spd * dt;
    p.pos.z += (dz / dl) * spd * dt;
    p.bb.facing = faceAngle(dx / dl, dz / dl);
    p.bb.update(dt, p.pos, terrainH(p.pos.x, p.pos.z));
    // ---- kontakt: rani i odpycha ----
    for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying || e.orbCd > 0) continue;
      if (e.pos.distanceTo(p.pos) > 0.85) continue;
      const dmg = 1.2 * dmgAll();
      e.hp -= dmg; e.orbCd = 0.4 / fireMul();          // Pipsini tez slucha Tempa
      e.kb.copy(e.pos).sub(p.pos).setY(0).normalize().multiplyScalar(1.8);
      dmgPop(e.pos.x, e.ty, e.pos.z, dmgNum(dmg), '#c9f07a', 0.85);
      if (e.hp <= 0) killEnemy(e, j);
    }
    // ---- sadzenie ----
    p.sadzT -= dt;
    if (p.sadzT <= 0) { p.sadzT = PIPS_SADZ(lvl); sadzKielek(p.pos.x, p.pos.z); }
  }
  // ---- kiełki: tłuką wokół siebie i więdną ----
  for (let i = G.kielki.length - 1; i >= 0; i--) {
    const k = G.kielki[i];
    k.t += dt;
    const zycie = KIELEK_ZYCIE();
    k.mesh.rotation.y = camYaw;
    const rosnie = Math.min(1, k.t * 4);            // wyrasta w 0.25 s
    k.mesh.scale.set(0.55 * rosnie, 0.55 * rosnie * (1 + Math.sin(k.t * 6) * 0.05), 1);
    k.cd -= dt;
    if (k.cd <= 0) {
      k.cd = 0.5;
      const dmg = KIELEK_DMG();
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        if (e.pos.distanceTo(k.pos) > (P.evo.jablon ? 1.9 : 1.4)) continue;
        e.hp -= dmg;
        dmgPop(e.pos.x, e.ty, e.pos.z, dmgNum(dmg), '#a8e05f', 0.7);
        if (e.hp <= 0) killEnemy(e, j);
      }
    }
    if (k.t > zycie) { scene.remove(k.mesh); G.kielki.splice(i, 1); }
  }
}

const SOKO_ILE = l => 1 + Math.floor(l / 2);      // 1 / 1 / 2 / 2 / 3
// Zapas ładunków OGRANICZONY LIMITEM STOJĄCYCH: bez tego gracz nabijał drugi ładunek,
// którego przy poziomie 1-2 nie ma gdzie wydać, i patrzył na przycisk, co nie działa.
const SOKO_LAD = l => Math.min(2, SOKO_ILE(l));
const STAW_KLAWISZ = 'KeyF';
const SOKO_ZYCIE = l => 20 + l * 3;               // 23 → 35 s (jeśli wcześniej nie rozwalą)
const SOKO_HP = l => 6 + 3 * l;                   // wytrzymałość na ciosy wrogów
const SOKO_WABI = 9.5;                            // w tym promieniu wrogowie idą po NIĄ, nie po gracza
const SOKO_CD = l => 0.55 - 0.05 * l;             // strzał co 0.5 → 0.3 s
const SOKO_DMG = l => 0.8 + 0.25 * l;             // mnożnik obrażeń pocisku

// pixelowa sokowirówka rysowana w kodzie — do podmiany na sprite'a z PixelLaba
function sokowirowkaTexture() {
  const W = 32, H = 40;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const p = (x, y, w, h, kol) => { g.fillStyle = kol; g.fillRect(x, y, w, h); };
  p(6, 30, 20, 8, '#7d8794');                     // podstawa
  p(6, 30, 20, 2, '#a9b3c0');
  p(9, 14, 14, 17, '#d7dde6');                    // korpus
  p(9, 14, 3, 17, '#f2f5f9');                     // światło z lewej
  p(20, 14, 3, 17, '#aab3bf');                    // cień z prawej
  p(11, 20, 10, 6, '#8ad14f');                    // okienko z sokiem
  p(11, 20, 10, 2, '#b6ea7d');
  p(7, 8, 18, 6, '#c2ccd8');                      // lej wsypowy
  p(7, 8, 18, 2, '#e8eef5');
  p(13, 3, 6, 5, '#f2c14a');                      // marchewka wsypana do leja
  p(14, 0, 4, 3, '#5aa83c');
  p(12, 34, 3, 4, '#5a6472'); p(17, 34, 3, 4, '#5a6472');   // nóżki
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let sokoMat = null, paskoTlo = null, paskoFill = null;
// PASEK ŻYCIA nad wieżyczką: dwa płaskie quady zawsze zwrócone do kamery.
// Wieżyczka ściąga na siebie hordę, więc gracz musi widzieć, ile jej zostało.
function dodajPasek(t, y) {
  if (!paskoTlo) {
    paskoTlo = new THREE.MeshBasicMaterial({ color: 0x1b1b22, transparent: true, opacity: 0.85, depthWrite: false });
    paskoFill = new THREE.MeshBasicMaterial({ color: 0x8ad14f, depthWrite: false });
  }
  t.pasTlo = new THREE.Mesh(unitGeo, paskoTlo);
  t.pasFill = new THREE.Mesh(unitGeo, paskoFill.clone());
  for (const m of [t.pasTlo, t.pasFill]) { m.renderOrder = 4; scene.add(m); }
  t.pasY = y;
}
function updatePasek(t) {
  const k = Math.max(0, t.hp / t.maxHp);
  t.pasTlo.position.set(t.pos.x, t.pasY, t.pos.z);
  t.pasTlo.scale.set(1.5, 0.16, 1);
  billboardQuat(t.pasTlo.quaternion);
  // wypełnienie od LEWEJ: skalujemy i przesuwamy o połowę ubytku
  t.pasFill.position.set(t.pos.x - (1 - k) * 0.72, t.pasY + 0.01, t.pos.z);
  t.pasFill.scale.set(1.44 * k, 0.11, 1);
  billboardQuat(t.pasFill.quaternion);
  t.pasFill.material.color.setHex(k > 0.5 ? 0x8ad14f : (k > 0.25 ? 0xf2c14a : 0xe0453c));
  t.pasFill.visible = k > 0.001;
}
// ---- STAWIANIE NA ŻĄDANIE: klawisz F / przycisk / Y na padzie ----
function postawWiezyczke() {
  if (!G.running || G.paused || G.dying) return;
  const w = hasWeapon('sokowirowka');
  if (!w || !(w.lad > 0)) return;
  if (G.turrets.length >= SOKO_ILE(w.lvl)) {        // limit stojących — ładunek zostaje
    toastBuff('LIMIT SOKOWIRÓWEK — poczekaj, aż któraś padnie', 'sokowirowka');
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 1800);
    return;
  }
  w.lad--;
  stawSokowirowke(w.lvl);
  AUDIO.sfx('totem');
  G.shake = Math.max(G.shake, 0.12);
  odswiezStawBtn();
}
// Przycisk odświeżamy co klatkę, ale DOM ruszamy tylko przy realnej zmianie stanu
// (pasek kwantowany co 5%), bo inaczej byłoby to kilkaset zapisów na sekundę.
let _stawStan = '';
function odswiezStawBtn() {
  const el = document.getElementById('stawBtn');
  if (!el) return;
  const w = G.running ? hasWeapon('sokowirowka') : null;
  const widoczny = !!w && !G.paused && !G.dying && !G.fps.on;
  const lad = w ? (w.lad || 0) : 0;
  const maxLad = w ? SOKO_LAD(w.lvl) : 0;
  const pelno = w ? G.turrets.length >= SOKO_ILE(w.lvl) : false;
  // pasek: 100% = zapas pełny. `w.tMax` jest ustawiane w ticku broni, więc w pierwszej
  // klatce po zdobyciu Sokowirówki jeszcze go nie ma — wtedy pasek musi być PUSTY, nie pełny.
  const fill = lad >= maxLad ? 100
    : (w && w.tMax ? Math.round((1 - Math.max(0, w.t) / w.tMax) * 20) * 5 : 0);
  const stan = widoczny + '|' + lad + '|' + maxLad + '|' + pelno + '|' + fill;
  if (stan === _stawStan) return;
  _stawStan = stan;
  el.classList.toggle('on', widoczny);
  if (!widoczny) return;
  el.classList.toggle('gotowy', lad > 0 && !pelno);
  el.classList.toggle('pelno', pelno);
  const im = el.querySelector('.kimg');
  if (!im.style.backgroundImage) im.style.backgroundImage = `url(${icon('sokowirowka', 4)})`;
  const lw = el.querySelector('.lad');
  if (lw.childElementCount !== maxLad) lw.innerHTML = '<i></i>'.repeat(maxLad);
  for (let i = 0; i < maxLad; i++) lw.children[i].className = i < lad ? '' : 'off';
  el.querySelector('.pas b').style.width = fill + '%';
}
function stawSokowirowke(lvl) {
  if (!sokoMat) sokoMat = new THREE.MeshBasicMaterial({ map: sokowirowkaTexture(),
    transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const y = supportY(P.pos.x, P.pos.z, P.y);      // staje tam, gdzie stoisz — też na regale
  // WYŻSZA OD WROGÓW (wróg ma ~1.5 j.): ma być widoczna w tłumie, bo to ona
  // przejmuje na siebie hordę i gracz musi wiedzieć, gdzie stoi.
  const h = 2.1;
  const m = new THREE.Mesh(unitGeo, sokoMat);
  m.scale.set(h * 0.8, h, 1);
  m.position.set(P.pos.x, y, P.pos.z);
  scene.add(m);
  const hp = SOKO_HP(lvl);
  const t = { mesh: m, pos: new THREE.Vector3(P.pos.x, y, P.pos.z),
              t: 0, zycie: SOKO_ZYCIE(lvl), cd: 0, lvl, hp, maxHp: hp, hitCd: 0 };
  dodajPasek(t, y + h + 0.25);
  G.turrets.push(t);
  AUDIO.sfx('totem');
  puff(P.pos.x, y + 0.6, P.pos.z, 0xa8e05f, 1.4);
  dmgPop(P.pos.x, y + 1.6, P.pos.z, 'MIELE!', '#a8e05f', 1.2);
}
function updateTurrets(dt) {
  for (let i = G.turrets.length - 1; i >= 0; i--) {
    const t = G.turrets[i];
    t.t += dt;
    // drga jak pracująca sokowirówka; przechył doklejamy do obrotu billboardu
    billboardQuat(t.mesh.quaternion, Math.sin(t.t * 26) * 0.045);
    if (t.zycie - t.t < 3) t.mesh.visible = Math.sin(t.t * 16) > -0.45;   // miga przed końcem
    updatePasek(t);
    // WROGOWIE JĄ TŁUKĄ — to ona przejmuje na siebie hordę
    t.hitCd -= dt;
    if (t.hitCd <= 0) {
      for (const e of G.enemies) {
        if (e.dying || e.pos.distanceTo(t.pos) > 1.3) continue;
        t.hp -= e.T.dmg * dmgScale();
        t.hitCd = 0.35;
        okruchy(t.pos.x, t.pos.y + 0.9, t.pos.z, 0xd7dde6, 2);
        break;
      }
    }
    t.cd -= dt;
    if (t.cd <= 0) {
      let cel = null, najl = 13 * (rangeF() / 14);   // rangeF() jest ABSOLUTNY (14 * 1.2^lvl)
      for (const e of G.enemies) {
        if (e.dying) continue;
        const d = e.pos.distanceTo(t.pos);
        if (d < najl) { najl = d; cel = e; }
      }
      if (cel) {
        t.cd = SOKO_CD(t.lvl);
        // Pocisk wpada do TEJ SAMEJ tablicy co kule gracza (`G.shots`), więc
        // kolizje, przebicie i krytyki obsługuje jedna ścieżka — zero duplikatu.
        const dir = cel.pos.clone().sub(t.pos).setY(0).normalize();
        const mm = new THREE.Mesh(shotGeo, shotMat);
        mm.position.set(t.pos.x, t.pos.y + 0.7, t.pos.z);
        scene.add(mm);
        G.shots.push({ mesh: mm, dir, life: 1.1, pierce: 0, hit: new Set(),
                       y: t.pos.y + 0.7, dmg: SOKO_DMG(t.lvl) });
        AUDIO.sfx('strzal');
      }
    }
    if (t.t >= t.zycie || t.hp <= 0) {
      scene.remove(t.mesh); scene.remove(t.pasTlo); scene.remove(t.pasFill);
      t.pasFill.material.dispose();
      okruchy(t.pos.x, t.pos.y + 0.5, t.pos.z, 0xd7dde6, t.hp <= 0 ? 10 : 5);
      if (t.hp <= 0) { nova(t.pos.x, t.pos.z, 2.4, 2 * dmgAll()); AUDIO.sfx('wybuch'); }
      G.turrets.splice(i, 1);
    }
  }
}
// ============================== CZOSNEK NA GIĘTKIEJ LINCE ==============================
// Zamiast sztywnej orbity: linka z segmentów liczona VERLETEM, a czosnek jest masą
// na jej końcu. Dzięki temu przy zmianie kierunku zostaje z tyłu i dopiero go
// dogania, a uderzenie w wroga odpycha wroga I szarpie linką — widać opór.
// Sama linka też odpycha (delikatnie), więc horda ją wygina.
const LINKA_SEG = 5;                   // liczba segmentów linki
const LINKA_DL = 0.46;                 // długość jednego segmentu (zasięg ~2.1 j.)
const LINKA_TLUM = 0.90;               // tłumienie bezwładności
let linkaMat = null;
function linkaTexture() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = '#cfc08a'; g.fillRect(0, 0, 8, 8);
  g.fillStyle = '#a89566'; g.fillRect(0, 5, 8, 3);      // cień wzdłuż linki = wygląda na skręconą
  g.fillStyle = '#eadfb4'; g.fillRect(0, 0, 8, 2);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// segment linki to PŁASKI quad leżący w płaszczyźnie XZ — linka wisi na wysokości
// pasa, a kamera patrzy z góry, więc płaski pasek czyta się jak sznurek
const linkaGeo = new THREE.PlaneGeometry(1, 1);
linkaGeo.rotateX(-Math.PI / 2);
function nowyCzosnek(idx) {
  if (!linkaMat) linkaMat = new THREE.MeshBasicMaterial({ map: linkaTexture(), side: THREE.DoubleSide });
  const m = new THREE.Mesh(unitGeo, czosnekMat);
  m.scale.set(0.8 * czosnekAspect, 0.8, 1);
  scene.add(m);
  const pkt = [];
  for (let i = 0; i <= LINKA_SEG; i++) {
    const d = i * LINKA_DL;
    pkt.push({ x: P.pos.x + d, z: P.pos.z, px: P.pos.x + d, pz: P.pos.z });
  }
  const segi = [];
  for (let i = 0; i < LINKA_SEG; i++) {
    const s = new THREE.Mesh(linkaGeo, linkaMat);
    s.scale.set(0.09, 1, LINKA_DL);
    scene.add(s);
    segi.push(s);
  }
  return { mesh: m, pkt, segi, kat: idx * 2.1, opor: 0 };
}
function usunCzosnki() {
  for (const o of G.orbs) { scene.remove(o.mesh); if (o.segi) for (const s of o.segi) scene.remove(s); }
  G.orbs = [];
}
function updateCzosnki(dt, lvl) {
  const evo = P.evo.kosci;
  const omega = evo ? 4.6 : 2.7;                       // prędkość kątowa napędu
  // SOKOLI WZROK (+20% zasięgu broni) wydłuża CAŁĄ LINKĘ, nie tylko punkt
  // docelowy: gdyby rosnął sam cel, lina napięłaby się na swojej stałej długości
  // i zasięg by stanął. Segment liczymy więc z żądanego zasięgu.
  // UWAGA NA `rangeF()`: zwraca wartosc ABSOLUTNA (14 * 1.2^poziom), a nie mnoznik.
  // Pomnozenie 2.1 * rangeF() dalo linke na 29 jednostek — konca nie bylo widac.
  // Dzielimy przez baze 14, zeby wyszedl czysty mnoznik (1.0 bez pasywu).
  const zasieg = (evo ? 2.7 : 2.1) * (rangeF() / 14);
  const segDl = zasieg / LINKA_SEG * 1.04;             // ciut luzu, żeby linka mogła się wygiąć
  const rr = evo ? 1.5 : 1.0;                          // promień rażenia czosnku
  const oDmg = 2 * (evo ? 2 : 1) * dmgAll();
  const anchorY = P.y + 0.95;                          // linka wisi na wysokości pasa
  for (let k = 0; k < G.orbs.length; k++) {
    const o = G.orbs[k];
    // napęd: kąt rośnie, ale trafienie na moment go dławi (stąd czuć opór)
    o.opor = Math.max(0, o.opor - dt * 2.2);
    o.kat += omega * dt * (1 - 0.65 * Math.min(1, o.opor)) + (k === 0 ? 0 : 0);
    const rozstaw = k * (Math.PI * 2 / Math.max(1, G.orbs.length));
    const tx = P.pos.x + Math.cos(o.kat + rozstaw) * zasieg;
    const tz = P.pos.z + Math.sin(o.kat + rozstaw) * zasieg;
    const pkt = o.pkt;
    pkt[0].x = P.pos.x; pkt[0].z = P.pos.z;            // uchwyt trzyma gracz
    // VERLET: bezwładność + sprężyna ciągnąca czubek do punktu napędu
    for (let i = 1; i < pkt.length; i++) {
      const p = pkt[i];
      const vx = p.x - p.px, vz = p.z - p.pz;
      p.px = p.x; p.pz = p.z;
      p.x += vx * LINKA_TLUM; p.z += vz * LINKA_TLUM;
      if (i === pkt.length - 1) {                      // czubek = czosnek
        const s = Math.min(1, 9 * dt);
        p.x += (tx - p.x) * s; p.z += (tz - p.z) * s;
      }
    }
    // WIĘZY długości — 3 iteracje wystarczają, żeby linka nie gumowała
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < pkt.length - 1; i++) {
        const a = pkt[i], b = pkt[i + 1];
        let dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz) || 1e-6;
        const korekta = (d - segDl) / d;
        const w0 = i === 0 ? 0 : 0.5, w1 = i === 0 ? 1 : 0.5;   // punkt 0 przypięty
        a.x += dx * korekta * w0; a.z += dz * korekta * w0;
        b.x -= dx * korekta * w1; b.z -= dz * korekta * w1;
      }
    }
    // ---- KOLIZJE ----
    const czubek = pkt[pkt.length - 1];
    for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying) continue;
      const dx = czubek.x - e.pos.x, dz = czubek.z - e.pos.z;
      if (dx * dx + dz * dz < rr && e.orbCd <= 0) {
        e.hp -= oDmg; e.orbCd = 0.5 / fireMul();       // czosnek tez slucha Tempa
        e.kb.copy(e.pos).sub(P.pos).setY(0).normalize().multiplyScalar(2.6);
        spark(e.pos.x, e.ty + 1.0, e.pos.z);
        dmgPop(e.pos.x, e.ty, e.pos.z, dmgNum(oDmg), '#eaffd0', 0.9);
        // SZARPNIĘCIE: czubek traci prędkość i napęd na moment staje
        const dl = Math.hypot(dx, dz) || 1e-6;
        czubek.px = czubek.x + (dx / dl) * 0.22;
        czubek.pz = czubek.z + (dz / dl) * 0.22;
        o.opor = 1;
        if (e.hp <= 0) killEnemy(e, j);
      }
    }
    // sama LINKA odpycha (bez obrażeń) i sama się przy tym wygina
    for (let i = 1; i < pkt.length - 1; i++) {
      const p = pkt[i];
      for (const e of G.enemies) {
        if (e.dying) continue;
        const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.42 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), pchniecie = (0.65 - d) / d;
        e.pos.x -= dx * pchniecie * 0.55; e.pos.z -= dz * pchniecie * 0.55;
        p.x += dx * pchniecie * 0.45; p.z += dz * pchniecie * 0.45;
      }
    }
    // ---- rysowanie ----
    o.mesh.position.set(czubek.x, anchorY + Math.sin(G.time * 5 + k) * 0.06, czubek.z);
    o.mesh.rotation.set(0, camYaw, -o.kat * 1.6);       // czosnek wiruje wokół własnej osi
    const skala = evo ? 1.2 : 0.8;
    if (Math.abs(o.mesh.scale.y - skala) > 0.01) o.mesh.scale.set(skala * czosnekAspect, skala, 1);
    for (let i = 0; i < o.segi.length; i++) {
      const a = pkt[i], b = pkt[i + 1], s = o.segi[i];
      const dx = b.x - a.x, dz = b.z - a.z;
      const dl = Math.hypot(dx, dz);
      s.position.set((a.x + b.x) / 2, anchorY - 0.04, (a.z + b.z) / 2);
      s.rotation.y = Math.atan2(dx, dz);
      s.scale.set(0.09, 1, Math.max(0.05, dl));
    }
  }
}

const stompLvl = () => { const w = hasWeapon('tupniecie'); return w ? w.lvl : 0; };
const stompRad = l => 3 + l * 0.7 + (P.evo.sejsm ? 2 : 0);
const stompDmg = l => l * 1.5 * (P.evo.sejsm ? 2 : 1) * dmgAll();

// ============================== PASYWY (bufy zbierane kartami) ==============================
const PASSIVES = {
  moc:    { ico: 'plomien', nm: 'Moc',     ds: '+15% obrażeń wszystkiego', max: 5 },
  tempo:  { ico: 'zegar', nm: 'Tempo',   ds: '+12% szybkości ataków',    max: 5 },
  buty:   { ico: 'but', nm: 'Klapki Carrotella', ds: '+10% szybkości ruchu', max: 5 },
  magnes: { ico: 'magnes', nm: 'Magnes',  ds: '+35% zasięgu zbierania',   max: 5 },
  krytyk: { ico: 'gwiazda', nm: 'Krytyk',  ds: '+10% szansy na cios ×3',   max: 5 },
  serce:  { ico: 'serce', nm: 'Serducho', ds: '+1 max serce i pełne leczenie', max: 5 },
  zasieg: { ico: 'celownik', nm: 'Sokoli wzrok', ds: '+20% zasięgu broni',  max: 4 },
  tarcza: { ico: 'tarcza', nm: 'Tarcza brainrota', ds: 'Blokuje 1 trafienie (ładuje się z czasem)', max: 3, locked: true },
};

// ============================== PRZYPRAWY NONNY (karty POWTARZALNE) ==============================
// Pasywy mają `max`, bronie mają `max` + ewolucję — więc pula normalnych kart
// KIEDYŚ wysycha i awans przestaje być decyzją. Te cztery karty nie mają limitu
// i dopełniają slotów dopiero wtedy, gdy zabraknie normalnych (patrz `showCards`),
// więc wczesna gra wygląda dokładnie jak wcześniej. Bonusy są małe świadomie:
// mają nagradzać długi bieg, nie zastępować broni.
const REPEAT = {
  sol:     { ico: 'plomien',  nm: 'Sól Nonny',      ds: '+3% obrażeń (bez limitu)' },
  oliwa:   { ico: 'zegar',    nm: 'Oliwa Nonny',    ds: '+3% szybkości ataków (bez limitu)' },
  pieprz:  { ico: 'gwiazda',  nm: 'Pieprz Nonny',   ds: '+2% szansy na cios ×3 (bez limitu)' },
  bazylia: { ico: 'celownik', nm: 'Bazylia Nonny',  ds: '+4% zasięgu broni (bez limitu)' },
};
function repeatPool() {
  return Object.keys(REPEAT).map(key => {
    const R = REPEAT[key];
    const n = P.repeat[key] || 0;
    return {
      ico: R.ico, nm: R.nm + (n ? ` ×${n + 1}` : ''), ds: R.ds,
      // `n` sluzy TYLKO do podpisu. Licznik czytamy na nowo w chwili klikniecia:
      // kafelek moze przelezec w kolejce overlayow (dwa awanse w jednej klatce),
      // a `n + 1` z chwili budowy COFNELOBY licznik do 1 zamiast go podniesc.
      do: () => { P.repeat[key] = (P.repeat[key] || 0) + 1; },
    };
  });
}

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

// ============================== KOLEJKA OVERLAYÓW ==============================
// Skrzynia i awans mogą wypaść W TEJ SAMEJ KLATCE. Wcześniej oba overlaye stawały się
// widoczne naraz, a zamknięcie jednego zdejmowało pauzę: świat się symulował, wrogowie
// bili, a gracz nie mógł się ruszyć, bo drugi overlay łykał wejście (`pointerdown`
// odrzuca zdarzenia z `.ov`). Drugi objaw tego samego: dwa awansy w jednej klatce
// i `showCards()` robiło `innerHTML=''`, KASUJĄC poprzednie trzy karty.
// Teraz overlaye stoją w kolejce i pauza schodzi dopiero, gdy kolejka jest pusta.
const OV_Q = [];
const ovWidoczny = () =>
  document.getElementById('cardsOv').style.display === 'flex' ||
  document.getElementById('swapOv').style.display === 'flex';
function pchnijOverlay(fn) {
  puscMysz();                                      // karty klika sie kursorem
  // TRUP NIE AWANSUJE: obrazenia od spadajacego regalu i od Sodina wolaja `startDeath()`
  // BEZ `return`, wiec ta sama klatka leciala dalej do petli pigulek i mogla otworzyc
  // karty POD ekranem smierci (dwa `.ov` naraz = prawie czarny ekran).
  if (G.dying || G.over || !G.running) return;
  if (ovWidoczny()) { OV_Q.push(fn); return; }
  G.paused = true;
  fn();
}
function zamknijOverlay(id) {
  document.getElementById(id).style.display = 'none';
  // WYCZYŚĆ KAFELKI: samo `display:none` zostawiało je w drzewie z żywym `onclick`,
  // więc zamknięty overlay dawał się jeszcze „kliknąć" z kodu i ponownie nadawał
  // ulepszenie. Gracz by tego nie tknął, ale to mina dla każdego przyszłego testu.
  const wrap = document.getElementById(id === 'cardsOv' ? 'cards' : 'swapList');
  if (wrap) wrap.innerHTML = '';
  const nast = OV_Q.shift();
  if (nast) { G.paused = true; nast(); return; }   // pauza trwa dalej dla następnego
  G.paused = false;
}
function showCards() {
  const wrap = document.getElementById('cards'); wrap.innerHTML = '';
  const pool = cardPool();
  const picks = [];
  const goldIdx = pool.findIndex(u => u.gold);      // ewolucja ma pierwszeństwo, max 1
  if (goldIdx >= 0) picks.push(pool.splice(goldIdx, 1)[0]);
  for (let i = pool.length - 1; i >= 0; i--) if (pool[i].gold) pool.splice(i, 1);
  while (picks.length < 3 && pool.length) {
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  // PÓŹNA GRA: brakujące slotu dopełniają przyprawy bez limitu (zamiast „Znaleźne”
  // trzydzieści razy pod rząd). Wcześnie ta gałąź nie odpala, bo pula normalnych
  // kart ma wtedy kilkanaście pozycji.
  if (picks.length < 3) {
    const rep = repeatPool();
    while (picks.length < 3 && rep.length) picks.push(rep.splice(Math.floor(Math.random() * rep.length), 1)[0]);
  }
  // ZERO KART = ZERO OVERLAYA. Awans nie może zmuszać do kliknięcia w kafelek,
  // który nic nie znaczy — nagroda leci sama, gra się nie zatrzymuje.
  // (Dziś nieosiągalne, bo przyprawy są bez limitu; zostaje jako siatka
  // bezpieczeństwa, gdyby kiedyś dostały `max`.)
  if (!picks.length) {
    G.runCoins += 20; drawCoins();
    toastBuff('AWANS — nic już do ulepszenia: +20 monet', 'moneta');
    return zamknijOverlay('cardsOv');
  }
  for (const u of picks) {
    const d = document.createElement('div');
    d.className = 'card' + (u.gold ? ' gold' : '');
    d.innerHTML = `<div class="ico">${ico(u.ico, 42)}</div><div class="nm">${u.nm}</div><div class="ds">${u.ds}</div>`;
    d.onclick = () => { u.do(); zamknijOverlay('cardsOv'); };
    wrap.appendChild(d);
  }
  document.getElementById('cardsOv').style.display = 'flex';
}

// ============================== WYMIENNIK BRONI 🔄 ==============================
function openSwap() {
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
  skip.innerHTML = `<div class="ico">${ico('wymiana', 42)}</div><div class="nm">Zostaw jak jest</div><div class="ds">+10 monet pocieszenia</div>`;
  skip.onclick = () => { G.runCoins += 10; drawCoins(); closeSwap(); };
  wrap.appendChild(skip);
  document.getElementById('swapOv').style.display = 'flex';
}
// BROŃ POSTACI JEST TYLKO JEJ. Bez tego świeży Carrotello wyciągał ze skrzyni
// Scyzoryki (najlepszą broń jednocelową w grze) w 40. sekundzie pierwszego biegu
// i wybór postaci przestawał cokolwiek znaczyć — a to on ma być powodem, żeby
// odblokowywać kolejne warzywa. Decyzja właściciela.
const broniDostepna = k => {
  const W = WEAPONS[k];
  if (W.postac && W.postac !== charKey) return false;   // startowa broń innej postaci
  return !W.locked || META.unlocked[k];
};
// skrzynia przy WOLNYM slocie: prezent — wybór nowej broni bez oddawania
function openNewWeapon() {
  const wszystkie = Object.keys(WEAPONS).filter(k => !hasWeapon(k) && broniDostepna(k));
  if (!wszystkie.length) { G.runCoins += 15; drawCoins(); return zamknijOverlay('swapOv'); }
  // LOSUJEMY 2 propozycje (nie pokazujemy całej listy — wybór ma coś znaczyć)
  const opts = [];
  const pula = wszystkie.slice();
  while (opts.length < 2 && pula.length) opts.push(pula.splice(Math.floor(Math.random() * pula.length), 1)[0]);
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
  const wszystkie = Object.keys(WEAPONS).filter(k => !hasWeapon(k) && broniDostepna(k));
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
      if (oldW.key === 'kosc') usunCzosnki();                 // razem z segmentami linki
      if (oldW.key === 'pipsini') usunPestki();               // razem z kiełkami
      Object.assign(oldW, { key, lvl: 1, t: 0 });
      renderWpns();
      closeSwap();
    };
    wrap.appendChild(d);
  }
}
function closeSwap() { zamknijOverlay('swapOv'); }

// ============================== HUD ==============================
function drawHearts() {
  // HP przycinamy do maksimum: `repeat()` z liczba ujemna rzuca RangeError i zabija
  // cala klatke, a wystarczy jedno leczenie ponad max (albo hak debugowy), zeby to
  // wywolac. Prog licznika nizszy na waskich ekranach — rzad 11 serc wchodzil
  // w licznik ZAGROZENIA.
  const hp = Math.max(0, Math.min(P.hp, P.maxHp));
  const prog = innerWidth < 520 ? 8 : 12;
  document.getElementById('hearts').innerHTML = P.maxHp > prog
    ? ico('serce', 18) + ` ${hp} / ${P.maxHp}`      // dużo serc = licznik zamiast rzędu
    : ico('serce', 18).repeat(hp) + ico('sercePuste', 18).repeat(Math.max(0, P.maxHp - hp));
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
            const solid = { x, z: zz, hw: len / 2, hl: 1.1, top: g0 + SHELF_H + 0.16 };
            solids.push(solid);
            shelves.push({ solid, x, z: zz, g0, len, kier, pivotZ, t: 0, stan: 'stoi' });
          }
        }
      }
    }
    // ======== REGAŁY JAKO INSTANCJE: 3 draw calle na chunk zamiast 3 na regał ========
    if (shelves.length) {
      if (!regalGeo) initRegalGeo();
      const inst = {
        korpus: new THREE.InstancedMesh(regalGeo.korpus, shelfMat, shelves.length),
        polkiDol: new THREE.InstancedMesh(regalGeo.polkiDol, plankMat, shelves.length),
        polkiGora: new THREE.InstancedMesh(regalGeo.polkiGora, plankMat, shelves.length),
      };
      for (const im of [inst.korpus, inst.polkiDol, inst.polkiGora]) {
        im.frustumCulled = false;                  // regały sięgają poza pudełko chunka
        scene.add(im); rocks.push(im);
      }
      shelves.forEach((sh, i) => { sh.inst = inst; sh.i = i; ustawRegal(sh, 0); });
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
    // InstancedMesh trzyma wlasny instanceMatrix w buforze GL, ktorego samo `remove`
  // NIE zwalnia (three trzyma atrybuty w WeakMap, a ta nie odpala finalizerow).
  // Geometrii i materialow dispose'owac NIE WOLNO — sa wspoldzielone miedzy chunkami.
  for (const m of ch.rocks) { scene.remove(m); if (m.isInstancedMesh) m.dispose(); }
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
  scene.background.setHex(M.sky);                  // awaryjne tło pod kopułą nieba
  setSky(key);                                     // gradient nieba per mapa (dol == M.sky!)
  scene.fog.color.setHex(M.sky);
  scene.fog.near = M.fog[0]; scene.fog.far = M.fog[1];
  water.visible = M.water;
  // W markecie ZADEN obiekt nie ma castShadow, wiec cala shadow mapa (PCFSoft
  // 2048^2) liczyla sie po nic. Zmierzone: 6.68 -> 4.82 ms renderu przy 500 wrogach.
  sun.castShadow = !M.indoor;
  for (const c of clouds) c.m.visible = !M.indoor;
  rebuildWorld();
  grassCenter.set(1e9, 1e9);
  updateGrassField();
  for (const c of chests) placeChest(c);
  ustawWygladGarnkow(key);          // garnek na Łąkach / witryna chłodnicza w markecie
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
    // InstancedMesh trzyma wlasny instanceMatrix w buforze GL, ktorego samo `remove`
  // NIE zwalnia (three trzyma atrybuty w WeakMap, a ta nie odpala finalizerow).
  // Geometrii i materialow dispose'owac NIE WOLNO — sa wspoldzielone miedzy chunkami.
  for (const m of ch.rocks) { scene.remove(m); if (m.isInstancedMesh) m.dispose(); }
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
// PIERWSZE SZEŚĆ SKRZYŃ W ZAPISIE JEST WYREŻYSEROWANE — mała, mała, WIELKA,
// mała, mała, JACKPOT. Chwyt podpatrzony u Vampire Survivors (sekwencja 1-1-3-1-1-5
// z nieprzeskakiwalną animacją): przy czystej losowości pierwsza skrzynia
// w 48% przypadków daje monety, czyli nic zapamiętywalnego, a pierwsze wrażenie
// z gry jest zbyt cenne, żeby zostawiać je kostce.
const SKRZYNIE_SCENARIUSZ = ['monety', 'kosci', 'magnes', 'monety', 'kosci', 'djump'];
function chestReward(c) {
  AUDIO.sfx('skrzynia');
  const nr = META.st.skrzynki || 0;
  META.st.skrzynki = nr + 1;
  saveMetaSoon();
  const scenariusz = nr < SKRZYNIE_SCENARIUSZ.length ? SKRZYNIE_SCENARIUSZ[nr] : null;
  // KARABIN: najrzadsza i najmocniejsza nagroda, RAZ NA BIEG. Poza wyreżyserowaną
  // szóstką pierwszych skrzyń — te mają swoją własną dramaturgię i nie wolno jej psuć.
  // Skrzynia respawnuje się co ~45 s, więc 18% na skrzynię wychodzi ~1 raz na bieg.
  // NIE ODPALAMY GO OD RAZU: gracz dostaje go „do kieszeni" i sam wybiera moment
  // (przycisk obok skoku / klawisz R). Odpalenie z zaskoczenia przy skrzyni marnowało
  // pół trybu na bieg do hordy.
  if (!scenariusz && !P.karabinRun && Math.random() < 0.18) {
    P.karabinRun = true;
    dajKarabin();
    return;
  }
  // ze scenariusza wypada tylko to, czego gracz jeszcze nie ma (podwójny skok)
  const wybor = (scenariusz === 'djump' && hasDjump()) ? 'magnes' : scenariusz;
  const roll = wybor === 'djump' ? 0.0 : wybor === 'monety' ? 0.3
             : wybor === 'kosci' ? 0.7 : wybor === 'magnes' ? 0.99 : Math.random();
  if (roll < 0.14 && !hasDjump()) {   // 🦘🦘 PODWÓJNY SKOK (na ten bieg)
    P.runDjump = true;
    toastBuff('PODWÓJNY SKOK do końca biegu!');
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2500);
  } else if (roll < 0.62) {          // monety
    for (let k = 0; k < 8 + Math.floor(Math.random() * 8); k++)
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
    pchnijOverlay(P.weapons.length < 3 ? openNewWeapon : openSwap);
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

// ============================== GARNEK NONNY (dawne totemy) ==============================
// Kamienna kolumna fantasy nie miała nic wspólnego z warzywami walczącymi z mafią
// przekąsek. Mechanika została ta sama (dotknij → losowy buff → cooldown), zmienił
// się kostium: na Łąkach BULGOCZĄCY GARNEK, w markecie WITRYNA CHŁODNICZA.
// Nazwa tablicy `totems` zostaje — wisi na niej debug `window.HORDA` i scenariusze testera.
const totems = [];        // {mesh, ring, pos, cd, mat}

// ---- pomocnik pixel artu: prostokąty + darmowy kontur (warstwa o piksel większa pod spodem) ----
function pixTex(W, H, bryly, kontur = '#1b1b22') {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (kontur) { g.fillStyle = kontur; for (const [x, y, w, h] of bryly) g.fillRect(x - 1, y - 1, w + 2, h + 2); }
  for (const [x, y, w, h, kol] of bryly) { g.fillStyle = kol; g.fillRect(x, y, w, h); }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Sprite garnka od właściciela (biały garnek w czerwone kropki, para, ogień pod spodem).
// `garnekTexture()` niżej zostaje jako awaryjny — ten sam wzorzec co salata/karabin.
let garnekImgMat = null;
async function ladujGarnek() {
  try { garnekImgMat = (await flatMat('assets/garnek_nonny.png')).mat; }
  catch { garnekImgMat = null; }
}
function garnekTexture() {
  const b = [];
  const r = (x, y, w, h, kol) => b.push([x, y, w, h, kol]);
  r(9, 1, 3, 3, '#e4ecf5'); r(15, 0, 4, 3, '#d3dee9'); r(12, 4, 2, 2, '#e4ecf5');   // para
  r(18, 4, 2, 2, '#d3dee9');
  r(4, 8, 22, 3, '#6b727d');                                                        // rant
  r(6, 10, 18, 2, '#8ec44f');                                                       // zawartość
  r(9, 9, 4, 2, '#b6e26a'); r(16, 9, 3, 2, '#b6e26a');                              // bąble
  for (let i = 0; i < 11; i++)                                                      // brzuch (schodki)
    r(5 + Math.floor(i * 0.32), 11 + i, 20 - Math.floor(i * 0.64), 1, i % 4 === 3 ? '#4a4f58' : '#3b4048');
  r(1, 11, 3, 3, '#6b727d'); r(26, 11, 3, 3, '#6b727d');                            // uchwyty
  r(9, 22, 12, 3, '#ff8a2a'); r(12, 24, 7, 2, '#ffd75e');                           // ogień pod garnkiem
  return pixTex(30, 27, b);
}
function witrynaTexture() {
  const b = [];
  const r = (x, y, w, h, kol) => b.push([x, y, w, h, kol]);
  r(2, 2, 24, 26, '#c8ced6');                          // obudowa
  r(4, 4, 20, 21, '#69a8c9');                          // szyba
  r(5, 5, 4, 19, '#8fc6de');                           // refleks
  r(4, 11, 20, 2, '#aeb6c0'); r(4, 18, 20, 2, '#aeb6c0');   // półki
  r(6, 7, 4, 4, '#e05a5a'); r(12, 7, 3, 4, '#f2c14a'); r(18, 8, 4, 3, '#8ec44f');
  r(6, 14, 3, 4, '#f0efe6'); r(11, 14, 5, 4, '#d98f3c'); r(19, 15, 3, 3, '#b06bd6');
  r(7, 21, 5, 3, '#7ab648'); r(15, 21, 6, 3, '#e0873c');
  r(2, 27, 24, 4, '#8f97a1');                          // podstawa
  r(9, 28, 10, 2, '#6b727d');
  return pixTex(28, 32, b);
}
// Buffy: waga = jak często wypada. Nietykalność i mrożonki są RZADSZE, bo zdejmują
// napięcie — a w survivors-like napięcie JEST rozgrywką. 6 s zamiast 10 z tego samego
// powodu: ma być momentem, nie przerwą w grze.
const BUFFS = [
  { key: 'dmg',  ico: 'plomien', label: 'PODWÓJNE OBRAŻENIA',    dur: 18,  waga: 1.0 },
  { key: 'szyb', ico: 'but',     label: 'PRZYSPIESZENIE',        dur: 18,  waga: 1.0 },
  { key: 'slow', ico: 'zegar',   label: 'WROGOWIE ZWOLNILI',     dur: 14,  waga: 1.0 },
  { key: 'kasa', ico: 'moneta',  label: 'PODWÓJNE MONETY',       dur: 20,  waga: 0.9 },
  { key: 'niet', ico: 'tarcza',  label: 'NIETYKALNOŚĆ!',         dur: 6,   waga: 0.5 },
  { key: 'mroz', ico: 'wiatr',   label: 'MROŻONKI — HORDA STOI', dur: 3.5, waga: 0.6 },
];
const BUFF_WAG = BUFFS.reduce((a, b) => a + b.waga, 0);
function losujBuff() {
  let r = Math.random() * BUFF_WAG;
  for (const b of BUFFS) if ((r -= b.waga) <= 0) return b;
  return BUFFS[0];
}
let garnekTex = null, witrynaTex = null;
// wygląd zależy od mapy — garnki powstają raz przy boocie, więc teksturę podmieniamy w setMap
function ustawWygladGarnkow(key) {
  if (!garnekTex) { garnekTex = garnekTexture(); witrynaTex = witrynaTexture(); }
  const indoor = MAPS[key] && MAPS[key].indoor;
  // na Łąkach sprite właściciela, jeśli się wczytał; w markecie proceduralna witryna
  const tex = indoor ? witrynaTex : ((garnekImgMat && garnekImgMat.map) || garnekTex);
  const obr = tex.image.width / tex.image.height;
  for (const t of totems) {
    t.mat.map = tex;
    t.mat.needsUpdate = true;
    t.mesh.scale.set(2.2 * obr, 2.2, 1);
  }
}
function spawnTotems(n) {
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,196,90,0.95)'; g.lineWidth = 6;      // ciepły pierścień pod garnkiem
    g.beginPath(); g.arc(32, 32, 24, 0, 7); g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  if (!garnekTex) { garnekTex = garnekTexture(); witrynaTex = witrynaTexture(); }
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: garnekTex, transparent: true,
      alphaTest: 0.4, side: THREE.DoubleSide });
    const m = new THREE.Mesh(unitGeo, mat);
    m.scale.set(2.2 * (garnekTex.image.width / garnekTex.image.height), 2.2, 1);
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
// `ikona` = nazwa z icons.js; bez niej zostaje czysty tekst (ZERO emoji w grze)
function toastBuff(txt, ikona) {
  const el = document.getElementById('buff');
  if (ikona) el.innerHTML = ico(ikona, 14) + ' ' + txt;
  else el.textContent = txt;
  el.style.opacity = 1;
}

// ============================== TRYB KARABINU (PIERWSZA OSOBA) ==============================
// Nagroda ze skrzyni: kamera zjeżdża do wysokości głowy, karabin strzela SAM,
// a gracz normalnie biega. Sprite'y są 8-kierunkowymi billboardami à la Doom,
// czyli z bliska i z pierwszej osoby wyglądają poprawnie — dlatego ten tryb
// wizualnie nie wymaga niczego nowego poza widokiem broni.
//
// TRZY ŻYCIA to licznik trafień W TRYBIE, nie serca: cios odbiera życie i
// ROZRZUCA hordę, ale nie tyka HP. Bez tego gracz ginąłby w nagrodzie, bo
// z wysokości głowy nie widzi, co go otacza.
const KARABIN_BAZA = 20;                  // sekundy; sklep dokłada +5 s za poziom
const KARABIN_GAP = 0.075;                // ~13 strzałów/s
const KARABIN_DMG = 30;                   // × dmgAll() — ma być mocniejszy od wszystkiego
const KARABIN_V = 46;                     // j./s — dość wolno, żeby WIDZIEĆ ziarna w locie
const KARABIN_ZYCIE = 1.5;                // s lotu → zasięg ~69 j.
const KARABIN_R = 0.8;                    // promień trafienia ziarna
const KARABIN_ROZRZUT = 0.014;            // rad — broń nie jest laserem, ale celowanie DECYDUJE
const KARABIN_PRZEBICIE = 2;              // ilu wrogów przebija jedno ziarno
const KARABIN_ODEPCHNIJ = 14;             // na tyle odlatuje horda przy utracie życia
const karabinCzas = () => KARABIN_BAZA + 5 * (META.up.karabin || 0);
// ZIARNO KUKURYDZY jako pocisk — magazynek na sprite'cie to słoik kukurydzy,
// więc i amunicja musi być kukurydzą. Jasny rdzeń + kontur, żeby było widać na trawie.
let karabinPocMat = null;
function karabinPocTexture() {
  const b = [];
  const r = (x, y, w, h, kol) => b.push([x, y, w, h, kol]);
  r(3, 1, 6, 2, '#ffe9a3'); r(2, 3, 8, 5, '#ffc93c');
  r(3, 8, 6, 3, '#e8a521'); r(4, 4, 3, 3, '#fffdf0');
  return pixTex(12, 13, b);
}

// ---- widok broni: pixel art rysowany rectami, kontur z „grubszej" warstwy pod spodem ----
function gunTexture() {
  const W = 46, H = 30;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const M1 = '#3b4048', M2 = '#5a616c', D1 = '#7a4a22', D2 = '#9c6533', Z = '#ffd75e';
  const bryly = [];
  const r = (x, y, w, h, kol) => bryly.push([x, y, w, h, kol]);
  // LUFA: skos rysowany SCHODKAMI — tak wygląda przekątna w pixel-arcie,
  // rotacja canvasu dałaby antyaliasing i rozmyte piksele.
  for (let i = 0; i < 20; i++) r(2 + i, 4 + Math.floor(i * 0.42), 2, 4, i % 3 ? M1 : M2);
  r(0, 3, 4, 6, M2);                                   // tłumik / osłona wylotu
  r(8, 3, 2, 3, M2);                                   // muszka
  r(21, 8, 11, 3, M1);                                 // szyna górna
  r(20, 11, 15, 8, M1);                                // komora zamkowa
  r(30, 13, 3, 2, Z);                                  // rączka zamka (złoty detal)
  r(23, 18, 6, 10, M2);                                // magazynek
  r(24, 19, 4, 2, Z);
  for (let i = 0; i < 9; i++) r(32 + Math.floor(i * 0.45), 17 + i, 5, 1, i % 2 ? D1 : D2);  // chwyt
  r(36, 12, 9, 7, D2);                                 // kolba
  r(38, 13, 6, 4, D1);
  // dwie warstwy: najpierw wszystko o piksel większe w czerni = darmowy kontur
  g.fillStyle = '#1b1b22';
  for (const [x, y, w, h] of bryly) g.fillRect(x - 1, y - 1, w + 2, h + 2);
  for (const [x, y, w, h, kol] of bryly) { g.fillStyle = kol; g.fillRect(x, y, w, h); }
  return c.toDataURL();
}
function gunFlashTexture() {
  const S = 24;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const r = (x, y, w, h, kol) => { g.fillStyle = kol; g.fillRect(x, y, w, h); };
  r(4, 10, 16, 4, '#ffb43c'); r(10, 4, 4, 16, '#ffb43c');       // krzyż
  r(7, 7, 10, 10, '#ffdd7a');                                    // rdzeń
  r(9, 9, 6, 6, '#fffbe8');
  r(1, 11, 3, 2, '#ffdd7a'); r(20, 11, 3, 2, '#ffdd7a');
  r(11, 1, 2, 3, '#ffdd7a'); r(11, 20, 2, 3, '#ffdd7a');
  return c.toDataURL();
}
function crossTexture() {
  const S = 13;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const r = (x, y, w, h, kol) => { g.fillStyle = kol; g.fillRect(x, y, w, h); };
  for (const [x, y, w, h] of [[0, 6, 4, 1], [9, 6, 4, 1], [6, 0, 1, 4], [6, 9, 1, 4], [6, 6, 1, 1]]) {
    r(x - 1, y - 1, w + 2, h + 2, '#1b1b22');
    r(x, y, w, h, '#ffd75e');
  }
  return c.toDataURL();
}
// Sprite od właściciela: karabin ze SŁOIKIEM KUKURYDZY jako magazynkiem.
// `gunTexture()` zostaje jako awaryjna zaślepka, gdyby pliku zabrakło —
// ten sam wzorzec co `salata_czasza.png` / `lettuceTexture()`.
const KARABIN_PNG = 'assets/karabin_fpp.png';
function initKarabin() {
  const el = document.getElementById('gunPix');
  const img = new Image();
  img.onload = () => { el.style.backgroundImage = `url(${KARABIN_PNG})`; };
  img.onerror = () => { el.style.backgroundImage = `url(${gunTexture()})`; };
  img.src = KARABIN_PNG;
  document.getElementById('gunFlash').style.backgroundImage = `url(${gunFlashTexture()})`;
  document.getElementById('fpsCross').style.backgroundImage = `url(${crossTexture()})`;
}
function fpsBlysk(moc) {
  const el = document.getElementById('fpsFlash');
  el.style.opacity = moc;
  setTimeout(() => { el.style.opacity = 0; }, 90);
}
// ZNALEZIENIE karabinu ≠ odpalenie go. Power-up ląduje „w kieszeni", a przycisk
// (dotyk) / klawisz R (PC) / X na padzie odpala go, gdy gracz uzna, że jest moment.
const KARABIN_KLAWISZ = 'KeyR';
function dajKarabin() {
  P.karabinMa = true;
  odswiezKarabinBtn();
  AUDIO.sfx('zlota');
  G.shake = Math.max(G.shake, 0.3);
  // krotko: pelne zdanie mialo 382 px przy ekranie 375 px i wychodzilo za oba brzegi
  toastBuff('KARABIN! Wciśnij R, gdy będzie gęsto', 'celownik');
  setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 4200);
}
function odswiezKarabinBtn() {
  const el = document.getElementById('karabinBtn');
  if (!el) return;
  el.classList.toggle('on', !!P.karabinMa && G.running && !G.paused && !G.fps.on && !G.dying);
  const im = el.querySelector('.kimg');
  if (im && !im.style.backgroundImage) im.style.backgroundImage = `url(${icon('celownik', 5)})`;
}
function startKarabin() {
  const F = G.fps;
  if (F.on) { F.t = Math.min(F.max, F.t + 8); toastBuff('KARABIN DOŁADOWANY'); return; }
  if (!P.karabinMa) return;                          // nie ma czego odpalać
  P.karabinMa = false;
  odswiezKarabinBtn();
  F.on = true;
  F.max = karabinCzas(); F.t = F.max; F.zycia = 3;
  F.fireT = 0; F.pitch = 0; F.wejscie = 0.5; F.wyjscie = 0;
  playerBB.mesh.visible = false;                     // pierwsza osoba = własnego ciała nie widać
  playerBB.shadow.visible = false;
  if (hitFlash) hitFlash.visible = false;
  document.getElementById('fpsView').classList.add('on');
  przeliczWylot();                                   // #gunFlash ma już layout — teraz da się go zmierzyć
  fpsBlysk(0.9);
  G.shake = Math.max(G.shake, 0.45);
  AUDIO.sfx('zlota');
  toastBuff('KARABIN NONNY — ' + Math.round(F.max) + ' SEKUND RZEŹNI!');
}
function endKarabin(powod) {
  const F = G.fps;
  if (!F.on) return;
  F.on = false;
  F.wyjscie = 0.55;                                  // kamera wraca płynnie, nie skokiem
  playerBB.mesh.visible = true;
  playerBB.shadow.visible = true;
  document.getElementById('fpsView').classList.remove('on');
  document.getElementById('gunFlash').style.opacity = 0;
  odswiezKarabinBtn();
  AUDIO.sfx('zagrozenie');
  toastBuff(powod === 'zycia' ? 'KARABIN WYBITY Z RĄK!' : 'MAGAZYNEK PUSTY');
  setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2000);
}
// JEDNA BRAMKA na wszystkie trafienia gracza (kontakt, kamikaze, spadający regał).
// Zwraca true = cios pochłonięty, wywołujący NIE odejmuje HP.
function ciosPochloniety() {
  if (G.buff.key === 'niet') {                       // NIETYKALNOŚĆ z garnka
    P.iframes = 0.35;                                // przerwa, żeby dźwięk nie zamienił się w kakofonię
    AUDIO.sfx('tarcza');
    spark(P.pos.x, P.y + 1.2, P.pos.z);
    return true;
  }
  return karabinZjadlCios();
}
// cios w trybie karabinu: zabiera ŻYCIE TRYBU (nie serce) i rozrzuca hordę.
// Zwraca true, jeśli tryb zjadł trafienie — wtedy wywołujący NIE odejmuje HP.
function karabinZjadlCios() {
  const F = G.fps;
  if (!F.on) return false;
  F.zycia--;
  P.iframes = 1.0;                                   // sekunda oddechu, żeby nie stracić dwóch żyć naraz
  AUDIO.sfx('hurt');
  AUDIO.sfx('wybuch');
  G.shake = Math.max(G.shake, 0.55);
  fpsBlysk(0.55);
  novaRing(P.pos.x, P.pos.z, KARABIN_ODEPCHNIJ * 0.5);
  // FALA ODEPCHNIĘCIA: wszyscy w promieniu lądują co najmniej KARABIN_ODEPCHNIJ od gracza.
  // Ustawiamy pozycję WPROST (nie przez `kb`), bo Gummini mają `bezKb` i zostałyby na miejscu.
  for (const e of G.enemies) {
    if (e.dying) continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > KARABIN_ODEPCHNIJ) continue;
    const inv = 1 / Math.max(d, 0.001);
    e.pos.x = P.pos.x + dx * inv * KARABIN_ODEPCHNIJ;
    e.pos.z = P.pos.z + dz * inv * KARABIN_ODEPCHNIJ;
    e.stun = Math.max(e.stun || 0, 0.35);
  }
  const v = document.getElementById('vign');
  v.style.opacity = 1; setTimeout(() => v.style.opacity = 0, 200);
  if (F.zycia <= 0) endKarabin('zycia');
  return true;
}
// ---- gdzie na EKRANIE jest wylot lufy (żeby ziarna wylatywały Z LUFY, nie ze środka) ----
// #gunFlash siedzi dokładnie na wylocie sprite'a, więc bierzemy jego środek i
// przeliczamy na współrzędne znormalizowane kamery. Liczone raz (na wejściu w tryb
// i przy zmianie rozmiaru okna) — `getBoundingClientRect` co strzał wymuszałby
// przeliczanie stylów 13 razy na sekundę.
const _wylotNdc = new THREE.Vector2(0.42, -0.45);
function przeliczWylot() {
  const r = document.getElementById('gunFlash').getBoundingClientRect();
  if (!r.width) return;
  _wylotNdc.set((r.left + r.width / 2) / innerWidth * 2 - 1,
                -((r.top + r.height / 2) / innerHeight * 2 - 1));
}
const _pocOrig = new THREE.Vector3(), _pocCel = new THREE.Vector3();

// ŻADNEGO AUTO-AIM: ziarno startuje Z WYLOTU LUFY i leci w punkt, na który patrzy
// CELOWNIK — tor zbiega się ze środkiem ekranu, dokładnie jak w normalnym FPS-ie.
// Celowanie ma decydować, inaczej pierwsza osoba jest tylko kostiumem.
function karabinStrzal() {
  const F = G.fps;
  // lekki rozrzut: broń nie jest laserem, ale to nadal Ty decydujesz, gdzie pada seria
  const yaw = camYaw + (Math.random() - 0.5) * KARABIN_ROZRZUT * 2;
  const pit = F.pitch + (Math.random() - 0.5) * KARABIN_ROZRZUT * 2;
  // START: punkt na promieniu przez wylot lufy, 1.9 j. od oka
  _pocOrig.set(_wylotNdc.x, _wylotNdc.y, 0.5).unproject(camera)
    .sub(camera.position).normalize().multiplyScalar(1.9).add(camera.position);
  // CEL: 55 j. wprost w celownik — stąd zbieżność toru ze środkiem ekranu
  _pocCel.set(-Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit))
    .multiplyScalar(55).add(camera.position);
  const dir = _pocCel.clone().sub(_pocOrig).normalize();
  const m = new THREE.Mesh(unitGeo, karabinPocMat);
  m.scale.set(0.17, 0.24, 1);                        // ziarno lekko wydłużone = czyta się jako lot
  m.position.copy(_pocOrig);
  scene.add(m);
  G.karabinPoc.push({ mesh: m, dir, t: 0, pierce: KARABIN_PRZEBICIE, hit: new Set() });

  const gf = document.getElementById('gunFlash');
  gf.style.opacity = 1;
  setTimeout(() => { gf.style.opacity = 0; }, 45);
  F.kick = 1;                                        // odrzut broni na ekranie
  G.shake = Math.max(G.shake, 0.07);
  AUDIO.sfx('strzal');                               // throttle w audio.js pilnuje kakofonii
}
// lot ziaren + trafienia. Przy 46 j./s i dt 1/60 ziarno robi 0.77 j. na klatkę,
// a promień trafienia to 0.8 — więc nie przelatuje przez wrogów i nie trzeba podkroków.
function updateKarabinPoc(dt) {
  for (let i = G.karabinPoc.length - 1; i >= 0; i--) {
    const s = G.karabinPoc[i];
    s.t += dt;
    s.mesh.position.addScaledVector(s.dir, KARABIN_V * dt);
    s.mesh.quaternion.copy(camera.quaternion);       // ziarno zawsze twarzą do kamery
    const px = s.mesh.position.x, py = s.mesh.position.y, pz = s.mesh.position.z;
    let dead = s.t > KARABIN_ZYCIE || py < terrainH(px, pz) - 0.2;
    if (!dead) for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying || s.hit.has(e)) continue;
      const rr = KARABIN_R + (e.T.boss ? 0.9 : 0);
      const dx = px - e.pos.x, dz = pz - e.pos.z, dy = py - (e.ty + 0.8);
      if (dx * dx + dz * dz + dy * dy > rr * rr) continue;
      let dmg = KARABIN_DMG * dmgAll();
      const crit = Math.random() < critC();
      if (crit) dmg *= 3;
      e.hp -= dmg; s.hit.add(e);
      if (!e.T.bezKb) e.kb.copy(s.dir).setY(0).multiplyScalar(crit ? 1.6 : 1.0);
      spark(e.pos.x, e.ty + 1.2, e.pos.z);
      dmgPop(e.pos.x, e.ty, e.pos.z, dmgNum(dmg), crit ? '#ff9d3f' : '#fff3b0', crit ? 1.5 : 1);
      AUDIO.sfx(crit ? 'kryt' : 'traf');
      if (e.hp <= 0) killEnemy(e);
      if (s.pierce-- <= 0) { dead = true; break; }
    }
    if (dead) { scene.remove(s.mesh); G.karabinPoc.splice(i, 1); }
  }
}
function updateKarabin(dt) {
  const F = G.fps;
  if (F.wyjscie > 0) F.wyjscie = Math.max(0, F.wyjscie - dt);
  if (!F.on) return;
  if (F.wejscie > 0) F.wejscie = Math.max(0, F.wejscie - dt);
  F.t -= dt;
  const hud = document.getElementById('fpsHud');
  hud.querySelector('.fpsT').textContent = Math.max(0, Math.ceil(F.t));
  const lw = hud.querySelector('.fpsL');
  if (lw.childElementCount !== 3) lw.innerHTML = '<i></i><i></i><i></i>';
  for (let i = 0; i < 3; i++) lw.children[i].className = i < F.zycia ? '' : 'off';
  // OGIEŃ CIĄGŁY. Domknięcie licznikiem, bo przy hitstopie albo długiej klatce
  // `while` bez hamulca wyplułby kilkadziesiąt strzałów w jednej klatce.
  F.fireT -= dt;
  for (let n = 0; F.fireT <= 0 && n < 4; n++) { F.fireT += KARABIN_GAP; karabinStrzal(); }
  // ODRZUT + KOŁYSANIE W MARSZU — dwie linie, a to one sprzedają „trzymam broń".
  // Transform ustawiamy na #gunWrap, żeby błysk wylotowy jechał razem z lufą.
  F.kick = Math.max(0, F.kick - dt * 9);
  const bieg = Math.hypot(P.vx, P.vz) > 0.6 ? 1 : 0;
  const bx = Math.sin(G.time * 8.5) * 7 * bieg, by = Math.abs(Math.cos(G.time * 8.5)) * 6 * bieg;
  document.getElementById('gunWrap').style.transform =
    `translate(${bx + F.kick * 9}px, ${by + F.kick * 24}px) rotate(${F.kick * 2.6}deg)`;
  if (F.t <= 0) endKarabin('czas');
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
  // Regały kładą tylko DUŻE fale. Zmierzone: bez tego gate'a Kule Meteoryczne
  // (nova r=1.8 na KAŻDE trafienie pocisku, czyli co pół sekundy) czyściły całą
  // arenę do zera w 100 s — a to nie jest decyzja gracza, tylko efekt uboczny.
  // Zostaje Tupnięcie (3.7+) i kura od 2. poziomu; odpadają meteor, butelka, Sodino.
  if (r >= 3.0) przewrocRegaly(x, z, r + 1.2);
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
const RESTOCK_T = 22;                            // po tylu sekundach regał wstaje (poza kadrem)
let restockT = 0;
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
// RESTOCK: obsługa sklepu stawia regał z powrotem. Bez tego arena, w której
// gracz stoi, zostaje płaska tak długo, jak długo w niej stoi — czyli późna gra
// w markecie jest ŁATWIEJSZA niż wczesna, odwrotnie niż powinno być.
// Stawiamy tylko POZA KADREM (>22 j.), żeby regał nie wyrósł graczowi w twarz.
function updateRestock(dt) {
  restockT -= dt;
  if (restockT > 0) return;
  restockT = 0.5;                                // pełny przegląd 2× na sekundę, nie co klatkę
  for (const [, ch] of chunkMap) {
    if (!ch.shelves) continue;
    for (const s of ch.shelves) {
      if (s.stan !== 'lezy') continue;
      s.tLezy = (s.tLezy || 0) + 0.5;
      if (s.tLezy < RESTOCK_T) continue;
      if (Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < 22) continue;
      s.stan = 'stoi'; s.t = 0; s.zadal = false; s.tLezy = 0;
      ustawRegal(s, 0);                              // wraca pionowo, górne półki widoczne
      s.solid.z = s.z; s.solid.hl = 1.1; s.solid.hw = s.len / 2;
      s.solid.top = s.g0 + SHELF_H + 0.16;
    }
  }
}
function updatePadajace(dt) {
  for (let i = G.padajace.length - 1; i >= 0; i--) {
    const s = G.padajace[i];
    if (!s.inst || !s.inst.korpus.parent) { G.padajace.splice(i, 1); continue; }  // chunk zniknął
    s.t += dt;
    if (s.t < 0) continue;                                        // czeka na swoją kolej (domino)
    const k = Math.min(1, s.t / PAD_T);
    const kat = (Math.PI / 2) * k * k;                            // przyspiesza jak pod grawitacją
    ustawRegal(s, kat);                                           // obrót zapisany w macierzy instancji
    // ŻADNEGO PODNOSZENIA GRUPY. Pivot siedzi na KRAWĘDZI podstawy, a dzieci są
    // odsunięte o -kier*0.8, więc korpus leży w lokalnym Z od -1.6 do 0 i po
    // obrocie ląduje w Y od 0 do 1.6 — cały NAD posadzką. Wcześniejsze
    // podnoszenie o 0.45 sprawiało, że wrak lewitował, a gracz stał 0.8 j.
    // pod płaszczyzną desek (wystawały mu tylko liście).
    if (!s.zadal && k > 0.55) {                                   // moment uderzenia w podłogę
      s.zadal = true;
      // Obrażenia PRZYCZEPIONE DO CZASU BIEGU, nie do buildu. Zmierzone: przy
      // `6*dmgAll()+4` regał dawał stale 12-20 obrażeń, a HP szeregowego rośnie
      // 4.8 → 15.8 → 37.5 (1/5/10 min), więc od 4. minuty przestawał kogokolwiek
      // zabijać — dokładnie wtedy, gdy market jest najbardziej zapchany.
      // Regał to element mapy, a nie broń: jego siła nie ma zależeć od tego,
      // jaką broń ma gracz. 8 × hpScale() = zawsze 2.7 szeregowego, nigdy elita.
      const dmg = 8 * hpScale();
      let przygnieceni = 0;
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        if (Math.abs(e.pos.x - s.x) > s.len / 2 + 0.7) continue;
        const wzdluz = (e.pos.z - s.pivotZ) * s.kier;             // leży od pivotu w stronę upadku
        if (wzdluz < -0.7 || wzdluz > SHELF_H + 0.7) continue;
        e.hp -= dmg;
        e.kb.set(0, 0, s.kier * 3);
        dmgPop(e.pos.x, e.ty + 0.6, e.pos.z, dmgNum(dmg), '#ffd75e', 1.5);
        przygnieceni++;
        if (e.hp <= 0) killEnemy(e, j);
      }
      // NAGRODA za dobre ustawienie regału — bez niej przewrócenie nie dawało
      // graczowi nic mierzalnego poza hałasem
      if (przygnieceni >= 3) {
        dmgPop(s.x, s.g0 + 2.2, s.pivotZ, 'ROZWALKA x' + przygnieceni, '#ffd75e', 2.2);
        G.coins.push(makeCoin(s.x, s.pivotZ + s.kier * 1.2, 3));
        G.hitstop = Math.max(G.hitstop, 0.06);
      }
      // gracz też dostanie, jeśli stoi w linii upadku — regały nie wybierają
      if (Math.abs(P.pos.x - s.x) < s.len / 2 + 0.6 && P.iframes <= 0 && !P.airborne) {
        const wzdluz = (P.pos.z - s.pivotZ) * s.kier;
        if (wzdluz > -0.6 && wzdluz < SHELF_H + 0.6 && !ciosPochloniety()) {
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
      s.tLezy = 0;
      // Dwie półki po obrocie STAJĄ PIONOWO i wystają na 2.15 j. — leżący regał
      // wyglądał przez to jak drabina, a nie jak wrak. Chowamy je; zostaje korpus
      // (płaszczyzna 1.6) i blat, który robi się ładnym progiem na końcu.
      ustawRegal(s, Math.PI / 2);                    // `stan` już 'lezy' → górne półki znikają
      // Bryła kolizji z pionowej ściany (top 2.46) robi się RUMOWISKIEM, na które
      // wskoczysz jednym skokiem. Szczyt MUSI zgadzać się z płaszczyzną korpusu
      // (1.6), inaczej stoi się w powietrzu albo po pas w deskach. 1.55 = ledwo
      // pod deskami, a apeks skoku (1.461) + tolerancja 0.25 nadal łapie wejście.
      s.solid.z = s.pivotZ + s.kier * 1.23;
      s.solid.hl = 1.23;
      s.solid.hw = s.len / 2 + 0.15;
      s.solid.top = s.g0 + 1.55;
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
const _camCel = new THREE.Vector3();               // cel kamery — trwały, żeby nie alokować co klatkę

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
  // KETCHUP trzyma za nogi (biblia: slow 40%); w powietrzu nie działa, jak woda
  if (!P.airborne && G.kaluze.length && wKetchupie(P.pos.x, P.pos.z)) spd *= KETCH_SLOW;
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
  updateTrample(dt);                     // pole nacisku dla uginania trawy pod hordą
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
      // Fala z LADOWANIA dzieli cooldown z bronia — bez tego skakanie w kolko
      // dawalo fale co 0.75 s zamiast co 3.2 s, czyli 791 DPS (3x wiecej niz
      // druga najlepsza bron w grze).
      // Bezpiecznik skaluje się TERAZ RAZEM Z TEMPEM: po wpięciu `fireMul()` do
      // cooldownu broni sztywne 1.2 s hamowałoby dokładnie to, co Tempo przyspiesza.
      const wT = hasWeapon('tupniecie');
      const prog = 1.2 / fireMul();
      if (stompLvl() > 0 && (!wT || wT.t < prog)) {
        nova(P.pos.x, P.pos.z, stompRad(stompLvl()), stompDmg(stompLvl()));
        if (wT) wT.t = Math.max(wT.t, prog);
      }
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
  playerBB.mesh.visible = !G.fps.on;               // w pierwszej osobie własnego ciała nie widać
  playerBB.update(dt, P.pos, P.y, ground);
  updateHitFlash();
  updateLettuce(dt);
  updateKarabin(dt);
  // ziarna lecą dalej NIEZALEŻNIE od trybu — wystrzelone w ostatniej sekundzie
  // muszą dolecieć, a nie zniknąć w powietrzu
  if (G.karabinPoc.length) updateKarabinPoc(dt);
  updateBossHp();
  if (G.gluty.length) updateGluty(dt);
  if (G.kaluze.length) updateKaluze(dt);

  // ---- spawner: krzywa trudności (1 min ~lekko, 4 min = ~4× więcej naraz) ----
  const min = G.time / 60;
  G.spawnT -= dt;
  const interval = Math.max(0.11, 1.3 / (1 + min * 0.55) / (1 + 0.08 * klatwa()));   // 1.3 s → 0.28 s w 4. min
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
    // Ketchupino wchodzi RZADKO i pojedynczo (elita wg biblii), nie do zwykłej puli
    if (G.time > 180 && Math.random() < 0.035) spawnEnemy('ketchupino');
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
    wejscieBossa();
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
    // SOKOWIRÓWKA ZWABIA: jeśli stoi bliżej niż 9.5 j., wróg idzie po NIĄ, nie po
    // gracza. To zamienia wieżyczkę w prawdziwą przynętę — stawiasz ją w alejce
    // i horda skręca, zamiast gonić Ciebie. Obrażenia kontaktowe gracza liczą się
    // dalej od DYSTANSU DO GRACZA, więc przynęta nie daje nietykalności.
    // Gracz jest WAZNIEJSZYM celem: wiezyczka przejmuje wroga tylko wtedy, gdy
    // jest wyraznie blizej (dystans do niej x 1.7 musi byc mniejszy niz do gracza).
    // Dzieki temu przynęta odciaga hordę w alejce, ale nie robi z gracza widza.
    let celPos = P.pos;
    if (G.turrets.length) {
      const dGracz = e.pos.distanceTo(P.pos);
      let najl = SOKO_WABI;
      for (const t of G.turrets) {
        const dt2 = t.pos.distanceTo(e.pos);
        if (dt2 < najl && dt2 * 1.7 < dGracz) { najl = dt2; celPos = t.pos; }
      }
    }
    const to = celPos.clone().sub(e.pos).setY(0);
    const dCel = to.length(); to.normalize();
    const d = e.pos.distanceTo(P.pos);              // do gracza — od tego zależą jego obrażenia
    let es = e.T.speed * (e.elite ? 0.85 : 1) * spdScale();
    if (e.stun > 0) { e.stun -= dt; es = 0; }        // ogluszenie z ewolucji "DZIS NIE WEJDZIESZ"
    if (e.ty < WATER_Y - 0.04) es *= 0.7;               // woda spowalnia też ich
    if (G.buff.key === 'slow') es *= 0.6;
    if (G.buff.key === 'mroz') es = 0;                  // MROŻONKI: horda staje na kilka sekund
    // wspinaczka na mesę = powolutku (chwila oddechu dla gracza na górce)
    const wspin = terrainH(e.pos.x + to.x * 0.7, e.pos.z + to.z * 0.7) - e.ty;
    if (wspin > 0.18) es *= 0.35;
    if (MAPS[mapKey].indoor && onSpill(e.pos.x, e.pos.z)) es *= 0.55;   // im też ślisko
    if (celPos !== P.pos && dCel < 1.1) es = 0;      // dotarł do przynęty — bije ją, nie przepycha
    // ARTYLERIA (Ketchupino): PIERWSZY WRÓG DYSTANSOWY. Nie szarżuje — trzyma się
    // w okienku [KETCH_BLISKO, KETCH_DALEKO]: za blisko cofa się, za daleko podchodzi,
    // w okienku STOI i pluje. Dzięki temu nie da się go „przeczekać" bieganiem
    // w kółko, ale też nie wchodzi w młynek broni przy graczu.
    if (e.T.artyleria) {
      if (d < KETCH_BLISKO) { e.pos.addScaledVector(to, -es * dt * 1.15); }   // odwrót
      else if (d <= KETCH_DALEKO) { /* stoi i celuje */ }
      else e.pos.addScaledVector(to, es * dt);
      // animacja ataku jest jednorazowa — po niej wracamy do biegu, inaczej butla
      // zastygłaby w pozie wyciskania na resztę biegu
      if (e.bb.anim === 'punch' && e.bb.done) e.bb.play(e.T.walk);
      e.plunCd = (e.plunCd || KETCH_CD * 0.6) - dt;
      if (e.plunCd <= 0 && d <= KETCH_DALEKO + 2 && !e.dying) {
        e.plunCd = KETCH_CD;
        plunKetchupem(e);
      }
    } else e.pos.addScaledVector(to, es * dt);
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
        if (e.pos.distanceTo(P.pos) < 2.6 && P.iframes <= 0 && P.y - e.ty < 1.2 && !ciosPochloniety()) {
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
    } else if (blockTop > e.ty + 0.1 && (P.y > e.ty + 0.6 || blockTop - e.ty < 1.7)) {
      // Przeszkoda: gracz wyżej ALBO przeszkoda niska (rumowisko po regale).
      // Zmierzone: bez drugiego warunku 20 wrogów przez 30 s ani razu nie przeszło
      // przez leżący regał i nie obeszło stojącego — stali wciśnięci w deskę,
      // bo silnik nie ma omijania przeszkód. Teraz przewrócony regał JEST przejściem
      // (dla nich mozolnym: 0.95 j./s wspinaczki), a nie ścianą na zawsze.
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
    if (d < 0.9 + (e.T.boss ? 0.8 : 0) && P.iframes <= 0 && P.y - e.ty < 1.0 && !ciosPochloniety()) {
      const tarczaLvl = P.passives.tarcza || 0;
      if (tarczaLvl > 0 && P.shieldCd <= 0) {           // 🛡️ tarcza zjada cios
        P.shieldCd = [30, 24, 18][tarczaLvl - 1];
        P.iframes = 0.9;
        AUDIO.sfx('tarcza');
        toastBuff('TARCZA zablokowała cios!');
        setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 1500);
        novaRing(P.pos.x, P.pos.z, 2);
      } else {
        P.hp -= e.T.dmg * dmgScale(); P.iframes = 0.9;      // boss tez bije mocniej z czasem
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
  odswiezStawBtn();                      // PO tickach — inaczej licznik ładunków jest o klatkę wstecz

  // ---- pociski kul ----
  const boomQ = [];                      // wybuchy meteorów PO pętli (bezpieczne indeksy)
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i];
    s.mesh.position.addScaledVector(s.dir, 16 * dt);
    // leci na wysokości wystrzału, płynnie schodząc do poziomu terenu
    const docel = terrainH(s.mesh.position.x, s.mesh.position.z) + 1.0;
    s.y += (docel - s.y) * Math.min(1, 3 * dt);
    s.mesh.position.y = s.y;
    // WIRUJACY POCISK (scyzoryk): rzucony noz musi sie obracac, inaczej sunie w powietrzu
    // jak naklejka. Ten sam idiom co butelka i bumerang — `rotation.set(0, camYaw, roll)`:
    // yaw ustawia billboard twarza do kamery, a roll to obrot w plaszczyznie ekranu.
    if (s.wiruje) {
      s.obrot = (s.obrot || 0) + dt * 17 * s.wiruje;
      s.mesh.rotation.set(0, camYaw, s.obrot);
    }
    s.life -= dt;
    let dead = s.life <= 0;
    if (!dead) for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying || s.hit.has(e)) continue;
      const rr = e.T.boss ? 1.4 : 0.75;
      const dx = s.mesh.position.x - e.pos.x, dz = s.mesh.position.z - e.pos.z;
      if (dx * dx + dz * dz < rr * rr) {
        let dmg = (s.dmg || 1) * dmgAll();
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
    if ((near && nd < 1.0) || K.t > (K.mini ? 1.1 : 4)) {  // BUM! (mini mają krótszy lont)
      const promien = (K.mini ? 1.5 : 2.5 + 0.3 * K.lvl);
      const sila = (K.mini ? 1.6 : 3 + 0.7 * K.lvl) * dmgAll();
      nova(K.pos.x, K.pos.z, promien, sila);
      dmgPop(K.pos.x, terrainH(K.pos.x, K.pos.z) + 0.6, K.pos.z,
             K.mini ? 'POP!' : 'POP-POP-BUM!', '#ffd75e', K.mini ? 1.0 : 1.6);
      okruchy(K.pos.x, terrainH(K.pos.x, K.pos.z) + 0.5, K.pos.z, 0xf6e27a, K.mini ? 3 : 7);
      G.shake = Math.max(G.shake, K.mini ? 0.08 : 0.2);
      // BOMBA KASETOWA: z wybuchu wylatuje 6 mniejszych ziaren w wachlarzu,
      // każde z własnym krótkim lontem — stąd druga fala popcornu
      if (P.evo.kaseta && !K.mini) {
        for (let n = 0; n < 6; n++) {
          const a = (n / 6) * Math.PI * 2 + Math.random() * 0.4;
          const bb2 = new Billboard('kernello_boomello', 0.62);
          bb2.play('run');
          G.kury.push({ bb: bb2, mini: true, lvl: K.lvl, t: 0,
                        pos: K.pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6)) });
        }
      }
      K.bb.dispose(); G.kury.splice(i, 1);
    }
  }

  // ---- pioruny (efekt wizualny) ----
  for (let i = G.bolts.length - 1; i >= 0; i--) {
    const b = G.bolts[i]; b.t += dt;
    b.mesh.material.opacity = Math.max(0, 1 - b.t * 6);
    // klon materialu = wlasny obiekt; bez dispose zostaje po nim smiec i rosnie
    // `usedTimes` programu (te same trzy pule co `pops`/`puffs`, tylko tam dispose byl)
    if (b.t > 0.18) { scene.remove(b.mesh); b.mesh.material.dispose(); G.bolts.splice(i, 1); }
  }

  // ---- iskry ----
  for (let i = G.sparks.length - 1; i >= 0; i--) {
    const s = G.sparks[i]; s.t += dt;
    s.mesh.scale.setScalar(1 + s.t * 6);
    s.mesh.material.opacity = Math.max(0, 1 - s.t * 5);
    if (s.t > 0.2) { scene.remove(s.mesh); s.mesh.material.dispose(); G.sparks.splice(i, 1); }
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
  if (MAPS[mapKey].indoor) updateRestock(dt);
  if (G.turrets.length) updateTurrets(dt);
  // SERIA SCYZORYKÓW: rzuty wychodzą jeden po drugim, więc słychać i widać „ta-ta-ta"
  for (let i = G.seria.length - 1; i >= 0; i--) {
    const r = G.seria[i];
    r.opoznienie -= dt;
    if (r.opoznienie > 0) continue;
    G.seria.splice(i, 1);
    const katy = P.evo.wachlarz ? [-0.22, 0, 0.22] : [0];
    for (const dk of katy) {
      const a = r.kat + dk;
      const m = new THREE.Mesh(unitGeo, scyzorykMat);
      m.scale.set(0.5 * scyzorykAspect, 0.5, 1);
      m.position.set(P.pos.x, P.y + 1.0, P.pos.z);
      scene.add(m);
      // kierunek wirowania zgodny z tym, w ktora strone EKRANU leci noz — inaczej
      // co drugi rzut wygladalby, jakby krecil sie w tyl. Rzut na os „prawo kamery".
      const sx = Math.sin(a) * Math.cos(camYaw) - Math.cos(a) * Math.sin(camYaw);
      G.shots.push({ mesh: m, dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
                     life: 1.2, pierce: 2 + r.lvl, hit: new Set(), y: P.y + 1.0,
                     dmg: 2.2 + 0.5 * r.lvl, wiruje: sx >= 0 ? -1 : 1 });
    }
    AUDIO.sfx('kryt');
  }
  if (plamy.length) updatePlamy(dt);

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
        const b = losujBuff();
        G.buff = { key: b.key, t: b.dur };
        AUDIO.sfx('totem');
        toastBuff(b.label, b.ico);
        t.cd = 45;
        novaRing(t.pos.x, t.pos.z, 4);
        // mrożonki i nietykalność to momenty — zasługują na wstrząs i błysk
        if (b.key === 'mroz' || b.key === 'niet') { G.shake = Math.max(G.shake, 0.35); fpsBlysk(0.4); }
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
    if (k >= 1) { scene.remove(r.mesh); r.mesh.material.dispose(); G.rings.splice(i, 1); }
  }

  // ---- dropy (kości XP + monety) ----
  const mag = G.vacuum > 0 ? 999 : magnetF();
  for (let i = G.gems.length - 1; i >= 0; i--) {
    const g = G.gems[i]; g.t += dt;
    const d = g.pos.distanceTo(P.pos);
    if (d < mag) g.pos.addScaledVector(P.pos.clone().sub(g.pos).normalize(), Math.max(14 - d, 8) * dt);
    g.mesh.position.set(g.pos.x, terrainH(g.pos.x, g.pos.z) + 0.25 + Math.sin(g.t * 4) * 0.12, g.pos.z);
    g.mesh.rotation.set(0, camYaw, g.t * 2);
    // porzucone dropy znikaja: mapa jest nieskonczona, wiec bez tego wszystko
    // zostawione za plecami zostaje na zawsze (zmierzone: 299 pigulek po 4:43)
    if (g.t > 45 && d > mag * 3) { scene.remove(g.mesh); G.gems.splice(i, 1); continue; }
    if (d < 0.7) {
      P.xp += g.val;
      AUDIO.sfx('xp');
      scene.remove(g.mesh); G.gems.splice(i, 1);
      // WHILE, nie IF: jedna pigulka moze dac wiecej niz jeden poziom, a przy
      // Wielkim Magnesie pigulki przychodza kiszkami po kilkanascie w jednej klatce.
      // Kazdy awans wchodzi do KOLEJKI, wiec zaden zestaw kart nie przepada.
      while (P.xp >= P.xpNeed) {
        P.xp -= P.xpNeed; P.lvl++;
        P.xpNeed = xpDoNast(P.lvl);
        document.getElementById('lvl').textContent = 'POZIOM ' + P.lvl;
        AUDIO.sfx('awans');
        AUDIO.event('awans');
        pchnijOverlay(showCards);
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
    if (c.t > 60 && d > mag * 3) { scene.remove(c.mesh); G.coins.splice(i, 1); continue; }
    if (d < 0.7) {
      G.runCoins += Math.round((c.val || 1) * monetyMul()); drawCoins();   // Klątwa płaci
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

  // ---- kamera: TRZECIA OSOBA (orbita) ⇄ PIERWSZA OSOBA (tryb karabinu) ----
  // `kf` (0 = za plecami, 1 = z oczu) animuje się przez ~0.5 s, więc zjazd do
  // pierwszej osoby i powrót są płynne bez osobnego kodu przejścia.
  const F = G.fps;
  const kf = F.on ? (F.wejscie > 0 ? 1 - F.wejscie / 0.5 : 1)
                  : (F.wyjscie > 0 ? F.wyjscie / 0.55 : 0);
  const cx = P.pos.x + Math.sin(camYaw) * CAM_DIST, cz = P.pos.z + Math.cos(camYaw) * CAM_DIST;
  const cy = Math.max(P.y + CAM_H, terrainH(cx, cz) + 2.2);
  _camCel.set(cx + (P.pos.x - cx) * kf, cy + (P.y + 1.62 - cy) * kf, cz + (P.pos.z - cz) * kf);
  // przy kf > 0 pozycja jest DOKŁADNIE celem: wygładza już samo `kf`, a dodatkowy
  // lerp zostawiał kamerę w połowie drogi na cały tryb.
  camera.position.lerp(_camCel, kf > 0 ? 1 : Math.min(1, dt * 8));
  if (G.shake > 0) {
    G.shake -= dt;
    camera.position.x += (Math.random() - .5) * G.shake * 0.7;
    camera.position.y += (Math.random() - .5) * G.shake * 0.7;
  }
  const patrzD = 2.2 + kf * 18;                    // w pierwszej osobie patrzymy w dal, nie na siebie
  camera.lookAt(P.pos.x + fx * patrzD, P.y + 1.3 + kf * (Math.tan(F.pitch) * patrzD + 0.32),
                P.pos.z + fz * patrzD);

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
  endKarabin('smierc');                              // inaczej kamera FPP walczy z kamerą śmierci
  G.dying = true; G.deathT = 0;
  odswiezKarabinBtn();
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

// Rozliczenie biegu w JEDNYM miejscu. Wcześniej monety dopisywał tylko
// `gameOver()`, więc wyjście do menu z pauzy po długim biegu kasowało cały
// zarobek — i to prawdopodobnie stąd brało się część odczucia „monet jest za mało".
function rozliczBieg() {
  G.zebrane = G.runCoins;                          // do pokazania na ekranie końca
  if (!G.runCoins) return;
  META.coins += G.runCoins;
  META.st.coins += G.runCoins;
  G.runCoins = 0;
  drawCoins();
}
// ============================== CEREMONIA KOŃCA BIEGU ==============================
// Ekran końca to moment, w którym gracz decyduje „jeszcze raz" albo zamyka grę.
// Sucha lista liczb tego nie sprzedaje — liczby muszą LECIEĆ W GÓRĘ z dźwiękiem.
function tickerLiczb(root) {
  const pola = [...root.querySelectorAll('i[data-licz]')];
  if (!pola.length) return;
  const T = 900;                                   // cała ceremonia poniżej sekundy
  const start = performance.now();
  let ostatniTik = 0, gotowe = false;
  // Ticker chodzi na rAF, a ten jest DŁAWIONY bez fokusa: bez tego domknięcia
  // gracz, który przełączy kartę w trakcie ceremonii, wróciłby do ekranu końca
  // z samymi zerami. Ustawiamy wartości docelowe na twardo po czasie animacji.
  const domknij = () => {
    if (gotowe) return;
    gotowe = true;
    for (const p of pola) {
      const czas = p.dataset.czas;
      p.textContent = czas ? fmtTime(+czas) : +p.dataset.licz;
    }
  };
  setTimeout(domknij, T + 400);
  const krok = (teraz) => {
    if (gotowe) return;
    const k = Math.min(1, (teraz - start) / T);
    const e = 1 - Math.pow(1 - k, 3);              // szybko rośnie, miękko wyhamowuje
    for (const p of pola) {
      const cel = +p.dataset.licz, czas = p.dataset.czas;
      p.textContent = czas ? fmtTime(+czas * e) : Math.round(cel * e);
    }
    if (teraz - ostatniTik > 55) { ostatniTik = teraz; AUDIO.sfx('xp'); }
    if (k < 1) requestAnimationFrame(krok);
    else { AUDIO.sfx('zlota'); domknij(); }
  };
  requestAnimationFrame(krok);
}
// deszcz pixelowych monet po rekordzie — czysta ozdoba, ale to ona sprzedaje rekord
function deszczMonet(ile) {
  const ov = document.getElementById('overOv');
  for (let i = 0; i < ile; i++) {
    const d = document.createElement('div');
    d.className = 'moneta-spada';
    d.innerHTML = ico('moneta', 18 + Math.round(Math.random() * 10));
    d.style.left = (Math.random() * 96) + 'vw';
    d.style.animationDelay = (Math.random() * 0.9).toFixed(2) + 's';
    d.style.animationDuration = (1.5 + Math.random() * 1.2).toFixed(2) + 's';
    ov.appendChild(d);
    setTimeout(() => d.remove(), 3200);
  }
}
function gameOver() {
  G.over = true; G.running = false;
  AUDIO.endRun();                                  // koniec biegu = powrót do motywu głównego
  document.getElementById('vign').style.opacity = 0;
  playerBB.mesh.rotation.z = 0;
  rozliczBieg();
  const s = META.st;
  // PIERWSZA PRZEGRANA MA COŚ DAWAĆ. Brotato odblokowuje za nią postać („Chunky"),
  // u nas nie ma jeszcze wolnego arkusza, więc idzie broń: pierwsza śmierć =
  // Piorun za darmo. Puste „KONIEC" po pierwszym biegu to najgorszy moment,
  // żeby gracz nie miał po co kliknąć „JESZCZE RAZ".
  let prezent = '';
  if (!s.runs && !META.unlocked.piorun) {
    META.unlocked.piorun = 1;
    prezent = `<br><b style="color:#7ee7ff">${ico('pioruny', 18)} PIERWSZA PORAŻKA — PIORUN ODBLOKOWANY NA STAŁE!</b>`;
  }
  s.runs++; s.time += G.time; s.lvl += P.lvl - 1;
  const rekordCzasu = G.time > s.best;          // PRZED aktualizacja! inaczej zawsze true
  if (rekordCzasu) s.best = G.time;
  if (G.kills > s.bestKills) s.bestKills = G.kills;
  saveMeta(); renderShop(); renderStats(); renderBestiary();
  const rekord = rekordCzasu;                   // było `G.time >= s.best` PO aktualizacji = zawsze true
  document.getElementById('overStats').innerHTML =
    `Przetrwano: <b><i data-licz="0" data-czas="${G.time.toFixed(1)}">0:00</i></b> · ` +
    `Pokonano: <b><i data-licz="${G.kills}">0</i></b> · Poziom: <b><i data-licz="${P.lvl}">0</i></b><br>` +
    `Zebrano: <b>${ico('moneta',15)} <i data-licz="${G.zebrane}">0</i></b> (łącznie ${ico('moneta',15)} ${META.coins})` +
    prezent +
    (rekord ? '<br><b class="pieczatka" style="color:#ffd75e">' + ico('puchar',18) + ' NOWY REKORD CZASU!</b>' : '');
  document.getElementById('overOv').style.display = 'flex';
  tickerLiczb(document.getElementById('overStats'));
  if (rekord) deszczMonet(28);
  document.getElementById('wArrow').style.display = 'none';
}
// ---- PAUZA ----
function togglePause(on) {
  if (!G.running) return;
  G.paused = on;
  if (on) puscMysz();                              // na pauzie gracz musi widziec kursor
  document.getElementById('pauseOv').style.display = on ? 'flex' : 'none';
  odswiezKarabinBtn();                             // przycisk karabinu nie może wisieć nad pauzą
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
  for (const o of G.orbs) { scene.remove(o.mesh); if (o.segi) for (const sg of o.segi) scene.remove(sg); }
  for (const s of G.sparks) { scene.remove(s.mesh); s.mesh.material.dispose(); }
  for (const r of G.rings) { scene.remove(r.mesh); r.mesh.material.dispose(); }
  for (const l of G.lobs) scene.remove(l.mesh);
  for (const b of G.boomers) scene.remove(b.mesh);
  for (const b of G.bolts) { scene.remove(b.mesh); b.mesh.material.dispose(); }
  for (const p of G.pops) { scene.remove(p.mesh); p.mesh.material.dispose(); }
  for (const h of G.hps) scene.remove(h.mesh);
  for (const k of G.kury) k.bb.dispose();
  for (const o of G.okruchy) scene.remove(o.mesh);
  for (const p of G.puffs) { scene.remove(p.mesh); p.mesh.material.dispose(); }
  for (const t of G.turrets) { scene.remove(t.mesh); if (t.pasTlo) { scene.remove(t.pasTlo); scene.remove(t.pasFill); } }
  for (const pe of G.pestki) pe.bb.dispose();
  for (const ki of G.kielki) scene.remove(ki.mesh);
  for (const s of G.karabinPoc) scene.remove(s.mesh);
  for (const gl of G.gluty) { scene.remove(gl.mesh); scene.remove(gl.krag); }
  for (const k of G.kaluze) { scene.remove(k.mesh); k.mesh.material.dispose(); }
  for (const pl of plamy) if (pl) pl.mesh.visible = false;
  G.enemies = []; G.gems = []; G.coins = []; G.shots = []; G.orbs = []; G.sparks = []; G.rings = [];
  G.lobs = []; G.boomers = []; G.bolts = []; G.pops = []; G.hps = []; G.kury = []; G.okruchy = [];
  G.puffs = []; G.hitstop = 0; G.padajace = []; G.turrets = []; G.pestki = []; G.kielki = []; G.seria = [];
  G.karabinPoc = []; G.gluty = []; G.kaluze = [];
  G.streak = 0; G.streakT = -9;
  G.vacuum = 0; G.buff = { key: null, t: 0 };
  document.getElementById('bossHp').classList.remove('on');
  document.getElementById('bossOv').classList.remove('on');
  document.getElementById('bossNm').classList.remove('on');
  puscMysz();                                      // w menu kursor musi wrocic
  // TRYB KARABINU: bez tego wyjście do menu w trakcie trybu zostawiało widok broni
  // na ekranie menu, a gracz wracał do biegu bez własnego sprite'a.
  if (G.fps.on) endKarabin('koniec');
  Object.assign(G.fps, { on: false, t: 0, zycia: 0, fireT: 0, pitch: 0, wejscie: 0, wyjscie: 0, kick: 0 });
  P.karabinMa = false;
  odswiezKarabinBtn();
  // kolejka overlayow: wyjscie do menu w trakcie awansu zostawialo ja pelna,
  // a nastepny bieg zaczynal sie od kart z poprzedniego
  OV_Q.length = 0;
  document.getElementById('cardsOv').style.display = 'none';
  document.getElementById('swapOv').style.display = 'none';
  document.getElementById('fpsView').classList.remove('on');
  document.getElementById('fpsFlash').style.opacity = 0;
  document.getElementById('stawBtn').classList.remove('on');
  _stawStan = '';
  document.getElementById('buff').style.opacity = 0;
  for (const c of chests) placeChest(c);
  for (const t of totems) { t.cd = 0; t.mat.opacity = 1; t.ring.visible = true; }
}

function newGame() {
  clearWorld();
  resetStats();
  Object.assign(G, { running: true, over: false, paused: false, dying: false, deathT: 0, time: 0, kills: 0, runCoins: 0, zebrane: 0, ranga: 0, rangaKille: 0, spawnT: 0.5, bossAt: 120, ringAt: 60, tier: 0, shake: 0 });
  P.pos.set(0, 0, 0);
  P.y = terrainH(0, 0);
  // ODBUDOWA ŚWIATA. `clearWorld()` czyści `G.padajace`, ale NIE dotyka `ch.shelves`:
  // regał, który w chwili wyjścia z biegu miał `stan==='pada'`, zostawał zamrożony
  // w połowie upadku NA ZAWSZE (`przewrocRegaly` bierze tylko 'stoi', `updateRestock`
  // tylko 'lezy'), z kolizją regału STOJĄCEGO. A bieg startuje w (0,0,0), czyli
  // gracz od pierwszej sekundy stał w połamanej hali z niewidzialnymi ścianami.
  // Świat jest deterministyczny per chunk, więc przebudowa jest bezpieczna.
  rebuildWorld();
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
  // kopuła nieba jeździ za kamerą — inaczej dojechałbyś do jej krawędzi
  skyDome.position.copy(camera.position);
  // wiatr i chmury muszą płynąć TEŻ w menu i na pauzie: `update()` wtedy nie chodzi,
  // więc bez tego świat za overlayem stał jak zdjęcie.
  if (!G.running || G.paused) windU.value = performance.now() / 1000;
  // render TEŻ w try/catch: wyjątek stąd leciałby co klatkę, obraz by zamarzł,
  // a symulacja szłaby dalej — najgorszy możliwy rodzaj awarii
  try { renderer.render(scene, camera); } catch (err) { console.error(err); }
}

// ============================== START ==============================
// ---- EKRAN ŁADOWANIA: pasek postępu + rotujące porady ----
const PORADY = [
  'Złota skrzynia = nowa broń. Idź za strzałką na ekranie.',
  'Marshmallini po śmierci dzieli się na dwa mniejsze. Planuj kolejność.',
  'Sodino syczy przed wybuchem — to Twoja sekunda na ucieczkę.',
  'Gummini odbija się i nie da się go odepchnąć. Nie licz na knockback.',
  'Lollini kręci się jak piła. Wolny, ale nie właź pod tarczę.',
  'Foliowa torba: PRZYTRZYMAJ skok w locie, żeby szybować nad hordą.',
  'Na regale w markecie horda wspina się powoli — to Twoja chwila oddechu.',
  'Woda spowalnia i Ciebie, i przekąski. Skokiem przeskoczysz zatoczkę.',
  'Garnek Nonny daje buff na kilkanaście sekund. Warto po niego zboczyć z trasy.',
  'Monety zostają po śmierci — każdy przegrany bieg i tak coś daje.',
  'KARABIN ze skrzyni = pierwsza osoba i 20 sekund rzezi. Masz 3 trafienia.',
  'W trybie karabinu cios odrzuca całą hordę — ale trzeci kończy zabawę.',
  'Magazynek Nonny w sklepie wydłuża tryb karabinu o 5 sekund za poziom.',
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
  await ladowanie('Wysypywanie witamin…');
  const pig = await flatMat('assets/pigulka.png');
  pigulkaMat = pig.mat; pigulkaAspect = pig.w / pig.h;
  const czo = await flatMat('assets/czosnek.png');
  czosnekMat = czo.mat; czosnekAspect = czo.w / czo.h;
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
  // (column1.png = dawna kolumna totemu; garnek/witryna są proceduralne, plik nie jest już wczytywany)
  bottleMat = (await flatMat('assets/bottle.png')).mat;
  // pizza zamiast radia z Rudeusza (nazwa zmiennej zostaje — wisi na niej pocisk bumerangu)
  radioMat = new THREE.MeshBasicMaterial({ map: pizzaTexture(), transparent: true,
    alphaTest: 0.4, side: THREE.DoubleSide });
  kapecMat = new THREE.MeshBasicMaterial({ map: kapecTexture(), transparent: true,
    alphaTest: 0.4, side: THREE.DoubleSide });
  try { salataMat = (await flatMat('assets/salata_czasza.png')).mat; } catch { salataMat = null; }
  // scyzoryk ze sprite'a wlasciciela; `scyzorykTexture()` zostaje jako awaryjny.
  // Rysunek jest po przekatnej kwadratu, wiec aspekt 1 i nieco wiekszy quad —
  // przy wirowaniu poczatkowy kat i tak przestaje mieć znaczenie.
  try {
    scyzorykMat = (await flatMat('assets/scyzoryk.png')).mat;
    scyzorykAspect = 1.0;
    scyzorykMat.side = THREE.DoubleSide;
  } catch {
    scyzorykMat = new THREE.MeshBasicMaterial({ map: scyzorykTexture(), transparent: true,
      alphaTest: 0.4, side: THREE.DoubleSide });
  }
  heartMat = emojiMat('❤️');
  // postacie grywalne (potrzebne też do portretów w menu)
  // ===== VEGGIE FAMIGLIA =====
  await ladowanie('Budzenie Carrotella…');
  await buildChar('carrotello_squattello', ['idle', 'run', 'jump']);
  await ladowanie('Beetino zakłada okulary…');
  await buildChar('beetino_bouncerino', ['idle', 'run', 'jump']);   // poprawka MA idle
  await ladowanie('Babcia szuka kapcia…');
  await buildChar('granny_smithella', ['idle', 'run', 'jump']);
  await ladowanie('Razoretta ostrzy scyzoryk…');
  await buildChar('radishetta_razoretta', ['idle', 'run', 'jump']);
  await ladowanie('Pipsini wychodzi z jabłka…');
  await buildChar('pipsini_nipotini', ['idle', 'run']);
  await ladowanie('Zwoływanie Famiglia Snackoni…');
  for (const w of ['chipsetti_soldatetti', 'marshmallini_fluffini', 'gummini_bouncini',
                   'friesetti_spearetti', 'sodino_explodino', 'lollini_spinnini']) {
    await buildChar(w, ['run']);
  }
  // 'punch' = animacja WYCISKANIA SIĘ z paczki PixelLaba; packer ją wcześniej po cichu
  // pomijał, bo katalog nazywał się 'squeezes_its_own_body_hard_with_tiny_arms_compress'
  await buildChar('ketchupino_splatterino', ['run', 'punch']);   // pierwszy wróg dystansowy
  await ladowanie('Don Chipso poprawia kapelusz…');
  await buildChar('don_chipso', ['run']);          // boss ma wreszcie własny arkusz
  // Kernello ma WLASNA animacje eksplozji — jedyny wrog z prawdziwym `death`
  await buildChar('kernello_boomello', ['idle', 'run', 'death']);
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
  // gietkosc: kwiatek na cienkiej łodydze kładzie się chętniej, sucha trawa jeszcze
  // chętniej (i tak stoi wyżej, więc pochylenie jest na niej najlepiej widoczne)
  flowerMat = makeBladeMaterial(flowerTexture(), 1.15);
  stalkMat = makeBladeMaterial(stalkTexture(), 1.3);
  glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 });
  initLeafCards();
  initLeafSolids();
  initGrassField();
  crateMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#b98a4e', '#7d5a2e', 4) });
  plankMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#a9793f', '#6d4a22', 6) });
  stoneMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#9a9c96', '#6f7169', 3) });

  charKey = (CHARS[META.lastChar] && maszPostac(META.lastChar)) ? META.lastChar : 'carrotello';
  mapKey = MAPS[META.lastMap] ? META.lastMap : 'laki';
  P.pos = new THREE.Vector3(0, 0, 0);
  P.y = terrainH(0, 0);
  playerBB = new Billboard(CHARS[charKey].char, CHARS[charKey].scale);
  initHitFlash();
  initLettuce();
  initKarabin();         // widok broni do trybu pierwszej osoby (nakładka 2D)
  karabinPocMat = new THREE.MeshBasicMaterial({ map: karabinPocTexture(), transparent: true,
    alphaTest: 0.4, side: THREE.DoubleSide, depthWrite: false });
  resetStats();          // P.pos musi istnieć PRZED chunkami i skrzyniami
  setMap(mapKey);        // buduje świat + rozstawia skrzynie/totemy
  await ladowanie('Ukrywanie skrzyń…');
  spawnChests(9);
  await ladowanie('Stawianie garnków Nonny…');
  await ladujGarnek();      // sprite garnka; bez niego zostaje proceduralny
  spawnTotems(3);
  // `setMap` poszedł WCZEŚNIEJ niż wczytanie sprite'a, a `spawnTotems` bierze teksturę
  // proceduralną — bez tego wywołania garnek zostawał rysowany kodem.
  ustawWygladGarnkow(mapKey);
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
  // Kod odblokowuje WSZYSTKO + 5000 monet, a `main.js` w demo na GitHub Pages jest
  // publiczny — kazdy moglby go odczytac z zrodla i sklep przestalby cokolwiek znaczyc.
  // Poza DEV pole na kod jest USUWANE z drzewa (nie tylko ukrywane).
  const kodBox = document.getElementById('kodBox');
  if (!DEV && kodBox) kodBox.remove();
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
  if (kodInput) document.getElementById('kodBtn').onclick = uzyjKodu;
  if (kodInput) kodInput.addEventListener('keydown', e => {
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
    G.running = false;
    rozliczBieg();                                // monety z przerwanego biegu też są nasze
    META.st.runs++; META.st.time += G.time; META.st.lvl += Math.max(0, P.lvl - 1);
    if (G.time > META.st.best) META.st.best = G.time;
    if (G.kills > META.st.bestKills) META.st.bestKills = G.kills;
    clearWorld();
    AUDIO.endRun();                               // z powrotem motyw główny
    document.getElementById('wArrow').style.display = 'none';
    menu.style.display = 'flex';
    saveMeta();                                   // zapisz liczniki bestiariusza z przerwanego biegu
    renderStats(); renderShop(); renderBestiary(); renderChars();
  };
  addEventListener('keydown', e => {
    if (e.code === 'Escape' && G.running &&
        document.getElementById('cardsOv').style.display !== 'flex' &&
        document.getElementById('swapOv').style.display !== 'flex') togglePause(!G.paused);
  });
  // debug (usunąć przed wydaniem); step = ręczne krokowanie pętli,
  // bo podgląd dławi rAF bez fokusa (pułapka znana z Rudeusza)
  // hak debugowy WYLACZNIE w DEV: eksponowal META (edytowalne monety), saveMeta,
  // spawnEnemy, killEnemy, setMap i step() — na mobile z rewarded ads to obejscie
  // calej monetyzacji przez konsole WebView.
  if (DEV) window.HORDA = {
    G, P, terrainH, chests, totems, openSwap, renderWpns, chunkMap, supportY, onSpill, setMap,
    wchest, META, CHARS, MAPS, ENEMY_TYPES, spawnEnemy, killEnemy, renderBestiary, saveMeta,
    setPlayerChar, togglePause, get charKey() { return charKey; }, AUDIO,
    setTilt(v) { SPRITE_TILT = v; refreshSpriteTilt(); },   // 0 = pionowe billboardy, 1 = do kamery
    przewrocRegaly, nova,
    get tilt() { return { SPRITE_TILT, kat: +(tiltKat * 180 / Math.PI).toFixed(1) }; },
    get grass() { return grassField; },
    THREE, scene, camera, renderer,                        // do inspekcji w podglądzie
    get tr() { return { trBuf, TR_RES, TR_SPAN, TR_ST, trCx, trCz, trAktywne, trKatU }; },
    updateTrample,
    render() { renderer.render(scene, camera); },
    PAD, pollPads, get camYaw() { return camYaw; }, get gpSel() { return gpSel; },
    // staty pochodne + pula kart: do pomiarow balansu (projektant/tester nie mieli
    // jak zmierzyc, czy karta faktycznie cokolwiek robi — stad martwy `fireMul`)
    get staty() {
      return {
        dmgAll: +dmgAll().toFixed(4), fireMul: +fireMul().toFixed(4), critC: +critC().toFixed(4),
        rangeF: +rangeF().toFixed(3), magnetF: +magnetF().toFixed(3), speedF: +speedF().toFixed(3),
        lvl: P.lvl, xpNeed: P.xpNeed, ranga: G.ranga,
        passives: { ...P.passives }, repeat: { ...P.repeat },
      };
    },
    xpDoNast, REPEAT, cardPool, repeatPool,
    step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) { pollPads(dt); if (G.running && !G.paused) update(dt); }
      renderer.render(scene, camera);
    },
  };
})();
