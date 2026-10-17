# EnZenem 2.1.0 – két dalváltozat + PDF

A frissítés alapja a felhasználó által átadott `mymusicf-main (4).zip`.
Ez a csomag feltölthető forráskód; az éles honlapot nem telepítettük.

## Új ajánlat és felület

- Minden MP3, MP4 és WAV csomag két teljes zenei változatot tartalmaz ugyanarra a történetre és dalszövegre, valamint PDF-dalszöveget.
- Mindkét változatot megkapja az ügyfél, és az ÁSZF szerinti feltételekkel mindkettőt használhatja.
- Nincs külön fizetős második dal és nincs kiírt átutalási bankszámlaszám. A számlák saját sorszámozása természetesen megmaradt.
- Külön fő ajánlatblokk, csomagonkénti tartalomjelzés, rendelési összefoglaló, rövidebb bemutatkozás és összecsukható nyereményjáték-rész.
- Emberi szerkesztés és alkotói instrukciók hangsúlyozása, az AI használatának őszinte feltüntetésével.
- Magyar és angol ajánlat, GYIK, csomagleírások, visszaigazolás, ÁSZF és adatkezelési tájékoztató.
- Az angol felületről a jogi linkek közvetlenül az angol szövegrészre vezetnek.
- A régi különálló bemutatóoldal az aktuális „Hogyan működik” fülre irányít: nem tart fenn eltérő árakat és kézbesítési ígéretet.

## Fizetés és teljesítés

1. A vevő kitölti az űrlapot és a Viva fizetőoldalán fizet.
2. A szerver az eredeti ellenőrzésekkel igazolja a fizetést: rendelésazonosító, státusz, összeg, pénznem.
3. E-mailes visszaigazolás készül az ügyfélnek, és adminértesítés a teljes brieffel, címmel, formátummal és határidővel.
4. A Google Sheets naplózás megmarad; a dalszöveg és dalhivatkozások üresek, amíg személyesen elkészíted a csomagot.
5. A két dalt és a PDF-dalszöveget te készíted el és küldöd ki a megszokott módon. Ez a frissítés nem vezet be automatikus dal- vagy dalszöveg-PDF-generálást és végtermékküldést. A fizetéskor esetleg csatolt PDF továbbra is a számla, nem a kész dalszöveg.

Az automatikus OpenAI-hívások és a `/api/generate_song` végpont teljesen kikerültek az aktív Node-szerverből. A fizetés és a levelezés nem igényli az `OPENAI_API_KEY` vagy `OPENAI_MODEL` változókat. A régi `main.py` nem az aktív kiszolgáló: a Render és az npm a `server.js` fájlt indítja.

Instrumentális kérésnél nincs énekelt szöveg: az oldalon jelzett PDF ilyenkor a címet és a személyes üzenetet tartalmazza. A két változat nem jelent két ingyenes módosítási kört; a javítási kéréseket a meglévő ÁSZF szerint egyezteted.

## Árak

| Csomag | 48 óra | 24 óra | 6 óra |
| --- | ---: | ---: | ---: |
| MP3 | 7 500 Ft | 10 500 Ft | 14 000 Ft |
| MP4 | 15 000 Ft | 18 000 Ft | 21 500 Ft |
| WAV | 25 000 Ft | 28 000 Ft | 31 500 Ft |

A 24 órás gyorsítás 3 000 Ft-os és a 6 órás gyorsítás 6 500 Ft-os felára változatlan. A meglévő 50%-os akció és a közösségi nyereményjáték feltételeit a frissítés nem változtatja meg.

## Telepítés

A ZIP `mymusicf-main` mappájának teljes tartalmát használd a megszokott GitHub → Render frissítéshez. Új csomagfüggőség nincs. A `public/bundle.css` új fájl, ezt is töltsd fel. A Viva-, levelezési és Google Sheets-beállításokat tartsd meg. A korábbi ZIP-et őrizd meg visszaállításhoz.

A projekt mappájában: `npm install`, majd `npm test`, végül a megszokott `npm start`. A számlázási módot továbbra is a meglévő `INVOICE_MODE` vezérli; a frissítés nem módosítja az éles környezeti beállításokat.

## Ellenőrzés eredménye

- 9/9 fizetési és normalizálási teszt sikeres.
- Izolált, valódi külső hívás nélküli szerverpróba: magyar és angol megrendelés, ellenőrzött fizetés, ügyfél- és adminlevél, számlamelléklet útvonala, eredeti brief naplózása.
- Ismételt visszairányítás nem okozott újabb feldolgozást; hibás összegű fizetésnél nem készült levél vagy naplóbejegyzés.
- A próbák egyetlen OpenAI- vagy Suno-hívást sem indítottak.
- Az új főoldali szövegek angol fordításának és a HU/EN szótár oda-vissza működésének ellenőrzése sikeres.
- JavaScript-szintaxis, beágyazott scriptek, strukturált termékadatok, UTF-8 kódolás és ZIP-integritás ellenőrizve.
- A böngészős vizuális és mobilnézeti próbát a környezet helyi hálózati korlátozása megakadályozta. Valódi bankkártyás terhelés, külső levélküldés vagy éles telepítés nem történt.

## Adatkezelési szöveg

Az új tájékoztató különbséget tesz az automatikus weboldali feldolgozás és a személyesen használt AI-eszközök között. A kézi alkotásnál csak a szükséges történetrészleteket add át; a rendelési e-mail-cím és a számlázási adatok nem szükségesek ehhez. A módosítás a kért szolgáltatásváltozást vezeti át, nem a teljes meglévő jogi szöveg megfelelőségi auditja.

Hivatalos háttérforrások:
- GDPR, különösen az adatkezelésről adott tájékoztatás: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- OpenAI európai adatkezelési tájékoztató: https://openai.com/policies/eu-services-privacy-policy/
- Suno adatkezelési tájékoztató: https://suno.com/privacy/
