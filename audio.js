// audio.js — DŹWIĘK: muzyka zależna od fazy gry + kwestie głosowe postaci.
// Bez bibliotek: zwykłe HTMLAudioElement i własne wygaszanie (fade) na tickerze.
// Utwór waży 3-5 MB, więc element <audio> powstaje DOPIERO gdy dany utwór jest
// naprawdę potrzebny — ładowanie strony i start biegu nic nie ciągną z sieci.
// Przeglądarki blokują dźwięk przed interakcją: gramy dopiero po pierwszym
// kliknięciu/dotknięciu/klawiszu (patrz `odblokuj`), wcześniej utwór tylko czeka.
import { ico } from './icons.js?v=1';   // ten sam specyfikator co w main.js = jeden moduł

// ============================== BIBLIOTEKA UTWORÓW ==============================
const MUZ_DIR = 'assets/audio/muzyka/';
const MUZYKA = {
  menu:  MUZ_DIR + 'carota_caos_club_main_motyw.mp3',          // motyw główny — menu i ekran końca
  boss:  MUZ_DIR + 'don_corleone_overdrive_boss_fight.mp3',    // walka z bossem
  bieg: [MUZ_DIR + 'veggie_riot_parade.mp3',                   // losowany przy starcie biegu
         MUZ_DIR + 'pizza_cartel_panic.mp3'],
  beetino: MUZ_DIR + 'velvet_rope_bruiser_betino.mp3',         // motyw Beetina (gdy nim grasz)
};

// ============================== KWESTIE GŁOSOWE ==============================
// Postacie spoza tej listy po prostu milczą (stara obsada z Rudeusza).
const GLOSY = {
  carrotello: {
    dir: 'assets/audio/glosy/carrotello/',
    start:  ['nie_na_moim_osiedlu.mp3', 'czas_na_porzadki.mp3', 'witaminka_mordo.mp3'],
    seria:  ['kolejny_do_kompostu.mp3', 'sam_sie_prosi.mp3', 'essa.mp3', 'ty_mnie_dotknoles.mp3'],
    awans:  ['witaminka_wjeda.mp3', 'essa.mp3'],
    boss:   ['ale_burdel.mp3', 'jeszcze_raz_i_potobie.mp3'],
    smierc: ['walczylem_w_imie_witamin.mp3', 'zaczyna_bole.mp3'],
  },
  beetino: {
    dir: 'assets/audio/glosy/beetino/',
    start:  ['burakino_betonino_bramka_zamknieto_brainrootstyle.mp3', 'co_ty_tu_robisz.mp3',
             'spokojnie_nie_wejdziesz.mp3'],
    seria:  ['nie_przeszed_selekcji.mp3', 'mowiem_by_nie_podchodzi.mp3', 'koniec_imprezy.mp3'],
    awans:  ['o_ty_may_frytesie_brainroot_style.mp3'],
    boss:   ['nie_podoba_mi_si_twoja_twarz.mp3'],
    smierc: ['mamma_mia_jaki_wafello_brainroot_style.mp3'],
  },
};

const FADE = 1.0;          // sekundy płynnego przejścia między utworami
const COOLDOWN = 8;        // sekundy — globalna przerwa między kwestiami (inaczej to męczy)
const COOLDOWN_WAZNE = 2;  // start biegu i śmierć mogą wejść wcześniej, ale nie od razu
const SERIA_PROG = 8;      // od takiej serii zabójstw postać się odzywa
const SERIA_PRZERWA = 25;  // ...i nie częściej niż co tyle sekund

const zegar = () => performance.now() / 1000;
const clamp01 = v => Math.max(0, Math.min(1, v));
const domyslne = () => ({ muz: 0.55, glos: 0.9, mute: 0 });

const S = {
  meta: null, zapisz: () => {},
  ust: domyslne(),
  odblok: false,                 // czy przeglądarka pozwala już grać
  utwory: new Map(),             // ścieżka -> { el, v, cel }
  biezacy: null,                 // ścieżka utworu, który MA grać
  przedBossem: null,             // dokąd wrócić po zabiciu bossa
  postac: null,                  // klucz postaci z bieżącego biegu
  glosy: new Map(),              // ścieżka -> HTMLAudioElement (kwestie są małe, cache się opłaca)
  glosT: -99, ostatni: null, seriaT: -99,
  ostatniBieg: null,             // żeby nie losować dwa razy z rzędu tego samego utworu
};

// ============================== GŁOŚNOŚCI ==============================
const cichoBo = () => !!S.ust.mute;
const wzmMuz  = () => (cichoBo() ? 0 : clamp01(S.ust.muz));
const wzmGlos = () => (cichoBo() ? 0 : clamp01(S.ust.glos));

// ============================== MUZYKA ==============================
function utwor(sciezka) {
  let t = S.utwory.get(sciezka);
  if (!t) {
    const el = new Audio();
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
    el.src = sciezka;              // pobieranie startuje dopiero TUTAJ (leniwie)
    t = { el, v: 0, cel: 0 };
    S.utwory.set(sciezka, t);
  }
  return t;
}

// przełącz muzykę na dany utwór; reszta wygasza się sama w tickerze
function graj(sciezka) {
  if (S.biezacy === sciezka) return;
  S.biezacy = sciezka;
  odpal();
}
function odpal() {
  for (const [p, t] of S.utwory) if (p !== S.biezacy) t.cel = 0;
  if (!S.biezacy || !S.odblok) return;               // przed pierwszym gestem tylko czekamy
  const t = utwor(S.biezacy);
  t.cel = 1;
  const pr = t.el.play();
  if (pr && pr.catch) pr.catch(() => {});            // zablokowane = spróbujemy po geście
}

let ostTick = zegar();
function tick() {
  const teraz = zegar();
  const dt = Math.min(0.5, teraz - ostTick);
  ostTick = teraz;
  const krok = dt / FADE;
  for (const [, t] of S.utwory) {
    if (t.v < t.cel) t.v = Math.min(t.cel, t.v + krok);
    else if (t.v > t.cel) t.v = Math.max(t.cel, t.v - krok);
    t.el.volume = clamp01(t.v * wzmMuz());
    // wygaszony do zera = zatrzymujemy, żeby nie mielić dekodera w tle
    if (t.cel === 0 && t.v === 0 && !t.el.paused) { t.el.pause(); t.el.currentTime = 0; }
  }
}
setInterval(tick, 50);

// ============================== ODBLOKOWANIE (autoplay policy) ==============================
function odblokuj() {
  if (S.odblok) return;
  S.odblok = true;
  odpal();                                           // to, co czekało, rusza teraz
}
for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'keydown'])
  addEventListener(ev, odblokuj, { once: true, passive: true });

// ============================== KWESTIE GŁOSOWE ==============================
function losuj(lista) {
  if (lista.length === 1) return lista[0];
  let p;
  do { p = lista[Math.floor(Math.random() * lista.length)]; } while (p === S.ostatni);
  return p;
}
// zdarzenie: 'start' | 'seria' | 'awans' | 'boss' | 'smierc'
function mow(zdarzenie, wazne = false) {
  const zestaw = GLOSY[S.postac];
  if (!zestaw) return false;                         // pozostałe postacie milczą
  if (!S.odblok || wzmGlos() <= 0) return false;
  const lista = zestaw[zdarzenie];
  if (!lista || !lista.length) return false;
  const teraz = zegar();
  if (teraz - S.glosT < (wazne ? COOLDOWN_WAZNE : COOLDOWN)) return false;
  const plik = losuj(lista);
  const sciezka = zestaw.dir + plik;
  let el = S.glosy.get(sciezka);
  if (!el) { el = new Audio(sciezka); S.glosy.set(sciezka, el); }
  el.volume = wzmGlos();
  try { el.currentTime = 0; } catch { /* jeszcze się nie wczytał — trudno */ }
  const pr = el.play();
  if (pr && pr.catch) pr.catch(() => {});
  S.glosT = teraz; S.ostatni = plik;
  return true;
}

// ============================== USTAWIENIA W MENU ==============================
function odswiezUI() {
  const m = document.getElementById('volMuz'), g = document.getElementById('volGlos');
  if (!m || !g) return;
  m.value = Math.round(S.ust.muz * 100);
  g.value = Math.round(S.ust.glos * 100);
  document.getElementById('volMuzV').textContent = m.value + '%';
  document.getElementById('volGlosV').textContent = g.value + '%';
  const b = document.getElementById('btnMute');
  b.innerHTML = cichoBo() ? ico('cisza', 16) + ' WŁĄCZ DŹWIĘK' : ico('glosnik', 16) + ' WYCISZ WSZYSTKO';
  b.classList.toggle('sel', cichoBo());
}

function initUI() {
  const m = document.getElementById('volMuz'), g = document.getElementById('volGlos');
  if (!m || !g) return;
  const eMuz = document.getElementById('etyMuz'), eGlos = document.getElementById('etyGlos');
  if (eMuz) eMuz.insertAdjacentHTML('afterbegin', ico('nuta', 16) + ' ');
  if (eGlos) eGlos.insertAdjacentHTML('afterbegin', ico('glosnik', 16) + ' ');
  m.oninput = () => { S.ust.muz = m.value / 100; S.ust.mute = 0; zapiszUst(); odswiezUI(); };
  g.oninput = () => {
    S.ust.glos = g.value / 100; S.ust.mute = 0; zapiszUst(); odswiezUI();
    for (const [, el] of S.glosy) el.volume = wzmGlos();
  };
  document.getElementById('btnMute').onclick = () => {
    S.ust.mute = cichoBo() ? 0 : 1;
    zapiszUst(); odswiezUI();
    if (cichoBo()) for (const [, el] of S.glosy) { el.pause(); }
  };
  odswiezUI();
}
function zapiszUst() {
  if (S.meta) { S.meta.audio = S.ust; S.zapisz(); }
}

// ============================== API DLA GRY ==============================
export const AUDIO = {
  // META i saveMeta wstrzykujemy z main.js (bez tego byłby import w kółko)
  init(meta, zapisz) {
    S.meta = meta;
    S.zapisz = zapisz || (() => {});
    S.ust = Object.assign(domyslne(), meta && meta.audio);
    meta.audio = S.ust;
  },
  initUI,
  odswiezUI,
  // ---- fazy gry ----
  menu() { graj(MUZYKA.menu); S.przedBossem = null; },
  startRun(charKey) {
    S.postac = charKey;
    // Beetino wchodzi ze swoim motywem, reszta dostaje losowy utwór „rozgrywkowy"
    let sc;
    if (charKey === 'beetino') sc = MUZYKA.beetino;
    else {
      const pula = MUZYKA.bieg.filter(p => p !== S.ostatniBieg);
      sc = (pula.length ? pula : MUZYKA.bieg)[Math.floor(Math.random() * (pula.length || MUZYKA.bieg.length))];
      S.ostatniBieg = sc;
    }
    S.przedBossem = null;
    graj(sc);
    mow('start', true);
  },
  bossOn() {
    if (S.biezacy === MUZYKA.boss) return;
    S.przedBossem = S.biezacy;
    graj(MUZYKA.boss);
    mow('boss');
  },
  bossOff() {
    if (S.biezacy !== MUZYKA.boss) return;
    graj(S.przedBossem || MUZYKA.bieg[0]);
    S.przedBossem = null;
  },
  endRun() { this.menu(); },
  // ---- kwestie ----
  event(zdarzenie) { return mow(zdarzenie, zdarzenie === 'smierc'); },
  seria(n) {
    if (n < SERIA_PROG) return false;
    const teraz = zegar();
    if (teraz - S.seriaT < SERIA_PRZERWA) return false;
    if (!mow('seria')) return false;
    S.seriaT = teraz;
    return true;
  },
  setPostac(k) { S.postac = k; },
  // ---- debug / testy (usunąć razem z window.HORDA przed wydaniem) ----
  _stan() {
    const u = {};
    for (const [p, t] of S.utwory) u[p.split('/').pop()] =
      { paused: t.el.paused, vol: +t.el.volume.toFixed(3), cel: t.cel, src: !!t.el.src };
    return { odblok: S.odblok, biezacy: S.biezacy && S.biezacy.split('/').pop(),
             przedBossem: S.przedBossem && S.przedBossem.split('/').pop(),
             postac: S.postac, ust: Object.assign({}, S.ust), utwory: u };
  },
  _tick: tick,
  _odblokuj: odblokuj,
};
