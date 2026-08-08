# HORDA 3D — nowy projekt „na poważnie" (survivors-like à la Megabonk)

> Stan: 8.08.2026 późna noc — **prototyp v11 działa** (testowany w przeglądarce).
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
