import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from .session import Base


def generate_uuid() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    name = Column(String(255), default="Untitled Project")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="projects")
    videos = relationship("Video", back_populates="project", cascade="all, delete-orphan")
    edit_sessions = relationship("EditSession", back_populates="project", cascade="all, delete-orphan")
    timeline_versions = relationship("TimelineVersion", back_populates="project", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="project", cascade="all, delete-orphan")
    outputs = relationship("Output", back_populates="project", cascade="all, delete-orphan")


class Video(Base):
    __tablename__ = "videos"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    storage_path = Column(String(512), nullable=False)
    duration = Column(Float, default=0.0)
    width = Column(Integer, default=0)
    height = Column(Integer, default=0)
    fps = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="videos")
    analysis = relationship("VideoAnalysis", back_populates="video", uselist=False, cascade="all, delete-orphan")


class VideoAnalysis(Base):
    __tablename__ = "video_analysis"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    video_id = Column(String(36), ForeignKey("videos.id"), nullable=False, unique=True)
    transcript = Column(JSON, default=list)        # list of {text, start, end}
    scenes = Column(JSON, default=list)            # list of {start_sec, end_sec, start_frame, end_frame}
    metadata_json = Column(JSON, default=dict)     # codecs, bitrate, streams, audio tracks
    visual_tags = Column(JSON, default=list)       # list of {timestamp, description, tags}
    status = Column(String(50), default="pending") # pending, processing, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow)

    video = relationship("Video", back_populates="analysis")


class EditSession(Base):
    __tablename__ = "edit_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    history = Column(JSON, default=list)  # list of {role: "user"|"agent", content: str, plan: dict, timestamp: str}
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="edit_sessions")


class TimelineVersion(Base):
    __tablename__ = "timeline_versions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    version_number = Column(Integer, default=1)
    tracks_data = Column(JSON, default=list)  # list of tracks & clips
    action_description = Column(String(512), default="Initial import")
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="timeline_versions")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True)
    video_id = Column(String(36), ForeignKey("videos.id"), nullable=True)
    job_type = Column(String(50), nullable=False)  # "analysis", "preview", "render", "codegen"
    status = Column(String(50), default="queued")  # "queued", "running", "completed", "failed"
    progress = Column(Float, default=0.0)          # 0.0 - 100.0
    stage = Column(String(100), default="Starting")
    result = Column(JSON, default=dict)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="jobs")


class Output(Base):
    __tablename__ = "outputs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    job_id = Column(String(36), ForeignKey("jobs.id"), nullable=True)
    output_type = Column(String(50), nullable=False)  # "preview" or "final"
    filename = Column(String(255), nullable=False)
    storage_path = Column(String(512), nullable=False)
    url = Column(String(512), nullable=False)
    duration = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="outputs")

