from sqlalchemy import String, ForeignKey, Float, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.database import Base


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id"),
        nullable=False
    )

    filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    storage_key: Mapped[str] = mapped_column(
        String(500),
        nullable=False
    )

    duration: Mapped[float | None] = mapped_column(
        Float,
        nullable=True
    )

    width: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )

    height: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="uploaded"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow
    )