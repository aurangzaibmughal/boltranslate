import os
import sys
import tempfile
import asyncio
import json
import logging
from typing import Optional, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from faster_whisper import WhisperModel

from database import init_db, get_db, TranslationRecord, SessionLocal

# Logging setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("BolTranslateBackend")

# Initialize FastAPI
app = FastAPI(
    title="BolTranslate API",
    description="Real-time Urdu Voice to English Translation Server with SQLite Database",
    version="1.1.0"
)

# Enable CORS for Next.js and mobile clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Schemas
class TranslationCreate(BaseModel):
    urdu: str
    english: str
    audio_duration: Optional[float] = 0.0
    is_favorite: Optional[bool] = False

# Global Model Variable (Lazy Loading)
whisper_model: Optional[WhisperModel] = None

def get_whisper_model() -> WhisperModel:
    global whisper_model
    if whisper_model is None:
        logger.info("Loading Faster-Whisper model ('base' with CPU int8 quantization)...")
        whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
        logger.info("Whisper model loaded successfully!")
    return whisper_model

@app.on_event("startup")
async def startup_event():
    # Initialize SQLite tables
    init_db()
    logger.info("SQLite database initialized (boltranslate.db)")
    # Warm up model in background thread
    asyncio.get_event_loop().run_in_executor(None, get_whisper_model)

@app.get("/")
def read_root():
    return {
        "app": "BolTranslate Backend",
        "status": "online",
        "database": "SQLite (boltranslate.db)",
        "supported_features": ["real-time-websocket", "audio-upload", "whisper-translate", "sqlite-history"],
        "language_pair": "Urdu (ur) -> English (en)"
    }

@app.get("/health")
def health_check():
    return {"status": "ok", "model_ready": whisper_model is not None, "database": "connected"}

# ----------------- Database History Endpoints -----------------

@app.get("/api/history")
def get_all_history(db: Session = Depends(get_db)):
    """Fetch all translation records sorted by newest first."""
    records = db.query(TranslationRecord).order_by(TranslationRecord.timestamp.desc()).all()
    return [rec.to_dict() for rec in records]

@app.post("/api/history")
def create_history_record(payload: TranslationCreate, db: Session = Depends(get_db)):
    """Add a new translation record into the SQLite database."""
    new_record = TranslationRecord(
        urdu_text=payload.urdu,
        english_text=payload.english,
        audio_duration=payload.audio_duration,
        is_favorite=payload.is_favorite or False
    )
    db.add(new_record)
    db.commit()
    db.refresh(new_record)
    return new_record.to_dict()

@app.delete("/api/history/{record_id}")
def delete_history_record(record_id: int, db: Session = Depends(get_db)):
    """Delete a specific translation record."""
    record = db.query(TranslationRecord).filter(TranslationRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()
    return {"success": True, "deleted_id": record_id}

@app.delete("/api/history")
def clear_all_history(db: Session = Depends(get_db)):
    """Delete all translation records."""
    db.query(TranslationRecord).delete()
    db.commit()
    return {"success": True, "message": "All history cleared"}

@app.patch("/api/history/{record_id}/favorite")
def toggle_favorite(record_id: int, db: Session = Depends(get_db)):
    """Toggle star/favorite status."""
    record = db.query(TranslationRecord).filter(TranslationRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    record.is_favorite = not record.is_favorite
    db.commit()
    db.refresh(record)
    return record.to_dict()

# ----------------- Audio Processing -----------------

def process_audio_file(file_path: str):
    """
    Transcribes Urdu voice to both Urdu text and English translated text using Whisper.
    """
    model = get_whisper_model()
    
    en_segments, _ = model.transcribe(
        file_path,
        task="translate",
        language="ur",
        beam_size=3,
        temperature=0.0,
        vad_filter=True
    )
    english_text = " ".join([seg.text.strip() for seg in en_segments]).strip()
    
    ur_segments, _ = model.transcribe(
        file_path,
        task="transcribe",
        language="ur",
        beam_size=3,
        temperature=0.0,
        vad_filter=True
    )
    urdu_text = " ".join([seg.text.strip() for seg in ur_segments]).strip()
    
    return urdu_text, english_text

@app.post("/api/translate")
async def translate_uploaded_audio(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    REST endpoint to upload an audio recording, receive translation, and persist to SQLite.
    """
    try:
        suffix = os.path.splitext(file.filename)[1] if file.filename else ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            content = await file.read()
            tmp.write(content)
            
        urdu_text, english_text = await asyncio.get_event_loop().run_in_executor(
            None, process_audio_file, tmp_path
        )
        
        try:
            os.remove(tmp_path)
        except Exception:
            pass
            
        record_data = None
        if urdu_text and english_text:
            rec = TranslationRecord(urdu_text=urdu_text, english_text=english_text)
            db.add(rec)
            db.commit()
            db.refresh(rec)
            record_data = rec.to_dict()

        return {
            "success": True,
            "urdu": urdu_text,
            "english": english_text,
            "record": record_data
        }
    except Exception as e:
        logger.error(f"Error processing audio upload: {e}")
        return {"success": False, "error": str(e)}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Real-time continuous audio streaming endpoint.
    Receives audio chunks from Next.js MediaRecorder, processes, and persists results.
    """
    await websocket.accept()
    logger.info("Client connected to /ws endpoint")
    
    audio_buffer = bytearray()
    last_process_time = asyncio.get_event_loop().time()
    
    try:
        while True:
            data = await websocket.receive_bytes()
            audio_buffer.extend(data)
            
            current_time = asyncio.get_event_loop().time()
            
            # Process when buffer has enough data (~25KB+ or every 1.5 seconds)
            if len(audio_buffer) > 25000 and (current_time - last_process_time) >= 1.5:
                last_process_time = current_time
                
                with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
                    tmp_name = tmp.name
                    tmp.write(bytes(audio_buffer))
                
                try:
                    urdu_text, english_text = await asyncio.get_event_loop().run_in_executor(
                        None, process_audio_file, tmp_name
                    )
                    
                    if urdu_text or english_text:
                        await websocket.send_text(json.dumps({
                            "urdu": urdu_text,
                            "english": english_text,
                            "final": False
                        }))
                except Exception as err:
                    logger.warning(f"Error decoding chunk: {err}")
                finally:
                    try:
                        os.remove(tmp_name)
                    except Exception:
                        pass
                        
    except WebSocketDisconnect:
        logger.info("Client disconnected from /ws")
        
        # On disconnect, save final audio to SQLite database
        if len(audio_buffer) > 15000:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
                tmp_name = tmp.name
                tmp.write(bytes(audio_buffer))
            try:
                urdu_text, english_text = await asyncio.get_event_loop().run_in_executor(
                    None, process_audio_file, tmp_name
                )
                if urdu_text and english_text:
                    db = SessionLocal()
                    rec = TranslationRecord(urdu_text=urdu_text, english_text=english_text)
                    db.add(rec)
                    db.commit()
                    db.close()
                    logger.info(f"Saved final sentence to SQLite: '{urdu_text}' -> '{english_text}'")
            except Exception as e:
                logger.error(f"Error saving to DB on disconnect: {e}")
            finally:
                try:
                    os.remove(tmp_name)
                except Exception:
                    pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
