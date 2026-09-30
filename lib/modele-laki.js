// ╔══════════════ ŁĄKI — MODELE 3D STRUKTUR DO WSKAKIWANIA (30.09.2026) ══════════════╗
// Życzenie właściciela: „popraw elementy 3D na mapach, np. skrzynki na łąkach, te, na które się
// wskakuje, te stoliki, na które się wskakuje". Dawniej: gołe prostopadłościany z teksturą w paski,
// każdy jako osobny Mesh. Teraz: stylizowane modele liczone w kodzie (zero plików z sieci, zero
// tekstur — kolor w wierzchołkach), 3 pasma toon jak `naturaMat` / `materialSkrzyn`.
//
// STRUKTURY (ten sam układ co kolizje w main.js → buildChunk, gałąź Łąk — KOLIZJE SIĘ NIE ZMIENIAJĄ):
//   stos    — 3 kolumny skrzyń na warzywa w (0,0) h 0,9 · (1,5; 0,3) h 1,7 · (0,7; 1,6) h 1,3, każda 1,4 × 1,4;
//             skrzynie ZAMKNIĘTE (stoi się na wieku): deski ze szparami, ciemniejsze słupki, uchwyty, duży stempel,
//             czasem szpara w wieku z warzywami i nacią, obrus w kratkę zwisający z wieka, na wierzchu kolumny C
//             płytka skrzynka ażurowa z warzywami w środku; przy wolnych bokach 2–3 drobiazgi (worek, dynia,
//             kapusta, jabłka) — bez kolizji, niskie
//   podest  — taras widokowy na palach: pomost 5,4 × 5,4, wierzch 2,28 nad gruntem; grube pale na kamiennych
//             stopach, owiązane sznurem, krzyżulce na 4 bokach, balustrada od −X z chorągiewkami, proporczykiem
//             i latarenką, doniczka, drabinka ze stopnia; stopień = skrzynia 1,6 × 1,1 × 1,6 w (+3,6; 0)
//   schody  — 3 kamienne stopnie 3 × 1,5 (wierzchy 0,6 / 1,2 / 1,8, w górę ku +Z): bloki w wiązaniu, płyty wierzchu
//             lekko krzywe, ciemne fugi, poduchy mchu w kątach i zwisające z nosów, trawa w szczelinach, gruz
// Wierzch, na którym się stoi, leży DOKŁADNIE na wysokości `top` kolizji; wygląd może wystawać o centymetry.
//
// RYSOWANIE: `Zbior` zbiera struktury chunka i oddaje JEDNĄ BufferGeometry bez indeksu
// (position / normal / color / aLak) w układzie świata → 1 draw call + 1 w przebiegu cieni na chunk.
// Prefaby (pojedyncze skrzynie, podest, warianty schodów) liczą się raz i siedzą w cache; chunk tylko
// przepisuje je przez obrót Y + przesunięcie. Wierzchołki „stóp" (podstawa brył stojących na ziemi)
// schodzą do gruntu podanego z zewnątrz (`grunt(x, z)`) — na stoku pal / skrzynia nie wisi w powietrzu.
//
// aLak (vec3): x = waga kołysania na wietrze (trawa, nać, chorągiewki: wysokość nad nasadą),
//              y = waga trzepotu (chorągiewki), z = „bez światła" (trawa jak dywan źdźbeł w grze: MeshBasic).
//
// LOSOWOŚĆ: moduł NIE używa Math.random (strumień bota w main.js) — wariant wyglądu to hash pozycji
// struktury (`ziarnoXZ`). Liczbę wywołań `rng()` chunka pilnuje main.js.
//
// ⚠️ PUŁAPKI (z osiedla i skrzyń): (1) własny customProgramCacheKey — klucz three to onBeforeCompile.toString()
// + parametry; (2) cień chmur liczony TU (opcja `chmury`), nie przez addCloudShadow z main.js (podwójne owinięcie
// redefiniowało `vWPos`); (3) łatki szukają `#include <…>` w nierozwiniętym shaderze — tego materiału nie owijać
// cudzymi łatkami na te same kotwice.
// ╚═════════════════════════════════════════════════════════════════════════════════════╝

const TAU = Math.PI * 2;

// ============================== DROBIAZGI ==============================
function lin(hex) {
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}
const mn = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const miesz = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function prng(ziarno = 1) {
  let s = (Math.imul(ziarno | 0, 0x9e3779b1) ^ 0x5bd1e995) | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// ziarno wyglądu z pozycji (bez Math.random i bez rng chunka)
export function ziarnoXZ(x, z) {
  return (Math.imul(Math.round(x * 8) | 0, 73856093) ^ Math.imul(Math.round(z * 8) | 0, 19349663) ^ 0x2c1b3c6d) | 0;
}
// tani szum wartości 2D (mech na kamieniach) — deterministyczny, bez tablic
function hash2(ix, iz) { const h = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453; return h - Math.floor(h); }
function szum(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function normTri(A, B, C) {
  const e1x = B[0] - A[0], e1y = B[1] - A[1], e1z = B[2] - A[2];
  const e2x = C[0] - A[0], e2y = C[1] - A[1], e2z = C[2] - A[2];
  const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ============================== PALETY (sRGB hex → liniowe) ==============================
// Drewno cieplejsze i ciemniejsze od łubianki do zebrania (modele-skrzynie.js: jasnopomarańczowa, z obrysem),
// żeby skrzynia DO WSKOCZENIA nie czytała się jak skrzynia DO ZEBRANIA. Bez obrysu — obrys mają tylko znajdźki.
const DREWNA = [
  { nm: 'miod',  deski: [0xdb9f55, 0xcd8f47, 0xe3ab62, 0xd3954c], slupek: 0x925a28, wieko: [0xe6b36a, 0xdaa55c, 0xecbd78] },
  { nm: 'stare', deski: [0xcaa779, 0xbe9a6c, 0xd3b184, 0xc3a072], slupek: 0x86623e, wieko: [0xd8b98a, 0xceae7f, 0xdec193] },
  { nm: 'rude',  deski: [0xcf7f45, 0xc2723b, 0xd88b51, 0xc87840], slupek: 0x7e4422, wieko: [0xdb9258, 0xd0864d, 0xe29d63] },
  { nm: 'sosna', deski: [0xdfb676, 0xd4a968, 0xe6c083, 0xd9af6f], slupek: 0xa77f48, wieko: [0xe8c68c, 0xdfba7e, 0xedcd96] },
].map(d => ({ nm: d.nm, deski: d.deski.map(lin), slupek: lin(d.slupek), wieko: d.wieko.map(lin) }));
const K = {
  wnetrze: lin(0x3b2616), gwozdz: lin(0x4a3a2c), farba: lin(0xb3382a), farbaZ: lin(0x3f7f2e), farbaC: lin(0x4b3524),
  jablko: lin(0xd8392f), jablkoJ: lin(0xff8a6a), jablkoZ: lin(0x9fcf4a), marchew: lin(0xf28a2a), marchewC: lin(0xd0661c),
  ziemniak: lin(0xc9a064), ziemniakC: lin(0x9c7646), kapusta: lin(0x9fd46a), kapustaC: lin(0x5c9c3c), pomidor: lin(0xe8483a),
  nac: lin(0x5fae3a), nacJ: lin(0x9ad85a), lodyga: lin(0x6f5a2e),
  worek: lin(0xd8bf8c), worekC: lin(0xb99d68), worekP: lin(0xa3844f), sznur: lin(0x8a6a3c),
  dynia: lin(0xf29a2e), dyniaC: lin(0xd97a1c), dyniaJ: lin(0xffc15a),
  // podest: deski pomostu jaśniejsze (ciepły miód), konstrukcja ciemniejsza, balustrada pośrodku
  deska: [0xd9a563, 0xcb9552, 0xe2b272, 0xd09b58, 0xbf8a4a, 0xdcaa68].map(lin), deskaNowa: lin(0xefcb8e), deskaStara: lin(0xa8814f),
  belka: lin(0x9a6a3b), pal: lin(0x875a32), zastrzal: lin(0xa2703f), porecz: lin(0xc79357), szpara: lin(0x3a2616),
  drzewce: lin(0x7a5a38), choragiew: [0xe0483a, 0xf2c94a, 0xf6efe0, 0x5fae4a, 0x4a8fd8].map(lin),
  donica: lin(0xc8683e), donicaC: lin(0x9e4e2c), krzak: lin(0x5fa83e), krzakJ: lin(0x8fd05a), kwiat: [0xffe36a, 0xff8fb0, 0xffffff].map(lin),
  // kamień schodów: ciepły, jasny (jak głazy na łące po `przemalujGlazy`), chłodny spód, ciemne fugi
  kamien: [0xe6dcc6, 0xdbd0b8, 0xece3cf, 0xd4cab2, 0xe2d6bc].map(lin), kamienC: lin(0x9d998f), fuga: lin(0x6a6255),
  mech: lin(0x72a83a), mechJ: lin(0xa6d45a), mechC: lin(0x4d812b),
  // trawa: paleta dywanu kępek z main.js (clumpTexture) — nasada → czubek
  trawa: [lin(0x609e2a), lin(0x92d038), lin(0xbeec54), lin(0xe4fa8a)],
};

// ============================== BUDOWNICZY GEOMETRII (bez indeksu) ==============================
// Stos przekształceń 3×4; prymitywy w swoim układzie, trójkąty same pilnują nawinięcia na zewnątrz.
// Kolor może być funkcją punktu w układzie MODELU (p → [r,g,b]) — tak siedzi mech i AO na kamieniu.
// `naZiemi(1)`: wierzchołki z y ≈ 0 (w układzie modelu) dostają znacznik stopy → Zbior dociąga je do gruntu.
const A0 = [0, 0, 0];
class Bud {
  constructor() {
    this.P = []; this.N = []; this.C = []; this.A = []; this.S = [];
    this.M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    this.st = []; this.lak = A0; this.stopa = 0; this._nm = null;
  }
  get nv() { return this.P.length / 3; }
  push() { this.st.push([this.M.slice(), this.lak, this.stopa]); return this; }
  pop() { const [m, a, s] = this.st.pop(); this.M = m; this.lak = a; this.stopa = s; this._nm = null; return this; }
  _mnoz(b) {
    const a = this.M, r = new Array(12);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++)
      r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + (j === 3 ? a[i * 4 + 3] : 0);
    this.M = r; this._nm = null; return this;
  }
  tr(x, y, z) { return this._mnoz([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]); }
  rotX(a) { const c = Math.cos(a), s = Math.sin(a); return this._mnoz([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]); }
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return this._mnoz([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]); }
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return this._mnoz([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]); }
  skal(x, y = x, z = x) { return this._mnoz([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0]); }
  naZiemi(v = 1) { this.stopa = v; return this; }
  wiatr(a = A0) { this.lak = a; return this; }
  _p(p) { const m = this.M, x = p[0], y = p[1], z = p[2]; return [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]]; }
  _n(n) {
    if (!this._nm) {
      const m = this.M, a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
      this._nm = [e * i - f * h, f * g - d * i, d * h - e * g, c * h - b * i, a * i - c * g, b * g - a * h, b * f - c * e, c * d - a * f, a * e - b * d];
    }
    const k = this._nm, x = n[0], y = n[1], z = n[2];
    const nx = k[0] * x + k[1] * y + k[2] * z, ny = k[3] * x + k[4] * y + k[5] * z, nz = k[6] * x + k[7] * y + k[8] * z;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  }
  _v(p, n, k, a) {
    const c = typeof k === 'function' ? k(p) : k, aa = a || this.lak;
    this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.C.push(c[0], c[1], c[2]);
    this.A.push(aa[0], aa[1], aa[2]); this.S.push(this.stopa && p[1] < 0.004 ? 1 : 0);
  }
  triOut(a, b, c, out, k, kb = k, kc = k) {
    if (out && dot3(normTri(a, b, c), out) < 0) { const t = b; b = c; c = t; const u = kb; kb = kc; kc = u; }
    const A = this._p(a), B = this._p(b), C = this._p(c), n = normTri(A, B, C);
    this._v(A, n, k); this._v(B, n, kb); this._v(C, n, kc);
    return this;
  }
  quadOut(a, b, c, d, out, k) { this.triOut(a, b, c, out, k); return this.triOut(a, c, d, out, k); }
  triN(a, na, b, nb, c, nc, ka, kb = ka, kc = ka) {
    const s = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
    if (dot3(normTri(a, b, c), s) < 0) { let t = b; b = c; c = t; t = nb; nb = nc; nc = t; t = kb; kb = kc; kc = t; }
    this._v(this._p(a), this._n(na), ka); this._v(this._p(b), this._n(nb), kb); this._v(this._p(c), this._n(nc), kc);
    return this;
  }
  // prostopadłościan ze ściętymi krawędziami (faza łapie jasne pasmo toon — bryła czyta się miękko)
  //   o.faz, o.kol = { py, ny, px, nx, pz, nz } (kolor albo funkcja punktu), o.bezDna, o.bez = ['pz', …]
  pudlo(x0, y0, z0, x1, y1, z1, k, o = {}) {
    const f = Math.max(0, Math.min(o.faz == null ? 0.015 : o.faz, (x1 - x0) * 0.45, (y1 - y0) * 0.45, (z1 - z0) * 0.45));
    const kf = o.kol || {}, bez = o.bez || [], dno = !o.bezDna;
    const lo = [x0, y0, z0], hi = [x1, y1, z1], ilo = [x0 + f, y0 + f, z0 + f], ihi = [x1 - f, y1 - f, z1 - f];
    const W = (s, os) => [0, 1, 2].map(ax => (ax === os ? (s[ax] > 0 ? hi[ax] : lo[ax]) : (s[ax] > 0 ? ihi[ax] : ilo[ax])));
    const nazwa = (os, zn) => (zn > 0 ? 'p' : 'n') + 'xyz'[os];
    const kol = (os, zn) => kf[nazwa(os, zn)] || k;
    for (let os = 0; os < 3; os++) for (const zn of [-1, 1]) {
      if ((!dno && os === 1 && zn < 0) || bez.includes(nazwa(os, zn))) continue;
      const a1 = (os + 1) % 3, a2 = (os + 2) % 3;
      const S = (u, v) => { const s = [0, 0, 0]; s[os] = zn; s[a1] = u; s[a2] = v; return W(s, os); };
      const out = [0, 0, 0]; out[os] = zn;
      this.quadOut(S(-1, -1), S(1, -1), S(1, 1), S(-1, 1), out, kol(os, zn));
    }
    if (f <= 1e-5) return this;
    for (let c = 0; c < 3; c++) {
      const a = (c + 1) % 3, b = (c + 2) % 3;
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
        if (!dno && ((a === 1 && sa < 0) || (b === 1 && sb < 0))) continue;
        const s0 = [0, 0, 0], s1 = [0, 0, 0]; s0[a] = s1[a] = sa; s0[b] = s1[b] = sb; s0[c] = -1; s1[c] = 1;
        const out = [0, 0, 0]; out[a] = sa; out[b] = sb;
        const kk = (a === 1 && sa > 0) || (b === 1 && sb > 0) ? kol(1, 1) : (a === 1 ? kol(b, sb) : kol(a, sa));
        this.quadOut(W(s0, a), W(s1, a), W(s1, b), W(s0, b), out, kk);
      }
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      if (!dno && sy < 0) continue;
      const s = [sx, sy, sz];
      this.triOut(W(s, 0), W(s, 1), W(s, 2), s, sy > 0 ? kol(1, 1) : kol(0, sx));
    }
    return this;
  }
  // bryła obrotowa wokół Y; prof = [[r, y, kolor?, ostry?, [nr, ny]?], …] od dołu; o.kFn(i, j, k) → kolor ćwiartki
  lathe(prof, seg, o = {}) {
    const n = prof.length, a0 = o.a0 || 0, a1 = o.a1 == null ? TAU : o.a1, rFn = o.rFn;
    const sn = [];
    for (let i = 0; i < n - 1; i++) {
      const dr = prof[i + 1][0] - prof[i][0], dy = prof[i + 1][1] - prof[i][1], l = Math.hypot(dr, dy) || 1;
      sn.push([dy / l, -dr / l]);
    }
    const nPkt = (i, odc) => {
      if (prof[i][4]) return prof[i][4];
      if (prof[i][3]) return sn[odc];
      const a = sn[i - 1] || sn[i], b = sn[i] || sn[i - 1], l = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
      return [(a[0] + b[0]) / l, (a[1] + b[1]) / l];
    };
    for (let i = 0; i < n - 1; i++) {
      const r0 = prof[i][0], y0 = prof[i][1], r1 = prof[i + 1][0], y1 = prof[i + 1][1];
      const n0 = nPkt(i, i), n1 = nPkt(i + 1, i), k0 = prof[i][2] || o.k;
      for (let j = 0; j < seg; j++) {
        const t0 = a0 + (a1 - a0) * j / seg, t1 = a0 + (a1 - a0) * (j + 1) / seg;
        const m0 = rFn ? rFn(t0) : 1, m1 = rFn ? rFn(t1) : 1;
        const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
        const kk = o.kFn ? o.kFn(i, j, k0) : k0;
        const A = [c0 * r0 * m0, y0, s0 * r0 * m0], B = [c1 * r0 * m1, y0, s1 * r0 * m1], C = [c1 * r1 * m1, y1, s1 * r1 * m1], D = [c0 * r1 * m0, y1, s0 * r1 * m0];
        const nA = [c0 * n0[0], n0[1], s0 * n0[0]], nB = [c1 * n0[0], n0[1], s1 * n0[0]];
        const nC = [c1 * n1[0], n1[1], s1 * n1[0]], nD = [c0 * n1[0], n1[1], s0 * n1[0]];
        if (r0 > 1e-6) this.triN(A, nA, B, nB, C, nC, kk);
        if (r1 > 1e-6) this.triN(A, nA, C, nC, D, nD, kk);
      }
    }
    return this;
  }
  kula(r, seg, pier, k, o = {}) {
    const prof = [], f0 = o.od == null ? -Math.PI / 2 : o.od, f1 = o.do == null ? Math.PI / 2 : o.do;
    for (let i = 0; i <= pier; i++) {
      const f = f0 + (f1 - f0) * i / pier, c = Math.cos(f), s = Math.sin(f);
      prof.push([Math.max(0, c) * r, s * r, o.kFn ? o.kFn(s) : k, false, [c, s]]);
    }
    return this.lathe(prof, seg, { k, rFn: o.rFn, kFn: o.kFnJ });
  }
  walec(r0, r1, y0, y1, seg, k, o = {}) {
    const dr = r0 - r1, h = y1 - y0, l = Math.hypot(dr, h) || 1, nb = [h / l, dr / l];
    this.lathe([[r0, y0, k, false, nb], [r1, y1, k, false, nb]], seg, { k });
    if (o.dol) this.lathe([[0, y0, o.kDol || k, false, [0, -1]], [r0, y0, o.kDol || k, false, [0, -1]]], seg, {});
    if (o.gora) this.lathe([[r1, y1, o.kGora || k, false, [0, 1]], [0, y1, o.kGora || k, false, [0, 1]]], seg, {});
    return this;
  }
  // belka (prostopadłościan) między dwoma punktami: przekrój w × h (h wzdłuż „góry" belki)
  belka(a, b, w, h, k, o = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1;
    this.push().tr(a[0], a[1], a[2]);
    const ay = Math.atan2(dx, dz), ax = Math.atan2(Math.hypot(dx, dz), dy);   // oś Y → kierunek a→b
    this.rotY(ay).rotX(ax);
    this.pudlo(-w / 2, 0, -h / 2, w / 2, L, h / 2, k, o);
    this.pop();
    return this;
  }
  // płaski wielokąt (XY, patrzy w +Z), wachlarz od pierwszego punktu
  wielokat(pkt, k, out = [0, 0, 1]) {
    for (let i = 1; i < pkt.length - 1; i++)
      this.triOut([pkt[0][0], pkt[0][1], 0], [pkt[i][0], pkt[i][1], 0], [pkt[i + 1][0], pkt[i + 1][1], 0], out, k);
    return this;
  }
  dysk(r, seg, k, rx = r) {
    for (let i = 0; i < seg; i++) {
      const t0 = TAU * i / seg + Math.PI / 2, t1 = TAU * (i + 1) / seg + Math.PI / 2;
      this.triOut([0, 0, 0], [Math.cos(t0) * rx, Math.sin(t0) * r, 0], [Math.cos(t1) * rx, Math.sin(t1) * r, 0], [0, 0, 1], k);
    }
    return this;
  }
  // KĘPKA TRAWY (jak dywan w grze): n ostrzy, dwustronne, bez światła, kołysane wiatrem (aLak.x = wysokość)
  kepka(R, n = 6, h = 0.36, rozrzut = 0.1, sila = 1) {
    const T = K.trawa;
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, r = Math.sqrt(R()) * rozrzut, bx = Math.cos(a) * r, bz = Math.sin(a) * r;
      const o = R() * Math.PI, w = 0.022 + R() * 0.018, hh = h * (0.6 + R() * 0.55);
      const lx = (bx / (rozrzut || 1)) * hh * 0.35 + (R() - 0.5) * hh * 0.3, lz = (bz / (rozrzut || 1)) * hh * 0.35 + (R() - 0.5) * hh * 0.3;
      const cx = Math.cos(o) * w, cz = Math.sin(o) * w, j = 0.92 + R() * 0.16;
      const P0 = [bx - cx, 0, bz - cz], P1 = [bx + cx, 0, bz + cz];
      const M0 = [bx - cx * 0.7 + lx * 0.4, hh * 0.55, bz - cz * 0.7 + lz * 0.4], M1 = [bx + cx * 0.7 + lx * 0.4, hh * 0.55, bz + cz * 0.7 + lz * 0.4];
      const Tp = [bx + lx, hh, bz + lz];
      const k0 = mn(T[0], j), k1 = mn(T[1], j), k2 = mn(miesz(T[2], T[3], 0.6), j);
      const aw = y => [y * sila, 0, 1];
      const up = [0, 1, 0];
      for (const [p, q, r2, kp, kq, kr] of [[P0, P1, M1, k0, k0, k1], [P0, M1, M0, k0, k1, k1], [M0, M1, Tp, k1, k1, k2]]) {
        const A = this._p(p), B = this._p(q), C = this._p(r2);
        this._v(A, up, kp, aw(p[1])); this._v(B, up, kq, aw(q[1])); this._v(C, up, kr, aw(r2[1]));
        this._v(A, up, kp, aw(p[1])); this._v(C, up, kr, aw(r2[1])); this._v(B, up, kq, aw(q[1]));
      }
    }
    return this;
  }
  // tanie AO: przyciemnienie wierzchołków od `od` wg wysokości w układzie modelu
  ao(od, y0, y1, dol = 0.72, gora = 1.0) {
    for (let i = od; i < this.nv; i++) {
      const t = sstep(y0, y1, this.P[i * 3 + 1]), k = dol + (gora - dol) * t;
      this.C[i * 3] *= k; this.C[i * 3 + 1] *= k; this.C[i * 3 + 2] *= k;
    }
    return this;
  }
  prefab() {
    const n = this.nv;
    return { n, P: new Float32Array(this.P), N: new Float32Array(this.N), C: new Float32Array(this.C),
             A: new Float32Array(this.A), S: new Uint8Array(this.S) };
  }
}
// liść / płat dwustronny z wielokąta (XY, lokalnie), kolor od nasady ku czubkowi, waga wiatru ∝ wysokości
function liscDwustronny(b, pkt, hh, kDol, kGora, wiatr = 0.9, bezSw = 0.3) {
  const lok = pkt.map(v => [v[0], v[1], 0]), sw = lok.map(v => b._p(v));
  const kol = i => (lok[i][1] > hh * 0.5 ? kGora : kDol), aw = i => [lok[i][1] * wiatr, 0, bezSw];
  for (let q = 1; q < lok.length - 1; q++) {
    const n = normTri(sw[0], sw[q], sw[q + 1]), ni = [-n[0], -n[1], -n[2]];
    b._v(sw[0], n, kol(0), aw(0)); b._v(sw[q], n, kol(q), aw(q)); b._v(sw[q + 1], n, kol(q + 1), aw(q + 1));
    b._v(sw[0], ni, kol(0), aw(0)); b._v(sw[q + 1], ni, kol(q + 1), aw(q + 1)); b._v(sw[q], ni, kol(q), aw(q));
  }
}

// ============================== SKRZYNIA NA WARZYWA (zamknięta) ==============================
// W × D × H, środek podstawy w (0,0,0), wierzch wieka DOKŁADNIE na y = H. Słupki w rogach (wystają 2 cm przed
// deski — ciemne krawędzie czytają bryłę z daleka), boki z desek ze szparami, wieko z desek wzdłuż X.
//   o.drewno 0–3, o.tresc: 'jablka' | 'marchew' | 'ziemniaki' | 'kapusta' | 'pomidory',
//   o.szpara: w wieku brakuje środkowej deski → widać warzywa, nać wystaje i kołysze się na wietrze,
//   o.azur: skrzynka ażurowa — szerokie szpary, w środku kolorowo od warzyw (widać z góry i z boku),
//   o.stempel: 0 pomidor · 1 marchewka · 2 jabłko · 3 etykieta · −1 brak, o.bokStempla: 'pz' | 'px' | 'nx' | 'nz',
//   o.plachta: bok, przez który zwisa jutowa płachta narzucona na wieko (null = bez),
//   o.ziemia: podstawa dociągana do gruntu, o.ziarno
const TRESC = {
  jablka: { dno: [0.42, 0.10, 0.07], kol: 'jablko' }, marchew: { dno: [0.45, 0.18, 0.05], kol: 'marchew' },
  ziemniaki: { dno: [0.30, 0.21, 0.11], kol: 'ziemniak' }, kapusta: { dno: [0.16, 0.30, 0.10], kol: 'kapusta' },
  pomidory: { dno: [0.45, 0.08, 0.06], kol: 'pomidor' },
};
const KAT_BOKU = { pz: 0, px: Math.PI / 2, nz: Math.PI, nx: -Math.PI / 2 };
function skrzynia(o = {}) {
  const W = o.W || 1.4, D = o.D || 1.4, H = o.H || 0.9, azur = !!o.azur;
  const R = prng((o.ziarno || 1) * 7 + 3);
  const DR = DREWNA[(o.drewno || 0) % DREWNA.length], TR = TRESC[o.tresc || 'jablka'];
  const kolT = K[TR.kol], kolC = K[TR.kol + 'C'] || mn(kolT, 0.7);
  const jit = (c, a = 0.06) => mn(c, 1 - a + R() * 2 * a);
  const sl = 0.12, t = 0.05, wc = 0.022, lt = 0.06;             // słupek, grubość deski, cofnięcie boku za lico słupka, wieko
  const b = new Bud();
  const od = b.nv;
  if (o.ziemia) b.naZiemi(1);
  // SŁUPKI w rogach
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x0 = sx > 0 ? W / 2 - sl : -W / 2, z0 = sz > 0 ? D / 2 - sl : -D / 2;
    b.pudlo(x0, 0, z0, x0 + sl, H - lt, z0 + sl, jit(DR.slupek, 0.05), { faz: 0.018, bezDna: true });
  }
  // BOKI: deski poziome ze szparami; górna deska dochodzi do wieka. Na ziemi dolna deska zaczyna się od 0 —
  // jej spód schodzi razem ze słupkami do gruntu na stoku.
  const nb = azur ? 2 : H >= 0.75 ? 4 : H >= 0.5 ? 3 : 2, g = azur ? 0.1 : 0.036, y0 = o.ziemia ? 0 : 0.025, y1 = H - lt;
  const ph = (y1 - y0 - (nb - 1) * g) / nb;
  const deskiBoku = (os, zn) => {
    for (let i = 0; i < nb; i++) {
      const ya = y0 + i * (ph + g), yb = i === nb - 1 ? y1 : ya + ph;
      const kol = jit(DR.deski[Math.floor(R() * DR.deski.length)]);
      if (os === 'z') {
        const zo = zn * (D / 2 - wc), zi = zn * (D / 2 - wc - t);
        b.pudlo(-W / 2 + sl * 0.5, ya, Math.min(zo, zi), W / 2 - sl * 0.5, yb, Math.max(zo, zi), kol, { faz: 0, bezDna: true, bez: [zn > 0 ? 'nz' : 'pz'] });
      } else {
        const xo = zn * (W / 2 - wc), xi = zn * (W / 2 - wc - t);
        b.pudlo(Math.min(xo, xi), ya, -D / 2 + sl * 0.5, Math.max(xo, xi), yb, D / 2 - sl * 0.5, kol, { faz: 0, bezDna: true, bez: [zn > 0 ? 'nx' : 'px'] });
      }
    }
  };
  deskiBoku('z', 1); deskiBoku('z', -1); deskiBoku('x', 1); deskiBoku('x', -1);
  // WNĘTRZE (widać przez szpary): ciemne w odcieniu zawartości; ażurowa — jasno od warzyw, wierzch w kropki
  const iw = W / 2 - wc - t - 0.004, id = D / 2 - wc - t - 0.004;
  const kWn = azur ? mn(kolT, 0.62) : mn(TR.dno, 0.55);
  const kGora = azur ? mn(kolC, 0.42) : kWn;
  b.pudlo(-iw, o.ziemia ? 0 : 0.02, -id, iw, H - lt - (azur ? 0.05 : 0.004), id, kWn, { faz: 0, bezDna: true, kol: { py: kGora } });
  b.ao(od, 0, H * 0.7, o.ziemia ? 0.7 : 0.84, 1.03);
  b.naZiemi(0);
  // UCHWYTY: wycięcia na dłoń w górnej desce boków ±X (ciemne, zaokrąglone)
  if (H >= 0.7 && !azur) for (const sx of [-1, 1])
    b.push().tr(sx * (W / 2 - wc + 0.004), y1 - ph * 0.5, 0).rotY(sx * Math.PI / 2).dysk(0.04, 8, K.wnetrze, 0.13).pop();
  // WIEKO: deski wzdłuż X na całą szerokość; `szpara` = bez środkowej deski, ażurowa = 4 deski z szerokimi szparami
  const nl = azur ? 4 : Math.max(3, Math.round(D / 0.29)), gl = azur ? 0.075 : 0.03, pw = (D - (nl - 1) * gl) / nl;
  const brak = o.szpara && !azur ? Math.floor(nl / 2) : -1;
  for (let i = 0; i < nl; i++) {
    if (i === brak) continue;
    const za = -D / 2 + i * (pw + gl), zb = za + pw;
    const kol = jit(DR.wieko[Math.floor(R() * DR.wieko.length)], 0.07);
    b.pudlo(-W / 2, H - lt, za, W / 2, H, zb, kol, { faz: 0.016, bezDna: true, kol: { px: mn(kol, 0.78), nx: mn(kol, 0.78) } });   // słoje na końcach ciemniejsze
    for (const sx of [-1, 1]) b.push().tr(sx * (W / 2 - sl / 2), H + 0.003, (za + zb) / 2).rotX(-Math.PI / 2).dysk(0.016, 4, K.gwozdz).pop();
  }
  // ażurowa: kilka warzyw pod szparami wieka (garby, nie płaska plama)
  if (azur) for (let i = 0; i < nl - 1; i++) for (let j = 0; j < 3; j++) {
    const z = -D / 2 + (i + 1) * (pw + gl) - gl / 2 + (R() - 0.5) * 0.03, x = (j - 1) * W * 0.3 + (R() - 0.5) * 0.12, rr = 0.07 + R() * 0.025;
    b.push().tr(x, H - lt - 0.02 - rr * 0.2, z).kula(rr, 6, 3, kolT, { kFn: s => s > 0.45 ? miesz(kolT, [1, 1, 1], 0.32) : s < -0.2 ? kolC : kolT }).pop();
  }
  if (brak >= 0) {
    // WARZYWA w szparze: kulki pod wiekiem (wystają 3–4 cm) + 2–3 pęki naci / liści ponad wiekiem (kołyszą się)
    const za = -D / 2 + brak * (pw + gl) - gl, zb = za + pw + 2 * gl, zm = (za + zb) / 2;
    const nKul = Math.round(W / 0.2);
    for (let i = 0; i < nKul; i++) {
      const x = -W / 2 + sl + (i + 0.5) * (W - 2 * sl) / nKul + (R() - 0.5) * 0.05, rr = 0.085 + R() * 0.03;
      b.push().tr(x, H - lt - 0.06 + rr * 0.6, zm + (R() - 0.5) * 0.06).skal(1, 0.9, 1)
        .kula(rr, 6, 3, kolT, { kFn: s => s > 0.55 ? miesz(kolT, [1, 1, 1], 0.25) : miesz(kolC, kolT, s * 0.5 + 0.5) }).pop();
    }
    if (o.tresc === 'marchew' || o.tresc === 'ziemniaki' || R() < 0.6) {     // nać (marchew) / liście — wystają nad wieko
      const nP = 2 + Math.floor(R() * 2);
      for (let p = 0; p < nP; p++) {
        const x = (p - (nP - 1) / 2) * (W * 0.55 / Math.max(1, nP - 1)) + (R() - 0.5) * 0.1;
        b.push().tr(x, H - lt - 0.04, zm + (R() - 0.5) * 0.05);
        for (let l = 0; l < 4; l++) {
          const a = l / 4 * TAU + R(), hh = 0.2 + R() * 0.12, ww = 0.04;
          b.push().rotY(a).rotX(0.35 + R() * 0.3);
          liscDwustronny(b, [[-ww, 0], [ww, 0], [ww * 1.4, hh * 0.6], [0, hh], [-ww * 1.4, hh * 0.6]], hh, K.nac, K.nacJ, 0.9, 0.3);
          b.pop();
        }
        b.pop();
      }
    }
  }
  // STEMPEL na wybranym boku (farba przez deski i szpary, jak szablon) — duży, żeby czytał się z kamery gry
  const st = o.stempel == null ? 0 : o.stempel;
  if (st >= 0 && !azur) {
    const bok = o.bokStempla || 'pz';
    const glb = (bok === 'pz' || bok === 'nz' ? D : W) / 2 - wc + 0.004, szer = bok === 'pz' || bok === 'nz' ? W : D;
    const ys = Math.min(H * 0.5, H - lt - 0.24), s = clamp(H / 0.9, 0.75, 1.15) * 1.55;
    b.push().rotY(KAT_BOKU[bok]).tr((R() - 0.5) * szer * 0.12, ys, glb).skal(s);
    const farba = mn(K.farba, 0.95 + R() * 0.1);
    if (st === 0) {                                   // pomidor z listkami
      b.dysk(0.13, 12, farba, 0.15);
      for (let i = 0; i < 5; i++) {
        const a = Math.PI / 2 + (i - 2) * 0.5;
        b.triOut([Math.cos(a) * 0.02, 0.11 + Math.sin(a) * 0.02, 0.002], [Math.cos(a - 0.3) * 0.1, 0.12 + Math.sin(a - 0.3) * 0.07, 0.002],
          [Math.cos(a + 0.3) * 0.1, 0.12 + Math.sin(a + 0.3) * 0.07, 0.002], [0, 0, 1], K.farbaZ);
      }
    } else if (st === 1) {                            // marchewka po skosie
      b.push().rotZ(-0.6);
      b.wielokat([[0, -0.16], [0.07, 0.08], [0.04, 0.1], [-0.04, 0.1], [-0.07, 0.08]], lin(0xd9702a));
      for (const a of [-0.5, 0, 0.5]) b.push().tr(0, 0.1, 0.002).rotZ(a).wielokat([[-0.02, 0], [0.02, 0], [0, 0.12]], K.farbaZ).pop();
      b.pop();
    } else if (st === 2) {                            // jabłko z listkiem
      b.dysk(0.12, 12, farba, 0.13);
      b.push().tr(0.0, 0.1, 0.002).wielokat([[-0.012, 0], [0.012, 0], [0.012, 0.07], [-0.012, 0.07]], K.farbaC).pop();
      b.push().tr(0.02, 0.14, 0.003).rotZ(-0.7).wielokat([[0, 0], [0.04, 0.03], [0.07, 0], [0.04, -0.03]], K.farbaZ).pop();
    } else {                                          // etykieta: ramka i „linijki"
      for (const [x, y, w, h] of [[-0.2, -0.09, 0.4, 0.02], [-0.2, 0.07, 0.4, 0.02], [-0.2, -0.09, 0.02, 0.18], [0.18, -0.09, 0.02, 0.18],
                                  [-0.14, 0.01, 0.28, 0.022], [-0.14, -0.035, 0.18, 0.022]])
        b.wielokat([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], K.farbaC);
    }
    b.pop();
  }
  // OBRUS W KRATKĘ narzucony na wieko i zwisający przez krawędź (jak stolik w kratkę w modele-skrzynie.js):
  // czerwień na drewnie czyta się z kamery gry — jutowa płachta ginęła w kolorze desek. Fałdy w kolorze i w kształcie,
  // dół lekko trzepocze na wietrze.
  if (o.plachta) {
    const glb = (o.plachta === 'pz' || o.plachta === 'nz' ? D : W) / 2, szer = (o.plachta === 'pz' || o.plachta === 'nz' ? W : D);
    const pw2 = szer * (0.6 + R() * 0.12), xo = (R() - 0.5) * (szer - pw2) * 0.8, fz = R() * 6;
    // stacje przekroju co ~0,16: [z (od środka ku krawędzi), y, udział zwisu w normalnej (z), udział wierzchu (y)]
    const stac = [[glb - 0.62, H + 0.012, 0, 1], [glb - 0.44, H + 0.014, 0, 1], [glb - 0.26, H + 0.016, 0, 1], [glb - 0.08, H + 0.016, 0.1, 1],
                  [glb + 0.02, H + 0.006, 0.7, 0.7], [glb + 0.028, H - 0.17, 1, 0], [glb + 0.034, H - 0.36, 1, 0]];
    const nu = 6, kCz = lin(0xd9473a), kKr = lin(0xf6ecd6);
    b.push().rotY(KAT_BOKU[o.plachta]);
    const pkt = (i, j) => {
      const u = j / nu, [z, y] = stac[i], zwis = clamp((H - y) / 0.37, 0, 1);
      const x = xo + (u - 0.5) * pw2 * (1 + 0.08 * zwis);
      return [x, y - (i === stac.length - 1 ? 0.045 * Math.sin(u * 7 + fz) : 0), z + 0.03 * Math.sin(u * Math.PI * 3 + fz) * zwis];
    };
    for (let i = 0; i < stac.length - 1; i++) for (let j = 0; j < nu; j++) {
      const A = pkt(i, j), B = pkt(i, j + 1), C = pkt(i + 1, j + 1), Dd = pkt(i + 1, j);
      const out = [0, (stac[i][3] + stac[i + 1][3]) / 2, (stac[i][2] + stac[i + 1][2]) / 2];
      const f = 0.88 + 0.12 * Math.cos(((j + 0.5) / nu) * Math.PI * 3 + fz), kol = mn((i + j) % 2 ? kCz : kKr, f);
      if (i >= 4) b.wiatr([0, (i - 3) * 0.012, 0.12]);
      b.quadOut(A, B, C, Dd, out, kol);
      b.wiatr();
    }
    b.pop();
  }
  return b.prefab();
}

// ============================== DROBIAZGI NA ZIEMI (bez kolizji) ==============================
function worek(ziarno) {
  const R = prng(ziarno * 13 + 5), b = new Bud().naZiemi(1);
  const nap = R() * 0.04;
  const prof = [[0.27, 0.0], [0.32 + nap, 0.14], [0.31 + nap, 0.34], [0.2, 0.5], [0.075, 0.58], [0.075, 0.61], [0.14, 0.69], [0.0, 0.74]]
    .map(([r, y]) => [r, y, null, false]);
  b.lathe(prof, 8, { k: K.worek, kFn: (i, j, k0) => (i === 4 ? K.sznur : i >= 5 ? K.worekC : (j % 3 === 0 ? K.worekC : K.worek)),
                      rFn: a => 1 + 0.05 * Math.sin(a * 3 + ziarno) });
  b.ao(0, 0, 0.4, 0.72, 1.0);
  b.naZiemi(0);
  // pasy na worku (farba) — dwa łuki z przodu
  b.push().tr(0, 0.3, 0.335 + nap).dysk(0.08, 8, K.worekP, 0.1).pop();
  return b.prefab();
}
function dynia(ziarno) {
  const R = prng(ziarno * 17 + 1), b = new Bud().naZiemi(1), r = 0.24 + R() * 0.06;
  const prof = [];
  for (let i = 0; i <= 5; i++) { const f = -Math.PI / 2 + Math.PI * i / 5; prof.push([Math.cos(f) * r, (Math.sin(f) + 1) * r * 0.72, null, false, [Math.cos(f), Math.sin(f)]]); }
  b.lathe(prof, 12, { k: K.dynia, kFn: (i, j) => (j % 2 ? K.dyniaC : (i >= 3 ? K.dyniaJ : K.dynia)), rFn: a => 1 + 0.07 * Math.cos(a * 6) });
  b.ao(0, 0, r * 0.8, 0.78, 1.0);
  b.naZiemi(0);
  b.push().tr(0, r * 1.38, 0).rotZ(0.3).walec(0.03, 0.022, 0, 0.11, 5, K.lodyga, { gora: true }).pop();
  return b.prefab();
}
function kapusta(ziarno) {
  const R = prng(ziarno * 19 + 7), b = new Bud().naZiemi(1), r = 0.2 + R() * 0.05;
  b.push().tr(0, 0, 0).kula(r, 9, 5, K.kapusta, { od: -0.25, kFn: s => miesz(K.kapustaC, K.kapusta, sstep(-0.3, 0.8, s)) }).pop();
  for (let i = 0; i < 6; i++) {                     // liście odchylone na boki (dwustronne)
    const a = i / 6 * TAU + R() * 0.4;
    b.push().tr(Math.cos(a) * r * 0.7, r * 0.15, Math.sin(a) * r * 0.7).rotY(-a + Math.PI / 2).rotX(-0.9);
    const pk = [[0, 0], [0.12, 0.04], [0.15, 0.14], [0.06, 0.2], [-0.06, 0.2], [-0.15, 0.14], [-0.12, 0.04]];
    b.wielokat(pk, K.kapustaC); b.wielokat(pk, K.kapusta, [0, 0, -1]);
    b.pop();
  }
  return b.prefab();
}
function jablka(ziarno) {
  const R = prng(ziarno * 23 + 11), b = new Bud().naZiemi(1);
  const n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, d = 0.12 + R() * 0.25, r = 0.075 + R() * 0.015;
    const kol = R() < 0.25 ? K.jablkoZ : K.jablko;
    b.push().tr(Math.cos(a) * d, 0, Math.sin(a) * d).tr(0, r * 0.85, 0)
      .kula(r, 6, 3, kol, { kFn: s => s > 0.4 ? miesz(kol, K.jablkoJ, 0.5) : kol }).pop();
  }
  return b.prefab();
}

// ============================== PODEST: TARAS WIDOKOWY NA PALACH ==============================
// Pomost 5,4 × 5,4, wierzch na YT = 2,28 (= kolizja: g0 + 2,1 + 0,18). Deski wzdłuż Z ze szparami i gwoździami
// nad legarami, oblamówka dookoła, 4 grube pale na kamiennych stopach, owiązane sznurem pod podciągiem (BotW),
// krzyżulce na 4 bokach (widać, że pod spód się nie wejdzie — kolizja pomostu sięga gruntu), balustrada od −X
// z chorągiewkami na sznurku i latarenką na drzewcu, doniczka w rogu, drabinka od stopnia (skrzynia 1,6 × 1,1 × 1,6
// w +3,6 — dokłada ją Zbior osobno, też stoi na gruncie).
const YT = 2.28, PH = 2.7;
function podest(ziarno) {
  const R = prng(ziarno * 29 + 3), b = new Bud();
  const jit = (c, a = 0.06) => mn(c, 1 - a + R() * 2 * a);
  const dt = 0.075, fasc = 0.08;                     // grubość desek, grubość oblamówki
  // KONSTRUKCJA od góry: deski (wzdłuż Z) → legary (wzdłuż X, 5 szt., skrajne nad palami) → podciągi (wzdłuż Z,
  // na palach) → pale. Oblamówka (fascia) na obwodzie zasłania czoła legarów.
  const nd = 11, gd = 0.035, szer = (2 * (PH - fasc) - (nd - 1) * gd) / nd;
  const pp = 2.3, pr = 0.22;                         // pale: środek ±2,3, połowa grubości
  const legary = [-pp, -1.15, 0, 1.15, pp], yL1 = YT - dt - 0.006, yL0 = yL1 - 0.18, yP1 = yL0, yP0 = yP1 - 0.24;
  for (let i = 0; i < nd; i++) {
    const xa = -PH + fasc + i * (szer + gd), xb = xa + szer;
    const r = R(), kol = r < 0.12 ? jit(K.deskaNowa, 0.04) : r < 0.22 ? jit(K.deskaStara, 0.05) : jit(K.deska[Math.floor(R() * K.deska.length)]);
    const styk = R() < 0.4 ? legary[1 + Math.floor(R() * 3)] : null;       // styk dwóch kawałków deski — zawsze na legarze
    const kaw = styk == null ? [[-PH + fasc, PH - fasc]] : [[-PH + fasc, styk - 0.008], [styk + 0.008, PH - fasc]];
    for (const [za, zb] of kaw) b.pudlo(xa, YT - dt, za, xb, YT, zb, styk == null ? kol : jit(kol, 0.05), { faz: 0.016, bezDna: true });
    for (const z of [-pp, 0, pp]) for (const dx of [0.28, 0.72])      // gwoździe: rzędy nad legarami
      b.push().tr(xa + szer * dx, YT + 0.003, z).rotX(-Math.PI / 2).dysk(0.016, 4, K.gwozdz).pop();
    if (styk != null) for (const dx of [0.28, 0.72]) for (const s of [-1, 1])
      b.push().tr(xa + szer * dx, YT + 0.003, styk + s * 0.05).rotX(-Math.PI / 2).dysk(0.016, 4, K.gwozdz).pop();
  }
  // ciemne pod szparami (z góry i od spodu — inaczej przez szpary widać trawę albo niebo)
  const yS = YT - dt - 0.002, e0 = -PH + fasc, e1 = PH - fasc;
  b.quadOut([e0, yS, e0], [e1, yS, e0], [e1, yS, e1], [e0, yS, e1], [0, 1, 0], K.szpara);
  b.quadOut([e0, yS - 0.001, e0], [e1, yS - 0.001, e0], [e1, yS - 0.001, e1], [e0, yS - 0.001, e1], [0, -1, 0], K.szpara);
  for (const z of legary) b.pudlo(e0, yL0, z - 0.07, e1, yL1, z + 0.07, jit(K.belka, 0.05), { faz: 0, bez: ['py'] });
  for (const sx of [-1, 1]) b.pudlo(sx * pp - 0.16, yP0, e0, sx * pp + 0.16, yP1, e1, jit(K.belka, 0.05), { faz: 0.02 });
  // OBLAMÓWKA (fascia): 4 deski na obwodzie, wierzch na równi z pomostem
  const fk = jit(K.belka, 0.04), fy0 = YT - 0.36;
  b.pudlo(-PH, fy0, PH - fasc, PH, YT, PH, fk, { faz: 0.018 });
  b.pudlo(-PH, fy0, -PH, PH, YT, -PH + fasc, fk, { faz: 0.018 });
  b.pudlo(-PH, fy0, -PH + fasc, -PH + fasc, YT, PH - fasc, mn(fk, 0.97), { faz: 0.018 });
  b.pudlo(PH - fasc, fy0, -PH + fasc, PH, YT, PH - fasc, mn(fk, 0.97), { faz: 0.018 });
  // PALE na KAMIENNYCH STOPACH (stopy schodzą do terenu) + SZNUR pod podciągiem
  const od = b.nv;
  b.naZiemi(1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.pudlo(sx * pp - pr, 0, sz * pp - pr, sx * pp + pr, yP0 + 0.005, sz * pp + pr, jit(K.pal, 0.05), { faz: 0.035, bezDna: true });
    const kk = mn(K.kamien[Math.floor(R() * K.kamien.length)], 0.92);
    b.push().tr(sx * pp, 0, sz * pp).rotY((R() - 0.5) * 0.5)
      .pudlo(-0.37, 0, -0.34, 0.37, 0.2 + R() * 0.05, 0.34, p => mn(kk, 0.78 + 0.22 * sstep(0, 0.2, p[1])), { faz: 0.07, bezDna: true }).pop();
  }
  b.naZiemi(0);
  b.ao(od, 0, 1.2, 0.66, 1.0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [yP0 - 0.1, yP0 - 0.17, yP0 - 0.24])
    b.push().tr(sx * pp, 0, sz * pp).rotY(Math.PI / 4).walec(pr * 1.36, pr * 1.36, y, y + 0.05, 8, mn(K.sznur, 0.92 + R() * 0.16)).pop();
  // KRZYŻULCE na 4 bokach (na licu pali od zewnątrz; drugi o grubość dalej, żeby się nie przenikały)
  const xk = jit(K.zastrzal, 0.04), yk0 = 0.28, yk1 = yP0 - 0.3, wk = pp - pr - 0.02;
  for (const zn of [-1, 1]) {
    const z = zn * (pp + pr - 0.04);
    b.belka([-wk, yk0, z], [wk, yk1, z], 0.08, 0.15, xk, { faz: 0 });          // belka: w = grubość w głąb, h = szerokość w płaszczyźnie
    b.belka([wk, yk0, z + zn * 0.08], [-wk, yk1, z + zn * 0.08], 0.08, 0.15, mn(xk, 0.95), { faz: 0 });
  }
  for (const xn of [-1, 1]) {
    const x = xn * (pp + pr - 0.04);
    b.belka([x, yk0, -wk], [x, yk1, wk], 0.08, 0.15, xk, { faz: 0 });
    b.belka([x + xn * 0.08, yk0, wk], [x + xn * 0.08, yk1, -wk], 0.08, 0.15, mn(xk, 0.95), { faz: 0 });
  }
  // BALUSTRADA od −X: słupki, poręcz, przeciąg
  const bx = -PH + 0.07, hB = 0.95, pk = jit(K.porecz, 0.04);
  const zs = [-2.62, -1.31, 0, 1.31, 2.62];
  for (const z of zs) b.pudlo(bx - 0.065, YT, z - 0.065, bx + 0.065, YT + hB, z + 0.065, jit(pk, 0.04), { faz: 0.02, bezDna: true });
  b.pudlo(bx - 0.08, YT + hB - 0.02, -2.7, bx + 0.08, YT + hB + 0.065, 2.7, mn(pk, 1.04), { faz: 0.024 });
  b.pudlo(bx - 0.035, YT + 0.42, -2.62, bx + 0.035, YT + 0.51, 2.62, mn(pk, 0.95), { faz: 0.012 });
  // DRZEWCE w rogu (−X, +Z) z proporczykiem + sznurek chorągiewek do rogu (−X, −Z) + latarenka na wysięgniku
  const dz = 2.62, hD = 2.25;
  b.pudlo(bx - 0.05, YT + hB, dz - 0.05, bx + 0.05, YT + hD, dz + 0.05, K.drzewce, { faz: 0.015, bezDna: true });
  b.push().tr(bx, YT + hD + 0.04, dz).kula(0.065, 6, 3, K.choragiew[1]).pop();
  const flaga = (pkt3, kol, trzepot) => {           // trójkąt dwustronny w świecie modelu; mocowanie (p0, p1) stoi, czubek trzepocze
    const [p0, p1, p2] = pkt3, n = normTri(p0, p1, p2), ni = [-n[0], -n[1], -n[2]];
    const w = i => [i === 2 ? 0.25 : 0.02, i === 2 ? trzepot : 0, 0.25];
    b._v(p0, n, kol, w(0)); b._v(p1, n, kol, w(1)); b._v(p2, n, kol, w(2));
    b._v(p0, ni, mn(kol, 0.9), w(0)); b._v(p2, ni, mn(kol, 0.9), w(2)); b._v(p1, ni, mn(kol, 0.9), w(1));
  };
  const kp = K.choragiew[Math.floor(R() * 2)];
  flaga([[bx, YT + hD - 0.05, dz], [bx, YT + hD - 0.44, dz], [bx + 0.08, YT + hD - 0.25, dz - 0.66]], kp, 0.14);
  const A = [bx, YT + hD - 0.5, dz - 0.05], B = [bx, YT + hB + 0.065, -2.62], nF = 9;
  const pkt = t => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - Math.sin(t * Math.PI) * 0.28, A[2] + (B[2] - A[2]) * t];
  for (let i = 0; i < 12; i++) b.belka(pkt(i / 12), pkt((i + 1) / 12), 0.02, 0.02, K.sznur, { faz: 0 });
  for (let i = 0; i < nF; i++) {
    const t0 = (i + 0.18) / nF, t1 = (i + 0.82) / nF, a = pkt(t0), c = pkt(t1), m = pkt((t0 + t1) / 2);
    flaga([a, c, [m[0] + 0.01, m[1] - 0.27, m[2]]], K.choragiew[(i + (ziarno & 3)) % K.choragiew.length], 0.1);
  }
  // latarenka: wysięgnik nad pomostem, klatka z ciemnych listewek, szybki świecą ciepło (bez światła = „żarzy się")
  const ly = YT + 1.62;
  b.belka([bx, ly, dz - 0.04], [bx + 0.36, ly, dz - 0.04], 0.04, 0.04, K.drzewce, { faz: 0 });
  b.push().tr(bx + 0.33, ly - 0.05, dz - 0.04).wiatr([0.05, 0, 0]);
  b.pudlo(-0.075, -0.24, -0.075, 0.075, -0.05, 0.075, lin(0xffd27a), { faz: 0.01, kol: { py: lin(0x4a3322), ny: lin(0x4a3322) } });
  b.wiatr([0.05, 0, 1]);
  b.pudlo(-0.06, -0.23, -0.078, 0.06, -0.06, 0.078, lin(0xffe7a6), { faz: 0 });
  b.pudlo(-0.078, -0.23, -0.06, 0.078, -0.06, 0.06, lin(0xffe7a6), { faz: 0 });
  b.wiatr([0.05, 0, 0]);
  b.pudlo(-0.095, -0.06, -0.095, 0.095, -0.02, 0.095, lin(0x4a3322), { faz: 0.01 });
  b.pudlo(-0.09, -0.27, -0.09, 0.09, -0.235, 0.09, lin(0x4a3322), { faz: 0.01 });
  b.pop();
  // DONICZKA w rogu (−X, −Z) przy balustradzie: kwiatki dla koloru
  b.push().tr(-PH + 0.42, YT, -PH + 0.42);
  b.walec(0.2, 0.25, 0, 0.3, 9, K.donica, { gora: false });
  b.walec(0.26, 0.26, 0.26, 0.34, 9, K.donicaC, { gora: true, kGora: lin(0x5a3a22) });
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU + R(), r = i ? 0.12 : 0;
    b.push().tr(Math.cos(a) * r, 0.36 + (i ? 0 : 0.06), Math.sin(a) * r).kula(0.13, 6, 3, K.krzak, { kFn: s => s > 0.3 ? K.krzakJ : K.krzak }).pop();
  }
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + R() * 0.5, r = 0.08 + R() * 0.1;
    b.push().tr(Math.cos(a) * r, 0.5 + R() * 0.08, Math.sin(a) * r).kula(0.045, 4, 2, K.kwiat[i % 3]).pop();
  }
  b.pop();
  // DRABINKA ze stopnia (wierzch skrzyni 1,1 w x 2,8…4,4) na pomost — mówi „tędy na górę" (wskakuje się i tak)
  const dA = [3.12, 1.1], dB = [PH + 0.03, YT + 0.32], dzs = 0.27, kd = jit(K.porecz, 0.05);
  for (const s of [-1, 1]) b.belka([dA[0], dA[1], s * dzs], [dB[0], dB[1], s * dzs], 0.07, 0.07, kd, { faz: 0.012 });
  for (let i = 1; i <= 3; i++) {
    const t = i / 4, x = dA[0] + (dB[0] - dA[0]) * t, y = dA[1] + (dB[1] - dA[1]) * t;
    b.belka([x, y, -dzs - 0.03], [x, y, dzs + 0.03], 0.055, 0.055, mn(kd, 0.94), { faz: 0 });
  }
  return b.prefab();
}

// ============================== SCHODY KAMIENNE ==============================
// 3 stopnie: stopień k zajmuje x ∈ [−1,5; 1,5], z ∈ [−0,75 + 1,5k; 0,75 + 1,5k], wierzch 0,6·(k+1).
// Każdy stopień = warstwy po 0,6 (stopień k ma k+1 warstw) z bloków w wiązaniu (fugi przesunięte między
// warstwami), wierzchnia warstwa = płyty z nosem 4 cm nad niższym stopniem, lekko krzywe i nierówne (±1 cm).
// Fugi ciemne (rdzeń pod blokami), zielony nalot tylko u samego dołu (kolor wierzchołków), plamy mchu = GEOMETRIA:
// poduchy w kątach przy wyższym stopniu i zwisające z nosów, kępki trawy w szczelinach, gruz u podstawy.
// ⚠️ Mech z szumu w kolorze wierzchołków wyglądał źle: ścianka pudła ma wierzchołki tylko w rogach, więc plama
// rozmazywała się w oliwkową smugę przez całą płytę (kamień wychodził szarozielony).
function schody(wariant) {
  const R = prng(wariant * 31 + 17), b = new Bud();
  const kamienKol = () => { const k = K.kamien[Math.floor(R() * K.kamien.length)]; return mn(k, 0.95 + R() * 0.1); };
  // kolor kamienia: nalot u samego dołu, reszta czysty, ciepły kamień (×1,08–1,12: boki są w paśmie cienia)
  const kolorKamienia = (baza, gorny) => p => {
    const mech = (1 - sstep(0.0, 0.28, p[1])) * 0.45 * (0.7 + 0.6 * szum(p[0] * 2.3 + wariant, p[2] * 2.3));
    const c = miesz(baza, K.mechC, mech);
    return mn(c, (0.86 + 0.14 * sstep(0.0, 0.6, p[1])) * (gorny ? 1.12 : 1.08));
  };
  // RDZEŃ: ciemna bryła pod blokami (fugi prześwitują na ciemno)
  for (let k = 0; k < 3; k++) {
    const z0 = -0.75 + 1.5 * k, h = 0.6 * (k + 1);
    b.naZiemi(1);
    b.pudlo(-1.47, 0, z0 + 0.02, 1.47, h - 0.03, z0 + 1.48, K.fuga, { faz: 0, bezDna: true });
    b.naZiemi(0);
  }
  const fg = 0.024;                                  // połowa fugi
  for (let k = 0; k < 3; k++) {
    const z0 = -0.75 + 1.5 * k, z1 = z0 + 1.5;
    for (let j = 0; j <= k; j++) {
      const y0 = 0.6 * j, y1 = 0.6 * (j + 1), gorna = j === k;
      // podział warstwy na 2–3 bloki; w wiązaniu (kolejne warstwy przesunięte)
      const n = R() < 0.55 ? 2 : 3, cuts = [-1.5];
      for (let i = 1; i < n; i++) cuts.push(-1.5 + 3 * i / n + (R() - 0.5) * 0.5 + ((j + k) % 2 ? 0.35 : -0.35) / n);
      cuts.push(1.5);
      // wierzchnia warstwa najwyższego stopnia: płyty w dwóch rzędach (posadzka)
      const rzedyZ = gorna && k === 2 ? [[z0, z0 + 0.7 + (R() - 0.5) * 0.2], null] : [[z0, z1]];
      if (rzedyZ[1] === null) rzedyZ[1] = [rzedyZ[0][1], z1];
      for (const [za, zb] of rzedyZ) for (let i = 0; i < cuts.length - 1; i++) {
        const xa = cuts[i] + (i ? fg : 0), xb = cuts[i + 1] - (i < cuts.length - 2 ? fg : 0);
        const dy = gorna ? (R() - 0.5) * 0.028 : 0;
        const nos = gorna && za === z0 ? 0.045 : 0;    // nos stopnia wystaje nad niższy
        const zaa = za + (za === z0 ? -nos : fg), zbb = zb - (zb === z1 ? 0 : fg);
        const ya = y0 + (j ? fg : 0), yb = y1 + dy - (gorna ? 0 : fg);
        const baza = kamienKol();
        // ściany schowane w bryle: przód niższych warstw (za niższym stopniem), tył stopni 0–1 (za wyższym)
        const bez = [];
        if (k > 0 && !gorna && za === z0) bez.push('nz');
        if (k < 2 && zb === z1) bez.push('pz');
        b.naZiemi(j === 0 ? 1 : 0);
        b.push();
        if (gorna) {
          const cx = (xa + xb) / 2, cz = (zaa + zbb) / 2;
          b.tr(cx, 0, cz).rotY((R() - 0.5) * 0.03).rotZ((R() - 0.5) * 0.014).rotX((R() - 0.5) * 0.012).tr(-cx, 0, -cz);
        }
        b.pudlo(xa, ya, zaa, xb, yb, zbb, kolorKamienia(baza, gorna), { faz: gorna ? 0.07 : 0.045, bezDna: true, bez });
        b.pop();
        b.naZiemi(0);
      }
    }
  }
  // PODUCHY MCHU: skupiska w kątach przy wyższym stopniu (tam wilgoć), płaskie, kilka nachodzących na siebie
  const poducha = (x, y, z, sx, sz, h = 0.05) => {
    const j = 0.9 + R() * 0.2, kM = mn(K.mech, j), kJ = mn(K.mechJ, j);
    b.push().tr(x, y - 0.01, z).rotY(R() * TAU).skal(sx, h / 0.14, sz).kula(0.14, 7, 3, kM, { od: 0, kFn: s => s > 0.6 ? kJ : miesz(K.mechC, kM, s * 1.4) }).pop();
  };
  for (let k = 0; k < 3; k++) {
    const zTyl = -0.75 + 1.5 * k + 1.5, y = 0.6 * (k + 1);
    const nGr = 1 + Math.floor(R() * 2);
    for (let g = 0; g < nGr; g++) {
      const gx = (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.85);
      const nP = 3 + Math.floor(R() * 3);
      if (R() < 0.7) b.push().tr(gx + (R() - 0.5) * 0.2, y + 0.02, k < 2 ? zTyl - 0.12 : zTyl - 0.6).kepka(R, 4, 0.22 + R() * 0.1, 0.06).pop();
      for (let i = 0; i < nP; i++) {
        const x = gx + (R() - 0.5) * 0.38;
        if (k < 2) poducha(x, y, zTyl - 0.08 - R() * 0.14, 1.4 + R() * 1.4, 1.0 + R() * 0.8);
        else poducha(x, y, zTyl - 0.2 - R() * 1.0, 1.2 + R() * 1.2, 1.1 + R() * 0.9, 0.045);
      }
    }
    // mech zwisający z nosa stopnia (pół poduchy za krawędzią)
    if (R() < 0.8) {
      const x = (R() - 0.5) * 2.2;
      b.push().tr(x, y - 0.06, -0.75 + 1.5 * k - 0.03).rotX(-Math.PI / 2 + 0.25).skal(1.1 + R() * 0.8, 0.4, 0.8)
        .kula(0.14, 7, 3, K.mech, { od: 0, kFn: s => s > 0.6 ? K.mechJ : K.mech }).pop();
    }
  }
  // KĘPKI TRAWY w szczelinach: w kątach stopni i na wierzchu najwyższego
  const kepka = (x, y, z, n, h, roz = 0.08) => { b.push().tr(x, y - 0.02, z).kepka(R, n, h, roz).pop(); };
  for (let k = 0; k < 3; k++) {
    const y = 0.6 * (k + 1), zTyl = -0.75 + 1.5 * k + 1.5;
    for (let i = 0; i < 2 + Math.floor(R() * 2); i++) {
      const x = (R() - 0.5) * 2.7;
      if (k < 2) kepka(x, y, zTyl - 0.06, 5, 0.28 + R() * 0.14);
      else kepka(x, y, -0.75 + 1.5 * k + 0.15 + R() * 1.2, 4, 0.22 + R() * 0.1);
    }
  }
  // GRUZ u podstawy (kamyki z fazą, lekko zapadnięte)
  for (let i = 0; i < 3; i++) {
    const sx = R() < 0.5 ? -1 : 1, x = sx * (1.62 + R() * 0.3), z = -0.9 + R() * 3.5, s = 0.11 + R() * 0.1;
    b.push().tr(x, 0, z).rotY(R() * TAU).rotZ((R() - 0.5) * 0.4).naZiemi(1)
      .pudlo(-s, 0, -s * 0.8, s, s * 1.1, s * 0.8, kolorKamienia(kamienKol(), true), { faz: s * 0.35, bezDna: true }).naZiemi(0).pop();
  }
  // kwiatki w mchu (białe i żółte kropki) — akcent jak łany na łące
  for (let i = 0; i < 5; i++) {
    const k = Math.floor(R() * 3), y = 0.6 * (k + 1) + 0.035, z = -0.75 + 1.5 * k + 1.5 - 0.12;
    b.push().tr((R() - 0.5) * 2.4, y, k < 2 ? z : z - R() * 1.1).kula(0.04, 5, 2, K.kwiat[i % 3 === 1 ? 2 : i % 2]).pop();
  }
  return b.prefab();
}

// ============================== CACHE PREFABÓW ==============================
const _cache = new Map();
function pf(klucz, bud) { let p = _cache.get(klucz); if (!p) { p = bud(); _cache.set(klucz, p); } return p; }
const TRESCI = ['jablka', 'marchew', 'ziemniaki', 'kapusta', 'pomidory'];
// skrzynia z cache: klucz = wymiary + wariant (0–7 → drewno, zawartość, szpara, stempel) + opcje miejsca w stosie
function skrzyniaW(W, D, H, war, o = {}) {
  const drewno = war % 4, tresc = TRESCI[(war * 3 + 1) % 5], st = [0, 1, 2, 3, 0, 2, 3, 1][war % 8];
  const sz = o.plachta ? false : o.szpara == null ? war % 3 === 1 : o.szpara, bok = o.bok || 'pz';
  return pf(`s|${W}|${D}|${H}|${war}|${o.ziemia ? 1 : 0}|${bok}|${sz ? 1 : 0}|${o.azur ? 1 : 0}|${o.plachta || '-'}`,
    () => skrzynia({ W, D, H, drewno, tresc, szpara: sz, stempel: st, bokStempla: bok, ziemia: !!o.ziemia, azur: !!o.azur,
                     plachta: o.plachta || null, ziarno: war * 5 + Math.round(H * 10) }));
}

// ============================== ZBIÓR STRUKTUR CHUNKA → JEDNA GEOMETRIA ==============================
export const WYMIARY = {
  // kontrakt z kolizjami w main.js (buildChunk, gałąź Łąk): [dx, dz, top]; hw/hl kolumn stosu 0,7, stopnia 0,8
  stos: [[0, 0, 0.9], [1.5, 0.3, 1.7], [0.7, 1.6, 1.3]],
  podest: { hw: 2.7, top: YT, stopien: { dx: 3.6, hw: 0.8, top: 1.1 } },
  schody: { hw: 1.5, hl: 0.75, krok: 1.5, wys: 0.6, n: 3 },
};
// zestaw prefabów jednego wariantu stosu (w0 = 0–7) — wspólny dla `stos` i `rozgrzej`
function prefabyStosu(w0) {
  // A (0, 0) h 0,9: wolne boki to −X i −Z (+X zasłania B, +Z — C); stempel na jednym, obrus na drugim
  const bokA = w0 % 2 ? 'nz' : 'nx', plA = w0 % 3 !== 0 ? (bokA === 'nx' ? 'nz' : 'nx') : null;
  const w1 = (w0 + 5) % 8, w2 = (w0 + 3) % 8, w3 = (w0 + 6) % 8, w4 = (w0 + 1) % 8;
  return {
    plA,
    A: skrzyniaW(1.4, 1.4, 0.9, w0, { ziemia: true, bok: bokA, plachta: plA }),
    B0: skrzyniaW(1.4, 1.4, 0.9, w1, { ziemia: true, bok: 'px', szpara: false }),
    B1: skrzyniaW(1.34, 1.34, 0.8, w2, { bok: w2 % 2 ? 'px' : 'nz' }),
    C0: skrzyniaW(1.4, 1.4, 0.85, w3, { ziemia: true, bok: 'nx', szpara: false }),
    C1: skrzyniaW(1.36, 1.36, 0.45, w4, { azur: true }),
    worek: pf('worek|' + (w0 % 3), () => worek(w0 % 3)), dynia: pf('dynia|' + (w0 % 2), () => dynia(w0 % 2)),
    kapusta: pf('kapusta|' + (w0 % 2), () => kapusta(w0 % 2)), jablka: pf('jablka|' + (w0 % 4), () => jablka(w0 % 4)),
  };
}
const krokPodestu = w => skrzyniaW(1.6, 1.6, 1.1, [2, 5, 7][w], { ziemia: true, bok: 'px', szpara: false });
// ROZGRZEWKA: wszystkie warianty (8 stosów, 3 podesty, 4 schody) liczone raz, np. przy tworzeniu materiału
// w ekranie ładowania — zimny prefab to do ~16 ms, a nowy wariant wpadał w bieg przy przekroczeniu granicy chunka
export function rozgrzej() {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  for (let w = 0; w < 8; w++) prefabyStosu(w);
  for (let w = 0; w < 3; w++) { pf('podest|' + w, () => podest(w)); krokPodestu(w); }
  for (let w = 0; w < 4; w++) pf('schody|' + w, () => schody(w));
  return { prefaby: _cache.size, ms: typeof performance !== 'undefined' ? +(performance.now() - t0).toFixed(1) : 0 };
}
export class Zbior {
  constructor() { this.el = []; this.nv = 0; this.struktury = 0; }
  get pusty() { return this.el.length === 0; }
  _dodaj(p, x, y, z, yaw = 0, ziemia = false) { this.el.push({ p, x, y, z, yaw, ziemia }); this.nv += p.n; }
  // STOS SKRZYŃ: `obroty` = 3 liczby 0–1 z rng chunka (dawniej rotation.y = r·0,5; kolizja i tak osiowa) →
  // teraz ±2° dla skrzyń na ziemi (nie wystają poza kolizję), górne skrzynie ±4–5° z ziarna pozycji
  // (wystają o 2–3 cm — stos ma wyglądać na ułożony ręką, nie jak 3 kostki)
  stos(x, z, g0, obroty = [0.5, 0.5, 0.5]) {
    const R = prng(ziarnoXZ(x, z)), w0 = Math.floor(R() * 8), S = prefabyStosu(w0);
    const kat = i => ((obroty[i] == null ? 0.5 : obroty[i]) - 0.5) * 0.07;
    this._dodaj(S.A, x, g0, z, kat(0));
    // B (1,5; 0,3) h 1,7: skrzynia 0,9 + węższa 0,8 skręcona o kilka stopni
    this._dodaj(S.B0, x + 1.5, g0, z + 0.3, kat(1));
    this._dodaj(S.B1, x + 1.5 + (R() - 0.5) * 0.05, g0 + 0.9, z + 0.3 + (R() - 0.5) * 0.05, kat(1) + (R() < 0.5 ? -1 : 1) * (0.05 + R() * 0.04));
    // C (0,7; 1,6) h 1,3: skrzynia 0,85 + płytka AŻUROWA 0,45 (widać warzywa w środku)
    this._dodaj(S.C0, x + 0.7, g0, z + 1.6, kat(2));
    this._dodaj(S.C1, x + 0.7, g0 + 0.85, z + 1.6, kat(2) + (R() < 0.5 ? -1 : 1) * (0.04 + R() * 0.04));
    // DROBIAZGI na ziemi przy wolnych bokach (bez kolizji, niskie): zawsze 2–3 z 4 miejsc
    const miejsca = [
      () => this._dodaj(S.worek, S.plA === 'nx' ? x + 0.1 : x - 1.0, g0, S.plA === 'nx' ? z - 1.02 : z - 0.12, (R() - 0.5) * 0.8, 'dekor'),
      () => this._dodaj(S.dynia, x + 1.55 + (R() - 0.5) * 0.3, g0, z - 0.72, R() * TAU, 'dekor'),
      () => this._dodaj(S.kapusta, x + 2.47, g0, z + 0.2 + (R() - 0.5) * 0.3, R() * TAU, 'dekor'),
      () => this._dodaj(S.jablka, x + 1.9 + (R() - 0.5) * 0.2, g0, z + 1.55 + R() * 0.15, R() * TAU, 'dekor'),
    ];
    const pomin = Math.floor(R() * 4), dwa = R() < 0.4;
    miejsca.forEach((f, i) => { if (i !== pomin && !(dwa && i === (pomin + 2) % 4)) f(); });
    this.struktury++;
    return this;
  }
  podest(x, z, g0) {
    const w = (ziarnoXZ(x, z) >>> 0) % 3;
    this._dodaj(pf('podest|' + w, () => podest(w)), x, g0, z, 0);
    this._dodaj(krokPodestu(w), x + 3.6, g0, z, 0);
    this.struktury++;
    return this;
  }
  schody(x, z, g0) {
    const w = (ziarnoXZ(x, z) >>> 0) % 4;
    this._dodaj(pf('schody|' + w, () => schody(w)), x, g0, z, 0);
    this.struktury++;
    return this;
  }
  // grunt(x, z) → wysokość rysowanego terenu (main.js: gruntDoSadzenia). Stopy schodzą do gruntu, gdy ten jest
  // niżej niż podstawa (na stoku); wyżej — bryła po prostu wchodzi w zbocze.
  geo(THREE, grunt = null) {
    if (!this.el.length) return null;
    const n = this.nv, P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), A = new Float32Array(n * 3);
    // grunt z pamięcią: ta sama stopa występuje w 3–6 trójkątach (geometria bez indeksu), a grunt w grze to 5 × terrainH
    const pam = new Map(), gr = grunt && ((x, z) => {
      const k = Math.round(x * 64) * 131071 + Math.round(z * 64);
      let v = pam.get(k); if (v === undefined) { v = grunt(x, z); pam.set(k, v); }
      return v;
    });
    let o = 0;
    for (const e of this.el) {
      const p = e.p, c = Math.cos(e.yaw), s = Math.sin(e.yaw), m = p.n;
      const ey = e.ziemia === 'dekor' && gr ? gr(e.x, e.z) - 0.03 : e.y;   // drobiazgi stoją na SWOIM gruncie
      for (let i = 0; i < m; i++) {
        const i3 = i * 3, lx = p.P[i3], ly = p.P[i3 + 1], lz = p.P[i3 + 2];
        const wx = e.x + lx * c + lz * s, wz = e.z - lx * s + lz * c;
        let wy = ey + ly;
        if (p.S[i] && gr) { const g = gr(wx, wz) - 0.05; if (g < wy) wy = Math.max(g, wy - 8); }
        const o3 = (o + i) * 3;
        P[o3] = wx; P[o3 + 1] = wy; P[o3 + 2] = wz;
        const nx = p.N[i3], nz = p.N[i3 + 2];
        N[o3] = nx * c + nz * s; N[o3 + 1] = p.N[i3 + 1]; N[o3 + 2] = -nx * s + nz * c;
        C[o3] = p.C[i3]; C[o3 + 1] = p.C[i3 + 1]; C[o3 + 2] = p.C[i3 + 2];
        A[o3] = p.A[i3]; A[o3 + 1] = p.A[i3 + 1]; A[o3 + 2] = p.A[i3 + 2];
      }
      o += m;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setAttribute('aLak', new THREE.BufferAttribute(A, 3));
    g.computeBoundingSphere();
    return g;
  }
}
// trójkąty prefabów (podgląd, HUD): { stos, podest, schody }
export function liczTrojkaty() {
  const z = new Zbior(); z.stos(0, 0, 0); const a = z.nv / 3;
  const zp = new Zbior(); zp.podest(0, 0, 0); const b = zp.nv / 3;
  const zs = new Zbior(); zs.schody(0, 0, 0); const c = zs.nv / 3;
  return { stos: a, podest: b, schody: c };
}
export function wyczyscCache() { _cache.clear(); }

// ============================== MATERIAŁ (toon + ton cienia + połysk krawędzi + wiatr + cień chmur) ==============================
// o.czas   — { value } sekundy (w grze: windU z main.js — ten sam wiatr co dywan trawy)
// o.chmury — { tex: { value }, off: { value }, skala } — cień chmur jak addCloudShadow (liczony tu, patrz pułapki)
// o.pasma / o.progi / o.tonCienia / o.rim — jak materialSkrzyn
export function materialLak(THREE, o = {}) {
  const pas = o.pasma || [0.72, 0.30, 0.30], progi = o.progi || [-0.16, 0.06, 0.26, 0.52];
  const ton = o.tonCienia === false ? null : (o.tonCienia || [0.84, 0.9, 1.07]);
  const rim = o.rim == null ? 0.16 : o.rim;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const U = { uCzas: o.czas || { value: 0 } };
  if (o.chmury) { U.uCloud = o.chmury.tex; U.uCloudOff = o.chmury.off; mat.defines = { LAK_CHMURY: '' }; }
  const skala = ((o.chmury && o.chmury.skala) || 0.016).toFixed(5);
  const f = v => v.toFixed(3);
  mat.userData.U = U;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = `attribute vec3 aLak;
      uniform float uCzas;
      varying vec3 vLakW; varying float vLakBez;
      ` + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLakBez = aLak.z;
        if (aLak.x + aLak.y > 0.0) {
          // ten sam wiatr co dywan kępek (makeBladeMaterial): dwie fale + poryw; faza z pozycji w świecie
          vec3 _wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
          float _g = max(0.0, sin(uCzas * 0.6 - _wp.x * 0.055 - _wp.z * 0.04)); _g = _g * _g * _g;
          float _sw = (sin(uCzas * 2.2 + _wp.x * 0.45 + _wp.z * 0.35) * 0.28 + sin(uCzas * 0.7 + _wp.x * 0.08) * 0.10 + _g * 0.15) * aLak.x;
          transformed.x += _sw; transformed.z += _sw * 0.45;
          // trzepot chorągiewek: fala wzdłuż płata, po normalnej
          float _t = sin(uCzas * 7.5 + _wp.x * 2.3 + _wp.z * 1.9 + _wp.y * 3.1) * (0.6 + 0.4 * _g);
          transformed += objectNormal * _t * aLak.y;
        }`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vLakW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    const chunk = 'float _cienSw = 1.0;\n' + THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
      'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
      `float rawNL = dot( geometryNormal, directLight.direction );
       float _b1 = smoothstep( ${f(progi[0])}, ${f(progi[1])}, rawNL );
       float _b2 = smoothstep( ${f(progi[2])}, ${f(progi[3])}, rawNL );
       float dotNL = ${f(pas[0])} + ${f(pas[1])} * _b1 + ${f(pas[2])} * _b2;` + (ton ? `
       dotNL = mix( ${f(pas[0])}, dotNL, _cienSw );` : ''))
      .replace('vec3 irradiance = dotNL * directLight.color;', ton
        ? `vec3 irradiance = dotNL * directLight.color * mix( vec3( ${f(ton[0])}, ${f(ton[1])}, ${f(ton[2])} ), vec3( 1.0 ), _cienSw * _b1 );`
        : 'vec3 irradiance = dotNL * directLight.color;');
    let fs = sh.fragmentShader;
    if (ton) fs = fs.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
      'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]',
      '_cienSw = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]'));
    fs = `varying vec3 vLakW; varying float vLakBez;
      #ifdef LAK_CHMURY
        uniform sampler2D uCloud; uniform vec2 uCloudOff;
      #endif
      ` + fs
      .replace('#include <lights_lambert_pars_fragment>', chunk)
      .replace('#include <opaque_fragment>', `
        // jasne pasmo na sylwetce (Genshin): bryła odcina się od trawy
        vec3 _V = normalize( vViewPosition );
        float _rim = smoothstep( 0.66, 0.92, 1.0 - saturate( dot( normal, _V ) ) );
        outgoingLight += _rim * ${f(rim)} * diffuseColor.rgb * ( 1.0 - vLakBez );
        // trawa w szczelinach: bez światła, jak kępki dywanu (MeshBasic) — inaczej odcinałaby się od łąki;
        // liście i chorągiewki częściowo (miękkie światło przez płat)
        outgoingLight = mix( outgoingLight, diffuseColor.rgb * mix( 0.8, 1.0, _cienSw ), vLakBez );
        #include <opaque_fragment>`)
      .replace('#include <fog_fragment>', `
        #ifdef LAK_CHMURY
          float _cs = texture2D( uCloud, vLakW.xz * ${skala} + uCloudOff ).r;
          gl_FragColor.rgb *= mix( 0.74, 1.04, _cs );
        #endif
        #include <fog_fragment>`);
    sh.fragmentShader = fs;
  };
  const klucz = 'modele-laki-v1|' + [pas, progi, ton, rim, !!o.chmury].join('|');
  mat.customProgramCacheKey = () => klucz;
  mat.needsUpdate = true;
  return mat;
}
