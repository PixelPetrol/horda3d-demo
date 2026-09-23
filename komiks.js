// ================== KOMIKS WPROWADZAJĄCY (Etap 2, 18.09.2026) ==================
// Fabuła gry w pięciu planszach: leci RAZ przy pierwszym uruchomieniu (o tym, kiedy,
// decyduje main.js przez META.ui.komiks) i na żądanie z menu (przycisk FABUŁA).
// PODPISY RYSUJE SILNIK (PL/EN przez T()) — na planszach nie ma i nie będzie liter,
// bo inaczej każdy język wymagałby osobnego kompletu obrazków (ustalenie z komiks-intro.md).
//
// DLACZEGO OSOBNY PLIK: komiks nie dotyka niczego w pętli gry ani w stanie biegu —
// jedyne, czego potrzebuje, to T/ico/META/saveMeta/STATY/AUDIO. Wstrzykujemy je przez
// `initKomiks`, żeby moduł nie zależał od tego, w którym miejscu main.js stoi blok JĘZYK
// (jest właśnie przenoszony) ani od kolejności importów.

let D = {};              // zależności z main.js (T, ico, META, saveMeta, STATY, AUDIO)
let sesja = null;        // stan otwartego komiksu; null = zamknięty
// Czy plik planszy istnieje: undefined = jeszcze nie wiemy, true = jest, false = brak.
// Trzymane MIĘDZY otwarciami, bo drugie wejście z menu nie ma po co pytać serwera drugi raz.
const STATUS = [];

// Plansze rysuje właściciel (prompty w dokumenty/komiks-intro.md). Dopóki plików nie ma,
// każda plansza ma zastępczy rysunek na <canvas> — komiks działa i da się go przetestować
// już dziś, z samymi podpisami.
const PLANSZE = [
  {
    plik: 'assets/komiks/plansza1.png',
    pl: 'Osiedle Grządkowo. Trzepak był siłownią, piaskownica ringiem, a na rogu stał warzywniak Nonny.',
    en: 'The Blockyard. The carpet rack was the gym, the sandbox was the ring, and Nonna’s veggie stand stood on the corner.',
  },
  {
    plik: 'assets/komiks/plansza2.png',
    pl: 'Aż przyjechała La Famiglia Snackoni. Don Chipso mówił szeptem, bo kto ma sól, nie musi krzyczeć.',
    en: 'Then La Famiglia Snackoni rolled in. Don Chipso spoke in whispers, because whoever has the salt doesn’t need to shout.',
  },
  {
    plik: 'assets/komiks/plansza3.png',
    pl: 'Plan był prosty: zasypać osiedle solą i cukrem, a w miejscu warzywniaka postawić automat. Nic osobistego. Sama sól.',
    en: 'The plan was simple: bury the block in salt and sugar and put a vending machine where the veggie stand used to be. Nothing personal. Just salt.',
  },
  {
    plik: 'assets/komiks/plansza4.png',
    pl: 'Carrotello wstał z kucek. — Nie na moim osiedlu. Warzywa stanęły ramię w ramię.',
    en: 'Carrotello rose from his squat. “Not on my block.” The vegetables stood shoulder to shoulder.',
  },
  {
    plik: 'assets/komiks/plansza5.png',
    pl: 'Broń: witaminy. Przeciwnik: cała Famiglia. Przetrwaj, aż Don Chipso wyjdzie z limuzyny.',
    en: 'Weapon: vitamins. Enemy: the whole Famiglia. Survive until Don Chipso steps out of the limo.',
  },
];

const T = (pl, en) => (D.T ? D.T(pl, en) : pl);
const klik = () => { try { D.AUDIO?.sfx?.('klik'); } catch { /* dźwięk to dodatek, nie warunek */ } };
const stat = (sciezka, tytul) => { try { D.STATY?.zdarzenie?.(sciezka, tytul); } catch { /* statystyki nie mogą wywrócić UI */ } };

export function initKomiks(deps) { D = deps || {}; }

// ------------------------------ RYSUNEK ZASTĘPCZY ------------------------------
// Gdy pliku planszy nie ma (albo się nie wczytał), rysujemy na canvasie 640×360
// to samo tło co na ekranie ładowania (#loadOv): ciemna zieleń w pixelowe „grządki",
// ramka konturu gry i wielki numer planszy. Chodzi o to, żeby brak obrazka wyglądał
// jak element gry, a nie jak zepsuta strona.
function rysujZastepcza(cv, nr) {
  const g = cv.getContext('2d');
  if (!g) return;
  const W = cv.width, H = cv.height;               // 640 × 360
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#121a12'; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 22) {                // pasy 22 px — jak w #loadOv
    g.fillStyle = (x / 22) % 2 ? '#131d13' : '#162115';
    g.fillRect(x, 0, 22, H);
  }
  const bl = g.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, W * 0.5);
  bl.addColorStop(0, 'rgba(120,200,90,.12)'); bl.addColorStop(1, 'rgba(120,200,90,0)');
  g.fillStyle = bl; g.fillRect(0, 0, W, H);
  // dolne ~22% planszy silnik i tak przyciemnia pod podpis — zastępcza plansza
  // pokazuje ten pas, żeby kadrowanie prawdziwych obrazków dało się na niej sprawdzić
  g.fillStyle = 'rgba(0,0,0,.34)'; g.fillRect(0, Math.round(H * 0.78), W, Math.round(H * 0.22));
  // wielki numer planszy (cień w kolorze konturu — ten sam chwyt co w pixelowych przyciskach)
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 132px Pixel, "Courier New", monospace';
  g.fillStyle = '#1b1b22'; g.fillText(String(nr), W / 2 + 6, H / 2 + 6);
  g.fillStyle = '#f5c542'; g.fillText(String(nr), W / 2, H / 2);
  g.font = '700 26px Pixel, "Courier New", monospace';
  g.fillStyle = '#1b1b22'; g.fillText(nr + ' / ' + PLANSZE.length, W / 2 + 3, H * 0.74 + 3);
  g.fillStyle = '#9fd08a'; g.fillText(nr + ' / ' + PLANSZE.length, W / 2, H * 0.74);
  // ramka: cztery prostokąty zamiast strokeRect — obrys ma mieć TWARDĄ krawędź
  g.fillStyle = '#1b1b22';
  g.fillRect(0, 0, W, 8); g.fillRect(0, H - 8, W, 8);
  g.fillRect(0, 0, 8, H); g.fillRect(W - 8, 0, 8, H);
}

// Sonda pliku: ustawienie `src` wprost w <img> pokazywałoby ikonę zepsutego obrazka,
// więc najpierw pytamy osobnym Image i dopiero po `onload` podmieniamy warstwę.
function sonduj(i, poWczytaniu) {
  if (STATUS[i] === true) return;                  // 404 NIE jest cache'owane: po dograniu PNG w tej samej sesji plansza wjedzie przy kolejnym otwarciu
  const proba = new Image();
  proba.onload = () => { STATUS[i] = true; poWczytaniu && poWczytaniu(i); };
  proba.onerror = () => { STATUS[i] = false; };
  proba.src = PLANSZE[i].plik;
}

// ------------------------------ POKAZ ------------------------------
// `opcje.zMenu` = odpalone przyciskiem FABUŁA (main.js wtedy nic nie zapisuje w META).
// Zwraca Promise rozwiązywaną po zamknięciu: { pominiety: bool }.
export function pokazKomiks(opcje = {}) {
  if (sesja) return sesja.p;                       // drugie wywołanie w trakcie = ta sama obietnica
  const ov = document.getElementById('komiksOv');
  const rama = document.getElementById('komiksRama');
  const img = document.getElementById('komiksImg');
  const cv = document.getElementById('komiksCv');
  const podpis = document.getElementById('komiksPodpis');
  const kropki = document.getElementById('komiksKropki');
  const bDalej = document.getElementById('komiksDalej');
  const bPomin = document.getElementById('komiksPomin');
  if (!ov || !rama || !img || !cv || !podpis || !kropki || !bDalej || !bPomin) {
    return Promise.resolve({ pominiety: true });   // brak markupu = komiks po prostu nie leci
  }

  let res;
  const p = new Promise(r => { res = r; });
  const s = sesja = { p, res, i: -1, anim: false, timery: [], zMenu: !!opcje.zMenu };
  const czekaj = (fn, ms) => { s.timery.push(setTimeout(fn, ms)); };

  kropki.innerHTML = PLANSZE.map(() => '<i></i>').join('');
  for (let i = 0; i < PLANSZE.length; i++) sonduj(i, j => { if (sesja === s && s.i === j) warstwa(j); });

  // warstwy: canvas (zastępczy) na dole, <img> nad nim; obrazek wjeżdża dopiero,
  // gdy WIEMY, że plik jest — inaczej przez moment widać ikonę braku
  function warstwa(i) {
    rysujZastepcza(cv, i + 1);
    if (STATUS[i] === true) { img.src = PLANSZE[i].plik; img.classList.add('on'); }
    else img.classList.remove('on');
  }

  function ustaw(i) {
    s.i = i;
    const pl = PLANSZE[i];
    warstwa(i);
    podpis.textContent = T(pl.pl, pl.en);
    [...kropki.children].forEach((k, j) => k.classList.toggle('on', j === i));
    const ostatnia = i === PLANSZE.length - 1;
    // ikona z icons.js (nie emoji — te wyglądają inaczej na każdym systemie i wypadają
    // z pixelowej stylistyki): strzałka „dalej", a na ostatniej planszy trójkąt „graj"
    const znak = D.ico ? ' ' + D.ico(ostatnia ? 'play' : 'strzalka', 16) : '';
    bDalej.innerHTML = (ostatnia ? T('GRAJMY!', 'LET’S GO!') : T('DALEJ', 'NEXT')) + znak;
    bDalej.classList.toggle('koniec', ostatnia);
    // na ostatniej planszy nie ma już czego pomijać; `display:none` (nie `visibility`),
    // bo navItems() filtruje po offsetWidth i pad zaznaczyłby niewidoczny przycisk
    bPomin.style.display = ostatnia ? 'none' : '';
    bPomin.textContent = T('POMIŃ', 'SKIP');
  }

  // przejście: krótkie ściemnienie 180 ms, podpis wjeżdża 120 ms po planszy
  function idzDo(i) {
    if (sesja !== s || s.anim) return;
    if (i >= PLANSZE.length) { zamknij(false); return; }
    s.anim = true;
    rama.classList.add('ciemno'); podpis.classList.add('poza');
    czekaj(() => {
      if (sesja !== s) return;
      ustaw(i);
      rama.classList.remove('ciemno');
      s.anim = false;                              // klikać można już po ściemnieniu
      czekaj(() => { if (sesja === s) podpis.classList.remove('poza'); }, 120);
    }, 180);
  }

  function dalej() { klik(); idzDo(s.i + 1); }
  // POMIŃ na OSTATNIEJ planszy to już nie pominięcie, tylko koniec — przycisk jest tam
  // ukryty, ale pad (B → gpBack → .click()) i tak trafia w jego handler.
  function pomin() { klik(); zamknij(s.i !== PLANSZE.length - 1); }

  // `code` I `key` naraz: reszta gry chodzi na `e.code` (układ fizyczny), ale
  // zdarzenia syntetyczne (automat testowy, klawiatury ekranowe) potrafią przysłać
  // sam `key` — komiks ma ustąpić przy każdym z nich, bo to jedyne wyjście z ekranu.
  const KL_DALEJ = ['Space', 'Enter', 'NumpadEnter', 'ArrowRight', ' ', 'Spacebar', 'Right'];
  const KL_POMIN = ['Escape', 'Esc', 'Backspace'];
  function onKey(e) {
    if (sesja !== s) return;
    // capture + stopPropagation: w main.js wisi globalny keydown (Escape = pauza),
    // a spacja to skok — żaden z nich nie ma prawa zadziałać spod komiksu
    if (KL_DALEJ.includes(e.code) || KL_DALEJ.includes(e.key)) {
      e.preventDefault(); e.stopPropagation(); dalej();
    } else if (KL_POMIN.includes(e.code) || KL_POMIN.includes(e.key)) {
      e.preventDefault(); e.stopPropagation(); pomin();
    }
  }

  function zamknij(pominiety) {
    if (sesja !== s) return;
    sesja = null;
    s.timery.forEach(clearTimeout); s.timery.length = 0;
    removeEventListener('keydown', onKey, true);
    rama.onclick = bDalej.onclick = bPomin.onclick = null;
    ov.style.display = 'none';
    // zamknięcie W TRAKCIE przejścia (ESC / B / POMIŃ w oknie 180 ms) zostawiało `.ciemno`
    // na trwałym elemencie — przy następnym otwarciu plansza była przezroczysta (recenzja 18.09)
    rama.classList.remove('ciemno'); podpis.classList.remove('poza');
    const skad = s.zMenu ? ' (z menu)' : ' (pierwsze uruchomienie)';
    stat(pominiety ? 'komiks/pominiety' : 'komiks/koniec',
      (pominiety ? 'Komiks pominięty na planszy ' + (s.i + 1) : 'Komiks obejrzany do końca') + skad);
    s.res({ pominiety, plansza: s.i + 1 });
  }

  rama.onclick = dalej;                            // dotyk/klik w planszę = dalej
  bDalej.onclick = dalej;                          // pad: A woła .click() na zaznaczonym
  bPomin.onclick = pomin;                          // pad: B → gpBack → .click() na POMIŃ
  addEventListener('keydown', onKey, true);

  ov.style.display = 'flex';
  ov.scrollTop = 0;
  ustaw(0);
  podpis.classList.add('poza');
  czekaj(() => { if (sesja === s) podpis.classList.remove('poza'); }, 120);
  // osobna ścieżka dla FABUŁY z menu — GoatCounter grupuje po `path`, nie po tytule
  stat('komiks/start' + (s.zMenu ? '-menu' : ''), 'Komiks: start' + (s.zMenu ? ' (z menu)' : ' (pierwsze uruchomienie)'));
  return p;
}

// czy komiks jest teraz na ekranie (main.js/gpBack nie musi o tym wiedzieć, ale
// przydaje się w testach i przy ewentualnym blokowaniu skrótów)
export const komiksOtwarty = () => !!sesja;
