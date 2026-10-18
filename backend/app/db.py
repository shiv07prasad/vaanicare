from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, Column, Date, DateTime, ForeignKey, Integer,
                        LargeBinary, String, Text, create_engine)
from sqlalchemy.orm import declarative_base, deferred, relationship, sessionmaker

from .config import DATABASE_URL

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()


def utcnow():
    return datetime.now(timezone.utc)


class Patient(Base):
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    phone = Column(String(32), nullable=False)
    age = Column(Integer)
    gender = Column(String(20))
    # Language detected from the latest clinic visit, e.g. "hi-IN"
    language_code = Column(String(16))
    created_at = Column(DateTime(timezone=True), default=utcnow)
    visits = relationship("Visit", back_populates="patient", order_by="Visit.created_at.desc()",
                          cascade="all, delete-orphan")


class Visit(Base):
    __tablename__ = "visits"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    doctor_name = Column(String(200))
    # Audio is stored in the DB so it survives Render's ephemeral disk.
    audio = deferred(Column(LargeBinary))
    audio_mime = Column(String(64))
    # processing | ready | failed
    status = Column(String(20), default="processing")
    error = Column(Text)
    language_code = Column(String(16))
    # [{speaker, role, text, start, end}]
    transcript = Column(JSON)
    summary = Column(Text)
    diagnosis = Column(Text)
    prescription = Column(Text)
    followup_questions = Column(JSON)  # [str]
    followup_date = Column(Date)  # display only; calls are placed via "Call now"
    patient = relationship("Patient", back_populates="visits")
    calls = relationship("FollowUpCall", back_populates="visit", order_by="FollowUpCall.created_at.desc()",
                         cascade="all, delete-orphan")


class FollowUpCall(Base):
    __tablename__ = "followup_calls"
    id = Column(Integer, primary_key=True)
    visit_id = Column(Integer, ForeignKey("visits.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    simulated = Column(Boolean, default=False)
    attempt_id = Column(String(100), index=True)
    interaction_id = Column(String(200))
    # initiated | connected | no_answer | busy | failed
    status = Column(String(20), default="initiated")
    failure_reason = Column(Text)
    duration = Column(Integer)
    language = Column(String(32))
    transcript = Column(JSON)  # [{role, text}]
    raw_payload = Column(JSON)
    # Post-call analysis
    analysis_summary = Column(Text)
    has_issues = Column(Boolean, default=False)
    severity = Column(String(20))  # none | low | medium | high
    issues = Column(JSON)  # [str]
    acknowledged = Column(Boolean, default=False)
    visit = relationship("Visit", back_populates="calls")
    patient = relationship("Patient")


class EvalRun(Base):
    __tablename__ = "eval_runs"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    finished_at = Column(DateTime(timezone=True))
    source = Column(String(20))  # synthetic | real
    judge_model = Column(String(80))
    status = Column(String(20), default="running")  # running | done | failed
    total = Column(Integer, default=0)
    completed = Column(Integer, default=0)
    summary = Column(JSON)  # {metric_name: avg score, pass_rate, triage_accuracy}
    error = Column(Text)
    results = relationship("EvalResult", back_populates="run", order_by="EvalResult.id",
                           cascade="all, delete-orphan")


class EvalResult(Base):
    __tablename__ = "eval_results"
    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("eval_runs.id"), nullable=False, index=True)
    case_key = Column(String(60))
    title = Column(String(200))
    call_id = Column(Integer, ForeignKey("followup_calls.id"))
    context = Column(JSON)  # diagnosis, questions, language, persona
    transcript = Column(JSON)  # [{role, text}]
    expected = Column(JSON)  # {has_issues, min_severity, language_switch_to}
    app_triage = Column(JSON)  # {has_issues, severity, issues, summary}
    metrics = Column(JSON)  # [{name, score, passed, reason}]
    passed = Column(Boolean)
    error = Column(Text)
    run = relationship("EvalRun", back_populates="results")


def init_db():
    Base.metadata.create_all(engine)
