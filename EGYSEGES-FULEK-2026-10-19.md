# Mind a hét fül egységes megjelenése + stílusválasztó javítása

Ez a frissítés tartalmazza a korábbi csomag-/rendelésdizájnt és a három új videóreferenciát is.

## Megjelenés

Mind a hét menüpont ugyanazt a sötét, visszafogott arany megjelenést használja: közös címsorok, szövegszínek, kártyák, keretek, mezők, gombok és mobilos tördelés.
A bemutatkozás, visszajelzések, GYIK, útmutató, referenciakártyák és kapcsolatfelvételi űrlap is megújult. A bakelites navigáció megmaradt. A referenciavideók továbbra is beágyazott lejátszók; a videoklip-modul kártyái továbbra is YouTube-linkek.

## Zenei stílus

A korábbi index.html kódja fókuszvesztés után 120 ms késéssel elrejtette a listát. Valódi böngészős egéreseményekkel, 250 ms-os lenyomással a hiba reprodukálható volt: a felengedés előtt eltűnt az opció, a beviteli mező üres maradt.

Az új style-picker.js ezt az időzítéses bezárást lecseréli. Egérkattintásnál megőrzi a mező fókuszát; a kiválasztás beírja az értéket, input/change eseményt küld, majd bezárja a listát. A szabad gépelés és az érintéses görgetés megmarad. A nyílbillentyűkkel és Enterrel is lehet választani; Escape és Tab bezárja a listát.

## Ellenőrzés

- Régi és új változat összehasonlítása: a régi lassú kattintásnál üres maradt; a javított változatban Pop került a mezőbe, a lista bezárult.
- Magyar és angol felületen: lassú egérkattintás, nyilak + Enter, szabad beírás.
- Böngészőben emulált valódi touchStart/touchEnd eseményekkel sikeres kiválasztás 390 px szélességnél.
- Mind a hét fül ellenőrzése 320, 390, 768 és 1440 px szélességnél: nincs vízszintes túlcsordulás.
- Asztali és mobil képernyőképek ellenőrzése.
- Csomagválasztás és árfrissítés HU/EN, céges számlázási mezők, mintaleírások, videoklipes ajánlatkérés megnyitása.
- Helyi, szimulált fizetésindítás: megfelelő adatküldés és átirányítás. Éles vásárlás, e-mail-küldés vagy feltöltés nem történt.

## Érintett fájlok az előző ZIP-hez képest

- public/index.html: a közös stílusfájl betöltése, régi stílusválasztó kód cseréje a külön scriptre.
- public/site-design.css: új, közös megjelenési szabályok.
- public/style-picker.js: új, javított stílusválasztó.
- Ez az összefoglaló.

Az előző teljes ZIP minden fájljának összehasonlításával ellenőrizve: a fizetési, számlázási, e-mailes, OneDrive- és NovaBot-kód változatlan. A rendelési űrlap mezői, nevei és beküldési logikája szintén változatlan.

## Telepítés

A teljes ZIP belső mymusicf-main mappájának tartalmát töltsd a GitHub-repozitórium gyökerébe. Új Render-beállítás nem szükséges.
