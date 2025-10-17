
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
import openai
import datetime
import os
import pandas as pd
import uuid

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🌍 MODEL: bejövő megrendelés
class SongRequest(BaseModel):
    title: str
    styles: str
    vocal: str
    language: str
    brief: str

openai.api_key = os.getenv("OPENAI_API_KEY", "sk-...")  # helyettesítsd be

LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)

@app.post("/api/generate_song")
async def generate_song(req: SongRequest):
    song_id = str(uuid.uuid4())
    today = datetime.date.today().isoformat()
    log_path = os.path.join(LOG_DIR, f"excel_log_{today}.xlsx")

    # PROMPT logika – csak a loghoz
    prompt = f"Írj egy {req.styles} stílusú dalt magyar nyelven a következő téma alapján: {req.brief}\nStruktúra: 3 versszak és 2 refrén. Ne használj idegen vagy értelmetlen szavakat. A dal címe legyen: {req.title}"

    row = {
        "Dátum": today,
        "Cím": req.title,
        "Stílus": req.styles,
        "Ének": req.vocal,
        "Nyelv": req.language,
        "Leírás": req.brief,
        "Prompt": prompt,
        "MP3 #1": "https://suno.fake/1.mp3",
        "MP3 #2": "https://suno.fake/2.mp3"
    }

    # Excel naplózás
    try:
        if os.path.exists(log_path):
            df = pd.read_excel(log_path)
            df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
        else:
            df = pd.DataFrame([row])
        df.to_excel(log_path, index=False)
    except Exception as e:
        print("Excel naplózás hiba:", e)

    # Dummy válasz (csak példa, a valódi API hívások mások)
    return {
        "lyrics": "Itt a dalszöveg helye...",
        "song_urls": ["https://suno.fake/1.mp3", "https://suno.fake/2.mp3"]
    }

# Excel letöltés adminnak
@app.get("/admin/download_excel")
def download_excel(date: str):
    path = os.path.join(LOG_DIR, f"excel_log_{date}.xlsx")
    if os.path.exists(path):
        return FileResponse(path, filename=f"enzenem_log_{date}.xlsx", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    return JSONResponse(status_code=404, content={"error": "Log not found"})
