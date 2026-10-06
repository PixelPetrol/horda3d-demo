// ╔══════════════ POSTACIE Z MESHY — WŁASNY SZKIELET W KODZIE (05.10.2026) ══════════════╗
// Model z Meshy (obraz → 3D, poza T, ~15 tys. trójkątów, tekstura) jest piękny, ale jego automatyczny szkielet psuje
// postacie z wielką głową: ręka w chodzie wchodzi nad głowę, liście kucyka ruszają się z barkiem. Tu szkielet i wagi
// liczymy SAMI z geometrii, a animacje są proceduralne (to samo API co lib/czekotubka.js i lib/razoretta.js).
// Pierwsza postać: Razoretta (dostawa-grafik/meshy/razoretta2/model.glb). Kolejne (Beetino, Carrotello): KONFIGI.
//
// RIG (czysty JS, bez THREE — działa też w node: narzedzia/eksport_meshy.mjs):
//   uzbroj(pos, idx, konf) → { kosci: [[nazwa, rodzic, [x,y,z], kolejnośćEulera]], skinIndex, skinWeight, region, stawy, raport }
//   • STAWY z przekrojów: ręce = pętle x = const od czubków palców (knykcie, nadgarstek za dłonią, łokieć = najcieńsze
//     miejsce, bark = wejście w rękaw/tułów), nogi = pętle y = const od podeszew (cholewka buta → kostka, kolano =
//     najcieńsze, krocze = pętle się zlewają), głowa = najszerszy przekrój nad rękawami (środek kuli), szyja = najmniejsza
//     pętla, której rozcięcie ODCINA głowę od miednicy, łodyżka kucyka = najwęższa pętla nad głową. Symetria L/P.
//     Poprawki ręczne: konf.stawy[nazwa] = [dx, dy, dz] albo { abs: [x, y, z] } (jednostki MODELU).
//   • REGIONY z topologii (nie z odległości): rozcięcie siatki po pętlach (rękaw, pod kroczem, szyja, łodyżka) i spójne
//     kawałki od dłoni / podeszew / twarzy / czubka kucyka → liście wiszące nad barkiem NIGDY nie dostają wagi ręki.
//   • WAGI: wzdłuż łańcucha stawów (rzut na łamaną, smoothstep w stawach), głowa sztywno (+ szyja przy cięciu), kucyk
//     po odległości wzdłuż liści od łodyżki (3 kości), spódnica = biodra + 4 klapy (bez ud — nie rozjeżdża się między
//     nogami), palce (bez kciuka) na jednej kości, ≤ 4 wpływy. Kości POMOCNICZE w barkach, łokciach i kolanach dostają
//     połowę obrotu stawu → przy zgięciu 90° pierścień stawu trzyma ≥ 93% promienia (bez nich 76% — „cukierek").
// GRA:
//   const dane = await wczytajPostacMeshy(THREE, GLTFLoader, url, KONFIGI.razoretta)   // gotowy GLB albo surowy z Meshy
//   const p = stworzPostacMeshy(THREE, dane, { scena, skala, obrys, toon, chmury: { tex, off, skala }, kopia: { krycie, bias } })
//     → { grupa, efekty, ustawStan(stan), update(dt, { predkosc, kierunek, wPowietrzu, vy, ziemia, szybuje }), dispose(),
//         reset(), dlon(s, out), chmury(0|1), zasiegAtaku(k) (= zasiegStrumienia), material (U.uBlysk/uBlyskKol), kopia,
//         kontur, kat, stan, info, _st }
//   stany: 'auto' (idle/chód/bieg wg prędkości), 'idle', 'chod', 'bieg', 'skok', 'smierc', 'wygrana' = baza (mieszana
//   wagami), 'atak', 'oberwal' = WARSTWY. Ręce w ataku, wygranej i szybowaniu z IK dwukostkowego (tor nadgarstka).
// RENDER: jedna SkinnedMesh (Meshy + scyzoryk z kodu w tej samej geometrii) + kontur (odwrócona powłoka, ta sama
//   geometria i szkielet) = 2 draw calle, + 1 łuki cięć gdy są; tekstura Meshy, toon jak reszta gry, cień chmur, błysk,
//   kopia za przeszkodą, własne customProgramCacheKey. Układ: Y w górę, przód +Z, stopy y = 0, lewa ręka postaci = +X.
// ╚═══════════════════════════════════════════════════════════════════════════╝
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const mediana = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

// ============================== GEOMETRIA: spawanie, sąsiedztwo, przekroje ==============================
// Meshy rozcina wierzchołki na szwach UV (23,8 tys. wierzchołków na 7,7 tys. pozycji) — szkielet i wagi liczymy
// na pozycjach zespawanych, potem rozkładamy z powrotem (te same wagi po obu stronach szwu = bez pęknięć).
export function spawaj(pos, eps = 1e-5) {
  const n = pos.length / 3, mapa = new Int32Array(n), klucze = new Map(), W = [];
  const q = 1 / eps;
  for (let i = 0; i < n; i++) {
    const k = Math.round(pos[i * 3] * q) + ',' + Math.round(pos[i * 3 + 1] * q) + ',' + Math.round(pos[i * 3 + 2] * q);
    let id = klucze.get(k);
    if (id === undefined) { id = W.length / 3; klucze.set(k, id); W.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); }
    mapa[i] = id;
  }
  return { W: Float64Array.from(W), mapa, nw: W.length / 3 };
}
function trojkatySpawane(idx, mapa) {
  const T = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = mapa[idx[i]], b = mapa[idx[i + 1]], c = mapa[idx[i + 2]];
    if (a !== b && b !== c && a !== c) T.push(a, b, c);
  }
  return Int32Array.from(T);
}
// sąsiedztwo CSR (off/sas/dl = długość krawędzi)
function sasiedztwo(nw, T, W) {
  const zb = Array.from({ length: nw }, () => new Set());
  for (let i = 0; i < T.length; i += 3) {
    const a = T[i], b = T[i + 1], c = T[i + 2];
    zb[a].add(b); zb[a].add(c); zb[b].add(a); zb[b].add(c); zb[c].add(a); zb[c].add(b);
  }
  const off = new Int32Array(nw + 1); for (let i = 0; i < nw; i++) off[i + 1] = off[i] + zb[i].size;
  const sas = new Int32Array(off[nw]), dl = new Float64Array(off[nw]);
  for (let i = 0; i < nw; i++) {
    let k = off[i];
    for (const j of zb[i]) {
      sas[k] = j;
      dl[k] = Math.hypot(W[i * 3] - W[j * 3], W[i * 3 + 1] - W[j * 3 + 1], W[i * 3 + 2] - W[j * 3 + 2]);
      k++;
    }
  }
  return { off, sas, dl };
}
const kluczKr = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);
// przekrój płaszczyzną (oś os = c): pętle przecięcia jako skupiska {n, c:[śr], mn, mx, e:[rozpiętość], kr:[klucze krawędzi]}
function przekroj(W, T, os, c) {
  c += 1.37e-7;
  const pkt = new Map(), P = [], rodz = [], kr = [];
  const znajdz = i => { while (rodz[i] !== i) { rodz[i] = rodz[rodz[i]]; i = rodz[i]; } return i; };
  const punkt = (a, b) => {
    const k = kluczKr(a, b);
    let id = pkt.get(k);
    if (id === undefined) {
      const da = W[a * 3 + os] - c, db = W[b * 3 + os] - c, t = da / (da - db);
      id = P.length / 3; pkt.set(k, id); rodz.push(id); kr.push(k);
      P.push(W[a * 3] + (W[b * 3] - W[a * 3]) * t, W[a * 3 + 1] + (W[b * 3 + 1] - W[a * 3 + 1]) * t, W[a * 3 + 2] + (W[b * 3 + 2] - W[a * 3 + 2]) * t);
    }
    return id;
  };
  for (let i = 0; i < T.length; i += 3) {
    const a = T[i], b = T[i + 1], d = T[i + 2];
    const sa = W[a * 3 + os] > c, sb = W[b * 3 + os] > c, sd = W[d * 3 + os] > c;
    if (sa === sb && sb === sd) continue;
    const e0 = sa !== sb ? punkt(a, b) : -1, e1 = sb !== sd ? punkt(b, d) : -1, e2 = sd !== sa ? punkt(d, a) : -1;
    const p = e0 >= 0 ? e0 : e1, q = e2 >= 0 ? e2 : e1;
    const r1 = znajdz(p), r2 = znajdz(q); if (r1 !== r2) rodz[r1] = r2;
  }
  const sk = new Map();
  for (let i = 0; i < P.length / 3; i++) {
    const r = znajdz(i);
    let s = sk.get(r);
    if (!s) { s = { n: 0, c: [0, 0, 0], mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9], kr: [] }; sk.set(r, s); }
    s.n++; s.kr.push(kr[i]);
    for (let k = 0; k < 3; k++) { const v = P[i * 3 + k]; s.c[k] += v; if (v < s.mn[k]) s.mn[k] = v; if (v > s.mx[k]) s.mx[k] = v; }
  }
  const wyn = [];
  for (const s of sk.values()) { s.c = s.c.map(v => v / s.n); s.e = [s.mx[0] - s.mn[0], s.mx[1] - s.mn[1], s.mx[2] - s.mn[2]]; wyn.push(s); }
  return wyn;
}
// śledzenie pętli przez kolejne przekroje: skupisko, które zawiera poprzedni środek (z marginesem) i nie jest okruchem
// (rozmiar ≥ 0,4 poprzedniego) — najmniejsze z nich; inaczej najbliższe w promieniu maxD
function wybierz(kl, p, osie, prevS, maxD) {
  const [a, b] = osie;
  let best = null, bestS = Infinity, duzy = null, duzyS = -1;
  for (const k of kl) {
    if (k.n < 4) continue;
    const ma = 0.15 * k.e[a] + 0.004, mb = 0.15 * k.e[b] + 0.004;
    if (p[a] < k.mn[a] - ma || p[a] > k.mx[a] + ma || p[b] < k.mn[b] - mb || p[b] > k.mx[b] + mb) continue;
    const S = Math.sqrt((k.e[a] + 0.001) * (k.e[b] + 0.001));
    if (S >= 0.4 * prevS && S < bestS) { bestS = S; best = k; }
    if (S > duzyS) { duzyS = S; duzy = k; }
  }
  if (best || duzy) return best || duzy;
  let bd = maxD;
  for (const k of kl) { if (k.n < 4) continue; const d = Math.hypot(k.c[a] - p[a], k.c[b] - p[b]); if (d < bd) { bd = d; best = k; } }
  return best;
}
const rozmiar = (k, a, b) => Math.sqrt(k.e[a] * k.e[b]);

// spójna składowa od wierzchołka start, bez przechodzenia przez krawędzie ze zbioru `ciete` i wierzchołki z `zakaz`
function skladowa(G, start, ciete, zakaz) {
  const nw = G.off.length - 1, w = new Uint8Array(nw), stos = [start];
  w[start] = 1;
  while (stos.length) {
    const i = stos.pop();
    for (let k = G.off[i]; k < G.off[i + 1]; k++) {
      const j = G.sas[k];
      if (w[j] || (zakaz && zakaz[j]) || (ciete && ciete.has(kluczKr(i, j)))) continue;
      w[j] = 1; stos.push(j);
    }
  }
  return w;
}
// Dijkstra (odległość po powierzchni) od zbioru źródeł, tylko w obrębie maski
function geodezja(G, zrodla, maska) {
  const nw = G.off.length - 1, d = new Float64Array(nw).fill(Infinity);
  const kop = [];   // kopiec binarny [odl, wierzchołek]
  const wstaw = (o, v) => { kop.push([o, v]); let i = kop.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (kop[p][0] <= kop[i][0]) break; [kop[p], kop[i]] = [kop[i], kop[p]]; i = p; } };
  const zdejmij = () => {
    const top = kop[0], last = kop.pop();
    if (kop.length) { kop[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < kop.length && kop[l][0] < kop[m][0]) m = l; if (r < kop.length && kop[r][0] < kop[m][0]) m = r; if (m === i) break; [kop[m], kop[i]] = [kop[i], kop[m]]; i = m; } }
    return top;
  };
  for (const z of zrodla) { d[z] = 0; wstaw(0, z); }
  while (kop.length) {
    const [o, i] = zdejmij();
    if (o > d[i]) continue;
    for (let k = G.off[i]; k < G.off[i + 1]; k++) {
      const j = G.sas[k];
      if (maska && !maska[j]) continue;
      const n = o + G.dl[k];
      if (n < d[j]) { d[j] = n; wstaw(n, j); }
    }
  }
  return d;
}

// ============================== STAWY Z GEOMETRII ==============================
// Postać z Meshy w pozie T: Y w górę, przód = +Z, lewa ręka postaci = +X. Wszystko w jednostkach modelu.
// Ręce: przekroje x = const od czubka palców do tułowia (pętla ręki rośnie skokowo, gdy wchodzi w tułów/rękaw).
// Nogi: przekroje y = const od podeszwy w górę, dwie pętle aż do krocza (zlewają się w jedną).
// Głowa: przekroje y nad barkami — równik (najszerszy), szyja (najwęższa między barkami a głową, która ODCINA głowę),
// łodyżka liści (najwęższa nad czubkiem). Poprawki z konfiguracji: konf.stawy[nazwa] = [dx, dy, dz] albo {abs: [x, y, z]}.
function profilReki(W, T, s, mn, mx, H) {
  const nw = W.length / 3;
  let tip = 0; for (let i = 0; i < nw; i++) if (s * W[i * 3] > s * W[tip * 3]) tip = i;
  const krok = 0.004 * H;
  let p = [W[tip * 3], W[tip * 3 + 1], W[tip * 3 + 2]], prevS = 0;
  const prof = [];
  for (let x = W[tip * 3] - s * krok * 0.5; s * x > 0; x -= s * krok) {
    const kl = przekroj(W, T, 0, x);
    const k = wybierz(kl, p, [1, 2], prevS, 0.06 * H);
    if (!k) break;
    prof.push({ x, y: k.c[1], z: k.c[2], ey: k.e[1], ez: k.e[2], S: rozmiar(k, 1, 2), k });
    if (k.e[1] > 0.3 * H) break;                  // wszedł w tułów
    p = k.c; prevS = rozmiar(k, 1, 2);
  }
  return { tip, prof };
}
function profilNog(W, T, mn, H) {
  const krok = 0.004 * H;
  let kl = przekroj(W, T, 1, mn[1] + krok);
  const naBok = s => kl.filter(k => s * k.c[0] > 0).sort((a, b) => rozmiar(b, 0, 2) - rozmiar(a, 0, 2))[0];
  let kL = naBok(1), kP = naBok(-1);
  if (!kL || !kP) return null;
  const prof = { 1: [], [-1]: [] };
  let pL = kL.c, pP = kP.c, sL = 0, sP = 0, krocze = null;
  for (let y = mn[1] + krok; y < mn[1] + 0.75 * H; y += krok) {
    kl = przekroj(W, T, 1, y);
    kL = wybierz(kl, pL, [0, 2], sL, 0.05 * H); kP = wybierz(kl, pP, [0, 2], sP, 0.05 * H);
    if (!kL || !kP) break;
    if (kL === kP) { krocze = { y, k: kL }; break; }
    prof[1].push({ y, x: kL.c[0], z: kL.c[2], ex: kL.e[0], ez: kL.e[2], S: rozmiar(kL, 0, 2), k: kL });
    prof[-1].push({ y, x: kP.c[0], z: kP.c[2], ex: kP.e[0], ez: kP.e[2], S: rozmiar(kP, 0, 2), k: kP });
    pL = kL.c; pP = kP.c; sL = rozmiar(kL, 0, 2); sP = rozmiar(kP, 0, 2);
  }
  return { prof, krocze };
}
// profil środkowej pętli tułowia/głowy w górę od y0 (pętla zawierająca oś ciała)
function profilOsi(W, T, y0, y1, os0, H) {
  const krok = 0.004 * H, prof = [];
  let p = os0, prevS = 0;
  for (let y = y0; y < y1; y += krok) {
    const kl = przekroj(W, T, 1, y);
    const k = wybierz(kl, p, [0, 2], prevS * 0.5, 0.04 * H);
    if (!k) break;
    prof.push({ y, x: k.c[0], z: k.c[2], ex: k.e[0], ez: k.e[2], S: rozmiar(k, 0, 2), k });
    p = k.c; prevS = rozmiar(k, 0, 2);
  }
  return prof;
}
const punktProf = (prof, klucz, v) => {      // interpolacja profilu po współrzędnej klucz (x albo y)
  let best = prof[0], bd = Infinity;
  for (const e of prof) { const d = Math.abs(e[klucz] - v); if (d < bd) { bd = d; best = e; } }
  return best;
};

export function wyznaczStawy(W, T, konf = {}) {
  const nw = W.length / 3, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nw; i++) for (let k = 0; k < 3; k++) { const v = W[i * 3 + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  const H = mx[1] - mn[1], st = {}, rap = { H, mn, mx, uwagi: [] };
  // ---- ręce ----
  const reka = {};
  for (const s of [1, -1]) {
    const { tip, prof } = profilReki(W, T, s, mn, mx, H);
    const dl = e => Math.abs(e.x - W[tip * 3]);
    const iT = prof.findIndex((e, i) => i > 4 && e.ey > 0.3 * H);
    const wej = iT > 0 ? prof[iT] : prof[prof.length - 1];
    const L = dl(wej);
    const Tr = mediana(prof.filter(e => dl(e) > 0.35 * L && dl(e) < 0.6 * L).map(e => e.S));
    const ezPrzed = mediana(prof.filter(e => dl(e) > 0.4 * L && dl(e) < 0.55 * L).map(e => e.ez));
    // rękaw: pierwszy przekrój (od dłoni) wyraźnie grubszy od ramienia, w wewnętrznej połowie
    const iR = prof.findIndex(e => dl(e) > 0.55 * L && e.S > 1.6 * Tr);
    const barkX = wej.x + s * 0.6 * Tr;
    const os = prof.filter(e => dl(e) > 0.5 * L && dl(e) < 0.72 * L);
    const osY = mediana(os.map(e => e.y)), osZ = mediana(os.map(e => e.z));
    // nadgarstek: za najszerszym miejscem dłoni (z kciukiem) pierwszy przekrój cieńszy niż 1,3 × przedramię
    let iD = 0, ezD = 0;
    prof.forEach((e, i) => { if (dl(e) > 0.05 * L && dl(e) < 0.3 * L && e.ez > ezD) { ezD = e.ez; iD = i; } });
    let iN = prof.findIndex((e, i) => i > iD && e.ez < 1.3 * ezPrzed);
    if (iN < 0) iN = Math.round(prof.length * 0.25);
    const nadg = prof[iN];
    // łokieć: najcieńsze miejsce między 35 a 65% odcinka bark–nadgarstek (inaczej połowa)
    const xa = barkX, xb = nadg.x;
    let lok = null;
    for (const e of prof) {
      const t = (e.x - xa) / (xb - xa);
      if (t > 0.35 && t < 0.65 && (!lok || e.S < lok.S)) lok = e;
    }
    const lokX = lok ? lok.x : (xa + xb) / 2, lokE = punktProf(prof, 'x', lokX);
    // knykcie: od czubka palców pierwszy przekrój, w którym pętla ma już szerokość dłoni (palce zlały się w jedną)
    let iK = prof.findIndex(e => e.ez >= 0.6 * ezD);
    if (iK < 0 || iK >= iN) iK = Math.max(0, iN >> 1);
    const kn = prof[iK];
    reka[s] = { tip: [W[tip * 3], W[tip * 3 + 1], W[tip * 3 + 2]], tipW: tip, iT: iT > 0 ? iT : prof.length, wejX: wej.x, rekawX: iR >= 0 ? prof[iR].x : null, Tr, L,
      kluczTulow: iT > 0 ? prof[iT - 1].k.kr : null, prof,
      dlon: { zMn: kn.k.mn[2], zMx: kn.k.mx[2], y: kn.y, ey: kn.ey, x: kn.x } };
    const n = s > 0 ? 'L' : 'P';
    st['bark' + n] = [barkX, osY, osZ];
    st['lokiec' + n] = [lokX, lokE.y, lokE.z];
    st['nadg' + n] = [nadg.x, nadg.y, nadg.z];
    st['palce' + n] = [kn.x, kn.y, kn.z];
    st['czubek' + n] = [W[tip * 3], nadg.y, nadg.z];
  }
  rap.reka = { L: { Tr: reka[1].Tr, L: reka[1].L, wejX: reka[1].wejX, rekawX: reka[1].rekawX }, P: { Tr: reka[-1].Tr, L: reka[-1].L, wejX: reka[-1].wejX, rekawX: reka[-1].rekawX } };
  // ---- nogi ----
  const PN = profilNog(W, T, mn, H);
  if (!PN || !PN.krocze) throw new Error('postac-meshy: nie znalazłem dwóch nóg / krocza');
  const kroczeY = PN.krocze.y;
  const noga = {};
  for (const s of [1, -1]) {
    const pr = PN.prof[s], dlN = kroczeY - mn[1];
    const ref = mediana(pr.filter(e => e.y > mn[1] + 0.45 * dlN && e.y < mn[1] + 0.65 * dlN).map(e => e.S));
    const ostatni = pr[pr.length - 1];
    const udoT = ostatni.ex;
    const biodroY = kroczeY + 0.3 * udoT;
    // cholewka buta: pierwszy (od podeszwy) przekrój o długości < 1,5 × grubość łydki
    const iK = pr.findIndex(e => e.ez < 1.5 * ref && e.ex < 1.6 * ref);
    const cholewka = pr[iK >= 0 ? iK : Math.round(pr.length * 0.2)];
    const kostkaY = mn[1] + 0.62 * (cholewka.y - mn[1]);
    const lydka = punktProf(pr, 'y', cholewka.y + 0.03 * H);       // oś kostki z goleni nad butem (but wystaje w przód)
    // kolano: najcieńsze miejsce 30–60% odcinka biodro–kostka
    let kol = null;
    for (const e of pr) { const t = (biodroY - e.y) / (biodroY - kostkaY); if (t > 0.3 && t < 0.6 && (!kol || e.S < kol.S)) kol = e; }
    const kolY = kol ? kol.y : (biodroY + kostkaY) / 2, kolE = punktProf(pr, 'y', kolY);
    // podeszwa: najdalej wysunięty w przód punkt buta → czubek
    const n = s > 0 ? 'L' : 'P';
    st['biodro' + n] = [ostatni.x, biodroY, ostatni.z];
    st['kolano' + n] = [kolE.x, kolY, kolE.z];
    st['kostka' + n] = [lydka.x, kostkaY, lydka.z];
    noga[s] = { ref, cholewkaY: cholewka.y, udoT, kluczKrocze: ostatni.k.kr, prof: pr };
  }
  // symetria (model w pozie T z Meshy jest prawie symetryczny): uśrednij strony — inaczej chód kuleje
  if (konf.symetria !== false) {
    for (const n of ['bark', 'lokiec', 'nadg', 'palce', 'czubek', 'biodro', 'kolano', 'kostka']) {
      const a = st[n + 'L'], b = st[n + 'P'], cx = (mn[0] + mx[0]) / 2;
      const x = (a[0] - b[0]) / 2, y = (a[1] + b[1]) / 2, z = (a[2] + b[2]) / 2;
      st[n + 'L'] = [cx + x, y, z]; st[n + 'P'] = [cx - x, y, z];
    }
    const ch = (noga[1].cholewkaY + noga[-1].cholewkaY) / 2; noga[1].cholewkaY = noga[-1].cholewkaY = ch;
  }
  rap.noga = { L: { ref: noga[1].ref, cholewkaY: noga[1].cholewkaY }, P: { ref: noga[-1].ref, cholewkaY: noga[-1].cholewkaY }, kroczeY };
  // miednica: pętla zaraz nad kroczem (obie nogi w jednej)
  const miedn = PN.krocze.k;
  rap.miednica = { c: miedn.c, e: miedn.e };
  // ---- tułów, szyja, głowa, łodyżka ----
  const ramieY = (st.barkL[1] + st.barkP[1]) / 2;
  const osBody = [(st.biodroL[0] + st.biodroP[0]) / 2, 0, (st.biodroL[2] + st.biodroP[2]) / 2];
  const profT = profilOsi(W, T, kroczeY + 0.004 * H, ramieY - 0.01 * H, [osBody[0], kroczeY, osBody[2]], H);
  let talia = null;
  for (const e of profT) if (e.y > kroczeY + 0.04 * H && (!talia || e.ex < talia.ex)) talia = e;
  const taliaY = talia ? talia.y : lerp(kroczeY, ramieY, 0.5);
  st.biodra = [(st.biodroL[0] + st.biodroP[0]) / 2, (st.biodroL[1] + st.biodroP[1]) / 2, (st.biodroL[2] + st.biodroP[2]) / 2];
  st.kregoslup = [talia ? talia.x : osBody[0], taliaY, talia ? talia.z : osBody[2]];
  const klY = lerp(taliaY, ramieY, 0.55), klE = punktProf(profT, 'y', klY);
  st.klatka = [klE.x, klY, klE.z];
  // nad barkami: od szczytu rękawów w górę
  const rekawGora = Math.max(...[1, -1].map(s => {
    const r = reka[s], tipX = r.tip[0];
    return Math.max(...r.prof.filter((e, i) => i < r.iT && Math.abs(e.x - tipX) > 0.6 * r.L).map(e => e.k.mx[1]));
  }));
  const profG = profilOsi(W, T, ramieY, mx[1], [st.klatka[0], ramieY, st.klatka[2]], H);
  // równik głowy = najszerszy przekrój powyżej szczytu rękawów
  let row = null;
  for (const e of profG) if (e.y > rekawGora && (!row || e.ex > row.ex)) row = e;
  const R = (row.ex + row.ez) / 4;
  const srodek = [row.x, row.y, row.z];
  // łodyżka liści (gumka kucyka): najwęższy przekrój powyżej równik + 0,8 R, ale nie pojedyncza łodyga po rozwidleniu
  // (pętla śledzona w górę w końcu trafia w jeden ogonek liścia: odrzucamy przekroje < 20% przekroju czubka głowy)
  const sCzub = punktProf(profG, 'y', row.y + R).S;
  let lod = null;
  for (const e of profG) if (e.y > row.y + 0.8 * R && e.S > 0.2 * sCzub && (!lod || e.S < lod.S)) lod = e;
  rap.glowa = { R, srodek, rekawGora, rownikY: row.y, lodygaY: lod ? lod.y : null };
  st.glowa = srodek;
  if (lod) st.kucyk0 = [lod.x, lod.y, lod.z];
  // szyja: pętla między szczytem rękawów a równikiem, której rozcięcie ODDZIELA głowę od miednicy; najmniejsza z nich
  const G = sasiedztwo(nw, T, W);
  const najblizszy = p => { let b = 0, bd = Infinity; for (let i = 0; i < nw; i++) { const d = Math.hypot(W[i * 3] - p[0], W[i * 3 + 1] - p[1], W[i * 3 + 2] - p[2]); if (d < bd) { bd = d; b = i; } } return b; };
  const czubek = najblizszy([srodek[0], srodek[1], srodek[2] + R]);   // środek twarzy — na pewno głowa
  const wMied = najblizszy(miedn.c);                                     // miednica
  let szyja = null;
  for (const e of profG) {
    if (e.y < rekawGora - 0.01 * H || e.y > row.y - 0.3 * R) continue;
    const ciete = new Set(e.k.kr);
    const sk = skladowa(G, czubek, ciete, null);
    if (sk[wMied]) continue;                       // nie odcina
    if (!szyja || e.S < szyja.S) szyja = { ...e, ciete };
  }
  if (!szyja) { rap.uwagi.push('szyja: żaden przekrój nie odcina głowy — cięcie płaszczyzną'); }
  const szyjaY = szyja ? szyja.y : (rekawGora + row.y - R) / 2;
  st.szyja = [szyja ? szyja.x : srodek[0], szyjaY, szyja ? szyja.z : srodek[2]];
  st.root = [st.biodra[0], mn[1], st.biodra[2]];
  // ---- poprawki ręczne (jednostki modelu) ----
  for (const [n, v] of Object.entries(konf.stawy || {})) {
    if (!st[n]) st[n] = [0, 0, 0];
    if (Array.isArray(v)) { st[n] = [st[n][0] + v[0], st[n][1] + v[1], st[n][2] + v[2]]; } else if (v.abs) st[n] = v.abs.slice();
  }
  return { st, rap, H, mn, mx, G, reka, noga, szyja, czubek, wMied, R, srodek, kroczeY, taliaY, ramieY, rekawGora, miedn, lod, talia };
}

// ============================== KOŚCI ==============================
// [nazwa, rodzic, kolejność Eulera]. Spoczynek: wszystkie kości bez obrotu (osie świata), pozycje = stawy.
// Kości POMOCNICZE (bark*, lokiecPom*, kolanoPom*) stoją w tym samym miejscu co staw obok i co klatkę dostają
// POŁOWĘ jego obrotu (slerp) — wierzchołki w samym zgięciu idą za nimi, więc łokieć/kolano przy 90° nie zapada się
// (LBS z dwiema kośćmi traci w środku zgięcia cos(θ/2) = 71% grubości, z pomocniczą cos(θ/4) = 92%).
export const KOSCI = [
  ['root', null, 'YXZ'], ['biodra', 'root', 'YXZ'], ['kregoslup', 'biodra', 'YXZ'], ['klatka', 'kregoslup', 'YXZ'],
  ['szyja', 'klatka', 'YXZ'], ['glowa', 'szyja', 'YXZ'], ['kucyk0', 'glowa', 'XYZ'], ['kucyk1', 'kucyk0', 'XYZ'], ['kucyk2', 'kucyk1', 'XYZ'],
  ['barkL', 'klatka', 'XZY'], ['ramieL', 'klatka', 'XZY'], ['lokiecPomL', 'ramieL', 'YXZ'], ['lokiecL', 'ramieL', 'YXZ'], ['dlonL', 'lokiecL', 'ZYX'], ['palceL', 'dlonL', 'ZYX'],
  ['barkP', 'klatka', 'XZY'], ['ramieP', 'klatka', 'XZY'], ['lokiecPomP', 'ramieP', 'YXZ'], ['lokiecP', 'ramieP', 'YXZ'], ['dlonP', 'lokiecP', 'ZYX'], ['palceP', 'dlonP', 'ZYX'],
  ['noz', 'dlonP', 'XYZ'],
  ['udoL', 'biodra', 'YXZ'], ['kolanoPomL', 'udoL', 'YXZ'], ['kolanoL', 'udoL', 'YXZ'], ['stopaL', 'kolanoL', 'YXZ'],
  ['udoP', 'biodra', 'YXZ'], ['kolanoPomP', 'udoP', 'YXZ'], ['kolanoP', 'udoP', 'YXZ'], ['stopaP', 'kolanoP', 'YXZ'],
  ['spP', 'biodra', 'XYZ'], ['spT', 'biodra', 'XYZ'], ['spL', 'biodra', 'XYZ'], ['spR', 'biodra', 'XYZ'],
];
export const POMOCNICZE = [['barkL', 'ramieL'], ['lokiecPomL', 'lokiecL'], ['barkP', 'ramieP'], ['lokiecPomP', 'lokiecP'],
  ['kolanoPomL', 'kolanoL'], ['kolanoPomP', 'kolanoP']];
const KI = Object.fromEntries(KOSCI.map((k, i) => [k[0], i]));
export const REGIONY = ['tułów', 'głowa', 'kucyk', 'ręka L', 'ręka P', 'noga L', 'noga P', 'spódnica'];
const RG = { tulow: 0, glowa: 1, kucyk: 2, rekaL: 3, rekaP: 4, nogaL: 5, nogaP: 6, spodnica: 7 };

// rzut na łamaną stawów → parametr t (długość wzdłuż łamanej; < 0 przed pierwszym, > długości za ostatnim)
function naLamanej(J, v) {
  let best = Infinity, tBest = 0, acc = 0;
  for (let i = 0; i < J.length - 1; i++) {
    const a = J[i], b = J[i + 1], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]) || 1e-9;
    let u = ((v[0] - a[0]) * d[0] + (v[1] - a[1]) * d[1] + (v[2] - a[2]) * d[2]) / (L * L);
    const uc = i === 0 ? Math.min(u, 1) : (i === J.length - 2 ? Math.max(u, 0) : clamp(u, 0, 1));
    const px = a[0] + d[0] * uc, py = a[1] + d[1] * uc, pz = a[2] + d[2] * uc;
    const dist = Math.hypot(v[0] - px, v[1] - py, v[2] - pz);
    if (dist < best) { best = dist; tBest = acc + uc * L; }
    acc += L;
  }
  return tBest;
}
const dlugosci = J => { const o = [0]; for (let i = 1; i < J.length; i++) o.push(o[i - 1] + Math.hypot(J[i][0] - J[i - 1][0], J[i][1] - J[i - 1][1], J[i][2] - J[i - 1][2])); return o; };

// ============================== RIG: regiony + wagi ==============================
// Regiony z TOPOLOGII (nie z odległości): siatkę rozcinamy po pętlach przekrojów — rękaw przy tułowiu, obie nogi
// tuż pod kroczem, szyja, łodyżka kucyka — i bierzemy spójne kawałki od dłoni, podeszew, twarzy. Dzięki temu liście,
// które wiszą tuż nad prawym barkiem, NIGDY nie dostaną wagi ręki (są połączone tylko z głową, przez łodyżkę).
// Wagi: w regionie liczone wzdłuż łańcucha stawów (gładkie przejścia smoothstep w stawach), głowa i kucyk sztywno
// (głowa + szyja przy samym cięciu, kucyk po odległości wzdłuż liści od łodyżki), spódnica = biodra + 4 klapy
// (bez ud — nie rozjeżdża się między nogami; klapy unosi animacja razem z udami), najwyżej 4 wpływy.
export function uzbroj(pos, idx, konf = {}) {
  const { W, mapa, nw } = spawaj(pos);
  const T = trojkatySpawane(idx, mapa);
  const S = wyznaczStawy(W, T, konf);
  const { st, G, reka, noga, R, srodek, kroczeY, taliaY, H } = S;
  const v3 = i => [W[i * 3], W[i * 3 + 1], W[i * 3 + 2]];
  // ---- cięcia ----
  const ciete = new Set();
  for (const s of [1, -1]) for (const k of reka[s].kluczTulow || []) ciete.add(k);
  for (const s of [1, -1]) for (const k of noga[s].kluczKrocze) ciete.add(k);
  if (S.szyja) for (const k of S.szyja.ciete) ciete.add(k);
  const reg = new Int8Array(nw).fill(-1);
  const zasiej = (start, r) => { const sk = skladowa(G, start, ciete, null); let n = 0; for (let i = 0; i < nw; i++) if (sk[i] && reg[i] < 0) { reg[i] = r; n++; } return n; };
  const podeszwa = s => { let b = -1, bd = Infinity; for (let i = 0; i < nw; i++) { if (s * W[i * 3] <= 0) continue; const d = W[i * 3 + 1] + 0.0 * Math.abs(W[i * 3]); if (d < bd) { bd = d; b = i; } } return b; };
  const licz = {};
  licz.rekaL = zasiej(reka[1].tipW, RG.rekaL); licz.rekaP = zasiej(reka[-1].tipW, RG.rekaP);
  licz.nogaL = zasiej(podeszwa(1), RG.nogaL); licz.nogaP = zasiej(podeszwa(-1), RG.nogaP);
  licz.glowa = zasiej(S.czubek, RG.glowa);
  licz.tulow = zasiej(S.wMied, RG.tulow);
  const uw = S.rap.uwagi;
  // kontrola rozcięć: region nie może zawierać ziarna innego regionu
  if (reg[S.wMied] !== RG.tulow || reg[S.czubek] !== RG.glowa || reg[reka[1].tipW] !== RG.rekaL || reg[reka[-1].tipW] !== RG.rekaP)
    uw.push('rozcięcia nie rozdzieliły regionów');
  // okruchy niepołączone z niczym: region najbliższego (euklidesowo) przypisanego wierzchołka
  let sieroty = 0;
  for (let i = 0; i < nw; i++) {
    if (reg[i] >= 0) continue;
    let b = -1, bd = Infinity;
    for (let j = 0; j < nw; j++) { if (reg[j] < 0) continue; const d = (W[i * 3] - W[j * 3]) ** 2 + (W[i * 3 + 1] - W[j * 3 + 1]) ** 2 + (W[i * 3 + 2] - W[j * 3 + 2]) ** 2; if (d < bd) { bd = d; b = j; } }
    reg[i] = b >= 0 ? reg[b] : RG.tulow; sieroty++;
  }
  // ---- kucyk: rozcięcie pętli łodyżki, kawałek nad nią (połączony z resztą głowy tylko przez łodyżkę) ----
  let kucykN = 0, Lk = 0;
  const gK = new Float64Array(nw).fill(Infinity);
  if (S.lod) {
    const wGl = new Uint8Array(nw);
    for (let i = 0; i < nw; i++) wGl[i] = reg[i] === RG.glowa ? 1 : 0;
    const zak = new Uint8Array(nw); for (let i = 0; i < nw; i++) zak[i] = wGl[i] ? 0 : 1;
    // łodyżka to kilka pętli (ogonki + gumka): tniemy WSZYSTKIE pętle przekroju blisko jej osi; kilka poziomów,
    // pierwszy, który odcina kucyk od twarzy
    const rL = Math.max(1.6 * Math.max(S.lod.ex, S.lod.ez) / 2, (konf.kucyk?.promien ?? 0.35) * R);
    let sk = null, cK = null;
    for (const dy of [0, 0.006, -0.006, 0.012, 0.02, 0.03, 0.04].map(k => k * H)) {
      const yc = st.kucyk0[1] + dy, kl = przekroj(W, T, 1, yc);
      const c = new Set();
      for (const k of kl) if (Math.hypot(k.c[0] - st.kucyk0[0], k.c[2] - st.kucyk0[2]) < rL) for (const e of k.kr) c.add(e);
      let z0 = -1, zy = -Infinity;                   // ziarno: wierzchołek głowy tuż nad cięciem, blisko osi
      for (let i = 0; i < nw; i++) {
        if (!wGl[i]) continue;
        const y = W[i * 3 + 1];
        if (y > yc && y < yc + 0.03 * H && Math.hypot(W[i * 3] - st.kucyk0[0], W[i * 3 + 2] - st.kucyk0[2]) < 0.04 * H && y > zy) { zy = y; z0 = i; }
      }
      if (z0 < 0) continue;
      const s2 = skladowa(G, z0, c, zak);
      if (!s2[S.czubek]) { sk = s2; cK = c; st.kucyk0 = [st.kucyk0[0], yc, st.kucyk0[2]]; break; }
    }
    {
      if (!sk) uw.push('łodyżka nie odcina kucyka od twarzy — kucyk sztywno z głową');
      else {
        // geodezja od pętli łodyżki (wierzchołki krawędzi cięcia po stronie kucyka)
        const zr = [];
        for (const k of cK) { const a = Math.floor(k / 1048576), b = k % 1048576; if (sk[a]) zr.push(a); if (sk[b]) zr.push(b); }
        const d = geodezja(G, zr, sk);
        for (let i = 0; i < nw; i++) if (sk[i]) { reg[i] = RG.kucyk; gK[i] = d[i]; kucykN++; if (d[i] > Lk && d[i] < Infinity) Lk = d[i]; }
      }
    }
  }
  // kości kucyka 1 i 2: środki ciężkości wierzchołków na 35% i 65% najdłuższej drogi wzdłuż liści
  const srodekPasma = (a, b) => { const c = [0, 0, 0]; let n = 0; for (let i = 0; i < nw; i++) if (reg[i] === RG.kucyk && gK[i] >= a * Lk && gK[i] <= b * Lk) { c[0] += W[i * 3]; c[1] += W[i * 3 + 1]; c[2] += W[i * 3 + 2]; n++; } return n ? c.map(v => v / n) : null; };
  if (kucykN) { st.kucyk1 = srodekPasma(0.3, 0.4); st.kucyk2 = srodekPasma(0.6, 0.7); }
  if (!st.kucyk0) st.kucyk0 = [srodek[0], srodek[1] + R, srodek[2]];
  if (!st.kucyk1) st.kucyk1 = [st.kucyk0[0], st.kucyk0[1] + 0.05 * H, st.kucyk0[2] - 0.05 * H];
  if (!st.kucyk2) st.kucyk2 = [st.kucyk1[0], st.kucyk1[1], st.kucyk1[2] - 0.05 * H];
  // ---- spódnica: wierzchołki tułowia pod talią, wyraźnie dalej od osi niż miednica (elipsa pętli nad kroczem) ----
  const md = S.miedn, ma = md.e[0] / 2, mb = md.e[2] / 2, mcx = md.c[0], mcz = md.c[2];
  const wTalia = S.talia ? [S.talia.ex / 2, S.talia.ez / 2] : [ma, mb];
  let rabek = Infinity;
  const progSp = konf.spodnica?.prog ?? 1.12;
  for (let i = 0; i < nw; i++) {
    if (reg[i] !== RG.tulow) continue;
    const y = W[i * 3 + 1];
    if (y > taliaY - 0.005 * H || y < kroczeY - 0.06 * H) continue;
    const r = Math.hypot((W[i * 3] - mcx) / ma, (W[i * 3 + 2] - mcz) / mb);
    if (r > progSp) { reg[i] = RG.spodnica; if (y < rabek) rabek = y; }
  }
  if (konf.spodnica === false) for (let i = 0; i < nw; i++) if (reg[i] === RG.spodnica) reg[i] = RG.tulow;
  const spodY = taliaY - 0.01 * H;
  st.spP = [mcx, spodY, mcz + wTalia[1]]; st.spT = [mcx, spodY, mcz - wTalia[1]];
  st.spL = [mcx + wTalia[0], spodY, mcz]; st.spR = [mcx - wTalia[0], spodY, mcz];
  // ---- pozycje kości ----
  const poz = {
    root: st.root, biodra: st.biodra, kregoslup: st.kregoslup, klatka: st.klatka, szyja: st.szyja, glowa: st.glowa,
    kucyk0: st.kucyk0, kucyk1: st.kucyk1, kucyk2: st.kucyk2,
    barkL: st.barkL, ramieL: st.barkL, lokiecPomL: st.lokiecL, lokiecL: st.lokiecL, dlonL: st.nadgL, palceL: st.palceL,
    barkP: st.barkP, ramieP: st.barkP, lokiecPomP: st.lokiecP, lokiecP: st.lokiecP, dlonP: st.nadgP, palceP: st.palceP,
    noz: null,
    udoL: st.biodroL, kolanoPomL: st.kolanoL, kolanoL: st.kolanoL, stopaL: st.kostkaL,
    udoP: st.biodroP, kolanoPomP: st.kolanoP, kolanoP: st.kolanoP, stopaP: st.kostkaP,
    spP: st.spP, spT: st.spT, spL: st.spL, spR: st.spR,
  };
  // ---- wagi (na wierzchołkach zespawanych) ----
  const NB = KOSCI.length, Wg = new Float32Array(nw * NB);
  const dodaj = (i, k, w) => { if (w > 0) Wg[i * NB + KI[k]] += w; };
  const sz = konf.szerokosci || {};
  const rek = {}, nog = {};
  for (const s of [1, -1]) {
    const n = s > 0 ? 'L' : 'P', J = [st['bark' + n], st['lokiec' + n], st['nadg' + n], st['czubek' + n]], Ld = dlugosci(J), Tr = reka[s].Tr;
    rek[s] = { n, J, Ld, wb: (sz.bark ?? 0.9) * Tr, we: (sz.lokiec ?? 0.75) * Tr, wn: (sz.nadgarstek ?? 0.4) * Tr, rb: (sz.barkKula ?? 2.0) * Tr,
      tK: naLamanej(J, st['palce' + n]), dl: reka[s].dlon };
    const JN = [st['biodro' + n], st['kolano' + n], st['kostka' + n]], LN = dlugosci(JN), Tn = noga[s].ref;
    nog[s] = { n, J: JN, Ld: LN, wk: (sz.kolano ?? 0.6) * Tn, chol: noga[s].cholewkaY };
  }
  // kość broni (scyzoryk): pod dłonią, tuż za knykciami — tam, gdzie zaciśnięte palce obejmą rękojeść
  {
    const s = konf.bron?.dlon ?? -1, d = reka[s].dlon;
    poz.noz = [d.x + s * 0.008 * H, d.y - d.ey / 2 - 0.007 * H, (d.zMn + d.zMx) / 2];
    if (konf.bron?.poprawka) poz.noz = poz.noz.map((x, k) => x + konf.bron.poprawka[k]);
  }
  // ręka: klatka → bark(pom.) → ramię → łokieć(pom.) → przedramię → dłoń; a = 0..1 przez staw, pomocnicza w środku
  const przez = (a, w, k0, kp, k1, i) => {           // rozkład wagi w przez staw z kością pomocniczą
    dodaj(i, k0, w * Math.max(0, 1 - 2 * a)); dodaj(i, kp, w * (1 - Math.abs(2 * a - 1))); return w * Math.max(0, 2 * a - 1);
  };
  const wagaReki = (i, s, v, udzial) => {
    const r = rek[s], n = r.n, t = naLamanej(r.J, v);
    const a1 = sstep(-r.wb, r.wb, t), a2 = sstep(r.Ld[1] - r.we, r.Ld[1] + r.we, t), a3 = sstep(r.Ld[2] - r.wn, r.Ld[2] + r.wn, t);
    // klatka/bark/ramię, potem ramię/łokieć(pom.)/przedramię (ramię dostaje to, co przeszło przez bark), potem dłoń
    const wR = przez(a1, udzial, 'klatka', 'bark' + n, 'ramie' + n, i);
    const wPrz = przez(a2, wR, 'ramie' + n, 'lokiecPom' + n, 'lokiec' + n, i);
    dodaj(i, 'lokiec' + n, wPrz * (1 - a3));
    // palce (bez kciuka: kciuk wystaje w przód poza dłoń i w dół pod nią) — za knykciami jedna kość, zginana do pięści
    const d = r.dl, palec = v[2] >= d.zMn - 0.004 * H && v[2] <= d.zMx + 0.0015 * H && v[1] > d.y - d.ey / 2 - 0.006 * H;
    const ap = palec ? sstep(r.tK - 0.004 * H, r.tK + 0.006 * H, t) : 0;
    dodaj(i, 'dlon' + n, wPrz * a3 * (1 - ap)); dodaj(i, 'palce' + n, wPrz * a3 * ap);
  };
  const wagaNogi = (i, s, v, udzial) => {
    const r = nog[s], n = r.n, t = naLamanej(r.J, v), y = v[1];
    const a2 = sstep(r.Ld[1] - r.wk, r.Ld[1] + r.wk, t);
    const stopa = 1 - sstep(r.chol - 0.016 * H, r.chol + 0.006 * H, y);
    const wGol = przez(a2, udzial, 'udo' + n, 'kolanoPom' + n, 'kolano' + n, i);
    dodaj(i, 'kolano' + n, wGol * (1 - stopa)); dodaj(i, 'stopa' + n, wGol * stopa);
  };
  const biodroY = st.biodra[1];
  const udzialUda = y => sstep(biodroY + 0.008 * H, kroczeY - 0.012 * H, y);
  // kręgosłup po wysokości
  const neckR = S.szyja ? Math.max(S.szyja.ex, S.szyja.ez) / 2 : 0.05 * H;
  const wagaTulowia = (i, v, udzial) => {
    const y = v[1];
    const z1 = sstep(taliaY - 0.016 * H, taliaY + 0.01 * H, y), z2 = sstep(st.klatka[1] - 0.012 * H, st.klatka[1] + 0.012 * H, y);
    const dN = Math.hypot(v[0] - st.szyja[0], v[2] - st.szyja[2]);
    const z3 = sstep(st.szyja[1] - 0.02 * H, st.szyja[1] + 0.004 * H, y) * (1 - sstep(0.8 * neckR, 1.4 * neckR, dN));
    dodaj(i, 'biodra', udzial * (1 - z1)); dodaj(i, 'kregoslup', udzial * z1 * (1 - z2));
    dodaj(i, 'klatka', udzial * z1 * z2 * (1 - z3)); dodaj(i, 'szyja', udzial * z1 * z2 * z3);
  };
  const KAT_SP = [['spP', 0], ['spL', Math.PI / 2], ['spT', Math.PI], ['spR', -Math.PI / 2]];
  const rabekY = Math.min(rabek, kroczeY);
  for (let i = 0; i < nw; i++) {
    const v = v3(i), r = reg[i];
    if (r === RG.rekaL || r === RG.rekaP) { wagaReki(i, r === RG.rekaL ? 1 : -1, v, 1); continue; }
    if (r === RG.nogaL || r === RG.nogaP) {
      const s = r === RG.nogaL ? 1 : -1, u = udzialUda(v[1]);
      dodaj(i, 'biodra', 1 - u); wagaNogi(i, s, v, u); continue;
    }
    if (r === RG.glowa) {
      const dN = Math.hypot(v[0] - st.szyja[0], v[2] - st.szyja[2]);
      const g = 1 - (1 - sstep(st.szyja[1] - 0.006 * H, st.szyja[1] + 0.02 * H, v[1])) * (1 - sstep(0.8 * neckR, 1.4 * neckR, dN));
      dodaj(i, 'glowa', g); dodaj(i, 'szyja', 1 - g); continue;
    }
    if (r === RG.kucyk) {
      const g = gK[i] / (Lk || 1), d0 = gK[i];
      const k0 = sstep(0, 0.02 * H, d0);                                   // przy łodyżce przejście z głowy
      const a = sstep(0.25, 0.45, g), b = sstep(0.55, 0.75, g);
      dodaj(i, 'glowa', 1 - k0);
      dodaj(i, 'kucyk0', k0 * (1 - a)); dodaj(i, 'kucyk1', k0 * a * (1 - b)); dodaj(i, 'kucyk2', k0 * a * b);
      continue;
    }
    if (r === RG.spodnica) {
      const inf = clamp((spodY - v[1]) / (spodY - rabekY), 0, 1);
      const fi = Math.atan2(v[0] - mcx, v[2] - mcz);
      dodaj(i, 'biodra', 1 - inf);
      let suma = 0; const ws = KAT_SP.map(([, k]) => { const c = Math.max(0, Math.cos(fi - k)); suma += c * c; return c * c; });
      KAT_SP.forEach(([n], j) => dodaj(i, n, inf * ws[j] / (suma || 1)));
      continue;
    }
    // tułów: barki (kula przy stawie), uda (pod biodrem), reszta kręgosłup
    let reszta = 1;
    for (const s of [1, -1]) {
      const rr = rek[s], dB = Math.hypot(v[0] - rr.J[0][0], v[1] - rr.J[0][1], v[2] - rr.J[0][2]);
      const m = 1 - sstep(0.6 * rr.rb, rr.rb, dB);
      if (m <= 0) continue;
      const t = naLamanej(rr.J, v), a1 = sstep(-rr.wb, rr.wb, t);
      const wb = reszta * m * (1 - Math.abs(2 * a1 - 1)), wr = reszta * m * Math.max(0, 2 * a1 - 1);   // część „klatkowa" zostaje kręgosłupowi
      dodaj(i, 'bark' + rr.n, wb); dodaj(i, 'ramie' + rr.n, wr); reszta -= wb + wr;
    }
    if (v[1] < biodroY + 0.01 * H) {
      const u0 = udzialUda(v[1]), bok = sstep(-0.35 * ma, 0.35 * ma, v[0] - mcx);
      for (const s of [1, -1]) { const u = reszta * u0 * (s > 0 ? bok : 1 - bok); if (u > 0) { wagaNogi(i, s, v, u); } }
      reszta -= reszta * u0;
    }
    wagaTulowia(i, v, reszta);
  }
  // ---- najwyżej 4 wpływy, normalizacja; rozkład na wierzchołki oryginału ----
  const n = mapa.length, skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4), region = new Uint8Array(n);
  const sI = new Uint16Array(nw * 4), sW = new Float32Array(nw * 4);
  let maxWpl = 0;
  for (let i = 0; i < nw; i++) {
    const row = [];
    for (let k = 0; k < NB; k++) { const w = Wg[i * NB + k]; if (w > 1e-4) row.push([w, k]); }
    row.sort((a, b) => b[0] - a[0]);
    if (row.length > maxWpl) maxWpl = row.length;
    const top = row.slice(0, 4); let sum = top.reduce((a, b) => a + b[0], 0) || 1;
    if (!top.length) { top.push([1, KI.biodra]); sum = 1; }
    for (let j = 0; j < 4; j++) { sI[i * 4 + j] = top[j] ? top[j][1] : 0; sW[i * 4 + j] = top[j] ? top[j][0] / sum : 0; }
  }
  for (let v = 0; v < n; v++) {
    const i = mapa[v]; region[v] = reg[i];
    for (let j = 0; j < 4; j++) { skinIndex[v * 4 + j] = sI[i * 4 + j]; skinWeight[v * 4 + j] = sW[i * 4 + j]; }
  }
  const kosci = KOSCI.map(([nazwa, rodzic, kol]) => [nazwa, rodzic == null ? -1 : KI[rodzic], poz[nazwa].map(x => +x.toFixed(5)), kol]);
  const ileReg = {}; for (let i = 0; i < nw; i++) ileReg[REGIONY[reg[i]]] = (ileReg[REGIONY[reg[i]]] || 0) + 1;
  Object.assign(S.rap, { regiony: ileReg, sieroty, maxWplywowPrzedPrzycieciem: maxWpl, kucykDlugosc: Lk, rabekY });
  return { kosci, skinIndex, skinWeight, region, stawy: st, raport: S.rap, wymiary: { H, mn: S.mn, mx: S.mx, R, srodek, kroczeY, taliaY, rabekY, cholewkaY: noga[1].cholewkaY } };
}

// ============================== NORMALIZACJA: jednostki modelu → jednostki gry ==============================
// Stopy na y = 0, oś miednicy w (0, 0), wysokość całkowita (z liśćmi) = konf.wysokosc przy skali 1.
export function normalizuj(rig, pos, konf = {}) {
  const w = rig.wymiary, sk = (konf.wysokosc || 1.62) / w.H;
  const pr = [rig.stawy.biodra[0], w.mn[1], rig.stawy.biodra[2]];
  const P = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) { P[i] = (pos[i] - pr[0]) * sk; P[i + 1] = (pos[i + 1] - pr[1]) * sk; P[i + 2] = (pos[i + 2] - pr[2]) * sk; }
  const r5 = x => +x.toFixed(5);
  const tp = p => [r5((p[0] - pr[0]) * sk), r5((p[1] - pr[1]) * sk), r5((p[2] - pr[2]) * sk)];
  const ty = v => r5((v - pr[1]) * sk);
  const kosci = rig.kosci.map(([n, p, poz, kol]) => [n, p, tp(poz), kol]);
  const wymiary = {
    wysokosc: r5(w.H * sk), skalaModelu: r5(sk), przesuniecie: pr.map(r5), glowaR: r5(w.R * sk), glowa: tp(w.srodek),
    kroczeY: ty(w.kroczeY), taliaY: ty(w.taliaY), rabekY: ty(w.rabekY), cholewkaY: ty(w.cholewkaY),
    min: tp(w.mn), max: tp(w.mx),
  };
  return { pos: P, kosci, wymiary };
}

// ============================== WCZYTYWANIE ==============================
// GLB gotowy (z narzedzia/optymalizuj_meshy.py: JOINTS_0/WEIGHTS_0 + skóra + extras.postacMeshy) → od razu;
// GLB surowy z Meshy (bez szkieletu) → rig liczony tutaj (~0,2 s) — do podglądu i strojenia konfiguracji.
export function przygotujDane(THREE, gltf, konf = {}) {
  let src = null; gltf.scene.traverse(o => { if (o.isMesh && !src) src = o; });
  if (!src) throw new Error('postac-meshy: brak siatki w GLB');
  const json = gltf.parser && gltf.parser.json, ext = json && json.extras && json.extras.postacMeshy;
  const g0 = src.geometry, tex = src.material.map || null;
  if (tex) { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true; }
  const geo = new THREE.BufferGeometry();
  if (ext && g0.attributes.skinIndex) {
    for (const n of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) geo.setAttribute(n, g0.attributes[n]);
    if (g0.attributes._region) geo.setAttribute('region', g0.attributes._region);
    geo.setIndex(g0.index);
    return { geo, tex, kosci: ext.kosci, wymiary: ext.wymiary, raport: ext.raport, konf: ext.konf || {}, zrodlo: 'gotowy' };
  }
  const pos = g0.attributes.position.array;
  const idx = g0.index ? g0.index.array : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
  const rig = uzbroj(pos, idx, konf);
  const N = normalizuj(rig, pos, konf);
  geo.setAttribute('position', new THREE.BufferAttribute(N.pos, 3));
  geo.setAttribute('normal', g0.attributes.normal); geo.setAttribute('uv', g0.attributes.uv);
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(rig.skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(rig.skinWeight, 4));
  geo.setAttribute('region', new THREE.Uint8BufferAttribute(rig.region, 1));
  geo.setIndex(g0.index ? g0.index : Array.from(idx));
  return { geo, tex, kosci: N.kosci, wymiary: N.wymiary, raport: rig.raport, konf, zrodlo: 'surowy', rig };
}
export async function wczytajPostacMeshy(THREE, GLTFLoader, url, konf = {}) {
  const gltf = await new GLTFLoader().loadAsync(url);
  return przygotujDane(THREE, gltf, konf);
}

// ============================== KONFIGURACJE POSTACI ==============================
// stawy: poprawki w JEDNOSTKACH MODELU ([dx, dy, dz] albo { abs: [x, y, z] }), szerokosci: przejścia w stawach
// (× grubość kończyny), wysokosc: j. gry przy skali 1 (czubek liści), bron: dłoń z bronią (−1 = prawa, −X).
export const KONFIGI = {
  razoretta: {
    nazwa: 'Radishetta Razoretta', plik: 'assets/postacie3d/razoretta.glb', zrodlo: 'dist/meshy/razoretta2/model.glb',
    wysokosc: 1.62, skalaGry: 1.15, bron: { dlon: -1 }, stawy: {}, szerokosci: {},
  },
};

// ============================== DROBIAZGI (render) ==============================
function lin(hex) {
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}
const owin = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
function prng(ziarno = 1) {
  let s = (Math.imul(ziarno | 0, 0x9e3779b1) ^ 0x5bd1e995) | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================== SCYZORYK (geometria z kodu) ==============================
// W układzie kości 'noz' (spoczynek = osie świata, poza T): rękojeść w poprzek dłoni wzdłuż Z, ostrze wychodzi
// w +Z od strony kciuka (po opuszczeniu ręki celuje w przód, ostrzem w dół), płaz ⟂ Y. Kolor w wierzchołkach (aKol).
function geoScyzoryka(sk = 1) {
  const P = [], N = [], C = [], I = [];
  const kol = (h, metal) => { const c = lin(h); return [c[0], c[1], c[2], metal ? 2 : 1]; };
  const RACZKA = kol(0xc0142f), RACZKA_C = kol(0x7c0a1e), STAL = kol(0xeef2f8, 1), STAL_C = kol(0xa9b2c2, 1), NIT = kol(0xf4f6fa, 1);
  const tri = (a, b, c, k) => {
    const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    const l = Math.hypot(n[0], n[1], n[2]) || 1, i0 = P.length / 3;
    for (const p of [a, b, c]) { P.push(p[0] * sk, p[1] * sk, p[2] * sk); N.push(n[0] / l, n[1] / l, n[2] / l); C.push(...k); }
    I.push(i0, i0 + 1, i0 + 2);
  };
  const quad = (a, b, c, d, k) => { tri(a, b, c, k); tri(a, c, d, k); };
  // rękojeść: graniastosłup 8-kątny (elipsa rx × ry) wzdłuż Z, z ciemniejszymi „okładkami" na bokach
  const rx = 0.0105, ry = 0.0075, z0 = -0.041, z1 = 0.041, NS = 8;
  const pkt = (i, z) => { const a = (i / NS) * TAU + Math.PI / NS; return [Math.cos(a) * rx, Math.sin(a) * ry, z]; };
  for (let i = 0; i < NS; i++) {
    const k = (i === 1 || i === 2 || i === 5 || i === 6) ? RACZKA : RACZKA_C;
    quad(pkt(i, z0), pkt(i + 1, z0), pkt(i + 1, z1), pkt(i, z1), k);
    tri([0, 0, z1], pkt(i, z1), pkt(i + 1, z1), STAL_C);          // okucie od strony ostrza
    tri([0, 0, z0], pkt(i + 1, z0), pkt(i, z0), RACZKA_C);
  }
  // nity (na płazach rękojeści, ±Y)
  for (const zn of [-0.022, 0.022]) for (const sy of [1, -1]) {
    const y = sy * (ry + 0.0006), r = 0.0034;
    const a = [-r, y, zn - r], b = [r, y, zn - r], c = [r, y, zn + r], d = [-r, y, zn + r];
    if (sy > 0) quad(a, d, c, b, NIT); else quad(a, b, c, d, NIT);
  }
  // ostrze: płaskie, grzbiet po +X, ostrze (szlif) po −X, sztych w +Z
  const zb = z1, zt = z1 + 0.078, g = 0.0021, e = 0.0004;
  const zarys = [[0.0085, zb], [0.0085, zt - 0.02], [0.0035, zt], [-0.0045, zt - 0.03], [-0.0085, zt - 0.05], [-0.0085, zb]];
  const gr = x => (x > 0.004 ? g : x > -0.004 ? (g + e) / 2 : e);   // grubość: gruby grzbiet, cienkie ostrze
  for (const sy of [1, -1]) {
    const pt = ([x, z]) => [x, sy * gr(x), z];
    for (let i = 1; i < zarys.length - 1; i++) {
      if (sy > 0) tri(pt(zarys[0]), pt(zarys[i + 1]), pt(zarys[i]), STAL); else tri(pt(zarys[0]), pt(zarys[i]), pt(zarys[i + 1]), STAL);
    }
  }
  for (let i = 0; i < zarys.length; i++) {
    const a = zarys[i], b = zarys[(i + 1) % zarys.length];
    quad([a[0], gr(a[0]), a[1]], [b[0], gr(b[0]), b[1]], [b[0], -gr(b[0]), b[1]], [a[0], -gr(a[0]), a[1]], i === 0 ? STAL_C : STAL);
  }
  return { P, N, C, I };
}

// ============================== MATERIAŁ ==============================
// Lambert z teksturą Meshy (DoubleSide — liście są pojedynczymi płatami) + opcjonalnie 3 pasma toon i ton cienia
// jak reszta gry, pasmo na sylwetce, połysk metalu (scyzoryk, aKol.w = 2), biały/kolorowy błysk trafienia,
// cień chmur liczony TU, kopia za przeszkodą (depthFunc Greater). Własny customProgramCacheKey.
export function materialPostaci(THREE, o = {}) {
  const toon = o.toon !== false;
  const pas = [0.62, 0.26, 0.38], progi = [-0.12, 0.08, 0.30, 0.50], ton = [0.86, 0.88, 1.06];
  const mat = new THREE.MeshLambertMaterial({ map: o.map || null, side: THREE.DoubleSide });
  const U = o.U ? Object.assign({}, o.U) : {
    uBlysk: { value: 0 }, uBlyskKol: { value: new THREE.Color(1, 1, 1) }, uSylwetka: { value: 0.16 },
  };
  U.uKopKrycie = { value: o.kopia ? (o.kopia.krycie ?? 0.5) : 1 };
  U.uKopBias = { value: o.kopia ? (o.kopia.bias ?? 0.5) : 0 };
  if (o.chmury && !U.uChmury) { U.uCloud = o.chmury.tex; U.uCloudOff = o.chmury.off; U.uChmury = { value: 1 }; }
  const defs = {};
  if (o.chmury) defs.PM_CHMURY = '';
  if (toon) defs.PM_TOON = '';
  if (o.kopia) {
    defs.PM_KOPIA = '';
    mat.depthFunc = THREE.GreaterDepth; mat.depthWrite = false;
    mat.blending = THREE.CustomBlending; mat.blendSrc = THREE.SrcAlphaFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  }
  mat.defines = defs;
  const skala = ((o.chmury && o.chmury.skala) || 0.016).toFixed(5);
  const f = v => v.toFixed(4);
  mat.userData.U = U;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = `attribute vec4 aKol; uniform float uKopBias; varying vec4 vKol; varying vec3 vSkW;
      ` + sh.vertexShader
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        vKol = aKol;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef PM_KOPIA
          mvPosition.xyz += normalize(-mvPosition.xyz) * uKopBias; gl_Position = projectionMatrix * mvPosition;
        #endif`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vSkW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    let fs = sh.fragmentShader;
    if (toon) {
      const chunk = 'float _cienSw = 1.0;\n' + THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
        `float rawNL = dot( geometryNormal, directLight.direction );
         float _b1 = smoothstep( ${f(progi[0])}, ${f(progi[1])}, rawNL );
         float _b2 = smoothstep( ${f(progi[2])}, ${f(progi[3])}, rawNL );
         float dotNL = ${f(pas[0])} + ${f(pas[1])} * _b1 + ${f(pas[2])} * _b2;
         dotNL = mix( ${f(pas[0])}, dotNL, _cienSw );`)
        .replace('vec3 irradiance = dotNL * directLight.color;',
          `vec3 irradiance = dotNL * directLight.color * mix( vec3( ${f(ton[0])}, ${f(ton[1])}, ${f(ton[2])} ), vec3( 1.0 ), _cienSw * _b1 );`);
      fs = fs.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
        'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]',
        '_cienSw = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]'))
        .replace('#include <lights_lambert_pars_fragment>', chunk);
    }
    fs = `uniform float uBlysk; uniform vec3 uBlyskKol; uniform float uKopKrycie; uniform float uSylwetka; varying vec4 vKol; varying vec3 vSkW;
      #ifdef PM_CHMURY
        uniform sampler2D uCloud; uniform vec2 uCloudOff; uniform float uChmury;
      #endif
      ` + fs
      .replace('#include <map_fragment>', `#include <map_fragment>
        // region (aKol.x przy w = 0): 2 = kucyk z liści — w teksturze Meshy oliwkowy i ciemny, w grze ma być limonkowy
        // i jasny (styl Łąk): nasycenie + jasność + lekkie przesunięcie ku żółtej zieleni
        float _kuc = ( vKol.w < 0.5 && vKol.x > 1.5 && vKol.x < 2.5 ) ? 1.0 : 0.0;
        if ( _kuc > 0.5 ) {
          float _l = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
          vec3 _c = mix( vec3( _l ), diffuseColor.rgb, ${f(o.liscieNas ?? 1.45)} ) * ${f(o.liscieJas ?? 1.3)};
          diffuseColor.rgb = clamp( _c * vec3( 1.04, 1.08, 0.82 ), 0.0, 1.0 );
        }
        if ( vKol.w > 0.5 ) diffuseColor.rgb = vKol.rgb;`)
      .replace('#include <opaque_fragment>', `
        vec3 _V = normalize( vViewPosition );
        vec3 _N = normal;
        #if NUM_DIR_LIGHTS > 0
          if ( vKol.w > 1.5 ) {                    // metal: ostry blask + pasek „ze studia"
            vec3 _H = normalize( directionalLights[ 0 ].direction + _V );
            float _nh = dot( _N, _H );
            outgoingLight += smoothstep( 0.94, 0.965, _nh ) * 0.9 * directionalLights[ 0 ].color;
            outgoingLight += smoothstep( -0.75, -0.62, _N.x ) * ( 1.0 - smoothstep( -0.5, -0.4, _N.x ) ) * 0.45;
          }
          // liście: prześwit pod słońce (od tyłu świecą limonką), jak u prototypu
          outgoingLight += _kuc * diffuseColor.rgb * 0.4 * smoothstep( 0.0, 0.7, -dot( _N, directionalLights[ 0 ].direction ) );
        #endif
        float _rim = smoothstep( 0.6, 0.95, 1.0 - saturate( abs( dot( _N, _V ) ) ) );
        outgoingLight += _rim * uSylwetka * diffuseColor.rgb;
        outgoingLight = mix( outgoingLight, uBlyskKol, uBlysk );
        #include <opaque_fragment>`)
      .replace('#include <fog_fragment>', `
        #ifdef PM_CHMURY
          float _cs = texture2D( uCloud, vSkW.xz * ${skala} + uCloudOff ).r;
          gl_FragColor.rgb *= mix( 1.0, mix( 0.74, 1.04, _cs ), uChmury );
        #endif
        #include <fog_fragment>
        #ifdef PM_KOPIA
          gl_FragColor = vec4( mix( gl_FragColor.rgb, vec3( 1.0 ), 0.18 ), uKopKrycie );
        #endif`);
    sh.fragmentShader = fs;
  };
  const klucz = 'postac-meshy-v1|' + (toon ? 't' : 'l') + (o.chmury ? '|ch' : '') + (o.kopia ? '|kop' : '') + '|' + f(o.liscieNas ?? 1.45) + f(o.liscieJas ?? 1.3);
  mat.customProgramCacheKey = () => klucz;
  return mat;
}
// KONTUR: odwrócona powłoka (BackSide) na tej samej geometrii i szkielecie, odsuwana PO skinningu wzdłuż WYGŁADZONEJ
// normalnej (aGlad — uśredniona po zespawanych pozycjach, więc na szwach UV kontur się nie rozrywa); grubość rośnie
// z odległością (stała w pikselach), kolor = tekstura × 0,3 (liście dostają ciemnozielony kontur, ciało bordowy).
export function materialKonturu(THREE, o = {}) {
  const mat = new THREE.MeshBasicMaterial({ map: o.map || null, color: new THREE.Color(0.3, 0.3, 0.3), side: THREE.BackSide });
  const U = { uObrys: { value: o.grubosc ?? 0.0035 }, uObrysD: { value: o.gruboscD ?? 0.0016 } };
  mat.userData.U = U;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec3 aGlad; attribute vec4 aKol; uniform float uObrys, uObrysD; varying float vNoz;\n' + sh.vertexShader
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        #ifdef USE_SKINNING
          mat4 _sm = skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW;
          _sm = bindMatrixInverse * _sm * bindMatrix;
          vec3 _n = normalize( ( _sm * vec4( aGlad, 0.0 ) ).xyz );
        #else
          vec3 _n = normalize( aGlad );
        #endif
        vec4 _mv = modelViewMatrix * vec4( transformed, 1.0 );
        transformed += _n * ( uObrys + uObrysD * max( 0.0, -_mv.z ) ) / max( 1e-4, length( modelMatrix[ 1 ].xyz ) );
        vNoz = aKol.w;`);
    sh.fragmentShader = 'varying float vNoz;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        if ( vNoz > 0.5 ) diffuseColor.rgb = vec3( 0.06, 0.05, 0.07 );`);
  };
  mat.customProgramCacheKey = () => 'postac-meshy-kontur-v1';
  return mat;
}

// ============================== EFEKTY: ŁUKI CIĘĆ ==============================
// Sierp (wycinek pierścienia ~195°) jako InstancedMesh: cięcie = instancja z macierzą (płaszczyzna i kierunek)
// i atrybutem aArc = (głowa, krycie). Głowa biegnie wzdłuż łuku, za nią smuga (jak w lib/razoretta.js).
class Luki {
  constructor(THREE, cap = 6) {
    this.cap = cap;
    const NA = 32, P = [], UV = [], I = [], A0 = -1.7, A1 = 1.7;
    for (let i = 0; i <= NA; i++) {
      const u = i / NA, a = lerp(A0, A1, u), env = Math.pow(Math.sin(Math.PI * u), 0.7);
      for (const v of [0, 1]) { const r = v ? 1.0 : 1.0 - 0.34 * env; P.push(Math.sin(a) * r, 0, Math.cos(a) * r); UV.push(u, v); }
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
    this.mat.customProgramCacheKey = () => 'postac-meshy-luki-v1';
    this.mesh = new THREE.InstancedMesh(g, this.mat, cap);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.name = 'postac-meshy-luki'; this.mesh.visible = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = 5;
    this.l = []; for (let i = 0; i < cap; i++) this.l.push({ t: -1, lok: new THREE.Matrix4(), czas: 0.09 });
    this._m = new THREE.Matrix4();
  }
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

// ============================== ANIMACJA: POZY ==============================
// Poza = Float32Array(NB × 9): [rx, ry, rz, px, py, pz, sx−1, sy−1, sz−1] — PRZYROSTY od spoczynku (poza T),
// kąty w kolejności Eulera kości (ręka 'XZY': x = wahadło w przód/tył, z = opuszczenie, y = wysunięcie w poziomie).
// Każda funkcja pozy zapisuje PEŁNĄ pozę (z bazą), mieszanie wagami sumującymi się do 1 = suma ważona.
// Pozy z IK (atak, wygrana, szybowanie) idą osobnym buforem kwaternionów rąk, mieszanym na końcu (nlerp).
const KAN = 9;
const STRONY = [1, -1];
const KK = KI;
const RAMIE = { 1: KK.ramieL, [-1]: KK.ramieP }, LOKIEC = { 1: KK.lokiecL, [-1]: KK.lokiecP }, DLON = { 1: KK.dlonL, [-1]: KK.dlonP };
const PALCE = { 1: KK.palceL, [-1]: KK.palceP };
const UDO = { 1: KK.udoL, [-1]: KK.udoP }, KOLANO = { 1: KK.kolanoL, [-1]: KK.kolanoP }, STOPA = { 1: KK.stopaL, [-1]: KK.stopaP };
const KOSCI_RAK = [KK.ramieL, KK.lokiecL, KK.dlonL, KK.palceL, KK.ramieP, KK.lokiecP, KK.dlonP, KK.palceP];
const R = (P, k, x, y, z) => { const o = k * KAN; P[o] += x; P[o + 1] += y; P[o + 2] += z; };
const T = (P, k, x, y, z) => { const o = k * KAN + 3; P[o] += x; P[o + 1] += y; P[o + 2] += z; };
const S = (P, k, x, y, z) => { const o = k * KAN + 6; P[o] += x; P[o + 1] += y; P[o + 2] += z; };
// ręka: dol = opuszczenie od poziomu (poza T), wymach = wahadło w przód (+) / tył (−), przod = wysunięcie w poziomie
// (przed opuszczeniem), zg = łokieć (przedramię w przód), fl = zgięcie dłoni ku wnętrzu, dev = odchylenie, rot = obrót
// dłoni, palce = zaciśnięcie palców (1,4 ≈ pięść)
function reka(P, s, dol, wymach, przod = 0, zg = 0, fl = 0, dev = 0, rot = 0, palce = 0) {
  R(P, RAMIE[s], -wymach, -przod * s, -dol * s);
  R(P, LOKIEC[s], 0, -zg * s, 0);
  R(P, DLON[s], rot * s, dev * s, -fl * s);
  R(P, PALCE[s], 0, 0, -palce * s);
}
function rekaA(P, s, a, k = 1) { reka(P, s, a[0] * k, a[1] * k, a[2] * k, a[3] * k, a[4] * k, a[5] * k, a[6] * k, a[7] * k); }
function noga(P, s, biodro, kolano, stopa, rozkrok = 0) {
  R(P, UDO[s], biodro, 0, rozkrok * s);
  R(P, KOLANO[s], kolano, 0, 0);
  R(P, STOPA[s], stopa, 0, -rozkrok * s);
}
// pozy rąk BEZWZGLĘDNE: [dol, wymach, przod, zg, fl, dev, rot, palce]. Spoczynek: ręce opuszczone ~63° i lekko na
// zewnątrz (dłonie z dala od spódniczki), łokcie lekko zgięte; prawa zaciśnięta na scyzoryku, lewa luźno.
const RB_L = [1.0, 0.06, 0.04, 0.3, 0.2, 0, 0, 0.45];
const RB_P = [1.0, 0.12, 0.06, 0.42, 0.1, 0, 0.1, 1.38];
export const STROJENIE = { RB_L, RB_P };
function baza(P) { rekaA(P, 1, RB_L); rekaA(P, -1, RB_P); }

// idle: ciężar przenoszony z nogi na nogę (biodro w bok), oddech, rozglądanie, ręce lekko się kołyszą
function pozaIdle(P, t, st, D) {
  baza(P);
  const w = Math.sin(t * TAU / 3.4), ws = Math.tanh(2.2 * w) / Math.tanh(2.2);
  const prz = 1 - ws * ws;
  T(P, KK.biodra, 0.018 * ws, -0.006 + 0.006 * prz, 0);
  R(P, KK.biodra, 0, 0.05 * ws, -0.06 * ws);
  for (const s of STRONY) {
    const wolna = clamp(0.5 - 0.5 * ws * s, 0, 1), wl = wolna * wolna;
    noga(P, s, -0.14 * wl + 0.02, 0.3 * wl, -0.16 * wl - 0.02, 0.03 + 0.04 * wl);
  }
  const b = Math.sin(t * TAU / 2.8);
  S(P, KK.klatka, 0.012 * b, 0.016 * b, 0.014 * b);
  R(P, KK.kregoslup, 0.012 * Math.sin(t * 0.7), -0.03 * ws, 0.07 * ws);
  R(P, KK.klatka, -0.015 * b, 0, -0.02 * ws);
  R(P, KK.glowa, -0.05 + 0.02 * Math.sin(t * 0.8 + 1), st.patrzYaw, -0.05 * ws + 0.03 * Math.sin(t * 0.6));
  reka(P, 1, 0.04 * b - 0.05 * ws, 0.05 * Math.sin(t * 0.9), 0, 0.06 * b);
  reka(P, -1, 0.04 * b + 0.05 * ws, 0.05 * Math.sin(t * 0.9 + 2), 0, 0.05 * b);
}
// chód: zadziorny — biodra kręcą, barki przeciwnie, mocny wymach rąk (amplituda rośnie z prędkością)
function pozaChod(P, f, a, D) {
  baza(P);
  const s = Math.sin(f), c = Math.cos(f), Ah = 0.42 * a;
  for (const st of STRONY) {
    const sl = st > 0 ? s : -s, cl = st > 0 ? c : -c;
    const kol = 0.95 * a * Math.pow(Math.max(0, cl), 1.4);
    const bio = -Ah * sl - kol * 0.32;
    const stopa = -(bio + kol) + 0.3 * a * (sl < 0 && cl < 0 ? -sl * 0.9 : 0) - 0.2 * a * Math.max(0, sl) * Math.max(0, -cl);
    noga(P, st, bio, kol, stopa, 0.02);
    reka(P, st, 0.06 * a, -0.55 * a * sl, 0, 0.12 * a + 0.22 * a * Math.max(0, -sl));
  }
  T(P, KK.biodra, 0.014 * a * c, D.noga * (Math.cos(Ah * Math.abs(s)) - 1) + 0.012 * a * Math.cos(2 * f), 0);
  R(P, KK.biodra, 0, 0.16 * a * s, -0.05 * a * c);
  R(P, KK.kregoslup, 0.04 * a, -0.12 * a * s, 0.05 * a * c);
  R(P, KK.klatka, 0, -0.06 * a * s, -0.02 * a * c);
  R(P, KK.glowa, -0.03 * a + 0.025 * a * Math.cos(2 * f), 0.08 * a * s, 0.03 * a * c);
}
// bieg: pochylenie, faza lotu, łokcie pompują (zgięte ~90°), kolana wysoko
function pozaBieg(P, f, a, D) {
  baza(P);
  const s = Math.sin(f), c = Math.cos(f), Ah = 0.62;
  for (const st of STRONY) {
    const sl = st > 0 ? s : -s, cl = st > 0 ? c : -c;
    const kol = 0.25 + 1.35 * Math.pow(Math.max(0, cl), 1.2);
    const bio = -Ah * sl - kol * 0.4;
    noga(P, st, bio, kol, -(bio + kol) * 0.8 - 0.22 * Math.max(0, -sl), 0.03);
    // łokcie odsunięte od tułowia (dol −0,14), wymach umiarkowany — dłoń z nożem nie dochodzi do twarzy
    reka(P, st, -0.14, -0.62 * sl + 0.12, 0.04, 0.95 + 0.22 * sl, 0, 0, 0, 0.3);
  }
  T(P, KK.biodra, 0, 0.05 * s * s - 0.045, 0);
  R(P, KK.biodra, 0, 0.16 * s, 0);
  R(P, KK.kregoslup, 0.2, -0.1 * s, 0.04 * c);
  R(P, KK.klatka, 0.04, -0.06 * s, 0.02 * c);
  R(P, KK.glowa, -0.16, 0.06 * s, 0);
  const sq = 0.03 * (s * s - 0.5) * 2;
  S(P, KK.klatka, -sq * 0.4, sq, -sq * 0.4);
}
// skok: przysiad → wyskok (rozciągnięcie, ręce w górę-na boki) → podkulone nogi → przysiad przy lądowaniu
const SKOK = { T0: 0.10, TL: 0.745, T2: 0.30 };
function pozaSkok(P, ts, st, D) {
  baza(P);
  const { T0, TL } = SKOK;
  let y = 0;
  if (ts < T0) {
    const k = sstep(0, T0, ts);
    T(P, KK.biodra, 0, -0.07 * k, 0);
    for (const s of STRONY) { noga(P, s, -0.6 * k, 1.15 * k, -0.55 * k); reka(P, s, 0.15 * k, -0.4 * k, 0, 0.2 * k); }
    R(P, KK.kregoslup, 0.15 * k, 0, 0);
  } else if (ts < T0 + TL || st.skokZew) {
    const a = st.skokZew ? st.skokFaza : (ts - T0) / TL;
    y = st.skokZew ? 0 : 4 * st.wysSkoku * a * (1 - a);
    const roz = 1 - sstep(0, 0.35, a), pod = Math.sin(Math.PI * clamp(a, 0, 1)), lad = sstep(0.7, 1, a);
    R(P, KK.kregoslup, 0.08 * pod - 0.06 * roz, 0, 0);
    R(P, KK.glowa, -0.12 * roz + 0.05 * pod, 0, 0);
    for (const s of STRONY) {
      noga(P, s, -0.85 * pod * (1 - lad) - 0.15 * lad + 0.2 * roz, 1.5 * pod * (1 - lad) + 0.25 * lad, -0.45 * pod * (1 - lad) - 0.1 * lad - 0.25 * roz, 0.08 * pod);
      reka(P, s, -0.55 * roz - 0.35 * pod * (1 - roz) + 0.15 * lad, 0.25 * roz + 0.2 * pod, 0, 0.35 * pod);
    }
  } else {
    const l = ts - T0 - TL, sq = Math.exp(-l * 9) * Math.cos(l * 13);
    T(P, KK.biodra, 0, -0.07 * Math.max(0, sq), 0);
    for (const s of STRONY) { noga(P, s, -0.55 * Math.max(0, sq), 1.05 * Math.max(0, sq), -0.5 * Math.max(0, sq), 0.02 * sq); reka(P, s, -0.25 * sq, 0.2 * sq, 0, 0.2 * sq); }
    R(P, KK.kregoslup, 0.1 * Math.max(0, sq), 0, 0);
  }
  T(P, KK.root, 0, y, 0);
}
// śmierć: drgnięcie → kolana miękną → pada NA LEWY BOK (+X; kucyk wisi po prawej i z tyłu — zostaje na wierzchu),
// głowa opada na ziemię, nogi lekko wierzgają, ręce rozrzucone
function pozaSmierc(P, ts, D) {
  baza(P);
  const szok = Math.exp(-ts * 7) * Math.sin(ts * 30), mie = sstep(0.08, 0.45, ts), upad = sstep(0.38, 0.95, ts);
  const odb = ts > 0.95 ? 0.06 * Math.exp(-(ts - 0.95) * 6) * Math.sin((ts - 0.95) * 22) : 0;
  // obrót wokół punktu pod lewą stopą: pochylenie w bok + podniesienie (głowa ma promień R — leży na boku głowy)
  R(P, KK.root, -0.1 * upad, 0.25 * upad, -(1.36 * upad + odb));
  T(P, KK.root, 0.06 * upad, D.glowaR * 0.92 * upad, 0);
  R(P, KK.kregoslup, -0.2 * szok + 0.15 * mie * (1 - upad), 0, -0.12 * upad);
  R(P, KK.klatka, 0.1 * mie * (1 - upad), 0, -0.1 * upad);
  R(P, KK.glowa, 0.25 * mie * (1 - upad) - 0.1 * upad, 0.25 * upad, -0.18 * upad);
  const nogi = sstep(0.85, 1.3, ts), drg = ts > 1.4 && ts < 2.1 ? 0.14 * Math.sin((ts - 1.4) * 38) * (1 - sstep(1.4, 2.1, ts)) : 0;
  for (const s of STRONY) {
    noga(P, s, -0.45 * mie * (1 - nogi) - (s > 0 ? 0.25 : 0.55) * nogi + drg * (s > 0 ? 1 : -0.6), 0.7 * mie * (1 - nogi) + (s > 0 ? 0.35 : 0.8) * nogi, 0.25 * nogi, 0.06 * nogi);
    if (s > 0) reka(P, s, -0.55 * upad + 0.2 * mie, 0.55 * upad, 0.3 * upad, -0.1 * mie + 0.3 * upad, 0, 0, 0, 0);
    else reka(P, s, -0.85 * upad + 0.2 * mie, -0.2 * upad, 0.2 * upad, 0.2 * mie + 0.4 * upad, 0, 0, 0, 0);
  }
}
// ATAK (0,74 s): trzy cięcia scyzorykiem (prawa) — z ukosa w dół, poziomo w poprzek, od dołu w górę.
// Tor NADGARSTKA w układzie klatki (względem barku) + biegun łokcia → IK dwukostkowe; dłoń z kluczy.
// Klucze [t, dx, dy, dz, fl, dev, rot] — dx < 0 = na zewnątrz (prawa strona), dz > 0 = przed sobą.
const ATAK = { CZAS: 0.74, SLASH: 0.09 };
const KL_A = [
  [0.00, -0.13, -0.23, 0.07, 0.1, 0, 0.1],
  [0.07, -0.20, 0.06, 0.02, -0.5, 0.3, 1.2],      // zamach: dłoń w górze z prawej, ostrze w górę
  [0.16, 0.06, -0.13, 0.26, 0.4, -0.2, 1.4],      // cięcie 1: z ukosa w dół przed sobą
  [0.27, 0.11, -0.07, 0.22, 0.2, -0.3, 0.6],      // zamach do cięcia 2 (dłoń po lewej, wierzchem)
  [0.38, -0.24, -0.05, 0.17, 0.2, 0.2, -0.4],     // cięcie 2: poziomo w prawo
  [0.47, -0.18, -0.20, 0.09, 0.1, 0.2, 0.2],      // zamach dołem
  [0.58, 0.04, 0.0, 0.26, -0.4, -0.2, 1.0],       // cięcie 3: od dołu w górę, przed sobą (z dala od głowy)
  [0.74, -0.13, -0.23, 0.07, 0.1, 0, 0.1],
];
// cięcia: [indeks klucza początku, indeks klucza końca] — łuk smugi liczony z tych dwóch położeń dłoni
const CIECIA = [[1, 2], [3, 4], [5, 6]];
const KL_T = [[0, 0, 0], [0.07, 0.3, 0.0], [0.16, -0.4, 0.05], [0.27, -0.35, 0.02], [0.38, 0.42, 0.07], [0.47, 0.25, 0.03], [0.58, -0.3, 0.08], [0.74, 0, 0]];
const _kl = new Float32Array(8);
function klucz(KL, t, out) {
  let i = 0; while (i < KL.length - 2 && t > KL[i + 1][0]) i++;
  const a = KL[i], b = KL[i + 1], k0 = clamp((t - a[0]) / (b[0] - a[0] || 1), 0, 1);
  const k = 1 - Math.pow(1 - k0, 2.2);
  for (let j = 1; j < a.length; j++) out[j - 1] = lerp(a[j], b[j], k);
  return out;
}
STROJENIE.KL_A = KL_A; STROJENIE.KL_T = KL_T;
// OBERWAŁ (warstwa, 0,5 s): drgnięcie w tył ze sprężyną, ręce w górę, drżenie
function oberwalWarstwa(P, th, los, strona) {
  if (th >= 0.5) return;
  const e = Math.exp(-th * 8), spr = e * Math.cos(th * 26);
  R(P, KK.kregoslup, -0.22 * spr, 0, 0.12 * spr * strona);
  R(P, KK.glowa, -0.16 * spr, 0, 0.08 * spr * strona);
  T(P, KK.glowa, (los() - 0.5) * 0.012 * e, (los() - 0.5) * 0.01 * e, 0);
  for (const s of STRONY) reka(P, s, -0.35 * e, 0.15 * e, 0, 0.4 * e);
}
// WYGRANA „No i co mi zrobisz?": lewa ręka na biodrze (łokieć w bok), prawa w górę ze scyzorykiem (na zewnątrz
// i w przód — prosto w górę zahaczyłaby o wielką głowę), biodro w bok, broda w górę, kiwanie czubkiem noża
const WYGR = {
  L: { cel: [0.105, -0.075, -0.035], biegun: [1, 0.15, -0.9], dl: [-0.2, 0.9, 0.3, 0.9] },     // [fl, dev, rot, palce]
  // prawa „w górę": ramię ~poziomo w bok, przedramię skośnie w górę NA ZEWNĄTRZ (pion przy barku zahaczałby o głowę:
  // promień głowy 0,21 > bark + ramię), nóż sztychem w górę
  P: { cel: [-0.2, 0.08, 0.1], biegun: [-0.4, -1, 0.1], dl: [-0.5, 0.2, 1.2, 1.38] },   // siatka 36 wariantów: najdalej od kolczyka (3,7 cm)
};
STROJENIE.WYGR = WYGR;
function pozaWygrana(P, ts, D) {
  baza(P);
  const wej = sstep(0, 0.45, ts);
  T(P, KK.biodra, -0.03 * wej, -0.01 * wej, 0);
  R(P, KK.biodra, 0, -0.1 * wej, 0.08 * wej);
  noga(P, 1, -0.16 * wej, 0.3 * wej, -0.16 * wej, 0.1 * wej);
  noga(P, -1, 0.02 * wej, 0.04 * wej, -0.05 * wej, 0.02 * wej);
  R(P, KK.kregoslup, -0.03 * wej, 0.14 * wej, -0.08 * wej);
  R(P, KK.glowa, -0.14 * wej, -0.1 * wej + 0.04 * Math.sin(ts * 1.3), 0.1 * wej);
  const b = Math.sin(ts * TAU / 2.8);
  S(P, KK.klatka, 0.01 * b, 0.014 * b, 0.01 * b);
}
// SZYBOWANIE (gra, torba-spadochron): obie ręce w górę na zewnątrz do uchwytów (omijają głowę)
const SZYB = { cel: [0.2, 0.2, 0.06], biegun: [0.3, -1, -0.4], dl: [0.1, 0, 0, 1.35] };

// ============================== IK dwukostkowe (ręka) ==============================
// Wszystko w układzie rodzica ramienia (klatka), względem barku. Spoczynek: ramię wzdłuż (s, 0, 0), zawias łokcia
// h0 = (0, −s, 0) (przedramię zgina się w przód). Wynik: kwaternion ramienia (mapuje oś i zawias) i łokcia.
function rekaIK(s, a, b, tx, ty, tz, px, py, pz, qR, qL) {
  let d = Math.hypot(tx, ty, tz);
  const dMax = (a + b) * 0.998, dMin = Math.abs(a - b) + 0.05 * Math.min(a, b);
  const kk = d > dMax ? dMax / d : d < dMin ? dMin / Math.max(d, 1e-6) : 1;
  tx *= kk; ty *= kk; tz *= kk; d = Math.max(1e-6, Math.hypot(tx, ty, tz));
  const ux = tx / d, uy = ty / d, uz = tz / d;
  const pd = px * ux + py * uy + pz * uz;
  let ex = px - pd * ux, ey = py - pd * uy, ez = pz - pd * uz;
  const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
  const cS = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sS = Math.sqrt(1 - cS * cS);
  const r1x = cS * ux + sS * ex, r1y = cS * uy + sS * ey, r1z = cS * uz + sS * ez;           // kierunek ramienia
  let hx = ey * uz - ez * uy, hy = ez * ux - ex * uz, hz = ex * uy - ey * ux;                 // zawias = e × u
  const hl = Math.hypot(hx, hy, hz) || 1; hx /= hl; hy /= hl; hz /= hl;
  const t1x = r1y * hz - r1z * hy, t1y = r1z * hx - r1x * hz, t1z = r1x * hy - r1y * hx;      // r1 × h
  // R = B·Aᵀ, A = [r0 h0 t0] = [(s,0,0) (0,−s,0) (0,0,−1)], B = [r1 h t1]
  const m11 = r1x * s, m12 = -hx * s, m13 = -t1x;
  const m21 = r1y * s, m22 = -hy * s, m23 = -t1y;
  const m31 = r1z * s, m32 = -hz * s, m33 = -t1z;
  const tr = m11 + m22 + m33;
  if (tr > 0) { const q = 0.5 / Math.sqrt(tr + 1); qR[3] = 0.25 / q; qR[0] = (m32 - m23) * q; qR[1] = (m13 - m31) * q; qR[2] = (m21 - m12) * q; }
  else if (m11 > m22 && m11 > m33) { const q = 2 * Math.sqrt(1 + m11 - m22 - m33); qR[3] = (m32 - m23) / q; qR[0] = 0.25 * q; qR[1] = (m12 + m21) / q; qR[2] = (m13 + m31) / q; }
  else if (m22 > m33) { const q = 2 * Math.sqrt(1 + m22 - m11 - m33); qR[3] = (m13 - m31) / q; qR[0] = (m12 + m21) / q; qR[1] = 0.25 * q; qR[2] = (m23 + m32) / q; }
  else { const q = 2 * Math.sqrt(1 + m33 - m11 - m22); qR[3] = (m21 - m12) / q; qR[0] = (m13 + m31) / q; qR[1] = (m23 + m32) / q; qR[2] = 0.25 * q; }
  const cE = clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1), zg = Math.PI - Math.acos(cE);
  qL[0] = 0; qL[1] = -s * Math.sin(zg / 2); qL[2] = 0; qL[3] = Math.cos(zg / 2);
  return zg;
}

// ============================== POSTAĆ ==============================
function dodajWage(P, Q, w) { for (let i = 0; i < P.length; i++) P[i] += Q[i] * w; }
const SPR_K = [55, 42, 34], SPR_C = [6.5, 5.5, 4.5];
export const STANY = ['idle', 'chod', 'bieg', 'skok', 'atak', 'oberwal', 'smierc', 'wygrana'];

export function stworzPostacMeshy(THREE, dane, opcje = {}) {
  const o = { skala: 1, toon: true, ziarno: 7, wysokoscSkoku: 1.1, ...opcje };
  const NB = dane.kosci.length;
  const K = Object.fromEntries(dane.kosci.map((k, i) => [k[0], i]));
  for (const k of Object.keys(KK)) if (K[k] !== KK[k]) throw new Error('postac-meshy: szkielet w GLB nie pasuje do KOSCI (' + k + ')');
  // ---- geometria: Meshy + scyzoryk (jedna siatka, jeden draw call) ----
  if (!dane._geoPelna) {
    const g = dane.geo, n = g.attributes.position.count, kn = dane.kosci[K.noz][2];
    const Z = geoScyzoryka(1.0);
    const m = Z.P.length / 3, N = n + m;
    const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), uv = new Float32Array(N * 2);
    const si = new Uint16Array(N * 4), sw = new Float32Array(N * 4), kol = new Float32Array(N * 4), rg = new Uint8Array(N);
    // atrybuty z GLB bywają skwantowane (uv uint16, wagi uint8 znormalizowane) → floaty
    const kop = (a, out) => {
      const src = a.array, k = a.normalized ? 1 / (src instanceof Uint8Array ? 255 : src instanceof Uint16Array ? 65535 : src instanceof Int8Array ? 127 : src instanceof Int16Array ? 32767 : 1) : 1;
      if (k === 1) out.set(src); else for (let i = 0; i < src.length; i++) out[i] = src[i] * k;
    };
    kop(g.attributes.position, pos); kop(g.attributes.normal, nor); kop(g.attributes.uv, uv);
    si.set(g.attributes.skinIndex.array); kop(g.attributes.skinWeight, sw);
    if (g.attributes.region) rg.set(g.attributes.region.array);
    for (let i = 0; i < n; i++) kol[i * 4] = rg[i];                    // region dla shadera (aKol.x przy w = 0)
    // wygładzone normalne (po zespawanych pozycjach) — do konturu
    const gl = new Float32Array(N * 3);
    {
      const { mapa, nw } = spawaj(pos.subarray(0, n * 3), 1e-5), acc = new Float32Array(nw * 3);
      for (let i = 0; i < n; i++) { const w = mapa[i]; acc[w * 3] += nor[i * 3]; acc[w * 3 + 1] += nor[i * 3 + 1]; acc[w * 3 + 2] += nor[i * 3 + 2]; }
      for (let i = 0; i < n; i++) {
        const w = mapa[i], x = acc[w * 3], y = acc[w * 3 + 1], z = acc[w * 3 + 2], l = Math.hypot(x, y, z) || 1;
        gl[i * 3] = x / l; gl[i * 3 + 1] = y / l; gl[i * 3 + 2] = z / l;
      }
    }
    for (let i = 0; i < m; i++) {
      for (let k = 0; k < 3; k++) { pos[(n + i) * 3 + k] = Z.P[i * 3 + k] + kn[k]; nor[(n + i) * 3 + k] = gl[(n + i) * 3 + k] = Z.N[i * 3 + k]; }
      si[(n + i) * 4] = K.noz; sw[(n + i) * 4] = 1;
      for (let k = 0; k < 4; k++) kol[(n + i) * 4 + k] = Z.C[i * 4 + k];
      rg[n + i] = 8;
    }
    const idx0 = g.index.array, idx = new (N > 65535 ? Uint32Array : Uint16Array)(idx0.length + Z.I.length);
    idx.set(idx0); for (let i = 0; i < Z.I.length; i++) idx[idx0.length + i] = Z.I[i] + n;
    const gp = new THREE.BufferGeometry();
    gp.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gp.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    gp.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    gp.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); gp.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    gp.setAttribute('aKol', new THREE.BufferAttribute(kol, 4)); gp.setAttribute('region', new THREE.BufferAttribute(rg, 1));
    gp.setAttribute('aGlad', new THREE.BufferAttribute(gl, 3));
    gp.setIndex(new THREE.BufferAttribute(idx, 1));
    gp.computeBoundingBox(); gp.computeBoundingSphere();
    dane._geoPelna = gp; dane._uzycia = 0;
  }
  const geo = dane._geoPelna; dane._uzycia++;
  const mat = materialPostaci(THREE, { map: dane.tex, chmury: o.chmury, toon: o.toon });
  // ---- szkielet ----
  const kosci = [], spocz = [];
  dane.kosci.forEach(([nazwa, rodzic, p, kol]) => {
    const kb = new THREE.Bone(); kb.name = nazwa; kb.rotation.order = kol;
    const q = rodzic >= 0 ? dane.kosci[rodzic][2] : [0, 0, 0];
    kb.position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    spocz.push(kb.position.clone());
    if (rodzic >= 0) kosci[rodzic].add(kb);
    kosci.push(kb);
  });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = 'postac-meshy';
  mesh.add(kosci[0]);
  mesh.bind(new THREE.Skeleton(kosci));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const obrot = new THREE.Group(); obrot.add(mesh);
  const grupa = new THREE.Group(); grupa.name = 'PostacMeshy'; grupa.add(obrot);
  grupa.scale.setScalar(o.skala);
  let kontur = null, matKonturu = null;
  if (o.obrys !== false) {
    matKonturu = materialKonturu(THREE, { map: dane.tex, grubosc: o.obrysGrubosc, gruboscD: o.obrysGruboscD });
    kontur = new THREE.SkinnedMesh(geo, matKonturu);
    kontur.name = 'postac-meshy-kontur';
    kontur.bind(mesh.skeleton, mesh.bindMatrix);
    kontur.frustumCulled = false; kontur.castShadow = false; kontur.receiveShadow = false;
    obrot.add(kontur);
  }
  let kopia = null, matKopii = null;
  if (o.kopia) {
    matKopii = materialPostaci(THREE, { map: dane.tex, U: mat.userData.U, chmury: o.chmury, kopia: o.kopia, toon: o.toon });
    kopia = new THREE.SkinnedMesh(geo, matKopii);
    kopia.name = 'postac-meshy-kopia';
    kopia.bind(mesh.skeleton, mesh.bindMatrix);
    kopia.frustumCulled = false; kopia.castShadow = false; kopia.receiveShadow = false;
    obrot.add(kopia);
  }
  const luki = new Luki(THREE, 6);
  const efekty = new THREE.Group(); efekty.name = 'postac-meshy-efekty'; efekty.add(luki.mesh);
  if (o.scena) o.scena.add(efekty);

  // ---- wymiary szkieletu (do póz) ----
  const pk = n => dane.kosci[K[n]][2];
  const odl = (a, b) => Math.hypot(pk(a)[0] - pk(b)[0], pk(a)[1] - pk(b)[1], pk(a)[2] - pk(b)[2]);
  const D = {
    noga: odl('udoL', 'kolanoL') + odl('kolanoL', 'stopaL'), glowaR: dane.wymiary.glowaR || 0.2,
    ramie: { 1: odl('ramieL', 'lokiecL'), [-1]: odl('ramieP', 'lokiecP') }, przedr: { 1: odl('lokiecL', 'dlonL'), [-1]: odl('lokiecP', 'dlonP') },
  };
  // ---- stan ----
  const los = prng(o.ziarno);
  const U = mat.userData.U;
  const st = {
    baza: 'ruch', tryb: 'auto', w: { ruch: 1.5, skok: 0.5, smierc: 0.5, wygrana: 0.5 }, tau: 0.16,
    t: 0, tb: 0, faza: 0, vS: 0, vPop: 0, acc: 0, kat: 0, omega: 0,
    tAtak: -1, tOber: -1, stronaOber: 1, nrCiecia: 0,
    patrzYaw: 0, patrzCel: 0, nastPatrz: 1.5,
    skokZew: false, skokFaza: 0, wPowPop: false, wysSkoku: o.wysokoscSkoku,
    wSz: 0, zasieg: 1, G: new Float64Array(9), pGok: false, ziemiaY: 0,
  };
  st.w.ruch = 1; st.w.skok = 0; st.w.smierc = 0; st.w.wygrana = 0;
  const SPR = new Float64Array(34), SPR_CEL = new Float64Array(17);   // kucyk X 0–2, Z 3–5, Y 6–8; klapy 9–12
  const P = new Float32Array(NB * KAN), tmp = new Float32Array(NB * KAN);
  const QA = new Float32Array(NB * 4), WA = new Float32Array(NB);     // nadpisania z IK: kwaterniony + wagi
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
  const _qR = new Float64Array(4), _qL = new Float64Array(4);
  const POM = Int32Array.from(POMOCNICZE.flatMap(([a, b]) => [K[a], K[b]]));
  const barkPoz = { 1: spocz[K.ramieL], [-1]: spocz[K.ramieP] };
  // łuki cięć w układzie postaci — z TORU DŁONI: położenia nadgarstka na początku i końcu cięcia (klucze KL_A, bark
  // w spoczynku, skręt tułowia z KL_T wokół kręgosłupa), środek łuku przed klatką, promień = zasięg dłoni + nóż.
  // Sierp biegnie od strony początku cięcia do strony końca (195° — trochę szerzej niż sam ruch, jak smuga).
  const H0 = dane.wymiary.wysokosc || 1.62;
  const barkP0 = pk('ramieP'), krS = pk('kregoslup'), klS = pk('klatka');
  const punktCiecia = (ik) => {
    const kl = KL_A[ik], tw = KL_T[ik][1];
    const x = barkP0[0] + kl[1] - krS[0], y = barkP0[1] + kl[2], z = barkP0[2] + kl[3] - krS[2];
    const c = Math.cos(tw), s = Math.sin(tw);
    return new THREE.Vector3(krS[0] + x * c + z * s, y, krS[2] - x * s + z * c);
  };
  const lukLok = CIECIA.map(([a, b]) => {
    const p0 = punktCiecia(a), p1 = punktCiecia(b);
    const c = new THREE.Vector3(klS[0], (p0.y + p1.y) / 2 * 0.5 + klS[1] * 0.5, klS[2] + 0.04);
    const d0 = p0.clone().sub(c), d1 = p1.clone().sub(c);
    const m = d0.clone().normalize().add(d1.clone().normalize()).normalize();
    const X = d1.clone().sub(m.clone().multiplyScalar(d1.dot(m))).normalize(), Y = new THREE.Vector3().crossVectors(m, X);
    // promień większy niż zasięg dłoni: końce sierpa wychodzą za obrys ciała i liści — widać je z kamery gry od tyłu
    const r = (o.lukPromien ?? 0.78) * H0 / 1.62;
    return new THREE.Matrix4().makeBasis(X.multiplyScalar(r), Y.multiplyScalar(r), m.multiplyScalar(r)).setPosition(c);
  });
  const _lukM = new THREE.Matrix4(), _skl = new THREE.Matrix4();

  function ustawStan(s) {
    if (s === 'idle' || s === 'chod' || s === 'bieg' || s === 'auto') {
      st.tryb = s;
      if (st.baza !== 'ruch') { st.baza = 'ruch'; st.tau = st.w.smierc > 0.5 ? 0.45 : 0.2; }
    } else if (s === 'skok') {
      if (st.baza === 'smierc') return;
      st.baza = 'skok'; st.tb = 0; st.tau = 0.07; st.skokZew = false;
    } else if (s === 'atak') {
      if (st.baza === 'smierc') return;
      st.tAtak = 0; st.nrCiecia = 0;
    } else if (s === 'oberwal') {
      if (st.baza === 'smierc') return;
      st.tOber = 0; st.stronaOber = los() < 0.5 ? -1 : 1;
    } else if (s === 'smierc') {
      if (st.baza === 'smierc') return;
      st.baza = 'smierc'; st.tb = 0; st.tau = 0.1; st.tAtak = -1; st.tOber = 0;
    } else if (s === 'wygrana') {
      st.baza = 'wygrana'; st.tb = 0; st.tau = 0.2; st.tAtak = -1;
    }
  }
  // IK ręki → bufor nadpisań (kwaterniony ramienia i łokcia + dłoń/palce z Eulera) z wagą w
  function ikDoBufora(s, cel, biegun, dl, w) {
    const kr = RAMIE[s], kl = LOKIEC[s];
    rekaIK(s, D.ramie[s], D.przedr[s], cel[0], cel[1], cel[2], biegun[0], biegun[1], biegun[2], _qR, _qL);
    for (let j = 0; j < 4; j++) { QA[kr * 4 + j] = _qR[j]; QA[kl * 4 + j] = _qL[j]; }
    WA[kr] = w; WA[kl] = w;
    // dłoń i palce: Euler jak w reka() → kwaternion
    _e.set(dl[2] * s, dl[1] * s, -dl[0] * s, 'ZYX'); _q.setFromEuler(_e);
    const kd = DLON[s]; QA[kd * 4] = _q.x; QA[kd * 4 + 1] = _q.y; QA[kd * 4 + 2] = _q.z; QA[kd * 4 + 3] = _q.w; WA[kd] = w;
    _e.set(0, 0, -dl[3] * s, 'ZYX'); _q.setFromEuler(_e);
    const kp = PALCE[s]; QA[kp * 4] = _q.x; QA[kp * 4 + 1] = _q.y; QA[kp * 4 + 2] = _q.z; QA[kp * 4 + 3] = _q.w; WA[kp] = w;
  }
  const _celA = [0, 0, 0], _bA = [-0.35, -1, -0.45], _dlA = [0, 0, 0, 1.38];

  function update(dt, ctx = {}) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    st.t += dt; st.tb += dt;
    const v = Math.max(0, ctx.predkosc || 0);
    if (ctx.kierunek != null && st.baza !== 'smierc') {
      const d = owin(ctx.kierunek - st.kat), dk = d * (1 - Math.exp(-dt * 12));
      st.kat = owin(st.kat + dk); st.omega += ((dt > 0 ? dk / dt : 0) - st.omega) * (1 - Math.exp(-dt * 10));
    } else st.omega *= Math.exp(-dt * 6);
    obrot.rotation.y = st.kat;
    const ve = st.tryb === 'idle' ? 0 : st.tryb === 'chod' ? (v > 0.05 ? Math.min(v, 2.6) : 1.6) : st.tryb === 'bieg' ? (v > 0.05 ? Math.max(v, 3.6) : 6.2) : v;
    st.vS += (ve - st.vS) * (1 - Math.exp(-dt * 7));
    const acc = dt > 0 ? (st.vS - st.vPop) / dt : 0; st.vPop = st.vS;
    st.acc += (acc - st.acc) * (1 - Math.exp(-dt * 8));
    const vS = st.vS;
    const wI = 1 - sstep(0.08, 0.7, vS), kB = sstep(2.6, 3.9, vS), wB = kB * (1 - wI), wC = (1 - wI) * (1 - kB);
    const ampC = sstep(0.05, 1.6, vS);
    // kadencja z długości kroku (nogi D.noga): chód ~0,62 × noga na krok, bieg ~1,5 × noga
    const kad = lerp(vS / (2 * 0.62 * D.noga * o.skala), vS / (2 * 1.5 * D.noga * o.skala), kB);
    st.faza = (st.faza + TAU * Math.max(kad, wI < 0.98 ? 0.55 : 0) * dt) % (TAU * 1000);
    if (ctx.wPowietrzu != null && st.baza !== 'smierc' && st.baza !== 'wygrana') {
      if (ctx.wPowietrzu) {
        if (st.baza !== 'skok' || !st.skokZew) { st.baza = 'skok'; st.tau = 0.07; st.skokZew = true; st.tb = SKOK.T0; }
        st.skokFaza = clamp(0.5 - (ctx.vy || 0) / 16.4, 0, 1);
      } else if (st.wPowPop && st.skokZew) { st.skokZew = false; st.tb = SKOK.T0 + SKOK.TL; }
      st.wPowPop = !!ctx.wPowietrzu;
    }
    if (st.baza === 'skok' && !st.skokZew && st.tb > SKOK.T0 + SKOK.TL + SKOK.T2) { st.baza = 'ruch'; st.tau = 0.15; }
    {
      const W = st.w, kW = 1 - Math.exp(-dt / st.tau), B = st.baza;
      W.ruch += ((B === 'ruch' ? 1 : 0) - W.ruch) * kW; if (W.ruch < 1e-4) W.ruch = 0;
      W.skok += ((B === 'skok' ? 1 : 0) - W.skok) * kW; if (W.skok < 1e-4) W.skok = 0;
      W.smierc += ((B === 'smierc' ? 1 : 0) - W.smierc) * kW; if (W.smierc < 1e-4) W.smierc = 0;
      W.wygrana += ((B === 'wygrana' ? 1 : 0) - W.wygrana) * kW; if (W.wygrana < 1e-4) W.wygrana = 0;
      const n = 1 / ((W.ruch + W.skok + W.smierc + W.wygrana) || 1);
      W.ruch *= n; W.skok *= n; W.smierc *= n; W.wygrana *= n;
    }
    const spokoj = st.baza === 'ruch' ? wI : 0;
    if (st.t > st.nastPatrz) {
      st.nastPatrz = st.t + 1.6 + los() * 3;
      st.patrzCel = spokoj > 0.5 && los() < 0.75 ? (los() - 0.5) * 0.6 : 0;
    }
    if (spokoj < 0.5) st.patrzCel = 0;
    st.patrzYaw += (st.patrzCel * spokoj - st.patrzYaw) * (1 - Math.exp(-dt * 4));
    // ---- poza ----
    P.fill(0); WA.fill(0);
    const wr = st.w.ruch;
    let w = wr * wI; if (w > 1e-4) { tmp.fill(0); pozaIdle(tmp, st.t, st, D); dodajWage(P, tmp, w); }
    w = wr * wC; if (w > 1e-4) { tmp.fill(0); pozaChod(tmp, st.faza, ampC, D); dodajWage(P, tmp, w); }
    w = wr * wB; if (w > 1e-4) { tmp.fill(0); pozaBieg(tmp, st.faza, 1, D); dodajWage(P, tmp, w); }
    w = st.w.skok; if (w > 1e-4) { tmp.fill(0); pozaSkok(tmp, st.baza === 'skok' ? st.tb : SKOK.T0 + SKOK.TL + SKOK.T2, st, D); dodajWage(P, tmp, w); }
    w = st.w.smierc; if (w > 1e-4) { tmp.fill(0); pozaSmierc(tmp, st.baza === 'smierc' ? st.tb : 3, D); dodajWage(P, tmp, w); }
    w = st.w.wygrana; if (w > 1e-4) { tmp.fill(0); pozaWygrana(tmp, st.baza === 'wygrana' ? st.tb : 0, D); dodajWage(P, tmp, w); }
    // wygrana: ręce z IK (lewa na biodrze, prawa w górę z kiwaniem nożem)
    if (st.w.wygrana > 1e-3) {
      const ts = st.baza === 'wygrana' ? st.tb : 1, wej = sstep(0.05, 0.5, ts) * st.w.wygrana, kiw = Math.sin(ts * 7) * sstep(0.5, 0.9, ts);
      ikDoBufora(1, WYGR.L.cel, WYGR.L.biegun, WYGR.L.dl, wej);
      _celA[0] = WYGR.P.cel[0]; _celA[1] = WYGR.P.cel[1] + 0.012 * kiw; _celA[2] = WYGR.P.cel[2];
      _dlA[0] = WYGR.P.dl[0] + 0.25 * kiw; _dlA[1] = WYGR.P.dl[1]; _dlA[2] = WYGR.P.dl[2]; _dlA[3] = WYGR.P.dl[3];
      ikDoBufora(-1, _celA, WYGR.P.biegun, _dlA, wej);
    }
    // szybowanie (gra): ręce płynnie w górę do uchwytów torby
    st.wSz += ((ctx.szybuje && st.baza !== 'smierc' ? 1 : 0) - st.wSz) * (1 - Math.exp(-dt * 12));
    if (st.wSz < 1e-3) st.wSz = 0;
    else for (const s of STRONY) { _celA[0] = SZYB.cel[0] * s; _celA[1] = SZYB.cel[1]; _celA[2] = SZYB.cel[2]; _bA[0] = SZYB.biegun[0] * s; _bA[1] = SZYB.biegun[1]; _bA[2] = SZYB.biegun[2]; ikDoBufora(s, _celA, _bA, SZYB.dl, st.wSz); }
    // atak: prawa ręka z IK po torze kluczy, tułów skręca, lewa przeciwnie
    if (st.tAtak >= 0) {
      const ta = st.tAtak, wA = sstep(0, 0.05, ta) * (1 - sstep(0.62, ATAK.CZAS, ta));
      if (wA > 0) {
        klucz(KL_A, ta, _kl);
        _celA[0] = _kl[0]; _celA[1] = _kl[1]; _celA[2] = _kl[2];
        _dlA[0] = _kl[3]; _dlA[1] = _kl[4]; _dlA[2] = _kl[5]; _dlA[3] = 1.38;
        _bA[0] = -0.45; _bA[1] = -1; _bA[2] = -0.35;
        ikDoBufora(-1, _celA, _bA, _dlA, Math.max(WA[RAMIE[-1]], wA));
        klucz(KL_T, ta, _kl);
        R(P, KK.kregoslup, 0.06 * wA, _kl[0] * wA, 0);
        R(P, KK.biodra, 0, 0.3 * _kl[0] * wA, 0);
        R(P, KK.glowa, -0.03 * wA, -0.45 * _kl[0] * wA, 0);
        T(P, KK.root, 0, 0, _kl[1] * wA * 0.6);
        reka(P, 1, -0.15 * wA, 0.25 * _kl[0] * wA, 0, 0.35 * wA);
        for (const s of STRONY) noga(P, s, -0.1 * wA * (s > 0 ? 1 : -0.6), 0.18 * wA, -0.08 * wA, 0.05 * wA);
      }
      while (st.nrCiecia < 3 && st.tAtak >= KL_A[CIECIA[st.nrCiecia][0]][0]) {
        const [a, b] = CIECIA[st.nrCiecia], kon = lukLok[st.nrCiecia];
        // skala zasięgu wokół środka łuku (nie wokół stóp)
        _skl.makeScale(st.zasieg, st.zasieg, st.zasieg);
        _lukM.copy(kon); _lukM.multiply(_skl);
        luki.dodaj(_lukM, Math.max(0.06, KL_A[b][0] - KL_A[a][0])); st.nrCiecia++;
      }
      st.tAtak += dt; if (st.tAtak > ATAK.CZAS) st.tAtak = -1;
    }
    if (st.tOber >= 0) { oberwalWarstwa(P, st.tOber, los, st.stronaOber); st.tOber += dt; if (st.tOber > 0.6) st.tOber = -1; }
    const wDyn = st.w.ruch;
    R(P, KK.kregoslup, clamp(st.acc * 0.015, -0.12, 0.12) * wDyn, 0, clamp(-st.omega * 0.03 * Math.min(1, vS / 3), -0.22, 0.22) * wDyn);
    // ---- sprężyny: kucyk (z ruchu łodyżki w świecie) i klapy spódniczki (z ud + lot + bieg) ----
    {
      const G = st.G, c = Math.cos(st.kat), sn = Math.sin(st.kat);
      const aX = G[6] * c - G[8] * sn, aY = G[7], aZ = G[6] * sn + G[8] * c;
      const vyG = G[4], wiatr = 0.035 * Math.sin(st.t * 1.7) + 0.02 * Math.sin(st.t * 2.9 + 1), om = st.omega;
      const S2 = SPR, C = SPR_CEL;
      // kucyk: dodatni X = czubek w tył (od głowy) — przy biegu i hamowaniu odchyla się w tył/przód z bezwładności
      C[0] = Math.min(0.5, Math.max(-0.35, 0.035 * vS + 0.01 * aZ + 0.025 * vyG - 0.004 * aY)) + wiatr * 0.5;
      C[3] = Math.min(0.45, Math.max(-0.45, -0.01 * aX - om * 0.04 * Math.min(1, vS / 2 + 0.3))) + wiatr * 0.35;
      C[6] = Math.min(0.35, Math.max(-0.35, -om * 0.05));
      for (let ax = 0; ax < 3; ax++) for (let i = 0; i < 3; i++) {
        const j = ax * 3 + i, cel = i ? S2[(j - 1) * 2] : C[ax * 3];
        S2[j * 2 + 1] += ((cel - S2[j * 2]) * SPR_K[i] - S2[j * 2 + 1] * SPR_C[i]) * dt; S2[j * 2] += S2[j * 2 + 1] * dt;
      }
      let oo = K.kucyk0 * KAN; P[oo] += S2[0] * 0.5; P[oo + 1] += S2[12] * 0.5; P[oo + 2] += S2[6] * 0.5;
      oo = K.kucyk1 * KAN; P[oo] += S2[2] * 0.55; P[oo + 1] += S2[14] * 0.4; P[oo + 2] += S2[8] * 0.6;
      oo = K.kucyk2 * KAN; P[oo] += S2[4] * 0.65; P[oo + 1] += S2[16] * 0.3; P[oo + 2] += S2[10] * 0.7;
      // klapy: uda z bieżącej pozy (zgięcie w przód / w tył, odwiedzenie) + lot + bieg
      let przod = 0, tyl = 0, bokL = 0, bokP = 0;
      for (const s of STRONY) {
        const f = P[UDO[s] * KAN], ab = P[UDO[s] * KAN + 2] * s;
        przod = Math.max(przod, -f); tyl = Math.max(tyl, f); if (s > 0) bokL = Math.max(0, ab); else bokP = Math.max(0, ab);
      }
      const W = st.w, lot = W.skok * sstep(-1, -6, vyG) * 0.3 + W.skok * 0.05, ws = W.smierc;
      C[9] = 0.85 * przod + lot + 0.012 * vS;
      C[10] = 0.55 * tyl + lot + 0.02 * vS + 0.006 * Math.min(10, Math.max(-10, aZ));
      C[11] = 0.6 * bokL + lot + 0.04 * Math.max(0, om);
      C[12] = 0.6 * bokP + lot + 0.04 * Math.max(0, -om);
      for (let j = 9; j < 13; j++) {
        const cel = Math.min(1.1, Math.max(-0.05, C[j] * (1 - ws)));
        S2[j * 2 + 1] += ((cel - S2[j * 2]) * 160 - S2[j * 2 + 1] * 12) * dt; S2[j * 2] += S2[j * 2 + 1] * dt;
      }
      P[K.spP * KAN] -= Math.max(-0.05, S2[18]); P[K.spT * KAN] += Math.max(-0.05, S2[20]);
      P[K.spL * KAN + 2] += Math.max(-0.05, S2[22]); P[K.spR * KAN + 2] -= Math.max(-0.05, S2[24]);
    }
    // ---- na kości (Euler → kwaternion; nadpisania z IK przez nlerp) + pomocnicze (połowa obrotu sąsiada) ----
    for (let k = 0; k < NB; k++) {
      const kb = kosci[k], q = k * KAN, p0 = spocz[k];
      _e.set(P[q], P[q + 1], P[q + 2], kb.rotation.order);
      kb.quaternion.setFromEuler(_e);
      const wa = WA[k];
      if (wa > 1e-4) {
        _q2.set(QA[k * 4], QA[k * 4 + 1], QA[k * 4 + 2], QA[k * 4 + 3]);
        if (kb.quaternion.dot(_q2) < 0) { _q2.x = -_q2.x; _q2.y = -_q2.y; _q2.z = -_q2.z; _q2.w = -_q2.w; }
        kb.quaternion.slerp(_q2, Math.min(1, wa));
      }
      kb.position.set(p0.x + P[q + 3], p0.y + P[q + 4], p0.z + P[q + 5]);
      kb.scale.set(1 + P[q + 6], 1 + P[q + 7], 1 + P[q + 8]);
    }
    for (let i = 0; i < POM.length; i += 2) {
      const a = kosci[POM[i]], b = kosci[POM[i + 1]].quaternion;
      a.quaternion.set(b.x, b.y, b.z, b.w + (b.w >= 0 ? 1 : -1)).normalize();
      a.scale.copy(kosci[POM[i + 1]].scale);
    }
    U.uBlysk.value = st.tOber >= 0 ? 0.25 * Math.exp(-st.tOber * 20) : 0;   // mieszanie w liniowym: nawet 0,06 wyraźnie rozjaśnia ciemne partie → krótko
    grupa.updateWorldMatrix(true, true);
    grupa.getWorldPosition(_v);
    st.ziemiaY = ctx.ziemia != null ? ctx.ziemia : _v.y;
    {
      const e = kosci[K.kucyk0].matrixWorld.elements, G = st.G, x = e[12], y = e[13], z = e[14];
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
  }

  function dispose() {
    grupa.removeFromParent(); efekty.removeFromParent();
    mat.dispose(); luki.dispose(); if (matKopii) matKopii.dispose(); if (matKonturu) matKonturu.dispose();
    mesh.skeleton.dispose();
    if (--dane._uzycia <= 0) { dane._geoPelna.dispose(); dane._geoPelna = null; }
  }
  function reset() {
    st.baza = 'ruch'; st.tryb = 'auto'; st.tau = 0.16;
    st.w.ruch = 1; st.w.skok = 0; st.w.smierc = 0; st.w.wygrana = 0;
    st.tb = 0; st.tAtak = -1; st.tOber = -1; st.wSz = 0;
    st.skokZew = false; st.wPowPop = false; st.vS = 0; st.vPop = 0; st.acc = 0; st.omega = 0; st.pGok = false;
    st.G.fill(0); SPR.fill(0);
    luki.wyczysc();
  }
  function dlon(s, out) { return out.set(0, 0, 0).applyMatrix4(kosci[K[s > 0 ? 'palceL' : 'palceP']].matrixWorld); }
  function chmury(v) { if (U.uChmury) U.uChmury.value = v; }
  function zasiegAtaku(k) { st.zasieg = clamp(k || 1, 0.5, 2.5); }
  update(0, {});
  const trojkaty = geo.index.count / 3;
  return {
    grupa, mesh, kosci, efekty, material: mat, kopia, kontur,
    ustawStan, update, dispose, reset, dlon, chmury, zasiegAtaku, zasiegStrumienia: zasiegAtaku,
    get stan() { return { baza: st.baza, tryb: st.tryb, w: { ...st.w }, atak: st.tAtak >= 0, oberwal: st.tOber >= 0, v: st.vS }; },
    get kat() { return st.kat; }, set kat(a) { st.kat = a; },
    info: { trojkaty, wierzcholki: geo.attributes.position.count, kosci: NB, drawCalle: kontur ? 2 : 1, wysokosc: H0 * o.skala,
      wysokoscGlowy: ((dane.wymiary.glowa?.[1] ?? 1) + (dane.wymiary.glowaR ?? 0.2)) * o.skala, zrodlo: dane.zrodlo },
    _st: st, _D: D, _P: P,
  };
}
