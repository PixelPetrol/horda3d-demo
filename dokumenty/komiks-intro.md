# KOMIKS WPROWADZAJĄCY — scenariusz + prompty do PixelLaba (Etap 2, 18.09.2026)

Decyzja właściciela: fabuła = **komiks 4-5 plansz** przy pierwszym uruchomieniu (pomijalny,
potem dostępny z menu) + wpisy w bestiariuszu. Plansze generuje właściciel, silnik pokazuje je
jeden po drugim z podpisami. **PODPISY RYSUJE SILNIK** (dwa języki, PL/EN) — na obrazkach
NIE MOŻE być żadnego tekstu, dymków ani liter.

## Wymagania techniczne (żeby silnik przyjął plansze bez ręcznej roboty)
- Pliki: `assets/komiks/plansza1.png` … `plansza5.png`, PNG, **640×360 px** (16:9),
  pixel art ok. 4 px na „piksel" (czyli rysunek w 160×90 powiększony ×4 nearest-neighbour,
  albo od razu w 640×360 grubymi pikselami). Bez przezroczystości (pełne tło).
- Paleta jak w grze: limonkowa trawa (`#9adf58`, `#c2f074`), niebo `#9cc8ec`, kontur
  `#1b1b22`, śmieciowe żarcie w żółciach/beżach/brązach (`#f2c14a`, `#d6a63c`, `#7a4426`),
  warzywa soczyste (marchew `#ff7a1a`, nać `#3f8f32`).
- Kadr: dużo „powietrza" na dole (dolne ~22% planszy silnik przyciemnia pod podpis).
- Bez logotypów, bez tekstu, bez napisów na koszulkach (jak w biblii postaci).

## Fabuła w jednym akapicie (do bestiariusza / itch.io)
PL: Osiedle Grządkowo żyło spokojnie: trzepak był siłownią, piaskownica ringiem, a na rogu
stał warzywniak Nonny. Aż przyjechała **La Famiglia Snackoni** — mafia przekąsek pod wodzą
Dona Chipso — z jednym planem: zasypać osiedle solą i cukrem, a w miejscu warzywniaka
postawić automat. Warzywa powiedziały „nie na moim osiedlu". Broń: witaminy. Motto rodziny:
„Nic osobistego. Sama sól."
EN: The Blockyard (Grządkowo Estate) was a quiet block: the carpet rack was the gym, the sandbox was the
ring, and Nonna's veggie stand stood on the corner. Then **La Famiglia Snackoni** rolled in,
a snack mafia run by Don Chipso, with one plan: bury the block in salt and sugar and put a
vending machine where the veggie stand used to be. The vegetables said "not on my block."
Their weapon: vitamins. The family motto: "Nothing personal. Just salt."

## Plansze

### 1. Osiedle o poranku
- **Obraz:** blok z wielkiej płyty w słońcu, przed nim trzepak, piaskownica, limonkowa trawa,
  na rogu mały drewniany warzywniak z daszkiem w paski; w tle drzewa jak w grze. Spokój.
- **Podpis PL:** „Osiedle Grządkowo. Trzepak był siłownią, piaskownica ringiem, a na rogu
  stał warzywniak Nonny."
- **Podpis EN:** "The Blockyard. The carpet rack was the gym, the sandbox was the ring,
  and Nonna's veggie stand stood on the corner."
- **Prompt:** `pixel art illustration, 16:9, wide establishing shot of a sunny Polish housing
  estate block of flats, prefab concrete building, a metal carpet-beating rack and a sandbox
  in front, small wooden vegetable stand with striped awning on the corner, bright lime green
  grass, fluffy stylized trees, clear blue sky, Zelda Breath of the Wild colors, thick dark
  outlines, limited palette, crisp hard pixels, no text, no characters`

### 2. Przyjazd Famiglii
- **Obraz:** czarna limuzyna z opuszczoną szybą wjeżdża na osiedle, z niej wychyla się
  Don Chipso (wielka wymięta torba chipsów w prążkowanym garniturze, fedora, cygaro,
  ciemne okulary, złoty łańcuch); wokół auta rozsypana sól błyszczy na trawie; z tyłu
  rząd małych Chipsettich (wymięte chipsy z ambicjami) maszeruje w szyku.
- **Podpis PL:** „Aż przyjechała La Famiglia Snackoni. Don Chipso mówił szeptem, bo kto ma
  sól, nie musi krzyczeć."
- **Podpis EN:** "Then La Famiglia Snackoni rolled in. Don Chipso spoke in whispers, because
  whoever has the salt doesn't need to shout."
- **Prompt:** `pixel art illustration, 16:9, a black mafia limousine arriving on a housing
  estate lawn, a giant crumpled potato chip bag character wearing a pinstripe suit, fedora,
  dark sunglasses, gold chain and cigar leaning out of the window, a marching row of small
  crumpled potato chip soldiers behind the car, salt crystals glittering on lime green grass,
  greasy yellow and brown snack colors against bright green, thick dark outlines, limited
  palette, crisp hard pixels, no text`

### 3. Plan: sól, cukier i automat
- **Obraz:** warzywniak Nonny zasypywany solą i cukrem z ciężarówki-wywrotki (loga
  zakryte), obok robotnicy-Chipsetti stawiają wielki automat z przekąskami z neonowym
  frontem; Nonna (mała, siwa babcia-jabłko w chuście: Granny Smithella) stoi z kapciem w
  dłoni; w tle Ketchupino Splatterino (butla ketchupu) pluje na trawę czerwoną kałużę.
- **Podpis PL:** „Plan był prosty: zasypać osiedle solą i cukrem, a w miejscu warzywniaka
  postawić automat. Nic osobistego. Sama sól."
- **Podpis EN:** "The plan was simple: bury the block in salt and sugar and put a vending
  machine where the veggie stand used to be. Nothing personal. Just salt."
- **Prompt:** `pixel art illustration, 16:9, a small wooden vegetable stand being buried
  under a pile of white salt and sugar poured from a dump truck, crumpled potato chip
  workers installing a huge glowing snack vending machine next to it, a tiny old green apple
  grandma character in a headscarf holding a slipper, a ketchup bottle character spitting a
  red puddle in the background, bright lime grass, thick dark outlines, limited palette,
  crisp hard pixels, no text, no logos`

### 4. „Nie na moim osiedlu"
- **Obraz:** zbliżenie na Carrotella Squattello (umięśniona marchewka z gołym torsem, nać
  zaczesana jak czub, złoty łańcuch, granatowe dresy z białymi paskami, klapki i białe
  skarpety) wstającego z kucek przy trzepaku; za nim ramię w ramię Beetino Bouncerino
  (burak-bramkarz w czarnej koszulce), Radishetta Razoretta (rzodkiewka z piórnikiem)
  i Garlicino Stinkerino (czosnek z zielonkawą chmurką); w tle nadchodząca horda chipsów.
- **Podpis PL:** „Carrotello wstał z kucek. — Nie na moim osiedlu. Warzywa stanęły ramię w
  ramię."
- **Podpis EN:** "Carrotello rose from his squat. 'Not on my block.' The vegetables stood
  shoulder to shoulder."
- **Prompt:** `pixel art illustration, 16:9, heroic low angle shot of a muscular
  bare-chested carrot character with a swept-back leafy green hairdo, gold chain, navy
  tracksuit pants with two white stripes, flip-flops and white socks rising from a squat
  next to a metal carpet-beating rack, behind him a bulky beetroot bouncer in a black
  t-shirt, a slim radish girl with a pencil case and a garlic character with a faint green
  stink cloud, an approaching horde of crumpled potato chip soldiers in the far background,
  bright lime grass and blue sky, thick dark outlines, limited palette, crisp hard pixels,
  no text`

### 5. Witaminy w ruch (przejście do gry)
- **Obraz:** Carrotello w biegu przez limonkową łąkę, wokół niego lecą pociski-witaminki
  (żółte kulki i kapsułki), z czterech stron zbiega się horda Chipsettich, Marshmallinich
  (pianki) i Gummini (żelkowe misie); jasny, dynamiczny kadr z góry pod kątem 40°, jak
  kamera w grze.
- **Podpis PL:** „Broń: witaminy. Przeciwnik: cała Famiglia. Przetrwaj, aż Don Chipso
  wyjdzie z limuzyny."
- **Podpis EN:** "Weapon: vitamins. Enemy: the whole Famiglia. Survive until Don Chipso
  steps out of the limo."
- **Prompt:** `pixel art illustration, 16:9, three-quarter top-down action shot of a
  muscular carrot character in navy tracksuit pants running through a bright lime green
  meadow, glowing yellow vitamin pellets and capsules flying around him, a horde of
  crumpled potato chips, pink marshmallow thugs and gummy bears closing in from all sides,
  motion, bright saturated colors, thick dark outlines, limited palette, crisp hard pixels,
  no text`

## Jak silnik to pokaże (do wdrożenia w Etapie 2)
- Overlay `#komiksOv`: plansza na całą szerokość (letterbox), podpis w pasku na dole
  czcionką gry, przycisk „Dalej" / A na padzie / dotyk, „Pomiń" / B. Po ostatniej planszy
  → menu. `META.ui.komiks = true` po pierwszym obejrzeniu; przycisk „Fabuła" w menu
  odpala ponownie.
- Teksty podpisów w słowniku i18n (PL/EN), **nie w obrazkach**.
- Wpisy do bestiariusza: każdemu Snackoni dopisać jedno zdanie o roli w planie Dona
  (biblia ma bio — wziąć stamtąd).
