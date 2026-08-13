CZCIONKI UI — VEGGIE FAMIGLIA

jersey10-latin.woff2 / jersey10-latinext.woff2
  Jersey 10, autor: Sarah Cadigan-Fried.
  Licencja: SIL Open Font License 1.1 (tresc w OFL.txt).
  Zrodlo: Google Fonts. Self-hosted swiadomie — projekt nie uzywa zadnego CDN-u.
  Podzial na dwa pliki = subsety `latin` i `latin-ext`; polskie znaki (a c e l n o s z z)
  siedza w latin-ext, wiec OBA pliki sa wymagane.

DLACZEGO NIE PIXELIFY SANS (bylo tu do 12.08.2026):
  Glify byly nieczytelne — S wygladalo jak 5, Z jak 2, B jak 8. W praktyce
  „PAUZA" czytalo sie jako „PAU2A", „BESTIARIUSZ" jako „8ESTIARIUS8",
  a „1500 monet" jako „1900 monet". Zglosil to wlasciciel.
  To ten sam problem, dla ktorego liczby obrazen w 3D dostaly wlasny
  font bitmapowy 5x7 (`GLIF` w main.js) — tam zostaje, bo potrzebuje konturu.

UWAGA PRZY PODMIANIE CZCIONKI:
  Jersey ma tylko wage 400, a UI wola font-weight 700/800. W @font-face jest
  dlatego `font-weight: 100 900` na tym samym pliku, plus `font-synthesis: none`
  na body — bez tego przeglądarka SAMA pogrubia font i rozmazuje piksele.
