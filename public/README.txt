
Bakelit Songs – ENZENEM arany/platina logó (statikus SVG)

Mi van benne?
- enzenem_gold_platinum_logo.svg — statikus, vektoros logó
  • 4 arany átmenet (világos→mély), külső arany aura
  • fényes csillanások a lemez felületén
  • „ENZENEM” felirat platina színnel, arany glow-val, felül és alul

Beépítés (ajánlott):
1) Másold az SVG-t a webprojektedbe: public/assets/enzenem_gold_platinum_logo.svg
2) index.html: 
   <img src="assets/enzenem_gold_platinum_logo.svg" alt="ENZENEM logo" class="logo-img">
3) style.css:
   .logo-img { width: 56px; height: 56px; display: block; }

Alternatíva háttérképként:
   .logo{ width:56px; height:56px; border-radius:50%;
          background: url("assets/enzenem_gold_platinum_logo.svg") center/cover no-repeat; }
