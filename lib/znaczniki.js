// lib/znaczniki.js — ZNACZNIKI CELÓW W HUD (01.10.2026; spec E3 09 §1.2 „znaczniki na krawędzi ekranu")
//
// Życzenie właściciela 01.10: „może strzałki wskazujące skrzynki". Czysty moduł bez stanu gry: main.js wybiera cele
// (złota skrzynia, Skrzynia Kaprala, Garnek Nonny, zwykła skrzynka — E3 dopisze Stolnicę, Wyzwanie i wydarzenia) i liczy
// zasłonięcie, a tu jest tylko ekran:
//   • cel w kadrze i widoczny → mały znacznik NAD nim (ikona typu), zanika z bliska;
//   • cel poza kadrem, za plecami kamery albo zasłonięty → ikona przy krawędzi strefy bezpiecznej + strzałka w kierunku
//     celu + odległość „34 m". Kierunek liczony w przestrzeni widoku kamery: (P00·x, P11·y) jest ciągły przez płaszczyznę
//     kamery, więc cel za plecami daje strzałkę w dół/na bok zamiast odbitej w górę (klasyczny błąd z `project()`).
//   • strefa bezpieczna = ekran bez górnego pasa HUD (serca, zegar, pauza) minus prostokąty wykluczeń (przyciski dotyku,
//     bronie, podpowiedzi pada) — main.js mierzy je co 0,5 s; znacznik, który w nie wpada, jest z nich wypychany.
//
// WYDAJNOŚĆ: pula elementów DOM tworzona raz; w klatce zero alokacji po rozgrzaniu — pozycje w całych pikselach przez
// zmienne CSS `--zx/--zy` z pamięci napisów, kąt strzałki co 5°, przezroczystość co 0,05, odległość z pamięci napisów;
// zapis do DOM tylko przy zmianie wartości. Ruch = sam `transform` (bez przeliczania układu).

const PXS = [];                                        // pamięć napisów „Npx" (indeks = N + 512)
const px = n => { const i = n + 512; return PXS[i] || (PXS[i] = n + 'px'); };
const KATY = [];                                       // 72 kroki po 5°
for (let i = 0; i < 72; i++) KATY.push(i * 5 + 'deg');
const OPAC = [];
for (let i = 0; i <= 20; i++) OPAC.push(String(i / 20));
const ODL = [];
const odl = m => ODL[m] || (ODL[m] = m + ' m');

export class Znaczniki {
  // kontener: element w #hud (pointer-events:none), max: ile znaczników naraz (spec: 3)
  constructor(kontener, max = 3) {
    this.el = kontener; this.max = max; this.typy = {};
    this.L = 0; this.T = 0; this.R = 100; this.B = 100;   // strefa bezpieczna (px CSS)
    this.wyk = new Float32Array(4 * 16); this.nWyk = 0;   // prostokąty wykluczeń l, t, r, b
    this.ik = 24; this.h = 28; this.orb = 17;             // rozmiar ikony, pół-zasięg znacznika, promień orbity strzałki
    this.widac = null;
    this._wx = 0; this._wy = 0;                         // wynik _wypchnij (bez alokacji)
    this.p = [];
    for (let i = 0; i < max; i++) {
      const d = document.createElement('div');
      d.className = 'zn';
      d.innerHTML = '<i class="znS"></i><i class="znI"></i><b class="znD"></b>';
      kontener.appendChild(d);
      this.p.push({ d, s: d.children[0], i: d.children[1], t: d.children[2],
        x: -9999, y: -9999, kat: -1, op: -1, txt: '', typ: '', tryb: '', lg: false, nowy: false, on: false,
        cx: 0, cy: 0, hh: 0 });                          // cx/cy/hh = pozycja i zasięg w tej klatce (rozpychanie znaczników)
    }
  }
  // typ: { ikona: url, strzalka: url } — klasa CSS `t-<nazwa>` daje kolor ramki i napisu
  typ(nazwa, o) { this.typy[nazwa] = o; }
  // rozmiar ikony w px CSS (main.js podaje wielokrotność siatki 18 w pikselach urządzenia)
  rozmiar(ik) {
    if (ik === this.ik) return;
    this.ik = ik;
    this.orb = Math.round(ik * 0.67 + 1);              // trójkąt strzałki zaczyna się tuż za ikoną (siatka 18: kolumny 6–13)
    this.h = Math.round(Math.max(ik * 0.9 + 2, ik * 0.5 + 15));
    this.el.style.setProperty('--zik', ik + 'px');
    this.el.style.setProperty('--zorb', this.orb + 'px');
    for (const p of this.p) p.kat = -1;                // strzałka do przeliczenia
  }
  strefa(L, T, R, B) { this.L = L; this.T = T; this.R = R; this.B = B; }
  wyczyscWyk() { this.nWyk = 0; }
  dodajWyk(l, t, r, b) {
    if (this.nWyk >= 16) return;
    const o = this.nWyk++ * 4, w = this.wyk;
    w[o] = l - 3; w[o + 1] = t - 3; w[o + 2] = r + 3; w[o + 3] = b + 3;
  }
  pokaz(on) {
    if (this.widac === on) return;
    this.widac = on;
    this.el.style.display = on ? '' : 'none';
  }
  // cele[0..n-1]: { typ, x, y, z (punkt NAD celem), d (odległość, m), zasl (bool), nowy (bool) }
  rysuj(kamera, W, H, cele, n) {
    this.pokaz(n > 0);
    if (!n) { for (let j = 0; j < this.max; j++) this._wyl(this.p[j]); return; }
    const m = kamera.matrixWorldInverse.elements, P = kamera.projectionMatrix.elements, near = kamera.near;
    const h = this.h, L = this.L + h, R = this.R - h, T = this.T + h, B = this.B - h;
    const ox = W * 0.5, oy = H * 0.5;
    const k = Math.min(n, this.max);
    for (let j = 0; j < k; j++) {
      const c = cele[j], p = this.p[j];
      // przestrzeń widoku (bez Vector3: zero alokacji)
      const vx = m[0] * c.x + m[4] * c.y + m[8] * c.z + m[12];
      const vy = m[1] * c.x + m[5] * c.y + m[9] * c.z + m[13];
      const vz = m[2] * c.x + m[6] * c.y + m[10] * c.z + m[14];
      let dx = P[0] * vx * ox, dy = -P[5] * vy * oy;     // kierunek na ekranie (ciągły także za kamerą)
      let sx = 0, sy = 0, kadr = false;
      if (vz < -near * 2) {
        const w = -vz;
        sx = ox + (P[0] * vx + P[8] * vz) / w * ox;
        sy = oy - (P[5] * vy + P[9] * vz) / w * oy;
        // w kadrze = punkt nad celem jest NA EKRANIE w poziomie strefy (także pod górnym pasem HUD — wtedy znacznik
        // dociśnięty w dół do strefy); poza tym przypadkiem strzałka krawędziowa wskazywałaby widoczny obiekt
        kadr = !c.zasl && sx >= this.L && sx <= this.R && sy >= 0 && sy <= this.B;
      }
      let x, y, kat = 0, lg = false;
      if (kadr) {                                          // NAD celem; zapas = pół ikony (bez strzałki i napisu)
        const hk = this.ik * 0.5 + 2;
        x = sx; y = sy - hk - 1;
        if (x < this.L + hk) x = this.L + hk; else if (x > this.R - hk) x = this.R - hk;
        if (y < this.T + hk) y = this.T + hk; else if (y > this.B - hk) y = this.B - hk;
      } else {
        if (c.zasl && vz < -near * 2 && sx > L && sx < R && sy > 0 && sy < B) {
          x = sx; y = sy - this.ik * 0.5 - 3;              // zasłonięty w kadrze: pełny znacznik nad punktem, strzałka w dół
          dx = 0; dy = 1;
          if (y < T) y = T;
        } else {                                          // promień ze środka ekranu do krawędzi strefy
          const dl = Math.sqrt(dx * dx + dy * dy) || 1;     // nie Math.hypot — w V8 alokuje przy każdym wywołaniu
          dx /= dl; dy /= dl;
          let t = 1e9;
          if (dx > 1e-4) t = Math.min(t, (R - ox) / dx); else if (dx < -1e-4) t = Math.min(t, (L - ox) / dx);
          if (dy > 1e-4) t = Math.min(t, (B - oy) / dy); else if (dy < -1e-4) t = Math.min(t, (T - oy) / dy);
          if (!(t < 1e8) || t < 0) t = 0;
          x = ox + dx * t; y = oy + dy * t;
        }
        let a = Math.atan2(dy, dx) * 57.29578;
        if (a < 0) a += 360;
        kat = Math.round(a / 5) % 72;
        lg = dy > 0.55;                                     // strzałka w dół → odległość nad ikoną
      }
      // zasięg znacznika: przy krawędzi ze strzałką i napisem (h), w kadrze sama ikona
      const hh = kadr ? this.ik * 0.5 + 2 : h;
      const L2 = this.L + hh, R2 = this.R - hh, T2 = this.T + hh, B2 = this.B - hh;
      // rozsunięcie od wcześniejszych znaczników (ważniejsze stoją, późniejsze się odsuwają)
      for (let i = 0; i < j; i++) {
        const q = this.p[i];
        const ddx = x - q.cx, ddy = y - q.cy, min = (hh + q.hh) * 0.8;
        if (Math.abs(ddx) >= min || Math.abs(ddy) >= min) continue;
        const pion = (x <= L2 + 1 || x >= R2 - 1);          // przy bocznej krawędzi rozsuwamy w pionie
        if (pion) { y = ddy >= 0 ? q.cy + min : q.cy - min; if (y > B2) y = q.cy - min; if (y < T2) y = q.cy + min; }
        else { x = ddx >= 0 ? q.cx + min : q.cx - min; if (x > R2) x = q.cx - min; if (x < L2) x = q.cx + min; }
      }
      // wypchnięcie z wykluczeń. Znacznik przy krawędzi idzie do środka ekranu (od prawej w lewo, od dołu w górę; w rogu
      // wzdłuż dłuższej składowej kierunku) aż do skutku — najkrótsza oś oscylowała w kolumnie przycisków dotyku (karabin →
      // wieżyczka → skok). Gdy to kończy się poza strefą (kolumna przycisków na całą wysokość), druga próba: prostopadle,
      // też do środka. W kadrze: najkrótsze wypchnięcie, które nie wyrzuca poza strefę.
      let kx = 0, ky = 0;
      if (!kadr) {
        const naP = x >= R2 - 1, naL = x <= L2 + 1, naD = y >= B2 - 1, naG = y <= T2 + 1;
        if ((naP || naL) && (naD || naG)) { if (Math.abs(dx) >= Math.abs(dy)) kx = naP ? -1 : 1; else ky = naD ? -1 : 1; }
        else if (naP) kx = -1; else if (naL) kx = 1; else if (naD) ky = -1; else if (naG) ky = 1;
      }
      if (!this._wypchnij(x, y, hh, kx, ky, L2, R2, T2, B2) && (kx || ky)) {
        const x1 = this._wx, y1 = this._wy;
        if (this._wypchnij(x, y, hh, ky ? (x > ox ? -1 : 1) : 0, kx ? (y > oy ? -1 : 1) : 0, L2, R2, T2, B2)) { x = this._wx; y = this._wy; }
        else { x = x1; y = y1; }
      } else { x = this._wx; y = this._wy; }
      p.cx = x; p.cy = y; p.hh = hh;
      this._ustaw(p, c, Math.round(x), Math.round(y), kadr ? 'kadr' : 'kraw', kat, lg);
    }
    for (let j = k; j < this.max; j++) this._wyl(this.p[j]);
  }
  // wypycha punkt (x, y) o zasięgu hh z prostokątów wykluczeń w kierunku (kx, ky) — albo najkrótszą drogą, gdy oba 0.
  // Wynik w this._wx/_wy (bez alokacji); zwraca true, gdy skończył czysto w strefie [L2..R2]×[T2..B2].
  _wypchnij(x, y, hh, kx, ky, L2, R2, T2, B2) {
    let ok = true;
    for (let it = 0; it < 6; it++) {
      let ruch = false;
      for (let e = 0; e < this.nWyk; e++) {
        const o = e * 4, w = this.wyk;
        const l = w[o], t = w[o + 1], r = w[o + 2], b = w[o + 3];
        if (x + hh <= l || x - hh >= r || y + hh <= t || y - hh >= b) continue;
        ruch = true;
        if (kx < 0) x = l - hh; else if (kx > 0) x = r + hh; else if (ky < 0) y = t - hh; else if (ky > 0) y = b + hh;
        else {
          const pl = x + hh - l, pr = r - (x - hh), pu = y + hh - t, pd = b - (y - hh);
          let best = 1e9, bx = x, by = y;
          if (pl < best && x - pl >= L2) { best = pl; bx = x - pl; by = y; }
          if (pr < best && x + pr <= R2) { best = pr; bx = x + pr; by = y; }
          if (pu < best && y - pu >= T2) { best = pu; bx = x; by = y - pu; }
          if (pd < best && y + pd <= B2) { best = pd; bx = x; by = y + pd; }
          if (best === 1e9) ok = false;
          x = bx; y = by;
        }
      }
      if (!ruch) break;
      if (it === 5) ok = false;
    }
    if (x < L2 || x > R2 || y < T2 || y > B2) ok = false;
    this._wx = x < L2 ? L2 : x > R2 ? R2 : x;
    this._wy = y < T2 ? T2 : y > B2 ? B2 : y;
    return ok;
  }
  _ustaw(p, c, x, y, tryb, kat, lg) {
    const d = p.d, ty = this.typy[c.typ];
    if (!p.on) { p.on = true; d.style.display = ''; }
    if (p.typ !== c.typ && ty) {
      if (p.typ) d.classList.remove('t-' + p.typ);
      d.classList.add('t-' + c.typ);
      p.i.style.backgroundImage = 'url(' + ty.ikona + ')';
      p.s.style.backgroundImage = 'url(' + ty.strzalka + ')';
      p.typ = c.typ;
    }
    if (p.tryb !== tryb) { if (p.tryb) d.classList.remove(p.tryb); d.classList.add(tryb); p.tryb = tryb; }
    if (p.nowy !== !!c.nowy) { p.nowy = !!c.nowy; d.classList.toggle('nowy', p.nowy); }
    if (p.lg !== lg) { p.lg = lg; d.classList.toggle('lg', lg); }
    if (p.x !== x) { p.x = x; d.style.setProperty('--zx', px(x)); }
    if (p.y !== y) { p.y = y; d.style.setProperty('--zy', px(y)); }
    if (tryb === 'kraw' && p.kat !== kat) { p.kat = kat; p.s.style.setProperty('--za', KATY[kat]); }
    // zanik z bliska w kadrze (5 → 12 m); przy krawędzi zawsze pełny
    const op = tryb === 'kadr' ? Math.max(0, Math.min(20, Math.round((c.d - 5) / 7 * 20))) : 20;
    if (p.op !== op) { p.op = op; d.style.opacity = OPAC[op]; }
    // odległość: przy krawędzi zawsze, w kadrze dopiero od 20 m
    const m = tryb === 'kraw' || c.d > 20 ? Math.round(c.d) : -1;
    const txt = m < 0 ? '' : odl(m);
    if (p.txt !== txt) { p.txt = txt; p.t.textContent = txt; }
  }
  _wyl(p) {
    if (!p.on) return;
    p.on = false; p.d.style.display = 'none';
  }
}
