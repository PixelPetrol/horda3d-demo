// audio.js — DŹWIĘK: muzyka zależna od fazy gry + kwestie głosowe postaci.
// Bez bibliotek: zwykłe HTMLAudioElement i własne wygaszanie (fade) na tickerze.
// Utwór waży 3-5 MB, więc element <audio> powstaje DOPIERO gdy dany utwór jest
// naprawdę potrzebny — ładowanie strony i start biegu nic nie ciągną z sieci.
// Przeglądarki blokują dźwięk przed interakcją: gramy dopiero po pierwszym
// kliknięciu/dotknięciu/klawiszu (patrz `odblokuj`), wcześniej utwór tylko czeka.
import { ico } from './icons.js?v=2';   // ten sam specyfikator co w main.js = jeden moduł

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
// Muzyka domyslnie CICHO (15%): utwory sa gesta scianka dzwieku i przy 55%
// zabijaly efekty i kwestie postaci. Zyczenie wlasciciela 12.08.
const domyslne = () => ({ muz: 0.15, glos: 0.9, efe: 0.7, mute: 0 });

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
const wzmEfe  = () => (cichoBo() ? 0 : clamp01(S.ust.efe));

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
  const c = ctx();                                   // AudioContext też startuje dopiero po geście
  if (c && c.state === 'suspended') c.resume();
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

// ============================== EFEKTY (SFX) — SYNTEZA, ZERO PLIKÓW ==============================
// Dlaczego synteza, a nie próbki: paczka audio waży już ~14 MB, a efektów leci
// kilkaset na minutę (trafienia przy 300 wrogach). Oscylator + obwiednia to kilka
// bajtów kodu, brzmi pixelowo (chiptune) i pozwala MODULOWAĆ dźwięk parametrem —
// np. „kill" rośnie w górę razem z serią zabójstw. Wszystko idzie przez jeden
// wzmacniacz `magEfe`, więc suwak Efekty działa natychmiast.
let AC = null, magEfe = null, szumBuf = null;
let glosyAkt = 0;                  // ile źródeł aktualnie gra (limit poniżej)
const GLOSY_CAP = 20;              // przy hordzie trzeba ciąć, inaczej dźwięk się zlewa w szum
const ostSfx = {};                 // nazwa -> czas ostatniego odtworzenia (throttle)

function ctx() {
  if (AC) return AC;
  const K = window.AudioContext || window.webkitAudioContext;
  if (!K) return null;
  AC = new K();
  magEfe = AC.createGain();
  magEfe.gain.value = wzmEfe();
  magEfe.connect(AC.destination);
  // 1 s białego szumu — baza wybuchów, trafień i uderzeń (jeden bufor na całą grę)
  szumBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const d = szumBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return AC;
}
const tAC = () => AC.currentTime;

// obwiednia: cichy start → szczyt po `a` → wygaszenie przez `d` (exp, bez kliknięć)
function obwiednia(g, t0, a, d, szczyt) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(szczyt, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}
function pilnuj(src, koniec) {                     // liczenie głosów + sprzątanie
  glosyAkt++;
  src.onended = () => { glosyAkt = Math.max(0, glosyAkt - 1); };
  src.stop(koniec);
}
// TON: oscylator, opcjonalne zjechanie wysokości f → f2
function ton({ f, f2 = null, typ = 'square', a = 0.004, d = 0.08, g = 0.2, op = 0 }) {
  const t0 = tAC() + op;
  const o = AC.createOscillator(), gn = AC.createGain();
  o.type = typ;
  o.frequency.setValueAtTime(f, t0);
  if (f2 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + a + d);
  obwiednia(gn, t0, a, d, g);
  o.connect(gn); gn.connect(magEfe);
  o.start(t0); pilnuj(o, t0 + a + d + 0.02);
}
// SZUM: biały szum przez filtr (bandpass = uderzenie, lowpass = wybuch, highpass = syk)
function szum({ d = 0.15, g = 0.2, f = 900, f2 = null, typ = 'lowpass', q = 1, op = 0 }) {
  const t0 = tAC() + op;
  const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), gn = AC.createGain();
  s.buffer = szumBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;      // lekka losowość = mniej „karabinu"
  fl.type = typ; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t0);
  if (f2 !== null) fl.frequency.exponentialRampToValueAtTime(Math.max(40, f2), t0 + d);
  obwiednia(gn, t0, 0.003, d, g);
  s.connect(fl); fl.connect(gn); gn.connect(magEfe);
  s.start(t0); pilnuj(s, t0 + d + 0.02);
}
const akord = (nuty, opc = {}) => nuty.forEach((f, i) => ton(Object.assign({ f, op: i * (opc.krok || 0.07) }, opc)));

// gap = minimalna przerwa między powtórzeniami (throttle); wazny = wolno przekroczyć limit głosów
const EFEKTY = {
  // --- walka ---
  traf:     { gap: 0.035, f: () => ton({ f: 520, f2: 230, d: 0.05, g: 0.12 }) },
  kryt:     { gap: 0.05,  f: () => { ton({ f: 940, f2: 300, d: 0.09, g: 0.2 });
                                     szum({ d: 0.07, g: 0.14, f: 2800, typ: 'highpass' }); } },
  kill:     { gap: 0.04,  f: o => { const s = Math.min(o.seria || 1, 12);   // seria podnosi ton = dopamina
                                    ton({ f: 170 + s * 28, f2: 70, typ: 'triangle', d: 0.13, g: 0.16 });
                                    szum({ d: 0.09, g: 0.16, f: 1100 + s * 130, typ: 'bandpass', q: 1.4 }); } },
  wybuch:   { gap: 0.06,  f: () => { szum({ d: 0.34, g: 0.26, f: 1600, f2: 90, typ: 'lowpass' });
                                     ton({ f: 130, f2: 42, typ: 'sine', d: 0.3, g: 0.22 }); } },
  piorun:   { gap: 0.08,  f: () => { szum({ d: 0.2, g: 0.22, f: 5200, f2: 700, typ: 'highpass' });
                                     ton({ f: 1400, f2: 220, typ: 'sawtooth', d: 0.12, g: 0.12 }); } },
  strzal:   { gap: 0.11,  f: () => ton({ f: 700, f2: 420, typ: 'triangle', d: 0.04, g: 0.05 }) },
  bossdown: { gap: 0.5, wazny: 1, f: () => { szum({ d: 0.7, g: 0.3, f: 900, f2: 60, typ: 'lowpass' });
                                     akord([220, 165, 110], { typ: 'sawtooth', d: 0.4, g: 0.16, krok: 0.1 }); } },
  boss:     { gap: 1.0, wazny: 1, f: () => { ton({ f: 62, f2: 44, typ: 'sawtooth', d: 0.9, g: 0.2 });
                                     ton({ f: 124, f2: 88, typ: 'square', d: 0.7, g: 0.09, op: 0.05 }); } },
  // --- zbieranie i progresja ---
  xp:       { gap: 0.03,  f: () => ton({ f: 1250, f2: 1600, typ: 'square', d: 0.045, g: 0.06 }) },
  moneta:   { gap: 0.05,  f: () => { ton({ f: 990, d: 0.05, g: 0.11 });        // klasyczne dwie nutki
                                     ton({ f: 1480, d: 0.13, g: 0.11, op: 0.055 }); } },
  serce:    { gap: 0.2, wazny: 1, f: () => akord([523, 659, 784], { typ: 'triangle', d: 0.18, g: 0.14 }) },
  awans:    { gap: 0.3, wazny: 1, f: () => akord([523, 659, 784, 1047], { typ: 'square', d: 0.2, g: 0.15, krok: 0.08 }) },
  skrzynia: { gap: 0.25, wazny: 1, f: () => { szum({ d: 0.18, g: 0.14, f: 500, f2: 1800, typ: 'bandpass', q: 2 });
                                     akord([392, 523, 659], { typ: 'triangle', d: 0.22, g: 0.14, krok: 0.09 }); } },
  zlota:    { gap: 0.3, wazny: 1, f: () => akord([523, 784, 1047, 1319], { typ: 'square', d: 0.26, g: 0.16, krok: 0.09 }) },
  totem:    { gap: 0.3, wazny: 1, f: () => { ton({ f: 300, f2: 1200, typ: 'sine', a: 0.08, d: 0.4, g: 0.16 });
                                     ton({ f: 450, f2: 1800, typ: 'triangle', a: 0.1, d: 0.4, g: 0.08, op: 0.06 }); } },
  // --- gracz ---
  skok:     { gap: 0.06,  f: () => ton({ f: 320, f2: 700, typ: 'square', d: 0.09, g: 0.09 }) },
  ladowanie:{ gap: 0.1,   f: () => { ton({ f: 120, f2: 55, typ: 'sine', d: 0.1, g: 0.14 });
                                     szum({ d: 0.08, g: 0.1, f: 400, typ: 'lowpass' }); } },
  hurt:     { gap: 0.25, wazny: 1, f: () => { ton({ f: 260, f2: 80, typ: 'sawtooth', d: 0.22, g: 0.24 });
                                     szum({ d: 0.14, g: 0.18, f: 700, typ: 'bandpass', q: 0.8 }); } },
  tarcza:   { gap: 0.25, wazny: 1, f: () => { ton({ f: 1700, f2: 900, typ: 'square', d: 0.22, g: 0.14 });
                                     ton({ f: 1130, f2: 700, typ: 'triangle', d: 0.26, g: 0.1, op: 0.02 }); } },
  koniec:   { gap: 1.0, wazny: 1, f: () => akord([392, 330, 262, 196], { typ: 'triangle', d: 0.45, g: 0.18, krok: 0.16 }) },
  // --- ostrzeżenia i UI ---
  zagrozenie:{ gap: 0.8, wazny: 1, f: () => { ton({ f: 740, d: 0.16, g: 0.14, typ: 'square' });
                                     ton({ f: 560, d: 0.22, g: 0.14, typ: 'square', op: 0.19 }); } },
  klik:     { gap: 0.04, wazny: 1, f: () => ton({ f: 880, f2: 1200, typ: 'square', d: 0.035, g: 0.09 }) },
};

function sfx(nazwa, opcje = {}) {
  const e = EFEKTY[nazwa];
  if (!e || !S.odblok || wzmEfe() <= 0) return false;
  const t = zegar();
  if (t - (ostSfx[nazwa] || -99) < (e.gap || 0)) return false;
  if (!ctx()) return false;
  if (AC.state === 'suspended') AC.resume();
  if (glosyAkt > GLOSY_CAP && !e.wazny) return false;       // horda nie zagłuszy ważnych dźwięków
  ostSfx[nazwa] = t;
  try { e.f(opcje); } catch { return false; }
  return true;
}
function stosujWzmEfe() { if (magEfe) magEfe.gain.value = wzmEfe(); }

// ============================== USTAWIENIA W MENU ==============================
function odswiezUI() {
  const m = document.getElementById('volMuz'), g = document.getElementById('volGlos');
  const f = document.getElementById('volEfe');
  if (!m || !g) return;
  m.value = Math.round(S.ust.muz * 100);
  g.value = Math.round(S.ust.glos * 100);
  document.getElementById('volMuzV').textContent = m.value + '%';
  document.getElementById('volGlosV').textContent = g.value + '%';
  if (f) { f.value = Math.round(S.ust.efe * 100); document.getElementById('volEfeV').textContent = f.value + '%'; }
  stosujWzmEfe();
  const b = document.getElementById('btnMute');
  b.innerHTML = cichoBo() ? ico('cisza', 16) + ' WŁĄCZ DŹWIĘK' : ico('glosnik', 16) + ' WYCISZ WSZYSTKO';
  b.classList.toggle('sel', cichoBo());
}

function initUI() {
  const m = document.getElementById('volMuz'), g = document.getElementById('volGlos');
  if (!m || !g) return;
  const eMuz = document.getElementById('etyMuz'), eGlos = document.getElementById('etyGlos');
  const eEfe = document.getElementById('etyEfe'), f = document.getElementById('volEfe');
  if (eMuz) eMuz.insertAdjacentHTML('afterbegin', ico('nuta', 16) + ' ');
  if (eGlos) eGlos.insertAdjacentHTML('afterbegin', ico('glosnik', 16) + ' ');
  if (eEfe) eEfe.insertAdjacentHTML('afterbegin', ico('fala', 16) + ' ');
  if (f) f.oninput = () => {
    S.ust.efe = f.value / 100; S.ust.mute = 0; zapiszUst(); odswiezUI();
    sfx('klik');                                  // od razu słychać, co się ustawia
  };
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
    // stare zapisy siedza na dawnej domyslnej 0.55 — sciagamy je raz do 0.15
    if (S.ust.muz === 0.55) S.ust.muz = 0.15;
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
  // ---- efekty (syntezowane; nazwy w EFEKTY) ----
  sfx,
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
  _stanSfx() {
    return { ac: AC ? AC.state : null, glosyAkt, cap: GLOSY_CAP, wzmEfe: wzmEfe(),
             nazwy: Object.keys(EFEKTY), ostatnie: Object.assign({}, ostSfx) };
  },
  _tick: tick,
  _odblokuj: odblokuj,
};
