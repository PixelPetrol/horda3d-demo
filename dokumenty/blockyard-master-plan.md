# VEGGIE FAMIGLIA: Brainrot Survivors — master plan uniwersum v1.1

Data: 2026-08-07 (v1.1: nazwa finalna, timeline mobile ×0.5, reguła pustych rąk) · Tytuł finalny: **VEGGIE FAMIGLIA: Brainrot Survivors** — marka: „Veggie Famiglia" (część rejestrowalna; jedno konto **@veggiefamiglia** dla serialu i gry); podtytuł sklepowy „Brainrot Survivors" wymienny wg trendu; wariant Google Play (limit 30 znaków): „Veggie Famiglia: Brainrot"; PL-marketing: „Osiedle kontra Snackoni". Świat i mapa 1 zachowują nazwę **The Blockyard**. Przed pierwszym publicznym użyciem: rytuał kolizyjny (TikTok / Roblox / Google Play / TMview) + zaklep handle. · Właściciel IP: 100% własne, zero cudzych marek i postaci.

---

# 1. WIZJA I ZAŁOŻENIA

**Jedno zdanie:** transmedialne uniwersum brainrot — warzywna rodzina z polskiego blokowiska broni osiedla przed mafią przekąsek — żyjące równolegle jako serial AI na TikToku i gra survivor-like (Megabonk-style), które nawzajem się napędzają.

**Filary (nie negocjujemy):**
1. **Rodzina > roster.** Bohaterowie to jedna rodzina/podwórko, nie lista klas postaci. Każda mechanika ma korzeń w lore, każdy odcinek serialu ma odbicie w grze.
2. **Serial sprzedaje grę, gra dowodzi serialu.** TikTok = zasięg i emocje; gra = monetyzacja i retencja. Link w bio ⇄ przycisk „obejrzyj serial" w menu.
3. **Zasada dwóch stylów (kluczowa decyzja):** SERIAL = hiperrealny AI-slop (kanoniczny wygląd brainrot wideo, generatory Kling/Hailuo), GRA = brainrot-pixel (piksele 64 px z przeklętymi ludzkimi twarzami) na billboardach w low-poly 3D. To nie sprzeczność — to relacja „anime i jego growa adaptacja". Oba style mają już zdefiniowane bloki STYLE (biblia postaci + blok brainrot-pixel).
4. **Przemoc kreskówkowa, groza umowna.** Porwanie = pusta huśtawka i smoczek, nie realizm. Wersje słowne: `kidsSafeWords` w grze zawsze ON; „spicy" tylko na TikToku.
5. **Solo-dev scope.** Każda faza ma być publikowalna samodzielnie; żadnych systemów, których nie da się wyciąć.

**Parametry gry:** platformy: web (Poki/CrazyGames) + mobile (Capacitor) · pion lub landscape wg bazy istniejącej gry · sesja: run 10–30 min · monetyzacja: rewarded + interstitial (mobile), SDK portalu (web), IAP „usuń reklamy" + skiny · target: 9–16 core, 7+ safe.

**Parametry serialu:** odcinki 8–15 s · 2–3 tygodniowo (1 fabularny + 1–2 fillery formatowe) · PL dialogi z włoskimi wtrąceniami, narrator hype-man · każdy odcinek kończy hak lub głosowanie.

---

# 2. PRZERÓBKA ISTNIEJĄCEJ GRY (konwersja, nie budowa od zera)

Zasada: przenosimy SILNIK I NAWYKI, wymieniamy SKÓRĘ I PĘTLĘ. Checklist mapowania — kolumnę „co mam w bazie" wypełniamy po wskazaniu gry bazowej:

| System wymagany przez survivor-like | Da się zwykle przenieść z istniejącej gry? | Uwagi konwersji |
|---|---|---|
| Ruch gracza (8 kierunków / analog) | TAK — niemal 1:1 | dołożyć dash z i-frames |
| Pętla renderu + kamera | TAK | kamera follow, orbit ~40°, jeśli baza 2D: billboardy zamiast sprite'ów płaskich |
| Spawner obiektów | CZĘŚCIOWO | przerobić na fale czasowe wg timeline'u z biblii |
| Kolizje masowe (300+ obiektów) | RZADKO | wdrożyć spatial hash / grid — pierwszy tydzień konwersji |
| XP, level-up, wybór ulepszeń | RZADKO | nowy moduł: 3 karty wyboru na level (rdzeń gatunku) |
| Auto-atak broni + skalowanie | NOWE | dane broni już w biblii postaci |
| HUD, pauza, wynik | TAK — reskin | |
| Zapis (localStorage) | TAK | schemat save z dokumentu Scopino jako wzór |
| Meta: odblokowania, sklep | CZĘŚCIOWO | tabela odblokowań w biblii |

**Kryterium wyboru bazy:** bierz tę grę, która ma najlepszy RUCH i najstabilniejszy render wielu obiektów — resztę i tak wymieniamy. Fabuła/assety bazy są bez znaczenia.

---

# 3. LORE BIBLE — uniwersum

## 3.1 Świat

**OSIEDLE GRZĄDKOWO (The Blockyard):** wielka płyta, trzepak, działki za blokiem, warzywniak pana Mundka. Warzywa żyją tu od pokoleń, czerpiąc siłę z ziemi i witamin. Serce osiedla: **TRZEPAK** — plac pojedynków, miejsce zbiórek, świętość.

**IMPERIUM SNACKONI:** Famiglia przekąsek z hurtowni po drugiej stronie torów. Cel: zasypać osiedle solą i cukrem, wyburzyć warzywniak, postawić ścianę automatów. Metody: przekupstwo żelkami, zastraszanie chrupnięciem, a od niedawna — rzeczy osobiste.

## 3.2 Pięć Praw Uniwersum (kanon — obowiązuje serial, grę i każdy przyszły content)

1. **Prawo Pierwszego Gryza:** warzywo, które zje przekąskę, zaczyna się zmieniać. Im więcej je, tym mniej pamięta, kim było. Przemiana jest ODWRACALNA — ale tylko detoksem (patrz: Garlicino). ⟶ to jest silnik całej fabuły deprawacji ORAZ growych debuffów.
2. **Prawo Ziemi:** działki to ziemia święta — Famiglia nie może na nie wejść (kompost ich odpycha). ⟶ safe-zone w lore i hub w grze.
3. **Prawo Trzepaka:** pojedynki i przysięgi zawarte przy trzepaku są wiążące dla obu frakcji. ⟶ areny bossów, finały odcinków.
4. **Prawo Narratora:** włoski Narrator widzi wszystko, komentuje wszystko i czasem wtrąca się w kadr. Obie frakcje go słyszą i mają go dość. ⟶ meta-humor, spójny głos marki w serialu i grze.
5. **Prawo Witaminy:** moc warzywa bierze się z jego prawdziwej właściwości (marchew=wzrok, burak=ciśnienie, czosnek=ochrona...). ⟶ reguła projektowania wszystkich kitów i "przemycony" prozdrowotny morał, który kochają portale dziecięce.

## 3.3 Drzewo rodzinne i rozszerzony roster

Bohaterowie zbiorczo: **VEGGIE FAMIGLIA** — przydomek nadany przez Narratora, celowe lustro La Famiglii Snackoni (dwie famiglie, jeden trzepak). To także marka gry i konta.

**RODZINA MARCHEWÓW (dom: blok 6, klatka 7):**
- **CARROTELLO SQUATTELLO** (PL dubbing: Marchewino Dresino) — ojciec. Karta w biblii postaci.
- **PARSLETTA GLAMORETTA** (PL: Pietruszkina Tipsina) — żona, NOWA POSTAĆ, karta niżej. Pietruszka korzeniowa — bo marchew i pietruszka to nierozłączna para z włoszczyzny (tak, „włoszczyzna" dosłownie znaczy „włoskie rzeczy" — uniwersum nazwało się samo).
- **SQUATTELLINO BAMBINO** (PL: Dresinko Marchewinko) — synek, NOWA POSTAĆ, oś sezonu 1.
- **GRANNY SMITHELLA** — babcia Carrotella (jabłko w rodzinie marchewek? „adopcja podwórkowa", nikt nie pyta). Karta w biblii.

**PODWÓRKO:** GARLICINO STINKERINO — dziadek-znachor z działek, jedyny znający detoks (kluczowa rola fabularna) · BEETINO BOUNCERINO — ojciec chrzestny małego (tak, uniwersum ma DWÓCH ojców chrzestnych po dwóch stronach barykady — to celowe lustro) · RADISHETTA RAZORETTA — nastoletnia sąsiadka, samozwańcza „ciocia" i ochrona osobista bambina · COBBINO POPCORNINO — wujek z działki, wywiad i artyleria.

**FAMIGLIA SNACKONI:** DON CHIPSO — głowa rodziny · COCOLETTA SUGARETTA — Ciotka Cukru, specjalistka od „adopcji" cudzych dzieci · elity i miniony wg biblii · KEBABZILLA — siła natury, nawet Famiglia go tylko karmi (hak sezonu 2).

## 3.4 NOWA POSTAĆ: PARSLETTA GLAMORETTA (żona)

**Bio:** królowa balkonu bloku 6. Poznali się przy trzepaku: on robił kucki, ona udawała, że nie patrzy. Paznokcie-tipsy dłuższe niż cierpliwość, serce większe niż torebka (a torebka jest DUŻA). W sezonie 1 postać serialowa; grywalna od sezonu 2 (rola: support/buffer — „Lakier Bojowy": aura przyspieszenia; ult „NIE PRZY DZIECKU!": globalny stun ze wstydu).

**Wygląd:** smukła biała pietruszka korzeniowa (jak „blond" marchewka), nać upięta w wysoki niedbały kok spięty szczypcami, ogromne kolczyki koła, rzęsy-wachlarze, panterkowy top (print, bez logo), różowe tipsy na końcach dłoni-korzonków, klapki na koturnie, balonik z gumy, w ręku telefon w futerale z brokatem.

**Prompt (serial, hyperreal):**

```
Italian Brainrot AI meme character, full body: a slender white parsley root
as a glamorous Slavic housing-estate queen — leaf greens tied in a high messy
bun with a claw clip, huge hoop earrings, dramatic fan-like eyelashes,
leopard-print top, long pink acrylic nails on root-finger hands, platform
flip-flops, blowing a bubblegum bubble, holding a glittery phone case,
confident smirk. + STYLE (blok hiperrealny z biblii)
```

Prompt pixel (gra, sezon 2): ta sama treść + blok brainrot-pixel; twarz = focus: znudzone ludzkie oczy z ciężkimi rzęsami.

**Odzywki:** PL: „Halo, tu się dzieci bawią!", „Seba, weź go!", „Te tipsy były nowe." · EN: "Excuse me, children play here!", "These nails were NEW."

## 3.5 NOWA POSTAĆ: SQUATTELLINO BAMBINO (synek) + forma skorumpowana

**Bio:** pierwsze słowo: „Essa". Pierwsze kroki: od razu kucki. Ulubiona zabawka: mini-trzepak z patyczków. Kocha tatę, mamę i sok marchwiowy — dokładnie w tej kolejności, chyba że mama słucha.

**Wygląd (czysty):** pękata mini-marchewka w pieluszce i rozpiętym dziecięcym dresiku (dwa paski!), malutka nać-czubek jak fontanna na głowie, smoczek na łańcuszku (złotym — po tacie), jeden ząbek (jeszcze nie złoty), wielkie błyszczące oczy.

```
Italian Brainrot AI meme character, full body: an adorable chubby baby
carrot — tiny green leaf-sprout fountain on top of the head, diaper and a
tiny unzipped navy baby tracksuit with two white stripes, golden pacifier
chain, one single tooth, huge glossy innocent eyes, sitting in a proud tiny
squat like his father. + STYLE (hiperrealny)
```

**FORMA SKORUMPOWANA — „DUSTY SQUATTELLINO" (PL: Dresinko Pyłkowe):** po Pierwszym Gryzie u Snackonich. Pokryty neonowo-pomarańczowym PYŁEM SEROWYM (jaśniejszym i „chemicznym" vs naturalna marchewkowa skórka — kontrast musi być czytelny), oczka przekrwione z pomarańczowym błyskiem, zamiast dresiku ponczo z folii po chipsach, smoczek zamieniony na chipsa, którego liże jak lizaka, mini-kucki obok Dona jak młody mafioso.

```
...the same baby carrot CORRUPTED: coated in unnaturally neon-orange cheese
dust brighter than his skin, bloodshot eyes with a faint orange glint, a
crinkled foil chips-bag poncho instead of the tracksuit, licking a single
potato chip like a lollipop, tiny smug mafia squat. + STYLE
```

**Rola w grze:** boss specjalny eventu „RATUNEK" — jedyny boss, którego się NIE zabija: zbicie HP do zera = uwolnienie (cutscena: aura Garlicina, pył schodzi kichnięciem tęczy). Mechanicznie: małe HP, ale kradnie graczowi pickupy i przyzywa Gummini — walka o zasoby, nie o obrażenia.

---

# 4. SERIAL TIKTOK — SEZON 1: „PORWANE DRESINKO" (10 odcinków + fillery)

**Format odcinka:** 8–15 s · hiperrealny AI-slop (Kling/Hailuo, image-to-video z klatki referencyjnej) · dialogi PL z włoskimi wtrąceniami, głosy z ElevenLabs · narrator hype-man spina całość · każdy odcinek: hak w 1. sekundzie, cliffhanger lub głosowanie na końcu · napis tylko jeden: tytuł/nazwa postaci w ostatniej sekundzie.

**Łuk emocjonalny sezonu:** sielanka (E1–2) → katastrofa (E3) → bezradność (E4–6) → najniższy punkt (E7) → mobilizacja (E8) → wojna (E9) → katharsis + nowy cień (E10).

| # | Tytuł | Logline (treść 8–15 s) | Hak końcowy |
|---|---|---|---|
| E1 | „Pierwsze kucki" | Rodzina przy trzepaku; bambino zamiast pierwszych kroków robi PIERWSZE KUCKI; tata płacze ze wzruszenia, Granny mdleje z dumy | przez okno limuzyny obserwuje ich torba chipsów; szept: „Urocze." |
| E2 | „Pierwsze słowo" | Parsletta ćwiczy z małym „ma-ma"; bambino patrzy jej w oczy i mówi: „...Essa." Tata w tle: pięść w górę | głosowanie: „jakie będzie drugie słowo?" |
| E3 | „PORWANIE" | Plac zabaw; kartonowy van z napisem malowanym „DARMOWE WITAMINY" (celowo kredką, absurdalnie podejrzany); moment nieuwagi — pusta huśtawka buja się sama, smoczek na piasku | smoczek w zbliżeniu; cisza; narrator szeptem: „Mamma mia..." |
| E4 | „Okup" | List z liter wyciętych z gazetki promocyjnej: „OSIEDLE ZA SYNA. CZASU: DO WYPRZEDAŻY."; Beetino czyta i zgniata kartkę jedną ręką; Carrotello zdejmuje sygnet — powoli | Parsletta: „Oddaj mi go... albo ja pójdę." (wszyscy bledną) |
| E5 | „Ciotka Cukru" | U Snackonich: Cocoletta rozpieszcza małego — basen z żelek, fontanna coli, „u cioci nie ma warzyw na kolaccourke"; bambino się waha... i GRYZIE żelka | slow-mo pierwszego gryza; oczka błyskają pomarańczowo; narrator: „PRIMO MORSO." |
| E6 | „Nieudany ratunek" | Radishetta solo infiltruje magazyn (przebrana za lizaka); dociera do małego, wyciąga rękę... a on cofa się za nogę Dona: „Zostaję. Tu jest fanta." | jej mina; upuszcza linijkę; smash cut |
| E7 | „DUSTY" | Zdjęcie podrzucone pod drzwi: mały w ponczo z folii, cały w pomarańczowym pyle, mini-kucki obok Dona; Parsletta łza na tipsie; Carrotello bez słowa zdejmuje ZŁOTY ŁAŃCUCH i wiesza na trzepaku | narrator: „Kiedy dres zdejmuje złoto... to znaczy wojna." |
| E8 | „Zbiórka" | Trzepak o świcie; wchodzą kolejno w hero-shotach: Beetino, Granny z kapciem, Garlicino, Radishetta, Cobbino z procą; narrator wyczytuje ksywy jak na gali | ostatnie ujęcie: szóstka w kuckach; „ANDIAMO." ⟶ **to jest jednocześnie trailer gry** |
| E9 | „Rajd" | Szturm na hurtownię: montage — kapeć zdejmuje kamery, smród otwiera drzwi, popcorn jako zasłona dymna; Carrotello twarzą w twarz z Donem przy palecie chipsów | Don: „On już wybrał." Mały wychodzi z cienia — w pyle | 
| E10 | „Detoks" | Garlicino łapie małego w aurę; walka wewnętrzna; wielkie KICHNIĘCIE — pył serowy schodzi tęczową chmurą; „...tato?"; przytulas; łańcuch wraca z trzepaka na szyję | ostatni kadr: na horyzoncie obraca się cień rożna; skwierczenie; „SEZON 2." |

**Fillery między odcinkami (formaty powtarzalne, tanie):** „Kuchnia Granny" (gotuje kompot bojowy, poucza widzów) · „Bramka z Beetino" (kogo dziś nie wpuścił) · „Parsletta reaguje" (komentuje odcinki jak reality-show) · po E10: „Wywiad z Dustym — czego NIE pamięta".

**Szablon prompta odcinkowego (skrót — pełne bloki STYLE/CAMERA/AUDIO RULE masz w dokumencie Scopino, działają 1:1):**

```
Use the provided image as the exact FIRST FRAME. 8-15 seconds, vertical 9:16.
IMPORTANT AUDIO RULE: all dialogue in POLISH (polski), do NOT translate
quotes. Family speaks Polish with heavy Italian accent; narrator ecstatic.
[TU WKLEJASZ LOGLINE ODCINKA ROZBITY NA 3-4 BEATY Z TIMINGIEM]
STYLE: early-2025 Italian Brainrot AI slop aesthetic... (blok standardowy)
```

**Zasady bezpieczeństwa contentu sezonu:** porwanie zawsze umowne (kartonowy van, zero przemocy na dziecku, zero realizmu), deprawacja = cukier i pył serowy (bajkowa pokusa jak u Hansel i Gretel), finał zawsze naprawia świat. Spicy-słownictwo tylko w wersjach social dla dorosłych odbiorców, nigdy w odcinkach z bambino.

---

# 5. SYNCHRONIZACJA GRA ⇄ SERIAL

- **Premiery postaci idą parami:** postać debiutuje w odcinku → w ciągu tygodnia pojawia się w grze (grywalna lub jako NPC/boss). E8 („Zbiórka") = roster reveal = organiczny trailer gry.
- **Event „RATUNEK" w grze = odcinki E7–E10 w czasie rzeczywistym:** przez 2 tygodnie boss Dusty Squattellino dostępny na końcu mapy; społeczność „ratuje" małego równolegle z serialem. Licznik globalny uratowań na landing page'u.
- **Lore w mechanice:** Prawo Pierwszego Gryza = debuff „Pył" (wrogowie elite nakładają slow+odwrócone sterowanie 1 s); Prawo Ziemi = hub-działki między runami; Prawo Trzepaka = areny bossów.
- **Cross-promo pętla:** TikTok bio → strona gry → w grze przycisk „SERIAL" + kod z odcinka (np. hasło z E4 odblokowuje skin „Łańcuch na Trzepaku"). Jedno konto na wszystko: **@veggiefamiglia**.
- **Audio-marka:** jeden narrator (ten sam głos ElevenLabs) w serialu i w grze. Jingle 4-taktowy uniwersum (wzór: jingle Scopino) jako logo dźwiękowe obu.

---

# 6. ROADMAPA (solo-dev, fazy publikowalne osobno)

**FAZA 0 — fundament (tydzień 1):** wybór gry bazowej do konwersji · generacja 2 referencji stylu pixel (Carrotello + Chipsetti) i 2 hiperreal (Carrotello + bambino) · prototyp wydajności: horda 300 billboardów na telefonie.
**FAZA 1 — MVP gry (tyg. 2–3):** konwersja pętli: ruch+dash, spawner fal 0:00–5:00, XP/level-up z wyborem 3 kart, Carrotello komplet, 3 miniony, elite Donutello, boss Don Chipso, HUD, zapis. Build portalowy.
**FAZA 2 — start serialu (tydz. 4, równolegle):** E1–E3 na TikToku (konto, jingle, okładki) + landing z licznikiem i linkiem do MVP. Zgłoszenie gry na Poki/CrazyGames.
**FAZA 3 — pełny sezon (tyg. 5–8):** roster 6 bohaterów, 3 bossy, meta-odblokowania, event RATUNEK zsynchronizowany z E7–E10. Serial 2–3/tydz.
**FAZA 4 — ocena i sezon 2 (tydz. 9+):** decyzje z danych: Kebabzilla jako nowa mapa, Parsletta grywalna, mobile build z reklamami.

**KPI decyzyjne:** serial — % obejrzenia >85 i follow/odcinek; gra — D1 retention >25%, runy/sesję ≥2, konwersja z TikToka (UTM). Jeśli serial żre a gra nie: więcej fillerów + uprościć FTUE gry. Jeśli gra żre a serial nie: publikować gameplay-memy zamiast fabuły.

---

# 7. RYZYKA I HIGIENA

- **IP:** wszystkie postacie własne wg formuły; zero marek (chipsy generyczne, „fanta" w dialogu → podmień na „oranżada" przed publikacją E6!); nazwy przepuszczone przez rytuał kolizyjny (TikTok+Roblox search) przed każdym debiutem.
- **Trend-decay brainrotu:** budujemy WŁASNE IP formułą, nie remiks cudzego — jak gatunek osłabnie, rodzina i serial stoją na emocjach, nie na estetyce; pixel-gra dodatkowo odporna (pixel nie wychodzi z mody).
- **Moderacja platform:** porwanie kreskówkowe, `kidsSafeWords` w grze, spicy tylko social; oznaczaj treści AI zgodnie z wymogiem TikToka.
- **Dane graczy:** portale dziecięce = zero trackingu behawioralnego, telemetria anonimowa i zagregowana.
- **Zakres:** każda faza kończy się czymś publikowalnym; żadna postać/system nie wchodzi do gry przed swoim odcinkiem — serial dyktuje tempo, nie odwrotnie.
