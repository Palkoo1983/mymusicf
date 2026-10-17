# Ellenőrzés – 2.3.0

- 21 szerveroldali teszt sikeres (5 új ajánlatkérési, 16 meglévő chat/fizetési).
- 2 új böngészős feltöltési algoritmusteszt sikeres: darabolás és hálózati hiba utáni folytatás.
- HU/EN fizetési folyamat szimulációja sikeres: ellenőrzött fizetés, számla, két levél, Sheets; ismételt callback és hibás összeg kezelése.
- Helyi böngészős ellenőrzés: új menü/panel, kiválasztott csomag megjelenik az űrlapon, HU/EN szövegek, fordított jogi hivatkozások, hiányzó OneDrive-bekötésnél letiltott beküldés.
- A fizetési biztonsági modul, Sheets-modul, fő script és NovaBot felület byte szerint azonos a 2.2.1-es csomaggal. A server.js kizárólag az elkülönített klipmodul importjával és útvonal-regisztrációjával bővült.
- A valós OneDrive-feltöltés, Microsoft-jogosultságok és e-mail-kézbesítés még nincs élesben tesztelve. Ezekhez a tulajdonosi összekötés szükséges. Nem történt éles közzététel, levélküldés vagy fizetés.

2.3.1: a felirat és szájszinkron külön-külön elfogadható, együtt szerveroldalon elutasított; az ár mindkét külön opcióval ellenőrizve.
