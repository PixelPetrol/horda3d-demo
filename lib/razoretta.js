// ╔══════════════ RADISHETTA RAZORETTA — PROTOTYP POSTACI 3D (02.10.2026) ══════════════╗
// Druga postać 3D (po Czekotubce), na razie TYLKO prototyp do oceny (nie wpięta w grę).
// Biblia postaci, rozdz. 5: mała czerwona rzodkiewka z białą końcówką jak sportowe skarpetki, liście związane
// wysoko w bojowy kucyk, kolczyki-kółka, balon z gumy do żucia, plaster na policzku, krótka spódniczka mundurka
// + trampki, w dłoni otwarty piórnik z podejrzanie ostrymi linijkami i cyrklami. Postrach ostatniej ławki:
// zadziorna, pewna siebie („No i co mi zrobisz?"). Kolory i cechy z renderu HD menu i sprite'a z gry.
//
// API (TO SAMO co lib/czekotubka.js — wpięcie w grę = ten sam adapter co GraczCzekotubka):
//   const r = stworzRazorette(THREE, opcje)
//     → { grupa, efekty, ustawStan(stan), update(dt, { predkosc, kierunek, wPowietrzu, vy, ziemia, szybuje }), dispose(), … }
//   stany: 'auto' (domyślny: idle/chód/bieg wg prędkości), 'idle', 'chod', 'bieg', 'skok', 'atak',
//          'oberwal', 'smierc', 'wygrana'. 'atak' i 'oberwal' to WARSTWY nakładane na bieżący ruch.
//   opcje: { scena (tu trafiają efekty w układzie świata), skala, obrys, chmury: { tex, off, skala },
//            ziemia: (x, z) => y dla okruchów gumy, ziarno, wysokoscSkoku, kopia: { krycie, bias } }
//   reszta jak u Czekotubki: reset(), dlon(s, out), chmury(0|1), zasiegStrumienia(k) (= zasiegAtaku: wielkość łuku cięcia),
//   uniform `uBlyskKol` (kolor błysku trafienia), wymusTwarz(n), kat, info, _st.
//
// BUDOWA (1 draw call postaci + 1 łuki cięć + 1 okruchy gumy, + cień; łuki i okruchy tylko gdy są):
//   • jedna SkinnedMesh, 30 kości: biodra, korpus (dół kuli), klatka (góra kuli z twarzą), gumka i 3 kości kucyka,
//     2 kolczyki, balon, ramię/łokieć/dłoń ×2, piórnik, scyzoryk, udo/kolano/stopa ×2, 4 klapy spódniczki.
//     Kucyk, kolczyki i spódniczka mają SPRĘŻYNY (bezwładność z ruchu punktu zaczepienia + opór powietrza z prędkości).
//   • kolor w wierzchołkach; twarz = atlas z canvas (4×3 komórki 256 px) nakładany w shaderze na przód kuli
//     wg KĄTÓW pozycji spoczynkowej (rzut sferyczny — bez rozciągania na boki, bez UV); tęczówki = osobna warstwa
//     przesuwana uniformem, przycięta białkiem. Krata spódniczki liczona w shaderze (granat/bordo, bez tekstury,
//     z wygładzaniem fwidth i przejściem w kolor średni z daleka — bez migotania).
//   • materiał: Lambert + 3 pasma toon i ton cienia jak `materialSkrzyn`/Czekotubka, ostry blask (skórka rzodkiewki,
//     balon, metal), pasek „studyjny" na metalu, pasmo na sylwetce, prześwit liści pod słońce, biały błysk trafienia,
//     cień chmur liczony TU (nie owijać `addCloudShadow`), własny customProgramCacheKey.
//   • kontur = odwrócona powłoka w tej samej geometrii (aFx.z = grubość), odsuwana PO skinningu → stała grubość.
// Układ: Y w górę, przód = +Z, środek podstawy w (0, 0, 0); lewa ręka postaci = +X (piórnik), prawa = −X (scyzoryk).
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
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const kros = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
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
// Sprite Razoretty w grze: 59 px × 1,2 / 46 = 1,54 j. z kucykiem (Carrotello 1,62). Model przy skali 1: kula do 1,29 j., czubek liści 1,82 j.
export const WYMIARY = {
  cy: 0.86, R: 0.44, kx: 1.03, ky: 0.97, kz: 0.99,   // kula-rzodkiewka: środek, promień, spłaszczenie
  talia: 0.565, taliaR: 0.338, rabek: 0.355, rabekR: 0.53, // spódniczka
  biodroX: 0.14, biodroY: 0.42, kolanoY: 0.27, kostkaY: 0.12,
  barkX: 0.355, barkY: 0.66, lokiecX: 0.505, dlonX: 0.645,
  wys: 1.82,
};
const D = WYMIARY;
// twarz: kąty na kuli (rzut sferyczny od środka kuli, po zdjęciu spłaszczenia). Komórka atlasu = ±FA rad w obu osiach.
const FA = 0.95;
const AX = th => (th / (2 * FA) + 0.5) * 256, AY = ph => (0.5 - ph / (2 * FA)) * 256;
const TW = { okoTh: 0.37, okoPh: 0.17, ustaTh: 0.03, ustaPh: -0.27, balonTh: 0.13, balonPh: -0.29, plasterTh: -0.62, plasterPh: -0.07 };

// ============================== KOLORY ==============================
const KOL = {
  obrysCialo: lin(0x3c0716), obrysLisc: lin(0x163d0e), obrysSpod: lin(0x0a0d22), obrysRzecz: lin(0x3a0f2a), obrysMetal: lin(0x262b3a),
  obrysBut: lin(0x4a2338), obrysBalon: lin(0x7a1450),
  czerwien: lin(0xff3350), czerwienGora: lin(0xe0203f), biel: lin(0xfff4f2), roz: lin(0xffd2d8),
  reka: lin(0xf02a46), dlon: lin(0xff3d55),
  opaska: lin(0xfbfbfb), opaskaPasek: lin(0xff4f93),
  noga: lin(0xf02a46), skarpeta: lin(0xf8f8f6), skarpetaPasek: lin(0xd21f3c),
  but: lin(0xf8f5f7), butRoz: lin(0xff5aa0), podeszwa: lin(0xf3eef1), podeszwaPasek: lin(0xff4f93), bieznik: lin(0xb8889c),
  sznurowka: lin(0xff4f93), wnetrzeButa: lin(0x3a2333),
  spodWnetrze: lin(0x4a1530), pasek: lin(0x182044),
  lisc: lin(0x3fb236), liscJasny: lin(0x66cf43), liscZyla: lin(0xbdee7c), liscSpod: lin(0x2a7f26), ogonek: lin(0xe0466e), ogonekZ: lin(0x86c440),
  gumka: lin(0x1d1b26),
  srebro: lin(0xe6ebf3),
  balon: lin(0xff86c6),
  piornik: lin(0xff4f9e), piornikCiemny: lin(0xc42c74), piornikWnetrze: lin(0x3c1434), zamek: lin(0x2a2236), naklejka: lin(0xfff6cf),
  linijka: lin(0xdde3ec), linijkaKreska: lin(0x7d879b), cyrkiel: lin(0xcfd6e2), cyrkielGlowka: lin(0x2ab3a5),
  olowekZ: lin(0xffd23a), olowekN: lin(0x3ab4ff), drewno: lin(0xf1c48a), grafit: lin(0x2d2d36), gumkaOl: lin(0xff8fb5), okucie: lin(0xc8ccd6),
  nozRaczka: lin(0x9e1230), noz: lin(0xf2f6fb), nozNit: lin(0xe3e7ef),
};
// kula: dół biały („sportowe skarpetki"), przejście przez róż, czerwień, ciemniejszy karmazyn przy liściach
function kolorCiala(y) {
  const tB = sstep(0.61, 0.73, y);
  let k = tB < 0.5 ? miesz(KOL.biel, KOL.roz, tB * 2) : miesz(KOL.roz, KOL.czerwien, (tB - 0.5) * 2);
  k = miesz(k, KOL.czerwienGora, 0.7 * sstep(1.1, 1.29, y));
  return k;
}

// ============================== KOŚCI ==============================
// [nazwa, rodzic, pozycja spoczynkowa w świecie (null = liczona), kolejność Eulera]
const KOSCI = [
  ['root', -1, [0, 0, 0], 'YXZ'],
  ['biodra', 0, [0, D.biodroY, 0], 'YXZ'],
  ['korpus', 1, [0, 0.46, 0], 'YXZ'],
  ['klatka', 2, [0, D.cy, 0], 'YXZ'],
  ['gumka', 3, null, 'YXZ'], ['kucyk0', 4, null, 'YXZ'], ['kucyk1', 5, null, 'YXZ'], ['kucyk2', 6, null, 'YXZ'],
  ['kolczykL', 3, null, 'XYZ'], ['kolczykP', 3, null, 'XYZ'],
  ['balon', 3, null, 'XYZ'],
  ['ramieL', 2, [D.barkX, D.barkY, 0], 'YZX'], ['lokiecL', 11, [D.lokiecX, D.barkY, 0], 'YZX'], ['dlonL', 12, [D.dlonX, D.barkY, 0], 'YZX'],
  ['ramieP', 2, [-D.barkX, D.barkY, 0], 'YZX'], ['lokiecP', 14, [-D.lokiecX, D.barkY, 0], 'YZX'], ['dlonP', 15, [-D.dlonX, D.barkY, 0], 'YZX'],
  ['piornik', 13, null, 'XYZ'], ['noz', 16, null, 'XYZ'],
  ['udoL', 1, [D.biodroX, D.biodroY, 0], 'YXZ'], ['kolanoL', 19, [D.biodroX, D.kolanoY, 0], 'YXZ'], ['stopaL', 20, [D.biodroX, D.kostkaY, 0], 'YXZ'],
  ['udoP', 1, [-D.biodroX, D.biodroY, 0], 'YXZ'], ['kolanoP', 22, [-D.biodroX, D.kolanoY, 0], 'YXZ'], ['stopaP', 23, [-D.biodroX, D.kostkaY, 0], 'YXZ'],
  ['spP', 1, [0, D.talia, D.taliaR], 'XYZ'], ['spT', 1, [0, D.talia, -D.taliaR], 'XYZ'], ['spL', 1, [D.taliaR, D.talia, 0], 'XYZ'], ['spR', 1, [-D.taliaR, D.talia, 0], 'XYZ'],
];
const K = Object.fromEntries(KOSCI.map((k, i) => [k[0], i]));
const NB = KOSCI.length;
const RAMIE = { 1: K.ramieL, [-1]: K.ramieP }, LOKIEC = { 1: K.lokiecL, [-1]: K.lokiecP }, DLON = { 1: K.dlonL, [-1]: K.dlonP };
const UDO = { 1: K.udoL, [-1]: K.udoP }, KOLANO = { 1: K.kolanoL, [-1]: K.kolanoP }, STOPA = { 1: K.stopaL, [-1]: K.stopaP };
const SPODN = [K.spP, K.spL, K.spT, K.spR];        // klapy: przód (+Z), lewa (+X), tył (−Z), prawa (−X)
const SPODN_KAT = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];

// ============================== KULA-RZODKIEWKA ==============================
// th: 0 = +X, π/2 = +Z (przód); ph: 0 = dół, π = góra. Lekko spłaszczona, z dołu krótki szpic (korzonek).
function cialoPkt(th, ph) {
  const s = Math.sin(ph), c = Math.cos(ph), tip = 1 - sstep(0, 0.85, ph), rr = 1 - 0.16 * tip * tip;
  return [D.R * D.kx * s * Math.cos(th) * rr, D.cy - D.R * D.ky * c - 0.055 * tip * tip, D.R * D.kz * s * Math.sin(th) * rr];
}
// punkt na kuli w kierunku twarzy (kąty jak w atlasie: th od przodu, + = lewa postaci, ph od równika)
function naTwarzy(th, ph, odsun = 0) {
  const d = [Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)];
  const p = [d[0] * D.R * D.kx, D.cy + d[1] * D.R * D.ky, d[2] * D.R * D.kz];
  const n = norm3([d[0] / D.kx, d[1] / D.ky, d[2] / D.kz]);
  return { p: [p[0] + n[0] * odsun, p[1] + n[1] * odsun, p[2] + n[2] * odsun], n };
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
// pierścienie (nr × nc, zawinięte w kolumnach) + opcjonalne bieguny → indeksowana BufferGeometry z gładkimi normalnymi.
// Nawinięcie wybiera głosowanie: normalna trójkąta ma patrzeć OD osi (`os(r)` = punkt na osi dla pierścienia r).
function pierscienie(THREE, P, nr, nc, os, dolny = null, gorny = null) {
  const pos = P.slice(), I = [], ring = [];
  for (let r = 0; r < nr - 1; r++) for (let j = 0; j < nc; j++) {
    const j1 = (j + 1) % nc, a = r * nc + j, b = r * nc + j1, c = (r + 1) * nc + j1, d = (r + 1) * nc + j;
    I.push(a, b, c, a, c, d); ring.push(r, r);
  }
  if (dolny) { const iD = pos.length / 3; pos.push(dolny[0], dolny[1], dolny[2]); for (let j = 0; j < nc; j++) { I.push(iD, (j + 1) % nc, j); ring.push(0); } }
  if (gorny) { const iG = pos.length / 3, o = (nr - 1) * nc; pos.push(gorny[0], gorny[1], gorny[2]); for (let j = 0; j < nc; j++) { I.push(iG, o + j, o + (j + 1) % nc); ring.push(nr - 1); } }
  let glos = 0;
  for (let t = 0; t < I.length; t += 3) {
    const A = I[t] * 3, B = I[t + 1] * 3, C = I[t + 2] * 3;
    const u = [pos[B] - pos[A], pos[B + 1] - pos[A + 1], pos[B + 2] - pos[A + 2]], v = [pos[C] - pos[A], pos[C + 1] - pos[A + 1], pos[C + 2] - pos[A + 2]];
    const n = kros(u, v), o = os(ring[t / 3]);
    const cen = [(pos[A] + pos[B] + pos[C]) / 3 - o[0], (pos[A + 1] + pos[B + 1] + pos[C + 1]) / 3 - o[1], (pos[A + 2] + pos[B + 2] + pos[C + 2]) / 3 - o[2]];
    glos += Math.sign(dot3(n, cen));
  }
  if (glos < 0) for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}
// kapsuła / rurka wzdłuż +Y: prof = [[y, r], …] od dołu, końce zaokrąglone półkulami
function kapsula(THREE, prof, seg) {
  const pts = [], r0 = prof[0][1], r1 = prof[prof.length - 1][1], y0 = prof[0][0], y1 = prof[prof.length - 1][0];
  for (let i = 0; i <= 3; i++) { const f = -Math.PI / 2 + (i / 3) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(f) * r0), y0 + Math.sin(f) * r0)); }
  for (let i = 1; i < prof.length - 1; i++) pts.push(new THREE.Vector2(prof[i][1], prof[i][0]));
  for (let i = 0; i <= 3; i++) { const f = (i / 3) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(f) * r1), y1 + Math.sin(f) * r1)); }
  return new THREE.LatheGeometry(pts, seg);
}
function kula(THREE, seg, pier, o = {}) {
  return new THREE.SphereGeometry(1, seg, pier, 0, TAU, o.od || 0, o.do || Math.PI);
}
function macierz(THREE, { t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], kol = 'XYZ', q = null } = {}) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(...t), q || new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], kol)), new THREE.Vector3(...s));
  return m;
}
// odcinek (walec/stożek) z punktu a do b: geometria wzdłuż +Y długości 1, środek w 0 → macierz
function odcinek(THREE, a, b, sk = [1, 1]) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(d[0] / L, d[1] / L, d[2] / L));
  return macierz(THREE, { t: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], q, s: [sk[0], L, sk[1]] });
}
// sklejenie wierzchołków o tych samych pozycjach (szew Lathe) → gładkie normalne bez rysy
function mergeVerts(THREE, g) {
  const p = g.attributes.position, mapa = new Map(), P = [], idx = [], re = [];
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
  o.computeVertexNormals();
  return o;
}

// ============================== CZĘŚCI ==============================
// aFx: x = typ (1 skórka z twarzą, 2 krata spódniczki, 3 liść), y = połysk (≥ 0,95 = metal z paskiem studyjnym),
//      z = grubość konturu (tylko powłoka), w = jasność własna (biel ma być BIAŁA)
const OB = (k, w = 1) => ({ k, w });
const wagiKuli = p => { const w = sstep(0.66, 1.0, p[1]); return [[K.korpus, 1 - w], [K.klatka, w]]; };

function czCialo(THREE, b) {
  const NC = 32, NR = 20, P = [];
  const fi = r => Math.PI * (r + 1) / (NR + 1);
  for (let r = 0; r < NR; r++) for (let j = 0; j < NC; j++) { const q = cialoPkt(TAU * j / NC, fi(r)); P.push(q[0], q[1], q[2]); }
  const g = pierscienie(THREE, P, NR, NC, () => [0, D.cy, 0], cialoPkt(0, 0), cialoPkt(0, Math.PI));
  b.dodaj(THREE, g, { kol: p => kolorCiala(p[1]), kosc: wagiKuli, fx: p => [1, 0.8, 0, 0.1 + 0.32 * (1 - sstep(0.6, 0.72, p[1]))], obrys: OB(KOL.obrysCialo, 1) });
  g.dispose();
}

// spódniczka w zakładki (piła: ostry uskok co zakładkę) + wewnętrzna ścianka + rąbek + pasek w talii
function czSpodniczka(THREE, b) {
  const NZ = 14, NC = NZ * 4, NR = 7, PILA = [1, 0.33, -0.33, -1];
  const zew = [], wew = [];
  const rH = h => lerp(D.taliaR, D.rabekR, Math.pow(h, 0.85)), yH = h => lerp(D.talia, D.rabek, h), aH = h => 0.026 * sstep(0.05, 0.7, h);
  for (let r = 0; r < NR; r++) {
    const h = r / (NR - 1);
    for (let j = 0; j < NC; j++) {
      const th = TAU * (j + 0.5) / NC, rr = rH(h) + aH(h) * PILA[j % 4];
      zew.push(Math.cos(th) * rr, yH(h), Math.sin(th) * rr * 0.97);
      const ri = rr - 0.014 - 0.006 * (1 - h);
      wew.push(Math.cos(th) * ri, yH(h) + 0.002, Math.sin(th) * ri * 0.97);
    }
  }
  const wagi = p => {
    const h = clamp((D.talia - p[1]) / (D.talia - D.rabek), 0, 1), th = Math.atan2(p[2], p[0]);
    const wk = Math.pow(h, 1.4) * 0.92, l = [];
    l.push([K.korpus, (1 - wk) * (1 - sstep(0, 0.35, h)) * 0.55], [K.biodra, (1 - wk) * (1 - 0.55 * (1 - sstep(0, 0.35, h)))]);
    for (let q = 0; q < 4; q++) { const c = Math.cos(th - SPODN_KAT[q]); if (c > 0) l.push([SPODN[q], wk * c * c]); }
    return l;
  };
  const os = r => [0, yH(r / (NR - 1)), 0];
  const gz = pierscienie(THREE, zew, NR, NC, os);
  b.dodaj(THREE, gz, { kol: [1, 1, 1], kosc: wagi, fx: [2, 0, 0, 0], obrys: OB(KOL.obrysSpod, 1) });   // bez połysku: na ciemnym granacie nawet 5% dawało jasny „łuk"
  // wnętrze: to samo, normalne do środka (odwrócone głosowanie: oś „na zewnątrz")
  // wnętrze rzadziej (co drugi pierścień + ostatni) — widać je tylko z dołu przy skoku
  const RW = [0, 2, 4, NR - 1], wew2 = [];
  for (const r of RW) for (let j = 0; j < NC; j++) wew2.push(wew[(r * NC + j) * 3], wew[(r * NC + j) * 3 + 1], wew[(r * NC + j) * 3 + 2]);
  const gw = pierscienie(THREE, wew2, RW.length, NC, r => [0, yH(RW[r] / (NR - 1)), 0]);
  { const I = gw.index.array; for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; } gw.index.needsUpdate = true; gw.computeVertexNormals(); }
  b.dodaj(THREE, gw, { kol: KOL.spodWnetrze, kosc: wagi, fx: [0, 0, 0, 0], obrys: null });
  // rąbek: pas łączący dolny pierścień zewnętrzny z wewnętrznym
  {
    const P = [], o = (NR - 1) * NC * 3;
    for (let j = 0; j < NC; j++) P.push(zew[o + j * 3], zew[o + j * 3 + 1], zew[o + j * 3 + 2]);
    for (let j = 0; j < NC; j++) P.push(wew[o + j * 3], wew[o + j * 3 + 1] - 0.004, wew[o + j * 3 + 2]);
    const g = new THREE.BufferGeometry(), I = [];
    for (let j = 0; j < NC; j++) { const j1 = (j + 1) % NC; I.push(j, NC + j, NC + j1, j, NC + j1, j1); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    // nawinięcie: normalna w dół
    const n = g.attributes.normal; let s = 0; for (let i = 0; i < n.count; i++) s += n.getY(i);
    if (s > 0) { const A = g.index.array; for (let t = 0; t < A.length; t += 3) { const x = A[t + 1]; A[t + 1] = A[t + 2]; A[t + 2] = x; } g.computeVertexNormals(); }
    b.dodaj(THREE, g, { kol: KOL.pasek, kosc: wagi, fx: [0, 0, 0, 0], obrys: null });
    g.dispose();
  }
  gz.dispose(); gw.dispose();
  // pasek w talii (granat, z połyskiem)
  const gp = new THREE.CylinderGeometry(D.taliaR + 0.012, D.taliaR + 0.004, 0.05, NC, 1, true);
  b.dodaj(THREE, gp, { m: macierz(THREE, { t: [0, D.talia + 0.01, 0], s: [1, 1, 0.97] }), kol: KOL.pasek, kosc: () => [[K.korpus, 0.5], [K.biodra, 0.5]], fx: [0, 0.3, 0, 0], obrys: OB(KOL.obrysSpod, 0.8) });
  gp.dispose();
}

// ---- KUCYK z liści ----
const GUMKA = [0, 1.37, -0.065];
const KUCYK_BOK = 0.32;                       // kucyk zarzucony lekko na lewą stronę (jak na sprite'cie) — zadziornie, nie symetrycznie
// ψ: kierunek w poziomie (0 = do tyłu, + = ku lewej postaci +X), e0 → e1 wzniesienie (u nasady → na końcu),
// L długość, W szerokość, roll obrót blaszki wokół osi, tw skręt na długości
const LISCIE = [
  { psi: 0.0, e0: 1.45, e1: -1.45, L: 1.2, W: 0.24, roll: 0.0, tw: 0.0, t1: 0.62 },     // główny: wysoko w górę i spada na plecy
  { psi: 0.34, e0: 1.42, e1: -1.3, L: 1.08, W: 0.21, roll: -0.35, tw: -0.2, t1: 0.64 },
  { psi: -0.34, e0: 1.42, e1: -1.3, L: 1.08, W: 0.21, roll: 0.35, tw: 0.2, t1: 0.64 },
  { psi: 0.8, e0: 1.32, e1: -1.0, L: 0.82, W: 0.18, roll: -0.7, tw: -0.2 },
  { psi: -0.8, e0: 1.32, e1: -1.0, L: 0.82, W: 0.18, roll: 0.7, tw: 0.2 },
  { psi: 0.16, e0: 1.56, e1: 0.45, L: 0.5, W: 0.155, roll: 0.2, tw: 0.3, t1: 1 },       // sterczą w górę („bojowy")
  { psi: -0.22, e0: 1.55, e1: 0.15, L: 0.6, W: 0.16, roll: -0.15, tw: -0.2, t1: 1 },
];
// tor liścia: całkowanie kierunku (wzniesienie maleje z długością) — tablica 64 kroków
function torLiscia(l) {
  const N = 64, P = [GUMKA.slice()], Dd = [];
  let p = GUMKA.slice();
  for (let i = 0; i <= N; i++) {
    // wznosi się prosto (do t0), skręca w tył (t0–t1), dalej zwisa: kucyk „fontanną" opada na plecy
    const s = i / N, e = lerp(l.e0, l.e1, sstep(l.t0 ?? 0.08, l.t1 ?? 0.72, s)), ps = l.psi * (1 + 0.25 * s) + KUCYK_BOK * sstep(0.1, 0.7, s);
    const d = [Math.sin(ps) * Math.cos(e), Math.sin(e), -Math.cos(ps) * Math.cos(e)];
    Dd.push(d);
    if (i < N) { p = [p[0] + d[0] * l.L / N, p[1] + d[1] * l.L / N, p[2] + d[2] * l.L / N]; P.push(p); }
  }
  return { P, D: Dd, N, at(s) { const f = clamp(s, 0, 1) * N, i = Math.min(N - 1, Math.floor(f)), k = f - i; return [lerp(P[i][0], P[i + 1][0], k), lerp(P[i][1], P[i + 1][1], k), lerp(P[i][2], P[i + 1][2], k)]; },
    dir(s) { const i = Math.round(clamp(s, 0, 1) * N); return Dd[i]; } };
}
function czLiscie(THREE, b, kucykKosci) {
  const NS = 13, KK = 8;
  for (const l of LISCIE) {
    const tor = torLiscia(l), P = [], kol = [], wag = [], osie = [];
    for (let r = 0; r < NS; r++) {
      const s = 0.02 + 0.95 * r / (NS - 1);
      const p = tor.at(s), d = norm3(tor.dir(s));
      const ps = l.psi * (1 + 0.25 * s) + KUCYK_BOK * sstep(0.1, 0.7, s);
      let lat = [Math.cos(ps), 0, Math.sin(ps)];
      lat = norm3([lat[0] - d[0] * dot3(lat, d), lat[1] - d[1] * dot3(lat, d), lat[2] - d[2] * dot3(lat, d)]);
      let n = norm3(kros(lat, d));
      const ro = l.roll + l.tw * s, cr = Math.cos(ro), sr = Math.sin(ro);
      const lat2 = [lat[0] * cr + n[0] * sr, lat[1] * cr + n[1] * sr, lat[2] * cr + n[2] * sr];
      n = [n[0] * cr - lat[0] * sr, n[1] * cr - lat[1] * sr, n[2] * cr - lat[2] * sr];
      // blaszka: ogonek → dwa małe płatki u nasady → duży płat końcowy z zaokrąglonym czubkiem; brzeg lekko ząbkowany
      const t = clamp((s - 0.16) / 0.84, 0, 1);
      let w = l.W * (Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.65) + 0.28 * Math.exp(-Math.pow((s - 0.2) / 0.06, 2)));
      w = Math.max(0.016, w) * (1 + 0.05 * Math.sin(s * 47));
      const th = 0.011 + 0.01 * (1 - s), cup = 0.26;
      osie.push(p);
      for (let k = 0; k < KK; k++) {
        const a = TAU * k / KK, cx = Math.cos(a), sx = Math.sin(a);
        const off = th * sx + cup * w * cx * cx;
        P.push(p[0] + lat2[0] * w * cx + n[0] * off, p[1] + lat2[1] * w * cx + n[1] * off, p[2] + lat2[2] * w * cx + n[2] * off);
        let k3 = sx > 0.2 ? KOL.liscJasny : sx < -0.2 ? KOL.liscSpod : KOL.lisc;
        if (sx > 0.5 && Math.abs(cx) < 0.3) k3 = KOL.liscZyla;
        const og = 1 - sstep(0.08, 0.2, s);                     // ogonek: różowo-czerwony jak u rzodkiewki
        k3 = miesz(k3, sx > 0 ? KOL.ogonek : mn(KOL.ogonek, 0.8), og * 0.9);
        kol.push(k3);
        const w1 = sstep(0.14, 0.42, s), w2 = sstep(0.5, 0.8, s);
        wag.push([[kucykKosci[0], 1 - w1], [kucykKosci[1], w1 * (1 - w2)], [kucykKosci[2], w2]]);
      }
    }
    const tip = tor.at(1);
    const g = pierscienie(THREE, P, NS, KK, r => osie[r], null, tip);
    kol.push(KOL.lisc); wag.push([[kucykKosci[2], 1]]);
    b.dodaj(THREE, g, { kol: (p, nn, i) => kol[i], kosc: (p, i) => wag[i], fx: [3, 0.3, 0, 0.06], obrys: OB(KOL.obrysLisc, 0.85) });
    g.dispose();
  }
}
function czGumka(THREE, b) {
  // łodyżki od czubka kuli do gumki + puchata gumka-scrunchie (czarna)
  const top = cialoPkt(0, Math.PI), a = [0, top[1] - 0.03, -0.012];
  const st = new THREE.CylinderGeometry(0.036, 0.046, 1, 8, 2, true);
  b.dodaj(THREE, st, { m: odcinek(THREE, a, [GUMKA[0], GUMKA[1] + 0.02, GUMKA[2]]), kol: p => miesz(KOL.ogonek, KOL.ogonekZ, sstep(1.27, 1.36, p[1]) * 0.6),
    kosc: p => [[K.klatka, 1 - sstep(1.29, 1.33, p[1])], [K.gumka, sstep(1.29, 1.33, p[1])]], fx: [0, 0.3, 0, 0], obrys: OB(KOL.obrysCialo, 0.8) });
  st.dispose();
  const g = new THREE.TorusGeometry(0.052, 0.027, 6, 16), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = Math.atan2(y, x), cx = Math.cos(u) * 0.05, cy = Math.sin(u) * 0.05;
    const k = 1 + 0.32 * Math.max(0, Math.sin(u * 7)) - 0.08;
    p.setXYZ(i, cx + (x - cx) * k, cy + (y - cy) * k, z * k);
  }
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const gm = mergeVerts(THREE, g);
  b.dodaj(THREE, gm, { m: macierz(THREE, { t: GUMKA, r: [-Math.PI / 2 - 0.2, 0, 0] }), kol: KOL.gumka, kosc: K.gumka, fx: [0, 0.45, 0, 0], obrys: OB(lin(0x07060a), 0.7) });
  g.dispose(); gm.dispose();
}

// ---- kolczyki-kółka ----
const UCHO = { th: 1.72, ph: -0.12 };   // od przodu: π/2 = bok; trochę za boki, na wysokości policzków
function uchoPkt(s) { const t = naTwarzy(UCHO.th * s, UCHO.ph, 0.004); return t; }
function czKolczyki(THREE, b) {
  for (const s of [1, -1]) {
    const { p, n } = uchoPkt(s), kosc = s > 0 ? K.kolczykL : K.kolczykP;
    const kul = kula(THREE, 6, 4);
    b.dodaj(THREE, kul, { m: macierz(THREE, { t: p, s: [0.017, 0.017, 0.017] }), kol: KOL.srebro, kosc, fx: [0, 1, 0, 0.25], obrys: OB(KOL.obrysMetal, 0.5) });
    kul.dispose();
    const R = 0.068, tor = new THREE.TorusGeometry(R, 0.012, 5, 16);
    const c = [p[0] + n[0] * 0.018, p[1] - R + 0.004, p[2] + n[2] * 0.018];
    b.dodaj(THREE, tor, { m: macierz(THREE, { t: c, r: [0, s * 0.95, 0] }), kol: KOL.srebro, kosc, fx: [0, 1, 0, 0.25], obrys: OB(KOL.obrysMetal, 0.55) });
    tor.dispose();
  }
}

// ---- balon z gumy (rośnie z ust: środek geometrii przed ustami, kość w ustach) ----
const BALON_R = 0.1;
function czBalon(THREE, b) {
  const { p, n } = naTwarzy(TW.balonTh, TW.balonPh, 0);
  const g = kula(THREE, 14, 10);
  b.dodaj(THREE, g, { m: macierz(THREE, { t: [p[0] + n[0] * BALON_R * 0.92, p[1] + n[1] * BALON_R * 0.92, p[2] + n[2] * BALON_R * 0.92], s: [BALON_R, BALON_R * 0.96, BALON_R] }),
    kol: KOL.balon, kosc: K.balon, fx: [0, 0.9, 0, 0.12], obrys: OB(KOL.obrysBalon, 0.7) });
  g.dispose();
  return p;
}

// ---- ręce: rurka (czerwona), frotka (biała z różowym paskiem), pięść z kciukiem ----
function czReka(THREE, b, s) {
  const x0 = 0.33, xL = D.lokiecX, xD = D.dlonX, L = xD + 0.01 - x0, Y = D.barkY;
  const g = kapsula(THREE, [[0, 0.05], [xL - x0 - 0.03, 0.049], [xL - x0, 0.048], [xL - x0 + 0.03, 0.047], [L, 0.044]], 8);
  g.deleteAttribute('uv');
  const gm = mergeVerts(THREE, g);
  const m = new THREE.Matrix4().makeTranslation(s * x0, Y, 0).multiply(new THREE.Matrix4().makeRotationZ(-s * Math.PI / 2));
  b.dodaj(THREE, gm, {
    m, kol: KOL.reka, fx: [0, 0.5, 0, 0], obrys: OB(KOL.obrysCialo, 1),
    kosc: p => {
      const d = p[0] * s, we = sstep(xL - 0.035, xL + 0.035, d), wd = sstep(xD - 0.03, xD + 0.005, d);
      return [[RAMIE[s], 1 - we], [LOKIEC[s], we * (1 - wd)], [DLON[s], wd]];
    },
  });
  g.dispose(); gm.dispose();
  // lokalnie (W): nadgarstek w (0,0,0), przedramię wzdłuż +X, kciuk +Y, wnętrze dłoni +Z; strona −X = lustro
  const W = new THREE.Matrix4().makeTranslation(s * xD, Y, 0).multiply(new THREE.Matrix4().makeScale(s, 1, 1));
  const czesc = (geo, lok, kol, obr = 1, fx = [0, 0.4, 0, 0]) => {
    b.dodaj(THREE, geo, { m: W.clone().multiply(lok), kol, kosc: DLON[s], fx, obrys: obr ? OB(KOL.obrysCialo, obr) : null });
    geo.dispose();
  };
  // frotka
  {
    const fr = new THREE.CylinderGeometry(0.06, 0.06, 0.052, 10, 3, true);
    czesc(fr, macierz(THREE, { t: [-0.012, 0, 0], r: [0, 0, -Math.PI / 2] }), p => {
      const xl = (p[0] - s * xD) * s; return Math.abs(xl + 0.012) < 0.009 ? KOL.opaskaPasek : KOL.opaska;
    }, 0.9, [0, 0.1, 0, 0.3]);
  }
  czesc(kula(THREE, 10, 7), macierz(THREE, { t: [0.064, -0.004, 0.006], s: [0.076, 0.069, 0.066] }), KOL.dlon);
  czesc(kula(THREE, 6, 5), macierz(THREE, { t: [0.058, 0.056, 0.032], r: [0.2, 0, 0.35], s: [0.026, 0.04, 0.026] }), KOL.dlon, 0.7);
}

// ---- nogi: czerwone uda, białe sportowe skarpety z dwoma paskami, różowo-białe trampki ----
function czNoga(THREE, b, s) {
  const x = s * D.biodroX;
  const g = kapsula(THREE, [[0.10, 0.06], [0.15, 0.062], [0.192, 0.064], [0.222, 0.066], [0.252, 0.069], [0.272, 0.066], [0.36, 0.064], [0.47, 0.066]], 10);
  g.deleteAttribute('uv');
  const gm = mergeVerts(THREE, g);
  const kol = p => {
    const y = p[1];
    if (y > 0.262) return KOL.noga;
    if ((y > 0.214 && y < 0.232) || (y > 0.184 && y < 0.2)) return KOL.skarpetaPasek;
    return KOL.skarpeta;
  };
  b.dodaj(THREE, gm, {
    m: new THREE.Matrix4().makeTranslation(x, 0, 0), kol, fx: p => (p[1] > 0.262 ? [0, 0.5, 0, 0] : [0, 0.05, 0, 0.32]), obrys: OB(KOL.obrysCialo, 1),
    kosc: p => { const wk = 1 - sstep(0.24, 0.31, p[1]), ws = 1 - sstep(0.12, 0.17, p[1]); return [[UDO[s], 1 - wk], [KOLANO[s], wk * (1 - ws)], [STOPA[s], ws]]; },
  });
  g.dispose(); gm.dispose();
  // trampek (lokalnie: kostka w (0,0,0), czubek w +Z)
  const KO = D.kostkaY;
  const W = new THREE.Matrix4().makeTranslation(x, KO, 0).multiply(new THREE.Matrix4().makeScale(s, 1, 1));
  const czesc = (geo, lok, kol, obr = 1, gl = 0.12, jas = 0.3) => {
    b.dodaj(THREE, geo, { m: W.clone().multiply(lok), kol, kosc: STOPA[s], fx: [0, gl, 0, jas], obrys: obr ? OB(KOL.obrysBut, obr) : null });
    geo.dispose();
  };
  // gruba podeszwa (superelipsa n = 2,4) z różowym paskiem i bieżnikiem
  {
    const NC = 16, hx = 0.1, hz = 0.178, zc = 0.05, n = 2.4, e = 2 / n;
    const sup = th => { const c = Math.cos(th), sn = Math.sin(th); return [hx * Math.sign(c) * Math.pow(Math.abs(c), e), hz * Math.sign(sn) * Math.pow(Math.abs(sn), e)]; };
    const pier = [[-0.120, 0.93, KOL.bieznik], [-0.113, 1.0, KOL.bieznik], [-0.104, 1.0, KOL.podeszwa], [-0.094, 1.0, KOL.podeszwaPasek], [-0.083, 1.0, KOL.podeszwaPasek], [-0.073, 1.0, KOL.podeszwa], [-0.062, 0.965, KOL.podeszwa]];
    const P = [];
    for (const [y, sk] of pier) for (let j = 0; j < NC; j++) { const [px, pz] = sup(TAU * j / NC); P.push(px * sk, y, pz * sk + zc); }
    const g2 = pierscienie(THREE, P, pier.length, NC, r => [0, pier[r][0], zc], [0, -0.12, zc], null);
    czesc(g2, new THREE.Matrix4(), q => { let best = pier[0]; for (const pr of pier) if (q[1] - KO >= pr[0] - 0.003) best = pr; return best[2]; }, 1, 0.1, 0.35);
  }
  // cholewka: górna część elipsoidy; różowy czubek i pięta
  const UY = -0.066, UR = [0.088, 0.085, 0.158], UZ = 0.045;
  czesc(kula(THREE, 12, 6, { do: Math.PI * 0.6 }), macierz(THREE, { t: [0, UY, UZ], s: UR }),
    q => { const zl = q[2]; return zl > 0.14 ? KOL.butRoz : zl < -0.085 ? KOL.butRoz : KOL.but; });
  czesc(new THREE.TorusGeometry(0.058, 0.019, 4, 10), macierz(THREE, { t: [0, 0.002, -0.028], r: [Math.PI / 2, 0, 0] }), KOL.butRoz);
  czesc(new THREE.CircleGeometry(0.052, 12), macierz(THREE, { t: [0, 0.004, -0.028], r: [-Math.PI / 2, 0, 0] }), KOL.wnetrzeButa, 0, 0, 0);
  for (const z of [0.045, 0.1]) {
    const y = UY + UR[1] * Math.sqrt(Math.max(0, 1 - Math.pow((z - UZ) / UR[2], 2))) + 0.003;
    czesc(kula(THREE, 6, 3), macierz(THREE, { t: [0, y, z], r: [-0.3 - (z - 0.03) * 2.2, 0, 0], s: [0.05, 0.011, 0.015] }), KOL.sznurowka, 0.5, 0.3, 0.1);
  }
}

// ---- PIÓRNIK (lewa dłoń): otwarte różowe pudełko, z którego sterczą linijka, cyrkiel i ołówki ----
// Kość `piornik` = środek pudełka; lokalnie: długość wzdłuż +X (przedłużenie przedramienia), otwór w +Z (wnętrze dłoni).
const PIOR = { c: [D.dlonX + 0.2, D.barkY, 0.0], L: 0.27, H: 0.078, G: 0.088 };
function czPiornik(THREE, b) {
  const [cx, cy, cz] = PIOR.c, { L, H, G } = PIOR, kosc = K.piornik;
  const dod = (geo, m, kol, ob = 0.8, fx = [0, 0.35, 0, 0], obK = KOL.obrysRzecz) => { b.dodaj(THREE, geo, { m, kol, kosc, fx, obrys: ob ? OB(obK, ob) : null }); geo.dispose(); };
  // korytko: wierzch (+Z) ciemny = wnętrze
  dod(new THREE.BoxGeometry(L, H, G), macierz(THREE, { t: [cx, cy, cz] }), (p, n) => (n[2] > 0.5 ? KOL.piornikWnetrze : KOL.piornik));
  // zamek: ciemne listwy wzdłuż brzegów otworu + srebrny suwak
  for (const sy of [1, -1]) dod(new THREE.BoxGeometry(L + 0.004, 0.012, 0.014), macierz(THREE, { t: [cx, cy + sy * (H / 2 - 0.002), cz + G / 2 - 0.002] }), KOL.zamek, 0);
  dod(new THREE.BoxGeometry(0.03, 0.018, 0.02), macierz(THREE, { t: [cx + L / 2 - 0.03, cy + H / 2 + 0.006, cz + G / 2] }), KOL.srebro, 0.5, [0, 1, 0, 0.2], KOL.obrysMetal);
  // wieko otwarte na zawiasie wzdłuż górnej (kciuk, +Y) krawędzi otworu: odchylone o ~115°
  {
    const kat = -2.0, zaw = [cx, cy + H / 2, cz + G / 2];
    const m = macierz(THREE, { t: zaw, r: [kat, 0, 0] }).multiply(macierz(THREE, { t: [0, -H / 2, 0.006] }));
    dod(new THREE.BoxGeometry(L, H, 0.014), m, (p, n) => KOL.piornik);
    // naklejka (gwiazdka) na wierzchu wieka — widać ją z boku i z tyłu
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.014 : 0.032; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
    const gs = new THREE.ShapeGeometry(sh);
    const ms = macierz(THREE, { t: zaw, r: [kat, 0, 0] }).multiply(macierz(THREE, { t: [-0.05, -H / 2, 0.0136], r: [0, 0, 0.3] }));
    dod(gs, ms, KOL.naklejka, 0, [0, 0.1, 0, 0.4]);
  }
  // linijka: długa, srebrna, z kreskami (paski koloru wzdłuż), ukośnie z otworu
  {
    const Lr = 0.34, g = new THREE.BoxGeometry(0.044, 0.007, Lr, 1, 1, 16);
    g.translate(0, 0, Lr / 2);
    const m = macierz(THREE, { t: [cx + 0.07, cy - 0.006, cz - 0.03], r: [0.0, 0.42, 0.0] });
    const kr = new THREE.Matrix4().copy(m).invert();
    const _v = new THREE.Vector3();
    dod(g, m, q => { _v.set(q[0], q[1], q[2]).applyMatrix4(kr); const k = Math.floor(_v.z / 0.0215); return (_v.x > 0.008 && k % 2 === 0) ? KOL.linijkaKreska : KOL.linijka; }, 0.5, [0, 0.95, 0, 0.15], KOL.obrysMetal);
  }
  // cyrkiel: główka (turkus) + dwie srebrne nóżki w V, ostrza w piórniku
  {
    const gl = [cx - 0.02, cy + 0.01, cz + 0.2];
    for (const dx of [-0.045, 0.05]) {
      const lg = new THREE.CylinderGeometry(0.0075, 0.0028, 1, 6);
      dod(lg, odcinek(THREE, gl, [cx - 0.02 + dx, cy + 0.01, cz - 0.02]), KOL.cyrkiel, 0.45, [0, 0.95, 0, 0.1], KOL.obrysMetal);
    }
    const hg = new THREE.CylinderGeometry(0.016, 0.016, 0.034, 10);
    dod(hg, macierz(THREE, { t: gl, r: [Math.PI / 2, 0, 0] }), KOL.cyrkielGlowka, 0.6);
    const kn = new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6);
    dod(kn, macierz(THREE, { t: [gl[0], gl[1], gl[2] + 0.028], r: [Math.PI / 2, 0, 0] }), KOL.cyrkiel, 0.4, [0, 0.9, 0, 0], KOL.obrysMetal);
  }
  // ołówki: żółty i niebieski, zaostrzone (drewno + grafit), z gumką
  for (const [x0, ang, len, k] of [[-0.085, [0.12, -0.38, 0], 0.2, KOL.olowekZ], [-0.035, [-0.2, 0.06, 0], 0.17, KOL.olowekN]]) {
    const base = [cx + x0, cy, cz - 0.03];
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + ang[0], ang[1], ang[2], 'YXZ'));
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const at = t => [base[0] + dir.x * t, base[1] + dir.y * t, base[2] + dir.z * t];
    const korp = new THREE.CylinderGeometry(0.0135, 0.0135, 1, 6);
    dod(korp, odcinek(THREE, at(0), at(len)), k, 0.5);
    const dr = new THREE.CylinderGeometry(0.0025, 0.0135, 1, 6);
    dod(dr, odcinek(THREE, at(len), at(len + 0.04)), (p) => { const d = (p[0] - base[0]) * dir.x + (p[1] - base[1]) * dir.y + (p[2] - base[2]) * dir.z; return d > len + 0.028 ? KOL.grafit : KOL.drewno; }, 0.5);
  }
}

// ---- SCYZORYK (prawa dłoń): czerwona rękojeść z nitami, srebrne ostrze ----
// Kość `noz` = nasada ostrza; lokalnie: rękojeść w pięści, ostrze dalej wzdłuż −X (przedłużenie przedramienia), płaz w ±Z.
const NOZ = { x: -(D.dlonX + 0.115), y: D.barkY + 0.006 };
function czScyzoryk(THREE, b) {
  const kosc = K.noz, x = NOZ.x, y = NOZ.y;
  const dod = (geo, m, kol, ob = 0.7, fx = [0, 0.4, 0, 0], obK = KOL.obrysRzecz) => { b.dodaj(THREE, geo, { m, kol, kosc, fx, obrys: ob ? OB(obK, ob) : null }); geo.dispose(); };
  const rk = new THREE.CapsuleGeometry(0.022, 0.11, 3, 8);
  dod(rk, macierz(THREE, { t: [x + 0.058, y, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.72] }), KOL.nozRaczka, 0.7, [0, 0.7, 0, 0.05]);
  for (const dx of [0.02, 0.1]) { const n = new THREE.CylinderGeometry(0.007, 0.007, 0.03, 8); dod(n, macierz(THREE, { t: [x + dx, y, 0], r: [Math.PI / 2, 0, 0] }), KOL.nozNit, 0, [0, 1, 0, 0.2]); }
  // ostrze: grzbiet prosty, ostrze wygięte do szpica (ShapeGeometry wytłoczona)
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.016); sh.lineTo(-0.15, 0.016); sh.quadraticCurveTo(-0.205, 0.013, -0.225, 0.004);
  sh.quadraticCurveTo(-0.16, -0.03, -0.025, -0.027); sh.lineTo(0, -0.021); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -0.003);
  dod(g, macierz(THREE, { t: [x + 0.005, y, 0] }), KOL.noz, 0.45, [0, 1, 0, 0.25], KOL.obrysMetal);
}

// ============================== ATLAS TWARZY (canvas) ==============================
// komórki 256 px, siatka 4×3. Komórka 8 = TĘCZÓWKI (warstwa przesuwana uOko, widoczna tylko na białku).
export const TWARZE = { usmieszek: 0, mrug: 1, oczko: 2, zeby: 3, auc: 4, smierc: 5, triumf: 6, dmucha: 7, wow: 9, zuje: 10, zla: 11 };
const KT = { kontur: '#1d0910', brew: '#4a0a1c', usta: '#3a0612', srodek: '#7a1028', gardlo: '#4a0717', zab: '#fffdf6', jez: '#ff6d97', jezJ: '#ffa2c2',
  powieka: 'rgba(110,8,40,0.45)', plaster: '#f4c99b', plasterC: '#b37a50', plasterJ: '#fae0c2', guma: '#ff86c6', gumaC: '#b4306e' };
const EX = [AX(-TW.okoTh), AX(TW.okoTh)], EY = AY(TW.okoPh), MX = AX(TW.ustaTh), MY = AY(TW.ustaPh);
function rysujAtlas(THREE) {
  const S = 256, c = document.createElement('canvas'); c.width = S * 4; c.height = S * 3;
  const g = c.getContext('2d');
  const kom = (idx, fn) => {
    g.save(); g.translate((idx % 4) * S, Math.floor(idx / 4) * S);
    g.beginPath(); g.rect(4, 4, S - 8, S - 8); g.clip();
    g.lineCap = 'round'; g.lineJoin = 'round';
    fn(g); g.restore();
  };
  // pewny siebie półuśmieszek: oczy przymknięte (ciężkie powieki), lewa brew uniesiona, usta krzywo w górę z kłem
  kom(0, g => { plaster(g); brwi(g, 'pewna'); for (let i = 0; i < 2; i++) oko(g, EX[i], EY, i ? 1 : -1, 'przymk'); usta(g, 'usmieszek'); });
  kom(1, g => { plaster(g); brwi(g, 'pewna'); for (let i = 0; i < 2; i++) oko(g, EX[i], EY, i ? 1 : -1, 'zamk'); usta(g, 'usmieszek'); });
  kom(2, g => { plaster(g); brwi(g, 'oczko'); oko(g, EX[0], EY, -1, 'przymk'); oko(g, EX[1], EY, 1, 'mrug'); usta(g, 'jezyk'); });
  kom(3, g => { plaster(g); brwi(g, 'zla'); for (let i = 0; i < 2; i++) oko(g, EX[i], EY, i ? 1 : -1, 'zla'); usta(g, 'zeby'); });
  kom(4, g => { plaster(g); brwi(g, 'smutne'); oko(g, EX[0], EY, -1, 'krzyw'); oko(g, EX[1], EY, 1, 'krzyw'); usta(g, 'auc'); kropla(g); });
  kom(5, g => { plaster(g); brwi(g, 'smutne', 0.7); for (const x of EX) okoX(g, x, EY); usta(g, 'smierc'); });
  kom(6, g => { plaster(g); brwi(g, 'triumf'); oko(g, EX[0], EY, -1, 'przymk'); oko(g, EX[1], EY, 1, 'przymk'); usta(g, 'triumf'); iskry(g); });
  kom(7, g => { plaster(g); brwi(g, 'pewna'); for (let i = 0; i < 2; i++) oko(g, EX[i], EY, i ? 1 : -1, 'przymk'); usta(g, 'dmucha'); });
  kom(8, g => { for (let i = 0; i < 2; i++) teczowka(g, EX[i], EY + 7); });
  kom(9, g => { plaster(g); brwi(g, 'wysoko'); for (let i = 0; i < 2; i++) oko(g, EX[i], EY, i ? 1 : -1, 'szeroko'); usta(g, 'wow'); });
  kom(10, g => { plaster(g); brwi(g, 'pewna'); for (let i = 0; i < 2; i++) oko(g, EX[i], EY, i ? 1 : -1, 'przymk'); usta(g, 'zuje'); });
  kom(11, g => { plaster(g); brwi(g, 'zla'); for (let i = 0; i < 2; i++) oko(g, EX[i], EY, i ? 1 : -1, 'zla'); usta(g, 'usmieszek'); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true; t.anisotropy = 4;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  t.userData.canvas = c;
  return t;
}
// oko: s = −1 lewe na obrazku (prawe postaci), +1 prawe. Kąciki: wewnętrzny bliżej nosa, zewnętrzny wyżej (kocie oko).
function oko(g, x, y, s, typ) {
  g.save(); g.translate(x, y); g.scale(1.3, 1.3); g.translate(-x, -y);
  okoRys(g, x, y, s, typ);
  g.restore();
}
function okoRys(g, x, y, s, typ) {
  const xi = x - s * 26, xo = x + s * 30;
  if (typ === 'zamk' || typ === 'mrug') {
    g.strokeStyle = KT.kontur; g.lineWidth = 6;
    g.beginPath(); g.moveTo(xi, y + 2); g.quadraticCurveTo(x, y + (typ === 'mrug' ? -10 : 14), xo, y - 4); g.stroke();
    g.lineWidth = 3.2;
    g.beginPath(); g.moveTo(xo - s * 2, y - 4); g.lineTo(xo + s * 9, y - 11); g.stroke();
    g.beginPath(); g.moveTo(xo - s * 9, y - (typ === 'mrug' ? 6 : 1)); g.lineTo(xo - s * 2, y - (typ === 'mrug' ? 14 : 9)); g.stroke();
    return;
  }
  if (typ === 'krzyw') {                    // > <
    g.strokeStyle = KT.kontur; g.lineWidth = 6.5;
    g.beginPath(); g.moveTo(x + s * 14, y - 15); g.lineTo(x - s * 13, y + 1); g.lineTo(x + s * 14, y + 16); g.stroke();
    return;
  }
  // górna powieka: przymknięta = linia płaska nisko, szeroko = wysoki łuk; zła = opada ku nosowi
  const gora = typ === 'szeroko' ? [y - 6, y - 30, y - 12] : typ === 'zla' ? [y + 3, y - 10, y - 12] : [y - 1, y - 15, y - 10];
  const dolY = typ === 'szeroko' ? y + 26 : typ === 'zla' ? y + 15 : y + 19;
  const sciezka = () => {
    g.beginPath(); g.moveTo(xi, gora[0]); g.quadraticCurveTo(x - s * 2, gora[1], xo, gora[2]);
    g.quadraticCurveTo(x + s * 8, dolY + 4, xi, gora[0]); g.closePath();
  };
  // cień powieki nad okiem (ciężkie powieki, oczy czytelne na czerwieni)
  g.save(); g.fillStyle = KT.powieka;
  g.beginPath(); g.moveTo(xi - s * 2, gora[0] + 1); g.quadraticCurveTo(x - s * 2, gora[1] - 16, xo + s * 3, gora[2] - 4);
  g.quadraticCurveTo(x, gora[1] - 2, xi - s * 2, gora[0] + 1); g.fill(); g.restore();
  sciezka(); g.fillStyle = '#ffffff'; g.fill();
  g.lineWidth = 2.5; g.strokeStyle = KT.kontur; sciezka(); g.stroke();
  // gruba kreska na górnej powiece z „jaskółką" w zewnętrznym kąciku + 2 rzęsy
  g.lineWidth = typ === 'szeroko' ? 5 : 6.5; g.strokeStyle = KT.kontur;
  g.beginPath(); g.moveTo(xi - s * 1, gora[0]); g.quadraticCurveTo(x - s * 2, gora[1], xo, gora[2]); g.lineTo(xo + s * 10, gora[2] - 8); g.stroke();
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(xo - s * 8, gora[2] - 1); g.lineTo(xo - s * 3, gora[2] - 10); g.stroke();
  g.beginPath(); g.moveTo(xo - s * 16, gora[2] - 2); g.lineTo(xo - s * 13, gora[2] - 10); g.stroke();
}
function teczowka(g, x, y) {
  const r = 20;
  const gr = g.createRadialGradient(x, y + 6, 2, x, y, r);
  gr.addColorStop(0, '#e0a24c'); gr.addColorStop(0.5, '#a65a1f'); gr.addColorStop(1, '#44200a');
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = gr; g.fill();
  g.lineWidth = 2.5; g.strokeStyle = '#25110a'; g.stroke();
  g.beginPath(); g.arc(x, y + 1, 9.5, 0, TAU); g.fillStyle = '#0b0710'; g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(x - 7, y - 7, 6.2, 0, TAU); g.fill();
  g.beginPath(); g.arc(x + 7, y + 7.5, 3, 0, TAU); g.fill();
}
function okoX(g, x, y) {
  g.strokeStyle = KT.kontur; g.lineWidth = 8;
  g.beginPath(); g.moveTo(x - 15, y - 14); g.lineTo(x + 15, y + 14); g.moveTo(x + 15, y - 14); g.lineTo(x - 15, y + 14); g.stroke();
}
function brwi(g, typ, alfa = 1) {
  g.save(); g.globalAlpha = alfa; g.strokeStyle = KT.brew; g.lineWidth = 7;
  EX.forEach((x, i) => {
    const s = i ? 1 : -1, wew = x - s * 27, zew = x + s * 37, E = EY - 11;
    let yW = E - 30, yZ = E - 30, yM = E - 38;
    if (typ === 'pewna') { if (s > 0) { yW = E - 34; yZ = E - 40; yM = E - 52; } else { yW = E - 24; yZ = E - 28; yM = E - 32; } }
    else if (typ === 'zla') { yW = E - 12; yZ = E - 36; yM = E - 26; }
    else if (typ === 'smutne') { yW = E - 38; yZ = E - 24; yM = E - 36; }
    else if (typ === 'wysoko') { yW = E - 44; yZ = E - 44; yM = E - 56; }
    else if (typ === 'oczko') { if (s > 0) { yW = E - 16; yZ = E - 20; yM = E - 22; } else { yW = E - 34; yZ = E - 40; yM = E - 50; } }
    else if (typ === 'triumf') { if (s > 0) { yW = E - 38; yZ = E - 44; yM = E - 56; } else { yW = E - 22; yZ = E - 28; yM = E - 30; } }
    g.beginPath(); g.moveTo(zew, yZ); g.quadraticCurveTo(x + s * 4, yM, wew, yW); g.stroke();
  });
  g.restore();
}
function plaster(g) {
  const x = AX(TW.plasterTh), y = AY(TW.plasterPh);
  g.save(); g.translate(x, y); g.rotate(-0.42); g.scale(1.3, 1.3);
  g.beginPath(); g.roundRect(-27, -10, 54, 20, 10); g.fillStyle = KT.plaster; g.fill();
  g.lineWidth = 2.5; g.strokeStyle = KT.plasterC; g.stroke();
  g.beginPath(); g.roundRect(-9, -7, 18, 14, 3); g.fillStyle = KT.plasterJ; g.fill();
  g.fillStyle = KT.plasterC;
  for (const [dx, dy] of [[-19, -3], [-15, 3], [-21, 3], [15, -3], [19, 3], [21, -3]]) { g.beginPath(); g.arc(dx, dy, 1.3, 0, TAU); g.fill(); }
  g.restore();
}
function usta(g, typ) {
  g.save(); g.translate(MX, MY); g.scale(1.22, 1.22); g.translate(-MX, -MY);
  ustaRys(g, typ);
  g.restore();
}
function ustaRys(g, typ) {
  const cx = MX, cy = MY;
  g.lineWidth = 5.5; g.strokeStyle = KT.usta; g.fillStyle = KT.usta;
  if (typ === 'usmieszek' || typ === 'jezyk') {
    // krzywy uśmieszek: lewy kącik niżej, prawy wysoko z dołeczkiem; mały kieł pod linią
    g.beginPath(); g.moveTo(cx - 30, cy - 1); g.quadraticCurveTo(cx - 2, cy + 13, cx + 27, cy - 10); g.stroke();
    g.lineWidth = 3.2; g.beginPath(); g.moveTo(cx + 25, cy - 14); g.quadraticCurveTo(cx + 31, cy - 11, cx + 30, cy - 6); g.stroke();
    g.fillStyle = KT.zab; g.beginPath(); g.moveTo(cx + 9, cy + 4); g.lineTo(cx + 17, cy + 1); g.lineTo(cx + 14, cy + 11); g.closePath(); g.fill();
    g.lineWidth = 2; g.strokeStyle = KT.usta; g.stroke();
    if (typ === 'jezyk') {
      g.fillStyle = KT.jez; g.beginPath(); g.ellipse(cx - 8, cy + 9, 9, 8, 0.2, 0, Math.PI); g.fill();
      g.lineWidth = 3; g.strokeStyle = KT.usta; g.beginPath(); g.ellipse(cx - 8, cy + 9, 9, 8, 0.2, 0, Math.PI); g.stroke();
    }
    // jaśniejsza dolna warga (połysk)
    g.strokeStyle = 'rgba(255,190,200,0.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - 14, cy + 12); g.quadraticCurveTo(cx - 2, cy + 16, cx + 8, cy + 10); g.stroke();
  } else if (typ === 'zeby') {
    const x0 = cx - 38, y0 = cy - 14, w = 76, h = 26;
    g.beginPath(); g.moveTo(x0, y0 + 4); g.quadraticCurveTo(cx, y0 - 6, x0 + w, y0); g.lineTo(x0 + w - 4, y0 + h - 2); g.quadraticCurveTo(cx, y0 + h + 6, x0 + 4, y0 + h); g.closePath();
    g.fillStyle = KT.zab; g.fill();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(60,20,40,0.6)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x0, y0 + h / 2 + 1); g.quadraticCurveTo(cx, y0 + h / 2 + 3, x0 + w, y0 + h / 2 - 1);
    for (let i = 1; i < 6; i++) { g.moveTo(x0 + i * w / 6, y0 - 4); g.lineTo(x0 + i * w / 6, y0 + h + 4); }
    g.stroke(); g.restore();
    g.lineWidth = 5; g.strokeStyle = KT.usta;
    g.beginPath(); g.moveTo(x0, y0 + 4); g.quadraticCurveTo(cx, y0 - 6, x0 + w, y0); g.lineTo(x0 + w - 4, y0 + h - 2); g.quadraticCurveTo(cx, y0 + h + 6, x0 + 4, y0 + h); g.closePath(); g.stroke();
  } else if (typ === 'auc') {
    const sc = () => { g.beginPath(); g.moveTo(cx - 26, cy + 4); g.bezierCurveTo(cx - 14, cy - 16, cx + 14, cy - 16, cx + 28, cy + 2); g.bezierCurveTo(cx + 20, cy + 30, cx - 18, cy + 30, cx - 26, cy + 4); g.closePath(); };
    sc(); g.fillStyle = KT.gardlo; g.fill();
    g.save(); sc(); g.clip();
    g.fillStyle = KT.zab; g.fillRect(cx - 30, cy - 18, 60, 13);
    g.fillStyle = KT.jez; g.beginPath(); g.ellipse(cx + 2, cy + 24, 20, 10, 0, 0, TAU); g.fill();
    g.restore();
    g.lineWidth = 5; sc(); g.stroke();
  } else if (typ === 'smierc') {
    g.lineWidth = 5.5;
    g.beginPath(); g.moveTo(cx - 32, cy);
    for (let i = 1; i <= 8; i++) g.lineTo(cx - 32 + i * 8, cy + (i % 2 ? -6 : 4));
    g.stroke();
    const jx = cx + 12, jy = cy + 3;
    g.beginPath(); g.moveTo(jx - 11, jy - 2); g.lineTo(jx - 11, jy + 12); g.arc(jx, jy + 12, 11, Math.PI, 0, true); g.lineTo(jx + 11, jy - 2); g.closePath();
    g.fillStyle = KT.jez; g.fill(); g.lineWidth = 4; g.stroke();
    g.strokeStyle = 'rgba(200,60,100,0.7)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(jx, jy + 1); g.lineTo(jx, jy + 14); g.stroke();
  } else if (typ === 'triumf') {
    // szeroki, krzywy, bezczelny uśmiech z górnymi zębami (prawy kącik wyżej)
    const sc = () => { g.beginPath(); g.moveTo(cx - 34, cy - 4); g.quadraticCurveTo(cx, cy + 4, cx + 34, cy - 16); g.quadraticCurveTo(cx + 18, cy + 26, cx - 8, cy + 22); g.quadraticCurveTo(cx - 28, cy + 16, cx - 34, cy - 4); g.closePath(); };
    sc(); g.fillStyle = KT.gardlo; g.fill();
    g.save(); sc(); g.clip();
    g.fillStyle = KT.zab; g.beginPath(); g.moveTo(cx - 40, cy - 12); g.lineTo(cx + 40, cy - 24); g.lineTo(cx + 40, cy - 6); g.quadraticCurveTo(cx, cy + 12, cx - 40, cy + 2); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(120,120,150,0.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + 2, cy - 4); g.lineTo(cx + 2, cy + 5); g.stroke();
    g.fillStyle = KT.jez; g.beginPath(); g.ellipse(cx + 2, cy + 24, 20, 11, -0.2, 0, TAU); g.fill();
    g.restore();
    g.lineWidth = 5; g.strokeStyle = KT.usta; sc(); g.stroke();
    g.lineWidth = 3.5; g.beginPath(); g.moveTo(cx + 31, cy - 22); g.quadraticCurveTo(cx + 41, cy - 17, cx + 36, cy - 9); g.stroke();
  } else if (typ === 'dmucha') {
    // usta w dzióbek tam, skąd wychodzi balon
    const bx = AX(TW.balonTh), by = AY(TW.balonPh);
    g.beginPath(); g.ellipse(bx, by, 13, 11, 0, 0, TAU); g.fillStyle = KT.srodek; g.fill(); g.lineWidth = 5; g.strokeStyle = KT.usta; g.stroke();
    g.beginPath(); g.ellipse(bx, by, 7, 6, 0, 0, TAU); g.fillStyle = KT.guma; g.fill();
    g.lineWidth = 3; g.beginPath(); g.moveTo(bx - 20, by - 4); g.quadraticCurveTo(bx - 17, by + 2, bx - 20, by + 7); g.stroke();
  } else if (typ === 'zuje') {
    g.beginPath(); g.moveTo(cx - 20, cy + 2); g.quadraticCurveTo(cx - 6, cy + 9, cx + 4, cy + 2); g.quadraticCurveTo(cx + 14, cy - 4, cx + 24, cy - 7); g.stroke();
    g.fillStyle = KT.guma; g.beginPath(); g.ellipse(cx - 4, cy + 7, 6, 4, 0.2, 0, TAU); g.fill();
    g.lineWidth = 3.5; g.strokeStyle = KT.usta; g.beginPath(); g.moveTo(cx + 22, cy - 12); g.quadraticCurveTo(cx + 30, cy - 7, cx + 26, cy - 1); g.stroke();
  } else if (typ === 'wow') {
    const sc = () => { g.beginPath(); g.moveTo(cx - 24, cy - 6); g.quadraticCurveTo(cx, cy - 2, cx + 24, cy - 8); g.quadraticCurveTo(cx + 20, cy + 22, cx, cy + 22); g.quadraticCurveTo(cx - 20, cy + 22, cx - 24, cy - 6); g.closePath(); };
    sc(); g.fillStyle = KT.gardlo; g.fill();
    g.save(); sc(); g.clip(); g.fillStyle = KT.zab; g.fillRect(cx - 30, cy - 16, 60, 13); g.fillStyle = KT.jez; g.beginPath(); g.ellipse(cx, cy + 22, 16, 9, 0, 0, TAU); g.fill(); g.restore();
    g.lineWidth = 5; sc(); g.stroke();
  }
}
function kropla(g) {                     // kropla potu przy skroni (auć)
  const x = EX[1] + 40, y = EY - 30;
  g.beginPath(); g.moveTo(x, y - 14); g.bezierCurveTo(x + 10, y, x + 9, y + 10, x, y + 10); g.bezierCurveTo(x - 9, y + 10, x - 10, y, x, y - 14);
  g.fillStyle = '#bfe9ff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#2a4a6e'; g.stroke();
}
function iskry(g) {
  g.fillStyle = '#ffffff'; g.strokeStyle = KT.kontur; g.lineWidth = 2;
  for (const [x, y, r] of [[226, 64, 10], [212, 40, 6], [30, 70, 6]]) {
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, rr = i % 2 ? r * 0.32 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill(); g.stroke();
  }
}

// ============================== MATERIAŁ ==============================
// o.twarz — atlas; o.chmury — { tex: { value }, off: { value }, skala }; o.czastki — wersja dla InstancedMesh okruchów;
// o.kopia — { krycie, bias }: półprzezroczysta KOPIA „za przeszkodą" (jak u Czekotubki: depthFunc Greater, kontur odcięty);
// o.U — wspólne uniformy (kopia dzieli twarz/oczy/błysk z postacią)
const KR_N = 18, KR_H = 0.115;                    // krata: 18 kratek w obwodzie (całkowita → bez szwu z tyłu), wysokość kratki
export function materialRazoretty(THREE, o = {}) {
  const pas = [0.66, 0.30, 0.34], progi = [-0.12, 0.08, 0.28, 0.48], ton = [0.80, 0.87, 1.10];
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const U = o.U ? Object.assign({}, o.U) : {
    uTw: { value: o.twarz || null }, uKom: { value: new THREE.Vector2(0, 2) }, uOko: { value: new THREE.Vector2() },
    uBlysk: { value: 0 }, uObrys: { value: 0.0038 }, uObrysD: { value: 0.0016 },
    uBlyskKol: { value: new THREE.Color(1, 1, 1) },
  };
  U.uKopKrycie = { value: o.kopia ? (o.kopia.krycie ?? 0.5) : 1 };
  U.uKopBias = { value: o.kopia ? (o.kopia.bias ?? 0.5) : 0 };
  if (o.chmury && !U.uChmury) { U.uCloud = o.chmury.tex; U.uCloudOff = o.chmury.off; U.uChmury = { value: 1 }; }
  const defs = {};
  if (o.chmury) defs.RZ_CHMURY = '';
  if (o.czastki) defs.RZ_CZASTKI = '';
  if (o.kopia) {
    defs.RZ_KOPIA = '';
    mat.depthFunc = THREE.GreaterDepth; mat.depthWrite = false;
    mat.transparent = false; mat.blending = THREE.CustomBlending;
    mat.blendSrc = THREE.SrcAlphaFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  }
  mat.defines = defs;
  const skala = ((o.chmury && o.chmury.skala) || 0.016).toFixed(5);
  const f = v => v.toFixed(4), v3 = h => { const c = lin(h); return `vec3( ${f(c[0])}, ${f(c[1])}, ${f(c[2])} )`; };
  mat.userData.U = U;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = `attribute vec4 aFx; uniform float uObrys, uObrysD, uKopBias; varying vec4 vFx; varying vec3 vRest; varying vec3 vSkW;
      ` + sh.vertexShader
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        vFx = aFx; vRest = position;
        if (aFx.z > 0.0) {                         // kontur: odsunięcie PO skinningu, grubość rośnie z odległością
          vec4 _mv = modelViewMatrix * vec4(transformed, 1.0);
          transformed += normalize(objectNormal) * aFx.z * (uObrys + uObrysD * max(0.0, -_mv.z));
        }`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef RZ_KOPIA
          if (aFx.z > 0.0) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
          else { mvPosition.xyz += normalize(-mvPosition.xyz) * uKopBias; gl_Position = projectionMatrix * mvPosition; }
        #endif`)
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
    fs = `uniform sampler2D uTw; uniform vec2 uKom; uniform vec2 uOko; uniform float uBlysk; uniform vec3 uBlyskKol; uniform float uKopKrycie;
      varying vec4 vFx; varying vec3 vRest; varying vec3 vSkW;
      #ifdef RZ_CHMURY
        uniform sampler2D uCloud; uniform vec2 uCloudOff; uniform float uChmury;
      #endif
      ` + fs
      .replace('#include <lights_lambert_pars_fragment>', chunk)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float _twA = 0.0;
        #ifndef RZ_CZASTKI
        if ( vFx.x > 0.5 && vFx.x < 1.5 ) {        // twarz: rzut SFERYCZNY od środka kuli (kąty), tylko przód
          vec3 _d = normalize( ( vRest - vec3( 0.0, ${f(D.cy)}, 0.0 ) ) / vec3( ${f(D.kx)}, ${f(D.ky)}, ${f(D.kz)} ) );
          // skórka rzodkiewki: delikatne pionowe prążki (warzywo, nie pomidor) — tylko na czerwieni, słabną ku bieli
          float _th = atan( _d.x, _d.z );
          float _pr = pow( 0.5 + 0.5 * sin( _th * 13.0 + sin( _d.y * 5.0 + _th * 2.0 ) * 1.4 ), 6.0 );
          diffuseColor.rgb *= 1.0 - 0.09 * _pr * smoothstep( -0.45, -0.1, _d.y );
          if ( _d.z > 0.08 ) {
            vec2 _uv = vec2( atan( _d.x, _d.z ), asin( clamp( _d.y, -1.0, 1.0 ) ) ) / ${f(2 * FA)} + 0.5;
            if ( _uv.x > 0.0 && _uv.x < 1.0 && _uv.y > 0.0 && _uv.y < 1.0 ) {
              const vec2 _KS = vec2( 0.25, 1.0 / 3.0 );
              vec4 _b = texture2D( uTw, ( uKom + _uv ) * _KS );
              float _bia = smoothstep( 0.86, 0.97, min( _b.r, min( _b.g, _b.b ) ) );
              vec4 _t = texture2D( uTw, clamp( _uv - uOko, 0.004, 0.996 ) * _KS );   // komórka 8 = (0, 0)
              _b.rgb = mix( _b.rgb, _t.rgb + _b.rgb * ( 1.0 - _t.a ), _bia );
              diffuseColor.rgb = _b.rgb + diffuseColor.rgb * ( 1.0 - _b.a );
              _twA = _b.a;
            }
          }
        } else if ( vFx.x > 1.5 && vFx.x < 2.5 ) { // krata spódniczki (granat + bordo + cienkie jasne linie), bez szwu z tyłu
          float _a1 = atan( vRest.x, vRest.z ), _a2 = atan( -vRest.x, -vRest.z );
          vec2 _q = vec2( _a1 * ${f(KR_N / TAU)}, vRest.y * ${f(1 / KR_H)} + 0.31 );
          float _fw = max( min( fwidth( _a1 ), fwidth( _a2 ) ) * ${f(KR_N / TAU)}, fwidth( _q.y ) );
          vec2 _f = fract( _q );
          float _w = clamp( _fw * 0.8, 0.004, 0.45 );
          float _bx = smoothstep( 0.52 - _w, 0.52 + _w, _f.x ) - smoothstep( 0.90 - _w, 0.90 + _w, _f.x );
          float _by = smoothstep( 0.52 - _w, 0.52 + _w, _f.y ) - smoothstep( 0.90 - _w, 0.90 + _w, _f.y );
          float _lx = smoothstep( 0.20 - _w, 0.20 + _w, _f.x ) - smoothstep( 0.26 - _w, 0.26 + _w, _f.x );
          float _ly = smoothstep( 0.20 - _w, 0.20 + _w, _f.y ) - smoothstep( 0.26 - _w, 0.26 + _w, _f.y );
          float _dx = smoothstep( 0.695 - _w, 0.695 + _w, _f.x ) - smoothstep( 0.725 - _w, 0.725 + _w, _f.x );
          float _dy = smoothstep( 0.695 - _w, 0.695 + _w, _f.y ) - smoothstep( 0.725 - _w, 0.725 + _w, _f.y );
          vec3 _k = ${v3(0x1f2a5a)};
          _k = mix( _k, ${v3(0x8a1d3a)}, 0.85 * max( _bx, _by ) );
          _k = mix( _k, ${v3(0x5a0f2a)}, _bx * _by );
          _k = mix( _k, ${v3(0xd8d0e6)}, 0.6 * max( _lx, _ly ) * ( 1.0 - 0.6 * max( _bx, _by ) ) );
          _k = mix( _k, ${v3(0x141a3a)}, 0.7 * max( _dx, _dy ) );
          _k = mix( _k, ${v3(0x3a2148)}, smoothstep( 0.22, 0.45, _fw ) );   // z daleka: kolor średni (bez migotania)
          diffuseColor.rgb *= _k;
        }
        #endif`)
      .replace('#include <opaque_fragment>', `
        vec3 _V = normalize( vViewPosition );
        vec3 _N = normal;
        float _gl = vFx.y * ( 1.0 - 0.92 * _twA ), _met = step( 0.95, vFx.y );
        #if NUM_DIR_LIGHTS > 0
          vec3 _L = directionalLights[ 0 ].direction;
          vec3 _H = normalize( _L + _V );
          float _nh = dot( _N, _H );
          // ostry blask w wąskim stożku (skórka rzodkiewki, balon, metal) + miękki połysk wokół
          float _sp = smoothstep( mix( 0.9935, 0.94, _met ), mix( 0.9965, 0.962, _met ), _nh );
          float _mk = smoothstep( 0.90, 0.995, _nh );
          vec3 _sw = directionalLights[ 0 ].color * mix( 0.35, 1.0, _cienSw );
          outgoingLight += _sp * _gl * 0.85 * _sw + _mk * _gl * 0.05 * _sw;
          // liście: prześwit pod słońce (od tyłu świecą limonką)
          if ( vFx.x > 2.5 && vFx.x < 3.5 ) outgoingLight += diffuseColor.rgb * 0.45 * smoothstep( 0.0, 0.7, -dot( _N, _L ) ) * _cienSw;
        #endif
        // metal: pionowy pasek odbicia „ze studia" (kolczyki, ostrze, linijka, cyrkiel)
        float _st = smoothstep( -0.78, -0.70, _N.x ) * ( 1.0 - smoothstep( -0.52, -0.44, _N.x ) ) * smoothstep( -0.45, 0.1, _N.y );
        outgoingLight += _st * _met * 0.55 * vec3( 0.9, 0.95, 1.0 );
        float _rim = smoothstep( 0.62, 0.92, 1.0 - saturate( dot( _N, _V ) ) );
        outgoingLight += _rim * ( vFx.x > 1.5 && vFx.x < 2.5 ? 0.06 : 0.22 ) * diffuseColor.rgb;
        outgoingLight += diffuseColor.rgb * vFx.w * 0.30;
        outgoingLight = mix( outgoingLight, uBlyskKol, uBlysk * ( 1.0 - step( 0.0001, vFx.z ) ) );
        if ( vFx.z > 0.0 ) outgoingLight = diffuseColor.rgb;   // kontur: bez światła
        #include <opaque_fragment>`)
      .replace('#include <fog_fragment>', `
        #ifdef RZ_CHMURY
          float _cs = texture2D( uCloud, vSkW.xz * ${skala} + uCloudOff ).r;
          gl_FragColor.rgb *= mix( 1.0, mix( 0.74, 1.04, _cs ), uChmury );
        #endif
        #include <fog_fragment>
        #ifdef RZ_KOPIA
          gl_FragColor = vec4( mix( gl_FragColor.rgb, vec3( 1.0 ), 0.18 ), uKopKrycie );
        #endif`);
    sh.fragmentShader = fs;
  };
  const klucz = 'razoretta-v1|' + (o.czastki ? 'c' : 'p') + (o.chmury ? '|ch' : '') + (o.kopia ? '|kop' : '');
  mat.customProgramCacheKey = () => klucz;
  return mat;
}

// ============================== EFEKTY: ŁUKI CIĘĆ ==============================
// Sierp (wycinek pierścienia przed postacią, ~150°) jako InstancedMesh: każde cięcie = instancja z macierzą
// (płaszczyzna i kierunek cięcia) i atrybutem aArc = (głowa, krycie). Głowa biegnie wzdłuż łuku, za nią smuga.
class Luki {
  constructor(THREE, cap = 6) {
    this.THREE = THREE; this.cap = cap;
    const NA = 32, P = [], UV = [], I = [], A0 = -1.7, A1 = 1.7;   // ~195°: końce łuku wychodzą za boki kuli (widać je z kamery gry od tyłu)
    for (let i = 0; i <= NA; i++) {
      const u = i / NA, a = lerp(A0, A1, u), env = Math.pow(Math.sin(Math.PI * u), 0.7);
      for (const v of [0, 1]) {
        const r = v ? 1.0 : 1.0 - 0.34 * env;
        P.push(Math.sin(a) * r, 0, Math.cos(a) * r); UV.push(u, v);
      }
      if (i < NA) { const k = i * 2; I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I);
    this.attr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2); this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aArc', this.attr);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: `attribute vec2 aArc; varying vec2 vUv; varying vec2 vA;
        void main() { vUv = uv; vA = aArc; vec4 p = vec4( position, 1.0 );
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * p; }`,
      fragmentShader: `varying vec2 vUv; varying vec2 vA;
        void main() {
          float u = vUv.x, v = vUv.y, h = vA.x;
          float m = smoothstep( h - 0.9, h, u ) * ( 1.0 - smoothstep( h - 0.01, h + 0.035, u ) );
          float rim = smoothstep( 0.15, 0.9, v );
          float a = min( 1.0, m * ( 0.5 + 0.7 * rim ) * vA.y * 1.15 );
          if ( a < 0.01 ) discard;
          vec3 c = mix( vec3( 1.0, 0.55, 0.75 ), vec3( 1.0 ), 0.35 + 0.65 * rim );
          gl_FragColor = vec4( c, a );
        }`,
    });
    this.mat.customProgramCacheKey = () => 'razoretta-luki-v1';
    this.mesh = new THREE.InstancedMesh(g, this.mat, cap);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.name = 'razoretta-luki'; this.mesh.visible = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = 5;
    this.l = []; for (let i = 0; i < cap; i++) this.l.push({ t: -1, lok: new THREE.Matrix4(), czas: 0.09 });
    this._m = new THREE.Matrix4();
  }
  // lok: macierz łuku w układzie postaci (obrot); czas: przebieg głowy po łuku
  dodaj(lok, czas = 0.09) {
    let w = this.l[0];
    for (const x of this.l) { if (x.t < 0) { w = x; break; } if (x.t > w.t) w = x; }
    w.t = 0; w.czas = czas; w.lok.copy(lok);
  }
  update(dt, ramka) {
    let n = 0;
    for (const x of this.l) {
      if (x.t < 0) continue;
      x.t += dt;
      const kon = x.czas + 0.22;
      if (x.t > kon) { x.t = -1; continue; }
      const h = 1.05 * Math.min(1, x.t / x.czas) + 0.75 * Math.max(0, x.t - x.czas) / 0.22;
      const a = 1 - sstep(x.czas, kon, x.t);
      this._m.multiplyMatrices(ramka, x.lok);
      this.mesh.setMatrixAt(n, this._m);
      this.attr.array[n * 2] = h; this.attr.array[n * 2 + 1] = a;
      n++;
    }
    this.mesh.count = n; this.mesh.visible = n > 0;
    if (n) { this.mesh.instanceMatrix.needsUpdate = true; this.attr.needsUpdate = true; }
  }
  wyczysc() { for (const x of this.l) x.t = -1; this.mesh.count = 0; this.mesh.visible = false; }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// ============================== EFEKTY: OKRUCHY (guma z pękniętego balonu, iskry) ==============================
class Okruchy {
  constructor(THREE, mat, cap = 64, ziarno = 3) {
    this.cap = cap; this.los = prng(ziarno);
    const g = new THREE.SphereGeometry(1, 8, 6);
    const n = g.attributes.position.count, kol = new Float32Array(n * 3).fill(1), fx = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { fx[i * 4 + 1] = 0.6; fx[i * 4 + 3] = 0.15; }
    g.setAttribute('color', new THREE.BufferAttribute(kol, 3)); g.setAttribute('aFx', new THREE.BufferAttribute(fx, 4));
    this.geo = g;
    this.mesh = new THREE.InstancedMesh(g, mat, cap);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.name = 'razoretta-okruchy'; this.mesh.visible = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.cz = []; this.wolne = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }
  emituj(x, y, z, vx, vy, vz, r, kol, ziemia) {
    if (this.cz.length >= this.cap) { const st = this.cz.shift(); this.wolne.push(st); }
    const p = this.wolne.pop() || {};
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.r = r; p.k = kol; p.ziemia = ziemia; p.t = 0; p.lezy = false; p.rot = this.los() * TAU;
    this.cz.push(p);
  }
  _usun(i) { const cz = this.cz; this.wolne.push(cz[i]); cz[i] = cz[cz.length - 1]; cz.pop(); }
  update(dt, ziemiaFn) {
    const cz = this.cz;
    for (let i = cz.length - 1; i >= 0; i--) {
      const p = cz[i]; p.t += dt;
      if (!p.lezy) {
        p.vy -= 9 * dt; p.vx *= Math.exp(-dt * 2.5); p.vz *= Math.exp(-dt * 2.5);
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const gy = ziemiaFn ? ziemiaFn(p.x, p.z) : p.ziemia;
        if (p.y <= gy + 0.005) { p.lezy = true; p.y = gy + 0.006; p.t = Math.max(p.t, 0); p.tl = p.t; }
      }
      if (p.t > (p.lezy ? p.tl + 1.6 : 3)) { this._usun(i); continue; }
    }
    const m = this.mesh; let n = 0;
    for (const p of cz) {
      const zn = p.lezy ? 1 - sstep(p.tl + 1.0, p.tl + 1.6, p.t) : 1, r = p.r * zn * Math.min(1, p.t * 30 + 0.2);
      this._q.setFromAxisAngle(this._v.set(0, 1, 0), p.rot);
      this._s.set(r * 1.25, p.lezy ? r * 0.3 : r * 0.55, r);
      this._v.set(p.x, p.y, p.z);
      this._m.compose(this._v, this._q, this._s);
      m.setMatrixAt(n, this._m); m.setColorAt(n, this._c.setRGB(p.k[0], p.k[1], p.k[2]));
      n++;
    }
    m.count = n; m.visible = n > 0;
    if (n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  wyczysc() { for (const p of this.cz) this.wolne.push(p); this.cz.length = 0; this.mesh.count = 0; this.mesh.visible = false; }
  dispose() { this.geo.dispose(); }
}

// ============================== ANIMACJA: POZY ==============================
// Poza = Float32Array(NB × 9): [rx, ry, rz, px, py, pz, sx−1, sy−1, sz−1] — PRZYROSTY od pozycji spoczynkowej.
// Każda funkcja pozy zapisuje PEŁNĄ pozę (z bazą), więc mieszanie wagami sumującymi się do 1 jest sumą ważoną.
const KAN = 9;
const STRONY = [1, -1];
const KOSCI_RAK = [K.ramieL, K.lokiecL, K.dlonL, K.ramieP, K.lokiecP, K.dlonP];
const R = (P, k, x, y, z) => { const o = k * KAN; P[o] += x; P[o + 1] += y; P[o + 2] += z; };
const T = (P, k, x, y, z) => { const o = k * KAN + 3; P[o] += x; P[o + 1] += y; P[o + 2] += z; };
const S = (P, k, x, y, z) => { const o = k * KAN + 6; P[o] += x; P[o + 1] += y; P[o + 2] += z; };
// ręka (jak u Czekotubki): dol = opuszczenie od poziomu, przod = wymach w przód, skret = obrót wokół osi ramienia,
// zgiecie = łokieć (przedramię ku wnętrzu dłoni / przodowi), dx/dy/dz = obroty dłoni
function reka(P, s, dol, przod, skret = 0, zgiecie = 0, dx = 0, dy = 0, dz = 0) {
  R(P, RAMIE[s], skret, -przod * s, -dol * s);
  R(P, LOKIEC[s], 0, -zgiecie * s, 0);
  R(P, DLON[s], dx, dy * s, dz * s);
}
function noga(P, s, biodro, kolano, stopa, rozkrok = 0) {
  R(P, UDO[s], biodro, 0, rozkrok * s);
  R(P, KOLANO[s], kolano, 0, 0);
  R(P, STOPA[s], stopa, 0, -rozkrok * s);
}
// pozy rąk BEZWZGLĘDNE: [dol, przod, skret, zg, dx, dy, dz]. Spoczynek: ręce w dół i na zewnątrz (z kamery gry
// od tyłu piórnik i scyzoryk wystają za obrys kuli), przedramiona lekko w przód — wnętrze dłoni do góry.
// (wyliczone siatką w node: dłoń ≥ 0,55 j. od osi, piórnik w przód i na zewnątrz poziomo otworem w górę, ostrze w przód-w dół płazem w górę)
const RB_L = [0.6, 0.0, -0.6, 0.4, -0.6, -0.4, 0];      // lewa: piórnik
const RB_P = [0.9, 0.25, -0.6, 0.4, -0.6, -0.4, 0];     // prawa: scyzoryk
const R_SZYB = [-1.5, 1.4, -1.2, 0.2, 1.2, 0, 0];       // szybowanie (gra): ręce w górę do uchwytów (krótkie ręce: dłonie ~0,93 j.)
// do strojenia na żywo z podglądu (te same tablice, których używają pozy)
export const STROJENIE = { RB_L, RB_P, R_SZYB };
function rekaA(P, s, a, k = 1) { reka(P, s, a[0] * k, a[1] * k, a[2] * k, a[3] * k, a[4] * k, a[5] * k, a[6] * k); }
function baza(P) { rekaA(P, 1, RB_L); rekaA(P, -1, RB_P); }
const L_NOGI = 0.27;

// idle: przestępowanie z nogi na nogę (ciężar to na lewej, to na prawej, biodro w bok), broda w górę, oddech
function pozaIdle(P, t, st) {
  baza(P);
  const w = Math.sin(t * TAU / 3.1), ws = Math.tanh(2.4 * w) / Math.tanh(2.4);
  const prz = 1 - ws * ws;                                     // w chwili przenoszenia ciężaru: lekkie uniesienie
  T(P, K.biodra, 0.032 * ws, -0.012 + 0.012 * prz, 0);
  R(P, K.biodra, 0, 0.07 * ws, -0.075 * ws);
  for (const s of STRONY) {
    const wolna = clamp(0.5 - 0.5 * ws * s, 0, 1), wl = wolna * wolna;
    noga(P, s, -0.22 * wl + 0.03, 0.5 * wl, -0.28 * wl - 0.03, 0.04 + 0.05 * wl);
  }
  const b = Math.sin(t * TAU / 2.6);
  S(P, K.korpus, -0.012 * b, 0.022 * b, -0.012 * b);
  R(P, K.korpus, 0.015 * Math.sin(t * 0.7), -0.04 * ws, 0.1 * ws);
  R(P, K.klatka, -0.08 + 0.018 * Math.sin(t * 0.8 + 1), st.patrzYaw, -0.06 * ws + 0.025 * Math.sin(t * 0.6));
  reka(P, 1, 0.06 * b - 0.06 * ws, 0.04 * Math.sin(t * 0.9), 0, 0.08 * b);
  reka(P, -1, 0.05 * b + 0.06 * ws, 0.04 * Math.sin(t * 0.9 + 2), 0, 0.06 * b);
}
// chód: szybki, zadziorny — biodra kręcą, barki przeciwnie, broda w górę, mocny wymach rąk
function pozaChod(P, f, a) {
  baza(P);
  const s = Math.sin(f), c = Math.cos(f), Ah = 0.55 * a;
  for (const st of STRONY) {
    const sl = st > 0 ? s : -s, cl = st > 0 ? c : -c;
    const kol = 1.0 * a * Math.pow(Math.max(0, cl), 1.4);
    const bio = -Ah * sl - kol * 0.35;
    const stopa = -(bio + kol) + 0.32 * a * (sl < 0 && cl < 0 ? -sl * 0.9 : 0) - 0.22 * a * Math.max(0, sl) * Math.max(0, -cl);
    noga(P, st, bio, kol, stopa, 0.03);
    reka(P, st, 0.12 * a, -0.62 * a * sl, 0, 0.15 * a + 0.2 * a * Math.max(0, -sl));
  }
  T(P, K.biodra, 0.022 * a * c, L_NOGI * (Math.cos(Ah * Math.abs(s)) - 1) + 0.02 * a * Math.cos(2 * f), 0);
  R(P, K.biodra, 0, 0.2 * a * s, -0.06 * a * c);
  R(P, K.korpus, 0.05 * a, -0.15 * a * s, 0.07 * a * c);
  R(P, K.klatka, -0.07 * a + 0.02 * a * Math.cos(2 * f), -0.05 * a * s, -0.04 * a * c);
  const sq = 0.035 * a * Math.cos(2 * f);
  S(P, K.korpus, -sq * 0.5, sq, -sq * 0.5);
}
// bieg: pochylenie, lot, łokcie pompują, nogi wysoko
function pozaBieg(P, f, a) {
  baza(P);
  const s = Math.sin(f), c = Math.cos(f), Ah = 0.7;
  for (const st of STRONY) {
    const sl = st > 0 ? s : -s, cl = st > 0 ? c : -c;
    const kol = 0.3 + 1.45 * Math.pow(Math.max(0, cl), 1.2);
    const bio = -Ah * sl - kol * 0.42;
    noga(P, st, bio, kol, -(bio + kol) * 0.8 - 0.25 * Math.max(0, -sl), 0.04);
    reka(P, st, -0.05, -0.95 * sl - 0.05, 0.1, 0.55 + 0.35 * sl);
  }
  T(P, K.biodra, 0, 0.08 * s * s - 0.065, 0);
  R(P, K.biodra, 0, 0.2 * s, 0);
  R(P, K.korpus, 0.3, -0.12 * s, 0.05 * c);
  R(P, K.klatka, -0.05, -0.08 * s, 0.02 * c);
  const sq = 0.06 * (s * s - 0.5) * 2;
  S(P, K.korpus, -sq * 0.45, sq, -sq * 0.45);
}
// skok: przysiad → wyskok (rozciągnięcie) → podkulone nogi, ręce na boki → przysiad przy lądowaniu
const SKOK = { T0: 0.10, TL: 0.745, T2: 0.30 };
function pozaSkok(P, ts, st) {
  baza(P);
  const { T0, TL } = SKOK;
  let y = 0;
  if (ts < T0) {
    const k = sstep(0, T0, ts);
    T(P, K.biodra, 0, -0.09 * k, 0);
    for (const s of STRONY) { noga(P, s, -0.55 * k, 1.1 * k, -0.55 * k); reka(P, s, 0.2 * k, -0.4 * k, 0, 0.2 * k); }
    S(P, K.korpus, 0.1 * k, -0.14 * k, 0.1 * k);
    R(P, K.korpus, 0.14 * k, 0, 0);
  } else if (ts < T0 + TL || st.skokZew) {
    const a = st.skokZew ? st.skokFaza : (ts - T0) / TL;
    y = st.skokZew ? 0 : 4 * st.wysSkoku * a * (1 - a);
    const roz = 1 - sstep(0, 0.35, a), pod = Math.sin(Math.PI * clamp(a, 0, 1)), lad = sstep(0.7, 1, a);
    S(P, K.korpus, -0.07 * roz, 0.16 * roz - 0.03 * pod, -0.07 * roz);
    R(P, K.korpus, 0.1 * pod - 0.06 * roz, 0, 0);
    R(P, K.klatka, -0.1 * roz, 0, 0);
    for (const s of STRONY) {
      noga(P, s, -0.75 * pod * (1 - lad) - 0.15 * lad + 0.25 * roz, 1.45 * pod * (1 - lad) + 0.25 * lad, -0.5 * pod * (1 - lad) - 0.1 * lad - 0.3 * roz, 0.1 * pod);
      reka(P, s, -0.9 * roz - 0.45 * pod * (1 - roz) + 0.2 * lad, 0.2 * roz + 0.15 * pod, 0, 0.3 * pod, 0, 0, 0);
    }
  } else {
    const l = ts - T0 - TL, sq = Math.exp(-l * 9) * Math.cos(l * 13);
    S(P, K.korpus, 0.14 * sq, -0.2 * sq, 0.14 * sq);
    T(P, K.biodra, 0, -0.09 * Math.max(0, sq), 0);
    for (const s of STRONY) { noga(P, s, -0.5 * Math.max(0, sq), 1.0 * Math.max(0, sq), -0.5 * Math.max(0, sq), 0.03 * sq); reka(P, s, -0.35 * sq, 0.2 * sq, 0, 0.2 * sq); }
  }
  T(P, K.root, 0, y, 0);
}
// śmierć: drgnięcie → kolana miękną → przewraca się NA BOK (kula się toczy, twarz z X-ami zwrócona w bok i w górę),
// nogi wierzgają i opadają, ręce rozrzucone, piórnik wypada z ręki na ziemię obok
function pozaSmierc(P, ts) {
  baza(P);
  const szok = Math.exp(-ts * 7) * Math.sin(ts * 30), mie = sstep(0.1, 0.45, ts), upad = sstep(0.4, 0.95, ts);
  const odb = ts > 0.95 ? 0.07 * Math.exp(-(ts - 0.95) * 6) * Math.sin((ts - 0.95) * 22) : 0;
  R(P, K.root, -0.3 * upad, 0.35 * upad, 1.42 * upad + odb);
  T(P, K.root, -0.06 * upad, 0.4 * upad, 0.04 * upad);
  R(P, K.korpus, -0.22 * szok + 0.12 * mie * (1 - upad), 0, 0.1 * mie);
  S(P, K.korpus, 0.06 * mie, -0.08 * mie + 0.06 * szok, 0.06 * mie);
  R(P, K.klatka, 0.25 * mie * (1 - upad) - 0.2 * upad, 0.2 * upad, 0.1 * upad);
  const nogi = sstep(0.85, 1.3, ts), drg = ts > 1.4 && ts < 2.1 ? 0.16 * Math.sin((ts - 1.4) * 38) * (1 - sstep(1.4, 2.1, ts)) : 0;
  for (const s of STRONY) {
    noga(P, s, -0.6 * nogi - 0.35 * mie * (1 - nogi) + drg * (s > 0 ? 1 : -0.6) - (s > 0 ? 0.35 : -0.2) * nogi, 0.6 * mie * (1 - nogi) + 0.5 * nogi, 0.3 * nogi, 0.1 * nogi);
    // prawa (spodnia, leży na niej) wyciągnięta w przód po ziemi, lewa (wierzchnia) rozrzucona w górę
    if (s < 0) reka(P, s, (0.2 - 0.9) * upad + 0.2 * mie, 1.25 * upad, 0, -0.3 * mie + 0.35 * upad, 0, 0, 0);
    else reka(P, s, -0.5 * upad + 0.2 * mie, 0.3 * upad, 0, -0.3 * mie, 0, 0, 0);
  }
  R(P, K.kucyk0, 0.9 * upad, 0, -0.5 * upad);
  // piórnik wypada z dłoni (w układzie dłoni: w dół i w bok), obraca się
  const wyp = sstep(0.5, 1.0, ts);
  R(P, K.piornik, 0.9 * wyp, 0.4 * wyp, 0);
}
// wygrana: „No i co mi zrobisz?" — biodro w bok, scyzoryk wycelowany przed siebie (prowokacyjne kiwanie),
// piórnik oparty na ramieniu, broda w górę; co ~5 s duży balon, który pęka (sterowany w update), potem podskok
const WYGR_OKRES = 5.0;
const R_WYGR_L = [-1.5, 0.2, 0.6, 0.2, -0.4, 0.5, 0];    // piórnik uniesiony wysoko nad barkiem
const R_WYGR_P = [-0.3, 1.4, 0.6, 0.2, -1.2, 0, 0];      // scyzoryk wycelowany prosto przed siebie
function pozaWygrana(P, ts) {
  const wej = sstep(0, 0.45, ts), fz = ts % WYGR_OKRES;
  // ręce: od bazy do pozy wygranej
  rekaA(P, 1, RB_L, 1 - wej); rekaA(P, 1, R_WYGR_L, wej);
  rekaA(P, -1, RB_P, 1 - wej); rekaA(P, -1, R_WYGR_P, wej);
  const kiw = Math.sin(ts * 7.5) * sstep(0.4, 0.8, ts) * (1 - sstep(1.6, 2.0, fz) * (1 - sstep(2.8, 3.2, fz)));
  R(P, K.dlonP, 0, 0, 0.35 * kiw);                     // „no chodź, chodź" czubkiem scyzoryka
  R(P, K.lokiecP, 0, 0.12 * kiw, 0);
  // podskok z wzruszeniem ramion po pęknięciu balonu (fz 2,35–2,9)
  const hop = Math.sin(Math.PI * clamp((fz - 2.35) / 0.42, 0, 1));
  T(P, K.root, 0, 0.09 * hop * wej, 0);
  // biodro w bok, ciężar na prawej nodze
  T(P, K.biodra, -0.04 * wej, -0.015 * wej, 0);
  R(P, K.biodra, 0, -0.12 * wej, 0.09 * wej);
  noga(P, 1, -0.2 * wej - 0.3 * hop, 0.38 * wej + 0.5 * hop, -0.2 * wej, 0.12 * wej);
  noga(P, -1, 0.02 * wej - 0.25 * hop, 0.05 * wej + 0.5 * hop, -0.06 * wej, 0.03 * wej);
  R(P, K.korpus, -0.04 * wej, 0.18 * wej, -0.1 * wej);
  R(P, K.klatka, -0.14 * wej + 0.05 * hop, -0.12 * wej + 0.04 * Math.sin(ts * 1.3), 0.14 * wej);
  const b = Math.sin(ts * TAU / 2.6);
  S(P, K.korpus, -0.012 * b + 0.05 * hop, 0.022 * b - 0.06 * hop, -0.012 * b + 0.05 * hop);
}
// ATAK (warstwa, 0,74 s): trzy szybkie cięcia przed sobą — scyzoryk (prawa) z ukosa, piórnik (lewa) w poziomie,
// scyzoryk (prawa) od dołu w górę. Klucze rąk [t, dol, przod, skret, zg, dx, dy, dz]; między kluczami wygładzone.
const ATAK = { CZAS: 0.74, CIECIA: [0.07, 0.25, 0.44], SLASH: 0.1 };
// (pozy kluczowe dobrane siatką w node: dłoń i kierunek ostrza/piórnika w świecie)
const KL_P = [
  [0.00, ...RB_P], [0.065, -0.6, 0.9, -1.0, 1.5, -0.6, 0, 0],     // zamach: scyzoryk nad głową z prawej
  [0.15, 0.6, 1.6, -0.6, 0.2, 0.4, -0.5, 0],                      // cięcie 1: z ukosa w dół, ostrze w przód-w lewo
  [0.25, 0.4, 1.3, -0.6, 0.4, -0.6, -0.4, 0],
  [0.43, 0.9, -0.6, 0.6, 0.2, 1.2, 0.5, 0],                       // zamach dołem, ostrze w tył
  [0.515, -0.5, 1.5, 0, 0.2, 0.4, -0.5, 0],                       // cięcie 3: od dołu w górę
  [0.62, 0.3, 1.1, -0.3, 0.3, -0.2, -0.4, 0],
  [0.74, ...RB_P],
];
const KL_L = [
  [0.00, ...RB_L], [0.10, ...RB_L],
  [0.245, 0.1, -0.6, 0, 0.3, -0.6, -0.4, 0],                      // zamach piórnikiem w tył
  [0.33, 0.1, 1.6, 0.3, 0.3, -0.6, -0.4, 0],                      // cięcie 2: poziomo przed sobą (w prawo)
  [0.45, 0.4, 0.9, 0, 0.4, -0.6, -0.4, 0],
  [0.74, ...RB_L],
];
// skręt tułowia (Y) i wypad w przód w czasie ataku
STROJENIE.KL_P = KL_P; STROJENIE.KL_L = KL_L; STROJENIE.R_WYGR_L = R_WYGR_L; STROJENIE.R_WYGR_P = R_WYGR_P;
const KL_T = [[0, 0, 0], [0.065, 0.32, 0.0], [0.15, -0.42, 0.05], [0.245, -0.4, 0.02], [0.33, 0.45, 0.07], [0.43, 0.2, 0.03], [0.515, -0.3, 0.08], [0.74, 0, 0]];
const _kl = new Float32Array(8);
function klucz(KL, t, out) {
  let i = 0; while (i < KL.length - 2 && t > KL[i + 1][0]) i++;
  const a = KL[i], b = KL[i + 1], k0 = clamp((t - a[0]) / (b[0] - a[0] || 1), 0, 1);
  const k = 1 - Math.pow(1 - k0, 2.2);                 // szybki start, miękkie dojście (cięcie „trzaska")
  for (let j = 1; j < a.length; j++) out[j - 1] = lerp(a[j], b[j], k);
  return out;
}
function atakWarstwa(P, ta, tmp) {
  const w = sstep(0, 0.04, ta) * (1 - sstep(0.62, ATAK.CZAS, ta));
  if (w <= 0) return;
  tmp.fill(0);
  klucz(KL_P, ta, _kl); reka(tmp, -1, _kl[0], _kl[1], _kl[2], _kl[3], _kl[4], _kl[5], _kl[6]);
  klucz(KL_L, ta, _kl); reka(tmp, 1, _kl[0], _kl[1], _kl[2], _kl[3], _kl[4], _kl[5], _kl[6]);
  for (const k of KOSCI_RAK) for (let c = 0; c < KAN; c++) { const o = k * KAN + c; P[o] += (tmp[o] - P[o]) * w; }
  klucz(KL_T, ta, _kl);
  R(P, K.korpus, 0.08 * w, _kl[0] * w, 0);
  R(P, K.biodra, 0, 0.3 * _kl[0] * w, 0);
  R(P, K.klatka, -0.04 * w, -0.4 * _kl[0] * w, 0);           // głowa trzyma cel, tułów tnie
  T(P, K.root, 0, 0, _kl[1] * w);
  for (const s of STRONY) noga(P, s, -0.12 * w * (s > 0 ? 1 : -0.6), 0.22 * w, -0.1 * w, 0.06 * w);
}
// OBERWAŁ (warstwa, 0,5 s): drgnięcie w tył ze sprężyną, ręce w górę, drżenie
function oberwalWarstwa(P, th, los, strona) {
  if (th >= 0.5) return;
  const e = Math.exp(-th * 8), spr = e * Math.cos(th * 26);
  R(P, K.korpus, -0.26 * spr, 0, 0.14 * spr * strona);
  R(P, K.klatka, -0.12 * spr, 0, 0.06 * spr * strona);
  S(P, K.korpus, 0.12 * spr, -0.12 * spr, 0.1 * spr);
  T(P, K.klatka, (los() - 0.5) * 0.04 * e, (los() - 0.5) * 0.03 * e, 0);
  for (const s of STRONY) reka(P, s, -0.6 * e, 0.15 * e, 0, 0.45 * e);
}

// ============================== POSTAĆ ==============================
function dodajWage(P, Q, w) { for (let i = 0; i < P.length; i++) P[i] += Q[i] * w; }
// sprężyna 2. rzędu (bez alokacji): s = { x, v }
const KOL_GUMY = lin(0xff86c6), KOL_GUMY2 = lin(0xff5fae);
const SPR_K = [70, 55, 45], SPR_C = [7, 6, 5];

export function stworzRazorette(THREE, opcje = {}) {
  const o = { skala: 1, obrys: true, ziarno: 7, wysokoscSkoku: 1.1, ...opcje };
  const atlas = rysujAtlas(THREE);
  const mat = materialRazoretty(THREE, { twarz: atlas, chmury: o.chmury });
  const matOkr = materialRazoretty(THREE, { czastki: true, chmury: o.chmury });

  // ---- geometria ----
  const b = new Bud();
  const tor0 = torLiscia(LISCIE[0]);
  czCialo(THREE, b);
  czSpodniczka(THREE, b);
  czGumka(THREE, b);
  czLiscie(THREE, b, [K.kucyk0, K.kucyk1, K.kucyk2]);
  czKolczyki(THREE, b);
  const usta = czBalon(THREE, b);
  for (const s of [1, -1]) { czReka(THREE, b, s); czNoga(THREE, b, s); }
  czPiornik(THREE, b);
  czScyzoryk(THREE, b);
  const trojkaty = b.I.length / 3;
  if (o.obrys) b.obrysy();
  const geo = b.geo(THREE);
  const trojkatyRazem = b.I.length / 3;

  // ---- szkielet ----
  const swiat = KOSCI.map(k => k[2]);
  swiat[K.gumka] = GUMKA; swiat[K.kucyk0] = GUMKA; swiat[K.kucyk1] = tor0.at(0.36); swiat[K.kucyk2] = tor0.at(0.7);
  swiat[K.kolczykL] = uchoPkt(1).p; swiat[K.kolczykP] = uchoPkt(-1).p;
  swiat[K.balon] = usta;
  swiat[K.piornik] = PIOR.c; swiat[K.noz] = [NOZ.x, NOZ.y, 0];
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
  mesh.name = 'razoretta';
  mesh.add(kosci[0]);
  mesh.bind(new THREE.Skeleton(kosci));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const obrot = new THREE.Group(); obrot.add(mesh);
  const grupa = new THREE.Group(); grupa.name = 'Razoretta'; grupa.add(obrot);
  grupa.scale.setScalar(o.skala);
  let kopia = null, matKopii = null;
  if (o.kopia) {
    matKopii = materialRazoretty(THREE, { U: mat.userData.U, chmury: o.chmury, kopia: o.kopia });
    kopia = new THREE.SkinnedMesh(geo, matKopii);
    kopia.name = 'razoretta-kopia';
    kopia.bind(mesh.skeleton, mesh.bindMatrix);
    kopia.frustumCulled = false; kopia.castShadow = false; kopia.receiveShadow = false;
    obrot.add(kopia);
  }

  // efekty w układzie świata: łuki cięć + okruchy gumy (jedna grupa — gra dodaje `efekty` do sceny jak krople Czekotubki)
  const luki = new Luki(THREE, 6);
  const okruchy = new Okruchy(THREE, matOkr, 64, o.ziarno + 11);
  const efekty = new THREE.Group(); efekty.name = 'razoretta-efekty'; efekty.add(luki.mesh); efekty.add(okruchy.mesh);
  if (o.scena) o.scena.add(efekty);

  // ---- stan animacji ----
  const los = prng(o.ziarno);
  const U = mat.userData.U;
  const st = {
    baza: 'ruch', tryb: 'auto', w: { ruch: 1.5, skok: 0.5, smierc: 0.5, wygrana: 0.5 }, tau: 0.16,
    t: 0, tb: 0, faza: 0, vS: 0, vPop: 0, acc: 0, kat: 0, omega: 0,
    tAtak: -1, tOber: -1, stronaOber: 1, nrCiecia: 0,
    patrzYaw: 0, patrzCel: 0, oko: new THREE.Vector2(), okoCel: new THREE.Vector2(), nastPatrz: 1.5,
    nastMrug: 2 + los() * 3, tMrug: -1, podwMrug: false,
    skokZew: false, skokFaza: 0, wPowPop: false, wysSkoku: o.wysokoscSkoku,
    twarzWym: null, wSz: 0, zasieg: 1,
    // balon: faza 0 brak, 1 dmucha, 2 trzyma, 3 opada (po pęknięciu: 0)
    bal: { faza: 0, t: 0, max: 1, k: 0, nast: 2.5 + los() * 3, poWygranej: false }, tPekl: -9, tZuj: 0,
    // kręcenie piórnikiem (idle): tPior ≥ 0 w trakcie
    tPior: -1, nastPior: 5 + los() * 4, tOczko: -1,
    G: new Float64Array(9), pGok: false, ziemiaY: 0,
  };
  const SPR = new Float64Array(34), SPR_CEL = new Float64Array(17);   // sprężyny [x, v] × 17: kucyk X 0–2, Z 3–5, Y 6–8, kolczyki X 9–10, Z 11–12, klapy 13–16
  // pola wag zaczynają jako double (0,5), żeby V8 od razu trzymał je jako liczby zmiennoprzecinkowe; właściwe wartości:
  st.w.ruch = 1; st.w.skok = 0; st.w.smierc = 0; st.w.wygrana = 0;
  const P = new Float32Array(NB * KAN), tmp = new Float32Array(NB * KAN), tmp2 = new Float32Array(NB * KAN);
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
  // łuki cięć w układzie postaci: [nachylenie (obrót wokół osi przód), kierunek (1: od prawej postaci do lewej), wysokość]
  const LUKI = [[-0.85, 1, 0.82], [-0.08, -1, 0.64], [1.0, 1, 0.76]];
  const lukLok = LUKI.map(([nach, kier, y]) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0.06), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, nach, 'ZXY')), new THREE.Vector3(kier * 1.12, 1.12, 1.12));
    return m;
  });
  const _lukM = new THREE.Matrix4(), _skl = new THREE.Matrix4();

  function ustawStan(s) {
    if (s === 'idle' || s === 'chod' || s === 'bieg' || s === 'auto') {
      st.tryb = s;
      if (st.baza !== 'ruch') { st.baza = 'ruch'; st.tau = st.w.smierc > 0.5 ? 0.45 : 0.2; }
      if (st.bal.poWygranej) { st.bal.poWygranej = false; st.bal.nast = st.t + 3 + los() * 3; }   // po wygranej znów dmucha balony
    } else if (s === 'skok') {
      if (st.baza === 'smierc') return;
      st.baza = 'skok'; st.tb = 0; st.tau = 0.07; st.skokZew = false;
    } else if (s === 'atak') {
      if (st.baza === 'smierc') return;
      st.tAtak = 0; st.nrCiecia = 0; st.tPior = -1;
    } else if (s === 'oberwal') {
      if (st.baza === 'smierc') return;
      st.tOber = 0; st.stronaOber = los() < 0.5 ? -1 : 1;
    } else if (s === 'smierc') {
      if (st.baza === 'smierc') return;
      st.baza = 'smierc'; st.tb = 0; st.tau = 0.1; st.tAtak = -1; st.tOber = 0; st.tPior = -1;
    } else if (s === 'wygrana') {
      st.baza = 'wygrana'; st.tb = 0; st.tau = 0.2; st.tAtak = -1; st.tPior = -1;
      if (st.bal.faza) pekaj(); st.bal.nast = 1e9; st.bal.poWygranej = true;
    }
  }
  function twarz(nazwa) {
    const i = TWARZE[nazwa] ?? 0;
    U.uKom.value.set(i % 4, 2 - Math.floor(i / 4));
  }
  // balon pęka: okruchy gumy z jego powierzchni (świat), mina „mrug" na chwilę
  function pekaj() {
    const bl = st.bal;
    if (bl.k > 0.2) {
      const kb = kosci[K.balon].matrixWorld, r = BALON_R * bl.k * grupa.scale.x;
      _v.set(0, 0, 0).applyMatrix4(kb);
      _v2.setFromMatrixColumn(kb, 2).normalize();
      const cx = _v.x + _v2.x * r, cy = _v.y + _v2.y * r, cz = _v.z + _v2.z * r;
      const n = 8 + Math.round(bl.k * 4);
      for (let i = 0; i < n; i++) {
        const a = los() * TAU, e = (los() - 0.3) * 1.6, dx = Math.cos(a) * Math.cos(e), dy = Math.sin(e), dz = Math.sin(a) * Math.cos(e);
        const sp = 1.2 + los() * 1.6;
        okruchy.emituj(cx + dx * r, cy + dy * r, cz + dz * r, dx * sp + _v2.x * 0.8, dy * sp + 0.9, dz * sp + _v2.z * 0.8,
          (0.018 + los() * 0.02) * grupa.scale.x * (0.7 + bl.k * 0.3), i % 3 ? KOL_GUMY : KOL_GUMY2, st.ziemiaY);
      }
      st.tPekl = st.t;
    }
    bl.faza = 0; bl.k = 0; bl.t = 0; bl.nast = st.t + 4.5 + los() * 4;
    st.tZuj = st.t + 2.2;
  }

  function update(dt, ctx = {}) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    st.t += dt; st.tb += dt;
    const v = Math.max(0, ctx.predkosc || 0);
    // ---- obrót w stronę ruchu ----
    if (ctx.kierunek != null && st.baza !== 'smierc') {
      const d = owin(ctx.kierunek - st.kat), dk = d * (1 - Math.exp(-dt * 12));
      st.kat = owin(st.kat + dk); st.omega += ((dt > 0 ? dk / dt : 0) - st.omega) * (1 - Math.exp(-dt * 10));
    } else st.omega *= Math.exp(-dt * 6);
    obrot.rotation.y = st.kat;
    // ---- prędkość efektywna wg trybu ----
    const ve = st.tryb === 'idle' ? 0 : st.tryb === 'chod' ? (v > 0.05 ? Math.min(v, 2.6) : 1.6) : st.tryb === 'bieg' ? (v > 0.05 ? Math.max(v, 3.6) : 6.2) : v;
    st.vS += (ve - st.vS) * (1 - Math.exp(-dt * 7));
    const acc = dt > 0 ? (st.vS - st.vPop) / dt : 0; st.vPop = st.vS;
    st.acc += (acc - st.acc) * (1 - Math.exp(-dt * 8));
    const vS = st.vS;
    const wI = 1 - sstep(0.08, 0.7, vS), kB = sstep(2.6, 3.9, vS), wB = kB * (1 - wI), wC = (1 - wI) * (1 - kB);
    const ampC = sstep(0.05, 1.6, vS);
    const kad = lerp(vS / (2 * 0.28), vS / (2 * 0.85), kB);
    st.faza = (st.faza + TAU * Math.max(kad, wI < 0.98 ? 0.6 : 0) * dt) % (TAU * 1000);
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
    // (pola wprost, nie st.w[klucz]: zapis double pod kluczem zmiennym alokuje HeapNumber co klatkę)
    {
      const W = st.w, kW = 1 - Math.exp(-dt / st.tau), B = st.baza;
      W.ruch += ((B === 'ruch' ? 1 : 0) - W.ruch) * kW; if (W.ruch < 1e-4) W.ruch = 0;
      W.skok += ((B === 'skok' ? 1 : 0) - W.skok) * kW; if (W.skok < 1e-4) W.skok = 0;
      W.smierc += ((B === 'smierc' ? 1 : 0) - W.smierc) * kW; if (W.smierc < 1e-4) W.smierc = 0;
      W.wygrana += ((B === 'wygrana' ? 1 : 0) - W.wygrana) * kW; if (W.wygrana < 1e-4) W.wygrana = 0;
      const n = 1 / ((W.ruch + W.skok + W.smierc + W.wygrana) || 1);
      W.ruch *= n; W.skok *= n; W.smierc *= n; W.wygrana *= n;
    }
    // ---- rozglądanie / mruganie ----
    const spokoj = st.baza === 'ruch' ? wI : 0;
    if (st.t > st.nastPatrz) {
      st.nastPatrz = st.t + 1.6 + los() * 3;
      if (spokoj > 0.5 && los() < 0.75) { const kier = (los() - 0.5) * 2; st.patrzCel = kier * 0.34; st.okoCel.set(kier * 0.03, (los() - 0.5) * 0.02); }
      else { st.patrzCel = 0; st.okoCel.set((los() - 0.5) * 0.012, 0); }
    }
    if (spokoj < 0.5) { st.patrzCel = 0; st.okoCel.set(0, 0); }
    st.patrzYaw += (st.patrzCel * spokoj - st.patrzYaw) * (1 - Math.exp(-dt * 4.5));
    if (st.t > st.nastMrug && st.tMrug < 0) { st.tMrug = 0; st.podwMrug = los() < 0.2; }
    if (st.tMrug >= 0) { st.tMrug += dt; if (st.tMrug > (st.podwMrug ? 0.34 : 0.13)) { st.tMrug = -1; st.nastMrug = st.t + 1.8 + los() * 3.6; } }
    const mrug = st.tMrug >= 0 && (st.tMrug < 0.12 || (st.podwMrug && st.tMrug > 0.2));
    // ---- balon z gumy ----
    const bl = st.bal, wygr = st.baza === 'wygrana';
    if (wygr) {
      // wygrana: duży balon co WYGR_OKRES (dmucha 0,6–2,2 s, pęka 2,35 s)
      const fz = st.tb % WYGR_OKRES;
      if (fz > 0.6 && fz < 2.35) { bl.faza = fz < 2.1 ? 1 : 2; bl.max = 2.2; bl.k = bl.max * sstep(0.6, 2.1, fz) * (1 + 0.04 * Math.sin(st.t * 23) * sstep(1.8, 2.1, fz)); }
      else if (bl.faza) pekaj();
    } else {
      const mozna = spokoj > 0.85 && st.tAtak < 0 && st.tOber < 0 && st.baza === 'ruch';
      if (bl.faza === 0 && mozna && st.t > bl.nast) { bl.faza = 1; bl.t = 0; bl.max = 1.1 + los() * 0.6; }
      if (bl.faza) {
        bl.t += dt;
        if (!mozna && bl.k > 0.25) pekaj();
        else if (!mozna) { bl.faza = 0; bl.k = 0; bl.nast = st.t + 3 + los() * 3; }
        else if (bl.faza === 1) { bl.k = bl.max * sstep(0, 1.6, bl.t) * (1 + 0.03 * Math.sin(st.t * 17)); if (bl.t > 1.6) { bl.faza = 2; bl.t = 0; } }
        else if (bl.faza === 2) { bl.k = bl.max * (1 + 0.05 * Math.sin(st.t * 25)); if (bl.t > 0.35) pekaj(); }
      }
    }
    // ---- kręcenie piórnikiem (idle): wyrzut i 2 obroty wokół środka, złapanie, potem oczko ----
    if (st.tPior < 0 && st.t > st.nastPior && spokoj > 0.9 && st.tAtak < 0 && bl.faza === 0 && st.baza === 'ruch') st.tPior = 0;
    if (st.tPior >= 0) { st.tPior += dt; if (st.tPior > 1.0 || spokoj < 0.4) { if (st.tPior > 1.0) st.tOczko = st.t; st.tPior = -1; st.nastPior = st.t + 7 + los() * 6; } }
    // ---- poza ----
    P.fill(0);
    const wr = st.w.ruch;
    let w = wr * wI; if (w > 1e-4) { tmp.fill(0); pozaIdle(tmp, st.t, st); dodajWage(P, tmp, w); }
    w = wr * wC; if (w > 1e-4) { tmp.fill(0); pozaChod(tmp, st.faza, ampC); dodajWage(P, tmp, w); }
    w = wr * wB; if (w > 1e-4) { tmp.fill(0); pozaBieg(tmp, st.faza, 1); dodajWage(P, tmp, w); }
    w = st.w.skok; if (w > 1e-4) { tmp.fill(0); pozaSkok(tmp, st.baza === 'skok' ? st.tb : SKOK.T0 + SKOK.TL + SKOK.T2, st); dodajWage(P, tmp, w); }
    w = st.w.smierc; if (w > 1e-4) { tmp.fill(0); pozaSmierc(tmp, st.baza === 'smierc' ? st.tb : 3); dodajWage(P, tmp, w); }
    w = st.w.wygrana; if (w > 1e-4) { tmp.fill(0); pozaWygrana(tmp, st.baza === 'wygrana' ? st.tb : 0); dodajWage(P, tmp, w); }
    // kręcenie piórnikiem: podrzut z ręki (w górę świata), 2 obroty przez głowę, złapanie; ręka: przysiad → wyrzut → czeka
    if (st.tPior >= 0) {
      const tp = st.tPior, wp = sstep(0, 0.12, tp) * (1 - sstep(0.88, 1.0, tp)) * spokoj;
      const lot = clamp((tp - 0.16) / 0.6, 0, 1), h = 0.42 * 4 * lot * (1 - lot);
      const dip = Math.exp(-Math.pow((tp - 0.1) / 0.05, 2)) - 0.6 * Math.exp(-Math.pow((tp - 0.8) / 0.06, 2));
      reka(P, 1, (0.18 * dip - 0.22 * sstep(0.12, 0.2, tp)) * wp, 0.1 * wp, 0, 0.25 * wp);
      R(P, K.piornik, 0, TAU * 2 * sstep(0.16, 0.76, tp), 0);
      // przesunięcie w górę świata wyrażone w układzie dłoni (macierz z poprzedniej klatki)
      _m.extractRotation(kosci[K.dlonL].matrixWorld); _q.setFromRotationMatrix(_m).invert();
      _v.set(0, h / grupa.scale.x, 0).applyQuaternion(_q);
      T(P, K.piornik, _v.x, _v.y, _v.z);
      R(P, K.klatka, -0.12 * wp * sstep(0.15, 0.4, tp), 0.1 * wp, 0);
      st.okoCel.set(0.01, 0.02 * Math.sin(Math.PI * lot));
    }
    // szybowanie (gra): ręce płynnie w górę do uchwytów torby
    st.wSz += ((ctx.szybuje && st.baza !== 'smierc' ? 1 : 0) - st.wSz) * (1 - Math.exp(-dt * 12));
    if (st.wSz < 1e-3) st.wSz = 0;
    else {
      tmp.fill(0);
      for (const s of STRONY) rekaA(tmp, s, R_SZYB);
      for (const k of KOSCI_RAK) for (let c = 0; c < KAN; c++) { const i = k * KAN + c; P[i] += (tmp[i] - P[i]) * st.wSz; }
    }
    // atak
    if (st.tAtak >= 0) {
      atakWarstwa(P, st.tAtak, tmp2);
      while (st.nrCiecia < 3 && st.tAtak >= ATAK.CIECIA[st.nrCiecia]) {
        _skl.makeScale(st.zasieg, st.zasieg, st.zasieg);
        _lukM.multiplyMatrices(lukLok[st.nrCiecia], _skl);
        luki.dodaj(_lukM, ATAK.SLASH); st.nrCiecia++;
      }
      st.tAtak += dt; if (st.tAtak > ATAK.CZAS) st.tAtak = -1;
    }
    if (st.tOber >= 0) { oberwalWarstwa(P, st.tOber, los, st.stronaOber); st.tOber += dt; if (st.tOber > 0.6) st.tOber = -1; }
    // bezwładność: przechył w zakręcie, pochylenie przy przyspieszaniu
    const wDyn = st.w.ruch;
    R(P, K.korpus, clamp(st.acc * 0.018, -0.14, 0.14) * wDyn, 0, clamp(-st.omega * 0.035 * Math.min(1, vS / 3), -0.25, 0.25) * wDyn);
    // ---- sprężyny: kucyk, kolczyki, spódniczka (z ruchu gumki w świecie z poprzedniej klatki + opór z prędkości) ----
    // Stan w Float64Array i zwykłe pętle — bez wywołań z argumentami double (każde takie wywołanie nie wstawione przez
    // kompilator pakuje liczby na stercie; pierwsza wersja na obiektach {x, v} robiła ~200 B śmieci na klatkę).
    {
      const G = st.G, c = Math.cos(st.kat), sn = Math.sin(st.kat);
      const aX = G[6] * c - G[8] * sn, aY = G[7], aZ = G[6] * sn + G[8] * c;   // przyspieszenie gumki w układzie postaci
      const vyG = G[4], wiatr = 0.04 * Math.sin(st.t * 1.7) + 0.025 * Math.sin(st.t * 2.9 + 1), om = st.omega;
      const S2 = SPR, C = SPR_CEL;
      C[0] = Math.min(0.6, Math.max(-0.8, -0.05 * vS - 0.012 * aZ - 0.03 * vyG + 0.004 * aY)) + wiatr * 0.6;
      C[3] = Math.min(0.6, Math.max(-0.6, 0.012 * aX + om * 0.05 * Math.min(1, vS / 2 + 0.3))) + wiatr * 0.4;
      C[6] = Math.min(0.4, Math.max(-0.4, -om * 0.06));
      for (let ax = 0; ax < 3; ax++) for (let i = 0; i < 3; i++) {        // kucyk: 3 osie × 3 człony, człon goni poprzedni
        const j = ax * 3 + i, cel = i ? S2[(j - 1) * 2] : C[ax * 3];
        S2[j * 2 + 1] += ((cel - S2[j * 2]) * SPR_K[i] - S2[j * 2 + 1] * SPR_C[i]) * dt; S2[j * 2] += S2[j * 2 + 1] * dt;
      }
      C[9] = C[10] = Math.min(0.7, Math.max(-0.7, 0.03 * aZ)); C[11] = C[12] = Math.min(0.7, Math.max(-0.7, -0.03 * aX));
      const W = st.w, lot = W.skok * sstep(-1, -6, vyG) * 0.35 + W.skok * 0.06, nogaF = W.ruch * (wC * ampC * 0.12 + wB * 0.2);
      const sf = Math.sin(st.faza), ws = W.smierc;
      // klapy spódniczki: przód, lewa, tył, prawa — dodatnie = odchyla się na zewnątrz; przy śmierci przylega
      C[13] = lot + nogaF * Math.abs(sf) - 0.01 * vS;
      C[14] = lot + 0.06 * Math.min(1, Math.max(-1, -aX * 0.02)) + nogaF * 0.4 * sf + 0.05 * Math.max(0, om);
      C[15] = lot + 0.045 * vS + 0.01 * Math.min(10, Math.max(-10, aZ));
      C[16] = lot + 0.06 * Math.min(1, Math.max(-1, aX * 0.02)) - nogaF * 0.4 * sf + 0.05 * Math.max(0, -om);
      for (let j = 9; j < 17; j++) {
        const k = j < 13 ? 140 : 110, d = j < 13 ? 4.5 : 9;
        const cel = j < 13 ? C[j] : Math.min(0.6, Math.max(-0.1, C[j] * (1 - ws) - 0.06 * ws));
        S2[j * 2 + 1] += ((cel - S2[j * 2]) * k - S2[j * 2 + 1] * d) * dt; S2[j * 2] += S2[j * 2 + 1] * dt;
      }
      let o = K.kucyk0 * KAN; P[o] += S2[0] * 0.55; P[o + 1] += S2[12] * 0.5; P[o + 2] += S2[6] * 0.5;
      o = K.kucyk1 * KAN; P[o] += S2[2] * 0.6; P[o + 1] += S2[14] * 0.4; P[o + 2] += S2[8] * 0.6;
      o = K.kucyk2 * KAN; P[o] += S2[4] * 0.7; P[o + 1] += S2[16] * 0.3; P[o + 2] += S2[10] * 0.7;
      o = K.kolczykL * KAN; P[o] += S2[18]; P[o + 2] += S2[22];
      o = K.kolczykP * KAN; P[o] += S2[20]; P[o + 2] += S2[24];
      P[K.spP * KAN] -= Math.max(-0.05, S2[26]); P[K.spL * KAN + 2] += Math.max(-0.05, S2[28]);
      P[K.spT * KAN] += Math.max(-0.05, S2[30]); P[K.spR * KAN + 2] -= Math.max(-0.05, S2[32]);
    }
    // ---- balon: skala kości (0 = schowany w ustach) ----
    {
      const o9 = K.balon * KAN, k = Math.max(0.02, bl.k);
      P[o9 + 6] = k - 1; P[o9 + 7] = k - 1; P[o9 + 8] = k - 1;
      P[o9 + 5] += -0.06 * (1 - sstep(0.02, 0.15, bl.k));
    }
    // ---- na kości ----
    for (let k = 0; k < NB; k++) {
      const kb = kosci[k], q = k * KAN, p0 = spocz[k];
      kb.rotation.set(P[q], P[q + 1], P[q + 2]);
      kb.position.set(p0.x + P[q + 3], p0.y + P[q + 4], p0.z + P[q + 5]);
      kb.scale.set(1 + P[q + 6], 1 + P[q + 7], 1 + P[q + 8]);
    }
    // ---- twarz i błysk ----
    let mina = mrug ? 'mrug' : 'usmieszek';
    if (st.t < st.tZuj && !mrug) mina = Math.floor(st.t * 5.2) % 2 ? 'zuje' : 'usmieszek';
    if (st.t - st.tPekl < 0.16) mina = 'mrug';
    if (bl.faza === 1 || bl.faza === 2) mina = 'dmucha';
    if (st.tOczko >= 0 && st.t - st.tOczko < 0.9) mina = 'oczko';
    if (st.baza === 'skok' && (st.skokZew || (st.tb > SKOK.T0 * 0.6 && st.tb < SKOK.T0 + SKOK.TL * 0.9))) mina = 'wow';
    if (wygr && st.tb > 0.3) mina = bl.faza ? 'dmucha' : (st.t - st.tPekl < 0.9 ? 'oczko' : 'triumf');
    if (st.tAtak >= 0.02 && st.tAtak < 0.66) mina = 'zeby';
    if (st.tOber >= 0 && st.tOber < 0.45) mina = 'auc';
    if (st.baza === 'smierc') mina = st.tb < 0.3 ? 'auc' : 'smierc';
    if (st.twarzWym) mina = st.twarzWym;
    st.mina = mina;
    twarz(mina);
    // oczy: przy dmuchaniu zezują w dół na balon, przy wygranej w bok (zaczepnie)
    if (mina === 'dmucha') st.okoCel.set(0.012, -0.022);
    else if (mina === 'triumf') st.okoCel.set(-0.02, 0.004);
    st.oko.lerp(st.okoCel, 1 - Math.exp(-dt * 22));
    U.uOko.value.copy(st.oko);
    U.uBlysk.value = st.tOber >= 0 ? Math.exp(-st.tOber * 11) : 0;
    // ---- świat: pomiar ruchu gumki (dla sprężyn), efekty ----
    grupa.updateWorldMatrix(true, true);
    grupa.getWorldPosition(_v);
    st.ziemiaY = ctx.ziemia != null ? ctx.ziemia : _v.y;
    {
      // ruch gumki w świecie (dla sprężyn): G = [pozycja 0–2, prędkość 3–5, przyspieszenie 6–8], wygładzone
      const e = kosci[K.gumka].matrixWorld.elements, G = st.G, x = e[12], y = e[13], z = e[14];
      if (st.pGok && dt > 0) {
        const a = 1 - Math.exp(-dt * 18), id = 1 / dt;
        const vx = (x - G[0]) * id, vy = (y - G[1]) * id, vz = (z - G[2]) * id;
        let ax = (vx - G[3]) * id, ay = (vy - G[4]) * id, az = (vz - G[5]) * id;
        const al = Math.sqrt(ax * ax + ay * ay + az * az); if (al > 60) { const k = 60 / al; ax *= k; ay *= k; az *= k; }
        G[6] += (ax - G[6]) * a; G[7] += (ay - G[7]) * a; G[8] += (az - G[8]) * a;
        G[3] += (vx - G[3]) * a; G[4] += (vy - G[4]) * a; G[5] += (vz - G[5]) * a;
      }
      G[0] = x; G[1] = y; G[2] = z; st.pGok = true;
    }
    luki.update(dt, obrot.matrixWorld);
    okruchy.update(dt, o.ziemia || null);
  }

  function dispose() {
    grupa.removeFromParent(); efekty.removeFromParent();
    geo.dispose(); mat.dispose(); matOkr.dispose(); atlas.dispose(); luki.dispose(); okruchy.dispose();
    if (matKopii) matKopii.dispose();
    mesh.skeleton.dispose();
  }
  function reset() {
    st.baza = 'ruch'; st.tryb = 'auto'; st.tau = 0.16;
    st.w.ruch = 1; st.w.skok = 0; st.w.smierc = 0; st.w.wygrana = 0;
    st.tb = 0; st.tAtak = -1; st.tOber = -1; st.tPior = -1; st.wSz = 0;
    st.skokZew = false; st.wPowPop = false; st.vS = 0; st.vPop = 0; st.acc = 0; st.omega = 0; st.pGok = false;
    st.G.fill(0); SPR.fill(0);
    st.bal.faza = 0; st.bal.k = 0; st.bal.nast = st.t + 3;
    luki.wyczysc(); okruchy.wyczysc();
  }
  function dlon(s, out) { return out.set(0.06 * s, 0, 0).applyMatrix4(kosci[DLON[s]].matrixWorld); }
  function chmury(v) { if (U.uChmury) U.uChmury.value = v; if (matOkr.userData.U.uChmury) matOkr.userData.U.uChmury.value = v; }
  // wielkość łuku cięcia (gra: zasięg broni, 1 = bazowy)
  function zasiegAtaku(k) { st.zasieg = clamp(k || 1, 0.5, 2.5); }

  update(0, {});
  return {
    grupa, mesh, kosci, efekty, material: mat, atlas, kopia,
    ustawStan, update, dispose, twarz, reset, dlon, chmury, zasiegAtaku, zasiegStrumienia: zasiegAtaku,
    get stan() { return { baza: st.baza, tryb: st.tryb, w: { ...st.w }, atak: st.tAtak >= 0, oberwal: st.tOber >= 0, v: st.vS }; },
    wymusTwarz(n) { st.twarzWym = n || null; },
    get kat() { return st.kat; }, set kat(a) { st.kat = a; },
    info: { trojkaty, trojkatyZObrysem: trojkatyRazem, kosci: NB, wierzcholki: geo.attributes.position.count, drawCalle: 3, wysokosc: geo.boundingBox.max.y * o.skala, wysokoscKuli: cialoPkt(0, Math.PI)[1] * o.skala },
    _st: st,
  };
}
export const STANY = ['idle', 'chod', 'bieg', 'skok', 'atak', 'oberwal', 'smierc', 'wygrana'];
