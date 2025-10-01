Bakelit Songs – v1.2 (Render-ready)
Kéréseid szerint frissítve:
- Bemutatkozás: Ének csak női vagy férfi
- Megrendelés űrlap: Zenei stílus szabad szöveg (datalist opcióval), Ének csak női/férfi
- Megrendelés űrlap: Tempó, Hossz, Referencia link(ek) eltávolítva
- Nyelv mező megmaradt
Futtatás: npm install → .env kitölt → npm start → http://localhost:8000
Deploy: GitHub → Render (render.yaml benne)


---
v1.2.1 hotfix:
- Elfogadja a NOTIFY_TO (TO_EMAIL helyett) és SMTP_FROM (MAIL_FROM helyett) változókat
- SMTP_SECURE változó támogatás (true/false)
- Új végpont: GET /api/test-mail — gyors SMTP teszt
- Részletesebb logok [MAIL:SENT] / [MAIL:SIMULATED]


v1.2.2 hotfix:
- SMTP timeouts (connection/greeting/socket) + TLS settings
- /api/env-check endpoint to verify env vars (masked)


v1.3:
- Kettős levélküldés: SMTP elsődleges, ha nem elérhető vagy timeoutra fut, automatikus fallback **Resend** API-ra (ha `RESEND_API_KEY` meg van adva).
- Környezeti változó: `RESEND_API_KEY` (opcionális). Ha be van állítva, SMTP hiba esetén is kimegy a levél.
Env példa Renderhez:
RESEND_API_KEY=re_************************
MAIL_FROM="Gombkötő Pál <paulsdiamond@gmail.com>"
NOTIFY_TO=paulsdiamond@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=paulsdiamond@gmail.com
SMTP_PASS=<app_password>


v1.4.0 – gyorsabb levélküldés
- Resend FIRST (ha van RESEND_API_KEY), SMTP csak fallbackként
- RESEND_ONLY=true esetén az SMTP teljesen kihagyva
- Nem blokkoló API: azonnali válasz, e-mailek háttérben mennek
- Rövidebb SMTP timeoutok (4s/4s/5s)


v2.0.0 – Stripe + jogi oldalak + gyors üzenetküldés
- Stripe Checkout előfizetés/egyszeri fizetés: /api/checkout + webhook
- Megrendelés űrlap fizetésre irányít (Csomag választó)
- Webhook a sikeres fizetésre (checkout.session.completed) → e-mail Neked és a vevőnek
- Honeypot, overlay, nem blokkoló e-mail küldés (Resend-first), rövid SMTP-timeout
- Oldalak: success.html, cancel.html, aszf.html, adatkezeles.html
ENV (Render):
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
PUBLIC_URL=https://mymusic-XXXX.onrender.com
RESEND_API_KEY=re_...
MAIL_FROM="Bakelit Songs <onboarding@resend.dev>"
NOTIFY_TO=paulsdiamond@gmail.com
RESEND_ONLY=true
CURRENCY=huf
PRICE_BASIC=19900
PRICE_PREMIUM=34900
PRICE_VIDEO=49900

Webhook beállítás: Render -> Routes -> /api/stripe/webhook (raw body), Stripe Dashboard -> Webhooks -> endpoint URL megadása.
