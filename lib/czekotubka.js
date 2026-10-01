// ╔══════════════ CZEKOTUBKA — PROTOTYP POSTACI 3D (01.10.2026) ══════════════╗
// Jedyna postać 3D w grze (reszta to billboardy pixel-art). Fabuła: przekąska, która zdradziła
// La Famiglia Snackoni i przeszła na stronę warzyw. Referencja właściciela: błyszcząca saszetka
// z folii (granat u góry → błękit na dole), zgrzew na dole, karbowana nakrętka na szyjce,
// czekolada ściekająca z górnej krawędzi, twarz na korpusie, białe rękawiczki z kciukami w górę,
// białe trampki.
//
// API:
//   const t = stworzCzekotubke(THREE, opcje)
//     → { grupa, ustawStan(stan), update(dt, { predkosc, kierunek, wPowietrzu, vy }), dispose(), … }
//   stany: 'auto' (domyślny: idle/chód/bieg wg prędkości), 'idle', 'chod', 'bieg', 'skok', 'atak',
//          'oberwal', 'smierc', 'wygrana'. 'atak' i 'oberwal' to WARSTWY nakładane na bieżący ruch.
//   opcje: { scena (tu trafiają efekty w układzie świata), skala, obrys, chmury: { tex, off, skala },
//            ziemia: (x, z) => y dla kropel, ziarno, wysokoscSkoku }
//
// BUDOWA (1 draw call na postać + 1 na krople czekolady, + cień):
//   • jedna SkinnedMesh ze sztywnymi/miękkimi wagami — kości to prosty szkielet (korpus dół/góra,
//     nakrętka, ramię/łokieć/dłoń, udo/kolano/stopa, 6 kropli czekolady, kropla w kąciku ust);
//     animacja proceduralna = obroty/przesunięcia/skale kości, mieszane wagami (bez skoków).
//     Szkielet zamiast osobnych Meshy, bo budżet to 1–3 draw calle: 20 części = 20 wywołań.
//   • kolor w wierzchołkach, twarz i etykieta na plecach = atlas z canvas (4×3 komórki 256 px),
//     nakładany w shaderze na przód/tył korpusu wg pozycji spoczynkowej (bez UV w geometrii).
//     Tęczówki to osobna warstwa przesuwana uniformem (rozglądanie), przycięta białkiem oka.
//   • materiał: Lambert + 3 pasma toon i ton cienia jak `materialSkrzyn`, połysk folii i czekolady
//     (ostry blask słońca + pionowy pasek „studyjny" w przestrzeni widoku), jasne pasmo na sylwetce,
//     biały błysk przy trafieniu, cień chmur liczony TU (nie owijać `addCloudShadow` z main.js —
//     podwójne owinięcie redefiniuje varyingi), własny customProgramCacheKey.
//   • kontur = odwrócona powłoka w tej samej geometrii (aFx.z = grubość), odsuwana w vertex
//     shaderze PO skinningu wzdłuż normalnej → stała grubość przy każdej pozie, 0 dodatkowych dc.
// Układ: Y w górę, przód = +Z, środek podstawy w (0, 0, 0); lewa ręka postaci = +X.
// ╚═══════════════════════════════════════════════════════════════════════════╝

const TAU = Math.PI * 2;

// ============================== DROBIAZGI ==============================
function lin(hex) {
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const miesz = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mn = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const owin = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const odlU = (u, v) => { const d = Math.abs(u - v) % 1; return Math.min(d, 1 - d); };
function prng(ziarno = 1) {
  let s = (Math.imul(ziarno | 0, 0x9e3779b1) ^ 0x5bd1e995) | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================== WYMIARY (j. świata) ==============================
// Carrotello w grze ma ~1,62–1,70 j. (61–64 px × 1,22 / 46). Tubka z nakrętką: 1,85 j.
export const WYMIARY = {
  A: 0.42, B: 0.27,              // pół-szerokość / pół-głębokość korpusu (przekrój = superelipsa n = 3)
  y0: 0.40, hs: 0.07, hp: 0.20,  // dół zgrzewu, wysokość zgrzewu, wysokość „napuchnięcia"
  yS: 1.36, rcA: 0.15, rcB: 0.11, rcY: 0.16,   // początek narożnika u góry i jego promienie
  rn: 0.105, yN: 1.555,          // promień i wysokość pierścienia pod szyjką
  wys: 1.85,
};
const D = WYMIARY;
// twarz: komórka atlasu obejmuje x ∈ [−FW, FW], y ∈ [FY0, FY0 + FH] na przodzie (tył: etykieta, lustrzanie)
const FW = 0.42, FY0 = 0.52, FH = 0.84, PXJ = 256 / FH;   // px komórki na jednostkę
const TW = { okoX: 0.151, okoY: 1.10, nosY: 0.972, czekX: 0.180, czekY: 0.730 };

// ============================== KOLORY ==============================
const KOL = {
  obrysN: lin(0x0b1036), obrysC: lin(0x1a0904), obrysB: lin(0x2a3150),
  szyjka: lin(0x2c4fae), nakretka: lin(0x23389a), nakrGora: lin(0x2c46aa), nakrPierscien: lin(0x1a2a80),
  czek: lin(0x4c220d), czekGora: lin(0x5c2a11), czekBrzeg: lin(0x2a1006),
  reka: lin(0x1f3388), noga: lin(0x1c2e80),
  rekawiczka: lin(0xf4f4ee), mankiet: lin(0xe9e7dc),
  but: lin(0xf6f8fa), butNosek: lin(0xe8ecf1), butSzew: lin(0xc9d1db), podeszwa: lin(0xdfe5ec),
  bieznik: lin(0x939eab), pasek: lin(0x7fbdf0), sznurowka: lin(0x24387f), wnetrzeButa: lin(0x262b40),
};
// gradient folii po wysokości (spoczynkowej)
const GRAD = [[0.40, 0xdcf4ff], [0.52, 0xbde8ff], [0.70, 0x9dd9ff], [0.90, 0x70b7f5], [1.10, 0x4484da], [1.30, 0x2b55b0], [1.56, 0x1c2c74]]
  .map(([y, h]) => [y, lin(h)]);
function kolorFolii(y) {
  if (y <= GRAD[0][0]) return GRAD[0][1].slice();
  for (let i = 1; i < GRAD.length; i++) if (y <= GRAD[i][0]) {
    const t = (y - GRAD[i - 1][0]) / (GRAD[i][0] - GRAD[i - 1][0]);
    return miesz(GRAD[i - 1][1], GRAD[i][1], t * t * (3 - 2 * t));
  }
  return GRAD[GRAD.length - 1][1].slice();
}

// ============================== KOŚCI ==============================
// [nazwa, rodzic, pozycja spoczynkowa w świecie (null = liczona z profilu), kolejność Eulera]
const KOSCI = [
  ['root', -1, [0, 0, 0], 'YXZ'],
  ['biodra', 0, [0, 0.46, 0], 'YXZ'],
  ['korpus', 1, [0, 0.46, 0], 'YXZ'],
  ['klatka', 2, [0, 0.95, 0], 'YXZ'],
  ['nakretka', 3, [0, 1.56, 0], 'YXZ'],
  ['ramieL', 3, [0.37, 0.96, 0], 'YZX'], ['lokiecL', 5, [0.54, 0.96, 0], 'YZX'], ['dlonL', 6, [0.685, 0.96, 0], 'YZX'],
  ['ramieP', 3, [-0.37, 0.96, 0], 'YZX'], ['lokiecP', 8, [-0.54, 0.96, 0], 'YZX'], ['dlonP', 9, [-0.685, 0.96, 0], 'YZX'],
  ['udoL', 1, [0.2, 0.46, 0], 'YXZ'], ['kolanoL', 11, [0.2, 0.33, 0], 'YXZ'], ['stopaL', 12, [0.2, 0.19, 0], 'YXZ'],
  ['udoP', 1, [-0.2, 0.46, 0], 'YXZ'], ['kolanoP', 14, [-0.2, 0.33, 0], 'YXZ'], ['stopaP', 15, [-0.2, 0.19, 0], 'YXZ'],
  ['kr0', 3, null, 'XYZ'], ['kr1', 3, null, 'XYZ'], ['kr2', 3, null, 'XYZ'], ['kr3', 3, null, 'XYZ'], ['kr4', 3, null, 'XYZ'], ['kr5', 3, null, 'XYZ'],
  ['kroplaUsta', 3, null, 'XYZ'],
];
const K = Object.fromEntries(KOSCI.map((k, i) => [k[0], i]));
const NB = KOSCI.length;
const RAMIE = { 1: K.ramieL, [-1]: K.ramieP }, LOKIEC = { 1: K.lokiecL, [-1]: K.lokiecP }, DLON = { 1: K.dlonL, [-1]: K.dlonP };
const UDO = { 1: K.udoL, [-1]: K.udoP }, KOLANO = { 1: K.kolanoL, [-1]: K.kolanoP }, STOPA = { 1: K.stopaL, [-1]: K.stopaP };

// krople czekolady: gdzie (p = przód, t = tył) i x, albo wprost u (0 = bok +X, 0,25 = środek przodu,
// 0,5 = bok −X, 0,75 = środek tyłu); L = długość pod narożnikiem; w = pół-szerokość w u; kosc = własna kość
const KROPLE = [
  { gdzie: 'p', x: 0.0, L: 0.15, w: 0.016, kosc: 0 },     // na czole, między brwiami
  { gdzie: 'p', x: 0.335, L: 0.35, w: 0.019, kosc: 1 },   // długa obok oka
  { gdzie: 'p', x: -0.325, L: 0.22, w: 0.017 },
  { u: 0.955, L: 0.30, w: 0.02, kosc: 2 },                // bok +X (nad ręką, bliżej tyłu)
  { u: 0.545, L: 0.44, w: 0.021, kosc: 3 },               // bok −X
  { gdzie: 't', x: 0.19, L: 0.50, w: 0.021, kosc: 4 },    // plecy — widać je z kamery gry
  { gdzie: 't', x: -0.13, L: 0.27, w: 0.018, kosc: 5 },
  { gdzie: 't', x: -0.33, L: 0.13, w: 0.015 },
  // falisty brzeg między kroplami
  { gdzie: 'p', x: 0.17, L: 0.035, w: 0.035 }, { gdzie: 'p', x: -0.16, L: 0.045, w: 0.03 },
  { gdzie: 't', x: 0.0, L: 0.06, w: 0.03 }, { gdzie: 't', x: 0.36, L: 0.05, w: 0.025 },
  { u: 0.06, L: 0.07, w: 0.025 }, { u: 0.44, L: 0.06, w: 0.025 },
];

// ============================== PROFIL KORPUSU ==============================
// Ścieżka od zgrzewu do szyjki: zgrzew (płaski, b ≈ 0) → napuchnięcie → boki z lekkim brzuszkiem →
// zaokrąglony narożnik → prawie płaski wierzch → pierścień pod szyjką (koło). t = długość łuku.
let PROF = null, T_SEG = null;
function przygotujProfil() {
  if (PROF) return;
  const L = [], dodaj = (a, b, n, y) => L.push({ a, b, n, y, t: 0 });
  const { A, B } = D;
  for (let i = 0; i <= 8; i++) dodaj(A * 0.985, 0.012, 3, D.y0 + D.hs * i / 8);
  for (let i = 1; i <= 24; i++) {
    const f = i / 24 * Math.PI / 2;
    dodaj(A * (0.985 + 0.015 * Math.sin(f)), 0.012 + (B - 0.012) * Math.sin(f), 3, D.y0 + D.hs + D.hp * (1 - Math.cos(f)));
  }
  const yb0 = D.y0 + D.hs + D.hp;
  for (let i = 1; i <= 30; i++) {
    const k = i / 30;
    dodaj(A * (1 + 0.025 * Math.sin(Math.PI * k)), B * (1 + 0.09 * Math.sin(Math.PI * Math.pow(k, 0.8))), 3, yb0 + (D.yS - yb0) * k);
  }
  for (let i = 1; i <= 24; i++) {
    const f = i / 24 * Math.PI / 2;
    dodaj(A - D.rcA * (1 - Math.cos(f)), B - D.rcB * (1 - Math.cos(f)), 3, D.yS + D.rcY * Math.sin(f));
  }
  const a0 = A - D.rcA, b0 = B - D.rcB, yT = D.yS + D.rcY;
  for (let i = 1; i <= 16; i++) { const k = i / 16; dodaj(a0 + (D.rn - a0) * k, b0 + (D.rn - b0) * k, 3 - k, yT + (D.yN - yT) * k * k); }
  let s = 0;
  for (let i = 1; i < L.length; i++) { const p = L[i - 1], q = L[i]; s += Math.hypot((q.a + q.b - p.a - p.b) / 2, q.y - p.y); q.t = s; }
  for (const p of L) p.t /= s;
  PROF = L;
  T_SEG = [0, L[8].t, L[32].t, L[62].t, L[86].t, 1];
}
function profil(t) {
  const L = PROF;
  if (t <= 0) return L[0];
  if (t >= 1) return L[L.length - 1];
  let lo = 0, hi = L.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m].t <= t) lo = m; else hi = m; }
  const p = L[lo], q = L[hi], k = (t - p.t) / (q.t - p.t || 1);
  return { a: lerp(p.a, q.a, k), b: lerp(p.b, q.b, k), n: lerp(p.n, q.n, k), y: lerp(p.y, q.y, k), t };
}
function tDlaY(y) {
  const L = PROF;
  if (y <= L[0].y) return 0;
  if (y >= L[L.length - 1].y) return 1;
  let lo = 0, hi = L.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m].y <= y) lo = m; else hi = m; }
  const p = L[lo], q = L[hi];
  return lerp(p.t, q.t, (y - p.y) / (q.y - p.y || 1));
}
// przekrój superelipsy parametryzowany długością łuku: u ∈ [0, 1), u = 0 → +X, 0,25 → +Z (przód)
const _przek = new Map();
const PM = 160;
function przekroj(a, b, n) {
  const klucz = a.toFixed(4) + ',' + b.toFixed(4) + ',' + n.toFixed(3);
  let tab = _przek.get(klucz);
  if (tab) return tab;
  const G = 640, X = new Float64Array(G + 1), Z = new Float64Array(G + 1), S = new Float64Array(G + 1), e = 2 / n;
  for (let i = 0; i <= G; i++) {
    const th = TAU * i / G, c = Math.cos(th), s = Math.sin(th);
    X[i] = a * Math.sign(c) * Math.pow(Math.abs(c), e); Z[i] = b * Math.sign(s) * Math.pow(Math.abs(s), e);
    if (i) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]);
  }
  tab = new Float32Array((PM + 1) * 2);
  let j = 0;
  for (let m = 0; m <= PM; m++) {
    const cel = S[G] * m / PM;
    while (j < G - 1 && S[j + 1] < cel) j++;
    const k = (cel - S[j]) / (S[j + 1] - S[j] || 1);
    tab[m * 2] = X[j] + (X[j + 1] - X[j]) * k; tab[m * 2 + 1] = Z[j] + (Z[j + 1] - Z[j]) * k;
  }
  _przek.set(klucz, tab);
  return tab;
}
function naPrzekroju(tab, u) {
  u = u - Math.floor(u);
  const f = u * PM, i = Math.min(PM - 1, Math.floor(f)), k = f - i;
  return [tab[i * 2] + (tab[i * 2 + 2] - tab[i * 2]) * k, tab[i * 2 + 1] + (tab[i * 2 + 3] - tab[i * 2 + 1]) * k];
}
function punktBaz(u, t) {
  const p = profil(t), [x, z] = naPrzekroju(przekroj(p.a, p.b, p.n), u);
  return [x, p.y, z];
}
function normalnaBaz(u, t) {
  const e = 0.0015, t1 = Math.min(1, t + e), t0 = Math.max(0, t - e);
  const a = punktBaz(u + e, t), b = punktBaz(u - e, t), c = punktBaz(u, t1), d = punktBaz(u, t0);
  const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dt = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
  const n = [dt[1] * du[2] - dt[2] * du[1], dt[2] * du[0] - dt[0] * du[2], dt[0] * du[1] - dt[1] * du[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}
// zmarszczki folii: prążki zgrzewu, kilka zagnieceń przy rogach i na plecach, drobna „kruszonka"
const ZAGN = [
  // [strona z (1 przód, −1 tył), x0, y0, x1, y1, szerokość, głębokość]
  [1, -0.41, 0.63, -0.20, 0.52, 0.020, 0.008], [1, 0.41, 0.66, 0.27, 0.53, 0.018, 0.007],
  [1, -0.41, 1.22, -0.33, 1.06, 0.016, 0.006],
  [-1, -0.33, 0.56, 0.05, 0.64, 0.022, 0.008], [-1, 0.24, 0.92, 0.41, 1.06, 0.018, 0.007],
  [-1, -0.41, 1.02, -0.26, 0.86, 0.018, 0.007], [-1, 0.10, 0.50, 0.36, 0.58, 0.02, 0.006],
];
function marszczenie(x, y, z) {
  let d = 0;
  const yz = y - D.y0;
  if (yz < D.hs + 0.02) d += 0.0032 * Math.sin(yz / D.hs * Math.PI * 6) * (1 - sstep(D.hs - 0.01, D.hs + 0.02, yz));
  for (const [s, x0, y0, x1, y1, w, gl] of ZAGN) {
    if (z * s < 0.05) continue;
    const vx = x1 - x0, vy = y1 - y0, k = clamp(((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy), 0, 1);
    const dx = x - (x0 + vx * k), dy = y - (y0 + vy * k), r = Math.hypot(dx, dy) / w;
    d -= gl * Math.exp(-r * r) * sstep(0, 0.15, k) * (1 - sstep(0.85, 1, k));
  }
  d += 0.0016 * Math.sin(x * 21 + y * 13) * Math.sin(y * 27 - x * 9 + z * 15);
  return d;
}
function punkt(u, t) {
  const p = punktBaz(u, t), n = normalnaBaz(u, t), d = marszczenie(p[0], p[1], p[2]);
  return [p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d];
}
function uDlaX(x, gdzie) {
  const tab = przekroj(profil(tDlaY(D.yS)).a, profil(tDlaY(D.yS)).b, 3);
  let best = 0, bd = 1e9;
  for (let i = 0; i <= 400; i++) {
    const u = (gdzie === 'p' ? 0 : 0.5) + i / 800, [px] = naPrzekroju(tab, u);
    if (Math.abs(px - x) < bd) { bd = Math.abs(px - x); best = u; }
  }
  return best;
}

// ============================== BUDOWNICZY GEOMETRII (z indeksem, ze skinningiem) ==============================
const FX0 = [0, 0, 0, 0];
function wpiszWagi(SI, SW, lista) {
  const l = lista.filter(e => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  let s = 0; for (const e of l) s += e[1];
  for (let i = 0; i < 4; i++) { SI.push(l[i] ? l[i][0] : 0); SW.push(l[i] ? l[i][1] / s : 0); }
}
class Bud {
  constructor() { this.P = []; this.N = []; this.C = []; this.F = []; this.SI = []; this.SW = []; this.I = []; this.cz = []; }
  get nv() { return this.P.length / 3; }
  // geo: BufferGeometry; o: { m: Matrix4, kol: [rgb] | (p, n, i) => rgb, kosc: indeks | (p, i) => [[kość, waga], …],
  //   fx: [4] | (p, i) => [4], obrys: { k: rgb, w: mnożnik grubości } | null }
  dodaj(THREE, geo, o) {
    let g = geo;
    if (o.m) { g = geo.clone(); g.applyMatrix4(o.m); }
    if (!g.attributes.normal) g.computeVertexNormals();
    const odwr = !!(o.m && o.m.determinant() < 0);
    const p = g.attributes.position, n = g.attributes.normal, v0 = this.nv, cnt = p.count;
    for (let i = 0; i < cnt; i++) {
      const q = [p.getX(i), p.getY(i), p.getZ(i)], nn = [n.getX(i), n.getY(i), n.getZ(i)];
      this.P.push(q[0], q[1], q[2]); this.N.push(nn[0], nn[1], nn[2]);
      const k = typeof o.kol === 'function' ? o.kol(q, nn, i) : o.kol; this.C.push(k[0], k[1], k[2]);
      const f = typeof o.fx === 'function' ? o.fx(q, i) : (o.fx || FX0); this.F.push(f[0], f[1], f[2], f[3]);
      wpiszWagi(this.SI, this.SW, typeof o.kosc === 'function' ? o.kosc(q, i) : [[o.kosc, 1]]);
    }
    const i0 = this.I.length, idx = g.index ? g.index.array : null, nt = idx ? idx.length : cnt;
    for (let i = 0; i < nt; i += 3) {
      const a = idx ? idx[i] : i, b = idx ? idx[i + 1] : i + 1, c = idx ? idx[i + 2] : i + 2;
      if (odwr) this.I.push(v0 + a, v0 + c, v0 + b); else this.I.push(v0 + a, v0 + b, v0 + c);
    }
    if (o.obrys) this.cz.push({ v0, v1: v0 + cnt, i0, i1: this.I.length, k: o.obrys.k, w: o.obrys.w });
    if (o.m) g.dispose();
    return v0;
  }
  // kontur: odwrócona kopia części z uśrednionymi (po pozycji) normalnymi; grubość liczy shader
  obrysy() {
    for (const c of this.cz) {
      const mapa = new Map(), klucz = i => Math.round(this.P[i * 3] * 2000) + ',' + Math.round(this.P[i * 3 + 1] * 2000) + ',' + Math.round(this.P[i * 3 + 2] * 2000);
      for (let i = c.v0; i < c.v1; i++) {
        const kk = klucz(i); let a = mapa.get(kk);
        if (!a) mapa.set(kk, (a = [0, 0, 0]));
        a[0] += this.N[i * 3]; a[1] += this.N[i * 3 + 1]; a[2] += this.N[i * 3 + 2];
      }
      for (const a of mapa.values()) { const l = Math.hypot(a[0], a[1], a[2]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; }
      const baza = this.nv;
      for (let i = c.v0; i < c.v1; i++) {
        const n = mapa.get(klucz(i));
        this.P.push(this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]); this.N.push(n[0], n[1], n[2]);
        this.C.push(c.k[0], c.k[1], c.k[2]); this.F.push(0, 0, c.w, 0);
        for (let j = 0; j < 4; j++) { this.SI.push(this.SI[i * 4 + j]); this.SW.push(this.SW[i * 4 + j]); }
      }
      for (let t = c.i0; t < c.i1; t += 3)
        this.I.push(baza + this.I[t] - c.v0, baza + this.I[t + 2] - c.v0, baza + this.I[t + 1] - c.v0);
    }
  }
  geo(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aFx', new THREE.Float32BufferAttribute(this.F, 4));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}
// siatka (pierścienie × kolumny) z zawinięciem w kolumnach → BufferGeometry z gładkimi normalnymi.
// Kolumny idą wg u (+X → +Z → −X); `wDol` = pierścienie numerowane z góry w dół (czekolada) → odwrotne nawinięcie.
function siatka(THREE, P, nr, nc, wDol = false) {
  const I = [];
  for (let r = 0; r < nr - 1; r++) for (let j = 0; j < nc; j++) {
    const j1 = (j + 1) % nc, a = r * nc + j, b = r * nc + j1, c = (r + 1) * nc + j1, d = (r + 1) * nc + j;
    if (wDol) I.push(a, b, c, a, c, d); else I.push(a, c, b, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  return g;
}
// kapsuła / rurka wzdłuż +Y: prof = [[y, r], …] od dołu, końce zaokrąglone półkulami
function kapsula(THREE, prof, seg) {
  const pts = [], r0 = prof[0][1], r1 = prof[prof.length - 1][1], y0 = prof[0][0], y1 = prof[prof.length - 1][0];
  for (let i = 0; i <= 3; i++) { const f = -Math.PI / 2 + (i / 3) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(f) * r0), y0 + Math.sin(f) * r0)); }
  for (let i = 1; i < prof.length - 1; i++) pts.push(new THREE.Vector2(prof[i][1], prof[i][0]));
  for (let i = 0; i <= 3; i++) { const f = (i / 3) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(f) * r1), y1 + Math.sin(f) * r1)); }
  const g = new THREE.LatheGeometry(pts, seg);
  return g;
}
function kula(THREE, seg, pier, o = {}) {
  return new THREE.SphereGeometry(1, seg, pier, 0, TAU, o.od || 0, o.do || Math.PI);
}
function macierz(THREE, { t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], kol = 'XYZ' } = {}) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(...t), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], kol)), new THREE.Vector3(...s));
  return m;
}

// ============================== CZĘŚCI ==============================
const FX_FOLIA = [1, 0.55, 0, 0], FX_CZEK = [0, 1.0, 0, 0];
const OB = (k, w = 1) => ({ k, w });
const wagiKorpusu = p => { const w = sstep(0.72, 1.18, p[1]); return [[K.korpus, 1 - w], [K.klatka, w]]; };

function czKorpus(THREE, b) {
  const NC = 32, rings = [0];
  const ile = [3, 6, 8, 7, 4];
  for (let s = 0; s < 5; s++) for (let i = 1; i <= ile[s]; i++) rings.push(lerp(T_SEG[s], T_SEG[s + 1], i / ile[s]));
  const P = [], nr = rings.length;
  for (let r = 0; r < nr; r++) for (let j = 0; j < NC; j++) {
    const q = punkt(j / NC, rings[r]);
    if (r === 0) q[1] -= (j % 2) * 0.016;           // ząbkowany brzeg zgrzewu
    P.push(q[0], q[1], q[2]);
  }
  const g = siatka(THREE, P, nr, NC);
  // dno zgrzewu: kolumna j (przód) z NC − j (tył)
  const I = Array.from(g.index.array);
  for (let j = 0; j < NC / 2; j++) {
    const a = j, bb = j + 1, c = (NC - j - 1) % NC, d = (NC - j) % NC;
    I.push(a, bb, c, a, c, d);
  }
  g.setIndex(I);
  g.computeVertexNormals();
  const yZg = D.y0 + D.hs + 0.005, jasny = lin(0xd8f1ff);
  b.dodaj(THREE, g, {
    kol: p => { let k = kolorFolii(p[1]); if (p[1] < yZg) k = miesz(k, jasny, 0.45); return k; },
    kosc: wagiKorpusu, fx: FX_FOLIA, obrys: OB(KOL.obrysN, 1),
  });
}

// czekolada: skorupa na wierzchu i bokach, z kroplami (odsunięta od folii wzdłuż normalnej)
let KR = null;
function przygotujKrople() {
  if (KR) return KR;
  KR = KROPLE.map(k => ({ ...k, u: k.u != null ? k.u : uDlaX(k.x, k.gdzie) }));
  return KR;
}
const dlugoscCzek = u => { let L = 0.03; for (const k of KR) L = Math.max(L, 0.03 + k.L * Math.exp(-Math.pow(odlU(u, k.u) / k.w, 4))); return L; };
function kroplaU(u) {           // najbliższa „prawdziwa" kropla (L > 0,1) i jej maska
  let best = null, bm = 0;
  for (const k of KR) {
    if (k.L < 0.1) continue;
    const m = Math.exp(-Math.pow(odlU(u, k.u) / (k.w * 1.25), 4));
    if (m > bm) { bm = m; best = k; }
  }
  return [best, bm];
}
function czCzekolada(THREE, b) {
  przygotujKrople();
  const tS = tDlaY(D.yS);
  // kolumny gęściej w kroplach (okrągłe końce), rzadziej między nimi
  const G = 2000, cum = new Float64Array(G + 1);
  for (let i = 1; i <= G; i++) {
    const u = (i - 0.5) / G; let r = 1;
    for (const k of KR) if (k.L > 0.1) r = Math.max(r, 1 + 3.6 * Math.exp(-Math.pow(odlU(u, k.u) / (k.w * 1.6), 2)));
    cum[i] = cum[i - 1] + r;
  }
  const NC = 56, kol = [];
  for (let j = 0, i = 0; j < NC; j++) {
    const cel = cum[G] * j / NC;
    while (i < G && cum[i + 1] < cel) i++;
    kol.push((i + (cel - cum[i]) / (cum[i + 1] - cum[i] || 1)) / G);
  }
  const Q_GORA = [0, 0.1, 0.32, 0.62, 1.0];                 // od szyjki do początku narożnika
  const NK = 7, R_KR = []; for (let k = 1; k <= NK; k++) R_KR.push(Math.sin(k / NK * Math.PI / 2));
  const nr = Q_GORA.length + NK;
  const P = [], kolory = [], wagi = [];
  for (let r = 0; r < nr; r++) for (let j = 0; j < NC; j++) {
    const u = kol[j];
    let t, th, rr = -1;
    if (r < Q_GORA.length) {
      const q = Q_GORA[r];
      t = 1 - (1 - tS) * q;
      th = lerp(0.016, 0.044, sstep(0, 0.14, q)) - 0.008 * sstep(0.3, 1, q);
      // nierówna, „lana" powierzchnia: blask rozpada się na kilka połysków zamiast jednej plamy
      th += 0.009 * sstep(0.05, 0.25, q) * Math.sin(u * TAU * 7 + q * 4.0) * Math.sin(q * 8.5 + u * TAU * 3 + 1.3);
    } else {
      rr = R_KR[r - Q_GORA.length];
      const L = dlugoscCzek(u), [kr, m] = kroplaU(u);
      t = tDlaY(D.yS - L * rr);
      const bulw = 0.024 * sstep(0.08, 0.22, L) * m * Math.exp(-Math.pow((rr - 0.8) / 0.15, 2));
      th = 0.036 + bulw;
      if (rr > 0.78) th *= Math.sqrt(Math.max(0, 1 - Math.pow((rr - 0.78) / 0.22, 2)));
      th = Math.max(0.005, th);
    }
    const p = punkt(u, t), n = normalnaBaz(u, t);
    P.push(p[0] + n[0] * th, p[1] + n[1] * th, p[2] + n[2] * th);
    let k = r < 2 ? KOL.czekGora : rr < 0 ? miesz(KOL.czekGora, KOL.czek, 0.5) : KOL.czek;
    if (rr > 0) k = miesz(k, KOL.czekBrzeg, 0.55 * sstep(0.86, 1.0, rr));
    kolory.push(k);
    const [kr, m] = kroplaU(u);
    if (kr && kr.kosc != null && rr > 0) {
      const w = sstep(0.25, 0.85, rr) * m;
      wagi.push([[K.klatka, 1 - w], [K.kr0 + kr.kosc, w]]);
    } else wagi.push([[K.klatka, 1]]);
  }
  const g = siatka(THREE, P, nr, NC, true);
  g.computeVertexNormals();
  b.dodaj(THREE, g, { kol: (p, n, i) => kolory[i], kosc: (p, i) => wagi[i], fx: FX_CZEK, obrys: OB(KOL.obrysC, 0.9) });
  g.dispose();
}
// pozycje kości kropli (góra kropli na narożniku) i końcówki (do odrywania kropel)
function kotwiceKropli() {
  przygotujKrople();
  const tS = tDlaY(D.yS), wynik = [];
  for (const k of KR) {
    if (k.kosc == null) continue;
    const a = punktBaz(k.u, tS), tEnd = tDlaY(D.yS - (0.03 + k.L) * 0.96), e = punktBaz(k.u, tEnd), n = normalnaBaz(k.u, tEnd);
    wynik[k.kosc] = { poz: a, koniec: [e[0] + n[0] * 0.03, e[1] - 0.02, e[2] + n[2] * 0.03], u: k.u, L: k.L };
  }
  return wynik;
}
// bulwiaste krople na końcach strużek (wysokie pole pod strużką daje tylko „szpic" — z kulką czyta się
// jak kapiąca czekolada, a nie jak grzywka). Wagi: kość strużki, więc kulka ciągnie się razem z nią.
function czKulkiKropli(THREE, b, kotw) {
  for (let i = 0; i < kotw.length; i++) {
    const k = kotw[i]; if (!k) continue;
    const yK = D.yS - (0.03 + k.L) + 0.03, t = tDlaY(yK), p = punktBaz(k.u, t), n = normalnaBaz(k.u, t);
    const r = 0.034 + 0.03 * sstep(0.1, 0.5, k.L);
    const g = kula(THREE, 8, 6);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(p[0] + n[0] * r * 0.55, yK - r * 0.25, p[2] + n[2] * r * 0.55),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n[0], 0, n[2]).normalize()),
      new THREE.Vector3(r * 0.95, r * 1.15, r * 0.7));
    b.dodaj(THREE, g, { m, kol: KOL.czek, kosc: K.kr0 + i, fx: FX_CZEK, obrys: OB(KOL.obrysC, 0.8) });
    g.dispose();
  }
}

function czNakretka(THREE, b) {
  // szyjka (pod czekoladą)
  const sz = new THREE.CylinderGeometry(0.112, 0.116, 0.13, 16, 1, true);
  b.dodaj(THREE, sz, { m: macierz(THREE, { t: [0, 1.555, 0] }), kol: KOL.szyjka, kosc: K.klatka, fx: [0, 0.4, 0, 0], obrys: null });
  sz.dispose();
  // nakrętka: pierścień gwarancyjny + karbowany walec + fazowany wierzch
  const prof = [[0.118, 1.598], [0.152, 1.600], [0.158, 1.614], [0.152, 1.630], [0.150, 1.643], [0.160, 1.655], [0.160, 1.800], [0.150, 1.826], [0.118, 1.842], [0.0001, 1.848]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, 32);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 1.652 || y > 1.81) continue;
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
    const k = 1 + 0.075 * Math.cos(a * 16) * sstep(1.652, 1.665, y) * (1 - sstep(1.795, 1.81, y));
    p.setXYZ(i, x / r * r * k, y, z / r * r * k);
  }
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const gm = mergeVerts(THREE, g);
  gm.computeVertexNormals();
  // karbowanie widać też w kolorze: grzbiety jaśniejsze, rowki ciemniejsze (sama geometria ginęła w ciemnym granacie)
  b.dodaj(THREE, gm, {
    kol: q => {
      if (q[1] < 1.645) return KOL.nakrPierscien;
      if (q[1] > 1.81) return KOL.nakrGora;
      return mn(KOL.nakretka, Math.cos(Math.atan2(q[2], q[0]) * 16) > 0 ? 1.45 : 0.78);
    },
    kosc: K.nakretka, fx: [0, 0.5, 0, 0], obrys: OB(KOL.obrysN, 1),
  });
  g.dispose(); gm.dispose();
}
// sklejenie wierzchołków o tych samych pozycjach (szew Lathe) → gładkie normalne bez rysy
function mergeVerts(THREE, g) {
  const p = g.attributes.position, mapa = new Map(), P = [], idx = [];
  const re = [];
  for (let i = 0; i < p.count; i++) {
    const k = Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
    let j = mapa.get(k);
    if (j == null) { j = P.length / 3; mapa.set(k, j); P.push(p.getX(i), p.getY(i), p.getZ(i)); }
    re.push(j);
  }
  const src = g.index ? g.index.array : null, n = src ? src.length : p.count;
  for (let i = 0; i < n; i += 3) {
    const a = re[src ? src[i] : i], b2 = re[src ? src[i + 1] : i + 1], c = re[src ? src[i + 2] : i + 2];
    if (a !== b2 && b2 !== c && a !== c) idx.push(a, b2, c);
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  o.setIndex(idx);
  return o;
}

function czTwarz3D(THREE, b) {
  // nosek: mała wypukła kulka (jaśniejsza od folii, z połyskiem)
  const zf = punktBaz(0.25, tDlaY(TW.nosY))[2];
  const g = kula(THREE, 10, 7);
  b.dodaj(THREE, g, {
    m: macierz(THREE, { t: [0, TW.nosY, zf + 0.004], s: [0.05, 0.043, 0.036] }),
    kol: mn(kolorFolii(TW.nosY), 1.45), kosc: K.klatka, fx: [0, 0.75, 0, 0], obrys: OB(KOL.obrysN, 0.55),
  });
  // kropla czekolady w kąciku ust (wisi pod namalowaną strużką)
  const u = uDlaX(TW.czekX, 'p'), pc = punktBaz(u, tDlaY(TW.czekY - 0.03));
  const g2 = kula(THREE, 9, 6);
  b.dodaj(THREE, g2, {
    m: macierz(THREE, { t: [pc[0], TW.czekY - 0.03, pc[2] + 0.004], s: [0.026, 0.044, 0.02] }),
    kol: KOL.czek, kosc: K.kroplaUsta, fx: FX_CZEK, obrys: OB(KOL.obrysC, 0.6),
  });
  g.dispose(); g2.dispose();
  return { kroplaUsta: [pc[0], TW.czekY, pc[2]] };
}

function czReka(THREE, b, s) {
  // rurka od barku (wewnątrz korpusu) do nadgarstka; wzdłuż +X dla s = 1, −X dla s = −1
  const x0 = 0.345, xL = 0.54, xD = 0.685, L = xD + 0.01 - x0, Y = 0.96;
  const g = kapsula(THREE, [[0, 0.064], [0.08, 0.065], [xL - x0 - 0.04, 0.064], [xL - x0, 0.063], [xL - x0 + 0.04, 0.061], [xD - x0 - 0.04, 0.058], [L, 0.057]], 12);
  g.deleteAttribute('uv');
  const gm = mergeVerts(THREE, g); gm.computeVertexNormals();
  const m = new THREE.Matrix4().makeTranslation(s * x0, Y, 0).multiply(new THREE.Matrix4().makeRotationZ(-s * Math.PI / 2));
  b.dodaj(THREE, gm, {
    m, kol: KOL.reka, fx: [0, 0.3, 0, 0], obrys: OB(KOL.obrysN, 1),
    kosc: p => {
      const d = p[0] * s, we = sstep(xL - 0.045, xL + 0.045, d), wd = sstep(xD - 0.035, xD + 0.01, d);
      return [[RAMIE[s], 1 - we], [LOKIEC[s], we * (1 - wd)], [DLON[s], wd]];
    },
  });
  g.dispose(); gm.dispose();
  // rękawiczka (Myszka Miki): mankiet z wałkiem, pulchna pięść, 3 zgięte palce, kciuk w górę.
  // Lokalnie: ramię wzdłuż +X, kciuk +Y, wnętrze dłoni +Z; strona −X = lustro (det < 0 → Bud odwraca trójkąty)
  const W = new THREE.Matrix4().makeTranslation(s * xD, Y, 0).multiply(new THREE.Matrix4().makeScale(s, 1, 1));
  const czesc = (geo, lok, kol, obr = 1.1) => {
    b.dodaj(THREE, geo, { m: W.clone().multiply(lok), kol, kosc: DLON[s], fx: [0, 0.16, 0, 1], obrys: OB(KOL.obrysB, obr) });
    geo.dispose();
  };
  czesc(new THREE.CylinderGeometry(0.088, 0.07, 0.07, 14, 1, true), macierz(THREE, { t: [0.025, 0, 0], r: [0, 0, -Math.PI / 2] }), KOL.mankiet);
  czesc(new THREE.TorusGeometry(0.086, 0.028, 5, 12), macierz(THREE, { t: [0.062, 0, 0], r: [0, Math.PI / 2, 0] }), KOL.mankiet);
  czesc(kula(THREE, 12, 8), macierz(THREE, { t: [0.17, -0.008, 0.0], s: [0.112, 0.108, 0.1] }), KOL.rekawiczka);
  for (let i = 0; i < 3; i++)
    czesc(kula(THREE, 7, 5), macierz(THREE, { t: [0.25 - i * 0.006, 0.044 - i * 0.054, 0.02], r: [0, 0, 0.1], s: [0.043, 0.036, 0.074] }), KOL.rekawiczka, 0.9);
  czesc(kula(THREE, 8, 6), macierz(THREE, { t: [0.175, 0.118, 0.035], r: [0.12, 0, 0.22], s: [0.044, 0.08, 0.044] }), KOL.rekawiczka, 0.9);
}

const KOSTKA = 0.19;
function czNoga(THREE, b, s) {
  const x = s * 0.2;
  const g = kapsula(THREE, [[0.15, 0.080], [0.20, 0.080], [0.27, 0.082], [0.33, 0.083], [0.38, 0.084], [0.44, 0.085], [0.50, 0.085]], 10);
  g.deleteAttribute('uv');
  const gm = mergeVerts(THREE, g); gm.computeVertexNormals();
  b.dodaj(THREE, gm, {
    m: new THREE.Matrix4().makeTranslation(x, 0, 0), kol: KOL.noga, fx: [0, 0.3, 0, 0], obrys: OB(KOL.obrysN, 1),
    kosc: p => { const wk = 1 - sstep(0.29, 0.37, p[1]), ws = 1 - sstep(0.19, 0.25, p[1]); return [[UDO[s], 1 - wk], [KOLANO[s], wk * (1 - ws)], [STOPA[s], ws]]; },
  });
  g.dispose(); gm.dispose();
  // trampek (lokalnie: kostka w (0, 0, 0), czubek w +Z), BEZ logo
  const W = new THREE.Matrix4().makeTranslation(x, KOSTKA, 0).multiply(new THREE.Matrix4().makeScale(s, 1, 1));
  const czesc = (geo, lok, kol, obr = 1.1, gl = 0.12, jas = 1) => {
    b.dodaj(THREE, geo, { m: W.clone().multiply(lok), kol, kosc: STOPA[s], fx: [0, gl, 0, jas], obrys: obr ? OB(KOL.obrysB, obr) : null });
    geo.dispose();
  };
  // podeszwa: superelipsa n = 2,4 wyciągnięta w pionie, z bieżnikiem i niebieskim paskiem
  {
    const NC = 22, hx = 0.162, hz = 0.29, zc = 0.085, tab = przekroj(hx, hz, 2.4);
    const pier = [[-0.190, 0.93, KOL.bieznik], [-0.181, 1.0, KOL.bieznik], [-0.167, 1.0, KOL.podeszwa], [-0.157, 1.0, KOL.pasek], [-0.147, 1.0, KOL.pasek], [-0.137, 1.0, KOL.podeszwa], [-0.120, 0.965, KOL.podeszwa]];
    const P = [], kk = [];
    for (const [y, sk] of pier) for (let j = 0; j < NC; j++) { const [px, pz] = naPrzekroju(tab, j / NC); P.push(px * sk, y, pz * sk + zc); }
    const nr = pier.length;
    P.push(0, -0.19, zc);   // środek spodu
    const g2 = siatka(THREE, P.slice(0, nr * NC * 3), nr, NC);
    const I = Array.from(g2.index.array);
    for (let j = 0; j < NC; j++) I.push(nr * NC, j, (j + 1) % NC);
    g2.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g2.setIndex(I); g2.computeVertexNormals();
    // kolor wg pierścienia (q po przekształceniu W: y świata = y lokalne + KOSTKA)
    czesc(g2, new THREE.Matrix4(), q => { let best = pier[0]; for (const pr of pier) if (q[1] - KOSTKA >= pr[0] - 0.0035) best = pr; return best[2]; }, 1.1, 0.1, 0.6);
  }
  // cholewka: górna część elipsoidy, nosek nieco szarszy z szwem
  const UY = -0.118, UR = [0.148, 0.14, 0.25], UZ = 0.075;
  czesc(kula(THREE, 14, 8, { do: Math.PI * 0.62 }), macierz(THREE, { t: [0, UY, UZ], s: UR }),
    q => { const zl = q[2]; return zl > 0.195 && zl < 0.212 ? KOL.butSzew : zl >= 0.212 ? KOL.butNosek : KOL.but; });
  // kołnierz wokół kostki + ciemne wnętrze
  czesc(new THREE.TorusGeometry(0.088, 0.028, 5, 12), macierz(THREE, { t: [0, 0.0, -0.05], r: [Math.PI / 2, 0, 0] }), KOL.but);
  czesc(new THREE.CircleGeometry(0.08, 12), macierz(THREE, { t: [0, 0.004, -0.05], r: [-Math.PI / 2, 0, 0] }), KOL.wnetrzeButa, 0, 0, 0);
  // sznurówki (ciemnoniebieskie, w kolor postaci)
  for (const z of [0.045, 0.105, 0.165]) {
    const y = UY + UR[1] * Math.sqrt(Math.max(0, 1 - Math.pow((z - UZ) / UR[2], 2))) + 0.003;
    czesc(kula(THREE, 6, 3), macierz(THREE, { t: [0, y, z], r: [-0.25 - (z - 0.045) * 2.0, 0, 0], s: [0.07, 0.014, 0.02] }), KOL.sznurowka, 0.5, 0.3, 0);
  }
}

// ============================== ATLAS TWARZY (canvas) ==============================
// komórki 256 px, siatka 4×3: 0 otwarte · 1 mrug · 2 zacisniete · 3 auc · 4 smierc · 5 radosc · 6 oczko · 7 wow ·
// 8 TĘCZÓWKI (warstwa przesuwana) · 9 PLECY (etykieta z kodem kreskowym)
export const TWARZE = { otwarte: 0, mrug: 1, zacisniete: 2, auc: 3, smierc: 4, radosc: 5, oczko: 6, wow: 7 };
const KT = { kontur: '#1a1236', brew: '#5a2e14', usta: '#5e1426', gardlo: '#360917', zab: '#fffdf6', jez: '#ff6d97', jezJ: '#ffa2c2', rum: '255,108,152', czek: '#4b220e', czekJ: '#9a5a36' };
const pxX = x => (x + FW) * PXJ, pxY = y => (FY0 + FH - y) * PXJ;
const EX = [pxX(-TW.okoX), pxX(TW.okoX)], EY = pxY(TW.okoY);
function rysujAtlas(THREE) {
  const S = 256, c = document.createElement('canvas'); c.width = S * 4; c.height = S * 3;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const kom = (idx, fn) => {
    g.save(); g.translate((idx % 4) * S, Math.floor(idx / 4) * S);
    g.beginPath(); g.rect(6, 6, S - 12, S - 12); g.clip();
    g.lineCap = 'round'; g.lineJoin = 'round';
    fn(g); g.restore();
  };
  kom(0, g => { rumience(g); brwi(g, 'zwykle'); bialka(g); usta(g, 'usmiech'); czekUsta(g); });
  kom(1, g => { rumience(g); brwi(g, 'zwykle'); for (const x of EX) okoZamkniete(g, x, EY, 'mrug'); usta(g, 'usmiech'); czekUsta(g); });
  kom(2, g => { rumience(g, 0.4); brwi(g, 'zle'); for (let i = 0; i < 2; i++) okoZmruzone(g, EX[i], EY, i ? 1 : -1); usta(g, 'zeby'); czekUsta(g); });
  kom(3, g => { rumience(g, 0.4); brwi(g, 'smutne'); okoKrzyw(g, EX[0], EY, 1); okoKrzyw(g, EX[1], EY, -1); usta(g, 'auc'); czekUsta(g); });
  kom(4, g => { brwi(g, 'smutne', 0.7); for (const x of EX) okoX(g, x, EY); usta(g, 'smierc'); czekUsta(g); });
  kom(5, g => { rumience(g, 0.8, 1.2); brwi(g, 'wysoko'); for (const x of EX) okoZamkniete(g, x, EY, 'radosc'); usta(g, 'duzy'); czekUsta(g); iskry(g); });
  kom(6, g => { rumience(g, 0.7); brwi(g, 'oczko'); bialko(g, EX[0], EY); okoZamkniete(g, EX[1], EY, 'radosc'); usta(g, 'usmiech'); czekUsta(g); });
  kom(7, g => { rumience(g, 0.5); brwi(g, 'wysoko'); bialko(g, EX[0], EY, 34, 40); bialko(g, EX[1], EY, 34, 40); usta(g, 'o'); czekUsta(g); });
  kom(8, g => { for (const x of EX) teczowka(g, x, EY + 4); });
  kom(9, g => etykieta(g));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true; t.anisotropy = 4;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  t.userData.canvas = c;
  return t;
}
function bialko(g, x, y, rx = 31, ry = 36) {
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 5; g.strokeStyle = KT.kontur; g.stroke();
}
function bialka(g) { for (const x of EX) bialko(g, x, EY); }
function teczowka(g, x, y) {
  const r = 20;
  const gr = g.createRadialGradient(x, y + 7, 2, x, y, r);
  gr.addColorStop(0, '#d6914c'); gr.addColorStop(0.55, '#9a5524'); gr.addColorStop(1, '#4a250d');
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = gr; g.fill();
  g.lineWidth = 2.5; g.strokeStyle = '#2a1408'; g.stroke();
  g.beginPath(); g.arc(x, y + 1, 11, 0, TAU); g.fillStyle = '#0b0710'; g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(x - 7, y - 8, 7, 0, TAU); g.fill();
  g.beginPath(); g.arc(x + 7.5, y + 7.5, 3.4, 0, TAU); g.fill();
}
function okoZamkniete(g, x, y, typ) {
  g.strokeStyle = KT.kontur; g.lineWidth = 7; g.beginPath();
  if (typ === 'mrug') {                 // powieka opuszczona: łuk w dół + rzęsa
    g.moveTo(x - 27, y + 4); g.quadraticCurveTo(x, y + 20, x + 27, y + 4); g.stroke();
    g.lineWidth = 4; const s = x < 128 ? -1 : 1;
    g.beginPath(); g.moveTo(x + s * 25, y + 6); g.lineTo(x + s * 34, y + 1); g.stroke();
  } else {                              // ^ radość
    g.moveTo(x - 25, y + 10); g.quadraticCurveTo(x, y - 22, x + 25, y + 10); g.stroke();
  }
}
function okoZmruzone(g, x, y, s) {      // s: −1 lewe (wewnątrz = prawo), 1 prawe
  const wew = x - s * 34, zew = x + s * 34;
  g.save();
  g.beginPath(); g.moveTo(zew, y - 20); g.lineTo(wew, y - 2); g.lineTo(wew, y + 60); g.lineTo(zew, y + 60); g.closePath();
  g.clip();
  g.beginPath(); g.ellipse(x, y + 2, 31, 30, 0, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
  g.lineWidth = 5; g.strokeStyle = KT.kontur; g.stroke();
  g.restore();
  g.lineWidth = 7; g.strokeStyle = KT.kontur;
  g.beginPath(); g.moveTo(zew + s * 2, y - 21); g.lineTo(wew - s * 2, y - 1); g.stroke();
}
function okoKrzyw(g, x, y, s) {         // > <   (s = 1 → „>")
  g.strokeStyle = KT.kontur; g.lineWidth = 8;
  g.beginPath(); g.moveTo(x - s * 16, y - 17); g.lineTo(x + s * 14, y); g.lineTo(x - s * 16, y + 17); g.stroke();
}
function okoX(g, x, y) {
  g.strokeStyle = KT.kontur; g.lineWidth = 8;
  g.beginPath(); g.moveTo(x - 17, y - 17); g.lineTo(x + 17, y + 17); g.moveTo(x + 17, y - 17); g.lineTo(x - 17, y + 17); g.stroke();
}
function brwi(g, typ, alfa = 1) {
  g.save(); g.globalAlpha = alfa; g.strokeStyle = KT.brew; g.lineWidth = 9;
  EX.forEach((x, i) => {
    const s = i ? 1 : -1, wew = x - s * 22, zew = x + s * 25;
    let yW = 31, yZ = 33, yM = 21;
    if (typ === 'zle') { yW = 44; yZ = 25; yM = 30; }
    else if (typ === 'smutne') { yW = 22; yZ = 36; yM = 25; }
    else if (typ === 'wysoko') { yW = 20; yZ = 23; yM = 9; }
    else if (typ === 'oczko' && i === 1) { yW = 40; yZ = 38; yM = 32; }
    g.beginPath(); g.moveTo(zew, yZ); g.quadraticCurveTo(x, yM, wew, yW); g.stroke();
  });
  g.restore();
}
function rumience(g, a = 0.78, sk = 1) {
  for (const x of [pxX(-0.30), pxX(0.30)]) {
    const y = pxY(0.945), gr = g.createRadialGradient(x, y, 1, x, y, 26 * sk);
    gr.addColorStop(0, `rgba(${KT.rum},${a})`); gr.addColorStop(0.6, `rgba(${KT.rum},${a * 0.75})`); gr.addColorStop(1, `rgba(${KT.rum},0)`);
    g.save(); g.translate(x, y); g.scale(1, 0.55); g.translate(-x, -y);
    g.beginPath(); g.arc(x, y, 26 * sk, 0, TAU); g.fillStyle = gr; g.fill(); g.restore();
    g.strokeStyle = `rgba(255,255,255,${0.75 * a})`; g.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x - 9 + i * 7, y + 4); g.lineTo(x - 5 + i * 7, y - 4); g.stroke(); }
  }
}
function usta(g, typ) {
  const cx = 128;
  g.lineWidth = 5; g.strokeStyle = KT.kontur;
  if (typ === 'usmiech' || typ === 'duzy') {
    const w = typ === 'duzy' ? 58 : 50, y0 = 146, dol = typ === 'duzy' ? 214 : 199;
    const sciezka = () => {
      g.beginPath(); g.moveTo(cx - w, y0 - 5);
      g.quadraticCurveTo(cx, y0 + 9, cx + w, y0 - 5);
      g.bezierCurveTo(cx + w - 4, dol - 6, cx - w + 4, dol - 6, cx - w, y0 - 5); g.closePath();
    };
    sciezka(); g.fillStyle = KT.usta; g.fill();
    g.save(); sciezka(); g.clip();
    g.fillStyle = KT.gardlo; g.beginPath(); g.ellipse(cx, y0 + 26, w * 0.55, 14, 0, 0, TAU); g.fill();
    g.fillStyle = KT.zab; g.beginPath(); g.moveTo(cx - w - 6, y0 - 14); g.lineTo(cx + w + 6, y0 - 14);
    g.lineTo(cx + w + 6, y0 + 1); g.quadraticCurveTo(cx, y0 + 25, cx - w - 6, y0 + 1); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(120,120,150,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, y0 + 4); g.lineTo(cx, y0 + 15); g.stroke();
    g.fillStyle = KT.jez; g.beginPath(); g.ellipse(cx + 5, dol - 12, w * 0.6, 21, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(200,60,100,0.6)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx + 5, dol - 26); g.lineTo(cx + 5, dol - 14); g.stroke();
    g.fillStyle = KT.jezJ; g.beginPath(); g.ellipse(cx - 9, dol - 23, w * 0.2, 5, -0.15, 0, TAU); g.fill();
    g.restore();
    g.lineWidth = 5; g.strokeStyle = KT.kontur; sciezka(); g.stroke();
    g.lineWidth = 4;
    for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * (w + 4), y0 - 9, 6, s > 0 ? 2.2 : -0.9, s > 0 ? 3.9 : 0.9); g.stroke(); }
  } else if (typ === 'zeby') {
    const x0 = cx - 50, y0 = 146, w = 100, h = 34, r = 13;
    g.beginPath(); g.roundRect(x0, y0, w, h, r); g.fillStyle = KT.zab; g.fill();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(40,30,70,0.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x0, y0 + h / 2); g.lineTo(x0 + w, y0 + h / 2);
    for (let i = 1; i < 6; i++) { g.moveTo(x0 + i * w / 6, y0); g.lineTo(x0 + i * w / 6, y0 + h); }
    g.stroke(); g.restore();
    g.lineWidth = 5; g.strokeStyle = KT.kontur; g.beginPath(); g.roundRect(x0, y0, w, h, r); g.stroke();
  } else if (typ === 'auc') {
    const sc = () => { g.beginPath(); g.moveTo(cx - 34, 160); g.bezierCurveTo(cx - 20, 140, cx + 20, 140, cx + 36, 158); g.bezierCurveTo(cx + 30, 200, cx - 28, 202, cx - 34, 160); g.closePath(); };
    sc(); g.fillStyle = KT.usta; g.fill();
    g.save(); sc(); g.clip();
    g.fillStyle = KT.zab; g.fillRect(cx - 40, 140, 80, 18);
    g.fillStyle = KT.jez; g.beginPath(); g.ellipse(cx + 2, 192, 26, 13, 0, 0, TAU); g.fill();
    g.restore();
    sc(); g.stroke();
  } else if (typ === 'smierc') {
    g.lineWidth = 6;
    g.beginPath(); g.moveTo(cx - 44, 164);
    for (let i = 1; i <= 8; i++) g.lineTo(cx - 44 + i * 11, 164 + (i % 2 ? -7 : 5));
    g.stroke();
    // język na wierzchu, wywalony w bok
    const jx = cx + 18, jy = 168;
    g.beginPath(); g.moveTo(jx - 15, jy - 2); g.lineTo(jx - 15, jy + 16); g.arc(jx, jy + 16, 15, Math.PI, 0, true); g.lineTo(jx + 15, jy - 2); g.closePath();
    g.fillStyle = KT.jez; g.fill(); g.lineWidth = 4.5; g.stroke();
    g.strokeStyle = 'rgba(200,60,100,0.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(jx, jy + 2); g.lineTo(jx, jy + 18); g.stroke();
  } else if (typ === 'o') {
    g.beginPath(); g.ellipse(cx, 170, 17, 21, 0, 0, TAU); g.fillStyle = KT.usta; g.fill();
    g.save(); g.clip(); g.fillStyle = KT.jez; g.beginPath(); g.ellipse(cx, 188, 14, 9, 0, 0, TAU); g.fill(); g.restore();
    g.beginPath(); g.ellipse(cx, 170, 17, 21, 0, 0, TAU); g.stroke();
  }
}
function czekUsta(g) {                   // czekolada w kąciku ust (prawy z widza), ze strużką do kropli 3D
  const x = pxX(TW.czekX), y0 = 146, y1 = pxY(TW.czekY) - 2;
  g.fillStyle = KT.czek;
  g.beginPath(); g.ellipse(x - 2, y0 - 2, 13, 9, -0.4, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(x - 7, y0); g.quadraticCurveTo(x - 6, (y0 + y1) / 2, x - 5, y1); g.lineTo(x + 6, y1); g.quadraticCurveTo(x + 6, (y0 + y1) / 2, x + 8, y0); g.closePath(); g.fill();
  g.beginPath(); g.arc(x, y1, 7, 0, TAU); g.fill();
  g.fillStyle = KT.czekJ; g.beginPath(); g.ellipse(x - 5, y0 - 5, 4, 2.4, -0.4, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,240,225,0.8)'; g.beginPath(); g.arc(x - 2, y0 + 16, 1.8, 0, TAU); g.fill();
}
function iskry(g) {                     // w wolnych miejscach między oczami a strużkami (wyżej chowały się pod czekoladą)
  g.fillStyle = '#ffffff'; g.strokeStyle = KT.kontur; g.lineWidth = 2;
  for (const [x, y, r] of [[18, 150, 9], [238, 160, 8], [30, 182, 5]]) {
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, rr = i % 2 ? r * 0.32 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill(); g.stroke();
  }
}
function etykieta(g) {                   // tył: etykieta produktu z „tabelą wartości" i kodem kreskowym
  const x0 = 46, y0 = 52, w = 164, h = 158;
  g.fillStyle = '#f6f0e1'; g.beginPath(); g.roundRect(x0, y0, w, h, 14); g.fill();
  g.lineWidth = 4; g.strokeStyle = '#1d2a66'; g.stroke();
  g.fillStyle = '#4b220e'; g.beginPath(); g.roundRect(x0 + 4, y0 + 4, w - 8, 22, [10, 10, 0, 0]); g.fill();
  g.fillStyle = '#f6f0e1';
  for (let i = 0; i < 5; i++) g.fillRect(x0 + 14 + i * 28, y0 + 12, 18, 6);
  g.fillStyle = '#8b8577';
  const dl = [118, 92, 128, 76, 104];
  dl.forEach((d, i) => { g.fillRect(x0 + 14, y0 + 36 + i * 13, d, 6); g.fillRect(x0 + w - 34, y0 + 36 + i * 13, 20, 6); });
  // kropla czekolady (znak firmowy)
  const kx = x0 + w - 24, ky = y0 + 36;
  g.fillStyle = '#4b220e'; g.beginPath(); g.moveTo(kx, ky); g.bezierCurveTo(kx + 11, ky + 13, kx + 11, ky + 24, kx, ky + 25);
  g.bezierCurveTo(kx - 11, ky + 24, kx - 11, ky + 13, kx, ky); g.fill();
  g.fillStyle = '#ffffff'; g.fillRect(x0 + 18, y0 + 104, w - 36, 46);
  let x = x0 + 24, r = 9;
  g.fillStyle = '#111111';
  while (x < x0 + w - 26) { r = (r * 16807) % 2147483647; const sz = 1.5 + (r % 4); g.fillRect(x, y0 + 108, sz, 32); x += sz + 1.5 + ((r >> 4) % 3); }
  g.fillStyle = '#333333';
  for (let i = 0; i < 12; i++) g.fillRect(x0 + 26 + i * 9.5, y0 + 143, 6, 4);
}

// ============================== MATERIAŁ ==============================
// o.twarz — atlas; o.chmury — { tex: { value }, off: { value }, skala }; o.czastki — wersja dla InstancedMesh kropel
export function materialCzekotubki(THREE, o = {}) {
  const pas = [0.66, 0.30, 0.34], progi = [-0.12, 0.08, 0.28, 0.48], ton = [0.80, 0.87, 1.10];
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const U = {
    uTw: { value: o.twarz || null }, uKom: { value: new THREE.Vector2(0, 2) }, uOko: { value: new THREE.Vector2() },
    uBlysk: { value: 0 }, uObrys: { value: 0.004 }, uObrysD: { value: 0.0017 },
  };
  if (o.chmury) { U.uCloud = o.chmury.tex; U.uCloudOff = o.chmury.off; U.uChmury = { value: 1 }; }
  const defs = {};
  if (o.chmury) defs.CZ_CHMURY = '';
  if (o.czastki) defs.CZ_CZASTKI = '';
  mat.defines = defs;
  const skala = ((o.chmury && o.chmury.skala) || 0.016).toFixed(5);
  const f = v => v.toFixed(4);
  mat.userData.U = U;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = `attribute vec4 aFx; uniform float uObrys, uObrysD; varying vec4 vFx; varying vec3 vRest; varying vec3 vSkW;
      ` + sh.vertexShader
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        vFx = aFx; vRest = position;
        if (aFx.z > 0.0) {                         // kontur: odsunięcie PO skinningu, grubość rośnie z odległością
          vec4 _mv = modelViewMatrix * vec4(transformed, 1.0);
          transformed += normalize(objectNormal) * aFx.z * (uObrys + uObrysD * max(0.0, -_mv.z));
        }`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vec4 _sw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          _sw = instanceMatrix * _sw;
        #endif
        vSkW = (modelMatrix * _sw).xyz;`);
    const chunk = 'float _cienSw = 1.0;\n' + THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
      'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
      `float rawNL = dot( geometryNormal, directLight.direction );
       float _b1 = smoothstep( ${f(progi[0])}, ${f(progi[1])}, rawNL );
       float _b2 = smoothstep( ${f(progi[2])}, ${f(progi[3])}, rawNL );
       float dotNL = ${f(pas[0])} + ${f(pas[1])} * _b1 + ${f(pas[2])} * _b2;
       dotNL = mix( ${f(pas[0])}, dotNL, _cienSw );`)
      .replace('vec3 irradiance = dotNL * directLight.color;',
        `vec3 irradiance = dotNL * directLight.color * mix( vec3( ${f(ton[0])}, ${f(ton[1])}, ${f(ton[2])} ), vec3( 1.0 ), _cienSw * _b1 );`);
    let fs = sh.fragmentShader.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
      'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]',
      '_cienSw = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]'));
    fs = `uniform sampler2D uTw; uniform vec2 uKom; uniform vec2 uOko; uniform float uBlysk;
      varying vec4 vFx; varying vec3 vRest; varying vec3 vSkW;
      #ifdef CZ_CHMURY
        uniform sampler2D uCloud; uniform vec2 uCloudOff; uniform float uChmury;
      #endif
      ` + fs
      .replace('#include <lights_lambert_pars_fragment>', chunk)
      .replace('#include <color_fragment>', `#include <color_fragment>
        #ifndef CZ_CZASTKI
        if ( vFx.x > 0.5 ) {                       // twarz (przód) / etykieta (tył) z atlasu, wg pozycji spoczynkowej
          float _str = vRest.z >= 0.0 ? 1.0 : -1.0;
          vec2 _uv = vec2( ( vRest.x * _str + ${f(FW)} ) / ${f(2 * FW)}, ( vRest.y - ${f(FY0)} ) / ${f(FH)} );
          if ( _uv.x > 0.0 && _uv.x < 1.0 && _uv.y > 0.0 && _uv.y < 1.0 ) {
            const vec2 _KS = vec2( 0.25, 1.0 / 3.0 );
            vec2 _c = _str > 0.0 ? uKom : vec2( 1.0, 0.0 );
            vec4 _b = texture2D( uTw, ( _c + _uv ) * _KS );
            if ( _str > 0.0 ) {                    // tęczówki: osobna warstwa przesuwana uOko, tylko na białku
              float _bia = smoothstep( 0.86, 0.97, min( _b.r, min( _b.g, _b.b ) ) );
              vec4 _t = texture2D( uTw, clamp( _uv - uOko, 0.004, 0.996 ) * _KS );
              _b.rgb = mix( _b.rgb, _t.rgb + _b.rgb * ( 1.0 - _t.a ), _bia );
            }
            diffuseColor.rgb = _b.rgb + diffuseColor.rgb * ( 1.0 - _b.a );
          }
        }
        #endif`)
      .replace('#include <opaque_fragment>', `
        vec3 _V = normalize( vViewPosition );
        vec3 _N = normal;
        float _gl = vFx.y, _cz = step( 0.9, _gl );
        #if NUM_DIR_LIGHTS > 0
          vec3 _H = normalize( directionalLights[ 0 ].direction + _V );
          // czekolada: normalna do połysku zaburzona wzorem z pozycji spoczynkowej — na płaskim wierzchu
          // jeden blask rozpada się na kilka „lanych" odblasków (geometria tam jest prawie płaska)
          vec3 _Nc = _N;
          if ( _cz > 0.5 ) {
            vec3 _q = vRest * 29.0;
            _Nc = normalize( _N + 0.3 * vec3( sin( _q.x + 1.7 * sin( _q.z * 0.7 ) ), 0.6 * sin( _q.z * 1.3 + _q.y * 0.6 ), sin( _q.y * 1.1 - _q.x * 0.8 + 0.6 * sin( _q.z ) ) ) );
          }
          float _nh = dot( _Nc, _H );
          // ostry blask słońca w WĄSKIM stożku (szeroki zalewał cały zaokrąglony narożnik kremową plamą);
          // czekolada: ostry biały punkt + miękki ciepły połysk wokół (mokra), folia: sam ostry punkt
          float _sp = smoothstep( mix( 0.962, 0.9885, _cz ), mix( 0.974, 0.9915, _cz ), _nh );
          float _mk = smoothstep( 0.82, 0.985, _nh ) * _cz;
          vec3 _sw = directionalLights[ 0 ].color * mix( 0.35, 1.0, _cienSw );
          outgoingLight += _sp * _gl * mix( 0.42, 1.1, _cz ) * _sw;
          outgoingLight += _mk * 0.10 * _sw * vec3( 0.95, 0.62, 0.42 );
        #endif
        // pionowy pasek odbicia „ze studia" (w przestrzeni widoku, z lewej) + słabszy z prawej — folia i czekolada błyszczą
        float _st = smoothstep( -0.78, -0.72, _N.x ) * ( 1.0 - smoothstep( -0.56, -0.50, _N.x ) ) * smoothstep( -0.45, 0.1, _N.y );
        _st += 0.5 * smoothstep( 0.42, 0.47, _N.x ) * ( 1.0 - smoothstep( 0.53, 0.58, _N.x ) ) * smoothstep( -0.3, 0.2, _N.y );
        outgoingLight += _st * _gl * mix( 0.62, 0.34, _cz ) * vec3( 0.88, 0.95, 1.0 );
        // jasne pasmo na sylwetce + biel „świeci" własnym światłem (rękawiczki i trampki mają być BIAŁE, nie szare)
        float _rim = smoothstep( 0.62, 0.92, 1.0 - saturate( dot( _N, _V ) ) );
        outgoingLight += _rim * 0.24 * diffuseColor.rgb;
        outgoingLight += diffuseColor.rgb * vFx.w * 0.30;
        outgoingLight = mix( outgoingLight, vec3( 1.0 ), uBlysk * ( 1.0 - step( 0.0001, vFx.z ) ) );
        if ( vFx.z > 0.0 ) outgoingLight = diffuseColor.rgb;   // kontur: bez światła
        #include <opaque_fragment>`)
      .replace('#include <fog_fragment>', `
        #ifdef CZ_CHMURY
          float _cs = texture2D( uCloud, vSkW.xz * ${skala} + uCloudOff ).r;
          gl_FragColor.rgb *= mix( 1.0, mix( 0.74, 1.04, _cs ), uChmury );
        #endif
        #include <fog_fragment>`);
    sh.fragmentShader = fs;
  };
  const klucz = 'czekotubka-v1|' + (o.czastki ? 'c' : 'p') + (o.chmury ? '|ch' : '');
  mat.customProgramCacheKey = () => klucz;
  return mat;
}

// ============================== EFEKTY: KROPLE CZEKOLADY ==============================
// jedna InstancedMesh w układzie świata: strumień przy ataku, krople odrywające się od strużek,
// plamy na ziemi, kałuża przy śmierci. Instancje bez obiektów three w pętli (zero alokacji).
class Krople {
  constructor(THREE, mat, cap = 160, ziarno = 3) {
    this.THREE = THREE; this.cap = cap; this.los = prng(ziarno);
    const g = new THREE.SphereGeometry(1, 10, 7);
    const n = g.attributes.position.count, kol = new Float32Array(n * 3), fx = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { kol.set(KOL.czek, i * 3); fx[i * 4 + 1] = 1; }
    g.setAttribute('color', new THREE.BufferAttribute(kol, 3)); g.setAttribute('aFx', new THREE.BufferAttribute(fx, 4));
    this.geo = g;
    this.mesh = new THREE.InstancedMesh(g, mat, cap);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.name = 'czekotubka-krople';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.cz = []; this.wolne = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._y = new THREE.Vector3(0, 1, 0); this._d = new THREE.Vector3(); this._c = new THREE.Color();
  }
  // typ: 0 lot, 1 plama, 2 kałuża (rośnie do r)
  // obiekty kropli z puli (bez alokacji po rozgrzaniu)
  emituj(x, y, z, vx, vy, vz, r, ziemia, typ = 0) {
    if (this.cz.length >= this.cap) this.wolne.push(this.cz.shift());
    const p = this.wolne.pop() || {};
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.r = r; p.rs = r; p.ziemia = ziemia; p.typ = typ;
    p.t = 0; p.jas = 0.82 + this.los() * 0.3; p.znika = null;
    this.cz.push(p);
    return p;
  }
  _usun(i) { this.wolne.push(this.cz[i]); this.cz.splice(i, 1); }
  update(dt, ziemiaFn) {
    const cz = this.cz;
    for (let i = cz.length - 1; i >= 0; i--) {
      const p = cz[i];
      p.t += dt;
      if (p.typ === 0) {
        p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const gy = ziemiaFn ? ziemiaFn(p.x, p.z) : p.ziemia;
        if (p.y <= gy + p.r * 0.3) { p.typ = 1; p.t = 0; p.y = gy; p.rs = p.r * (1.8 + this.los() * 0.9); }
        if (p.t > 4) { this._usun(i); continue; }
      } else if (p.typ === 1) {
        if (p.t > 2.2) { this._usun(i); continue; }
      } else if (p.typ === 2) {
        if (p.znika != null && p.t - p.znika > 0.8) { this._usun(i); continue; }
      }
    }
    const m = this.mesh;
    let n = 0;
    for (const p of cz) {
      if (p.typ === 0) {
        const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
        this._d.set(p.vx / sp, p.vy / sp, p.vz / sp); this._q.setFromUnitVectors(this._y, this._d);
        const ro = Math.min(1, p.t * 16);
        this._s.set(p.r * ro, p.r * ro * (1 + Math.min(3.0, sp * 0.34)), p.r * ro);
        this._v.set(p.x, p.y, p.z);
      } else {
        const wzrost = p.typ === 2 ? sstep(0, 2.2, p.t) : sstep(0, 0.1, p.t);
        const znik = p.typ === 1 ? 1 - sstep(1.5, 2.2, p.t) : p.znika != null ? 1 - sstep(0, 0.8, p.t - p.znika) : 1;
        const r = p.t < 0 ? 0 : p.rs * (p.typ === 2 ? 0.12 + 0.88 * wzrost : 0.55 + 0.45 * wzrost) * znik;
        this._q.identity(); this._s.set(r, Math.max(0.004, r * (p.typ === 2 ? 0.045 : 0.16)), r * (p.typ === 2 ? 0.86 : 1));
        this._v.set(p.x, p.y + 0.004, p.z);
      }
      this._m.compose(this._v, this._q, this._s);
      m.setMatrixAt(n, this._m); m.setColorAt(n, this._c.setScalar(p.jas));
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  wyczysc() { for (const p of this.cz) this.wolne.push(p); this.cz.length = 0; this.mesh.count = 0; }
  dispose() { this.geo.dispose(); }
}

// ============================== ANIMACJA: POZY ==============================
// Poza = Float32Array(NB × 9): [rx, ry, rz, px, py, pz, sx−1, sy−1, sz−1] — PRZYROSTY od pozycji spoczynkowej.
// Każda funkcja pozy zapisuje PEŁNĄ pozę (z bazą: ręce opuszczone), więc mieszanie wagami sumującymi się
// do 1 jest zwykłą sumą ważoną. Warstwy (atak, oberwał, gest kciuka) nakłada się później.
const KAN = 9;
// stałe tablice dla pętli w pozach (literały [1, −1] w funkcjach wołanych co klatkę = alokacje)
const STRONY = [1, -1];
const KOSCI_RAK = [K.ramieL, K.lokiecL, K.dlonL, K.ramieP, K.lokiecP, K.dlonP], KOSCI_RAKI_P = [K.ramieP, K.lokiecP, K.dlonP];
const R = (P, k, x, y, z) => { const o = k * KAN; P[o] += x; P[o + 1] += y; P[o + 2] += z; };
const T = (P, k, x, y, z) => { const o = k * KAN + 3; P[o] += x; P[o + 1] += y; P[o + 2] += z; };
const S = (P, k, x, y, z) => { const o = k * KAN + 6; P[o] += x; P[o + 1] += y; P[o + 2] += z; };
// ręka: dol = opuszczenie od poziomu, przod = wymach w przód, skret = obrót ramienia wokół osi,
// zgiecie = łokieć (przedramię w stronę wnętrza dłoni / przodu), d* = obroty dłoni (dx = obrót kciuka wokół przedramienia)
function reka(P, s, dol, przod, skret = 0, zgiecie = 0, dx = 0, dy = 0, dz = 0) {
  R(P, RAMIE[s], skret, -przod * s, -dol * s);
  R(P, LOKIEC[s], 0, -zgiecie * s, 0);
  R(P, DLON[s], dx, dy * s, dz * s);
}
// noga: biodro (− = w przód), kolano (+ = goleń w tył), stopa (− = czubek w górę), rozkrok
function noga(P, s, biodro, kolano, stopa, rozkrok = 0) {
  R(P, UDO[s], biodro, 0, rozkrok * s);
  R(P, KOLANO[s], kolano, 0, 0);
  R(P, STOPA[s], stopa, 0, -rozkrok * s);
}
// Pozy rąk BEZWZGLĘDNE (obrót od pozy wiązania: ręka pozioma wzdłuż ±X, kciuk w górę, wnętrze dłoni w przód).
// Wyliczone z kolejności YZX: kierunek ramienia = Ry(−przód)·Rz(−dół)·X, łokieć zgina w lokalne +Z,
// dx obraca pięść wokół przedramienia. Spoczynek: przedramiona w przód na wysokości brzucha, KCIUKI W GÓRĘ
// (znak rozpoznawczy z referencji — widać je w każdej pozie, nie tylko w geście).
// dx kciuka w górę: tg(dx) = sin(zg)·tg(dol); pięści lekko na zewnątrz, żeby rękawiczki było widać też z kamery gry (z tyłu)
const RB = { dol: 1.12, przod: 0.12, skret: 0, zg: 0.95, dx: 1.03 };
const R_KCIUK = { dol: 0.25, przod: 0.75, skret: 0, zg: 0.95, dx: 0.0 };    // pięść na wysokości barku, kciuk w górę
const R_ZAMACH = { dol: 0.35, przod: -0.15, skret: 0.6, zg: 0.5, dx: 0.9 };  // atak: wdech, łokcie w górę i w tył
const R_SCISK = { dol: 0.7, przod: 0.15, skret: 1.57, zg: 1.1, dx: 0.0 };    // atak: pięści dociskają boki tubki
function rekaPoza(P, s, a, k = 1, dPrzod = 0) { reka(P, s, a.dol * k, (a.przod + dPrzod) * k, a.skret * k, a.zg * k, a.dx * k); }
function baza(P) { for (const s of STRONY) rekaPoza(P, s, RB); }
// kciuk w górę (gest, wygrana): przyrost od bazy do R_KCIUK
function kciukWGore(P, s, k = 1, pomp = 0) {
  reka(P, s, (R_KCIUK.dol - RB.dol) * k, (R_KCIUK.przod + pomp - RB.przod) * k, (R_KCIUK.skret - RB.skret) * k, (R_KCIUK.zg - RB.zg) * k, (R_KCIUK.dx - RB.dx) * k);
}
const L_NOGI = 0.27;

function pozaIdle(P, t, st) {
  baza(P);
  const b = Math.sin(t * TAU / 2.9);
  S(P, K.korpus, -0.011 * b, 0.024 * b, -0.011 * b);
  R(P, K.korpus, 0.012 * Math.sin(t * 0.7), 0, 0.014 * Math.sin(t * 0.53));
  R(P, K.klatka, 0.02 * Math.sin(t * 0.8 + 1), st.patrzYaw, 0.012 * Math.sin(t * 0.61));
  for (const s of STRONY) reka(P, s, 0.05 * b, 0.04 * Math.sin(t * 0.9 + s), 0, 0.06 * b);
  R(P, K.nakretka, 0.02 * Math.sin(t * 1.1), 0, 0.035 * Math.sin(t * 1.3 + 0.4));
  for (let i = 0; i < 6; i++) S(P, K.kr0 + i, 0, 0.05 * Math.sin(t * 1.6 + i * 1.7), 0);
  S(P, K.kroplaUsta, 0, 0.08 * Math.sin(t * 2.1), 0);
  T(P, K.biodra, 0.012 * Math.sin(t * 0.45), 0, 0);
}
function pozaChod(P, f, a) {
  baza(P);
  const s = Math.sin(f), c = Math.cos(f), Ah = 0.5 * a;
  for (const st of STRONY) {
    const sl = st > 0 ? s : -s, cl = st > 0 ? c : -c;
    const kol = 0.95 * a * Math.pow(Math.max(0, cl), 1.4);
    const bio = -Ah * sl - kol * 0.35;
    const stopa = -(bio + kol) + 0.32 * a * (sl < 0 && cl < 0 ? -sl * 0.9 : 0) - 0.22 * a * Math.max(0, sl) * Math.max(0, -cl);
    noga(P, st, bio, kol, stopa, 0.02);
    reka(P, st, 0.06 * a, -0.48 * a * sl, 0, 0.12 * a + 0.12 * a * Math.max(0, -sl));
  }
  T(P, K.biodra, -0.026 * c * a, L_NOGI * (Math.cos(Ah * Math.abs(s)) - 1) + 0.016 * a * Math.cos(2 * f), 0);
  R(P, K.biodra, 0, 0.11 * a * s, 0);
  R(P, K.korpus, 0.05 + 0.05 * a, -0.05 * a * s, 0.085 * a * c);          // kołysanie z boku na bok (kaczy chód)
  R(P, K.klatka, 0.02 * a * Math.cos(2 * f), -0.05 * a * s, 0.03 * a * c);
  const sq = 0.03 * a * Math.cos(2 * f);
  S(P, K.korpus, -sq * 0.5, sq, -sq * 0.5);
  R(P, K.nakretka, 0.05 * a * Math.sin(2 * f - 0.9), 0, 0.07 * a * Math.sin(f - 0.7));
  for (let i = 0; i < 6; i++) { S(P, K.kr0 + i, 0, 0.07 * a * Math.sin(2 * f - 1.2 - i), 0); R(P, K.kr0 + i, 0.05 * a * Math.sin(2 * f - 1 - i * 0.5), 0, 0.06 * a * c); }
  S(P, K.kroplaUsta, 0, 0.12 * a * Math.sin(2 * f - 1.4), 0);
}
function pozaBieg(P, f, a) {
  baza(P);
  const s = Math.sin(f), c = Math.cos(f), Ah = 0.62;
  for (const st of STRONY) {
    const sl = st > 0 ? s : -s, cl = st > 0 ? c : -c;
    const kol = 0.25 + 1.35 * Math.pow(Math.max(0, cl), 1.2);
    const bio = -Ah * sl - kol * 0.42;
    noga(P, st, bio, kol, -(bio + kol) * 0.8 - 0.25 * Math.max(0, -sl), 0.03);
    reka(P, st, -0.2, -0.75 * sl - 0.05, 0, 0.3 + 0.25 * sl, 0.0);
  }
  T(P, K.biodra, 0, 0.07 * s * s - 0.06, 0);
  R(P, K.biodra, 0, 0.16 * s, 0);
  R(P, K.korpus, 0.24, -0.08 * s, 0.05 * c);
  R(P, K.klatka, 0.04, -0.09 * s, 0.02 * c);
  const sq = 0.055 * (s * s - 0.5) * 2;
  S(P, K.korpus, -sq * 0.45, sq, -sq * 0.45);
  R(P, K.nakretka, -0.08 + 0.09 * Math.sin(2 * f - 1.2), 0, 0.06 * Math.sin(f - 0.8));
  for (let i = 0; i < 6; i++) { S(P, K.kr0 + i, 0, 0.1 * Math.sin(2 * f - 1.5 - i), 0); R(P, K.kr0 + i, -0.18 + 0.08 * Math.sin(2 * f - 1.2 - i * 0.5), 0, 0.05 * c); }
  S(P, K.kroplaUsta, 0, 0.16 * Math.sin(2 * f - 1.6), 0);
  R(P, K.kroplaUsta, -0.25, 0, 0);
}
// skok: przysiad → wyskok (rozciągnięcie) → podkulone nogi → przysiad przy lądowaniu
const SKOK = { T0: 0.10, TL: 0.745, T2: 0.30 };
function pozaSkok(P, ts, st) {
  baza(P);
  const { T0, TL } = SKOK;
  let y = 0;
  if (ts < T0) {
    const k = sstep(0, T0, ts);
    T(P, K.biodra, 0, -0.10 * k, 0);
    for (const s of STRONY) { noga(P, s, -0.55 * k, 1.1 * k, -0.55 * k); reka(P, s, 0.15 * k, -0.45 * k, 0, 0.2 * k); }
    S(P, K.korpus, 0.09 * k, -0.13 * k, 0.09 * k);
    R(P, K.korpus, 0.12 * k, 0, 0);
  } else if (ts < T0 + TL || st.skokZew) {
    const a = st.skokZew ? st.skokFaza : (ts - T0) / TL;
    y = st.skokZew ? 0 : 4 * st.wysSkoku * a * (1 - a);
    const roz = 1 - sstep(0, 0.35, a), pod = Math.sin(Math.PI * clamp(a, 0, 1)), lad = sstep(0.7, 1, a);
    S(P, K.korpus, -0.07 * roz, 0.16 * roz - 0.03 * pod, -0.07 * roz);
    R(P, K.korpus, 0.08 * pod - 0.05 * roz, 0, 0);
    for (const s of STRONY) {
      noga(P, s, -0.6 * pod * (1 - lad) - 0.15 * lad + 0.25 * roz, 1.25 * pod * (1 - lad) + 0.25 * lad, -0.5 * pod * (1 - lad) - 0.1 * lad - 0.3 * roz, 0.08 * pod);
      reka(P, s, -0.95 * roz - 0.55 * pod * (1 - roz) + 0.2 * lad, 0.25 * roz + 0.1 * pod, 0, 0.25 * pod, 0, 0, 0.2 * pod);
    }
    R(P, K.nakretka, -0.1 * roz + 0.08 * lad, 0, 0);
    for (let i = 0; i < 6; i++) S(P, K.kr0 + i, 0, 0.22 * roz - 0.12 * pod + 0.2 * lad, 0);
    S(P, K.kroplaUsta, 0, 0.3 * roz + 0.25 * lad, 0);
  } else {
    const l = ts - T0 - TL, sq = Math.exp(-l * 9) * Math.cos(l * 13);
    S(P, K.korpus, 0.13 * sq, -0.2 * sq, 0.13 * sq);
    T(P, K.biodra, 0, -0.1 * Math.max(0, sq), 0);
    for (const s of STRONY) { noga(P, s, -0.5 * Math.max(0, sq), 1.0 * Math.max(0, sq), -0.5 * Math.max(0, sq), 0.03 * sq); reka(P, s, -0.35 * sq, 0.2 * sq, 0, 0.2 * sq); }
    R(P, K.nakretka, 0.12 * sq, 0, 0);
    for (let i = 0; i < 6; i++) S(P, K.kr0 + i, 0, 0.3 * sq, 0);
  }
  T(P, K.root, 0, y, 0);
}
// śmierć: drgnięcie → tubka flaczeje → przewraca się na plecy (twarzą do nieba, nogi w górze)
function pozaSmierc(P, ts) {
  baza(P);
  const szok = Math.exp(-ts * 7) * Math.sin(ts * 30), def = sstep(0.12, 0.95, ts), upad = sstep(0.5, 1.05, ts);
  const odb = ts > 1.05 ? 0.07 * Math.exp(-(ts - 1.05) * 6) * Math.sin((ts - 1.05) * 22) : 0;
  R(P, K.root, -1.43 * upad + odb, 0, 0);
  T(P, K.root, 0, 0.07 * upad, 0.06 * upad);
  S(P, K.korpus, 0.1 * def, -0.14 * def + 0.08 * szok, -0.6 * def);
  R(P, K.korpus, -0.2 * szok, 0, 0.12 * def);
  R(P, K.klatka, 0.22 * def * (1 - upad) + 0.08 * upad, 0, -0.1 * def);
  R(P, K.nakretka, 0.15 * def, 0, 0.42 * def);
  T(P, K.nakretka, 0, -0.025 * def, 0);
  const nogi = sstep(0.95, 1.4, ts), drg = ts > 1.6 && ts < 2.2 ? 0.12 * Math.sin((ts - 1.6) * 40) * (1 - sstep(1.6, 2.2, ts)) : 0;
  for (const s of STRONY) {
    noga(P, s, -0.95 * nogi + 0.3 * upad * (1 - nogi) + drg * (s > 0 ? 1 : -0.6), 0.25 * nogi, 0.35 * nogi, 0.2 * nogi);
    reka(P, s, -0.25 * def + 0.4 * upad, -0.35 * upad, 0, -0.2 * def, 0, 0, 0);
  }
  for (let i = 0; i < 6; i++) { S(P, K.kr0 + i, 0, 0.3 * def, 0); R(P, K.kr0 + i, -0.5 * upad, 0, 0); }
}
// wygrana: podskoki z obydwoma kciukami w górę, co trzeci podskok piruet
const WYGR_OKRES = 0.64;
function pozaWygrana(P, ts) {
  baza(P);
  const nr = Math.floor(ts / WYGR_OKRES), ph = (ts % WYGR_OKRES) / WYGR_OKRES;
  const lot = clamp((ph - 0.14) / 0.72, 0, 1), h = Math.sin(Math.PI * lot);
  const kontakt = 1 - sstep(0, 0.14, ph) + sstep(0.86, 1, ph);
  T(P, K.root, 0, 0.28 * h, 0);
  if (nr % 3 === 2) R(P, K.root, 0, TAU * sstep(0.1, 0.9, lot), 0);
  const sq = 0.16 * kontakt - 0.12 * h * (1 - lot) - 0.03;
  S(P, K.korpus, sq * 0.5, -sq, sq * 0.5);
  T(P, K.biodra, 0, -0.07 * kontakt, 0);
  for (const s of STRONY) {
    kciukWGore(P, s, 1, 0.12 * Math.sin(ph * TAU + (s > 0 ? 0 : 1.2)));
    noga(P, s, -0.45 * kontakt - 0.35 * h, 0.9 * kontakt + 0.55 * h, -0.45 * kontakt - 0.2 * h, 0.05 * h);
  }
  R(P, K.korpus, -0.06 * h, 0, 0.05 * Math.sin(ts * 5));
  R(P, K.nakretka, 0.08 * kontakt, 0, 0.06 * Math.sin(ts * 7));
  for (let i = 0; i < 6; i++) S(P, K.kr0 + i, 0, 0.25 * kontakt - 0.1 * h, 0);
  S(P, K.kroplaUsta, 0, 0.3 * kontakt, 0);
}
// ATAK (warstwa, 0,6 s): wdech → ściśnięcie tubki rękami → tryśnięcie z nakrętki → powrót
const ATAK = { CZAS: 0.62, STRUMIEN: [0.15, 0.31] };
function atakWarstwa(P, ta, tmp) {
  const w = sstep(0, 0.06, ta) * (1 - sstep(0.44, ATAK.CZAS, ta));
  if (w <= 0) return;
  const k1 = sstep(0, 0.13, ta), k2 = sstep(0.12, 0.19, ta), k3 = sstep(0.32, 0.56, ta);
  const sc = k2 * (1 - k3), wd = k1 * (1 - k2);
  // ręce: nadpisanie (lerp do pozy ataku: baza → zamach → ściśnięcie → baza)
  tmp.fill(0);
  for (const s of STRONY) {
    rekaPoza(tmp, s, RB, 1 - wd - sc);
    rekaPoza(tmp, s, R_ZAMACH, wd);
    rekaPoza(tmp, s, R_SCISK, sc);
  }
  for (const k of KOSCI_RAK)
    for (let c = 0; c < KAN; c++) { const o = k * KAN + c; P[o] += (tmp[o] - P[o]) * w; }
  // korpus: dodatkowo (wdech w tył, ściśnięcie, pochylenie, żeby nakrętka celowała w przód)
  R(P, K.korpus, w * (-0.16 * wd + 0.32 * sc), 0, 0);
  R(P, K.klatka, w * (-0.06 * wd + 0.24 * sc), 0, 0);
  S(P, K.korpus, w * (0.05 * wd - 0.2 * sc), w * (0.06 * wd + 0.13 * sc), w * (0.04 * wd - 0.24 * sc));
  T(P, K.nakretka, 0, w * 0.04 * sc * (1 + 0.5 * Math.sin(ta * 90)), 0);
  S(P, K.nakretka, w * 0.08 * sc, -w * 0.06 * sc, w * 0.08 * sc);
  for (let i = 0; i < 6; i++) S(P, K.kr0 + i, 0, w * 0.25 * sc, 0);
  S(P, K.kroplaUsta, 0, w * 0.3 * sc, 0);
}
// OBERWAŁ (warstwa, 0,5 s): drgnięcie w tył ze sprężyną, ręce w górę, drżenie
function oberwalWarstwa(P, th, los, strona) {
  if (th >= 0.5) return;
  const e = Math.exp(-th * 8), spr = e * Math.cos(th * 26);
  R(P, K.korpus, -0.24 * spr, 0, 0.12 * spr * strona);
  R(P, K.klatka, -0.1 * spr, 0, 0);
  S(P, K.korpus, 0.13 * spr, -0.12 * spr, 0.1 * spr);
  T(P, K.klatka, (los() - 0.5) * 0.05 * e, (los() - 0.5) * 0.03 * e, 0);
  R(P, K.nakretka, -0.15 * spr, 0, 0.3 * spr);
  for (const s of STRONY) reka(P, s, -0.6 * e, 0.1 * e, 0, 0.4 * e);
  for (let i = 0; i < 6; i++) S(P, K.kr0 + i, 0, 0.3 * spr, 0);
}

// ============================== POSTAĆ ==============================
const BAZY = ['ruch', 'skok', 'smierc', 'wygrana'];
function dodajWage(P, Q, w) { for (let i = 0; i < P.length; i++) P[i] += Q[i] * w; }
export function stworzCzekotubke(THREE, opcje = {}) {
  const o = { skala: 1, obrys: true, ziarno: 7, wysokoscSkoku: 1.1, ...opcje };
  przygotujProfil();
  const atlas = rysujAtlas(THREE);
  const mat = materialCzekotubki(THREE, { twarz: atlas, chmury: o.chmury });
  const matKropli = materialCzekotubki(THREE, { czastki: true, chmury: o.chmury });

  // ---- geometria ----
  const b = new Bud();
  const kotw = kotwiceKropli();
  czKorpus(THREE, b);
  czCzekolada(THREE, b);
  czKulkiKropli(THREE, b, kotw);
  czNakretka(THREE, b);
  const tw = czTwarz3D(THREE, b);
  for (const s of [1, -1]) { czReka(THREE, b, s); czNoga(THREE, b, s); }
  const trojkaty = b.I.length / 3;
  if (o.obrys) b.obrysy();
  const geo = b.geo(THREE);
  const trojkatyRazem = b.I.length / 3;

  // ---- szkielet ----
  const swiat = KOSCI.map(k => k[2]);
  for (let i = 0; i < 6; i++) swiat[K.kr0 + i] = kotw[i] ? kotw[i].poz : [0, 1.3, 0];
  swiat[K.kroplaUsta] = tw.kroplaUsta;
  const kosci = [], spocz = [];
  KOSCI.forEach(([nazwa, rodzic, , kolej], i) => {
    const kb = new THREE.Bone(); kb.name = nazwa; kb.rotation.order = kolej;
    const p = swiat[i], q = rodzic >= 0 ? swiat[rodzic] : [0, 0, 0];
    kb.position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    spocz.push(kb.position.clone());
    if (rodzic >= 0) kosci[rodzic].add(kb);
    kosci.push(kb);
  });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = 'czekotubka';
  mesh.add(kosci[0]);
  mesh.bind(new THREE.Skeleton(kosci));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;                     // kości wychodzą poza bryłę spoczynkową (skok, upadek)
  const obrot = new THREE.Group(); obrot.add(mesh);
  const grupa = new THREE.Group(); grupa.name = 'Czekotubka'; grupa.add(obrot);
  grupa.scale.setScalar(o.skala);

  const krople = new Krople(THREE, matKropli, 160, o.ziarno + 11);
  if (o.scena) o.scena.add(krople.mesh);

  // ---- stan animacji ----
  const los = prng(o.ziarno);
  const U = mat.userData.U;
  const st = {
    baza: 'ruch', tryb: 'auto', w: { ruch: 1, skok: 0, smierc: 0, wygrana: 0 }, tau: 0.16,
    t: 0, tb: 0, faza: 0, vS: 0, vPop: 0, acc: 0, kat: 0, omega: 0,
    tAtak: -1, tOber: -1, stronaOber: 1, tGest: -1, nastGest: 5 + los() * 4,
    patrzYaw: 0, patrzCel: 0, oko: new THREE.Vector2(), okoCel: new THREE.Vector2(), nastPatrz: 1.5,
    nastMrug: 2 + los() * 3, tMrug: -1, podwMrug: false,
    skokZew: false, skokFaza: 0, wPowPop: false, wysSkoku: o.wysokoscSkoku,
    twarzWym: null, kaluza: null, nastKropla: 1.5 + los() * 2, emitAcc: 0,
  };
  const P = new Float32Array(NB * KAN), tmp = new Float32Array(NB * KAN), tmp2 = new Float32Array(NB * KAN);
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ziem = new THREE.Vector3(), _dysza = new THREE.Vector3(), _dyszaPop = new THREE.Vector3();

  function ustawStan(s) {
    if (s === 'idle' || s === 'chod' || s === 'bieg' || s === 'auto') {
      st.tryb = s;
      if (st.baza !== 'ruch') { st.baza = 'ruch'; st.tau = st.w.smierc > 0.5 ? 0.45 : 0.18; }
      zakonczKaluze();
    } else if (s === 'skok') {
      if (st.baza === 'smierc') return;
      st.baza = 'skok'; st.tb = 0; st.tau = 0.07; st.skokZew = false;
    } else if (s === 'atak') {
      if (st.baza === 'smierc') return;
      st.tAtak = 0;
    } else if (s === 'oberwal') {
      if (st.baza === 'smierc') return;
      st.tOber = 0; st.stronaOber = los() < 0.5 ? -1 : 1;
    } else if (s === 'smierc') {
      if (st.baza === 'smierc') return;
      st.baza = 'smierc'; st.tb = 0; st.tau = 0.1; st.tAtak = -1; st.tOber = 0; st.tGest = -1;
    } else if (s === 'wygrana') {
      st.baza = 'wygrana'; st.tb = 0; st.tau = 0.2; st.tAtak = -1; zakonczKaluze();
    }
  }
  function zakonczKaluze() { if (st.kaluza) { for (const p of st.kaluza) p.znika = Math.max(0, p.t); st.kaluza = null; } }

  function twarz(nazwa) {
    const i = TWARZE[nazwa] ?? 0;
    U.uKom.value.set(i % 4, 2 - Math.floor(i / 4));
  }

  function update(dt, ctx = {}) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    st.t += dt; st.tb += dt;
    const v = Math.max(0, ctx.predkosc || 0);
    // ---- obrót w stronę ruchu ----
    if (ctx.kierunek != null && st.baza !== 'smierc') {
      const d = owin(ctx.kierunek - st.kat), dk = d * (1 - Math.exp(-dt * 11));
      st.kat = owin(st.kat + dk); st.omega += ((dt > 0 ? dk / dt : 0) - st.omega) * (1 - Math.exp(-dt * 10));
    } else st.omega *= Math.exp(-dt * 6);
    obrot.rotation.y = st.kat;
    // ---- prędkość efektywna wg trybu ----
    const ve = st.tryb === 'idle' ? 0 : st.tryb === 'chod' ? (v > 0.05 ? Math.min(v, 2.6) : 1.5) : st.tryb === 'bieg' ? (v > 0.05 ? Math.max(v, 3.6) : 6.2) : v;
    st.vS += (ve - st.vS) * (1 - Math.exp(-dt * 7));
    const acc = dt > 0 ? (st.vS - st.vPop) / dt : 0; st.vPop = st.vS;
    st.acc += (acc - st.acc) * (1 - Math.exp(-dt * 8));
    const vS = st.vS;
    const wI = 1 - sstep(0.08, 0.7, vS), kB = sstep(2.6, 3.9, vS), wB = kB * (1 - wI), wC = (1 - wI) * (1 - kB);
    const ampC = sstep(0.05, 1.6, vS);
    const kad = lerp(vS / (2 * 0.30), vS / (2 * 0.95), kB);          // cykle na sekundę (krok chodu 0,30, biegu 0,95 — z lotem)
    st.faza = (st.faza + TAU * Math.max(kad, wI < 0.98 ? 0.5 : 0) * dt) % (TAU * 1000);
    // ---- skok sterowany z gry (wPowietrzu / vy) ----
    if (ctx.wPowietrzu != null && st.baza !== 'smierc' && st.baza !== 'wygrana') {
      if (ctx.wPowietrzu) {
        if (st.baza !== 'skok' || !st.skokZew) { st.baza = 'skok'; st.tau = 0.07; st.skokZew = true; st.tb = SKOK.T0; }
        const vy = ctx.vy || 0; st.skokFaza = clamp(0.5 - vy / 16.4, 0, 1);
      } else if (st.wPowPop && st.skokZew) { st.skokZew = false; st.tb = SKOK.T0 + SKOK.TL; }
      st.wPowPop = !!ctx.wPowietrzu;
    }
    if (st.baza === 'skok' && !st.skokZew && st.tb > SKOK.T0 + SKOK.TL + SKOK.T2) { st.baza = 'ruch'; st.tau = 0.15; }
    // ---- wagi stanów bazowych ----
    let suma = 0;
    for (const s of BAZY) { const cel = s === st.baza ? 1 : 0; st.w[s] += (cel - st.w[s]) * (1 - Math.exp(-dt / st.tau)); if (st.w[s] < 1e-4) st.w[s] = 0; suma += st.w[s]; }
    for (const s of BAZY) st.w[s] /= suma || 1;
    // ---- rozglądanie / mruganie / gest ----
    const spokoj = st.baza === 'ruch' ? wI : 0;
    if (st.t > st.nastPatrz) {
      st.nastPatrz = st.t + 1.6 + los() * 3;
      if (spokoj > 0.5 && los() < 0.75) { const kier = (los() - 0.5) * 2; st.patrzCel = kier * 0.38; st.okoCel.set(kier * 0.034, (los() - 0.45) * 0.03); }
      else { st.patrzCel = 0; st.okoCel.set((los() - 0.5) * 0.012, 0.004); }
    }
    if (spokoj < 0.5) { st.patrzCel = 0; st.okoCel.set(0, 0.006); }
    st.patrzYaw += (st.patrzCel * spokoj - st.patrzYaw) * (1 - Math.exp(-dt * 4.5));
    st.oko.lerp(st.okoCel, 1 - Math.exp(-dt * 22));
    if (st.t > st.nastMrug && st.tMrug < 0) { st.tMrug = 0; st.podwMrug = los() < 0.2; }
    if (st.tMrug >= 0) { st.tMrug += dt; if (st.tMrug > (st.podwMrug ? 0.34 : 0.13)) { st.tMrug = -1; st.nastMrug = st.t + 1.8 + los() * 3.6; } }
    const mrug = st.tMrug >= 0 && (st.tMrug < 0.12 || (st.podwMrug && st.tMrug > 0.2));
    if (st.tGest < 0 && st.t > st.nastGest && spokoj > 0.9 && st.tAtak < 0) st.tGest = 0;
    if (st.tGest >= 0) { st.tGest += dt; if (st.tGest > 1.7 || spokoj < 0.3) { st.tGest = -1; st.nastGest = st.t + 6 + los() * 6; } }
    const wGest = st.tGest >= 0 ? sstep(0, 0.28, st.tGest) * (1 - sstep(1.3, 1.7, st.tGest)) * spokoj : 0;
    // ---- poza ----
    P.fill(0);
    // suma ważona póz (bez domknięć i ...arg — update leci co klatkę, gra pilnuje zera alokacji)
    const wr = st.w.ruch;
    let w = wr * wI; if (w > 1e-4) { tmp.fill(0); pozaIdle(tmp, st.t, st); dodajWage(P, tmp, w); }
    w = wr * wC; if (w > 1e-4) { tmp.fill(0); pozaChod(tmp, st.faza, ampC); dodajWage(P, tmp, w); }
    w = wr * wB; if (w > 1e-4) { tmp.fill(0); pozaBieg(tmp, st.faza, 1); dodajWage(P, tmp, w); }
    w = st.w.skok; if (w > 1e-4) { tmp.fill(0); pozaSkok(tmp, st.baza === 'skok' ? st.tb : SKOK.T0 + SKOK.TL + SKOK.T2, st); dodajWage(P, tmp, w); }
    w = st.w.smierc; if (w > 1e-4) { tmp.fill(0); pozaSmierc(tmp, st.baza === 'smierc' ? st.tb : 3); dodajWage(P, tmp, w); }
    w = st.w.wygrana; if (w > 1e-4) { tmp.fill(0); pozaWygrana(tmp, st.baza === 'wygrana' ? st.tb : 0); dodajWage(P, tmp, w); }
    // gest: prawa ręka (−X) kciuk w górę
    if (wGest > 0) {
      tmp.fill(0); baza(tmp); kciukWGore(tmp, -1, 1, 0.06 * Math.sin(st.tGest * 9));
      for (const k of KOSCI_RAKI_P) for (let c = 0; c < KAN; c++) { const i = k * KAN + c; P[i] += (tmp[i] - P[i]) * wGest; }
      R(P, K.korpus, -0.05 * wGest, 0.12 * wGest, 0.04 * wGest);
    }
    // atak
    if (st.tAtak >= 0) {
      atakWarstwa(P, st.tAtak, tmp2);
      const [s0, s1] = ATAK.STRUMIEN;
      if (st.tAtak >= s0 && st.tAtak <= s1) st.emitAcc += dt * 300;
      st.tAtak += dt; if (st.tAtak > ATAK.CZAS) st.tAtak = -1;
    }
    if (st.tOber >= 0) { oberwalWarstwa(P, st.tOber, los, st.stronaOber); st.tOber += dt; if (st.tOber > 0.6) st.tOber = -1; }
    // bezwładność: przechył w zakręcie, pochylenie przy przyspieszaniu, krople zostają w tyle
    const wDyn = st.w.ruch;
    R(P, K.korpus, clamp(st.acc * 0.018, -0.14, 0.14) * wDyn, 0, clamp(-st.omega * 0.035 * Math.min(1, vS / 3), -0.25, 0.25) * wDyn);
    for (let i = 0; i < 6; i++) R(P, K.kr0 + i, clamp(-st.acc * 0.03, -0.3, 0.3) * wDyn, 0, clamp(st.omega * 0.03, -0.2, 0.2) * wDyn);
    R(P, K.nakretka, clamp(-st.acc * 0.02, -0.12, 0.12) * wDyn, 0, clamp(st.omega * 0.02, -0.12, 0.12) * wDyn);
    // ---- na kości ----
    for (let k = 0; k < NB; k++) {
      const kb = kosci[k], q = k * KAN, p0 = spocz[k];
      kb.rotation.set(P[q], P[q + 1], P[q + 2]);
      kb.position.set(p0.x + P[q + 3], p0.y + P[q + 4], p0.z + P[q + 5]);
      kb.scale.set(1 + P[q + 6], 1 + P[q + 7], 1 + P[q + 8]);
    }
    // ---- twarz i błysk ----
    let mina = mrug ? 'mrug' : 'otwarte';
    if (wGest > 0.45) mina = 'oczko';
    if (st.baza === 'skok' && (st.skokZew || (st.tb > SKOK.T0 * 0.6 && st.tb < SKOK.T0 + SKOK.TL * 0.9))) mina = 'wow';
    if (st.baza === 'wygrana') mina = 'radosc';
    if (st.tAtak >= 0.05 && st.tAtak < 0.42) mina = 'zacisniete';
    if (st.tOber >= 0 && st.tOber < 0.45) mina = 'auc';
    if (st.baza === 'smierc') mina = st.tb < 0.28 ? 'auc' : 'smierc';
    if (st.twarzWym) mina = st.twarzWym;
    st.mina = mina;
    twarz(mina);
    U.uOko.value.copy(st.oko);
    U.uBlysk.value = st.tOber >= 0 ? Math.exp(-st.tOber * 11) : 0;
    // ---- efekty (świat) ----
    grupa.updateWorldMatrix(true, true);
    grupa.getWorldPosition(_ziem);
    const ziemiaY = ctx.ziemia != null ? ctx.ziemia : _ziem.y;
    const kn = kosci[K.nakretka].matrixWorld;
    // strumień: oś nakrętki + przód postaci (sama oś celowała za stromo w niebo), gęsto i wydłużone wzdłuż lotu
    // (kolejne krople z jednej klatki rozłożone wzdłuż toru o ułamek dt — bez tego strumień szedł grudkami co klatkę)
    // Dysza w czasie klatki przesuwa się (tubka się pochyla), więc start kropli interpolujemy między jej
    // pozycją z poprzedniej i z tej klatki — inaczej z szybko pochylanej nakrętki szły osobne grudki.
    const nEmit = Math.floor(st.emitAcc);
    _dysza.set(0, 0.3, 0).applyMatrix4(kn);
    if (!st.dyszaOk) { _dyszaPop.copy(_dysza); st.dyszaOk = true; }
    for (let e = 0; e < nEmit; e++) {
      st.emitAcc -= 1;
      const fr = (e + 0.5) / nEmit, wy = dt * (1 - fr);          // fr: 0 = początek klatki (najstarsza), 1 = teraz
      _v.copy(_dyszaPop).lerp(_dysza, fr);
      _v2.setFromMatrixColumn(kn, 1).normalize();
      _ziem.setFromMatrixColumn(obrot.matrixWorld, 2).normalize();
      _v2.addScaledVector(_ziem, 1.7);
      _v2.x += (los() - 0.5) * 0.05; _v2.y += (los() - 0.5) * 0.04; _v2.z += (los() - 0.5) * 0.05; _v2.normalize();
      const sp = (6.7 + los() * 0.5) * grupa.scale.x;
      krople.emituj(_v.x + _v2.x * sp * wy, _v.y + _v2.y * sp * wy, _v.z + _v2.z * sp * wy, _v2.x * sp, _v2.y * sp, _v2.z * sp,
        (0.032 + los() * 0.024) * grupa.scale.x, ziemiaY);
      krople.cz[krople.cz.length - 1].t = wy;
    }
    _dyszaPop.copy(_dysza);
    if (st.t > st.nastKropla && st.baza !== 'smierc') {         // kropla odrywa się od strużki
      st.nastKropla = st.t + 1.1 + los() * 2.6;
      const i = Math.floor(los() * 7);
      if (i < 6 && kotw[i]) {
        const kp = kotw[i].poz, ko = kotw[i].koniec;
        _v.set(ko[0] - kp[0], ko[1] - kp[1], ko[2] - kp[2]).applyMatrix4(kosci[K.kr0 + i].matrixWorld);
      } else _v.set(0, -0.08, 0.01).applyMatrix4(kosci[K.kroplaUsta].matrixWorld);
      krople.emituj(_v.x, _v.y, _v.z, 0, -0.3, 0, 0.028 * grupa.scale.x, ziemiaY);
    }
    if (st.baza === 'smierc' && st.tb > 1.1 && !st.kaluza) {
      // kałuża z wylotu nakrętki: główna plama + 3 mniejsze obok (nieregularny brzeg), lekko nad gruntem (trawa)
      _v.set(0, 0.32, 0).applyMatrix4(kn);
      const sk = grupa.scale.x;
      st.kaluza = [];
      for (const [dx, dz, r, op] of [[0, 0, 0.78, 0], [0.42, 0.18, 0.4, 0.35], [-0.34, 0.3, 0.34, 0.6], [0.1, -0.45, 0.36, 0.9]]) {
        krople.emituj(_v.x + dx * sk, ziemiaY + 0.025, _v.z + dz * sk, 0, 0, 0, r * sk, ziemiaY, 2);
        const p = krople.cz[krople.cz.length - 1]; p.t = -op; st.kaluza.push(p);
      }
      for (let i = 0; i < 6; i++) krople.emituj(_v.x, _v.y + 0.05, _v.z, (los() - 0.5) * 1.5, 1.2 + los(), (los() - 0.5) * 1.5, 0.04 * sk, ziemiaY);
    }
    krople.update(dt, o.ziemia || null);
  }

  function dispose() {
    grupa.removeFromParent(); krople.mesh.removeFromParent();
    geo.dispose(); mat.dispose(); matKropli.dispose(); atlas.dispose(); krople.dispose();
    mesh.skeleton.dispose();
  }

  update(0, {});
  return {
    grupa, mesh, kosci, efekty: krople.mesh, material: mat, atlas,
    ustawStan, update, dispose, twarz,
    get stan() { return { baza: st.baza, tryb: st.tryb, w: { ...st.w }, atak: st.tAtak >= 0, oberwal: st.tOber >= 0, v: st.vS }; },
    wymusTwarz(n) { st.twarzWym = n || null; },
    get kat() { return st.kat; }, set kat(a) { st.kat = a; },
    info: { trojkaty, trojkatyZObrysem: trojkatyRazem, kosci: NB, wierzcholki: geo.attributes.position.count, drawCalle: 2, wysokosc: D.wys * o.skala },
    _st: st,
  };
}
export const STANY = ['idle', 'chod', 'bieg', 'skok', 'atak', 'oberwal', 'smierc', 'wygrana'];
