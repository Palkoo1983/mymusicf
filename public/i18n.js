/* EnZenem HU/ENG UI language switch – safe frontend-only patch */
(function(){
  'use strict';

  const STORAGE_KEY = 'enz-ui-lang';
  const DEFAULT_LANG = 'hu';
  const LANGS = new Set(['hu','en']);

  const EXACT_EN = {
    "Nyelvválasztó": "Language selector",
    "HU / ENG nyelvváltó": "HU / ENG language switch",
    "Nyelv": "Language",
    "Videó választó": "Video selector",
    "Valentin napi dalok": "Valentine songs",
    "Nőnapi dalok": "Women’s Day songs",
    "További referenciák": "More references",
    "Lejátszás": "Play",
    "Megállít": "Stop",
    "Személyre szabott dalok – egyedi ajándék bármilyen különleges alkalomra": "Personalized songs – a unique gift for any special occasion",
    "Az Ajándék, amit nem kell magyaráznod!": "The gift you don’t have to explain!",
    "Egy személyre szabott dal, ami róla, rólatok szól – akár 6 órán belül.": "A personalized song about them, about you – delivered in as little as 6 hours.",
    "A Te történetedből születik meg a dal, amely örök emlék marad": "Your story becomes a song that lasts forever",
    "Bemutatkozás": "About us",
    "Árak / Csomagok": "Prices / Packages",
    "Árak & Csomagok": "Prices & Packages",
    "Hogyan működik": "How it works",
    "Hogyan működik?": "How does it work?",
    "Megrendelés": "Order",
    "Referenciák": "References",
    "Kapcsolat": "Contact",
    "Professzionális, személyre szabott dalokat készítünk": "We create professional, personalized songs",
    "esküvőkre": "for weddings",
    "születésnapokra": "birthdays",
    "búcsúztatókra": "farewells",
    "céges eseményekre": "corporate events",
    "és bármilyen alkalomra! Minden dal a te történetedből születik – érzelemmel, pont úgy, ahogy megélted és olyan stílusban, amilyenben csak szeretnéd!Itt mindig Te vagy a főszereplő, ahol a Történeted a szívedből indul el! A dal pontosan olyan stílusban készül, amilyet szeretnél – pop, rap, R&B, lírai vagy elektronikus. Ha különleges és megható ajándékot keresel, a saját történetből készült dal az egyik legerősebb és legmaradandóbb ajándék ötlet.": "and any special occasion! Every song is born from your story – with emotion, exactly as you lived it, in any style you want. Here, you are always the main character, and your story starts from the heart. The song is made in the exact style you choose – pop, rap, R&B, lyrical, or electronic. If you are looking for a special and moving gift, a song made from a personal story is one of the strongest and most lasting gift ideas.",
    "Ez NEKED való, ha…": "This is for you if…",
    "ha szuper egyedi, születésnapi, valentin napi vagy bármilyen alkalomra, ajándékot keresel": "you are looking for a truly unique birthday, Valentine’s Day, or special-occasion gift",
    "már mindene megvan, és valami igazán személyeset adnál": "they already have everything, and you want to give something truly personal",
    "nem tárgyat, hanem emléket szeretnél ajándékozni": "you want to give a memory, not just another object",
    "fontos, hogy ne legyen kínos vagy „mű” érzésű": "you want it to feel natural, not awkward or artificial",
    "Nézd meg, milyen hatást váltott ki egy saját dalom, amit anyukámnak írtam:": "See the reaction to a personal song I wrote for my mother:",
    "Kézbesítés:": "Delivery:",
    "48 óra": "48 hours",
    "48 órán belül": "within 48 hours",
    "(alap), akár": "(standard), or even within",
    "24 órán": "24 hours",
    "6 órán": "6 hours",
    "vagy": "or",
    "belül is! A 6 órás kézbesítési idő, csak reggel": "! 6-hour delivery is available only for orders placed between",
    "8:00 és este 20:00": "8:00 AM and 8:00 PM",
    "óra között leadott megrendelések esetén lehetséges!": ".",
    "Biztonságos fizetés: Visa / MasterCard – hivatalos VIVA WALLET": "Secure payment: Visa / MasterCard – official VIVA WALLET",
    "terminál.": "terminal.",
    "Garantált, egyedi zeneszám és kézbesítési idő vagy": "Guaranteed unique song and delivery time, or",
    "100% pénzvisszatérítés!": "100% money-back guarantee!",
    "Az elkészült dalodat": "You will receive your finished song by",
    "email-ben": "email",
    "kapod meg, amit a megrendelés fülön megadott email címre küldünk el!": "at the address you enter on the order form!",
    "Bejegyzett magyar vállalkozás!": "Registered Hungarian business!",
    "SSL tanúsítványos weboldal.": "SSL-secured website.",
    "🎵 A dalok hossza általában": "🎵 Songs are usually",
    "2–4 perc": "2–4 minutes long",
    ", a választott stílustól és a megadott": ", depending on the chosen style and the detail of your",
    "Leírás": "Description",
    "részletességétől függően.": "field.",
    "Ha az első dalod mellett szeretnél egy második számot is, akkor csupán": "If you would like a second version of your song, we can create it for only",
    "3000 Ft": "3,000 HUF",
    "kedvezményes díjért elkészítjük az egyedi zeneszámod 2. változatát is, ugyanazzal a szöveggel és stílussal, csak stíluson belül más elemekkel, más hangszereléssel! Csak írj egy levelet arról az email címről, amelyről az első dalrendelést is leadtad, utald el az összeget a": "as a discounted extra: same lyrics and style, but with different arrangement details within the style. Just send us an email from the same address you used for the first order, transfer the amount to",
    "bankszámlaszámra, és": "bank account, and",
    "megkapod az új hangszerelésű dalodat, Közlemény rovat: az email címedet írd be!": "you will receive your newly arranged song within 48 hours. Please write your email address in the payment note.",
    "Kattints ide: Hogyan működik →": "Click here: How it works →",
    "Visszajelzések": "Reviews",
    "Néhány friss üzenet tőletek – jobbra/balra görgethető.": "A few recent messages from you – scroll left/right.",
    "Előző vélemény": "Previous review",
    "Következő vélemény": "Next review",
    "Visszajelzések görgethető lista": "Scrollable reviews list",
    "GYIK": "FAQ",
    "Mennyi idő alatt készül el a dal?": "How long does it take to make the song?",
    "Alapból 48 órán belül készül el, de kérhetsz 24 órás vagy 6 órás kézbesítést is (felárért).": "Standard delivery is within 48 hours, but you can also choose 24-hour or 6-hour delivery for an extra fee.",
    "Mit kell megadnom a rendelésnél?": "What do I need to provide when ordering?",
    "Pár mondat is elég: kinek szól a dal, milyen alkalomra készül, milyen stílusban szeretnéd, és milyen hangulatot kérsz. Minél több sztorit írsz, annál személyesebb lesz.": "A few sentences are enough: who the song is for, the occasion, the style, and the mood you want. The more stories you share, the more personal the result will be.",
    "Lehet-e név nélkül dalt kérni?": "Can I order a song without using names?",
    "Igen. Ha azt szeretnéd, hogy a dalból „ki lehessen találni”, csak írd be a leírásba, hogy a nevek NE szerepeljenek.": "Yes. If you want the listener to “figure it out” from the song, simply write in the description that names should NOT be included.",
    "Kaphatok több verziót ugyanarra a szövegre?": "Can I get multiple versions of the same lyrics?",
    "Igen. A 2. változat kedvezményesen kérhető (3000 Ft), ugyanazzal a szöveggel, csak más hangszereléssel / stíluson belüli variációval.": "Yes. A second version is available at a discounted price (3,000 HUF), with the same lyrics but a different arrangement or variation within the style.",
    "Milyen formátumban kapom meg?": "What format will I receive?",
    "A kész dalt e‑mailben küldjük: alapból MP3, és ha a csomagod tartalmazza, kérhető videós (MP4) vagy más formátum is.": "We send the finished song by email: MP3 by default, and video (MP4) or other formats are available if included in your package.",
    "Tudok módosítást kérni?": "Can I request changes?",
    "Abban a dalban, amit elkészítettünk már nem lehetséges a módosítás, technikai okok miatt, viszont a 2., 3000 forintos dalban tudunk apróbb módosításokat elvégezni és igyekszünk mindent úgy megoldani, hogy elégedett legyél az eredménnyel, mert szeretnénk, hogy mindig visszatérj hozzánk!": "For technical reasons, the song already created cannot be modified. However, in the second 3,000 HUF version we can make small adjustments, and we do our best to make sure you are happy with the result — because we want you to come back again.",
    "Kapok számlát?": "Will I receive an invoice?",
    "Igen, a fizetés után automatikusan küldjük a számlát a megadott e‑mail címre.": "Yes, after payment the invoice is automatically sent to the email address you provide.",
    "Mitől más ez, mint egy ingyenes AI zenegenerátor?": "How is this different from a free AI music generator?",
    "Az EnZenem nem sablonokból dolgozik: a szöveg a te történetedre épül, és emberi kreativitás + technológia közös munkája. Kifejezetten magyar nyelvre optimalizálva készül, ezért természetesebb, pontosabb és érzelmileg „betalálóbb”, mint a tipikus, általános (sokszor angolra hangolt) ingyenes generátorok eredménye;Maximum próbaként ingyenes és ekkor egy gyengébb zene generálás történik, egyéb esetben azok sem ingyenesek, sőt ilyen minőségben drágábbak is. Röviden: nem csak „AI-dal”, hanem egyedi, kézzel készített szöveg, egy személyre szabott élmény. A puding próbája az evés: próbáld ki nyugodt szívvel, mert nem fogsz csalódni, főleg akkor ha minőségre vágysz, nem sablonra.": "EnZenem does not work from generic templates: the lyrics are built around your story, combining human creativity with technology. It is optimized for natural, emotionally accurate results, not generic machine-made output. In short: it is not just an “AI song”, but a custom-written, personalized musical experience. Try it with confidence — especially if you want quality, not a template.",
    "Biztonságos a fizetés?": "Is payment secure?",
    "Igen. Bankkártyás fizetés Viva Wallet VPOS terminálon keresztül történik.": "Yes. Card payments are processed through the Viva Wallet VPOS terminal.",
    "Akció — 30% kedvezmény": "Sale — 30% discount",
    "Akció — 30%": "Sale — 30%",
    "Magas minőségű, univerzális zenei formátum. Minden eszközön lejátszható.": "High-quality, universal audio format. Plays on every device.",
    "Alap csomag": "Basic package",
    "Egyszerű, ízléses, statikus": "Simple, elegant, static",
    "videóklip": "music video",
    "a zenéhez, felirattal.": "for the song, with captions.",
    "Videó csomag": "Video package",
    "Stúdióminőség, veszteségmentes hang. Ajánlott hangtechnikához.": "Studio-quality, lossless audio. Recommended for sound systems.",
    "Prémium csomag": "Premium package",
    "Csomagválasztás": "Choose a package",
    "– válaszd ki a kívánt formátumot:": "– choose the format you want:",
    "Kézbesítési idő kiválasztása": "Choose delivery time",
    "– alapértelmezett": "– standard delivery is",
    ", de kérheted akár": ", but you can also request",
    "belül is.": "delivery.",
    "Megrendelő űrlap kitöltése": "Fill out the order form",
    "– add meg az adatokat és a": "– enter your details and fill in the",
    "mezőt töltsd ki részletesen.": "field in detail.",
    "Fizetés": "Payment",
    "– biztonságos bankkártyás fizetés (Visa / MasterCard, VPOS terminál).": "– secure card payment (Visa / MasterCard, VPOS terminal).",
    "Kézbesítés": "Delivery",
    "– az elkészült, professzionális dalodat e-mailben küldjük, a megadott kézbesítési idő szerint.": "– we send your finished professional song by email within the selected delivery time.",
    "Fontos tudnivalók:": "Important notes:",
    "Stílus:": "Style:",
    "bármilyen műfaj választható – akár 2–3 stílus is keverhető (pl. pop + rap + akusztikus).": "you can choose any genre — even mix 2–3 styles (for example pop + rap + acoustic).",
    "Ének:": "Vocals:",
    "férfi, női, gyermek, duett, kórus, gospel vagy akár robot hang is elérhető. Instrumetális változatban is kérheted!": "male, female, child, duet, choir, gospel, or even synthetic/robot vocals are available. You can also request an instrumental version.",
    "Nyelv:": "Language:",
    "bármilyen nyelven kérheted, de a": "you can request any language, but please fill in the",
    "mezőt mindig az adott nyelven töltsd ki!": "field in the selected language.",
    "Leírás mező:": "Description field:",
    "írd le saját szavaiddal, milyen dalt szeretnél, kinek készül, milyen alkalomra, és minél több személyes emléket, részletet, érzelmet adj meg – így lesz igazán egyedi a dalod!": "describe in your own words what kind of song you want, who it is for, the occasion, and as many personal memories, details, and emotions as possible — that is what makes the song truly unique.",
    "Nézd meg a robot-narrációs oktatóvideót a stílus és leírás mezők használatáról:": "Watch the robot-narrated tutorial video about using the style and description fields:",
    "Minta leírások:": "Example descriptions:",
    "🎂 Szülinap": "🎂 Birthday",
    "💍 Esküvő": "💍 Wedding",
    "💞 Évforduló": "💞 Anniversary",
    "🕯️ Búcsúztató": "🕯️ Farewell",
    "🏢 Céges rendezvény": "🏢 Corporate event",
    "🧸 Gyerekdal": "🧸 Children’s song",
    "🎓 Nyugdíj": "🎓 Retirement",
    "❤️‍🩹 Jobbulást": "❤️‍🩹 Get well soon",
    "💎 Lánykérés": "💎 Proposal",
    "🎓 Ballagás/Diploma": "🎓 Graduation/Diploma",
    "Nyissuk meg az űrlapot": "Open the order form",
    "Csomag (fizetés bankkártyával: Visa vagy MasterCard)": "Package (payment by Visa or MasterCard)",
    "Alap (MP3)": "Basic (MP3)",
    "Videó csomag (MP4)": "Video package (MP4)",
    "Prémium (WAV)": "Premium (WAV)",
    "Kézbesítési idő (6 órás kézbesítés csak reggel 8:00 és este 20:00 között lehetséges!)": "Delivery time (6-hour delivery is only available between 8:00 AM and 8:00 PM!)",
    "48 óra (alap)": "48 hours (standard)",
    "24 óra (+3 000 Ft)": "24 hours (+3,000 HUF)",
    "6 óra (+6 500 Ft)": "6 hours (+6,500 HUF)",
    "Dal címe (opcionális)": "Song title (optional)",
    "E-mail (ahová a számlát és zenét küldjük)": "Email (where we send the invoice and the song)",
    "Céges számlát kérek": "I need a company invoice",
    "Cégnév": "Company name",
    "Adószám": "Tax number",
    "Számlázási cím": "Billing address",
    "Zenei stílus (írható is)": "Music style (you can type your own)",
    "Romantikus pop": "Romantic pop",
    "Lírai ballada": "Lyrical ballad",
    "Modern elektronikus": "Modern electronic",
    "Metál": "Metal",
    "Alternatív": "Alternative",
    "Gyerekdal": "Children’s song",
    "Akusztikus": "Acoustic",
    "Lírai": "Lyrical",
    "Romantikus": "Romantic",
    "Karácsonyi pop": "Christmas pop",
    "Ünnepi akusztikus": "Festive acoustic",
    "Ének": "Vocals",
    "Női": "Female",
    "Férfi": "Male",
    "Vegyes (férfi és női duett)": "Mixed (male and female duet)",
    "Gyermek ének": "Child vocal",
    "„Gépi”/szintetikus ének": "Synthetic/robot vocal",
    "Kórus": "Choir",
    "Gospel kórus": "Gospel choir",
    "Instrumentális (ének nélkül)": "Instrumental (no vocals)",
    "Nyelv (pl. magyar, angol, német, holland, stb.. )": "Song language (e.g. Hungarian, English, German, Dutch, etc.)",
    "Nyelv (pl. magyar, angol, német, holland, stb..)": "Song language (e.g. Hungarian, English, German, Dutch, etc.)",
    "Leírás / a választott nyelven töltsd ki, minél részletesebben! (min.:120, max.:4000 karakter)": "Description / fill it in in the selected song language, with as much detail as possible! (min. 120, max. 4000 characters)",
    "Beleegyezem, hogy az adataimat a megrendelés feldolgozásához felhasználjátok. (Részletek:": "I agree that my data may be used to process the order. (Details:",
    "Adatkezelés": "Privacy Policy",
    "ÁSZF": "Terms",
    "Megrendelés leadása": "Submit order",
    "Fizetés: előre. A megrendelés gomb megnyomásával átirányítunk a fizetési terminálra. Amennyiben sikeres a fizetés, csak akkor kapjuk meg a megrendelést.": "Payment is made in advance. After clicking the order button, you will be redirected to the payment terminal. We receive the order only after successful payment.",
    "Elérhetőségek": "Contact details",
    "Név: Gombkötő Pál e.v.": "Name: Gombkötő Pál sole proprietor",
    "Adószám: 91555179-1-43": "Tax number: 91555179-1-43",
    "Honlap: www.enzenem.hu": "Website: www.enzenem.hu",
    "E-mail:": "Email:",
    "Székhely: 1097 Budapest Aszódi utca 8. 123.": "Registered office: 1097 Budapest, Aszódi utca 8. 123.",
    "Számlaszám: 10918001-00000134-59510006": "Bank account: 10918001-00000134-59510006",
    "Név": "Name",
    "Üzenet": "Message",
    "Üzenet küldése": "Send message",
    "Miért tökéletes ajándék a személyre szabott dal?": "Why is a personalized song the perfect gift?",
    "Ha különleges, egyedi ajándékot keresel születésnapra, évfordulóra, esküvőre vagy bármilyen ünnepi alkalomra, a személyre szabott dal az egyik legmeghatóbb és legemlékezetesebb ajándék ötlet. A dal teljesen a megajándékozott történetére, stílusára és érzelmeire épül – így valóban egyedi és örök emlék marad.": "If you are looking for a special, unique gift for a birthday, anniversary, wedding, or any celebration, a personalized song is one of the most moving and memorable gift ideas. The song is built entirely around the recipient’s story, style, and emotions — making it truly unique and unforgettable.",
    "Hogyan készül a személyre szabott dal?": "How is a personalized song created?",
    "A dalgyártás teljes folyamata a Te megadott részleteidre épül: történet, érzelmek, stílus, hangulat és esemény típusa. A készítés során modern zenei technológiát és professzionális hangszerelést használunk, így garantáljuk, hogy minden dal egyedi, minőségi és érzelemdús legyen. A végeredmény egy teljes értékű zeneszám, amely pontosan úgy szól, ahogyan elképzelted.": "The whole song-making process is based on the details you provide: story, emotions, style, mood, and occasion. We use modern music technology and professional arrangement, so every song is unique, high-quality, and emotionally rich. The result is a complete song that sounds exactly the way you imagined.",
    "Esküvői dal, születésnapi dal és meglepetés dal rendelés": "Order a wedding song, birthday song, or surprise song",
    "Az EnZenem.hu-n lehetőséged van személyre szabott esküvői dal, születésnapi dal, ballagási dal vagy meglepetés dal rendelésére. A dalok átlagosan 2–4 percesek, és stílusban teljes mértékben alkalmazkodnak a kívánságodhoz. Akár romantikus, akár vidám, akár megható dalra vágysz – megalkotjuk a Te történeted zenei változatát.": "On EnZenem.hu, you can order a personalized wedding song, birthday song, graduation song, or surprise song. Songs are usually 2–4 minutes long and fully adapted to the style you request. Whether you want something romantic, cheerful, or deeply emotional — we turn your story into music.",
    "Köszönjük!": "Thank you!",
    "Üzeneted elküldtük. Hamarosan válaszolunk.": "Your message has been sent. We will reply soon.",
    "Bezárás": "Close",
    "Elkészült! Itt a két dal:": "Done! Here are the two songs:",
    "Elfogadott kártyatípusok:": "Accepted card types:",
    "© 2025 EnZenem – Minden jog fenntartva.": "© 2025 EnZenem – All rights reserved.",
    "Az oldal használatával elfogadod az": "By using this site, you accept the",
    "és az": "and the",
    "feltételeit.": "conditions.",
    "Elfogadom": "Accept",
    "NovaBot hang nem elérhető itt.": "NovaBot voice is not available here.",
    "Megnyitás böngészőben": "Open in browser",
    "Néma mód": "Silent mode",
    "EnZenem – arany bakelit": "EnZenem – golden vinyl",
    "EnZenem – ügyfélvideó": "EnZenem – customer video",
    "EnZenem – oktatóvideó (robot narráció)": "EnZenem – tutorial video (robot narration)",
    "pl. Budai csillag": "e.g. Budapest Star",
    "pelda@domain.hu": "example@domain.com",
    "Cégnév Kft.": "Company Ltd.",
    "Irányítószám, város, utca, házszám": "Postal code, city, street, house number",
    "pl. pop / rock / minimal techno / house / romantikus": "e.g. pop / rock / minimal techno / house / romantic",
    "pl. magyar / angol / német / holland / stb..": "e.g. Hungarian / English / German / Dutch / etc.",
    "Milyen történetet, érzést, üzenetet közvetítsen a dal? Írd le az emlékeiteket, milyen az a személy(ek) akinek a dal íródik. Esküvőre a kettőtök történetét, születésnapra a személy tulajdonságait, életkorát, stb..": "What story, feeling, or message should the song express? Describe your memories and the person or people the song is for. For a wedding, write your story as a couple; for a birthday, describe the person’s qualities, age, and special moments.",
    "Miben segíthetünk?": "How can we help?",
    "Fizetés indítása...": "Starting payment...",
    "Hiba: nem sikerült elindítani a fizetést.": "Error: payment could not be started.",
    "Nem sikerült elindítani a fizetést.": "Payment could not be started.",
    "Hiba történt a fizetés indításakor.": "An error occurred while starting payment.",
    "A megrendelést megszakítottad.": "You cancelled the order.",
    "Küldés...": "Sending...",
    "Köszönjük! Hamarosan válaszolunk.": "Thank you! We will reply soon.",
    "Nem sikerült elküldeni. Próbáld újra később.": "Could not send the message. Please try again later.",
    "Kérlek add meg a nyelvet.": "Please enter the song language.",
    "Kérlek írj legalább 120 karaktert a leírásba.": "Please write at least 120 characters in the description.",
    "A Leírás túl rövid. Kérlek, adj több támpontot (kinek, alkalom, stílus, kulcsszavak, emlékek), hogy személyre szabhassuk a dalt.": "The description is too short. Please add more details: recipient, occasion, style, keywords, and memories, so we can personalize the song.",
    "Elfogadható": "Acceptable",
    " — Elfogadható": " — Acceptable",
    "Minta": "Example",
    "🎂 Nóra – születésnap": "🎂 Nóra – birthday",
    "❤️ Bence – évforduló": "❤️ Bence – anniversary",
    "🎓 Tamás – diploma": "🎓 Tamás – diploma",
    "💍 Kata & Máté – esküvő": "💍 Kata & Máté – wedding",
    "💞 Anna – lánykérés": "💞 Anna – proposal",
    "👋 Zoli – búcsúztató": "👋 Zoli – farewell",
    "🏢 András – céges rendezvény": "🏢 András – corporate event",
    "🧒 Lili – gyerekdal": "🧒 Lili – children’s song",
    "🌷 Névnapra": "🌷 Name day",
    "🌸 Eszter – jobbulás": "🌸 Eszter – get well soon",
    "☕ Feri – nyugdíj": "☕ Feri – retirement",
    "🎁 Ünnepi dal": "🎁 Holiday song"
  };

  // Long customer reviews. Song titles and names are mostly kept as titles/names, not forcibly translated.
  Object.assign(EXACT_EN, {
    "Mikulásdalt kértünk a cégünk gyerekeinek (10 gyerek) úgy, hogy csak a tulajdonságaikat adtuk meg a dalokban, kérve, hogy a neveik ne legyenek benne, hanem ki kelljen találni a dalból. Egyszerűen fantasztikus lett: gyereknyelven írva, gyermekien humoros és klassz, mikulásos refrénekkel megfűszerezve. Csakis ajánlani tudjuk, mert professzionális dal volt és biztosan kérünk még dalt, annyira meg voltunk elégedve. Köszönjük enzenem.hu.": "We ordered Santa songs for the children at our company — 10 kids — using only their personality traits and asking that their names not be included, so they would have to guess from the song. It turned out simply fantastic: written in children’s language, playful, funny, and full of great Santa-themed choruses. We can only recommend EnZenem.hu. The song was professional, and we will definitely order again.",
    "Karácsonyra kértünk dalt, a családnak. Pár mondatban leírtuk milyen a család karácsonykor és kértük, hogy vicces legyen. Még szerencse, hogy nem kazettán jött, mert azóta is azt hallgatjuk, minden percben valószínűleg a szalag már nem bírta volna 😊. Rokonok azt hitték százezreket adtunk egy ilyen profi dalért, pedig 10 500 forintba került. Nagyon értik a humort, köszönjük enzenem.hu, felejthetetlenné tettétek a karácsonyt!": "We ordered a Christmas song for the family. We described in a few sentences what our family is like at Christmas and asked for it to be funny. Good thing it didn’t arrive on cassette, because we have been listening to it nonstop — the tape would probably have worn out by now 😊. Relatives thought we had paid hundreds of thousands for such a professional song, but it cost 10,500 HUF. You really understand humor. Thank you, EnZenem.hu — you made Christmas unforgettable!",
    "A szerelmemnek, Flórának kértem egy eljegyzési dalt. A budai várban kértem meg a kezét és kértem, legyen benne a dalba és tényleg egy lánykérés legyen a közös emlékeinkkel. Nem vagyok benne biztos, hogy a gyűrűnek vagy a dalnak örült jobban, de az biztos, hogy ilyen boldognak régen láttam és szerencsére igent is mondott, bár tudom ez nekem szól, de egyértelműen a dal csak fokozta az érzelmeinket, mert férfi létemre is azt mondom, valami gyönyörű lett, nem csak Flóra, de az én szívemhez is eljutott. Köszönjük!": "I ordered a proposal song for my love, Flóra. I proposed to her in Buda Castle and asked for that moment and our shared memories to be part of the song. I am not sure whether she loved the ring or the song more, but I had not seen her that happy in a long time — and luckily she said yes. I know I am biased, but the song clearly intensified our emotions. As a man, I can still say it turned out beautiful; it reached not only Flóra’s heart, but mine too. Thank you!",
    "A fiamnak kértünk dalt, a 15. szülinapjára. A K-pop-ot szereti, amit igazából azt sem tudjuk micsoda, de ezt írtuk a megrendelésbe, meg leírtük, hogy biztató dal legyen. A fiúnk épp a tini dac korszakában van, emiatt kb. semminek sem örül, de miközben hallgatta a dalt, még egy mosolyt is láttunk az arcán, de a legfontosabb, hogy nem mondta azt rá, hogy K@ki, mint ahogy semmi sem tetszik neki. Szóval enzenem, hihetetlenek vagytok, nem nagyon hittünk benne, de rendelünk még tőletek és nagyon, nagyon köszönjük azt a kis mosolyt 😊": "We ordered a song for our son’s 15th birthday. He likes K-pop — we honestly don’t even know what that really is — but we wrote it in the order and asked for an encouraging song. Our son is in that teenage phase where he hardly likes anything, but while listening to the song we actually saw a small smile on his face. Most importantly, he did not call it “trash”, which is what he says about almost everything. EnZenem, you are unbelievable. We didn’t really believe it would work, but we will order again. Thank you so much for that little smile 😊",
    "A tesóimnak kértem dalt, két idősebb Nővérem van és messze élnek, nem Magyarországon és szerettem volna jelezni nekik, hogy ha távol vannak is, én mindig gondolok rájuk és nagyon fontosak nekem. Rendeltem már dalt, a férjemnek, egy másik oldaltól is és az is jó volt, de amit az enzenem.hu -tól rendeltem, az annyira betalált, hogy én is és a két Nővérem is, sírtunk az örömtől és annyira hálásak voltak, tényleg. Biztosan kérek még a családnak számot, de csak is innen! Köszönöm": "I ordered a song for my siblings — I have two older sisters who live far away, outside Hungary. I wanted to show them that even though they are far from me, I always think of them and they matter deeply to me. I had ordered a song for my husband from another site before, and that was good too, but the one I ordered from EnZenem.hu hit so deeply that my sisters and I all cried with joy. They were truly grateful. I will definitely order more songs for my family — only from here. Thank you.",
    "Elfogytak szavaim. Amikor megmutattam a páromnak a dalt, dalokat, szótlanul könnyeztük végig. Nem tudom eléggé megköszönni a figyelmességeteket, kedvességeteket és a munkátokat! Nem csalódtam bennetek! Végre értéket kaptam, kaptunk. Fogok máskor is hozzátok fordulni, azt garantálom! Igényes munka, személyre szabott szöveg és nagyon szép énekhang, éneklés és teljesen egybe van az egész! Kívánom, hogy munkátokban továbbra is örömötöket leljétek és biztos vagyok benne, hogy másoknak is igazi értéket adtok ezzel a tevékenységgel. Babér is végigcsóválta a dalokat és ne vegyétek zokon amiért megosztottam veletek az észrevételeim. Építő kritikaként tekintsetek rá!": "I have no words left. When I showed the song — the songs — to my partner, we listened in silence with tears in our eyes. I cannot thank you enough for your attention, kindness, and work. You did not disappoint us. Finally, we received real value. I will definitely come back to you again. The work is high-quality, the lyrics are personalized, the singing voice is beautiful, and everything comes together as one. I hope you continue to find joy in your work, and I am sure you are giving real value to others too. Babér wagged his tail through the songs as well — and please don’t take my comments the wrong way; see them as constructive feedback.",
    "Közös számot kértünk az évfordulónkra, ez volt a 7. év együtt. Sok mindent leírtunk és nem gondoltuk volna, hogy egy csodálatos, vicces és érzelmes vers születik meg a sorainkból és ennyire professzionális zenei alappal, énekkel és hogy ennyire betalál majd a dal. Ez volt a legolcsóbb ilyen oldal, amit találtunk és azt gondoltuk, olcsó húsnak, híg a leve, de kipróbáltuk, mert sok pénzt nem vesztünk vele és a referencia oldal is segített, mert abból már gondoltuk, itt nem lesz rossz a minőség; nem hogy nem lett rossz, de kb. simán elmegy egy mostani slágernak és ott is a jobbak között van. Nem számoltuk már, hogy hányszor hallgattuk meg közösen a számot, meg a családot és barátokat is erre köteleztük (az elején nekik is nagyon tetszett 😊 ), de tényleg úgy érezzük, hogy a kapcsolatunk is még szorosabb lett, mert így összefoglalva az élményeinket, rájöttünk nem tudunk és nem is akarunk egymás nélkül élni. Tényleg köszönjük és mindenhol reklámozni fogjuk ezt az oldalt, mert tényleg elképesztően fantasztikus, amit csináltok!": "We ordered a song together for our anniversary — our 7th year together. We wrote down many things, but we never imagined that our words would become such a beautiful, funny, emotional set of lyrics with such a professional musical base and vocals, or that the song would hit us so strongly. This was the cheapest site we found, and we wondered whether the quality would suffer, but the references helped us trust it. It didn’t just turn out good — it could easily pass as a current hit, and one of the better ones. We stopped counting how many times we listened to it together, and we made our family and friends listen too. It really made us feel closer, because hearing our memories summed up like this reminded us that we cannot and do not want to live without each other. Thank you. We will recommend this site everywhere, because what you do is truly amazing!"
  });

  Object.assign(EXACT_EN, {
    "A nővéremnek, Nórának szeretnék születésnapi dalt. 46 éves, és mindig is imádta a táncolós zenéket. Emlékszem, amikor a nappaliban táncoltunk a kedvenc számaira, és mindenki nevetett. Jó lenne, ha a dalban benne lenne az a nyári este is, amikor együtt túráztunk a Csóványoson, és végignevettük az éjszakát.": "I would like a birthday song for my sister, Nóra. She is 46 and has always loved danceable music. I remember when we danced in the living room to her favorite songs and everyone laughed. I would love the song to include that summer evening when we hiked together on Csóványos and laughed through the night.",
    "Kata és Máté esküvőjére szeretnék egy romantikus dalt. Az első közös balatoni nyaralásukon ismerkedtek meg igazán, amikor eláztak a viharban, de táncoltak a parton. A lánykérés Toszkánában volt, naplementében, a dombtetőn – ezt az érzést szeretném viszont hallani a dalban.": "I would like a romantic song for Kata and Máté’s wedding. They truly got to know each other during their first trip together to Lake Balaton, when they got caught in a storm but danced on the shore. The proposal happened in Tuscany, at sunset on a hilltop — I would love to hear that feeling in the song.",
    "A házassági évfordulónkra szeretném meglepni a férjemet, Bencét, egy dallal. Az első randinkon eltévedtünk a Városligetben, és végül a padon ettük meg a fagyit nevetve. A másik emlék, amikor a lakásfelújítás közben pizzát ettünk a padlón ülve, és sírtunk a nevetéstől.": "I would like to surprise my husband, Bence, with a song for our wedding anniversary. On our first date we got lost in Városliget, then ended up eating ice cream on a bench while laughing. Another memory is when we sat on the floor during home renovation, eating pizza and crying from laughter.",
    "Egy kedves kollégánknak, Zolinak szeretnék dalt a csapat nevében, a temetésére. Ő volt az, aki mindig jókedvet hozott az irodába. Egyszer, amikor elromlott a nyomtató, egy gémkapoccsal és kávéval oldotta meg. A másik pillanat, amikor karácsony előtt mindenkinek sütit hozott, és mindenki nevetett.": "I would like a song for our dear colleague, Zoli, on behalf of the team, for his funeral. He was the one who always brought good mood into the office. Once, when the printer broke, he fixed it with a paperclip and coffee. Another memory is when he brought cookies for everyone before Christmas and made everybody laugh.",
    "A munkahelyi évzárónkra kérek egy dalt. Volt egy közös projektünk Andrással, ahol éjszakába nyúlóan dolgoztunk, de közben zenét hallgattunk és táncoltunk. A másik emlék, amikor megnyertük a céges versenyt, és pezsgővel öntöttük le a főnököt – ezt a hangulatot szeretném viszont hallani.": "I would like a song for our company year-end event. We had a project with András where we worked late into the night, but listened to music and danced while working. Another memory is when we won the company competition and accidentally covered the boss with champagne — I would like the song to capture that mood.",
    "A hatéves kislányomnak, Lilinek szeretnék egy születésnapi dalt. Minden reggel a tükör előtt táncol a hajkefével a kezében, és saját dalt énekel. A másik kedvenc történetünk, amikor a parkban biciklizett, elesett, majd felállt és azt mondta: „Semmi baj, anya, a hősök nem sírnak!”": "I would like a birthday song for my six-year-old daughter, Lili. Every morning she dances in front of the mirror with a hairbrush in her hand and sings her own song. Another favorite memory is when she was cycling in the park, fell down, then got back up and said: “It’s okay, Mom, heroes don’t cry!”",
    "Egy kedves kollégának, Ferinek kérek dalt a nyugdíjba vonulása alkalmából. Ő volt az, aki minden hétfő reggel kávét vitt mindenkinek, és mindig azt mondta: „Ez is csak egy új kezdet.” Egyszer a céges kiránduláson ő szervezte meg a karaoke estét, és senki nem felejti el, ahogy Elvis Presley-t énekelt.": "I would like a song for our dear colleague, Feri, on the occasion of his retirement. He was the one who brought coffee to everyone every Monday morning and always said: “This is just a new beginning.” Once, on a company trip, he organized the karaoke night, and no one will ever forget him singing Elvis Presley.",
    "A barátnőmnek, Eszternek szeretnék jobbulást kívánni egy dallal. Amikor a kórházban volt, nevetve mondta, hogy ha jobban lesz, elmegyünk táncolni, mint régen. A másik emlék, amikor eltévedtünk a Balaton-felvidéken, de az volt az egyik legszebb napunk – szeretném, ha a dal erőt és vidámságot adna neki.": "I would like to wish my friend Eszter a speedy recovery with a song. When she was in hospital, she laughed and said that once she gets better, we will go dancing like we used to. Another memory is when we got lost in the Balaton Highlands, but it became one of our most beautiful days — I would like the song to give her strength and joy.",
    "A lánykérésemhez szeretnék dalt, mert Párizsban fogom megkérni Anna kezét az Eiffel-torony előtt. Az első közös utunk is ide vezetett, akkor még csak barátok voltunk. A másik pillanat, amikor először táncoltunk az esőben a Montmartre lépcsőin – ez biztosan beleillene a dalba.": "I would like a song for my proposal, because I will ask Anna to marry me in Paris in front of the Eiffel Tower. Our first trip together was also there, back when we were just friends. Another moment was when we first danced in the rain on the steps of Montmartre — that should definitely be part of the song.",
    "A fiamnak, Tamásnak kérek dalt a diplomaosztójára. Emlékszem, ahogy éjszakákon át tanult a konyhaasztalnál, és kávéval próbált ébren maradni. A másik pillanat, amikor gyerekként azt mondta: „Anya, egyszer nagy ember leszek” — és most tényleg az lett.": "I would like a song for my son Tamás’s graduation. I remember him studying through the nights at the kitchen table, trying to stay awake with coffee. Another memory is when, as a child, he said: “Mom, one day I’ll become someone great” — and now he truly has.",
    "Karácsonyra szeretnék egy dalt a családomnak. Minden évben együtt díszítjük a fát, anya sütit süt, apa meg énekel, mi pedig táncolunk. A másik emlék, amit a dalban hallanék, amikor szilveszterkor nevetve táncoltunk a nappaliban, és mindenki boldog volt.": "I would like a Christmas song for my family. Every year we decorate the tree together, Mom bakes cookies, Dad sings, and we dance. Another memory I would love to hear in the song is when we danced in the living room on New Year’s Eve, laughing, and everyone was happy."
  });

  const DYNAMIC_RULES = [
    [/^Megrendelés\s*–\s*(.+)$/i, m => `Order – ${m[1].replace(/Ft/g,'HUF')}`],
    [/^6 óra \(\+6 500 Ft\) – csak 08:00–20:00 között$/i, () => '6 hours (+6,500 HUF) – only between 08:00 and 20:00'],
    [/^Minta\s+(\d+)$/i, m => `Example ${m[1]}`]
  ];

  const ATTRS = ['placeholder','aria-label','title','label','alt','data-label','data-example','data-val'];
  const SKIP_TEXT_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA']);
  const SKIP_ATTR_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT']);

  function normalize(s){ return String(s ?? '').replace(/\s+/g, ' ').trim(); }
  function currentLang(){
    const saved = localStorage.getItem(STORAGE_KEY);
    return LANGS.has(saved) ? saved : DEFAULT_LANG;
  }
  function translateValue(original){
    const key = normalize(original);
    if (!key) return original;
    if (EXACT_EN[key]) return EXACT_EN[key];
    for (const [re, fn] of DYNAMIC_RULES){
      const m = key.match(re);
      if (m) return fn(m);
    }
    return original;
  }
  function withOriginalWhitespace(original, translated){
    const s = String(original ?? '');
    const lead = (s.match(/^\s*/) || [''])[0];
    const trail = (s.match(/\s*$/) || [''])[0];
    return lead + translated + trail;
  }
  function isUnderSkipped(node){
    let el = node.parentNode;
    while (el){
      if (el.nodeType === 1 && SKIP_TEXT_TAGS.has(el.tagName)) return true;
      el = el.parentNode;
    }
    return false;
  }

  function desiredText(node, lang){
    if (!node.__enzOrigText) node.__enzOrigText = node.nodeValue;
    const orig = node.__enzOrigText;
    const cur = node.nodeValue;
    const en = withOriginalWhitespace(orig, translateValue(orig));
    if (lang === 'en' && normalize(cur) && normalize(cur) !== normalize(orig) && normalize(cur) !== normalize(en)) {
      node.__enzOrigText = cur;
      return withOriginalWhitespace(cur, translateValue(cur));
    }
    return lang === 'en' ? en : orig;
  }

  function translateTextNodes(root, lang){
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node){
        if (!normalize(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        if (isUnderSkipped(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(node => {
      const next = desiredText(node, lang);
      if (node.nodeValue !== next) node.nodeValue = next;
    });
  }

  function translateAttrs(root, lang){
    if (!root || !root.querySelectorAll) return;
    const els = [root.nodeType === 1 ? root : null, ...root.querySelectorAll('*')].filter(Boolean);
    els.forEach(el => {
      if (SKIP_ATTR_TAGS.has(el.tagName)) return;
      ATTRS.forEach(attr => {
        if (!el.hasAttribute(attr)) return;
        if (attr === 'placeholder' && el.matches && el.matches('#brief, textarea[name="brief"]') && el.getAttribute('data-enz-example-placeholder') === '1') return;
        el.__enzOrigAttrs = el.__enzOrigAttrs || {};
        const cur = el.getAttribute(attr) || '';
        const saved = el.__enzOrigAttrs[attr];
        if (!saved) {
          el.__enzOrigAttrs[attr] = cur;
        } else {
          const savedEn = translateValue(saved);
          if (lang === 'en' && normalize(cur) !== normalize(saved) && normalize(cur) !== normalize(savedEn)) {
            el.__enzOrigAttrs[attr] = cur;
          }
        }
        const orig = el.__enzOrigAttrs[attr];
        const next = lang === 'en' ? translateValue(orig) : orig;
        if (cur !== next) el.setAttribute(attr, next);
      });
    });
  }

  function updateHead(lang){
    document.documentElement.lang = lang === 'en' ? 'en' : 'hu';
    document.documentElement.dataset.uiLang = lang;
    document.title = lang === 'en'
      ? 'The gift that makes the room fall silent | EnZenem.hu'
      : 'Az ajándék, amin elcsendesedik a szoba | EnZenem.hu';
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.content = lang === 'en'
        ? 'Personalized songs for weddings, birthdays, anniversaries and special occasions. Unique music with delivery in as little as 6 hours. EnZenem.hu – your story in a song.'
        : 'Személyre szabott dalok esküvőre, születésnapra, évfordulóra vagy különleges alkalmakra. Egyedi Zene 6 órán belüli kézbesítéssel. EnZenem.hu – A Te történeted dalban!';
    }
  }

  function syncToggle(lang){
    const toggle = document.getElementById('uiLangToggle');
    if (toggle) {
      toggle.checked = lang === 'en';
      toggle.setAttribute('aria-checked', lang === 'en' ? 'true' : 'false');
    }
    const box = document.querySelector('.lang-switch-wrap');
    if (box) box.dataset.current = lang;
  }

  function syncOrderLanguageField(lang){
    const input = document.querySelector('#orderForm input[name="language"]');
    if (!input) return;
    const raw = (input.value || '').trim();
    const val = raw.toLowerCase();
    const autoValues = new Set(['', 'magyar', 'hungarian', 'hu', 'angol', 'english', 'en']);
    if (!autoValues.has(val)) return;
    input.value = lang === 'en' ? 'English' : 'magyar';
  }

  function syncDynamicExampleLabels(lang){
    document.querySelectorAll('#enz-order-examples [data-label-en]').forEach(el => {
      if (!el.hasAttribute('data-label-hu')) {
        el.setAttribute('data-label-hu', el.getAttribute('data-label') || '');
      }
      const hu = el.getAttribute('data-label-hu') || el.getAttribute('data-label') || '';
      const en = el.getAttribute('data-label-en') || hu;
      const next = lang === 'en' ? en : hu;
      if (!next) return;

      // The order example chips are normalized by the legacy NovaBot CSS patch:
      // .nb-show-label renders data-label via ::before. If we also put the
      // same label into textContent, the visible caption appears twice.
      if (el.classList.contains('nb-show-label')) {
        el.setAttribute('data-label', next);
        el.setAttribute('aria-label', next);
        el.setAttribute('title', next);
        if (el.textContent) el.textContent = '';
        return;
      }

      if (el.textContent !== next) el.textContent = next;
    });
  }

  function syncBriefExamplePlaceholder(lang){
    const desc = document.querySelector('#brief, #orderForm textarea[name="brief"], #order textarea[name="brief"]');
    if (!desc || desc.getAttribute('data-enz-example-placeholder') !== '1') return;
    const hu = desc.getAttribute('data-enz-example-hu') || '';
    const en = desc.getAttribute('data-enz-example-en') || hu;
    const next = lang === 'en' ? (en || hu) : (hu || en);
    if (next && desc.getAttribute('placeholder') !== next) desc.setAttribute('placeholder', next);
  }

  let applying = false;
  function applyLanguage(lang = currentLang()){
    if (!LANGS.has(lang)) lang = DEFAULT_LANG;
    if (applying) return;
    applying = true;
    try {
      updateHead(lang);
      translateTextNodes(document.body, lang);
      translateAttrs(document.body, lang);
      syncToggle(lang);
      syncOrderLanguageField(lang);
      syncDynamicExampleLabels(lang);
      syncBriefExamplePlaceholder(lang);
    } finally {
      applying = false;
    }
  }

  function setLanguage(lang){
    if (!LANGS.has(lang)) lang = DEFAULT_LANG;
    localStorage.setItem(STORAGE_KEY, lang);
    applyLanguage(lang);
  }

  function boot(){
    const toggle = document.getElementById('uiLangToggle');
    if (toggle) {
      toggle.addEventListener('change', () => setLanguage(toggle.checked ? 'en' : 'hu'));
      const wrapper = toggle.closest('.lang-switch-wrap');
      if (wrapper) {
        wrapper.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); setLanguage('hu'); }
          if (e.key === 'ArrowRight') { e.preventDefault(); setLanguage('en'); }
        });
      }
    }
    applyLanguage(currentLang());
    const obs = new MutationObserver(() => {
      if (applying) return;
      window.requestAnimationFrame(() => applyLanguage(currentLang()));
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS
    });
  }

  const origAlert = window.alert;
  window.alert = function(message){
    const lang = currentLang();
    const msg = lang === 'en' ? translateValue(message) : message;
    return origAlert.call(window, msg);
  };

  window.EnzI18n = { setLanguage, applyLanguage, getLanguage: currentLang, t: (s) => currentLang() === 'en' ? translateValue(s) : s };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
