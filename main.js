// HORDA 3D v4 — teren 3D + kamera za plecami + meta-progresja (monety/sklep)
import * as THREE from './lib/three.module.js';
import { SPRITEDATA } from './spritedata.js?v=11';
import { icon, iconObrys, ico } from './icons.js?v=9';
import { AUDIO } from './audio.js?v=8';            // muzyka wg fazy gry + kwestie głosowe + efekty
import { initKomiks, pokazKomiks } from './komiks.js?v=2';   // komiks wprowadzający (Etap 2)
import { generujSzkielet, siatkaGalezi, RNG } from './lib/drzewa-szkielet.js?v=2';
import { wczytajModeleNatury } from './lib/modele-natura.js?v=2';
import * as TW from './lib/teren-wawozy.js?v=2';   // mapa „Wąwozy": wysokość, rzeki, pułapki   // krzaki/kwiaty/głazy Quaternius (CC0)   // drzewa v5: szkielet gałęzi (pochodna ez-tree, MIT)
import * as TO from './lib/teren-osiedle.js?v=2';  // mapa „Osiedle": układ kwartałów, maska gruntu, pole przepływu hordy
// MODELE OSIEDLA — JEDNO MIEJSCE PRZEŁĄCZENIA. Dziś zaślepki (proste bryły); gdy dojdzie docelowy moduł
// (ten sam kontrakt), zamień ścieżkę na './lib/osiedle-rekwizyty.js'. Reszta kodu woła tylko `OSR.*`.
import * as OSR from './lib/osiedle-rekwizyty.js?v=2';   // 30.09: prawdziwe modele (zaślepki: lib/osiedle-zaslepki.js)
import * as MS from './lib/modele-skrzynie.js?v=1';     // 30.09: skrzynie i kapliczki 3D (sekcja „SKRZYNIE I KAPLICZKI 3D" niżej)
import * as ML from './lib/modele-laki.js?v=1';         // 30.09: stosy skrzyń, podesty, schody na Łąkach/Wąwozach (sekcja „ŁĄKI — MODELE 3D")
import * as MM from './lib/modele-market.js?v=2';       // 30.09: Market — modele, atlas towaru, posadzka w shaderze (sekcja „MARKET — PRZEBUDOWA")
import * as UM from './lib/uklad-marketu.js?v=2';       // 30.09: Market — układ chunka (strefy, alejki, hale, plamy)

// ============================== JĘZYK (PL / EN) ==============================
// Decyzja właściciela (18.09): dwa języki, start w języku przeglądarki, przełącznik w menu,
// głosy zostają polskie. Jeden helper `T(pl, en)` zamiast słownika z kluczami: gra ma
// ~300 tekstów rozsianych po szablonach HTML w JS, a para „obok siebie" jest odporna
// na literówki w kluczach i czytelna w diffie. Etykiety w index.html: atrybuty
// `data-pl` / `data-en` (+ opcjonalny `data-attr`) i `zastosujJezyk()`.
//
// DLACZEGO TEN BLOK STOI NA SAMEJ GÓRZE PLIKU: rejestry MAPS, CHARS, WEAPONS,
// ENEMY_TYPES, PASSIVES, REPEAT, SHOP, PORADY to statyczne obiekty ewaluowane RAZ,
// przy wczytaniu modułu — więc `T()` musi już wtedy istnieć i znać język. `META`
// powstaje dopiero ~2700 linii niżej, dlatego język czytamy wprost z localStorage
// (ten sam klucz, co `META_KEY`), z fallbackiem na język przeglądarki.
// Zmiana języka = zapis do META + `location.reload()` (patrz `ustawJezyk`) —
// świadomie prosto, zamiast przerysowywania dwustu miejsc na żywo.
const JEZYK = { cur: 'pl' };
{
  const zPrzegladarki = () => ((navigator.language || 'pl').toLowerCase().startsWith('pl') ? 'pl' : 'en');
  let l = '';
  try { l = (JSON.parse(localStorage.getItem('horda3d_meta_v1') || '{}') || {}).lang || ''; } catch { l = ''; }
  JEZYK.cur = (l === 'pl' || l === 'en') ? l : zPrzegladarki();
}
const T = (pl, en) => (JEZYK.cur === 'en' && en != null ? en : pl);
function zastosujJezyk(root = document) {
  const en = JEZYK.cur === 'en';
  root.querySelectorAll('[data-pl]').forEach(el => {
    const v = en ? el.dataset.en : el.dataset.pl;
    if (v == null) return;
    if (el.dataset.attr) el.setAttribute(el.dataset.attr, v); else el.innerHTML = v;
  });
  document.documentElement.lang = JEZYK.cur;
}

// ============================== USTAWIENIA ==============================
// 1/55 → 1/46 = WSZYSTKIE postacie o ~20% większe (życzenie właściciela 03.09:
// „zwiększ wszystkie postacie tak o 20%, by były widoczniejsze"). Skala siedzi
// w jednej stałej, bo footY, cień i kopia gracza liczą się z tego samego PX2U.
const PX2U = 1 / 46;
const WORLD_R = 130;
// kamera: na wąskim/niskim ekranie (telefon poziomo) mocno bliżej postaci
let CAM_DIST = 9.2, CAM_H = 6.4;
function fitCamera() {
  const wys = innerHeight, poziomo = innerWidth > innerHeight;
  if (poziomo && wys <= 560) { CAM_DIST = 3.6; CAM_H = 4.3; camera.fov = 60; }   // telefon poziomo
  else if (wys <= 560) { CAM_DIST = 5.0; CAM_H = 5.4; camera.fov = 58; }
  else if (innerWidth <= 520) { CAM_DIST = 5.5; CAM_H = 5.8; camera.fov = 58; }  // telefon pionowo
  else { CAM_DIST = 6.8; CAM_H = 7.0; camera.fov = 58; }                          // desktop
  camera.updateProjectionMatrix();
}
const DIR_ROWS = ['south','south-east','east','north-east','north','north-west','west','south-west'];
let camYaw = 0;                                    // obrót kamery wokół gracza

// ============================== MAPY ==============================
const MAPS = {
  laki:   { nm: T('Łąki', 'Meadows'), ico: 'laka',
            ds: T('Otwarty teren, jeziora, mesy do wskakiwania', 'Open ground, lakes, mesas to hop onto'),
            sky: 0x9cc8ec, fog: [80, 190], water: true, indoor: false, price: 0 },
  // 30.09: czwarta mapa, KOLEJNOŚĆ OBIEKTU = kolejność w menu (Łąki → Osiedle → Wąwozy → Market).
  // Płaski teren, kwartały bloków z podwórkami — generator w lib/teren-osiedle.js, wpięcie: „MAPA OSIEDLE" niżej.
  osiedle: { nm: T('Osiedle', 'The Block'), ico: 'dom',
            ds: T('Bloki z wielkiej płyty, podwórka i ciasne przejścia', 'Concrete blocks, courtyards and tight passages'),
            sky: 0xb3cde6, fog: [50, 140], water: false, indoor: false, osiedle: true, price: 0 },
  wawozy: { nm: T('Wąwozy', 'Ravines'), ico: 'laka',
            ds: T('Kaniony z rzekami na dnie, urwiska, nurt i osuwiska',
                  'Canyons with rivers below, cliffs, currents and landslides'),
            sky: 0x9cc8ec, fog: [80, 190], water: true, indoor: false, rzeki: true, price: 0 },
  market: { nm: T('Market', 'Supermarket'), ico: 'market',
            ds: T('Ciasne alejki, regały, śliska rozlana woda', 'Tight aisles, shelves, slippery spills'),
            sky: 0xefe9df, fog: [34, 95], water: false, indoor: true, price: 0 },   // 30.09: ciepła, jasna hala (było 0xb8bfc7)
};
let mapKey = 'laki';

// ============================== POSTACIE ==============================
const CHARS = {
  // ===== VEGGIE FAMIGLIA (statystyki wg biblii postaci v1.1) =====
  carrotello: { nm: 'Carrotello Squattello',
                ds: T('Marchewino Dresino — szybki, ogromny magnes. Starter.',
                      'The tracksuit carrot — fast, huge magnet. Your starter.'),
                // dmg 0.9 → 1.0: jedyna postać w grze z KARĄ do obrażeń była
                // jednocześnie tą, którą gra się na starcie. Jej tożsamość to
                // szybkość (1.15) i magnes (1.3), nie słabsze ciosy.
                char: 'carrotello_squattello', price: 0, spd: 1.15, hp: 0, dmg: 1.0, mag: 1.3, scale: 1.22,
                // E2 K8 (spec §6): reguła postaci — kafelek i scenka menu pod `ds`
                regula: T('Wszechstronny: +1 przelosowanie kart na bieg', 'All-rounder: +1 card reroll per run') },
  // Beetino idzie za ZABÓJSTWA, nie za monety (250 monet uzbierało się już
  // w drugim biegu, więc jako zakup nie był żadnym celem).
  // PRÓG 450 = TRZECI BIEG. Zmierzona ścieżka nowego gracza: bieg 1 ≈ 60 zabójstw,
  // bieg 2 ≈ 150, bieg 3 ≈ 250 → łącznie ~460. Nagroda ma przyjść, GDY GRACZ
  // JESZCZE NIE WIE, czy zostaje — nie po ośmiu biegach.
  beetino:    { nm: 'Beetino Bouncerino',
                ds: T('Buraczino Betonino — czołg z bramki. Poniżej połowy serc wysysa życie.',
                      'The beetroot bouncer — a tank on the door. Below half hearts he drains life.'),
                char: 'beetino_bouncerino', price: 0, killGoal: 450, startWpn: 'wypad',
                spd: 0.85, hp: 3, dmg: 1.1, mag: 0.9, scale: 1.32,
                regula: T('Buraczane Ciśnienie: poniżej połowy serc wysysa życie', 'Beet Pressure: below half hearts he drains life') },
  // Statystyki wprost z biblii postaci (HP 110 · Speed 0.9 · Might 1.0 · Pickup 1.1).
  // Postac DO KUPIENIA: przy nowej ekonomii 700 monet wypada na ~6. biegu, czyli
  // dokladnie tam, gdzie mial byc drugi przystanek progresji.
  // Radishetta Razoretta — szybka i krucha: seria scyzorykow przed siebie.
  // Cena 500: ma wpasc miedzy Beetina (450 zabojstw) a Granny (700 monet).
  razoretta:  { nm: 'Radishetta Razoretta',
                ds: T('Rzodkiewka z piornikiem — seria scyzorykow, ale cienka skora.',
                      'Radish with a pencil case — a volley of knives, but paper-thin skin.'),
                char: 'radishetta_razoretta', price: 500, startWpn: 'scyzoryk',
                spd: 1.2, hp: -1, dmg: 1.25, mag: 1.0, scale: 1.2,
                regula: T('Szklane ostrze: 4 serca; każdy krytyk dokłada nóż do następnej serii (do +3)', 'Glass blade: 4 hearts; every crit adds a knife to your next volley (up to +3)') },
  granny:     { nm: 'Granny Smithella',
                ds: T('Babuszkina Jabłuszkina — kapeć wraca jak bumerang.',
                      'Nonna apple herself — the slipper comes back like a boomerang.'),
                char: 'granny_smithella', price: 700, startWpn: 'ciabatta',
                spd: 0.9, hp: 1, dmg: 1.0, mag: 1.1, scale: 1.28,
                regula: T('Babcia wie lepiej: po każdym kapralu dodatkowa karta', 'Nonna knows best: an extra card after every corporal') },
  // PIERWSZA POSTAC Z AKTYWNA UMIEJETNOSCIA (dotad rozniły sie tylko statystykami
  // i bronia startowa). Startuje ze Skarpeta, bo cala jego tozsamosc to smrod:
  // bron truje pasywnie, a `KeyG` odpycha horde. Cena 900 = kolejny przystanek
  // po Granny (700), czyli powod, zeby grac dalej po wykupieniu poprzedniej.
  garlicino:  { nm: 'Garlicino Stinkerino',
                ds: T('Czosnkino Smrodino — na zadanie odpycha horde smrodliwa aura.',
                      'The garlic stinker — on demand, a reeking aura shoves the horde.'),
                char: 'garlicino_stinkerino', price: 900, startWpn: 'skarpeta',
                spd: 1.0, hp: 1, dmg: 1.0, mag: 1.05, scale: 1.22,
                regula: T('Smród: na żądanie odpycha hordę smrodliwą aurą', 'Stink: on demand, a reeking aura shoves the horde') },
};
// ============================== PORTRETY ==============================
// RENDERY HD: duże obrazki (~280×420) trzech postaci — używane w scence menu
// i na kafelkach w zakładce Postacie. Dla pozostałych wchodzi `portret()`.
//
// Pliki były przesunięte o jedno (w „carrotello" siedział burak itd.) — 18.09 przemianowane
// u źródła (`git mv`), więc nazwa pliku = postać. Nowy render = nowy wpis tutaj.
// `?v=2` = cache-bust po przemianowaniu: przeglądarka trzymała pod starą nazwą stary obrazek
const RENDER_PORTRET = {
  carrotello: 'assets/portrety/render_carrotello.png?v=2',
  beetino:    'assets/portrety/render_beetino.png?v=2',
  razoretta:  'assets/portrety/render_razoretta.png?v=2',
};
// portret postaci = pierwsza klatka `idle` w kierunku „south", PRZYCIĘTA PO ALFIE.
//
// DLACZEGO AUTO-PRZYCIĘCIE, A NIE STAŁY PROSTOKĄT (zgłoszenie właściciela 18.09):
// dotąd braliśmy sztywne 52%×62% ramki od 20% wysokości — proporcje dobrane do
// STARYCH arkuszy (Rudeusz). Na arkuszach Veggie (124 px, inne sylwetki) ten
// prostokąt ucinał Beetinowi nać, Granny kosz i ręce, a Razorettcie scyzoryk.
// Teraz liczymy prostokąt otaczający nieprzezroczyste piksele, dokładamy 3 px
// marginesu i wyrównujemy do KWADRATU (krótszy bok wyśrodkowany) — postać wchodzi
// w kadr od czubka do stóp, niezależnie od arkusza.
//
// Wynik ma stały bok (domyślnie 96 px), żeby wszystkie kafelki miały ten sam kadr;
// skalowanie jest nearest (`imageSmoothingEnabled = false`), więc nic się nie rozmywa.
const portretCache = new Map();
function portret(charName, bok = 96) {
  const klucz = charName + '@' + bok;
  if (portretCache.has(klucz)) return portretCache.get(klucz);
  const def = SPRITEDATA[charName];
  const img = LIB[charName] && LIB[charName].img;
  if (!img) return '';
  const s = def.size;
  const a = def.anims.idle || def.anims.walk || def.anims.run;
  const row = a.rows.south ?? 0;
  // 1. pierwsza klatka rzędu do bufora (klatki leżą wzdłuż X, rzędy wzdłuż Y)
  const buf = document.createElement('canvas');
  buf.width = s; buf.height = s;
  const bg = buf.getContext('2d', { willReadFrequently: true });
  bg.imageSmoothingEnabled = false;
  bg.drawImage(img, 0, row * s, s, s, 0, 0, s, s);
  // 2. prostokąt otaczający piksele o alfie > 16 (16, nie 0 — arkusze mają
  //    pojedyncze prawie przezroczyste piksele po skalowaniu w PixelLabie)
  let x0 = s, y0 = s, x1 = -1, y1 = -1;
  try {
    const px = bg.getImageData(0, 0, s, s).data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        if (px[(y * s + x) * 4 + 3] > 16) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
  } catch (e) { /* splamione płótno — zostaje kadr całej klatki */ }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = s - 1; }    // pusta klatka: bierz wszystko
  const m = 3;                                      // oddech dookoła postaci
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
  x1 = Math.min(s - 1, x1 + m); y1 = Math.min(s - 1, y1 + m);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const k = Math.max(w, h);                         // bok kwadratu = dłuższy wymiar
  // 3. kwadrat (krótszy bok wyśrodkowany) → docelowy rozmiar, nearest
  const c = document.createElement('canvas');
  c.width = bok; c.height = bok;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const skala = bok / k;
  g.drawImage(buf, x0, y0, w, h,
    Math.round((k - w) / 2 * skala), Math.round((k - h) / 2 * skala),
    Math.round(w * skala), Math.round(h * skala));
  const url = c.toDataURL();
  portretCache.set(klucz, url);
  return url;
}
let charKey = 'carrotello';

// ============================== TEREN (value noise) ==============================
function hash2(ix, iz) {
  let n = ix * 374761393 + iz * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967295;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
// MESY — strome płaskowyże-platformy (wskakujesz, horda wspina się powoli)
function mesaH(x, z) {
  const C = 90;                                  // komórka siatki mes
  const cx = Math.floor(x / C), cz = Math.floor(z / C);
  if (hash2(cx * 3 + 11, cz * 3 + 7) < 0.5) return 0;   // nie każda komórka ma mesę
  const mx = (cx + 0.3 + 0.4 * hash2(cx + 5, cz + 9)) * C;
  const mz = (cz + 0.3 + 0.4 * hash2(cx + 17, cz + 3)) * C;
  const r = 9 + 6 * hash2(cx + 2, cz + 13);
  const d = Math.hypot(x - mx, z - mz);
  if (d > r) return 0;
  const t = 1 - d / r;
  const s = Math.min(1, t / 0.32);               // strome zbocze, płaski wierzch
  return (4 + 3 * hash2(cx + 8, cz + 21)) * s * s * (3 - 2 * s);
}
function terrainH(x, z) {
  if (MAPS[mapKey].indoor || MAPS[mapKey].osiedle) return 1.55;   // market i osiedle: idealnie płasko
  if (MAPS[mapKey].rzeki) return TW.wysokosc(x, z);  // Wąwozy: osobny generator (lib/teren-wawozy.js)
  const raw = 5.4 * vnoise(x / 40 + 37.7, z / 40 + 11.3)
            + 1.6 * vnoise(x / 14 + 91.1, z / 14 + 55.5) - 1.15;
  const r = Math.hypot(x, z);
  const f = Math.min(1, Math.max(0, (r - 6) / 14));
  return (raw + mesaH(x, z)) * f + 1.55 * (1 - f);   // start płaski, NAD wodą
}
const WATER_Y = 0.75;                            // doliny poniżej = jeziora
const CHUNK_SEG_S = 2;                           // krok siatki terenu = CHUNK / CHUNK_SEG (40/20)
// ═══ WYSOKOŚĆ, JAKĄ NAPRAWDĘ RYSUJE SIATKA CHUNKA ═══
// `terrainH` to funkcja ANALITYCZNA, a rysowana ziemia to PlaneGeometry(CHUNK, CHUNK, CHUNK_SEG,
// CHUNK_SEG), czyli wierzchołki co 2 j. połączone PŁASKIMI trójkątami. Na łagodnej łące różnica
// jest niewidoczna, ale na ścianie kanionu (spadek 21 j. na 2,5 j.) siatka ścina róg i wszystko,
// co posadzone na `terrainH`, zostaje WISZĄCE NAD PUSTKĄ. Zmierzone na Wąwozach: z ~23 tys. kępek
// trawy w promieniu 52 j. ok. 890 wisiało >0,5 j., 395 >2 j., rekord 11 j. — pas zielonych kępek
// kopiujący krawędź kanionu (właściciel widział to jako „zielone głazy w powietrzu").
// Wierzchołki siatki stoją na PARZYSTYCH współrzędnych (wx0 = cx·40, plan od −20 co 2), więc
// siatka globalna co 2 j. trafia w nie dokładnie. Interpolacja dwuliniowa, a potem `Math.min`
// z wartością analityczną — kępka może się tylko WCISNĄĆ w ziemię, nigdy unieść.
const SIATKA_S = CHUNK_SEG_S;                      // krok siatki terenu w jednostkach (2 j.)
function gruntSiatki(x, z) {
  const x0 = Math.floor(x / SIATKA_S) * SIATKA_S, z0 = Math.floor(z / SIATKA_S) * SIATKA_S;
  const u = (x - x0) / SIATKA_S, v = (z - z0) / SIATKA_S;
  const a = terrainH(x0, z0), b = terrainH(x0 + SIATKA_S, z0);
  const c = terrainH(x0, z0 + SIATKA_S), d = terrainH(x0 + SIATKA_S, z0 + SIATKA_S);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// wysokość do SADZENIA obiektów: nigdy powyżej tego, co widać
function gruntDoSadzenia(x, z) { return Math.min(terrainH(x, z), gruntSiatki(x, z)); }

// CACHE WĘZŁÓW SIATKI dla pola trawy. Bez niego każde źdźbło kosztowałoby 5 wywołań `terrainH`
// zamiast 1, a przebudowa pola to ~23 tys. źdźbeł (dziś ~9,6 ms) — na Wąwozach, gdzie `terrainH`
// jest ~6× droższe, dałoby to sekundowe zadławienie. Tak jest TANIEJ NIŻ DZIŚ: 3 tys. wywołań
// na całą przebudowę zamiast 23 tys., bo źdźbła współdzielą węzły.
let _scX = 0, _scZ = 0, _scN = 0, _scH = null;
function siatkaCache(cx, cz, r) {
  const x0 = Math.floor((cx - r) / SIATKA_S) * SIATKA_S, z0 = Math.floor((cz - r) / SIATKA_S) * SIATKA_S;
  const n = Math.ceil(2 * r / SIATKA_S) + 2;
  if (!_scH || _scH.length < n * n) _scH = new Float32Array(n * n);
  _scX = x0; _scZ = z0; _scN = n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) _scH[j * n + i] = terrainH(x0 + i * SIATKA_S, z0 + j * SIATKA_S);
}
// nachylenie (tangens) z tych samych węzłów cache — do odsiewu trawy ze ścian skalnych
function nachylenieZCache(x, z) {
  const i = Math.floor((x - _scX) / SIATKA_S), j = Math.floor((z - _scZ) / SIATKA_S), n = _scN;
  if (i < 0 || j < 0 || i + 1 >= n || j + 1 >= n) return 0;
  const a = _scH[j * n + i], b = _scH[j * n + i + 1], c = _scH[(j + 1) * n + i], d = _scH[(j + 1) * n + i + 1];
  return Math.hypot((b - a + d - c) * 0.5, (c - a + d - b) * 0.5) / SIATKA_S;
}
function gruntZCache(x, z) {
  const fi = (x - _scX) / SIATKA_S, fj = (z - _scZ) / SIATKA_S;
  const i = Math.floor(fi), j = Math.floor(fj);
  if (i < 0 || j < 0 || i + 1 >= _scN || j + 1 >= _scN) return gruntDoSadzenia(x, z);
  const u = fi - i, v = fj - j, n = _scN;
  const a = _scH[j * n + i], b = _scH[j * n + i + 1], c = _scH[(j + 1) * n + i], d = _scH[(j + 1) * n + i + 1];
  const siatka = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  const h = terrainH(x, z);
  return h < siatka ? h : siatka;
}

// LUSTRO WODY W DANYM PUNKCIE. Na Łąkach jest jedno, na stałej wysokości (jeziora w dolinach),
// na Wąwozach rzeki płyną W DÓŁ, więc poziom zależy od miejsca. Market nie ma wody — zwracamy
// głęboki minus, żeby wszystkie testy „czy nad wodą" wychodziły na sucho bez dodatkowych ifów.
function wodaY(x, z) {
  const M = MAPS[mapKey];
  if (!M.water) return -999;
  return M.rzeki ? TW.poziomWody(x, z) : WATER_Y;
}
const biome = (x, z) => vnoise(x / 62 + 7.7, z / 62 + 3.3);  // 0=las, 1=sucha łąka

// ============================== TRYB DEWELOPERSKI ==============================
// Recznie wycinanie debugu przed kazdym wydaniem to gwarancja, ze kiedys sie zapomni
// (albo, co gorsza, wyciagnie sie za duzo i `tester-gry` przestanie dzialac).
// Podglad i agenci chodza po localhoscie, wiec na localhoscie DEV jest wlaczony,
// a GitHub Pages / Capacitor / Steam dostaja wersje bez `window.HORDA`, bez lapacza
// bledow i bez pola na kody. `?dev=1` wlacza go recznie do diagnostyki na telefonie.
// ⚠️ PORT JEST TU KLUCZOWY, nie sama nazwa hosta. Pierwsza wersja tej flagi
// (13.08) sprawdzala `hostname === 'localhost' || hostname === ''` i przez to
// WLACZALA DEV DOKLADNIE TAM, GDZIE MIALA GO WYLACZYC:
//   • Capacitor na Androidzie serwuje z `http://localhost` (bez portu),
//   • Electron / webview Steama laduje z `file://`, czyli `hostname === ''`.
// Czyli `window.HORDA` z edytowalnym `META.coins` i pole na kod jechalyby na
// telefony i na Steama. Nasz podglad chodzi na porcie 8123 — to on rozstrzyga.
const DEV = location.search.includes('dev=1')
  || ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      && location.port === '8123');

// ============================== STATYSTYKI GRACZY (GoatCounter) ==============================
// Decyzja właściciela (18.09): „potrzebuję statystyk, ile osób zagrało". GoatCounter =
// darmowy, bez ciasteczek i bez zgody RODO, jeden skrypt. Odsłona strony liczy się sama
// (unikalni gracze), a my dokładamy ZDARZENIA: start biegu (postać/mapa) i koniec biegu
// (powód + kubełek minut). Kardynalność ścieżek jest mała celowo — GoatCounter grupuje
// po `path`, więc każdy wariant to osobny licznik w panelu.
// `kod` = nazwa konta, np. 'veggie' dla https://veggie.goatcounter.com — WPISUJE
// WŁAŚCICIEL po założeniu konta. Pusty kod = nic nie ładujemy, gra działa normalnie.
// `allow_frame: true` jest KONIECZNE: itch.io uruchamia grę w iframe, a domyślnie
// count.js nie liczy w ramce. Na DEV (port 8123) nie liczymy nic.
const STATY = {
  kod: 'veggiefaniglia',                           // konto właściciela (18.09) → https://veggiefaniglia.goatcounter.com
  kolejka: [],
  log: [],                                         // E1-bieg K9: DEV — log wywołań zamiast wysyłki (HORDA.gc)
  zdarzenie(sciezka, tytul = '') {
    if (DEV) {
      let t = 0; try { t = +G.time.toFixed(1); } catch { /* G jeszcze nie istnieje (start) */ }
      STATY.log.push({ t, path: sciezka, title: tytul }); if (STATY.log.length > 200) STATY.log.shift();
      return;
    }
    if (!STATY.kod) return;
    STATY.kolejka.push({ path: sciezka, title: tytul, event: true });
    STATY.wyslij();
  },
  wyslij() {
    const gc = window.goatcounter;
    if (!gc || typeof gc.count !== 'function') return;     // skrypt jeszcze się ładuje — poczeka w kolejce
    while (STATY.kolejka.length) {
      const z = STATY.kolejka.shift();
      try { gc.count(z); } catch { STATY.kolejka.length = 0; }
    }
  },
  start() {
    if (!STATY.kod || DEV) return;
    // `allow_local: true` — Capacitor na Androidzie serwuje z `http://localhost` (bez portu,
    // więc to NIE jest DEV) i bez tej flagi count.js po cichu odrzucałby wszystko z telefonów
    window.goatcounter = { allow_frame: true, allow_local: true, endpoint: `https://${STATY.kod}.goatcounter.com/count` };
    const s = document.createElement('script');
    s.async = true; s.src = 'https://gc.zgo.at/count.js';
    s.onload = () => STATY.wyslij();
    s.onerror = () => { STATY.kolejka.length = 0; };        // adblock — trudno, gra bez statystyk
    document.head.appendChild(s);
  },
};
// kubełek minut do ścieżki zdarzenia „koniec biegu" (0-1, 1-2, …, 10+)
const kubelekMinut = t => t >= 600 ? '10+' : Math.floor(t / 60) + '-' + (Math.floor(t / 60) + 1);
STATY.start();
window.STATY = STATY;                              // PWA (`appinstalled`) woła STATY.zdarzenie z innego miejsca

// ============================== „POSTAW KAWĘ AUTOROWI GRY" (dawniej „POSTAW MI KAWĘ") ==============================
// Życzenie właściciela (18.09). Link WPISUJE WŁAŚCICIEL (buycoffee.to / Ko-fi / suppi);
// pusty = przycisk schowany. Klik liczy się jako zdarzenie w statystykach.
const KAWA_URL = 'https://buycoffee.to/piotr.korona';   // ten sam link co w K-OS (SPEC-K-OS.md)
// B12: w APLIKACJI ze sklepu zewnętrzny link do płatności łamie zasady Google Play / App Store (tam wsparcie przez IAP
// „Bez reklam") — prośba o kawę TYLKO w wersji web. Dziś apki nie ma, więc zawsze false; w buildzie Capacitora
// `window.Capacitor.isNativePlatform()` zwróci true i prośba zniknie bez zmian w kodzie.
const JEST_APKA = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
{
  const k = document.getElementById('kawaBtn');
  if (k) {
    if (KAWA_URL && !JEST_APKA) { k.href = KAWA_URL;   // B12: w aplikacji ze sklepu bez linku do płatności
      k.style.display = ''; k.onclick = () => STATY.zdarzenie('kawa', 'Klik: postaw kawę'); }
    else k.style.display = 'none';
  }
}

// ============================== SCENA ==============================
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
// Rozdzielczość natywna — sprite'y są JUŻ pixel-artem, downsampling by je psuł.
// (PIXEL_SCALE > 1 = eksperymentalna pikselizacja całego 3D; domyślnie wyłączona)
let PIXEL_SCALE = 1;
function applyResolution() {
  if (PIXEL_SCALE <= 1) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    canvas.style.imageRendering = 'auto';
    return;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(Math.ceil(innerWidth / PIXEL_SCALE), Math.ceil(innerHeight / PIXEL_SCALE), false);
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.imageRendering = 'pixelated';
}
applyResolution();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc8ec);
scene.fog = new THREE.Fog(0x9cc8ec, 80, 190);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);

scene.add(new THREE.HemisphereLight(0xd8ecff, 0x3e6b2f, 0.85));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.35);
sun.position.set(45, 70, 25);
scene.add(sun);
scene.add(sun.target);

// ---- PRAWDZIWE CIENIE (shadow map słońca, ramka podąża za graczem) ----
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// PETER-PANNING: bias -0.0014 przy ramce 84 j. odklejal cien od obiektu o ~23 cm
// (zmierzone przez grafika) — obiekty wygladaly, jakby lekko unosily sie nad ziemia.
// `normalBias` robi te sama robote BEZ odklejania, wiec ciezar przenosimy na niego.
sun.shadow.bias = -0.00018;
sun.shadow.normalBias = 0.045;
{
  const d = 42;                                    // obszar objęty cieniami wokół gracza
  const sc = sun.shadow.camera;
  sc.left = -d; sc.right = d; sc.top = d; sc.bottom = -d;
  sc.near = 1; sc.far = 220;
  sc.updateProjectionMatrix();
}
const SUN_OFF = new THREE.Vector3(38, 60, 26);     // kierunek padania promieni
// SNAPOWANIE DO TEKSELA. Ramka cienia jechala DOKLADNIE za graczem, wiec przy kazdym
// kroku cala mapa cieni przesuwala sie o ulamek teksela i krawedzie „pelzaly"
// (migotanie zauwazalne zwlaszcza na cieniach drzew). Teraz srodek ramki skacze
// pelnymi tekselami — obraz stoi, a cien i tak jest tam, gdzie ma byc.
const TEKSEL = (2 * 42) / 2048;                    // szerokosc ramki / rozdzielczosc mapy
function updateSun(x, z) {
  const sx = Math.round(x / TEKSEL) * TEKSEL, sz = Math.round(z / TEKSEL) * TEKSEL;
  sun.position.set(sx + SUN_OFF.x, SUN_OFF.y, sz + SUN_OFF.z);
  sun.target.position.set(sx, 0, sz);
  sun.target.updateMatrixWorld();
}

// ============================== NIEBO Z GRADIENTEM ==============================
// Kopuła jeżdżąca za kamerą (r=1 × skala 300 przy camera.far = 400). `fog:false`,
// `depthWrite:false` i renderOrder −1000 → rysuje się PIERWSZA i nie wchodzi nikomu
// w z-bufor. KOLOR DOLNY MUSI RÓWNAĆ SIĘ `scene.fog.color` (czyli `MAPS[...].sky`),
// inaczej dalekie wzgórza wtapiają się w inny kolor niż niebo za nimi = szew.
// Gradient jest KWANTOWANY na pasy — gładkie przejście wygląda jak z Unity,
// a nie jak tło pixel-artowej gry.
const SKY = {
  laki:   { dol: 0x9cc8ec, srodek: 0x7fb6e6, gora: 0x4a86cf, slonce: 0xfff0c4, pasy: 16 },
  // osiedle: jaśniejsze, lekko zamglone niebo nad blokami (dół = MAPS.osiedle.sky = kolor mgły)
  osiedle: { dol: 0xb3cde6, srodek: 0x8dbbe6, gora: 0x5189cc, slonce: 0xffe7bd, pasy: 16 },
  market: { dol: 0xefe9df, srodek: 0xebe4d8, gora: 0xe3dacb, slonce: 0xfff6e6, pasy: 0 },
};
const skyU = {
  uDol:    { value: new THREE.Color(SKY.laki.dol) },
  uSrodek: { value: new THREE.Color(SKY.laki.srodek) },
  uGora:   { value: new THREE.Color(SKY.laki.gora) },
  uSlonce: { value: new THREE.Color(SKY.laki.slonce) },
  uSunDir: { value: SUN_OFF.clone().normalize() },
  uPasy:   { value: SKY.laki.pasy },
};
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uDol, uSrodek, uGora, uSlonce, uSunDir;
    uniform float uPasy;
    varying vec3 vDir;
    void main() {
      float h = clamp(vDir.y, -0.2, 1.0);
      float hq = uPasy > 0.5 ? floor(h * uPasy + 0.5) / uPasy : h;   // pasy zamiast gładzi
      vec3 col = mix(uDol, uSrodek, smoothstep(0.00, 0.24, hq));
      col = mix(col, uGora,        smoothstep(0.20, 0.80, hq));
      float sd = max(dot(vDir, normalize(uSunDir)), 0.0);            // ciepła poświata od słońca
      col = mix(col, uSlonce, pow(sd, 7.0) * 0.55);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
}));
skyDome.scale.setScalar(300);
skyDome.frustumCulled = false;
skyDome.renderOrder = -1000;
scene.add(skyDome);
function setSky(key) {
  const S = SKY[key] || SKY.laki;
  skyU.uDol.value.setHex(S.dol);
  skyU.uSrodek.value.setHex(S.srodek);
  skyU.uGora.value.setHex(S.gora);
  skyU.uSlonce.value.setHex(S.slonce);
  skyU.uPasy.value = S.pasy;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  applyResolution();
  fitCamera();
  if (typeof przeliczWylot === 'function') przeliczWylot();   // wylot lufy zmienia miejsce z rozmiarem okna
  if (G.running) drawHearts();                     // obrót telefonu zmienia pas serc (pasSerc)
});
addEventListener('orientationchange', () => setTimeout(fitCamera, 250));

// ============================== PEŁNY EKRAN / PWA ==============================
// Gra chodzi w OBU orientacjach (decyzja właściciela), więc nigdzie nie blokujemy
// obrotu — `fitCamera()` ma osobne warianty kamery dla pionu i poziomu.
// Pełny ekran WŁĄCZA SIĘ SAM tylko na dotyku i tylko z gestu (GRAJ / JESZCZE RAZ):
// przeglądarki odrzucają `requestFullscreen()` poza gestem, a na desktopie
// zabranie komuś paska zakładek bez pytania to chamstwo.
const DOTYK = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
// iPad od iPadOS 13 udaje w UA Macintosha — poznajemy go po dotyku na „Macu"
const IOS = (/iPhone|iPad|iPod/.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) && !window.MSStream;
const czyPelnyEkran = () => !!document.fullscreenElement;
// „Już jesteśmy bez paska adresu" — dodana do ekranu początkowego (PWA/iOS)
const czyStandalone = () => matchMedia('(display-mode: standalone)').matches
  || matchMedia('(display-mode: fullscreen)').matches
  || navigator.standalone === true;
// iOS Safari daje Fullscreen API TYLKO elementom <video>, więc tam to jest false
const mozePelnyEkran = () => !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;

function wejdzPelnyEkran() {
  if (!mozePelnyEkran() || czyPelnyEkran() || czyStandalone()) return;
  // ZWRACA PROMISE. Odmowa (podgląd w iframe bez `allow="fullscreen"`, brak gestu)
  // musi przejść po cichu — nieobsłużone odrzucenie ląduje w `window.__err`
  // i zaśmieca scenariusze testera.
  // `try` PONAD promisą: starsze webview potrafią rzucić synchronicznie na samym
  // słowniku opcji — a to już byłby prawdziwy wyjątek w handlerze GRAJ.
  try { document.documentElement.requestFullscreen({ navigationUI: 'hide' })?.catch(() => {}); }
  catch { /* nie ma pełnego ekranu — gra leci dalej w oknie */ }
}
function wyjdzPelnyEkran() {
  if (!document.fullscreenElement || !document.exitFullscreen) return;
  try { document.exitFullscreen()?.catch(() => {}); } catch { /* nieważne */ }
}
const sprobujPelnyEkran = () => { if (DOTYK) wejdzPelnyEkran(); };
const przelaczPelnyEkran = () => { czyPelnyEkran() ? wyjdzPelnyEkran() : wejdzPelnyEkran(); };

function odswiezFsBtn() {
  const w = czyPelnyEkran();
  const hud = document.getElementById('fsBtn');
  if (hud) hud.classList.toggle('on', w);
  const men = document.getElementById('btnFs');
  const nap = men && men.querySelector('span');
  if (nap) nap.textContent = w ? T('WYJDŹ Z PEŁNEGO EKRANU', 'EXIT FULLSCREEN') : T('PEŁNY EKRAN', 'FULLSCREEN');
}
// Wejście/wyjście zmienia wysokość okna, ale `resize` po `fullscreenchange`
// NIE ZAWSZE przychodzi (i bywa wcześniej niż nowe wymiary), więc przeliczamy sami.
addEventListener('fullscreenchange', () => setTimeout(() => {
  camera.aspect = innerWidth / innerHeight;
  applyResolution();
  fitCamera();
  if (typeof przeliczWylot === 'function') przeliczWylot();
  odswiezFsBtn();
}, 60));

// ---- instalacja (Chrome/Android; iOS i desktopowe Safari tego nie wysyłają) ----
let pwaPrompt = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();                    // bez tego Chrome pokaże swój pasek zamiast naszego przycisku
  pwaPrompt = e;
  const b = document.getElementById('btnInstall');
  if (b) b.style.display = '';
});
addEventListener('appinstalled', () => {
  pwaPrompt = null;
  const b = document.getElementById('btnInstall');
  if (b) b.style.display = 'none';
  window.STATY?.zdarzenie?.('install-pwa');
});

// ---- service worker (tylko po to, żeby gra była INSTALOWALNA) ----
// NIE na localhoście: podgląd deweloperski przeżyłby przeładowanie z SW w tle,
// a ten potrafi podać stary plik mimo `?cb=`. NIE z `file://` (Electron/Steam)
// ani z Capacitora — tam nie ma czego instalować.
// NIE w ramce (itch.io): na html.itch.zone PWA i tak się nie zainstaluje, a SW dokładałby
// przeskok przez swój wątek do każdego żądania assetu (recenzja 18.09).
if (location.protocol.startsWith('http')
    && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1'
    && window.top === window.self) {
  addEventListener('load', () => { navigator.serviceWorker?.register('./sw.js').catch(() => {}); });
}

// Wołane z sekwencji startowej (po `loadMeta`, bo podpowiedź dla iPhone'a
// zapisuje się w META.ui.pwaHint).
function initEkranUI() {
  const hud = document.getElementById('fsBtn');
  const men = document.getElementById('btnFs');
  const inf = document.getElementById('ekranInfo');
  if (!mozePelnyEkran() || czyStandalone()) {
    // Przełącznik, który nic nie robi, jest gorszy niż jego brak
    if (hud) hud.style.display = 'none';
    if (men) men.style.display = 'none';
    if (inf) inf.textContent = czyStandalone()
      ? T('Gra chodzi jako aplikacja — pasek adresu już nie zabiera miejsca.',
          'The game runs as an app — no address bar stealing screen space.')
      : T('Ta przeglądarka nie daje stronom pełnego ekranu. Na iPhone: Udostępnij → Dodaj do ekranu początkowego.',
          'This browser gives pages no fullscreen. On iPhone: Share → Add to Home Screen.');
  } else {
    if (hud) hud.onclick = przelaczPelnyEkran;
    if (men) men.onclick = przelaczPelnyEkran;
    if (inf && !DOTYK) inf.textContent = T('Na komputerze pełny ekran włącza się tylko tym przyciskiem (albo F11).',
                                           'On desktop, fullscreen turns on with this button only (or F11).');
    odswiezFsBtn();
  }
  const inst = document.getElementById('btnInstall');
  if (inst) inst.onclick = () => {
    if (!pwaPrompt) return;
    const p = pwaPrompt; pwaPrompt = null;
    inst.style.display = 'none';
    p.prompt()?.catch(() => {});
  };
  // podpowiedź dla iPhone'a — RAZ w życiu zapisu, pod przyciskiem GRAJ, nieblokująca
  const hint = document.getElementById('pwaHint');
  const hintX = document.getElementById('pwaHintX');
  if (hintX) hintX.onclick = () => hint.classList.remove('on');
  if (hint && IOS && !czyStandalone() && !mozePelnyEkran() && !META.ui.pwaHint) {
    hint.classList.add('on');
    META.ui.pwaHint = true;
    saveMeta();
  }
}

// -------- tekstura trawy --------
function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#9ad557'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = Math.random() < .5 ? '#93cf50' : (Math.random() < .7 ? '#a3e05e' : '#8bc74a');
    g.fillRect(x, y, 2, 2);
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 8 + Math.random() * 16;
    g.fillStyle = 'rgba(90,150,60,0.10)';
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(64, 64);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// -------- siatka terenu (pofalowana, cieniowana światłem) --------
// tafla wody — jedna, podąża za graczem (mapa jest nieskończona)
// WODA (stylizowana, Genshin/BotW): pasy głębi + animowana piana przy brzegu
// + fale w vertex shaderze + iskierki. Research: Roystan „Toon Water" (piana
// z różnicy głębi + próg na szumie), Alisavakis „Stylized water" (3 pasy koloru,
// linie piany z sin() biegnące do brzegu), Codrops R3F (bufor głębi za drogi →
// liczymy głębię z terenu), forum three.js „Unlit water shader with foam".
// U NAS nie ma depth-textury sceny — mamy za to `terrainH(x,z)` w JS, więc
// wypiekamy MAPĘ GŁĘBI wokół gracza do DataTexture i czytamy ją PER PIKSEL
// (siatka wierzchołków ma ~3 j. na segment — o wiele za mało na ostry brzeg).
const waterCamU = { value: new THREE.Vector2() };
const WD_RES = 144, WD_SIZE = 340;                 // rozdz. i zasięg mapy głębi (2.36 j./texel)
const wdData = new Uint8Array(WD_RES * WD_RES);
const waterDepthTex = new THREE.DataTexture(wdData, WD_RES, WD_RES, THREE.RedFormat);
waterDepthTex.minFilter = waterDepthTex.magFilter = THREE.LinearFilter;
waterDepthTex.wrapS = waterDepthTex.wrapT = THREE.ClampToEdgeWrapping;
waterDepthTex.unpackAlignment = 1;
waterDepthTex.needsUpdate = true;
const waterDepthU = { value: waterDepthTex };
const wdCenterU = { value: new THREE.Vector2(1e9, 1e9) };
// bezszwowy szum (ten sam pnoise co chmury) — piana, iskierki, faktura pasów
function waterNoiseTexture() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const OKT = [[4, 0.52], [8, 0.28], [16, 0.20]];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const [per, w] of OKT) v += pnoise(x / S * per, y / S * per, per) * w;
    const b = Math.max(0, Math.min(255, v * 255)) | 0;
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const waterNzU = { value: waterNoiseTexture() };
// 3 j. na segment (było 6.2) — dopiero teraz widać długie fale
const waterGeo = new THREE.PlaneGeometry(420, 420, 140, 140);
waterGeo.rotateX(-Math.PI / 2);
const waterMat = new THREE.MeshLambertMaterial({
  color: 0xffffff, transparent: true, opacity: 1 });
waterMat.onBeforeCompile = sh => {
  sh.uniforms.uTime = windU;
  sh.uniforms.uCam = waterCamU;
  sh.uniforms.uWDep = waterDepthU;
  sh.uniforms.uWDepC = wdCenterU;
  sh.uniforms.uWNz = waterNzU;
  // dekoder mapy głębi: 0..1 → -4..+4 j. (>0 = ile wody nad dnem)
  const DEK = `
    float wDepth(vec2 wp){
      vec2 duv = (wp - uWDepC) * ${(1 / WD_SIZE).toFixed(7)} + 0.5;
      float ins = smoothstep(0.0, 0.04, duv.x) * (1.0 - smoothstep(0.96, 1.0, duv.x))
                * smoothstep(0.0, 0.04, duv.y) * (1.0 - smoothstep(0.96, 1.0, duv.y));
      return mix(3.5, (texture2D(uWDep, duv).r - 0.5) * 8.0, ins);
    }`;
  sh.vertexShader =
    'uniform float uTime;uniform vec2 uCam;uniform sampler2D uWDep;uniform vec2 uWDepC;\n' +
    'varying vec3 vWP;varying float vFala;\n' + DEK + '\n' +
    sh.vertexShader.replace('#include <begin_vertex>',
    `#include <begin_vertex>
     vec2 wp = transformed.xz + uCam;                       // pozycja w świecie
     // fale GASNĄ przy brzegu (inaczej tafla przebija plażę)
     float tlum = smoothstep(0.05, 1.10, wDepth(wp));
     float f = ( sin(wp.x * 0.21 + uTime * 1.05) * 0.085
               + sin(wp.y * 0.26 - uTime * 0.85) * 0.075
               + sin((wp.x * 0.62 + wp.y * 0.78) * 0.135 + uTime * 0.55) * 0.10 ) * tlum;
     transformed.y += f;
     vWP = vec3(wp.x, 0.0, wp.y);
     vFala = f;`);
  sh.fragmentShader =
    'uniform float uTime;uniform sampler2D uWDep;uniform vec2 uWDepC;uniform sampler2D uWNz;\n' +
    'varying vec3 vWP;varying float vFala;float gPiana;float gIsk;\n' + DEK + '\n' +
    sh.fragmentShader.replace('#include <color_fragment>',
    `#include <color_fragment>
     vec2 wp = vWP.xz;
     float dep = wDepth(wp);                                // głębia pod pikselem
     float t = uTime;
     // ODLEGŁOŚĆ OD BRZEGU W METRACH: głębia / spadek dna (gradient z mapy głębi).
     // Bez tego piana ma szerokość w „metrach głębi" i na stromym brzegu jest nitką,
     // a na płaskim zalewa pół jeziora. Roystan liczy to samo z bufora głębi.
     const float DS = 2.4;                                  // krok = 1 texel mapy
     float gx = wDepth(wp + vec2(DS, 0.0)) - wDepth(wp - vec2(DS, 0.0));
     float gz = wDepth(wp + vec2(0.0, DS)) - wDepth(wp - vec2(0.0, DS));
     float nach = max(length(vec2(gx, gz)) / (2.0 * DS), 0.012);
     float brzeg = dep / nach;                              // ~metry od linii brzegu

     float nz  = texture2D(uWNz, wp * 0.075 + vec2( t * 0.0080, -t * 0.0056)).r;
     float nz2 = texture2D(uWNz, wp * 0.020 + vec2(-t * 0.0030,  t * 0.0021)).r;
     float nz3 = texture2D(uWNz, wp * 0.290 + vec2( t * 0.0140,  t * 0.0090)).r;  // drobna faktura

     // --- PASY GŁĘBI (3 płaskie kolory; jeziora mają max ~1.7 j. głębi) ---
     float dw = dep + (nz2 - 0.5) * 0.26 + sin(wp.x * 0.26 + wp.y * 0.19 + t * 0.5) * 0.06;
     vec3 col = mix(vec3(0.30, 0.82, 0.68), vec3(0.035, 0.36, 0.56), smoothstep(0.40, 0.58, dw));
     col = mix(col, vec3(0.012, 0.13, 0.33), smoothstep(0.94, 1.14, dw));

     // --- PIANA PRZY BRZEGU: wąski mokry rąbek + rzadka, poszarpana kipiel ---
     float szer = 1.05 + (nz - 0.5) * 1.3 + (nz3 - 0.5) * 0.6;  // ~0.1 .. 2.0 m, poszarpana
     float linie = sin((brzeg / max(szer, 0.5) - t * 0.42) * 12.6);
     float kipiel = (1.0 - smoothstep(szer * 0.30, szer, brzeg))     // zanik w głąb
                  * smoothstep(-0.15, 0.75, linie)                    // pasma biegnące do brzegu
                  * smoothstep(0.28, 0.62, nz3) * 0.85;               // dziury = kipiel, nie płyta
     float rabek = (1.0 - smoothstep(0.10, 0.50, brzeg)) * 0.92;      // stały mokry rąbek ~0.5 m
     float piana = clamp(max(rabek, kipiel), 0.0, 1.0) * step(0.004, dep);
     // wąski jaśniejszy „mokry" pas tuż za pianą (bez tego brzeg tnie jak nożem)
     col = mix(col, vec3(0.45, 0.90, 0.80), (1.0 - smoothstep(szer * 0.9, szer * 1.7, brzeg)) * 0.34);
     col = mix(col, vec3(1.0, 1.0, 1.0), piana);

     // --- GRZBIETY FAL (delikatne smugi na szczytach) + ISKIERKI ---
     float grzb = smoothstep(0.175, 0.225, vFala) * smoothstep(0.2, 0.7, dep) * (1.0 - piana);
     col = mix(col, vec3(0.72, 0.95, 1.0), grzb * 0.24);
     float s1 = texture2D(uWNz, wp * 0.62 + vec2( t * 0.030, -t * 0.019)).r;
     float s2 = texture2D(uWNz, wp * 0.71 + vec2(-t * 0.024,  t * 0.033)).r;
     float isk = smoothstep(0.99, 1.10, s1 * s2 * 2.2) * smoothstep(0.2, 0.7, dep) * (1.0 - piana);

     gPiana = piana; gIsk = isk;
     diffuseColor.rgb = col;
     // płycizna półprzezroczysta (widać dno), głębia gęsta, piana kryje
     diffuseColor.a = max(mix(0.74, 0.96, smoothstep(0.0, 0.9, dep)), piana * 0.96);`)
    // piana i iskierki DOŚWIETLONE — inaczej cień drzewa/chmury robi z piany szarość
    .replace('#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
     totalEmissiveRadiance += vec3(0.30, 0.34, 0.36) * gPiana + vec3(0.85, 0.95, 1.0) * gIsk;`);
};
const water = new THREE.Mesh(waterGeo, waterMat);
water.position.y = WATER_Y;
water.receiveShadow = true;
scene.add(water);
// wypiekanie MAPY GŁĘBI (WATER_Y - terrainH) wokół gracza; ~2 ms na 144²,
// więc przebudowa dopiero po 18 j. ruchu (mapa ma 170 j. zapasu w każdą stronę)
function updateWaterColors() {
  // ŚRODEK = GRACZ na Wąwozach. Pierwotnie liczyliśmy wokół `water.position`, bo płaska tafla
  // jeziora i tak jeździ za graczem — ale na Wąwozach tej tafli nie ma (woda jest per chunk),
  // `water.position` zostawało w miejscu startu i dalej od niego piana, przejrzystość i kolor
  // rzeki brały śmieci z brzegu mapy głębi (zgłoszenie właściciela: „rzeka/woda źle").
  const rz = MAPS[mapKey].rzeki;
  const ox = rz ? P.pos.x : water.position.x, oz = rz ? P.pos.z : water.position.z;
  if (Math.abs(ox - wdCenterU.value.x) < 18 && Math.abs(oz - wdCenterU.value.y) < 18) return;
  const st = WD_SIZE / WD_RES;
  const x0 = ox - WD_SIZE / 2 + st * 0.5, z0 = oz - WD_SIZE / 2 + st * 0.5;
  let i = 0;
  for (let j = 0; j < WD_RES; j++) {
    const wz = z0 + j * st;
    for (let k = 0; k < WD_RES; k++) {
      const wx = x0 + k * st;
      // Wąwozy: głębokość prosto z modułu (JEDNO wywołanie zamiast wodaY + terrainH — tu teren
      // jest ~6× droższy, a mapa to 20 tys. próbek); na suchym lądzie 0 = linia brzegu
      const g = (rz ? TW.glebokoscWody(wx, wz) : wodaY(wx, wz) - terrainH(wx, wz)) * 0.125 + 0.5;   // -4..4 → 0..1
      wdData[i++] = g < 0 ? 0 : g > 1 ? 255 : (g * 255) | 0;
    }
  }
  waterDepthTex.needsUpdate = true;
  wdCenterU.value.set(ox, oz);
}
updateWaterColors();                 // żeby pierwsza klatka nie była biała

const grassTexC = grassTexture();
grassTexC.repeat.set(1, 1);      // skala siedzi w UV chunków

// -------- podłoga marketu (kafle lastryko) --------
function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d5cf'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = Math.random() < .5 ? '#cfccc5' : '#e2dfd9';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = '#b8b5ae'; g.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  g.fillStyle = '#cdbfa3'; g.fillRect(64, 128, 64, 64);   // beżowy akcent
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const floorTexC = floorTexture();

// -------- regał sklepowy (tekstura z "towarem") --------
function shelfTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#8a6440'; g.fillRect(0, 0, 128, 64);          // korpus
  const kolory = ['#d84f4f', '#4f9ed8', '#57b85a', '#e8c33f', '#b06fd8', '#e88b3f'];
  for (let row = 0; row < 3; row++) {
    const y = 4 + row * 20;
    g.fillStyle = '#6e4d2e'; g.fillRect(0, y + 14, 128, 4);    // deska półki
    for (let x = 4; x < 120; x += 10) {                        // produkty
      g.fillStyle = kolory[Math.floor(Math.random() * kolory.length)];
      g.fillRect(x, y + 2 + Math.random() * 3, 7, 10);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let shelfMat = null, coolerMat = null;   // tworzone w boot
const shelfGeo = new THREE.BoxGeometry(1, 1, 1);
// ═══ MARKET — PRZEBUDOWA (30.09): regał = moduł 4 j. z lib/modele-market.js, JEDNA InstancedMesh na chunk ═══
// (dawniej 3 InstancedMesh na chunk + osobne Mesh palet i lad: ~550 draw calli na pustej arenie).
// Macierz instancji = T(pivot) · Ry(yaw) · Rx(kąt upadku) — Euler 'YXZ'. Stare `new Euler(kąt, yaw, 0)` (XYZ = Rx·Ry)
// obracało regał z kier −1 W PODŁOGĘ: wrak zapadał się pod posadzkę i zostawał z niego sam blat (zrzut przed/po).
// instanceColor = (stan 0 stoi / 1 pada / 2 leży, dział 0..7, wariant 0/1) — shader wybiera cień kontaktowy stojącego
// albo leżącego regału i pas towaru działu. `s.poZ` = regał pada wzdłuż Z (długość wzdłuż X); `s.piv` = współrzędna
// krawędzi podstawy od strony upadku na osi upadku, `s.a`/`s.b` = środek na osi upadku / wzdłuż długości.
const _rm = new THREE.Matrix4(), _rq = new THREE.Quaternion(), _rp = new THREE.Vector3(), _rs = new THREE.Vector3(1, 1, 1);
const _re = new THREE.Euler(0, 0, 0, 'YXZ');
const STAN_REGALU = { stoi: 0, pada: 1, lezy: 2 };
function ustawRegal(s, kat) {
  if (s.poZ) { _rp.set(s.x, s.g0, s.piv); _re.set(kat, s.kier > 0 ? 0 : Math.PI, 0); }
  else { _rp.set(s.piv, s.g0, s.z); _re.set(kat, s.kier > 0 ? Math.PI / 2 : -Math.PI / 2, 0); }
  _rq.setFromEuler(_re);
  _rm.compose(_rp, _rq, _rs);
  s.im.setMatrixAt(s.i, _rm);
  s.im.instanceMatrix.needsUpdate = true;
  const c = s.im.instanceColor.array;
  c[s.i * 3] = STAN_REGALU[s.stan]; c[s.i * 3 + 1] = s.kat; c[s.i * 3 + 2] = s.war;
  s.im.instanceColor.needsUpdate = true;
}
// punkt świata z (a = oś upadku, b = wzdłuż regału) → _rpk
const _rpk = { x: 0, z: 0 };
function regPkt(s, a, b) { if (s.poZ) { _rpk.x = b; _rpk.z = a; } else { _rpk.x = a; _rpk.z = b; } return _rpk; }
const REG_HL = UM.REGAL.hl;                      // pół-grubość bryły stojącego regału: 1,1 (głębokość 1,6 + zapas, jak dawniej) — sprite
                                                 // gracza pochylony do kamery o ~22° wchodził głową w regał za plecami i znikał do pasa
// bryła kolizji: stojący regał = ściana 2,46 j. (trzeba 🦘🦘 albo obejść); leżący = rumowisko 1,55 j. do wskoczenia
function brylaRegalu(s, lezy) {
  const S = s.solid;
  if (!lezy) {
    S.x = s.x; S.z = s.z; S.top = s.g0 + SHELF_H + 0.16;
    if (s.poZ) { S.hw = s.len / 2; S.hl = REG_HL; } else { S.hw = REG_HL; S.hl = s.len / 2; }
  } else {
    // Szczyt MUSI zgadzać się z płaszczyzną wraku (1,6), inaczej stoi się w powietrzu albo po pas w deskach.
    // 1,55 = ledwo pod nią, a apeks skoku (1,461) + tolerancja 0,25 nadal łapie wejście.
    const c = s.piv + s.kier * 1.23;
    if (s.poZ) { S.x = s.x; S.z = c; S.hw = s.len / 2 + 0.15; S.hl = 1.23; } else { S.x = c; S.z = s.z; S.hw = 1.23; S.hl = s.len / 2 + 0.15; }
    S.top = s.g0 + 1.55;
  }
}

const SHELF_H = 2.3;   // za wysoko na 1 skok — trzeba 🦘🦘 albo obejść

// rozlana woda w markecie — ślisko!
function spillTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 6, 32, 32, 31);
  gr.addColorStop(0, 'rgba(150,205,240,0.75)');
  gr.addColorStop(0.75, 'rgba(120,190,235,0.5)');
  gr.addColorStop(1, 'rgba(120,190,235,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2;
  g.beginPath(); g.arc(26, 26, 9, 0.5, 2.6); g.stroke();
  return new THREE.CanvasTexture(c);
}
let spillMat = null;

// proste materiały struktur (skrzynie, deski, kamień)
function stripeTexture(base, dark, n) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  g.fillStyle = dark;
  for (let i = 0; i < 64; i += 64 / n) g.fillRect(0, i, 64, 2);
  g.strokeStyle = dark; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 61, 61);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let crateMat = null, plankMat = null, stoneMat = null;

// -------- chmury --------
// PŁASKIE, DWUTONOWE chmury (jak kwantowane pasy nieba): biały wierzch, chłodny spód,
// płaska podstawa, twarde krawędzie + NearestFilter. Rozmyte radialne gradienty
// wyglądały jak dym i nie pasowały do pixel-artu. Dwa warianty kształtu.
function cloudTexture(wariant) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  const kule = wariant === 0
    ? [[34, 40, 17], [56, 30, 23], [82, 34, 21], [104, 42, 15], [66, 44, 19]]
    : [[28, 44, 13], [46, 36, 19], [70, 28, 24], [94, 38, 18], [80, 46, 15]];
  g.fillStyle = '#c4d7ec';                                   // spód w cieniu
  for (const [x, y, r] of kule) { g.beginPath(); g.arc(x, y + 2, r, 0, 7); g.fill(); }
  g.fillStyle = '#e9f2fb';                                   // półton
  for (const [x, y, r] of kule) { g.beginPath(); g.arc(x, y - 3, r * 0.92, 0, 7); g.fill(); }
  g.fillStyle = '#ffffff';                                   // oświetlony wierzch
  for (const [x, y, r] of kule) { g.beginPath(); g.arc(x - 2, y - 7, r * 0.72, 0, 7); g.fill(); }
  g.clearRect(0, 56, 128, 8);                                // płaska podstawa
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
const clouds = [];
{
  // DWIE WARSTWY: wysoka (duże, jasne, wolne) i niska (mniejsze, lekko przyszarzone,
  // szybsze) — jedna warstwa jednakowych plam czytała się jak tapeta.
  const teks = [cloudTexture(0), cloudTexture(1)];
  const matG = teks.map(t => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.94, fog: false }));
  const matD = teks.map(t => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.80, fog: false, color: 0xdfe8f2 }));
  for (let i = 0; i < 14; i++) {
    const gorna = i < 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), (gorna ? matG : matD)[i % 2]);
    const s = gorna ? 26 + Math.random() * 24 : 12 + Math.random() * 12;
    m.scale.set(s, s * 0.5, 1);
    m.position.set((Math.random() - .5) * 260, gorna ? 34 + Math.random() * 12 : 21 + Math.random() * 7, (Math.random() - .5) * 260);
    scene.add(m);
    clouds.push({ m, v: gorna ? 0.5 + Math.random() * 0.5 : 1.0 + Math.random() * 0.8 });
  }
}

// -------- głazy 3D (bryły rozstawiane per-chunk) --------
// jaśniejszy, lekko ciepły szary (Genshin: głazy czytają się jasno na tle zieleni);
// instanceColor per głaz daje odchyłki barwy — patrz rockTint
// REFERENCJE WŁAŚCICIELA (03.09): głazy = ciemny, niebieskawy łupek z płaskimi ścianami
// i jasną górną płaszczyzną (flatShading + Lambert robi to samo z siebie). Jasnoszary
// 0x9c9e94 zlewał się z piaskiem brzegu.
const rockMat = new THREE.MeshLambertMaterial({ color: 0x66707f, flatShading: true });
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const rockTint = rng => new THREE.Color(0.86 + rng() * 0.26, 0.88 + rng() * 0.22, 0.92 + rng() * 0.2);

// ============================== WIATR + CIENIE CHMUR ==============================
const windU = { value: 0 };

// Cienie chmur: proceduralna tekstura plam przesuwana po świecie (projekcja z góry).
// Wpinana do materiałów terenu/trawy/postaci — przyciemnia fragmenty wg pozycji XZ.
// OKRESOWY szum (kafelkuje się bezszwowo) — lattice wrapowany modulo `per`
function pnoise(x, z, per) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const w = i => ((i % per) + per) % per;
  const a = hash2(w(ix), w(iz)), b = hash2(w(ix + 1), w(iz));
  const c2 = hash2(w(ix), w(iz + 1)), d = hash2(w(ix + 1), w(iz + 1));
  return a + (b - a) * sx + (c2 - a) * sz + (a - b - c2 + d) * sx * sz;
}
// MAPA SZUMU (fBm, 4 oktawy) → realnie poszarpane kształty chmur zamiast kółek
function cloudShadowTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const OKT = [[3, 0.52], [6, 0.26], [12, 0.14], [24, 0.08]];   // okres, waga
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const [per, waga] of OKT) v += pnoise(x / S * per, y / S * per, per) * waga;
      // ostre krawędzie: próg + wąska strefa przejścia
      const cien = Math.max(0, Math.min(1, (v - 0.46) * 6.5 + 0.5));
      const b = cien * 255;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const cloudShadowU = { value: null };
const cloudOffU = { value: new THREE.Vector2() };
const CLOUD_SCALE = 0.016, CLOUD_SPD = 9.0;          // skala plam i prędkość dryfu

// wpina cienie chmur do dowolnego materiału (po pozycji w świecie)
function addCloudShadow(mat) {
  const stary = mat.onBeforeCompile;
  mat.onBeforeCompile = sh => {
    if (stary) stary(sh);
    sh.uniforms.uCloud = cloudShadowU;
    sh.uniforms.uCloudOff = cloudOffU;
    // UWAGA: przy instancingu three.js mnoży przez instanceMatrix dopiero w project_vertex,
    // więc trzeba to zrobić RĘCZNIE — inaczej wszystkie instancje mają tę samą pozycję
    // i cała trawa ciemnieje naraz (albo wcale).
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <fog_vertex>',
      `#include <fog_vertex>
       vec4 _wp = vec4(transformed, 1.0);
       #ifdef USE_INSTANCING
         _wp = instanceMatrix * _wp;
       #endif
       vWPos = (modelMatrix * _wp).xyz;`);
    // CIEŃ CHMUR MUSI WEJŚĆ **PRZED MGŁĘ**. Wcześniej mnożenie siedziało przy
    // `dithering_fragment`, czyli PO `fog_fragment`: przyciemniało kolor, który był
    // już zmieszany z mgłą, więc daleki horyzont — który ma być czystą mgłą — dostawał
    // ciemne łaty wędrujące razem z chmurami (zgłoszone przez grafika w audycie).
    const kod = `float cs = texture2D(uCloud, vWPos.xz * ${CLOUD_SCALE.toFixed(5)} + uCloudOff).r;
       gl_FragColor.rgb *= mix(0.74, 1.04, cs);`;   // 0.48 → 0.74: cień chmury zamieniał limonkową łąkę w ciemną (referencje 03.09)
    const kotwica = sh.fragmentShader.includes('#include <fog_fragment>')
      ? '#include <fog_fragment>' : '#include <dithering_fragment>';
    // przy braku mgły w materiale zostaje stara kotwica — inaczej `replace` nie
    // trafiłby w nic i cień chmur zniknąłby po cichu
    sh.fragmentShader = 'uniform sampler2D uCloud;uniform vec2 uCloudOff;varying vec3 vWPos;\n' +
      sh.fragmentShader.replace(kotwica, kod + '\n       ' + kotwica);
  };
  mat.needsUpdate = true;
  return mat;
}
function addWind(mat, amp = 0.16, freq = 1.7) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = windU;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         vec3 iP = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       #else
         vec3 iP = vec3(0.0);
       #endif
       float h = max(position.y, 0.0);
       float sw = sin(uTime * ${freq.toFixed(2)} + iP.x * 0.4 + iP.z * 0.33) * ${amp.toFixed(3)} * h;
       transformed.x += sw;
       transformed.z += sw * 0.45;`);
  };
  mat.needsUpdate = true;
  return mat;
}

// -------- DRZEWA: wspólne materiały drewna --------
// trunkGeo/trunkMat zostały dla PIEŃKÓW i KŁÓD (instancje). Same drzewa (v5) mają własną
// siatkę gałęzi — patrz „DRZEWA v5" niżej.
const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 1, 6);
trunkGeo.translate(0, 0.5, 0);
// pień cieplejszy i jaśniejszy (0x6b4a2b ginął w cieniu korony jako czarna kreska).
// v4: jeszcze jaśniejszy + ŁAGODNE pasma (0.62 w cieniu, nie 0.0) — referencje właściciela
// mają „wyraźny, gruby BRĄZOWY pień", a pod koroną Lambert schodził do czerni i pień
// czytał się jako czarna kreska pod zieloną chmurą.
// Pasma > 1 z tego samego powodu co przy koronach (patrz initKepy): trawa jest
// nieoświetlona, więc Lambert trzeba „dopompować", żeby brąz nie wyszedł mułem.
const trunkMat = addWrapLight(new THREE.MeshLambertMaterial({ color: 0x8d6440, flatShading: true }),
  0.5, [0.80, 0.30, 0.30], [-0.25, 0.05, 0.30, 0.60]);
// DREWNO DRZEW v5 (pień + konary + gałęzie + korzenie z jednej siatki): te same pasma,
// ale GŁADKIE normalne (pierścienie 5-8 boków przy flatShading dawały słupki jak z Minecrafta)
// i vertexColors — jasność per wierzchołek niesie tanie AO (nasada, głąb korony) oraz
// odcień per drzewo. Cień chmur jak na koronach, żeby pień nie „świecił" pod chmurą.
// KOLOR: na referencji (Chubby Pixel) pnie są BLADE, kremowo-piaskowe (jak brzoza), nie brązowe —
// i to one robią kontrast z ciemną koroną. Zostawiam przełącznik, bo 18.09 właściciel chciał
// „wyraźny, gruby BRĄZOWY pień": `HORDA.drzewa({ pien: 'brazowy' })` wraca do starego koloru.
const PIEN_KOLOR = { blady: 0xd9c49c, brazowy: 0x8d6440 };
const galezieMat = addCloudShadow(addWrapLight(new THREE.MeshLambertMaterial({ color: PIEN_KOLOR.blady, vertexColors: true }),
  0.5, [0.80, 0.30, 0.30], [-0.25, 0.05, 0.30, 0.60]));

// PÓŁ-LAMBERT („wrap lighting", Valve): dotNL → dotNL*(1-w)+w. Bryła oświetlona jest
// miękko dookoła zamiast twardej granicy dzień/noc — od strony przeciwnej do słońca
// zwykły Lambert zostawiał TYLKO hemisferę z ciemnozielonym spodem = czarnozielone
// korony. Wpinane po addWind (który nadpisuje onBeforeCompile), przed addCloudShadow.
// `pas` = [baza cienia, przyrost półtonu, przyrost światła] — v4 pozwala dobrać
// kontrast pasm osobno dla koron (potrzebują mocniejszej formy niż domyślne 0.55/0.25/0.20).
// `progi` = gdzie przebiegają granice pasm w rawNL. SŁOŃCE STOI WYSOKO (SUN_OFF ≈ 50°),
// więc na spłaszczonej kępie prawie cała widoczna powierzchnia ma rawNL > 0.44 i przy
// domyślnych progach WSZYSTKO wpada w pasmo światła — kępa wychodzi jednym płaskim
// kolorem („naleśnik"). Korony dostają więc granicę światła przesuniętą wysoko.
// `sss` = [barwa pasma cienia, barwa pasma światła] — „sztuczne prześwietlanie liścia"
// z Genshina: w cieniu korona idzie w chłód (błękit nieba), w świetle w ciepło (słońce).
// Bez tego trzy pasma różnią się TYLKO jasnością i korona czyta się jak plastik.
function addWrapLight(mat, w = 0.5, pas = [0.55, 0.25, 0.20], progi = [-0.05, 0.10, 0.30, 0.44], sss = null) {
  const stary = mat.onBeforeCompile;
  mat.onBeforeCompile = sh => {
    if (stary) stary(sh);
    // ⚠️ onBeforeCompile dostaje shader z NIEROZWINIĘTYMI `#include` (resolveIncludes
    // odpala się dopiero w WebGLProgram), więc podmiana samej linii Lamberta trafiała
    // w nic i wrap był no-opem (recenzja 03.09). Rozwijamy chunk ręcznie i podmieniamy w nim.
    // TOON W TRZECH PASMACH (referencje właściciela: Genshin/BotW — twarde, ale nie
    // ostre granice światła na koronie): cień 0.42 → półton 0.72 → światło 1.0.
    // Gładki Lambert dawał „zieloną kartoflę" bez formy; pasma dają bryłę i kłębiastość.
    let chunk = THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
      'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
      `float rawNL = dot( geometryNormal, directLight.direction );
       float _b1 = smoothstep( ${progi[0].toFixed(3)}, ${progi[1].toFixed(3)}, rawNL );
       float _b2 = smoothstep( ${progi[2].toFixed(3)}, ${progi[3].toFixed(3)}, rawNL );
       float dotNL = ${pas[0].toFixed(3)} + ${pas[1].toFixed(3)} * _b1 + ${pas[2].toFixed(3)} * _b2;`);
    if (sss) {
      const c = (v) => `vec3(${v[0].toFixed(3)}, ${v[1].toFixed(3)}, ${v[2].toFixed(3)})`;
      chunk = chunk.replace('vec3 irradiance = dotNL * directLight.color;',
        `vec3 irradiance = dotNL * directLight.color * mix(${c(sss[0])}, ${c(sss[1])}, 0.5 * _b1 + 0.5 * _b2);`);
    }
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_lambert_pars_fragment>', chunk);
  };
  mat.needsUpdate = true;
  return mat;
}

// ╔══════════════ DRZEWA v5 — PRAWDZIWE DRZEWA Z GAŁĘZIAMI (18.09.2026) ══════════════╗
// Historia: v3 „karty liści" (właściciel: „kapusta"), v4 A/B „kępy na kikucie" i „kępy +
// płaty" (odrzucone; zrzuty w dist/drzewa_A|B_*.png, kod w commicie aefd36c). Właściciel:
// „całe drzewa od nowa, z gałęziami". Stąd v5:
//   * SZKIELET z gałęziami generuje `lib/drzewa-szkielet.js` — pochodna ez-tree (MIT,
//     D. Greenheck): pień → konary → gałęzie, każda z własnym skręceniem, zbieżnością,
//     ciążeniem; plus nasze korzenie, kołnierz nasady i piętra świerków.
//   * PREFABY: kilkanaście gotowych drzew (3 gatunki liściaste × ziarna + świerki)
//     liczonych RAZ na starcie (`generujPrefabyDrzew`). Chunk nie generuje szkieletów —
//     tylko wybiera prefab, obraca, skaluje, lekko pochyla (deterministycznie z rng chunka).
//   * DREWNO: wszystkie drzewa chunka zlewane w JEDNĄ siatkę (`flushDrewno`) = 1 draw call
//     niezależnie od liczby prefabów; kolory wierzchołków = odcień per drzewo × tanie AO.
//   * LIŚCIE: malarskie KĘPY z v4 (bryły z promienistymi normalnymi, toon 3 pasma, fake SSS,
//     jasna czapka) — ale teraz siedzą NA KOŃCACH GAŁĘZI, nie na wymyślonych pierścieniach:
//     między kępami widać konary, sylwetka wynika z rozłożenia gałęzi. Instancje per paleta.
//   * ŚWIERK: pień + konary w 3-4 piętrach, na każdym konarze płaska „łapa" igieł (spłaszczona
//     kępa ułożona WZDŁUŻ konaru) + czub. Zamiast trzech stożków z v3/v4.
// Strojenie na żywo w podglądzie: HORDA.drzewa({ ... }) — patrz DRZEWA_CFG.

// ═══════════════ LIŚCIE v5 — GAŁĄZKI Z LIŚĆMI NA KARTACH (port z ez-tree) ═══════════════
// Właściciel po v5 z kępami: „drzewa nie mają prawidłowych liści, tylko jakieś bule".
// Robimy więc DOKŁADNIE jak ez-tree: liść = para skrzyżowanych quadów (Billboard.Double)
// z teksturą CAŁEJ GAŁĄZKI Z LIŚĆMI (alfa), nasada quada w punkcie na gałązce, +Y quada
// wzdłuż osi liścia; liście rozłożone WZDŁUŻ gałązek ostatniego poziomu (`lisciePrefab`,
// port `generateLeaves`) + jeden na czubku każdej gałązki. Żadnych brył pod spodem.
// Tekstury gałązek (dąb / jesion / osika-jesienna / świerk) pochodzą z ez-tree (MIT,
// `assets/drzewa/README.txt`), przeskalowane do 512 px.
// NORMALNE ODGIĘTE (`roundedNormals` z ez-tree): normalna narożnika = normalize(n + (v − nasada)),
// zapieczona w geometrii — three mnoży ją przez mat3(instanceMatrix) w defaultnormal_vertex,
// więc działa na instancjach bez dodatkowego atrybutu. Dzięki temu karty nie świecą jak
// kartki papieru, tylko cieniują się jak wycinki kuli wokół gałązki.
const liscieGeo = (() => {
  const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);      // y ∈ [0,1], nasada w (0,0,0)
  const b = a.clone().rotateY(Math.PI / 2);                            // druga karta w poprzek
  const n = a.attributes.position.count;
  const pos = new Float32Array(n * 6), nrm = new Float32Array(n * 6), uv = new Float32Array(n * 4);
  const col = new Float32Array(n * 6).fill(1);                         // biały → instanceColor działa
  const idx = [];
  [a, b].forEach((g, k) => {
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < n; i++) {
      const o = k * n + i, px = P.getX(i), py = P.getY(i), pz = P.getZ(i);
      const nx = N.getX(i) + px, ny = N.getY(i) + py, nz = N.getZ(i) + pz, l = Math.hypot(nx, ny, nz);
      pos[o * 3] = px; pos[o * 3 + 1] = py; pos[o * 3 + 2] = pz;
      nrm[o * 3] = nx / l; nrm[o * 3 + 1] = ny / l; nrm[o * 3 + 2] = nz / l;
      uv[o * 2] = U.getX(i); uv[o * 2 + 1] = U.getY(i);
    }
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + k * n);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
})();
// WIATR LIŚCI (ten sam `windU` co trawa): oddech + dwa szelesty z fazą po pozycji instancji,
// amplituda rośnie od nasady (position.y = 0, siedzi na gałązce) do czubka (1).
// Do tego BEZ ODWRACANIA NORMALNEJ NA TYLNEJ ŚCIANIE: three przy DoubleSide mnoży normalną
// przez faceDirection, więc połowa kart w koronie (te tyłem do słońca) robiła się ciemna
// i korona wychodziła w kratkę. Karta ma świecić tak samo z obu stron.
// (UWAGA: żadnych odwrotnych apostrofów w komentarzach wewnątrz template literalu.)
// `billboard` (styl „puchate"): kłębek to JEDNA karta zawsze zwrócona do kamery — skrzyżowane
// karty oglądane z boku dawały cienkie „plasterki" przecinające kłębki. Środek kłębka jest
// wysunięty 0.35 rozmiaru wzdłuż osi liścia (poza gałązkę, jak nasada→czubek u gałązek), a normalna
// to KOPUŁKA w przestrzeni widoku (brzegi karty odchylone od kamery): kłębek cieniuje się jak
// kula widziana z kamery, więc jasna strona idzie za słońcem niezależnie od obrotu kamery.
function addLiscieShader(mat, billboard = false) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = windU;
    const wiatr = `float faza = dot(iPos, vec3(12.9898, 78.233, 37.719)) * 0.012;
       float oddech = sin(uTime * 0.9 + faza) * 0.07 * waga;
       float szelest = (sin(uTime * 2.6 + faza * 3.1) + 0.5 * sin(uTime * 4.1 + faza * 7.3)) * 0.03 * waga;`;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <project_vertex>', billboard
      ? `#ifdef USE_INSTANCING
           vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
           vec3 iOs = vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]);
           // OSOBNA SKALA X i Y: kolumna 0 instanceMatrix = szerokość karty, kolumna 1 = wysokość.
           // Świerk dostaje karty SZEROKIE I NISKIE (łapa igieł), liściaste kwadratowe kłębki.
           float iSkX = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
           float iSkY = length(iOs);
         #else
           vec3 iPos = vec3(0.0); vec3 iOs = vec3(0.0, 1.0, 0.0); float iSkX = 1.0; float iSkY = 1.0;
         #endif
         float waga = clamp(position.y, 0.0, 1.0);
         ${wiatr}
         vec3 srodek = iPos + iOs * 0.35 + vec3(oddech + szelest, szelest * 0.5, (oddech + szelest) * 0.4);
         vec4 mvPosition = modelViewMatrix * vec4(srodek, 1.0);
         mvPosition.xy += vec2(position.x * iSkX, (position.y - 0.5) * iSkY);
         gl_Position = projectionMatrix * mvPosition;`
      : `vec4 mvPosition = vec4(transformed, 1.0);
         #ifdef USE_INSTANCING
           mvPosition = instanceMatrix * mvPosition;
           vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
         #else
           vec3 iPos = vec3(0.0);
         #endif
         float waga = clamp(position.y, 0.0, 1.0);
         ${wiatr}
         mvPosition.xyz += vec3(oddech + szelest, szelest * 0.5, (oddech + szelest) * 0.4);
         mvPosition = modelViewMatrix * mvPosition;
         gl_Position = projectionMatrix * mvPosition;`);
    if (billboard) {
      // kopułka: normalna w przestrzeni widoku, (0,0,1) w środku karty, odchylona ku brzegom
      sh.vertexShader = sh.vertexShader.replace('#include <defaultnormal_vertex>',
        `vec3 transformedNormal = normalize(vec3(position.x * 1.3, (position.y - 0.5) * 1.3 + 0.25, 0.75));`);
    }
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  mat.needsUpdate = true;
  return mat;
}
// pojedyncza karta pod billboardowe kłębki (y ∈ [0,1], biały kolor → instanceColor działa)
const liscieGeoBill = (() => {
  const g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
})();
// PALETY LIŚCI (indeks = paleta chunka): 0-2 zielenie (dąb / jesion / dąb chłodniejszy),
// 3 jesienna (osika, żółta), 4 świerk (igły). Odcień `color` mnoży zdjęcie gałązki — zdjęcia
// są średnio-zielone, a łąka limonkowa, więc podbijamy w żółć; pasma toon i fake SSS jak
// dawniej na kępach (w cieniu chłodniej, w świetle cieplej). alphaTest 0.5 = twarda krawędź
// liścia, bez sortowania przezroczystości; DoubleSide, bo karta ma być widoczna z każdej strony.
// ---- PUCHATA KĘPKA (styl „puchate", referencja właściciela 19.09: Chubby Pixel „Ultimate
// Stylized Nature") — właściciel: „bardziej miękka, mniej szczegółowa". Płaski obłoczek z
// POFALOWANĄ krawędzią (suma kółek: 1 duże + 9 płatków), trzy tony ułożone jak WARSTWICE:
// cały kłębek w cieniu, środek przesunięty w górę, jasna czapka jeszcze wyżej i mniejsza.
// Zero listków, zero faktury. Tło poza kłębkiem w środkowym tonie (mipmapy + alphaTest:
// czarne tło przeciekałoby na krawędź jako brudna obwódka), alfa = maska kłębka.
// ── JAK POWSTAJE RYSUNEK (druga wersja, po uwadze „nie jest zbytnio podobne do referencji") ──
// Na referencji kłębek NIE ma koncentrycznych warstwic, tylko PROSTY PODZIAŁ NA PASY wzdłuż
// kierunku słońca: ciemny spód, środek, jasny wierzch, a granice między nimi biegną po
// WŁASNYM, POFALOWANYM OBRYSIE kłębka. Dlatego tony rysujemy jako KOPIE TEGO SAMEGO OBRYSU
// PRZESUNIĘTE KU SŁOŃCU (w górę i w prawo, bo SUN_OFF = (38,60,26) rzutuje się na ekran jako
// „góra-prawo"), przycięte do obrysu:
//   obrys w tonie CIENIA → kopia +0.40 w górę w tonie ŚRODKA → kopia +0.62 w górę w tonie ŚWIATŁA
//   → cienki (0.045) RĄBEK najjaśniejszy na samej górnej krawędzi (rim light z referencji).
// Efekt: dolna 1/3 kłębka ciemna, środek, górna 1/3 jasna + świetlisty rąbek, wszystko
// z falistymi granicami. Karta jest billboardem wyrównanym do EKRANU, więc „góra tekstury"
// to zawsze góra ekranu — słońce stoi wysoko, więc kierunek się zgadza bez liczenia czegokolwiek.
function pufTexture(pal, seed, iglaste = false) {
  const S = 256;
  let sd = seed >>> 0;
  const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
  // OBRYS: 1 duże koło + 7 dużych płatków (było 1 + 9 małych). Mniej, większych płatków =
  // spokojniejsza, bardziej „pluszowa" sylwetka; przy 9 małych kłębek wyglądał jak brokuł.
  const kola = [[S * 0.50, S * 0.50, S * 0.30]];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i + 0.3 + rnd() * 0.4) / n * 6.283;
    const sp = Math.sin(a) > 0 ? 0.78 : 1.0;          // spód spłaszczony — kępka „leży" na gałęzi
    kola.push([S * 0.50 + Math.cos(a) * S * 0.24, S * 0.50 + Math.sin(a) * S * 0.21 * sp, S * (0.17 + rnd() * 0.05)]);
  }
  const css = q => `rgb(${q[0] | 0},${q[1] | 0},${q[2] | 0})`;
  const miks = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // ŁAPA IGIEŁ (świerk): zamiast kółek rysujemy WACHLARZ igieł wzdłuż gałązki — właściciel
  // 19.09: „drzewa iglaste do dupy" (okrągłe kłębki czytały się jak liściaste). Karta świerka
  // jest szeroka i niska, więc wachlarz wygląda jak gałąź z igłami; tony (kopie przesunięte
  // ku słońcu) działają na nim tak samo jak na kłębku.
  const kolce = [], walek = [];
  if (iglaste) {
    // zaokrąglony wałek gałązki (4 koła) + 5 DUŻYCH trójkątnych kolców w dół. Pierwsza wersja
    // miała 26 drobnych igiełek — dokładnie ten „szczegół", którego właściciel nie chce.
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      walek.push([S * (0.20 + t * 0.62), S * 0.40, S * (0.15 - 0.055 * t)]);
    }
    const nK = 5;
    for (let i = 0; i < nK; i++) {
      const t = i / (nK - 1);
      const x0 = S * 0.18 + t * S * 0.64;
      const dl = S * (0.40 - 0.20 * t) * (0.85 + rnd() * 0.3);
      kolce.push([x0, S * 0.44, x0 - S * 0.03 + rnd() * S * 0.05, S * 0.44 + dl, S * (0.105 - 0.035 * t)]);
    }
  }
  const obrys = (g, ox, oy) => {
    g.beginPath();
    if (iglaste) {
      for (const [x, y, r] of walek) { g.moveTo(x + ox + r, y + oy); g.arc(x + ox, y + oy, r, 0, 6.283); }
      for (const [bx, by, tx, ty, w] of kolce) {
        g.moveTo(bx - w + ox, by + oy); g.lineTo(tx + ox, ty + oy); g.lineTo(bx + w + ox, by + oy); g.closePath();
      }
      return;
    }
    for (const [x, y, r] of kola) { g.moveTo(x + ox + r, y + oy); g.arc(x + ox, y + oy, r, 0, 6.283); }
  };
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = css(pal[1]); g.fillRect(0, 0, S, S);   // tło = środkowy ton (mipmapy nie brudzą krawędzi)
  g.fillStyle = css(pal[0]); obrys(g, 0, 0); g.fill();
  g.save();
  obrys(g, 0, 0); g.clip();
  // łapa igieł jest NISKA — przesunięcia tonów muszą być mniejsze, inaczej kopie wyjeżdżają
  // poza obrys i cała karta zostaje w jednym tonie
  const d1 = iglaste ? 0.10 : 0.40, d2 = iglaste ? 0.17 : 0.62, dr = iglaste ? 0.195 : 0.665;
  g.fillStyle = css(pal[1]); obrys(g, S * 0.05, -S * d1); g.fill();
  g.fillStyle = css(pal[2]); obrys(g, S * 0.08, -S * d2); g.fill();
  // rąbek: najjaśniejszy ton (czapka rozjaśniona ku bieli) w pasie 4.5% przy górnej krawędzi
  g.fillStyle = css(miks(pal[2], [255, 255, 240], 0.45));
  obrys(g, S * 0.09, -S * dr); g.fill();
  g.fillStyle = css(pal[2]); obrys(g, S * 0.09, -S * (dr + 0.045)); g.fill();
  g.restore();
  // maska alfy: obrys biały na przezroczystym → do kanału A koloru
  const m = document.createElement('canvas'); m.width = m.height = S;
  const gm = m.getContext('2d');
  gm.fillStyle = '#fff'; obrys(gm, 0, 0); gm.fill();
  const kol = g.getImageData(0, 0, S, S), mask = gm.getImageData(0, 0, S, S);
  for (let i = 3; i < kol.data.length; i += 4) kol.data[i] = mask.data[i];
  g.putImageData(kol, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
// PALETY [cień, środek, czapka] ZDJĘTE Z REFERENCJI (Chubby Pixel): korony są CIEMNĄ, nasyconą
// MORSKĄ ZIELENIĄ z jasną miętową czapką — i właśnie ten kontrast z jasną trawą daje ten styl.
// ⚠️ To świadome odwrócenie wytycznej z 03.09 („korona ma być JAŚNIEJSZA od trawy") — wtedy
// korony były matową limonką bez formy i zlewały się z łąką; referencja z 19.09 mówi inaczej,
// a właściciel prosił o wierność referencji. Powrót: podnieść wszystkie trzy tony.
const PUF_PALETY = [
  [[34, 88, 76], [52, 131, 92], [126, 199, 132]],     // morska (główna)
  [[38, 94, 68], [62, 140, 88], [140, 206, 126]],     // cieplejsza
  [[28, 80, 74], [46, 120, 90], [112, 186, 134]],     // chłodna, ciemniejsza
  [[124, 66, 34], [190, 118, 46], [240, 188, 96]],    // jesienna
  [[22, 70, 66], [38, 100, 82], [96, 166, 124]],      // świerk (najciemniejszy, w błękit)
];
// mnożniki liczby i rozmiaru liści per styl (puchate: mniej, ale większe kłębki)
// puchate: DUŻO WIĘKSZE i RZADSZE kłębki (życzenie właściciela 19.09: „większe te kłęby i może mniej").
// 0.34 × count gatunku ≈ 3 kłębki na gałązkę → ~90 na drzewo, przy 2.0× rozmiarze — na referencji
// widać kilkanaście-kilkadziesiąt DUŻYCH brył, nie dwieście drobnych.
const STYL_LISCI = { puchate: { gestosc: 0.34, skala: 2.0 }, ghibli: { gestosc: 1, skala: 1 }, foto: { gestosc: 1, skala: 1 } };
let liscieMats = null;
const LISCIE_PALET = 5;
async function initLiscie() {
  // STYL LIŚCI (HORDA.drzewa({ styl: '...' })):
  //  'puchate' (domyślny, referencja Chubby Pixel 19.09) = proceduralne obłoczki `pufTexture`,
  //  'ghibli' = zdjęcia gałązek z ez-tree przerobione skryptem narzedzia/stylizuj_liscie.py,
  //  'foto'   = surowe zdjęcia z ez-tree.
  if (liscieMats) for (const m of liscieMats) { if (m.map) m.map.dispose(); m.dispose(); }
  const styl = DRZEWA_CFG.styl, foto = styl === 'foto';
  let def, pas;
  if (styl === 'puchate') {
    def = PUF_PALETY.map((p, i) => [pufTexture(p, 20260919 + i * 7919, i === 4), 0xffffff]);
    // tony siedzą w teksturze, więc światło ma tylko MODELOWAĆ bryłę, nie malować jej od nowa:
    // wąski zakres 0.86 → 1.30 (przy 0.72 → 1.24 ciemna morska tekstura schodziła w czerń).
    pas = [0.86, 0.24, 0.20];
  } else {
    const ld = new THREE.TextureLoader();
    const tex = async n => {
      const t = await ld.loadAsync('assets/drzewa/liscie_' + n + (foto ? '' : '_ghibli') + '.png');
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      return t;
    };
    const [oak, ash, aspen, pine] = await Promise.all(['oak', 'ash', 'aspen', 'pine'].map(tex));
    // ghibli: paleta siedzi w teksturze, `color` tylko lekko różnicuje palety chunka; pasma toon
    // łagodniejsze (0.66 / 1.02 / 1.30) niż na zdjęciach — jasna tekstura × 1.8 wypalała się do bieli.
    // foto: zdjęcia są średnio-zielone, a łąka limonkowa, więc odcień podbija w żółć, pasma mocniejsze.
    def = foto
      ? [[oak, 0xe2ffa0], [ash, 0xd8ffa4], [oak, 0xc6f894], [aspen, 0xffefae], [pine, 0xb8f2ac]]
      : [[oak, 0xffffff], [ash, 0xf6fff0], [oak, 0xe6f8e0], [aspen, 0xfff6e6], [pine, 0xeefcf2]];
    pas = foto ? [0.60, 0.60, 0.60] : [0.66, 0.36, 0.28];
  }
  liscieMats = def.map(([t, c]) => addCloudShadow(addWrapLight(addLiscieShader(new THREE.MeshLambertMaterial({
    map: t, color: c, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, emissive: 0x0a1c12 }), styl === 'puchate'),
    0.5, pas, [0.00, 0.22, 0.56, 0.72], [[0.78, 0.95, 1.05], [1.06, 1.03, 0.88]])));
}
// geometria kart liści zależna od stylu: puchate = billboard (1 karta), reszta = skrzyżowane 2 karty
const geoLisci = () => DRZEWA_CFG.styl === 'puchate' ? liscieGeoBill : liscieGeo;

// bufor chunka: `trunks` = pieńki/kłody (instancje trunkGeo), `drewno` = drzewa v5 (prefab +
// macierz + odcień → jedna zlana siatka), `liscie` = karty gałązek per paleta (instancje
// liscieGeo), plamki cienia, głazy
function nowyAkumulator() {
  return { trunks: [], drewno: [], natura: [], liscie: Array.from({ length: LISCIE_PALET }, () => []), blobs: [], rocks: [] };
}
// plamka cienia kontaktowego położona PO STOKU (kwaternion z normalnej terenu) —
// płaska plamka na zboczu wchodziła w ziemię z jednej strony, a z drugiej wisiała
const _bn = new THREE.Vector3(), _bq = new THREE.Quaternion();
function blobRec(x, z, sx, sz, ry = 0) {
  const E = 0.35;
  const dhx = (terrainH(x + E, z) - terrainH(x - E, z)) / (2 * E);
  const dhz = (terrainH(x, z + E) - terrainH(x, z - E)) / (2 * E);
  const q = new THREE.Quaternion().setFromUnitVectors(AX_Y, _bn.set(-dhx, 1, -dhz).normalize());
  if (ry) q.multiply(_bq.setFromAxisAngle(AX_Y, ry));
  return { x, y: gruntDoSadzenia(x, z) + 0.05, z, q, sx, sy: 1, sz };
}

// ═══════════════ DRZEWA v5: GATUNKI, PREFABY, STAWIANIE W CHUNKU ═══════════════
// Strojenie na żywo: HORDA.drzewa({ ziarno: 3 }) → inne ziarna prefabów + przebudowa świata;
// HORDA.drzewa({ liscSkala: 1.2, liscGestosc: 1.3 }) → większe / gęstsze liście. Klucze poniżej.
const DRZEWA_CFG = {
  ziarno: 7,                 // przesunięcie ziaren wszystkich prefabów
  naGatunek: 3,              // prefabów na gatunek (3 gatunki liściaste + świerk = 12 siatek)
  liscSkala: 1.0,            // mnożnik rozmiaru kart liści
  liscGestosc: 1.0,          // mnożnik liczby liści na gałązkę
  udzialSwierka: 0.25,       // ułamek drzew iglastych
  styl: 'puchate',           // 'puchate' (obłoczki, Chubby Pixel) | 'ghibli' (malarskie gałązki) | 'foto' (zdjęcia)
  pien: 'blady',             // 'blady' (kremowy, jak na referencji) | 'brazowy' (stary kolor z 18.09)
};
// Parametry w jednostkach gry (postać ≈ 2 j.). Znaczenie pól: nagłówek lib/drzewa-szkielet.js.
// `radius[0]` = promień pnia u nasady, wyższe = ułamek grubości rodzica w punkcie odejścia.
const GATUNKI = [
  { nazwa: 'dab', skala: [0.85, 1.15], opcje: {                // zwarty, gruby, sękaty
    levels: 2, length: [3.0, 2.3, 1.5], radius: [0.48, 0.62, 0.62], sections: [6, 5, 4], segments: [8, 6, 5],
    children: [5, 3], angle: [0, 52, 48], start: [0, 0.45, 0.25], taper: [0.55, 0.60, 0.75],
    gnarliness: [0.04, 0.10, 0.16], force: { direction: new THREE.Vector3(0, 1, 0), strength: 0.006 },
    kolnierz: 1.35, korzenie: { ile: 3, dl: 1.1, promien: 0.5 },
    liscie: { count: 8, start: 0.10, angle: 45, size: 1.30, var: 0.30 } } },
  { nazwa: 'smukle', skala: [0.90, 1.20], opcje: {             // wysoki pień, korona w słup, gałęzie ku górze
    levels: 2, length: [4.0, 2.4, 1.3], radius: [0.30, 0.55, 0.60], sections: [6, 5, 4], segments: [8, 6, 5],
    children: [5, 3], angle: [0, 34, 40], start: [0, 0.42, 0.25], taper: [0.50, 0.60, 0.75],
    gnarliness: [0.03, 0.07, 0.13], force: { direction: new THREE.Vector3(0, 1, 0), strength: 0.010 },
    kolnierz: 1.25, korzenie: { ile: 3, dl: 0.9, promien: 0.5 },
    liscie: { count: 7, start: 0.05, angle: 55, size: 1.20, var: 0.30 } } },
  { nazwa: 'rozlozyste', skala: [0.85, 1.10], opcje: {         // gruby pień, szeroki parasol (akacja)
    // pień 3.0 (było 2.2): przy 2.2 korona zaczynała się w trawie i drzewo czytało się jako krzak
    levels: 2, length: [3.0, 2.8, 1.6], radius: [0.52, 0.66, 0.62], sections: [6, 5, 4], segments: [8, 6, 5],
    children: [6, 3], angle: [0, 68, 52], start: [0, 0.60, 0.20], taper: [0.50, 0.55, 0.75],
    gnarliness: [0.05, 0.12, 0.18], force: { direction: new THREE.Vector3(0, 1, 0), strength: 0.004 },
    kolnierz: 1.40, korzenie: { ile: 4, dl: 1.3, promien: 0.5 },
    liscie: { count: 8, start: 0.10, angle: 42, size: 1.35, var: 0.30 } } },
  { nazwa: 'swierk', iglaste: true, skala: [0.85, 1.25], opcje: {   // pień + konary w 5 piętrach, łapy igieł
    // 30 konarów / 5 pięter (było 22/4): przy 5-6 łapach na piętro świerk wyglądał jak palma
    iglaste: true, levels: 1, length: [6.8, 2.5], radius: [0.32, 0.42], sections: [8, 4], segments: [7, 5],
    children: [30], angle: [0, 100], start: [0, 0.14], taper: [1, 1],
    gnarliness: [0.02, 0.02], force: { direction: new THREE.Vector3(0, 1, 0), strength: -0.003 },
    pietra: 5, stozek: 0.85, kolnierz: 1.25, korzenie: { ile: 3, dl: 0.8, promien: 0.5 },
    // igły: gałązki świerkowe wzdłuż konaru, rozmiar rośnie z długością konaru (0.4-2.1 j.)
    // ar 2.2 = łapa szeroka i niska; count 9 przy 0.34 gęstości puchatej → 3-4 łapy na konar
    liscie: { count: 6, start: 0.08, angle: 16, size: 0.42, naDlugosc: 0.62, var: 0.16, ar: 2.1 } } },
];
// PREFAB = { geo (siatka drewna w przestrzeni lokalnej, nasada w (0,0,0)), kepy [{p, q, sx, sy, sz}],
//            h, R (zasięg w poziomie + kępa), rPnia, iglaste, skala }
let PREFABY = null;
function generujPrefabyDrzew() {
  if (PREFABY) for (const p of [...PREFABY.lisciaste, ...PREFABY.iglaste]) p.geo.dispose();
  PREFABY = { lisciaste: [], iglaste: [] };
  let nr = 0;
  for (const g of GATUNKI) for (let k = 0; k < DRZEWA_CFG.naGatunek; k++, nr++) {
    const seed = (DRZEWA_CFG.ziarno * 1009 + nr * 7919 + 13) | 0;
    const o = Object.assign({}, g.opcje, { seed });
    const szk = generujSzkielet(o);
    const geo = siatkaGalezi(szk, { jasnosc: [1.0, 0.90, 0.80] });
    const rng = new RNG(seed ^ 0x5bd1e995);
    const liscie = lisciePrefab(szk, rng, o);
    let R = szk.rozpietosc;
    for (const l of liscie) R = Math.max(R, Math.hypot(l.p.x, l.p.z) + l.s);
    (g.iglaste ? PREFABY.iglaste : PREFABY.lisciaste).push({
      geo, liscie, h: szk.wysokosc, R, rPnia: szk.rPnia, rKolizji: szk.rKolizji, skala: g.skala, nazwa: g.nazwa });
  }
}
// ---- LIŚCIE PREFABU: port `generateLeaves` z ez-tree. Na każdej gałązce OSTATNIEGO poziomu
// `count` liści rozłożonych warstwowo od `start` do końca (slot + jitter, permutacja kątów
// wokół gałązki), orientacja = orientacja gałązki w tym punkcie × obrót wokół osi gałązki ×
// odchylenie o `angle` od niej; plus liść KOŃCOWY na czubku, wzdłuż gałązki (ez-tree:
// recordLeaf(lastSection)). Rozmiar = size (+ naDlugosc × długość gałązki — świerk ma konary
// od 0.4 do 2.1 j.) × (1 ± var). Mnożniki strojenia: DRZEWA_CFG.liscSkala / liscGestosc. ----
const _X1 = new THREE.Vector3(1, 0, 0), _Y1 = new THREE.Vector3(0, 1, 0);
function lisciePrefab(szk, rng, o) {
  const L = o.liscie, out = [];
  const st = STYL_LISCI[DRZEWA_CFG.styl] || STYL_LISCI.ghibli;
  const count = Math.max(1, Math.round(L.count * DRZEWA_CFG.liscGestosc * st.gestosc));
  const rozmiar = g => (L.size + (L.naDlugosc || 0) * g.length) * DRZEWA_CFG.liscSkala * st.skala * (1 + rng.random(L.var, -L.var));
  for (const g of szk.galezie) {
    if (g.korzen || g.level !== o.levels) continue;
    const S = g.sections, radialOffset = rng.random(), step = (1 - L.start) / count;
    const sloty = Array.from({ length: count }, (_, k) => k);
    for (let k = count - 1; k > 0; k--) { const r = Math.floor(rng.random() * (k + 1)); [sloty[k], sloty[r]] = [sloty[r], sloty[k]]; }
    for (let i = 0; i < count; i++) {
      const t = Math.min(0.999, L.start + (i + rng.random()) * step);
      const si = Math.floor(t * (S.length - 1)), A = S[si], B = S[Math.min(si + 1, S.length - 1)];
      const alpha = (t - si / (S.length - 1)) * (S.length - 1);
      const p = new THREE.Vector3().lerpVectors(A.origin, B.origin, alpha);
      const qA = new THREE.Quaternion().setFromEuler(A.orientation), qB = new THREE.Quaternion().setFromEuler(B.orientation);
      const radial = 2 * Math.PI * (radialOffset + (sloty[i] + rng.random(0.5, -0.5)) / count);
      const q = qA.slerp(qB, alpha)                  // A→B razem z pozycją (upstream ma odwrotnie)
        .multiply(new THREE.Quaternion().setFromAxisAngle(_Y1, radial)
        .multiply(new THREE.Quaternion().setFromAxisAngle(_X1, L.angle * Math.PI / 180)));
      out.push({ p, q, s: rozmiar(g), ar: L.ar || 1 });
    }
    const last = S[S.length - 1];
    out.push({ p: last.origin.clone(), q: new THREE.Quaternion().setFromEuler(last.orientation), s: rozmiar(g), ar: L.ar || 1 });
  }
  // JASNOŚĆ PER LIŚĆ (tanie AO korony, mnożone w makeTree przez odcień drzewa): góra korony i
  // obrzeże jasne, wnętrze i spód ciemniejsze — bez tego billboardowe kłębki dawały płaską,
  // jednolicie oświetloną chmurę. Zakres 0.70-1.00.
  let ymin = 1e9, ymax = -1e9, rmax = 0;
  for (const l of out) { ymin = Math.min(ymin, l.p.y); ymax = Math.max(ymax, l.p.y); rmax = Math.max(rmax, Math.hypot(l.p.x, l.p.z)); }
  for (const l of out) {
    const w = (l.p.y - ymin) / Math.max(0.5, ymax - ymin), r = Math.hypot(l.p.x, l.p.z) / Math.max(0.5, rmax);
    l.j = (0.80 + 0.20 * w) * (0.88 + 0.12 * r);
  }
  return out;
}
// ═══════════════ KRZAKI PUCHATE — te same kłębki co korony, ułożone w kopułkę ═══════════════
// Właściciel (19.09): „krzaki potrzebują innych kłębów, bardziej jak krzaki, spróbuj z lepszym".
// Na referencji (Chubby Pixel) krzak to DOKŁADNIE ten sam materiał co korona, tylko ułożony
// w niską, szeroką kopułkę przy ziemi. Robimy to tak samo: kłębki idą do `acc.liscie[paleta]`,
// czyli do TEGO SAMEGO InstancedMesha co liście drzew → ZERO dodatkowych draw calli i styl
// zgodny z koronami z definicji. (Modele krzaków z Quaternius zostawiamy na paprocie i trawy —
// one wnoszą inny kształt; jako „krzak" wyglądałyby jak obca wklejka obok naszych koron.)
// Kopułka: 2-3 pierścienie kłębków o malejącym promieniu, dolny szeroki i lekko wciśnięty
// w trawę (y poniżej gruntu), górny mniejszy — sylwetka wychodzi jak bochenek, nie kula.
function krzakPuchaty(x, z, rng, acc, paleta) {
  const g0 = terrainH(x, z);
  const R = 0.85 + rng() * 0.95;                   // promień krzaka 0.85-1.8 j. (postać ma ~2 j.)
  const wys = R * (0.72 + rng() * 0.30);
  const tint = 0.86 + rng() * 0.20;
  const pierscienie = [[4 + Math.floor(rng() * 2), 0.62, 0.10, 0.62], [3, 0.34, 0.52, 0.54], [1, 0.0, 0.86, 0.48]];
  for (const [n, prom, wy, roz] of pierscienie) {
    let a = rng() * 6.283;
    for (let i = 0; i < n; i++) {
      a += 6.283 / n * (0.7 + rng() * 0.6);
      const pr = R * prom * (0.8 + rng() * 0.4);
      const bx = x + Math.cos(a) * pr, bz = z + Math.sin(a) * pr;
      // -0.25 R: spód kłębka chowa się pod trawą, więc krzak „wyrasta", a nie leży na niej.
      // Wysokość z WŁASNEGO miejsca kłębka (był jeden `g0` ze środka krzaka na wszystkie) —
      // na ścianie kanionu kłębki wysunięte o 1,3 j. w bok wisiały w powietrzu (4-6% krzaków).
      const by = Math.min(g0, gruntDoSadzenia(bx, bz)) + wys * wy + R * 0.30 - 0.25 * R;
      const sk = R * roz * (0.85 + rng() * 0.35) * 2.0;   // ×2, bo karta ma nasadę w dole (patrz liscieGeoBill)
      // jasność: dół krzaka ciemniejszy, czubek jasny — ta sama sztuczka co w koronach
      acc.liscie[paleta].push({ x: bx, y: by, z: bz, q: _qKrzak, sx: sk, sy: sk, sz: sk,
                                tint: tint * (0.74 + 0.26 * wy) });
    }
  }
  acc.blobs.push(blobRec(x, z, R * 1.7, R * 1.5));
  return R;
}
const _qKrzak = new THREE.Quaternion();            // kłębki krzaka to billboardy — obrót nieużywany

// ---- MODELE NATURY (Quaternius, CC0): kwiaty, paprocie, kamienie. Wszystkie idą do jednej
// scalonej siatki chunka (`acc.natura` → flushDrewno z `naturaMat`), więc 1 draw call na chunk.
// `NATURA` wypełnia się w boot; dopóki jest null, chunk po prostu ich nie stawia.
let NATURA = null;
// materiał modeli: te same pasma toon co drewno, ale jaśniejsze (modele mają kolor zapieczony
// w wierzchołkach i są z natury ciemniejsze od naszej limonkowej łąki)
const naturaMat = addCloudShadow(addWrapLight(new THREE.MeshLambertMaterial({ vertexColors: true }),
  0.5, [0.74, 0.34, 0.30], [-0.20, 0.06, 0.32, 0.60]));
// GŁAZY DOSTAJĄ NASZ WŁASNY KAMIEŃ (właściciel 19.09: „tekstury głazom musisz zrobić, by pasowało,
// albo sam kolor im dać"). Atlas Quaternius jest szary i brudny — na referencji kamienie są
// JASNE, kremowo-ciepłe, z rozjaśnioną górą i chłodnym spodem. Nadpisujemy zapieczony atrybut
// `color` własnym gradientem po wysokości modelu (h jest znormalizowane do 1) + drobny szum
// z pozycji, żeby ściany nie były idealnie jednolite.
function przemalujGlazy() {
  const DOL = [0.50, 0.51, 0.53], GORA = [1.02, 1.00, 0.94];   // chłodny spód → ciepła, jasna góra
  for (const m of NATURA.glazy) {
    if (!m) continue;
    const P = m.geo.attributes.position, C = m.geo.attributes.color;
    for (let i = 0; i < P.count; i++) {
      const t = Math.max(0, Math.min(1, P.getY(i) / Math.max(0.2, m.h)));
      const w = t * t * (3 - 2 * t);
      const sz = 0.94 + 0.12 * vnoise(P.getX(i) * 6.3 + 11.7, P.getZ(i) * 6.3 - 4.1);
      C.setXYZ(i, (DOL[0] + (GORA[0] - DOL[0]) * w) * sz,
                  (DOL[1] + (GORA[1] - DOL[1]) * w) * sz,
                  (DOL[2] + (GORA[2] - DOL[2]) * w) * sz);
    }
    C.needsUpdate = true;
  }
}
const _mN = new THREE.Matrix4(), _qN = new THREE.Quaternion(), _vN = new THREE.Vector3(), _sN = new THREE.Vector3();
// `skalaWg`: 'h' = skalujemy po wysokości (krzaki, kwiaty), 'r' = po promieniu (płaskie kamyki,
// które po normalizacji do h=1 mają r do 2.9 i rozjechałyby się na pół chunka)
function stawModel(m, x, z, wys, rng, acc, skalaWg = 'h', tint = 1) {
  if (!m) return 0;
  const s = skalaWg === 'r' ? wys / Math.max(0.3, m.r) : wys;
  _qN.setFromAxisAngle(AX_Y, rng() * 6.283);
  _mN.compose(_vN.set(x, gruntDoSadzenia(x, z) - 0.05, z), _qN, _sN.set(s, s * (0.9 + rng() * 0.2), s));
  const j = tint * (0.9 + rng() * 0.2);
  acc.natura.push({ geo: m.geo, m: _mN.clone(), tint: new THREE.Color(j, j, j) });
  return s * m.r;
}

// ---- drzewo w chunku: prefab + obrót + skala + pochylenie 1-5° (pion co do milimetra czytał
// się jak słupek). Drewno → acc.drewno (zlewane w flushDrewno), liście → acc.liscie[paleta]
// (świerk zawsze paleta 4). Zwraca solid kolizji pnia. ----
const _mT = new THREE.Matrix4(), _qT = new THREE.Quaternion(), _qY = new THREE.Quaternion(),
      _vT = new THREE.Vector3(), _sT = new THREE.Vector3();
function makeTree(x, z, rng, acc, paletki) {
  const g0 = terrainH(x, z);
  const iglaste = rng() < DRZEWA_CFG.udzialSwierka;
  // ŚWIERK = GOTOWY MODEL z pakietu Quaternius (CC0). Własny świerk z kart z igłami właściciel
  // odrzucił dwa razy („do dupy", „tragiczne — zobacz w sieci, jak się robi”); poradniki do
  // stylizowanych iglaków mówią to samo, co robi Quaternius: gęsta trójkątna sylwetka
  // z warstwowymi, opadającymi gałęziami jako GEOMETRIA, nie karty. Model idzie do tej samej
  // scalonej siatki natury co krzaki i głazy, więc nie kosztuje osobnego draw calla.
  if (iglaste && NATURA && NATURA.iglaki && NATURA.iglaki[0]) {
    const mdl = NATURA.iglaki[Math.floor(rng() * NATURA.iglaki.length)] || NATURA.iglaki[0];
    const wys = 5.5 + rng() * 3.5;
    const r = stawModel(mdl, x, z, wys, rng, acc, 'h', 0.96 + rng() * 0.12);
    acc.blobs.push(blobRec(x, z, r * 0.9, r * 0.9));
    return { c: 1, x, z, r: Math.max(0.38, wys * 0.045), top: 99 };
  }
  const lista = iglaste ? PREFABY.iglaste : PREFABY.lisciaste;
  const pf = lista[Math.floor(rng() * lista.length)];
  const s = pf.skala[0] + rng() * (pf.skala[1] - pf.skala[0]);
  const yaw = rng() * 6.283, kat = rng() * 6.283, poch = 0.02 + rng() * 0.06;
  _qY.setFromAxisAngle(AX_Y, yaw);
  _qT.setFromAxisAngle(_vT.set(Math.cos(kat), 0, Math.sin(kat)), poch).multiply(_qY);   // świat = pochył × obrót
  _mT.compose(_vT.set(x, g0 - 0.12, z), _qT, _sT.set(s, s, s));
  // odcień drewna per drzewo: jasność ±8%, lekki dryf ciepły/chłodny
  const j = 0.92 + rng() * 0.16;
  const tint = new THREE.Color(j * (0.97 + rng() * 0.06), j, j * (0.95 + rng() * 0.06));
  acc.drewno.push({ geo: pf.geo, m: _mT.clone(), tint });
  // 0.72/0.28, nie 50/50: druga paleta chunka bywa jesienna, a przy remisie co drugie
  // drzewo w chunku wychodziło rude — łąka wyglądała jak w połowie października.
  // Losowanie ZAWSZE (także dla świerka): liczba losowań na drzewo musi być stała, inaczej
  // zmiana `udzialSwierka` przestawia pieńki, dekoracje i głazy całego chunka (recenzja 19.09)
  const rolPalety = rng();
  const paleta = iglaste ? 4 : paletki[rolPalety < 0.72 ? 0 : 1];
  const tintL = 0.92 + rng() * 0.16;
  for (const k of pf.liscie) {
    const p = k.p.clone().applyMatrix4(_mT);
    const sk = k.s * s;
    // sx = szerokość karty, sy = wysokość (billboard czyta obie osobno — patrz addLiscieShader)
    acc.liscie[paleta].push({ x: p.x, y: p.y, z: p.z, q: _qT.clone().multiply(k.q),
                              sx: sk * k.ar, sy: sk, sz: sk, tint: tintL * k.j });
  }
  acc.blobs.push(blobRec(x, z, pf.R * s * 0.8, pf.R * s * 0.8));
  // kolizja pnia: promień na wysokości klatki gracza (nie kołnierza) + margines na korę
  return { c: 1, x, z, r: Math.max(0.35, pf.rKolizji * s + 0.10), top: 99 };
}
// ---- DREWNO CHUNKA = JEDNA SIATKA: prefaby przepisane przez macierz drzewa (pozycje,
// normalne przez macierz normalnych, kolory × odcień). 1 draw call na chunk bez względu na
// liczbę prefabów; geometria należy do chunka (`wlasnaGeo` → dispose przy zwolnieniu). ----
const _nmT = new THREE.Matrix3();
// `mat` i flagi cieni podajemy z zewnątrz, bo tą samą drogą idzie DREWNO drzew i MODELE
// NATURY (Quaternius) — obie grupy to zbiór geometrii z macierzami, scalany w jedną siatkę.
function flushDrewno(recs, rocks, mat = galezieMat, cien = true, odbiera = false) {
  if (!recs.length) return null;
  let nV = 0, nI = 0;
  for (const r of recs) { nV += r.geo.attributes.position.count; nI += r.geo.index.count; }
  const pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3), col = new Float32Array(nV * 3);
  const idx = nV > 65535 ? new Uint32Array(nI) : new Uint16Array(nI);
  let v0 = 0, i0 = 0;
  for (const r of recs) {
    const g = r.geo, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, I = g.index;
    _nmT.getNormalMatrix(r.m);
    for (let i = 0; i < P.count; i++) {
      const o = (v0 + i) * 3;
      _vT.fromBufferAttribute(P, i).applyMatrix4(r.m);
      pos[o] = _vT.x; pos[o + 1] = _vT.y; pos[o + 2] = _vT.z;
      _vT.fromBufferAttribute(N, i).applyMatrix3(_nmT).normalize();
      nrm[o] = _vT.x; nrm[o + 1] = _vT.y; nrm[o + 2] = _vT.z;
      col[o] = C.getX(i) * r.tint.r; col[o + 1] = C.getY(i) * r.tint.g; col[o + 2] = C.getZ(i) * r.tint.b;
    }
    for (let i = 0; i < I.count; i++) idx[i0 + i] = I.getX(i) + v0;
    v0 += P.count; i0 += I.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(geo, mat);
  // receiveShadow WYŁĄCZONY dla drewna: własna korona rzucała na pień pełny cień z shadow mapy
  // i „gruby pień" wychodził czarną kreską. Osadzenie w trawie robi plamka kontaktowa.
  mesh.castShadow = cien; mesh.receiveShadow = odbiera;
  mesh.wlasnaGeo = true;
  scene.add(mesh); rocks.push(mesh);
  return mesh;
}

// PIEŃEK (do wskoczenia) i KŁODA (leży wzdłuż X albo Z — AABB kolizji jest osiowy)
function makeStump(x, z, rng, acc) {
  const g0 = terrainH(x, z), gr = 2.2 + rng() * 0.8, h = 0.35 + rng() * 0.25;
  acc.trunks.push({ x, y: g0, z, ry: rng() * 6.28, sx: gr, sy: h, sz: gr });
  acc.blobs.push(blobRec(x, z, gr * 0.85, gr * 0.85));
  return { c: 1, x, z, r: gr * 0.24, top: g0 + h };
}
function makeLog(x, z, rng, acc) {
  const g0 = terrainH(x, z), gr = 1.6 + rng() * 0.6, dl = 2.6 + rng() * 1.6;
  const wzdluzX = rng() < 0.5, ry = (wzdluzX ? 0 : Math.PI / 2) + (rng() - 0.5) * 0.16;
  // trunkGeo stoi na y=0; rz=90° kładzie go wzdłuż -X, potem ry wybiera kierunek
  const r = gr * 0.22;
  // po rz=90° walec biegnie w -X; po ry=90° w +Z — stąd różne znaki przesunięcia środka
  acc.trunks.push({ x: x + (wzdluzX ? dl / 2 : 0), y: g0 + r * 0.8, z: z - (wzdluzX ? 0 : dl / 2),
                    ry, rz: Math.PI / 2, sx: gr, sy: dl, sz: gr });
  acc.blobs.push(blobRec(x, z, dl * 0.95, gr * 0.7, ry));
  return { x, z, hw: wzdluzX ? dl / 2 : r * 1.3, hl: wzdluzX ? r * 1.3 : dl / 2, top: g0 + r * 1.8 };
}
// składa rekordy {x,y,z, rx/ry/rz albo q, sx,sy,sz, tint?} w JEDEN InstancedMesh
const _io = new THREE.Object3D(), _ic = new THREE.Color();
function flushInst(geo, mat, recs, rocks, cien = true, odbiera = cien) {
  if (!recs.length) return null;
  const inst = new THREE.InstancedMesh(geo, mat, recs.length);
  recs.forEach((r, i) => {
    _io.position.set(r.x, r.y, r.z);
    if (r.q) _io.quaternion.copy(r.q); else _io.rotation.set(r.rx || 0, r.ry || 0, r.rz || 0);
    _io.scale.set(r.sx, r.sy, r.sz);
    _io.updateMatrix();
    inst.setMatrixAt(i, _io.matrix);
    if (r.tint !== undefined) inst.setColorAt(i, r.tint.isColor ? r.tint : _ic.setScalar(r.tint));
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.castShadow = cien; inst.receiveShadow = odbiera;
  inst.computeBoundingSphere();                    // r160: sfera obejmuje instancje → działa frustum culling
  scene.add(inst); rocks.push(inst);
  return inst;
}
// PLAMKI CIENIA KONTAKTOWEGO CAŁEGO ŚWIATA = JEDEN InstancedMesh (1 draw call zamiast
// 1 na chunk; przy 19 chunkach w kadrze to było 19 calli). Zbierane z `blobRecs`
// wszystkich załadowanych chunków, przebudowywane tylko gdy zmienia się zbiór chunków
// (ensureChunks przechodzi dalej niż `lastCC` tylko po przejściu granicy chunka).
let worldBlobs = null;
function rebuildBlobs() {
  if (worldBlobs) { scene.remove(worldBlobs); worldBlobs.dispose(); worldBlobs = null; }
  const recs = [];
  for (const ch of chunkMap.values()) if (ch.blobRecs) for (const r of ch.blobRecs) recs.push(r);
  if (!recs.length) return;
  worldBlobs = new THREE.InstancedMesh(blobGeo, blobMat, recs.length);
  recs.forEach((r, i) => {
    _io.position.set(r.x, r.y, r.z); _io.quaternion.copy(r.q); _io.scale.set(r.sx, 1, r.sz);
    _io.updateMatrix(); worldBlobs.setMatrixAt(i, _io.matrix);
  });
  worldBlobs.instanceMatrix.needsUpdate = true;
  worldBlobs.frustumCulled = false;
  scene.add(worldBlobs);
}

// ============ TRAWA — DYWAN ŹDŹBEŁ (BotW/Genshin style) ============
// Jedna InstancedMesh z tysiącami źdźbeł, zakotwiona w siatce ŚWIATA (bez migotania),
// przebudowywana gdy gracz odejdzie od środka. Gradient w vertex colors + wiatr w shaderze.
// ---- KĘPKA TRAWY: alfa-tekstura pęku źdźbeł (technika z forum three.js:
// „image of a grass clump on a 2 triangle quad" — kilka razy taniej niż osobne źdźbła) ----
// STYL ZELDA BotW / GENSHIN (życzenie właściciela): kępka = WIĄZKA długich, wąskich,
// gładkich źdźbeł z gradientem WALOROWYM (ciemna nasada → soczysta zieleń → jasny
// „rim" na czubku), jeden spójny odcień (nie pstrokate), płasko, bez fotorealizmu.
// Pixel-artowe są postacie; trawa może być gładka — jak w referencji „pixel art na
// tle stylizowanego 3D". ATLAS 2×1: dwie różne kępki w jednej teksturze, wybór per
// instancja w vertex shaderze (makeBladeMaterial) — zero dodatkowych materiałów.
function clumpTexture() {
  const S = 128, W = S * 2;
  const c = document.createElement('canvas'); c.width = W; c.height = S;
  const g = c.getContext('2d');
  const rys = (ox, ile, seed, wysMin) => {
    let s = seed;                                    // własny RNG = tekstura powtarzalna
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < ile; i++) {
      const bx = 6 + (i / (ile - 1)) * (S - 12) + (rnd() - 0.5) * 6;
      const wys = S * (wysMin + rnd() * (0.98 - wysMin));
      const gy = S - wys;                            // czubek
      const lean = (rnd() - 0.5) * 14;               // pochylenie od nasady → prześwity między ostrzami
      const wyg = (rnd() - 0.5) * 34;                // wygięcie czubka (± 17 px)
      const szer = 3.6 + rnd() * 2.4;                // 3.6-6 px u nasady — mięsisty liść (referencje właściciela), nie nitka
      // walor: nasada w cieniu, środek soczysty, czubek łapie światło (jasny rim);
      // odcień jeden, różni się tylko jasnością (± 8%) między ostrzami
      const j = 0.92 + rnd() * 0.16;
      const col = (r, gg, b) => `rgb(${Math.min(255, r * j) | 0},${Math.min(255, gg * j) | 0},${Math.min(255, b * j) | 0})`;
      const gr = g.createLinearGradient(0, S, 0, gy);
      // PALETA Z REFERENCJI WŁAŚCICIELA (03.09): limonkowo-żółta, wysoka jasność,
      // nasada tylko odrobinę ciemniejsza — nie ciemnozielona
      gr.addColorStop(0.00, col(96, 158, 42));
      gr.addColorStop(0.40, col(146, 208, 56));
      gr.addColorStop(0.82, col(190, 236, 84));
      gr.addColorStop(1.00, col(228, 250, 138));
      g.fillStyle = gr;
      // źdźbło = wąski liść: dwie krzywe od nasady do wspólnego czubka
      const tx = bx + lean + wyg, mx = bx + lean * 0.5 + wyg * 0.28, my = S - wys * 0.55;
      g.beginPath();
      g.moveTo(ox + bx - szer / 2, S);
      g.quadraticCurveTo(ox + mx - szer * 0.32, my, ox + tx, gy);
      g.quadraticCurveTo(ox + mx + szer * 0.32, my, ox + bx + szer / 2, S);
      g.closePath(); g.fill();
    }
  };
  rys(0, 22, 12345, 0.50);                          // wariant A
  rys(S, 24, 98765, 0.56);                          // wariant B: więcej, wyższych ostrzy
  const t = new THREE.CanvasTexture(c);
  // Gładko z bliska (Linear), Z DALEKA mipmapy: bez nich wąskie ostrza migotały
  // jak śnieg na ekranie. Mipmapy + alphaTest skracają dalekie kępki — pasuje do
  // wtapiania dywanu na skraju.
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// dwa skrzyżowane quady = kępka czytelna z każdej strony
function clumpGeometry() {
  const w = 1, h = 1;
  const poz = [], uv = [], idx = [], nor = [], kol = [];
  const dodajQuad = (kat) => {
    const s = Math.sin(kat), c2 = Math.cos(kat), o = poz.length / 3;
    poz.push(-w / 2 * c2, 0, -w / 2 * s,  w / 2 * c2, 0, w / 2 * s,
             -w / 2 * c2, h, -w / 2 * s,  w / 2 * c2, h, w / 2 * s);
    uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    for (let i = 0; i < 4; i++) { nor.push(0, 1, 0); kol.push(1, 1, 1); }
    idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
  };
  dodajQuad(0); dodajQuad(Math.PI / 2);
  const gm = new THREE.BufferGeometry();
  gm.setAttribute('position', new THREE.Float32BufferAttribute(poz, 3));
  gm.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  gm.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  // BIAŁY atrybut koloru jest KONIECZNY przy vertexColors:true — bez niego
  // shader mnoży przez zero i wszystko renderuje się na czarno.
  gm.setAttribute('color', new THREE.Float32BufferAttribute(kol, 3));
  gm.setIndex(idx);
  return gm;
}

// KWIATKI: kępka 3-4 łodyg z kwiatem na czubku. Płatki są BIAŁE, bo barwę
// nadaje instanceColor — dzięki temu jedna tekstura daje białe, żółte, różowe
// i liliowe łany (kolor losowany per PLAMA terenu, nie per kwiatek, więc
// tworzą się pola jednego koloru jak w Genshinie).
function flowerTexture() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // TYLKO 3 kwiaty na kępkę, za to z DUŻĄ główką — przy 128 px tekstury i kamerze
  // z góry mniejsze płatki gubiły się w dywanie trawy (sprawdzone: były kropkami).
  const ile = 3;
  for (let i = 0; i < ile; i++) {
    const bx = 26 + (i / (ile - 1)) * (S - 52) + (Math.random() - 0.5) * 8;
    const wys = S * (0.55 + Math.random() * 0.3);
    const gy = S - wys;                                    // czubek = główka kwiatu
    const wygiecie = (Math.random() - 0.5) * 14;
    // łodyga
    g.strokeStyle = '#3c7a2b'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(bx, S);
    g.quadraticCurveTo(bx + wygiecie * 0.6, S - wys * 0.5, bx + wygiecie, gy + 6);
    g.stroke();
    // dwa listki
    g.fillStyle = '#4b9134';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(bx + wygiecie * 0.4 + s * 6, S - wys * 0.45, 7, 3.2, s * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    // płatki (6) + środek
    const px = bx + wygiecie, r = 11 + Math.random() * 3;
    g.fillStyle = '#ffffff';
    for (let p = 0; p < 6; p++) {
      const a = p / 6 * Math.PI * 2 + Math.random() * 0.2;
      g.beginPath();
      g.ellipse(px + Math.cos(a) * r * 0.85, gy + Math.sin(a) * r * 0.85, r * 0.6, r * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.arc(px, gy, r * 0.5, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// WYSOKIE TRAWY (drugi wariant źdźbeł): suche łodygi z kłosem — na płowych łąkach
function stalkTexture() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const ile = 7;
  for (let i = 0; i < ile; i++) {
    const bx = 16 + (i / (ile - 1)) * (S - 32) + (Math.random() - 0.5) * 8;
    const wys = S * (0.62 + Math.random() * 0.36);
    const gy = S - wys;
    const wygiecie = (Math.random() - 0.5) * 30;           // suche łodygi mocniej się kładą
    const gr = g.createLinearGradient(0, S, 0, gy);
    gr.addColorStop(0, '#7d8f45'); gr.addColorStop(1, '#cfc274');
    g.strokeStyle = gr; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(bx, S);
    g.quadraticCurveTo(bx + wygiecie * 0.5, S - wys * 0.55, bx + wygiecie, gy);
    g.stroke();
    // kłos: kilka ziarenek wzdłuż czubka
    g.fillStyle = '#e2d489';
    for (let k = 0; k < 5; k++) {
      const t2 = k / 5;
      g.beginPath();
      g.ellipse(bx + wygiecie * (1 - t2 * 0.25), gy + t2 * wys * 0.22, 2.6, 4.2, wygiecie * 0.01, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bladeGeometry() {
  const w = 0.055, h = 1;                       // wąskie źdźbło (było za szerokie = słoma)
  const P = [], C = [], I = [];
  const lvl = [[0, w, 0], [0.5, w * 0.85, 0.03], [0.82, w * 0.6, 0.08], [1, 0, 0.14]];
  const dolem = [0.24, 0.52, 0.14], gora = [0.78, 1.00, 0.42];
  for (let i = 0; i < lvl.length; i++) {
    const [y, hw, z] = lvl[i], t = y;
    const col = [dolem[0] + (gora[0] - dolem[0]) * t, dolem[1] + (gora[1] - dolem[1]) * t,
                 dolem[2] + (gora[2] - dolem[2]) * t];
    if (hw > 0) { P.push(-hw, y * h, z, hw, y * h, z); C.push(...col, ...col); }
    else { P.push(0, y * h, z); C.push(...col); }
  }
  I.push(0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}
const bladeGeo = clumpGeometry();   // KĘPKI (2 skrzyżowane quady) — tanio i gęsto
let bladeMat = null, grassField = null;
let flowerMat = null, flowerField = null;      // kwiatki (kolor z instanceColor)
let stalkMat = null, stalkField = null;        // wysokie suche trawy z kłosem
// uniformy dywanu: środek (gracz) + promień — do PŁYNNEGO WYRASTANIA (bez wyskakiwania)
const grassCenterU = { value: new THREE.Vector2() };
const grassRU = { value: 20 };

// ================= POLE NACISKU: TRAWA UGINA SIĘ POD HORDĄ =================
// 500 pozycji wrogów nie da się przekazać do shadera uniformami, więc — jak w każdym
// dużym silniku — trzymamy je w TEKSTURZE wokół gracza, a vertex shader czyta ją per kępkę.
// RESEARCH (Ghost of Tsushima, GDC 2022: „displacement buffer"; Helio/Pulsar foliage
// system; tutoriale UE4 Kodeco i Unity): NIKT nie liczy kierunku z gradientu skalara.
// Standard to POLE WEKTOROWE (flowmap) wokół gracza:
//   • RG = kierunek położenia trawy, 128 = zero (jak w normal mapie: v*0.5+0.5),
//     zapisywany PROSTO z ruchu interaktora — trawa kładzie się TAM, GDZIE KTOŚ PRZEBIEGŁ,
//   • B  = siła zgniecenia (max, nie suma — inaczej tłum zeruje wszystko),
//   • pole snapowane do texela i przesuwane o CAŁE texele (zero resamplingu),
//   • zanik WYKŁADNICZY (`v *= exp(-dt/tau)`) — trawa wstaje, za hordą zostaje ślad.
// ⚠️ PIERWSZA WERSJA (v89) brała kierunek z GRADIENTU skalarnego pola i wyglądała jak
// KRATER: trawa kładła się promieniście wokół gracza (kółko jak po eksplozji), plama
// miała 4 j. średnicy przy postaci szerokiej na 0.6, przeskakiwała o cały texel (0.75 j.),
// falloff miał trzy stopnie → widoczne kwadraty texeli, a amplituda (0.95 j. w LOKALNYCH
// jednostkach, przy skali instancji xz≈1.2 / y≈0.7) wywalała czubek DWA RAZY DALEJ niż
// kępka jest wysoka — stąd „rozsypana słoma" zamiast położonej trawy.
const TR_RES = 160, TR_SPAN = 56;                  // 0.35 j./texel (było 0.75 = widoczna krata)
const TR_ST = TR_SPAN / TR_RES;
const trBuf = new Uint8Array(TR_RES * TR_RES * 4);
const trU32 = new Uint32Array(trBuf.buffer);       // szybkie przesuwanie + test „texel spokojny"
const trampleTex = new THREE.DataTexture(trBuf, TR_RES, TR_RES, THREE.RGBAFormat);
trampleTex.minFilter = trampleTex.magFilter = THREE.LinearFilter;
trampleTex.wrapS = trampleTex.wrapT = THREE.ClampToEdgeWrapping;
trampleTex.needsUpdate = true;
// Stan spoczynku trzymamy jako jedno uint32, żeby pętla zaniku przeskakiwała pusty
// texel JEDNYM porównaniem (przy pustym polu cała aktualizacja jest wtedy darmowa).
trBuf[0] = 128; trBuf[1] = 128; trBuf[2] = 0; trBuf[3] = 255;
const TR_REST = trU32[0];
trU32.fill(TR_REST);
const trampleU = { value: trampleTex };
const trCenterU = { value: new THREE.Vector2(1e9, 1e9) };
const trKatU = { value: 1.02 };                    // maks. pochylenie kępki w radianach (~58°)
let trCx = 1e9, trCz = 1e9;
let trAktywne = 0;                                 // zajęte texele (diagnostyka wydajności)

// STEMPEL. Środek jest PODTEXELOWY (plama płynie za postacią, zamiast przeskakiwać
// o texel), spadek gładki (smoothstep — zero plateau i schodków), a kierunek to
// mieszanka RUCHU interaktora i rozpychania na boki: postać stojąca rozgarnia trawę
// promieniście (mały krążek pod stopami), biegnąca kładzie ją w stronę biegu.
function stampTrample(x, z, vx, vz, promien, moc) {
  const cx = (x - trCx) / TR_ST + TR_RES * 0.5;
  const cz = (z - trCz) / TR_ST + TR_RES * 0.5;
  const rT = promien / TR_ST;
  const i0 = Math.max(0, Math.ceil(cx - rT)), i1 = Math.min(TR_RES - 1, Math.floor(cx + rT));
  const j0 = Math.max(0, Math.ceil(cz - rT)), j1 = Math.min(TR_RES - 1, Math.floor(cz + rT));
  if (i1 < i0 || j1 < j0) return;
  const vl = Math.sqrt(vx * vx + vz * vz);
  const wR = vl < 3.2 ? vl / 3.2 : 1;              // im szybciej, tym mocniej rządzi kierunek biegu
  const mx = vl > 0.02 ? vx / vl : 0, mz = vl > 0.02 ? vz / vl : 0;
  const invR = 1 / rT, wPro = 1 - wR * 0.55;
  for (let j = j0; j <= j1; j++) {
    const dz = j - cz, dz2 = dz * dz;
    for (let i = i0; i <= i1; i++) {
      const dx = i - cx;
      const d = Math.sqrt(dx * dx + dz2);
      if (d > rT) continue;
      const t = 1 - d * invR;
      const s = t * t * (3 - 2 * t) * moc;
      const inv = d > 0.001 ? wPro / d : 0;
      let kx = mx * wR + dx * inv, kz = mz * wR + dz * inv;
      const kl = Math.sqrt(kx * kx + kz * kz) || 1;
      const o = (j * TR_RES + i) * 4;
      // RG = SUMA wektorów: naciski z przeciwnych stron znoszą się, więc w środku
      // ciżby zostaje samo zgniecenie w dół (B) bez losowego kierunku — tak jak w naturze.
      const r = trBuf[o] - 128 + kx / kl * s * 110, g = trBuf[o + 1] - 128 + kz / kl * s * 110;
      trBuf[o] = r < -127 ? 1 : r > 127 ? 255 : 128 + r;
      trBuf[o + 1] = g < -127 ? 1 : g > 127 ? 255 : 128 + g;
      const b = s * 255;
      if (b > trBuf[o + 2]) trBuf[o + 2] = b;
      trBuf[o + 3] = 255;                          // A pilnuje, by texel nie udawał spoczynku
    }
  }
}
function updateTrample(dt) {
  if (MAPS[mapKey].indoor) return;                 // w markecie nie ma trawy
  // ŚRODEK SNAPOWANY DO TEXELA: bez tego te same punkty świata wypadałyby po każdym
  // przesunięciu w innym miejscu texela i cały dywan drgałby przy marszu.
  const nx = Math.round(P.pos.x / TR_ST) * TR_ST, nz = Math.round(P.pos.z / TR_ST) * TR_ST;
  if (nx !== trCx || nz !== trCz) {
    const dx = Math.round((nx - trCx) / TR_ST), dz = Math.round((nz - trCz) / TR_ST);
    if (!isFinite(dx) || !isFinite(dz) || Math.abs(dx) >= TR_RES || Math.abs(dz) >= TR_RES) {
      trU32.fill(TR_REST);
    } else {
      // Przesunięcie o CAŁE texele = ślady przyklejone do świata (wygięta trawa nie
      // jedzie za graczem). Kopiujemy CAŁYMI RZĘDAMI przez copyWithin (memmove),
      // bez bufora pomocniczego; kolejność rzędów wg znaku dz, żeby nie nadpisać źródła.
      const i0 = Math.max(0, -dx), i1 = Math.min(TR_RES, TR_RES - dx);
      const rzad = j => {
        const src = j + dz, d0 = j * TR_RES;
        if (src < 0 || src >= TR_RES || i1 <= i0) { trU32.fill(TR_REST, d0, d0 + TR_RES); return; }
        const s0 = src * TR_RES;
        trU32.copyWithin(d0 + i0, s0 + i0 + dx, s0 + i1 + dx);
        if (i0 > 0) trU32.fill(TR_REST, d0, d0 + i0);
        if (i1 < TR_RES) trU32.fill(TR_REST, d0 + i1, d0 + TR_RES);
      };
      if (dz > 0) for (let j = 0; j < TR_RES; j++) rzad(j);
      else for (let j = TR_RES - 1; j >= 0; j--) rzad(j);
    }
    trCx = nx; trCz = nz;
    trCenterU.value.set(nx, nz);
  }
  // ZANIK WYKŁADNICZY (tau 0.45 s): trawa wstaje, więc za hordą zostaje ślad na ~1.2 s.
  const zanik = Math.exp(-dt / 0.45);
  let akt = 0;
  for (let k = 0, o = 0; k < trU32.length; k++, o += 4) {
    if (trU32[k] === TR_REST) continue;            // pusty texel = jedno porównanie
    const r = (trBuf[o] - 128) * zanik, g = (trBuf[o + 1] - 128) * zanik, b = trBuf[o + 2] * zanik;
    if (b < 2 && r > -2 && r < 2 && g > -2 && g < 2) { trU32[k] = TR_REST; continue; }
    trBuf[o] = 128 + r; trBuf[o + 1] = 128 + g; trBuf[o + 2] = b;
    akt++;
  }
  trAktywne = akt;
  // Promienie stempli ~= promień postaci (0.4-0.6), nie 2 j. jak w v89. Kierunek gracza
  // z jego prędkości, wrogów — z wektora do celu (i tak wszyscy idą po gracza).
  stampTrample(P.pos.x, P.pos.z, P.vx, P.vz, 0.62, 1);
  for (const e of G.enemies) {
    if (e.dying) continue;
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1, s = e.T.speed / d;
    stampTrample(e.pos.x, e.pos.z, dx * s, dz * s,
                 e.T.boss ? 1.5 : e.elite ? 0.66 : 0.44, e.T.boss ? 1 : 0.92);
  }
  trampleTex.needsUpdate = true;
}
function makeBladeMaterial(mapa = null, gietkosc = 1) {
  const atlas = !mapa;                             // domyślna tekstura kępki = atlas 2×1
  const m = new THREE.MeshBasicMaterial({ map: mapa || clumpTexture(), alphaTest: 0.42,
    side: THREE.DoubleSide, vertexColors: true });
  addCloudShadow(m);
  const _wind = m.onBeforeCompile;
  m.onBeforeCompile = sh => {
    if (_wind) _wind(sh);                          // ⚠️ łańcuch onBeforeCompile — nie nadpisywać
    sh.uniforms.uTime = windU;
    sh.uniforms.uCenter = grassCenterU;
    sh.uniforms.uR = grassRU;
    sh.uniforms.uTr = trampleU;
    sh.uniforms.uTrC = trCenterU;
    sh.uniforms.uTrKat = trKatU;
    sh.vertexShader = 'uniform float uTime;uniform vec2 uCenter;uniform float uR;' +
      'uniform sampler2D uTr;uniform vec2 uTrC;uniform float uTrKat;\n' +
      sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 iP = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       ${atlas ? '// atlas 2x1: lewa/prawa połowa tekstury wg hasha pozycji instancji\n' +
         '       vMapUv.x = vMapUv.x * 0.5 + 0.5 * step(0.5, fract(sin(dot(iP.xz, vec2(41.31, 17.77))) * 2357.13));' : ''}
       float dC = distance(iP.xz, uCenter);
       float fade = 1.0 - smoothstep(uR - 22.0, uR - 0.5, dC);  // bardzo szerokie wtapianie
       transformed.y *= fade;
       float h = max(position.y, 0.0);
       // ---- POLE NACISKU: RG = kierunek położenia, B = siła ----
       vec2 tuv = (iP.xz - uTrC) * ${(1 / TR_SPAN).toFixed(7)} + 0.5;
       // okno wygasza pole na krawędzi tekstury: bez tego ClampToEdge rozsmarowałby
       // brzegowy texel na CAŁĄ dalszą trawę w tym kierunku
       vec2 tw = smoothstep(0.0, 0.04, tuv) * (1.0 - smoothstep(0.96, 1.0, tuv));
       vec4 tr = texture2D(uTr, tuv);
       float nac = tr.b * tw.x * tw.y;
       // PORYW: długa fala (~90 j.) biegnąca po łące ~9 j./s; max(0,·)^3 = wąski
       // grzbiet, między porywami trawa wraca do zwykłego kołysania
       float gust = max(0.0, sin(uTime * 0.6 - iP.x * 0.055 - iP.z * 0.04));
       gust = gust * gust * gust;
       float sw = sin(uTime * 2.2 + iP.x * 0.45 + iP.z * 0.35) * 0.28 * h * fade
                + sin(uTime * 0.7 + iP.x * 0.08) * 0.10 * h * fade    // druga, wolna fala
                + gust * 0.15 * h * fade;
       sw *= 1.0 - nac * 0.85;                     // przygnieciona trawa nie kołysze się na wiatrze
       transformed.x += sw;
       transformed.z += sw * 0.45;
       // ---- UGINANIE POD HORDĄ ----
       if (nac > 0.004) {
         vec2 kier = tr.rg * 2.0 - 1.0;
         float kl = length(kier);
         if (kl > 0.06) {
           // Kładziemy kępkę KĄTEM (bok = sin, wysokość = cos), a nie samym przesunięciem
           // w poziomie — czubek zostaje wtedy na łuku wokół nasady, zamiast odjeżdżać
           // od korzenia (to była „rozsypana słoma" z v89). Kąt maks. ~58°, bo przy
           // płasko leżących skrzyżowanych quadach widać teksturę z boku = kreski.
           float hs = fract(sin(dot(iP.xz, vec2(12.9898, 78.233))) * 43758.5453);
           float kat = uTrKat * ${gietkosc.toFixed(3)} * nac * (0.78 + 0.44 * hs);
           // KOREKTA PROPORCJI INSTANCJI: kępka jest szersza niż wyższa (skala xz ~1.2,
           // y ~0.7), a przesunięcie liczymy w LOKALNYCH jednostkach — bez tego ten sam
           // „kąt" wywala czubek dwa razy dalej, niż kępka jest wysoka.
           float sxz = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
           transformed.xz += (kier / kl) * sin(kat) * h * fade * (sy / max(sxz, 0.001));
           transformed.y *= cos(kat);
         }
       }`);
  };
  return m;
}
// krok 0.60 (było 0.66) = ~21% gęściej; promień 52 (było 56) trzyma tę samą
// liczbę komórek (~23.6 tys.) i ten sam koszt przebudowy
const GRASS_STEP = 0.60;
let GRASS_R = 24, GRASS_MAX = 14000;
const grassCenter = new THREE.Vector2(1e9, 1e9);
const waterKol = new THREE.Vector2(1e9, 1e9);
const _gm = new THREE.Object3D(), _gc = new THREE.Color();

// pomocnik: jedno pole instancji na tej samej geometrii kępki (wiatr + wtapianie w shaderze)
function makeField(mat, max) {
  const f = new THREE.InstancedMesh(bladeGeo, mat, max);
  f.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  f.frustumCulled = false;
  f.count = 0;
  scene.add(f);
  return f;
}
function initGrassField() {
  const maloMocy = matchMedia('(pointer:coarse)').matches || innerWidth < 700;
  GRASS_R = maloMocy ? 31 : 52;
  GRASS_MAX = maloMocy ? 9000 : 26000;
  for (const f of [grassField, flowerField, stalkField]) if (f) { scene.remove(f); f.dispose(); }
  grassField  = makeField(bladeMat, GRASS_MAX);
  flowerField = makeField(flowerMat, Math.round(GRASS_MAX * 0.14));
  stalkField  = makeField(stalkMat, Math.round(GRASS_MAX * 0.12));
  grassCenter.set(1e9, 1e9);
}
// palety kwiatów — losowane per PLAMA terenu, więc powstają łany jednego koloru
const KWIAT_KOL = [[1.00, 1.00, 1.00], [1.00, 0.90, 0.42], [1.00, 0.70, 0.80], [0.80, 0.76, 1.00]];
function updateGrassField() {
  if (!grassField || MAPS[mapKey].indoor) {
    for (const f of [grassField, flowerField, stalkField]) if (f) f.count = 0;
    return;
  }
  grassCenterU.value.set(P.pos.x, P.pos.z);        // shader ściemnia/skraca źdźbła przy brzegu
  grassRU.value = GRASS_R;
  // Przebudowa kosztuje ~9.6 ms (siatka 171x171). Przy progu 1.2 j. i predkosci
  // 7.1 j./s wypadala SZESC RAZY NA SEKUNDE = 58 ms/s zjedzone i szesc zadlawien.
  // Shader wtapia zdzbla w 22 j., wiec 6 j. progu nikomu nie wyskoczy przed nosem.
  if (Math.hypot(P.pos.x - grassCenter.x, P.pos.z - grassCenter.y) < 6) return;
  grassCenter.set(P.pos.x, P.pos.z);
  siatkaCache(P.pos.x, P.pos.z, GRASS_R + 4);      // węzły siatki terenu raz na przebudowę
  const osGr = !!MAPS[mapKey].osiedle;
  _osGrKx = 1e9;                                   // osiedle: chunki mogły się przebudować od ostatniego razu
  const cx = Math.round(P.pos.x / GRASS_STEP), cz = Math.round(P.pos.z / GRASS_STEP);
  const cells = Math.ceil(GRASS_R / GRASS_STEP);
  const maxK = flowerField.instanceMatrix.count, maxS = stalkField.instanceMatrix.count;
  let n = 0, nk = 0, ns = 0;
  for (let ix = -cells; ix <= cells && n < GRASS_MAX; ix++) {
    for (let iz = -cells; iz <= cells && n < GRASS_MAX; iz++) {
      if (ix * ix + iz * iz > cells * cells) continue;
      const gx = cx + ix, gz = cz + iz;
      const r1 = hash2(gx, gz), r2 = hash2(gx + 7777, gz - 313), r3 = hash2(gx - 99, gz + 1234);
      if (r3 > 0.975) continue;                                  // minimum łysin
      const x = gx * GRASS_STEP + (r1 - 0.5) * GRASS_STEP * 0.9;
      const z = gz * GRASS_STEP + (r2 - 0.5) * GRASS_STEP * 0.9;
      const y = gruntZCache(x, z);                               // nigdy nad rysowaną siatką
      if (MAPS[mapKey].rzeki && nachylenieZCache(x, z) > 0.85) continue;   // skała — bez trawy
      if (osGr && !osTrawa(x, z)) continue;                      // osiedle: tylko trawniki (maska gruntu)
      const nadW = y - wodaY(x, z);                              // wysokość nad lustrem wody
      if (nadW < 0.03) continue;                                 // nie w wodzie (rośnie do samego brzegu)
      const b = biome(x, z);
      const r4 = hash2(gx + 555, gz + 999);
      _gm.position.set(x, y - 0.02, z);
      // ---- TRZCINY / SITOWIE tuż przy wodzie: wysokie, ciemnozielone łodygi na
      // teksturze kłosów (barwę daje instanceColor). Osobny, wąski pas wysokości,
      // żeby brzeg czytał się jako brzeg, a nie jako łysina obok tafli.
      // RZADKO i w KĘPACH (r4 < 0.16): przy r4 < 0.5 wychodził jednolity płot łodyg
      // wzdłuż całego brzegu, który zasłaniał piasek i wodę — trzcina ma być akcentem.
      if (nadW < 0.20 && ns < maxS && r4 < 0.16) {
        _gm.rotation.set((r2 - 0.5) * 0.14, r1 * Math.PI * 2, (r3 - 0.5) * 0.14);  // prawie pionowo
        const h = 0.8 + r1 * 0.5;
        _gm.scale.set(0.55 + r2 * 0.3, h, 0.55 + r2 * 0.3);
        _gm.updateMatrix();
        stalkField.setMatrixAt(ns, _gm.matrix);
        const v = 0.85 + r3 * 0.3;
        _gc.setRGB(0.20 * v, 0.47 * v, 0.20 * v);
        stalkField.setColorAt(ns, _gc);
        ns++;
        continue;
      }
      // ---- co rośnie w tej komórce: kwiatek / wysoka trawa / zwykła kępka ----
      // Kwiatki tylko w ŁANACH (plama szumu), inaczej wyglądają jak posypka.
      // KOLEJNOŚĆ WARUNKÓW MA ZNACZENIE: vnoise jest najdroższy, więc odpala się
      // dopiero po tanich testach — inaczej liczylibyśmy go ~28 tys. razy na przebudowę.
      const kwiat = nk < maxK && r4 > 0.72 && b < 0.66 && nadW > 0.4 && vnoise(x / 15 - 5.5, z / 15 + 2.2) > 0.52;
      const klos  = !kwiat && ns < maxS && b > 0.34 && r4 < 0.05 && nadW > 0.5;
      if (kwiat) {
        _gm.rotation.set((r2 - 0.5) * 0.16, r1 * Math.PI * 2, (r3 - 0.5) * 0.16);
        // MNIEJSZE kwiatki (referencje 03.09: drobne stokrotki w trawie, nie papierowe
        // gwiazdy wielkości głowy postaci — przy 0.85-1.15 szerokości tak to wyglądało)
        const h = 0.56 + r1 * 0.22;                            // czubek ledwo ponad dywan trawy
        _gm.scale.set(0.5 + r2 * 0.2, h, 0.5 + r2 * 0.2);
        _gm.updateMatrix();
        flowerField.setMatrixAt(nk, _gm.matrix);
        const pal = KWIAT_KOL[Math.floor(vnoise(x / 33 + 11.7, z / 33 - 4.2) * 3.999)];
        const v = 0.92 + r3 * 0.14;
        _gc.setRGB(pal[0] * v, pal[1] * v, pal[2] * v);
        flowerField.setColorAt(nk, _gc);
        nk++;
        continue;
      }
      if (klos) {
        _gm.rotation.set((r2 - 0.5) * 0.3, r1 * Math.PI * 2, (r3 - 0.5) * 0.3);  // mocniej się kładą
        const h = 0.95 + r1 * 0.55;                              // wyraźnie wyższe od dywanu
        _gm.scale.set(0.8 + r2 * 0.3, h, 0.8 + r2 * 0.3);
        _gm.updateMatrix();
        stalkField.setMatrixAt(ns, _gm.matrix);
        const v = 0.9 + r3 * 0.2;
        _gc.setRGB(v, v * (0.98 - b * 0.05), v * 0.9);
        stalkField.setColorAt(ns, _gc);
        ns++;
        continue;
      }
      // BRZEG: kępki niskie tuż przy wodzie, pełnej wysokości ~0.6 j. nad lustrem
      const brzeg = Math.min(1, (nadW - 0.03) / 0.6);
      const hgt = (0.66 + r1 * 0.40 - b * 0.10) * (0.22 + 0.78 * brzeg);   // wysokość kępki (długie źdźbła à la BotW)
      // prawie pionowo (lekkie pochylenie) — inaczej wygląda jak rozsypana słoma
      _gm.rotation.set((r2 - 0.5) * 0.22, r1 * Math.PI * 2, (r3 - 0.5) * 0.22);  // różne kierunki
      _gm.scale.set(1.0 + r2 * 0.5, hgt, 1.0 + r2 * 0.5);
      _gm.updateMatrix();
      grassField.setMatrixAt(n, _gm.matrix);
      // kolor: las = soczysta zieleń, sucha łąka = cieplejsza; delikatna wariacja;
      // przy wodzie cieplejsza/żółtawa (jak wyschnięty pas nad piaskiem)
      const plama = vnoise(x / 9 + 3.1, z / 9 + 8.4);            // miękkie łaty
      const v = 0.86 + plama * 0.26 + r3 * 0.06, cw = 1 - brzeg;
      // mniej niebieskiego = limonka jak w referencjach (BotW/Genshin), nie „szpinak"
      _gc.setRGB((1.02 + b * 0.18 + cw * 0.18) * v, (1.04 - b * 0.03 - cw * 0.04) * v,
                 (0.70 - b * 0.14 - cw * 0.26) * v);
      grassField.setColorAt(n, _gc);
      n++;
    }
  }
  for (const [f, ile] of [[grassField, n], [flowerField, nk], [stalkField, ns]]) {
    f.count = ile;
    f.instanceMatrix.needsUpdate = true;
    if (f.instanceColor) f.instanceColor.needsUpdate = true;
  }
}

// -------- stare kępki (zostawione dla marketu/dekoracji) --------
function bladeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  // szersze, jaśniejsze źdźbła z rozjaśnionymi końcówkami (styl Zeldy)
  const blades = [
    [3, 7, 30, 6, '#5fae4a', '#8fd96e'],
    [11, 9, 30, 1, '#74c95c', '#a6e884'],
    [20, 8, 30, 5, '#569f43', '#84cd63'],
    [26, 6, 30, 11, '#68bb52', '#9ade78'],
  ];
  for (const [x, w, base, top, col, tip] of blades) {
    const grd = g.createLinearGradient(0, base, 0, top);
    grd.addColorStop(0, col); grd.addColorStop(1, tip);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x, base);
    g.lineTo(x + w, base);
    g.quadraticCurveTo(x + w * 0.75, (base + top) / 2, x + w * 0.5 + 1, top);
    g.quadraticCurveTo(x + w * 0.25, (base + top) / 2, x, base);
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let grassMat = null;
const grassGeo = new THREE.PlaneGeometry(1.15, 0.95);
grassGeo.translate(0, 0.475, 0);
const GRASS_PER_CHUNK = 150;
function makeGrass(cx, cz, rng) {
  const wx0 = cx * CHUNK, wz0 = cz * CHUNK;
  const inst = new THREE.InstancedMesh(grassGeo, grassMat, GRASS_PER_CHUNK);
  const m = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < GRASS_PER_CHUNK; i++) {
    const x = wx0 + (rng() - 0.5) * CHUNK, z = wz0 + (rng() - 0.5) * CHUNK;
    const y = gruntDoSadzenia(x, z);
    if (y < wodaY(x, z) + 0.25) continue;
    if (biome(x, z) > 0.62) continue;               // na suchych łąkach rzadziej
    m.position.set(x, y - 0.05, z);
    m.rotation.set(0, rng() * Math.PI, 0);
    const s = 0.75 + rng() * 0.7;
    m.scale.set(s, s * (0.8 + rng() * 0.5), s);
    m.updateMatrix();
    inst.setMatrixAt(n++, m.matrix);
  }
  inst.count = n;
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = false;
  scene.add(inst);
  return inst;
}

// -------- cień-plamka --------
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  // CIEŃ KONTAKTOWY. Miękka plama 0.40 z rozmyciem od 4 px ginęła w trawie i cała
  // horda wyglądała, jakby unosiła się nad łąką. Mocniejszy rdzeń + krótszy zanik
  // = postać jest OSADZONA, a przy 500 wrogach to jedyne, co daje im głębię.
  const gr = g.createRadialGradient(32, 32, 10, 32, 32, 30);
  gr.addColorStop(0, 'rgba(0,0,0,0.58)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.26)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
const blobGeo = new THREE.PlaneGeometry(1, 1);
blobGeo.rotateX(-Math.PI / 2);

// ============================== INSTANCING HORDY I EFEKTÓW (E1 „Wydajność") ==============================
// Pomiar OnePlus Nord (E0, 500 wrogów): ~900 draw calli, z czego ~630 to sprite + cień
// wroga, a ~400 to efekty (iskry 190, okruchy 120, pierścienie, puffy, plamy, pigułki).
// Każda taka rzecz była osobnym Meshem = osobny draw call + osobne projectObject
// i sortowanie na CPU (`rnd` 12–40 ms). Teraz obiekt w logice gry ZOSTAJE (pozycja,
// skala, obrót — cały istniejący kod dalej je ustawia), ale NIE JEST w scenie. Przed
// każdym renderem `syncInstancje()` (scene.onBeforeRender) przepisuje je do jednej
// InstancedMesh na rodzaj.
// KOTWICA: mesh puli stoi przy graczu, a instancje mają pozycję WZGLĘDEM niego. Dzięki
// temu przezroczyste pule sortują się z wodą itp. jak „rzecz przy graczu", a nie jak
// punkt (0,0,0) świata, który na mapie bez końca bywa daleko za kamerą.
// ⚠️ `customProgramCacheKey`: domyślny klucz to `onBeforeCompile.toString()`, a opakowania
// typu `addCloudShadow` mają identyczny tekst niezależnie od tego, co owijają — bez
// własnego klucza instancjonowany sprite mógłby dostać cudzy program (np. trawy).
const PULE = [];
function alfaInstShader(sh) {
  sh.vertexShader = 'attribute float aAlfa;\nvarying float vAlfa;\n' + sh.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\n  vAlfa = aAlfa;');
  sh.fragmentShader = 'varying float vAlfa;\n' + sh.fragmentShader.replace('#include <color_fragment>',
    '#include <color_fragment>\n  diffuseColor.a *= vAlfa;');
}
function _wyslij(attr, ile) {
  attr.clearUpdateRanges(); attr.addUpdateRange(0, ile); attr.needsUpdate = true;
}
class InstPula {
  // mat: materiał wspólny dla instancji; kolor: instanceColor (mnoży kolor materiału,
  // więc materiał ma być biały); alfa: krycie per instancja (mnoży `opacity` materiału)
  constructor(geo, mat, { kolor = false, alfa = false, renderOrder = 0, cap = 128, nazwa = '' } = {}) {
    this.geo = alfa ? geo.clone() : geo;          // atrybut per instancja siedzi w geometrii
    this.mat = mat; this.kolor = kolor; this.alfa = alfa; this.ro = renderOrder; this.nazwa = nazwa;
    if (alfa) { mat.onBeforeCompile = alfaInstShader; mat.customProgramCacheKey = () => 'alfaInst1'; mat.needsUpdate = true; }
    this.n = 0; this.cap = 0; this.mesh = null; this.aAlfa = null;
    this.kx = this.ky = this.kz = 0;
    this._rosnij(cap);
    PULE.push(this);
  }
  _rosnij(cap) {
    const st = this.mesh, stA = this.aAlfa;
    const m = new THREE.InstancedMesh(this.geo, this.mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.kolor) {
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    if (this.alfa) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      a.setUsage(THREE.DynamicDrawUsage);
      if (stA) { a.array.set(stA.array.subarray(0, this.n)); this.geo.dispose(); }   // stary bufor aAlfa oddany z geometrią
      this.geo.setAttribute('aAlfa', a);
      this.aAlfa = a;
    }
    m.frustumCulled = false; m.renderOrder = this.ro; m.count = 0; m.visible = false;
    if (st) {                                        // przepisz to, co już dodano w tej klatce
      m.instanceMatrix.array.set(st.instanceMatrix.array.subarray(0, this.n * 16));
      if (this.kolor) m.instanceColor.array.set(st.instanceColor.array.subarray(0, this.n * 3));
      scene.remove(st); st.dispose();
    }
    this.cap = cap; this.mesh = m;
    scene.add(m);
  }
  begin(kot) { this.n = 0; this.kx = kot.x; this.ky = kot.y; this.kz = kot.z; }
  add(o, a = 1, kol = null) {
    if (this.n >= this.cap) this._rosnij(this.cap * 2);
    o.updateMatrix();
    const i = this.n++, arr = this.mesh.instanceMatrix.array, el = o.matrix.elements, b = i * 16;
    for (let k = 0; k < 16; k++) arr[b + k] = el[k];
    arr[b + 12] -= this.kx; arr[b + 13] -= this.ky; arr[b + 14] -= this.kz;
    if (this.alfa) this.aAlfa.array[i] = a;
    if (this.kolor) {
      const c = this.mesh.instanceColor.array;
      if (kol) { c[i * 3] = kol.r; c[i * 3 + 1] = kol.g; c[i * 3 + 2] = kol.b; }
      else c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 1;
    }
  }
  end() {
    const m = this.mesh, n = this.n;
    m.count = n; m.visible = n > 0;
    if (!n) return;
    m.position.set(this.kx, this.ky, this.kz);
    m.updateMatrixWorld();                           // onBeforeRender idzie PO scene.updateMatrixWorld
    _wyslij(m.instanceMatrix, n * 16);
    if (this.kolor) _wyslij(m.instanceColor, n * 3);
    if (this.alfa) _wyslij(this.aAlfa, n);
  }
}
// Kolory jako THREE.Color z cache (setHex konwertuje sRGB → linear; nie co klatkę)
const _kolCache = new Map();
function kolInst(hex) {
  let c = _kolCache.get(hex);
  if (!c) { c = new THREE.Color(hex); _kolCache.set(hex, c); }
  return c;
}

// ---- SPRITE'Y WROGÓW: jedna InstancedMesh na stronę atlasu postaci ----
// Klatka = stały czworokąt jednostkowy, a shader sam składa z niego prostokąt klatki
// przycięty do alfy (aKl = u0,v0,u1,v1 w komórce arkusza — ten sam kształt co
// `geoKlatki`, więc fill-rate bez zmian) i liczy UV w atlasie (aEx.xy = offset klatki,
// uRep = rozmiar komórki / rozmiar strony). aEx.zw = postęp rozpadu i biały błysk —
// to, co wcześniej wymagało KLONA materiału na umierającego wroga (`rozpadShader`).
// Przyciemnienie u stóp (uStopy) i cień chmur (addCloudShadow) — jak w materiale klatki.
const HORDA_GRUPY = [];
function hordaSpriteShader(sh, u) {
  sh.uniforms.uStopy = u.uStopy; sh.uniforms.uRep = u.uRep;
  sh.vertexShader = 'attribute vec4 aKl;\nattribute vec4 aEx;\nuniform vec2 uRep;\nvarying vec2 vKlUv;\nvarying vec2 vFx;\n' +
    sh.vertexShader
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vec2 _kl = mix(aKl.xy, aKl.zw, uv);
        vKlUv = _kl; vFx = aEx.zw;
        #ifdef USE_MAP
          vMapUv = aEx.xy + _kl * uRep;
        #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(_kl.x - 0.5, _kl.y, 0.0);');
  sh.fragmentShader = 'uniform float uStopy;\nvarying vec2 vKlUv;\nvarying vec2 vFx;\n' + sh.fragmentShader
    .replace('#include <map_fragment>', `
        vec2 _blk = floor(vKlUv * 26.0);
        float _h = fract(sin(_blk.x * 12.9898 + _blk.y * 78.233) * 43758.5453);
        if (_h < vFx.x) discard;
        #include <map_fragment>`)
    .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(uStopy - 0.02, uStopy + 0.14, vKlUv.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vFx.y);`);
}
class GrupaHordy {
  constructor(tex, repX, repY, stopy, nazwa) {
    const u = this.u = { uStopy: { value: stopy }, uRep: { value: new THREE.Vector2(repX, repY) } };
    const m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => hordaSpriteShader(sh, u);
    addCloudShadow(m);
    m.customProgramCacheKey = () => 'hordaSprite1';
    this.mat = m; this.nazwa = nazwa;
    this.mesh = null; this.geo = null; this.n = 0; this.cap = 0;
    this.kx = this.ky = this.kz = 0;
    HORDA_GRUPY.push(this);
  }
  _rosnij(cap) {
    const st = this.mesh, stGeo = this.geo;
    const g = new THREE.PlaneGeometry(1, 1);         // pozycję nadpisuje shader, zostaje uv 0..1
    const aKl = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    const aEx = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    aKl.setUsage(THREE.DynamicDrawUsage); aEx.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aKl', aKl); g.setAttribute('aEx', aEx);
    const m = new THREE.InstancedMesh(g, this.mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.count = 0; m.visible = false;
    if (st) {
      m.instanceMatrix.array.set(st.instanceMatrix.array.subarray(0, this.n * 16));
      aKl.array.set(this.aKl.array.subarray(0, this.n * 4));
      aEx.array.set(this.aEx.array.subarray(0, this.n * 4));
      scene.remove(st); st.dispose(); stGeo.dispose();
    }
    this.mesh = m; this.geo = g; this.aKl = aKl; this.aEx = aEx; this.cap = cap;
    scene.add(m);
  }
  begin(kot) { this.n = 0; this.kx = kot.x; this.ky = kot.y; this.kz = kot.z; }
  add(o, hk, prog, flash) {
    if (this.n >= this.cap) this._rosnij(Math.max(64, this.cap * 2));
    o.updateMatrix();
    const i = this.n++, arr = this.mesh.instanceMatrix.array, el = o.matrix.elements, b = i * 16;
    for (let k = 0; k < 16; k++) arr[b + k] = el[k];
    arr[b + 12] -= this.kx; arr[b + 13] -= this.ky; arr[b + 14] -= this.kz;
    const kl = this.aKl.array, ex = this.aEx.array, j = i * 4;
    kl[j] = hk.u0; kl[j + 1] = hk.v0; kl[j + 2] = hk.u1; kl[j + 3] = hk.v1;
    ex[j] = hk.ox; ex[j + 1] = hk.oy; ex[j + 2] = prog; ex[j + 3] = flash;
  }
  end() {
    const m = this.mesh, n = this.n;
    if (!m) return;
    m.count = n; m.visible = n > 0;
    if (!n) return;
    m.position.set(this.kx, this.ky, this.kz);
    m.updateMatrixWorld();
    _wyslij(m.instanceMatrix, n * 16); _wyslij(this.aKl, n * 4); _wyslij(this.aEx, n * 4);
  }
}

// ---- E3 K2 (spec 09 §4): SYLWETKA ZASŁONIĘTYCH — drugi przebieg ≤ 30 wrogów (Don, kaprale, najbliższe elity) ----
// Ta sama geometria i atrybuty co GrupaHordy (klatka animacji zgodna), materiał z depthFunc GreaterDepth: rysuje tylko
// tam, gdzie coś jest BLIŻEJ kamery niż wróg. renderOrder −1: po terenie i dekoracjach chunka (−2), przed hordą,
// graczem i trawą (0) → widać przez mesę/ścianę/regał/drzewo, nie przez innych wrogów ani przez gracza.
// Odsunięcie 1,2 j. ku kamerze: kępy trawy i własne stopy na zboczu nie robią „duchów". aEx.w = kolor (0 fiolet, 1 czerwień Dona).
const SYLW_GRUPY = [];
function sylwShader(sh, u) {
  hordaSpriteShader(sh, u);
  sh.uniforms.uBias = u.uBias; sh.uniforms.uKolA = u.uKolA; sh.uniforms.uKolB = u.uKolB; sh.uniforms.uKrycie = u.uKrycie;
  sh.vertexShader = 'uniform float uBias;\n' + sh.vertexShader.replace('#include <project_vertex>',
    '#include <project_vertex>\n  mvPosition.xyz += normalize(-mvPosition.xyz) * uBias;\n  gl_Position = projectionMatrix * mvPosition;');
  sh.fragmentShader = 'uniform vec3 uKolA;\nuniform vec3 uKolB;\nuniform float uKrycie;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
    'gl_FragColor = vec4(mix(uKolA, uKolB, vFx.y), uKrycie);');
}
class GrupaSylwetek {
  constructor(g) {
    const S = CFG_MAPA.sylw;
    const u = this.u = { uStopy: g.u.uStopy, uRep: g.u.uRep, uBias: { value: S.bias }, uKrycie: { value: S.krycie },
                         uKolA: { value: new THREE.Color(S.kolElita) }, uKolB: { value: new THREE.Color(S.kolDon) } };
    const m = new THREE.MeshBasicMaterial({ map: g.mat.map, alphaTest: 0.5, side: THREE.DoubleSide, fog: false,
      depthWrite: false, depthFunc: THREE.GreaterDepth, transparent: false, blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    m.onBeforeCompile = sh => sylwShader(sh, u);
    m.customProgramCacheKey = () => 'hordaSylw1';     // pułapka z INFO: bez klucza three.js wziąłby program hordy
    this.mat = m; this.nazwa = 'sylwetki ' + g.nazwa;
    this.mesh = null; this.geo = null; this.n = 0; this.cap = 0;
    this.kx = this.ky = this.kz = 0;
    SYLW_GRUPY.push(this);
  }
  end() { GrupaHordy.prototype.end.call(this); if (this.mesh) this.mesh.renderOrder = -1; }
}
GrupaSylwetek.prototype._rosnij = function (cap) { GrupaHordy.prototype._rosnij.call(this, Math.max(cap, 32)); };
GrupaSylwetek.prototype.begin = GrupaHordy.prototype.begin;
GrupaSylwetek.prototype.add = GrupaHordy.prototype.add;
// wybór co 0,2 s, O(n): Don → żywi kaprale → elity ≤ 30 j. po odległości; razem ≤ 30 (flaga e.sylw)
let _sylwT = 0;
const _sylwEl = [];
function wybierzSylwetki(dt) {
  if ((_sylwT -= dt) > 0) return;
  _sylwT = CFG_MAPA.sylw.co;
  const S = CFG_MAPA.sylw, on = CFG_MAPA.wlaczone.sylwetki;
  let n = 0;
  _sylwEl.length = 0;
  for (const e of G.enemies) {
    e.sylw = false;
    if (!on || e.dying || e.odwrot) continue;
    if (e.don || e.kapral) { if (n < S.max) { e.sylw = true; n++; } continue; }
    if (e.elite) {
      const d2 = (e.pos.x - P.pos.x) ** 2 + (e.pos.z - P.pos.z) ** 2;
      if (d2 <= S.rElity * S.rElity) { e._sd2 = d2; _sylwEl.push(e); }
    }
  }
  if (n < S.max && _sylwEl.length) {
    if (_sylwEl.length > S.max - n) _sylwEl.sort((a, b) => a._sd2 - b._sd2);
    for (let i = 0; i < _sylwEl.length && n < S.max; i++, n++) _sylwEl[i].sylw = true;
  }
}

function ringTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = color; g.lineWidth = 5;
  g.beginPath(); g.arc(32, 32, 26, 0, 7); g.stroke();
  return new THREE.CanvasTexture(c);
}

// ============================== SPRITE LIB ==============================
const texLoader = new THREE.ImageLoader();
const LIB = {};
const loadImage = src => new Promise((res, rej) => texLoader.load(src, res, undefined, rej));

// ile PUSTYCH pikseli jest pod stopami w pierwszej klatce arkusza
function dolnaKrawedz(img, size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0, size, size, 0, 0, size, size);
  const d = g.getImageData(0, 0, size, size).data;
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) if (d[(y * size + x) * 4 + 3] > 8) return size - 1 - y;
  }
  return 0;
}
// ---- OSADZENIE SPRITE'A: PRZYCIEMNIENIE U STÓP ----
// Zgłoszenie właściciela (03.09): postać „lata nad trawą". Sprite jest płaską
// kartą o jednolitym oświetleniu, więc jego stopy są tak samo jasne jak głowa —
// oko czyta to jako „nie dotyka ziemi". Pasmo ~14% wysokości nad stopami
// ściemnia się do 0.72 (jak trawa u nasady), reszta rysunku bez zmian.
// `stopyUV` = ile pustego arkusza jest pod stopami (footOff/size), bo pasmo ma
// zaczynać się OD STÓP, a nie od dolnej krawędzi klatki. Uniform per materiał,
// kod shadera identyczny → jeden program w cache, zero dodatkowego kosztu.
// ⚠️ ATLAS (E0): `vMapUv` to dziś współrzędna W ATLASIE, nie w klatce — pasmo
// liczymy z `vKlUv` = współrzędna w komórce arkusza (0..1 jak na starym unitGeo).
function klatkaUV(sh) {
  if (sh.vertexShader.includes('vKlUv')) return;
  sh.vertexShader = 'varying vec2 vKlUv;\n' + sh.vertexShader.replace('#include <uv_vertex>',
    '#include <uv_vertex>\n       vKlUv = uv;');
  sh.fragmentShader = 'varying vec2 vKlUv;\n' + sh.fragmentShader;
}
function addStopyAO(mat, stopyUV) {
  const stary = mat.onBeforeCompile;
  const u = { value: stopyUV };
  mat.onBeforeCompile = sh => {
    if (stary) stary(sh);
    sh.uniforms.uStopy = u;
    klatkaUV(sh);
    sh.fragmentShader = 'uniform float uStopy;\n' + sh.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
       diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(uStopy - 0.02, uStopy + 0.14, vKlUv.y));`);
  };
  mat.needsUpdate = true;
  return mat;
}
const LATAJACE = new Set(['kernello_boomello']);   // arkusze, które nie stoją na ziemi

// ============================== ATLAS POSTACI (E0 „Wydajność") ==============================
// DO v183 każda klatka każdego kierunku miała WŁASNY canvas + CanvasTexture:
// 1488 klatek × (92..124 px)² = 72 MB canvasów w RAM i tyle samo VRAM po wgraniu.
// Teraz: jedna tekstura (strona atlasu) na postać, a w niej tylko NIEPUSTE piksele
// klatek. Każda klatka jest przycięta do prostokąta swojej alfy, więc 60–70%
// przezroczystego tła arkusza w ogóle nie trafia do pamięci.
// Jak to trzyma wygląd 1:1:
//  • Materiał na klatkę zostaje (miganie, kopia gracza, rozpad, AO działają bez zmian),
//    ale jego `map` to KLON tekstury strony z własnym offset/repeat. Klony dzielą
//    `source`, więc three.js wgrywa stronę do GPU RAZ (WebGLTextures cache po source).
//  • Geometria na klatkę = ten sam układ co `unitGeo` (pivot w stopach, uv 0..1
//    w komórce arkusza), tylko obcięta do prostokąta alfy. Poza nim i tak było
//    `alphaTest` → discard, więc obraz się nie zmienia, a GPU nie cieniuje pustych
//    pikseli (mniej fill-rate na telefonie).
//  • 1 px pustej ramki wokół każdej klatki (2 px między klatkami) — nearest na
//    krawędzi nie złapie piksela sąsiedniej klatki.
const ATLAS_PAD = 1;
const ATLAS_MAX = 4096;                            // bezpieczny limit tekstury na telefonach
const ATLAS_STATS = { strony: [], klatki: 0, bajty: 0, stareBajty: 0 };
// półkowe pakowanie (sortowanie po wysokości) — przy ~100 klatkach zbliżonej wielkości
// wychodzi ~85–90% wypełnienia, a kod jest trywialny
function pakujPolki(prost) {
  let pole = 0, maxW = 0;
  for (const r of prost) { pole += r.w * r.h; maxW = Math.max(maxW, r.w); }
  const W = Math.min(ATLAS_MAX, Math.max(maxW, Math.ceil(Math.sqrt(pole * 1.08))));
  const kol = prost.map((r, i) => i).sort((a, b) => prost[b].h - prost[a].h || prost[b].w - prost[a].w);
  const strony = [{ w: 0, h: 0 }];
  let x = 0, y = 0, polkaH = 0;
  for (const i of kol) {
    const r = prost[i];
    if (x + r.w > W) { y += polkaH; x = 0; polkaH = 0; }
    if (y + r.h > ATLAS_MAX) { strony.push({ w: 0, h: 0 }); x = y = polkaH = 0; }
    const s = strony[strony.length - 1];
    r.strona = strony.length - 1; r.x = x; r.y = y;
    x += r.w; polkaH = Math.max(polkaH, r.h);
    s.w = Math.max(s.w, x); s.h = Math.max(s.h, y + polkaH);
  }
  return strony;
}
// ta sama geometria co `unitGeo` (x −0.5..0.5, y 0..1, uv = pozycja w komórce),
// obcięta do prostokąta [x0,x1)×[y0,y1) w pikselach komórki (y od góry)
function geoKlatki(x0, y0, x1, y1, S) {
  const g = new THREE.PlaneGeometry((x1 - x0) / S, (y1 - y0) / S);
  g.translate((x0 + x1) / 2 / S - 0.5, 1 - (y0 + y1) / 2 / S, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + 0.5, p.getY(i));
  return g;
}
async function buildChar(name, anims) {
  const def = SPRITEDATA[name];
  const img = await loadImage(def.img);
  const size = def.size, S = size;
  // FOOTOFF LICZONY Z ALFY, a nie brany z pliku: packer wpisuje tam zero na
  // sztywno, wiec kazda nowo zapakowana postac unosila sie nad trawa o tyle
  // pustego miejsca, ile arkusz ma pod stopami (Carrotello mial 23 wpisane
  // recznie, przepakowany Beetino dostal 0 i zaczal lewitowac).
  LIB[name] = { size, footOff: dolnaKrawedz(img, size), anims: {}, img, atlas: [] };
  // 1–2. prostokąt niepustych pikseli każdej używanej klatki. Alfa czytana PASAMI po rzędach animacji (≤ 4096 px
  // wysokości i ≤ 8 Mpx na pas), nie całym arkuszem naraz: arkusz Dona HD to ~2288×7920 ≈ 18 Mpx, a iOS Safari nie
  // tworzy płótna > 16,7 Mpx (getImageData dawało wtedy pustkę/wyjątek). Jeden bufor na pasy, oddany po zbudowaniu.
  const IW = img.width, IH = img.height;
  const potrzebne = new Map();                     // rząd arkusza → największa liczba klatek w nim
  for (const an of anims) {
    const a = def.anims[an]; if (!a) continue;
    for (const dir of Object.keys(a.rows)) {
      const row = a.rows[dir];
      potrzebne.set(row, Math.max(potrzebne.get(row) || 0, a.frames[dir]));
    }
  }
  const prost = new Map();                         // `sx,sy` → { x0, y0, x1, y1 } (x1/y1 wyłączne)
  const rzedyNaPas = Math.max(1, Math.min(Math.floor(ATLAS_MAX / S), Math.floor(8e6 / (IW * S))));
  const sc = document.createElement('canvas');
  const sg = sc.getContext('2d', { willReadFrequently: true });
  const rzedy = [...potrzebne.keys()].sort((a, b) => a - b);
  for (let i = 0; i < rzedy.length;) {
    const r0 = rzedy[i];                           // pas: rzędy r0 … r0 + rzedyNaPas − 1 (tylko potrzebne)
    let j = i; while (j < rzedy.length && rzedy[j] < r0 + rzedyNaPas) j++;
    const rN = rzedy[j - 1];
    const y0p = r0 * S, hp = Math.min(IH, (rN + 1) * S) - y0p;
    let wp = 0;
    for (let k = i; k < j; k++) wp = Math.max(wp, potrzebne.get(rzedy[k]) * S);
    wp = Math.min(IW, wp);
    if (sc.width !== wp || sc.height !== hp) { sc.width = wp; sc.height = hp; } else sg.clearRect(0, 0, wp, hp);
    let alfa = null;
    if (wp > 0 && hp > 0) { sg.drawImage(img, 0, y0p, wp, hp, 0, 0, wp, hp); alfa = sg.getImageData(0, 0, wp, hp).data; }
    for (let k = i; k < j; k++) {
      const row = rzedy[k], n = potrzebne.get(row), ly = row * S - y0p;
      for (let f = 0; f < n; f++) {
        const sx = f * S;
        let x0 = S, y0 = S, x1 = -1, y1 = -1;
        if (alfa) for (let y = 0; y < S && ly + y < hp; y++) {
          const o = ((ly + y) * wp + sx) * 4 + 3;
          for (let x = 0; x < S && sx + x < wp; x++) if (alfa[o + x * 4] > 0) {
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
        if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }        // pusta klatka → 1 przezroczysty piksel
        prost.set(sx + ',' + row * S, { x0, y0, x1: x1 + 1, y1: y1 + 1 });
      }
    }
    i = j;
  }
  sc.width = sc.height = 0;                       // oddaj bufor od razu (iOS: limit pamięci canvasów)
  const klatki = [];
  for (const an of anims) {
    const a = def.anims[an]; if (!a) continue;
    for (const dir of Object.keys(a.rows)) {
      const row = a.rows[dir], n = a.frames[dir];
      for (let f = 0; f < n; f++) {
        const sx = f * S, sy = row * S, { x0, y0, x1, y1 } = prost.get(sx + ',' + sy);
        klatki.push({ an, dir, f, sx, sy, x0, y0, x1, y1,
                      w: x1 - x0 + 2 * ATLAS_PAD, h: y1 - y0 + 2 * ATLAS_PAD });
      }
    }
  }
  // 3. pakowanie + rysowanie stron
  const strony = pakujPolki(klatki);
  const baza = strony.map(s => {
    const cv = document.createElement('canvas'); cv.width = s.w; cv.height = s.h;
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    LIB[name].atlas.push(cv);
    ATLAS_STATS.strony.push(name + ' ' + s.w + '×' + s.h);
    ATLAS_STATS.bajty += s.w * s.h * 4;
    return { cv, g: cv.getContext('2d'), t, W: s.w, H: s.h };
  });
  for (const k of klatki) {
    const b = baza[k.strona];
    b.g.drawImage(img, k.sx + k.x0, k.sy + k.y0, k.x1 - k.x0, k.y1 - k.y0,
                  k.x + ATLAS_PAD, k.y + ATLAS_PAD, k.x1 - k.x0, k.y1 - k.y0);
  }
  ATLAS_STATS.klatki += klatki.length;
  ATLAS_STATS.stareBajty += klatki.length * S * S * 4;
  // 4. materiał + geometria na klatkę (klon tekstury strony = zero dodatkowego VRAM-u)
  const stopy = LATAJACE.has(name) ? -1 : LIB[name].footOff / size;
  // E1: grupa instancji na stronę (tekstura bazowa strony dzieli `source` z klonami klatek)
  for (const b of baza) b.grupa = new GrupaHordy(b.t, S / b.W, S / b.H, stopy, name);
  for (const k of klatki) {
    const b = baza[k.strona];
    const t = b.t.clone();
    // uv komórki (u,v) → piksel strony: X = x + PAD + (u·S − x0), Y(od góry) = y + PAD + ((1−v)·S − y0)
    t.offset.set((k.x + ATLAS_PAD - k.x0) / b.W, 1 - (k.y + ATLAS_PAD - k.y0 + S) / b.H);
    t.repeat.set(S / b.W, S / b.H);
    t.matrixAutoUpdate = false; t.updateMatrix();   // macierz UV stała — bez przeliczania przy każdym rysowaniu
    let entry = LIB[name].anims[k.an];
    if (!entry) entry = LIB[name].anims[k.an] = { fps: def.anims[k.an].fps, dirs: {}, geo: {} };
    if (!entry.dirs[k.dir]) { entry.dirs[k.dir] = []; entry.geo[k.dir] = []; }
    // cienie chmur także na postaciach (ten sam kod shadera = jeden program w cache)
    // + przyciemnienie u stóp (osadzenie w trawie) — też jeden program, uniform per materiał
    // (latające sprite'y — pizza/bumerang — dostają -1 = bez przyciemnienia)
    const mat = addStopyAO(addCloudShadow(new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide })), stopy);
    // opis klatki dla instancingu hordy: prostokąt w UV komórki (v w górę) + offset w atlasie
    // NIEWYLICZALNE: Material.clone() robi JSON.stringify(userData), a `g` ma cykle (mesh → scena)
    Object.defineProperty(mat.userData, 'hk', { enumerable: false, value: {
      g: b.grupa, u0: k.x0 / S, v0: 1 - k.y1 / S, u1: k.x1 / S, v1: 1 - k.y0 / S, ox: t.offset.x, oy: t.offset.y } });
    entry.dirs[k.dir][k.f] = mat;
    entry.geo[k.dir][k.f] = geoKlatki(k.x0, k.y0, k.x1, k.y1, S);
  }
}

async function flatMat(src) {
  const img = await loadImage(src);
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  cv.getContext('2d').drawImage(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return { mat: new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide }), w: img.width, h: img.height };
}

const unitGeo = new THREE.PlaneGeometry(1, 1);
unitGeo.translate(0, 0.5, 0);

// ============================== POCHYLENIE SPRITE'ÓW ==============================
// Arkusze z PixelLaba są malowane W PERSPEKTYWIE (widok 3/4 z góry), a pionowy
// billboard przy kamerze patrzącej z góry tę perspektywę SKRACA — postać wygląda
// jak przyklejona do szyby i niższa niż na arkuszu. Dlatego płaszczyznę
// pochylamy tak, żeby stała PROSTOPADLE do osi patrzenia: rysunek pokazuje się
// dokładnie tak, jak go narysowano.
// Pivot geometrii siedzi w stopach (`unitGeo.translate(0, 0.5, 0)`), więc
// pochylenie obraca sprite'a WOKÓŁ STÓP — nie odkleja się od ziemi.
// 0 = stara wersja (pionowo), 1 = pełne obrócenie do kamery.
// 0.7 (03.09): przy pełnym pochyleniu sprite KŁADŁ SIĘ na trawie za sobą (głowa
// 1.5 j. za stopami, 34° od pionu) i czytał się jako naklejka na ekranie. Przy 0.7
// zostaje ~10° do prostopadłości = skrót rysunku ~1.5% (niewidoczny), a postać
// STOI w trawie zamiast nad nią leżeć. Strojenie na żywo: HORDA.setTilt(v).
let SPRITE_TILT = 0.7;
let tiltKat = 0;
const _cdir = new THREE.Vector3();
const AX_Y = new THREE.Vector3(0, 1, 0), AX_X = new THREE.Vector3(1, 0, 0), AX_Z = new THREE.Vector3(0, 0, 1);
const _qx = new THREE.Quaternion(), _qz = new THREE.Quaternion();
function refreshSpriteTilt() {                    // raz na klatkę, nie raz na sprite'a
  camera.getWorldDirection(_cdir);
  tiltKat = Math.asin(Math.max(-1, Math.min(1, -_cdir.y))) * SPRITE_TILT;
}
// obrót billboardu: yaw kamery × pochylenie w stronę kamery × opcjonalny przewrót
// E1: wspólna część (yaw × pochylenie) liczona RAZ na zmianę kamery, nie 500× na klatkę,
// i jeden zapis do `q` zamiast 2–3 (każdy zapis kwaternionu Object3D przelicza jeszcze
// Euler `rotation` przez onChange — w profilu z telefonu ~2.5% CPU).
const _bbQ = new THREE.Quaternion();
let _bbYaw = NaN, _bbTilt = NaN;
function billboardQuat(q, roll = 0) {
  if (camYaw !== _bbYaw || tiltKat !== _bbTilt) {
    _bbYaw = camYaw; _bbTilt = tiltKat;
    _bbQ.setFromAxisAngle(AX_Y, camYaw);
    _qx.setFromAxisAngle(AX_X, -tiltKat);
    _bbQ.multiply(_qx);
  }
  if (!roll) return q.copy(_bbQ);
  _qz.setFromAxisAngle(AX_Z, roll);
  return q.multiplyQuaternions(_bbQ, _qz);
}

// ============================== BILLBOARD ==============================
// WIDOCZNOŚĆ GRACZA PRZEZ HORDĘ. Zmierzone w 3. minucie: w promieniu 70 px od
// postaci stoją 32 wrogi, z czego **18 rysuje się PRZED nią** — gracza po prostu
// nie ma na ekranie. Stąd dwie kopie sprite'a z `depthTest: false`: ciemny obrys
// (renderOrder 899) i kolorowa kopia (900). Są DZIEĆMI głównego mesha, więc
// dziedziczą pozycję, obrót, skalę i widoczność — `playerBB.mesh.visible = false`
// przy trybie karabinu chowa je razem z ciałem, bez ani jednej linii synchronizacji.
const _przezMaty = new Map();                    // materiał klatki + kolor → materiał „na wierzchu"
// `opacity` < 1 (03.09): kopia PEŁNOKRYJĄCA robiła z gracza naklejkę „nałożoną na
// wszystko" (zgłoszenie właściciela) — zasłaniała trawę, drzewa i wrogów, którzy
// fizycznie stoją przed nim. Półprzezroczysta sylwetka (0.72) mówi to, co trzeba:
// „tu jesteś, ZA tym wrogiem", i zostawia głębię sceny nietkniętą.
function matNaWierzchu(src, kolor, opacity = 1) {
  const klucz = src.uuid + '|' + kolor + '|' + opacity;
  let m = _przezMaty.get(klucz);
  if (!m) {
    // ta sama TEKSTURA co oryginał (dzielona instancja = zero dodatkowego VRAM-u)
    m = new THREE.MeshBasicMaterial({
      map: src.map, color: kolor, alphaTest: 0.5, side: THREE.DoubleSide,
      depthTest: false, depthWrite: false, transparent: true, fog: false, opacity,
    });
    _przezMaty.set(klucz, m);
  }
  return m;
}
// Grubosc i kolor obrysu sa REGULOWANE na zywo (`HORDA.ustawObrys`), bo to czysta
// kwestia gustu, a wlasciciel mial watpliwosci co do czarnej otoczki.
// `skala === 1` = brak obrysu (schowa sie dokladnie pod kolorowa kopia).
let OBRYS_SKALA = 1.07;
let OBRYS_KOLOR = 0x1b1b22;                      // ten sam kontur, co w calym pixel-arcie gry
let KOPIA_KRYCIE = 0.55;                         // krycie sylwetki „przez hordę" (1 = stara naklejka); 0.72 → 0.55 po teście 18.09

class Billboard {
  // `hord` (E1): billboard wroga — mesh i cień NIE trafiają do sceny, tylko służą za
  // nośnik pozycji/obrotu/skali/klatki; rysuje je `syncInstancje()` jako instancje.
  // fxProg / fxFlash = rozpad i biały błysk (zamiast klona materiału z `rozpadShader`).
  constructor(char, scaleMul = 1, naWierzchu = false, hord = false) {
    this.char = char;
    this.inst = hord;
    this.fxProg = 0; this.fxFlash = 0;
    const L = LIB[char];
    this.h = L.size * PX2U * scaleMul;
    this.mesh = new THREE.Mesh(unitGeo, null);
    this.mesh.scale.set(this.h, this.h, 1);
    this.footY = -L.footOff * PX2U * scaleMul;
    this.anim = null; this.t = 0; this.loop = true; this.done = false;
    this.facing = 0;
    this.shadow = hord ? new THREE.Object3D() : new THREE.Mesh(blobGeo, blobMat);
    // cień kontaktowy szerszy niż stopy (0.56 wysokości) — to on „przykleja" postać
    // do ziemi; przy 0.5×0.3 ginął w trawie i cała horda unosiła się nad łąką
    this.shadow.scale.set(this.h * 0.56, 1, this.h * 0.34);
    if (!hord) { scene.add(this.mesh); scene.add(this.shadow); }
    if (naWierzchu) {
      // BEZ CZARNEGO OBRYSU (decyzja właściciela 18.09: „czemu postać jest obleczona
      // grubszym czarnym konturem i jest jakby na wierzchu"). Zostaje sama półprzezroczysta
      // sylwetka, i to tylko w prawdziwym ścisku — patrz warunek w update().
      this.kopia = new THREE.Mesh(unitGeo, null);
      this.kopia.renderOrder = 900;
      this.mesh.add(this.kopia);
    }
    this.play('idle');
    // MATERIAŁ MUSI BYĆ OD RAZU. Mesh powstaje z `null`, a materiał dostaje
    // dopiero w `update()` — jeśli cokolwiek zrenderuje scenę PRZED pierwszym
    // update'em tego billboardu, three.js czyta `material.visible` z null
    // i cała klatka leci wyjątkiem (WebGLRenderer.projectObject).
    // Trafia to każdy byt tworzony w środku pętli, po której iterujemy od końca
    // (np. mini-ziarna bomby kasetowej dopisywane na koniec `G.kury`).
    const A0 = LIB[char].anims[this.anim];
    if (A0) {
      const k0 = A0.dirs.south ? 'south' : Object.keys(A0.dirs)[0];
      const d0 = A0.dirs[k0];
      if (d0 && d0.length) { this.mesh.material = d0[0]; this.mesh.geometry = A0.geo[k0][0]; }
    }
  }
  play(an, loop = true) {
    if (this.anim === an) return;
    if (!LIB[this.char].anims[an]) {
      // brak takiej animacji (np. Beetino nie ma 'idle') — bierz pierwszą dostępną,
      // ale tylko gdy nic jeszcze nie gramy, żeby nie przerywać bieżącej
      if (this.anim) return;
      an = Object.keys(LIB[this.char].anims)[0];
      if (!an) return;
    }
    this.anim = an; this.t = 0; this.loop = loop; this.done = false;
  }
  update(dt, pos, ty, groundY = ty) {
    const A = LIB[this.char].anims[this.anim];
    this.t += dt;
    // kierunek klatki względem AKTUALNEGO obrotu kamery
    const rel = this.facing - camYaw;
    let idx = Math.round(rel / (Math.PI / 4)) & 7;
    if (idx < 0) idx += 8;
    const dir = DIR_ROWS[idx] in A.dirs ? DIR_ROWS[idx] : 'south';
    const mats = A.dirs[dir];
    let f = Math.floor(this.t * A.fps);
    if (this.loop) f %= mats.length;
    else if (f >= mats.length) { f = mats.length - 1; this.done = true; }
    this.mesh.material = mats[f];
    this.mesh.geometry = A.geo[dir][f];             // klatka przycięta do alfy (atlas E0)
    if (this.kopia) {
      this.kopia.geometry = this.mesh.geometry;
      this.kopia.material = matNaWierzchu(mats[f], 0xffffff, KOPIA_KRYCIE);
      // KOPIA WLACZA SIE TYLKO W PRAWDZIWYM SCISKU. `depthTest: false` ignoruje CALY
      // swiat (trawe, drzewa, wrogow), wiec kazde wlaczenie czyta sie jako „postac na
      // wierzchu, przenika" (zgloszenie wlasciciela 18.09). Warunek: co najmniej TRZECH
      // zywych wrogow w promieniu 1.8 j. i blizej kamery niz gracz — czyli sytuacja,
      // w ktorej bez kopii gracza faktycznie nie byloby widac. Jeden przebiegajacy
      // wrog juz nie odpala sylwetki.
      let zaslaniaja = 0;
      const dk = camera.position.distanceTo(P.pos);
      for (const e of G.enemies) {
        if (e.dying) continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
        if (dx * dx + dz * dz > 3.24) continue;                  // promien 1.8 j.
        if (camera.position.distanceTo(e.pos) < dk && ++zaslaniaja >= 3) break;
      }
      this.kopia.visible = zaslaniaja >= 3;
    }
    // FOOTY MUSI BYĆ SKRÓCONE O `cos(pochylenia)`. Zsuwamy sprite'a w dół o tyle
    // pustych pikseli, ile arkusz ma pod stopami — ale to przesunięcie było liczone
    // dla PIONOWEGO billboardu. Po pochyleniu do kamery każdy odcinek wysokości
    // skraca się o cos(kąt), więc stopy schodziły pod ziemię (u Carrotella 0.11 j.
    // przy 32°). Na Łąkach zasłaniała to trawa, w markecie gładka podłoga ucinała nogi.
    this.mesh.position.set(pos.x, ty + this.footY * Math.cos(tiltKat), pos.z);
    billboardQuat(this.mesh.quaternion);           // twarzą do kamery + pochylenie do jej osi
    this.shadow.position.set(pos.x, groundY + 0.04, pos.z);
  }
  dispose() { scene.remove(this.mesh); scene.remove(this.shadow); }
}
const faceAngle = (x, z) => { const a = Math.atan2(x, z); return a < 0 ? a + Math.PI * 2 : a; };

// ---- LIŚĆ SAŁATY (lotnia) — pixelowa tekstura + mesh nad postacią ----
function lettuceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // falisty liść: kilka warstw zieleni z ząbkowaną krawędzią
  const warstwy = [['#3f7a2e', 30], ['#5aa83c', 26], ['#7cc94f', 20], ['#a5e072', 12]];
  for (const [col, r] of warstwy) {
    g.fillStyle = col;
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 14) {
      const fala = 1 + 0.16 * Math.sin(a * 7);
      const x = 32 + Math.cos(a) * r * fala * 1.35;
      const y = 34 + Math.sin(a) * r * fala * 0.75;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath(); g.fill();
  }
  g.strokeStyle = '#dff0b8'; g.lineWidth = 2;      // nerwy liścia
  g.beginPath(); g.moveTo(6, 34); g.lineTo(58, 34); g.stroke();
  for (let i = -2; i <= 2; i++) {
    g.beginPath(); g.moveTo(32, 34); g.lineTo(32 + i * 12, 34 + (i % 2 ? -12 : 12)); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// SZNURKI: liść wisiał nad głową „sam z siebie" i wyglądał jak naklejka.
// Rysujemy je jako osobny billboard rozciągnięty między barkami i czaszą —
// odległość jest stała, ale sznurki muszą trzymać PION do kamery niezależnie
// od przechyłu czaszy, dlatego to własny mesh, a nie część tekstury liścia.
function sznurkiTexture() {
  const S = 128;                                   // duża tekstura = CIENKIE linie po rozciągnięciu
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // ciemna oliwka, nie krem: na jasnym tle marketu jasne linie czytały się
  // jak promienie słońca. Dwa główne sznurki od krawędzi czaszy + dwa ledwo
  // widoczne w środku, wszystkie prawie pionowe (fan pod 30° wyglądał jak gwiazda).
  const linie = [[3, 60, '#2b3550', 2], [124, 68, '#2b3550', 2],
                 [34, 62, '#3d4a6b', 1], [93, 66, '#3d4a6b', 1]];
  for (const [gx, dx, kol, w] of linie) {
    g.strokeStyle = kol; g.lineWidth = w;
    g.beginPath(); g.moveTo(gx, 1); g.lineTo(dx, S - 2); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// ============================== FOLIOWA TORBA (spadochron) ==============================
// Był to płaski billboard z liściem sałaty i wyglądał źle z prostego powodu:
// spadochron czyta się dopiero jako WYGIĘTA CZASZA. Teraz jest to kopuła 3D
// (górna czapa sfery) z falującym rantem, a motyw zmieniono na nadmuchującą się
// torbę z marketu — śmieszniej i spójnie ze sklepem.
function torbaTexture() {
  const W = 64, H = 32;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#eef3fa'; g.fillRect(0, 0, W, H);                 // biała folia
  for (let x = 0; x < W; x += 4) {                                  // pionowe zagniecenia
    g.fillStyle = (x / 4) % 2 ? '#dde5f0' : '#f7fbff';
    g.fillRect(x, 0, 2, H);
  }
  g.fillStyle = '#c9d4e2';                                          // cień pod rantem
  g.fillRect(0, H - 6, W, 6);
  g.fillStyle = '#e0524f'; g.fillRect(0, 11, W, 5);                 // czerwony pas „marketu"
  g.fillStyle = '#f2f6fb'; g.fillRect(0, 13, W, 1);
  g.fillStyle = '#2b3550';                                          // pixelowy napis-plamka na pasie
  for (const x of [8, 14, 20, 30, 36, 46, 52]) g.fillRect(x, 12, 3, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let lettuce = null, sznurki = null, salataMat = null;
function initLettuce() {
  // GÓRNA CZAPA SFERY = czasza. thetaLength 0.46π daje kopułę trochę większą niż
  // półkula, więc rant lekko podwija się do dołu tak jak w napełnionej torbie.
  const geo = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.46);
  const m = new THREE.MeshBasicMaterial({ map: torbaTexture(), transparent: true,
    opacity: 0.93, side: THREE.DoubleSide, depthWrite: false });
  // FALOWANIE RANTU w vertex shaderze: im dalej od czubka (position.y niżej), tym
  // mocniejszy ruch — czubek jest napięty, dół trzepocze.
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = windU;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float kraw = 1.0 - clamp(position.y, 0.0, 1.0);          // 0 na czubku, 1 na rancie
       float kat = atan(position.z, position.x);
       transformed.y += sin(uTime * 7.0 + kat * 3.0) * 0.11 * kraw * kraw;
       transformed.x *= 1.0 + sin(uTime * 5.0 + kat * 2.0) * 0.05 * kraw;
       transformed.z *= 1.0 + cos(uTime * 5.4 + kat * 2.0) * 0.05 * kraw;`);
  };
  lettuce = new THREE.Mesh(geo, m);
  lettuce.scale.set(1.75, 1.25, 1.75);
  lettuce.visible = false;
  scene.add(lettuce);
  const ms = new THREE.MeshBasicMaterial({ map: sznurkiTexture(), transparent: true,
    alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: false });
  sznurki = new THREE.Mesh(unitGeo, ms);       // pivot w dole = przy barkach
  sznurki.visible = false;
  scene.add(sznurki);
}
function updateLettuce(dt) {
  if (!lettuce) return;
  lettuce.visible = sznurki.visible = !!P.gliding;
  if (!P.gliding) return;
  const kolysanie = Math.sin(G.time * 5) * 0.12;
  // wysokości z `playerBB.h`, nie ze stałych — po PX2U 1/46 postać urosła o 20%
  const hh = playerBB ? playerBB.h : 2.6;
  const czaszaY = P.y + hh * 0.90 + Math.sin(G.time * 3) * 0.07;
  lettuce.position.set(P.pos.x, czaszaY, P.pos.z);
  // czasza jest bryłą obrotową, więc NIE billboardujemy jej do kamery — tylko
  // przechylamy na boki razem z kołysaniem lotu (obrót w Y daje ruch tekstury)
  lettuce.rotation.set(kolysanie * 0.5, G.time * 0.35, kolysanie);
  // uchwyty: od barków (P.y + 1.1) do rantu czaszy, kołyszą się z nią
  const barki = P.y + hh * 0.42;
  sznurki.position.set(P.pos.x + kolysanie * 0.25, barki, P.pos.z);
  sznurki.scale.set(1.9, Math.max(0.2, czaszaY - 0.22 - barki), 1);
  billboardQuat(sznurki.quaternion, kolysanie * 0.8);
}

// czerwony błysk na postaci przy obrażeniach (nakładka z tą samą klatką sprite'a)
let hitFlash = null, hitFlashMat = null;
function initHitFlash() {
  hitFlashMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0,
    depthTest: false, alphaTest: 0.5, side: THREE.DoubleSide });
  hitFlash = new THREE.Mesh(unitGeo, hitFlashMat);
  // 950, NIE 5. Gracz dostal dzis kopie sprite'a rysowana NA WIERZCHU hordy
  // (renderOrder 900, `depthTest: false`) i ta kopia zaczela ZASLANIAC czerwony
  // blysk — postac przestala migac na czerwono po ciosie, a jedyne, co bylo widac,
  // to zlota aura nietykalnosci nad glowa. Blysk musi rysowac sie PO kopii.
  hitFlash.renderOrder = 950;
  hitFlash.visible = false;
  scene.add(hitFlash);
}
function updateHitFlash() {
  if (!hitFlash) return;
  // PODZIAŁ RÓL: czerwony błysk = „OBERWAŁEM" (zdarzenie), złota aura niżej =
  // „NIE MOŻNA MNIE TKNĄĆ" (stan). Wcześniej ta sama nakładka robiła oba i okno
  // nietykalności czytało się jak zwykłe migotanie po ciosie.
  const on = P.iframes > 0 && !G.dying && !G.fps.on && !STRES;
  hitFlash.visible = on;
  if (on) {
    hitFlashMat.color.setHex(0xff2a2a);
    hitFlashMat.map = playerBB.mesh.material.map;        // ta sama klatka co postać
    hitFlash.geometry = playerBB.mesh.geometry;          // i ten sam przycięty prostokąt (atlas)
    hitFlashMat.opacity = 0.35 + 0.45 * Math.abs(Math.sin(P.iframes * 22));
    hitFlashMat.needsUpdate = true;
    hitFlash.scale.copy(playerBB.mesh.scale);
    hitFlash.position.copy(playerBB.mesh.position);
    hitFlash.quaternion.copy(playerBB.mesh.quaternion); // billboardy chodzą na kwaternionach
  }
  updateAura();
}

// ============================== AURA NIETYKALNOŚCI ==============================
// Życzenie właściciela („jak SSJ"). Do 13.08 nietykalność była WYŁĄCZNIE migotaniem
// sprite'a — w hordzie na 500 wrogów nie do wypatrzenia, a to jest informacja
// „teraz możesz wejść w tłum". Dwa elementy: poświata za postacią i pierścień
// na ziemi (ten drugi widać nawet wtedy, gdy postać zasłaniają wrogowie).
// Poświata jest KWANTOWANA NA PASY, jak gradient nieba — gładka wyglądałaby
// jak z innej gry niż reszta pixel-artu.
function auraTexture() {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), im = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2 + 0.5) / (S / 2), dy = (y - S / 2 + 0.5) / (S / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    let a = Math.max(0, 1 - d);
    a = Math.floor(a * 6) / 6;                          // 6 pasów zamiast gładkiego zaniku
    const i = (y * S + x) * 4;
    im.data[i] = 255; im.data[i + 1] = 226; im.data[i + 2] = 120;
    im.data[i + 3] = Math.round(a * 230);
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
// ============================== ŚMIERDZĄCY DYM (skarpeta) ==============================
// CZWARTE podejście. Trzy poprzednie właściciel odrzucił („okrągi", potem
// „jakoś kiepsko"). Diagnoza tego, co było źle w v137:
//  1. Rozmiar kłębu był mnożony przez promień (`s = r * ...`), więc na poz. 5
//     jeden kłąb miał ~4 j. szerokości: tekstura 128 px rozciągana na 4 jednostki
//     = piksel dymu 4× większy od piksela sprite'a → mleczna maź, nie pixel art.
//     Teraz ROZMIAR KŁĘBU JEST STAŁY (~1.3 j. ≈ 55 px/j., dokładnie jak sprite'y),
//     a z poziomem rośnie ICH LICZBA — proporcjonalnie do POWIERZCHNI.
//  2. Kształt z samego fBm + 6 pasów alfy = miękka wata bez sylwetki. Teraz kłąb
//     jest RYSOWANY jak pixel art: twarda sylwetka z kilku garbów, ciemny kontur,
//     3 pasy waloru (jasna góra, ciemniejszy spód) i dithering na rancie.
//  3. `novaRing` w `tick()` rysował rozchodzącą się OBRĘCZ co 0.7 s — czyli
//     dokładnie ten okrąg, którego właściciel nie chce. Wyleciał; tempo trucia
//     pokazuje teraz „oddech" dymu (`uPuls`: kłęby na moment puchną i jaśnieją).
// Zasięg czyta się WYŁĄCZNIE z gęstości: poz. 1 to garść dymu u stóp (6 kłębów),
// poz. 5 to 71 kłębów, czyli ściana smrodu. Nic nie rysuje granicy.
const SKARPETA_R = l => 1.8 + 0.25 * l * l;
// E2 K9 (spec §7.1): promień aury z SUFITEM obszarówek (rangeObsz) i twardym limitem 8,5 j. — ten sam dla trucia i dymu.
// Lornetka 5 dawała 16,7 j. (prawie cały pierścień spawnu na telefonie); nadmiar zasięgu idzie w obrażenia (rangeObsz().dmg).
const skarpetaR = l => Math.min(SKARPETA_R(l) * rangeObsz().m, CFG_DECYZJE.skarpetaRMax);

// --- ATLAS 2×2 KŁĘBÓW (jedna tekstura 144², kafel 72 px ≈ 1.3 j. świata) ---
// Cztery różne sylwetki, żeby dym nie był powtórzoną naklejką. Kształt = suma
// garbów (koła o różnych promieniach zsunięte ku górze) + poszarpanie `pnoise`,
// więc nawet pojedynczy kłąb nie ma obrysu koła.
let DYM_PAL = { jasny: [244, 252, 202], sredni: [190, 220, 108], ciemny: [126, 166, 62], kontur: [48, 66, 32], gr: 2 };
// Kafle 0-1 = zwarte kłęby (świeży dym), kafle 2-3 = przewiane strzępy (to, co
// się unosi i rozwiewa). Który kafel dostaje kłąb, decyduje jego WIEK — patrz
// vertex shader (`step(0.55, life)`), czyli dym strzępi się w trakcie wznoszenia.
// `garby` trzymam MAŁE liczby i DUŻE promienie: 3-4 bąble dają czytelny obrys
// kalafiora, a 6 małych zlewało się w amebę z kolcami.
const DYM_KAFLE = [
  { garby: 3, baza: 0.25, r0: 0.150, r1: 0.055, roz: 0.17, jag: 0.13, jag2: 0.07, dziury: 0.00 },
  { garby: 4, baza: 0.23, r0: 0.135, r1: 0.050, roz: 0.18, jag: 0.15, jag2: 0.08, dziury: 0.00 },
  { garby: 3, baza: 0.22, r0: 0.140, r1: 0.050, roz: 0.17, jag: 0.19, jag2: 0.11, dziury: 0.30 },
  { garby: 3, baza: 0.20, r0: 0.130, r1: 0.045, roz: 0.16, jag: 0.22, jag2: 0.13, dziury: 0.38 },
];
function dymAtlas() {
  const T = 112, S = T * 2;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), im = g.createImageData(S, S);
  const P4 = DYM_PAL;
  // światło z góry-lewej (jak na arkuszach PixelLaba), z komponentą Z, żeby
  // terminator na garbie był ŁUKIEM, a nie prostą — bez tego bandy układały się
  // w skośne paski i kłąb czytał się jak zebra
  let L = [-0.46, -0.70, 0.36]; const ln = Math.hypot(L[0], L[1], L[2]); L = L.map(v => v / ln);
  for (let ti = 0; ti < 4; ti++) {
    const K = DYM_KAFLE[ti], ox = (ti % 2) * T, oy = (ti >> 1) * T;
    let sd = ti * 9781 + 17;
    const rnd = () => { sd = (sd * 1664525 + 1013904223) | 0; return ((sd >>> 8) & 0xffffff) / 0xffffff; };
    // KLASYCZNY PIXELOWY KŁĄB: jeden szeroki garb bazowy + 3-4 mniejsze bąble na
    // łuku nad nim = zaokrąglona góra, przysadzisty spód. Wszystko z zapasem, żeby
    // sylwetka NIE DOTYKAŁA krawędzi kafla (inaczej kłąb wygląda jak ucięty).
    const garby = [{ x: 0.50 + (rnd() - 0.5) * 0.04, y: 0.60, r: K.baza }];
    for (let k = 0; k < K.garby; k++) {
      const u = K.garby === 1 ? 0.5 : k / (K.garby - 1);
      garby.push({
        x: 0.5 + (u - 0.5) * K.roz * 2.0 + (rnd() - 0.5) * 0.04,
        y: 0.47 - Math.sin(u * Math.PI) * 0.075 + (rnd() - 0.5) * 0.035,
        r: K.r0 + rnd() * K.r1,
      });
    }
    const pole = new Float32Array(T * T), wlasc = new Int8Array(T * T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const nx = (x + 0.5) / T, ny = (y + 0.5) / T;
      let f = -9, oi = 0;
      for (let k = 0; k < garby.length; k++) {
        const b = garby[k], v = 1 - Math.hypot(nx - b.x, ny - b.y) / b.r;
        if (v > f) { f = v; oi = k; }
      }
      f += (pnoise(nx * 9 + ti * 3.7, ny * 9 + ti * 2.3, 9) - 0.5) * K.jag
         + (pnoise(nx * 19 + ti * 5.1, ny * 19 + ti * 1.9, 19) - 0.5) * K.jag2;
      // DZIURY: strzęp dymu jest przewiany, więc trzeci szum wygryza mu wnętrze
      if (K.dziury > 0) f -= Math.max(0, pnoise(nx * 11 + ti * 7.7, ny * 11 + ti * 3.3, 11) - 0.46) * K.dziury * 1.6;
      pole[y * T + x] = f; wlasc[y * T + x] = oi;
    }
    const poza = (xx, yy) => xx < 0 || yy < 0 || xx >= T || yy >= T || pole[yy * T + xx] <= 0;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const f = pole[y * T + x];
      const i = ((oy + y) * S + ox + x) * 4;
      if (f <= 0) continue;                                   // poza sylwetką
      // rant: dithering szachownicą — klasyczna pixel-artowa „rozsypka" dymu
      if (f < 0.02 && ((x + y) & 1)) continue;
      // kontur = piksel sylwetki, który ma sąsiada na zewnątrz (grubość DYM_PAL.gr)
      let brzeg = false, rant = false;
      for (let d = 1; d <= (DYM_PAL.gr || 1) && !brzeg; d++) {
        brzeg = poza(x - d, y) || poza(x + d, y) || poza(x, y - d) || poza(x, y + d);
      }
      const GR2 = (DYM_PAL.gr || 1) + 3;
      for (let d = 1; d <= GR2 && !rant; d++) rant = poza(x, y - d);   // ile do GÓRNEJ krawędzi
      let kol, a = 224;
      // KONTUR JEST BARDZIEJ KRYJĄCY OD WNĘTRZA (255 vs 224). Przy jednolitej alfie
      // ciemna obwódka gasła razem z ciałem kłębu i sylwetka rozmywała się w trawie.
      if (brzeg) { kol = P4.kontur; a = 255; }
      else if (rant) { kol = P4.jasny; }                      // ŚWIETLNY RANT u góry kłębu
      else {
        const b = garby[wlasc[y * T + x]];
        const nx = (x + 0.5) / T, ny = (y + 0.5) / T;
        const vx = (nx - b.x) / b.r, vy = (ny - b.y) / b.r;
        const m = Math.min(1, Math.hypot(vx, vy));
        const nz = Math.sqrt(Math.max(0, 1 - m * m));         // normalna kuli garbu
        const lit = -(vx * L[0] + vy * L[1]) + nz * L[2];      // -1..1
        // walor = GLOBALNE światło z góry (cały kłąb) + LOKALNA bryła garbu.
        // Samo lokalne dawało bąbelki jak winogrona, samo globalne — płaski pasek.
        const s = 0.42 * (1.0 - ny) + 0.58 * (0.5 + 0.5 * lit);
        kol = s > 0.66 ? P4.jasny : s > 0.44 ? P4.sredni : P4.ciemny;
      }
      im.data[i] = kol[0]; im.data[i + 1] = kol[1]; im.data[i + 2] = kol[2]; im.data[i + 3] = a;
    }
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// MAPA SZUMU DO KŁĘBIENIA (64², kafelkuje się bezszwowo, `RepeatWrapping`).
// Kanoniczna sztuczka na stylizowany dym: NIE obracamy naklejki, tylko
// PRZEWIJAMY szum w UV. Obracany billboard czyta się jak wirująca nalepka;
// przesuwany szum wygryza sylwetkę i kłąb faktycznie się kłębi. Wartości są
// kwantowane na 8 stopni, więc erozja idzie pixel-artowymi skokami.
function dymSzum() {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), im = g.createImageData(S, S);
  const OKT = [[4, 0.50], [8, 0.28], [16, 0.15], [32, 0.07]];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const [per, waga] of OKT) v += pnoise(x / S * per, y / S * per, per) * waga;
    v = Math.max(0, Math.min(1, (v - 0.30) * 1.9));
    const i = (y * S + x) * 4, b = Math.round(Math.floor(v * 8) / 8 * 255);
    im.data[i] = im.data[i + 1] = im.data[i + 2] = b; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

// JEDEN InstancedMesh = jeden draw call na cały dym, zero alokacji w pętli klatki
// i pełna swoboda per kłąb (własna alfa, odcień, kafel atlasu, obrót) — czego
// pula 26 zwykłych meshy z jednym materiałem dać nie mogła (wspólne `opacity`).
// Cała animacja siedzi w vertex shaderze: na klatkę lecą 4 uniformy, CPU nie
// liczy nic. Dlatego stać nas na 96 kłębów przy 500 wrogach.
// KOLUMNY, NIE KROPKI. Pierwsza wersja tego podejścia rozsypywała pojedyncze
// kłęby równo po tarczy i czytało się to jak ŁATY PLEŚNI na trawie — bo dym bez
// pionu jest dywanem. Teraz instancje są pogrupowane w PIÓRA (`DYM_W_PIORZE`
// kłębów na kolumnę): kolejne kłęby jednego pióra mają przesunięte fazy, więc
// wychodzą z ziemi jeden za drugim, puchną, chwieją się i strzępią u góry —
// czyli kolumna smrodu jak z komina. Zasięg = ILE tych kolumn stoi wokół gracza.
const DYM_W_PIORZE = 5;
const DYM_PIOR = 24;
const DYM_ILE = DYM_PIOR * DYM_W_PIORZE;               // 168 kłębów, 1 draw call
const dymCfg = {
  opac: 0.80,      // krycie kłębu (przez dym MUSI być widać wrogów)
  pasy: 5,         // kwantyzacja alfy — zanik skokami, nie gradientem
  dur: 2.8,        // czas przelotu kłębu przez całą kolumnę [s]
  wys: 3.0,        // wysokość kolumny w jednostkach
  roz: 1.90,       // rozmiar kłębu w jednostkach świata (STAŁY, nie od promienia)
  gest: 0.17,      // kolumn na jednostkę² powierzchni aury
  ile0: 2,         // minimum kolumn (poz. 1 ma być skromna, ale nie pusta)
  wir: 0.11,       // prędkość krążenia kolumn wokół gracza
  wykl: 1.30,      // >1 = zagęszczenie ku środkowi (1 = równo po powierzchni)
  kraw: 0.35,      // o ile przezroczystsze są kolumny na skraju zasięgu
  chwiej: 0.55,    // amplituda chwiania kolumny
  strzep: 1,       // 1 = kłąb u góry przechodzi na poszarpany kafel
  klebSk: 2.2,     // skala szumu kłębienia (ile „bąbli" na kłąb)
  klebSp: 0.30,    // prędkość przewijania szumu kłębienia
  erozja: 0.28,    // ile szum wygryza ze STAREGO kłębu (0 = nic nie wygryza)
  nadZ: 0.42,      // podniesienie quada nad punkt bazowy (żeby nie ciął trawy)
  blend: 'normal',
};
let dymMesh = null, dymMat = null, dymPulsT = -9;
function initSmrod() {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  const seed = new Float32Array(DYM_ILE * 4), pior = new Float32Array(DYM_ILE * 2);
  const tint = new Float32Array(DYM_ILE * 3), idx = new Float32Array(DYM_ILE);
  const kol = new Float32Array(DYM_ILE);
  for (let p = 0; p < DYM_PIOR; p++) {
    // JEDNA KOLUMNA = jedno źródło smrodu. Kąt i promień są wspólne dla całego
    // pióra, dlatego jego kłęby układają się w pion, a nie w chmarę kropek.
    const kat = Math.random() * Math.PI * 2;
    // promień z sqrt = równa gęstość po POWIERZCHNI (bez zbicia w środku).
    // Losowany, nie po indeksie, żeby każdy podzbiór (poz. 1-4) też był równy.
    const pr = Math.sqrt(Math.random());
    const durMul = 0.80 + 0.45 * Math.random();       // każda kolumna dymi w swoim tempie
    const wob = Math.random() * Math.PI * 2;          // faza chwiania
    for (let j = 0; j < DYM_W_PIORZE; j++) {
      const i = p * DYM_W_PIORZE + j;
      seed[i * 4] = kat;
      seed[i * 4 + 1] = pr;
      // fazy rozłożone po łańcuchu + drobny jitter = kłęby wychodzą jeden za
      // drugim, ale nie jak na sznurku
      seed[i * 4 + 2] = (j + 0.35 * (Math.random() - 0.5)) / DYM_W_PIORZE;
      seed[i * 4 + 3] = Math.random();                // jitter rozmiaru/obrotu
      pior[i * 2] = durMul; pior[i * 2 + 1] = wob;
      kol[i] = (i % 2) * 0.5;                         // która kolumna atlasu (wariant kształtu)
      // odcień: część kłębów żółtawa, część zielona — warstwy zamiast jednej mazi
      const z = 0.90 + 0.16 * Math.random();
      tint[i * 3] = z * (1.00 + 0.06 * Math.random());
      tint[i * 3 + 1] = z;
      tint[i * 3 + 2] = z * (0.86 + 0.22 * Math.random());
      idx[i] = i / DYM_ILE;
    }
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.setAttribute('aPlm', new THREE.InstancedBufferAttribute(pior, 2));
  geo.setAttribute('aKol', new THREE.InstancedBufferAttribute(kol, 1));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  geo.setAttribute('aI', new THREE.InstancedBufferAttribute(idx, 1));
  geo.instanceCount = DYM_ILE;
  dymMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true,
    uniforms: {
      uMap: { value: dymAtlas() }, uTime: { value: 0 }, uR: { value: 2 },
      uCenter: { value: new THREE.Vector3() }, uRight: { value: new THREE.Vector3(1, 0, 0) },
      uUp: { value: new THREE.Vector3(0, 1, 0) }, uFrac: { value: 0.2 }, uPuls: { value: 0 },
      uOpac: { value: dymCfg.opac }, uPasy: { value: dymCfg.pasy }, uDur: { value: dymCfg.dur },
      uWys: { value: dymCfg.wys }, uRoz: { value: dymCfg.roz }, uWir: { value: dymCfg.wir },
      uWykl: { value: dymCfg.wykl }, uKraw: { value: dymCfg.kraw },
      uChwiej: { value: dymCfg.chwiej }, uStrzep: { value: dymCfg.strzep },
      uSzum: { value: dymSzum() }, uKlebSk: { value: dymCfg.klebSk },
      uKlebSp: { value: dymCfg.klebSp }, uErozja: { value: dymCfg.erozja },
      uNadZ: { value: dymCfg.nadZ },
    },
    vertexShader: `
      attribute vec4 aSeed; attribute vec2 aPlm; attribute vec3 aTint;
      attribute float aI; attribute float aKol;
      uniform float uTime, uR, uOpac, uPuls, uFrac, uDur, uWys, uRoz, uWir, uWykl, uKraw,
                    uChwiej, uStrzep, uKlebSk, uKlebSp, uErozja, uNadZ;
      uniform vec3 uCenter, uRight, uUp;
      varying vec2 vUv; varying vec2 vSz; varying float vA; varying float vEr; varying vec3 vTint;
      void main() {
        // aI > uFrac = kłąb wyłączony (zerowy quad). Instancje idą PIÓRAMI, więc
        // odcięcie po indeksie gasi CAŁE kolumny — tak rośnie zasięg z poziomem.
        float on = step(aI, uFrac);
        float life = fract(uTime / (uDur * aPlm.x) + aSeed.z);
        // pow(): >1 zsuwa kolumny do środka, więc dym ma ŹRÓDŁO (gracza), a nie
        // równą tarczę — brzeg zasięgu wychodzi miękko z rzadszego dymu
        float pr = pow(aSeed.y, uWykl);
        float kat = aSeed.x + uTime * uWir * (0.55 + aSeed.y);
        vec3 sty = vec3(sin(kat), 0.0, cos(kat));                  // kierunek do stopy kolumny
        vec3 p = uCenter + sty * (uR * pr * 0.90);
        // CHWIANIE: im wyżej kłąb, tym bardziej odjeżdża w bok — kolumna się wije,
        // a nie stoi jak słup. Dryf idzie w styczną, żeby dym „owijał" gracza.
        vec3 sty90 = vec3(cos(kat), 0.0, -sin(kat));
        float wob = sin(uTime * 0.9 + aPlm.y + life * 2.6) * uChwiej * life;
        p += sty90 * wob + sty * (uR * 0.10 * life);
        p.y += 0.10 + uWys * life;
        // kłąb rośnie w trakcie wznoszenia (rozprężanie) i puchnie na tykniecie trucizny
        float sz = uRoz * (0.55 + 0.95 * life) * (0.86 + 0.28 * aSeed.w) * (1.0 + 0.12 * uPuls) * on;
        float env = smoothstep(0.0, 0.10, life) * (1.0 - smoothstep(0.42, 1.0, life));
        vA = uOpac * env * (0.86 + 0.26 * aSeed.w) * mix(1.0, 1.0 - uKraw, pr) * on;
        vTint = aTint * (1.0 + 0.22 * uPuls);
        // MŁODY kłąb = gęsty kalafior (górny rząd atlasu), STARY = poszarpany
        // strzęp (dolny rząd): dym rozwiewa się, wznosząc się. Zero kosztu.
        vUv = uv * 0.5 + vec2(aKol, step(0.55, life) * uStrzep * 0.5);
        // UV szumu kłębienia: PRZEWIJANE w czasie (dym się kłębi), z przesunięciem
        // per kłąb, żeby dwa sąsiednie nie wygryzały się identycznie
        vSz = uv * uKlebSk + vec2(aSeed.w * 7.3 + uTime * uKlebSp * 0.5,
                                  aSeed.z * 5.1 - uTime * uKlebSp);
        // erozja rośnie z wiekiem: świeży kłąb jest zwarty, stary rozdmuchany
        vEr = uErozja * smoothstep(0.15, 0.95, life);
        // uNadZ podnosi quada NAD punkt bazowy — inaczej dolna połowa pochylonego
        // billboardu wchodzi w teren i powstaje twarda linia cięcia o ostrza trawy
        vec3 wp = p + uRight * (position.x * sz) + uUp * ((position.y + uNadZ) * sz);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform sampler2D uSzum; uniform float uPasy;
      varying vec2 vUv; varying vec2 vSz; varying float vA; varying float vEr; varying vec3 vTint;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        if (t.a < 0.25) discard;                      // twarda sylwetka: zero rozmycia
        // KŁĘBIENIE: przewijany szum wygryza dziury w kłębie (im starszy, tym
        // bardziej). NearestFilter na obu teksturach = erozja idzie po pikselach.
        if (texture2D(uSzum, vSz).r < vEr) discard;
        float a = floor(vA * uPasy + 0.5) / uPasy;    // ALFA W PASACH (jak gradient nieba)
        if (a < 0.02) discard;
        gl_FragColor = vec4(t.rgb * vTint, a * t.a);
        #include <colorspace_fragment>
      }`,
  });
  dymMesh = new THREE.Mesh(geo, dymMat);
  dymMesh.frustumCulled = false;                     // pozycje liczy shader, bbox kłamie
  dymMesh.renderOrder = 3;                           // pod kopią gracza (899/900)
  dymMesh.visible = false;
  scene.add(dymMesh);
}
const _dymX = new THREE.Vector3(), _dymY = new THREE.Vector3(), _dymZ = new THREE.Vector3();
function updateSmrod() {
  if (!dymMesh) return;
  const w = hasWeapon('skarpeta');
  const on = !!w && !G.fps.on && G.running;
  dymMesh.visible = on;
  if (!on) return;
  const r = skarpetaR(w.lvl), u = dymMat.uniforms;   // dym = realny zasięg trucia (E2 K9: z sufitem obszarówek)
  u.uTime.value = G.time;
  u.uR.value = r;
  u.uCenter.value.set(P.pos.x, terrainH(P.pos.x, P.pos.z) + 0.05, P.pos.z);
  // LICZBA KOLUMN rośnie z POWIERZCHNIĄ (r²), rozmiar kłębu zostaje stały:
  // poz. 1 → 3 kolumny u stóp, poz. 5 → 19 = ściana smrodu. Piksele nie puchną.
  const kolumny = Math.min(DYM_PIOR, Math.max(dymCfg.ile0, Math.round(dymCfg.gest * r * r)));
  u.uFrac.value = (kolumny * DYM_W_PIORZE - 1) / DYM_ILE;
  u.uPuls.value = Math.max(0, 1 - (G.time - dymPulsT) / 0.30);
  camera.matrixWorld.extractBasis(_dymX, _dymY, _dymZ);
  u.uRight.value.copy(_dymX); u.uUp.value.copy(_dymY);
  u.uOpac.value = dymCfg.opac; u.uPasy.value = dymCfg.pasy; u.uDur.value = dymCfg.dur;
  u.uWys.value = dymCfg.wys; u.uRoz.value = dymCfg.roz; u.uWir.value = dymCfg.wir;
  u.uWykl.value = dymCfg.wykl; u.uKraw.value = dymCfg.kraw;
  u.uChwiej.value = dymCfg.chwiej; u.uStrzep.value = dymCfg.strzep;
  u.uKlebSk.value = dymCfg.klebSk; u.uKlebSp.value = dymCfg.klebSp;
  u.uErozja.value = dymCfg.erozja; u.uNadZ.value = dymCfg.nadZ;
}

let aura = null, auraRing = null;
function initAura() {
  const m = new THREE.MeshBasicMaterial({ map: auraTexture(), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 });
  aura = new THREE.Mesh(unitGeo, m);
  aura.renderOrder = 4;                                  // pod kopią gracza (899/900)
  aura.visible = false;
  const rm = new THREE.MeshBasicMaterial({ map: ringTexture('#ffe07a'), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 });
  auraRing = new THREE.Mesh(blobGeo, rm);
  auraRing.visible = false;
  scene.add(aura); scene.add(auraRing);
}
function updateAura() {
  if (!aura) return;
  const niet = G.buff.key === 'niet';
  // TYLKO buff nietykalności z Garnka. Po zwykłym ciosie zostaje samo czerwone miganie
  // (decyzja właściciela 18.09: pierścień na ziemi wyglądał na przesunięty względem
  // pochylonego sprite'a i mylił — „usunąć i dać tylko miganie na czerwono").
  // Pierścień na ziemi wyłączony na stałe z tego samego powodu.
  const on = niet && !G.dying && !G.fps.on;
  aura.visible = on; auraRing.visible = false;
  if (!on) return;
  const puls = 0.5 + 0.5 * Math.sin(G.time * (niet ? 7 : 13));
  const h = playerBB.h;
  aura.material.opacity = (niet ? 0.55 : 0.40) + 0.25 * puls;
  // 1.55 -> 1.32 i nizszy srodek: poswiata siegala wysoko nad glowe i czytala sie
  // jako „blysk nad postacia", a ma byc otoczka POSTACI
  aura.scale.set(h * (1.32 + 0.08 * puls), h * (1.32 + 0.08 * puls), 1);
  // pivot sprite'a siedzi w stopach, więc poświatę środkujemy na tułowiu
  aura.position.set(playerBB.mesh.position.x, playerBB.mesh.position.y + h * 0.38, playerBB.mesh.position.z);
  aura.quaternion.copy(playerBB.mesh.quaternion);
  auraRing.material.opacity = (niet ? 0.75 : 0.5) + 0.25 * puls;
  const r = h * (0.95 + 0.12 * puls);
  auraRing.scale.set(r, 1, r);
  auraRing.position.set(P.pos.x, P.y + 0.06, P.pos.z);
}

// ============================== META (localStorage) ==============================
// DOMYŚLNE MAPOWANIE PADA stoi TU, a nie w sekcji KONTROLER, bo `loadMeta()` woła
// się od razu przy starcie modułu — `const` niżej siedziałby jeszcze w TDZ.
// Indeksy = układ `standard` Gamepad API: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT,
// 7 RT, 8 Back, 9 Start. Opis rodzin i glifów: sekcja KONTROLER.
const PAD_MAP_DOM = { skok: 0, karabin: 2, wieza: 3, smrod: 5, kamera: 4, pauza: 9 };
// DRUGIE WEJŚCIE na te same akcje — nie da się ich przemapować i o to chodzi:
// spusty leżą pod palcami wskazującymi, więc karabin/wieżyczka są osiągalne bez
// puszczania drążków, a Back/Select to pauza na handheldach bez przycisku Start.
const PAD_ALT = { karabin: 7, wieza: 6, pauza: 8 };
const META_KEY = 'horda3d_meta_v1';
function loadMeta() {
  const def = () => ({
    coins: 0, up: { serce: 0, dmg: 0, szyb: 0, magnes: 0, klatwa: 0, karabin: 0 }, unlocked: {},
    chars: { carrotello: 1 }, lastChar: 'carrotello', lastMap: 'laki',
    // `chests` = złote skrzynie z bronią, `skrzynki` = zwykłe (od nich zależy
    // wyreżyserowana sekwencja pierwszych sześciu nagród)
    st: { kills: 0, runs: 0, time: 0, best: 0, bestKills: 0, bosses: 0, coins: 0, chests: 0, skrzynki: 0, lvl: 0,
          kaprale: 0, wins: 0, donReached: 0,       // E1-bieg K7/K8 (spec §9.5)
          // przegląd K9–K11: `pelne` = biegi zakończone śmiercią/wygraną albo wyjściem do menu po ≥ 60 s (od nich
          // zależy łagodny pierwszy bieg — szybkie „Do menu" go nie zużywa); `smierci` = porażki (prezent Piorun
          // za pierwszą porażkę/wygraną); `bestDon` = najszybsza walka z Donem w s (0 = brak wygranej)
          pelne: 0, smierci: 0, bestDon: 0,
          jackpoty: 0, przepisy: 0,                 // E2: jackpoty w historii zapisu (scenariusz 1-1-3-1-5), ugotowane dania
          // E3 (spec 09 §8): kapliczki, wydarzenia, karabin; `karabinPierwszy` = gwarantowany karabin już był
          stolnice: 0, wyzwania: 0, wyzwaniaWyg: 0, wydarzenia: 0, zmyci: 0, przygnieceni: 0, karabiny: 0,
          karabinPierwszy: false,
          bestMapa: {} },                           // 29.09: najdłużej przeżyty czas per mapa (odblokowania map)
    bestiary: {},                                  // typ wroga -> ile razy zabity (bestiariusz)
    audio: { muz: 0.15, glos: 0.9, efe: 0.7, mute: 0 },   // głośności i wyciszenie (zakładka Dźwięk)
    // KONTROLER (zakładka Sterowanie). `map` trzyma INDEKSY przycisków w układzie
    // `standard` Gamepad API — nie litery, bo te same indeksy noszą u Nintendo inne
    // napisy (patrz glTabela) i zapis przeniósłby się między padami błędnie.
    pad: { map: { ...PAD_MAP_DOM }, czulosc: 1, invY: 0, wibracje: 1, uklad: 'auto' },   // uklad: auto|xbox|ps|switch
    // JEDNORAZOWE PODPOWIEDZI UI. `pwaHint` = czy pokazaliśmy już iPhone'owi, że
    // pełny ekran robi się przez „Dodaj do ekranu początkowego" (Safari nie ma
    // Fullscreen API dla stron). Raz pokazane = nigdy więcej.
    // `komiks` = czy gracz widział już komiks wprowadzający (leci raz, po ekranie
    // ładowania; potem tylko z przycisku FABUŁA w menu). Stare zapisy go nie mają,
    // więc `Object.assign(d.ui, m.ui)` niżej zostawia false i komiks poleci raz.
    ui: { pwaHint: false, komiks: false,
          skrzyniaSzybka: null, ksiazkaNowe: false, ksiazkaPodp: false,   // E2: animacja skrzyni (null = wg systemu), kropka Książki, podpowiedź
          // E3: podpowiedzi przy znacznikach (3× na typ), pierwsza Stolnica (toast), celowanie karabinu na dotyku
          podp: { stolnica: 0, wyzwanie: 0, garnek: 0 }, stolnicaToast: false, celKarabinu: 'auto' },
    ksiazka: {},                                 // E2: evoKey → { odk: 0|1, prawie: n, ile: n } (Książka kucharska)
    // B12: prośba o kawę na ekranie końca — `dzien` = data ostatniego pokazu, `spokojDo` = ms (po kliknięciu kawy +30 dni),
    // `czasy` = długości ostatnich 20 pełnych biegów (mediana gracza), `krotkie` = porażki < 2 min z rzędu
    kawa: { dzien: '', spokojDo: 0, czasy: [], krotkie: 0, pokazy: 0, klik: 0 },
    lang: '',                                    // '' = automatycznie z przeglądarki; 'pl' | 'en' po wyborze gracza
    kody: {},                                    // Kod od Nonny: skrót SHA-256 (16 znaków) → data użycia (raz na urządzenie)
  });
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY)) || {};
    const d = def();
    return {
      coins: m.coins || 0,
      up: Object.assign(d.up, m.up),
      unlocked: Object.assign(d.unlocked, m.unlocked),
      chars: Object.assign(d.chars, m.chars),
      lastChar: m.lastChar || 'carrotello', lastMap: m.lastMap || 'laki',
      // stare zapisy (sprzed liczników `pelne`/`smierci`): każdy dawny bieg liczy się jak pełny, a dawne
      // nie-wygrane jak porażki — weteran nie dostanie drugi raz łagodnego biegu ani „pierwszej porażki"
      st: Object.assign(d.st, m.st, m.st && m.st.pelne == null
        ? { pelne: m.st.runs || 0, smierci: Math.max(0, (m.st.runs || 0) - (m.st.wins || 0)) } : {}),
      // stare zapisy nie mają bestiariusza — domyślnie pusty, nic nie psujemy
      bestiary: Object.assign(d.bestiary, m.bestiary),
      // stare zapisy nie mają ustawień dźwięku — biorą domyślne
      audio: Object.assign(d.audio, m.audio),
      // pad: dopełniamy PO KLUCZU, bo dojście nowej akcji (np. smrodu) nie może
      // skasować mapowania, które gracz już sobie przestawił
      pad: Object.assign(d.pad, m.pad, { map: Object.assign(d.pad.map, m.pad && m.pad.map) }),
      // stare zapisy: podpowiedzi jeszcze niepokazane; E3 `ui.podp` dopełniane PO KLUCZU (nowy typ kapliczki nie kasuje liczników)
      ui: Object.assign(d.ui, m.ui, { podp: Object.assign(d.ui.podp, m.ui && m.ui.podp) }),
      // E2: Książka kucharska — BIAŁA LISTA (bez tej linii pierwszy saveMeta() kasowałby odkrycia)
      ksiazka: Object.assign(d.ksiazka, m.ksiazka),
      kawa: Object.assign(d.kawa, m.kawa),        // B12: BIAŁA LISTA (inaczej 30 dni spokoju znikałoby po przeładowaniu)
      // język MUSI wrócić z zapisu: bez tego pierwszy `saveMeta()` po przeładowaniu
      // zapisywał META bez `lang` i wybór PL/EN znikał (zgłoszenie agenta komiksu)
      lang: m.lang || '',
      kody: Object.assign(d.kody, m.kody),       // BIAŁA LISTA: bez tej linii zużyty kod działałby znowu po przeładowaniu
    };
  } catch { return def(); }
}
const META = loadMeta();
// 30.09 MIGRACJA „OSIEDLE": kolejność map zmieniła się na Łąki → Osiedle → Wąwozy → Market (Wąwozy po 5:00 na Osiedlu).
// Kto miał Wąwozy otwarte po staremu (5:00 na Łąkach albo już tam grał), ZACHOWUJE je i dostaje też Osiedle.
// Raz na zapis: `st.mapyOtw` powstaje przy pierwszym wczytaniu po zmianie i zapisuje się z resztą `st`.
// Poprawka z przeglądu (30.09): pierwsza wersja brała `bestMapa.laki`, gdy już istniało — a pierwszy bieg po v299
// (nawet szybkie „Do menu") wpisywał tam np. 95 s i stary rekord 8:00 przestawał się liczyć → weteran z demo v299/v301
// dostawał same Łąki. Druga migracja na nowym kluczu bierze MAX z obu i tylko DOKŁADA (niczego nie zamyka).
if (!META.st.mapyOtw2) {
  const b = META.st.bestMapa || {}, laki = Math.max(b.laki || 0, META.st.best || 0);
  META.st.mapyOtw = META.st.mapyOtw || {};
  if (laki >= 300 || b.wawozy > 0 || b.market > 0) Object.assign(META.st.mapyOtw, { osiedle: 1, wawozy: 1 });
  META.st.mapyOtw2 = 1;
}
// B12: „nie w pierwszej sesji" = ta karta wystartowała bez żadnego pełnego biegu w zapisie (sesja = jedno załadowanie strony)
const KAWA_PIERWSZA_SESJA = !(META.st.pelne > 0);

// DEV: scena stresu (sekcja „SCENA STRESU" niżej). Zadeklarowane tutaj, bo czytają je
// też funkcje wyżej w pliku. Po pierwszym włączeniu stresu zapis jest wyłączony do
// przeładowania strony — nieśmiertelny bieg nie może trafić do zapisu gracza
// (monety, rekordy, bestiariusz, odblokowania postaci).
let STRES = 0;
let bezZapisu = false;
const saveMeta = () => { if (!bezZapisu) localStorage.setItem(META_KEY, JSON.stringify(META)); };
// zapis „za chwilę" — liczniki bestiariusza tykają co zabicie, nie chcemy pisać
// do localStorage kilkaset razy na minutę
let saveT = 0;
function saveMetaSoon() {
  if (saveT) return;
  saveT = setTimeout(() => { saveT = 0; saveMeta(); }, 2000);
}
// dopisanie na siłę czekającego zapisu (patrz handlery `pagehide`/`visibilitychange`)
function flushMeta() {
  if (!saveT) return;
  clearTimeout(saveT); saveT = 0;
  saveMeta();
}
// dźwięk czyta/zapisuje głośności w META; trzeci argument to napisy przycisku
// wyciszenia — audio.js nie może importować `T()` z main.js (cykl modułów)
AUDIO.init(META, saveMeta, {
  wlacz: T('WŁĄCZ DŹWIĘK', 'SOUND ON'),
  wycisz: T('WYCISZ WSZYSTKO', 'MUTE EVERYTHING'),
});
// Komiks dostaje wszystko przez wstrzyknięcie, żeby nie zależał od miejsca, w którym
// stoi blok JĘZYK ani od kolejności importów (T zamyka się nad JEZYK.cur, więc
// zmiana języka działa też dla podpisów).
initKomiks({ T, ico, META, saveMeta, STATY, AUDIO });

// Przełączenie języka: zapis w META i PRZEŁADOWANIE STRONY. Rejestry (WEAPONS,
// ENEMY_TYPES, SHOP, PORADY…) zbudowały swoje napisy przy starcie modułu, więc
// samo przerysowanie menu zostawiłoby połowę gry w starym języku. Reload jest
// natychmiastowy (gra ładuje się z cache) i nic nie gubi — postęp siedzi w META.
function ustawJezyk(l) {
  if (l !== 'pl' && l !== 'en') return;
  if (l === JEZYK.cur && META.lang === l) return;
  META.lang = l;
  flushMeta(); saveMeta();
  STATY.zdarzenie('lang/' + l);
  // krótka zwłoka: `location.reload()` ANULUJE żądania w locie, a zdarzenie
  // GoatCountera idzie asynchronicznie — bez tego licznik języka byłby pusty
  setTimeout(() => location.reload(), 120);
}
// Dwa zestawy przycisków PL|EN: róg ekranu startowego (#langPl/#langEn) i wiersz
// w zakładce „Dźwięk i ekran" (#langPl2/#langEn2). Wołane z sekwencji startowej.
function initJezykUI() {
  const pary = [['langPl', 'langEn'], ['langPl2', 'langEn2']];
  for (const [idPl, idEn] of pary) {
    const bPl = document.getElementById(idPl), bEn = document.getElementById(idEn);
    if (!bPl || !bEn) continue;
    bPl.classList.toggle('sel', JEZYK.cur === 'pl');
    bEn.classList.toggle('sel', JEZYK.cur === 'en');
    bPl.onclick = () => ustawJezyk('pl');
    bEn.onclick = () => ustawJezyk('en');
  }
}

// Ceny wejścia podniesione razem z dopływem monet (×1.8): przy starych 30-40
// pierwszy bieg wystarczał na 2-3 zakupy i sklep nie stawiał żadnego pytania.
const SHOP = [
  { key: 'serce',  ico: 'serce', nm: T('Twarde serce', 'Tough Heart'),
    ds: T('+1 serce na start', '+1 heart at the start'), base: 80, max: 3 },
  { key: 'dmg',    ico: 'fala', nm: T('Siła', 'Might'),
    ds: T('+10% obrażeń na stałe', '+10% damage, permanently'), base: 60, max: 5 },
  { key: 'szyb',   ico: 'but', nm: T('Kondycja', 'Stamina'),
    ds: T('+8% szybkości na stałe', '+8% move speed, permanently'), base: 60, max: 5 },
  { key: 'magnes', ico: 'magnes', nm: T('Przyciąganie', 'Pull'),
    ds: T('+20% magnesu na stałe', '+20% magnet, permanently'), base: 50, max: 5 },
  // KLĄTWA: gracz KUPUJE SOBIE WIĘCEJ WROGÓW. Chwyt z Vampire Survivors (Curse
  // i Charm) — to wentyl na „wykupiłem cały sklep i nie mam po co grać": zamiast
  // końca progresji dostajesz dźwignię. Więcej wrogów = więcej XP i monet.
  { key: 'klatwa', ico: 'ostrzezenie', nm: T('Klątwa Nonny', "Nonna's Curse"),
    // E1-bieg: od K1 klątwa NIE zagęszcza spawnu (tylko hpScale ×(1+0,1·poz.) i monety) — opis bez
    // „liczniejsi". Cała klątwa zniknie w E4.
    ds: T('Wrogowie twardsi (+10% HP), ale monety sypią się gęściej (+20%)',
          'Tougher enemies (+10% HP) — but the coins pour harder (+20%)'), base: 120, max: 5 },
  // Sam KARABIN wypada ze skrzyni (nie da się go kupić) — w sklepie kupujesz tylko
  // DŁUŻSZY tryb. Inaczej najmocniejsza rzecz w grze byłaby na stałe za monety.
  { key: 'karabin', ico: 'celownik', nm: T('Magazynek Nonny', "Nonna's Magazine"),
    ds: T('+5 s trybu KARABIN (baza 20 s)', '+5 s of RIFLE mode (20 s base)'), base: 300, max: 3 },
];
// odblokowania broni i pasywów (jednorazowe — wchodzą do puli kart w biegu)
const SHOP_UNLOCKS = [
  { key: 'piorun',   ico: 'pioruny', nm: T('Piorun', 'Thunderbolt'),
    ds: T('Grom bije losowych wrogów', 'Lightning strikes random enemies'), price: 150 },
  { key: 'butelka',  ico: 'butelka', nm: T('Butelka żula', 'Hobo Bottle'),
    ds: T('Leci łukiem i wybucha', 'Lobbed in an arc, goes bang'), price: 200 },
  { key: 'bumerang', ico: 'pizza', nm: 'Pizza Volante',
    ds: T('Koło pizzy leci i wraca, kosząc po drodze', 'A pizza wheel flies out and back, mowing both ways'), price: 250 },
  // Pokrywka (`tarcza`) przeniesiona do SPIŻARNI NONNY (29.09) — klucz META.unlocked.tarcza bez zmian (stary zakup zostaje)
  { key: 'djump',   ico: 'skok', nm: T('Podwójny skok', 'Double Jump'),
    ds: T('Drugi skok w powietrzu — przeskakuj regały (bywa też w skrzyniach)',
          'A second jump mid-air — hop the shelves (also drops from crates)'), price: 300 },
  { key: 'glide',    ico: 'skok', nm: T('Foliowa torba', 'Plastic Bag'),
    ds: T('PRZYTRZYMAJ skok w locie = szybujesz na torbie i uciekasz hordzie',
          'HOLD jump in mid-air = glide on the bag and outrun the horde'), price: 250 },
  { key: 'skarpeta', ico: 'skarpeta', nm: T('Skarpeta', 'The Stink'),
    ds: T('Aura trucizny — słaba na start, ogromna po ulepszeniach',
          'A poison aura — weak at first, enormous once levelled'), price: 180 },
  { key: 'wiatrowka', ico: 'wiatr', nm: T('Wiatrówka', 'Air Rifle'),
    ds: T('Promień przeszywa całą linię', 'The beam skewers the whole line'), price: 220 },
  { key: 'kura',     ico: 'kukurydza', nm: 'Kernello Boomello',
    ds: T('Ziarno biegnie do wroga i strzela jak popcorn', 'The kernel runs at an enemy and pops'), price: 350 },
  { key: 'pipsini', ico: 'pestka', nm: 'Pipsini Nipotini',
    ds: T('Pestka-towarzysz: biega, tłucze i sadzi kiełki', 'A pip sidekick: runs, whacks, plants sprouts'), price: 320 },
  { key: 'sokowirowka', ico: 'sokowirowka', nm: T('Sokowirówka', 'Juicer'),
    ds: T('STAWIASZ ją i sama miele wrogów — ustaw ją w alejce', 'You PLACE it and it grinds by itself — park it in an aisle'), price: 280 },
  { key: 'krzak', ico: 'krzak', nm: T('Krzak pomidorowy', 'Tomato Bush'),
    ds: T('Sadzi się sam za Tobą i ostrzeliwuje pomidorami PO ŁUKU — bije ponad hordą',
          'Plants itself behind you and lobs tomatoes IN AN ARC — hits over the horde'), price: 300 },
];
// CENA odblokowania (EKONOMIA 29.09, „bronie 4× droższe"): `price` wyżej = cena bazowa; BROŃ (klucz w WEAPONS) ×
// trudn().ekon.bronCena (v2: ×4, v1: ×1), zdolności (Podwójny skok, Foliowa torba) bez zmian. Kupione wcześniej zostają
// (META.unlocked[klucz] = 1 — cena liczy się tylko przy zakupie). Wszystkie miejsca z ceną idą przez tę funkcję.
const jestBronia = it => !!WEAPONS[it.key];
const cenaOdbl = it => jestBronia(it) ? Math.round(it.price * ekon('bronCena')) : it.price;
// Cena rośnie nie tylko z poziomem POZYCJI, ale i z liczbą WSZYSTKICH zakupów
// (+10% każdy). U Vampire Survivors 91% pełnego kosztu maksowania meta-sklepu to
// sam narzut skalowania — to on robi całą długość gry, nie liczba pozycji.
const zakupyRazem = () => Object.values(META.up).reduce((a, b) => a + b, 0);
const shopPrice = it => Math.round(it.base * Math.pow(2, META.up[it.key]) * (1 + 0.10 * zakupyRazem()));

// ============================== SPIŻARNIA NONNY (życzenie właściciela 29.09) ==============================
// „Power-upy do odblokowania, do wykupienia i dużo rzadziej dawane; obecnie bardzo drogo — wyfarm albo kawa → kod na monety."
// Na start tylko 3 składniki (SKL_STARTOWE). Pozostałe 5 kupuje się RAZ w Sklepie; zablokowany nie trafia do kart ani
// jackpotu (cardPool → sklOdbl). Klucz zakupu = klucz składnika w META.unlocked (Pokrywka: `tarcza` jak od E2 — stary
// zakup zostaje). Cena rośnie z liczbą JUŻ kupionych składników (dowolna kolejność), nie z pozycją.
// „Większy słoik" (`sloik`) = maks. poziom składnika w biegu 3 → 5 (bez niego sufit z trudn().karty.sklMax).
// Preset trudności v1 (HORDA.trudnosc('v1')) wyłącza blokady i sufit — stare zachowanie (trudn().karty).
const SKL_STARTOWE = ['moc', 'tempo', 'buty'];
const SPIZ_KOLEJNOSC = ['magnes', 'krytyk', 'serce', 'zasieg', 'tarcza'];      // kolejność kafli (nie cen)
const CFG_SPIZ = {
  // Pomiar 29.09 (bot-średni, v2, Łąki, 16 biegów, bez ulepszeń sklepu): 3 składniki ~330 monet/bieg, wszystkie ~530,
  // wygrana ~2 400 → 1. składnik po ~3–4 biegach, całość (20 700) po ~35–40 biegach. Propozycja właściciela była
  // 1 500 / 2 500 / 4 000 / 6 000 / 9 000 (+ słoik) = ~55–60 biegów przy tym dochodzie — przycięte (PAKIET B16).
  ceny: [1200, 2000, 3200, 4800, 7000],           // 1., 2., … kupiony składnik (razem 18 200)
  sloik: 2500,                                     // Większy słoik — cena stała, poza progresją (razem 20 700)
};
const sklKupione = () => SPIZ_KOLEJNOSC.filter(k => META.unlocked[k]).length;
const cenaSpiz = () => CFG_SPIZ.ceny[Math.min(CFG_SPIZ.ceny.length - 1, sklKupione())];
// składnik dostępny w biegu? (v1: wszystko poza Pokrywką — jak przed 29.09)
function sklOdbl(k) {
  if (!PASSIVES[k]) return false;
  if (SKL_STARTOWE.includes(k)) return true;
  if (!trudn().karty.sklBlokady && k !== 'tarcza') return true;
  return !!META.unlocked[k];
}
// maks. poziom składnika w biegu (Pokrywka ma własne 3)
const sklMaxBiegu = k => Math.min(PASSIVES[k].max, META.unlocked.sloik ? 5 : trudn().karty.sklMax);

// ============================== ZAKUPY ZA PRAWDZIWE PIENIĄDZE — HAK POD E5 (NIEAKTYWNY) ==============================
// E5: Google Play Billing (Capacitor) / Steam (microtransakcje) — paczki monet. Tu NIC nie jest zaimplementowane:
// `wlaczone: false` = żaden przycisk się nie pokazuje. Implementacja w E5 podłączy `kup(paczka)` i serwerową weryfikację
// paragonu; do tego czasu wsparcie = kawa (tylko web) → kod od Nonny (KODY_NONNY niżej).
const KUP_MONETY = { wlaczone: false, paczki: [], kup: null };

// ============================== KOD OD NONNY (kody na monety dla wspierających) ==============================
// `kody.json` (ten sam origin, cache-bust): { "kody": [ { "h": sha256-hex, "m": monety } ] }. Hash liczony z
// SOL + kod po normalizacji: wielkie litery, bez myślników/spacji (alfabet bez 0/O, 1/I/L). Generator dla Piotra:
// `python3 narzedzia/kod_monet.py 5000 "notatka"` (jawne kody tylko lokalnie w narzedzia/kody-wydane.txt, .gitignore).
// DEV: `HORDA.kodyTest = [{ h, m }]` dokłada wpisy bez ruszania pliku (test bez działającego kodu w repo).
const KODY_ZDALNE = 'https://pixelpetrol.github.io/horda3d-demo/kody.json';   // jedno źródło kodów dla demo, itch i apki
const KODY_NONNY = {
  SOL: 'veggie-famiglia/kod-nonny/v1:',
  ALFABET: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  blokadaMs: 2000, blokadaDo: 0,
  norm: s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
  async hash(kod) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(KODY_NONNY.SOL + kod));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  },
  // → { ok, monety, klucz } albo { ok: false, powod: 'czekaj' | 'zly' | 'uzyty' | 'siec' | 'https' }
  async sprawdz(surowy) {
    const K = KODY_NONNY;
    if (K.trwa || performance.now() < K.blokadaDo) return { ok: false, powod: 'czekaj' };
    K.trwa = true;                                   // dwuklik nie zaliczy kodu dwa razy (dopisanie META.kody tuż po powrocie)
    try { return await K._sprawdz(surowy); } finally { K.trwa = false; }
  },
  async _sprawdz(surowy) {
    const K = KODY_NONNY;
    const kod = K.norm(surowy);
    const zly = () => { K.blokadaDo = performance.now() + K.blokadaMs; return { ok: false, powod: 'zly' }; };
    if (kod.length < 10 || [...kod].some(c => !K.ALFABET.includes(c))) return zly();
    if (!(window.crypto && crypto.subtle)) return { ok: false, powod: 'https' };
    const h = await K.hash(kod), klucz = h.slice(0, 16);
    if (META.kody[klucz]) return { ok: false, powod: 'uzyty' };
    // Przegląd 30.09: paczka na itch ma kody.json zamrożony w zipie — kod wydany po wgraniu zipa nie działał.
    // Najpierw lista z demo na Pages (CORS: *), potem lokalna; wystarczy, że jedna się uda.
    let lista = [], ok = false;
    for (const u of [KODY_ZDALNE, 'kody.json']) {
      try {
        const r = await fetch(u + '?cb=' + Date.now(), { cache: 'no-store' });
        if (r.ok) { lista = lista.concat((await r.json()).kody || []); ok = true; }
      } catch {}
    }
    if (!ok) return { ok: false, powod: 'siec' };
    if (DEV && Array.isArray(window.HORDA?.kodyTest)) lista = lista.concat(window.HORDA.kodyTest);
    const wpis = lista.find(x => x && x.h === h);
    if (!wpis) return zly();
    const monety = Math.max(0, Math.min(1000000, Math.round(+wpis.m || 0)));
    const mapy = wpis.mapy === 1 || wpis.mapy === true;   // 01.10: kod „wszystkie mapy" (kod_monet.py --mapy)
    if (!monety && !mapy) return zly();
    return { ok: true, monety, mapy, klucz };
  },
};

// ---- MENU: mapy / postacie / statystyki ----
// Panel Map = mapa osiedla we mgle (menu A, E4 K11). Rysowana tylko przy otwartym panelu (mapaOtworz / menuSkala).
function renderMaps() {
  if (document.getElementById('startOv')?.classList.contains('panel-mapy')) mapaAktualizuj();
}
// czy postać jest już nasza (kupiona ALBO wypracowana zabójstwami)
const maszPostac = (key) => !!META.chars[key] ||
  (CHARS[key].killGoal && META.st.kills >= CHARS[key].killGoal);
// Wywoływane z `killEnemy`: odblokowanie ma wystrzelić W TRAKCIE biegu, bo toast
// w środku walki jest mocniejszy niż komunikat na ekranie śmierci.
// Kamienie milowe co 500 dzielą duży cel na cztery mniejsze.
function sprawdzOdblokowaniaPostaci() {
  for (const key of Object.keys(CHARS)) {
    const C = CHARS[key];
    if (!C.killGoal || META.chars[key]) continue;
    if (META.st.kills >= C.killGoal) {
      META.chars[key] = 1; saveMeta(); renderChars();
      toastBuff(T('NOWA POSTAĆ: ', 'NEW CHARACTER: ') + C.nm.toUpperCase() + '!');
      AUDIO.sfx('zlota');
    } else if (META.st.kills % Math.max(50, Math.round(C.killGoal / 3)) === 0) {
      // kamienie milowe LICZONE OD CELU (trzy przystanki), nie na sztywno co 500 —
      // przy progu 450 komunikat co 500 nie pojawiłby się ani razu
      toastBuff(C.nm.split(' ')[0].toUpperCase() + ': ' + META.st.kills + '/' + C.killGoal);
    }
  }
}
function renderChars() {
  const wrap = document.getElementById('charGrid'); wrap.innerHTML = '';
  for (const key of Object.keys(CHARS)) {
    const C = CHARS[key];
    const owned = maszPostac(key);
    const d = document.createElement('div');
    d.className = 'tile' + (key === charKey ? ' sel' : '') + (owned ? '' : ' lock');
    // postać za zabójstwa pokazuje POSTĘP, nie cenę — inaczej nie wiadomo, po co grać
    const cel = C.killGoal
      ? `<div class="pr">${ico('czaszka', 15)} ${Math.min(META.st.kills, C.killGoal)}/${C.killGoal}</div>
         <div class="pbar"><i style="width:${Math.min(100, META.st.kills / C.killGoal * 100).toFixed(1)}%"></i></div>`
      : `<div class="pr">${ico('moneta', 15)} ${C.price}</div>`;
    // RENDER HD tam, gdzie jest (`object-fit:contain`, więc nic się nie rozciąga);
    // reszta dostaje auto-przycięty sprite — oba kadry są kwadratowe, więc rząd
    // kafelków ma jedną linię portretów niezależnie od tego, co w nim stoi.
    const rh = RENDER_PORTRET[key];
    // 72 px, nie 62: po auto-przycięciu portret jest KWADRATEM z 3 px marginesu,
    // więc sama postać zajmuje mniej niż w dawnym, ciasnym kadrze 64×77
    d.innerHTML = `<div class="ico"><img class="pxi${rh ? ' hd' : ''}" src="${rh || portret(C.char, 72)}" style="height:72px"></div>
      <div class="nm">${C.nm}</div>
      <div class="ds">${C.ds}</div>${C.regula ? `<div class="regula">${C.regula}</div>` : ''}${owned ? '' : cel}`;
    d.onclick = () => {
      if (!owned) {
        if (C.killGoal) {                          // tej się nie kupi, trzeba wyrobić
          d.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
            { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 200 });
          return;
        }
        if (META.coins < C.price) { d.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
          { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 200 }); return; }
        META.coins -= C.price; META.chars[key] = 1;
      }
      charKey = key; META.lastChar = key; saveMeta();
      setPlayerChar(key);
      renderChars(); renderShop(); renderPick();
    };
    wrap.appendChild(d);
  }
}
function renderPick() {
  // ---- MENU A „WARZYWNIAK": postać za ladą, szyld ‹ › i tabliczka mapy (E4 K11a) ----
  const C = CHARS[charKey], M = MAPS[mapKey];
  const por = document.getElementById('heroPortret');
  if (por) {
    // `render` gdy jest w mapie, inaczej klatka ze sprite'a w 256 px. Klasa `mini` = sprite (nearest, niżej).
    const r = RENDER_PORTRET[charKey];
    const srcPor = r || portret(C.char, 256);
    if (srcPor) por.src = srcPor; else por.removeAttribute('src');   // `src=''` = żądanie URL-a strony i ikona zepsutego obrazka
    por.classList.toggle('mini', !r);
    por.alt = C.nm;
  }
  // szyld na ladzie: pierwsze słowo imienia + krótka rola (fragment opisu po „—", do kropki)
  const nm = document.getElementById('heroNm'); if (nm) nm.textContent = C.nm.split(' ')[0].toUpperCase();
  const ds = document.getElementById('heroDs');
  if (ds) { const rola = (C.ds.split('—')[1] || C.ds).split('.')[0].trim(); ds.textContent = rola; }
  // STATYSTYKI: `spd/dmg/mag` to mnożniki (×), `hp` = DODATKOWE serca względem bazy (Razoretta ma -1).
  // Na ekranie głównym tylko PC (#heroStat), zawsze w panelu Postacie (#postStat) — audyt: na telefonie tabela wygrywała z postacią.
  const mn = v => '×' + (+v).toFixed(2).replace(/\.?0+$/, '');   // 1.00 → „×1", 1.15 → „×1.15"
  const serca = C.hp > 0 ? '+' + C.hp : (C.hp < 0 ? String(C.hp) : '—');
  const wiersze = [
    ['but', T('SZYBK.', 'SPEED'), mn(C.spd)],
    ['serce', T('SERCA', 'HEARTS'), serca],
    ['kula', T('OBRAŻ.', 'DAMAGE'), mn(C.dmg)],
    ['magnes', T('MAGNES', 'MAGNET'), mn(C.mag)],
  ].map(([i, k, v]) => `<div class="hs">${mIk(i)}<span>${k}</span><b>${v}</b></div>`).join('');
  const st = document.getElementById('heroStat'); if (st) st.innerHTML = wiersze;
  const ps = document.getElementById('postStat');
  if (ps) ps.innerHTML = `<div class="nm">${C.nm}</div>` + wiersze;
  // TABLICZKA MAPY: 0 biegów = sama nazwa (bez wyboru); potem ‹ nazwa › (nazwa otwiera mapę osiedla)
  const mp = document.getElementById('heroMapa');
  if (mp) {
    // przegląd 29.09: przebudowa gubiła zaznaczenie pada/klawiatury → drugi Enter/A odpalał GRAJ
    let m0 = null;
    try { if (gpSel && mp.contains(gpSel)) m0 = gpSel.dataset.m; } catch (_) {}   // gpSel w TDZ przy pierwszym renderze
    const wybor = menuStan() >= 1, strz = wybor && Object.keys(MAPS).filter(mapaOdbl).length > 1;
    const kr = wybor && kropkiMenu().includes('mapy') ? '<i class="wKropka"></i>' : '';
    const nazwa = `${mIk(M.ico)}<span class="k">${T('MAPA', 'MAP')}</span><b>${M.nm}</b>`;
    mp.innerHTML = (strz ? `<button class="wNav wStrz" data-m="-1" aria-label="‹">‹</button>` : '')
      + (wybor ? `<button class="wNav mNm" data-m="0" style="position:relative;background:none;border:0;font:inherit;color:inherit">${nazwa}${kr}<span class="wGl" data-mglif="mapa"></span></button>`
               : `<div class="mNm">${nazwa}</div>`)
      + (strz ? `<button class="wNav wStrz" data-m="1" aria-label="›">›</button>` : '');
    if (m0 != null) { const el = mp.querySelector(`[data-m="${m0}"]`); if (el) gpMark(el); }
    menuGlifyOdswiez();
  }
}
function renderStats() {
  const s = META.st;
  const dane = [
    ['czaszka', s.kills, T('Zabitych łącznie', 'Total kills')],
    ['play', s.runs, T('Rozegranych biegów', 'Runs played')],
    ['zegar', fmtTime(s.best), T('Najdłuższy bieg', 'Longest run')],
    ['puchar', s.bestKills, T('Rekord zabitych', 'Most kills in a run')],
    ['korona', s.wins || 0, T('Wygranych Wieczorów', 'Evenings won')],
    ['zegar', s.bestDon ? fmtTime(s.bestDon) : '—', T('Najszybszy Don', 'Fastest Don')],
    ['gwiazda', s.kaprale || 0, T('Pokonanych kaprali', 'Corporals beaten')],
    ['korona', s.bosses, T('Pokonanych bossów', 'Bosses beaten')],
    ['skrzynia', s.chests, T('Skrzyń z bronią', 'Weapon crates')],
    ['gwiazda', s.lvl, T('Zdobytych poziomów', 'Levels gained')],
    ['moneta', s.coins, T('Monet zebranych', 'Coins collected')],
    ['zegar', fmtTime(s.time), T('Łączny czas gry', 'Total play time')],
  ];
  document.getElementById('statsList').innerHTML = dane.map(([i, v, k]) =>
    `<div class="stat"><div class="v">${ico(i, 20)} ${v}</div><div class="k">${k}</div></div>`).join('');
}

// ---- BESTIARIUSZ: wpis o wrogu odblokowuje się po pierwszym jego zabiciu ----
function renderBestiary() {
  const wrap = document.getElementById('bestGrid');
  if (!wrap) return;
  wrap.innerHTML = '';
  const klucze = Object.keys(ENEMY_TYPES);
  let odkryte = 0;
  for (const key of klucze) {
    // `W` zamiast `T` — globalne `T(pl, en)` tłumaczy napisy i nie wolno go tu przesłonić
    const W = ENEMY_TYPES[key];
    const n = META.bestiary[key] || 0;
    const znany = n > 0;
    if (znany) odkryte++;
    const eTempo = T('TEMPO', 'SPEED'), eCios = T('CIOS', 'HIT');
    const staty = znany
      ? `HP ${W.hp * SKALA_WROGA} · ${eTempo} ${W.speed} · ${eCios} ${ico('serce', 12)} · XP ${W.xp}`
      : `HP ? · ${eTempo} ? · ${eCios} ? · XP ?`;
    const d = document.createElement('div');
    // .dark = zablokowany wpis: sylwetka na czarno (CSS brightness(0)) i „NIEODKRYTY"
    d.className = 'tile bst' + (znany ? '' : ' dark');
    const nieznany = T('NIEODKRYTY', 'UNDISCOVERED');
    d.innerHTML =
      `<div class="ico"><img class="pxi" src="${portret(W.char || key)}" style="height:70px"></div>
       <div class="nm">${znany ? W.nm : nieznany}</div>
       <div class="ds">${znany ? W.ds : '???'}</div>
       ${znany && W.lore ? `<div class="lore">${W.lore}</div>` : ''}
       <div class="bs">${staty}</div>
       <div class="pr">${ico('czaszka', 14)} ${n}</div>`;
    wrap.appendChild(d);
  }
  document.getElementById('bestProg').textContent = odkryte + '/' + klucze.length;
  renderSkladnikiAkta();
}
// AKTA: składniki Nonny — kupione z ikoną, niekupione jako kłódka (Spiżarnia Nonny w Sklepie)
function renderSkladnikiAkta() {
  const el = document.getElementById('aktaSkl');
  if (!el) return;
  const kl = Object.keys(PASSIVES);
  el.innerHTML = kl.map(k => { const S = PASSIVES[k], ma = sklOdbl(k);
    return `<div class="aSkl${ma ? '' : ' zamk'}" title="${ma ? S.nm : T('Spiżarnia Nonny (Sklep)', "Nonna's Pantry (Shop)")}">${ico(ma ? S.ico : 'klodka', 26)}<span>${ma ? S.nm : '???'}</span></div>`; }).join('');
  const p = document.getElementById('aktaSklProg');
  if (p) p.textContent = kl.filter(sklOdbl).length + '/' + kl.length;
}

function renderShop() {
  document.getElementById('shopCoins').innerHTML = ico('moneta', 16) + ' ' + META.coins;
  const wrap = document.getElementById('shopItems'); wrap.innerHTML = '';
  const deny = d => d.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 200 });
  for (const it of SHOP) {
    const lvl = META.up[it.key], maxed = lvl >= it.max;
    const d = document.createElement('div');
    d.className = 'tile' + (maxed ? ' lock' : '');
    d.innerHTML = `<div class="ico">${ico(it.ico, 40)}</div><div class="nm">${it.nm} ${lvl}/${it.max}</div>
      <div class="ds">${it.ds}</div><div class="pr">${maxed ? T('MAX', 'MAX') : ico('moneta', 15) + ' ' + shopPrice(it)}</div>`;
    if (!maxed) d.onclick = () => {
      const pr = shopPrice(it);
      if (META.coins < pr) return deny(d);
      META.coins -= pr; META.up[it.key]++; saveMeta(); renderShop();
    };
    wrap.appendChild(d);
  }
  for (const it of SHOP_UNLOCKS) {
    const owned = !!META.unlocked[it.key];
    const d = document.createElement('div');
    d.className = 'tile' + (owned ? ' lock' : '');
    d.innerHTML = `<div class="ico">${ico(it.ico, 40)}</div><div class="nm">${it.nm}</div>
      <div class="ds">${it.ds}</div><div class="pr">${owned ? T('MASZ', 'OWNED') : ico('moneta', 15) + ' ' + liczba(cenaOdbl(it))}</div>`;
    if (!owned) d.onclick = () => {
      const pr = cenaOdbl(it);
      if (META.coins < pr) return deny(d);
      META.coins -= pr; META.unlocked[it.key] = 1; saveMeta(); renderShop();
    };
    wrap.appendChild(d);
  }
  renderSpizarnia(deny);
  odswiezRog();                                    // menu A: monety w rogu nad otwartym Sklepem
}
// SPIŻARNIA NONNY: 5 składników do kupienia (cena wg liczby kupionych) + Większy słoik; tabliczka Nonny o wsparciu
function renderSpizarnia(deny) {
  const wrap = document.getElementById('spizItems');
  if (!wrap) return;
  wrap.innerHTML = '';
  const cena = cenaSpiz(), blokady = trudn().karty.sklBlokady;
  const licz = document.getElementById('spizLicz');
  if (licz) licz.textContent = `${SKL_STARTOWE.length + sklKupione()}/${Object.keys(PASSIVES).length}`;
  const kafel = (ikona, nm, ds, stopka, masz, onBuy) => {
    const d = document.createElement('div');
    d.className = 'tile spiz' + (masz ? ' lock' : '');
    d.innerHTML = `<div class="ico">${ico(ikona, 40)}${masz ? '' : `<i class="spizKl">${ico('klodka', 16)}</i>`}</div><div class="nm">${nm}</div>
      <div class="ds">${ds}</div><div class="pr">${stopka}</div>`;
    if (!masz) d.onclick = () => onBuy(d);
    wrap.appendChild(d);
  };
  for (const k of SPIZ_KOLEJNOSC) {
    const S = PASSIVES[k], masz = sklOdbl(k);
    const ds = T('Na poziom: ', 'Per level: ') + S.ef(1, 0);
    kafel(S.ico, S.nm, ds, masz ? T('W SPIŻARNI', 'IN THE PANTRY') : ico('moneta', 15) + ' ' + liczba(cena), masz, d => {
      const c = cenaSpiz();
      if (META.coins < c) return deny(d);
      META.coins -= c; META.unlocked[k] = 1; saveMeta();
      STATY.zdarzenie('spizarnia/' + k, 'Spiżarnia: ' + k);
      AUDIO.sfx('zlota');
      renderShop();
    });
  }
  const slMasz = !!META.unlocked.sloik || !blokady;
  kafel('sloik', T('Większy słoik', 'Bigger Jar'),
    T(`Składnik w biegu do poz. 5 (bez słoika: ${trudn().karty.sklMax})`, `Ingredients go up to lv. 5 in a run (without it: ${trudn().karty.sklMax})`),
    slMasz ? T('MASZ', 'OWNED') : ico('moneta', 15) + ' ' + liczba(CFG_SPIZ.sloik), slMasz, d => {
      if (META.coins < CFG_SPIZ.sloik) return deny(d);
      META.coins -= CFG_SPIZ.sloik; META.unlocked.sloik = 1; saveMeta();
      STATY.zdarzenie('spizarnia/sloik', 'Spiżarnia: słoik');
      AUDIO.sfx('zlota');
      renderShop();
    });
  renderTabliczkaNonny('nonnaSklep', true);
}
// TABLICZKA NONNY o wsparciu: w Sklepie (obok Spiżarni) i przy polu kodu w Ustawieniach.
// Kawa tylko web (B12, JEST_APKA) — w aplikacji zostaje sam tekst o farmieniu i przycisk kodu.
function renderTabliczkaNonny(id, zSklepu) {
  const el = document.getElementById(id);
  if (!el) return;
  const kawa = KAWA_URL && !JEST_APKA;
  el.innerHTML = `<div class="ntTekst">${mIk('postac')}<span>${kawa
      ? T('Za drogo? Wyfarm monety albo postaw kawę autorowi gry — napisz na buycoffee, a dostaniesz kod na monety.',
          "Too pricey? Farm the coins or buy the game's author a coffee — drop a note on buycoffee and you will get a coin code.")
      : T('Za drogo? Każdy bieg dokłada monet — Nonna czeka cierpliwie.', 'Too pricey? Every run adds coins — Nonna is patient.')}</span></div>`
    + `<div class="ntPrz">${kawa ? `<a class="btn2 ntKawa" href="${KAWA_URL}" target="_blank" rel="noopener">${T('POSTAW KAWĘ AUTOROWI GRY', "BUY THE GAME'S AUTHOR A COFFEE")}</a>` : ''}`
    + (zSklepu ? `<button class="btn2 ntKod">${T('MAM KOD', 'I HAVE A CODE')}</button>` : '') + '</div>';
  const k = el.querySelector('.ntKawa');
  if (k) k.onclick = () => STATY.zdarzenie('kawa/' + (zSklepu ? 'sklep' : 'kod'), 'Klik: kawa (' + (zSklepu ? 'sklep' : 'kod') + ')');
  const b = el.querySelector('.ntKod');
  if (b) b.onclick = () => {
    document.getElementById('wZebatka').click();
    requestAnimationFrame(() => {
      const box = document.getElementById('kodBox');
      if (box) box.scrollIntoView({ block: 'center' });
      const inp = document.getElementById('kodInput');
      if (inp && !(matchMedia('(pointer:coarse)').matches)) inp.focus();   // na dotyku bez klawiatury od razu
    });
  };
}

// ============================== MENU A „WARZYWNIAK" (E4 K11a + K11, 29.09) ==============================
// Decyzja właściciela 24.09: A „Warzywniak" + liścik Nonny z B (1. sesja) + mapa osiedla we mgle z C w panelu Map.
// Spec: dokumenty/badanie-gry/10-spec-E4.md §10 · DOM: #warzywniak (index.html) · wygląd: ui-warzywniak.css.
// Rzeczy z E4, których jeszcze nie ma (Zeszyt, Danie dnia, zlecenia, kalendarz, Pikantność, Paczka) mają w DOM
// miejsca-zaślepki: flaga w E4_GOTOWE = false → ukryte albo „wkrótce". Logiki tu NIE ma — dopiszą ją kroki K2–K8.
const E4_GOTOWE = { zeszyt: false, danie: false, zlecenia: false, kalendarz: false, pikant: false, paczka: false };
const MENU = { s: 1, pc: false, pierwszy: true, zapT: 0, mapaDom: false, mapaAnim: 0, mapaWym: '' };
const biegi = () => META.st.pelne || 0;   // przegląd 29.09: jak łagodny tryb — szybkie „Do menu" nie odsłania skrzynek
const odslUi = () => META.ui.odsl || (META.ui.odsl = {});   // META.ui kopiowane w loadMeta w całości — pole przeżywa przeładowanie
// stan odsłonięcia menu (§10.4): 0 = pierwsza sesja, 1 / 2 = po 1. / 2. biegu, 3 = pełny (od 3. biegu)
const menuStan = () => Math.min(3, biegi());
// ikona z icons.js BEZ stylu inline (rozmiar daje CSS w `--p`, `ico()` wpisuje sztywne px)
const mIk = (n) => `<img class="ikp" src="${iconObrys(n, 4, '#1b1b22', '#f2e3bf')}" alt="">`;   // 29.09: kontur + jasny obrys (siatka 12×12)
// skrzynka → od którego stanu stoi na ladzie
const SKRZ_OD = { postacie: 1, sklep: 1, akta: 2, ksiazka: 3, zeszyt: 99 };
const SKRZ_ODSL = { r1: ['postacie', 'sklep'], r2: ['akta'], r3: ['ksiazka'] };
// zapowiedzi odsłonięć — liścik Nonny, jedna linia, raz (META.ui.odsl)
const ZAPOWIEDZ = {
  r1: T('Masz monety! W sklepie czekają ulepszenia — i nowe bronie.', "You've got coins! Upgrades are waiting in the shop — and new weapons."),
  r2: T('Spisuję w aktach każdego chipsiarza, którego przegonisz. Zajrzyj czasem.', 'I keep a file on every chip-pusher you chase off. Take a look sometimes.'),
  r3: T('Twoje dania zapisuję w książce. Zajrzyj, co już ugotowałeś.', 'I write your dishes down in my cookbook. See what you have cooked so far.'),
};
// Mapa odsłonięta (bez mgły, do wyboru). Dziś: Łąki zawsze, reszta po 1. biegu (§10.4: „0 biegów: mapa bez wyboru").
// E4 K2 (Zeszyt) podmieni warunki na zadania: Wąwozy po 1. kapralu, Market po dotrwaniu do 5:00 (§11, decyzja 5).
// 29.09 (Piotr: „wszystkie plansze nie mogą być od razu aktywne"): mapa otwiera się po przeżyciu `do` s na poprzedniej.
// Stare zapisy bez bestMapa: rekord `best` liczy się jako Łąki (weteran ma od razu Wąwozy, Market musi zdobyć).
// 30.09: Łąki → Osiedle → Wąwozy → Market; stare zapisy z otwartymi Wąwozami — migracja przy META (`st.mapyOtw`).
// 01.10 Piotr: „odblokowywanie 2 pierwszych plansz po 3,5 minuty na poprzedniej zamiast 5" — Osiedle i Wąwozy 210 s, Market dalej 5:00
const MAPA_WARUNEK = { osiedle: { po: 'laki', do: 210 }, wawozy: { po: 'osiedle', do: 210 }, market: { po: 'wawozy', do: 300 } };
const bestNaMapie = k => { const b = META.st.bestMapa || {}; return b[k] != null ? b[k] : (k === 'laki' ? META.st.best || 0 : 0); };
function mapaOdbl(key) {
  if (DEV && /[?&]mapy=1/.test(location.search)) return true;
  if (META.st.mapyOtw && META.st.mapyOtw[key]) return true;   // migracja 30.09 (patrz przy META)
  const w = MAPA_WARUNEK[key];
  return !w || bestNaMapie(w.po) >= w.do;
}
const mapaWarunekTxt = k => { const w = MAPA_WARUNEK[k]; if (!w) return '';
  return T(`Przetrwaj ${fmtTime(w.do)} na mapie ${MAPS[w.po].nm}, a mgła zejdzie.`, `Survive ${fmtTime(w.do)} on ${MAPS[w.po].nm} and the fog lifts.`); };
const odkryteBest = () => Object.keys(ENEMY_TYPES).filter(k => (META.bestiary[k] || 0) > 0).length;
const liczba = n => (+n || 0).toLocaleString(JEZYK.cur === 'en' ? 'en-US' : 'pl-PL');

// SKALA: jeden mnożnik --s = min(szer/812, wys/375) (CSS nie podzieli długości przez długość)
function menuSkala() {
  const w = document.getElementById('warzywniak');
  if (!w) return;
  const W = w.clientWidth || innerWidth, H = w.clientHeight || innerHeight;
  // PC (29.09, uwaga właściciela „menu na PC za duże"): mysz + ≥ 1024×560 → skala 1,0 (do 1,2 dopiero od 2304×1296)
  // i osobny układ `w-pcx` (scena ≤ 1320 px wyśrodkowana, postać/tablica z sufitem wysokości). Telefon i tablet
  // (dotyk) jak dawniej: s = min(szer/812, wys/375).
  const mysz = !matchMedia || matchMedia('(pointer: fine)').matches || !matchMedia('(pointer: coarse)').matches;
  const pcx = mysz && W >= 1024 && H >= 560;
  const s = pcx ? Math.min(1.2, Math.max(1, Math.min(W / 1920, H / 1080))) : Math.max(0.5, Math.min(W / 812, H / 375));
  MENU.s = s; MENU.pc = pcx || s >= 1.3; MENU.pcx = pcx;
  w.style.setProperty('--s', s.toFixed(4));
  w.style.setProperty('--tx', String(Math.max(2, Math.round(2 * s))));
  // PC: poziomy margines sceny (px ekranu), żeby na 1920 elementy nie uciekały w rogi
  w.style.setProperty('--bx', (pcx ? Math.max(0, Math.round((W - 1320 * s) / 2)) : 0) + 'px');
  // IKONY (8×8 + kontur + jasny obrys = siatka 12×12, `mIk`): rozmiar CSS = całkowita wielokrotność siatki w pikselach
  // URZĄDZENIA (pixelated bez rozmycia i bez nierównych pikseli). --ikN = ikona projektowana na N px makiety.
  const dpr = devicePixelRatio || 1;
  for (const n of [24, 36, 48]) w.style.setProperty('--ik' + n, (Math.max(1, Math.round(n * s * dpr / 12)) * 12 / dpr) + 'px');
  w.classList.toggle('w-pc', MENU.pc);
  w.classList.toggle('w-pcx', pcx);
  if (document.getElementById('startOv').classList.contains('panel-mapy')) mapaRysuj(1);
}

// NAJBLIŻSZY CEL (kartka na tablicy) — z tego, co gra już ma; Zeszyt Nonny (K2) przejmie tę kartkę
function celNajblizszy() {
  const s = META.st, nagr = t => T('nagroda: ', 'reward: ') + t;
  for (const k of Object.keys(CHARS)) {
    const C = CHARS[k];
    if (C.killGoal && !maszPostac(k))
      return { t: T(`Pokonaj ${C.killGoal} chipsiarzy`, `Defeat ${C.killGoal} chip-pushers`), n: s.kills, z: C.killGoal, nagr: nagr(C.nm.split(' ')[0]) };
  }
  const kup = Object.keys(CHARS).filter(k => !maszPostac(k) && CHARS[k].price > 0).sort((a, b) => CHARS[a].price - CHARS[b].price)[0];
  if (kup) return { t: META.coins >= CHARS[kup].price ? T('Stać Cię na nową postać — zajrzyj do Postaci!', 'You can afford a new hero — check Heroes!')
    : T('Uzbieraj monety na postać', 'Save up coins for a hero'), n: META.coins, z: CHARS[kup].price, nagr: nagr(CHARS[kup].nm.split(' ')[0]) };
  if (!s.wins) return { t: T('Przetrwaj Wieczór i pokonaj Dona', 'Survive the Evening and beat the Don'),
    n: Math.min(s.best || 0, CZAS_WIECZORU), z: CZAS_WIECZORU, czas: true, nagr: nagr(T('monety ×1,5', 'coins ×1.5')) };
  const it = SHOP_UNLOCKS.filter(i => !META.unlocked[i.key]).sort((a, b) => cenaOdbl(a) - cenaOdbl(b))[0];
  if (it) return { t: T('Kup w sklepie: ', 'Buy in the shop: ') + it.nm, n: META.coins, z: cenaOdbl(it),
                   nagr: nagr(jestBronia(it) ? T('nowa broń', 'a new weapon') : T('nowa zdolność', 'a new ability')) };
  const sk = SPIZ_KOLEJNOSC.find(k => !sklOdbl(k));
  if (sk) return { t: T('Spiżarnia Nonny: ', "Nonna's Pantry: ") + PASSIVES[sk].nm, n: META.coins, z: cenaSpiz(), nagr: nagr(T('nowy składnik', 'a new ingredient')) };
  return { t: T('Wygraj kolejny Wieczór', 'Win another Evening'), n: s.wins, z: s.wins + 1, nagr: nagr(T('chwała Nonny', "Nonna's glory")) };
}

// KROPKI „nowe" (§10.7): tylko gdy czeka akcja, najwyżej 2, w kolejności priorytetu. Gasną po wejściu do panelu
// (zapamiętujemy monety / liczbę wpisów z chwili wejścia — kropka wraca dopiero, gdy przybyło).
function kropkiMenu() {
  const st = menuStan(), c = META.coins, u = META.ui, out = [];
  if (st >= 1) {
    const ceny = SHOP.filter(it => META.up[it.key] < it.max).map(shopPrice)
      .concat(SHOP_UNLOCKS.filter(it => !META.unlocked[it.key]).map(cenaOdbl))
      .concat(SPIZ_KOLEJNOSC.some(k => !sklOdbl(k)) ? [cenaSpiz()] : [], META.unlocked.sloik || !trudn().karty.sklBlokady ? [] : [CFG_SPIZ.sloik]);
    if (ceny.length && c >= Math.min(...ceny) && c > (u.krSklep ?? -1)) out.push('sklep');
    if (Object.keys(CHARS).some(k => !maszPostac(k) && CHARS[k].price > 0 && c >= CHARS[k].price) && c > (u.krPost ?? -1)) out.push('postacie');
    if (Object.keys(MAPS).some(k => mapaOdbl(k) && !(u.mapyWidz || {})[k])) out.push('mapy');
  }
  if (st >= 3 && u.ksiazkaNowe) out.push('ksiazka');
  if (st >= 2 && odkryteBest() > (u.krAkta ?? 0)) out.push('akta');
  return out.slice(0, 2);
}

function odswiezRog() {
  const m = document.getElementById('wMonety');
  if (m) m.innerHTML = mIk('moneta') + ' ' + liczba(META.coins);
  const z = document.querySelector('#wZebatka i');
  if (z && !z.firstChild) z.innerHTML = mIk('zebatka');
}

// TABLICA „DZIŚ U NONNY" (§10.5) albo liścik Nonny w pierwszej sesji (z makiety B)
function renderTablica(st) {
  const t = document.getElementById('tablica');
  if (!t) return;
  if (st === 0) {
    t.className = 'tLisc';
    t.innerHTML = '<i class="tTasma"></i>' + T('Kochanie, najpierw przegoń tych chipsiarzy z osiedla. Obiad będzie potem.',
      'Darling, first chase those chip-pushers off the block. Dinner comes after.') + '<div class="tPod">— Nonna</div>';
    return;
  }
  t.className = '';
  const s = META.st, cel = celNajblizszy();
  const pr = Math.max(0, Math.min(100, cel.n / Math.max(1, cel.z) * 100));
  const nz = cel.czas ? `${fmtTime(cel.n)}/${fmtTime(cel.z)}` : `${liczba(Math.min(cel.n, cel.z))}/${liczba(cel.z)}`;
  const rek = [['zegar', T('Najdłuższy', 'Longest'), fmtTime(Math.min(s.best || 0, CZAS_WIECZORU))],
               ['czaszka', T('Rekord', 'Best'), liczba(s.bestKills || 0)],
               ['korona', T('Wygrane', 'Wins'), s.wins || 0]];
  t.innerHTML = `<div class="tNag"><span>${T('DZIŚ U NONNY', "TODAY AT NONNA'S")}</span><small>${T('bieg nr', 'run no.')} ${liczba(s.runs + 1)}</small></div>`
    // Danie dnia = E4 K7; do tego czasu miejsce „wkrótce" (bez przycisku, poza nawigacją pada)
    + (st >= 3 && !E4_GOTOWE.danie ? `<div class="tDanie"><img src="assets/garnek_nonny.png" alt=""><div><b>${T('DANIE DNIA', 'DISH OF THE DAY')}</b>`
        + `<span>${T('Nonna jeszcze gotuje', 'Nonna is still cooking')}</span></div><span class="tWkr">${T('WKRÓTCE', 'SOON')}</span></div>` : '')
    // rekordy w miejscu 3 zleceń (zlecenia = E4 K8)
    + `<div class="tRek">${rek.map(([i, k, v]) => `<div>${mIk(i)}<span>${k}</span><b>${v}</b></div>`).join('')}</div>`
    + `<div class="tCel w-papier"><div class="k"><span>${T('NAJBLIŻSZY CEL', 'NEXT GOAL')}</span><em>${cel.nagr}</em></div>`
    + `<div class="t"><span>${cel.t}</span><b>${nz}</b></div><div class="wPasek"><i style="width:${pr.toFixed(1)}%"></i></div></div>`;
}

// CAŁE MENU: stan odsłonięcia, skrzynki, kropki, róg, tablica, postać i mapa. `odslon` = odpal animacje odsłonięć.
function renderMenu(o = {}) {
  const w = document.getElementById('warzywniak');
  if (!w) return;
  const st = menuStan();
  w.classList.remove('w-r0', 'w-r1', 'w-r2', 'w-r3'); w.classList.add('w-r' + st);
  w.classList.toggle('w-strzP', st >= 2 && Object.keys(CHARS).filter(maszPostac).length >= 2);
  const kr = kropkiMenu();
  for (const t of document.querySelectorAll('#tabs .tab.skr')) {
    const k = t.dataset.tab;
    if (!t.querySelector('img') && t.dataset.ik) t.insertAdjacentHTML('afterbegin', mIk(t.dataset.ik));
    t.classList.toggle('jest', st >= (SKRZ_OD[k] ?? 99) && (k !== 'zeszyt' || E4_GOTOWE.zeszyt));
    const k0 = t.querySelector('.wKropka');
    if (kr.includes(k) && !k0) t.insertAdjacentHTML('beforeend', '<i class="wKropka"></i>');
    else if (!kr.includes(k) && k0) k0.remove();
  }
  odswiezRog(); renderTablica(st); renderPick();
  if (o.odslon) menuOdslon();
}

// ODSŁONIĘCIA (§10.4): skrzynka spada na ladę + liścik z zapowiedzią, raz na klucz (META.ui.odsl).
function menuOdslon() {
  const o = odslUi(), r = biegi();
  const nowe = ['r1', 'r2', 'r3'].filter(k => r >= +k[1] && !o[k]);
  const pierwszy = MENU.pierwszy; MENU.pierwszy = false;
  if (!nowe.length) return;
  nowe.forEach(k => { o[k] = 1; });
  saveMeta();
  // stary zapis (≥ 3 biegi, żadnego odsłonięcia w zapisie) = od razu stan pełny, bez animacji
  if (pierwszy && r >= 3 && nowe.length === 3) {   // przegląd 29.09: stary zapis zna już mapy — bez „mgła schodzi"
    META.ui.mapyWidz = Object.fromEntries(Object.keys(MAPS).filter(mapaOdbl).map(k => [k, 1])); saveMeta(); return;   // tylko OTWARTE (przegląd 30.09)
  }
  for (const k of nowe) STATY.zdarzenie('menu/odsl/' + k, 'Menu: odsłonięcie ' + k);
  let i = 0;
  for (const k of nowe) for (const tab of SKRZ_ODSL[k]) {
    const el = document.querySelector(`#tabs .tab.skr.jest[data-tab="${tab}"]`);
    if (!el) continue;
    el.classList.remove('spada'); void el.offsetWidth;
    el.style.animationDelay = (0.2 + 0.14 * i++) + 's';
    el.classList.add('spada');
  }
  pokazZapowiedz(ZAPOWIEDZ[nowe[nowe.length - 1]], 0.35 + 0.14 * i);
}
function pokazZapowiedz(txt, opozn = 0) {
  const z = document.getElementById('wZapowiedz');
  if (!z || !txt) return;
  z.innerHTML = `<i class="tTasma"></i>${txt}<div class="tPod">— Nonna</div>`;
  z.style.animationDelay = opozn + 's';
  z.hidden = false;
  clearTimeout(MENU.zapT);
  MENU.zapT = setTimeout(() => { z.hidden = true; }, 6000 + opozn * 1000);
}

// ZMIANA POSTACI (strzałki szyldu, Q/E, LB/RB) i MAPY (strzałki tabliczki, M) — 1 klik zamiast 3
function menuPostac(dir) {
  const w = document.getElementById('warzywniak');
  if (!w || !w.classList.contains('w-strzP')) return;
  const lista = Object.keys(CHARS).filter(maszPostac);
  if (lista.length < 2) return;
  const key = lista[(lista.indexOf(charKey) + dir + lista.length) % lista.length];
  charKey = key; META.lastChar = key; saveMeta();
  setPlayerChar(key);
  renderChars(); renderPick();
}
function menuMapa(dir, key) {
  if (menuStan() < 1) return;
  const lista = Object.keys(MAPS).filter(mapaOdbl);
  if (!key) { if (lista.length < 2) return; key = lista[(lista.indexOf(mapKey) + dir + lista.length) % lista.length]; }
  if (!mapaOdbl(key) || key === mapKey) return;
  setMap(key); META.lastMap = key; saveMeta();
  renderPick();
  if (document.getElementById('startOv').classList.contains('panel-mapy')) mapaAktualizuj();
}

// GLIFY PRZY ELEMENTACH MENU (klawiatura: litera klawisza, pad: przycisk, dotyk: nic) — system glifów v208
function menuGlifyOdswiez() {
  const tryb = WEJ.tryb, strzP = document.getElementById('warzywniak')?.classList.contains('w-strzP');
  const GL = {
    graj: () => tryb === 'pad' ? padKapsel(0) : tryb === 'klaw' ? glKl('ENTER') : '',
    mapaGraj: () => tryb === 'pad' ? padKapsel(0) : tryb === 'klaw' ? glKl('ENTER') : '',
    postL: () => !strzP ? '' : tryb === 'pad' ? padKapsel(4) : tryb === 'klaw' ? glKl('Q') : '',
    postP: () => !strzP ? '' : tryb === 'pad' ? padKapsel(5) : tryb === 'klaw' ? glKl('E') : '',
    mapa: () => tryb === 'klaw' && Object.keys(MAPS).filter(mapaOdbl).length > 1 ? glKl('M') : '',
  };
  document.querySelectorAll('[data-mglif]').forEach(el => { el.innerHTML = (GL[el.dataset.mglif] || (() => ''))(); });
}

// PANEL OTWARTY (handler zakładek `.tab[data-tab]`): rendery, klasy układu, kropki gasną, pad skacze do panelu
function menuPanelOtwarty(tab, zak) {
  const ov = document.getElementById('startOv'), u = META.ui;
  const otwarty = tab !== 'graj';
  ov.classList.toggle('panel-open', otwarty);
  ov.classList.toggle('panel-mapy', tab === 'mapy');
  document.body.classList.toggle('w-panel', otwarty);
  if (tab === 'sklep') { renderShop(); u.krSklep = META.coins; saveMetaSoon(); }
  if (tab === 'postacie') { renderChars(); u.krPost = META.coins; saveMetaSoon(); }
  if (tab === 'akta') { renderBestiary(); renderStats(); u.krAkta = odkryteBest(); saveMetaSoon(); }
  if (tab === 'ksiazka') renderKsiazkaMenu();
  if (tab === 'ustawienia') renderSterowanie();
  if (tab === 'mapy') mapaOtworz();
  const pn = document.getElementById('panele'); if (pn && otwarty) pn.scrollTop = 0;
  const skad = MENU.zamkniety;                    // skrzynka / zębatka, z której wszedł gracz (tam wraca zaznaczenie)
  if (!otwarty) { renderMenu(); MENU.zamkniety = null; }
  else if (zak) MENU.zamkniety = zak;
  // pad/klawiatura: zaznaczenie na pierwszy element panelu; po zamknięciu wraca na skrzynkę, z której weszliśmy
  if (gpSel || WEJ.tryb === 'pad') {
    requestAnimationFrame(() => {
      if (otwarty) {
        const p = document.getElementById('p-' + tab);
        const cel = tab === 'mapy' ? document.querySelector('#mapGrid .mWezel.sel') || document.getElementById('mapaGraj')
          : (p && [...p.querySelectorAll('.tile,.btn2,input[type=range],.kafel')].find(e => e.offsetWidth)) || document.getElementById('panelBack');
        gpMark(cel);
      } else {
        const wr = skad && skad.offsetWidth ? skad : document.getElementById('btnStart');
        gpMark(wr);
      }
    });
  }
}
// Książka w menu: sama „CAŁA KSIĄŻKA" (część „Twoje dania" zależy od bronie bieżącego biegu — zostaje w pauzie)
function renderKsiazkaMenu() {
  const el = document.getElementById('menuKsiazka');
  if (!el) return;
  el.innerHTML = ksiazkaHTML();
  el.querySelector('.kDania')?.remove();
  for (const k of el.querySelectorAll('.kafel')) k.onclick = () => szczegolKafla(k.dataset.ek, k.dataset.bron);
  if (META.ui.ksiazkaNowe) { META.ui.ksiazkaNowe = false; saveMetaSoon(); }
}

// ---------------- PANEL MAP: MAPA OSIEDLA WE MGLE (kod z makiety C, bez nowych grafik) ----------------
// Węzły we współrzędnych względnych 0..1 (przy innych proporcjach ekranu rozsuwają się same).
const MAPA_WEZLY = {
  laki: { x: .40, y: .44 }, stragan: { x: .53, y: .66 }, wawozy: { x: .70, y: .36 }, market: { x: .83, y: .60 }, willa: { x: .92, y: .34 },
  osiedle: { x: .21, y: .70 },                     // 30.09: bloki w lewym dolnym rogu, ścieżka od Warzywniaka
};
// PODMIANA NA GRAFIKI (przyjdą później, np. assets/ui/mapa_tlo.png): wpisz ścieżkę, a zamiast proceduralnego
// canvasu / budynku z CSS pojawi się obrazek (pixelated). Mgła zostaje osobną warstwą canvasu nad nim.
// tlo = cała mapa (dowolna rozdzielczość, rozciągana object-fit:cover); budynki = obrazek stojący stopami na węźle.
const MAPA_GRAF = { tlo: '', stragan: '', market: '', willa: '', osiedle: '' };
// OSIEDLE na mapie menu: dwa bloki z pasami okien, inline (bez zmian w CSS — nie ruszamy ?v= arkuszy)
const MAPA_OSIEDLE_HTML = (() => {
  const blok = (l, w, h, kol) => `<i style="position:absolute;display:block;left:calc(var(--p)*${l});bottom:0;width:calc(var(--p)*${w});height:calc(var(--p)*${h});`
    + `background:${kol} repeating-linear-gradient(180deg,transparent 0 calc(var(--p)*5),#44505e calc(var(--p)*5) calc(var(--p)*8));`
    + `box-shadow:0 0 0 calc(var(--p)*2) var(--kontur),inset 0 calc(var(--p)*-8) 0 rgba(0,0,0,.18)"></i>`;
  return `<div style="position:relative;width:calc(var(--p)*84);height:calc(var(--p)*56)">${blok(0, 30, 54, '#d9d2c3')}${blok(38, 46, 34, '#c9ccd1')}</div>`;
})();
const MAPA_DEKO = [['oak1', .31, .30, 44], ['oak2', .35, .62, 40], ['bush1', .45, .30, 26], ['kwiat1', .37, .52, 12], ['kwiat2', .44, .55, 12],
  ['kwiat1', .33, .46, 12], ['oak3', .60, .86, 44], ['rock1', .64, .22, 30], ['rock1', .77, .40, 24], ['oak1', .97, .88, 48], ['bush1', .90, .44, 24],
  ['scarecrow', .47, .42, 30]];
const MAPA_PROM = { laki: .16, stragan: .09, wawozy: .15, market: .13, osiedle: .13 };   // promień odsłonięcia (× szerokość mapy w pikselach mapy)
const MAPA_NOWA = {
  osiedle: T('Osiedle otwarte! Horda wlewa się przejściami między blokami.', 'The Block is open! The horde pours through the gaps between the blocks.'),
  wawozy: T('Wąwozy otwarte! Uważaj na rzekę.', 'The Ravines are open! Mind the river.'),
  market: T('Market otwarty! Regały lubią spadać.', 'The Supermarket is open! Shelves like to fall.'),
};
function mapaRng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function mapaSzum(w, h, r, skala) {          // wygładzony szum wartości (łaty trawy, krawędź mgły)
  const gw = Math.ceil(w / skala) + 2, gh = Math.ceil(h / skala) + 2, g = [];
  for (let i = 0; i < gw * gh; i++) g.push(r());
  return (x, y) => { const fx = x / skala, fy = y / skala, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    const s = t => t * t * (3 - 2 * t), a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
    return (a + (b - a) * s(tx)) * (1 - s(ty)) + (c + (d - c) * s(tx)) * s(ty); };
}
// canvas w niskiej rozdzielczości: 1 piksel mapy = round(4·s) px ekranu, powiększany `pixelated` (ta sama skala co sprite)
function mapaRozmiar() {
  const box = document.getElementById('mapGrid');
  const W = box.clientWidth || innerWidth, H = box.clientHeight || innerHeight, s = MENU.s, P = Math.max(4, Math.round(4 * s));
  return { W, H, P, w: Math.ceil(W / P), h: Math.ceil(H / P) };
}
function mapaTeren(cv) {
  const { w, h } = mapaRozmiar(); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), r = mapaRng(7), n1 = mapaSzum(w, h, r, 9), n2 = mapaSzum(w, h, r, 3.5), N = MAPA_WEZLY;
  const img = g.createImageData(w, h);
  const px = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255; };
  const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const C = { t1: hex('#7cc242'), t2: hex('#6bb03a'), t3: hex('#8fd354'), t4: hex('#5e9e33'), rz: hex('#4f9ed8'), rzj: hex('#a8d8f5'), rzc: hex('#3d7fb3'),
    dr: hex('#e0c890'), drc: hex('#b89a62'), sk: hex('#c49a60'), skc: hex('#8b5a2b'), skj: hex('#dcb57a'), as: hex('#9aa0a8'), asj: hex('#c3c8cf'),
    kw1: hex('#ff8ad8'), kw2: hex('#ffe89a'), most: hex('#8b5a2b'), mostj: hex('#b07a3f') };
  // 1) trawa: dwie skale szumu → łaty jasne/ciemne
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = n1(x, y), b = n2(x, y); let c = C.t1;
    if (a > .62) c = C.t3; else if (a < .32) c = C.t2; if (a < .22) c = C.t4;
    if (b > .78 && r() < .5) c = a > .5 ? C.t1 : C.t3;
    px(x, y, c);
  }
  const X = v => Math.round(v * w), Y = v => Math.round(v * h);
  // 2) wąwóz: tarasy wokół Wąwozów
  const wx = X(N.wawozy.x), wy = Y(N.wawozy.y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - wx) / (w * .13), dy = (y - wy + h * .02) / (h * .24), d = dx * dx + dy * dy + (n2(x, y) - .5) * .25;
    if (d < 1) px(x, y, d > .82 ? C.skc : d > .55 ? C.sk : d > .5 ? C.skc : C.skj);
  }
  // 3) rzeka i 4) ścieżki + most
  const linia = (pts, rad, fn) => { for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const k = Math.ceil(Math.hypot((bx - ax) * w, (by - ay) * h)); for (let t = 0; t <= k; t++) { const cx = (ax + (bx - ax) * t / k) * w, cy = (ay + (by - ay) * t / k) * h;
      for (let oy = -rad - 1; oy <= rad + 1; oy++) for (let ox = -rad - 1; ox <= rad + 1; ox++) fn(Math.round(cx + ox), Math.round(cy + oy), Math.hypot(ox, oy), rad); } } };
  linia([[.66, -.05], [.69, .18], [.70, .32], [.64, .48], [.66, .62], [.74, .80], [.78, 1.05]], Math.max(2, Math.round(w / 90)),
    (x, y, d, rad) => { if (d <= rad) px(x, y, d > rad - 1 ? C.rzc : ((x * 7 + y * 3) % 11 === 0 ? C.rzj : C.rz)); });
  const rd = Math.max(1, Math.round(w / 170));
  // 30.09: OSIEDLE — płyty chodnika i asfalt pod blokami (rysowane przed ścieżkami, żeby ścieżka wchodziła na plac)
  { const ox = X(N.osiedle.x), oy = Y(N.osiedle.y), rw = Math.round(w * .085), rh = Math.round(h * .09);
    for (let y = oy - rh; y <= oy + Math.round(rh * .45); y++) for (let x = ox - rw; x <= ox + rw; x++)
      px(x, y, (y === oy + Math.round(rh * .45) || x === ox - rw || x === ox + rw) ? C.drc : ((x + y) % 7 === 0 ? C.asj : C.as)); }
  for (const d of [[[N.stragan.x, N.stragan.y], [.40, .74], [N.osiedle.x + .03, N.osiedle.y + .03]],
    [[N.stragan.x, N.stragan.y], [N.laki.x, N.laki.y + .02]], [[N.stragan.x, N.stragan.y], [.62, .58], [.72, .60], [N.market.x, N.market.y]],
    [[N.stragan.x, N.stragan.y], [.58, .44], [.64, .40], [N.wawozy.x, N.wawozy.y + .06]], [[N.wawozy.x, N.wawozy.y], [.82, .22], [N.willa.x, N.willa.y]]])
    linia(d, rd, (x, y, dd, rad) => { if (dd <= rad + .6) px(x, y, dd > rad - .4 ? C.drc : C.dr); });
  const mx = X(.645), my = Y(.585);
  for (let y = my - 2; y <= my + 2; y++) for (let x = mx - 5; x <= mx + 5; x++) px(x, y, (x % 2) ? C.most : C.mostj);
  // 5) parking marketu i łąka z kwiatami
  const kx = X(N.market.x), ky = Y(N.market.y);
  for (let y = ky - 3; y <= ky + Math.round(h * .08); y++) for (let x = kx - Math.round(w * .07); x <= kx + Math.round(w * .07); x++) px(x, y, (x % 6 === 0 && y > ky) ? C.asj : C.as);
  const lx = X(N.laki.x), ly = Y(N.laki.y);
  for (let i = 0; i < w * h * .004; i++) { const x = lx + Math.round((r() - .5) * w * .18), y = ly + Math.round((r() - .5) * h * .3); px(x, y, r() < .5 ? C.kw1 : C.kw2); }
  g.putImageData(img, 0, 0);
}
// MGŁA: osobna warstwa; `rosn` = mapy właśnie odsłonięte (promień rośnie od 0), `k` = postęp animacji 0..1
function mapaMgla(cv, rosn = [], k = 1) {
  const { w, h } = mapaRozmiar(); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), n2 = mapaSzum(w, h, mapaRng(11), 3.5), N = MAPA_WEZLY;
  const mg = [238, 243, 247], mgc = [207, 217, 227];
  const odsl = ['laki', 'stragan', 'osiedle', 'wawozy', 'market'].filter(k2 => k2 === 'stragan' || mapaOdbl(k2))
    .map(k2 => [N[k2].x * w, N[k2].y * h, w * MAPA_PROM[k2] * (rosn.includes(k2) ? k : 1)]);
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 9;
    for (const [cx, cy, rr] of odsl) if (rr > 0.5) m = Math.min(m, Math.hypot(x - cx, (y - cy) * 1.4) / rr);
    m += (n2(x, y) - .5) * .45;
    if (m > 1) { const c = m > 1.18 ? mg : mgc, i = (y * w + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
}
// `teren` = 1: przerysuj też tło (zmiana rozmiaru); rysujemy tylko przy otwarciu i resize (~5 ms), bez pętli
function mapaRysuj(teren = 0, rosn, k) {
  const box = document.getElementById('mapGrid');
  if (!box || !MENU.mapaDom) return;
  const wym = box.clientWidth + 'x' + box.clientHeight + '@' + MENU.s.toFixed(3);
  const tlo = box.querySelector('canvas.mTlo');
  if (tlo && (teren || MENU.mapaWym !== wym)) mapaTeren(tlo);
  MENU.mapaWym = wym;
  mapaMgla(box.querySelector('canvas.mMgla'), rosn, k);
}
const pct = v => (v * 100).toFixed(2) + '%';
function mapaZbuduj() {
  const box = document.getElementById('mapGrid'), N = MAPA_WEZLY;
  let h = MAPA_GRAF.tlo ? `<img class="mTlo" src="${MAPA_GRAF.tlo}" alt="">` : '<canvas class="mTlo"></canvas>';
  h += MAPA_DEKO.map(([f, x, y, wd]) => `<div class="mW" style="left:${pct(x)};top:${pct(y)}"><img src="assets/${f}.png" alt="" style="width:calc(var(--p)*${wd})"></div>`).join('');
  const bud = (k, css) => `<div class="mW" style="left:${pct(N[k].x)};top:${pct(N[k].y)}">${MAPA_GRAF[k] ? `<img src="${MAPA_GRAF[k]}" alt="" style="width:calc(var(--p)*80)">` : css}</div>`;
  h += bud('stragan', '<div class="mStragan"><div class="mk"></div><div class="ld"><i style="background:#ff7a1f"></i><i style="background:#9adf58"></i><i style="background:#e2404a"></i></div></div>');
  h += bud('market', '<div class="mMarket"></div>') + bud('willa', '<div class="mWilla"></div>') + bud('osiedle', MAPA_OSIEDLE_HTML);
  h += '<canvas class="mMgla"></canvas>';
  // węzły: mapy gry + Warzywniak (= powrót) + Willa Dona (zawsze we mgle, zapowiedź aktów 2–3)
  const wezel = (k, nm) => `<button class="wNav mWezel" data-w="${k}" style="left:${pct(N[k].x)};top:calc(${pct(N[k].y)} + var(--p)*4)"><span class="mSz">${nm}</span></button>`;
  h += wezel('laki', '') + wezel('osiedle', '') + wezel('wawozy', '') + wezel('market', '') + wezel('stragan', T('WARZYWNIAK', 'VEG STAND')) + wezel('willa', '???');
  h += '<div class="mGracz"><i class="cien"></i><span class="spr"></span></div>';
  h += '<div class="mInfo"></div>';
  h += `<button class="bigbtn" id="mapaGraj"><span></span><span class="wGl" data-mglif="mapaGraj"></span></button>`;
  box.innerHTML = h;
  box.onclick = e => {
    const b = e.target.closest('.mWezel');
    if (b) return mapaWezel(b.dataset.w);
  };
  document.getElementById('mapaGraj').onclick = () => document.getElementById('btnStart').click();
  MENU.mapaDom = true;
}
function mapaDymek(k, txt) {
  const box = document.getElementById('mapGrid'), N = MAPA_WEZLY[k];
  const d = document.createElement('div');
  d.className = 'mDymek';
  // dymek po stronie z miejscem: węzły z prawej połowy mają go po lewej
  d.style.cssText = N.x > .6 ? `right:calc(${pct(1 - N.x)} + var(--p)*30);top:calc(${pct(N.y)} - var(--p)*84)` : `left:calc(${pct(N.x)} + var(--p)*30);top:calc(${pct(N.y)} - var(--p)*90)`;
  d.textContent = txt;
  box.appendChild(d);
  setTimeout(() => d.remove(), 4500);
}
function mapaWezel(k) {
  if (k === 'stragan') return document.getElementById('panelBack').click();          // Warzywniak = powrót do lady
  if (k === 'willa') return mapaDymek('willa', T('Willa Dona. Wejście — wkrótce.', "Don's villa. Entry — coming soon."));
  if (!mapaOdbl(k)) return mapaDymek(k, mapaWarunekTxt(k));
  menuMapa(0, k);
}
// sprite postaci z atlasu (idle, kierunek „south"), ostry, animowany CSS-em po klatkach arkusza
function mapaSprite(el, h) {
  const nm = CHARS[charKey].char, L = LIB[nm], D = SPRITEDATA[nm];
  const a = D && (D.anims.idle || D.anims.walk || D.anims.run);
  if (!L || !L.img || !a) { el.className = 'spr'; el.style.cssText = `width:${h}px;height:${h}px;background:url(${portret(nm, 96)}) center/contain no-repeat`; return; }
  const row = a.rows.south ?? 0, n = a.frames.south || 1, k = h / D.size, iw = L.img.naturalWidth || L.img.width;
  el.className = 'spr' + (n > 1 ? ' anim' : '');
  el.style.cssText = `width:${h}px;height:${h}px;background-image:url(${L.img.src});background-size:${iw * k}px auto;`
    + `background-position:0 ${-row * h}px;--kx:${-n * h}px;--sn:${n};--sd:${(n / (a.fps || 6)).toFixed(2)}s;margin-bottom:${-(L.footOff || 0) * k}px`;
}
function mapaAktualizuj() {
  const box = document.getElementById('mapGrid'), N = MAPA_WEZLY, M = MAPS[mapKey];
  for (const b of box.querySelectorAll('.mWezel')) {
    const k = b.dataset.w, gra = !!MAPS[k];
    b.classList.toggle('sel', k === mapKey);
    b.classList.toggle('zamk', k === 'willa' || (gra && !mapaOdbl(k)));
    if (gra) b.querySelector('.mSz').textContent = mapaOdbl(k) ? MAPS[k].nm.toUpperCase() : '???';
  }
  const gr = box.querySelector('.mGracz');
  gr.style.left = pct(N[mapKey].x); gr.style.top = `calc(${pct(N[mapKey].y)} + var(--p)*2)`;
  mapaSprite(gr.querySelector('.spr'), Math.round(96 * MENU.s));
  box.querySelector('.mInfo').innerHTML = `<b>${M.nm}</b><span>${M.ds}</span>`;
  document.querySelector('#mapaGraj span').textContent = T('GRAJ: ', 'PLAY: ') + M.nm.toUpperCase();
  menuGlifyOdswiez();
}
function mapaOtworz() {
  if (!MENU.mapaDom) mapaZbuduj();
  mapaAktualizuj();
  const u = META.ui, widz = u.mapyWidz || (u.mapyWidz = {});
  const nowe = Object.keys(MAPS).filter(k => mapaOdbl(k) && !widz[k] && k !== 'laki');
  Object.keys(MAPS).forEach(k => { if (mapaOdbl(k)) widz[k] = 1; });
  saveMetaSoon();
  clearInterval(MENU.mapaAnim);
  if (!nowe.length) { requestAnimationFrame(() => mapaRysuj()); return; }
  // „MGŁA SCHODZI": promień nowych map rośnie od 0 do pełnego w 1,2 s (8 przerysowań)
  let i = 0;
  requestAnimationFrame(() => mapaRysuj(0, nowe, 0));
  MENU.mapaAnim = setInterval(() => {
    i++; mapaRysuj(0, nowe, i / 8);
    if (i >= 8) { clearInterval(MENU.mapaAnim); nowe.forEach(k => MAPA_NOWA[k] && mapaDymek(k, MAPA_NOWA[k])); }
  }, 150);
  STATY.zdarzenie('menu/mapa-mgla/' + nowe.join('+'), 'Mapa osiedla: mgła zeszła z ' + nowe.join(', '));
}

// Klawiatura w menu (§10.9): strzałki = nawigacja jak krzyżak pada, Enter = zaznaczony element albo GRAJ,
// Esc/Backspace = zamknij panel, Q/E = postać, M = następna mapa. Pole tekstowe (kod DEV) jest pomijane.
function menuKlawisz(e) {
  const ov = topOverlay();
  if (!ov || ov.id !== 'startOv') return;
  const tg = e.target;
  if (tg && (tg.tagName === 'TEXTAREA' || (tg.tagName === 'INPUT' && tg.type !== 'range'))) return;
  const panel = ov.classList.contains('panel-open'), items = navItems(ov);
  const kier = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
  if (kier) {
    e.preventDefault();
    if (jestSuwak(gpSel) && kier[0]) gpSuwak(gpSel, kier[0]);
    else if (!gpSel || !items.includes(gpSel)) gpMark(items[0]);
    else gpMove(items, kier[0], kier[1]);
    return;
  }
  if (e.repeat) return;
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    if (gpSel && items.includes(gpSel) && !jestSuwak(gpSel)) gpSel.click();
    else if (!panel) document.getElementById('btnStart').click();
    else if (ov.classList.contains('panel-mapy')) document.getElementById('mapaGraj').click();
  } else if ((e.code === 'Escape' || e.code === 'Backspace') && panel) { e.preventDefault(); gpBack(ov); }
  else if (!panel && e.code === 'KeyQ') menuPostac(-1);
  else if (!panel && e.code === 'KeyE') menuPostac(1);
  else if ((!panel || ov.classList.contains('panel-mapy')) && e.code === 'KeyM') menuMapa(1);
}

// START MENU: skala, zdarzenia, obserwator widoczności (#startOv pokazywany w kilku miejscach przez style.display)
// 29.09: mały numer wersji w rogu menu (z ?v= w adresie main.js — to samo, co podbijamy przy każdym wydaniu)
const WERSJA_GRY = (new URL(import.meta.url).searchParams.get('v')) || 'dev';
function menuInit() {
  { const w = document.getElementById('warzywniak');
    if (w && !document.getElementById('wWersja')) {
      const v = document.createElement('div'); v.id = 'wWersja'; v.textContent = 'v' + WERSJA_GRY;
      v.style.cssText = 'position:absolute;left:6px;bottom:3px;font-size:11px;line-height:1;opacity:.55;color:#f3e6c8;pointer-events:none;z-index:50;letter-spacing:.5px';
      w.appendChild(v);
    } }
  const w = document.getElementById('warzywniak');
  if (!w) return;
  menuSkala();
  addEventListener('resize', menuSkala);
  addEventListener('orientationchange', () => setTimeout(menuSkala, 120));
  document.getElementById('wPostL').onclick = () => menuPostac(-1);
  document.getElementById('wPostP').onclick = () => menuPostac(1);
  document.getElementById('heroMapa').onclick = e => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const d = +b.dataset.m;
    if (d) menuMapa(d); else document.querySelector('.tab[data-tab="mapy"]').click();
  };
  document.getElementById('wZapowiedz').onclick = e => { e.currentTarget.hidden = true; };
  addEventListener('keydown', menuKlawisz);
  const ov = document.getElementById('startOv');
  const widoczne = () => ov.style.display !== 'none' && getComputedStyle(ov).display !== 'none';
  let bylo = widoczne();
  document.body.classList.toggle('w-menu', bylo);
  new MutationObserver(() => {
    const jest = widoczne();
    if (jest === bylo) return;
    bylo = jest;
    document.body.classList.toggle('w-menu', jest);
    if (!jest) { gpMark(null); return; }
    // powrót do menu (z biegu, z komiksu): zamknięty panel, świeże dane, zaległe odsłonięcia
    if (ov.classList.contains('panel-open')) document.querySelector('.tab[data-tab="graj"]').click();
    menuSkala();
    renderMenu({ odslon: true });
  }).observe(ov, { attributes: true, attributeFilter: ['style'] });
  // „nowy dzień" przy otwartym menu (Danie dnia / zlecenia — E4 K7/K8) i powrót do karty: odśwież tablicę
  addEventListener('focus', () => { if (widoczne()) renderMenu(); });
  renderMenu();
  // pierwsze wejście: odsłonięcia dopiero, gdy menu naprawdę widać (po ekranie ładowania; komiks = obserwator)
  if (bylo) setTimeout(() => renderMenu({ odslon: true }), 650);
}

// DEV: pomiar menu (§10.10) — wynik w konsoli i jako obiekt; `menuPodstaw(n)` = zapis „po n biegach" do zrzutów
function menuAudyt() {
  const ov = document.getElementById('startOv'), wynik = { bledy: [] };
  const graj = [...ov.querySelectorAll('.bigbtn')].find(b => b.offsetWidth);   // w panelu (poza Mapą) GRAJ jest schowany
  const inter = navItems(ov);
  if (graj) {
    const rg = graj.getBoundingClientRect();
    wynik.graj = [Math.round(rg.width), Math.round(rg.height)];
    if (rg.height < 44) wynik.bledy.push('GRAJ < 44 px wysokości');
    for (const el of inter) { const r = el.getBoundingClientRect(); if (el !== graj && !el.closest('#panele .panel') && r.width * r.height > rg.width * rg.height) wynik.bledy.push('większe od GRAJ: ' + (el.id || el.className)); }
  }
  // (2) najmniejsza czcionka widocznego tekstu
  let min = 99, minEl = '';
  const tw = document.createTreeWalker(ov, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || !el.offsetWidth || !el.getClientRects().length) continue;
    if (el.closest('.panel:not(.on)')) continue;
    const f = parseFloat(getComputedStyle(el).fontSize);
    if (f < min) { min = f; minEl = (el.id || el.className || el.tagName) + ': ' + n.textContent.trim().slice(0, 20); }
  }
  wynik.minCzcionka = [+min.toFixed(1), minEl];
  if (min < 11) wynik.bledy.push('czcionka < 11 px: ' + minEl);
  // (3) prostokąty stref się nie przecinają (postać za ladą — zamierzone)
  const strefy = ['tablica', 'wWybor', 'lada', 'wRog', 'heroBox', 'logo', 'btnStart'].map(id => [id, document.getElementById(id)]).filter(([, e]) => e && e.offsetWidth);
  const zw = [['heroBox', 'lada'], ['btnStart', 'lada'], ['heroBox', 'logo']];   // zamierzone: stopy za ladą, GRAJ na ladzie, logo nad czubkiem postaci
  for (let i = 0; i < strefy.length; i++) for (let j = i + 1; j < strefy.length; j++) {
    const [a, ea] = strefy[i], [b, eb] = strefy[j];
    if (zw.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) continue;
    const A = ea.getBoundingClientRect(), B = eb.getBoundingClientRect();
    if (A.left < B.right - 1 && B.left < A.right - 1 && A.top < B.bottom - 1 && B.top < A.bottom - 1) wynik.bledy.push(`nachodzą: #${a} × #${b}`);
  }
  // (4) bez przewijania
  wynik.scroll = [ov.scrollHeight, ov.clientHeight, document.documentElement.scrollHeight, innerHeight];
  if (ov.scrollHeight > ov.clientHeight + 1 || document.documentElement.scrollHeight > innerHeight + 1) wynik.bledy.push('przewijanie');
  // (5) pola dotyku ≥ 44×44 (PC z myszą `w-pcx`: ≥ 32 — decyzja właściciela 29.09 „na PC mogą być < 44 px, ale czytelne")
  const minPole = MENU.pcx ? 32 : 44;
  wynik.male = inter.map(el => { const r = el.getBoundingClientRect(); return [el.id || el.dataset.tab || el.dataset.w || el.className, Math.round(r.width), Math.round(r.height)]; })
    .filter(([, a, b]) => a < minPole || b < minPole);
  if (wynik.male.length) wynik.bledy.push(`pola < ${minPole} px: ` + wynik.male.length);
  // (6) ≤ 2 kropki
  wynik.kropki = [...ov.querySelectorAll('.wKropka')].filter(e => e.offsetWidth).length;
  if (wynik.kropki > 2) wynik.bledy.push('> 2 kropki');
  wynik.stan = 'w-r' + menuStan() + (MENU.pcx ? ' pcx' : MENU.pc ? ' pc' : '') + ' s=' + MENU.s.toFixed(2);
  return wynik;
}
function menuPodstaw(n, o = {}) {
  bezZapisu = true;                                // DEV: podstawiony zapis nie nadpisuje prawdziwego (przegląd 29.09)
  const s = META.st;
  s.runs = s.pelne = n; s.smierci = Math.max(0, n - (o.wins || 0)); s.wins = o.wins || 0;
  if (n >= 1) { s.best = Math.max(s.best, o.best ?? 432); s.bestKills = Math.max(s.bestKills, o.bestKills ?? 846); s.kills = Math.max(s.kills, o.kills ?? 60 * n); }
  if (o.coins != null) META.coins = o.coins;
  if (o.bestia) for (const k of Object.keys(ENEMY_TYPES).slice(0, o.bestia)) META.bestiary[k] = META.bestiary[k] || 3;
  META.ui.odsl = o.animuj ? {} : { r1: 1, r2: 1, r3: 1 };
  if (!o.animuj) MENU.pierwszy = false;
  if (o.mapyWidz !== false && !o.animuj) META.ui.mapyWidz = { laki: 1, osiedle: 1, wawozy: 1, market: 1 };
  if (o.reset) { META.ui.odsl = {}; META.ui.mapyWidz = {}; delete META.ui.krSklep; delete META.ui.krPost; delete META.ui.krAkta; }
  saveMeta(); renderShop(); renderChars(); renderMenu({ odslon: !!o.animuj });
  return menuAudyt();
}

// ============================== STAN GRY ==============================
const G = {
  running: false, over: false, paused: false,
  time: 0, kills: 0, runCoins: 0, zebrane: 0,
  ranga: 0, rangaKille: 0,               // ranga w biegu (zabijanie = sila)
  enemies: [], gems: [], coins: [], shots: [], orbs: [], sparks: [], rings: [],
  lobs: [], boomers: [], bolts: [], pops: [], hps: [], kury: [], okruchy: [], puffs: [],
  padajace: [],                                    // regały w trakcie przewracania (market)
  turrets: [],                                     // postawione sokowirówki (TD-lite)
  krzaki: [],                                      // krzaki pomidorowe (sadza sie same)
  pestki: [], kielki: [],                          // Pipsini i jego kiełki
  karabinPoc: [],                                  // ziarna kukurydzy z karabinu (tryb FPP)
  gluty: [], kaluze: [],                           // globy ketchupu w locie + kałuże po nich
  seria: [],                                       // kolejka rzutów scyzorykiem
  hitstop: 0,                                      // krótkie zatrzymanie czasu przy grubym zabójstwie
  shake: 0,
  // E1-bieg: spawner Wieczoru (akumulator, podłoga, recykling, Ketchupino, kalendarz, odroczone fale)
  spawnAkum: 0, podlogaT: 0, recyklT: 0, ketchT: 0, wiecIdx: 0, kolejkaFal: [], kolejkaSpawnu: [], falaNr: 0,
  dmgBron: {}, maxHit: { dmg: 0, zr: '', crit: false },   // E1-bieg: obrażenia per źródło (zadajDmg)
  obrazeniaOd: {}, ostatniCios: null,              // E1-bieg K3: obrażenia GRACZA per źródło (ranGracza)
  zdarzenia: [], probki: [],                       // E1-bieg: log zdarzeń Wieczoru, próbki DEV co 10 s
  // E1-bieg K7/K8: telegrafy na ziemi, Skrzynie Kaprala, pociski i lawina Dona, cisza, walka, zwycięstwo
  telegrafy: [], skrzynieKap: [], donPoc: [], lawina: [], kaprale: 0,
  cisza: false, donStart: null, wygrana: null, kinoMn: 0.55,
  tlok: 0,                                        // 0-1: jak gesto jest wokol gracza (kamera odjezdza)
  kino: 0,                                         // s pozostalej oprawy filmowej (wejscie bossa)
  vacuum: 0, buff: { key: null, t: 0 },
  streak: 0, streakT: -9,
  dying: false, deathT: 0,
  // TRYB KARABINU (pierwsza osoba). `zycia` to LICZNIK TRAFIEŃ W TRYBIE, nie serca:
  // po trzecim ciosie wracamy do widoku za plecami, ale HP zostaje nietknięte —
  // tryb ma być nagrodą, a nie sposobem na zgon w nagrodzie.
  fps: { on: false, t: 0, max: 0, zycia: 0, fireT: 0, pitch: 0, wejscie: 0, wyjscie: 0, kick: 0 },
};
const P = {};

// ŻYCIE GRACZA W CAŁYCH SERCACH (decyzja właściciela 25.09: „1 uderzenie = 1 życie = 1 serce"; zastępuje
// K3 „HP ×100 z ćwiartkami"). P.hp / P.maxHp liczą serca, każdy cios przez `ranGracza` zabiera dokładnie 1.
// Stała zostaje (= 1), bo wiszą na niej leczenie, Serducho, sklep i wytrzymałość Sokowirówki.
const HP_SERCA = 1;
// E1-bieg K4: HP WROGÓW I OBRAŻENIA BRONI ×100 (osobna para od HP_SERCA — nigdy nie mnożyć jednej
// przez drugą). Definicje broni zostają w jednostkach bazowych; skalę dokłada `zadajDmg` na wejściu.
const SKALA_WROGA = 100;
function resetStats() {
  const C = CHARS[charKey];
  const maxHp = HP_SERCA * Math.max(2, 5 + META.up.serce + C.hp);
  Object.assign(P, {
    pos: new THREE.Vector3(0, 0, 0),
    hp: maxHp, maxHp,
    iframes: 0, y: 1.55, vy: 0, airborne: false, usedDouble: false, runDjump: false, shieldCd: 0,
    // karabin: `karabinRun` = już wypadł w tym biegu, `karabinMa` = leży w kieszeni gotowy
    gliding: false, runGlide: false, karabinRun: false, karabinMa: false,
    sokoPierwszy: false,                             // komunikat o klawiszu F raz na bieg
    smrodT: 0, smrodCd: 0, smrodTik: 0,              // aktywna aura Garlicina (klawisz G)
    zasolT: 0,                                       // E1-bieg K8: „zasolenie" po Salt Storm (×0,8 prędkości)
    vx: 0, vz: 0,
    kbx: 0, kbz: 0,                                  // odrzut gracza (tarcza Lolliniego), gaśnie sam
    coyoteT: 0, jumpBufT: 0,                         // coyote time i bufor skoku (patrz tryJump)
    weapons: [{ key: CHARS[charKey].startWpn || 'kule', lvl: 1, t: 0, t0: 0 }],   // max 3 sloty; t0 = od kiedy (DPS broni)
    passives: {},                                // key -> poziom (E2: ile razy wzięto składnik)
    skl: [], sklU: {}, slotySkl: CFG_DECYZJE.slotySkl, regenAkum: 0,   // E2 K1: sloty składników, jednostki siły, Rosół
    awanse: 0, awAuto: 0, awBron: 0, awBronAcc: null, wyklucz: new Set(),         // awAuto: AWANS CO 3 — liczba awansów z automatycznym wzmocnieniem                   // E2 K2/K3: licznik awansów (nauka rzadkości), wykluczone id kart
    nozeBonus: 0,                                    // E2 K8: noże Razoretty za krytyki
    wybory: { przelos: CFG_DECYZJE.wybory.przelos + (charKey === 'carrotello' ? 1 : 0),   // Carrotello: Wszechstronny (+1)
              pomin: CFG_DECYZJE.wybory.pomin, wyklucz: CFG_DECYZJE.wybory.wyklucz },
    wyboryUzyte: { przelosuj: 0, pomin: 0, wyklucz: 0 },
    repeat: {},                                  // key -> ile razy wzięte (karty bez limitu)
    evo: {},                                     // key -> true
    xp: 0, lvl: 1, xpNeed: 5,                    // pierwszy poziom świadomie tani (dalej wg xpDoNast)
  });
}
// ---- statystyki pochodne (meta + pasywy + buffy) ----
// ============================== RANGA W BIEGU ==============================
// HP wrogow rosnie KWADRATOWO (`hpScale`), a sila gracza dotad rosla tylko
// kartami, ktore wypadaja coraz rzadziej (kazdy poziom wymaga wiecej XP).
// Ranga zamyka te luke: samo zabijanie podnosi obrazenia, wiec agresywna gra
// nadaza za krzywa trudnosci. Prog rosnie liniowo, wiec ranga nie ucieka w gore.
const RANGA_CAP = 150;            // cap 40 wypadal w 8,5 min i od tego momentu hpScale rosl w pustke
const rangaProg = r => 20 + 14 * r;               // ile zabojstw do NASTEPNEJ rangi
// WZROST W BIEGU (29.09, uwaga właściciela „postać za szybko staje się bardzo silna — o połowę"): trudn().wzrost mnoży
// przyrost z rangi (+5% obrażeń za rangę, +4% tempa co 4.) i z automatu awansu (+dmg/+tempo za awans). v1 = 1 (stare
// zachowanie). Osobno trudn().wzrostBron (domyślnie 1) = tempo automatycznych poziomów broni — 0,75 zabijało przepisy przed
// 5:00 (siła w 5:00 ×0,19), więc zostaje 1. CFG_TRUDNOSC.v2.wzrost, sekcja „WZROST W BIEGU" w INFO-PROJEKT.md.
const wzrost = () => { const w = trudn().wzrost; return w == null ? 1 : w; };
const rangaDmg = () => 1 + 0.05 * wzrost() * G.ranga;        // +5% obrazen za range (× wzrost)
const rangaFire = () => 1 + 0.04 * wzrost() * Math.floor(G.ranga / 4);   // co 4. ranga tez +4% tempa (× wzrost)
function sprawdzRange() {
  while (G.ranga < RANGA_CAP && G.rangaKille >= rangaProg(G.ranga)) {
    G.rangaKille -= rangaProg(G.ranga);
    G.ranga++;
    AUDIO.sfx('awans');
    dmgPop(P.pos.x, P.y + 2.0, P.pos.z, T('RANGA ', 'RANK ') + G.ranga, '#ffd75e', 1.8, 'wazny');
    if (G.ranga % 4 === 0) toastBuff(T('RANGA ', 'RANK ') + G.ranga
      + T(' — obrażenia +', ' — damage +') + Math.round((rangaDmg() - 1) * 100)
      + T('%, tempo +', '%, fire rate +') + Math.round((rangaFire() - 1) * 100) + '%');
  }
  const el = document.getElementById('ranga');
  if (el) {
    el.innerHTML = ico('czaszka', 13) + T(' RANGA ', ' RANK ') + G.ranga;
    const b = document.getElementById('rangabar');
    if (b) b.style.width = (G.ranga >= RANGA_CAP ? 100 : G.rangaKille / rangaProg(G.ranga) * 100) + '%';
  }
}

// ============================== KRZYWA XP ==============================
// Do 13.08 próg rósł LINIOWO (`5 + 3.2L`): w 5:00 wychodził poziom 55, awans co ~5 s
// i wszystkie osiem pasywów na maksie w 4. minucie — dalej karty degenerowały się
// do jednej („Znaleźne”), czyli 29 obowiązkowych kliknięć pod rząd (zmierzone).
// Człon kwadratowy 0.30L² zostawia pierwsze ~8 poziomów prawie bez zmian
// (L=8: 51 vs 31 XP), a późną grę rozciąga: ~31 poziom w 5:00 zamiast 55.
// E1-bieg K5 (spec 07 §6): człon SZEŚCIENNY. Horda 500 daje ~1,5× więcej XP na minutę niż przy
// starej krzywej, a bieg ma koniec o 10:00 — cel: ~22. poziom w 5:00 i ~37. przy Donie, czyli pula
// kart (~49 znaczących + 6 skrzyń kaprali) wysycha dokładnie na finał. Wczesne progi prawie bez zmian
// (l=2: 13 jak dawniej), późne dużo wyżej (l=30: 1385 zamiast 371).
// E1-bieg K5/K11: krzywa XP (spec §6). K11: sześcian 0,025 → XP_KRZ.d, bo piniaty 6 kaprali (+1 poziom każda)
// dawały botowi-średniemu 44 w 10:00 zamiast 35–40. Strojenie na żywo: HORDA.cfg.xpKrzywa.
const XP_KRZ = { a: 5, b: 2.5, c: 0.70, d: 0.055, e: 0 };   // K11: d 0.025 → 0.055; TRUDNOŚĆ v2: człon e·l⁴ (CFG_TRUDNOSC)
const xpDoNast = l => Math.round(XP_KRZ.a + XP_KRZ.b * l + XP_KRZ.c * l * l + XP_KRZ.d * l * l * l + (XP_KRZ.e || 0) * l * l * l * l);

// BURACZANE CIŚNIENIE (pasyw Beetina z biblii, wdrożony 18.09 na zgłoszenie właściciela
// „burak prawie nieużywalny"): poniżej połowy serc wysysanie życia (10% zadanych obrażeń →
// serca, patrz zadajDmg). BALANS 24.09 (decyzja właściciela „Beetino nadal za mocny"): bez +20%
// obrażeń poniżej połowy HP — zostaje samo leczenie, i to co 5 s zamiast co 3 s.
const cisnienie = () => charKey === 'beetino' && P.hp > 0 && P.hp <= P.maxHp * 0.5;
const BEET_LECZ_CD = 5.0;                         // s między sercami z wysysania (nerf 23.09: 3 s, 24.09: 5 s)
// AWANS CO 3 (29.09): automatyczne wzmocnienie za każdy awans (P.awAuto = liczba awansów w biegu; CFG_TRUDNOSC.*.awans)
const awansDmg  = () => 1 + trudn().awans.dmg * wzrost() * (P.awAuto || 0);
const awansTempo = () => 1 + trudn().awans.tempo * wzrost() * (P.awAuto || 0);
const dmgAll  = () => CHARS[charKey].dmg * (1 + 0.10 * META.up.dmg) * Math.pow(1.15, U('moc')) * (1 + 0.03 * (P.repeat.sol || 0)) * (G.buff.key === 'dmg' ? 2 : 1) * rangaDmg() * awansDmg();   // Ciśnienie Beetina bez bonusu obrażeń (24.09; było 1.25 → 1.20)
const fireMul = () => Math.pow(1.12, U('tempo')) * (1 + 0.03 * (P.repeat.oliwa || 0)) * rangaFire() * awansTempo();
// clamp 0.75: pasyw daje najwyżej 0.50, ale „Pieprz Nonny” jest bez limitu i bez
// tego setny poziom oznaczałby krytyk na 100% (crit ×3 przestaje być zdarzeniem).
const critC   = () => Math.min(0.75, 0.10 * U('krytyk') + 0.02 * (P.repeat.pieprz || 0));
const rangeF  = () => 14 * Math.pow(1.15, U('zasieg')) * (1 + 0.04 * (P.repeat.bazylia || 0));
// `rangeF()` jest ABSOLUTNY (14 j. bez pasywu) — do promieni innych niż zasięg Kul
// używaj TEGO mnożnika (1.0 bez pasywu). Do 03.09 „Sokoli wzrok" czytały 4 bronie z 14.
const rangeM  = () => rangeF() / 14;
// E2 (spec §7.1): SUFIT zasięgu obszarówek „wokół gracza" (Skarpeta i jej chmury, Tupnięcie, Wypad, orbita Doppii, kałuże);
// nadmiar ponad sufit zamienia się w obrażenia (+50% nadmiaru). Pociski dalej używają pełnego rangeM().
function rangeObsz() {
  const m = rangeM(), s = CFG_DECYZJE.obsz.sufit, uzyte = Math.min(m, s);
  return { m: uzyte, dmg: 1 + CFG_DECYZJE.obsz.nadmiarNaDmg * (m / uzyte - 1) };
}
const magnetF = () => CHARS[charKey].mag * 2.6 * (1 + 0.20 * META.up.magnes) * Math.pow(1.35, U('magnes')) * lag('magnes');   // K10: łagodny szerzej
const speedF  = () => CHARS[charKey].spd * 6.2 * (1 + 0.08 * META.up.szyb) * Math.pow(1.10, U('buty'));
const hasWeapon = k => P.weapons.find(w => w.key === k);

// ============================== WEJŚCIE ==============================
const keys = {};
// Utrata fokusa gubiła `keyup`, więc trzymany klawisz zostawał wciśnięty
// na zawsze — po powrocie do gry postać sama jechała w skos. Czyścimy wszystko.
const puscWszystko = () => { for (const k in keys) keys[k] = false; jumpHeld = false; };
addEventListener('blur', puscWszystko);
// FLUSH ZAPISU. `saveMetaSoon()` ma debounce 2 s, a przez niego idą liczniki
// bestiariusza i `META.st.skrzynki` (od tego zależy wyreżyserowana szóstka skrzyń).
// Bez tego zamknięcie karty w ciągu 2 s po zabójstwie kasowało progres — a na
// Capacitorze Android potrafi ubić proces natychmiast po minimalizacji, więc to
// nie edge case. `beforeunload` na iOS nie odpala; właściwym zdarzeniem jest `pagehide`.
addEventListener('visibilitychange', () => { if (document.hidden) { puscWszystko(); flushMeta(); } });
addEventListener('pagehide', flushMeta);
const hasDjump = () => META.unlocked.djump || P.runDjump;
const hasGlide = () => META.unlocked.glide || P.runGlide;
let jumpHeld = false;                              // przytrzymanie = SZYBOWANIE
// COYOTE TIME i BUFOR SKOKU (klasyka platformówek, 0.12 s = ~7 klatek):
//  • coyote: przez chwilę po ZEJŚCIU z krawędzi skok wciąż liczy się „z ziemi" — gracz
//    widzi krawędź później, niż ją mija. Ustawiany TYLKO przy spadnięciu, nigdy po skoku.
//  • bufor: spacja wciśnięta tuż PRZED lądowaniem nie ginie, tylko odpala skok po nim.
const COYOTE_CZAS = 0.12, JUMP_BUFOR = 0.12;
function tryJump() {
  if (!G.running || G.paused) return;
  if (!P.airborne || P.coyoteT > 0) { P.vy = 8.2; P.airborne = true; P.coyoteT = 0; AUDIO.sfx('skok'); }
  else if (hasDjump() && !P.usedDouble) {          // podwójny skok
    P.vy = 7.6; P.usedDouble = true;
    dmgPop(P.pos.x, P.y + 0.4, P.pos.z, 'HOP!', '#aaeeff', 1.1);
    AUDIO.sfx('skok');
  }
  else P.jumpBufT = JUMP_BUFOR;                    // w locie bez podwójnego: zapamiętaj na lądowanie
}
addEventListener('keydown', e => {
  // pole na kody (DEV) i inne pola TEKSTOWE: tam klawisze to tekst, nie sterowanie.
  // Tylko tekstowe — suwaki głośności to też <input> i trzymają fokus po wyjściu z pauzy.
  const tg = e.target;
  if (tg && (tg.tagName === 'TEXTAREA' || (tg.tagName === 'INPUT' && /^(text|search|number|password|email|url)$/.test(tg.type)))) return;
  keys[e.code] = true;
  // E2 K4: jackpot — Enter/Spacja pomija animację, potem ZABIERAM!
  if (document.getElementById('skrzyniaOv').style.display === 'flex' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) {
    e.preventDefault(); if (!e.repeat) { if (SKR.faza < 4) pominJackpot(); else zamknijJackpot(); } return;
  }
  // B12: prośba o kawę — Enter = postaw kawę, Esc = może później (Spacja celowo nic: mashowana przy śmierci jako skok)
  if (kawaWidoczna() && !e.repeat) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); kawaTak(); return; }
    if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); kawaPozniej(); return; }
  }
  if (e.code === 'Space') { e.preventDefault(); if (!jumpHeld) tryJump(); jumpHeld = true; }
  if (e.code === KARABIN_KLAWISZ && G.running && !G.paused) startKarabin();
  if (e.code === STAW_KLAWISZ) postawWiezyczke();          // Sokowirówka na żądanie
  if (e.code === SMROD_KLAWISZ) odpalSmrod();               // smrodliwa aura Garlicina
  // E2 K3: karty awansu — 1–3 wybór, R przelosuj, P pomiń, X wyklucz
  if (document.getElementById('cardsOv').style.display === 'flex' && G.karty && !e.repeat && performance.now() - (G.ovOd || 0) > 250) {
    const nr = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (nr != null) { const k = document.querySelectorAll('#cards .card')[nr]; if (k) k.click(); }
    else if (e.code === 'KeyR') wyborKart('przelos');
    else if (e.code === 'KeyP') wyborKart('pomin');
    else if (e.code === 'KeyX') wyborKart('wyklucz');
  }
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Space') jumpHeld = false;
});

// dotyk: lewa połowa = joystick; mysz / prawa połowa dotyku = obrót kamery
const stickEl = document.getElementById('stick'), knobEl = document.getElementById('knob');
const touch = { on: false, id: null, cx: 0, cy: 0, vx: 0, vy: 0 };
const camDrag = { on: false, id: null, lx: 0, ly: 0 };
// ============ MYSZ JAK W FPS: KLIK PRZECHWYTUJE KURSOR ============
// Na PC obracanie kamery wymagalo PRZYTRZYMANIA i przeciagania — przy jednoczesnym
// biegu na WSAD to niewykonalne. Teraz jedno kliknięcie w obraz przechwytuje kursor
// (Pointer Lock) i od tej pory SAM RUCH myszy obraca kamere, jak w kazdym FPS-ie.
// Escape zwalnia kursor (i przy okazji pauzuje — to samo, czego gracz oczekuje).
// Przeciaganie zostaje jako awaryjne, gdy przegladarka odmowi blokady.
let myszLock = false;
// 30.09 (opinia testera z itch): po kliknięciu karty trzeba było drugi raz kliknąć w obraz, a na ekranie końca
// kursor był zablokowany (Esc, żeby kliknąć JESZCZE RAZ). Overlay zapamiętuje, że mysz była przechwycona, a po
// zamknięciu (w tym samym geście kliknięcia/klawisza) przechwytuje ją z powrotem.
let myszWrac = false;
const MYSZ_CZULOSC = 0.0032;           // rad na piksel ruchu
function chwycMysz() {
  if (!G.running || G.paused || G.dying) return;
  if (document.pointerLockElement === canvas) return;
  // requestPointerLock zwraca PROMISE (Chrome) — odmowa przychodzi jako odrzucenie,
  // nie wyjątek, więc bez `.catch` lądowała w `unhandledrejection` (SecurityError
  // w podglądzie / iframe). Odmowa = zostaje przeciąganie, nic więcej.
  try {
    const p = canvas.requestPointerLock && canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* odmowa = zostaje drag */ }
}
function puscMysz() {
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* nic */ }
}
let myszLockByl = false, pauzaZLocka = -1e9;   // do rozpoznania ESC „połkniętego" przez Pointer Lock
document.addEventListener('pointerlockchange', () => {
  myszLock = document.pointerLockElement === canvas;
  // ESC PRZY ZABLOKOWANYM KURSORZE: przeglądarka sama zwalnia blokadę i NIE dostarcza
  // stronie keydown Escape (Chrome, Firefox, Safari). Handler pauzy na ESC nigdy go nie
  // widział — gracz tracił kursor i grał dalej bez pauzy. Pauzujemy więc TU: utrata
  // blokady w trakcie biegu bez naszego udziału (karty/menu wołają puscMysz same,
  // ale wtedy G.paused już jest true albo overlay jest otwarty) = intencja „stop".
  if (myszLockByl && !myszLock && G.running && !G.paused && !G.dying &&
      document.getElementById('cardsOv').style.display !== 'flex' &&
      document.getElementById('swapOv').style.display !== 'flex') {
    pauzaZLocka = performance.now();             // gdyby jakaś przeglądarka jednak dostarczyła ESC
    togglePause(true);
  }
  myszLockByl = myszLock;
});
// ruch myszy przy przechwyconym kursorze — bez wcisniętego przycisku
addEventListener('mousemove', e => {
  if (!myszLock || !G.running || G.paused) return;
  camYaw -= e.movementX * MYSZ_CZULOSC;
  if (G.fps.on) dodajPitch(-e.movementY * MYSZ_CZULOSC * 0.8);
});
// W trybie karabinu pion myszy/palca CELUJE. Clamp jest ciasny (±20°) świadomie:
// przy 500 wrogach zadarcie kamery w niebo znaczy zgon, a i tak nie ma w co strzelać.
const PITCH_MAX = 0.35;
const dodajPitch = d => { G.fps.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, G.fps.pitch + d)); };
addEventListener('pointerdown', e => {
  if (!G.running || G.paused || e.target.closest('.ov') || e.target.id === 'jbtn') return;
  const joyZone = e.pointerType === 'touch' && e.clientX < innerWidth * 0.55;
  if (joyZone && !touch.on) {
    touch.on = true; touch.id = e.pointerId; touch.cx = e.clientX; touch.cy = e.clientY;
    touch.vx = touch.vy = 0;
    stickEl.style.display = 'block';
    stickEl.style.left = (e.clientX - 55) + 'px'; stickEl.style.top = (e.clientY - 55) + 'px';
  } else if (!camDrag.on) {
    // mysz: przechwyc kursor; dotyk/pad: zostaje przeciaganie
    if (e.pointerType === 'mouse') chwycMysz();
    camDrag.on = true; camDrag.id = e.pointerId; camDrag.lx = e.clientX; camDrag.ly = e.clientY;
  }
});
addEventListener('pointermove', e => {
  if (touch.on && e.pointerId === touch.id) {
    let dx = e.clientX - touch.cx, dy = e.clientY - touch.cy;
    const d = Math.hypot(dx, dy), m = Math.min(d, 45);
    if (d > 0) { dx /= d; dy /= d; }
    // martwa strefa 6 px (drżenie palca to nie ruch), reszta rozciągnięta do pełnego zakresu;
    // długość wektora ≤ 1, więc skos nie jest szybszy od prostej (gałka wizualnie bez strefy)
    const k = d < 6 ? 0 : Math.min(1, (d - 6) / 39);
    touch.vx = dx * k; touch.vy = dy * k;
    knobEl.style.transform = `translate(calc(-50% + ${dx * m}px), calc(-50% + ${dy * m}px))`;
  } else if (camDrag.on && e.pointerId === camDrag.id && !myszLock) {
    camYaw -= (e.clientX - camDrag.lx) * 0.008;
    if (G.fps.on) dodajPitch(-(e.clientY - camDrag.ly) * 0.005);
    camDrag.lx = e.clientX; camDrag.ly = e.clientY;
  }
});
function endTouch(e) {
  if (e.pointerId === touch.id) {
    touch.on = false; touch.vx = touch.vy = 0;
    stickEl.style.display = 'none';
    knobEl.style.transform = 'translate(-50%,-50%)';
  }
  if (e.pointerId === camDrag.id) camDrag.on = false;
}
addEventListener('pointerup', endTouch);
addEventListener('pointercancel', endTouch);
{
  const jb = document.getElementById('jbtn');
  jb.addEventListener('pointerdown', e => { e.stopPropagation(); jumpHeld = true; tryJump(); });
  const puscil = () => { jumpHeld = false; };
  jb.addEventListener('pointerup', puscil);
  jb.addEventListener('pointercancel', puscil);
  jb.addEventListener('pointerleave', puscil);
  addEventListener('pointerup', puscil);            // gdy palec zjedzie poza przycisk
  const kb = document.getElementById('karabinBtn');
  kb.addEventListener('pointerdown', e => { e.stopPropagation(); startKarabin(); });
  const sb = document.getElementById('stawBtn');
  sb.addEventListener('pointerdown', e => { e.stopPropagation(); postawWiezyczke(); });
  const smb = document.getElementById('smrodBtn');   // E1-bieg K6: aura Garlicina na dotyku
  if (smb) smb.addEventListener('pointerdown', e => { e.stopPropagation(); odpalSmrod(); });
}

// ============================== KONTROLER (Gamepad API) ==============================
// Handheldy (Retroid, Steam Deck) + pady Xbox/PS/Switch. Lewy drążek = ruch, prawy
// = kamera (i celowanie w karabinie), reszta wg `META.pad.map` (zakładka Sterowanie).
// CAŁA gra ma dać się przejść bez myszy: menu, karty, wymiennik, pauza, koniec biegu,
// a nawet suwaki głośności — dlatego `navItems` łapie też `input[type=range]`.
const PAD = {
  on: false, mx: 0, mz: 0, jump: false, prev: [], navT: 0,
  rodzina: 'generic',                              // xbox | ps | switch | deck | generic
  akt: 0,                                          // ile sekund jeszcze pokazujemy podpowiedzi
  uczy: null,                                      // tryb nasłuchu przy zmianie mapowania
  hpBylo: null,                                    // do wykrycia trafienia gracza (wibracje)
  sygHud: '', sygFoot: '',                         // co aktualnie wisi w podpowiedziach
};
const PAD_DZ = 0.18;                               // martwa strefa drążków
const PAD_ZANIK = 4;                               // po tylu sekundach bez pada podpowiedzi gasną
let gpSel = null;                                  // zaznaczony kafelek menu

// WSZYSTKIE TEKSTY PADA W JEDNYM MIEJSCU — etap 2 (PL/EN) podmieni tę jedną tablicę
// zamiast szukać napisów po kilkunastu szablonach.
const PAD_TXT = {
  wybierz: T('wybierz', 'select'), wstecz: T('wstecz', 'back'), wznow: T('wznów', 'resume'),
  zakladki: T('zakładki', 'tabs'), zmiana: T('zmiana', 'change'),
  skok: T('skok', 'jump'), karabin: T('karabin', 'rifle'), wieza: T('wieżyczka', 'juicer'),
  smrod: T('smród', 'stink'), pauza: T('pauza', 'pause'),
  kamera: T('kamera za plecy', 'camera behind'), czulosc: T('Czułość prawego drążka', 'Right stick sensitivity'),
  inwersja: T('Odwróć pion (karabin)', 'Invert Y (rifle)'),
  wibracje: T('Wibracje', 'Rumble'), zmien: T('Zmień', 'Change'), domyslne: T('PRZYWRÓĆ DOMYŚLNE', 'RESTORE DEFAULTS'),
  nasluch: T('naciśnij przycisk…', 'press a button…'), anuluj: T('anuluj', 'cancel'),
  zajety: T('Ten przycisk jest zajęty na stałe', 'That button is reserved'),
  wl: T('WŁ.', 'ON'), wyl: T('WYŁ.', 'OFF'),
  uklad: T('Układ przycisków', 'Button layout'), ukl_auto: 'AUTO', ukl_xbox: 'XBOX', ukl_ps: 'PLAYSTATION', ukl_switch: 'SWITCH', ukl_deck: 'STEAM DECK',
  polaczony: T('KONTROLER: ', 'CONTROLLER: '), odlaczony: T('Kontroler odłączony', 'Controller disconnected'),
  ustawione: T('Przypisano: ', 'Mapped: '),
};

// RODZINA PADA po `gp.id`. Chrome podaje „Xbox Wireless Controller (STANDARD GAMEPAD
// Vendor: 045e Product: 02fd)", Firefox samo „045e-02fd-…" — stąd i nazwy, i vendor id.
// Valve SPRAWDZAMY PIERWSZY: Steam Deck potrafi przedstawiać się jako pad Xboxa
// (emulacja XInput), więc odwrotna kolejność nigdy by go nie rozpoznała.
function padRodzina(id) {
  const s = String(id || '').toLowerCase();
  if (/valve|steam/.test(s)) return 'deck';
  // handheldy z układem Xboxa (Retroid Pocket, 8BitDo, GameSir, Anbernic, Ayn Odin) —
  // RP6 Piotra meldował się nieznaną nazwą i pokazywał cyfry (test 18.09)
  if (/xbox|xinput|045e|retroid|8bitdo|gamesir|anbernic|ayn|odin|moga|razer kishi|backbone/.test(s)) return 'xbox';
  if (/sony|playstation|dualshock|dualsense|054c/.test(s)) return 'ps';
  if (/nintendo|pro controller|joy-?con|057e/.test(s)) return 'switch';
  return 'generic';
}
// ---- GLIFY: podpowiedzi klawiszy i przycisków pada (24.09) ----
// Kształt mówi, co to jest: kremowa nasadka = klawisz, pixelowe koło = przycisk twarzowy,
// ciemna pigułka = bumper / spust / menu / krzyżak. Wygląd: sekcja GLIFY w ui-hud.css,
// makieta i pomiary: dokumenty/menu-makiety/glify.html. Elementy to <span>/<i>, nie <b> —
// `.snd b` i `#pauseStats b` rozciągały i przefarbowywały dawne kapsle `b.gpk`.
const glKl = t => `<span class="gl gl-kl${t.length > 1 ? ' dl' : ''}">${t}</span>`;
const glPb = (kol, tresc) => `<span class="gl gl-pb ${kol}">${tresc}</span>`;
const glPr = (tresc, cls = '') => `<span class="gl gl-pr${cls}">${tresc}</span>`;
// romb pozycji (Switch): 0 góra, 1 prawo, 2 dół, 3 lewo — zaświecona kropka = ten przycisk
const glRomb = n => `<span class="gl-romb">${[0, 1, 2, 3].map(i => `<i${i === n ? ' class="on"' : ''}></i>`).join('')}</span>`;
const glGr = (...h) => `<span class="gl-gr">${h.join('')}</span>`;
const GL_MENU = '<i class="gl-menu3"></i>', GL_WIDOK = '<i class="gl-widok"></i>';
// symbole PS z icons.js w skali 1 (8×8) — CSS skaluje je ×2, więc piksele zostają równe
const glPs = n => glPb('gl-ciem', `<img src="${icon(n, 1)}" alt="">`);
// drążek (ruch / kamera) — ciemne kółko z literą strony
const glDrazek = s => glPb('gl-ciem', `<i>${s}</i>`);
// [indeks przycisku standard] → markup, osobno na rodzinę. UWAGA NA SWITCHA: fizyczne A/B
// i X/Y są ZAMIENIONE względem układu `standard`, więc indeks 0 (dolny) podpisujemy „B",
// a romb pokazuje pozycję. Budowane leniwie: `icon()` potrzebuje canvasu.
let _glTab = null;
function glTabela() {
  if (_glTab) return _glTab;
  const wspolne = (lb, rb, lt, rt, back, start) => ({
    4: glPr(lb), 5: glPr(rb), 6: glPr(lt, ' sp'), 7: glPr(rt, ' sp'), 8: back, 9: start,
    10: glDrazek('L'), 11: glDrazek('R'),
  });
  _glTab = {
    xbox: { 0: glPb('gl-xa', '<i>A</i>'), 1: glPb('gl-xb', '<i>B</i>'), 2: glPb('gl-xx', '<i>X</i>'), 3: glPb('gl-xy', '<i>Y</i>'),
            ...wspolne('LB', 'RB', 'LT', 'RT', glPr(GL_WIDOK), glPr(GL_MENU)) },
    ps:   { 0: glPs('psKrzyzyk'), 1: glPs('psKolo'), 2: glPs('psKwadrat'), 3: glPs('psTrojkat'),
            ...wspolne('L1', 'R1', 'L2', 'R2', glPr('CREATE', ' dl'), glPr(GL_MENU)) },
    switch: { 0: glGr(glPb('gl-ciem', '<i>B</i>'), glRomb(2)), 1: glGr(glPb('gl-ciem', '<i>A</i>'), glRomb(1)),
              2: glGr(glPb('gl-ciem', '<i>Y</i>'), glRomb(3)), 3: glGr(glPb('gl-ciem', '<i>X</i>'), glRomb(0)),
              ...wspolne('L', 'R', 'ZL', 'ZR', glPr('−', ' zn'), glPr('+', ' zn')) },
    // Steam Deck: ten sam układ liter co Xbox, ale przyciski są ciemne z jasną literą,
    // a bumpery/spusty podpisane L1/R1/L2/R2 (tak jak na obudowie)
    deck: { 0: glPb('gl-ciem', '<i>A</i>'), 1: glPb('gl-ciem', '<i>B</i>'), 2: glPb('gl-ciem', '<i>X</i>'), 3: glPb('gl-ciem', '<i>Y</i>'),
            ...wspolne('L1', 'R1', 'L2', 'R2', glPr(GL_WIDOK), glPr(GL_MENU)) },
  };
  return _glTab;
}
// SŁOWNA nazwa przycisku do komunikatów tekstowych („Wciśnij X") — tam nie wstawiamy plakietek
const PAD_NAZWY = {
  xbox: { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 9: 'START' },
  deck: { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 9: 'MENU' },
  ps: { 0: T('KRZYŻYK', 'CROSS'), 1: T('KÓŁKO', 'CIRCLE'), 2: T('KWADRAT', 'SQUARE'), 3: T('TRÓJKĄT', 'TRIANGLE'),
        4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 9: 'OPTIONS' },
  switch: { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 9: '+' },
};
// D-pad (12-15) wygląda tak samo na każdym padzie: kwadratowa pigułka ze strzałką
const PAD_DPAD = { 12: 'g', 13: 'd', 14: 'l', 15: 'p' };
// UKŁAD: ręczny wybór z zakładki Sterowanie wygrywa; „auto" = rodzina wykrytego pada,
// a pad nieznany lub jeszcze nie podłączony dostaje nazwy Xboxa (A/B/X/Y/LB/RB) —
// gołe cyfry nic graczowi nie mówią (test Piotra na RP6, 18.09)
function padUklad() {
  const reczny = META.pad.uklad && META.pad.uklad !== 'auto' ? META.pad.uklad : null;
  return reczny || (PAD.rodzina === 'ps' || PAD.rodzina === 'switch' || PAD.rodzina === 'deck' ? PAD.rodzina : 'xbox');
}
function padKapsel(i) {
  if (PAD_DPAD[i]) return glPr(`<i class="gl-strz ${PAD_DPAD[i]}"></i>`, ' kw');
  const g = glTabela()[padUklad()][i];
  return g || glPr(String(i));                     // przycisk poza znanym zakresem = goły numer
}
// glyph akcji z `META.pad.map` — do HUD-u, stopki i zakładki Sterowanie
function padGlyph(akcja) {
  const i = META.pad.map[akcja];
  return i == null ? '' : padKapsel(i);
}
// ---- TRYB WEJŚCIA: podpowiedzi idą za OSTATNIO UŻYTYM wejściem ----
// klawiatura/mysz → litery klawiszy, pad → glify pada, dotyk → NIC (przycisk sam jest
// sterowaniem, litera na telefonie nic nie znaczy). `pointer:coarse` tego nie rozstrzyga:
// laptop z ekranem dotykowym ma oba, a handheld (Retroid) ma dotyk I pada.
const WEJ = { tryb: '', padT: -1e9, poprzedni: '' };   // poprzedni = tryb sprzed pada (powrót po odłączeniu)
const KLAW_GLIF = { skok: () => T('SPACJA', 'SPACE'), karabin: () => 'R', wieza: () => 'F', smrod: () => 'G', pauza: () => 'ESC' };
const wejDomyslny = () => (matchMedia('(pointer:coarse)').matches ? 'dotyk' : 'klaw');
function ustawWej(t) {
  if (WEJ.tryb === t) return;
  if (t === 'pad' && WEJ.tryb) WEJ.poprzedni = WEJ.tryb;
  WEJ.tryb = t;
  const b = document.body.classList;
  b.remove('wej-klaw', 'wej-pad', 'wej-dotyk'); b.add('wej-' + t);
  glifyOdswiez();
}
// plakietka akcji dla bieżącego trybu ('' na dotyku)
function glif(akcja) {
  if (WEJ.tryb === 'pad') return padGlyph(akcja);
  if (WEJ.tryb === 'klaw' && KLAW_GLIF[akcja]) return glKl(KLAW_GLIF[akcja]());
  return '';
}
// to samo słowami — do komunikatów („Wciśnij R" / „Wciśnij KWADRAT" / „Dotknij przycisku")
function glifTekst(akcja) {
  if (WEJ.tryb === 'pad') {
    const i = META.pad.map[akcja];
    return (PAD_NAZWY[padUklad()] || PAD_NAZWY.xbox)[i] || '';
  }
  return WEJ.tryb === 'klaw' && KLAW_GLIF[akcja] ? KLAW_GLIF[akcja]() : '';
}
// jedna stopka menu głównego: klawiatura = skrót sterowania; pad ma własną stopkę
// (#padFoot), a na dotyku klawisze nic nie znaczą — wtedy pusta (CSS ją chowa)
function startFootHTML() {
  if (WEJ.tryb !== 'klaw') return '';
  return `${glKl('WASD')} ${T('ruch', 'move')} · ${glKl(T('SPACJA', 'SPACE'))} ${T('skok', 'jump')} · ` +
    `${glKl('ESC')} ${T('pauza', 'pause')} · ${T('reszta w <b>Ustawieniach</b>', 'the rest is in <b>Settings</b>')}`;
}
// przerysuj WSZYSTKIE podpowiedzi: zmiana trybu, rodziny pada, układu albo mapowania
function glifyOdswiez() {
  document.querySelectorAll('[data-glif]').forEach(el => { el.innerHTML = glif(el.dataset.glif); });
  const sf = document.getElementById('startFoot');
  if (sf) sf.innerHTML = startFootHTML();
  menuGlifyOdswiez();                                 // menu A: plakietki przy GRAJ i strzałkach
  const jg = document.querySelector('#pauseStats .jakGrac');
  if (jg) jg.outerHTML = jakGracHTML();
  if (document.getElementById('cardsOv')?.style.display === 'flex') odswiezPrzyciskiKart();   // E2 K3
  if (document.getElementById('kawaOv')?.style.display === 'flex') kawaGlify();                // B12
  if (document.getElementById('pauseOv')?.style.display === 'flex') rysujZakladkiPauzy(G.pauzaTab || 'bieg');   // E2 K7: tylko glify zakładek
  PAD.sygHud = PAD.sygFoot = '';
  padHudOdswiez(); padFootOdswiez();
}
addEventListener('keydown', e => {
  // Android potrafi dostarczyć przyciski pada TAKŻE jako klawisze — bez tego progu
  // tryb skakałby pad/klawiatura przy każdym naciśnięciu
  if (performance.now() - WEJ.padT < 500) return;
  if (!e.key || e.key === 'Unidentified' || /^(Gamepad|Media|Audio|Volume)/.test(e.key)) return;
  ustawWej('klaw');
}, true);
// pointerdown myszy = klawiatura/mysz; palec albo rysik = dotyk. Kompatybilnościowe
// zdarzenia myszy po dotknięciu NIE są pointer eventami typu 'mouse', więc nie mieszają.
addEventListener('pointerdown', e => ustawWej(e.pointerType === 'mouse' ? 'klaw' : 'dotyk'), true);
addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse' && Math.abs(e.movementX) + Math.abs(e.movementY) > 3) ustawWej('klaw');
}, true);

// WIBRACJE. Firefox i Safari nie mają `vibrationActuator`, a Chrome zwraca PROMISE,
// który przy odpiętym padzie odrzuca się — bez `.catch` leciałoby to prosto
// w `unhandledrejection` (ta sama pułapka, co przy Pointer Locku).
function padWibruj(sila, ms) {
  if (!META.pad.wibracje) return;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p || p.connected === false) continue;
    const a = p.vibrationActuator;
    if (!a || !a.playEffect) continue;              // pad bez silników nie blokuje kolejnego, który je ma
    try {
      const r = a.playEffect('dual-rumble', {
        duration: ms, startDelay: 0,
        strongMagnitude: Math.min(1, sila), weakMagnitude: Math.min(1, sila * 0.7),
      });
      if (r && r.catch) r.catch(() => {});
    } catch { /* przeglądarka bez wibracji — trudno */ }
    return;                                        // tylko pierwszy pad, nie cała szuflada
  }
}
// KRYTYKI IDĄ SERIAMI (aury biją co 0.25 s w kilkunastu wrogów naraz), więc bez
// tego dławika pad warczałby bez przerwy i zjadał baterię handhelda
let _krytWibT = 0;
function padWibrujKryt() {
  const t = performance.now();
  if (t - _krytWibT < 150) return;
  _krytWibT = t;
  padWibruj(0.22, 45);
}

// „Pad żyje" — podpowiedzi mają się pokazywać TYLKO wtedy, gdy gracz faktycznie
// trzyma pada. Ruch myszy albo klawisz gasi je od razu (gracz przesiadł się z powrotem).
function padZywy() { PAD.on = true; PAD.akt = PAD_ZANIK; }
function padMartwy() {
  if (!PAD.on && !PAD.akt) return;
  PAD.on = false; PAD.akt = 0;
  padHudOdswiez(); padFootOdswiez();
}
addEventListener('mousemove', () => { if (PAD.on) padMartwy(); });
addEventListener('keydown', () => { if (PAD.on) padMartwy(); });

function padToast(txt) {
  toastBuff(txt);
  setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2500);
}
addEventListener('gamepadconnected', e => {
  padZywy();
  PAD.rodzina = padRodzina(e.gamepad && e.gamepad.id);
  renderSterowanie();                              // glify w zakładce muszą pasować do NOWEGO pada
  glifyOdswiez();
  padToast(PAD_TXT.polaczony + String(e.gamepad && e.gamepad.id || 'pad').slice(0, 22));
});
addEventListener('gamepaddisconnected', () => {
  PAD.on = false; PAD.akt = 0; PAD.mx = PAD.mz = 0; PAD.jump = false; PAD.prev = []; PAD.uczy = null;
  // pad zniknął = podpowiedzi wracają do trybu sprzed pada (tablet z klawiaturą nie wraca do „dotyku")
  if (WEJ.tryb === 'pad') ustawWej(WEJ.poprzedni || wejDomyslny());
  padHudOdswiez(); padFootOdswiez();
  padToast(PAD_TXT.odlaczony);
});

// martwa strefa + ruch proporcjonalny (po odjęciu strefy skala rośnie do 1)
function padStick(x, y) {
  const d = Math.hypot(x, y);
  if (d < PAD_DZ) return [0, 0];
  const k = Math.min(1, (d - PAD_DZ) / (1 - PAD_DZ)) / d;
  return [x * k, y * k];
}
// najwyższy widoczny overlay (startOv jest pierwszy w DOM, więc reszta go przebija)
function topOverlay() {
  let ov = null;
  for (const o of document.querySelectorAll('.ov')) if (o.offsetWidth) ov = o;
  return ov;
}
// `input[type=range]` i `select` SĄ tu celowo: bez nich suwaki głośności i czułości
// byłyby jedynymi miejscami w grze, do których trzeba myszy (a to wywraca cały punkt
// „Steam Deck bez klawiatury"). Pola TEKSTOWE zostają poza listą — padem i tak nie ma
// czym w nie wpisać, a jedyne takie pole (kod DEV) wylatuje z drzewa w wydaniu.
// `.wNav` = przyciski menu A „Warzywniak” (strzałki, nazwa mapy, węzły mapy osiedla)
const navItems = ov => [...ov.querySelectorAll('.tab,.tile,.card,.bigbtn,.btn2,.wNav,input[type=range],select')]
  .filter(el => el.offsetWidth);
const jestSuwak = el => el && el.tagName === 'INPUT' && el.type === 'range';
function gpMark(el) {
  if (gpSel === el) return;
  if (gpSel) gpSel.classList.remove('gp-sel');
  gpSel = el || null;
  if (gpSel) { gpSel.classList.add('gp-sel'); gpSel.scrollIntoView({ block: 'nearest' }); }
}
// sąsiad w zadanym kierunku: najbliższy środek, z karą za zboczenie w bok
function gpMove(items, dx, dy) {
  if (!gpSel) { gpMark(items[0]); return; }
  const a = gpSel.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bd = 1e9;
  for (const el of items) {
    if (el === gpSel) continue;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2 - ax, y = r.top + r.height / 2 - ay;
    const along = x * dx + y * dy;
    if (along < 6) continue;                       // tylko w tę stronę
    // ODCHYLENIE BOCZNE liczone do KRAWĘDZI kandydata, nie do jego środka: szeroki
    // suwak czułości (444 px) miał środek 60 px w bok od kolumny przycisków „Zmień",
    // więc D-dół przeskakiwał go na rzecz przełącznika niżej (tester 18.09). Element,
    // który leży „pod kursorem" w poprzek, ma odchylenie 0.
    const cx = Math.min(Math.max(ax, r.left), r.right), cy = Math.min(Math.max(ay, r.top), r.bottom);
    const side = dy ? Math.abs(cx - ax) : Math.abs(cy - ay);
    const d = along + side * 2.2;
    if (d < bd) { bd = d; best = el; }
  }
  if (best) gpMark(best);
}
function gpBack(ov) {                              // B = wstecz / zamknij
  if (ov.id === 'pauseOv') togglePause(false);
  else if (ov.id === 'overOv') document.getElementById('btnMenu').click();
  else if (ov.id === 'kawaOv') kawaPozniej();      // B12: B = „Może później" (dopiero po 3 s)
  // komiks: B = POMIŃ. Klikamy przycisk, a nie wołamy funkcję z komiks.js, żeby pad
  // robił DOKŁADNIE to samo co palec. Na ostatniej planszy POMIŃ jest ukryty, ale
  // `.click()` i tak odpala jego handler — komiks.js traktuje to wtedy jak dojście
  // do końca, więc B nigdy nie zostawia gracza w komiksie.
  else if (ov.id === 'komiksOv') document.getElementById('komiksPomin')?.click();
  else if (ov.id === 'startOv') {
    const t = document.querySelector('.tab[data-tab="graj"]');
    if (t && !t.classList.contains('sel')) t.click();
  }                                                // karty/wymiennik: trzeba wybrać
}
// SUWAK PADEM: lewo/prawo = ±5% ZAKRESU (nie ±1 krok — przy 0-100 gracz kręciłby
// głośność sto razy). `input` musi polecieć ręcznie, bo zmiana `value` z kodu
// nie generuje zdarzeń, a na nich wiszą i audio.js, i czułość drążka.
function gpSuwak(el, dir) {
  const min = +el.min || 0, max = el.max === '' ? 100 : +el.max;
  const krok = Math.max(+el.step || 1, Math.round((max - min) * 0.05));
  el.value = Math.max(min, Math.min(max, (+el.value) + dir * krok));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
// LB/RB = poprzednia/następna zakładka menu. Zakładka „Graj" jest ukryta (ma własny
// duży przycisk), więc filtrujemy po offsetWidth — inaczej pad zatrzymywałby się
// na niewidocznym elemencie i wyglądałoby to na zawieszenie.
function gpZakladka(dir) {
  // `.jest` = skrzynka odsłonięta (menu A): przy otwartym panelu lada jest schowana, więc offsetWidth = 0
  const tabs = [...document.querySelectorAll('#tabs .tab')].filter(t => t.offsetWidth || t.classList.contains('jest'));
  if (!tabs.length) return;
  let i = tabs.findIndex(t => t.classList.contains('sel'));
  if (i < 0) i = dir > 0 ? -1 : 0;
  const t = tabs[(i + dir + tabs.length) % tabs.length];
  t.click();
  gpMark(t);
}

// ---- PODPOWIEDZI PRZYCISKÓW ----
// Rysujemy je TYLKO przy żywym padzie i tylko wtedy, gdy akcja ma sens (smród
// pokazujemy wyłącznie Garlicinowi, karabin dopiero po znalezieniu go w skrzyni) —
// martwa podpowiedź uczy gracza ignorować cały pasek.
const padWiersz = (akcja, txt) => `<span>${padGlyph(akcja)}${txt}</span>`;
// `ov` można podać z zewnątrz, gdy wywołujący już je policzył (`topOverlay()` to
// zapytanie do DOM-u, a tu jesteśmy co klatkę). Po `togglePause`/`gpBack` overlay
// mógł się właśnie otworzyć albo zamknąć — tam liczymy je na nowo, bez argumentu.
function padHudOdswiez(ov = topOverlay()) {
  const el = document.getElementById('padHud');
  if (!el) return;
  // RZĄD PODPOWIEDZI W BIEGU WYŁĄCZONY (właściciel, test na padzie 18.09: „dziwnie się
  // wyświetlają guziki na dole"). Mapowanie jest w Ustawieniach, a „Jak grać" w pauzie.
  const widok = false && PAD.on && G.running && !G.paused && !G.dying && !ov;
  if (!widok) { el.classList.remove('on'); PAD.sygHud = ''; return; }
  const kar = !!P.karabinMa || G.fps.on, sm = charKey === 'garlicino';
  const syg = PAD.rodzina + '|' + kar + sm + JSON.stringify(META.pad.map);
  if (syg !== PAD.sygHud) {
    PAD.sygHud = syg;
    el.innerHTML = padWiersz('skok', PAD_TXT.skok)
      + (kar ? padWiersz('karabin', PAD_TXT.karabin) : '')
      + padWiersz('wieza', PAD_TXT.wieza)
      + (sm ? padWiersz('smrod', PAD_TXT.smrod) : '')
      + padWiersz('pauza', PAD_TXT.pauza);
  }
  el.classList.add('on');
}
function padFootOdswiez(ov = topOverlay()) {
  const el = document.getElementById('padFoot');
  if (!el) return;
  // stopka wisi, dopóki OSTATNIM wejściem był pad (dawniej gasła po 4 s bezruchu pada,
  // czyli akurat wtedy, gdy gracz czytał menu)
  if (WEJ.tryb !== 'pad' || !ov) {
    el.classList.remove('on'); document.body.classList.remove('pad-foot');
    PAD.sygFoot = ''; return;
  }
  const syg = PAD.rodzina + '|' + ov.id + '|' + (PAD.uczy ? 'u' : '') + (jestSuwak(gpSel) ? 's' : '');
  if (syg !== PAD.sygFoot) {
    PAD.sygFoot = syg;
    // karty i wymiennik NIE MAJĄ wyjścia wstecz (trzeba wybrać ulepszenie), więc
    // nie obiecujemy tam „B wstecz" — obietnica bez pokrycia gorsza niż jej brak
    const bezWstecz = ov.id === 'cardsOv' || ov.id === 'swapOv' || ov.id === 'skrzyniaOv';
    // w trybie nasłuchu („naciśnij przycisk") stopka mówi tylko to, co ma sens: B anuluje
    el.innerHTML = PAD.uczy ? `<span>${padKapsel(1)}${PAD_TXT.anuluj}</span>`
      : `<span>${padKapsel(0)}${PAD_TXT.wybierz}</span>`
      + (bezWstecz ? '' : `<span>${padKapsel(1)}${PAD_TXT.wstecz}</span>`)
      + (ov.id === 'startOv' ? `<span>${padKapsel(4)}${padKapsel(5)}${PAD_TXT.zakladki}</span>` : '')
      + (ov.id === 'pauseOv' ? `<span>${padGlyph('pauza')}${PAD_TXT.wznow}</span>` : '')
      + (jestSuwak(gpSel) ? `<span>${padKapsel(14)}${padKapsel(15)}${PAD_TXT.zmiana}</span>` : '');
  }
  el.classList.add('on');
  document.body.classList.add('pad-foot');         // overlay robi miejsce na stopkę
}

// KONIEC NASŁUCHU przy zmianie mapowania. `i == null` = anulowane (B albo upłynęło 5 s).
function padKoniecNauki(i) {
  const a = PAD.uczy && PAD.uczy.akcja;
  PAD.uczy = null;
  // PRZYCISKI ZAJĘTE NA STAŁE: B (wstecz), LB/RB (zakładki), D-pad (nawigacja) i stałe
  // alternatywy z PAD_ALT (RT/LT/Back). Przypisanie np. skoku do RT dawałoby skok
  // + karabin z jednego naciśnięcia, bo `akcja()` sprawdza mapę I alternatywy (recenzja 18.09).
  const ZAJETE = [1, 4, 5, 12, 13, 14, 15, ...Object.values(PAD_ALT)];
  if (i != null && ZAJETE.includes(i)) { padToast(PAD_TXT.zajety); i = null; }
  if (a && i != null) {
    // ZAMIANA, nie duplikat: gdyby ten przycisk siedział już pod inną akcją, jedno
    // naciśnięcie odpalałoby obie naraz (smród + wieżyczka), czego nikt nie chce.
    // Akcja, której guzik zabraliśmy, dostaje ten zwolniony przez nas.
    const stary = META.pad.map[a];
    for (const k of Object.keys(META.pad.map)) if (k !== a && META.pad.map[k] === i) META.pad.map[k] = stary;
    META.pad.map[a] = i;
    saveMeta();
  }
  PAD.sygHud = PAD.sygFoot = '';                   // podpowiedzi muszą pokazać NOWY przycisk
  renderSterowanie();
  glifyOdswiez();
}
// AIM ASSIST (lekki). Nie strzela za gracza — tylko domyka ostatnie stopnie, gdy
// drążek STOI (wychylenie < 0.15). Szarpanie kamerą w trakcie celowania byłoby
// walką z graczem, a to najgorsze, co aim assist może zrobić.
// Rusza DOKŁADNIE TYMI zmiennymi, z których `karabinStrzal` liczy tor pocisku:
// `camYaw` i `G.fps.pitch` (kierunek = (-sin yaw·cos pit, sin pit, -cos yaw·cos pit)).
const AIM_STOZEK = Math.cos(6 * Math.PI / 180);
function padAimAssist(dt) {
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  let cel = null, best = 1e9;
  for (const e of G.enemies) {
    if (e.dying) continue;
    const dx = e.pos.x - cx, dz = e.pos.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < 4 || d > 30) continue;                 // wróg na wyciągnięcie ręki i tak wypełnia celownik
    if ((dx * fx + dz * fz) / d < AIM_STOZEK) continue;
    if (d < best) { best = d; cel = e; }           // najbliższy w stożku = ten, o którego chodzi
  }
  if (!cel) return;
  const dx = cel.pos.x - cx, dz = cel.pos.z - cz, dp = Math.hypot(dx, dz);
  const k = Math.min(1, dt * 2.5);
  let rozn = Math.atan2(-dx, -dz) - camYaw;
  rozn = Math.atan2(Math.sin(rozn), Math.cos(rozn));   // normalizacja do (-π, π]
  camYaw += rozn * k;
  dodajPitch((Math.atan2(cel.ty + 0.8 - cy, dp) - G.fps.pitch) * k);
}

// odpytywanie padów MUSI iść co klatkę (stan nie przychodzi zdarzeniami)
function pollPads(dt) {
  // TRAFIENIE GRACZA = spadek HP. Obrażenia lecą z pięciu różnych miejsc (kontakt,
  // kamikaze, regał, boss, kolce), więc zamiast pięciu haczyków pilnujemy tu jednej
  // liczby — leczenie (wzrost) świadomie nie wibruje.
  if (PAD.hpBylo != null && P.hp < PAD.hpBylo) padWibruj(0.95, 120);
  PAD.hpBylo = P.hp;

  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of pads) if (p && p.connected !== false) { gp = p; break; }
  if (!gp) {
    PAD.mx = PAD.mz = 0;
    if (PAD.uczy) padKoniecNauki(null);            // pad wypięty w trakcie nasłuchu = anuluj
    if (PAD.on) padMartwy();
    return;
  }
  const rodz = padRodzina(gp.id);
  if (rodz !== PAD.rodzina) {                      // przepięcie pada w locie = inne glify
    PAD.rodzina = rodz; PAD.sygHud = PAD.sygFoot = '';
    renderSterowanie(); glifyOdswiez();
  }
  const B = gp.buttons || [], ax = gp.axes || [];
  const btn = i => !!(B[i] && (B[i].pressed || B[i].value > 0.5));   // spusty analogowe: próg 0.5
  const hit = i => btn(i) && !PAD.prev[i];         // zbocze narastające
  const akcja = a => hit(META.pad.map[a]) || (PAD_ALT[a] != null && hit(PAD_ALT[a]));
  const [lx, ly] = padStick(ax[0] || 0, ax[1] || 0);
  const [rx, ry] = padStick(ax[2] || 0, ax[3] || 0);   // ry = celowanie w pionie (tylko tryb karabinu)
  const zapisz = () => { for (let i = 0; i < B.length; i++) PAD.prev[i] = btn(i); };

  // ŻYWY PAD = podpowiedzi na ekranie. Bez tego wisiałyby przy kimś, kto od kwadransa
  // gra na klawiaturze (pad leży podłączony obok).
  let ruch = Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0;
  if (!ruch) for (let i = 0; i < B.length; i++) if (btn(i)) { ruch = true; break; }
  if (ruch) padZywy();
  else if (PAD.akt > 0 && (PAD.akt -= dt) <= 0) PAD.on = false;
  // TRYB PODPOWIEDZI = pad dopiero po WYRAŹNYM użyciu: nowe naciśnięcie albo drążek za
  // połową. Sama martwa strefa (0.18) to za mało — zużyty drążek dryfuje i przełączałby
  // glify graczowi, który od kwadransa gra na klawiaturze z padem leżącym obok.
  let wejPad = Math.hypot(ax[0] || 0, ax[1] || 0) > 0.5 || Math.hypot(ax[2] || 0, ax[3] || 0) > 0.5;
  if (!wejPad) for (let i = 0; i < B.length; i++) if (hit(i)) { wejPad = true; break; }
  if (wejPad) { WEJ.padT = performance.now(); ustawWej('pad'); }

  // ---- NASŁUCH przy zmianie mapowania: pad NIE steruje wtedy niczym innym ----
  if (PAD.uczy) {
    if ((PAD.uczy.t -= dt) <= 0) padKoniecNauki(null);
    else for (let i = 0; i < B.length; i++) if (hit(i)) { padKoniecNauki(i === 1 ? null : i); break; }
    zapisz();
    padHudOdswiez(); padFootOdswiez();
    return;
  }

  const ov = topOverlay();
  if (ov) {                                        // ---- nawigacja po menu/overlayu ----
    PAD.mx = PAD.mz = 0;
    if (PAD.jump) { PAD.jump = false; jumpHeld = false; }
    const items = navItems(ov);
    if (!gpSel || !items.includes(gpSel)) gpMark(items[0]);
    let dx = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0);
    let dy = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
    if (!dx && !dy && (Math.abs(lx) > 0.5 || Math.abs(ly) > 0.5)) {
      if (Math.abs(lx) > Math.abs(ly)) dx = Math.sign(lx); else dy = Math.sign(ly);
    }
    // NA SUWAKU lewo/prawo ZMIENIA WARTOŚĆ, a nie skacze do sąsiada — inaczej
    // głośności i czułości nie dałoby się ustawić niczym poza myszą.
    const suw = jestSuwak(gpSel);
    if (!dx && !dy) PAD.navT = 0;
    else if ((PAD.navT -= dt) <= 0) {
      if (suw && dx) { gpSuwak(gpSel, dx); PAD.navT = 0.11; }   // szybciej: suwak ma 20 kroków
      else { gpMove(items, dx, dy); PAD.navT = 0.22; }
    }
    if (ov.id === 'skrzyniaOv') {                    // E2 K4: A = pomiń animację / ZABIERAM!, X = wymień broń (faza 0)
      if (hit(0)) { if (gpSel && gpSel.id === 'skrzWymien' && SKR.faza === 0) wymienZamiastJackpotu();
                    else if (SKR.faza < 4) pominJackpot(); else zamknijJackpot(); AUDIO.sfx('klik'); }
      if (hit(2)) wymienZamiastJackpotu();
    } else if (hit(0) && gpSel && !suw) { gpSel.click(); AUDIO.sfx('klik'); }   // pad nie robi pointerdown, więc dźwięk ręcznie
    if (hit(1)) gpBack(ov);
    if (ov.id === 'startOv') {                     // menu A: LB/RB = postać (ekran główny) albo panel w lewo/w prawo; Start = GRAJ
      const panel = ov.classList.contains('panel-open');
      if (hit(4)) { if (panel) gpZakladka(-1); else menuPostac(-1); }
      if (hit(5)) { if (panel) gpZakladka(1); else menuPostac(1); }
      if (hit(9) && !panel) document.getElementById('btnStart').click();
    }
    if (akcja('pauza') && ov.id === 'pauseOv') togglePause(false);
    if (ov.id === 'pauseOv') { if (hit(4)) przelaczZakladkePauzy(-1); if (hit(5)) przelaczZakladkePauzy(1); }   // E2 K7: zakładki LB/RB
    if (ov.id === 'cardsOv' && G.karty && performance.now() - (G.ovOd || 0) > 250) {   // E2 K3: X przelosuj, Y wyklucz, LB pomiń
      if (hit(2)) wyborKart('przelos');
      if (hit(3)) wyborKart('wyklucz');
      if (hit(4)) wyborKart('pomin');
    }
  } else {                                         // ---- sterowanie w grze ----
    if (gpSel) gpMark(null);
    PAD.mx = lx; PAD.mz = ly;
    // KRZYWA CZUŁOŚCI ^1.6: przy małych wychyleniach kamera pełznie (celowanie),
    // przy pełnym drążku chodzi tak samo szybko jak dotąd. Liniowy drążek jest
    // albo za wolny na obrót, albo za szybki na poprawkę — nie ma między tym środka.
    const czul = META.pad.czulosc || 1;
    const krzywa = v => Math.sign(v) * Math.pow(Math.abs(v), 1.6);
    camYaw -= krzywa(rx) * 2.6 * dt * czul;
    if (G.fps.on) {
      if (ry) dodajPitch(-krzywa(ry) * 1.3 * dt * czul * (META.pad.invY ? -1 : 1));
      // TYLKO gdy gracz naprawdę gra padem (`PAD.on`) i nie trzyma kursora (mysz):
      // `pollPads` leci dla każdego WPIĘTEGO pada, a drążki w spoczynku dają 0 —
      // bez tego warunku gracz na myszy z padem leżącym obok dostawał auto-aim
      // walczący z jego celowaniem (recenzja 18.09).
      if (PAD.on && !myszLock && Math.hypot(rx, ry) < 0.15) padAimAssist(dt);
    }
    if (akcja('skok')) { PAD.jump = true; jumpHeld = true; tryJump(); }
    if (PAD.jump && !btn(META.pad.map.skok)) { PAD.jump = false; jumpHeld = false; }
    if (akcja('karabin')) startKarabin();
    if (akcja('wieza')) postawWiezyczke();
    if (akcja('smrod')) odpalSmrod();
    if (akcja('kamera') && playerBB) camYaw = playerBB.facing + Math.PI;   // kamera za plecy
    if (akcja('pauza')) togglePause(true);
  }
  zapisz();
  padHudOdswiez(ov); padFootOdswiez(ov);           // `ov` już policzone wyżej — bez drugiego i trzeciego reflow na klatkę
}

// ---- ZAKŁADKA „STEROWANIE" ----
// Rzędy budujemy z kodu, a nie w index.html, bo ten sam indeks przycisku nosi inny
// napis na każdej rodzinie pada — po przepięciu kontrolera cała lista musi się
// przerysować. Wygląd dzielimy z suwakami dźwięku (`.snd`), żeby nie mnożyć stylów.
const PAD_AKCJE = ['skok', 'karabin', 'wieza', 'smrod', 'kamera', 'pauza'];
function renderSterowanie() {
  const box = document.getElementById('ctrlBox');
  if (!box) return;
  // zaznaczenie padem przeżywa przebudowę: inaczej po każdej zmianie mapowania
  // kursor odskakiwał na początek menu i trzeba go było przywozić z powrotem
  const bylo = gpSel && (gpSel.dataset && gpSel.dataset.padZmien
    ? `[data-pad-zmien="${gpSel.dataset.padZmien}"]` : (gpSel.id ? '#' + gpSel.id : null));
  const wl = v => (v ? PAD_TXT.wl : PAD_TXT.wyl);
  box.innerHTML = PAD_AKCJE.map(a => {
    const czeka = PAD.uczy && PAD.uczy.akcja === a;
    return `<div class="snd${czeka ? ' czeka' : ''}"><label>${PAD_TXT[a]}</label>` +
      `<b class="gpv">${czeka ? PAD_TXT.nasluch : padGlyph(a)}</b>` +
      `<button class="btn2" data-pad-zmien="${a}">${PAD_TXT.zmien}</button></div>`;
  }).join('')
    + `<div class="snd"><label>${PAD_TXT.czulosc}</label>` +
      `<input id="padCzul" type="range" min="50" max="200" step="5" ` +
      `value="${Math.round((META.pad.czulosc || 1) * 100)}"><b id="padCzulV"></b></div>`
    + `<div class="snd"><label>${PAD_TXT.uklad}</label><b class="gpv"></b>` +
      `<button class="btn2" id="padUklad">${PAD_TXT['ukl_' + (META.pad.uklad || 'auto')] || PAD_TXT.ukl_auto}</button></div>`
    + `<div class="snd"><label>${PAD_TXT.inwersja}</label><b class="gpv"></b>` +
      `<button class="btn2${META.pad.invY ? ' sel' : ''}" id="padInv">${wl(META.pad.invY)}</button></div>`
    + `<div class="snd"><label>${PAD_TXT.wibracje}</label><b class="gpv"></b>` +
      `<button class="btn2${META.pad.wibracje ? ' sel' : ''}" id="padWib">${wl(META.pad.wibracje)}</button></div>`
    + `<button class="btn2" id="padReset">${PAD_TXT.domyslne}</button>`;

  box.querySelectorAll('[data-pad-zmien]').forEach(b => b.onclick = () => {
    PAD.uczy = { akcja: b.dataset.padZmien, t: 5 };   // 5 s na naciśnięcie, B anuluje
    renderSterowanie();
  });
  const cz = document.getElementById('padCzul'), czV = document.getElementById('padCzulV');
  const pokaz = () => { czV.textContent = (cz.value / 100).toFixed(2) + '×'; };
  pokaz();
  cz.oninput = () => { META.pad.czulosc = cz.value / 100; pokaz(); saveMetaSoon(); };
  // układ przycisków: cykl auto → xbox → ps → switch → deck (glify w HUD i stopce od razu)
  document.getElementById('padUklad').onclick = () => {
    const cykl = ['auto', 'xbox', 'ps', 'switch', 'deck'];
    META.pad.uklad = cykl[(cykl.indexOf(META.pad.uklad || 'auto') + 1) % cykl.length];
    saveMeta(); PAD.sygHud = PAD.sygFoot = ''; renderSterowanie(); glifyOdswiez();
  };
  document.getElementById('padInv').onclick = () => {
    META.pad.invY = META.pad.invY ? 0 : 1; saveMeta(); renderSterowanie();
  };
  document.getElementById('padWib').onclick = () => {
    META.pad.wibracje = META.pad.wibracje ? 0 : 1; saveMeta();
    if (META.pad.wibracje) padWibruj(0.6, 160);        // od razu czuć, co się właśnie włączyło
    renderSterowanie();
  };
  document.getElementById('padReset').onclick = () => {
    META.pad.map = { ...PAD_MAP_DOM };
    META.pad.czulosc = 1; META.pad.invY = 0; META.pad.wibracje = 1; META.pad.uklad = 'auto';
    saveMeta(); PAD.sygHud = PAD.sygFoot = '';
    renderSterowanie();
  };
  if (bylo) {
    const el = box.querySelector(bylo);
    if (el && el.offsetWidth) { gpSel = null; gpMark(el); }
  }
}

// ============================== OPRAWA BOSSA ==============================
// Do 13.08 Don Chipso wchodzil BEZ ZAPOWIEDZI i byl tylko duzym chipsem: przy 359
// wrogach na ekranie gracz czesto w ogole nie wiedzial, ze walczy z bossem. Teraz:
// przyciemnienie + imie na caly ekran na wejsciu, a potem pasek HP u gory, ktory
// pokazuje NAJMOCNIEJ RANNEGO bossa (przy kilku naraz to on jest celem gracza).
// ============================== OPRAWA FILMOWA ==============================
// Elementy tworzone Z KODU, nie w index.html — to jedna nakładka na cały ekran
// i dwa pasy; trzymanie ich przy kodzie, który je odpala, jest czytelniejsze niż
// trzy martwe divy w HTML-u. Wszystko `pointer-events:none`, więc nic nie łyka wejścia.
let _blyskEl = null, _pasyEl = null, _winietaEl = null;
function initKino() {
  _blyskEl = document.createElement('div');
  _blyskEl.style.cssText = 'position:fixed;inset:0;z-index:8;pointer-events:none;opacity:0;' +
    'background:#fff;transition:opacity .28s ease-out';
  document.body.appendChild(_blyskEl);
  // WINIETA. Kadr jest jednakowo jasny od brzegu do brzegu, a przy 500 wrogach oko
  // nie ma się gdzie zaczepić. z-index 4 = PONIŻEJ HUD-u (5), więc przyciemnia
  // wyłącznie obraz 3D, a liczniki zostają ostre. Zero kosztu GPU — to jeden div.
  _winietaEl = document.createElement('div');
  _winietaEl.style.cssText = 'position:fixed;inset:0;z-index:4;pointer-events:none;opacity:0;' +
    'transition:opacity .6s;background:radial-gradient(ellipse at 50% 48%,transparent 42%,rgba(6,10,16,.52) 100%)';
  document.body.appendChild(_winietaEl);
  _pasyEl = document.createElement('div');
  _pasyEl.style.cssText = 'position:fixed;inset:0;z-index:8;pointer-events:none;opacity:0;' +
    'transition:opacity .3s;background:linear-gradient(#000 0 8%,transparent 8% 92%,#000 92% 100%)';
  document.body.appendChild(_pasyEl);
}
// krótki błysk na cały ekran: „coś się właśnie stało" bez ani jednej linii tekstu
function blysk(kolor = '#fff', moc = 0.35) {
  if (!_blyskEl) return;
  _blyskEl.style.background = kolor;
  _blyskEl.style.transition = 'none';
  _blyskEl.style.opacity = moc;
  requestAnimationFrame(() => {
    _blyskEl.style.transition = 'opacity .3s ease-out';
    _blyskEl.style.opacity = 0;
  });
}
const pasy = on => { if (_pasyEl) _pasyEl.style.opacity = on ? 1 : 0; };
const winieta = on => { if (_winietaEl) _winietaEl.style.opacity = on ? 1 : 0; };

function wejscieBossa() {
  const ov = document.getElementById('bossOv');
  // E1-bieg K8: napis przez napis() (jeden zegar chowania — cisza i faza 2 używają tego samego elementu)
  napis('DON CHIPSO<small>' + T('GŁOWA FAMIGLII', 'HEAD OF THE FAMIGLIA') + '</small><small>' + T('…Sama sól.', '…Just salt.') + '</small>', 1900);
  ov.classList.add('on');
  pasy(true);
  G.shake = Math.max(G.shake, 0.5);
  G.hitstop = Math.max(G.hitstop, 0.18);           // swiat na moment przystaje
  // KINO: kamera odjezdza i czas zwalnia na ~1.2 s. Dotad boss dostawal tylko
  // przyciemnienie i napis, wiec „wejscie" bylo informacja, a nie wydarzeniem.
  G.kino = 1.2;
  padWibruj(0.3, 800);                             // długo i słabo — pomruk, nie kopnięcie
  AUDIO.sfx('boss');
  AUDIO.event('boss');
  setTimeout(() => { ov.classList.remove('on'); pasy(false); }, 1500);
}
// E1-bieg K8: HP z odstępami tysięcy (4 200 000), wąska spacja nierozdzielająca
const fmtTys = n => String(Math.max(0, Math.ceil(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
function updateBossHp() {
  const el = document.getElementById('bossHp');
  // E1-bieg K7: pasek bierze Dona, a gdy go nie ma — kaprala (nazwa zamiast „DON CHIPSO", fiolet)
  let naj = null, kap = null, ile = 0;
  for (const e of G.enemies) {
    if (e.dying) continue;
    if (e.T.boss) { ile++; if (!naj || e.hp / e.maxHp < naj.hp / naj.maxHp) naj = e; }
    else if (e.kapral && !e.odwrot && (!kap || e.hp / e.maxHp < kap.hp / kap.maxHp)) kap = e;
  }
  const cel = naj || kap;
  if (!cel) {
    if (el.classList.contains('on')) { el.classList.remove('on'); document.getElementById('buff').style.top = ''; }
    return;
  }
  const bylo = el.classList.contains('on');
  el.classList.add('on');
  el.classList.toggle('kapral', !naj);
  el.classList.toggle('don', !!(naj && naj.don));
  const bw = el.querySelector('.bw');
  if (!bw.querySelector('.bk')) bw.insertAdjacentHTML('beforeend', '<i class="bk"></i>');   // kreska 50% = faza 2
  const k = Math.max(0, cel.hp / cel.maxHp);
  el.querySelector('.bf').style.width = (k * 100) + '%';
  el.querySelector('.bn').textContent = naj ? 'DON CHIPSO' + (ile > 1 ? '  x' + ile : '') : cel.kDef.nm.toUpperCase();
  el.querySelector('.bl').textContent = fmtTys(cel.hp) + ' / ' + fmtTys(cel.maxHp);
  // TOAST SPOD PASKA BOSSA. `#buff` i nazwa bossa nachodziły na siebie — „SERIA x12 —
  // MONETY x2" drukowało się NA „DON CHIPSO". Pozycję liczymy z realnego prostokąta,
  // bo pasek ma własną regułę @media dla niskich ekranów. POMIAR PO WPISANIU TEKSTÓW:
  // przy pustych `.bn`/`.bl` pasek miał 24 px zamiast 50 i toast lądował na „99 / 99"
  // (tester 18.09).
  if (!bylo) {
    const r = el.getBoundingClientRect();
    document.getElementById('buff').style.top = Math.round(r.bottom + 8) + 'px';
  }
}

// ============================== KETCHUPINO: ARTYLERIA ==============================
// Wg biblii postaci: „butelka ketchupu-artylerzysta. Trzyma dystans, pluje globami
// po łuku (telegraf: czerwony krąg na ziemi), kałuże slow 40% przez 4 s."
// To pierwszy wróg w grze, który atakuje na odległość — dotąd KAŻDY po prostu
// wbiegał w gracza, więc jedyną odpowiedzią na wszystko był ruch.
const KETCH_BLISKO = 9;         // bliżej = cofa się
const KETCH_DALEKO = 15;        // dalej = podchodzi; w środku stoi i pluje
const KETCH_CD = 3.0;           // co ile plunie
const KETCH_LOT = 1.05;         // s lotu globu — TO JEST TELEGRAF, gracz ma czas zejść
const KETCH_R = 2.5;            // promień plaśnięcia
const KETCH_KALUZA = 4.0;       // s życia kałuży (biblia: 4 s)
const KETCH_SLOW = 0.6;         // gracz w kałuży ×0.6 (biblia: slow 40%)
let ketchMat = null, ketchKalMat = null, ketchKragMat = null;
function ketchupTexture(kropla) {
  const S = 16, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const d = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - 7.5, dy = y - 7.5, r = Math.hypot(dx, dy * (kropla ? 0.78 : 1));
    let kol = null;
    if (r < 7.4) kol = r > 6.2 ? [120, 22, 20] : r > 3.4 ? [186, 42, 36] : [214, 74, 62];
    const i = (y * S + x) * 4;
    if (kol) { d.data[i] = kol[0]; d.data[i+1] = kol[1]; d.data[i+2] = kol[2]; d.data[i+3] = 255; }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// glob leci łukiem, a POD CELEM od razu rośnie czerwony krąg — telegraf jest
// tym, co zamienia atak dystansowy z „nagłej kary" w decyzję gracza.
// E1-bieg K7: `cx/cz` = własny cel (salwa Salsy Tripli), `dmg`/`zr` = obrażenia i źródło (domyślnie jak Ketchupino)
function plunKetchupem(e, celX = null, celZ = null, dmg = null, zr = 'ketchupino') {
  if (!ketchMat) {
    ketchMat = new THREE.MeshBasicMaterial({ map: ketchupTexture(true), transparent: true,
      alphaTest: 0.4, side: THREE.DoubleSide });
    ketchKalMat = new THREE.MeshBasicMaterial({ map: ketchupTexture(false), transparent: true,
      opacity: 0.5, depthWrite: false });
    // TELEGRAF TO OBWÓDKA, NIE PLAMA. Wypełniona plama przed uderzeniem wyglądała, jakby
    // ketchup już wylądował — plama pojawia się dopiero po plaśnięciu (uwaga właściciela).
    ketchKragMat = new THREE.MeshBasicMaterial({ map: ringTexture('rgba(232,64,52,0.95)'),
      transparent: true, depthWrite: false });
  }
  // celuje z WYPRZEDZENIEM w miejsce, gdzie gracz BĘDZIE — inaczej wystarczy iść prosto
  const cx = celX != null ? celX : P.pos.x + P.vx * KETCH_LOT * 0.55;
  const cz = celZ != null ? celZ : P.pos.z + P.vz * KETCH_LOT * 0.55;
  const wylot = e.ty + 1.7;                        // glob wychodzi z góry butli, nie z jej stóp
  const glob = new THREE.Mesh(unitGeo, ketchMat);
  glob.scale.setScalar(0.55);
  glob.position.set(e.pos.x, wylot, e.pos.z);
  scene.add(glob);
  const krag = new THREE.Mesh(blobGeo, ketchKragMat);
  krag.scale.set(KETCH_R * 2, 1, KETCH_R * 2);
  krag.position.set(cx, terrainH(cx, cz) + 0.05, cz);
  scene.add(krag);
  e.bb.play('punch', false);                       // wyciska się, żeby plunąć
  G.gluty.push({ mesh: glob, krag, t: 0, from: { x: e.pos.x, y: wylot, z: e.pos.z },
                 to: { x: cx, z: cz }, dmg, zr });
  AUDIO.sfx('strzal');
}
function updateGluty(dt) {
  for (let i = G.gluty.length - 1; i >= 0; i--) {
    const gl = G.gluty[i];
    gl.t += dt;
    const k = Math.min(1, gl.t / KETCH_LOT);
    const x = gl.from.x + (gl.to.x - gl.from.x) * k, z = gl.from.z + (gl.to.z - gl.from.z) * k;
    gl.mesh.position.set(x, gl.from.y + Math.sin(k * Math.PI) * 3.4
      + (terrainH(x, z) + 0.4 - gl.from.y) * k, z);
    gl.mesh.rotation.set(0, camYaw, gl.t * 6);
    // obwódka ZACISKA SIĘ do miejsca uderzenia i pulsuje — czyta się jako „tu spadnie",
    // a nie jako „tu już leży ketchup"
    const rk = KETCH_R * 2 * (1.35 - 0.35 * k);
    gl.krag.scale.set(rk, 1, rk);
    if (k < 1) continue;
    // PLAŚNIĘCIE
    scene.remove(gl.mesh);
    scene.remove(gl.krag);
    G.gluty.splice(i, 1);
    okruchy(gl.to.x, terrainH(gl.to.x, gl.to.z) + 0.4, gl.to.z, 0xba2a24, 7);
    AUDIO.sfx('wybuch');
    if (Math.hypot(P.pos.x - gl.to.x, P.pos.z - gl.to.z) < KETCH_R)
      ranGracza(gl.dmg != null ? gl.dmg : obrazeniaWroga(1), gl.zr || 'ketchupino', { shake: 0.3 });
    G.kaluze.push({ x: gl.to.x, z: gl.to.z, r: KETCH_R, t: KETCH_KALUZA,
                    mesh: (() => { const m = new THREE.Mesh(blobGeo, ketchKalMat.clone());
                      m.scale.set(KETCH_R * 2, 1, KETCH_R * 2);
                      m.position.set(gl.to.x, terrainH(gl.to.x, gl.to.z) + 0.04, gl.to.z);
                      scene.add(m); return m; })() });
  }
}
function updateKaluze(dt) {
  for (let i = G.kaluze.length - 1; i >= 0; i--) {
    const k = G.kaluze[i];
    k.t -= dt;
    // max 0.5, nie 0.8: kilka nachodzących kałuż dawało niemal jednolitą czerwień
    // i nie było widać pod nimi terenu ani wrogów
    k.mesh.material.opacity = Math.min(0.5, k.t * 0.35);
    if (k.t <= 0) { scene.remove(k.mesh); k.mesh.material.dispose(); G.kaluze.splice(i, 1); }
  }
}
// czy gracz stoi w ketchupie (spowolnienie z biblii: 40%)
function wKetchupie(x, z) {
  for (const k of G.kaluze) if (Math.hypot(x - k.x, z - k.z) < k.r) return true;
  return false;
}

// ============================== WROGOWIE ==============================
// nm/ds = wpis do BESTIARIUSZA (odblokowywany po pierwszym zabiciu danego typu)
const ENEMY_TYPES = {
  // ===== LA FAMIGLIA SNACKONI (wg biblii v1.1; HP/3.5, speed×2.5) =====
  chipsetti: { hp: 3, okrKol: 0xf2c14a, speed: 2.75, dmg: 1, scale: 0.85, xp: 1, walk: 'run', char: 'chipsetti_soldatetti',
    nm: 'Chipsetti Soldatetti',
    ds: T('Szeregowy Famiglii — wymięty chips z ambicjami. Atakuje wyłącznie w rojach, bo w pojedynkę jest tylko okruchem. Łamie się efektownie i to jego jedyny talent.',
          'Famiglia footsoldier — a crumpled chip with ambitions. Attacks in swarms only, because alone he is just a crumb. He shatters beautifully, and that is his entire talent.'),
    lore: T('W planie Dona jest mięsem armatnim: ma zasypać Grządkowo solą, jeden okruch na raz.',
            "In the Don's plan he is cannon fodder: bury the Blockyard in salt, one crumb at a time.") },
  marshmallini: { hp: 8, okrKol: 0xfff2f6, speed: 1.75, dmg: 1, scale: 1.0, xp: 2, walk: 'run', char: 'marshmallini_fluffini',
    dzieli: true, bigXp: true,
    nm: 'Marshmallini Fluffini',
    ds: T('Gąbczasty bandzior o konsystencji poduszki. Powolny i miękki, ale gdy go rozwalisz, robią się z niego DWA mniejsze problemy. Fizyka pianki, logika hydry.',
          'A spongy thug with the consistency of a pillow. Slow and soft, but split him open and you get TWO smaller problems. Marshmallow physics, hydra logic.'),
    lore: T('Odpowiada w rodzinie za cukier: im mocniej go rozganiasz, tym więcej cukru zostaje na grządkach.',
            'He runs the sugar side of the family: the harder you scatter him, the more sugar stays on the beds.') },
  gummini: { hp: 4, okrKol: 0xe04a3c, speed: 3.0, dmg: 1, scale: 0.9, xp: 1, walk: 'run', char: 'gummini_bouncini',
    skacze: true, bezKb: true,
    nm: 'Gummini Bouncini',
    ds: T('Żelkowy miś, który nie chodzi — on się odbija. Nie da się go odepchnąć, bo cała jego istota to sprężyna. Galaretowaty, uparty i lepki jak wyrzut sumienia.',
          'A gummy bear that does not walk — it bounces. You cannot knock it back, because it is a spring all the way through. Wobbly, stubborn and sticky as a guilty conscience.'),
    lore: T('Famiglia wysyła go przodem, żeby rozklepał grządki na płasko pod przyszły automat.',
            'The Famiglia sends him ahead to bounce the vegetable beds flat for the future vending machine.') },
  friesetti: { hp: 4, okrKol: 0xf6cd51, speed: 4.0, dmg: 1, scale: 0.95, xp: 2, walk: 'run', char: 'friesetti_spearetti',
    bigXp: true, szarzuje: true,                   // telegraf 0.6 s → szarża ×3 → ogłuszenie (patrz FRIES_*)
    nm: 'Friesetti Spearetti',
    ds: T('Frytka-włócznik, szarżuje w porcjach po pięć. Chuda, długa i boleśnie szybka. Zostawia za sobą smugę soli i poczucie, że to była zła decyzja.',
          'A spear-carrying fry that charges in portions of five. Thin, long and painfully fast. Leaves behind a trail of salt and the feeling that this was a bad decision.'),
    lore: T('Wytycza solny szlak od warzywniaka Nonny do bramy osiedla — porcja po porcji.',
            "Portion by portion he marks out the salt route from Nonna's greengrocer to the estate gate.") },
  sodino: { hp: 6, okrKol: 0x7a4426, speed: 2.5, dmg: 1, scale: 0.95, xp: 2, walk: 'run', char: 'sodino_explodino',
    kamikaze: true, bigXp: true,
    nm: 'Sodino Explodino',
    ds: T('Wstrząśnięta puszka z zapłonem zamiast rozumu. Syczy, biegnie i wybucha — w tej kolejności, zawsze. Po nim zostaje kałuża coli i cisza.',
          'A shaken can with a fuse where its brain should be. Hisses, runs, explodes — in that order, every time. He leaves a puddle of cola and a silence.'),
    lore: T('Jego zadanie w planie to zalać osiedle colą. Dosłownie, raz — i już go nie ma.',
            'His part of the plan is to flood the estate with cola. Literally, once — and then he is gone.') },
  lollini: { hp: 17, okrKol: 0xff6fa5, speed: 1.25, dmg: 2, scale: 1.35, xp: 4, walk: 'run', char: 'lollini_spinnini',
    wiruje: true, bigXp: true,
    nm: 'Lollini Spinnini',
    ds: T('Wielki lizak na patyku, który obraca się jak tarcza pilarska. Wolny jak niedziela, ale kto podejdzie za blisko, ten poznaje smak wiśniowej przemocy.',
          'A big lollipop on a stick that spins like a saw blade. Slow as a Sunday, but step too close and you learn the taste of cherry-flavoured violence.'),
    lore: T('Pilnuje placu wyznaczonego pod automat: kręci się w kółko i nie wpuszcza tam żadnego warzywa.',
            'He guards the plot marked out for the vending machine: spins on the spot and lets no vegetable in.') },
  // ===== BOSS: DON CHIPSO (wg biblii — torba chipsów; do czasu własnego sprite'a
  //          używamy powiększonego Chipsettiego, bo to ten sam „materiał") =====
  // WLASNY ARKUSZ (13.08): worek chipsow w fedorze i plaszczu. Do tej pory boss byl
  // dosłownie tym samym plikiem co szeregowy Chipsetti, tylko rozciagnietym x2.7 —
  // czyli obok biegalo 200 identycznych kopii „bossa". Skala zeszla z 2.7 na 2.1,
  // bo teraz rysunek sam niesie powage i nie trzeba jej udawac rozmiarem.
  // ELITA-ARTYLERZYSTA wg biblii (HP 220 w skali biblii = 63 w silniku; ZBITE DO 26,
  // bo pierwszy wróg dystansowy przy 63 HP byłby mini-bossem, a gracz nie ma jeszcze
  // żadnej odpowiedzi na atak z 15 j.). Pojawia się od 3. minuty, rzadko.
  // scale 1.7 (Chipsetti ma 0.85): WYSTAJE NAD TŁUM. Ta sama zasada co przy
  // Sokowirówce — byt, który zmienia sposób gry, musi być widoczny w kupie wrogów.
  ketchupino: { hp: 26, okrKol: 0xd23b3b, speed: 1.9, dmg: 1, scale: 1.7, xp: 8, walk: 'run',
    char: 'ketchupino_splatterino', artyleria: true,
    nm: 'Ketchupino Splatterino',
    ds: T('Butla ketchupu, która nauczyła się moździerza. Nie podejdzie — nie musi. Ściska sobie brzuch i pluje po łuku, a to, co po nim zostaje, trzyma za nogi lepiej niż rozlana woda.',
          'A ketchup bottle that taught itself mortar fire. It will not close in — it does not have to. It squeezes its own belly and lobs, and what it leaves behind grabs your feet better than spilled water.'),
    lore: T('Ostrzeliwuje ogródki z dystansu, żeby pod nowy automat nic już nie odrosło.',
            'He shells the gardens from a distance so nothing grows back where the new machine is going.') },
  // TEMPO 2.2 -> 4.4 (decyzja wlasciciela 13.08): Don Chipso ma IsC NA PRZODZIE HORDY.
  // 4.4 stawia go nad najszybszym szeregowym (Friesetti 4.0), wiec wychodzi z tlumu
  // i widac, ze to on prowadzi atak. Gracz ma 7.13 (Carrotello), czyli da sie od niego
  // odejsc — ale nie da sie go zignorowac. Zglaszam kompromis: ciezki boss, ktory
  // jest zwinniejszy od calej hordy, jest mniej „ciezki" w odczuciu; wlasciciel
  // wybral czytelnosc roli („to on tu rzadzi") i to ona wygrywa.
  boss: { hp: 90, okrKol: 0xf2c14a, speed: 4.4, dmg: 2, scale: 2.1, xp: 25, walk: 'run',
    char: 'don_chipso', boss: true,
    nm: 'Don Chipso',
    ds: T('Głowa Famiglii. Mówi szeptem, bo kto ma sól, nie musi krzyczeć. Wymięty jak jego sumienie, tłusty jak jego interesy. Osiedle traktuje jak talerz: co na nim leży, uważa za swoje.',
          'Head of the Famiglia. He whispers, because a man with salt never has to shout. Crumpled like his conscience, greasy like his business. He treats the estate as a plate: whatever lies on it, he considers his.'),
    lore: T('Plan jest jego: zasypać Osiedle Grządkowo solą i cukrem, a w miejscu warzywniaka Nonny postawić automat z przekąskami.',
            "The plan is his: bury the Blockyard in salt and sugar, and stand a snack machine where Nonna's greengrocer is.") },
};

let eliteRingMat = null;
// (E1-bieg: „poziom zagrożenia" co minutę usunięty; pasek Wieczoru też — decyzja właściciela 24.09)
// KLĄTWA: kupione poziomy podnoszą HP wrogów i zagęszczają spawn, a w zamian
// mnożą monety (patrz `monetyMul`). Świadomie kupowana trudność.
const klatwa = () => META.up.klatwa || 0;
const monetyMul = () => (1 + 0.20 * klatwa()) * (G.buff.key === 'kasa' ? 2 : 1);
// E1-bieg K2: PŁYNNA TRUDNOŚĆ (spec 07 §5) zamiast schodków obrażeń 1 / 2 / 3 (skok ×2 w 5:30
// i ×3 w 10:00). `L` = mnożniki łagodnego pierwszego biegu (K10; w normalnym = wartości poniżej).
// hpScale: 1:00 1,47 · 5:00 3,88 · 10:00 8,00 (dawniej 1,61 / 5,25 / 12,5) — niżej późno, bo nowa
// krzywa XP daje mniej poziomów; resztę trudności niosą skład, ściany i obrażenia (dmgMul).
const L_BIEG = { hp: 1, spd: 0.035, dmgA: 0.06, dmgB: 0.004, elita: 1, tempo: 1 };
const L_NORMALNY = { ...L_BIEG };                  // E1-bieg K10: newGame przywraca te wartości w normalnym biegu
// K10: mnożnik łagodnego biegu dla pola `k` z CFG_BIEG.trybLagodny (1 w normalnym biegu)
const lag = k => G.lagodny ? CFG_BIEG.trybLagodny[k] : 1;
// ZALEW (29.09 wieczór): × zalew().hp.zwykly (v2 ×2) — zwykli, potomki, Chiamata i regał (8 × hpScale) razem; elity w spawnEnemy
const hpScale = (t = G.time) => { const m = t / 60; return (1 + 0.45 * m + 0.025 * m * m) * (1 + 0.10 * klatwa()) * L_BIEG.hp * rozgrz('hp', t) * zalew().hp.zwykly; };
const spdScale = () => Math.min(1.5, 1 + L_BIEG.spd * G.time / 60);
// mnożnik obrażeń wrogów: 5:00 ×1,40 · 10:00 ×2,00 — od 25.09 TYLKO w ciosach w Sokowirówkę (gracz: 1 cios = 1 serce)
const dmgMul = () => { const m = G.time / 60; return (1 + L_BIEG.dmgA * m + L_BIEG.dmgB * m * m) * rozgrz('dmg'); };
// szansa elity: 1:00 6,2% · 5:00 11% · 10:00 17% (dawniej 7,5 / 13,5 / 21%)
const szansaElity = () => G.time < 60 ? 0 : (0.05 + 0.012 * G.time / 60) * L_BIEG.elita * rozgrz('elita');
// E1-bieg ROZGRZEWKA (24.09, szybkie złagodzenie — decyzja właściciela; pełne strojenie w K10/K11):
// mnożnik rośnie liniowo od CFG_BIEG.rozgrzewka[k] w 0:00 do 1 w `do` (3:00) — po nim formuły §5 bez zmian.
function rozgrz(k, t = G.time) {
  const R = G.rozgrzR || CFG_BIEG.rozgrzewka;      // K10: łagodny bieg ma własną (dłuższą) rozgrzewkę — newGame
  if (!R || R[k] == null || t >= R.do) return 1;
  return R[k] + (1 - R[k]) * Math.pow(Math.max(0, t) / R.do, R.wykl || 1);   // wykl > 1 = dłużej nisko
}
// mnożnik liczebności (łagodny bieg × rozgrzewka): `co` = 'tempo' (spawner), 'podloga', 'zdarzenia'
// (obręcze, pierścienie, ściany, rój) — osobno, żeby rozgrzewka nie zostawiała pustej łąki
const mnFali = (t = G.time, co = 'tempo') => CFG_BIEG.lagodny.tempo * rozgrz(co, t);

// ---- SZARŻA FRIESETTIEGO (biblia: „szarżują w liniach, telegraf 0.6 s") ----
// Okno startu 8-12 j.: bliżej nie ma czasu na tell, dalej szarża 12 j. (4.0 × 3 × 1 s)
// nie dobiegłaby. Cykl tell+szarża+ogłuszenie = 2.8 s pokrywa 12 j., marsz 4.0 × 2.8 = 11.2 j.
// — tempo dochodzenia bez zmian, ale w postaci JEDNEGO czytelnego ataku do uniknięcia.
const FRIES_MIN = 8, FRIES_MAX = 12;
const FRIES_TELEGRAF = 0.6, FRIES_CZAS = 1.0, FRIES_MNOZNIK = 3, FRIES_OGLUSZENIE = 1.2, FRIES_CD = 3.5;
// ---- TARCZA PILARSKA LOLLINIEGO: w fazie wirowania bije 0.9 j. dalej i ODRZUCA gracza ----
const LOLLINI_TARCZA = 0.9, LOLLINI_ODRZUT = 10;   // 10 j./s z tłumieniem 7/s ≈ 1.4 j. odrzutu

// `mozeElita = false` — potomki Marshmalliniego: elita to 6× HP i 12 monet, a mini
// dostawało HP malucha z flagą elity (najszybsza kasa w grze, audyt 13.08).
// E1-bieg: `opcje = { elita: 'los'|'tak'|'nie', r: [min, max], kapral: null }` zastępuje `mozeElita`
// (stare `false` = { elita: 'nie' }). Domyślny promień = pierścień SPAWN_R tuż za kadrem (dawniej 34–44).
function spawnEnemy(type, angle = null, przy = null, opcje = {}) {
  if (opcje === false) opcje = { elita: 'nie' };
  const T = ENEMY_TYPES[type];
  const a = angle === null ? Math.random() * Math.PI * 2 : angle;
  const [r0, r1] = opcje.r || spawnR();
  let r = r0 + Math.random() * (r1 - r0);
  if (!opcje.r) r = rZaKadrem(a, r);
  const hpMul = hpScale();
  const el = opcje.elita || 'los';
  const elite = el === 'tak' || (el === 'los' && !T.boss && Math.random() < szansaElity());
  const mnEl = elite ? 6 * zalew().hp.elita / zalew().hp.zwykly : 1;   // ZALEW: elita ×1,5 (nie ×2 jak zwykli)
  const e = {
    type, T, elite,
    pos: przy ? new THREE.Vector3(przy.x, 0, przy.z)
              : new THREE.Vector3(P.pos.x + Math.sin(a) * r, 0, P.pos.z + Math.cos(a) * r),
    // Boss dotad NIE skalowal sie wcale: w 20. minucie mial 90 HP, gdy szeregowy
    // mial 108, a elita 648. Teraz rosnie jak wszyscy (bez mnoznika elity).
    hp: T.hp * SKALA_WROGA * hpMul * mnEl,
    // `maxHp` NIE ISTNIALO na wrogach — pasek HP bossa liczyl „100 / NaN".
    // Ustawiamy je od razu przy spawnie: potrzebne do kazdego paska i do procentow.
    maxHp: T.hp * SKALA_WROGA * hpMul * mnEl,
    dying: false, hitCd: 0, kb: new THREE.Vector3(), orbCd: 0, climbing: false,
    ty: 0, vy: 0, jumpCd: 1 + Math.random() * 3, faza: Math.random() * 6.28,
    bb: new Billboard(T.char || type, T.scale * (elite ? 1.45 : 1) * (opcje.skala || 1), false, true),   // true = instancja (E1); skala: kapral ×1,9
  };
  if (MAPS[mapKey].osiedle) osPoprawPunkt(e.pos);   // osiedle: nigdy w bryle bloku/garażu (pierścienie, ściany, paczki)
  else if (MAPS[mapKey].indoor) mkPoprawPunkt(e.pos);   // market: nie w regale / na palecie
  e.ty = terrainH(e.pos.x, e.pos.z);
  if (elite) {                              // fioletowa obwódka pod elitą (instancja w `pulaKrag`, poza sceną)
    e.ring = new THREE.Object3D();
    e.ring.scale.set(1.8, 1, 1.8);
  }
  e.bb.play(T.walk);
  // od razu na miejsce: potomek Marshmalliniego (spawn po pętli wrogów) stał przez
  // klatkę w (0,0,0) świata, zanim pętla zdążyła go ustawić
  e.bb.update(0, e.pos, e.ty);
  if (e.ring) e.ring.position.set(e.pos.x, e.ty + 0.06, e.pos.z);
  G.enemies.push(e);
  if (G.zrodzeni) G.zrodzeni[type] = (G.zrodzeni[type] || 0) + 1;   // E3: HORDA.mapaStat (realne udziały po limitach)
  return e;
}

function killEnemy(e, i) {
  if (e.dying) return;                             // strażnik: drugie wywołanie na tym
  G.kills++;                                       // samym wrogu powtarzało drop i podział
  // Friesetti zabity w przysiadzie (tell) albo Lollini w ścisku wirowania: przywróć
  // skalę sprite'a, bo animacja śmierci klonuje ją jako bazę (recenzja 03.09)
  // E1-bieg K7: to samo dla kaprali (Frittone w przysiadzie, Botto spuchnięty na lontcie, Girandola w wirze)
  // i Sodino z lontem; Gommone zabity w locie spada na ziemię, zamiast umierać w powietrzu
  if (e.faz || e.T.wiruje || e.kapral || e.zapalony) e.bb.mesh.scale.set(e.bb.h, e.bb.h, 1);
  if (e.kapral && e.lot) { e.lot = false; e.ty = terrainH(e.pos.x, e.pos.z); }
  document.getElementById('kills').innerHTML = ico('czaszka', 15) + ' ' + G.kills;
  // ---- BESTIARIUSZ: licznik zabitych per typ (zostaje na stałe w META) ----
  const pierwszyRaz = !META.bestiary[e.type];
  META.bestiary[e.type] = (META.bestiary[e.type] || 0) + 1;
  if (pierwszyRaz) {
    saveMeta();                                    // odblokowanie zapisujemy od razu
    toastBuff(T('NOWY WPIS W ENCYKLOPEDII: ', 'NEW BESTIARY ENTRY: ') + (e.T.nm || e.type));
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2600);
  } else saveMetaSoon();
  // ŁĄCZNY LICZNIK ZABÓJSTW liczymy TUTAJ, nie w `gameOver()` — inaczej wyjście
  // do menu z pauzy kasowało cały bieg, a na tym liczniku wisi odblokowanie postaci.
  META.st.kills++;
  sprawdzOdblokowaniaPostaci();
  G.rangaKille++;
  sprawdzRange();
  // KILL + combo (kille w oknie 1.3 s nabijają serię)
  G.streak = (G.time - G.streakT < 1.3) ? G.streak + 1 : 1;
  G.streakT = G.time;
  if (G.streak === 12 || G.streak === 30) toastBuff(T('SERIA x', 'STREAK x') + G.streak + '!');   // B8: seria już nie mnoży monet (plan §6.2)
  // ZGLOSZENIE WLASCICIELA: „ekran czasem sie za mocno trzesie". To bylo TU —
  // trzesienie odpalalo sie przy KAZDYM zabojstwie i rosło z seria do 0.5, a przy
  // 500 wrogach zabojstwa sa co klatke, wiec kamera nigdy nie wracala do spokoju.
  // Zostaje odczucie serii, znika ciagly jitter.
  G.shake = Math.max(G.shake, Math.min(0.18, 0.05 + G.streak * 0.008));
  AUDIO.sfx(e.T.boss ? 'bossdown' : 'kill', { seria: G.streak });   // ton rośnie z serią
  AUDIO.seria(G.streak);                           // przy dużej serii postać się odezwie (rzadko)
  if (e.T.boss) { dmgPop(e.pos.x, e.ty + 1.2, e.pos.z, 'BOSS DOWN!', '#ff5555', 2.6, 'wazny'); META.st.bosses++; saveMeta();
    // muzyka bossa wraca do utworu z biegu dopiero, gdy padnie OSTATNI boss (Don: cisza zwycięstwa, patrz zwyciestwo)
    if (!e.don && !G.enemies.some(o => o !== e && o.T.boss && !o.dying)) AUDIO.bossOff();
  }
  else if (e.kapral) { /* napis „PINIATA!" robi nagrodaKaprala */ }
  else if (e.elite) { dmgPop(e.pos.x, e.ty + 0.8, e.pos.z, T('ELITA!', 'ELITE!'), '#c07bff', 1.9); padWibruj(0.55, 90); }
  // przy serii sam mnożnik wystarcza — słowo „KILL" tylko rozciągało napis na pół ekranu
  else dmgPop(e.pos.x, e.ty + 0.5, e.pos.z, G.streak > 1 ? 'x' + G.streak : 'KILL',
    '#ff6a5e', Math.min(1.0 + G.streak * 0.08, 1.6), 'kill');   // w tłoku jak drobny — nie wypycha ważnych
  // E1-bieg K7/K8: kapral = PINIATA (własna nagroda), Don = ZWYCIĘSTWO — bez zwykłych dropów i podziału
  if (e.kapral) nagrodaKaprala(e);
  else if (e.don) zwyciestwo(e);
  else killEnemyDropy(e);
  if (e.ring) { scene.remove(e.ring); e.ring = null; }
  e.ring2 = null;
  if (e.T.death && LIB[e.T.char || e.type].anims[e.T.death]) {
    e.dying = true; e.bb.play(e.T.death, false);
  } else {
    startRozpad(e);                                // brak arkusza `death` → śmierć z kodu
  }
}
const monetyHordy = () => { const M = CFG_BIEG.monety; return G.time <= M.od ? 1 : Math.pow(M.od / G.time, M.wykl); };
function killEnemyDropy(e) {
  // XP: nie każdy dropi — duzi zawsze, mali 65% (za to szybciej ich kosisz)
  const dropXp = e.T.boss || e.elite || e.T.bigXp || Math.random() < 0.65;
  if (dropXp) {
    const xpTotal = e.T.xp * (e.elite ? 4 : 1);
    const n = e.T.boss ? 10 : (e.elite ? 3 : 1);
    for (let k = 0; k < n; k++) {
      G.gems.push(makeGem(e.pos.x + (Math.random() - .5) * 1.5, e.pos.z + (Math.random() - .5) * 1.5, xpTotal / n));
    }
  }
  // MONETY. Zmierzone: przy starych stawkach zabijanie hordy dawało tylko 14%
  // dochodu (elity 34%, skrzynie 20%) — czyli najmniej płaciła czynność, którą
  // gracz faktycznie wykonuje. Stawki w górę, a elita/boss dostają JEDNĄ monetę
  // o dużej wartości zamiast garści (mniej śmieci na ekranie przy 500 wrogach).
  // (Dawny mnożnik serii ×2/×3 na monetach usunięty w B8 — patrz niżej.)
  // B8 (28.09, przed demo): seria NIE mnoży już monet (plan §6.2 — tylko napis), elita 4 → 1, a od 4:00 szansa
  // monety z hordy maleje (monetyHordy) — przy 400 żywych zabójstwa idą setkami na minutę i to one dawały 20–34 tys.
  // za wygraną. Główne monety biegu: kaprale, Don, wygrana ×1,5. Pomiar: INFO-PROJEKT (tabela przed/po B8).
  const M = CFG_BIEG.monety, szansa = monetyHordy();
  const wyplac = (n, val, rozrzut = 0) => {
    for (let k = 0; k < n; k++)
      G.coins.push(makeCoin(e.pos.x + (Math.random() - .5) * rozrzut,
                            e.pos.z + (Math.random() - .5) * rozrzut, val));
  };
  if (e.T.boss) wyplac(3, 10, 2.5);
  else if (e.rodzina) { /* E1-bieg: „RODZINA" (7:00) daje XP, nie daje monet (plan §6.2) */ }
  else if (e.elite) { if (Math.random() < szansa) wyplac(1, M.elita); }
  else if (Math.random() < M.zwykly * szansa) wyplac(1, 1);
  // serca: elity 30%, boss zawsze 2
  // SERCA SA RZADKIE (zyczenie wlasciciela). Bylo: boss zawsze 2, elita 30%.
  // Przy udziale elit rosnacym o 1.5%/min (14% w 5. min, 21% w 10.) leczenie sypalo
  // sie tak gestio, ze utrata serca przestawala cokolwiek znaczyc — a to ona jest
  // jedyna realna kara w tej grze. Teraz: boss 1 (drugie tylko gdy naprawde boli),
  // elita 8%. EKONOMIA (29.09): w normalnym biegu jeszcze × trudn().ekon — elita 4% → 2%, boss/kapral 1 (+1) → 0,5 (+0,5).
  // (Gałąź `e.T.boss` dziś martwa: jedyny boss to Don, a on idzie przez zwyciestwo() — zostaje spójna z kapralem.)
  if (e.T.boss) {
    // GWARANTOWANA NAGRODA: dotad boss placil mniej niz zwykla skrzynia, wiec zabicie
    // najtwardszego przeciwnika w grze bylo slabsza nagroda niz podejscie do pudelka.
    wchest.wait = Math.min(wchest.wait, 0.4);      // zlota skrzynia (bron) prawie natychmiast
    const nS = ileLos((1 + (P.hp <= P.maxHp * (G.lagodny ? CFG_BIEG.trybLagodny.litosc : CFG_BIEG.litosc) ? 1 : 0)) * ekonBieg('serceKapral'));
    for (let k = 0; k < nS; k++) G.hps.push(makeHeart(e.pos.x + k * 0.8, e.pos.z));   // litosc przy 1/3 zycia (łagodny: 1/2)
  } else if (e.elite && Math.random() < (G.lagodny ? CFG_BIEG.trybLagodny.serceElity : CFG_BIEG.serceElity * ekon('serceElity'))) G.hps.push(makeHeart(e.pos.x, e.pos.z));
  // Marshmallini po śmierci DZIELI SIĘ na dwa mniejsze (wg biblii)
  // E1-bieg: podział może wejść w rezerwę skryptu (do MAX_WROGOW), nigdy wyżej — wtedy zamiast
  // potomków 2 pigułki XP po 2 (twardy warunek: żywych nigdy > MAX_WROGOW)
  if (e.T.dzieli && !e.mini && liczZywych() >= MAX_WROGOW) {   // e jeszcze żyje: po podziale +1
    for (const bok of [-1, 1]) G.gems.push(makeGem(e.pos.x + bok * 0.8, e.pos.z, 2));
  } else if (e.T.dzieli && !e.mini) {
    // E1-bieg (24.09): potomki PROSTOPADLE do kierunku na gracza i co najmniej ~1,8 j. od niego, z krótkim
    // ogłuszeniem. Dawniej ±0,8 j. wzdłuż osi X świata — przy zabiciu z bliska (Czosnek, Tupnięcie) jeden
    // potomek lądował w zasięgu kontaktu (0,9 j.) i bił od razu: bot miał 55–70% obrażeń od Marshmalliniego
    // przy 15–25% udziału w spawnie (kryterium §10.3 nr 12: żadne źródło > 50%).
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, dl = Math.hypot(dx, dz) || 1;
    const ux = dx / dl, uz = dz / dl, odsun = Math.max(0, 1.8 - dl);
    for (const bok of [-1, 1]) {
      // `false` = potomek NIGDY nie jest elitą (miał HP malucha, a płacił 12 monet + XP ×4)
      const m = spawnEnemy(e.type, null, { x: e.pos.x - uz * bok * 0.8 + ux * odsun, z: e.pos.z + ux * bok * 0.8 + uz * odsun }, false);
      if (m) { m.mini = true; m.stun = 0.3; m.hp = m.maxHp = e.T.hp * 0.5 * SKALA_WROGA * hpScale(); m.bb.mesh.scale.multiplyScalar(0.62);
               if (e.odwrot) m.odwrot = true; }       // K8: potomek uciekającego w ciszy też ucieka (nie gryzie przy 9:56)
    }
  }
}

// ============================== E1-bieg: WIECZÓR — SPAWNER, FALE, ZDARZENIA (spec 07 §0.1, §1) ==============================
const MAX_WROGOW = 500;          // budżet wydajności (instancing v192: Nord 54–61 FPS). JEDYNE miejsce limitu
const REZERWA_SKRYPT = 30;       // miejsca tylko dla kaprali, Dona, La Chiamaty i podziałów Marshmalliniego
const LIMIT_SPAWNERA = MAX_WROGOW - REZERWA_SKRYPT;   // 470 — spawner, ściany i pierścienie nie wchodzą wyżej
const SKALA_GESTOSCI = MAX_WROGOW / 500;              // tabela fal jest napisana dla 500
const SPAWN_R = { tel: [24, 30], pc: [30, 38] };      // pierścień spawnu tuż za kadrem (dawniej 34–44)
const RECYKL_R = 46;             // dalej = przenieś przed gracza
const CZAS_WIECZORU = 600;       // 10:00 — Don (K8)
const CISZA_OD = 592;            // 9:52 — 8 s ciszy
// telefon poziomo ma CAM_DIST 3.6 (kadr ~24 j.), desktop 6.8 — patrz fitCamera
const spawnR = () => CAM_DIST < 5 ? SPAWN_R.tel : SPAWN_R.pc;
// Decyzja K1: kamera jest nisko, więc PRZED nią widać ziemię aż po horyzont — wróg z r 24–30 na wprost
// „wyrasta" w kadrze (zrzut: widać nawet r 38). W stożku kadru przed kamerą zwykły spawn idzie 8 j. dalej
// (mała sylwetka przy horyzoncie, pod rzędem serc); boki i tył zostają na SPAWN_R jak w spec.
// Stożek = POZIOME pół-pole widzenia z camera.fov i camera.aspect + zapas 0,2 rad (szerokość sylwetki).
// Dawniej stałe ±40° — telefon poziomo (aspect ~2,2, fov 60) widzi ±52°, więc wrogowie wyrastali na
// bokach kadru. Kąt liczony od gracza, a kamera stoi ZA nim — od kamery ten sam wróg jest bliżej osi,
// więc próg z pola widzenia kamery jest po bezpiecznej stronie.
function rZaKadrem(a, r) {
  const d = Math.abs(((a - katKamery()) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  const polPoziom = Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
  return d < polPoziom + 0.2 ? r + 8 : r;
}
// WSZYSTKIE LICZBY WIECZORU W JEDNYM OBIEKCIE (DEV: HORDA.cfg — strojenie bez przeładowania)
// UWAGA (29.09): fale, rozgrzewka, xpPigulki, serceElity, litosc, nietyk, ketchup, ketchupMap i część trybLagodny
// NADPISUJE preset CFG_TRUDNOSC (za tym obiektem) — wartości tutaj to v1 (stan E1/E2), aktywne są v2.
const CFG_BIEG = {
  // [start okna s, tempo wr/s, paczka, podłoga żywych] — tempo i podłoga interpolowane liniowo między oknami
  fale: [[0, 1.2, 3, 10], [30, 2.0, 5, 15], [60, 3.0, 5, 20], [90, 3.8, 5, 25], [120, 5.0, 6, 35],
         [150, 6.0, 6, 40], [180, 7.5, 7, 50], [210, 9.5, 8, 65], [240, 13.0, 10, 85], [270, 14.5, 10, 95],
         [300, 17.0, 11, 110], [330, 19.0, 12, 125], [360, 21.0, 12, 140], [390, 23.0, 13, 150],
         [420, 25.0, 14, 165], [450, 27.0, 14, 180], [480, 29.0, 15, 190], [510, 31.0, 15, 320],
         [540, 34.0, 16, 420], [570, 37.0, 16, 440]],  // K11: podłoga w 8:30/9:00/9:30 205/225/245 → 320/420/440 (kryt. 1: ≥ 85%
                                                       // limitu); liniowo między oknami, więc rośnie już od 8:00 (190 → 320 w 8:30)
  naplyw: { od: 240, do: 260, mn: 1.35 },          // 4:00 NAPŁYW
  szturm: { od: 570, do: CISZA_OD, mn: 1.5 },      // 9:30 OSTATNI SZTURM
  // udziały w spawnie (%): [od s, chipsetti, marshmallini, gummini, friesetti (porcje 5), sodino, lollini]
  pula: [[0, 100, 0, 0, 0, 0, 0], [60, 85, 15, 0, 0, 0, 0], [90, 75, 25, 0, 0, 0, 0], [120, 60, 20, 20, 0, 0, 0],
         [150, 55, 20, 25, 0, 0, 0], [180, 50, 20, 30, 0, 0, 0], [210, 45, 15, 25, 15, 0, 0],
         [240, 40, 15, 20, 15, 10, 0], [300, 38, 14, 18, 14, 10, 6], [330, 36, 14, 18, 14, 10, 8],
         [360, 35, 13, 17, 15, 11, 9], [420, 34, 12, 17, 16, 11, 10], [480, 33, 12, 16, 16, 12, 11],
         [540, 32, 12, 16, 16, 12, 12]],
  limity: { ketchupino: 6, sodino: 45, lollini: 40 },   // żywych danego typu; ponad = Chipsetti
  ketchup: [[210, 25], [360, 15]],                 // [od s, co ile s] — Ketchupino poza pulą
  // E3 K1 (spec 09 §3): PULA PER MAPA — Łąki = `pula` wyżej (tu kalibrowano E1/E2); momenty wejścia typów jak na Łąkach,
  // tabela gęstości bez zmian, zmieniają się tylko udziały. Wąwozy „teren gra przeciw nim" (+Gummini, Ketchupino częściej),
  // Market „korytarze" (+Chipsetti/Lollini/Sodino, −Friesetti). Realne udziały po limitach: HORDA.mapaStat().
  pulaMap: {
    wawozy: [[0, 100, 0, 0, 0, 0, 0], [60, 85, 15, 0, 0, 0, 0], [90, 75, 25, 0, 0, 0, 0], [120, 55, 20, 25, 0, 0, 0],
             [150, 50, 20, 30, 0, 0, 0], [180, 45, 20, 35, 0, 0, 0], [210, 40, 15, 30, 15, 0, 0], [240, 36, 15, 25, 15, 9, 0],
             [300, 35, 14, 23, 14, 9, 5], [330, 34, 14, 23, 14, 9, 6], [360, 33, 13, 22, 15, 10, 7], [420, 32, 12, 22, 16, 10, 8],
             [480, 31, 12, 21, 16, 11, 9], [540, 30, 12, 21, 16, 11, 10]],
    market: [[0, 100, 0, 0, 0, 0, 0], [60, 85, 15, 0, 0, 0, 0], [90, 75, 25, 0, 0, 0, 0], [120, 65, 20, 15, 0, 0, 0],
             [150, 60, 22, 18, 0, 0, 0], [180, 56, 22, 22, 0, 0, 0], [210, 52, 18, 20, 10, 0, 0], [240, 46, 16, 16, 10, 12, 0],
             [300, 42, 14, 14, 10, 12, 8], [330, 40, 14, 14, 10, 12, 10], [360, 38, 13, 13, 11, 13, 12], [420, 37, 12, 13, 11, 13, 14],
             [480, 36, 12, 12, 11, 14, 15], [540, 35, 12, 12, 11, 14, 16]],
    // 30.09 OSIEDLE „przejścia i podwórka": więcej Chipsettich (roje wlewają się przejściami) i Friesettich
    // (szarża po prostej w wąskim przejściu = czytelny unik), mniej Gumminich i Marshmallinich; Sodino/Lollini jak na Łąkach
    osiedle: [[0, 100, 0, 0, 0, 0, 0], [60, 88, 12, 0, 0, 0, 0], [90, 80, 20, 0, 0, 0, 0], [120, 66, 16, 18, 0, 0, 0],
              [150, 61, 16, 23, 0, 0, 0], [180, 57, 16, 27, 0, 0, 0], [210, 48, 12, 20, 20, 0, 0], [240, 44, 12, 16, 19, 9, 0],
              [300, 42, 11, 14, 18, 9, 6], [330, 40, 11, 14, 18, 9, 8], [360, 39, 10, 13, 19, 10, 9], [420, 38, 9, 13, 20, 10, 10],
              [480, 37, 9, 12, 20, 11, 11], [540, 36, 9, 12, 20, 11, 12]],
  },
  ketchupMap: { wawozy: { co: [[210, 20], [360, 12]], limit: 8 } },   // Łąki/Market: `ketchup` i `limity` wyżej
  limityMap: { market: { lollini: 55, sodino: 55 } },
  podlogaCo: 0.25, podlogaIle: 6,                  // dosyp do podłogi: co 0,25 s najwyżej 6
  recyklCo: 0.5, recyklIle: 30,                    // recykling dalekich: co 0,5 s najwyżej 30
  obreczR: 22, pierscienR: 16, scianaR: 18,        // promienie fal w kadrze (telefon poziomo)
  scianaCzas: 5,                                   // s marszu ściany „razem"
  falaNaKlatke: 20,                                // wrogów fali na klatkę (ściana 80 = 4 klatki)
  lagodny: L_BIEG,                                 // AKTYWNE mnożniki L (newGame wpisuje normalne albo łagodne); tempo mnoży też fale
  // E1-bieg K10: ŁAGODNY PIERWSZY BIEG (spec §7). Włącza się, gdy META.st.pelne === 0 (v1: także pelne === 1 i best < 300 — TRUDNOŚĆ v2 to usuwa)
  // (`pelne` = biegi zakończone śmiercią/wygraną albo wyjściem do menu po ≥ 60 s — patrz czyLagodny);
  // DEV: ?lagodny=1 / HORDA.botBieg({ czysty: true }). Gracz nie widzi żadnego tekstu o trybie (poza Ręką Nonny).
  trybLagodny: {
    // Liczby spec §7 (tempo 0,75, HP 0,8, kaprale 0,7, Don 0,65, XP ×1,25) dawały botowi-nowicjuszowi 0/10 do 10:00
    // (mediana śmierci ~3:50); strojenie K10 botem (N = 20, czysty zapis, INFO-PROJEKT) → wartości niżej:
    // 7/10 do 10:00 i 4/10 wygranych na seed 201–210 (15/20 i 11/20 na 40 seedach). Spec: też dmgA/dmgB
    // i obrażenia kaprali/Dona ×0,8/×0,75 — od 25.09 bez znaczenia (1 cios = 1 serce).
    L: { hp: 0.50, spd: 0, elita: 0.2, tempo: 0.35 },   // HP wrogów, bez przyspieszania, elity, liczebność
    rozgrzewka: { do: 600 },                       // rozgrzewka trwa cały Wieczór (normalny: do 5:00)
    serceElity: 0.16, litosc: 0.50,                // serce z elity 16%; drugie serce z bossa/kaprala przy ≤ 50%
    kapHp: 0.30, kapCd: 2, kapCzas: 45, kapMax: 1, // kaprale: HP ×0,3, przerwy sztuczek ×2, po 45 s odchodzą, 1 naraz
    donHp: 0.11, donCd: 1.25, lawinaN: 2,          // Don 286 tys. (E2 K10: 0,12 → 0,11, bo baza 24 → 26 tys.), cooldowny ×1,25, lawina 2 kręgi
    xp: 3, magnes: 4,                              // XP z pigułki ×3, zasięg magnesu ×4 (bot-nowicjusz ucieka od pigułek)
    nietyk: 2.0,                                   // s nietykalności po trafieniu (normalny 0,9)
    ketchupCo: 3, ketchupOd: 360,                  // Ketchupino od 6:00 i 3× rzadziej
    podlogaMax: 245,                               // podłoga z tabeli najwyżej 245 (K11 podniósł 8:30–9:52 do 440 tylko w normalnym)
    reka: { hp: 0.5, r: 10, sila: 9, niet: 3 },    // Ręka Nonny: raz na bieg, śmiertelny cios → 50% serc + fala + 3 s
    kartyCo: null,                                 // AWANS CO 3: null = jak normalny bieg (CFG_TRUDNOSC.*.awans.kartyCo)
  },
  nietyk: 0.9,                                     // s nietykalności po trafieniu (1 cios = 1 serce)
  // B8 (28.09): monety z hordy — zwykły wróg `zwykly` szansy na 1 monetę, elita 1 moneta; od `od` s szansa ×(od/t)^`wykl`
  // (4:00 ×1, 6:00 ×0,36, 8:00 ×0,18, 10:00 ×0,11). Kapral 50, Don 10×20 + 100, wygrana ×1,5 (don.mnozWygranej).
  // Cel: wygrana ~1,5–2,5 tys., śmierć w 5:00 ~0,4–0,8 tys. (sklep z postaciami ~39 tys. = ~20 biegów).
  // 30.09 Piotr „zwiększyć ilość zbieranych monet” (po zalewie bot zbierał 5–31 na bieg): zwykły 0,16 → 0,40, elita 1 → 3,
  // kapral 50 → 120, spadek od 4:00 → 6:00 i łagodniejszy (wykl 2,5 → 1,5)
  monety: { zwykly: 0.40, elita: 3, kapral: 120, od: 360, wykl: 1.5 },
  xpKrzywa: XP_KRZ,                                // K11: współczynniki xpDoNast
  litosc: 0.34, serceElity: 0.08,                  // normalny bieg: drugie serce z bossa/kaprala przy HP ≤ 34%, serce z elity 8%
  // ROZGRZEWKA (24.09, szybkie złagodzenie; pełne strojenie K10/K11): mnożnik w 0:00 rośnie do 1 w `do`
  // jak (t/do)^wykl — długo nisko, domyka się w 4:00–5:00. Od 5:00 formuły §5 i tabela fal bez zmian.
  // Stan przy 3:00: tempo ×0,35 (2,6 wr/s zamiast 7,5), zdarzenia ×0,57, HP ×0,64, obrażenia ×0,50.
  // Podłoga żywych bez rozgrzewki — silny gracz zawsze ma co kosić. Pomiar botem: INFO-PROJEKT.md.
  rozgrzewka: { do: 300, wykl: 2.5, tempo: 0.10, podloga: 1, zdarzenia: 0.40, hp: 0.50, dmg: 0.30, elita: 0.20 },
  // XP z pigułki ×2 (cały bieg): mniej wrogów w rozgrzewce = mniej XP; bot-średni ma teraz poziom 21–22
  // w 5:00 i 36–38 w 10:00 = cel spec §6 (19–24 / 35–40), przed zmianą 12 i 30.
  xpPigulki: 2,
  // E1-bieg K7: KAPRALE (spec 07 §2). `hp` = BAZA (na ekranie × SKALA_WROGA, bez hpScale — stała godzina
  // = stałe HP), `tempo` w j./s wprost (bez spdScale). Liczby sztuczek w polach wpisu. Kalibracja TTK: INFO-PROJEKT.
  // E2 K10: HP × (TTK E1 / TTK E2) bota-średniego Carrotella (N=20/18, seed 411–430), sufit ×1,3: Pianissimo 120 → 150,
  // Frittone 1300 → 1700, Gommone 3500 → 4200, Girandola 4300 → 4700; Salsa i Botto bez zmian (TTK E2 ≥ E1).
  kaprale: {
    skala: 1.9, kontakt: 1.5, maxZywych: 2, czekaj: 15, r: [18, 20], telegraf: 1.0, kb: 0.3,
    lista: [null,
      { typ: 'marshmallini', nm: 'Caporale Pianissimo', hp: 150, tempo: 1.6, dzieci: 4, dzieckoHp: 3, dzieckoSkala: 1.3 },
      { typ: 'ketchupino', nm: 'Caporale Salsa Tripla', hp: 150, tempo: 2.2, okno: [10, 16], odskok: 6, co: 3.5, bok: 3.5, dmg: 1.2 },
      { typ: 'friesetti', nm: 'Caporale Frittone', hp: 1700, tempo: 4.0, okno: [6, 16], tel: 0.8, czas: 0.8, mn: 3.5,
        pauza: 0.45, szarz: 3, ogl: 2.5, cd: 5, dmg: 1.8, odrzut: 8, pas: [14, 1.2] },
      { typ: 'gummini', nm: 'Caporale Gommone', hp: 4200, tempo: 3.0, co: 4.5, r: 3.0, lot: 1.1, wys: 6, wyprz: 0.3, dmg: 2.0, tlum: 0.5 },
      { typ: 'lollini', nm: 'Caporale Girandola', hp: 4700, tempo: 1.25, tempoWir: 5.0, tel: 1.0, wir: 3.0, zaw: 3.0, r: 3.2,
        dmg: 2.0, odrzut: 12, tlum: 0.3, start: 14 },
      { typ: 'sodino', nm: 'Caporale Botto', hp: 7000, tempo: 2.8, zasieg: 4, lont: 1.6, r: 5.5, dmg: 250, sam: 0.12, zadyszka: 2, cd: 6 },
    ],
  },
  // E1-bieg K8: DON CHIPSO (spec 07 §3). `hp` = BAZA (× SKALA_WROGA), jedno HP dla wszystkich postaci
  // (decyzja właściciela). Kalibracja 24.09 (bot-średni, preset sredni-10, skok 585): DPS na Donie mediana
  // 5 postaci = Beetino ~28 tys./s (Carrotello 118, Razoretta 105, Granny 22, Garlicino 11 tys./s);
  // ×45 s (12 800) dawało walkę-medianę 41 s; przy 23 000 mediana 5 postaci 58 s (N=4/postać) → 24 000
  // = 2,4 mln na ekranie (walka: Carrotello ~23 s, Razoretta ~29 s, Beetino ~60 s, Granny ~83 s, Garlicino ~105 s).
  // Obrażenia (`dmg`, `kontakt`) kaprali i Dona od 25.09 NIE działają na gracza: 1 cios = 1 serce (ranGracza).
  don: {
    // E2 K10: 24 000 → 26 000 — tym samym wzorem co E1 K11 (mediana walki 5 postaci, preset sredni-10 z Dokładkami E2):
    // przy 24 000 mediana 63 s (C 18, R 20, B 76, G 64, Ga 87 s), cel ~65–70 s → HP × 70/63 ≈ ×1,1
    hp: 26000, tempo: 3.8, f2Tempo: 1.25, kontakt: 200, laska: 2, odpoczynek: 0.8,
    shur: { tel: 0.5, n: 3, kat: 18, v: 12, zasieg: 26, r: 0.7, omega: 0.6, dmg: 120, cd: 3.0, maxD: 24 },
    shur2: { n: 5, kat: 30, v: 13, cd: 2.4 },
    sol: { tel: 1.0, czas: 2.0, kat: 45, r: 11, min: 3, tik: 0.25, dmg: 25, slow: 0.8, slowT: 3, cd: 8.0, stozek: 60 },
    sol2: { kat: 60, r: 12, cd: 6.5 },
    chiam: { tel: 1.2, n: 8, r: 3.5, pierwsza: 12, cd: 20, limit: 30 },
    chiam2: { n: 12, cd: 15 },
    przejscie: 1.5,
    lawina: { co: 2.0, n: 3, r: 2.2, tel: 1.2, spad: 0.25, wys: 8, wyprz: 0.6, los: [3, 7], dmg: 200, tlum: 0.3 },
    wscieklosc: { po: 150, cd: 0.6, tempo: 1.2, lawinaN: 4 },
    monety: { n: 10, val: 20, duza: 100 }, mnozWygranej: 1.5, pierwszaWygrana: 200,   // B8: fontanna 200 → 300
  },
};
// ============================== TRUDNOŚĆ v2 (29.09): WSZYSTKIE ZMIANY W JEDNYM MIEJSCU ==============================
// Zgłoszenie właściciela po v282: „gra jest dużo za prosta, pasywy za często, za mało wrogów". E1/E2 stroiło
// bota-średniego Carrotella na 8–9/10 przeżyć 10:00 na Łąkach — za łagodnie. Preset `v1` = migawka wartości
// sprzed zmiany (brana z CFG_BIEG/XP_KRZ przy starcie, więc zawsze dokładna), `v2` = nowe. Domyślnie v2.
// DEV: HORDA.trudnosc('v1' | 'v2') przełącza na żywo (tabela fal i krzywa XP od razu; tryb łagodny od
// następnego biegu). Pomiar przed/po: INFO-PROJEKT.md, sekcja „TRUDNOŚĆ v2 (29.09)".
const _kopia = o => JSON.parse(JSON.stringify(o));
// tabela fal v2: [start, tempo, paczka, podłoga] — tempo i podłoga × MN_FAL_V2 (do 4:30 / 5:00 / od 5:30), paczka ×1,2;
// podłoga najwyżej 460 (LIMIT_SPAWNERA 470 — spawner i tak nie wchodzi wyżej, MAX_WROGOW 500 bez zmian)
// Podłoga do 2:30 ×1,6 (MN_FAL_V2.podlogaStart) — to ona trzyma liczbę żywych w 1.–2. minucie (spawner ponad podłogą
// bot i tak kosi): żywych w 1:00 ~25 → ~31, w 2:00 ~38 → ~61; przeżycie do 5:00 bez zmian (4/10 z nią i bez niej, seed 201–210).
const MN_FAL_V2 = { wczesne: 1.3, przejscie: 1.25, pozne: 1.2, podlogaStart: 1.6 };   // próba 1: 1,5 / 1,4 / 1,25
const _faleV2 = CFG_BIEG.fale.map(([t, tempo, paczka, podl]) => {
  const m = t < 300 ? MN_FAL_V2.wczesne : t < 330 ? MN_FAL_V2.przejscie : MN_FAL_V2.pozne;
  const mp = t <= 150 ? MN_FAL_V2.podlogaStart : m;
  return [t, +(tempo * m).toFixed(2), Math.round(paczka * 1.2), Math.min(460, Math.round(podl * mp))];
});
const CFG_TRUDNOSC = {
  akt: 'v2',
  v1: {
    // ZALEW (29.09 wieczór): v1 = jak dotąd — rozgrzewka i fale z `bieg`, HP ×1, paczka z jednej strony, bez obręczy 0:15/0:45,
    // łagodny pierwszy bieg włączony, Ręka Nonny tylko w nim. Opis pól: CFG_TRUDNOSC.v2.zalew
    zalew: { rozgrzewka: null, podloga: null, tempo: null, paczka: 1, paczkaMax: 1e9, strony: 1, obrecze: [],
             hp: { zwykly: 1, elita: 1, kapral: 1, don: 1 }, lagodny: true, rekaPierwszy: false },
    bieg: _kopia({ fale: CFG_BIEG.fale, rozgrzewka: CFG_BIEG.rozgrzewka, xpPigulki: CFG_BIEG.xpPigulki,
                   serceElity: CFG_BIEG.serceElity, litosc: CFG_BIEG.litosc, nietyk: CFG_BIEG.nietyk,
                   ketchup: CFG_BIEG.ketchup, ketchupMap: CFG_BIEG.ketchupMap }),
    xpKrz: { ...XP_KRZ }, lagodny: _kopia(CFG_BIEG.trybLagodny),
    garnekCd: 45, piniataPoziom: 1, lagodnyDrugaSzansa: true,
    // SKŁADNIKI (29.09): v1 = jak przed Spiżarnią — wszystkie poza Pokrywką od startu, waga i rzadkość ×1, sufit 5
    karty: { sklBlokady: false, sklWaga: 1, sklRz: 1, sklMax: 5 },
    // AWANS (29.09 wieczór): v1 = karty przy KAŻDYM awansie, bez automatycznego wzmocnienia
    awans: { kartyOd: 2, kartyCo: 1, dmg: 0, tempo: 0, bron: false },
    wzrost: 1,                                       // WZROST W BIEGU: v1 = pełny przyrost z rangi i automatu
    // EKONOMIA (29.09 wieczór): v1 = jak dotąd — pełne serca, pełna wartość pigułek XP, ceny broni w sklepie ×1
    ekon: { serceElity: 1, serceKapral: 1, rosolRegen: 1, rosolLecz: 1, beetLecz: 1, xp: 1, bronCena: 1 },
  },
  v2: {
    // ZALEW (29.09 wieczór; Piotr po v300: „mało wrogów, zwłaszcza na początku — ma być zalewany", „stanowczo za prosta",
    // „mogę stać i wszystko dookoła wybijam na 1 rundzie", „bardziej wytrzymali wrogowie"). Nakładka na resztę v2 — `bieg`
    // niżej zostaje, zastosujZalew() przelicza z niego CFG_BIEG.fale/rozgrzewka. Pola:
    //   rozgrzewka — zastępuje bieg.rozgrzewka ({ do: 0 } = brak; null = bez zmian)
    //   podloga    — [t s, min. żywych] liniowo, po ostatnim punkcie stała; podłoga = max(tabela v2, ta krzywa), sufit 460
    //   tempo      — [t s, mnożnik tempa tabeli v2] liniowo · paczka — mnożnik paczki (sufit paczkaMax)
    //   strony     — paczka dzielona na tyle grup z różnych stron (1 = jedna strona jak dotąd)
    //   obrecze    — dodatkowe małe obręcze (s) przed kalendarzową 1:15 · hp — mnożniki HP (zwykli / elity / kaprale / Don)
    //   lagodny    — łagodny pierwszy bieg (false = nigdy; DEV ?lagodny=1 i botBieg({ lagodny }) dalej wymuszają)
    //   rekaPierwszy — Ręka Nonny w PIERWSZYM biegu w życiu (META.st.pelne === 0), niezależnie od trybu łagodnego
    zalew: {
      rozgrzewka: { do: 30, wykl: 3, hp: 0.5 },    // tylko HP przez 30 s (×0,5 → ×1): pierwsze ~15 s kula poz. 1 kładzie Chipsettiego
                                                   // jednym strzałem; tempo, podłoga, zdarzenia, elity ×1 od 0:00
      podloga: [[0, 25], [15, 40], [60, 80], [120, 130], [180, 200], [240, 220], [300, 240], [420, 270], [480, 300]],
      tempo: [[0, 1], [120, 1], [180, 0.75], [210, 0.8], [240, 1]],   // 2:00–4:00 lekko w dół (i tak ≥ realne tempo v300) — bez
                                                   // rozgrzewki i z HP ×2 bot nieśmiertelny przy ×1 miał ~450 żywych w 3:00
      paczka: 2.5, paczkaMax: 36, strony: 2,
      obrecze: [15, 45],
      // 30.09 Piotr po v305: „trochę za trudne, trochę mniej przeciwników na końcu" — od 5:30 w dół do ×0,78 w 9:00
      // (podłoga 9:00 440 → ~340, tempo ×0,78); początek bez zmian
      koniec: [[330, 1], [450, 0.85], [540, 0.78]],
      // 30.09 wieczór, Piotr po v307: „trochę za trudne, daj mniej wrogów o 1/3 na początku, bo nie mogę dotrzeć do 5 min"
      // → do 3:00 tempo i podłoga ×0,67 (1:00: 80 → 54 żywych, 2:00: 130 → 87), potem liniowo do ×1 w 5:00
      start: [[0, 0.67], [180, 0.67], [300, 1]],
      hp: { zwykly: 1.7, elita: 1.35, kapral: 1.5, don: 1.5 },   // 01.10 „zmniejsz trudność trochę": zwykli 2 → 1,7, elity 1,5 → 1,35
      lagodny: false, rekaPierwszy: true,
    },
    bieg: {
      fale: _faleV2,                                 // tempo (przed rozgrzewką) 1:00 3,0 → 3,9 wr/s · 3:00 7,5 → 9,75 · 6:00 21 → 25,2; podłoga 0:00 10 → 16, 1:00 20 → 32, 2:00 35 → 56, 3:00 50 → 65, 5:00 110 → 138, 9:00 420 → 460
      // stare { do: 300, wykl: 2.5, tempo: 0.10, zdarzenia: 0.40, hp: 0.50, dmg: 0.30, elita: 0.20 } → nowe niżej:
      // rozgrzewka kończy się w 4:00 (było 5:00) i zaczyna od 1/5 tempa (było 1/10), krzywa (t/do)³. Mnożnik tempa:
      // 1:00 ×0,21 (było ×0,12), 2:00 ×0,30 (×0,19), 3:00 ×0,54 (×0,35), 4:00 ×1 (×0,62) → realne tempo spawnera
      // 1:00 0,8 wr/s (0,35), 2:00 2,0 (0,95), 3:00 5,2 (2,6), 4:00 16,9 (8,0) + NAPŁYW ×1,35. HP wrogów ×0,45 na starcie
      // (było ×0,50), ale pełne już w 4:00 (było 5:00). Zdarzenia (obręcze/roje/ściany) jak w v1 od ×0,4, pełne w 4:00.
      // Próba 1 (do 2:00, start ×0,5, fale ×1,5, xp 1,2, nietyk 0,7): bot-średni 0/10, mediana śmierci 1:44.
      // Próba 2 (do 3:00, start ×0,25, fale ×1,3): 1/10, mediana 1:58. Bot jest kruchy w 1:30–2:30 (pierwsze obręcze):
      // w v1 SAMO xp 1,2 albo SAMA rozgrzewka próby 2 zabijały 4–5/8 przed 5:00, samo nietyk 0,7 — 2/8.
      // Próba 3 (ta rozgrzewka, bez podłogi ×1,6): 4/10 + 4/10 przeżyć 10:00. Próba 4 (późne fale ×1,35): 1/8 — odrzucona.
      // WERSJA KOŃCOWA = próba 3 + podłoga ×1,6 do 2:30: 3/10, mediana śmierci 2:47 (seed 201–210; v1 na tych seedach 7/10).
      rozgrzewka: { do: 240, wykl: 3, tempo: 0.20, podloga: 1, zdarzenia: 0.40, hp: 0.45, dmg: 0.35, elita: 0.30 },
      xpPigulki: 2,                                  // zostaje 2 (1,2 zabijało wczesną grę) — mniej awansów robi krzywa xpKrz niżej
      serceElity: 0.04,                              // 0,08 → 0,04
      litosc: 0.30,                                  // 0,34 → 0,30 (drugie serce z bossa/kaprala)
      nietyk: 0.8,                                   // 0,9 → 0,8 s nietykalności po ciosie (0,7 = bot 2/8 martwy przed 5:00 już w v1)
      ketchup: [[150, 20], [300, 12]],               // [[210, 25], [360, 15]] → Ketchupino od 2:30, co 20 s; od 5:00 co 12 s
      ketchupMap: { wawozy: { co: [[150, 16], [300, 10]], limit: 8 } },   // było [[210, 20], [360, 12]]
    },
    // + e·l⁴: wczesne poziomy niewiele droższe (6.: 57 → 72, 9. 124 → 203), późne dużo droższe (20.: 775 → 2695, 30.: 2195 → 11915).
    // Ta sama zebrana XP: poziom 13 → 11, 20 → 16, 38 → 26–27 (liczone z sumy progów).
    xpKrz: { a: 5, b: 2.5, c: 0.70, d: 0.055, e: 0.012 },
    garnekCd: 60,                                    // Garnek Nonny: odnowienie 45 → 60 s
    piniataPoziom: 0.6,                              // fontanna XP piniaty kaprala: 1 → 0,6 poziomu
    lagodnyDrugaSzansa: false,                       // łagodny TYLKO pierwszy bieg w życiu (było też: 2. bieg, gdy 1. < 5:00)
    // SKŁADNIKI RZADZIEJ (życzenie właściciela 29.09; Spiżarnia Nonny): blokady = na start tylko SKL_STARTOWE, reszta ze
    // sklepu; waga kart składników ×0,5 (względem bron 1,4 / dokl 0,8 — CFG_DECYZJE.wagi); szansa na niebieską/fioletową
    // KARTĘ SKŁADNIKA ×0,5 (bronie bez zmian); maks. poziom składnika w biegu 3, „Większy słoik" ze Spiżarni → 5.
    karty: { sklBlokady: true, sklWaga: 0.5, sklRz: 0.5, sklMax: 3 },
    // AWANS RZADZIEJ Z KARTAMI (uwaga właściciela 29.09 po v295: „karty wybierajmy rzadziej, co któryś awans"):
    // okno kart tylko na poziomach kartyOd, kartyOd + kartyCo, … (2, 5, 8, 11, …; łagodny 1. bieg co 2 — lagodny.kartyCo);
    // kilka awansów naraz = najwyżej jedno okno. KAŻDY awans bez pauzy: +dmg obrażeń i +tempo szybkości ataków
    // (addytywnie: dmgAll × (1 + dmg·n), fireMul × (1 + tempo·n), n = awanse w biegu), a awans BEZ kart (bron) dodatkowo
    // +1 poziom najsłabszej broni < max. Samo +4%/+2% bez broni dawało w 5:00 ¼ siły broni sprzed zmiany (bronie na poz. 1–2).
    // Pomiar (bot-średni Carrotello, Łąki, N=40): przed 3/40 do 10:00, mediana śmierci 4:05, okna do 5:00/10:00 17/26;
    // po 5/40, 4:23, okna 6/9. Z tempo 0 → 0/40, 2:37 (bot kruchy w 1:30–3:00). Sekcja „AWANS CO 3" w INFO-PROJEKT.md.
    awans: { kartyOd: 2, kartyCo: 3, dmg: 0.01, tempo: 0.005, bron: true },
    // WZROST W BIEGU (uwaga właściciela 29.09: „postać za szybko staje się bardzo silna — o połowę"): mnoży przyrost z RANGI
    // (+5% → +2,75% obrażeń za rangę, +4% → +2,2% tempa co 4.) i z automatu awansu (+1% → +0,55% obrażeń, +0,5% → +0,275% tempa).
    // Karty, skrzynie, poziomy broni z automatu, przepisy, sklep meta i wrogowie bez zmian. Siła broni (bot-średni, N=24, mediana)
    // 2:00 / 5:00 / 10:00: 146 / 2 475 / 7 943 → 112 / 1 570 / 4 010. Ranga to jedyne źródło, które rośnie do końca biegu
    // (48 w 10:00 = ×5,0), dlatego 10:00 tnie się mocniej niż 5:00; 0,5 dawało 10:00 = 3 344 (za mocno), wzrostBron 0,75 —
    // 5:00 = 467 (przepisy po 5:00). Sekcja „WZROST W BIEGU" w INFO-PROJEKT.md.
    wzrost: 0.85,                                    // 30.09 Piotr „trochę wzmocnić gracza”: 0,55 → 0,75; 01.10 „trochę łatwiej”: → 0,85
    // łagodny pierwszy bieg bliżej normalnego (stare → nowe)
    lagodny: {
      L: { hp: 0.65, spd: 0.02, elita: 0.4, tempo: 0.55 },   // { hp 0,50, spd 0, elita 0,2, tempo 0,35 }
      rozgrzewka: { do: 360 },                       // { do: 600 } (cały Wieczór) → do 6:00 (normalny v2: do 4:00)
      serceElity: 0.10, litosc: 0.45,                // 0,16 / 0,50
      kapHp: 0.45, kapCzas: 60,                      // 0,30 / 45 s
      donHp: 0.16,                                   // 0,11
      xp: 2.0, magnes: 3,                            // 3 / 4 (× xpPigulki 2: pigułka 6 → 4)
      nietyk: 1.4,                                   // 2,0 s
      ketchupCo: 2, ketchupOd: 270,                  // 3× rzadziej od 6:00 → 2× rzadziej od 4:30
      podlogaMax: 300,                               // 245
      kartyCo: 2,                                    // AWANS CO 3: w łagodnym 1. biegu karty co 2. awans (normalny co 3.)
    },
    // EKONOMIA (zgłoszenie właściciela 29.09: „mniej serc do znalezienia o połowę", „punkty z wrogów o połowę mniej warte,
    // a taka sama ilość tabletek", „bronie 4× droższe", „stanowczo za prosta"). Mnożniki działają w NORMALNYM biegu —
    // łagodny 1. bieg bez zmian (ekonBieg = 1); ceny broni zawsze. Sekcja „EKONOMIA ×½ / ×4" w INFO-PROJEKT.md.
    ekon: {
      serceElity: 0.5,                               // szansa serca z elity × → 4% → 2%
      serceKapral: 0.5,                              // piniata kaprala (i boss): 1 serce (+1 litość przy HP ≤ 30%) → 50% na 1 serce, przy HP ≤ 30% pewne 1
      rosolRegen: 0.5,                               // regeneracja Rosołu: 0,006 → 0,003 serca/s na jednostkę (5 j.: 1 serce co 33 → 67 s)
      rosolLecz: 0.5,                                // leczenie przy wzięciu Rosołu: do pełna → połowa brakujących (w górę, nowe serce zawsze pełne)
      beetLecz: 0.5,                                 // wysysanie Beetina (Buraczane Ciśnienie): 1 serce co 5 → 10 s
      xp: 0.7,                                       // 30.09 „trochę wzmocnić”: 0,5 → 0,7. Wartość pigułki XP (liczba pigułek bez zmian; fontanna piniaty 0,6 → 0,3 poziomu); krzywa XP bez zmian
      bronCena: 4,                                   // odblokowania BRONI w sklepie meta ×4 (Piorun 150 → 600 … Kernello 350 → 1 400); skok/torba bez zmian
    },
  },
};
const _lin = (a, b, k) => a + (b - a) * k;       // `lerp` jest zadeklarowane niżej (TDZ przy ustawTrudnosc('v2'))
// ZALEW: odcinkowo liniowa krzywa [[t, v], …] w chwili t (przed pierwszym punktem = pierwszy, po ostatnim = ostatni)
function krzywaZalewu(K, t) {
  if (!K || !K.length) return null;
  if (t <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (t < K[i][0]) return _lin(K[i - 1][1], K[i][1], (t - K[i - 1][0]) / (K[i][0] - K[i - 1][0]));
  return K[K.length - 1][1];
}
// ZALEW: tabela fal presetu × nakładka Z → nowa tabela [start, tempo, paczka, podłoga] z punktami obu (falaTeraz bez zmian)
function faleZalewu(F, Z) {
  const czasy = [...new Set([...F.map(w => w[0]), ...(Z.podloga || []).map(p => p[0]), ...(Z.tempo || []).map(p => p[0]), ...(Z.koniec || []).map(p => p[0]), ...(Z.start || []).map(p => p[0])])].sort((a, b) => a - b);
  return czasy.map(t => {
    let i = F.length - 1;
    while (i > 0 && F[i][0] > t) i--;
    const a = F[i], b = F[i + 1], k = b ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 0;
    const tempo = (b ? _lin(a[1], b[1], k) : a[1]) * (krzywaZalewu(Z.tempo, t) ?? 1);
    const kn = (krzywaZalewu(Z.koniec, t) ?? 1) * (krzywaZalewu(Z.start, t) ?? 1);   // 30.09: końcówka i start — tempo i podłoga × kn
    const podl = Math.max(b ? _lin(a[3], b[3], k) : a[3], krzywaZalewu(Z.podloga, t) ?? 0) * kn;
    return [t, +(tempo * kn).toFixed(2), Math.min(Z.paczkaMax || 1e9, Math.round(a[2] * (Z.paczka || 1))), Math.min(460, Math.round(podl))];
  });
}
function zastosujZalew(Z) {
  if (!Z) return;
  if (Z.rozgrzewka) CFG_BIEG.rozgrzewka = _kopia(Z.rozgrzewka);
  if (Z.podloga || Z.tempo || (Z.paczka || 1) !== 1) CFG_BIEG.fale = faleZalewu(CFG_BIEG.fale, Z);
}
const zalew = () => trudn().zalew || CFG_TRUDNOSC.v1.zalew;
function ustawTrudnosc(v) {
  const S = CFG_TRUDNOSC[v];
  if (!S || !S.bieg) return null;
  for (const [k, w] of Object.entries(S.bieg)) CFG_BIEG[k] = _kopia(w);
  zastosujZalew(S.zalew);                          // ZALEW (29.09 wieczór): rozgrzewka i tabela fal z nakładki presetu
  Object.assign(XP_KRZ, S.xpKrz);
  // łagodny: pełny powrót do migawki v1, potem nakładka presetu (L i rozgrzewka łączone polami)
  const L0 = _kopia(CFG_TRUDNOSC.v1.lagodny), Ln = _kopia(S.lagodny);
  Object.assign(CFG_BIEG.trybLagodny, L0, Ln, { L: { ...L0.L, ...(Ln.L || {}) }, rozgrzewka: { ...L0.rozgrzewka, ...(Ln.rozgrzewka || {}) } });
  CFG_TRUDNOSC.akt = v;
  if (typeof P !== 'undefined' && P && P.lvl) P.xpNeed = xpDoNast(P.lvl);   // bieżący próg od razu po nowej krzywej
  return v;
}
const trudn = () => CFG_TRUDNOSC[CFG_TRUDNOSC.akt];
// EKONOMIA: mnożnik z trudn().ekon (brak klucza = 1). ekonBieg — tylko normalny bieg: w łagodnym 1. biegu zawsze 1.
const ekon = k => { const E = trudn().ekon; return E && E[k] != null ? E[k] : 1; };
const ekonBieg = k => G.lagodny ? 1 : ekon(k);
// ułamkowa liczba sztuk (0,5 serca) → całe: część całkowita + reszta jako szansa; bez losowania, gdy reszty nie ma
// (v1 zużywa dokładnie tyle Math.random co przed EKONOMIĄ — seedy bota dają te same biegi)
const ileLos = n => { const c = Math.floor(n + 1e-9), f = n - c; return c + (f > 1e-9 && Math.random() < f ? 1 : 0); };
ustawTrudnosc('v2');
// ============================== E3 „MAPA MA CELE": WSZYSTKIE LICZBY (spec 09 §0.1) ==============================
// Kapliczki (Garnek / Stolnica / Wyzwanie Famiglii), znaczniki na krawędzi ekranu, wydarzenia map 3:52–4:26
// (Piknik / Powódź / Promocja!), pula wrogów per mapa, sylwetka zasłoniętych, karabin z Wyzwania.
// DEV: HORDA.cfgM. `wlaczone.*` = false → gra jak po E2 (test regresji K0/K11).
const CFG_MAPA = {
  wlaczone: { kapliczki: true, wydarzenia: true, pulaMap: true, sylwetki: true, karabinAuto: true },
  // §1 kapliczki — wspólne
  miejsce:  { rMin: 30, rMax: 60, odstep: 20, spadekMax: 0.25, prob: 40, przenies: 110, prosta: 8 },
  znaczniki:{ max: 3, garnekD: 45, hz: 30, margines: { gora: 58, dol: 76, bok: 64 }, podpowiedzi: 3, podpD: 14 },
  garnek:   { n: 3, r: 1.6, cd: 45 },
  stolnica: { r: 3.5, rMarket: 2.6, czas: 4.0, zanik: 0.5, reset: 6, cd: 50, pierwsza: 45, odBiegu: 1,
              premiaRz: { nieb: 0.10, fiol: 0.05 }, minRz: 'nieb' },
  wyzwanie: { r: 2.5, potw: 2.0, resetPotw: 0.5, cd: 75, pierwsza: 105, odBiegu: 2,
              n: { baza: 4, naMin: 0.8, max: 12 }, czas: 40, pierwszyRaz: { n: 4, czas: 60 },
              grupy: 3, rGrupy: 15, tel: 1.0, stun: 0.5, tempo: 1.15, bonusMonet: 10, blokadaOd: 570,
              typyBez: ['sodino', 'friesetti', 'ketchupino'] },
  jackpot:  { wyzwanie: [0.35, 0.45, 0.20], wydarzenie: [0, 0.80, 0.20] },   // szanse N = 1 / 3 / 5
  // §2 wydarzenia (sekundy biegu)
  wyd:      { zapowiedz: 232, start: 240, koniec: 266 },
  piknik:   { mesaMax: 60, odStop: 3.5, rMin: 12, rMax: 55, bezMesy: [30, 45],
              straz: { elity: 3, zwykli: 12, r: [4, 6] }, lagodny: { elity: 2, zwykli: 8 },
              budziD: 10, budziT: 265, koszR: 1.6, koszDo: 295, kocDo: 300, serca: 1, odkurz: 2.0, mniam: 2.0 },
  powodz:   { delta: 0.8, narost: 8, opad: 8, obszar: 96, siatka: 2, nurtMn: 3.0, graczMn: [1.0, 2.0],
              topiZw: 0.25, topiEl: 0.10, glebTopi: 0.3, kaprMn: 0.3, bezpR: 5, bezpMn: 0.1,
              prog: 15, odkurz: 2.0, brodR: 120, brodR2: 200, nurtCo: 0.25, budowaNaKlatke: 400 },
  promocja: { v: 5, dl: 80, pas: 48, tel: 1.5, dmgMn: 2, prog: 20, shake: 0.15, hitstopOd: 5 },
  // §4 sylwetka
  sylw:     { max: 30, rElity: 30, co: 0.2, krycie: 0.5, bias: 1.2, kolElita: 0xc07bff, kolDon: 0xff4a4a },
  // §6 karabin
  karabin:  { szansa: 0.25, gwarancjaNr: 3, pierwszyRaz: true, zeZwyklych: 0,
              auto: { co: 0.1, stozek: 50, zasieg: 40, obrot: 2.0, obrotSzukaj: 0.8, pitchMax: 0.35,
                      naprowadzanie: 5.0, recznaPrzerwa: 0.8, martwa: 3 } },
};
const TYPY_PULI = ['chipsetti', 'marshmallini', 'gummini', 'friesetti', 'sodino', 'lollini'];
const lerp = (a, b, k) => a + (b - a) * k;
function falaTeraz(t) {                           // { tempo, paczka, podloga } w chwili t
  const F = CFG_BIEG.fale;
  let i = F.length - 1;
  while (i > 0 && F[i][0] > t) i--;
  const a = F[i], b = F[i + 1];
  const k = b ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 0;
  let tempo = b ? lerp(a[1], b[1], k) : a[1];
  const N = CFG_BIEG.naplyw, S = CFG_BIEG.szturm;
  if (t >= N.od && t < N.do) tempo *= N.mn;
  if (t >= S.od && t < S.do) tempo *= S.mn;
  return { tempo: tempo * SKALA_GESTOSCI * mnFali(t), paczka: a[2],
           podloga: Math.round(Math.min(lerp(a[3], b ? b[3] : a[3], k), G.lagodny ? CFG_BIEG.trybLagodny.podlogaMax : 1e9)
                               * SKALA_GESTOSCI * mnFali(t, 'podloga')) };
}
// E3 K1: pula / limity / zegar Ketchupino bieżącej mapy (flaga CFG_MAPA.wlaczone.pulaMap = false → wszędzie Łąki)
const mapaPuli = () => CFG_MAPA.wlaczone.pulaMap ? mapKey : null;
const pulaTab = () => (mapaPuli() && CFG_BIEG.pulaMap[mapaPuli()]) || CFG_BIEG.pula;
function limitTypu(typ) {
  const m = mapaPuli();
  if (typ === 'ketchupino' && m && CFG_BIEG.ketchupMap[m]) return CFG_BIEG.ketchupMap[m].limit;
  const L = m && CFG_BIEG.limityMap[m];
  return L && L[typ] != null ? L[typ] : CFG_BIEG.limity[typ];
}
const ketchupTab = () => (mapaPuli() && CFG_BIEG.ketchupMap[mapaPuli()] && CFG_BIEG.ketchupMap[mapaPuli()].co) || CFG_BIEG.ketchup;
function pulaTeraz(t) {
  const P_ = pulaTab();
  let i = P_.length - 1;
  while (i > 0 && P_[i][0] > t) i--;
  return P_[i];
}
// liczniki żywych (bez umierających) — raz na wołanie, 500 wrogów to ułamek ms
const _ileTyp = {};
function liczZywych(poTypach = false) {
  let n = 0;
  if (poTypach) for (const k in _ileTyp) _ileTyp[k] = 0;
  for (const e of G.enemies) {
    if (e.dying) continue;
    n++;
    if (poTypach) _ileTyp[e.type] = (_ileTyp[e.type] || 0) + 1;
  }
  return n;
}
function losujTyp(t) {                            // typ wg udziałów okna; Friesetti waży udział/5 (porcja 5)
  const w = pulaTeraz(t);
  let suma = 0;
  for (let i = 1; i < w.length; i++) suma += i === 4 ? w[i] / 5 : w[i];
  let r = Math.random() * suma;
  for (let i = 1; i < w.length; i++) {
    r -= i === 4 ? w[i] / 5 : w[i];
    if (r <= 0) { const typ = TYPY_PULI[i - 1]; if (G.losowane) G.losowane[typ] = (G.losowane[typ] || 0) + (i === 4 ? 5 : 1); return typ; }   // E3: mapaStat
  }
  return 'chipsetti';
}
const typZLimitem = typ => { const L = limitTypu(typ); return (L != null && (_ileTyp[typ] || 0) >= L) ? 'chipsetti' : typ; };
// kąt „przed graczem": w kierunku ruchu, gdy biegnie; gdy stoi — przed kamerą
function katPrzod() {
  if (Math.hypot(P.vx || 0, P.vz || 0) > 1) return Math.atan2(P.vx, P.vz);
  return Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
}
const katKamery = () => Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
// Porcja Friesettich: 5 w linii prostopadłej do kierunku na gracza, odstęp 1,2 j.
function porcjaFrytek(a, r, opcje = {}) {
  const cx = P.pos.x + Math.sin(a) * r, cz = P.pos.z + Math.cos(a) * r;
  const px = Math.cos(a), pz = -Math.sin(a);       // prostopadle do promienia
  for (let k = -2; k <= 2; k++) wrogFali('friesetti', cx + px * k * 1.2, cz + pz * k * 1.2, opcje, k === 0 ? { puff: 1.3 } : null);
}
// PACZKA = jedna grupa z jednego kierunku (każdy wróg ±0,2 rad) — roje z biblii widać jako roje
// ZALEW (29.09 wieczór): zalew().strony > 1 → paczka dzieli się na tyle grup rozstawionych po okręgu (±0,4 rad),
// wrogowie po kolei do grup — gracz jest otaczany, a nie goniony z jednej strony (strony 1 = stary kod, te same losowania)
function spawnPaczka(n, t) {
  const a0 = Math.random() * Math.PI * 2, R = spawnR(), S = Math.max(1, Math.round(zalew().strony || 1));
  const katy = [a0];
  for (let g = 1; g < S; g++) katy.push(a0 + g * Math.PI * 2 / S + (Math.random() - 0.5) * 0.8);
  let zrodzeni = 0, gr = 0;
  while (zrodzeni < n) {
    const a = katy[gr++ % S];
    const typ = typZLimitem(losujTyp(t));
    const r = rZaKadrem(a, R[0] + Math.random() * (R[1] - R[0]));
    if (typ === 'friesetti') {
      const cx = P.pos.x + Math.sin(a) * r, cz = P.pos.z + Math.cos(a) * r, px = Math.cos(a), pz = -Math.sin(a);
      for (let k = -2; k <= 2; k++) spawnEnemy('friesetti', null, { x: cx + px * k * 1.2, z: cz + pz * k * 1.2 });
      zrodzeni += 5; _ileTyp.friesetti = (_ileTyp.friesetti || 0) + 5;
    } else {
      spawnEnemy(typ, a + (Math.random() - 0.5) * 0.4, null, { r: [r, r] });
      zrodzeni++; _ileTyp[typ] = (_ileTyp[typ] || 0) + 1;
    }
  }
  return zrodzeni;
}
// WRÓG FALI: do LIMIT_SPAWNERA nowy; powyżej — zabiera miejsce najdalszemu zwykłemu wrogowi
// (d > 20 j.), więc fala jest zawsze pełna, a limit nietknięty (spec §1.5 „Fale przy limicie").
// Pomiar K1 na telefonie: ściana 80 w jednej klatce = przycięcie 50 ms, więc fale idą KOLEJKĄ
// (najwyżej CFG_BIEG.falaNaKlatke wrogów na klatkę; pozycje liczone w chwili zdarzenia).
// `ext` = pola doklejane do wroga (stun, sciana, rodzina), `ext.puff` = obłoczek przy pojawieniu.
let _zywiFali = 0;
function wrogFali(typ, x, z, opcje = {}, ext = null) {
  G.kolejkaSpawnu.push({ typ, x, z, opcje, ext, nr: G.falaNr });
}
function wrogFaliTeraz(typ, x, z, opcje = {}, ext = null, nr = 0) {
  if (_zywiFali >= LIMIT_SPAWNERA) {
    let naj = -1, najD = 400;
    for (let j = 0; j < G.enemies.length; j++) {
      const o = G.enemies[j];
      if (o.dying || o.T.boss || o.kapral || o.elite || o.fala === nr) continue;   // elity (i Rodzina) zostają
      const d2 = (o.pos.x - P.pos.x) ** 2 + (o.pos.z - P.pos.z) ** 2;
      if (d2 > najD) { najD = d2; naj = j; }
    }
    if (naj < 0) return null;                      // nikogo dalej niż 20 j. — fala krótsza, limit ważniejszy
    const o = G.enemies[naj];
    o.bb.dispose(); if (o.rozpadMat) o.rozpadMat.dispose();
    G.enemies.splice(naj, 1);
    _zywiFali--;
  }
  const e = spawnEnemy(typ, null, { x, z }, opcje);
  e.fala = nr;                                    // numer fali: nie zabieramy miejsca wrogom TEJ SAMEJ fali
  if (ext) { const { puff: pf, ...reszta } = ext; Object.assign(e, reszta); if (pf) puff(x, e.ty + 0.6, z, 0xfff0d0, pf); }
  _zywiFali++;
  return e;
}
function kolejkaSpawnu() {
  if (!G.kolejkaSpawnu.length) return;
  _zywiFali = liczZywych();
  for (let k = 0; k < CFG_BIEG.falaNaKlatke && G.kolejkaSpawnu.length; k++) {
    const q = G.kolejkaSpawnu.shift();
    wrogFaliTeraz(q.typ, q.x, q.z, q.opcje, q.ext, q.nr);
  }
}
function toastWieczoru(pl, en, ms = 2200) {
  toastBuff(T(pl, en));
  setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, ms);
}
// MAŁA OBRĘCZ (:15 / :45): równo na okręgu r 22 (tuż za kadrem), bez toastu — poza pierwszą
function malaObrecz(toast) {
  const min = G.time / 60;
  const n = Math.round((8 + 2.5 * min) * SKALA_GESTOSCI * mnFali(G.time, 'zdarzenia'));
  const typy = G.time < 60 ? ['chipsetti']            // ZALEW: obręcze 0:15/0:45 — Marshmallini debiutuje dopiero w 1:00
             : G.time < 180 ? ['chipsetti', 'chipsetti', 'marshmallini'] : ['chipsetti', 'gummini', 'friesetti', 'marshmallini'];
  const r = CFG_BIEG.obreczR, a0 = Math.random() * 6.28;
  for (let k = 0; k < n; k++) {
    const a = a0 + k / n * Math.PI * 2;
    wrogFali(typy[Math.floor(Math.random() * typy.length)], P.pos.x + Math.sin(a) * r, P.pos.z + Math.cos(a) * r);
  }
  if (toast) toastWieczoru('Okrążają cię!', 'They are closing in!', 1600);
}
// WIELKI PIERŚCIEŃ: r 16 — widać, jak się zaciska; od 70 wrogów dwa okręgi; luka ucieczki 3 j.
function wielkiPierscien(n, typy) {
  n = Math.round(n * SKALA_GESTOSCI * mnFali(G.time, 'zdarzenia'));
  const R = CFG_BIEG.pierscienR, okregi = n >= 70 ? 2 : 1;
  const luka = Math.random() * Math.PI * 2, lukaK = 3 / R / 2;   // pół szerokości luki w radianach
  const naOkrag = Math.ceil(n / okregi);
  for (let o = 0; o < okregi; o++) {
    const r = R + o * 1.5;
    for (let k = 0; k < naOkrag; k++) {
      const a = (k + o * 0.5) / naOkrag * Math.PI * 2;
      const dl = Math.abs(((a - luka) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (dl < lukaK) continue;
      const x = P.pos.x + Math.sin(a) * r, z = P.pos.z + Math.cos(a) * r;
      // stun 0.4 s: gracz widzi obręcz, zanim ruszy
      wrogFali(typy[Math.floor(Math.random() * typy.length)], x, z, {}, { stun: 0.4, puff: k % 4 === 0 ? 1.4 : 0 });
    }
  }
  G.shake = Math.max(G.shake, 0.25);
  toastWieczoru('FALA OKRĄŻAJĄCA — biegną ze wszystkich stron!', 'ENCIRCLING WAVE — they come from every side!', 1800);
}
// ŚCIANA HORDY: łuk ~95° przed graczem, r 18, rzędy co 1,1 j., wrogowie co ≥ 1,0 j.;
// przez pierwsze 5 s idzie RAZEM (prędkość najwolniejszego typu), potem każdy wraca do swojego AI
function scianaHordy(n, typy, rzedy, pierwszyRzad = null, a = null) {
  n = Math.round(n * SKALA_GESTOSCI * mnFali(G.time, 'zdarzenia'));
  if (a === null) a = katPrzod();
  const R = CFG_BIEG.scianaR, naRzad = Math.ceil(n / rzedy);
  const luk = Math.max(naRzad * 1.0 / R, 95 * Math.PI / 180);   // radiany
  const dir = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));    // marsz ku graczowi
  const wszystkie = pierwszyRzad ? [...typy, pierwszyRzad] : typy;
  const spd = Math.min(...wszystkie.map(k => ENEMY_TYPES[k].speed)) * spdScale();
  let zrob = 0;
  for (let w = 0; w < rzedy && zrob < n; w++) {
    const r = R + w * 1.1;
    for (let k = 0; k < naRzad && zrob < n; k++, zrob++) {
      const ak = a + (k / Math.max(1, naRzad - 1) - 0.5) * luk;
      const x = P.pos.x + Math.sin(ak) * r, z = P.pos.z + Math.cos(ak) * r;
      const typ = w === 0 && pierwszyRzad ? pierwszyRzad : typy[Math.floor(Math.random() * typy.length)];
      wrogFali(typ, x, z, {}, { sciana: { t: CFG_BIEG.scianaCzas, dir, spd }, puff: k % 4 === 0 ? 1.2 : 0 });
    }
  }
  G.shake = Math.max(G.shake, 0.2);
}
// KALENDARZ WIECZORU (spec §1.4). `kapral`/`don` to na razie tylko wpisy w logu (K7/K8).
const WIECZOR = [
  { t: 0.3, typ: 'otwarcie' }, { t: 3.0, typ: 'otwarcie2' }, { t: 30, typ: 'roj' },
  { t: 60, typ: 'nowy', co: 'marshmallini' }, { t: 65, typ: 'pierwsza-elita' },
  { t: 90, typ: 'kapral', nr: 1 }, { t: 120, typ: 'sciana', n: 40 }, { t: 150, typ: 'pierscien', n: 45 },
  { t: 180, typ: 'kapral', nr: 2 }, { t: 210, typ: 'frytki' }, { t: 240, typ: 'naplyw' },
  { t: 270, typ: 'kapral', nr: 3 }, { t: 300, typ: 'polowa', n: 80 }, { t: 330, typ: 'pierscien', n: 70 },
  { t: 360, typ: 'kapral', nr: 4 }, { t: 390, typ: 'nalot' }, { t: 420, typ: 'rodzina' },
  { t: 450, typ: 'kapral', nr: 5 }, { t: 480, typ: 'pierscien', n: 100 }, { t: 510, typ: 'sodowa' },
  { t: 540, typ: 'kapral', nr: 6 }, { t: 570, typ: 'szturm' }, { t: 577, typ: 'szturm-sciana' },
  { t: 584, typ: 'szturm-sciana' }, { t: 592, typ: 'cisza' }, { t: 600, typ: 'don' },
  // K8: oś ciszy sekunda po sekundzie (spec §3.1)
  { t: 593, typ: 'cisza-krok', k: 'odkurz' }, { t: 594, typ: 'cisza-krok', k: 'szelest', g: 0.45 },
  { t: 595, typ: 'cisza-krok', k: 'napis1' }, { t: 597, typ: 'cisza-krok', k: 'szelest', g: 0.7 },
  { t: 598, typ: 'cisza-krok', k: 'napis2' }, { t: 599, typ: 'cisza-krok', k: 'szelest', g: 1 },
];
for (let s = 75; s <= 555; s += 30) WIECZOR.push({ t: s, typ: 'obrecz', maly: true });
// ZALEW (29.09 wieczór): wczesne małe obręcze presetów (v2: 0:15 i 0:45 — „fale okrążające co 30 s" od startu, nie od 1:15);
// w kalendarzu są wpisy wszystkich presetów, odpala się tylko te z zalew().obrecze aktywnego (HORDA.trudnosc przełącza na żywo)
for (const s of new Set(Object.values(CFG_TRUDNOSC).flatMap(S => (S && S.zalew && S.zalew.obrecze) || [])))
  WIECZOR.push({ t: s, typ: 'obrecz', maly: true, zalew: true });
WIECZOR.sort((a, b) => a.t - b.t);
function odpalZdarzenie(z) {
  const typy = pulaTeraz(G.time).slice(1).map((u, i) => u > 0 ? TYPY_PULI[i] : null).filter(Boolean);
  const wrecz = typy.filter(k => k !== 'friesetti' && k !== 'sodino');
  switch (z.typ) {
    case 'otwarcie': case 'otwarcie2': {           // 4 Chipsettich w kadrze: pierwszy kill po 2–3 s
      const a = katKamery() + (z.typ === 'otwarcie2' ? Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1) : 0);
      const r = z.typ === 'otwarcie2' ? 18 : 16 + Math.random() * 2;
      for (let k = 0; k < 4; k++) {
        const ak = a + (k - 1.5) * 0.12;
        wrogFali('chipsetti', P.pos.x + Math.sin(ak) * r, P.pos.z + Math.cos(ak) * r, { elita: 'nie' }, { puff: 1.0 });
      }
      break;
    }
    case 'roj': {                                  // 15 Chipsettich z jednego kierunku, przed graczem
      const a = katPrzod(), R = spawnR();
      for (let k = 0; k < Math.round(15 * mnFali(G.time, 'zdarzenia')); k++) {
        const ak = a + (Math.random() - 0.5) * 0.5, r = R[0] + Math.random() * 3;
        wrogFali('chipsetti', P.pos.x + Math.sin(ak) * r, P.pos.z + Math.cos(ak) * r, { elita: 'nie' }, { puff: k % 3 === 0 ? 1.2 : 0 });
      }
      toastWieczoru('PIERWSZY RÓJ!', 'FIRST SWARM!', 1600);
      break;
    }
    case 'pierwsza-elita': {                       // gwarantowana pierwsza elita, w kadrze przed kamerą
      const a = katKamery();
      wrogFali('chipsetti', P.pos.x + Math.sin(a) * 20, P.pos.z + Math.cos(a) * 20, { elita: 'tak' }, { puff: 1.5 });
      break;
    }
    case 'obrecz': malaObrecz(z.t <= Math.min(75, ...(zalew().obrecze || []))); break;   // toast tylko przy pierwszej obręczy biegu
    case 'sciana':
      scianaHordy(z.n, ['chipsetti', 'gummini'], 2);
      toastWieczoru('ŚCIANA HORDY — przebij się albo obiegnij!', 'HORDE WALL — break through or run around!');
      break;
    case 'pierscien':
      wielkiPierscien(z.n, z.n >= 100 ? wrecz : z.n >= 70 ? ['chipsetti', 'marshmallini', 'gummini', 'friesetti'] : ['chipsetti', 'marshmallini']);
      break;
    case 'frytki': porcjaFrytek(katPrzod(), 12); break;   // pierwsza porcja w kadrze — widać szarżę
    case 'naplyw': toastWieczoru('NAPŁYW! Horda gęstnieje', 'SURGE! The horde thickens'); break;
    case 'polowa':
      scianaHordy(z.n, ['chipsetti', 'marshmallini', 'gummini'], 3, 'lollini');
      toastWieczoru('POŁOWA WIECZORU — Don już wie', 'HALF THE EVENING — the Don knows', 2600);
      break;
    case 'nalot': {                                // 3 porcje po 5 Friesettich z jednej strony, co 1,5 s
      const a = katPrzod() + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      porcjaFrytek(a, spawnR()[0]);
      G.kolejkaFal.push({ t: G.time + 1.5, f: () => porcjaFrytek(a + 0.15, spawnR()[0]) });
      G.kolejkaFal.push({ t: G.time + 3.0, f: () => porcjaFrytek(a - 0.15, spawnR()[0]) });
      toastWieczoru('NALOT FRYTEK!', 'FRY RAID!', 1800);
      break;
    }
    case 'rodzina': {                              // 10 elit z jednego kierunku: XP tak, monety nie
      const a = katPrzod(), R = spawnR();
      for (let k = 0; k < 10; k++) {
        const ak = a + (k - 4.5) * 0.09, r = R[0] + (k % 2) * 1.5;
        wrogFali(wrecz[k % wrecz.length], P.pos.x + Math.sin(ak) * r, P.pos.z + Math.cos(ak) * r, { elita: 'tak' }, { rodzina: true, puff: k % 2 === 0 ? 1.3 : 0 });
      }
      toastWieczoru('RODZINA IDZIE — same elity!', 'THE FAMILY IS COMING — all elites!');
      break;
    }
    case 'sodowa': {                               // 16 Sodino w pierścieniu r 18 — wybiegnij z kręgu
      if (G.lagodny) { malaObrecz(true); break; }  // K10: łagodny bieg — zwykła mała obręcz
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2;
        wrogFali('sodino', P.pos.x + Math.sin(a) * 18, P.pos.z + Math.cos(a) * 18, { elita: 'nie' }, { puff: k % 2 === 0 ? 1.2 : 0 });
      }
      toastWieczoru('SODOWA OBRĘCZ — wybiegnij z kręgu!', 'SODA RING — get out of the circle!');
      break;
    }
    case 'szturm':
      scianaHordy(60, wrecz, 3);
      toastWieczoru('OSTATNI SZTURM!', 'FINAL ASSAULT!', 2600);
      break;
    case 'szturm-sciana': scianaHordy(60, wrecz, 3, null, katPrzod() + (z.t < 580 ? 2.1 : -2.1)); break;
    case 'kapral': spawnKapral(z.nr); break;       // K7: 1 s fioletowego kręgu, potem kapral (spec §2.1)
    case 'cisza': zacznijCisze(); break;           // K8: odwrót hordy, stop spawnu, muzyka gaśnie
    case 'cisza-krok': ciszaKrok(z); break;
    case 'don': wejscieDona(); break;              // K8: Don spada z nieba
  }
}
// przewinięcie kalendarza (HORDA.skok): zdarzenia przed t oznaczone jako odpalone
function przewinWieczor(t) {
  G.wiecIdx = 0;
  while (G.wiecIdx < WIECZOR.length && WIECZOR[G.wiecIdx].t < t) G.wiecIdx++;
  G.kolejkaFal = []; G.kolejkaSpawnu = [];
  G.spawnAkum = 0;
}
// RECYKLING: wrogowie dalej niż 46 j. wracają w pierścień spawnu, w kąt ±60° od kierunku ruchu
function recyklingDalekich() {
  const v = Math.hypot(P.vx || 0, P.vz || 0), kv = Math.atan2(P.vx || 0, P.vz || 0), R = spawnR();
  let ile = 0;
  for (const e of G.enemies) {
    if (ile >= CFG_BIEG.recyklIle) break;
    if (e.dying || e.T.boss || e.kapral || e.odwrot) continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
    if (dx * dx + dz * dz < RECYKL_R * RECYKL_R) continue;
    const a = v > 1 ? kv + (Math.random() - 0.5) * (Math.PI * 2 / 3) : Math.random() * Math.PI * 2;
    const r = rZaKadrem(a, R[0] + Math.random() * (R[1] - R[0]));
    e.pos.set(P.pos.x + Math.sin(a) * r, 0, P.pos.z + Math.cos(a) * r);
    if (MAPS[mapKey].osiedle) osPoprawPunkt(e.pos);   // osiedle: nie w bryle
    else if (MAPS[mapKey].indoor) mkPoprawPunkt(e.pos);
    e.ty = terrainH(e.pos.x, e.pos.z); e.vy = 0;
    e.kb.set(0, 0, 0); e.faz = null; e.szarzaCd = null; e.sciana = null;
    if (e.T.szarzuje || e.T.wiruje) e.bb.mesh.scale.set(e.bb.h, e.bb.h, 1);
    e.bb.update(0, e.pos, e.ty);
    if (e.ring) e.ring.position.set(e.pos.x, e.ty + 0.06, e.pos.z);
    ile++;
  }
}
// SPAWNER WIECZORU — wołany co klatkę z update() (poza STRES)
function spawnerWieczoru(dt) {
  const t = G.time;
  // zdarzenia z kalendarza + kolejka odroczonych (nalot frytek)
  while (G.wiecIdx < WIECZOR.length && WIECZOR[G.wiecIdx].t <= t) {
    const z = WIECZOR[G.wiecIdx++];
    if (z.zalew && !(zalew().obrecze || []).includes(z.t)) continue;   // ZALEW: obręcz innego presetu — pomiń (bez wpisu w logu)
    G.falaNr = (G.falaNr || 0) + 1;                // numer fali dla wrogFali (zastępowanie przy limicie)
    odpalZdarzenie(z);
    G.zdarzenia.push({ t: +t.toFixed(1), typ: z.typ + (z.typ === 'kapral' ? z.nr : z.typ === 'cisza-krok' ? ':' + z.k : '') });
  }
  for (let i = G.kolejkaFal.length - 1; i >= 0; i--) {
    if (G.kolejkaFal[i].t > t) continue;
    G.kolejkaFal.splice(i, 1)[0].f();
  }
  kolejkaSpawnu();
  G.recyklT -= dt;
  if (G.recyklT <= 0) { G.recyklT = CFG_BIEG.recyklCo; recyklingDalekich(); }
  // K8: od ciszy 9:52 do końca biegu zwykły spawner stoi (spec §3.7: jedyni wrogowie w walce = Chiamata)
  if (G.cisza || t >= CISZA_OD) return;
  let zywi = liczZywych(true);
  const f = falaTeraz(t);
  G.spawnAkum += f.tempo * dt;
  while (G.spawnAkum >= f.paczka && zywi < LIMIT_SPAWNERA) {
    zywi += spawnPaczka(Math.min(f.paczka, LIMIT_SPAWNERA - zywi), t);
    G.spawnAkum -= f.paczka;
  }
  G.spawnAkum = Math.min(G.spawnAkum, f.paczka * 2);   // na limicie nie zbieramy zapasu na później
  // podłoga żywych (wzór VS): silny gracz zawsze ma co kosić
  G.podlogaT -= dt;
  if (G.podlogaT <= 0) {
    G.podlogaT = CFG_BIEG.podlogaCo;
    for (let k = 0; k < CFG_BIEG.podlogaIle && zywi < f.podloga && zywi < LIMIT_SPAWNERA; k++) {
      let typ = typZLimitem(losujTyp(t));
      if (typ === 'friesetti') typ = 'chipsetti';  // podłoga dosypuje pojedynczo — frytki chodzą porcjami
      spawnEnemy(typ);
      _ileTyp[typ] = (_ileTyp[typ] || 0) + 1; zywi++;
    }
  }
  // Ketchupino na własnym zegarze (poza pulą)
  const K = ketchupTab();
  if (t >= Math.max(K[0][0], G.lagodny ? CFG_BIEG.trybLagodny.ketchupOd : 0)) {   // K10: łagodny później
    const co = (t >= K[1][0] ? K[1][1] : K[0][1]) * lag('ketchupCo');   // K10: łagodny rzadziej
    if (t >= G.ketchT && (_ileTyp.ketchupino || 0) < limitTypu('ketchupino') && zywi < LIMIT_SPAWNERA) {
      spawnEnemy('ketchupino');
      G.ketchT = t + co;
    }
  }
}

// (24.09, decyzja właściciela: pasek Wieczoru z koroną usunięty — zostaje sam zegar 0:00–10:00;
//  Don przychodzi bez zapowiedzi na HUD, zapowiedzią są cisza 9:52 i wejście bossa)

// ============================== E1-bieg K7/K8: TELEGRAFY NA ZIEMI (spec 07 §3.9) ==============================
// Kręgi, dyski i pasy to NOŚNIKI (Object3D poza sceną) rysowane pulami instancji w syncInstancje —
// jeden draw call na rodzaj, zero `scene.add` na telegraf. Materiały z depthTest:false: telegraf widać
// przez pagórek (Łąki/Wąwozy), regał (Market) i z oczu w trybie karabinu. `strefa` = bot wychodzi z niej.
//   o.r promień · o.dur czas życia (s) · o.kolor · o.a krycie · o.puls (2 Hz) · o.rosnie (0→r) ·
//   o.zacisk (1,35r→r) · o.sledz (wróg: telegraf jedzie z nim) · pas: o.dl, o.sz, o.kat · o.strefa (false = ozdoba)
function telegraf(rodzaj, x, z, o = {}) {
  const t = { rodzaj, o: new THREE.Object3D(), x, z, r: o.r || 1, t: 0, dur: o.dur != null ? o.dur : 1,
              a0: o.a != null ? o.a : 0.9, a: 0, kc: kolInst(o.kolor != null ? o.kolor : 0xffffff),
              puls: !!o.puls, rosnie: !!o.rosnie, zacisk: !!o.zacisk, sledz: o.sledz || null,
              dl: o.dl || 0, sz: o.sz || 0, kat: o.kat || 0, strefa: o.strefa !== false, koniec: false };
  ustawTelegraf(t);
  G.telegrafy.push(t);
  return t;
}
function ustawTelegraf(t) {
  const k = t.dur > 0 ? Math.min(1, t.t / t.dur) : 0;
  if (t.sledz) { t.x = t.sledz.pos.x; t.z = t.sledz.pos.z; }
  const puls = t.puls ? Math.sin(t.t * 4 * Math.PI) : 0;           // 2 Hz
  if (t.rodzaj === 'pas') { t.o.scale.set(t.sz, 1, t.dl); t.o.rotation.set(0, t.kat, 0); }
  else {
    let s = t.r * 2;
    if (t.rosnie) s *= Math.max(0.05, k);
    if (t.zacisk) s *= 1.35 - 0.35 * k;
    s *= 1 + 0.07 * puls;
    t.o.scale.set(s, 1, s);
  }
  t.o.position.set(t.x, terrainH(t.x, t.z) + 0.08, t.z);
  t.a = t.a0 * (t.puls ? 0.78 + 0.22 * puls : 1);
}
function updateTelegrafy(dt) {
  for (let i = G.telegrafy.length - 1; i >= 0; i--) {
    const t = G.telegrafy[i];
    t.t += dt;
    if (t.koniec || (t.dur > 0 && t.t >= t.dur) || (t.sledz && (t.sledz.dying || t.sledz.odwrot))) { G.telegrafy.splice(i, 1); continue; }
    ustawTelegraf(t);
  }
}
// tekstury telegrafów: białe (kolor = instanceColor), pikselowe krawędzie jak reszta gry
function telKragTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(20,20,28,0.55)'; g.lineWidth = 9; g.beginPath(); g.arc(32, 32, 27, 0, 7); g.stroke();   // ciemny cień obwódki = kontrast na jasnej trawie
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 27, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function telDyskTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 29, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function telPasTexture() {                           // pas szarży: wypełnienie + krawędzie + szewrony „w tę stronę"
  const W = 16, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.42)'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 2, H); g.fillRect(W - 2, 0, 2, H);
  for (let y = 6; y < H; y += 12) for (let x = 2; x < W - 2; x++) {
    const yy = y + Math.abs(x - W / 2) * 0.7;                   // szewron (v → kierunek szarży w dół tekstury)
    g.fillRect(x, H - yy, 1, 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t;
}
const telMat = map => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, depthTest: false, fog: false });
function chipsTexture() {                            // K8: chips-półksiężyc Dona (pocisk Shuriken i lawina), 16×16 jak glob ketchupu
  const S = 16, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), d = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.hypot(x - 7.5, y - 7.5), r2 = Math.hypot(x - 10.5, y - 5.0);
    let kol = null;
    if (r < 7.4 && r2 > 5.0) kol = (r > 6.2 || r2 < 6.2) ? [120, 74, 18] : (x + y) % 5 === 0 ? [255, 236, 150] : [242, 193, 74];
    const i = (y * S + x) * 4;
    if (kol) { d.data[i] = kol[0]; d.data[i + 1] = kol[1]; d.data[i + 2] = kol[2]; d.data[i + 3] = 255; }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _pasGeo = null;
function pasGeo() {                                  // pas od punktu startu wzdłuż lokalnego +Z (obrót = kierunek)
  if (!_pasGeo) { _pasGeo = new THREE.PlaneGeometry(1, 1); _pasGeo.rotateX(-Math.PI / 2); _pasGeo.translate(0, 0, 0.5); }
  return _pasGeo;
}

// ============================== E1-bieg K7: KAPRALE (spec 07 §2) ==============================
// Mini-bossy w stałych minutach (1:30 … 9:00): istniejący typ wroga ×1,9 z podwójnym fioletowym kręgiem,
// stałe HP (bez hpScale), zachowanie typu + JEDNA sztuczka (aiKaprala). Śmierć = PINIATA (nagrodaKaprala).
const liczKaprali = () => { let n = 0; for (const e of G.enemies) if (e.kapral && !e.dying && !e.odwrot) n++; return n; };
function spawnKapral(nr, natychmiast = false) {
  const KC = CFG_BIEG.kaprale, K = KC.lista[nr];
  if (!K || G.cisza || G.dying || !G.running) return null;
  if (liczKaprali() >= (G.lagodny ? CFG_BIEG.trybLagodny.kapMax : KC.maxZywych)) {             // najwyżej 2 naraz — kolejny czeka co 15 s
    G.kolejkaFal.push({ t: G.time + KC.czekaj, f: () => spawnKapral(nr) });
    return null;
  }
  const a = katKamery() + (Math.random() - 0.5) * 0.5, r = KC.r[0] + Math.random() * (KC.r[1] - KC.r[0]);
  let x = P.pos.x + Math.sin(a) * r, z = P.pos.z + Math.cos(a) * r;
  // osiedle: telegraf i kapral w tym samym, wolnym miejscu (spawnEnemy i tak by go wypchnął — ale krąg zostałby w bloku)
  if (MAPS[mapKey].osiedle) { _osP.set(x, 0, z); osPoprawPunkt(_osP); x = _osP.x; z = _osP.z; }
  else if (MAPS[mapKey].indoor) { _osP.set(x, 0, z); mkPoprawPunkt(_osP); x = _osP.x; z = _osP.z; }   // market: krąg i kapral poza regałem
  if (natychmiast) return zrodzKaprala(nr, x, z);
  // 1 s pulsującego fioletowego kręgu PRZED pojawieniem (telegraf miejsca) — ozdoba, nie strefa ciosu
  telegraf('krag', x, z, { r: 1.8, kolor: 0xb070ff, dur: KC.telegraf, puls: true, strefa: false });
  telegraf('dysk', x, z, { r: 1.8, kolor: 0x8a3cff, dur: KC.telegraf, rosnie: true, a: 0.4, strefa: false });
  G.kolejkaFal.push({ t: G.time + KC.telegraf, f: () => zrodzKaprala(nr, x, z) });
  return null;
}
function zrodzKaprala(nr, x, z) {
  if (G.cisza || G.dying || !G.running) return null;
  const KC = CFG_BIEG.kaprale, K = KC.lista[nr];
  const e = spawnEnemy(K.typ, null, { x, z }, { elita: 'nie', skala: KC.skala });
  e.kapral = nr; e.kDef = K; e.tempo = K.tempo; e.kbMn = KC.kb; e.kStart = G.time;
  e.hp = e.maxHp = K.hp * SKALA_WROGA * lag('kapHp') * zalew().hp.kapral;   // K10: łagodny ×0,3 (trybLagodny.kapHp); ZALEW ×1,5
  // PODWÓJNY FIOLETOWY KRĄG (zwykła elita: pojedynczy 1,8) — instancje w pulaKrag, puls 2 Hz w pętli wrogów
  e.ring = new THREE.Object3D(); e.ring.scale.set(3.0, 1, 3.0);
  e.ring2 = new THREE.Object3D(); e.ring2.scale.set(2.3, 1, 2.3);
  e.ring.position.set(x, e.ty + 0.06, z); e.ring2.position.copy(e.ring.position);
  puff(x, e.ty + 1.2, z, 0xc07bff, 2.2);
  okruchy(x, e.ty + 1.0, z, 0xc07bff, 12);
  G.hitstop = Math.max(G.hitstop, 0.1);
  G.shake = Math.max(G.shake, 0.35);
  AUDIO.sfx('boss');
  toastWieczoru('KAPRAL: ' + K.nm + ' — rozbij piniatę!', K.nm + ' — smash the pinata!', 2600);
  G.zdarzenia.push({ t: +G.time.toFixed(1), typ: 'kapral' + nr + '-start' });
  return e;
}
// SZTUCZKI. Zwraca prędkość marszu `es` (ujemna = odwrót); `to` = kierunek (można nadpisać).
// Stany własne (e.kS), NIE e.stun — ogłuszenie z broni działa na kaprala ×0,25 czasu (pętla wrogów).
function aiKaprala(e, dt, d, to, es) {
  // Mrożonki zatrzymują też kaprala (to on ma być nagrodą), ale NIE przerywają rozpoczętej sztuczki: jej
  // telegraf ma własny zegar i gasłby w trakcie mrozu → cios bez ostrzeżenia. Nowa sztuczka nie ruszy (es = 0).
  if (G.buff.key === 'mroz' && !(e.kS && e.kS.faz && e.kS.faz !== 'marsz')) return 0;
  // K10: łagodny bieg — niepokonany kapral po `kapCzas` s odchodzi (jak horda w ciszy: od gracza, bez ciosów,
  // > 40 j. znika bez piniaty), ale nie w środku sztuczki. Nowy gracz nie ciągnie dwóch kaprali do końca biegu.
  // Girandola czeka w stanie 'marsz' (nie null) — bez tego wyjątku nigdy nie odchodziła i blokowała Botta (1 naraz).
  if (G.lagodny && G.time - e.kStart > CFG_BIEG.trybLagodny.kapCzas && !(e.kS && e.kS.faz && e.kS.faz !== 'marsz')) {
    e.bb.mesh.scale.set(e.bb.h, e.bb.h, 1);
    e.odwrot = true; e.kS = null; e.lot = false; e.zapalony = false;
    toastWieczoru(e.kDef.nm + ' — odpuszcza… na razie!', e.kDef.nm + ' gives up… for now!', 2000);
    G.zdarzenia.push({ t: +G.time.toFixed(1), typ: 'kapral' + e.kapral + '-odchodzi' });
    return 0;
  }
  const K = e.kDef;
  switch (e.kapral) {
    case 2: {                                        // SALSA TRIPLA: okienko 10–16 j., salwa 3 globów w poprzek drogi
      let v = es;
      if (d < K.odskok) v = -es * 1.6;              // za blisko — odskok
      else if (d < K.okno[0]) v = -es * 1.15;
      else if (d <= K.okno[1]) v = 0;               // w okienku stoi i celuje
      if (e.bb.anim === 'punch' && e.bb.done) e.bb.play(e.T.walk);
      e.kCd = (e.kCd == null ? 2.0 : e.kCd) - dt;
      if (e.kCd <= 0 && d <= K.okno[1] + 4) { e.kCd = K.co * lag('kapCd'); salwaSalsy(e, K); }
      return v;
    }
    case 3: {                                        // FRITTONE: potrójna szarża po pasach, potem długie ogłuszenie
      const S = e.kS || (e.kS = { faz: null, t: 0, cd: 1.5, n: 0, dir: new THREE.Vector3() });
      S.cd -= dt;
      const h = e.bb.h;
      if (!S.faz) {
        if (S.cd <= 0 && es > 0 && d > K.okno[0] && d < K.okno[1] && P.y - e.ty < 1.2) {
          S.faz = 'tel'; S.t = K.tel; S.n = 0;
          pasFrittone(e, S, K, K.tel);
          dmgPop(e.pos.x, e.ty + 1.2, e.pos.z, '!', '#f6cd51', 1.8, 'wazny');
        }
        return es;
      }
      S.t -= dt;
      if (S.faz === 'tel' || S.faz === 'pauza') {    // przysiad przed wyskokiem (jak Friesetti), stoi
        const k = 1 - S.t / (S.faz === 'tel' ? K.tel : K.pauza);
        e.bb.mesh.scale.set(h * (1 + 0.22 * k), h * (1 - 0.18 * k), 1);
        to.copy(S.dir);
        if (S.t <= 0) { S.faz = 'szarza'; S.t = K.czas; S.traf = false; e.bb.mesh.scale.set(h, h, 1); AUDIO.sfx('piorun'); }
        return 0;
      }
      if (S.faz === 'szarza') {
        to.copy(S.dir);
        if (!S.traf && d < 1.7 && P.y - e.ty < 1.2) {
          S.traf = true;
          if (ranGracza(obrazeniaWroga(K.dmg), 'kapral3', { shake: 0.45 })) { P.kbx = S.dir.x * K.odrzut; P.kbz = S.dir.z * K.odrzut; }
        }
        if (S.t <= 0) {
          S.n++;
          if (S.n < K.szarz) { S.faz = 'pauza'; S.t = K.pauza; pasFrittone(e, S, K, K.pauza); }
          else { S.faz = 'ogl'; S.t = K.ogl; S.popT = 0; }
        }
        return K.tempo * K.mn;                         // ×3,5 po prostej (~11 j. w 0,8 s)
      }
      if (S.faz === 'ogl') {                           // OGŁUSZENIE 2,5 s — okno na obrażenia
        S.popT -= dt;
        if (S.popT <= 0) { S.popT = 0.8; dmgPop(e.pos.x, e.ty + 1.0, e.pos.z, '@', '#ffe066', 1.6); }
        if (S.t <= 0) { S.faz = null; S.cd = K.cd * lag('kapCd'); }
        return 0;
      }
      return es;
    }
    case 4: {                                        // GOMMONE: skok na głowę z falą uderzeniową
      const S = e.kS || (e.kS = { faz: null, t: 0, cd: 2.5 });
      S.cd -= dt;
      if (!S.faz) {
        if (S.cd <= 0 && d < 22 && es > 0) {
          S.faz = 'lot'; S.t = 0;
          S.x0 = e.pos.x; S.z0 = e.pos.z; S.y0 = e.ty;
          S.x1 = P.pos.x + P.vx * K.wyprz; S.z1 = P.pos.z + P.vz * K.wyprz;   // czerwony krąg z wyprzedzeniem 0,3 s
          telegraf('krag', S.x1, S.z1, { r: K.r, kolor: 0xff3b30, dur: K.lot, a: 0.95 });
          telegraf('dysk', S.x1, S.z1, { r: K.r, kolor: 0xff3b30, dur: K.lot, rosnie: true, a: 0.35, strefa: false });
          e.lot = true;
          AUDIO.sfx('skok');
        }
        return es;
      }
      S.t += dt;                                     // łuk 1,1 s, wys. 6 j.; pozycję i wysokość liczymy tu
      const k = Math.min(1, S.t / K.lot), g1 = terrainH(S.x1, S.z1);
      e.pos.x = S.x0 + (S.x1 - S.x0) * k; e.pos.z = S.z0 + (S.z1 - S.z0) * k;
      e.ty = S.y0 + (g1 - S.y0) * k + Math.sin(k * Math.PI) * K.wys;
      to.set(S.x1 - S.x0, 0, S.z1 - S.z0).normalize();
      if (k >= 1) { e.lot = false; e.ty = g1; S.faz = null; S.cd = K.co * lag('kapCd'); ladowanieGommone(e, K); }
      return 0;
    }
    case 5: {                                        // GIRANDOLA: telegraf → wir 3 s z tarczą r 3,2 → zawroty 3 s
      const S = e.kS || (e.kS = { faz: 'marsz', t: 0 });
      const h = e.bb.h;
      S.t -= dt;
      if (S.faz === 'marsz') {
        if (d < K.start && es > 0) {
          S.faz = 'tel'; S.t = K.tel;
          telegraf('krag', e.pos.x, e.pos.z, { r: K.r, kolor: 0xff5fb0, dur: K.tel, puls: true, sledz: e, a: 0.95 });
          telegraf('dysk', e.pos.x, e.pos.z, { r: K.r, kolor: 0xff5fb0, dur: K.tel, rosnie: true, sledz: e, a: 0.35, strefa: false });
        }
        return es;
      }
      if (S.faz === 'tel') {
        if (S.t <= 0) {
          S.faz = 'wir'; S.t = K.wir; S.traf = new Set();
          S.tarcza = telegraf('krag', e.pos.x, e.pos.z, { r: K.r, kolor: 0xff5fb0, dur: K.wir, sledz: e, a: 0.8 });
          AUDIO.sfx('piorun');
        }
        return 0;
      }
      if (S.faz === 'wir') {
        e.bb.mesh.scale.x = h * (0.32 + 0.68 * Math.abs(Math.cos(G.time * 14)));   // piła tarczowa (jak Lollini, szybciej)
        if (d < K.r && P.y - e.ty < 1.2 && P.iframes <= 0) {
          if (ranGracza(obrazeniaWroga(K.dmg), 'kapral5', { shake: 0.5 })) {
            const kx = P.pos.x - e.pos.x, kz = P.pos.z - e.pos.z, kl = Math.hypot(kx, kz) || 1;
            P.kbx = kx / kl * K.odrzut; P.kbz = kz / kl * K.odrzut;
          }
        }
        tlumWKregu(e.pos.x, e.pos.z, K.r, K.tlum, 'kapral5', S.traf);   // każdy wróg na trasie raz na wir
        if (S.t <= 0) { S.faz = 'zaw'; S.t = K.zaw; S.popT = 0; e.bb.mesh.scale.set(h, h, 1); }
        return K.tempoWir;                             // 5,0 j./s — Carrotello 7,13 ucieknie, Beetino 5,27 ledwo
      }
      if (S.faz === 'zaw') {                           // ZAWROTY: stoi i się chwieje — okno na obrażenia
        e.bb.mesh.scale.x = h * (1 + 0.08 * Math.sin(G.time * 9));
        S.popT -= dt;
        if (S.popT <= 0) { S.popT = 0.9; dmgPop(e.pos.x, e.ty + 1.4, e.pos.z, '@', '#ff9fd0', 1.6); }
        if (S.t <= 0) { S.faz = 'marsz'; e.bb.mesh.scale.set(h, h, 1); }
        return 0;
      }
      return es;
    }
    case 6: {                                        // BOTTO: lont 1,6 s (krąg r 5,5), wielka bomba rani też hordę
      const S = e.kS || (e.kS = { faz: null, t: 0, cd: 0 });
      const h = e.bb.h;
      S.cd -= dt; S.t -= dt;
      if (!S.faz) {
        if (S.cd <= 0 && d < K.zasieg && es > 0) {
          S.faz = 'lont'; S.t = K.lont; S.x = e.pos.x; S.z = e.pos.z;
          telegraf('krag', S.x, S.z, { r: K.r, kolor: 0xff2a2a, dur: K.lont, puls: true, a: 0.95 });
          telegraf('dysk', S.x, S.z, { r: K.r, kolor: 0xff2a2a, dur: K.lont, rosnie: true, a: 0.3, strefa: false });
          dmgPop(e.pos.x, e.ty + 1.6, e.pos.z, T('SSS!', 'HSSS!'), '#ff9d3f', 1.4, 'wazny');
        }
        return es;
      }
      if (S.faz === 'lont') {                          // stoi i puchnie (jak Sodino przed wybuchem)
        e.bb.mesh.scale.setScalar(h * (1 + Math.sin(G.time * 30) * 0.1 + 0.25 * (1 - S.t / K.lont)));
        if (S.t <= 0) {
          e.bb.mesh.scale.set(h, h, 1);
          S.faz = 'zadyszka'; S.t = K.zadyszka;
          wybuchBotta(e, K, S);
        }
        return 0;
      }
      if (S.faz === 'zadyszka') { if (S.t <= 0) { S.faz = null; S.cd = K.cd * lag('kapCd'); } return 0; }
      return es;
    }
    default: return es;                              // 1 Pianissimo: sztuczka dopiero przy śmierci (nagrodaKaprala)
  }
}
// Wybuch Botta: gracz 250 HP (stałe, bez dmgMul), WSZYSCY zwykli wrogowie w kręgu giną (zabójstwa gracza → seria),
// sam traci 12% maxHp. Uczy wciągania kaprala w hordę.
function wybuchBotta(e, K, S) {
  novaRing(S.x, S.z, K.r);
  puff(S.x, e.ty + 1.2, S.z, 0xff9d3f, 3.2);
  okruchy(S.x, e.ty + 0.8, S.z, 0x7a4426, 12);
  okruchy(S.x, e.ty + 0.8, S.z, 0xff9d3f, 10);
  AUDIO.sfx('wybuch');
  G.shake = Math.max(G.shake, 0.6);
  dmgPop(S.x, e.ty + 1.4, S.z, T('BUM!', 'BOOM!'), '#ff9d3f', 2.2);
  if (Math.hypot(P.pos.x - S.x, P.pos.z - S.z) < K.r && P.y - e.ty < 2) ranGracza(K.dmg, 'kapral6', { shake: 0.6 });
  const ofiary = [];
  for (const o of G.enemies) {
    if (o.dying || o.kapral || o.T.boss || o.odwrot) continue;
    if ((o.pos.x - S.x) ** 2 + (o.pos.z - S.z) ** 2 < K.r * K.r) ofiary.push(o);
  }
  for (const o of ofiary) { G.dmgBron.kapral6 = (G.dmgBron.kapral6 || 0) + Math.max(0, o.hp); o.hp = 0; killEnemy(o); }
  zadajDmg(e, e.maxHp * K.sam, { bezSkali: true, bezKryt: true, zr: 'kapral6', col: '#ff9d3f' });
}
// Lądowanie Gommone: fala r 3 — gracz 200 × dmgMul, zwykli wrogowie w kręgu tracą 50% maxHp (zwab go w tłum)
function ladowanieGommone(e, K) {
  novaRing(e.pos.x, e.pos.z, K.r);
  okruchy(e.pos.x, e.ty + 0.3, e.pos.z, 0xe04a3c, 10);
  AUDIO.sfx('wybuch');
  G.shake = Math.max(G.shake, 0.45);
  if (Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) < K.r && P.y - e.ty < 1.5)
    ranGracza(obrazeniaWroga(K.dmg), 'kapral4', { shake: 0.5 });
  tlumWKregu(e.pos.x, e.pos.z, K.r, K.tlum, 'kapral4');
}
// zwykli wrogowie w kręgu tracą `ulamek` maxHp (liczą się jako zabójstwa gracza); kaprale i Don nietknięci
function tlumWKregu(x, z, r, ulamek, zr, trafieni = null) {
  for (const o of G.enemies) {
    if (o.dying || o.kapral || o.T.boss || o.odwrot) continue;
    if ((o.pos.x - x) ** 2 + (o.pos.z - z) ** 2 > r * r) continue;
    if (trafieni) { if (trafieni.has(o)) continue; trafieni.add(o); }
    zadajDmg(o, o.maxHp * ulamek, { bezSkali: true, bezKryt: true, noPop: true, zr });
  }
}
// Pas szarży Frittone: kierunek na gracza zamrożony w chwili telegrafu, pomarańczowy pas 14 × 1,2 j. od kaprala
function pasFrittone(e, S, K, dur) {
  S.dir.set(P.pos.x - e.pos.x, 0, P.pos.z - e.pos.z).normalize();
  telegraf('pas', e.pos.x, e.pos.z, { dl: K.pas[0], sz: K.pas[1], kat: Math.atan2(S.dir.x, S.dir.z), kolor: 0xff8a1e, dur, a: 0.95 });
}
// Salwa: środkowy glob w przewidzianą pozycję gracza (wyprzedzenie jak Ketchupino), boczne ±3,5 j. prostopadle
// do kierunku biegu (gdy stoi — do kierunku na kaprala) → linia w poprzek drogi, uciekać trzeba przód/tył
function salwaSalsy(e, K) {
  const lead = KETCH_LOT * 0.55, cx = P.pos.x + P.vx * lead, cz = P.pos.z + P.vz * lead;
  const v = Math.hypot(P.vx, P.vz);
  let px, pz;
  if (v > 1) { px = -P.vz / v; pz = P.vx / v; }
  else { const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, l = Math.hypot(dx, dz) || 1; px = -dz / l; pz = dx / l; }
  const dmg = obrazeniaWroga(K.dmg);
  for (const k of [-1, 0, 1]) plunKetchupem(e, cx + px * k * K.bok, cz + pz * k * K.bok, dmg, 'kapral2');
}
// PINIATA (spec §2.4), w tej kolejności: oprawa → fontanna XP (1 pełny poziom) → Skrzynia Kaprala →
// moneta 15 → serce → statystyki. Pianissimo dodatkowo dzieli się na 4 średnie Marshmallini.
function nagrodaKaprala(e) {
  const K = e.kDef, x = e.pos.x, z = e.pos.z;
  G.hitstop = Math.max(G.hitstop, 0.12);
  G.kino = Math.max(G.kino, 0.6);
  dmgPop(x, e.ty + 1.6, z, T('PINIATA!', 'PINATA!'), '#c07bff', 2.4, 'wazny');
  for (const kol of [0xc07bff, 0xffd75e, 0xff6fa5, 0x7ee7ff, 0x9be15d]) okruchy(x, e.ty + 1.2, z, kol, 6);
  AUDIO.sfx('zlota');
  padWibruj(0.6, 160);
  // fontanna XP: 12 pigułek o łącznej wartości xpDoNast(P.lvl) = P.xpNeed (pickup mnoży przez xpPigulki)
  // EKONOMIA: pickup mnoży też przez ekon.xp i tu tego NIE odwracamy → fontanna v2 = 0,6 × 0,5 = 0,3 poziomu
  const val = P.xpNeed * trudn().piniataPoziom / ((CFG_BIEG.xpPigulki || 1) * lag('xp')) / 12;   // TRUDNOŚĆ v2: 1 → 0,6 poziomu
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2 + Math.random() * 0.4, r = 2 + Math.random() * 2;
    G.gems.push(makeGem(x + Math.sin(a) * r, z + Math.cos(a) * r, val));
  }
  postawSkrzynieKaprala(x, z);
  // E2 K8: Granny „Babcia wie lepiej" — dodatkowy wybór (bez XP i bez poziomu), co najmniej jedna karta niebieska
  if (charKey === 'granny') pchnijOverlay(() => { G.babcia = (G.babcia || 0) + 1; showCards({ zrodlo: 'babcia', minRz: 'nieb' }); });
  G.coins.push(makeCoin(x + 0.9, z + 0.4, CFG_BIEG.monety.kapral));   // B8: stała nagroda (bez mnożnika serii)
  // serca: 1 + litość (drugie przy HP ≤ 30%, łagodny ≤ 45%) × trudn().ekon.serceKapral — v2 (0,5): 50% na 1 serce,
  // przy HP ≤ 30% pewne 1 (łagodny bez zmian: 1 + litość)
  const nS = ileLos((1 + (P.hp <= P.maxHp * (G.lagodny ? CFG_BIEG.trybLagodny.litosc : CFG_BIEG.litosc) ? 1 : 0)) * ekonBieg('serceKapral'));
  for (let k = 0; k < nS; k++) G.hps.push(makeHeart(x - 0.9, z + 0.4 - k));
  G.kaprale = (G.kaprale || 0) + 1;
  META.st.kaprale = (META.st.kaprale || 0) + 1; saveMetaSoon();
  const tt = 90 * e.kapral;
  STATY.zdarzenie('kapral/' + Math.floor(tt / 60) + '-' + String(tt % 60).padStart(2, '0'), 'Kapral ' + e.kapral + ' pokonany');
  G.zdarzenia.push({ t: +G.time.toFixed(1), typ: 'kapral' + e.kapral + '-smierc', ttk: +(G.time - e.kStart).toFixed(1) });
  if (K.dzieci) {                                  // 1 Pianissimo: 4 średnie (każde dzieli się normalnie na 2)
    const T0 = ENEMY_TYPES[K.typ];
    const dx = x - P.pos.x, dz = z - P.pos.z, dl = Math.hypot(dx, dz) || 1, odsun = Math.max(0, 3.6 - dl);
    const sx = x + dx / dl * odsun, sz = z + dz / dl * odsun;   // środek kółka dzieci ≥ 3,6 j. od gracza
    const ile = Math.min(K.dzieci, MAX_WROGOW + 1 - liczZywych());   // kapral jeszcze liczy się jako żywy
    for (let k = 0; k < ile; k++) {
      const a = k / ile * Math.PI * 2 + Math.random() * 0.5;
      const m = spawnEnemy(K.typ, null, { x: sx + Math.sin(a) * 1.8, z: sz + Math.cos(a) * 1.8 }, { elita: 'nie', skala: K.dzieckoSkala });
      m.hp = m.maxHp = K.dzieckoHp * T0.hp * SKALA_WROGA * hpScale();
      m.stun = 0.3;
      if (e.odwrot || G.cisza) m.odwrot = true;    // zabity w ciszy: dzieci też uciekają (nie gryzą przed Donem)
    }
  }
}
// JEDNA FUNKCJA NAGRODY ZE SKRZYNI KAPRALA. E2 (spec 08 §1.7): podmień ciało na
// `pchnijOverlay(() => otworzZlotaSkrzynie('kapral'))` — reszta piniaty zostaje bez zmian.
function nagrodaSkrzyniKaprala() {
  pchnijOverlay(() => otworzZlotaSkrzynie('kapral'));    // E2 K4: jackpot kaprala (przepis zawsze w środku, jeśli gotowy)
}
let kapRingMat = null;
function postawSkrzynieKaprala(x, z) {
  if (!kapRingMat) {
    kapRingMat = new THREE.MeshBasicMaterial({ map: ringTexture('rgba(192,123,255,0.95)'), transparent: true, depthWrite: false });
    // STRUMIEŃ BOTA: dawniej tu powstawał klon materiału skrzyni (1 UUID three = 4 × Math.random). Bez tych
    // 4 losowań seed bota rozjeżdżał się od pierwszego kaprala i pomiary sprzed modeli 3D przestawały się zgadzać.
    for (let i = 0; i < 4; i++) Math.random();
  }
  // 30.09: model 3D „kapral" (ciemna śliwka + fiolet elit) rysuje syncSkrzynie3D; `mesh` = nośnik pozycji poza sceną
  const mesh = new THREE.Object3D(), ring = new THREE.Mesh(blobGeo, kapRingMat);
  ring.scale.setScalar(3.4);
  scene.add(ring);                                 // najwyżej kilka na bieg — nie efekt masowy
  G.skrzynieKap.push({ mesh, ring, pos: new THREE.Vector3(x, 0, z), t: 0 });
}
function updateSkrzynieKaprala(dt) {
  for (let i = G.skrzynieKap.length - 1; i >= 0; i--) {
    const c = G.skrzynieKap[i];
    c.t += dt;
    const d = c.pos.distanceTo(P.pos);
    // „Nonna sprząta stół" (cisza 9:53, G.vacuum): niepodniesiona skrzynia leci do gracza — nagroda nie przepada
    if (G.vacuum > 0 && d > 0.5) c.pos.addScaledVector(_doGracza.copy(P.pos).sub(c.pos).setY(0).normalize(), Math.min(d, 16 * dt));
    const g = terrainH(c.pos.x, c.pos.z);
    c.mesh.position.set(c.pos.x, g + MS.ANIM.unoszenie(c.t).dy, c.pos.z);
    c.ring.position.set(c.pos.x, g + 0.07, c.pos.z);
    c.ring.scale.setScalar(3.4 + Math.sin(c.t * 3) * 0.5);
    // E2 K5: nad Skrzynią Kaprala wisi złota ikona dania, gdy przepis jest gotowy — widać z daleka, że tam czeka danie
    const got = przepisyGotowe();
    if (got.length && c === najblizszaSkrzyniaKaprala()) {   // danie dostanie tylko jedna skrzynia — ikona nad najbliższą
      const mat = matDania(WEAPONS[got[0].key].evoIco);
      if (!c.danie) { c.danie = new THREE.Mesh(unitGeo, mat); c.danie.scale.set(1.2, 1.2, 1); c.danie.renderOrder = 960; scene.add(c.danie); }
      else if (c.danie.material !== mat) c.danie.material = mat;
      c.danie.position.set(c.pos.x, g + 2.5 + Math.sin(c.t * 3) * 0.15, c.pos.z);
      c.danie.rotation.y = camYaw;
    } else if (c.danie) { scene.remove(c.danie); c.danie = null; }
    if (c.t > 0.3 && d < 1.6) {
      scene.remove(c.mesh); scene.remove(c.ring); if (c.danie) scene.remove(c.danie);
      G.skrzynieKap.splice(i, 1);
      G.shake = Math.max(G.shake, 0.2);
      AUDIO.sfx('zlota');
      novaRing(c.pos.x, c.pos.z, 3);
      otworzKufer3D('kapral', c.pos, c.t, nagrodaSkrzyniKaprala);   // 30.09: wieko 3D, potem jackpot
    }
  }
}
const _matDania = {};
function matDania(ikona) {                         // ikona 8×8 z icons.js jako tekstura billboardu (bez nowych grafik)
  if (_matDania[ikona]) return _matDania[ikona];
  const t = new THREE.TextureLoader().load(icon(ikona, 4));
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return (_matDania[ikona] = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
}
function najblizszaSkrzyniaKaprala() {
  let naj = null, nd = 1e9;
  for (const c of G.skrzynieKap) { const d = c.pos.distanceTo(P.pos); if (d < nd) { nd = d; naj = c; } }
  return naj;
}

// ============================== E1-bieg K8: DON CHIPSO (spec 07 §3) ==============================
// NAPIS NA ŚRODKU (cisza, wejście, faza 2, wściekłość, wygrana) — ten sam element co imię bossa (#bossNm)
let _napisT = 0;
function napis(html, ms = 1800, kolor = null) {
  const nm = document.getElementById('bossNm');
  nm.innerHTML = html; nm.style.color = kolor || '';
  nm.classList.add('on');
  clearTimeout(_napisT);
  _napisT = setTimeout(() => nm.classList.remove('on'), ms);
}
// CISZA 9:52 (§3.1): spawner, podłoga, obręcze, zegar Ketchupino i zdarzenia stoją (spawnerWieczoru),
// wszyscy zwykli wrogowie, elity i żywi kaprale idą w ODWRÓT (pętla wrogów), muzyka gaśnie
function zacznijCisze() {
  if (G.cisza) return;
  G.cisza = true;
  G.kolejkaSpawnu = []; G.kolejkaFal = [];
  for (const e of G.enemies) {
    if (e.dying || e.T.boss) continue;
    if (e.T.szarzuje || e.T.wiruje || e.kapral || e.zapalony) e.bb.mesh.scale.set(e.bb.h, e.bb.h, 1);
    e.odwrot = true; e.faz = null; e.zapalony = false; e.sciana = null; e.kS = null; e.lot = false; e.stun = 0; e.wirujeTeraz = false;
  }
  for (const t of G.telegrafy) t.koniec = true;
  AUDIO.cisza();
  G.zdarzenia.push({ t: +G.time.toFixed(1), typ: 'cisza-odwrot', zywi: liczZywych() });
}
function ciszaKrok(z) {
  if (G.donStart != null) return;                  // Don już jest (HORDA.don() przed 9:58) — kroki ciszy nieaktualne
  switch (z.k) {
    case 'odkurz': G.vacuum = Math.max(G.vacuum, 3); break;                 // 9:53 „Nonna sprząta stół"
    case 'szelest': AUDIO.sfx('szelest', { g: z.g }); break;                // 9:54 / 9:57 / 9:59, coraz głośniej
    case 'napis1': napis(T('Szelest torby…', 'A bag rustles…'), 2400, '#e8dcc0'); break;
    case 'napis2': pasy(true); winieta(true); napis(T('Nic osobistego.', 'Nothing personal.'), 1900); break;
  }
}
// WEJŚCIE (§3.2): Don spada z +12 j. przed kamerą (0,6 s, `jump`), lądowanie = fala r 5 bez obrażeń
// i odrzut gracza ~3 j., potem wejscieBossa() (napis, pasy, kino) i 2 s łaski przed pierwszym atakiem.
// `dev` (HORDA.don()): najpierw cisza, żeby horda odeszła jak w prawdziwym biegu.
function wejscieDona(dev = false) {
  if (G.donStart != null || G.dying || !G.running) return null;
  if (dev) zacznijCisze();
  const D = CFG_BIEG.don;
  const e = spawnEnemy('boss', katKamery(), null, { r: [15, 17], elita: 'nie' });
  e.don = true; e.bezKb = true; e.tempo = D.tempo;
  e.hp = e.maxHp = D.hp * SKALA_WROGA * lag('donHp') * zalew().hp.don;   // stała godzina = stałe HP (bez hpScale), jedno dla wszystkich postaci; K10: łagodny ×0,12 (trybLagodny.donHp); ZALEW ×1,5
  e.donS = { stan: 'spada', t: 0, dl: 0.6, faza: 1, walkaT: 0, cdShur: 0, cdSalt: 0, cdChiam: D.chiam.pierwsza, lawinaT: 0, wsc: false };
  e.ty += 12; e.lot = true;
  e.bb.play('jump', false);
  G.donStart = G.time;
  META.st.donReached = (META.st.donReached || 0) + 1; saveMetaSoon();
  STATY.zdarzenie('don/start', 'Don Chipso wchodzi');
  G.zdarzenia.push({ t: +G.time.toFixed(1), typ: 'don-start' });
  return e;
}
function ladowanieDona(e) {
  novaRing(e.pos.x, e.pos.z, 5);
  novaRing(e.pos.x, e.pos.z, 2.5);
  puff(e.pos.x, e.ty + 1, e.pos.z, 0xffd75e, 3.5);
  okruchy(e.pos.x, e.ty + 0.5, e.pos.z, 0xf2c14a, 16);
  AUDIO.sfx('wybuch');
  G.shake = Math.max(G.shake, 0.6);
  const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
  if (d < 5) { P.kbx = dx / d * 21; P.kbz = dz / d * 21; }   // 21 j./s gasnące 7/s ≈ 3 j. odrzutu
  wejscieBossa();
  AUDIO.bossOn();
}
const liczChiamate = () => { let n = 0; for (const o of G.enemies) if (o.chiamata && !o.dying) n++; return n; };
// ATAKI (§3.4–3.6). Naraz najwyżej jeden z trzech, po każdym 0,8 s odpoczynku (stoi — okno na obrażenia).
// Priorytet: Chiamata (gotowa) → Salt Storm (gracz 3–11 j. w stożku ±60°) → Shuriken (≤ 24 j.).
// Faza 2: lawina chipsów równolegle; wściekłość po 150 s: cooldowny ×0,6, tempo ×1,2, lawina 4 kręgi.
// Don ignoruje Mrożonki i spowolnienie (sam liczy tempo), zwraca prędkość marszu.
function aiDona(e, dt, d, to) {
  const D = CFG_BIEG.don, S = e.donS;
  const f2 = S.faza === 2, mnCd = (S.wsc ? D.wscieklosc.cd : 1) * lag('donCd');   // K10: łagodny ×1,25
  S.t += dt;
  if (S.stan !== 'spada') {
    S.walkaT += dt;
    S.cdShur -= dt; S.cdSalt -= dt; S.cdChiam -= dt;
    if (!S.wsc && S.walkaT >= D.wscieklosc.po) {
      S.wsc = true;
      napis(T('DON SIĘ WŚCIEKA!', 'THE DON IS FURIOUS!'), 2000, '#ff4a4a');
      G.shake = Math.max(G.shake, 0.5);
      AUDIO.sfx('boss');
      G.zdarzenia.push({ t: +G.time.toFixed(1), typ: 'don-wscieklosc' });
    }
    if (f2 && S.stan !== 'przejscie') {
      S.lawinaT -= dt;
      if (S.lawinaT <= 0) { S.lawinaT = D.lawina.co * mnCd; lawinaDona(S.wsc ? D.wscieklosc.lawinaN : (G.lagodny ? CFG_BIEG.trybLagodny.lawinaN : D.lawina.n)); }
    }
  }
  const tempo = D.tempo * (f2 ? D.f2Tempo : 1) * (S.wsc ? D.wscieklosc.tempo : 1) * (d > 26 ? 1.35 : 1);
  const zmien = (stan, dl) => { S.stan = stan; S.t = 0; S.dl = dl; };
  switch (S.stan) {
    case 'spada': {
      const k = Math.min(1, S.t / S.dl), g = terrainH(e.pos.x, e.pos.z);
      e.ty = g + 12 * (1 - k * k);
      if (k >= 1) { e.lot = false; e.ty = g; ladowanieDona(e); zmien('laska', D.laska); }
      return 0;
    }
    case 'laska':                                    // 2 s łaski: idzie, nie atakuje
      e.bb.play('run');
      if (S.t >= S.dl) zmien('chodzi', 0);
      return tempo;
    case 'chodzi': {
      e.bb.play('run');
      if (S.cdChiam <= 0 && liczChiamate() < D.chiam.limit) {
        zmien('chiam', D.chiam.tel); e.bb.play('jump');
        AUDIO.sfx('szelest', { g: 1 });
        napis('LA CHIAMATA!', 1300);
        return 0;
      }
      const sol = f2 ? D.sol2 : D.sol;
      if (S.cdSalt <= 0 && d >= D.sol.min && d <= sol.r && wStozkuDona(e, D.sol.stozek)) {
        zmien('solTel', D.sol.tel); e.bb.play('idle');
        const pol = sol.kat / 2 * Math.PI / 180;
        G.solAkt = { x: e.pos.x, z: e.pos.z, a: Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z), r: sol.r, pol, kat: sol.kat, k: 0, dmuch: false };
        return 0;
      }
      if (S.cdShur <= 0 && d <= D.shur.maxD) {
        zmien('shur', D.shur.tel); e.bb.play('idle');
        telegraf('krag', e.pos.x, e.pos.z, { r: 1.5, kolor: 0xffffff, dur: D.shur.tel, sledz: e, strefa: false });
        AUDIO.sfx('strzal');
        return 0;
      }
      return tempo;
    }
    case 'shur':
      if (S.t >= S.dl) { rzutShuriken(e, f2); S.cdShur = (f2 ? D.shur2.cd : D.shur.cd) * mnCd; zmien('odp', D.odpoczynek); }
      return 0;
    case 'solTel': case 'sol': {
      const A = G.solAkt;
      if (!A) { zmien('odp', D.odpoczynek); return 0; }
      to.set(Math.sin(A.a), 0, Math.cos(A.a));
      if (S.stan === 'solTel') {
        A.k = Math.min(1, S.t / S.dl);                // wycinek wypełnia się od Dona na zewnątrz
        if (S.t >= S.dl) { zmien('sol', D.sol.czas); A.dmuch = true; S.solTik = 0; AUDIO.sfx('piorun'); }
      } else {
        S.solTik -= dt;
        if (S.solTik <= 0) {                          // tik 25 co 0,25 s = 100 HP/s, BEZ nietykalności
          S.solTik += D.sol.tik;
          if (wSoli(P.pos.x, P.pos.z)) { ranGracza(D.sol.dmg, 'don-sol', { dot: true, shake: 0.12 }); P.zasolT = D.sol.slowT; }
        }
        for (let k = 0; k < 2; k++) {                 // białe okruchy soli w wycinku
          const a = A.a + (Math.random() - 0.5) * 2 * A.pol, r = 1 + Math.random() * (A.r - 1);
          const x = A.x + Math.sin(a) * r, z = A.z + Math.cos(a) * r;
          okruchy(x, terrainH(x, z) + 0.5, z, 0xffffff, 1);
        }
        if (S.t >= S.dl) { ukryjSol(); S.cdSalt = (f2 ? D.sol2.cd : D.sol.cd) * mnCd; zmien('odp', D.odpoczynek); }
      }
      return 0;
    }
    case 'chiam':
      if (S.t >= S.dl) { chiamata(e, f2 ? D.chiam2.n : D.chiam.n); S.cdChiam = (f2 ? D.chiam2.cd : D.chiam.cd) * mnCd; zmien('odp', D.odpoczynek); }
      return 0;
    case 'odp':
      e.bb.play('idle');
      if (S.t >= S.dl) zmien('chodzi', 0);
      return 0;
    case 'przejscie':
      e.bb.play('jump');
      if (S.t >= S.dl) { e.nietyk = false; S.faza = 2; S.lawinaT = 0.6; zmien('chodzi', 0); }
      return 0;
  }
  return tempo;
}
function wStozkuDona(e, stopnie) {
  const a = Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
  const r = Math.abs(((a - e.bb.facing) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  return r <= stopnie * Math.PI / 180;
}
function wSoli(px, pz) {
  const A = G.solAkt;
  if (!A || !A.dmuch) return false;
  const dx = px - A.x, dz = pz - A.z, d = Math.hypot(dx, dz);
  if (d > A.r) return false;
  const r = Math.abs(((Math.atan2(dx, dz) - A.a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  return r <= A.pol || d < 1.2;
}
const solStrefa = () => G.solAkt;                   // bot: wycinek soli jako strefa do opuszczenia
// SALT STORM: dwa stałe meshe (obrys + wypełnienie) tworzone raz; geometria 45° albo 60° (faza 2)
let _sol = null;
function solMeshe() {
  if (_sol) return _sol;
  const geo = kat => { const g = new THREE.CircleGeometry(1, 28, -Math.PI / 2 - kat / 2, kat); g.rotateX(-Math.PI / 2); return g; };
  const mat = a => new THREE.MeshBasicMaterial({ color: 0xf6fbff, transparent: true, opacity: a, depthWrite: false, depthTest: false, fog: false });
  _sol = { g45: geo(Math.PI / 4), g60: geo(Math.PI / 3), obrys: null, wyp: null };
  _sol.obrys = new THREE.Mesh(_sol.g45, mat(0.22)); _sol.obrys.renderOrder = 948;
  _sol.wyp = new THREE.Mesh(_sol.g45, mat(0.5)); _sol.wyp.renderOrder = 949;
  _sol.obrys.visible = _sol.wyp.visible = false;
  scene.add(_sol.obrys); scene.add(_sol.wyp);
  return _sol;
}
function rysujSol() {
  const A = G.solAkt;
  if (!A) { if (_sol) _sol.obrys.visible = _sol.wyp.visible = false; return; }
  const M = solMeshe(), g = A.kat > 50 ? M.g60 : M.g45, y = terrainH(A.x, A.z) + 0.1;
  for (const m of [M.obrys, M.wyp]) { m.geometry = g; m.position.set(A.x, y, A.z); m.rotation.set(0, A.a, 0); m.visible = true; }
  M.obrys.scale.set(A.r, 1, A.r);
  const k = A.dmuch ? 1 : Math.max(0.04, A.k);
  M.wyp.scale.set(A.r * k, 1, A.r * k);
  M.wyp.material.opacity = A.dmuch ? 0.42 + 0.14 * Math.sin(G.time * 18) : 0.38 + 0.2 * A.k;
}
function ukryjSol() { G.solAkt = null; if (_sol) _sol.obrys.visible = _sol.wyp.visible = false; }
// CHIP SHURIKEN: wachlarz chipsów (3 × ±18°, faza 2: 5 × ±30°), skrajne skręcają do środka ω 0,6 rad/s
function rzutShuriken(e, f2) {
  const D = CFG_BIEG.don, s = f2 ? Object.assign({}, D.shur, D.shur2) : D.shur;
  const a0 = Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
  for (let i = 0; i < s.n; i++) {
    const off = (i / (s.n - 1) - 0.5) * 2 * s.kat * Math.PI / 180;
    const o = new THREE.Object3D(); o.scale.set(0.9, 0.9, 1);
    G.donPoc.push({ o, x: e.pos.x, z: e.pos.z, y: e.ty + 1.4, a: a0 + off, v: s.v,
                    w: Math.abs(off) < 1e-3 ? 0 : -Math.sign(off) * s.omega, zyc: s.zasieg / s.v, spin: Math.random() * 6 });
  }
  AUDIO.sfx('strzal');
}
function updateDonPoc(dt) {
  const D = CFG_BIEG.don.shur;
  for (let i = G.donPoc.length - 1; i >= 0; i--) {
    const c = G.donPoc[i];
    c.zyc -= dt; c.a += c.w * dt;
    c.x += Math.sin(c.a) * c.v * dt; c.z += Math.cos(c.a) * c.v * dt;
    const g = terrainH(c.x, c.z);
    c.y += (g + 1.0 - c.y) * Math.min(1, 3 * dt);
    c.spin += dt * 12;
    c.o.position.set(c.x, c.y, c.z);
    c.o.rotation.set(0, camYaw, c.spin);
    if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < D.r && P.y - terrainH(P.pos.x, P.pos.z) < 1.2) {
      ranGracza(D.dmg, 'don-shuriken', { shake: 0.3 });
      okruchy(c.x, c.y, c.z, 0xf2c14a, 5);
      G.donPoc.splice(i, 1); continue;
    }
    if (c.zyc <= 0) G.donPoc.splice(i, 1);
  }
}
// LA CHIAMATA: 8 (faza 2: 12) Chipsettich w okręgu r 3,5 wokół Dona, z rezerwy, HP jak w 10:00, limit 30
function chiamata(e, n) {
  const L = CFG_BIEG.don.chiam;
  n = Math.min(n, L.limit - liczChiamate(), MAX_WROGOW - liczZywych());
  const hp = ENEMY_TYPES.chipsetti.hp * SKALA_WROGA * hpScale(CZAS_WIECZORU);
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2;
    const m = spawnEnemy('chipsetti', null, { x: e.pos.x + Math.sin(a) * L.r, z: e.pos.z + Math.cos(a) * L.r }, { elita: 'nie' });
    m.chiamata = true; m.stun = 0.3; m.hp = m.maxHp = hp;
    if (k % 2 === 0) puff(m.pos.x, m.ty + 0.6, m.pos.z, 0xf2c14a, 1.2);
  }
  G.shake = Math.max(G.shake, 0.2);
}
// LAWINA CHIPSÓW (faza 2): co 2 s 3 kręgi r 2,2 — jeden w przewidzianą pozycję gracza (0,6 s), dwa 3–7 j. od
// niego; złota obwódka zaciska się, na koniec chips spada z +8 j. w 0,25 s. Gracz w kręgu 200 HP (nietykalność
// działa), zwykli wrogowie −30% maxHp (Chiamata sama się przerzedza).
function lawinaDona(n) {
  const L = CFG_BIEG.don.lawina;
  for (let k = 0; k < n; k++) {
    let x, z;
    if (k === 0) { x = P.pos.x + P.vx * L.wyprz; z = P.pos.z + P.vz * L.wyprz; }
    else { const a = Math.random() * Math.PI * 2, r = L.los[0] + Math.random() * (L.los[1] - L.los[0]); x = P.pos.x + Math.sin(a) * r; z = P.pos.z + Math.cos(a) * r; }
    telegraf('krag', x, z, { r: L.r, kolor: 0xffd23c, dur: L.tel + L.spad, zacisk: true, a: 0.95 });
    telegraf('dysk', x, z, { r: L.r, kolor: 0xffd23c, dur: L.tel + L.spad, rosnie: true, a: 0.28, strefa: false });
    G.lawina.push({ x, z, t: 0, o: null, spin: Math.random() * 6 });
  }
}
function updateLawina(dt) {
  const L = CFG_BIEG.don.lawina;
  for (let i = G.lawina.length - 1; i >= 0; i--) {
    const l = G.lawina[i];
    l.t += dt;
    const g = terrainH(l.x, l.z);
    if (l.t >= L.tel) {
      if (!l.o) { l.o = new THREE.Object3D(); l.o.scale.set(1.7, 1.7, 1); }
      const k = Math.min(1, (l.t - L.tel) / L.spad);
      l.spin += dt * 8;
      l.o.position.set(l.x, g + 0.7 + L.wys * (1 - k), l.z);
      l.o.rotation.set(0, camYaw, l.spin);
    }
    if (l.t < L.tel + L.spad) continue;
    G.lawina.splice(i, 1);                             // UDERZENIE
    novaRing(l.x, l.z, L.r);
    okruchy(l.x, g + 0.4, l.z, 0xf2c14a, 8);
    AUDIO.sfx('wybuch');
    G.shake = Math.max(G.shake, 0.2);
    if (Math.hypot(P.pos.x - l.x, P.pos.z - l.z) < L.r && P.y - g < 1.5) ranGracza(L.dmg, 'don-lawina', { shake: 0.4 });
    tlumWKregu(l.x, l.z, L.r, L.tlum, 'don');
  }
}
// PRZEJŚCIE W FAZĘ 2 (§3.5): 1,5 s nietykalności, hitstop, 40 złotych okruchów, napis, sprite ×1,1
function donFaza2(e) {
  const S = e.donS;
  if (!S || S.faza !== 1) return;
  S.faza = 1.5; S.stan = 'przejscie'; S.t = 0; S.dl = CFG_BIEG.don.przejscie;
  e.nietyk = true;
  ukryjSol();
  G.hitstop = Math.max(G.hitstop, 0.15);
  G.shake = Math.max(G.shake, 0.6);
  for (let k = 0; k < 4; k++) okruchy(e.pos.x, e.ty + 1.5, e.pos.z, 0xffd23c, 10);
  napis(T('Nic osobistego. Sama sól.', 'Nothing personal. Just salt.'), 2200);
  e.bb.mesh.scale.multiplyScalar(1.1);
  G.donFaza2 = G.time;
  STATY.zdarzenie('don/faza2', 'Don Chipso: faza 2');
  G.zdarzenia.push({ t: +G.time.toFixed(1), typ: 'don-faza2', po: +(G.time - G.donStart).toFixed(1) });
}
// ZWYCIĘSTWO (§3.8): czas liczony REALNIE od śmierci Dona (kino zwalnia świat do ×0,4)
function zwyciestwo(e) {
  if (G.wygrana) return;
  G.wygrana = { t: 0, x: e.pos.x, z: e.pos.z, krok: 0, lancuch: null };
  G.donKoniec = G.time;
  G.hitstop = Math.max(G.hitstop, 0.35);
  G.kino = 2.0; G.kinoMn = 0.4;
  G.shake = Math.max(G.shake, 0.8);
  ukryjSol();
  G.telegrafy.length = 0; G.donPoc.length = 0; G.lawina.length = 0;
  AUDIO.cisza();
  G.zdarzenia.push({ t: +G.time.toFixed(1), typ: 'don-smierc', walka: +(G.time - G.donStart).toFixed(1) });
}
function updateZwyciestwa(dtR) {
  const W = G.wygrana, D = CFG_BIEG.don;
  W.t += dtR;
  if (W.krok < 1 && W.t >= 0.2) {                  // pozostali z Chiamaty giną łańcuchem w 1 s
    W.krok = 1;
    W.lancuch = G.enemies.filter(o => !o.dying).map(o => ({ o, t: 0.2 + Math.random() }));
  }
  if (W.lancuch) for (let i = W.lancuch.length - 1; i >= 0; i--) {
    const l = W.lancuch[i];
    if (W.t < l.t) continue;
    if (!l.o.dying) { l.o.hp = 0; killEnemy(l.o); }
    W.lancuch.splice(i, 1);
  }
  if (W.krok < 2 && W.t >= 0.3) {                  // fontanna monet 10 × 10 + jedna 100 z Dona
    W.krok = 2;
    for (let k = 0; k < D.monety.n; k++) {
      const a = k / D.monety.n * Math.PI * 2, r = 1.2 + Math.random() * 1.8;
      G.coins.push(makeCoin(W.x + Math.sin(a) * r, W.z + Math.cos(a) * r, D.monety.val));
    }
    G.coins.push(makeCoin(W.x, W.z, D.monety.duza));
    G.vacuum = Math.max(G.vacuum, 6);
  }
  if (W.krok < 3 && W.t >= 1.0) {                  // „WIECZÓR WYGRANY!" + konfetti
    W.krok = 3;
    napis(T('WIECZÓR WYGRANY!', 'EVENING WON!'), 2300, '#ffd75e');
    for (const kol of [0xffd75e, 0xff6fa5, 0x7ee7ff, 0x9be15d, 0xc07bff, 0xff9d3f]) okruchy(P.pos.x, P.y + 2.2, P.pos.z, kol, 10);
    blysk('#ffd75e', 0.35);
    AUDIO.sfx('zlota');
  }
  if (W.krok < 4 && W.t >= 3.0) {                  // ekran końca (K9: koniecBiegu)
    domknijWygrana();
    koniecBiegu('wygrana');
  }
}
// Dokończenie ceremonii wygranej: monety z fontanny (jeśli jeszcze nie wypadły) i wszystkie niezebrane z ziemi
// idą do biegu. Woła ją ceremonia po 3 s i koniecBiegu('menu') w trakcie ceremonii (przegląd K9–K11: „Do menu"
// z pauzy w tych 3 s kasowało wygraną).
function domknijWygrana() {
  const W = G.wygrana, D = CFG_BIEG.don;
  if (!W || W.krok >= 4) return;
  if (W.krok < 2) G.runCoins += Math.round((D.monety.n * D.monety.val + D.monety.duza) * monetyMul());
  for (const c of G.coins) G.runCoins += Math.round((c.val || 1) * monetyMul());   // niezebrane monety z fontanny
  G.coins = [];
  W.krok = 4;
}
function updateDon(dt, dtR) {
  if (G.donPoc.length) updateDonPoc(dt);
  if (G.lawina.length) updateLawina(dt);
  rysujSol();
  if (G.wygrana) updateZwyciestwa(dtR);
}

// ============================== POCISKI / DROPY ==============================
const shotGeo = new THREE.SphereGeometry(0.18, 8, 8);
const shotMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
const sparkGeo = new THREE.SphereGeometry(0.3, 6, 6);
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });

// XP zbiera sie jako PIGULKI (glosy Carrotella i tak mowia o witaminach),
// a bron na lince to CZOSNEK — dwa osobne sprite'y, bo dotad oba szly z bone.png
let pigulkaMat = null, pigulkaAspect = 1;
let czosnekMat = null, czosnekAspect = 1;
// E1: pigułki, monety, iskry, okruchy, puffy, fale i plamy to nośniki (Object3D poza sceną);
// rysuje je `syncInstancje()` — po jednym draw callu na rodzaj
// 30.09 (opinia testera z itch: „dropy chowają się w trawie, witaminy i złoto trudno dostrzec"): pigułki i monety
// wiszą wyżej, są trochę większe i w shaderze przesuwają się o DROP_BIAS j. ku kamerze — kępy trawy wokół
// nie zasłaniają ich, a blok/regał/skała dalej tak (to nie depthTest: false). Wzorzec jak sylwetki (E3 K2).
const DROP_BIAS = 1.1, DROP_Y = { gem: 0.55, coin: 0.6 }, DROP_SKALA = 1.25;
function dropNadTrawa(m, klucz) {
  const stary = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (stary) stary.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>',
      `#include <project_vertex>
       mvPosition.xyz += normalize(-mvPosition.xyz) * ${DROP_BIAS.toFixed(2)};
       gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'dropNadTrawa-' + klucz;
  return m;
}
function makeGem(x, z, val) {
  const m = new THREE.Object3D();
  m.scale.set(0.5 * DROP_SKALA * pigulkaAspect, 0.5 * DROP_SKALA, 1);
  m.position.set(x, terrainH(x, z) + 0.1, z);
  return { mesh: m, pos: new THREE.Vector3(x, 0, z), val, t: Math.random() * 6 };
}

function coinTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#c9930a'; g.beginPath(); g.arc(16, 17, 13, 0, 7); g.fill();
  g.fillStyle = '#ffd75e'; g.beginPath(); g.arc(16, 15, 13, 0, 7); g.fill();
  g.fillStyle = '#c9930a'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.fillText('$', 16, 21);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
let coinMat = null;
// Moneta ma WARTOŚĆ: 12 osobnych brzdęków z bossa czyta się jak nic, a jeden
// duży „+30" jak nagroda — i jest tańsze, bo to jeden mesh zamiast dwunastu.
const coinMats = new Map();
function coinMat4Val(val) {
  let m = coinMats.get(val);
  if (!m) {
    m = coinMat.clone();
    m.color.setHex(val >= 10 ? 0xffc14a : (val >= 4 ? 0xcfe8ff : 0xffffff));
    coinMats.set(val, m);
  }
  return m;
}
function makeCoin(x, z, val = 1) {
  // nośnik z materiałem tylko po to, żeby pula wzięła z niego kolor (instanceColor)
  const m = new THREE.Mesh(unitGeo, val > 1 ? coinMat4Val(val) : coinMat);
  const s = (val >= 10 ? 0.8 : (val >= 4 ? 0.62 : 0.5)) * DROP_SKALA;
  m.scale.set(s, s, 1);
  m.position.set(x, terrainH(x, z) + 0.1, z);
  return { mesh: m, pos: new THREE.Vector3(x, 0, z), t: Math.random() * 6, val };
}

// materiały nowych broni + efekt pioruna
let bottleMat = null, radioMat = null;
// ============================== PIZZA VOLANTE ==============================
// „Radio-bumerang" był reliktem po starej obsadzie (żul z boomboxem) i nie miał
// nic wspólnego z warzywami walczącymi z mafią przekąsek — zgłoszenie właściciela.
// Biblia postaci przewidywała tu `pizza.png` („koło pizzy z góry — bumerang"), więc
// do czasu dostawy grafiki rysujemy koło proceduralnie. KLUCZ BRONI ZOSTAJE
// `bumerang` — wisi na nim `META.unlocked`, czyli zakupy graczy w starych zapisach.
function pizzaTexture() {
  const S = 32, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const d = g.createImageData(S, S);
  const pep = [[10, 9], [20, 11], [15, 17], [9, 20], [22, 20], [16, 8]];   // pepperoni
  const bazyl = [[13, 13], [19, 16], [12, 24]];                            // bazylia
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - 15.5, dy = y - 15.5, r = Math.hypot(dx, dy);
    let kol = null;
    if (r < 15.5) {
      kol = r > 12.6 ? [206, 150, 76]                    // skórka
          : r > 11.4 ? [226, 176, 96]                    // rant jaśniejszy
          : [242, 196, 88];                              // ser
      for (const [px, py] of pep) if (Math.hypot(x - px, y - py) < 2.6) kol = [198, 58, 46];
      for (const [px, py] of bazyl) if (Math.hypot(x - px, y - py) < 1.5) kol = [86, 150, 62];
      if (r > 14.6) kol = [27, 27, 34];                  // kontur
    }
    const i = (y * S + x) * 4;
    if (kol) { d.data[i] = kol[0]; d.data[i + 1] = kol[1]; d.data[i + 2] = kol[2]; d.data[i + 3] = 255; }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let kapecMat = null, kapecAspect = 1.4;
let scyzorykMat = null, scyzorykAspect = 2.2;
// SCYZORYK — mala pixelowa ostrz z rekojescia (do podmiany na sprite z generatora)
function scyzorykTexture() {
  const W = 44, H = 20;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#d9e2ec'; g.fillRect(14, 7, 26, 5);        // ostrze
  g.fillStyle = '#f2f7fb'; g.fillRect(14, 7, 26, 2);        // blysk
  g.fillStyle = '#9aa5b1'; g.fillRect(36, 7, 4, 5);         // czubek
  g.fillStyle = '#e0453c'; g.fillRect(3, 5, 12, 9);         // rekojesc
  g.fillStyle = '#ff8a80'; g.fillRect(3, 5, 12, 2);
  g.fillStyle = '#1b1b22'; g.fillRect(13, 5, 2, 9);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// KAPEĆ w kratkę — rysowany w kodzie, dopóki nie przyjdzie sprite z generatora
function kapecTexture() {
  const W = 56, H = 40;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#3f5c8a';                                   // podeszwa
  g.beginPath(); g.ellipse(28, 24, 25, 13, 0, 0, 7); g.fill();
  g.fillStyle = '#6f8fc4';                                   // wierzch
  g.beginPath(); g.ellipse(20, 20, 17, 11, 0, 0, 7); g.fill();
  g.fillStyle = '#8fb0e0';                                   // krata
  for (let x = 6; x < 34; x += 6) g.fillRect(x, 11, 2, 18);
  for (let y = 12; y < 28; y += 6) g.fillRect(5, y, 30, 2);
  g.fillStyle = '#2a3b5c';                                   // kontur pięty
  g.fillRect(44, 16, 8, 3); g.fillRect(46, 19, 6, 3);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const boltGeo = new THREE.CylinderGeometry(0.07, 0.16, 14, 5);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, fog: false });
function boltFx(x, ty, z) {
  const m = new THREE.Mesh(boltGeo, boltMat.clone());
  m.position.set(x, ty + 7, z);
  scene.add(m);
  G.bolts.push({ mesh: m, t: 0 });
  spark(x, ty + 1.2, z);
  G.shake = Math.max(G.shake, 0.12);
}

function spark(x, y, z) {
  const m = new THREE.Object3D();                  // E1: instancja w `pulaIskry` (krycie w `a`)
  m.position.set(x, y, z);
  G.sparks.push({ mesh: m, t: 0, a: 1 });
}

// ============================== OKRUCHY (cząstki po śmierci) ==============================
// Rysowane pulą instancji (`pulaOkruchy`, kolor per instancja); gasną skalą, nie alfą.
const okruchGeo = new THREE.PlaneGeometry(0.17, 0.17);
function okruchy(x, y, z, kol, ile) {
  if (G.okruchy.length > 140) return;              // hamulec na wypadek rzezi
  const kc = kolInst(kol);                         // E1: kolor instancji zamiast materiału per kolor
  for (let i = 0; i < ile; i++) {
    const m = new THREE.Object3D();
    m.position.set(x, y, z);
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2.5;
    G.okruchy.push({ mesh: m, kc, t: 0, vx: Math.cos(a) * s, vz: Math.sin(a) * s,
                     vy: 2.4 + Math.random() * 2.8, spin: (Math.random() - 0.5) * 16 });
  }
}

// ============================== PUFF (świetlny obłok, blending additive) ==============================
function glowTexture() {
  const S = 64;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let glowMat = null;
function puff(x, y, z, kol, skala = 1) {
  if (!glowMat || G.puffs.length > 40) return;
  const m = new THREE.Object3D();                  // E1: instancja (kolor + krycie per instancja)
  m.position.set(x, y, z);
  m.quaternion.copy(camera.quaternion);
  G.puffs.push({ mesh: m, t: 0, skala, kc: kolInst(kol), a: 0.85 });
}

// ============================== PLAMY NA ZIEMI (ślad po rzezi) ==============================
// Dowód, że gracz TU BYŁ i co tu zrobił. Przy 500 wrogach nie da się dodawać
// mesha na każdą śmierć, więc pula 48 kwadratów krąży w kółko: najstarsza plama
// jest przejmowana przez nowego trupa. Zero alokacji w trakcie biegu.
const PLAM_MAX = 48;
let plamaGeo = null, plamaMat = null, plamy = [], plamaIdx = 0;
function plamaTexture() {
  const S = 64;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // nieregularny placek + kilka kropel obok
  g.fillStyle = '#ffffff';
  g.beginPath();
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 9) {
    const r = S * (0.26 + Math.random() * 0.14);
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.85;
    a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.closePath(); g.fill();
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, d = S * (0.3 + Math.random() * 0.16);
    const r = 1.5 + Math.random() * 3.5;
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d * 0.85, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
function splat(x, z, kol, skala) {
  if (!plamaGeo) {
    plamaGeo = new THREE.PlaneGeometry(1, 1);
    plamaGeo.rotateX(-Math.PI / 2);
    plamaMat = new THREE.MeshBasicMaterial({ map: plamaTexture(), transparent: true,
      depthWrite: false, opacity: 0.75 });
  }
  let p = plamy[plamaIdx];
  if (!p) {
    // E1: nośnik poza sceną; kolor i gaśnięcie per plama idą instancją (`pulaPlamy`, renderOrder 1)
    const m = new THREE.Object3D();
    p = { mesh: m, t: 0, kc: null, a: 0.75 };
    plamy[plamaIdx] = p;
  }
  plamaIdx = (plamaIdx + 1) % PLAM_MAX;
  p.t = 0;
  p.kc = kolInst(kol);
  p.a = 0.75;
  p.mesh.visible = true;
  p.mesh.scale.set(skala, 1, skala * 0.9);
  p.mesh.rotation.y = Math.random() * Math.PI * 2;
  p.mesh.position.set(x, terrainH(x, z) + 0.035, z);
}
function updatePlamy(dt) {
  for (const p of plamy) {
    if (!p || !p.mesh.visible) continue;
    p.t += dt;
    if (p.t > 6) {                                 // gaśnie przez 2 s po 6 s leżenia
      const k = (p.t - 6) / 2;
      p.a = Math.max(0, 0.75 * (1 - k));
      if (k >= 1) p.mesh.visible = false;
    }
  }
}

// ============================== PROCEDURALNA ŚMIERĆ WROGA ==============================
// Snackoni nie mają arkusza `death` (patrz POSTACIE-DO-ZROBIENIA.md), a znikanie
// pstryknięciem zabijało całą satysfakcję z zabójstwa. Zamiast czekać na grafikę:
// sprite przewraca się, spłaszcza, blaknie i zostawia obłoczek okruchów.
const ROZPAD_T = 0.46;
const FLASH_T = 0.09;                              // biały błysk na starcie (klasyk juice'u)
// Łatka shadera dla UMIERAJĄCEGO sprite'a: pixelowy DISSOLVE (bloki UV znikają
// losowo, nie gładkie blaknięcie) + wybielenie na błysk.
// Uniformy trzymamy w `userData`, bo `onBeforeCompile` jest wołane jako METODA
// materiału — `this` to materiał, więc każdy klon dostaje swoje wartości.
// Źródło shadera jest identyczne dla wszystkich klonów, więc three.js kompiluje
// program RAZ i potem go cache'uje — inaczej każde zabójstwo dawałoby zadyszkę.
function rozpadShader(sh) {
  klatkaUV(sh);
  sh.uniforms.uProg = this.userData.uProg;
  sh.uniforms.uFlash = this.userData.uFlash;
  sh.fragmentShader = 'uniform float uProg;uniform float uFlash;\n' + sh.fragmentShader
    .replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec2 _blk = floor(vKlUv * 26.0);            // w komórce klatki, nie w atlasie
        float _h = fract(sin(_blk.x * 12.9898 + _blk.y * 78.233) * 43758.5453);
        if (_h < uProg) discard;                    // kwadratowe piksele wypadają po kolei
      #endif
      #include <map_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), uFlash);`);
}
function startRozpad(e) {
  e.dying = true;
  e.rozpad = 0;
  e.rozpadBase = e.bb.mesh.scale.clone();          // mini-Marshmallini ma inną skalę
  e.rozpadY = e.bb.mesh.position.y;
  e.rozpadObrot = (Math.random() < 0.5 ? -1 : 1) * (1.0 + Math.random() * 0.6);
  // UWAGA: materiał klatki jest WSPÓLNY dla wszystkich wrogów tego typu
  // (`LIB[postać][anim].dirs[kier][klatka]`). Bez klona zgasłby cały rój naraz.
  const m = e.bb.mesh.material;
  if (e.bb.inst) {                                 // E1: instancja — postęp rozpadu idzie atrybutem
    e.bb.fxProg = 0; e.bb.fxFlash = 1;
  } else if (m) {
    const k = m.clone();
    k.userData = { uProg: { value: 0 }, uFlash: { value: 1 } };
    k.onBeforeCompile = rozpadShader;
    k.needsUpdate = true;
    e.rozpadMat = k;
    e.bb.mesh.material = k;
  }
  const kol = e.T.okrKol || 0xffffff;
  const duzy = e.T.boss || e.elite || e.kapral;
  // WYBUCH SKALOWANY DO WROGA: szeregowy pyka, gruby robi hukiem. Przy 500 wrogach
  // pierścień na każdą śmierć byłby kaszą, więc dostają go tylko duzi i wirujący.
  const gruby = duzy || e.T.scale >= 1.2;
  okruchy(e.pos.x, e.ty + e.bb.h * 0.45, e.pos.z, kol,
          e.T.boss ? 16 : (gruby ? 10 : (e.T.dzieli && !e.mini ? 8 : 6)));
  puff(e.pos.x, e.ty + e.bb.h * 0.5, e.pos.z, kol, e.bb.h * (duzy ? 1.9 : 1.15));
  splat(e.pos.x, e.pos.z, kol, e.bb.h * (duzy ? 1.5 : 0.85));    // ślad zostaje na ziemi
  if (gruby) {
    novaRing(e.pos.x, e.pos.z, e.T.boss ? 4.5 : (duzy ? 2.6 : 1.6));
    AUDIO.sfx('wybuch');
    G.shake = Math.max(G.shake, e.T.boss ? 0.55 : 0.22);
  }
  if (e.T.dzieli && !e.mini) novaRing(e.pos.x, e.pos.z, 1.3);   // widoczne PĘKNIĘCIE na dwa
  if (duzy) G.hitstop = Math.max(G.hitstop, e.T.boss ? 0.12 : 0.05);  // ciężar dużego zabójstwa
}
function updateRozpad(e, dt) {
  e.rozpad += dt;
  const k = Math.min(1, e.rozpad / ROZPAD_T);
  const b = e.rozpadBase;
  // POP: przez pierwsze klatki sprite PUCHNIE (anticipation), potem się spłaszcza
  const pop = e.rozpad < FLASH_T ? 1 + 0.28 * (1 - e.rozpad / FLASH_T) : 1;
  const sy = (1 - 0.72 * k) * pop, sx = (1 + 0.4 * k) * pop;
  e.bb.mesh.scale.set(b.x * sx, b.y * sy, b.z);
  // przewraca się z przyspieszeniem, ale dalej trzyma obrót i pochylenie kamery
  billboardQuat(e.bb.mesh.quaternion, e.rozpadObrot * k * k);
  e.bb.mesh.position.y = e.rozpadY - b.y * (1 - sy) * 0.5;   // osiada na ziemi, nie wisi
  const flash = Math.max(0, 1 - e.rozpad / FLASH_T);
  const prog = Math.max(0, (k - 0.18) / 0.82);                // dissolve po błysku
  if (e.rozpadMat) {
    e.rozpadMat.userData.uFlash.value = flash;
    e.rozpadMat.userData.uProg.value = prog;
  } else if (e.bb.inst) { e.bb.fxFlash = flash; e.bb.fxProg = prog; }
  e.bb.shadow.scale.set(b.x * 0.5 * (1 + k * 0.5), 1, b.x * 0.3 * (1 + k * 0.5));
  return k >= 1;
}

// ---- wyskakujące napisy (obrażenia, KILL) — tekstury cache'owane per napis ----
const popCache = new Map();
// ---- WŁASNY FONT BITMAPOWY 5×7: pixelowy I czytelny (Pixelify mylił 5 z S) ----
const GLIF = {
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01110','10001','10000','10000','10000','10001','01110'],
  'D': ['11110','10001','10001','10001','10001','10001','11110'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01110','10001','10000','10111','10001','10001','01111'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['01110','00100','00100','00100','00100','00100','01110'],
  'J': ['00111','00010','00010','00010','00010','10010','01100'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'Q': ['01110','10001','10001','10001','10101','01110','00011'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  'W': ['10001','10001','10001','10101','10101','11011','10001'],
  'X': ['10001','10001','01010','00100','01010','10001','10001'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  'Z': ['11111','00001','00010','00100','01000','10000','11111'],
  'Ą': ['01110','10001','10001','11111','10001','10001','10011'],
  'Ę': ['11111','10000','10000','11110','10000','10000','11111'],
  'Ń': ['10001','11001','10101','10011','10001','10001','10001'],
  // 29.09 (napis awansu „+2% OBRAŻEŃ", nazwy broni): reszta polskich liter jak Ę/Ń — kształt bazowej litery
  // (7 wierszy nie mieści kreski), Ł z ukośnikiem; do tego procent
  'Ó': ['01110','10001','10001','10001','10001','10001','01110'],
  'Ś': ['01111','10000','10000','01110','00001','00001','11110'],
  'Ć': ['01110','10001','10000','10000','10000','10001','01110'],
  'Ż': ['11111','00001','00010','00100','01000','10000','11111'],
  'Ź': ['11111','00001','00010','00100','01000','10000','11111'],
  'Ł': ['01000','01000','01100','11000','01000','01000','01111'],
  '%': ['11001','11001','00010','00100','01000','10011','10011'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '.': ['00000','00000','00000','00000','00000','00110','00110'],
  '@': ['01110','10001','10111','10101','10111','10000','01110'],   // E1-bieg K7: „@" = ogłuszony kapral
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
};
const POP_CACHE_MAX = 200;
function popMat(str, color) {
  const key = color + '|' + str;
  let m = popCache.get(key);
  if (m) { popCache.delete(key); popCache.set(key, m); return m; }   // odswiez w LRU
  // LRU: bez tego cache rosl w nieskonczonosc — zmierzone 2470 tekstur po 4:43
  // gry i ZERO usuniec, czyli ~140 MB VRAM w 4 minuty. Na telefonie to zgon.
  if (popCache.size >= POP_CACHE_MAX) {
    const naj = popCache.keys().next().value;
    const stary = popCache.get(naj);
    popCache.delete(naj);
    if (stary) { if (stary.map) stary.map.dispose(); stary.dispose(); }
  }
  const txt = str.toUpperCase();
  const PX = 7, ODST = 1, MARG = 2;                 // wielkość piksela, odstęp, margines (w pikselach fontu)
  const znaki = [...txt].map(z => GLIF[z] || GLIF['?']);
  const szerZn = 5, wysZn = 7;
  const wPx = znaki.length * (szerZn + ODST) - ODST + MARG * 2;
  const hPx = wysZn + MARG * 2;
  const c = document.createElement('canvas');
  c.width = wPx * PX; c.height = hPx * PX;
  const g = c.getContext('2d');
  // 1) KONTUR: ten sam napis w czerni, przesunięty w 8 kierunkach (pixelowa obwódka)
  const rysuj = (kolor, ox, oy) => {
    g.fillStyle = kolor;
    znaki.forEach((gl, n) => {
      const bx = MARG + n * (szerZn + ODST);
      for (let y = 0; y < wysZn; y++)
        for (let x = 0; x < szerZn; x++)
          if (gl[y][x] === '1') g.fillRect((bx + x + ox) * PX, (MARG + y + oy) * PX, PX, PX);
    });
  };
  for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) rysuj('#0b0b0f', ox, oy);
  rysuj(color, 0, 0);                                // 2) właściwy napis
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;   // twarde piksele
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, fog: false });
  m.userData.aspect = c.width / c.height;
  popCache.set(key, m);
  return m;
}
// `rodzaj`: 'wazny' — napis, który gracz MUSI zobaczyć (czerwone „-1", „+SERCE", „RANGA", „PINIATA!", „KONIEC!",
// telegrafy „!"/„SSS!"): omija limity, a przy pełnym limicie wypiera najstarszy zwykły napis (liczba draw calli
// się nie zmienia); 'kill' — napis zabójstwa („x34"/„KILL"): w tłoku liczony jak drobny.
function dmgPop(x, ty, z, str, color = '#ffe066', scale = 1, rodzaj) {
  // K11 (wydajność, telefon: kapral 6 + ~300 wrogów = 32–48 FPS): każdy napis to osobny Mesh z klonem
  // materiału = osobny draw call (nie są instancjonowane), a w późnej grze bronie trzymały ich stale ~70.
  // W tłoku (> 200 wrogów) limit 36, drobne (scale < 1 i zabójstwa) od 12 — krytyki i elity zostają.
  const tlok = G.enemies.length > 200, limit = tlok ? 36 : 70;
  if (rodzaj === 'wazny') {
    if (G.pops.length > limit) {                   // zrób miejsce: najstarszy zwykły napis (początek tablicy) znika
      const i = G.pops.findIndex(p => !p.wazny);
      if (i >= 0) { const p = G.pops[i]; scene.remove(p.mesh); p.mesh.material.dispose(); G.pops.splice(i, 1); }
      else if (G.pops.length > 100) return;        // same ważne — twardy bezpiecznik
    }
  } else {
    if (G.pops.length > limit) return;             // bezpiecznik przy hordach
    if ((scale < 1 || (tlok && rodzaj === 'kill')) && G.pops.length > (tlok ? 12 : 24)) return;
  }
  // ZATŁOCZONY KADR. Napis rósł WPROST ze skali, a szerokość dodatkowo z długości
  // tekstu: „KILL X34" przy serii 34 miało 1.87 j. wysokości i **7.6 j. szerokości**,
  // czyli zasłaniało pół ekranu razem z postacią (zrzut z 13.08). Teraz:
  //  • drobne liczby ustępują, gdy w kadrze i tak jest tłok (krytyki, elity i boss
  //    mają scale >= 1, więc zostają) — warunek wyżej, razem z limitem,
  //  • szerokość jest ograniczona, a długie napisy zjeżdżają z wysokością.
  const mat = popMat(str, color);
  const mesh = new THREE.Mesh(unitGeo, mat.clone());
  const asp = mat.userData.aspect || 2.9;
  let wys = 0.72 * scale;
  const maxSzer = Math.min(3.4, 2.2 + 0.45 * scale);
  if (wys * asp > maxSzer) wys = maxSzer / asp;
  mesh.scale.set(wys * asp, wys, 1);
  mesh.position.set(x + (Math.random() - .5) * 0.7, ty + 1.7, z);
  scene.add(mesh);
  G.pops.push({ mesh, t: 0, wazny: rodzaj === 'wazny' });
}
// E1-bieg K4: liczba na ekranie = PRAWDZIWE obrażenia (skala ×100 w HP wrogów), 2 cyfry znaczące:
// 327 → 330, 1234 → 1200, 14 321 → 14K, 4,2 mln → 4.2M. Dawniej kosmetyczne ×250 bez związku z HP.
const dmgNum = d => d < 100 ? String(Math.round(d))
  : d < 1e4 ? String(Number(d.toPrecision(2)))
  : d < 999500 ? Math.round(d / 1e3) + 'K' : (d / 1e6).toFixed(1) + 'M';   // bez „1000K"

// ============================== WSPÓLNY CIOS: zadajDmg ==============================
// Do 03.09 krytyk (`critC`) liczyły TYLKO pociski z `G.shots` i karabin. Piorun,
// Skarpeta, Czosnek, Tupnięcie, Wypad, Wiatrówka, Pizza, kiełki, Pipsini, wybuchy —
// zero. Karta „Krytyk" i „Pieprz Nonny" były MARTWE dla większości buildów (ta sama
// rodzina błędu co naprawiony `fireMul`). Od teraz KAŻDY cios w wroga idzie tą drogą:
// krytyk ×3 z pomarańczowym, dużym popem (scale ≥ 1.5 = nie ginie w tłoku), iskra,
// dźwięk 'kryt' (audio ma własny throttle), mocniejszy odrzut i zabójstwo w jednym miejscu.
//   o.col / o.sc   — kolor i skala popu zwykłego trafienia (krytyk ma swój),
//   o.kb / o.kbSila — kierunek odrzutu (Vector3, nie musi być znormalizowany) i siła,
//   o.sfx          — dźwięk zwykłego trafienia (przy krytyku zamieniany na 'kryt'),
//   o.noPop        — bez liczby (np. wróg już dostaje osobny napis),
//   o.noKill       — nie wołaj killEnemy (pętla wołająca robi to sama).
//   o.bezKryt      — cios zadaje WRÓG albo otoczenie (wybuch Botta, fala Gommone, wir Girandoli): bez krytyka,
//                    bez wysysania Beetina, bez dźwięku kryt i wibracji (statystyki gracza tu nie działają).
// Zwraca { dmg, crit, dead } — `dmg` już po krytyku (np. do wybuchu meteoru).
// Dodając nową broń: NIGDY `e.hp -= x` na piechotę, zawsze `zadajDmg(e, x, {...})`.
const _kbV = new THREE.Vector3();          // wektor roboczy dla `o.kb` — zero alokacji na cios
function zadajDmg(e, dmg, o = {}) {
  // E1-bieg K4: bronie liczą w jednostkach bazowych, wróg ma HP ×SKALA_WROGA. `o.bezSkali` = obrażenia
  // już w skali ekranu albo WZGLĘDNE (% maxHp: głazy Wąwozów, regał) — bez tego głaz dałby bossowi 1500%.
  if (!o.bezSkali) dmg *= SKALA_WROGA;
  // E1-bieg K8: przejście Dona w fazę 2 (1,5 s) = nietykalny, pop „-" (dławiony, żeby nie zasypać kadru)
  if (e.nietyk && dmg > 0) {
    if (!o.noPop && G.time - (e.nietykPopT || -9) > 0.25) { e.nietykPopT = G.time; dmgPop(e.pos.x, e.ty + 0.6, e.pos.z, '-', '#cfd6e2', 1.2); }
    return { dmg: 0, crit: false, dead: false };
  }
  if (o.zr && !o.bezSkali && dmg > 0) dmg *= mnozBroni(o.zr);   // E2 K2: Dokładki (+% obrażeń tej broni)
  if (!o.bezSkali && dmg > 0 && e.smrodDo > G.time) dmg *= 1.15;   // E2 K6b: zasmrodzony (Smród pokoleniowy) — ze WSZYSTKICH źródeł
  const crit = dmg > 0 && !o.bezKryt && Math.random() < critC();   // nova Sodino ma dmg 0 — nie ma czego krytykować
  if (crit) dmg *= 3;
  // E2 K8: Razoretta „Szklane ostrze" — krytyk z KAŻDEJ broni dokłada nóż do następnej serii Scyzoryków (do +3)
  if (crit && charKey === 'razoretta' && !o.bonusNoz && (P.nozeBonus || 0) < 3 && hasWeapon('scyzoryk')) { P.nozeBonus = (P.nozeBonus || 0) + 1; renderWpns(); }
  const hpPrzed = e.hp;
  e.hp -= dmg;
  // Don w fazie 1 nie spada poniżej 50%: próg zawsze odpala przejście (faza 2 gwarantowana — kryterium K8)
  if (e.don && e.donS && e.donS.faza === 1 && e.hp <= e.maxHp * 0.5) { e.hp = e.maxHp * 0.5; donFaza2(e); }
  // E1-bieg: ŹRÓDŁO CIOSU (`o.zr` = klucz broni). Liczymy obrażenia SKUTECZNE (bez nadwyżki
  // ponad resztę HP), więc suma `G.dmgBron` = suma HP utraconego przez wrogów, a DPS broni
  // na ekranie końca nie puchnie od przebitych trupów.
  if (dmg > 0) {
    const zr = o.zr || 'inne';
    // HP UTRACONE naprawdę: przy zacięciu Dona na 50% (faza 1) to mniej niż `dmg`
    G.dmgBron[zr] = (G.dmgBron[zr] || 0) + Math.max(0, hpPrzed - Math.max(0, e.hp));
    if (dmg > G.maxHit.dmg && !o.bezSkali) G.maxHit = { dmg, zr, crit };   // bez głazów i regału (% maxHp)
  }
  // wysysanie życia Beetina (Buraczane Ciśnienie): 10% obrażeń zbiera się w „soku",
  // co 2.5 j. soku = +1 serce (przy broniach 2.5-10 dmg to co ~5 ciosów poniżej połowy HP)
  // NERF 23.09 (pomiar: bot z samą bronią startową, Łąki): Beetino przeżywał 293 s i odzyskał
  // 49 serc, reszta postaci 48-81 s i zero. Przyczyna: pchnięcie trafia CAŁY tłum naraz, więc
  // jedno pchnięcie w hordę dawało kilka serc — im gęstsza horda, tym mocniej się leczył, czyli
  // najtrudniejszy moment gry był dla niego najłatwiejszy. Teraz NAJWYŻEJ 1 serce na BEET_LECZ_CD (5 s), a sok
  // nie odkłada się na zapas (limit 4) — wysysanie zostaje tożsamością postaci, znika nieśmiertelność.
  if (dmg > 0 && !o.bezKryt && cisnienie()) {
    P.sok = Math.min(4, (P.sok || 0) + dmg / SKALA_WROGA * 0.10);   // sok w jednostkach bazowych (próg 4 bez zmian)
    if (P.sok >= 4 && P.hp < P.maxHp && G.time >= (P.leczT || 0)) {
      P.sok = 0; P.leczT = G.time + BEET_LECZ_CD / Math.max(0.05, ekonBieg('beetLecz'));   // EKONOMIA v2: 5 → 10 s
      P.hp = Math.min(P.maxHp, P.hp + HP_SERCA); drawHearts();
      dmgPop(P.pos.x, P.y + 0.7, P.pos.z, T('+SERCE', '+HEART'), '#ff6fa5', 1.2, 'wazny');
      AUDIO.sfx('serce');
    }
  }
  if (o.kb && !e.T.bezKb && !e.bezKb) e.kb.copy(o.kb).setY(0).normalize().multiplyScalar((o.kbSila == null ? 1 : o.kbSila) * (crit ? 1.5 : 1));
  if (crit) spark(e.pos.x, e.ty + 1.5, e.pos.z);
  if (!o.noPop || crit) dmgPop(e.pos.x, e.ty, e.pos.z, dmgNum(dmg), crit ? '#ff9d3f' : (o.col || '#ffe066'),
                                crit ? Math.max(1.5, o.sc || 1) : (o.sc || 1));
  if (crit) { AUDIO.sfx('kryt'); padWibrujKryt(); }   // dławik 150 ms siedzi w padWibrujKryt
  else if (o.sfx) AUDIO.sfx(o.sfx);
  const dead = e.hp <= 0;
  if (dead && !o.noKill) killEnemy(e);
  return { dmg, crit, dead };
}

// ---- serca-dropy ❤️ ----
let heartMat = null;
function makeHeart(x, z) {
  const m = new THREE.Mesh(unitGeo, heartMat);
  m.scale.set(0.7, 0.7, 1);
  m.position.set(x, terrainH(x, z) + 0.2, z);
  scene.add(m);
  return { mesh: m, pos: new THREE.Vector3(x, 0, z), t: Math.random() * 6 };
}
function emojiMat(emoji) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = '48px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, 32, 36);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
}

// ============================== BRONIE (rejestr) ==============================
// tick(w, dt) woła się co klatkę dla każdej posiadanej broni; w = {key, lvl, t}
//
// ⚠️ KAŻDY COOLDOWN DZIEL PRZEZ `fireMul()`. Do 13.08 robiły to TYLKO Kule, a reszta
// miała czas przeładowania zapisany na sztywno — więc pasyw TEMPO (do +76%) i bonus
// „+4% tempa co 4. ranga" były dla większości buildów DOSŁOWNIE ZEROWE. Karta Tempo
// była pułapką: gracz brał ją co kilka awansów i nie dostawał nic.
// Dodając nową broń: `w.t = (bazowy_czas) / fireMul()`, nigdy samo `w.t = bazowy_czas`.
const WEAPONS = {
  // ⚠️ OBRAŻENIA KUL ROSNĄ Z POZIOMEM. Do 13.08 `dmg` pocisku było zaszyte na
  // sztywno jako 1 (pocisk bez pola `dmg` dostaje `s.dmg || 1` w pętli pocisków),
  // a poziomy dawały TYLKO liczbę pocisków i przebicie. Skutek zmierzony w grze:
  // Carrotello — postać, którą gra się przez pierwsze TRZY biegi — zabijał
  // 1 wroga na 10 s, gdy każda inna postać zabijała 18-20. Chipsetti ma 3.01 HP,
  // a kula robiła 1 × 0.9 (kara postaci) = 0.9, czyli CZTERY trafienia na
  // najsłabszego wroga w grze, co 0.87 s. To były najgorsze 3 minuty w grze
  // i pierwsze, jakie widzi nowy gracz.
  kule: {
    ico: 'kula', nm: T('Kule energii', 'Energy Orbs'), ds: T('Samonaprowadzające pociski', 'Homing shots'), max: 5, postac: 'carrotello',
    lvlDs: l => (JEZYK.cur === 'en'
      ? ['1 shot', '2 shots, stronger', '3 shots and pierce', 'stronger still', '4 shots, +2 pierce (→ recipe!)']
      : ['1 pocisk', '2 pociski, mocniejsze', '3 pociski i przebicie',
         'jeszcze mocniejsze', '4 pociski, +2 przebicia (→ przepis!)'])[l - 1],
    evoKey: 'meteor', evoIco: 'kula', evoNm: T('KULE METEORYCZNE', 'METEOR ORBS'),
    evoDs: T('PRZEPIS: pociski WYBUCHAJĄ przy trafieniu', 'RECIPE: shots EXPLODE on impact'),
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const count = [1, 2, 3, 3, 4][w.lvl - 1], pierce = [0, 0, 1, 1, 2][w.lvl - 1];
      // POZIOM 1 MUSI ZABIJAĆ CHIPSETTIEGO JEDNĄ KULĄ (ma 3.01 HP na starcie).
      // To chwyt z Vampire Survivors, gdzie bicz kasuje pierwsze nietoperze za jednym
      // ciosem — i to on daje pierwsze 30 sekund „mam moc". Okno zamyka się samo,
      // bo `hpScale` rośnie: w 2. minucie Chipsetti ma już ~6.6 HP i trzeba ulepszeń.
      const dmg = [3.2, 3.9, 4.6, 5.4, 6.2][w.lvl - 1];
      const osW = MAPS[mapKey].osiedle && OS.pociskiStop && !OS.nav.scianaW(P.pos.x, P.pos.z);   // gracz na dachu garażu widzi wszystkich   // osiedle: kule rozbijają się o bloki → celuj w tych, których widać
      let targets = G.enemies.filter(e => !e.dying)
        .map(e => ({ e, d: e.pos.distanceTo(P.pos) }))
        .filter(o => o.d < rangeF() && (!osW || OS.nav.widac(P.pos.x, P.pos.z, o.e.pos.x, o.e.pos.z)))
        .sort((a, b) => a.d - b.d).slice(0, count);
      if (!targets.length) return;
      w.t = 1 / (1.15 * fireMul());
      AUDIO.sfx('strzal');
      while (targets.length < count) targets.push(targets[targets.length - 1]);
      for (const { e } of targets) {
        const dir = e.pos.clone().sub(P.pos).setY(0).normalize();
        const m = new THREE.Mesh(shotGeo, shotMat);
        m.position.set(P.pos.x, P.y + 1.0, P.pos.z);      // z POSTACI (też gdy stoi na regale)
        scene.add(m);
        G.shots.push({ mesh: m, dir, life: 1.3, pierce, hit: new Set(), y: P.y + 1.0, dmg });
      }
    },
  },
  kosc: {
    ico: 'czosnek', nm: T('Czosnek na lince', 'Garlic on a String'),
    ds: T('Kręci się na giętkiej lince i odpycha hordę', 'Whirls on a springy string and shoves the horde'), max: 5,
    lvlDs: l => l + T(l === 1 ? ' czosnek' : ' czosnki', l === 1 ? ' garlic' : ' garlics')
                  + T(l === 5 ? ' (→ przepis!)' : '', l === 5 ? ' (→ recipe!)' : ''),
    evoKey: 'kosci', evoIco: 'czosnek', evoNm: T('CZOSNKOWY MŁYN', 'GARLIC MILL'),
    evoDs: T('PRZEPIS: dłuższa linka, szybszy obrót i 2× mocniejsze', 'RECIPE: longer string, faster spin, 2× the damage'),
    tick(w, dt) {
      while (G.orbs.length < w.lvl) G.orbs.push(nowyCzosnek(G.orbs.length));
      updateCzosnki(dt, w.lvl);
    },
  },
  tupniecie: {
    ico: 'fala', nm: T('Tupnięcie', 'Stomp'),
    ds: T('Fala uderzeniowa (też przy lądowaniu ze skoku!)', 'A shockwave (on landing from a jump too!)'), max: 5,
    // E2 K1: 5 poziomów (spec §7.2) — opis z liczbami, jak inne bronie
    lvlDs: l => T(`promień ${przec(3.2 + 0.4 * l)}, moc ${przec(0.6 + 0.9 * l)}, co ${przec(3.3 - 0.1 * l)} s`,
                  `radius ${przec(3.2 + 0.4 * l)}, power ${przec(0.6 + 0.9 * l)}, every ${przec(3.3 - 0.1 * l)} s`)
      + T(l === 5 ? ' (→ przepis!)' : '', l === 5 ? ' (→ recipe!)' : ''),
    evoKey: 'sejsm', evoIco: 'fala', evoNm: T('TRZĘSIENIE ZIEMI', 'EARTHQUAKE'),
    evoDs: T('PRZEPIS: fale częstsze, większe i 2× mocniejsze', 'RECIPE: waves more often, wider and 2× stronger'),
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = stompCd(w.lvl) / fireMul();
      nova(P.pos.x, P.pos.z, stompRad(w.lvl), stompDmg(w.lvl), 'tupniecie');
    },
  },
  piorun: {
    ico: 'pioruny', nm: T('Piorun', 'Thunderbolt'), ds: T('Grom bije losowych wrogów', 'Lightning strikes random enemies'), max: 5, locked: true,
    lvlDs: l => `${Math.ceil(l / 2)} ${T('grom(y)', 'bolt(s)')}, ${T('co', 'every')} ${(2.8 - 0.25 * l).toFixed(1)} s`
      + T(l === 5 ? ' (→ przepis!)' : '', l === 5 ? ' (→ recipe!)' : ''),
    // E2 K6a (spec §3.4.1): BURZA W FILIŻANCE — najpierw elity/kaprale/Don, potem łańcuch do 4 skoków (×0,75 na skok)
    evoKey: 'burza', evoIco: 'pioruny', evoNm: T('BURZA W FILIŻANCE', 'STORM IN A CUP'),
    evoDs: T('PRZEPIS: grom najpierw bije elity i przeskakuje na 4 kolejnych wrogów', 'RECIPE: bolts hit elites first and chain to 4 more enemies'),
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const alive = G.enemies.filter(e => !e.dying && e.pos.distanceTo(P.pos) < 15 * rangeM());
      if (!alive.length) return;
      w.t = (2.8 - 0.25 * w.lvl) / fireMul();
      const burza = !!P.evo.burza;
      const elity = burza ? alive.filter(e => e.elite || e.kapral || e.don || e.T.boss) : null;
      for (let b = 0; b < Math.ceil(w.lvl / 2); b++) {
        const pula = elity && elity.some(e => !e.dying) ? elity.filter(e => !e.dying) : alive;
        const e = pula[Math.floor(Math.random() * pula.length)];
        if (e.dying) continue;                       // dwa gromy mogą wylosować tego samego
        boltFx(e.pos.x, e.ty, e.pos.z);
        AUDIO.sfx('piorun');
        e.kb.set(0, 0, 0);
        zadajDmg(e, 3 * dmgAll(), { col: '#e8f4ff', sc: 1.2, zr: 'piorun' });
        if (burza) lancuchBurzy(e);
      }
      if (burza) G.shake = Math.max(G.shake, 0.05);   // raz na salwę, nie na skok
    },
  },
  butelka: {
    ico: 'butelka', nm: T('Butelka żula', 'Hobo Bottle'), ds: T('Leci łukiem i WYBUCHA', 'Lobbed in an arc, goes BANG'), max: 5, locked: true,
    lvlDs: l => `${T('wybuch', 'blast')} r=${(2 + 0.3 * l).toFixed(1)}, ${T('co', 'every')} ${(3.6 - 0.25 * l).toFixed(1)} s`
      + T(l === 5 ? ' (→ przepis!)' : '', l === 5 ? ' (→ recipe!)' : ''),
    // E2 K6d (spec §3.4.4): KAŁUŻA POD BLOKIEM — celuje w środek największej grupy, zostawia lepką kałużę
    evoKey: 'kaluza', evoIco: 'butelka', evoNm: T('KAŁUŻA POD BLOKIEM', 'BLOCK PUDDLE'),
    evoDs: T('PRZEPIS: butelka leci w największy tłum i zostawia lepką kałużę — spowalnia i parzy', 'RECIPE: the bottle flies into the biggest crowd and leaves a sticky puddle that slows and burns'),
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const alive = G.enemies.filter(e => !e.dying && e.pos.distanceTo(P.pos) < 13 * rangeM());
      if (!alive.length) return;
      w.t = (3.6 - 0.25 * w.lvl) / fireMul();
      const e = P.evo.kaluza ? srodekTlumu(alive) : alive[Math.floor(Math.random() * alive.length)];
      const m = new THREE.Mesh(unitGeo, bottleMat);
      m.scale.set(0.7, 0.7, 1);
      scene.add(m);
      G.lobs.push({ mesh: m, from: P.pos.clone(), to: e.pos.clone(), t: 0, dur: 0.7, lvl: w.lvl, kaluza: !!P.evo.kaluza });
    },
  },
  // ============ KRZAK POMIDOROWY (broń „totemowa", życzenie właściciela) ============
  // Trzeci typ czegoś, co stoi na mapie, i CELOWO różny od dwóch poprzednich:
  //   • Garnek Nonny (tablica `totems`) — buff dla gracza, nie strzela,
  //   • Sokowirówka (`turrets`) — gracz stawia ją SAM klawiszem F, miele w zwarciu,
  //   • Krzak pomidorowy — **sadzi się SAM** pod nogami gracza i bombarduje z dystansu
  //     po łuku, czyli jako jedyny bije PONAD hordą i za przeszkodami.
  // Stąd fantazja tej broni: biegniesz, zostawiasz za sobą ogród, a ogród ostrzeliwuje
  // to, co Cię goni. Krzaki nie mają HP (wrogowie ich nie tłuką) — mają za to KRÓTKIE
  // ŻYCIE, więc trzeba się ruszać, żeby ostrzał w ogóle istniał.
  krzak: {
    ico: 'krzak', nm: T('Krzak pomidorowy', 'Tomato Bush'),
    ds: T('Sadzi się sam i OSTRZELIWUJE pomidorami po łuku', 'Plants itself and SHELLS the horde with lobbed tomatoes'), max: 5, locked: true,
    lvlDs: l => `${KRZAK_ILE(l)} ${T('krzaki', 'bushes')}, ${T('rzut co', 'throw every')} ${KRZAK_RZUT(l).toFixed(2)} s, ${T('plaśnięcie', 'splat')} r=${KRZAK_R(l).toFixed(1)}`,
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = KRZAK_SADZ(w.lvl) / fireMul();
      if (G.krzaki.length >= KRZAK_ILE(w.lvl)) return;   // pełny ogród — czekamy na uschnięcie
      posadzKrzak(w.lvl);
    },
  },
  bumerang: {
    ico: 'pizza', nm: 'Pizza Volante', ds: T('Koło pizzy leci i WRACA, kosząc po drodze', 'A pizza wheel flies out and COMES BACK, mowing both ways'), max: 5, locked: true,
    lvlDs: l => `${T('zasięg', 'range')} ${(8 + 0.6 * l).toFixed(0)}, ${T('co', 'every')} ${(2.8 - 0.2 * l).toFixed(1)} s`
      + T(l === 5 ? ' (→ przepis!)' : '', l === 5 ? ' (→ recipe!)' : ''),
    // E2 K6c (spec §3.4.3): PIZZA CALAMITA — leci w najgęstszy sektor, zawisa 1,2 s, bije co 0,3 s i ŚCIĄGA hordę
    evoKey: 'calamita', evoIco: 'pizza', evoNm: 'PIZZA CALAMITA',
    evoDs: T('PRZEPIS: pizza leci w największy tłum, zawisa, wiruje i ŚCIĄGA wrogów do siebie', 'RECIPE: the pizza flies into the biggest crowd, hovers, spins and PULLS enemies in'),
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = (2.8 - 0.2 * w.lvl) / fireMul();
      const m = new THREE.Mesh(unitGeo, radioMat);
      m.scale.set(0.9, 0.9, 1);
      scene.add(m);
      const dist = (8 + 0.6 * w.lvl) * rangeM();
      const cel = P.evo.calamita ? najgestszyKierunek(dist) : null;
      const dir = cel ? new THREE.Vector3(cel.x, 0, cel.z) : new THREE.Vector3(Math.sin(playerBB.facing), 0, Math.cos(playerBB.facing));
      G.boomers.push({ mesh: m, dir, t: 0, dur: 1.6, dist, lvl: w.lvl, hit: new Map(), zr: 'bumerang',
                       calamita: !!P.evo.calamita, faza: 'wylot', ft: 0 });
    },
  },
  skarpeta: {
    ico: 'skarpeta', nm: T('Skarpeta biologiczna', 'The Stink'),
    ds: T('Śmierdząca AURA truje wszystko wokół Ciebie', 'A reeking AURA poisons everything around you'), max: 5, locked: true,
    // ZASIĘG ROŚNIE KWADRATOWO (decyzja właściciela): „na początku mało przydatna,
    // później po ulepszeniu może być mocnym killerem". Liniowe 2.2+0.35·l dawało
    // 2.55 na starcie i 3.95 na maksie, czyli broń, która przez cały bieg robiła
    // to samo — trochę. Teraz poz. 1 to 2.05 (ledwie wokół stóp, świadomie słabe),
    // a poz. 5 to 8.05, czyli **pół ekranu trucizny**: kto wejdzie, ten gnije.
    // Obrażenia rosną spokojnie, bo cała siła tej broni ma siedzieć w POWIERZCHNI
    // (poz. 1: 13 j.² → poz. 5: 204 j.², czyli **15× większy obszar działania**).
    lvlDs: l => `${T('promień', 'radius')} ${SKARPETA_R(l).toFixed(1)} (${T('obszar', 'area')} ×${(SKARPETA_R(l) ** 2 / SKARPETA_R(1) ** 2).toFixed(1)}), ${T('trucie co 0.7 s', 'poison tick 0.7 s')}`
      + T(l === 5 ? ' (→ przepis!)' : '', l === 5 ? ' (→ recipe!)' : ''),
    // E2 K6b (spec §3.4.2, nazwa z biblii): SMRÓD POKOLENIOWY — smuga chmur za graczem, „zasmrodzeni" wolniejsi i +15% obrażeń
    evoKey: 'smrodpok', evoIco: 'skarpeta', evoNm: T('SMRÓD POKOLENIOWY', 'GENERATIONAL STINK'),
    evoDs: T('PRZEPIS: zostawiasz smugę smrodu; zasmrodzeni wrogowie są wolniejsi i dostają +15% obrażeń', 'RECIPE: you leave a stink trail; stunk enemies are slower and take +15% damage'),
    tick(w, dt) {
      if (P.evo.smrodpok) smugaSmrodu(w, dt);        // E2 K6b: chmury powstają niezależnie od tiku trucia
      w.t -= dt;
      if (w.t > 0) return;
      w.t = 0.7 / fireMul();
      const r = skarpetaR(w.lvl), ad = (0.7 + 0.28 * w.lvl) * dmgAll() * rangeObsz().dmg;   // ten sam promień co dym w `updateSmrod`
      // ŻADNEJ OBRĘCZY. `novaRing` rysował tu rozchodzące się koło co 0.7 s —
      // to był ten „okrąg", który właściciel odrzucił. Tempo trucia pokazuje
      // teraz „oddech" dymu: kłęby na 0.3 s puchną i jaśnieją (`uPuls`).
      dymPulsT = G.time;
      const smrodpok = !!P.evo.smrodpok;
      G.smrTikId = (G.smrTikId || 0) + 1;
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
        if (dx * dx + dz * dz < r * r) {
          if (smrodpok) { e.smrTik = G.smrTikId; e.smrodDo = G.time + 1.0; }
          zadajDmg(e, ad, { col: '#a8e05f', sc: 0.75, zr: 'skarpeta' });
        }
      }
      if (smrodpok && G.chmury.length) tikChmur(ad * CHMURA.dmg);   // wróg w aurze i w chmurze = jedno trafienie na tik
    },
  },
  wiatrowka: {
    ico: 'wiatr', nm: T('Wiatrówka z bazaru', 'Bazaar Air Rifle'),
    ds: T('PROMIEŃ przeszywa wszystko na linii strzału', 'A BEAM skewers everything in the firing line'), max: 5, locked: true,
    lvlDs: l => `${T('co', 'every')} ${(2.2 - 0.15 * l).toFixed(2)} s, ${T('obrażenia', 'damage')} +${l}`,
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const dl = 18 * rangeM();                        // długość promienia (Sokoli wzrok wydłuża)
      const alive = G.enemies.filter(e => !e.dying && e.pos.distanceTo(P.pos) < dl);
      if (!alive.length) return;
      w.t = (2.2 - 0.15 * w.lvl) / fireMul();
      let far = alive[0], fd = 0;
      for (const e of alive) { const d = e.pos.distanceTo(P.pos); if (d > fd) { fd = d; far = e; } }
      const dir = far.pos.clone().sub(P.pos).setY(0).normalize();
      // tracer poziomy (boltGeo ma 14 j. długości — stąd dzielenie)
      const tr = new THREE.Mesh(boltGeo, boltMat.clone());
      tr.scale.set(0.6, dl / 14, 0.6);
      tr.position.set(P.pos.x + dir.x * dl / 2, terrainH(P.pos.x, P.pos.z) + 1.0, P.pos.z + dir.z * dl / 2);
      tr.rotation.set(Math.PI / 2, 0, -Math.atan2(dir.x, dir.z));
      scene.add(tr);
      G.bolts.push({ mesh: tr, t: 0 });
      const wd = (2 + 0.5 * w.lvl) * dmgAll();
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        const ex = e.pos.x - P.pos.x, ez = e.pos.z - P.pos.z;
        const along = ex * dir.x + ez * dir.z;
        if (along < 0 || along > dl) continue;
        const perp = Math.abs(ex * dir.z - ez * dir.x);
        if (perp < 0.9) {
          spark(e.pos.x, e.ty + 1.0, e.pos.z);
          zadajDmg(e, wd, { col: '#e0f0ff', kb: dir, kbSila: 2, zr: 'wiatrowka' });
        }
      }
    },
  },
  kura: {
    ico: 'kukurydza', nm: 'Kernello Boomello',
    ds: T('Ziarno kukurydzy biegnie do wroga i STRZELA', 'A corn kernel runs at an enemy and POPS'), max: 5, locked: true,
    lvlDs: l => `${T('wybuch', 'blast')} r=${(2.5 + 0.3 * l).toFixed(1)}, ${T('co', 'every')} ${(4.5 - 0.35 * l).toFixed(1)} s`
      + T(l === 5 ? ' (→ przepis!)' : '', l === 5 ? ' (→ recipe!)' : ''),
    evoKey: 'kaseta', evoIco: 'kukurydza', evoNm: T('BOMBA KASETOWA', 'CLUSTER BOMB'),
    evoDs: T('PRZEPIS: wybuch rozsypuje 6 mniejszych ziaren, każde z własnym lontem',
             'RECIPE: the blast scatters 6 smaller kernels, each with its own fuse'),
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const alive = G.enemies.filter(e => !e.dying && e.pos.distanceTo(P.pos) < 16 * rangeM());
      if (!alive.length) return;
      w.t = (4.5 - 0.35 * w.lvl) / fireMul();
      const bb = new Billboard('kernello_boomello', 1.0);
      bb.play('run');
      G.kury.push({ bb, pos: P.pos.clone(), t: 0, lvl: w.lvl });
    },
  },
  // ===== SCYZORYK (startowa broń Razoretty) =====
  // Nie „kolejny pocisk samonaprowadzający": to SERIA trzech-pięciu rzutów w tę
  // samą stronę, jeden po drugim, mocnych i przebijających. Gracz musi ustawić
  // się w linii z tłumem — to jedyna broń w grze nagradzająca celowanie ciałem.
  scyzoryk: {
    ico: 'celownik', nm: T('Scyzoryki', 'Pencil Case'),
    ds: T('Seria mocnych rzutów przed siebie — przebijają', 'A burst of hard throws straight ahead — they pierce'), max: 5, postac: 'razoretta',
    lvlDs: l => `${2 + l} ${T('rzutów w serii', 'knives per burst')}, ${T('co', 'every')} ${(2.2 - 0.15 * l).toFixed(1)} s`
      + T(l === 5 ? ' (→ przepis!)' : '', l === 5 ? ' (→ recipe!)' : ''),
    evoKey: 'wachlarz', evoIco: 'celownik', evoNm: T('WACHLARZ RZODKIEWKI', 'RADISH FAN'),
    evoDs: T('PRZEPIS: każdy rzut to trzy scyzoryki w wachlarzu', 'RECIPE: every throw is three knives in a fan'),
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = (2.2 - 0.15 * w.lvl) / fireMul();
      // kierunek liczony RAZ dla całej serii — inaczej seria rozjeżdżałaby się
      // za obracającym się graczem i przestałaby być „linią"
      let cel = null, najl = rangeF();
      for (const e of G.enemies) { if (e.dying) continue;
        const d = e.pos.distanceTo(P.pos); if (d < najl) { najl = d; cel = e; } }
      const kat = cel ? Math.atan2(cel.pos.x - P.pos.x, cel.pos.z - P.pos.z) : playerBB.facing;
      const ile = 2 + w.lvl, bonus = P.nozeBonus || 0;     // E2 K8: noże Razoretty za krytyki (50% obrażeń)
      for (let i = 0; i < ile + bonus; i++) {
        G.seria.push({ kat, opoznienie: i * 0.11, lvl: w.lvl, bonusNoz: i >= ile });
      }
      if (bonus) { P.nozeBonus = 0; G.nozeBonusSuma = (G.nozeBonusSuma || 0) + bonus; G.nozeSerie = (G.nozeSerie || 0) + 1; renderWpns(); }
      else G.nozeSerie = (G.nozeSerie || 0) + 1;
    },
  },
  // ===== LA CIABATTA (startowa broń Granny, wg biblii) =====
  // Kapeć-bumerang: leci, przebija WSZYSTKO i wraca, bijąc drugi raz w drodze
  // powrotnej. Korzysta z tej samej maszynerii co radio-bumerang (`G.boomers`),
  // ale rzuca DWA kapcie w wachlarzu i celuje w najbliższego wroga, nie w przód.
  ciabatta: {
    ico: 'kapec', nm: 'La Ciabatta', ds: T('Kapeć leci, przebija wszystko i WRACA', 'The slipper flies, pierces everything and COMES BACK'), max: 5, postac: 'granny',
    lvlDs: l => `${l >= 3 ? 2 : 1} ${T('kapeć(cie)', 'slipper(s)')}, ${T('zasięg', 'range')} ${(6 + 0.5 * l).toFixed(0)}, ${T('co', 'every')} ${(1.9 - 0.12 * l).toFixed(1)} s`
      + T(l === 5 ? ' (→ przepis!)' : '', l === 5 ? ' (→ recipe!)' : ''),
    evoKey: 'doppia', evoIco: 'kapec', evoNm: 'CIABATTA DOPPIA',
    evoDs: T('PRZEPIS: dwa kapcie krążą wokół Ciebie bez przerwy (rzuty zostają)', 'RECIPE: two slippers orbit you non-stop (throws stay)'),
    tick(w, dt) {
      if (P.evo.doppia) updateKapcieOrb(dt); else if (G.kapcieOrb && G.kapcieOrb.length) usunKapcieOrb();   // E2 K5: PRZED cooldownem
      w.t -= dt;
      if (w.t > 0) return;
      w.t = (1.9 - 0.12 * w.lvl) / fireMul();
      // celujemy w najbliższego wroga — babcia nie pudłuje (biblia: „celność samonaprowadzająca")
      let cel = null, najl = 1e9;
      for (const e of G.enemies) { if (e.dying) continue;
        const d = e.pos.distanceTo(P.pos); if (d < najl) { najl = d; cel = e; } }
      const baza = cel ? Math.atan2(cel.pos.x - P.pos.x, cel.pos.z - P.pos.z) : playerBB.facing;
      const ile = w.lvl >= 3 ? 2 : 1;                 // E2 K5: Doppia już nie mnoży rzutów (danie = orbita, nie liczba)
      for (let i = 0; i < ile; i++) {
        const a = baza + (i - (ile - 1) / 2) * 0.34;
        const m = new THREE.Mesh(unitGeo, kapecMat);
        m.scale.set(0.85 * kapecAspect, 0.85, 1);
        scene.add(m);
        G.boomers.push({ mesh: m, dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
                         t: 0, dur: 1.5, dist: (6 + 0.5 * w.lvl) * rangeM(), lvl: w.lvl + 1, hit: new Map(), zr: 'ciabatta' });
      }
    },
  },
  // ===== WYPAD! (startowa broń Beetina, wg biblii) =====
  // Pchnięcie falą w stożku 60° przed sobą: mały zasięg, ale OGROMNY knockback —
  // bramkarz nie zabija, on odprowadza. Skalowanie: zasięg → knockback → obrażenia.
  wypad: {
    ico: 'fala', nm: T('Wypad!', 'Velvet Push'),
    ds: T('Pcha tam, gdzie tłok; w ścisku pcha dookoła', 'Shoves the thickest crowd; when surrounded, shoves all around'), max: 5, postac: 'beetino',
    lvlDs: l => `${T('zasięg', 'range')} ${(3.4 + 0.4 * l).toFixed(1)} ${T('j.', 'u')}, ${T('odrzut', 'knockback')} ${(3 + 0.5 * l).toFixed(1)}, ${T('co', 'every')} ${(1.5 - 0.06 * l).toFixed(2)} s`
      + T(l === 5 ? ' (→ przepis!)' : '', l === 5 ? ' (→ recipe!)' : ''),
    evoKey: 'selekcja', evoIco: 'tarcza', evoNm: T('DZIŚ NIE WEJDZIESZ', 'NOT ON THE LIST'),
    evoDs: T('PRZEPIS: pchnięcie ogłusza i zadaje podwójne obrażenia', 'RECIPE: the shove stuns and deals double damage'),
    // BRAMKARZ PCHA TAM, GDZIE TŁOK (decyzja właściciela 18.09). Do tej pory stożek szedł
    // w KIERUNKU BIEGU postaci — a w survivorsie biegnie się OD hordy, więc pchnięcie leciało
    // w pustą łąkę i wrogowie za plecami nigdy nie obrywali („prawie nieużywalna").
    // Teraz: 12 sektorów po 30°, celujemy w ten z największą liczbą wrogów (z sąsiadami =
    // stożek 60°); gdy w zasięgu stoi 12+ wrogów (24.09; dawniej 6, potem 8), pchnięcie idzie na 360° (bramkarz w ścisku
    // rozrzuca wszystkich dookoła). Bez wrogów w zasięgu — kierunek biegu jak dawniej.
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      // NERF (właściciel po teście 18.09: „znerfić trzeba buraka"): 4+1.3l → 3.2+1.0l, cooldown
      // 1.4 → 1.5 s, pchnięcie dookoła od 8 wrogów (było 6). Celowanie w tłok zostaje — to ono
      // naprawiło broń, obrażenia były dołożone na zapas.
      w.t = (1.5 - 0.06 * w.lvl) / fireMul();
      // BALANS 24.09 (właściciel): odrzut 5+l → 3+0,5l (~40% mniej), pchnięcie dookoła od 12 wrogów (było 8)
      const zasieg = (3.4 + 0.4 * w.lvl) * rangeObsz().m, odrzut = 3 + 0.5 * w.lvl;   // E2 K9: sufit obszarówek
      const dmg = (3.2 + 1.0 * w.lvl) * (P.evo.selekcja ? 2 : 1) * rangeObsz().dmg * dmgAll();   // ×1.28 względem 2.5+0.8l
      const sektor = new Array(12).fill(0);
      let wZasiegu = 0;
      for (const e of G.enemies) {
        if (e.dying) continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
        if (dx * dx + dz * dz > zasieg * zasieg) continue;
        wZasiegu++;
        sektor[(Math.floor(faceAngle(dx, dz) / (Math.PI / 6)) + 12) % 12]++;
      }
      const dookola = wZasiegu >= 12;
      let fx = Math.sin(playerBB.facing), fz = Math.cos(playerBB.facing);
      if (wZasiegu && !dookola) {
        let best = 0, bestN = -1;
        for (let i = 0; i < 12; i++) {
          const n = sektor[(i + 11) % 12] + sektor[i] + sektor[(i + 1) % 12];   // stożek = sektor + sąsiedzi
          if (n > bestN) { bestN = n; best = i; }
        }
        const kat = (best + 0.5) * (Math.PI / 6);
        fx = Math.sin(kat); fz = Math.cos(kat);
      }
      let trafil = 0;
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > zasieg || d < 1e-3) continue;
        if (!dookola && (dx / d) * fx + (dz / d) * fz < 0.5) continue;      // stożek ~60°
        if (P.evo.selekcja) e.stun = Math.max(e.stun || 0, 0.6);
        zadajDmg(e, dmg, { col: '#ff9d7a', sc: 1.1, kb: _kbV.set(dx, 0, dz), kbSila: odrzut, zr: 'wypad' });
        trafil++;
      }
      if (dookola) novaRing(P.pos.x, P.pos.z, zasieg);
      else novaRing(P.pos.x + fx * zasieg * 0.5, P.pos.z + fz * zasieg * 0.5, zasieg * 0.55);
      if (trafil) { AUDIO.sfx('wybuch'); G.shake = Math.max(G.shake, dookola ? 0.2 : 0.12); padWibruj(dookola ? 0.5 : 0.25, 60); }
    },
  },
  // ===== PIPSINI NIPOTINI: TOWARZYSZ, nie pocisk =====
  // Jedyna broń, na którą gracz ma wpływ POZYCJĄ: pestka goni najbliższego wroga
  // w swoim promieniu, a gdy nikogo nie ma, wraca do gracza. Co chwilę wbija
  // KIEŁEK, który tłucze wszystko wokół siebie — czyli zostawia ścieżkę
  // mini-wieżyczek. Spirala (życzenie właściciela) siedzi w umiejętności
  // specjalnej: co kilkanaście sekund pestka rozpędza się w koło przez hordę.
  pipsini: {
    ico: 'pestka', nm: 'Pipsini Nipotini', ds: T('Pestka biega, tłucze i sadzi kiełki', 'The pip runs, whacks and plants sprouts'), max: 5, locked: true,
    lvlDs: l => `${PIPS_ILE(l)} ${T('pestka(i)', 'pip(s)')}, ${T('kiełek co', 'a sprout every')} ${PIPS_SADZ(l).toFixed(1)} s`
      + T(l === 5 ? ' (→ przepis!)' : '', l === 5 ? ' (→ recipe!)' : ''),
    evoKey: 'jablon', evoIco: 'pestka', evoNm: T('JABŁOŃ', 'APPLE TREE'),
    evoDs: T('PRZEPIS: kiełki żyją 2× dłużej i biją 2× mocniej', 'RECIPE: sprouts live 2× longer and hit 2× harder'),
    tick(w, dt) {
      while (G.pestki.length < PIPS_ILE(w.lvl)) G.pestki.push(nowaPestka());
      updatePestki(dt, w.lvl);
    },
  },
  // ===== WIEŻYCZKA: jedyny element „tower defense", jaki pasuje do survivorsa =====
  // Pełny TD bije się z rdzeniem gatunku (ciągły ruch), ale POSTAWIENIE czegoś,
  // co strzela samo przez chwilę, dodaje decyzję „gdzie", nie odbierając ruchu.
  // W markecie zaczyna grać z alejkami i przewróconymi regałami jako lejem.
  sokowirowka: {
    ico: 'sokowirowka', nm: T('Sokowirówka', 'Juicer'),
    ds: T('Stawiasz ją i sama miele wrogów w miejscu', 'You place it and it grinds enemies on the spot'), max: 5, locked: true,
    lvlDs: l => `${SOKO_ILE(l)} ${T('naraz', 'at once')}, ${SOKO_ZYCIE(l).toFixed(0)} s, ${T('ładunek co', 'a charge every')} ${(6.5 - 0.5 * l).toFixed(1)} s`,
    // TOWER DEFENSE: broń NIE stawia się sama — nabija ŁADUNKI, a gracz stawia
    // wieżyczkę klawiszem F / przyciskiem / Y na padzie (decyzja właściciela).
    // Powód: wieżyczka WABI wrogów w promieniu 9.5 j., a stawiana automatycznie
    // lądowała pod stopami gracza — czyli ściągała hordę dokładnie tam, gdzie stał,
    // i cała jej wartość (zablokuj alejkę, odciągnij bossa) była nieosiągalna.
    // Celowaniem jest RUCH: dobiegasz tam, gdzie chcesz ją mieć, i wciskasz.
    tick(w, dt) {
      const maxLad = SOKO_LAD(w.lvl);
      if ((w.lad || 0) >= maxLad) return;                    // zapas pełny — licznik stoi
      w.tMax = (6.5 - 0.5 * w.lvl) / fireMul();
      w.t -= dt;
      if (w.t > 0) return;
      w.t = w.tMax;
      w.lad = (w.lad || 0) + 1;
      if (!P.sokoPierwszy) {                                // raz na bieg: naucz gracza przycisku
        P.sokoPierwszy = true;
        const kw = glifTekst('wieza');
        toastBuff(kw ? T(`SOKOWIRÓWKA GOTOWA — wciśnij ${kw}, żeby POSTAWIĆ`, `JUICER READY — press ${kw} to PLACE IT`)
          : T('SOKOWIRÓWKA GOTOWA — dotknij przycisku, żeby POSTAWIĆ', 'JUICER READY — tap the button to PLACE IT'), 'sokowirowka');
        setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 4000);
      }
    },
  },
};
// ============================== E2 K6: NOWE DANIA — pomocnicy (spec 08 §3.4) ==============================
// BURZA: łańcuch od trafionego — najbliższy nietrafiony w 5 × rangeM(), do 4 skoków, obrażenia 3 × 0,75^k; ten sam wróg raz
const _trafBurza = new Set();
function lancuchBurzy(e0) {
  _trafBurza.clear(); _trafBurza.add(e0);
  let cur = e0;
  const R = 5 * rangeM();
  for (let k = 1; k <= 4; k++) {
    let nast = null, nd = R * R;
    for (const e of G.enemies) {
      if (e.dying || _trafBurza.has(e)) continue;
      const dx = e.pos.x - cur.pos.x, dz = e.pos.z - cur.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < nd) { nd = d2; nast = e; }
    }
    if (!nast) break;
    _trafBurza.add(nast);
    // odcinek gromu między celami: boltGeo (14 j.) przeskalowany do długości, jak tracer Wiatrówki
    const dx = nast.pos.x - cur.pos.x, dz = nast.pos.z - cur.pos.z, dl = Math.sqrt(nd) || 0.01;
    const tr = new THREE.Mesh(boltGeo, boltMat.clone());
    tr.scale.set(1.6, dl / 14, 1.6);                // grubszy niż tracer — łańcuch ma być czytelny w tłumie
    tr.position.set(cur.pos.x + dx / 2, (cur.ty + nast.ty) / 2 + 1.0, cur.pos.z + dz / 2);
    tr.rotation.set(Math.PI / 2, 0, -Math.atan2(dx, dz));
    scene.add(tr);
    G.bolts.push({ mesh: tr, t: 0 });
    spark(nast.pos.x, nast.ty + 1.0, nast.pos.z);
    zadajDmg(nast, 3 * Math.pow(0.75, k) * dmgAll(), { col: '#e8f4ff', sc: 0.9, zr: 'piorun' });
    cur = nast;
  }
}
// SMRÓD POKOLENIOWY: co 0,35 s, jeśli gracz przeszedł ≥ 0,8 j. od ostatniej chmury — nowa chmura (najwyżej 12).
// Odchylenie od spec (r 1,8, 0,6 × aury): pomiar w biegu (okrąg r 10, ~6 j./s) dawał ×1,37 Skarpety — cel §9.3 p. 7 to ×1,5.
const CHMURA = { r: 2.2, dmg: 0.85, zycie: 4.0, max: 12 };
function smugaSmrodu(w, dt) {
  w.chmT = (w.chmT || 0) - dt;
  if (w.chmT > 0) return;
  w.chmT = 0.35;
  const ost = G.chmury[G.chmury.length - 1];
  if (ost && Math.hypot(P.pos.x - ost.x, P.pos.z - ost.z) < 0.8) return;
  if (G.chmury.length >= CHMURA.max) G.chmury.shift();
  const r = CHMURA.r * rangeObsz().m;
  G.chmury.push({ x: P.pos.x, z: P.pos.z, r, t: CHMURA.zycie });
  splat(P.pos.x, P.pos.z, 0x6f9a2e, r * 1.6);       // zielona plama pod chmurą (pula `plamy`)
  const pl = plamy[(plamaIdx - 1 + PLAM_MAX) % PLAM_MAX]; if (pl) pl.t = 2.0;   // gaśnie razem z chmurą (4–6 s)
}
function tikChmur(dmg) {
  for (const c of G.chmury) {
    if (G.puffs.length < 28) puff(c.x, terrainH(c.x, c.z) + 0.4, c.z, 0xa8e05f, 1.8);   // limit puffów 40 — reszta dla innych broni
    for (const e of G.enemies) {
      if (e.dying || e.smrTik === G.smrTikId) continue;
      const dx = e.pos.x - c.x, dz = e.pos.z - c.z;
      if (dx * dx + dz * dz > c.r * c.r) continue;
      e.smrTik = G.smrTikId; e.smrodDo = G.time + 1.0;
      zadajDmg(e, dmg, { col: '#a8e05f', sc: 0.7, zr: 'skarpeta' });
    }
  }
}
function updateChmury(dt) {
  for (let i = G.chmury.length - 1; i >= 0; i--) if ((G.chmury[i].t -= dt) <= 0) G.chmury.splice(i, 1);
}
// PIZZA CALAMITA (i Wypad): kierunek najgęstszego sektora 30° (z sąsiadami = stożek 60°) w zasięgu; null = pusto
const _sektor = new Array(12);
function najgestszyKierunek(zasieg) {
  _sektor.fill(0);
  let n = 0;
  for (const e of G.enemies) {
    if (e.dying) continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
    if (dx * dx + dz * dz > zasieg * zasieg) continue;
    n++;
    _sektor[(Math.floor(faceAngle(dx, dz) / (Math.PI / 6)) + 12) % 12]++;
  }
  if (!n) return null;
  let best = 0, bestN = -1;
  for (let i = 0; i < 12; i++) {
    const s = _sektor[(i + 11) % 12] + _sektor[i] + _sektor[(i + 1) % 12];
    if (s > bestN) { bestN = s; best = i; }
  }
  const kat = (best + 0.5) * (Math.PI / 6);
  return { x: Math.sin(kat), z: Math.cos(kat) };
}
// KAŁUŻA: środek największej grupy — próbka do 40 wrogów, wygrywa ten z największą liczbą sąsiadów w 2,5 j.
function srodekTlumu(alive) {
  const prob = alive.length > 40 ? Array.from({ length: 40 }, () => alive[Math.floor(Math.random() * alive.length)]) : alive;
  let best = prob[0], bn = -1;
  for (const a of prob) {
    let n = 0;
    for (const b of alive) { const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z; if (dx * dx + dz * dz < 6.25) n++; }
    if (n > bn) { bn = n; best = a; }
  }
  return best;
}
let kaluzaMat = null;
function kaluzaTexture() {                         // zielona lepka plama (paleta jak ketchupTexture, inny kolor)
  const S = 16, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), d = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.hypot(x - 7.5, y - 7.5), i = (y * S + x) * 4;
    const kol = r < 7.4 ? (r > 6.2 ? [74, 96, 26] : r > 3.4 ? [155, 191, 58] : [186, 214, 92]) : null;
    if (kol) { d.data[i] = kol[0]; d.data[i + 1] = kol[1]; d.data[i + 2] = kol[2]; d.data[i + 3] = 255; }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function postawKaluze(x, z) {
  if (!kaluzaMat) kaluzaMat = new THREE.MeshBasicMaterial({ map: kaluzaTexture(), transparent: true, opacity: 0.55, depthWrite: false });
  if (G.kaluzeGracza.length >= 4) { const st = G.kaluzeGracza.shift(); scene.remove(st.mesh); st.mesh.material.dispose(); }
  const r = 2.6 * rangeObsz().m;
  const m = new THREE.Mesh(blobGeo, kaluzaMat.clone());
  m.scale.set(r * 2, 1, r * 2);
  m.position.set(x, terrainH(x, z) + 0.045, z);
  scene.add(m);
  G.kaluzeGracza.push({ x, z, r, t: 5.0, tik: 0, mesh: m });
}
function updateKaluzeGracza(dt) {
  for (let i = G.kaluzeGracza.length - 1; i >= 0; i--) {
    const k = G.kaluzeGracza[i];
    k.t -= dt; k.tik -= dt;
    k.mesh.material.opacity = k.t < 1 ? (Math.floor(k.t * 8) % 2 ? 0.55 : 0.2) : 0.55;   // miga 1 s przed końcem
    if (k.tik <= 0) {
      k.tik = 0.5;
      for (const e of G.enemies) {
        if (e.dying) continue;
        const dx = e.pos.x - k.x, dz = e.pos.z - k.z;
        if (dx * dx + dz * dz > k.r * k.r) continue;
        e.kaluzaDo = G.time + 0.6;
        zadajDmg(e, 1.0 * rangeObsz().dmg * dmgAll(), { col: '#c6e36a', sc: 0.7, zr: 'butelka' });
      }
    }
    if (k.t <= 0) { scene.remove(k.mesh); k.mesh.material.dispose(); G.kaluzeGracza.splice(i, 1); }
  }
}

// PIZZA CALAMITA: wylot 0,55 s do `dist` → ZAWIS 1,2 s w stałym punkcie świata (kotwica) → powrót 0,55 s do gracza.
// W zawisie bije wszystkich w r 2,4 co 0,25 s (0,9 × obrażeń pizzy) i ściąga zwykłych wrogów z r 4,5 (4 j./s; Gummini ×0,5).
// Odchylenie od spec (r 2,0 / 0,3 s / 0,5×): pomiar dpsBroni w tłumie dawał ×0,71 zwykłej pizzy — zwykła w drodze powrotnej
// bije co klatkę (czyści `hit`), a zawis przy spec-liczbach nie nadrabiał; teraz powrót bije tak samo, zawis mocniej (×1,5).
// B13 (28.09): TRAFIENIA BUMERANGÓW NIEZALEŻNE OD FPS. Dawniej droga powrotna Pizzy / La Ciabatty (i Calamity) czyściła
// `hit` co klatkę = trafienie na klatkę → przy 60 FPS ~1,8× obrażeń co przy 30, przy 120 ~3,3×. Teraz `B.hit` to Map
// wróg → najbliższy dozwolony czas (w zegarze pocisku B.t): wylot = raz na wroga, powrót = co `cd` s (przy ciągłym
// kontakcie kolejne trafienie liczone od poprzedniego terminu, nie od klatki — średnio dokładnie 1/cd na s przy każdym FPS),
// obrażenia powrotu × `mnoz[B.zr]` — tak dobrane, żeby DPS (dpsBroni, tłum) = dawny przy 30 FPS (na nim stroiliśmy).
// cd = 1/30 s (tyle, ile dawniej dawało 30 FPS): przy 0,1 s z mnożnikiem ×2–2,3 tłum się zgadzał, ale pojedynczy cel
// (kapral, Don) rozjeżdżał się o −25% (Ciabatta) / +40% (Pizza); przy 1/30 s cel i tłum trzymają się razem.
// Mnożniki < 1, bo podkroki toru (niżej, w update) łapią wrogów, których pocisk przy 30 FPS przeskakiwał.
const BUMERANG = { cd: 1 / 30, mnoz: { bumerang: 0.93, ciabatta: 0.91 } };
function bumerangTraf(B, e, powrot) {             // → mnożnik obrażeń albo 0 (jeszcze nie wolno)
  const nast = B.hit.get(e);
  if (!powrot) { if (nast !== undefined) return 0; B.hit.set(e, Infinity); return 1; }
  if (nast !== undefined && nast > B.t + 1e-4) return 0;
  B.hit.set(e, nast !== undefined && B.t - nast < BUMERANG.cd ? nast + BUMERANG.cd : B.t + BUMERANG.cd);
  return BUMERANG.mnoz[B.zr] || 1;
}
const CALAMITA = { wylot: 0.55, zawis: 1.2, powrot: 0.55, rBij: 2.4, rCiag: 4.5, v: 4.0, tik: 0.25, mnoz: 0.9 };   // 0,9: ×1,5 także przy 60 FPS
function lotCalamity(B, dt) {
  B.ft += dt;
  const dmgPizzy = (2 + 0.5 * B.lvl) * dmgAll();
  let x, z, skala = 0.9, obr = 12;
  if (B.faza === 'wylot') {
    const k = Math.min(1, B.ft / CALAMITA.wylot), r = Math.sin(k * Math.PI / 2) * B.dist;
    x = P.pos.x + B.dir.x * r; z = P.pos.z + B.dir.z * r;
    if (k >= 1) {
      B.faza = 'zawis'; B.ft = 0; B.kotwica = { x, z }; B.tik = 0; B.ring2 = false;
      novaRing(x, z, CALAMITA.rCiag);                 // widać zasięg przyciągania
    }
  } else if (B.faza === 'zawis') {
    x = B.kotwica.x; z = B.kotwica.z;
    const k = Math.min(1, B.ft / CALAMITA.zawis);
    skala = 0.9 + 0.5 * Math.min(1, k * 3); obr = 24;
    if (!B.ring2 && B.ft >= 0.6) { B.ring2 = true; novaRing(x, z, CALAMITA.rBij); }
    for (const e of G.enemies) {                     // przyciąganie (kaprale i Don — nie)
      if (e.dying || e.kapral || e.don || e.T.boss) continue;
      const dx = x - e.pos.x, dz = z - e.pos.z, d = Math.hypot(dx, dz);
      if (d > CALAMITA.rCiag || d < 0.8) continue;
      const v = CALAMITA.v * (e.type === 'gummini' ? 0.5 : 1) * dt;
      e.pos.x += dx / d * v; e.pos.z += dz / d * v;
    }
    B.tik -= dt;
    if (B.tik <= 0) {
      B.tik = CALAMITA.tik;
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        const dx = e.pos.x - x, dz = e.pos.z - z;
        if (dx * dx + dz * dz < CALAMITA.rBij * CALAMITA.rBij) zadajDmg(e, CALAMITA.mnoz * dmgPizzy, { col: '#d9b3ff', sc: 0.8, zr: 'bumerang' });
      }
    }
    if (k >= 1) { B.faza = 'powrot'; B.ft = 0; B.hit.clear(); }   // w drodze powrotnej bije ponownie (co BUMERANG.cd)
  } else {
    const k = Math.min(1, B.ft / CALAMITA.powrot);
    x = B.kotwica.x + (P.pos.x - B.kotwica.x) * k; z = B.kotwica.z + (P.pos.z - B.kotwica.z) * k;
    skala = 1.4 - 0.5 * k;
    if (k >= 1) return true;
  }
  B.mesh.position.set(x, terrainH(x, z) + 1.0, z);
  B.mesh.scale.set(skala, skala, 1);
  B.mesh.rotation.set(0, camYaw, B.t * obr);
  if (B.faza !== 'zawis') for (let j = G.enemies.length - 1; j >= 0; j--) {   // w locie kosi jak zwykła pizza
    const e = G.enemies[j];
    if (e.dying) continue;
    const dx = x - e.pos.x, dz = z - e.pos.z;
    if (dx * dx + dz * dz < 1.1) {
      const mn = bumerangTraf(B, e, B.faza === 'powrot');
      if (!mn) continue;
      spark(e.pos.x, e.ty + 1.0, e.pos.z);
      zadajDmg(e, mn * dmgPizzy, { col: '#d9b3ff', kb: _kbV.set(-dx, 0, -dz), kbSila: 2.4, zr: 'bumerang' });
    }
  }
  return false;
}

// ============================== E2 K5: CIABATTA DOPPIA — DWA KAPCIE NA ORBICIE (spec 08 §3.5) ==============================
// Opis dania („kapcie krążą wokół Ciebie bez przerwy") ≠ dawny kod (×2 rzutów). Teraz: 2 meshe kapecMat w przeciwnych fazach,
// r 2,8 × rangeObsz().m; trafienie → osobny cooldown na wroga 0,4 s, odrzut 2.
// Odchylenie od spec (ω 3, trafienie 1 j., 3,5 obrażeń): pomiar dpsBroni (tłum) dawał ×1,18 La Ciabatty poz. 5 — danie
// słabsze niż przed naprawą (×2,4 z podwójnymi rzutami) u najsłabszej postaci. Teraz ω 4,5, trafienie 1,2 j., 1,4 × (2 + 0,5·6) = 7.
const KAPEC_ORB = { r: 2.8, omega: 4.5, trafR: 1.2, cd: 0.4, dmg: 7.0, kb: 2.0 };
function updateKapcieOrb(dt) {
  if (!G.kapcieOrb) G.kapcieOrb = [];
  while (G.kapcieOrb.length < 2) {
    const m = new THREE.Mesh(unitGeo, kapecMat);
    m.scale.set(0.85 * kapecAspect, 0.85, 1);
    scene.add(m);
    G.kapcieOrb.push({ mesh: m, faza: G.kapcieOrb.length * Math.PI });
  }
  const r = KAPEC_ORB.r * rangeObsz().m, dmg = KAPEC_ORB.dmg * rangeObsz().dmg * dmgAll();
  G.kapOrbKat = (G.kapOrbKat || 0) + KAPEC_ORB.omega * dt;
  for (const k of G.kapcieOrb) {
    const a = G.kapOrbKat + k.faza, x = P.pos.x + Math.sin(a) * r, z = P.pos.z + Math.cos(a) * r;
    k.mesh.position.set(x, terrainH(x, z) + 1.0, z);
    k.mesh.rotation.set(0, camYaw, G.time * 12);
    for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying || (e.kapecT || 0) > G.time) continue;
      const dx = e.pos.x - x, dz = e.pos.z - z;
      if (dx * dx + dz * dz > KAPEC_ORB.trafR * KAPEC_ORB.trafR) continue;
      e.kapecT = G.time + KAPEC_ORB.cd;
      spark(e.pos.x, e.ty + 1.0, e.pos.z);
      zadajDmg(e, dmg, { col: '#d9b3ff', kb: _kbV.set(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z), kbSila: KAPEC_ORB.kb, zr: 'ciabatta' });
    }
  }
}
function usunKapcieOrb() {
  for (const k of G.kapcieOrb || []) scene.remove(k.mesh);
  G.kapcieOrb = [];
}

// ============================== PIPSINI: TOWARZYSZ I KIEŁKI ==============================
const PIPS_ILE = l => 1 + Math.floor(l / 2);      // 1 / 1 / 2 / 2 / 3 pestki
// dzielone przez fireMul() jak kazdy inny cooldown — inaczej Pipsini ignoruje Tempo
const PIPS_SADZ = l => (1.8 - 0.16 * l) / fireMul();   // kiełek co 1.64 → 1.0 s
const PIPS_ZASIEG = 7.5;                          // jak daleko od gracza pestka poluje
const KIELEK_ZYCIE = () => (P.evo.jablon ? 8 : 4);
const KIELEK_DMG = () => (P.evo.jablon ? 1.6 : 0.8) * dmgAll();
let kielekMat = null;
function kielekTexture() {
  const S = 32;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#6b4a24'; g.fillRect(13, 24, 6, 8);            // ziemia/łupina
  g.fillStyle = '#4e8f2e'; g.fillRect(15, 12, 2, 13);           // łodyżka
  g.fillStyle = '#7cc94f';                                       // dwa listki
  g.beginPath(); g.ellipse(11, 14, 5, 3, -0.5, 0, 7); g.fill();
  g.beginPath(); g.ellipse(21, 12, 5, 3, 0.5, 0, 7); g.fill();
  g.fillStyle = '#a8e06a'; g.fillRect(15, 8, 2, 4);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function nowaPestka() {
  const bb = new Billboard('pipsini_nipotini', 0.8);
  bb.play('run');
  return { bb, pos: P.pos.clone(), cel: null, sadzT: 0, spiralaCd: 12, spirala: 0, kat: Math.random() * 7 };
}
function usunPestki() {
  for (const p of G.pestki) p.bb.dispose();
  G.pestki = [];
  for (const k of G.kielki) scene.remove(k.mesh);
  G.kielki = [];
}
function sadzKielek(x, z) {
  if (G.kielki.length > 40) return;                // hamulec: przy 3 pestkach sypie się gęsto
  if (!kielekMat) kielekMat = new THREE.MeshBasicMaterial({ map: kielekTexture(),
    transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const m = new THREE.Mesh(unitGeo, kielekMat);
  m.scale.set(0.55, 0.55, 1);
  m.position.set(x, terrainH(x, z), z);
  scene.add(m);
  G.kielki.push({ mesh: m, pos: new THREE.Vector3(x, 0, z), t: 0, cd: 0 });
}
function updatePestki(dt, lvl) {
  for (const p of G.pestki) {
    // ---- cel: najbliższy wróg w promieniu, inaczej wracamy do gracza ----
    let cel = null, najl = PIPS_ZASIEG * rangeM();
    for (const e of G.enemies) {
      if (e.dying) continue;
      const d = e.pos.distanceTo(p.pos);
      if (d < najl) { najl = d; cel = e; }
    }
    p.spiralaCd -= dt;
    if (p.spiralaCd <= 0 && G.enemies.length > 6) { p.spirala = 2.2; p.spiralaCd = 12; p.kat = 0; }
    let doX, doZ, spd = 6.4;
    if (p.spirala > 0) {
      // SPIRALA: rozkręcający się łuk wokół gracza — przelot przez hordę
      p.spirala -= dt;
      p.kat += dt * 5.5;
      const r = 1.4 + (2.2 - p.spirala) * 2.6;
      doX = P.pos.x + Math.cos(p.kat) * r;
      doZ = P.pos.z + Math.sin(p.kat) * r;
      spd = 11;
    } else if (cel) { doX = cel.pos.x; doZ = cel.pos.z; }
    else {                                          // trzyma się przy nodze gracza
      p.kat += dt * 1.6;
      doX = P.pos.x + Math.cos(p.kat) * 1.6;
      doZ = P.pos.z + Math.sin(p.kat) * 1.6;
      spd = 5.2;
    }
    const dx = doX - p.pos.x, dz = doZ - p.pos.z;
    const dl = Math.hypot(dx, dz) || 1e-6;
    p.pos.x += (dx / dl) * spd * dt;
    p.pos.z += (dz / dl) * spd * dt;
    p.bb.facing = faceAngle(dx / dl, dz / dl);
    p.bb.update(dt, p.pos, terrainH(p.pos.x, p.pos.z));
    // ---- kontakt: rani i odpycha ----
    for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying || e.orbCd > 0) continue;
      if (e.pos.distanceTo(p.pos) > 0.85) continue;
      e.orbCd = 0.4 / fireMul();          // Pipsini tez slucha Tempa
      zadajDmg(e, 1.2 * dmgAll(), { col: '#c9f07a', sc: 0.85, kb: _kbV.copy(e.pos).sub(p.pos), kbSila: 1.8, zr: 'pipsini' });
    }
    // ---- sadzenie ----
    p.sadzT -= dt;
    if (p.sadzT <= 0) { p.sadzT = PIPS_SADZ(lvl); sadzKielek(p.pos.x, p.pos.z); }
  }
  // ---- kiełki: tłuką wokół siebie i więdną ----
  for (let i = G.kielki.length - 1; i >= 0; i--) {
    const k = G.kielki[i];
    k.t += dt;
    const zycie = KIELEK_ZYCIE();
    k.mesh.rotation.y = camYaw;
    const rosnie = Math.min(1, k.t * 4);            // wyrasta w 0.25 s
    k.mesh.scale.set(0.55 * rosnie, 0.55 * rosnie * (1 + Math.sin(k.t * 6) * 0.05), 1);
    k.cd -= dt;
    if (k.cd <= 0) {
      k.cd = 0.5;
      const dmg = KIELEK_DMG();
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        if (e.pos.distanceTo(k.pos) > (P.evo.jablon ? 1.9 : 1.4) * rangeM()) continue;
        zadajDmg(e, dmg, { col: '#a8e05f', sc: 0.7, zr: 'pipsini' });
      }
    }
    if (k.t > zycie) { scene.remove(k.mesh); G.kielki.splice(i, 1); }
  }
}

const SOKO_ILE = l => 1 + Math.floor(l / 2);      // 1 / 1 / 2 / 2 / 3
// Zapas ładunków OGRANICZONY LIMITEM STOJĄCYCH: bez tego gracz nabijał drugi ładunek,
// którego przy poziomie 1-2 nie ma gdzie wydać, i patrzył na przycisk, co nie działa.
const SOKO_LAD = l => Math.min(2, SOKO_ILE(l));
const STAW_KLAWISZ = 'KeyF';
const SOKO_ZYCIE = l => 20 + l * 3;               // 23 → 35 s (jeśli wcześniej nie rozwalą)
const SOKO_HP = l => (6 + 3 * l) * HP_SERCA;      // wytrzymałość na ciosy wrogów (skala serca, K3)
const SOKO_WABI = 9.5;                            // w tym promieniu wrogowie idą po NIĄ, nie po gracza
const SOKO_CD = l => 0.55 - 0.05 * l;             // strzał co 0.5 → 0.3 s
const SOKO_DMG = l => 0.8 + 0.25 * l;             // mnożnik obrażeń pocisku

// pixelowa sokowirówka rysowana w kodzie — do podmiany na sprite'a z PixelLaba
function sokowirowkaTexture() {
  const W = 32, H = 40;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const p = (x, y, w, h, kol) => { g.fillStyle = kol; g.fillRect(x, y, w, h); };
  p(6, 30, 20, 8, '#7d8794');                     // podstawa
  p(6, 30, 20, 2, '#a9b3c0');
  p(9, 14, 14, 17, '#d7dde6');                    // korpus
  p(9, 14, 3, 17, '#f2f5f9');                     // światło z lewej
  p(20, 14, 3, 17, '#aab3bf');                    // cień z prawej
  p(11, 20, 10, 6, '#8ad14f');                    // okienko z sokiem
  p(11, 20, 10, 2, '#b6ea7d');
  p(7, 8, 18, 6, '#c2ccd8');                      // lej wsypowy
  p(7, 8, 18, 2, '#e8eef5');
  p(13, 3, 6, 5, '#f2c14a');                      // marchewka wsypana do leja
  p(14, 0, 4, 3, '#5aa83c');
  p(12, 34, 3, 4, '#5a6472'); p(17, 34, 3, 4, '#5a6472');   // nóżki
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let sokoMat = null, sokoAsp = 0, paskoTlo = null, paskoFill = null;
// PASEK ŻYCIA nad wieżyczką: dwa płaskie quady zawsze zwrócone do kamery.
// Wieżyczka ściąga na siebie hordę, więc gracz musi widzieć, ile jej zostało.
function dodajPasek(t, y) {
  if (!paskoTlo) {
    paskoTlo = new THREE.MeshBasicMaterial({ color: 0x1b1b22, transparent: true, opacity: 0.85, depthWrite: false });
    paskoFill = new THREE.MeshBasicMaterial({ color: 0x8ad14f, depthWrite: false });
  }
  t.pasTlo = new THREE.Mesh(unitGeo, paskoTlo);
  t.pasFill = new THREE.Mesh(unitGeo, paskoFill.clone());
  for (const m of [t.pasTlo, t.pasFill]) { m.renderOrder = 4; scene.add(m); }
  t.pasY = y;
}
function updatePasek(t) {
  const k = Math.max(0, t.hp / t.maxHp);
  t.pasTlo.position.set(t.pos.x, t.pasY, t.pos.z);
  t.pasTlo.scale.set(1.5, 0.16, 1);
  billboardQuat(t.pasTlo.quaternion);
  // wypełnienie od LEWEJ: skalujemy i przesuwamy o połowę ubytku
  t.pasFill.position.set(t.pos.x - (1 - k) * 0.72, t.pasY + 0.01, t.pos.z);
  t.pasFill.scale.set(1.44 * k, 0.11, 1);
  billboardQuat(t.pasFill.quaternion);
  t.pasFill.material.color.setHex(k > 0.5 ? 0x8ad14f : (k > 0.25 ? 0xf2c14a : 0xe0453c));
  t.pasFill.visible = k > 0.001;
}
// ---- STAWIANIE NA ŻĄDANIE: klawisz F / przycisk / Y na padzie ----
function postawWiezyczke() {
  if (!G.running || G.paused || G.dying) return;
  const w = hasWeapon('sokowirowka');
  if (!w || !(w.lad > 0)) return;
  if (G.turrets.length >= SOKO_ILE(w.lvl)) {        // limit stojących — ładunek zostaje
    toastBuff(T('LIMIT SOKOWIRÓWEK — poczekaj, aż któraś padnie', 'JUICER LIMIT — wait for one to break down'), 'sokowirowka');
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 1800);
    return;
  }
  w.lad--;
  stawSokowirowke(w.lvl);
  AUDIO.sfx('totem');
  G.shake = Math.max(G.shake, 0.12);
  odswiezStawBtn();
}
// Przycisk odświeżamy co klatkę, ale DOM ruszamy tylko przy realnej zmianie stanu
// (pasek kwantowany co 5%), bo inaczej byłoby to kilkaset zapisów na sekundę.
let _stawStan = '';
function odswiezStawBtn() {
  const el = document.getElementById('stawBtn');
  if (!el) return;
  const w = G.running ? hasWeapon('sokowirowka') : null;
  const widoczny = !!w && !G.paused && !G.dying && !G.fps.on;
  const lad = w ? (w.lad || 0) : 0;
  const maxLad = w ? SOKO_LAD(w.lvl) : 0;
  const pelno = w ? G.turrets.length >= SOKO_ILE(w.lvl) : false;
  // pasek: 100% = zapas pełny. `w.tMax` jest ustawiane w ticku broni, więc w pierwszej
  // klatce po zdobyciu Sokowirówki jeszcze go nie ma — wtedy pasek musi być PUSTY, nie pełny.
  const fill = lad >= maxLad ? 100
    : (w && w.tMax ? Math.round((1 - Math.max(0, w.t) / w.tMax) * 20) * 5 : 0);
  const stan = widoczny + '|' + lad + '|' + maxLad + '|' + pelno + '|' + fill;
  if (stan === _stawStan) return;
  _stawStan = stan;
  el.classList.toggle('on', widoczny);
  if (!widoczny) return;
  el.classList.toggle('gotowy', lad > 0 && !pelno);
  el.classList.toggle('pelno', pelno);
  const im = el.querySelector('.kimg');
  if (!im.style.backgroundImage) im.style.backgroundImage = `url(${icon('sokowirowka', 4)})`;
  const lw = el.querySelector('.lad');
  if (lw.childElementCount !== maxLad) lw.innerHTML = '<i></i>'.repeat(maxLad);
  for (let i = 0; i < maxLad; i++) lw.children[i].className = i < lad ? '' : 'off';
  el.querySelector('.pas b').style.width = fill + '%';
}
// E1-bieg K6: PRZYCISK AURY GARLICINA (dotyk, poziomo). Dotąd aura działała tylko z klawisza G / pada,
// więc na telefonie umiejętność postaci nie istniała. Pasek = ładowanie (1 − cd/SMROD_CD), puls = gotowa.
let _smrodStan = '';
function odswiezSmrodBtn() {
  const el = document.getElementById('smrodBtn');
  if (!el) return;
  const widoczny = charKey === 'garlicino' && G.running && !G.paused && !G.fps.on && !G.dying;
  const gotowy = widoczny && P.smrodCd <= 0 && P.smrodT <= 0;
  const fill = widoczny ? Math.round(Math.max(0, Math.min(1, 1 - P.smrodCd / SMROD_CD)) * 20) * 5 : 0;
  const stan = widoczny + '|' + gotowy + '|' + fill;
  if (stan === _smrodStan) return;
  _smrodStan = stan;
  el.classList.toggle('on', widoczny);
  el.classList.toggle('gotowy', gotowy);
  const im = el.querySelector('.kimg');
  if (im && !im.style.backgroundImage) im.style.backgroundImage = `url(${icon('skarpeta', 4)})`;
  el.querySelector('.pas b').style.width = fill + '%';
}
function stawSokowirowke(lvl) {
  // sprite od wlasciciela (`assets/mikser.png`, 66x120 px w natywnej rozdzielczosci
  // pixel-artu); proceduralna `sokowirowkaTexture()` zostaje jako zaslepka, gdyby
  // plik nie wstal — ta sama zasada, co przy karabinie
  if (!sokoMat) sokoMat = new THREE.MeshBasicMaterial({ map: sokowirowkaTexture(),
    transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const y = supportY(P.pos.x, P.pos.z, P.y);      // staje tam, gdzie stoisz — też na regale
  // WYŻSZA OD WROGÓW (wróg ma ~1.5 j.): ma być widoczna w tłumie, bo to ona
  // przejmuje na siebie hordę i gracz musi wiedzieć, gdzie stoi.
  const h = sokoAsp ? 2.4 : 2.1;                   // sprite miksera jest wyzszy niz zaslepka
  const m = new THREE.Mesh(unitGeo, sokoMat);
  m.scale.set(h * (sokoAsp || 0.8), h, 1);
  m.position.set(P.pos.x, y, P.pos.z);
  scene.add(m);
  const hp = SOKO_HP(lvl);
  const t = { mesh: m, pos: new THREE.Vector3(P.pos.x, y, P.pos.z),
              t: 0, zycie: SOKO_ZYCIE(lvl), cd: 0, lvl, hp, maxHp: hp, hitCd: 0 };
  dodajPasek(t, y + h + 0.25);
  G.turrets.push(t);
  AUDIO.sfx('totem');
  puff(P.pos.x, y + 0.6, P.pos.z, 0xa8e05f, 1.4);
  dmgPop(P.pos.x, y + 1.6, P.pos.z, T('MIELE!', 'GRINDING!'), '#a8e05f', 1.2);
}
// ============================== KRZAK POMIDOROWY ==============================
const KRZAK_ILE  = l => 1 + Math.floor(l / 2);        // 1,1,2,2,3 stojących naraz
const KRZAK_SADZ = l => 5.5 - 0.5 * l;                // co ile sadzi kolejny
const KRZAK_ZYCIE = l => 11 + 2 * l;                  // ile sekund żyje krzak
const KRZAK_RZUT = l => 1.7 - 0.12 * l;               // co ile rzuca pomidorem
const KRZAK_R    = l => 1.7 + 0.22 * l;               // promień plaśnięcia
const KRZAK_DMG  = l => (1.5 + 0.55 * l);             // mnożone przez dmgAll()
const KRZAK_ZASIEG = l => 9 + l;                      // jak daleko widzi cel
let krzakMat = null, pomidorMat = null;
function initKrzak() {
  // proceduralny pixel art (`pixTex` = prostokąty + darmowy kontur), bo krzak musi
  // pasować gęstością pikseli do reszty, a nie być kolejnym arkuszem w innej skali
  krzakMat = new THREE.MeshBasicMaterial({ map: pixTex(24, 26, [
    [10, 20, 4, 6, '#6b4a26'],                                     // pieniek
    [4, 10, 16, 11, '#3f7a2e'], [7, 5, 10, 8, '#4e9138'],          // gałęzie
    [2, 13, 6, 7, '#468433'], [16, 13, 6, 7, '#468433'],
    [6, 15, 4, 4, '#d93b2b'], [14, 12, 4, 4, '#e8492f'],           // pomidory
    [10, 19, 4, 4, '#c9331f'],
  ]), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  pomidorMat = new THREE.MeshBasicMaterial({ map: pixTex(8, 8, [
    [1, 1, 6, 6, '#e8492f'], [2, 2, 2, 2, '#ff8a6b'],              // owoc + błyk
    [3, 0, 2, 2, '#3f7a2e'],                                        // szypułka
  ]), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
}
function posadzKrzak(lvl) {
  const m = new THREE.Mesh(unitGeo, krzakMat);
  const h = 1.15;
  m.scale.set(h * (24 / 26), h, 1);
  // sadzimy TUŻ ZA graczem, nie pod nim: krzak pod stopami zasłaniałby postać,
  // a przy okazji „zostawiony za sobą ogród" czyta się właśnie wtedy, gdy zostaje w tyle
  const kat = playerBB ? playerBB.facing + Math.PI : 0;
  const x = P.pos.x + Math.sin(kat) * 1.4, z = P.pos.z + Math.cos(kat) * 1.4;
  m.position.set(x, terrainH(x, z), z);
  billboardQuat(m.quaternion);
  scene.add(m);
  G.krzaki.push({ mesh: m, pos: new THREE.Vector3(x, terrainH(x, z), z),
                  t: 0, cd: 0.5, zycie: KRZAK_ZYCIE(lvl), lvl });
  AUDIO.sfx('kosc');
}
function updateKrzaki(dt) {
  for (let i = G.krzaki.length - 1; i >= 0; i--) {
    const k = G.krzaki[i];
    k.t += dt;
    billboardQuat(k.mesh.quaternion, Math.sin(k.t * 3.4) * 0.05);   // kołysze się
    if (k.zycie - k.t < 2.5) k.mesh.visible = Math.sin(k.t * 14) > -0.4;   // usycha
    if (k.t >= k.zycie) { scene.remove(k.mesh); G.krzaki.splice(i, 1); continue; }
    k.cd -= dt;
    if (k.cd > 0) continue;
    // cel: najbliższy wróg w zasięgu krzaka (nie gracza — krzak walczy sam za siebie)
    let cel = null, naj = KRZAK_ZASIEG(k.lvl) * rangeM();
    for (const e of G.enemies) {
      if (e.dying) continue;
      const d = e.pos.distanceTo(k.pos);
      if (d < naj) { naj = d; cel = e; }
    }
    if (!cel) continue;
    k.cd = KRZAK_RZUT(k.lvl) / fireMul();
    const m = new THREE.Mesh(unitGeo, pomidorMat);
    m.scale.set(0.42, 0.42, 1);
    scene.add(m);
    // ten sam mechanizm łuku, co butelka żula (`G.lobs`), ale z WŁASNYM promieniem
    // i obrażeniami — dlatego lobs dostały opcjonalne pola `r`/`dmg`
    G.lobs.push({ mesh: m, from: k.pos.clone(), to: cel.pos.clone(), t: 0, dur: 0.62,
                  lvl: k.lvl, r: KRZAK_R(k.lvl), dmg: KRZAK_DMG(k.lvl), wys: 2.2, zr: 'krzak' });
  }
}

// ============ SMRODLIWA AURA GARLICINA (aktywna umiejetnosc, klawisz G) ============
// Pierwsza AKTYWNA umiejetnosc postaci w grze. Nie zadaje obrazen — ROBI MIEJSCE:
// przez 3 s odpycha wszystko w promieniu 7.5 j. i krotko oglusza, wiec jest
// odpowiedzia na „utknalem w scianie wrogow", a nie kolejnym zrodlem DPS-u.
// Swiadomie NIE jest automatyczna (jak Sokowirowka) — decyzja, kiedy jej uzyc,
// jest cala jej trescia. 20 s przerwy: raz na fale, nie na kazde zwarcie.
const SMROD_KLAWISZ = 'KeyG';
const SMROD_CD = 20, SMROD_CZAS = 3.0, SMROD_R = 7.5, SMROD_SILA = 9;
// AURA TEZ TRUJE (decyzja wlasciciela). Tik co 0.25 s przez 3 s = 12 tikow;
// 1.1 x dmgAll() na tik daje ~13 x dmgAll() na cala aure — mocno, ale to jedno
// uzycie na 20 s, a obszar 7.5 j. i tak zaraz sie oprozni od odpychania.
const SMROD_TIK = 0.25, SMROD_DMG = 1.1;
function odpalSmrod() {
  if (charKey !== 'garlicino') return;
  if (!G.running || G.paused || G.dying || P.smrodT > 0 || P.smrodCd > 0) return;
  P.smrodT = SMROD_CZAS; P.smrodCd = SMROD_CD;
  // animacja 'aura' z paczki PixelLaba (katalog 'ladowanie_smrodliwej_aury')
  if (LIB[CHARS[charKey].char] && LIB[CHARS[charKey].char].anims.aura) playerBB.play('aura', false);
  AUDIO.sfx('nova');
  P.smrodTik = 0;                                    // pierwszy tik obrazen od razu
  toastBuff(T('SMRODLIWA AURA — truje i odpycha!', 'STINK AURA — poisons and shoves!'), 'skarpeta');
  novaRing(P.pos.x, P.pos.z, SMROD_R);
  G.shake = Math.max(G.shake, 0.16);
}
function updateSmrodGracza(dt) {
  if (P.smrodCd > 0) P.smrodCd -= dt;
  if (P.smrodT <= 0) return;
  const bylo = P.smrodT;
  P.smrodT -= dt;
  P.smrodTik = (P.smrodTik || 0) - dt;
  const bije = P.smrodTik <= 0;
  if (bije) P.smrodTik = SMROD_TIK;
  const dmg = SMROD_DMG * dmgAll();
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.dying) continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d > SMROD_R) continue;
    if (bije && zadajDmg(e, dmg, { col: '#c9f07a', sc: 0.7, zr: 'smrod' }).dead) continue;   // petla od konca, wiec splice jest bezpieczny
    // im blizej gracza, tym mocniej wypycha — inaczej wrogowie tuz przy postaci
    // (czyli ci, o ktorych chodzi) ruszaliby sie najmniej
    const s = SMROD_SILA * dt * (1.15 - 0.5 * (d / SMROD_R));
    e.pos.x += dx / d * s; e.pos.z += dz / d * s;
    e.stun = Math.max(e.stun || 0, 0.12);          // krotkie ogluszenie = nie wracaja od razu
  }
  // pierscien co 1/3 s przez caly czas trwania (widac, ze aura DZIALA, nie tylko blysnela)
  if (Math.floor(bylo * 3) !== Math.floor(P.smrodT * 3)) novaRing(P.pos.x, P.pos.z, SMROD_R * 0.92);
  if (P.smrodT <= 0 && playerBB) playerBB.play('idle');
}

function updateTurrets(dt) {
  for (let i = G.turrets.length - 1; i >= 0; i--) {
    const t = G.turrets[i];
    t.t += dt;
    // drga jak pracująca sokowirówka; przechył doklejamy do obrotu billboardu
    billboardQuat(t.mesh.quaternion, Math.sin(t.t * 26) * 0.045);
    if (t.zycie - t.t < 3) t.mesh.visible = Math.sin(t.t * 16) > -0.45;   // miga przed końcem
    updatePasek(t);
    // WROGOWIE JĄ TŁUKĄ — to ona przejmuje na siebie hordę
    t.hitCd -= dt;
    if (t.hitCd <= 0) {
      for (const e of G.enemies) {
        if (e.dying || e.pos.distanceTo(t.pos) > 1.3) continue;
        t.hp -= obrazeniaWroga(e.T.dmg);
        t.hitCd = 0.35;
        okruchy(t.pos.x, t.pos.y + 0.9, t.pos.z, 0xd7dde6, 2);
        break;
      }
    }
    t.cd -= dt;
    if (t.cd <= 0) {
      let cel = null, najl = 13 * (rangeF() / 14);   // rangeF() jest ABSOLUTNY (14 * 1.2^lvl)
      for (const e of G.enemies) {
        if (e.dying) continue;
        const d = e.pos.distanceTo(t.pos);
        if (d < najl) { najl = d; cel = e; }
      }
      if (cel) {
        t.cd = SOKO_CD(t.lvl);
        // Pocisk wpada do TEJ SAMEJ tablicy co kule gracza (`G.shots`), więc
        // kolizje, przebicie i krytyki obsługuje jedna ścieżka — zero duplikatu.
        const dir = cel.pos.clone().sub(t.pos).setY(0).normalize();
        const mm = new THREE.Mesh(shotGeo, shotMat);
        mm.position.set(t.pos.x, t.pos.y + 0.7, t.pos.z);
        scene.add(mm);
        G.shots.push({ mesh: mm, dir, life: 1.1, pierce: 0, hit: new Set(),
                       y: t.pos.y + 0.7, dmg: SOKO_DMG(t.lvl), zr: 'sokowirowka' });
        AUDIO.sfx('strzal');
      }
    }
    if (t.t >= t.zycie || t.hp <= 0) {
      scene.remove(t.mesh); scene.remove(t.pasTlo); scene.remove(t.pasFill);
      t.pasFill.material.dispose();
      okruchy(t.pos.x, t.pos.y + 0.5, t.pos.z, 0xd7dde6, t.hp <= 0 ? 10 : 5);
      if (t.hp <= 0) { nova(t.pos.x, t.pos.z, 2.4, 2 * dmgAll(), 'sokowirowka'); AUDIO.sfx('wybuch'); }
      G.turrets.splice(i, 1);
    }
  }
}
// ============================== CZOSNEK NA GIĘTKIEJ LINCE ==============================
// Zamiast sztywnej orbity: linka z segmentów liczona VERLETEM, a czosnek jest masą
// na jej końcu. Dzięki temu przy zmianie kierunku zostaje z tyłu i dopiero go
// dogania, a uderzenie w wroga odpycha wroga I szarpie linką — widać opór.
// Sama linka też odpycha (delikatnie), więc horda ją wygina.
const LINKA_SEG = 5;                   // liczba segmentów linki
const LINKA_DL = 0.46;                 // długość jednego segmentu (zasięg ~2.1 j.)
const LINKA_TLUM = 0.90;               // tłumienie bezwładności
let linkaMat = null;
function linkaTexture() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = '#cfc08a'; g.fillRect(0, 0, 8, 8);
  g.fillStyle = '#a89566'; g.fillRect(0, 5, 8, 3);      // cień wzdłuż linki = wygląda na skręconą
  g.fillStyle = '#eadfb4'; g.fillRect(0, 0, 8, 2);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// segment linki to PŁASKI quad leżący w płaszczyźnie XZ — linka wisi na wysokości
// pasa, a kamera patrzy z góry, więc płaski pasek czyta się jak sznurek
const linkaGeo = new THREE.PlaneGeometry(1, 1);
linkaGeo.rotateX(-Math.PI / 2);
function nowyCzosnek(idx) {
  if (!linkaMat) linkaMat = new THREE.MeshBasicMaterial({ map: linkaTexture(), side: THREE.DoubleSide });
  const m = new THREE.Mesh(unitGeo, czosnekMat);
  m.scale.set(0.8 * czosnekAspect, 0.8, 1);
  scene.add(m);
  const pkt = [];
  for (let i = 0; i <= LINKA_SEG; i++) {
    const d = i * LINKA_DL;
    pkt.push({ x: P.pos.x + d, z: P.pos.z, px: P.pos.x + d, pz: P.pos.z });
  }
  const segi = [];
  for (let i = 0; i < LINKA_SEG; i++) {
    const s = new THREE.Mesh(linkaGeo, linkaMat);
    s.scale.set(0.09, 1, LINKA_DL);
    scene.add(s);
    segi.push(s);
  }
  return { mesh: m, pkt, segi, kat: idx * 2.1, opor: 0 };
}
function usunCzosnki() {
  for (const o of G.orbs) { scene.remove(o.mesh); if (o.segi) for (const s of o.segi) scene.remove(s); }
  G.orbs = [];
}
function updateCzosnki(dt, lvl) {
  const evo = P.evo.kosci;
  const omega = evo ? 4.6 : 2.7;                       // prędkość kątowa napędu
  // SOKOLI WZROK (+20% zasięgu broni) wydłuża CAŁĄ LINKĘ, nie tylko punkt
  // docelowy: gdyby rosnął sam cel, lina napięłaby się na swojej stałej długości
  // i zasięg by stanął. Segment liczymy więc z żądanego zasięgu.
  // UWAGA NA `rangeF()`: zwraca wartosc ABSOLUTNA (14 * 1.2^poziom), a nie mnoznik.
  // Pomnozenie 2.1 * rangeF() dalo linke na 29 jednostek — konca nie bylo widac.
  // Dzielimy przez baze 14, zeby wyszedl czysty mnoznik (1.0 bez pasywu).
  const zasieg = (evo ? 2.7 : 2.1) * (rangeF() / 14);
  const segDl = zasieg / LINKA_SEG * 1.04;             // ciut luzu, żeby linka mogła się wygiąć
  const rr = evo ? 1.5 : 1.0;                          // promień rażenia czosnku
  const oDmg = 2 * (evo ? 2 : 1) * dmgAll();
  const anchorY = P.y + 0.95;                          // linka wisi na wysokości pasa
  for (let k = 0; k < G.orbs.length; k++) {
    const o = G.orbs[k];
    // napęd: kąt rośnie, ale trafienie na moment go dławi (stąd czuć opór)
    o.opor = Math.max(0, o.opor - dt * 2.2);
    o.kat += omega * dt * (1 - 0.65 * Math.min(1, o.opor)) + (k === 0 ? 0 : 0);
    const rozstaw = k * (Math.PI * 2 / Math.max(1, G.orbs.length));
    const tx = P.pos.x + Math.cos(o.kat + rozstaw) * zasieg;
    const tz = P.pos.z + Math.sin(o.kat + rozstaw) * zasieg;
    const pkt = o.pkt;
    pkt[0].x = P.pos.x; pkt[0].z = P.pos.z;            // uchwyt trzyma gracz
    // VERLET: bezwładność + sprężyna ciągnąca czubek do punktu napędu
    for (let i = 1; i < pkt.length; i++) {
      const p = pkt[i];
      const vx = p.x - p.px, vz = p.z - p.pz;
      p.px = p.x; p.pz = p.z;
      p.x += vx * LINKA_TLUM; p.z += vz * LINKA_TLUM;
      if (i === pkt.length - 1) {                      // czubek = czosnek
        const s = Math.min(1, 9 * dt);
        p.x += (tx - p.x) * s; p.z += (tz - p.z) * s;
      }
    }
    // WIĘZY długości — 3 iteracje wystarczają, żeby linka nie gumowała
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < pkt.length - 1; i++) {
        const a = pkt[i], b = pkt[i + 1];
        let dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz) || 1e-6;
        const korekta = (d - segDl) / d;
        const w0 = i === 0 ? 0 : 0.5, w1 = i === 0 ? 1 : 0.5;   // punkt 0 przypięty
        a.x += dx * korekta * w0; a.z += dz * korekta * w0;
        b.x -= dx * korekta * w1; b.z -= dz * korekta * w1;
      }
    }
    // ---- KOLIZJE ----
    const czubek = pkt[pkt.length - 1];
    for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying) continue;
      const dx = czubek.x - e.pos.x, dz = czubek.z - e.pos.z;
      if (dx * dx + dz * dz < rr && e.orbCd <= 0) {
        e.orbCd = 0.5 / fireMul();       // czosnek tez slucha Tempa
        // noKill: zabójstwo robi linia niżej (po szarpnięciu linki), jak dotąd
        zadajDmg(e, oDmg, { col: '#eaffd0', sc: 0.9, kb: _kbV.copy(e.pos).sub(P.pos), kbSila: 2.6, noKill: true, zr: 'kosc' });
        spark(e.pos.x, e.ty + 1.0, e.pos.z);
        // SZARPNIĘCIE: czubek traci prędkość i napęd na moment staje
        const dl = Math.hypot(dx, dz) || 1e-6;
        czubek.px = czubek.x + (dx / dl) * 0.22;
        czubek.pz = czubek.z + (dz / dl) * 0.22;
        o.opor = 1;
        if (e.hp <= 0) killEnemy(e, j);
      }
    }
    // sama LINKA odpycha (bez obrażeń) i sama się przy tym wygina
    for (let i = 1; i < pkt.length - 1; i++) {
      const p = pkt[i];
      for (const e of G.enemies) {
        if (e.dying) continue;
        const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.42 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), pchniecie = (0.65 - d) / d;
        e.pos.x -= dx * pchniecie * 0.55; e.pos.z -= dz * pchniecie * 0.55;
        p.x += dx * pchniecie * 0.45; p.z += dz * pchniecie * 0.45;
      }
    }
    // ---- rysowanie ----
    o.mesh.position.set(czubek.x, anchorY + Math.sin(G.time * 5 + k) * 0.06, czubek.z);
    o.mesh.rotation.set(0, camYaw, -o.kat * 1.6);       // czosnek wiruje wokół własnej osi
    const skala = evo ? 1.2 : 0.8;
    if (Math.abs(o.mesh.scale.y - skala) > 0.01) o.mesh.scale.set(skala * czosnekAspect, skala, 1);
    for (let i = 0; i < o.segi.length; i++) {
      const a = pkt[i], b = pkt[i + 1], s = o.segi[i];
      const dx = b.x - a.x, dz = b.z - a.z;
      const dl = Math.hypot(dx, dz);
      s.position.set((a.x + b.x) / 2, anchorY - 0.04, (a.z + b.z) / 2);
      s.rotation.y = Math.atan2(dx, dz);
      s.scale.set(0.09, 1, Math.max(0.05, dl));
    }
  }
}

const stompLvl = () => { const w = hasWeapon('tupniecie'); return w ? w.lvl : 0; };
// E2 K1 (spec 08 §7.2): Tupnięcie do 5 poziomów — promień rośnie wolniej, moc szybciej, cooldown maleje z poziomem.
// E2 K9: promień z sufitem obszarówek (rangeObsz) i limitem 9 j.; nadmiar zasięgu Lornetki idzie w obrażenia
const stompRad = l => Math.min((3.2 + 0.4 * l + (P.evo.sejsm ? 2 : 0)) * rangeObsz().m, CFG_DECYZJE.tupRMax);
const stompDmg = l => (0.6 + 0.9 * l) * (P.evo.sejsm ? 2 : 1) * rangeObsz().dmg * dmgAll();
const stompCd = l => (P.evo.sejsm ? 2.0 : 3.3 - 0.1 * l);

// ============================== E2 „DECYZJE": WSZYSTKIE LICZBY (spec 08 §0.1) ==============================
// Mutowalny obiekt — w DEV jako HORDA.cfgD (strojenie bez przeładowania). Decyzje właściciela 23.09 (nagłówek spec):
// jackpot BEZ monet, wymiennik jako mały przycisk, Dokładka tak, Granny dodatkowy wybór po kapralu.
const CFG_DECYZJE = {
  // §1 złota skrzynia: szanse 1 / 3 / 5 przedmiotów; pierwsze jackpoty w historii zapisu na sztywno (VS 1-1-3-1-5)
  jackpot: { mapa: [0.80, 0.17, 0.03], kapral: [0.50, 0.40, 0.10], don: [0, 0, 1], scenariusz: [1, 1, 3, 1, 5] },
  wchestWolne: [25, 45], wchestPelne: [50, 70],                // s do następnej złotej skrzyni (wolny slot / pełne)
  // §2 składniki. Rosół w CAŁYCH SERCACH (zasada „1 cios = 1 serce", 25.09): spec 0,6 HP/s na jednostkę przy dawnym
  // sercu = 100 HP, czyli 0,006 serca/s — Rosół 5 (5 j.) = 1 serce co ~33 s, dodawane w całości
  slotySkl: 3, roslRegen: 0.006,
  // §5 karty: rzadkość [start, +na minutę, sufit]; premia w jackpocie kaprala; mnożniki efektu
  rz: { nieb: [0.18, 0.010, 0.28], fiol: [0.03, 0.005, 0.08],
        kapral: { nieb: 0.08, fiol: 0.04 },
        mnoz: { zw: 1, nieb: 1.5, fiol: 2 },                   // składniki (jednostki)
        przyp: { zw: 1, nieb: 2, fiol: 3 },                    // Przyprawy Nonny (P.repeat += …)
        doklMnoz: { zw: 1, nieb: 1.5, fiol: 2.5 } },           // Dokładki
  dokl: { proc: 0.08, pelnych: 5, potem: 0.04, zBroniNieb: 0.08, zBroniFiol: 0.20 },
  wagi: { bron: 1.4, sklPoz: 1.0, sklNowy: 1.0, podsun: 3, dokl: 0.8, przyprawa: 0.6 },
  wybory: { przelos: 1, pomin: 1, wyklucz: 1, pominXp: 0.20 },
  // §7 zasięg obszarówek „wokół gracza": sufit mnożnika, nadmiar → obrażenia; twarde sufity promieni
  obsz: { sufit: 1.4, nadmiarNaDmg: 0.5 }, skarpetaRMax: 8.5, tupRMax: 9.0,
  przepisyZeSkrzyni: true,                                     // K5: danie tylko ze Skrzyni Kaprala/Dona (złota karta ewolucji znika)
};

// ============================== SKŁADNIKI (dawne pasywy; spec 08 §2) ==============================
// Klucze w kodzie i META zostają (moc, tempo, …) — zmieniła się nazwa, którą widzi gracz (wariant A właściciela).
// POZIOM (`P.passives[k]`) = ile razy wzięto; SIŁA liczy się z JEDNOSTEK `P.sklU[k]` (zwykła karta 1, niebieska 1,5,
// fioletowa 2). Sloty: `P.skl` (kolejność zdobycia), najwyżej `P.slotySkl`. Pokrywka (tarcza) liczy poziom, nie jednostki.
const U = k => (P.sklU && P.sklU[k]) || 0;
const proc = x => Math.round((x - 1) * 100);
const przec = x => String(+x.toFixed(2)).replace('.', JEZYK.cur === 'en' ? '.' : ',');
const PASSIVES = {
  moc:    { ico: 'ser', nm: T('Parmezan', 'Parmesan'), max: 5,
            ef: m => T(`+${proc(1.15 ** m)}% obrażeń wszystkiego`, `+${proc(1.15 ** m)}% damage on everything`),
            suma: u => T(`obrażenia ×${przec(1.15 ** u)}`, `damage ×${przec(1.15 ** u)}`) },
  tempo:  { ico: 'filizanka', nm: T('Espresso', 'Espresso'), max: 5,
            ef: m => T(`+${proc(1.12 ** m)}% szybkości ataków`, `+${proc(1.12 ** m)}% attack speed`),
            suma: u => T(`tempo ×${przec(1.12 ** u)}`, `attack speed ×${przec(1.12 ** u)}`) },
  buty:   { ico: 'but', nm: T('Klapki Carrotella', "Carrotello's Flip-Flops"), max: 5,
            ef: m => T(`+${proc(1.10 ** m)}% szybkości ruchu`, `+${proc(1.10 ** m)}% move speed`),
            suma: u => T(`ruch ×${przec(1.10 ** u)}`, `move speed ×${przec(1.10 ** u)}`) },
  magnes: { ico: 'magnes', nm: T('Magnes z lodówki', 'Fridge Magnet'), max: 5,
            ef: m => T(`+${proc(1.35 ** m)}% zasięgu zbierania`, `+${proc(1.35 ** m)}% pickup range`),
            suma: u => T(`zbieranie ×${przec(1.35 ** u)}`, `pickup ×${przec(1.35 ** u)}`) },
  krytyk: { ico: 'papryczka', nm: T('Papryczka Diavolo', 'Diavolo Chili'), max: 5,
            ef: m => T(`+${Math.round(10 * m)}% szansy na cios ×3`, `+${Math.round(10 * m)}% chance of a ×3 hit`),
            suma: u => T(`krytyk ${Math.round(10 * u)}%`, `crit ${Math.round(10 * u)}%`) },
  // Rosół: +1 serce na POZIOM (rzadkość nie mnoży serc) + leczenie (v1 do pełna, v2 połowa braków); regeneracja z JEDNOSTEK, w całych sercach
  serce:  { ico: 'rosol', nm: T('Rosół', 'Chicken Broth'), max: 5,
            ef: (m, u) => (roslLecz() < 1 ? T('+1 serce i leczy połowę braków', '+1 heart, heals half the missing') : T('+1 serce i leczenie', '+1 heart and a heal'))
                          + T(`; regeneracja: 1 serce co ${Math.round(1 / ((u + m) * roslRegen()))} s`, `; regen: 1 heart every ${Math.round(1 / ((u + m) * roslRegen()))} s`),
            suma: u => T(`1 serce co ${Math.round(1 / (u * roslRegen()))} s`, `1 heart every ${Math.round(1 / (u * roslRegen()))} s`) },
  zasieg: { ico: 'lornetka', nm: T('Lornetka', 'Binoculars'), max: 5,
            ef: m => T(`+${proc(1.15 ** m)}% zasięgu broni`, `+${proc(1.15 ** m)}% weapon range`),
            suma: u => T(`zasięg ×${przec(1.15 ** u)}`, `range ×${przec(1.15 ** u)}`) },
  tarcza: { ico: 'pokrywka', nm: T('Pokrywka od garnka', 'Pot Lid'), max: 3, locked: true, bezRz: true,
            ef: () => T('Blokuje 1 trafienie (ładuje się z czasem)', 'Blocks 1 hit (recharges over time)'),
            suma: (u, l) => T(`blok co ${[30, 24, 18][l - 1]} s`, `block every ${[30, 24, 18][l - 1]} s`) },
};
// dodaj składnik (poziom +1, jednostki +m) — jedyne miejsce zmiany P.skl/P.sklU/P.passives z kart i jackpotu
function dodajSkladnik(key, m = 1) {
  const S = PASSIVES[key];
  if (!P.skl.includes(key)) P.skl.push(key);
  P.passives[key] = (P.passives[key] || 0) + 1;
  P.sklU[key] = (P.sklU[key] || 0) + (S.bezRz ? 1 : m);
  // Rosół: +1 serce i leczenie — EKONOMIA v2: połowa brakujących (w górę; nowe serce przy pełnym zdrowiu zawsze pełne), v1 do pełna
  if (key === 'serce') { P.maxHp += HP_SERCA; P.hp = Math.min(P.maxHp, P.hp + Math.ceil((P.maxHp - P.hp) * roslLecz() - 1e-9)); drawHearts(); }
  renderWpns();
}
// DEV/presety: ustaw poziom (i jednostki) wprost
function ustawSkladnik(key, lvl, u = lvl) {
  const byl = P.passives[key] || 0;
  if (lvl > 0 && !P.skl.includes(key)) P.skl.push(key);
  if (lvl <= 0) { P.skl = P.skl.filter(k => k !== key); delete P.passives[key]; delete P.sklU[key]; }
  else { P.passives[key] = lvl; P.sklU[key] = u; }
  if (key === 'serce') { P.maxHp += (Math.max(0, lvl) - byl) * HP_SERCA; P.hp = P.maxHp; drawHearts(); }
  renderWpns();
}
// wolny slot na NOWY składnik?
const wolnySlotSkl = () => P.skl.length < P.slotySkl;
// EKONOMIA (29.09): Rosół w normalnym biegu × trudn().ekon (v2: regeneracja 0,006 → 0,003 serca/s na jednostkę, leczenie
// przy wzięciu = połowa braków). W menu (Spiżarnia, Książka) tekst pokazuje wartość normalnego biegu, nie łagodnego.
const _ekonRosol = k => (G.running && G.lagodny) ? 1 : ekon(k);
const roslRegen = () => CFG_DECYZJE.roslRegen * _ekonRosol('rosolRegen');
const roslLecz = () => _ekonRosol('rosolLecz');
// Rosół: regeneracja w CAŁYCH sercach (akumulator nie odkłada się przy pełnym zdrowiu)
function regenRosolu(dt) {
  const u = U('serce');
  if (!u) return;
  if (P.hp >= P.maxHp) { P.regenAkum = 0; return; }
  P.regenAkum = (P.regenAkum || 0) + u * roslRegen() * dt;
  if (P.regenAkum >= 1) {
    P.regenAkum -= 1;
    P.hp = Math.min(P.maxHp, P.hp + HP_SERCA); drawHearts();
    dmgPop(P.pos.x, P.y + 0.7, P.pos.z, T('+SERCE', '+HEART'), '#ff6fa5', 1.1, 'wazny');
    AUDIO.sfx('serce');
  }
}

// ============================== PRZYPRAWY NONNY (karty POWTARZALNE) ==============================
// Pasywy mają `max`, bronie mają `max` + ewolucję — więc pula normalnych kart
// KIEDYŚ wysycha i awans przestaje być decyzją. Te cztery karty nie mają limitu
// i dopełniają slotów dopiero wtedy, gdy zabraknie normalnych (patrz `showCards`),
// więc wczesna gra wygląda dokładnie jak wcześniej. Bonusy są małe świadomie:
// mają nagradzać długi bieg, nie zastępować broni.
const REPEAT = {
  sol:     { ico: 'plomien',  nm: T('Sól Nonny', "Nonna's Salt"),   ds: T('+3% obrażeń (bez limitu)', '+3% damage (no cap)') },
  oliwa:   { ico: 'zegar',    nm: T('Oliwa Nonny', "Nonna's Oil"),  ds: T('+3% szybkości ataków (bez limitu)', '+3% attack speed (no cap)') },
  pieprz:  { ico: 'gwiazda',  nm: T('Pieprz Nonny', "Nonna's Pepper"), ds: T('+2% szansy na cios ×3 (bez limitu)', '+2% chance of a ×3 hit (no cap)') },
  bazylia: { ico: 'celownik', nm: T('Bazylia Nonny', "Nonna's Basil"), ds: T('+4% zasięgu broni (bez limitu)', '+4% weapon range (no cap)') },
};
// E2 K2: Przyprawy też losują rzadkość (zwykła ×1, niebieska ×2, fioletowa ×3) — `do(rz)` dodaje tyle naraz
function repeatPool() {
  return Object.keys(REPEAT).map(key => {
    const R = REPEAT[key];
    return {
      id: 'rep:' + key, klucz: 'rep:' + key, typ: 'przyp', ico: R.ico, waga: CFG_DECYZJE.wagi.przyprawa,
      // licznik czytamy na nowo w chwili kliknięcia (kafelek może przeleżeć w kolejce overlayów)
      nm: () => R.nm + ((P.repeat[key] || 0) ? ` ×${(P.repeat[key] || 0) + 1}` : ''),
      ds: rz => { const m = CFG_DECYZJE.rz.przyp[rz]; return m > 1 ? R.ds.replace(/\d+%/, x => (parseInt(x) * m) + '%') : R.ds; },
      do: rz => { P.repeat[key] = (P.repeat[key] || 0) + CFG_DECYZJE.rz.przyp[rz]; },
    };
  });
}

// ============================== PRZEPISY (dane; spec 08 §3.2) ==============================
// evoKey → broń + składnik + zagadka Nonny (nazwy/opisy dań zostają w WEAPONS[k].evoNm/evoDs).
// `aktywny: false` = danie jeszcze nie ma kodu (nie podsuwamy składnika, nie liczy się w Książce).
const PRZEPISY = {
  meteor:   { bron: 'kule',      skl: 'moc',    podp: T('Kule są za grzeczne. Zetrzyj na nie coś starego i twardego.',
                                                        'The orbs are too polite. Grate something old and hard on them.') },
  kosci:    { bron: 'kosc',      skl: 'tempo',  podp: T('Czosnek kręci się jak w niedzielę rano. Obudź go czymś z ekspresu.',
                                                        'The garlic spins like a Sunday morning. Wake it up with something from the machine.') },
  sejsm:    { bron: 'tupniecie', skl: 'serce',  podp: T('Kto tak tupie o pustym brzuchu? Najpierw zupa, potem trzęsienie.',
                                                        'Who stomps on an empty stomach? Soup first, then the quake.') },
  kaseta:   { bron: 'kura',      skl: 'krytyk', podp: T('Kukurydza nie strzeli bez ognia. Coś ostrego, skarbie.',
                                                        "Corn won't pop without heat. Something spicy, darling.") },
  wachlarz: { bron: 'scyzoryk',  skl: 'krytyk', podp: T('Jeden nóż to hobby. Trzy to temperament. Dodaj pikanterii.',
                                                        'One knife is a hobby. Three is a temper. Add some spice.') },
  doppia:   { bron: 'ciabatta',  skl: 'buty',   podp: T('Kapeć bez pary to pół kapcia.',
                                                        'A slipper without its pair is half a slipper.') },
  selekcja: { bron: 'wypad',     skl: 'serce',  podp: T('Głodny bramkarz nikogo nie wyprosi.',
                                                        "A hungry bouncer can't throw anyone out.") },
  jablon:   { bron: 'pipsini',   skl: 'magnes', podp: T('Przepis na szarlotkę wisi na lodówce. Czym jest przypięty?',
                                                        "The apple pie recipe hangs on the fridge. What's holding it up?") },
  burza:    { bron: 'piorun',    skl: 'tempo',  podp: T('Burza w filiżance? Najpierw trzeba mieć filiżankę.',
                                                        'A storm in a cup? First you need the cup.') },
  smrodpok: { bron: 'skarpeta',  skl: 'moc',    podp: T('Skarpeta śmierdzi od tygodnia. Stary ser — od pokoleń.',
                                                        'A sock stinks for a week. Old cheese stinks for generations.') },
  calamita: { bron: 'bumerang',  skl: 'magnes', podp: T('Pizza lata, gdzie chce. Przypnij ją czymś z lodówki.',
                                                        'The pizza flies wherever it likes. Pin it with something from the fridge.') },
  kaluza:   { bron: 'butelka',   skl: 'zasieg', podp: T('Żul rzuca na oślep. Z balkonu widać, gdzie najwięcej łobuzów.',
                                                        'The hobo throws blind. From the balcony you can see where the troublemakers crowd.') },
};
// broń → evoKey (tylko dania, które mają kod: WEAPONS[k].evoKey)
const PRZEPIS_BRONI = {};
const przeliczPrzepisy = () => { for (const [ek, R] of Object.entries(PRZEPISY)) { R.aktywny = WEAPONS[R.bron].evoKey === ek; if (R.aktywny) PRZEPIS_BRONI[R.bron] = ek; else delete PRZEPIS_BRONI[R.bron]; } };
przeliczPrzepisy();
// „podsunięty" składnik = składnik przepisu posiadanej broni, której dania jeszcze nie ma (spec §5.4)
function podsuwaDla(key) {
  for (const w of P.weapons) { const ek = PRZEPIS_BRONI[w.key]; if (ek && !P.evo[ek] && PRZEPISY[ek].skl === key) return w.key; }
  return null;
}

// E2 K5: przepis gotowy = broń na max + posiadany składnik przepisu (dowolny poziom) + danie jeszcze nieugotowane
const przepisGotowy = w => { const ek = PRZEPIS_BRONI[w.key];
  return !!ek && !P.evo[ek] && w.lvl >= WEAPONS[w.key].max && P.skl.includes(PRZEPISY[ek].skl); };
function ugotuj(ek, w) {
  P.evo[ek] = true;
  if (w) w.gotowyOd = null;
  renderWpns();
  G.hitstop = Math.max(G.hitstop, 0.12); G.shake = Math.max(G.shake, 0.3);
  okruchy(P.pos.x, P.y + 1.2, P.pos.z, 0xffd75e, 24);
  dmgPop(P.pos.x, P.y + 2.2, P.pos.z, WEAPONS[PRZEPISY[ek].bron].evoNm, '#ffd75e', 2.0, 'wazny');
  (G.przepisyBiegu = G.przepisyBiegu || []).push(ek);
  (G.przepisyT = G.przepisyT || []).push(+G.time.toFixed(1));
  META.st.przepisy = (META.st.przepisy || 0) + 1;
  const K = META.ksiazka[ek] = Object.assign({ odk: 0, prawie: 0, ile: 0 }, META.ksiazka[ek]);
  K.ile++;
  if (!K.odk) {                                      // pierwsze odkrycie w historii zapisu → pieczątka, kropka w pauzie
    K.odk = 1; META.ui.ksiazkaNowe = true;
    (SKR.odkryte = SKR.odkryte || new Set()).add(ek);
    STATY.zdarzenie('przepis-nowy/' + ek, 'Nowy przepis: ' + ek);
  }
  STATY.zdarzenie('przepis/' + ek, 'Przepis: ' + ek);
  saveMetaSoon();
}
// HUD „przepis gotowy": w.gotowyOd = G.time, gdy przepisGotowy(w) zmienia się z false na true (sprawdzane w renderWpns)
function sprawdzGotowe() {
  if (!P.weapons || !G.running) return;
  for (const w of P.weapons) {
    if (w.lvl >= WEAPONS[w.key].max) (G.maxBroni = G.maxBroni || new Set()).add(w.key);   // K7: Książka + narastająca podpowiedź
    const g = przepisGotowy(w);
    if (g && w.gotowyOd == null) {
      w.gotowyOd = G.time;
      if (!G.gotowyToast && (G.skrzynieKap.length || kapralZywy() || doKaprala() != null)) {   // pierwszy gotowy przepis w biegu
        G.gotowyToast = true;
        toastBuff(T('PRZEPIS GOTOWY: rozbij kaprala!', 'RECIPE READY: smash a corporal!'), WEAPONS[w.key].evoIco);
        setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 3000);
        AUDIO.sfx('awans');
        if (!META.ui.ksiazkaPodp) {                  // raz w historii zapisu: gdzie szukać Książki
          META.ui.ksiazkaPodp = true; saveMetaSoon();
          setTimeout(() => { if (G.running && !G.buff.key) { toastBuff(T('Zajrzyj do pauzy: Książka Nonny', "Check the pause menu: Nonna's Cookbook"), 'ksiazka');
            setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 3000); } }, 3200);
        }
      }
    } else if (!g) w.gotowyOd = null;
  }
}

// ============================== KARTY AWANSU (E2 K2: rzadkość, Dokładki, jawne ważenie; spec 08 §5) ==============================
const RZ_NM = { nieb: T('NIEBIESKA', 'RARE'), fiol: T('FIOLETOWA', 'EPIC') };
// rzadkość jednej karty: fioletowa min(8%, 3% + 0,5%/min), niebieska min(28%, 18% + 1%/min); kapral +4/+8 pp
function losujRz(o = {}) {
  const R = CFG_DECYZJE.rz, m = G.time / 60;
  let pf = Math.min(R.fiol[2], R.fiol[0] + R.fiol[1] * m), pn = Math.min(R.nieb[2], R.nieb[0] + R.nieb[1] * m);
  if (o.kapral) { pf += R.kapral.fiol; pn += R.kapral.nieb; }
  if (o.skl) { const m = trudn().karty.sklRz; pf *= m; pn *= m; }   // Spiżarnia (29.09): rzadsze niebieskie/fioletowe składniki
  const x = Math.random();
  return x < pf ? 'fiol' : x < pf + pn ? 'nieb' : 'zw';
}
// Dokładka: +8% obrażeń TEJ broni (po 5 kartach +4%), × rzadkość (1 / 1,5 / 2,5)
const doklProc = (w, rz = 'zw') => (((w.dokl || 0) < CFG_DECYZJE.dokl.pelnych) ? CFG_DECYZJE.dokl.proc : CFG_DECYZJE.dokl.potem) * CFG_DECYZJE.rz.doklMnoz[rz];
// mnożnik obrażeń broni z Dokładek (jeden punkt dla wszystkich broni — `zadajDmg` z `o.zr`)
const mnozBroni = k => { const w = hasWeapon(k); return w && w.bonus ? 1 + w.bonus : 1; };
const wykluczone = id => P.wyklucz && P.wyklucz.has(id);
// KANDYDACI: { id, typ, klucz, waga, podsun, ico, nm(rz), ds(rz), do(rz) }. `id` = klucz wykluczania
// (broń i jej Dokładka mają wspólny 'bron:k'), `klucz` = co dokładnie (bot, testy, data-klucz).
function cardPool() {
  const pool = [], W8 = CFG_DECYZJE.wagi, D = CFG_DECYZJE.dokl;
  for (const w of P.weapons) {
    const W = WEAPONS[w.key];
    if (wykluczone('bron:' + w.key)) continue;
    if (w.lvl < W.max) pool.push({
      id: 'bron:' + w.key, klucz: 'bron:' + w.key, typ: 'bron', waga: W8.bron, ico: W.ico,
      nm: () => W.nm + T(' → poz. ', ' → lv. ') + (w.lvl + 1),
      ds: rz => W.lvlDs(w.lvl + 1) + (rz === 'nieb' ? T(` + Dokładka +${Math.round(D.zBroniNieb * 100)}%`, ` + second helping +${Math.round(D.zBroniNieb * 100)}%`)
                                   : rz === 'fiol' ? T(` + Dokładka +${Math.round(D.zBroniFiol * 100)}%`, ` + second helping +${Math.round(D.zBroniFiol * 100)}%`) : ''),
      do: rz => { w.lvl++; if (rz === 'nieb') w.bonus = (w.bonus || 0) + D.zBroniNieb; if (rz === 'fiol') w.bonus = (w.bonus || 0) + D.zBroniFiol; renderWpns(); },
    });
    else {
      // K2–K4: dawna złota karta ewolucji zostaje do K5 (wtedy gotuje tylko Skrzynia Kaprala)
      if (W.evoKey && !P.evo[W.evoKey] && !CFG_DECYZJE.przepisyZeSkrzyni) pool.push({
        id: 'evo:' + W.evoKey, klucz: 'evo:' + W.evoKey, typ: 'evo', waga: 99, ico: W.evoIco, gold: true,
        nm: () => W.evoNm, ds: () => W.evoDs,
        do: () => { P.evo[W.evoKey] = true; renderWpns(); blysk('#ffd75e', 0.55); },
      });
      pool.push({
        id: 'bron:' + w.key, klucz: 'dokl:' + w.key, typ: 'dokl', waga: W8.dokl, ico: W.ico,
        nm: () => T('Dokładka: ', 'Second helping: ') + W.nm,
        ds: rz => T(`+${Math.round(doklProc(w, rz) * 100)}% obrażeń tej broni (razem +${Math.round(((w.bonus || 0) + doklProc(w, rz)) * 100)}%)`,
                    `+${Math.round(doklProc(w, rz) * 100)}% damage for this weapon (total +${Math.round(((w.bonus || 0) + doklProc(w, rz)) * 100)}%)`),
        do: rz => { w.bonus = (w.bonus || 0) + doklProc(w, rz); w.dokl = (w.dokl || 0) + 1; renderWpns(); },
      });
    }
  }
  // NOWYCH BRONI NIE MA W KARTACH — znajduje się je w złotych skrzyniach
  const KK = trudn().karty;                         // Spiżarnia (29.09): blokady, waga ×0,5, sufit poziomu
  for (const key of Object.keys(PASSIVES)) {
    const S = PASSIVES[key];
    if (!sklOdbl(key)) continue;                    // niekupiony w Spiżarni Nonny = nie istnieje w biegu (karty i jackpot)
    if (wykluczone('skl:' + key)) continue;
    const lvl = P.passives[key] || 0;
    if (lvl >= sklMaxBiegu(key)) continue;
    if (!lvl && !wolnySlotSkl()) continue;          // nowy składnik tylko przy wolnym slocie (K1)
    const podsun = !lvl ? podsuwaDla(key) : null;
    pool.push({
      id: 'skl:' + key, klucz: 'skl:' + key, typ: lvl ? 'skl' : 'skl-nowy', ico: S.ico, podsun, bezRz: !!S.bezRz,
      waga: (lvl ? W8.sklPoz : W8.sklNowy * (podsun ? W8.podsun : 1)) * KK.sklWaga,
      nm: () => S.nm + (lvl ? ` (${lvl}→${lvl + 1})` : ''),
      ds: rz => S.ef(S.bezRz ? 1 : CFG_DECYZJE.rz.mnoz[rz], U(key)),
      do: rz => dodajSkladnik(key, CFG_DECYZJE.rz.mnoz[rz]),
    });
  }
  // Przyprawy tylko, gdy kandydatów bez Dokładek < 3 (wczesna gra wygląda jak dawniej)
  if (pool.filter(k => k.typ !== 'dokl' && k.typ !== 'evo').length < 3) pool.push(...repeatPool());
  return pool;
}
// „poziomy" w puli (broń + składnik) — kryterium §9.3 p. 4 (pełny build = < 3)
const pulaPoziomow = () => cardPool().filter(k => k.typ === 'bron' || k.typ === 'skl' || k.typ === 'skl-nowy').length;
// LOSOWANIE n kart: ważone bez powtórzeń (po `id`), każda karta z własną rzadkością; brak → Przyprawy.
//   o.kapral — premia rzadkości; o.minRz: 'nieb' — co najmniej jedna niebieska (Granny); o.pula — gotowa pula (przelosuj)
function losujKarty(n = 3, o = {}) {
  const pula = (o.pula || cardPool()).slice(), picks = [];
  const evo = pula.findIndex(k => k.typ === 'evo');           // K2–K4: ewolucja pierwsza (max 1), jak dawniej
  if (evo >= 0) picks.push(pula.splice(evo, 1)[0]);
  for (let i = pula.length - 1; i >= 0; i--) if (pula[i].typ === 'evo') pula.splice(i, 1);
  while (picks.length < n && pula.length) {
    let suma = 0; for (const k of pula) suma += k.waga;
    let x = Math.random() * suma, i = 0;
    for (; i < pula.length - 1; i++) { x -= pula[i].waga; if (x <= 0) break; }
    const k = pula.splice(i, 1)[0];
    picks.push(k);
    for (let j = pula.length - 1; j >= 0; j--) if (pula[j].id === k.id) pula.splice(j, 1);   // broń i jej Dokładka = jedno id
  }
  // Nie ma awansu z samymi Przyprawami, dopóki w puli jest coś innego (Dokładka broni niewykluczonej) — spec §5.6
  if (picks.length && picks.every(k => k.typ === 'przyp')) {
    const inne = (o.pula || cardPool()).filter(k => k.typ !== 'przyp' && k.typ !== 'evo' && !picks.some(p => p.id === k.id));
    if (inne.length) picks[picks.length - 1] = inne[Math.floor(Math.random() * inne.length)];
  }
  if (picks.length < n) {                                      // dopełnij Przyprawami (zawsze dostępne)
    const rep = repeatPool().filter(r => !picks.some(p => p.id === r.id));
    while (picks.length < n && rep.length) picks.push(rep.splice(Math.floor(Math.random() * rep.length), 1)[0]);
  }
  // rzadkość: pierwszy bieg w historii zapisu — awanse 1–3 zwykłe, w 4. jedna niebieska (nauka koloru)
  const nauka = G.pierwszyBieg && !o.kapral && !o.minRz ? (P.awanse || 0) : -1;
  // (P.awanse jest już podbite dla bieżącego awansu: 1, 2, 3 = zwykłe; 4 = jedna niebieska, reszta losowo)
  const karty = picks.map(k => ({ k, rz: k.typ === 'evo' || k.bezRz || (nauka >= 1 && nauka <= 3) ? 'zw'
    : losujRz(k.typ === 'skl' || k.typ === 'skl-nowy' ? { ...o, skl: true } : o) }));
  const zRz = karty.filter(c => c.k.typ !== 'evo' && !c.k.bezRz);
  if (nauka === 4 && zRz.length && !zRz.some(c => c.rz === 'nieb')) zRz[0].rz = 'nieb';
  if (o.minRz === 'nieb' && zRz.length && !zRz.some(c => c.rz !== 'zw')) zRz[Math.floor(Math.random() * zRz.length)].rz = 'nieb';
  return karty;
}
// ============================== KOLEJKA OVERLAYÓW ==============================
// Skrzynia i awans mogą wypaść W TEJ SAMEJ KLATCE. Wcześniej oba overlaye stawały się
// widoczne naraz, a zamknięcie jednego zdejmowało pauzę: świat się symulował, wrogowie
// bili, a gracz nie mógł się ruszyć, bo drugi overlay łykał wejście (`pointerdown`
// odrzuca zdarzenia z `.ov`). Drugi objaw tego samego: dwa awansy w jednej klatce
// i `showCards()` robiło `innerHTML=''`, KASUJĄC poprzednie trzy karty.
// Teraz overlaye stoją w kolejce i pauza schodzi dopiero, gdy kolejka jest pusta.
const OV_Q = [];
const ovWidoczny = () =>
  document.getElementById('cardsOv').style.display === 'flex' ||
  document.getElementById('swapOv').style.display === 'flex' ||
  document.getElementById('skrzyniaOv').style.display === 'flex';   // E2 K4: jackpot złotej skrzyni
function pchnijOverlay(fn) {
  if (myszLock) myszWrac = true;                   // po zamknięciu wszystkich overlayów wrócimy do przechwyconej myszy
  puscMysz();                                      // karty klika sie kursorem
  // TRUP NIE AWANSUJE: obrazenia od spadajacego regalu i od Sodina wolaja `startDeath()`
  // BEZ `return`, wiec ta sama klatka leciala dalej do petli pigulek i mogla otworzyc
  // karty POD ekranem smierci (dwa `.ov` naraz = prawie czarny ekran).
  if (G.dying || G.over || !G.running) return;
  // E1-bieg K8: po śmierci Dona (3 s do ekranu końca) żadnych kart — Skrzynia Kaprala albo awans z fontanny
  // otwierały karty, a potem na nie wchodził ekran WYGRANEJ (dwa `.ov` naraz)
  if (G.wygrana) return;
  if (ovWidoczny()) { OV_Q.push(fn); return; }
  G.paused = true;
  odswiezStawBtn(); odswiezSmrodBtn();             // karty: przyciski akcji nie wiszą nad overlayem
  fn();
}
function zamknijOverlay(id) {
  document.getElementById(id).style.display = 'none';
  // WYCZYŚĆ KAFELKI: samo `display:none` zostawiało je w drzewie z żywym `onclick`,
  // więc zamknięty overlay dawał się jeszcze „kliknąć" z kodu i ponownie nadawał
  // ulepszenie. Gracz by tego nie tknął, ale to mina dla każdego przyszłego testu.
  const wrap = document.getElementById(id === 'cardsOv' ? 'cards' : id === 'skrzyniaOv' ? 'skrzBebny' : 'swapList');
  if (wrap) wrap.innerHTML = '';
  const nast = OV_Q.shift();
  if (nast) { G.paused = true; nast(); return; }   // pauza trwa dalej dla następnego
  G.paused = false;
  if (myszWrac) { myszWrac = false; setTimeout(chwycMysz, 0); }   // wciąż w geście gracza (aktywacja trwa kilka s)
}
function showCards(o = {}) {
  if (!o.zrodlo) G.oknoAwansu = false;              // AWANS CO 3: okno awansu z kolejki właśnie się otwiera
  const wrap = document.getElementById('cards'); wrap.innerHTML = '';
  const h2 = document.querySelector('#cardsOv h2');
  if (h2) h2.textContent = o.zrodlo === 'kapral' ? T('SKRZYNIA KAPRALA! Wybierz ulepszenie', "CORPORAL'S CRATE! Pick an upgrade")
                         : o.zrodlo === 'babcia' ? T('BABCIA WIE LEPIEJ: jeszcze jedna karta!', 'NONNA KNOWS BEST: one more card!')
                         : T('AWANS! Wybierz ulepszenie', 'LEVEL UP! Pick an upgrade');
  if (o.zrodlo !== 'babcia' && o.zrodlo !== 'kapral') P.awanse = (P.awanse || 0) + 1;   // nauka rzadkości w 1. biegu
  const opcje = { kapral: o.zrodlo === 'kapral', minRz: o.minRz };
  const karty = losujKarty(3, opcje);
  G.karty = { karty, opcje, wyklucz: false };        // E2 K3: stan overlayu dla przelosuj / wyklucz
  // ZERO KART = ZERO OVERLAYA (siatka bezpieczeństwa — Przyprawy są bez limitu, więc nieosiągalne)
  if (!karty.length) {
    G.runCoins += 20; drawCoins();
    toastBuff(T('AWANS — nic już do ulepszenia: +20 monet', 'LEVEL UP — nothing left to upgrade: +20 coins'), 'moneta');
    return zamknijOverlay('cardsOv');
  }
  if (karty.every(c => c.k.typ === 'przyp')) G.samePrzyprawy = (G.samePrzyprawy || 0) + 1;   // kryterium §9.3 p. 3 (DEV/bot)
  rysujKarty(karty);
  odswiezPrzyciskiKart();
  document.getElementById('cardsOv').style.display = 'flex';
  G.ovOd = performance.now();
  if (karty.some(c => c.rz === 'fiol')) AUDIO.sfx('zlota');
}
// ---- E2 K3: PRZELOSUJ / POMIŃ / WYKLUCZ (po 1 na bieg; Carrotello 2 przelosowania; spec §5.5) ----
// Rząd trzech `.btn2` pod kartami (pad: nawigacja + X/Y/LB, klawiatura R/P/X, 1–3 = karta). Licznik 0 = szary, ale widoczny.
const GLIF_KART = { przelos: ['R', 2], pomin: ['P', 4], wyklucz: ['X', 3] };
const glifKart = a => WEJ.tryb === 'klaw' ? glKl(GLIF_KART[a][0]) : WEJ.tryb === 'pad' ? padKapsel(GLIF_KART[a][1]) : '';
function odswiezPrzyciskiKart() {
  const box = document.getElementById('cardsBtns');
  if (!box || !G.karty) return;
  const Wb = P.wybory || { przelos: 0, pomin: 0, wyklucz: 0 };
  const b = (a, txt) => `<button class="btn2${Wb[a] > 0 ? '' : ' szary'}${a === 'wyklucz' && G.karty.wyklucz ? ' sel' : ''}" data-wybor="${a}">${glifKart(a)} ${txt} (${Wb[a]})</button>`;
  box.innerHTML = b('przelos', T('PRZELOSUJ', 'REROLL'))
    + b('pomin', T(`POMIŃ +${Math.round(CFG_DECYZJE.wybory.pominXp * 100)}% XP`, `SKIP +${Math.round(CFG_DECYZJE.wybory.pominXp * 100)}% XP`))
    + b('wyklucz', G.karty.wyklucz ? T('ANULUJ', 'CANCEL') : T('WYKLUCZ', 'BANISH'));
  for (const el of box.querySelectorAll('[data-wybor]')) el.onclick = e => { e.stopPropagation(); wyborKart(el.dataset.wybor); };
  // klawisze 1–3 na kartach (tylko klawiatura)
  document.querySelectorAll('#cards .card').forEach((k, i) => {
    let g = k.querySelector('.glKarta');
    if (WEJ.tryb === 'klaw') { if (!g) { g = document.createElement('span'); g.className = 'glKarta'; k.appendChild(g); } g.innerHTML = glKl(String(i + 1)); }
    else if (g) g.remove();
  });
}
function wyborKart(a) {
  if (!G.karty || document.getElementById('cardsOv').style.display !== 'flex') return;
  const Wb = P.wybory;
  if (a === 'wyklucz' && G.karty.wyklucz) { G.karty.wyklucz = false; rysujKarty(G.karty.karty); odswiezPrzyciskiKart(); return; }
  if (!Wb || !(Wb[a] > 0)) { AUDIO.sfx('klik'); return; }
  if (a === 'przelos') {
    Wb.przelos--; P.wyboryUzyte.przelosuj++;
    G.karty.karty = losujKarty(3, G.karty.opcje);
    rysujKarty(G.karty.karty); odswiezPrzyciskiKart();
    AUDIO.sfx('skrzynia');
  } else if (a === 'pomin') {
    Wb.pomin--; P.wyboryUzyte.pomin++;
    P.xp += CFG_DECYZJE.wybory.pominXp * P.xpNeed;   // przekroczenie progu = kolejny awans w następnej klatce
    document.getElementById('xpbar').style.width = Math.min(100, P.xp / P.xpNeed * 100) + '%';
    G.karty = null;
    zamknijOverlay('cardsOv');
  } else if (a === 'wyklucz') {
    G.karty.wyklucz = true;
    rysujKarty(G.karty.karty); odswiezPrzyciskiKart();
  }
}
// kliknięcie karty w trybie wykluczania: id do P.wyklucz, na jej miejsce NOWA karta (awans nie przepada — skarga na Megabonka)
function wykluczKarte(i) {
  const c = G.karty.karty[i];
  if (!c || c.k.typ === 'przyp' || c.k.typ === 'evo') { AUDIO.sfx('klik'); return; }
  P.wyklucz.add(c.k.id); P.wybory.wyklucz--; P.wyboryUzyte.wyklucz++;
  G.karty.wyklucz = false;
  const zajete = new Set(G.karty.karty.map(x => x.k.id));
  const pula = cardPool().filter(k => !zajete.has(k.id));
  const reszta = G.karty.karty.filter((x, j) => j !== i);
  const nowa = losujKarty(1, { ...G.karty.opcje, pula, minRz: reszta.some(x => x.rz !== 'zw') ? null : G.karty.opcje.minRz })[0];
  if (nowa) G.karty.karty[i] = nowa; else G.karty.karty.splice(i, 1);
  rysujKarty(G.karty.karty); odswiezPrzyciskiKart();
  AUDIO.sfx('tarcza');
  toastBuff(T(`Wykluczone: ${c.k.nm('zw').replace(/ \(.*$| → .*$/, '')} — nowa karta od Nonny`, `Banished: ${c.k.nm('zw').replace(/ \(.*$| → .*$/, '')} — a new card from Nonna`));
  setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2200);
}
// kafelki kart (osobno od losowania: przelosuj/wyklucz w K3 rysują je na nowo)
function rysujKarty(karty) {
  const wrap = document.getElementById('cards'); wrap.innerHTML = '';
  const sub = document.getElementById('cardsSub');
  const podsuwa = cardPool().some(k => k.podsun);
  const wyk = G.karty && G.karty.wyklucz;
  if (sub) {
    sub.innerHTML = wyk ? T('Dotknij karty, której nie chcesz więcej widzieć', 'Tap the card you never want to see again')
      : podsuwa ? T('Nonna podsuwa składniki do Twoich dań (×3)', 'Nonna nudges ingredients for your dishes (×3)') : '';
    sub.style.display = wyk || podsuwa ? '' : 'none';
    sub.classList.toggle('wyk', !!wyk);
  }
  karty.forEach((c, idx) => {
    const u = c.k, rz = c.rz;
    const d = document.createElement('div');
    d.className = 'card' + (u.gold ? ' gold' : '') + (rz === 'nieb' ? ' nieb' : rz === 'fiol' ? ' fiol' : '');
    d.dataset.typ = u.typ; d.dataset.klucz = u.klucz; d.dataset.rz = rz;
    if (u.podsun) d.dataset.podsun = u.podsun;
    d.innerHTML = (RZ_NM[rz] ? `<span class="rzEt">${RZ_NM[rz]}</span>` : '')
      + `<div class="ico">${ico(u.ico, 42)}</div><div class="nm">${u.nm(rz)}</div><div class="ds">${u.ds(rz)}</div>`
      + (u.podsun ? `<div class="podsun">${T('Nonna poleca', 'Nonna suggests')} → ${ico(WEAPONS[u.podsun].ico, 14)} ${T('do przepisu', 'for a recipe')}</div>` : '')
      + (wyk && u.typ !== 'przyp' && u.typ !== 'evo' ? `<span class="wykX">✕</span>`
         + (u.typ === 'bron' || u.typ === 'dokl' ? `<div class="wykDs">${T('bez ulepszeń do końca biegu', 'no upgrades for the rest of the run')}</div>` : '') : '');
    if (wyk) d.classList.add(u.typ === 'przyp' || u.typ === 'evo' ? 'nieWyk' : 'wyk');
    d._klucz = u.klucz; d._karta = c;                    // DEV: bot wybiera kartę po kluczu
    d.onclick = () => {
      if (G.karty && G.karty.wyklucz) return wykluczKarte(idx);
      u.do(rz); G.karty = null; G.decyzje = (G.decyzje || 0) + 1; zamknijOverlay('cardsOv');
    };
    wrap.appendChild(d);
  });
}

// ============================== E2 K4: ZŁOTA SKRZYNIA — JEDNA DEFINICJA (spec 08 §1) ==============================
// otworzZlotaSkrzynie('mapa' | 'kapral' | 'don'), zawsze przez pchnijOverlay (gra stoi, kolejka OV_Q):
//   kapral/Don z gotowym przepisem → JACKPOT z przepisem; mapa + wolny slot + jest broń → wybór broni (openNewWeapon);
//   reszta → JACKPOT. Skrzynia z mapy NIGDY nie gotuje, skrzynia kaprala/Dona NIGDY nie daje broni.
function przepisyGotowe() {
  if (!CFG_DECYZJE.przepisyZeSkrzyni) return [];      // K5 włącza gotowanie ze skrzyni
  return P.weapons.filter(przepisGotowy).sort((a, b) => (a.gotowyOd || 0) - (b.gotowyOd || 0));
}
function otworzZlotaSkrzynie(zrodlo) {
  const gotowe = przepisyGotowe();
  if (zrodlo !== 'mapa' && gotowe.length) return jackpot(zrodlo, gotowe);
  if (zrodlo === 'mapa' && P.weapons.length < 3 && dostepneBronie().length) return openNewWeapon();
  return jackpot(zrodlo, zrodlo === 'mapa' ? [] : gotowe);
}
// PULA JACKPOTU (odświeżana po każdym trafieniu): broń < max ×3, posiadany składnik < max ×2, broń na max → Dokładka ×1;
// pusta → Przyprawa. Wykluczone nie wypadają. Jackpot NIE daje nowych składników ani broni.
function pulaJackpotu() {
  const pool = [];
  for (const k of cardPool()) {
    if (k.typ === 'bron') pool.push({ ...k, waga: 3 });
    else if (k.typ === 'skl') pool.push({ ...k, waga: 2 * trudn().karty.sklWaga });   // Spiżarnia: v2 ×0,5
    else if (k.typ === 'dokl') pool.push({ ...k, waga: 1 });
  }
  if (!pool.length) for (const r of repeatPool()) pool.push({ ...r, waga: 1 });
  return pool;
}
// ile przedmiotów: scenariusz 1-1-3-1-5 dla pierwszych pięciu jackpotów w historii zapisu, potem losowanie ze źródła
function ileWJackpocie(zrodlo, gotowe) {
  const J = CFG_DECYZJE.jackpot, nr = META.st.jackpoty || 0;
  let N;
  if (nr < J.scenariusz.length) N = J.scenariusz[nr];
  else { const p = J[zrodlo] || J.mapa, x = Math.random(); N = x < p[0] ? 1 : x < p[0] + p[1] ? 3 : 5; }
  return zrodlo === 'mapa' ? N : Math.max(N, gotowe.length);   // przepis nigdy nie czeka na następnego kaprala
}
// ROZSTRZYGNIĘCIE (przed bębnami): przepisy najpierw, potem losowania z odświeżanej puli, każde z rzadkością.
// Zwraca listę { ico, nm, rz, przepis? } do pokazania. Stosuje nagrody od razu (gra stoi pod overlayem).
function rozstrzygnijJackpot(zrodlo, gotowe, wymusN) {
  const N = wymusN ? Math.max(wymusN, zrodlo === 'mapa' ? 0 : gotowe.length) : ileWJackpocie(zrodlo, gotowe);
  const lista = [];
  for (const w of gotowe) {
    const ek = PRZEPIS_BRONI[w.key];
    if (!ek || P.evo[ek]) continue;
    ugotuj(ek, w);
    lista.push({ ico: WEAPONS[w.key].evoIco, nm: WEAPONS[w.key].evoNm, rz: 'przepis', przepis: ek, ds: WEAPONS[w.key].evoDs });
  }
  while (lista.length < N) {
    const pula = pulaJackpotu();
    let suma = 0; for (const k of pula) suma += k.waga;
    let x = Math.random() * suma, i = 0;
    for (; i < pula.length - 1; i++) { x -= pula[i].waga; if (x <= 0) break; }
    const k = pula[i];
    const rz = k.bezRz ? 'zw' : losujRz({ kapral: zrodlo === 'kapral', skl: k.typ === 'skl' });
    lista.push({ ico: k.ico, nm: k.nm(rz), ds: k.ds(rz), rz, klucz: k.klucz });
    k.do(rz);
  }
  META.st.jackpoty = (META.st.jackpoty || 0) + 1; saveMetaSoon();
  if (N >= 5) STATY.zdarzenie('jackpot/5/' + zrodlo, 'Jackpot 5 (' + zrodlo + ')');
  G.jackpoty = G.jackpoty || []; G.jackpoty.push({ t: +G.time.toFixed(1), zrodlo, N, przepisy: lista.filter(l => l.przepis).length });
  return { N, lista };
}
// animacja „pełna" czy „szybka": ustawienie gracza, prefers-reduced-motion, bot, ?szybko=1
const skrzyniaSzybka = () => BOT.on || /[?&]szybko=1/.test(location.search) || (META.ui.skrzyniaSzybka != null
  ? !!META.ui.skrzyniaSzybka : matchMedia('(prefers-reduced-motion: reduce)').matches);   // null = auto (wg systemu), wybór gracza wygrywa
const SKR = { timery: [], faza: 4, wynik: null, zrodlo: null, gotowe: null, t0: 0 };
function jackpot(zrodlo, gotowe = [], wymusN) {
  const ov = document.getElementById('skrzyniaOv');
  for (const t of SKR.timery) clearTimeout(t);
  Object.assign(SKR, { timery: [], faza: 0, wynik: null, zrodlo, gotowe, wymusN, t0: performance.now() });
  document.getElementById('skrzTytul').textContent = zrodlo === 'kapral' ? T('SKRZYNIA KAPRALA!', "CORPORAL'S CRATE!")
    : zrodlo === 'don' ? T('SKRZYNIA DONA!', "THE DON'S CRATE!") : T('ZŁOTA SKRZYNIA!', 'GOLDEN CRATE!');
  ov.className = 'ov faza0' + (zrodlo === 'kapral' ? ' kapral' : '');
  document.getElementById('skrzIko').innerHTML = ico('skrzynia', 96);
  document.getElementById('skrzBebny').innerHTML = '';
  document.getElementById('skrzLista').innerHTML = '';
  document.getElementById('skrzPrzepis').innerHTML = '';
  // wymiennik przy pełnych slotach (decyzja właściciela 2): mały przycisk w fazie 0, tylko skrzynia z mapy
  const wym = document.getElementById('skrzWymien');
  const mozeWymienic = zrodlo === 'mapa' && P.weapons.length >= 3 && dostepneBronie().length > 0;
  SKR.mozeWymienic = mozeWymienic;
  wym.style.display = mozeWymienic ? '' : 'none';
  wym.innerHTML = `${WEJ.tryb === 'pad' ? padKapsel(2) : ''} ${T('Wymień broń zamiast tego', 'Swap a weapon instead')}`;
  document.getElementById('skrzZab').style.display = 'none';
  ov.style.display = 'flex';
  G.ovOd = performance.now();                        // blokada przypadkowych wciśnięć (trzymana Spacja, autopowtarzanie)
  AUDIO.sfx('skrzynia');
  // szybka: od razu lista — chyba że jest wymiennik: wtedy faza 0 czeka na gest (dotknięcie = otwórz, przycisk = wymień)
  if (skrzyniaSzybka()) { if (!mozeWymienic || BOT.on) pokazListeJackpotu(true); else SKR.szybka = true; return; }
  SKR.szybka = false;
  SKR.timery.push(setTimeout(startBebnow, mozeWymienic ? 1200 : 600));
}
// koniec fazy 0 (albo pominięcie): rozstrzygnij, światło w kolorze wyniku, bębny
function startBebnow() {
  if (SKR.faza > 0) return;
  SKR.faza = 1;
  document.getElementById('skrzWymien').style.display = 'none';
  SKR.wynik = rozstrzygnijJackpot(SKR.zrodlo, SKR.gotowe, SKR.wymusN);
  const ov = document.getElementById('skrzyniaOv'), N = SKR.wynik.N;
  ov.classList.remove('faza0'); ov.classList.add('faza1', N >= 5 ? 'n5' : N >= 3 ? 'n3' : 'n1');
  // bębny: pasek 12 ikon (posiadane rzeczy + moneta + gwiazda), ostatnia = wynik; staje po kolei
  const ikony = [...P.weapons.map(w => WEAPONS[w.key].ico), ...P.skl.map(k => PASSIVES[k].ico), 'moneta', 'gwiazda'];
  const box = document.getElementById('skrzBebny');
  let t = 1.3 - 0.6, stopy = [];                     // czas od startu fazy 1 (faza 0 = 0,6 s)
  SKR.wynik.lista.forEach((it, i) => {
    const b = document.createElement('div');
    b.className = 'beben' + (it.przepis ? ' przepis' : '');
    let pas = '';
    for (let j = 0; j < 11; j++) pas += `<div>${ico(ikony[(i * 3 + j) % ikony.length], 40)}</div>`;
    pas += `<div class="cel">${ico(it.ico, 40)}</div>`;
    b.innerHTML = `<div class="pas">${pas}</div>`;
    box.appendChild(b);
    const ostatni = i === SKR.wynik.lista.length - 1;
    const stop = t + (ostatni && N >= 5 ? 0.5 : 0);
    stopy.push(stop);
    t = stop + (it.przepis ? 1.2 : 0.35);
    const pasEl = b.firstChild;
    pasEl.style.transition = `transform ${Math.max(0.2, stop - 0.3)}s cubic-bezier(.15,.85,.25,1)`;
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    SKR.timery.push(setTimeout(() => {               // 0,3 s światła, potem bębny ruszają
      if (SKR.faza !== 1) return;
      SKR.faza = 2;
      for (const p of document.querySelectorAll('#skrzBebny .pas')) p.style.transform = 'translateY(calc(-11 * var(--bb)))';
    }, 300));
  }));
  stopy.forEach((st, i) => SKR.timery.push(setTimeout(() => zatrzymajBeben(i), st * 1000)));
  const ost = SKR.wynik.lista[SKR.wynik.lista.length - 1];   // przepis na końcu: +1,2 s na napis „NONNA GOTUJE"
  SKR.timery.push(setTimeout(() => pokazListeJackpotu(false), (stopy[stopy.length - 1] + 0.5 + (ost && ost.przepis ? 1.2 : 0)) * 1000));
}
function zatrzymajBeben(i) {
  if (SKR.faza >= 4) return;
  const b = document.querySelectorAll('#skrzBebny .beben')[i], it = SKR.wynik.lista[i];
  if (!b) return;
  b.classList.add('stoi', 'rz-' + it.rz);
  AUDIO.sfx('traf');
  if (it.przepis) {
    SKR.faza = 3;
    blysk('#ffd75e', 0.55); AUDIO.sfx('awans');
    const nowy = SKR.odkryte && SKR.odkryte.has(it.przepis);
    document.getElementById('skrzPrzepis').innerHTML = `<div class="gotuje">${T('NONNA GOTUJE: ', 'NONNA IS COOKING: ')}${it.nm}!</div><div class="ds">${it.ds}</div>`
      + (nowy ? `<div class="pieczatka">${T('NOWY PRZEPIS W KSIĄŻCE!', 'NEW RECIPE IN THE BOOK!')}</div>` : '');
  }
}
// faza 4: lista wyników + ZABIERAM!  (`szybko` = od razu, z krótkim błyskiem)
function pokazListeJackpotu(szybko) {
  if (SKR.faza >= 4 && SKR.wynik && document.getElementById('skrzZab').style.display !== 'none') return;
  for (const t of SKR.timery) clearTimeout(t);
  SKR.timery = [];
  if (!SKR.wynik) SKR.wynik = rozstrzygnijJackpot(SKR.zrodlo, SKR.gotowe, SKR.wymusN);
  SKR.faza = 4;
  const ov = document.getElementById('skrzyniaOv'), N = SKR.wynik.N;
  ov.classList.remove('faza0', 'faza1'); ov.classList.add('faza4', N >= 5 ? 'n5' : N >= 3 ? 'n3' : 'n1');
  document.getElementById('skrzWymien').style.display = 'none';
  const box = document.getElementById('skrzBebny');
  if (!box.children.length || szybko) {              // bez animacji: od razu stojące okienka z wynikiem
    box.innerHTML = SKR.wynik.lista.map(it => `<div class="beben stoi rz-${it.rz}${it.przepis ? ' przepis' : ''}"><div class="pas"><div class="cel">${ico(it.ico, 40)}</div></div></div>`).join('');
  } else for (const [i, b] of [...box.children].entries()) {
    b.classList.add('stoi', 'rz-' + SKR.wynik.lista[i].rz);
    const p = b.firstChild; p.style.transition = 'none'; p.style.transform = 'translateY(calc(-11 * var(--bb)))';
  }
  const przep = SKR.wynik.lista.filter(it => it.przepis);
  if (przep.length && !document.getElementById('skrzPrzepis').innerHTML) {
    const it = przep[0], nowy = SKR.odkryte && SKR.odkryte.has(it.przepis);
    document.getElementById('skrzPrzepis').innerHTML = `<div class="gotuje">${T('NONNA GOTUJE: ', 'NONNA IS COOKING: ')}${przep.map(p => p.nm).join(' + ')}!</div>`
      + (nowy ? `<div class="pieczatka">${T('NOWY PRZEPIS W KSIĄŻCE!', 'NEW RECIPE IN THE BOOK!')}</div>` : '');
  }
  document.getElementById('skrzLista').innerHTML = SKR.wynik.lista.map(it =>
    `<div class="poz rz-${it.rz}">${ico(it.ico, 18)} <b>${it.nm}</b>${it.przepis ? '' : ` <span>${it.ds}</span>`}</div>`).join('');
  const zab = document.getElementById('skrzZab');
  zab.innerHTML = `${WEJ.tryb === 'pad' ? padKapsel(0) : WEJ.tryb === 'klaw' ? glKl('ENTER') : ''} ${T('ZABIERAM!', 'TAKE IT!')}`;
  zab.style.display = '';
  if (szybko) blysk(N >= 5 ? '#ffd75e' : '#ffffff', 0.3);
  if (N >= 3) AUDIO.sfx('zlota');
  SKR.czasDoListy = +((performance.now() - SKR.t0) / 1000).toFixed(2);
  SKR.listaOd = performance.now();
  if (WEJ.tryb === 'pad') gpMark(zab);
}
function zamknijJackpot() {
  if (SKR.faza < 4) return pominJackpot();
  if (!BOT.on && performance.now() - (SKR.listaOd || 0) < 300) return;   // ZABIERAM! dopiero po 0,3 s listy (autopowtarzanie)
  SKR.wynik = null; SKR.odkryte = null;
  document.getElementById('skrzyniaOv').className = 'ov';
  renderWpns();
  zamknijOverlay('skrzyniaOv');
}
// pominięcie animacji: dotknięcie/klik gdziekolwiek, A/Enter/Spacja w fazach 0–3
function pominJackpot() {
  if (document.getElementById('skrzyniaOv').style.display !== 'flex') return;
  if (performance.now() - (G.ovOd || 0) < 250) return;   // trzymany klawisz/przycisk z biegu nie pomija od razu
  if (SKR.faza < 4) pokazListeJackpotu(SKR.szybka);
}
function wymienZamiastJackpotu() {
  if (SKR.faza !== 0 || !SKR.mozeWymienic) return;  // tylko skrzynia z mapy przy pełnych slotach (X na padzie = też karabin)
  for (const t of SKR.timery) clearTimeout(t);
  SKR.timery = []; SKR.faza = 4; SKR.wynik = null;
  const ov = document.getElementById('skrzyniaOv');
  ov.style.display = 'none'; ov.className = 'ov';
  document.getElementById('skrzBebny').innerHTML = '';
  openSwap(true);                                    // gra dalej stoi (overlay wymiennika przejmuje pauzę)
}

// ============================== WYMIENNIK BRONI 🔄 ==============================
function openSwap(zJackpotu = SKR.zJackpotu) {
  SKR.zJackpotu = !!zJackpotu;                       // E2: wymiennik otwarty z jackpotu — zamiast „Zostaw +10" jest „Wróć do skrzyni"
  const wrap = document.getElementById('swapList'); wrap.innerHTML = '';
  document.getElementById('swapTitle').textContent = T('WYMIENNIK! Którą broń oddajesz?', 'SWAP TIME! Which weapon goes?');
  for (const w of P.weapons) {
    const W = WEAPONS[w.key];
    const d = document.createElement('div');
    d.className = 'card';
    const danie = PRZEPIS_BRONI[w.key] && P.evo[PRZEPIS_BRONI[w.key]];   // E2: oddanie broni z ugotowanym daniem
    d.innerHTML = `<div class="ico">${ico(danie ? W.evoIco : W.ico, 42)}</div><div class="nm">${danie ? W.evoNm : W.nm} ${T('poz.', 'lv.')} ${w.lvl}</div>`
      + `<div class="ds">${T('kliknij, by ODDAĆ', 'tap to GIVE IT UP')}${danie ? `<br><b class="traci">${T('traci danie!', 'loses the dish!')}</b>` : ''}</div>`;
    d.onclick = () => pickNewWeapon(w);
    wrap.appendChild(d);
  }
  const skip = document.createElement('div');
  skip.className = 'card';
  if (SKR.zJackpotu) {                               // E2 K4: pomyłkowy „Wymień" nie może zjeść jackpotu (ani zamienić go na monety)
    skip.innerHTML = `<div class="ico">${ico('skrzynia', 42)}</div><div class="nm">${T('Wróć do skrzyni', 'Back to the crate')}</div><div class="ds">${T('otwórz jackpot', 'open the jackpot')}</div>`;
    skip.onclick = () => { SKR.zJackpotu = false; document.getElementById('swapOv').style.display = 'none'; document.getElementById('swapList').innerHTML = ''; jackpot('mapa'); };
  } else {
    skip.innerHTML = `<div class="ico">${ico('wymiana', 42)}</div><div class="nm">${T('Zostaw jak jest', 'Keep them all')}</div><div class="ds">${T('+10 monet pocieszenia', '+10 coins as a consolation')}</div>`;
    skip.onclick = () => { G.runCoins += 10; drawCoins(); closeSwap(); };
  }
  wrap.appendChild(skip);
  document.getElementById('swapOv').style.display = 'flex';
}
// BROŃ POSTACI JEST TYLKO JEJ. Bez tego świeży Carrotello wyciągał ze skrzyni
// Scyzoryki (najlepszą broń jednocelową w grze) w 40. sekundzie pierwszego biegu
// i wybór postaci przestawał cokolwiek znaczyć — a to on ma być powodem, żeby
// odblokowywać kolejne warzywa. Decyzja właściciela.
const broniDostepna = k => {
  const W = WEAPONS[k];
  if (W.postac && W.postac !== charKey) return false;   // startowa broń innej postaci
  return !W.locked || META.unlocked[k];
};
// skrzynia przy WOLNYM slocie: prezent — wybór nowej broni bez oddawania
const dostepneBronie = () => Object.keys(WEAPONS).filter(k => !hasWeapon(k) && broniDostepna(k));
// E2 K4: linia o przepisie na karcie broni (planowanie buildu, spec §1.2)
function liniaPrzepisu(key) {
  const ek = PRZEPIS_BRONI[key];
  if (!ek) return T('Przepis: Nonna jeszcze gotuje', "Recipe: Nonna's still cooking");
  if (META.ksiazka && META.ksiazka[ek] && META.ksiazka[ek].odk)
    return T(`Przepis: + ${PASSIVES[PRZEPISY[ek].skl].nm} → ${WEAPONS[key].evoNm}`, `Recipe: + ${PASSIVES[PRZEPISY[ek].skl].nm} → ${WEAPONS[key].evoNm}`);
  return T('Przepis: ??? — Nonna coś wie', 'Recipe: ??? — Nonna knows something');
}
function openNewWeapon() {
  const wszystkie = dostepneBronie();
  if (!wszystkie.length) { G.runCoins += 15; drawCoins(); return zamknijOverlay('swapOv'); }
  // LOSUJEMY 2 propozycje (nie pokazujemy całej listy — wybór ma coś znaczyć)
  const opts = [];
  const pula = wszystkie.slice();
  while (opts.length < 2 && pula.length) opts.push(pula.splice(Math.floor(Math.random() * pula.length), 1)[0]);
  const wrap = document.getElementById('swapList'); wrap.innerHTML = '';
  document.getElementById('swapTitle').textContent = T('ZNALEZIONA BROŃ! Co bierzesz?', 'WEAPON FOUND! Which one do you take?');
  for (const key of opts) {
    const W = WEAPONS[key];
    const d = document.createElement('div');
    d.className = 'card gold';
    d.innerHTML = `<div class="ico">${ico(W.ico, 42)}</div><div class="nm">${W.nm}</div><div class="ds">${W.ds}</div><div class="przepisLn">${liniaPrzepisu(key)}</div>`;
    d.onclick = () => {
      G.decyzje = (G.decyzje || 0) + 1;
      P.weapons.push({ key, lvl: 1, t: 0, t0: G.time });
      if (P.weapons.length >= 3) { const [a, b] = CFG_DECYZJE.wchestPelne; wchest.wait = Math.max(wchest.wait, a + Math.random() * (b - a)); }   // sloty właśnie pełne
      renderWpns();
      closeSwap();
    };
    wrap.appendChild(d);
  }
  const skip = document.createElement('div');
  skip.className = 'card';
  skip.innerHTML = `<div class="ico">${ico('wymiana', 42)}</div><div class="nm">${T('Nie, dzięki', 'No thanks')}</div><div class="ds">${T('+10 monet', '+10 coins')}</div>`;
  skip.onclick = () => { G.runCoins += 10; drawCoins(); closeSwap(); };
  wrap.appendChild(skip);
  document.getElementById('swapOv').style.display = 'flex';
}

function pickNewWeapon(oldW) {
  const wszystkie = Object.keys(WEAPONS).filter(k => !hasWeapon(k) && broniDostepna(k));
  if (!wszystkie.length) { G.runCoins += 15; drawCoins(); return closeSwap(); }
  const opts = [];
  const pula = wszystkie.slice();
  while (opts.length < 2 && pula.length) opts.push(pula.splice(Math.floor(Math.random() * pula.length), 1)[0]);
  const wrap = document.getElementById('swapList'); wrap.innerHTML = '';
  document.getElementById('swapTitle').textContent = T('Co bierzesz w zamian?', 'What do you take instead?');
  for (const key of opts) {
    const W = WEAPONS[key];
    const d = document.createElement('div');
    d.className = 'card gold';
    d.innerHTML = `<div class="ico">${ico(W.ico, 42)}</div><div class="nm">${W.nm}</div><div class="ds">${W.ds}</div>`;
    d.onclick = () => {
      if (oldW.key === 'kosc') usunCzosnki();                 // razem z segmentami linki
      if (oldW.key === 'pipsini') usunPestki();               // razem z kiełkami
      if (oldW.key === 'ciabatta' && typeof usunKapcieOrb === 'function') usunKapcieOrb();   // E2 K5: orbita Doppii
      if (PRZEPIS_BRONI[oldW.key]) delete P.evo[PRZEPIS_BRONI[oldW.key]];   // danie odchodzi razem z bronią
      const i = P.weapons.indexOf(oldW);              // E2: NOWY obiekt — pola starej broni (Dokładki, chmury, gotowyOd) nie przechodzą
      if (i >= 0) P.weapons[i] = { key, lvl: 1, t: 0, t0: G.time };
      renderWpns();
      closeSwap();
    };
    wrap.appendChild(d);
  }
  // E2 K4: „Wróć" — dawniej po wskazaniu broni do oddania nie było odwrotu (spec 01 §6.2)
  const wroc = document.createElement('div');
  wroc.className = 'card';
  wroc.innerHTML = `<div class="ico">${ico('strzalka', 42)}</div><div class="nm">${T('Wróć', 'Back')}</div><div class="ds">${T('wybierz inną broń do oddania', 'pick another weapon to give up')}</div>`;
  wroc.onclick = () => openSwap();
  wrap.appendChild(wroc);
}
function closeSwap() { SKR.zJackpotu = false; zamknijOverlay('swapOv'); }

// ============================== HUD ==============================
let _drgT = 0;
// Pas serc (px) między pauzą i pełnym ekranem (index.html): telefon < 520 px — przyciski ±80..114 px od środka,
// czyli wolne ±80 minus 2 px luzu; szerszy ekran — ±106..140, wolne ±106 minus luz.
const pasSerc = () => innerWidth < 520 ? 156 : 206;
const krokSerca = R => Math.ceil(R * 9 / 8) + 1;    // ikona 9×8 + 1 px odstępu (margin w ui-hud.css)
function drawHearts(drgnij = false) {
  // HP przycinamy do maksimum: `repeat()` z liczba ujemna rzuca RangeError i zabija
  // cala klatke, a wystarczy jedno leczenie ponad max (albo hak debugowy), zeby to
  // wywolac. Prog licznika nizszy na waskich ekranach — rzad 11 serc wchodzil
  // w licznik ZAGROZENIA.
  // 25.09 (decyzja właściciela „1 uderzenie = 1 serce"): serca CAŁE — ćwiartki z K3 usunięte.
  // 24.09 (decyzja właściciela): ŻYCIE TYLKO JAKO SERDUSZKA — bez liczby HP obok i bez licznika
  // „1200 / 1500" przy wielu sercach; przy wielu sercach rząd rysuje się mniejszymi ikonami.
  // 25.09 (przegląd K7–K8): przy 11+ sercach (Beetino 8 + 3 Serducha) rząd na telefonie wchodził pod pauzę
  // i pełny ekran. Teraz serca mają STAŁĄ SZEROKOŚĆ PASA między przyciskami (`pasSerc`) i się ZAWIJAJĄ:
  // największa ikona, przy której wszystko mieści się w 1 rzędzie, potem w 2, potem w 3 (ikona ≥ 11 px).
  const hp = Math.max(0, Math.min(P.hp, P.maxHp));
  const serc = Math.min(30, Math.round(P.maxHp / HP_SERCA));   // bezpiecznik: hak DEV z maxHp 1e6 = 10 000 ikon
  // Rozmiar nie rośnie z liczbą serc (1 rząd 18/16/14 → 2 rzędy 14/12 → 3 rzędy 11), a rzędy są RÓWNE
  // (11 serc = 6 + 5, nie 9 + 2): szerokość pudełka = serca w rzędzie × krok.
  const W = pasSerc();
  let R = 11, wRzedzie = Math.ceil(serc / 3);
  wybor: for (const [rzedy, rozmiary] of [[1, [18, 16, 14]], [2, [14, 12]], [3, [11]]]) {
    const n = Math.ceil(serc / rzedy);
    for (const r of rozmiary) if (n * krokSerca(r) <= W) { R = r; wRzedzie = n; break wybor; }
  }
  const el = document.getElementById('hearts');
  el.style.maxWidth = Math.min(W, wRzedzie * krokSerca(R)) + 'px';
  const pelne = Math.min(serc, Math.ceil(hp / HP_SERCA - 1e-6));   // całe serca (25.09: bez ćwiartek)
  el.innerHTML = ico('serce', R).repeat(pelne) + ico('sercePuste', R).repeat(Math.max(0, serc - pelne));
  if (drgnij) {                                    // trafienie: serca drgają 200 ms
    el.classList.remove('drgnij'); void el.offsetWidth; el.classList.add('drgnij');
    clearTimeout(_drgT); _drgT = setTimeout(() => el.classList.remove('drgnij'), 200);
  }
}
// JEDEN helper obrażeń gracza — każde trafienie (kontakt, Sodino, ketchup, regał, sztuczki kaprali, ataki
// Dona, lawina) idzie tędy. **1 cios = 1 serce** (decyzja właściciela 25.09): pierwszy argument jest
// IGNOROWANY (zostaje w wywołaniach jako opis siły ataku z CFG_BIEG), bez skalowania w czasie — trudność
// rośnie liczbą, HP i tempem wrogów, nie siłą ciosu. Obrażenia ciągłe (`o.dot`, Salt Storm): pierwsze
// wejście zabiera 1 serce, potem zwykła nietykalność CFG_BIEG.nietyk (v1 0,9 s, v2 0,8 s). Sprawdza nietykalność, garnek/karabin
// (`ciosPochloniety`), tarczę; ustawia nietykalność, winietę, wstrząs, dźwięk, pop „-1", źródło ostatniego
// ciosu (ekran porażki) i licznik trafień per źródło (`G.obrazeniaOd`, w sercach).
//   o.nietyk — dłuższa nietykalność w s (domyślnie 0,9, łagodny 2,0; krótszej nie da), o.shake — wstrząs, o.dot — obrażenia ciągłe.
// Zwraca true, gdy cios wszedł.
// `obrazeniaWroga` — już TYLKO wytrzymałość Sokowirówki (wrogowie biją wieżyczkę: T.dmg × dmgMul).
const obrazeniaWroga = baza => baza * HP_SERCA * dmgMul();
function ranGracza(_sila, zr = 'inne', o = {}) {
  if (G.dying || !G.running || G.wygrana) return false;   // K8: po śmierci Dona gracz nietykalny do końca
  if (P.iframes > 0 || G.time < G.nonnaDo) return false;   // K10: 3 s po Ręce Nonny
  if (G.time < (G.skrzOchr || -1)) return false;   // 30.09: otwiera się kufer 3D (≤ 0,3 s przed nakładką; dawniej nakładka pauzowała od razu)
  // DoT przy garnku albo w trybie karabinu: pochłonięte BEZ kosztu — inaczej sól zabierałaby życie trybu
  // karabinu (karabinZjadlCios) co 0,9 s
  if (o.dot && (G.buff.key === 'niet' || G.fps.on)) return false;
  if (ciosPochloniety()) return false;
  const tarczaLvl = P.passives.tarcza || 0;
  if (tarczaLvl > 0 && P.shieldCd <= 0) {          // 🛡️ tarcza zjada cios
    P.shieldCd = [30, 24, 18][tarczaLvl - 1];
    P.iframes = 0.9;
    AUDIO.sfx('tarcza');
    toastBuff(T('TARCZA zablokowała cios!', 'The SHIELD took that hit!'));
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 1500);
    novaRing(P.pos.x, P.pos.z, 2);
    return false;
  }
  const ile = HP_SERCA;                            // zawsze dokładnie 1 serce
  P.hp -= ile;
  // `o.nietyk` (regał 1,1 s) może nietykalność tylko WYDŁUŻYĆ — w łagodnym biegu (2 s) nie skraca jej trybowi
  P.iframes = Math.max(o.nietyk || 0, G.lagodny ? CFG_BIEG.trybLagodny.nietyk : CFG_BIEG.nietyk);
  G.shake = Math.max(G.shake, o.shake != null ? o.shake : 0.35);
  AUDIO.sfx('hurt');
  const v = document.getElementById('vign');
  v.style.opacity = 1; setTimeout(() => { if (!G.dying) v.style.opacity = 0; }, 180);
  dmgPop(P.pos.x, P.y + 0.4, P.pos.z, '-1', '#ff4a4a', 1.1, 'wazny');   // ważny: limit napisów w tłoku go nie zjada
  G.ostatniCios = zr;
  G.obrazeniaOd[zr] = (G.obrazeniaOd[zr] || 0) + ile;
  // K10: raz na bieg zamiast śmierci; ZALEW: też w pierwszym biegu w życiu bez trybu łagodnego (zalew.rekaPierwszy)
  if (P.hp <= 0 && (G.lagodny || (zalew().rekaPierwszy && G.pierwszyBieg)) && !G.rekaNonny && !STRES) rekaNonny();
  drawHearts(true);
  if (P.hp <= 0) startDeath();
  return true;
}
// E1-bieg K10: RĘKA NONNY (spec §7) — tylko łagodny bieg, raz: śmiertelny cios → 50% serc (całe, w górę),
// fala odpychająca r 10 (siła 9, bez obrażeń — pozycja wprost, jak fala karabinu, bo Gummini mają bezKb),
// 3 s nietykalności (także na DoT soli), napis „NONNA: Jeszcze nie, skarbie!". W normalnym biegu tę rolę przejmie
// wskrzeszenie z reklamy (E5).
function rekaNonny() {
  const R = CFG_BIEG.trybLagodny.reka;
  G.rekaNonny = true;
  P.hp = Math.max(HP_SERCA, Math.round(P.maxHp * R.hp / HP_SERCA) * HP_SERCA);
  P.iframes = R.niet; G.nonnaDo = G.time + R.niet;
  for (const e of G.enemies) {
    if (e.dying) continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d > R.r) continue;
    const nd = Math.min(R.r, d + R.sila), inv = 1 / Math.max(d, 0.001);
    e.pos.x = P.pos.x + dx * inv * nd; e.pos.z = P.pos.z + dz * inv * nd;
    if (!e.don) e.stun = Math.max(e.stun || 0, 0.5);
  }
  novaRing(P.pos.x, P.pos.z, R.r * 0.5);
  puff(P.pos.x, P.y + 1, P.pos.z, 0xffd75e, 2.4);
  okruchy(P.pos.x, P.y + 1.4, P.pos.z, 0xffd75e, 16);
  blysk('#ffd75e', 0.3);
  G.hitstop = Math.max(G.hitstop, 0.15); G.shake = Math.max(G.shake, 0.5);
  AUDIO.sfx('zlota');
  napis(T('NONNA: Jeszcze nie, skarbie!', 'NONNA: Not yet, sweetheart!'), 2200, '#ffd75e');
  G.zdarzenia.push({ t: +G.time.toFixed(1), typ: 'reka-nonny' });
  STATY.zdarzenie('reka-nonny/min-' + kubelekMinut(G.time), 'Ręka Nonny: ' + fmtTime(G.time));
}
const fmtTime = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const drawCoins = () => document.getElementById('coins').innerHTML = ico('moneta', 15) + ' ' + G.runCoins;
function renderWpns() {
  sprawdzGotowe();
  document.getElementById('wpns').innerHTML = P.weapons.map(w => {
    const W = WEAPONS[w.key];
    const evo = W.evoKey && P.evo[W.evoKey];
    const got = !evo && przepisGotowy(w);            // E2 K5: przepis gotowy — złota pulsująca obwódka + ikona dania w rogu
    const noze = w.key === 'scyzoryk' && P.nozeBonus ? `<i class="noze">+${P.nozeBonus}</i>` : '';   // E2 K8: noże Razoretty
    return `<span class="wp${evo ? ' evo' : ''}${got ? ' gotowy' : ''}">${ico(evo ? W.evoIco : W.ico, 20)}<b>${w.lvl}${w.bonus > 0 ? '+' : ''}</b>${noze}`
      + `${got ? `<i class="danie">${ico(W.evoIco, 10)}</i>` : ''}</span>`;   // E2: „5+" = Dokładki
  // PUSTE SLOTY = OSOBNE `<span>`, nie jeden z kropkami: w skórze „Warzywniak
  // Nonny" slot jest skrzynką na warzywa o stałym rozmiarze, więc trzy puste
  // sloty muszą być trzema skrzynkami, a nie jedną z trzema kropkami w środku.
  }).join('') + '<span class="wp empty">·</span>'.repeat(Math.max(0, 3 - P.weapons.length));
  // E2 K1: drugi rząd — sloty składników (mniejsze skrzynki, poziom cyfrą, puste „·")
  const sk = document.getElementById('skl');
  if (sk) sk.innerHTML = (P.skl || []).map(k => `<span class="wp">${ico(PASSIVES[k].ico, 14)}<b>${P.passives[k] || 0}</b></span>`).join('')
    + '<span class="wp empty">·</span>'.repeat(Math.max(0, (P.slotySkl || 3) - (P.skl || []).length));
}

// ============================== DEKORACJE (materiały dla chunków) ==============================
let decoMats = null;   // [{mat, aspect, h, forest, weight}]
async function loadDecoMats() {
  const defs = [
    // [plik, wysokość, gdzie: true=las / false=łąka / null=wszędzie, waga]
    // (drzewa są teraz PRAWDZIWE 3D — patrz makeTree)
    // 5. pole = szerokość plamki cienia kontaktowego wzgl. szerokości sprite'a (0 = bez)
    ['assets/rock1.png', 1.1, null, 1.2, 0.80], ['assets/rock2.png', 1.0, null, 1, 0.85],
    ['assets/bush1.png', 1.2, true, 2.5, 0.70], ['assets/bush3.png', 1.1, null, 2, 0.60],
    ['assets/trawa_kepa.png', 0.8, false, 3, 0], ['assets/kwiat1.png', 0.6, false, 3, 0.55],
    ['assets/kwiat2.png', 0.6, false, 3, 0.55], ['assets/scarecrow.png', 1.6, false, 0.3, 0.45],
  ];
  decoMats = [];
  for (const [src, h, forest, weight, cien] of defs) {
    const { mat, w, h: ih } = await flatMat(src);
    decoMats.push({ mat, aspect: w / ih, h, forest, weight, cien });
  }
}

// losowa pozycja na lądzie W POBLIŻU GRACZA (mapa nieskończona)
const _probe = new THREE.Vector3();
function landSpot(rMin = 14, rMax = 85) {
  for (let tries = 0; tries < 60; tries++) {
    const a = Math.random() * Math.PI * 2, r = rMin + Math.sqrt(Math.random()) * (rMax - rMin);
    const x = P.pos.x + Math.sin(a) * r, z = P.pos.z + Math.cos(a) * r;
    if (terrainH(x, z) < wodaY(x, z) + 0.35 && !MAPS[mapKey].indoor) continue;   // nie w wodzie
    _probe.set(x, 0, z);
    solveSolids(_probe, 0.7, 0);
    if (Math.hypot(_probe.x - x, _probe.z - z) > 0.3) continue;              // nie w regale/pniu
    return { x, z };
  }
  return null;
}

// ============================== CHUNKI TERENU (mapa bez końca) ==============================
const CHUNK = 40, CHUNK_SEG = 20, VIEW = 4;   // 9×9 chunków wokół gracza
const chunkMap = new Map();                    // "cx,cz" -> {mesh, deco[], rocks[]}
// E1: SĄSIEDZTWO 3×3 Z CACHE. solveSolids/supportY/onSpill wołane są 2× na wroga na klatkę,
// a każde robiło 9× `chunkMap.get(gx + ',' + gz)` — przy 500 wrogach ~9000 sklejeń
// napisów na klatkę (profil z telefonu: 11% CPU). Lista chunków wokół komórki (cx,cz),
// w tej samej kolejności co stare pętle (gx, potem gz; brakujące pominięte), ważna do
// następnej zmiany `chunkMap` (każde set/delete/clear podbija `_chunkWer`).
let _chunkWer = 0, _sasWer = -1;
const _sasCache = new Map();
function chunkiWokol(cx, cz) {
  if (_sasWer !== _chunkWer) { _sasCache.clear(); _sasWer = _chunkWer; }
  const k = (cx + 32768) * 65536 + (cz + 32768);
  let a = _sasCache.get(k);
  if (!a) {
    a = [];
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const ch = chunkMap.get(gx + ',' + gz);
      if (ch) a.push(ch);
    }
    _sasCache.set(k, a);
  }
  return a;
}
// deterministyczny generator per chunk
function chunkRng(cx, cz) {
  let s = (hash2(cx, cz) * 4294967296) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function buildChunk(cx, cz) {
  if (MAPS[mapKey].osiedle) return buildChunkOsiedla(cx, cz);   // własna budowa (sekcja „MAPA OSIEDLE" niżej)
  const wx0 = cx * CHUNK, wz0 = cz * CHUNK;
  const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, CHUNK_SEG, CHUNK_SEG);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  const cols = new Float32Array(p.count * 3);
  const norms = new Float32Array(p.count * 3);
  const E = 0.4;
  for (let i = 0; i < p.count; i++) {
    const wx = wx0 + p.getX(i), wz = wz0 + p.getZ(i);
    const h = terrainH(wx, wz);
    p.setY(i, h);
    uv.setXY(i, wx / 5, wz / 5);               // UV globalne = bezszwowa trawa
    // normalne z gradientu szumu (spójne między chunkami — zero szwów cienia)
    const dhx = (terrainH(wx + E, wz) - terrainH(wx - E, wz)) / (2 * E);
    const dhz = (terrainH(wx, wz + E) - terrainH(wx, wz - E)) / (2 * E);
    const il = 1 / Math.hypot(dhx, 1, dhz);
    norms[i * 3] = -dhx * il; norms[i * 3 + 1] = il; norms[i * 3 + 2] = -dhz * il;
    const b = biome(wx, wz);
    let cr, cg, cb;
    if (MAPS[mapKey].indoor) {                   // market: jasna podłoga
      cr = cg = cb = 0.96 + 0.04 * hash2(Math.round(wx), Math.round(wz));
    } else {
      // grunt ciemniejszy od CZUBKÓW źdźbeł (ton jak ich środek): jaśniejszy „dywan"
      // pod kępkami spłaszczał trawę i postać stała NA nim zamiast W trawie
      cr = 0.70 + b * 0.24; cg = 0.95; cb = 0.36 - b * 0.08;   // limonkowy grunt pod limonkową trawą
      // ŁATY KOLORU (atmosfera, referencja Chubby Pixel 19.09): jednolita zieleń wyglądała
      // jak dywan. Dwie oktawy szumu o DUŻEJ skali (28 i 11 j.) dają ciemniejsze/jaśniejsze
      // płachty trawy i ciepłe przetarcia — czytelne dopiero z dystansu, z bliska niewidoczne.
      const laty = vnoise(wx / 28 + 3.7, wz / 28 - 8.1) - 0.5;
      const drob = vnoise(wx / 11 - 21.3, wz / 11 + 5.9) - 0.5;
      const t1 = laty * 0.26 + drob * 0.12;
      cr *= 1 + t1 * 0.85; cg *= 1 + t1 * 0.34; cb *= 1 + t1 * 1.20;   // jaśniej = cieplej i bardziej żółto
      // strome zbocza = przetarta ziemia (jak na referencji: skarpy odsłaniają grunt)
      const strome = Math.min(1, Math.max(0, (Math.hypot(dhx, dhz) - 0.55) / 0.85));
      if (MAPS[mapKey].rzeki) {
        // WĄWOZY: stroma ściana = SKAŁA, nie trawa (właściciel: „ściany brzydkie" — zielony dywan
        // na pionowej ścianie). Jasny piaskowiec z WARSTWAMI po wysokości (pasy co ~2,6 j. jak
        // w kanionie), przejście od ~33° do ~55°. Mnożniki > 1, bo tekstura gruntu jest limonkowa
        // (patrz PIASEK niżej) — beż i szarość trzeba z niej „wyciągnąć".
        // przejście 27°→40° i smoothstep: przy szerokim przejściu (33°→55°) większość ścian
        // kanionu (35-45°) dostawała pół na pół trawy i skały = oliwkowe błoto na zrzucie
        const t0 = Math.min(1, Math.max(0, (Math.hypot(dhx, dhz) - 0.50) / 0.35));
        const skala = t0 * t0 * (3 - 2 * t0);
        if (skala > 0) {
          const pas = 0.5 + 0.5 * Math.sin(h * 2.4 + vnoise(wx / 9, wz / 9) * 2.2);
          const war = 0.84 + 0.16 * pas;                 // jaśniejsze i ciemniejsze warstwy
          // 2.25/0.96/2.4: pierwsza wersja (1.62/0.84/2.05) wyszła na zrzucie szarozielona —
          // ściany kanionu są zwykle w cieniu, a tekstura gruntu jest limonkowa, więc piaskowiec
          // trzeba przestrzelić w ciepło i jasność, żeby w grze czytał się jako skała
          const sr = 2.25 * war, sg = 0.96 * war, sb = 2.40 * war;
          cr += (sr - cr) * skala; cg += (sg - cg) * skala; cb += (sb - cb) * skala;
        }
      } else if (strome > 0) { cr += (1.55 - cr) * strome * 0.55; cg += (0.86 - cg) * strome * 0.55; cb += (0.95 - cb) * strome * 0.55; }
      // BRZEG = PIASEK/MUŁ (ciepły beż), nie ciemna zieleń: ciemny pas bez źdźbeł
      // czytał się na zrzutach jak płycizna i postać „stała na wodzie".
      // Mnożniki > 1 są celowe — tekstura gruntu jest limonkowa (mało czerwieni
      // i niebieskiego), więc beż trzeba z niej „wyciągnąć". Pas wąski (0.35 j.
      // wysokości), pod wodą stopniowo ciemniejszy = dno.
      const wY = wodaY(wx, wz);
      const piasek = Math.min(1, Math.max(0, (wY + 0.35 - h) / 0.30));
      if (piasek > 0) {
        const glab = h < wY ? Math.min(0.55, (wY - h) * 0.3) : 0;
        const pr = 1.95 * (1 - glab), pg = 0.80 * (1 - glab), pb = 2.0 * (1 - glab * 0.8);
        cr += (pr - cr) * piasek; cg += (pg - cg) * piasek; cb += (pb - cb) * piasek;
      }
    }
    cols[i * 3] = cr; cols[i * 3 + 1] = cg; cols[i * 3 + 2] = cb;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
  const mesh = new THREE.Mesh(geo, MAPS[mapKey].indoor ? chunkMatIndoor : chunkMat);
  mesh.position.set(wx0, 0, wz0);
  mesh.receiveShadow = true;
  scene.add(mesh);
  const rng = chunkRng(cx, cz);
  const deco = [], rocks = [], solids = [], spills = [], leaves = [], sway = [];
  let blobRecs = null;                           // plamki cienia kontaktowego (→ rebuildBlobs)
  const shelves = [];                            // regały do przewrócenia (tylko market)
  let grass = null;

  if (MAPS[mapKey].indoor) {
    // ======== MARKET (30.09, sekcja „MARKET — PRZEBUDOWA" w INFO-PROJEKT.md) ========
    // Układ chunka (strefa: regały / mrożonki / warzywa / kasy / promocja, alejki, hale, plamy) liczy
    // lib/uklad-marketu.js z `rng` chunka; wygląd — lib/modele-market.js. Siatka terenu z góry funkcji zostaje
    // obiektem chunka, ale dostaje geometrię CAŁEGO statycznego marketu: posadzka (płytki, pasy alejek, odbicia lamp
    // liczone w shaderze), rekwizyty, cienie kontaktowe i rozlana woda = 1 draw call. Szkło lad i folia palet =
    // 2. siatka (przezroczysta), regały = 3. (InstancedMesh modułów 4 j., przewracane — `ustawRegal`).
    mkInit();
    const U = UM.ukladChunka(cx, cz, rng);
    const g0 = terrainH(wx0, wz0);
    const B = MM.zbudujChunk(THREE, U, g0, CHUNK);
    geo.dispose();                                   // płaska siatka 20 × 20 z góry funkcji nie jest potrzebna
    mesh.geometry = B.geo; mesh.material = MK.mat;
    mesh.userData.mk = { strefa: U.strefa, v: B.wierzcholki };
    if (B.geoSzkla) {
      const sz = new THREE.Mesh(B.geoSzkla, MK.matSzkla);
      sz.position.copy(mesh.position); sz.wlasnaGeo = true;
      scene.add(sz); rocks.push(sz);
    }
    // bryły rekwizytów: palety/stoiska ~0,9–0,95, wózki 1,05, kasy 1,0, lady 1,5 — wszystko do wskoczenia
    for (const o of U.obiekty) { const b = UM.brylaObiektu(o); solids.push({ x: b.x, z: b.z, hw: b.hw, hl: b.hl, top: g0 + b.top }); }
    for (const p of U.plamy) spills.push({ x: p.x, z: p.z, r: p.r });
    if (U.regaly.length) {
      const im = new THREE.InstancedMesh(MK.geoRegalu, MK.matRegal, U.regaly.length);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(U.regaly.length * 3), 3);
      // własna sfera (chunk + wraki ≤ 2,5 j. poza obrys) → frustum culling działa także dla instancji
      im.boundingSphere = new THREE.Sphere(new THREE.Vector3(wx0, g0 + 1.2, wz0), 31);
      scene.add(im); rocks.push(im);
      mesh.userData.mk.im = im;                      // mkKlatka: wariant materiału z przycinaniem przy kamerze
      U.regaly.forEach((r, i) => {
        const a = r.poZ ? r.z : r.x, b = r.poZ ? r.x : r.z;
        const sh = { solid: {}, x: r.x, z: r.z, g0, len: UM.REGAL.dl, kier: r.kier, poZ: r.poZ, a, b, piv: a + r.kier * UM.REGAL.gl / 2,
                     kat: r.kat, war: r.war, t: 0, stan: 'stoi', im, i };
        brylaRegalu(sh, false);
        solids.push(sh.solid);
        shelves.push(sh);
        ustawRegal(sh, 0);
      });
    }
    // SIATKA BRYŁ: solveSolids/supportY pytają tylko o komórkę 4 × 4 j. punktu (~3 bryły zamiast ~50 na chunk)
    solids.siatka = mkSiatkaBryl(solids, shelves, wx0, wz0);
    // MASKA DLA POLA PRZEPŁYWU HORDY (to samo TO.Nawigacja co na osiedlu): stojący regał = ściana, leżący regał
    // i rekwizyty (≤ 1,5 j.) = „niskie" (droższe, horda woli obejść, ale wejdzie). Odświeżana, gdy regał padnie/wstanie.
    const maska = () => OS.maski.set(osKlucz(cx, cz), TO.maskiKolizji(
      solids.map(b => ({ x: b.x, z: b.z, hw: b.hw, hl: b.hl, wys: b.top - g0 })), wx0 - CHUNK / 2, wz0 - CHUNK / 2));
    maska();
    for (const sh of shelves) sh.maska = maska;
  } else {
    // ======== ŁĄKI: struktury do wskakiwania — MODELE 3D (lib/modele-laki.js, sekcja „ŁĄKI — MODELE 3D") ========
    // Kolizje (`solids`: pozycje, hw/hl, top) i liczba wywołań rng() BEZ ZMIAN względem prostych brył sprzed 30.09.
    // Wygląd: stos skrzyń na warzywa / taras na palach / kamienne schody — cała struktura chunka = JEDNA scalona
    // siatka (`flushLaki`: 1 draw call + 1 w cieniu; dawniej 3 / 6 / 3 Meshe bez cieni).
    const laki = new ML.Zbior();
    let lakiDawniej = 0;                           // ile Meshy stawiała stara wersja (strumień bota — patrz flushLaki)
    const rr = rng();
    if (rr < 0.30) {
      // STOSY SKRZYŃ — schodki 0.9 / 1.7 (wskakujesz bez podwójnego skoku)
      const x = wx0 + (rng() - 0.5) * CHUNK * 0.7, z = wz0 + (rng() - 0.5) * CHUNK * 0.7;
      if (terrainH(x, z) > wodaY(x, z) + 0.4) {
        const g0 = terrainH(x, z);
        const uklad = ML.WYMIARY.stos, obroty = [];   // [[0, 0, 0.9], [1.5, 0.3, 1.7], [0.7, 1.6, 1.3]]
        for (const [ox, oz, h] of uklad) {
          obroty.push(rng());                      // dawniej rotation.y = rng() * 0.5 (tylko wygląd — kolizja i tak osiowa)
          solids.push({ x: x + ox, z: z + oz, hw: 0.7, hl: 0.7, top: g0 + h });
        }
        laki.stos(x, z, g0, obroty); lakiDawniej += 3;
      }
    } else if (rr < 0.48) {
      // DREWNIANY PODEST NA PALACH — wysoki taras (2.1), wejście po skrzyni obok
      const x = wx0 + (rng() - 0.5) * CHUNK * 0.7, z = wz0 + (rng() - 0.5) * CHUNK * 0.7;
      if (terrainH(x, z) > wodaY(x, z) + 0.4) {
        const g0 = terrainH(x, z), H = 2.1;
        solids.push({ x, z, hw: 2.7, hl: 2.7, top: g0 + H + 0.18 });
        solids.push({ x: x + 3.6, z, hw: 0.8, hl: 0.8, top: g0 + 1.1 });   // stopień wejściowy (skrzynia)
        laki.podest(x, z, g0); lakiDawniej += 6;
      }
    } else if (rr < 0.60) {
      // KAMIENNE SCHODY na wzniesienie (3 stopnie)
      const x = wx0 + (rng() - 0.5) * CHUNK * 0.7, z = wz0 + (rng() - 0.5) * CHUNK * 0.7;
      if (terrainH(x, z) > wodaY(x, z) + 0.4) {
        const g0 = terrainH(x, z);
        for (let s2 = 0; s2 < 3; s2++) {
          const h = 0.6 + s2 * 0.6;
          solids.push({ x, z: z + s2 * 1.5, hw: 1.5, hl: 0.75, top: g0 + h });
        }
        laki.schody(x, z, g0); lakiDawniej += 3;
      }
    }
    flushLaki(laki, rocks, lakiDawniej);
    // ======== ŁĄKI: DRZEWA (pnie + bryły koron), PIEŃKI, KŁODY, GŁAZY + dekoracje ========
    // Wszystkie bryły chunka idą do akumulatora i wychodzą jako po JEDNYM InstancedMeshu
    // na rodzaj: pnie, stożki, korony (per paleta, max 2 na chunk), głazy, plamki cienia.
    // Wcześniej każde drzewo = 5-6 meshy = 5-6 draw calli; teraz cały las chunka to ~5.
    const las = biome(wx0, wz0) <= 0.45;
    const acc = nowyAkumulator();
    const paletki = [Math.floor(rng() * 3), rng() < 0.15 ? 3 : Math.floor(rng() * 3)];
    const nTrees = las ? 4 + Math.floor(rng() * 4) : (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < nTrees; i++) {
      const x = wx0 + (rng() - 0.5) * CHUNK, z = wz0 + (rng() - 0.5) * CHUNK;
      if (terrainH(x, z) < wodaY(x, z) + 0.5) continue;
      solids.push(makeTree(x, z, rng, acc, paletki));
    }
    // pieńki i kłody: w lesie częściej (ścinka), na łące pojedynczo; nie na spawnie
    const nPienki = las ? Math.floor(rng() * 3) : (rng() < 0.3 ? 1 : 0);
    for (let i = 0; i < nPienki; i++) {
      const x = wx0 + (rng() - 0.5) * CHUNK * 0.9, z = wz0 + (rng() - 0.5) * CHUNK * 0.9;
      if (terrainH(x, z) < wodaY(x, z) + 0.5 || (Math.abs(x) < 8 && Math.abs(z) < 8)) continue;
      solids.push(rng() < 0.5 ? makeStump(x, z, rng, acc) : makeLog(x, z, rng, acc));
    }
    // ======== PODSZYCIE: puchate krzaki (nasze kłębki) + modele Quaternius + resztki sprite'ów ========
    // Wagi: krzak 3, kwiaty 3, paproć/roślina 1.6, kępa trawy (sprite) 2, kamyk 0.8, strach 0.2.
    // Krzaki i kwiaty na łące, paprocie w lesie — jak było przy sprite'ach.
    const nDeco = 6 + Math.floor(rng() * 5);
    for (let i = 0; i < nDeco; i++) {
      const x = wx0 + (rng() - 0.5) * CHUNK, z = wz0 + (rng() - 0.5) * CHUNK;
      if (terrainH(x, z) < wodaY(x, z) + 0.3) continue;
      const lasTu = biome(x, z) <= 0.45;
      const roll = rng();
      if (roll < 0.34) {                            // KRZAK z naszych kłębków (styl koron)
        krzakPuchaty(x, z, rng, acc, paletki[rng() < 0.8 ? 0 : 1]);
      } else if (NATURA && roll < 0.62) {           // KWIATY / koniczyna
        const lista = NATURA.kwiaty.filter(Boolean);
        stawModel(lista[Math.floor(rng() * lista.length)], x, z, 0.45 + rng() * 0.45, rng, acc);
      } else if (NATURA && roll < 0.78) {           // PAPROĆ / roślina (w lesie częściej)
        const nazwy = lasTu ? ['Fern_1', 'Plant_1_Big', 'Clover_2'] : ['Plant_1', 'Plant_7', 'Grass_Wispy_Short'];
        const m = NATURA.wg[nazwy[Math.floor(rng() * nazwy.length)]];
        stawModel(m, x, z, 0.55 + rng() * 0.6, rng, acc);
      } else if (NATURA && roll < 0.86) {           // płaski kamyk w trawie
        const lista = NATURA.glazy.filter(g => g && g.nazwa.startsWith('Pebble'));
        stawModel(lista[Math.floor(rng() * lista.length)], x, z, 0.5 + rng() * 0.7, rng, acc, 'r', 1.0);
      } else if (decoMats) {                        // sprite'y, które zostają: kępa trawy i strach na wróble
        const pick = decoMats[rng() < 0.93 ? 4 : 7];
        const m = new THREE.Mesh(unitGeo, pick.mat);
        const w = pick.h * pick.aspect;
        m.position.set(x, gruntDoSadzenia(x, z) - 0.05, z);
        m.scale.set(w, pick.h, 1);
        billboardQuat(m.quaternion);                // jak sprite'y postaci: yaw + pochylenie do kamery
        scene.add(m); deco.push(m);
        if (pick.cien) acc.blobs.push(blobRec(x, z, w * pick.cien, w * pick.cien * 0.55));
      }
    }
    if (rng() < 0.45) {                           // GRUPA GŁAZÓW: 1 duży + 0-2 mniejsze obok
      const x = wx0 + (rng() - 0.5) * CHUNK, z = wz0 + (rng() - 0.5) * CHUNK;
      if (terrainH(x, z) > wodaY(x, z) + 0.3) {
        const s0 = 0.7 + rng() * 1.5, n = 1 + Math.floor(rng() * 2.6);
        // GŁAZY Z MODELI Quaternius (gładkie, jasne — jak na referencji), a gdy modeli jeszcze
        // nie ma (pierwsze chunki przed wczytaniem), spada na stary ikosaedr.
        const duze = NATURA ? NATURA.glazy.filter(g => g && g.nazwa.startsWith('Rock_Medium')) : null;
        let a = rng() * 6.28;
        for (let i = 0; i < n; i++) {
          const s = i === 0 ? s0 : s0 * (0.35 + rng() * 0.35);
          const d = i === 0 ? 0 : s0 * (1.0 + rng() * 0.5) + s;
          const rx = x + Math.cos(a) * d, rz = z + Math.sin(a) * d;
          a += 1.6 + rng() * 1.5;
          const g = terrainH(rx, rz);
          if (duze && duze.length) {
            const mdl = duze[Math.floor(rng() * duze.length)];
            // 1.5× jasności: atlas Quaternius jest ciemnoszary, a na referencji głazy są
            // kremowo-jasne i to one rozświetlają scenę między ciemnymi koronami
            stawModel(mdl, rx, rz, s * 1.5, rng, acc, 'h', 1.0);
          } else {
            acc.rocks.push({ x: rx, y: g + s * 0.2, z: rz,
                             rx: (rng() - 0.5) * 0.4, ry: rng() * 7, rz: (rng() - 0.5) * 0.4,
                             sx: s * (1 + rng() * .5), sy: s * (0.55 + rng() * .3), sz: s, tint: rockTint(rng) });
          }
          acc.blobs.push(blobRec(rx, rz, s * 2.4, s * 2.0));
          // niski głaz — do przeskoczenia!
          solids.push({ c: 1, x: rx, z: rz, r: s * 0.9, top: g + s * 0.75 });
        }
        // KAMYKI wokół grupy (rumosz), bez kolizji — ten sam InstancedMesh co głazy,
        // więc zero dodatkowych draw calli; tylko tam, gdzie są głazy (chunk bez
        // głazów nie dostaje osobnego mesha kamyków — to kosztowało +1 call/chunk)
        const nKam = 3 + Math.floor(rng() * 5);
        for (let i = 0; i < nKam; i++) {
          const ka = rng() * 6.28, kd = s0 * (1.6 + rng() * 2.2);
          const kx = x + Math.cos(ka) * kd, kz = z + Math.sin(ka) * kd;
          if (terrainH(kx, kz) < wodaY(kx, kz) + 0.3) continue;
          const s = 0.18 + rng() * 0.22;
          acc.rocks.push({ x: kx, y: terrainH(kx, kz) + s * 0.25, z: kz, rx: rng() * 3, ry: rng() * 7, rz: 0,
                           sx: s * (1 + rng() * .6), sy: s * 0.7, sz: s, tint: rockTint(rng) });
        }
      }
    }
    if (MAPS[mapKey].rzeki) wodaChunka(cx, cz, rocks);
    // ---- akumulator → siatki (wszystkie do `rocks`: ensureChunks je dispose'uje) ----
    // pieńki + kłody = 1 call (bez receiveShadow, jak drewno drzew — patrz flushDrewno)
    flushInst(trunkGeo, trunkMat, acc.trunks, rocks, true, false);
    // DREWNO DRZEW v5 (pnie, korzenie, konary, gałęzie wszystkich drzew chunka) = 1 call
    flushDrewno(acc.drewno, rocks);
    // MODELE NATURY (kwiaty, paprocie, kamienie, głazy Quaternius) = drugi 1 call; odbierają
    // cień, bo leżą na ziemi i bez tego świeciły pełnym kolorem w cieniu drzewa
    flushDrewno(acc.natura, rocks, naturaMat, true, true);
    // KĘPY liści (max 2 palety na chunk) + łapy świerków (paleta 4): rzucają cień, ale go
    // NIE odbierają — self-shadowing z PCF robił na bryłach ciemne, poszarpane łaty
    // LIŚCIE (karty gałązek; max 2 palety liściaste + świerk = 3 calle): rzucają cień (alphaTest
    // działa też w materiale głębi → cętkowany cień pod koroną), nie odbierają
    for (let p = 0; p < LISCIE_PALET; p++) flushInst(geoLisci(), liscieMats[p], acc.liscie[p], rocks, true, false);
    flushInst(rockGeo, rockMat, acc.rocks, rocks);
    blobRecs = acc.blobs;                            // → rebuildBlobs() po ensureChunks
  }
  // E3 K2: teren i nieprzezroczyste dekoracje chunka rysują się PIERWSZE (−2), sylwetki (−1) widzą w buforze głębi
  // tylko świat. Przezroczyste (woda, rozlana woda) zostają na 0 — ich kolejność względem pul bez zmian.
  for (const o of [mesh, ...rocks, ...deco, ...leaves]) if (o && o.material && !o.material.transparent) o.renderOrder = -2;
  return { mesh, deco, rocks, solids, spills, grass, leaves, sway, shelves, blobRecs, cx, cz };
}

// WODA CHUNKA (tylko mapa „Wąwozy"): rzeka ma własny poziom w każdym punkcie, więc jednej
// płaskiej tafli użyć się nie da. Bierzemy tę samą siatkę co teren (21×21 na chunk), podnosimy
// wierzchołki do lustra rzeki i zostawiamy TYLKO te czworokąty, w których choć jeden róg jest
// pod wodą — reszta by wystawała nad ląd. Materiał ten sam co jezioro, więc piana, przejrzystość
// i mapa głębi działają bez zmian. Koszt idzie razem z budową chunka, a nie co klatkę.
function wodaChunka(cx, cz, rocks) {
  const wx0 = cx * CHUNK, wz0 = cz * CHUNK, N = CHUNK_SEG;
  const lustro = new Float32Array((N + 1) * (N + 1)), glab = new Float32Array((N + 1) * (N + 1));
  let jest = false;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = wx0 - CHUNK / 2 + (i / N) * CHUNK, z = wz0 - CHUNK / 2 + (j / N) * CHUNK;
    const k = j * (N + 1) + i;
    const l = TW.poziomWody(x, z);
    // ⚠️ `poziomWody` zwraca −Infinity na suchym lądzie, a taki wierzchołek NADAL trafia do
    // siatki (czworokąt zostaje, gdy choć jeden róg jest mokry). −Infinity w atrybucie pozycji
    // = NaN w `computeBoundingSphere` i setki błędów w konsoli. Suchy róg dostaje więc wysokość
    // gruntu minus 0.3 — tafla po prostu wchodzi w brzeg, czyli dokładnie to, co ma robić.
    lustro[k] = Number.isFinite(l) ? l : TW.wysokosc(x, z) - 0.3;
    glab[k] = TW.glebokoscWody(x, z);
    if (glab[k] > 0.02) jest = true;
  }
  if (!jest) return null;
  const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, N, N);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let k = 0; k < p.count; k++) p.setY(k, lustro[k]);
  const idx = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    if (glab[a] <= 0.02 && glab[b] <= 0.02 && glab[c] <= 0.02 && glab[d] <= 0.02) continue;
    idx.push(a, c, b, b, c, d);
  }
  if (!idx.length) { geo.dispose(); return null; }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, waterMat);
  m.position.set(wx0, 0, wz0);
  m.receiveShadow = true;
  m.wlasnaGeo = true;                              // ensureChunks zwolni geometrię
  scene.add(m); rocks.push(m);
  return m;
}

// ═══════════════════════════════ ŁĄKI — MODELE 3D (30.09, lib/modele-laki.js) ═══════════════════════════════
// Stosy skrzyń, tarasy na palach i kamienne schody (Łąki i Wąwozy — ta sama gałąź buildChunk). Kolizje liczy
// buildChunk jak dawniej; tu tylko wygląd: prefaby z modułu (cache) przepisane do świata → JEDNA siatka na chunk,
// stopy (podstawy stojące na ziemi) zjeżdżają do rysowanego gruntu (`gruntDoSadzenia`) — na stoku nic nie wisi.
// Materiał wspólny (toon + ton cienia + wiatr trawy/naci/chorągiewek + cień chmur liczony w nim, NIE addCloudShadow).
const LAKI = { chunki: 0, tris: 0, ms: 0, msMax: 0, rozgrzewka: null };   // DEV: HORDA.laki3D()
let _lakiMat = null;
function lakiMat() {
  if (!_lakiMat) {
    _lakiMat = ML.materialLak(THREE, { czas: windU, chmury: { tex: cloudShadowU, off: cloudOffU, skala: CLOUD_SCALE } });
    // wszystkie warianty prefabów od razu (pierwszy chunk = ekran ładowania / zmiana mapy): zimny prefab to do ~16 ms,
    // a nowy wariant wpadałby w bieg przy przekroczeniu granicy chunka. Bez obiektów three → bez Math.random.
    LAKI.rozgrzewka = ML.rozgrzej();
  }
  return _lakiMat;
}
// `dawniej` = ile Meshy stawiała w tym chunku stara wersja (3 skrzynie / pomost + 4 pale + stopień / 3 stopnie).
// ⚠️ STRUMIEŃ BOTA: każdy obiekt three bierze na UUID 4 × Math.random, a botBieg podmienia Math.random na seed.
// Stara wersja zużywała 4 × `dawniej`, nowa 8 (geometria + Mesh) — różnicę dobieramy pustymi losowaniami,
// żeby biegi bota z tym samym seedem dawały te same wyniki co przed modelami (sprawdzone: Łąki i Wąwozy).
function flushLaki(zb, rocks, dawniej) {
  let m = null;
  if (!zb.pusty) {
    const mat = lakiMat(), t0 = performance.now();   // materiał (+ rozgrzewka prefabów) poza pomiarem budowy chunka
    const geo = zb.geo(THREE, gruntDoSadzenia);
    m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    m.wlasnaGeo = true;                            // ensureChunks zwolni geometrię razem z chunkiem
    m.userData.laki3D = true;                      // dcRaport: 'laki:struktury'
    scene.add(m); rocks.push(m);
    const ms = performance.now() - t0;
    LAKI.chunki++; LAKI.tris += geo.attributes.position.count / 3; LAKI.ms += ms; LAKI.msMax = Math.max(LAKI.msMax, ms);
  }
  for (let i = 4 * dawniej - (m ? 8 : 0); i > 0; i--) Math.random();
  return m;
}

// ═══════════════════════════════ MARKET — PRZEBUDOWA (30.09) ═══════════════════════════════
// Układ: lib/uklad-marketu.js (strefy, alejki różnej szerokości, hale, kasy, plamy), wygląd: lib/modele-market.js
// (atlas towaru, posadzka i odbicia lamp w shaderze, rekwizyty). Chunk = 1 siatka statyczna + ≤ 1 szkło + 1 InstancedMesh
// regałów. Tu: materiały (raz), zasięg rysowania (mgła), spawn poza bryłami, omijanie ścian przez bota DEV.
let MK = null;
// poleHordy: horda idzie polem przepływu (obchodzi rzędy regałów). Bot śmiertelny (8 ziaren): z polem średnio 39 s,
// bez pola ~59 s, stary market ~49 s — patrz INFO-PROJEKT „MARKET — PRZEBUDOWA". DEV: HORDA.MK_OPCJE.poleHordy = false.
const MK_OPCJE = { poleHordy: true };
const mkCutA = { value: new THREE.Vector3() }, mkCutB = { value: new THREE.Vector3() };   // odcinek kamera → pierś gracza
function mkInit() {
  if (MK) return;
  // osobny egzemplarz materiału dla instancji: three przełączałby program (instancing tak/nie) przy KAŻDYM draw callu
  // na przemian siatka chunka / regały (getParameters + klucz programu co obiekt); ten sam kod shadera = ten sam program
  MK = { mat: MM.materialMarketu(THREE, { czas: windU }), matRegal: MM.materialMarketu(THREE, { czas: windU, nowy: true }),
         matRegalCut: MM.materialMarketu(THREE, { czas: windU, nowy: true, ciecie: { a: mkCutA, b: mkCutB } }),
         matSzkla: MM.materialSzkla(THREE), geoRegalu: MM.geoRegalu(THREE) };
}
// co render (scene.onBeforeRender): chunk, którego środek jest dalej niż mgła + 30 j. od kamery, nie rysuje się
// (w 9 × 9 chunkach połowa stoi za mgłą — frustum ich nie odrzuca, bo kamera patrzy w dal)
// + PRZYCINANIE: regały chunków przy odcinku kamera → gracz dostają wariant materiału z ażurem (gracz za rzędem regałów
// był widoczny tylko od głowy w górę); reszta chunków rysuje się bez `discard`.
const _mkF = { x: 0, z: 0, f2: 0, cut: false, x0: 0, x1: 0, z0: 0, z1: 0 };
function mkKlatkaChunk(ch) {
  const dx = ch.cx * CHUNK - _mkF.x, dz = ch.cz * CHUNK - _mkF.z, w = dx * dx + dz * dz < _mkF.f2;
  if (ch.mesh.visible !== w) { ch.mesh.visible = w; for (const m of ch.rocks) m.visible = w; }
  const mk = ch.mesh.userData.mk;
  if (!mk || !mk.im) return;
  const X0 = ch.cx * CHUNK - CHUNK / 2 - 3, Z0 = ch.cz * CHUNK - CHUNK / 2 - 3, F = _mkF;
  const m = F.cut && X0 < F.x1 && X0 + CHUNK + 6 > F.x0 && Z0 < F.z1 && Z0 + CHUNK + 6 > F.z0 ? MK.matRegalCut : MK.matRegal;
  if (mk.im.material !== m) mk.im.material = m;
}
function mkKlatka() {
  if (!MK || !MAPS[mapKey].indoor) return;
  const far = MAPS[mapKey].fog[1] + 30, cam = camera.position, F = _mkF;
  F.x = cam.x; F.z = cam.z; F.f2 = far * far;
  F.cut = G.running && !(G.fps && G.fps.on);            // z oczu (karabin) i w menu nie przycinamy
  mkCutA.value.copy(cam); mkCutB.value.set(P.pos.x, P.y + 1.15, P.pos.z);
  F.x0 = Math.min(cam.x, P.pos.x); F.x1 = Math.max(cam.x, P.pos.x); F.z0 = Math.min(cam.z, P.pos.z); F.z1 = Math.max(cam.z, P.pos.z);
  chunkMap.forEach(mkKlatkaChunk);
}
// SIATKA BRYŁ CHUNKA (10 × 10 komórek po 4 j.). Komórka trzyma bryły, które sięgają w nią z marginesem 1,5 j.
// (≥ promień pytań: gracz 0,4, wróg 0,35, landSpot 0,7 — także dla punktu tuż za krawędzią chunka, rzutowanego na
// skrajną komórkę); regał — sumę obrysu stojącego i leżącego, bo jego bryła zmienia się w miejscu przy upadku.
// Zmierzone (400 wrogów, CPU): update 7,1 ms → patrz INFO-PROJEKT „MARKET — PRZEBUDOWA" (bez siatki każdy wróg
// sprawdzał ~450 brył z 3 × 3 chunków dwa razy na klatkę; stary market miał ~15 brył na chunk).
const MK_KOM = 4, MK_N = 10, MK_MARG = 1.5, _mkPusta = [];
function mkSiatkaBryl(solids, shelves, wx0, wz0) {
  const x0 = wx0 - CHUNK / 2, z0 = wz0 - CHUNK / 2, kom = [];
  for (let i = 0; i < MK_N * MK_N; i++) kom.push([]);
  const dodaj = (s, ax0, az0, ax1, az1) => {
    const i0 = Math.max(0, Math.floor((ax0 - MK_MARG - x0) / MK_KOM)), i1 = Math.min(MK_N - 1, Math.floor((ax1 + MK_MARG - x0) / MK_KOM));
    const j0 = Math.max(0, Math.floor((az0 - MK_MARG - z0) / MK_KOM)), j1 = Math.min(MK_N - 1, Math.floor((az1 + MK_MARG - z0) / MK_KOM));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) kom[j * MK_N + i].push(s);
  };
  const reg = new Map();
  for (const sh of shelves) reg.set(sh.solid, sh);
  for (const s of solids) {
    const sh = reg.get(s);
    if (sh) {
      brylaRegalu(sh, true);
      const lx0 = s.x - s.hw, lz0 = s.z - s.hl, lx1 = s.x + s.hw, lz1 = s.z + s.hl;
      brylaRegalu(sh, sh.stan === 'lezy');
      dodaj(s, Math.min(lx0, s.x - s.hw), Math.min(lz0, s.z - s.hl), Math.max(lx1, s.x + s.hw), Math.max(lz1, s.z + s.hl));
    } else dodaj(s, s.x - s.hw, s.z - s.hl, s.x + s.hw, s.z + s.hl);
  }
  return { x0, z0, kom };
}
function mkKomorka(sg, x, z) {
  let i = Math.floor((x - sg.x0) / MK_KOM), j = Math.floor((z - sg.z0) / MK_KOM);
  if (i < -1 || j < -1 || i > MK_N || j > MK_N) return _mkPusta;           // punkt daleko poza tym chunkiem
  i = i < 0 ? 0 : i >= MK_N ? MK_N - 1 : i; j = j < 0 ? 0 : j >= MK_N ? MK_N - 1 : j;
  return sg.kom[j * MK_N + i];
}
// SPAWN / RECYKLING NIE W BRYLE: wypchnięcie po najkrótszej osi z marginesem (alejki ≥ 2,8 j., wyspy hal ≥ 1,8 j.
// od siebie, więc 1–2 przejścia wystarczają). Dawniej wróg rodził się w regale i wypychała go dopiero kolizja.
function mkPoprawPunkt(pos) {
  for (let k = 0; k < 4; k++) {
    let ruch = false;
    for (const ch of chunkiWokol(Math.floor(pos.x / CHUNK), Math.floor(pos.z / CHUNK))) for (const s of (ch.solids.siatka ? mkKomorka(ch.solids.siatka, pos.x, pos.z) : ch.solids)) {
      if (s.c) continue;
      const dx = pos.x - s.x, dz = pos.z - s.z, ox = s.hw + 0.55 - Math.abs(dx), oz = s.hl + 0.55 - Math.abs(dz);
      if (ox > 0 && oz > 0) { if (ox < oz) pos.x += dx > 0 ? ox : -ox; else pos.z += dz > 0 ? oz : -oz; ruch = true; }
    }
    if (!ruch) return;
  }
}
// DEV/bot: bot nie skacze, więc każda bryła wyższa od jego stóp jest ścianą; omija ją jak na osiedlu + wychodzi z utknięcia
function mkWBryle(x, z, m) {
  for (const ch of chunkiWokol(Math.floor(x / CHUNK), Math.floor(z / CHUNK)))
    for (const s of (ch.solids.siatka ? mkKomorka(ch.solids.siatka, x, z) : ch.solids)) if (!s.c && s.top > P.y + 0.3 && Math.abs(x - s.x) < s.hw + m && Math.abs(z - s.z) < s.hl + m) return true;
  return false;
}
const _botMk = { t: 0, px: 0, pz: 0, uc: 0, ux: 0, uz: 0 };
function mkBotOmin(wx, wz) {
  const l = Math.hypot(wx, wz) || 1;
  let ux = wx / l, uz = wz / l;
  if (G.time < _botMk.t) _botMk.t = _botMk.uc = 0;           // nowy bieg
  if (G.time - _botMk.t > 1) {                               // co 1 s: czy ruszył się choć o 0,8 j.?
    if (Math.hypot(P.pos.x - _botMk.px, P.pos.z - _botMk.pz) < 0.8 && _botMk.t > 0) {
      const a = Math.random() * Math.PI * 2; _botMk.uc = 1.2; _botMk.ux = Math.sin(a); _botMk.uz = Math.cos(a);
    }
    _botMk.t = G.time; _botMk.px = P.pos.x; _botMk.pz = P.pos.z;
  }
  if (_botMk.uc > 0) { _botMk.uc -= 1 / 30; ux = _botMk.ux; uz = _botMk.uz; }
  for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.2, -2.2, 3.1]) {
    const c = Math.cos(a * BOT.kier), sn = Math.sin(a * BOT.kier), dx = ux * c - uz * sn, dz = ux * sn + uz * c;
    if (mkWBryle(P.pos.x + dx * 0.9, P.pos.z + dz * 0.9, 0.45) || mkWBryle(P.pos.x + dx * 1.8, P.pos.z + dz * 1.8, 0.45)) continue;
    if (a && _botMk.uc > 0) { _botMk.ux = dx; _botMk.uz = dz; }
    return { x: dx, z: dz };
  }
  return { x: ux, z: uz };
}

// ═══════════════════════════════ MAPA OSIEDLE (30.09) ═══════════════════════════════
// Układ (kwartały 2×2 chunki, bloki, podwórka, maska gruntu) liczy lib/teren-osiedle.js; modele i ich kolizje
// daje OSR (dziś zaślepki). Tutaj:
//  • CHUNK = JEDNA SIATKA: grunt (prostokąty z maski, atrybut aGrunt = kafel atlasu) + wszystkie modele chunka
//    przepisane przez obrót i przesunięcie → 1 draw call na chunk (+1 w przebiegu cieni). Prefaby modeli w cache (LRU).
//  • kolizje modeli → `solids` (bloki top 99 = ściana, nie do wspinaczki; auta/ławki niskie = da się wskoczyć),
//    maski 1 j. → `OS.nav` (pole przepływu hordy, pociski, „utknął w bryle").
//  • PRZYCINANIE: bryła między kamerą a graczem robi się ażurowa (krata Bayera) — tylko w chunkach przy kamerze
//    (osobny materiał z `discard`; reszta rysuje się bez niego, żeby mobilne GPU zachowały wczesny test głębi).
//  • budowa porcjami: chunki dalej niż 2 od gracza idą do kolejki (1 na klatkę), bliskie — od razu.
const OS = {
  mat: null, matCut: null, tekGruntu: null,
  prefaby: new Map(),                               // klucz typ|opcje → { geo, kolizje } (LRU, OS_PREFABY)
  maski: new Map(),                                 // klucz liczbowy chunka → { nav, sciany } (bez sklejania napisów)
  nav: new TO.Nawigacja(96), navT: 0,               // okno 96 j. ≥ pierścień spawnu + recykling (46 j.)
  kolejka: [], budowane: 0,                         // chunki czekające na budowę w kolejnych klatkach
  ziarno: 1, msChunk: 0, msMax: 0,
  // pociski (kule, noże, Sokowirówka, ziarna karabinu) rozbijają się o bloki, a Kule energii celują tylko w widocznych.
  // false = przelatują przez bryły jak przez regały w Markecie (DEV: HORDA.OS.pociskiStop = false)
  pociskiStop: true,
};
const OS_PREFABY = 256, OS_G0 = 1.55;   // przegląd 30.09: 64 był stale pełny → modele liczone od nowa przy każdym starcie
const osKlucz = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
const osPobierzMaske = (cx, cz) => OS.maski.get(osKlucz(cx, cz)) || null;
const osCutA = { value: new THREE.Vector3() }, osCutB = { value: new THREE.Vector3() }, osGruntU = { value: null };
const _osK = { x: 0, z: 0, L: 0 };
const OS_KAFEL = [0, 1, 2, 3, 1];                   // GRUNT.* → kafel atlasu (pod budynkiem = płyty chodnika)
// ATLAS GRUNTU 2×2 (kafel = 4×4 j., 16 px/j.): trawa, płyty chodnikowe 50 cm, asfalt, ubita ziemia placu zabaw
function osTeksturaGruntu() {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S * 2;
  const g = c.getContext('2d');
  let s = 20250930;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const kafel = (ox, oy, baza, plamki) => {
    g.fillStyle = baza; g.fillRect(ox, oy, S, S);
    for (const [kol, n, w] of plamki) { g.fillStyle = kol; for (let i = 0; i < n; i++) g.fillRect(ox + Math.floor(r() * S), oy + Math.floor(r() * S), w, w); }
  };
  kafel(0, 0, '#93d152', [['#88c64b', 240, 2], ['#a2de60', 180, 2], ['#7cb842', 50, 1]]);
  kafel(S, 0, '#cdc7ba', [['#c3bdb0', 110, 2], ['#d8d3c8', 70, 1]]);
  for (let i = 0; i < 7; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.10)'; g.fillRect(S + 8 * Math.floor(r() * 8), 8 * Math.floor(r() * 8), 8, 8); }
  g.fillStyle = '#a7a194';
  for (let k = 0; k < S; k += 8) { g.fillRect(S + k, 0, 1, S); g.fillRect(S, k, S, 1); }
  kafel(0, S, '#6e7176', [['#64676c', 280, 1], ['#7b7e83', 200, 1], ['#585b60', 36, 2]]);
  kafel(S, S, '#c9a86c', [['#bd9c60', 190, 2], ['#d5b67c', 140, 1], ['#a98b53', 36, 2]]);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// łatka materiału modeli: grunt z atlasu (vGrunt > 0) zamiast mapy modelu; `cut` = przycinanie przy kamerze.
// Łańcuch onBeforeCompile (cień chmur zostaje), własny klucz programu (inaczej three pomyliłby oba warianty).
function osLatka(m, cut) {
  addCloudShadow(m);
  const stary = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (stary) stary.call(m, sh, r);
    // 30.09: materiał z lib/osiedle-rekwizyty.js sam podmienia <map_fragment> (próbka atlasu `_tx` + maska) — wtedy
    // łatka gruntu wchodzi w JEGO próbkę. Dawniej wymagaliśmy <map_fragment> i przy prawdziwych modelach łatka
    // po cichu odpadała: grunt bez tekstury (sama zieleń) i bez przycinania przy kamerze.
    const REK_TX = 'vec4 _tx = texture2D( map, vMapUv );';
    const maMap = sh.fragmentShader.includes('#include <map_fragment>'), maRek = sh.fragmentShader.includes(REK_TX);
    if (!sh.vertexShader.includes('#include <fog_vertex>') || !(maMap || maRek)) return;   // nie wbudowany materiał — bez łatek
    sh.uniforms.uCutA = osCutA; sh.uniforms.uCutB = osCutB; sh.uniforms.uOsGrunt = osGruntU;
    sh.vertexShader = 'attribute float aGrunt;\nvarying float vGrunt;\nvarying vec3 vOsW;\n' + sh.vertexShader.replace('#include <fog_vertex>',
      `#include <fog_vertex>
       vGrunt = aGrunt;
       vOsW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    let f = 'uniform vec3 uCutA;\nuniform vec3 uCutB;\nuniform sampler2D uOsGrunt;\nvarying float vGrunt;\nvarying vec3 vOsW;\n' + sh.fragmentShader;
    if (cut) f = f.replace('void main() {', `void main() {
      // PRZYCINANIE: stożek wokół odcinka kamera → pierś gracza, tylko modele i tylko nad stopami. Stożek ZWĘŻA SIĘ
      // KU KAMERZE (promień ∝ odległości od niej) — wtedy dziura na ekranie ma stały rozmiar ~sylwetki gracza i nie
      // wycina ścian, które go nie zasłaniają (pierwsza wersja, szeroka przy kamerze, ażurowała pół przejścia).
      // Kamera W bryle nie potrzebuje dziury: od środka ściany są tyłem i odpadają w culling.
      // Krata Bayera 4×4 zamiast twardej dziury: w środku zostaje ~1/8 pikseli, brzeg rozpływa się w siatkę.
      if (vGrunt < 0.5) {
        vec3 ab = uCutB - uCutA;
        float t = dot(vOsW - uCutA, ab) / max(dot(ab, ab), 1e-4);
        if (t > 0.0 && t < 0.99 && vOsW.y > uCutB.y - 1.0) {
          float tc = clamp(t, 0.0, 1.0), rr = mix(0.5, 2.1, tc);
          float k = 1.0 - smoothstep(rr * 0.55, rr, length(vOsW - (uCutA + ab * tc)));
          vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
          float b = (q.x < 1.0 ? (q.y < 1.0 ? 0.0 : q.y < 2.0 ? 12.0 : q.y < 3.0 ? 3.0 : 15.0)
                  : q.x < 2.0 ? (q.y < 1.0 ? 8.0 : q.y < 2.0 ? 4.0 : q.y < 3.0 ? 11.0 : 7.0)
                  : q.x < 3.0 ? (q.y < 1.0 ? 2.0 : q.y < 2.0 ? 14.0 : q.y < 3.0 ? 1.0 : 13.0)
                  : (q.y < 1.0 ? 10.0 : q.y < 2.0 ? 6.0 : q.y < 3.0 ? 9.0 : 5.0)) / 16.0 + 0.03;
          if (k * 0.9 > b) discard;
        }
      }`);
    // kafel (kom % 2, kom / 2) liczony od GÓRY płótna — tekstura ma flipY, stąd 1 − wiersz
    const UVG = `float kom = max(vGrunt - 1.0, 0.0);
        vec2 uvG = (vec2(mod(kom, 2.0), 1.0 - floor(kom * 0.5)) + clamp(fract(vOsW.xz * 0.25), 0.008, 0.992)) * 0.5;`;
    sh.fragmentShader = maMap ? f.replace('#include <map_fragment>', `if (vGrunt > 0.5) {
        ${UVG}
        diffuseColor.rgb *= texture2D(uOsGrunt, uvG).rgb;
      } else {
        #include <map_fragment>
      }`)
      : f.replace(REK_TX, `${UVG}
        vec4 _tx = vGrunt > 0.5 ? vec4(texture2D(uOsGrunt, uvG).rgb, 1.0) : texture2D( map, vMapUv );`);
  };
  m.customProgramCacheKey = () => 'osiedle-' + (cut ? 'cut' : 'pel');
  m.needsUpdate = true;
  return m;
}
function osMaterialy() {
  if (OS.mat) return;
  osGruntU.value = OS.tekGruntu = osTeksturaGruntu();
  OS.mat = osLatka(OSR.materialOsiedla(THREE, { nowy: true }), false);    // 30.09: 2 osobne egzemplarze — wspólny dostawał cień chmur 2× (shader się nie kompilował)
  OS.matCut = osLatka(OSR.materialOsiedla(THREE, { nowy: true }), true);
}
// prefab modelu z cache (LRU). Klucz z opcji, które zmieniają bryłę; indeksowaną geometrię rozwijamy (kontrakt: bez indeksu).
function osPrefab(typ, o) {
  const k = typ + '|' + (typ === 'blok' ? `${o.dl}|${o.gl}|${o.pietra}|${o.ziarno}|${o.brama ? o.brama.x + ':' + o.brama.szer : '-'}`
                       : typ === 'garaze' ? `${o.ile}|${o.ziarno}` : typ === 'auto' ? `${o.ziarno}` : '');
  let p = OS.prefaby.get(k);
  if (p) { OS.prefaby.delete(k); OS.prefaby.set(k, p); return p; }
  p = OSR[typ](THREE, o);
  if (p.geo.index) { const g = p.geo.toNonIndexed(); p.geo.dispose(); p.geo = g; }
  if (!p.geo.attributes.normal) p.geo.computeVertexNormals();
  OS.prefaby.set(k, p);
  if (OS.prefaby.size > OS_PREFABY) { const [k0, p0] = OS.prefaby.entries().next().value; p0.geo.dispose(); OS.prefaby.delete(k0); }
  return p;
}
// maska gruntu → prostokąty (zachłannie: najdłuższy odcinek w wierszu, potem w dół, póki cały pasuje)
function osPasyGruntu(grunt) {
  const N = TO.NG, out = [], uz = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N;) {
    const c = j * N + i;
    if (uz[c]) { i++; continue; }
    const t = grunt[c];
    let i1 = i + 1;
    while (i1 < N && !uz[j * N + i1] && grunt[j * N + i1] === t) i1++;
    let j1 = j + 1;
    dol: while (j1 < N) { for (let k = i; k < i1; k++) if (uz[j1 * N + k] || grunt[j1 * N + k] !== t) break dol; j1++; }
    for (let jj = j; jj < j1; jj++) uz.fill(1, jj * N + i, jj * N + i1);
    out.push(i, i1, j, j1, t);
    i = i1;
  }
  return out;
}
function buildChunkOsiedla(cx, cz) {
  const t0 = performance.now();
  osMaterialy();
  const U = TO.ukladChunka(cx, cz, OS.ziarno);
  const lista = U.obiekty.map(o => osPrefab(o.typ, o.opcje));
  const pasy = osPasyGruntu(U.grunt);
  let nV = pasy.length / 5 * 6;
  for (const p of lista) nV += p.geo.attributes.position.count;
  const pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3), uv = new Float32Array(nV * 2),
        col = new Float32Array(nV * 3), gr = new Float32Array(nV);
  let v = 0;
  const K = TO.KROK, y = OS_G0;
  for (let q = 0; q < pasy.length; q += 5) {                // grunt: 2 trójkąty na prostokąt, normalna w górę
    const x0 = U.X0 + pasy[q] * K, x1 = U.X0 + pasy[q + 1] * K, z0 = U.Z0 + pasy[q + 2] * K, z1 = U.Z0 + pasy[q + 3] * K;
    const kaf = 1 + OS_KAFEL[pasy[q + 4]];
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]) {
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      nrm[v * 3 + 1] = 1; col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = 1; gr[v] = kaf;
      v++;
    }
  }
  for (let k = 0; k < U.obiekty.length; k++) {              // modele: obrót o ćwierćobroty + przesunięcie (jak THREE rotation.y)
    const o = U.obiekty[k], G = lista[k].geo, P_ = G.attributes.position, N_ = G.attributes.normal,
          UV = G.attributes.uv, C = G.attributes.color;
    const c = [1, 0, -1, 0][o.obr], s = [0, 1, 0, -1][o.obr];
    for (let i = 0; i < P_.count; i++, v++) {
      const px = P_.getX(i), pz = P_.getZ(i), nx = N_.getX(i), nz = N_.getZ(i);
      pos[v * 3] = o.x + px * c + pz * s; pos[v * 3 + 1] = y + P_.getY(i); pos[v * 3 + 2] = o.z - px * s + pz * c;
      nrm[v * 3] = nx * c + nz * s; nrm[v * 3 + 1] = N_.getY(i); nrm[v * 3 + 2] = -nx * s + nz * c;
      if (UV) { uv[v * 2] = UV.getX(i); uv[v * 2 + 1] = UV.getY(i); }
      if (C) { col[v * 3] = C.getX(i); col[v * 3 + 1] = C.getY(i); col[v * 3 + 2] = C.getZ(i); }
      else col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aGrunt', new THREE.BufferAttribute(gr, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, OS.mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.renderOrder = -2;                                    // E3 K2: świat przed sylwetkami
  scene.add(mesh);
  // KOLIZJE: wysokie (≥ 3,2 j.) i cienkie słupki = ściana (top 99 — nie wskoczysz, horda się nie wspina);
  // reszta = bryła z wierzchem (auto 1,5, garaż 2,6, wiata 2,2, ławka 0,5 — da się na nią wskoczyć)
  const solids = [], bryly = [];
  for (let k = 0; k < U.obiekty.length; k++) for (const kk of lista[k].kolizje) {
    const b = TO.kolizjaWSwiecie(U.obiekty[k], kk);
    bryly.push(b);
    const plocha = b.hw * b.hl * 4;
    solids.push({ x: b.x, z: b.z, hw: b.hw, hl: b.hl, top: (b.wys >= 3.2 || plocha < 0.5) ? 99 : y + b.wys,
                  os: b.wys >= 2 && plocha >= 1.5 });   // os = ściana (spawn, „utknął w bryle")
  }
  const maski = TO.maskiKolizji(bryly, U.X0, U.Z0);
  OS.maski.set(osKlucz(cx, cz), maski);
  const ms = performance.now() - t0;
  OS.msChunk = OS.msChunk ? OS.msChunk * 0.9 + ms * 0.1 : ms; if (ms > OS.msMax) OS.msMax = ms;
  OS.budowane++;
  return { mesh, deco: [], rocks: [], solids, spills: [], grass: null, leaves: [], sway: [], shelves: [], blobRecs: null, cx, cz,
           osiedle: { grunt: U.grunt, X0: U.X0, Z0: U.Z0, cecha: U.cecha, boki: U.boki, n: U.obiekty.length, v: nV } };
}
// KOLEJKA BUDOWY: jeden chunk na klatkę (z pierścienia 3–4 wokół gracza); nieaktualne wpisy odpadają same
function osBudujZKolejki() {
  const pcx = Math.round(P.pos.x / CHUNK), pcz = Math.round(P.pos.z / CHUNK);
  while (OS.kolejka.length) {
    const q = OS.kolejka.shift();
    if (Math.abs(q.cx - pcx) > VIEW || Math.abs(q.cz - pcz) > VIEW || chunkMap.has(q.k)) continue;
    chunkMap.set(q.k, buildChunk(q.cx, q.cz)); _chunkWer++;
    return;
  }
}
// ściana osiedla (blok, garaż, wiata) w punkcie — test ścisły, `m` = margines
// `y` (30.09, przegląd): wysokość punktu — kto stoi/leci NAD wierzchem bryły (dach garażu 2,6 j., wiata 2,2 j.),
// nie jest „w bryle". Bez tego wróg na dachu garażu był teleportowany na ziemię (gracz na dachu = nietykalny),
// a pociski nad garażem ginęły na każdej wysokości.
function osWBryle(x, z, m = 0, y = -Infinity) {
  for (const ch of chunkiWokol(Math.floor(x / CHUNK), Math.floor(z / CHUNK)))
    for (const s of ch.solids) if (s.os && y < s.top - 0.25 && Math.abs(x - s.x) < s.hw + m && Math.abs(z - s.z) < s.hl + m) return true;
  return false;
}
// SPAWN / RECYKLING NIGDY W BRYLE: najbliższa wolna i OSIĄGALNA komórka pola (okno wokół gracza);
// poza oknem — wypchnięcie na najbliższą ścianę (bloki stoją ≥ 3 j. od siebie, więc kilka przejść wystarcza)
function osPoprawPunkt(pos) {
  if (!osWBryle(pos.x, pos.z, 0.4)) return;
  // najpierw komórka, do której gracz ma drogę ≥ 85% pierwotnej odległości (czyli za blokiem, nie na licu od podwórka)
  const r = Math.hypot(pos.x - P.pos.x, pos.z - P.pos.z) * 0.85;
  if (OS.nav.najblizszyWolny(pos.x, pos.z, 14, _osK, r) || OS.nav.najblizszyWolny(pos.x, pos.z, 14, _osK)) {
    pos.x = _osK.x; pos.z = _osK.z;
    if (!osWBryle(pos.x, pos.z, 0.4)) return;
  }
  for (let k = 0; k < 6; k++) {
    let ruch = false;
    for (const ch of chunkiWokol(Math.floor(pos.x / CHUNK), Math.floor(pos.z / CHUNK))) for (const s of ch.solids) {
      if (!s.os) continue;
      const dx = pos.x - s.x, dz = pos.z - s.z, ox = s.hw + 0.6 - Math.abs(dx), oz = s.hl + 0.6 - Math.abs(dz);
      if (ox > 0 && oz > 0) { if (ox < oz) pos.x += dx > 0 ? ox : -ox; else pos.z += dz > 0 ? oz : -oz; ruch = true; }
    }
    if (!ruch) return;
  }
}
const _osP = new THREE.Vector3();
// pole przepływu hordy: co 0,25 s albo po 3 j. ruchu gracza (~0,8 ms na desktopie przy oknie 96²)
function osNawigacjaTick(dt) {
  OS.navT -= dt;
  const N = OS.nav, dx = P.pos.x - N.px, dz = P.pos.z - N.pz;
  if (OS.navT > 0 && dx * dx + dz * dz < 9) return;
  OS.navT = 0.25;
  const t0 = DEV ? performance.now() : 0;
  N.przebuduj(P.pos.x, P.pos.z, osPobierzMaske);
  if (DEV) N.ms = performance.now() - t0;
}
// co render (scene.onBeforeRender): zasięg rysowania chunków (mgła i tak je gasi) + wariant materiału z przycinaniem
// tylko w chunkach, przez które biegnie odcinek kamera → gracz
// (forEach ze stałą funkcją i stanem w `_osKl` — bez iteratora i domknięcia na klatkę)
const _osKl = { cx: 0, cz: 0, far2: 0, cut: false, x0: 0, x1: 0, z0: 0, z1: 0 };
function osKlatkaChunk(ch) {
  if (!ch.osiedle) return;
  const K = _osKl, dx = ch.cx * CHUNK - K.cx, dz = ch.cz * CHUNK - K.cz;
  ch.mesh.visible = dx * dx + dz * dz < K.far2;
  const X0 = ch.cx * CHUNK - CHUNK / 2, Z0 = ch.cz * CHUNK - CHUNK / 2;
  const m = K.cut && X0 < K.x1 && X0 + CHUNK > K.x0 && Z0 < K.z1 && Z0 + CHUNK > K.z0 ? OS.matCut : OS.mat;
  if (ch.mesh.material !== m) ch.mesh.material = m;
}
function osKlatka() {
  if (!MAPS[mapKey].osiedle || !OS.mat) return;
  const cam = camera.position, px = P.pos.x, pz = P.pos.z, far = MAPS[mapKey].fog[1] + 34, K = _osKl;
  osCutA.value.copy(cam); osCutB.value.set(px, P.y + 1.3, pz);
  K.cut = G.running && !(G.fps && G.fps.on);                // z oczu (karabin) i w menu nie przycinamy
  K.cx = cam.x; K.cz = cam.z; K.far2 = far * far;
  K.x0 = Math.min(cam.x, px) - 4; K.x1 = Math.max(cam.x, px) + 4; K.z0 = Math.min(cam.z, pz) - 4; K.z1 = Math.max(cam.z, pz) + 4;
  chunkMap.forEach(osKlatkaChunk);
}
// trawa (kępki) tylko na trawnikach — z maski gruntu chunka (ostatni chunk w pamięci podręcznej)
let _osGrCh = null, _osGrKx = 1e9, _osGrKz = 1e9;
function osTrawa(x, z) {
  const kx = Math.round(x / CHUNK), kz = Math.round(z / CHUNK);
  if (kx !== _osGrKx || kz !== _osGrKz) { _osGrKx = kx; _osGrKz = kz; _osGrCh = chunkMap.get(kx + ',' + kz) || null; }
  const O = _osGrCh && _osGrCh.osiedle;
  return !!O && TO.gruntW(O.grunt, O.X0, O.Z0, x, z) === TO.GRUNT.TRAWA;
}
// DEV/bot: omijanie ścian (bot nie skacze, więc auta i ławki też są dla niego ścianą) + wyjście z utknięcia
const _botOs = { t: 0, px: 0, pz: 0, uc: 0, ux: 0, uz: 0 };
function osBotOmin(wx, wz) {
  const l = Math.hypot(wx, wz) || 1;
  let ux = wx / l, uz = wz / l;
  if (G.time < _botOs.t) _botOs.t = _botOs.uc = 0;           // nowy bieg
  if (G.time - _botOs.t > 1) {                               // co 1 s: czy ruszył się choć o 0,8 j.?
    if (Math.hypot(P.pos.x - _botOs.px, P.pos.z - _botOs.pz) < 0.8 && _botOs.t > 0) {
      const a = Math.random() * Math.PI * 2; _botOs.uc = 1.2; _botOs.ux = Math.sin(a); _botOs.uz = Math.cos(a);
    }
    _botOs.t = G.time; _botOs.px = P.pos.x; _botOs.pz = P.pos.z;
  }
  if (_botOs.uc > 0) { _botOs.uc -= 1 / 30; ux = _botOs.ux; uz = _botOs.uz; }
  const N = OS.nav;
  for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.2, -2.2, 3.1]) {
    const c = Math.cos(a * BOT.kier), s = Math.sin(a * BOT.kier), dx = ux * c - uz * s, dz = ux * s + uz * c;
    if (N.kodW(P.pos.x + dx * 0.9, P.pos.z + dz * 0.9) || N.kodW(P.pos.x + dx * 1.8, P.pos.z + dz * 1.8) || N.kodW(P.pos.x + dx * 2.7, P.pos.z + dz * 2.7)) continue;
    if (a && _botOs.uc > 0) { _botOs.ux = dx; _botOs.uz = dz; }
    return { x: dx, z: dz };
  }
  return { x: ux, z: uz };
}

// ═══════════════ PUŁAPKI ŚRODOWISKOWE (mapa „Wąwozy") ═══════════════
// Trzy rzeczy, wszystkie liczone z samej funkcji terenu (nic nie trzeba rozsiewać po mapie):
//  1. NURT — w korycie spycha w dół rzeki, tym mocniej, im głębiej. Horda idzie prosto na
//     gracza, więc wchodzi w wodę i zbija się w korycie — to jest narzędzie DLA gracza.
//  2. BŁOTO — pas przy wodzie spowalnia; gracz może go obiec, horda nie.
//  3. OSUWISKO — na ścianie stromszej niż ~49° zjeżdżasz w dół zamiast iść w górę. Dzięki temu
//     wąwóz ma wejścia i wyjścia tylko tam, gdzie ściana jest łagodna — i to jest mapa.
// Wszystko działa TYLKO na ziemi (`!P.airborne`), żeby skok zostawał ucieczką.
const _pw = [0, 0];
function pulapkiWawozu(dt) {
  const x = P.pos.x, z = P.pos.z;
  TW.spychanieNurtu(x, z, _pw);
  if (_pw[0] || _pw[1]) {
    P.pos.x += _pw[0] * NURT_SILA * dt;
    P.pos.z += _pw[1] * NURT_SILA * dt;
  }
  const blot = TW.wspolczynnikBlota(x, z);
  if (blot > 0) {                                  // cofnięcie części ruchu = spowolnienie
    const h = blot * BLOTO_SLOW * dt;
    P.pos.x -= P.vx * h; P.pos.z -= P.vz * h;
  }
  if (TW.czyOsuwisko(x, z)) {
    TW.normalna(x, z, _nOs);
    // zjazd w dół stoku: składowa pozioma normalnej pokazuje, gdzie jest „w dół"
    P.pos.x += _nOs[0] * OSUW_SILA * dt;
    P.pos.z += _nOs[2] * OSUW_SILA * dt;
    if (!G.osuwOstatnio) { G.osuwOstatnio = 1; AUDIO.sfx('krok'); }
  } else G.osuwOstatnio = 0;
}
const _nOs = [0, 0, 0];
// Mocniej po teście właściciela („pułapki słabe"): nurt znosił gracza ledwie 0,85 j./s przy
// biegu 8 j./s — nikt tego nie czuł. 2.6 → ~2,3 j./s w głębi koryta: da się przejść rzekę
// ukośnie, ale znosi wyraźnie. Na hordę działa MOCNIEJ (NURT_WROG), bo ona idzie prosto
// i nie kontruje — rzeka ma być narzędziem gracza przeciw niej.
const NURT_SILA = 2.6, BLOTO_SLOW = 0.75, OSUW_SILA = 5.2, NURT_WROG = 3.4, BLOTO_WROG = 0.55;
const _pwE = [0, 0];

// ═══════════════ GŁAZY NA KRAWĘDZIACH — cel mapy „Wąwozy" ═══════════════
// Właściciel: „nudno, brak celu". Na krawędziach kanionów leżą luźne głazy; gracz podbiega,
// wpycha je za krawędź, głaz toczy się w dół stoku (grawitacja po normalnej terenu, prawdziwy
// spadek z urwiska) i MIAŻDŻY hordę na swojej drodze. Horda idzie prosto na gracza, więc schodzi
// za nim do kanionu — zwabić ją na dno i zrzucić głaz z góry to jest ta rozgrywka.
// Pula wokół gracza (maks. GLAZ_MAX leżących w pierścieniu 18-60 j.), nie per chunk — głazów jest
// kilka, a pozycję krawędzi daje sam moduł terenu (`TW.czyRant`), więc nic nie trzeba zapisywać.
// Głaz rani TYLKO wrogów — to narzędzie gracza, nie kolejna pułapka na niego.
const GLAZ_MAX = 5, GLAZ_GRAW = 24, GLAZ_TARCIE = 0.30;
const glazyRantu = [];                              // {mesh, x,y,z, vx,vy,vz, r, stan, t, obrot, trafieni}
let _glazSzukT = 0, _glazPodpowiedz = false;
const _gAx = new THREE.Vector3(), _gQ = new THREE.Quaternion(), _nG = [0, 0, 0];
function usunGlazyRantu() {
  for (const b of glazyRantu) scene.remove(b.mesh);
  glazyRantu.length = 0; _glazSzukT = 0; _glazPodpowiedz = false;
}
function postawGlazRantu() {
  const mdl = NATURA && NATURA.wg && NATURA.wg['Rock_Medium_2'];
  if (!mdl) return;
  for (let proba = 0; proba < 14; proba++) {
    const a = Math.random() * 6.283, r = 18 + Math.random() * 42;
    const x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
    if (!TW.czyRant(x, z)) continue;
    if (glazyRantu.some(b => Math.hypot(b.x - x, b.z - z) < 14)) continue;
    const sk = 1.5 + Math.random() * 0.7;           // głaz ~1.5-2.2 j. wysoki (postać ma ~2 j.)
    const mesh = new THREE.Mesh(mdl.geo, naturaMat);
    mesh.scale.setScalar(sk);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const rad = sk * mdl.r * 0.9;
    const y = gruntDoSadzenia(x, z);
    mesh.position.set(x, y - 0.1, z);
    scene.add(mesh);
    glazyRantu.push({ mesh, x, y, z, vx: 0, vy: 0, vz: 0, r: rad, h: sk, stan: 'lezy', t: 0,
                      trafieni: new Set() });
    return;
  }
}
function updateGlazyRantu(dt) {
  if (!MAPS[mapKey].rzeki) { if (glazyRantu.length) usunGlazyRantu(); return; }
  _glazSzukT -= dt;
  if (_glazSzukT <= 0) {
    _glazSzukT = 1.5;
    for (let i = glazyRantu.length - 1; i >= 0; i--) {   // za daleko — sprzątamy
      const b = glazyRantu[i];
      if (Math.hypot(b.x - P.pos.x, b.z - P.pos.z) > 95) { scene.remove(b.mesh); glazyRantu.splice(i, 1); }
    }
    if (glazyRantu.filter(b => b.stan === 'lezy').length < GLAZ_MAX) postawGlazRantu();
  }
  for (let i = glazyRantu.length - 1; i >= 0; i--) {
    const b = glazyRantu[i];
    if (b.stan === 'lezy') {
      // PODPOWIEDŹ raz na bieg, gdy pierwszy głaz jest blisko
      if (!_glazPodpowiedz && Math.hypot(b.x - P.pos.x, b.z - P.pos.z) < 22) {
        _glazPodpowiedz = true;
        toastBuff(T('Głaz na krawędzi — wepchnij go w wąwóz na hordę!', 'Boulder on the edge — shove it down onto the horde!'));
        setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 3200);
      }
      // PCHNIĘCIE: gracz dotyka głazu i biegnie w jego stronę
      const dx = b.x - P.pos.x, dz = b.z - P.pos.z, d = Math.hypot(dx, dz) || 1e-3;
      if (d < b.r + 0.75 && Math.abs(P.y - b.y) < 1.8) {
        const wStrone = (P.vx * dx + P.vz * dz) / d;
        if (wStrone > 1.2) {
          TW.normalna(b.x, b.z, _nG);
          b.vx = dx / d * 6 + _nG[0] * 4; b.vz = dz / d * 6 + _nG[2] * 4;
          b.stan = 'toczy'; b.t = 0;
          AUDIO.sfx('skok'); G.shake = Math.max(G.shake, 0.15);
        } else {                                    // stoi jak ściana — gracz nie przenika głazu
          P.pos.x = b.x - dx / d * (b.r + 0.75); P.pos.z = b.z - dz / d * (b.r + 0.75);
        }
      }
      continue;
    }
    if (b.stan === 'toczy') {
      b.t += dt;
      TW.normalna(b.x, b.z, _nG);
      const grunt = gruntDoSadzenia(b.x, b.z);
      const naZiemi = b.y <= grunt + 0.05;
      if (naZiemi) {                                // toczenie: grawitacja wzdłuż stoku + tarcie
        b.vx += _nG[0] * GLAZ_GRAW * dt; b.vz += _nG[2] * GLAZ_GRAW * dt;
        const f = Math.max(0, 1 - GLAZ_TARCIE * dt);
        b.vx *= f; b.vz *= f;
      }
      b.vy -= GLAZ_GRAW * dt;
      b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
      const g2 = gruntDoSadzenia(b.x, b.z);
      if (b.y < g2) {                                // uderzenie w ziemię: odbicie z utratą energii
        if (b.vy < -8) G.shake = Math.max(G.shake, 0.3);
        b.y = g2; b.vy = Math.max(0, -b.vy * 0.25);
      }
      const v = Math.hypot(b.vx, b.vz);
      // obrót jak prawdziwe toczenie: oś prostopadła do ruchu, kąt = droga / promień
      if (v > 0.05) {
        _gAx.set(b.vz, 0, -b.vx).normalize();
        _gQ.setFromAxisAngle(_gAx, v / b.r * dt);
        b.mesh.quaternion.premultiply(_gQ);
      }
      b.mesh.position.set(b.x, b.y + b.r * 0.55, b.z);
      // MIAŻDŻENIE hordy: szybki głaz zabija zwykłych, bossa tylko rani
      if (v > 2.5) {
        for (const e of G.enemies) {
          if (e.dying || b.trafieni.has(e)) continue;
          const ex = e.pos.x - b.x, ez = e.pos.z - b.z, ed = Math.hypot(ex, ez);
          if (ed > b.r + 0.7 || Math.abs(e.ty - b.y) > 2.6) continue;
          b.trafieni.add(e);
          const mx = e.maxHp || e.hp;
          zadajDmg(e, (e.T.boss || e.kapral) ? mx * 0.15 : mx * 1.3, { zr: 'glaz', bezSkali: true });
          if (!e.T.bezKb) e.kb.set(ex / (ed || 1) * 16, 0, ez / (ed || 1) * 16);
          if (b.trafieni.size === 1) AUDIO.sfx('wybuch');
          if (b.trafieni.size % 5 === 0) dmgPop(b.x, b.y + 2, b.z, 'x' + b.trafieni.size, '#ffd24a', 1.3);
        }
      }
      if ((b.t > 1.2 && v < 0.7 && b.y <= g2 + 0.05) || b.t > 14) { b.stan = 'kruszy'; b.t = 0; }
      continue;
    }
    // KRUSZENIE: głaz się zatrzymał — zapada się w ziemię i znika
    b.t += dt;
    b.mesh.position.y -= dt * 1.2;
    b.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 1.6));
    if (b.t > 0.9) { scene.remove(b.mesh); glazyRantu.splice(i, 1); }
  }
}

// ── LIMIT STROMIZNY (mapa „Wąwozy") ──────────────────────────────────────────────────────────
// Właściciel: „jak jest bardzo stromo, to może wyjść, a chyba nie powinien". Zmierzone: pod ścianą
// 79,5° gracz szedł prosto w górę i w 3 s zyskiwał 3,2 j. wysokości — kanion był dekoracją, nie
// terenem. Teraz wygaszamy składową prędkości SKIEROWANĄ POD GÓRĘ: do 35° bez zmian, 35→45°
// liniowo do zera, powyżej 45° zero. W dół i W POPRZEK biegniesz normalnie, więc ścianę da się
// trawersować i szukać zejścia — to jest ta rozgrywka, o którą chodziło.
// SKOK TEGO NIE DOTYCZY (`!P.airborne` w wywołaniu): wskoczenie na półkę zostaje umiejętnością.
// Tylko ta mapa: na Łąkach mesy mają być zdobywane pieszo (wolno) — to stara decyzja właściciela.
const STROM_OD = 0.70, STROM_DO = 1.00;            // tangens nachylenia: 35° i 45°
function ograniczStromizne() {
  const x = P.pos.x, z = P.pos.z, E = 0.6;
  const hx = (terrainH(x + E, z) - terrainH(x - E, z)) / (2 * E);
  const hz = (terrainH(x, z + E) - terrainH(x, z - E)) / (2 * E);
  const s = Math.hypot(hx, hz);
  if (s <= STROM_OD) return;
  const wGore = (P.vx * hx + P.vz * hz) / s;       // rzut prędkości na kierunek „pod górę"
  if (wGore <= 0) return;                          // zjazd i trawers zostają nietknięte
  const zostaw = Math.max(0, (STROM_DO - s) / (STROM_DO - STROM_OD));
  const ile = wGore * (1 - zostaw);
  P.vx -= (hx / s) * ile;
  P.vz -= (hz / s) * ile;
}

// czy punkt jest na rozlanej wodzie (market) — wtedy ŚLIZG
function onSpill(x, z) {
  for (const ch of chunkiWokol(Math.floor(x / CHUNK), Math.floor(z / CHUNK))) {
    if (!ch.spills.length) continue;
    for (const s of ch.spills) {
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < s.r * s.r) return true;
    }
  }
  return false;
}

// ---- kolizje ze SOLIDAMI (regały-AABB, pnie/głazy-okręgi) ----
// zwraca wysokość NAJWYŻSZEJ przeszkody, która zablokowała (0 = nic) — do wspinaczki
function solveSolids(pos, r, feetY) {
  let blockTop = 0;
  for (const ch of chunkiWokol(Math.floor(pos.x / CHUNK), Math.floor(pos.z / CHUNK))) {
    const lista = ch.solids.siatka ? mkKomorka(ch.solids.siatka, pos.x, pos.z) : ch.solids;   // market: siatka brył
    if (!lista.length) continue;
    for (const s of lista) {
      if (feetY > s.top - 0.25) continue;         // jesteś NAD przeszkodą
      if (s.c) {
        const dx = pos.x - s.x, dz = pos.z - s.z, rr = s.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), p = (rr - d) / d;
          pos.x += dx * p; pos.z += dz * p;
          if (s.top < 90) blockTop = Math.max(blockTop, s.top);
        }
      } else {
        const dx = pos.x - s.x, dz = pos.z - s.z;
        const ox = s.hw + r - Math.abs(dx), oz = s.hl + r - Math.abs(dz);
        if (ox > 0 && oz > 0) {
          if (ox < oz) pos.x += (dx > 0 ? ox : -ox);
          else pos.z += (dz > 0 ? oz : -oz);
          // top ≥ 90 = ściana bez wierzchu (blok osiedla, słupek) — jak pnie drzew: nie do wspinaczki
          if (s.top < 90) blockTop = Math.max(blockTop, s.top);
        }
      }
    }
  }
  return blockTop;
}
// wysokość podparcia: teren LUB szczyt regału, na którym stoisz
function supportY(x, z, feetY) {
  let g = terrainH(x, z);
  for (const ch of chunkiWokol(Math.floor(x / CHUNK), Math.floor(z / CHUNK))) {
    const lista = ch.solids.siatka ? mkKomorka(ch.solids.siatka, x, z) : ch.solids;   // market: siatka brył
    if (!lista.length) continue;
    for (const s of lista) {
      if (s.c || s.top > feetY + 0.25) continue;
      if (Math.abs(x - s.x) < s.hw && Math.abs(z - s.z) < s.hl) g = Math.max(g, s.top);
    }
  }
  return g;
}
let chunkMat = null, chunkMatIndoor = null;   // tworzone w boot
let lastCC = null;
function rebuildWorld() {
  for (const [, ch] of chunkMap) {
    scene.remove(ch.mesh); ch.mesh.geometry.dispose();
    for (const m of ch.deco) scene.remove(m);
    // InstancedMesh trzyma wlasny instanceMatrix w buforze GL, ktorego samo `remove`
  // NIE zwalnia (three trzyma atrybuty w WeakMap, a ta nie odpala finalizerow).
  // Geometrii i materialow dispose'owac NIE WOLNO — sa wspoldzielone miedzy chunkami.
  // Wyjątek: zlana siatka drewna drzew (`wlasnaGeo`) należy do chunka — ją zwalniamy.
  for (const m of ch.rocks) { scene.remove(m); if (m.isInstancedMesh) m.dispose(); if (m.wlasnaGeo) m.geometry.dispose(); }
    if (ch.grass) { scene.remove(ch.grass); ch.grass.dispose(); }
    if (ch.leaves) for (const l of ch.leaves) { scene.remove(l); l.dispose(); }
  }
  chunkMap.clear(); _chunkWer++;
  OS.maski.clear(); OS.kolejka.length = 0; OS.nav.reset(); OS.navT = 0;   // osiedle: maski, kolejka, pole hordy
  _osGrKx = 1e9;
  lastCC = null;
  ensureChunks(true);                              // start / zmiana mapy: cały świat od razu (ekran przejścia)
}
function setMap(key) {
  mapKey = key;
  const M = MAPS[key];
  scene.background.setHex(M.sky);                  // awaryjne tło pod kopułą nieba
  setSky(key);                                     // gradient nieba per mapa (dol == M.sky!)
  scene.fog.color.setHex(M.sky);
  scene.fog.near = M.fog[0]; scene.fog.far = M.fog[1];
  water.visible = M.water && !M.rzeki;
  // W markecie ZADEN obiekt nie ma castShadow, wiec cala shadow mapa (PCFSoft
  // 2048^2) liczyla sie po nic. Zmierzone: 6.68 -> 4.82 ms renderu przy 500 wrogach.
  sun.castShadow = !M.indoor;
  for (const c of clouds) c.m.visible = !M.indoor;
  rebuildWorld();
  grassCenter.set(1e9, 1e9);
  updateGrassField();
  for (const c of chests) placeChest(c);
  ustawWygladGarnkow(key);          // garnek na Łąkach / witryna chłodnicza w markecie
  for (const t of totems) placeTotem(t);
}
// `natychmiast` = wszystko w tej klatce (start, zmiana mapy). Osiedle w biegu: chunki dalej niż 2 od gracza idą
// do kolejki (1 na klatkę) — chunk osiedla to kilka tysięcy wierzchołków do przepisania, a przejście granicy
// dokłada rząd 9 chunków naraz. Market (30.09) tak samo: chunk ~0,6 ms, rząd 9 chunków = ~6 ms naraz. Pozostałe mapy bez zmian.
function ensureChunks(natychmiast = false) {
  const kolejkuj = !natychmiast && (MAPS[mapKey].osiedle || MAPS[mapKey].indoor);
  if (kolejkuj && OS.kolejka.length) osBudujZKolejki();
  const pcx = Math.round(P.pos.x / CHUNK), pcz = Math.round(P.pos.z / CHUNK);
  const cc = pcx + ',' + pcz;
  if (cc === lastCC) return;
  lastCC = cc;
  const keep = new Set();
  for (let cx = pcx - VIEW; cx <= pcx + VIEW; cx++)
    for (let cz = pcz - VIEW; cz <= pcz + VIEW; cz++) {
      const key = cx + ',' + cz;
      keep.add(key);
      if (chunkMap.has(key)) continue;
      if (kolejkuj && Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > 2) { OS.kolejka.push({ cx, cz, k: key }); continue; }
      chunkMap.set(key, buildChunk(cx, cz)); _chunkWer++;
    }
  for (const [key, ch] of chunkMap) {
    if (keep.has(key)) continue;
    if (ch.osiedle || ch.mesh.userData.mk) OS.maski.delete(osKlucz(ch.cx, ch.cz));   // market (30.09) też ma maski pola hordy
    scene.remove(ch.mesh); ch.mesh.geometry.dispose();
    for (const m of ch.deco) scene.remove(m);
    // InstancedMesh trzyma wlasny instanceMatrix w buforze GL, ktorego samo `remove`
  // NIE zwalnia (three trzyma atrybuty w WeakMap, a ta nie odpala finalizerow).
  // Geometrii i materialow dispose'owac NIE WOLNO — sa wspoldzielone miedzy chunkami.
  for (const m of ch.rocks) { scene.remove(m); if (m.isInstancedMesh) m.dispose(); if (m.wlasnaGeo) m.geometry.dispose(); }
    if (ch.grass) { scene.remove(ch.grass); ch.grass.dispose(); }
    if (ch.leaves) for (const l of ch.leaves) { scene.remove(l); l.dispose(); }
    chunkMap.delete(key); _chunkWer++;
  }
  rebuildBlobs();                                // plamki cienia wszystkich chunków = 1 InstancedMesh
}

// ============================== SKRZYNIE I KAPLICZKI 3D (30.09, lib/modele-skrzynie.js) ==============================
// Sprite'y skrzyń (chest0..3.png) i billboard garnka (garnek_nonny.png) zastąpione modelami 3D z kodu.
// Logika gry bez zmian: obiekty dalej mają `mesh` (teraz NOŚNIK pozycji poza sceną, jak w pulach E1),
// `pos`, `opened`/`active`/`cd`; rysuje je `syncSkrzynie3D()` w `syncInstancje` — instancjami
// (1 draw call na część modelu: 9 skrzynek = 2 dc + 2 w cieniu). Otwarcie kufra (złota, kapral):
// wieko odskakuje, świat na 0,3 s w hitstopie, a nakładka jackpotu/broni wchodzi dopiero po wieku.
// W trybie „szybkim" (bot, prefers-reduced-motion, ?szybko=1) nakładka od razu, jak dotąd.
let SK = null;                                     // { mat, ef, z: { skrzynka, zlota, kapral, garnek, witryna } } (boot)
const SK_OTW = [];                                 // otwierane kufry: { m, x, y, z, yaw, dy0, t, cb, zrobione, znika }
const SK_SKALA = { skrzynka: 1.25, zlota: 1.2, kapral: 1.2, garnek: 1.0, witryna: 1.0 };   // kopiec skrzynki musi wystawać ponad dywan trawy
// LOSOWOŚĆ EFEKTÓW NIE BIERZE Math.random: bot podmienia Math.random na strumień z seedem (botBieg), a iskry i para
// losują co klatkę — przesuwałyby ten strumień i wyniki bota przestałyby się zgadzać z pomiarami sprzed modeli 3D.
let _skS = 0x2f6b5a1d;
const skLos = () => { _skS = (_skS + 0x6D2B79F5) | 0; let t = Math.imul(_skS ^ (_skS >>> 15), 1 | _skS); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const skKat = (x, z) => { const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return (h - Math.floor(h)) * Math.PI * 2; };   // obrót z pozycji (bez losowania)
function initSkrzynie3D() {
  const mat = MS.materialSkrzyn(THREE, { czas: windU, chmury: { tex: cloudShadowU, off: cloudOffU, skala: CLOUD_SCALE } });
  // pojemności z zapasem: wzrost zestawu = nowa InstancedMesh = UUID three = 4 × Math.random w czasie renderu (patrz „STRUMIEŃ BOTA")
  const Z = (n, cap) => new MS.ZestawModeli(THREE, scene, MS.model(THREE, n), mat, { cap });
  SK = { mat, ef: new MS.EfektySkrzyn(THREE, scene, { czas: windU }),
         z: { skrzynka: Z('skrzynka', 12), zlota: Z('zlota', 4), kapral: Z('kapral', 14), garnek: Z('garnek', 6), witryna: Z('witryna', 6) } };
}
// najniższy grunt pod podstawą (środek + 4 rogi) — na stoku Wąwozów bryła wchodzi w zbocze zamiast wisieć
function gruntPod(x, z, r) {
  let h = terrainH(x, z);
  for (const [dx, dz] of [[r, r], [-r, r], [r, -r], [-r, -r]]) h = Math.min(h, terrainH(x + dx * 0.7, z + dz * 0.7));
  return h - 0.03;
}
// wysokość podstawy z pamięcią: liczona od nowa tylko, gdy obiekt zmienił miejsce (także gdy scenariusz testera
// przestawi `pos` ręcznie, bez placeChest/placeTotem)
function yPod(o, r) {
  if (o._yx !== o.pos.x || o._yz !== o.pos.z) { o.y0 = gruntPod(o.pos.x, o.pos.z, r); o._yx = o.pos.x; o._yz = o.pos.z; }
  return o.y0;
}
// kufer otwiera się TERAZ, `cb` (nakładka) po wieku; w trybie szybkim `cb` od razu (bot, reduced motion)
function otworzKufer3D(m, pos, tIdle, cb) {
  const szybko = skrzyniaSzybka(), u = MS.ANIM.unoszenie(tIdle);
  // wysokość jak u unoszącego się kufra (terrainH), inaczej na stoku kufer podskakiwał o kilka cm w chwili zebrania
  const o = { m, x: pos.x, z: pos.z, y: terrainH(pos.x, pos.z), yaw: camYaw + u.yaw, dy0: u.dy, t: szybko ? MS.ANIM.CZAS_OTWARCIA : 0,
              cb, zrobione: szybko, znika: -1 };
  SK_OTW.push(o);
  if (SK) {
    const kol = m === 'kapral' ? MS.KOLORY.iskraKapral : MS.KOLORY.iskraZlota;
    for (let k = 0; k < 20; k++) {
      const a = k / 20 * Math.PI * 2;
      SK.ef.emituj('iskra', pos.x, o.y + 1.0, pos.z, { vx: Math.cos(a) * 2.4, vz: Math.sin(a) * 2.4, vy: 2 + skLos() * 1.6, s0: 0.26, s1: 0.12, zycie: 0.9, kol, a: 1.3 });
    }
  }
  if (szybko) { cb(); return; }
  G.hitstop = Math.max(G.hitstop, MS.ANIM.CZAS_OTWARCIA + 0.02);   // świat prawie staje, wieko leci w czasie realnym
  G.skrzOchr = Math.max(G.skrzOchr || -1, G.time + 0.1);   // w hitstopie ≈ 0,7 s realnie: kontakt z hordą nie zabiera serca, zanim wejdzie nakładka
}
// co klatkę `update` (czas REALNY, bez hitstopu): otwarcia, emisja pary i iskier, ruch cząstek
function updateSkrzynie3D(dtR) {
  if (!SK) return;
  for (let i = SK_OTW.length - 1; i >= 0; i--) {
    const o = SK_OTW[i];
    if (o.zrobione && o.znika < 0) o.znika = 0;    // pierwsza klatka PO nakładce (albo gdy nakładka nie weszła)
    o.t += dtR;
    if (!o.zrobione && o.t >= MS.ANIM.CZAS_OTWARCIA) { o.zrobione = true; o.cb(); }
    if (o.znika >= 0 && (o.znika += dtR) > 0.45) SK_OTW.splice(i, 1);
  }
  const ef = SK.ef, R = skLos;
  if (wchest.active) {                             // iskry wokół złotej
    if (R() < dtR * 7) { const a = R() * 6.283, r = 0.6 + R() * 0.7; ef.emituj('iskra', wchest.pos.x + Math.cos(a) * r, wchest.y0 + 0.3 + R() * 1.0, wchest.pos.z + Math.sin(a) * r, { vy: 0.7, s0: 0.16, s1: 0.22, zycie: 1.1, kol: MS.KOLORY.iskraZlota, a: 1 }); }
  }
  for (const c of G.skrzynieKap) if (R() < dtR * 5) {
    const a = R() * 6.283, r = 0.6 + R() * 0.6;
    ef.emituj('iskra', c.pos.x + Math.cos(a) * r, terrainH(c.pos.x, c.pos.z) + 0.3 + R() * 1.0, c.pos.z + Math.sin(a) * r, { vy: 0.7, s0: 0.16, s1: 0.22, zycie: 1.1, kol: MS.KOLORY.iskraKapral, a: 1 });
  }
  const indoor = MAPS[mapKey].indoor, mdl = MS.model(THREE, 'garnek');
  for (const t of totems) {
    if (P.pos.distanceToSquared(t.pos) > 60 * 60) continue;
    if (indoor) {                                  // witryna: chłodna mgiełka przy półce, gdy działa
      if (t.cd <= 0 && R() < dtR * 2.5) ef.emituj('para', t.pos.x + Math.sin(t.yaw) * 0.55 + (R() - 0.5) * 1.2, t.y0 + 0.35, t.pos.z + Math.cos(t.yaw) * 0.55, { vy: 0.15, s0: 0.2, s1: 0.5, zycie: 1.8, a: 0.35, kol: 0xcfeeff });
      continue;
    }
    if (t.cd > 0 && G.time - (t.dotyk || -9) > 1.2) continue;   // zgaszony garnek nie paruje
    const c = Math.cos(t.yaw), s = Math.sin(t.yaw), p = mdl.para, w = MS.ANIM.pokrywka(windU.value, t.faza);
    const px = t.pos.x + p[0] * c + p[2] * s, pz = t.pos.z - p[0] * s + p[2] * c;
    if (R() < dtR * 3.2 || (w.buch && R() < 0.4)) ef.emituj('para', px + (R() - 0.5) * 0.3, t.y0 + p[1], pz + (R() - 0.5) * 0.3, { vy: 0.8 + R() * 0.4, s0: 0.2, s1: 0.58, zycie: 1.3, a: 0.62 });
  }
  ef.aktualizuj(dtR);
}
// rysowanie (przed KAŻDYM renderem, także na pauzie): stany → instancje
function syncSkrzynie3D() {
  if (!SK) return;
  const A = MS.ANIM, tt = windU.value, Z = SK.z, ef = SK.ef, K = MS.KOLORY;
  for (const k in Z) Z[k].begin();
  ef.begin();
  const bezCieni = MAPS[mapKey].indoor;            // market: bez mapy cieni → miękkie cienie kontaktowe pod bryłami
  SK.mat.userData.U.uChmury.value = bezCieni ? 0 : 1;
  // zwykłe skrzynki: kopiec warzyw podskakuje; po zebraniu kopiec wyskakuje i znika, skrzynka zostaje pusta
  for (const c of chests) {
    yPod(c, 0.7);
    if (bezCieni) ef.cienKontaktowy(c.pos.x, c.y0 + 0.05, c.pos.z, 0.95, 0.72, c.yaw);
    const s = { x: c.pos.x, y: c.y0, z: c.pos.z, yaw: c.yaw, skala: SK_SKALA.skrzynka, faza: c.faza, polysk: 0.5, czesci: {} };
    if (c.opened) {
      const p = A.podskok(c.t * 0.8), k = A.kopiecZebrany(c.t);
      s.y += p.dy * 0.4; s.sy = p.sy; s.sxz = p.sxz;
      s.czesci.zawartosc = k ? { dy: k.dy, s: k.s, sy: k.sy } : { ukryj: true };
    } else { const k = A.kopiec(tt + c.faza * 3); s.czesci.zawartosc = { dy: k.dy, s: k.s, sy: k.sy }; }
    Z.skrzynka.dodaj(s);
  }
  // złota i Skrzynie Kaprala: unoszą się, kołyszą frontem do kamery, co ~2,6 s uchylają wieko (światło z wnętrza)
  const kufer = (m, x, y, z, t0, kol) => {
    const u = A.unoszenie(t0);
    if (bezCieni) ef.cienKontaktowy(x, y + 0.05, z, 0.85 - u.dy * 0.8, 0.6 - u.dy * 0.6, camYaw + u.yaw);   // cień maleje, gdy kufer się unosi
    Z[m].dodaj({ x, y: y + u.dy, z, yaw: camYaw + u.yaw, skala: SK_SKALA[m], sw: u.sw, czesci: { wieko: { rx: u.wieko } } });
    ef.blaskNaZiemi(x, y + 0.06, z, kol, 0.5 + 0.2 * u.sw, 2.0);
    ef.promien(x, y, z, kol, 0.8 + 0.25 * Math.sin(tt * 3.1));
  };
  if (wchest.active) kufer('zlota', wchest.pos.x, wchest.y0, wchest.pos.z, wchest.t, K.zlota);
  for (const c of G.skrzynieKap) kufer('kapral', c.pos.x, terrainH(c.pos.x, c.pos.z), c.pos.z, c.t, K.kapral);
  for (const o of SK_OTW) {                        // otwierane: wieko odskakuje, błysk, po nakładce kurczy się i znika
    const mdl = MS.model(THREE, o.m), p = A.podskok(o.t), bl = Math.max(0, 1 - o.t / 0.6), kol = o.m === 'kapral' ? K.kapral : K.zlota;
    const zn = o.znika >= 0 ? Math.max(0, 1 - o.znika / 0.45) : 1, zs = zn * zn * (3 - 2 * zn);
    Z[o.m].dodaj({ x: o.x, y: o.y + o.dy0 + p.dy + (1 - zs) * 0.5, z: o.z, yaw: o.yaw, skala: SK_SKALA[o.m] * zs, sy: p.sy, sxz: p.sxz, sw: 1.2 + 1.8 * bl,
                   czesci: { wieko: { rx: A.wieko(o.t, mdl.zawias.otwarte) } } });
    ef.blaskNaZiemi(o.x, o.y + 0.06, o.z, kol, (0.9 + 1.2 * bl) * zs, 2.2 + bl);
    ef.promien(o.x, o.y, o.z, kol, (0.9 + 1.6 * bl) * zs, 0.45 + 0.35 * bl);
  }
  // Garnek Nonny (na Łąkach, Osiedlu, w Wąwozach) / witryna chłodnicza (Market)
  const indoor = MAPS[mapKey].indoor, gm = MS.model(THREE, 'garnek');
  for (const t of totems) {
    yPod(t, 0.8);
    const gotowy = t.cd <= 0, poDot = G.time - (t.dotyk || -9);
    if (indoor) {
      ef.cienKontaktowy(t.pos.x, t.y0 + 0.05, t.pos.z, 1.05, 0.7, t.yaw);
      Z.witryna.dodaj({ x: t.pos.x, y: t.y0, z: t.pos.z, yaw: t.yaw, sw: gotowy ? 1 : 0.15, jas: gotowy ? 1 : 0.78 });
      if (gotowy) ef.blaskNaZiemi(t.pos.x + Math.sin(t.yaw) * 0.8, t.y0 + 0.05, t.pos.z + Math.cos(t.yaw) * 0.8, K.chlod, 0.45, 1.5);
      continue;
    }
    // ogień: pełny gdy gotowy; po dotknięciu gaśnie do żaru, w ostatnich 3 s odnowienia rozpala się z powrotem
    const sila = gotowy ? 1 : Math.max(0.12, poDot < 0.6 ? 1 - poDot / 0.6 * 0.88 : 0.12, t.cd < 3 ? 1 - t.cd / 3 : 0);
    const mig = 0.85 + 0.15 * Math.sin(tt * 13 + t.faza) * Math.sin(tt * 7.3);
    const w = A.pokrywkaWybuch(poDot), r = gm.spoczynek.pokrywka, p = w || (gotowy ? A.pokrywka(tt, t.faza) : { dy: 0, rz: 0, rx: 0 });
    Z.garnek.dodaj({ x: t.pos.x, y: t.y0, z: t.pos.z, yaw: t.yaw, sw: mig * (0.3 + 0.7 * sila), jas: gotowy ? 1 : 0.86,
                     czesci: { pokrywka: { rz: r.rz + p.rz, rx: p.rx, dy: r.dy + p.dy }, ogien: { s: (0.92 + 0.1 * mig) * sila } } });
    ef.blaskNaZiemi(t.pos.x, t.y0 + 0.06, t.pos.z, K.ogien, 0.75 * mig * sila, 2.1);
  }
  for (const k in Z) Z[k].end();
  ef.end(camera);
}
const chests = [];        // {mesh (nośnik), pos, opened, t, y0, yaw, faza}
function placeChest(c) {
  const s = landSpot(16, 70) || { x: P.pos.x + 20, z: P.pos.z + 20 };
  c.pos.set(s.x, 0, s.z);
  c.opened = false; c.t = 0; c.nagr = false;
  c.y0 = gruntPod(s.x, s.z, 0.7);
  c.yaw = skKat(s.x, s.z);
  c.mesh.position.set(s.x, c.y0, s.z);
}
function spawnChests(n) {
  for (let i = 0; i < n; i++) {
    const c = { mesh: new THREE.Object3D(), pos: new THREE.Vector3(), opened: false, t: 0, faza: i * 0.37 };
    placeChest(c);
    chests.push(c);
  }
}
// PIERWSZE SZEŚĆ SKRZYŃ W ZAPISIE JEST WYREŻYSEROWANE — mała, mała, WIELKA,
// mała, mała, JACKPOT. Chwyt podpatrzony u Vampire Survivors (sekwencja 1-1-3-1-1-5
// z nieprzeskakiwalną animacją): przy czystej losowości pierwsza skrzynia
// w 48% przypadków daje monety, czyli nic zapamiętywalnego, a pierwsze wrażenie
// z gry jest zbyt cenne, żeby zostawiać je kostce.
const SKRZYNIE_SCENARIUSZ = ['monety', 'kosci', 'magnes', 'monety', 'kosci', 'djump'];
function chestReward(c) {
  AUDIO.sfx('skrzynia');
  const nr = META.st.skrzynki || 0;
  META.st.skrzynki = nr + 1;
  saveMetaSoon();
  const scenariusz = nr < SKRZYNIE_SCENARIUSZ.length ? SKRZYNIE_SCENARIUSZ[nr] : null;
  // KARABIN: najrzadsza i najmocniejsza nagroda, RAZ NA BIEG. Poza wyreżyserowaną
  // szóstką pierwszych skrzyń — te mają swoją własną dramaturgię i nie wolno jej psuć.
  // Skrzynia respawnuje się co ~45 s, więc 18% na skrzynię wychodzi ~1 raz na bieg.
  // NIE ODPALAMY GO OD RAZU: gracz dostaje go „do kieszeni" i sam wybiera moment
  // (przycisk obok skoku / klawisz R). Odpalenie z zaskoczenia przy skrzyni marnowało
  // pół trybu na bieg do hordy.
  if (!scenariusz && !P.karabinRun && Math.random() < 0.18) {
    P.karabinRun = true;
    dajKarabin();
    return;
  }
  // ze scenariusza wypada tylko to, czego gracz jeszcze nie ma (podwójny skok)
  const wybor = (scenariusz === 'djump' && hasDjump()) ? 'magnes' : scenariusz;
  const roll = wybor === 'djump' ? 0.0 : wybor === 'monety' ? 0.3
             : wybor === 'kosci' ? 0.7 : wybor === 'magnes' ? 0.99 : Math.random();
  // E1-bieg K6: pasma 0–0,12 skok · 0,12–0,18 FOLIOWA TORBA · do 0,62 monety · do 0,87 XP · magnes.
  // Torba była kupowalna w sklepie (`META.unlocked.glide`), ale `P.runGlide` nie ustawiało nic —
  // teraz jak podwójny skok: najpierw spróbuj w biegu, potem kup.
  if (roll < 0.12 && !hasDjump()) {   // 🦘🦘 PODWÓJNY SKOK (na ten bieg)
    P.runDjump = true;
    toastBuff(T('PODWÓJNY SKOK do końca biegu!', 'DOUBLE JUMP for the rest of the run!'));
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2500);
  } else if (roll >= 0.12 && roll < 0.18 && !hasGlide()) {   // FOLIOWA TORBA (na ten bieg)
    P.runGlide = true;
    toastBuff(T('FOLIOWA TORBA do końca biegu! Trzymaj skok', 'PLASTIC BAG for the rest of the run! Hold jump'));
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2800);
  } else if (roll < 0.62) {          // monety
    for (let k = 0; k < 8 + Math.floor(Math.random() * 8); k++)
      G.coins.push(makeCoin(c.pos.x + (Math.random() - .5) * 2, c.pos.z + (Math.random() - .5) * 2));
  } else if (roll < 0.87) {          // kości XP
    for (let k = 0; k < 6; k++)
      G.gems.push(makeGem(c.pos.x + (Math.random() - .5) * 2, c.pos.z + (Math.random() - .5) * 2, 1));
  } else {                           // wielki magnes: zasysa WSZYSTKO
    G.vacuum = 2.0;
    toastBuff(T('MAGNES! Wszystko leci do Ciebie', 'MAGNET! Everything flies to you'));
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2000);
  }
}

// ============================== ZŁOTA SKRZYNIA Z BRONIĄ 🎁 ==============================
// Jedna naraz; po zabraniu następna pojawia się po chwili. Strzałka w HUD prowadzi do niej.
// `mesh` = nośnik pozycji (model 3D rysuje syncSkrzynie3D), `ring` = krąg na ziemi jak dotąd
const wchest = { mesh: null, ring: null, pos: new THREE.Vector3(), active: false, t: 0, wait: 0, y0: 0 };
function spawnWeaponChest() {
  const s = landSpot(22, 60);
  if (!s) { wchest.wait = 2; return; }
  wchest.pos.set(s.x, 0, s.z);
  wchest.y0 = terrainH(s.x, s.z);
  wchest.mesh.position.set(s.x, wchest.y0 - 0.02, s.z);
  wchest.ring.position.set(s.x, terrainH(s.x, s.z) + 0.07, s.z);
  wchest.mesh.visible = wchest.ring.visible = true;
  wchest.active = true;
  // EN ≤ 50 znaków: #buff ma nowrap, a 375 px to granica. E2: „NOWA BROŃ" tylko przy wolnym slocie
  if (P.weapons.length < 3 && dostepneBronie().length) toastBuff(T('NOWA BROŃ czeka w złotej skrzyni — idź za strzałką!', 'NEW WEAPON in the golden crate — follow the arrow!'));
  else toastBuff(T('ZŁOTA SKRZYNIA — idź za strzałką!', 'GOLDEN CRATE — follow the arrow!'));
  setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2200);
}
function updateWeaponChest(dt) {
  const arrow = document.getElementById('wArrow');
  if (!wchest.active) {
    if (!G.cisza) wchest.wait -= dt;               // K8: od ciszy 9:52 nowa złota skrzynia już nie wypada (finał)
    if (wchest.wait <= 0) spawnWeaponChest();
  } else {
    wchest.t += dt;
    wchest.mesh.position.y = wchest.y0 + MS.ANIM.unoszenie(wchest.t).dy;
    wchest.ring.scale.setScalar(3.4 + Math.sin(wchest.t * 3) * 0.5);
    if (wchest.pos.distanceTo(P.pos) < 1.6) {        // ZEBRANA
      wchest.active = false;
      wchest.mesh.visible = wchest.ring.visible = false;
      // E2 K4: przy pełnych slotach następna złota skrzynia dopiero za 50–70 s (inaczej jackpoty wysuszają pulę w 4:00)
      const [w0, w1] = P.weapons.length >= 3 ? CFG_DECYZJE.wchestPelne : CFG_DECYZJE.wchestWolne;
      wchest.wait = w0 + Math.random() * (w1 - w0);
      G.shake = Math.max(G.shake, 0.2);
      AUDIO.sfx('zlota');
      novaRing(wchest.pos.x, wchest.pos.z, 3);
      META.st.chests++; saveMeta();
      // 30.09: najpierw wieko 3D (≈ 0,28 s, świat w hitstopie), potem nakładka — w trybie szybkim od razu
      otworzKufer3D('zlota', wchest.pos, wchest.t, () => pchnijOverlay(() => otworzZlotaSkrzynie('mapa')));
    }
  }
  // E1-bieg K7: strzałka prowadzi do BLIŻSZEJ z dwóch: Skrzyni Kaprala (fiolet) albo złotej. Dawniej fiolet
  // miał bezwzględne pierwszeństwo, więc niepodniesiona Skrzynia Kaprala zasłaniała złotą do końca biegu.
  let kap = najblizszaSkrzyniaKaprala();
  if (kap && wchest.active && wchest.pos.distanceTo(P.pos) < kap.pos.distanceTo(P.pos)) kap = null;
  const cel = kap ? kap.pos : (wchest.active ? wchest.pos : null);
  if (!cel) { arrow.style.display = 'none'; return; }
  if (arrow.classList.contains('kapral') !== !!kap) arrow.classList.toggle('kapral');
  const d = cel.distanceTo(P.pos);
  // strzałka: rzut kierunku do skrzyni na osie EKRANU (kamera ma yaw = camYaw)
  const dx = cel.x - P.pos.x, dz = cel.z - P.pos.z;
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);       // przód kamery
  const rx = -fz, rz = fx;                                     // prawo kamery
  const sx = dx * rx + dz * rz;                                // ekran: w prawo
  const sy = dx * fx + dz * fz;                                // ekran: w górę
  const ar = arrow.querySelector('.ar');
  if (!ar.style.backgroundImage) ar.style.backgroundImage = `url(${icon('strzalka', 4)})`;
  arrow.style.display = 'flex';
  ar.style.transform = `rotate(${Math.atan2(-sy, sx)}rad)`;    // ikona wskazuje w prawo przy 0°
  arrow.querySelector('.dist').textContent = Math.round(d) + ' m';
}

// ============================== GARNEK NONNY (dawne totemy) ==============================
// Kamienna kolumna fantasy nie miała nic wspólnego z warzywami walczącymi z mafią
// przekąsek. Mechanika została ta sama (dotknij → losowy buff → cooldown), zmienił
// się kostium: na Łąkach BULGOCZĄCY GARNEK, w markecie WITRYNA CHŁODNICZA.
// Nazwa tablicy `totems` zostaje — wisi na niej debug `window.HORDA` i scenariusze testera.
const totems = [];        // {mesh, ring, pos, cd, mat}

// ---- pomocnik pixel artu: prostokąty + darmowy kontur (warstwa o piksel większa pod spodem) ----
function pixTex(W, H, bryly, kontur = '#1b1b22') {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (kontur) { g.fillStyle = kontur; for (const [x, y, w, h] of bryly) g.fillRect(x - 1, y - 1, w + 2, h + 2); }
  for (const [x, y, w, h, kol] of bryly) { g.fillStyle = kol; g.fillRect(x, y, w, h); }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 30.09: garnek i witryna są MODELAMI 3D (lib/modele-skrzynie.js: 'garnek' — emaliowany garnek w czerwone kropki
// jak na sprite'cie właściciela, na trójnogu nad ogniskiem; 'witryna' — chłodnia w markecie). Dawne tekstury
// (`garnekTexture`, `witrynaTexture`, billboard z garnek_nonny.png) usunięte — plik PNG zostaje dla UI (menu, kawa).
// Buffy: waga = jak często wypada. Nietykalność i mrożonki są RZADSZE, bo zdejmują
// napięcie — a w survivors-like napięcie JEST rozgrywką. 6 s zamiast 10 z tego samego
// powodu: ma być momentem, nie przerwą w grze.
const BUFFS = [
  { key: 'dmg',  ico: 'plomien', label: T('PODWÓJNE OBRAŻENIA', 'DOUBLE DAMAGE'),      dur: 18,  waga: 1.0 },
  { key: 'szyb', ico: 'but',     label: T('PRZYSPIESZENIE', 'SPEED BOOST'),            dur: 18,  waga: 1.0 },
  { key: 'slow', ico: 'zegar',   label: T('WROGOWIE ZWOLNILI', 'ENEMIES SLOWED'),      dur: 14,  waga: 1.0 },
  { key: 'kasa', ico: 'moneta',  label: T('PODWÓJNE MONETY', 'DOUBLE COINS'),          dur: 20,  waga: 0.9 },
  { key: 'niet', ico: 'tarcza',  label: T('NIETYKALNOŚĆ!', 'INVINCIBLE!'),             dur: 6,   waga: 0.5 },
  { key: 'mroz', ico: 'wiatr',   label: T('MROŻONKI — HORDA STOI', 'DEEP FREEZE — THE HORDE STOPS'), dur: 3.5, waga: 0.6 },
];
const BUFF_WAG = BUFFS.reduce((a, b) => a + b.waga, 0);
function losujBuff() {
  let r = Math.random() * BUFF_WAG;
  for (const b of BUFFS) if ((r -= b.waga) <= 0) return b;
  return BUFFS[0];
}
// wygląd zależy od mapy (garnek / witryna w markecie) — wybiera go syncSkrzynie3D wg MAPS[mapKey].indoor;
// tu zostaje tylko kąt obrotu (witryna stoi frontem do gracza w chwili postawienia)
function ustawWygladGarnkow(key) {
  for (const t of totems) t.yaw = MAPS[key] && MAPS[key].indoor ? Math.atan2(P.pos.x - t.pos.x, P.pos.z - t.pos.z) : t.yaw;
}
function spawnTotems(n) {
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,196,90,0.95)'; g.lineWidth = 6;      // ciepły pierścień pod garnkiem
    g.beginPath(); g.arc(32, 32, 24, 0, 7); g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  for (let i = 0; i < n; i++) {
    const ring = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false }));
    ring.scale.set(3, 1, 3);
    scene.add(ring);
    // `mesh` = nośnik pozycji (model rysuje syncSkrzynie3D); `mat.opacity` zostaje jako znacznik stanu dla scenariuszy testera
    const t = { mesh: new THREE.Object3D(), ring, pos: new THREE.Vector3(), cd: 0, mat: { opacity: 1 }, yaw: 0, y0: 0, faza: i * 0.61, dotyk: -9 };
    placeTotem(t);
    totems.push(t);
  }
}
function placeTotem(t) {
  const s = landSpot(18, 70) || { x: P.pos.x - 20, z: P.pos.z - 20 };
  t.pos.set(s.x, 0, s.z);
  t.y0 = gruntPod(s.x, s.z, 0.8);
  t.yaw = MAPS[mapKey].indoor ? Math.atan2(P.pos.x - s.x, P.pos.z - s.z) : skKat(s.x, s.z);
  t.mesh.position.set(s.x, t.y0, s.z);
  t.ring.position.set(s.x, terrainH(s.x, s.z) + 0.06, s.z);
  t.cd = 0; t.mat.opacity = 1; t.ring.visible = true; t.dotyk = -9;
}
// `ikona` = nazwa z icons.js; bez niej zostaje czysty tekst (ZERO emoji w grze)
function toastBuff(txt, ikona) {
  const el = document.getElementById('buff');
  if (ikona) el.innerHTML = ico(ikona, 14) + ' ' + txt;
  else el.textContent = txt;
  el.style.opacity = 1;
}

// ============================== TRYB KARABINU (PIERWSZA OSOBA) ==============================
// Nagroda ze skrzyni: kamera zjeżdża do wysokości głowy, karabin strzela SAM,
// a gracz normalnie biega. Sprite'y są 8-kierunkowymi billboardami à la Doom,
// czyli z bliska i z pierwszej osoby wyglądają poprawnie — dlatego ten tryb
// wizualnie nie wymaga niczego nowego poza widokiem broni.
//
// TRZY ŻYCIA to licznik trafień W TRYBIE, nie serca: cios odbiera życie i
// ROZRZUCA hordę, ale nie tyka HP. Bez tego gracz ginąłby w nagrodzie, bo
// z wysokości głowy nie widzi, co go otacza.
const KARABIN_BAZA = 20;                  // sekundy; sklep dokłada +5 s za poziom
const KARABIN_GAP = 0.075;                // ~13 strzałów/s
const KARABIN_DMG = 30;                   // × dmgAll() — ma być mocniejszy od wszystkiego
const KARABIN_V = 46;                     // j./s — dość wolno, żeby WIDZIEĆ ziarna w locie
const KARABIN_ZYCIE = 1.5;                // s lotu → zasięg ~69 j.
const KARABIN_R = 0.8;                    // promień trafienia ziarna
const KARABIN_ROZRZUT = 0.014;            // rad — broń nie jest laserem, ale celowanie DECYDUJE
const KARABIN_PRZEBICIE = 2;              // ilu wrogów przebija jedno ziarno
const KARABIN_ODEPCHNIJ = 14;             // na tyle odlatuje horda przy utracie życia
const karabinCzas = () => KARABIN_BAZA + 5 * (META.up.karabin || 0);
// ZIARNO KUKURYDZY jako pocisk — magazynek na sprite'cie to słoik kukurydzy,
// więc i amunicja musi być kukurydzą. Jasny rdzeń + kontur, żeby było widać na trawie.
let karabinPocMat = null;
function karabinPocTexture() {
  const b = [];
  const r = (x, y, w, h, kol) => b.push([x, y, w, h, kol]);
  r(3, 1, 6, 2, '#ffe9a3'); r(2, 3, 8, 5, '#ffc93c');
  r(3, 8, 6, 3, '#e8a521'); r(4, 4, 3, 3, '#fffdf0');
  return pixTex(12, 13, b);
}

// ---- widok broni: pixel art rysowany rectami, kontur z „grubszej" warstwy pod spodem ----
function gunTexture() {
  const W = 46, H = 30;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const M1 = '#3b4048', M2 = '#5a616c', D1 = '#7a4a22', D2 = '#9c6533', Z = '#ffd75e';
  const bryly = [];
  const r = (x, y, w, h, kol) => bryly.push([x, y, w, h, kol]);
  // LUFA: skos rysowany SCHODKAMI — tak wygląda przekątna w pixel-arcie,
  // rotacja canvasu dałaby antyaliasing i rozmyte piksele.
  for (let i = 0; i < 20; i++) r(2 + i, 4 + Math.floor(i * 0.42), 2, 4, i % 3 ? M1 : M2);
  r(0, 3, 4, 6, M2);                                   // tłumik / osłona wylotu
  r(8, 3, 2, 3, M2);                                   // muszka
  r(21, 8, 11, 3, M1);                                 // szyna górna
  r(20, 11, 15, 8, M1);                                // komora zamkowa
  r(30, 13, 3, 2, Z);                                  // rączka zamka (złoty detal)
  r(23, 18, 6, 10, M2);                                // magazynek
  r(24, 19, 4, 2, Z);
  for (let i = 0; i < 9; i++) r(32 + Math.floor(i * 0.45), 17 + i, 5, 1, i % 2 ? D1 : D2);  // chwyt
  r(36, 12, 9, 7, D2);                                 // kolba
  r(38, 13, 6, 4, D1);
  // dwie warstwy: najpierw wszystko o piksel większe w czerni = darmowy kontur
  g.fillStyle = '#1b1b22';
  for (const [x, y, w, h] of bryly) g.fillRect(x - 1, y - 1, w + 2, h + 2);
  for (const [x, y, w, h, kol] of bryly) { g.fillStyle = kol; g.fillRect(x, y, w, h); }
  return c.toDataURL();
}
function gunFlashTexture() {
  const S = 24;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const r = (x, y, w, h, kol) => { g.fillStyle = kol; g.fillRect(x, y, w, h); };
  r(4, 10, 16, 4, '#ffb43c'); r(10, 4, 4, 16, '#ffb43c');       // krzyż
  r(7, 7, 10, 10, '#ffdd7a');                                    // rdzeń
  r(9, 9, 6, 6, '#fffbe8');
  r(1, 11, 3, 2, '#ffdd7a'); r(20, 11, 3, 2, '#ffdd7a');
  r(11, 1, 2, 3, '#ffdd7a'); r(11, 20, 2, 3, '#ffdd7a');
  return c.toDataURL();
}
function crossTexture() {
  const S = 13;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const r = (x, y, w, h, kol) => { g.fillStyle = kol; g.fillRect(x, y, w, h); };
  for (const [x, y, w, h] of [[0, 6, 4, 1], [9, 6, 4, 1], [6, 0, 1, 4], [6, 9, 1, 4], [6, 6, 1, 1]]) {
    r(x - 1, y - 1, w + 2, h + 2, '#1b1b22');
    r(x, y, w, h, '#ffd75e');
  }
  return c.toDataURL();
}
// Sprite od właściciela: karabin ze SŁOIKIEM KUKURYDZY jako magazynkiem.
// `gunTexture()` zostaje jako awaryjna zaślepka, gdyby pliku zabrakło —
// ten sam wzorzec co `salata_czasza.png` / `lettuceTexture()`.
const KARABIN_PNG = 'assets/karabin_fpp.png';
function initKarabin() {
  const el = document.getElementById('gunPix');
  const img = new Image();
  img.onload = () => { el.style.backgroundImage = `url(${KARABIN_PNG})`; };
  img.onerror = () => { el.style.backgroundImage = `url(${gunTexture()})`; };
  img.src = KARABIN_PNG;
  document.getElementById('gunFlash').style.backgroundImage = `url(${gunFlashTexture()})`;
  document.getElementById('fpsCross').style.backgroundImage = `url(${crossTexture()})`;
}
function fpsBlysk(moc) {
  const el = document.getElementById('fpsFlash');
  el.style.opacity = moc;
  setTimeout(() => { el.style.opacity = 0; }, 90);
}
// ZNALEZIENIE karabinu ≠ odpalenie go. Power-up ląduje „w kieszeni", a przycisk
// (dotyk) / klawisz R (PC) / X na padzie odpala go, gdy gracz uzna, że jest moment.
const KARABIN_KLAWISZ = 'KeyR';
function dajKarabin() {
  P.karabinMa = true;
  odswiezKarabinBtn();
  AUDIO.sfx('zlota');
  G.shake = Math.max(G.shake, 0.3);
  // krotko: pelne zdanie mialo 382 px przy ekranie 375 px i wychodzilo za oba brzegi
  // klawisz / przycisk pada wg trybu wejścia; na dotyku „dotknij przycisku" (litera nic nie znaczy)
  const kk = glifTekst('karabin');
  toastBuff(kk ? T(`KARABIN! Wciśnij ${kk}, gdy będzie gęsto`, `RIFLE! Press ${kk} when it gets thick`)
    : T('KARABIN! Dotknij go, gdy będzie gęsto', 'RIFLE! Tap it when it gets thick'), 'celownik');
  setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 4200);
}
function odswiezKarabinBtn() {
  const el = document.getElementById('karabinBtn');
  if (!el) return;
  el.classList.toggle('on', !!P.karabinMa && G.running && !G.paused && !G.fps.on && !G.dying);
  const im = el.querySelector('.kimg');
  if (im && !im.style.backgroundImage) im.style.backgroundImage = `url(${icon('celownik', 5)})`;
}
function startKarabin() {
  if (!G.running || G.paused || G.dying) return;    // przycisk/pad nie mogą odpalić go z menu ani pauzy
  const F = G.fps;
  // E1-bieg K6: drugie R w trybie NIC nie robi. Dawniej dokładało +8 s (bez limitu wciśnięć), więc
  // wystarczyło klepać R, żeby tryb trwał, ile się chce — karabin ma być rzadkim złotym momentem.
  if (F.on) return;
  if (!P.karabinMa) return;                          // nie ma czego odpalać
  P.karabinMa = false;
  odswiezKarabinBtn();
  F.on = true;
  F.max = karabinCzas(); F.t = F.max; F.zycia = 3;
  F.fireT = 0; F.pitch = 0; F.wejscie = 0.5; F.wyjscie = 0;
  playerBB.mesh.visible = false;                     // pierwsza osoba = własnego ciała nie widać
  playerBB.shadow.visible = false;
  if (hitFlash) hitFlash.visible = false;
  document.getElementById('fpsView').classList.add('on');
  przeliczWylot();                                   // #gunFlash ma już layout — teraz da się go zmierzyć
  fpsBlysk(0.9);
  G.shake = Math.max(G.shake, 0.45);
  AUDIO.sfx('zlota');
  toastBuff(T("KARABIN NONNY — ", "NONNA'S RIFLE — ") + Math.round(F.max) + T(' SEKUND RZEŹNI!', ' SECONDS OF CARNAGE!'));
}
function endKarabin(powod) {
  const F = G.fps;
  if (!F.on) return;
  F.on = false;
  F.wyjscie = 0.55;                                  // kamera wraca płynnie, nie skokiem
  playerBB.mesh.visible = true;
  playerBB.shadow.visible = true;
  document.getElementById('fpsView').classList.remove('on');
  document.getElementById('gunFlash').style.opacity = 0;
  odswiezKarabinBtn();
  AUDIO.sfx('zagrozenie');
  toastBuff(powod === 'zycia' ? T('KARABIN WYBITY Z RĄK!', 'RIFLE KNOCKED OUT OF YOUR HANDS!') : T('MAGAZYNEK PUSTY', 'MAGAZINE EMPTY'));
  setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2000);
}
// JEDNA BRAMKA na wszystkie trafienia gracza (kontakt, kamikaze, spadający regał).
// Zwraca true = cios pochłonięty, wywołujący NIE odejmuje HP.
function ciosPochloniety() {
  if (G.buff.key === 'niet') {                       // NIETYKALNOŚĆ z garnka
    P.iframes = 0.35;                                // przerwa, żeby dźwięk nie zamienił się w kakofonię
    AUDIO.sfx('tarcza');
    spark(P.pos.x, P.y + 1.2, P.pos.z);
    return true;
  }
  return karabinZjadlCios();
}
// cios w trybie karabinu: zabiera ŻYCIE TRYBU (nie serce) i rozrzuca hordę.
// Zwraca true, jeśli tryb zjadł trafienie — wtedy wywołujący NIE odejmuje HP.
function karabinZjadlCios() {
  const F = G.fps;
  if (!F.on) return false;
  F.zycia--;
  P.iframes = 1.0;                                   // sekunda oddechu, żeby nie stracić dwóch żyć naraz
  AUDIO.sfx('hurt');
  AUDIO.sfx('wybuch');
  G.shake = Math.max(G.shake, 0.55);
  fpsBlysk(0.55);
  novaRing(P.pos.x, P.pos.z, KARABIN_ODEPCHNIJ * 0.5);
  // FALA ODEPCHNIĘCIA: wszyscy w promieniu lądują co najmniej KARABIN_ODEPCHNIJ od gracza.
  // Ustawiamy pozycję WPROST (nie przez `kb`), bo Gummini mają `bezKb` i zostałyby na miejscu.
  for (const e of G.enemies) {
    if (e.dying) continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > KARABIN_ODEPCHNIJ) continue;
    const inv = 1 / Math.max(d, 0.001);
    e.pos.x = P.pos.x + dx * inv * KARABIN_ODEPCHNIJ;
    e.pos.z = P.pos.z + dz * inv * KARABIN_ODEPCHNIJ;
    e.stun = Math.max(e.stun || 0, 0.35);
  }
  const v = document.getElementById('vign');
  v.style.opacity = 1; setTimeout(() => v.style.opacity = 0, 200);
  if (F.zycia <= 0) endKarabin('zycia');
  return true;
}
// ---- gdzie na EKRANIE jest wylot lufy (żeby ziarna wylatywały Z LUFY, nie ze środka) ----
// #gunFlash siedzi dokładnie na wylocie sprite'a, więc bierzemy jego środek i
// przeliczamy na współrzędne znormalizowane kamery. Liczone raz (na wejściu w tryb
// i przy zmianie rozmiaru okna) — `getBoundingClientRect` co strzał wymuszałby
// przeliczanie stylów 13 razy na sekundę.
const _wylotNdc = new THREE.Vector2(0.42, -0.45);
function przeliczWylot() {
  const r = document.getElementById('gunFlash').getBoundingClientRect();
  if (!r.width) return;
  _wylotNdc.set((r.left + r.width / 2) / innerWidth * 2 - 1,
                -((r.top + r.height / 2) / innerHeight * 2 - 1));
}
const _pocOrig = new THREE.Vector3(), _pocCel = new THREE.Vector3();

// ŻADNEGO AUTO-AIM: ziarno startuje Z WYLOTU LUFY i leci w punkt, na który patrzy
// CELOWNIK — tor zbiega się ze środkiem ekranu, dokładnie jak w normalnym FPS-ie.
// Celowanie ma decydować, inaczej pierwsza osoba jest tylko kostiumem.
function karabinStrzal() {
  const F = G.fps;
  // lekki rozrzut: broń nie jest laserem, ale to nadal Ty decydujesz, gdzie pada seria
  const yaw = camYaw + (Math.random() - 0.5) * KARABIN_ROZRZUT * 2;
  const pit = F.pitch + (Math.random() - 0.5) * KARABIN_ROZRZUT * 2;
  // START: punkt na promieniu przez wylot lufy, 1.9 j. od oka
  _pocOrig.set(_wylotNdc.x, _wylotNdc.y, 0.5).unproject(camera)
    .sub(camera.position).normalize().multiplyScalar(1.9).add(camera.position);
  // CEL: 55 j. wprost w celownik — stąd zbieżność toru ze środkiem ekranu
  _pocCel.set(-Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit))
    .multiplyScalar(55).add(camera.position);
  const dir = _pocCel.clone().sub(_pocOrig).normalize();
  const m = new THREE.Mesh(unitGeo, karabinPocMat);
  m.scale.set(0.17, 0.24, 1);                        // ziarno lekko wydłużone = czyta się jako lot
  m.position.copy(_pocOrig);
  scene.add(m);
  G.karabinPoc.push({ mesh: m, dir, t: 0, pierce: KARABIN_PRZEBICIE, hit: new Set() });

  const gf = document.getElementById('gunFlash');
  gf.style.opacity = 1;
  setTimeout(() => { gf.style.opacity = 0; }, 45);
  F.kick = 1;                                        // odrzut broni na ekranie
  G.shake = Math.max(G.shake, 0.07);
  AUDIO.sfx('strzal');                               // throttle w audio.js pilnuje kakofonii
}
// lot ziaren + trafienia. Przy 46 j./s i dt 1/60 ziarno robi 0.77 j. na klatkę,
// a promień trafienia to 0.8 — więc nie przelatuje przez wrogów i nie trzeba podkroków.
function updateKarabinPoc(dt) {
  for (let i = G.karabinPoc.length - 1; i >= 0; i--) {
    const s = G.karabinPoc[i];
    s.t += dt;
    s.mesh.position.addScaledVector(s.dir, KARABIN_V * dt);
    s.mesh.quaternion.copy(camera.quaternion);       // ziarno zawsze twarzą do kamery
    const px = s.mesh.position.x, py = s.mesh.position.y, pz = s.mesh.position.z;
    let dead = s.t > KARABIN_ZYCIE || py < terrainH(px, pz) - 0.2;
    if (!dead && MAPS[mapKey].osiedle && OS.pociskiStop && OS.nav.scianaW(px, pz) && osWBryle(px, pz, 0, py)) dead = true;   // Osiedle: ziarno rozbija się o blok
    if (!dead) for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying || s.hit.has(e)) continue;
      const rr = KARABIN_R + ((e.T.boss || e.kapral) ? 0.9 : 0);
      const dx = px - e.pos.x, dz = pz - e.pos.z, dy = py - (e.ty + 0.8);
      if (dx * dx + dz * dz + dy * dy > rr * rr) continue;
      s.hit.add(e);
      spark(e.pos.x, e.ty + 1.2, e.pos.z);
      zadajDmg(e, KARABIN_DMG * dmgAll(), { col: '#fff3b0', sfx: 'traf', kb: s.dir, kbSila: 1.0, zr: 'karabin' });
      if (s.pierce-- <= 0) { dead = true; break; }
    }
    if (dead) { scene.remove(s.mesh); G.karabinPoc.splice(i, 1); }
  }
}
function updateKarabin(dt) {
  const F = G.fps;
  if (F.wyjscie > 0) F.wyjscie = Math.max(0, F.wyjscie - dt);
  if (!F.on) return;
  if (F.wejscie > 0) F.wejscie = Math.max(0, F.wejscie - dt);
  F.t -= dt;
  const hud = document.getElementById('fpsHud');
  hud.querySelector('.fpsT').textContent = Math.max(0, Math.ceil(F.t));
  const lw = hud.querySelector('.fpsL');
  if (lw.childElementCount !== 3) lw.innerHTML = '<i></i><i></i><i></i>';
  for (let i = 0; i < 3; i++) lw.children[i].className = i < F.zycia ? '' : 'off';
  // OGIEŃ CIĄGŁY. Domknięcie licznikiem, bo przy hitstopie albo długiej klatce
  // `while` bez hamulca wyplułby kilkadziesiąt strzałów w jednej klatce.
  F.fireT -= dt;
  for (let n = 0; F.fireT <= 0 && n < 4; n++) { F.fireT += KARABIN_GAP; karabinStrzal(); }
  // ODRZUT + KOŁYSANIE W MARSZU — dwie linie, a to one sprzedają „trzymam broń".
  // Transform ustawiamy na #gunWrap, żeby błysk wylotowy jechał razem z lufą.
  F.kick = Math.max(0, F.kick - dt * 9);
  const bieg = Math.hypot(P.vx, P.vz) > 0.6 ? 1 : 0;
  const bx = Math.sin(G.time * 8.5) * 7 * bieg, by = Math.abs(Math.cos(G.time * 8.5)) * 6 * bieg;
  document.getElementById('gunWrap').style.transform =
    `translate(${bx + F.kick * 9}px, ${by + F.kick * 24}px) rotate(${F.kick * 2.6}deg)`;
  if (F.t <= 0) endKarabin('czas');
}

// AWANS: WHILE, nie IF — jedna pigułka może dać więcej niż jeden poziom, a przy Wielkim Magnesie pigułki przychodzą
// kiszkami po kilkanaście w jednej klatce.
// AWANS CO 3 (29.09, uwaga właściciela po v295): KAŻDY awans = automatyczne wzmocnienie bez pauzy (napis nad głową,
// błysk, pierścień, dźwięk); okno kart tylko na poziomach kartowych (`poziomKart`). Kilka awansów w jednej klatce =
// najwyżej JEDNO okno (i żadne, jeśli okno awansu już czeka w kolejce OV_Q).
const kartyCo = () => (G.lagodny && CFG_BIEG.trybLagodny.kartyCo) || trudn().awans.kartyCo;
const poziomKart = l => { const A = trudn().awans; return l >= A.kartyOd && (l - A.kartyOd) % kartyCo() === 0; };
const nastPoziomKart = l => { let n = l + 1; while (!poziomKart(n)) n++; return n; };
// broń do automatycznego podciągnięcia: najniższy poziom poniżej max, nie wykluczona (WYKLUCZ = „bez ulepszeń do końca
// biegu"), przy remisie ta zdobyta wcześniej
function awansBron() {
  let naj = null;
  for (const w of P.weapons) {
    if (w.lvl >= WEAPONS[w.key].max || wykluczone('bron:' + w.key)) continue;
    if (!naj || w.lvl < naj.lvl) naj = w;
  }
  return naj;
}
function awansujJesliTrzeba() {
  let karty = false, ile = 0;
  const bronie = [];
  while (!STRES && P.xp >= P.xpNeed) {            // STRES (DEV): bez kart, bo pauzowałyby pomiar
    P.xp -= P.xpNeed; P.lvl++; ile++;
    P.xpNeed = xpDoNast(P.lvl);
    P.awAuto = (P.awAuto || 0) + 1;
    if (poziomKart(P.lvl)) karty = true;
    else if (trudn().awans.bron) {                 // awans BEZ kart: broń +1 poziom (siła jak przy karcie co awans)
      // WZROST (29.09): licznik += wzrostBron; poziom broni, gdy uzbiera 1 (1 = każdy awans bez kart, 0,5 = co drugi)
      const wz = trudn().wzrostBron == null ? 1 : trudn().wzrostBron;
      P.awBronAcc = (P.awBronAcc == null ? 1 - wz : P.awBronAcc) + wz;
      const w = P.awBronAcc >= 1 - 1e-9 ? awansBron() : null;
      if (w) { w.lvl++; bronie.push(w); P.awBronAcc -= 1; P.awBron = (P.awBron || 0) + 1; }
      else if (P.awBronAcc > 1) P.awBronAcc = 1;     // wszystkie bronie na max — nie zbieraj zaległości
    }
  }
  if (ile) {
    if (bronie.length) renderWpns();
    document.getElementById('lvl').textContent = T('POZIOM ', 'LEVEL ') + P.lvl;
    AUDIO.sfx('awans');
    AUDIO.event('awans');
    // 0.20 -> 0.10: właściciel zgłosił, że błysk „za mocno" wchodzi w oko (awans co ~10 s na starcie biegu)
    blysk(karty ? '#ffffff' : '#ffe38a', 0.10);
    awansNapis(ile, karty, bronie);
    if (karty && !G.oknoAwansu) {
      G.oknoAwansu = true;                           // zdejmowane w showCards (okno naprawdę otwarte)
      pchnijOverlay(showCards);
    }
  }
  const xb = document.getElementById('xpbar');
  xb.style.width = (P.xp / P.xpNeed * 100) + '%';
  xb.classList.toggle('karty', !STRES && kartyCo() > 1 && poziomKart(P.lvl + 1));   // złoty pasek = następny awans otworzy karty
}
// napis nad graczem („POZIOM 7" + „KULE POZ. 3" albo „+3% OBRAŻEŃ") + pierścień + pasek pod tabliczką poziomu; bez pauzy.
function awansNapis(ile, karty, bronie = []) {
  const A = trudn().awans;
  if (kartyCo() <= 1) return;                     // v1: jak dawniej (każdy awans = karty)
  const pr = x => String(+(x * 100 * ile).toFixed(2)).replace('.', JEZYK.cur === 'en' ? '.' : ',');   // 0,5 / 1 / 1,5
  const d = pr(A.dmg * wzrost()), t = pr(A.tempo * wzrost());
  const pc = (A.dmg ? T(`+${d}% obrażeń`, `+${d}% damage`) : '') + (A.dmg && A.tempo ? ' · ' : '') + (A.tempo ? T(`+${t}% tempa`, `+${t}% attack speed`) : '');
  const bw = bronie.length ? bronie[bronie.length - 1] : null;
  dmgPop(P.pos.x, P.y + 2.3, P.pos.z, T('POZIOM ', 'LEVEL ') + P.lvl, '#ffd75e', 1.7, 'wazny');
  if (bw) dmgPop(P.pos.x, P.y + 1.5, P.pos.z, (WEAPONS[bw.key].nm + T(' POZ. ', ' LV ') + bw.lvl).toUpperCase(), '#bff27a', 1.2, 'wazny');
  else if (A.dmg) dmgPop(P.pos.x, P.y + 1.5, P.pos.z, T(`+${d}% OBRAŻEŃ`, `+${d}% DAMAGE`), '#fff4c2', 1.15, 'wazny');
  novaRing(P.pos.x, P.pos.z, 3.2);
  const el = document.getElementById('awansInfo');
  if (el) {
    const czesci = [T('POZIOM ', 'LEVEL ') + P.lvl];
    for (const w of bronie) czesci.push(ico(WEAPONS[w.key].ico, 14) + ' ' + WEAPONS[w.key].nm + T(' poz. ', ' lv ') + w.lvl);
    if (pc) czesci.push(pc);
    czesci.push(karty ? T('KARTY!', 'CARDS!') : T('karty na poz. ', 'cards at lv ') + nastPoziomKart(P.lvl));
    el.innerHTML = czesci.join(' · ');
    el.classList.remove('pokaz'); void el.offsetWidth; el.classList.add('pokaz');
  }
}

// ============================== FALA UDERZENIOWA (nova) ==============================
let ringMat = null;
function novaRing(x, z, rMax) {
  const m = new THREE.Object3D();                  // E1: instancja w `pulaFala` (krycie w `a`)
  m.position.set(x, terrainH(x, z) + 0.1, z);
  G.rings.push({ mesh: m, t: 0, rMax, a: 1 });
}
function nova(x, z, r, dmg, zr = 'inne') {
  novaRing(x, z, r);
  AUDIO.sfx('wybuch');
  // Regały kładą tylko DUŻE fale. Zmierzone: bez tego gate'a Kule Meteoryczne
  // (nova r=1.8 na KAŻDE trafienie pocisku, czyli co pół sekundy) czyściły całą
  // arenę do zera w 100 s — a to nie jest decyzja gracza, tylko efekt uboczny.
  // Zostaje Tupnięcie (3.7+) i kura od 2. poziomu; odpadają meteor, butelka, Sodino.
  if (r >= 3.0) przewrocRegaly(x, z, r + 1.2);
  for (let j = G.enemies.length - 1; j >= 0; j--) {
    const e = G.enemies[j];
    if (e.dying) continue;
    const dx = e.pos.x - x, dz = e.pos.z - z;
    if (dx * dx + dz * dz < r * r) {
      spark(e.pos.x, e.ty + 1.0, e.pos.z);
      // dmg 0 (wybuch Sodino) = sam odrzut, bez liczby
      zadajDmg(e, dmg, { col: '#ffb56e', sc: 0.85, kb: _kbV.set(dx, 0, dz), kbSila: 4.5, noPop: dmg <= 0, zr });
    }
  }
}

// ============================== PRZEWRACANE REGAŁY (market) ==============================
// Każda fala uderzeniowa (tupnięcie, wybuch butelki, meteoryt, Sodino) przewraca
// regały w zasięgu. Regał przygniata wszystko na swojej długości, otwiera przejście
// i zostawia rumowisko, na które da się WSKOCZYĆ — a przewracając się, popycha
// sąsiednie regały, więc jedno tupnięcie może pójść jak domino przez pół alejki.
const PAD_T = 0.5;                               // czas upadku
const RESTOCK_T = 22;                            // po tylu sekundach regał wstaje (poza kadrem)
let restockT = 0;
function przewrocRegaly(x, z, r, opoznienie = 0) {
  if (!MAPS[mapKey].indoor) return 0;
  let ile = 0;
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
    const ch = chunkMap.get(gx + ',' + gz);
    if (!ch || !ch.shelves || !ch.shelves.length) continue;
    for (const s of ch.shelves) {
      if (s.stan !== 'stoi') continue;
      // odległość do PROSTOKĄTA regału, nie do środka — inaczej fala u końca
      // regału nie ruszałaby go wcale (a = oś upadku, b = wzdłuż regału; market 30.09: regały w obu osiach)
      const da = Math.max(0, Math.abs((s.poZ ? z : x) - s.a) - REG_HL);
      const db = Math.max(0, Math.abs((s.poZ ? x : z) - s.b) - s.len / 2);
      if (da * da + db * db > r * r) continue;
      s.stan = 'pada'; s.t = -opoznienie; s.zadal = false;
      G.padajace.push(s);
      ile++;
    }
  }
  return ile;
}
// RESTOCK: obsługa sklepu stawia regał z powrotem. Bez tego arena, w której
// gracz stoi, zostaje płaska tak długo, jak długo w niej stoi — czyli późna gra
// w markecie jest ŁATWIEJSZA niż wczesna, odwrotnie niż powinno być.
// Stawiamy tylko POZA KADREM (>22 j.), żeby regał nie wyrósł graczowi w twarz.
function updateRestock(dt) {
  restockT -= dt;
  if (restockT > 0) return;
  restockT = 0.5;                                // pełny przegląd 2× na sekundę, nie co klatkę
  for (const [, ch] of chunkMap) {
    if (!ch.shelves) continue;
    for (const s of ch.shelves) {
      if (s.stan !== 'lezy') continue;
      s.tLezy = (s.tLezy || 0) + 0.5;
      if (s.tLezy < RESTOCK_T) continue;
      if (Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < 22) continue;
      s.stan = 'stoi'; s.t = 0; s.zadal = false; s.tLezy = 0;
      ustawRegal(s, 0);                              // wraca pionowo (stan 0 → cień kontaktowy stojącego)
      brylaRegalu(s, false);
      if (s.maska) s.maska();                        // pole hordy: znów ściana
    }
  }
}
function updatePadajace(dt) {
  for (let i = G.padajace.length - 1; i >= 0; i--) {
    const s = G.padajace[i];
    if (!s.im || !s.im.parent) { G.padajace.splice(i, 1); continue; }  // chunk zniknął
    s.t += dt;
    if (s.t < 0) continue;                                        // czeka na swoją kolej (domino)
    const k = Math.min(1, s.t / PAD_T);
    const kat = (Math.PI / 2) * k * k;                            // przyspiesza jak pod grawitacją
    ustawRegal(s, kat);                                           // obrót zapisany w macierzy instancji
    // ŻADNEGO PODNOSZENIA. Pivot siedzi na KRAWĘDZI podstawy, bryła modułu leży w lokalnym Z od −1,6 do 0
    // i po obrocie ląduje w Y od 0 do 1,6 — cała NAD posadzką (plecy regału z towarem do góry).
    if (!s.zadal && k > 0.55) {                                   // moment uderzenia w podłogę
      s.zadal = true;
      // Obrażenia PRZYCZEPIONE DO CZASU BIEGU, nie do buildu. Zmierzone: przy
      // `6*dmgAll()+4` regał dawał stale 12-20 obrażeń, a HP szeregowego rośnie
      // 4.8 → 15.8 → 37.5 (1/5/10 min), więc od 4. minuty przestawał kogokolwiek
      // zabijać — dokładnie wtedy, gdy market jest najbardziej zapchany.
      // Regał to element mapy, a nie broń: jego siła nie ma zależeć od tego,
      // jaką broń ma gracz. 8 × hpScale() = zawsze 2.7 szeregowego, nigdy elita.
      const dmg = 8 * hpScale() * SKALA_WROGA;          // K4: w skali HP wrogów (= 2,7 szeregowego)
      let przygnieceni = 0;
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        if (Math.abs((s.poZ ? e.pos.x : e.pos.z) - s.b) > s.len / 2 + 0.7) continue;
        const wzdluz = ((s.poZ ? e.pos.z : e.pos.x) - s.piv) * s.kier;   // leży od pivotu w stronę upadku
        if (wzdluz < -0.7 || wzdluz > SHELF_H + 0.7) continue;
        // K4: przez zadajDmg (źródło 'regal', bez skali — już ×SKALA_WROGA; bez krytyka byłoby
        // wierniej, ale regał jest „bronią mapy" i krytyk Pieprzu Nonny działa tu jak wszędzie)
        zadajDmg(e, dmg, { bezSkali: true, zr: 'regal', col: '#ffd75e', sc: 1.5 });
        if (!e.T.bezKb) { if (s.poZ) e.kb.set(0, 0, s.kier * 3); else e.kb.set(s.kier * 3, 0, 0); }
        przygnieceni++;
      }
      // NAGRODA za dobre ustawienie regału — bez niej przewrócenie nie dawało
      // graczowi nic mierzalnego poza hałasem
      if (przygnieceni >= 3) {
        const pp = regPkt(s, s.piv, s.b);
        dmgPop(pp.x, s.g0 + 2.2, pp.z, T('ROZWALKA x', 'PILE-UP x') + przygnieceni, '#ffd75e', 2.2);
        const pm = regPkt(s, s.piv + s.kier * 1.2, s.b);
        G.coins.push(makeCoin(pm.x, pm.z, 3));
        G.hitstop = Math.max(G.hitstop, 0.06);
      }
      // gracz też dostanie, jeśli stoi w linii upadku — regały nie wybierają
      if (Math.abs((s.poZ ? P.pos.x : P.pos.z) - s.b) < s.len / 2 + 0.6 && P.iframes <= 0 && !P.airborne) {
        const wzdluz = ((s.poZ ? P.pos.z : P.pos.x) - s.piv) * s.kier;
        if (wzdluz > -0.6 && wzdluz < SHELF_H + 0.6)
          ranGracza(HP_SERCA, 'regal', { nietyk: 1.1, shake: 0.5 });   // element mapy: stałe 1 serce
      }
      AUDIO.sfx('wybuch');
      G.shake = Math.max(G.shake, 0.4);
      G.hitstop = Math.max(G.hitstop, 0.05);
      const ps = regPkt(s, s.piv + s.kier * SHELF_H * 0.5, s.b), psx = ps.x, psz = ps.z;
      okruchy(psx, s.g0 + 0.5, psz, 0xe4e8ec, 8);                 // blacha regału
      // rozsypany TOWAR (kolory działu i paczek) — tyle samo losowań co dawniej (strumień bota)
      for (const kol of [0xd94f4f, 0x4f8fd9, 0xf2c14a]) {
        const pt = regPkt(s, s.piv, s.b + (Math.random() - 0.5) * s.len);
        okruchy(pt.x, s.g0 + 1.2, pt.z, kol, 3);
      }
      puff(psx, s.g0 + 0.4, psz, 0xe8dcc8, 3.5);
      novaRing(psx, psz, 3);
      // DOMINO: koniec leżącego regału trąca to, co stoi za alejką (alejki ≤ 3,4 j. przenoszą upadek dalej)
      const pd = regPkt(s, s.piv + s.kier * SHELF_H, s.b);
      przewrocRegaly(pd.x, pd.z, 1.0, 0.08);
    }
    if (k >= 1) {
      s.stan = 'lezy';
      s.tLezy = 0;
      ustawRegal(s, Math.PI / 2);                    // `stan` już 'lezy' → cień kontaktowy leżącego
      // Bryła kolizji z pionowej ściany (top 2,46) robi się RUMOWISKIEM, na które wskoczysz jednym skokiem
      brylaRegalu(s, true);
      if (s.maska) s.maska();                        // pole hordy: wrak jest „niski" — horda przez niego przełazi
      // KTO ZOSTAŁ POD REGAŁEM, LĄDUJE NA NIM. Bez tego stoi się WEWNĄTRZ świeżej
      // bryły kolizji: przy parze regałów dwie bryły stoją stykiem, więc
      // wypchnięcia z obu stron znoszą się i nie ma gdzie uciec — stąd przenikanie.
      const wSrodku = (px, pz) => Math.abs(px - s.solid.x) < s.solid.hw + 0.4 &&
                                  Math.abs(pz - s.solid.z) < s.solid.hl + 0.4;
      if (wSrodku(P.pos.x, P.pos.z) && P.y < s.solid.top) {
        P.y = s.solid.top; P.vy = 0; P.airborne = false; P.usedDouble = false;
        P.jumpBufT = 0;                            // inaczej bufor odpaliłby skok sekundy później
      }
      for (const e of G.enemies) if (!e.dying && wSrodku(e.pos.x, e.pos.z) && e.ty < s.solid.top) e.ty = s.solid.top;
      G.padajace.splice(i, 1);
    }
  }
}

// ============================== PĘTLA ==============================
let playerBB = null;
const clock = new THREE.Clock();
const _camCel = new THREE.Vector3();               // cel kamery — trwały, żeby nie alokować co klatkę

const _toWroga = new THREE.Vector3(), _doGracza = new THREE.Vector3();   // wektory robocze pętli (E1)
function update(dt) {
  if (G.dying) { updateDeath(dt); return; }
  // HITSTOP: zabicie elity/bossa na moment prawie zatrzymuje świat. Kosztuje
  // jedną linijkę, a robi połowę „ciężaru" ciosu — czas realny odejmujemy
  // PRZED spowolnieniem, żeby hitstop nie przedłużał się sam.
  const dtReal = dt;
  if (G.hitstop > 0) { G.hitstop -= dtReal; dt *= 0.14; }
  // KINO (wejscie bossa): czas na ~1.2 s zwalnia do 55%. Odliczamy REALNYM dt,
  // inaczej hitstop w tej samej klatce rozciagnalby oprawe kilkukrotnie.
  if (G.kino > 0) { G.kino -= dtReal; dt *= G.kinoMn || 0.55; }   // K8: zwycięstwo zwalnia do ×0,4
  else G.kinoMn = 0.55;
  refreshSpriteTilt();                             // pochylenie billboardów liczymy raz na klatkę
  G.time += dt;
  // E1-bieg K8: od ciszy 9:52 czerwone „DON" (puls), od wejścia Dona czas walki „+0:23"
  const tmEl = document.getElementById('timer');
  tmEl.textContent = G.donStart != null ? '+' + fmtTime(G.time - G.donStart) : G.cisza ? 'DON' : fmtTime(G.time);
  if (tmEl.classList.contains('don') !== (G.cisza && G.donStart == null)) tmEl.classList.toggle('don');
  if (DEV) devProbka();                            // HORDA.pomiar(): próbka co 10 s czasu gry
  // E1-bieg: bez „ZAGROŻENIE N" i bez paska Wieczoru (decyzja właściciela 24.09) — rytm niosą nazwane
  // zdarzenia z kalendarza WIECZOR, a HUD pokazuje sam zegar

  // ---- obrót kamery klawiszami ----
  // 2.6 rad/s = tyle, co pełne wychylenie prawego drążka pada (spójność); 90° w 0.6 s.
  // Mysz przy 0.0032 rad/px robi 90° w ~490 px, czyli jednym ruchem — klawisze zawsze
  // będą wolniejsze, ale 2.2 (90° w 0.71 s) czytało się jak „kamera się zacina".
  if (keys.KeyQ) camYaw += 2.6 * dt;
  if (keys.KeyE) camYaw -= 2.6 * dt;

  // ---- ruch gracza (względem kamery) ----
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (touch.on) { mx = touch.vx; mz = touch.vy; }
  else if (PAD.mx || PAD.mz) { mx = PAD.mx; mz = PAD.mz; }   // lewy drążek pada
  if (DEV && (BOT.on || _ruchDev)) {               // DEV: bot / HORDA.ruch nadpisują wejście
    if (BOT.on) {                                  // kierunek bota jest w świecie → na osie kamery
      const b = botRuch(), sy = Math.sin(camYaw), cy = Math.cos(camYaw);
      mx = b.x * cy - b.z * sy; mz = b.x * sy + b.z * cy;
    } else { mx = _ruchDev.x; mz = _ruchDev.z; }
  }
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  // przód = od kamery; prawo = prostopadle
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const rx = -fz, rz = fx;
  const wx = fx * -mz + rx * mx, wz = fz * -mz + rz * mx;
  const inWater = !P.airborne && terrainH(P.pos.x, P.pos.z) < wodaY(P.pos.x, P.pos.z) - 0.04;
  let spd = speedF() * (inWater ? 0.6 : 1);
  // KETCHUP trzyma za nogi (biblia: slow 40%); w powietrzu nie działa, jak woda
  if (!P.airborne && G.kaluze.length && wKetchupie(P.pos.x, P.pos.z)) spd *= KETCH_SLOW;
  if (G.buff.key === 'szyb') spd *= 1.45;
  if (P.gliding) spd *= 1.45;                    // szybując lecisz szybciej = ucieczka od hordy
  if (P.zasolT > 0) { P.zasolT -= dt; spd *= CFG_BIEG.don.sol.slow; }   // K8: zasolenie po Salt Storm (3 s od tiku)
  // strome zbocze (mesa): pieszo wolno POD GÓRĘ, ale skokiem normalnie
  if (ml > 0.05 && !P.airborne) {
    const inv = 1 / Math.max(ml, 0.001);
    const ahead = terrainH(P.pos.x + wx * inv * 0.7, P.pos.z + wz * inv * 0.7) - terrainH(P.pos.x, P.pos.z);
    if (ahead > 0.35) spd *= 0.5;
  }
  // ŚLISKO na rozlanej wodzie (market): bezwładność zamiast sterowania 1:1
  const slip = !P.airborne && MAPS[mapKey].indoor && onSpill(P.pos.x, P.pos.z);
  const grip = slip ? 0.85 : 18;                    // jak szybko prędkość goni wejście
  P.vx += (wx * spd - P.vx) * Math.min(1, grip * dt);
  P.vz += (wz * spd - P.vz) * Math.min(1, grip * dt);
  if (MAPS[mapKey].rzeki && !P.airborne) ograniczStromizne();
  P.pos.x += P.vx * dt;
  P.pos.z += P.vz * dt;                  // mapa bez końca — zero klamry
  if (MAPS[mapKey].rzeki && !P.airborne) pulapkiWawozu(dt);
  if (P.kbx || P.kbz) {                  // ODRZUT GRACZA (tarcza Lolliniego): niezależny od sterowania, gaśnie sam
    P.pos.x += P.kbx * dt; P.pos.z += P.kbz * dt;
    const f = Math.max(0, 1 - dt * 7);
    P.kbx *= f; P.kbz *= f;
    if (Math.abs(P.kbx) + Math.abs(P.kbz) < 0.05) P.kbx = P.kbz = 0;
  }
  solveSolids(P.pos, 0.4, P.y);          // regały/pnie/głazy odpychają
  const pTy = terrainH(P.pos.x, P.pos.z);
  ensureChunks();
  updateSun(P.pos.x, P.pos.z);
  updateGrassField();
  updateTrample(dt);                     // pole nacisku dla uginania trawy pod hordą
  updateGlazyRantu(dt);                  // Wąwozy: głazy do zepchnięcia z krawędzi
  // płaska tafla podąża za graczem tylko na mapach z JEDNYM lustrem (Łąki). Na Wąwozach
  // każda rzeka ma własny poziom, więc wodę buduje chunk (patrz `wodaChunka`).
  if (!MAPS[mapKey].rzeki) water.position.set(P.pos.x, WATER_Y, P.pos.z);
  waterCamU.value.set(P.pos.x, P.pos.z);
  if (MAPS[mapKey].water && Math.hypot(P.pos.x - waterKol.x, P.pos.z - waterKol.y) > 8) {
    waterKol.set(P.pos.x, P.pos.z);
    updateWaterColors();
  }

  // ---- fizyka pionowa (spadanie z krawędzi, skok, SZYBOWANIE, lądowanie) ----
  const ground = supportY(P.pos.x, P.pos.z, P.y);
  if (P.airborne) {
    P.vy -= 22 * dt;
    if (P.coyoteT > 0) P.coyoteT -= dt;
    if (P.jumpBufT > 0) P.jumpBufT -= dt;
    // LIŚĆ SAŁATY: przytrzymanie skoku podczas opadania = powolne szybowanie
    P.gliding = hasGlide() && jumpHeld && P.vy < -0.6;
    if (P.gliding) P.vy = Math.max(P.vy, -1.5);
    P.y += P.vy * dt;
    if (P.vy <= 0 && P.y <= ground) {                    // lądowanie
      const mocno = P.vy < -4;                           // z byle stopnia nie ma co dudnić
      P.y = ground; P.vy = 0; P.airborne = false; P.usedDouble = false; P.gliding = false;
      if (mocno) { AUDIO.sfx('ladowanie'); padWibruj(0.45, 70); }
      // Fala z LADOWANIA dzieli cooldown z bronia — bez tego skakanie w kolko
      // dawalo fale co 0.75 s zamiast co 3.2 s, czyli 791 DPS (3x wiecej niz
      // druga najlepsza bron w grze).
      // Bezpiecznik skaluje się TERAZ RAZEM Z TEMPEM: po wpięciu `fireMul()` do
      // cooldownu broni sztywne 1.2 s hamowałoby dokładnie to, co Tempo przyspiesza.
      const wT = hasWeapon('tupniecie');
      const prog = 1.2 / fireMul();
      if (stompLvl() > 0 && (!wT || wT.t < prog)) {
        nova(P.pos.x, P.pos.z, stompRad(stompLvl()), stompDmg(stompLvl()), 'tupniecie');
        if (wT) wT.t = Math.max(wT.t, prog);
      }
      // BUFOR SKOKU: spacja z ostatnich 0.12 s lotu odpala skok od razu po lądowaniu
      if (P.jumpBufT > 0) { P.jumpBufT = 0; P.vy = 8.2; P.airborne = true; AUDIO.sfx('skok'); }
    }
  } else {
    P.gliding = false;
    if (ground < P.y - 0.5) { P.airborne = true; P.vy = 0; P.coyoteT = COYOTE_CZAS; }   // zszedłeś z krawędzi → SPADASZ (coyote time)
    else P.y = ground;                                          // podążanie za terenem
  }
  if (P.shieldCd > 0) P.shieldCd -= dt;

  const moving = ml > 0.05;
  if (moving) playerBB.facing = faceAngle(wx, wz);
  if (P.airborne) playerBB.play('jump', false);
  else playerBB.play(moving ? 'run' : 'idle');
  if (P.iframes > 0) P.iframes -= dt;
  regenRosolu(dt);                                 // E2 K1: Rosół — całe serca co N s
  playerBB.mesh.visible = !G.fps.on;               // w pierwszej osobie własnego ciała nie widać
  playerBB.update(dt, P.pos, P.y, ground);
  updateHitFlash();
  updateSmrod();
  updateLettuce(dt);
  updateKarabin(dt);
  // ziarna lecą dalej NIEZALEŻNIE od trybu — wystrzelone w ostatniej sekundzie
  // muszą dolecieć, a nie zniknąć w powietrzu
  if (G.karabinPoc.length) updateKarabinPoc(dt);
  updateBossHp();
  if (G.gluty.length) updateGluty(dt);
  if (G.kaluze.length) updateKaluze(dt);
  if (G.chmury && G.chmury.length) updateChmury(dt);            // E2 K6b
  if (G.kaluzeGracza && G.kaluzeGracza.length) updateKaluzeGracza(dt);   // E2 K6d
  if (G.telegrafy.length) updateTelegrafy(dt);     // E1-bieg K7/K8: telegrafy na ziemi
  wybierzSylwetki(dt);                             // E3 K2: kto dostaje sylwetkę (co 0,2 s)
  if (G.skrzynieKap.length) updateSkrzynieKaprala(dt);
  updateDon(dt, dtReal);                           // K8: pociski, lawina, sól, zwycięstwo
  if (!G.running) return;                          // zwycięstwo mogło właśnie zamknąć bieg

  // ---- E1-bieg: SPAWNER WIECZORU (tabela fal, paczki, podłoga, recykling, zdarzenia) ----
  // Zastępuje interwał + `batch`, fale okrążające co 30 s i bossów co 2 min (`bossAt` usunięte).
  // market (30.09): to samo pole przepływu (maski z regałów) — horda obchodzi rzędy zamiast stać przy plecach regału;
  // pociski i „utknął w bryle" dalej tylko na osiedlu (osWBryle patrzy na flagę `os`, której bryły marketu nie mają)
  const osNav = !!(MAPS[mapKey].osiedle || (MAPS[mapKey].indoor && MK_OPCJE.poleHordy));
  if (osNav) osNawigacjaTick(dt);                  // Osiedle: pole przepływu hordy PRZED spawnem (spawn szuka wolnej komórki)
  if (!STRES && !G.dpsTest) spawnerWieczoru(dt);   // STRES (DEV) = własny dosyp; E2 dpsBroni = same manekiny

  // ---- separacja wrogów ----
  const grid = new Map(), CELL = 1.4;
  for (const e of G.enemies) {
    if (e.dying) continue;
    const key = Math.floor(e.pos.x / CELL) * 4096 + Math.floor(e.pos.z / CELL);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(e);
  }
  for (const e of G.enemies) {
    if (e.dying) continue;
    const cx = Math.floor(e.pos.x / CELL), cz = Math.floor(e.pos.z / CELL);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const cell = grid.get(gx * 4096 + gz); if (!cell) continue;
      for (const o of cell) {
        if (o === e) continue;
        const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
        const d2 = dx * dx + dz * dz, min = 0.85;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) / d * 0.5 * dt * 14;
          e.pos.x += dx * push; e.pos.z += dz * push;
        }
      }
    }
  }

  // ---- wrogowie ----
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.dying) {
      let koniec;
      if (e.rozpad !== undefined) koniec = updateRozpad(e, dt);   // śmierć z kodu (bez arkusza)
      else { e.bb.update(dt, e.pos, e.ty); koniec = e.bb.done; }
      if (koniec) {
        e.bb.dispose();
        if (e.rozpadMat) e.rozpadMat.dispose();      // klon materiału trzeba oddać
        if (e.ring) scene.remove(e.ring);
        G.enemies.splice(i, 1);
      }
      continue;
    }
    // SOKOWIRÓWKA ZWABIA: jeśli stoi bliżej niż 9.5 j., wróg idzie po NIĄ, nie po
    // gracza. To zamienia wieżyczkę w prawdziwą przynętę — stawiasz ją w alejce
    // i horda skręca, zamiast gonić Ciebie. Obrażenia kontaktowe gracza liczą się
    // dalej od DYSTANSU DO GRACZA, więc przynęta nie daje nietykalności.
    // Gracz jest WAZNIEJSZYM celem: wiezyczka przejmuje wroga tylko wtedy, gdy
    // jest wyraznie blizej (dystans do niej x 1.7 musi byc mniejszy niz do gracza).
    // Dzieki temu przynęta odciaga hordę w alejce, ale nie robi z gracza widza.
    let celPos = P.pos;
    if (G.turrets.length && !e.kapral && !e.T.boss && !e.odwrot) {   // kaprale i Don ignorują wabienie (spec §2.1, §3.3)
      const dGracz = e.pos.distanceTo(P.pos);
      let najl = SOKO_WABI;
      for (const t of G.turrets) {
        const dt2 = t.pos.distanceTo(e.pos);
        if (dt2 < najl && dt2 * 1.7 < dGracz) { najl = dt2; celPos = t.pos; }
      }
    }
    const to = _toWroga.copy(celPos).sub(e.pos).setY(0);   // wektor roboczy (E1: bez alokacji na wroga)
    const dCel = to.length(); to.normalize();
    const d = e.pos.distanceTo(P.pos);              // do gracza — od tego zależą jego obrażenia
    // OSIEDLE: gdy droga po polu przepływu jest dłuższa od prostej o > 1,2 j. (blok w poprzek) — idź za polem,
    // czyli do najbliższego przejścia/bramy. Blisko gracza na otwartym podwórku zostaje marsz po prostej.
    // Próg BEZWZGLĘDNY, nie względny: przy „L > d·1,08" daleki wróg z 4 j. objazdu na 40 j. szedł prosto w ścianę
    // i stał przy niej (bot 10:00: 0,8% próbek „stoi", rekord 48 s — wszyscy przy licu bryły).
    if (osNav && celPos === P.pos && !e.odwrot && !e.lot && OS.nav.kierunek(e.pos.x, e.pos.z, _osK) && _osK.L > dCel + 1.2)
      to.set(_osK.x, 0, _osK.z);
    // E1-bieg K7/K8: kapral i Don mają tempo wprost w j./s (`e.tempo`, bez spdScale — stała godzina)
    let es = e.tempo || e.T.speed * (e.elite ? 0.85 : 1) * spdScale();
    // BOSSA NIE DA SIE ZGUBIC (decyzja wlasciciela: „przeciwnik, ktorego trzeba pokonac").
    // Prowadzi horde (4.4 > Friesetti 4.0), a z bardzo daleka jeszcze docisnie —
    // wiec odejscie na drugi koniec mapy nie jest odpowiedzia na walke z Donem.
    const duzy = e.T.boss || e.kapral;
    if (duzy && d > 26) es *= 1.35;
    // ogluszenie z ewolucji "DZIS NIE WEJDZIESZ"; kapral i Don: ×0,25 czasu (spec §2.1, §3.3)
    if (e.stun > 0) { e.stun -= dt * (duzy ? 4 : 1); es = 0; }
    if (e.ty < wodaY(e.pos.x, e.pos.z) - 0.04) es *= 0.7;   // woda spowalnia też ich
    if (MAPS[mapKey].rzeki) {                           // Wąwozy: błoto i nurt działają też na hordę
      es *= 1 - TW.wspolczynnikBlota(e.pos.x, e.pos.z) * BLOTO_WROG;
      TW.spychanieNurtu(e.pos.x, e.pos.z, _pwE);
      if (_pwE[0] || _pwE[1]) { e.pos.x += _pwE[0] * NURT_WROG * dt; e.pos.z += _pwE[1] * NURT_WROG * dt; }
    }
    if (G.buff.key === 'slow') es *= 0.6;
    if (G.buff.key === 'mroz') es = 0;                  // MROŻONKI: horda staje na kilka sekund
    // E2 K6: zasmrodzony ×0,8 (kaprale ×0,9), kałuża ×0,5 — między sobą się nie mnożą (bierzemy najmniejsze);
    // z buffem „slow", wodą i błotem mnożą się jak dotąd (Mrożonki i tak zatrzymują)
    if (e.smrodDo > G.time || e.kaluzaDo > G.time) {
      let mn = 1;
      if (e.smrodDo > G.time) mn = Math.min(mn, duzy ? 0.9 : 0.8);
      if (e.kaluzaDo > G.time) mn = Math.min(mn, duzy ? 0.9 : 0.5);
      es *= mn;
    }
    // E1-bieg: ŚCIANA HORDY przez pierwsze 5 s idzie RAZEM — wspólny kierunek i prędkość najwolniejszego
    // typu, bez szarż i podskoków; potem każdy wraca do swojego AI
    const wSciane = e.sciana && e.sciana.t > 0;
    if (wSciane) {
      e.sciana.t -= dt;
      if (!osNav) to.copy(e.sciana.dir);              // osiedle: ściana idzie razem, ale przejściami (pole), nie w blok
      if (e.stun > 0 || G.buff.key === 'mroz') es = 0; else es = e.sciana.spd * (G.buff.key === 'slow' ? 0.6 : 1);
    }
    // E1-bieg K8: ODWRÓT w ciszy 9:52 (spec §3.1) — idą OD gracza, bez ciosów i strzałów, ale da się ich
    // kosić; > 40 j. = znikają bez łupu i bez licznika. Woda, błoto i ogłuszenie ich nie trzymają.
    if (e.odwrot) {
      if (d > 40) { e.bb.dispose(); G.enemies.splice(i, 1); continue; }
      to.set(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z).normalize();
      es = Math.max(e.T.speed, 3) * 1.3;
    }
    if (e.kapral && !e.odwrot) {                     // K7: sztuczka kaprala
      es = aiKaprala(e, dt, d, to, es);
      if (e.dying) continue;
    }
    if (e.don) {                                     // K8: ataki Dona (sam liczy swoje tempo)
      es = aiDona(e, dt, d, to, es);
      if (e.dying) continue;
    }
    // ---- SZARŻA FRIESETTIEGO: tell 0.6 s (przysiad + okrąg + „!"), potem ×3 po PROSTEJ, potem ogłuszenie ----
    // Do 03.09 „szarża" to było samo `speed: 4.0` — zero windupu, zero tellu, nic do uniknięcia.
    // Kierunek zamrażamy w chwili startu: krok w bok i frytka przelatuje obok, po czym leży
    // ogłuszona 1.2 s — to jest okno na cios, którego dotąd nie było.
    if (e.T.szarzuje && !wSciane && !e.kapral && !e.odwrot) {
      e.szarzaCd = (e.szarzaCd == null ? 1.5 : e.szarzaCd) - dt;
      if (!e.faz && e.szarzaCd <= 0 && es > 0 && d > FRIES_MIN && d < FRIES_MAX && P.y - e.ty < 1.2) {
        e.faz = 'tell'; e.fazT = FRIES_TELEGRAF;
        novaRing(e.pos.x, e.pos.z, 1.1);                                   // okrąg pod stopami
        dmgPop(e.pos.x, e.ty + 0.6, e.pos.z, '!', '#f6cd51', 1.4, 'wazny');
      }
      if (e.faz === 'tell') {
        e.fazT -= dt; es = 0;
        const k = 1 - e.fazT / FRIES_TELEGRAF;                             // przysiad przed wyskokiem
        e.bb.mesh.scale.set(e.bb.h * (1 + 0.22 * k), e.bb.h * (1 - 0.18 * k), 1);
        if (e.fazT <= 0) {
          e.faz = 'szarza'; e.fazT = FRIES_CZAS;
          e.szDir = P.pos.clone().sub(e.pos).setY(0).normalize();          // po prostej, na gracza
          e.bb.mesh.scale.set(e.bb.h, e.bb.h, 1);                          // Billboard.update nie rusza skali
          AUDIO.sfx('piorun');                                             // świst startu
        }
      } else if (e.faz === 'szarza') {
        e.fazT -= dt;
        if (es > 0) { to.copy(e.szDir); es *= FRIES_MNOZNIK; }
        if (e.fazT <= 0) { e.faz = null; e.stun = FRIES_OGLUSZENIE; e.szarzaCd = FRIES_CD; }
      }
    }
    // wspinaczka na mesę = powolutku (chwila oddechu dla gracza na górce)
    const wspin = terrainH(e.pos.x + to.x * 0.7, e.pos.z + to.z * 0.7) - e.ty;
    if (wspin > 0.18) es *= 0.35;
    if (MAPS[mapKey].indoor && onSpill(e.pos.x, e.pos.z)) es *= 0.55;   // im też ślisko
    if (celPos !== P.pos && dCel < 1.1) es = 0;      // dotarł do przynęty — bije ją, nie przepycha
    // ARTYLERIA (Ketchupino): PIERWSZY WRÓG DYSTANSOWY. Nie szarżuje — trzyma się
    // w okienku [KETCH_BLISKO, KETCH_DALEKO]: za blisko cofa się, za daleko podchodzi,
    // w okienku STOI i pluje. Dzięki temu nie da się go „przeczekać" bieganiem
    // w kółko, ale też nie wchodzi w młynek broni przy graczu.
    if (e.T.artyleria && !e.kapral && !e.odwrot) {
      if (d < KETCH_BLISKO) { e.pos.addScaledVector(to, -es * dt * 1.15); }   // odwrót
      else if (d <= KETCH_DALEKO) { /* stoi i celuje */ }
      else e.pos.addScaledVector(to, es * dt);
      // animacja ataku jest jednorazowa — po niej wracamy do biegu, inaczej butla
      // zastygłaby w pozie wyciskania na resztę biegu
      if (e.bb.anim === 'punch' && e.bb.done) e.bb.play(e.T.walk);
      e.plunCd = (e.plunCd || KETCH_CD * 0.6) - dt;
      if (e.plunCd <= 0 && d <= KETCH_DALEKO + 2 && !e.dying) {
        e.plunCd = KETCH_CD;
        plunKetchupem(e);
      }
    } else e.pos.addScaledVector(to, es * dt);
    if (!e.T.bezKb && !e.bezKb) {                      // Gummini (i Don) są odporni na odrzut
      e.pos.addScaledVector(e.kb, dt * 8 * (e.kbMn || 1));   // kapral: ×0,3 (ciężki mini-boss)
      e.kb.multiplyScalar(Math.max(0, 1 - dt * 10));
    } else e.kb.set(0, 0, 0);
    if (e.T.wiruje && !e.kapral) {
      // Lollini kręci się jak piła TARCZOWA — ale że to billboard, symulujemy to
      // ściskaniem w poziomie (jak obracający się dysk oglądany z boku) + chwile spoczynku
      const cykl = (G.time * 0.55 + e.faza) % 3.0;
      e.wirujeTeraz = cykl < 1.9 && es > 0;              // tarcza bije dalej i odrzuca (niżej); zamrożony/ogłuszony nie wiruje
      if (e.wirujeTeraz) {                               // faza wirowania
        const spin = Math.cos(G.time * 9 + e.faza);
        e.bb.mesh.scale.x = e.bb.h * (0.32 + 0.68 * Math.abs(spin));
      } else {
        e.bb.mesh.scale.x = e.bb.h;                      // chwila przerwy — po prostu idzie
      }
    }
    if (e.T.kamikaze && !e.kapral && !e.odwrot && d < 2.2 && !e.zapalony) {   // Sodino: syczy i wybucha
      e.zapalony = true; e.lont = 1.0;
    }
    if (e.zapalony) {
      e.lont -= dt;
      e.bb.mesh.scale.setScalar(e.bb.h * (1 + Math.sin(G.time * 30) * 0.12));
      if (e.lont <= 0) {
        nova(e.pos.x, e.pos.z, 2.6, 0);                           // wybuch rani TYLKO gracza
        if (e.pos.distanceTo(P.pos) < 2.6 && P.y - e.ty < 1.2)
          ranGracza(obrazeniaWroga(1.2), 'sodino', { shake: 0.4 });   // baza 1,2 (spec §4.2)
        dmgPop(e.pos.x, e.ty + 0.8, e.pos.z, T('BUM!', 'BOOM!'), '#ff9d3f', 1.6);
        killEnemy(e, i);
        continue;
      }
    }

    // ---- kolizja, SKOKI i WSPINACZKA na półki ----
    const blockTop = solveSolids(e.pos, 0.35, e.ty);
    // osiedle: wepchnięty GŁĘBOKO w bryłę (odrzut, Ręka Nonny, styk dwóch brył) — solveSolids potrafi go
    // przerzucać między sąsiednimi bryłami; wtedy na najbliższą wolną komórkę (maska ścian = tani filtr)
    if (osNav && OS.nav.scianaW(e.pos.x, e.pos.z) && osWBryle(e.pos.x, e.pos.z, 0, e.ty) && OS.nav.najblizszyWolny(e.pos.x, e.pos.z, 10, _osK)) {
      e.pos.x = _osK.x; e.pos.z = _osK.z;
    }
    const eGround = supportY(e.pos.x, e.pos.z, e.ty);
    e.jumpCd -= dt;
    if (e.lot) {                                         // K7/K8: skok Gommone / spadający Don — wysokość liczy AI
    } else if (e.vy !== 0) {                             // w locie (po skoku)
      e.vy -= 22 * dt;
      e.ty += e.vy * dt;
      if (e.vy < 0 && e.ty <= eGround) { e.ty = eGround; e.vy = 0; }
    } else if (blockTop > e.ty + 0.1 && (P.y > e.ty + 0.6 || blockTop - e.ty < 1.7)) {
      // Przeszkoda: gracz wyżej ALBO przeszkoda niska (rumowisko po regale).
      // Zmierzone: bez drugiego warunku 20 wrogów przez 30 s ani razu nie przeszło
      // przez leżący regał i nie obeszło stojącego — stali wciśnięci w deskę,
      // bo silnik nie ma omijania przeszkód. Teraz przewrócony regał JEST przejściem
      // (dla nich mozolnym: 0.95 j./s wspinaczki), a nie ścianą na zawsze.
      if (blockTop - e.ty < 1.5 && e.jumpCd <= 0) { e.vy = 6.6; e.jumpCd = 1.6; }
      else { e.ty = Math.min(blockTop + 0.06, e.ty + 0.95 * dt); e.climbing = true; }
    } else if (e.T.skacze && !wSciane) {
      e.climbing = false;
      const podskok = Math.abs(Math.sin(G.time * 4.5 + e.faza)) * 0.75;   // ciągłe odbijanie
      e.ty = eGround + podskok;
    } else {
      e.climbing = false;
      // co jakiś czas podskakują z radości (i przeskakują drobne nierówności)
      if (!wSciane && e.jumpCd <= 0 && d < 22 && Math.random() < 0.35 * dt) { e.vy = 5.4; e.jumpCd = 2.5 + Math.random() * 3; }
      if (eGround < e.ty - 0.05) e.ty = Math.max(eGround, e.ty - 9 * dt);  // schodzenie/spadanie
      else e.ty = eGround;
    }
    e.bb.facing = faceAngle(to.x, to.z);
    e.orbCd -= dt;
    const eG = e.lot ? terrainH(e.pos.x, e.pos.z) : e.ty;   // w locie cień zostaje na ziemi
    e.bb.update(dt, e.pos, e.ty, eG);
    if (e.ring) e.ring.position.set(e.pos.x, eG + 0.06, e.pos.z);
    if (e.ring2) {                                     // K7: podwójny krąg kaprala pulsuje 2 Hz
      const p = 1 + 0.09 * Math.sin(G.time * 4 * Math.PI);
      e.ring.scale.set(3.0 * p, 1, 3.0 * p);
      e.ring2.position.copy(e.ring.position);
      e.ring2.scale.set(2.3 / p, 1, 2.3 / p);
    }
    // Lollini w fazie wirowania sięga o LOLLINI_TARCZA dalej — „wolny, ale nie właź pod tarczę"
    // było dotąd tylko podpowiedzią na ekranie ładowania, w kodzie kręcił się wyłącznie sprite.
    const tarcza = e.wirujeTeraz ? LOLLINI_TARCZA : 0;
    // K7/K8: kapral (×1,9) i Don sięgają dalej; w odwrocie (cisza) nikt nie bije
    if (!e.odwrot && d < 0.9 + (e.T.boss ? 0.8 : e.kapral ? 0.5 : 0) + tarcza && P.iframes <= 0 && P.y - e.ty < 1.0) {
      // kontakt = 1 serce (ranGracza ignoruje siłę; decyzja 25.09 „1 uderzenie = 1 serce")
      const ile = HP_SERCA;
      // kontakt kaprala ma własny klucz ('kapral3-dotyk'): 'kapral3' to jego sztuczka (szarża) — „Zabił cię" je rozróżnia
      if (ranGracza(ile, e.don ? 'don' : e.kapral ? 'kapral' + e.kapral + '-dotyk' : e.type) && tarcza) {   // TARCZA PILARSKA wyrzuca gracza z zasięgu
        const kx = P.pos.x - e.pos.x, kz = P.pos.z - e.pos.z, kl = Math.hypot(kx, kz) || 1;
        P.kbx = kx / kl * LOLLINI_ODRZUT; P.kbz = kz / kl * LOLLINI_ODRZUT;
        G.shake = 0.5;
      }
      if (G.dying) return;
    }
  }

  // ---- BRONIE: tick każdej posiadanej ----
  for (const w of P.weapons) WEAPONS[w.key].tick(w, dt);
  odswiezStawBtn();                      // PO tickach — inaczej licznik ładunków jest o klatkę wstecz
  odswiezSmrodBtn();

  // ---- pociski kul ----
  const boomQ = [];                      // wybuchy meteorów PO pętli (bezpieczne indeksy)
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i];
    s.mesh.position.addScaledVector(s.dir, 16 * dt);
    // leci na wysokości wystrzału, płynnie schodząc do poziomu terenu
    const docel = terrainH(s.mesh.position.x, s.mesh.position.z) + 1.0;
    s.y += (docel - s.y) * Math.min(1, 3 * dt);
    s.mesh.position.y = s.y;
    // WIRUJACY POCISK (scyzoryk): rzucony noz musi sie obracac, inaczej sunie w powietrzu
    // jak naklejka. Ten sam idiom co butelka i bumerang — `rotation.set(0, camYaw, roll)`:
    // yaw ustawia billboard twarza do kamery, a roll to obrot w plaszczyznie ekranu.
    if (s.wiruje) {
      s.obrot = (s.obrot || 0) + dt * 17 * s.wiruje;
      s.mesh.rotation.set(0, camYaw, s.obrot);
    }
    s.life -= dt;
    let dead = s.life <= 0;
    if (!dead && osNav && OS.pociskiStop && OS.nav.scianaW(s.mesh.position.x, s.mesh.position.z) && osWBryle(s.mesh.position.x, s.mesh.position.z, 0, s.mesh.position.y)) dead = true;   // osiedle: pocisk rozbija się o blok
    if (!dead) for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying || s.hit.has(e)) continue;
      const rr = (e.T.boss || e.kapral) ? 1.4 : 0.75;
      const dx = s.mesh.position.x - e.pos.x, dz = s.mesh.position.z - e.pos.z;
      if (dx * dx + dz * dz < rr * rr) {
        s.hit.add(e);
        spark(e.pos.x, e.ty + 1.1, e.pos.z);
        const c = zadajDmg(e, (s.dmg || 1) * dmgAll(), { col: '#ffe066', sfx: 'traf', kb: s.dir, kbSila: 1.6, zr: s.zr || 'kule', bonusNoz: s.bonusNoz });
        // obrażenia BAZOWE (bez krytyka pocisku) — nova rzuca krytyk sama; z `c.dmg`
        // wybuch mógł wyjść ×9 (recenzja 03.09)
        if (P.evo.meteor) boomQ.push({ x: e.pos.x, z: e.pos.z, dmg: (s.dmg || 1) * dmgAll() * 0.6 });
        if (s.pierce-- <= 0) { dead = true; break; }
      }
    }
    if (dead) { scene.remove(s.mesh); G.shots.splice(i, 1); }
  }
  for (const b of boomQ) nova(b.x, b.z, 1.8, b.dmg, 'kule');

  // ---- butelki żula (lot łukiem → wybuch) ----
  for (let i = G.lobs.length - 1; i >= 0; i--) {
    const L = G.lobs[i]; L.t += dt;
    const k = Math.min(1, L.t / L.dur);
    const x = L.from.x + (L.to.x - L.from.x) * k, z = L.from.z + (L.to.z - L.from.z) * k;
    L.mesh.position.set(x, terrainH(x, z) + 1 + Math.sin(k * Math.PI) * (L.wys || 3.2), z);
    L.mesh.rotation.set(0, camYaw, L.t * 9);
    if (k >= 1) {
      scene.remove(L.mesh); G.lobs.splice(i, 1);
      // `r`/`dmg` sa OPCJONALNE — butelka zula liczy je po staremu ze swojego poziomu,
      // krzak pomidorowy podaje wlasne, bo to inna bron o innej krzywej
      nova(x, z, L.r || (2 + 0.3 * L.lvl), (L.dmg || (2 + 0.6 * L.lvl)) * dmgAll(), L.zr || 'butelka');
      if (L.kaluza) postawKaluze(x, z);             // E2 K6d: KAŁUŻA POD BLOKIEM
      G.shake = Math.max(G.shake, L.dmg ? 0.05 : 0.1);
    }
  }

  // ---- radio-bumerangi (tam i z powrotem) ----
  // B13: tor sprawdzany w podkrokach ≤ 1/120 s (przy 30 FPS 4, przy 60 — 2) — inaczej przy niskim FPS pocisk
  // przeskakiwał wrogów i łapał kontakt później niż przy wysokim (±7% DPS)
  const bumN = Math.max(1, Math.min(4, Math.ceil(dt * 120 - 1e-6))), bumDt = dt / bumN;
  for (let i = G.boomers.length - 1; i >= 0; i--) {
    const B = G.boomers[i];
    if (B.calamita) {                                  // E2 K6c
      let koniec = false;
      for (let s = 0; s < bumN && !koniec; s++) { B.t += bumDt; koniec = lotCalamity(B, bumDt); }
      if (koniec) { scene.remove(B.mesh); G.boomers.splice(i, 1); }
      continue;
    }
    if ((B.t + dt) / B.dur >= 1) { scene.remove(B.mesh); G.boomers.splice(i, 1); continue; }
    let x = 0, z = 0;
    for (let s = 0; s < bumN; s++) {
      B.t += bumDt;
      const k = B.t / B.dur, r = Math.sin(k * Math.PI) * B.dist;   // wylot i powrót
      x = P.pos.x + B.dir.x * r; z = P.pos.z + B.dir.z * r;
      const powrot = k > 0.55;
      if (powrot && !B.powrot) { B.powrot = true; B.hit.clear(); }   // w drodze powrotnej bije ponownie (B13: co BUMERANG.cd s)
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        const dx = x - e.pos.x, dz = z - e.pos.z;
        if (dx * dx + dz * dz < 1.1) {
          const mn = bumerangTraf(B, e, powrot);
          if (!mn) continue;
          spark(e.pos.x, e.ty + 1.0, e.pos.z);
          zadajDmg(e, mn * (2 + 0.5 * B.lvl) * dmgAll(), { col: '#d9b3ff', kb: _kbV.set(-dx, 0, -dz), kbSila: 2.4, zr: B.zr || 'bumerang' });
        }
      }
    }
    B.mesh.position.set(x, terrainH(x, z) + 1.0, z);
    B.mesh.rotation.set(0, camYaw, B.t * 12);
  }

  // ---- kury-kamikaze 🐔💥 ----
  for (let i = G.kury.length - 1; i >= 0; i--) {
    const K = G.kury[i]; K.t += dt;
    let near = null, nd = 1e9;
    for (const e of G.enemies) {
      if (e.dying) continue;
      const d = e.pos.distanceTo(K.pos);
      if (d < nd) { nd = d; near = e; }
    }
    if (near) {
      const dir = near.pos.clone().sub(K.pos).setY(0).normalize();
      K.pos.addScaledVector(dir, 5.2 * dt);
      K.bb.facing = faceAngle(dir.x, dir.z);
    }
    K.bb.update(dt, K.pos, terrainH(K.pos.x, K.pos.z));
    if ((near && nd < 1.0) || K.t > (K.mini ? 1.1 : 4)) {  // BUM! (mini mają krótszy lont)
      const promien = (K.mini ? 1.5 : 2.5 + 0.3 * K.lvl);
      const sila = (K.mini ? 1.6 : 3 + 0.7 * K.lvl) * dmgAll();
      nova(K.pos.x, K.pos.z, promien, sila, 'kura');
      dmgPop(K.pos.x, terrainH(K.pos.x, K.pos.z) + 0.6, K.pos.z,
             K.mini ? 'POP!' : T('POP-POP-BUM!', 'POP-POP-BOOM!'), '#ffd75e', K.mini ? 1.0 : 1.6);
      okruchy(K.pos.x, terrainH(K.pos.x, K.pos.z) + 0.5, K.pos.z, 0xf6e27a, K.mini ? 3 : 7);
      G.shake = Math.max(G.shake, K.mini ? 0.08 : 0.2);
      // BOMBA KASETOWA: z wybuchu wylatuje 6 mniejszych ziaren w wachlarzu,
      // każde z własnym krótkim lontem — stąd druga fala popcornu
      if (P.evo.kaseta && !K.mini) {
        for (let n = 0; n < 6; n++) {
          const a = (n / 6) * Math.PI * 2 + Math.random() * 0.4;
          const bb2 = new Billboard('kernello_boomello', 0.62);
          bb2.play('run');
          G.kury.push({ bb: bb2, mini: true, lvl: K.lvl, t: 0,
                        pos: K.pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6)) });
        }
      }
      K.bb.dispose(); G.kury.splice(i, 1);
    }
  }

  // ---- pioruny (efekt wizualny) ----
  for (let i = G.bolts.length - 1; i >= 0; i--) {
    const b = G.bolts[i]; b.t += dt;
    b.mesh.material.opacity = Math.max(0, 1 - b.t * 6);
    // klon materialu = wlasny obiekt; bez dispose zostaje po nim smiec i rosnie
    // `usedTimes` programu (te same trzy pule co `pops`/`puffs`, tylko tam dispose byl)
    if (b.t > 0.18) { scene.remove(b.mesh); b.mesh.material.dispose(); G.bolts.splice(i, 1); }
  }

  // ---- iskry ----
  for (let i = G.sparks.length - 1; i >= 0; i--) {
    const s = G.sparks[i]; s.t += dt;
    s.mesh.scale.setScalar(1 + s.t * 6);
    s.a = Math.max(0, 1 - s.t * 5);
    if (s.t > 0.2) G.sparks.splice(i, 1);
  }

  // ---- okruchy po zabitych (odbijają się od terenu i gasną skalą) ----
  for (let i = G.okruchy.length - 1; i >= 0; i--) {
    const o = G.okruchy[i]; o.t += dt;
    o.vy -= 16 * dt;
    o.mesh.position.x += o.vx * dt;
    o.mesh.position.z += o.vz * dt;
    o.mesh.position.y += o.vy * dt;
    o.mesh.rotation.z += o.spin * dt;
    o.mesh.rotation.y = camYaw;
    const ziemia = terrainH(o.mesh.position.x, o.mesh.position.z) + 0.06;
    if (o.mesh.position.y < ziemia) {               // jedno odbicie i leży
      o.mesh.position.y = ziemia;
      o.vy *= -0.34; o.vx *= 0.55; o.vz *= 0.55;
    }
    if (o.t > 0.95) { scene.remove(o.mesh); G.okruchy.splice(i, 1); }
    else if (o.t > 0.62) o.mesh.scale.setScalar(Math.max(0, 1 - (o.t - 0.62) / 0.33));
  }

  // ---- świetlne puffy (rozszerzają się i gasną) ----
  for (let i = G.puffs.length - 1; i >= 0; i--) {
    const p = G.puffs[i]; p.t += dt;
    const k = p.t / 0.3;
    p.mesh.scale.setScalar(p.skala * (0.7 + k * 1.8));
    p.mesh.quaternion.copy(camera.quaternion);
    p.a = Math.max(0, 0.85 * (1 - k));
    if (k >= 1) G.puffs.splice(i, 1);
  }

  // ---- skrzynie ----
  // 30.09: kopiec warzyw wyskakuje (model 3D), nagroda 0,12 s później — monety lecą, gdy kopiec jest w górze
  // (tryb szybki: od razu, jak dawniej)
  for (const c of chests) {
    if (!c.opened) {
      const cd = c.pos.distanceTo(P.pos);
      if (cd < 1.3) {
        c.opened = true; c.t = 0; c.nagr = false;
        G.shake = Math.max(G.shake, 0.15);
        if (skrzyniaSzybka()) { c.nagr = true; chestReward(c); }   // bot / reduced motion: od razu i bez konfetti (okruchy losują z Math.random)
        else for (const kol of [0xee4a3a, 0xf6922e, 0x86cf55, 0x9a5ad0]) okruchy(c.pos.x, c.y0 + 0.9, c.pos.z, kol, 4);
      } else if (cd > 95) placeChest(c);      // mapa nieskończona — skrzynia goni gracza
    } else {
      c.t += dt;
      if (!c.nagr && c.t >= 0.12) { c.nagr = true; chestReward(c); }
      if (c.t > 45) placeChest(c);            // respawn gdzie indziej
    }
  }

  updateWeaponChest(dt);
  updateSkrzynie3D(dtReal);                        // otwarcia kufrów, para, iskry — czas realny (wieko leci mimo hitstopu)
  if (G.padajace.length) updatePadajace(dt);
  if (MAPS[mapKey].indoor) updateRestock(dt);
  if (G.turrets.length) updateTurrets(dt);
  updateSmrodGracza(dt);
  if (G.krzaki.length) updateKrzaki(dt);
  // SERIA SCYZORYKÓW: rzuty wychodzą jeden po drugim, więc słychać i widać „ta-ta-ta"
  for (let i = G.seria.length - 1; i >= 0; i--) {
    const r = G.seria[i];
    r.opoznienie -= dt;
    if (r.opoznienie > 0) continue;
    G.seria.splice(i, 1);
    const katy = P.evo.wachlarz ? [-0.22, 0, 0.22] : [0];
    for (const dk of katy) {
      const a = r.kat + dk;
      const m = new THREE.Mesh(unitGeo, scyzorykMat);
      m.scale.set(0.5 * scyzorykAspect, 0.5, 1);
      m.position.set(P.pos.x, P.y + 1.0, P.pos.z);
      scene.add(m);
      // kierunek wirowania zgodny z tym, w ktora strone EKRANU leci noz — inaczej
      // co drugi rzut wygladalby, jakby krecil sie w tyl. Rzut na os „prawo kamery".
      const sx = Math.sin(a) * Math.cos(camYaw) - Math.cos(a) * Math.sin(camYaw);
      G.shots.push({ mesh: m, dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
                     life: 1.2, pierce: 2 + r.lvl, hit: new Set(), y: P.y + 1.0,
                     dmg: (2.2 + 0.5 * r.lvl) * (r.bonusNoz ? 0.5 : 1), wiruje: sx >= 0 ? -1 : 1, zr: 'scyzoryk', bonusNoz: r.bonusNoz });
    }
    AUDIO.sfx('kryt');
  }
  if (plamy.length) updatePlamy(dt);

  // ---- totemy ----
  for (const t of totems) {
    if (t.pos.distanceTo(P.pos) > 110) placeTotem(t);   // przenosiny bliżej gracza
    if (t.cd > 0) {
      t.cd -= dt;
      t.mat.opacity = 0.35;
      t.ring.visible = false;
      if (t.cd <= 0) { t.mat.opacity = 1; t.ring.visible = true; }
    } else {
      t.ring.scale.setScalar(3 + Math.sin(G.time * 3) * 0.4);
      if (t.pos.distanceTo(P.pos) < 1.6) {
        const b = losujBuff();
        G.buff = { key: b.key, t: b.dur };
        AUDIO.sfx('totem');
        toastBuff(b.label, b.ico);
        t.cd = trudn().garnekCd;                     // TRUDNOŚĆ v2: 45 → 60 s (CFG_TRUDNOSC)
        novaRing(t.pos.x, t.pos.z, 4);
        t.dotyk = G.time;                            // 30.09: pokrywka wyskakuje, bucha para, ogień przygasa do żaru
        if (SK) for (let k = 0; k < 7; k++) SK.ef.emituj('para', t.pos.x + (skLos() - 0.5) * 1.0, t.y0 + 1.3, t.pos.z + (skLos() - 0.5) * 1.0,
          { vy: 1.6 + skLos(), vx: skLos() - 0.5, s0: 0.3, s1: 0.9, zycie: 1.2, a: 0.7, kol: MAPS[mapKey].indoor ? 0xcfeeff : 0xffffff });
        // mrożonki i nietykalność to momenty — zasługują na wstrząs i błysk
        if (b.key === 'mroz' || b.key === 'niet') { G.shake = Math.max(G.shake, 0.35); fpsBlysk(0.4); }
      }
    }
  }

  // ---- aktywny buff ----
  if (G.buff.key) {
    G.buff.t -= dt;
    if (G.buff.t <= 0) { G.buff = { key: null, t: 0 }; document.getElementById('buff').style.opacity = 0; }
  }
  if (G.vacuum > 0) G.vacuum -= dt;

  // ---- pierścienie fal ----
  for (let i = G.rings.length - 1; i >= 0; i--) {
    const r = G.rings[i]; r.t += dt;
    const k = r.t / 0.45;
    r.mesh.scale.set(r.rMax * 2 * k, 1, r.rMax * 2 * k);
    r.a = Math.max(0, 1 - k);
    if (k >= 1) G.rings.splice(i, 1);
  }

  // ---- dropy (kości XP + monety) ----
  const mag = G.vacuum > 0 ? 999 : magnetF();
  for (let i = G.gems.length - 1; i >= 0; i--) {
    const g = G.gems[i]; g.t += dt;
    const d = g.pos.distanceTo(P.pos);
    if (d < mag) g.pos.addScaledVector(_doGracza.copy(P.pos).sub(g.pos).normalize(), Math.max(14 - d, 8) * dt);
    g.mesh.position.set(g.pos.x, terrainH(g.pos.x, g.pos.z) + DROP_Y.gem + Math.sin(g.t * 4) * 0.12, g.pos.z);
    g.mesh.rotation.set(0, camYaw, g.t * 2);
    // porzucone dropy znikaja: mapa jest nieskonczona, wiec bez tego wszystko
    // zostawione za plecami zostaje na zawsze (zmierzone: 299 pigulek po 4:43)
    if (g.t > 45 && d > mag * 3) { scene.remove(g.mesh); G.gems.splice(i, 1); continue; }
    if (d < 0.7) {
      P.xp += g.val * CFG_BIEG.xpPigulki * lag('xp') * ekonBieg('xp');   // EKONOMIA v2: pigułka ×0,5 (liczba pigułek bez zmian)
      AUDIO.sfx('xp');
      scene.remove(g.mesh); G.gems.splice(i, 1);
      // WHILE, nie IF: jedna pigulka moze dac wiecej niz jeden poziom, a przy
      // Wielkim Magnesie pigulki przychodza kiszkami po kilkanascie w jednej klatce.
      // Kazdy awans wchodzi do KOLEJKI, wiec zaden zestaw kart nie przepada.
      awansujJesliTrzeba();
    }
  }
  // E2 K3: „POMIŃ +20% XP" mogło przekroczyć próg — awans zwykłą drogą w następnej klatce
  if (P.xp >= P.xpNeed && !G.paused) awansujJesliTrzeba();
  for (let i = G.coins.length - 1; i >= 0; i--) {
    const c = G.coins[i]; c.t += dt;
    const d = c.pos.distanceTo(P.pos);
    if (d < mag) c.pos.addScaledVector(_doGracza.copy(P.pos).sub(c.pos).normalize(), Math.max(14 - d, 8) * dt);
    c.mesh.position.set(c.pos.x, terrainH(c.pos.x, c.pos.z) + DROP_Y.coin + Math.sin(c.t * 5) * 0.1, c.pos.z);
    c.mesh.rotation.y = camYaw;
    if (c.t > 60 && d > mag * 3) { scene.remove(c.mesh); G.coins.splice(i, 1); continue; }
    if (d < 0.7) {
      G.runCoins += Math.round((c.val || 1) * monetyMul()); drawCoins();   // Klątwa płaci
      AUDIO.sfx('moneta');
      scene.remove(c.mesh); G.coins.splice(i, 1);
    }
  }
  // serca ❤️ (zbierane tylko gdy brakuje HP)
  for (let i = G.hps.length - 1; i >= 0; i--) {
    const h = G.hps[i]; h.t += dt;
    const d = h.pos.distanceTo(P.pos);
    if (d < mag && P.hp < P.maxHp) h.pos.addScaledVector(_doGracza.copy(P.pos).sub(h.pos).normalize(), Math.max(14 - d, 8) * dt);
    h.mesh.position.set(h.pos.x, terrainH(h.pos.x, h.pos.z) + 0.35 + Math.sin(h.t * 4) * 0.15, h.pos.z);
    h.mesh.rotation.y = camYaw;
    if (d < 0.8 && P.hp < P.maxHp) {
      P.hp = Math.min(P.maxHp, P.hp + HP_SERCA); drawHearts();
      AUDIO.sfx('serce');
      dmgPop(P.pos.x, pTy + 0.6, P.pos.z, T('+SERCE', '+HEART'), '#ff8080', 1.4, 'wazny');
      scene.remove(h.mesh); G.hps.splice(i, 1);
    }
  }
  // wyskakujące napisy (obrażenia / KILL)
  for (let i = G.pops.length - 1; i >= 0; i--) {
    const p = G.pops[i]; p.t += dt;
    p.mesh.position.y += 1.8 * dt;
    p.mesh.rotation.y = camYaw;
    p.mesh.material.opacity = Math.max(0, 1 - p.t / 0.75);
    if (p.t > 0.75) { scene.remove(p.mesh); p.mesh.material.dispose(); G.pops.splice(i, 1); }
  }

  // ---- kamera: TRZECIA OSOBA (orbita) ⇄ PIERWSZA OSOBA (tryb karabinu) ----
  // `kf` (0 = za plecami, 1 = z oczu) animuje się przez ~0.5 s, więc zjazd do
  // pierwszej osoby i powrót są płynne bez osobnego kodu przejścia.
  const F = G.fps;
  const kf = F.on ? (F.wejscie > 0 ? 1 - F.wejscie / 0.5 : 1)
                  : (F.wyjscie > 0 ? F.wyjscie / 0.55 : 0);
  // KAMERA ODJEŻDŻA OD TŁOKU. Gęsta horda zasłania nie tylko gracza, ale i to,
  // dokąd biegnie — a odjazd czyta się przy okazji jako „robi się gorąco".
  // Dojście jest WOLNE (dt * 1.2) i wraca tak samo: skokowa kamera przy każdym
  // przebiegniętym wrogu byłaby gorsza niż zasłonięty kadr.
  let bliskoIle = 0;
  for (const e of G.enemies) {
    const ex = e.pos.x - P.pos.x, ez = e.pos.z - P.pos.z;
    if (ex * ex + ez * ez < 49) bliskoIle++;      // promień 7 j. = to, co realnie wchodzi w kadr
  }
  G.tlok += (Math.min(1, bliskoIle / 26) - G.tlok) * Math.min(1, dt * 1.2);
  const kk = Math.min(1, Math.max(0, G.kino / 1.2));      // oprawa bossa: dodatkowy odjazd
  const dystK = CAM_DIST * (1 + 0.22 * G.tlok + 0.30 * kk), wysK = CAM_H * (1 + 0.14 * G.tlok + 0.18 * kk);
  const cx = P.pos.x + Math.sin(camYaw) * dystK, cz = P.pos.z + Math.cos(camYaw) * dystK;
  const cy = Math.max(P.y + wysK, terrainH(cx, cz) + 2.2);
  _camCel.set(cx + (P.pos.x - cx) * kf, cy + (P.y + 1.62 - cy) * kf, cz + (P.pos.z - cz) * kf);
  // przy kf > 0 pozycja jest DOKŁADNIE celem: wygładza już samo `kf`, a dodatkowy
  // lerp zostawiał kamerę w połowie drogi na cały tryb.
  camera.position.lerp(_camCel, kf > 0 ? 1 : Math.min(1, dt * 8));
  if (G.shake > 0) {
    // SUFIT I SZYBSZY ZANIK. Zrodel trzesienia jest 22 i potrafia sie nakladac
    // (boss + wybuch + cios w tej samej klatce), a zanik „-dt" trzymal duze
    // wartosci przez pol sekundy. Sufit 0.35 + zanik rosnacy z amplituda.
    G.shake -= dt * (1 + G.shake * 2);
    const sh = Math.min(G.shake, 0.35) * 0.7;
    camera.position.x += (Math.random() - .5) * sh;
    camera.position.y += (Math.random() - .5) * sh;
  }
  const patrzD = 2.2 + kf * 18;                    // w pierwszej osobie patrzymy w dal, nie na siebie
  camera.lookAt(P.pos.x + fx * patrzD, P.y + 1.3 + kf * (Math.tan(F.pitch) * patrzD + 0.32),
                P.pos.z + fz * patrzD);

  // (kołysanie koron drzew przeszło do shadera — korony są instancjonowane per chunk)

  // ---- dekoracje twarzą do kamery: ten sam kwaternion co sprite'y postaci (yaw +
  // pochylenie do osi kamery) — pionowe billboardy obok pochylonych postaci wyglądały
  // jak przyklejone do ziemi kartoniki ----
  for (const ch of chunkMap.values())
    for (const m of ch.deco) billboardQuat(m.quaternion);

  windU.value = G.time;
  cloudOffU.value.set(G.time * CLOUD_SPD * 0.004, G.time * CLOUD_SPD * 0.0022);

  // ---- chmury ----
  for (const c of clouds) {
    c.m.position.x += c.v * dt;
    if (c.m.position.x > P.pos.x + 150) c.m.position.x = P.pos.x - 150;
    c.m.quaternion.copy(camera.quaternion);
  }
}

// ŚMIERĆ: slow-motion, zbliżenie, postać pada — dopiero potem ekran końca
function startDeath() {
  if (STRES) { P.hp = P.maxHp; drawHearts(); return; }   // DEV: scena stresu = gracz nieśmiertelny
  if (G.dying) return;
  endKarabin('smierc');                              // inaczej kamera FPP walczy z kamerą śmierci
  G.dying = true; G.deathT = 0;
  odswiezKarabinBtn(); odswiezStawBtn(); odswiezSmrodBtn();   // przyciski akcji znikają w animacji śmierci
  G.shake = 0.9;
  AUDIO.sfx('koniec');
  document.getElementById('vign').style.opacity = 1;
  dmgPop(P.pos.x, P.y + 1.2, P.pos.z, T('KONIEC!', 'GAME OVER!'), '#ff4a4a', 2.4, 'wazny');
  novaRing(P.pos.x, P.pos.z, 6);
  if (hitFlash) hitFlash.visible = false;
  AUDIO.event('smierc');                           // ostatnia kwestia postaci
}
function updateDeath(dt) {
  G.deathT += dt;
  const t = G.deathT;
  // postać przewraca się na bok i zapada w ziemię (przewrót doklejony do obrotu billboardu)
  refreshSpriteTilt();
  billboardQuat(playerBB.mesh.quaternion, Math.min(Math.PI / 2, t * 3.2));
  playerBB.mesh.position.y = P.y - Math.min(0.55, t * 0.5);
  // kamera zjeżdża blisko i niżej
  const k = Math.min(1, t / 1.4);
  const dist = CAM_DIST * (1 - 0.55 * k), hgt = CAM_H * (1 - 0.45 * k);
  const cx = P.pos.x + Math.sin(camYaw) * dist, cz = P.pos.z + Math.cos(camYaw) * dist;
  camera.position.set(cx, P.y + hgt + 0.4, cz);
  camera.lookAt(P.pos.x, P.y + 0.5, P.pos.z);
  if (G.shake > 0) {
    G.shake -= dt;
    camera.position.x += (Math.random() - .5) * G.shake;
    camera.position.y += (Math.random() - .5) * G.shake;
  }
  // wrogowie zwalniają i rozchodzą się (slow-motion)
  for (const e of G.enemies) {
    const away = e.pos.clone().sub(P.pos).setY(0).normalize().multiplyScalar(1.2 * dt);
    e.pos.add(away);
    e.bb.update(dt * 0.25, e.pos, e.ty);
  }
  for (let i = G.pops.length - 1; i >= 0; i--) {
    const p = G.pops[i]; p.t += dt * 0.4;
    p.mesh.position.y += 0.9 * dt;
    p.mesh.rotation.y = camYaw;
    p.mesh.material.opacity = Math.max(0, 1 - p.t / 1.4);
    if (p.t > 1.4) { scene.remove(p.mesh); p.mesh.material.dispose(); G.pops.splice(i, 1); }
  }
  if (t > 1.8) { G.dying = false; koniecBiegu('smierc'); }
}

// Rozliczenie biegu w JEDNYM miejscu. Wcześniej monety dopisywał tylko
// `gameOver()`, więc wyjście do menu z pauzy po długim biegu kasowało cały
// zarobek — i to prawdopodobnie stąd brało się część odczucia „monet jest za mało".
// E1-bieg K9: `mnoznik` (wygrana ×1,5) i `bonus` (nagroda Nonny) doliczane TUTAJ — jedyne miejsce dopisania monet.
function rozliczBieg(mnoznik = 1, bonus = 0) {
  G.runCoins = Math.round(G.runCoins * mnoznik) + bonus;
  G.zebrane = G.runCoins;                          // do pokazania na ekranie końca
  if (!G.runCoins) return;
  META.coins += G.runCoins;
  META.st.coins += G.runCoins;
  G.runCoins = 0;
  drawCoins();
}
// ============================== CEREMONIA KOŃCA BIEGU ==============================
// Ekran końca to moment, w którym gracz decyduje „jeszcze raz" albo zamyka grę.
// Sucha lista liczb tego nie sprzedaje — liczby muszą LECIEĆ W GÓRĘ z dźwiękiem.
function tickerLiczb(root) {
  const pola = [...root.querySelectorAll('i[data-licz]')];
  if (!pola.length) return;
  const T = 900;                                   // cała ceremonia poniżej sekundy
  const start = performance.now();
  let ostatniTik = 0, gotowe = false;
  // Ticker chodzi na rAF, a ten jest DŁAWIONY bez fokusa: bez tego domknięcia
  // gracz, który przełączy kartę w trakcie ceremonii, wróciłby do ekranu końca
  // z samymi zerami. Ustawiamy wartości docelowe na twardo po czasie animacji.
  const domknij = () => {
    if (gotowe) return;
    gotowe = true;
    for (const p of pola) {
      const czas = p.dataset.czas;
      p.textContent = czas ? fmtTime(+czas) : +p.dataset.licz;
    }
  };
  setTimeout(domknij, T + 400);
  const krok = (teraz) => {
    if (gotowe) return;
    const k = Math.max(0, Math.min(1, (teraz - start) / T));   // K9: znacznik rAF bywa sprzed `start` → k < 0 dawało ujemne liczby
    const e = 1 - Math.pow(1 - k, 3);              // szybko rośnie, miękko wyhamowuje
    for (const p of pola) {
      const cel = +p.dataset.licz, czas = p.dataset.czas;
      p.textContent = czas ? fmtTime(+czas * e) : Math.round(cel * e);
    }
    if (teraz - ostatniTik > 55) { ostatniTik = teraz; AUDIO.sfx('xp'); }
    if (k < 1) requestAnimationFrame(krok);
    else { AUDIO.sfx('zlota'); domknij(); }
  };
  requestAnimationFrame(krok);
}
// deszcz pixelowych monet po rekordzie — czysta ozdoba, ale to ona sprzedaje rekord
function deszczMonet(ile) {
  const ov = document.getElementById('overOv');
  for (let i = 0; i < ile; i++) {
    const d = document.createElement('div');
    d.className = 'moneta-spada';
    d.innerHTML = ico('moneta', 18 + Math.round(Math.random() * 10));
    d.style.left = (Math.random() * 96) + 'vw';
    d.style.animationDelay = (Math.random() * 0.9).toFixed(2) + 's';
    d.style.animationDuration = (1.5 + Math.random() * 1.2).toFixed(2) + 's';
    ov.appendChild(d);
    setTimeout(() => d.remove(), 3200);
  }
}
// E1-bieg K9 (spec §8.1): JEDNA ścieżka końca biegu — `koniecBiegu(powod)`, powod ∈ 'smierc' | 'wygrana' | 'menu'.
// Kolejność: zamrożenie → rozliczBieg(mnożnik) → liczniki META.st → GoatCounter → ekran (poza 'menu').
// Dane ekranu liczone PRZED clearWorld (Don/kapral żywy, bronie gracza) — `daneKonca()`.
const ZR_BRONI_EXTRA = {                           // źródła obrażeń gracza, które nie są kluczem WEAPONS
  smrod: ['skarpeta', 'Smrodliwa aura', 'Stink aura'], karabin: ['celownik', 'Karabin', 'Rifle'],
  glaz: ['ostrzezenie', 'Głazy', 'Boulders'], regal: ['ostrzezenie', 'Regały', 'Shelves'],
  kapral6: ['ostrzezenie', 'Wybuch Botta', "Botto's blast"],
};
function opisZrodla(zr) {                          // { nm, ico, bron } — broń gracza albo inne źródło
  const W = WEAPONS[zr];
  if (W) { const evo = W.evoKey && P.evo[W.evoKey]; return { nm: evo && W.evoNm ? W.evoNm.charAt(0) + W.evoNm.slice(1).toLowerCase() : W.nm, ico: evo && W.evoIco ? W.evoIco : W.ico, bron: true }; }
  const x = ZR_BRONI_EXTRA[zr];
  // karabin i Smrodliwa aura (Garlicino) to broń gracza spoza WEAPONS — na ekranie końca mają własny wiersz, nie „Inne"
  return x ? { nm: T(x[1], x[2]), ico: x[0], bron: false, wlasna: zr === 'karabin' || zr === 'smrod' }
           : { nm: T('Inne', 'Other'), ico: 'ostrzezenie', bron: false };
}
function nazwaSprawcy(zr) {                        // „Zabił cię: …" z klucza `G.ostatniCios` (ranGracza)
  if (!zr) return '';
  // 'kapralN' = sztuczka kaprala, 'kapralN-dotyk' = zwykły kontakt (samo imię)
  const KL = CFG_BIEG.kaprale.lista, m = /^kapral(\d)(-dotyk)?$/.exec(zr);
  const sztuczka = { kapral2: T('salwa ketchupu', 'ketchup volley'), kapral3: T('szarża', 'charge'), kapral4: T('skok', 'slam'),
                     kapral5: T('wir', 'spin'), kapral6: T('wybuch', 'blast') };
  if (m && KL[+m[1]]) return KL[+m[1]].nm + (!m[2] && sztuczka[zr] ? ' (' + sztuczka[zr] + ')' : '');
  const don = { don: '', 'don-sol': 'Salt Storm', 'don-shuriken': 'Chip Shuriken', 'don-lawina': T('lawina chipsów', 'chip avalanche') };
  if (zr in don) return 'Don Chipso' + (don[zr] ? ' (' + don[zr] + ')' : '');
  if (zr === 'regal') return T('Przewrócony regał', 'A falling shelf');
  if (zr === 'sodino') return ENEMY_TYPES.sodino.nm + ' (' + T('wybuch', 'blast') + ')';
  if (zr === 'ketchupino') return ENEMY_TYPES.ketchupino.nm + ' (' + T('ketchup', 'ketchup') + ')';
  return ENEMY_TYPES[zr] ? ENEMY_TYPES[zr].nm : zr;
}
// Następny cel (spec §8.2): najtańsza niekupiona rzecz ze sklepu (odblokowania, ulepszenia, postacie za monety)
// + najbliższa postać za zabójstwa. Liczone PO rozliczeniu (META.coins już z monetami biegu).
function nastepnyCel() {
  const c = [];
  for (const it of SHOP_UNLOCKS) if (!META.unlocked[it.key]) c.push({ nm: it.nm, ico: it.ico, cena: cenaOdbl(it) });
  const sk = SPIZ_KOLEJNOSC.find(k => !sklOdbl(k));   // Spiżarnia: następny składnik (cena wg liczby kupionych)
  if (sk) c.push({ nm: PASSIVES[sk].nm, ico: PASSIVES[sk].ico, cena: cenaSpiz() });
  for (const it of SHOP) if (META.up[it.key] < it.max && it.key !== 'klatwa') c.push({ nm: it.nm, ico: it.ico, cena: shopPrice(it) });
  for (const k of Object.keys(CHARS)) if (CHARS[k].price && !maszPostac(k)) c.push({ nm: CHARS[k].nm.split(' ')[0], ico: 'serce', cena: CHARS[k].price });
  c.sort((a, b) => a.cena - b.cena);
  const out = [];
  if (c.length) {
    const tanie = c.filter(x => x.cena <= META.coins).pop();       // najdroższa, na którą już stać
    out.push(tanie ? `${T('Stać Cię na', 'You can afford')}: <b>${tanie.nm}</b> (${ico('moneta', 13)} ${tanie.cena})`
                   : `${T('Brakuje', 'You need')} ${ico('moneta', 13)} <b>${c[0].cena - META.coins}</b> ${T('do', 'more for')}: <b>${c[0].nm}</b>`);
  }
  const kg = Object.keys(CHARS).filter(k => CHARS[k].killGoal && !maszPostac(k)).sort((a, b) => CHARS[a].killGoal - CHARS[b].killGoal)[0];
  if (kg) out.push(`${CHARS[kg].nm.split(' ')[0]}: <b>${META.st.kills}/${CHARS[kg].killGoal}</b> ${T('pokonanych', 'defeated')}`);
  return out;
}
// „Prawie" (spec §8.2): pierwszy pasujący. Wołane PRZED clearWorld (żywy Don / kapral).
function prawie() {
  const don = G.enemies.find(e => e.don && !e.dying);
  if (G.donStart != null && don) return T('Don miał jeszcze', 'The Don had only') + ` <b>${Math.max(1, Math.round(don.hp / don.maxHp * 100))}%</b> HP!`;
  const kap = G.enemies.find(e => e.kapral && !e.dying && !e.odwrot && e.hp < e.maxHp);   // odchodzący (łagodny) się nie liczy
  if (kap) return `${kap.kDef.nm} ${T('miał jeszcze', 'had only')} <b>${Math.max(1, Math.round(kap.hp / kap.maxHp * 100))}%</b> HP!`;
  // w górę do pełnej sekundy: przy 9:59,4 fmtTime (w dół) pokazywało „brakowało 0:00"
  if (G.time >= 480 && G.time < CZAS_WIECZORU) return T('Do Dona brakowało', 'The Don was only') + ` <b>${fmtTime(Math.ceil(CZAS_WIECZORU - G.time))}</b>` + T('!', ' away!');
  const nk = WIECZOR.find(z => z.typ === 'kapral' && z.t > G.time);
  if (nk) return `${T('Do kaprala', 'Corporal')} ${nk.nr} ${T('brakowało', 'was only')} <b>${fmtTime(Math.ceil(nk.t - G.time))}</b>` + T('!', ' away!');
  return '';
}
function daneKonca(wygrana) {
  const bronie = new Map();                        // zr → { dmg, t0, lvl }
  for (const [zr, dmg] of Object.entries(G.dmgBron)) if (dmg > 0) bronie.set(zr, { zr, dmg, t0: 0, lvl: 0 });
  for (const w of P.weapons) { const b = bronie.get(w.key) || { zr: w.key, dmg: 0 }; b.t0 = w.t0 || 0; b.lvl = w.lvl; bronie.set(w.key, b); }
  const suma = [...bronie.values()].reduce((a, b) => a + b.dmg, 0) || 1;
  const lista = [...bronie.values()].map(b => ({ ...b, ...opisZrodla(b.zr), dps: b.dmg / Math.max(1, G.time - b.t0) }))
    .sort((a, b) => b.dmg - a.dmg);
  const glowne = lista.filter(b => b.bron).slice(0, 3);
  const wlasne = lista.filter(b => b.wlasna && b.dmg > 0);   // karabin, aura Garlicina (DPS liczony na cały bieg)
  const inne = lista.filter(b => !glowne.includes(b) && !wlasne.includes(b));
  const wiersze = [...glowne, ...wlasne].sort((a, b) => b.dmg - a.dmg).map(b => ({ ...b, udz: b.dmg / suma }));
  const dmgInne = inne.reduce((a, b) => a + b.dmg, 0);
  if (dmgInne > 0) wiersze.push({ nm: T('Inne', 'Other'), ico: 'ostrzezenie', dmg: dmgInne, dps: dmgInne / Math.max(1, G.time), udz: dmgInne / suma, lvl: 0, inne: inne.map(b => b.nm) });
  return { wiersze, prawie: wygrana ? '' : prawie(), sprawca: wygrana ? '' : nazwaSprawcy(G.ostatniCios),
           maxHit: G.maxHit && G.maxHit.dmg > 0 ? { dmg: G.maxHit.dmg, crit: G.maxHit.crit, nm: opisZrodla(G.maxHit.zr).nm } : null };
}
// E1-bieg K10: czy ten bieg ma być łagodny. DEV: ?lagodny=1 wymusza, ?lagodny=0 wyłącza.
function czyLagodny() {
  if (DEV) { const m = location.search.match(/[?&]lagodny=([01])/); if (m) return m[1] === '1'; }
  if (BOT.on && BOT.lagodny != null) return BOT.lagodny;
  const s = META.st;
  if (!zalew().lagodny) return false;              // ZALEW (29.09 wieczór): v2 bez łagodnego pierwszego biegu (v1: jak dotąd)
  // `pelne`, nie `runs`: szybkie „Do menu" nie zużywa trybu. TRUDNOŚĆ v2: bez drugiej szansy (pelne 1 i best < 300)
  return s.pelne === 0 || (trudn().lagodnyDrugaSzansa && s.pelne === 1 && s.best < 300);
}
// n-ty bieg w historii zapisu → kubełek GoatCounter (spec §8.3): 1–10 dokładnie, potem przedziały
const kubelekBiegu = n => n <= 10 ? String(n) : n <= 20 ? '11-20' : n <= 50 ? '21-50' : '51+';
function koniecBiegu(powod = 'smierc') {
  if (!G.running) return;                          // podwójne wywołanie (wygrana + śmierć, dwuklik „Do menu”)
  if (powod === 'menu') {
    togglePause(false);
    // „Do menu" w trakcie ceremonii wygranej (3 s) albo animacji śmierci (1,8 s) nie kasuje wyniku —
    // togglePause już nie pauzuje w tych chwilach, to druga linia obrony
    if (G.wygrana) { domknijWygrana(); powod = 'wygrana'; }
    else if (G.dying) { G.dying = false; powod = 'smierc'; }
  }
  const wygrana = powod === 'wygrana', doMenu = powod === 'menu', D = CFG_BIEG.don, s = META.st;
  const dane = doMenu ? null : daneKonca(wygrana);
  winieta(false); pasy(false);
  G.over = !doMenu; G.running = false;
  AUDIO.endRun();                                  // koniec biegu = powrót do motywu głównego
  document.getElementById('vign').style.opacity = 0;
  document.getElementById('wArrow').style.display = 'none';
  playerBB.mesh.rotation.z = 0;
  // ---- rozliczenie: monety × mnożnik (wygrana 1,5, reszta 1) + nagroda Nonny za pierwszy Wieczór ----
  const monetyPrzed = G.runCoins, mnoznik = wygrana ? D.mnozWygranej : 1;
  const bonusWin = wygrana && !s.wins ? D.pierwszaWygrana : 0;
  rozliczBieg(mnoznik, bonusWin);
  // PIERWSZY BIEG MA COŚ DAWAĆ (Brotato: postać za pierwszą przegraną) — Piorun za darmo, także po wygranej.
  // Warunek z porażek i wygranych, nie z `runs`: wyjście do menu w 1. biegu kasowało prezent na zawsze (przegląd K9–K11).
  let prezent = '';
  if (!doMenu && !s.smierci && !s.wins && !META.unlocked.piorun) {
    META.unlocked.piorun = 1;
    prezent = `${ico('pioruny', 16)} ${wygrana
      ? T('PIERWSZY WIECZÓR — PIORUN ODBLOKOWANY NA STAŁE!', 'FIRST EVENING — THUNDERBOLT UNLOCKED FOR GOOD!')
      : T('PIERWSZA PORAŻKA — PIORUN ODBLOKOWANY NA STAŁE!', 'FIRST DEFEAT — THUNDERBOLT UNLOCKED FOR GOOD!')}`;
  }
  // ---- liczniki ----
  // Rekord CZASU PRZEŻYCIA liczony najwyżej do 10:00 — dalej trwa walka z Donem, a wolniejsze zabicie Dona nie może
  // dawać „rekordu". Wygrana ma własny rekord: najszybszy Don (`bestDon`, pieczątka tylko przy pobiciu poprzedniego).
  const czasRek = Math.min(G.time, CZAS_WIECZORU);
  const rekordCzasu = !wygrana && czasRek > s.best; // PRZED aktualizacją (inaczej zawsze true)
  const walkaDona = wygrana ? G.donKoniec - G.donStart : 0;
  const rekordDona = wygrana && s.bestDon > 0 && walkaDona < s.bestDon;
  s.runs++; s.time += G.time; s.lvl += Math.max(0, P.lvl - 1);
  if (!doMenu || G.time >= 60) s.pelne = (s.pelne || 0) + 1;   // szybkie „Do menu" nie zużywa łagodnego biegu
  if (wygrana) { s.wins = (s.wins || 0) + 1; if (!s.bestDon || walkaDona < s.bestDon) s.bestDon = +walkaDona.toFixed(1); }
  else if (!doMenu) s.smierci = (s.smierci || 0) + 1;
  if (czasRek > s.best) s.best = czasRek;
  s.bestMapa = s.bestMapa || {};
  if (czasRek > (s.bestMapa[mapKey] || 0)) s.bestMapa[mapKey] = Math.round(czasRek);   // odblokowania map
  if (G.kills > s.bestKills) s.bestKills = G.kills;
  if (G.maxHit && G.maxHit.dmg > (s.maxHit || 0)) s.maxHit = Math.round(G.maxHit.dmg);
  // E2 K7: narastająca podpowiedź Książki — broń przepisu doszła w tym biegu do max, a danie nieugotowane → prawie +1 (raz na bieg)
  for (const k of (!doMenu || G.time >= 60) ? (G.maxBroni || []) : []) {
    const ek = PRZEPIS_BRONI[k];
    if (!ek || (G.przepisyBiegu || []).includes(ek) || (META.ksiazka[ek] && META.ksiazka[ek].odk)) continue;
    const K = META.ksiazka[ek] = Object.assign({ odk: 0, prawie: 0, ile: 0 }, META.ksiazka[ek]);
    K.prawie++;
  }
  for (const [a, n] of Object.entries(P.wyboryUzyte || {})) if (n) STATY.zdarzenie('wybory/' + a, 'Wybór użyty: ' + a);
  // ---- GoatCounter (spec §8.3; w DEV tylko STATY.log) ----
  const minK = kubelekMinut(G.time);
  if (wygrana) STATY.zdarzenie('run-end/wygrana/' + mapKey, 'Wieczór wygrany: Don w ' + fmtTime(G.donKoniec - G.donStart) + ', poziom ' + P.lvl);
  else if (doMenu) STATY.zdarzenie('run-end/menu/' + mapKey + '/min-' + minK, 'Koniec biegu (wyjście do menu): ' + fmtTime(G.time) + ', poziom ' + P.lvl);
  else if (G.donStart != null) STATY.zdarzenie('run-end/smierc-don/' + mapKey, 'Śmierć przy Donie: ' + fmtTime(G.time - G.donStart));
  else STATY.zdarzenie('run-end/smierc/' + mapKey + '/min-' + minK, 'Koniec biegu (śmierć): ' + fmtTime(G.time) + ', poziom ' + P.lvl + ', ' + G.kills + ' zabójstw');
  if (G.lagodny || G.pierwszyBieg) STATY.zdarzenie('pierwszy-bieg/' + (wygrana ? 'wygrana' : (doMenu ? 'menu-min-' : 'smierc-min-') + minK),
    'Łagodny bieg: ' + powod + ' ' + fmtTime(G.time) + (G.rekaNonny ? ' (Ręka Nonny użyta)' : ''));
  const kawa = doMenu ? false : kawaDecyzja(wygrana);   // B12: PRZED saveMeta (zapisuje historię biegów i dzień pokazu)
  saveMeta(); renderShop(); renderStats(); renderBestiary();
  if (doMenu) {
    clearWorld();
    document.getElementById('startOv').style.display = 'flex';
    renderChars();
    return;
  }
  pokazEkranKonca(wygrana, dane, { monetyPrzed, mnoznik, bonusWin, prezent, rekordCzasu, rekordDona, walkaDona });
  if (kawa) pokazKawe();
}
// EKRAN KOŃCA (spec §8.2). Kredowa tablica w dwóch kolumnach (telefon poziomo 812×375 bez przewijania,
// PC szerzej): lewa = czas, „prawie", sprawca, liczniki, monety z mnożnikiem, następny cel; prawa = bronie.
// Liczby lecą tickerem (~0,9 s) — cały wynik widać w < 3 s (biblia).
function pokazEkranKonca(wygrana, d, o) {
  if (myszLock) myszWrac = true;
  puscMysz();                                      // 30.09: JESZCZE RAZ / Menu klikalne od razu, bez Esc
  const h1 = document.querySelector('#overOv h1');
  h1.textContent = wygrana ? T('WIECZÓR WYGRANY!', 'EVENING WON!') : T('KONIEC', 'GAME OVER');
  h1.classList.toggle('wygrana', wygrana);
  const licz = (v, cls = '') => `<i data-licz="${Math.round(v)}"${cls ? ` class="${cls}"` : ''}>0</i>`;
  const przec = x => String(x).replace('.', JEZYK.cur === 'en' ? '.' : ',');
  const L = [];
  L.push(wygrana
    ? `<div class="okCzas">${ico('puchar', 16)} <b>10:00</b> · ${T('Don pokonany w', 'Don defeated in')} <b>${fmtTime(G.donKoniec - G.donStart)}</b></div>`
    : `<div class="okCzas">${T('Przetrwano', 'Survived')} <b><i data-licz="0" data-czas="${G.time.toFixed(1)}">0:00</i></b></div>`);
  if (d.prawie) L.push(`<div class="okPrawie">${d.prawie}</div>`);
  if (d.sprawca) L.push(`<div class="okZabil">${T('Zabił cię', 'Killed by')}: <b>${d.sprawca}</b></div>`);
  L.push(`<div class="okStaty"><span>${ico('czaszka', 14)} <b>${licz(G.kills)}</b></span><span>${T('POZIOM', 'LEVEL')} <b>${licz(P.lvl)}</b></span>` +
         `<span>${T('KAPRALE', 'CORPORALS')} <b>${G.kaprale || 0}/6</b></span></div>`);
  const mn = o.mnoznik !== 1;
  L.push(`<div class="okMonety">${ico('moneta', 16)} <b>${licz(o.monetyPrzed)}</b>` +
         (mn ? ` <span class="okMn">×${przec(o.mnoznik)}</span>${o.bonusWin ? ` + <b>${o.bonusWin}</b>` : ''} = <b class="okSuma">${licz(G.zebrane)}</b>`
             : ` <span class="okMn slaby" title="${T('wygrana = ×1,5', 'a win = ×1.5')}">×1</span>`) +
         `<span class="okRazem">${T('razem', 'total')} ${ico('moneta', 12)} ${META.coins}</span></div>`);
  if (o.bonusWin) L.push(`<div class="okZloty">${T('Nagroda Nonny za pierwszy Wieczór', "Nonna's reward for the first Evening")}: +${o.bonusWin}</div>`);
  for (const c of nastepnyCel()) L.push(`<div class="okCel">${ico('strzalka', 12)} ${c}</div>`);
  if (o.prezent) L.push(`<div class="okPrezent">${o.prezent}</div>`);
  if (o.rekordCzasu) L.push(`<div class="okRekord pieczatka">${ico('puchar', 16)} ${T('NOWY REKORD CZASU!', 'NEW TIME RECORD!')}</div>`);
  if (o.rekordDona) L.push(`<div class="okRekord pieczatka">${ico('puchar', 16)} ${T('NAJSZYBSZY DON', 'FASTEST DON')}: ${fmtTime(o.walkaDona)}!</div>`);
  const B = [`<div class="okH">${T('OBRAŻENIA', 'DAMAGE')}<span>${T('na sek.', 'per sec')}</span></div>`];
  for (const w of d.wiersze) {
    B.push(`<div class="okBr${w.inne ? ' inne' : ''}"${w.inne ? ` title="${w.inne.join(', ')}"` : ''}>${ico(w.ico, 20)}` +
      `<span class="okNm">${w.nm}${w.lvl ? ` <em>${w.lvl}</em>` : ''}</span>` +
      `<span class="okDmg">${dmgNum(w.dmg)}</span><span class="okDps">${dmgNum(w.dps)}</span>` +
      `<span class="okUdz"><i style="width:${Math.max(2, Math.round(w.udz * 100))}%"></i></span><span class="okPr">${Math.round(w.udz * 100)}%</span></div>`);
  }
  if (!d.wiersze.length) B.push(`<div class="okBr inne"><span class="okNm">—</span></div>`);
  if (d.maxHit) B.push(`<div class="okCios">${T('Najmocniejszy cios', 'Biggest hit')}: <b>${dmgNum(d.maxHit.dmg)}</b> — ${d.maxHit.nm}${d.maxHit.crit ? `, <b class="kryt">${T('KRYTYK', 'CRIT')}</b>` : ''}</div>`);
  const st = document.getElementById('overStats');
  st.innerHTML = `<div class="okKol">${L.join('')}</div><div class="okKol okBronie">${B.join('')}</div>`;
  const ov = document.getElementById('overOv');
  ov.classList.toggle('wygrana', wygrana);
  ov.style.display = 'flex';
  tickerLiczb(st);
  if (o.rekordCzasu || o.rekordDona || o.bonusWin) deszczMonet(28);   // rekord albo pierwsza wygrana
}
// ============================== B12: PROŚBA O KAWĘ NA EKRANIE KOŃCA ==============================
// Decyzja B12 (PAKIET-DLA-PIOTRA): tylko web (JEST_APKA → nigdy), od 3. pełnego biegu, najwyżej raz dziennie, tylko po
// DOBRYM biegu (wygrana albo dłuższy niż mediana gracza), nie w pierwszej sesji, nie po 2 porażkach < 2 min z rzędu,
// 30 dni spokoju po kliknięciu kawy. Okienko przykrywa ekran końca najwyżej na 3 s: „Może później" widać od razu,
// aktywne po KAWA.blokada (pasek odliczania). Bez emoji (zasada gry) — filiżanka z icons.js.
const KAWA = { odBiegu: 3, blokada: 3000, antyKlik: 800, spokojDni: 30, krotki: 120, historia: 20 };
const dzisiaj = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
// zwraca true = pokaż; przy okazji dopisuje bieg do historii gracza (mediana, porażki z rzędu) — wołana raz na koniec biegu
function kawaDecyzja(wygrana, o = {}) {
  const K = META.kawa, t = G.time;
  const czasy = (K.czasy || []).slice(), med = czasy.length ? czasy.slice().sort((a, b) => a - b)[Math.floor(czasy.length / 2)] : Infinity;
  K.czasy = [...czasy, Math.round(t)].slice(-KAWA.historia);
  K.krotkie = !wygrana && t < KAWA.krotki ? (K.krotkie || 0) + 1 : 0;
  const dobry = wygrana || (czasy.length >= 2 && t > med);
  const pow = !KAWA_URL ? 'brak-url' : JEST_APKA ? 'apka' : BOT.on || bezZapisu ? 'bot' : KAWA_PIERWSZA_SESJA ? 'pierwsza-sesja'
    : (META.st.pelne || 0) < KAWA.odBiegu ? 'za-wczesnie' : Date.now() < (K.spokojDo || 0) ? 'spokoj-30-dni'
    : K.dzien === dzisiaj() ? 'dzis-juz' : K.krotkie >= 2 ? 'dwie-krotkie-porazki' : !dobry ? 'slaby-bieg' : '';
  if (DEV) G.kawaPowod = pow || 'pokaz';
  if (pow && !o.wymus) return false;
  K.dzien = dzisiaj(); K.pokazy = (K.pokazy || 0) + 1;
  return true;
}
let _kawaT = 0, _kawaOd = 0;
const kawaWidoczna = () => document.getElementById('kawaOv').style.display === 'flex';
const kawaAktywna = () => performance.now() - _kawaOd >= KAWA.blokada;
function pokazKawe() {
  const ov = document.getElementById('kawaOv');
  const fil = ico('filizanka', 18);
  ov.classList.remove('dzieki');
  document.getElementById('kawaTytul').textContent = T('Nonna ma prośbę', 'A word from Nonna');
  document.getElementById('kawaTekst').innerHTML = T(
    // 29.09 (uwaga właściciela): kawa jest dla AUTORA gry, nie dla Nonny — Nonna tylko przekazuje prośbę
    `Autor tej gry gotuje ją po nocach, a Nonna pilnuje sosu. Jeśli smakuje, postaw kawę autorowi gry ${fil} — dzięki temu powstaną nowe mapy i postacie.`,
    `The game's author cooks it up late at night — Nonna just guards the sauce. If you like it, buy the game's author a coffee ${fil} — that's how new maps and characters get made.`);
  const tak = document.getElementById('kawaTak'), nie = document.getElementById('kawaNie');
  tak.hidden = false;
  tak.innerHTML = `${ico('filizanka', 20)} ${T('Postaw kawę autorowi gry', "Buy the game's author a coffee")}<span class="kawaGl" data-kgl="tak"></span>`;
  nie.innerHTML = `<span class="kawaTxt">${T('Może później', 'Maybe later')}</span><span class="kawaGl" data-kgl="nie"></span><i class="kawaPasek"></i>`;
  nie.disabled = true; nie.classList.add('czeka');
  _kawaOd = performance.now();
  clearTimeout(_kawaT);
  _kawaT = setTimeout(() => { nie.disabled = false; nie.classList.remove('czeka'); }, KAWA.blokada);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // Enter/Spacja nie „kliknie" JESZCZE RAZ pod spodem
  ov.style.display = 'flex';
  kawaGlify();
  if (WEJ.tryb === 'pad') gpMark(nie);             // pad: kursor na „Może później" (mashowanie A po śmierci nie otwiera płatności)
  STATY.zdarzenie('kawa/pokaz', 'Prośba o kawę: pokazana');
}
function kawaGlify() {
  const g = { tak: WEJ.tryb === 'klaw' ? glKl('ENTER') : '', nie: WEJ.tryb === 'klaw' ? glKl('ESC') : WEJ.tryb === 'pad' ? padKapsel(1) : '' };
  document.querySelectorAll('#kawaOv [data-kgl]').forEach(el => { el.innerHTML = g[el.dataset.kgl] || ''; });
}
function kawaTak() {
  if (!kawaWidoczna() || performance.now() - _kawaOd < KAWA.antyKlik) return;
  const ov = document.getElementById('kawaOv');
  if (ov.classList.contains('dzieki')) { zamknijKawe(); return; }
  try { window.open(KAWA_URL, '_blank', 'noopener'); } catch { /* blokada okienek — trudno */ }
  const K = META.kawa;
  K.spokojDo = Date.now() + KAWA.spokojDni * 864e5; K.klik = (K.klik || 0) + 1; saveMeta();
  STATY.zdarzenie('kawa/klik', 'Prośba o kawę: klik');
  ov.classList.add('dzieki');
  document.getElementById('kawaTytul').textContent = T('Grazie mille!', 'Grazie mille!');
  document.getElementById('kawaTekst').innerHTML = T(
    'Autor gry już nastawia kawiarkę, a Nonna przez miesiąc nie będzie Cię o nic prosić — wracaj do kuchni!',
    "The game's author is putting the moka pot on, and Nonna won't ask again for a month — back to the kitchen!");
  document.getElementById('kawaTak').hidden = true;
  clearTimeout(_kawaT);
  const nie = document.getElementById('kawaNie');
  nie.disabled = false; nie.classList.remove('czeka');
  nie.querySelector('.kawaTxt').textContent = T('Dalej', 'Continue');
  if (WEJ.tryb === 'pad') gpMark(nie);
}
function kawaPozniej() {
  if (!kawaWidoczna()) return;
  const dzieki = document.getElementById('kawaOv').classList.contains('dzieki');
  if (!dzieki && !kawaAktywna()) return;
  if (!dzieki) STATY.zdarzenie('kawa/pozniej', 'Prośba o kawę: może później');
  zamknijKawe();
}
function zamknijKawe() {
  clearTimeout(_kawaT);
  const ov = document.getElementById('kawaOv');
  if (ov.style.display !== 'flex') return;
  ov.style.display = 'none';
  if (WEJ.tryb === 'pad') gpMark(document.getElementById('btnRetry'));
}
// ---- PAUZA ----
function togglePause(on) {
  if (!G.running) return;
  // Ceremonia wygranej i animacja śmierci biegną do ekranu końca — pauza tu dawała „Do menu", które kasowało wynik
  // (przegląd K9–K11). Dotyczy wszystkich dróg: przycisk, ESC, Start na padzie, utrata blokady kursora.
  if (on && (G.dying || G.wygrana)) return;
  G.paused = on;
  if (on) puscMysz();                              // na pauzie gracz musi widziec kursor
  document.getElementById('pauseOv').style.display = on ? 'flex' : 'none';
  odswiezKarabinBtn();                             // przycisk karabinu nie może wisieć nad pauzą
  odswiezStawBtn(); odswiezSmrodBtn();             // Sokowirówka i aura też (update() na pauzie stoi)
  if (on) rysujPauze(G.pauzaTab || 'bieg');
}
// ============================== E2 K7: PAUZA Z ZAKŁADKAMI + KSIĄŻKA KUCHARSKA (spec 08 §4) ==============================
// BIEG (statystyki, bronie z Dokładkami, składniki, wybory) · KSIĄŻKA (Twoje dania + cała książka) · STEROWANIE (Jak grać).
// KSIĄŻKA widoczna od drugiego biegu albo gdy w tym biegu jakaś broń doszła do max (pierwsza sesja bez przeładowania).
const ksiazkaWidoczna = () => (META.st.runs || 0) >= 1 || !!(G.maxBroni && G.maxBroni.size);
const WKROTCE = ['wiatrowka', 'krzak', 'sokowirowka'];          // „Nonna jeszcze gotuje" — przepisy po premierze
let _ksiazkaSesja = false;
function rysujPauze(tab) {
  if (tab === 'ksiazka' && !ksiazkaWidoczna()) tab = 'bieg';
  G.pauzaTab = tab;
  if (tab === 'ksiazka') {
    if (META.ui.ksiazkaNowe) { META.ui.ksiazkaNowe = false; saveMeta(); }
    if (!_ksiazkaSesja) { _ksiazkaSesja = true; STATY.zdarzenie('ksiazka/otwarta', 'Książka Nonny otwarta'); }
  }
  rysujZakladkiPauzy(tab);
  const el = document.getElementById('pauseStats');
  el.className = 'pz-' + tab;
  el.innerHTML = tab === 'bieg' ? pauzaBiegHTML() : tab === 'ksiazka' ? ksiazkaHTML() : jakGracHTML();
  if (tab === 'ksiazka') for (const k of el.querySelectorAll('.kafel')) k.onclick = () => szczegolKafla(k.dataset.ek, k.dataset.bron);
  el.scrollTop = 0;
}
function rysujZakladkiPauzy(tab) {
  const zak = [['bieg', T('BIEG', 'RUN')], ...(ksiazkaWidoczna() ? [['ksiazka', T('KSIĄŻKA', 'COOKBOOK')]] : []), ['ster', T('STEROWANIE', 'CONTROLS')]];
  const pad = WEJ.tryb === 'pad';
  document.getElementById('pauseTabs').innerHTML = (pad ? padKapsel(4) : '') + zak.map(([k, n]) =>
    `<button class="btn2 ptab${k === tab ? ' sel' : ''}" data-ptab="${k}">${n}${k === 'ksiazka' && META.ui.ksiazkaNowe ? '<i class="kropka">!</i>' : ''}</button>`).join('') + (pad ? padKapsel(5) : '');
  for (const b of document.querySelectorAll('#pauseTabs .ptab')) b.onclick = () => rysujPauze(b.dataset.ptab);
}
function przelaczZakladkePauzy(dir) {
  const zak = [...document.querySelectorAll('#pauseTabs .ptab')].map(b => b.dataset.ptab);
  const i = zak.indexOf(G.pauzaTab || 'bieg');
  rysujPauze(zak[(i + dir + zak.length) % zak.length]);
  const sel = document.querySelector('#pauseTabs .ptab.sel'); if (sel && WEJ.tryb === 'pad') gpMark(sel);
}
function pauzaBiegHTML() {
  const Wb = P.wybory || {};
  return `<p>${T('Czas', 'Time')}: <b>${fmtTime(G.time)}</b> · ${T('Zabici', 'Kills')}: <b>${G.kills}</b> · ${T('Poziom', 'Level')}: <b>${P.lvl}</b> · ${ico('moneta', 15)} <b>${G.runCoins}</b></p>`
    + `<p>${T('Postać', 'Character')}: <b>${CHARS[charKey].nm}</b> · ${T('Mapa', 'Map')}: <b>${MAPS[mapKey].nm}</b></p>`
    + `<p>${T('Bronie', 'Weapons')}: ${P.weapons.map(w => { const W = WEAPONS[w.key], ev = PRZEPIS_BRONI[w.key] && P.evo[PRZEPIS_BRONI[w.key]];
        return ico(ev ? W.evoIco : W.ico, 18) + ' ' + (ev ? W.evoNm : W.nm) + ' <b>' + w.lvl + '</b>' + (w.bonus > 0 ? ` <b class="dokl">+${Math.round(w.bonus * 100)}%</b>` : ''); }).join(' · ')}</p>`
    + `<p>${T('Składniki', 'Ingredients')}: ${P.skl.length ? P.skl.map(k => ico(PASSIVES[k].ico, 16) + ' ' + PASSIVES[k].nm + ' <b>' + P.passives[k] + '</b> — ' + PASSIVES[k].suma(U(k), P.passives[k])).join(' · ') : '—'}</p>`
    + `<p>${T('Wybory', 'Choices')}: ${T('przelosuj', 'reroll')} <b>${Wb.przelos || 0}</b> · ${T('pomiń', 'skip')} <b>${Wb.pomin || 0}</b> · ${T('wyklucz', 'banish')} <b>${Wb.wyklucz || 0}</b></p>`;
}
// czas do następnego kaprala z kalendarza Wieczoru (null = kaprali już nie będzie)
function doKaprala() {
  // kapral, który jeszcze nie wyszedł (także czekający, bo żyje dwóch) — czas z kalendarza, najmniej 0
  const z = WIECZOR.find(z => z.typ === 'kapral' && !(G.zdarzenia || []).some(x => x.typ === 'kapral' + z.nr + '-start'));
  return z && !G.cisza ? Math.max(0, z.t - G.time) : null;
}
// status gotowego przepisu: leżąca Skrzynia Kaprala (w ciszy 9:53 Nonna ją przyniesie) → żywy kapral → następny z kalendarza → za późno
const kapralZywy = () => G.enemies.some(e => e.kapral && !e.dying && !e.odwrot);
const statusGotowy = () => {
  if (G.skrzynieKap.length) return T('GOTOWE — podnieś Skrzynię Kaprala!', "READY — grab the Corporal's Crate!");
  if (kapralZywy()) return T('GOTOWE — rozbij kaprala!', 'READY — smash the corporal!');
  const t = doKaprala();
  return t == null ? T('GOTOWE — ale kaprali już nie ma (następny bieg)', 'READY — but no corporals left (next run)')
       : t < 1 ? T('GOTOWE — kapral zaraz przyjdzie!', 'READY — a corporal is coming!')
       : T(`GOTOWE — rozbij kaprala! (za ${fmtTime(t)})`, `READY — smash a corporal! (in ${fmtTime(t)})`);
};
// zagadka Nonny z narastającą podpowiedzią: prawie ≥ 2 → ikona składnika, ≥ 4 → pełna nazwa
function zagadkaHTML(ek) {
  const R = PRZEPISY[ek], K = META.ksiazka[ek] || {};
  let h = `${ico('postac', 14)} <i>${T('„', '“')}${R.podp}${T('"', '”')}</i>`;
  if ((K.prawie || 0) >= 4) h += ` <b>${T(`Nonna: ${PASSIVES[R.skl].nm}, na litość boską!`, `Nonna: ${PASSIVES[R.skl].nm}, for heaven's sake!`)}</b>`;
  else if ((K.prawie || 0) >= 2) h += ` ${ico(PASSIVES[R.skl].ico, 14)}`;
  return h;
}
function ksiazkaHTML() {
  const odk = ek => !!(META.ksiazka[ek] && META.ksiazka[ek].odk);
  // A. TWOJE DANIA — wiersz na każdą posiadaną broń
  const wiersze = P.weapons.map(w => {
    const W = WEAPONS[w.key], ek = PRZEPIS_BRONI[w.key];
    if (!ek) return `<div class="kw szary">${ico(W.ico, 28)}<span class="kp">${w.lvl}/${W.max}</span><span class="kst">${T('Nonna jeszcze gotuje', "Nonna's still cooking")}</span></div>`;
    const R = PRZEPISY[ek], maSkl = P.skl.includes(R.skl), znany = odk(ek) || ((META.ksiazka[ek] || {}).prawie || 0) >= 2 || przepisGotowy(w);
    let st, cls = 'kreda', linia2 = '';
    if (P.evo[ek]) { st = T('UGOTOWANE', 'COOKED'); cls = 'zlote'; }
    else if (przepisGotowy(w)) { st = statusGotowy(); cls = 'puls'; }
    else {
      st = w.lvl < W.max ? T(`Broń: poz. ${w.lvl}/${W.max}`, `Weapon: lv. ${w.lvl}/${W.max}`) : '';
      if (!maSkl) linia2 = !sklOdbl(R.skl) ? klodkaSkl(R.skl, odk(ek))
        : odk(ek) ? T(`Brakuje: ${PASSIVES[R.skl].nm}`, `Missing: ${PASSIVES[R.skl].nm}`) : zagadkaHTML(ek);
      if (!st) { st = linia2; linia2 = ''; }
    }
    return `<div class="kw ${cls}">${ico(W.ico, 28)}<span class="kp">${w.lvl}/${W.max}</span> + `
      + `${!sklOdbl(R.skl) ? ico('klodka', 22) : znany ? ico(PASSIVES[R.skl].ico, 22) : '<span class="kq">?</span>'}<span class="${maSkl ? 'ok' : 'nie'}">${maSkl ? '✓' : '✗'}</span> = `
      + `${odk(ek) ? ico(W.evoIco, 28) : '<span class="kq">???</span>'}<span class="kst">${st}${linia2 ? `<br><small>${linia2}</small>` : ''}</span></div>`;
  }).join('');
  // B. CAŁA KSIĄŻKA — 12 przepisów + 3 „wkrótce"
  const wszystkie = Object.keys(PRZEPISY).filter(ek => PRZEPISY[ek].aktywny);
  const n = wszystkie.filter(odk).length;
  const kafle = wszystkie.map(ek => { const W = WEAPONS[PRZEPISY[ek].bron];
      return `<button class="btn2 kafel${odk(ek) ? ' odk' : ''}" data-ek="${ek}" title="${odk(ek) ? W.evoNm : '???'}">${ico(odk(ek) ? W.evoIco : W.ico, 26)}${odk(ek) ? '' : '<i>???</i>'}`
        + `${sklOdbl(PRZEPISY[ek].skl) ? '' : `<b class="kKl">${ico('klodka', 12)}</b>`}</button>`; }).join('')
    + WKROTCE.map(k => `<button class="btn2 kafel wkrotce" data-bron="${k}">${ico('klodka', 22)}</button>`).join('');
  return `<div class="ksiazka"><div class="kDania"><h3>${T('TWOJE DANIA', 'YOUR DISHES')}</h3>${wiersze}</div>`
    + `<div class="kSiatka"><h3>${T('CAŁA KSIĄŻKA', 'THE WHOLE BOOK')} <span>${T('Odkryte', 'Found')} ${n}/${wszystkie.length}</span></h3>`
    + `<div class="kafle">${kafle}</div><div class="kSzcz" id="kSzcz">${T('Dotknij kafla, żeby przeczytać przepis.', 'Tap a tile to read the recipe.')}</div></div></div>`;
}
function szczegolKafla(ek, bron) {
  const el = document.getElementById('kSzcz');
  if (!el) return;
  if (!ek) { el.innerHTML = `${ico(WEAPONS[bron].ico, 16)} ${WEAPONS[bron].nm}: ${T('Nonna jeszcze gotuje', "Nonna's still cooking")}`; return; }
  const R = PRZEPISY[ek], W = WEAPONS[R.bron], odk = !!(META.ksiazka[ek] && META.ksiazka[ek].odk);
  const kl = sklOdbl(R.skl) ? '' : `<br>${klodkaSkl(R.skl, odk)}`;
  if (odk)
    el.innerHTML = `${ico(W.ico, 16)} ${W.nm} (${T('poz.', 'lv.')} ${W.max}) + ${ico(PASSIVES[R.skl].ico, 16)} ${PASSIVES[R.skl].nm} → ${ico(W.evoIco, 16)} <b>${W.evoNm}</b>: ${W.evoDs.replace(/^(PRZEPIS|RECIPE): /, '')}${kl}`;
  else el.innerHTML = `${ico(W.ico, 16)} ${W.nm} + ? → ??? · ${zagadkaHTML(ek)}${kl}`;
}
// kłódka składnika przepisu, który nie jest jeszcze kupiony w Spiżarni Nonny (nazwa tylko, gdy przepis już znany)
function klodkaSkl(k, znany) {
  return `${ico('klodka', 14)} ${znany ? T(`${PASSIVES[k].nm} czeka w Spiżarni Nonny (Sklep)`, `${PASSIVES[k].nm} is waiting in Nonna's Pantry (Shop)`)
    : T('Ten składnik czeka w Spiżarni Nonny (Sklep)', "This ingredient is waiting in Nonna's Pantry (Shop)")}`;
}
// „JAK GRAĆ" W PAUZIE (życzenie właściciela 18.09 zamiast podpowiedzi na dole ekranu):
// wiersz na akcję, plakietka wg TRYBU WEJŚCIA (pad → glif pada, klawiatura → klawisz,
// dotyk → opis miejsca albo ikona przycisku z HUD-u, bez liter).
// Pokazuje tylko to, co gracz ma w tym biegu (karabin, wieżyczka, smród).
function jakGracHTML() {
  const pad = WEJ.tryb === 'pad', dot = WEJ.tryb === 'dotyk';
  const kl = glKl, opis = t => `<i class="jgOpis">${t}</i>`, ik = (n, h = 22) => `<span class="jgIko">${ico(n, h)}</span>`;
  const w = [
    [T('Ruch', 'Move'), pad ? glDrazek('L') : dot ? opis(T('lewa połowa ekranu', 'left half of the screen')) : kl('WASD')],
    [T('Kamera', 'Camera'), pad ? glDrazek('R') : dot ? opis(T('prawa połowa ekranu', 'right half of the screen'))
      : kl(T('MYSZ', 'MOUSE')) + kl('Q') + kl('E')],
    [T('Skok', 'Jump') + (hasGlide() ? T(' (trzymaj = szybowanie)', ' (hold = glide)') : ''),
      pad ? padGlyph('skok') : dot ? opis(T('przycisk SKOK', 'JUMP button')) : kl(T('SPACJA', 'SPACE'))],
  ];
  if (P.karabinMa || G.fps.on) w.push([T('Karabin', 'Rifle'), pad ? padGlyph('karabin') : dot ? ik('celownik') : kl('R')]);
  if (hasWeapon('sokowirowka')) w.push([T('Postaw Sokowirówkę', 'Place the Juicer'), pad ? padGlyph('wieza') : dot ? ik('sokowirowka') : kl('F')]);
  // przycisk aury istnieje tylko na ekranie dotykowym (CSS pointer:coarse) — ikona tylko tam, gdzie on jest
  if (charKey === 'garlicino') w.push([T('Smrodliwa aura', 'Stink aura'), pad ? padGlyph('smrod')
    : dot && matchMedia('(pointer:coarse)').matches ? ik('skarpeta') : kl('G')]);
  if (pad) w.push([T('Kamera za plecy', 'Camera behind'), padGlyph('kamera')]);
  w.push([T('Pauza', 'Pause'), pad ? padGlyph('pauza') : dot ? ik('pauza', 16) : kl('ESC')]);
  return `<div class="jakGrac"><h3>${T('JAK GRAĆ', 'HOW TO PLAY')}</h3>` +
    w.map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('') + `</div>`;
}
function setPlayerChar(key) {
  charKey = key;
  const C = CHARS[key];
  if (playerBB) playerBB.dispose();
  playerBB = new Billboard(C.char, C.scale, true);   // gracz zawsze widoczny nad hordą
  playerBB.update(0, P.pos, P.y || terrainH(0, 0), P.y || terrainH(0, 0));
}

function clearWorld() {
  usunGlazyRantu();
  for (const e of G.enemies) {
    e.bb.dispose();
    if (e.rozpadMat) e.rozpadMat.dispose();
    if (e.ring) scene.remove(e.ring);
  }
  for (const g of G.gems) scene.remove(g.mesh);
  for (const c of G.coins) scene.remove(c.mesh);
  for (const s of G.shots) scene.remove(s.mesh);
  for (const o of G.orbs) { scene.remove(o.mesh); if (o.segi) for (const sg of o.segi) scene.remove(sg); }
  for (const l of G.lobs) scene.remove(l.mesh);
  for (const k of G.krzaki) scene.remove(k.mesh);
  for (const b of G.boomers) scene.remove(b.mesh);
  for (const b of G.bolts) { scene.remove(b.mesh); b.mesh.material.dispose(); }
  for (const p of G.pops) { scene.remove(p.mesh); p.mesh.material.dispose(); }
  for (const h of G.hps) scene.remove(h.mesh);
  for (const k of G.kury) k.bb.dispose();
  for (const o of G.okruchy) scene.remove(o.mesh);
  for (const t of G.turrets) { scene.remove(t.mesh); if (t.pasTlo) { scene.remove(t.pasTlo); scene.remove(t.pasFill); } }
  for (const pe of G.pestki) pe.bb.dispose();
  for (const ki of G.kielki) scene.remove(ki.mesh);
  for (const s of G.karabinPoc) scene.remove(s.mesh);
  for (const gl of G.gluty) { scene.remove(gl.mesh); scene.remove(gl.krag); }
  for (const k of G.kaluze) { scene.remove(k.mesh); k.mesh.material.dispose(); }
  for (const pl of plamy) if (pl) pl.mesh.visible = false;
  for (const c of G.skrzynieKap) { scene.remove(c.mesh); scene.remove(c.ring); if (c.danie) scene.remove(c.danie); }   // E1-bieg K7 (+E2 danie)
  usunKapcieOrb();                                  // E2 K5: orbita Doppii
  for (const k of G.kaluzeGracza || []) { scene.remove(k.mesh); k.mesh.material.dispose(); }   // E2 K6
  G.kaluzeGracza = []; G.chmury = [];
  G.przepisyBiegu = [];
  G.skrzynieKap = []; G.telegrafy = []; G.donPoc = []; G.lawina = [];
  if (typeof ukryjSol === 'function') ukryjSol();
  G.enemies = []; G.gems = []; G.coins = []; G.shots = []; G.orbs = []; G.sparks = []; G.rings = [];
  G.lobs = []; G.boomers = []; G.bolts = []; G.pops = []; G.hps = []; G.kury = []; G.okruchy = [];
  G.krzaki = [];
  G.puffs = []; G.hitstop = 0; G.padajace = []; G.turrets = []; G.pestki = []; G.kielki = []; G.seria = [];
  G.karabinPoc = []; G.gluty = []; G.kaluze = [];
  G.streak = 0; G.streakT = -9;
  G.vacuum = 0; G.buff = { key: null, t: 0 };
  pasy(false);                                     // E1-bieg K8: pasy kinowe z 9:58 (wyjście do menu przed 10:02)
  document.getElementById('bossHp').classList.remove('on');
  document.getElementById('bossOv').classList.remove('on');
  document.getElementById('bossNm').classList.remove('on');
  puscMysz();                                      // w menu kursor musi wrocic
  // TRYB KARABINU: bez tego wyjście do menu w trakcie trybu zostawiało widok broni
  // na ekranie menu, a gracz wracał do biegu bez własnego sprite'a.
  if (G.fps.on) endKarabin('koniec');
  Object.assign(G.fps, { on: false, t: 0, zycia: 0, fireT: 0, pitch: 0, wejscie: 0, wyjscie: 0, kick: 0 });
  P.karabinMa = false;
  odswiezKarabinBtn();
  // kolejka overlayow: wyjscie do menu w trakcie awansu zostawialo ja pelna,
  // a nastepny bieg zaczynal sie od kart z poprzedniego
  OV_Q.length = 0;
  document.getElementById('cardsOv').style.display = 'none';
  document.getElementById('swapOv').style.display = 'none';
  for (const t of SKR.timery) clearTimeout(t);        // E2 K4: jackpot w trakcie animacji
  Object.assign(SKR, { timery: [], faza: 4, wynik: null });
  document.getElementById('skrzyniaOv').style.display = 'none'; G.karty = null;
  document.getElementById('fpsView').classList.remove('on');
  document.getElementById('fpsFlash').style.opacity = 0;
  document.getElementById('stawBtn').classList.remove('on');
  document.getElementById('smrodBtn').classList.remove('on'); _smrodStan = '';
  _stawStan = '';
  document.getElementById('buff').style.opacity = 0;
  for (const c of chests) placeChest(c);
  for (const t of totems) { t.cd = 0; t.mat.opacity = 1; t.ring.visible = true; t.dotyk = -9; }
  SK_OTW.length = 0; G.skrzOchr = -1;              // 30.09: otwierane kufry 3D (nakładka z nich już nie wejdzie)
  if (SK) SK.ef.wyczysc();
}

function newGame() {
  clearWorld();
  resetStats();
  Object.assign(G, { running: true, over: false, paused: false, dying: false, deathT: 0, time: 0, kills: 0, runCoins: 0, zebrane: 0, ranga: 0, rangaKille: 0, shake: 0, tlok: 0, kino: 0,
    spawnAkum: 0, podlogaT: 0, recyklT: 0, ketchT: 0, wiecIdx: 0, kolejkaFal: [], kolejkaSpawnu: [], falaNr: 0,
    dmgBron: {}, maxHit: { dmg: 0, zr: '', crit: false }, zdarzenia: [], probki: [],
    obrazeniaOd: {}, ostatniCios: null,
    kaprale: 0, cisza: false, donStart: null, wygrana: null, kinoMn: 0.55, donFaza2: null, donKoniec: null, solAkt: null,
    dpsTest: false, gotowyToast: false, przepisyBiegu: [], przepisyT: [], jackpoty: [], karty: null, chmury: [], kaluzeGracza: [],
    maxBroni: new Set(), pauzaTab: 'bieg', babcia: 0, nozeBonusSuma: 0, nozeSerie: 0, samePrzyprawy: 0, decyzje: 0, oknoAwansu: false,   // E2; oknoAwansu = AWANS CO 3
    // E3: zrodzeni per typ (HORDA.mapaStat), log kapliczek/wydarzenia/karabinu (bot, HORDA.wydLog)
    zrodzeni: {}, losowane: {}, e3: { stolnice: [], wyzwania: [], wyd: null, karabiny: [], trafWyd: 0 } });
  document.getElementById('timer').classList.remove('don');
  document.getElementById('bossNm').style.color = '';
  winieta(true);
  STATY.zdarzenie('run-start/' + charKey + '/' + mapKey, 'Bieg: ' + CHARS[charKey].nm + ' / ' + MAPS[mapKey].nm);
  STATY.zdarzenie('bieg-nr/' + kubelekBiegu(META.st.runs + 1), 'Bieg nr ' + (META.st.runs + 1));   // E1-bieg K9: lejek powrotów
  // E1-bieg K10: łagodny pierwszy bieg (spec §7) — pierwszy w historii zapisu albo druga szansa po śmierci przed 5:00
  G.lagodny = czyLagodny(); G.rekaNonny = false; G.nonnaDo = -1;
  G.pierwszyBieg = (META.st.pelne || 0) === 0;       // E2 K2: pierwszy bieg w historii zapisu — nauka rzadkości kart
  Object.assign(L_BIEG, G.lagodny ? CFG_BIEG.trybLagodny.L : L_NORMALNY);
  // ZALEW: łagodny (dziś tylko wymuszony w DEV) liczy od rozgrzewki `bieg` presetu, nie od wyłączonej przez zalew
  G.rozgrzR = G.lagodny ? { ...(trudn().bieg.rozgrzewka || CFG_BIEG.rozgrzewka), ...CFG_BIEG.trybLagodny.rozgrzewka } : null;
  P.sok = 0; P.leczT = 0;                           // licznik wysysania życia Beetina + blokada leczenia
  // Wąwozy: (0,0) jest wypłaszczone z definicji, ale pytamy moduł — gdyby ktoś przestawił
  // parametry, gracz nie ma się budzić w rzece ani na ścianie kanionu.
  if (MAPS[mapKey].rzeki) { const st = TW.startowaPozycja(); P.pos.set(st.x, 0, st.z); }
  else if (MAPS[mapKey].osiedle) P.pos.set(TO.START.x, 0, TO.START.z);   // środek podwórka (0,0 = skraj bloku)
  else P.pos.set(0, 0, 0);
  P.y = terrainH(P.pos.x, P.pos.z);
  // ODBUDOWA ŚWIATA. `clearWorld()` czyści `G.padajace`, ale NIE dotyka `ch.shelves`:
  // regał, który w chwili wyjścia z biegu miał `stan==='pada'`, zostawał zamrożony
  // w połowie upadku NA ZAWSZE (`przewrocRegaly` bierze tylko 'stoi', `updateRestock`
  // tylko 'lezy'), z kolizją regału STOJĄCEGO. A bieg startuje w (0,0,0), czyli
  // gracz od pierwszej sekundy stał w połamanej hali z niewidzialnymi ścianami.
  // Świat jest deterministyczny per chunk, więc przebudowa jest bezpieczna.
  rebuildWorld();
  wchest.active = false; wchest.wait = 8;
  if (wchest.mesh) wchest.mesh.visible = wchest.ring.visible = false;
  document.getElementById('lvl').textContent = T('POZIOM 1', 'LEVEL 1');
  document.getElementById('kills').innerHTML = ico('czaszka', 15) + ' 0';
  document.getElementById('xpbar').style.width = '0%';
  document.getElementById('xpbar').classList.toggle('karty', kartyCo() > 1 && poziomKart(2));   // AWANS CO 3: 1. awans = karty
  drawHearts(); drawCoins(); renderWpns();
  AUDIO.startRun(charKey);                         // losowy utwór na bieg + kwestia na start
  camYaw = 0;
  camera.position.set(0, terrainH(0, 0) + CAM_H, CAM_DIST);
  // osiedle startuje w (20, 20): kamera od razu za graczem, nie przelatuje przez blok z (0, 0)
  if (MAPS[mapKey].osiedle) camera.position.set(P.pos.x, P.y + CAM_H, P.pos.z + CAM_DIST);
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t0 = DEV ? performance.now() : 0;
  pollPads(dt);                                   // pady odpytujemy co klatkę
  if (BOT.naZywo && G.paused) botOverlay();       // DEV: bot na żywo (pomiar FPS na telefonie)
  if (G.running && !G.paused && (!BOT.on || BOT.naZywo)) {   // bot (DEV) krokuje sam, porcjami
    try { if (STRES) stresTick(); update(dt); } catch (err) { console.error(err); }
  }
  const t1 = DEV ? performance.now() : 0;
  // kopuła nieba jeździ za kamerą — inaczej dojechałbyś do jej krawędzi
  skyDome.position.copy(camera.position);
  // wiatr i chmury muszą płynąć TEŻ w menu i na pauzie: `update()` wtedy nie chodzi,
  // więc bez tego świat za overlayem stał jak zdjęcie.
  if (!G.running || G.paused) windU.value = performance.now() / 1000;
  // render TEŻ w try/catch: wyjątek stąd leciałby co klatkę, obraz by zamarzł,
  // a symulacja szłaby dalej — najgorszy możliwy rodzaj awarii
  // Menu A „Warzywniak" jest NIEPRZEZROCZYSTE (body.w-menu): świata za nim nie widać, więc rysujemy go tylko 2×/s —
  // shadery i tekstury zostają „ciepłe" na GRAJ, a telefon nie mieli GPU w menu na darmo.
  const zakryty = !G.running && document.body.classList.contains('w-menu');
  if (!zakryty || (_menuRnd += dt) > 0.5) {
    _menuRnd = 0;
    try { renderer.render(scene, camera); } catch (err) { console.error(err); }
  }
  if (DEV) devHudTick(t0, t1, performance.now());
}
let _menuRnd = 0;

// ============================== DEV: LICZNIK FPS + SCENA STRESU (E0) ==============================
// Tylko w DEV (port 8123 albo `?dev=1` — tak też na telefonie). Nakładka w lewym dolnym
// rogu, odświeżana 2× na sekundę, więc sama nic nie kosztuje:
//   FPS (średnia z okna) / najgorsza klatka w oknie (ms) — przycięcia widać po drugiej liczbie,
//   upd = czas `update()` na klatkę (CPU), rnd = czas wysłania `renderer.render` (CPU),
//   dc = draw calle, tri = trójkąty (główny przebieg), wr = żywi wrogowie (bez umierających),
//   tex/geo = obiekty GPU (renderer.info.memory).
let _devHud = null;
const _dh = { n: 0, t: 0, upd: 0, rnd: 0, maxDt: 0, last: 0 };
function devHudTick(t0, t1, t2) {
  if (!_devHud) {
    _devHud = document.createElement('div');
    _devHud.id = 'devHud';
    _devHud.style.cssText = 'position:fixed;left:calc(env(safe-area-inset-left,0px) + 4px);' +
      'bottom:calc(env(safe-area-inset-bottom,0px) + 4px);z-index:99999;pointer-events:none;' +
      'font:11px/1.25 ui-monospace,Menlo,Consolas,monospace;color:#d8ffb0;background:rgba(0,0,0,.62);' +
      'padding:3px 6px;border-radius:4px;white-space:pre';
    document.body.appendChild(_devHud);
    _dh.t = _dh.last = t2;
  }
  const fdt = t2 - _dh.last; _dh.last = t2;
  if (fdt > _dh.maxDt) _dh.maxDt = fdt;
  _dh.n++; _dh.upd += t1 - t0; _dh.rnd += t2 - t1;
  const okno = t2 - _dh.t;
  if (okno < 500) return;
  const ri = renderer.info;
  let wr = 0;
  for (const e of G.enemies) if (!e.dying) wr++;
  _devHud.textContent =
    `FPS ${(_dh.n * 1000 / okno).toFixed(0)}  max ${_dh.maxDt.toFixed(0)} ms` +
    `\nupd ${(_dh.upd / _dh.n).toFixed(1)} ms  rnd ${(_dh.rnd / _dh.n).toFixed(1)} ms` +
    `\ndc ${ri.render.calls}  tri ${(ri.render.triangles / 1000).toFixed(0)}k` +
    `\nwr ${wr}${STRES ? ' / stres ' + STRES : ''}  tex ${ri.memory.textures} geo ${ri.memory.geometries}`;
  _dh.n = 0; _dh.upd = 0; _dh.rnd = 0; _dh.maxDt = 0; _dh.t = t2;
}

// ============================== E1: PRZEPISANIE NOŚNIKÓW DO INSTANCJI ==============================
// Wołane z `scene.onBeforeRender`, czyli przy KAŻDYM renderze (pętla, HORDA.step/render),
// także na pauzie i w slow-mo śmierci — obraz zawsze odpowiada stanowi nośników.
// Koszt: jedno przejście po G.enemies i listach efektów (~0.2 ms przy 500 wrogach
// na desktopie) zamiast ~1000 obiektów w projectObject/sortowaniu three.js.
let pulaCien = null, pulaKrag = null, pulaIskry = null, pulaOkruchy = null, pulaPuff = null;
let pulaFala = null, pulaPlamy = null, pulaGemy = null, pulaMonety = null;
let pulaTelKrag = null, pulaTelDysk = null, pulaTelPas = null, pulaChipsy = null;   // E1-bieg K7/K8
const _kotwica = new THREE.Vector3();
function syncInstancje() {
  osKlatka();                                      // osiedle: zasięg chunków + przycinanie przy kamerze (przed KAŻDYM renderem)
  mkKlatka();                                      // market: chunki za mgłą nie rysują się
  if (!coinMat || !glowMat || !ringMat || !eliteRingMat || !pigulkaMat) return;   // przed bootem
  if (!pulaCien) {
    pulaCien = new InstPula(blobGeo, blobMat, { cap: 512, nazwa: 'cienie wrogów' });
    pulaKrag = new InstPula(blobGeo, eliteRingMat, { cap: 32, nazwa: 'kręgi elit' });
    // iskry BEZ zapisu głębi: jako pierwsza pula w grupie wycinały dziury w puffach, falach i wodzie
    const sm = sparkMat.clone(); sm.depthWrite = false;
    pulaIskry = new InstPula(sparkGeo, sm, { alfa: true, cap: 128, nazwa: 'iskry' });
    pulaOkruchy = new InstPula(okruchGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
                               { kolor: true, cap: 160, nazwa: 'okruchy' });
    const gm = glowMat.clone(); gm.opacity = 1;      // krycie 0.85 siedzi w `a` puffa
    pulaPuff = new InstPula(unitGeo, gm, { kolor: true, alfa: true, cap: 48, nazwa: 'puffy' });
    pulaFala = new InstPula(blobGeo, ringMat.clone(), { alfa: true, cap: 32, nazwa: 'fale' });
    pulaGemy = new InstPula(unitGeo, dropNadTrawa(pigulkaMat.clone(), 'gemy'), { cap: 128, nazwa: 'pigułki' });
    pulaMonety = new InstPula(unitGeo, dropNadTrawa(coinMat.clone(), 'monety'), { kolor: true, cap: 32, nazwa: 'monety' });
    // E1-bieg K7/K8: telegrafy (depthTest:false, renderOrder nad wszystkim w świecie) i pociski Dona
    pulaTelDysk = new InstPula(blobGeo, telMat(telDyskTexture()), { kolor: true, alfa: true, renderOrder: 950, cap: 16, nazwa: 'telegrafy: dyski' });
    pulaTelPas = new InstPula(pasGeo(), telMat(telPasTexture()), { kolor: true, alfa: true, renderOrder: 950, cap: 8, nazwa: 'telegrafy: pasy' });
    pulaTelKrag = new InstPula(blobGeo, telMat(telKragTexture()), { kolor: true, alfa: true, renderOrder: 951, cap: 16, nazwa: 'telegrafy: kręgi' });
    pulaChipsy = new InstPula(unitGeo, new THREE.MeshBasicMaterial({ map: chipsTexture(), alphaTest: 0.4, side: THREE.DoubleSide }),
                              { cap: 16, nazwa: 'chipsy Dona' });
  }
  if (!pulaPlamy && plamaMat) {                    // plamaMat powstaje przy pierwszej plamie
    const pm = plamaMat.clone(); pm.opacity = 1;
    pulaPlamy = new InstPula(plamaGeo, pm, { kolor: true, alfa: true, renderOrder: 1, cap: PLAM_MAX, nazwa: 'plamy' });
  }
  // kotwica na wysokości STÓP gracza (P.pos.y jest zawsze 0 — wtedy środek pul leżał pod
  // taflą wody 0.75 i wszystkie przezroczyste pule rysowały się przed wodą, która je gasiła)
  const kot = _kotwica.set(P.pos.x, P.y, P.pos.z);
  for (const g of HORDA_GRUPY) g.begin(kot);      // także bez mesha — może powstać w tej klatce
  for (const g of SYLW_GRUPY) g.begin(kot);       // E3 K2
  for (const p of PULE) p.begin(kot);
  for (const e of G.enemies) {
    const bb = e.bb;
    if (!bb.inst) continue;
    const m = bb.mesh;
    const hk = m.material && m.material.userData.hk;
    if (hk && m.visible) {
      hk.g.add(m, hk, bb.fxProg, bb.fxFlash);
      if (e.sylw) (hk.g.sylw || (hk.g.sylw = new GrupaSylwetek(hk.g))).add(m, hk, 0, e.don ? 1 : 0);   // E3 K2: sylwetka
    }
    pulaCien.add(bb.shadow);
    if (e.ring) pulaKrag.add(e.ring);
    if (e.ring2) pulaKrag.add(e.ring2);            // K7: drugi krąg kaprala
  }
  for (const t of G.telegrafy) (t.rodzaj === 'pas' ? pulaTelPas : t.rodzaj === 'dysk' ? pulaTelDysk : pulaTelKrag).add(t.o, t.a, t.kc);
  for (const c of G.donPoc) pulaChipsy.add(c.o);
  for (const l of G.lawina) if (l.o) pulaChipsy.add(l.o);
  for (const s of G.sparks) pulaIskry.add(s.mesh, s.a);
  for (const o of G.okruchy) pulaOkruchy.add(o.mesh, 1, o.kc);
  for (const p of G.puffs) pulaPuff.add(p.mesh, p.a, p.kc);
  for (const r of G.rings) pulaFala.add(r.mesh, r.a);
  for (const g of G.gems) pulaGemy.add(g.mesh);
  for (const c of G.coins) pulaMonety.add(c.mesh, 1, c.mesh.material && c.mesh.material.color);
  if (pulaPlamy) for (const p of plamy) if (p && p.mesh.visible) pulaPlamy.add(p.mesh, p.a, p.kc);
  for (const g of HORDA_GRUPY) g.end();
  for (const g of SYLW_GRUPY) g.end();
  for (const p of PULE) p.end();
  syncSkrzynie3D();                                // 30.09: skrzynie, kufry, garnki 3D + promienie, blaski, para, iskry
}
scene.onBeforeRender = syncInstancje;

// DEV: skąd biorą się draw calle. `HORDA.dcRaport()` liczy obiekty, które przejdą
// przez frustum w głównym przebiegu (widoczne w całym łańcuchu rodziców), pogrupowane:
// wrogowie (sprite/cień/krąg), tablice G.* z `.mesh`, reszta po typie geometrii.
// Liczba ≈ draw calle (materiał wielomateriałowy = więcej; cienie słońca osobno).
const _dcFr = new THREE.Frustum(), _dcM = new THREE.Matrix4();
function dcRaport() {
  camera.updateMatrixWorld();
  _dcM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _dcFr.setFromProjectionMatrix(_dcM);
  const etyk = new Map();
  for (const e of G.enemies) {
    etyk.set(e.bb.mesh, 'wróg:sprite');
    if (e.bb.shadow) etyk.set(e.bb.shadow, 'wróg:cień');
    if (e.ring) etyk.set(e.ring, 'wróg:krąg');
  }
  for (const p of PULE) etyk.set(p.mesh, 'pula:' + p.nazwa);
  for (const ch of chunkMap.values()) if (ch.osiedle) etyk.set(ch.mesh, 'teren:osiedle');   // 1 siatka na chunk
  for (const g of HORDA_GRUPY) if (g.mesh) etyk.set(g.mesh, 'pula:sprite ' + g.nazwa);
  for (const g of SYLW_GRUPY) if (g.mesh) etyk.set(g.mesh, 'pula:' + g.nazwa);   // E3 K2
  for (const [k, v] of Object.entries(G)) {
    if (!Array.isArray(v)) continue;
    for (const it of v) if (it && it.mesh && it.mesh.isObject3D && !etyk.has(it.mesh)) etyk.set(it.mesh, 'G.' + k);
  }
  const wynik = {};
  let razem = 0;
  scene.traverseVisible(o => {
    if (!(o.isMesh || o.isSprite || o.isPoints || o.isLine)) return;
    if (o.frustumCulled && !o.isInstancedMesh) {
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      if (!_dcFr.intersectsObject(o)) return;
    }
    let p = o, et = null;
    while (p && !(et = etyk.get(p))) p = p.parent;
    et = et || (o.userData.laki3D ? 'laki:struktury' : 'inne:' + (o.isInstancedMesh ? 'inst:' : '') + (o.geometry && o.geometry.type));
    wynik[et] = (wynik[et] || 0) + 1; razem++;
  });
  return { razem, dc: renderer.info.render.calls, ...Object.fromEntries(Object.entries(wynik).sort((a, b) => b[1] - a[1])) };
}

// SCENA STRESU: `?dev=1&stres=300` albo `HORDA.stres(500)` w konsoli.
// Utrzymuje STAŁĄ liczbę `STRES` żywych wrogów wokół gracza (dosypuje na pierścieniu
// r = 34–44, jak zwykły spawner, max 40 na klatkę), wyłącza zwykły spawner / fale /
// bossy, gracz jest nieśmiertelny (startDeath leczy), a XP nie daje awansów
// (karty pauzowałyby pomiar). Mieszanka 6 szeregowych typów = 6 różnych atlasów.
// Rozgrywki NIE zmienia: bez DEV `STRES` jest zawsze 0.
const STRES_TYPY = ['chipsetti', 'marshmallini', 'gummini', 'friesetti', 'sodino', 'lollini'];
let _stresK = 0;
let vramLicz = 1;                                 // znacznik przejścia w HORDA.vram()
function stresTick() {
  let zywi = 0;
  for (const e of G.enemies) if (!e.dying) zywi++;
  for (let s = 0; zywi < STRES && s < 40; s++, zywi++) spawnEnemy(STRES_TYPY[_stresK++ % STRES_TYPY.length], null, null, { r: [34, 44] });
  P.xp = 0;
  P.iframes = 0.5;          // ciosy w ogóle nie wchodzą (bez startDeath co 0.9 s, który ucinał update)
}

// ============================== DEV: BOT I POMIAR (E1-bieg K0, spec 07 §10.2) ==============================
// Prosty bot do liczb przed/po — celowo NIE jest stanowiskiem testowym (decyzja właściciela).
//   nowicjusz: ucieka od środka ciężkości wrogów w 12 j. + błądzi; skrzynie tylko < 8 j.; pierwsza karta.
//   średni: odpych od wrogów w 10 j. + krążenie (składowa styczna 0,7); złota skrzynia, gdy w 8 j. < 5 wrogów;
//           schodzi z kręgów ketchupu; karty wg priorytetu; wymiennik: nowa broń tylko do pustego slotu.
// Oba nie skaczą i nie używają karabinu/aury/Sokowirówki. Rusza wyłącznie w DEV (HORDA.botBieg).
function mulberry32(a) {                          // PRNG z seedem (algorytm domeny publicznej, patrz 06-gotowce §5)
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const BOT = { on: false, naZywo: false, tryb: 'sredni', karty: 'priorytet', ka: 0, kier: 1, kapliczki: false, dotyk: false };
let _ruchDev = null;                              // HORDA.ruch(vx, vz): nadpisanie wejścia jak touch.vx/vy
const BOT_PRIO = ['evo', 'bron', 'podsun', 'skl:moc', 'skl:tempo', 'skl:krytyk', 'skl:serce', 'skl:zasieg', 'skl:magnes', 'skl:buty', 'dokl'];   // E2 (spec §9.1)
const BOT_PRIO_AUTO = ['evo', 'podsun', 'bron', 'skl:moc', 'skl:tempo', 'skl:krytyk', 'skl:serce', 'skl:zasieg', 'skl:magnes', 'skl:buty', 'dokl'];   // AWANS CO 3
function botRuch() {                              // zwraca kierunek w ŚWIECIE {x, z}
  if (BOT.tryb === 'stoi') return { x: 0, z: 0 };  // ZALEW (29.09): „stoję i koszę" — gracz bez ruchu, tylko karty
  const now = BOT.tryb === 'nowicjusz', R = now ? 12 : 10;
  let ux = 0, uz = 0, cx = 0, cz = 0, n = 0, blisko8 = 0, blisko3 = 0, najD = 1e9, nx = 0, nz = 0;
  for (const e of G.enemies) {
    if (e.dying || e.odwrot) continue;               // K8: uciekająca w ciszy horda nie jest celem ani zagrożeniem
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d2 = dx * dx + dz * dz;
    if (d2 < 64) blisko8++;
    if (d2 < 9) blisko3++;
    if (d2 < najD) { najD = d2; nx = dx; nz = dz; }
    if (d2 > R * R || d2 < 1e-4) continue;
    const d = Math.sqrt(d2), s = (1 - d / R) * (1 - d / R);   // odpych rośnie z bliskością
    n++; cx += dx; cz += dz; ux -= dx / d * s; uz -= dz / d * s;
  }
  let wx = 0, wz = 0;
  if (now) {
    BOT.ka += (Math.random() - 0.5) * 0.25;
    wx = Math.sin(BOT.ka) * 0.5; wz = Math.cos(BOT.ka) * 0.5;
    if (n) { const l = Math.hypot(cx, cz) || 1; wx -= cx / l; wz -= cz / l; }
  } else {
    // Decyzja K0: sama ucieczka + krążenie odbiegało od hordy na zawsze (bieg 9:34, 94 zabójstwa,
    // poziom 5 — horda nie nadąża za 7 j./s). Gdy nikt nie jest groźnie blisko (odpych < 0,05,
    // czyli najbliższy dalej niż ~7,8 j.), średni PODCHODZI do najbliższego — tak gra człowiek.
    const ul = Math.hypot(ux, uz);
    if (ul > 0.05) { ux /= ul; uz /= ul; }
    else if (najD < 1e8) { const l = Math.sqrt(najD) || 1; ux = nx / l; uz = nz / l; }
    else { ux = Math.sin(G.time * 0.25); uz = Math.cos(G.time * 0.25); }
    if (Math.random() < 0.002) BOT.kier = -BOT.kier;
    const st = ul > 0.05 ? 0.7 : 0.3;
    wx = ux - uz * st * BOT.kier; wz = uz + ux * st * BOT.kier;
    for (const gl of G.gluty) {                   // krąg ketchupu = telegraf: wyjdź prostopadle
      const dx = P.pos.x - gl.to.x, dz = P.pos.z - gl.to.z, d = Math.hypot(dx, dz) || 1;
      if (d < KETCH_R + 1) { wx += dx / d * 3; wz += dz / d * 3; }
    }
    // K8: walka z Donem — średni krąży wokół niego w ~6 j. (tupnięcie/Wypad/aura sięgają, kontakt 200 HP nie),
    // a nie „podchodzi do najbliższego" (to wbiegało prosto w Dona 4,75 j./s w fazie 2)
    const don = G.enemies.find(e => e.don && !e.dying && !e.lot);
    if (don) {
      const dx = don.pos.x - P.pos.x, dz = don.pos.z - P.pos.z, kd = Math.hypot(dx, dz) || 1, ux = dx / kd, uz = dz / kd;
      const rad = Math.max(-2.2, Math.min(1.5, (kd - 6) * 0.6));
      wx = wx * 0.35 + ux * rad - uz * BOT.kier * 1.1; wz = wz * 0.35 + uz * rad + ux * BOT.kier * 1.1;
    }
    // E1-bieg K7/K8: telegrafy na ziemi (kręgi, pasy szarży, wycinek soli) — wyjdź z nich
    for (const t of G.telegrafy) {
      if (!t.strefa) continue;
      const dx = P.pos.x - t.x, dz = P.pos.z - t.z;
      if (t.rodzaj === 'pas') {
        const ux = Math.sin(t.kat), uz = Math.cos(t.kat), wzd = dx * ux + dz * uz, pop = dx * uz - dz * ux;
        if (wzd > -1 && wzd < t.dl + 1 && Math.abs(pop) < t.sz / 2 + 1.2) { const s = pop >= 0 ? 1 : -1; wx += uz * s * 3; wz -= ux * s * 3; }
      } else {
        const d = Math.hypot(dx, dz) || 1;
        if (d < t.r + 1) { wx += dx / d * 3; wz += dz / d * 3; }
      }
    }
    // K7: kapral to nagroda — średni krąży wokół niego w ~5 j. (bronie celują w najbliższego, więc człowiek
    // podchodzi do kaprala, żeby to on był celem); bliżej niż 3,5 j. — odskok
    let kap = null, kd = 1e9;
    for (const e of G.enemies) if (e.kapral && !e.dying && !e.odwrot) { const d = e.pos.distanceTo(P.pos); if (d < kd) { kd = d; kap = e; } }
    if (kap && kd < 40) {
      const kx = (kap.pos.x - P.pos.x) / kd, kz = (kap.pos.z - P.pos.z) / kd;
      const sila = kd > 5.5 ? Math.min(2, (kd - 5.5) * 0.4 + 0.8) : kd < 3.5 ? -1.5 : 0;
      wx += kx * sila - kz * 0.6 * BOT.kier; wz += kz * sila + kx * 0.6 * BOT.kier;
    }
    // K8: salwa chipsów Dona leci na gracza (≤ 9 j., zbliża się) — bieg w bok od toru, ZAWSZE w tę samą
    // stronę (BOT.kier), bo wachlarz zbiega się do środka i uniki „od każdego chipsa" się znosiły
    let grozi = null;
    for (const c of G.donPoc) {
      const dx = P.pos.x - c.x, dz = P.pos.z - c.z, d = Math.hypot(dx, dz);
      const vx = Math.sin(c.a), vz = Math.cos(c.a);
      if (d < 9 && dx * vx + dz * vz > 0 && Math.abs(dx * vz - dz * vx) < 2.5) { grozi = c; break; }
    }
    if (grozi) {
      const vx = Math.sin(grozi.a), vz = Math.cos(grozi.a);
      wx = wx * 0.3 + vz * BOT.kier * 3; wz = wz * 0.3 - vx * BOT.kier * 3;
    }
    const sol = typeof solStrefa === 'function' ? solStrefa() : null;
    if (sol) {                                    // wycinek soli: w bok od osi
      const dx = P.pos.x - sol.x, dz = P.pos.z - sol.z, d = Math.hypot(dx, dz);
      const ux = Math.sin(sol.a), uz = Math.cos(sol.a), pop = dx * uz - dz * ux;
      if (d < sol.r + 1.5 && dx * ux + dz * uz > -1) { const s = pop >= 0 ? 1 : -1; wx += uz * s * 3.5; wz -= ux * s * 3.5; }
    }
  }
  let cel = null, dc = now ? 8 : 12;
  if (wchest.active) { const d = wchest.pos.distanceTo(P.pos); if (now ? d < 8 : blisko8 < 5) { cel = wchest.pos; dc = d; } }
  // E1-bieg K7: Skrzynia Kaprala ma pierwszeństwo przed złotą (średni: gdy w 8 j. < 5 wrogów, nowicjusz: < 8 j.)
  for (const c of G.skrzynieKap) { const d = c.pos.distanceTo(P.pos); if (now ? d < 8 : blisko8 < 5) { cel = c.pos; dc = d; break; } }
  if (!cel) for (const c of chests) if (!c.opened) { const d = c.pos.distanceTo(P.pos); if (d < dc) { dc = d; cel = c.pos; } }
  if (cel && !now && blisko8 >= 8) cel = null;    // średni: do skrzyni tylko przy luzie
  // pigułki XP: bez zbierania η byłoby bliskie zera. Pomiar K5: przy warunku „w 8 j. < 8 wrogów"
  // bot zbierał ~0,3 XP na zabójstwo (horda 470 nigdy nie jest „luźna") — teraz średni idzie po
  // pigułki (9 j.), gdy tuż przy nim (3 j.) są najwyżej 2 wrogowie; nowicjusz tylko po te w 4 j.
  if (!cel && (now || blisko3 <= 2)) {
    dc = now ? 4 : 9;
    for (const g of G.gems) { const d = g.pos.distanceTo(P.pos); if (d < dc) { dc = d; cel = g.pos; } }
    if (!cel && P.hp < P.maxHp) for (const h of G.hps) { const d = h.pos.distanceTo(P.pos); if (d < (now ? 4 : 10)) cel = h.pos; }
  }
  if (cel) {
    const dx = cel.x - P.pos.x, dz = cel.z - P.pos.z, d = Math.hypot(dx, dz) || 1;
    const k = now ? 1.5 : 1.2;
    wx = wx * 0.5 + dx / d * k; wz = wz * 0.5 + dz / d * k;
  }
  if (MAPS[mapKey].osiedle) return osBotOmin(wx, wz);   // osiedle: omijanie ścian i wyjście z utknięcia
  if (MAPS[mapKey].indoor) return mkBotOmin(wx, wz);     // market: to samo (regały, lady, kasy)
  const l = Math.hypot(wx, wz) || 1;
  return { x: wx / l, z: wz / l };
}
function botOverlay() {                           // zamyka karty/wymiennik; false = nic do kliknięcia
  if (document.getElementById('cardsOv').style.display === 'flex') {
    const karty = [...document.getElementById('cards').children];
    if (!karty.length) return false;
    let wyb = karty[0], naj = 1e9;
    // E2: broń → podsunięty składnik (Nonna poleca) → Parmezan → Espresso → Papryczka → Rosół → Lornetka → Magnes →
    // Klapki → Dokładka najsłabszej broni → Przyprawy (spec §9.1)
    // AWANS CO 3: broń rośnie sama na awansach bez kart, więc w rzadkim oknie opłaca się składnik PODSUNIĘTY do przepisu
    // (danie w 3:00–4:00). Pomiar: stary bot na nowych zasadach — mediana śmierci 3:22 (N=40), ten — 3:48; na STARYCH
    // zasadach odwrotnie (podsunięty przed bronią: 2:18, stary: 4:05). Próba „każdy składnik przed bronią": 2:40.
    const PRIO = BOT.prio || (trudn().awans.bron ? BOT_PRIO_AUTO : BOT_PRIO);   // DEV: HORDA.bot.prio = [...] do porównań
    if (BOT.karty === 'priorytet') for (const k of karty) {
      const kl = k._klucz || '';
      let p = k.dataset.podsun ? PRIO.indexOf('podsun') : PRIO.findIndex(x => kl === x || kl.startsWith(x + ':'));
      if (kl.startsWith('dokl:')) p = PRIO.indexOf('dokl') + (hasWeapon(kl.slice(5))?.bonus || 0);
      if (p < 0) p = kl.startsWith('skl') ? 20 : 40;
      if (p < naj) { naj = p; wyb = k; }
    }
    // E2: przelosowuje, gdy żadna karta nie pasuje do priorytetu (same Przyprawy); nie wyklucza
    if (BOT.karty === 'priorytet' && naj >= 40 && P.wybory && P.wybory.przelos > 0 && G.karty) { wyborKart('przelos'); return true; }
    wyb.onclick(); return true;
  }
  if (document.getElementById('skrzyniaOv').style.display === 'flex') { zamknijJackpot(); return true; }   // E2 K4 (szybka)
  if (document.getElementById('swapOv').style.display === 'flex') {
    const k = [...document.getElementById('swapList').children];
    if (!k.length) return false;
    (k.find(x => x.classList.contains('gold')) || k[k.length - 1]).onclick(); return true;
  }
  return false;
}
// próbka co 10 s czasu gry (wołana z update w DEV) — HORDA.pomiar()
function devProbka() {
  const t = Math.floor(G.time / 10) * 10;
  if (G.probki.length && G.probki[G.probki.length - 1].t >= t) return;
  let zywi = 0, w15 = 0;
  for (const e of G.enemies) { if (e.dying) continue; zywi++;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z; if (dx * dx + dz * dz < 225) w15++; }
  const suma = Object.values(G.dmgBron).reduce((a, b) => a + b, 0);
  const pop = G.probki[G.probki.length - 1];
  G.probki.push({ t, zywi, w15, hp: P.hp, lvl: P.lvl, kills: G.kills, suma: Math.round(suma),
    dps10s: pop ? Math.round((suma - pop.suma) / Math.max(1, t - pop.t)) : 0,
    dmgBron: Object.fromEntries(Object.entries(G.dmgBron).map(([k, v]) => [k, Math.round(v)])),
    kaprale: G.kaprale || 0, ostatniCios: G.ostatniCios || null });
}
// PRESETY BUILDU do HORDA.skok(t, preset): poziomy broni/pasywów, ranga i poziom z modelu (spec §6, dodatek A)
const BOT_PRESETY = {
  // E2 K10: stan bota-średniego Carrotella z pełnych biegów v270 (N=10): 3 składniki przepisów po 5 poz. (5,5–6,5 j.),
  // Dokładki ~90% na broń w 10:00 (jackpoty), 2–3 dania. `u` = jednostki składników, `bonus` = Dokładki broni.
  'sredni-5':  { bronie: [5, 4, 3], evo: 0, pas: { moc: 3, tempo: 3, serce: 2 }, u: { moc: 3.5, tempo: 3.5, serce: 2 }, bonus: [0.2, 0, 0], ranga: 14, lvl: 22 },
  'sredni-10': { bronie: [5, 5, 5], evo: 3, pas: { moc: 5, tempo: 5, serce: 5 }, u: { moc: 6, tempo: 6, serce: 5.5 }, bonus: [0.9, 0.9, 0.85], ranga: 36, lvl: 37 },
};
function devSkok(t, preset) {
  bezZapisu = true;                                // DEV: bieg „przewinięty" nie trafia do META (rekord, statystyki)
  G.time = t;
  G.probki = G.probki.filter(p => p.t < t);
  if (typeof przewinWieczor === 'function') przewinWieczor(t);   // K1: zdarzenia przed t oznaczone
  const B = BOT_PRESETY[preset];
  if (B) {
    const dod = ['kule', 'kosc', 'tupniecie'].filter(k => k !== P.weapons[0].key && broniDostepna(k));
    while (P.weapons.length < 3 && dod.length) P.weapons.push({ key: dod.shift(), lvl: 1, t: 0, t0: t });
    P.weapons.forEach((w, i) => { w.lvl = Math.min(WEAPONS[w.key].max, B.bronie[i] || 1); });
    for (let i = 0; i < B.evo && i < P.weapons.length; i++) { const W = WEAPONS[P.weapons[i].key]; if (W.evoKey) P.evo[W.evoKey] = true; }
    for (const [k, v] of Object.entries(B.pas)) ustawSkladnik(k, v, (B.u && B.u[k]) || v);
    if (B.bonus) P.weapons.forEach((w, i) => { w.bonus = B.bonus[i] || 0; });
    P.hp = P.maxHp;
    G.ranga = B.ranga; P.lvl = B.lvl; P.xp = 0; P.xpNeed = xpDoNast(P.lvl);
    renderWpns(); drawHearts(); sprawdzRange();
    document.getElementById('lvl').textContent = T('POZIOM ', 'LEVEL ') + P.lvl;
  }
  return { t: G.time, lvl: P.lvl, bronie: P.weapons.map(w => w.key + ':' + w.lvl) };
}
// E2 K0 (spec 08 §7.3): POMIAR DPS BRONI na manekinach — HORDA.dpsBroni('kule', { lvl: 5, przepis: true, tryb: 'tlum' }).
// Gracz w (0,0) nieruchomo i nietykalny, jedna broń, zegar rusza od 3:00 (spawner i zdarzenia stoją), ranga 0,
// wynik w JEDNOSTKACH BAZOWYCH: Δ G.dmgBron[klucz] / czas / dmgAll() / SKALA_WROGA (porównywalne z dodatkiem B).
// 'cel' = jeden manekin (typ boss, 1e12 HP, stoi) 5 j. przed graczem; 'tlum' = 250 Chipsettich (1e9 HP) równomiernie
// w pierścieniu 1,5–15 j. (pozycje przywracane co krok — odrzut i separacja nie rozrzedzają tłumu).
function dpsBroni(klucz, o = {}) {
  const { lvl = WEAPONS[klucz].max, przepis = false, tryb = 'tlum', czas = 20, skl = {}, dt = 1 / 30, seed = 7 } = o;
  const ruch = o.ruch != null ? o.ruch : klucz === 'skarpeta';   // E2: Skarpeta w ruchu (smuga Smrodu pokoleniowego) — okrąg r 10, ~6 j./s
  const mr = Math.random;
  bezZapisu = true;
  Math.random = mulberry32(seed);
  try {
    if (!G.running || !G.dpsTest) { document.getElementById('startOv').style.display = 'none'; newGame(); }
    clearWorld(); resetStats();
    Object.assign(G, { dpsTest: true, time: 180, ranga: 0, dmgBron: {}, paused: false, cisza: true, buff: { key: null, t: 0 } });
    P.pos.set(0, 0, 0); P.y = terrainH(0, 0);
    if (playerBB) playerBB.facing = 0;             // kierunek Pizzy/Scyzoryków bez celu — zawsze ten sam
    wchest.active = false; wchest.wait = 1e9; if (wchest.mesh) wchest.mesh.visible = wchest.ring.visible = false;
    for (const t of totems) t.cd = 1e9;            // garnek Nonny przy (0,0) dawał ×2 obrażeń w pierwszym pomiarze po newGame
    for (const c of chests) c.opened = true;       // skrzynie też nie (karabin, magnes)
    G.nozeBonusSuma = 0; G.nozeSerie = 0;
    P.weapons = [{ key: klucz, lvl: Math.min(lvl, WEAPONS[klucz].max), t: 0, t0: 0 }];
    P.evo = {};
    const evoKey = typeof PRZEPIS_BRONI !== 'undefined' ? PRZEPIS_BRONI[klucz] : WEAPONS[klucz].evoKey;
    if (przepis && evoKey) P.evo[evoKey] = true;
    if (typeof ustawSkladnik === 'function') for (const [k, v] of Object.entries(skl)) ustawSkladnik(k, v);
    else Object.assign(P.passives, skl);
    Math.random = mulberry32(seed);                // PO newGame/clearWorld — pierwszy pomiar miał inne rozstawienie tłumu
    const man = [];
    const dodaj = (typ, x, z, hp) => {
      const e = spawnEnemy(typ, null, { x, z }, { elita: 'nie' });
      e.hp = e.maxHp = hp; e.tempo = 1e-6; e.manekin = { x, z }; e.jumpCd = 1e9;
      man.push(e);
    };
    if (tryb === 'cel') dodaj('boss', 0, 5, 1e12);
    else for (let i = 0; i < 250; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(1.5 * 1.5 + Math.random() * (15 * 15 - 1.5 * 1.5));
      dodaj('chipsetti', Math.sin(a) * r, Math.cos(a) * r, 1e9);
    }
    let trafien = 0, maxHit = 0;
    const kroki = Math.round(czas / dt);
    for (let i = 0; i < kroki; i++) {
      P.iframes = 99; P.xp = 0; G.ranga = 0; G.buff.key = null; G.hitstop = 0; G.kino = 0;   // zegar biegnie od 3:00 (cooldowny na G.time), spawner stoi
      if (ruch) { const a = i * dt * 0.6; P.pos.set(Math.sin(a) * 10, P.pos.y, Math.cos(a) * 10); } else P.pos.set(0, P.pos.y, 0);   // bieg ~6 j./s
      P.vx = P.vz = 0;
      if (klucz === 'sokowirowka') postawWiezyczke();
      const przed = G.dmgBron[klucz] || 0;
      update(dt);
      const d = (G.dmgBron[klucz] || 0) - przed;
      if (d > 0) { trafien++; maxHit = Math.max(maxHit, d); }
      for (const e of man) { e.pos.x = e.manekin.x; e.pos.z = e.manekin.z; e.kb.set(0, 0, 0); e.stun = 0; if (e.hp < e.maxHp * 0.5) e.hp = e.maxHp; }
      if (G.dying || !G.running) break;
    }
    const m = dmgAll() * SKALA_WROGA;
    return { klucz, lvl: P.weapons[0].lvl, przepis: !!(przepis && evoKey), tryb, ruch, dps: +((G.dmgBron[klucz] || 0) / czas / m).toFixed(2),
             klatekZTrafieniem: trafien, maxHit: +(maxHit / m).toFixed(2), skl };
  } finally {
    Math.random = mr;
  }
}
// wszystkie bronie × {poz. max, poz. max + przepis} × {cel, tłum} → console.table + wiersze do INFO-PROJEKT
// E2: tłum = średnia z 3 rozstawień (seed 7/11/13) — broń kierunkowa (Pizza) przez losowy tłum miała rozrzut 62–124
function tabelaDps(o = {}) {
  const wyn = [], sr = (k, oo) => { const s = [7, 11, 13].map(seed => dpsBroni(k, { ...oo, seed }).dps); return +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1); };
  for (const k of Object.keys(WEAPONS)) {
    const evo = typeof PRZEPIS_BRONI !== 'undefined' ? PRZEPIS_BRONI[k] : WEAPONS[k].evoKey;
    const w = { bron: k };
    for (const tryb of ['cel', 'tlum']) {
      const f = tryb === 'tlum' ? sr : (kk, oo) => dpsBroni(kk, oo).dps;
      w[tryb] = f(k, { ...o, tryb });
      w[tryb + '+P'] = evo ? f(k, { ...o, tryb, przepis: true }) : null;
    }
    wyn.push(w);
  }
  G.dpsTest = false; G.running = false; clearWorld();
  document.getElementById('startOv').style.display = 'flex';
  console.table(wyn);
  return wyn;
}
// PEŁNY BIEG BOTA (asynchronicznie, porcjami po 300 kroków — karta podglądu nie zamiera).
// META podmieniona na „weterana bez zakupów" (piorun odblokowany, pierwsze skrzynie za nim),
// Math.random z seedem, zapis wyłączony do przeładowania. Pętla rAF w tym czasie nie symuluje.
async function botBieg(o = {}) {
  const { tryb = 'sredni', postac = 'carrotello', mapa = 'laki', maxT = 600, seed = 1, dt = 1 / 30 } = o;
  const metaKopia = JSON.stringify(META), mr = Math.random;
  bezZapisu = true;
  Object.assign(META.up, { serce: 0, dmg: 0, szyb: 0, magnes: 0, klatwa: 0, karabin: 0 });
  META.unlocked = { piorun: 1 }; META.st.runs = META.st.pelne = META.st.smierci = 5; META.st.skrzynki = 99;
  META.st.jackpoty = 99;                           // E2: weteran — scenariusz jackpotów 1-1-3-1-5 już za nim (czysty zapis: od 0)
  // Spiżarnia (29.09): domyślnie bot ma tylko 3 startowe składniki; `spizarnia: true` = wszystko kupione + Większy słoik
  if (o.spizarnia) for (const k of [...SPIZ_KOLEJNOSC, 'sloik']) META.unlocked[k] = 1;
  // K10: `czysty: true` = zapis nowego gracza (0 biegów, nic nie odblokowane) → łagodny pierwszy bieg,
  // wyreżyserowane pierwsze skrzynie; `lagodny: true|false` wymusza tryb niezależnie od zapisu
  if (o.czysty) { META.unlocked = {}; Object.assign(META.st, { runs: 0, pelne: 0, smierci: 0, best: 0, skrzynki: 0, chests: 0, kills: 0, wins: 0, bestDon: 0, jackpoty: 0 }); }
  Math.random = mulberry32(seed);
  Object.assign(BOT, { on: true, tryb, karty: o.karty || (tryb === 'nowicjusz' ? 'pierwsza' : 'priorytet'), ka: 0, kier: 1,
                       lagodny: o.lagodny != null ? o.lagodny : null, kapliczki: !!o.kapliczki, dotyk: !!o.dotyk });   // E3: bot z kapliczkami / karabin w trybie dotyku
  const w = { tryb, postac, seed, czas: 0, lvlAt: {}, killsAt: {}, pierwszyKill: null, pierwszyAwans: null,
              maxZywi: 0, maxUpd: 0, maxUpdT: 0 };
  try {
    if (charKey !== postac) setPlayerChar(postac);
    if (mapKey !== mapa) setMap(mapa);
    document.getElementById('startOv').style.display = 'none';
    document.getElementById('overOv').style.display = 'none';
    // DETERMINIZM (K7): clearWorld() w newGame rozstawia skrzynie `landSpot`-em wokół STAREJ pozycji gracza
    // i sprawdza kolizje w chunkach STAREGO miejsca — ten sam seed dawał inny bieg (inna liczba losowań).
    // Start zawsze z (0,0) i świeżych chunków, dopiero potem seed.
    P.pos.set(0, 0, 0); rebuildWorld();
    for (const t of totems) placeTotem(t);          // garnki stoją tam, gdzie skończył się POPRZEDNI bieg (> 110 j. = losowanie w 1. klatce)
    if (playerBB) playerBB.facing = 0;              // kierunek postaci z poprzedniego biegu celował pierwsze rzuty
    if (!plamaGeo) splat(0, 0, 0xffffff, 0.01);      // tekstura plamy losuje kształt przy pierwszym trupie — rozgrzej przed seedem
    Math.random = mulberry32(seed);
    newGame();
    Math.random = mulberry32(seed * 7919 + 13);      // drugi seed PO newGame: nic z menu/audio nie przesuwa strumienia
    for (const c of chests) placeChest(c);           // skrzynie i garnki od nowa, już z seedem
    for (const t of totems) placeTotem(t);
    if (o.start) devSkok(o.start.t, o.start.preset);   // K7/K8: np. { t: 585, preset: 'sredni-10' } — prosto do ciszy
    const t0 = performance.now();
    while (G.running && G.time < maxT) {
      for (let i = 0; i < 300 && G.running && G.time < maxT; i++) {
        if (G.paused) { if (!botOverlay()) G.paused = false; continue; }
        if (o.niesmiertelny) P.hp = P.maxHp;         // pomiar krzywej poziomu/gęstości bez śmierci bota
        const tu = performance.now();
        update(dt);
        if (o.hak) o.hak(w);                         // DEV: próbkowanie co krok (pomiary K7/K8)
        const du = performance.now() - tu;
        if (du > w.maxUpd) { w.maxUpd = +du.toFixed(1); w.maxUpdT = +G.time.toFixed(1); }
        const zw = liczZywych();
        if (zw > w.maxZywi) w.maxZywi = zw;
        if (w.pierwszyKill === null && G.kills > 0) w.pierwszyKill = +G.time.toFixed(1);
        if (w.pierwszyAwans === null && P.lvl > 1) w.pierwszyAwans = +G.time.toFixed(1);
        if (w.pula37 == null && P.lvl >= 37) w.pula37 = cardPool().length;   // K11: kryterium 6
        for (const m of [60, 180, 300, 600]) if (G.time >= m && w.lvlAt[m] == null) { w.lvlAt[m] = P.lvl; w.killsAt[m] = G.kills; }
      }
      await new Promise(r => setTimeout(r, 0));
    }
    w.czas = +G.time.toFixed(1); w.lvl = P.lvl; w.kills = G.kills; w.przezyl = G.time >= maxT;
    w.lagodny = !!G.lagodny; w.rekaNonny = G.zdarzenia.find(z => z.typ === 'reka-nonny')?.t ?? null;
    w.dps = {};
    for (const [k, v] of Object.entries(G.dmgBron)) {
      const bron = P.weapons.find(x => x.key === k);
      w.dps[k] = Math.round(v / Math.max(1, G.time - (bron ? bron.t0 || 0 : 0)));
    }
    w.dmgBron = Object.fromEntries(Object.entries(G.dmgBron).map(([k, v]) => [k, Math.round(v)]));
    w.bronie = P.weapons.map(x => x.key + ':' + x.lvl);
    w.obrazeniaOd = Object.fromEntries(Object.entries(G.obrazeniaOd || {}).map(([k, v]) => [k, Math.round(v)]));
    w.probki = G.probki.map(p => ({ t: p.t, zywi: p.zywi, w15: p.w15, hp: Math.round(p.hp), lvl: p.lvl, kills: p.kills, dps10s: p.dps10s }));
    w.zdarzenia = G.zdarzenia.slice();
    // K7: TTK każdego kaprala (od pojawienia do piniaty); K8: walka z Donem
    w.kaprale = G.zdarzenia.filter(z => /^kapral\d-smierc$/.test(z.typ)).map(z => ({ nr: +z.typ[6], t: z.t, ttk: z.ttk }));
    for (const e of G.enemies) if (e.kapral && !e.dying)   // żywy na końcu: obrażenia/s zamiast TTK
      w.kaprale.push({ nr: e.kapral, ttk: null, zywy: +(G.time - e.kStart).toFixed(1), dps: Math.round((e.maxHp - e.hp) / Math.max(1, G.time - e.kStart)) });
    w.don = G.donStart == null ? null : {
      start: +G.donStart.toFixed(1), faza2: G.donFaza2 != null ? +(G.donFaza2 - G.donStart).toFixed(1) : null,
      walka: +((G.donKoniec != null ? G.donKoniec : G.time) - G.donStart).toFixed(1), wygrana: !!G.wygrana,
      hpDona: (d => d ? +(Math.max(0, d.hp) / d.maxHp).toFixed(2) : 0)(G.enemies.find(e => e.don && !e.dying)) };
    w.msKrok = +((performance.now() - t0) / Math.max(1, G.time / dt)).toFixed(2);
    w.e3 = { ...G.e3, mapa: mapKey, zrodzeni: { ...G.zrodzeni }, monety: G.runCoins };   // E3: kapliczki, wydarzenie, karabin
    if (G.running) { G.running = false; clearWorld(); }
    document.getElementById('overOv').style.display = 'none';
  } finally {
    Math.random = mr; BOT.on = false; BOT.lagodny = null; BOT.kapliczki = false; BOT.dotyk = false;
    const m = JSON.parse(metaKopia);
    for (const k of Object.keys(m)) META[k] = m[k];
  }
  return w;
}

// ============================== START ==============================
// ---- EKRAN ŁADOWANIA: pasek postępu + rotujące porady ----
const PORADY = [
  T('Złota skrzynia = nowa broń. Idź za strzałką na ekranie.',
    'A golden crate = a new weapon. Follow the arrow on screen.'),
  T('Marshmallini po śmierci dzieli się na dwa mniejsze. Planuj kolejność.',
    'Marshmallini splits into two smaller ones when killed. Plan the order.'),
  T('Sodino syczy przed wybuchem — to Twoja sekunda na ucieczkę.',
    'Sodino hisses before it blows — that hiss is your one second to run.'),
  T('Gummini odbija się i nie da się go odepchnąć. Nie licz na knockback.',
    'Gummini bounces and cannot be pushed. Do not count on knockback.'),
  T('Lollini kręci się jak piła. Wolny, ale nie właź pod tarczę.',
    'Lollini spins like a saw. Slow — just do not walk into the blade.'),
  T('Foliowa torba: PRZYTRZYMAJ skok w locie, żeby szybować nad hordą.',
    'Plastic Bag: HOLD jump in mid-air to glide over the horde.'),
  T('Na regale w markecie horda wspina się powoli — to Twoja chwila oddechu.',
    'On a supermarket shelf the horde climbs slowly — that is your breather.'),
  T('Woda spowalnia i Ciebie, i przekąski. Skokiem przeskoczysz zatoczkę.',
    'Water slows you and the snacks alike. A jump clears the narrow bits.'),
  T('Garnek Nonny daje buff na kilkanaście sekund. Warto po niego zboczyć z trasy.',
    "Nonna's Pot grants a buff for a good fifteen seconds. Worth the detour."),
  T('Monety zostają po śmierci — każdy przegrany bieg i tak coś daje.',
    'Coins survive your death — every lost run still pays for something.'),
  T('KARABIN ze skrzyni = pierwsza osoba i 20 sekund rzezi. Masz 3 trafienia.',
    'The RIFLE from a crate = first person and 20 seconds of carnage. You get 3 hits.'),
  T('W trybie karabinu cios odrzuca całą hordę — ale trzeci kończy zabawę.',
    'In rifle mode a hit throws the whole horde back — but the third one ends it.'),
  T('Magazynek Nonny w sklepie wydłuża tryb karabinu o 5 sekund za poziom.',
    "Nonna's Magazine in the shop adds 5 seconds of rifle time per level."),
];
const loadOv = document.getElementById('loadOv');
const loadBar = document.getElementById('loadBar');
const loadTxt = document.getElementById('loadTxt');
const loadTip = document.getElementById('loadTip');
let krokLad = 0;
const KROKOW = 13;                                   // ile etapów startu (dopasowane do boot)
function ladowanie(opis) {
  krokLad++;
  if (loadBar) loadBar.style.width = Math.min(100, krokLad / KROKOW * 100) + '%';
  if (loadTxt) loadTxt.textContent = opis;
  // Oddaj klatkę przeglądarce, żeby pasek się przerysował. UWAGA: rAF jest
  // WSTRZYMYWANY w karcie w tle — bez awaryjnego setTimeout ładowanie wisiałoby
  // w nieskończoność u każdego, kto przełączy kartę podczas startu.
  return new Promise(r => {
    let gotowe = false;
    const koniec = () => { if (!gotowe) { gotowe = true; r(); } };
    requestAnimationFrame(() => setTimeout(koniec, 0));
    setTimeout(koniec, 150);
  });
}
if (loadTip) {
  loadTip.textContent = PORADY[Math.floor(Math.random() * PORADY.length)];
  setInterval(() => {
    if (loadOv && !loadOv.classList.contains('znika'))
      loadTip.textContent = PORADY[Math.floor(Math.random() * PORADY.length)];
  }, 2600);
}

(async function boot() {
  // JĘZYK NAJPIERW: etykiety z `data-pl`/`data-en` muszą wejść, ZANIM main.js
  // dopisze ikonki do zakładek (`insertAdjacentHTML('afterbegin')` niżej) —
  // odwrotna kolejność kasowałaby ikony przy każdym podmienieniu innerHTML.
  zastosujJezyk();
  await ladowanie(T('Wysypywanie witamin…', 'Pouring out the vitamins…'));
  const pig = await flatMat('assets/pigulka.png');
  pigulkaMat = pig.mat; pigulkaAspect = pig.w / pig.h;
  const czo = await flatMat('assets/czosnek.png');
  czosnekMat = czo.mat; czosnekAspect = czo.w / czo.h;
  coinMat = new THREE.MeshBasicMaterial({ map: coinTexture(), transparent: true, depthWrite: false });
  ringMat = new THREE.MeshBasicMaterial({ map: ringTexture('rgba(255,235,150,0.95)'), transparent: true, depthWrite: false });
  // E1-bieg K6: FIOLET = ELITA (wzór DRG: Survivor); złoto zostaje dla skrzyń i monet
  eliteRingMat = new THREE.MeshBasicMaterial({ map: ringTexture('rgba(170,90,255,0.95)'), transparent: true, depthWrite: false });
  // złota skrzynia z bronią: model 3D „zlota" (syncSkrzynie3D) + złoty pierścień; `mesh` = nośnik pozycji poza sceną
  // (chest0..3.png nie są już wczytywane — skrzynie to modele z lib/modele-skrzynie.js)
  wchest.mesh = new THREE.Object3D();
  wchest.mesh.visible = false;
  wchest.ring = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({
    map: ringTexture('rgba(255,215,94,0.95)'), transparent: true, depthWrite: false }));
  wchest.ring.scale.setScalar(3.4);
  wchest.ring.visible = false;
  scene.add(wchest.ring);
  // (column1.png = dawna kolumna totemu; garnek/witryna są proceduralne, plik nie jest już wczytywany)
  bottleMat = (await flatMat('assets/bottle.png')).mat;
  // pizza zamiast radia z Rudeusza (nazwa zmiennej zostaje — wisi na niej pocisk bumerangu)
  radioMat = new THREE.MeshBasicMaterial({ map: pizzaTexture(), transparent: true,
    alphaTest: 0.4, side: THREE.DoubleSide });
  kapecMat = new THREE.MeshBasicMaterial({ map: kapecTexture(), transparent: true,
    alphaTest: 0.4, side: THREE.DoubleSide });
  try { salataMat = (await flatMat('assets/salata_czasza.png')).mat; } catch { salataMat = null; }
  // scyzoryk ze sprite'a wlasciciela; `scyzorykTexture()` zostaje jako awaryjny.
  // Rysunek jest po przekatnej kwadratu, wiec aspekt 1 i nieco wiekszy quad —
  // przy wirowaniu poczatkowy kat i tak przestaje mieć znaczenie.
  try {
    scyzorykMat = (await flatMat('assets/scyzoryk.png')).mat;
    scyzorykAspect = 1.0;
    scyzorykMat.side = THREE.DoubleSide;
  } catch {
    scyzorykMat = new THREE.MeshBasicMaterial({ map: scyzorykTexture(), transparent: true,
      alphaTest: 0.4, side: THREE.DoubleSide });
  }
  heartMat = emojiMat('❤️');
  // postacie grywalne (potrzebne też do portretów w menu)
  // ===== VEGGIE FAMIGLIA =====
  await ladowanie(T('Budzenie Carrotella…', 'Waking Carrotello…'));
  await buildChar('carrotello_squattello', ['idle', 'run', 'jump']);
  await ladowanie(T('Beetino zakłada okulary…', 'Beetino puts his shades on…'));
  await buildChar('beetino_bouncerino', ['idle', 'run', 'jump']);   // poprawka MA idle
  await ladowanie(T('Babcia szuka kapcia…', 'Granny is looking for her slipper…'));
  await buildChar('granny_smithella', ['idle', 'run', 'jump']);
  await ladowanie(T('Razoretta ostrzy scyzoryk…', 'Razoretta sharpens a knife…'));
  await buildChar('radishetta_razoretta', ['idle', 'run', 'jump']);
  await ladowanie(T('Pipsini wychodzi z jabłka…', 'Pipsini climbs out of the apple…'));
  await buildChar('pipsini_nipotini', ['idle', 'run']);
  // 'aura' = animacja aktywnej umiejetnosci (katalog 'ladowanie_smrodliwej_aury').
  // Bez wypisania jej TUTAJ `buildChar` by jej nie zbudowal i `play('aura')`
  // spadloby na fallback do idle — umiejetnosc bylaby niewidoczna.
  await ladowanie(T('Garlicino nabiera smrodu…', 'Garlicino works up a stink…'));
  await buildChar('garlicino_stinkerino', ['idle', 'run', 'jump', 'aura']);
  await ladowanie(T('Zwoływanie Famiglia Snackoni…', 'Summoning the Famiglia Snackoni…'));
  for (const w of ['chipsetti_soldatetti', 'marshmallini_fluffini', 'gummini_bouncini',
                   'friesetti_spearetti', 'sodino_explodino', 'lollini_spinnini']) {
    await buildChar(w, ['run']);
  }
  // 'punch' = animacja WYCISKANIA SIĘ z paczki PixelLaba; packer ją wcześniej po cichu
  // pomijał, bo katalog nazywał się 'squeezes_its_own_body_hard_with_tiny_arms_compress'
  await buildChar('ketchupino_splatterino', ['run', 'punch']);   // pierwszy wróg dystansowy
  await ladowanie(T('Don Chipso poprawia kapelusz…', 'Don Chipso straightens his fedora…'));
  await buildChar('don_chipso', ['run', 'jump', 'idle']);   // K8: jump = wejście i Chiamata, idle = telegraf/odpoczynek
  // Kernello ma WLASNA animacje eksplozji — jedyny wrog z prawdziwym `death`
  await buildChar('kernello_boomello', ['idle', 'run', 'death']);
  await ladowanie(T('Sadzenie krzaków…', 'Planting the bushes…'));
  await loadDecoMats();
  chunkMat = addCloudShadow(new THREE.MeshLambertMaterial({ map: grassTexC, vertexColors: true }));
  chunkMatIndoor = new THREE.MeshLambertMaterial({ map: floorTexC, vertexColors: true });
  shelfMat = new THREE.MeshLambertMaterial({ map: shelfTexture() });
  coolerMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#9fc6d8', '#5d8ba3', 5) });
  spillMat = new THREE.MeshBasicMaterial({ map: spillTexture(), transparent: true, depthWrite: false });
  grassMat = addWind(new THREE.MeshLambertMaterial({ map: bladeTexture(), alphaTest: 0.45,
    side: THREE.DoubleSide, transparent: false }), 0.22, 2.1);
  cloudShadowU.value = cloudShadowTexture();
  bladeMat = makeBladeMaterial();
  // gietkosc: kwiatek na cienkiej łodydze kładzie się chętniej, sucha trawa jeszcze
  // chętniej (i tak stoi wyżej, więc pochylenie jest na niej najlepiej widoczne)
  flowerMat = makeBladeMaterial(flowerTexture(), 1.15);
  stalkMat = makeBladeMaterial(stalkTexture(), 1.3);
  glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 });
  await initLiscie();                              // tekstury gałązek (ez-tree) + materiały liści
  // MODELE NATURY (Quaternius, CC0) — kwiaty, paprocie, kamienie, głazy. Gdyby się nie wczytały,
  // gra ma ruszyć normalnie (chunki po prostu ich nie postawią), stąd try/catch bez rzucania.
  try { NATURA = await wczytajModeleNatury(THREE, 'assets/quaternius/'); }
  catch (e) { console.warn('modele natury:', e); NATURA = null; }
  if (NATURA) {
    // indeks po nazwie + dopisanie nazwy do rekordu (chunk wybiera modele po nazwie)
    NATURA.wg = {};
    for (const grupa of Object.keys(NATURA)) {
      if (!Array.isArray(NATURA[grupa])) continue;
      for (const m of NATURA[grupa]) if (m) NATURA.wg[m.nazwa] = m;
    }
    przemalujGlazy();
  }
  generujPrefabyDrzew();                           // 12 prefabów drzew z gałęziami (raz, na starcie)
  initGrassField();
  crateMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#b98a4e', '#7d5a2e', 4) });
  plankMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#a9793f', '#6d4a22', 6) });
  stoneMat = new THREE.MeshLambertMaterial({ map: stripeTexture('#9a9c96', '#6f7169', 3) });

  charKey = (CHARS[META.lastChar] && maszPostac(META.lastChar)) ? META.lastChar : 'carrotello';
  mapKey = MAPS[META.lastMap] && mapaOdbl(META.lastMap) ? META.lastMap : 'laki';
  P.pos = new THREE.Vector3(0, 0, 0);
  P.y = terrainH(0, 0);
  playerBB = new Billboard(CHARS[charKey].char, CHARS[charKey].scale, true);
  initHitFlash();
  initAura();
  initSmrod();
  // MIKSER: podmieniamy zaslepke na sprite'a zaraz po wczytaniu (jesli sie wczyta)
  try {
    const mk = await flatMat('assets/mikser.png');
    sokoMat = mk.mat; sokoAsp = mk.w / mk.h;
  } catch (err) { console.warn('mikser.png nie wstal — zostaje zaslepka', err); }
  initKrzak();
  initKino();
  initLettuce();
  initKarabin();         // widok broni do trybu pierwszej osoby (nakładka 2D)
  karabinPocMat = new THREE.MeshBasicMaterial({ map: karabinPocTexture(), transparent: true,
    alphaTest: 0.4, side: THREE.DoubleSide, depthWrite: false });
  resetStats();          // P.pos musi istnieć PRZED chunkami i skrzyniami
  setMap(mapKey);        // buduje świat + rozstawia skrzynie/totemy
  await ladowanie(T('Ukrywanie skrzyń…', 'Hiding the crates…'));
  initSkrzynie3D();         // 30.09: modele skrzyń, kufrów i garnka (liczone z kodu, raz) + efekty
  spawnChests(9);
  await ladowanie(T('Stawianie garnków Nonny…', "Setting out Nonna's pots…"));
  spawnTotems(3);
  ustawWygladGarnkow(mapKey);
  drawHearts();
  await ladowanie(T('Otwieranie sklepu…', 'Opening the shop…'));
  renderShop(); renderMaps(); renderChars(); renderStats(); renderBestiary(); renderPick();
  renderSterowanie();    // zakładka Sterowanie (mapowanie pada)
  AUDIO.initUI();        // suwaki głośności w zakładce Dźwięk
  // KLIK w UI: jeden delegat na cały dokument zamiast dopisywania dźwięku
  // do każdego przycisku osobno (menu jest generowane w kilku miejscach).
  addEventListener('pointerdown', ev => {
    if (ev.target.closest && ev.target.closest('.tab,.tile,.card,.bigbtn,.btn2,.wNav,#jumpBtn')) AUDIO.sfx('klik');
  }, true);
  AUDIO.setPostac(charKey);
  AUDIO.menu();          // motyw główny — ruszy przy pierwszym kliknięciu (autoplay policy)
  fitCamera();
  camera.position.set(0, terrainH(0, 0) + CAM_H, CAM_DIST);
  camera.lookAt(0, 1.3, -2.2);
  refreshSpriteTilt();                   // pierwsza klatka też ma mieć poprawne pochylenie
  playerBB.update(0, P.pos, P.y, P.y);
  await ladowanie(T('Sól i cukier na pozycjach…', 'Salt and sugar in position…'));
  loop();
  await ladowanie(T('Gotowe!', 'Ready!'));
  if (loadOv) { loadOv.classList.add('znika'); setTimeout(() => loadOv.remove(), 500); }

  const menu = document.getElementById('startOv');
  initEkranUI();                       // przełącznik pełnego ekranu + instalacja PWA
  initJezykUI();                       // przełącznik PL | EN (róg menu + zakładka „Dźwięk i ekran")
  // PEŁNY EKRAN NAJPIERW: `requestFullscreen` liczy się tylko wewnątrz gestu
  // użytkownika, a `newGame()` robi swoje długo — po nim gest bywa już „zużyty".
  document.getElementById('btnStart').onclick = () => {
    sprobujPelnyEkran();
    menu.style.display = 'none'; newGame();
  };
  document.getElementById('kawaTak').onclick = kawaTak;                 // B12
  document.getElementById('kawaNie').onclick = kawaPozniej;
  document.getElementById('btnRetry').onclick = () => {
    sprobujPelnyEkran();               // gracz mógł w międzyczasie wyjść z pełnego ekranu
    zamknijKawe();
    document.getElementById('overOv').style.display = 'none';
    newGame();
    if (myszWrac) { myszWrac = false; setTimeout(chwycMysz, 0); }   // grał myszą — od razu z powrotem, bez klikania w obraz
  };
  document.getElementById('btnMenu').onclick = () => {
    myszWrac = false;
    zamknijKawe();
    document.getElementById('overOv').style.display = 'none';
    menu.style.display = 'flex';
  };
  // DEV: scena stresu z adresu (`?dev=1&stres=300`). Bieg rusza sam, chyba że właśnie
  // leci komiks pierwszego uruchomienia — wtedy tryb czeka na GRAJ.
  function startStres(n) {
    STRES = Math.max(0, Math.floor(+n || 0));
    if (STRES) bezZapisu = true;
    // wyłączenie w trakcie biegu: zegary bossów/fal stały podczas stresu, bez tego
    // po 10 min stresu wpadało naraz ~12 bossów
    if (!STRES && G.running) przewinWieczor(G.time);   // kalendarz Wieczoru od bieżącej chwili
    if (STRES && !G.running && META.ui.komiks) {
      document.getElementById('overOv').style.display = 'none';
      menu.style.display = 'none';
      newGame();
    }
    return STRES;
  }
  if (DEV) {
    const m = location.search.match(/[?&]stres=(\d+)/);
    if (m) startStres(m[1]);
  }
  // ---- KOMIKS WPROWADZAJĄCY ----
  // Przy PIERWSZYM uruchomieniu leci PO ekranie ładowania i PRZED menu: menu chowamy
  // na czas komiksu, bo `#startOv` jest widoczny od startu (zakrywał go tylko `#loadOv`),
  // a dwa `.ov` naraz to prześwitujące logo pod planszą i pad nawigujący po menu pod spodem.
  // `META.ui.komiks` zapisujemy DOPIERO po zamknięciu — kto zamknie kartę w połowie,
  // dostanie komiks jeszcze raz. Z menu (FABUŁA) nie zapisujemy nic.
  document.getElementById('fabulaBtn').onclick = e => { e.preventDefault(); pokazKomiks({ zMenu: true }); };
  if (!META.ui.komiks) {
    menu.style.display = 'none';
    pokazKomiks().then(() => {
      META.ui.komiks = true; saveMeta();
      menu.style.display = 'flex';
    });
  }
  // ---- KOD OD NONNY (Ustawienia; 29.09) ----
  // Kody na monety dla wspierających (kawa → Piotr wysyła kod). W źródle i w `kody.json` NIE MA jawnych kodów — tylko
  // SHA-256(SOL + kod po normalizacji) i kwota. Nowy kod = nowy wpis w `kody.json` (narzedzia/kod_monet.py) i wydanie,
  // bez zmiany main.js. Każdy kod działa RAZ na urządzenie (META.kody). Po złym kodzie 2 s blokady.
  // Stary kod `rudeuszek2123` (wszystko odblokowane + 5000) działa WYŁĄCZNIE w DEV.
  const kodInfo = document.getElementById('kodInfo');
  const kodInput = document.getElementById('kodInput');
  const kodBtn = document.getElementById('kodBtn');
  renderTabliczkaNonny('nonnaKod', false);
  const kodKom = (txt, zle) => { if (kodInfo) { kodInfo.className = zle ? 'zle' : ''; kodInfo.textContent = txt; } };
  async function uzyjKodu() {
    const surowy = (kodInput.value || '').trim();
    if (!surowy) return;
    if (DEV && surowy.toLowerCase() === 'rudeuszek2123') {
      for (const k of Object.keys(CHARS)) META.chars[k] = 1;          // wszystkie postacie
      for (const it of SHOP_UNLOCKS) META.unlocked[it.key] = 1;       // bronie i zdolności
      for (const k of [...SPIZ_KOLEJNOSC, 'sloik']) META.unlocked[k] = 1;   // Spiżarnia Nonny: składniki + Większy słoik
      for (const it of SHOP) META.up[it.key] = it.max;                // ulepszenia na max
      META.coins += 5000;
      saveMeta();
      renderShop(); renderChars(); renderPick();
      if (typeof renderBestiary === 'function') renderBestiary();
      kodKom(T('KOD PRZYJĘTY! Odblokowano wszystko + 5000 monet.', 'CODE ACCEPTED! Everything unlocked + 5000 coins.'));
      kodInput.value = '';
      return;
    }
    const w = await KODY_NONNY.sprawdz(surowy);
    if (w.ok) {
      META.coins += w.monety; META.kody[w.klucz] = Date.now();
      if (w.mapy) {                                 // 01.10: wszystkie mapy otwarte (ta sama ścieżka co migracja `st.mapyOtw`)
        META.st.mapyOtw = Object.assign(META.st.mapyOtw || {}, Object.fromEntries(Object.keys(MAPA_WARUNEK).map(k => [k, 1])));
      }
      saveMeta();
      renderShop(); odswiezRog(); renderPick(); renderMaps();
      AUDIO.sfx('zlota'); blysk('#ffd75e', 0.35);
      STATY.zdarzenie('kod/ok' + (w.mapy ? '-mapy' : ''), 'Kod od Nonny: przyjęty');
      const tm = w.mapy ? T('Wszystkie mapy otwarte!', 'All maps unlocked!') : '';
      kodKom(w.monety ? T(`Nonna dorzuca ${liczba(w.monety)} monet!`, `Nonna chips in ${liczba(w.monety)} coins!`) + (tm ? ' ' + tm : '') : tm);
      kodInput.value = '';
      return;
    }
    if (w.powod === 'uzyty') kodKom(T('Ten kod już został tu wykorzystany.', 'This code has already been used here.'), true);
    else if (w.powod === 'czekaj') kodKom(T('Chwileczkę, Nonna jeszcze liczy…', 'Just a moment, Nonna is still counting…'), true);
    else if (w.powod === 'siec') kodKom(T('Nie udało się sprawdzić kodu — sprawdź internet i spróbuj znowu.', "Couldn't check the code — check your connection and try again."), true);
    else if (w.powod === 'https') kodKom(T('Kody działają tylko w grze otwartej przez https.', 'Codes only work when the game is opened over https.'), true);
    else {
      kodKom(T('Nonna nie zna tego kodu.', "Nonna doesn't know this code."), true);
      if (kodBtn) { kodBtn.disabled = true; setTimeout(() => { kodBtn.disabled = false; }, KODY_NONNY.blokadaMs); }
    }
  }
  if (kodInput && kodBtn) kodBtn.onclick = uzyjKodu;
  if (kodInput) kodInput.addEventListener('keydown', e => {
    e.stopPropagation();                       // żeby spacja/WSAD nie sterowały grą
    if (e.code === 'Enter') uzyjKodu();
  });

  // ikonki w zakładkach + przycisku pauzy
  document.querySelectorAll('.tab[data-ico]').forEach(t =>
    t.insertAdjacentHTML('afterbegin', ico(t.dataset.ico, 16) + ' '));
  document.getElementById('pauseBtn').innerHTML = ico('pauza', 16) + '<span class="glRog" data-glif="pauza"></span>';
  // podpowiedzi klawiszy/pada: tryb startowy wg urządzenia, dalej przełącza OSTATNIE wejście
  if (!WEJ.tryb) ustawWej(wejDomyslny()); else glifyOdswiez();
  // zakładki menu
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('sel'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('on'));
    t.classList.add('sel');
    document.getElementById('p-' + t.dataset.tab).classList.add('on');
    // menu A: rendery panelu, klasy `panel-open` / `panel-mapy`, gaśnięcie kropek, pad do panelu.
    // Zakładka „graj" = panel pusty = powrót na ekran główny.
    menuPanelOtwarty(t.dataset.tab, t.classList.contains('skr') || t.id === 'wZebatka' ? t : null);
  });
  // WRÓĆ (telefon): dokładnie to samo co B na padzie — klik w ukrytą zakładkę „graj"
  document.getElementById('panelBack').onclick = () =>
    document.querySelector('.tab[data-tab="graj"]').click();
  menuInit();                                      // menu A „Warzywniak": skala, strzałki, klawiatura, odsłonięcia
  // pauza
  document.getElementById('pauseBtn').onclick = () => togglePause(!G.paused);
  document.getElementById('btnResume').onclick = () => togglePause(false);
  // E2 K4: jackpot — klik gdziekolwiek pomija animację; ZABIERAM! / „Wymień broń zamiast tego"
  document.getElementById('skrzyniaOv').addEventListener('click', e => { if (!e.target.closest('#skrzZab,#skrzWymien')) pominJackpot(); });
  document.getElementById('skrzZab').onclick = e => { e.stopPropagation(); zamknijJackpot(); };
  document.getElementById('skrzWymien').onclick = e => { e.stopPropagation(); wymienZamiastJackpotu(); };
  const odswiezAnimSkrz = () => {
    const sz = skrzyniaSzybka();                     // stan faktyczny (także „auto" z prefers-reduced-motion)
    document.getElementById('skrzPelna').classList.toggle('sel', !sz);
    document.getElementById('skrzSzybkaBtn').classList.toggle('sel', sz);
  };
  document.getElementById('skrzPelna').onclick = () => { META.ui.skrzyniaSzybka = false; saveMeta(); odswiezAnimSkrz(); };
  document.getElementById('skrzSzybkaBtn').onclick = () => { META.ui.skrzyniaSzybka = true; saveMeta(); odswiezAnimSkrz(); };
  odswiezAnimSkrz();                                 // prefers-reduced-motion = szybka domyślnie, dopóki gracz nie wybierze
  // E1-bieg K9: wyjście do menu = ta sama ścieżka końca co śmierć i wygrana (rozliczenie, liczniki, GoatCounter)
  document.getElementById('btnQuit').onclick = () => koniecBiegu('menu');
  addEventListener('keydown', e => {
    // 400 ms po pauzie z `pointerlockchange`: gdyby przeglądarka jednak dostarczyła ESC,
    // nie odpauzuj tego, co właśnie zapauzowaliśmy (patrz komentarz przy pointerlockchange)
    if (e.code === 'Escape' && performance.now() - pauzaZLocka < 400) return;
    if (e.code === 'Escape' && G.running && !ovWidoczny()) togglePause(!G.paused);   // E2: także nad jackpotem
  });
  // debug (usunąć przed wydaniem); step = ręczne krokowanie pętli,
  // bo podgląd dławi rAF bez fokusa (pułapka znana z Rudeusza)
  // hak debugowy WYLACZNIE w DEV: eksponowal META (edytowalne monety), saveMeta,
  // spawnEnemy, killEnemy, setMap i step() — na mobile z rewarded ads to obejscie
  // calej monetyzacji przez konsole WebView.
  if (DEV) window.HORDA = {
    G, P, terrainH, chests, totems, openSwap, renderWpns, chunkMap, supportY, onSpill, setMap,
    wchest, META, CHARS, MAPS, ENEMY_TYPES, spawnEnemy, killEnemy, renderBestiary, saveMeta,
    setPlayerChar, togglePause, get charKey() { return charKey; }, AUDIO,
    buildChar, SPRITEDATA,                                 // C: test arkuszy HD (pasy alfy) bez przeładowania
    setTilt(v) { SPRITE_TILT = v; refreshSpriteTilt(); },   // 0 = pionowe billboardy, 1 = do kamery
    przewrocRegaly, nova,
    get tilt() { return { SPRITE_TILT, kat: +(tiltKat * 180 / Math.PI).toFixed(1) }; },
    get grass() { return grassField; },
    THREE, scene, camera, renderer, TW, wodaY,             // do inspekcji w podglądzie (TW = teren Wąwozów)
    get tr() { return { trBuf, TR_RES, TR_SPAN, TR_ST, trCx, trCz, trAktywne, trKatU }; },
    updateTrample,
    render() { renderer.render(scene, camera); },
    PAD, pollPads, get camYaw() { return camYaw; }, set camYaw(v) { camYaw = +v || 0; }, get gpSel() { return gpSel; },
    get mapKey() { return mapKey; },                       // 30.09 (modele łąk): zrzuty z kamery gry pod zadanym kątem
    padGlyph, padRodzina, padWibruj, navItems, topOverlay, renderSterowanie,
    // komiks: `pokazKomiks()` do scenariuszy testera, `initKomiks` do podmiany T()
    // (podgląd podpisów po angielsku bez przeładowania i bez ruszania META)
    pokazKomiks, initKomiks,
    // staty pochodne + pula kart: do pomiarow balansu (projektant/tester nie mieli
    // jak zmierzyc, czy karta faktycznie cokolwiek robi — stad martwy `fireMul`)
    get staty() {
      return {
        dmgAll: +dmgAll().toFixed(4), fireMul: +fireMul().toFixed(4), critC: +critC().toFixed(4),
        rangeF: +rangeF().toFixed(3), magnetF: +magnetF().toFixed(3), speedF: +speedF().toFixed(3),
        lvl: P.lvl, xpNeed: P.xpNeed, ranga: G.ranga,
        rangaMul: +(rangaDmg() * rangaFire()).toFixed(4), awansMul: +(awansDmg() * awansTempo()).toFixed(4), awBron: P.awBron || 0, wzrost: wzrost(),
        passives: { ...P.passives }, repeat: { ...P.repeat },
        skl: [...P.skl], sklU: { ...P.sklU },
      };
    },
    xpDoNast, REPEAT, cardPool, repeatPool, losujKarty, pulaPoziomow, PRZEPISY, PRZEPIS_BRONI,
    pokazKarty(o = {}) { pchnijOverlay(() => showCards(o)); return document.querySelectorAll('#cards .card').length; },
    // E2 K2: n losowań bez UI → rozkład typów/rzadkości; `stan` = funkcja przygotowująca (np. G.time = 300)
    symKart(n = 1000, stan) {
      if (stan) stan();
      const typ = {}, rz = {}, klucz = {}, podsun = { tak: 0, nie: 0 }, kandPodsun = cardPool().filter(k => k.typ === 'skl-nowy');
      let dupl = 0;
      for (let i = 0; i < n; i++) {
        const k = losujKarty(3);
        if (new Set(k.map(c => c.k.id)).size < k.length) dupl++;
        for (const c of k) { typ[c.k.typ] = (typ[c.k.typ] || 0) + 1; rz[c.rz] = (rz[c.rz] || 0) + 1; klucz[c.k.klucz] = (klucz[c.k.klucz] || 0) + 1;
          if (c.k.typ === 'skl-nowy') podsun[c.k.podsun ? 'tak' : 'nie']++; }
      }
      const suma = n * 3, nP = kandPodsun.filter(k => k.podsun).length, nN = kandPodsun.length - nP;
      return { n, dupl, typ, klucz, rz: Object.fromEntries(Object.entries(rz).map(([k, v]) => [k, +(v / suma * 100).toFixed(1)])),
               podsunNaKarte: nP ? +(podsun.tak / nP / n).toFixed(3) : null, zwyklyNowyNaKarte: nN ? +(podsun.nie / nN / n).toFixed(3) : null };
    },
    cfgD: CFG_DECYZJE, BUMERANG, PASSIVES, ustawSkladnik, dodajSkladnik, rangeObsz, stompRad, skarpetaR,   // E2
    SKR, otworzZlotaSkrzynie, pulaJackpotu, przepisyGotowe, przepisGotowy, ugotuj, rysujPauze,
    ksiazkaReset() { META.ksiazka = {}; META.ui.ksiazkaNowe = false; META.ui.ksiazkaPodp = false; saveMeta(); return META.ksiazka; },
    get decyzje() { return { przelos: P.wybory?.przelos, pomin: P.wybory?.pomin, wyklucz: P.wybory?.wyklucz, uzyte: P.wyboryUzyte,
      skl: [...P.skl], sklU: { ...P.sklU }, bonus: Object.fromEntries(P.weapons.map(w => [w.key, +(w.bonus || 0).toFixed(3)])), wykluczone: [...P.wyklucz] }; },
    // E2 K5: broń przepisu na max + jego składnik (+ danie od razu, gdy gotuj) — HORDA.przepis('meteor', false)
    przepis(ek, gotuj = true) {
      const R = PRZEPISY[ek]; if (!R) return null;
      let w = hasWeapon(R.bron);
      if (!w) { if (P.weapons.length >= 3) P.weapons.pop(); w = { key: R.bron, lvl: 1, t: 0, t0: G.time }; P.weapons.push(w); }
      w.lvl = WEAPONS[R.bron].max;
      if (!P.skl.includes(R.skl)) { if (P.skl.length >= P.slotySkl) ustawSkladnik(P.skl[P.skl.length - 1], 0); ustawSkladnik(R.skl, 1); }
      if (gotuj && PRZEPIS_BRONI[R.bron]) ugotuj(ek, w);
      renderWpns();
      return { bronie: P.weapons.map(x => x.key + ':' + x.lvl), skl: [...P.skl], evo: { ...P.evo }, gotowe: przepisyGotowe().map(x => x.key) };
    },
    jackpot(zrodlo = 'mapa', n) { pchnijOverlay(() => jackpot(zrodlo, zrodlo === 'mapa' ? [] : przepisyGotowe(), n)); return SKR; },
    // n rozstrzygnięć bez UI (stan gracza przywracany po każdym) → rozkład N i typów przedmiotów
    symJackpot(n = 1000, zrodlo = 'mapa') {
      const kopia = () => ({ w: P.weapons.map(w => ({ ...w })), pas: { ...P.passives }, u: { ...P.sklU }, skl: [...P.skl], rep: { ...P.repeat },
                             evo: { ...P.evo }, hp: P.hp, maxHp: P.maxHp, j: META.st.jackpoty, jl: (G.jackpoty || []).length });
      const przywroc = k => { P.weapons = k.w.map(w => ({ ...w })); P.passives = { ...k.pas }; P.sklU = { ...k.u }; P.skl = [...k.skl]; P.repeat = { ...k.rep };
                              P.evo = { ...k.evo }; P.hp = k.hp; P.maxHp = k.maxHp; META.st.jackpoty = k.j; if (G.jackpoty) G.jackpoty.length = k.jl; };
      const k0 = kopia(), rozk = { 1: 0, 3: 0, 5: 0 }, typ = {}, rz = {};
      for (let i = 0; i < n; i++) {
        META.st.jackpoty = 99;
        const r = rozstrzygnijJackpot(zrodlo, zrodlo === 'mapa' ? [] : przepisyGotowe());
        rozk[r.N] = (rozk[r.N] || 0) + 1;
        for (const it of r.lista) { const t = it.przepis ? 'przepis' : (it.klucz || '').split(':')[0] || 'rep'; typ[t] = (typ[t] || 0) + 1; rz[it.rz] = (rz[it.rz] || 0) + 1; }
        przywroc(k0);
      }
      renderWpns(); drawHearts();
      return { n, rozk: Object.fromEntries(Object.entries(rozk).map(([k, v]) => [k, +(v / n * 100).toFixed(1)])), typ, rz };
    },
    // podglad wariantow obrysu gracza bez przeladowania: HORDA.ustawObrys(1.07, 0x1b1b22)
    ustawObrys(skala = OBRYS_SKALA, kolor = OBRYS_KOLOR) {
      OBRYS_SKALA = skala; OBRYS_KOLOR = kolor;
      _przezMaty.clear();
      if (playerBB && playerBB.obrys) {
        playerBB.obrys.scale.setScalar(skala);
        playerBB.obrys.position.y = -(skala - 1) / 2;
      }
      return { OBRYS_SKALA, OBRYS_KOLOR };
    },
    // strojenie drzew v5 bez przeładowania: HORDA.drzewa({ ziarno: 3, liscSkala: 1.2 })
    // → nowe prefaby + przebudowa świata; bez argumentu zwraca konfigurację i prefaby
    drzewa(cfg) {
      if (cfg) {
        const stylByl = DRZEWA_CFG.styl;
        Object.assign(DRZEWA_CFG, cfg);
        if (cfg.pien) galezieMat.color.setHex(PIEN_KOLOR[cfg.pien] || PIEN_KOLOR.blady);
        generujPrefabyDrzew();
        // zmiana stylu liści = nowe tekstury (asynchronicznie) → dopiero potem przebudowa
        if (cfg.styl && cfg.styl !== stylByl) initLiscie().then(rebuildWorld); else rebuildWorld();
      }
      return { cfg: DRZEWA_CFG, prefaby: PREFABY, GATUNKI };
    },
    // strojenie smrodu na żywo: HORDA.dymSet({opac:0.5, roz:1.1}), HORDA.dymPal({...})
    dym: dymCfg,
    dymSet(o = {}) {
      Object.assign(dymCfg, o);
      if (o.blend && dymMat) {
        dymMat.blending = o.blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending;
        dymMat.needsUpdate = true;
      }
      return { ...dymCfg };
    },
    pnoise,
    dymMap(t) { if (t) { dymMat.uniforms.uMap.value = t; } return dymMat.uniforms.uMap.value; },
    dymPal(o = {}) {
      Object.assign(DYM_PAL, o);
      if (dymMat) { dymMat.uniforms.uMap.value.dispose(); dymMat.uniforms.uMap.value = dymAtlas(); }
      return { ...DYM_PAL };
    },
    // ---- E1-bieg (spec 07 §10.2): pomiar, bot, skok ----
    get log() { return G.zdarzenia; },
    get gc() { return STATY.log; }, koniecBiegu,   // K9: log wywołań GoatCounter (DEV nic nie wysyła)
    cfg: CFG_BIEG, WIECZOR, falaTeraz, liczZywych, zadajDmg, dmgNum, chestReward, startKarabin, odpalSmrod,
    // TRUDNOŚĆ v2: HORDA.trudnosc('v1'|'v2') przełącza preset CFG_TRUDNOSC; HORDA.trudnosc() = bieżący stan
    trudnosc(v) { if (v) ustawTrudnosc(v); return { preset: CFG_TRUDNOSC.akt, t: G.time, hpScale: +hpScale().toFixed(3), spdScale: +spdScale().toFixed(3), dmgMul: +dmgMul().toFixed(3), elita: +szansaElity().toFixed(3), fala: falaTeraz(G.time) }; },
    CFG_TRUDNOSC,
    pomiar() { return G.probki; },
    ruch(vx, vz) { _ruchDev = vx == null ? null : { x: vx, z: vz }; return _ruchDev; },
    bot: BOT, botBieg, skok: devSkok, BOT_PRESETY,
    dpsBroni, tabelaDps,                                   // E2 K0: pomiar DPS broni na manekinach
    KAWA, kawaDecyzja, pokazKawe, zamknijKawe,             // B12: prośba o kawę
    // ---- E3 (spec 09 §7.3) ----
    cfgM: CFG_MAPA,
    // zrodzeni per typ od startu biegu (albo od `reset`) i realne udziały po limitach; `losowane` = wynik losujTyp PRZED limitami
    mapaStat(o = {}) {
      if (o.reset) { G.zrodzeni = {}; G.losowane = {}; }
      const pro = src => { const s = Object.values(src || {}).reduce((a, b) => a + b, 0) || 1;
        return Object.fromEntries(Object.entries(src || {}).map(([k, v]) => [k, +(v / s * 100).toFixed(1)])); };
      return { mapa: mapKey, t: +G.time.toFixed(0), zrodzeni: { ...G.zrodzeni }, udzialy: pro(G.zrodzeni), losowane: pro(G.losowane) };
    },
    get wydLog() { return G.e3; },
    // 30.09 MAPA OSIEDLE: moduły, stan (chunki, kolejka, pole hordy, czasy budowy), układ chunka do podglądu
    TO, OSR, OS,
    // 30.09 MARKET — PRZEBUDOWA: moduły, materiały; market() = chunki, strefy, draw calle i wierzchołki
    MM, UM, get MK() { return MK; }, MK_OPCJE, mkPoprawPunkt,
    market() {
      const strefy = {}; let n = 0, v = 0, wid = 0, reg = 0, lez = 0, szklo = 0;
      for (const ch of chunkMap.values()) {
        const m = ch.mesh.userData.mk; if (!m) continue;
        n++; v += m.v; strefy[m.strefa] = (strefy[m.strefa] || 0) + 1; if (ch.mesh.visible) wid++;
        for (const s of ch.shelves) { reg++; if (s.stan !== 'stoi') lez++; }
        for (const r of ch.rocks) if (r.material === MK.matSzkla) szklo++;
      }
      return { mapa: mapKey, chunki: n, widoczne: wid, strefy, wierzcholki: v, regaly: reg, przewrocone: lez, szkla: szklo, prefaby: MM.statystyki(),
               dc: renderer.info.render.calls, tri: renderer.info.render.triangles };
    },
    // 30.09 SKRZYNIE I KAPLICZKI 3D: moduł, zestawy instancji, otwierane kufry; skrzynie3D() = draw calle i trójkąty (z cieniem x2)
    MS, get SK() { return SK; }, SK_OTW, otworzKufer3D, postawSkrzynieKaprala, syncSkrzynie3D, updateSkrzynie3D,
    // 30.09 ŁĄKI — MODELE 3D: moduł, materiał; laki3D() = siatki struktur w świecie, trójkąty, czasy budowy chunka
    // (bez rozgrzewki prefabów; `{ reset: true }` = liczniki od zera), czas rozgrzewki
    ML, lakiMat,
    laki3D(o = {}) {
      if (o.reset) Object.assign(LAKI, { chunki: 0, tris: 0, ms: 0, msMax: 0 });   // pomiar budowy od teraz (bez rozgrzewki w starcie)
      let n = 0, tri = 0;
      for (const ch of chunkMap.values()) for (const m of ch.rocks) if (m.userData.laki3D) { n++; tri += m.geometry.attributes.position.count / 3; }
      return { siatki: n, tris: tri, trisSzt: ML.liczTrojkaty(), zbudowane: LAKI.chunki, msSr: +(LAKI.ms / Math.max(1, LAKI.chunki)).toFixed(3),
               msMax: +LAKI.msMax.toFixed(2), rozgrzewka: LAKI.rozgrzewka };
    },
    skrzynie3D() {
      if (!SK) return null;
      const z = {}; let dc = 0, tri = 0, dcCien = 0;
      for (const [k, Zs] of Object.entries(SK.z)) {
        const t = MS.liczTrojkaty(Zs.model);
        z[k] = { n: Zs.n, dc: Zs.drawCalle, trisSzt: t.razem, tris: t.razem * Zs.n };
        dc += Zs.drawCalle; tri += t.razem * Zs.n;
        if (Zs.n) for (const cz of Zs.model.czesci) if (cz.cien !== false) dcCien++;
      }
      return { zestawy: z, dc, dcCien: MAPS[mapKey].indoor ? 0 : dcCien, dcEfekty: SK.ef.drawCalle, tris: tri, czastki: SK.ef.cz.length, otwierane: SK_OTW.length };
    },
    osiedle() {
      let n = 0, v = 0, wid = 0, cut = 0;
      for (const ch of chunkMap.values()) if (ch.osiedle) { n++; v += ch.osiedle.v; if (ch.mesh.visible) wid++; if (ch.mesh.material === OS.matCut) cut++; }
      return { mapa: mapKey, chunki: n, widoczne: wid, zPrzycinaniem: cut, wierzcholki: v, kolejka: OS.kolejka.length, prefaby: OS.prefaby.size,
               msChunk: +OS.msChunk.toFixed(2), msMax: +OS.msMax.toFixed(2), zbudowane: OS.budowane,
               pole: { gotowe: OS.nav.gotowa, ms: +OS.nav.ms.toFixed(2), zasieg: OS.nav.zasieg, kodGracza: OS.nav.kodW(P.pos.x, P.pos.z) } };
    },
    sylwetki() { return G.enemies.filter(e => e.sylw).map(e => ({ typ: e.don ? 'don' : e.kapral ? 'kapral' + e.kapral : e.type + (e.elite ? ':elita' : ''),
      d: +e.pos.distanceTo(P.pos).toFixed(1), strona: e.bb.mesh.material && e.bb.mesh.material.userData.hk ? e.bb.mesh.material.userData.hk.g.nazwa : '?' })); },
    SYLW_GRUPY,
    // K7/K8: przywołaj kaprala nr 1–6 TERAZ (bez 1 s telegrafu) / Dona teraz (bez ciszy)
    kapral(nr) { bezZapisu = true; return spawnKapral(nr, true); },
    don() { bezZapisu = true; return wejscieDona(true); },
    get telegrafy() { return G.telegrafy; },
    telegraf, drawHearts,
    // bot steruje w czasie rzeczywistym (pętla rAF): HORDA.botNaZywo('sredni') / HORDA.botNaZywo(null)
    botNaZywo(tryb = 'sredni') { if (tryb) bezZapisu = true; Object.assign(BOT, { on: !!tryb, naZywo: !!tryb, tryb: tryb || BOT.tryb, karty: 'priorytet' }); return BOT; },
    // seria biegów: HORDA.botSeria([{tryb:'sredni',postac:'carrotello'}], 5) → tablica wyników
    async botSeria(konf, n = 5, o = {}) {
      const wyn = [];
      for (const k of konf) for (let i = 0; i < n; i++) wyn.push(await botBieg({ ...o, ...k, seed: (o.seed || 1) + i }));
      window.__botWyniki = wyn;
      return wyn;
    },
    step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) { pollPads(dt); if (G.running && !G.paused) { if (STRES) stresTick(); update(dt); } }
      renderer.render(scene, camera);
    },
    // ---- E0: wydajność ----
    // HORDA.stres(300) = scena stresu (startuje bieg, jeśli trwa menu); HORDA.stres(0) = wyłącz
    stres: startStres,
    dcRaport, PULE, HORDA_GRUPY, syncInstancje,
    get STRES() { return STRES; },
    LIB, ATLAS_STATS,
    // bajty tekstur postaci: `atlasMB` = wszystkie strony atlasu (gdyby wgrać komplet),
    // `wgraneMB` = strony faktycznie wysłane do GPU w tej sesji, `stareMB` = ile zajęłyby
    // stare tekstury per klatka (klatki × rozmiar² × 4) — do porównania przed/po
    vram() {
      let wgrane = 0, n = 0;
      for (const L of Object.values(LIB)) for (const A of Object.values(L.anims)) {
        for (const mats of Object.values(A.dirs)) for (const m of mats) {
          const src = m.map.source;
          if (src._liczone === vramLicz) continue;
          src._liczone = vramLicz;
          if (renderer.properties.get(src).__version !== undefined) { wgrane += src.data.width * src.data.height * 4; n++; }
        }
      }
      vramLicz++;
      const MB = b => +(b / 1048576).toFixed(2);
      return { klatki: ATLAS_STATS.klatki, strony: ATLAS_STATS.strony.length, atlasMB: MB(ATLAS_STATS.bajty),
               wgraneMB: MB(wgrane), wgraneStrony: n, stareMB: MB(ATLAS_STATS.stareBajty) };
    },
  };
  if (DEV) Object.assign(window.HORDA, { menuAudyt, menuPodstaw, renderMenu, mapaOdbl, MENU, MAPA_GRAF });   // menu A (E4 K11)
  if (DEV) Object.assign(window.HORDA, { KODY_NONNY, CFG_SPIZ, SPIZ_KOLEJNOSC, sklOdbl, sklMaxBiegu, cenaSpiz, KUP_MONETY, kodyTest: [] });   // Spiżarnia + Kod od Nonny (29.09)
})();
