// ╔══════════════ MARKET — MODELE, ATLAS, MATERIAŁ (30.09.2026) ══════════════╗
// Życzenie właściciela: „poprawienie elementów w markecie i podłogi, i ogólnie ta mapa jest do poprawy mocno".
// Wszystko liczone w kodzie (zero plików z sieci). Układ chunka (co gdzie stoi) daje lib/uklad-marketu.js,
// ten moduł robi z niego geometrię; kolizje, przewracanie i domino są w main.js.
//
// CO JEST W ŚRODKU
//   • ATLAS 1024 × 512 (DataTexture, raz): pasy towaru na regały (8 działów × 2 pasy po 32 px, 64 px/j. — tyle,
//     ile piksel ekranu przy kamerze gry, więc towar czyta się jak pixel art postaci), cenówki bez tekstu,
//     kartony, folia, drewno, siatka wózka, taśma kasy, mrożonki, puszki, tablice promocji, piktogramy działów.
//     Kanał ALFA = maska barwienia (1 = mnożone przez kolor działu, 0 = kolor wprost) — jedna cenówka pasuje
//     do każdego działu, a biała etykieta zostaje biała.
//   • MATERIAŁ `materialMarketu` (ShaderMaterial, własny program — bez łatek cudzych shaderów, więc pułapki
//     z `addCloudShadow`/`#include <map_fragment>` tu nie istnieją): 3 pasma toon z chłodnym tonem cienia,
//     światło z sufitu (jaśniejsze plamy pod świetlówkami), emisja (wnętrza lad, ekrany kas), oraz
//     POSADZKA LICZONA W SHADERZE ze współrzędnych świata: płytki 1 j. ze spoinami, lastryko w pikselach
//     32/j. (gasnące z odległością — bez migotania), pasy głównych alejek co 40 j. z listwą, odbicia świetlówek
//     (promień odbity od posadzki trafia w siatkę lamp pod sufitem; 3 progi jak toon, fresnel) i rozlana woda.
//     Rodzaj powierzchni siedzi w atrybucie aFx (patrz niżej), więc cały chunk to JEDEN program i JEDEN draw call.
//   • `materialSzkla` — przezroczyste szyby lad i folia stretch na paletach (osobna siatka na chunk).
//   • `geoRegalu` — moduł regału 4 × 1,6 × 2,3 j. (gondola dwustronna: cokół, 3 półki × 2 strony, listwy
//     z cenówkami, towar z atlasu, boczne ścianki, nagłówek z piktogramem działu, cienie kontaktowe stojący/leżący)
//     — jedna geometria dla wszystkich regałów, dział i wariant z `instanceColor` instancji.
//   • `zbudujChunk` — posadzka + wszystkie statyczne rekwizyty chunka + plamy + cienie kontaktowe → jedna siatka.
//
// ATRYBUTY (BufferGeometry BEZ INDEKSU): position, normal, color, uv, aFx (vec4):
//   aFx.x = emisja (rekwizyty) albo AO (posadzka: 1 = bez cienia), aFx.y = połysk (odbicia lamp),
//   aFx.z = rodzaj: 0 zwykły (atlas × kolor), 1 posadzka, 2 woda, 3 barwiony działem (maska atlasu),
//           4 barwiony jasnym odcieniem działu, 5 towar (pas atlasu przesunięty o dział i wariant), 6 piktogram działu,
//   aFx.w = w regale: 1 = tylko stojący, 2 = tylko leżący (cienie kontaktowe); w siatce chunka: numer działu.
// INSTANCJE REGAŁÓW: instanceColor = (stan 0 stoi / 1 pada / 2 leży, dział 0..7, wariant 0/1).
// Układ modelu: Y w górę, środek podstawy w (0, 0, 0); regał: przód (strona upadku) = +Z, pivot w krawędzi
// podstawy z = 0, bryła w z ∈ [−1,6; 0].
// ╚═══════════════════════════════════════════════════════════════════════════╝

const TAU = Math.PI * 2;
// ============================== DROBIAZGI ==============================
function lin(hex) {
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}
const mn = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const miesz = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const BIEL = [1, 1, 1];
export function prng(ziarno = 1) {
  let s = (Math.imul(ziarno | 0, 0x9e3779b1) ^ 0x5bd1e995) | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hexCss = h => '#' + h.toString(16).padStart(6, '0');

// KOLORY DZIAŁÓW (nasycony — nagłówki, listwy; jasny — plecy regału, czoła)
export const DZIALY = [
  { nm: 'śniadania', k: 0xf29a4a, j: 0xfbe0c4 }, { nm: 'napoje', k: 0x4aa3e0, j: 0xcfe6f7 },
  { nm: 'słodycze', k: 0xe86a9a, j: 0xf9d3e1 }, { nm: 'przetwory', k: 0xe8c24a, j: 0xf8ecc4 },
  { nm: 'chemia', k: 0x8f7fd8, j: 0xdfd9f5 }, { nm: 'makaron', k: 0xd9a55a, j: 0xf3e2c4 },
  { nm: 'przekąski', k: 0xe0534a, j: 0xf6d0cc }, { nm: 'nabiał', k: 0x5cc2a0, j: 0xd0efe4 },
];

// ============================== ATLAS ==============================
export const AW = 1024, AH = 512;
const PXJ = 64;                                      // piksele atlasu na jednostkę świata (pasy towaru)
// regiony atlasu (px, lewy górny róg jak w canvasie; DataTexture bez flipY → v = y / AH)
const RG = {
  bialy: [786, 2, 4, 4],
  listwa: [784, 8, 240, 8], wierzch: [784, 16, 240, 8],
  perfo: [784, 24, 32, 32], karton: [816, 24, 64, 64], nadruk0: [880, 24, 64, 64], nadruk1: [944, 24, 64, 64],
  paleta: [784, 88, 64, 16], skrzynka: [848, 88, 64, 32], siatka: [912, 88, 32, 32], koszyk: [944, 88, 64, 32],
  tasma: [784, 120, 32, 64], mrozonki: [816, 120, 128, 64], puszki: [944, 120, 64, 32], denka: [944, 152, 64, 32],
  gwiazda: [784, 184, 64, 64], ekran: [848, 184, 16, 16], lada: [864, 184, 64, 32], tabliczka: [928, 184, 32, 16],
  etykieta: [928, 200, 64, 16], karton2: [960, 216, 64, 64], deski: [784, 248, 64, 32], kartonWierzch: [848, 216, 64, 64],
  ikona: [768, 0, 16, 16],                           // piktogram działu 0; dział k: y + 64k (przesunięcie w shaderze)
  warzywa: [784, 280, 192, 64],                      // 12 komórek 32 × 32: kopce warzyw i owoców (kolejność WARZ_LISTA)
};
function uvR(nazwa, px0 = 0, py0 = 0, pw = null, ph = null) {
  const [x, y, w, h] = RG[nazwa];
  const X = x + px0, Y = y + py0, W = pw == null ? w : pw, H = ph == null ? h : ph;
  return [X / AW, (Y + H) / AH, (X + W) / AW, Y / AH];     // u0, vDół, u1, vGóra
}
const UV_BIALY = (() => { const [x, y] = RG.bialy; return [(x + 1) / AW, (y + 3) / AH, (x + 3) / AW, (y + 1) / AH]; })();

function rysujAtlas() {
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  const g = c.getContext('2d');
  const m = document.createElement('canvas'); m.width = AW; m.height = AH;     // maska barwienia (biały = barwić)
  const gm = m.getContext('2d');
  gm.fillStyle = '#000'; gm.fillRect(0, 0, AW, AH);
  const R = prng(3009);
  const P = (x, y, w, h, kol) => { g.fillStyle = typeof kol === 'number' ? hexCss(kol) : kol; g.fillRect(x | 0, y | 0, w | 0, h | 0); };
  const M = (x, y, w, h) => { gm.fillStyle = '#fff'; gm.fillRect(x | 0, y | 0, w | 0, h | 0); };
  const Mc = (x, y, w, h) => { gm.fillStyle = '#000'; gm.fillRect(x | 0, y | 0, w | 0, h | 0); };
  const cien = (hex, k) => { const r = (hex >> 16) & 255, gg = (hex >> 8) & 255, b = hex & 255;
    const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return (f(r) << 16) | (f(gg) << 8) | f(b); };
  const jasn = (hex, t) => { const r = (hex >> 16) & 255, gg = (hex >> 8) & 255, b = hex & 255;
    const f = v => Math.round(v + (255 - v) * t); return (f(r) << 16) | (f(gg) << 8) | f(b); };
  const wyb = tab => tab[Math.floor(R() * tab.length) % tab.length];

  // ---------- biały + maska 1 (surowy kolor wierzchołka / kolor działu) ----------
  P(784, 0, 8, 8, 0xffffff); M(784, 0, 8, 8);

  // ---------- PASY TOWARU: 8 działów × 2 pasy 768 × 32 ----------
  // Towar stoi „frontami" (ten sam produkt 2–5 razy obok siebie, jak w prawdziwym sklepie), dół pasa = półka.
  const PAL = [
    [0xf28c3a, 0xf5c542, 0xd8503f, 0x5b8fd6, 0x8bc34a, 0xe8e0c8],   // śniadania: płatki, owsianka
    [0x58b86a, 0x6ab8e8, 0xf29a3a, 0xe25a4a, 0xf2e6a0, 0x9a6ad0],   // napoje
    [0xe86a9a, 0x9a5a3a, 0xf5c542, 0x7a4ad0, 0x5ac8c8, 0xf28c3a],   // słodycze
    [0xd8403a, 0x6aa83a, 0xf29a3a, 0x8a3a8a, 0xe8c24a, 0xc8783a],   // przetwory
    [0x8f7fd8, 0x5ab0e8, 0xf2f2f0, 0x6ac89a, 0xf28caa, 0xf5d542],   // chemia
    [0xe8c24a, 0x3a6ad0, 0xd8503f, 0xf2ead0, 0x8bc34a, 0xc89a5a],   // makaron
    [0xe0433a, 0xf5c542, 0x4aa83a, 0x3a7ad8, 0xf28c3a, 0x9a4ad0],   // przekąski
    [0xf4f4ee, 0x5cc2a0, 0x6ab8e8, 0xf5d542, 0xe86a9a, 0xd8e8f0],   // nabiał
  ];
  const TYPY = [
    ['pudlo', 'pudlo', 'pudlo', 'torba'], ['butelka', 'butelka', 'karton', 'butelka'], ['baton', 'pudloM', 'torbaM', 'sloik'],
    ['sloik', 'sloik', 'sloik', 'puszka'], ['kanister', 'spray', 'rolki', 'kanister'], ['torba', 'pudlo', 'torba', 'torbaM'],
    ['torba', 'torba', 'torba', 'puszkaW'], ['karton', 'karton', 'kubki', 'kubki'],
  ];
  const obrys = (x, y, w, h, kol) => { P(x, y, 1, h, cien(kol, 0.62)); P(x + w - 1, y, 1, h, cien(kol, 0.7)); };
  const produkt = (typ, x, yb, kol, akc) => {       // zwraca szerokość
    const jas = jasn(kol, 0.35), cie = cien(kol, 0.72);
    switch (typ) {
      case 'pudlo': case 'pudloM': {
        const w = typ === 'pudlo' ? 18 + Math.floor(R() * 4) : 13, h = typ === 'pudlo' ? 24 + Math.floor(R() * 5) : 16;
        const y = yb - h;
        P(x, y, w, h, kol); P(x, y, w, 1, jas); obrys(x, y, w, h, kol);
        P(x + 2, y + 3, w - 4, 2, akc);                                     // pasek marki (bez liter)
        const r = Math.max(3, (w / 3) | 0);                                 // „miska" / owal na froncie
        P(x + (w >> 1) - r, y + (h >> 1) - 1, 2 * r, r + 1, 0xfbf3e2); P(x + (w >> 1) - r + 1, y + (h >> 1) + r, 2 * r - 2, 1, 0xfbf3e2);
        P(x + (w >> 1) - 1, y + (h >> 1), 3, 2, akc);
        P(x + 1, yb - 3, w - 2, 2, cie);
        return w;
      }
      case 'torba': case 'torbaM': {
        const w = typ === 'torba' ? 18 + Math.floor(R() * 3) : 13, h = typ === 'torba' ? 22 + Math.floor(R() * 5) : 15;
        const y = yb - h;
        P(x + 1, y + 2, w - 2, h - 2, kol); P(x, y + 4, w, h - 5, kol);
        for (let i = 0; i < w - 2; i += 2) P(x + 1 + i, y + (i % 4 ? 0 : 1), 2, 2, jas);   // zgrzew u góry
        P(x + 2, y + 5, 2, h - 9, jas);                                     // połysk folii
        P(x + (w >> 1) - 3, y + (h >> 1) - 2, 7, 5, akc); P(x + (w >> 1) - 2, y + (h >> 1) - 1, 5, 3, 0xfbf3e2);
        P(x + 1, yb - 2, w - 2, 1, cie);
        return w;
      }
      case 'butelka': {
        const w = 8 + Math.floor(R() * 3), h = 25 + Math.floor(R() * 4), y = yb - h, sz = 4;
        P(x + 1, y + 9, w - 2, h - 9, kol); P(x, y + 11, w, h - 12, kol);
        P(x + ((w - sz) >> 1), y + 3, sz, 7, kol); P(x + ((w - sz) >> 1), y, sz, 3, akc);   // szyjka + nakrętka
        P(x + 1, y + 14, w - 2, 6, 0xf6f1e4); P(x + 2, y + 16, w - 4, 2, akc);            // etykieta
        P(x + 1, y + 11, 1, h - 13, jas);
        return w;
      }
      case 'karton': {
        const w = 12 + Math.floor(R() * 2), h = 22 + Math.floor(R() * 3), y = yb - h;
        P(x, y + 4, w, h - 4, 0xf6f4ee); P(x + 1, y + 1, w - 2, 3, 0xe8e6e0); P(x + (w >> 1) - 1, y, 2, 2, 0xe0ded8);
        P(x, y + 9, w, 6, kol); P(x + 2, y + 11, w - 4, 2, jas); obrys(x, y + 4, w, h - 4, 0xe8e6e0);
        return w;
      }
      case 'sloik': {
        const w = 12 + Math.floor(R() * 3), h = 16 + Math.floor(R() * 4), y = yb - h;
        P(x, y + 3, w, h - 3, kol); P(x + 1, y, w - 2, 3, akc); P(x + 1, y + 2, w - 2, 1, cien(akc, 0.7));
        P(x + 1, y + 7, w - 2, 5, 0xf6f1e4); P(x + (w >> 1) - 1, y + 8, 3, 3, cien(kol, 0.8));
        P(x + 1, y + 4, 1, h - 6, jas);
        return w;
      }
      case 'puszka': case 'puszkaW': {
        const w = typ === 'puszka' ? 11 : 10, h = typ === 'puszka' ? 14 : 24, y = yb - h;
        P(x, y, w, h, kol); P(x, y, w, 1, 0xd8dde2); P(x, yb - 1, w, 1, 0xb8bec6);
        P(x, y + (h >> 1) - 2, w, 4, 0xf6f1e4); P(x + 1, y + (h >> 1) - 1, w - 2, 2, akc);
        P(x + 1, y + 1, 1, h - 2, jas);
        return w;
      }
      case 'baton': {
        const w = 20, y0 = yb;
        for (let s = 0; s < 3; s++) {
          const k = s === 1 ? akc : kol, y = y0 - 6 * (s + 1);
          P(x, y, w, 6, k); P(x, y, w, 1, jasn(k, 0.35)); P(x + 3, y + 2, 6, 2, 0xf6f1e4); P(x + w - 2, y + 1, 1, 4, cien(k, 0.6));
        }
        return w;
      }
      case 'kanister': {
        const w = 16, h = 22 + Math.floor(R() * 3), y = yb - h;
        P(x, y + 5, w, h - 5, kol); P(x + 2, y + 2, w - 5, 4, kol); P(x + w - 6, y + 2, 3, 3, cien(kol, 0.55));   // uchwyt
        P(x + 2, y, 4, 3, akc);
        P(x + 2, y + 10, w - 4, 7, 0xf6f1e4); P(x + 4, y + 12, w - 8, 3, akc);
        P(x + 1, y + 6, 1, h - 8, jas);
        return w;
      }
      case 'spray': {
        const w = 9, h = 24, y = yb - h;
        P(x + 1, y + 7, w - 2, h - 7, kol); P(x + 2, y + 2, 5, 5, akc); P(x + 6, y + 2, 3, 2, akc); P(x + 3, y, 3, 2, cien(akc, 0.7));
        P(x + 1, y + 12, w - 2, 5, 0xf6f1e4);
        P(x + 1, y + 8, 1, h - 9, jas);
        return w;
      }
      case 'rolki': {
        const w = 24, h = 20, y = yb - h;
        P(x, y, w, h, 0xf8f8f6);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { P(x + 2 + i * 7, y + 2 + j * 9, 6, 7, 0xeceae4); P(x + 4 + i * 7, y + 4 + j * 9, 2, 3, 0xd8d4cc); }
        P(x, y + 8, w, 3, kol); P(x + 8, y + 8, 8, 3, akc);
        return w;
      }
      case 'kubki': {
        const w = 9;
        for (let s = 0; s < 2; s++) {
          const y = yb - 10 * (s + 1);
          P(x, y + 1, w, 9, 0xf6f4ee); P(x, y, w, 2, kol); P(x + 1, y + 4, w - 2, 3, jasn(kol, 0.3)); P(x, y + 9, w, 1, 0xd8d6d0);
        }
        return w;
      }
    }
    return 10;
  };
  for (let k = 0; k < 8; k++) {
    const kat = DZIALY[k].k;
    const tlo = (() => { const a = 0x3a3346, t = 0.14; const r = (h, s) => ((h >> s) & 255);
      const mix = s => Math.round(r(a, s) + (r(kat, s) - r(a, s)) * t); return (mix(16) << 16) | (mix(8) << 8) | mix(0); })();
    for (let s = 0; s < 2; s++) {
      const y0 = k * 64 + s * 32, yb = y0 + 31;
      P(0, y0, 768, 32, tlo);
      P(0, yb, 768, 1, cien(tlo, 0.8));
      let x = 1;
      while (x < 766) {
        if (R() < 0.05) { x += 6 + Math.floor(R() * 8); continue; }       // pusta dziura na półce
        const typ = wyb(TYPY[k]), kol = wyb(PAL[k]), akc = wyb(PAL[k].filter(v => v !== kol));
        const n = 2 + Math.floor(R() * 4);
        for (let i = 0; i < n && x < 766; i++) {
          // ostatni produkt nie może wyjść za pas (768) — rysujemy na próbnej pozycji i ucinamy
          g.save(); g.beginPath(); g.rect(0, y0, 768, 32); g.clip();
          const w = produkt(typ, x, yb, kol, akc);
          g.restore();
          x += w + 1;
        }
        x += 1;
      }
    }
  }
  // ---------- PIKTOGRAMY DZIAŁÓW (16 × 16, x 768, y 64k) na jasnym kółku ----------
  const ikony = [
    (x, y) => { P(x + 3, y + 8, 10, 4, 0xf2f2ee); P(x + 4, y + 12, 8, 1, 0xd0d0cc); P(x + 5, y + 6, 2, 2, 0xf5c542); P(x + 8, y + 5, 2, 3, 0xf28c3a); P(x + 10, y + 7, 2, 1, 0xf5c542); },   // miska płatków
    (x, y) => { P(x + 6, y + 2, 4, 2, 0x2a6aa8); P(x + 6, y + 4, 4, 2, 0x8fd0f5); P(x + 5, y + 6, 6, 8, 0x8fd0f5); P(x + 5, y + 9, 6, 2, 0xffffff); },   // butelka
    (x, y) => { P(x + 7, y + 8, 2, 7, 0xf2f2ee); P(x + 4, y + 2, 8, 7, 0xe86a9a); P(x + 6, y + 4, 4, 3, 0xffffff); },   // lizak
    (x, y) => { P(x + 4, y + 3, 8, 2, 0xc89a3a); P(x + 4, y + 5, 8, 9, 0xd8403a); P(x + 5, y + 8, 6, 3, 0xffffff); },   // słoik
    (x, y) => { P(x + 5, y + 2, 5, 3, 0xffffff); P(x + 9, y + 3, 2, 1, 0xffffff); P(x + 4, y + 5, 7, 9, 0x8fd0f5); P(x + 5, y + 8, 5, 3, 0xffffff); },   // spray
    (x, y) => { for (let i = 0; i < 4; i++) P(x + 3 + i * 3, y + 3, 1, 10, 0xf5d542); P(x + 2, y + 12, 12, 2, 0xe8c24a); },   // makaron
    (x, y) => { P(x + 4, y + 2, 8, 12, 0xf5c542); P(x + 4, y + 2, 8, 2, 0xffe890); P(x + 6, y + 6, 4, 4, 0xe0433a); },   // chipsy
    (x, y) => { P(x + 5, y + 5, 7, 9, 0xffffff); P(x + 6, y + 2, 5, 3, 0xe8e8e4); P(x + 5, y + 8, 7, 3, 0x6ab8e8); },   // mleko
  ];
  for (let k = 0; k < 8; k++) {
    const x = 768, y = k * 64;
    P(x, y, 16, 16, DZIALY[k].k);
    P(x + 1, y + 1, 14, 14, jasn(DZIALY[k].k, 0.78)); P(x + 2, y + 0, 12, 1, jasn(DZIALY[k].k, 0.78)); P(x + 2, y + 15, 12, 1, jasn(DZIALY[k].k, 0.78));
    ikony[k](x, y);
  }
  // ---------- LISTWA CENOWA z cenówkami (240 × 8; pas barwiony działem, cenówki białe/żółte) ----------
  {
    const [x0, y0, w] = RG.listwa;
    P(x0, y0, w, 8, 0xe6e6e6); M(x0, y0, w, 8);
    P(x0, y0, w, 1, 0xffffff); P(x0, y0 + 7, w, 1, 0xb8b8b8);
    for (let x = x0 + 4; x < x0 + w - 12; x += 18 + Math.floor(R() * 14)) {
      const zolta = R() < 0.18;
      P(x, y0 + 1, 11, 6, zolta ? 0xffd84a : 0xfbfaf4); Mc(x, y0 + 1, 11, 6);
      P(x + 1, y0 + 2, 4, 1, 0x8a8a8a); P(x + 6, y0 + 3, 4, 2, zolta ? 0xd83a2a : 0x3a3a3a); P(x + 1, y0 + 5, 3, 1, 0xc0c0c0);
    }
  }
  // ---------- WIERZCHY towaru (240 × 8): pastelowe bloki ----------
  {
    const [x0, y0, w] = RG.wierzch;
    P(x0, y0, w, 8, 0xcfc6bd);
    for (let x = x0; x < x0 + w; x += 6 + Math.floor(R() * 12)) P(x, y0, 5 + Math.floor(R() * 10), 8, wyb([0xf0e6d8, 0xe8d2c0, 0xd8e2e8, 0xefe0b8, 0xe6d6ec, 0xd6e8d2, 0xf2d0c8]));
    for (let x = x0; x < x0 + w; x += 3) if (R() < 0.3) P(x, y0 + Math.floor(R() * 8), 1, 1, 0xb8aea4);
  }
  // ---------- PERFOROWANA PŁYTA pleców regału (32 × 32, barwiona jasnym działem) ----------
  {
    const [x0, y0] = RG.perfo;
    P(x0, y0, 32, 32, 0xf2f2f2); M(x0, y0, 32, 32);
    for (let j = 2; j < 32; j += 4) for (let i = 2; i < 32; i += 4) P(x0 + i, y0 + j, 1, 1, 0xa8a8a8);
  }
  // ---------- KARTONY ----------
  const karton = (x0, y0, baza, nad) => {
    P(x0, y0, 64, 64, baza);
    for (let i = 0; i < 90; i++) P(x0 + Math.floor(R() * 64), y0 + Math.floor(R() * 64), 1, 1, cien(baza, 0.9 + R() * 0.16));
    P(x0, y0, 64, 1, jasn(baza, 0.2)); P(x0, y0 + 63, 64, 1, cien(baza, 0.75)); P(x0, y0, 1, 64, cien(baza, 0.85)); P(x0 + 63, y0, 1, 64, cien(baza, 0.8));
    if (nad === 'tasma') { P(x0 + 26, y0, 12, 64, jasn(baza, 0.22)); P(x0 + 26, y0, 1, 64, cien(baza, 0.9)); }
    else if (nad) {
      P(x0 + 8, y0 + 18, 48, 28, 0xf6f2e8); P(x0 + 8, y0 + 18, 48, 6, nad); P(x0 + 14, y0 + 30, 16, 12, nad); P(x0 + 34, y0 + 30, 16, 3, cien(nad, 0.7)); P(x0 + 34, y0 + 36, 12, 3, cien(nad, 0.7));
      P(x0 + 26, y0, 12, 18, jasn(baza, 0.22)); P(x0 + 26, y0 + 46, 12, 18, jasn(baza, 0.22));
    }
    // strzałki „tą stroną do góry" (symbol, nie tekst)
    P(x0 + 50, y0 + 50, 2, 8, cien(baza, 0.5)); P(x0 + 48, y0 + 52, 6, 1, cien(baza, 0.5)); P(x0 + 55, y0 + 50, 2, 8, cien(baza, 0.5)); P(x0 + 53, y0 + 52, 6, 1, cien(baza, 0.5));
  };
  karton(RG.karton[0], RG.karton[1], 0xcf9f68, 'tasma');
  karton(RG.nadruk0[0], RG.nadruk0[1], 0xd4a672, 0xd8503f);
  karton(RG.nadruk1[0], RG.nadruk1[1], 0xecebe4, 0x3a8ad8);
  karton(RG.karton2[0], RG.karton2[1], 0xc8955e, 0x4aa83a);
  {
    const [x0, y0] = RG.kartonWierzch;                                    // wierzch kartonu: klapy + taśma na krzyż
    P(x0, y0, 64, 64, 0xd6a870); P(x0, y0 + 31, 64, 2, cien(0xd6a870, 0.72));
    P(x0 + 26, y0, 12, 64, 0xe8c592); P(x0, y0 + 26, 64, 12, 0xe8c592);
    P(x0, y0, 64, 1, 0xe8c592); P(x0, y0 + 63, 64, 1, cien(0xd6a870, 0.75));
  }
  // ---------- PALETA (bok: deski i klocki) ----------
  {
    const [x0, y0] = RG.paleta;
    P(x0, y0, 64, 16, 0xdcb680); P(x0, y0, 64, 4, 0xe8c896); P(x0, y0 + 12, 64, 4, 0xe2bf8a);
    for (const bx of [2, 28, 54]) P(x0 + bx, y0 + 4, 8, 8, 0xcaa06a);
    P(x0 + 10, y0 + 4, 18, 8, 0x4a3522); P(x0 + 36, y0 + 4, 18, 8, 0x4a3522);
    P(x0, y0 + 3, 64, 1, 0xb88c56); P(x0, y0 + 12, 64, 1, 0xb88c56);
  }
  // ---------- SKRZYNKA drewniana (bok, 64 × 32) ----------
  {
    const [x0, y0] = RG.skrzynka;
    P(x0, y0, 64, 32, 0x3e2a18);
    for (let j = 0; j < 3; j++) { const y = y0 + 1 + j * 11; P(x0, y, 64, 8, wyb([0xe3b070, 0xd8a262, 0xecbd7c])); P(x0, y, 64, 1, 0xf2cc92); P(x0, y + 7, 64, 1, 0xb88450); }
    P(x0, y0, 5, 32, 0xc08850); P(x0 + 59, y0, 5, 32, 0xc08850);
    P(x0 + 24, y0 + 12, 16, 7, 0xc9362b); P(x0 + 27, y0 + 14, 10, 3, 0xf6e6c8);   // stempel (kształt, bez liter)
  }
  // ---------- SIATKA (wózki, kosze): chrom na ciemnym ----------
  {
    const [x0, y0] = RG.siatka;
    P(x0, y0, 32, 32, 0x4c5866);
    for (let i = 0; i < 32; i += 4) { P(x0 + i, y0, 1, 32, 0xd4dce6); P(x0, y0 + i, 32, 1, 0xc4ccd6); }
    for (let i = 0; i < 32; i += 8) P(x0 + i, y0, 1, 32, 0xf2f6fa);
    M(x0, y0, 32, 32);
  }
  // ---------- KOSZYK (czerwony plastik z otworami) ----------
  {
    const [x0, y0] = RG.koszyk;
    P(x0, y0, 64, 32, 0xe0473c); P(x0, y0, 64, 3, 0xf06a5a); P(x0, y0 + 29, 64, 3, 0xb83028);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 9; i++) P(x0 + 3 + i * 7, y0 + 6 + j * 8, 4, 5, 0x7a1e18);
    M(x0, y0, 64, 32);
  }
  // ---------- TAŚMA KASY (32 × 64) ----------
  {
    const [x0, y0] = RG.tasma;
    P(x0, y0, 32, 64, 0x3a3f48);
    for (let j = 0; j < 64; j += 4) P(x0, y0 + j, 32, 1, 0x4c525c);
    P(x0, y0, 2, 64, 0x9aa4b0); P(x0 + 30, y0, 2, 64, 0x9aa4b0);
  }
  // ---------- MROŻONKI (wierzchy: pizze, lody, groszek) 128 × 64 ----------
  {
    const [x0, y0] = RG.mrozonki;
    P(x0, y0, 128, 64, 0xcfe6f2);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) {
      const x = x0 + i * 16, y = y0 + j * 16, t = (i * 3 + j * 5 + Math.floor(R() * 3)) % 4;
      if (t === 0) { P(x + 1, y + 1, 14, 14, 0xf2efe6); P(x + 3, y + 3, 10, 10, 0xe0703a); P(x + 5, y + 5, 2, 2, 0xd83a2a); P(x + 9, y + 7, 2, 2, 0x5a9a3a); P(x + 6, y + 9, 2, 2, 0xf5d542); }   // pizza
      else if (t === 1) { P(x + 2, y + 2, 12, 12, wyb([0xf29ab8, 0x8fd0f5, 0xf5e08a, 0xb8e8a0])); P(x + 4, y + 4, 8, 8, 0xfbf6ee); P(x + 6, y + 6, 4, 4, wyb([0xe86a9a, 0x6a4ad0, 0x5ab04a])); }   // lody
      else if (t === 2) { P(x + 1, y + 2, 14, 12, 0x5ab04a); P(x + 3, y + 4, 10, 6, 0x9ad86a); for (let q = 0; q < 4; q++) P(x + 4 + q * 2, y + 6, 1, 1, 0x3a7a2a); }   // groszek
      else { P(x + 1, y + 1, 14, 14, 0x3a6ad0); P(x + 3, y + 3, 10, 5, 0xfbf6ee); P(x + 3, y + 9, 10, 4, 0xf5c542); }   // ryba w panierce
    }
  }
  // ---------- PUSZKI (fronty 4 × 16 px) i DENKA ----------
  {
    const [x0, y0] = RG.puszki;
    const kol = [0xd83a2a, 0x3a8ad8, 0xe8c24a, 0x4aa83a];
    for (let i = 0; i < 4; i++) {
      const x = x0 + i * 16;
      P(x, y0, 16, 32, kol[i]); P(x, y0, 16, 2, 0xd8dde2); P(x, y0 + 30, 16, 2, 0xa8b0b8);
      P(x, y0 + 11, 16, 10, 0xf6f1e4); P(x + 4, y0 + 13, 8, 6, kol[(i + 1) % 4]);
      P(x + 1, y0 + 2, 2, 28, jasn(kol[i], 0.35)); P(x + 15, y0, 1, 32, cien(kol[i], 0.6));
    }
    const [dx, dy] = RG.denka;
    P(dx, dy, 64, 32, 0x8a929c);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
      const x = dx + i * 16, y = dy + j * 16;
      P(x + 1, y + 1, 14, 14, 0xc8d0d8); P(x + 3, y + 3, 10, 10, 0xe2e8ee); P(x + 6, y + 5, 4, 2, 0x9aa2ac);
    }
  }
  // ---------- GWIAZDA PROMOCJI (64 × 64): żółta gwiazda z czerwonym brzegiem, bez tekstu ----------
  {
    const [x0, y0] = RG.gwiazda;
    P(x0, y0, 64, 64, 0xf6f1e4);
    for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) {
      const dx = i - 31.5, dy = j - 31.5, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
      const R0 = 22 + 8 * (0.5 + 0.5 * Math.cos(a * 12));
      if (r < R0) P(x0 + i, y0 + j, 1, 1, r < R0 - 3 ? 0xffd23a : 0xe0433a);
      if (r < 13) P(x0 + i, y0 + j, 1, 1, 0xe0433a);
      if (r < 10) P(x0 + i, y0 + j, 1, 1, 0xfbf6ee);
    }
    P(x0 + 26, y0 + 27, 12, 3, 0xe0433a); P(x0 + 28, y0 + 33, 8, 3, 0xe0433a);     // „cena" jako dwa paski
  }
  // ---------- EKRAN KASY ----------
  { const [x0, y0] = RG.ekran; P(x0, y0, 16, 16, 0x2a3a3a); P(x0 + 1, y0 + 1, 14, 14, 0x7ae8c8); for (let j = 3; j < 14; j += 3) P(x0 + 2, y0 + j, 6 + ((j * 7) % 6), 1, 0x2a8a7a); }
  // ---------- BOK LADY CHŁODNICZEJ (64 × 32): biel, niebieski pas, kratka wentylacji ----------
  {
    const [x0, y0] = RG.lada;
    P(x0, y0, 64, 32, 0xf2f4f6); P(x0, y0, 64, 2, 0xffffff);
    P(x0, y0 + 6, 64, 5, 0x6fb3d8); P(x0, y0 + 6, 64, 1, 0x9ad0ee);
    P(x0, y0 + 24, 64, 8, 0x8a96a4); for (let i = 1; i < 64; i += 3) P(x0 + i, y0 + 25, 1, 6, 0x5a6674);
    for (let i = 0; i < 64; i += 16) P(x0 + i, y0 + 11, 1, 13, 0xd8dee4);
  }
  // ---------- TABLICZKA (kreda) i ETYKIETA nagłówka ----------
  {
    const [x0, y0] = RG.tabliczka;
    P(x0, y0, 32, 16, 0xa87a48); P(x0 + 2, y0 + 2, 28, 12, 0x34403c);
    P(x0 + 5, y0 + 5, 10, 2, 0xe8f0e8); P(x0 + 5, y0 + 9, 6, 2, 0xe8f0e8); P(x0 + 19, y0 + 6, 8, 5, 0xf5d542);
    const [ex, ey] = RG.etykieta;
    P(ex, ey, 64, 16, 0xfbf8f0); P(ex, ey, 64, 1, 0xffffff); P(ex, ey + 15, 64, 1, 0xd8d2c4);
    P(ex + 8, ey + 6, 30, 4, 0xb8b0a4); P(ex + 42, ey + 6, 14, 4, 0xd0c8bc);   // „napis" jako pasy — bez liter
  }
  // ---------- DESKI stoiska ----------
  {
    const [x0, y0] = RG.deski;
    P(x0, y0, 64, 32, 0x5a3a20);
    for (let j = 0; j < 4; j++) { const y = y0 + j * 8; P(x0, y, 64, 7, wyb([0xd8a868, 0xe4b676, 0xcc9a5a])); P(x0, y, 64, 1, 0xefc890); }
    for (let i = 0; i < 12; i++) P(x0 + Math.floor(R() * 60), y0 + Math.floor(R() * 32), 3, 1, 0xa87840);
  }
  // ---------- KOPCE WARZYW (12 × 32 × 32): gęsto ułożone bulwy w pikselach, rzut z góry ----------
  {
    const [x0, y0] = RG.warzywa;
    WARZ_LISTA.forEach((nm, idx) => {
      const [k, kd] = WARZ[nm], cx = x0 + (idx % 6) * 32, cy = y0 + Math.floor(idx / 6) * 32;
      P(cx, cy, 32, 32, cien(k, 0.72));
      const Rv = prng(idx * 31 + 7);
      const wydl = nm === 'marchew' || nm === 'banan' || nm === 'baklazan';
      for (let i = 0; i < (wydl ? 16 : 22); i++) {
        const px = Math.floor(Rv() * 32), py = Math.floor(Rv() * 32), r = nm === 'salata' ? 6 : wydl ? 2 : 4 + Math.floor(Rv() * 2);
        const dl = wydl ? 5 + Math.floor(Rv() * 3) : 0, poz = Rv() < 0.5;
        for (let j = -r - dl; j <= r + dl; j++) for (let q = -r; q <= r; q++) {
          const a = poz ? j : q, bq = poz ? q : j;
          const e = wydl ? (q * q) / (r * r + 0.5) + (j * j) / ((r + dl) * (r + dl) + 0.5) : (q * q + j * j) / (r * r + 0.5);
          if (e > 1) continue;
          const xx = (px + a + 64) % 32, yy = (py + bq + 64) % 32;
          const jas = bq < -r * 0.3 && a < 0 ? jasn(k, 0.35) : e > 0.7 ? cien(k, 0.82) : k;
          P(cx + xx, cy + yy, 1, 1, jas);
        }
        if (nm === 'pomidor' || nm === 'papryka' || nm === 'jablko' || nm === 'jablkoZ') P(cx + px, cy + ((py - r + 1 + 32) % 32), 1, 1, 0x3a7a2a);   // ogonek
      }
    });
  }
  // ---------- złożenie: RGB z płótna, A z maski ----------
  const d = g.getImageData(0, 0, AW, AH).data, dm = gm.getImageData(0, 0, AW, AH).data;
  const out = new Uint8Array(AW * AH * 4);
  for (let i = 0; i < AW * AH; i++) {
    out[i * 4] = d[i * 4]; out[i * 4 + 1] = d[i * 4 + 1]; out[i * 4 + 2] = d[i * 4 + 2]; out[i * 4 + 3] = dm[i * 4];
  }
  return out;
}
let _atlas = null;
export function atlasMarketu(THREE) {
  if (_atlas) return _atlas;
  const t = new THREE.DataTexture(rysujAtlas(), AW, AH, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;                 // piksele z bliska (jak postacie)…
  t.minFilter = THREE.LinearMipmapLinearFilter;      // …a z daleka bez migotania
  t.generateMipmaps = true; t.anisotropy = 4;
  t.needsUpdate = true;
  _atlas = t;
  return t;
}

// ============================== MATERIAŁ ==============================
// Światło wnętrza (liniowe): klucz z sufitu (lekko z boku — ściany różnią się pasmem), wypełnienie ciepłe.
export const SWIATLO = {
  kier: [0.36, 1.0, 0.22], klucz: 0xfff4e2, niebo: 0x9aa4b4, odbicie: 0x8a7a66, lampa: 0xfff6e6,
  sufit: 7.2,                                         // wysokość świetlówek nad posadzką (poza kadrem kamery)
  lampy: [5.0, 9.0, 1000, 0.55],                      // co ile w X, co ile w Z, długość (1000 = ciągła linia), szerokość
  posadzka: 0xece5da, spoina: 0xcdc3b4, pas: 0xd9cebd, listwa: 0xcf9c84, listwa2: 0x98c2b4,
};
const f3 = v => v.toFixed(4);
const vec3 = hex => { const c = lin(hex); return `vec3(${f3(c[0])}, ${f3(c[1])}, ${f3(c[2])})`; };
const SHADER_WSP = () => {
  const S = SWIATLO, [lx, lz, tl, tw] = S.lampy;
  return `
  float mkH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  // świetlówki pod sufitem: rzędy wzdłuż X co ${lx} j., rzędy co ${lz} j. w Z; w = rozmycie (odbicie matowe = szersze)
  // vd = kierunek patrzenia rzutowany na posadzkę, S = wydłużenie odbicia wzdłuż niego (połysk rozmywa się ku widzowi)
  float mkLampa(vec2 q, float w, vec2 vd, float S) {
    vec2 c = vec2(mod(q.x, ${f3(lx)}) - ${f3(lx / 2)}, mod(q.y, ${f3(lz)}) - ${f3(lz / 2)});
    float a = dot(c, vd); c += vd * (a / S - a);
    vec2 d = abs(c) - vec2(${f3(tl / 2)}, ${f3(tw / 2)});
    float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    return 1.0 - smoothstep(-w, w, sd);
  }
  // plama światła na posadzce pod świetlówką (miękka elipsa wzdłuż rzędu)
  float mkBasen(vec2 q) {
    vec2 c = vec2(mod(q.x, ${f3(lx)}) - ${f3(lx / 2)}, mod(q.y, ${f3(lz)}) - ${f3(lz / 2)});
    c *= vec2(${f3(tl > lx ? 0 : 0.36)}, 0.40);        // ciągłe linie świetlówek → jaśniejsze PASY pod nimi
    return exp(-dot(c, c));
  }
  `;
};

let _mat = null, _matSz = null;
// o.czas: { value } — sekundy (w grze windU z main.js)
// o.ciecie: { a: { value: Vector3 }, b: { value: Vector3 } } — wariant z PRZYCINANIEM: fragmenty w stożku wokół odcinka
//   kamera (a) → pierś gracza (b) znikają w kracie Bayera 4 × 4 (regał przed kamerą robi się ażurowy, gracz widoczny).
//   Osobny program (define MK_CIECIE) — main.js zakłada go tylko regałom w chunkach przy tym odcinku (discard psuje
//   wczesny test głębi na mobilnych GPU, więc reszta rysuje się bez niego — jak na osiedlu).
export function materialMarketu(THREE, o = {}) {
  if (_mat && !o.nowy) return _mat;
  const S = SWIATLO;
  const kat = DZIALY.map(d => new THREE.Vector3(...lin(d.k))), katJ = DZIALY.map(d => new THREE.Vector3(...lin(d.j)));
  const U = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uAtlas: { value: null }, uKat: { value: kat }, uKatJ: { value: katJ },
  }]);
  U.uAtlas.value = atlasMarketu(THREE);
  U.uCzas = o.czas || { value: 0 };
  if (o.ciecie) { U.uCutA = o.ciecie.a; U.uCutB = o.ciecie.b; }
  const L = S.kier, Ll = Math.hypot(...L);
  const mat = new THREE.ShaderMaterial({
    uniforms: U, vertexColors: true, fog: true, defines: o.ciecie ? { MK_CIECIE: '' } : {},
    extensions: { derivatives: true },
    vertexShader: `
      attribute vec4 aFx;
      uniform vec3 uKat[8]; uniform vec3 uKatJ[8];
      varying vec3 vKol; varying vec2 vUv; varying vec4 vFx; varying vec3 vWp; varying vec3 vN; varying vec3 vKatS; varying vec3 vKatJ;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        vec4 fx = vec4(aFx.xy * 0.01, aFx.zw);                     // atrybut Uint8: emisja/AO i połysk × 100
        float kat = fx.w, war = 0.0;
        #ifdef USE_INSTANCING_COLOR
          float stan = instanceColor.r; kat = instanceColor.g; war = instanceColor.b;
          // cienie kontaktowe regału: 1 = tylko gdy stoi, 2 = tylko gdy leży (w trakcie upadku żaden)
          if ((fx.w > 0.5 && fx.w < 1.5 && stan > 0.5) || (fx.w > 1.5 && fx.w < 2.5 && stan < 1.5) || (fx.w > 2.5 && (war < 0.5 || stan > 0.5))) p = vec3(0.0);
        #endif
        vec4 wp = vec4(p, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          n = mat3(instanceMatrix) * n;
        #endif
        wp = modelMatrix * wp;
        vN = mat3(modelMatrix) * n;
        vWp = wp.xyz;
        vec2 u = uv;
        int ki = int(clamp(kat, 0.0, 7.0) + 0.5);
        if (fx.z > 4.5 && fx.z < 5.5) { u.y += float(ki) * 0.125; u.x += war * 0.25; }   // towar: pas działu + wariant
        if (fx.z > 5.5) u.y += float(ki) * 0.125;                                          // piktogram działu
        vKatS = uKat[ki]; vKatJ = uKatJ[ki];
        vUv = u; vKol = color; vFx = fx;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D uAtlas; uniform float uCzas;
      varying vec3 vKol; varying vec2 vUv; varying vec4 vFx; varying vec3 vWp; varying vec3 vN; varying vec3 vKatS; varying vec3 vKatJ;
      #include <common>
      #include <fog_pars_fragment>
      ${SHADER_WSP()}
      // POSADZKA: płytki 1 j. (spoina 1 px atlasu przy 32 px/j.), lastryko, pasy głównych alejek co 40 j.
      vec3 mkPosadzka(vec2 p, vec3 odcien) {
        vec2 pq = (floor(p * 32.0) + 0.5) / 32.0;
        float fw = max(fwidth(p.x), fwidth(p.y)) * 32.0;             // teksele na piksel
        float det = 1.0 - smoothstep(0.8, 2.2, fw);                  // detal gaśnie, zanim zacząłby migotać
        vec2 lc = mod(pq + 20.0, 40.0) - 20.0;                       // współrzędne w chunku (0 = środek)
        float dx = 20.0 - abs(lc.x), dz = 20.0 - abs(lc.y);          // odległość od krawędzi chunka
        bool pas = min(dx, dz) < 3.0;
        vec3 baza = pas ? ${vec3(S.pas)} : ${vec3(S.posadzka)} * odcien;
        vec2 kaf = floor(pq);
        float ton = mkH(kaf * 1.37 + 3.1);
        baza *= 0.975 + 0.05 * ton;
        if (!pas && mod(kaf.x + kaf.y, 2.0) > 0.5) baza *= 0.975;   // delikatna szachownica
        // lastryko: drobiny 1 px i 2 px
        float h1 = mkH(floor(p * 32.0)), h2 = mkH(floor(p * 16.0) + 71.0);
        vec3 drob = h2 > 0.987 ? ${vec3(0xd9bcaa)} : h2 > 0.975 ? ${vec3(0xbccfc5)} : h1 > 0.94 ? baza * 0.92 : h1 < 0.03 ? min(baza * 1.05, vec3(1.0)) : baza;
        vec3 kol = mix(baza, drob, det * 0.6);
        // spoiny
        vec2 fr = fract(pq);
        float sp = (fr.x < 0.04 || fr.y < 0.04) ? 1.0 : 0.0;
        kol = mix(kol, ${vec3(S.spoina)} * (pas ? 0.97 : 1.0) * odcien, sp * det + (1.0 - det) * 0.07);
        // listwy przy pasach głównych alejek (poza skrzyżowaniem), dwa kolory na przemian co chunk
        float lx = step(2.62, dx) * step(dx, 2.94) * step(3.0, dz), lz = step(2.62, dz) * step(dz, 2.94) * step(3.0, dx);
        vec2 idc = floor((pq + 20.0) / 40.0);
        vec3 lk = mod(idc.x + idc.y, 2.0) > 0.5 ? ${vec3(S.listwa2)} : ${vec3(S.listwa)};
        kol = mix(kol, lk, max(lx, lz));
        return kol;
      }
      #ifdef MK_CIECIE
        uniform vec3 uCutA, uCutB;
        float mkBayer(vec2 f) {
          vec2 q = mod(floor(f), 4.0);                              // krata 4 × 4 (16 progów, bity x/y na przemian)
          return (mod(q.x, 2.0) * 8.0 + mod(q.y, 2.0) * 4.0 + floor(q.x / 2.0) * 2.0 + floor(q.y / 2.0) + 0.5) / 16.0;
        }
      #endif
      void main() {
        #ifdef MK_CIECIE
          vec3 ab = uCutB - uCutA;
          float tc = clamp(dot(vWp - uCutA, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
          if (tc > 0.04 && tc < 0.97) {
            float dc = length(vWp - (uCutA + ab * tc)), Rc = mix(0.35, 1.45, tc);   // stożek: węższy przy kamerze
            if (dc < Rc && mkBayer(gl_FragCoord.xy) > mix(0.22, 1.0, smoothstep(Rc * 0.55, Rc, dc))) discard;
          }
        #endif
        vec3 N = normalize(vN + vec3(0.0, 1e-5, 0.0));
        vec3 V = normalize(cameraPosition - vWp);
        float rodz = vFx.z, polysk = vFx.y, emis = 0.0, ao = 1.0;
        vec3 alb;
        bool podl = rodz > 0.5 && rodz < 2.5;
        if (podl) {
          alb = mkPosadzka(vWp.xz, vKol);
          ao = vFx.x;
          if (rodz > 1.5) {                                         // WODA: chłodniej, jaśniej przy brzegu (vKol.r)
            alb = mkPosadzka(vWp.xz, vec3(1.0)) * vec3(0.70, 0.83, 0.97);
            alb = mix(alb, ${vec3(0xeef8ff)}, vKol.r * vKol.r * 0.8);
          }
        } else {
          vec4 tx = texture2D(uAtlas, vUv);
          alb = tx.rgb;
          if (rodz > 2.5 && rodz < 3.5) alb = mix(alb, alb * vKatS, tx.a);
          else if (rodz > 3.5 && rodz < 4.5) alb = mix(alb, alb * vKatJ, tx.a);
          alb *= vKol;
          emis = vFx.x;
        }
        // --- światło: 3 pasma toon, chłodny ton cienia, wypełnienie niebo/odbicie od posadzki ---
        float nl = dot(N, vec3(${f3(L[0] / Ll)}, ${f3(L[1] / Ll)}, ${f3(L[2] / Ll)}));
        float b1 = smoothstep(-0.10, 0.06, nl), b2 = smoothstep(0.30, 0.46, nl);
        float pasmo = 0.62 + 0.22 * b1 + 0.18 * b2;
        vec3 ton = mix(vec3(0.86, 0.9, 1.05), vec3(1.0), b1);
        vec3 wyp = mix(${vec3(S.odbicie)}, ${vec3(S.niebo)}, N.y * 0.5 + 0.5);
        float basen = mkBasen(vWp.xz);
        vec3 sw = ${vec3(S.klucz)} * pasmo * ton * (1.0 + 0.13 * basen * (0.35 + 0.65 * max(N.y, 0.0))) + wyp * 0.16;
        vec3 kol = alb * sw * ao;
        // jasne pasmo na sylwetce: bryły odcinają się od posadzki i od hordy
        float rim = smoothstep(0.68, 0.94, 1.0 - max(dot(N, V), 0.0));
        if (!podl) kol += alb * rim * 0.10;
        kol += alb * emis;
        // --- ODBICIA świetlówek (posadzka, woda, szkło, metal skierowany w górę) ---
        if (polysk > 0.0) {
          vec3 Rf = reflect(-V, N);
          float fres = 0.16 + 0.84 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
          if (Rf.y > 0.03) {
            float t = (${f3(S.sufit)} + ${f3(1.55)} - vWp.y) / Rf.y;
            vec2 q = vWp.xz + Rf.xz * t;
            float w = mix(0.5, 0.06, polysk) + t * mix(0.035, 0.012, polysk);
            vec2 vd = normalize(V.xz + vec2(1e-4, 0.0));
            float l = mkLampa(q, w, vd, podl ? 2.0 : 1.0);
            // posadzka: miękki połysk (dwa progi z rozmytą krawędzią); rekwizyty: twarde toon w trzech progach
            l = podl ? smoothstep(0.08, 0.5, l) * 0.55 + smoothstep(0.55, 0.9, l) * 0.45 : floor(l * 3.0 + 0.4) / 3.0;
            kol += ${vec3(S.lampa)} * l * fres * polysk * (podl ? 0.85 : 1.4) * ao;
          }
          kol = mix(kol, ${vec3(0xf4efe6)}, fres * polysk * 0.10);   // jasny sufit w połysku
          if (!podl) {                                                // toon-błysk metalu w świetle klucza
            vec3 H = normalize(vec3(${f3(L[0] / Ll)}, ${f3(L[1] / Ll)}, ${f3(L[2] / Ll)}) + V);
            kol += smoothstep(0.93, 0.955, dot(N, H)) * polysk * 0.35;
          }
        }
        gl_FragColor = vec4(kol, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.userData.U = U;
  if (!o.nowy) _mat = mat;
  return mat;
}
// SZKŁO lad i FOLIA stretch (przezroczyste, bez zapisu głębi). color = odcień, aFx.x = krycie bazowe,
// aFx.y = połysk, aFx.z = 0 szkło / 1 folia (smugi w świecie).
export function materialSzkla(THREE) {
  if (_matSz) return _matSz;
  const S = SWIATLO, L = S.kier, Ll = Math.hypot(...L);
  const U = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
  _matSz = new THREE.ShaderMaterial({
    uniforms: U, vertexColors: true, fog: true, transparent: true, depthWrite: false,
    vertexShader: `
      attribute vec4 aFx;
      varying vec3 vKol; varying vec4 vFx; varying vec3 vWp; varying vec3 vN;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWp = wp.xyz; vN = mat3(modelMatrix) * normal; vKol = color; vFx = vec4(aFx.xy * 0.01, aFx.zw);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      varying vec3 vKol; varying vec4 vFx; varying vec3 vWp; varying vec3 vN;
      #include <common>
      #include <fog_pars_fragment>
      ${SHADER_WSP()}
      void main() {
        vec3 N = normalize(vN), V = normalize(cameraPosition - vWp);
        float ndv = abs(dot(N, V));
        float fres = 0.12 + 0.88 * pow(1.0 - ndv, 3.0);
        vec3 kol = vKol;
        float a = vFx.x + fres * 0.30;
        if (vFx.z > 0.5) {                                          // FOLIA: smugi naciągu po skosie
          float s = 0.5 + 0.5 * sin((vWp.x + vWp.z) * 7.0 + vWp.y * 11.0 + sin(vWp.y * 4.0 + vWp.x * 1.7) * 2.2);
          s = smoothstep(0.55, 0.95, s);
          kol = mix(kol, vec3(1.0), s * 0.6);
          a += s * 0.16;
        }
        float nl = dot(N, vec3(${f3(L[0] / Ll)}, ${f3(L[1] / Ll)}, ${f3(L[2] / Ll)}));
        kol *= 0.82 + 0.25 * smoothstep(-0.1, 0.4, nl);
        vec3 Rf = reflect(-V, N);
        if (Rf.y > 0.03) {
          float t = (${f3(S.sufit)} + ${f3(1.55)} - vWp.y) / Rf.y;
          float l = mkLampa(vWp.xz + Rf.xz * t, 0.08 + t * 0.012, vec2(1.0, 0.0), 1.0);
          l = floor(l * 3.0 + 0.4) / 3.0;
          kol += ${vec3(S.lampa)} * l * vFx.y;
          a += l * vFx.y * 0.6;
        }
        gl_FragColor = vec4(kol, clamp(a, 0.0, 0.92));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  return _matSz;
}

// ============================== BUDOWNICZY GEOMETRII (bez indeksu) ==============================
// Stos przekształceń 3×4, prymitywy w swoim układzie. Pudło z UV per ściana (tekstura czytana „od zewnątrz").
const FX0 = [0, 0, 0, 0];
class Bud {
  constructor() {
    this.P = []; this.N = []; this.C = []; this.U = []; this.F = [];
    this.M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]; this.S = []; this.fx = FX0;
  }
  get nv() { return this.P.length / 3; }
  push() { this.S.push([this.M.slice(), this.fx]); return this; }
  pop() { const [m, fx] = this.S.pop(); this.M = m; this.fx = fx; return this; }
  _mnoz(b) {
    const a = this.M, r = new Array(12);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++)
      r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + (j === 3 ? a[i * 4 + 3] : 0);
    this.M = r; return this;
  }
  tr(x, y, z) { return this._mnoz([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]); }
  rotX(a) { const c = Math.cos(a), s = Math.sin(a); return this._mnoz([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]); }
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return this._mnoz([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]); }
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return this._mnoz([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]); }
  efekt(e = 0, pol = 0, rodz = 0, w = 0) { this.fx = [e, pol, rodz, w]; return this; }
  _p(p) { const m = this.M, x = p[0], y = p[1], z = p[2]; return [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]]; }
  _n(n) {   // tylko obroty i skala jednorodna — wystarczy macierz 3×3
    const m = this.M, x = n[0], y = n[1], z = n[2];
    const nx = m[0] * x + m[1] * y + m[2] * z, ny = m[4] * x + m[5] * y + m[6] * z, nz = m[8] * x + m[9] * y + m[10] * z, l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  }
  _v(p, n, k, uv, fx) {
    this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.C.push(k[0], k[1], k[2]);
    this.U.push(uv[0], uv[1]); this.F.push(fx[0], fx[1], fx[2], fx[3]);
  }
  // czworokąt a-b-c-d (lokalnie, przeciwnie do wskazówek patrząc od strony normalnej n), uv = [u0, vDół, u1, vGóra]
  //   a = lewy dół, b = prawy dół, c = prawy góra, d = lewy góra (w widoku od strony normalnej)
  quad(a, b, c, d, n, k, uv = UV_BIALY, fx = this.fx, kc = null) {
    const A = this._p(a), B = this._p(b), C = this._p(c), D = this._p(d), nn = this._n(n);
    const ua = [uv[0], uv[1]], ub = [uv[2], uv[1]], uc = [uv[2], uv[3]], ud = [uv[0], uv[3]];
    const k2 = kc || k;
    // nawinięcie pilnuje się samo: gdy trójkąt ABC patrzy przeciwnie do zadanej normalnej, emitujemy A-C-B / A-D-C
    // (każdy narożnik zachowuje swoje uv i kolor — tekstura nie odwraca się)
    const e1x = B[0] - A[0], e1y = B[1] - A[1], e1z = B[2] - A[2], e2x = C[0] - A[0], e2y = C[1] - A[1], e2z = C[2] - A[2];
    const g = (e1y * e2z - e1z * e2y) * nn[0] + (e1z * e2x - e1x * e2z) * nn[1] + (e1x * e2y - e1y * e2x) * nn[2];
    if (g >= 0) {
      this._v(A, nn, k, ua, fx); this._v(B, nn, k, ub, fx); this._v(C, nn, k2, uc, fx);
      this._v(A, nn, k, ua, fx); this._v(C, nn, k2, uc, fx); this._v(D, nn, k2, ud, fx);
    } else {
      this._v(A, nn, k, ua, fx); this._v(C, nn, k2, uc, fx); this._v(B, nn, k, ub, fx);
      this._v(A, nn, k, ua, fx); this._v(D, nn, k2, ud, fx); this._v(C, nn, k2, uc, fx);
    }
    return this;
  }
  // prostopadłościan; o.kol / o.uv / o.fx = { px, nx, py, ny, pz, nz } per ściana; o.bez = ['ny', …]; o.gora = kolor górnych
  // wierzchołków ścian bocznych (tanie AO: dół ciemniej)
  pudlo(x0, y0, z0, x1, y1, z1, k, o = {}) {
    const kol = o.kol || {}, uv = o.uv || {}, fx = o.fx || {}, bez = o.bez || ['ny'];
    const K = s => kol[s] || k, UV = s => uv[s] || o.uvAll || UV_BIALY, FX = s => fx[s] || this.fx;
    const gora = o.dol ? (s => K(s)) : null;
    const dolK = s => (o.dol ? mn(K(s), o.dol) : K(s));
    if (!bez.includes('pz')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], dolK('pz'), UV('pz'), FX('pz'), gora && gora('pz'));
    if (!bez.includes('nz')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], dolK('nz'), UV('nz'), FX('nz'), gora && gora('nz'));
    if (!bez.includes('px')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], dolK('px'), UV('px'), FX('px'), gora && gora('px'));
    if (!bez.includes('nx')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], dolK('nx'), UV('nx'), FX('nx'), gora && gora('nx'));
    if (!bez.includes('py')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], K('py'), UV('py'), FX('py'));
    if (!bez.includes('ny')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], K('ny'), UV('ny'), FX('ny'));
    return this;
  }
  // walec / stożek ścięty wzdłuż Y (gładki bok), o.gora = denko (kolor o.kGora, uv o.uvGora)
  walec(r0, r1, y0, y1, seg, k, o = {}) {
    const dr = r0 - r1, h = y1 - y0, l = Math.hypot(dr, h) || 1, ny = dr / l, nr = h / l;
    const a0 = o.a0 || 0;
    for (let j = 0; j < seg; j++) {
      const t0 = a0 + TAU * j / seg, t1 = a0 + TAU * (j + 1) / seg;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      const A = this._p([c0 * r0, y0, s0 * r0]), B = this._p([c1 * r0, y0, s1 * r0]), C = this._p([c1 * r1, y1, s1 * r1]), D = this._p([c0 * r1, y1, s0 * r1]);
      const nA = this._n([c0 * nr, ny, s0 * nr]), nB = this._n([c1 * nr, ny, s1 * nr]);
      const uv = o.uv || UV_BIALY, u0 = uv[0] + (uv[2] - uv[0]) * j / seg, u1 = uv[0] + (uv[2] - uv[0]) * (j + 1) / seg;
      const kd = o.dol ? mn(k, o.dol) : k;
      // nawinięcie: patrząc z zewnątrz A(dół, t0) → D(góra, t0) → C → B jest przeciwne do wskazówek, gdy kąt rośnie ku −Z… liczymy normalną z trójkąta i odwracamy w razie potrzeby
      const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [D[0] - A[0], D[1] - A[1], D[2] - A[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const zew = cr[0] * nA[0] + cr[1] * nA[1] + cr[2] * nA[2] > 0 || (r0 < 1e-6 && r1 < 1e-6);
      const fx = this.fx;
      if (zew) {
        this._v(A, nA, kd, [u0, uv[1]], fx); this._v(B, nB, kd, [u1, uv[1]], fx); this._v(C, nB, k, [u1, uv[3]], fx);
        this._v(A, nA, kd, [u0, uv[1]], fx); this._v(C, nB, k, [u1, uv[3]], fx); this._v(D, nA, k, [u0, uv[3]], fx);
      } else {
        this._v(A, nA, kd, [u0, uv[1]], fx); this._v(C, nB, k, [u1, uv[3]], fx); this._v(B, nB, kd, [u1, uv[1]], fx);
        this._v(A, nA, kd, [u0, uv[1]], fx); this._v(D, nA, k, [u0, uv[3]], fx); this._v(C, nB, k, [u1, uv[3]], fx);
      }
      if (o.gora) {
        const kg = o.kGora || k, ug = o.uvGora || UV_BIALY, cu = (ug[0] + ug[2]) / 2, cv = (ug[1] + ug[3]) / 2, ru = (ug[2] - ug[0]) / 2, rv = (ug[3] - ug[1]) / 2;
        const O = this._p([0, y1, 0]), n = this._n([0, 1, 0]);
        const P1 = this._p([c0 * r1, y1, s0 * r1]), P2 = this._p([c1 * r1, y1, s1 * r1]);
        const e1b = [P1[0] - O[0], P1[1] - O[1], P1[2] - O[2]], e2b = [P2[0] - O[0], P2[1] - O[1], P2[2] - O[2]];
        const up = (e1b[2] * e2b[0] - e1b[0] * e2b[2]) * n[1] + (e1b[1] * e2b[2] - e1b[2] * e2b[1]) * n[0] + (e1b[0] * e2b[1] - e1b[1] * e2b[0]) * n[2];
        const q1 = [cu + c0 * ru, cv + s0 * rv], q2 = [cu + c1 * ru, cv + s1 * rv];
        if (up > 0) { this._v(O, n, kg, [cu, cv], fx); this._v(P1, n, kg, q1, fx); this._v(P2, n, kg, q2, fx); }
        else { this._v(O, n, kg, [cu, cv], fx); this._v(P2, n, kg, q2, fx); this._v(P1, n, kg, q1, fx); }
      }
    }
    return this;
  }
  // bryłka (warzywo, owoc): elipsoida seg × pier z gładkimi normalnymi; kolor dołu przyciemniony
  bulwa(rx, ry, rz, seg, pier, k, kDol = null, uvK = null) {
    const kd = kDol || mn(k, 0.72);
    const pt = (i, j) => {
      const f = -Math.PI / 2 + Math.PI * i / pier, t = TAU * j / seg;
      const c = Math.cos(f), s = Math.sin(f);
      return [[c * Math.cos(t) * rx, s * ry, c * Math.sin(t) * rz], [c * Math.cos(t), s, c * Math.sin(t)], (s + 1) / 2,
              uvK ? [uvK[0] + (c * Math.cos(t) * 0.5 + 0.5) * (uvK[2] - uvK[0]), uvK[3] + (c * Math.sin(t) * 0.5 + 0.5) * (uvK[1] - uvK[3])] : null];
    };
    for (let i = 0; i < pier; i++) for (let j = 0; j < seg; j++) {
      const a = pt(i, j), b = pt(i, j + 1), c = pt(i + 1, j + 1), d = pt(i + 1, j);
      const kk = h => miesz(kd, k, Math.min(1, h * 1.6));
      const V = q => [this._p(q[0]), this._n(q[1]), kk(q[2]), q[3] || UV_BIALY];
      const A = V(a), B = V(b), C = V(c), D = V(d);
      // kolejność a → d → c → b (patrząc z zewnątrz przeciwnie do wskazówek)
      if (i > 0) { this._v(A[0], A[1], A[2], A[3], this.fx); this._v(C[0], C[1], C[2], C[3], this.fx); this._v(B[0], B[1], B[2], B[3], this.fx); }
      if (i < pier - 1) { this._v(A[0], A[1], A[2], A[3], this.fx); this._v(D[0], D[1], D[2], D[3], this.fx); this._v(C[0], C[1], C[2], C[3], this.fx); }
    }
    return this;
  }
  // płaski prostokąt w XZ (góra), y stałe
  plaski(x0, z0, x1, z1, y, k, uv = UV_BIALY, fx = this.fx) {
    return this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], k, uv, fx);
  }
  dopisz(b) {                                          // dołącza gotowy Bud (już w tym samym układzie)
    for (const k of ['P', 'N', 'C', 'U', 'F']) { const src = b[k], dst = this[k]; for (let i = 0; i < src.length; i++) dst.push(src[i]); }
    return this;
  }
  geo(THREE) {
    const g = geoKwant(THREE, this.P, this.N, this.C, this.U, this.F, this.nv);
    g.computeBoundingSphere();
    return g;
  }
  tablice() {                                          // prefab: gotowe Float32Array do szybkiego wklejania
    return { P: new Float32Array(this.P), N: new Float32Array(this.N), C: new Float32Array(this.C), U: new Float32Array(this.U), F: new Float32Array(this.F), nv: this.nv };
  }
}
export { Bud };

// KWANTYZACJA: pozycja Float32, normalna Int8 (znormalizowana), kolor Uint8, uv Uint16, aFx Uint8 (x, y × 100; z, w wprost)
// → 26 B na wierzchołek zamiast 60 (cały market 9 × 9 chunków: ~20 MB → ~9 MB w GPU). Shader dekoduje aFx sam.
function geoKwant(THREE, P, N, C, U, F, n) {
  const g = new THREE.BufferGeometry();
  const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
  const N8 = new Int8Array(n * 3), C8 = new Uint8Array(n * 3), U16 = new Uint16Array(n * 2), F8 = new Uint8Array(n * 4);
  for (let i = 0; i < n * 3; i++) { N8[i] = Math.round(cl(N[i], -1, 1) * 127); C8[i] = Math.round(cl(C[i], 0, 1) * 255); }
  for (let i = 0; i < n * 2; i++) U16[i] = Math.round(cl(U[i], 0, 1) * 65535);
  for (let i = 0; i < n; i++) {
    F8[i * 4] = Math.round(cl(F[i * 4] * 100, 0, 255)); F8[i * 4 + 1] = Math.round(cl(F[i * 4 + 1] * 100, 0, 255));
    F8[i * 4 + 2] = F[i * 4 + 2]; F8[i * 4 + 3] = F[i * 4 + 3];
  }
  g.setAttribute('position', new THREE.BufferAttribute(P instanceof Float32Array ? P.slice(0, n * 3) : new Float32Array(P), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N8, 3, true));
  g.setAttribute('color', new THREE.BufferAttribute(C8, 3, true));
  g.setAttribute('uv', new THREE.BufferAttribute(U16, 2, true));
  g.setAttribute('aFx', new THREE.BufferAttribute(F8, 4, false));
  return g;
}

// CIEŃ KONTAKTOWY na posadzce (rodzaj 1 = wzór płytek; AO w aFx.x): wewnętrzny prostokąt ciemny,
// pierścień do 1 na zewnątrz — posadzka pod spodem jest liczona tym samym wzorem, więc bez szwu.
function cienKontaktowy(b, x0, z0, x1, z1, zas, sila, y = 0.008, w = 0, k = BIEL) {
  const ao = 1 - sila, fxI = [ao, 0.6, 1, w], fxO = [1, 0.6, 1, w];
  const X0 = x0 - zas, Z0 = z0 - zas, X1 = x1 + zas, Z1 = z1 + zas, n = [0, 1, 0];
  const v = (p, fx) => b._v(b._p(p), b._n(n), k, UV_BIALY, fx);
  const tri = (a, fa, c, fc, d, fd) => { v(a, fa); v(c, fc); v(d, fd); };
  const I = [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], O = [[X0, y, Z1], [X1, y, Z1], [X1, y, Z0], [X0, y, Z0]];
  tri(I[0], fxI, I[1], fxI, I[2], fxI); tri(I[0], fxI, I[2], fxI, I[3], fxI);
  for (let s = 0; s < 4; s++) {
    const a = I[s], bb = I[(s + 1) % 4], c = O[(s + 1) % 4], d = O[s];
    // pierścień: zewnętrzne wierzchołki „na zewnątrz" — nawinięcie jak wnętrze (patrząc z góry)
    tri(d, fxO, c, fxO, bb, fxI); tri(d, fxO, bb, fxI, a, fxI);
  }
}

// ============================== REGAŁ (moduł 4 j., instancje) ==============================
export const REGAL_DL = 4.0, REGAL_GL = 1.6, REGAL_WYS = 2.3;
let _geoRegalu = null;
export function geoRegalu(THREE) {
  if (_geoRegalu) return _geoRegalu;
  const b = new Bud(), HL = REGAL_DL / 2, D = REGAL_GL;
  const K = {
    cokol: lin(0x56687e), cokolG: lin(0x6f8298), polka: lin(0xf6f4ee), polkaD: lin(0xd8d4ca), bok: lin(0xe9edf1), bokK: lin(0xd2d9e0),
    nag: lin(0xf7f5ef), cienDz: lin(0x9a9098),
  };
  // --- cokół (listwa przypodłogowa, ciemny łupek) ---
  b.efekt(0, 0.1, 0);
  b.pudlo(-HL + 0.04, 0, -D + 0.05, HL - 0.04, 0.2, -0.05, K.cokol, { kol: { py: K.cokolG }, dol: 0.8 });
  // spód na całym obrysie: po upadku to on jest „czołem" wraku od strony podstawy (bez niego widać było wnętrze)
  b.quad([-HL, 0.003, -D], [HL, 0.003, -D], [HL, 0.003, 0], [-HL, 0.003, 0], [0, -1, 0], mn(K.cokol, 0.85));
  // --- plecy (płyta perforowana, jasny odcień działu) ---
  b.efekt(0, 0, 4);
  const uvP = uvR('perfo');
  b.pudlo(-HL + 0.04, 0.2, -0.835, HL - 0.04, 2.12, -0.765, BIEL, { uvAll: uvP, bez: ['ny', 'py'] });
  // --- półki + listwy z cenówkami (3 poziomy × 2 strony) ---
  const POZ = [0.70, 1.20, 1.70];
  const uvL = uvR('listwa'), uvLr = [uvL[2], uvL[1], uvL[0], uvL[3]];
  for (const ys of POZ) for (const s of [1, -1]) {
    const z0 = s > 0 ? -0.765 : -D + 0.03, z1 = s > 0 ? -0.03 : -0.835;
    b.efekt(0, 0.15, 0);
    b.pudlo(-HL + 0.04, ys - 0.035, z0, HL - 0.04, ys, z1, K.polka, { kol: { ny: K.polkaD } });
    b.efekt(0, 0.2, 3);
    const zr0 = s > 0 ? -0.03 : -D, zr1 = s > 0 ? 0 : -D + 0.03;
    b.pudlo(-HL + 0.04, ys - 0.09, zr0, HL - 0.04, ys + 0.008, zr1, BIEL, { uv: { pz: uvL, nz: uvL }, kol: { py: mn(BIEL, 0.95) } });
  }
  // --- TOWAR: 4 poziomy × 2 strony, po 2 bloki (różna głębokość frontu i wysokość) ---
  // pas atlasu: dół pasa = półka; wysokość bloku h ↔ dolne h/0,5 × 32 px pasa; okno 256 px (4 j.) od `s0` px
  const POZIOMY = [{ y0: 0.2, h: 0.46, pas: 0, s0: 0 }, { y0: 0.70, h: 0.44, pas: 1, s0: 128 }, { y0: 1.20, h: 0.44, pas: 0, s0: 256 }, { y0: 1.70, h: 0.40, pas: 1, s0: 64 }];
  const uvW = uvR('wierzch');
  for (const s of [1, -1]) for (const [li, P] of POZIOMY.entries()) {
    const s0 = s > 0 ? P.s0 : (P.s0 + 160) % 256;                       // plecy mają inne okno niż przód (okno + wariant ≤ 768 px)
    const zTyl = s > 0 ? -0.75 : -D + 0.85, dzieli = -0.2 + ((li * 37) % 5) * 0.12;
    for (const [bi, [xa, xb]] of [[-HL + 0.05, dzieli], [dzieli, HL - 0.05]].entries()) {
      const hh = P.h * (bi ? 0.93 : 1) - (li === 3 && bi ? 0.04 : 0);
      const zF = s > 0 ? -0.055 - (bi ? 0.05 : 0) : -D + 0.055 + (bi ? 0.05 : 0);
      const pxH = Math.round(hh / 0.5 * 32);
      // x → px atlasu (okno w pasie działu 0; shader dokłada dział i wariant)
      // plecy oglądane od −Z: w prawo = −X, więc u rośnie w stronę −X (tekstura nie jest lustrzana)
      const u = x => (s0 + (s > 0 ? x + HL : HL - x) * PXJ) / AW;
      const vDol = (P.pas * 32 + 32) / AH, vGora = (P.pas * 32 + 32 - pxH) / AH;
      const uvF = s > 0 ? [u(xa), vDol, u(xb), vGora] : [u(xb), vDol, u(xa), vGora];
      b.efekt(0, 0.06, 5);
      const z0 = s > 0 ? zTyl : zF, z1 = s > 0 ? zF : zTyl;
      b.pudlo(xa, P.y0, z0, xb, P.y0 + hh, z1, BIEL, { uv: s > 0 ? { pz: uvF } : { nz: uvF }, bez: ['ny', 'py', s > 0 ? 'nz' : 'pz'],
        kol: { px: K.cienDz, nx: K.cienDz }, fx: { px: [0, 0, 0, 0], nx: [0, 0, 0, 0] } });
      // wierzch towaru: pas pastelowych bloków (rodzaj 0 — nie przesuwa się z działem)
      b.efekt(0, 0.05, 0);
      b.plaski(xa, Math.min(z0, z1), xb, Math.max(z0, z1), P.y0 + hh, mn(BIEL, 0.92), uvW);
    }
  }
  // --- boczne ścianki (widać je w rzędzie jako słupki, na końcu rzędu jako bok) ---
  b.efekt(0, 0.12, 0);
  for (const sx of [-1, 1]) {
    const xa = sx > 0 ? HL - 0.045 : -HL, xb = sx > 0 ? HL : -HL + 0.045;
    b.pudlo(xa, 0, -D, xb, 2.14, 0, K.bok, { kol: { py: K.bokK, pz: K.bokK, nz: K.bokK }, dol: 0.85 });
    // czoło rzędu: pas działu pod nagłówkiem + piktogram działu (widać z głównej alejki)
    b.efekt(0, 0.1, 3);
    const xo = sx > 0 ? HL + 0.004 : -HL - 0.004;
    b.quad([xo, 1.9, -D + 0.08], [xo, 1.9, -0.08], [xo, 2.08, -0.08], [xo, 2.08, -D + 0.08], [sx, 0, 0], BIEL);
    b.efekt(0.05, 0, 6);
    const xi = sx > 0 ? HL + 0.008 : -HL - 0.008, zc = -D / 2;
    b.quad([xi, 1.52, zc - 0.17], [xi, 1.52, zc + 0.17], [xi, 1.86, zc + 0.17], [xi, 1.86, zc - 0.17], [sx, 0, 0], BIEL, uvR('ikona'));
    b.efekt(0, 0.12, 0);
  }
  // --- nagłówek: pas działu + etykieta bez tekstu + piktogram ---
  b.efekt(0, 0.1, 3);
  b.pudlo(-HL, 2.12, -D, HL, 2.3, 0, BIEL, { fx: { py: [0, 0.15, 4, 0] }, kol: { py: mn(BIEL, 0.8) } });
  const uvE = uvR('etykieta'), uvI = uvR('ikona');
  for (const s of [1, -1]) {
    const z = s > 0 ? 0.004 : -D - 0.004, n = [0, 0, s];
    const Q = (xa, xb, ya, yb, k, uv, fx) => s > 0 ? b.quad([xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z], n, k, uv, fx)
                                                   : b.quad([xb, ya, z], [xa, ya, z], [xa, yb, z], [xb, yb, z], n, k, uv, fx);
    Q(-0.7, 0.9, 2.155, 2.265, BIEL, uvE, [0, 0.05, 0, 0]);
    Q(-1.02, -0.84, 2.13, 2.29, BIEL, uvI, [0.05, 0, 6, 0]);
  }
  // --- ZAPAS na regale: kartony z towarem na wierzchu (aFx.w = 3: tylko wariant 1 i tylko stojący regał) ---
  // Z kamery gry wierzch regału to największa płaszczyzna w kadrze — sam pastelowy blat wyglądał jak pusta deska.
  {
    const uvs = [uvR('karton'), uvR('nadruk0'), uvR('karton2'), uvR('nadruk1')], uvT = uvR('kartonWierzch');
    const plan = [[-1.72, -1.02, 0.46, 0.62], [-0.9, -0.05, 0.34, 0.7], [0.55, 1.2, 0.5, 0.6], [0.62, 1.12, 0.3, 0.5]];
    for (const [i, [xa, xb, h, d]] of plan.entries()) {
      const y0 = i === 3 ? 2.3 + 0.5 : 2.3, zc = -D / 2 + (i === 1 ? 0.12 : -0.06);
      b.efekt(0, 0.04, 0, 3);
      b.pudlo(xa, y0, zc - d / 2, xb, y0 + h, zc + d / 2, mn(BIEL, 0.95 + i * 0.02), { uvAll: uvs[i], uv: { py: uvT }, dol: 0.86 });
    }
  }
  // --- cienie kontaktowe: stojący (płasko pod podstawą) i leżący (po obrocie o 90° wokół X leży na posadzce) ---
  b.efekt(0, 0, 0);
  cienKontaktowy(b, -HL - 0.02, -D - 0.02, HL + 0.02, 0.02, 0.85, 0.42, 0.008, 1);
  b.push().rotX(-Math.PI / 2);                        // układ, który po upadku (rotX +90°) jest poziomy
  // w tym układzie „y" świata po upadku = −z lokalne → płaszczyzna z = −0,008; zasięg wzdłuż upadku = y lokalne 0..2,35
  cienKontaktowy(b, -HL - 0.15, -0.05, HL + 0.15, 2.36, 0.8, 0.40, 0.008, 2);
  b.pop();
  _geoRegalu = b.geo(THREE);
  return _geoRegalu;
}

// ============================== REKWIZYTY (prefaby) ==============================
const KOL = {
  drewno: lin(0xe2bb82), drewnoC: lin(0xb88a52), drewnoJ: lin(0xf0d4a4), metal: lin(0xc9d2dc), metalC: lin(0x7c8896),
  biel: lin(0xf4f2ec), bielC: lin(0xd8dde3), lupek: lin(0x56687e), czerw: lin(0xe0473c), czerwC: lin(0xa83028), nieb: lin(0x6fb3d8),
  zolty: lin(0xf5c542), ziel: lin(0x5ab04a), gum: lin(0x2e3338), wnetrze: lin(0xa8d8f0), lod: lin(0xe6f6ff), kraft: lin(0xd6a870),
};
// warzywa i owoce: [kolor, kolor dołu, rx, ry, rz, kształt]
const WARZ = {
  pomidor: [0xee4a3a, 0xb52d24, 0.13, 0.11, 0.13], jablko: [0xe8483a, 0x9a2a22, 0.12, 0.11, 0.12], jablkoZ: [0x9ad04a, 0x5a9a2a, 0.12, 0.11, 0.12],
  pomarancza: [0xf59a2a, 0xc8661a, 0.13, 0.12, 0.13], cytryna: [0xf5dc42, 0xc8a82a, 0.11, 0.09, 0.08], papryka: [0xffcf3a, 0xe89a1c, 0.12, 0.13, 0.12],
  salata: [0x9ee06a, 0x4f9a38, 0.19, 0.13, 0.19], baklazan: [0x7a44a8, 0x4a2a70, 0.09, 0.09, 0.2], ziemniak: [0xc89a5a, 0x8a6a3a, 0.12, 0.09, 0.1],
  cebula: [0xe8b060, 0xb07a38, 0.12, 0.12, 0.12], marchew: [0xf6922e, 0xd8661c, 0.06, 0.06, 0.22], banan: [0xf5d542, 0xb8a02a, 0.07, 0.06, 0.24],
};
const WARZ_LISTA = Object.keys(WARZ);
// KOPIEC: spłaszczona bryła z teksturą „dużo warzyw" (komórka atlasu, rzut z góry) + kilka bulw na wierzchu
// dla sylwetki — dawniej 10–15 osobnych bulw na skrzynkę (stoisko 7 tys. wierzchołków, hala warzyw 106 tys. na chunk)
const this_fx = b => b.fx;
function kopiec(b, R, x, y, z, w, d, rodzaj, n = 3) {
  const [k, kd, rx, ry, rz] = WARZ[rodzaj], K = lin(k), KD = lin(kd);
  const idx = WARZ_LISTA.indexOf(rodzaj), [ax, ay] = RG.warzywa;
  const uvK = [(ax + (idx % 6) * 32 + 1) / AW, (ay + Math.floor(idx / 6) * 32 + 31) / AH, (ax + (idx % 6) * 32 + 31) / AW, (ay + Math.floor(idx / 6) * 32 + 1) / AH];
  b.push().tr(x, y, z);
  b.bulwa(w * 0.5, 0.07 + ry * 0.45, d * 0.5, 7, 3, BIEL, mn(BIEL, 0.7), uvK);
  for (let i = 0; i < n; i++) {
    const px = (R() - 0.5) * (w - rx * 2), pz = (R() - 0.5) * (d - rz * 1.6), py = 0.06 + ry * 0.6 + R() * 0.03;
    b.push().tr(px, py, pz).rotY(R() * TAU);
    b.bulwa(rx, ry, rz, 5, 3, mn(K, 0.95 + R() * 0.1), KD);
    b.pop();
  }
  b.pop();
}
// skrzynka z warzywami (w × d × h), otwarta, boki z atlasu
function skrzynka(b, R, x, y, z, w, d, h, rodzaj, nach = 0) {
  b.push().tr(x, y, z).rotX(nach);
  const uvS = uvR('skrzynka');
  b.efekt(0, 0, 0);
  b.pudlo(-w / 2, 0, -d / 2, w / 2, h, d / 2, BIEL, { uv: { pz: uvS, nz: uvS, px: uvS, nx: uvS }, bez: ['ny', 'py'], dol: 0.85 });
  b.pudlo(-w / 2 + 0.03, 0.02, -d / 2 + 0.03, w / 2 - 0.03, h - 0.1, d / 2 - 0.03, lin(0x5a3a1e), { bez: ['ny', 'pz', 'nz', 'px', 'nx'] });
  kopiec(b, R, 0, h - 0.08, 0, w - 0.08, d - 0.08, rodzaj, Math.min(4, Math.round(w * d * 3) + 1));
  b.pop();
}
function paletaBaza(b, w, d, h = 0.15) {
  const uvP = uvR('paleta');
  b.efekt(0, 0, 0);
  b.pudlo(-w / 2, 0, -d / 2, w / 2, h, d / 2, BIEL, { uv: { pz: uvP, nz: uvP, px: uvP, nx: uvP }, kol: { py: KOL.drewnoJ } });
}
const PREFABY = {
  // PALETA z kartonami w folii (szkło: folia)
  paleta(b, sz, o, R) {
    const { w, d } = o;
    paletaBaza(b, w, d);
    const nx = 2, nz = 2, war = o.war % 4;
    const uvB = [uvR('karton'), uvR('nadruk0'), uvR('nadruk1'), uvR('karton2')][war], uvT = uvR('kartonWierzch');
    const cw = (w - 0.1) / nx, cd = (d - 0.1) / nz, ch = 0.4;
    for (let l = 0; l < 2; l++) for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x0 = -w / 2 + 0.05 + i * cw, z0 = -d / 2 + 0.05 + j * cd, y0 = 0.15 + l * ch;
      const j1 = (R() - 0.5) * 0.03;
      b.pudlo(x0 + 0.01 + j1, y0, z0 + 0.01, x0 + cw - 0.01 + j1, y0 + ch - 0.005, z0 + cd - 0.01, mn(BIEL, 0.96 + R() * 0.06),
        { uvAll: uvB, uv: { py: uvT }, dol: 0.9 });
    }
    // folia: pudło 2 cm większe od stosu, bez dna
    const fb = { x0: -w / 2 + 0.03, x1: w / 2 - 0.03, z0: -d / 2 + 0.03, z1: d / 2 - 0.03, y0: 0.12, y1: 0.15 + 2 * ch + 0.03 };
    sz.efekt(0.06, 0.7, 1);
    sz.pudlo(fb.x0, fb.y0, fb.z0, fb.x1, fb.y1, fb.z1, lin(0xeef4f8), { bez: ['ny'] });
  },
  // PALETA z luźnymi kartonami (bez folii), stos nierówny
  kartony(b, sz, o, R) {
    const { w, d } = o;
    paletaBaza(b, w, d);
    const uvT = uvR('kartonWierzch');
    const uvs = [uvR('karton'), uvR('nadruk0'), uvR('karton2')];
    const plan = [[-0.55, -0.42, 1.1, 0.8, 0.42], [0.58, -0.42, 1.0, 0.8, 0.4], [-0.55, 0.45, 1.1, 0.8, 0.45], [0.58, 0.42, 1.0, 0.8, 0.38],
                  [-0.5, 0, 1.0, 1.5, 0.36], [0.55, 0.0, 0.95, 1.4, 0.3]];
    for (const [k, [px, pz, cw, cd, ch]] of plan.entries()) {
      const y0 = k < 4 ? 0.15 : 0.15 + 0.4;
      if (k >= 4 && R() < 0.3) continue;
      const sx = w / 2.4, sd = d / 1.8;
      b.push().tr(px * sx, y0, pz * sd).rotY((R() - 0.5) * 0.12);
      b.pudlo(-cw / 2 * sx + 0.02, 0, -cd / 2 * sd + 0.02, cw / 2 * sx - 0.02, ch, cd / 2 * sd - 0.02, mn(BIEL, 0.95 + R() * 0.08),
        { uvAll: uvs[(k + o.war) % 3], uv: { py: uvT }, dol: 0.88 });
      b.pop();
    }
  },
  // WYSPA CHŁODNICZA: biała obudowa z niebieskim pasem, oświetlone wnętrze z mrożonkami, szklane pokrywy
  lada(b, sz, o, R) {
    const { w, d } = o, H = 1.18, uvB = uvR('lada');
    b.efekt(0, 0.1, 0);
    b.pudlo(-w / 2 + 0.06, 0, -d / 2 + 0.06, w / 2 - 0.06, 0.14, d / 2 - 0.06, KOL.lupek, { bez: ['ny', 'py'] });
    b.pudlo(-w / 2, 0.12, -d / 2, w / 2, H, d / 2, BIEL, { uv: { pz: uvB, nz: uvB, px: uvB, nx: uvB }, bez: ['ny', 'py'], dol: 0.92 });
    // rant (aluminium) — cztery listwy wokół otworu
    const t = 0.1;
    b.efekt(0, 0.55, 0);
    b.pudlo(-w / 2, H, -d / 2, w / 2, H + 0.06, -d / 2 + t, KOL.metal);
    b.pudlo(-w / 2, H, d / 2 - t, w / 2, H + 0.06, d / 2, KOL.metal);
    b.pudlo(-w / 2, H, -d / 2 + t, -w / 2 + t, H + 0.06, d / 2 - t, KOL.metal);
    b.pudlo(w / 2 - t, H, -d / 2 + t, w / 2, H + 0.06, d / 2 - t, KOL.metal);
    b.pudlo(-w / 2 + t, H, -0.04, w / 2 - t, H + 0.28, 0.04, KOL.metal);           // grzbiet pośrodku (pokrywy opierają się o niego)
    // wnętrze: jasny, zimny, świecący lej
    const Y0 = 0.72;
    b.efekt(0.3, 0, 0);
    b.plaski(-w / 2 + t, -d / 2 + t, w / 2 - t, d / 2 - t, Y0, lin(0x7cc4ea));
    b.efekt(0.22, 0, 0);
    // ściany leja od środka (normalne do wnętrza — widać je od góry przez szkło)
    const iw = w / 2 - t, id = d / 2 - t;
    b.quad([iw, Y0, -id], [-iw, Y0, -id], [-iw, H, -id], [iw, H, -id], [0, 0, 1], mn(KOL.lod, 0.9)).quad([-iw, Y0, id], [iw, Y0, id], [iw, H, id], [-iw, H, id], [0, 0, -1], mn(KOL.lod, 0.95));
    b.quad([-iw, Y0, -id], [-iw, Y0, id], [-iw, H, id], [-iw, H, -id], [1, 0, 0], mn(KOL.lod, 0.92)).quad([iw, Y0, id], [iw, Y0, -id], [iw, H, -id], [iw, H, id], [-1, 0, 0], mn(KOL.lod, 0.92));
    // mrożonki: kilka warstw płaskich pudełek (wierzchy z atlasu), lekko świecą chłodem
    b.efekt(0.08, 0.05, 0);
    const [mx, my] = RG.mrozonki;
    // gęsto, w dwóch warstwach po obu stronach grzbietu (jak w prawdziwej wyspie)
    for (let i = 0; i < 24; i++) {
      const strona = i & 1 ? 1 : -1, rz = Math.floor(i / 2) % 2;
      const px = -iw + 0.3 + ((Math.floor(i / 4) + R() * 0.3) / 6) * (2 * iw - 0.6), pz = strona * (0.24 + rz * 0.38 + R() * 0.06);
      const cw = 0.55 + R() * 0.2, cd = 0.34 + R() * 0.08, ch = 0.08 + R() * 0.07, py = Y0 + 0.02 + (i % 3) * 0.05 + R() * 0.03;
      const ci = Math.floor(R() * 32), uvT = [(mx + (ci % 8) * 16 + 1) / AW, (my + Math.floor(ci / 8) * 16 + 15) / AH, (mx + (ci % 8) * 16 + 15) / AW, (my + Math.floor(ci / 8) * 16 + 1) / AH];
      // tylko wierzch + bok od strony szyby (reszta i tak siedzi w stosie) — 12 wierzchołków zamiast 30
      b.push().tr(px, py, pz).rotY((R() - 0.5) * 0.6);
      b.pudlo(-cw / 2, 0, -cd / 2, cw / 2, ch, cd / 2, mn(BIEL, 0.97), { uv: { py: uvT }, kol: { pz: lin(0xe8eef4), nz: lin(0xd8e0e8) },
        bez: ['ny', 'px', 'nx', strona > 0 ? 'nz' : 'pz'] });
      b.pop();
    }
    // tabliczka działu na czołach (bez tekstu)
    b.efekt(0.1, 0.1, 0);
    for (const s of [-1, 1]) {
      const x = s * (w / 2 + 0.005), uvG = uvR('etykieta');
      if (s > 0) b.quad([x, 0.62, 0.55], [x, 0.62, -0.55], [x, 0.92, -0.55], [x, 0.92, 0.55], [1, 0, 0], BIEL, uvG);
      else b.quad([x, 0.62, -0.55], [x, 0.62, 0.55], [x, 0.92, 0.55], [x, 0.92, -0.55], [-1, 0, 0], BIEL, uvG);
    }
    // SZKŁO: dwie pochyłe pokrywy od rantu do grzbietu (+ lekko świecące przez emisję wnętrza)
    sz.efekt(0.12, 1.0, 0);
    const yR = H + 0.06, yG = H + 0.28, szK = lin(0xcfeefa);
    sz.quad([-w / 2 + t, yR, d / 2 - t], [w / 2 - t, yR, d / 2 - t], [w / 2 - t, yG, 0.04], [-w / 2 + t, yG, 0.04], [0, 0.95, 0.3], szK);
    sz.quad([w / 2 - t, yR, -d / 2 + t], [-w / 2 + t, yR, -d / 2 + t], [-w / 2 + t, yG, -0.04], [w / 2 - t, yG, -0.04], [0, 0.95, -0.3], szK);
  },
  // KASA: lada z taśmą, terminal z ekranem, słupek z lampką stanowiska
  kasa(b, sz, o, R) {
    const { w, d } = o, H = 0.9, uvT = uvR('tasma'), uvE = uvR('ekran');
    const front = o.war ? lin(0x7fc4b4) : lin(0x8fb8e0);
    b.efekt(0, 0.1, 0);
    b.pudlo(-w / 2 + 0.04, 0, -d / 2 + 0.04, w / 2 - 0.04, 0.12, d / 2 - 0.04, KOL.lupek, { bez: ['ny', 'py'] });
    b.pudlo(-w / 2, 0.1, -d / 2, w / 2, H, d / 2, KOL.biel, { kol: { px: front, nx: front, py: KOL.bielC }, dol: 0.86 });
    // taśma (lekki połysk gumy) z rolkami na końcach
    b.efekt(0, 0.25, 0);
    b.pudlo(-w / 2 + 0.12, H, -d / 2 + 0.1, w / 2 - 0.12, H + 0.04, d / 2 - 1.15, BIEL, { uv: { py: uvT } });
    b.efekt(0, 0.6, 0);
    b.pudlo(-w / 2 + 0.06, H, -d / 2 + 0.05, w / 2 - 0.06, H + 0.06, -d / 2 + 0.1, KOL.metal);
    // separator na taśmie (kolor stanowiska)
    b.efekt(0, 0.2, 0);
    b.pudlo(-0.3, H + 0.04, -0.6, 0.3, H + 0.1, -0.52, o.war ? KOL.zolty : KOL.czerw);
    // strefa kasjera: niższy blat z terminalem, ekran świeci
    b.efekt(0, 0.1, 0);
    b.pudlo(-w / 2 + 0.05, H, d / 2 - 1.1, w / 2 - 0.05, H + 0.18, d / 2 - 0.55, KOL.bielC);
    b.pudlo(-0.12, H + 0.18, d / 2 - 0.95, 0.12, H + 0.3, d / 2 - 0.75, KOL.lupek);
    b.push().tr(0.05, H + 0.3, d / 2 - 0.85).rotX(-0.35);
    b.pudlo(-0.22, 0, -0.03, 0.22, 0.28, 0.03, KOL.gum);
    b.efekt(0.9, 0, 0);
    b.quad([-0.19, 0.03, -0.035], [0.19, 0.03, -0.035], [0.19, 0.25, -0.035], [-0.19, 0.25, -0.035], [0, 0, -1], BIEL, [uvE[2], uvE[1], uvE[0], uvE[3]]);
    b.pop();
    // półka na zakupy za kasą (niżej)
    b.efekt(0, 0.15, 0);
    b.pudlo(-w / 2, 0.55, d / 2 - 0.5, w / 2, 0.62, d / 2, KOL.metal);
    // słupek z lampką stanowiska (numer kasy = kolor, bez cyfr)
    b.efekt(0, 0.5, 0);
    b.push().tr(w / 2 - 0.1, H, -d / 2 + 0.25).walec(0.035, 0.035, 0, 1.25, 6, KOL.metal).pop();
    b.efekt(0.85, 0, 0);
    b.pudlo(w / 2 - 0.24, H + 1.2, -d / 2 + 0.12, w / 2 + 0.04, H + 1.46, -d / 2 + 0.38, o.war ? lin(0xffe070) : lin(0x9ae8ff), { bez: [] });
  },
  // WÓZEK: kosz z siatki (widać wnętrze), rama, kółka, rączka w kolorze sklepu
  wozek(b, sz, o, R) {
    PREFABY._wozek(b, o.war);
  },
  _wozek(b, war = 0, dz = 0) {
    const uvS = uvR('siatka'), H0 = 0.42, H1 = 1.0, W = 0.9, L0 = -0.72, L1 = 0.7;
    b.push().tr(0, 0, dz);
    b.efekt(0, 0.5, 0);
    // kółka
    for (const [x, z] of [[-0.33, -0.6], [0.33, -0.6], [-0.3, 0.6], [0.3, 0.6]]) {
      b.push().tr(x, 0.07, z).rotZ(Math.PI / 2).walec(0.07, 0.07, -0.03, 0.03, 6, KOL.gum, { gora: true, kGora: KOL.metalC }).pop();
    }
    // podwozie
    b.pudlo(-0.36, 0.13, -0.66, 0.36, 0.17, 0.66, KOL.metal);
    b.pudlo(-0.38, 0.17, 0.5, -0.33, H0, 0.56, KOL.metal); b.pudlo(0.33, 0.17, 0.5, 0.38, H0, 0.56, KOL.metal);
    b.pudlo(-0.38, 0.17, -0.62, -0.33, H0, -0.56, KOL.metal); b.pudlo(0.33, 0.17, -0.62, 0.38, H0, -0.56, KOL.metal);
    // kosz: boki siatki z zewnątrz i od środka (dno też) — lekko rozszerzony ku górze
    b.efekt(0, 0.45, 0);
    const k = mn(BIEL, 1.0), kW = mn(BIEL, 0.78);
    const Wd = W / 2 - 0.06, Wg = W / 2;
    const S = (a, bb, c, d2, n, kk) => b.quad(a, bb, c, d2, n, kk, uvS);
    // przód (+z) i tył
    S([-Wd, H0, L1 - 0.06], [Wd, H0, L1 - 0.06], [Wg, H1, L1], [-Wg, H1, L1], [0, 0.1, 1], k);
    S([Wd, H0, L1 - 0.06], [-Wd, H0, L1 - 0.06], [-Wg, H1, L1], [Wg, H1, L1], [0, -0.1, -1], kW);
    S([Wd, H0, L0 + 0.1], [-Wd, H0, L0 + 0.1], [-Wg, H1, L0], [Wg, H1, L0], [0, 0.1, -1], k);
    S([-Wd, H0, L0 + 0.1], [Wd, H0, L0 + 0.1], [Wg, H1, L0], [-Wg, H1, L0], [0, -0.1, 1], kW);
    // boki
    S([Wd, H0, L1 - 0.06], [Wd, H0, L0 + 0.1], [Wg, H1, L0], [Wg, H1, L1], [1, 0.1, 0], k);
    S([Wd, H0, L0 + 0.1], [Wd, H0, L1 - 0.06], [Wg, H1, L1], [Wg, H1, L0], [-1, -0.1, 0], kW);
    S([-Wd, H0, L0 + 0.1], [-Wd, H0, L1 - 0.06], [-Wg, H1, L1], [-Wg, H1, L0], [-1, 0.1, 0], k);
    S([-Wd, H0, L1 - 0.06], [-Wd, H0, L0 + 0.1], [-Wg, H1, L0], [-Wg, H1, L1], [1, -0.1, 0], kW);
    // dno
    b.quad([-Wd, H0 + 0.01, L1 - 0.06], [Wd, H0 + 0.01, L1 - 0.06], [Wd, H0 + 0.01, L0 + 0.1], [-Wd, H0 + 0.01, L0 + 0.1], [0, 1, 0], kW, uvS);
    // górna rama (pręty) + rączka
    b.efekt(0, 0.6, 0);
    b.pudlo(-Wg - 0.01, H1 - 0.02, L1 - 0.02, Wg + 0.01, H1 + 0.02, L1 + 0.02, KOL.metal);
    b.pudlo(-Wg - 0.01, H1 - 0.02, L0 - 0.02, Wg + 0.01, H1 + 0.02, L0 + 0.02, KOL.metal);
    b.pudlo(-Wg - 0.02, H1 - 0.02, L0, -Wg + 0.02, H1 + 0.02, L1, KOL.metal);
    b.pudlo(Wg - 0.02, H1 - 0.02, L0, Wg + 0.02, H1 + 0.02, L1, KOL.metal);
    b.efekt(0, 0.35, 0);
    const kr = war ? lin(0x3f8fe0) : KOL.czerw;
    b.pudlo(-Wg + 0.02, H1 + 0.02, L0 - 0.14, Wg - 0.02, H1 + 0.08, L0 - 0.06, kr, { bez: [] });
    b.pudlo(-Wg + 0.04, H1 - 0.06, L0 - 0.1, -Wg + 0.08, H1 + 0.02, L0, KOL.metal); b.pudlo(Wg - 0.08, H1 - 0.06, L0 - 0.1, Wg - 0.04, H1 + 0.02, L0, KOL.metal);
    // klapka fotelika dziecka (kolor sklepu)
    b.pudlo(-0.3, H1 - 0.3, L0 + 0.12, 0.3, H1 - 0.02, L0 + 0.15, kr);
    b.pop();
  },
  // RZĄD WÓZKÓW wsuniętych jeden w drugi (wzdłuż Z)
  wozki(b, sz, o, R) {
    const n = o.n || 5, d = o.d;
    for (let i = 0; i < n; i++) PREFABY._wozek(b, (i === n - 1 && o.war) ? 1 : 0, -d / 2 + 0.78 + i * 0.42);
  },
  // KOSZ PROMOCYJNY: siatka + góra towaru + gwiazda promocji na tyczce
  kosz(b, sz, o, R) {
    const { w, d } = o, H = 0.78, uvS = uvR('siatka'), uvG = uvR('gwiazda');
    b.efekt(0, 0.4, 0);
    b.pudlo(-w / 2, 0, -d / 2, w / 2, H, d / 2, BIEL, { uvAll: uvS, bez: ['ny', 'py'], dol: 0.8 });
    b.pudlo(-w / 2 - 0.02, H - 0.03, -d / 2 - 0.02, w / 2 + 0.02, H + 0.02, d / 2 + 0.02, KOL.metal, { bez: ['ny'] });
    // towar: kopiec kolorowych paczek
    b.efekt(0, 0.08, 0);
    const kol = [0xe0433a, 0xf5c542, 0x3a8ad8, 0x5ab04a, 0xe86a9a, 0xf28c3a].map(lin);
    b.plaski(-w / 2 + 0.03, -d / 2 + 0.03, w / 2 - 0.03, d / 2 - 0.03, H - 0.12, lin(0x8a6a8a));
    for (let i = 0; i < 16; i++) {
      const cw = 0.18 + R() * 0.14, cd = 0.12 + R() * 0.12, ch = 0.08 + R() * 0.1;
      const px = (R() - 0.5) * (w - 0.35), pz = (R() - 0.5) * (d - 0.3), py = H - 0.14 + R() * 0.12;
      const k = kol[Math.floor(R() * kol.length)];
      b.push().tr(px, py, pz).rotY(R() * TAU).rotX((R() - 0.5) * 0.5);
      b.pudlo(-cw / 2, 0, -cd / 2, cw / 2, ch, cd / 2, k, { kol: { py: mn(k, 1.12) }, bez: ['ny'] });
      b.pop();
    }
    // gwiazda promocji na tyczce (ozdoba, bez kolizji)
    b.efekt(0, 0.5, 0);
    b.push().tr(w / 2 - 0.12, H, 0).walec(0.02, 0.02, 0, 0.62, 5, KOL.metal).pop();
    b.efekt(0.12, 0, 0);
    PREFABY._gwiazda(b, uvG, w / 2 - 0.12, H + 0.72, 0, 0.26);
  },
  _gwiazda(b, uvG, x, y, z, r) {
    // dwustronna tabliczka zwrócona w +Z i −Z
    b.quad([x - r, y - r, z + 0.012], [x + r, y - r, z + 0.012], [x + r, y + r, z + 0.012], [x - r, y + r, z + 0.012], [0, 0, 1], BIEL, uvG);
    b.quad([x + r, y - r, z - 0.012], [x - r, y - r, z - 0.012], [x - r, y + r, z - 0.012], [x + r, y + r, z - 0.012], [0, 0, -1], BIEL, uvG);
  },
  // PIRAMIDA PUSZEK na palecie: warstwy-pudła z atlasu (fronty puszek z boków, denka z góry)
  piramida(b, sz, o, R) {
    const { w, d } = o;
    paletaBaza(b, w, d, 0.14);
    // bloki 2 × 2 puszki (0,4 × 0,4 j.): fronty = połowa pasa „puszki", wierzch = 2 × 2 denka; warstwy 4², 3², 2², 1
    const [fx0, fy0] = RG.puszki, [dx0, dy0] = RG.denka;
    let y = 0.14;
    b.efekt(0, 0.35, 0);
    for (let n = 4; n >= 1; n--) {
      const h = 0.27, s = n * 0.4, y1 = y + h, e = s / 2;
      for (let i = 0; i < n; i++) {
        const pol = (i + n) & 1, a0 = -e + i * 0.4, a1 = a0 + 0.4;
        const uvF = [(fx0 + pol * 32) / AW, (fy0 + 32) / AH, (fx0 + pol * 32 + 32) / AW, fy0 / AH];
        const kd = mn(BIEL, 0.88);
        b.quad([a0, y, e], [a1, y, e], [a1, y1, e], [a0, y1, e], [0, 0, 1], kd, uvF, this_fx(b), BIEL);
        b.quad([a1, y, -e], [a0, y, -e], [a0, y1, -e], [a1, y1, -e], [0, 0, -1], kd, uvF, this_fx(b), BIEL);
        b.quad([e, y, a1], [e, y, a0], [e, y1, a0], [e, y1, a1], [1, 0, 0], kd, uvF, this_fx(b), BIEL);
        b.quad([-e, y, a0], [-e, y, a1], [-e, y1, a1], [-e, y1, a0], [-1, 0, 0], kd, uvF, this_fx(b), BIEL);
        for (let j = 0; j < n; j++) {
          const c0 = -e + j * 0.4, uvT = [(dx0 + ((i + j) & 1) * 32) / AW, (dy0 + 32) / AH, (dx0 + ((i + j) & 1) * 32 + 32) / AW, dy0 / AH];
          b.plaski(a0, c0, a1, c0 + 0.4, y1, BIEL, uvT);
        }
      }
      y += h;
    }
    b.efekt(0.12, 0, 0);
    PREFABY._gwiazda(b, uvR('gwiazda'), 0, y + 0.34, 0, 0.24);
    b.efekt(0, 0.5, 0);
    b.push().tr(0, y, 0).walec(0.018, 0.018, 0, 0.12, 5, KOL.metal).pop();
  },
  // TABLICA PROMOCJI: stojak A z gwiazdą (bez tekstu)
  tablica(b, sz, o, R) {
    const { w, d } = o, H = 1.22, uvG = uvR('gwiazda');
    const kr = [KOL.czerw, lin(0x3f8fe0), KOL.ziel][o.war % 3];
    b.efekt(0, 0.1, 0);
    for (const s of [1, -1]) {
      b.push().tr(0, 0, s * 0.02).rotX(s * 0.2);
      b.pudlo(-w / 2, 0.02, -0.02, w / 2, H, 0.02, kr, { dol: 0.85, bez: [] });
      b.efekt(0.08, 0, 0);
      const z = s * 0.024, r = w / 2 - 0.08, yc = H * 0.6;
      if (s > 0) b.quad([-r, yc - r, z], [r, yc - r, z], [r, yc + r, z], [-r, yc + r, z], [0, 0, 1], BIEL, uvG);
      else b.quad([r, yc - r, z], [-r, yc - r, z], [-r, yc + r, z], [r, yc + r, z], [0, 0, -1], BIEL, uvG);
      b.efekt(0, 0.1, 0);
      b.pop();
    }
  },
  // STOISKO WARZYWNE: drewniany stół, 3 × 2 skrzynki pochylone ku przodowi (+Z), tabliczki z kredy
  stoisko(b, sz, o, R) {
    const { w, d } = o, uvD = uvR('deski'), uvK = uvR('tabliczka');
    b.efekt(0, 0, 0);
    for (const [x, z] of [[-w / 2 + 0.1, -d / 2 + 0.1], [w / 2 - 0.1, -d / 2 + 0.1], [-w / 2 + 0.1, d / 2 - 0.1], [w / 2 - 0.1, d / 2 - 0.1]])
      b.pudlo(x - 0.06, 0, z - 0.06, x + 0.06, 0.62, z + 0.06, KOL.drewnoC);
    b.pudlo(-w / 2, 0.5, -d / 2, w / 2, 0.62, d / 2, BIEL, { uvAll: uvD, kol: { py: KOL.drewno } });
    b.pudlo(-w / 2 + 0.05, 0.1, -d / 2 + 0.05, w / 2 - 0.05, 0.14, d / 2 - 0.05, KOL.drewnoC);
    const kolej = [];
    for (let i = 0; i < 6; i++) kolej.push(WARZ_LISTA[(o.war * 5 + i * 3 + Math.floor(R() * 2)) % WARZ_LISTA.length]);
    const cw = (w - 0.1) / 3, cd = (d - 0.1) / 2;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const x = -w / 2 + 0.05 + (i + 0.5) * cw, z = -d / 2 + 0.05 + (j + 0.5) * cd, y = 0.62 + (1 - j) * 0.14;
      skrzynka(b, R, x, y, z, cw - 0.05, cd - 0.05, 0.22, kolej[i * 2 + j], 0.22);
    }
    // tabliczki z kredy na patykach przy przednich skrzynkach
    b.efekt(0, 0, 0);
    for (let i = 0; i < 3; i++) {
      if (R() < 0.35) continue;
      const x = -w / 2 + 0.05 + (i + 0.5) * cw, z = d / 2 - 0.02;
      b.pudlo(x - 0.012, 0.62, z - 0.012, x + 0.012, 1.02, z + 0.012, KOL.drewnoC);
      b.quad([x - 0.16, 0.92, z + 0.02], [x + 0.16, 0.92, z + 0.02], [x + 0.16, 1.08, z + 0.02], [x - 0.16, 1.08, z + 0.02], [0, 0, 1], BIEL, uvK);
    }
  },
  // SKRZYNIE na niskiej palecie (2 × 2)
  skrzynie(b, sz, o, R) {
    const { w, d } = o;
    paletaBaza(b, w, d, 0.13);
    const cw = (w - 0.06) / 2, cd = (d - 0.06) / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const rodz = WARZ_LISTA[(o.war * 7 + i * 5 + j * 3) % WARZ_LISTA.length];
      skrzynka(b, R, -w / 2 + 0.03 + (i + 0.5) * cw, 0.13, -d / 2 + 0.03 + (j + 0.5) * cd, cw - 0.04, cd - 0.04, 0.62, rodz);
    }
  },
  // STOJAK SCHODKOWY z owocami (3 stopnie ku +Z)
  owoce(b, sz, o, R) {
    const { w, d } = o, uvD = uvR('deski');
    b.efekt(0, 0, 0);
    const st = [[0.38, d / 2 - 0.47, d / 2], [0.72, -d / 6 + 0.02, d / 2 - 0.47], [1.02, -d / 2, -d / 6 + 0.02]];
    const owoce = ['jablko', 'pomarancza', 'banan', 'cytryna', 'jablkoZ', 'papryka'];
    for (const [k, [h, z0, z1]] of st.entries()) {
      b.pudlo(-w / 2, 0, z0, w / 2, h, z1, BIEL, { uvAll: uvD, kol: { py: KOL.drewno }, dol: 0.8 });
      for (let i = 0; i < 2; i++) {
        const x = -w / 2 + (i + 0.5) * (w / 2);
        kopiec(b, R, x, h - 0.02, (z0 + z1) / 2, w / 2 - 0.12, (z1 - z0) - 0.1, owoce[(o.war + k * 2 + i) % owoce.length], 3);
      }
    }
  },
  // STOS KOSZYKÓW (czerwone, z rączkami)
  koszyki(b, sz, o, R) {
    const { w, d } = o, uvK = uvR('koszyk');
    b.efekt(0, 0.15, 0);
    for (let i = 0; i < 5; i++) {
      const y = i * 0.12, s = 1 - i * 0.01;
      b.pudlo(-w / 2 * s, y, -d / 2 * s, w / 2 * s, y + 0.3, d / 2 * s, BIEL, { uvAll: uvK, bez: ['ny', 'py'], dol: 0.85 });
    }
    b.pudlo(-w / 2 + 0.05, 0.02, -d / 2 + 0.05, w / 2 - 0.05, 0.4, d / 2 - 0.05, KOL.czerwC, { bez: ['ny', 'pz', 'nz', 'px', 'nx'] });
    b.efekt(0, 0.3, 0);
    b.pudlo(-0.03, 0.78, -d / 2 + 0.04, 0.03, 0.82, d / 2 - 0.04, lin(0x2e3338));
  },
  // CZOŁO REGAŁU: niska ekspozycja w kolorze działu z kartonami towaru i flagą promocji
  czolo(b, sz, o, R) {
    const { w, d } = o, H = 0.62;
    b.efekt(0, 0.1, 4);
    b.pudlo(-w / 2, 0, -d / 2, w / 2, H, d / 2, BIEL, { kol: { py: mn(BIEL, 0.96) }, dol: 0.82 });
    b.efekt(0, 0.1, 3);
    b.pudlo(-w / 2 - 0.005, 0.02, -d / 2 - 0.005, w / 2 + 0.005, 0.14, d / 2 + 0.005, BIEL, { bez: ['ny', 'py'] });
    const uvs = [uvR('nadruk0'), uvR('nadruk1'), uvR('karton2')], uvT = uvR('kartonWierzch');
    b.efekt(0, 0.05, 0);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + 0.04 + i * (w - 0.08) / n, x1 = x0 + (w - 0.08) / n - 0.03;
      b.pudlo(x0, H, -d / 2 + 0.06, x1, H + 0.34, d / 2 - 0.06, mn(BIEL, 0.97), { uvAll: uvs[(o.war + i) % 3], uv: { py: uvT } });
    }
    b.efekt(0.1, 0, 0);
    PREFABY._gwiazda(b, uvR('gwiazda'), 0, H + 0.62, 0, 0.2);
    b.efekt(0, 0.5, 0);
    b.push().tr(0, H + 0.34, 0).walec(0.015, 0.015, 0, 0.1, 5, KOL.metal).pop();
  },
};
// prefaby (cache): klucz typ|wariant|n — obiekt w swoim układzie (środek podstawy w 0, bez posadzki i cieni)
const _prefaby = new Map();
function prefab(o) {
  const klucz = o.typ + '|' + (o.war || 0) + '|' + (o.n || 0) + '|' + o.w + '|' + o.d;
  let p = _prefaby.get(klucz);
  if (!p) {
    const b = new Bud(), sz = new Bud(), R = prng(((o.war || 0) + 1) * 7919 + o.typ.length * 131 + (o.n || 0));
    PREFABY[o.typ](b, sz, o, R);
    p = { b: b.tablice(), sz: sz.nv ? sz.tablice() : null };
    _prefaby.set(klucz, p);
  }
  return p;
}
export const TYPY_REKWIZYTOW = Object.keys(PREFABY).filter(k => k[0] !== '_');
// cień kontaktowy per typ: [zasięg, siła]
const CIEN = { paleta: [0.7, 0.36], kartony: [0.7, 0.36], lada: [0.85, 0.36], kasa: [0.65, 0.32], wozek: [0.45, 0.26], wozki: [0.5, 0.3],
  kosz: [0.6, 0.32], piramida: [0.6, 0.34], tablica: [0.35, 0.2], stoisko: [0.6, 0.3], skrzynie: [0.6, 0.34], owoce: [0.6, 0.32],
  koszyki: [0.4, 0.3], czolo: [0.6, 0.34] };

// ============================== ZBIERACZ CHUNKA (typowane tablice) ==============================
class Zbior {
  constructor(n = 4096) { this.n = 0; this._al(n); }
  _al(cap) {
    const st = this.P ? this : null;
    const P = new Float32Array(cap * 3), N = new Float32Array(cap * 3), C = new Float32Array(cap * 3), U = new Float32Array(cap * 2), F = new Float32Array(cap * 4);
    if (st) { P.set(st.P.subarray(0, this.n * 3)); N.set(st.N.subarray(0, this.n * 3)); C.set(st.C.subarray(0, this.n * 3)); U.set(st.U.subarray(0, this.n * 2)); F.set(st.F.subarray(0, this.n * 4)); }
    Object.assign(this, { P, N, C, U, F, cap });
  }
  miejsce(k) { if (this.n + k > this.cap) this._al(Math.max(this.cap * 2, this.n + k)); }
  // wklejenie prefabu: obrót o `rot` ćwierćobrotów wokół Y, przesunięcie (x, y, z), dział `kat` do aFx.w (rodzaj 3/4)
  wklej(p, x, y, z, rot, kat = 0) {
    const nv = p.nv; this.miejsce(nv);
    const c = rot === 1 ? 0 : rot === 2 ? -1 : rot === 3 ? 0 : 1, s = rot === 1 ? 1 : rot === 3 ? -1 : 0;
    const o = this.n, P = this.P, N = this.N;
    for (let i = 0; i < nv; i++) {
      const px = p.P[i * 3], py = p.P[i * 3 + 1], pz = p.P[i * 3 + 2];
      P[(o + i) * 3] = px * c + pz * s + x; P[(o + i) * 3 + 1] = py + y; P[(o + i) * 3 + 2] = -px * s + pz * c + z;
      const nx = p.N[i * 3], ny = p.N[i * 3 + 1], nz = p.N[i * 3 + 2];
      N[(o + i) * 3] = nx * c + nz * s; N[(o + i) * 3 + 1] = ny; N[(o + i) * 3 + 2] = -nx * s + nz * c;
    }
    this.C.set(p.C, o * 3); this.U.set(p.U, o * 2); this.F.set(p.F, o * 4);
    for (let i = 0; i < nv; i++) { const f = (o + i) * 4; if (this.F[f + 2] > 2.5 && this.F[f + 2] < 4.5) this.F[f + 3] = kat; }
    this.n += nv;
  }
  bud(b) {   // dopisuje Bud (współrzędne gotowe)
    const nv = b.nv; this.miejsce(nv);
    const o = this.n;
    this.P.set(b.P, o * 3); this.N.set(b.N, o * 3); this.C.set(b.C, o * 3); this.U.set(b.U, o * 2); this.F.set(b.F, o * 4);
    this.n += nv;
  }
  geo(THREE) { return geoKwant(THREE, this.P, this.N, this.C, this.U, this.F, this.n); }
}

// ROZLANA WODA: nieregularna plama (16 punktów) + jasny brzeg (vKol.r = 1 przy brzegu); rodzaj 2
function plama(b, x, y, z, r, R) {
  const n = 18, pk = [], f = [R() * TAU, R() * TAU, R() * TAU];
  for (let i = 0; i < n; i++) {
    const a = TAU * i / n;
    const rr = r * (0.9 + 0.07 * Math.sin(a * 2 + f[0]) + 0.05 * Math.sin(a * 3 + f[1]) + 0.04 * Math.sin(a * 5 + f[2]));
    pk.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const fx = [1, 1, 2, 0], ks = [0, 0, 0], kb = [1, 1, 1], nn = [0, 1, 0];
  const V = (px, pz, k) => b._v([x + px, y, z + pz], nn, k, UV_BIALY, fx);
  for (let i = 0; i < n; i++) {
    const p0 = pk[i], p1 = pk[(i + 1) % n];
    const q0 = [p0[0] * 0.86, p0[1] * 0.86], q1 = [p1[0] * 0.86, p1[1] * 0.86];
    // środek → wewnętrzny pierścień (kolor 0) ; pierścień → brzeg (kolor 1 na brzegu)
    V(0, 0, ks); V(q1[0], q1[1], ks); V(q0[0], q0[1], ks);
    V(q0[0], q0[1], ks); V(p1[0], p1[1], kb); V(p0[0], p0[1], kb);
    V(q0[0], q0[1], ks); V(q1[0], q1[1], ks); V(p1[0], p1[1], kb);
  }
}

// ============================== CHUNK ==============================
// U = wynik UM.ukladChunka (współrzędne świata), g0 = wysokość posadzki. Geometria w układzie CHUNKA
// (środek chunka w 0) — siatka ustawiona w (cx·40, 0, cz·40), Float32 z dala od (0, 0) zostaje dokładny.
// Zwraca { geo, geoSzkla | null, wierzch } — regały rysuje main.js instancjami `geoRegalu`.
export function zbudujChunk(THREE, U, g0, CH = 40) {
  const ox = U.cx * CH, oz = U.cz * CH;
  const Z = new Zbior(8192), Zs = new Zbior(512);
  // posadzka chunka (odcień strefy w kolorze, AO 1)
  const pod = new Bud();
  pod.efekt(1, 0.6, 1, 0);
  pod.plaski(-CH / 2, -CH / 2, CH / 2, CH / 2, g0, U.podloga);
  Z.bud(pod);
  // rekwizyty + ich cienie kontaktowe
  const cien = new Bud();
  for (const o of U.obiekty) {
    const p = prefab(o), x = o.x - ox, z = o.z - oz;
    Z.wklej(p.b, x, g0, z, o.rot, o.kat || 0);
    if (p.sz) Zs.wklej(p.sz, x, g0, z, o.rot, 0);
    const hw = (o.rot ? o.d : o.w) / 2, hl = (o.rot ? o.w : o.d) / 2, [zas, sila] = CIEN[o.typ] || [0.5, 0.3];
    cienKontaktowy(cien, x - hw, z - hl, x + hw, z + hl, zas, sila, g0 + 0.008, 0, U.podloga);   // odcień strefy = bez szwu
  }
  Z.bud(cien);
  // rozlana woda (nad cieniami)
  const wod = new Bud();
  for (const [i, s] of U.plamy.entries()) plama(wod, s.x - ox, g0 + 0.016, s.z - oz, s.r, prng(U.cx * 131 + U.cz * 977 + i * 17 + 5));
  Z.bud(wod);
  const geo = Z.geo(THREE);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, g0 + 1.2, 0), Math.hypot(CH / 2, CH / 2, 2.5) + 0.5);
  let geoSzkla = null;
  if (Zs.n) { geoSzkla = Zs.geo(THREE); geoSzkla.boundingSphere = geo.boundingSphere.clone(); }
  return { geo, geoSzkla, wierzcholki: Z.n + Zs.n };
}
export function statystyki() { return { prefaby: _prefaby.size, regalWierzcholki: _geoRegalu ? _geoRegalu.attributes.position.count : 0 }; }
