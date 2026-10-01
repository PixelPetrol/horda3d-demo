// ╔══════════════ CZASZA 3D — spadochron do szybowania (01.10.2026) ══════════════╗
// Życzenie właściciela: „popraw spadochron". Przytrzymanie skoku w powietrzu = czasza nad postacią
// (zdolność `glide`, „Foliowa torba"). Stara czasza była białą czapą sfery z tekstury 64×32
// i płaskim sprite'em sznurków — z kamery gry wyglądała jak grzyb, zasłaniała głowę postaci,
// a sznurków prawie nie było widać.
//
// WARIANTY (`ustawWariant`):
//   torba  — foliowa reklamówka z warzywniaka do góry dnem (domyślna — zdolność nazywa się „Foliowa
//            torba"): nadmuchana „poduszka" ze zgrzewem dna na czubku i sterczącymi rogami na jego
//            końcach, pionowe zakładki po bokach, pionowe RÓWNOLEGŁE paski zielony/biały/czerwony na
//            panelach i nalepka z pomidorem na panelu od kamery, czerwony obrębek wylotu; LINKI =
//            rozciągnięte uchwyty torby (biała folia z zielonym paskiem i ciemnym brzegiem, rozszerzone
//            u nasady), parami do barków. Folia lekko prześwituje (0,9; nadruk i brzegi kryją — fresnel).
//   salata — liść sałaty czerwonolistnej: blady środek, limonkowa blaszka jaśniejsza od trawy, bordowa
//            kędzierzawa falbanka (18 fal, płynie wzdłuż brzegu), gruby nerw główny przechodzący
//            w ogonek od strony kamery, pierzaste żyłki ku czubkowi; boki opadają (odwrócone taco);
//            linki = cienki sznurek do barków.
//
// RUCH (wszystko w vertex shaderze, CPU tylko ustawia uniformy):
//   • otwieranie: sprężyna (ω 19, ζ 0,6) — z tobołka przy głowie do pełnej czaszy w ~0,14 s,
//     czubek nadmuchuje się pierwszy, brzeg dochodzi ostatni, ~10% przestrzału;
//   • składanie: sprężyna krytyczna (ω 30) — brzeg zwija się pierwszy, całość w ~0,2 s, na końcu
//     linki chudną i zjeżdżają do barków (bez „V" nad głową);
//   • brzeg trzepocze (dwie fale po obwodzie), mocniej przy szybkim locie i po zawietrznej;
//   • czasza wychyla się o `PRZECHYL` (0,2 rad przy pełnej prędkości) W KIERUNKU LOTU, wyprzedza
//     postać w bok ekranu (ku kamerze prawie wcale — zjeżdżałaby na głowę), przechyla się w zakrętach
//     (bank z prędkości kątowej kursu), oddycha (±2,5% wysokości), waha się lekko jak wahadło;
//   • stałe pochylenie czubka ku kamerze `ku` (torba 0,1, liść 0,32 rad) — jak SPRITE_TILT u postaci;
//   • linki: od brzegu czaszy (ta sama deformacja co brzeg) do barków postaci; przy otwieraniu
//     luźne (łuk), napięte w locie, drgają.
//
// POSTACIE: czasza wisi nad czubkiem głowy (max alfy klatek `jump`), linki idą do barków z tablicy
// `BARKI` (ułamki widocznej wysokości postaci; inna sylwetka = inny wpis). Barki leżą W PŁASZCZYŹNIE
// pochylonego billboardu (te same quaterniony co sprite), a ich rozstaw maleje, gdy postać jest
// bokiem do kamery (|cos(kierunek − camYaw)|).
//
// WYDAJNOŚĆ: JEDNA siatka (czasza + linki/uchwyty + ogonek w jednym buforze) = 1 draw call
// + 1 w mapie cieni (customDepthMaterial z tą samą deformacją). Geometria i materiał powstają RAZ
// (warianty budowane leniwie, trzymane w pamięci), `update()` nie alokuje. 2 528 trójkątów
// (torba) / ~3,4 tys. (sałata). Zmierzone w grze: +2 draw calle (1 + cień), 0 nowych programów na klatkę.
// Światło: 3 pasma toon z chłodnym cieniem (liść: ciepłym — prześwituje), jedna czysta plama połysku
// + drobne iskry, jasne pasmo na sylwetce, KONTUR w pikselach (fwidth) na sylwetce i wolnym brzegu.
//
// RYSOWANIE PÓŁPRZEZROCZYSTEJ FOLII W JEDNYM PRZEBIEGU: materiał DoubleSide + `forceSinglePass`
// (inaczej three.js rysuje przezroczysty DoubleSide dwa razy = 2 draw calle). Kolejność trójkątów
// w buforze jest „malarska" w układzie czaszy: najpierw linki, potem pasy od brzegu do czubka,
// a w pasie od tyłu (−z) do przodu (+z, strona kamery). Czasza ma yaw = camYaw (jak sprite'y),
// więc kamera zawsze patrzy od +z z góry — dalsza ścianka zawsze rysuje się przed bliższą, folia
// nie robi łat, a linki i postać prześwitują przez nią poprawnie.
//
// ⚠️ PUŁAPKI (z osiedla i skrzyń): (1) własny `customProgramCacheKey` — klucz programu three to
// onBeforeCompile.toString() + parametry; (2) cień chmur liczony TU (opcja `chmury`), NIE przez
// addCloudShadow z main.js — podwójne owinięcie redefiniowało `vWPos`; (3) materiał to
// MeshBasicMaterial z WŁASNYM światłem toon (słońce + niebo z uniformów) — bez łatania chunków
// świateł Lamberta, więc nie zależy od ich treści.
// ╚═══════════════════════════════════════════════════════════════════════════════╝

const TAU = Math.PI * 2;

function lin(hex) {
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}
const v3 = hex => { const c = lin(hex); return `vec3(${c.map(x => x.toFixed(4)).join(', ')})`; };
const angDist = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// ---------------- barki postaci: ułamki WIDOCZNEJ wysokości (od stóp do czubka klatek skoku) ----------------
// y = wysokość barku nad stopami, x = pół-rozstaw barków; zmierzone na klatkach `jump` (kierunek south).
export const BARKI = {
  carrotello_squattello: { y: 0.60, x: 0.22 },   // marchew-dres: barki pod wielką głową, szeroko
  beetino_bouncerino:    { y: 0.55, x: 0.25 },   // burak: boki bulwy na wysokości rąk
  radishetta_razoretta:  { y: 0.38, x: 0.21 },   // rzodkiewka: barki pod okrągłą głową (szerzej niż sylwetka — przy 0.16 linki szły przez twarz)
  granny_smithella:      { y: 0.42, x: 0.22 },   // jabłko w chuście: barki pod chustą
  garlicino_stinkerino:  { y: 0.47, x: 0.18 },   // czosnek: pod główką
  // 01.10: Czekotubka (model 3D, wysokość od stóp do czubka nakrętki): pięści w pozie szybowania (ręce w górę).
  // W grze linki idą do PRAWDZIWYCH pięści modelu (`s.barkL/barkP` w świecie) — ten wpis to zapas bez nich.
  czekotubka:            { y: 0.66, x: 0.27 },
};
const BARKI_DOM = { y: 0.52, x: 0.2 };
// wychył czaszy w kierunku lotu przy pełnej prędkości (rad). Dodatni = czubek ku kierunkowi lotu (krawędź natarcia
// w dół — „żagiel ciągnie postać"); ujemny = czasza wlecze się za postacią jak hamujący spadochron.
export let PRZECHYL = 0.2;
export function ustawPrzechyl(v) { PRZECHYL = +v || 0; return PRZECHYL; }
// liczba fal falbanki sałaty (geometria, kolor grzbietów i ruch muszą mieć tę samą fazę); 30 w skali gry dawało szum
const FALB = 18;

// ---------------- warianty: kształt + wygląd ----------------
// Układ czaszy: początek w środku płaszczyzny wylotu, +y w górę, +x = prawo ekranu, +z = do kamery.
// Kąt `a` liczony od +x w stronę +z; `s` = 0 na czubku → 1 na brzegu kopuły (→ sKon na końcu spódnicy).
export const WARIANTY = {
  torba: {
    nr: 0, N: 72, M: 14, Ms: 3,
    A: 0.88, B: 0.66, n: 2.4, H: 0.64, p: 2.1, spod: 0.17, sKon: 1.25,
    szew: 0.05,                                    // wgłębienie wzdłuż zgrzewu dna (dwie „poduszki")
    zakl: 0.15,                                    // fałd boczny (zakładka torby) — wcięcie boków
    rogi: 0.16,                                   // rogi dna sterczą na końcach zgrzewu („uszy" nadmuchanej torby)
    przerwa: 0.42,                                 // od czubka głowy do najniższego punktu czaszy
    linki: [[0.62, 1], [-0.62, 1], [Math.PI - 0.62, 0], [Math.PI + 0.62, 0]],   // [kąt na brzegu, bark 0=L 1=P]
    grub: 0.058, grubMin: 2.2, marsz: 0.26, polysk: 0.75, rim: 0.16, alfa: 1,
    cien: [0.72, 0.77, 0.91],                      // chłodny cień białej folii (Genshin)
    ku: 0.1,                                       // pochylenie czubka ku kamerze (rad)
  },
  salata: {
    nr: 1, N: 108, M: 15, Ms: 0,
    A: 0.84, B: 0.86, H: 0.52, sKon: 1.0,
    przerwa: 0.54,
    linki: [[0.78, 1], [-0.78, 1], [Math.PI - 0.78, 0], [Math.PI + 0.78, 0]],
    grub: 0.016, grubMin: 1.5, marsz: 0.12, polysk: 0.14, rim: 0.2, alfa: 0,
    cien: [0.82, 0.9, 0.76],                       // liść przepuszcza światło: cień ciepły i jasny, nie siny
    ku: 0.32,                                      // płaski liść trzeba mocniej pokazać kamerze
  },
};

// punkt kształtu spoczynkowego (pełne otwarcie)
function punktTorby(K, a, s) {
  const c = Math.cos(a), sn = Math.sin(a);
  // rzut: superelipsa (zaokrąglony prostokąt — torba ma boki, nie jest kołem)
  const r = Math.pow(Math.pow(Math.abs(c) / K.A, K.n) + Math.pow(Math.abs(sn) / K.B, K.n), -1 / K.n);
  let hx, y;
  if (s <= 1) {
    const th = s * Math.PI / 2;
    hx = Math.pow(Math.sin(th), 2 / K.p);          // profil superelipsy: płaski czubek, okrągłe ramię
    y = K.H * Math.pow(Math.cos(th), 2 / K.p);
  } else {
    const t = (s - 1) / (K.sKon - 1);               // spódnica: ścianka wylotu, lekko zwężona
    hx = 1 - 0.07 * t * t;
    y = -K.spod * t;
  }
  // zakładki boczne: pionowe wcięcie na środku boków (a = 0, π), od ramienia do wylotu
  const g = Math.exp(-Math.pow(angDist(a, 0) / 0.17, 2)) + Math.exp(-Math.pow(angDist(a, Math.PI) / 0.17, 2));
  const wz = Math.min(1, Math.max(0, (s - 0.58) / 0.3));
  hx *= 1 - K.zakl * g * wz * wz * (3 - 2 * wz);
  // rogi dna: na końcach zgrzewu (górne boki) folia wypycha się w dwa sterczące rogi
  const gr = Math.exp(-Math.pow(angDist(a, 0) / 0.26, 2)) + Math.exp(-Math.pow(angDist(a, Math.PI) / 0.26, 2));
  const br = Math.exp(-Math.pow((s - 0.5) / 0.13, 2));
  hx *= 1 + K.rogi * gr * br;
  y += K.rogi * 1.1 * gr * br;
  let x = c * r * hx, z = sn * r * hx;
  // zgrzew dna wzdłuż x na czubku: płytka bruzda → dwie „poduszki" zamiast kopuły
  const czub = Math.pow(Math.max(0, Math.cos(Math.min(1, s) * Math.PI / 2)), 0.7);
  y -= K.szew * Math.exp(-(z * z) / (0.07 * 0.07)) * czub;
  return [x, y, z];
}
function punktSalaty(K, a, s) {
  const c = Math.cos(a), sn = Math.sin(a);
  let r = 1 / Math.sqrt((c * c) / (K.A * K.A) + (sn * sn) / (K.B * K.B));
  r *= 1 + 0.05 * Math.sin(a * 5 + 0.4) + 0.025 * Math.sin(a * 11 + 1.7);   // płaty liścia
  // sylwetka liścia (odwrotnie jajowata): wąsko przy ogonku (+z) z sercowatym wcięciem, szeroki zaokrąglony czubek (−z)
  r *= 1 - 0.26 * Math.max(0, sn) * Math.max(0, sn) + 0.08 * Math.max(0, -sn);
  r *= 1 - 0.16 * Math.exp(-Math.pow(angDist(a, Math.PI / 2) / 0.16, 2));
  // falbanka tylko na zewnętrznym pasie (s^6) i z NIERÓWNĄ częstotliwością — przy s^4 i stałym 30
  // fałdy biegły promieniście od środka jak druty parasola
  const fr = Math.pow(s, 6), fa = a * FALB + 2.2 * Math.sin(a * 3 + 0.7) + 1.1 * Math.sin(a * 7);
  r *= s * (1 + 0.06 * fr * Math.cos(fa));          // falbanka: zmarszczki w promieniu…
  const x = c * r, z = sn * r;
  // LIŚĆ, nie parasol: nerw wzdłuż z (ogonek od kamery, czubek dalej), boki opadają mocno (odwrócone taco),
  // przód i tył słabo; symetryczna kopuła czytała się jak parasolka
  const ux = x / K.A, uz = z / K.B;
  let y = K.H * (1 - 0.6 * ux * ux - 0.24 * uz * uz) - 0.1 * Math.pow(s, 7);
  y += 0.08 * fr * Math.sin(fa);                    // …i w pionie
  y += 0.035 * Math.exp(-(x * x) / (0.05 * 0.05)) * (1 - 0.7 * s);   // wypukły nerw główny wzdłuż z
  return [x, y, z];
}

// ---------------- budowa geometrii ----------------
function zbuduj(THREE, nazwa) {
  const K = WARIANTY[nazwa];
  const fun = nazwa === 'torba' ? punktTorby : punktSalaty;
  const P = [], Nn = [], C = [], UV = [], tris = [];   // tris: [klucz sortowania, i0, i1, i2]
  const dodaj = (p, n, cz, uv) => { P.push(p[0], p[1], p[2]); Nn.push(n[0], n[1], n[2]); C.push(...cz); UV.push(uv[0], uv[1]); return P.length / 3 - 1; };
  const normalna = (a, s) => {
    if (s < 1e-4) return [0, 1, 0];
    const e = 1e-3, p0 = fun(K, a, s);
    const pa = fun(K, a + e, s), ps = fun(K, a, Math.min(K.sKon, s + e)), ps0 = s + e > K.sKon ? fun(K, a, s - e) : p0;
    const da = [pa[0] - p0[0], pa[1] - p0[1], pa[2] - p0[2]];
    const ds = s + e > K.sKon ? [p0[0] - ps0[0], p0[1] - ps0[1], p0[2] - ps0[2]] : [ps[0] - p0[0], ps[1] - p0[1], ps[2] - p0[2]];
    let n = [ds[1] * da[2] - ds[2] * da[1], ds[2] * da[0] - ds[0] * da[2], ds[0] * da[1] - ds[1] * da[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
    if (n[0] * p0[0] + n[1] * (p0[1] + 0.4) + n[2] * p0[2] < 0) n = [-n[0], -n[1], -n[2]];   // na zewnątrz
    return n;
  };
  // 1. LINKI (najpierw w buforze — przez folię mają prześwitywać): wstęga 2 × (SEG+1) wierzchołków
  const SEG = 10;
  K.linki.forEach(([a, bark], li) => {
    const p = fun(K, a, K.sKon), i0 = P.length / 3;
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      for (const st of [-1, 1]) dodaj(p, [0, 1, 0], [2, K.sKon, a, t], [st, bark + li * 0.01]);
    }
    for (let k = 0; k < SEG; k++) {
      const q = i0 + k * 2;
      tris.push([-1, q, q + 1, q + 3], [-1, q, q + 3, q + 2]);
    }
  });
  // 2. CZASZA: siatka (kąt × s), kolejność malarska (od brzegu do czubka, od −z do +z)
  const N = K.N, rS = [];
  for (let j = 0; j <= K.M; j++) rS.push(j / K.M);                       // kopuła
  for (let j = 1; j <= K.Ms; j++) rS.push(1 + (K.sKon - 1) * j / K.Ms);   // spódnica
  const baza = P.length / 3, W = N + 1;
  for (const s of rS) for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    dodaj(fun(K, a, s), normalna(a, s), [0, s, a, 0], [i / N, s]);
  }
  const R = rS.length;
  for (let j = 0; j < R - 1; j++) for (let i = 0; i < N; i++) {
    const a0 = baza + j * W + i, a1 = a0 + 1, b0 = a0 + W, b1 = b0 + 1;
    const am = ((i + 0.5) / N) * TAU;
    const klucz = (R - 2 - j) * 10 + (Math.sin(am) + 1) * 4;   // pas od brzegu, w pasie od tyłu
    tris.push([klucz, a0, b1, b0], [klucz, a0, a1, b1]);   // przeciwnie do wskazówek z zewnątrz (gl_FrontFacing = zewnątrz)
  }
  // 3. sałata: ogonek przy +z (blady, zwężony walec od brzegu na zewnątrz i lekko w dół)
  if (nazwa === 'salata') {
    const a = Math.PI / 2, p0 = fun(K, a, 1), S = 8, i0 = P.length / 3;
    // ogonek = przedłużenie nerwu głównego: gruby u nasady, poziomo na zewnątrz (zwisający wyglądał jak kołek)
    // (lekko w górę: czasza jest pochylona ku kamerze o `ku`, więc poziomy ogonek wbijał się w głowę postaci)
    const pr = [[-0.06, 0.05], [0.07, 0.04], [0.15, 0.03]];
    for (const [d, rr] of pr) for (let i = 0; i <= S; i++) {
      const f = (i / S) * TAU, ny = Math.cos(f), nx = Math.sin(f);
      dodaj([p0[0] + nx * rr, p0[1] + 0.03 + ny * rr * 0.75 + d * 0.45, p0[2] + d], [nx, ny, 0], [1, 1, a, Math.max(0, d) / 0.15], [i / S, 1]);
    }
    for (let j = 0; j < pr.length - 1; j++) for (let i = 0; i < S; i++) {
      const q0 = i0 + j * (S + 1) + i, q1 = q0 + 1, r0 = q0 + S + 1, r1 = r0 + 1;
      tris.push([1e6, q0, r0, r1], [1e6, q0, r1, q1]);
    }
    const c = dodaj([p0[0], p0[1] + 0.03 + 0.15 * 0.45 + 0.01, p0[2] + 0.165], [0, 0, 1], [1, 1, a, 1], [0.5, 1]);
    const ost = i0 + (pr.length - 1) * (S + 1);
    for (let i = 0; i < S; i++) tris.push([1e6, ost + i, c, ost + i + 1]);
  }
  tris.sort((x, y) => x[0] - y[0]);
  const idx = new (P.length / 3 > 65535 ? Uint32Array : Uint16Array)(tris.length * 3);
  tris.forEach((t, k) => { idx[k * 3] = t[1]; idx[k * 3 + 1] = t[2]; idx[k * 3 + 2] = t[3]; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('aCz', new THREE.Float32BufferAttribute(C, 4));
  g.setAttribute('aUv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.userData.trojkaty = tris.length;
  return g;
}

// ---------------- GLSL: deformacja (wspólna dla koloru i mapy cieni) ----------------
const GLSL_DEF = `
  uniform float uCzas, uCzOtw, uCzPred, uCzFaza, uCzWar, uCzSRim, uCzGrub, uCzGrubMin, uCzVpH;
  uniform vec3 uCzWiatr, uCzBarkL, uCzBarkR;
  attribute vec4 aCz;   // x: rodzaj (0 czasza, 1 ogonek, 2 linka), y: s, z: kąt, w: t linki / dodatek
  attribute vec2 aUv;   // czasza: (u, s); linka: (strona wstęgi ±1, bark 0/1)
  float czK(float sn) {                 // lokalne otwarcie: czubek pierwszy, brzeg ostatni, przestrzał bez wzmocnienia
    return uCzOtw <= 1.0 ? clamp((uCzOtw - 0.3 * sn) / 0.7, 0.0, 1.0) : uCzOtw;
  }
  vec3 czDeform(vec3 p, float s, float a) {
    float sn = s / uCzSRim;
    float k = czK(sn), kk = min(k, 1.0);
    // złożona: wąski tobołek, czubek nad wylotem, brzeg zwisa
    vec3 pz = vec3(p.x * 0.12, mix(0.30, -0.25, sn), p.z * 0.12);
    vec3 q = mix(pz, p, k);
    q.xz *= 1.0 + (1.0 - kk) * 0.45 * sin(a * 5.0 + sn * 5.0) * sn;   // zmięta folia w trakcie
    // trzepot brzegu: dwie fale po obwodzie; mocniej przy szybkim locie i po zawietrznej
    float fl = sn * sn * sn * kk;
    vec2 rad = normalize(p.xz + vec2(1e-5));
    float zaw = dot(rad, uCzWiatr.xz);
    float amp = (0.024 + 0.05 * uCzPred * (0.65 + 0.35 * zaw)) * fl;
    float w = sin(uCzas * 8.3 + a * 3.0 + uCzFaza) * 0.6 + sin(uCzas * 13.1 - a * 5.0 + 1.3) * 0.4;
    q.y += w * amp - zaw * 0.06 * uCzPred * fl;
    q.xz += rad * w * amp * 0.45;
    // falbanka sałaty płynie wzdłuż brzegu
    q.y += uCzWar * 0.022 * sin(uCzas * 6.5 - (a * ${FALB.toFixed(1)} + 2.2 * sin(a * 3.0 + 0.7) + 1.1 * sin(a * 7.0))) * fl * sn * sn * sn;
    q.y *= 1.0 + 0.025 * sin(uCzas * 3.3 + uCzFaza) * kk;      // oddech
    return q * smoothstep(0.0, 0.14, uCzOtw);                       // ostatnia chwila składania: znika w punkt
  }
  vec3 czLinka(float t) {
    vec3 dol = aUv.y > 0.5 ? uCzBarkR : uCzBarkL;
    // przy końcu składania górny koniec zjeżdża do barku — inaczej nad głową zostawało „V" z linek bez czaszy
    vec3 gora = mix(dol, czDeform(position, aCz.y, aCz.z), smoothstep(0.02, 0.3, uCzOtw));
    vec3 p = mix(gora, dol, t);
    float kk = clamp(uCzOtw, 0.0, 1.0), luz = ((1.0 - kk) * 0.32 + 0.025) * smoothstep(0.02, 0.3, uCzOtw), bt = sin(3.14159 * t);
    vec2 rad = normalize(gora.xz + vec2(1e-5));
    p.xz += rad * bt * luz * 0.55;
    p.y -= bt * luz * 0.25;
    p.x += sin(uCzas * 11.0 + aCz.z * 3.0 + t * 4.0) * 0.012 * bt;
    p.z += cos(uCzas * 9.0 + aCz.z * 2.0 + t * 3.0) * 0.010 * bt;
    return p;
  }
`;
const GLSL_BEGIN = `
  vec3 transformed;
  if (aCz.x > 1.5) transformed = czLinka(aCz.w);
  else transformed = czDeform(position, aCz.y, aCz.z);
`;
// wstęga linki zwrócona do kamery; szerokość w świecie, ale nie cieńsza niż uCzGrubMin pikseli
const GLSL_PROJECT = `
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  if (aCz.x > 1.5) {
    float t2 = aCz.w < 0.95 ? aCz.w + 0.05 : aCz.w - 0.05;
    vec4 mv2 = modelViewMatrix * vec4(czLinka(t2), 1.0);
    vec2 d = (mv2.xy - mvPosition.xy) * (aCz.w < 0.95 ? 1.0 : -1.0);
    d = normalize(d + vec2(1e-6));
    float naPx = -mvPosition.z * 2.0 / (projectionMatrix[1][1] * uCzVpH);
    float rozszerz = 1.0 + 1.3 * pow(1.0 - aCz.w, 6.0) * (1.0 - uCzWar);   // uchwyt torby rozszerza się u nasady
    float w = max(uCzGrub * rozszerz, uCzGrubMin * naPx) * smoothstep(0.02, 0.3, uCzOtw);   // przy składaniu chudnie do zera
    mvPosition.xy += vec2(-d.y, d.x) * aUv.x * w * 0.5;
  }
  gl_Position = projectionMatrix * mvPosition;
`;

// ---------------- materiał ----------------
function stworzMaterial(THREE, U, o) {
  const mat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: true });
  mat.forceSinglePass = true;                       // przezroczysty DoubleSide w JEDNYM przebiegu (patrz nagłówek)
  if (o.chmury) mat.defines = { CZ_CHMURY: '' };
  const skala = ((o.chmury && o.chmury.skala) || 0.016).toFixed(5);
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = GLSL_DEF + `
      varying vec4 vCz; varying vec2 vCzUv; varying vec3 vCzLok, vCzN, vCzW;
    ` + sh.vertexShader
      .replace('#include <begin_vertex>', GLSL_BEGIN + `
        vCz = aCz; vCzUv = aUv; vCzLok = position;
        vCzN = normalize(mat3(modelMatrix) * normal);
        vCzW = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
      .replace('#include <project_vertex>', GLSL_PROJECT);
    sh.fragmentShader = `
      uniform float uCzas, uCzWar, uCzSRim, uCzMarsz, uCzPolysk, uCzRim, uCzKont, uCzAlfa, uCzChmury;
      uniform vec3 uCzSlonce, uCzCien;
      #ifdef CZ_CHMURY
        uniform sampler2D uCloud; uniform vec2 uCloudOff;
      #endif
      varying vec4 vCz; varying vec2 vCzUv; varying vec3 vCzLok, vCzN, vCzW;
      float czPas(float x, float w) { float f = fwidth(x) * 0.75 + 1e-5; return 1.0 - smoothstep(w - f, w + f, abs(x)); }   // 1 w pasie |x| < w (wygładzony)
      ` + sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        float rodz = vCz.x, s = vCz.y, a = vCz.z;
        vec3 lok = vCzLok;
        vec3 N = normalize(vCzN) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 V = normalize(cameraPosition - vCzW);
        float ndv = abs(dot(N, V));
        float druk = 0.0;                            // ile „farby" (nadruk kryje mocniej niż goła folia)
        vec3 alb, kont;
        if (rodz > 1.5) {
          // ---- LINKI ----
          float e = abs(vCzUv.x);
          if (uCzWar < 0.5) {                        // uchwyt torby: folia z ciemnymi brzegami i zielonym paskiem
            alb = mix(${v3(0xf4f7fa)}, ${v3(0x3daa4a)}, czPas(vCzUv.x, 0.16));
            alb = mix(alb, ${v3(0x2b3550)}, smoothstep(0.55, 0.72, e));
          } else alb = mix(${v3(0x8a6a44)}, ${v3(0x3a2e22)}, smoothstep(0.2, 0.8, e));   // sznurek
          float sw = 0.86 + 0.14 * vCz.w;            // przy czaszy w jej cieniu
          outgoingLight = alb * sw;
          diffuseColor.a = 1.0;
        } else {
          if (uCzWar < 0.5) {
            // ---- TORBA ----
            alb = ${v3(0xf4f7fa)};
            kont = ${v3(0x2b3550)};
            // pionowe paski RÓWNOLEGŁE (stałe x) na przednim i tylnym panelu i w poprzek dna — jak nadruk
            // reklamówki; promieniste paski robiły z torby parasol plażowy. Boki (zakładki) gładkie.
            float bok = smoothstep(0.80, 0.9, abs(cos(a))) * smoothstep(0.3, 0.45, s);
            float st = fract(lok.x * 2.1 + 0.5);
            float fz = fwidth(st) + 1e-4;
            float pz = smoothstep(0.02, 0.02 + fz, st) * (1.0 - smoothstep(0.2, 0.2 + fz, st));
            float pc = smoothstep(0.52, 0.52 + fz, st) * (1.0 - smoothstep(0.7, 0.7 + fz, st));
            // nadruk jest NA ZEWNĄTRZ: od środka (tył ścianki widziany przez wylot) tylko blady prześwit farby
            float zew = gl_FrontFacing ? 1.0 : 0.3;
            float paski = (1.0 - bok) * zew;
            // nalepka z nadrukiem TYLKO na panelu od kamery (+z): biała tarcza, zielony pierścień, pomidor z listkiem
            float przod = smoothstep(0.55, 0.75, sin(a)) * step(0.3, s) * zew;
            vec2 q = vec2(lok.x, (lok.y - 0.27) * 1.12);
            float d = length(q);
            float tarcza = czPas(d, 0.235) * przod;
            paski *= 1.0 - tarcza;
            alb = mix(alb, ${v3(0x3daa4a)}, pz * paski);
            alb = mix(alb, ${v3(0xe2483d)}, pc * paski);
            druk = max(druk, (pz + pc) * paski);
            float pier = czPas(d - 0.2, 0.024);
            float pom = czPas(d, 0.112);
            float bl = czPas(length(q - vec2(-0.04, 0.035)), 0.026);
            float lis = czPas(length(vec2(q.x * 1.7, q.y - 0.112)), 0.05);
            alb = mix(alb, ${v3(0x2f9a45)}, tarcza * pier);
            alb = mix(alb, ${v3(0xe8473c)}, tarcza * pom);
            alb = mix(alb, ${v3(0x3fae49)}, tarcza * lis);
            alb = mix(alb, ${v3(0xffd9cf)}, tarcza * bl * pom);
            druk = max(druk, tarcza);
            // zgrzew dna na czubku (linia wzdłuż x) z zagnieceniami
            float zg = czPas(lok.z, 0.016) * (1.0 - smoothstep(0.5, 0.66, s));
            alb = mix(alb, mix(${v3(0xd0d9e5)}, ${v3(0xa9b5c6)}, step(0.5, fract(lok.x * 30.0))), zg);
            druk = max(druk, zg * 0.7);
            // czerwony obrębek wylotu
            float obr = smoothstep(uCzSRim - 0.07, uCzSRim - 0.055, s);
            alb = mix(alb, ${v3(0xe2483d)}, obr);
            druk = max(druk, obr);
          } else {
            // ---- SAŁATA ----
            // sałata czerwonolistna: blady środek, soczysta zieleń, BORDOWA kędzierzawa krawędź — zielony liść
            // na limonkowej łące zlewał się z trawą (i z koronami drzew), bordo odcina go z każdej kamery
            kont = ${v3(0x3b1f2a)};
            if (rodz > 0.5) {                        // ogonek
              alb = mix(${v3(0xf2f8dc)}, ${v3(0xd5ec9e)}, vCz.w);
            } else {
              float fal = sin(a * ${FALB.toFixed(1)} + 2.2 * sin(a * 3.0 + 0.7) + 1.1 * sin(a * 7.0));
              float brz = smoothstep(0.84, 0.97, s + 0.04 * fal);
              alb = mix(${v3(0xeef8b4)}, ${v3(0xb7e25c)}, smoothstep(0.05, 0.5, s));   // jaśniej od trawy (#9ad557)
              alb = mix(alb, ${v3(0x9fd84e)}, smoothstep(0.6, 0.85, s) * 0.6);
              alb = mix(alb, ${v3(0xa83a5a)}, brz);
              alb = mix(alb, ${v3(0xd45c7a)}, smoothstep(0.35, 0.95, fal) * brz * 0.5);   // grzbiety falbanki łapią światło
              // nerw główny (wzdłuż z) i żyłki odchodzące skośnie ku brzegowi
              // nerw: gruby przy ogonku (+z), cienki przy czubku (−z)
              float wNerw = mix(0.026, 0.07, smoothstep(-0.8, 0.7, lok.z));
              float nerw = czPas(lok.x, wNerw) * (1.0 - smoothstep(0.88, 1.0, s));
              // żyłki pierzaste: od nerwu skośnie ku czubkowi, zakrzywione, cieńsze dalej od nerwu
              float c = (abs(lok.x) * 0.75 + lok.z * 0.6 + abs(lok.x) * abs(lok.x) * 0.5) * 4.6;
              float zyl = czPas(fract(c) - 0.5, mix(0.09, 0.03, smoothstep(0.0, 0.6, abs(lok.x)))) * smoothstep(0.04, 0.1, abs(lok.x)) * (1.0 - smoothstep(0.62, 0.9, s));
              alb = mix(alb, ${v3(0xe2f2ad)}, max(nerw, zyl * 0.8) * (1.0 - brz * 0.7));   // (prawie biały nerw + połysk = biała smuga)
              if (!gl_FrontFacing) alb = mix(alb, ${v3(0xd8eea0)}, 0.4);   // spód jaśniejszy (prześwit)
            }
          }
          // ---- ŚWIATŁO TOON: 3 pasma, chłodny cień, marszczenia folii/liścia zaginają granice pasm ----
          vec3 mz = vec3(sin(lok.x * 21.0 + lok.y * 13.0) * sin(lok.z * 17.0 - lok.x * 7.0),
                         sin(lok.y * 19.0 + lok.z * 11.0) * 0.5,
                         sin(lok.z * 23.0 + lok.x * 9.0) * sin(lok.y * 15.0 + lok.z * 5.0));
          vec3 Nc = normalize(N + mz * uCzMarsz);
          float nl = dot(Nc, uCzSlonce);
          float b1 = smoothstep(-0.06, 0.02, nl), b2 = smoothstep(0.40, 0.48, nl);
          // jasno jak sprite'y obok (MeshBasic, pełna jasność): światło 1,04, cień chłodny ~0,75
          vec3 sw = mix(uCzCien, vec3(1.0), b1) * (0.92 + 0.12 * b2);
          sw *= mix(0.86, 1.0, N.y * 0.5 + 0.5);                        // od spodu ciemniej (niebo vs trawa)
          vec3 col = alb * sw;
          vec3 Hh = normalize(uCzSlonce + V);
          // połysk folii / wosku (toon): JEDNA czysta plama na ramieniu bryły (normalna prawie gładka)
          // + drobne iskry na zagnieceniach. Gęste błyski na marszczeniach wyglądały jak bazgroły kredą.
          float bl1 = smoothstep(0.935, 0.95, dot(normalize(N + mz * uCzMarsz * 0.25), Hh));
          vec3 mz2 = vec3(sin(lok.x * 31.0 - lok.y * 19.0 + lok.z * 7.0), 0.0, sin(lok.z * 29.0 + lok.x * 13.0 - lok.y * 11.0));
          float bl2 = smoothstep(0.982, 0.99, dot(normalize(N + mz2 * uCzMarsz), Hh));
          col += (bl1 * 0.5 + bl2 * 0.45) * uCzPolysk * b1 * vec3(1.0, 0.98, 0.92);
          col += smoothstep(0.62, 0.9, 1.0 - ndv) * uCzRim * alb * b1;    // jasne pasmo na sylwetce (Genshin)
          // KONTUR: sylwetka (N ⟂ V) i wolny brzeg — szerokość w pikselach (fwidth), nie w świecie
          // (próg 0.1–0.2: przy 0.22–0.4 kontur zalewał falbankę i opadające boki liścia widziane pod kątem)
          float kSyl = (1.0 - smoothstep(uCzKont, uCzKont + 1.0, ndv / max(fwidth(ndv), 1e-4))) * (1.0 - smoothstep(0.1, 0.2, ndv));
          float kBrz = rodz > 0.5 ? 0.0 : 1.0 - smoothstep(uCzKont * 0.8, uCzKont * 0.8 + 1.0, (uCzSRim - s) / max(fwidth(s), 1e-5));
          float k = max(kSyl, kBrz);
          col = mix(col, kont, k);
          outgoingLight = col;
          // folia: goła prześwituje, nadruk i brzegi (fresnel) kryją; sałata pełna
          // (0.66 robiło z torby szklaną meduzę, przez którą prześwitywał nadruk dalszej ścianki)
          float al = mix(0.9, 0.98, druk);
          al = mix(al, 0.98, pow(1.0 - ndv, 2.5));
          if (!gl_FrontFacing) al *= 0.9;
          diffuseColor.a = mix(1.0, max(al, k), uCzAlfa);
        }
      }
      #include <opaque_fragment>`)
      .replace('#include <fog_fragment>', `
      #ifdef CZ_CHMURY
        float _czc = texture2D(uCloud, vCzW.xz * ${skala} + uCloudOff).r;
        gl_FragColor.rgb *= mix(1.0, mix(0.74, 1.04, _czc), uCzChmury);
      #endif
      #include <fog_fragment>`);
  };
  mat.customProgramCacheKey = () => 'czasza-v1|' + !!o.chmury + '|' + skala;
  mat.needsUpdate = true;
  return mat;
}
function stworzMaterialCienia(THREE, U) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = GLSL_DEF + sh.vertexShader
      .replace('#include <begin_vertex>', GLSL_BEGIN + `
        if (aCz.x > 1.5) transformed = vec3(0.0);   // linki nie rzucają cienia (2 cm przy tekselu 4 cm = migotanie)`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'czasza-cien-v1';
  return mat;
}

// ---------------- obiekt w scenie ----------------
export class Czasza {
  // o.czas — { value } sekundy (w grze windU); o.chmury — { tex, off, skala } jak w modele-skrzynie;
  // o.slonce — Vector3 kierunku DO słońca (SUN_OFF); o.wariant — 'torba' | 'salata'; o.cien — rzuca cień (domyślnie tak)
  constructor(THREE, scena, o = {}) {
    this.T = THREE;
    const V = () => new THREE.Vector3();
    this._v = { glowa: V(), barkL: V(), barkP: V(), tmp: V(), ax: V(), dir: V(), wiatr: V() };
    this._q = { y: new THREE.Quaternion(), t: new THREE.Quaternion(), b: new THREE.Quaternion(), k: new THREE.Quaternion(),
                s: new THREE.Quaternion(), inv: new THREE.Quaternion() };
    this._m = new THREE.Matrix4();
    this._AY = new THREE.Vector3(0, 1, 0); this._AX = new THREE.Vector3(1, 0, 0); this._AZ = new THREE.Vector3(0, 0, 1);
    this.U = {
      uCzas: o.czas || { value: 0 },
      uCzOtw: { value: 0 }, uCzPred: { value: 0 }, uCzFaza: { value: 1.7 }, uCzWar: { value: 0 },
      uCzSRim: { value: 1 }, uCzGrub: { value: 0.05 }, uCzGrubMin: { value: 1.5 }, uCzVpH: { value: 800 },
      uCzWiatr: { value: V() }, uCzBarkL: { value: V() }, uCzBarkR: { value: V() },
      uCzSlonce: { value: (o.slonce ? o.slonce.clone() : new THREE.Vector3(38, 60, 26)).normalize() },
      uCzMarsz: { value: 0.2 }, uCzPolysk: { value: 1 }, uCzRim: { value: 0.2 }, uCzKont: { value: 1.3 },
      uCzAlfa: { value: 1 }, uCzChmury: { value: 1 }, uCzCien: { value: new THREE.Vector3(0.72, 0.77, 0.91) },
    };
    if (o.chmury) { this.U.uCloud = o.chmury.tex; this.U.uCloudOff = o.chmury.off; }
    this.mat = stworzMaterial(THREE, this.U, o);
    this.geo = {};
    this.mesh = new THREE.Mesh(this._geo(o.wariant || 'torba'), this.mat);
    this.mesh.frustumCulled = false;                 // linki sięgają barków, deformacja poza bryłą spoczynkową
    this.mesh.castShadow = o.cien !== false;
    this.mesh.receiveShadow = false;
    this.mesh.customDepthMaterial = stworzMaterialCienia(THREE, this.U);
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    scena.add(this.mesh);
    this.o = 0; this.vo = 0; this._lot = false;
    this.vs = V(); this.kurs = 0; this.bank = 0; this.t = 0;
    this.ustawWariant(o.wariant || 'torba');
  }
  _geo(n) { if (!this.geo[n]) this.geo[n] = zbuduj(this.T, n); return this.geo[n]; }
  ustawWariant(n) {
    if (!WARIANTY[n]) n = 'torba';
    const K = WARIANTY[n], U = this.U;
    this.wariant = n; this.K = K;
    this.mesh.geometry = this._geo(n);
    U.uCzWar.value = K.nr; U.uCzSRim.value = K.sKon; U.uCzGrub.value = K.grub;
    U.uCzMarsz.value = K.marsz; U.uCzPolysk.value = K.polysk; U.uCzRim.value = K.rim; U.uCzAlfa.value = K.alfa;
    U.uCzCien.value.fromArray(K.cien);
    // najniższy punkt czaszy (spoczynkowo) — od niego liczymy przerwę nad głową
    let dol = 0; const p = this.mesh.geometry.attributes.position, c = this.mesh.geometry.attributes.aCz;
    for (let i = 0; i < p.count; i++) if (c.getX(i) < 1.5) dol = Math.min(dol, p.getY(i));
    this.dol = dol;
    return n;
  }
  reset() { this.o = 0; this.vo = 0; this._lot = false; this._kursOk = false; this.bank = 0; this.mesh.visible = false; }
  get info() {
    const g = this.mesh.geometry;
    return { wariant: this.wariant, trojkaty: g.userData.trojkaty, wierzcholki: g.attributes.position.count,
             drawCalle: 1, drawCalleCien: this.mesh.castShadow ? 1 : 0, otwarcie: +this.o.toFixed(3), widoczna: this.mesh.visible, przechyl: PRZECHYL };
  }
  // s: { lot, widoczny, pos (Vector3 sprite'a), quat (Quaternion sprite'a), h, top, stopy, nazwa, rel,
  //      camYaw, vx, vz, px (pixel ratio), vpH (wysokość bufora w px), chmury (0/1),
  //      barkL / barkP (opcjonalnie, Vector3 w świecie: zaczepy linek wprost — postać 3D trzyma uchwyty pięściami) }
  update(dt, s) {
    const U = this.U, v = this._v, q = this._q;
    dt = Math.min(Math.max(dt, 0), 0.05);
    this.t += dt;
    // 1. otwarcie: sprężyna (otwiera z przestrzałem, składa krytycznie)
    const cel = s.lot ? 1 : 0;
    if (cel && !this._lot && this.o < 0.05) { this.o = 0; this.vo = 0; }
    this._lot = !!s.lot;
    const w = cel ? 19 : 30, z = cel ? 0.6 : 1.0;
    const n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n;
    for (let i = 0; i < n; i++) { this.vo += (-w * w * (this.o - cel) - 2 * z * w * this.vo) * h; this.o += this.vo * h; }
    if (this.o < 0) { this.o = 0; if (this.vo < 0) this.vo = 0; }
    if (!cel && this.o < 0.02) { this.o = 0; this.vo = 0; }
    // 2. wygładzona prędkość, kurs i przechył w zakręcie
    const kv = Math.min(1, dt * 5);
    this.vs.x += ((s.vx || 0) - this.vs.x) * kv; this.vs.z += ((s.vz || 0) - this.vs.z) * kv;
    const sp = Math.hypot(this.vs.x, this.vs.z), pred = Math.min(1, sp / 9);
    let bankCel = 0;
    if (sp > 0.5) {
      const kurs = Math.atan2(this.vs.x, this.vs.z);
      if (!this._kursOk) { this.kurs = kurs; this._kursOk = true; }   // pierwsza klatka ruchu: bez skoku „prędkości kątowej"
      let dk = kurs - this.kurs; dk -= Math.round(dk / TAU) * TAU;
      this.kurs = kurs;
      if (dt > 0) bankCel = Math.max(-0.3, Math.min(0.3, (dk / dt) * sp * 0.02));
    } else this._kursOk = false;
    this.bank += (bankCel - this.bank) * Math.min(1, dt * 6);
    const widac = this.o > 0.001 && s.widoczny !== false;
    this.mesh.visible = widac;
    if (!widac) return;
    // 3. punkty postaci: czubek głowy i barki w płaszczyźnie pochylonego billboardu
    const K = this.K, B = BARKI[s.nazwa] || BARKI_DOM, H = s.h, vis = (s.top - s.stopy) * H;
    const kBok = 0.45 + 0.55 * Math.abs(Math.cos(s.rel || 0));
    v.glowa.set(0, s.top * H, 0).applyQuaternion(s.quat).add(s.pos);
    if (s.barkL && s.barkP) { v.barkL.copy(s.barkL); v.barkP.copy(s.barkP); }
    else {
      v.barkL.set(-B.x * vis * kBok, s.stopy * H + B.y * vis, 0).applyQuaternion(s.quat).add(s.pos);
      v.barkP.set(B.x * vis * kBok, s.stopy * H + B.y * vis, 0).applyQuaternion(s.quat).add(s.pos);
    }
    // 4. położenie czaszy: nad głową, wyprzedza lot, przy otwieraniu wyskakuje od głowy w górę
    const ko = Math.min(1, this.o), t = this.t;
    const pos = this.mesh.position;
    pos.copy(v.glowa);
    pos.y += K.przerwa - this.dol - (1 - ko) * 0.6 + Math.sin(t * 2.6) * 0.03;
    // wyprzedzenie: w bok ekranu pełne, „do kamery" prawie zero — inaczej przy locie ku kamerze czasza
    // zjeżdżała na ekranie w dół, na głowę postaci
    const lead = Math.min(0.3, sp * 0.035);
    if (sp > 1e-3) {
      const sy = Math.sin(s.camYaw), cy = Math.cos(s.camYaw), lx = this.vs.x / sp * lead, lz = this.vs.z / sp * lead;
      const lr = lx * cy - lz * sy, lf = -lx * sy - lz * cy, lf2 = lf > 0 ? lf : lf * 0.15;   // prawo / od kamery
      pos.x += cy * lr - sy * lf2; pos.z += -sy * lr - cy * lf2;
    }
    // 5. obrót: yaw kamery (jak sprite'y) × wychył w kierunku lotu × przechył w zakręcie × wahadło
    q.y.setFromAxisAngle(this._AY, s.camYaw + Math.sin(t * 1.1) * 0.04);
    if (sp > 1e-3) { v.ax.set(this.vs.z / sp, 0, -this.vs.x / sp); v.dir.set(this.vs.x / sp, 0, this.vs.z / sp); }
    else { v.ax.set(1, 0, 0); v.dir.set(0, 0, 1); }
    q.t.setFromAxisAngle(v.ax, pred * PRZECHYL);
    q.b.setFromAxisAngle(v.dir, -this.bank);
    // „pokaz" do kamery: lekkie pochylenie czubka ku kamerze (jak SPRITE_TILT u postaci) — bez tego płaski liść
    // z kamery za plecami był cienkim paskiem, a wychył w kierunku lotu „od kamery" chował wierzch czaszy
    q.k.setFromAxisAngle(this._AX, K.ku);
    q.s.setFromAxisAngle(this._AZ, Math.sin(t * 1.7 + 0.6) * 0.045);   // wahadło
    const quat = this.mesh.quaternion;
    quat.copy(q.b).multiply(q.t).multiply(q.y).multiply(q.k).multiply(q.s);
    this.mesh.updateMatrixWorld(true);
    // 6. barki → układ czaszy; wiatr względny → układ czaszy
    this._m.copy(this.mesh.matrixWorld).invert();
    U.uCzBarkL.value.copy(v.barkL).applyMatrix4(this._m);
    U.uCzBarkR.value.copy(v.barkP).applyMatrix4(this._m);
    q.inv.copy(quat).invert();
    v.wiatr.set(-this.vs.x, 0, -this.vs.z).applyQuaternion(q.inv);
    const lw = Math.hypot(v.wiatr.x, v.wiatr.z);
    if (lw > 1e-4) U.uCzWiatr.value.set(v.wiatr.x / lw, 0, v.wiatr.z / lw); else U.uCzWiatr.value.set(0, 0, 0);
    U.uCzOtw.value = this.o;
    U.uCzPred.value = pred;
    const px = s.px || 1;
    U.uCzVpH.value = s.vpH || 800;
    U.uCzGrubMin.value = K.grubMin * px;
    U.uCzKont.value = 1.25 * px;
    U.uCzChmury.value = s.chmury == null ? 1 : s.chmury;
  }
  dispose() {
    this.mesh.parent && this.mesh.parent.remove(this.mesh);
    for (const g of Object.values(this.geo)) g.dispose();
    this.mat.dispose(); this.mesh.customDepthMaterial.dispose();
  }
}
