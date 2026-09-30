// ═══════════════════════════════════════════════════════════════════════════
//  osiedle-zaslepki.js — ZAŚLEPKI modeli mapy „Osiedle" (proste bryły z kolorem
//  w wierzchołkach). Ten sam kontrakt co docelowy `lib/osiedle-rekwizyty.js`
//  (pisany osobno); main.js importuje modele w JEDNYM miejscu (`import * as OSR`),
//  więc podmiana to zmiana jednej ścieżki.
//
//  KONTRAKT (wszystkie funkcje: (THREE, opcje) → { geo, kolizje }):
//   • geo: THREE.BufferGeometry BEZ indeksu, atrybuty position / normal / uv / color,
//     gotowa do scalenia (main.js przepisuje wierzchołki przez obrót i przesunięcie).
//   • kolizje: [{ x, z, w, d, h }] — AABB w układzie lokalnym (oś Y w górę, środek
//     podstawy modelu w 0,0; w wzdłuż X, d wzdłuż Z). PRZÓD modelu = +Z.
//   • modele muszą mieścić się w obrysach `ROZMIAR` z lib/teren-osiedle.js (blok: dl × gl,
//     rząd garaży: ile·3 × 6) — inaczej zatkają przejścia, które zaplanował układ.
//   • materialOsiedla(THREE) → JEDEN wspólny materiał (1 draw call na chunk). main.js dokleja
//     do niego przez onBeforeCompile grunt (atrybut aGrunt), przycinanie przy kamerze i cień
//     chmur — więc to musi być materiał wbudowany three (Lambert/Phong/Standard/Basic).
// ═══════════════════════════════════════════════════════════════════════════

// sRGB (hex) → liniowe RGB: kolory wierzchołków three traktuje jako liniowe
const lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const kol = hex => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
const mn = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

const FASADY = [0xd9d2c3, 0xc9ccd1, 0xe3d6a6, 0xb9c7cf, 0xd8b9a4, 0xcfd8c0, 0xe2e0d8, 0xc7b9a6].map(kol);
const KAROSERIE = [0xc0392b, 0x2f6fb5, 0xe8e6df, 0x9aa3ad, 0x3f8f4a, 0xe0b83c].map(kol);
const BLACHY = [0x9ea4aa, 0x8c9399, 0xa9aea8, 0x6f8f6a, 0x8a6d52, 0x5f7f9a].map(kol);
const OKNO = kol(0x44505e), DACH = kol(0x77797a), STAL = kol(0x3c6e8f), CIEMNY = kol(0x2b2d31),
      DREWNO = kol(0xa0703f), PIASEK = kol(0xe6d08c), BETON = kol(0xb3aea4), LAMPA = kol(0xfff1b0),
      KONT_Z = kol(0x3f7d4a), KONT_S = kol(0x6d747b);

// ściany prostopadłościanu: [normalna, oś u, oś v] — u × v = normalna, więc trójkąty są CCW z zewnątrz
const SCIANY = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
const ROGI = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
const nowy = () => ({ p: [], n: [], u: [], c: [] });
// prostopadłościan: (x, z) = środek podstawy, y = spód; `bez` = maska pomijanych ścian (bit = indeks w SCIANY)
function box(B, x, y, z, sx, sy, sz, c, bez = 0) {
  const h = [sx / 2, sy / 2, sz / 2], sr = [x, y + sy / 2, z];
  for (let f = 0; f < 6; f++) {
    if (bez & (1 << f)) continue;
    const [N, U, V] = SCIANY[f];
    const hu = Math.abs(U[0]) * h[0] + Math.abs(U[1]) * h[1] + Math.abs(U[2]) * h[2];
    const hv = Math.abs(V[0]) * h[0] + Math.abs(V[1]) * h[1] + Math.abs(V[2]) * h[2];
    for (const [a, b] of ROGI) {
      for (let k = 0; k < 3; k++) B.p.push(sr[k] + N[k] * h[k] + U[k] * a * hu + V[k] * b * hv);
      B.n.push(N[0], N[1], N[2]);
      B.u.push((a + 1) / 2, (b + 1) / 2);
      B.c.push(c[0], c[1], c[2]);
    }
  }
}
function geo(THREE, B) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
  return g;
}

export function materialOsiedla(THREE) {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

// BLOK Z WIELKIEJ PŁYTY: parter (3,2 j.) + piętra po 2,8 j. + attyka; pasy okien na obu długich ścianach,
// drzwi klatek od podwórka (+Z). brama = prześwit w parterze na przelot (kolizja: dwie bryły po bokach).
export function blok(THREE, { dl = 30, gl = 12, pietra = 5, ziarno = 0, brama = null } = {}) {
  const B = nowy(), P = 3.2, H = P + pietra * 2.8 + 0.4;
  const fas = FASADY[((ziarno % FASADY.length) + FASADY.length) % FASADY.length], parter = mn(fas, 0.8);
  const czesci = brama ? [[-dl / 2, brama.x - brama.szer / 2], [brama.x + brama.szer / 2, dl / 2]] : [[-dl / 2, dl / 2]];
  for (const [a, b] of czesci) if (b - a > 0.05) box(B, (a + b) / 2, 0, 0, b - a, P, gl, parter, 1 << 2);
  box(B, 0, P, 0, dl, H - P, gl, fas);                         // spód tej bryły = strop przelotu bramy
  // pasy okien i drzwi: TYLKO ściana zewnętrzna (63 = wszystkie bity; bez niej `& ~`) — cienkie boki widziane
  // z kamery wewnątrz bloku (ściany bryły są wtedy tyłem i znikają) rysowały kreskę przez cały ekran
  const TYLKO_PRZOD = 63 & ~(1 << 4), TYLKO_TYL = 63 & ~(1 << 5);
  for (let f = 0; f < pietra; f++) {
    const y = P + f * 2.8 + 0.8;
    box(B, 0, y, gl / 2 + 0.03, dl - 1.2, 1.2, 0.06, OKNO, TYLKO_PRZOD);
    box(B, 0, y, -gl / 2 - 0.03, dl - 1.2, 1.2, 0.06, OKNO, TYLKO_TYL);
  }
  const klatki = Math.max(1, Math.round(dl / 12));
  for (let k = 0; k < klatki; k++) {
    const x = -dl / 2 + (k + 0.5) * dl / klatki;
    if (brama && Math.abs(x - brama.x) < brama.szer / 2 + 1) continue;
    box(B, x, 0, gl / 2 + 0.04, 1.4, 2.3, 0.08, CIEMNY, TYLKO_PRZOD);
    box(B, x, 2.4, gl / 2 + 0.4, 2.2, 0.15, 0.8, BETON);       // daszek nad wejściem
  }
  box(B, 0, H, 0, dl + 0.3, 0.4, gl + 0.3, DACH, 1 << 3);
  return { geo: geo(THREE, B), kolizje: czesci.filter(([a, b]) => b - a > 0.05).map(([a, b]) => ({ x: (a + b) / 2, z: 0, w: b - a, d: gl, h: H + 0.4 })) };
}

// AUTO ~2 × 4,2 × 1,5 j., przód = +Z
export function auto(THREE, { ziarno = 0 } = {}) {
  const B = nowy(), c = KAROSERIE[((ziarno % KAROSERIE.length) + KAROSERIE.length) % KAROSERIE.length];
  for (const [x, z] of [[-0.8, 1.3], [0.8, 1.3], [-0.8, -1.3], [0.8, -1.3]]) box(B, x, 0, z, 0.3, 0.6, 0.62, CIEMNY);
  box(B, 0, 0.3, 0, 1.9, 0.6, 4.1, c);
  box(B, 0, 0.9, -0.2, 1.7, 0.5, 2.1, OKNO);
  box(B, 0, 1.4, -0.2, 1.72, 0.1, 1.9, c);
  return { geo: geo(THREE, B), kolizje: [{ x: 0, z: 0, w: 2, d: 4.2, h: 1.5 }] };
}

// RZĄD BLASZAKÓW: `ile` boksów po 3 j. wzdłuż X, głębokość 6, bramy od +Z
export function garaze(THREE, { ile = 6, ziarno = 0 } = {}) {
  const B = nowy(), L = ile * 3;
  for (let k = 0; k < ile; k++) {
    const x = -L / 2 + 1.5 + k * 3, c = BLACHY[(k * 7 + ziarno * 3) % BLACHY.length];
    box(B, x, 0, 0, 2.94, 2.5, 6, c, 1 << 2);
    box(B, x, 0.05, 3.03, 2.5, 2.15, 0.06, mn(c, 0.72), 1 << 5);
  }
  box(B, 0, 2.5, 0, L + 0.1, 0.12, 6.3, kol(0x5c5f63));
  return { geo: geo(THREE, B), kolizje: [{ x: 0, z: 0, w: L, d: 6, h: 2.62 }] };
}

// TRZEPAK: dwa słupki + dwie poprzeczki (kolizja: słupki — pod drążkiem się przechodzi)
export function trzepak(THREE) {
  const B = nowy();
  for (const x of [-1.3, 1.3]) box(B, x, 0, 0, 0.12, 1.85, 0.12, STAL);
  box(B, 0, 1.75, 0, 2.72, 0.1, 0.1, STAL);
  box(B, 0, 1.1, 0, 2.6, 0.07, 0.07, STAL);
  return { geo: geo(THREE, B), kolizje: [{ x: -1.3, z: 0, w: 0.3, d: 0.3, h: 1.85 }, { x: 1.3, z: 0, w: 0.3, d: 0.3, h: 1.85 }] };
}

// PIASKOWNICA 3,2 × 3,2: niska rama + piasek (da się wejść)
export function piaskownica(THREE) {
  const B = nowy();
  box(B, 0, 0, 1.475, 3.2, 0.35, 0.25, DREWNO); box(B, 0, 0, -1.475, 3.2, 0.35, 0.25, DREWNO);
  box(B, 1.475, 0, 0, 0.25, 0.35, 2.7, DREWNO); box(B, -1.475, 0, 0, 0.25, 0.35, 2.7, DREWNO);
  box(B, 0, 0, 0, 2.7, 0.18, 2.7, PIASEK, 1 << 3);
  return { geo: geo(THREE, B), kolizje: [{ x: 0, z: 0, w: 3.2, d: 3.2, h: 0.35 }] };
}

// HUŚTAWKI: dwie ramy po bokach (X = ±1,6), belka, dwa siedziska na łańcuchach
export function hustawki(THREE) {
  const B = nowy();
  for (const x of [-1.6, 1.6]) for (const z of [-0.6, 0.6]) box(B, x, 0, z, 0.12, 2.3, 0.12, STAL);
  box(B, 0, 2.25, 0, 3.4, 0.12, 0.12, STAL);
  for (const x of [-0.7, 0.7]) {
    box(B, x - 0.25, 0.6, 0, 0.03, 1.65, 0.03, CIEMNY); box(B, x + 0.25, 0.6, 0, 0.03, 1.65, 0.03, CIEMNY);
    box(B, x, 0.52, 0, 0.62, 0.08, 0.36, DREWNO);
  }
  return { geo: geo(THREE, B), kolizje: [{ x: -1.6, z: 0, w: 0.3, d: 1.4, h: 2.3 }, { x: 1.6, z: 0, w: 0.3, d: 1.4, h: 2.3 }] };
}

// WIATA ŚMIETNIKOWA: ściana tylna i boczne, daszek, dwa kontenery; otwarta od +Z
export function smietnik(THREE) {
  const B = nowy();
  box(B, 0, 0, -1.05, 3.2, 2.0, 0.1, BETON);
  box(B, -1.55, 0, 0, 0.1, 2.0, 2.2, BETON); box(B, 1.55, 0, 0, 0.1, 2.0, 2.2, BETON);
  box(B, 0, 2.0, 0, 3.4, 0.14, 2.4, DACH);
  box(B, -0.72, 0, -0.25, 1.2, 1.15, 1.0, KONT_Z); box(B, 0.72, 0, -0.25, 1.2, 1.15, 1.0, KONT_S);
  return { geo: geo(THREE, B), kolizje: [{ x: 0, z: 0, w: 3.2, d: 2.2, h: 2.2 }] };
}

// LATARNIA: słup 4,6 j., wysięgnik, klosz
export function latarnia(THREE) {
  const B = nowy();
  box(B, 0, 0, 0, 0.16, 4.6, 0.16, CIEMNY);
  box(B, 0, 4.5, 0.35, 0.08, 0.08, 0.8, CIEMNY);
  box(B, 0, 4.3, 0.7, 0.3, 0.2, 0.42, LAMPA);
  return { geo: geo(THREE, B), kolizje: [{ x: 0, z: 0, w: 0.3, d: 0.3, h: 4.8 }] };
}

// ŁAWKA: siedzisko + oparcie od −Z, przód = +Z
export function lawka(THREE) {
  const B = nowy();
  for (const x of [-0.75, 0.75]) box(B, x, 0, 0, 0.08, 0.45, 0.45, CIEMNY);
  box(B, 0, 0.42, 0, 1.8, 0.08, 0.46, DREWNO);
  box(B, 0, 0.55, -0.24, 1.8, 0.4, 0.06, DREWNO);
  return { geo: geo(THREE, B), kolizje: [{ x: 0, z: 0, w: 1.8, d: 0.6, h: 0.5 }] };
}
