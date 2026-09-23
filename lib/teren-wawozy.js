// ═══════════════════════════════════════════════════════════════════════════
//  teren-wawozy.js — trzecia mapa: WĄWOZY, RZEKI, WZGÓRZA, BRODY
//  Moduł SAMODZIELNY: zero importów, zero zależności od main.js, zero Math.random.
//  Wszystko jest czystą funkcją (x, z) → dzięki temu chunki nigdy nie mają szwów
//  i nie trzeba trzymać żadnego stanu per chunk.
//
//  ───────────────────────────────── DLACZEGO TAK ─────────────────────────────
//  Rzeka i wąwóz to u nas JEDEN twór, nie dwa. Gdyby wąwozy robił osobny szum,
//  a rzeki osobna sieć krzywych, rzeka co chwilę wspinałaby się na wzgórze albo
//  płynęła grzbietem. Tutaj najpierw powstaje SIEĆ RZECZNA (izolinia szumu),
//  a wąwóz jest po prostu wcięciem WOKÓŁ niej — więc z definicji nie ma rzeki
//  poza wąwozem ani wąwozu bez powodu.
//
//  Sieć rzeczna = zbiór zerowy gładkiego pola szumu R(x,z). Odległość do niej
//  liczymy estymatorem pierwszego rzędu |R| / |∇R| (to samo, czym w raymarchingu
//  robi się SDF z pola skalarnego). Dlatego szum liczymy razem z gradientem
//  analitycznym — jedna ewaluacja daje wartość i pochodne, a to jest w tej
//  funkcji najdroższa rzecz, więc nie stać nas na różnice skończone.
//
//  Dwa pola (A i B) o różnych skalach, skręcone tym samym warpem, dają sieć,
//  która się PRZECINA, a przecięcia czytają się jako dopływy i rozwidlenia.
//  Wysokość = min(hA, hB), czyli suma mnogościowa dwóch wcięć — głębsze wygrywa,
//  przejścia są gładkie.
//
//  ─────────────────────────── DNO I TAFLA (wersja 2, 23.09) ──────────────────
//  Dno wąwozu leży na  macro − D(macro),  gdzie D zależy WYŁĄCZNIE od wolnego
//  pola `macro` (i to tak, że dno rośnie monotonicznie z macro). Tafla = dno
//  minus stały zapas, więc tafla jest funkcją samego `macro` i NIE MOŻE się
//  podnieść tam, gdzie macro opada — koniec z „rzeką pod górę".
//  Poprzednio głębokość dna miała własny szum i to on falował taflą (3,4%
//  próbek lustra szło w górę z nurtem, do +1 j. na 1,5 j. przy ujściach, bo
//  sieć B miała płytsze dno niż A i przy zbiegu jej wyższa tafla wlewała się
//  na A). Teraz obie sieci mają TO SAMO dno, a różnią się tylko szerokością.
//  Zróżnicowanie głębokości wąwozu bierze się teraz z RANTU: rant to teren
//  wzgórz, więc tam, gdzie przez rzekę przechodzi grzbiet, jest głęboki
//  przełom, a w obniżeniu między wzgórzami płytka, rozlana dolinka.
//
//  ───────────────────────────── BRODY (wersja 2, 23.09) ──────────────────────
//  Bród = odcinek rzeki z płytką wodą (0,2 j.) i łagodnym zjazdem po OBU
//  stronach — naturalne przejście w poprzek wąwozu i „cel" na mapie.
//  • GDZIE: tam, gdzie rzeka przecina pas wokół linii regularnej siatki
//    w przestrzeni skręconej (patrz `silaBrodu`) — bród co ~80 j. rzeki,
//    równo, bez losowania.
//  • JAK: w pasie brodu ścianę wąwozu ZASTĘPUJEMY rynną o stałym nachyleniu
//    (brodNachylenie ≈ 27°) uciętą od góry terenem, a wzgórza w pasie są
//    obniżone (przełęcz), żeby rynna nie musiała wcinać się daleko w płaskowyż.
//  • Dno i tafla w brodzie się NIE zmieniają (inaczej woda robiłaby próg);
//    zmienia się tylko ściana, głębokość i szerokość koryta.
//  Droga do tej wersji (żeby nikt nie powtarzał): poszerzanie rampy zależne
//  od wysokości rantu dawało uskoki (szerokość zmieniała się szybciej niż
//  odległość od osi); środki brodów w losowych punktach + rzut Newtona dawały
//  klify 15–25 j. od osi (rzut dryfował); rynna liczona od stycznej do rzeki
//  wymagała odwracania skrętu i nie zbiegała przy ostrych kątach. Zostały
//  pasy + rynna z odległością „trapezową" — zmierzone najlepsze.
//
//  ───────────────────────── SUCHE PAROWY (sieć C, 23.09) ─────────────────────
//  Trzecia sieć bez wody, TYLKO daleko od rzek: łata placki płaskowyżu, które
//  zbiór zerowy dwóch szumów zostawia bez żadnego wąwozu.
//
//  ───────────────────────────── INSPIRACJE (bez kopiowania kodu) ─────────────
//  • ridged multifractal (1 - |2n-1|)² — klasyka z „Texturing & Modeling"
//    Musgrave'a; tu tylko na grzbiety między wąwozami.
//  • domain warping q = fbm(p + fbm(p)) — Inigo Quilez, iquilezles.org/articles/warp/
//    (strona bez podanej licencji, więc technika owszem, kod napisany od zera).
//  • szum wartościowy z gradientem analitycznym — własna implementacja w stylu
//    `vnoise` z main.js, żeby obie mapy wyglądały spójnie „z tej samej ręki".
//  Świadomie NIE wciągamy simplex-noise.js (MIT, jwagner) ani noisejs (ISC,
//  josephg): są dobre, ale projekt ma zasadę zero zależności w runtime, a my
//  potrzebujemy pochodnych analitycznych, których żadna z nich nie zwraca.
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────── PARAMETRY DO STROJENIA ─────────────────────────
// Wszystko, co ma sens kręcić suwakiem, siedzi tutaj. `ustawParametry()`
// przelicza stałe pochodne — nie wolno pisać po PARAM bezpośrednio, bo
// wysokość startowa placu przestanie się zgadzać z terenem dookoła.
const DOMYSLNE = {
  // — wielkoskalowy relief (nośnik wszystkiego; po nim spływają rzeki) —
  skalaMacro:      300,   // okres najwolniejszego szumu [j.]
  ampMacro:        16,    // amplituda peak-to-peak [j.]

  // — wzgórza i grzbiety —
  skalaSrednia:    85,
  ampSrednia:      22.0,  // 23.09: 11 → 22, bo „płaskowyż jak stół" (relief poza wąwozami ×1,6)
  skalaDrobna:     30,
  ampDrobna:       4.5,
  skalaGrzbietu:   62,
  ampGrzbietu:     12,    // ridged multifractal — ostre granie między wąwozami
  tlumienieWzgorz: 0.18,  // ile zostaje ze wzgórz NA DNIE wąwozu (0 = gładkie dno)
  dolinaMiekka:    3.5,   // [j.] jak nisko wolno zejść obniżeniu między wzgórzami — patrz `bazaWzgorz`

  // — sieć rzeczna A (główna) —
  skalaRzekiA:     115,   // im większa, tym rzadsza sieć (23.09: 158 → 115, „za dużo płaskiego")
  przesA:          130.5,
  // — sieć rzeczna B (dopływy, węższa; dno TO SAMO co A, patrz nagłówek) —
  skalaRzekiB:     155,   // (23.09: 214 → 155)
  przesB:          -12.7,
  skalaB:          0.72,  // mnożnik szerokości wąwozu B i głębokości jego koryta

  // — sieć C: SUCHE PAROWY (bez wody) tylko w „dziurach" między rzekami —
  // Zbiór zerowy szumu zostawia czasem placki 100+ j. bez żadnej rzeki (tam
  // właśnie było „za dużo płaskiego"). Zagęszczanie A i B do skutku zrobiłoby
  // labirynt w reszcie mapy, więc trzecia sieć działa TYLKO daleko od rzek.
  skalaRzekiC:     80,
  przesC:          57.3,
  glebSuchy:       4.5,   // głębokość parowu [j.] (względem terenu, nie macro — suchy parów może iść po zboczu)
  szerSuchy:       16,    // półszerokość parowu u góry [j.] (4.5 na 16 → ściany ~27°, do przebiegnięcia)
  suchyOd:         18,    // [j.] od rzeki A/B parowów jeszcze nie ma…
  suchyPelny:      36,    // …a stąd mają pełną głębokość

  oktawa2:         0.44,  // skala drugiej oktawy pola rzecznego (× skalaRzeki)
  ampOktawy2:      0.50,  // ile meandrowania dokłada druga oktawa
  gradMin:         0.22,  // dolne ograniczenie |∇R| × skala — patrz komentarz niżej

  // — DOMAIN WARPING sieci rzecznej —
  // Izolinia czystego szumu wokół lokalnego ekstremum jest niemal idealnym
  // OKRĘGIEM, a okrągła rzeka natychmiast zdradza, że to szum, nie rzeka.
  // Skręcenie dziedziny przed próbkowaniem rozgniata te pierścienie w meandry,
  // NIE zmieniając topologii sieci (odnogi dalej się łączą tam, gdzie się łączyły).
  skalaWarp:       66,
  ampWarp:         24,    // [j.] przesunięcia; powyżej ~40 psuje estymator odległości

  // — geometria wąwozu —
  szerWawozu:      12.5,  // szerokość u góry [j.] (spec: 8–20; 23.09: 16 → 12.5, bo sieć gęstsza)
  glebWawozu:      9.5,   // głębokość dna pod `macro` przy macro = 0 [j.]
  sprzezenieMacro: 0.4,   // o ile dno pogłębia się z macro (MUSI być < 1 — patrz `dnoPod`)
  glebPlytki:      8,     // [j.] wąwóz płytszy niż to (dno→rant) jest maksymalnie rozlany…
  glebGleboki:     22,    // …a głębszy niż to — maksymalnie ciasny
  udzialDna:       0.46,  // płaskie dno = udzialDna × półszerokość
  maxDno:          5.0,   // ale nie szersze niż tyle [j.]

  // — RAMPY (asymetryczne zejścia do wąwozu; to one decydują o grywalności) —
  skalaRampy:      78,    // jak często zmienia się stromość ściany [j.]
  rozciagRampy:    2.2,   // kontrast szumu rampy (jw.)
  rozstawBrzegow:  30,    // o ile w poprzek próbkujemy szum dla LEWEJ i PRAWEJ ściany
  rampaMin:        0.50,  // najostrzejsza ściana  = półszerokość × rampaMin
  rampaRozp:       1.0,   // najłagodniejsza ściana = półszerokość × (rampaMin+rampaRozp) (23.09: 1.35 → 1.0 — ściany mają zostać strome, wyjściem są brody)
  rozlewGleb:      0.80,  // o ile PŁYTKI wąwóz jest szerszy od głębokiego (0 = wcale)
  zasiegMaski:     3.70,  // WYLICZANE automatycznie w `przeliczStale` — nie ruszać

  // — BRODY (patrz nagłówek i `silaBrodu`) —
  brodOdstep:      85,    // odstęp linii siatki brodów [j. przestrzeni skręconej] → bród co ~80 j. rzeki
  brodR0:          7,     // pół-szerokość pełnego pasa brodu wokół linii siatki [j. skręconych]
  brodR1:          22,    // od tej odległości od linii — zwykła ściana (szeroki zanik = łagodne boki zjazdu)
  brodNachylenie:  0.50,  // tangens rynny zjazdu (0.50 ≈ 27°; gra: pełna prędkość do 35°)
  brodMaxSzer:     45,    // [j.] dalej od osi zjazd już nie sięga (koszt i czytelność)
  brodPrzelecz:    0.6,   // o ile w pasie brodu obniżamy wzgórza (przełęcz) — krótsza rynna, mniejsze wcięcie
  brodKoryto:      0.50,  // głębokość koryta w brodzie [j.] (tafla stoi 0.30 pod dnem → woda 0.20)
  brodPoszerz:     0.6,   // o ile szersze jest zwierciadło w brodzie (płycizna się rozlewa)

  // — woda —
  szerRzeki:       5.4,   // szerokość zwierciadła [j.]
  glebKoryta:      1.7,   // ile koryto jest wcięte poniżej dna wąwozu [j.]
  lustroPodDnem:   0.30,  // tafla tyle pod poziomem suchego dna → brzegi zostają suche

  // — plac startowy —
  startPlaski:     14,    // do tego promienia idealnie płasko i sucho
  startBlend:      20,    // i jeszcze tyle na wtopienie w teren

  // — pułapki —
  progOsuwiska:    1.15,  // tangens nachylenia, od którego zbocze się sypie (~49°)
  progStromizny:   0.60,  // tangens, powyżej którego to już „zbocze", nie łąka
  szerPasaBlota:   3.5,   // [j.] szerokość grząskiej ławicy wzdłuż zwierciadła
};

// ⚠️ KOPIA PRZEZ SPREAD, NIE Object.assign({}, …). Object.assign na pustym
// obiekcie z ~50 kluczami przełącza go w V8 w tryb SŁOWNIKOWY (hash-mapa),
// a `wysokosc` czyta PARAM kilkadziesiąt razy na wywołanie. Zmierzone w node:
// sam ten jeden znak zmiany to ok. −40% czasu 100k wywołań. Spread tworzy
// obiekt z szybkimi właściwościami (sprawdzone %HasFastProperties), a późniejsze
// Object.assign(PARAM, p) w `ustawParametry` tylko nadpisuje istniejące klucze
// i tego trybu nie psuje.
export const PARAM = { ...DOMYSLNE };
export function domyslneParametry() { return { ...DOMYSLNE }; }

// ───────────────────────────── SZUM WARTOŚCIOWY ───────────────────────────────
// Math.imul, bo zwykłe `*` na liczbach rzędu 2³² traci młodsze bity i hash
// zaczyna się „kleić" w widoczne pasy. Zakres wyniku 0..1.
// Mieszanie hasha wydzielone, żeby `vn`/`vnd` mogły policzyć część liniową
// RAZ na wiersz/kolumnę siatki: imul(ix+1, K) = imul(ix, K) + K (mod 2³²), więc
// cztery rogi kosztują 2 mnożenia zamiast 8. `wysokosc` woła szum ~15 razy,
// a w kontekście dużej funkcji V8 nie zawsze wszystko wkleja — każde
// zaoszczędzone mnożenie widać w pomiarze 100k (to dało ok. −15%).
// Wynik bit w bit taki sam jak dawne h2(ix, iz) (sprawdzone na 200 tys. par).
function mx(n) {
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) * 2.3283064365386963e-10;
}

function vn(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const X0 = Math.imul(ix, 374761393), X1 = (X0 + 374761393) | 0;
  const Z0 = Math.imul(iz, 668265263), Z1 = (Z0 + 668265263) | 0;
  const a = mx((X0 + Z0) | 0), b = mx((X1 + Z0) | 0), c = mx((X0 + Z1) | 0), d = mx((X1 + Z1) | 0);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// Ta sama siatka co `vn`, ale zwraca też ∂/∂x i ∂/∂z. Pochodna smoothstepa to
// 6t(1-t), a reszta to te same cztery rogi — czyli gradient kosztuje ~30% więcej
// niż sama wartość, a różnice skończone kosztowałyby 200% więcej.
function vnd(x, z, out) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const X0 = Math.imul(ix, 374761393), X1 = (X0 + 374761393) | 0;
  const Z0 = Math.imul(iz, 668265263), Z1 = (Z0 + 668265263) | 0;
  const a = mx((X0 + Z0) | 0), b = mx((X1 + Z0) | 0), c = mx((X0 + Z1) | 0), d = mx((X1 + Z1) | 0);
  const k1 = b - a, k2 = c - a, k3 = a - b - c + d;
  out[0] = (k1 + k3 * sz) * 6 * fx * (1 - fx);
  out[1] = (k2 + k3 * sx) * 6 * fz * (1 - fz);
  return a + k1 * sx + k2 * sz + k3 * sx * sz;
}

function ss(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

// Szum wartościowy trzyma się blisko 0.5 (odchylenie ~0.15), więc surowy `vn`
// prawie nigdy nie dociąga do skrajności. A my potrzebujemy skrajności: ściana
// ma być ALBO pionowa, ALBO do wbiegnięcia. `rozciag` rozpycha rozkład wokół
// środka, dzięki czemu obie skrajności występują często, a nie raz na kilometr.
function rozciag(n, k) {
  const t = (n - 0.5) * k + 0.5;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

// ───────────────────────────── POLE SIECI RZECZNEJ ────────────────────────────
// Dwie oktawy, wycentrowane na zero — rzeka to izolinia R = 0. Gradient
// przeliczony na jednostki świata (dzielenie przez skalę to reguła łańcuchowa).
const _gA = new Float64Array(2);
const _gB = new Float64Array(2);
const _gC = new Float64Array(2);
const _tmp = new Float64Array(2);

function poleRzeki(x, z, s, przes, out) {
  const s2 = s * PARAM.oktawa2, a2 = PARAM.ampOktawy2;
  const n1 = vnd(x / s + przes, z / s - przes * 0.63, out) - 0.5;
  const gx = out[0] / s, gz = out[1] / s;
  const n2 = vnd(x / s2 - przes * 1.7, z / s2 + przes * 1.31, _tmp) - 0.5;
  out[0] = gx + a2 * _tmp[0] / s2;
  out[1] = gz + a2 * _tmp[1] / s2;
  return n1 + a2 * n2;
}

// Przesunięcie dziedziny (domain warp). Osobna funkcja, bo potrzebuje go też
// `najblizszyBrod` (odwracanie skrętu), a dwie kopie tego samego wzoru
// rozjechałyby się przy pierwszym strojeniu.
// out[0..1] = przesunięcie (sx, sz), out[2..5] = jego pochodne
// ∂sx/∂x, ∂sx/∂z, ∂sz/∂x, ∂sz/∂z — czyli jakobian skrętu bez jedynek.
//
// PO CO JAKOBIAN: pole rzeki żyje w przestrzeni skręconej, więc |R|/|∇R| to
// odległość w jednostkach SKRĘCONYCH. Skręt o amplitudzie 48 j. na skali 66 j.
// potrafi lokalnie rozciągnąć dziedzinę prawie dwukrotnie, więc ta sama
// „odległość" to raz 10, a raz 20 metrów świata. Dla samego wąwozu to tylko
// zmienność szerokości, ale zjazd brodu ma mieć GWARANTOWANE nachylenie —
// więc gradient przenosimy do świata: ∇R_świat = Jᵀ·∇R_skręt.
// Koszt: dwa `vnd` zamiast dwóch `vn`, czyli kilka mnożeń.
const _sk = new Float64Array(6);
const _dw = new Float64Array(2);
function skret(x, z, out) {
  const P = PARAM;
  if (P.ampWarp > 0) {
    const sw = P.skalaWarp, A = P.ampWarp * 2, k = A / sw;
    out[0] = (vnd(x / sw + 5.31, z / sw - 9.17, _dw) - 0.5) * A;
    out[2] = _dw[0] * k; out[3] = _dw[1] * k;
    out[1] = (vnd(x / sw - 17.73, z / sw + 3.91, _dw) - 0.5) * A;
    out[4] = _dw[0] * k; out[5] = _dw[1] * k;
  } else { out[0] = out[1] = out[2] = out[3] = out[4] = out[5] = 0; }
}

// ───────────────────────────────── BRODY ──────────────────────────────────────
// Siła brodu 0..1 w punkcie (xw, zw) przestrzeni SKRĘCONEJ, dla jednej sieci.
//
// GDZIE SĄ BRODY: w PASACH wokół linii regularnej siatki x = k·odstęp oraz
// z = k·odstęp (w przestrzeni skręconej, więc w świecie te pasy są faliste
// i ich nie widać). Bród = miejsce, gdzie rzeka przecina pas. Rzeka pod kątem
// θ przecina na jednostkę długości (|cos θ| + |sin θ|)/odstęp linii, czyli
// bród wypada co odstęp/√2 … odstęp — BARDZO równo, bez względu na kierunek.
//
// DLACZEGO PAS, A NIE „ODLEGŁOŚĆ WZDŁUŻ RZEKI OD PRZECIĘCIA": wersje, które
// rzutowały punkt na oś rzeki (krok Newtona) i pytały o położenie rzutu, były
// dokładne tylko przy osi — 15–25 j. dalej rzut dryfował wzdłuż rzeki i siła
// brodu spadała z 1 do 0 w połowie zjazdu, robiąc na nim klify (zmierzone do
// 10 tangensa). Pas jest ciągły, tani (zero szumu) i z definicji ma tę samą
// siłę w całym przekroju: zjazd biegnie wzdłuż linii siatki, która przecina
// rzekę. Cena: przy przecięciu pod ostrym kątem bród jest dłuższy wzdłuż
// rzeki (do ~2× przy 30°), a gdy rzeka biegnie wzdłuż linii — ciągnie się
// dalej jako długa płycizna. To rzadkie i dla gry raczej zaleta.
function silaBrodu(xw, zw, ziarno) {
  const P = PARAM, L = P.brodOdstep, R0 = P.brodR0, R1 = P.brodR1;
  const u = xw / L + ziarno * 0.37, v = zw / L - ziarno * 0.61;
  let e = (u - Math.round(u)) * L; if (e < 0) e = -e;
  let g = (v - Math.round(v)) * L; if (g < 0) g = -g;
  if (g < e) e = g;                               // bliższa z dwóch rodzin linii
  if (e >= R1) return 0;
  if (e <= R0) return 1;
  return 1 - ss((e - R0) / (R1 - R0));
}

// Odległość W ŚWIECIE od punktu do osi rzeki — do rynny zjazdu brodu.
// Estymator pierwszego rzędu |R|/|∇R| jest dobry przy osi, ale 15–30 j. dalej
// myli się nawet 2× (druga oktawa pola, skręt dziedziny), a nachylenie rynny
// = s·|∇odległości|, więc każdy błąd to stromizna na zjeździe.
// Metoda TRAPEZÓW: jeden krok Newtona do p1 (≈ oś), gradient pola w p1
// i dzielimy |R| przez ŚREDNIĄ z |∇R| w punkcie i w p1 (spadek pola wzdłuż
// odcinka / średnie nachylenie pola = długość odcinka). Pełny Newton do
// zbieżności był dokładniejszy przy osi, ale potrafił przeskoczyć na INNĄ
// gałąź rzeki (klif 7 j. na zjeździe); tu wszystko jest złożeniem funkcji
// ciągłych. Skręt w p1 bierzemy LINIOWO (jakobian z punktu p) — zmierzone:
// ~10% szybciej, jakość brodów bez zmian (przejście 99% vs 99%).
// Liczone TYLKO w pasie brodu: 2 szumy.
const _g1 = new Float64Array(2);
function odlegloscSwiat(x, z, R, gx, gz, skala, przes, xw, zw, j11, j12, j21, j22) {
  const gm = PARAM.gradMin / skala, gm2 = gm * gm;
  let g2 = gx * gx + gz * gz; if (g2 < gm2) g2 = gm2;
  const dx = -R * gx / g2, dz = -R * gz / g2;
  poleRzeki(xw + j11 * dx + j12 * dz, zw + j21 * dx + j22 * dz, skala, przes, _g1);
  const hx = j11 * _g1[0] + j21 * _g1[1];
  const hz = j12 * _g1[0] + j22 * _g1[1];
  let h2 = hx * hx + hz * hz; if (h2 < gm2) h2 = gm2;
  return (R < 0 ? -R : R) / (0.5 * (Math.sqrt(g2) + Math.sqrt(h2)));
}

// ───────────────────────── PROFIL POPRZECZNY WĄWOZU ───────────────────────────
// out[0] = t  (1 = teren nietknięty, 0 = płaskie dno)
// out[1] = półszerokość płaskiego dna (od niej zaczyna się zjazd brodu)
// out[2] = półszerokość wąwozu w tym punkcie (potrzebna do klasyfikacji)
const _prA = new Float64Array(3);
const _prB = new Float64Array(3);

function profil(x, z, R, gx, gz, g, d, skala, ziarno, glab, out) {
  const P = PARAM;
  const W0 = P.szerWawozu * 0.5 * skala;
  // EARLY-OUT DWUSTOPNIOWY. Najpierw najtańszy możliwy test na absolutnym
  // maksimum szerokości (nic nie liczymy), potem drugi już po sprzężeniu
  // z głębokością. Te dwa `if`-y zdejmują z gorącej ścieżki więcej niż
  // wszystkie mikrooptymalizacje razem wzięte.
  if (d > W0 * P.zasiegMaski) { out[0] = 1; out[1] = P.maxDno * skala; out[2] = W0; return; }

  // GŁĘBOKOŚĆ steruje SZEROKOŚCIĄ, i to odwrotnie: płytki wąwóz jest rozlany
  // (da się z niego wyjść), głęboki przełom jest ciasny (ściana). Gdy oba były
  // niezależne, „płytki i szeroki" trafiał się raz na kilkaset metrów i mapa
  // była jedną pułapką bez wyjścia.
  // `glab` to GŁADKI zastępnik głębokości (dno + tylko wolna składowa wzgórz),
  // nie pełna wysokość rantu: szerokość zmieniająca się szybciej niż odległość
  // od osi robi z profilu harmonijkę (t rośnie, maleje, rośnie → uskoki).
  const nD = ss((glab - P.glebPlytki) / (P.glebGleboki - P.glebPlytki));
  const Wbaza = W0 * (1 + P.rozlewGleb * (1 - nD));
  if (d > Wbaza * (P.rampaMin + P.rampaRozp)) { out[0] = 1; out[1] = P.maxDno * skala; out[2] = Wbaza; return; }

  // „Strona" wąwozu: -1 lewy brzeg, 0 oś, +1 prawy. Mnożymy przez nią wektor
  // normalny do rzeki i tym przesunięciem próbkujemy szum rampy — dzięki temu
  // LEWA i PRAWA ściana czytają szum w innym miejscu i jedna bywa pionowa,
  // a druga w tym samym miejscu do wbiegnięcia. Przy osi przesunięcie znika,
  // więc profil jest ciągły i dno się nie rozjeżdża.
  const inv = 1 / g;
  const strona = Math.max(-1, Math.min(1, R * inv / W0));
  const off = strona * P.rozstawBrzegow;
  const px = x + gx * inv * off, pz = z + gz * inv * off;

  const nW = rozciag(vn(px / P.skalaRampy + ziarno, pz / P.skalaRampy - ziarno * 0.4), P.rozciagRampy);
  const Ws = Wbaza * (P.rampaMin + P.rampaRozp * nW);

  const dno = Math.min(Ws * P.udzialDna, P.maxDno * skala);
  out[0] = ss((d - dno) / Math.max(0.5, Ws - dno));
  out[1] = dno;
  out[2] = Ws;
}

// ───────────────────────────── STAŁE POCHODNE ─────────────────────────────────
// H0 = wysokość placu startowego. Liczona RAZ z tego samego wzoru co teren,
// bo inaczej plac odstawałby od otoczenia o kilka jednostek i na obwodzie
// robiłby się pierścieniowy klif.
let H0 = 0;
let R_START = 0;      // startPlaski + startBlend, trzymane gotowe (gorąca ścieżka)
let R_START2 = 0;

function przeliczStale() {
  // `zasiegMaski` NIE jest wolnym parametrem — to dokładny zasięg najszerszej
  // możliwej rampy. Ustawiony ręcznie za nisko obcina najłagodniejsze zejścia
  // pionowym uskokiem w połowie zbocza, a to jest błąd trudny do zauważenia na
  // zrzucie i bardzo łatwy przy strojeniu suwakami. Więc liczymy go sami.
  PARAM.zasiegMaski = (1 + PARAM.rozlewGleb) * (PARAM.rampaMin + PARAM.rampaRozp) * 1.001;
  // Brody: strefa zaniku musi mieć dodatnią długość, a brody z sąsiednich
  // linii nie mogą się zlać w jeden ciągły „bród" wzdłuż całej rzeki.
  if (PARAM.brodR1 > PARAM.brodOdstep * 0.4) PARAM.brodR1 = PARAM.brodOdstep * 0.4;
  if (PARAM.brodR0 > PARAM.brodR1 - 1) PARAM.brodR0 = Math.max(0, PARAM.brodR1 - 1);
  // Tafla = f(macro) rośnie z macro tylko przy sprzężeniu < 1 — przy ≥ 1 rzeka
  // płynęłaby „w górę" macro. Twardy bezpiecznik zamiast komentarza.
  if (PARAM.sprzezenieMacro > 0.9) PARAM.sprzezenieMacro = 0.9;
  R_START = PARAM.startPlaski + PARAM.startBlend;
  R_START2 = R_START * R_START;
  H0 = 0;
  H0 = bazaWzgorz(0, 0) + macroH(0, 0);
}

export function ustawParametry(p) {
  Object.assign(PARAM, p);
  przeliczStale();
}

// ───────────────────────────── SKŁADOWE TERENU ────────────────────────────────
function macroH(x, z) {
  const P = PARAM;
  return (vn(x / P.skalaMacro + 11.37, z / P.skalaMacro - 4.21) - 0.5) * P.ampMacro;
}

// Głębokość dna pod macro. Liniowa w macro ze współczynnikiem < 1, więc
// dno = macro·(1 − sprzężenie) − glebWawozu rośnie razem z macro: tafla nigdy
// nie idzie w górę tam, gdzie teren opada. Wyżej położone odcinki są przy tym
// głębiej wcięte, co czyta się naturalnie (rzeka w wyżynie = przełom).
function dnoPod(macro) {
  return PARAM.glebWawozu + PARAM.sprzezenieMacro * macro;
}

// Wolna składowa wzgórz z ostatniego wywołania — `wysokosc` bierze ją jako
// gładki zastępnik wysokości rantu do sprzężenia szerokość↔głębokość.
let _srOst = 0;
function bazaWzgorz(x, z) {
  const P = PARAM;
  const sr = (vn(x / P.skalaSrednia + 71.3, z / P.skalaSrednia + 19.9) - 0.5) * P.ampSrednia;
  _srOst = sr;
  const dr = (vn(x / P.skalaDrobna - 5.1, z / P.skalaDrobna + 44.7) - 0.5) * P.ampDrobna;
  // ridged multifractal: |2n-1| odbija szum od zera, kwadrat wyostrza grań.
  const g = 1 - Math.abs(2 * vn(x / P.skalaGrzbietu + 8.8, z / P.skalaGrzbietu - 31.2) - 1);
  const w = sr + dr + g * g * P.ampGrzbietu;
  // MIĘKKIE DNO DOLIN. Rant wąwozu = macro + wzgórza, dno = macro − D. Gdyby
  // obniżenie między wzgórzami zeszło głębiej niż D, rant byłby NIŻEJ od dna
  // i wąwóz odwróciłby się w wał z rzeką na grzbiecie. Ujemne wartości ściskamy
  // więc gładko (ciągła pochodna w zerze) do asymptoty −dolinaMiekka.
  if (w >= 0) return w;
  const c = P.dolinaMiekka;
  return -c * (1 - Math.exp(w / c));
}

// ═══════════════════════════════ API PUBLICZNE ════════════════════════════════

// Ostatnia próbka — żeby `czyRzeka`/`glebokoscWody`/`opisPunktu` nie liczyły
// terenu drugi raz. Pojedynczy wątek, więc jeden bufor wystarczy.
const _ost = {
  x: NaN, z: NaN, h: 0,
  dA: 0, dB: 0, tA: 1, tB: 1, WA: 0, WB: 0,
  dnoA: 0, dnoB: 0, lustro: -Infinity, glebWody: 0,
  RA: 0, gAx: 0, gAz: 0, RB: 0, gBx: 0, gBz: 0,
  fA: 0, fB: 0, rwA: 0, rwB: 0, zasA: 0, zasB: 0, plask: 0,
  fs: 1, macro: 0, tC: 1,
};

/**
 * Wysokość terenu w punkcie świata. Czysta, deterministyczna, bez alokacji.
 * @returns {number} Y w jednostkach gry
 */
export function wysokosc(x, z) {
  const P = PARAM;

  // — plac startowy: liczymy najpierw, bo przy fs === 0 i tak wszystko zgaśnie —
  let fs = 1;
  const r2 = x * x + z * z;
  if (r2 < R_START2) fs = ss((Math.sqrt(r2) - P.startPlaski) / P.startBlend);

  const macro = macroH(x, z);
  const D = dnoPod(macro);
  // Wzgórza liczymy PRZED profilem, bo profil potrzebuje wysokości rantu
  // (szerokość wąwozu i rampa brodu zależą od tego, jak wysoka jest ściana).
  const wzgS = bazaWzgorz(x, z);

  // — skręcenie dziedziny, WSPÓLNE dla obu sieci —
  // Wspólne, bo (a) kosztuje wtedy dwa szumy zamiast czterech, (b) obie sieci
  // wyginają się tak samo, więc ich przecięcia dalej wyglądają jak ujścia,
  // a nie jak dwa niezależne układy przypadkiem położone na sobie.
  skret(x, z, _sk);
  const xw = x + _sk[0], zw = z + _sk[1];
  const j11 = 1 + _sk[2], j12 = _sk[3], j21 = _sk[4], j22 = 1 + _sk[5];
  const glab = D + _srOst;

  // — sieć A —
  const RA = poleRzeki(xw, zw, P.skalaRzekiA, P.przesA, _gA);
  const wAx = _gA[0], wAz = _gA[1];                 // gradient w przestrzeni skręconej
  const gAx = j11 * wAx + j21 * wAz;                // …i w świecie (Jᵀ·∇R)
  const gAz = j12 * wAx + j22 * wAz;
  let gA = Math.sqrt(gAx * gAx + gAz * gAz);
  // Dolne ograniczenie gradientu. W punktach siodłowych pola (czyli DOKŁADNIE
  // tam, gdzie dwie odnogi rzeki się schodzą) |∇R| → 0 i estymator |R|/|∇R|
  // wybuchłby, urywając wąwóz przy samym ujściu. Ograniczenie od dołu zamienia
  // ten artefakt w szerokie rozlewisko u zbiegu — czyli w to, co tam i tak powinno być.
  const gMinA = P.gradMin / P.skalaRzekiA;
  if (gA < gMinA) gA = gMinA;
  const dA = Math.abs(RA) / gA;
  profil(x, z, RA, gAx, gAz, gA, dA, 1, 3.7, glab, _prA);

  // — sieć B —
  const RB = poleRzeki(xw, zw, P.skalaRzekiB, P.przesB, _gB);
  const wBx = _gB[0], wBz = _gB[1];
  const gBx = j11 * wBx + j21 * wBz;
  const gBz = j12 * wBx + j22 * wBz;
  let gB = Math.sqrt(gBx * gBx + gBz * gBz);
  const gMinB = P.gradMin / P.skalaRzekiB;
  if (gB < gMinB) gB = gMinB;
  const dB = Math.abs(RB) / gB;
  profil(x, z, RB, gBx, gBz, gB, dB, P.skalaB, -8.3, glab, _prB);

  const tA = _prA[0], tB = _prB[0];

  // GŁADKA „odległość" od rzeki do wag i bramek: |R| przeliczone typowym
  // gradientem (mediana |∇R|·skala = 0,7, zmierzone). To NIE jest dobra
  // odległość, ale jest gładka wszędzie, a estymator |R|/|∇R| przy siodłach
  // pola potrafi zmieniać się o 15–20 j. na jednostkę drogi. Każda waga
  // liczona z niego (zanik brodu, głębokość parowu) robiła wtedy w terenie
  // uskok — zmierzone: ~660 miejsc z nachyleniem > 25 na 24 mln próbek.
  const rhoA = (RA < 0 ? -RA : RA) * P.skalaRzekiA / 0.7;
  const rhoB = (RB < 0 ? -RB : RB) * P.skalaRzekiB / 0.7;
  // ZAUFANIE do odległości: przy siodle pola (ujścia, rozlewiska) |∇R| spada
  // prawie do zera i żaden estymator odległości nie działa — rynna brodu
  // dostawała tam dziury i progi. Tam brodu po prostu nie robimy. |∇R| jest
  // gładkie, więc waga też.
  const ufnA = ss((Math.sqrt(gAx * gAx + gAz * gAz) * P.skalaRzekiA - 0.2) / 0.25);
  const ufnB = ss((Math.sqrt(gBx * gBx + gBz * gBz) * P.skalaRzekiB - 0.2) / 0.25);

  // — BRODY —
  // Siła brodu = pas siatki (czysta funkcja położenia) × zanik na końcu pasa
  // liczenia × zaufanie do odległości. Dokładniejszą odległość do osi dla rynny
  // zjazdu (dW) liczymy tylko tam, gdzie siła > 0. `zas` = zasięg rynny
  // (krawędź dna + wysokość ściany / nachylenie) — tylko do klasyfikacji.
  const sB = P.brodNachylenie, M = P.brodMaxSzer;
  const wzgP = wzgS > 0 ? wzgS : 0;
  const dnoBrA = 0.8 * P.maxDno, dnoBrB = 0.8 * P.maxDno * P.skalaB;
  let zasA = dnoBrA + (D + wzgP) / sB; if (zasA > M) zasA = M;
  let zasB = dnoBrB + (D + wzgP) / sB; if (zasB > M) zasB = M;
  let fA = 0, fB = 0, dWA = dA, dWB = dB;
  // Granica pasa liczenia (M) jest po gładkim rho i daleko: wersja z granicą
  // ≈ zasięg rynny po estymatorze dA ucinała zjazd w połowie zbocza (dA bywa
  // 2× za duże). Za zasięgiem rynna i tak równa się terenowi wzgórz (jest nimi
  // ucięta), więc zanik [0.8M, M] w terenie prawie nic nie zmienia.
  if (rhoA < M) {
    fA = silaBrodu(xw, zw, 3.7);
    if (fA > 0) {
      fA *= (1 - ss((rhoA - 0.8 * M) / (0.2 * M))) * ufnA;
      dWA = odlegloscSwiat(x, z, RA, gAx, gAz, P.skalaRzekiA, P.przesA, xw, zw, j11, j12, j21, j22);
    }
  }
  if (rhoB < M) {
    fB = silaBrodu(xw, zw, -8.3);
    if (fB > 0) {
      fB *= (1 - ss((rhoB - 0.8 * M) / (0.2 * M))) * ufnB;
      dWB = odlegloscSwiat(x, z, RB, gBx, gBz, P.skalaRzekiB, P.przesB, xw, zw, j11, j12, j21, j22);
    }
  }

  // PRZEŁĘCZ: w pasie brodu wzgórza są niższe, więc rynna zjazdu kończy się
  // bliżej rzeki i mniej wcina się w płaskowyż.
  // Wzgórza tłumione w wąwozie: pagórek wystający ze ściany kanionu wygląda
  // jak błąd siatki, a nie jak głaz. Kwadrat maski dociska też sam rant.
  const fP = fA > fB ? fA : fB;
  const wzgF = fP > 0 ? wzgS * (1 - P.brodPrzelecz * fP) : wzgS;
  const m = tA < tB ? tA : tB;
  const wzg = wzgF * (P.tlumienieWzgorz + (1 - P.tlumienieWzgorz) * m * m);

  // Suma mnogościowa dwóch wcięć = min wysokości. Rozwinięte z
  //   h = (macro - D) + (macro + wzg - macro + D) * t
  let hA = -D + (wzg + D) * tA;
  let hB = -D + (wzg + D) * tB;

  // — ZJAZD BRODU: w brodzie ścianę wąwozu ZASTĘPUJEMY rynną o stałym nachyleniu —
  // Rynna = dno + s·(odległość od osi − półszerokość dna), ucięta od góry
  // terenem wzgórz (dalej już idzie się po zwykłym płaskowyżu).
  // Dlaczego ZASTĘPUJEMY, a nie bierzemy min(ściana, rynna): ściana wąwozu to
  // smoothstep — zaczyna się łagodnie (niżej od rynny), a stromieje dopiero
  // przy rancie. Min zostawiał więc stromy kawałek ściany tuż pod miejscem,
  // gdzie ściana przecina rynnę (zmierzone: 1,0 na zjeździe, który miał mieć 0,5).
  // Poprzednia próba — poszerzanie rampy w zależności od wysokości rantu —
  // zmieniała szerokość szybciej niż odległość od osi i profil dostawał uskoki.
  // Rynna startuje ze STAŁEJ półszerokości dna (nie z `dno` z profilu): dno
  // profilu zależy od szumu rampy i skacze na granicy early-outu, a każdy jego
  // skok razy s to próg na zjeździe.
  // Boki rynny (wzdłuż rzeki, na zaniku siły brodu) są strome — to celowe:
  // czyta się to jak wjazd wycięty w ścianę wąwozu, a nie jak rozmyta łata.
  // Odległość do rynny = min(trapezy, estymator 1. rzędu): każdy z nich
  // przesadza w innych miejscach (trapezy przy siodłach pola, 1. rząd przy
  // zakolach), a zawyżona odległość = za stroma rynna. Min to tani kompromis.
  // Zmierzone flood-fillem (siatka 1 j., krok < 35°): z dna brodu da się wyjść
  // na płaskowyż po OBU stronach w 99% brodów.
  if (fA > 0) {
    const q = dWA < dA ? dWA : dA;
    let r = -D + sB * (q > dnoBrA ? q - dnoBrA : 0);
    if (r > wzgF) r = wzgF;
    hA += (r - hA) * fA;
  }
  if (fB > 0) {
    const q = dWB < dB ? dWB : dB;
    let r = -D + sB * (q > dnoBrB ? q - dnoBrB : 0);
    if (r > wzgF) r = wzgF;
    hB += (r - hB) * fB;
  }

  // — koryto: dodatkowe wcięcie pod dnem, żeby woda miała gdzie stać —
  // (po zjeździe, bo zjazd zastępuje profil razem z dnem)
  // W brodzie koryto jest płytkie i szersze (płycizna się rozlewa). Płycienie
  // idzie z min(1, 2f), więc cały RDZEŃ brodu (f ≥ 0.5, w tym wszystko, co
  // `czyBrod` zgłasza) ma już pełną płyciznę, a przejście do głębokiego nurtu
  // jest w zewnętrznej połowie strefy.
  const rw = P.szerRzeki * 0.5;
  const kA = fA >= 0.5 ? 1 : fA * 2;
  const rwA = rw * (1 + P.brodPoszerz * kA);
  if (dA < rwA) {
    const u = dA / rwA;
    hA -= (P.glebKoryta + (P.brodKoryto - P.glebKoryta) * kA) * (1 - u * u);
  }
  const kB = fB >= 0.5 ? 1 : fB * 2;
  const rwB = rw * P.skalaB * (1 + P.brodPoszerz * kB);
  if (dB < rwB) {
    const u = dB / rwB;
    const korB = P.glebKoryta * P.skalaB;
    hB -= (korB + (Math.min(korB, P.brodKoryto) - korB) * kB) * (1 - u * u);
  }

  let hr = hA < hB ? hA : hB;

  // — SUCHE PAROWY (sieć C) —
  // Waga rośnie z odległością od najbliższej rzeki, więc parów nigdy nie
  // dochodzi do wąwozu z wodą (nie trzeba rozwiązywać ujść ani tafli) —
  // dzięki temu wcięcie może być liczone od LOKALNEGO terenu, a nie od macro.
  // Waga z min(rho, dA): rho jest gładkie, ale ZAWYŻA odległość tam, gdzie pole
  // jest strome (parów wchodził wtedy do wąwozu z wodą i robił w nim stawy),
  // a dA zawyża tylko przy siodłach — min obu nie zawyża nigdzie, a skoki dA
  // są zawsze w górę, więc min je ścina.
  const qA = dA < rhoA ? dA : rhoA, qB = dB < rhoB ? dB : rhoB;
  const dAB = qA < qB ? qA : qB;
  let tC = 1;
  if (dAB > P.suchyOd && fs > 0) {
    // Jedna oktawa zamiast dwóch: parów nie potrzebuje meandrów (i tak jest
    // skręcony wspólnym warpem), a to pół kosztu na połowie mapy.
    const sc = P.skalaRzekiC;
    const RC = vnd(xw / sc + P.przesC, zw / sc - P.przesC * 0.63, _gC) - 0.5;
    const cx = (j11 * _gC[0] + j21 * _gC[1]) / sc, cz = (j12 * _gC[0] + j22 * _gC[1]) / sc;
    let gC = Math.sqrt(cx * cx + cz * cz);
    const gMinC = P.gradMin / P.skalaRzekiC; if (gC < gMinC) gC = gMinC;
    const dC = (RC < 0 ? -RC : RC) / gC, Wc = P.szerSuchy;
    if (dC < Wc) {
      const dnoC = Wc * 0.18;
      tC = ss((dC - dnoC) / (Wc - dnoC));
      const w = ss((dAB - P.suchyOd) / (P.suchyPelny - P.suchyOd));
      hr -= P.glebSuchy * w * (1 - tC);
      if (w < 0.5) tC = 1 - (1 - tC) * 2 * w;       // płytki koniec parowu to jeszcze nie „wąwóz"
    }
  }

  let h = macro + hr;
  if (fs < 1) h = H0 + (h - H0) * fs;

  // — zapis do bufora dla pozostałych zapytań —
  _ost.tC = tC;
  _ost.x = x; _ost.z = z; _ost.h = h; _ost.macro = macro; _ost.fs = fs;
  _ost.dA = dA; _ost.dB = dB; _ost.tA = tA; _ost.tB = tB;
  _ost.WA = _prA[2]; _ost.WB = _prB[2];
  _ost.dnoA = macro - D; _ost.dnoB = macro - D;
  _ost.RA = RA; _ost.gAx = gAx; _ost.gAz = gAz;
  _ost.RB = RB; _ost.gBx = gBx; _ost.gBz = gBz;
  _ost.fA = fA; _ost.fB = fB; _ost.rwA = rwA; _ost.rwB = rwB;
  _ost.zasA = zasA; _ost.zasB = zasB;
  _ost.plask = (fs < 1 ? H0 + (macro + wzgF - H0) * fs : macro + wzgF);

  // Tafla: poziom SUCHEGO dna minus mały zapas, żeby ławice przy brzegu zostały
  // suche. Dno jest wspólne dla obu sieci i zależy tylko od macro, więc tafla
  // też — jest jedna, płaska wzdłuż nurtu i ciągła na ujściach.
  // ⚠️ TAFLA MUSI PRZEJŚĆ PRZEZ TEN SAM BLEND STARTU CO TEREN. Pierwsza wersja
  // blendowała tylko `h`, a lustro liczyła z niewygładzonego dna — przez co na
  // obwodzie placu (dokładnie tam, gdzie fs przekraczało próg) pojawiał się
  // pierścień wody NIEZALEŻNY od tego, gdzie naprawdę płynie rzeka.
  let lustro = -Infinity;
  if (fs > 0.02 && (dA < _prA[2] || dB < _prB[2])) {
    lustro = macro - D - P.lustroPodDnem;
    if (fs < 1) lustro = H0 + (lustro - H0) * fs;
  }
  _ost.lustro = lustro;
  _ost.glebWody = lustro > h ? lustro - h : 0;

  return h;
}

// ⚠️ `_ost` to JEDEN współdzielony bufor. Każde wywołanie `wysokosc` go nadpisuje,
// więc funkcja, która między odczytem a użyciem `_ost` zawoła cokolwiek liczącego
// teren (np. `nachylenie`, które próbkuje cztery sąsiednie punkty), dostanie dane
// SĄSIADA, nie swojego punktu. Kto potrzebuje pól poza jednym wywołaniem,
// musi je najpierw skopiować.
function probka(x, z) {
  if (_ost.x !== x || _ost.z !== z) wysokosc(x, z);
  return _ost;
}

/** Poziom zwierciadła wody (Y) albo -Infinity, jeśli w tym miejscu nie ma rzeki. */
export function poziomWody(x, z) { return probka(x, z).lustro; }

/** Głębokość wody nad dnem; 0 na suchym lądzie. */
export function glebokoscWody(x, z) { return probka(x, z).glebWody; }

/** Czy w tym punkcie stoi/płynie woda (dowolnie płytka). */
export function czyRzeka(x, z) { return probka(x, z).glebWody > 0.02; }

/**
 * Kierunek nurtu (znormalizowany wektor 2D w płaszczyźnie XZ) — do spychania
 * gracza i wrogów. Poza wodą zwraca [0,0].
 * Nurt jest STYCZNY do izolinii rzeki (czyli prostopadły do ∇R), a zwrot
 * wybiera ten, który schodzi w dół tafli.
 */
export function nurtRzeki(x, z, out) {
  out = out || [0, 0];
  const s = probka(x, z);
  out[0] = 0; out[1] = 0;
  if (s.glebWody <= 0.02) return out;

  // Dominuje ta sieć, w której koryto NAPRAWDĘ jesteśmy; przy ujściu (obie mokre)
  // wygrywa ta, w której jesteśmy bliżej osi w ułamku własnej szerokości.
  // Szerokości koryt bierzemy z próbki, bo w brodzie zwierciadło jest szersze.
  const rA = s.rwA, rB = s.rwB;
  const mokraA = s.dA < rA, mokraB = s.dB < rB;
  const uzyjA = mokraA && (!mokraB || s.dA / rA <= s.dB / rB);
  // KOPIE gradientów — niżej wołamy `poziomWody`, które nadpisze `_ost`.
  const gx = uzyjA ? s.gAx : s.gBx;
  const gz = uzyjA ? s.gAz : s.gBz;
  const g = Math.hypot(gx, gz) || 1e-9;
  let tx = -gz / g, tz = gx / g;                      // styczna do rzeki

  // Zwrot wybieramy po spadku SAMEJ TAFLI. Tafla jest dziś funkcją macro, więc
  // to zwykle to samo co spadek macro, ale przy placu startowym tafla przechodzi
  // przez blend i tam macro kłamie. Gdy sąsiad wypada poza koryto (koniec
  // meandra), wracamy do macro — jedyny moment, gdy tafli tam po prostu nie ma.
  const k = 7;
  let a = poziomWody(x + tx * k, z + tz * k);
  let b = poziomWody(x - tx * k, z - tz * k);
  if (a < -1e30 || b < -1e30) {
    a = macroH(x + tx * k, z + tz * k);
    b = macroH(x - tx * k, z - tz * k);
  }
  if (a > b) { tx = -tx; tz = -tz; }                  // płyniemy w dół, nie pod górę

  out[0] = tx; out[1] = tz;
  return out;
}

/** Tangens nachylenia terenu (0 = płasko, 1 = 45°). */
export function nachylenie(x, z, krok) {
  const k = krok || 1.0;
  const hx = wysokosc(x + k, z) - wysokosc(x - k, z);
  const hz = wysokosc(x, z + k) - wysokosc(x, z - k);
  const d = 2 * k;
  return Math.sqrt(hx * hx + hz * hz) / d;
}

/** Normalna terenu (do ustawiania dekoracji i do fizyki ześlizgu). */
export function normalna(x, z, out, krok) {
  out = out || [0, 1, 0];
  const k = krok || 1.0;
  const hx = (wysokosc(x + k, z) - wysokosc(x - k, z)) / (2 * k);
  const hz = (wysokosc(x, z + k) - wysokosc(x, z - k)) / (2 * k);
  const inv = 1 / Math.sqrt(hx * hx + hz * hz + 1);
  out[0] = -hx * inv; out[1] = inv; out[2] = -hz * inv;
  return out;
}

// Czy próbka leży w rdzeniu brodu. Wspólne dla `czyBrod` i `opisPunktu`.
// Bród jednej sieci liczy się tylko wtedy, gdy druga sieć w tym miejscu nie
// robi zwykłej, stromej ściany (przy ujściu bród A może trafić na ścianę B).
const PROG_BRODU = 0.98;
function wBrodzie(s) {
  if (s.fs < 0.5) return false;
  // Strefa brodu = WGŁĘBIENIE: wnętrze wąwozu albo rynna zjazdu tam, gdzie
  // wcina się poniżej płaskowyżu. Bez warunku wysokości czyBrod zgłaszał cały
  // pas do zasięgu rynny, także płaski płaskowyż obok (na mapie wyglądało to
  // jak połowa terenu przy rzekach „w brodzie").
  if (s.h > s.plask - 0.5) return false;
  const wA = s.dA < s.WA || s.dA < s.zasA, wB = s.dB < s.WB || s.dB < s.zasB;
  const okA = wA && s.fA > PROG_BRODU && (!(s.dB < s.WB) || s.tB > 0.9 || s.fB > PROG_BRODU);
  const okB = wB && s.fB > PROG_BRODU && (!(s.dA < s.WA) || s.tA > 0.9 || s.fA > PROG_BRODU);
  return okA || okB;
}

/**
 * Czy punkt należy do BRODU: płytka woda (< 0.35 j. w nurcie) i łagodne zejścia
 * z obu stron wąwozu. Tanie — jedna wysokość (albo zero, jeśli punkt był
 * właśnie liczony).
 */
export function czyBrod(x, z) { return wBrodzie(probka(x, z)); }

/**
 * Opis punktu dla logiki gry. NIE wołać na każdy wierzchołek siatki —
 * liczy nachylenie, czyli cztery dodatkowe wysokości.
 */
export function opisPunktu(x, z) {
  const h = wysokosc(x, z);
  // KOPIA, nie referencja do `_ost`: `nachylenie` niżej próbkuje cztery sąsiednie
  // punkty i nadpisuje bufor. Pierwsza wersja czytała `_ost` PO tym wywołaniu
  // i klasyfikowała punkt na podstawie danych punktu oddalonego o metr.
  // parów (sieć C) też jest wąwozem dla logiki gry — tylko bez wody
  const t = Math.min(_ost.tA, _ost.tB, _ost.tC);
  const fs = _ost.fs, gw = _ost.glebWody, dRz = Math.min(_ost.dA, _ost.dB);
  const brod = wBrodzie(_ost);

  const nach = nachylenie(x, z);
  const wawoz = t < 0.9 && fs > 0.5;
  return {
    y: h,
    wawoz,                                   // jesteśmy wewnątrz wcięcia
    rzeka: gw > 0.02,
    glebokoscWody: gw,
    dno: wawoz && t < 0.08,
    plaskowyz: !wawoz && nach < 0.22,
    zbocze: nach >= PARAM.progStromizny,
    nachylenie: nach,
    dystansDoRzeki: dRz,                     // [j.] do najbliższej osi koryta
    brod,                                    // rdzeń brodu (patrz `czyBrod`)
  };
}

/**
 * Najbliższy bród w promieniu. Zwraca { x, z, odl } (punkt na osi rzeki w środku
 * brodu) albo null. Koszt: ~2–3 tys. ewaluacji pola rzeki przy promieniu 150 j.
 * (w node ok. 0,1–0,2 ms), więc do HUD-u / strzałki raz na kilka klatek,
 * nie na każdego wroga.
 *
 * Jak: środek brodu to przecięcie rzeki z linią siatki brodów (patrz
 * `silaBrodu`) w przestrzeni skręconej. Idziemy więc wzdłuż każdej linii
 * w zasięgu, szukamy zmiany znaku pola rzeki i dociskamy ją bisekcją. Punkt
 * odwracamy ze skręconej do świata iteracją punktu stałego i SPRAWDZAMY
 * prawdziwym `czyBrod` (np. bród przy ujściu, gdzie druga sieć robi zwykłą
 * ścianę, się nie liczy).
 */
const _nw = new Float64Array(2);
// Czy zjazdu brodu nie przecina wąwóz DRUGIEJ sieci (typowo przy ujściu).
// Taki bród jest płytki, ale jedna jego strona wychodzi na zwykłą, stromą
// ścianę dopływu — jako „cel" na mapie wprowadzałby gracza w pułapkę.
function brodCzysty(s) {
  const naA = s.fA > PROG_BRODU && s.dA < s.dB;
  const dInna = naA ? s.dB - s.WB : s.dA - s.WA;
  const fInna = naA ? s.fB : s.fA;
  return fInna > PROG_BRODU || dInna > 0.8 * (naA ? s.zasA : s.zasB);
}
export function najblizszyBrod(x, z, promien) {
  const P = PARAM, L = P.brodOdstep;
  const R = promien > 0 ? promien : 120;
  skret(x, z, _sk);
  const qx = x + _sk[0], qz = z + _sk[1];
  // Zasięg w przestrzeni skręconej: skręt przesuwa punkty o ≤ ampWarp.
  const Rw = R + P.ampWarp + 2;
  const KROK = 4;
  let best = null, bestD2 = R * R;
  const sieci = [[P.skalaRzekiA, P.przesA, 3.7], [P.skalaRzekiB, P.przesB, -8.3]];
  for (const [skala, przes, ziarno] of sieci) {
    for (let rodz = 0; rodz < 2; rodz++) {
      // rodz 0: linie x = const (u całkowite), rodz 1: linie z = const
      const off = rodz === 0 ? ziarno * 0.37 : -ziarno * 0.61;
      const c0 = rodz === 0 ? qx : qz, c1 = rodz === 0 ? qz : qx;
      const k0 = Math.ceil((c0 - Rw) / L + off), k1 = Math.floor((c0 + Rw) / L + off);
      for (let k = k0; k <= k1; k++) {
        const pos = (k - off) * L;                  // współrzędna linii
        const pol = Math.sqrt(Math.max(0, Rw * Rw - (pos - c0) * (pos - c0)));
        let tPrev = c1 - pol, rPrev = NaN;
        for (let t = c1 - pol; t <= c1 + pol + 1e-9; t += KROK) {
          const r = rodz === 0 ? poleRzeki(pos, t, skala, przes, _nw) : poleRzeki(t, pos, skala, przes, _nw);
          if (rPrev === rPrev && (r < 0) !== (rPrev < 0)) {
            // bisekcja zmiany znaku
            let a = tPrev, b = t, ra = rPrev;
            for (let it = 0; it < 8; it++) {
              const m = (a + b) * 0.5;
              const rm = rodz === 0 ? poleRzeki(pos, m, skala, przes, _nw) : poleRzeki(m, pos, skala, przes, _nw);
              if ((rm < 0) === (ra < 0)) { a = m; ra = rm; } else b = m;
            }
            const m = (a + b) * 0.5;
            const px = rodz === 0 ? pos : m, pz = rodz === 0 ? m : pos;
            // odwrócenie skrętu: w = p − skręt(w)
            let wx = px, wz = pz;
            for (let it = 0; it < 8; it++) { skret(wx, wz, _sk); wx = px - _sk[0]; wz = pz - _sk[1]; }
            const d2 = (wx - x) * (wx - x) + (wz - z) * (wz - z);
            if (d2 < bestD2 && czyBrod(wx, wz) && brodCzysty(_ost)) { bestD2 = d2; best = { x: wx, z: wz, odl: Math.sqrt(d2) }; }
          }
          tPrev = t; rPrev = r;
        }
      }
    }
  }
  return best;
}

/**
 * Bezpieczne miejsce na start biegu. Plac wokół (0,0) jest wypłaszczony
 * z definicji, ale szukamy i tak — gdyby ktoś przykręcił `startPlaski` do zera,
 * funkcja dalej zwróci sensowny punkt zamiast wrzucić gracza do rzeki.
 */
export function startowaPozycja() {
  const kandydaci = [[0, 0]];
  for (let k = 0; k < 3; k++) {
    const r = 6 + k * 7;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + k * 0.4;
      kandydaci.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  let best = null, bestKara = Infinity;
  for (const [x, z] of kandydaci) {
    const o = opisPunktu(x, z);
    const kara = (o.rzeka ? 1000 : 0) + (o.wawoz ? 200 : 0) + o.nachylenie * 100
               + Math.hypot(x, z) * 0.5;
    if (kara < bestKara) { bestKara = kara; best = [x, z, o.y]; }
  }
  return { x: best[0], z: best[1], y: best[2] };
}

// ═══════════════════════════════ PUŁAPKI ══════════════════════════════════════
// Funkcje pomocnicze do pułapek środowiskowych. Wszystkie liczą się z samego
// terenu, więc nie trzeba nic rozsiewać ani trzymać w pamięci per chunk.

/**
 * Siła i kierunek spychania przez nurt. Rośnie z głębokością wody — na brodzie
 * po kostki tylko lekko znosi, w korycie zmiata.
 * @returns {[number,number]} wektor przyspieszenia (jednostki gry / s²), skala do dostrojenia
 */
export function spychanieNurtu(x, z, out) {
  out = out || [0, 0];
  const gw = probka(x, z).glebWody;               // kopiujemy PRZED nurtRzeki
  if (gw <= 0.02) { out[0] = 0; out[1] = 0; return out; }
  nurtRzeki(x, z, out);
  const sila = Math.min(1, gw / 1.1);
  out[0] *= sila; out[1] *= sila;
  return out;
}

/**
 * Czy zbocze jest na tyle strome, że się sypie. Mierzymy nachylenie, więc
 * to najdroższa z pułapek — wołać dla gracza i dla wrogów w polu widzenia,
 * nie dla całej hordy.
 */
export function czyOsuwisko(x, z) {
  return nachylenie(x, z) > PARAM.progOsuwiska;
}

/**
 * 0..1 — jak grząskie jest dno. Błoto jest tam, gdzie woda była, ale już jej
 * nie ma: pas przy samym korycie na dnie wąwozu. Spowalnia wszystkich, ale
 * hordę bardziej, bo horda idzie prosto, a gracz może obiec.
 * W BRODZIE błota nie ma: bród to utwardzony żwir i jedyne czyste przejście,
 * więc spowalnianie właśnie tam zabierałoby mu sens.
 */
export function wspolczynnikBlota(x, z) {
  const s = probka(x, z);
  if (s.fs < 0.9) return 0;
  if (Math.min(s.tA, s.tB) > 0.25) return 0;      // tylko dno, nie ściana
  const pas = PARAM.szerPasaBlota;
  // odległość od KRAWĘDZI zwierciadła, osobno dla każdej sieci; sieć w brodzie pomijamy
  const eA = s.fA > 0.5 ? -1 : s.dA - s.rwA, eB = s.fB > 0.5 ? -1 : s.dB - s.rwB;
  const e = Math.min(eA >= 0 ? eA : Infinity, eB >= 0 ? eB : Infinity);
  if (!isFinite(e) || e > pas) return 0;
  return 1 - e / pas;
}

/**
 * Czy punkt leży na RANCIE wąwozu nad stromą ścianą — czyli tam, gdzie warto
 * postawić chwiejny głaz albo skąd horda może się zsunąć. Tanie: jeden opis
 * punktu i jedna próbka w dół zbocza.
 */
export function czyRant(x, z) {
  const o = opisPunktu(x, z);
  if (o.wawoz || o.nachylenie > 0.8) return false;   // już w środku albo na ścianie
  const k = 5;
  const gx = wysokosc(x + k, z) - wysokosc(x - k, z);
  const gz = wysokosc(x, z + k) - wysokosc(x, z - k);
  const g = Math.hypot(gx, gz);
  if (g < 1e-6) return false;
  // 9 j. w dół spadku: jeśli tam jest o >6 j. niżej, stoimy nad urwiskiem
  return wysokosc(x - gx / g * 9, z - gz / g * 9) < o.y - 6;
}

przeliczStale();
