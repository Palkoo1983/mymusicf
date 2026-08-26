# EnZenem 2.0.3 – Viva-ellenőrzési javítás és élő teszt

## Mit javít ez a verzió?

- A sikeres visszairányítás után a szerver a redirectben kapott
  tranzakcióazonosítóval kéri le a Viva `Retrieve Transaction` erőforrását,
  majd ellenőrzi a 16 számjegyű rendeléskódot, a `statusId = F` sikeres
  állapotot, a pontos összeget és a HUF pénznemet.
- Javítja a 2.0.2 téves `transaction_id_mismatch` elutasítását. A Viva
  lekérdezési válasza nem tartalmaz külön `transactionId` mezőt, ezért azt nem
  lehet a válaszban összehasonlítani; maga a tranzakcióazonosító jelöli ki az
  ellenőrzött API-erőforrást a lekérési URL-ben.
- A csomagár és a kézbesítési felár kizárólag a szerver rögzített árlistájából
  származhat. Tetszőleges vagy negatív felár nem fogadható el.
- A `/api/generate_song` végpont csak az ugyanabban a szerverfolyamatban futó,
  már ellenőrzött fizetési folyamatból hívható.
- A nyilvános `/api/test-mail` és `/api/generate_song/ping` végpont megszűnt.
- A kapcsolatfelvételi űrlap szerveroldali ellenőrzést, robotcsapdát és
  gyakorisági korlátozást kapott.
- A 16 számjegyű Viva orderCode szövegként marad meg, így nem veszít
  pontosságot a JavaScript számábrázolása miatt.

A régi modalos böngészőkódot ez a csomag szándékosan nem módosítja. Ez külön,
felületi takarításként végezhető el a sikeres fizetési teszt után.

## A 2.0.2-vel már levont tesztfizetés

A `transaction_id_mismatch` naplósor előtt a rendszer megállt, ezért ennél a
fizetésnél nem indult dalgenerálás, számlázás, e-mail vagy Sheet-bejegyzés.
Mivel a Render Free példány helyi rendelési fájlja új telepítéskor nem tekinthető
tartósnak, ezt a tesztrendelést ne próbáld automatikusan újrajátszani. A Vivában
ellenőrzött, sikeres 10 500 Ft-os teszttranzakciót vond vissza/térítsd vissza;
ehhez a rendszerben nem készült számla, így ott nincs mit sztornózni.

## Feltöltés előtt

1. Tartsd meg az előző, működő ZIP-et visszaállítási példányként.
2. Olyan időpontban telepíts, amikor nincs vásárló a Viva fizetési oldalán.
   A korábbi verzióval létrehozott, még függőben lévő rendelésekben nincsenek
   meg az új ellenőrzési mezők, ezért azokat ez a verzió biztonsági okból nem
   teljesíti automatikusan.
3. A meglévő Viva környezeti változókat ne módosítsd. Új környezeti változó
   nem szükséges.
4. A teljes projektet töltsd fel: az új `paymentSecurity.js` fájl kötelező.

## Automatikus ellenőrzés

A projekt könyvtárában:

```bash
npm install
npm test
```

Az elvárt eredmény: minden teszt sikeres, nulla hiba.

## Élő kártyás próba

1. Nyisd meg az oldalt friss vagy inkognitó böngészőablakban.
2. Töltsd ki szabályosan a megrendelést, és válaszd az Alap csomagot.
3. Fizess a saját kártyáddal.
4. A szervernaplóban ennek a sorrendnek kell megjelennie:

```text
[VIVA CREATE]
[VIVA ORDER RESPONSE]
[VIVA PAY URL]
[VIVA SUCCESS REDIRECT]
[PAYMENT VERIFIED]
[SUCCESS] Dal generálás elindult.
[INVOICE] Generated invoice
[MAIL:QUEUED]
[SHEET OK]
```

5. A `[PAYMENT VERIFIED]` sor összegének egyeznie kell a Vivában látható
   10 500 Ft-os tranzakcióval.
6. Pontosan egy számlának, egy ügyfél-visszaigazolásnak, egy adminlevélnek és
   egy Sheet-sornak kell keletkeznie.

Ha `[PAYMENT VERIFY REJECTED]` vagy `[PAYMENT VERIFY ERROR]` jelenik meg, a
rendszer szándékosan nem továbbítja a rendelést. Ilyenkor ne módosíts találomra
a kódon: állítsd vissza az előző ZIP-et, és őrizd meg a teljes naplórészletet.

## Gyors biztonsági ellenőrzések

- `https://www.enzenem.hu/api/test-mail` → 404 / „Cannot GET” az elvárt válasz.
- `https://www.enzenem.hu/api/generate_song/ping` → 404 / „Cannot GET” az
  elvárt válasz.
- Sikertelen vagy nem igazolható fizetés után nem jelenhet meg
  `[PAYMENT VERIFIED]`, számla, sikeres fizetési e-mail vagy új Sheet-sor.

## Visszaállítás

Ha a valódi próba eltér a fenti sorrendtől, telepítsd vissza változtatás nélkül
az eredeti `mymusicf-main (3).zip` tartalmát. A környezeti változókat a javítás
nem módosítja, ezért a visszaállításhoz azokat sem kell átírni.

## Hivatalos Viva-források

- Smart Checkout – fizetés ellenőrzése:
  https://developer.viva.com/smart-checkout/smart-checkout-integration/
- Retrieve Transaction:
  https://developer.viva.com/code-samples-for-payments/retrieve-transaction/
- StatusId értékek:
  https://developer.viva.com/integration-reference/response-codes/
