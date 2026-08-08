// HORDA 3D v4 — teren 3D + kamera za plecami + meta-progresja (monety/sklep)
import * as THREE from './lib/three.module.js';
import { SPRITEDATA } from './spritedata.js?v=1';

// ============================== USTAWIENIA ==============================
const PX2U = 1 / 55;
const WORLD_R = 130;
const CAM_DIST = 9.2, CAM_H = 6.4;                // nisko, za plecami (Megabonk)
const DIR_ROWS = ['south','south-east','east','north-east','north','north-west','west','south-west'];
let camYaw = 0;                                    // obrót kamery wokół gracza

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
function terrainH(x, z) {
  const raw = 5.4 * vnoise(x / 40 + 37.7, z / 40 + 11.3)
            + 1.6 * vnoise(x / 14 + 91.1, z / 14 + 55.5) - 1.15;
  const r = Math.hypot(x, z);
  const f = Math.min(1, Math.max(0, (r - 6) / 14));
  return raw * f + 1.55 * (1 - f);               // start płaski, NAD wodą
}
const WATER_Y = 0.75;                            // doliny poniżej = jeziora
const biome = (x, z) => vnoise(x / 62 + 7.7, z / 62 + 3.3);  // 0=las, 1=sucha łąka

// ============================== SCENA ==============================
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc8ec);
scene.fog = new THREE.Fog(0x9cc8ec, 55, 135);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);

scene.add(new THREE.HemisphereLight(0xd8ecff, 0x3e6b2f, 1.0));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.25);
sun.position.set(45, 70, 25);
scene.add(sun);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// -------- tekstura trawy --------
function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#5da344'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = Math.random() < .5 ? '#579b3f' : (Math.random() < .7 ? '#66ad4c' : '#4f923a');
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
  LIB[name] = { size, footOff: def.footOff || 0, anims: {} };
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

// ============================== META (localStorage) ==============================
const META_KEY = 'horda3d_meta_v1';
function loadMeta() {
  const def = () => ({ coins: 0, up: { serce: 0, dmg: 0, szyb: 0, magnes: 0 }, unlocked: {} });
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY)) || {};
    const d = def();
    return { coins: m.coins || 0, up: Object.assign(d.up, m.up), unlocked: Object.assign(d.unlocked, m.unlocked) };
  } catch { return def(); }
}
const META = loadMeta();
const saveMeta = () => localStorage.setItem(META_KEY, JSON.stringify(META));

const SHOP = [
  { key: 'serce',  ico: '❤️', nm: 'Twarde serce',   ds: '+1 serce na start',      base: 50, max: 3 },
  { key: 'dmg',    ico: '💪', nm: 'Siła brainrota', ds: '+10% obrażeń na stałe',  base: 40, max: 5 },
  { key: 'szyb',   ico: '👟', nm: 'Kondycja',       ds: '+8% szybkości na stałe', base: 40, max: 5 },
  { key: 'magnes', ico: '🧲', nm: 'Przyciąganie',   ds: '+20% magnesu na stałe',  base: 30, max: 5 },
];
// odblokowania broni i pasywów (jednorazowe — wchodzą do puli kart w biegu)
const SHOP_UNLOCKS = [
  { key: 'piorun',   ico: '⚡', nm: 'Broń: Piorun',          ds: 'Grom bije losowych wrogów',      price: 150 },
  { key: 'butelka',  ico: '🍾', nm: 'Broń: Butelka żula',    ds: 'Leci łukiem i wybucha',          price: 200 },
  { key: 'bumerang', ico: '📻', nm: 'Broń: Radio-bumerang',  ds: 'Leci i wraca, kosząc po drodze', price: 250 },
  { key: 'tarcza',   ico: '🛡️', nm: 'Pasyw: Tarcza',         ds: 'Blokuje 1 trafienie co jakiś czas', price: 120 },
];
const shopPrice = it => it.base * Math.pow(2, META.up[it.key]);

function renderShop() {
  document.getElementById('shopCoins').textContent = `(🪙 ${META.coins})`;
  document.getElementById('shopCoins2').textContent = `(🪙 ${META.coins})`;
  const wrap = document.getElementById('shopItems'); wrap.innerHTML = '';
  const deny = d => d.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 200 });
  for (const it of SHOP) {
    const lvl = META.up[it.key], maxed = lvl >= it.max;
    const d = document.createElement('div');
    d.className = 'shopIt' + (maxed ? ' max' : '');
    d.innerHTML = `<div class="ico">${it.ico}</div><div class="nm">${it.nm} ${lvl}/${it.max}</div>
      <div class="ds">${it.ds}</div><div class="pr">${maxed ? 'MAX' : '🪙 ' + shopPrice(it)}</div>`;
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
    d.className = 'shopIt' + (owned ? ' max' : '');
    d.innerHTML = `<div class="ico">${it.ico}</div><div class="nm">${owned ? '✅ ' : '🔒 '}${it.nm}</div>
      <div class="ds">${it.ds}</div><div class="pr">${owned ? 'ODBLOKOWANE' : '🪙 ' + it.price}</div>`;
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
  lobs: [], boomers: [], bolts: [],
  spawnT: 0, shake: 0, bossAt: 180,
  vacuum: 0, buff: { key: null, t: 0 },
};
const P = {};

function resetStats() {
  Object.assign(P, {
    pos: new THREE.Vector3(0, 0, 0),
    hp: 5 + META.up.serce, maxHp: 5 + META.up.serce,
    iframes: 0, airY: 0, vy: 0, shieldCd: 0,
    weapons: [{ key: 'kule', lvl: 1, t: 0 }],   // max 3 sloty
    passives: {},                                // key -> poziom
    evo: {},                                     // key -> true
    xp: 0, lvl: 1, xpNeed: 5,
  });
}
// ---- statystyki pochodne (meta + pasywy + buffy) ----
const dmgAll  = () => (1 + 0.10 * META.up.dmg) * Math.pow(1.15, P.passives.moc || 0) * (G.buff.key === 'dmg' ? 2 : 1);
const fireMul = () => Math.pow(1.12, P.passives.tempo || 0);
const critC   = () => 0.10 * (P.passives.krytyk || 0);
const rangeF  = () => 14 * Math.pow(1.2, P.passives.zasieg || 0);
const magnetF = () => 2.6 * (1 + 0.20 * META.up.magnes) * Math.pow(1.35, P.passives.magnes || 0);
const speedF  = () => 6.2 * (1 + 0.08 * META.up.szyb) * Math.pow(1.10, P.passives.buty || 0);
const hasWeapon = k => P.weapons.find(w => w.key === k);

// ============================== WEJŚCIE ==============================
const keys = {};
function tryJump() {
  if (G.running && !G.paused && P.airY <= 0) { P.vy = 8.2; P.airY = 0.001; }
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
  zul:      { hp: 6, speed: 2.0, dmg: 1, scale: 1.05, xp: 2, walk: 'walk', death: 'death', char: 'enemy' },
  wegielek: { hp: 1, speed: 3.9, dmg: 1, scale: 0.9, xp: 1, walk: 'run' },
  dzik:     { hp: 5, speed: 5.2, dmg: 1, scale: 2.1, xp: 3, walk: 'run' },
  boss:     { hp: 90, speed: 2.4, dmg: 2, scale: 1.9, xp: 25, walk: 'run', char: 'doctorAngry', boss: true },
};

let eliteRingMat = null;
function spawnEnemy(type) {
  const T = ENEMY_TYPES[type];
  const a = Math.random() * Math.PI * 2, r = 36 + Math.random() * 8;
  const hpMul = 1 + G.time / 60 * 0.35;
  const elite = !T.boss && G.time > 60 && Math.random() < 0.06;
  const e = {
    type, T, elite,
    pos: new THREE.Vector3(P.pos.x + Math.sin(a) * r, 0, P.pos.z + Math.cos(a) * r),
    hp: T.hp * (T.boss ? 1 : hpMul) * (elite ? 6 : 1),
    dying: false, hitCd: 0, kb: new THREE.Vector3(), orbCd: 0, ty: 0,
    bb: new Billboard(T.char || type, T.scale * (elite ? 1.45 : 1)),
  };
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
  document.getElementById('kills').textContent = '💀 ' + G.kills;
  const xpTotal = e.T.xp * (e.elite ? 4 : 1);
  const n = e.T.boss ? 10 : (e.elite ? 3 : 1);
  for (let k = 0; k < n; k++) {
    G.gems.push(makeGem(e.pos.x + (Math.random() - .5) * 1.5, e.pos.z + (Math.random() - .5) * 1.5, xpTotal / n));
  }
  // monety: 9% szansy, elita 2 szt. gwarantowane, boss garść
  if (e.T.boss) { for (let k = 0; k < 12; k++) G.coins.push(makeCoin(e.pos.x + (Math.random() - .5) * 2.5, e.pos.z + (Math.random() - .5) * 2.5)); }
  else if (e.elite) { G.coins.push(makeCoin(e.pos.x, e.pos.z)); G.coins.push(makeCoin(e.pos.x + 0.6, e.pos.z)); }
  else if (Math.random() < 0.09) G.coins.push(makeCoin(e.pos.x, e.pos.z));
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

// ============================== BRONIE (rejestr) ==============================
// tick(w, dt) woła się co klatkę dla każdej posiadanej broni; w = {key, lvl, t}
const WEAPONS = {
  kule: {
    ico: '🟡', nm: 'Kule energii', ds: 'Samonaprowadzające pociski', max: 5,
    lvlDs: l => ['1 pocisk', '2 pociski', '+1 przebicie', '3 pociski', '+2 przebicia (→ ewolucja!)'][l - 1],
    evoKey: 'meteor', evoIco: '☄️', evoNm: 'KULE METEORYCZNE', evoDs: 'EWOLUCJA: pociski WYBUCHAJĄ przy trafieniu',
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
    ico: '🦴', nm: 'Kość orbitalna', ds: 'Kości krążą i biją wrogów', max: 5,
    lvlDs: l => l + (l === 1 ? ' kość' : ' kości') + (l === 5 ? ' (→ ewolucja!)' : ''),
    evoKey: 'kosci', evoIco: '🌪️', evoNm: 'KOŚCIOTRZĘSIENIE', evoDs: 'EWOLUCJA: kości ×1.5 większe, szybsze i 2× mocniejsze',
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
            if (e.hp <= 0) killEnemy(e, j);
          }
        }
      }
    },
  },
  tupniecie: {
    ico: '💢', nm: 'Tupnięcie', ds: 'Fala uderzeniowa (też przy lądowaniu ze skoku!)', max: 3,
    lvlDs: l => 'promień i moc fali +' + l,
    evoKey: 'sejsm', evoIco: '🌋', evoNm: 'TRZĘSIENIE ZIEMI', evoDs: 'EWOLUCJA: fale częstsze, większe i 2× mocniejsze',
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = P.evo.sejsm ? 2.0 : 3.2;
      nova(P.pos.x, P.pos.z, stompRad(w.lvl), stompDmg(w.lvl));
    },
  },
  piorun: {
    ico: '⚡', nm: 'Piorun', ds: 'Grom bije losowych wrogów', max: 5, locked: true,
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
        e.hp -= 3 * dmgAll();
        e.kb.set(0, 0, 0);
        const j = G.enemies.indexOf(e);
        if (e.hp <= 0 && j >= 0) killEnemy(e, j);
      }
    },
  },
  butelka: {
    ico: '🍾', nm: 'Butelka żula', ds: 'Leci łukiem i WYBUCHA', max: 5, locked: true,
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
    ico: '📻', nm: 'Radio-bumerang', ds: 'Grające radio leci i WRACA, kosząc po drodze', max: 5, locked: true,
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
};
const stompLvl = () => { const w = hasWeapon('tupniecie'); return w ? w.lvl : 0; };
const stompRad = l => 3 + l * 0.7 + (P.evo.sejsm ? 2 : 0);
const stompDmg = l => l * 1.5 * (P.evo.sejsm ? 2 : 1) * dmgAll();

// ============================== PASYWY (bufy zbierane kartami) ==============================
const PASSIVES = {
  moc:    { ico: '💥', nm: 'Moc',     ds: '+15% obrażeń wszystkiego', max: 5 },
  tempo:  { ico: '⚡', nm: 'Tempo',   ds: '+12% szybkości ataków',    max: 5 },
  buty:   { ico: '👟', nm: 'Buty dresiarza', ds: '+10% szybkości ruchu', max: 5 },
  magnes: { ico: '🧲', nm: 'Magnes',  ds: '+35% zasięgu zbierania',   max: 5 },
  krytyk: { ico: '🎲', nm: 'Krytyk',  ds: '+10% szansy na cios ×3',   max: 5 },
  serce:  { ico: '❤️', nm: 'Serducho', ds: '+1 max serce i pełne leczenie', max: 5 },
  zasieg: { ico: '🔭', nm: 'Sokoli wzrok', ds: '+20% zasięgu broni',  max: 4 },
  tarcza: { ico: '🛡️', nm: 'Tarcza brainrota', ds: 'Blokuje 1 trafienie (ładuje się z czasem)', max: 3, locked: true },
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
  if (P.weapons.length < 3) {
    for (const key of Object.keys(WEAPONS)) {
      const W = WEAPONS[key];
      if (hasWeapon(key)) continue;
      if (W.locked && !META.unlocked[key]) continue;
      pool.push({
        ico: W.ico, nm: 'NOWA BROŃ: ' + W.nm, ds: W.ds,
        do: () => { P.weapons.push({ key, lvl: 1, t: 0 }); renderWpns(); },
      });
    }
  }
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
  if (!picks.length) picks.push({ ico: '🪙', nm: 'Znaleźne', ds: '+20 monet', do: () => { G.runCoins += 20; drawCoins(); } });
  for (const u of picks) {
    const d = document.createElement('div');
    d.className = 'card' + (u.gold ? ' gold' : '');
    d.innerHTML = `<div class="ico">${u.ico}</div><div class="nm">${u.nm}</div><div class="ds">${u.ds}</div>`;
    d.onclick = () => { u.do(); document.getElementById('cardsOv').style.display = 'none'; G.paused = false; };
    wrap.appendChild(d);
  }
  document.getElementById('cardsOv').style.display = 'flex';
}

// ============================== WYMIENNIK BRONI 🔄 ==============================
function openSwap() {
  G.paused = true;
  const wrap = document.getElementById('swapList'); wrap.innerHTML = '';
  document.getElementById('swapTitle').textContent = '🔄 WYMIENNIK! Którą broń oddajesz?';
  for (const w of P.weapons) {
    const W = WEAPONS[w.key];
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<div class="ico">${W.ico}</div><div class="nm">${W.nm} poz. ${w.lvl}</div><div class="ds">kliknij, by ODDAĆ</div>`;
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
function pickNewWeapon(oldW) {
  const opts = Object.keys(WEAPONS).filter(k =>
    !hasWeapon(k) && (!WEAPONS[k].locked || META.unlocked[k]));
  if (!opts.length) { G.runCoins += 15; drawCoins(); return closeSwap(); }
  const wrap = document.getElementById('swapList'); wrap.innerHTML = '';
  document.getElementById('swapTitle').textContent = '🔄 Co bierzesz w zamian?';
  for (const key of opts) {
    const W = WEAPONS[key];
    const d = document.createElement('div');
    d.className = 'card gold';
    d.innerHTML = `<div class="ico">${W.ico}</div><div class="nm">${W.nm}</div><div class="ds">${W.ds}</div>`;
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
  document.getElementById('hearts').textContent = '❤️'.repeat(Math.max(0, P.hp)) + '🖤'.repeat(P.maxHp - Math.max(0, P.hp));
}
const fmtTime = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const drawCoins = () => document.getElementById('coins').textContent = '🪙 ' + G.runCoins;
function renderWpns() {
  document.getElementById('wpns').innerHTML = P.weapons.map(w => {
    const W = WEAPONS[w.key];
    const evo = W.evoKey && P.evo[W.evoKey];
    return `<span class="wp${evo ? ' evo' : ''}">${evo ? W.evoIco : W.ico}<b>${w.lvl}</b></span>`;
  }).join('') + '<span class="wp empty">' + '·'.repeat(Math.max(0, 3 - P.weapons.length)) + '</span>';
}

// ============================== DEKORACJE (materiały dla chunków) ==============================
let decoMats = null;   // [{mat, aspect, h, forest, weight}]
async function loadDecoMats() {
  const defs = [
    // [plik, wysokość, gdzie: true=las / false=łąka / null=wszędzie, waga]
    ['assets/oak1.png', 3.4, true, 3], ['assets/oak2.png', 3.6, true, 2], ['assets/oak3.png', 3.2, true, 2],
    ['assets/rock1.png', 1.1, null, 1.2], ['assets/rock2.png', 1.0, null, 1],
    ['assets/bush1.png', 1.2, true, 2], ['assets/bush3.png', 1.1, null, 1.5],
    ['assets/trawa_kepa.png', 0.8, false, 5], ['assets/kwiat1.png', 0.6, false, 2.5],
    ['assets/kwiat2.png', 0.6, false, 2.5], ['assets/scarecrow.png', 1.6, false, 0.25],
  ];
  decoMats = [];
  for (const [src, h, forest, weight] of defs) {
    const { mat, w, h: ih } = await flatMat(src);
    decoMats.push({ mat, aspect: w / ih, h, forest, weight });
  }
}

// losowa pozycja na lądzie W POBLIŻU GRACZA (mapa nieskończona)
function landSpot(rMin = 14, rMax = 85) {
  for (let tries = 0; tries < 60; tries++) {
    const a = Math.random() * Math.PI * 2, r = rMin + Math.sqrt(Math.random()) * (rMax - rMin);
    const x = P.pos.x + Math.sin(a) * r, z = P.pos.z + Math.cos(a) * r;
    if (terrainH(x, z) < WATER_Y + 0.35) continue;              // nie w wodzie
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
    let cr = 0.82 + b * 0.30, cg = 1.0, cb = 0.80 - b * 0.18;
    if (h < WATER_Y + 0.5) { cr *= 0.72; cg *= 0.78; cb *= 0.62; }
    cols[i * 3] = cr; cols[i * 3 + 1] = cg; cols[i * 3 + 2] = cb;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
  const mesh = new THREE.Mesh(geo, chunkMat);
  mesh.position.set(wx0, 0, wz0);
  scene.add(mesh);
  // dekoracje deterministyczne per chunk
  const rng = chunkRng(cx, cz);
  const deco = [], rocks = [];
  const nDeco = 5 + Math.floor(rng() * 5);
  for (let i = 0; i < nDeco; i++) {
    const x = wx0 + (rng() - 0.5) * CHUNK, z = wz0 + (rng() - 0.5) * CHUNK;
    if (terrainH(x, z) < WATER_Y + 0.3) continue;
    const las = biome(x, z) <= 0.45;
    const cands = decoMats.filter(d => d.forest === null || d.forest === las);
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
    }
  }
  return { mesh, deco, rocks };
}
let chunkMat = null;   // tworzony w boot (po teksturze)
let lastCC = null;
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
  if (roll < 0.12) {                 // 🔄 WYMIENNIK — wymiana broni!
    openSwap();
  } else if (roll < 0.60) {          // monety
    for (let k = 0; k < 5 + Math.floor(Math.random() * 6); k++)
      G.coins.push(makeCoin(c.pos.x + (Math.random() - .5) * 2, c.pos.z + (Math.random() - .5) * 2));
  } else if (roll < 0.87) {          // kości XP
    for (let k = 0; k < 6; k++)
      G.gems.push(makeGem(c.pos.x + (Math.random() - .5) * 2, c.pos.z + (Math.random() - .5) * 2, 1));
  } else {                           // wielki magnes: zasysa WSZYSTKO
    G.vacuum = 2.0;
    toastBuff('🧲 MAGNES! Wszystko leci do Ciebie');
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2000);
  }
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
    const s = landSpot(18, 70) || { x: P.pos.x - 20, z: P.pos.z - 20 };
    m.scale.set(2.2 * (colMat.w / colMat.h), 2.2, 1);
    m.position.set(s.x, terrainH(s.x, s.z) - 0.02, s.z);
    scene.add(m);
    const ring = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false }));
    ring.scale.set(3, 1, 3);
    ring.position.set(s.x, terrainH(s.x, s.z) + 0.06, s.z);
    scene.add(ring);
    totems.push({ mesh: m, ring, pos: new THREE.Vector3(s.x, 0, s.z), cd: 0, mat });
  }
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
      if (e.hp <= 0) killEnemy(e, j);
    }
  }
}

// ============================== PĘTLA ==============================
let playerBB = null;
const clock = new THREE.Clock();

function update(dt) {
  G.time += dt;
  document.getElementById('timer').textContent = fmtTime(G.time);

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
  const inWater = terrainH(P.pos.x, P.pos.z) < WATER_Y - 0.04 && P.airY <= 0;
  let spd = speedF() * (inWater ? 0.6 : 1);
  if (G.buff.key === 'szyb') spd *= 1.45;
  P.pos.x += wx * spd * dt;
  P.pos.z += wz * spd * dt;              // mapa bez końca — zero klamry
  const pTy = terrainH(P.pos.x, P.pos.z);
  ensureChunks();
  water.position.set(P.pos.x, WATER_Y, P.pos.z);

  // ---- skok ----
  const wasAir = P.airY > 0;
  if (P.airY > 0 || P.vy > 0) {
    P.airY += P.vy * dt;
    P.vy -= 22 * dt;
    if (P.airY <= 0) { P.airY = 0; P.vy = 0; }
  }
  if (wasAir && P.airY === 0 && stompLvl() > 0) {       // lądowanie = fala!
    nova(P.pos.x, P.pos.z, stompRad(stompLvl()), stompDmg(stompLvl()));
  }
  const airborne = P.airY > 0.25;
  if (P.shieldCd > 0) P.shieldCd -= dt;

  const moving = ml > 0.05;
  if (moving) playerBB.facing = faceAngle(wx, wz);
  if (airborne) playerBB.play('jump', false);
  else playerBB.play(moving ? 'run' : 'idle');
  if (P.iframes > 0) P.iframes -= dt;
  playerBB.mesh.visible = !(P.iframes > 0 && Math.floor(P.iframes * 12) % 2 === 0);
  playerBB.update(dt, P.pos, pTy + P.airY, pTy);

  // ---- spawner ----
  G.spawnT -= dt;
  const interval = Math.max(0.22, 1.5 - G.time * 0.004);
  if (G.spawnT <= 0 && G.enemies.length < 220) {
    G.spawnT = interval;
    const roll = Math.random();
    let type = 'dresiarz';
    if (G.time > 45 && roll < 0.3) type = 'zul';
    if (G.time > 90 && roll > 0.75) type = 'wegielek';
    if (G.time > 150 && roll > 0.9) type = 'dzik';
    spawnEnemy(type);
    if (G.time > 90 && type === 'wegielek') { spawnEnemy('wegielek'); spawnEnemy('wegielek'); }
  }
  if (G.time > G.bossAt) { G.bossAt += 180; spawnEnemy('boss'); }

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
    e.ty = terrainH(e.pos.x, e.pos.z);
    if (e.dying) {
      e.bb.update(dt, e.pos, e.ty);
      if (e.bb.done) { e.bb.dispose(); G.enemies.splice(i, 1); }
      continue;
    }
    const to = P.pos.clone().sub(e.pos).setY(0);
    const d = to.length(); to.normalize();
    let es = e.T.speed * (e.elite ? 0.85 : 1);
    if (e.ty < WATER_Y - 0.04) es *= 0.7;               // woda spowalnia też ich
    if (G.buff.key === 'slow') es *= 0.6;
    e.pos.addScaledVector(to, es * dt);
    e.pos.add(e.kb.clone().multiplyScalar(dt * 8));
    e.kb.multiplyScalar(Math.max(0, 1 - dt * 10));
    e.bb.facing = faceAngle(to.x, to.z);
    e.orbCd -= dt;
    e.bb.update(dt, e.pos, e.ty);
    if (e.ring) e.ring.position.set(e.pos.x, e.ty + 0.06, e.pos.z);
    if (d < 0.9 + (e.T.boss ? 0.8 : 0) && P.iframes <= 0 && P.airY <= 0.25) {
      const tarczaLvl = P.passives.tarcza || 0;
      if (tarczaLvl > 0 && P.shieldCd <= 0) {           // 🛡️ tarcza zjada cios
        P.shieldCd = [30, 24, 18][tarczaLvl - 1];
        P.iframes = 0.9;
        toastBuff('🛡️ TARCZA zablokowała cios!');
        setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 1500);
        novaRing(P.pos.x, P.pos.z, 2);
      } else {
        P.hp -= e.T.dmg; P.iframes = 0.9;
        drawHearts();
        G.shake = 0.35;
        const v = document.getElementById('vign');
        v.style.opacity = 1; setTimeout(() => v.style.opacity = 0, 180);
        if (P.hp <= 0) return gameOver();
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
        e.hp -= (2 + 0.5 * B.lvl) * dmgAll();
        e.kb.set(dx, 0, dz).normalize().multiplyScalar(-2.4);
        spark(e.pos.x, e.ty + 1.0, e.pos.z);
        if (e.hp <= 0) killEnemy(e, j);
      }
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

  // ---- totemy ----
  for (const t of totems) {
    t.mesh.rotation.y = camYaw;
    if (t.pos.distanceTo(P.pos) > 110) {      // przenosiny bliżej gracza
      const s = landSpot(25, 70);
      if (s) {
        t.pos.set(s.x, 0, s.z);
        t.mesh.position.set(s.x, terrainH(s.x, s.z) - 0.02, s.z);
        t.ring.position.set(s.x, terrainH(s.x, s.z) + 0.06, s.z);
        t.cd = 0; t.mat.opacity = 1; t.ring.visible = true;
      }
    }
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

  // ---- kamera (orbituje wg camYaw; nie wbija się w teren) ----
  const cx = P.pos.x + Math.sin(camYaw) * CAM_DIST, cz = P.pos.z + Math.cos(camYaw) * CAM_DIST;
  let cy = pTy + CAM_H;
  cy = Math.max(cy, terrainH(cx, cz) + 2.2);
  camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 8));
  if (G.shake > 0) {
    G.shake -= dt;
    camera.position.x += (Math.random() - .5) * G.shake * 0.7;
    camera.position.y += (Math.random() - .5) * G.shake * 0.7;
  }
  camera.lookAt(P.pos.x + fx * 2.2, pTy + 1.3, P.pos.z + fz * 2.2);

  // ---- dekoracje twarzą do kamery ----
  for (const ch of chunkMap.values())
    for (const m of ch.deco) m.rotation.y = camYaw;

  // ---- chmury ----
  for (const c of clouds) {
    c.m.position.x += c.v * dt;
    if (c.m.position.x > P.pos.x + 150) c.m.position.x = P.pos.x - 150;
    c.m.quaternion.copy(camera.quaternion);
  }
}

function gameOver() {
  G.over = true; G.running = false;
  META.coins += G.runCoins; saveMeta(); renderShop();
  document.getElementById('overStats').innerHTML =
    `Przetrwano: <b>${fmtTime(G.time)}</b> · Pokonano: <b>${G.kills}</b> · Poziom: <b>${P.lvl}</b><br>` +
    `Zebrano: <b>🪙 ${G.runCoins}</b> (masz łącznie 🪙 ${META.coins})`;
  document.getElementById('overOv').style.display = 'flex';
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
  G.enemies = []; G.gems = []; G.coins = []; G.shots = []; G.orbs = []; G.sparks = []; G.rings = [];
  G.lobs = []; G.boomers = []; G.bolts = [];
  G.vacuum = 0; G.buff = { key: null, t: 0 };
  document.getElementById('buff').style.opacity = 0;
  for (const c of chests) placeChest(c);
  for (const t of totems) { t.cd = 0; t.mat.opacity = 1; t.ring.visible = true; }
}

function newGame() {
  clearWorld();
  resetStats();
  Object.assign(G, { running: true, over: false, paused: false, time: 0, kills: 0, runCoins: 0, spawnT: 0.5, bossAt: 180, shake: 0 });
  P.pos.set(0, 0, 0);
  document.getElementById('lvl').textContent = 'POZIOM 1';
  document.getElementById('kills').textContent = '💀 0';
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
  const colImg = await flatMat('assets/column1.png');
  bottleMat = (await flatMat('assets/bottle.png')).mat;
  radioMat = (await flatMat('assets/radio.png')).mat;
  await buildChar('kasia', ['idle', 'run', 'jump']);
  await buildChar('dresiarz', ['run', 'death']);
  await buildChar('enemy', ['walk', 'death']);
  await buildChar('wegielek', ['run']);
  await buildChar('dzik', ['run']);
  await buildChar('doctorAngry', ['run']);
  await loadDecoMats();
  chunkMat = new THREE.MeshLambertMaterial({ map: grassTexC, vertexColors: true });

  playerBB = new Billboard('kasia');
  resetStats();          // P.pos musi istnieć PRZED chunkami i skrzyniami
  ensureChunks();
  spawnChests(9);
  spawnTotems(3, colImg);
  drawHearts();
  renderShop();
  camera.position.set(0, terrainH(0, 0) + CAM_H, CAM_DIST);
  camera.lookAt(0, 1.3, -2.2);
  playerBB.update(0, P.pos, terrainH(0, 0));
  loop();

  document.getElementById('btnStart').onclick = () => {
    document.getElementById('startOv').style.display = 'none';
    newGame();
  };
  document.getElementById('btnRetry').onclick = () => {
    document.getElementById('overOv').style.display = 'none';
    newGame();
  };
  const openShop = () => { renderShop(); document.getElementById('shopOv').style.display = 'flex'; };
  document.getElementById('btnShop').onclick = openShop;
  document.getElementById('btnShop2').onclick = openShop;
  document.getElementById('btnShopBack').onclick = () => document.getElementById('shopOv').style.display = 'none';
  // debug (usunąć przed wydaniem); step = ręczne krokowanie pętli,
  // bo podgląd dławi rAF bez fokusa (pułapka znana z Rudeusza)
  window.HORDA = {
    G, P, terrainH, chests, totems, openSwap, renderWpns,
    step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) if (G.running && !G.paused) update(dt);
      renderer.render(scene, camera);
    },
  };
})();
