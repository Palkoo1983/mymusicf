# Videoklipkészítés – 2.3.0

Az új szolgáltatás külön ajánlatkérési ág. A meglévő dalrendelés Viva-fizetését, számlázását és Sheets-kezelését nem használja és nem módosítja.

## Ügyfélfolyamat

Csomag → anyagok feltöltése → ajánlatkérés visszaigazolása → tulajdonosi ajánlat 24 órán belül → ügyfél elfogadása → banki átutalás → jóváírás kézi ellenőrzése és számlázás → elkészítés → kézi átadás letöltési linken.

Az ajánlatban a teljes árat, határidőt, koncepciót, módosításokat és felhasználást rögzíteni kell. A 24 óra az első válaszra vonatkozik. Az induló árak nem fizetési felszólítások. Kedvezményezett: Gombkötő Pál e.v.; számlaszám: 10918001-00000134-59510006 (az eredeti honlapforrásból); közlemény: KLIP-azonosító. Nem készül automatikus számla vagy automatikus fizetettségjelzés. A megállapodáshoz szükséges fogyasztói nyilatkozatokat külön, az ajánlat elfogadásakor kell kezelni.

## OneDrive – egyszeri tulajdonosi összekötés

A megadott „Videoklip készítés” mappa megosztási linkkel bejelentkezés nélkül megnyitható volt az ellenőrzéskor. Oda így még ne kerüljenek ügyfélanyagok! A OneDrive-ban a Hozzáférés kezelése résznél távolítsd el a megosztási linket és mások hozzáférését, vagy válassz új, privát mappát. A weboldal nem publikálja a mappalinket. A szerver megtagadja az új feltöltéseket, ha a mappán megosztást észlel vagy a privát állapotot nem tudja ellenőrizni.

1. Saját Microsoft Entra alkalmazásregisztráció szükséges személyes Microsoft-fiókok támogatásával. Authentication alatt engedélyezd a public client flow-t. Delegated Microsoft Graph jogosultság: `Files.ReadWrite`; bejelentkezéskor `offline_access`. Nincs client secret. Ez a jogosultság a tulajdonos fájljaihoz biztosít hozzáférést, nem kizárólag ehhez a mappához; ezért kizárólag saját alkalmazást használj, és őrizd a titkos tokeneket. A kód a beállított mappára korlátozza a felhasználást.
2. Helyben, Node 22-vel, a forrás mappájából PowerShellben:

```powershell
$env:ONEDRIVE_CLIENT_ID='a-saját-alkalmazás-azonosítója'
$env:ONEDRIVE_FOLDER_PATH='Videoklip készítés'
node connect-onedrive.mjs
```

A program a Microsoft saját oldalán kér bejelentkezést és tulajdonosi jóváhagyást, majd helyben `onedrive-private.env` fájlt ír. Jelszót nem kér a program és tokent nem ír ki a terminálra. Ha a mappa máshol van, a saját OneDrive gyökeréhez képest add meg az útvonalat. A program nem hoz létre mappát, és nem változtat meg megosztást. Már létező titkos fájlt nem ír felül.

3. A fájl értékeit add meg Render Environment változóként. A meglévő `RESEND_API_KEY`, `MAIL_FROM` (vagy `SMTP_FROM`) és `TO_EMAIL` (vagy `NOTIFY_TO`) is szükséges. A `PUBLIC_URL` legyen a valós webcím. A titkos fájlt ne tedd Gitbe, ne küldd el chatben, és ne másold a public könyvtárba.
4. A `CLIP_DATA_DIR` tartós, csak a szerver által elérhető tárhely legyen, például Render persistent disken `/var/data/clips`. A megújított token ide kerül. Tartós lemez nélkül a tokenfrissítés újratelepítéskor elveszhet, és új bejelentkezés válhat szükségessé. Egyetlen szerverpéldány támogatott; több példányhoz közös zárolás és sebességkorlátozás kell.
5. `VIDEOCLIPS_ENABLED=true` csak a privát mappa és a beállítások ellenőrzése után. Bekötés nélkül a felület őszintén jelzi, hogy a fájlfeltöltés nem elérhető. A dalrendelés ettől függetlenül működik.

## Ellenőrzés élesítés előtt

Saját, felhasználható MP3-mal és egy képpel küldj teszt-ajánlatkérést. Ellenőrizd a privát almappát, mindkét levelet, a HU/EN nézetet és a megszakított feltöltés folytatását. Külön tesztelj WAV-ot és mobilos feltöltést. Ne tekints sikeresnek kérést a böngésző sikerüzenete és a tulajdonosi visszaigazolás előtt. A valós Microsoft kapcsolat/CORS és a levelezés csak a tulajdonosi bekötés után ellenőrizhető; a csomag tesztjei külső műveletek nélkül futnak.

## Működés és üzemeltetés

- Egy hangfájl, legfeljebb 200 MiB; legfeljebb négy kép, képenként 10 MiB. A feltöltés 5 MiB-os darabokban közvetlenül a OneDrive-ra megy. A Render csak kis JSON-kéréseket kezel. Az alkalmazás a fájlkiterjesztést, méretet és fejlécet is ellenőrzi; ez nem vírusvizsgálat.
- Az ügyfél időkorlátos, kizárólag az adott fájl feltöltésére használható URL-t és aláírt ajánlatkérési jegyet kap, tulajdonosi hozzáférési tokent és böngészhető mappalinket nem. Ezeket sem kell naplózni.
- Az eredeti fájlnevek a privát `request.json`-ban és a tulajdonosi levélben szerepelnek. Tárolás: audio.mp3/audio.wav, image-1 stb. A levélben privát tulajdonosi mappahivatkozás van; nincs nagy csatolmány.
- Origin-ellenőrzés, fájlkorlátok, egy szerverre érvényes legfeljebb napi 20 új kérés és konzervatív IP-korlát működik. Proxy mögött az utóbbi több látogatót közösen is korlátozhat. Forgalomnövekedéskor megbízható proxybeállítás és botvédelem szükséges. Nem támogatunk korlátlan feltöltést.
- Ha a levélküldés hibázik, a fájlok és a kérés megmaradnak; ugyanazon böngészőlapon folytatható. Idempotenciakulcs védi a leveleket ismétléskor. A mappában a `status`, `ownerSent`, `customerSent` mezők mutatják az állapotot. Az értesítési hiba nem jelenti az anyagok elvesztését.
- A megőrzési időket a tulajdonosnak kell érvényesítenie: félbehagyott feltöltés max. 7 nap; meg nem rendelt ajánlat 90 nap az utolsó egyeztetés után; átadott munka forrásanyaga 90 nap az átadás után. Hetente ellenőrizd és töröld a lejárt anyagokat a levelezési másolatokkal együtt, a szükséges bizonylatok kivételével. Nincs automatikus törlőfolyamat.
- Az ajánlatkérési anyagok további gyártási szolgáltatásba történő továbbítása előtt a szükséges adatkezelési tájékoztatást, jogosultságokat és szolgáltatói feltételeket ellenőrizni kell. Az ügyféloldali marketing nem nevezi meg az eszközöket.

## Referenciák

A saját csatorna „videóklip” keresésének teljes klipként megjelölt találatai: Három elmaradt szó; Álarc mögött; Emlékszem rád a jövőből; Nem tudok aludni; Tavaszi szél – Hazavisz; Amikor a világ lélegzik; Árad a Tisza. A rövid animációk és egyszerű dalvizuálok nincsenek hozzáadva. A linkek a `public/video-clips.js` refs tömbjében szerkeszthetők. A YouTube új lapon nyílik, nem indul el automatikusan.

Technikai hivatkozások: https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0 és https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code


## 2.3.1 javítás

A felirat és a szájszinkron egymást kizáró, opcionális extrák. Egyetlen választómező: nincs extra / felirat / szájszinkron. A szerver a kettős választást elutasítja. A dalszöveg bemásolása továbbra is külön, opcionális alkotói segítség, nem feliratmegrendelés.
