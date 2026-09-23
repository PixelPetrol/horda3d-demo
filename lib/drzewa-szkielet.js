// ═══════════════════════════════════════════════════════════════════════════════
// SZKIELET DRZEWA Z GAŁĘZIAMI — pochodna biblioteki **ez-tree v1.1.0**
// (https://github.com/dgreenheck/ez-tree), Copyright (c) 2024 Daniel Greenheck,
// licencja MIT (pełny tekst na końcu pliku).
//
// Co wzięliśmy z ez-tree: rekurencyjny generator szkieletu (pień → konary → gałęzie,
// każda gałąź = łańcuch „sekcji" z własną orientacją, losowym skręceniem (gnarliness),
// siłą ciążenia/światła (force) i zbieżnością (taper)), rozkład dzieci wzdłuż rodzica
// (próbkowanie warstwowe + permutacja kątów) oraz siatkowanie pierścieni w rurki bez denek.
// Co wyrzuciliśmy: materiały, tekstury kory, liście-billboardy, LOD, kratę (trellis).
// Co dołożyliśmy: KORZENIE, kołnierz u nasady pnia, PIĘTRA dla świerków (dzieci
// w kilku wieńcach zamiast równo wzdłuż pnia), kolory wierzchołków (ciemniej w głębi
// korony i przy ziemi — tanie AO) i indeks 32-bitowy przy dużych siatkach.
//
// Jednostki: takie jak w grze (1 j. ≈ 46 px sprite'a). Generator jest DETERMINISTYCZNY
// (własny RNG z ziarna) — te same opcje = to samo drzewo, co pozwala trzymać kilka
// prefabów w pamięci i stawiać je w chunkach z różnym obrotem i skalą.
// ═══════════════════════════════════════════════════════════════════════════════
import * as THREE from './three.module.js';

// Multiply-with-carry (jak w ez-tree) — ten sam strumień dla tego samego ziarna
export class RNG {
  constructor(seed) {
    this.w = (123456789 + seed) & 0xffffffff;
    this.z = (987654321 - seed) & 0xffffffff;
  }
  random(max = 1, min = 0) {
    // `>>>` jak w ez-tree (recenzja 19.09: `>>` dawało inny strumień niż upstream dla tego samego ziarna)
    this.z = (36969 * (this.z & 65535) + (this.z >>> 16)) & 0xffffffff;
    this.w = (18000 * (this.w & 65535) + (this.w >>> 16)) & 0xffffffff;
    const r = (((this.z << 16) + (this.w & 65535)) >>> 0) / 4294967296;
    return (max - min) * r + min;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Opcje (tablice indeksowane POZIOMEM gałęzi: 0 = pień, 1 = konary, 2 = gałęzie…):
 *  seed        ziarno
 *  iglaste     true = świerk: brak gałęzi końcowej, zbieżność do zera, długość dzieci
 *              maleje z wysokością (stożek); false = liściaste (jak `deciduous` w ez-tree)
 *  levels      liczba poziomów rekurencji (2 = pień, konary, gałęzie)
 *  length[]    długość gałęzi na poziomie
 *  radius[]    poziom 0: promień pnia u nasady; poziomy >0: MNOŻNIK promienia rodzica
 *              w punkcie zaczepienia (0.6 = dziecko ma 60% grubości rodzica w tym miejscu)
 *  sections[]  ile odcinków ma gałąź (rozdzielczość wzdłuż)
 *  segments[]  ile boków ma pierścień (rozdzielczość wokół)
 *  children[]  ile dzieci wyrasta z gałęzi tego poziomu
 *  angle[]     kąt dziecka względem rodzica (stopnie), indeks = poziom DZIECKA
 *  start[]     od jakiego ułamka długości rodzica zaczynają się dzieci (indeks = poziom dziecka)
 *  taper[]     zbieżność (0 = walec, 1 = do zera na końcu)
 *  gnarliness[] skręcenie: losowe odchylenie orientacji co sekcję
 *  twist[]     skręt wokół własnej osi co sekcję (rad)
 *  force       { direction: Vector3, strength } — dodatnie = gałęzie ciągną do `direction`
 *              (światło), ujemne = uciekają od niego (ciążenie); dzielone przez promień,
 *              więc cienkie gałązki reagują mocniej niż pień
 *  pietra      (tylko świerk) liczba wieńców, w których grupują się konary; 0 = równo
 *  kolnierz    mnożnik promienia nasady pnia (1.3 = kołnierz korzeniowy)
 *  korzenie    { ile, dl, promien } — korzenie wybiegające z nasady pod ziemię
 */
export function generujSzkielet(o) {
  const rng = new RNG(o.seed | 0);
  const galezie = [];
  const kolejka = [{
    origin: new THREE.Vector3(), orientation: new THREE.Euler(),
    length: o.length[0], radius: o.radius[0], level: 0,
    sectionCount: o.sections[0], segmentCount: o.segments[0],
  }];
  const dir = (o.force && o.force.direction ? o.force.direction : UP).clone().normalize();
  const strength = o.force ? o.force.strength : 0;

  while (kolejka.length) rosnij(kolejka.shift());

  // kołnierz u nasady: dwie pierwsze sekcje pnia grubsze (pień „stoi" na ziemi, nie tkwi w niej jak ołówek)
  const pien = galezie[0];
  if (o.kolnierz && o.kolnierz !== 1) {
    pien.sections[0].radius *= o.kolnierz;
    if (pien.sections[1]) pien.sections[1].radius *= 1 + (o.kolnierz - 1) * 0.35;
  }
  if (o.korzenie && o.korzenie.ile) korzenie();

  // wysokość = najwyższy punkt szkieletu (do skalowania prefabów i sfery kolizji)
  let wys = 0, rozp = 0;
  for (const g of galezie) for (const s of g.sections) {
    if (s.origin.y > wys) wys = s.origin.y;
    const rr = Math.hypot(s.origin.x, s.origin.z);
    if (rr > rozp) rozp = rr;
  }
  // `rKolizji` = promień pnia ~1 j. nad nasadą (sekcja 2), nie kołnierza — kołnierz siedzi w trawie,
  // a kolizja z promieniem kołnierza zatrzymywała gracza 0.4 j. od kory (recenzja 19.09)
  const sekKol = pien.sections[Math.min(2, pien.sections.length - 1)];
  return { galezie, wysokosc: wys, rozpietosc: rozp, rPnia: o.radius[0] * (o.kolnierz || 1), rKolizji: sekKol.radius };

  // ---- jedna gałąź: łańcuch sekcji (port #growBranch z ez-tree) ----
  function rosnij(b) {
    const ori = b.orientation.clone(), org = b.origin.clone();
    const dl = b.length / b.sectionCount;
    const sections = [];
    for (let i = 0; i <= b.sectionCount; i++) {
      let r = b.radius;
      if (i === b.sectionCount && b.level === o.levels) r = 0.001;         // czubek ostatniego poziomu zamknięty
      else if (!o.iglaste) r *= 1 - o.taper[b.level] * (i / b.sectionCount);
      else r *= 1 - i / b.sectionCount;                                     // świerk: konar zbiega do zera
      sections.push({ origin: org.clone(), orientation: ori.clone(), radius: r });
      org.add(new THREE.Vector3(0, dl, 0).applyEuler(ori));
      // skręcenie: im cieńsza gałąź, tym bardziej się wije
      const gn = Math.max(1, 1 / Math.sqrt(Math.max(r, 0.02))) * (o.gnarliness[b.level] || 0);
      ori.x += rng.random(gn, -gn);
      ori.z += rng.random(gn, -gn);
      const q = new THREE.Quaternion().setFromEuler(ori);
      if (o.twist && o.twist[b.level]) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, o.twist[b.level]));
      // siła wzrostu: obrót kierunku sekcji KU `dir` (dodatnia) albo OD niego (ujemna),
      // wokół osi (up × dir) — gdy sekcja już celuje w `dir`, obrót jest zerowy
      if (strength) {
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        const axis = new THREE.Vector3().crossVectors(up, dir);
        const sinFull = axis.length();
        if (sinFull > 1e-6) {
          axis.divideScalar(sinFull);
          const full = Math.atan2(sinFull, up.dot(dir));
          const step = strength / Math.max(r, 0.02);
          q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, Math.max(-full, Math.min(full, step))));
        }
      }
      ori.setFromQuaternion(q);
    }
    galezie.push({ sections, segmentCount: b.segmentCount, baseRadius: b.radius, level: b.level, length: b.length });

    const last = sections[sections.length - 1];
    if (b.level < o.levels) {
      // liściaste: gałąź KOŃCOWA wyrasta z czubka rodzica (pień płynnie przechodzi w konar)
      if (!o.iglaste) kolejka.push({
        origin: last.origin, orientation: last.orientation, length: o.length[b.level + 1],
        radius: last.radius, level: b.level + 1, sectionCount: b.sectionCount, segmentCount: b.segmentCount,
      });
      dzieci(o.children[b.level] || 0, b.level + 1, sections);
    }
  }

  // ---- dzieci wzdłuż rodzica (port generateChildBranches + nasze piętra) ----
  function dzieci(count, level, sections) {
    if (!count) return;
    const radialOffset = rng.random();
    const startMin = o.start[level] || 0;
    const heightStep = (1 - startMin) / count;
    const angleSlots = permutacja(count);
    const pietra = o.iglaste && o.pietra > 0 && level === 1 ? o.pietra : 0;
    const naPietro = pietra ? Math.ceil(count / pietra) : 0;
    for (let i = 0; i < count; i++) {
      // próbkowanie warstwowe wzdłuż rodzica: równo, ale nie periodycznie.
      // Świerk z piętrami: konary skupione w `pietra` wieńcach (jak w BotW), z lekkim rozrzutem
      let t;
      if (pietra) {
        const p = Math.floor(i / naPietro);
        t = startMin + ((p + 0.5) / pietra + rng.random(0.06, -0.06)) * (1 - startMin);
      } else t = startMin + (i + rng.random()) * heightStep;
      t = Math.min(0.999, Math.max(0, t));
      const si = Math.floor(t * (sections.length - 1));
      const A = sections[si], B = sections[Math.min(si + 1, sections.length - 1)];
      const alpha = (t - si / (sections.length - 1)) * (sections.length - 1);
      const origin = new THREE.Vector3().lerpVectors(A.origin, B.origin, alpha);
      const radius = o.radius[level] * ((1 - alpha) * A.radius + alpha * B.radius);
      const qA = new THREE.Quaternion().setFromEuler(A.orientation);
      const qB = new THREE.Quaternion().setFromEuler(B.orientation);
      // A→B przy alpha 0→1, tak jak pozycja i promień wyżej (upstream ma tu `qB.slerp(qA, alpha)`,
      // czyli odwrotnie — recenzja 19.09: konary nie szły za wygięciem pnia)
      const parentQ = qA.clone().slerp(qB, alpha);
      // kąt wokół rodzica: sloty 2π/count z jitterem ±½ slotu, permutowane — żeby najdłuższe
      // konary świerka nie zwijały się spiralnie na jedną stronę
      const radial = 2 * Math.PI * (radialOffset + (angleSlots[i] + rng.random(0.5, -0.5)) / count);
      const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (o.angle[level] || 60) * Math.PI / 180);
      const q2 = new THREE.Quaternion().setFromAxisAngle(UP, radial);
      const orientation = new THREE.Euler().setFromQuaternion(parentQ.multiply(q2.multiply(q1)));
      // świerk: konary krótsze ku górze = stożek
      const length = o.length[level] * (o.iglaste ? 1 - t * (o.stozek === undefined ? 0.85 : o.stozek) : 1);
      kolejka.push({ origin, orientation, length, radius, level,
                     sectionCount: o.sections[level], segmentCount: o.segments[level] });
    }
  }

  function permutacja(n) {
    const a = Array.from({ length: n }, (_, k) => k);
    for (let k = n - 1; k > 0; k--) { const r = Math.floor(rng.random() * (k + 1)); [a[k], a[r]] = [a[r], a[k]]; }
    return a;
  }

  // ---- KORZENIE (nasze): 3-4 grube, krótkie odnogi od nasady, wyginające się w dół pod trawę.
  // Odchodzą WYSOKO (0.7-1.1 j. nad nasadą, trawa w grze ma ~1 j.!) i nurkują coraz stromiej,
  // tak żeby czubek schował się pod teren (nasada stoi 0.12 j. pod terenem). Pierwsza wersja
  // startowała na 0.75·R0 i od razu pod kątem 20-35° — cały korzeń siedział w kołnierzu albo
  // pod ziemią (recenzja 19.09: 6-8% siatki renderowane na marne). ----
  function korzenie() {
    const k = o.korzenie, R0 = o.radius[0];
    let az = rng.random(Math.PI * 2);
    for (let i = 0; i < k.ile; i++) {
      az += Math.PI * 2 / k.ile * rng.random(1.25, 0.75);
      const dl = k.dl * rng.random(1.2, 0.85), r0 = R0 * (k.promien || 0.55) * rng.random(1.2, 0.85);
      const n = 3, sections = [];
      let px = Math.cos(az) * R0 * 0.45, py = 0.35 + R0 * 0.9 + rng.random(0.25), pz = Math.sin(az) * R0 * 0.45;
      let kat = -0.20 - rng.random(0.20);                        // start ~11-23° pod poziom
      for (let s = 0; s <= n; s++) {
        const dx = Math.cos(az) * Math.cos(kat), dy = Math.sin(kat), dz = Math.sin(az) * Math.cos(kat);
        // orientacja sekcji: lokalne +Y walca = kierunek korzenia
        const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(dx, dy, dz).normalize());
        sections.push({ origin: new THREE.Vector3(px, py, pz), orientation: new THREE.Euler().setFromQuaternion(q),
                        radius: s === n ? 0.001 : r0 * (1 - 0.70 * s / n) });
        const krok = dl / n;
        px += dx * krok; py += dy * krok; pz += dz * krok;
        kat -= 0.36;                                             // każdy odcinek bardziej w dół
      }
      galezie.push({ sections, segmentCount: 5, baseRadius: r0, level: 0, length: dl, korzen: true });
    }
  }
}

/**
 * Szkielet → siatka rurek (port #meshBranch): pierścienie `segments` wierzchołków na sekcję,
 * quady między kolejnymi pierścieniami, normalne promieniste (gładkie wokół), BEZ denek
 * (czubki mają promień ~0 i same się zamykają). Kolory wierzchołków = tanie AO:
 * `jasnosc[poziom]` (gałązki w głębi korony ciemniejsze), nasada pnia ciemniejsza,
 * korzenie ciemniejsze. Zwraca BufferGeometry (position, normal, color, index).
 */
export function siatkaGalezi(szk, opt = {}) {
  const jasnosc = opt.jasnosc || [1.0, 0.90, 0.80, 0.72];
  let nV = 0, nI = 0;
  for (const g of szk.galezie) { nV += g.sections.length * g.segmentCount; nI += (g.sections.length - 1) * g.segmentCount * 6; }
  const pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3), col = new Float32Array(nV * 3);
  const idx = nV > 65535 ? new Uint32Array(nI) : new Uint16Array(nI);
  let v = 0, ii = 0;
  const _v = new THREE.Vector3(), _n = new THREE.Vector3();
  for (const g of szk.galezie) {
    const seg = g.segmentCount, base = v;
    const jPoz = jasnosc[Math.min(g.level, jasnosc.length - 1)] * (g.korzen ? 0.82 : 1);
    for (let k = 0; k < g.sections.length; k++) {
      const s = g.sections[k];
      // nasada pnia w cieniu trawy: pierwsze dwie sekcje poziomu 0 ciemniejsze
      const jAO = g.level === 0 && !g.korzen ? 0.80 + 0.20 * Math.min(1, k / 2) : 1;
      const j = jPoz * jAO;
      for (let m = 0; m < seg; m++) {
        const a = 2 * Math.PI * m / seg, ca = Math.cos(a), sa = Math.sin(a);
        _n.set(ca, 0, sa).applyEuler(s.orientation);
        _v.copy(_n).multiplyScalar(s.radius).add(s.origin);
        pos[v * 3] = _v.x; pos[v * 3 + 1] = _v.y; pos[v * 3 + 2] = _v.z;
        nrm[v * 3] = _n.x; nrm[v * 3 + 1] = _n.y; nrm[v * 3 + 2] = _n.z;
        col[v * 3] = j; col[v * 3 + 1] = j; col[v * 3 + 2] = j;
        v++;
      }
    }
    for (let k = 0; k < g.sections.length - 1; k++) {
      for (let m = 0; m < seg; m++) {
        const v1 = base + k * seg + m, v2 = base + k * seg + (m + 1) % seg, v3 = v1 + seg, v4 = v2 + seg;
        idx[ii++] = v1; idx[ii++] = v3; idx[ii++] = v2;
        idx[ii++] = v2; idx[ii++] = v3; idx[ii++] = v4;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

/*
MIT License

Copyright (c) 2024 Daniel Greenheck

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
