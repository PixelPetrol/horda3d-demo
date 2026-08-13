# VEGGIE FAMIGLIA — Brainrot Survivors (dawniej „HORDA 3D")

> ⚠️ Nazwa robocza „HORDA 3D" została zamieniona na **VEGGIE FAMIGLIA** (10.08).
> Katalog, repo i `window.HORDA` zostały po staremu — to tylko nazwy techniczne.
> Sekcje niżej opisujące Kasię, Rudeusza, dresiarza i żula to **historia**:
> ta obsada została usunięta z gry 10.08 (commity 7788b45 i bdace77).
> Aktualny stan obsady i dźwięku: patrz sekcje „VEGGIE FAMIGLIA" na końcu pliku.

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

## ⇒ START TUTAJ (stan na 13.08.2026, po 9 commitach)

> Ten plik ma 800+ linii historii. **Jeśli wracasz do projektu — czytaj TYLKO ten blok
> i sekcję „CO DALEJ" niżej.** Reszta to zapis decyzji i pułapek, przydatny jako
> słownik, nie jako lektura od początku.

### Jak uruchomić i sprawdzić
1. Podgląd: `preview_start` z `name: "horda3d"` (wpis w `.claude/launch.json`)
   albo `python3 -m http.server 8123 -d "<ten folder>"`.
2. **MUSI być port 8123.** Flaga `DEV` w `main.js` sprawdza `hostname` **I PORT** —
   bez portu 8123 nie ma `window.HORDA`, `window.__err` ani pola na kody. Awaryjnie `?dev=1`.
3. **Cache-bust przy KAŻDEJ zmianie:** `main.js?v=N` w `index.html`. Zmieniasz
   `spritedata.js` albo `icons.js` → podbij też ich `?v=`, a `icons.js` **w main.js
   I w audio.js do tej samej liczby** (inaczej powstają dwie instancje modułu ikon).
4. Przeglądarka i tak potrafi podać stary `main.js`. Pewny sposób: wejdź na
   `http://localhost:8123/index.html?cb=<N>` zamiast przeładowywać.

### Pułapki testowania (kosztowały mnie po kilka podejść)
- `HORDA.step(n)` to jedyny pewny sposób krokowania — rAF jest dławiony bez fokusa okna.
- **`step()` NIC NIE ROBI, gdy `G.paused === true`.** Zabijanie wrogów daje awanse,
  awans otwiera karty, karty pauzują grę → wszystkie pomiary wychodzą zerowe.
  Po każdej porcji `step()` sprawdzaj `G.paused`/`G.running`, karty zamykaj klikając,
  a przy pomiarach DPS ustaw `P.xp = 0` w pętli, żeby zablokować awanse.
- Bieg mógł się skończyć (`G.running === false`) — wtedy przycisk to `JESZCZE RAZ`, nie `GRAJ`.
- Zmiana rozmiaru okna resetuje się przy przeładowaniu — najpierw wczytaj, potem `resize_window`.
- `pointer:coarse` nie działa w tej przeglądarce, więc `#jbtn` jest ukryty i reguły
  telefonowe nie wchodzą. Geometrię telefonu trzeba wymuszać inline i tak ją mierzyć.

### Agenci (`.claude/agents/`)
`tester-gry` (scenariusze w przeglądarce), `projektant-gry` (balans), `grafik-3d`
(shadery/wygląd), `optymalizator` (fps). **`tester-gry` padał dwa razy** (API 529
i zawieszenie po 600 s) — licz się z powtórkami. `optymalizator` NIE BYŁ jeszcze
uruchomiony ani raz.

### Czego NIE dotykać bez powodu
- `window.HORDA` — na nim wiszą scenariusze testera.
- Klucze w `META` (`unlocked.bumerang` itd.) — to zakupy graczy w starych zapisach.
  Broń można przemianować, klucza nie.
- Nazwa tablicy `totems` (to dziś Garnki Nonny) i `radioMat` (to dziś pizza) —
  zostały po staremu świadomie, bo wiszą na nich inne rzeczy.

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

## ⚠️ DRUGA PUŁAPKA: INSTANCING A POZYCJA W ŚWIECIE (v44)
Cienie chmur przyciemniały CAŁĄ trawę naraz albo wcale. Powód: w shaderze liczyłem
`vWPos = modelMatrix * transformed`, a three.js mnoży przez `instanceMatrix` dopiero
w `project_vertex` — więc wszystkie instancje miały tę samą pozycję.
LEKARSTWO: w takim kodzie ZAWSZE ręcznie: `#ifdef USE_INSTANCING _wp = instanceMatrix * _wp; #endif`.

## CIENIE (v41-v44)
- **Shadow map słońca**: `renderer.shadowMap` PCFSoft, `sun.castShadow`, ramka ortho 42 j.
  PODĄŻA ZA GRACZEM (`updateSun` co klatkę). Cień rzucają pnie, stożki świerków, głazy;
  teren `receiveShadow`. Karty liści są billboardami (własny `project_vertex`), więc
  shadow map ich nie ogarnia → każde drzewo dostaje plamę cienia pod koroną (`blobGeo`).
- **Cienie chmur**: tekstura z fBm (`pnoise` — OKRESOWY szum, kafelkuje się bezszwowo;
  4 oktawy, próg + kontrast = ostre nieregularne kształty). Dryf `CLOUD_SPD = 9.0`.
  Wpięte w: teren, trawę, liście, sprite'y postaci (`addCloudShadow` w `buildChar`).

## FONT BITMAPOWY DO LICZB (v44)
Pixelify mylił 5 z S, a zwykły bezszeryf nie był pixelowy. Rozwiązanie: własny font
5×7 (`GLIF` w main.js, cyfry + A-Z + polskie znaki), rysowany pikselami z 8-kierunkowym
konturem, NearestFilter. Napisy skalują się wg proporcji tekstury (`userData.aspect`).

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

## KONTROLER / GAMEPAD API (10.08) — zweryfikowany w przeglądarce sztucznym padem
Cel: handheldy typu **Retroid Pocket 6** (Android/przeglądarka) oraz pady Xbox/PS.
Kod: sekcja „KONTROLER (Gamepad API)" w `main.js` (`PAD`, `pollPads`, `gpMove`).
- **Odpytywanie co klatkę** — `pollPads(dt)` na początku `loop()` ORAZ w `HORDA.step()`
  (stan pada nie przychodzi zdarzeniami, trzeba go czytać z `navigator.getGamepads()`).
- **Lewy drążek** = ruch, analogowo. Martwa strefa `PAD_DZ = 0.18`, po jej odjęciu
  skala rośnie liniowo do 1 (`padStick`). Wynik ląduje w `PAD.mx/PAD.mz`, a `update()`
  bierze je zamiast klawiatury (dotyk ma pierwszeństwo przed padem).
- **Prawy drążek** = obrót kamery: `camYaw -= rx * 2.6 * dt` (ta sama martwa strefa).
- **A (0)** = skok — woła istniejące `tryJump()` i ustawia `jumpHeld`, więc
  PRZYTRZYMANIE = szybowanie na liściu sałaty. Zbocze narastające (`hit()`), więc
  trzymanie nie wyzwala skoku wielokrotnie; puszczenie zeruje `jumpHeld`.
- **Start (9)** = pauza / wznowienie, **B (1)** = wstecz (`gpBack`: pauza → WRACAM,
  ekran końca → menu, menu → zakładka Graj; karty i wymiennik trzeba wybrać).
- **Nawigacja po menu**: D-pad (12-15) albo lewy drążek przesuwa zaznaczenie po
  WIDOCZNYCH `.tab,.tile,.card,.bigbtn,.btn2` w najwyższym overlayu (`topOverlay`),
  wybór sąsiada geometrycznie (`gpMove` — najbliższy środek z karą 2.2× za zbaczanie
  w bok), powtarzanie co 0.22 s. A = `click()`. Zaznaczenie = klasa **`.gp-sel`**
  (złota pixelowa ramka w `index.html`, styl jak `.tile.sel`). W overlayu ruch
  gracza jest wyzerowany, po wejściu do gry zaznaczenie znika.
- `gamepadconnected`/`gamepaddisconnected` → komunikat przez `toastBuff` (znika po 2.5 s).
- Zmierzone: martwa strefa 0.15 → 0.0000 j. ruchu; pełne wychylenie → 5.43 j./s;
  0.5 → `PAD.mx` 0.390 i 2.49 j./s (analogowo); prawy drążek 1 s → camYaw -2.6 rad;
  A → skok 1.46 j. / 42 klatki, z przytrzymaniem 62 klatki i `vy` obcięte na -1.5.
- **DO SPRAWDZENIA NA SPRZĘCIE**: zakładamy `mapping: 'standard'`. Część padów
  na Androidzie zgłasza układ niestandardowy (prawy drążek na osiach 2/5, D-pad
  jako oś 9) — jeśli Retroid tak zrobi, trzeba dopisać fallback po `gp.mapping`.

## ASSETY: user zgodził się na DARMOWE PACZKI (CC0: Kenney, Quaternius, itch.io).
Do wykorzystania przy rekwizytach/budynkach. Uwaga: GLTF wymaga dociągnięcia
`GLTFLoader.js` z examples/jsm + importmap — nie ma go w naszym lokalnym three.module.js.

## BESTIARIUSZ / ENCYKLOPEDIA (10.08) — zweryfikowany w przeglądarce
- Nowa zakładka **Bestiariusz** w menu (`#tabs` → panel `#p-bestia`, siatka `#bestGrid`,
  licznik odkryć `#bestProg`). Renderer: `renderBestiary()` — wołany przy starcie,
  przy kliknięciu zakładki, po wyjściu z biegu i po ekranie końca.
- Wpisy generowane z `ENEMY_TYPES` — nazwa (`nm`) i żartobliwy opis (`ds`) siedzą
  **w samym rejestrze wroga**, więc nowy typ wroga = automatycznie nowy wpis.
  Obecnie: Dresiarz Adidasini, Żul Monopolowy, Węgielek Brunatnini, Dzik Osiedlowy,
  Doktor Wściekliniusz.
- **Licznik zabitych per typ**: `META.bestiary[typ]` (localStorage `horda3d_meta_v1`).
  `loadMeta()` domyśla pusty obiekt, więc **stare zapisy bez tego pola działają**
  (zweryfikowane: stary JSON → 0/5, nic się nie sypie).
- Zapis: pierwsze zabicie typu = `saveMeta()` od razu; kolejne przez **`saveMetaSoon()`**
  (debounce 2 s) — bez tego localStorage byłby zapisywany kilkaset razy na minutę.
- Zablokowany wpis: `.tile.bst.dark` → portret przez `filter:brightness(0)` (widać samą
  sylwetkę), nazwa/opis/statystyki jako „???".
- Pierwsze zabicie = `toastBuff('NOWY WPIS W ENCYKLOPEDII: <nazwa>')` (w `killEnemy`).
- Kafelki w stylu `.tile`, portrety z `portret()`, ikony z `icons.js` — zero emoji.
- Zmierzone: świeży zapis → bieg → śmierć → menu = licznik i odblokowanie zgadzają się
  po przeładowaniu strony; konsola czysta (`window.__err` puste).

## ZESPÓŁ AGENTÓW (`.claude/agents/`) — utworzony 10.08
`grafik-3d` (shadery/foliage/stylizacja), `projektant-gry` (balans, bronie, dopamina),
`optymalizator` (fps, instancing, telefon), `tester-gry` (scenariusze w przeglądarce,
zna pułapkę `HORDA.step` i stanów `running/paused`). Wołaj ich narzędziem Agent.

## WODA STYLIZOWANA (10.08, po researchu — „woda tragedia" wg właściciela)
Research: Roystan „Toon Water" (piana z RÓŻNICY GŁĘBI + próg na przewijanym szumie),
Harry Alisavakis „Stylized water shader" (3 pasy koloru wg głębi + linie piany z `sin()`
biegnące do brzegu), Codrops/R3F „Stylized Water" (bufor głębi sceny = za drogi →
piana malowana z pozycji w świecie), forum three.js „Unlit water shader with foam".
- **MAPA GŁĘBI ZAMIAST DEPTH-TEXTURY.** Nie renderujemy sceny do depth bufora — mamy
  `terrainH(x,z)` w JS, więc `updateWaterColors()` (nazwa została, treść nowa) wypieka
  `WATER_Y - terrainH` do `DataTexture` 144² (RedFormat, LinearFilter) obejmującej
  340 j. wokół gracza (2.36 j./texel, głębia kodowana -4..+4). Shader czyta ją
  **PER PIKSEL** — stara wersja liczyła kolor per wierzchołek siatki 6.2 j., stąd
  brak brzegu. Przebudowa ~2 ms, dopiero po 18 j. ruchu (mapa ma 170 j. zapasu).
- **ODLEGŁOŚĆ OD BRZEGU W METRACH**: `brzeg = głębia / spadek_dna`, gdzie spadek liczony
  z 4 dodatkowych próbek mapy głębi (±1 texel). Bez tego piana ma szerokość „w metrach
  głębi": na stromym brzegu nitka, na płaskim zalewa pół jeziora.
- **PIANA**: stały mokry rąbek ~0.5 m + poszarpana kipiel do ~2 m z falującym progiem
  (szum) i pasmami `sin()` biegnącymi do brzegu; dziury z drobnego szumu, żeby nie była
  płytą. Piana + iskierki idą też w `totalEmissiveRadiance` — nie szarzeją w cieniu.
- **3 PASY GŁĘBI** (nie gradient): jeziora mają max ~1.7 j. głębi (66% powierzchni <0.5!),
  więc progi to 0.40-0.58 i 0.94-1.14 — turkus → błękit → granat, krawędzie falowane
  szumem i `sin()`. **Zmierz zakres głębi, zanim ustawisz progi.**
- **FALE**: siatka 420×420 / 140 segmentów (3 j./segment, było 6.2 — fale się nie mieściły),
  3 nakładające się sinusy o długości 24-30 j., **wygaszane przy brzegu**
  (`smoothstep(0.05,1.10,głębia)`), żeby tafla nie przebijała plaży. Do tego łagodne
  jaśnienie grzbietów / ciemnienie dolin (`col *= 1 + vFala*0.75`).
- **ISKIERKI**: iloczyn dwóch przewijających się w przeciwne strony próbek bezszwowego
  szumu (`waterNoiseTexture`, ten sam `pnoise` co chmury), próg 1.00-1.09 = rzadkie błyski.
- Przezroczystość rośnie z głębią (0.74 → 0.96), piana kryje. `addCloudShadow(waterMat)`
  — woda była jedyną płaszczyzną bez plam chmur.
- Zmierzone: śr. 4.8 ms/klatkę przy marszu, max 10-15 ms (razem z chunkami i trawą),
  konsola czysta, market (bez wody) bez zmian.

## DO ZROBIENIA (kolejność ustalona z userem 10.08: drzewa → woda → kwiatki → trawa)
1. ~~Drzewa (karty liści)~~ ✅ v33.
2. ~~**WODA**~~ ✅ 10.08 (pasy głębi, piana z mapy głębi, fale, iskierki — sekcja wyżej).
3. ~~**KWIATKI w trawie** + warianty źdźbeł~~ ✅ 12.08 (sekcja „KWIATKI I WYSOKIE TRAWY").
4. ~~Encyklopedia/bestiariusz~~ ✅ 10.08 (zakładka Bestiariusz, wpis po 1. zabiciu).
5. Dalej: gradient nieba, miękkie cienie pod obiektami, toon-shading terenu.

## ═══════════ STAN NA 12.08.2026 (22 commity w jeden dzień) ═══════════
> Wszystko wypchnięte na `origin` i `play`. Demo: https://pixelpetrol.github.io/horda3d-demo/

### OBSADA: 4 GRYWALNE POSTACIE, każda z INNĄ startową bronią (`CHARS[...].startWpn`)
| postać | odblokowanie | staty | startowa broń |
|---|---|---|---|
| Carrotello Squattello | od startu | spd 1.15, mag 1.3 | 🟡 Kule energii |
| Beetino Bouncerino | **450 zabójstw** (nie monety!) | spd 0.85, +3 serca | 💢 WYPAD! (stożek 60°, ogromny odrzut) |
| Radishetta Razoretta | 500 monet | spd 1.2, −1 serce, dmg 1.25 | 🔪 SCYZORYKI (seria 3-7 rzutów w linii) |
| Granny Smithella | 700 monet | spd 0.9, +1 serce, mag 1.1 | 🥿 LA CIABATTA (kapeć wraca, bije 2×) |

Progi ustalone z właścicielem: **pierwsza dodatkowa postać na 3. biegu, druga na 6.**
Zmierzona ścieżka: bieg 1 ≈ 60 zabójstw, bieg 2 ≈ 150, bieg 3 ≈ 250.
`killGoal` sprawdzany w `killEnemy` (nie w `gameOver`!) → toast W TRAKCIE biegu,
kamienie milowe co `killGoal/3`.

### NOWE BRONIE I ICH MECHANIKI
- **Czosnek na lince** (dawna kość orbitalna): linka = 5 segmentów VERLETEM,
  czosnek to masa na końcu → zostaje z tyłu przy zmianie kierunku. Trafienie
  szarpie czubkiem i **dławi napęd** (zmierzone: 0.045 → 0.022 rad/klatkę).
  Sama linka odpycha wrogów i przy tym się wygina. Ewolucja CZOSNKOWY MŁYN.
- **Pipsini Nipotini** (320🪙): TOWARZYSZ, nie pocisk. Goni wroga w promieniu
  7.5 j., wraca do nogi gracza, co ~1.2 s sadzi KIEŁEK tłukący w promieniu 1.4 j.
  Spirala co 12 s jako umiejętność specjalna. Ewolucja JABŁOŃ (kiełki ×2).
  Zmierzone: dobiega do wroga 6 j. w sekundę, 36 obrażeń w 6 s.
- **Sokowirówka** (280🪙): stawiana WIEŻYCZKA-PRZYNĘTA. Wyższa od wrogów (2.1 j.),
  ma HP i **pasek życia**, wrogowie ją tłuką, po rozwaleniu wybucha.
  ZWABIA w promieniu 9.5 j., ale **gracz jest ważniejszy**: wieżyczka przejmuje
  wroga tylko gdy `dystans_do_niej × 1.7 < dystans_do_gracza`.
- **Kernello Boomello** (dawna kura): ziarno kukurydzy z WŁASNĄ animacją eksplozji
  (jedyny byt z prawdziwym `death`). Ewolucja **BOMBA KASETOWA**: wybuch rozsypuje
  6 mini-ziaren z krótszym lontem.

### EKONOMIA I PROGRESJA (spec projektanta, oparta na pomiarach)
- Moneta ma WARTOŚĆ (`makeCoin(x,z,val)`): szeregowy 1, elita 4, boss 10.
  Drop szeregowego 9% → **16%**; elita 2 monety → 1 warta 4; boss 12 → 3 warte 10.
  Powód: zmierzony rozkład dochodu pokazał, że zabijanie hordy dawało tylko **14%**
  monet (elity 34%, skrzynie 20%) — najmniej płaciła czynność gracza.
- **MNOŻNIK ZA SERIĘ**: seria 12+ = monety ×2, 30+ = ×3.
- **RANGA W BIEGU**: +5% obrażeń za rangę, co 4. ranga +4% tempa, próg `20+14r`,
  cap **150**. Zamyka lukę wobec `hpScale` (rośnie kwadratowo). Zmierzone:
  1604 zabójstwa (dobry bieg 5 min) = ranga 14 = +70% obrażeń.
- Ceny w sklepie **+10% za KAŻDY dotychczasowy zakup** (u VS 91% pełnego kosztu
  maksowania to sam narzut skalowania). Bazy podniesione: serce 80, siła 60,
  kondycja 60, magnes 50.
- **KLĄTWA NONNY** (120🪙, max 5): +10% HP wrogów i gęstszy spawn za +20% monet.
  Wentyl na „wykupiłem wszystko".
- **FIX WYCIEKU**: `META.st.kills` rósł tylko w `gameOver()`, a `btnQuit` kończył
  bieg bez tego → wyjście do menu KASOWAŁO zabójstwa i monety całego biegu.
  Rozliczenie wydzielone do `rozliczBieg()` i wołane z obu ścieżek.

### DOPAMINA
- **Pierwszych 6 skrzyń jest wyreżyserowanych** (mała, mała, MAGNES, mała, mała,
  PODWÓJNY SKOK) — chwyt z Vampire Survivors (sekwencja 1-1-3-1-1-5). Licznik
  `META.st.skrzynki`.
- **Pierwsza przegrana = Piorun na stałe** (Brotato daje za to postać).
- **Ceremonia końca biegu**: liczby lecą tickerem 900 ms z dźwiękiem co 55 ms,
  pieczątka rekordu, deszcz 28 monet. PUŁAPKA: ticker chodzi na rAF (dławiony bez
  fokusa) → jest twarde domknięcie przez `setTimeout`, inaczej ekran zostawał z ZERAMI.
- **Śmierć wroga**: biały błysk 0.09 s, pixelowy dissolve w shaderze, puff, okruchy,
  PLAMA NA ZIEMI (pula 48 kwadratów krążących w kółko), wybuch skalowany do wroga
  (pierścień tylko dla grubych — przy 500 wrogach na każdą śmierć to kasza),
  hitstop 0.05/0.12 s dla elity/bossa.
- 22 syntezowane SFX w `audio.js` (WebAudio, ZERO plików: paczka audio ma już 14 MB).
  Throttle per dźwięk + limit 20 głosów. Muzyka domyślnie **15%**.

### WYDAJNOŚĆ (po audycie)
- **REGAŁY NA INSTANCJACH**: 852 regały × 6 bryłek = 5100 mesh'y i 610 draw calli.
  Teraz bryłki scalone (`scalBryly`) i wystawione jako 3 InstancedMesh na chunk
  (`ustawRegal` zapisuje obrót w macierzy). **Render marketu 11.7 → 2.3 ms**,
  mesh'e 6285 → 1539.
- `popCache` (liczby obrażeń) rósł BEZ GRANIC: zmierzone 2470 tekstur i ZERO
  usunięć po 4:43 gry = ~140 MB VRAM w 4 minuty. Teraz LRU na 200 wpisów.
- Próg przebudowy trawy 1.2 → **6 j.** (kosztuje 9.6 ms, a przy 7.1 j./s wypadał
  SZEŚĆ RAZY NA SEKUNDĘ).
- Cień słońca **wyłączony w markecie** (żaden obiekt tam nie ma `castShadow`).
- Porzucone dropy znikają po 45/60 s (leżało ich 299 na ziemi po 4:43).

### BŁĘDY ZNALEZIONE I ZAMKNIĘTE — WARTO PAMIĘTAĆ
1. **`Billboard` powstaje z `material = null`** i dostaje materiał w `update()`.
   Każdy byt tworzony w środku pętli iterowanej OD KOŃCA (mini-ziarna dopisywane
   na koniec `G.kury`) nie dostawał update'u w swojej pierwszej klatce → render
   leciał `Cannot read properties of null (reading 'visible')` w `projectObject`.
   Konstruktor ustawia teraz pierwszą klatkę od razu.
2. **`rangeF()` zwraca wartość ABSOLUTNĄ** (`14 * 1.2^poziom`), nie mnożnik.
   Pomnożenie przez nią dało wieżyczce zasięg 182 j., a lince czosnku 29 j.
   Zawsze dzielić przez bazę 14.
3. **`footOff` MUSI być liczony z alfy** (`dolnaKrawedz`), bo packer wpisuje tam
   zero na sztywno — przepakowany Beetino zaczął lewitować.
4. **Przesunięcie `footY` trzeba skrócić o `cos(pochylenia)`** — było liczone dla
   pionowego billboardu, więc po pochyleniu stopy schodziły pod posadzkę
   (na Łąkach zasłaniała to trawa, w markecie ucinało nogi).
5. **`drawHearts` z `repeat(maxHp - hp)`** wywalał klatkę przy HP ponad maksimum.
6. Boss NIE skalował się wcale: w 20. minucie 90 HP przy szeregowym 108.

### CO ZOSTAŁO (kolejność ustalona z właścicielem)
1. **SEKCJE MARKETU** (w robocie): mrożonki = cała podłoga śliska, alkohole =
   tłuczone szkło rani, piekarnia = mąka obcina widoczność, kasy = bramki + ALARM
   z elitarną Ochroną. Plus WÓZKI SKLEPOWE do pchania i rozjeżdżania hordy.
2. **Wygląd** (punkt 5 starej listy): gradient nieba, miękkie cienie pod obiektami,
   toon-shading terenu. Agent padł na błędzie 529, do powtórzenia.
3. **Oprawa bossa**: pasek HP z imieniem, wejście z przyciemnieniem.
4. **Wydarzenie „Dostawa Nonny"**: paleta do obrony przez 45 s, wrogowie zmieniają
   cel na nią — dopiero to nadaje wieżyczkom i przewróconym regałom sens jako lejowi.
5. **Instancing WROGÓW** (atlas klatek zamiast mesha per wróg) — ostatni duży
   pożeracz przy 500 wrogach.
6. **Braki w grafice** (`POSTACIE-DO-ZROBIENIA.md`): Don Chipso bez własnego
   arkusza, eksplozja Kernella tylko z jednego kierunku, Snackoni bez animacji
   `death` (właściciel: „nie będzie na ten moment" — proceduralna śmierć zostaje).
7. Z audytu, niezrobione: kolejka overlayów (skrzynia + awans w jednej klatce =
   gra chodzi pod niewidzialną blokadą wejścia), kilka awansów w jednej klatce
   gubi karty, 6 broni bez ewolucji, przycisk pauzy nachodzi na HUD w pionie,
   `touch-action` na przewijanych panelach, martwy kod (karty liści, stara trawa,
   `kura_braz`, `bone.png`) ~200 linii do usunięcia.

## ═══════════ VEGGIE FAMIGLIA: OBSADA I REBRAND (10.08) ═══════════
- **Bohaterowie (2)**: 👦 Carrotello Squattello (starter, szybki, magnes ×1.3) ·
  Beetino Bouncerino (250🪙, czołg: +3 serca, wolniejszy, własny motyw muzyczny).
- **Wrogowie = LA FAMIGLIA SNACKONI (6)** ze statystykami i zachowaniami z biblii
  postaci v1.1: Chipsetti Soldatetti (roje) · Marshmallini Fluffini (`dzieli: true`
  — po śmierci DWA mniejsze) · Gummini Bouncini (`skacze`, `bezKb` — nie da się
  odepchnąć) · Friesetti Spearetti (szarże) · Sodino Explodino (`kamikaze`, lont
  1 s) · Lollini Spinnini (`wiruje`, tank). Boss: **Don Chipso** co 2 min.
- **Arkusze**: `assets/veggie/*.png` + `narzedzia/pakuj_veggie.py` (eksport
  PixelLab: `animations/<Anim>/<kierunek>/*.png` → arkusz + wpis SPRITEDATA).
  Nazwa zipa = klucz w SPRITEDATA. `ANIM_MAP` decyduje, co zostanie wzięte.
- **BRAKI W GRAFICE** (pełna lista i briefy: `POSTACIE-DO-ZROBIENIA.md`):
  Don Chipso nie ma własnego arkusza (silnik bierze powiększonego Chipsettiego,
  `scale: 2.7`), Snackoni nie mają animacji `death`, Beetino nie ma `idle`.
- Ekran ładowania: pixel-artowy pasek postępu + porady (`ladowanie(opis)`).

## ═══════════ DŹWIĘK (`audio.js`) — muzyka, głosy, SFX ═══════════
- **MUZYKA**: 5 utworów (menu/koniec, boss, dwa „biegowe" losowane, motyw Beetina).
  `<audio>` powstaje **leniwie** — dopiero gdy utwór jest naprawdę potrzebny
  (waży 3-5 MB). Przejścia przez własny fade na tickerze co 50 ms.
- **GŁOSY POSTACI** (ElevenLabs, `assets/audio/glosy/<postać>/`): zdarzenia
  `start / seria / awans / boss / smierc`, globalny cooldown 8 s (ważne 2 s),
  seria od 8 killi i nie częściej niż co 25 s. Postać bez wpisu w `GLOSY` milczy.
- **SFX = SYNTEZA WEBAUDIO, ZERO PLIKÓW** (12.08). Powód: paczka audio waży już
  ~14 MB, a efektów leci kilkaset na minutę — próbki byłyby cięższe i sztywne.
  22 dźwięki z oscylatorów + jednego bufora szumu (`ton()`, `szum()`, `akord()`).
  Ton `kill` **rośnie razem z serią zabójstw** — to ta sama dopamina co liczby ×250.
  Ochrona przed kakofonią przy 300 wrogach: **throttle per dźwięk** (`gap`)
  + **limit 20 jednoczesnych głosów**, przy czym dźwięki z `wazny: 1` (hurt,
  tarcza, awans, boss, koniec) limit przekraczają. Zmierzone: w walce przy
  40 wrogach 4-13 głosów naraz, po biegu 0 (nic nie wisi).
- Podpięte: traf/kryt, kill, bossdown, wybuch (każda nova), piorun, strzal, xp,
  moneta, serce, awans, skrzynia, zlota, totem, skok, ladowanie (tylko przy
  vy < -4), hurt, tarcza, koniec, zagrozenie, boss, klik. **Klik w UI to jeden
  delegat na `document`** (`.tab,.tile,.card,.bigbtn,.btn2,#jumpBtn`) — menu jest
  generowane w kilku miejscach, dopisywanie dźwięku per przycisk by się rozjechało.
- Zakładka Dźwięk: trzy suwaki (Muzyka / Głosy postaci / Efekty) + wycisz.
  Stare zapisy bez pola `efe` dostają 0.7 (merge przez `Object.assign(domyslne(), …)`).
- **AudioContext startuje dopiero po pierwszym geście** (razem z odblokowaniem
  muzyki) i jest resume'owany w `sfx()`, bo przeglądarki go usypiają.
- Debug: `HORDA.AUDIO._stanSfx()` (stan kontekstu, liczba głosów, ostatnie czasy),
  `HORDA.AUDIO._stan()` (muzyka).

## ═══════════ KWIATKI I WYSOKIE TRAWY (12.08) ═══════════
- Dwa nowe pola instancji **na tej samej geometrii kępki** (2 skrzyżowane quady),
  więc dostają gratis wiatr, wtapianie na skraju dywanu i cienie chmur
  (`makeBladeMaterial(mapa)` przyjmuje teraz teksturę).
- **KWIATKI**: płatki w teksturze są BIAŁE, barwę daje `instanceColor` — jedna
  tekstura robi białe, żółte, różowe i liliowe łany. Kolor losowany **per PLAMA
  szumu** (`vnoise(x/33)`), nie per kwiatek → powstają pola jednego koloru jak
  w Genshinie. Występowanie też z plamy (`vnoise(x/15) > 0.52`) — przy równym
  rozsypaniu wyglądały jak posypka. Pierwsza wersja (4 małe kwiaty na kępkę)
  była na ekranie **niewidoczna** — trzeba było 3 kwiatów z dużą główką
  i kępki wyższej od dywanu trawy.
- **WYSOKIE TRAWY**: suche łodygi z kłosem, tylko na płowych łąkach (`biome > 0.34`).
- Wszystko rozsiewane w **JEDNYM przebiegu siatki** — komórka dostaje kwiatek
  ALBO kłos ALBO zwykłą kępkę. Trzy osobne przebiegi po ~28 tys. komórek to
  trzykrotny koszt tego samego. `vnoise` odpala się **po** tanich testach
  (`r4 > 0.72 && b < 0.66`): 9.03 → 8.64 ms na przebudowę dywanu.
- Zmierzone: 15-19 tys. trawy, 1.5-3.1 tys. kwiatów (zależnie od łanu), 160-780 kłosów.

## ═══════════ STAN NA 13.08.2026: KARABIN FPP, GARNEK NONNY, CZCIONKA ═══════════

### ═══ PEŁNY AUDYT W PRZEGLĄDARCE (13.08, ~50 tys. krokowanych klatek) ═══
`window.__err` pusty przez całą sesję, ~15 startów biegu, 4 zmiany postaci/mapy.

**⚠️ FLAGA DEV BYŁA WŁĄCZONA W WYDANIACH — naprawione tego samego dnia.**
Pierwsza wersja sprawdzała `hostname === 'localhost' || hostname === ''`, a to włącza
DEV **dokładnie tam, gdzie miała go wyłączyć**: Capacitor na Androidzie serwuje z
`http://localhost` (bez portu), a Electron/webview Steama z `file://` (`hostname === ''`).
Czyli `window.HORDA` z edytowalnym `META.coins` i pole na kod jechałyby na telefony
i na Steama. **Teraz rozstrzyga PORT 8123** (+ awaryjne `?dev=1`). Zweryfikowane:
podgląd ✅ ON · Capacitor ❌ · Electron/file:// ❌ · GitHub Pages ❌ · `?dev=1` ✅.

**Naprawione po audycie:** ekran śmierci nakładał się na karty awansu (obrażenia od
spadającego regału i od Sodina wołają `startDeath()` bez `return`, więc ta sama klatka
otwierała karty pod ekranem końca) → `pchnijOverlay` odrzuca teraz zgłoszenia przy
`G.dying/G.over`. Toast karabinu miał 382 px przy ekranie 375 px → skrócony.
`fireMul()` obejmuje teraz **14 z 14 broni** — czosnek (`e.orbCd`) i Pipsini
(`PIPS_SADZ`, `e.orbCd`) go nie tykały, bo ich tempo nie siedzi w `w.t`.

**ZOSTAŁO Z AUDYTU (nienaprawione):**
1. **Carrotello praktycznie nie zabija.** Pomiar identyczny dla 4 postaci (20 Chipsettich
   w pierścieniu 2,2 j., 10 s, poziom 1): **carrotello 1 zabity**, beetino 18,
   razoretta 20, granny 20. Kule mają `dmg` zaszyte jako `1` × 0.9 postaci = 0.9 przy
   3.01 HP wroga → 4 trafienia na zabicie co 0,87 s. To postać na pierwsze trzy biegi.
2. **Wyciek GPU między biegami.** Jeden bieg 5 min: tekstury **349 → 551**, geometrie
   **15 → 60**, monotonicznie. Po wyjściu do menu z pustą scenę: **552 / 60** i następny
   bieg startuje od 552. `clearWorld()` woła `dispose()` tylko na `pops`/`puffs`/`bb`.
3. **Drzewo ulepszeń wysycha ok. 4. minuty.** W 5:00 poziom **55** i WSZYSTKIE osiem
   pasywów zmaksowanych → karty degenerują się do jednej. Test: 33 awanse w jednej
   klatce dały 33 ekrany, z czego **29 pod rząd to „Znaleźne +20 monet"**.
4. **Przycisk pauzy nadal nachodzi na HUD w pionie**: 7×15 px na `#lvl`, 14×13 px na
   `#ranga` — HUD czyta się jako „POZIOM ▮▮" i „RAN".
5. **W 5. minucie horda jest poza kadrem**: 359 żywych, **9 w polu widzenia kamery**,
   mediana odległości 36 j. Presja kontaktowa jest (10 najbliższych 5-9 j.), ale
   „ściany wrogów" nie widać.
6. `touch-action` — reguła nadal na `html,body`, `.ov` bez nadpisania. **Nie da się tego
   udowodnić w tej przeglądarce** (brak dotyku) — do sprawdzenia na telefonie.
7. Kosmetyka: panel Dźwięk o 11 px szerszy od ekranu przy 375; opisy postaci
   zapisane bez polskich znaków (`piornikiem`, `scyzorykow`, `skora` — `main.js:50`);
   liczby obrażeń zajmują 15-25% wysokości ekranu; `landSpot` po wyczerpaniu 60 prób
   stawia byty w jednym punkcie (złapane 4 skrzynie na `(229,267)`).

**POTWIERDZONE JAKO DZIAŁAJĄCE** (pomiary, nie lektura kodu): kolejka overlayów
(33 awanse w jednej klatce → 33 ekrany, zero zgubionych, zero „pauza off przy widocznym
overlayu" na 19 830 klatek) · `rozliczBieg` na wyjściu z pauzy (+5991 monet co do sztuki)
· karabin FPP w całości (ziarna zbiegają się w celowniku, 3 życia odrzucają na dokładnie
14,0 j. i **HP zostaje 4/4**, oba wyjścia z trybu wracają kamerę) · wszystkie 6 buffów
garnka (mrożonki: ruch hordy 0,38 → **0** j.) · `broniDostepna` (320 ofert ze skrzyń,
bronie postaci u obcych **0 razy**) · `rebuildWorld` w markecie (852/852 `stoi`, restart
31,8 ms) · wspinaczka wrogów po przewróconym regale (8/8 na górze po 4 s) · poślizg
(2,67 → 1,76 j./s, 1,24 j. wybiegu) · Tempo w realnej walce (**59 → 107 zabójstw
w 10 s = +81%**) · symulacja **1,217 ms/klatkę** średnio przy 359 wrogach · ceremonia
końca nigdy nie zostawiła zer · Jersey 10 bez przelewania się tekstu w 7 zakładkach.

### AUDYT CZTERECH AGENTÓW (12.08) — najważniejsze, jeszcze NIENAPRAWIONE
Zlecony przez właściciela. Trzy raporty gotowe, `tester-gry` padł na błędzie 529
(**do powtórzenia — pełny przebieg w przeglądarce nie został wykonany**).
Wszystkie 6 błędów z listy „ZAMKNIĘTE" nadal jest naprawionych — zero regresji.

**KRYTYCZNE, do zrobienia:**
1. `clearWorld()` nie resetuje `ch.shelves` → regał, który padał w momencie wyjścia
   z biegu, zostaje NA ZAWSZE zamrożony w połowie upadku, z kolizją stojącego.
   `newGame()` nie woła `rebuildWorld()`, a bieg startuje w (0,0,0) → **każdy kolejny
   bieg w markecie zaczyna się w połamanej hali z niewidzialnymi ścianami.**
2. `saveMetaSoon()` (debounce 2 s) **nie ma flushu** na `pagehide`/`visibilitychange`
   → zamknięcie karty kasuje ostatnie 2 s progresu. Na Capacitorze to norma, nie edge case.
3. Kolejka overlayów: skrzynia + awans w jednej klatce → kliknięcie karty zdejmuje
   pauzę, a `#swapOv` zostaje → świat się symuluje, a gracz nie może się ruszyć.
4. Awans jest `if`, nie `while`, a pętla dropów leci dalej → dwa awansy w jednej
   klatce i `showCards()` robi `innerHTML=''`, **kasując poprzednie 3 karty**.
5. `ch.rocks` (3 InstancedMesh regałów na chunk) dostaje `remove()` bez `dispose()`
   → wyciek buforów GL rosnący liniowo z przebytą drogą po markecie.
6. `buildChar` robi osobny canvas+teksturę+materiał NA KAŻDĄ KLATKĘ: policzone
   **1170 klatek = 58,7 MB VRAM + ~69 MB canvasów**. Atlas z `offset/repeat` = ~6 MB.
7. `META.st.best` aktualizowany PRZED porównaniem → „NOWY REKORD" po KAŻDYM biegu.
8. Kod `rudeuszek2123` (`main.js`) jest w publicznym demo jawnym tekstem i odblokowuje
   wszystko + 5000 monet. `touch-action:none` na `body` blokuje przewijanie paneli menu.

**BALANS (raport projektanta, liczby przeliczone w node):**
- ~~**`fireMul()` jest użyte w JEDNYM miejscu w całym pliku** (Kule)~~ ✅ **NAPRAWIONE 13.08.**
  Każdy z 11 zapisanych na sztywno cooldownów jest teraz dzielony przez `fireMul()`,
  plus bezpiecznik fali z lądowania (`1.2 / fireMul()`, inaczej hamował to, co Tempo
  przyspiesza). **Zmierzone w przeglądarce: wszystkie 13 broni +76% tempa przy Tempie 5**
  (`1.12^5 = 1.762`) — wcześniej dokładnie 0% dla dwunastu z nich.
  ⚠️ **DODAJĄC NOWĄ BROŃ: `w.t = (bazowy_czas) / fireMul()`, nigdy samo `w.t = baza`.**
  ⚠️ To realnie przyspieszyło całą grę — krzywa trudności może teraz wymagać rewizji.
- Nadal MARTWE: `critC()` działa tylko na pociski (Krytyk nie tyka czosnku, nova, pioruna,
  skarpety), a `rangeF()` używają 4 bronie z 14 (Sokoli wzrok martwy dla dziesięciu).
- Carrotello ma **najgorszy start w grze**, a gra się nim pierwsze 3 biegi: TTK jednego
  Chipsettiego 2,9 s (Razoretta 0,61 s), bo `dmg` Kul jest zaszyte jako `1` i NIE ROŚNIE
  z poziomem, a postać ma jedyną w grze karę do obrażeń (0.9).
- Ekonomia wykupiona w 2-3 biegach (meta 29 472 monet, bieg 10 min ≈ 18 800).
  Elity dają **72% dochodu**, a mnożnik serii jest de facto stałą ×3.
- Rozstrzał DPS broni **28×** (Piorun 5,8 — Wypad 162), przy czym Piorun jest nagrodą
  za pierwszą przegraną, czyli pierwszy prezent w grze jest najsłabszą bronią w grze.
- Friesetti **wcale nie szarżuje**, Lollini „wiruje" tylko wizualnie (`scale.x`).
- Elitarne mini-Marshmallini mają HP malucha, a płacą jak elita = najszybsza kasa w grze.
- Gracz jest 1,78-5,6× szybszy od najszybszego wroga, a fala okrążająca ma w 4. minucie
  dziury szerokie na 9 wrogów.

**GRAFIKA (raport grafika):** cienie chmur mnożone PO mgle (ciemne łaty na horyzoncie),
trawa nie przyjmuje cieni (cień drzewa wygląda jak plama pod dywanem), `shadow.bias`
−0.0014 = 23 cm peter-panningu, brak snapowania ramki cienia = pełzanie krawędzi,
`addCloudShadow(waterMat)` **nie istnieje** wbrew tej dokumentacji, progi pasów głębi
wody dają granat na 4% jeziora. Plamy `blobGeo` pod koronami też nie istnieją i nie są
potrzebne (korony to `leafBlobGeo` z `castShadow`) — **ta dokumentacja była nieaktualna**.

### CZCIONKA UI: PIXELIFY SANS → JERSEY 10 (zgłoszenie właściciela)
Pixelify miał **nieczytelne glify: S≈5, Z≈2, B≈8** — „PAUZA" czytało się jako „PAU2A",
„BESTIARIUSZ" jako „8ESTIARIUS8", „1500 monet" jako „1900 monet". Zweryfikowane na
stronie porównawczej z pięcioma fontami. To ten sam problem, dla którego liczby w 3D
dostały własny font bitmapowy `GLIF` (tam zostaje — potrzebuje konturu).
- Wybrany **Jersey 10** (OFL, self-hosted w `fonts/`, latin + latin-ext = polskie znaki).
  Nazwa rodziny została `Pixel`, więc żadna z ~40 reguł CSS się nie zmieniła.
- **PUŁAPKA:** Jersey ma tylko wagę 400, a UI woła `font-weight` 700/800. W `@font-face`
  jest dlatego `font-weight: 100 900` na tym samym pliku + `font-synthesis: none` na
  `body` — bez tego przeglądarka SAMA pogrubia font i rozmazuje piksele.
- Pixelify usunięty z repo. Licencje i uzasadnienie: `fonts/README.txt`.

### TRYB KARABINU (pierwsza osoba) — decyzje właściciela
- Wypada ze skrzyni **raz na bieg** (18% na skrzynię poza wyreżyserowaną szóstką)
  i ląduje „w kieszeni": gracz odpala go sam **klawiszem R / przyciskiem obok skoku /
  X na padzie**. Przycisk `#karabinBtn` pokazuje się DOPIERO po znalezieniu i jest
  jednocześnie podpowiedzią klawisza dla gracza na PC (życzenie właściciela).
- Baza **20 s**, sklep `Magazynek Nonny` (300🪙, max 3) dokłada +5 s za poziom.
- **3 ŻYCIA TRYBU** ≠ serca: cios zabiera życie i ODRZUCA hordę na 14 j. (pozycja
  ustawiana wprost, bo Gummini mają `bezKb`), ale **nie tyka HP**. Po trzecim → powrót
  do widoku za plecami. Jedna bramka `ciosPochloniety()` na wszystkie 3 źródła obrażeń.
- Kamera: `kf` (0 = za plecami, 1 = z oczu) animuje się 0.5 s, więc przejście jest
  płynne bez osobnego kodu. Przy `kf > 0` pozycja jest DOKŁADNIE celem — dodatkowy lerp
  zostawiał kamerę w połowie drogi na cały tryb.
- **ZIARNA KUKURYDZY jako pociski, ZERO auto-aim** (życzenie właściciela: „celowanie
  musi mieć sens"). Startują Z WYLOTU LUFY — punkt liczony z `#gunFlash` przez
  `unproject` (`przeliczWylot`, cache'owane, bo `getBoundingClientRect` 13×/s wymuszałby
  przeliczanie stylów) — i lecą w punkt celownika 55 j. przed graczem, więc tor zbiega
  się ze środkiem ekranu jak w normalnym FPS-ie. 46 j./s = widać je w locie.
- Sprite `assets/karabin_fpp.png` od właściciela (słoik kukurydzy jako magazynek);
  proceduralna `gunTexture()` zostaje jako awaryjna zaślepka.
- Widok broni to **nakładka 2D**, nie model 3D — przy pixel-artowych billboardach
  wygląda spójnie i nie wchodzi w kolizję z shadow mapą ani mgłą. Odrzut i kołysanie
  w marszu ustawiane na `#gunWrap`, żeby błysk wylotowy jechał razem z lufą.
- `#fpsHud` jest POD celownikiem, bo nad nim siedzi strzałka do złotej skrzyni.

### GARNEK NONNY zamiast totemów + nowe buffy
Kamienna kolumna fantasy nie miała nic wspólnego z warzywami walczącymi z mafią przekąsek.
Mechanika ta sama, zmienił się kostium: **bulgoczący garnek** na Łąkach, **witryna
chłodnicza** w markecie (`ustawWygladGarnkow` w `setMap`, oba proceduralne przez `pixTex`).
Tablica nazywa się nadal `totems` — wisi na niej `window.HORDA` i scenariusze testera.
- Nowe buffy: **NIETYKALNOŚĆ 6 s** (nie 10 — 10 s to prawie pół fali okrążającej; złota
  poświata idzie przez istniejący `hitFlash`, zero nowych obiektów), **MROŻONKI** (horda
  staje 3.5 s), **PODWÓJNE MONETY 20 s**. Losowanie **z wagami** — te zdejmujące napięcie
  są rzadsze. Etykiety przez `ico()`, koniec z emoji w HUD.

### FOLIOWA TORBA zamiast liścia sałaty (spadochron)
Płaski billboard wyglądał źle z prostego powodu: spadochron czyta się dopiero jako
WYGIĘTA CZASZA. Teraz to górna czapa sfery (`thetaLength 0.46π`) z falującym rantem
w vertex shaderze (im dalej od czubka, tym mocniejszy trzepot). Motyw zmieniony na
nadmuchującą się torbę z marketu — śmieszniej i spójnie ze sklepem.

### GRADIENT NIEBA
Kopuła (r=1 × skala 300) jeżdżąca za kamerą, `renderOrder −1000`, `depthTest:false`.
Gradient **KWANTOWANY na pasy** (`floor(h*16)/16`) — gładki wyglądał jak z Unity, nie
jak tło pixel-artowej gry; market ma `pasy: 0`. **Kolor dolny MUSI równać się
`scene.fog.color`**, inaczej dalekie wzgórza wtapiają się w inny kolor niż niebo = szew.
Przy okazji: wiatr i chmury płyną teraz TEŻ w menu i na pauzie (`update()` wtedy nie
chodzi, więc świat za overlayem stał jak zdjęcie).

### ⚠️ TRAWA UGINA SIĘ POD HORDĄ — i dlaczego PIERWSZA WERSJA BYŁA ZŁA
Właściciel odrzucił wersję v89 („źle wygląda"). Research (Ghost of Tsushima GDC 2022
„displacement buffer", systemy foliage w UE/Unity): **nikt nie liczy kierunku z gradientu
skalara**. Standard to **POLE WEKTOROWE** wokół gracza w teksturze RGBA:
- **RG = kierunek położenia** (128 = zero, jak w normal mapie), zapisywany PROSTO
  z ruchu interaktora → trawa kładzie się TAM, GDZIE KTOŚ PRZEBIEGŁ. **B = siła.**
- Co było źle w v89: kierunek z gradientu skalara dawał **KRATER** (trawa promieniście
  wokół gracza jak po eksplozji), plama miała 4 j. przy postaci szerokiej na 0.6,
  przeskakiwała o cały texel (0.75 j.), falloff miał 3 stopnie → **widoczne kwadraty
  texeli**, a amplituda wywalała czubek dwa razy dalej, niż kępka jest wysoka
  („rozsypana słoma" zamiast położonej trawy).
- Teraz: `TR_RES 160` na `TR_SPAN 56` (0.35 j./texel), **środek podteksturowy** (plama
  płynie za postacią, nie przeskakuje), spadek `smoothstep`, zanik **wykładniczy**
  (tau 0.45 s), przesuwanie pola całymi rzędami przez `copyWithin`, pusty texel
  wykrywany JEDNYM porównaniem `uint32`.
- W shaderze kępka kładzie się **KĄTEM** (bok = `sin`, wysokość = `cos`), nie samym
  przesunięciem w poziomie — czubek zostaje na łuku wokół nasady. Do tego **korekta
  proporcji instancji** (`sy/sxz`), bo kępka jest szersza niż wyższa, oraz okno
  wygaszające pole na krawędzi tekstury (bez niego `ClampToEdge` rozsmarowałby brzegowy
  texel na całą dalszą trawę). Przygnieciona trawa nie kołysze się na wiatrze.
- Kwiatki i kłosy mają `gietkosc` 1.15 / 1.3 — kładą się chętniej niż zwykła kępka.

### BRONIE POSTACI TYLKO DLA NICH (decyzja właściciela)
`kule`/`wypad`/`scyzoryk`/`ciabatta` mają pole `postac:` i **nie wypadają ze złotej
skrzyni innym postaciom** (`broniDostepna()`, jedno miejsce dla obu pul). Wcześniej
świeży Carrotello mógł w 40. sekundzie wyciągnąć Scyzoryki — najlepszą broń jednocelową
w grze — i wybór postaci przestawał cokolwiek znaczyć.

## ═══════════ 13.08 CZĘŚĆ DRUGA: SOKOWIRÓWKA, KETCHUPINO, BOSS, MYSZ ═══════════

### SOKOWIRÓWKA STAWIANA NA ŻĄDANIE (decyzja właściciela)
Wieżyczka WABI wrogów w promieniu 9.5 j. (`SOKO_WABI`), a stawiała się automatycznie
POD STOPAMI gracza — czyli ściągała hordę dokładnie tam, gdzie stał, i cała jej wartość
(zablokuj alejkę, przytrzymaj przewężenie, odciągnij bossa) była nieosiągalna.
- Broń nabija **ŁADUNKI** (`w.lad`, max `SOKO_LAD(lvl)` = min(2, `SOKO_ILE(lvl)`) —
  zapas jest ograniczony limitem stojących, inaczej gracz patrzy na ładunek, którego
  nie ma gdzie wydać). Stawia gracz: **klawisz F**, przycisk `#stawBtn`, **Y** na padzie.
- **CELOWANIEM JEST RUCH** — wieżyczka ląduje pod stopami, bez podglądu miejsca.
  Odradzałem to (proponowałem podgląd 4 j. przed postacią), właściciel wybrał prościej
  i miał rację: dobiegasz tam, gdzie chcesz ją mieć, i wciskasz. Działa identycznie
  na dotyku, padzie i klawiaturze, zero dodatkowego UI.
- **ŚWIADOMIE BEZ AUTOMATU AWARYJNEGO** (decyzja właściciela): nie wcisnąłeś, nie masz.
  Zgłaszałem ryzyko „gracz nigdy nie wciśnie i broń będzie dla niego martwa" —
  zmniejszone bez zmiany zasad: przycisk pulsuje przy gotowym ładunku, a przy pierwszym
  ładunku w biegu leci toast z podpowiedzią klawisza (`P.sokoPierwszy`).

### STOS PRZYCISKÓW AKCJI — i dwie kolizje pól dotyku
Prawy dolny róg, od kciuka w górę: **skok 52 → stawianie 166 → karabin 272**.
Znalezione i naprawione:
1. `#stawBtn` i `#karabinBtn` miały ten sam `bottom: 166px` — nakładałyby się co do piksela.
2. Niewidzialne otoczki `::after` (powiększone pola trafienia) nachodziły na siebie:
   karabin ze stawianiem o 26 px, a otoczka skoku (`-22px`) sięgała w górę w obszar
   stawiania o 12 px. Teraz przyciski akcji mają `-8px`, a **skok ma otoczkę
   NIESYMETRYCZNĄ** (`-4px` od góry, `-22px` na boki i w dół) — hojną tam, gdzie zbacza kciuk.
Zmierzone pola trafienia: pion 375×812 → `446..548 / 552..654 / 660..782`;
poziom 812×375 (geometria telefonu) → `77..163 / 167..253 / 259..367`. Zero nachodzenia.

### KETCHUPINO SPLATTERINO — PIERWSZY WRÓG DYSTANSOWY
Dotąd KAŻDY wróg po prostu wbiegał w gracza, więc jedyną odpowiedzią na wszystko był ruch.
Projekt wprost z biblii postaci (sekcja „Elity"):
- Trzyma okienko **9-15 j.** (`KETCH_BLISKO`/`KETCH_DALEKO`): bliżej cofa się, dalej
  podchodzi, w środku stoi i pluje co `KETCH_CD` = 3 s.
- Glob leci **łukiem 1.05 s** (`KETCH_LOT`) — to jest telegraf, gracz ma czas zejść.
  Celuje **z wyprzedzeniem** w miejsce, gdzie gracz BĘDZIE, inaczej wystarczyłoby iść prosto.
- **TELEGRAF TO OBWÓDKA, NIE PLAMA** (uwaga właściciela): wypełniona plama przed
  uderzeniem wyglądała, jakby ketchup już wylądował. Obwódka **zaciska się** do miejsca
  uderzenia; wypełniona plama powstaje dopiero przy plaśnięciu.
- Kałuża spowalnia gracza o **40% na 4 s** (`wKetchupie()` obok wody i rozlanej wody).
- **scale 1.7** (Chipsetti ma 0.85), sprite 2.84 j. — WYSTAJE NAD TŁUM. Ta sama zasada
  co przy Sokowirówce: byt, który zmienia sposób gry, musi być widoczny w kupie wrogów.
- Animacja **wyciskania się** (`punch`) odtwarza się przy każdym plunięciu i wraca do biegu.
- **ODSTĘPSTWO OD BIBLII:** HP 220 (skala biblii) = 63 w silniku, **zbite do 26** —
  pierwszy wróg dystansowy przy 63 HP byłby mini-bossem (boss ma 90), a gracz nie ma
  jeszcze żadnej odpowiedzi na atak z 15 j. Łatwo podnieść, jeśli okaże się za miękki.
- Spawn od 3. minuty, `Math.random() < 0.035` na tick spawnera, pojedynczo (elita).

### DON CHIPSO MA WŁASNY ARKUSZ + OPRAWA BOSSA
Boss był **dosłownie tym samym plikiem** co szeregowy Chipsetti, rozciągniętym ×2.7 —
obok biegało 200 kopii „bossa". Teraz własny arkusz (worek chipsów w fedorze i płaszczu),
skala 2.7 → **2.1**, bo rysunek sam niesie powagę.
- **WEJŚCIE:** przyciemnienie (`#bossOv`) + imię na cały ekran (`#bossNm`) na 1.5 s,
  wstrząs i **hitstop 0.18 s** (świat na moment przystaje).
- **PASEK HP** (`#bossHp`) u góry: pokazuje NAJMOCNIEJ RANNEGO bossa (przy kilku naraz
  to on jest celem gracza), licznik `x2`, liczby. Twarde krawędzie jak resztaUI.
- **GWARANTOWANA NAGRODA:** złota skrzynia z bronią niemal natychmiast po zabiciu
  (`wchest.wait = min(wait, 0.4)`). Dotąd boss płacił 90 monet i 2 serca, czyli MNIEJ
  niż zwykła skrzynia — zabicie najtwardszego przeciwnika było słabszą nagrodą niż
  podejście do pudełka.
- **FIX: wrogowie nie mieli pola `maxHp`** — pasek liczył „100 / NaN". Ustawiane
  teraz przy spawnie; potrzebne do każdego paska i procentów.

### MYSZ JAK W FPS (życzenie właściciela)
Obracanie kamery wymagało PRZYTRZYMANIA i przeciągania, co przy jednoczesnym biegu na
WSAD jest niewykonalne. Teraz **klik w obraz przechwytuje kursor** (Pointer Lock,
`chwycMysz`/`puscMysz`, czułość `MYSZ_CZULOSC` 0.0032 rad/px) i sam ruch myszy obraca
kamerę; w trybie karabinu także celuje w pionie. Kursor wraca na pauzie, w menu i przy
kartach awansu. Przeciąganie zostaje jako awaryjne, gdy przeglądarka odmówi blokady.
Zmierzone: bez przechwycenia 0 rad, z przechwyceniem −0.64 rad na 200 px, na pauzie 0.

### TEMPO WRESZCIE DZIAŁA — `fireMul()` w 14 z 14 broni
`fireMul()` było użyte w **jednym miejscu w całym pliku** (Kule). Pozostałe 13 broni
miało cooldown zapisany na sztywno, więc pasyw **Tempo (do +76%)** i bonus „+4% tempa
co 4. ranga" były dla nich **dosłownie zerowe** — karta Tempo była pułapką.
Zmierzone po naprawie (szczyt `w.t`, Tempo 0 → 5, `fireMul` 1.762): wszystkie **+76%**.
Czosnek (`e.orbCd`) i Pipsini (`PIPS_SADZ`, `e.orbCd`) trzymają tempo POZA `w.t` —
one wymagały osobnej poprawki. **Dodając nową broń: `w.t = (baza) / fireMul()`.**

### CARROTELLO WRESZCIE ZABIJA
`dmg` kuli było zaszyte jako `1`, a poziomy dawały TYLKO liczbę pocisków — przy 3.01 HP
Chipsettiego i karze postaci 0.9 to były CZTERY trafienia co 0.87 s na najsłabszego
wroga w grze. To postać, którą gra się przez pierwsze trzy biegi.
Teraz `dmg` rośnie `[3.2, 3.9, 4.6, 5.4, 6.2]`, pociski `[1,2,3,3,4]`, Carrotello ma
`dmg 1.0` zamiast 0.9. **Poziom 1 zabija Chipsettiego jedną kulą** (chwyt z Vampire
Survivors; okno zamyka się samo, bo w 2. minucie wróg ma ~6.6 HP).
Zmierzone (20 wrogów w pierścieniu 2.2 j., 10 s, poziom 1): **1 → 12 zabitych**;
dla porównania Granny 11, Razoretta 12.

### DROBNE, ALE ZGŁOSZONE PRZEZ WŁAŚCICIELA
- **Scyzoryk obraca się w locie.** Nie obracał się ani nawet nie zwracał w kierunku
  lotu — sunął jak naklejka. Kierunek wirowania zgodny z tym, w którą stronę EKRANU
  leci nóż, inaczej co drugi rzut kręciłby się w tył. Sprite noża od właściciela.
- **„Radio-bumerang" → PIZZA VOLANTE.** Relikt po starej obsadzie (żul z boomboxem)
  razem ze sprite'em `radio.png` z Rudeusza. Biblia przewidywała „koło pizzy z góry" —
  rysowane proceduralnie (`pizzaTexture`) do czasu dostawy grafiki. **Klucz `bumerang`
  zostaje**, bo wiszą na nim zakupy w zapisach. Dorysowana ikona `pizza` w `icons.js`.
- **SERCA SĄ RZADSZE.** Było: boss zawsze 2, elita 30%. Przy udziale elit rosnącym
  o 1.5%/min (14% w 5. minucie, 21% w 10.) leczenie sypało się tak gęsto, że utrata
  serca przestawała cokolwiek znaczyć — a to ona jest jedyną realną karą w tej grze.
  Teraz boss 1 (drugie tylko gdy gracz ma <1/3 życia), elita 8%.
  Zmierzone: 200 elit → 13 serc (było ~60), 20 bossów → 20 serc (było 40).
- **„?op!" przy skoku** — napis to `HOP!`, a font bitmapowy `GLIF` **nie miał litery H**
  (ani J, Q, V). Każda rysowała się jako `?`. Dorysowane wszystkie cztery; walidacja
  przechodzi po całym foncie (26 liter, każdy glif dokładnie 7 rzędów × 5 znaków).
  **Dodając nowy napis do `dmgPop` — sprawdź, czy font ma wszystkie litery.**
- **Kolizje ikon:** osiem pozycji dzieliło trzy ikony, więc na ekranie wyboru można było
  dostać TRZY IDENTYCZNE karty. Krytyk → `gwiazda`, Moc → `plomien`, Tempo → `zegar`.
  Naprawiony też błąd szerokości ikony `gwiazda` (rząd miał 9 znaków przy siatce 8).
  **Zostały dwie kolizje:** `fala` (Tupnięcie + Wypad!) i `celownik` (Scyzoryki + Sokoli
  wzrok) — do rozwiązania trzeba dorysować 1-2 ikony.

### ⚠️ PUŁAPKI PACKERA (`narzedzia/pakuj_veggie.py`) — ODKRYTE NA ŻYWO
1. **PixelLab nazywa katalog animacji z promptu**, więc może się nazywać
   `squeezes_its_own_body_hard_with_tiny_arms_compress`. Bez wzorca w `ANIM_WZORCE`
   packer **PO CICHU JĄ POMIJA** — tak zginęła animacja ataku Ketchupina.
   Dopisane: `squeez`, `squirt`, `spit`, `shoot`, `throw` → `punch`.
2. **PixelLab potrafi wyeksportować jedną animację w innej rozdzielczości** niż reszta
   (Don Chipso: 64 px run/jump + 92 px idle; Ketchupino: 64 px idle/run + 92 px punch).
   Wcześniej packer brał rozmiar DOMINUJĄCY i klatki innego rozmiaru albo wypadały,
   albo rozlazły się po sąsiednich komórkach siatki. Teraz arkusz ma rozmiar
   **NAJWIĘKSZY**, a mniejsze klatki są dopełniane — **bez przeskalowania**.
3. **`footOff` jest liczone z alfy RAZ NA CAŁY ARKUSZ.** PixelLab daje różnym animacjom
   różną ilość pustego miejsca pod postacią (Ketchupino: bieg 1 pusty rząd, atak **15**),
   więc przy wyrównaniu krawędzi klatek **butla podnosiła się o 14 px w trakcie strzału**.
   Packer **ODCINA** teraz puste rzędy pod treścią (te same dla całego wiersza, więc ruch
   W OBRĘBIE animacji zostaje nietknięty) i wyrównuje treść do dołu komórki.
   Zmierzone: rozjazd 13 px → 1 px; w grze linia bazowa sprite'a identyczna (1.168 j.).

### ⚠️ KOREKTA RAPORTU TESTERA: „wyciek GPU" SIĘ NIE POTWIERDZA
Tester zgłosił „K2 wyciek zasobów GL, 10 biegów = ~2000 tekstur". **Sprawdziłem sam
i to nieprawda.** W jednym biegu liczby są PŁASKIE między 1., 2. i 3. minutą
(tekstury 70, geometrie 26, programy 18). Przez pięć biegów pod rząd z prawdziwą walką:
`70 → 94 → 106 → 130 → 132 → 138`, czyli przyrosty **+24, +12, +24, +2, +6 — HAMUJĄ**.
To sygnatura zapełniającego się cache'a z limitem (`popCache`, LRU 200 wpisów, po jednej
teksturze na unikalny napis obrażeń), nie wycieku. Tester ekstrapolował liniowo
z jednego biegu, a wzrost jest asymptotyczny.
**Realny problem, który przy tym wyszedł i został naprawiony:** `spark()`, `novaRing()`
i `boltFx()` klonują materiał na każde użycie (setki razy na minutę) i nigdy go nie
zwalniały — w przeciwieństwie do `pops`/`puffs`, gdzie dispose był od początku.

## ═══════════ CO DALEJ — KOLEJNOŚĆ I GDZIE SZUKAĆ ═══════════

### 1. DRZEWO ULEPSZEŃ WYSYCHA W 4. MINUCIE (największy wpływ na dłuższy bieg)
Zmierzone przez testera: w 5:00 poziom **55** i WSZYSTKIE osiem pasywów zmaksowanych →
karty degenerują się do jednej. Test 33 awansów w jednej klatce: **29 pod rząd** to
karta „Znaleźne +20 monet", czyli 29 obowiązkowych kliknięć.
- **Gdzie:** `P.xpNeed = Math.round(5 + P.lvl * 3.2)` w pętli zbierania pigułek
  (szukaj `xpNeed`), `cardPool()`, `PASSIVES` (pola `max`).
- **Jak:** projektant policzył warianty krzywej. Wariant A: `5 + 3.2L + 0.30L²`
  → poziom 29 w 5:00 i 47 w 10:00 zamiast 55/93, awans co ~12-20 s zamiast co 5.
  Pierwsze 8 poziomów prawie bez zmian, więc początek nie cierpi.
- Do tego karty POWTARZALNE bez limitu (np. „Sól Nonny +3% obrażeń") na późną grę,
  a przy pustej puli **nie pokazywać overlaya** — tylko toast i auto-nagroda.

### 2. 58 MB VRAM NA SPRITE'ACH (i właśnie dodałem dwa arkusze 92 px)
`buildChar` robi osobny canvas + `CanvasTexture` + `Material` **na każdą klatkę każdego
kierunku**. Policzone: 1170 klatek = **58.7 MB VRAM + ~69 MB canvasów w RAM**.
- **Gdzie:** `buildChar` (szukaj `async function buildChar`).
- **Jak, tanio:** jedna tekstura na cały arkusz + `map.offset`/`map.repeat` per klatka
  → ~6 MB zamiast 58.7. Dopiero potem ewentualnie instancing wrogów.

### 3. PRZYCISK PAUZY NACHODZI NA HUD W PIONIE
Zmierzone: `#pauseBtn` `[48,18,34,34]` vs `#lvl` `[10,18,45,15]` → **7×15 px**,
`#ranga` → **14×13 px**. HUD czyta się jako „POZIOM ▮▮" i „RAN".
- **Gdzie:** `#pauseBtn` w `index.html` (`transform:translateX(-140px)`).

### 4. EKONOMIA WYKUPIONA W 2-3 BIEGACH
Meta to 29 472 monet, a bieg 10-minutowy daje ~18 800. Elity dają **72% dochodu**
(jedna elita = 12 monet = 25 zwykłych zabójstw), a mnożnik serii jest de facto stałą ×3,
bo od 2. minuty seria nigdy nie spada poniżej 12.
- **Jak:** projektant policzył wariant A — drop szeregowego 16% → 35%, elita 4 → 2,
  boss 10 → 8, mnożnik serii **tylko na szeregowych**; ceny odblokowań ×2.
  Wychodzi ~32 000 monet ≈ 18 biegów po 5 min.

### 5. DWIE MARTWE KARTY (ta sama rodzina co naprawione `fireMul`)
`critC()` działa **tylko na pociski** (Krytyk nie tyka czosnku, nova, pioruna, skarpety),
`rangeF()` używają **4 bronie z 14** (Sokoli wzrok martwy dla dziesięciu).
- **Jak:** przenieść krytyk do wspólnego helpera `zadajDmg(e, dmg)`; `rangeF()/14`
  jako mnożnik promienia szukania celu w każdej broni.

### 6. DWA SNACKONI NIE MAJĄ SWOICH ZACHOWAŃ
**Friesetti wcale nie szarżuje** (w kodzie to tylko `speed: 4.0` — zero windupu, zero
tellu), **Lollini „wiruje" tylko wizualnie** (ściskanie `scale.x`). Biblia opisuje
szarżę z telegrafem 0.6 s i tarczę pilarską. `e.stun` już istnieje, więc szarża to ~10 linii.

### 7. RESZTA Z AUDYTÓW (drobniejsze, ale zmierzone)
- Elitarne **mini-Marshmallini** mają HP malucha, a płacą jak elita (12 monet + XP ×4)
  → najszybsza kasa w grze. `killEnemy` nadpisuje `hp`, ale nie zdejmuje flagi `elite`.
- **6 broni bez ewolucji** (Piorun, Butelka, Pizza, Skarpeta, Wiatrówka, Sokowirówka) —
  projektant rozpisał wszystkie sześć z warunkami `ok()`.
- W 5. minucie **359 wrogów, z czego 9 w kadrze** — „ściany wrogów" nie widać.
- `touch-action:none` na `html,body` blokuje przewijanie paneli menu palcem.
  **Nie da się tego udowodnić w tej przeglądarce** (brak dotyku) — do sprawdzenia na telefonie.
- Panel **Dźwięk o 11 px szerszy** od ekranu przy 375.
- Opisy postaci zapisane **bez polskich znaków** (`piornikiem`, `scyzorykow`, `skora`).
- **Liczby obrażeń zajmują 15-25% wysokości ekranu** przy 375 px.
- `landSpot` po wyczerpaniu 60 prób stawia byty w jednym punkcie (złapane 4 skrzynie
  na `(229,267)`).
- Cienie chmur mnożone PO mgle (ciemne łaty na horyzoncie), trawa nie przyjmuje cieni,
  `shadow.bias` = 23 cm peter-panningu, brak snapowania ramki cienia → pełzanie krawędzi.
  Grafik podał gotowe fragmenty do wklejenia dla gradientu nieba (już wdrożone),
  miękkich cieni pod obiektami i toon-shadingu terenu (jeszcze NIE wdrożone).
- `optymalizator` **nie był jeszcze uruchomiony ani raz** — warto po punkcie 2.

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
