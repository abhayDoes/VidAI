from sqlalchemy import String, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(
        primary_key= True
    )

    name: Mapped[str] = mapped_column(
        String(255),
        nullable =False
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable =False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default= datetime.utcnow
    )

    user = relationship("User", backref="projects")