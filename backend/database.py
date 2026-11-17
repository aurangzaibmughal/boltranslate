from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "sqlite:///./boltranslate.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class TranslationRecord(Base):
    __tablename__ = "translations"

    id = Column(Integer, primary_key=True, index=True)
    urdu_text = Column(String, nullable=False)
    english_text = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    is_favorite = Column(Boolean, default=False)
    audio_duration = Column(Float, nullable=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "urduText": self.urdu_text,
            "englishText": self.english_text,
            "timestamp": self.timestamp.strftime("%I:%M %p"),
            "createdAt": self.timestamp.isoformat(),
            "isFavorite": self.is_favorite,
            "audioDuration": self.audio_duration or 0.0,
        }

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
