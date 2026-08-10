# HORDA 3D — nowy projekt „na poważnie" (survivors-like à la Megabonk)

> Stan: 10.08.2026 — **prototyp v28 działa** (testowany w przeglądarce).
> v11 = PEŁNY SYSTEM BRONI: 3 sloty, 6 broni, pasywy, wymiennik ze skrzyń,
> odblokowania w sklepie za monety. Wcześniej: mapa nieskończona, ewolucje,
> skrzynie/totemy/jeziora/biomy/elity. Wszystko zweryfikowane, konsola czysta.
> Decyzje usera: osobny NOWY projekt (nie misja w Rudeuszu), na poważnie:
> **Steam + telefony (mobile = darmowa z reklamami)**. Klimat absurdalny w duchu
> „italian brainrot", ale z **własnymi postaciami** (bez postaci z memów — ryzyko
> prawne przy komercji; brainroty wygenerujemy sami w PixelLab). Na razie
> placeholdery = sprite'y z Rudeusza. User zażyczył sobie „większego 3D" jak
> w Megabonku → zrobione w v4-v7 (teren, niska kamera, obrót, skok).

## Jak uruchomić
- Serwer: `python3 -m http.server 8123 -d "<ten folder>"` → http://localhost:8123
  (albo preview `horda3d` z `.claude/launch.json` w „codex claude pliki").
- Czysty statyczny hosting — zero builda, zero npm.

## Technologia (po przebudowie 3D v4-v7)
- **Three.js r160** (lokalnie: `lib/three.module.js`, bez CDN) + vanilla JS (ES modules).
- **TEREN**: value-noise heightfield `terrainH(x,z)` (2 oktawy: 5.4×/40 + 1.6×/14,
  start spłaszczony w promieniu ~16); siatka PlaneGeometry 320² × 150 segmentów,
  wierzchołki podnoszone + `computeVertexNormals`; MeshLambertMaterial + Hemisphere
  + DirectionalLight = cieniowanie stoków. WSZYSTKO (gracz, wrogowie, dropy,
  pociski, dekoracje, kamera) sampluje terrainH.
- **KAMERA**: nisko za plecami (CAM_DIST 9.2, CAM_H 6.4), **orbituje wg `camYaw`**
  (Q/E, drag myszą, na dotyku prawa połowa ekranu), clamp nad terenem, lookAt
  lekko przed gracza. Chmury-billboardy na niebie, mgła 55-135, głazy low-poly 3D.
- **SKOK** (Megabonk-style): spacja / przycisk 🦘 (pointer:coarse); airY+vy, g=22,
  w powietrzu (airY>0.25) brak obrażeń kontaktowych; anim 'jump' Kasi.
- Postacie = **billboardy 8-kierunkowe à la Doom**: arkusze PixelLab cięte na
  klatki → materiał na klatkę (`LIB[postać][anim].dirs[kier][klatka]`); wybór rzędu:
  `rel = facing - camYaw` → indeks 0-7; mesh.rotation.y = camYaw (twarzą do kamery).
  Dekoracje (drzewa itd.) też obracane do kamery (`decoBB[]`).
- Ruch gracza WZGLĘDEM KAMERY: forward = (-sin camYaw, -cos camYaw), right = (-fz, fx).
- `spritedata.js` = wyciąg z `gra-prototyp/sprites.js` (node eval → JSON).
- Kolejność rzędów: S, SE, E, NE, N, NW, W, SW; `faceAngle(x,z)`: 0 = +Z. Pivot
  sprite'a w stopach, `footY = -footOff*PX2U`. Cień = plamka na wys. terenu.
- Pixele: `NearestFilter`, `generateMipmaps=false`, `alphaTest 0.5`, `SRGBColorSpace`.
- **DEBUG**: `window.HORDA = {G, P, terrainH, step(n, dt)}` — step() = ręczne
  krokowanie pętli do testów w podglądzie (rAF dławiony bez fokusa — pułapka jak
  w Rudeuszu!). Usunąć przed wydaniem.

## Pętla gry (zrobione w prototypie)
- WASD/strzałki + **pływający joystick dotykowy** (nietestowany na realnym dotyku).
- Auto-strzał do najbliższych wrogów (P.shots celów, pierce, range).
- Wrogowie: dresiarz / żul (`enemy`) / wegielek (stadka od 90 s) / dzik (od 150 s,
  szybki) / **boss doctorAngry co 3 min** (hp 90, skala 1.9). HP skaluje się z czasem
  (+35%/min). Spawn na pierścieniu r=36-44 wokół gracza, interval 1.5 s → 0.22 s.
- **Separacja wrogów** siatką przestrzenną (CELL 1.4, min dystans 0.85) — bez niej
  zbijali się w kolumnę.
- Śmierć: animacja `death` (dresiarz/żul) albo natychmiast; drop 🦴 = XP (magnes).
- **Karty ulepszeń** (3 losowe przy awansie, pauza): obrażenia/tempo/+pocisk/
  szybkość/magnes/**kość orbitalna**/+serce/przebicie/zasięg (`UPGRADES[]`).
- HUD: pasek XP, poziom, timer, 💀, serca ❤️/🖤; winieta przy obrażeniach,
  wstrząs kamery, iskry trafień, i-frames 0.9 s + miganie.
- Ekrany: start / KONIEC (czas, kille, poziom) / JESZCZE RAZ.

## Wnioski z pierwszego testu (user grał w podglądzie 8.08)
- Pełna pętla działa (karty klikalne, restart OK), zero błędów w konsoli.
- User zginął w ~1 min → zmiękczony start (interval 1.5 s, dresiarz 2.7 speed) — v3.
- Zrzuty: horda ładnie się rozprasza po separacji; kierunkowe klatki działają.

## Meta-progresja (v4) — wariant 3 wybrany przez usera
- Monety 🪙: 9% dropu z wrogów, boss = 12 szt.; zapis w localStorage
  (`horda3d_meta_v1`), sumują się między biegami.
- SKLEP (ekran startu i końca): Twarde serce (+1 start, max 3), Siła brainrota
  (+10% dmg, max 5), Kondycja (+8% speed, max 5), Przyciąganie (+20% magnes, max 5);
  cena = base × 2^poziom. Nakładane w `resetStats()`.

## Mapa i mechaniki v8-v9 (8.08 późny wieczór)
- **JEZIORA**: teren obniżony o 1.15 → doliny poniżej `WATER_Y=0.75` zalane
  (tafla = jeden przezroczysty plane); woda spowalnia gracza ×0.6 i wrogów ×0.7;
  skok NAD wodą nie spowalnia. Brzegi przyciemnione (muł) przez vertex colors.
- **BIOMY** (`biome(x,z)` = noise /62): las (soczysta zieleń, gęste dęby+krzaki)
  vs sucha łąka (płowa trawa, kępy, kwiatki, stracharze); kolory = vertex colors
  mnożone z teksturą; `landSpot(forest)` = sampling z odrzucaniem (nie w wodzie).
- **SKRZYNIE** (chest0-3.png, 9 szt.): podejście = otwarcie (animacja 4 klatek);
  nagrody: 55% monety 5-10, 30% 6 kości XP, 15% WIELKI MAGNES (zasysa wszystko
  z mapy, `G.vacuum`); respawn w nowym miejscu po 45 s.
- **TOTEMY** (column1.png, 3 szt., pulsujący pierścień): dotknięcie = losowy buff
  na ~18 s (💥 podwójne obrażenia / 👟 przyspieszenie ×1.45 / 🥶 wrogowie ×0.6);
  cooldown 45 s (totem szary); komunikat w HUD (#buff).
- **ELITY**: po 60 s każdy spawn ma 6% szansy: skala ×1.45, HP ×6, XP ×4,
  2 monety gwarantowane, złoty pierścień pod stopami.
- **NOWE KARTY**: 💢 Tupnięcie (max 3) — fala uderzeniowa co 3.2 s ORAZ przy
  lądowaniu ze skoku (synergia!); 🎲 Krytyk (+10%/szt., max 50%) — cios ×3.
- Wizual fali = rozszerzający się pierścień (`G.rings`), knockback 4.5.

## Mapa NIESKOŃCZONA + ewolucje broni v10 (8.08 noc; życzenie usera „endless")
- **CHUNKI TERENU**: świat generowany w locie wokół gracza (CHUNK=40 j.,
  20×20 segmentów, VIEW=4 → siatka 9×9). `ensureChunks()` przy zmianie chunka
  gracza dobudowuje brakujące i usuwa dalekie (geometry.dispose()). Zero granic
  mapy (klamra WORLD_R usunięta z ruchu).
- Normalne liczone ANALITYCZNIE z gradientu szumu (nie computeVertexNormals) —
  brak szwów oświetlenia między chunkami; UV globalne (wx/5) = bezszwowa trawa.
- Dekoracje/głazy deterministyczne per chunk (`chunkRng` z hash2(cx,cz)) —
  wracasz w to samo miejsce, stoi to samo drzewo. Tafla wody i chmury podążają
  za graczem; skrzynie >95 j. i totemy >110 j. przenoszą się w pobliże gracza.
- **EWOLUCJE BRONI (złote karty, priorytet w wyborze, max 1 na awans)**:
  ☄️ KULE METEORYCZNE (4+ pocisków i przebicie 2+) → pociski wybuchają (nova 1.8);
  🌪️ KOŚCIOTRZĘSIENIE (4+ kości) → orbity ×1.5 większe, prędkość 4.8, dmg ×2;
  🌋 TRZĘSIENIE ZIEMI (Tupnięcie 3/3) → fala co 2 s, +2 promienia, dmg ×2.
  CSS `.card.gold` (złota poświata). Warunki w `ok()` — wzór na kolejne ewolucje.

## SYSTEM BRONI v11 (życzenie usera: sloty, wymiana, odblokowania — „porządnie")
- **3 SLOTY broni** (`P.weapons = [{key, lvl, t}]`, start: Kule poz. 1). Rejestr
  `WEAPONS` — każda broń ma `tick(w, dt)`, max poziom, opisy poziomów `lvlDs`,
  opcjonalną ewolucję (evoKey/evoNm/evoDs). Dodanie broni = jeden wpis w rejestrze.
- **6 broni**: 🟡 Kule (poziomy: liczba pocisków+przebicie; evo ☄️ Meteoryczne),
  🦴 Kość orbitalna (lvl = liczba kości; evo 🌪️ Kościotrzęsienie), 💢 Tupnięcie
  (evo 🌋 Trzęsienie ziemi), ⚡ Piorun (gromy w losowych wrogów, cylinder+flash),
  🍾 Butelka żula (lot łukiem `G.lobs` → wybuch nova), 📻 Radio-bumerang (leci
  sinusem tam i z powrotem `G.boomers`, w drodze powrotnej bije ponownie).
- **PASYWY (bufy z kart)**: rejestr `PASSIVES` — Moc/Tempo/Buty/Magnes/Krytyk/
  Serducho/Zasięg + 🛡️ Tarcza (odblokowywana; blokuje 1 cios, cd 30/24/18 s).
  Statystyki pochodne przez funkcje `dmgAll()/fireMul()/critC()/rangeF()/
  magnetF()/speedF()` (meta × pasywy × buff z totemu).
- **KARTY**: `cardPool()` składa pulę dynamicznie: ulepszenia posiadanych broni →
  ewolucje (złote, priorytet) → NOWE BRONIE (gdy wolny slot i odblokowana) →
  pasywy. Pusta pula → karta „Znaleźne" (+20 monet).
- **🔄 WYMIENNIK**: 12% z otwarcia skrzyni → overlay #swapOv: wybierz broń do
  ODDANIA (albo „Zostaw" = +10 monet) → wybierz nową z odblokowanych nieposiadanych.
- **ODBLOKOWANIA w sklepie** (`META.unlocked`, `SHOP_UNLOCKS`): Piorun 150🪙,
  Butelka 200🪙, Bumerang 250🪙, Tarcza 120🪙 — dopiero po kupnie trafiają do puli.
- **HUD #wpns** (lewy dół): ikony broni + poziom, złota poświata po ewolucji,
  kropki = wolne sloty.
- DECYZJA-doradztwo: plansze wielopoziomowe (piętra) ODRADZONE — zamiast tego
  plan: WYBÓR MAPY przed biegiem (biomy-warianty parametrów terenu/wrogów, jak
  w Megabonku) + później klify/płaskowyże w ramach jednej mapy. Czekam na
  potwierdzenie usera.

## DOPAMINA + MESY v12 (9.08 — życzenia usera: efekty, hordy, serca, „wielowymiarowość")
- **LICZBY OBRAŻEŃ**: dmgPop() — billboardy-teksty (canvas, cache per napis w popCache,
  klonowany materiał do fade; cap 70 na ekranie). Skala pokazywana ×25 zaokrąglona
  do 5 (dmg 1 → „25") — czysta dopamina. Kolory per broń: kule żółte/kryt pomarańcz,
  kość błękit, nova łosoś, piorun biel, bumerang fiolet.
- **KILL + COMBO**: kille w oknie 1.3 s nabijają serię → „KILL x6" rośnie;
  „ELITA!" złote, „BOSS DOWN!" wielkie czerwone (G.streak/streakT).
- **HORDY**: cap 220→350, spawn PACZKAMI 1+floor(t/75) (max 4) co interval.
- **DROPY**: mali (dresiarz/wegielek) dropią XP tylko 65%; zul/dzik (bigXp) zawsze
  (xp 3/4); **SERCA ❤️**: elity 30%, boss 2 szt. — zbierane TYLKO gdy brakuje HP
  (inaczej leżą), magnes je ciągnie dopiero przy brakującym HP.
- **MESY-PLATFORMY** (odpowiedź na „wielowymiarowość"): mesaH(x,z) w terrainH —
  strome płaskowyże (wys. 4-7, promień 9-15) na siatce komórek 90 j. (50% szans,
  deterministyczne z hash2). WSPINACZKA: wrogowie pod górę (slope>0.18 w przodzie)
  zwalniają ×0.35 = chwila oddechu na szczycie; gracz pieszo pod strome ×0.5,
  ale SKOKIEM wchodzi normalnie (airY pomija karę). Piętra/platformy wiszące
  ODRADZONE — mesy dają tę samą frajdę bez kosztów (pathfinding/czytelność).
- Silnik: user pytał „czy nie lepszy inny?" — DECYZJA: zostajemy przy Three.js
  (momentum, demo-link, Capacitor/Electron); rewizja tylko przy twardej ścianie
  (fizyka/konsole/perf. nie do obejścia instancingiem).

## FIZYKA + MARKET + BRONIE v13-v15 (9.08 — feedback usera)
- **LICZBY ×250** (było ×25): dmgNum = round(dmg*250/10)*10, min 50. Wstrząs
  kamery rośnie z serią killi (0.06 + streak*0.03, cap 0.5).
- **PRAWDZIWA FIZYKA PIONOWA** (koniec „przyklejenia do ziemi"): P.y + P.vy +
  P.airborne; zejście z krawędzi (ground < y-0.5) = SPADANIE z grawitacją;
  lądowanie na szczycie regału (supportY) albo terenie; kamera i kontakt
  z wrogami liczone z P.y (wysoko nad wrogiem = nie dosięgnie).
- **KOLIZJE** (`solids` per chunk + solveSolids): pnie dębów (okrąg r=0.45,
  top=99 czyli nieprzeskakiwalne), głazy (okrąg, top = 0.75×wysokość → DA SIĘ
  przeskoczyć), regały marketu (AABB hw×hl, top=2.3). Wrogowie też kolidują
  (blokują się na regałach — 12 przy regałach, 0 w środku w teście).
- **MAPA 🛒 MARKET** (MAPS + wybór na ekranie startu, `setMap` przebudowuje świat):
  płaska podłoga w kafle, rzędy regałów co 8 j. z przerwami (28%) = CIASNE ALEJKI,
  proceduralna tekstura regału z „towarem", mgła 34-95, bez wody/chmur.
  **ROZLANA WODA = ŚLISKO**: plamy (r 2.2-4.6) w chunku; na nich grip 18→1.2
  (bezwładność, wypada się w poślizg), wrogowie ×0.55 prędkości.
- **🦘🦘 PODWÓJNY SKOK**: sklep 300🪙 (na stałe) LUB skrzynia 8% (na bieg).
  Zbalansowane: 1 skok = 1.46 j. (regał 2.3 = NIE wejdziesz), 2 skoki = 2.67 j.
  (wejdziesz na regał). To jest brama do „ucieczki na regał" w markecie.
- **4 NOWE BRONIE** (odblokowania): 🧦 Skarpeta biologiczna (aura trująca wokół),
  💨 Wiatrówka (promień przeszywa linię), 🐔 Kura-kamikaze (biegnie do wroga
  i wybucha — Billboard z kura_braz), + wcześniejsze. Razem **9 broni**.
- **SKRZYNIE a bronie** (poprawka usera): przy WOLNYM slocie skrzynia daje
  🎁 NOWĄ BROŃ (openNewWeapon), wymiennik 🔄 dopiero gdy masz pełne 3.
- Pułapka: `import ... from './spritedata.js?v=N'` — po regeneracji spritedata
  PODBIJ v, inaczej stary cache = „Cannot read properties of undefined (img)".
- W index.html jest łapacz błędów do window.__err (debug; usunąć przed wydaniem).

## MENU + POSTACIE + PROGRESJA v16-v18 (9.08 — duża porcja z feedbacku usera)
- **MENU Z ZAKŁADKAMI** (#tabs / .panel): ▶ Graj (podsumowanie wyboru) · 🗺️ Mapy ·
  🧍 Postacie · 🛒 Sklep · 📊 Statystyki. Wybór mapy/postaci zapisywany
  (META.lastMap/lastChar). Kafelki `.tile` wspólne dla map/postaci/sklepu.
- **5 POSTACI** (rejestr `CHARS`, mnożniki spd/hp/dmg/mag, kupowane za monety):
  👧 Kasia (0, baza) · 🧔 Piotr (200: +1❤, +25% dmg, wolniejszy) · 🐕 Rudeusz
  (300: +35% speed, -1❤) · 🧙 Kapturek (400: magnes ×2, +2❤, słabsze ciosy) ·
  🔥 Węgielek (500: +45% dmg, tylko 3❤). `setPlayerChar` podmienia Billboard.
- **STATYSTYKI GLOBALNE** (META.st, zapis po każdym biegu): zabici łącznie, biegi,
  najdłuższy bieg, rekord zabitych, bossowie, skrzynie z bronią, poziomy, monety,
  łączny czas. Ekran końca pokazuje „🏆 NOWY REKORD CZASU".
- **PAUZA** (ESC / przycisk ⏸ na dotyku): podsumowanie biegu (czas, zabici, bronie,
  postać, mapa) + „WRACAM" / „🏠 Do menu (kończy bieg)". Wyjście czyści świat.
- **🎁 ZŁOTA SKRZYNIA Z BRONIĄ** (życzenie usera): NOWE BRONIE ZNIKNĘŁY Z KART —
  dostajesz je tylko z pływającej złotej skrzyni (jedna naraz, respawn 25-45 s po
  zabraniu). **Strzałka #wArrow w HUD** wskazuje kierunek (obrót wzgl. camYaw)
  i dystans w metrach. Wolny slot → wybór nowej broni; pełne 3 → wymiennik.
- **PLATFORMY / STRUKTURY TERENU** („teren wyglądał jak zrobiony przez dzieciaka"):
  per chunk 30% stos skrzyń (schodki 0.9/1.7/1.3), 18% drewniany podest na palach
  (taras 2.1 + stopień wejściowy), 12% kamienne schody 3-stopniowe. Materiały
  proceduralne (stripeTexture: skrzynia/deski/kamień). Wszystko to solidy —
  da się na nie wskoczyć i z nich spaść.
- **WSPINACZKA WROGÓW** (życzenie usera): wrogowie mają własną wysokość `e.ty`
  z fizyką; gdy gracz ucieknie wyżej (P.y > e.ty+0.6) i coś ich blokuje,
  **wspinają się 0.95 j./s** — półka daje chwilę oddechu, ale nie jest bezpieczna.
  Schodzenie/spadanie 9 j./s. `solveSolids` zwraca teraz wysokość blokady.
- **PROGRESJA TRUDNOŚCI** (user: „4. minuta = 4× więcej, musi być trudniej"):
  interval 1.3 s → /(1+min×0.55); paczki `1+min×1.6` (4. min ≈ 7 naraz); cap 500.
  **FALA OKRĄŻAJĄCA** co 30 s od 1. min: pierścień 10+min×5 wrogów ze WSZYSTKICH
  stron (spawnEnemy z zadanym kątem). Bossowie co 2 min, od 5. min po kilku.
  Skalowanie: HP `1+min×0.55+(t/300)²×1.5`, prędkość +3.5%/min (cap ×1.5),
  obrażenia kontaktowe ×2 od 5.5 min, ×3 od 10 min. Elity 6%+1.5%/min.
  HUD pokazuje **⚠️ ZAGROŻENIE N** + toast przy zmianie poziomu.
  Zmierzone: 1 min = 10 wrogów, 4 min = 215 wrogów na mapie.
- **TELEFON PION I POZIOM**: menu przewijalne, `clamp()` w rozmiarach czcionek,
  media `max-height:520px` (poziom = wszystko ciaśniej, kafelki 30vw) i
  `max-width:520px` (pion = pasek broni nad przyciskiem skoku). Zweryfikowane
  na 375×812 i 812×375.

## WYGLĄD „GENSHIN + PIXEL ART" v23-v28 (10.08)
- **TRAWA (dywan jak w Genshin/BotW)** — `bladeGeometry()` 7 wierzchołków, gradient
  w vertex colors (ciemna nasada → jasna limonka), `updateGrassField()` rozsiewa
  do ~35 tys. źdźbeł w siatce ŚWIATA (bez migotania przy ruchu), krok 0.20,
  promień 23 (telefon 15). **Płynne wyrastanie**: shader skaluje wysokość przez
  `smoothstep(uR-7, uR-0.5, dist)` — koniec wyskakiwania trawy znikąd.
  Wiatr: dwie fale sinus (szybka + wolna) zależne od pozycji instancji.
  Ziemia przemalowana na jasną zieleń, żeby prześwity nie odcinały się.
  Materiał: MeshBasicMaterial + vertexColors (Lambert gasił pionowe źdźbła).
- **UI PIXEL ART**: czcionka **Pixelify Sans** (OFL, self-hosted w `fonts/`,
  latin+latin-ext = polskie znaki), `icons.js` = własne pixel-artowe ikony rysowane
  proceduralnie z siatek znaków (PAL/ART) — **ZERO emoji w grze** (życzenie usera).
  Przyciski/kafelki/karty: twarde krawędzie box-shadow, brak zaokrągleń i gradientów.
  Portrety postaci = kadr z arkusza sprite'ów (`portret()`).
  UWAGA: pikselizacja CAŁEGO 3D (render w niskiej rozdz.) była testowana i
  **ODRZUCONA przez usera** — psuła i tak pixel-artowe sprite'y. `PIXEL_SCALE = 1`.
- **FIX STRZAŁKI do złotej skrzyni**: `@keyframes` animowały `transform`, co
  NADPISYWAŁO obrót ustawiany z JS. Animujemy teraz tylko `opacity` na rodzicu,
  obrót siedzi na `.ar`. Kąt = rzut wektora do skrzyni na osie ekranu (fx/fz, rx/rz).
- **CZERWONY BŁYSK** przy obrażeniach: nakładka `hitFlash` z tą samą klatką sprite'a
  w czerwieni (opacity pulsuje z `P.iframes`) zamiast migania widocznością.
- **SEKWENCJA ŚMIERCI**: `startDeath()` → `updateDeath()` — postać przewraca się
  i zapada, kamera zjeżdża blisko, wrogowie rozchodzą się w slow-motion, winieta,
  napis „KONIEC!"; po 1.8 s dopiero ekran końca.
- **SKAKANIE WROGÓW**: mają `vy`/`jumpCd` — podskakują co kilka sekund w pobliżu
  gracza i przeskakują niskie przeszkody; przy wysokich wspinają się (0.95 j./s).
- **MARKET 2.0**: regały z wystającymi półkami i blatem, **palety (0.95 = wskoczysz
  bez podwójnego skoku)**, lady chłodnicze (1.5), większe kałuże (r 4-8.5) i mocniejszy
  poślizg (grip 0.85).
- **POCISKI z postaci** (`P.y + 1`), nie z poziomu ziemi — ważne gdy stoisz na regale.
- Kamera: desktop 8.4/7.2 (wyżej), telefon poziomo **4.2/4.4 (bardzo blisko)**;
  mgła 80-190 (widać dalej).

## FOLIAGE + ATMOSFERA v29-v33 (10.08, po referencji Genshina od usera)
- **DRZEWA = KARTY LIŚCI** (technika leaf cards z douges.dev): korona to 12-20 quadów
  z proceduralną alfa-teksturą kępki listków (`leafCardTexture`, 4 palety w tym jesienna),
  rozsianych po elipsoidzie, **instancjonowanych per chunk** (jedna InstancedMesh na
  paletę → ~2.2 tys. kart przy kilkudziesięciu grupach) i kołysanych `addWind`.
  Świerki zostają stożkami. Pnie = osobne meshe (kolizja r=0.42, top=99).
- **CIENIE CHMUR** (`addCloudShadow`): bezszwowa tekstura plam przesuwana po świecie
  (uniform `uCloudOff`), wpinana do materiałów przez onBeforeCompile — przyciemnia
  fragment wg pozycji XZ. Działa na terenie i trawie; łatwo dopiąć kolejne materiały.
  UWAGA na kolejność: `addCloudShadow` przed shaderem wiatru, wiatr wywołuje starą
  funkcję (`_wind(sh)`), bo inaczej jedna nadpisuje drugą.
- **TRAWA po uwagach usera**: źdźbła **grubsze i krótsze** (w 0.055, wys. 0.30-0.48 —
  pomysł usera, lepiej czyta się w pixel-arcie), promień 34 (telefon 22), krok 0.30,
  strefa wtapiania 18 j., przebudowa co 1.2 j. ruchu (było 3 — stąd „skokowo").
  Podłoże przemalowane na kolor źdźbeł (#9ad557) — granica dywanu przestała być widoczna.
- **SZYBOWANIE (Liść sałaty)**: przytrzymanie skoku podczas opadania = vy clamp -1.5,
  prędkość ×1.45, pixelowy liść nad głową (`lettuce`). Sklep 250 monet albo skrzynia
  (7% szans na bieg). Zmierzone: lot 44 → 99 klatek, 12.8 j. dystansu w powietrzu.
- **Przycisk skoku**: 96×96 + `::after{inset:-22px}` (większe pole trafienia),
  odsunięty 38/52 px od krawędzi + `env(safe-area-inset-*)`.
- Kamera po iteracjach z userem: desktop 6.8/7.0, telefon poziomo 3.6/4.3.

## ⚠️ PUŁAPKA, KTÓRA KOSZTOWAŁA KILKA ITERACJI (v34-v37)
Drzewa i trawa renderowały się **CZARNE**. Przyczyna: materiał ma `vertexColors: true`
(potrzebne do `instanceColor`), a geometria NIE MIAŁA atrybutu `color` — three.js
włącza wtedy define USE_COLOR i mnoży przez nieistniejący atrybut = zero = czerń.
LEKARSTWO: każda geometria używana z takim materiałem musi mieć BIAŁY atrybut `color`
(patrz `clumpGeometry()` i `leafCardGeo`). Jeśli coś nagle jest czarne — sprawdź to NAJPIERW.

## TRAWA v37 = KĘPKI (research: forum three.js + Codrops)
Zamiast ~35 tys. pojedynczych źdźbeł (7 wierzchołków każde) → **~9,7 tys. kępek
na DWÓCH SKRZYŻOWANYCH QUADACH** z alfa-teksturą pęku źdźbeł (`clumpTexture`,
16 wygiętych źdźbeł z gradientem ciemna nasada → jasny czubek).
Wg forum („image of a grass clump on a 2 triangle quad") to najtańszy sposób na
gęsty dywan: 4 trójkąty na kępkę zamiast 5 na pojedyncze źdźbło, a wizualnie
dużo gęściej. Promień 40 (telefon 26), krok 0.62, losowy obrót i przechył (±0.22 rad).

## KORONY DRZEW v37
Karty liści są **billboardowane w vertex shaderze** (przesunięcie w view space —
technika z douges.dev), więc korona jest gęsta z każdej strony; 18-28 klastrów
mocno zachodzących na siebie, rozkład ku środkowi (pow(rng, 0.55)), `instanceColor`
przyciemnia spód korony. Pnie pogrubione (skala 1.9-2.6) i skrócone.

## ASSETY: user zgodził się na DARMOWE PACZKI (CC0: Kenney, Quaternius, itch.io).
Do wykorzystania przy rekwizytach/budynkach. Uwaga: GLTF wymaga dociągnięcia
`GLTFLoader.js` z examples/jsm + importmap — nie ma go w naszym lokalnym three.module.js.

## ZESPÓŁ AGENTÓW (`.claude/agents/`) — utworzony 10.08
`grafik-3d` (shadery/foliage/stylizacja), `projektant-gry` (balans, bronie, dopamina),
`optymalizator` (fps, instancing, telefon), `tester-gry` (scenariusze w przeglądarce,
zna pułapkę `HORDA.step` i stanów `running/paused`). Wołaj ich narzędziem Agent.

## DO ZROBIENIA (kolejność ustalona z userem 10.08: drzewa → woda → kwiatki → trawa)
1. ~~Drzewa (karty liści)~~ ✅ v33.
2. **WODA** — teraz płaska niebieska płyta; plan: falująca siatka (animacja
   wierzchołków w shaderze), dwa odcienie głębi, piana przy brzegu.
3. **KWIATKI w trawie** + warianty źdźbeł (druga geometria losowana per instancja).
4. **Encyklopedia/bestiariusz** — opis wroga odblokowywany po 1. zabiciu.
5. Dalej: gradient nieba, miękkie cienie pod obiektami, toon-shading terenu.

## Monetyzacja (decyzja usera 8.08)
- **Steam**: wersja płatna (bez reklam). Pakowanie: Electron albo natywny webview.
- **Telefony**: darmowa z reklamami — Capacitor + AdMob; model survivors idealnie
  gra z **rewarded ads** (obejrzyj reklamę → wskrzeszenie 1×/bieg, reroll kart,
  podwojenie monet po biegu) + ewentualnie IAP „usuń reklamy". Interstitiale
  najwyżej między biegami, nigdy w trakcie.

## NASTĘPNE (do omówienia z userem)
1. **Postacie brainrot** — wygenerować własne absurdalne postacie w PixelLab
   (8 kierunków, idle+run+death, 120 px, jak dotychczasowe arkusze). Pomysły na
   nazwy w stylu „Kebabiro Zapiekankini" — do burzy mózgów z userem.
2. Więcej broni (fala uderzeniowa, aura, rykoszet), rzadkości kart (zwykła/złota),
   synergie/ewolucje broni jak w VS/Megabonku.
3. Skrzynki z dropem po bossach, przedmioty pasywne, wybór postaci.
4. Teren z wysokością (falujące wzgórza — displacement na siatce), przeszkody 3D.
5. Meta-progresja między biegami (waluta, sklep, odblokowania) — filar „na poważnie".
6. Dźwięk (webaudio, sfx + muzyka), pauza, ustawienia.
7. Wydajność przy 300+ wrogach: InstancedMesh + atlas zamiast materiału/klatkę
   (na razie 220 mesh'y trzyma 60 fps w podglądzie).
8. Test dotyku na telefonie; potem Capacitor (mobile) / Electron lub Steam webview.
9. ~~Git init~~ ✅ 8.08: kod https://github.com/PixelPetrol/horda3d (PRYWATNE, main);
   **GRYWALNE DEMO (GitHub Pages): https://pixelpetrol.github.io/horda3d-demo/**
   = publiczne repo horda3d-demo (remote `play`). Wydanie nowej wersji na stronę:
   `git push play main` (Pages przebudowuje się ~1 min). Commit+push po każdej porcji!

## Pliki
- `index.html` — HUD, overlaye (start/karty/koniec), joystick, CSS.
- `main.js` — cały silnik+gra (ładowanie arkuszy, billboard, spawner, walka, karty).
- `spritedata.js` — definicje animacji (wyciąg z Rudeusza).
- `assets/` — placeholdery z Rudeusza (kasia, dresiarz, enemy=żul, wegielek, dzik,
  doctorAngry, bone, drzewa/krzaki/kamienie/kwiatki/trawa).
- `lib/three.module.js` — Three.js r160.
- Cache-bust: `main.js?v=N` w index.html — podbijać przy każdej zmianie!
