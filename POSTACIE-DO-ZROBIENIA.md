# CO DOGENEROWAĆ W PIXELLABIE (stan 12.08.2026)

## ⬛ ZAMÓWIENIE — kolejność od najważniejszego

### A. Postacie animowane (8 kierunków, zip → packer)
1. **Don Chipso** — 120 px, `Running` + `Death` (`Idle` jeśli łatwo). Wielka wymięta
   torba chipsów w prążkowanym garniturze: złoty łańcuch, fedora, cygaro, ciemne
   okulary, tłusty połysk. Ma być czytelny jako WIĘKSZY i groźniejszy od Chipsettiego.
   Plik: `Don Chipso.zip`.
2. **`Death` dla Snackoni** — tylko ta jedna animacja: **Lollini Spinnini** (120 px),
   **Marshmallini Fluffini** (116 px, rozpada się — dzieli się na dwa!),
   **Friesetti Spearetti** (120 px). Chipsetti opcjonalnie (jest ich 200 na ekranie).
3. **Broccolino Rastafarino** — 124 px, `Idle` + `Running` + `Two-Footed_Jump`
   (+ `Death`). Brokuł z dredami z własnej korony, luźna koszula, klapki.
4. **`Idle` dla Beetina** — 124 px, tylko `Idle` (widać go w menu i w spoczynku).

### B. Rekwizyty — statyczne 2D, po jednym obrazku (PNG, przezroczyste tło)
Rozmiary orientacyjne (obecne w grze: bone.png 56×28, bottle.png 25×50, radio.png 52×53):

| plik | rozmiar | co to |
|---|---|---|
| `witaminka.png` | ~28×28 | kapsułka witaminy = XP. **Najważniejszy** — leży setkami na ekranie, musi być czytelny jako mała kropka |
| `czosnek.png` | ~34×34 | ząbek czosnku — broń orbitalna |
| `pizza.png` | ~48×48 | koło pizzy z góry — bumerang |
| `oliwa.png` | ~26×52 | butelka oliwy z oliwek — leci łukiem i wybucha |
| `klopsik.png` | ~40×40 | klopsik z oczami — kamikaze (zamiast kury) |
| `gorgonzola.png` | ~40×36 | kawałek pleśniowego sera — śmierdząca aura |
| `mlynek.png` | ~28×48 | młynek do pieprzu — promień |
| `mozzarella.png` | ~24×24 | kulka mozzarelli — pocisk podstawowy (opcjonalnie) |
| `salata.png` | ~72×44 | czasza spadochronu z liścia sałaty — **bez sznurków** (patrz niżej) |

### Gotowy prompt: czasza sałaty (spadochron)

**Sznurki rysuje silnik**, nie generator — muszą sięgać dokładnie do barków postaci,
a odległość zmienia się z wysokością lotu i kołysaniem. Sprite ma być SAMĄ CZASZĄ:

```
top-down 3/4 view pixel art sprite of a giant curly lettuce leaf used as a
parachute canopy, seen slightly from below, billowing and dome-shaped, vibrant
green with lighter lime ruffled edges and visible pale leaf veins, thick dark
green outline, limited palette, crisp hard pixels, no anti-aliasing,
transparent background, no strings, no shadow, no character, 72x44
```

Jeśli generator uprze się przy sznurkach — dorysowanie ich do tekstury nic nie
zepsuje, ale i tak zostaną przykryte tymi z kodu.

Wymagania techniczne rekwizytów: **przezroczyste tło** (nie białe), **bez cienia
pod obiektem** (silnik rysuje własny), grube piksele i wyraźny kontur jak
u postaci, nasycona paleta. Widok z boku/lekko z góry — kamera patrzy z góry
pod kątem ok. 40°.

Do czasu dostawy w grze siedzą **proceduralne zamienniki rysowane w kodzie**,
więc nic nie jest zablokowane — podmiana to jedna linijka na plik.

---

# POSTACIE — szczegóły (stan 12.08.2026)

Kod jest gotowy na nowe arkusze; brakuje samej grafiki. Poniżej: czego brakuje,
w jakiej kolejności to boli, jakie ustawienia eksportu i jak wgrać gotowy zip.

## Co jest teraz w arkuszach (sprawdzone w `assets/veggie/_spritedata_veggie.json`)

| postać | rozmiar | animacje |
|---|---|---|
| carrotello_squattello | 124 px | idle, run, jump |
| beetino_bouncerino | 124 px | run, jump — **brak idle** |
| chipsetti_soldatetti | 120 px | run — **brak death** |
| marshmallini_fluffini | 116 px | run — **brak death** |
| gummini_bouncini | 116 px | run — **brak death** |
| friesetti_spearetti | 120 px | run — **brak death** |
| sodino_explodino | 120 px | run — **brak death** |
| lollini_spinnini | 120 px | run — **brak death** |
| Don Chipso | — | **BRAK WŁASNEGO ARKUSZA** (silnik używa powiększonego Chipsettiego) |

Silnik nie wywala się przy brakach: bez `death` wróg znika od razu, bez `idle`
postać w menu i w spoczynku pokazuje pierwszą klatkę `run`. Ale traci się na tym
najlepsze klatki gry — sekwencja śmierci (`startDeath`/`updateDeath`) jest już
napisana i tylko czeka na materiał.

## Kolejność wg tego, ile daje na ekranie

1. **DON CHIPSO — własny arkusz.** Boss co 2 minuty wygląda dziś jak zwykły
   szeregowy, tylko 2.7× większy. To najbardziej widoczny brak w całej grze.
   Potrzebne: `Running` + `Death` (idle opcjonalne — boss zawsze idzie).
2. **`Death` dla Snackoni.** Priorytet: Lollini (największy), Marshmallini
   (i tak dzieli się na dwa — animacja rozpadu ma sens), Friesetti. Chipsetti
   przy 200 sztukach na ekranie może zostać bez.
3. **`Idle` dla Beetina.** Widać go w menu na zakładce Postacie i w spoczynku.
4. **NOWI BOHATEROWIE** — sklep postaci ma dziś dwa kafelki i wygląda pusto.
   Propozycje niżej, do wyboru/odrzucenia.

## Ustawienia eksportu (tak, żeby packer to przyjął bez ręcznej roboty)

- **8 kierunków**, w kolejności: south, south-east, east, north-east, north,
  north-west, west, south-west (packer sam je układa po nazwach katalogów).
- **Rozmiar klatki**: 120 px dla wrogów, 124 px dla bohaterów (spójnie z tym,
  co już jest; `scale` w rejestrze dostraja resztę).
- **Nazwy animacji w PixelLabie** muszą trafić w `ANIM_MAP` z packera:
  `Idle` → idle (6 fps), `Running` → run (12 fps), `Two-Footed_Jump` albo `Jump`
  → jump (14 fps), `Attack` → punch (14 fps), `Death` → death (10 fps).
  Inna nazwa = animacja zostanie po cichu pominięta.
- **Nazwa pliku zip** staje się kluczem w SPRITEDATA: `Don Chipso.zip` →
  `don_chipso`. Warto trzymać schemat `imie_przydomek`.

## Jak wgrać gotowe zipy

```bash
python3 "/Users/piotrkorona/Desktop/wlasna gra/horda3d/narzedzia/pakuj_veggie.py" ~/Downloads/veggie-zipy "/Users/piotrkorona/Desktop/wlasna gra/horda3d/assets/veggie"
```

Potem (to robię ja, ale niech będzie zapisane):
1. Wpisy z `assets/veggie/_spritedata_veggie.json` scalić do `spritedata.js`.
2. **PODBIĆ `?v=` w importach** `spritedata.js` w `main.js` — bez tego stary
   cache daje „Cannot read properties of undefined (img)". Ta pułapka już raz
   zabrała iterację.
3. Boss: w `ENEMY_TYPES.boss` podmienić `char: 'chipsetti_soldatetti'` na
   `'don_chipso'` i zmniejszyć `scale` z 2.7 (własny sprite będzie już duży).
4. Bohater: jeden wpis w `CHARS` (nm, ds, char, price, spd, hp, dmg, mag, scale).

## Propozycje nowych bohaterów (do potwierdzenia)

Warzywa = nasi, śmieciowe żarcie = Famiglia Snackoni. Trzymam ten podział.
Stat­ystyki tak, żeby każdy grał inaczej, a nie był „Carrotellem +10%".

| kandydat | wygląd | rola w grze | staty (propozycja) |
|---|---|---|---|
| **Broccolino Rastafarino** | brokuł z dredami z własnej korony, luźna koszula | aura — bije wszystko wokół siebie, chodzi w tłumie | spd 1.0, hp +1, dmg 1.0, mag 1.0, cena 300 |
| **Pomodorino Mafiozini** | pomidor w prążkowanym garniturze i kapeluszu, cygaro | szkło: ogromne obrażenia, 2 serca, rozbryzguje się | spd 1.05, hp -1, dmg 1.5, mag 0.9, cena 400 |
| **Cipollino Lacrimini** | cebula, ciągle płacze, chusteczka w kieszeni | kontrola: wrogowie w pobliżu wolniejsi (łzy gryzą w oczy) | spd 0.95, hp +2, dmg 0.8, mag 1.1, cena 350 |
| **Aglietto Vampirini** | czosnek w peleryne, wielkie zęby | leczenie: co jakiś czas kradnie serce z zabójstwa | spd 1.0, hp 0, dmg 1.0, mag 1.2, cena 450 |

**DECYZJA USERA (12.08): robimy tylko BROCCOLINO RASTAFARINO.** Pozostali trzej
zostają w zamrażarce jako pomysły — nie generować bez ponownego potwierdzenia.

Kod bohatera powstanie **dopiero razem z arkuszem**: wpis w `CHARS` bez sprite'a
wywala Billboard na `SPRITEDATA[char]`, więc nie dopisuję go „na zapas".
Do zaprojektowania przy wdrożeniu: czym dokładnie jest jego aura — czy to
darmowa Skarpeta biologiczna od 1. poziomu, czy osobny, słabszy efekt obszarowy,
żeby nie zdublować istniejącej broni.
