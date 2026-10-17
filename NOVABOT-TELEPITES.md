# EnZenem 2.2.0 – NovaBot-chat, 2026. október 17.

## Mi készült el?

A robotra kattintva magyar/angol chatablak nyílik. A GPT-4.1 válaszolhat az oldalról és általános kérdésekre. Az árak közvetlenül a fizetési modul árlistájából, a feltételek a helyi ÁSZF-ből kerülnek a tudásába. Nincs internetes keresése, rendeléslekérdezése, fizetési vagy levélküldési jogosultsága. A chatválasz nem kötelező érvényű egyedi ajánlat.

Felolvasás: az utolsó válasz külön gombbal felolvasható, másik gombbal leállítható. A böngésző beszédszintézisét használja, nincs OpenAI-hangdíj és mikrofonhasználat. A hang elérhetősége böngésző-/eszközfüggő. Nincs automatikus beszéd vagy felugró köszöntő.

Külön hozzájárulás, beszélgetéstörlés, magyar/angol adatkezelési és ÁSZF-kiegészítés készült. Üzenetszöveget nem naplózunk. A felület csak memóriában tárol; frissítéskor törlődik. Az utolsó három kérdés-válasz pár megy az új kérdéssel az OpenAI-nak. A store:false nem zárja ki az OpenAI saját visszaélés-megelőzési naplózását.

## Telepítés a meglévő Render-szolgáltatásba

1. A ZIP mymusicf-main mappájának tartalmával frissítsd a projektet. Ne hozz létre új fizetési szolgáltatást.
2. A Render meglévő OPENAI_API_KEY környezeti változóját tartsd meg. A kulcs a szerveren marad, a böngésző nem kapja meg. Nem kell ide vagy a forrásba bemásolni.
3. Alapmodell gpt-4.1. Opcionálisan NOVABOT_MODEL=gpt-4.1. A NOVABOT_ENABLED=false csak a chatet kapcsolja ki. Alapesetben a meglévő kulccsal aktív.
4. A PUBLIC_URL a tényleges honlap címe legyen. Az enzenem.hu és www.enzenem.hu alapból engedélyezett. Egyedi Render-előnézeti címről tesztelve annak pontos originjét kell PUBLIC_URL-ként engedélyezni.
5. npm install, majd npm start a meglévő Render-beállítás szerint. A Viva-, e-mail-, Sheets- és számlázási környezeti változókat ne változtasd meg.
6. A teljes fájlcsere során törlendő a régi main.py is. GitHub-feltöltés önmagában nem törli a hiányzó fájlokat: ha ott még szerepel, távolítsd el. Node futtatásnál egyébként nem indul el.

## Költség- és terheléskorlátok

- 1200 karakter / kérdés; legfeljebb 9000 karakter beszélgetési előzmény és kérdés együtt, ezen felül a rögzített oldalismertető.
- Legfeljebb 600 kimeneti token / válasz, 20 másodperces API-időkorlát.
- 3 másodperc két kérés között; alapból 20 kérés / óra / szerver által látott hálózati cím. NOVABOT_HOURLY_LIMIT változtatható, maximum 100.
- Alapból 100 kérés / UTC-nap / Node-folyamat. NOVABOT_DAILY_LIMIT változtatható, maximum 1000. Maximum 3 párhuzamos AI-kérés.
- A korlátok szerveroldaliak, de memóriában élnek: szerverújraindításkor nullázódnak, több példánynál külön számolódnak. Nem jelentenek garantált dollárban meghatározott költségplafont.
- Proxy mögött több látogató ugyanazt az órás keretet használhatja. Ez szándékosan óvatos alapbeállítás: nem bízunk meg a látogató által hamisítható X-Forwarded-For fejlécben. Emiatt a napi 100-nál korábban is átmenetileg korlátozódhat a chat.
- Az API-kulcs vagy egyenleg hibája csak a chatet teszi elérhetetlenné, a rendelési folyamatot nem.

## Takarítás

Eltávolítva: inaktív Python/FastAPI mintaszerver és hamis Suno-linkek; nem használt Stripe SDK-függőség; kikapcsolt NovaBot-repülés, duplikált animációs CSS és automatikus TTS-próbák; régi generált-dal eredményblokk és annak JS-takarítása; nem hívott régi számlaszámláló-segédek. Az aktív számlaszámlálás megmaradt. A README most a jelenlegi működést írja le.

Megmaradt az enzenem-generate.js fájlnév, mert ez most a működő fizetésindító kód; nem generál dalt. A Sheets korábbi dalszöveg-/linkoszlopai megmaradtak az adatkompatibilitás miatt. A Suno és ChatGPT jogi említése megmaradt, mert a személyes alkotásban továbbra is használjátok őket.

## Ellenőrzések és korlátok

16 automatizált teszt sikeres (9 fizetési/adatellenőrzési + 7 chatteszt). A chatteszteknél helyettesített OpenAI-válasszal ellenőriztük a kérés szerkezetét, az adatkorlátokat, hibakezelést, eredetellenőrzést, órás/napi és párhuzamossági korlátokat. A sikeres teszt nem bizonyítja a valódi OpenAI-kulcs működését vagy a modell válaszainak pontosságát.

Az elkülönített magyar/angol fizetési próba ismét sikeres: ellenőrzés után két e-mail és számlamelléklet, eredeti brief a Sheets-naplóban; ismételt visszairányítás nem küld újabb levelet; hibás összeg nem teljesül. A paymentSecurity.js, sheetsLogger.js és render.yaml byte-ra azonos a 2.1.0 csomaggal. A teszt nem végzett valódi fizetést, levélküldést vagy számla-PDF-megjelenítést.

A JavaScript-szintaxis, HTML-be ágyazott scriptek és a korábbi új magyar/angol oldalszövegek ellenőrzése sikeres. Éles OpenAI-kapcsolat és böngészős vizuális ellenőrzés nem történt ebben a környezetben. Éles telepítés nem történt.

Telepítés után: nyisd meg a robotot HU/EN nyelven, próbálj csomagárat és általános kérdést, felolvasást és törlést; majd a tervezett próbarendeléssel ellenőrizd a Viva-visszatérést, a leveleket és a naplózást. A két dalt és a PDF-et továbbra is személyesen készítitek és külditek.

Források: saját forráskód, public/aszf.html, paymentSecurity.js; OpenAI API dokumentáció:
https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
https://developers.openai.com/api/docs/guides/your-data
https://openai.com/policies/data-processing-addendum/
