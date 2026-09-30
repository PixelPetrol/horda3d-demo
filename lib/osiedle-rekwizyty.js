// ╔══════════════ OSIEDLE — PROCEDURALNE REKWIZYTY (30.09.2026) ══════════════╗
// Modele do mapy „Osiedle": bloki z wielkiej płyty, auta, trzepak, piaskownica, huśtawki,
// blaszaki, wiata śmietnikowa, latarnie, ławki (+ dodatkowo nawierzchnie).
// Zero plików z sieci — wszystko liczone w kodzie, deterministycznie z ziarna.
//
// KONTRAKT (drugi agent pisze pod dokładnie te sygnatury):
//   każda funkcja: (THREE, opcje) → { geo, kolizje, ... }
//     geo      — THREE.BufferGeometry BEZ INDEKSU, atrybuty position/normal/uv/color
//                (wszystkie itemSize jak w three: 3/3/2/3), gotowa do mergeGeometries
//                z pozostałymi rekwizytami → cały chunk osiedla = 1 siatka = 1 draw call.
//     kolizje  — [{x, z, w, d, h}]: AABB w układzie lokalnym modelu. (x, z) = ŚRODEK prostokąta,
//                w = rozmiar wzdłuż X, d = wzdłuż Z, h = wysokość od y = 0 (Y w górę).
//                Środek podstawy modelu leży w (0, 0, 0).
//     cienGeo  — (tylko blok) uproszczona bryła do rzucania cienia, te same atrybuty co geo.
//                Opcjonalna optymalizacja: bez niej `geo` też rzuca poprawny cień.
//   materialOsiedla(THREE) → JEDEN wspólny materiał (MeshLambert + vertexColors + atlas z kodu).
//
// ORIENTACJA: blok stoi długością wzdłuż X; WEJŚCIA (klatki schodowe) są po stronie +Z,
// druga elewacja (−Z) ma więcej balkonów. Auto stoi długością wzdłuż Z, przodem do +Z.
// Garaże: rząd wzdłuż X, bramy od strony +Z. Wiata śmietnikowa otwarta od +Z.
// Ławka siedziskiem ku +Z. Latarnia wysięgnikiem ku +Z.
//
// MATERIAŁ I MASKA: atlas 1024² RGBA; kanał ALFA to „maska barwienia": 1 = piksel mnożony
// przez kolor wierzchołka (ściany, blacha, lakier), 0 = kolor wprost z tekstury (szyby,
// firanki, mozaiki, lampy) — mnożony tylko przez JASNOŚĆ koloru wierzchołka (max składowej),
// żeby AO z kolorów wierzchołków dalej działało. Dzięki temu jedna komórka „moduł płyty
// z oknem" pasuje do każdej pastelowej elewacji, a okno zostaje oknem.
// Atlas rysowany RAZ (≈55 ms w Chrome na M-serii, płótno programowe), DataTexture 1024² RGBA
// z mipmapami ≈ 5,3 MB VRAM.
// Światło: 3 pasma toon jak `naturaMat` w main.js (te same wagi, próg jasnego pasma niżej, bo
// elewacje są pionowe) + TON CIENIA: cień z shadow mapy daje pasmo cienia z chłodnym odcieniem,
// a nie samą hemisferę (szczegóły przy materialOsiedla). Z `receiveShadow = false` też działa.
//
// ⚠️ PUŁAPKA three r160: klucz programu = `onBeforeCompile.toString()` + parametry materiału.
// `addCloudShadow(mat)` z main.js podmienia onBeforeCompile na zamknięcie o IDENTYCZNYM
// źródle dla każdego materiału — a `chunkMat` (teren) ma te same parametry (map + vertexColors),
// więc bez własnego klucza teren i osiedle dzieliłyby JEDEN program (jeden z nich bez swoich
// podmian). Dlatego `customProgramCacheKey` ma tu własny prefiks. addCloudShadow można
// bezpiecznie nałożyć na ten materiał (łańcuchuje stary onBeforeCompile).
// ╚═════════════════════════════════════════════════════════════════════════════╝

const TAU = Math.PI * 2;

// ============================== PRNG (mulberry32) ==============================
function hashTekst(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}
export function prng(ziarno = 1) {
  let s = typeof ziarno === 'string' ? hashTekst(ziarno) : (Math.floor(Number(ziarno) * 1000003) | 0);
  s = (Math.imul(s ^ 0x5bd1e995, 0x27d4eb2d) ^ 0x9e3779b9) | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const wybierz = (R, tab) => tab[Math.floor(R() * tab.length) % tab.length];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const liczba = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// ============================== KOLORY (sRGB hex → liniowe, jak THREE.Color) ==============================
function lin(hex) {
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}
const mnoz = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const miesz = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const BIEL = [1, 1, 1];

// SCHEMATY ELEWACJI — ułożone ręcznie, żeby każdy blok był spójny (ściana, parter, pas klatki,
// balkony naprzemiennie z pary, szczyt). Pastele lekko przygaszone: na limonkowej łące czysta
// biel i nasycone kolory „krzyczą", a Ghibli/BotW grają ciepłym, miękkim tonem.
const SCHEMATY = [
  { nm: 'krem',        sciana: 0xefe0c2, parter: 0xe4c6a2, klatka: 0xe3a582, balkony: [0xefb06c, 0xf2d27e], szczyt: 0xe9d4ae },
  { nm: 'mieta',       sciana: 0xd2e7cc, parter: 0xb7d6bd, klatka: 0x86c1b3, balkony: [0xf1d27a, 0xf4ecdc], szczyt: 0xc5e0c6 },
  { nm: 'blekit',      sciana: 0xcfdfec, parter: 0xb5cadf, klatka: 0x8fb0da, balkony: [0xf0a690, 0xf3e8d4], szczyt: 0xc2d6ea },
  { nm: 'brzoskwinia', sciana: 0xf2cfae, parter: 0xe6b692, klatka: 0xe2988d, balkony: [0x8dc8b9, 0xf4eadb], szczyt: 0xeec3a0 },
  { nm: 'maslo',       sciana: 0xf1dfa6, parter: 0xe4c78a, klatka: 0xdcae5c, balkony: [0xa8cd8d, 0xe69c7c], szczyt: 0xecd596 },
  { nm: 'lila',        sciana: 0xdfd5e8, parter: 0xcbbedd, klatka: 0xd69aae, balkony: [0x9ed4be, 0xf1d683], szczyt: 0xd6cbe4 },
  { nm: 'pistacja',    sciana: 0xe1e7b8, parter: 0xcdd79e, klatka: 0xa7c789, balkony: [0xefac74, 0xf4eadb], szczyt: 0xd8e1a8 },
].map(s => ({ nm: s.nm, sciana: lin(s.sciana), parter: lin(s.parter), klatka: lin(s.klatka),
             balkony: s.balkony.map(lin), szczyt: lin(s.szczyt) }));
const KOL = {
  cokol: lin(0xbdb4a5), opaska: lin(0xd4cdc0), obrobka: lin(0xece8df), dach: lin(0xaaa59c),
  rynna: lin(0xdfe2e2), antena: lin(0x676d74), plyta: lin(0xd8d2c6), poreczy: lin(0xf2eee5),
  donica: lin(0xcf7a55), talerz: lin(0xe9ebeb), lampa: lin(0x5f656c), beton: lin(0xcdc7bb),
  opona: lin(0x3b3e45), chrom: lin(0xd2d7da), dachAuta: lin(0xf3ecd9), drewno: lin(0xcf9559),
  drewnoZiel: lin(0x86b37d), piaskownica: lin(0xd89a5c), wiata: lin(0x9fbf96), wiataDach: lin(0x8a9aa0),
};
const AUTA_KOLORY = [0x9fd6c2, 0x9fc4e8, 0xf2d27a, 0xef9f8a, 0xc8b1e0, 0xefe3c6, 0xb9d28f,
                     0xf4bb8e, 0x86c3c1, 0xe68a7e, 0xa9d0ea].map(lin);
// blaszaki: spłowiałe, lekko szarawe wersje klasyków (błękit, seledyn, rdzawy, beż, zieleń, bordo)
const GARAZE_KOLORY = [0x9cc2d9, 0xbdd49a, 0xe2a984, 0xd8cfb0, 0xabb8c2, 0xd49e9e, 0xead798, 0x98ccb8].map(lin);
const TRZEPAK_KOLORY = [0x7fb38a, 0x7fa6cb, 0xd98b7a, 0xe7c35f].map(lin);
const HUSTAWKI_KOLORY = [[0xf0c35a, 0xe0735f], [0x7fb9d8, 0xf0c35a], [0xe0735f, 0x7fc0a8]].map(p => p.map(lin));
const KONTENERY_KOLORY = [0xf0cf5c, 0x7fa8d8, 0x8fc27e, 0xb99a78, 0x9aa3a8].map(lin);

// ============================== ATLAS (siatka 8×8 komórek po 128 px) ==============================
const ATLAS = 1024, KOM = 128, NK = 8, MARG = 2;
// Rząd 1–3: moduły płyty z oknem (typ A duże, B kuchenne, C drzwi balkonowe) × 6 stylów okna.
const K = {
  BIALY: 0, BETON: 1, PANEL: 2, COKOL_OKNO: 3, BLACHA: 4, GARAZ: 5, GARAZ_RDZA: 6, DREWNO: 7,
  A: 8, DRZWI1: 14, DRZWI2: 15,
  B: 16, LUKSFERY: 22, KLATKA_OKNO: 23,
  C: 24, BALUSTRADA: 30, BALKON_SZYBY: 31,
  COKOL: 32, KONTENER: 33, AUTO_SZYBA: 34, AUTO_PRZOD: 35, AUTO_TYL: 36, AUTO_BOK: 37, AUTO_BOK_SZYBY: 38, PIASEK: 39,
  ASFALT: 40, CHODNIK: 41, DACH: 42, OPONA: 43, LAMPA: 44, KWIATY: 45, WIATA: 46, DRZWI3: 47,
};
const MURALE = [[0, 6], [2, 6], [4, 6]];          // lewe-górne komórki obszarów 2×2 (kolumna, rząd)
const STYLE_OKIEN = 6;
// uv komórki (z marginesem przeciw przeciekom mipmap); f = [fx0, fy0, fx1, fy1] ułamki komórki,
// fy liczone od DOŁU komórki
function uvK(id, f) {
  const cx = (id % NK) * KOM, cy = Math.floor(id / NK) * KOM;
  return uvPx(cx, cy, KOM, KOM, f);
}
function uvObszar(kol, rzad, nk, nr, f) { return uvPx(kol * KOM, rzad * KOM, nk * KOM, nr * KOM, f); }
function uvPx(cx, cy, w, h, f) {
  const fx0 = f ? f[0] : 0, fy0 = f ? f[1] : 0, fx1 = f ? f[2] : 1, fy1 = f ? f[3] : 1;
  const iw = w - 2 * MARG, ih = h - 2 * MARG;
  return [(cx + MARG + fx0 * iw) / ATLAS, 1 - (cy + h - MARG - fy0 * ih) / ATLAS,
          (cx + MARG + fx1 * iw) / ATLAS, 1 - (cy + h - MARG - fy1 * ih) / ATLAS];
}
const UV_BIALY = uvK(K.BIALY, [0.3, 0.3, 0.7, 0.7]);   // środek białej komórki = czysty kolor wierzchołka

// ---------- rysowanie komórek ----------
// Kontekst 2D z willReadFrequently = płótno PROGRAMOWE: atlas to tysiące drobnych wypełnień
// i jeden getImageData — na płótnie akcelerowanym przez GPU pierwsze rysowanie trwało sekundy.
// OffscreenCanvas bez kontekstu 2D (Safari < 16.4) → zwykły canvas.
function nowyKontekst(n) {
  const opc = { willReadFrequently: true };
  if (typeof OffscreenCanvas !== 'undefined') {
    try { const g = new OffscreenCanvas(n, n).getContext('2d', opc); if (g) return g; } catch (e) { /* niżej */ }
  }
  const c = document.createElement('canvas'); c.width = c.height = n; return c.getContext('2d', opc);
}
function zaokr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  if (r <= 0.01) { c.rect(x, y, w, h); return; }
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
// Komórka rysowana w JEDNOSTKACH ŚWIATA (W×H — wymiar ściany, na którą trafi), v od DOŁU.
// maska: true = barwione kolorem wierzchołka, false = kolor z tekstury, undefined = bez zmian.
function komorka(g, m, R, kx, ky, nk, nr, W, H) {
  const px = kx * KOM, py = ky * KOM, pw = nk * KOM, ph = nr * KOM, sx = pw / W, sy = ph / H;
  const X = u => px + u * sx, Y = v => py + ph - v * sy;
  const oba = (fn, kol, maska) => {
    fn(g); g.fillStyle = kol; g.fill();
    if (maska !== undefined) { fn(m); m.fillStyle = maska ? '#fff' : '#000'; m.fill(); }
  };
  const Kk = {
    g, m, R, W, H, X, Y, sx, sy,
    start() { for (const c of [g, m]) { c.save(); c.beginPath(); c.rect(px, py, pw, ph); c.clip(); } },
    stop() { g.restore(); m.restore(); },
    tlo(kol, maska = true) { g.fillStyle = kol; g.fillRect(px, py, pw, ph); m.fillStyle = maska ? '#fff' : '#000'; m.fillRect(px, py, pw, ph); },
    pr(u0, v0, u1, v1, kol, maska, r = 0) {
      const x = X(u0), y = Y(v1), w = (u1 - u0) * sx, h = (v1 - v0) * sy, rp = r * Math.min(sx, sy);
      oba(c => zaokr(c, x, y, w, h, rp), kol, maska);
    },
    elipsa(u, v, ru, rv, kol, maska, obrot = 0) {
      oba(c => { c.beginPath(); c.ellipse(X(u), Y(v), Math.max(0.1, ru * sx), Math.max(0.1, rv * sy), obrot, 0, TAU); }, kol, maska);
    },
    kolo(u, v, r, kol, maska) { Kk.elipsa(u, v, r, r, kol, maska); },
    wiel(pts, kol, maska) {
      oba(c => { c.beginPath(); pts.forEach(([u, v], i) => (i ? c.lineTo(X(u), Y(v)) : c.moveTo(X(u), Y(v)))); c.closePath(); }, kol, maska);
    },
    sciezka(fn, kol, maska) { oba(c => { c.beginPath(); fn(c); }, kol, maska); },
    grad(u0, v0, u1, v1, stopy) {
      const gr = g.createLinearGradient(X(u0), Y(v0), X(u1), Y(v1));
      for (const [t, c] of stopy) gr.addColorStop(t, c);
      return gr;
    },
    promien(u, v, r, stopy, naMaske) {       // miękka plama: gradient radialny (rgb albo maska)
      const c = naMaske ? m : g;
      const gr = c.createRadialGradient(X(u), Y(v), 0, X(u), Y(v), r * sx);
      for (const [t, k] of stopy) gr.addColorStop(t, k);
      c.fillStyle = gr; c.beginPath(); c.arc(X(u), Y(v), r * sx, 0, TAU); c.fill();
    },
  };
  return Kk;
}

const RAMA = '#f7f3ea', PARAPET = '#e5dfd3';
// ściana płyty: biel pod barwienie + miękkie plamy tynku + spoiny (lewa i dolna krawędź —
// sąsiednie moduły składają się w siatkę płyt) z jasnym rantem = płaskorzeźba bez geometrii
function scianaPanel(Kk, pas = 0) {
  const { R, W, H } = Kk;
  Kk.tlo('#fbf9f5', true);
  for (let i = 0; i < 6; i++) Kk.kolo(R() * W, R() * H, 0.35 + R() * 0.55, 'rgba(90,70,50,0.02)');
  if (pas > 0) Kk.pr(0, 0, W, pas, 'rgba(90,70,50,0.07)');         // pas podokienny („pasy płyt")
  Kk.pr(0.06, 0, 0.11, H, 'rgba(80,64,48,0.3)');
  Kk.pr(0.11, 0, 0.145, H, 'rgba(255,255,255,0.4)');
  Kk.pr(0, 0.05, W, 0.10, 'rgba(80,64,48,0.3)');
  Kk.pr(0, 0.10, W, 0.135, 'rgba(255,255,255,0.35)');
}
// szkło: odbite niebo u góry, głąb pokoju u dołu. Pierwsza wersja (#6390ba na dole) z daleka
// czytała się jak granatowe dziury w ścianie — teraz jaśniej i bardziej w błękit nieba Łąk.
function szyba(Kk, a0, b0, a1, b1, jasna, r = 0.02) {
  Kk.pr(a0, b0, a1, b1, Kk.grad(0, b1, 0, b0, jasna ? [[0, '#dcf1fa'], [1, '#aad2ea']] : [[0, '#a6cde6'], [0.6, '#86b3d6'], [1, '#6f9dc6']]), false, r);
  if (!jasna) Kk.pr(a0, b0, a1, b0 + (b1 - b0) * 0.3, 'rgba(40,60,95,0.12)');   // głąb pokoju
}
function refleks(Kk, a0, b0, a1, b1, sila = 0.3) {
  const { g, X, Y } = Kk;
  g.save(); g.beginPath(); g.rect(X(a0), Y(b1), X(a1) - X(a0), Y(b0) - Y(b1)); g.clip();
  const w = a1 - a0, h = b1 - b0;
  for (const [o, s] of [[0.18, 0.2], [0.48, 0.09]]) {
    const x0 = a0 + w * o;
    Kk.wiel([[x0, b0], [x0 + w * s, b0], [x0 + w * s + h * 0.55, b1], [x0 + h * 0.55, b1]], `rgba(255,255,255,${sila})`);
  }
  g.restore();
}
function firanka(Kk, a0, b0, a1, b1, frac) {
  const wy = b1 - b0, sz = a1 - a0, fh = wy * frac, n = 5, { X, Y } = Kk;
  Kk.sciezka(c => {
    c.moveTo(X(a0), Y(b1)); c.lineTo(X(a1), Y(b1)); c.lineTo(X(a1), Y(b1 - fh));
    for (let i = n; i > 0; i--) {
      const xa = a0 + sz * i / n, xb = a0 + sz * (i - 1) / n;
      c.quadraticCurveTo(X((xa + xb) / 2), Y(b1 - fh - wy * 0.1), X(xb), Y(b1 - fh));
    }
    c.closePath();
  }, 'rgba(255,255,255,0.74)');
  for (let i = 0; i < n * 2; i++) Kk.kolo(a0 + sz * (i + 0.5) / (n * 2), b1 - fh * 0.55, 0.022, 'rgba(255,255,255,0.6)');
}
function zaslony(Kk, a0, b0, a1, b1, kol) {
  const sz = a1 - a0, wy = b1 - b0, dw = sz * 0.25, { X, Y } = Kk;
  for (const s of [0, 1]) {
    const x0 = s ? a1 : a0, d = s ? -1 : 1;
    Kk.sciezka(c => {
      c.moveTo(X(x0), Y(b1)); c.lineTo(X(x0 + d * dw), Y(b1));
      c.quadraticCurveTo(X(x0 + d * dw * 0.95), Y(b0 + wy * 0.56), X(x0 + d * dw * 0.42), Y(b0 + wy * 0.38));
      c.quadraticCurveTo(X(x0 + d * dw * 0.8), Y(b0 + wy * 0.18), X(x0 + d * dw * 0.95), Y(b0));
      c.lineTo(X(x0), Y(b0)); c.closePath();
    }, kol, false);
    Kk.sciezka(c => {                                                 // fałda w cieniu
      c.moveTo(X(x0 + d * dw * 0.45), Y(b1)); c.lineTo(X(x0 + d * dw * 0.6), Y(b1));
      c.quadraticCurveTo(X(x0 + d * dw * 0.5), Y(b0 + wy * 0.6), X(x0 + d * dw * 0.32), Y(b0 + wy * 0.4));
      c.closePath();
    }, 'rgba(60,30,30,0.13)');
    Kk.kolo(x0 + d * dw * 0.44, b0 + wy * 0.38, 0.035, 'rgba(255,255,255,0.7)');
  }
}
function doniczka(Kk, a0, b0, a1) {
  const um = (a0 + a1) / 2 + (Kk.R() - 0.5) * 0.3 * (a1 - a0);
  Kk.wiel([[um - 0.12, b0], [um + 0.12, b0], [um + 0.15, b0 + 0.15], [um - 0.15, b0 + 0.15]], '#d2764f', false);
  Kk.kolo(um - 0.11, b0 + 0.24, 0.09, '#5c9b4d', false); Kk.kolo(um + 0.09, b0 + 0.27, 0.1, '#6aab58', false);
  Kk.kolo(um, b0 + 0.34, 0.09, '#79ba60', false);
  Kk.kolo(um - 0.07, b0 + 0.37, 0.045, '#ef6b7c', false); Kk.kolo(um + 0.1, b0 + 0.34, 0.04, '#f6a3ba', false);
  Kk.kolo(um + 0.02, b0 + 0.43, 0.04, '#ef6b7c', false);
}
// okno z ramą, szybą, zasłonami, parapetem i cieniem ościeża
// styl: 0 szkło + firanka, 1 szkło jasne (odbite niebo), 2 zasłony różowe, 3 musztardowe,
//       4 miętowe + kwiatek w doniczce, 5 roleta do połowy
function okno(Kk, u0, v0, u1, v1, styl, slemie) {
  const f = 0.085;
  // cień pod parapetem + delikatne ościeże (0.13 czytało się z bliska jak brudna obwódka)
  Kk.pr(u0 - 0.13, v0 - 0.2, u1 + 0.13, v0 - 0.06, 'rgba(70,55,40,0.12)', undefined, 0.04);
  Kk.pr(u0 - 0.04, v0 - 0.02, u1 + 0.05, v1 + 0.05, 'rgba(70,55,40,0.06)', undefined, 0.05);
  Kk.pr(u0, v0, u1, v1, RAMA, false, 0.05);
  const a0 = u0 + f, b0 = v0 + f, a1 = u1 - f, b1 = v1 - f, wy = b1 - b0;
  szyba(Kk, a0, b0, a1, b1, styl === 1);
  if (styl === 2) zaslony(Kk, a0, b0, a1, b1, '#eba3b3');
  if (styl === 3) zaslony(Kk, a0, b0, a1, b1, '#ecc56c');
  if (styl === 4) zaslony(Kk, a0, b0, a1, b1, '#a0d5c0');
  if (styl === 5) {
    Kk.pr(a0, b1 - wy * 0.52, a1, b1, '#efe5cf', false);
    for (let i = 1; i < 6; i++) Kk.pr(a0, b1 - wy * 0.52 * i / 6 - 0.01, a1, b1 - wy * 0.52 * i / 6, 'rgba(120,100,70,0.12)');
    Kk.pr(a0, b1 - wy * 0.52 - 0.045, a1, b1 - wy * 0.52, '#d3c5a6', false);
  }
  if (styl !== 1) firanka(Kk, a0, b0, a1, b1, styl === 5 ? 0.14 : 0.36);
  if (styl === 4) doniczka(Kk, a0, b0, a1);
  refleks(Kk, a0, b0, a1, b1, styl === 1 ? 0.42 : 0.22);
  const um = (a0 + a1) / 2;
  Kk.pr(um - 0.035, b0, um + 0.035, b1, RAMA, false);                      // słupek
  if (slemie) Kk.pr(a0, b1 - wy * 0.3, a1, b1 - wy * 0.3 + 0.06, RAMA, false);
  Kk.pr(a0, b1 - 0.05, a1, b1, 'rgba(20,35,60,0.22)');                      // cień nadproża na szybie
  Kk.pr(u0 - 0.09, v0 - 0.075, u1 + 0.09, v0 + 0.02, PARAPET, false, 0.02);
  Kk.pr(u0 - 0.09, v0 - 0.075, u1 + 0.09, v0 - 0.05, 'rgba(0,0,0,0.13)');
}
function drzwiBalkonowe(Kk, u0, v0, u1, v1, styl) {
  const f = 0.085;
  Kk.pr(u0 - 0.04, v0, u1 + 0.05, v1 + 0.05, 'rgba(70,55,40,0.06)', undefined, 0.05);
  Kk.pr(u0, v0, u1, v1, RAMA, false, 0.04);
  const a0 = u0 + f, a1 = u1 - f, b0 = v0 + 0.95, b1 = v1 - f;
  Kk.pr(a0, v0 + f, a1, b0 - 0.05, '#ece6da', false, 0.02);                  // dolna płycina
  szyba(Kk, a0, b0, a1, b1, styl === 1);
  if (styl !== 1) firanka(Kk, a0, b0, a1, b1, 0.4);
  refleks(Kk, a0, b0, a1, b1, 0.25);
  Kk.pr(a0, b1 - 0.05, a1, b1, 'rgba(20,35,60,0.22)');
}
function mozaika(Kk, u0, v0, u1, v1, wariant = 0) {
  const pal = wariant ? ['#6fb5a3', '#f3ead6', '#7aa3d6', '#eec35a', '#e08a5f'] : ['#e08a5f', '#eec35a', '#6fb5a3', '#f3ead6', '#7aa3d6'];
  const t = 0.105, nx = Math.max(1, Math.round((u1 - u0) / t)), ny = Math.max(1, Math.round((v1 - v0) / t));
  const tw = (u1 - u0) / nx, th = (v1 - v0) / ny;
  Kk.pr(u0 - 0.035, v0 - 0.035, u1 + 0.035, v1 + 0.035, '#e6dfd1', false, 0.02);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const idx = Math.floor((j + Math.round(Math.abs(i - (nx - 1) / 2) * 2)) / 2) % pal.length;
    Kk.pr(u0 + i * tw + 0.009, v0 + j * th + 0.009, u0 + (i + 1) * tw - 0.009, v0 + (j + 1) * th - 0.009, pal[idx], false);
  }
}
const DRZWI_KOLORY = { [K.DRZWI1]: ['#b98150', '#8a5a34'], [K.DRZWI2]: ['#5ea29a', '#437a73'], [K.DRZWI3]: ['#d0735c', '#9f513d'] };
function wejscie(Kk, id) {
  const [kd, kr] = DRZWI_KOLORY[id];
  scianaPanel(Kk, 0);
  Kk.pr(0, 0, Kk.W, 0.8, '#d8d0c3', false);                                   // cokół (bez barwienia)
  Kk.pr(0, 0.77, Kk.W, 0.8, 'rgba(0,0,0,0.12)');
  Kk.pr(0.52, 0.28, 2.18, 3.0, '#ede6da', false, 0.05);                       // jasny portal
  mozaika(Kk, 0.11, 0.98, 0.43, 2.92, id === K.DRZWI2 ? 1 : 0);
  mozaika(Kk, 2.27, 0.98, 2.59, 2.92, id === K.DRZWI2 ? 1 : 0);
  Kk.pr(0.66, 0.3, 2.04, 2.44, kr, false, 0.03);
  for (const [a, b] of [[0.72, 1.33], [1.37, 1.98]]) {
    Kk.pr(a, 0.34, b, 2.38, kd, false, 0.02);
    szyba(Kk, a + 0.08, 1.1, b - 0.08, 2.28, false, 0.02);
    Kk.pr(a + 0.08, 1.66, b - 0.08, 1.71, kd, false);
    refleks(Kk, a + 0.08, 1.1, b - 0.08, 2.28, 0.2);
    Kk.pr(a + 0.08, 0.44, b - 0.08, 0.98, 'rgba(0,0,0,0.1)');                 // płycina
  }
  Kk.pr(1.24, 1.0, 1.29, 1.5, '#e9e4d8', false); Kk.pr(1.41, 1.0, 1.46, 1.5, '#e9e4d8', false);   // pochwyty
  Kk.pr(0.66, 2.5, 2.04, 2.9, RAMA, false, 0.02);                             // świetlik
  szyba(Kk, 0.72, 2.55, 1.98, 2.85, true, 0.01);
  Kk.pr(1.33, 2.55, 1.37, 2.85, RAMA, false);
  Kk.pr(0.55, 0.28, 2.15, 0.34, 'rgba(0,0,0,0.12)');
}
function luksfery(Kk) {
  scianaPanel(Kk, 0);
  Kk.pr(0.72, 0.46, 1.98, 2.62, 'rgba(70,55,40,0.12)', undefined, 0.05);
  Kk.pr(0.76, 0.5, 1.94, 2.58, '#ebe5da', false, 0.04);
  const u0 = 0.83, v0 = 0.57, u1 = 1.87, v1 = 2.51, nx = 5, ny = 9;
  Kk.pr(u0, v0, u1, v1, '#9fb4b8', false);
  const bw = (u1 - u0) / nx, bh = (v1 - v0) / ny;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const a = u0 + i * bw + 0.018, b = v0 + j * bh + 0.018, c = a + bw - 0.036, d = b + bh - 0.036;
    Kk.pr(a, b, c, d, (i + j) % 3 ? '#d4e8ec' : '#c6dfe6', false, 0.02);
    Kk.pr(a + 0.04, b + 0.04, c - 0.04, d - 0.04, 'rgba(255,255,255,0.45)', undefined, 0.02);
  }
  refleks(Kk, u0, v0, u1, v1, 0.18);
}
function balustrada(Kk, gora = 1.2, plyta = true) {
  const W = Kk.W;
  for (let u = 0.1; u < W; u += 0.2) Kk.pr(u, 0.15, u + 0.04, gora - 0.12, 'rgba(60,48,36,0.07)');
  Kk.pr(0, 0.15, W, 0.3, 'rgba(60,48,36,0.08)');
  if (plyta) { Kk.pr(0, 0, W, 0.15, '#d8d1c5', false); Kk.pr(0, 0.12, W, 0.15, 'rgba(0,0,0,0.13)'); }
  Kk.pr(0, gora - 0.13, W, gora - 0.07, 'rgba(60,48,36,0.15)');
  Kk.pr(0, gora - 0.08, W, gora, '#f3efe6', false);
}
function mural(Kk, wariant) {
  const { W, H } = Kk;                              // W = 1, H = 1.15
  Kk.tlo('#fbf9f5', true);
  if (wariant === 0) {                              // słońce nad pagórkami
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU, r0 = 0.25, r1 = 0.33 + (i % 2) * 0.04;
      Kk.wiel([[0.62 + Math.cos(a - 0.09) * r0, 0.82 + Math.sin(a - 0.09) * r0], [0.62 + Math.cos(a) * r1, 0.82 + Math.sin(a) * r1],
               [0.62 + Math.cos(a + 0.09) * r0, 0.82 + Math.sin(a + 0.09) * r0]], '#f2b863', false);
    }
    Kk.kolo(0.62, 0.82, 0.22, '#f2b05c', false); Kk.kolo(0.6, 0.84, 0.16, '#f6cd7c', false);
    Kk.elipsa(0.24, 0.9, 0.16, 0.06, '#fbf6ea', false); Kk.elipsa(0.33, 0.93, 0.1, 0.06, '#fbf6ea', false);
    Kk.elipsa(0.2, 0.25, 0.62, 0.34, '#9ccf73', false);
    Kk.elipsa(0.85, 0.2, 0.55, 0.3, '#7dbb63', false);
    Kk.elipsa(0.4, -0.02, 0.8, 0.26, '#62a458', false);
    for (const [u, v] of [[0.2, 0.62], [0.32, 0.7]]) {
      Kk.sciezka(c => { c.moveTo(Kk.X(u - 0.06), Kk.Y(v + 0.02)); c.quadraticCurveTo(Kk.X(u - 0.02), Kk.Y(v + 0.035), Kk.X(u), Kk.Y(v));
        c.quadraticCurveTo(Kk.X(u + 0.02), Kk.Y(v + 0.035), Kk.X(u + 0.06), Kk.Y(v + 0.02)); c.quadraticCurveTo(Kk.X(u), Kk.Y(v + 0.012), Kk.X(u - 0.06), Kk.Y(v + 0.02)); },
      '#5b6a74', false);
    }
  } else if (wariant === 1) {                       // tęcza jak z supergrafiki lat 70.
    const kol = ['#ea8f7a', '#f2b066', '#f3d479', '#8fcfb2', '#87acd9'];
    kol.forEach((k, i) => Kk.kolo(0.5, 0.12, 0.47 - i * 0.075, k, false));
    Kk.kolo(0.5, 0.12, 0.47 - 5 * 0.075, '#fbf9f5', true);
    Kk.pr(0, 0, W, 0.12, '#fbf9f5', true);
    Kk.pr(0.04, 0.02, 0.96, 0.1, '#e0a36e', false, 0.03);
    Kk.kolo(0.16, 0.95, 0.07, '#ea8f7a', false); Kk.kolo(0.84, 0.98, 0.09, '#87acd9', false);
    Kk.kolo(0.72, 0.8, 0.045, '#f3d479', false); Kk.kolo(0.26, 0.78, 0.035, '#8fcfb2', false);
  } else {                                          // wielki kwiat
    Kk.pr(0.47, 0.05, 0.53, 0.62, '#6fa85a', false, 0.03);
    Kk.elipsa(0.34, 0.3, 0.16, 0.06, '#7fbb63', false, 0.5); Kk.elipsa(0.66, 0.42, 0.16, 0.06, '#7fbb63', false, -0.5);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      Kk.elipsa(0.5 + Math.cos(a) * 0.17, 0.75 + Math.sin(a) * 0.17, 0.12, 0.12, i % 2 ? '#ef9aa8' : '#f3b0bb', false);
    }
    Kk.kolo(0.5, 0.75, 0.1, '#f5cf6a', false); Kk.kolo(0.48, 0.77, 0.05, '#f8df95', false);
    Kk.pr(0.08, 0.02, 0.92, 0.07, '#9ccf73', false, 0.03);
  }
}

function rysujAtlas() {
  const g = nowyKontekst(ATLAS), m = nowyKontekst(ATLAS);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, ATLAS, ATLAS);
  m.fillStyle = '#ffffff'; m.fillRect(0, 0, ATLAS, ATLAS);
  const R = prng(20260930);
  const kom = (id, W, H, fn) => {
    const Kk = komorka(g, m, R, id % NK, Math.floor(id / NK), 1, 1, W, H);
    Kk.start(); fn(Kk); Kk.stop();
  };
  kom(K.BIALY, 1, 1, Kk => Kk.tlo('#ffffff', true));
  kom(K.BETON, 2, 2, Kk => {
    Kk.tlo('#f7f5f1', true);
    for (let i = 0; i < 140; i++) Kk.kolo(R() * 2, R() * 2, 0.008 + R() * 0.012, R() < 0.6 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.5)');
  });
  kom(K.PANEL, 2.7, 2.8, Kk => scianaPanel(Kk, 0));
  const cokol = (Kk, okienko) => {
    Kk.tlo('#f4f1ec', true);
    for (let i = 0; i < 60; i++) Kk.kolo(R() * 2.7, R() * 0.8, 0.01, 'rgba(0,0,0,0.06)');
    Kk.pr(0, 0.39, 2.7, 0.415, 'rgba(70,60,50,0.13)');
    Kk.pr(0.06, 0, 0.1, 0.8, 'rgba(70,60,50,0.2)');
    Kk.pr(0, 0.74, 2.7, 0.8, 'rgba(255,255,255,0.35)');
    if (okienko) {
      Kk.pr(0.93, 0.18, 1.77, 0.6, 'rgba(0,0,0,0.12)', undefined, 0.03);
      Kk.pr(0.95, 0.2, 1.75, 0.58, '#e3ddd2', false, 0.03);
      Kk.pr(1.0, 0.25, 1.7, 0.53, Kk.grad(0, 0.53, 0, 0.25, [[0, '#71879a'], [1, '#4b5d6c']]), false);
      for (const u of [1.17, 1.35, 1.53]) Kk.pr(u, 0.25, u + 0.025, 0.53, '#3f4750', false);
    }
  };
  kom(K.COKOL, 2.7, 0.8, Kk => cokol(Kk, false));
  kom(K.COKOL_OKNO, 2.7, 0.8, Kk => cokol(Kk, true));
  const fala = (Kk, u0, v0, u1, v1, p, ciemny) => {
    for (let u = u0; u < u1 - 0.001; u += p)
      Kk.pr(u, v0, Math.min(u1, u + p), v1, Kk.grad(u, 0, u + p, 0, [[0, '#ffffff'], [0.45, '#f1f1f1'], [1, ciemny]]));
  };
  kom(K.BLACHA, 3, 2.6, Kk => { Kk.tlo('#ffffff', true); fala(Kk, 0, 0, 3, 2.6, 0.22, '#d2d2d2'); Kk.pr(0, 0, 3, 0.08, 'rgba(0,0,0,0.15)'); });
  const garaz = (Kk, rdza) => {
    Kk.tlo('#e8e8e8', true);
    fala(Kk, 0.16, 0, 2.84, 2.3, 0.2, '#d6d6d6');
    Kk.pr(0.12, 0, 0.16, 2.34, 'rgba(0,0,0,0.32)'); Kk.pr(2.84, 0, 2.88, 2.34, 'rgba(0,0,0,0.32)');
    Kk.pr(0.12, 2.3, 2.88, 2.34, 'rgba(0,0,0,0.32)');
    Kk.pr(0.16, 1.14, 2.84, 1.18, 'rgba(0,0,0,0.1)');
    Kk.pr(0.16, 0, 2.84, 0.09, 'rgba(0,0,0,0.2)');
    Kk.pr(1.28, 1.0, 1.72, 1.07, '#52575d', false, 0.02);
    Kk.kolo(1.5, 0.9, 0.035, '#52575d', false);
    Kk.pr(0, 2.44, 3, 2.6, 'rgba(0,0,0,0.12)');
    if (rdza) {
      const plama = (u, v, r) => {
        Kk.promien(u, v, r, [[0, 'rgba(164,98,56,0.8)'], [0.6, 'rgba(170,108,62,0.45)'], [1, 'rgba(170,108,62,0)']]);
        Kk.promien(u, v, r, [[0, 'rgba(0,0,0,0.9)'], [0.6, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']], true);
      };
      plama(0.5, 0.1, 0.42); plama(2.45, 0.05, 0.5); plama(1.7, 0.2, 0.25); plama(2.75, 1.6, 0.22); plama(0.3, 2.2, 0.2);
      for (const u of [0.7, 1.1, 2.2, 2.6]) Kk.pr(u, 1.3 + R() * 0.6, u + 0.03, 2.3, 'rgba(160,95,55,0.3)');
    }
  };
  kom(K.GARAZ, 3, 2.6, Kk => garaz(Kk, false));
  kom(K.GARAZ_RDZA, 3, 2.6, Kk => garaz(Kk, true));
  kom(K.DREWNO, 2, 0.5, Kk => {
    Kk.tlo('#f7efe4', true);
    for (let i = 0; i < 9; i++) {
      const v = 0.04 + R() * 0.42, a = R() * 2;
      Kk.pr(a, v, Math.min(2, a + 0.4 + R() * 1.2), v + 0.012, 'rgba(110,70,35,0.16)');
    }
    Kk.elipsa(0.4 + R() * 1.2, 0.25, 0.05, 0.03, 'rgba(110,70,35,0.25)');
    Kk.pr(0, 0, 2, 0.035, 'rgba(0,0,0,0.12)'); Kk.pr(0, 0.465, 2, 0.5, 'rgba(255,255,255,0.35)');
  });
  // moduły płyty z oknem
  for (let s = 0; s < STYLE_OKIEN; s++) {
    kom(K.A + s, 2.7, 2.8, Kk => { scianaPanel(Kk, 0.8); okno(Kk, 0.55, 0.86, 2.15, 2.36, s, true); });
    kom(K.B + s, 2.7, 2.8, Kk => { scianaPanel(Kk, 1.1); okno(Kk, 0.75, 1.16, 1.95, 2.3, s, false); });
    kom(K.C + s, 2.7, 2.8, Kk => {
      scianaPanel(Kk, 0);
      drzwiBalkonowe(Kk, 0.34, 0.1, 1.1, 2.36, s);
      okno(Kk, 1.3, 0.86, 2.36, 2.36, s, false);
    });
  }
  for (const id of [K.DRZWI1, K.DRZWI2, K.DRZWI3]) kom(id, 2.7, 3.6, Kk => wejscie(Kk, id));
  kom(K.LUKSFERY, 2.7, 2.8, Kk => luksfery(Kk));
  kom(K.KLATKA_OKNO, 2.7, 2.8, Kk => {
    scianaPanel(Kk, 0);
    okno(Kk, 0.95, 0.5, 1.75, 2.5, 0, false);
    Kk.pr(1.03, 1.15, 1.67, 1.2, RAMA, false); Kk.pr(1.03, 1.85, 1.67, 1.9, RAMA, false);
  });
  kom(K.BALUSTRADA, 2.35, 1.2, Kk => { Kk.tlo('#fbfaf6', true); balustrada(Kk); });
  kom(K.BALKON_SZYBY, 2.35, 2.75, Kk => {
    Kk.tlo('#fbfaf6', true);
    balustrada(Kk, 1.1);
    Kk.pr(0, 1.1, 2.35, 2.75, '#ecebe6', false);
    const n = 3, w = (2.35 - 0.1) / n;
    for (let i = 0; i < n; i++) {
      const a = 0.05 + i * w + 0.04, b = a + w - 0.08;
      szyba(Kk, a, 1.16, b, 2.68, i !== 1);
      if (i === 2) zaslony(Kk, a, 1.16, b, 2.68, '#eba3b3');
      else firanka(Kk, a, 1.16, b, 2.68, 0.3);
      refleks(Kk, a, 1.16, b, 2.68, 0.3);
    }
    Kk.pr(0, 2.7, 2.35, 2.75, 'rgba(0,0,0,0.15)');
  });
  kom(K.KONTENER, 1.4, 1.25, Kk => {
    Kk.tlo('#f7f7f5', true);
    Kk.pr(0, 0, 1.4, 0.1, 'rgba(0,0,0,0.22)');
    for (const v of [0.22, 0.92]) { Kk.pr(0, v, 1.4, v + 0.05, 'rgba(255,255,255,0.45)'); Kk.pr(0, v - 0.03, 1.4, v, 'rgba(0,0,0,0.1)'); }
    Kk.pr(0.3, 0.42, 1.1, 0.74, 'rgba(255,255,255,0.35)', undefined, 0.06);
    Kk.pr(0.45, 1.03, 0.95, 1.09, '#4b5157', false, 0.02);
    Kk.pr(0, 1.14, 1.4, 1.25, 'rgba(0,0,0,0.14)');
  });
  // szyby kabiny: dolne ~20% komórki siedzi w karoserii (zanurzenie kabiny), stąd szkło od 0,2
  kom(K.AUTO_SZYBA, 1.6, 0.75, Kk => {
    Kk.tlo('#ffffff', true);
    Kk.pr(0.1, 0.19, 1.5, 0.66, Kk.grad(0, 0.66, 0, 0.19, [[0, '#d6ecf6'], [0.55, '#9fc3dc'], [1, '#6f97b8']]), false, 0.08);
    refleks(Kk, 0.1, 0.19, 1.5, 0.66, 0.35);
  });
  kom(K.AUTO_BOK_SZYBY, 2.2, 0.75, Kk => {
    Kk.tlo('#ffffff', true);
    for (const [a, b] of [[0.14, 1.03], [1.17, 2.06]]) {
      Kk.pr(a, 0.22, b, 0.64, Kk.grad(0, 0.64, 0, 0.22, [[0, '#d2e9f5'], [1, '#7ea4c2']]), false, 0.07);
      refleks(Kk, a, 0.22, b, 0.64, 0.3);
    }
  });
  kom(K.AUTO_BOK, 4, 0.55, Kk => {
    Kk.tlo('#ffffff', true);
    Kk.pr(0, 0, 4, 0.06, 'rgba(0,0,0,0.14)');
    Kk.pr(0.02, 0.3, 3.98, 0.335, '#f3f2ec', false);
    for (const u of [1.5, 2.52]) Kk.pr(u, 0.06, u + 0.028, 0.53, 'rgba(0,0,0,0.2)');
    Kk.pr(2.3, 0.4, 2.46, 0.44, '#ecebe4', false, 0.01);
    for (const u of [0.8, 3.2]) { Kk.kolo(u, 0, 0.47, 'rgba(0,0,0,0.12)'); Kk.kolo(u, 0, 0.43, '#2e3137', false); }
  });
  kom(K.AUTO_PRZOD, 1.9, 0.55, Kk => {
    Kk.tlo('#ffffff', true);
    Kk.pr(0.66, 0.12, 1.24, 0.38, '#4d535b', false, 0.05);
    for (const v of [0.19, 0.25, 0.31]) Kk.pr(0.7, v, 1.2, v + 0.02, '#7b828b', false);
    for (const u of [0.34, 1.56]) {
      Kk.kolo(u, 0.3, 0.155, '#eceeee', false); Kk.kolo(u, 0.3, 0.12, '#fff0c2', false); Kk.kolo(u - 0.02, 0.32, 0.06, '#fffbea', false);
      Kk.pr(u - 0.08, 0.06, u + 0.08, 0.11, '#f2a54a', false, 0.02);
    }
  });
  kom(K.AUTO_TYL, 1.9, 0.55, Kk => {
    Kk.tlo('#ffffff', true);
    for (const [a, b] of [[0.08, 0.46], [1.44, 1.82]]) {
      Kk.pr(a, 0.22, b, 0.42, '#dd5f58', false, 0.05); Kk.pr(a + 0.03, 0.33, b - 0.03, 0.4, '#f08c80', false, 0.03);
    }
    Kk.pr(0.7, 0.08, 1.2, 0.3, 'rgba(0,0,0,0.25)', false, 0.03);
    Kk.pr(0.715, 0.095, 1.185, 0.285, '#f5f4ee', false, 0.02);
  });
  kom(K.PIASEK, 2, 2, Kk => {
    Kk.tlo('#edd5a0', false);
    for (let i = 0; i < 26; i++) Kk.kolo(R() * 2, R() * 2, 0.08 + R() * 0.2, R() < 0.5 ? 'rgba(255,245,215,0.35)' : 'rgba(190,150,90,0.14)');
    for (let i = 0; i < 90; i++) Kk.kolo(R() * 2, R() * 2, 0.012, R() < 0.5 ? 'rgba(150,110,60,0.35)' : 'rgba(255,255,255,0.6)');
  });
  kom(K.ASFALT, 3, 3, Kk => {
    Kk.tlo('#f3f3f3', true);
    for (let i = 0; i < 10; i++) Kk.kolo(R() * 3, R() * 3, 0.3 + R() * 0.5, 'rgba(0,0,0,0.025)');
    for (let i = 0; i < 260; i++) Kk.kolo(R() * 3, R() * 3, 0.01 + R() * 0.012, R() < 0.55 ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.45)');
  });
  kom(K.CHODNIK, 2, 2, Kk => {
    Kk.tlo('#fdfcf9', true);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      Kk.pr(i + 0.03, j + 0.03, i + 0.97, j + 0.97, `rgba(90,75,60,${0.02 + R() * 0.05})`, undefined, 0.04);
      Kk.pr(i + 0.03, j + 0.93, i + 0.97, j + 0.97, 'rgba(255,255,255,0.4)');
    }
    for (const t of [0, 1, 2]) { Kk.pr(t - 0.025, 0, t + 0.025, 2, 'rgba(80,68,55,0.3)'); Kk.pr(0, t - 0.025, 2, t + 0.025, 'rgba(80,68,55,0.3)'); }
  });
  kom(K.DACH, 4, 4, Kk => {
    Kk.tlo('#f6f6f4', true);
    for (let i = 0; i < 5; i++) Kk.kolo(0.4 + R() * 3.2, 0.4 + R() * 3.2, 0.4 + R() * 0.6, 'rgba(60,50,40,0.05)');
    for (let v = 0.45; v < 4; v += 0.9) { Kk.pr(0, v, 4, v + 0.035, 'rgba(0,0,0,0.1)'); Kk.pr(0, v + 0.035, 4, v + 0.06, 'rgba(255,255,255,0.25)'); }
    Kk.pr(0, 0, 0.05, 4, 'rgba(0,0,0,0.08)');
  });
  kom(K.OPONA, 1, 1, Kk => {
    Kk.tlo('#35383e', false);
    Kk.kolo(0.5, 0.5, 0.36, '#c9ced3', false); Kk.kolo(0.5, 0.5, 0.3, '#e6e9ec', false);
    Kk.kolo(0.5, 0.5, 0.12, '#b3b9bf', false);
    for (let i = 0; i < 4; i++) Kk.kolo(0.5 + Math.cos(i * TAU / 4) * 0.2, 0.5 + Math.sin(i * TAU / 4) * 0.2, 0.035, '#9aa1a8', false);
  });
  kom(K.LAMPA, 1, 1, Kk => {
    Kk.tlo('#f8e6a6', false);
    Kk.promien(0.5, 0.5, 0.62, [[0, '#fffef6'], [0.55, '#fff4cc'], [1, '#f8e6a6']]);
  });
  kom(K.KWIATY, 1, 1, Kk => {
    Kk.tlo('#6aa95a', false);
    for (let i = 0; i < 12; i++) Kk.kolo(R(), R(), 0.08 + R() * 0.08, R() < 0.5 ? '#5b9a4d' : '#7cbb62', false);
    const kw = ['#ef6b7c', '#f6a3ba', '#f5d56a', '#ffffff', '#f08a5d'];
    for (let i = 0; i < 16; i++) Kk.kolo(0.08 + R() * 0.84, 0.08 + R() * 0.84, 0.045 + R() * 0.03, kw[i % kw.length], false);
  });
  kom(K.WIATA, 2, 2, Kk => {
    Kk.tlo('#39443f', false);
    for (let u = 0; u < 2; u += 0.2) {
      Kk.pr(u + 0.025, 0, u + 0.175, 2, '#f7f4ee', true);
      Kk.pr(u + 0.14, 0, u + 0.175, 2, 'rgba(0,0,0,0.12)');
      Kk.pr(u + 0.025, 1.93, u + 0.175, 2, 'rgba(255,255,255,0.4)');
    }
  });
  // murale na szczytach (obszary 2×2 komórki)
  MURALE.forEach(([kx, ky], i) => {
    const Kk = komorka(g, m, R, kx, ky, 2, 2, 1, 1.15);
    Kk.start(); mural(Kk, i); Kk.stop();
  });

  // RGB z jednego płótna + maska z drugiego → RGBA (bez przemnażania alfy, którego canvas nie
  // cofnie); wiersze odwrócone, bo DataTexture ma flipY = false (wiersz 0 = v 0 = dół)
  const a = g.getImageData(0, 0, ATLAS, ATLAS).data, b = m.getImageData(0, 0, ATLAS, ATLAS).data;
  const out = new Uint8Array(ATLAS * ATLAS * 4), rz = ATLAS * 4;
  for (let y = 0; y < ATLAS; y++) {
    const s = y * rz, d = (ATLAS - 1 - y) * rz;
    for (let x = 0; x < rz; x += 4) {
      out[d + x] = a[s + x]; out[d + x + 1] = a[s + x + 1]; out[d + x + 2] = a[s + x + 2]; out[d + x + 3] = b[s + x];
    }
  }
  return out;
}

// ============================== MATERIAŁ ==============================
const _cache = new WeakMap();
export function atlasOsiedla(THREE) {
  let c = _cache.get(THREE);
  if (!c) { c = {}; _cache.set(THREE, c); }
  if (!c.tex) {
    const tex = new THREE.DataTexture(rysujAtlas(), ATLAS, ATLAS, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    c.tex = tex;
  }
  return c.tex;
}
// opcje (liczone przy PIERWSZYM wywołaniu, potem zwracany jest ten sam materiał):
//   pasma: [cień, +półton, +światło] (jak naturaMat), progi: [4 progi rawNL],
//   tonCienia: [r,g,b] mnożnik słońca w cieniu | false (zwykły cień three)
export function materialOsiedla(THREE, opcje = {}) {
  let c = _cache.get(THREE);
  if (!c) { c = {}; _cache.set(THREE, c); }
  if (c.mat && !opcje.nowy) return c.mat;         // 30.09: `nowy: true` = osobny egzemplarz (main.js owija 2 kopie: pełna + przycinana)
  // Progi jasnego pasma niżej niż w naturaMat (0.32/0.60): słońce stoi wysoko (~52°), więc
  // ściana od +Z ma rawNL ≈ 0.34 i przy progach głazów łapała tylko skraj światła — elewacje
  // od strony słońca wychodziły szarawe. Z 0.18/0.45 obie „słoneczne" ściany są w pełnym świetle,
  // a dach i tak zostaje najjaśniejszy.
  const pas = opcje.pasma || [0.74, 0.34, 0.30], progi = opcje.progi || [-0.20, 0.06, 0.18, 0.45];
  // TON CIENIA (toon): cień z shadow mapy nie zeruje słońca, tylko sprowadza je do pasma cienia
  // (pas[0]) z chłodnym odcieniem. Bez tego ściana odwrócona od słońca (zawsze w cieniu własnej
  // bryły) dostawała samą hemisferę z ciemnozielonym dołem i wielkie elewacje wychodziły
  // szaroburymi płaszczyznami. Cień własny i rzucony mają teraz jeden ton, jak w BotW/Genshinie.
  // `tonCienia: false` = zwykłe zachowanie three (jak głazy w main.js).
  const ton = opcje.tonCienia === false ? null : (opcje.tonCienia || [0.84, 0.9, 1.06]);
  const mat = new THREE.MeshLambertMaterial({ map: atlasOsiedla(THREE), vertexColors: true });
  const f = v => v.toFixed(3);
  mat.onBeforeCompile = sh => {
    // pasma toon (jak addWrapLight w main.js; chunk rozwijany ręcznie, bo #include nie są
    // jeszcze rozwinięte w onBeforeCompile)
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
    if (ton) {
      const lf = THREE.ShaderChunk.lights_fragment_begin.replace(
        'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]',
        '_cienSw = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]');
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', lf);
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_lambert_pars_fragment>', chunk)
      .replace('#include <map_fragment>',
        `float _maska = 1.0;
         #ifdef USE_MAP
           vec4 _tx = texture2D( map, vMapUv );
           diffuseColor.rgb *= _tx.rgb;
           _maska = _tx.a;
         #endif`)
      .replace('#include <color_fragment>',
        `#ifdef USE_COLOR
           float _jas = max( vColor.r, max( vColor.g, vColor.b ) );
           diffuseColor.rgb *= mix( vec3( _jas ), vColor.rgb, _maska );
         #endif
         diffuseColor.a = 1.0;`);
  };
  mat.customProgramCacheKey = function () { return 'osiedle-rekwizyty-v2|' + this.onBeforeCompile.toString(); };
  mat.needsUpdate = true;
  if (!opcje.nowy) c.mat = mat;
  return mat;
}

// ============================== BUDOWNICZY GEOMETRII (bez indeksu) ==============================
// Rosnące Float32Array zamiast push do tablic JS (profil: push + konwersja = 42% czasu bloku),
// bryła brzegowa liczona w locie (computeBoundingBox po fakcie = kolejne 12%).
class Bud {
  constructor(poj = 2048) {
    this.poj = poj; this.nv = 0;
    this.P = new Float32Array(poj * 3); this.N = new Float32Array(poj * 3);
    this.U = new Float32Array(poj * 2); this.C = new Float32Array(poj * 3);
    this.bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    this.ustaw();
  }
  ustaw(ox = 0, oy = 0, oz = 0, kat = 0) { this.ox = ox; this.oy = oy; this.oz = oz; this.kc = Math.cos(kat); this.ks = Math.sin(kat); return this; }
  get n() { return this.nv; }
  _rosnij() {
    const p = this.poj * 2, kop = (a, k) => { const b = new Float32Array(p * k); b.set(a); return b; };
    this.P = kop(this.P, 3); this.N = kop(this.N, 3); this.U = kop(this.U, 2); this.C = kop(this.C, 3); this.poj = p;
  }
  v(x, y, z, nx, ny, nz, u, w, c) {
    if (this.nv === this.poj) this._rosnij();
    const kc = this.kc, ks = this.ks, i = this.nv++, i3 = i * 3, P = this.P, N = this.N, bb = this.bb;
    const px = this.ox + x * kc + z * ks, py = this.oy + y, pz = this.oz - x * ks + z * kc;
    P[i3] = px; P[i3 + 1] = py; P[i3 + 2] = pz;
    N[i3] = nx * kc + nz * ks; N[i3 + 1] = ny; N[i3 + 2] = -nx * ks + nz * kc;
    this.U[i * 2] = u; this.U[i * 2 + 1] = w;
    this.C[i3] = c[0]; this.C[i3 + 1] = c[1]; this.C[i3 + 2] = c[2];
    if (px < bb[0]) bb[0] = px; if (py < bb[1]) bb[1] = py; if (pz < bb[2]) bb[2] = pz;
    if (px > bb[3]) bb[3] = px; if (py > bb[4]) bb[4] = py; if (pz > bb[5]) bb[5] = pz;
  }
  // a–b–c–d przeciwnie do wskazówek patrząc od frontu (a = lewy dół); uv = [u0,v0,u1,v1];
  // k = kolor albo [ka,kb,kc,kd]
  quad(a, b, c, d, uv, k, nrm) {
    let nx, ny, nz;
    if (nrm) { nx = nrm[0]; ny = nrm[1]; nz = nrm[2]; } else {
      const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = d[0] - a[0], e2y = d[1] - a[1], e2z = d[2] - a[2];
      nx = e1y * e2z - e1z * e2y; ny = e1z * e2x - e1x * e2z; nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    }
    const k4 = Array.isArray(k[0]);
    const ka = k4 ? k[0] : k, kb = k4 ? k[1] : k, kc = k4 ? k[2] : k, kd = k4 ? k[3] : k;
    const u0 = uv[0], v0 = uv[1], u1 = uv[2], v1 = uv[3];
    this.v(a[0], a[1], a[2], nx, ny, nz, u0, v0, ka); this.v(b[0], b[1], b[2], nx, ny, nz, u1, v0, kb); this.v(c[0], c[1], c[2], nx, ny, nz, u1, v1, kc);
    this.v(a[0], a[1], a[2], nx, ny, nz, u0, v0, ka); this.v(c[0], c[1], c[2], nx, ny, nz, u1, v1, kc); this.v(d[0], d[1], d[2], nx, ny, nz, u0, v1, kd);
  }
  // trójkąt a–b–c przeciwnie do wskazówek od frontu; uvs = [ua,va, ub,vb, uc,vc]
  tri(a, b, c, uvs, k) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.v(a[0], a[1], a[2], nx, ny, nz, uvs[0], uvs[1], k);
    this.v(b[0], b[1], b[2], nx, ny, nz, uvs[2], uvs[3], k);
    this.v(c[0], c[1], c[2], nx, ny, nz, uvs[4], uvs[5], k);
  }
  // pionowa ściana z (ax,az) do (bx,bz); na zewnątrz = (b−a) × Y; kd/kg = kolor dołu/góry
  sciana(ax, az, bx, bz, y0, y1, uv, kd, kg = kd) {
    this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], uv, [kd, kd, kg, kg]);
  }
  plaska(x0, z0, x1, z1, y, uv, k, gora = true) {
    if (gora) this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], uv, k);
    else this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], uv, k);
  }
  // prostopadłościan; s = { px, nx, py, ny, pz, nz, wsz }: [uv, kolor(, kolorGóry)] albo false
  pud(x0, y0, z0, x1, y1, z1, s) {
    const f = key => (s[key] !== undefined ? s[key] : s.wsz);
    let q;
    if ((q = f('pz'))) this.sciana(x0, z1, x1, z1, y0, y1, q[0], q[1], q[2] || q[1]);
    if ((q = f('nz'))) this.sciana(x1, z0, x0, z0, y0, y1, q[0], q[1], q[2] || q[1]);
    if ((q = f('px'))) this.sciana(x1, z1, x1, z0, y0, y1, q[0], q[1], q[2] || q[1]);
    if ((q = f('nx'))) this.sciana(x0, z0, x0, z1, y0, y1, q[0], q[1], q[2] || q[1]);
    if ((q = f('py'))) this.plaska(x0, z0, x1, z1, y1, q[0], q[2] || q[1], true);
    if ((q = f('ny'))) this.plaska(x0, z0, x1, z1, y0, q[0], q[1], false);
  }
  // rura (walec bez den; kapsle: 1 = początek, 2 = koniec) z gładkimi normalnymi
  rura(ax, ay, az, bx, by, bz, r, seg, uv, kA, kB = kA, kapsle = 0, uvKap = uv) {
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    let rx = 0, ry = 1, rz = 0; if (Math.abs(dy) > 0.9) { rx = 1; ry = 0; }
    let ux = dy * rz - dz * ry, uy = dz * rx - dx * rz, uz = dx * ry - dy * rx;
    const lu = Math.hypot(ux, uy, uz) || 1; ux /= lu; uy /= lu; uz /= lu;
    const wx = dy * uz - dz * uy, wy = dz * ux - dx * uz, wz = dx * uy - dy * ux;
    const u0 = uv[0], v0 = uv[1], du = uv[2] - uv[0], v1 = uv[3];
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const n0x = ux * c0 + wx * s0, n0y = uy * c0 + wy * s0, n0z = uz * c0 + wz * s0;
      const n1x = ux * c1 + wx * s1, n1y = uy * c1 + wy * s1, n1z = uz * c1 + wz * s1;
      const ua = u0 + du * i / seg, ub = u0 + du * (i + 1) / seg;
      this.v(ax + n0x * r, ay + n0y * r, az + n0z * r, n0x, n0y, n0z, ua, v0, kA);
      this.v(ax + n1x * r, ay + n1y * r, az + n1z * r, n1x, n1y, n1z, ub, v0, kA);
      this.v(bx + n1x * r, by + n1y * r, bz + n1z * r, n1x, n1y, n1z, ub, v1, kB);
      this.v(ax + n0x * r, ay + n0y * r, az + n0z * r, n0x, n0y, n0z, ua, v0, kA);
      this.v(bx + n1x * r, by + n1y * r, bz + n1z * r, n1x, n1y, n1z, ub, v1, kB);
      this.v(bx + n0x * r, by + n0y * r, bz + n0z * r, n0x, n0y, n0z, ua, v1, kB);
    }
    if (kapsle & 1) this.dysk(ax, ay, az, -dx, -dy, -dz, r, seg, uvKap, kA);
    if (kapsle & 2) this.dysk(bx, by, bz, dx, dy, dz, r, seg, uvKap, kB);
  }
  // wachlarz (koło) o normalnej n; uv = prostokąt, w który wpisane jest koło
  dysk(cx, cy, cz, nx, ny, nz, r, seg, uv, k) {
    let rx = 0, ry = 1, rz = 0; if (Math.abs(ny) > 0.9) { rx = 1; ry = 0; }
    let ux = ny * rz - nz * ry, uy = nz * rx - nx * rz, uz = nx * ry - ny * rx;
    const lu = Math.hypot(ux, uy, uz) || 1; ux /= lu; uy /= lu; uz /= lu;
    const wx = ny * uz - nz * uy, wy = nz * ux - nx * uz, wz = nx * uy - ny * ux;
    const uc = (uv[0] + uv[2]) / 2, vc = (uv[1] + uv[3]) / 2, ru = (uv[2] - uv[0]) / 2, rv = (uv[3] - uv[1]) / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      this.v(cx, cy, cz, nx, ny, nz, uc, vc, k);
      this.v(cx + (ux * c0 + wx * s0) * r, cy + (uy * c0 + wy * s0) * r, cz + (uz * c0 + wz * s0) * r, nx, ny, nz, uc + ru * c0, vc + rv * s0, k);
      this.v(cx + (ux * c1 + wx * s1) * r, cy + (uy * c1 + wy * s1) * r, cz + (uz * c1 + wz * s1) * r, nx, ny, nz, uc + ru * c1, vc + rv * s1, k);
    }
  }
  // gładkie normalne w zakresie wierzchołków [v0, v1): średnia (ważona polem) normalnych
  // trójkątów o tej samej pozycji — do zaokrąglonych brył aut
  wygladz(v0, v1) {
    const P = this.P, N = this.N, suma = new Map();
    // klucz liczbowy (kwant 1/512 j., zakres ±97 j. — rekwizyt), bo klucze tekstowe w Map
    // były najdroższą częścią budowy auta
    const klucz = i => ((Math.round(P[i * 3] * 512) + 50000) * 100000 + Math.round(P[i * 3 + 1] * 512) + 50000) * 100000 + Math.round(P[i * 3 + 2] * 512) + 50000;
    const kl = new Float64Array(v1 - v0);
    for (let t = v0; t < v1; t += 3) {
      const a = t * 3, b = a + 3, c = a + 6;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
      const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (let k = 0; k < 3; k++) {
        const key = klucz(t + k); kl[t + k - v0] = key;
        const s = suma.get(key);
        if (s) { s[0] += nx; s[1] += ny; s[2] += nz; } else suma.set(key, [nx, ny, nz]);
      }
    }
    for (let i = v0; i < v1; i++) {
      const s = suma.get(kl[i - v0]), l = Math.hypot(s[0], s[1], s[2]) || 1;
      N[i * 3] = s[0] / l; N[i * 3 + 1] = s[1] / l; N[i * 3 + 2] = s[2] / l;
    }
  }
  geo(THREE) {
    const g = new THREE.BufferGeometry(), n = this.nv;
    g.setAttribute('position', new THREE.BufferAttribute(this.P.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N.slice(0, n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.U.slice(0, n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.C.slice(0, n * 3), 3));
    const bb = this.bb;
    if (n) g.boundingBox = new THREE.Box3(new THREE.Vector3(bb[0], bb[1], bb[2]), new THREE.Vector3(bb[3], bb[4], bb[5]));
    else g.computeBoundingBox();
    // boundingSphere zostaje null — three policzy ją leniwie przy pierwszym frustum cullingu
    return g;
  }
}
export function liczTrojkaty(geo) {
  return geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
}

// zaokrąglony prostopadłościan (siatka 3×3 na ścianę, krawędź = 2 segmenty łuku) z opcjonalnym
// zwężeniem ku górze (af/ar = o ile cofa się górna krawędź przodu/tyłu, kw = zwężenie w X).
// uv: {px,nx,py,ny,pz,nz} → prostokąt uv albo false (pomiń ścianę); kol(y) → kolor wierzchołka
function pudZaokr(b, o) {
  const start = b.n;
  const r = Math.min(o.r, o.hx * 0.95, o.hy * 0.95, o.hz * 0.95);
  const ix = o.hx - r, iy = o.hy - r, iz = o.hz - r;
  const kk = ((o.af || 0) + (o.ar || 0)) / (2 * o.hz), ss = ((o.af || 0) - (o.ar || 0)) / 2, kw = o.kw || 0;
  const mapuj = (x, y, z) => {
    const qx = clamp(x, -ix, ix), qy = clamp(y, -iy, iy), qz = clamp(z, -iz, iz);
    const dx = x - qx, dy = y - qy, dz = z - qz, l = Math.hypot(dx, dy, dz) || 1;
    let px = qx + dx / l * r, py = qy + dy / l * r, pz = qz + dz / l * r;
    const t = (py + o.hy) / (2 * o.hy);
    pz = pz * (1 - t * kk) - t * ss;
    px = px * (1 - t * kw);
    return [o.cx + px, o.y0 + o.hy + py, o.cz + pz];
  };
  const sc = [
    ['pz', o.hx, o.hy, (u, v) => [u, v, o.hz]],
    ['nz', o.hx, o.hy, (u, v) => [-u, v, -o.hz]],
    ['px', o.hz, o.hy, (u, v) => [o.hx, v, -u]],
    ['nx', o.hz, o.hy, (u, v) => [-o.hx, v, u]],
    ['py', o.hx, o.hz, (u, v) => [u, o.hy, -v]],
    ['ny', o.hx, o.hz, (u, v) => [u, -o.hy, v]],
  ];
  for (const [klucz, hU, hV, pkt] of sc) {
    const uv = o.uv[klucz];
    if (!uv) continue;
    const rU = Math.min(r, hU * 0.95), rV = Math.min(r, hV * 0.95);
    const gu = [-hU, -hU + rU, hU - rU, hU], gv = [-hV, -hV + rV, hV - rV, hV];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const p00 = mapuj(...pkt(gu[i], gv[j])), p10 = mapuj(...pkt(gu[i + 1], gv[j]));
      const p11 = mapuj(...pkt(gu[i + 1], gv[j + 1])), p01 = mapuj(...pkt(gu[i], gv[j + 1]));
      const s0 = (gu[i] + hU) / (2 * hU), s1 = (gu[i + 1] + hU) / (2 * hU);
      const t0 = (gv[j] + hV) / (2 * hV), t1 = (gv[j + 1] + hV) / (2 * hV);
      const du = uv[2] - uv[0], dv = uv[3] - uv[1];
      b.quad(p00, p10, p11, p01, [uv[0] + s0 * du, uv[1] + t0 * dv, uv[0] + s1 * du, uv[1] + t1 * dv],
        [o.kol(p00[1], klucz), o.kol(p10[1], klucz), o.kol(p11[1], klucz), o.kol(p01[1], klucz)]);
    }
  }
  b.wygladz(start, b.n);
}

// ============================== BLOK Z WIELKIEJ PŁYTY ==============================
// dl × gl (X × Z), pietra = liczba KONDYGNACJI (parter + piętra), piętro 2,8 j. na cokole 0,8 j.,
// attyka 0,7 j. brama: null | { x, szer } — prześwit przez parter na całą głębokość (wzdłuż Z),
// wysoki na cokół + 1 piętro (3,6 j.). Opcje dodatkowe: schemat (0–6 | 'krem', 'mieta', 'blekit',
// 'brzoskwinia', 'maslo', 'lila', 'pistacja'), mural (0 słońce, 1 tęcza, 2 kwiat | false = bez;
// domyślnie z ziarna, ~60% bloków ≥ 3 kondygnacji), opaska (false = bez betonowej opaski wokół).
// Zwraca też: wejscia [{x, z}] (przed drzwiami klatek, lokalnie), wys (z attyką), schemat, cienGeo.
// 30.09 (scalanie z mapą): kolizje balkonów parteru wystawały ~0,95 j. poza obrys dl × gl, a układ mapy
// (lib/teren-osiedle.js, ROZMIAR) liczy na to, że blok mieści się w obrysie — nakładały się na garaże i sąsiednie bloki.
// Opakowanie: jeśli coś wystaje, budujemy korpus płytszy o nadmiar i przesuwamy go tak, żeby całość weszła w obrys.
export function blok(THREE, o = {}) {
  const gl = clamp(liczba(o.gl, 12), 6, 24);
  let r = blokSurowy(THREE, o);
  let zMin = Infinity, zMax = -Infinity;
  for (const k of r.kolizje) { zMin = Math.min(zMin, k.z - k.d / 2); zMax = Math.max(zMax, k.z + k.d / 2); }
  const nad = Math.max(0, -gl / 2 - zMin) + Math.max(0, zMax - gl / 2);
  if (nad < 0.01) return r;
  r = blokSurowy(THREE, { ...o, gl: gl - nad });
  zMin = Infinity; zMax = -Infinity;
  for (const k of r.kolizje) { zMin = Math.min(zMin, k.z - k.d / 2); zMax = Math.max(zMax, k.z + k.d / 2); }
  const dz = -gl / 2 - zMin;                         // dosuń do tylnej krawędzi obrysu
  if (Math.abs(dz) > 1e-4) {
    r.geo.translate(0, 0, dz); if (r.cienGeo) r.cienGeo.translate(0, 0, dz);
    for (const k of r.kolizje) k.z += dz;
    for (const w of r.wejscia) w.z += dz;
  }
  return r;
}
function blokSurowy(THREE, o = {}) {
  const dl = clamp(liczba(o.dl, 40), 6, 120), gl = clamp(liczba(o.gl, 12), 6, 24);   // 30.09: min 10 → 6 (układ stawia bloki 9 j.)
  const pietra = clamp(Math.round(liczba(o.pietra, 5)), 1, 16);
  const R = prng(o.ziarno === undefined ? 1 : o.ziarno);
  const H = 2.8, COK = 0.8, ATT = 0.7, FZ = 0.3;
  const yTop = COK + pietra * H, yAtt = yTop + ATT, hx = dl / 2, hz = gl / 2;
  // schemat: z ziarna albo wprost (`schemat`: indeks 0–6 lub nazwa) — losowanie i tak się
  // odbywa, żeby wymuszenie schematu nie przestawiało reszty bloku
  let S = SCHEMATY[Math.floor(R() * SCHEMATY.length) % SCHEMATY.length];
  if (typeof o.schemat === 'number') S = SCHEMATY[((Math.round(o.schemat) % SCHEMATY.length) + SCHEMATY.length) % SCHEMATY.length];
  else if (typeof o.schemat === 'string') S = SCHEMATY.find(s => s.nm === o.schemat) || S;
  const b = new Bud(Math.max(2048, Math.ceil(dl * pietra * 36)));   // ~wierzchołków bloku, bez realokacji
  const ao = y => 0.8 + 0.2 * sstep(0, 5.5, y);
  const kolY = (baza, y, j = 1) => mnoz(baza, ao(y) * j);

  // --- brama ---
  let g0 = null, g1 = null;
  if (o.brama && liczba(o.brama.szer, 0) > 0.8) {
    g0 = clamp(liczba(o.brama.x, 0) - o.brama.szer / 2, -hx + FZ + 1.2, hx - FZ - 2.2);
    g1 = clamp(liczba(o.brama.x, 0) + o.brama.szer / 2, g0 + 1, hx - FZ - 1.2);
  }
  const yBramy = COK + H;
  // --- kolumny modułów wzdłuż X (brama wymusza granice kolumn) ---
  const odc = g0 === null ? [[-hx + FZ, hx - FZ, false]] : [[-hx + FZ, g0, false], [g0, g1, true], [g1, hx - FZ, false]];
  const kol = [];
  for (const [a, c, br] of odc) {
    const n = Math.max(1, Math.round((c - a) / 2.75));
    for (let i = 0; i < n; i++) kol.push({ x0: a + (c - a) * i / n, x1: a + (c - a) * (i + 1) / n, br });
  }
  const nk = kol.length, cxK = i => (kol[i].x0 + kol[i].x1) / 2;
  // --- klatki schodowe (od +Z) ---
  const ileK = clamp(Math.round(dl / 14), 1, 4);
  const kand = [];
  for (let i = 1; i < nk - 1; i++) if (!kol[i].br && !kol[i - 1].br && !kol[i + 1].br) kand.push(i);
  const klatki = [];
  for (let k = 0; k < ileK; k++) {
    const cel = -hx + dl * (k + 0.5) / ileK;
    let best = -1, bd = 1e9;
    for (const i of kand) {
      if (klatki.some(j => Math.abs(j - i) < 3)) continue;
      const d = Math.abs(cxK(i) - cel);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) klatki.push(best);
  }
  klatki.sort((a, c) => a - c);
  const jestKlatka = i => klatki.includes(i);
  const odlKlatki = i => klatki.reduce((m, j) => Math.min(m, Math.abs(j - i)), 99);
  // --- układ balkonów: front co kilka okien wokół klatek, tył gęściej ---
  const frontBalk = R() < 0.7, tylCo = R() < 0.55 ? 2 : 3, tylOff = Math.floor(R() * tylCo);
  const balkon = (strona, i) => {
    if (i === 0 || i === nk - 1) return false;
    if (strona > 0) return frontBalk && !jestKlatka(i) && odlKlatki(i) === 2;
    return (i % tylCo) === tylOff;
  };
  const drzwiId = wybierz(R, [K.DRZWI1, K.DRZWI2, K.DRZWI3]);
  const klatkaId = R() < 0.6 ? K.LUKSFERY : K.KLATKA_OKNO;
  const styl = () => { const r = R(); return r < 0.3 ? 0 : r < 0.5 ? 1 : r < 0.62 ? 2 : r < 0.74 ? 3 : r < 0.86 ? 4 : 5; };
  const wejscia = [];
  const kolizje = [];
  const BD = 0.95;                                   // głębokość balkonu

  // ---- elewacje frontowa (+Z) i tylna (−Z) ----
  for (const st of [1, -1]) {
    const z = st * hz;
    for (let i = 0; i < nk; i++) {
      const Kc = kol[i];
      const xa = st > 0 ? Kc.x0 : Kc.x1, xb = st > 0 ? Kc.x1 : Kc.x0;
      const klatka = st > 0 && jestKlatka(i);
      const typ = balkon(st, i) ? K.C : (st > 0 && odlKlatki(i) === 1 ? K.B : K.A);
      const pj = () => 0.965 + R() * 0.07;
      if (klatka) {
        b.sciana(xa, z, xb, z, 0, COK + H, uvK(drzwiId), kolY(S.klatka, 0), kolY(S.klatka, COK + H));
        wejscia.push({ x: cxK(i), z: hz + 1.4 });
      } else if (!Kc.br) {
        b.sciana(xa, z, xb, z, 0, COK, uvK(R() < 0.45 ? K.COKOL_OKNO : K.COKOL), kolY(KOL.cokol, 0), kolY(KOL.cokol, COK));
      }
      for (let f = 0; f < pietra; f++) {
        const y0 = COK + f * H, y1 = y0 + H;
        if (Kc.br && f === 0) continue;
        if (klatka && f === 0) continue;
        const j = pj();
        if (klatka) { b.sciana(xa, z, xb, z, y0, y1, uvK(klatkaId), kolY(S.klatka, y0, j), kolY(S.klatka, y1, j)); continue; }
        const baza = f === 0 ? S.parter : S.sciana;
        b.sciana(xa, z, xb, z, y0, y1, uvK(typ + styl()), kolY(baza, y0, j), kolY(baza, y1, j));
      }
    }
    // attyka jednym pasem na stronę
    const ka = mnoz(S.sciana, 0.95);
    if (st > 0) b.sciana(-hx + FZ, z, hx - FZ, z, yTop, yAtt, UV_BIALY, ka);
    else b.sciana(hx - FZ, z, -hx + FZ, z, yTop, yAtt, UV_BIALY, ka);
  }
  // ---- szczyty (±X): płyty ze „supergrafiką" z kolorów wierzchołków (zero trójkątów więcej):
  // schodkowy pas akcentu, pionowe pasy albo słupek okienek łazienkowych; na jednym czasem mural.
  // Gładki szczyt bez niczego czytał się z góry jak ściana pudła.
  const nsz = Math.max(1, Math.round((gl - 2 * FZ) / 2.8));
  let muralSt = pietra >= 3 && R() < 0.6 ? (R() < 0.5 ? 1 : -1) : 0, muralId = Math.floor(R() * MURALE.length) % MURALE.length;
  if (o.mural === false) muralSt = 0;                                  // opcja: bez muralu
  else if (typeof o.mural === 'number' && pietra >= 3) { muralId = ((Math.round(o.mural) % MURALE.length) + MURALE.length) % MURALE.length; if (!muralSt) muralSt = 1; }
  // akcent = pełny kolor pasa klatki (przy mieszance 65/35 schodki na brzoskwini/kremie ginęły)
  const akcent = mnoz(S.klatka, 0.97), akcentJ = miesz(S.klatka, S.szczyt, 0.45);
  for (const st of [1, -1]) {
    const x = st * hx;
    const wzor = st === muralSt ? 'mural' : wybierz(R, ['schodki', 'schodki', 'pasy', 'okienka']);
    const odwr = R() < 0.5;
    for (let i = 0; i < nsz; i++) {
      const za = -hz + FZ + (gl - 2 * FZ) * i / nsz, zb = -hz + FZ + (gl - 2 * FZ) * (i + 1) / nsz;
      const [a, c] = st > 0 ? [zb, za] : [za, zb];
      const ii = odwr ? nsz - 1 - i : i;
      b.sciana(x, a, x, c, 0, COK, uvK(K.COKOL), kolY(KOL.cokol, 0), kolY(KOL.cokol, COK));
      for (let f = 0; f < pietra; f++) {
        const y0 = COK + f * H, y1 = y0 + H, jj = 0.97 + R() * 0.06;
        let baza = f === 0 ? S.parter : S.szczyt, cell = K.PANEL;
        if (f > 0 && wzor === 'schodki') {
          const prog = pietra - 1 - Math.round(ii * (pietra - 1) / Math.max(1, nsz));   // schodek na kolumnę
          if (f >= prog) baza = f === prog ? akcentJ : akcent;
        } else if (f > 0 && wzor === 'pasy' && ii % 2 === 1) baza = akcentJ;
        else if (f > 0 && wzor === 'okienka' && ii === Math.floor(nsz / 2)) { cell = K.B + (R() < 0.5 ? 0 : 5); baza = akcentJ; }
        b.sciana(x, a, x, c, y0, y1, uvK(cell), kolY(baza, y0, jj), kolY(baza, y1, jj));
      }
    }
    b.sciana(x, st > 0 ? hz - FZ : -hz + FZ, x, st > 0 ? -hz + FZ : hz - FZ, yTop, yAtt, UV_BIALY, mnoz(S.szczyt, 0.95));
  }
  if (muralSt) {
    const szer = Math.min(gl - 2 * FZ - 1.4, (yTop - COK - H - 1.2) / 1.15), wys = szer * 1.15;
    const x = muralSt * (hx + 0.02), yc = COK + H + (pietra - 1) * H / 2;
    const [kx, ky] = MURALE[muralId], uv = uvObszar(kx, ky, 2, 2);
    const kk = S.szczyt;
    if (muralSt > 0) b.sciana(x, szer / 2, x, -szer / 2, yc - wys / 2, yc + wys / 2, uv, kolY(kk, yc - wys / 2), kolY(kk, yc + wys / 2));
    else b.sciana(x, -szer / 2, x, szer / 2, yc - wys / 2, yc + wys / 2, uv, kolY(kk, yc - wys / 2), kolY(kk, yc + wys / 2));
  }
  // ---- sfazowane narożniki (miękka sylwetka i dodatkowy „rant" światła) ----
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    // punkty w kolejności obejścia: front → +X → tył → −X
    let ax, az, bx, bz;
    if (sx > 0 && sz > 0) { ax = hx - FZ; az = hz; bx = hx; bz = hz - FZ; }
    else if (sx > 0) { ax = hx; az = -hz + FZ; bx = hx - FZ; bz = -hz; }
    else if (sz < 0) { ax = -hx + FZ; az = -hz; bx = -hx; bz = -hz + FZ; }
    else { ax = -hx; az = hz - FZ; bx = -hx + FZ; bz = hz; }
    b.sciana(ax, az, bx, bz, 0, COK, UV_BIALY, kolY(KOL.cokol, 0), kolY(KOL.cokol, COK));
    b.sciana(ax, az, bx, bz, COK, COK + H, UV_BIALY, kolY(S.parter, COK), kolY(S.parter, COK + H));
    b.sciana(ax, az, bx, bz, COK + H, yTop, UV_BIALY, kolY(S.sciana, COK + H), kolY(S.sciana, yTop));
    b.sciana(ax, az, bx, bz, yTop, yAtt, UV_BIALY, mnoz(S.sciana, 0.95));
  }
  // ---- prześwit bramy ----
  if (g0 !== null) {
    // tunel pod budynkiem ciemniejszy niż podwórko: ton cienia materiału jest jasny (toon), więc
    // głębię prześwitu niesie AO w kolorach wierzchołków — ściany, strop i własna posadzka
    const kb = mnoz(S.parter, 0.62);
    const n = Math.max(2, Math.round(gl / 3));
    for (let i = 0; i < n; i++) {               // pasy wzdłuż Z: ciemniej w środku tunelu
      const za = -hz + gl * i / n, zb = -hz + gl * (i + 1) / n;
      const ga = 1 - 0.35 * Math.sin(Math.PI * i / n), gb = 1 - 0.35 * Math.sin(Math.PI * (i + 1) / n);
      b.quad([g0, 0, zb], [g0, 0, za], [g0, yBramy, za], [g0, yBramy, zb], uvK(K.PANEL, [i / n, 0, (i + 1) / n, 1]),
        [mnoz(kb, 0.8 * gb), mnoz(kb, 0.8 * ga), mnoz(kb, ga), mnoz(kb, gb)]);
      b.quad([g1, 0, za], [g1, 0, zb], [g1, yBramy, zb], [g1, yBramy, za], uvK(K.PANEL, [i / n, 0, (i + 1) / n, 1]),
        [mnoz(kb, 0.8 * ga), mnoz(kb, 0.8 * gb), mnoz(kb, gb), mnoz(kb, ga)]);
      b.quad([g0, yBramy, za], [g1, yBramy, za], [g1, yBramy, zb], [g0, yBramy, zb], UV_BIALY,
        [mnoz(kb, 0.75 * ga), mnoz(kb, 0.75 * ga), mnoz(kb, 0.75 * gb), mnoz(kb, 0.75 * gb)]);
      const kp = mnoz(KOL.opaska, 0.72);
      b.quad([g0, 0.07, zb], [g1, 0.07, zb], [g1, 0.07, za], [g0, 0.07, za], uvK(K.BETON),
        [mnoz(kp, gb), mnoz(kp, gb), mnoz(kp, ga), mnoz(kp, ga)]);
    }
    for (const st of [1, -1]) {           // jasna opaska wokół otworu
      const z = st * (hz + 0.03);
      b.pud(g0 - 0.18, 0, Math.min(z, z + st * 0.06), g0, yBramy + 0.18, Math.max(z, z + st * 0.06), { wsz: [UV_BIALY, KOL.obrobka], ny: false, py: false });
      b.pud(g1, 0, Math.min(z, z + st * 0.06), g1 + 0.18, yBramy + 0.18, Math.max(z, z + st * 0.06), { wsz: [UV_BIALY, KOL.obrobka], ny: false, py: false });
      b.pud(g0, yBramy, Math.min(z, z + st * 0.06), g1, yBramy + 0.18, Math.max(z, z + st * 0.06), { wsz: [UV_BIALY, KOL.obrobka], nx: false, px: false, py: false });
    }
  }
  // ---- gzymsik nad cokołem (listwa, przerwana w bramie i przy wejściach klatek) ----
  {
    const k = mnoz(KOL.obrobka, 0.95), e = 0.09, y0 = COK - 0.05, y1 = COK + 0.07;
    const przerwy = st => {
      const p = [];
      if (g0 !== null) p.push([g0 - 0.18, g1 + 0.18]);
      if (st > 0) for (const i of klatki) p.push([kol[i].x0, kol[i].x1]);
      p.sort((a, c) => a[0] - c[0]);
      const out = []; let x = -hx + FZ;
      for (const [a, c] of p) { if (a > x + 0.05) out.push([x, a]); x = Math.max(x, c); }
      if (hx - FZ > x + 0.05) out.push([x, hx - FZ]);
      return out;
    };
    for (const [a, c] of przerwy(1)) b.pud(a, y0, hz, c, y1, hz + e, { wsz: [UV_BIALY, k], ny: [UV_BIALY, mnoz(k, 0.8)], nz: false });
    for (const [a, c] of przerwy(-1)) b.pud(a, y0, -hz - e, c, y1, -hz, { wsz: [UV_BIALY, k], ny: [UV_BIALY, mnoz(k, 0.8)], pz: false });
    b.pud(hx, y0, -hz + FZ, hx + e, y1, hz - FZ, { wsz: [UV_BIALY, k], ny: [UV_BIALY, mnoz(k, 0.8)], nx: false });
    b.pud(-hx - e, y0, -hz + FZ, -hx, y1, hz - FZ, { wsz: [UV_BIALY, k], ny: [UV_BIALY, mnoz(k, 0.8)], px: false });
  }
  // ---- balkony ----
  const balkonyGeo = [];
  for (const st of [1, -1]) {
    for (let i = 0; i < nk; i++) {
      if (!balkon(st, i)) continue;
      const cx = cxK(i), bw = (kol[i].x1 - kol[i].x0) - 0.34;
      const acc = S.balkony[(i + (st > 0 ? 1 : 0)) % 2];
      for (let f = 0; f < pietra; f++) {
        if (kol[i].br && f === 0) continue;
        const y0 = COK + f * H;
        b.ustaw(cx, 0, st * hz, st > 0 ? 0 : Math.PI);
        const szyby = f > 0 && R() < 0.14;
        const kw = R(), ta = R();
        balkonLokalny(b, bw, BD, y0, acc, szyby, f === pietra - 1, kw < 0.2 ? 'kwiaty' : ta < 0.12 ? 'talerz' : null, ao);
        b.ustaw();
        balkonyGeo.push({ cx, st, y0, bw, szyby });
        if (f === 0) kolizje.push({ x: cx, z: st * (hz + BD / 2), w: bw, d: BD, h: y0 + 1.05 });
      }
    }
  }
  // ---- wejścia do klatek: schodki, daszek, lampka ----
  for (const i of klatki) {
    const cx = cxK(i);
    const kSt = KOL.beton;
    b.pud(cx - 1.1, 0, hz, cx + 1.1, 0.16, hz + 1.35, { wsz: [uvK(K.BETON, [0, 0, 0.5, 0.1]), mnoz(kSt, 0.9)], py: [uvK(K.BETON), kSt], ny: false, nz: false });
    b.pud(cx - 0.9, 0.16, hz, cx + 0.9, 0.3, hz + 0.72, { wsz: [uvK(K.BETON, [0, 0, 0.5, 0.1]), mnoz(kSt, 0.9)], py: [uvK(K.BETON), kSt], ny: false, nz: false });
    const kd = miesz(S.klatka, KOL.obrobka, 0.35);
    b.pud(cx - 1.3, 3.0, hz, cx + 1.3, 3.2, hz + 1.5, { wsz: [UV_BIALY, mnoz(kd, 0.92)], py: [UV_BIALY, KOL.obrobka], ny: [UV_BIALY, mnoz(KOL.obrobka, 0.85)], nz: false });
    // plafon pod daszkiem (świeci w dół)
    b.pud(cx - 0.2, 2.9, hz + 0.55, cx + 0.2, 3.0, hz + 0.85, { wsz: [UV_BIALY, KOL.lampa], ny: [uvK(K.LAMPA), [1.4, 1.4, 1.35]], py: false });
  }
  // ---- rynny ----
  for (const sx of [1, -1]) for (const st of [1, -1]) {
    const x = sx * (hx - FZ - 0.32), z = st * (hz + 0.08);
    if (balkonyGeo.some(q => q.st === st && Math.abs(q.cx - x) < q.bw / 2 + 0.2)) continue;
    b.pud(x - 0.065, 0.05, z - 0.065, x + 0.065, yAtt - 0.05, z + 0.065, { wsz: [UV_BIALY, KOL.rynna, mnoz(KOL.rynna, 1.02)], py: false, ny: false });
  }
  // ---- dach: murek attyki od środka, obróbka blacharska, dach, maszynownie, kominki, anteny ----
  {
    const t = 0.25, yD = yTop + 0.1, kIn = mnoz(S.sciana, 0.82);
    b.sciana(hx - t, hz - t, -hx + t, hz - t, yD, yAtt, UV_BIALY, mnoz(kIn, 0.9), kIn);
    b.sciana(-hx + t, -hz + t, hx - t, -hz + t, yD, yAtt, UV_BIALY, mnoz(kIn, 0.9), kIn);
    b.sciana(-hx + t, hz - t, -hx + t, -hz + t, yD, yAtt, UV_BIALY, mnoz(kIn, 0.9), kIn);
    b.sciana(hx - t, -hz + t, hx - t, hz - t, yD, yAtt, UV_BIALY, mnoz(kIn, 0.9), kIn);
    // papa w kaflach ~4 j. z lekko różną jasnością = miękkie łaty zamiast jednolitej płachty
    const nxD = Math.max(1, Math.round((dl - 2 * t) / 4)), nzD = Math.max(1, Math.round((gl - 2 * t) / 4));
    for (let i = 0; i < nxD; i++) for (let j = 0; j < nzD; j++) {
      const x0 = -hx + t + (dl - 2 * t) * i / nxD, x1 = -hx + t + (dl - 2 * t) * (i + 1) / nxD;
      const z0 = -hz + t + (gl - 2 * t) * j / nzD, z1 = -hz + t + (gl - 2 * t) * (j + 1) / nzD;
      b.plaska(x0, z0, x1, z1, yD, uvK(K.DACH), mnoz(KOL.dach, 0.93 + R() * 0.12), true);
    }
    const e = 0.09, y0 = yAtt - 0.1, y1 = yAtt + 0.05, kO = KOL.obrobka, kOd = mnoz(kO, 0.8);
    b.pud(-hx - e, y0, hz - t, hx + e, y1, hz + e, { wsz: [UV_BIALY, kO], ny: [UV_BIALY, kOd], nx: false, px: false });
    b.pud(-hx - e, y0, -hz - e, hx + e, y1, -hz + t, { wsz: [UV_BIALY, kO], ny: [UV_BIALY, kOd], nx: false, px: false });
    b.pud(hx - t, y0, -hz + t, hx + e, y1, hz - t, { wsz: [UV_BIALY, kO], ny: [UV_BIALY, kOd], nz: false, pz: false });
    b.pud(-hx - e, y0, -hz + t, -hx + t, y1, hz - t, { wsz: [UV_BIALY, kO], ny: [UV_BIALY, kOd], nz: false, pz: false });
    // maszynownie wind / wyjścia na dach nad klatkami
    for (const i of klatki) {
      const cx = cxK(i), k = mnoz(S.sciana, 0.97);
      b.pud(cx - 1.3, yD, -0.9, cx + 1.3, yD + 2.3, 1.9, { wsz: [uvK(K.PANEL), mnoz(k, 0.85), k], py: [UV_BIALY, KOL.dach], ny: false });
      b.pud(cx - 1.4, yD + 2.3, -1.0, cx + 1.4, yD + 2.42, 2.0, { wsz: [UV_BIALY, KOL.obrobka], ny: [UV_BIALY, mnoz(KOL.obrobka, 0.8)] });
    }
    const ileKom = 3 + Math.floor(R() * 4);
    for (let n = 0; n < ileKom; n++) {
      const x = -hx + 2 + R() * (dl - 4), z = -hz + 1.5 + R() * (gl - 3);
      if (klatki.some(i => Math.abs(cxK(i) - x) < 2.2 && z > -1.6 && z < 2.6)) continue;
      const k = mnoz(S.sciana, 0.9);
      b.pud(x - 0.28, yD, z - 0.28, x + 0.28, yD + 0.75, z + 0.28, { wsz: [UV_BIALY, mnoz(k, 0.85), k], py: [UV_BIALY, mnoz(KOL.dach, 0.7)], ny: false });
    }
    const ileAnt = 1 + Math.floor(R() * 2.4);
    for (let n = 0; n < ileAnt; n++) {
      const x = -hx + 3 + R() * (dl - 6), z = -hz + 2 + R() * (gl - 4), hA = 2.2 + R() * 0.8, k = KOL.antena;
      b.pud(x - 0.04, yD, z - 0.04, x + 0.04, yD + hA, z + 0.04, { wsz: [UV_BIALY, k], py: false, ny: false });
      for (const [yy, dlA] of [[hA - 0.1, 0.55], [hA - 0.55, 0.42]])
        b.pud(x - 0.04, yD + yy - 0.035, z - dlA, x + 0.04, yD + yy + 0.035, z + dlA, { wsz: [UV_BIALY, k], nz: false, pz: false });
    }
  }
  // ---- opaska (chodniczek betonowy wokół budynku) ----
  if (o.opaska !== false) {
    const e = 0.75, k = KOL.opaska;
    b.pud(-hx - e, 0, -hz - e, hx + e, 0.05, hz + e, { wsz: [UV_BIALY, mnoz(k, 0.8)], py: [UV_BIALY, k], ny: false });
  }

  // ---- kolizje: korpus (z bramą = 2 AABB) + balkony parteru (dopisane wyżej) ----
  if (g0 === null) kolizje.unshift({ x: 0, z: 0, w: dl, d: gl, h: yAtt });
  else kolizje.unshift({ x: (-hx + g0) / 2, z: 0, w: g0 + hx, d: gl, h: yAtt }, { x: (g1 + hx) / 2, z: 0, w: hx - g1, d: gl, h: yAtt });

  // ---- cienGeo: ośmiobok korpusu (fazy jak w siatce, żeby narożnik nie leżał „w" cieniu
  // własnej bryły), bez okien; balkony jako pełne pudła; maszynownie ----
  const c = new Bud(), kc = BIEL;
  const obrys = [[-hx + FZ, hz], [hx - FZ, hz], [hx, hz - FZ], [hx, -hz + FZ], [hx - FZ, -hz], [-hx + FZ, -hz], [-hx, -hz + FZ], [-hx, hz - FZ]];
  const bryla = (x0, x1, y0, y1) => {           // wycinek ośmioboku x ∈ [x0, x1]
    const pts = obrys.map(([x, z]) => [clamp(x, x0, x1), z]);
    const sr = [(x0 + x1) / 2, y1, 0], u = UV_BIALY[0], v = UV_BIALY[1], uvT = [u, v, u, v, u, v];
    for (let i = 0; i < 8; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 8];
      if (Math.abs(ax - bx) + Math.abs(az - bz) < 1e-6) continue;
      c.sciana(ax, az, bx, bz, y0, y1, UV_BIALY, kc);
      c.tri(sr, [ax, y1, az], [bx, y1, bz], uvT, kc);           // wierzch = wachlarz ośmioboku
    }
  };
  if (g0 === null) bryla(-hx, hx, 0, yAtt);
  else { bryla(-hx, g0, 0, yAtt); bryla(g1, hx, 0, yAtt); bryla(g0, g1, yBramy, yAtt);
    c.plaska(g0, -hz, g1, hz, yBramy, UV_BIALY, kc, false); }
  for (const q of balkonyGeo) {
    c.ustaw(q.cx, 0, q.st * hz, q.st > 0 ? 0 : Math.PI);
    c.pud(-q.bw / 2, q.y0 - 0.15, 0, q.bw / 2, q.y0 + (q.szyby ? 2.62 : 1.05), BD, { wsz: [UV_BIALY, kc], nz: false });
    c.ustaw();
  }
  for (const i of klatki) {
    const cx = cxK(i);
    c.pud(cx - 1.3, yTop + 0.1, -0.9, cx + 1.3, yTop + 2.42, 1.9, { wsz: [UV_BIALY, kc], ny: false });
    c.pud(cx - 1.3, 3.0, hz, cx + 1.3, 3.2, hz + 1.5, { wsz: [UV_BIALY, kc], nz: false });
  }

  return { geo: b.geo(THREE), kolizje, cienGeo: c.geo(THREE), wejscia, wys: yAtt, schemat: S.nm };
}

// balkon w układzie ściany: ściana w z = 0, balkon wystaje ku +z; y0 = poziom podłogi
function balkonLokalny(b, bw, bd, y0, acc, szyby, ostatnie, dodatek, ao) {
  const x0 = -bw / 2, x1 = bw / 2, yb = y0 - 0.15, t = 0.09;
  const kA = y => mnoz(acc, ao(y));
  const kP = KOL.plyta;
  if (szyby) {
    const yg = y0 + 2.62;
    const uvF = uvK(K.BALKON_SZYBY, [0, 0, 1, (yg - yb) / 2.75]);
    b.sciana(x0, bd, x1, bd, yb, yg, uvF, kA(yb), kA(yg));
    const uvB = uvK(K.BALKON_SZYBY, [0, 0, bd / 2.35, (yg - yb) / 2.75]);
    b.sciana(x0, 0, x0, bd, yb, yg, uvB, kA(yb), kA(yg));
    b.sciana(x1, bd, x1, 0, yb, yg, uvB, kA(yb), kA(yg));
    b.plaska(x0, 0, x1, bd, yb, UV_BIALY, mnoz(kP, 0.85), false);
    b.plaska(x0, 0, x1, bd, yg, UV_BIALY, ostatnie ? KOL.dach : kP, true);
    return;
  }
  const yp = y0 + 1.05;
  const uvF = uvK(K.BALUSTRADA);
  b.sciana(x0, bd, x1, bd, yb, yp, uvF, kA(yb), kA(yp));
  const uvB = uvK(K.BALUSTRADA, [0, 0, bd / 2.35, 1]);
  b.sciana(x0, 0, x0, bd, yb, yp, uvB, kA(yb), kA(yp));
  b.sciana(x1, bd, x1, 0, yb, yp, uvB, kA(yb), kA(yp));
  b.plaska(x0, 0, x1, bd, yb, UV_BIALY, mnoz(kP, 0.8), false);
  const kR = KOL.poreczy;
  b.plaska(x0, bd - t, x1, bd, yp, UV_BIALY, kR, true);
  b.plaska(x0, 0, x0 + t, bd - t, yp, UV_BIALY, kR, true);
  b.plaska(x1 - t, 0, x1, bd - t, yp, UV_BIALY, kR, true);
  const kIn = mnoz(acc, 0.72 * ao(y0));
  b.sciana(x1 - t, bd - t, x0 + t, bd - t, y0, yp, UV_BIALY, mnoz(kIn, 0.85), kIn);
  b.sciana(x0 + t, bd - t, x0 + t, 0, y0, yp, UV_BIALY, mnoz(kIn, 0.85), kIn);
  b.sciana(x1 - t, 0, x1 - t, bd - t, y0, yp, UV_BIALY, mnoz(kIn, 0.85), kIn);
  b.plaska(x0 + t, 0, x1 - t, bd - t, y0, uvK(K.CHODNIK), mnoz(kP, 0.78), true);
  if (dodatek === 'kwiaty') {
    const w = Math.min(1.2, bw * 0.5), xs = (bw / 2 - w / 2 - 0.1) * (b.n % 2 ? 1 : -1) * 0.6;
    b.pud(xs - w / 2, yp, bd - 0.24, xs + w / 2, yp + 0.18, bd - 0.02,
      { wsz: [UV_BIALY, mnoz(KOL.donica, 0.9), KOL.donica], py: [uvK(K.KWIATY), BIEL], ny: false });
  } else if (dodatek === 'talerz') {
    // antena satelitarna: czasza (dwa wachlarze) + ramię
    const cx = x1 - 0.32, cy = yp + 0.3, cz = bd + 0.06;
    const nx = 0.35, ny = 0.42, nz = 0.84, l = Math.hypot(nx, ny, nz);
    b.dysk(cx, cy, cz, nx / l, ny / l, nz / l, 0.3, 8, UV_BIALY, KOL.talerz);
    b.dysk(cx - nx / l * 0.05, cy - ny / l * 0.05, cz - nz / l * 0.05, -nx / l, -ny / l, -nz / l, 0.3, 8, UV_BIALY, mnoz(KOL.talerz, 0.8));
    b.rura(cx, cy - 0.1, cz - 0.04, cx, yp - 0.02, bd - 0.02, 0.025, 4, UV_BIALY, KOL.antena);
  }
}

// ============================== AUTO ==============================
// Karykaturalne auta z PRL-owskimi proporcjami, bez marek: „maluch" (krótki, obły, wysoka
// kabina), „polonez" (klin z liftbackiem), „kant" (trzybryłowy sedan). ~2 × 4,2 × 1,5 j.
// Proporcje „zabawkowe" (druga iteracja po obejrzeniu z bliska): duże koła, nadwozie zaokrąglone
// prawie do pigułki, wysoka szklarnia — pierwsza wersja czytała się jak zwykły sedan z klockiem.
const AUTA_TYPY = {
  maluch:  { L: 3.3,  W: 1.72, y0: 0.3,  hB: 0.5,  r: 0.24, af: 0.22, ar: 0.18, kw: 0.07,
             kab: { l0: 2.2, af: 0.6, ar: 0.78, h: 0.72, w: 1.5, dz: -0.1, r: 0.27, kw: 0.18 }, kolo: 0.34 },
  polonez: { L: 4.1,  W: 1.86, y0: 0.33, hB: 0.48, r: 0.21, af: 0.2, ar: 0.06, kw: 0.06,
             kab: { l0: 2.55, af: 0.8, ar: 0.74, h: 0.62, w: 1.62, dz: -0.3, r: 0.2, kw: 0.15 }, kolo: 0.37 },
  kant:    { L: 4.25, W: 1.86, y0: 0.34, hB: 0.48, r: 0.16, af: 0.09, ar: 0.06, kw: 0.05,
             kab: { l0: 2.1, af: 0.42, ar: 0.36, h: 0.6, w: 1.6, dz: -0.1, r: 0.16, kw: 0.11 }, kolo: 0.37 },
};
export function auto(THREE, o = {}) {
  const R = prng(o.ziarno === undefined ? 1 : o.ziarno);
  const typy = Object.keys(AUTA_TYPY);
  const T = AUTA_TYPY[o.typ && AUTA_TYPY[o.typ] ? o.typ : typy[Math.floor(R() * typy.length) % typy.length]];
  const kolor = o.kolor !== undefined ? lin(o.kolor) : wybierz(R, AUTA_KOLORY);
  const dachInny = R() < 0.25;
  const b = new Bud();
  const hy = T.hB / 2;
  const kolB = y => mnoz(kolor, 0.82 + 0.18 * sstep(T.y0, T.y0 + T.hB, y));
  pudZaokr(b, {
    cx: 0, y0: T.y0, cz: 0, hx: T.W / 2, hy, hz: T.L / 2, r: T.r, af: T.af, ar: T.ar, kw: T.kw,
    uv: { px: uvK(K.AUTO_BOK), nx: uvK(K.AUTO_BOK), pz: uvK(K.AUTO_PRZOD), nz: uvK(K.AUTO_TYL), py: UV_BIALY, ny: false },
    kol: y => kolB(y),
  });
  // kabina zanurzona w nadwoziu o ~promień zaokrąglenia: dolny łuk kabiny chowa się w karoserii,
  // więc szyby zaczynają się od linii pasa, a nie od „poduszki"
  const kb = T.kab, zan = kb.r * 0.8, yk = T.y0 + T.hB - zan;
  const kolK = (y, s) => (s === 'py' && dachInny ? KOL.dachAuta : kolor);
  pudZaokr(b, {
    cx: 0, y0: yk, cz: kb.dz, hx: kb.w / 2, hy: (kb.h + zan) / 2, hz: kb.l0 / 2, r: kb.r, af: kb.af, ar: kb.ar, kw: kb.kw,
    uv: { px: uvK(K.AUTO_BOK_SZYBY), nx: uvK(K.AUTO_BOK_SZYBY), pz: uvK(K.AUTO_SZYBA), nz: uvK(K.AUTO_SZYBA), py: UV_BIALY, ny: false },
    kol: kolK,
  });
  // koła (opona = gładki ośmiobok, kołpak z atlasu tylko od zewnątrz)
  const rk = T.kolo, zk = 0.6 * T.L / 2;
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const xo = sx * (T.W / 2 + 0.04), xi = sx * (T.W / 2 - 0.22);
    b.rura(xi, rk, sz * zk, xo, rk, sz * zk, rk, 8, UV_BIALY, KOL.opona, KOL.opona, 2, uvK(K.OPONA));
  }
  // zderzaki: cienka szara listwa tuż przy nadwoziu (szersze i białe czytały się jak deski)
  const kz = KOL.chrom, zb = T.y0 + 0.05;
  for (const s of [1, -1]) {
    const z0 = s > 0 ? T.L / 2 - 0.1 : -T.L / 2 - 0.05, z1 = s > 0 ? T.L / 2 + 0.05 : -T.L / 2 + 0.1;
    b.pud(-T.W / 2 + 0.2, zb, z0, T.W / 2 - 0.2, zb + 0.085, z1,
      { wsz: [UV_BIALY, mnoz(kz, 0.72), mnoz(kz, 0.86)], ny: false, [s > 0 ? 'nz' : 'pz']: false });
  }
  const top = yk + kb.h + zan;
  return { geo: b.geo(THREE), kolizje: [{ x: 0, z: 0, w: T.W + 0.04, d: T.L + 0.16, h: top }], wys: top };
}

// ============================== TRZEPAK ==============================
export function trzepak(THREE, o = {}) {
  const R = prng(o.ziarno === undefined ? 7 : o.ziarno);
  const k = wybierz(R, TRZEPAK_KOLORY), kd = mnoz(k, 0.8), b = new Bud();
  const X = 1.45, Hh = 1.8, r = 0.06;
  for (const s of [1, -1]) {
    b.rura(s * X, 0.1, 0, s * X, Hh, 0, r, 6, UV_BIALY, kd, k);
    b.pud(s * X - 0.16, 0, -0.16, s * X + 0.16, 0.12, 0.16, { wsz: [uvK(K.BETON, [0, 0, 0.3, 0.1]), mnoz(KOL.beton, 0.85)], py: [uvK(K.BETON), KOL.beton], ny: false });
  }
  b.rura(-X - 0.1, Hh - 0.03, 0, X + 0.1, Hh - 0.03, 0, r * 0.95, 6, UV_BIALY, k, k, 3);
  b.rura(-X, 1.08, 0, X, 1.08, 0, r * 0.85, 6, UV_BIALY, k, k);
  return { geo: b.geo(THREE), kolizje: [{ x: 0, z: 0, w: 2 * X + 0.3, d: 0.3, h: Hh }] };
}

// ============================== PIASKOWNICA ==============================
export function piaskownica(THREE, o = {}) {
  const R = prng(o.ziarno === undefined ? 3 : o.ziarno);
  const A = 2, T = 0.26, Hf = 0.34, b = new Bud();
  const kd = KOL.piaskownica, kg = mnoz(kd, 1.08), uvD = uvK(K.DREWNO), uvDs = uvK(K.DREWNO, [0, 0, 0.3, 1]);
  const des = { wsz: [uvD, mnoz(kd, 0.82), kd], py: [uvD, kg], ny: false };
  b.pud(-A, 0, A - T, A, Hf, A, des);
  b.pud(-A, 0, -A, A, Hf, -A + T, des);
  b.pud(-A, 0, -A + T, -A + T, Hf, A - T, { ...des, pz: false, nz: false, px: [uvDs, mnoz(kd, 0.8)] });
  b.pud(A - T, 0, -A + T, A, Hf, A - T, { ...des, pz: false, nz: false, nx: [uvDs, mnoz(kd, 0.8)] });
  // piasek: siatka 5×5 z miękkim wzgórkiem
  const n = 5, a = A - T, uvP = uvK(K.PIASEK);
  const wys = (x, z) => 0.2 + 0.1 * Math.max(0, 1 - (x * x + z * z) / (a * a)) + 0.03 * Math.sin(x * 2.3 + 1) * Math.cos(z * 1.9);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x0 = -a + 2 * a * i / n, x1 = -a + 2 * a * (i + 1) / n, z0 = -a + 2 * a * j / n, z1 = -a + 2 * a * (j + 1) / n;
    const du = uvP[2] - uvP[0], dv = uvP[3] - uvP[1];
    b.quad([x0, wys(x0, z1), z1], [x1, wys(x1, z1), z1], [x1, wys(x1, z0), z0], [x0, wys(x0, z0), z0],
      [uvP[0] + du * i / n, uvP[1] + dv * (n - 1 - j) / n, uvP[0] + du * (i + 1) / n, uvP[1] + dv * (n - j) / n], BIEL);
  }
  b.wygladz(b.n - n * n * 6, b.n);
  // kopczyk piasku i zabawki
  const px = -0.8 + R() * 0.4, pz = 0.5 + R() * 0.3;
  const uvs = [uvP[0], uvP[1], (uvP[0] + uvP[2]) / 2, uvP[3], uvP[2], uvP[1]];
  for (let i = 0; i < 7; i++) {
    const a0 = i / 7 * TAU, a1 = (i + 1) / 7 * TAU, rr = 0.46, ys = wys(px, pz);
    b.tri([px + Math.cos(a0) * rr, ys - 0.03, pz + Math.sin(a0) * rr], [px, ys + 0.24, pz],
      [px + Math.cos(a1) * rr, ys - 0.03, pz + Math.sin(a1) * rr], uvs, BIEL);
  }
  b.wygladz(b.n - 21, b.n);
  const wx = 0.9, wz = -0.5, wy = wys(wx, wz) - 0.02, kW = lin(0xe8685c);
  b.rura(wx, wy, wz, wx, wy + 0.24, wz, 0.13, 6, UV_BIALY, mnoz(kW, 0.85), kW, 2, UV_BIALY);
  b.pud(0.2, wys(0.3, -1) + 0.01, -1.2, 0.28, wys(0.3, -1) + 0.05, -0.75, { wsz: [UV_BIALY, lin(0xf2c85a)], ny: false });
  return { geo: b.geo(THREE), kolizje: [{ x: 0, z: 0, w: 2 * A, d: 2 * A, h: Hf }] };
}

// ============================== HUŚTAWKI (podwójne, rama A) ==============================
export function hustawki(THREE, o = {}) {
  const R = prng(o.ziarno === undefined ? 5 : o.ziarno);
  const [kR, kS] = wybierz(R, HUSTAWKI_KOLORY), b = new Bud();
  const L = 2.1, Hh = 2.35, S = 0.95, r = 0.065;
  for (const sx of [1, -1]) for (const sz of [1, -1])
    b.rura(sx * L, 0, sz * S, sx * L, Hh, 0, r, 6, UV_BIALY, mnoz(kR, 0.8), kR);
  b.rura(-L - 0.12, Hh, 0, L + 0.12, Hh, 0, r * 1.05, 6, UV_BIALY, kR, kR, 3);
  const kl = KOL.antena;
  for (const x of [-0.85, 0.85]) {
    for (const dx of [-0.24, 0.24])
      b.pud(x + dx - 0.02, 0.55, -0.02, x + dx + 0.02, Hh - 0.04, 0.02, { wsz: [UV_BIALY, kl], py: false, ny: false });
    b.pud(x - 0.3, 0.5, -0.14, x + 0.3, 0.57, 0.14, { wsz: [UV_BIALY, mnoz(kS, 0.8), kS], py: [UV_BIALY, kS] });
  }
  return { geo: b.geo(THREE), kolizje: [{ x: -L, z: 0, w: 0.3, d: 2 * S, h: Hh }, { x: L, z: 0, w: 0.3, d: 2 * S, h: Hh }] };
}

// ============================== GARAŻE BLASZAKI ==============================
export function garaze(THREE, o = {}) {
  const ile = clamp(Math.round(liczba(o.ile, 5)), 1, 40);
  const R = prng(o.ziarno === undefined ? 1 : o.ziarno);
  const W = 3, D = 6, b = new Bud(), kolizje = [];
  const x0 = -ile * W / 2, uvBl = uvK(K.BLACHA);
  for (let i = 0; i < ile; i++) {
    const xa = x0 + i * W, xb = xa + W, h = 2.45 + R() * 0.3, ht = h - 0.28;
    const k = mnoz(wybierz(R, GARAZE_KOLORY), 0.95 + R() * 0.08);
    const rdza = R() < 0.35, kDr = R() < 0.22 ? wybierz(R, GARAZE_KOLORY) : k;
    const kd = mnoz(k, 0.84);
    // front (brama), tył, boki w dwóch płatach (żeby fala blachy nie rozjechała się na 6 j.)
    b.sciana(xa, D / 2, xb, D / 2, 0, h, uvK(rdza ? K.GARAZ_RDZA : K.GARAZ, [0, 0, 1, h / 2.6]), mnoz(kDr, 0.86), kDr);
    b.sciana(xb, -D / 2, xa, -D / 2, 0, ht, uvK(K.BLACHA, [0, 0, 1, ht / 2.6]), kd, k);
    const yz = z => ht + (h - ht) * (z + D / 2) / D;
    for (const [za, zb] of [[D / 2, 0], [0, -D / 2]]) {
      b.quad([xb, 0, za], [xb, 0, zb], [xb, yz(zb), zb], [xb, yz(za), za], [uvBl[0], uvBl[1], uvBl[2], uvBl[1] + (uvBl[3] - uvBl[1]) * yz(za) / 2.6], [kd, kd, k, k]);
      b.quad([xa, 0, zb], [xa, 0, za], [xa, yz(za), za], [xa, yz(zb), zb], [uvBl[0], uvBl[1], uvBl[2], uvBl[1] + (uvBl[3] - uvBl[1]) * yz(za) / 2.6], [kd, kd, k, k]);
    }
    const kDach = mnoz(miesz(k, KOL.dach, 0.55), 1.0);
    // dach: tylko wycinek fali (4 szerokie żebra) — pełna komórka dawała z góry tęczową morę
    b.quad([xa, h, D / 2], [xb, h, D / 2], [xb, ht, -D / 2], [xa, ht, -D / 2], uvK(K.BLACHA, [0, 0.1, 0.3, 0.9]), kDach);
    // okap nad bramą
    b.pud(xa - 0.02, h - 0.08, D / 2 - 0.05, xb + 0.02, h + 0.05, D / 2 + 0.32, { wsz: [UV_BIALY, mnoz(kDach, 0.9)], py: [UV_BIALY, kDach], ny: [UV_BIALY, mnoz(kDach, 0.7)], nz: false });
    // betonowy podjazd
    b.plaska(xa + 0.1, D / 2, xb - 0.1, D / 2 + 1.3, 0.03, uvK(K.BETON), mnoz(KOL.beton, 0.95 + R() * 0.08), true);
    kolizje.push({ x: (xa + xb) / 2, z: 0, w: W, d: D, h });
  }
  return { geo: b.geo(THREE), kolizje };
}

// ============================== WIATA ŚMIETNIKOWA ==============================
export function smietnik(THREE, o = {}) {
  const R = prng(o.ziarno === undefined ? 9 : o.ziarno);
  const W = 5.4, D = 2.2, Hh = 2.15, t = 0.08, b = new Bud();
  const kB = KOL.beton, kW = KOL.wiata, uvW = uvK(K.WIATA);
  b.pud(-W / 2 - 0.1, 0, -D / 2 - 0.1, W / 2 + 0.1, 0.08, D / 2 + 0.5, { wsz: [uvK(K.BETON, [0, 0, 1, 0.1]), mnoz(kB, 0.85)], py: [uvK(K.BETON), kB], ny: false });
  const scW = { wsz: [uvW, mnoz(kW, 0.85), kW], py: [UV_BIALY, mnoz(kW, 1.05)], ny: false };
  b.pud(-W / 2, 0.08, -D / 2, W / 2, 1.95, -D / 2 + t, scW);
  b.pud(-W / 2, 0.08, -D / 2 + t, -W / 2 + t, 1.95, D / 2, { ...scW, nz: false });
  b.pud(W / 2 - t, 0.08, -D / 2 + t, W / 2, 1.95, D / 2, { ...scW, nz: false });
  const kS = mnoz(KOL.wiataDach, 0.9);
  for (const sx of [1, -1]) b.pud(sx * (W / 2 - 0.05) - 0.05, 0.08, D / 2 - 0.1, sx * (W / 2 - 0.05) + 0.05, Hh, D / 2, { wsz: [UV_BIALY, kS], py: false, ny: false });
  // dach pochyły ku tyłowi z okapem
  const kD = KOL.wiataDach, yF = Hh + 0.12, yT = Hh - 0.08, e = 0.3;
  const xL = -W / 2 - e, xR = W / 2 + e, zF = D / 2 + e, zT = -D / 2 - 0.15;
  b.quad([xL, yF, zF], [xR, yF, zF], [xR, yT, zT], [xL, yT, zT], uvK(K.BLACHA, [0, 0.1, 0.6, 0.9]), kD);
  b.quad([xL, yT - 0.06, zT], [xR, yT - 0.06, zT], [xR, yF - 0.06, zF], [xL, yF - 0.06, zF], UV_BIALY, mnoz(kD, 0.7));
  b.quad([xL, yF - 0.06, zF], [xR, yF - 0.06, zF], [xR, yF, zF], [xL, yF, zF], UV_BIALY, mnoz(kD, 0.9));
  b.quad([xR, yT - 0.06, zT], [xL, yT - 0.06, zT], [xL, yT, zT], [xR, yT, zT], UV_BIALY, mnoz(kD, 0.8));
  b.quad([xR, yF - 0.06, zF], [xR, yT - 0.06, zT], [xR, yT, zT], [xR, yF, zF], UV_BIALY, mnoz(kD, 0.85));
  b.quad([xL, yT - 0.06, zT], [xL, yF - 0.06, zF], [xL, yF, zF], [xL, yT, zT], UV_BIALY, mnoz(kD, 0.85));
  // kontenery (segregacja: żółty, niebieski, zielony — kolejność z ziarna)
  const kol = KONTENERY_KOLORY.slice(0, 3);
  for (let i = kol.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [kol[i], kol[j]] = [kol[j], kol[i]]; }
  const n = R() < 0.3 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const cx = (i - (n - 1) / 2) * 1.68, k = kol[i], w = 1.36, d = 1.25, hk = 1.2, z0 = -D / 2 + 0.2;
    b.pud(cx - w / 2, 0.08, z0, cx + w / 2, 0.08 + hk, z0 + d,
      { wsz: [UV_BIALY, mnoz(k, 0.8), mnoz(k, 0.95)], pz: [uvK(K.KONTENER), mnoz(k, 0.85), k], py: [UV_BIALY, mnoz(k, 0.45)], ny: false });
    const kl = mnoz(k, 0.62), uch = R() < 0.25 ? 0.12 : 0;
    b.quad([cx - w / 2 - 0.04, 0.08 + hk + 0.02, z0 + d + 0.05], [cx + w / 2 + 0.04, 0.08 + hk + 0.02, z0 + d + 0.05],
      [cx + w / 2 + 0.04, 0.08 + hk + 0.1 + uch, z0 - 0.04], [cx - w / 2 - 0.04, 0.08 + hk + 0.1 + uch, z0 - 0.04], UV_BIALY, kl);
    b.pud(cx - w / 2 - 0.04, 0.08 + hk - 0.04, z0 + d, cx + w / 2 + 0.04, 0.08 + hk + 0.02, z0 + d + 0.05, { wsz: [UV_BIALY, mnoz(kl, 0.9)], py: false, nz: false });
  }
  return { geo: b.geo(THREE), kolizje: [{ x: 0, z: 0, w: W + 0.2, d: D, h: Hh }] };
}

// ============================== LATARNIA ==============================
// typ 'pastoral' (osiedlowa z wygiętym wysięgnikiem, domyślna) albo 'kula' (alejkowa)
export function latarnia(THREE, o = {}) {
  const b = new Bud(), kS = lin(0xb9c3bd), kD = mnoz(kS, 0.8), kG = [1.5, 1.5, 1.45];
  b.pud(-0.17, 0, -0.17, 0.17, 0.5, 0.17, { wsz: [uvK(K.BETON, [0, 0, 0.2, 0.25]), mnoz(KOL.beton, 0.85), KOL.beton], ny: false });
  if (o.typ === 'kula') {
    b.rura(0, 0.5, 0, 0, 3.3, 0, 0.065, 6, UV_BIALY, kD, kS);
    // kula: 3 pasy × 8 segmentów
    const cy = 3.62, r = 0.3, n = 8;
    for (let j = 0; j < 4; j++) {
      const t0 = -Math.PI / 2 + j * Math.PI / 4, t1 = t0 + Math.PI / 4;
      for (let i = 0; i < n; i++) {
        const a0 = i / n * TAU, a1 = (i + 1) / n * TAU;
        const p = (t, a) => [Math.cos(t) * Math.cos(a) * r, cy + Math.sin(t) * r, Math.cos(t) * Math.sin(a) * r];
        b.quad(p(t0, a1), p(t0, a0), p(t1, a0), p(t1, a1), uvK(K.LAMPA), kG);
      }
    }
    b.wygladz(b.n - 4 * n * 6, b.n);
    return { geo: b.geo(THREE), kolizje: [{ x: 0, z: 0, w: 0.34, d: 0.34, h: 3.9 }] };
  }
  b.rura(0, 0.5, 0, 0, 5.2, 0, 0.075, 6, UV_BIALY, kD, kS);
  const pts = [[0, 5.2, 0], [0, 5.52, 0.14], [0, 5.7, 0.48], [0, 5.68, 0.9]];
  for (let i = 0; i < 3; i++) b.rura(...pts[i], ...pts[i + 1], 0.06, 6, UV_BIALY, kS);
  const kL = KOL.lampa;
  b.pud(-0.2, 5.5, 0.8, 0.2, 5.68, 1.5, { wsz: [UV_BIALY, mnoz(kL, 0.9), kL], py: [UV_BIALY, mnoz(kL, 1.1)], ny: false });
  b.plaska(-0.16, 0.86, 0.16, 1.44, 5.495, uvK(K.LAMPA), kG, false);
  return { geo: b.geo(THREE), kolizje: [{ x: 0, z: 0, w: 0.34, d: 0.34, h: 5.7 }] };
}

// ============================== ŁAWKA ==============================
// betonowe nóżki + drewniane listwy (ciepłe drewno albo malowana zieleń, z ziarna)
export function lawka(THREE, o = {}) {
  const R = prng(o.ziarno === undefined ? 2 : o.ziarno);
  const b = new Bud(), kD = R() < 0.6 ? KOL.drewno : KOL.drewnoZiel, kB = KOL.beton;
  const uvD = uvK(K.DREWNO), uvB = uvK(K.BETON, [0, 0, 0.25, 0.25]);
  for (const s of [1, -1]) {
    b.pud(s * 0.78 - 0.07, 0, -0.26, s * 0.78 + 0.07, 0.42, 0.24, { wsz: [uvB, mnoz(kB, 0.82), kB], ny: false, py: false });
    b.pud(s * 0.78 - 0.06, 0.42, -0.3, s * 0.78 + 0.06, 0.92, -0.2, { wsz: [uvB, mnoz(kB, 0.9), kB], ny: false });
  }
  const lis = { wsz: [uvD, mnoz(kD, 0.8), mnoz(kD, 0.9)], py: [uvD, kD], ny: [uvD, mnoz(kD, 0.7)] };
  for (const [z0, z1] of [[-0.22, -0.07], [-0.04, 0.11], [0.14, 0.29]]) b.pud(-0.98, 0.42, z0, 0.98, 0.47, z1, lis);
  for (const [y0, y1] of [[0.58, 0.7], [0.76, 0.88]]) b.pud(-0.98, y0, -0.29, 0.98, y1, -0.23, { ...lis, pz: [uvD, kD] });
  return { geo: b.geo(THREE), kolizje: [{ x: 0, z: 0, w: 1.96, d: 0.6, h: 0.9 }] };
}

// ============================== NAWIERZCHNIE (dodatek, poza kontraktem) ==============================
// rodzaj: 'asfalt' | 'chodnik' | 'parking'; w × d (X × Z); kafel = rozmiar płata (powtarzanie
// komórki atlasu); parking: linie miejsc co `miejsce` j. wzdłuż X od krawędzi −Z (długość 4,8),
// `rzedy: 2` = także od krawędzi +Z; kraweznik: obramowanie 0,12 j.
export function nawierzchnia(THREE, o = {}) {
  const w = liczba(o.w, 10), d = liczba(o.d, 10), rodzaj = o.rodzaj || 'asfalt';
  const R = prng(o.ziarno === undefined ? 4 : o.ziarno), b = new Bud();
  const chodnik = rodzaj === 'chodnik', kafel = liczba(o.kafel, chodnik ? 2 : 3);
  const baza = chodnik ? lin(0xd9d3c7) : lin(0xa3a6aa), uv = uvK(chodnik ? K.CHODNIK : K.ASFALT), y = 0.04;
  const nx = Math.max(1, Math.round(w / kafel)), nz = Math.max(1, Math.round(d / kafel));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x0 = -w / 2 + w * i / nx, x1 = -w / 2 + w * (i + 1) / nx, z0 = -d / 2 + d * j / nz, z1 = -d / 2 + d * (j + 1) / nz;
    b.plaska(x0, z0, x1, z1, y, uv, mnoz(baza, 0.95 + R() * 0.08), true);
  }
  if (rodzaj === 'parking') {
    const m = liczba(o.miejsce, 2.7), kL = [0.95, 0.95, 0.92], dl = Math.min(4.8, d / (o.rzedy === 2 ? 2 : 1) - 0.6);
    for (let x = -w / 2 + 0.3; x <= w / 2 - 0.3 + 1e-6; x += m) {
      b.plaska(x - 0.06, -d / 2 + 0.3, x + 0.06, -d / 2 + 0.3 + dl, y + 0.006, UV_BIALY, kL, true);
      if (o.rzedy === 2) b.plaska(x - 0.06, d / 2 - 0.3 - dl, x + 0.06, d / 2 - 0.3, y + 0.006, UV_BIALY, kL, true);
    }
  }
  if (o.kraweznik !== false) {
    const k = lin(0xd6d1c8), e = 0.14, hk = 0.12, s = { wsz: [UV_BIALY, mnoz(k, 0.85), k], py: [uvK(K.BETON), k], ny: false };
    b.pud(-w / 2 - e, 0, d / 2, w / 2 + e, hk, d / 2 + e, s);
    b.pud(-w / 2 - e, 0, -d / 2 - e, w / 2 + e, hk, -d / 2, s);
    b.pud(-w / 2 - e, 0, -d / 2, -w / 2, hk, d / 2, { ...s, pz: false, nz: false });
    b.pud(w / 2, 0, -d / 2, w / 2 + e, hk, d / 2, { ...s, pz: false, nz: false });
  }
  return { geo: b.geo(THREE), kolizje: [] };
}
