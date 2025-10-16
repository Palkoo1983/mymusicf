from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os

router = APIRouter()

@router.get("/admin/download_excel")
def download_excel(date: str):
    filename = f"rendelesek_{date}.xlsx"
    filepath = os.path.join("admin_logs", filename)

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Fájl nem található")

    return FileResponse(
        path=filepath,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )