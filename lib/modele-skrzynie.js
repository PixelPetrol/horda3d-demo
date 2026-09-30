// ╔══════════════ SKRZYNIE I KAPLICZKI 3D (30.09.2026) ══════════════╗
// Życzenie właściciela: „do poprawy skrzynki i te kapliczki — dałoby się zrobić 3D, ładne, pasujące
// do stylu?". Wszystko liczone w kodzie (zero plików z sieci), bez tekstur — kolor siedzi
// w wierzchołkach, światło to 3 pasma toon jak `naturaMat` / `materialOsiedla`.
//
// MODELE (`model(THREE, nazwa)` → { nazwa, czesci: [{ nazwa, geo, pivot?, cien? }], wys, r }):
//   skrzynka        — otwarta łubianka z warzywniaka z kopcem warzyw, części korpus + zawartosc (kopiec wyskakuje przy zebraniu)
//   zlota           — kufer z okuciami i świecącym zamkiem, w środku złoto (korpus + wieko)
//   kapral          — ten sam kufer: ciemna śliwka + fiolet elit (korpus + wieko)
//   don             — ten sam kufer: czarny lakier + złoto + czerwona wstęga (na E4; w grze dziś nie stoi)
//   garnek          — Garnek Nonny: emaliowany garnek w czerwone kropki na trójnogu nad ogniskiem
//                     (korpus + pokrywka + ogien — płomienie osobno, żeby gasły skalą instancji)
//   witryna         — Garnek w markecie: otwarta witryna chłodnicza z produktami (jedna część)
//   stolnica        — E3 §1.4: stolnica z wałkiem, kopczykiem mąki z żółtkiem, kulą ciasta
//   stolWyzwania    — E3 §1.5: stolik w czerwoną kratkę, Chianti ze świeczką, nóż LEŻY (korpus + noz)
//   stolWyzwaniaPo  — to samo, nóż WBITY w blat
//   piknik          — E3 §2.3: koc w kratkę + wiklinowy kosz łupu (korpus + klapaL + klapaP)
// Każda część jest BufferGeometry BEZ INDEKSU z atrybutami position / normal / color / aFx (vec4):
//   aFx.x = emisja (świeci kolorem wierzchołka), aFx.y = metal (toon-połysk + przebieg światła),
//   aFx.z = obrys (odwrócona powłoka, rysowana bez światła), aFx.w = drganie płomienia (0 u nasady → 1 na czubku).
// Części ANIMOWANE mają `pivot` = punkt obrotu w układzie modelu, a ich geometria jest zbudowana
// względem tego punktu (zawias wieka, środek pokrywki, nasada płomieni). Y w górę, przód = +Z,
// środek podstawy w (0, 0, 0).
//
// OBRYS: ciemna, odwrócona powłoka (inverted hull) wbudowana w tę samą geometrię — 0 dodatkowych
// draw calli. Sprite'y postaci mają ciemny kontur z pixel artu; skrzynie i kapliczki to obiekty
// DO ZEBRANIA, więc kontur odróżnia je od tła (trawa, drzewa i bloki konturu nie mają).
//
// RYSOWANIE W GRZE: `ZestawModeli` = jedna InstancedMesh na część modelu (np. 9 skrzynek = 2 draw
// calle + 2 w cieniu). Instancja: macierz, jasność (instanceColor) i atrybut aIn (vec3):
//   aIn.x = mnożnik emisji (puls światła, zgaszony ogień), aIn.y = faza przebiegu połysku, aIn.z = siła połysku.
// `EfektySkrzyn` = promienie w górę, blaski na ziemi, para i iskry — po jednej InstancedMesh na rodzaj.
//
// ⚠️ PUŁAPKI (z osiedla): (1) klucz programu three = onBeforeCompile.toString() + parametry, więc
// materiał ma WŁASNY customProgramCacheKey; (2) cień chmur jest liczony TU (opcja `chmury`), a nie
// przez addCloudShadow z main.js — podwójne owinięcie redefiniowało `vWPos` i psuło shader;
// (3) łatki szukają `#include <…>` w NIEROZWINIĘTYM shaderze, więc ten materiał nie może być potem
// owijany cudzymi łatkami na te same kotwice.
// ╚═══════════════════════════════════════════════════════════════════╝

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
function normTri(A, B, C) {
  const e1x = B[0] - A[0], e1y = B[1] - A[1], e1z = B[2] - A[2];
  const e2x = C[0] - A[0], e2y = C[1] - A[1], e2z = C[2] - A[2];
  const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ============================== BUDOWNICZY GEOMETRII (bez indeksu) ==============================
// Stos przekształceń 3×4 (wierszami) — prymitywy budują się w swoim układzie, a `tr/rotX/rotY/rotZ/skal`
// ustawiają je w modelu. Normalne przez macierz kofaktorów (poprawne też przy skali niejednorodnej).
// Wszystkie trójkąty same pilnują nawinięcia na zewnątrz (`*Out`) — zero ręcznego liczenia kolejności.
const FX0 = [0, 0, 0, 0];
class Bud {
  constructor() {
    this.P = []; this.N = []; this.C = []; this.F = [];
    this.M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    this.S = []; this.fx = FX0; this._nm = null;
  }
  get nv() { return this.P.length / 3; }
  push() { this.S.push([this.M.slice(), this.fx]); return this; }
  pop() { const [m, fx] = this.S.pop(); this.M = m; this.fx = fx; this._nm = null; return this; }
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
  efekt(e = 0, m = 0, w = 0) { this.fx = [e, m, 0, w]; return this; }
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
  _v(p, n, k, fx) {
    this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]);
    this.C.push(k[0], k[1], k[2]); this.F.push(fx[0], fx[1], fx[2], fx[3]);
  }
  // trójkąt płaski (punkty lokalne); `out` = lokalny kierunek „na zewnątrz"
  triOut(a, b, c, out, k, kb = k, kc = k) {
    if (out && dot3(normTri(a, b, c), out) < 0) { const t = b; b = c; c = t; const u = kb; kb = kc; kc = u; }
    const A = this._p(a), B = this._p(b), C = this._p(c), n = normTri(A, B, C);
    this._v(A, n, k, this.fx); this._v(B, n, kb, this.fx); this._v(C, n, kc, this.fx);
    return this;
  }
  quadOut(a, b, c, d, out, k) { this.triOut(a, b, c, out, k); return this.triOut(a, c, d, out, k); }
  // trójkąt gładki: normalne lokalne w wierzchołkach, nawinięcie wg ich sumy
  triN(a, na, b, nb, c, nc, ka, kb = ka, kc = ka, fxa = null, fxb = null, fxc = null) {
    const s = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
    if (dot3(normTri(a, b, c), s) < 0) {
      let t = b; b = c; c = t; t = nb; nb = nc; nc = t; t = kb; kb = kc; kc = t; t = fxb; fxb = fxc; fxc = t;
    }
    const f = this.fx;
    this._v(this._p(a), this._n(na), ka, fxa || f); this._v(this._p(b), this._n(nb), kb, fxb || f); this._v(this._p(c), this._n(nc), kc, fxc || f);
    return this;
  }
  // prostopadłościan ze ściętymi krawędziami (faza łapie jasne pasmo toon — bryła czyta się „miękko")
  //   o.faz, o.kol = { py, ny, px, nx, pz, nz } kolory ścian, o.bezDna (spód niewidoczny), o.bez = ['pz', …]
  pudlo(x0, y0, z0, x1, y1, z1, k, o = {}) {
    const f = Math.max(0, Math.min(o.faz == null ? 0.02 : o.faz, (x1 - x0) * 0.45, (y1 - y0) * 0.45, (z1 - z0) * 0.45));
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
  // bryła obrotowa wokół Y. prof = [[r, y, kolor?, ostry?, [nr, ny]?], …] od dołu; kolor odcinka = kolor
  // punktu startowego (twarde granice kolorów przy gładkich normalnych). o.k, o.kFn(i, j) → kolor ćwiartki,
  // o.a0/o.a1 = wycinek kąta, o.fxFn(y) → aFx (np. drganie płomienia rosnące z wysokością).
  lathe(prof, seg, o = {}) {
    const n = prof.length, a0 = o.a0 || 0, a1 = o.a1 == null ? TAU : o.a1;
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
    const fxY = o.fxFn;
    for (let i = 0; i < n - 1; i++) {
      const r0 = prof[i][0], y0 = prof[i][1], r1 = prof[i + 1][0], y1 = prof[i + 1][1];
      const n0 = nPkt(i, i), n1 = nPkt(i + 1, i);
      const k0 = prof[i][2] || o.k;
      const f0 = fxY ? fxY(y0) : null, f1 = fxY ? fxY(y1) : null;
      for (let j = 0; j < seg; j++) {
        const t0 = a0 + (a1 - a0) * j / seg, t1 = a0 + (a1 - a0) * (j + 1) / seg;
        const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
        const kk = o.kFn ? o.kFn(i, j, k0) : k0;
        const A = [c0 * r0, y0, s0 * r0], B = [c1 * r0, y0, s1 * r0], C = [c1 * r1, y1, s1 * r1], D = [c0 * r1, y1, s0 * r1];
        const nA = [c0 * n0[0], n0[1], s0 * n0[0]], nB = [c1 * n0[0], n0[1], s1 * n0[0]];
        const nC = [c1 * n1[0], n1[1], s1 * n1[0]], nD = [c0 * n1[0], n1[1], s0 * n1[0]];
        if (r0 > 1e-6) this.triN(A, nA, B, nB, C, nC, kk, kk, kk, f0, f0, f1);
        if (r1 > 1e-6) this.triN(A, nA, C, nC, D, nD, kk, kk, kk, f0, f1, f1);
      }
    }
    return this;
  }
  // kula / elipsoida (przez skal) z gładkimi normalnymi; o.kFn(ny) = kolor wg wysokości na kuli
  kula(r, seg, pier, k, o = {}) {
    const prof = [];
    const f0 = o.od == null ? -Math.PI / 2 : o.od, f1 = o.do == null ? Math.PI / 2 : o.do;
    for (let i = 0; i <= pier; i++) {
      const f = f0 + (f1 - f0) * i / pier, c = Math.cos(f), s = Math.sin(f);
      prof.push([Math.max(0, c) * r, s * r, o.kFn ? o.kFn(s) : k, false, [c, s]]);
    }
    return this.lathe(prof, seg, { k });
  }
  // walec / stożek ścięty wzdłuż Y; o.gora / o.dol = denka (kolory o.kGora / o.kDol), o.gladko (domyślnie tak)
  walec(r0, r1, y0, y1, seg, k, o = {}) {
    const dr = r0 - r1, h = y1 - y0, l = Math.hypot(dr, h) || 1, nb = [h / l, dr / l];   // gładki bok, ostre denka
    this.lathe([[r0, y0, k, false, nb], [r1, y1, k, false, nb]], seg, { k, a0: o.a0, a1: o.a1 });
    if (o.dol) this.lathe([[0, y0, o.kDol || k, false, [0, -1]], [r0, y0, o.kDol || k, false, [0, -1]]], seg, { a0: o.a0, a1: o.a1 });
    if (o.gora) this.lathe([[r1, y1, o.kGora || k, false, [0, 1]], [0, y1, o.kGora || k, false, [0, 1]]], seg, { a0: o.a0, a1: o.a1 });
    return this;
  }
  // rura między dwoma punktami (lokalnie), gładka; denka opcjonalnie
  rura(a, b, r0, r1, seg, k, o = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1;
    // obrót osi Y na kierunek a→b
    const d = [dx / L, dy / L, dz / L];
    this.push().tr(a[0], a[1], a[2]);
    const ay = Math.atan2(d[0], d[2]), ax = Math.acos(clamp(d[1], -1, 1));
    this.rotY(ay).rotX(ax);
    this.walec(r0, r1, 0, L, seg, k, o);
    this.pop();
    return this;
  }
  // rurka po łuku w płaszczyźnie XY (środek w 0,0,0), promień łuku R, grubość r
  luk(R, r, a0, a1, segA, segR, k) {
    for (let i = 0; i < segA; i++) {
      const t0 = a0 + (a1 - a0) * i / segA, t1 = a0 + (a1 - a0) * (i + 1) / segA;
      for (let j = 0; j < segR; j++) {
        const b0 = TAU * j / segR, b1 = TAU * (j + 1) / segR;
        const P = (t, bb) => { const c = Math.cos(t), s = Math.sin(t), cb = Math.cos(bb), sb = Math.sin(bb);
          return [[(R + r * cb) * c, (R + r * cb) * s, r * sb], [cb * c, cb * s, sb]]; };
        const [A, nA] = P(t0, b0), [B, nB] = P(t1, b0), [C, nC] = P(t1, b1), [D, nD] = P(t0, b1);
        this.triN(A, nA, B, nB, C, nC, k); this.triN(A, nA, C, nC, D, nD, k);
      }
    }
    return this;
  }
  // płaski krążek (naklejka) w płaszczyźnie XY, patrzy w +Z
  dysk(r, seg, k, rx = r) {
    for (let i = 0; i < seg; i++) {
      const t0 = TAU * i / seg + Math.PI / 2, t1 = TAU * (i + 1) / seg + Math.PI / 2;
      this.triOut([0, 0, 0], [Math.cos(t0) * rx, Math.sin(t0) * r, 0], [Math.cos(t1) * rx, Math.sin(t1) * r, 0], [0, 0, 1], k);
    }
    return this;
  }
  // wielokąt płaski (XY, +Z) z listy punktów [x, y] — wachlarz od pierwszego
  wielokat(pkt, k, out = [0, 0, 1]) {
    for (let i = 1; i < pkt.length - 1; i++)
      this.triOut([pkt[0][0], pkt[0][1], 0], [pkt[i][0], pkt[i][1], 0], [pkt[i + 1][0], pkt[i + 1][1], 0], out, k);
    return this;
  }
  // cienki płat widoczny z obu stron (liście): przód kolorem k, tył kT
  wielokat2(pkt, k, kT = k) { this.wielokat(pkt, k); return this.wielokat(pkt, kT, [0, 0, -1]); }
  // przyciemnienie dołu (tanie AO) dla wierzchołków od `od`
  ao(od, y0, y1, dol = 0.72, gora = 1.0) {
    for (let i = od; i < this.nv; i++) {
      const t = sstep(y0, y1, this.P[i * 3 + 1]), k = dol + (gora - dol) * t;
      this.C[i * 3] *= k; this.C[i * 3 + 1] *= k; this.C[i * 3 + 2] *= k;
    }
    return this;
  }
  // OBRYS: odwrócona powłoka trójkątów od `od` do końca, odsunięta o `w` po uśrednionych normalnych
  obrys(od, w, k) {
    if (!(w > 0)) return this;
    const P = this.P, N = this.N, nv = this.nv, mapa = new Map();
    const klucz = i => Math.round(P[i * 3] * 1500) + ',' + Math.round(P[i * 3 + 1] * 1500) + ',' + Math.round(P[i * 3 + 2] * 1500);
    for (let i = od; i < nv; i++) {
      const kk = klucz(i); let a = mapa.get(kk);
      if (!a) mapa.set(kk, (a = [0, 0, 0]));
      a[0] += N[i * 3]; a[1] += N[i * 3 + 1]; a[2] += N[i * 3 + 2];
    }
    for (const a of mapa.values()) { const l = Math.hypot(a[0], a[1], a[2]); if (l < 0.3) a.zly = true; else { a[0] /= l; a[1] /= l; a[2] /= l; } }
    const fx = [0, 0, 1, 0];
    for (let t = od; t + 2 < nv; t += 3) {
      if (mapa.get(klucz(t)).zly || mapa.get(klucz(t + 1)).zly || mapa.get(klucz(t + 2)).zly) continue;   // płat dwustronny: bez obrysu
      for (const i of [t, t + 2, t + 1]) {
        const n = mapa.get(klucz(i));
        this.P.push(P[i * 3] + n[0] * w, P[i * 3 + 1] + n[1] * w, P[i * 3 + 2] + n[2] * w);
        this.N.push(n[0], n[1], n[2]); this.C.push(k[0], k[1], k[2]); this.F.push(fx[0], fx[1], fx[2], fx[3]);
      }
    }
    return this;
  }
  geo(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aFx', new THREE.Float32BufferAttribute(this.F, 4));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

// ============================== MATERIAŁ (toon + emisja + połysk + obrys) ==============================
// o.czas     — { value } sekundy (w grze: windU z main.js; płynie też na pauzie)
// o.chmury   — { tex: { value }, off: { value }, skala } — cień chmur jak addCloudShadow (liczony tu, patrz pułapki)
// o.pasma / o.progi / o.tonCienia — jak materialOsiedla; o.rim — jasne pasmo na sylwetce (0 = bez)
export function materialSkrzyn(THREE, o = {}) {
  const pas = o.pasma || [0.66, 0.30, 0.34], progi = o.progi || [-0.12, 0.08, 0.28, 0.48];
  const ton = o.tonCienia === false ? null : (o.tonCienia || [0.82, 0.88, 1.08]);
  const rim = o.rim == null ? 0.22 : o.rim;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const U = { uCzas: o.czas || { value: 0 }, uIn: { value: new THREE.Vector3(1, 0, 1) } };
  // uChmury = siła cienia chmur (0 w markecie — pod dachem chmur nie ma)
  if (o.chmury) { U.uCloud = o.chmury.tex; U.uCloudOff = o.chmury.off; U.uChmury = { value: 1 }; mat.defines = { SK_CHMURY: '' }; }
  const skala = ((o.chmury && o.chmury.skala) || 0.016).toFixed(5);
  const f = v => v.toFixed(3);
  mat.userData.U = U;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = `attribute vec4 aFx;
      #ifdef USE_INSTANCING
        attribute vec3 aIn;
      #else
        uniform vec3 uIn;
      #endif
      uniform float uCzas;
      varying vec4 vFx; varying vec3 vIn; varying vec3 vSkW;
      ` + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFx = aFx;
        #ifdef USE_INSTANCING
          vIn = aIn;
          vec3 _iP = instanceMatrix[3].xyz;
        #else
          vIn = uIn;
          vec3 _iP = vec3(0.0);
        #endif
        if (aFx.w > 0.0) {                         // płomień: drga czubek, nasada stoi
          float _f = uCzas * 9.0 + _iP.x * 1.7 + _iP.z * 2.3 + position.x * 6.0 + position.z * 5.0;
          transformed.x += sin(_f) * 0.045 * aFx.w;
          transformed.z += cos(_f * 1.31) * 0.04 * aFx.w;
          transformed.y *= 1.0 + 0.17 * aFx.w * sin(_f * 0.73 + 1.3);
        }`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vec4 _skw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          _skw = instanceMatrix * _skw;
        #endif
        vSkW = (modelMatrix * _skw).xyz;`);
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
    fs = `varying vec4 vFx; varying vec3 vIn; varying vec3 vSkW; uniform float uCzas;
      #ifdef SK_CHMURY
        uniform sampler2D uCloud; uniform vec2 uCloudOff; uniform float uChmury;
      #endif
      ` + fs
      .replace('#include <lights_lambert_pars_fragment>', chunk)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vFx.x * vIn.x;`)
      .replace('#include <opaque_fragment>', `
        vec3 _V = normalize( vViewPosition );
        #if NUM_DIR_LIGHTS > 0
          vec3 _H = normalize( directionalLights[ 0 ].direction + _V );
          // toon-połysk metalu w KOLORZE metalu (białe odbłyski zamieniały złote okucia w kremowe)
          float _sp = smoothstep( 0.9, 0.93, dot( normal, _H ) ) * vFx.y;
          outgoingLight += _sp * 0.55 * directionalLights[ 0 ].color * mix( diffuseColor.rgb, vec3( 1.0 ), 0.25 ) * mix( 0.4, 1.0, _cienSw );
        #endif
        // przebieg połysku: wąski jasny pas wędruje po metalu co ~3 s (faza per instancja)
        float _pr = fract( dot( vSkW, vec3( 0.55, 0.8, 0.35 ) ) * 0.22 - uCzas * 0.3 + vIn.y );
        float _pas = smoothstep( 0.0, 0.02, _pr ) * ( 1.0 - smoothstep( 0.035, 0.075, _pr ) );
        outgoingLight += _pas * vFx.y * vIn.z * vec3( 1.0, 0.96, 0.82 ) * 0.85;
        // jasne pasmo na sylwetce (Genshin): bryła odcina się od trawy i od hordy
        float _rim = smoothstep( 0.66, 0.92, 1.0 - saturate( dot( normal, _V ) ) );
        outgoingLight += _rim * ${f(rim)} * diffuseColor.rgb * ( 1.0 - vFx.z );
        if ( vFx.z > 0.5 ) outgoingLight = diffuseColor.rgb;   // obrys: bez światła
        #include <opaque_fragment>`)
      .replace('#include <fog_fragment>', `
        #ifdef SK_CHMURY
          float _cs = texture2D( uCloud, vSkW.xz * ${skala} + uCloudOff ).r;
          gl_FragColor.rgb *= mix( 1.0, mix( 0.74, 1.04, _cs ), uChmury );
        #endif
        #include <fog_fragment>`);
    sh.fragmentShader = fs;
  };
  const klucz = 'modele-skrzyn-v1|' + [pas, progi, ton, rim, !!o.chmury].join('|');
  mat.customProgramCacheKey = () => klucz;
  mat.needsUpdate = true;
  return mat;
}

// ============================== MODELE ==============================
let OBR = 0.022;                                     // grubość obrysu (j. świata); 0 = bez obrysu
// podgląd A/B: ustawienia({ obrys: 0 }) PRZED pierwszym model() (modele są w cache)
export function ustawienia(o = {}) { if (o.obrys != null) { OBR = o.obrys; _modele.clear(); } return { obrys: OBR }; }

// ---------- skrzynka z warzywniaka ----------
// Pierwsza wersja miała płaskie wieko z desek — z kamery gry (≈ 45° z góry) widać było głównie wieko
// i skrzynka czytała się jak kartonowe pudło. Skrzynki w warzywniaku NIE MAJĄ wiek: to otwarte
// łubianki z kopcem warzyw. Kolorowy kopiec (pomidory, marchew, sałata, bakłażan, papryka) czyta się
// z każdej odległości, a „otwarcie" = kopiec wyskakuje i znika (część `zawartosc` z punktem obrotu
// w środku kopca), skrzynka zostaje pusta do respawnu.
function skrzynka(THREE) {
  const W = 1.2, D = 0.84, H = 0.54, t = 0.05;
  const R = prng(11);
  const K = {
    deski: [0xe3a65b, 0xd8964b, 0xebb46c, 0xd28f47].map(lin), bok: lin(0xcf8c46), slupek: lin(0x9a6232),
    wnetrze: lin(0x5a3a1e), dno: lin(0x3e2614), gwozdz: lin(0x4b3a2e), obrys: lin(0x3a200c), stempel: lin(0xc9362b),
    pomidor: lin(0xee4a3a), pomidorC: lin(0xb52d24), pomidorJ: lin(0xff9a7a), lisc: lin(0x4f9e36), liscJ: lin(0x86cf55),
    salata: lin(0x9ee06a), salataC: lin(0x4f9a38), marchew: lin(0xf6922e), marchewC: lin(0xd8661c),
    baklazan: lin(0x7a44a8), baklazanJ: lin(0xb07ad8), papryka: lin(0xffcf3a), paprykaC: lin(0xe89a1c), kopiec: lin(0x6aa644),
  };
  const jit = (c, a = 0.05) => mn(c, 1 - a + R() * 2 * a);
  const b = new Bud();
  const odSkorupy = b.nv;
  // SKORUPA: 2 szerokie deski na bokach długich (szpara między nimi), boki krótkie pełne z otworem na rękę (naklejka)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 - t - 0.035), z = sz * (D / 2 - t - 0.035);
    b.pudlo(x - 0.035, 0, z - 0.035, x + 0.035, H - 0.02, z + 0.035, K.slupek, { faz: 0, bezDna: true });
  }
  const rzedy = [[0.02, 0.25], [0.30, H]];
  for (const sz of [-1, 1]) for (const [y0, y1] of rzedy) {
    const z0 = sz > 0 ? D / 2 - t : -D / 2, z1 = sz > 0 ? D / 2 : -D / 2 + t;
    b.pudlo(-W / 2, y0, z0, W / 2, y1, z1, jit(K.deski[Math.floor(R() * 4)]), { faz: 0.016, kol: { [sz > 0 ? 'nz' : 'pz']: K.wnetrze } });
  }
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? W / 2 - t : -W / 2, x1 = sx > 0 ? W / 2 : -W / 2 + t;
    b.pudlo(x0, 0.02, -D / 2 + t, x1, H + 0.03, D / 2 - t, jit(K.bok), { faz: 0.016, kol: { [sx > 0 ? 'nx' : 'px']: K.wnetrze } });
  }
  b.pudlo(-W / 2 + t, 0.02, -D / 2 + t, W / 2 - t, 0.08, D / 2 - t, K.dno, { faz: 0, bezDna: true });   // dno (ciemne)
  b.ao(odSkorupy, 0.0, H, 0.7, 1.05);
  b.obrys(odSkorupy, OBR, K.obrys);
  // naklejki: gwoździe, otwory na rękę (ciemne), stempel-pomidor z liśćmi na przodzie
  for (const sz of [-1, 1]) for (const [y0, y1] of rzedy) for (const sx of [-1, 1])
    b.push().tr(sx * (W / 2 - 0.035), (y0 + y1) / 2, sz * (D / 2 + 0.002)).rotY(sz > 0 ? 0 : Math.PI).dysk(0.014, 4, K.gwozdz).pop();
  for (const sx of [-1, 1]) b.push().tr(sx * (W / 2 + 0.002), H - 0.1, 0).rotY(sx * Math.PI / 2).dysk(0.045, 8, K.dno, 0.13).pop();
  const stempel = (x, y, s) => {
    b.push().tr(x, y, D / 2 + 0.003).skal(s);
    b.dysk(0.07, 10, K.stempel);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (i - 2) * 0.55;
      b.triOut([Math.cos(a) * 0.012, 0.055 + Math.sin(a) * 0.012, 0.001], [Math.cos(a - 0.33) * 0.055, 0.06 + Math.sin(a - 0.33) * 0.045, 0.001],
        [Math.cos(a + 0.33) * 0.055, 0.06 + Math.sin(a + 0.33) * 0.045, 0.001], [0, 0, 1], K.lisc);
    }
    b.pop();
  };
  stempel(-0.32, 0.42, 1.1);
  b.push().tr(0.14, 0.42, D / 2 + 0.003);            // etykieta: ramka + dwie „linijki"
  for (const [x, y, w, h] of [[-0.15, -0.06, 0.3, 0.016], [-0.15, 0.044, 0.3, 0.016], [-0.15, -0.06, 0.016, 0.12], [0.134, -0.06, 0.016, 0.12],
                              [-0.11, 0.01, 0.22, 0.016], [-0.11, -0.022, 0.14, 0.016]])
    b.wielokat([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], K.stempel);
  b.pop();
  // resztki po zebraniu (widać, gdy kopiec zniknie)
  for (const [x, z, a] of [[-0.2, 0.1, 0.4], [0.25, -0.12, 2.1]]) b.push().tr(x, 0.085, z).rotY(a).rotX(-Math.PI / 2).dysk(0.05, 5, K.lisc, 0.09).pop();
  const korpus = b.geo(THREE);

  // ZAWARTOŚĆ: kopiec warzyw ponad rant; pivot w środku podstawy kopca (0, YK, 0)
  const YK = H - 0.16, k = new Bud();
  k.push().skal(1.05, 0.34, 0.7).kula(0.5, 9, 3, K.kopiec, { od: 0 }).pop();   // podkład (liście) — wypełnia rant
  const pom = (x, y, z, r) => {
    k.push().tr(x, y, z).skal(1, 0.86, 1).kula(r, 7, 4, K.pomidor, { kFn: s => s > 0.6 ? K.pomidorJ : miesz(K.pomidorC, K.pomidor, s * 0.5 + 0.5) }).pop();
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; k.push().tr(x, y + r * 0.84, z).rotY(a).triOut([-0.012, 0, 0], [0.012, 0, 0], [0, 0.004, r * 0.55], [0, 1, 0], K.lisc).pop(); }
  };
  pom(-0.34, 0.1, 0.1, 0.13); pom(-0.14, 0.14, 0.2, 0.125); pom(-0.3, 0.12, -0.16, 0.12); pom(0.02, 0.1, -0.2, 0.115);
  k.push().tr(0.3, 0.1, 0.05).kula(0.2, 8, 5, K.salata, { kFn: s => miesz(K.salataC, K.salata, sstep(-0.5, 0.8, s)) }).pop();   // sałata
  for (let i = 0; i < 5; i++) {                     // liście sałaty odchylone na boki
    const a = i / 5 * TAU + 0.3;
    k.push().tr(0.3 + Math.cos(a) * 0.12, 0.2, 0.05 + Math.sin(a) * 0.12).rotY(-a).rotZ(0.6)
      .wielokat2([[0, -0.06], [0.1, -0.03], [0.13, 0.04], [0.06, 0.08], [0, 0.05]], K.liscJ, K.salataC).pop();
  }
  k.push().tr(0.02, 0.15, 0.13).rotY(0.5).rotZ(Math.PI / 2 - 0.25);                   // bakłażan (wydłużony) z szypułką
  k.push().skal(1, 1.8, 1).kula(0.085, 7, 4, K.baklazan, { kFn: s => s > 0.5 ? K.baklazanJ : K.baklazan }).pop();
  k.push().tr(0, 0.14, 0).walec(0.055, 0.02, 0, 0.06, 5, K.lisc, { gora: true }).pop();
  k.pop();
  k.push().tr(-0.02, 0.2, -0.02).skal(0.9, 1, 0.9).kula(0.1, 7, 4, K.papryka, { kFn: s => s < -0.2 ? K.paprykaC : K.papryka }).pop();   // papryka
  k.push().tr(-0.02, 0.3, -0.02).walec(0.018, 0.012, 0, 0.05, 4, K.lisc).pop();
  for (const [x, z, a, tilt] of [[0.14, -0.14, 0.9, 0.9], [0.2, 0.24, -0.6, 0.75], [-0.42, -0.02, 1.9, 1.0]]) {    // marchewki: czubek w kopcu, nać na zewnątrz
    k.push().tr(x, 0.1, z).rotY(a).rotZ(-tilt);
    k.walec(0.006, 0.052, -0.16, 0.2, 6, K.marchew);
    k.push().tr(0, 0.2, 0);
    for (let i = 0; i < 3; i++) k.push().rotY(i * 2.1).rotX(0.35).wielokat2([[-0.02, 0], [0.02, 0], [0.035, 0.14], [0, 0.17], [-0.035, 0.14]], K.liscJ, K.lisc).pop();
    k.pop();
    k.pop();
  }
  k.obrys(0, OBR * 0.85, K.obrys);
  const zawartosc = k.geo(THREE);
  // kopiec bez cienia: jego cień i tak pada do wnętrza skrzynki (9 skrzynek = −9 × ~950 trójkątów w przebiegu cieni)
  return { nazwa: 'skrzynka', czesci: [{ nazwa: 'korpus', geo: korpus }, { nazwa: 'zawartosc', geo: zawartosc, pivot: [0, YK, 0], cien: false }],
           wys: H + 0.3, r: 0.75 };
}

// ---------- kufer (złota / kapral / don) ----------
const PALETY_KUFRA = {
  zlota: {
    drewno: [0xb8452f, 0xa53b28, 0xc2523a].map(lin), bok: lin(0xa33a27), metal: lin(0xe9a92c), metalJ: lin(0xf7c448),
    wnetrze: lin(0x4e1a12), swiatlo: lin(0xfff2a8), skarb: lin(0xffc93a), moneta: lin(0xffe38a), obrys: lin(0x3a170c),
    klejnoty: [0xff5a6e, 0x5ad0ff, 0x7dff8a].map(lin), wstega: null,
  },
  kapral: {
    drewno: [0x4d3154, 0x5a3a61, 0x432a4a].map(lin), bok: lin(0x3f2846), metal: lin(0x9f8ccf), metalJ: lin(0xc9b8f2),
    wnetrze: lin(0x221327), swiatlo: lin(0xe2b6ff), skarb: lin(0xb877ff), moneta: lin(0xffd86a), obrys: lin(0x1c0f22),
    klejnoty: [0xc07bff, 0xff6fd0, 0x9d7bff].map(lin), wstega: null,
  },
  don: {
    drewno: [0x2c2731, 0x352f3b, 0x27222b].map(lin), bok: lin(0x241f28), metal: lin(0xe9ad32), metalJ: lin(0xf7c85a),
    wnetrze: lin(0x3a0d10), swiatlo: lin(0xffb3a0), skarb: lin(0xffc93a), moneta: lin(0xffe38a), obrys: lin(0x0e0b10),
    klejnoty: [0xff4a4a, 0xffd23c, 0xff4a4a].map(lin), wstega: lin(0xc9302c),
  },
};
function kufer(THREE, nazwa) {
  const pal = PALETY_KUFRA[nazwa];
  const W = 1.30, D = 0.86, H = 0.60, R = D / 2, KY = 0.78, TR = 0.07;
  const b = new Bud();
  // SKARB w środku (widać po otwarciu; świeci — „światło wylewa się ze skrzyni")
  b.efekt(0.95, 0.4);
  b.push().tr(0, H - 0.075, 0).skal(1, 0.28, 0.62).kula(W / 2 - TR - 0.02, 10, 4, pal.skarb, { od: 0 }).pop();
  b.efekt(0.8, 0.8);
  const R2 = prng(nazwa.length * 7 + 3);
  for (let i = 0; i < 7; i++) {
    const x = (R2() - 0.5) * (W - 0.4), z = (R2() - 0.5) * (D - 0.35), y = H - 0.08 + 0.13 * Math.sqrt(Math.max(0, 1 - (x / 0.55) ** 2 - (z / 0.3) ** 2));
    b.push().tr(x, y + 0.01, z).rotX((R2() - 0.5) * 0.9).rotZ((R2() - 0.5) * 0.9).walec(0.065, 0.065, -0.009, 0.009, 8, pal.moneta, { gora: true, dol: true }).pop();
  }
  b.efekt(0.6, 1.0);
  for (let i = 0; i < 3; i++) b.push().tr(-0.3 + i * 0.3, H - 0.02 + (i === 1 ? 0.04 : 0), (i - 1) * 0.08).rotY(i).kula(0.05, 4, 2, pal.klejnoty[i]).pop();
  b.efekt(0, 0);
  const odSkorupy = b.nv;
  // PODSTAWA (metal) i KORPUS z trzech desek — faza między deskami robi ciemną szparę
  b.efekt(0, 1);
  b.pudlo(-W / 2 - 0.03, 0, -D / 2 - 0.03, W / 2 + 0.03, 0.08, D / 2 + 0.03, pal.metal, { faz: 0.02, bezDna: true });
  b.efekt(0, 0);
  const ys = [0.08, 0.235, 0.39, H - 0.075];
  for (let i = 0; i < 3; i++) b.pudlo(-W / 2, ys[i], -D / 2, W / 2, ys[i + 1] + 0.004, D / 2, pal.drewno[i], { faz: 0.024, bezDna: true, kol: { px: mn(pal.bok, 1 + i * 0.04), nx: mn(pal.bok, 1 + i * 0.04) } });
  // RAMA górna: 4 belki, od środka ciemne wnętrze
  const y0 = H - 0.085;
  b.efekt(0, 1);
  b.pudlo(-W / 2 - 0.02, y0, D / 2 - TR, W / 2 + 0.02, H, D / 2 + 0.02, pal.metal, { faz: 0.016, kol: { nz: pal.wnetrze } });
  b.pudlo(-W / 2 - 0.02, y0, -D / 2 - 0.02, W / 2 + 0.02, H, -D / 2 + TR, pal.metal, { faz: 0.016, kol: { pz: pal.wnetrze } });
  b.pudlo(-W / 2 - 0.02, y0, -D / 2 + TR, -W / 2 + TR, H, D / 2 - TR, pal.metal, { faz: 0.016, kol: { px: pal.wnetrze } });
  b.pudlo(W / 2 - TR, y0, -D / 2 + TR, W / 2 + 0.02, H, D / 2 - TR, pal.metal, { faz: 0.016, kol: { nx: pal.wnetrze } });
  // narożniki (okucia) i pasy na przodzie / z tyłu
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 - 0.05), z = sz * (D / 2 - 0.05);
    b.pudlo(x - 0.068, 0.07, z - 0.068, x + 0.068, y0 + 0.004, z + 0.068, pal.metal, { faz: 0.018, bezDna: true });
  }
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const x = sx * 0.36, z0 = sz > 0 ? D / 2 - 0.01 : -D / 2 - 0.022, z1 = sz > 0 ? D / 2 + 0.022 : -D / 2 + 0.01;
    b.pudlo(x - 0.055, 0.07, z0, x + 0.055, y0 + 0.004, z1, pal.metal, { faz: 0.014, bezDna: true });
  }
  // zamek: tarcza na przodzie
  b.pudlo(-0.125, H - 0.34, D / 2 - 0.005, 0.125, H - 0.06, D / 2 + 0.038, pal.metalJ, { faz: 0.02 });
  b.efekt(0, 0);
  // uchwyty po bokach (pierścienie)
  for (const sx of [-1, 1]) {
    b.efekt(0, 1);
    b.push().tr(sx * (W / 2 + 0.012), 0.37, 0).rotY(Math.PI / 2).pudlo(-0.07, -0.03, -0.012, 0.07, 0.03, 0.012, pal.metal, { faz: 0.008 }).pop();
    b.push().tr(sx * (W / 2 + 0.03), 0.33, 0).rotY(Math.PI / 2).luk(0.085, 0.017, Math.PI, TAU, 6, 5, pal.metalJ).pop();
    b.efekt(0, 0);
  }
  b.ao(odSkorupy, 0.0, H, 0.76, 1.03);
  b.obrys(odSkorupy, OBR, pal.obrys);
  // nity i dziurka od klucza (bez obrysu); dziurka ŚWIECI
  b.efekt(0, 1);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) for (const y of [0.16, 0.44]) {
    b.push().tr(sx * 0.36, y, sz * (D / 2 + 0.022)).rotX(sz * Math.PI / 2).kula(0.024, 5, 2, pal.metalJ, { od: 0 }).pop();
  }
  b.efekt(1.7, 0);
  b.push().tr(0, H - 0.2, D / 2 + 0.04).dysk(0.034, 8, pal.swiatlo).pop();
  b.push().tr(0, H - 0.25, D / 2 + 0.04).wielokat([[-0.014, -0.035], [0.014, -0.035], [0.02, 0.03], [-0.02, 0.03]], pal.swiatlo).pop();
  b.efekt(0, 0);
  const korpus = b.geo(THREE);

  // WIEKO: półwalec z desek (oś X), zawias z tyłu w (0, H, −D/2); lokalnie z = 0 (tył) … D (przód)
  const w = new Bud(), SEG = 8, xa = -W / 2, xb = W / 2;
  const luk = (a, rr = R) => [R + Math.cos(a) * rr, Math.sin(a) * rr * KY];   // [z, y]; a = 0 przód, π tył
  const pasLuku = (x0, x1, rr, k, boki = true) => {              // opaska po łuku (metal), z bokami
    for (let i = 0; i < SEG; i++) {
      const a0 = Math.PI * i / SEG, a1 = Math.PI * (i + 1) / SEG, am = (a0 + a1) / 2;
      const [z0, yy0] = luk(a0, rr), [z1, yy1] = luk(a1, rr), [zi0, yi0] = luk(a0, R - 0.005), [zi1, yi1] = luk(a1, R - 0.005);
      w.quadOut([x0, yy0, z0], [x1, yy0, z0], [x1, yy1, z1], [x0, yy1, z1], [0, Math.sin(am), Math.cos(am) * KY], k);
      if (boki) {
        w.quadOut([x0, yi0, zi0], [x0, yy0, z0], [x0, yy1, z1], [x0, yi1, zi1], [-1, 0, 0], k);
        w.quadOut([x1, yi0, zi0], [x1, yy0, z0], [x1, yy1, z1], [x1, yi1, zi1], [1, 0, 0], k);
      }
    }
  };
  // skorupa z desek (co druga ciut ciemniejsza)
  for (let i = 0; i < SEG; i++) {
    const a0 = Math.PI * i / SEG, a1 = Math.PI * (i + 1) / SEG, am = (a0 + a1) / 2;
    const [z0, yy0] = luk(a0), [z1, yy1] = luk(a1);
    w.quadOut([xa, yy0, z0], [xb, yy0, z0], [xb, yy1, z1], [xa, yy1, z1], [0, Math.sin(am), Math.cos(am) * KY], pal.drewno[i % 3]);
  }
  for (const [x, sx] of [[xa, -1], [xb, 1]]) for (let i = 0; i < SEG; i++) {     // denka boczne
    const [z0, yy0] = luk(Math.PI * i / SEG), [z1, yy1] = luk(Math.PI * (i + 1) / SEG);
    w.triOut([x, 0, R], [x, yy0, z0], [x, yy1, z1], [sx, 0, 0], pal.bok);
  }
  w.quadOut([xa, 0, 0], [xb, 0, 0], [xb, 0, D], [xa, 0, D], [0, -1, 0], pal.wnetrze);   // spód (widać po otwarciu)
  w.efekt(0, 1);
  pasLuku(xa - 0.022, xa + 0.075, R + 0.026, pal.metal);
  pasLuku(xb - 0.075, xb + 0.022, R + 0.026, pal.metal);
  for (const sx of [-1, 1]) pasLuku(sx * 0.36 - 0.055, sx * 0.36 + 0.055, R + 0.02, pal.metal);
  if (pal.wstega) { w.efekt(0, 0.3); pasLuku(-0.09, 0.09, R + 0.022, pal.wstega); w.efekt(0, 1); }
  w.pudlo(xa - 0.022, 0, D - 0.035, xb + 0.022, 0.06, D + 0.026, pal.metal, { faz: 0.014 });   // obręcz przód
  w.pudlo(xa - 0.022, 0, -0.026, xb + 0.022, 0.06, 0.035, pal.metal, { faz: 0.014 });          // obręcz tył
  w.pudlo(-0.075, -0.13, D + 0.042, 0.075, 0.07, D + 0.068, pal.metalJ, { faz: 0.016 });      // skobel zamka
  w.efekt(0, 0);
  w.ao(0, 0, R * KY, 0.9, 1.04);
  w.obrys(0, OBR, pal.obrys);
  w.efekt(0, 1);
  w.push().tr(0, -0.045, D + 0.068).rotX(Math.PI / 2).kula(0.026, 6, 3, pal.metal, { od: 0 }).pop();
  w.efekt(0, 0);
  const wieko = w.geo(THREE);
  return { nazwa, czesci: [{ nazwa: 'korpus', geo: korpus }, { nazwa: 'wieko', geo: wieko, pivot: [0, H, -D / 2] }],
           wys: H + R * KY + 0.03, r: 0.8, zawias: { os: 'x', otwarte: -1.9 } };
}

// ---------- Garnek Nonny ----------
// Emaliowany garnek w czerwone kropki (jak sprite właściciela) na niskim żeliwnym TRÓJNOGU nad ogniskiem.
// Pierwsza wersja wisiała na wysokim trójnogu z tyczek: tyczki dominowały sylwetkę, a ogień pod
// garnkiem był z kamery gry (z góry) całkiem zasłonięty. Teraz garnek jest bohaterem bryły, a płomienie
// liżą go WOKÓŁ dna — widać je z każdej strony.
function garnek(THREE) {
  const K = {
    emalia: lin(0xf6f2e8), emaliaC: lin(0xdfe2ea), dno: lin(0x5e6978), rant: lin(0x5f6b7c), kropka: lin(0xe0372f),
    ucho: lin(0xd8352e), uchoJ: lin(0xff7a6a), zupa: lin(0xf09a32), zupaJ: lin(0xffc45a), zelazo: lin(0x3b3f48),
    kamien: lin(0xa9aca2), kamienJ: lin(0xd6d8cc), kora: lin(0x7b4d2a), sloj: lin(0xe9c88e), zar: lin(0xff6a24), zarJ: lin(0xffc048),
    lyzka: lin(0xcf8e4e), obrys: lin(0x2b2a33), obrysD: lin(0x3a2412),
  };
  const Y0 = 0.5, RP = 0.668;                        // dno garnka nad ziemią, promień brzucha
  const R = prng(5), b = new Bud();
  // OGNISKO: krąg kamieni, polana w gwiazdę (wystają spod garnka), żar
  const odKam = b.nv;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + R() * 0.25, rr = 0.86 + R() * 0.06;
    b.push().tr(Math.cos(a) * rr, 0.035, Math.sin(a) * rr).rotY(-a).skal(1.3 + R() * 0.3, 0.7 + R() * 0.25, 1.0)
      .kula(0.14, 5, 3, K.kamien, { kFn: s => miesz(mn(K.kamien, 0.7), K.kamienJ, sstep(-0.2, 0.9, s)) }).pop();
  }
  b.obrys(odKam, OBR * 0.8, K.obrysD);
  const odPol = b.nv;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU + 0.3;
    b.rura([Math.cos(a) * 0.8, 0.06, Math.sin(a) * 0.8], [Math.cos(a) * 0.08, 0.2, Math.sin(a) * 0.08], 0.07, 0.06, 6, K.kora,
      { dol: true, gora: true, kDol: K.sloj, kGora: K.sloj });
  }
  b.obrys(odPol, OBR * 0.8, K.obrysD);
  b.efekt(1.3, 0);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU + 0.6, rr = 0.25 + R() * 0.45;
    b.push().tr(Math.cos(a) * rr, 0.03, Math.sin(a) * rr).rotY(a).pudlo(-0.05, 0, -0.04, 0.05, 0.05, 0.04, i % 2 ? K.zar : K.zarJ, { faz: 0, bezDna: true }).pop();
  }
  b.efekt(0, 0);
  // TRÓJNÓG: żeliwny pierścień pod dnem + 3 wygięte nóżki
  b.efekt(0, 0.6);
  const odTr = b.nv;
  b.push().tr(0, Y0 - 0.02, 0).rotX(Math.PI / 2).luk(0.46, 0.03, 0, TAU, 14, 4, K.zelazo).pop();
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU + Math.PI / 2;
    const A = [Math.cos(a) * 0.46, Y0 - 0.02, Math.sin(a) * 0.46], B = [Math.cos(a) * 0.6, 0.18, Math.sin(a) * 0.6], C = [Math.cos(a) * 0.66, 0.0, Math.sin(a) * 0.66];
    b.rura(A, B, 0.03, 0.03, 5, K.zelazo); b.rura(B, C, 0.03, 0.045, 5, K.zelazo, { dol: true });
  }
  b.obrys(odTr, OBR * 0.8, K.obrys);
  b.efekt(0, 0);
  // GARNEK: bryła obrotowa, ciemne dno, rant, zupa w środku
  const odGarnka = b.nv;
  b.push().tr(0, Y0, 0);
  b.lathe([
    [0.0, 0.0, K.dno], [0.43, 0.0, K.dno], [0.56, 0.04, K.dno], [0.63, 0.115, K.emaliaC], [0.665, 0.29, K.emalia],
    [RP, 0.55, K.emalia], [0.652, 0.73, K.emalia], [0.695, 0.758, K.rant, true], [0.705, 0.785, K.rant], [0.68, 0.808, K.rant],
    [0.645, 0.803, K.emaliaC, true], [0.632, 0.7, K.emaliaC],
  ], 16);
  b.push().tr(0, 0.7, 0).lathe([[0.632, 0, K.zupa, false, [0, 1]], [0, 0, K.zupa, false, [0, 1]]], 16).pop();
  b.pop();
  for (const sx of [-1, 1]) b.push().tr(sx * (RP - 0.004), Y0 + 0.64, 0).rotY(sx > 0 ? 0 : Math.PI).rotX(Math.PI / 2).luk(0.12, 0.032, -Math.PI / 2, Math.PI / 2, 6, 5, K.ucho).pop();
  b.obrys(odGarnka, OBR, K.obrys);
  // kropki (naklejki po krzywiźnie) + bąble zupy
  for (let rz = 0; rz < 2; rz++) for (let i = 0; i < 10; i++) {
    const a = (i + rz * 0.5) / 10 * TAU + 0.15, y = Y0 + (rz ? 0.5 : 0.24), rr = rz ? RP + 0.002 : 0.666;
    b.push().tr(Math.cos(a) * rr, y, Math.sin(a) * rr).rotY(Math.PI / 2 - a).tr(0, 0, 0.004).dysk(0.075, 8, K.kropka).pop();
  }
  b.efekt(0.25, 0);
  for (const [x, z, r] of [[0.18, 0.12, 0.07], [-0.24, -0.06, 0.055], [0.06, -0.3, 0.06]]) b.push().tr(x, Y0 + 0.7, z).kula(r, 6, 3, K.zupaJ, { od: 0 }).pop();
  b.efekt(0, 0);
  // drewniana łyżka wystaje spod uchylonej pokrywki (jak na sprite'cie właściciela)
  const odLyzki = b.nv;
  b.rura([0.2, Y0 + 0.72, 0.06], [1.12, Y0 + 1.18, 0.14], 0.026, 0.022, 6, K.lyzka, { gora: true });
  b.obrys(odLyzki, OBR * 0.8, K.obrysD);
  const korpus = b.geo(THREE);
  // POKRYWKA: pivot na środku rantu; w spoczynku uchylona na łyżce (spoczynek niżej)
  const p = new Bud();
  // czerwony rant i kropki na wierzchu: z kamery gry (z góry) pokrywka to połowa sylwetki garnka —
  // gładka szara tarcza czytała się jak patelnia, w kropki od razu jak „garnek Nonny"
  p.lathe([
    [0.715, -0.012, K.ucho, true], [0.718, 0.02, K.ucho], [0.67, 0.04, K.emalia, true], [0.48, 0.1, K.emalia],
    [0.24, 0.14, K.emalia], [0.0, 0.15, K.emalia],
  ], 16);
  p.lathe([[0.0, -0.012, K.dno, false, [0, -1]], [0.715, -0.012, K.dno, false, [0, -1]]], 16);
  p.push().tr(0, 0.14, 0).walec(0.045, 0.05, 0, 0.06, 8, K.rant).pop();
  p.push().tr(0, 0.235, 0).skal(1, 0.78, 1).kula(0.09, 8, 5, K.ucho, { kFn: s => s > 0.5 ? K.uchoJ : K.ucho }).pop();
  p.obrys(0, OBR, K.obrys);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU + 0.3, rr = 0.46, y = 0.1 + (0.48 - rr) / 0.24 * 0.04;
    p.push().tr(Math.cos(a) * rr, y, Math.sin(a) * rr).rotY(Math.PI / 2 - a).rotX(-1.25).tr(0, 0, 0.004).dysk(0.058, 8, K.kropka).pop();
  }
  const pokrywka = p.geo(THREE);
  // PŁOMIENIE: osobna część (skala instancji = siła ognia); pivot w środku ogniska. Wianek płomieni
  // wokół dna + jeden duży w środku; każdy z żółtym rdzeniem od przodu.
  const o = new Bud();
  const PROF = [[0.0, 0.0], [0.14, 0.05], [0.19, 0.16], [0.16, 0.3], [0.085, 0.45], [0.0, 0.6]];
  const plomien = (x, z, s, kz, kw, e, pochyl = 0, kat = 0) => {
    o.push().tr(x, 0, z).rotY(kat).rotX(pochyl).skal(s);
    o.lathe(PROF.map(q => [q[0], q[1], kz]), 6, { fxFn: y => [e, 0, 0, clamp(y / 0.6, 0, 1)] });
    o.push().tr(0.0, 0, 0.07).skal(0.55, 0.62, 0.55);
    o.lathe(PROF.map(q => [q[0], q[1], kw]), 5, { fxFn: y => [e * 1.2, 0, 0, clamp(y / 0.6, 0, 1) * 0.8] });
    o.pop().pop();
  };
  plomien(0, 0, 0.95, lin(0xff7a22), lin(0xffe15a), 1.35);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + 0.25, rr = 0.5 + (i % 2) * 0.08;
    plomien(Math.cos(a) * rr, Math.sin(a) * rr, 0.62 + (i % 3) * 0.1, i % 2 ? lin(0xff8a2a) : lin(0xff6a1e), lin(0xffd24d), 1.35, 0.35, Math.PI / 2 - a);
  }
  const ogien = o.geo(THREE);
  return { nazwa: 'garnek', czesci: [
    { nazwa: 'korpus', geo: korpus },
    { nazwa: 'pokrywka', geo: pokrywka, pivot: [0, Y0 + 0.808, 0] },
    { nazwa: 'ogien', geo: ogien, pivot: [0, 0.04, 0], cien: false },
  ], wys: Y0 + 1.05, r: 1.0, spoczynek: { pokrywka: { rz: 0.128, dy: 0.092 } }, para: [0.62, Y0 + 0.98, 0.05] };
}

// ---------- witryna chłodnicza (Garnek w markecie) ----------
function witryna(THREE) {
  const K = {
    obud: lin(0xeef1f4), obudC: lin(0xc9d1d9), plint: lin(0x5f6873), pas: lin(0x5d8ba3), pasJ: lin(0x8fc0d8),
    tlo: lin(0xbfe6f5), polka: lin(0xd4dbe2), swiatlo: lin(0xeafaff), obrys: lin(0x243240),
    prod: [0xe05a5a, 0xf2c14a, 0x8ec44f, 0xf0efe6, 0xd98f3c, 0xb06bd6, 0x7fc0e8, 0xff9ab8].map(lin),
  };
  const W = 1.5, D = 0.86, H = 2.0;
  const b = new Bud();
  const od = b.nv;
  b.pudlo(-W / 2, 0, -D / 2, W / 2, 0.2, D / 2, K.plint, { faz: 0.02, bezDna: true });
  for (const sx of [-1, 1]) b.pudlo(sx > 0 ? W / 2 - 0.08 : -W / 2, 0.18, -D / 2, sx > 0 ? W / 2 : -W / 2 + 0.08, H - 0.2, D / 2, K.obud, { faz: 0.025 });
  b.pudlo(-W / 2, 0.18, -D / 2, W / 2, H - 0.2, -D / 2 + 0.08, K.obud, { faz: 0.02 });
  b.pudlo(-W / 2 - 0.02, H - 0.24, -D / 2, W / 2 + 0.02, H, D / 2 + 0.1, K.obud, { faz: 0.03, kol: { pz: K.pas } });
  b.pudlo(-W / 2 + 0.08, 0.18, -D / 2 + 0.08, W / 2 - 0.08, 0.3, D / 2 - 0.02, K.polka, { faz: 0.02, kol: { pz: K.pas } });
  b.ao(od, 0, H, 0.8, 1.02);
  b.obrys(od, OBR, K.obrys);
  // tło wnętrza świeci chłodno, listwa światła pod daszkiem
  b.efekt(0.45, 0);
  b.push().tr(0, 0.3, -D / 2 + 0.085).wielokat([[-W / 2 + 0.08, 0], [W / 2 - 0.08, 0], [W / 2 - 0.08, H - 0.54], [-W / 2 + 0.08, H - 0.54]], K.tlo).pop();
  b.efekt(1.4, 0);
  b.pudlo(-W / 2 + 0.1, H - 0.27, D / 2 - 0.05, W / 2 - 0.1, H - 0.24, D / 2 + 0.06, K.swiatlo, { faz: 0.006 });
  b.efekt(0, 0);
  // półki z produktami
  const R = prng(21);
  for (let s = 0; s < 3; s++) {
    const y = 0.72 + s * 0.4, g = D - 0.3 - s * 0.06;
    b.pudlo(-W / 2 + 0.08, y - 0.025, -D / 2 + 0.08, W / 2 - 0.08, y, -D / 2 + 0.08 + g, K.polka, { faz: 0.006, kol: { pz: K.pas } });
    for (let i = 0; i < 5; i++) {
      const x = -W / 2 + 0.2 + i * 0.27, k = K.prod[Math.floor(R() * K.prod.length)], typ = (i + s) % 3;
      b.push().tr(x, y, -D / 2 + 0.08 + g * 0.55);
      if (typ === 0) b.pudlo(-0.08, 0, -0.07, 0.08, 0.2, 0.07, k, { faz: 0.02, bezDna: true, kol: { py: mn(k, 1.1) } });
      else if (typ === 1) b.walec(0.065, 0.065, 0, 0.16, 8, k, { gora: true, kGora: K.prod[3] });
      else { b.walec(0.05, 0.05, 0, 0.18, 7, k, { gora: false }); b.walec(0.05, 0.02, 0.18, 0.26, 7, k, { gora: true, kGora: K.pas }); }
      b.pop();
    }
  }
  for (let i = 0; i < 6; i++) {                     // dolny kosz: jogurty
    const x = -W / 2 + 0.22 + i * 0.21;
    b.push().tr(x, 0.3, 0.05 + (i % 2) * 0.12).walec(0.07, 0.06, 0, 0.12, 8, K.prod[(i * 3) % 8], { gora: true, kGora: K.prod[3] }).pop();
  }
  // naklejka „serce Nonny" na daszku
  b.push().tr(0, H - 0.12, D / 2 + 0.103);
  b.dysk(0.07, 10, lin(0xf6f0e2));
  b.push().tr(-0.022, 0.008, 0.001).dysk(0.026, 8, lin(0xe0413a)).pop();
  b.push().tr(0.022, 0.008, 0.001).dysk(0.026, 8, lin(0xe0413a)).pop();
  b.triOut([-0.046, 0.0, 0.001], [0.046, 0.0, 0.001], [0, -0.05, 0.001], [0, 0, 1], lin(0xe0413a));
  b.pop();
  return { nazwa: 'witryna', czesci: [{ nazwa: 'korpus', geo: b.geo(THREE) }], wys: H, r: 0.9 };
}

// ---------- E3: Stolnica Nonny (tylko model) ----------
function stolnica(THREE) {
  const K = { blat: lin(0xe6c18a), noga: lin(0xb07a44), deska: lin(0xf2d7a4), deskaC: lin(0xdcb97f), maka: lin(0xfbf9f2),
              makaC: lin(0xe4e0d6), zoltko: lin(0xffb52e), ciasto: lin(0xf2dcae), walek: lin(0xd9a86a), walekC: lin(0xa8743e),
              jajko: lin(0xf6ecdc), obrys: lin(0x4a2912) };
  const b = new Bud(), Y = 0.8;
  const od = b.nv;
  b.pudlo(-0.72, Y - 0.07, -0.46, 0.72, Y, 0.46, K.blat, { faz: 0.02 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rura([sx * 0.66, 0, sz * 0.42], [sx * 0.58, Y - 0.06, sz * 0.36], 0.045, 0.04, 6, K.noga, { gora: true });
  for (const sx of [-1, 1]) b.pudlo(sx * 0.6 - 0.03, 0.22, -0.4, sx * 0.6 + 0.03, 0.27, 0.4, K.noga, { faz: 0.01 });
  b.pudlo(-0.56, Y, -0.34, 0.56, Y + 0.035, 0.36, K.deska, { faz: 0.012 });
  b.pudlo(-0.56, Y, -0.38, 0.56, Y + 0.1, -0.34, K.deskaC, { faz: 0.012 });   // listwa oporowa z tyłu
  b.ao(od, 0, Y, 0.72, 1.02);
  b.obrys(od, OBR, K.obrys);
  const Yb = Y + 0.035;
  const odM = b.nv;
  b.push().tr(-0.18, Yb, 0.02).lathe([[0.3, 0, K.makaC], [0.26, 0.05, K.maka], [0.17, 0.13, K.maka], [0.1, 0.16, K.maka, true], [0.07, 0.13, K.makaC], [0, 0.12, K.makaC]], 12).pop();
  b.efekt(0.1, 0);
  b.push().tr(-0.18, Yb + 0.125, 0.02).skal(1, 0.55, 1).kula(0.055, 8, 4, K.zoltko, { od: 0 }).pop();
  b.efekt(0, 0);
  b.push().tr(0.26, Yb + 0.09, -0.08).skal(1, 0.72, 1).kula(0.14, 10, 6, K.ciasto, { kFn: s => miesz(mn(K.ciasto, 0.85), K.ciasto, s * 0.5 + 0.5) }).pop();
  b.push().tr(0.12, Yb + 0.047, 0.2).rotY(0.35).rotZ(Math.PI / 2);
  b.walec(0.045, 0.045, -0.24, 0.24, 10, K.walek, { gora: true, dol: true, kGora: K.walekC, kDol: K.walekC });
  b.walec(0.022, 0.022, 0.24, 0.36, 6, K.walekC, { gora: true }); b.walec(0.022, 0.022, -0.36, -0.24, 6, K.walekC, { dol: true });
  b.pop();
  for (const [x, z] of [[0.46, 0.22], [0.52, 0.12]]) b.push().tr(x, Yb + 0.045, z).skal(0.8, 1, 0.8).kula(0.055, 7, 5, K.jajko).pop();
  b.obrys(odM, OBR * 0.8, K.obrys);
  for (const [x, z, r] of [[0.05, -0.12, 0.09], [-0.42, 0.22, 0.07], [0.3, 0.25, 0.06]])
    b.push().tr(x, Yb + 0.002, z).rotX(-Math.PI / 2).dysk(r, 7, K.maka, r * 1.4).pop();
  return { nazwa: 'stolnica', czesci: [{ nazwa: 'korpus', geo: b.geo(THREE) }], wys: 1.05, r: 0.9 };
}

// ---------- E3: Stół Wyzwania Famiglii (przed / po wbiciu noża) ----------
function stolWyzwania(THREE, wbity) {
  const K = { noga: lin(0x5a3a26), czer: lin(0xd23b33), biel: lin(0xf6efe6), slomka: lin(0xd8b36a), slomkaC: lin(0xb08a48),
              szklo: lin(0x3f7a45), swieca: lin(0xf6f0e2), plomien: lin(0xffcf4a), ostrze: lin(0xd7dde3), rekojesc: lin(0x3a2a22),
              nit: lin(0xf2c14a), obrys: lin(0x2a1714) };
  const b = new Bud(), Y = 0.8, S = 0.56, N = 6;
  const od = b.nv;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.pudlo(sx * 0.45 - 0.04, 0, sz * 0.45 - 0.04, sx * 0.45 + 0.04, Y - 0.02, sz * 0.45 + 0.04, K.noga, { faz: 0.01, bezDna: true });
  // obrus: blat w kratkę + zwisające boki (lekko rozchylone)
  const kr = (i, j) => ((i + j) % 2 ? K.czer : K.biel);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x0 = -S + 2 * S * i / N, x1 = -S + 2 * S * (i + 1) / N, z0 = -S + 2 * S * j / N, z1 = -S + 2 * S * (j + 1) / N;
    b.quadOut([x0, Y, z0], [x1, Y, z0], [x1, Y, z1], [x0, Y, z1], [0, 1, 0], kr(i, j));
  }
  const Ys = Y - 0.3, fl = 0.06;
  for (let s = 0; s < 4; s++) {
    b.push().rotY(s * Math.PI / 2);
    for (let i = 0; i < N; i++) for (let j = 0; j < 2; j++) {
      const x0 = -S + 2 * S * i / N, x1 = -S + 2 * S * (i + 1) / N, t0 = j / 2, t1 = (j + 1) / 2;
      const ya = Y - (Y - Ys) * t0, yb = Y - (Y - Ys) * t1, za = S + fl * t0, zb = S + fl * t1;
      const xa0 = x0 * (1 + 0.1 * t0), xa1 = x1 * (1 + 0.1 * t0), xb0 = x0 * (1 + 0.1 * t1), xb1 = x1 * (1 + 0.1 * t1);
      b.quadOut([xb0, yb, zb], [xb1, yb, zb], [xa1, ya, za], [xa0, ya, za], [0, 0, 1], kr(i, j + 1));
      b.quadOut([xb0, yb, zb], [xb1, yb, zb], [xa1, ya, za], [xa0, ya, za], [0, 0, -1], mn(kr(i, j + 1), 0.7));
    }
    b.pop();
  }
  b.ao(od, 0, Y, 0.7, 1.0);
  b.obrys(od, OBR, K.obrys);
  // Chianti ze świeczką
  const odB = b.nv;
  b.push().tr(-0.3, Y, -0.26);
  b.lathe([[0.0, 0, K.slomka], [0.09, 0.0, K.slomka], [0.12, 0.05, K.slomkaC], [0.12, 0.1, K.slomka], [0.1, 0.16, K.slomkaC],
           [0.06, 0.2, K.szklo, true], [0.032, 0.26, K.szklo], [0.03, 0.34, K.szklo], [0.036, 0.36, K.szklo], [0.0, 0.36, K.szklo]], 9);
  b.walec(0.026, 0.026, 0.36, 0.47, 7, K.swieca, { gora: true });
  b.push().tr(0.02, 0.36, 0.0).skal(1, 1.6, 1).kula(0.022, 5, 3, K.swieca).pop();
  b.pop();
  b.obrys(odB, OBR * 0.8, K.obrys);
  b.efekt(1.6, 0, 1);
  b.push().tr(-0.3, Y + 0.475, -0.26).skal(0.28).lathe([[0.0, 0.0], [0.14, 0.05], [0.19, 0.16], [0.16, 0.3], [0.085, 0.45], [0.0, 0.6]].map(p => [p[0], p[1], K.plomien]), 6,
    { fxFn: y => [1.6, 0, 0, clamp(y / 0.17, 0, 1) * 0.35] }).pop();
  b.efekt(0, 0);
  const korpus = b.geo(THREE);
  // NÓŻ: leży (przed) albo wbity w blat (po)
  const n = new Bud();
  n.push();
  // nóż ×1,6: w skali 1:1 z kamery gry był kreską (zrzut dist/skrzynie-3d-e3-stolnica-stoly.png)
  if (wbity) n.tr(0.04, Y + 0.26, 0.05).rotZ(Math.PI + 0.12).rotX(0.1).skal(1.6);   // czubek w dół, rękojeść do góry
  else n.tr(0.1, Y + 0.028, 0.12).rotY(0.7).rotX(-Math.PI / 2).skal(1.6);            // leży płasko na obrusie
  n.efekt(0, 1);
  n.triOut([-0.028, 0, 0.004], [0.028, 0, 0.004], [0.026, 0.3, 0.004], [0, 0, 1], K.ostrze);
  n.triOut([-0.028, 0, 0.004], [0.026, 0.3, 0.004], [-0.004, 0.36, 0.004], [0, 0, 1], K.ostrze);
  n.triOut([-0.028, 0, -0.004], [0.028, 0, -0.004], [0.026, 0.3, -0.004], [0, 0, -1], K.ostrze);
  n.triOut([-0.028, 0, -0.004], [0.026, 0.3, -0.004], [-0.004, 0.36, -0.004], [0, 0, -1], K.ostrze);
  n.efekt(0, 0);
  const odR = n.nv;
  n.pudlo(-0.045, -0.02, -0.018, 0.045, 0.0, 0.018, K.nit, { faz: 0.006 });
  n.pudlo(-0.024, -0.17, -0.016, 0.024, -0.02, 0.016, K.rekojesc, { faz: 0.012 });
  n.obrys(odR, OBR * 0.7, K.obrys);
  n.efekt(0, 1);
  for (const y of [-0.06, -0.12]) n.push().tr(0, y, 0.017).dysk(0.008, 5, K.nit).pop();
  n.efekt(0, 0);
  n.pop();
  if (wbity) for (let i = 0; i < 5; i++) {         // „rana" w obrusie
    const a = i / 5 * TAU + 0.3;
    n.push().tr(0.04 + Math.cos(a) * 0.05, Y + 0.003, 0.05 + Math.sin(a) * 0.05).rotX(-Math.PI / 2).rotZ(-a)
      .wielokat([[0, -0.006], [0.07, 0], [0, 0.006]], lin(0x7a1d18)).pop();
  }
  return { nazwa: wbity ? 'stolWyzwaniaPo' : 'stolWyzwania', czesci: [{ nazwa: 'korpus', geo: korpus }, { nazwa: 'noz', geo: n.geo(THREE) }], wys: 1.35, r: 0.8 };
}

// ---------- E3: koc piknikowy z koszem łupu ----------
function piknik(THREE) {
  const K = { czer: lin(0xd8453c), biel: lin(0xf7efe4), wik: lin(0xc99a5a), wikC: lin(0xa8783f), wikJ: lin(0xe0b673), rant: lin(0x94642f),
              wnetrze: lin(0x6a4526), zloto: lin(0xffc93a), bagietka: lin(0xe0a45c), bagietkaJ: lin(0xf2cf8e), talerz: lin(0xf4f2ee),
              jablko: lin(0xe0453a), ser: lin(0xf6cf4a), butelka: lin(0x3f7a45), obrys: lin(0x3a2412) };
  const b = new Bud(), KW = 2.5, KD = 1.75, NX = 10, NZ = 7;
  // koc (5 × 3,5 j.) w kratkę, lekko pofalowany
  const fal = (x, z) => 0.03 + 0.012 * Math.sin(x * 2.1 + z * 1.3) + 0.008 * Math.sin(z * 3.7 - x);   // min 0,01 nad ziemią
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const x0 = -KW + 2 * KW * i / NX, x1 = -KW + 2 * KW * (i + 1) / NX, z0 = -KD + 2 * KD * j / NZ, z1 = -KD + 2 * KD * (j + 1) / NZ;
    const k = (i % 2) && (j % 2) ? mn(K.czer, 0.82) : (i % 2) || (j % 2) ? K.czer : K.biel;
    b.quadOut([x0, fal(x0, z0), z0], [x1, fal(x1, z0), z0], [x1, fal(x1, z1), z1], [x0, fal(x0, z1), z1], [0, 1, 0], k);
  }
  // talerze, jabłka, ser, butelka
  const od = b.nv;
  for (const [x, z] of [[-1.4, 0.7], [1.2, -0.9]]) b.push().tr(x, 0.03, z).walec(0.26, 0.2, 0.0, 0.035, 12, K.talerz, { gora: true }).pop();
  for (const [x, z] of [[-1.35, 0.72], [-1.2, 0.6], [1.6, 0.9]]) {
    b.push().tr(x, 0.11, z).kula(0.085, 8, 5, K.jablko, { kFn: s => s > 0.5 ? lin(0xff7a64) : K.jablko }).pop();
    b.push().tr(x, 0.19, z).rura([0, 0, 0], [0.01, 0.05, 0], 0.008, 0.006, 4, K.rant).pop();
  }
  b.push().tr(1.25, 0.065, -0.9).rotY(0.4).pudlo(-0.14, 0, -0.09, 0.14, 0.1, 0.09, K.ser, { faz: 0.02 }).pop();
  b.push().tr(-0.9, 0.08, -0.95).rotY(1.1).rotZ(Math.PI / 2).walec(0.07, 0.07, -0.18, 0.1, 8, K.butelka, { dol: true }).walec(0.07, 0.03, 0.1, 0.2, 8, K.butelka).walec(0.03, 0.03, 0.2, 0.32, 6, K.butelka, { gora: true }).pop();
  // KOSZ: owalna wiklina (splot w kratkę), gruby rant, pałąk; łup w środku świeci
  const HK = 0.5, RK = 0.42;
  b.push().tr(0, 0.02, 0).skal(1.3, 1, 1);
  b.lathe([[0.0, 0, K.wikC], [RK - 0.06, 0, K.wikC], [RK - 0.02, 0.06, K.wik], [RK, 0.16, K.wik], [RK + 0.01, 0.28, K.wik], [RK + 0.02, 0.4, K.wik], [RK + 0.02, HK - 0.04, K.wik]], 16,
    { kFn: (i, j, k0) => i === 0 ? k0 : ((i + j) % 2 ? K.wikC : k0) });
  b.push().tr(0, HK - 0.04, 0).rotX(Math.PI / 2).luk(RK + 0.015, 0.035, 0, TAU, 20, 5, K.rant).pop();
  b.lathe([[RK - 0.01, HK - 0.05, K.wnetrze, false, [-1, 0]], [RK - 0.01, 0.12, K.wnetrze, false, [-1, 0]]], 16);
  b.lathe([[0, 0.12, K.wnetrze, false, [0, 1]], [RK - 0.01, 0.12, K.wnetrze, false, [0, 1]]], 16);
  b.pop();
  b.push().tr(0, HK - 0.03, 0).luk(0.5, 0.03, 0, Math.PI, 12, 5, K.rant).pop();   // pałąk nad koszem
  b.efekt(0.85, 0.6);
  b.push().tr(0, 0.3, 0).skal(1.25, 0.45, 0.95).kula(RK - 0.04, 10, 3, K.zloto, { od: 0 }).pop();
  b.efekt(0, 0);
  b.push().tr(-0.2, HK + 0.02, 0).rotZ(0.9).walec(0.06, 0.06, -0.28, 0.28, 8, K.bagietka, { gora: true, dol: true, kGora: K.bagietkaJ, kDol: K.bagietkaJ }).pop();
  b.ao(od, 0, HK, 0.8, 1.03);
  b.obrys(od, OBR, K.obrys);
  const korpus = b.geo(THREE);
  // KLAPY: dwie połówki owalnego wieka, zawiasy przy pałąku (oś X); klapa P otwiera się ku +Z, L ku −Z
  const klapa = zn => {
    const k = new Bud(), N = 8;
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N;
      const P0 = [Math.cos(a0) * (RK + 0.04) * 1.3, 0, zn * Math.sin(a0) * (RK + 0.04)], P1 = [Math.cos(a1) * (RK + 0.04) * 1.3, 0, zn * Math.sin(a1) * (RK + 0.04)];
      k.triOut([0, 0.04, 0], P0.map((v, ii) => ii === 1 ? 0.03 : v), P1.map((v, ii) => ii === 1 ? 0.03 : v), [0, 1, 0], i % 2 ? K.wik : K.wikJ);
      k.triOut([0, 0, 0], P0, P1, [0, -1, 0], K.wnetrze);
      k.quadOut(P0, P1, [P1[0], 0.03, P1[2]], [P0[0], 0.03, P0[2]], [Math.cos((a0 + a1) / 2), 0, zn * Math.sin((a0 + a1) / 2)], K.rant);
    }
    k.obrys(0, OBR * 0.8, K.obrys);
    return k.geo(THREE);
  };
  return { nazwa: 'piknik', czesci: [
    { nazwa: 'korpus', geo: korpus },
    { nazwa: 'klapaP', geo: klapa(1), pivot: [0, 0.02 + HK - 0.005, 0.02] },
    { nazwa: 'klapaL', geo: klapa(-1), pivot: [0, 0.02 + HK - 0.005, -0.02] },
  ], wys: HK + 0.55, r: 2.6, zawias: { os: 'x', otwarte: -1.45 } };   // klapaP: rx = kąt, klapaL: rx = −kąt (obie stają pionowo przy pałąku)
}

// kolory światła (promień, blask, iskry) — wspólne dla gry i podglądu
export const KOLORY = { zlota: 0xffc93a, kapral: 0x9a52ff, don: 0xff5a3c, ogien: 0xff8a2a, chlod: 0x9fdcff, iskraZlota: 0xffe38a, iskraKapral: 0xd9a8ff };

const BUDOWY = {
  skrzynka, zlota: T => kufer(T, 'zlota'), kapral: T => kufer(T, 'kapral'), don: T => kufer(T, 'don'),
  garnek, witryna, stolnica, stolWyzwania: T => stolWyzwania(T, false), stolWyzwaniaPo: T => stolWyzwania(T, true), piknik,
};
export const NAZWY_MODELI = Object.keys(BUDOWY);
const _modele = new Map();
export function model(THREE, nazwa) {
  let m = _modele.get(nazwa);
  if (!m) { m = BUDOWY[nazwa](THREE); _modele.set(nazwa, m); }
  return m;
}
export function liczTrojkaty(m) {
  let n = 0; const cz = {};
  for (const c of m.czesci) { const t = c.geo.attributes.position.count / 3; cz[c.nazwa] = t; n += t; }
  return { razem: n, czesci: cz };
}

// Grupa z punktami obrotu (dla podglądów i E3): grupa.userData.czesci[nazwa] = obiekt do obracania
export function zbudujGrupe(THREE, m, mat) {
  const g = new THREE.Group(); g.userData.czesci = {};
  for (const c of m.czesci) {
    const mesh = new THREE.Mesh(c.geo, mat);
    mesh.castShadow = c.cien !== false; mesh.receiveShadow = true;
    if (c.pivot) {
      const p = new THREE.Group(); p.position.fromArray(c.pivot); p.add(mesh); g.add(p); g.userData.czesci[c.nazwa] = p;
    } else { g.add(mesh); g.userData.czesci[c.nazwa] = mesh; }
  }
  return g;
}

// ============================== ANIMACJE (wspólne dla gry i podglądu) ==============================
const easeOutBack = (k, s = 1.9) => { const t = k - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
export const ANIM = {
  CZAS_OTWARCIA: 0.28,                              // s do otwarcia nakładki (gra czeka tyle, ile trwa wieko)
  // kąt wieka po `t` s od otwarcia (0 → `kat`, z przeskokiem i drobnym odbiciem)
  wieko(t, kat = -1.9) {
    if (t <= 0) return 0;
    const k = clamp(t / 0.24, 0, 1);
    let a = kat * easeOutBack(k, 1.6);
    if (t > 0.24) a = kat * (1 + 0.06 * Math.sin((t - 0.24) * 26) * Math.exp(-(t - 0.24) * 9));
    return a;
  },
  // przysiad i podskok przy otwarciu: { dy, sy, sxz }
  podskok(t) {
    if (t <= 0 || t > 0.55) return { dy: 0, sy: 1, sxz: 1 };
    if (t < 0.07) { const k = t / 0.07; return { dy: 0, sy: 1 - 0.14 * k, sxz: 1 + 0.08 * k }; }
    const k = (t - 0.07) / 0.48, s = Math.sin(k * Math.PI);
    return { dy: 0.2 * s * (1 - k * 0.3), sy: 0.86 + 0.14 * sstep(0, 0.35, k) + 0.1 * Math.sin(k * Math.PI * 2) * (1 - k), sxz: 1.08 - 0.08 * sstep(0, 0.35, k) };
  },
  // wieko w bezczynności: co `okres` s dwa krótkie stuknięcia (coś tam siedzi)
  grzechot(tt, okres = 3.4) {
    const k = ((tt % okres) + okres) % okres / 0.42;
    if (k >= 1) return { wieko: 0, dy: 0 };
    const s = Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k);
    return { wieko: -0.13 * s, dy: 0.03 * s };
  },
  // kopiec warzyw w skrzynce: co ~3,4 s podskakuje z przysiadem (część `zawartosc`) → { dy, sy, s }
  kopiec(tt, okres = 3.4) {
    const k = ((tt % okres) + okres) % okres / 0.5;
    if (k >= 1) return { dy: 0, sy: 1, s: 1 };
    const s = Math.sin(k * Math.PI * 2) * (1 - k);
    return { dy: Math.max(0, s) * 0.06, sy: 1 - 0.1 * s, s: 1 + 0.03 * Math.max(0, -s) };
  },
  // zebranie skrzynki: kopiec wyskakuje, puchnie i znika w ~0,32 s; potem null (= ukryj)
  kopiecZebrany(t) {
    if (t < 0) return { dy: 0, sy: 1, s: 1 };
    if (t < 0.1) { const k = t / 0.1; return { dy: 0.28 * k, sy: 1.1, s: 1 + 0.15 * k }; }
    if (t < 0.32) { const k = (t - 0.1) / 0.22; return { dy: 0.28 + 0.2 * k, sy: 1.1 - 0.2 * k, s: 1.15 * (1 - k * k) }; }
    return null;
  },
  // kufer unosi się, lekko kołysze i co ~2,6 s uchyla wieko (światło z wnętrza pulsuje)
  unoszenie(tt) {
    const k = ((tt % 2.6) + 2.6) % 2.6 / 0.9;
    const uch = k < 1 ? Math.sin(k * Math.PI) : 0;
    return { dy: 0.16 + Math.sin(tt * 2.2) * 0.1, yaw: Math.sin(tt * 0.8) * 0.35, wieko: -0.12 * uch * uch, sw: 0.75 + 0.25 * Math.sin(tt * 3.1) + 0.6 * uch };
  },
  // pokrywka garnka: co ~2 s podskok z przechyłem (para bucha), w spoczynku uchylona na łyżce
  pokrywka(tt, faza = 0) {
    const okres = 1.9 + faza * 0.5, k = ((tt + faza * 7) % okres + okres) % okres / 0.5;
    if (k >= 1) return { dy: 0, rz: 0, rx: 0, buch: false };
    const s = Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k * 0.6);
    return { dy: 0.07 * s, rz: 0.08 * s, rx: 0.05 * Math.sin(k * 9), buch: k < 0.08 };
  },
  // dotknięcie garnka: pokrywka wyskakuje wysoko i spada z odbiciami
  pokrywkaWybuch(t) {
    if (t < 0 || t > 1.1) return null;
    if (t < 0.5) { const k = t / 0.5; return { dy: 0.55 * Math.sin(k * Math.PI), rz: 0.9 * Math.sin(k * Math.PI) * (1 - k * 0.4), rx: 0.4 * Math.sin(k * 7) }; }
    const k = (t - 0.5) / 0.6;
    return { dy: 0.08 * Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k), rz: 0.1 * Math.sin(k * 14) * (1 - k), rx: 0 };
  },
};

// ============================== RYSOWANIE INSTANCJAMI ==============================
// Jedna InstancedMesh na część modelu. Co klatkę: begin() → dodaj(stan) × n → end().
//   stan = { x, y, z, yaw, skala, sy, sxz, jas (0..1+, instanceColor), sw (emisja), faza, polysk,
//            czesci: { [nazwa]: { rx, ry, rz, dx, dy, dz, s, sy, ukryj } } }
export class ZestawModeli {
  constructor(THREE, scene, m, mat, o = {}) {
    this.T = THREE; this.scene = scene; this.model = m; this.mat = mat; this.nazwa = o.nazwa || m.nazwa;
    this.n = 0; this.cap = 0; this.czesci = m.czesci.map(c => ({ c, m: null, aIn: null, geo: c.geo.clone() }));
    this._M = new THREE.Matrix4(); this._Mp = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._Y = new THREE.Vector3(0, 1, 0);
    this.cien = o.cien !== false;
    this._rosnij(o.cap || 4);
  }
  _rosnij(cap) {
    const T = this.T;
    for (const cz of this.czesci) {
      const st = cz.m;
      const aIn = new T.InstancedBufferAttribute(new Float32Array(cap * 3), 3); aIn.setUsage(T.DynamicDrawUsage);
      cz.geo.setAttribute('aIn', aIn);
      const m = new T.InstancedMesh(cz.geo, this.mat, cap);
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.instanceColor = new T.InstancedBufferAttribute(new Float32Array(cap * 3), 3); m.instanceColor.setUsage(T.DynamicDrawUsage);
      m.castShadow = this.cien && cz.c.cien !== false; m.receiveShadow = true; m.frustumCulled = false;
      m.count = 0; m.visible = false; m.name = this.nazwa + ':' + cz.c.nazwa;
      if (st) {
        m.instanceMatrix.array.set(st.instanceMatrix.array.subarray(0, this.n * 16));
        m.instanceColor.array.set(st.instanceColor.array.subarray(0, this.n * 3));
        aIn.array.set(cz.aIn.array.subarray(0, this.n * 3));
        this.scene.remove(st); st.dispose();
      }
      cz.m = m; cz.aIn = aIn;
      this.scene.add(m);
    }
    this.cap = cap;
  }
  begin() { this.n = 0; }
  dodaj(s) {
    if (this.n >= this.cap) this._rosnij(this.cap * 2);
    const i = this.n++, sk = s.skala == null ? 1 : s.skala, sy = s.sy == null ? 1 : s.sy, sxz = s.sxz == null ? 1 : s.sxz;
    this._q.setFromAxisAngle(this._Y, s.yaw || 0);
    this._M.compose(this._v.set(s.x, s.y, s.z), this._q, this._s.set(sk * sxz, sk * sy, sk * sxz));
    const jas = s.jas == null ? 1 : s.jas, sw = s.sw == null ? 1 : s.sw, faza = s.faza || 0, pol = s.polysk == null ? 1 : s.polysk;
    for (const cz of this.czesci) {
      const st = s.czesci && s.czesci[cz.c.nazwa];
      const Mp = this._Mp;
      if (st && st.ukryj) Mp.makeScale(0, 0, 0);
      else if (cz.c.pivot) {
        const p = cz.c.pivot;
        this._e.set((st && st.rx) || 0, (st && st.ry) || 0, (st && st.rz) || 0);
        this._q2.setFromEuler(this._e);
        const ps = st && st.s != null ? st.s : 1, psy = st && st.sy != null ? st.sy : 1;
        Mp.compose(this._v.set(p[0] + ((st && st.dx) || 0), p[1] + ((st && st.dy) || 0), p[2] + ((st && st.dz) || 0)), this._q2, this._s.set(ps, ps * psy, ps));
        Mp.premultiply(this._M);
      } else Mp.copy(this._M);
      Mp.toArray(cz.m.instanceMatrix.array, i * 16);
      const c = cz.m.instanceColor.array; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = jas;
      const a = cz.aIn.array; a[i * 3] = sw; a[i * 3 + 1] = faza; a[i * 3 + 2] = pol;
    }
    return i;
  }
  end() {
    for (const cz of this.czesci) {
      const m = cz.m; m.count = this.n; m.visible = this.n > 0;
      if (!this.n) continue;
      m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; cz.aIn.needsUpdate = true;
    }
  }
  get drawCalle() { return this.n ? this.czesci.length : 0; }
  usun() { for (const cz of this.czesci) { this.scene.remove(cz.m); cz.m.dispose(); cz.geo.dispose(); } }
}

// ============================== EFEKTY: promienie, blaski, para, iskry ==============================
function kanwa(n, m = n) {
  const c = document.createElement('canvas'); c.width = n; c.height = m; return [c, c.getContext('2d')];
}
function teksturaBlasku(THREE) {
  const [c, g] = kanwa(64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.65, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// para: pixel-artowy kłębek (twarde krawędzie, 2 tony) — pasuje do chmur na niebie i do sprite'ów
function teksturaPary(THREE) {
  const [c, g] = kanwa(16);
  const kolo = (x, y, r, kol) => { g.fillStyle = kol; for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= r * r) g.fillRect(xx, yy, 1, 1); };
  kolo(8, 9, 6.6, 'rgba(214,226,238,0.85)'); kolo(6, 8, 4.4, 'rgba(255,255,255,0.95)'); kolo(10, 7, 3.6, 'rgba(255,255,255,0.95)');
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function teksturaIskry(THREE) {
  const [c, g] = kanwa(9);
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(4, 1, 1, 7); g.fillRect(1, 4, 7, 1);
  g.fillStyle = '#fff'; g.fillRect(4, 2, 1, 5); g.fillRect(2, 4, 5, 1); g.fillRect(3, 3, 3, 3);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t;
}
// promień: dwa otwarte walce (poświata + rdzeń); uv.y = wysokość 0..1, uv.x > 1.5 = rdzeń
function geoPromienia(THREE) {
  const P = [], N = [], UV = [], seg = 10;
  const walec = (r0, r1, rdzen) => {
    for (let i = 0; i < seg; i++) {
      const a0 = TAU * i / seg, a1 = TAU * (i + 1) / seg;
      const v = (a, y, r) => { P.push(Math.cos(a) * r, y, Math.sin(a) * r); N.push(Math.cos(a), 0, Math.sin(a)); UV.push(rdzen ? 2 + a / TAU : a / TAU, y); };
      v(a0, 0, r0); v(a1, 0, r0); v(a1, 1, r1); v(a0, 0, r0); v(a1, 1, r1); v(a0, 1, r1);
    }
  };
  walec(1, 1.25, false); walec(0.26, 0.32, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  return g;
}
function instancje(THREE, scene, geo, mat, cap, ro, alfa) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  if (alfa) { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aA', a); m.userData.aA = a; }
  m.frustumCulled = false; m.count = 0; m.visible = false; m.renderOrder = ro;
  scene.add(m);
  return m;
}
export class EfektySkrzyn {
  constructor(THREE, scene, o = {}) {
    this.T = THREE; this.scene = scene; this.czas = o.czas || { value: 0 };
    const add = THREE.AdditiveBlending;
    this.promMat = new THREE.ShaderMaterial({
      uniforms: { uCzas: this.czas }, transparent: true, depthWrite: false, blending: add, side: THREE.DoubleSide, fog: false,
      vertexShader: `varying vec2 vUv; varying vec3 vKol; varying float vF;
        void main() {
          vUv = uv;
          #ifdef USE_INSTANCING_COLOR
            vKol = instanceColor;
          #else
            vKol = vec3(1.0);
          #endif
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec4 mv = viewMatrix * wp;
          vec3 n = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vF = abs(dot(n, normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uCzas; varying vec2 vUv; varying vec3 vKol; varying float vF;
        void main() {
          float h = vUv.y, rdzen = step(1.5, vUv.x);
          // u podstawy słabo (skrzynię oświetla blask na ziemi), najjaśniej na ~1/5 wysokości, w górze gaśnie
          float zanik = smoothstep(0.0, 0.12, h) * pow(1.0 - h, 1.25);
          float pasy = 0.72 + 0.28 * step(0.6, fract(h * 9.0 - uCzas * 1.1));
          float a = zanik * pasy * mix(vF * vF * 0.3, pow(vF, 1.3) * 0.6, rdzen);
          gl_FragColor = vec4(vKol, a);
          #include <colorspace_fragment>
        }`,
    });
    this.prom = instancje(THREE, scene, geoPromienia(THREE), this.promMat, 8, 6);
    const pl = new THREE.PlaneGeometry(1, 1); pl.rotateX(-Math.PI / 2);
    this.blaskMat = new THREE.MeshBasicMaterial({ map: teksturaBlasku(THREE), transparent: true, depthWrite: false, blending: add, fog: false });
    this.blask = instancje(THREE, scene, pl, this.blaskMat, 16, 2);
    this.paraMat = new THREE.MeshBasicMaterial({ map: teksturaPary(THREE), transparent: true, depthWrite: false });
    this.paraMat.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute float aA;\nvarying float vA;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vA = aA;');
      sh.fragmentShader = 'varying float vA;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vA;');
    };
    this.paraMat.customProgramCacheKey = () => 'skrzynie-para-v1';
    const q = new THREE.PlaneGeometry(1, 1);
    this.para = instancje(THREE, scene, q, this.paraMat, 96, 7, true);
    this.iskraMat = new THREE.MeshBasicMaterial({ map: teksturaIskry(THREE), transparent: true, depthWrite: false, blending: add, fog: false });
    this.iskry = instancje(THREE, scene, new THREE.PlaneGeometry(1, 1), this.iskraMat, 96, 8);
    // miękki cień kontaktowy (market: bez mapy cieni skrzynka wyglądała jak naklejona na podłogę)
    this.cienMat = new THREE.MeshBasicMaterial({ map: teksturaBlasku(THREE), color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false });
    const pl2 = new THREE.PlaneGeometry(1, 1); pl2.rotateX(-Math.PI / 2);
    this.cien = instancje(THREE, scene, pl2, this.cienMat, 16, 1);
    this.cz = [];
    this._los = prng(4242);                          // własny strumień: gra podmienia Math.random na seed bota
    this._M = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    this._n = { prom: 0, blask: 0, cien: 0 };
  }
  begin() { this._n.prom = 0; this._n.blask = 0; this._n.cien = 0; }
  // cień kontaktowy pod bryłą (rx × rz), np. tam, gdzie nie ma mapy cieni
  cienKontaktowy(x, y, z, rx, rz = rx, yaw = 0) {
    const m = this.cien, i = this._n.cien;
    if (i >= m.instanceMatrix.count) return;
    this._n.cien++;
    this._M.compose(this._v.set(x, y, z), this._q.setFromAxisAngle(this._s.set(0, 1, 0), yaw), this._s.set(rx * 2, 1, rz * 2));
    this._M.toArray(m.instanceMatrix.array, i * 16);
    const c = m.instanceColor.array; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 1;
  }
  _kol(m, i, kol, k) {
    const c = m.instanceColor.array; this._c.set(kol);
    c[i * 3] = this._c.r * k; c[i * 3 + 1] = this._c.g * k; c[i * 3 + 2] = this._c.b * k;
  }
  // promień w górę (x, y = podstawa, z), r = promień poświaty, h = wysokość, jas = jasność
  promien(x, y, z, kol, jas = 1, r = 0.45, h = 16) {
    const m = this.prom, i = this._n.prom;
    if (i >= m.instanceMatrix.count) return;
    this._n.prom++;
    this._M.compose(this._v.set(x, y, z), this._q.identity(), this._s.set(r, h, r));
    this._M.toArray(m.instanceMatrix.array, i * 16);
    this._kol(m, i, kol, jas);
  }
  blaskNaZiemi(x, y, z, kol, jas = 1, r = 2) {
    const m = this.blask, i = this._n.blask;
    if (i >= m.instanceMatrix.count) return;
    this._n.blask++;
    this._M.compose(this._v.set(x, y, z), this._q.identity(), this._s.set(r * 2, 1, r * 2));
    this._M.toArray(m.instanceMatrix.array, i * 16);
    this._kol(m, i, kol, jas);
  }
  // cząstka: typ 'para' | 'iskra'; o = { vx, vy, vz, zycie, s0, s1, kol, a }
  emituj(typ, x, y, z, o = {}) {
    if (this.cz.length > 180) return;
    this.cz.push({ typ, x, y, z, vx: o.vx || 0, vy: o.vy == null ? 0.9 : o.vy, vz: o.vz || 0, t: 0, T: o.zycie || 1.4,
                   s0: o.s0 || 0.25, s1: o.s1 || 0.6, kol: o.kol == null ? 0xffffff : o.kol, a: o.a == null ? 0.8 : o.a, wir: this._los() * TAU });
  }
  aktualizuj(dt, wiatr = 0.25) {
    for (let i = this.cz.length - 1; i >= 0; i--) {
      const p = this.cz[i]; p.t += dt;
      if (p.t >= p.T) { this.cz.splice(i, 1); continue; }
      if (p.typ === 'para') { p.vx += wiatr * dt * 0.6; p.vy *= 1 - dt * 0.5; }
      else p.vy *= 1 - dt * 1.4;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
  }
  wyczysc() { this.cz.length = 0; }
  end(camera) {
    const q = camera.quaternion;
    let np = 0, ni = 0;
    const P = this.para, I = this.iskry, aA = P.userData.aA;
    for (const p of this.cz) {
      const k = p.t / p.T, s = p.s0 + (p.s1 - p.s0) * Math.sqrt(k);
      if (p.typ === 'para') {
        if (np >= P.instanceMatrix.count) continue;
        this._M.compose(this._v.set(p.x, p.y, p.z), q, this._s.set(s, s, s));
        this._M.toArray(P.instanceMatrix.array, np * 16);
        this._kol(P, np, p.kol, 1);
        aA.array[np] = p.a * sstep(0, 0.12, k) * (1 - sstep(0.55, 1, k));
        np++;
      } else {
        if (ni >= I.instanceMatrix.count) continue;
        const mig = 0.6 + 0.4 * Math.sin(p.t * 22 + p.wir);
        this._M.compose(this._v.set(p.x, p.y, p.z), q, this._s.set(s, s, s));
        this._M.toArray(I.instanceMatrix.array, ni * 16);
        this._kol(I, ni, p.kol, p.a * mig * (1 - sstep(0.6, 1, k)));
        ni++;
      }
    }
    const fin = (m, n, a) => { m.count = n; m.visible = n > 0; if (n) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; if (a) a.needsUpdate = true; } };
    fin(P, np, aA); fin(I, ni); fin(this.prom, this._n.prom); fin(this.blask, this._n.blask); fin(this.cien, this._n.cien);
  }
  get drawCalle() { return [this.prom, this.blask, this.para, this.iskry, this.cien].filter(m => m.visible).length; }
}
