// HORDA 3D v4 — teren 3D + kamera za plecami + meta-progresja (monety/sklep)
import * as THREE from './lib/three.module.js';
import { SPRITEDATA } from './spritedata.js?v=11';
import { icon, ico } from './icons.js?v=5';
import { AUDIO } from './audio.js?v=5';            // muzyka wg fazy gry + kwestie głosowe + efekty
import { initKomiks, pokazKomiks } from './komiks.js?v=1';   // komiks wprowadzający (Etap 2)
import { generujSzkielet, siatkaGalezi, RNG } from './lib/drzewa-szkielet.js?v=2';
import { wczytajModeleNatury } from './lib/modele-natura.js?v=2';
import * as TW from './lib/teren-wawozy.js?v=2';   // mapa „Wąwozy": wysokość, rzeki, pułapki   // krzaki/kwiaty/głazy Quaternius (CC0)   // drzewa v5: szkielet gałęzi (pochodna ez-tree, MIT)

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
  wawozy: { nm: T('Wąwozy', 'Ravines'), ico: 'laka',
            ds: T('Kaniony z rzekami na dnie, urwiska, nurt i osuwiska',
                  'Canyons with rivers below, cliffs, currents and landslides'),
            sky: 0x9cc8ec, fog: [80, 190], water: true, indoor: false, rzeki: true, price: 0 },
  market: { nm: T('Market', 'Supermarket'), ico: 'market',
            ds: T('Ciasne alejki, regały, śliska rozlana woda', 'Tight aisles, shelves, slippery spills'),
            sky: 0xb8bfc7, fog: [34, 95], water: false, indoor: true, price: 0 },
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
                char: 'carrotello_squattello', price: 0, spd: 1.15, hp: 0, dmg: 1.0, mag: 1.3, scale: 1.22 },
  // Beetino idzie za ZABÓJSTWA, nie za monety (250 monet uzbierało się już
  // w drugim biegu, więc jako zakup nie był żadnym celem).
  // PRÓG 450 = TRZECI BIEG. Zmierzona ścieżka nowego gracza: bieg 1 ≈ 60 zabójstw,
  // bieg 2 ≈ 150, bieg 3 ≈ 250 → łącznie ~460. Nagroda ma przyjść, GDY GRACZ
  // JESZCZE NIE WIE, czy zostaje — nie po ośmiu biegach.
  beetino:    { nm: 'Beetino Bouncerino',
                ds: T('Buraczino Betonino — czołg z bramki. Poniżej połowy serc bije mocniej i wysysa życie.',
                      'The beetroot bouncer — a tank on the door. Below half hearts he hits harder and drains life.'),
                char: 'beetino_bouncerino', price: 0, killGoal: 450, startWpn: 'wypad',
                spd: 0.85, hp: 3, dmg: 1.1, mag: 0.9, scale: 1.32 },
  // Statystyki wprost z biblii postaci (HP 110 · Speed 0.9 · Might 1.0 · Pickup 1.1).
  // Postac DO KUPIENIA: przy nowej ekonomii 700 monet wypada na ~6. biegu, czyli
  // dokladnie tam, gdzie mial byc drugi przystanek progresji.
  // Radishetta Razoretta — szybka i krucha: seria scyzorykow przed siebie.
  // Cena 500: ma wpasc miedzy Beetina (450 zabojstw) a Granny (700 monet).
  razoretta:  { nm: 'Radishetta Razoretta',
                ds: T('Rzodkiewka z piornikiem — seria scyzorykow, ale cienka skora.',
                      'Radish with a pencil case — a volley of knives, but paper-thin skin.'),
                char: 'radishetta_razoretta', price: 500, startWpn: 'scyzoryk',
                spd: 1.2, hp: -1, dmg: 1.25, mag: 1.0, scale: 1.2 },
  granny:     { nm: 'Granny Smithella',
                ds: T('Babuszkina Jabłuszkina — kapeć wraca jak bumerang.',
                      'Nonna apple herself — the slipper comes back like a boomerang.'),
                char: 'granny_smithella', price: 700, startWpn: 'ciabatta',
                spd: 0.9, hp: 1, dmg: 1.0, mag: 1.1, scale: 1.28 },
  // PIERWSZA POSTAC Z AKTYWNA UMIEJETNOSCIA (dotad rozniły sie tylko statystykami
  // i bronia startowa). Startuje ze Skarpeta, bo cala jego tozsamosc to smrod:
  // bron truje pasywnie, a `KeyG` odpycha horde. Cena 900 = kolejny przystanek
  // po Granny (700), czyli powod, zeby grac dalej po wykupieniu poprzedniej.
  garlicino:  { nm: 'Garlicino Stinkerino',
                ds: T('Czosnkino Smrodino — na zadanie odpycha horde smrodliwa aura (G).',
                      'The garlic stinker — on demand, a reeking aura shoves the horde (G).'),
                char: 'garlicino_stinkerino', price: 900, startWpn: 'skarpeta',
                spd: 1.0, hp: 1, dmg: 1.0, mag: 1.05, scale: 1.22 },
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
  if (MAPS[mapKey].indoor) return 1.55;              // market: idealnie płaska podłoga
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
  zdarzenie(sciezka, tytul = '') {
    if (!STATY.kod || DEV) return;
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

// ============================== „POSTAW MI KAWĘ" ==============================
// Życzenie właściciela (18.09). Link WPISUJE WŁAŚCICIEL (buycoffee.to / Ko-fi / suppi);
// pusty = przycisk schowany. Klik liczy się jako zdarzenie w statystykach.
const KAWA_URL = 'https://buycoffee.to/piotr.korona';   // ten sam link co w K-OS (SPEC-K-OS.md)
{
  const k = document.getElementById('kawaBtn');
  if (k) {
    if (KAWA_URL) { k.href = KAWA_URL; k.style.display = ''; k.onclick = () => STATY.zdarzenie('kawa', 'Klik: postaw kawę'); }
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
  market: { dol: 0xb8bfc7, srodek: 0xacb4bd, gora: 0x939ba5, slonce: 0xd8d8d0, pasy: 0 },
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
// Sześć osobnych bryłek na regał (a regałów jest ~850) dawało 5100 mesh'y
// i 610 draw calli tylko na market — pomiar audytu: 4.73 ms renderu przy PUSTEJ
// arenie i wzrost do 6.44 ms po ZMNIEJSZENIU okna, czyli koszt siedzi w liczbie
// obiektów, nie w pikselach. Scalamy więc bryłki w jedną geometrię i wystawiamy
// je jako INSTANCJE per chunk: 3 draw calle na chunk zamiast 3 na regał.
// Geometrię budujemy dla kier = +1; kier = -1 to ta sama bryła obrócona o 180°.
function scalBryly(bryly) {
  const poz = [], nor = [], uv = [], idx = [];
  for (const b of bryly) {
    const g = new THREE.BoxGeometry(b.sx, b.sy, b.sz);
    g.translate(0, b.ly, b.lz);
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, ind = g.index;
    const off = poz.length / 3;
    for (let i = 0; i < p.count; i++) {
      poz.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
    }
    for (let i = 0; i < ind.count; i++) idx.push(ind.getX(i) + off);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(poz, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
let regalGeo = null;          // { korpus, polkiDol, polkiGora }
function initRegalGeo() {
  const len = 7, O = -0.8;                        // O = przesunięcie względem pivotu (krawędź podstawy)
  regalGeo = {
    korpus: scalBryly([{ sx: len, sy: SHELF_H, sz: 1.6, ly: SHELF_H / 2, lz: O }]),
    // dolne półki + blat: to, co zostaje widoczne po przewróceniu
    polkiDol: scalBryly([
      { sx: len, sy: 0.14, sz: 0.6, ly: 0.8, lz: 1.05 + O },
      { sx: len, sy: 0.14, sz: 0.6, ly: 1.6, lz: 1.05 + O },
      { sx: len + 0.3, sy: 0.16, sz: 2.1, ly: SHELF_H + 0.08, lz: O },
    ]),
    // te dwie po obrocie STAJĄ PIONOWO i wystają na 2.15 j., więc na czas
    // leżenia chowamy je (zerowa skala instancji)
    polkiGora: scalBryly([
      { sx: len, sy: 0.14, sz: 0.6, ly: 0.8, lz: -1.05 + O },
      { sx: len, sy: 0.14, sz: 0.6, ly: 1.6, lz: -1.05 + O },
    ]),
  };
}
const _rm = new THREE.Matrix4(), _rq = new THREE.Quaternion(), _rp = new THREE.Vector3(), _rs = new THREE.Vector3(1, 1, 1);
const _rzero = new THREE.Vector3(0, 0, 0);
// zapisuje macierz instancji regału (obrót przewracania + yaw dla kierunku)
function ustawRegal(s, kat) {
  _rp.set(s.x, s.g0, s.pivotZ);
  _rq.setFromEuler(new THREE.Euler(kat, s.kier === 1 ? 0 : Math.PI, 0));
  _rm.compose(_rp, _rq, _rs);
  s.inst.korpus.setMatrixAt(s.i, _rm);
  s.inst.polkiDol.setMatrixAt(s.i, _rm);
  if (s.stan === 'lezy') { _rm.compose(_rp, _rq, _rzero); }      // schowane górne półki
  s.inst.polkiGora.setMatrixAt(s.i, _rm);
  s.inst.korpus.instanceMatrix.needsUpdate = true;
  s.inst.polkiDol.instanceMatrix.needsUpdate = true;
  s.inst.polkiGora.instanceMatrix.needsUpdate = true;
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
  // 1. alfa całego arkusza raz (bufor tymczasowy, oddany po zbudowaniu)
  const sc = document.createElement('canvas'); sc.width = img.width; sc.height = img.height;
  const sg = sc.getContext('2d', { willReadFrequently: true });
  sg.drawImage(img, 0, 0);
  const alfa = sg.getImageData(0, 0, img.width, img.height).data, IW = img.width;
  sc.width = sc.height = 0;                       // oddaj bufor od razu (iOS: limit pamięci canvasów)
  // 2. prostokąt niepustych pikseli każdej używanej klatki
  const klatki = [];
  for (const an of anims) {
    const a = def.anims[an]; if (!a) continue;
    for (const dir of Object.keys(a.rows)) {
      const row = a.rows[dir], n = a.frames[dir];
      for (let f = 0; f < n; f++) {
        const sx = f * S, sy = row * S;
        let x0 = S, y0 = S, x1 = -1, y1 = -1;
        for (let y = 0; y < S; y++) {
          const o = ((sy + y) * IW + sx) * 4 + 3;
          for (let x = 0; x < S; x++) if (alfa[o + x * 4] > 0) {
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
        if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }        // pusta klatka → 1 przezroczysty piksel
        x1++; y1++;
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
  const r = SKARPETA_R(w.lvl) * rangeM(), u = dymMat.uniforms;   // dym = realny zasięg trucia (z Sokolim wzrokiem)
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
    st: { kills: 0, runs: 0, time: 0, best: 0, bestKills: 0, bosses: 0, coins: 0, chests: 0, skrzynki: 0, lvl: 0 },
    bestiary: {},                                  // typ wroga -> ile razy zabity (bestiariusz)
    audio: { muz: 0.15, glos: 0.9, efe: 0.7, mute: 0 },   // głośności i wyciszenie (zakładka Dźwięk)
    // KONTROLER (zakładka Sterowanie). `map` trzyma INDEKSY przycisków w układzie
    // `standard` Gamepad API — nie litery, bo te same indeksy noszą u Nintendo inne
    // napisy (patrz PAD_GLIFY) i zapis przeniósłby się między padami błędnie.
    pad: { map: { ...PAD_MAP_DOM }, czulosc: 1, invY: 0, wibracje: 1, uklad: 'auto' },   // uklad: auto|xbox|ps|switch
    // JEDNORAZOWE PODPOWIEDZI UI. `pwaHint` = czy pokazaliśmy już iPhone'owi, że
    // pełny ekran robi się przez „Dodaj do ekranu początkowego" (Safari nie ma
    // Fullscreen API dla stron). Raz pokazane = nigdy więcej.
    // `komiks` = czy gracz widział już komiks wprowadzający (leci raz, po ekranie
    // ładowania; potem tylko z przycisku FABUŁA w menu). Stare zapisy go nie mają,
    // więc `Object.assign(d.ui, m.ui)` niżej zostawia false i komiks poleci raz.
    ui: { pwaHint: false, komiks: false },
    lang: '',                                    // '' = automatycznie z przeglądarki; 'pl' | 'en' po wyborze gracza
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
      st: Object.assign(d.st, m.st),
      // stare zapisy nie mają bestiariusza — domyślnie pusty, nic nie psujemy
      bestiary: Object.assign(d.bestiary, m.bestiary),
      // stare zapisy nie mają ustawień dźwięku — biorą domyślne
      audio: Object.assign(d.audio, m.audio),
      // pad: dopełniamy PO KLUCZU, bo dojście nowej akcji (np. smrodu) nie może
      // skasować mapowania, które gracz już sobie przestawił
      pad: Object.assign(d.pad, m.pad, { map: Object.assign(d.pad.map, m.pad && m.pad.map) }),
      ui: Object.assign(d.ui, m.ui),     // stare zapisy: podpowiedzi jeszcze niepokazane
      // język MUSI wrócić z zapisu: bez tego pierwszy `saveMeta()` po przeładowaniu
      // zapisywał META bez `lang` i wybór PL/EN znikał (zgłoszenie agenta komiksu)
      lang: m.lang || '',
    };
  } catch { return def(); }
}
const META = loadMeta();

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
    ds: T('Wrogowie twardsi i liczniejsi, ale monety sypią się gęściej',
          'Tougher, denser enemies — but the coins pour harder'), base: 120, max: 5 },
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
  { key: 'tarcza',   ico: 'tarcza', nm: T('Tarcza', 'Shield'),
    ds: T('Blokuje 1 trafienie co jakiś czas', 'Blocks 1 hit every so often'), price: 120 },
  { key: 'djump',    ico: 'skok', nm: T('Podwójny skok', 'Double Jump'),
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
// Cena rośnie nie tylko z poziomem POZYCJI, ale i z liczbą WSZYSTKICH zakupów
// (+10% każdy). U Vampire Survivors 91% pełnego kosztu maksowania meta-sklepu to
// sam narzut skalowania — to on robi całą długość gry, nie liczba pozycji.
const zakupyRazem = () => Object.values(META.up).reduce((a, b) => a + b, 0);
const shopPrice = it => Math.round(it.base * Math.pow(2, META.up[it.key]) * (1 + 0.10 * zakupyRazem()));

// ---- MENU: mapy / postacie / statystyki ----
function renderMaps() {
  const wrap = document.getElementById('mapGrid'); wrap.innerHTML = '';
  for (const key of Object.keys(MAPS)) {
    const M = MAPS[key];
    const d = document.createElement('div');
    d.className = 'tile' + (key === mapKey ? ' sel' : '');
    d.innerHTML = `<div class="ico">${ico(M.ico, 46)}</div><div class="nm">${M.nm}</div><div class="ds">${M.ds}</div>`;
    d.onclick = () => { setMap(key); META.lastMap = key; saveMeta(); renderMaps(); renderPick(); };
    wrap.appendChild(d);
  }
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
      <div class="ds">${C.ds}</div>${owned ? '' : cel}`;
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
  document.getElementById('selMapNm').innerHTML = ico(MAPS[mapKey].ico, 16) + ' ' + MAPS[mapKey].nm;
  document.getElementById('selCharNm').innerHTML =
    `<img class="pxi" src="${portret(CHARS[charKey].char)}" style="height:22px"> ` + CHARS[charKey].nm;

  // ---- SCENKA W MENU (portret na ladzie + kredowa tabliczka) ----
  const C = CHARS[charKey], M = MAPS[mapKey];
  const por = document.getElementById('heroPortret');
  if (por) {
    // `render` gdy jest w mapie, inaczej klatka ze sprite'a — w scence bierzemy ją
    // od razu w 256 px (nie 96), bo stoi na ekranie kilka razy większa niż w kaflu.
    // Klasa `mini` mówi CSS-owi, że to sprite: ma być skalowany nearestem i niżej.
    const r = RENDER_PORTRET[charKey];
    const srcPor = r || portret(C.char, 256);
    if (srcPor) por.src = srcPor; else por.removeAttribute('src');   // `src=''` = żądanie URL-a strony i ikona zepsutego obrazka
    por.classList.toggle('mini', !r);
    por.alt = C.nm;
  }
  const nm = document.getElementById('heroNm'); if (nm) nm.textContent = C.nm;
  const ds = document.getElementById('heroDs'); if (ds) ds.textContent = C.ds;
  // STATYSTYKI: cztery krótkie wiersze. `spd/dmg/mag` to mnożniki (×), `hp` to
  // DODATKOWE serca względem bazy (może być ujemne — Razoretta ma -1).
  const st = document.getElementById('heroStat');
  if (st) {
    const mn = v => '×' + (+v).toFixed(2).replace(/\.?0+$/, '');   // 1.00 → „×1", 1.15 → „×1.15"
    const serca = C.hp > 0 ? '+' + C.hp : (C.hp < 0 ? String(C.hp) : '—');
    st.innerHTML = [
      ['but', T('SZYBKOŚĆ', 'SPEED'), mn(C.spd)],
      ['serce', T('SERCA', 'HEARTS'), serca],
      ['kula', T('OBRAŻENIA', 'DAMAGE'), mn(C.dmg)],
      ['magnes', T('MAGNES', 'MAGNET'), mn(C.mag)],
    ].map(([i, k, v]) => `<div class="hs">${ico(i, 15)}<span>${k}</span><b>${v}</b></div>`).join('');
  }
  const mp = document.getElementById('heroMapa');
  if (mp) mp.innerHTML = `${ico(M.ico, 18)} <span>${T('Mapa', 'Map')}:</span> <b>${M.nm}</b>`;
}
function renderStats() {
  const s = META.st;
  const dane = [
    ['czaszka', s.kills, T('Zabitych łącznie', 'Total kills')],
    ['play', s.runs, T('Rozegranych biegów', 'Runs played')],
    ['zegar', fmtTime(s.best), T('Najdłuższy bieg', 'Longest run')],
    ['puchar', s.bestKills, T('Rekord zabitych', 'Most kills in a run')],
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
      ? `HP ${W.hp} · ${eTempo} ${W.speed} · ${eCios} ${W.dmg} · XP ${W.xp}`
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
      <div class="ds">${it.ds}</div><div class="pr">${owned ? T('MASZ', 'OWNED') : ico('moneta', 15) + ' ' + it.price}</div>`;
    if (!owned) d.onclick = () => {
      if (META.coins < it.price) return deny(d);
      META.coins -= it.price; META.unlocked[it.key] = 1; saveMeta(); renderShop();
    };
    wrap.appendChild(d);
  }
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
  spawnT: 0, shake: 0, bossAt: 120, ringAt: 60, tier: 0,
  tlok: 0,                                         // 0-1: jak gesto jest wokol gracza (kamera odjezdza)
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

function resetStats() {
  const C = CHARS[charKey];
  const maxHp = Math.max(2, 5 + META.up.serce + C.hp);
  Object.assign(P, {
    pos: new THREE.Vector3(0, 0, 0),
    hp: maxHp, maxHp,
    iframes: 0, y: 1.55, vy: 0, airborne: false, usedDouble: false, runDjump: false, shieldCd: 0,
    // karabin: `karabinRun` = już wypadł w tym biegu, `karabinMa` = leży w kieszeni gotowy
    gliding: false, runGlide: false, karabinRun: false, karabinMa: false,
    sokoPierwszy: false,                             // komunikat o klawiszu F raz na bieg
    smrodT: 0, smrodCd: 0, smrodTik: 0,              // aktywna aura Garlicina (klawisz G)
    vx: 0, vz: 0,
    kbx: 0, kbz: 0,                                  // odrzut gracza (tarcza Lolliniego), gaśnie sam
    coyoteT: 0, jumpBufT: 0,                         // coyote time i bufor skoku (patrz tryJump)
    weapons: [{ key: CHARS[charKey].startWpn || 'kule', lvl: 1, t: 0 }],   // max 3 sloty (broń z biblii)
    passives: {},                                // key -> poziom
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
const rangaDmg = () => 1 + 0.05 * G.ranga;        // +5% obrazen za range
const rangaFire = () => 1 + 0.04 * Math.floor(G.ranga / 4);   // co 4. ranga tez +4% tempa
function sprawdzRange() {
  while (G.ranga < RANGA_CAP && G.rangaKille >= rangaProg(G.ranga)) {
    G.rangaKille -= rangaProg(G.ranga);
    G.ranga++;
    AUDIO.sfx('awans');
    dmgPop(P.pos.x, P.y + 2.0, P.pos.z, T('RANGA ', 'RANK ') + G.ranga, '#ffd75e', 1.8);
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
const xpDoNast = l => Math.round(5 + 3.2 * l + 0.30 * l * l);

// BURACZANE CIŚNIENIE (pasyw Beetina z biblii, wdrożony 18.09 na zgłoszenie właściciela
// „burak prawie nieużywalny"): poniżej połowy serc +20% obrażeń i wysysanie życia
// (10% zadanych obrażeń → serca, patrz zadajDmg). Tank ma być groźniejszy, gdy krwawi.
const cisnienie = () => charKey === 'beetino' && P.hp > 0 && P.hp <= P.maxHp * 0.5;
const BEET_LECZ_CD = 3.0;                         // s między sercami z wysysania (nerf 23.09)
const dmgAll  = () => CHARS[charKey].dmg * (1 + 0.10 * META.up.dmg) * Math.pow(1.15, P.passives.moc || 0) * (1 + 0.03 * (P.repeat.sol || 0)) * (G.buff.key === 'dmg' ? 2 : 1) * rangaDmg() * (cisnienie() ? 1.20 : 1);   // 1.25 → 1.20 (nerf 18.09)
const fireMul = () => Math.pow(1.12, P.passives.tempo || 0) * (1 + 0.03 * (P.repeat.oliwa || 0)) * rangaFire();
// clamp 0.75: pasyw daje najwyżej 0.50, ale „Pieprz Nonny” jest bez limitu i bez
// tego setny poziom oznaczałby krytyk na 100% (crit ×3 przestaje być zdarzeniem).
const critC   = () => Math.min(0.75, 0.10 * (P.passives.krytyk || 0) + 0.02 * (P.repeat.pieprz || 0));
const rangeF  = () => 14 * Math.pow(1.2, P.passives.zasieg || 0) * (1 + 0.04 * (P.repeat.bazylia || 0));
// `rangeF()` jest ABSOLUTNY (14 j. bez pasywu) — do promieni innych niż zasięg Kul
// używaj TEGO mnożnika (1.0 bez pasywu). Do 03.09 „Sokoli wzrok" czytały 4 bronie z 14.
const rangeM  = () => rangeF() / 14;
const magnetF = () => CHARS[charKey].mag * 2.6 * (1 + 0.20 * META.up.magnes) * Math.pow(1.35, P.passives.magnes || 0);
const speedF  = () => CHARS[charKey].spd * 6.2 * (1 + 0.08 * META.up.szyb) * Math.pow(1.10, P.passives.buty || 0);
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
  if (e.code === 'Space') { e.preventDefault(); if (!jumpHeld) tryJump(); jumpHeld = true; }
  if (e.code === KARABIN_KLAWISZ && G.running && !G.paused) startKarabin();
  if (e.code === STAW_KLAWISZ) postawWiezyczke();          // Sokowirówka na żądanie
  if (e.code === SMROD_KLAWISZ) odpalSmrod();               // smrodliwa aura Garlicina
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
  uklad: T('Układ przycisków', 'Button layout'), ukl_auto: 'AUTO', ukl_xbox: 'XBOX', ukl_ps: 'PLAYSTATION', ukl_switch: 'SWITCH',
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
// symbole PlayStation jako KSZTAŁTY CSS — czcionka UI (Jersey 10) nie ma tych glifów,
// a systemowy fallback wstawiłby gładki znak obok pixelowego interfejsu
const PS_KSZ = { x: '<i class="psX"></i>', k: '<i class="psK"></i>', s: '<i class="psS"></i>', t: '<i class="psT"></i>' };
// [klasa koloru, treść]. UWAGA NA SWITCHA: fizyczne A/B i X/Y są tam ZAMIENIONE
// względem układu `standard`, więc przycisk o indeksie 0 podpisujemy „B", nie „A"
// (inaczej podpowiedź kazałaby graczowi cisnąć nie ten guzik, co trzeba).
const PAD_GLIFY = {
  xbox: { 0: ['a', 'A'], 1: ['b', 'B'], 2: ['x', 'X'], 3: ['y', 'Y'],
          4: ['sh', 'LB'], 5: ['sh', 'RB'], 6: ['sh', 'LT'], 7: ['sh', 'RT'], 8: ['sh', 'BACK'], 9: ['sh', 'START'] },
  ps:   { 0: ['a', PS_KSZ.x], 1: ['b', PS_KSZ.k], 2: ['x', PS_KSZ.s], 3: ['y', PS_KSZ.t],
          4: ['sh', 'L1'], 5: ['sh', 'R1'], 6: ['sh', 'L2'], 7: ['sh', 'R2'], 8: ['sh', 'CRE'], 9: ['sh', 'OPT'] },
  switch: { 0: ['', 'B'], 1: ['', 'A'], 2: ['', 'Y'], 3: ['', 'X'],
          4: ['sh', 'L'], 5: ['sh', 'R'], 6: ['sh', 'ZL'], 7: ['sh', 'ZR'], 8: ['sh', '-'], 9: ['sh', '+'] },
};
// D-pad (12-15) wygląda tak samo na każdym padzie — strzałki rysowane kształtem CSS,
// wspólne dla wszystkich rodzin, więc siedzą poza `PAD_GLIFY`
const PAD_DPAD = { 12: 'dpG', 13: 'dpD', 14: 'dpL', 15: 'dpP' };
function padKapsel(i) {
  if (PAD_DPAD[i]) return `<b class="gpk sh"><i class="${PAD_DPAD[i]}"></i></b>`;
  // UKŁAD: ręczny wybór z zakładki Sterowanie wygrywa; „auto" = rodzina wykrytego pada,
  // a pad nieznany lub jeszcze nie podłączony dostaje nazwy Xboxa (A/B/X/Y/LB/RB) —
  // gołe cyfry nic graczowi nie mówią (test Piotra na RP6, 18.09)
  const reczny = META.pad.uklad && META.pad.uklad !== 'auto' ? META.pad.uklad : null;
  const rodz = reczny || (PAD.rodzina === 'ps' || PAD.rodzina === 'switch' ? PAD.rodzina : 'xbox');
  const tab = PAD_GLIFY[rodz];
  const g = tab && tab[i];
  if (!g) return `<b class="gpk">${i}</b>`;        // przycisk poza znanym zakresem = goły numer
  return `<b class="gpk ${g[0]}">${g[1]}</b>`;
}
// glyph akcji z `META.pad.map` — do HUD-u, stopki i zakładki Sterowanie
function padGlyph(akcja) {
  const i = META.pad.map[akcja];
  return i == null ? '' : padKapsel(i);
}

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
  padToast(PAD_TXT.polaczony + String(e.gamepad && e.gamepad.id || 'pad').slice(0, 22));
});
addEventListener('gamepaddisconnected', () => {
  PAD.on = false; PAD.akt = 0; PAD.mx = PAD.mz = 0; PAD.jump = false; PAD.prev = []; PAD.uczy = null;
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
const navItems = ov => [...ov.querySelectorAll('.tab,.tile,.card,.bigbtn,.btn2,input[type=range],select')]
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
  const tabs = [...document.querySelectorAll('#tabs .tab')].filter(t => t.offsetWidth);
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
  if (!PAD.on || !ov) {
    el.classList.remove('on'); document.body.classList.remove('pad-foot');
    PAD.sygFoot = ''; return;
  }
  const syg = PAD.rodzina + '|' + ov.id + '|' + (PAD.uczy ? 'u' : '') + (jestSuwak(gpSel) ? 's' : '');
  if (syg !== PAD.sygFoot) {
    PAD.sygFoot = syg;
    // karty i wymiennik NIE MAJĄ wyjścia wstecz (trzeba wybrać ulepszenie), więc
    // nie obiecujemy tam „B wstecz" — obietnica bez pokrycia gorsza niż jej brak
    const bezWstecz = ov.id === 'cardsOv' || ov.id === 'swapOv';
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
    renderSterowanie();
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
    if (hit(0) && gpSel && !suw) { gpSel.click(); AUDIO.sfx('klik'); }   // pad nie robi pointerdown, więc dźwięk ręcznie
    if (hit(1)) gpBack(ov);
    if (ov.id === 'startOv') {                     // LB/RB = zakładka w lewo/w prawo
      if (hit(4)) gpZakladka(-1);
      if (hit(5)) gpZakladka(1);
    }
    if (akcja('pauza') && ov.id === 'pauseOv') togglePause(false);
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
  // układ przycisków: cykl auto → xbox → ps → switch (glify w HUD i stopce od razu)
  document.getElementById('padUklad').onclick = () => {
    const cykl = ['auto', 'xbox', 'ps', 'switch'];
    META.pad.uklad = cykl[(cykl.indexOf(META.pad.uklad || 'auto') + 1) % cykl.length];
    saveMeta(); PAD.sygHud = PAD.sygFoot = ''; renderSterowanie();
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
  const ov = document.getElementById('bossOv'), nm = document.getElementById('bossNm');
  nm.innerHTML = 'DON CHIPSO<small>' + T('GLOWA FAMIGLII', 'HEAD OF THE FAMIGLIA') + '</small>';
  ov.classList.add('on'); nm.classList.add('on');
  pasy(true);
  G.shake = Math.max(G.shake, 0.5);
  G.hitstop = Math.max(G.hitstop, 0.18);           // swiat na moment przystaje
  // KINO: kamera odjezdza i czas zwalnia na ~1.2 s. Dotad boss dostawal tylko
  // przyciemnienie i napis, wiec „wejscie" bylo informacja, a nie wydarzeniem.
  G.kino = 1.2;
  padWibruj(0.3, 800);                             // długo i słabo — pomruk, nie kopnięcie
  AUDIO.sfx('boss');
  AUDIO.event('boss');
  setTimeout(() => { ov.classList.remove('on'); nm.classList.remove('on'); pasy(false); }, 1500);
}
function updateBossHp() {
  const el = document.getElementById('bossHp');
  let naj = null;
  for (const e of G.enemies) if (e.T.boss && !e.dying)
    if (!naj || e.hp / e.maxHp < naj.hp / naj.maxHp) naj = e;
  if (!naj) {
    if (el.classList.contains('on')) { el.classList.remove('on'); document.getElementById('buff').style.top = ''; }
    return;
  }
  const bylo = el.classList.contains('on');
  el.classList.add('on');
  const k = Math.max(0, naj.hp / naj.maxHp);
  el.querySelector('.bf').style.width = (k * 100) + '%';
  const ile = G.enemies.filter(e => e.T.boss && !e.dying).length;
  el.querySelector('.bn').textContent = 'DON CHIPSO' + (ile > 1 ? '  x' + ile : '');
  el.querySelector('.bl').textContent = Math.ceil(naj.hp) + ' / ' + Math.ceil(naj.maxHp);
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
function plunKetchupem(e) {
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
  const cx = P.pos.x + P.vx * KETCH_LOT * 0.55, cz = P.pos.z + P.vz * KETCH_LOT * 0.55;
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
                 to: { x: cx, z: cz } });
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
    if (Math.hypot(P.pos.x - gl.to.x, P.pos.z - gl.to.z) < KETCH_R
        && P.iframes <= 0 && !ciosPochloniety()) {
      P.hp -= 1 * dmgScale(); P.iframes = 0.9; drawHearts(); AUDIO.sfx('hurt'); G.shake = 0.3;
      const v = document.getElementById('vign');
      v.style.opacity = 1; setTimeout(() => v.style.opacity = 0, 180);
      if (P.hp <= 0) startDeath();
    }
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
// ---- PROGRESJA: poziom zagrożenia rośnie co minutę ----
const tier = () => 1 + Math.floor(G.time / 60);
// KLĄTWA: kupione poziomy podnoszą HP wrogów i zagęszczają spawn, a w zamian
// mnożą monety (patrz `monetyMul`). Świadomie kupowana trudność.
const klatwa = () => META.up.klatwa || 0;
const monetyMul = () => (1 + 0.20 * klatwa()) * (G.buff.key === 'kasa' ? 2 : 1);
const hpScale = () => (1 + G.time / 60 * 0.55 + Math.pow(G.time / 300, 2) * 1.5) * (1 + 0.10 * klatwa());  // późno rośnie ostro
const spdScale = () => Math.min(1.5, 1 + G.time / 60 * 0.035);
const dmgScale = () => G.time > 600 ? 3 : (G.time > 330 ? 2 : 1);               // 5.5 min → 2, 10 min → 3

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
function spawnEnemy(type, angle = null, przy = null, mozeElita = true) {
  const T = ENEMY_TYPES[type];
  const a = angle === null ? Math.random() * Math.PI * 2 : angle;
  const r = 34 + Math.random() * 10;
  const hpMul = hpScale();
  const elite = mozeElita && !T.boss && G.time > 60 && Math.random() < 0.06 + G.time / 60 * 0.015;
  const e = {
    type, T, elite,
    pos: przy ? new THREE.Vector3(przy.x, 0, przy.z)
              : new THREE.Vector3(P.pos.x + Math.sin(a) * r, 0, P.pos.z + Math.cos(a) * r),
    // Boss dotad NIE skalowal sie wcale: w 20. minucie mial 90 HP, gdy szeregowy
    // mial 108, a elita 648. Teraz rosnie jak wszyscy (bez mnoznika elity).
    hp: T.hp * hpMul * (elite ? 6 : 1),
    // `maxHp` NIE ISTNIALO na wrogach — pasek HP bossa liczyl „100 / NaN".
    // Ustawiamy je od razu przy spawnie: potrzebne do kazdego paska i do procentow.
    maxHp: T.hp * hpMul * (elite ? 6 : 1),
    dying: false, hitCd: 0, kb: new THREE.Vector3(), orbCd: 0, climbing: false,
    ty: 0, vy: 0, jumpCd: 1 + Math.random() * 3, faza: Math.random() * 6.28,
    bb: new Billboard(T.char || type, T.scale * (elite ? 1.45 : 1), false, true),   // true = instancja (E1)
  };
  e.ty = terrainH(e.pos.x, e.pos.z);
  if (elite) {                              // złota obwódka pod elitą (instancja w `pulaKrag`, poza sceną)
    e.ring = new THREE.Object3D();
    e.ring.scale.set(1.8, 1, 1.8);
  }
  e.bb.play(T.walk);
  // od razu na miejsce: potomek Marshmalliniego (spawn po pętli wrogów) stał przez
  // klatkę w (0,0,0) świata, zanim pętla zdążyła go ustawić
  e.bb.update(0, e.pos, e.ty);
  if (e.ring) e.ring.position.set(e.pos.x, e.ty + 0.06, e.pos.z);
  G.enemies.push(e);
  return e;
}

function killEnemy(e, i) {
  if (e.dying) return;                             // strażnik: drugie wywołanie na tym
  G.kills++;                                       // samym wrogu powtarzało drop i podział
  // Friesetti zabity w przysiadzie (tell) albo Lollini w ścisku wirowania: przywróć
  // skalę sprite'a, bo animacja śmierci klonuje ją jako bazę (recenzja 03.09)
  if (e.faz || e.T.wiruje) e.bb.mesh.scale.set(e.bb.h, e.bb.h, 1);
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
  if (G.streak === 12 || G.streak === 30) toastBuff(T('SERIA x', 'STREAK x') + G.streak + T(' — MONETY ×', ' — COINS ×') + (G.streak >= 30 ? 3 : 2));
  // ZGLOSZENIE WLASCICIELA: „ekran czasem sie za mocno trzesie". To bylo TU —
  // trzesienie odpalalo sie przy KAZDYM zabojstwie i rosło z seria do 0.5, a przy
  // 500 wrogach zabojstwa sa co klatke, wiec kamera nigdy nie wracala do spokoju.
  // Zostaje odczucie serii, znika ciagly jitter.
  G.shake = Math.max(G.shake, Math.min(0.18, 0.05 + G.streak * 0.008));
  AUDIO.sfx(e.T.boss ? 'bossdown' : 'kill', { seria: G.streak });   // ton rośnie z serią
  AUDIO.seria(G.streak);                           // przy dużej serii postać się odezwie (rzadko)
  if (e.T.boss) { dmgPop(e.pos.x, e.ty + 1.2, e.pos.z, 'BOSS DOWN!', '#ff5555', 2.6); META.st.bosses++; saveMeta();
    // muzyka bossa wraca do utworu z biegu dopiero, gdy padnie OSTATNI boss
    if (!G.enemies.some(o => o !== e && o.T.boss && !o.dying)) AUDIO.bossOff();
  }
  else if (e.elite) { dmgPop(e.pos.x, e.ty + 0.8, e.pos.z, T('ELITA!', 'ELITE!'), '#ffd75e', 1.9); padWibruj(0.55, 90); }
  // przy serii sam mnożnik wystarcza — słowo „KILL" tylko rozciągało napis na pół ekranu
  else dmgPop(e.pos.x, e.ty + 0.5, e.pos.z, G.streak > 1 ? 'x' + G.streak : 'KILL',
    '#ff6a5e', Math.min(1.0 + G.streak * 0.08, 1.6));
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
  // MNOŻNIK ZA SERIĘ nagradza stanie w hordzie, a nie kitowanie w pustce.
  const mnoznikSerii = G.streak >= 30 ? 3 : (G.streak >= 12 ? 2 : 1);
  const wyplac = (n, val, rozrzut = 0) => {
    for (let k = 0; k < n; k++)
      G.coins.push(makeCoin(e.pos.x + (Math.random() - .5) * rozrzut,
                            e.pos.z + (Math.random() - .5) * rozrzut, val * mnoznikSerii));
  };
  if (e.T.boss) wyplac(3, 10, 2.5);
  else if (e.elite) wyplac(1, 4);
  else if (Math.random() < 0.16) wyplac(1, 1);
  // serca: elity 30%, boss zawsze 2
  // SERCA SA RZADKIE (zyczenie wlasciciela). Bylo: boss zawsze 2, elita 30%.
  // Przy udziale elit rosnacym o 1.5%/min (14% w 5. min, 21% w 10.) leczenie sypalo
  // sie tak gestio, ze utrata serca przestawala cokolwiek znaczyc — a to ona jest
  // jedyna realna kara w tej grze. Teraz: boss 1 (drugie tylko gdy naprawde boli),
  // elita 8%.
  if (e.T.boss) {
    // GWARANTOWANA NAGRODA: dotad boss placil mniej niz zwykla skrzynia, wiec zabicie
    // najtwardszego przeciwnika w grze bylo slabsza nagroda niz podejscie do pudelka.
    wchest.wait = Math.min(wchest.wait, 0.4);      // zlota skrzynia (bron) prawie natychmiast
    G.hps.push(makeHeart(e.pos.x, e.pos.z));
    if (P.hp <= P.maxHp * 0.34) G.hps.push(makeHeart(e.pos.x + 0.8, e.pos.z));   // litosc przy 1/3 zycia
  } else if (e.elite && Math.random() < 0.08) G.hps.push(makeHeart(e.pos.x, e.pos.z));
  // Marshmallini po śmierci DZIELI SIĘ na dwa mniejsze (wg biblii)
  if (e.T.dzieli && !e.mini) {
    for (const bok of [-1, 1]) {
      // `false` = potomek NIGDY nie jest elitą (miał HP malucha, a płacił 12 monet + XP ×4)
      const m = spawnEnemy(e.type, null, { x: e.pos.x + bok * 0.8, z: e.pos.z }, false);
      if (m) { m.mini = true; m.hp = m.maxHp = e.T.hp * 0.5 * hpScale(); m.bb.mesh.scale.multiplyScalar(0.62); }
    }
  }
  if (e.ring) { scene.remove(e.ring); e.ring = null; }
  if (e.T.death && LIB[e.T.char || e.type].anims[e.T.death]) {
    e.dying = true; e.bb.play(e.T.death, false);
  } else {
    startRozpad(e);                                // brak arkusza `death` → śmierć z kodu
  }
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
function makeGem(x, z, val) {
  const m = new THREE.Object3D();
  m.scale.set(0.5 * pigulkaAspect, 0.5, 1);
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
  const s = val >= 10 ? 0.8 : (val >= 4 ? 0.62 : 0.5);
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
  const duzy = e.T.boss || e.elite;
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
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '.': ['00000','00000','00000','00000','00000','00110','00110'],
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
function dmgPop(x, ty, z, str, color = '#ffe066', scale = 1) {
  if (G.pops.length > 70) return;                 // bezpiecznik przy hordach
  // ZATŁOCZONY KADR. Napis rósł WPROST ze skali, a szerokość dodatkowo z długości
  // tekstu: „KILL X34" przy serii 34 miało 1.87 j. wysokości i **7.6 j. szerokości**,
  // czyli zasłaniało pół ekranu razem z postacią (zrzut z 13.08). Teraz:
  //  • drobne liczby ustępują, gdy w kadrze i tak jest tłok (krytyki, elity i boss
  //    mają scale >= 1, więc zostają),
  //  • szerokość jest ograniczona, a długie napisy zjeżdżają z wysokością.
  if (scale < 1 && G.pops.length > 24) return;
  const mat = popMat(str, color);
  const mesh = new THREE.Mesh(unitGeo, mat.clone());
  const asp = mat.userData.aspect || 2.9;
  let wys = 0.72 * scale;
  const maxSzer = Math.min(3.4, 2.2 + 0.45 * scale);
  if (wys * asp > maxSzer) wys = maxSzer / asp;
  mesh.scale.set(wys * asp, wys, 1);
  mesh.position.set(x + (Math.random() - .5) * 0.7, ty + 1.7, z);
  scene.add(mesh);
  G.pops.push({ mesh, t: 0 });
}
// wyświetlana liczba obrażeń (dopaminowa skala ×250, zaokrąglona do 10)
const dmgNum = d => String(Math.max(50, Math.round(d * 250 / 10) * 10));

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
// Zwraca { dmg, crit, dead } — `dmg` już po krytyku (np. do wybuchu meteoru).
// Dodając nową broń: NIGDY `e.hp -= x` na piechotę, zawsze `zadajDmg(e, x, {...})`.
const _kbV = new THREE.Vector3();          // wektor roboczy dla `o.kb` — zero alokacji na cios
function zadajDmg(e, dmg, o = {}) {
  const crit = dmg > 0 && Math.random() < critC();   // nova Sodino ma dmg 0 — nie ma czego krytykować
  if (crit) dmg *= 3;
  e.hp -= dmg;
  // wysysanie życia Beetina (Buraczane Ciśnienie): 10% obrażeń zbiera się w „soku",
  // co 2.5 j. soku = +1 serce (przy broniach 2.5-10 dmg to co ~5 ciosów poniżej połowy HP)
  // NERF 23.09 (pomiar: bot z samą bronią startową, Łąki): Beetino przeżywał 293 s i odzyskał
  // 49 serc, reszta postaci 48-81 s i zero. Przyczyna: pchnięcie trafia CAŁY tłum naraz, więc
  // jedno pchnięcie w hordę dawało kilka serc — im gęstsza horda, tym mocniej się leczył, czyli
  // najtrudniejszy moment gry był dla niego najłatwiejszy. Teraz NAJWYŻEJ 1 serce na 3 s, a sok
  // nie odkłada się na zapas (limit 4) — wysysanie zostaje tożsamością postaci, znika nieśmiertelność.
  if (dmg > 0 && cisnienie()) {
    P.sok = Math.min(4, (P.sok || 0) + dmg * 0.10);
    if (P.sok >= 4 && P.hp < P.maxHp && G.time >= (P.leczT || 0)) {
      P.sok = 0; P.leczT = G.time + BEET_LECZ_CD; P.hp++; drawHearts();
      dmgPop(P.pos.x, P.y + 0.7, P.pos.z, T('+SERCE', '+HEART'), '#ff6fa5', 1.2);
      AUDIO.sfx('serce');
    }
  }
  if (o.kb && !e.T.bezKb) e.kb.copy(o.kb).setY(0).normalize().multiplyScalar((o.kbSila == null ? 1 : o.kbSila) * (crit ? 1.5 : 1));
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
      ? ['1 shot', '2 shots, stronger', '3 shots and pierce', 'stronger still', '4 shots, +2 pierce (→ evolution!)']
      : ['1 pocisk', '2 pociski, mocniejsze', '3 pociski i przebicie',
         'jeszcze mocniejsze', '4 pociski, +2 przebicia (→ ewolucja!)'])[l - 1],
    evoKey: 'meteor', evoIco: 'kula', evoNm: T('KULE METEORYCZNE', 'METEOR ORBS'),
    evoDs: T('EWOLUCJA: pociski WYBUCHAJĄ przy trafieniu', 'EVOLUTION: shots EXPLODE on impact'),
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const count = [1, 2, 3, 3, 4][w.lvl - 1], pierce = [0, 0, 1, 1, 2][w.lvl - 1];
      // POZIOM 1 MUSI ZABIJAĆ CHIPSETTIEGO JEDNĄ KULĄ (ma 3.01 HP na starcie).
      // To chwyt z Vampire Survivors, gdzie bicz kasuje pierwsze nietoperze za jednym
      // ciosem — i to on daje pierwsze 30 sekund „mam moc". Okno zamyka się samo,
      // bo `hpScale` rośnie: w 2. minucie Chipsetti ma już ~6.6 HP i trzeba ulepszeń.
      const dmg = [3.2, 3.9, 4.6, 5.4, 6.2][w.lvl - 1];
      let targets = G.enemies.filter(e => !e.dying)
        .map(e => ({ e, d: e.pos.distanceTo(P.pos) }))
        .filter(o => o.d < rangeF())
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
                  + T(l === 5 ? ' (→ ewolucja!)' : '', l === 5 ? ' (→ evolution!)' : ''),
    evoKey: 'kosci', evoIco: 'czosnek', evoNm: T('CZOSNKOWY MŁYN', 'GARLIC MILL'),
    evoDs: T('EWOLUCJA: dłuższa linka, szybszy obrót i 2× mocniejsze', 'EVOLUTION: longer string, faster spin, 2× the damage'),
    tick(w, dt) {
      while (G.orbs.length < w.lvl) G.orbs.push(nowyCzosnek(G.orbs.length));
      updateCzosnki(dt, w.lvl);
    },
  },
  tupniecie: {
    ico: 'fala', nm: T('Tupnięcie', 'Stomp'),
    ds: T('Fala uderzeniowa (też przy lądowaniu ze skoku!)', 'A shockwave (on landing from a jump too!)'), max: 3,
    lvlDs: l => T('promień i moc fali +', 'wave radius and power +') + l,
    evoKey: 'sejsm', evoIco: 'fala', evoNm: T('TRZĘSIENIE ZIEMI', 'EARTHQUAKE'),
    evoDs: T('EWOLUCJA: fale częstsze, większe i 2× mocniejsze', 'EVOLUTION: waves more often, wider and 2× stronger'),
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = (P.evo.sejsm ? 2.0 : 3.2) / fireMul();
      nova(P.pos.x, P.pos.z, stompRad(w.lvl), stompDmg(w.lvl));
    },
  },
  piorun: {
    ico: 'pioruny', nm: T('Piorun', 'Thunderbolt'), ds: T('Grom bije losowych wrogów', 'Lightning strikes random enemies'), max: 5, locked: true,
    lvlDs: l => `${Math.ceil(l / 2)} ${T('grom(y)', 'bolt(s)')}, ${T('co', 'every')} ${(2.8 - 0.25 * l).toFixed(1)} s`,
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const alive = G.enemies.filter(e => !e.dying && e.pos.distanceTo(P.pos) < 15 * rangeM());
      if (!alive.length) return;
      w.t = (2.8 - 0.25 * w.lvl) / fireMul();
      for (let b = 0; b < Math.ceil(w.lvl / 2); b++) {
        const e = alive[Math.floor(Math.random() * alive.length)];
        if (e.dying) continue;                       // dwa gromy mogą wylosować tego samego
        boltFx(e.pos.x, e.ty, e.pos.z);
        AUDIO.sfx('piorun');
        e.kb.set(0, 0, 0);
        zadajDmg(e, 3 * dmgAll(), { col: '#e8f4ff', sc: 1.2 });
      }
    },
  },
  butelka: {
    ico: 'butelka', nm: T('Butelka żula', 'Hobo Bottle'), ds: T('Leci łukiem i WYBUCHA', 'Lobbed in an arc, goes BANG'), max: 5, locked: true,
    lvlDs: l => `${T('wybuch', 'blast')} r=${(2 + 0.3 * l).toFixed(1)}, ${T('co', 'every')} ${(3.6 - 0.25 * l).toFixed(1)} s`,
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      const alive = G.enemies.filter(e => !e.dying && e.pos.distanceTo(P.pos) < 13 * rangeM());
      if (!alive.length) return;
      w.t = (3.6 - 0.25 * w.lvl) / fireMul();
      const e = alive[Math.floor(Math.random() * alive.length)];
      const m = new THREE.Mesh(unitGeo, bottleMat);
      m.scale.set(0.7, 0.7, 1);
      scene.add(m);
      G.lobs.push({ mesh: m, from: P.pos.clone(), to: e.pos.clone(), t: 0, dur: 0.7, lvl: w.lvl });
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
    lvlDs: l => `${T('zasięg', 'range')} ${(8 + 0.6 * l).toFixed(0)}, ${T('co', 'every')} ${(2.8 - 0.2 * l).toFixed(1)} s`,
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = (2.8 - 0.2 * w.lvl) / fireMul();
      const m = new THREE.Mesh(unitGeo, radioMat);
      m.scale.set(0.9, 0.9, 1);
      scene.add(m);
      const dir = new THREE.Vector3(Math.sin(playerBB.facing), 0, Math.cos(playerBB.facing));
      G.boomers.push({ mesh: m, dir, t: 0, dur: 1.6, dist: (8 + 0.6 * w.lvl) * rangeM(), lvl: w.lvl, hit: new Set() });
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
    lvlDs: l => `${T('promień', 'radius')} ${SKARPETA_R(l).toFixed(1)} (${T('obszar', 'area')} ×${(SKARPETA_R(l) ** 2 / SKARPETA_R(1) ** 2).toFixed(1)}), ${T('trucie co 0.7 s', 'poison tick 0.7 s')}`,
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = 0.7 / fireMul();
      const r = SKARPETA_R(w.lvl) * rangeM(), ad = (0.7 + 0.28 * w.lvl) * dmgAll();   // ten sam mnożnik co dym w `updateSmrod`
      // ŻADNEJ OBRĘCZY. `novaRing` rysował tu rozchodzące się koło co 0.7 s —
      // to był ten „okrąg", który właściciel odrzucił. Tempo trucia pokazuje
      // teraz „oddech" dymu: kłęby na 0.3 s puchną i jaśnieją (`uPuls`).
      dymPulsT = G.time;
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
        if (dx * dx + dz * dz < r * r) zadajDmg(e, ad, { col: '#a8e05f', sc: 0.75 });
      }
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
          zadajDmg(e, wd, { col: '#e0f0ff', kb: dir, kbSila: 2 });
        }
      }
    },
  },
  kura: {
    ico: 'kukurydza', nm: 'Kernello Boomello',
    ds: T('Ziarno kukurydzy biegnie do wroga i STRZELA', 'A corn kernel runs at an enemy and POPS'), max: 5, locked: true,
    lvlDs: l => `${T('wybuch', 'blast')} r=${(2.5 + 0.3 * l).toFixed(1)}, ${T('co', 'every')} ${(4.5 - 0.35 * l).toFixed(1)} s`
      + T(l === 5 ? ' (→ ewolucja!)' : '', l === 5 ? ' (→ evolution!)' : ''),
    evoKey: 'kaseta', evoIco: 'kukurydza', evoNm: T('BOMBA KASETOWA', 'CLUSTER BOMB'),
    evoDs: T('EWOLUCJA: wybuch rozsypuje 6 mniejszych ziaren, każde z własnym lontem',
             'EVOLUTION: the blast scatters 6 smaller kernels, each with its own fuse'),
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
      + T(l === 5 ? ' (→ ewolucja!)' : '', l === 5 ? ' (→ evolution!)' : ''),
    evoKey: 'wachlarz', evoIco: 'celownik', evoNm: T('WACHLARZ RZODKIEWKI', 'RADISH FAN'),
    evoDs: T('EWOLUCJA: każdy rzut to trzy scyzoryki w wachlarzu', 'EVOLUTION: every throw is three knives in a fan'),
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
      const ile = 2 + w.lvl;
      for (let i = 0; i < ile; i++) {
        G.seria.push({ kat, opoznienie: i * 0.11, lvl: w.lvl });
      }
    },
  },
  // ===== LA CIABATTA (startowa broń Granny, wg biblii) =====
  // Kapeć-bumerang: leci, przebija WSZYSTKO i wraca, bijąc drugi raz w drodze
  // powrotnej. Korzysta z tej samej maszynerii co radio-bumerang (`G.boomers`),
  // ale rzuca DWA kapcie w wachlarzu i celuje w najbliższego wroga, nie w przód.
  ciabatta: {
    ico: 'kapec', nm: 'La Ciabatta', ds: T('Kapeć leci, przebija wszystko i WRACA', 'The slipper flies, pierces everything and COMES BACK'), max: 5, postac: 'granny',
    lvlDs: l => `${l >= 3 ? 2 : 1} ${T('kapeć(cie)', 'slipper(s)')}, ${T('zasięg', 'range')} ${(6 + 0.5 * l).toFixed(0)}, ${T('co', 'every')} ${(1.9 - 0.12 * l).toFixed(1)} s`
      + T(l === 5 ? ' (→ ewolucja!)' : '', l === 5 ? ' (→ evolution!)' : ''),
    evoKey: 'doppia', evoIco: 'kapec', evoNm: 'CIABATTA DOPPIA',
    evoDs: T('EWOLUCJA: kapcie krążą wokół Ciebie bez przerwy', 'EVOLUTION: the slippers orbit you non-stop'),
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      w.t = (1.9 - 0.12 * w.lvl) / fireMul();
      // celujemy w najbliższego wroga — babcia nie pudłuje (biblia: „celność samonaprowadzająca")
      let cel = null, najl = 1e9;
      for (const e of G.enemies) { if (e.dying) continue;
        const d = e.pos.distanceTo(P.pos); if (d < najl) { najl = d; cel = e; } }
      const baza = cel ? Math.atan2(cel.pos.x - P.pos.x, cel.pos.z - P.pos.z) : playerBB.facing;
      const ile = (w.lvl >= 3 ? 2 : 1) * (P.evo.doppia ? 2 : 1);
      for (let i = 0; i < ile; i++) {
        const a = baza + (i - (ile - 1) / 2) * 0.34;
        const m = new THREE.Mesh(unitGeo, kapecMat);
        m.scale.set(0.85 * kapecAspect, 0.85, 1);
        scene.add(m);
        G.boomers.push({ mesh: m, dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
                         t: 0, dur: 1.5, dist: (6 + 0.5 * w.lvl) * rangeM(), lvl: w.lvl + 1, hit: new Set() });
      }
    },
  },
  // ===== WYPAD! (startowa broń Beetina, wg biblii) =====
  // Pchnięcie falą w stożku 60° przed sobą: mały zasięg, ale OGROMNY knockback —
  // bramkarz nie zabija, on odprowadza. Skalowanie: zasięg → knockback → obrażenia.
  wypad: {
    ico: 'fala', nm: T('Wypad!', 'Velvet Push'),
    ds: T('Pcha tam, gdzie tłok; w ścisku pcha dookoła', 'Shoves the thickest crowd; when surrounded, shoves all around'), max: 5, postac: 'beetino',
    lvlDs: l => `${T('zasięg', 'range')} ${(3.4 + 0.4 * l).toFixed(1)} ${T('j.', 'u')}, ${T('odrzut', 'knockback')} ${(5 + l).toFixed(0)}, ${T('co', 'every')} ${(1.5 - 0.06 * l).toFixed(2)} s`
      + T(l === 5 ? ' (→ ewolucja!)' : '', l === 5 ? ' (→ evolution!)' : ''),
    evoKey: 'selekcja', evoIco: 'tarcza', evoNm: T('DZIŚ NIE WEJDZIESZ', 'NOT ON THE LIST'),
    evoDs: T('EWOLUCJA: pchnięcie ogłusza i zadaje podwójne obrażenia', 'EVOLUTION: the shove stuns and deals double damage'),
    // BRAMKARZ PCHA TAM, GDZIE TŁOK (decyzja właściciela 18.09). Do tej pory stożek szedł
    // w KIERUNKU BIEGU postaci — a w survivorsie biegnie się OD hordy, więc pchnięcie leciało
    // w pustą łąkę i wrogowie za plecami nigdy nie obrywali („prawie nieużywalna").
    // Teraz: 12 sektorów po 30°, celujemy w ten z największą liczbą wrogów (z sąsiadami =
    // stożek 60°); gdy w zasięgu stoi 6+ wrogów, pchnięcie idzie na 360° (bramkarz w ścisku
    // rozrzuca wszystkich dookoła). Bez wrogów w zasięgu — kierunek biegu jak dawniej.
    tick(w, dt) {
      w.t -= dt;
      if (w.t > 0) return;
      // NERF (właściciel po teście 18.09: „znerfić trzeba buraka"): 4+1.3l → 3.2+1.0l, cooldown
      // 1.4 → 1.5 s, pchnięcie dookoła od 8 wrogów (było 6). Celowanie w tłok zostaje — to ono
      // naprawiło broń, obrażenia były dołożone na zapas.
      w.t = (1.5 - 0.06 * w.lvl) / fireMul();
      const zasieg = (3.4 + 0.4 * w.lvl) * rangeM(), odrzut = 5 + w.lvl;
      const dmg = (3.2 + 1.0 * w.lvl) * (P.evo.selekcja ? 2 : 1) * dmgAll();   // ×1.28 względem 2.5+0.8l
      const sektor = new Array(12).fill(0);
      let wZasiegu = 0;
      for (const e of G.enemies) {
        if (e.dying) continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
        if (dx * dx + dz * dz > zasieg * zasieg) continue;
        wZasiegu++;
        sektor[(Math.floor(faceAngle(dx, dz) / (Math.PI / 6)) + 12) % 12]++;
      }
      const dookola = wZasiegu >= 8;
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
        zadajDmg(e, dmg, { col: '#ff9d7a', sc: 1.1, kb: _kbV.set(dx, 0, dz), kbSila: odrzut });
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
      + T(l === 5 ? ' (→ ewolucja!)' : '', l === 5 ? ' (→ evolution!)' : ''),
    evoKey: 'jablon', evoIco: 'pestka', evoNm: T('JABŁOŃ', 'APPLE TREE'),
    evoDs: T('EWOLUCJA: kiełki żyją 2× dłużej i biją 2× mocniej', 'EVOLUTION: sprouts live 2× longer and hit 2× harder'),
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
        toastBuff(T('SOKOWIRÓWKA GOTOWA — wciśnij F, żeby POSTAWIĆ', 'JUICER READY — press F to PLACE IT'), 'sokowirowka');
        setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 4000);
      }
    },
  },
};
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
      zadajDmg(e, 1.2 * dmgAll(), { col: '#c9f07a', sc: 0.85, kb: _kbV.copy(e.pos).sub(p.pos), kbSila: 1.8 });
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
        zadajDmg(e, dmg, { col: '#a8e05f', sc: 0.7 });
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
const SOKO_HP = l => 6 + 3 * l;                   // wytrzymałość na ciosy wrogów
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
                  lvl: k.lvl, r: KRZAK_R(k.lvl), dmg: KRZAK_DMG(k.lvl), wys: 2.2 });
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
    if (bije && zadajDmg(e, dmg, { col: '#c9f07a', sc: 0.7 }).dead) continue;   // petla od konca, wiec splice jest bezpieczny
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
        t.hp -= e.T.dmg * dmgScale();
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
                       y: t.pos.y + 0.7, dmg: SOKO_DMG(t.lvl) });
        AUDIO.sfx('strzal');
      }
    }
    if (t.t >= t.zycie || t.hp <= 0) {
      scene.remove(t.mesh); scene.remove(t.pasTlo); scene.remove(t.pasFill);
      t.pasFill.material.dispose();
      okruchy(t.pos.x, t.pos.y + 0.5, t.pos.z, 0xd7dde6, t.hp <= 0 ? 10 : 5);
      if (t.hp <= 0) { nova(t.pos.x, t.pos.z, 2.4, 2 * dmgAll()); AUDIO.sfx('wybuch'); }
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
        zadajDmg(e, oDmg, { col: '#eaffd0', sc: 0.9, kb: _kbV.copy(e.pos).sub(P.pos), kbSila: 2.6, noKill: true });
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
const stompRad = l => (3 + l * 0.7 + (P.evo.sejsm ? 2 : 0)) * rangeM();   // Sokoli wzrok poszerza falę
const stompDmg = l => l * 1.5 * (P.evo.sejsm ? 2 : 1) * dmgAll();

// ============================== PASYWY (bufy zbierane kartami) ==============================
const PASSIVES = {
  moc:    { ico: 'plomien', nm: T('Moc', 'Might'), ds: T('+15% obrażeń wszystkiego', '+15% damage on everything'), max: 5 },
  tempo:  { ico: 'zegar', nm: T('Tempo', 'Tempo'), ds: T('+12% szybkości ataków', '+12% attack speed'), max: 5 },
  buty:   { ico: 'but', nm: T('Klapki Carrotella', "Carrotello's Flip-Flops"), ds: T('+10% szybkości ruchu', '+10% move speed'), max: 5 },
  magnes: { ico: 'magnes', nm: T('Magnes', 'Magnet'), ds: T('+35% zasięgu zbierania', '+35% pickup range'), max: 5 },
  krytyk: { ico: 'gwiazda', nm: T('Krytyk', 'Crit'), ds: T('+10% szansy na cios ×3', '+10% chance of a ×3 hit'), max: 5 },
  serce:  { ico: 'serce', nm: T('Serducho', 'Big Heart'), ds: T('+1 max serce i pełne leczenie', '+1 max heart and a full heal'), max: 5 },
  zasieg: { ico: 'celownik', nm: T('Sokoli wzrok', 'Hawk Eye'), ds: T('+20% zasięgu broni', '+20% weapon range'), max: 4 },
  tarcza: { ico: 'tarcza', nm: T('Tarcza brainrota', 'Brainrot Shield'),
            ds: T('Blokuje 1 trafienie (ładuje się z czasem)', 'Blocks 1 hit (recharges over time)'), max: 3, locked: true },
};

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
function repeatPool() {
  return Object.keys(REPEAT).map(key => {
    const R = REPEAT[key];
    const n = P.repeat[key] || 0;
    return {
      ico: R.ico, nm: R.nm + (n ? ` ×${n + 1}` : ''), ds: R.ds,
      // `n` sluzy TYLKO do podpisu. Licznik czytamy na nowo w chwili klikniecia:
      // kafelek moze przelezec w kolejce overlayow (dwa awanse w jednej klatce),
      // a `n + 1` z chwili budowy COFNELOBY licznik do 1 zamiast go podniesc.
      do: () => { P.repeat[key] = (P.repeat[key] || 0) + 1; },
    };
  });
}

// ============================== KARTY ULEPSZEŃ ==============================
function cardPool() {
  const pool = [];
  for (const w of P.weapons) {
    const W = WEAPONS[w.key];
    if (w.lvl < W.max) pool.push({
      ico: W.ico, nm: W.nm + T(' → poz. ', ' → lv. ') + (w.lvl + 1), ds: W.lvlDs(w.lvl + 1),
      do: () => { w.lvl++; renderWpns(); },
    });
    else if (W.evoKey && !P.evo[W.evoKey]) pool.push({
      gold: true, ico: W.evoIco, nm: W.evoNm, ds: W.evoDs,
      do: () => { P.evo[W.evoKey] = true; renderWpns(); blysk('#ffd75e', 0.55); },
    });
  }
  // NOWE BRONIE NIE MA W KARTACH — znajduje się je w złotych skrzyniach 🎁
  for (const key of Object.keys(PASSIVES)) {
    const S = PASSIVES[key];
    if (S.locked && !META.unlocked[key]) continue;
    const lvl = P.passives[key] || 0;
    if (lvl >= S.max) continue;
    pool.push({
      ico: S.ico, nm: S.nm + (lvl ? ` (${lvl}→${lvl + 1})` : ''), ds: S.ds,
      do: () => {
        P.passives[key] = lvl + 1;
        if (key === 'serce') { P.maxHp++; P.hp = P.maxHp; drawHearts(); }
      },
    });
  }
  return pool;
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
  document.getElementById('swapOv').style.display === 'flex';
function pchnijOverlay(fn) {
  puscMysz();                                      // karty klika sie kursorem
  // TRUP NIE AWANSUJE: obrazenia od spadajacego regalu i od Sodina wolaja `startDeath()`
  // BEZ `return`, wiec ta sama klatka leciala dalej do petli pigulek i mogla otworzyc
  // karty POD ekranem smierci (dwa `.ov` naraz = prawie czarny ekran).
  if (G.dying || G.over || !G.running) return;
  if (ovWidoczny()) { OV_Q.push(fn); return; }
  G.paused = true;
  fn();
}
function zamknijOverlay(id) {
  document.getElementById(id).style.display = 'none';
  // WYCZYŚĆ KAFELKI: samo `display:none` zostawiało je w drzewie z żywym `onclick`,
  // więc zamknięty overlay dawał się jeszcze „kliknąć" z kodu i ponownie nadawał
  // ulepszenie. Gracz by tego nie tknął, ale to mina dla każdego przyszłego testu.
  const wrap = document.getElementById(id === 'cardsOv' ? 'cards' : 'swapList');
  if (wrap) wrap.innerHTML = '';
  const nast = OV_Q.shift();
  if (nast) { G.paused = true; nast(); return; }   // pauza trwa dalej dla następnego
  G.paused = false;
}
function showCards() {
  const wrap = document.getElementById('cards'); wrap.innerHTML = '';
  const pool = cardPool();
  const picks = [];
  const goldIdx = pool.findIndex(u => u.gold);      // ewolucja ma pierwszeństwo, max 1
  if (goldIdx >= 0) picks.push(pool.splice(goldIdx, 1)[0]);
  for (let i = pool.length - 1; i >= 0; i--) if (pool[i].gold) pool.splice(i, 1);
  while (picks.length < 3 && pool.length) {
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  // PÓŹNA GRA: brakujące slotu dopełniają przyprawy bez limitu (zamiast „Znaleźne”
  // trzydzieści razy pod rząd). Wcześnie ta gałąź nie odpala, bo pula normalnych
  // kart ma wtedy kilkanaście pozycji.
  if (picks.length < 3) {
    const rep = repeatPool();
    while (picks.length < 3 && rep.length) picks.push(rep.splice(Math.floor(Math.random() * rep.length), 1)[0]);
  }
  // ZERO KART = ZERO OVERLAYA. Awans nie może zmuszać do kliknięcia w kafelek,
  // który nic nie znaczy — nagroda leci sama, gra się nie zatrzymuje.
  // (Dziś nieosiągalne, bo przyprawy są bez limitu; zostaje jako siatka
  // bezpieczeństwa, gdyby kiedyś dostały `max`.)
  if (!picks.length) {
    G.runCoins += 20; drawCoins();
    toastBuff(T('AWANS — nic już do ulepszenia: +20 monet', 'LEVEL UP — nothing left to upgrade: +20 coins'), 'moneta');
    return zamknijOverlay('cardsOv');
  }
  for (const u of picks) {
    const d = document.createElement('div');
    d.className = 'card' + (u.gold ? ' gold' : '');
    d.innerHTML = `<div class="ico">${ico(u.ico, 42)}</div><div class="nm">${u.nm}</div><div class="ds">${u.ds}</div>`;
    d.onclick = () => { u.do(); zamknijOverlay('cardsOv'); };
    wrap.appendChild(d);
  }
  document.getElementById('cardsOv').style.display = 'flex';
}

// ============================== WYMIENNIK BRONI 🔄 ==============================
function openSwap() {
  const wrap = document.getElementById('swapList'); wrap.innerHTML = '';
  document.getElementById('swapTitle').textContent = T('WYMIENNIK! Którą broń oddajesz?', 'SWAP TIME! Which weapon goes?');
  for (const w of P.weapons) {
    const W = WEAPONS[w.key];
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<div class="ico">${ico(W.ico, 42)}</div><div class="nm">${W.nm} ${T('poz.', 'lv.')} ${w.lvl}</div><div class="ds">${T('kliknij, by ODDAĆ', 'tap to GIVE IT UP')}</div>`;
    d.onclick = () => pickNewWeapon(w);
    wrap.appendChild(d);
  }
  const skip = document.createElement('div');
  skip.className = 'card';
  skip.innerHTML = `<div class="ico">${ico('wymiana', 42)}</div><div class="nm">${T('Zostaw jak jest', 'Keep them all')}</div><div class="ds">${T('+10 monet pocieszenia', '+10 coins as a consolation')}</div>`;
  skip.onclick = () => { G.runCoins += 10; drawCoins(); closeSwap(); };
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
function openNewWeapon() {
  const wszystkie = Object.keys(WEAPONS).filter(k => !hasWeapon(k) && broniDostepna(k));
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
    d.innerHTML = `<div class="ico">${ico(W.ico, 42)}</div><div class="nm">${W.nm}</div><div class="ds">${W.ds}</div>`;
    d.onclick = () => {
      P.weapons.push({ key, lvl: 1, t: 0 });
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
      Object.assign(oldW, { key, lvl: 1, t: 0 });
      renderWpns();
      closeSwap();
    };
    wrap.appendChild(d);
  }
}
function closeSwap() { zamknijOverlay('swapOv'); }

// ============================== HUD ==============================
function drawHearts() {
  // HP przycinamy do maksimum: `repeat()` z liczba ujemna rzuca RangeError i zabija
  // cala klatke, a wystarczy jedno leczenie ponad max (albo hak debugowy), zeby to
  // wywolac. Prog licznika nizszy na waskich ekranach — rzad 11 serc wchodzil
  // w licznik ZAGROZENIA.
  const hp = Math.max(0, Math.min(P.hp, P.maxHp));
  const prog = innerWidth < 520 ? 8 : 12;
  document.getElementById('hearts').innerHTML = P.maxHp > prog
    ? ico('serce', 18) + ` ${hp} / ${P.maxHp}`      // dużo serc = licznik zamiast rzędu
    : ico('serce', 18).repeat(hp) + ico('sercePuste', 18).repeat(Math.max(0, P.maxHp - hp));
}
const fmtTime = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const drawCoins = () => document.getElementById('coins').innerHTML = ico('moneta', 15) + ' ' + G.runCoins;
function renderWpns() {
  document.getElementById('wpns').innerHTML = P.weapons.map(w => {
    const W = WEAPONS[w.key];
    const evo = W.evoKey && P.evo[W.evoKey];
    return `<span class="wp${evo ? ' evo' : ''}">${ico(evo ? W.evoIco : W.ico, 20)}<b>${w.lvl}</b></span>`;
  // PUSTE SLOTY = OSOBNE `<span>`, nie jeden z kropkami: w skórze „Warzywniak
  // Nonny" slot jest skrzynką na warzywa o stałym rozmiarze, więc trzy puste
  // sloty muszą być trzema skrzynkami, a nie jedną z trzema kropkami w środku.
  }).join('') + '<span class="wp empty">·</span>'.repeat(Math.max(0, 3 - P.weapons.length));
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
    // ======== MARKET: rozlana woda (ŚLISKO!) ========
    const nPlam = rng() < 0.75 ? 1 + Math.floor(rng() * 3) : 0;
    for (let i = 0; i < nPlam; i++) {
      const x = wx0 + (rng() - 0.5) * CHUNK, z = wz0 + (rng() - 0.5) * CHUNK;
      if (Math.abs(x) < 7 && Math.abs(z) < 7) continue;
      const r = 4.0 + rng() * 4.5;
      const m = new THREE.Mesh(blobGeo, spillMat);
      m.scale.set(r * 2, 1, r * 2);
      m.position.set(x, terrainH(x, z) + 0.03, z);
      scene.add(m);
      rocks.push(m);
      spills.push({ x, z, r });
    }
    // ======== MARKET: regały (2 poziomy półek), palety, lady, ciasne alejki ========
    for (let rowZ = -CHUNK / 2 + 4; rowZ < CHUNK / 2; rowZ += 8) {
      for (let sx = -CHUNK / 2 + 5; sx < CHUNK / 2 - 3; sx += 10) {
        const x = wx0 + sx, z = wz0 + rowZ;
        if (Math.abs(x) < 7 && Math.abs(z) < 7) continue;   // czysty spawn
        const g0 = terrainH(x, z);
        const co = rng();
        if (co < 0.22) {
          // PALETA ze skrzynkami — NISKA (0.95), wskoczysz bez podwójnego skoku
          const pal = new THREE.Mesh(shelfGeo, plankMat);
          pal.scale.set(3.4, 0.35, 2.6);
          pal.position.set(x, g0 + 0.175, z);
          scene.add(pal); rocks.push(pal);
          const box = new THREE.Mesh(shelfGeo, crateMat);
          box.scale.set(2.6, 0.6, 2);
          box.position.set(x, g0 + 0.65, z);
          scene.add(box); rocks.push(box);
          solids.push({ x, z, hw: 1.7, hl: 1.3, top: g0 + 0.95 });
        } else if (co < 0.34) {
          // LADA / stoisko chłodnicze — średnia (1.5), przeskok ze skoku z rozbiegu
          const lada = new THREE.Mesh(shelfGeo, coolerMat);
          lada.scale.set(6, 1.5, 2.2);
          lada.position.set(x, g0 + 0.75, z);
          scene.add(lada); rocks.push(lada);
          solids.push({ x, z, hw: 3, hl: 1.1, top: g0 + 1.5 });
        } else if (co < 0.62) {
          continue;                               // przerwa = przejście w alejce
        } else {
          // REGAŁ: korpus + 2 wystające półki (bryły) = lepiej czytelny.
          // Wszystkie części siedzą w GRUPIE, której pivot leży na KRAWĘDZI
          // podstawy od strony upadku — dzięki temu przewracanie to jeden obrót
          // `rotation.x`, a nie ręczne przeliczanie pozycji pięciu bryłek.
          const len = 7;
          const kier = rng() < 0.5 ? 1 : -1;               // w którą stronę się przewróci
          // PARA PLECAMI DO SIEBIE (40% miejsc): przewrócony regał sięga 2.3 j.,
          // a rzędy stoją 8 j. od siebie — bez pary DOMINO nie ma czego trącić.
          // Oba regały w parze padają w TĘ SAMĄ stronę, więc pierwszy wywala drugi.
          const para = rng() < 0.4;
          const offs = para ? [-1.25 * kier, 1.25 * kier] : [0];
          for (const oz of offs) {
            const zz = z + oz;
            const pivotZ = zz + kier * 0.8;                // krawędź podstawy od strony upadku
            const solid = { x, z: zz, hw: len / 2, hl: 1.1, top: g0 + SHELF_H + 0.16 };
            solids.push(solid);
            shelves.push({ solid, x, z: zz, g0, len, kier, pivotZ, t: 0, stan: 'stoi' });
          }
        }
      }
    }
    // ======== REGAŁY JAKO INSTANCJE: 3 draw calle na chunk zamiast 3 na regał ========
    if (shelves.length) {
      if (!regalGeo) initRegalGeo();
      const inst = {
        korpus: new THREE.InstancedMesh(regalGeo.korpus, shelfMat, shelves.length),
        polkiDol: new THREE.InstancedMesh(regalGeo.polkiDol, plankMat, shelves.length),
        polkiGora: new THREE.InstancedMesh(regalGeo.polkiGora, plankMat, shelves.length),
      };
      for (const im of [inst.korpus, inst.polkiDol, inst.polkiGora]) {
        im.frustumCulled = false;                  // regały sięgają poza pudełko chunka
        scene.add(im); rocks.push(im);
      }
      shelves.forEach((sh, i) => { sh.inst = inst; sh.i = i; ustawRegal(sh, 0); });
    }
  } else {
    // ======== ŁĄKI: struktury do wskakiwania (proste bryły) ========
    const rr = rng();
    if (rr < 0.30) {
      // STOSY SKRZYŃ — schodki 0.9 / 1.7 (wskakujesz bez podwójnego skoku)
      const x = wx0 + (rng() - 0.5) * CHUNK * 0.7, z = wz0 + (rng() - 0.5) * CHUNK * 0.7;
      if (terrainH(x, z) > wodaY(x, z) + 0.4) {
        const g0 = terrainH(x, z);
        const uklad = [[0, 0, 0.9], [1.5, 0.3, 1.7], [0.7, 1.6, 1.3]];
        for (const [ox, oz, h] of uklad) {
          const m = new THREE.Mesh(shelfGeo, crateMat);
          m.scale.set(1.4, h, 1.4);
          m.position.set(x + ox, g0 + h / 2, z + oz);
          m.rotation.y = rng() * 0.5;
          scene.add(m); rocks.push(m);
          solids.push({ x: x + ox, z: z + oz, hw: 0.7, hl: 0.7, top: g0 + h });
        }
      }
    } else if (rr < 0.48) {
      // DREWNIANY PODEST NA PALACH — wysoki taras (2.1), wejście po skrzyni obok
      const x = wx0 + (rng() - 0.5) * CHUNK * 0.7, z = wz0 + (rng() - 0.5) * CHUNK * 0.7;
      if (terrainH(x, z) > wodaY(x, z) + 0.4) {
        const g0 = terrainH(x, z), H = 2.1;
        const deck = new THREE.Mesh(shelfGeo, plankMat);
        deck.scale.set(5.4, 0.35, 5.4);
        deck.position.set(x, g0 + H, z);
        scene.add(deck); rocks.push(deck);
        solids.push({ x, z, hw: 2.7, hl: 2.7, top: g0 + H + 0.18 });
        for (const [px, pz] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]) {
          const p2 = new THREE.Mesh(shelfGeo, plankMat);
          p2.scale.set(0.4, H, 0.4);
          p2.position.set(x + px, g0 + H / 2, z + pz);
          scene.add(p2); rocks.push(p2);
        }
        // stopień wejściowy
        const st = new THREE.Mesh(shelfGeo, crateMat);
        st.scale.set(1.6, 1.1, 1.6);
        st.position.set(x + 3.6, g0 + 0.55, z);
        scene.add(st); rocks.push(st);
        solids.push({ x: x + 3.6, z, hw: 0.8, hl: 0.8, top: g0 + 1.1 });
      }
    } else if (rr < 0.60) {
      // KAMIENNE SCHODY na wzniesienie (3 stopnie)
      const x = wx0 + (rng() - 0.5) * CHUNK * 0.7, z = wz0 + (rng() - 0.5) * CHUNK * 0.7;
      if (terrainH(x, z) > wodaY(x, z) + 0.4) {
        const g0 = terrainH(x, z);
        for (let s2 = 0; s2 < 3; s2++) {
          const h = 0.6 + s2 * 0.6;
          const m = new THREE.Mesh(shelfGeo, stoneMat);
          m.scale.set(3, h, 1.5);
          m.position.set(x, g0 + h / 2, z + s2 * 1.5);
          scene.add(m); rocks.push(m);
          solids.push({ x, z: z + s2 * 1.5, hw: 1.5, hl: 0.75, top: g0 + h });
        }
      }
    }
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
          zadajDmg(e, e.T.boss ? mx * 0.15 : mx * 1.3);
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
    if (!ch.solids.length) continue;
    for (const s of ch.solids) {
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
          blockTop = Math.max(blockTop, s.top);
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
    if (!ch.solids.length) continue;
    for (const s of ch.solids) {
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
  lastCC = null;
  ensureChunks();
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
function ensureChunks() {
  const pcx = Math.round(P.pos.x / CHUNK), pcz = Math.round(P.pos.z / CHUNK);
  const cc = pcx + ',' + pcz;
  if (cc === lastCC) return;
  lastCC = cc;
  const keep = new Set();
  for (let cx = pcx - VIEW; cx <= pcx + VIEW; cx++)
    for (let cz = pcz - VIEW; cz <= pcz + VIEW; cz++) {
      const key = cx + ',' + cz;
      keep.add(key);
      if (!chunkMap.has(key)) { chunkMap.set(key, buildChunk(cx, cz)); _chunkWer++; }
    }
  for (const [key, ch] of chunkMap) {
    if (keep.has(key)) continue;
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

// ============================== SKRZYNIE ==============================
const chests = [];        // {mesh, pos, opened, t}
let chestMats = null;     // 4 klatki chest0..3
function placeChest(c) {
  const s = landSpot(16, 70) || { x: P.pos.x + 20, z: P.pos.z + 20 };
  c.pos.set(s.x, 0, s.z);
  c.opened = false; c.t = 0;
  c.mesh.material = chestMats[0];
  c.mesh.position.set(s.x, terrainH(s.x, s.z) - 0.02, s.z);
}
function spawnChests(n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(unitGeo, chestMats[0]);
    m.scale.set(1.1, 1.1, 1);
    scene.add(m);
    const c = { mesh: m, pos: new THREE.Vector3(), opened: false, t: 0 };
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
  if (roll < 0.14 && !hasDjump()) {   // 🦘🦘 PODWÓJNY SKOK (na ten bieg)
    P.runDjump = true;
    toastBuff(T('PODWÓJNY SKOK do końca biegu!', 'DOUBLE JUMP for the rest of the run!'));
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2500);
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
const wchest = { mesh: null, ring: null, pos: new THREE.Vector3(), active: false, t: 0, wait: 0 };
function spawnWeaponChest() {
  const s = landSpot(22, 60);
  if (!s) { wchest.wait = 2; return; }
  wchest.pos.set(s.x, 0, s.z);
  wchest.mesh.position.set(s.x, terrainH(s.x, s.z) - 0.02, s.z);
  wchest.mesh.material = chestMats[0];
  wchest.ring.position.set(s.x, terrainH(s.x, s.z) + 0.07, s.z);
  wchest.mesh.visible = wchest.ring.visible = true;
  wchest.active = true;
  toastBuff(T('NOWA BROŃ czeka w złotej skrzyni — idź za strzałką!', 'NEW WEAPON in the golden crate — follow the arrow!'));   // EN ≤ 50 znaków: #buff ma nowrap, a 375 px to granica
  setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2200);
}
function updateWeaponChest(dt) {
  const arrow = document.getElementById('wArrow');
  if (!wchest.active) {
    arrow.style.display = 'none';
    wchest.wait -= dt;
    if (wchest.wait <= 0) spawnWeaponChest();
    return;
  }
  wchest.t += dt;
  wchest.mesh.rotation.y = camYaw;
  wchest.mesh.position.y = terrainH(wchest.pos.x, wchest.pos.z) + 0.1 + Math.sin(wchest.t * 2.2) * 0.12;
  wchest.ring.scale.setScalar(3.4 + Math.sin(wchest.t * 3) * 0.5);
  const d = wchest.pos.distanceTo(P.pos);
  if (d < 1.6) {                                   // ZEBRANA
    wchest.active = false;
    wchest.mesh.visible = wchest.ring.visible = false;
    wchest.wait = 25 + Math.random() * 20;
    G.shake = Math.max(G.shake, 0.2);
    AUDIO.sfx('zlota');
    novaRing(wchest.pos.x, wchest.pos.z, 3);
    META.st.chests++; saveMeta();
    pchnijOverlay(P.weapons.length < 3 ? openNewWeapon : openSwap);
    arrow.style.display = 'none';
    return;
  }
  // strzałka: rzut kierunku do skrzyni na osie EKRANU (kamera ma yaw = camYaw)
  const dx = wchest.pos.x - P.pos.x, dz = wchest.pos.z - P.pos.z;
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
// Sprite garnka od właściciela (biały garnek w czerwone kropki, para, ogień pod spodem).
// `garnekTexture()` niżej zostaje jako awaryjny — ten sam wzorzec co salata/karabin.
let garnekImgMat = null;
async function ladujGarnek() {
  try { garnekImgMat = (await flatMat('assets/garnek_nonny.png')).mat; }
  catch { garnekImgMat = null; }
}
function garnekTexture() {
  const b = [];
  const r = (x, y, w, h, kol) => b.push([x, y, w, h, kol]);
  r(9, 1, 3, 3, '#e4ecf5'); r(15, 0, 4, 3, '#d3dee9'); r(12, 4, 2, 2, '#e4ecf5');   // para
  r(18, 4, 2, 2, '#d3dee9');
  r(4, 8, 22, 3, '#6b727d');                                                        // rant
  r(6, 10, 18, 2, '#8ec44f');                                                       // zawartość
  r(9, 9, 4, 2, '#b6e26a'); r(16, 9, 3, 2, '#b6e26a');                              // bąble
  for (let i = 0; i < 11; i++)                                                      // brzuch (schodki)
    r(5 + Math.floor(i * 0.32), 11 + i, 20 - Math.floor(i * 0.64), 1, i % 4 === 3 ? '#4a4f58' : '#3b4048');
  r(1, 11, 3, 3, '#6b727d'); r(26, 11, 3, 3, '#6b727d');                            // uchwyty
  r(9, 22, 12, 3, '#ff8a2a'); r(12, 24, 7, 2, '#ffd75e');                           // ogień pod garnkiem
  return pixTex(30, 27, b);
}
function witrynaTexture() {
  const b = [];
  const r = (x, y, w, h, kol) => b.push([x, y, w, h, kol]);
  r(2, 2, 24, 26, '#c8ced6');                          // obudowa
  r(4, 4, 20, 21, '#69a8c9');                          // szyba
  r(5, 5, 4, 19, '#8fc6de');                           // refleks
  r(4, 11, 20, 2, '#aeb6c0'); r(4, 18, 20, 2, '#aeb6c0');   // półki
  r(6, 7, 4, 4, '#e05a5a'); r(12, 7, 3, 4, '#f2c14a'); r(18, 8, 4, 3, '#8ec44f');
  r(6, 14, 3, 4, '#f0efe6'); r(11, 14, 5, 4, '#d98f3c'); r(19, 15, 3, 3, '#b06bd6');
  r(7, 21, 5, 3, '#7ab648'); r(15, 21, 6, 3, '#e0873c');
  r(2, 27, 24, 4, '#8f97a1');                          // podstawa
  r(9, 28, 10, 2, '#6b727d');
  return pixTex(28, 32, b);
}
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
let garnekTex = null, witrynaTex = null;
// wygląd zależy od mapy — garnki powstają raz przy boocie, więc teksturę podmieniamy w setMap
function ustawWygladGarnkow(key) {
  if (!garnekTex) { garnekTex = garnekTexture(); witrynaTex = witrynaTexture(); }
  const indoor = MAPS[key] && MAPS[key].indoor;
  // na Łąkach sprite właściciela, jeśli się wczytał; w markecie proceduralna witryna
  const tex = indoor ? witrynaTex : ((garnekImgMat && garnekImgMat.map) || garnekTex);
  const obr = tex.image.width / tex.image.height;
  for (const t of totems) {
    t.mat.map = tex;
    t.mat.needsUpdate = true;
    t.mesh.scale.set(2.2 * obr, 2.2, 1);
  }
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
  if (!garnekTex) { garnekTex = garnekTexture(); witrynaTex = witrynaTexture(); }
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: garnekTex, transparent: true,
      alphaTest: 0.4, side: THREE.DoubleSide });
    const m = new THREE.Mesh(unitGeo, mat);
    m.scale.set(2.2 * (garnekTex.image.width / garnekTex.image.height), 2.2, 1);
    scene.add(m);
    const ring = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false }));
    ring.scale.set(3, 1, 3);
    scene.add(ring);
    const t = { mesh: m, ring, pos: new THREE.Vector3(), cd: 0, mat };
    placeTotem(t);
    totems.push(t);
  }
}
function placeTotem(t) {
  const s = landSpot(18, 70) || { x: P.pos.x - 20, z: P.pos.z - 20 };
  t.pos.set(s.x, 0, s.z);
  t.mesh.position.set(s.x, terrainH(s.x, s.z) - 0.02, s.z);
  t.ring.position.set(s.x, terrainH(s.x, s.z) + 0.06, s.z);
  t.cd = 0; t.mat.opacity = 1; t.ring.visible = true;
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
  toastBuff(T('KARABIN! Wciśnij R, gdy będzie gęsto', 'RIFLE! Press R when it gets thick'), 'celownik');
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
  if (F.on) { F.t = Math.min(F.max, F.t + 8); toastBuff(T('KARABIN DOŁADOWANY', 'RIFLE TOPPED UP')); return; }
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
    if (!dead) for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying || s.hit.has(e)) continue;
      const rr = KARABIN_R + (e.T.boss ? 0.9 : 0);
      const dx = px - e.pos.x, dz = pz - e.pos.z, dy = py - (e.ty + 0.8);
      if (dx * dx + dz * dz + dy * dy > rr * rr) continue;
      s.hit.add(e);
      spark(e.pos.x, e.ty + 1.2, e.pos.z);
      zadajDmg(e, KARABIN_DMG * dmgAll(), { col: '#fff3b0', sfx: 'traf', kb: s.dir, kbSila: 1.0 });
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

// ============================== FALA UDERZENIOWA (nova) ==============================
let ringMat = null;
function novaRing(x, z, rMax) {
  const m = new THREE.Object3D();                  // E1: instancja w `pulaFala` (krycie w `a`)
  m.position.set(x, terrainH(x, z) + 0.1, z);
  G.rings.push({ mesh: m, t: 0, rMax, a: 1 });
}
function nova(x, z, r, dmg) {
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
      zadajDmg(e, dmg, { col: '#ffb56e', sc: 0.85, kb: _kbV.set(dx, 0, dz), kbSila: 4.5, noPop: dmg <= 0 });
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
      // siedmiometrowego regału nie ruszałaby go wcale
      const dx = Math.max(0, Math.abs(x - s.x) - s.len / 2);
      const dz = Math.max(0, Math.abs(z - s.z) - 1.1);
      if (dx * dx + dz * dz > r * r) continue;
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
      ustawRegal(s, 0);                              // wraca pionowo, górne półki widoczne
      s.solid.z = s.z; s.solid.hl = 1.1; s.solid.hw = s.len / 2;
      s.solid.top = s.g0 + SHELF_H + 0.16;
    }
  }
}
function updatePadajace(dt) {
  for (let i = G.padajace.length - 1; i >= 0; i--) {
    const s = G.padajace[i];
    if (!s.inst || !s.inst.korpus.parent) { G.padajace.splice(i, 1); continue; }  // chunk zniknął
    s.t += dt;
    if (s.t < 0) continue;                                        // czeka na swoją kolej (domino)
    const k = Math.min(1, s.t / PAD_T);
    const kat = (Math.PI / 2) * k * k;                            // przyspiesza jak pod grawitacją
    ustawRegal(s, kat);                                           // obrót zapisany w macierzy instancji
    // ŻADNEGO PODNOSZENIA GRUPY. Pivot siedzi na KRAWĘDZI podstawy, a dzieci są
    // odsunięte o -kier*0.8, więc korpus leży w lokalnym Z od -1.6 do 0 i po
    // obrocie ląduje w Y od 0 do 1.6 — cały NAD posadzką. Wcześniejsze
    // podnoszenie o 0.45 sprawiało, że wrak lewitował, a gracz stał 0.8 j.
    // pod płaszczyzną desek (wystawały mu tylko liście).
    if (!s.zadal && k > 0.55) {                                   // moment uderzenia w podłogę
      s.zadal = true;
      // Obrażenia PRZYCZEPIONE DO CZASU BIEGU, nie do buildu. Zmierzone: przy
      // `6*dmgAll()+4` regał dawał stale 12-20 obrażeń, a HP szeregowego rośnie
      // 4.8 → 15.8 → 37.5 (1/5/10 min), więc od 4. minuty przestawał kogokolwiek
      // zabijać — dokładnie wtedy, gdy market jest najbardziej zapchany.
      // Regał to element mapy, a nie broń: jego siła nie ma zależeć od tego,
      // jaką broń ma gracz. 8 × hpScale() = zawsze 2.7 szeregowego, nigdy elita.
      const dmg = 8 * hpScale();
      let przygnieceni = 0;
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (e.dying) continue;
        if (Math.abs(e.pos.x - s.x) > s.len / 2 + 0.7) continue;
        const wzdluz = (e.pos.z - s.pivotZ) * s.kier;             // leży od pivotu w stronę upadku
        if (wzdluz < -0.7 || wzdluz > SHELF_H + 0.7) continue;
        e.hp -= dmg;
        e.kb.set(0, 0, s.kier * 3);
        dmgPop(e.pos.x, e.ty + 0.6, e.pos.z, dmgNum(dmg), '#ffd75e', 1.5);
        przygnieceni++;
        if (e.hp <= 0) killEnemy(e, j);
      }
      // NAGRODA za dobre ustawienie regału — bez niej przewrócenie nie dawało
      // graczowi nic mierzalnego poza hałasem
      if (przygnieceni >= 3) {
        dmgPop(s.x, s.g0 + 2.2, s.pivotZ, T('ROZWALKA x', 'PILE-UP x') + przygnieceni, '#ffd75e', 2.2);
        G.coins.push(makeCoin(s.x, s.pivotZ + s.kier * 1.2, 3));
        G.hitstop = Math.max(G.hitstop, 0.06);
      }
      // gracz też dostanie, jeśli stoi w linii upadku — regały nie wybierają
      if (Math.abs(P.pos.x - s.x) < s.len / 2 + 0.6 && P.iframes <= 0 && !P.airborne) {
        const wzdluz = (P.pos.z - s.pivotZ) * s.kier;
        if (wzdluz > -0.6 && wzdluz < SHELF_H + 0.6 && !ciosPochloniety()) {
          P.hp -= 1; P.iframes = 1.1; drawHearts(); AUDIO.sfx('hurt'); G.shake = 0.5;
          if (P.hp <= 0) startDeath();
        }
      }
      AUDIO.sfx('wybuch');
      G.shake = Math.max(G.shake, 0.4);
      G.hitstop = Math.max(G.hitstop, 0.05);
      okruchy(s.x, s.g0 + 0.5, s.pivotZ + s.kier * SHELF_H * 0.5, 0xb98a4e, 8);   // drewno
      // rozsypany TOWAR — bez tego przewrócony regał to sama deska
      for (const kol of [0xd94f4f, 0x4f8fd9, 0xf2c14a])
        okruchy(s.x + (Math.random() - 0.5) * s.len, s.g0 + 1.2, s.pivotZ, kol, 3);
      puff(s.x, s.g0 + 0.4, s.pivotZ + s.kier * SHELF_H * 0.5, 0xd8c49a, 3.5);
      novaRing(s.x, s.pivotZ + s.kier * SHELF_H * 0.5, 3);
      // DOMINO: koniec leżącego regału trąca to, co tam stoi (para plecami do siebie)
      przewrocRegaly(s.x, s.pivotZ + s.kier * SHELF_H, 1.0, 0.08);
    }
    if (k >= 1) {
      s.stan = 'lezy';
      s.tLezy = 0;
      // Dwie półki po obrocie STAJĄ PIONOWO i wystają na 2.15 j. — leżący regał
      // wyglądał przez to jak drabina, a nie jak wrak. Chowamy je; zostaje korpus
      // (płaszczyzna 1.6) i blat, który robi się ładnym progiem na końcu.
      ustawRegal(s, Math.PI / 2);                    // `stan` już 'lezy' → górne półki znikają
      // Bryła kolizji z pionowej ściany (top 2.46) robi się RUMOWISKIEM, na które
      // wskoczysz jednym skokiem. Szczyt MUSI zgadzać się z płaszczyzną korpusu
      // (1.6), inaczej stoi się w powietrzu albo po pas w deskach. 1.55 = ledwo
      // pod deskami, a apeks skoku (1.461) + tolerancja 0.25 nadal łapie wejście.
      s.solid.z = s.pivotZ + s.kier * 1.23;
      s.solid.hl = 1.23;
      s.solid.hw = s.len / 2 + 0.15;
      s.solid.top = s.g0 + 1.55;
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
  if (G.kino > 0) { G.kino -= dtReal; dt *= 0.55; }
  refreshSpriteTilt();                             // pochylenie billboardów liczymy raz na klatkę
  G.time += dt;
  document.getElementById('timer').textContent = fmtTime(G.time);
  // komunikat o wzroście poziomu zagrożenia
  const tr = tier();
  if (tr !== G.tier) {
    G.tier = tr;
    document.getElementById('tier').innerHTML = ico('ostrzezenie', 14) + T(' ZAGROŻENIE ', ' THREAT ') + tr;
    if (tr > 1) {
      AUDIO.sfx('zagrozenie');
      toastBuff(T('POZIOM ZAGROŻENIA ', 'THREAT LEVEL ') + tr
        + (dmgScale() > 1 ? T(' — wrogowie biją mocniej!', ' — enemies hit harder!') : ''));
      setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 2200);
      G.shake = Math.max(G.shake, 0.25);
    }
  }

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
        nova(P.pos.x, P.pos.z, stompRad(stompLvl()), stompDmg(stompLvl()));
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

  // ---- spawner: krzywa trudności (1 min ~lekko, 4 min = ~4× więcej naraz) ----
  const min = G.time / 60;
  G.spawnT -= dt;
  const interval = Math.max(0.11, 1.3 / (1 + min * 0.55) / (1 + 0.08 * klatwa()));   // 1.3 s → 0.28 s w 4. min
  const CAP = 500;
  if (!STRES && G.spawnT <= 0 && G.enemies.length < CAP) {           // STRES (DEV) = własny dosyp
    G.spawnT = interval;
    const batch = Math.round(1 + min * 1.6);                     // 4. min: ~7 na raz
    // TIMELINE wg biblii: chipsetti od 0:00, marshmallini 1:00, gummini 2:00,
    // friesetti 3:00, sodino 4:00, lollini 4:30
    const pula = ['chipsetti'];
    if (G.time > 60) pula.push('marshmallini');
    if (G.time > 120) pula.push('gummini');
    if (G.time > 180) pula.push('friesetti');
    if (G.time > 240) pula.push('sodino');
    if (G.time > 270) pula.push('lollini');
    // Ketchupino wchodzi RZADKO i pojedynczo (elita wg biblii), nie do zwykłej puli
    if (G.time > 180 && Math.random() < 0.035) spawnEnemy('ketchupino');
    for (let b = 0; b < batch && G.enemies.length < CAP; b++) {
      // chipsetti zawsze dominują (szeregowi), reszta doprawia hordę
      const type = Math.random() < 0.45 ? 'chipsetti' : pula[Math.floor(Math.random() * pula.length)];
      spawnEnemy(type);
    }
  }
  // FALA OKRĄŻAJĄCA co 30 s od 1. minuty: pierścień wrogów ZE WSZYSTKICH STRON
  if (!STRES && G.time > 60 && G.time > G.ringAt) {
    G.ringAt = G.time + 30;
    const n = Math.round(10 + min * 5);
    const typy = G.time > 180 ? ['chipsetti', 'gummini', 'friesetti', 'marshmallini']
                              : ['chipsetti', 'chipsetti', 'marshmallini'];
    for (let k = 0; k < n && G.enemies.length < CAP; k++) {
      spawnEnemy(typy[Math.floor(Math.random() * typy.length)], (k / n) * Math.PI * 2);
    }
    toastBuff(T('FALA OKRĄŻAJĄCA — biegną ze wszystkich stron!', 'ENCIRCLING WAVE — they come from every side!'));
    setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 1600);
  }
  if (!STRES && G.time > G.bossAt) {                             // bossy co 2 min, coraz więcej
    G.bossAt += 120;
    const ile = 1 + Math.floor(G.time / 300);
    for (let b = 0; b < ile; b++) spawnEnemy('boss');
    wejscieBossa();
    AUDIO.sfx('boss');                                           // niski róg = „coś dużego weszło"
    AUDIO.bossOn();                                              // muzyka przełącza się na walkę z bossem
  }

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
    if (G.turrets.length) {
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
    let es = e.T.speed * (e.elite ? 0.85 : 1) * spdScale();
    // BOSSA NIE DA SIE ZGUBIC (decyzja wlasciciela: „przeciwnik, ktorego trzeba pokonac").
    // Prowadzi horde (4.4 > Friesetti 4.0), a z bardzo daleka jeszcze docisnie —
    // wiec odejscie na drugi koniec mapy nie jest odpowiedzia na walke z Donem.
    if (e.T.boss && d > 26) es *= 1.35;
    if (e.stun > 0) { e.stun -= dt; es = 0; }        // ogluszenie z ewolucji "DZIS NIE WEJDZIESZ"
    if (e.ty < wodaY(e.pos.x, e.pos.z) - 0.04) es *= 0.7;   // woda spowalnia też ich
    if (MAPS[mapKey].rzeki) {                           // Wąwozy: błoto i nurt działają też na hordę
      es *= 1 - TW.wspolczynnikBlota(e.pos.x, e.pos.z) * BLOTO_WROG;
      TW.spychanieNurtu(e.pos.x, e.pos.z, _pwE);
      if (_pwE[0] || _pwE[1]) { e.pos.x += _pwE[0] * NURT_WROG * dt; e.pos.z += _pwE[1] * NURT_WROG * dt; }
    }
    if (G.buff.key === 'slow') es *= 0.6;
    if (G.buff.key === 'mroz') es = 0;                  // MROŻONKI: horda staje na kilka sekund
    // ---- SZARŻA FRIESETTIEGO: tell 0.6 s (przysiad + okrąg + „!"), potem ×3 po PROSTEJ, potem ogłuszenie ----
    // Do 03.09 „szarża" to było samo `speed: 4.0` — zero windupu, zero tellu, nic do uniknięcia.
    // Kierunek zamrażamy w chwili startu: krok w bok i frytka przelatuje obok, po czym leży
    // ogłuszona 1.2 s — to jest okno na cios, którego dotąd nie było.
    if (e.T.szarzuje) {
      e.szarzaCd = (e.szarzaCd == null ? 1.5 : e.szarzaCd) - dt;
      if (!e.faz && e.szarzaCd <= 0 && es > 0 && d > FRIES_MIN && d < FRIES_MAX && P.y - e.ty < 1.2) {
        e.faz = 'tell'; e.fazT = FRIES_TELEGRAF;
        novaRing(e.pos.x, e.pos.z, 1.1);                                   // okrąg pod stopami
        dmgPop(e.pos.x, e.ty + 0.6, e.pos.z, '!', '#f6cd51', 1.4);
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
    if (e.T.artyleria) {
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
    if (!e.T.bezKb) {                                  // Gummini są odporne na odrzut
      e.pos.addScaledVector(e.kb, dt * 8);
      e.kb.multiplyScalar(Math.max(0, 1 - dt * 10));
    } else e.kb.set(0, 0, 0);
    if (e.T.wiruje) {
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
    if (e.T.kamikaze && d < 2.2 && !e.zapalony) {                 // Sodino: syczy i wybucha
      e.zapalony = true; e.lont = 1.0;
    }
    if (e.zapalony) {
      e.lont -= dt;
      e.bb.mesh.scale.setScalar(e.bb.h * (1 + Math.sin(G.time * 30) * 0.12));
      if (e.lont <= 0) {
        nova(e.pos.x, e.pos.z, 2.6, 0);                           // wybuch rani TYLKO gracza
        if (e.pos.distanceTo(P.pos) < 2.6 && P.iframes <= 0 && P.y - e.ty < 1.2 && !ciosPochloniety()) {
          P.hp -= 1; P.iframes = 0.9; drawHearts(); G.shake = 0.4; AUDIO.sfx('hurt');
          if (P.hp <= 0) { startDeath(); }
        }
        dmgPop(e.pos.x, e.ty + 0.8, e.pos.z, T('BUM!', 'BOOM!'), '#ff9d3f', 1.6);
        killEnemy(e, i);
        continue;
      }
    }

    // ---- kolizja, SKOKI i WSPINACZKA na półki ----
    const blockTop = solveSolids(e.pos, 0.35, e.ty);
    const eGround = supportY(e.pos.x, e.pos.z, e.ty);
    e.jumpCd -= dt;
    if (e.vy !== 0) {                                    // w locie (po skoku)
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
    } else if (e.T.skacze) {
      e.climbing = false;
      const podskok = Math.abs(Math.sin(G.time * 4.5 + e.faza)) * 0.75;   // ciągłe odbijanie
      e.ty = eGround + podskok;
    } else {
      e.climbing = false;
      // co jakiś czas podskakują z radości (i przeskakują drobne nierówności)
      if (e.jumpCd <= 0 && d < 22 && Math.random() < 0.35 * dt) { e.vy = 5.4; e.jumpCd = 2.5 + Math.random() * 3; }
      if (eGround < e.ty - 0.05) e.ty = Math.max(eGround, e.ty - 9 * dt);  // schodzenie/spadanie
      else e.ty = eGround;
    }
    e.bb.facing = faceAngle(to.x, to.z);
    e.orbCd -= dt;
    e.bb.update(dt, e.pos, e.ty);
    if (e.ring) e.ring.position.set(e.pos.x, e.ty + 0.06, e.pos.z);
    // Lollini w fazie wirowania sięga o LOLLINI_TARCZA dalej — „wolny, ale nie właź pod tarczę"
    // było dotąd tylko podpowiedzią na ekranie ładowania, w kodzie kręcił się wyłącznie sprite.
    const tarcza = e.wirujeTeraz ? LOLLINI_TARCZA : 0;
    if (d < 0.9 + (e.T.boss ? 0.8 : 0) + tarcza && P.iframes <= 0 && P.y - e.ty < 1.0 && !ciosPochloniety()) {
      const tarczaLvl = P.passives.tarcza || 0;
      if (tarczaLvl > 0 && P.shieldCd <= 0) {           // 🛡️ tarcza zjada cios
        P.shieldCd = [30, 24, 18][tarczaLvl - 1];
        P.iframes = 0.9;
        AUDIO.sfx('tarcza');
        toastBuff(T('TARCZA zablokowała cios!', 'The SHIELD took that hit!'));
        setTimeout(() => { if (!G.buff.key) document.getElementById('buff').style.opacity = 0; }, 1500);
        novaRing(P.pos.x, P.pos.z, 2);
      } else {
        P.hp -= e.T.dmg * dmgScale(); P.iframes = 0.9;      // boss tez bije mocniej z czasem
        drawHearts();
        AUDIO.sfx('hurt');
        G.shake = 0.35;
        if (tarcza) {                                       // TARCZA PILARSKA wyrzuca gracza z zasięgu
          const kx = P.pos.x - e.pos.x, kz = P.pos.z - e.pos.z, kl = Math.hypot(kx, kz) || 1;
          P.kbx = kx / kl * LOLLINI_ODRZUT; P.kbz = kz / kl * LOLLINI_ODRZUT;
          G.shake = 0.5;
        }
        const v = document.getElementById('vign');
        v.style.opacity = 1; setTimeout(() => v.style.opacity = 0, 180);
        if (P.hp <= 0) return startDeath();
      }
    }
  }

  // ---- BRONIE: tick każdej posiadanej ----
  for (const w of P.weapons) WEAPONS[w.key].tick(w, dt);
  odswiezStawBtn();                      // PO tickach — inaczej licznik ładunków jest o klatkę wstecz

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
    if (!dead) for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying || s.hit.has(e)) continue;
      const rr = e.T.boss ? 1.4 : 0.75;
      const dx = s.mesh.position.x - e.pos.x, dz = s.mesh.position.z - e.pos.z;
      if (dx * dx + dz * dz < rr * rr) {
        s.hit.add(e);
        spark(e.pos.x, e.ty + 1.1, e.pos.z);
        const c = zadajDmg(e, (s.dmg || 1) * dmgAll(), { col: '#ffe066', sfx: 'traf', kb: s.dir, kbSila: 1.6 });
        // obrażenia BAZOWE (bez krytyka pocisku) — nova rzuca krytyk sama; z `c.dmg`
        // wybuch mógł wyjść ×9 (recenzja 03.09)
        if (P.evo.meteor) boomQ.push({ x: e.pos.x, z: e.pos.z, dmg: (s.dmg || 1) * dmgAll() * 0.6 });
        if (s.pierce-- <= 0) { dead = true; break; }
      }
    }
    if (dead) { scene.remove(s.mesh); G.shots.splice(i, 1); }
  }
  for (const b of boomQ) nova(b.x, b.z, 1.8, b.dmg);

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
      nova(x, z, L.r || (2 + 0.3 * L.lvl), (L.dmg || (2 + 0.6 * L.lvl)) * dmgAll());
      G.shake = Math.max(G.shake, L.dmg ? 0.05 : 0.1);
    }
  }

  // ---- radio-bumerangi (tam i z powrotem) ----
  for (let i = G.boomers.length - 1; i >= 0; i--) {
    const B = G.boomers[i]; B.t += dt;
    const k = B.t / B.dur;
    if (k >= 1) { scene.remove(B.mesh); G.boomers.splice(i, 1); continue; }
    const r = Math.sin(k * Math.PI) * B.dist;          // wylot i powrót
    const x = P.pos.x + B.dir.x * r, z = P.pos.z + B.dir.z * r;
    B.mesh.position.set(x, terrainH(x, z) + 1.0, z);
    B.mesh.rotation.set(0, camYaw, B.t * 12);
    if (k > 0.55 && B.hit.size) B.hit.clear();          // w drodze powrotnej bije ponownie
    for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.dying || B.hit.has(e)) continue;
      const dx = x - e.pos.x, dz = z - e.pos.z;
      if (dx * dx + dz * dz < 1.1) {
        B.hit.add(e);
        spark(e.pos.x, e.ty + 1.0, e.pos.z);
        zadajDmg(e, (2 + 0.5 * B.lvl) * dmgAll(), { col: '#d9b3ff', kb: _kbV.set(-dx, 0, -dz), kbSila: 2.4 });
      }
    }
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
      nova(K.pos.x, K.pos.z, promien, sila);
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
  for (const c of chests) {
    c.mesh.rotation.y = camYaw;
    if (!c.opened) {
      const cd = c.pos.distanceTo(P.pos);
      if (cd < 1.3) {
        c.opened = true; c.t = 0;
        chestReward(c);
        G.shake = Math.max(G.shake, 0.15);
      } else if (cd > 95) placeChest(c);      // mapa nieskończona — skrzynia goni gracza
    } else {
      c.t += dt;
      const f = Math.min(3, Math.floor(c.t * 8));
      c.mesh.material = chestMats[f];
      if (c.t > 45) placeChest(c);            // respawn gdzie indziej
    }
  }

  updateWeaponChest(dt);
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
                     dmg: 2.2 + 0.5 * r.lvl, wiruje: sx >= 0 ? -1 : 1 });
    }
    AUDIO.sfx('kryt');
  }
  if (plamy.length) updatePlamy(dt);

  // ---- totemy ----
  for (const t of totems) {
    t.mesh.rotation.y = camYaw;
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
        t.cd = 45;
        novaRing(t.pos.x, t.pos.z, 4);
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
    g.mesh.position.set(g.pos.x, terrainH(g.pos.x, g.pos.z) + 0.25 + Math.sin(g.t * 4) * 0.12, g.pos.z);
    g.mesh.rotation.set(0, camYaw, g.t * 2);
    // porzucone dropy znikaja: mapa jest nieskonczona, wiec bez tego wszystko
    // zostawione za plecami zostaje na zawsze (zmierzone: 299 pigulek po 4:43)
    if (g.t > 45 && d > mag * 3) { scene.remove(g.mesh); G.gems.splice(i, 1); continue; }
    if (d < 0.7) {
      P.xp += g.val;
      AUDIO.sfx('xp');
      scene.remove(g.mesh); G.gems.splice(i, 1);
      // WHILE, nie IF: jedna pigulka moze dac wiecej niz jeden poziom, a przy
      // Wielkim Magnesie pigulki przychodza kiszkami po kilkanascie w jednej klatce.
      // Kazdy awans wchodzi do KOLEJKI, wiec zaden zestaw kart nie przepada.
      while (!STRES && P.xp >= P.xpNeed) {          // STRES (DEV): bez kart, bo pauzowałyby pomiar
        P.xp -= P.xpNeed; P.lvl++;
        P.xpNeed = xpDoNast(P.lvl);
        document.getElementById('lvl').textContent = T('POZIOM ', 'LEVEL ') + P.lvl;
        AUDIO.sfx('awans');
        AUDIO.event('awans');
        // 0.20 -> 0.10: wlasciciel zglosil, ze blysk „za mocno" wchodzi w oko, a przy
        // awansie co ~10 s na starcie biegu miga za czesto. Ewolucja broni zostaje
        // na 0.55, bo to moment raz na kilka minut.
        blysk('#ffffff', 0.10);
        pchnijOverlay(showCards);
      }
      document.getElementById('xpbar').style.width = (P.xp / P.xpNeed * 100) + '%';
    }
  }
  for (let i = G.coins.length - 1; i >= 0; i--) {
    const c = G.coins[i]; c.t += dt;
    const d = c.pos.distanceTo(P.pos);
    if (d < mag) c.pos.addScaledVector(_doGracza.copy(P.pos).sub(c.pos).normalize(), Math.max(14 - d, 8) * dt);
    c.mesh.position.set(c.pos.x, terrainH(c.pos.x, c.pos.z) + 0.3 + Math.sin(c.t * 5) * 0.1, c.pos.z);
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
      P.hp++; drawHearts();
      AUDIO.sfx('serce');
      dmgPop(P.pos.x, pTy + 0.6, P.pos.z, T('+SERCE', '+HEART'), '#ff8080', 1.4);
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
  odswiezKarabinBtn();
  G.shake = 0.9;
  AUDIO.sfx('koniec');
  document.getElementById('vign').style.opacity = 1;
  dmgPop(P.pos.x, P.y + 1.2, P.pos.z, T('KONIEC!', 'GAME OVER!'), '#ff4a4a', 2.4);
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
  if (t > 1.8) { G.dying = false; gameOver(); }
}

// Rozliczenie biegu w JEDNYM miejscu. Wcześniej monety dopisywał tylko
// `gameOver()`, więc wyjście do menu z pauzy po długim biegu kasowało cały
// zarobek — i to prawdopodobnie stąd brało się część odczucia „monet jest za mało".
function rozliczBieg() {
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
    const k = Math.min(1, (teraz - start) / T);
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
function gameOver() {
  winieta(false); pasy(false);
  G.over = true; G.running = false;
  AUDIO.endRun();                                  // koniec biegu = powrót do motywu głównego
  document.getElementById('vign').style.opacity = 0;
  playerBB.mesh.rotation.z = 0;
  rozliczBieg();
  const s = META.st;
  // PIERWSZA PRZEGRANA MA COŚ DAWAĆ. Brotato odblokowuje za nią postać („Chunky"),
  // u nas nie ma jeszcze wolnego arkusza, więc idzie broń: pierwsza śmierć =
  // Piorun za darmo. Puste „KONIEC" po pierwszym biegu to najgorszy moment,
  // żeby gracz nie miał po co kliknąć „JESZCZE RAZ".
  let prezent = '';
  if (!s.runs && !META.unlocked.piorun) {
    META.unlocked.piorun = 1;
    prezent = `<br><b style="color:#7ee7ff">${ico('pioruny', 18)} ${T('PIERWSZA PORAŻKA — PIORUN ODBLOKOWANY NA STAŁE!', 'FIRST DEFEAT — THUNDERBOLT UNLOCKED FOR GOOD!')}</b>`;
  }
  s.runs++; s.time += G.time; s.lvl += P.lvl - 1;
  STATY.zdarzenie('run-end/smierc/min-' + kubelekMinut(G.time),
    'Koniec biegu (śmierć): ' + fmtTime(G.time) + ', poziom ' + P.lvl + ', ' + G.kills + ' zabójstw');
  const rekordCzasu = G.time > s.best;          // PRZED aktualizacja! inaczej zawsze true
  if (rekordCzasu) s.best = G.time;
  if (G.kills > s.bestKills) s.bestKills = G.kills;
  saveMeta(); renderShop(); renderStats(); renderBestiary();
  const rekord = rekordCzasu;                   // było `G.time >= s.best` PO aktualizacji = zawsze true
  document.getElementById('overStats').innerHTML =
    `${T('Przetrwano', 'Survived')}: <b><i data-licz="0" data-czas="${G.time.toFixed(1)}">0:00</i></b> · ` +
    `${T('Pokonano', 'Defeated')}: <b><i data-licz="${G.kills}">0</i></b> · ${T('Poziom', 'Level')}: <b><i data-licz="${P.lvl}">0</i></b><br>` +
    `${T('Zebrano', 'Collected')}: <b>${ico('moneta',15)} <i data-licz="${G.zebrane}">0</i></b> (${T('łącznie', 'total')} ${ico('moneta',15)} ${META.coins})` +
    prezent +
    (rekord ? '<br><b class="pieczatka" style="color:#ffd75e">' + ico('puchar',18) + T(' NOWY REKORD CZASU!', ' NEW TIME RECORD!') + '</b>' : '');
  document.getElementById('overOv').style.display = 'flex';
  tickerLiczb(document.getElementById('overStats'));
  if (rekord) deszczMonet(28);
  document.getElementById('wArrow').style.display = 'none';
}
// ---- PAUZA ----
function togglePause(on) {
  if (!G.running) return;
  G.paused = on;
  if (on) puscMysz();                              // na pauzie gracz musi widziec kursor
  document.getElementById('pauseOv').style.display = on ? 'flex' : 'none';
  odswiezKarabinBtn();                             // przycisk karabinu nie może wisieć nad pauzą
  if (on) {
    document.getElementById('pauseStats').innerHTML =
      `<p>${T('Czas', 'Time')}: <b>${fmtTime(G.time)}</b> · ${T('Zabici', 'Kills')}: <b>${G.kills}</b> · ${T('Poziom', 'Level')}: <b>${P.lvl}</b> · ${ico('moneta',15)} <b>${G.runCoins}</b></p>` +
      `<p>${T('Postać', 'Character')}: <b>${CHARS[charKey].nm}</b> · ${T('Mapa', 'Map')}: <b>${MAPS[mapKey].nm}</b></p>` +
      `<p>${T('Bronie', 'Weapons')}: ${P.weapons.map(w => ico(WEAPONS[w.key].ico, 18) + ' ' + WEAPONS[w.key].nm + ' ' + w.lvl).join(' · ')}</p>` +
      jakGracHTML();
  }
}
// „JAK GRAĆ" W PAUZIE (życzenie właściciela 18.09 zamiast podpowiedzi na dole ekranu):
// wiersz na akcję, kapsel z przyciskiem pada gdy pad jest w użyciu, inaczej klawisz.
// Pokazuje tylko to, co gracz ma w tym biegu (karabin, wieżyczka, smród).
function jakGracHTML() {
  // pad = aktywny ALBO fizycznie podłączony (PAD.rodzina ma domyślną wartość, więc nie jest dowodem)
  const pad = PAD.on || [...(navigator.getGamepads ? navigator.getGamepads() : [])].some(p => p && p.connected !== false);
  const kl = t => `<b class="gpk sh">${t}</b>`;
  const w = [
    [T('Ruch', 'Move'), pad ? kl('L') + ' ' + T('drążek', 'stick') : kl('WASD')],
    [T('Kamera', 'Camera'), pad ? kl('R') + ' ' + T('drążek', 'stick') : kl(T('MYSZ', 'MOUSE')) + ' ' + kl('Q') + kl('E')],
    [T('Skok', 'Jump') + (hasGlide() ? T(' (trzymaj = szybowanie)', ' (hold = glide)') : ''), pad ? padGlyph('skok') : kl(T('SPACJA', 'SPACE'))],
  ];
  if (P.karabinMa || G.fps.on) w.push([T('Karabin', 'Rifle'), pad ? padGlyph('karabin') : kl('R')]);
  if (hasWeapon('sokowirowka')) w.push([T('Postaw Sokowirówkę', 'Place the Juicer'), pad ? padGlyph('wieza') : kl('F')]);
  if (charKey === 'garlicino') w.push([T('Smrodliwa aura', 'Stink aura'), pad ? padGlyph('smrod') : kl('G')]);
  if (pad) w.push([T('Kamera za plecy', 'Camera behind'), padGlyph('kamera')]);
  w.push([T('Pauza', 'Pause'), pad ? padGlyph('pauza') : kl('ESC')]);
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
  G.enemies = []; G.gems = []; G.coins = []; G.shots = []; G.orbs = []; G.sparks = []; G.rings = [];
  G.lobs = []; G.boomers = []; G.bolts = []; G.pops = []; G.hps = []; G.kury = []; G.okruchy = [];
  G.krzaki = [];
  G.puffs = []; G.hitstop = 0; G.padajace = []; G.turrets = []; G.pestki = []; G.kielki = []; G.seria = [];
  G.karabinPoc = []; G.gluty = []; G.kaluze = [];
  G.streak = 0; G.streakT = -9;
  G.vacuum = 0; G.buff = { key: null, t: 0 };
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
  document.getElementById('fpsView').classList.remove('on');
  document.getElementById('fpsFlash').style.opacity = 0;
  document.getElementById('stawBtn').classList.remove('on');
  _stawStan = '';
  document.getElementById('buff').style.opacity = 0;
  for (const c of chests) placeChest(c);
  for (const t of totems) { t.cd = 0; t.mat.opacity = 1; t.ring.visible = true; }
}

function newGame() {
  clearWorld();
  resetStats();
  Object.assign(G, { running: true, over: false, paused: false, dying: false, deathT: 0, time: 0, kills: 0, runCoins: 0, zebrane: 0, ranga: 0, rangaKille: 0, spawnT: 0.5, bossAt: 120, ringAt: 60, tier: 0, shake: 0, tlok: 0, kino: 0 });
  winieta(true);
  STATY.zdarzenie('run-start/' + charKey + '/' + mapKey, 'Bieg: ' + CHARS[charKey].nm + ' / ' + MAPS[mapKey].nm);
  P.sok = 0; P.leczT = 0;                           // licznik wysysania życia Beetina + blokada leczenia
  // Wąwozy: (0,0) jest wypłaszczone z definicji, ale pytamy moduł — gdyby ktoś przestawił
  // parametry, gracz nie ma się budzić w rzece ani na ścianie kanionu.
  if (MAPS[mapKey].rzeki) { const st = TW.startowaPozycja(); P.pos.set(st.x, 0, st.z); }
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
  document.getElementById('tier').innerHTML = ico('ostrzezenie', 14) + T(' ZAGROŻENIE 1', ' THREAT 1');
  document.getElementById('xpbar').style.width = '0%';
  drawHearts(); drawCoins(); renderWpns();
  AUDIO.startRun(charKey);                         // losowy utwór na bieg + kwestia na start
  camYaw = 0;
  camera.position.set(0, terrainH(0, 0) + CAM_H, CAM_DIST);
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t0 = DEV ? performance.now() : 0;
  pollPads(dt);                                   // pady odpytujemy co klatkę
  if (G.running && !G.paused) {
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
  try { renderer.render(scene, camera); } catch (err) { console.error(err); }
  if (DEV) devHudTick(t0, t1, performance.now());
}

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
const _kotwica = new THREE.Vector3();
function syncInstancje() {
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
    pulaGemy = new InstPula(unitGeo, pigulkaMat.clone(), { cap: 128, nazwa: 'pigułki' });
    pulaMonety = new InstPula(unitGeo, coinMat.clone(), { kolor: true, cap: 32, nazwa: 'monety' });
  }
  if (!pulaPlamy && plamaMat) {                    // plamaMat powstaje przy pierwszej plamie
    const pm = plamaMat.clone(); pm.opacity = 1;
    pulaPlamy = new InstPula(plamaGeo, pm, { kolor: true, alfa: true, renderOrder: 1, cap: PLAM_MAX, nazwa: 'plamy' });
  }
  // kotwica na wysokości STÓP gracza (P.pos.y jest zawsze 0 — wtedy środek pul leżał pod
  // taflą wody 0.75 i wszystkie przezroczyste pule rysowały się przed wodą, która je gasiła)
  const kot = _kotwica.set(P.pos.x, P.y, P.pos.z);
  for (const g of HORDA_GRUPY) g.begin(kot);      // także bez mesha — może powstać w tej klatce
  for (const p of PULE) p.begin(kot);
  for (const e of G.enemies) {
    const bb = e.bb;
    if (!bb.inst) continue;
    const m = bb.mesh;
    const hk = m.material && m.material.userData.hk;
    if (hk && m.visible) hk.g.add(m, hk, bb.fxProg, bb.fxFlash);
    pulaCien.add(bb.shadow);
    if (e.ring) pulaKrag.add(e.ring);
  }
  for (const s of G.sparks) pulaIskry.add(s.mesh, s.a);
  for (const o of G.okruchy) pulaOkruchy.add(o.mesh, 1, o.kc);
  for (const p of G.puffs) pulaPuff.add(p.mesh, p.a, p.kc);
  for (const r of G.rings) pulaFala.add(r.mesh, r.a);
  for (const g of G.gems) pulaGemy.add(g.mesh);
  for (const c of G.coins) pulaMonety.add(c.mesh, 1, c.mesh.material && c.mesh.material.color);
  if (pulaPlamy) for (const p of plamy) if (p && p.mesh.visible) pulaPlamy.add(p.mesh, p.a, p.kc);
  for (const g of HORDA_GRUPY) g.end();
  for (const p of PULE) p.end();
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
  for (const g of HORDA_GRUPY) if (g.mesh) etyk.set(g.mesh, 'pula:sprite ' + g.nazwa);
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
    et = et || ('inne:' + (o.isInstancedMesh ? 'inst:' : '') + (o.geometry && o.geometry.type));
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
  for (let s = 0; zywi < STRES && s < 40; s++, zywi++) spawnEnemy(STRES_TYPY[_stresK++ % STRES_TYPY.length]);
  P.xp = 0;
  P.iframes = 0.5;          // ciosy w ogóle nie wchodzą (bez startDeath co 0.9 s, który ucinał update)
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
  eliteRingMat = new THREE.MeshBasicMaterial({ map: ringTexture('rgba(255,200,40,0.9)'), transparent: true, depthWrite: false });
  chestMats = [];
  for (let i = 0; i < 4; i++) chestMats.push((await flatMat('assets/chest' + i + '.png')).mat);
  // złota skrzynia z bronią (ta sama grafika, złota poświata + pierścień)
  wchest.mesh = new THREE.Mesh(unitGeo, chestMats[0]);
  wchest.mesh.scale.set(1.5, 1.5, 1);
  wchest.mesh.visible = false;
  scene.add(wchest.mesh);
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
  await buildChar('don_chipso', ['run']);          // boss ma wreszcie własny arkusz
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
  mapKey = MAPS[META.lastMap] ? META.lastMap : 'laki';
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
  spawnChests(9);
  await ladowanie(T('Stawianie garnków Nonny…', "Setting out Nonna's pots…"));
  await ladujGarnek();      // sprite garnka; bez niego zostaje proceduralny
  spawnTotems(3);
  // `setMap` poszedł WCZEŚNIEJ niż wczytanie sprite'a, a `spawnTotems` bierze teksturę
  // proceduralną — bez tego wywołania garnek zostawał rysowany kodem.
  ustawWygladGarnkow(mapKey);
  drawHearts();
  await ladowanie(T('Otwieranie sklepu…', 'Opening the shop…'));
  renderShop(); renderMaps(); renderChars(); renderStats(); renderBestiary(); renderPick();
  renderSterowanie();    // zakładka Sterowanie (mapowanie pada)
  AUDIO.initUI();        // suwaki głośności w zakładce Dźwięk
  // KLIK w UI: jeden delegat na cały dokument zamiast dopisywania dźwięku
  // do każdego przycisku osobno (menu jest generowane w kilku miejscach).
  addEventListener('pointerdown', ev => {
    if (ev.target.closest && ev.target.closest('.tab,.tile,.card,.bigbtn,.btn2,#jumpBtn')) AUDIO.sfx('klik');
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
  document.getElementById('btnRetry').onclick = () => {
    sprobujPelnyEkran();               // gracz mógł w międzyczasie wyjść z pełnego ekranu
    document.getElementById('overOv').style.display = 'none';
    newGame();
  };
  document.getElementById('btnMenu').onclick = () => {
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
    if (!STRES && G.running) { G.bossAt = G.time + 120; G.ringAt = G.time + 30; G.spawnT = 0; }
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
  // ---- KODY ----
  // Kod odblokowuje WSZYSTKO + 5000 monet, a `main.js` w demo na GitHub Pages jest
  // publiczny — kazdy moglby go odczytac z zrodla i sklep przestalby cokolwiek znaczyc.
  // Poza DEV pole na kod jest USUWANE z drzewa (nie tylko ukrywane).
  const kodBox = document.getElementById('kodBox');
  if (!DEV && kodBox) kodBox.remove();
  const kodInfo = document.getElementById('kodInfo');
  const kodInput = document.getElementById('kodInput');
  function uzyjKodu() {
    const kod = (kodInput.value || '').trim();
    if (kod.toLowerCase() === 'rudeuszek2123') {
      for (const k of Object.keys(CHARS)) META.chars[k] = 1;          // wszystkie postacie
      for (const it of SHOP_UNLOCKS) META.unlocked[it.key] = 1;       // bronie i zdolności
      for (const it of SHOP) META.up[it.key] = it.max;                // ulepszenia na max
      META.coins += 5000;
      saveMeta();
      renderShop(); renderChars(); renderPick();
      if (typeof renderBestiary === 'function') renderBestiary();
      kodInfo.className = '';
      kodInfo.textContent = T('KOD PRZYJĘTY! Odblokowano wszystko + 5000 monet.', 'CODE ACCEPTED! Everything unlocked + 5000 coins.');
      kodInput.value = '';
    } else if (kod) {
      kodInfo.className = 'zle';
      kodInfo.textContent = T('Nieznany kod.', 'Unknown code.');
    }
  }
  if (kodInput) document.getElementById('kodBtn').onclick = uzyjKodu;
  if (kodInput) kodInput.addEventListener('keydown', e => {
    e.stopPropagation();                       // żeby spacja/WSAD nie sterowały grą
    if (e.code === 'Enter') uzyjKodu();
  });

  // ikonki w zakładkach + przycisku pauzy
  document.querySelectorAll('.tab[data-ico]').forEach(t =>
    t.insertAdjacentHTML('afterbegin', ico(t.dataset.ico, 16) + ' '));
  document.getElementById('pauseBtn').innerHTML = ico('pauza', 16);
  // zakładki menu
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('sel'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('on'));
    t.classList.add('sel');
    document.getElementById('p-' + t.dataset.tab).classList.add('on');
    if (t.dataset.tab === 'staty') renderStats();
    if (t.dataset.tab === 'bestia') renderBestiary();
    if (t.dataset.tab === 'sklep') renderShop();
    // dawne zakładki „dzwiek" i „sterowanie" są scalone w JEDNE USTAWIENIA
    if (t.dataset.tab === 'ustawienia') renderSterowanie();
    // KLASA `panel-open` = „coś jest otwarte obok scenki". Trzyma ją CSS:
    // prawa kolumna z panelami ma wtedy szerokość, a na telefonie zasłania
    // scenkę i pokazuje przycisk WRÓĆ. Zakładka „graj" = panel pusty = brak klasy.
    document.getElementById('startOv').classList.toggle('panel-open', t.dataset.tab !== 'graj');
  });
  // WRÓĆ (telefon): dokładnie to samo co B na padzie — klik w ukrytą zakładkę „graj"
  document.getElementById('panelBack').onclick = () =>
    document.querySelector('.tab[data-tab="graj"]').click();
  // pauza
  document.getElementById('pauseBtn').onclick = () => togglePause(!G.paused);
  document.getElementById('btnResume').onclick = () => togglePause(false);
  document.getElementById('btnQuit').onclick = () => {
    togglePause(false);
    G.running = false;
    rozliczBieg();                                // monety z przerwanego biegu też są nasze
    STATY.zdarzenie('run-end/menu/min-' + kubelekMinut(G.time),
      'Koniec biegu (wyjście do menu): ' + fmtTime(G.time) + ', poziom ' + P.lvl);
    META.st.runs++; META.st.time += G.time; META.st.lvl += Math.max(0, P.lvl - 1);
    if (G.time > META.st.best) META.st.best = G.time;
    if (G.kills > META.st.bestKills) META.st.bestKills = G.kills;
    clearWorld();
    AUDIO.endRun();                               // z powrotem motyw główny
    document.getElementById('wArrow').style.display = 'none';
    menu.style.display = 'flex';
    saveMeta();                                   // zapisz liczniki bestiariusza z przerwanego biegu
    renderStats(); renderShop(); renderBestiary(); renderChars();
  };
  addEventListener('keydown', e => {
    // 400 ms po pauzie z `pointerlockchange`: gdyby przeglądarka jednak dostarczyła ESC,
    // nie odpauzuj tego, co właśnie zapauzowaliśmy (patrz komentarz przy pointerlockchange)
    if (e.code === 'Escape' && performance.now() - pauzaZLocka < 400) return;
    if (e.code === 'Escape' && G.running &&
        document.getElementById('cardsOv').style.display !== 'flex' &&
        document.getElementById('swapOv').style.display !== 'flex') togglePause(!G.paused);
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
    setTilt(v) { SPRITE_TILT = v; refreshSpriteTilt(); },   // 0 = pionowe billboardy, 1 = do kamery
    przewrocRegaly, nova,
    get tilt() { return { SPRITE_TILT, kat: +(tiltKat * 180 / Math.PI).toFixed(1) }; },
    get grass() { return grassField; },
    THREE, scene, camera, renderer, TW, wodaY,             // do inspekcji w podglądzie (TW = teren Wąwozów)
    get tr() { return { trBuf, TR_RES, TR_SPAN, TR_ST, trCx, trCz, trAktywne, trKatU }; },
    updateTrample,
    render() { renderer.render(scene, camera); },
    PAD, pollPads, get camYaw() { return camYaw; }, get gpSel() { return gpSel; },
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
        passives: { ...P.passives }, repeat: { ...P.repeat },
      };
    },
    xpDoNast, REPEAT, cardPool, repeatPool,
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
})();
