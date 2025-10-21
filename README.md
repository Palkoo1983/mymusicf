# EnZenem Render‑Proof SRC v4.1 (Sheets‑first, Suno‑safe)

## Struktúra
- **src/** alatt minden backend fájl.
- `npm start` → `node src/server.js`

## Lépések
1) Másold az egész `src/` mappát a projekthez (a gyökérbe).
2) Frissítsd a `package.json`-t (itt a csomagban is benne van minta).
3) Render env: lásd `.env.example` tartalmát (környezeti változók).
4) `npm i` → `npm start`
5) Teszt: `GET /api/healthz`, majd `POST /api/order` (mp3/wav).

## Folyamat
- **Sheets‑first**: azonnali sor `status=RECEIVED`.
- Lyrics (OpenAI) → `LYRICS_OK` (fallback‑szöveg, ha baj van).
- MP3 esetén Suno v5 → két link, `DONE` vagy `PENDING_SUNO`.
- Frontendre nem adunk linket; csak a Sheets‑ben jelenik meg.
