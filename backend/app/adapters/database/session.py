import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session
from app.core.config import settings

db_url = settings.DATABASE_URL

# Normalize SQLite path on Windows to always point to backend/video_editor.db reliably
if db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    # Resolve relative path to absolute
    backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    db_file_path = os.path.join(backend_root, "video_editor.db").replace("\\", "/")
    db_url = f"sqlite:///{db_file_path}"
else:
    connect_args = {}

engine = create_engine(
    db_url,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = scoped_session(
    sessionmaker(autocommit=False, autoflush=False, bind=engine)
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
