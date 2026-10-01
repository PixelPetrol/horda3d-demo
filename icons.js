// icons.js — pixel-artowe ikony rysowane proceduralnie (ZAMIAST emoji)
// Każda ikona to siatka znaków → canvas → data URL. Paleta wspólna.
const PAL = {
  '.': null,            // przezroczysty
  k: '#1b1b22',         // kontur
  r: '#e2404a', R: '#ff7a7f',      // czerwień (serce)
  y: '#f5c542', Y: '#ffe89a',      // złoto (moneta, gwiazda)
  w: '#f2f2f2', g: '#9aa0a8',      // biel / szarość (kość, czaszka)
  b: '#4f9ed8', B: '#a8d8f5',      // błękit (woda, tarcza)
  n: '#5da344', N: '#8ed26a',      // zieleń (łąka)
  o: '#c9772e', O: '#e8a45c',      // brąz (skrzynia, regał)
  p: '#b06fd8', P: '#d9a8f0',      // fiolet (radio)
  s: '#8a8f85',                    // kamień
  f: '#ff7a1f', F: '#ffc44d',      // ogień
  // symbole PlayStation (glify pada): kolory prawdziwego pada, jasne, bo stoją na ciemnej twarzy
  u: '#8fb8ff', c: '#ff6b6b', m: '#ff8ad8', t: '#4fe0b0',
  // menu A „Warzywniak” (E4 K11a, z dokumenty/menu-makiety/ikony-makiety.js): stal, papier, ciemna zieleń
  C: '#ff7a5e', e: '#2f7a2a', d: '#5a5f6a', D: '#b9bec8', h: '#f5e6c8', H: '#c9b48a',
};

const ART = {
  kukurydza: [
    '...NN...',
    '..NyyN..',
    '.NyYYyN.',
    '.yYYYYy.',
    '.yYyyYy.',
    '.yYYYYy.',
    '..yYYy..',
    '...yy...',
  ],
  pestka: [
    '...oo...',
    '..oOOo..',
    '.oOOOOo.',
    '.oOOOOo.',
    '..oOOo..',
    '..NkkN..',
    '.N.kk.N.',
    '....k...',
  ],
  kapec: [
    '........',
    '..bbbb..',
    '.bBBBBb.',
    'bBBBBBBb',
    'bBBBBBBb',
    '.bBBBBb.',
    '..bbbb..',
    '........',
  ],
  // KRZAK POMIDOROWY (broń „totemowa"): zieleń + trzy czerwone owoce.
  // Ikona musi czytać się przy 13 px w slocie broni, więc owoce są po 2x2 piksele
  // sztuki — jeden piksel zginąłby przy skalowaniu.
  krzak: [
    '...NN...',
    '..NnnN..',
    '.NnrrnN.',
    'NnrrrrnN',
    'nnrrrrnn',
    '.nnrrnn.',
    '..nkkn..',
    '...ok...',
  ],
  czosnek: [
    '...N....',
    '..wNw...',
    '.wwwww..',
    'wwgwgww.',
    'wwgwgww.',
    'wwwwwww.',
    '.wwwww..',
    '..www...',
  ],
  pigulka: [
    '........',
    '..RRw...',
    '.RRRww..',
    'RRRwwww.',
    'RRwwwww.',
    '.Rwwww..',
    '..www...',
    '........',
  ],
  sokowirowka: [
    '..NyyN..',
    '..gwwg..',
    '.gwwwwg.',
    '.gwNNwg.',
    '.gwNNwg.',
    '.gwwwwg.',
    '..gggg..',
    '..g..g..',
  ],
  serce: [
    '..rr.rr..',
    '.rRRrRRr.',
    'rRRRRRRRr',
    'rRRRRRRRr',
    '.rRRRRRr.',
    '..rRRRr..',
    '...rRr...',
    '....r....',
  ],
  sercePuste: [
    '..kk.kk..',
    '.k..k..k.',
    'k.......k',
    'k.......k',
    '.k.....k.',
    '..k...k..',
    '...k.k...',
    '....k....',
  ],
  moneta: [
    '..yyyy..',
    '.yYYYYy.',
    'yYYyyYYy',
    'yYyYYyYy',
    'yYyYYyYy',
    'yYYyyYYy',
    '.yYYYYy.',
    '..yyyy..',
  ],
  czaszka: [
    '..wwww..',
    '.wwwwww.',
    'ww.ww.ww',
    'wwwwwwww',
    '.wwwwww.',
    '..w.w.w.',
    '.w.w.w.w',
    '........',
  ],
  kosc: [
    'ww.....ww',
    'wwww.wwww',
    '.wwwwwww.',
    '..wwwww..',
    '.wwwwwww.',
    'wwww.wwww',
    'ww.....ww',
    '.........',
  ],
  skrzynia: [
    'oooooooo',
    'oOOOOOOo',
    'oOyyyyOo',
    'ooyyyyoo',
    'oOyyyyOo',
    'oOOOOOOo',
    'oooooooo',
    '........',
  ],
  laka: [
    'BBBBBBBB',
    'BBBBBBBB',
    'nnNnnNnn',
    'nNnnnNnn',
    'nnnNnnNn',
    'nNnnNnnn',
    'nnnnnNnn',
    'nnNnnnnn',
  ],
  market: [
    'gggggggg',
    'oOoOoOoO',
    'oooooooo',
    'oROyBpNO',
    'oooooooo',
    'oyOBRNpO',
    'oooooooo',
    'gggggggg',
  ],
  pioruny: [
    '....YY..',
    '...YY...',
    '..YYYY..',
    '.YYYY...',
    '...yy...',
    '..yy....',
    '.yy.....',
    'y.......',
  ],
  pizza: [
    '..oooo..',
    '.oOYYOo.',
    'oOYrYYOo',
    'oOYYYrOo',
    'oOrYYYOo',
    'oOYYrYOo',
    '.oOYYOo.',
    '..oooo..',
  ],
  kula: [
    '..yyyy..',
    '.yYYYYy.',
    'yYYYYYYy',
    'yYYYYYYy',
    'yYYYYYYy',
    'yYYYYYYy',
    '.yYYYYy.',
    '..yyyy..',
  ],
  butelka: [
    '...nn...',
    '...nn...',
    '..nNNn..',
    '.nNNNNn.',
    '.nNNNNn.',
    '.nNNNNn.',
    '.nNNNNn.',
    '..nnnn..',
  ],
  radio: [
    '..k..k..',
    '.kkkkkk.',
    'kpPPPPpk',
    'kpkkkkpk',
    'kpPPPPpk',
    'kppPPppk',
    'kpPPPPpk',
    '.kkkkkk.',
  ],
  kura: [
    '...ww...',
    '..wwww..',
    '.wwfwww.',
    'wwwwwwww',
    'wwwwwwww',
    '.wwwwww.',
    '..y..y..',
    '..y..y..',
  ],
  fala: [
    '........',
    '.ffffff.',
    'f......f',
    'f.FFFF.f',
    'f.FFFF.f',
    'f......f',
    '.ffffff.',
    '........',
  ],
  tarcza: [
    '.BBBBBB.',
    'BBbbbbBB',
    'BbBBBBbB',
    'BbBBBBbB',
    'BbBBBBbB',
    '.bBBBBb.',
    '..bBBb..',
    '...bb...',
  ],
  skarpeta: [
    '..nnnn..',
    '..nNNn..',
    '..nNNn..',
    '..nNNn..',
    '..nNNn..',
    '.nNNNn..',
    'nNNNn...',
    'nnnn....',
  ],
  wiatr: [
    '........',
    '.wwwww..',
    '......w.',
    '.wwwwww.',
    '........',
    '.wwww...',
    '.....w..',
    '.wwwww..',
  ],
  but: [
    '........',
    '.kk.....',
    '.kOk....',
    '.kOk....',
    '.kOkkkk.',
    '.kOOOOk.',
    '.kkkkkk.',
    '........',
  ],
  magnes: [
    '.rr..rr.',
    'rRRrrRRr',
    'rRr..rRr',
    'rRr..rRr',
    'rRr..rRr',
    'rRr..rRr',
    'www..www',
    'www..www',
  ],
  celownik: [
    '...kk...',
    '.kkwwkk.',
    '.kw..wk.',
    'kw.rr.wk',
    'kw.rr.wk',
    '.kw..wk.',
    '.kkwwkk.',
    '...kk...',
  ],
  gwiazda: [
    '...yy...',
    '...YY...',
    'yyyYYyyy',
    '.yYYYYy.',
    '..yYYy..',
    '.yYy.yYy',
    'yy....yy',
    '........',
  ],
  skok: [
    '...ww...',
    '..wwww..',
    '...ww...',
    '.w.ww.w.',
    'w..ww..w',
    '..w..w..',
    '.w....w.',
    'w......w',
  ],
  postac: [
    '..kkkk..',
    '.kOOOOk.',
    '.kOkOkO.',
    '..kOOk..',
    '.kkbbkk.',
    'k.kbbk.k',
    '..kb.bk.',
    '..k...k.',
  ],
  pies: [
    '.o....o.',
    'oOo..oOo',
    'oOOOOOOo',
    'oOkOOkOo',
    'oOOOOOOo',
    '.oOOOOo.',
    '..o..o..',
    '..o..o..',
  ],
  kaptur: [
    '..pppp..',
    '.pPPPPp.',
    'pPkkkkPp',
    'pPkOOkPp',
    '.pkOOkp.',
    '.pPPPPp.',
    '..p..p..',
    '..p..p..',
  ],
  plomien: [
    '...f....',
    '..fF....',
    '.fFFf...',
    'fFFFFf..',
    'fFYYFf..',
    'fFYYFf..',
    '.fFFf...',
    '..ff....',
  ],
  broda: [
    '..kkkk..',
    '.kOOOOk.',
    'kOkOOkOk',
    'kOOOOOOk',
    'k.gggg.k',
    '.gggggg.',
    '..gggg..',
    '...gg...',
  ],
  sklep: [
    'ggggggg.',
    'g.....g.',
    'g.yyy.g.',
    'g.y.y.g.',
    'ggggggg.',
    '.g...g..',
    '.g...g..',
    '........',
  ],
  wykres: [
    'k.......',
    'k....nn.',
    'k..nnnn.',
    'k..nn.nn',
    'k.ynn.nn',
    'kyynn.nn',
    'kyynnynn',
    'kkkkkkkk',
  ],
  mapa: [
    'nnnnbbbb',
    'nnNnbbBb',
    'nnnnnbbb',
    'sssnnnbb',
    'ssnnnnnb',
    'nnnnrnnn',
    'nnnrrrnn',
    'nnnnrnnn',
  ],
  play: [
    '.n......',
    '.nn.....',
    '.nNn....',
    '.nNNn...',
    '.nNNn...',
    '.nNn....',
    '.nn.....',
    '.n......',
  ],
  pauza: [
    '.ww..ww.',
    '.ww..ww.',
    '.ww..ww.',
    '.ww..ww.',
    '.ww..ww.',
    '.ww..ww.',
    '.ww..ww.',
    '........',
  ],
  dom: [
    '...kk...',
    '..kOOk..',
    '.kOOOOk.',
    'kOOOOOOk',
    'kOkOOkOk',
    'kOkOOkOk',
    'kOOOOOOk',
    'kkkkkkkk',
  ],
  korona: [
    'y..y..y.',
    'yy.yy.yy',
    'yYyYYyYy',
    'yYYYYYYy',
    'yYYYYYYy',
    'yyyyyyyy',
    '........',
    '........',
  ],
  zegar: [
    '..wwww..',
    '.w....w.',
    'w..k...w',
    'w..k...w',
    'w..kkk.w',
    'w......w',
    '.w....w.',
    '..wwww..',
  ],
  puchar: [
    'yyyyyyyy',
    'yYYYYYYy',
    '.yYYYYy.',
    '..yYYy..',
    '...yy...',
    '..yyyy..',
    '.yyyyyy.',
    '........',
  ],
  strzalka: [
    '...y....',
    '...yy...',
    'yyyyyy..',
    'yYYYYYy.',
    'yyyyyy..',
    '...yy...',
    '...y....',
    '........',
  ],
  wymiana: [
    '..yyyy..',
    '.y....y.',
    'y..yy..y',
    'y.y..y.y',
    'y.y..y.y',
    'y..yy..y',
    '.y....y.',
    '..yyyy..',
  ],
  nuta: [
    '...wwww.',
    '...wwww.',
    '...w..w.',
    '...w..w.',
    '.www..w.',
    'wwww.www',
    'www.wwww',
    '.w...www',
  ],
  glosnik: [
    '....ww..',
    '...www.b',
    '.wwwww.b',
    'wwwww.bb',
    'wwwww.bb',
    '.wwwww.b',
    '...www.b',
    '....ww..',
  ],
  cisza: [
    '....ww..',
    '...www..',
    '.wwwwwrr',
    'wwwww.r.',
    'wwwww.r.',
    '.wwwwwrr',
    '...www..',
    '....ww..',
  ],
  ostrzezenie: [
    '...f....',
    '...ff...',
    '..fFFf..',
    '..fFkf..',
    '.fFFkFf.',
    '.fFFkFf.',
    'fFFFFFFf',
    'ffffffff',
  ],
  // ---- GLIFY PADA PLAYSTATION (24.09) ----
  // Czcionka UI (Jersey 10) nie ma znaków ✕○□△, a systemowy fallback wstawiłby gładki glif
  // obok pixelowego UI. Rysujemy je tu i skalujemy ×2/×3 (patrz `.gl-pb>img` w ui-hud.css).
  // ===== E2: SKŁADNIKI (spec 08 dodatek C) + Książka kucharska =====
  ser:       ['........','......yk','....yyYk','..yyYYYk','yyYYyYYk','yYYYYYyk','yYyYYYYk','kkkkkkkk'],
  filizanka: ['..w.w...','...w.w..','kwwwwwk.','kwooowkk','kwooowkk','.kwwwk..','wwwwwwww','.gggggg.'],
  papryczka: ['......n.','.....n..','....rr..','...rRr..','..rRr...','.rRr....','rRr.....','rr......'],
  rosol:     ['.w..w...','..w..w..','........','yyyyyyyy','kYYYYYYk','.kooook.','..kook..','...kk...'],
  lornetka:  ['........','.kk..kk.','.kkkkkk.','kkk..kkk','kBbkkBbk','kbbkkbbk','.kk..kk.','........'],
  pokrywka:  ['........','...kk...','...gg...','.gggggg.','gwwwwwwg','gggggggg','kkkkkkkk','........'],
  ksiazka:   ['.oooooo.','oOOOOOOo','oOyyyyOo','oOOOOOOo','oOyyyyOo','oOOOOOOo','owwwwwwo','.oooooo.'],
  // ---- menu A „Warzywniak” (E4 K11a): ikony z makiet (ikony-makiety.js), bez PixelLab ----
  papryczkaPusta: ['......ss','.....ss.','....ggD.','...gDDg.','..gDDg..','.gDgg...','gDg.....','gg......'],
  zebatka:   ['...DD...','.D.DD.D.','.DDddDD.','DDd..dDD','DDd..dDD','.DDddDD.','.D.DD.D.','...DD...'],
  garnek:    ['..kggk..','.kDDDDk.','kDwrwrDk','kDrwrwDk','kDwrwrDk','kDDDDDDk','.kDDDDk.','..k..k..'],
  zeszyt:    ['kkkkkkk.','khhhhhhk','khHHHHhk','khhhhhhk','khHHHHhk','khhhhhhk','khHHhhhk','kkkkkkk.'],
  sloik:     ['.kkkkkk.','.kggggk.','kBBBBBBk','kByyYyBk','kByYyyBk','kByyyYBk','kBBBBBBk','.kkkkkk.'],
  kalendarz: ['.k.kk.k.','kkkkkkkk','krrrrrrk','khhhhhhk','khkhkhhk','khhhhhhk','khkhchhk','kkkkkkkk'],
  teczka:    ['..kkkk..','.kOooOk.','kkkkkkkk','kOOOOOOk','kOOrrOOk','kOOOOOOk','kOOOOOOk','kkkkkkkk'],
  dzwonek:   ['...yy...','..yYYy..','.yYYYYy.','.yYYYYy.','.yYYYYy.','yYYYYYYy','yyyyyyyy','...kk...'],
  paczka:    ['...rr...','.kkrrkk.','kOOrrOOk','kkkrrkkk','kOOrrOOk','kOOrrOOk','kOOrrOOk','kkkkkkkk'],
  pinezka:   ['.kkkk...','kcCCck..','kcCCck..','kccccck.','.kccck..','..kkk...','...k....','...k....'],
  ptaszek:   ['........','.......n','......nn','n....nn.','nn..nn..','.nnnn...','..nn....','........'],
  klodka:    ['..kkkk..','.k....k.','.k....k.','yyyyyyyy','yYYkkYYy','yYYkkYYy','yYYYYYYy','yyyyyyyy'],
  psKrzyzyk: [
    'u......u',
    'uu....uu',
    '.uu..uu.',
    '..uuuu..',
    '..uuuu..',
    '.uu..uu.',
    'uu....uu',
    'u......u',
  ],
  psKolo: [
    '..cccc..',
    '.cc..cc.',
    'cc....cc',
    'c......c',
    'c......c',
    'cc....cc',
    '.cc..cc.',
    '..cccc..',
  ],
  psKwadrat: [
    'mmmmmmmm',
    'mmmmmmmm',
    'mm....mm',
    'mm....mm',
    'mm....mm',
    'mm....mm',
    'mmmmmmmm',
    'mmmmmmmm',
  ],
  psTrojkat: [
    '...tt...',
    '...tt...',
    '..tttt..',
    '..t..t..',
    '.tt..tt.',
    '.t....t.',
    'tttttttt',
    'tttttttt',
  ],
};

const cache = new Map();
// zwraca data URL ikony (px = wielkość piksela). 01.10 IKONY v3: jeśli nazwa ma wersję v2/v3 (ART2), dostajesz ją
// (z jasnym obrysem naklejki, siatka 18×18) — tła przycisków w biegu, tekstura dania nad Skrzynią Kaprala, strzałka.
export function icon(name, px = 4) {
  const n2 = nazwa2(name);
  return n2 ? ikona2(n2, px) : iconStara(name, px);
}
// stara siatka 8×8 bez zmian (glify pada; arkusz „stare obok nowych")
export function iconStara(name, px = 4) {
  const key = name + '@' + px;
  if (cache.has(key)) return cache.get(key);
  const art = ART[name];
  if (!art) return '';
  const w = art[0].length, h = art.length;
  const c = document.createElement('canvas');
  c.width = w * px; c.height = h * px;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < art[y].length; x++) {
      const col = PAL[art[y][x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x * px, y * px, px, px);
    }
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
// IKONA Z OBRYSEM (menu, 29.09 „ikonki muszą być bardziej czytelne"): ta sama siatka 8×8 w ramce — 1 piksel siatki
// ciemnego konturu (kol) dookoła każdego zamalowanego piksela, opcjonalnie drugi, jasny (kol2) na zewnątrz („naklejka":
// czytelna i na ciemnym drewnie, i na jasnym papierze). Siatka 10×10 (jeden obrys) albo 12×12 (dwa). Rozmiar CSS =
// wielokrotność siatki (main.js: --ikN), image-rendering: pixelated — bez rozmycia.
export function iconObrys(name, px = 4, kol = '#1b1b22', kol2 = null) {
  const key = name + '@o' + px + kol + (kol2 || '');
  if (cache.has(key)) return cache.get(key);
  const art = ART[name];
  if (!art) return '';
  const m = kol2 ? 2 : 1;                             // margines siatki
  const w = art[0].length + 2 * m, h = art.length + 2 * m;
  const mapa = [];                                     // 0 pusto, 1 sztuka, 2 kontur, 3 obrys jasny
  for (let y = 0; y < h; y++) { mapa.push(new Array(w).fill(0)); }
  for (let y = 0; y < art.length; y++) for (let x = 0; x < art[y].length; x++) if (PAL[art[y][x]]) mapa[y + m][x + m] = 1;
  const pierscien = (z, na) => {
    const dod = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (mapa[y][x]) continue;
      let obok = false;
      for (let dy = -1; dy <= 1 && !obok; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx;
        if ((dx || dy) && yy >= 0 && yy < h && xx >= 0 && xx < w && z.includes(mapa[yy][xx])) { obok = true; break; }
      }
      if (obok) dod.push([x, y]);
    }
    for (const [x, y] of dod) mapa[y][x] = na;
  };
  pierscien([1], 2);
  if (kol2) pierscien([1, 2], 3);
  const c = document.createElement('canvas');
  c.width = w * px; c.height = h * px;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = mapa[y][x];
    if (!v) continue;
    g.fillStyle = v === 2 ? kol : v === 3 ? kol2 : PAL[art[y - m][x - m]];
    g.fillRect(x * px, y * px, px, px);
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
// gotowy tag <img> do wstawienia w innerHTML.
// 01.10 IKONY v3: nazwa z wersją v2/v3 (ART2) → ikona 16×16 z obrysem (18×18) w rozmiarze `ik3px(size)` = CAŁKOWITA
// liczba pikseli urządzenia na piksel siatki (bez rozmytych / nierównych pikseli). Serduszko w drobnym tekście (≤ 13 px)
// = mini 9×8. Reszta (glify pada, rzeczy bez v2) — stara siatka 8×8 jak dawniej.
export function ico(name, size = 32) {
  if (size <= 13 && ART2[name + 'M']) return icoM(name + 'M', size);
  const n2 = nazwa2(name);
  if (n2) { const s = ik3px(size); return `<img class="pxi ik3" src="${ikona2(n2, 4)}" style="width:${s}px;height:${s}px" alt="">`; }
  return `<img class="pxi" src="${iconStara(name, 4)}" style="height:${size}px" alt="">`;
}
// kafelek o rozmiarze z CSS (sloty broni i składników w HUD: `--i3k40` itd., liczone w `ik3Zmienne`) — bez stylu inline
export function icoKafel(name) {
  const n2 = nazwa2(name);
  return n2 ? `<img class="pxi ik3" src="${ikona2(n2, 4)}" alt="">` : `<img class="pxi" src="${iconStara(name, 4)}" style="height:20px" alt="">`;
}
// mini ikona (siatka 9×8 bez obrysu, np. serca w HUD) o wysokości `h` px — szerokość z proporcji jak stara 9×8
export function icoM(name, h) {
  return `<img class="pxi ik3m" src="${ikona2(name, 4, null)}" style="height:${h}px" alt="">`;
}
// rozmiar CSS ikony v2/v3 najbliższy `css`, ale w całych pikselach urządzenia na piksel siatki 18. `max` = największy
// nie większy niż `css` (kafelki). Drobne (≤ 16 px) nie maleją poniżej 90% — przy dpr 2 „13 px" to 18, nie 9.
export function ik3px(css, max = false) {
  const d = (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1;
  let k;
  if (max) k = Math.max(1, Math.floor(css * d / SIATKA2 + 1e-6));
  else {
    k = Math.max(1, Math.round(css * d / SIATKA2));
    if (k * SIATKA2 / d < css * (css <= 16 ? 0.9 : 0.68)) k++;
  }
  return k * SIATKA2 / d;
}
// zmienne CSS na :root (wołane przy starcie i przy zmianie rozmiaru / dpr): `--i3-N` (najbliższy), `--i3f-N` (≤ N)
// i `--i3kN` (ikona w kafelku N px: ≤ N−6, a gdy wychodzi < 55% kafelka — ≤ N−4; dpr 1 i kafelek 40 → 36, dpr 2 → 27)
const IK3_ROZM = [18, 20, 24, 28, 30, 32, 34, 36, 38, 40, 46, 56, 72, 96];
const IK3_KAFLE = [24, 26, 34, 40];
export function ik3Zmienne(el = document.documentElement) {
  const st = el.style;
  for (const n of IK3_ROZM) { st.setProperty('--i3-' + n, ik3px(n) + 'px'); st.setProperty('--i3f-' + n, ik3px(n, true) + 'px'); }
  for (const n of IK3_KAFLE) {
    let s = ik3px(n - 6, true);
    if (s < n * 0.55) s = ik3px(n - 4, true);
    st.setProperty('--i3k' + n, s + 'px');
  }
}
export const ICON_NAMES = Object.keys(ART);

// ═════════════════════════════ IKONY v2 (01.10.2026, menu „Warzywniak" + znaczniki skrzyń w HUD) ═════════════════════════════
// Życzenie właściciela: „ikonki w menu jak ustawienia, postacie itp." — ładniejsze i czytelniejsze niż siatki 8×8.
// Siatka 16×16 z RĘCZNYM ciemnym konturem (k), 3–5 kolorów na ikonę z ciepłej palety PAL2. `ikona2()` dokłada jasny obrys
// „naklejki" (1 piksel siatki, jak `iconObrys` z 29.09) → siatka 18×18. Rozmiar CSS = całkowita wielokrotność 18 pikseli
// URZĄDZENIA (main.js: `--ik24/36/48`, `ik2px`), image-rendering: pixelated. Arkusz: narzedzia/arkusz_ikon.html.
const PAL2 = {
  '.': null,
  k: '#1b1b22',                                        // kontur (ten sam co --kontur w CSS)
  r: '#a8282e', R: '#e2404a', q: '#ff8a80',             // czerwień: cień / kolor / blask
  y: '#c8861c', Y: '#f5c542', z: '#fff0a8',             // złoto
  o: '#6e3d1e', O: '#a8642e', l: '#d89a5a',             // drewno, wiklina
  n: '#2f6e2a', N: '#5da344', m: '#a6dc62',             // zieleń
  h: '#d9c08e', H: '#fbecc6', w: '#ffffff',             // papier, krem
  d: '#4a4f5a', D: '#8f96a3', S: '#d0d5de',             // stal
  b: '#2f6db8', B: '#69b2ee', c: '#c4ecff',             // błękit
  p: '#5a2f86', P: '#9a62d4', v: '#d2b2f6',             // fiolet (Famiglia, kaprale)
  a: '#d0581a', A: '#ff9638', F: '#ffd060',             // pomarańcz (marchew, ogień)
  e: '#c98a2e', E: '#f2cc6e',                           // chips
  g: '#2e323a',                                         // ciemne wnętrze
  i: '#9e2f63', I: '#e0619a', j: '#ffacd0',             // v3: róż (kapeć La Ciabatty, rzodkiewka)
  u: '#6f7a1f', U: '#b4c23c',                           // v3: oliwka (Oliwa Nonny, kałuża)
};
const ART2 = {};
export const ART2_NAZWY = [];
function dodaj2(nazwa, wiersze) { ART2[nazwa] = wiersze; ART2_NAZWY.push(nazwa); }
// --- WSZYSTKIE IKONY v2 niżej (kolejność = kolejność na arkuszu) ---
// @@ART2@@
dodaj2('zebatka', [
  '......kkkk......', '..kk..kSDk..kk..', '.kSDk.kSdk.kSDk.', '.kDDDkSDDDkSDdk.',
  '..kSDSddddSDdk..', '..kSDdkkkkDDdk..', 'kkSDdkzzzYkSDDkk', 'kSDDdkzYYykSDDDk',
  'kDDDdkzYYykSDDdk', 'kkDDdkYyyykSDdkk', '..kSDDkkkkSDdk..', '..kSDdSSSSdDdk..',
  '.kSDdkDDDdkDDDk.', '.kDdk.kSdk.kDdk.', '..kk..kDdk..kk..', '......kkkk......',
]);
dodaj2('postac', [
  '.....kk..kk.....', '....kmNkkmNk....', '...kNNNmmNNNk...', '....kNnnnnnk....',
  '...kFFFFFFFAk...', '..kFAAAAAAAAAk..', '..kAaaaaaaaaak..', '..kkkkkkkkkkkk..',
  '..kkwkkFAkwkkk..', '..kAkkFAAAkkAk..', '..kAFFAAaaAAkk..', '...kAAAakkkAk...',
  '....kAaAFFAk....', '.....kAAAak.....', '......kAak......', '.......kk.......',
]);
dodaj2('sklep', [
  '..........k..k..', '.........kk.kk..', '...kk....kNkNk..', '..kRNkk..kmmNNk.',
  '.kqRqqRkkmNNNnk.', '.kqwRRRRkmNNnk..', '.kRRRRRrkmNNnk..', '..kRrrrkNnnnnk..',
  'kkkkkkkkkkkkkkkk', 'kllllllllllllllk', 'kOOoOOoOOoOOoOOk', '.kllllllllllllk.',
  '.kOOoOOoOOoOOOk.', '.kllllllllllllk.', '..kOOoOOoOOoOk..', '...kkkkkkkkkk...',
]);
dodaj2('ksiazka', [
  '................', '..kkkkkkkkkkkk..', '..krqqqqqqqqqRk.', '..krRrrrrrrrRrk.',
  '..krrzzzzzzYqrk.', '..krrzoooooyqrk.', '..krrzYYYYYyqrk.', '..krrzooooYyqrk.',
  '..krrYyyyyyyqrk.', '..krRqqqqqqqRrk.', '..krRRRRRRRRRrk.', '..krRRRRRRRRRrk.',
  '..krRRRRRRRRRrk.', '..kRrrrrrRRrrrk.', '...kkkkkkYYkkkk.', '.........kk.....',
]);
dodaj2('teczka', [
  '................', '.kkkkkk.........', '.kllllOkkkkkkkk.', '.kOooooOOOOOOOk.',
  '.kkkkkkkkkkkkkk.', '.kHHlkkkkkklHlk.', '.kHOkzEEzEEklOk.', '.klkzekkEkkEklk.',
  '.klkzekRekReklk.', '.klkEEzekzEeklk.', '.kHlkzeEEEekHOk.', '.kHOkEkEkEkkHOk.',
  '.kHllkkkkkkHlOk.', '.klOOllllllOOOk.', '.kkkkkkkkkkkkkk.', '................',
]);
dodaj2('zeszyt', [
  '................', '..k.k.k.k.k.k...', '.kDkDkDkDkDkDk..', '.kmmNmNmNmNmnk..',
  '.kmNnnnnnnnNnk..', '.kmnwwwwwwHmnk..', '.kmnwhhhhhhmnk..', '.kmnHhhhhhhmnk..',
  '.kmNmmmmmmmNnk..', '.kmNNNNNNNNNnk..', '.kmNNNNNNNNNnk..', '.kmNNNNNNNNNnk..',
  '.kmNNNNNNNNNnk..', '.kNnnnnnnnnnnk..', '..kkkkkkkkkkkk..', '................',
]);
dodaj2('sloik', [
  '................', '...kkkkkkkkkk...', '..kRwRwRwRwRwk..', '..kwRwRwRwRwRk..',
  '...kkkkkkkkkk...', '....kcwccccBk...', '..kkcwcccccBkk..', '.kcRRRRRRRRRRBk.',
  '.kcRqRRRRRRRrBk.', '.kcRHHHHHHHHrBk.', '.kcRHhhhhhhHrBk.', '.kcRHHHHHHHHrBk.',
  '.kcRRRRRRRRrrBk.', '.kcrRRRRRRrrrBk.', '..kBBBBBBBBBBk..', '...kkkkkkkkkk...',
]);
dodaj2('mapa', [
  '................', '.kkkkkkkkkkkkkk.', '.kHHHHhHHHhHHHk.', '.kHmNNhHHHhBBHk.',
  '.kNNNNNHHHBBBBk.', '.kNNNNNNHHhBBHk.', '.kHNNNNhHHhHHHk.', '.kHHHHhRHHhHHHk.',
  '.kHHHHhHHHhHHHk.', '.kHHHHhHHRhHHHk.', '.kHHHHhHHHhHHHk.', '.kHHHHhHHHRHRHk.',
  '.kHHHHhHHHhRHHk.', '.kHHHHhHHHRHRHk.', '.kkkkkkkkkkkkkk.', '................',
]);
dodaj2('moneta', [
  '.....kkkkkk.....', '...kkzzzzzYkk...', '..kzzYYYYYYzYk..', '.kzYYYYYYYYYYYk.',
  '.kzYYYyyyyYYYyk.', 'kzYYYyYYYYzYYYYk', 'kzYYyYzYYYYzYYyk', 'kzYYyYzYYYYzYYyk',
  'kzYYyYYYYYYzYYyk', 'kzYYyYYYYYYzYYyk', 'kYYYYyYYYYzYYYyk', '.kzYYYzzzzYYYyk.',
  '.kYYYYYYYYYYYyk.', '..kYyYYYYYYyyk..', '...kkYyyyyykk...', '.....kkkkkk.....',
]);
dodaj2('koperta', [
  '................', '................', '.kkkkkkkkkkkkkk.', '.kkhHHHHHHHHhkk.',
  '.kHkhHHHHHHhkHk.', '.kHHkhHHHHhkHHk.', '.kHHHkhHHhkHHHk.', '.kHHHHkRRkHHHHk.',
  '.kHHHkRqRRkHHHk.', '.kHHkhRRRrkhHHk.', '.kHkhHkrrkHhkHk.', '.kkhHHHkkHHHhkk.',
  '.khhhhhhhhhhhhk.', '.kkkkkkkkkkkkkk.', '................', '................',
]);
dodaj2('komiks', [
  '................', '.kkkkkkkkkkkkkk.', '.kBBBBBkAAAAAAk.', '.kBYYBBkAAAAAAk.',
  '.kBYYBBkAkAAkAk.', '.kBBBBBkAAAAAAk.', '.kNNNNNkAAkkAAk.', '.kkkkkkkkkkkkkk.',
  '.kHHHHHHHHHHHHk.', '.kHkkkkkkkkkHHk.', '.kHkwwwwwwwkHHk.', '.kHkwkwkwkwkHHk.',
  '.kHkwwwwwwwkHHk.', '.kHkkkwkkkkkHHk.', '.kHHHkkHHHHHHHk.', '.kkkkkkkkkkkkkk.',
]);
dodaj2('strzL', [
  '................', '..........kk....', '.........kYzk...', '........kYYYk...',
  '.......kYYYk....', '......kYYYk.....', '.....kYYYk......', '....kYYzk.......',
  '....kyYzk.......', '.....kyYzk......', '......kyYzk.....', '.......kyYzk....',
  '........kyYzk...', '.........kyYk...', '..........kk....', '................',
]);
dodaj2('strzP', [
  '................', '....kk..........', '...kzYk.........', '...kYYYk........',
  '....kYYYk.......', '.....kYYYk......', '......kYYYk.....', '.......kzYYk....',
  '.......kzYyk....', '......kzYyk.....', '.....kzYyk......', '....kzYyk.......',
  '...kzYyk........', '...kYyk.........', '....kk..........', '................',
]);
dodaj2('zegar', [
  '.....kkkkkk.....', '...kkqRRRRRkk...', '..kqRrwwwHRRRk..', '.kqrwwHrHHwHRRk.',
  '.kRwHHhkwHHHHRk.', 'kqrwHHhkwHHHhRRk', 'kRwHHHhkwHHHHHRk', 'kRwHHHhkHhhHHhRk',
  'kqrHHHhkkkkwHrrk', 'kRHHHHHwwwwHHhRk', 'kRRwHHHHHHHHhqrk', '.kRHHHHHHHHHhRk.',
  '.kRRHhHrHHhhqrk.', '..kRRRHhhhqRrk..', '...kkRRRRRrkk...', '.....kkkkkk.....',
]);
dodaj2('czaszka', [
  '................', '.....kkkkkk.....', '...kkzzzzzEkk...', '..kzzEeEEEEzEk..',
  '.kzeeeEEEEeeeEk.', '.kEkkkzEEekkkEk.', '.kEkkREEEekRkEk.', '.kEkkkzeeekkkEk.',
  '..kzzzekkzzzEk..', '..kEeEekkzEEek..', '...kEeEEzeEek...', '....kkEkEkEkk...',
  '....kEeEeEeEk...', '.....kkkkkkk....', '................', '................',
]);
dodaj2('korona', [
  '................', '................', '................', '.kkk...kk...kkk.',
  '.kRk..kRRk..kRk.', '.kzYk.kzyk.kzyk.', '.kzYYkzYYYkzYyk.', '.kzYYzYYYYzYYyk.',
  '.kzYYYYYYYYYYyk.', '.kYyyyyyyyyyyyk.', '.kkkkkkkkkkkkkk.', '.kzRRzzqRzzRRYk.',
  '.kYRryyRryyRryk.', '.kkkkkkkkkkkkkk.', '................', '................',
]);
dodaj2('laka', [
  'kkkkkkkkkkkkkkkk', 'kccccccccccYYYck', 'kcccccccccYzzYYk', 'kcccccccccYYzYYk',
  'kccccccccccYYYck', 'kcccccccccccccck', 'kccccmmmccccccck', 'kcccmmmmmmcccmmk',
  'kmmmmmmmmmmmmmmk', 'kmmmNNNNmmmmNNNk', 'kNNNNNNNNNNNNNNk', 'kNNNNNRNNNNNNNNk',
  'kNNNNRYRNNNnNNNk', 'kNnNNNRNNNNNNNnk', 'kNNNNNnNNNNNNNNk', 'kkkkkkkkkkkkkkkk',
]);
dodaj2('dom', [
  'kkkkkkkkkkkkkkkk', 'kcccccccccccccck', 'kcckkkkkkkkkkcck', 'kcckSSSSSSSDkcck',
  'kcckSYSYSbSDkcck', 'kcckSSSSSSSDkcck', 'kcckSbSYSYSDkcck', 'kcckSSSSSSSDkcck',
  'kcckSYSbSYSDkcck', 'kcckSSSSSSSDkcck', 'kcckSYSYSbSDkcck', 'kNNkSSSkkSSDkNNk',
  'kNmkSSSkkSSDkmNk', 'kNNkkkkkkkkkkNNk', 'kNNNNNNNNNNNNNNk', 'kkkkkkkkkkkkkkkk',
]);
dodaj2('wawozy', [
  'kkkkkkkkkkkkkkkk', 'kcccccccccccccck', 'kAAcccccccccccck', 'kAAAcccccccccAAk',
  'kaAAAccccccccAAk', 'kaAAAAccccccAAak', 'kaaAAAccccccAAak', 'koaaAAAccccAAaak',
  'koaaaAAAccAAAaak', 'kooaaaAAccAAaaok', 'kooaaaaABBAaaaok', 'koooaaaBBBBaaook',
  'kooooaBBcBBBaook', 'kooooBBBBBcBBook', 'koooBBcBBBBBBBok', 'kkkkkkkkkkkkkkkk',
]);
dodaj2('market', [
  'kkkkkkkkkkkkkkkk', 'kcccccccccccccck', 'kckkkkkkkkkkkkck', 'kckRRRRRRRRRRkck',
  'kckRwRwwRwRwRkck', 'kkkkkkkkkkkkkkkk', 'kBwBwBwBwBwBwBwk', 'kBwBwBwBwBwBwBwk',
  'kkBkBkBkBkBkBkBk', 'kHHHHHHHHHHHHHHk', 'kHkkkkHkkHkkkkHk', 'kHkcccHkkHkcccHk',
  'kHkcbbHkdHkcbbHk', 'kHkkkkHkdHkkkkHk', 'kDDDDDDDDDDDDDDk', 'kkkkkkkkkkkkkkkk',
]);
dodaj2('but', [
  '................', '................', '...kkkkk........', '...kqqqRk.......',
  '...kqwwrk.......', 'kk.kqRwwRk......', '...kqRRwwRkk....', 'kk.kqRRRRRqRkk..',
  '..kqRRRRRRRRqRk.', 'k.kqrrrrrrrrrrRk', '..kwwwwwwwwwwwwk', '...kkkkkkkkkkkk.',
  '................', '................', '................', '................',
]);
dodaj2('serce', [
  '................', '..kkkk....kkkk..', '.kqqqRk..kqqqRk.', 'kqRRRRRkkqRRRRRk',
  'kqRwwRRqqRRRRRrk', 'kqRwRRRRRRRRRRrk', 'kRRRRRRRRRRRRRrk', '.kqRRRRRRRRRRrk.',
  '.kRRRRRRRRRRRrk.', '..kRRRRRRRRRrk..', '...kRRRRRRRrk...', '....kRRRRRrk....',
  '.....kRRRrk.....', '......kRrk......', '.......kk.......', '................',
]);
dodaj2('sila', [
  '................', '................', '................', '..kk........kk..',
  '.kqRk......kqRk.', '.kqrk......kqrk.', '.kqRRkkkkkkqRrk.', '.kqRrSSSSSSqRrk.',
  '.kqRrkkkkkkRRrk.', '.kqrk......kqrk.', '.kRrk......kRrk.', '..kk........kk..',
  '................', '................', '................', '................',
]);
dodaj2('magnes', [
  '................', '....kkkkkkkk....', '...kqqqqqqqRk...', '..kqRRrrrrRRRk..',
  '.kqRRrkkkkRRRRk.', '.kqRrk....kqRrk.', '.kqRrk....kqRrk.', '.kqRrk....kqRrk.',
  '.kRrrk....kRrrk.', '.kkkkk....kkkkk.', '.kwwSk....kwwSk.', '.kSDDk....kSDDk.',
  '.kkkkk....kkkkk.', '................', '................', '................',
]);
dodaj2('klatwa', [
  '......k.........', '......kk....k...', '.....kPk...kk...', '..k..kvPk..kPk..',
  '..kk.kvPPk.kPk..', '..kPkPpppPkvPPk.', '..kvPzzzzzYPPpk.', '..kPzYYYYYYYPpk.',
  '..kzYYyyyyYYYk..', '..kzYyYYYYzYyk..', '..kzYyYYYYzYyk..', '..kYYYzzzzYYyk..',
  '...kYYYYYYYyk...', '....kYyyyyyk....', '.....kkkkkk.....', '................',
]);
dodaj2('naboje', [
  '................', '..kk...kk...kk..', '.kFAk.kFAk.kFAk.', '.kFak.kFak.kFak.',
  '.kAak.kAak.kAak.', '.kkkk.kkkk.kkkk.', '.kzYk.kzYk.kzYk.', '.kzyk.kzyk.kzyk.',
  '.kzyk.kzyk.kzyk.', '.kzyk.kzyk.kzyk.', '.kYyk.kYyk.kYyk.', 'kkkkkkkkkkkkkkkk',
  'kSSSSSSSSSSSSSDk', 'kSDdDDDDDDDDdDdk', 'kDdddddddddddddk', 'kkkkkkkkkkkkkkkk',
]);
dodaj2('glosnik', [
  '................', '................', '......kk....k...', '.....kdk..k..k..',
  '....kDgk...k..k.', '.kkkddgk.k..k.k.', '.kwwSDgk.k..k.k.', '.kwSDDgk.k..k.k.',
  '.kSDDDgk.k..k.k.', '.kkkddgk.k..k.k.', '....kdgk...k..k.', '.....kdk..k..k..',
  '......kk....k...', '................', '................', '................',
]);
dodaj2('jezyk', [
  '................', '.kkkkkkkk.......', 'kcccccccBk......', 'kcwwBwwwbk......',
  'kcBBBBBBbk......', 'kcwwwBwwBBkkkkk.', 'kBBBbbbbbwwwwwwk', '.kBbkkkkwwwwwwSk',
  '..kk....kwwwwwSk', '.kk.....kwSSSSSk', '........kqqqqqRk', '........kqRRRRrk',
  '........kRrrRRrk', '.........kkkRrk.', '............kk..', '.............k..',
]);
dodaj2('ekran', [
  '................', '................', '.kkkkkkkkkkkkkk.', '.kDdddddddddddk.',
  '.kdcccccccccBdk.', '.kdcyyBBBByybdk.', '.kdcyBBBBBBybdk.', '.kdcBBBBBBBBbdk.',
  '.kdcBBBBBBBBbdk.', '.kdcyBBBBBBybdk.', '.kdcyyBBBByybdk.', '.kdBbbbbbbbbbdk.',
  '.kdddddddddddgk.', '.kkkkkkkkkkkkkk.', '................', '................',
]);
dodaj2('pad', [
  '................', '................', '................', '...kkkkkkkkkk...',
  '..kSSSSSSSSSDk..', '.kSDDdDDDDDDDDk.', '.kSDdkDDDDDRDdk.', '.kSdkkkSDDBDYdk.',
  '.kSDDkSDDDDNDdk.', '.kSDDDdddddDDdk.', '.kSDdkkkkkkDDdk.', '.kDdk......kDdk.',
  '..kk........kk..', '................', '................', '................',
]);
dodaj2('zlota', [
  '................', '...kkkkkkkkkk...', '..kqRYqqqRYqRk..', '.kqRrYqRRrYqRRk.',
  '.kRrrYRrrrYRrrk.', '.kYYYyzzzzyYYYk.', '.kkkkkzyyykkkkk.', '.kqqRzykkzYqqRk.',
  '.kqRrzykkzyqRrk.', '.kqRrzYYkzyqRrk.', '.kqRrzyyYyyqRrk.', '.kqRrYqqqRYqRrk.',
  '.kRrrYRrrrYRrrk.', '.kkkkkkkkkkkkkk.', '................', '................',
]);
dodaj2('kapral', [
  '................', '...kkkkkkkkkk...', '..kPpvPPPpvPpk..', '.kPppvPpppvPppk.',
  '.kpppvppppvpppk.', '.kvvvPvvvvPvvvk.', '.kkkkkvPPPkkkkk.', '.kPPpvPkkvvPPpk.',
  '.kPppvPkkvPPppk.', '.kPppvvvkvPPppk.', '.kPppvPPvPPPppk.', '.kPppvPPPpvPppk.',
  '.kpppvppppvpppk.', '.kkkkkkkkkkkkkk.', '................', '................',
]);
dodaj2('garnek', [
  '................', '................', '.......kk.......', '......kqRk......',
  '...kkkqRRRkkk...', '..kRRRrrrrRRRk..', '.kkkkkkkkkkkkkk.', 'kddwwwwwwwwwwDdk',
  'kkdwwRwwwwRwSdkk', '..kwwwwwRwwwSk..', '..kRwwwwwwwwRk..', '..kwwwRwwwwwSk..',
  '..kwwwwwwwRwSk..', '...kwRSSSSSSk...', '....kkkkkkkk....', '................',
]);
dodaj2('skrzynka', [
  '................', '................', '....kk....kk....', '...kqRk.kkAAk...',
  '..kqwRRkmmNFAk..', '..kRrrrNnnnAak..', '.kkkkkkkkkkkkkk.', '.kollllllllllok.',
  '.koOOOOOOOOOOok.', '.kkkkkkkkkkkkkk.', '.kollllllllllok.', '.koOOOOOOOOOOok.',
  '.kkkkkkkkkkkkkk.', '.kollllllllllok.', '.koOOOOOOOOOOok.', '.kkkkkkkkkkkkkk.',
]);
dodaj2('wskaznik', [
  '................', '................', '.....kk.........', '.....kYk........',
  '.....kzYk.......', '.....kzYYk......', '.....kzYYYk.....', '.....kzYYYYk....',
  '.....kzYYYyk....', '.....kzYYyk.....', '.....kzYyk......', '.....kzyk.......',
  '.....kYk........', '.....kk.........', '................', '................',
]);
// @@ART3@@
// ═════════════════════════════ IKONY v3 (01.10.2026: bronie, dania, składniki, przyprawy, HUD) ═════════════════════════════
// Życzenie właściciela: „popraw ikonki broni i reszty rzeczy". Ten sam styl co v2: 16×16, ręczny ciemny kontur, światło
// z lewej-góry, ciepła paleta PAL2. Siatki wygenerował skrypt pomocniczy (rampy cieni + kontur w 4-sąsiedztwie), potem
// poprawki ręczne. Nazwy = stare nazwy z ART tam, gdzie znaczą to samo (ico()/icon() same biorą v3), nowe dla rzeczy,
// które dzieliły jedną starą ikonę (fala → tupniecie / wypad, celownik → scyzoryk / bazylia, wiatr → wiatrowka / mroz).
export const ART3_GRUPA = {};                          // nazwa → bron | danie | skl | przyp | hud (arkusz)
export const IK3_STARE = {"kula": "kula", "czosnek": "czosnek", "tupniecie": "fala", "pioruny": "pioruny", "butelka": "butelka", "krzak": "krzak", "pizza": "pizza", "skarpeta": "skarpeta", "wiatrowka": "wiatr", "kukurydza": "kukurydza", "scyzoryk": "celownik", "kapec": "kapec", "wypad": "fala", "pestka": "pestka", "sokowirowka": "sokowirowka", "celownik": "celownik", "meteor": "kula", "mlyn": "czosnek", "sejsm": "fala", "burza": "pioruny", "kaluza": "butelka", "calamita": "pizza", "smrod": "skarpeta", "kaseta": "kukurydza", "wachlarz": "celownik", "doppia": "kapec", "selekcja": "tarcza", "jablon": "pestka", "ser": "ser", "filizanka": "filizanka", "klapki": "but", "papryczka": "papryczka", "rosol": "rosol", "lornetka": "lornetka", "pokrywka": "pokrywka", "sol": "plomien", "oliwa": "zegar", "pieprz": "gwiazda", "bazylia": "celownik", "pauza": "pauza", "wymiana": "wymiana", "strzalka": "strzalka", "klodka": "klodka", "puchar": "puchar", "plomien": "plomien", "tarcza": "tarcza", "mroz": "wiatr", "ostrzezenie": "ostrzezenie", "gwiazda": "gwiazda", "skok": "skok", "torba": "skok", "nonna": "postac", "nuta": "nuta", "fala": "fala", "cisza": "cisza"};   // v3 → stara 8×8 (arkusz „stare obok nowych")
function dodaj3(nazwa, grupa, wiersze) { dodaj2(nazwa, wiersze); ART3_GRUPA[nazwa] = grupa; }
// --- v3: BRONIE ---
dodaj3('kula', 'bron', [
  '................', '........kkkk....', '......kkzYYYkk..', '.....kzzyzzYzYk.',
  '.....kzyzwwzzyk.', '..kkkzYyzwwzzYYk', '.kYYYYzYYzzzYYyk', 'kyYkkzYYYzzYYYyk',
  '.kk..kzYYYYYYyk.', '....kzYyYYYYyyk.', '...kzYkkYyyykk..', '..kYYk..kYkk....',
  '.kYYk..kYk......', 'kykk..kkYk......', '.k...kyYk.......', '......kk........',
]);
dodaj3('czosnek', 'bron', [
  '............k...', '...........k....', '........k.k.....', '.......kwk......',
  '......kwHHk.....', '.....kwHHHHk....', '....kwHHhHHhk...', '...kwvwhvwhvwk..',
  '..kwhvwhvwhvwHk.', '..kwhvwhvwhvwhk.', '..kHhvwhvwhvwhk.', '...khvwhvwhvhk..',
  '....kwhhHhhhk...', '.....khlllhk....', '......kkkkk.....', '................',
]);
dodaj3('tupniecie', 'bron', [
  '................', '...kkkkk........', '..kllllOk.......', '..kloOOok.......',
  '..kOllook.......', '..kOhOhOk.......', '..klOOOokkkk....', '..kOhOhllllOk...',
  '..kllOlOOOOOOk..', '..klOOOOOOOOOOk.', '..kOooooooooook.', '.kddddddddddddk.',
  '.kkkkkkkkkkkkkk.', 'kFAk........kAFk', 'FAk..........kAF', 'kk............kk',
]);
dodaj3('pioruny', 'bron', [
  '.......kkkkkk...', '......kzzzzzyk..', '.....kzYYYYyk...', '....kzYYYYyk....',
  '...kzYYYYykkkk..', '..kzyyYYYYzzzyk.', '...kkkzYYYYYyk..', '.....kzYYYYyk...',
  '....kzYYYYyk....', '....kzYYYyk.....', '...kzYYYyk......', '...kzYyyk.......',
  '..kzYykk........', '..kzyk..........', '..kyk...........', '...k............',
]);
dodaj3('butelka', 'bron', [
  '......kkkk......', '.....klllOk.....', '.....kOoook.....', '......kmNk......',
  '......kmnk......', '.....kmNNNk.....', '....kmNNNNNk....', '...kmNNNNNNNk...',
  '...kNnnnnnnnk...', '...kwwHHwwwHk...', '...kwhRRwHHhk...', '...kHhHHhhhhk...',
  '...kmmmmmmmNk...', '...kNnnnnnnnk...', '....kkkkkkkk....', '................',
]);
dodaj3('krzak', 'bron', [
  '.....kkkkkk.....', '...kkmmmmNnkk...', '..kmmNNNnqqRmk..', '.kmnnnNNnqRrmNk.',
  '.kNqqRmNnRrrmnk.', 'kmnqRrmnnNmmNNNk', 'kNnRrrNqqRmNNNnk', '.kNmmmnqRrmNNnk.',
  '..kNnnnRrrNnnk..', '...kkkknnkkkk...', '..klllllllllok..', '...klOOOOOOok...',
  '...kOOOOOOOok...', '....kOoooook....', '.....kkkkkk.....', '................',
]);
dodaj3('pizza', 'bron', [
  '.......k........', '....kkklk.......', '...klOOok.......', '..klozYYk...kk..',
  '.kloYYYYk..klOk.', '.kOYqRYYk.kYYOk.', '.kOzRrYYkkYYYOk.', 'kloYYYzNkYYYYlOk',
  'kOoNYYYYYYYYYlok', '.kOYYYYYYqRYYOk.', '.kOYYqRYYRrYYOk.', '.kOOYRrYYYYYlok.',
  '..kOOYYYNYYlok..', '...kOOOllOOok...', '....kkkOokkk....', '.......kk.......',
]);
dodaj3('skarpeta', 'bron', [
  '............N...', '..kkkkk....N....', '.kwHHHhk...N....', '.kqRRRrk.N..N...',
  '.kwHHHhkN...N.N.', '.kqRRRrkN....N..', '.kwwwwHk.N...N..', '.kwHHHhk.N....N.',
  '.kwHHHhkkk......', '.kwHHHHwwHkk....', '.kHhHHHHHHHhk...', '.kDDwHHHHhDDDk..',
  '..kDHhhhhDDDk...', '...kkkkkkkkk....', '................', '................',
]);
dodaj3('wiatrowka', 'bron', [
  '..............k.', '..........kk.kSk', '.........kDdkSk.', '........kDdgSk..',
  '.......kDdgSk...', '.......kBgSk....', '.......kkSk.....', '......kllOk.....',
  '.....klOOok.....', '....klOOOoDk....', '...klOOOoDgk....', '..klOOOokkk.....',
  '.klOOOok........', '.kOOOok.........', 'kDgOok..........', 'kgkkk...........',
]);
dodaj3('kukurydza', 'bron', [
  '.......kk.......', '......kzYk......', '.....kzYzyk.....', '....kzYzYzyk....',
  '....kYzYzYyk....', '....kzYzYzyk....', '...kmYzYzYymk...', '..kmnzYzYzymNk..',
  '..kmnYzYzYymnk..', '.kmNnzYzYzymNNk.', '.kmNnYzYzYymNnk.', '.kNNNNzYzymNNnk.',
  '..kNNNNyymNNnk..', '...kNnnnnNnnk...', '....kkknnkkk....', '.......kk.......',
]);
dodaj3('scyzoryk', 'bron', [
  '..k.............', '.kwk............', '.kwSk...........', '.kSSSk..........',
  '..kSSSk.........', '...kSSSk........', '....kSSSk.......', '.....kSSSk......',
  '..kkkkkSDDkk....', '.kqqqqqqqRSDk...', 'kqRrRRRRRRRDdk..', 'kqrwRRRRRRRRk...',
  'kRwwwqRRRRRrk...', 'kRRwqRRRRRRrk...', '.kRRrrrrrrrrk...', '..kkkkkkkkkk....',
]);
dodaj3('kapec', 'bron', [
  '................', '................', '....kkk.........', '...kwwHk........',
  '..kwHHHHk.......', '..kHHHHhk.......', '..kjHhhjIkk.....', '.kjIjjjIIjIkk...',
  'kjIIIIIIIIIjikk.', 'kjIIIIIIIIIijjjk', 'kIiiiiiiiiiiIIik', '.klOOOOOOOOOOok.',
  '..kkkkkkkkkkkk..', '................', '................', '................',
]);
dodaj3('wypad', 'bron', [
  '......kk........', '.....kvPkkk.....', '...kkkvpkvPk....', '..kvPkvpkvpkkk..',
  '..kvpkvpkvpkvPk.', '..kvpkvpkvpkvpk.', '.kkvPvPPvPPvPpk.', 'kvkvPPPPPPPPPpk.',
  'kvvPPPPPPPPPPpk.', 'kPPPPPPPPPPPpk..', '.kPPPPPPPPPPpk..', '..kPppppppppk...',
  '..kwwHwwwwwHk...', '..kwhYwHHHHhk...', '..kHhHhhhhhhk...', '...kkkkkkkkk....',
]);
dodaj3('pestka', 'bron', [
  '....kk.....kk...', '...kmNkk.kkmnk..', '....kNNNkmNnk...', '.....kknnnkk....',
  '.......knk......', '......kllOk.....', '.....klOOOOk....', '....klllOOOOk...',
  '....klOoOoook...', '...klowwOwwlOk..', '...klowkOwklok..', '...kOOllOllOok..',
  '....kOOOOOOok...', '.....kOooook....', '....kDgkkkDgk...', '.....kk...kk....',
]);
dodaj3('sokowirowka', 'bron', [
  '.....kkkkkk.....', '....kFFAFAAk....', '...kFFAFAFFAk...', '...kAAaAaAaak...',
  '..kSSSSSSSSSdk..', '...kSdddddddk...', '...kDccccccDk...', '...kDcAAAAcDk...',
  '...kDcAAAAcDk...', '...kDcAAAAcDk...', '...kSSSSSSSdk...', '..kSDdDDDDDDdk..',
  '..kSdNSDDDDdk...', '..kDdDdddddddk..', '...kkkkkkkkkk...', '................',
]);
dodaj3('celownik', 'bron', [
  '.......kk.......', '.....kkwwkk.....', '...kkqrwwqRkk...', '..kqRrkkkkRRRk..',
  '..kRkk....kkRk..', '.kqrk......kRRk.', '.krk...kk...krk.', 'kwwk..kRRk..kwwk',
  'kwwk..kRRk..kwwk', '.kqk...kk...kqk.', '.kRRk......kqrk.', '..kRkk....kkRk..',
  '..kRRRkkkkqRrk..', '...kkRrwwqrkk...', '.....kkwwkk.....', '.......kk.......',
]);
// --- v3: DANIA (przepisy, Książka Nonny) ---
dodaj3('meteor', 'danie', [
  '................', '.........kk.....', '......kkkDdkk...', '.....kRDAddddk..',
  '....kRADdFgADdk.', '....kRDggAFDdgk.', '...kRAdADDDgggk.', '..kRAAdDddgFAgk.',
  '..kRAFFddgADgk..', '..kRAFzzdgdgAk..', '.kkAFFzFFAARRRk.', 'kRAFFFFFARRkkk..',
  'kRFFFFAARRk.....', '.kFFFAkkkk......', '.kFAARk.........', 'kRkkkk..........',
]);
dodaj3('mlyn', 'danie', [
  '......kwk.......', '.....kwHhkk.....', '....kwvHvwzk....', '...kzhvHvhkzk...',
  '....kkwhhk.k....', '.....klllk......', '......kkk.......', '................',
  '..k.........k...', '.kwk.......kwk..', 'kwHhk.....kwHhk.', 'wvHvwk...kwvHvwk',
  'hvHvhk...khvHvhk', 'kwhhzk....kwhhk.', 'klllkzk..kzlllk.', '.kkk.k....kkkk..',
]);
dodaj3('sejsm', 'danie', [
  '.......kk.......', '..kk..kSDk..kk..', '.kSDk.kDdk.kSDk.', '.kDdk..kk..kDdk.',
  '..kk........kk..', '.kkkkkkk........', 'kmNNNNNnk.......', 'kllllllOFkkkkkk.',
  'klOOOOOoFmNNNNnk', 'klOOOOOoAlllllOk', 'klOOOOoAFlOOOOok', 'klOOOOoAlOOOOOok',
  'klOOOOOOAlOOOOok', 'kOooooooFOoooook', '.kkkkkkkkkkkkkk.', '................',
]);
dodaj3('burza', 'danie', [
  '.....kkk.kk.....', '...kkSSDkSDkk...', '..kSSDDDSDDSDk..', '.kSDDDDDDDDDDDk.',
  '.kDDDDDDDDDDDdk.', '..kDdddddddddk..', '...kkkzykkkkk...', '..kkkzykkkk.....',
  '.kwwHYywwwHkk...', '.kwHHwwHHHHHhk..', '.kHHHHHHHHhkkHk.', '..kHHHHHHhkkHk..',
  '..kkHhhhhhHhk...', '.kSDDDDDDDDDdk..', '..kkkkkkkkkkk...', '................',
]);
dodaj3('kaluza', 'danie', [
  '................', '................', '................', '......k..k......',
  '.....kmkkmk.kk..', '....kmnkmNNkwmk.', '.kk.kNmmNnnkmmk.', 'kwmkkNmmnnNkkk..',
  'kmmkkNmmnnNk....', '.kk.kNmmNmnk....', '.kkkmmmNNNnmkkk.', 'kmUUuNnnnnnmmmUk',
  'kUzzmmmmmmmuuUuk', 'kUUUUUUUUUuzzUuk', '.kkkUuuuuuuukkk.', '....kkkkkkkk....',
]);
dodaj3('calamita', 'danie', [
  '.kkkkkkkkkkk....', 'klOlOlOlOlOOk...', 'kolololololok...', '.kYYqRYYYYYk....',
  '.kYYRrYzYYk.....', '..kYYYYYqRk.....', '..kYNYYYRrk.....', '...kYYYYYk......',
  '...kYqRYkkkkkk..', '....kRrkkwSqqRk.', '....kYk.kSDRRRRk', '.....k...kkkqRrk',
  '.........kkkqRrk', '........kwSqRRrk', '........kSDRrrk.', '.........kkkkk..',
]);
dodaj3('smrod', 'danie', [
  '...kmk....kmk...', '....kmk..kmk....', '...kmkkkkkkmk...', '...kkkmmmNkk....',
  '..kmmmNNNNmNk...', '.kmNNnnNNnnNNkk.', 'kmNNnkkmnkkmNmNk', 'kmNNnkkmnkkmNNnk',
  'kmNNNNNnnNNNNNnk', 'kNNNnkkkkkkmNNnk', '.kNNnkwkwkmNNnk.', '..kNNmNmmNNNnk..',
  '...kNnkNnkNnk...', '....kk.kk.kk....', '................', '................',
]);
dodaj3('kaseta', 'danie', [
  '..........kFwFk.', '...........kFk..', '.........kk.k...', '........kzYk....',
  '.kk....kzYzyk...', 'kwHk...kYzYyk.kk', 'wHHhk..kzYzykkwH', 'kHhk..kmYzYymwhh',
  '.kk..kmnzYzymNkk', '..kk.kmnYzYymnk.', '.kwHkkmNNzymNnk.', 'kwHHhkNNNmmNnk..',
  '.kHhk.kNnnnnk...', '..kk...kkkkwHk..', '.........kwHHhk.', '..........kHhk..',
]);
dodaj3('wachlarz', 'danie', [
  '......kwSk......', '.kk...kwDk..kkk.', 'kwSk..kwDk.kwwSk', 'kwSSk.kwDkkwSSDk',
  'kSSDk.kwDkkwSDk.', '.kSSSkkwDkwSDk..', '..kwSSkwSwSSDk..', '..kSSSwSSSSDk...',
  '...kSDSSSSDk....', '....kNSDDDNk....', '....kSjjjIk.....', '.....kjIIik.....',
  '....kjIIIIik....', '.....kIIiik.....', '......kikik.....', '.......k.k......',
]);
dodaj3('doppia', 'danie', [
  '........kkk.....', '.......kwwHk....', '......kwHHhhk...', '......kjHhjIk...',
  '.....kjIjjIIIkk.', '..kkkjIIIIIIijjk', '.kwwHIiiiiiiiik.', 'kwHHhhlOOOOOOOok',
  'kjHhjIkkkkkkkkk.', 'jIjjIIIkkkkkkkk.', 'jIIIIIIjjjjIjjjk', 'IiiiiiiiiiiiIIik',
  'klOOOOOOOOOOOok.', '.kkkkkkkkkkkkk..', '................', '................',
]);
dodaj3('selekcja', 'danie', [
  '..kk........kk..', '.kzYk......kzYk.', 'kzYYyk....kzYYyk', '.kzykk....kkzyk.',
  '.kzyqRk..kqrzyk.', '.kzykRRkkqrkzyk.', '.kzykkRRRrkkzyk.', '.kzyk.kkkk.kzyk.',
  '.kzyk......kzyk.', '.kzyk......kzyk.', '.kzyk......kzyk.', '.kzyk......kzyk.',
  'kzYYYk....kzYYYk', 'zyyyyyk..kzyyyyy', 'kkkkkk....kkkkkk', '................',
]);
dodaj3('jablon', 'danie', [
  '.....kkkkkk.....', '....kmNmmmNk....', '...kmqRmNNNnk...', '..kmnRrmNNnqRk..',
  '.kmnNmmNNNnRrmk.', '.kqRmNNNnnNmmnk.', '.kRrmNNnqRmNnnk.', '.kmmNNNnRrmnqRk.',
  '.kNNNnnNmmNnRrk.', '..kNnqRmNNNNnk..', '...knRrNnnNnk...', '....kNlllonk....',
  '.....kklokk.....', '.....kklokk.....', '....klOooOok....', '.....kkkkkk.....',
]);
// --- v3: SKŁADNIKI (Spiżarnia, sloty w biegu) ---
dodaj3('ser', 'skl', [
  '................', '...........k....', '.........kkEk...', '.......kkzezzk..',
  '.....kkzezzzEk..', '...kkzezzzzzEk..', '..kzezzzzzzzEk..', '.kzzzzzzzzzzEk..',
  '.kEzYzzzzzYYEk..', '.kEYyzyYYyyYEk..', '.kEzzyyzyYzyEk..', '.kEYYYzyyzYyek..',
  '.kEyYyyyYyyyek..', '.keeeeeeeeeeek..', '..kkkkkkkkkkk...', '................',
]);
dodaj3('filizanka', 'skl', [
  '.....k....k.....', '....kwk..kwk....', '....kwk..kwk....', '.....kwk..kwk...',
  '...kkkwkkkkwk...', '..kwHHHHHHHHk...', '..kHoooooooHkkk.', '..kwwwwwwwwhHwHk',
  '..kHHHHHHHhkkwhk', '...kHHHHHHhHHhk.', '..kkkHhhhhkkkk..', '.kSSSSSSSSSSdk..',
  '..kDddddddddk...', '...kkkkkkkkk....', '................', '................',
]);
dodaj3('klapki', 'skl', [
  '..kkkk....kkkk..', '.kwwwHk..kwwwHk.', 'kwhhhhhkkwhhhhhk', 'kcwcwcwkkcwcwcwk',
  'kBwBwBwkkBwBwBwk', 'kBwBwBwkkBwBwBwk', 'kBBbBbbkkBBbBbbk', 'kwwwwhk..kwwwwHk',
  'kwHHhk....kwHHhk', 'kwHHHHk..kwHHHhk', 'kwHHHHHkkwHHHHhk', 'kHHHHHhkkHHHHHhk',
  '.kHhhhk..kHhhhk.', '..kkkk....kkkk..', '................', '................',
]);
dodaj3('papryczka', 'skl', [
  '............k...', '...........kmk..', '.........kkmnk..', '........kmNnnk..',
  '.......kqqqRnk..', '......kqRRRRRNk.', '.....kqRRRRRrrk.', '....kqRRRRRrkk..',
  '...kqRRRRrrk....', '..kqRRRrrkk.....', '.kqRRRrkk.......', '.kqRRrk.........',
  'kqRRrk..........', 'kqRrk...........', 'kRrk............', '.kk.............',
]);
dodaj3('rosol', 'skl', [
  '....k....k......', '...kwk..kwk.....', '...kwk..kwk.....', '....kwk..kwk....',
  '....kwk..kwk....', '.kkkkkkkkkkkkkk.', 'kwHHHHHHHHHHHHHk', 'kHYYAYzzYYYAYzHk',
  'kHwHHHHHHHHHHwhk', '.kHqRRRRRRRRrHk.', '.kHwwwwwwwwwwhk.', '..kHhHHHHHHhhk..',
  '...kkHhhhhhkk...', '....kSDDDDdk....', '.....kkkkkk.....', '................',
]);
dodaj3('lornetka', 'skl', [
  '...kkk....kkk...', '..kDDdk..kDDdk..', '..kDdgk..kDdgk..', '.kDddddkkDddddk.',
  '.kDdddgkkDdddgk.', '.kDddddDDddddgk.', '.kDddddggddddgk.', 'kDddddgkkDdddddk',
  'kDddddgkkDddddgk', 'kDgggggkkDgggggk', 'kdcBBBdkkdcBBBdk', 'kdBccBdkkdBccBdk',
  'kdBBBbdkkdBBBbdk', 'kdddddgkkdddddgk', '.kkkkkk..kkkkkk.', '................',
]);
dodaj3('pokrywka', 'skl', [
  '................', '................', '......kkkk......', '.....kqqqRk.....',
  '.....kRrrrk.....', '.....kkSDkk.....', '...kkSSDDSDkk...', '..kSDDDDDDDSDk..',
  '.kSdwSDDDDDDDDk.', 'kSwwSDDDDDDDDDDk', 'kSSSDDDDDDDDDDdk', 'SDDDDDDDDDDDDDDD',
  'Dddddddddddddddd', 'kkkkkkkkkkkkkkkk', '................', '................',
]);
// --- v3: PRZYPRAWY NONNY ---
dodaj3('sol', 'przyp', [
  '................', '................', '......kkkk......', '.....kSSSdk.....',
  '....kSkSdkSk....', '....kDDddDdk....', '....kDddddgk....', '...kwSSwwwwSk...',
  '...kSwwwSSSDk...', '...kSwwSSSSDk...', '...kwwSSSSSDk...', '...kwSSSSSSDk...',
  '...kSSSSSSSDk...', '....kSDDDDDk....', '.....kkkkkk.....', '................',
]);
dodaj3('oliwa', 'przyp', [
  '.......kk.......', '......klOk......', '......kOok......', '......kcBk......',
  '......kcbk......', '.....kcbbbk.....', '....kBmmmUBk....', '...kcmUUUUUck...',
  '...kBmUUUUuBk.kk', '...kBmUUUUuBkkmn', '...kbUUUUUubkmnk', '....kBUuuuBdmUk.',
  '.....kcBBbkmUuk.', '......kkkkkUuk..', '...........kk...', '................',
]);
dodaj3('pieprz', 'przyp', [
  '.......kk.......', '......kSdk......', '.....klllOk.....', '....kloooook....',
  '....kSDDDDdk....', '.....klllok.....', '......klok......', '.....klOOOk.....',
  '....klOOOOOk....', '....klOOOOok....', '....kOOOOOok....', '.....klOOok.....',
  '....kloooook....', '...kSDDDDDDdk...', '....kkkkkkkk....', '................',
]);
dodaj3('bazylia', 'przyp', [
  '.......kk.......', '......kmNk......', '.....kmNNnk.....', '...kkkkNnkkkk...',
  '..kmmNknkkmmNk..', '.kmNNnknkmNNnk..', '..kNNNNnmNNnk...', '...kNnnnNnnk....',
  '..kkkkknkkkkk...', '.kmmmNknkmmmNk..', 'kmNNNnknkmNNNnk.', '.kNnNNNnmNNnnk..',
  '..kkNnnnNnnkk...', '....kkknkkk.....', '......knk.......', '.......k........',
]);
// --- v3: HUD, KARTY, EKRANY ---
dodaj3('pauza', 'hud', [
  '................', '...kkkk..kkkk...', '..kwwwHkkwwwHk..', '..kwHHhkkwHHhk..',
  '..kwHHhkkwHHhk..', '..kwHHhkkwHHhk..', '..kwHHhkkwHHhk..', '..kwHHhkkwHHhk..',
  '..kwHHhkkwHHhk..', '..kwHHhkkwHHhk..', '..kwHHhkkwHHhk..', '..kwHHhkkwHHhk..',
  '..kwHHhkkwHHhk..', '..kHhhhkkHhhhk..', '...kkkk..kkkk...', '................',
]);
dodaj3('wymiana', 'hud', [
  '.........k......', '........kzk.....', '.kkkkkkkkzYk....', 'kzzzzzzzzYYYkk..',
  'kzYYYYYYYYYYYyk.', 'kYyyyyyyyYYykk..', '.kkkkkkkkzyk....', '......k.kyk.....',
  '.....kmk.k......', '....kmnkkkkkkkk.', '..kkmNNmmmmmmmNk', '.kmNNNNNNNNNNNnk',
  '..kkNNNnnnnnnnnk', '....kNnkkkkkkkk.', '.....knk........', '......k.........',
]);
dodaj3('strzalka', 'hud', [
  '................', '........kk......', '.......kzYk.....', '.......kzYYk....',
  '.......kzYYYk...', '.kkkkkkkzYYYYk..', 'kzzzzzzzYYYYYYk.', 'kzYYYYYYYYYYYYYk',
  'kzYYYYYYYYYYYYyk', 'kYyyyyyyYYYYYyk.', '.kkkkkkkzYYYyk..', '.......kzYYyk...',
  '.......kzYyk....', '.......kYyk.....', '........kk......', '................',
]);
dodaj3('klodka', 'hud', [
  '.....kkkkkk.....', '....kSDDDDDk....', '...kSdkkkkSDk...', '...kSdk..kSdk...',
  '...kSdk..kSdk...', '..kkDdkkkkDdkk..', '.kzzzzzzzzzzzYk.', '.kzYYYYYYYYYYyk.',
  '.kzYYYYyyYYYYyk.', '.kzYYYykkzYYYyk.', '.kzYYYykkzYYYyk.', '.kzYYYYYkzYYYyk.',
  '.kzYYYYykzYYYyk.', '.kYyyyyyYyyyyyk.', '..kkkkkkkkkkkk..', '................',
]);
dodaj3('puchar', 'hud', [
  '..kkkkkkkkkkkk..', 'kkzzzzzzzzzzzYkk', 'zYyYYYYYYYYYYyYY', 'YkkzYYYYYYYYykkY',
  'ykkzYYYYYYYYykky', 'kYkzYYYYYYYYykYk', '.kzyYYYYYYYYyyk.', '..kkYyYYYYyykk..',
  '....kkYYYykk....', '......kzyk......', '.....kkzykk.....', '....kzYyyYyk....',
  '...klllllllOk...', '...klOOOOOOok...', '...kOoooooook...', '....kkkkkkkk....',
]);
dodaj3('plomien', 'hud', [
  '.......k........', '......kqk.......', '.....kqrk..k....', '....kqRRRkkqk...',
  '....kqRrRRkqRk..', '...kqRrFRRqRRRk.', '..kqRrFAARRRRRRk', '.kqRrFaaaARRRRrk',
  '.kqrFaFFFAARRrk.', '.kqrAFFFFFFAqrk.', '.kqrAFFzFFFaqrk.', '.kRraFzzzFaqrk..',
  '..kRRAFFFAqRrk..', '...kRRRRRRrrk...', '....kkkkkkkk....', '................',
]);
dodaj3('tarcza', 'hud', [
  '.kkkkkkkkkkkkkk.', 'kwSSSSSSSSSSSSSk', 'kSccccBBcccccBSk', 'kScBBbzYBBBBBbSk',
  'kScbbzYYYBbBBbSk', 'kSBzYYYYYYycBbSk', 'kSccBYYYyccBBbSk', 'kScBBBYycBBBBbSk',
  'kDBBBBccBBBBBbDk', '.kwcBBBBBBBBbwk.', '.kDBBBBBBBBBbDk.', '..kSBBBBBBBbSk..',
  '...kSBBBBBbSk...', '....kSBbbbSk....', '.....kwSSDk.....', '......kkkk......',
]);
dodaj3('mroz', 'hud', [
  '.k.....k.....k..', 'kck...kck...kck.', '.kck..kck..kck..', '..kckkccckkck...',
  '...kckkckkck....', '...kkckckckk....', '.kkckkBcBkkckk..', 'kccccccwcccccck.',
  '.kkckkBcBkkckk..', '...kkckckckk....', '...kckkckkck....', '..kckkccckkck...',
  '.kck..kck..kck..', 'kck...kck...kck.', '.k.....k.....k..', '................',
]);
dodaj3('ostrzezenie', 'hud', [
  '.......kk.......', '......kzYk......', '.....kzYYYk.....', '.....kzYYyk.....',
  '....kzYyyYYk....', '....kzykkzyk....', '...kzYykkzYYk...', '...kzYykkzYyk...',
  '..kzYYykkzYYYk..', '..kzYYykkzYYyk..', '.kzYYYYYYYYYYYk.', '.kzYYYykkzYYYyk.',
  'kzYYYYykkzYYYYYk', 'kYyyyyyYYyyyyyyk', '.kkkkkkkkkkkkkk.', '................',
]);
dodaj3('gwiazda', 'hud', [
  '................', '................', '.......kk.......', '......kzYk......',
  '......kzyk......', '..kkkkzYYYkkkk..', '.kzzzzYYYYzzzyk.', '..kYYYYYYYYYyk..',
  '...kYYYYYYYyk...', '....kzYYYYyk....', '....kzYYYYyk....', '....kzyyyyyk....',
  '...kzykkkkYYk...', '...kyk....kyk...', '....k......k....', '................',
]);
dodaj3('skok', 'hud', [
  '.......kk.......', '......kzYk......', '.....kzyyYk.....', '....kzykkYYk....',
  '...kzyk..kYYk...', '..kzyk....kYyk..', '...kk..kk..kk...', '......kzYk......',
  '.....kzyyYk.....', '....kzykkYYk....', '...kzyk..kYYk...', '..kzyk....kYyk..',
  '...kkkkkkkkkk...', '..kwHHHHHHHHhk..', '...kkkkkkkkkk...', '................',
]);
dodaj3('torba', 'hud', [
  '................', '.....kkkkkk.....', '...kkwwwwwSkk...', '..kSwwSSSSDcSk..',
  '.kwwwSSSSSSScwk.', 'kwSwSSSSSSSSwSSk', 'kSDSSDDSDDDSSDDk', '.kkSDkkDkkkSDkk.',
  '..kkk..kk..kkk..', '...k....k...k...', '....kk.kk.kk....', '.....kkmnkk.....',
  '.....kFFFAk.....', '.....kAAAak.....', '......kAak......', '.......kk.......',
]);
dodaj3('nonna', 'hud', [
  '......kSDk......', '.....kSDDDk.....', '....kSDDDDDk....', '...kSddddddDk...',
  '..kSdwwwwwHDDk..', '..kdwhhHHhhhdk..', '..kwkBkwhkBkwk..', '..kHkkkwhkkkHk..',
  '..kHqwwhhwHqHk..', '..kHwHhrrwHwhk..', '...kHHHwwHHhk...', '....kHhhhhhk....',
  '...kqqqqqqqRk...', '..kqrrrrrrrrrk..', '...kkkkkkkkkk...', '................',
]);
dodaj3('nuta', 'hud', [
  '......kkkkkkkk..', '.....kzzzzzzzYk.', '.....kzYyyyyYyk.', '.....kzykkkkzyk.',
  '.....kzyk..kzyk.', '.....kzyk..kzyk.', '.....kzyk..kzyk.', '...kkkzyk.kkzyk.',
  '..kzzzyk.kzzYyk.', '.kzYYYYYkzYYYYYk', '.kYYYYYykYYYYYyk', '..kYyyyk.kYyyyk.',
  '...kkkk...kkkk..', '................', '................', '................',
]);
dodaj3('fala', 'hud', [
  '.......k........', '...k..kFk..k....', '..kFkkFAAkkFk...', '..kAAkFAakFak...',
  '.kkkFFaaaFakkk..', 'kFFFAaFFFAAFFak.', '.kAAaFFzFFFAak..', '..kFaFzzzFFak...',
  '.kFAaFFzFFFAAk..', 'kFaaAAFFFFAaaak.', '.kkkFaFFFaakkk..', '..kFakFAakAAk...',
  '..kakkAAakkak...', '...k..kak..k....', '.......k........', '................',
]);
dodaj3('cisza', 'hud', [
  '................', '................', '......kk........', '.....kdk........',
  '....kDDk.kk...kk', '.kkkSDdkkqRk.kqr', '.kwSDDgk.kRRkqrk', '.kwDDdgk..kqqrk.',
  '.kDDDDdk..kqrrk.', '.kkkSDdk.kqrkRRk', '....kDgkkqrk.kRr', '.....kdk.kk...kk',
  '......kk........', '................', '................', '................',
]);
// --- v3: MINI 9×8 (serca w HUD: ten sam obrys i rozmiar co stare 9×8, kolory v2; bez jasnego obrysu). `ico(n, ≤ 13)` bierze
// `n + 'M'`, jeśli jest — czaszka przy „RANGA" (linia 14 px nad paskiem rangi) i serce w opisie wroga w Aktach ---
export const ART2_MINI = ['serceM', 'sercePusteM', 'czaszkaM'];
ART2.czaszkaM = ['..kkkkk..', '.kzEEEEk.', 'kzEEEEEek', 'kEkkEkkek', 'kEkkEkkek', '.kEEkEEk.', '.kEkEkEk.', '..kkkkk..'];
ART2.serceM = ['..kk.kk..', '.kqRkRRk.', 'kqwRRRRrk', 'kqRRRRRrk', '.kRRRRrk.', '..kRRrk..', '...krk...', '....k....'];
ART2.sercePusteM = ['..kk.kk..', '.kddkddk.', 'kdgggggdk', 'kdgggggdk', '.kdgggdk.', '..kdgdk..', '...kdk...', '....k....'];
// @@ART3-KONIEC@@
// @@ART2-KONIEC@@

export const SIATKA2 = 18;                             // 16 + jasny obrys z obu stron
export const maIkone2 = n => !!ART2[n];
export const art2 = n => ART2[n];                      // arkusz (narzedzia/arkusz_ikon.html)
// stara nazwa → ikona v2/v3: ta sama nazwa albo alias (stara „skrzynia" = złota skrzynia, „play" = trójkąt znacznika)
const ALIAS3 = { skrzynia: 'zlota', play: 'wskaznik' };
function nazwa2(n) { return ART2[n] ? n : (ALIAS3[n] && ART2[ALIAS3[n]] ? ALIAS3[n] : null); }
// data URL ikony v2: `px` = piksele canvasu na piksel siatki, `obrys` = kolor jasnego obrysu (null = bez, siatka 16×16),
// `zamiana` = { znak palety: kolor } (np. strzałka znacznika w kolorze typu: { Y, z, y })
export function ikona2(name, px = 4, obrys = '#f2e3bf', zamiana = null) {
  const key = name + '@v2' + px + (obrys || '') + (zamiana ? JSON.stringify(zamiana) : '');
  if (cache.has(key)) return cache.get(key);
  const art = ART2[name];
  if (!art) return '';
  const PAL = zamiana ? Object.assign({}, PAL2, zamiana) : PAL2;
  const W = art[0].length, H = art.length;             // 16×16 (v2/v3) albo mini (serca HUD 9×8)
  const m = obrys ? 1 : 0, w = W + 2 * m, h = H + 2 * m;
  const c = document.createElement('canvas');
  c.width = w * px; c.height = h * px;
  const g = c.getContext('2d');
  const pelny = (x, y) => y >= 0 && y < H && x >= 0 && x < W && PAL[art[y][x]];
  if (obrys) {                                         // obrys: każdy pusty piksel obok zamalowanego (8-sąsiedztwo)
    g.fillStyle = obrys;
    for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
      if (pelny(x, y)) continue;
      let obok = false;
      for (let dy = -1; dy <= 1 && !obok; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && pelny(x + dx, y + dy)) { obok = true; break; }
      if (obok) g.fillRect((x + m) * px, (y + m) * px, px, px);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const col = PAL[art[y][x]];
    if (!col) continue;
    g.fillStyle = col;
    g.fillRect((x + m) * px, (y + m) * px, px, px);
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

