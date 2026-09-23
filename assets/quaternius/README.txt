assets/quaternius/ — modele natury do HORDA 3D
==============================================
Źródło: Quaternius „Stylized Nature MegaKit", CC0. Szczegóły w LICENSE.txt.
Rozmiar całej paczki: 1,45 MB  (32 pliki .glb = 672 KB, 9 tekstur .png = 591 KB).
32 pliki = 31 oryginalnych modeli Quaternius + 1 nasz wariant kolorystyczny.

Wczytuje się to przez lib/modele-natura.js — patrz „JAK UŻYWAĆ" na końcu.


CO TU JEST
----------
Nazwa pliku = nazwa modelu u Quaternius. Kolumny: tris / wierzchołki po zapieczeniu,
oraz h i r PO NORMALIZACJI (h zawsze 1.0, r = promień poziomy).

KRZAKI (11)                tris    v     h     r    uwagi
  Bush_Common               900  1800  1.00  0.67  JESIENNY, CZERWONY (tak jest w pakiecie)
  Bush_Common_Zielony       900  1800  1.00  0.67  nasz wariant: ta sama siatka, zielony
  Bush_Common_Flowers      1368  2515  1.00  0.67  zielony + różowe kwiatki
  Fern_1                    288   243  1.00  1.69  paproć, płaska i szeroka
  Plant_1                   120   120  1.00  0.76  żółtozielone ostre liście
  Plant_1_Big               360   360  1.00  0.48  wyższa wersja Plant_1
  Plant_7                    48    54  1.00  2.23  fioletowa „koniczynka", bardzo płaska
  Plant_7_Big               112   126  1.00  3.11  jw., większa kępa — SKRAJNIE płaska
  Clover_2                  615   433  1.00  0.36  wysokie łodyżki z listkami
  Grass_Wispy_Short         494   559  1.00  0.74  sucha, żółtozielona kępa trawy
  Grass_Wispy_Tall          622   644  1.00  0.55  jw., wyższa

GŁAZY (10)                 tris    v     h     r    uwagi
  Rock_Medium_1             342   351  1.00  0.75  właściwy głaz, jasny, gładki
  Rock_Medium_2             244   249  1.00  0.92  jw.
  Rock_Medium_3             522   531  1.00  0.80  jw.
  Pebble_Round_1            136   292  1.00  2.89  PŁASKI kamień ścieżkowy
  Pebble_Round_2            114   212  1.00  2.70  jw.
  Pebble_Round_3            128   244  1.00  2.80  jw.
  Pebble_Round_4            126   266  1.00  2.52  jw.
  Pebble_Round_5            124   254  1.00  2.19  jw.
  Pebble_Square_1           104   216  1.00  2.36  jw., kanciasty
  Pebble_Square_5            72   156  1.00  1.86  jw.

KWIATY (10)                tris    v     h     r    uwagi
  Petal_1                    13    14  1.00  1.17  pojedynczy kwiat przy ziemi (fioletowy)
  Petal_2                    15    16  1.00  1.61  pomarańczowy
  Petal_3                    15    16  1.00  1.94  czerwono-różowy
  Petal_4                    30    25  1.00  0.67  żółty, jedyny „stojący"
  Petal_5                    15    16  1.00  1.65  pomarańczowy
  Flower_3_Single           285   227  1.00  0.24  żółty kwiat na łodydze
  Flower_3_Group            755   581  1.00  0.46  kępa Flower_3
  Flower_4_Single           642   499  1.00  0.26  różowy kwiat na łodydze
  Clover_1                  379   267  1.00  0.41  łodyżki z listkami
  Grass_Common_Short        155   153  1.00  0.35  zielona kępka trawy

GRZYBY (1)                 tris    v     h     r
  Mushroom_Common           880   555  1.00  0.93  grupka jasnych grzybków

TEKSTURY (wspólne, 512x512, PNG bez kanału alfa)
  Flowers.png 66 KB · Grass.png 8 KB · Leaves.png 79 KB · Mushrooms.png 173 KB
  PathRocks_Diffuse.png 123 KB · Rocks_Diffuse.png 138 KB
  Leaves_NormalTree_C.png 1,5 KB · Leaves_TwistedTree.png 1,5 KB · Leaves_TwistedTree_C.png 1,5 KB
  (te trzy ostatnie po wypełnieniu tła zrobiły się praktycznie jednolitym kolorem)


PUŁAPKI — PRZECZYTAJ, ZANIM COŚ TU ZMIENISZ
-------------------------------------------
1. ŻADEN model nie ma koloru w materiale. Wszystkie mają teksturę-atlas
   (baseColorTexture) i kolor trzeba z niej próbkować po UV. Modelu z samym
   `baseColorFactor` w tym pakiecie nie ma ani jednego.

2. Liście i kwiaty to KARTY Z MASKĄ ALFA (alphaMode: MASK). Sylwetkę wycina
   tekstura, nie geometria. Po zapieczeniu koloru do wierzchołków i wyrzuceniu
   tekstury karta zostaje pełnym wielokątem. W praktyce:
     * Bush_Common / Bush_Common_Zielony / Bush_Common_Flowers to 450 PŁASKICH
       QUADÓW każdy, a UV każdego quada rozciąga się na CAŁY atlas. Renderowane
       nieprzezroczyście dają gęstą, kolczastą kulę — i wbrew obawom wyglądają
       dokładnie jak „puchaty krzak" (sprawdzone w podglądzie). Ale to jest
       powód, dla którego mają 900–1368 trójkątów i nie da się tego zmniejszyć
       bez przemodelowania.
     * Fern_1, Plant_*, Clover_*, Flower_*, Petal_* mają liście już wymodelowane
       w kształt (maska alfa tylko dociosuje brzegi) — te wychodzą 1:1.

3. TEKSTURY NIE MAJĄ KANAŁU ALFA — CELOWO. Canvas 2D trzyma piksele PREMNOŻONE
   przez alfę, więc `getImageData` na pikselu o alfa=0 zawsze zwraca (0,0,0,0),
   niezależnie od tego, co jest w pliku. Przy pierwszym podejściu (tekstury z alfą)
   wszystkie trzy krzaki wychodziły CZARNE, bo ich wierzchołki leżą w rogach kart,
   czyli na przezroczystym tle atlasu. Dlatego:
     * przezroczyste obszary zostały wypełnione kolorem najbliższego
       nieprzezroczystego piksela (dokładny nearest, transformata odległościowa),
     * kanał alfa usunięto.
   Jeśli kiedyś będziesz te tekstury podmieniać — NIE przywracaj alfy.
   Druga pułapka przy przygotowaniu: `Image.resize()` w Pillow na obrazku RGBA
   premnaża alfę i kasuje kolor tam, gdzie alfa=0, więc kolor i alfę trzeba
   zmniejszać osobno.

4. UV w glTF liczy się od LEWEGO GÓRNEGO rogu (v=0 to górny wiersz obrazka),
   a GLTFLoader ustawia teksturom flipY=false. Odwrócenie v daje kolory z innego
   miejsca atlasu (sprawdzone: Clover wychodzi wtedy pomarańczowy zamiast zielonego).

5. COLOR_0. Większość roślin ma atrybut COLOR_0 z SZARYM gradientem (ciemniej
   u nasady) — Quaternius trzyma tam albo AO, albo maskę do shadera wiatru.
   Moduł mnoży go w kolor wierzchołka i wygląda to dobrze (ładne przyciemnienie
   przy ziemi). Bush_* mają COLOR_0 = same jedynki, więc nic nie zmienia.
   Kamienie i grzyby nie mają COLOR_0 w ogóle.

6. „h = 1.0" oznacza, że PŁASKIE modele robią się bardzo szerokie.
   Pebble_* mają po normalizacji r ≈ 1,9–2,9, a Plant_7_Big aż 3,11.
   Dla kamieni ścieżkowych i płatków skaluj instancję po `r`, nie po `h`:
       const s = zadanaSzerokosc / m.r;     // zamiast zadanaWysokosc / 1
   Właściwe głazy (Rock_Medium_*) mają r ≈ 0,75–0,92, tu skalowanie po wysokości
   jest w porządku.

7. LIMITY TRÓJKĄTÓW z założenia (krzak/głaz ≤ 600, kwiat ≤ 300) przekraczają:
       Bush_Common 900, Bush_Common_Zielony 900, Bush_Common_Flowers 1368,
       Clover_2 615, Grass_Wispy_Tall 622, Mushroom_Common 880,
       Flower_3_Group 755, Flower_4_Single 642, Clover_1 379, Petal_* (płaskie, po 13–30)
   W pakiecie NIE MA lżejszych zamienników — Bush_Common i Bush_Common_Flowers to
   jedyne krzaki, jakie Quaternius w tym MegaKicie dał (68 modeli, reszta to drzewa).
   Jeśli 900 tris na krzak boli: używaj ich rzadziej / dalej, a bliżej gracza
   stawiaj Plant_1_Big (360) i Grass_Wispy_Short (494).

8. Pakiet ma 68 modeli, nie „40 drzew + 35 roślin" jak głosi opis. Reszta
   (CommonTree_*, Pine_*, DeadTree_*, TwistedTree_*) to drzewa po 3–10 tys.
   trójkątów — nie brane, bo drzewa robimy generatorem lib/drzewa-szkielet.js.


JAK UŻYWAĆ
----------
    import { wczytajModeleNatury } from './lib/modele-natura.js';

    const natura = await wczytajModeleNatury(THREE, 'assets/quaternius/');
    // natura.krzaki / .glazy / .kwiaty / .grzyby
    // każdy element: { nazwa, geo, h, r }
    //   geo — BufferGeometry: position + normal + color, indeksowana, BEZ uv,
    //         podstawa na y=0, środek w XZ, wysokość dokładnie 1.0
    //   h   — wysokość po normalizacji (zawsze 1.0)
    //   r   — promień poziomy po normalizacji

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const m = natura.krzaki[1];                 // Bush_Common_Zielony
    const mesh = new THREE.Mesh(m.geo, mat);
    mesh.scale.setScalar(1.4);                  // 1.4 jednostki wysokości
    mesh.position.set(x, 0, z);

Kolory w atrybucie `color` są LINIOWE (tak jak THREE.Color po ColorManagement),
więc mnożą się z `material.color` i z odcieniem chunka dokładnie tak jak kolory
z lib/drzewa-szkielet.js.

Podgląd wszystkiego naraz: narzedzia/podglad_modeli.html
(serwuj katalog gry po http, np. `python3 -m http.server 8124 -d .`).
