# VEGGIE FAMIGLIA: Brainrot Survivors — biblia postaci i wrogów v1.1

Data: 2026-08-07 · Gatunek: survivor-like (Megabonk-style: świat 3D low-poly, postacie = wycinanki brainrot na billboardach) · Pion produkcyjny: prompty EN pod generator, opisy i odzywki PL, nazwy globalne EN.

## Zasady wspólne (przeczytaj raz, obowiązuje wszystko poniżej)

- **Pipeline postaci:** 3 generacje na bohatera (idle / atak / ult), wycinanka PNG na przezroczystości. Pierwszy udany render Carrotella = obraz referencyjny dla WSZYSTKICH pozostałych (spójność stylu).
- **Blok STYLE (doklejany do każdego prompta):**

```
STYLE: early-2025 Italian Brainrot AI slop aesthetic — hyperrealistic glossy
plastic textures, oversaturated vivid colors, harsh camera-flash lighting,
single centered character, plain flat light-gray background for easy cutout,
full body visible including feet, no text, no brand logos, no watermarks
```

- **ZERO napisów na postaciach** (koszulki, czapki itd.) — sprite'y są mirrorowane w kodzie dla kierunku ruchu, każdy napis by się odbił.
- **Biała naklejka (sticker outline, dodawana w edytorze/shaderze):** gracze i bossowie 8 px, miniony 4 px — hierarchia czytelności w hordzie.
- **ZERO przedmiotów w dłoniach na generacjach** (generatory kaleczą trzymane obiekty): postacie zawsze z pustymi rękami (na kolanach, w kieszeniach, skrzyżowane), a każdy rekwizyt — broń, kapeć, proca, koperta — to OSOBNY sprite składany i animowany w kodzie. Rzeczy NOSZONE (łańcuch, bandolier, torba na ramieniu, kapelusz) generują się dobrze i mogą zostać w promptach. Do każdego prompta postaci doklejać: `EMPTY HANDS, no held objects`.
- **Rozmiary tekstur:** gracze 512–1024 px, miniony w atlasie po 256 px, bossowie 2048 px.
- **Statystyki bazowe (punkt odniesienia = 1.0 / 100):** HP 100 · Speed 1.0 · Might (dmg) 1.0 · Area 1.0 · Cooldown 1.0 · Pickup 1.0.
- **Nazwy:** na ekranie zawsze wersja EN (globalna). Wersje PL żyją na polskim TikToku jako „oficjalny dubbing". Odzywki głosowe lokalizowane, imiona nie.
- Przed publikacją każdej nazwy: 30 s w wyszukiwarce TikToka i Roblox (rytuał kolizyjny).

---

# BOHATEROWIE (frakcja: VEGGIE FAMIGLIA — obrońcy osiedla The Blockyard)

## 1. 🥕 CARROTELLO SQUATTELLO (PL: Marchewino Dresino)

**Rola:** starter · speed / pickup · trudność: łatwa

**Bio:** Wychował się na Osiedlu Grządkowo, gdzie trzepak był siłownią, a piaskownica ringiem. Gdy Famiglia Snackoni zaczęła rozprowadzać sól i cukier wśród młodych rzodkiewek, powiedział „nie na moim osiedlu". Ksywa z bloków: Seba „Karoten" Marchewa.

**Wygląd:** przysadzista, umięśniona marchewka z GOŁYM torsem — błyszcząca pomarańczowa skórka, poprzeczne prążki jak sześciopak, jaśniejszy ślad opalenizny po łańcuchu. Bujna nać zaczesana do tyłu jak zielony czub-plereza (bez czapki). Złoty łańcuch na klacie, sygnet na korzonku, tatuaż-serce na ramieniu (trzepak w środku dorysowany ręcznie po generacji). Granatowe spodnie dresowe z dwoma białymi paskami, bluza od kompletu zawiązana na biodrach, klapki + białe skarpety wysoko. Przymrużone oczy, złoty ząb. Poza spoczynkowa: kucki z garścią słonecznika.

**Statystyki:** HP 90 · Speed 1.15 · Might 0.9 · Area 1.0 · Pickup 1.3

**Kit:**
- Broń „SEED SPITTER / Łuska": pluje łuskami słonecznika w stożku 30° przed sobą; dmg 6, cooldown 0.9 s, 3 pociski. Skalowanie poziomów: +pociski → +szerokość stożka → przebicie 1 wroga → dmg.
- Dash „Wślizg": ślizg w klapkach 0.3 s i-frames, cd 3 s; smuga za nim spowalnia wrogów o 30% na 2 s.
- Pasyw „Beta-Karoten": +30% promień zbierania, loot podświetlony przez przeszkody (marchewka = wzrok).
- ULT „TRZEPAK / CARPET RACK SPIN" (cd 60 s): wyrywa trzepak i wiruje nim 4 s — AoE 360°, tick 15 dmg/0.5 s, silny knockback, kurz i dzwon rury.
- Evolve broni (Łuska + przedmiot „Olej z Bazaru"): **„Słonecznikowy Karabin"** — ciągły strumień łusek.

**Odblokowanie:** dostępny od startu.

**Odzywki:** PL: „Essa.", „Witaminka, mordo.", „Nie na moim osiedlu.", ult: „TRZEPAK CZASU!" · EN: "Ess-a.", "Vitamins, my friend.", "Not on my block.", ult: "RACK O'CLOCK!"

**Prompt (idle):**

```
Italian Brainrot AI meme character, full body, three-quarter view facing
slightly left: a chunky muscular carrot as a Slavic gopnik with a BARE TORSO —
no cap, no jacket: glossy orange carrot skin with horizontal ridges reading
like six-pack abs, big green carrot-leaf hair slicked back like a mullet,
gold chain on bare chest, signet ring, small heart tattoo on the shoulder,
navy tracksuit PANTS with two white stripes, matching jacket tied around the
waist, flip-flops with tall white socks, squinting tough-guy face with one
gold tooth, squatting low holding sunflower seeds. + STYLE
```

Poza atak: `...standing mid-attack, cheeks puffed, spitting a burst of sunflower seed shells forward` · Poza ult: `...swinging a huge rusty metal carpet-beating rack overhead like a war hammer, dust and debris flying`

---

## 2. 🍠 BEETINO BOUNCERINO (PL: Buraczino Betonino)

**Rola:** tank / knockback · trudność: łatwa

**Bio:** Dwadzieścia lat na bramce dyskoteki „Malinowa" i ani jednej wpuszczonej przekąski. Mówi mało, odmawia grzecznie, odprowadza stanowczo. Jego lista gości jest pusta — i taka zostanie.

**Wygląd:** masywny bordowy burak-szafa, za mała gładka czarna koszulka opięta na klacie (BEZ napisów!), słuchawka ochroniarza w uchu ze zwiniętym kablem, liście buraka związane w kucyk wojownika, ciemne okulary, czarne rękawiczki bez palców, glany. Różowo-bordowe „żyłkowanie" buraka na karku jak żyły po treningu.

**Statystyki:** HP 160 · Speed 0.85 · Might 1.1 · Area 0.9 · Pickup 0.9

**Kit:**
- Broń „WYPAD! / VELVET PUSH": pchnięcie falą z otwartej dłoni w stożku 60°; dmg 10, cd 1.4 s, duży knockback. Skalowanie: +zasięg → +knockback → fala odbija pociski → dmg.
- Dash „Krok bramkarza": krótki, ale zostawia po sobie 1 s ścianę-barierę zatrzymującą wrogów.
- Pasyw „Buraczane Ciśnienie": poniżej 50% HP → +25% dmg i 10% lifesteal (sok buraczany podnosi ciśnienie).
- ULT „SELEKCJA / THE VELVET ROPE" (cd 70 s): rozstawia wokół siebie kordon z aksamitnej liny (promień 4 m) na 6 s — wrogowie odbijają się od niej jak od ściany, pociski wrogów nie wchodzą.
- Evolve (Wypad! + „Lista Gości"): **„DZIŚ NIE WEJDZIESZ"** — pchnięcia zadają dmg również przy odbiciu od ścian.

**Odblokowanie:** przeżyj 10 minut dowolną postacią.

**Odzywki:** PL: „Nie ma cię na liście, wafelku.", „Zapraszam jutro. Też nie.", ult: „SELEKCJA!" · EN: "You're not on the list, wafer boy.", "Try tomorrow. Also no.", ult: "VIP ONLY!"

**Prompt (idle):**

```
Italian Brainrot AI meme character, full body, three-quarter view facing
slightly left: a massive dark-red beetroot as a nightclub bouncer — huge
wardrobe-shaped body, too-small plain black t-shirt stretched over the chest,
security earpiece with coiled cable, beet leaves tied back like a warrior
ponytail, dark sunglasses, fingerless black gloves, heavy boots, pink beet
veins on the neck like gym veins, arms crossed, unimpressed face. + STYLE
```

Atak: `...one arm extended in a powerful palm push, shockwave ripple in the air` · Ult: `...setting up a red velvet rope barrier around himself, bouncer stance`

---

## 3. 🍎 GRANNY SMITHELLA (PL: Babuszkina Jabłuszkina)

**Rola:** support / kontrola · trudność: średnia

**Bio:** Wychowała trzy pokolenia warzyw na jednym daniu: „jeszcze jedna łyżeczka". Jej kapeć La Ciabatta ma własną legendę i celność samonaprowadzającą. Famiglia Snackoni boi się jej bardziej niż policji — bo ona zna ich matki.

**Wygląd:** okrągłe zielone jabłko-babcia (odmiana Granny Smith — stąd nazwisko): chusta w kwiatki zawiązana pod „brodą", fartuch w drobny wzór, grube okulary powiększające oczy, rumiane policzki-przebarwienia, ciężka torba na zakupy pełna słoików z kompotem, w drugiej ręce uniesiony groźnie kapeć w kratkę.

**Statystyki:** HP 110 · Speed 0.9 · Might 1.0 · Area 1.2 · Pickup 1.1

**Kit:**
- Broń „LA CIABATTA": kapeć-bumerang — leci 6 m, przebija wszystko, WRACA (drugi hit w drodze powrotnej); dmg 9+9, cd 1.6 s. Skalowanie: +2. kapeć → szerszy łuk → homing na elitach → dmg.
- Dash „Pani tu nie stała": krótki tuptający przeskok; wrogowie na trasie zawstydzeni (stun 0.5 s).
- Pasyw „Zjedz jeszcze": leczenie ponad max HP zamienia się w tarczę-brzuszek (do 30% max HP).
- ULT „OBIAD! / DINNER TIME" (cd 75 s): rozstawia stół — wrogowie w promieniu 5 m przymusowo sadzani i karmieni: stun 2.5 s + przekarmienie (DoT 8/s przez 4 s).
- Evolve (La Ciabatta + „Drugi Kapeć od Pary"): **„CIABATTA DOPPIA"** — dwa kapcie krążą orbitalnie non stop.

**Odblokowanie:** zbierz łącznie 100 leczeń.

**Odzywki:** PL: „Taki chudy, matko jedyna…", „A czapkę masz?", ult: „OBIAD!" · EN: "So skinny, mamma mia…", "Where is your hat?", ult: "DINNER. NOW."

**Prompt (idle):**

```
Italian Brainrot AI meme character, full body, three-quarter view facing
slightly left: a round green apple as a strict loving grandma — floral
headscarf tied under the chin, patterned kitchen apron, thick glasses
magnifying stern eyes, blushing cheek spots on the apple skin, heavy shopping
bag full of glass jars in one hand, a checkered slipper raised menacingly in
the other. + STYLE
```

Atak: `...throwing the checkered slipper like a boomerang, motion arc` · Ult: `...standing behind a small set dinner table with steaming pots, pointing at an empty chair commandingly`

---

## 4. 🧄 GARLICINO STINKERINO (PL: Czosnetto Smrodetto)

**Rola:** mag strefowy / aura · trudność: łatwa

**Bio:** Znachor z Podlasia, ostatni z rodu, który pamięta czasy przed konserwantami. Leczy wszystko czosnkiem, a czego czosnek nie wyleczy — tego się nie da wyleczyć. Nigdy nie był na randce i twierdzi, że to wybór.

**Wygląd:** biała główka czosnku jako łysa głowa starca, broda z suchych łupin czosnku, gruby sweter z owczej wełny (bez wzorów-logo), wełniane skarpety w sandałach, sękaty kostur, na szyi warkocz czosnkowy jak szal, wokół niego delikatne zielonkawe opary smrodu.

**Statystyki:** HP 100 · Speed 0.95 · Might 1.0 · Area 1.3 · Pickup 1.0

**Kit:**
- Broń „AURA / THE STINK": stała strefa smrodu wokół postaci (promień 2 m), tick 4 dmg/0.5 s. Skalowanie: +promień → +tick → wrogowie w aurze −20% dmg → smród zostawia ślad za postacią. (Hołd dla klasyki gatunku — mechaniki nie podlegają ochronie, wyjadacze mrugną okiem.)
- Dash „Skok znachora": teleport 3 m w chmurze oparów, opary zostają jako mini-aura 2 s.
- Pasyw „Odporność": −20% obrażeń od pocisków (czosnek chroni od wszystkiego).
- ULT „EGZORCYZM PRZEKĄSEK / SNACK EXORCISM" (cd 80 s): nova smrodu na cały ekran — wszyscy zwykli wrogowie uciekają w panice 3 s, elity stun 1.5 s.
- Evolve (Aura + „Kożuch Prababci"): **„SMRÓD POKOLENIOWY"** — aura podwaja promień nocą (co drugą minutę gry).

**Odblokowanie:** przeżyj pełną minutę bez otrzymania obrażeń.

**Odzywki:** PL: „Precz, chemio!", „Za moich czasów cukier był karą.", ult: „WYNOCHA!" · EN: "Begone, chemicals!", "In my day, sugar was a punishment.", ult: "OUT!"

**Prompt (idle):**

```
Italian Brainrot AI meme character, full body, three-quarter view facing
slightly left: a white garlic bulb as an old village healer — the bulb is a
bald wise head, beard made of dry garlic husks, thick sheep-wool sweater,
wool socks in sandals, gnarled wooden staff, braided garlic garland worn like
a scarf, faint greenish stink wisps floating around him, squinting ancient
eyes. + STYLE
```

Atak: `...slamming the staff on the ground, a visible ring of green stink expanding around him` · Ult: `...arms raised, massive wave of green vapor exploding outward, husks flying`

---

## 5. 🌶️ RADISHETTA RAZORETTA (PL: Rzodkietta Żyletta)

**Rola:** crit assassin / glass cannon · trudność: trudna

**Bio:** Postrach ostatniej ławki. Trzy szkoły, zero świadectw, jedna zasada: kto zaczepi młodsze warzywo, ten pozna zawartość piórnika. Famiglia wyznaczyła za nią nagrodę — odebrała ją osobiście.

**Wygląd:** mała czerwona rzodkiewka z białą końcówką jak sportowe skarpetki, liście związane wysoko w bojowy kucyk, kolczyki-kółka, balon z gumy do żucia, plaster na policzku, krótka spódniczka mundurka + trampki, w dłoni otwarty piórnik z którego wystają podejrzanie ostre linijki i cyrkle.

**Statystyki:** HP 70 · Speed 1.25 · Might 1.15 · Area 0.8 · Pickup 1.0 · bazowy crit 15%

**Kit:**
- Broń „PIÓRNIK / PENCIL CASE": seria 3 szybkich cięć melee przed sobą; dmg 7 ×3, cd 0.8 s. Skalowanie: +cięcie → crit +10% → cięcia wachlarzem 180° → dmg.
- Dash „Spadam stąd": najdłuższy dash w grze, 0.4 s i-frames, resetuje się przy kill-u.
- Pasyw „Ostra": +1% szansy na kryta za każde 0.01 Speed ponad 1.0 (prędkość = krytyki).
- ULT „PRZERWA! / RECESS!" (cd 65 s): dzwonek szkolny — dash-executes między 8 najbliższymi wrogami, każdy cios = gwarantowany cryt ×3.
- Evolve (Piórnik + „Temperówka"): **„OSTRZENIE"** — każdy cryt skraca cooldown ulta o 1 s.

**Odblokowanie:** 500 killi łącznie.

**Odzywki:** PL: „No i co mi zrobisz?", „To nie ja. Świadkowie też nie.", ult: „PRZERWAAA!" · EN: "And what are you gonna do?", "Wasn't me. Witnesses agree.", ult: "RECESS!"

**Prompt (idle):**

```
Italian Brainrot AI meme character, full body, three-quarter view facing
slightly left: a small red radish with a white bottom like sport socks, as a
school delinquent girl — radish leaves tied in a high combat ponytail, hoop
earrings, blowing a pink bubblegum bubble, band-aid on the cheek, short school
skirt and sneakers, holding an open pencil case with suspiciously sharp rulers
and compasses sticking out, cocky narrow-eyed smirk. + STYLE
```

Atak: `...mid-slash, three motion-blur cuts in the air in front of her, gum bubble popped` · Ult: `...caught mid-dash between afterimages of herself, sharp ruler in each hand`

---

## 6. 🌽 COBBINO POPCORNINO (PL: Kolbino Popcornino)

**Rola:** ranged / artyleria · trudność: średnia

**Bio:** Działkowiec-legenda. Czterdzieści lat obrony ogródka przed szpakami zrobiło z niego snajpera, a kompost nauczył go cierpliwości. Famiglia weszła na jego działkę raz. Popcorn zbierali z dachów trzy dzielnice dalej.

**Wygląd:** kolba kukurydzy jako dziadek-działkowiec: łysiejąca „czupryna" z kukurydzianych wąsów, kapelusz wędkarski z moskitierą, kamizelka z tysiącem kieszeni, pas z kolb kukurydzy jak bandolier z amunicją, w rękach wielka proca zrobiona z widelca ogrodowego, spodnie wciągnięte za wysoko, kapcie ogrodowe.

**Statystyki:** HP 100 · Speed 0.9 · Might 1.2 · Area 1.0 · Pickup 1.0

**Kit:**
- Broń „PROCA Z WIDELCA / GARDEN FORK SLING": strzela ziarnami na dystans 8 m, przebijają pierwszego wroga; dmg 11, cd 1.2 s. Skalowanie: +2 ziarna wachlarzem → +przebicie → +zasięg → dmg.
- Dash „Za kompostownik": przetoczenie się z przysiadu, krótkie, ale zostawia strach na wróble-wabik (taunt 2 s).
- Pasyw „PRAŻENIE / POPPING": trafieni wrogowie „dochodzą" — po 2 s pękają w mini-wybuch popcornu (5 dmg AoE 1 m). Ich własna przekąska obraca się przeciw nim.
- ULT „GRAD Z NIEBA / SKY HARVEST" (cd 75 s): 5 s bombardowania — losowe kręgi telegrafów na całym ekranie, w każdy spada wybuchająca kolba (25 dmg).
- Evolve (Proca + „Masło Klarowane"): **„KINO WIECZORNE"** — pasyw Prażenia łańcuchuje: wybuch popcornu podpala kolejnych.

**Odblokowanie:** pokonaj Dona Chipso.

**Odzywki:** PL: „Z mojej działki? Nie sądzę.", „Kompost przyjmie wszystkich.", ult: „ŻNIWA!" · EN: "From MY allotment? I think not.", "The compost takes everyone.", ult: "HARVEST TIME!"

**Prompt (idle):**

```
Italian Brainrot AI meme character, full body, three-quarter view facing
slightly left: a corn cob as an old allotment-garden grandpa — balding corn-
silk hair, fisherman bucket hat with mosquito net, multi-pocket fishing vest,
bandolier belt of corn cobs across the chest like ammo, holding a big
slingshot made from a garden fork, trousers pulled up too high, garden
slippers, calm sniper squint. + STYLE
```

Atak: `...aiming the garden-fork slingshot, corn kernels mid-flight with motion trails` · Ult: `...pointing at the sky, corn cobs raining down with small popcorn explosions around`

---

## Ławka rezerwowa (rozpisywana przy kolejnych aktualizacjach)

| Postać | PL | Rola | Hook |
|---|---|---|---|
| Cauliflorini Suplexini | Kalafiorini Suplexini | grappler | kalafiorowe uszy MMA, ult: suplex bossa |
| Spuddino Grillino | Kartoflino Grillino | ogień strefowy | wujek z majówki, rozpałka i pogrzebacz |
| Peasini Poddini | Groszetto Strączetto | summoner | strąk wypuszcza miniony-groszki |
| Picklino Brinerino | Ogóretto Kiszonetto | debuffer | zalewa: slow + osłabienie w słoju |
| Pumpkinella Spookarella | Dynietta Straszetta | event Halloween | latarnia z własnej głowy |

## Tabela evolve (zbiorczo)

| Broń | + Przedmiot | = Evolucja |
|---|---|---|
| Seed Spitter | Olej z Bazaru | Słonecznikowy Karabin |
| Velvet Push | Lista Gości | DZIŚ NIE WEJDZIESZ |
| La Ciabatta | Drugi Kapeć od Pary | Ciabatta Doppia |
| The Stink | Kożuch Prababci | Smród Pokoleniowy |
| Pencil Case | Temperówka | Ostrzenie |
| Garden Fork Sling | Masło Klarowane | Kino Wieczorne |

---

# WROGOWIE: LA FAMIGLIA SNACKONI

**Lore frakcji:** mafia przekąsek, która chce zasypać Osiedle solą i cukrem, a na miejscu warzywniaka postawić automat. Struktura klasyczna: szeregowi żołnierze (miniony), kaprale (elity) i trzech Donów. Motto rodziny: „Nic osobistego. Sama sól."

**Zasady designu wrogów:** paleta fast-foodowa (żółcie, beże, brązy, tłuste połyski) kontra soczyste warzywa graczy — rozdział kolorystyczny czytelny w ułamku sekundy. Naklejka 4 px (gracze mają 8). Miniony w atlasie 256 px, projektowane SYLWETKĄ: każdy typ rozpoznawalny po samym kształcie, bo na ekranie będzie ich 300.

**Prompt-szablon miniona (podmieniasz tylko [OPIS]):**

```
Italian Brainrot AI meme enemy sprite, full body, front three-quarter view:
[OPIS], mean stupid face, tiny arms and legs. + STYLE
```

## Miniony (fale hordy)

| Wróg | HP | Speed | Zachowanie | Od minuty | [OPIS] do prompta |
|---|---|---|---|---|---|
| Chipsetti Soldatetti | 10 | 1.1 | melee, roje 10–30 szt., łamią się efektownie (partikle okruchów) | 0:00 (natychmiast) | a single crumpled salty potato chip as an angry little foot soldier |
| Marshmallini Fluffini | 30 | 0.7 | gąbczasty, po śmierci dzieli się na 2 mini (15 HP) | 1:00 | a soft white marshmallow as a dopey henchman, squishy body |
| Gummini Bouncini | 15 | 1.2 | skacze sinusem, odporny na knockback | 2:00 | a translucent red gummy bear bouncing mid-hop, jiggly |
| Friesetti Spearetti | 12 | 1.6 | szarżują w liniach po 5 („porcja"), telegraf 0.6 s | 3:00 | a long thin french fry as a spear-charging soldier, salt dust trail |
| Sodino Explodino | 20 | 1.0 | kamikaze: syczy 1 s (telegraf), wybuch AoE 1.5 m + kałuża coli (slow 30%, 3 s) | 4:00 | a dented soda can with a lit-fuse fizz coming from the tab, panicking face |
| Lollini Spinnini | 60 | 0.5 | wirujący tank, obrażenia kontaktowe, powolny | 4:30 | a big round swirl lollipop spinning like a saw blade on a stick body |

## Elity (kaprale — pojawiają się solo, drop: skrzynia z wyborem ulepszenia)

**DONUTELLO WHEELOTELLO** — pączek-koło. Toczy się przez ekran w linii prostej jak walec (telegraf: smuga lukru na ziemi 1 s przed szarżą), po uderzeniu w krawędź mapy chwilę oszołomiony (okno dmg). HP 300. Zostawia ślad posypki raniący przy deptaniu.
`[OPIS]: a glazed pink-frosted donut rolling like a wheel, sprinkles flying off, determined face in the hole`

**KETCHUPINO SPLATTERINO** — butelka ketchupu-artylerzysta. Trzyma dystans, pluje globami po łuku (telegraf: czerwony krąg na ziemi), kałuże slow 40% przez 4 s. HP 220. Priorytet dla graczy ranged.
`[OPIS]: a squeeze ketchup bottle as a mortar artillerist, squeezing itself to fire a red glob upward, straining face`

**ENERGETICO VOLTINO** — puszka energetyka-hype man. Nie atakuje: biega po ekranie i buffuje +40% speed wszystkim minionom w promieniu 4 m (widoczna elektryczna aura). HP 180, najszybszy wróg w grze. Zabity: upuszcza pełny magnes (zasysa cały loot z ekranu). Klasyczny „priority target".
`[OPIS]: a slim tall energy drink can as a jittery hype-man, electric sparks around it, bloodshot wide eyes, vibrating`

## Bossowie

### 👑 DON CHIPSO — boss 1 (minuta 5)

**Bio:** Głowa Famiglii. Mówi szeptem, bo kto ma sól, nie musi krzyczeć. Wymięty jak jego sumienie, tłusty jak jego interesy. Traktuje Osiedle jak talerz: wszystko, co na nim leży, uważa za swoje.

**Wygląd:** wielka wymięta torba chipsów jako korpus — fałdy złotej folii układają się w prążki garnituru mafiosa. Fedora, wykałaczka w kąciku ust, złote sygnety na palcach-rękawiczkach, tłuste odciski palców na folii jak medale. Porusza się dostojnie, szeleści przy każdym kroku.

**Moveset:**
1. „CHIP SHURIKEN": rzuca 3 chipsami po łuku (pociski-półksiężyce), cd 3 s.
2. „SALT STORM": stożek soli 45°, telegraf 1 s, DoT 6/s + slow 20% przez 3 s.
3. „LA CHIAMATA": wzywa 8 Chipsetti (szelest torby = audio-telegraf).
4. **FAZA 2 (<50% HP):** rozrywa torbę — co 2 s losowe kręgi-telegrafy, w które spadają lawiny chipsów (20 dmg); on sam +25% speed, folia postrzępiona.

**HP:** 1500 · **Drop:** odblokowanie Cobbino + skrzynia evolve · **Głos:** szept + chrupnięcie; PL: „Nic osobistego. Sama sól." · EN: "Nothing personal. Just salt."

```
Italian Brainrot AI meme boss character, full body, three-quarter view: a
huge crumpled golden chips bag as a mafia godfather — foil creases forming
pinstripes of a suit, black fedora, toothpick in the corner of the mouth,
gold signet rings on gloved fingers, greasy fingerprints on the foil like
medals, calm heavy-lidded menacing face. + STYLE
```

### 👑 COCOLETTA SUGARETTA — boss 2 (minuta 10)

**Bio:** Ciotka Cukru, diva rodziny. Topi się wyłącznie elegancko i wyłącznie na innych. Obiecuje słodkie życie — drobnym drukiem: próchnica duszy.

**Wygląd:** tabliczka ciemnej czekolady jako suknia wieczorowa łamana w kostki, boa z rozpuszczonego karmelu, naszyjnik i kolczyki z kostek cukru, długa lukrowa rękawiczka, kieliszek z syropem w dłoni, powieki ciężkie od słodyczy.

**Moveset:**
1. „CHOCO POOLS": rzuca plamy lepkiej czekolady (slow 50%, zostają 8 s).
2. „CARAMEL WHIP": bicz karmelowy na całą długość ekranu, telegraf-linia 0.8 s.
3. „SUGAR RUSH": globalny buff +50% speed dla wszystkich wrogów na 5 s (ekran różowieje — czytelny alert).
4. **FAZA 2 (<50% HP):** „FONDUE" — deszcz kropel czekolady, plamy rosną i łączą się; ona leczy się stojąc w plamach (wymusza na graczu kontrolę przestrzeni).

**HP:** 2600 · **Drop:** skrzynia legendarna · PL: „Słodziutko będzie." · EN: "Sweet dreams, darling."

```
Italian Brainrot AI meme boss character, full body, three-quarter view: a
dark chocolate bar as a glamorous mafia diva — chocolate squares forming an
evening gown, boa of melted caramel, necklace and earrings of sugar cubes,
one long icing glove, holding a cocktail glass of syrup, heavy seductive
eyelids, slow dramatic pose, slightly melting at the edges. + STYLE
```

### 👑 KEBABZILLA — boss finałowy (minuta 15)

**Bio:** Nikt nie wie, skąd przyszedł. Wiadomo tylko, że obraca się od zawsze i że nigdy nie jest „na miejscu" — zawsze „na wynos". Famiglia go nie kontroluje; Famiglia go tylko karmi.

**Wygląd:** wieżowiec mięsa na pionowym rożnie jako kaiju — warstwy mięsa jak mięśnie, mała wściekła głowa przy szczycie rożna, biały sos czosnkowy kapiący jak ślina, w „dłoni" gigantyczny szpikulec, wokół opada kapusta jak confetti, para i skwierczenie.

**Moveset:**
1. Rotacja stała: kontakt z korpusem = 30 dmg (arena wymusza dystans).
2. „SLICE STORM": odcina od siebie plastry mięsa lecące spiralami (bullet-hell), cd 4 s.
3. „SAUCE BEAM": strumień białego sosu obracający się jak wskazówka zegara (telegraf: cienka linia 1 s), przejście przez wiązkę = 25 dmg + slow.
4. **FAZA 2 (<50% HP):** rożen przyspiesza ×1.5, nieustanny spawn Friesetti, spirale gęstsze.
5. **ENRAGE (po 90 s walki):** wszystko ×2 — miękki timer na koniec runa.

**HP:** 4500 · **Drop:** zakończenie mapy + waluta meta · **Audio:** zero słów — tylko skwierczenie; narrator: „MAMMA MIA… KEBABZILLA!"

```
Italian Brainrot AI meme boss character, full body: a colossal vertical
doner-kebab spit as a kaiju monster — stacked meat layers like muscle mass,
small furious face near the top of the skewer, white garlic sauce dripping
like drool, holding a giant metal skewer as a weapon, shredded cabbage
falling around like confetti, steam and sizzle, towering low-angle
composition. + STYLE
```

## Timeline pierwszej mapy: „THE BLOCKYARD / Blokowisko" (0:00–5:00) — wersja MOBILE

Run całkowity: **15 minut** (bossy 5:00 / 10:00 / 15:00). Coś nowego dzieje się co 30–45 s — to twarda reguła, nie sugestia.

| Czas | Wydarzenie |
|---|---|
| 0:00 | Chipsetti NATYCHMIAST — pierwszy kill w <5 s od startu, pierwszy level-up do 0:20 |
| 0:30 | Chipsetti gęściej (grupy 15–20) |
| 1:00 | + Marshmallini wśród chipsów |
| 1:30 | **ELITE: Donutello Wheelotello** (pierwsza skrzynia-piniata już po 90 s) |
| 2:00 | + Gummini; pierwsza mini-horda z jednej strony ekranu |
| 2:30 | Ring-spawn: pierścień Chipsetti zaciska się wokół gracza (uczy dasha) |
| 3:00 | + Friesetti (porcje po 5) · **ELITE: Ketchupino Splatterino** |
| 3:30 | + Sodino wplecione w hordy |
| 4:00 | Gęstość ×2, wszystkie typy naraz |
| 4:30 | **ELITE: Energetico Voltino** → po jego śmierci 8 s ciszy (napięcie) |
| 5:00 | **BOSS: DON CHIPSO** (miniony przestają się spawnić poza jego Chiamatą) |

Akty 2 i 3 (5:00–10:00 i 10:00–15:00): te same typy minionów wracają w tierach z podbitym HP/speed i podmienioną paletą (klasyka gatunku — 6 typów obsługuje cały run), Grissino Spionino dołącza od 6:00, elite co ~90 s, 10:00 Cocoletta, 15:00 Kebabzilla = koniec runa.

**Rytm dopaminowy (twarde zasady mobile):**
- Pierwszy kill <5 s · pierwszy level-up <20 s · level-upy w akcie 1 co ~20–30 s (tania krzywa XP na starcie, stromieje później).
- Elite = piniata co ~90 s (skrzynia z wyborem + fontanna XP).
- Zero martwego czasu: jedyna dozwolona cisza to 8 s przed bossem — i to jest cisza CELOWA (kontrast).
- Śmierć gracza zawsze <15:00; przegrany run i tak sypie monetami i postępem odblokowań (żadnego pustego runa).
- Wynik runa liczy się i wyświetla w <3 s od śmierci — ekran wyniku to też dopamina, nie raport.
