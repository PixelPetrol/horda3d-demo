// ═══════════════════════════════════════════════════════════════════════════
//  teren-osiedle.js — czwarta mapa: OSIEDLE (EN „The Block"), Osiedle Grządkowo
//  Moduł SAMODZIELNY: zero importów, zero THREE, zero Math.random. Wszystko jest
//  czystą funkcją (cx, cz, ziarno) → układ chunka, więc chunki nie mają szwów,
//  a układ da się sprawdzić w node (spójność podwórek, wyjścia) bez przeglądarki.
//
//  ─────────────────────────────── JAK TO JEST ZBUDOWANE ─────────────────────
//  KWARTAŁ = 2×2 chunki (80×80 j.). Na krawędziach kwartałów biegną ALEJKI
//  (asfalt 7 j. + chodniki), w środku kwartału jest PODWÓRKO (~44–48 j.), a między
//  nimi pas zabudowy: bloki z wielkiej płyty, rzędy garaży albo parking.
//  Każdy chunk to jedna ĆWIARTKA kwartału. Ćwiartkę projektujemy RAZ, w układzie
//  „ramki" (u, v ∈ [-20, 20]): alejki przy u = -20 i v = -20, środek podwórka
//  w (20, 20). Pozostałe trzy ćwiartki to lustrzane odbicia (sx, sz = ±1).
//
//  DLACZEGO NIC NIE PRZECINA GRANICY CHUNKA: granice chunków leżą albo na osi
//  alejki (tam jest tylko asfalt), albo w połowie boku kwartału — a tam ZAWSZE jest
//  przejście między blokami (3–6 j., szerokość wspólna dla obu połówek boku).
//  Dzięki temu każdy obiekt i każda bryła kolizji należy do dokładnie jednego chunka
//  (main.js szuka kolizji w sąsiedztwie 3×3 — margines jest z zapasem).
//
//  GWARANCJA WYJŚĆ: podwórko ma ZAWSZE 4 przejścia w połowach boków (do alejek,
//  a przez alejkę na wprost do przejścia sąsiedniego podwórka), do tego 0–4
//  przejścia narożne (3–5 j.), bramy w parterach, przerwy między blokami i otwarte
//  boki parkingowe. Alejki tworzą nieskończoną kratę, więc cały świat jest jedną
//  spójną przestrzenią — horda dochodzi wszędzie, gracz nie zostanie zamknięty.
//  Sprawdzane w node: narzędzie w opisie mapy w INFO-PROJEKT.md (sekcja MAPA OSIEDLE).
//
//  NAWIGACJA HORDY (klasa `Nawigacja` niżej): horda w grze idzie po prostej na
//  gracza, a tu stoją ściany po 12–29 j. wysokości. Co ~0,25 s liczymy POLE
//  PRZEPŁYWU (Dijkstra z kubełkami Diala, siatka 1 j., okno 104×104 wokół gracza)
//  z masek kolizji chunków. Wróg pyta o kierunek w O(1): jeśli droga jest niemal
//  prosta — idzie prosto (zachowanie jak na innych mapach), jeśli trzeba obejść
//  blok — idzie za polem. Stąd „horda wlewa się przejściami".
// ═══════════════════════════════════════════════════════════════════════════

export const CHUNK = 40;                 // MUSI się zgadzać z CHUNK w main.js
export const KROK = 0.5;                 // rozdzielczość maski gruntu (j.)
export const NG = CHUNK / KROK;          // 80 komórek maski gruntu na bok chunka
export const GRUNT = { TRAWA: 0, CHODNIK: 1, ASFALT: 2, ZIEMIA: 3, BUDYNEK: 4 };
// kody komórek nawigacji (1 j.): WOLNE, NISKIE (auto, ławka — przejdzie wspinaczką, koszt ×4),
// SLUP (latarnia, stelaż — nieprzechodnie, ale nie zatrzymuje pocisków), SCIANA (blok, garaż, wiata)
export const KOD = { WOLNE: 0, NISKIE: 1, SLUP: 2, SCIANA: 3 };
export const START = { x: 20, z: 20 };   // środek podwórka kwartału (0,0) — skrzyżowanie ścieżek, zawsze pusto
// nominalne obrysy (lokalnie: szerokość wzdłuż X, głębokość wzdłuż Z; przód = +Z) — kontrakt z modułem modeli:
// kolizje modelu muszą się mieścić w tym obrysie, inaczej przejścia mogą się zatkać
export const ROZMIAR = {
  auto: [2, 4.2], garaz: [3, 6], trzepak: [2.8, 0.4], piaskownica: [3.2, 3.2], hustawki: [3.4, 1.6],
  smietnik: [5.6, 2.2], latarnia: [0.4, 0.4], lawka: [1.8, 0.7],
};

// ---- stałe ramki (ćwiartka kanoniczna) ----
const DROGA = -16.5;         // krawężnik: u < -16.5 = jezdnia (3,5 j. połowa alejki)
const CHOD = -14.5;          // chodnik -16.5 … -14.5, potem 0,5 j. trawnika
const B0 = -14;              // początek pasa zabudowy
const PIETRA = [4, 4, 5, 5, 5, 10, 10];
const CECHY = ['plac', 'trzepak', 'parking', 'zielen'];

// ---- hasz całkowity (bez Math.random) → [0, 1) ----
function hasz(a, b, c, d) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1) ^ Math.imul(d | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
// strumień liczb (mulberry32) z ziarna [0,1)
function strumien(s) {
  let a = (s * 4294967296) | 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pol = x => Math.round(x * 2) / 2;                        // do pół jednostki (lepsze trafienia w cache prefabów)
const cwierc = r => (((Math.round(r / (Math.PI / 2)) % 4) + 4) % 4);   // obrót → liczba ćwierćobrotów 0..3

// ═══════════════════════════════════════════════════════════════════════════
//  UKŁAD CHUNKA
//  → { obiekty: [{ typ, x, z, rot, obr, opcje }], grunt: Uint8Array(NG*NG), X0, Z0 }
//    x, z = środek podstawy w ŚWIECIE; rot = obrót wokół Y (wielokrotność 90°), obr = rot / 90°;
//    grunt[j*NG + i] = GRUNT.* komórki (X0 + (i+½)·KROK, Z0 + (j+½)·KROK); X0/Z0 = róg chunka (cx·40−20)
// ═══════════════════════════════════════════════════════════════════════════
export function ukladChunka(cx, cz, ziarno = 1) {
  const mx = Math.floor(cx / 2), mz = Math.floor(cz / 2);
  const qx = cx - 2 * mx, qz = cz - 2 * mz;
  const sx = qx ? -1 : 1, sz = qz ? -1 : 1;                     // lustro ćwiartki
  const XC = cx * CHUNK, ZC = cz * CHUNK;                       // środek chunka w świecie
  const Z7 = (ziarno | 0) * 7;
  const los = strumien(hasz(cx, cz, Z7 + 1, 7));
  // wspólne dla obu połówek JEDNEGO boku kwartału (szerokość przejścia w połowie boku, głębokość, piętra)
  const wsp = (k, strona, nr) => hasz(mx, mz, Z7 + k, 100 + strona * 2 + nr);
  const obiekty = [], grunt = new Uint8Array(NG * NG);         // 0 = TRAWA

  // ramka (u, v) → prostokąt komórek maski (świat lokalny chunka 0..40)
  const maluj = (u0, u1, v0, v1, typ) => {
    const a0 = sx > 0 ? u0 + 20 : 20 - u1, a1 = sx > 0 ? u1 + 20 : 20 - u0;
    const b0 = sz > 0 ? v0 + 20 : 20 - v1, b1 = sz > 0 ? v1 + 20 : 20 - v0;
    const i0 = Math.max(0, Math.round(a0 / KROK)), i1 = Math.min(NG, Math.round(a1 / KROK));
    const j0 = Math.max(0, Math.round(b0 / KROK)), j1 = Math.min(NG, Math.round(b1 / KROK));
    if (i1 <= i0) return;
    for (let j = j0; j < j1; j++) grunt.fill(typ, j * NG + i0, j * NG + i1);
  };
  // obiekt w ramce: (fu, fv) = kierunek PRZODU (lokalne +Z) w ramce; lustro odbija i pozycję, i przód
  const postaw = (typ, u, v, fu, fv, opcje = {}) => {
    const obr = cwierc(Math.atan2(sx * fu, sz * fv));
    const o = { typ, x: XC + sx * u, z: ZC + sz * v, rot: obr * Math.PI / 2, obr, opcje };
    obiekty.push(o);
    return o;
  };
  // lokalne X obiektu w świecie = (cos r, −sin r) → rzut punktu ramki na oś długości (np. brama w bloku)
  const naOsX = (o, u, v) => {
    const px = XC + sx * u - o.x, pz = ZC + sz * v - o.z;
    const c = [1, 0, -1, 0][o.obr], s = [0, 1, 0, -1][o.obr];
    return Math.round((px * c - pz * s) * 100) / 100;
  };

  // ---- PODSTAWA GRUNTU: jezdnie i chodniki obu alejek ćwiartki ----
  maluj(-20, DROGA, -20, 20, GRUNT.ASFALT);
  maluj(-20, 20, -20, DROGA, GRUNT.ASFALT);
  maluj(DROGA, CHOD, DROGA, 20, GRUNT.CHODNIK);
  maluj(DROGA, 20, DROGA, CHOD, GRUNT.CHODNIK);

  // ---- DWA BOKI ĆWIARTKI: X (pas wzdłuż v przy alejce u = -20) i Z (pas wzdłuż u przy alejce v = -20) ----
  const boki = [0, 1].map(strona => {
    const nr = strona ? qz : qx;
    const p = pol(1.5 + 1.5 * wsp(1, strona, nr));            // pół przejścia w połowie boku: razem 3–6 j.
    const hs = hasz(cx, cz, Z7 + 11, 300 + strona);
    const typ = hs < 0.62 ? 'blok' : hs < 0.81 ? 'garaze' : 'parking';
    const g = typ === 'blok' ? (wsp(2, strona, nr) < 0.5 ? 10 : 12)
            : typ === 'garaze' ? (hasz(cx, cz, Z7 + 12, 310 + strona) < 0.5 ? 6 : 12) : 12;
    const pietra = PIETRA[Math.floor(wsp(3, strona, nr) * PIETRA.length)];
    return { strona, nr, p, typ, g, pietra, s: 0, e: 0 };
  });
  const [BX, BZ] = boki;
  // NAROŻNIK przy skrzyżowaniu alejek: jeden bok zajmuje róg, drugi zaczyna się za nim — stykiem (zamknięte „L")
  // albo z przejściem narożnym 3–5 j.
  const wlascX = hasz(cx, cz, Z7 + 21, 500) < 0.5;
  const szczel = hasz(cx, cz, Z7 + 22, 501) < 0.3 ? 0 : pol(3 + 2 * hasz(cx, cz, Z7 + 23, 502));
  BX.s = wlascX ? B0 : B0 + BZ.g + szczel; BX.e = 20 - BX.p;
  BZ.s = wlascX ? B0 + BX.g + szczel : B0; BZ.e = 20 - BZ.p;
  const wyjscia = { srodek: 2, narozne: szczel > 0 ? 1 : 0, bramy: 0, przerwy: 0, otwarte: 0 };   // (połówki) — do testów

  for (const B of boki) {
    const st = B.strona;
    // (wzdłuż a, w poprzek b) → ramka; b rośnie od alejki do podwórka
    const M = (a0, a1, b0, b1, typ) => st ? maluj(a0, a1, b0, b1, typ) : maluj(b0, b1, a0, a1, typ);
    const S = (typ, a, b, fa, fb, op) => st ? postaw(typ, a, b, fa, fb, op) : postaw(typ, b, a, fb, fa, op);
    const R = (a, b) => st ? [a, b] : [b, a];                   // punkt boku → (u, v)
    let s = B.s, e = B.e;
    // przejście w połowie boku (utwardzone) + ścieżka do środka podwórka (z lustrem sąsiada: 2,5 j.)
    M(20 - B.p, 20, CHOD, B0 + B.g + 1.2, GRUNT.CHODNIK);
    M(18.75, 20, B0 + B.g, 20, GRUNT.CHODNIK);
    if (B.typ === 'blok') {
      // WIATA ŚMIETNIKOWA przy alejce: blok kończy się 6,2 j. wcześniej (prawdziwa wiata ma 5,6 j.), frontem do chodnika
      if (e - s >= 20 && los() < 0.35) {
        M(e - 6.2, e, CHOD, B0 + 2.6, GRUNT.CHODNIK);
        S('smietnik', e - 3.1, B0 + 1.25, 0, -1, {});
        e -= 6.2;
      }
      const L = e - s, odc = [];
      let brama = null;
      if (L >= 26 && los() < 0.35) {                            // dwa bloki z przerwą 3–5 j.
        const gs = pol(3 + 2 * los()), sp = pol(s + L * (0.4 + 0.2 * los()));
        odc.push([s, sp - gs / 2, sp - gs / 2, sp + gs / 2], [sp + gs / 2, e, null, null]);
        wyjscia.przerwy++;
      } else {
        odc.push([s, e, null, null]);
        if (L >= 18 && los() < 0.5) { brama = pol(s + L * (0.35 + 0.3 * los())); wyjscia.bramy++; }
      }
      for (const [a0, a1, p0, p1] of odc) {
        const o = S('blok', (a0 + a1) / 2, B0 + B.g / 2, 0, 1,
                    { dl: a1 - a0, gl: B.g, pietra: B.pietra, ziarno: Math.floor(los() * 8), brama: null });
        M(a0, a1, B0, B0 + B.g, GRUNT.BUDYNEK);
        M(a0, a1, B0 + B.g, B0 + B.g + 1.2, GRUNT.CHODNIK);    // opaska od strony podwórka
        if (brama !== null) {
          const [u, v] = R(brama, B0 + B.g / 2);
          o.opcje.brama = { x: naOsX(o, u, v), szer: 4 };
          M(brama - 2, brama + 2, CHOD, B0 + B.g + 1.2, GRUNT.CHODNIK);   // przelot pod blokiem
        }
        if (p0 !== null) M(p0, p1, CHOD, B0 + B.g + 1.2, GRUNT.CHODNIK);  // przerwa między blokami
      }
    } else if (B.typ === 'garaze') {
      const n = Math.min(11, Math.floor((e - s) / 3));
      if (n >= 2) {
        const a0 = s + pol((e - s - n * 3) / 2), rzedy = B.g >= 12 ? 2 : 1;
        for (let r = 0; r < rzedy; r++)                         // 1. rząd bramami do alejki, 2. do podwórka
          S('garaze', a0 + n * 1.5, B0 + 3 + r * 6, 0, r ? 1 : -1, { ile: n, ziarno: Math.floor(los() * 4) });
        M(a0, a0 + n * 3, B0, B0 + rzedy * 6, GRUNT.BUDYNEK);
        M(a0, a0 + n * 3, DROGA, B0, GRUNT.ASFALT);             // zjazd przed bramami
        if (rzedy === 2) M(a0, a0 + n * 3, B0 + 12, B0 + 15, GRUNT.ASFALT);
      }
    } else {                                                    // PARKING w pasie zabudowy (bok otwarty)
      M(s, e, CHOD, B0 + B.g, GRUNT.ASFALT);
      for (const [b, fb] of [[B0 + 2.3, 1], [B0 + 9.7, -1]])    // dwa rzędy przodem do alejki parkingowej 3,2 j.
        for (let a = s + 1.6; a <= e - 1.6; a += 2.7) if (los() < 0.62) S('auto', a, b, 0, fb, { ziarno: Math.floor(los() * 6) });
      if (los() < 0.7) S('latarnia', pol((s + e) / 2), B0 + B.g + 0.6, 0, 1, {});
      wyjscia.otwarte++;
    }
    // ALEJKA: latarnie na chodniku; auta przy krawężniku tylko po jednej stronie alejki (qx/qz = 0),
    // żeby dwa rzędy nie zatkały jezdni (zostaje ≥ 5 j.)
    for (const a of [-6, 9]) if (los() < 0.8) S('latarnia', a, -15.3, 0, 1, {});
    if (B.nr === 0) for (const a of [-8, -2.5, 3, 8.5, 14]) if (los() < 0.3) S('auto', a, -18.3, los() < 0.5 ? 1 : -1, 0, { ziarno: Math.floor(los() * 6) });
  }
  // przejście narożne (między licem bloku-właściciela rogu a początkiem drugiego boku)
  if (szczel > 0) {
    const gW = wlascX ? BX.g : BZ.g, gN = wlascX ? BZ.g : BX.g;
    if (wlascX) maluj(B0 + gW, B0 + gW + szczel, CHOD, B0 + gN + 1.2, GRUNT.CHODNIK);
    else maluj(CHOD, B0 + gN + 1.2, B0 + gW, B0 + gW + szczel, GRUNT.CHODNIK);
  }
  maluj(17, 20, 17, 20, GRUNT.CHODNIK);                         // placyk na skrzyżowaniu ścieżek

  // ---- PODWÓRKO: jedna atrakcja na ćwiartkę, cztery różne na podwórko ----
  const U0 = B0 + BX.g + 2.2, V0 = B0 + BZ.g + 2.2, U1 = 16.4, V1 = 16.4;
  const cu = pol((U0 + U1) / 2), cv = pol((V0 + V1) / 2);
  const cecha = CECHY[(Math.floor(hasz(mx, mz, Z7 + 31, 600) * 4) + qx + 2 * qz) % 4];
  if (cecha === 'plac') {                                       // PLAC ZABAW: piaskownica, huśtawki, ławki
    maluj(cu - 5.5, cu + 5.5, cv - 4.5, cv + 4.5, GRUNT.ZIEMIA);
    postaw('piaskownica', cu - 2.5, cv - 1, 0, 1, {});
    postaw('hustawki', cu + 2.8, cv + 1.5, 0, los() < 0.5 ? 1 : -1, {});
    postaw('lawka', cu - 3, cv + 3.6, 0, -1, {});
    postaw('lawka', cu + 3, cv - 3.6, 0, 1, {});
    postaw('latarnia', cu + 5.2, cv - 4.2, 0, 1, {});
  } else if (cecha === 'trzepak') {                             // TRZEPAK na utwardzonym placyku + ławki
    maluj(cu - 3, cu + 3, cv - 1.8, cv + 1.8, GRUNT.CHODNIK);
    postaw('trzepak', cu, cv, 0, 1, {});
    postaw('lawka', cu, cv + 3.4, 0, -1, {});
    postaw('lawka', cu + 4.6, cv - 2, -1, 0, {});
    postaw('latarnia', cu - 4.2, cv + 3, 0, 1, {});
  } else if (cecha === 'parking') {                             // PARKING NA PODWÓRKU: dwa rzędy po 5 miejsc
    maluj(cu - 6.5, cu + 6.5, cv - 5.5, cv + 5.5, GRUNT.ASFALT);
    for (const [b, fv] of [[cv - 3.4, 1], [cv + 3.4, -1]])
      for (let k = 0; k < 5; k++) if (los() < 0.7) postaw('auto', cu - 5 + k * 2.5, b, 0, fv, { ziarno: Math.floor(los() * 6) });
    postaw('latarnia', cu - 6.9, cv, 0, 1, {});
  } else {                                                      // ZIELEŃ: alejka z ławkami i latarniami
    maluj(cu - 6, cu + 6, cv - 0.7, cv + 0.7, GRUNT.CHODNIK);
    postaw('lawka', cu - 4, cv + 1.4, 0, -1, {});
    postaw('lawka', cu + 1, cv + 1.4, 0, -1, {});
    postaw('lawka', cu + 4, cv - 1.4, 0, 1, {});
    postaw('latarnia', cu - 6.4, cv, 0, 1, {});
    postaw('latarnia', cu + 6.4, cv, 0, 1, {});
  }
  // ławki i latarnia przy ścieżkach do środka podwórka
  if (los() < 0.6) postaw('lawka', pol(cu - 2), 17.9, 0, 1, {});
  if (los() < 0.6) postaw('lawka', 17.9, pol(cv + 2), 1, 0, {});
  if (los() < 0.7) postaw('latarnia', 17.6, 17.6, 0, 1, {});

  return { obiekty, grunt, X0: XC - CHUNK / 2, Z0: ZC - CHUNK / 2, cecha, boki: boki.map(b => b.typ), wyjscia };
}

// kolizja lokalna modelu { x, z, w, d, h } (środek podstawy, w wzdłuż X, d wzdłuż Z) → bryła w świecie
// { x, z, hw, hl, wys } dla obiektu z układu (obrót o ćwierćobroty — AABB zostaje osiowy).
// Obrót jak w THREE (rotation.y = r): x' = x·cos r + z·sin r, z' = −x·sin r + z·cos r.
export function kolizjaWSwiecie(o, k) {
  const c = [1, 0, -1, 0][o.obr], s = [0, 1, 0, -1][o.obr];
  const odw = o.obr & 1;
  return { x: o.x + k.x * c + k.z * s, z: o.z - k.x * s + k.z * c,
           hw: (odw ? k.d : k.w) / 2, hl: (odw ? k.w : k.d) / 2, wys: k.h };
}

// typ gruntu w punkcie świata z maski chunka (X0, Z0 = róg chunka)
export function gruntW(grunt, X0, Z0, x, z) {
  const i = Math.floor((x - X0) / KROK), j = Math.floor((z - Z0) / KROK);
  if (i < 0 || j < 0 || i >= NG || j >= NG) return GRUNT.TRAWA;
  return grunt[j * NG + i];
}

// ═══════════════════════════════════════════════════════════════════════════
//  MASKI KOLIZJI CHUNKA (siatka 1 j., 40×40)
//  bryly: [{ x, z, hw, hl, wys }] w świecie. `nav` = kod komórki, której środek leży w bryle poszerzonej o 0,45 j.
//  (promień wroga 0,35 + zapas: przy 0,35 słupek latarni 0,3 j. na CAŁKOWITEJ współrzędnej nie trafiał w żaden środek
//  komórki — pole prowadziło hordę prosto w słupek; przejście 3 j. zachowuje ≥ 2 wolne komórki),
//  `sciany` = 1 tam, gdzie środek komórki leży W ŚCIANIE bez marginesu (pociski, widoczność, „utknął w bryle").
// ═══════════════════════════════════════════════════════════════════════════
export function maskiKolizji(bryly, X0, Z0) {
  const nav = new Uint8Array(CHUNK * CHUNK), sciany = new Uint8Array(CHUNK * CHUNK);
  const R = 0.45;
  const zakres = (c, h, o) => [Math.max(0, Math.floor(c - h - o - 0.5) + 1), Math.min(CHUNK, Math.ceil(c + h - o - 0.5))];
  for (const b of bryly) {
    const kod = b.wys >= 2 ? (b.hw * b.hl * 4 >= 1.5 ? KOD.SCIANA : KOD.SLUP) : b.wys >= 0.15 ? KOD.NISKIE : KOD.WOLNE;
    if (!kod) continue;
    const [i0, i1] = zakres(b.x - X0, b.hw + R, 0), [j0, j1] = zakres(b.z - Z0, b.hl + R, 0);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const c = j * CHUNK + i; if (nav[c] < kod) nav[c] = kod; }
    if (kod !== KOD.SCIANA) continue;
    const [k0, k1] = zakres(b.x - X0, b.hw, 0), [l0, l1] = zakres(b.z - Z0, b.hl, 0);
    for (let j = l0; j < l1; j++) for (let i = k0; i < k1; i++) sciany[j * CHUNK + i] = 1;
  }
  return { nav, sciany };
}

// ═══════════════════════════════════════════════════════════════════════════
//  NAWIGACJA HORDY — pole przepływu w oknie N×N (1 j.) wokół gracza
//  przebuduj(px, pz, pobierz): pobierz(cx, cz) → { nav, sciany } chunka albo null (brak = wolne).
//  Zero alokacji po konstrukcji (bufory typowane, kubełki Diala na puli wpisów).
// ═══════════════════════════════════════════════════════════════════════════
const INF = 0xFFFF;
const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];   // 4 proste, potem 4 skosy
export class Nawigacja {
  constructor(N = 104) {
    this.N = N; const n = N * N;
    this.kod = new Uint8Array(n); this.sc = new Uint8Array(n);
    this.dist = new Uint16Array(n);
    this.fx = new Float32Array(n); this.fz = new Float32Array(n); this.st = new Uint32Array(n);
    this.gen = 1; this.x0 = -1e9; this.z0 = -1e9; this.gotowa = false;
    this.cap = n * 5; this.pula = new Int32Array(this.cap); this.nast = new Int32Array(this.cap);
    this.glowa = new Int32Array(32);
    this.px = 1e9; this.pz = 1e9; this.ms = 0; this.zasieg = 0;
  }
  reset() { this.gotowa = false; this.x0 = this.z0 = -1e9; this.px = this.pz = 1e9; }
  przebuduj(px, pz, pobierz) {
    const N = this.N, kod = this.kod, sc = this.sc;
    const x0 = Math.floor(px) - (N >> 1), z0 = Math.floor(pz) - (N >> 1);
    this.x0 = x0; this.z0 = z0; this.px = px; this.pz = pz;
    for (let j = 0; j < N; j++) {                               // okno ← maski chunków (odcinkami)
      const z = z0 + j, czI = Math.floor((z + 20) / CHUNK), lz = z + 20 - czI * CHUNK;
      let i = 0;
      while (i < N) {
        const x = x0 + i, cxI = Math.floor((x + 20) / CHUNK), lx = x + 20 - cxI * CHUNK;
        const run = Math.min(CHUNK - lx, N - i), m = pobierz(cxI, czI), o = j * N + i;
        if (m) { const s = lz * CHUNK + lx, a = m.nav, b = m.sciany; for (let k = 0; k < run; k++) { kod[o + k] = a[s + k]; sc[o + k] = b[s + k]; } }
        else for (let k = 0; k < run; k++) { kod[o + k] = 0; sc[o + k] = 0; }
        i += run;
      }
    }
    const dist = this.dist, gl = this.glowa, pula = this.pula, nast = this.nast, cap = this.cap;
    dist.fill(INF); gl.fill(-1);
    let pn = 0, zywe = 0;
    const pi = Math.floor(px) - x0, pj = Math.floor(pz) - z0, c0 = pj * N + pi;
    if (kod[c0] < 2) { dist[c0] = 0; pula[pn] = c0; nast[pn] = gl[0]; gl[0] = pn++; zywe++; }
    else {                                                      // gracz na dachu garażu / przy ścianie: źródła wokół
      for (let dj = -5; dj <= 5; dj++) for (let di = -5; di <= 5; di++) {
        const i = pi + di, j = pj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const c = j * N + i;
        if (kod[c] >= 2) continue;
        const d = Math.round(5 * Math.hypot(di, dj));
        if (d > 25 || d >= dist[c]) continue;
        dist[c] = d; pula[pn] = c; nast[pn] = gl[d & 31]; gl[d & 31] = pn++; zywe++;
      }
    }
    let cur = 0, maxD = 0;
    while (zywe > 0) {
      const b = cur & 31, e = gl[b];
      if (e < 0) { cur++; continue; }
      gl[b] = nast[e]; zywe--;
      const c = pula[e];
      if (dist[c] !== cur) continue;                            // nieaktualny wpis (komórka ma już krótszą drogę)
      maxD = cur;
      const i = c % N, j = (c - i) / N;
      for (let k = 0; k < 8; k++) {
        const ni = i + DI[k], nj = j + DJ[k];
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nc = nj * N + ni, kk = kod[nc];
        if (kk >= 2) continue;
        if (k >= 4 && (kod[j * N + ni] >= 2 || kod[nj * N + i] >= 2)) continue;   // bez ścinania narożników
        const nd = cur + (k < 4 ? 5 : 7) * (kk === 1 ? 4 : 1);
        if (nd < dist[nc]) {
          dist[nc] = nd;
          if (pn < cap) { pula[pn] = nc; nast[pn] = gl[nd & 31]; gl[nd & 31] = pn++; zywe++; }
        }
      }
    }
    this.zasieg = maxD / 5;
    this.gen++; this.gotowa = true;
  }
  _c(x, z) {                                                    // indeks komórki albo -1 poza oknem
    const i = Math.floor(x) - this.x0, j = Math.floor(z) - this.z0, N = this.N;
    return (i < 0 || j < 0 || i >= N || j >= N) ? -1 : j * N + i;
  }
  kodW(x, z) { const c = this._c(x, z); return c < 0 ? 0 : this.kod[c]; }
  scianaW(x, z) { const c = this._c(x, z); return c >= 0 && this.sc[c] === 1; }
  drogaW(x, z) { const c = this._c(x, z); return c < 0 || this.dist[c] === INF ? -1 : this.dist[c] / 5; }
  // kierunek marszu wg pola (out.x/out.z znormalizowane, out.L = długość drogi w j.); false = poza oknem / u celu
  kierunek(x, z, out) {
    if (!this.gotowa) return false;
    const N = this.N, i = Math.floor(x) - this.x0, j = Math.floor(z) - this.z0;
    if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) return false;
    const dist = this.dist, kod = this.kod, c = j * N + i;
    if (dist[c] === INF) {                                      // w marginesie ściany / na aucie: do najlepszego sąsiada
      let best = -1, bd = INF;
      for (let k = 0; k < 8; k++) { const nc = (j + DJ[k]) * N + i + DI[k]; if (dist[nc] < bd) { bd = dist[nc]; best = nc; } }
      if (best < 0) return false;
      const bi = best % N, bj = (best - bi) / N;
      let dx = bi + 0.5 - (x - this.x0), dz = bj + 0.5 - (z - this.z0);
      const l = Math.hypot(dx, dz) || 1;
      out.x = dx / l; out.z = dz / l; out.L = 1e6;              // „zawsze za polem": prosto = dalej w ścianę
      return true;
    }
    // w pamięci podręcznej komórki jest PUNKT DOCELOWY (środek komórki kilka kroków dalej), nie kierunek:
    // kierunek liczymy z faktycznej pozycji wroga, więc przy licu ściany ściąga go na środek wolnego pasa
    // (kierunek ze środka komórki prowadził „równolegle do ściany" i zahaczał o narożnik — wróg stał w rogu)
    if (this.st[c] === this.gen) return this._naCel(x, z, this.fx[c], this.fz[c], dist[c], out);
    let cur = c;
    for (let s = 0; s < 4; s++) {                               // do 4 kroków w dół pola = gładszy kierunek niż 8 kątów
      const ci = cur % N, cj = (cur - ci) / N;
      let best = -1, bd = dist[cur];
      for (let k = 0; k < 8; k++) {
        const ni = ci + DI[k], nj = cj + DJ[k];
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nc = nj * N + ni;
        if (dist[nc] >= bd) continue;
        if (k >= 4 && (kod[cj * N + ni] >= 2 || kod[nj * N + ci] >= 2)) continue;
        bd = dist[nc]; best = nc;
      }
      if (best < 0) break;
      // NIE ZA RÓG: prosta od komórki wroga do dalszego kroku nie może przeciąć nieprzechodniej komórki — inaczej
      // kierunek „na skos za narożnik" wciska wroga w róg bryły albo w słupek latarni (bot 10:00: 1% próbek „stoi")
      if (s > 0 && !this._linia(i, j, best % N, (best - best % N) / N)) break;
      cur = best;
    }
    if (cur === c) return false;
    const ci = cur % N, cj = (cur - ci) / N;
    this.fx[c] = this.x0 + ci + 0.5; this.fz[c] = this.z0 + cj + 0.5; this.st[c] = this.gen;
    return this._naCel(x, z, this.fx[c], this.fz[c], dist[c], out);
  }
  _naCel(x, z, tx, tz, d, out) {
    const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz);
    if (l < 1e-3) return false;
    out.x = dx / l; out.z = dz / l; out.L = d / 5;
    return true;
  }
  // czy odcinek między środkami komórek (i0,j0) → (i1,j1) omija komórki nieprzechodnie (próbki co ¼ j.)
  _linia(i0, j0, i1, j1) {
    const N = this.N, kod = this.kod, di = i1 - i0, dj = j1 - j0, n = Math.ceil(Math.hypot(di, dj) * 4);
    for (let s = 1; s < n; s++) {
      const t = s / n, i = Math.floor(i0 + 0.5 + di * t), j = Math.floor(j0 + 0.5 + dj * t);
      if (kod[j * N + i] >= 2) return false;
    }
    return true;
  }
  // najbliższa WOLNA komórka osiągalna z miejsca gracza (spirala do rMax) → out.x/out.z = jej środek.
  // `minDroga` (j.) = pomiń komórki, do których gracz ma bliżej (spawn w bryle nie może przeskoczyć na lico
  // bloku od strony gracza — wróg wyrastałby w kadrze i bliżej niż pierścień spawnu)
  najblizszyWolny(x, z, rMax, out, minDroga = 0) {
    const N = this.N, i = Math.floor(x) - this.x0, j = Math.floor(z) - this.z0;
    const kod = this.kod, dist = this.dist, pole = this.gotowa, minD = pole ? minDroga * 5 : 0;
    for (let r = 0; r <= rMax; r++) {
      let best = -1, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) {
        const krok = (dj === -r || dj === r) ? 1 : 2 * r;       // na brzegu pierścienia: cały rząd; w środku: tylko dwa końce
        for (let di = -r; di <= r; di += Math.max(1, krok)) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          const c = jj * N + ii;
          if (kod[c] !== 0 || (pole && (dist[c] === INF || dist[c] < minD))) continue;
          const d = di * di + dj * dj;
          if (d < bd) { bd = d; best = c; }
        }
      }
      if (best >= 0) { const bi = best % N; out.x = this.x0 + bi + 0.5; out.z = this.z0 + (best - bi) / N + 0.5; return true; }
    }
    return false;
  }
  // czy odcinek nie przechodzi przez ścianę (próbki co 0,5 j.; poza oknem = widać)
  widac(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) / 0.5);
    for (let s = 1; s < n; s++) { const t = s / n; if (this.scianaW(x0 + dx * t, z0 + dz * t)) return false; }
    return true;
  }
}
