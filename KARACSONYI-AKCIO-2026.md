# EnZenem – karácsonyi akció és nyereményjáték, 2026

A csomag 2026. október 10-től indítható karácsonyi kampányhoz készült.
Az éles oldalon a feltöltés és az új telepítés után jelennek meg a változások.

## Aktuális csomagárak

| Csomag | Eredeti ár | 50%-os akciós ár |
| --- | ---: | ---: |
| Alap / MP3 | 15 000 Ft | 7 500 Ft |
| Videó / MP4 | 30 000 Ft | 15 000 Ft |
| Prémium / WAV | 50 000 Ft | 25 000 Ft |

Az akció visszavonásig érvényes, nincs automatikus lejárata.
A gyorsított kézbesítés felára továbbra is 3 000 Ft (24 óra), illetve
6 500 Ft (6 óra); a 48 órás alapkézbesítéshez nincs felár.
A második dalváltozat meglévő 3 000 Ft-os díja megmaradt.

Az árlista, a rendelési csomagválasztó, a Megrendelés gomb, a szerveroldali
fizetési összeg és a keresőknek átadott termékár az új árakat használja.
A számlázás és a visszaigazoló e-mail a meglévő szerveroldali árképzésből
kapja az összeget. A korábbi vásárlói véleményben szereplő történeti vételárat
megőriztük; az nem az aktuális árlista része.

## Nyereményjáték jelzése

Minden fülön látható a karácsonyi akció és a közösségi nyereményjáték:

- Összesen 2 egyedi MP4 dal, 2 nyertesnek, fejenként 1 dal.
- Sorsolás: 2026. december 22.
- A nyertesek karácsony estig, december 24-ig megkapják a dalukat.
- A részvétel részletei a közösségi oldalakon találhatók.
- A Facebook-, Instagram- és TikTok-gombok az oldal meglévő profiljaira vezetnek.

A megjelenítés magyarul és angolul is elkészült. A részvételi feltételeket
és a közösségi bejegyzéseket ez a csomag nem hozza létre; azokhoz a
honlap a közösségi profilokra irányít.

## Feltöltés

1. Őrizd meg az eredeti ZIP-et visszaállításhoz.
2. A telepítést akkor végezd el, amikor nincs folyamatban bankkártyás fizetés.
   A szerver a visszatéréskor az aktuális árlistával ellenőrzi a tárolt
   fizetési összeget, így a régi áron megkezdett fizetés az új árlista
   telepítése után elutasítást kaphat. Ezért várd meg a folyamatban lévő
   fizetések befejezését a frissítés előtt.
3. A megszokott GitHub → Render folyamattal töltsd fel a teljes projektet.
   Ha csak a módosult fájlokat cseréled, az alábbiakat együtt frissítsd:
   - `paymentSecurity.js`
   - `public/index.html`
   - `public/script.js`
   - `public/style.css`
   - `public/i18n.js`
   - `tests/paymentSecurity.test.mjs`
4. A meglévő környezeti változók maradnak. Új függőség vagy új beállítás nincs.
   A régi README-ben szereplő `PRICE_*` példák nem vezérlik ezt a Viva
   fizetési folyamatot; a szerver a `paymentSecurity.js` rögzített árait használja.
5. A sikeres telepítés után nyisd meg az oldalt friss vagy inkognitó ablakban.
   Ellenőrizd az árlistát és a rendelési gombot. A módosított felületi fájlok
   új verziójelölést kaptak, hogy a böngésző frissen töltse le őket.

## Ellenőrző összegek

| Csomag | 48 óra | 24 óra | 6 óra |
| --- | ---: | ---: | ---: |
| MP3 | 7 500 Ft | 10 500 Ft | 14 000 Ft |
| MP4 | 15 000 Ft | 18 000 Ft | 21 500 Ft |
| WAV | 25 000 Ft | 28 000 Ft | 31 500 Ft |

A projektben a `npm test` futtatja az automatikus fizetési ellenőrzéseket.
A tesztek a csomagárakat, a felárakat, az adatok ellenőrzését és a Viva
tranzakció ellenőrzését vizsgálják.

Az elkészült csomagon sikeres volt:

- Mind a 8 automatikus fizetési ellenőrzés.
- Mind a 9 csomag–kézbesítés kombináció a fizetést indító szerverkódban,
  beleértve a Vivának küldött filléres összeget és a mentett rendelési összeget.
- Mind a 9 kombináció a böngésző Megrendelés gombján.
- A csomagkártyák és a kampánygomb átlépése a megfelelő fülre.
- A magyar–angol váltás a kampányszövegeknél, csomagáraknál és rendelési gombnál.
- A kampány és árlista megjelenése 390 és 320 képpont széles mobilnézetben.
- A teljes, helyi próbarendelés: MP4 + 24 órás kézbesítés, egyetlen fizetésindítás,
  18 000 Ft-os végösszeggel.

A böngészős próba során nem jelentkezett JavaScript-hiba.
A `server.js` és az összes eredeti kép, betűtípus, jogi oldal, valamint
generálási és rendelésnaplózási fájl tartalma változatlan maradt.

A helyi böngészős ellenőrzés izolált fizetési válaszokkal történik;
valódi bankkártyás terhelést, számlát vagy e-mailt nem hoz létre.
Az éles Viva-kapcsolat végső próbája a telepített oldalon végezhető el.
A régebbi biztonsági telepítési dokumentum 10 500 Ft-os alapárra épülő
élő próbájánál most 7 500 Ft az elvárt, felár nélküli MP3-összeg.

## Későbbi módosítás

Az akció visszavonásakor a szerverárakat, a felületi árakat, a termékárat,
a szövegeket és a tesztben várt összegeket együtt kell frissíteni.
A nyereményjáték bejelentésének nincs automatikus eltávolítása; a lezárás
után a kampányblokk nyereményjáték-részét törölni vagy eredményhirdetésre
cserélni kell. Ez önmagában nem zárja le az árkedvezményt.
