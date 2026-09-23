// ═══════════════════════════════════════════════════════════════════════════════
// MODELE NATURY — wczytywanie pakietu Quaternius „Stylized Nature MegaKit" (CC0)
// z assets/quaternius/ i przerabianie go na geometrie, których używa HORDA 3D:
// JEDNA scalona BufferGeometry na model, atrybuty position/normal/color, BEZ uv,
// bez materiałów i bez tekstur w czasie gry.
//
// Dlaczego tak: w grze wszystko rysujemy własnym MeshLambertMaterial({vertexColors:true}),
// więc kolor modelu trzeba ZAPIEC w wierzchołki. Robimy to raz, przy starcie:
//   1. GLTFLoader wczytuje .glb (geometria w środku, tekstura obok jako plik .png),
//   2. tekstura ląduje na canvasie i czytamy z niej piksele (getImageData),
//   3. dla każdego wierzchołka próbkujemy teksel po jego UV, zdejmujemy sRGB do
//      przestrzeni liniowej (tak jak robi to three dla material.color) i mnożymy
//      przez baseColorFactor materiału oraz przez COLOR_0 modelu (Quaternius trzyma
//      tam szary gradient = tanie AO: ciemniej u nasady liścia),
//   4. meshe modelu scalamy w jedną geometrię (mergeGeometries),
//   5. normalizujemy: podstawa na y=0, środek w XZ, wysokość dokładnie 1.0.
// Gra skaluje i obraca instancje sama, dlatego zwracamy też `h` i `r` PO normalizacji.
//
// Deterministyczne — ZERO Math.random.
//
// UWAGA o przezroczystości (najważniejsza pułapka tego pakietu): liście i kwiaty
// to karty z maską alfa (alphaMode: MASK). Sylwetkę liścia wycina TEKSTURA, nie
// geometria. Po zapieczeniu koloru i wyrzuceniu tekstury sylwetka znika — zostaje
// pełny wielokąt karty. Dlatego w przygotowaniu paczki:
//   • przezroczyste obszary każdej tekstury zostały WYPEŁNIONE kolorem najbliższego
//     nieprzezroczystego piksela (inaczej wierzchołek w rogu karty wylądowałby na
//     tle atlasu: białym w Leaves.png, czarnym w Leaves_*_C.png, pomarańczowym
//     w Flowers.png — i model wyszedłby biały/czarny/pomarańczowy),
//   • pliki .png w assets/quaternius/ są zapisane BEZ KANAŁU ALFA. Powód: canvas 2D
//     trzyma piksele PREMNOŻONE przez alfę, więc getImageData na pikselu o alfa=0
//     zawsze zwraca (0,0,0,0) — właśnie wypełniony kolor byłby nie do odczytania
//     i krzaki wychodziłyby czarne. (Sprawdzone: tak się stało przy pierwszym podejściu.)
// Modele z listy `glazy` oraz trawy i grzyby są w pełni nieprzezroczyste i wychodzą
// jeden do jednego. Szczegóły i lista pułapek w assets/quaternius/README.txt.
// ═══════════════════════════════════════════════════════════════════════════════
import { GLTFLoader } from './GLTFLoader.js';
import { mergeGeometries } from './BufferGeometryUtils.js';

// ─── Spis modeli (nazwa pliku = nazwa modelu Quaternius, bez rozszerzenia) ──────
export const SPIS_MODELI = {
  krzaki: [
    'Bush_Common',          // jesienny, CZERWONY — tak jest w pakiecie
    'Bush_Common_Zielony',  // ten sam krzak na białym atlasie + zielony baseColorFactor
    'Bush_Common_Flowers',  // zielony krzak z różowymi kwiatami
    'Fern_1',
    'Plant_1', 'Plant_1_Big',
    'Plant_7', 'Plant_7_Big',
    'Clover_2',
    'Grass_Wispy_Short', 'Grass_Wispy_Tall',
  ],
  glazy: [
    'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',       // właściwe głazy
    'Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3',    // płaskie kamyki
    'Pebble_Round_4', 'Pebble_Round_5',
    'Pebble_Square_1', 'Pebble_Square_5',
  ],
  kwiaty: [
    // Petal_1..5 WYRZUCONE (właściciel 19.09: „modele dużych kwiatów, samych kwiatów, nie
    // używaj") — to pojedyncze wielkie płatki leżące na ziemi, po normalizacji do h=1 robiły
    // się ogromnymi kolorowymi plamami. Zostają kępki i kwiatki na łodygach.
    'Flower_3_Single', 'Flower_3_Group', 'Flower_4_Single',
    'Clover_1',
    'Grass_Common_Short',
  ],
  grzyby: [
    'Mushroom_Common',
  ],
  // IGLAKI: gotowe, porządnie zrobione świerki z pakietu — gęsta trójkątna sylwetka
  // z warstwowymi, opadającymi gałęziami (tak radzą poradniki do stylizowanych iglaków;
  // nasz własny świerk z kart z igłami właściciel odrzucił dwa razy).
  iglaki: [
    'Pine_5', 'Pine_4', 'Pine_2',
  ],
};

// ─── sRGB → liniowo, dokładnie ta sama krzywa, której używa three (SRGBToLinear) ─
function srgbNaLiniowy(c) {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}
// tablica 256 wartości — sRGB→liniowo liczymy raz, nie dla każdego wierzchołka
const LUT_SRGB = new Float32Array(256);
for (let i = 0; i < 256; i++) LUT_SRGB[i] = srgbNaLiniowy(i / 255);
const LUT_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) LUT_LIN[i] = i / 255;

/**
 * Piksele tekstury na CPU. Rysujemy obrazek (HTMLImageElement albo ImageBitmap —
 * GLTFLoader zwraca jedno albo drugie zależnie od przeglądarki) na canvasie
 * i zdejmujemy tablicę RGBA. Cache po obrazku, bo kilkanaście modeli dzieli
 * ten sam atlas (np. Leaves.png).
 */
function pikseleTekstury(tex, cache) {
  const img = tex.image;
  if (!img) return null;
  let wpis = cache.get(img);
  if (wpis) return wpis;
  const w = img.width, h = img.height;
  if (!w || !h) return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const dane = ctx.getImageData(0, 0, w, h).data;
  // czy w ogóle jest co odsiewać — tekstury z paczki są nieprzezroczyste (patrz nagłówek)
  let maAlfe = false;
  for (let i = 3; i < dane.length; i += 4) { if (dane[i] < 250) { maAlfe = true; break; } }
  wpis = { dane, w, h, flipY: tex.flipY === true, maAlfe };
  cache.set(img, wpis);
  return wpis;
}

// indeks piksela pod współrzędnymi UV; w glTF UV (0,0) = LEWY GÓRNY róg obrazka,
// więc przy flipY=false (tak ustawia GLTFLoader) wiersz to wprost v*h
function indeksTeksela(tx, u, v) {
  let x = Math.floor((((u % 1) + 1) % 1) * tx.w);
  let y = Math.floor((((v % 1) + 1) % 1) * tx.h);
  if (tx.flipY) y = tx.h - 1 - y;
  if (x < 0) x = 0; else if (x >= tx.w) x = tx.w - 1;
  if (y < 0) y = 0; else if (y >= tx.h) y = tx.h - 1;
  return (y * tx.w + x) * 4;
}

/**
 * Jeden mesh → geometria z atrybutami position/normal/color w układzie ŚWIATA modelu.
 * Zwraca null, jeśli po odsianiu przezroczystych trójkątów nic nie zostało.
 */
function zapieczMesh(THREE, mesh, cacheTekstur, progAlfa, _m4, _m3, _v3) {
  const geo = mesh.geometry;
  const aPos = geo.attributes.position;
  const aNor = geo.attributes.normal;
  const aUv = geo.attributes.uv;
  const aCol = geo.attributes.color;
  if (!aPos) return null;

  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const tex = mat && mat.map ? mat.map : null;
  const tx = tex ? pikseleTekstury(tex, cacheTekstur) : null;
  // three ustawia colorSpace baseColorTexture na sRGB; gdyby ktoś podmienił na liniową,
  // nie zdejmujemy krzywej drugi raz
  const lut = (tex && tex.colorSpace === THREE.SRGBColorSpace) ? LUT_SRGB : LUT_LIN;
  // material.color GLTFLoader wpisuje już w przestrzeni roboczej (liniowej)
  const mr = mat ? mat.color.r : 1, mg = mat ? mat.color.g : 1, mb = mat ? mat.color.b : 1;

  const n = aPos.count;
  const idxWe = geo.index ? geo.index.array : null;
  const liczbaInd = idxWe ? idxWe.length : n;

  // 1) które trójkąty zostają (odsiewamy tylko te CAŁKIEM na przezroczystym tle)
  const trojkaty = [];
  for (let t = 0; t < liczbaInd; t += 3) {
    const a = idxWe ? idxWe[t] : t, b = idxWe ? idxWe[t + 1] : t + 1, c = idxWe ? idxWe[t + 2] : t + 2;
    if (tx && tx.maAlfe && aUv) {
      const ua = aUv.getX(a), va = aUv.getY(a);
      const ub = aUv.getX(b), vb = aUv.getY(b);
      const uc = aUv.getX(c), vc = aUv.getY(c);
      let maxA = 0;
      // trzy wierzchołki + środek ciężkości — wystarczy, żeby wyłapać pustą kartę
      const pr = [[ua, va], [ub, vb], [uc, vc], [(ua + ub + uc) / 3, (va + vb + vc) / 3]];
      for (let k = 0; k < 4; k++) {
        const al = tx.dane[indeksTeksela(tx, pr[k][0], pr[k][1]) + 3] / 255;
        if (al > maxA) maxA = al;
        if (maxA >= progAlfa) break;
      }
      if (maxA < progAlfa) continue;
    }
    trojkaty.push(a, b, c);
  }
  if (trojkaty.length === 0) return null;

  // 2) przepakowanie tylko używanych wierzchołków
  const mapa = new Int32Array(n).fill(-1);
  let ile = 0;
  for (let i = 0; i < trojkaty.length; i++) {
    const v = trojkaty[i];
    if (mapa[v] === -1) mapa[v] = ile++;
  }
  const pos = new Float32Array(ile * 3);
  const nor = new Float32Array(ile * 3);
  const col = new Float32Array(ile * 3);

  mesh.updateWorldMatrix(true, false);
  _m4.copy(mesh.matrixWorld);
  _m3.getNormalMatrix(_m4);

  for (let v = 0; v < n; v++) {
    const o = mapa[v];
    if (o === -1) continue;
    const t3 = o * 3;
    _v3.set(aPos.getX(v), aPos.getY(v), aPos.getZ(v)).applyMatrix4(_m4);
    pos[t3] = _v3.x; pos[t3 + 1] = _v3.y; pos[t3 + 2] = _v3.z;
    if (aNor) {
      _v3.set(aNor.getX(v), aNor.getY(v), aNor.getZ(v)).applyMatrix3(_m3).normalize();
      nor[t3] = _v3.x; nor[t3 + 1] = _v3.y; nor[t3 + 2] = _v3.z;
    }
    let r = mr, g = mg, b = mb;
    if (tx && aUv) {
      const p = indeksTeksela(tx, aUv.getX(v), aUv.getY(v));
      r *= lut[tx.dane[p]]; g *= lut[tx.dane[p + 1]]; b *= lut[tx.dane[p + 2]];
    }
    if (aCol) {                       // COLOR_0 w glTF jest liniowe — mnożymy wprost
      r *= aCol.getX(v); g *= aCol.getY(v); b *= aCol.getZ(v);
    }
    col[t3] = r; col[t3 + 1] = g; col[t3 + 2] = b;
  }

  // indeks 16-bitowy, dopóki starcza — te modele są małe, nie ma po co płacić 4 bajty
  const idx = ile > 65535 ? new Uint32Array(trojkaty.length) : new Uint16Array(trojkaty.length);
  for (let i = 0; i < trojkaty.length; i++) idx[i] = mapa[trojkaty[i]];

  const wy = new THREE.BufferGeometry();
  wy.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  wy.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  wy.setAttribute('color', new THREE.BufferAttribute(col, 3));
  wy.setIndex(new THREE.BufferAttribute(idx, 1));
  if (!aNor) wy.computeVertexNormals();
  return wy;
}

/** Podstawa na y=0, środek w XZ, wysokość = 1. Zwraca { h, r } PO normalizacji. */
function znormalizuj(THREE, geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const cx = (bb.min.x + bb.max.x) * 0.5;
  const cz = (bb.min.z + bb.max.z) * 0.5;
  geo.translate(-cx, -bb.min.y, -cz);
  const wys = bb.max.y - bb.min.y;
  const s = wys > 1e-6 ? 1 / wys : 1;
  geo.scale(s, s, s);

  const P = geo.attributes.position.array;
  let h = 0, r2 = 0;
  for (let i = 0; i < P.length; i += 3) {
    if (P[i + 1] > h) h = P[i + 1];
    const d = P[i] * P[i] + P[i + 2] * P[i + 2];
    if (d > r2) r2 = d;
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { h, r: Math.sqrt(r2) };
}

/** Zwolnienie materiałów i tekstur sceny glTF — po zapieczeniu nie są nam potrzebne. */
function zwolnij(scena) {
  scena.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      for (const k in m) {
        const v = m[k];
        if (v && v.isTexture) v.dispose();
      }
      m.dispose();
    }
  });
}

/**
 * Wczytuje cały pakiet natury.
 *
 * @param {object} THREE  moduł three (ten sam, który importuje lib/three.module.js)
 * @param {string} baza   katalog z plikami .glb + .png, ze slashem na końcu
 * @param {object} [opcje]
 *        progAlfa {number}  próg alfy, poniżej którego trójkąt uznajemy za pusty (dom. 0.5);
 *                           działa TYLKO gdy tekstura naprawdę ma kanał alfa — pliki
 *                           z assets/quaternius/ są celowo bez alfy, więc nic nie odsiewa
 *        spis     {object}  własny spis modeli zamiast SPIS_MODELI
 *        onBlad   {function(nazwa, blad)} wołane, gdy model się nie wczyta (dom. console.warn)
 * @returns {Promise<{krzaki:Array, glazy:Array, kwiaty:Array, grzyby:Array}>}
 *          każdy element: { nazwa, geo, h, r }
 *          geo — BufferGeometry z position/normal/color (bez uv), indeksowana,
 *          podstawa na y=0, środek w XZ, h ≈ 1.0
 */
export async function wczytajModeleNatury(THREE, baza = 'assets/quaternius/', opcje = {}) {
  const progAlfa = opcje.progAlfa !== undefined ? opcje.progAlfa : 0.5;
  const spis = opcje.spis || SPIS_MODELI;
  const onBlad = opcje.onBlad || ((n, e) => console.warn('[modele-natury] nie wczytano', n, e));

  const loader = new GLTFLoader();
  const cacheTekstur = new Map();
  const _m4 = new THREE.Matrix4(), _m3 = new THREE.Matrix3(), _v3 = new THREE.Vector3();

  const wynik = {};
  const zadania = [];
  for (const grupa of Object.keys(spis)) {
    wynik[grupa] = new Array(spis[grupa].length).fill(null);
    spis[grupa].forEach((nazwa, i) => {
      zadania.push(
        loader.loadAsync(baza + nazwa + '.glb')
          .then((gltf) => ({ grupa, i, nazwa, gltf }))
          .catch((e) => { onBlad(nazwa, e); return null; })
      );
    });
  }
  const wczytane = await Promise.all(zadania);

  // Zapiekanie po kolei (canvas + getImageData to praca na CPU, nie ma co zrównoleglać)
  for (const z of wczytane) {
    if (!z) continue;
    const meshe = [];
    z.gltf.scene.updateMatrixWorld(true);
    z.gltf.scene.traverse((o) => { if (o.isMesh && o.geometry) meshe.push(o); });
    const czesci = [];
    for (const m of meshe) {
      const g = zapieczMesh(THREE, m, cacheTekstur, progAlfa, _m4, _m3, _v3);
      if (g) czesci.push(g);
    }
    if (czesci.length === 0) { onBlad(z.nazwa, new Error('brak geometrii po zapieczeniu')); continue; }
    const geo = czesci.length === 1 ? czesci[0] : mergeGeometries(czesci, false);
    if (czesci.length > 1) for (const c of czesci) c.dispose();
    if (!geo) { onBlad(z.nazwa, new Error('mergeGeometries zwróciło null')); continue; }
    geo.name = z.nazwa;
    const { h, r } = znormalizuj(THREE, geo);
    wynik[z.grupa][z.i] = { nazwa: z.nazwa, geo, h, r };
    zwolnij(z.gltf.scene);
  }

  for (const grupa of Object.keys(wynik)) wynik[grupa] = wynik[grupa].filter(Boolean);
  return wynik;
}

/** Liczba trójkątów geometrii — przydatne w narzędziach i logach. */
export function liczbaTrojkatow(geo) {
  return (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
}
