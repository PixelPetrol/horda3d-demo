// ╔══════════════ MARKET — UKŁAD CHUNKA (30.09.2026) ══════════════╗
// Czysty moduł (bez THREE, bez Math.random): `ukladChunka(cx, cz, rng)` → co stoi w chunku 40 × 40 j.
// Wygląd liczy lib/modele-market.js, kolizje i przewracanie — main.js (sekcja „PRZEWRACANE REGAŁY").
//
// ZASADY UKŁADU (życzenie właściciela 30.09: „ta mapa jest do poprawy mocno"):
//   • GŁÓWNE ALEJKI: pas 3 j. przy każdej krawędzi chunka jest ZAWSZE wolny → między chunkami biegnie
//     alejka 6 j., a co 40 j. krzyżują się dwie. Świat jest przez to spójny z definicji: żaden chunk nie
//     zamknie gracza, bo do każdego wnętrza prowadzą cztery boki.
//   • STREFY (jedna na chunk, z ziarna): regały (alejki różnej szerokości 2,8–6 j., 0–2 przecznice, rzędy
//     dłuższe i krótsze, czoła regałów z promocją), mrożonki (wyspy lad chłodniczych + regały napojów),
//     warzywa (otwarta hala ze stoiskami i skrzyniami), kasy (linia kas z taśmami, zagroda wózków),
//     promocja (palety w folii, piramidy puszek, kosze, wózki; na środku bywa wyspa 2 × 2 palet).
//     Chunk (0, 0) to zawsze promocja z pustym środkiem |x|, |z| < 7 (czysty spawn jak dawniej).
//   • ALEJKA MA ≥ 2 WYJŚCIA: rzędy regałów nie dochodzą do pasa głównej alejki, więc każda alejka
//     między rzędami jest otwarta z OBU końców (+ przecznice). Wyspy w halach stoją ≥ 2,2 j. od siebie.
//   • Wszystkie bryły są prostokątami osi (obrót co 90°) i NIE wychodzą poza chunk — także leżący regał
//     (2,35 j. od krawędzi podstawy) mieści się w pasie 3 j. własnego chunka.
//
// WYNIK (współrzędne ŚWIATA, oś Y w górę, wysokości od posadzki):
//   { cx, cz, strefa, podloga: [r, g, b] (odcień płytek strefy),
//     regaly:  [{ x, z, poZ, kier, kat, war }]   — moduły regału 4 × 1,6 j.; poZ = pada wzdłuż Z (długość wzdłuż X),
//                                                   kier = ±1 (w którą stronę pada), kat = dział 0..7, war = wariant 0/1
//     obiekty: [{ typ, x, z, rot, w, d, h, war, kat, n? }] — rot 0/1 (1 = obrót o 90°: w leży wzdłuż Z),
//                                                   w × d = obrys (przed obrotem), h = wierzch (do wskoczenia)
//     plamy:   [{ x, z, r }] }                     — rozlana woda (ślisko; okrąg jak `onSpill` w main.js)
// Bryła obiektu: { x, z, hw: (rot ? d : w) / 2, hl: (rot ? w : d) / 2, top: h } — `brylaObiektu(o)`.
// ╚═════════════════════════════════════════════════════════════════╝

export const CHUNK = 40, POL = CHUNK / 2, MARG = 3.0, WN = POL - MARG;   // wnętrze chunka: |u|, |v| ≤ 17
// moduł regału (gondola dwustronna): długość, głębokość, wysokość, pół-grubość bryły, wierzch bryły
export const REGAL = { dl: 4.0, gl: 1.6, wys: 2.3, hl: 1.1, top: 2.46 };   // hl 1,1 > 0,8: sprite pochylony do kamery (22°) nie wchodzi głową w regał za plecami
// wymiary rekwizytów (w — wzdłuż X przy rot 0, d — wzdłuż Z, h — wierzch bryły; do wskoczenia < 1,6)
export const WYM = {
  paleta:   { w: 2.4, d: 1.8, h: 0.95 },   // paleta z kartonami w folii stretch
  kartony:  { w: 2.4, d: 1.8, h: 0.95 },   // paleta z luźnymi kartonami (bez folii), jeden karton wyżej (ozdoba)
  lada:     { w: 5.0, d: 2.0, h: 1.5 },    // wyspa chłodnicza (mrożonki pod szkłem)
  kasa:     { w: 1.1, d: 3.4, h: 1.0 },    // kasa z taśmą (taśma wzdłuż Z)
  wozek:    { w: 0.95, d: 1.55, h: 1.05 }, // wózek sklepowy (przodem do +Z)
  wozki:    { w: 0.95, d: 1.55, h: 1.05 }, // rząd wsuniętych wózków; d liczone z `n`
  kosz:     { w: 1.5, d: 1.0, h: 0.9 },    // kosz promocyjny z towarem
  piramida: { w: 1.7, d: 1.7, h: 1.2 },    // piramida puszek na palecie
  tablica:  { w: 0.9, d: 0.55, h: 1.25 },  // stojak z tablicą promocji (bez tekstu)
  stoisko:  { w: 3.0, d: 2.0, h: 0.95 },   // stoisko warzywne: skrzynki pochylone do alejki
  skrzynie: { w: 2.4, d: 1.8, h: 0.9 },    // 2 × 2 skrzynki warzyw na niskiej palecie
  koszyki:  { w: 0.72, d: 0.52, h: 0.75 }, // stos koszyków
  czolo:    { w: 1.6, d: 0.9, h: 1.0 },    // czoło regału: niska ekspozycja promocyjna (w = głębokość regału)
  owoce:    { w: 2.2, d: 1.4, h: 1.15 },   // stojak schodkowy z owocami
};
export const DZIALY = 8;                    // kategorie towaru na regałach (atlas: pas na dział)
export const SPAWN = 7;                     // |x|, |z| < 7 wokół (0, 0) — pusto

// ten sam generator co `chunkRng` w main.js (hash2 + LCG) — podgląd i testy dostają identyczny układ
export function hash2(ix, iz) {
  let n = ix * 374761393 + iz * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967295;
}
export function rngChunka(cx, cz) {
  let s = (hash2(cx, cz) * 4294967296) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function brylaObiektu(o) {
  return { x: o.x, z: o.z, hw: (o.rot ? o.d : o.w) / 2, hl: (o.rot ? o.w : o.d) / 2, top: o.h };
}
// bryła STOJĄCEGO modułu regału
export function brylaRegalu(r) {
  return r.poZ ? { x: r.x, z: r.z, hw: REGAL.dl / 2, hl: REGAL.hl, top: REGAL.top }
               : { x: r.x, z: r.z, hw: REGAL.hl, hl: REGAL.dl / 2, top: REGAL.top };
}

const wybierz = (R, tab) => tab[Math.floor(R() * tab.length) % tab.length];
const ODCIEN = {
  regaly: [1, 1, 1], mrozonki: [1, 1, 1],            // regały mają cień kontaktowy w geometrii instancji → odcień neutralny
  warzywa: [1.0, 0.885, 0.76], kasy: [0.93, 0.965, 1.0], promocja: [1.02, 0.975, 0.9],
};

// ============================== GŁÓWNA FUNKCJA ==============================
export function ukladChunka(cx, cz, rng = rngChunka(cx, cz)) {
  const R = rng, x0 = cx * CHUNK, z0 = cz * CHUNK;
  const start = cx === 0 && cz === 0;
  let strefa;
  if (start) strefa = 'promocja';
  else {
    const r = R();
    strefa = r < 0.48 ? 'regaly' : r < 0.60 ? 'mrozonki' : r < 0.74 ? 'warzywa' : r < 0.87 ? 'kasy' : 'promocja';
  }
  // budujemy w układzie lokalnym (u = x − x0, v = z − z0), na końcu przesuwamy do świata
  const L = { strefa, regaly: [], obiekty: [], plamy: [] };
  const wolne = zajetosc(L);
  if (strefa === 'regaly') strefaRegaly(L, R, wolne);
  else if (strefa === 'mrozonki') strefaMrozonki(L, R, wolne);
  else if (strefa === 'warzywa') strefaHali(L, R, wolne, 'warzywa', start);
  else if (strefa === 'kasy') strefaKas(L, R, wolne);
  else strefaHali(L, R, wolne, 'promocja', start);
  plamy(L, R, wolne, start);
  const out = { cx, cz, strefa, podloga: ODCIEN[strefa], regaly: [], obiekty: [], plamy: [] };
  for (const r of L.regaly) out.regaly.push({ ...r, x: r.x + x0, z: r.z + z0 });
  for (const o of L.obiekty) out.obiekty.push({ ...o, x: o.x + x0, z: o.z + z0 });
  for (const p of L.plamy) out.plamy.push({ ...p, x: p.x + x0, z: p.z + z0 });
  return out;
}

// zajętość w układzie lokalnym: lista prostokątów (regały + obiekty) — do rozstawiania hal i plam
function zajetosc(L) {
  return {
    prost: [],
    dodaj(x, z, hw, hl) { this.prost.push([x, z, hw, hl]); },
    // czy prostokąt (x, z, hw, hl) + odstęp `m` jest wolny i mieści się we wnętrzu
    wolny(x, z, hw, hl, m = 0) {
      if (Math.abs(x) + hw > WN + 1e-6 || Math.abs(z) + hl > WN + 1e-6) return false;
      for (const [px, pz, phw, phl] of this.prost)
        if (Math.abs(x - px) < hw + phw + m && Math.abs(z - pz) < hl + phl + m) return false;
      return true;
    },
  };
}
function dodajObiekt(L, wolne, typ, x, z, rot, o = {}) {
  const W = WYM[typ];
  const ob = { typ, x, z, rot: rot ? 1 : 0, w: W.w, d: o.d || W.d, h: W.h, war: o.war || 0, kat: o.kat == null ? 0 : o.kat };
  if (o.n != null) ob.n = o.n;
  L.obiekty.push(ob);
  const b = brylaObiektu(ob);
  wolne.dodaj(b.x, b.z, b.hw, b.hl);
  return ob;
}
// wózki wsunięte jeden w drugi: pierwszy 1,55 j., każdy następny +0,42 j.
const dlWozkow = n => WYM.wozki.d + (n - 1) * 0.42;

// ============================== STREFA: REGAŁY ==============================
// Rzędy modułów 4 j. prostopadle do osi upadku; alejki różnej szerokości; 0–2 przecznice wspólne dla rzędów
// (skrzyżowania); czasem rząd krótszy (kieszeń), czasem zamiast rzędu linia palet; na końcach rzędów — czoła.
const SZER = [2.8, 3.2, 3.6, 3.6, 4.2, 4.2, 4.8, 5.4, 6.2];
function rzedy(R, gl, szer, min = 0) {
  const rz = []; let a = -WN;
  for (;;) {
    rz.push(a + gl / 2); a += gl;
    const w = Math.max(min, wybierz(R, szer));
    if (a + w + gl > WN) break;
    rz.push(null); a += w;                                    // null = alejka (tylko do liczenia)
  }
  const sh = (WN - a) / 2;                                      // blok rzędów na środku chunka
  return rz.filter(v => v != null).map(v => v + sh);
}
function przecznice(R) {
  const r = R(), kr = [];
  if (r < 0.3) return kr;
  if (r < 0.8) kr.push([-4.5 + R() * 9, 3.2 + R() * 1.4]);
  else { kr.push([-11 + R() * 4.5, 3.0 + R() * 1.2]); kr.push([6.5 + R() * 4.5, 3.0 + R() * 1.2]); }
  return kr;
}
function odcinki(kr) {
  const seg = []; let s0 = -WN;
  for (const [c, w] of kr) { seg.push([s0, c - w / 2]); s0 = c + w / 2; }
  seg.push([s0, WN]);
  return seg;
}
// jeden rząd: moduły regału na odcinkach między przecznicami; zwraca liczbę postawionych modułów
function rzadRegalow(L, R, wolne, a, poZ, kier, seg, katy) {
  const U = REGAL.dl;
  let n0 = 0;
  for (let si = 0; si < seg.length; si++) {
    const [b0, b1] = seg[si];
    let n = Math.floor((b1 - b0 + 0.01) / U);
    if (n <= 0) continue;
    let lo = b0, hi = b1;
    if (n >= 2 && R() < 0.15) { n--; if (R() < 0.5) lo += U; else hi -= U; }   // krótszy rząd = kieszeń
    const st = (lo + hi) / 2 - n * U / 2;
    const kat = katy[si % katy.length];
    for (let k = 0; k < n; k++) {
      const b = st + (k + 0.5) * U;
      const x = poZ ? b : a, z = poZ ? a : b;
      L.regaly.push({ x, z, poZ, kier, kat, war: (k + si) & 1 });
      const br = brylaRegalu({ x, z, poZ });
      wolne.dodaj(br.x, br.z, br.hw, br.hl);
      n0++;
    }
    // CZOŁA regału (niskie ekspozycje) w wolnym miejscu przy końcach rzędu
    const lewo = st - lo, prawo = hi - (st + n * U);
    for (const [wolnego, bc] of [[lewo, st - WYM.czolo.d / 2], [prawo, st + n * U + WYM.czolo.d / 2]]) {
      if (wolnego < WYM.czolo.d + 0.15 || R() > 0.55) continue;
      const x = poZ ? bc : a, z = poZ ? a : bc;
      // rot: czoło ma w = głębokość regału (1,6) w poprzek rzędu → przy poZ (rząd wzdłuż X) obrót o 90°
      dodajObiekt(L, wolne, 'czolo', x, z, poZ ? 1 : 0, { kat: kat, war: Math.floor(R() * 3) });
    }
  }
  return n0;
}
function strefaRegaly(L, R, wolne) {
  const poZ = R() < 0.5;                        // true: rzędy wzdłuż X, padają wzdłuż Z
  const kier = R() < 0.5 ? 1 : -1;
  const rz = rzedy(R, REGAL.gl, SZER);
  const seg = odcinki(przecznice(R));
  let kat = Math.floor(R() * DZIALY);
  for (let i = 0; i < rz.length; i++) {
    const katy = R() < 0.3 ? [kat, (kat + 1 + Math.floor(R() * 6)) % DZIALY] : [kat];
    // czasem (nie w skrajnym rzędzie) zamiast regałów linia palet z kartonami — niski rząd, do przeskoczenia
    if (i > 0 && i < rz.length - 1 && R() < 0.1) liniaPalet(L, R, wolne, rz[i], poZ, seg);
    else rzadRegalow(L, R, wolne, rz[i], poZ, kier, seg, katy);
    kat = (kat + 1 + Math.floor(R() * 3)) % DZIALY;
  }
}
function liniaPalet(L, R, wolne, a, poZ, seg) {
  for (const [b0, b1] of seg) {
    const W = WYM.paleta.w, krok = W + 1.2;
    const n = Math.floor((b1 - b0 + 1.2) / krok);
    const st = (b0 + b1) / 2 - (n * krok - 1.2) / 2;
    for (let k = 0; k < n; k++) {
      const b = st + k * krok + W / 2;
      const typ = R() < 0.6 ? 'paleta' : 'kartony';
      // paleta leży długim bokiem wzdłuż rzędu: przy poZ (rząd wzdłuż X) rot 0
      if (wolne.wolny(poZ ? b : a, poZ ? a : b, (poZ ? W : WYM.paleta.d) / 2, (poZ ? WYM.paleta.d : W) / 2, 0.1))
        dodajObiekt(L, wolne, typ, poZ ? b : a, poZ ? a : b, poZ ? 0 : 1, { war: Math.floor(R() * 4), kat: Math.floor(R() * DZIALY) });
    }
  }
}

// ============================== STREFA: MROŻONKI ==============================
// rzędy wysp chłodniczych (5 × 2 j., wierzch 1,5) + 1–2 rzędy regałów z napojami/nabiałem
function strefaMrozonki(L, R, wolne) {
  const poZ = R() < 0.5, kier = R() < 0.5 ? 1 : -1;
  const GD = WYM.lada.d;
  const rz = rzedy(R, GD, [3.4, 3.8, 4.4, 5.0]);
  const seg = odcinki(przecznice(R));
  const regIdx = new Set([0, rz.length - 1].filter(() => R() < 0.6));   // skrajne rzędy bywają regałami
  for (let i = 0; i < rz.length; i++) {
    if (regIdx.has(i)) {
      // regał (1,6) w miejscu lady (2,0): przesunięty do zewnątrz, żeby alejka do wnętrza nie zwężała się
      const a = rz[i] + (i === 0 ? -1 : 1) * (GD - REGAL.gl) / 2;
      rzadRegalow(L, R, wolne, a, poZ, i === 0 ? -1 : 1, seg, [R() < 0.5 ? 1 : 7]);   // napoje / nabiał, padają na zewnątrz
      continue;
    }
    for (const [b0, b1] of seg) {
      const U = WYM.lada.w;
      let n = Math.floor((b1 - b0 + 0.01) / U);
      if (n <= 0) continue;
      if (n >= 2 && R() < 0.25) n--;
      const st = (b0 + b1) / 2 - n * U / 2;
      for (let k = 0; k < n; k++) {
        const b = st + (k + 0.5) * U;
        dodajObiekt(L, wolne, 'lada', poZ ? b : rz[i], poZ ? rz[i] : b, poZ ? 0 : 1, { war: (k + i) & 1 });
      }
    }
  }
}

// ============================== STREFY: HALA WARZYW / PROMOCJA ==============================
// Siatka wysp z drganiem; każda wyspa sprawdzana z odstępem 2,2 j. od sąsiadów (przejścia, bez szczelin).
function strefaHali(L, R, wolne, rodzaj, start) {
  const war = rodzaj === 'warzywa';
  const su = war ? 7.0 : 5.9, sv = war ? 6.4 : 5.8, nu = war ? 5 : 6, nv = war ? 5 : 6;
  // PROMOCJA NA ŚRODKU: wyspa 2 × 2 palet (4,8 × 3,6) na środku części hal promocyjnych (nie na spawnie)
  let srodek = false;
  if (!war && !start && R() < 0.55) {
    srodek = true;
    for (const [du, dv] of [[-1.25, -0.95], [1.25, -0.95], [-1.25, 0.95], [1.25, 0.95]])
      dodajObiekt(L, wolne, R() < 0.7 ? 'paleta' : 'kartony', du, dv, 0, { war: Math.floor(R() * 4), kat: Math.floor(R() * DZIALY) });
    dodajObiekt(L, wolne, 'tablica', 0, -3.9, 0, { war: Math.floor(R() * 3) });   // 1,8 j. od palet (bez szczeliny)
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const u = (i - (nu - 1) / 2) * su + (R() - 0.5) * 1.2;
    const v = (j - (nv - 1) / 2) * sv + (R() - 0.5) * 1.0;
    const los = R(), rot = R() < 0.5 ? 1 : 0, wr = Math.floor(R() * 4), kat = Math.floor(R() * DZIALY);
    if (srodek && Math.abs(u) < 5.5 && Math.abs(v) < 5) continue;
    let typ;
    if (war) typ = los < 0.42 ? 'stoisko' : los < 0.7 ? 'skrzynie' : los < 0.8 ? 'owoce' : los < 0.86 ? 'wozek' : los < 0.91 ? 'koszyki' : null;
    else typ = los < 0.26 ? 'paleta' : los < 0.38 ? 'kartony' : los < 0.52 ? 'piramida' : los < 0.66 ? 'kosz' : los < 0.77 ? 'wozek'
             : los < 0.84 ? 'tablica' : los < 0.93 ? 'lada' : los < 0.97 ? 'koszyki' : null;
    if (!typ) continue;
    const W = WYM[typ], hw = (rot ? W.d : W.w) / 2, hl = (rot ? W.w : W.d) / 2;
    if (start && Math.abs(u) - hw < SPAWN + 1 && Math.abs(v) - hl < SPAWN + 1) continue;   // czysty spawn (obrys, nie środek)
    if (!wolne.wolny(u, v, hw, hl, war ? 2.2 : 1.8)) continue;
    dodajObiekt(L, wolne, typ, u, v, rot, { war: wr, kat });
    // przy stoisku/koszu czasem stos koszyków albo wózek obok (drobne, ale nie w szczelinie)
    if (war && typ === 'stoisko' && R() < 0.35) {
      const ku = u + (rot ? 0 : hw + 2.0), kv = v + (rot ? hl + 2.0 : 0);
      if (wolne.wolny(ku, kv, WYM.koszyki.w / 2, WYM.koszyki.d / 2, 1.4)) dodajObiekt(L, wolne, 'koszyki', ku, kv, 0, {});
    }
  }
}

// ============================== STREFA: KASY ==============================
// Linia 6–8 kas w poprzek chunka (przejścia 2,4 j. między kasami, oba końce linii otwarte), za nią zagroda
// wózków i koszyki, przed nią kilka wózków „w kolejce", po bokach palety/kosze promocyjne.
function strefaKas(L, R, wolne) {
  const naX = R() < 0.5;                        // linia kas wzdłuż X (kasy z taśmą wzdłuż Z)
  const q0 = -3 + R() * 6, pitch = WYM.kasa.w + 2.4;
  const n = 6 + Math.floor(R() * 3);
  const span = n * pitch - 2.4, p0 = -span / 2 + WYM.kasa.w / 2;
  const P = (p, q) => (naX ? [p, q] : [q, p]);
  for (let k = 0; k < n; k++) {
    const [x, z] = P(p0 + k * pitch, q0);
    dodajObiekt(L, wolne, 'kasa', x, z, naX ? 0 : 1, { war: k & 1, kat: k });
  }
  // za kasami: zagroda wózków (rząd wsuniętych) i stos koszyków
  const nW = 5 + Math.floor(R() * 4), dW = dlWozkow(nW);
  const pW = -6 + R() * 12, qW = q0 + 7.5;
  {
    const [x, z] = P(pW, qW);
    // wózki jadą wzdłuż linii kas: przy naX (linia wzdłuż X) rząd wózków wzdłuż X → rot 1 (d leży wzdłuż X)
    if (wolne.wolny(x, z, (naX ? dW : WYM.wozki.w) / 2, (naX ? WYM.wozki.w : dW) / 2, 1.2))
      dodajObiekt(L, wolne, 'wozki', x, z, naX ? 1 : 0, { d: dW, n: nW });
  }
  for (const dp of [-1, 1]) {
    const [x, z] = P(pW + dp * (dW / 2 + 2.2), qW);
    if (R() < 0.7 && wolne.wolny(x, z, WYM.koszyki.w / 2, WYM.koszyki.d / 2, 1.2)) dodajObiekt(L, wolne, 'koszyki', x, z, 0, {});
  }
  // przed kasami: pojedyncze wózki w kolejce (obrócone przodem do kas)
  for (let k = 0; k < n; k++) {
    if (R() > 0.35) continue;
    const [x, z] = P(p0 + k * pitch + pitch / 2, q0 - 4.2 - R() * 1.5);
    if (wolne.wolny(x, z, 0.5, 0.8, 1.3)) dodajObiekt(L, wolne, 'wozek', x, z, naX ? 0 : 1, { war: Math.floor(R() * 2) });
  }
  // dalej od linii: palety, kosze i tablice promocji (jak hala, rzadziej)
  for (let i = 0; i < 5; i++) for (const strona of [-1, 1]) {
    if (R() > 0.45) continue;
    const q = strona > 0 ? q0 + 12 + R() * 2 : q0 - 10.5 - R() * 3;
    const p = (i - 2) * 6.5 + (R() - 0.5) * 1.5;
    const typ = wybierz(R, ['paleta', 'kosz', 'kartony', 'tablica', 'piramida']);
    const W = WYM[typ], rot = naX ? 0 : 1;
    const [x, z] = P(p, q);
    const hw = (rot ? W.d : W.w) / 2, hl = (rot ? W.w : W.d) / 2;
    if (wolne.wolny(x, z, hw, hl, 2.2)) dodajObiekt(L, wolne, typ, x, z, rot, { war: Math.floor(R() * 4), kat: Math.floor(R() * DZIALY) });
  }
}

// ============================== ROZLANA WODA ==============================
// 75% chunków: 1–3 plamy (jak dawniej), promień 1,6–3,4 j., środek w wolnym miejscu (alejka, hala).
function plamy(L, R, wolne, start) {
  if (R() > 0.75) return;
  const n = 1 + Math.floor(R() * 3);
  for (let i = 0, prob = 0; i < n && prob < 30; prob++) {
    const u = (R() - 0.5) * 2 * (POL - 1.5), v = (R() - 0.5) * 2 * (POL - 1.5);
    const r = 1.6 + R() * 1.8;
    if (start && Math.abs(u) < SPAWN && Math.abs(v) < SPAWN) continue;
    if (Math.abs(u) + r * 0.6 > POL || Math.abs(v) + r * 0.6 > POL) continue;
    // środek i 60% promienia na wolnej posadzce (brzeg może wejść pod regał — tam i tak nie widać)
    if (!wolne.wolny(u, v, r * 0.45, r * 0.45, 0) && !(Math.abs(u) > WN || Math.abs(v) > WN)) continue;
    if (L.plamy.some(p => Math.hypot(p.x - u, p.z - v) < p.r + r + 1)) continue;
    L.plamy.push({ x: u, z: v, r });
    i++;
  }
}
