import logging
from datetime import date
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session, undefer

from . import config, pipeline, sarvam
from .db import FollowUpCall, Patient, SessionLocal, Visit, init_db

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("app")

app = FastAPI(title="Clinic Voice Assistant")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup():
    init_db()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------- serializers

def ser_call(c: FollowUpCall) -> dict:
    english = [{"role": t.get("role"), "text": t.get("en_text")}
               for t in ((c.raw_payload or {}).get("interaction_transcript") or [])]
    return {
        "id": c.id, "visit_id": c.visit_id, "patient_id": c.patient_id,
        "patient_name": c.patient.name if c.patient else None,
        "created_at": c.created_at, "simulated": c.simulated, "status": c.status,
        "failure_reason": c.failure_reason, "duration": c.duration, "language": c.language,
        "transcript": c.transcript, "transcript_en": english or None,
        "analysis_summary": c.analysis_summary, "has_issues": c.has_issues,
        "severity": c.severity, "issues": c.issues or [], "acknowledged": c.acknowledged,
        "analyzed": c.analysis_summary is not None,
    }


def ser_visit(v: Visit, full: bool = True) -> dict:
    d = {
        "id": v.id, "patient_id": v.patient_id, "created_at": v.created_at,
        "doctor_name": v.doctor_name, "status": v.status, "error": v.error,
        "language_code": v.language_code, "language": sarvam.language_name(v.language_code) if v.language_code else None,
        "summary": v.summary, "diagnosis": v.diagnosis, "followup_date": v.followup_date,
        "open_issues": sum(1 for c in v.calls if c.has_issues and not c.acknowledged),
        "call_count": len(v.calls),
    }
    if full:
        d.update({
            "transcript": v.transcript or [], "prescription": v.prescription,
            "followup_questions": v.followup_questions or [],
            "audio_url": f"/api/visits/{v.id}/audio",
            "calls": [ser_call(c) for c in v.calls],
        })
    return d


def ser_patient(p: Patient, with_visits: bool = False) -> dict:
    d = {
        "id": p.id, "name": p.name, "phone": p.phone, "age": p.age, "gender": p.gender,
        "language_code": p.language_code,
        "language": sarvam.language_name(p.language_code) if p.language_code else None,
        "created_at": p.created_at, "visit_count": len(p.visits),
        "last_visit": p.visits[0].created_at if p.visits else None,
        "open_issues": sum(1 for v in p.visits for c in v.calls if c.has_issues and not c.acknowledged),
    }
    if with_visits:
        d["visits"] = [ser_visit(v, full=False) for v in p.visits]
    return d


# ---------------------------------------------------------------- misc

@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/status")
def status():
    return {
        "mock_mode": config.stt_llm_mocked(),
        "calling_configured": config.calling_configured(),
        "webhook_url": f"{config.PUBLIC_BASE_URL}/api/webhooks/sarvam-call" if config.PUBLIC_BASE_URL else None,
    }


# ---------------------------------------------------------------- patients

class PatientIn(BaseModel):
    name: str
    phone: str
    age: int | None = None
    gender: str | None = None


@app.get("/api/patients")
def list_patients(q: str = "", db: Session = Depends(get_db)):
    query = db.query(Patient)
    if q:
        like = f"%{q}%"
        query = query.filter(Patient.name.ilike(like) | Patient.phone.ilike(like))
    return [ser_patient(p) for p in query.order_by(Patient.created_at.desc()).all()]


@app.post("/api/patients")
def create_patient(body: PatientIn, db: Session = Depends(get_db)):
    if not body.name.strip() or not body.phone.strip():
        raise HTTPException(400, "Name and phone are required")
    p = Patient(name=body.name.strip(), phone=normalize_phone(body.phone), age=body.age, gender=body.gender)
    db.add(p)
    db.commit()
    return ser_patient(p)


@app.get("/api/patients/{pid}")
def get_patient(pid: int, db: Session = Depends(get_db)):
    p = db.get(Patient, pid) or _404("Patient")
    return ser_patient(p, with_visits=True)


@app.patch("/api/patients/{pid}")
def update_patient(pid: int, body: PatientIn, db: Session = Depends(get_db)):
    p = db.get(Patient, pid) or _404("Patient")
    p.name, p.phone, p.age, p.gender = body.name.strip(), normalize_phone(body.phone), body.age, body.gender
    db.commit()
    return ser_patient(p)


def normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit() or ch == "+")
    if not digits.startswith("+"):
        digits = digits.lstrip("0")
        if len(digits) == 10:  # assume an Indian mobile number
            digits = "91" + digits
        digits = "+" + digits
    return digits


def _404(what: str):
    raise HTTPException(404, f"{what} not found")


# ---------------------------------------------------------------- visits

@app.post("/api/patients/{pid}/visits")
async def create_visit(pid: int, background: BackgroundTasks, audio: UploadFile = File(...),
                       doctor_name: str = Form(""), db: Session = Depends(get_db)):
    db.get(Patient, pid) or _404("Patient")
    data = await audio.read()
    if len(data) < 1000:
        raise HTTPException(400, "Recording is empty")
    v = Visit(patient_id=pid, doctor_name=doctor_name or None, audio=data,
              audio_mime=audio.content_type or "audio/webm", status="processing")
    db.add(v)
    db.commit()
    background.add_task(pipeline.process_visit, v.id)
    return ser_visit(v)


@app.get("/api/visits/{vid}")
def get_visit(vid: int, db: Session = Depends(get_db)):
    v = db.get(Visit, vid) or _404("Visit")
    d = ser_visit(v)
    d["patient"] = ser_patient(v.patient)
    return d


@app.get("/api/visits/{vid}/audio")
def get_audio(vid: int, db: Session = Depends(get_db)):
    v = db.query(Visit).options(undefer(Visit.audio)).filter(Visit.id == vid).first() or _404("Visit")
    return Response(content=v.audio, media_type=(v.audio_mime or "audio/webm").split(";")[0],
                    headers={"Cache-Control": "private, max-age=3600"})


class VisitPatch(BaseModel):
    diagnosis: str | None = None
    prescription: str | None = None
    followup_questions: list[str] | None = None
    followup_date: date | None = None
    clear_followup_date: bool = False


@app.patch("/api/visits/{vid}")
def update_visit(vid: int, body: VisitPatch, db: Session = Depends(get_db)):
    v = db.get(Visit, vid) or _404("Visit")
    if body.diagnosis is not None:
        v.diagnosis = body.diagnosis
    if body.prescription is not None:
        v.prescription = body.prescription
    if body.followup_questions is not None:
        v.followup_questions = [q.strip() for q in body.followup_questions if q.strip()]
    if body.followup_date is not None:
        v.followup_date = body.followup_date
    if body.clear_followup_date:
        v.followup_date = None
    db.commit()
    return get_visit(vid, db)


@app.post("/api/visits/{vid}/retry")
def retry_visit(vid: int, background: BackgroundTasks, db: Session = Depends(get_db)):
    v = db.get(Visit, vid) or _404("Visit")
    v.status, v.error = "processing", None
    db.commit()
    background.add_task(pipeline.process_visit, v.id)
    return get_visit(vid, db)


# ---------------------------------------------------------------- follow-up calls

@app.post("/api/visits/{vid}/call")
def call_now(vid: int, background: BackgroundTasks, simulate: bool = False, db: Session = Depends(get_db)):
    v = db.get(Visit, vid) or _404("Visit")
    if v.status != "ready":
        raise HTTPException(400, "Visit is still being processed")
    if not v.followup_questions:
        raise HTTPException(400, "Add at least one follow-up question first")
    if not simulate and not config.calling_configured():
        raise HTTPException(400, "Sarvam calling is not configured yet. Use 'Simulate call' or set the SARVAM_* env vars.")
    if not simulate and not config.PUBLIC_BASE_URL:
        raise HTTPException(400, "PUBLIC_BASE_URL is not set, so Sarvam cannot send the call result back.")

    patient = v.patient
    lang_code = v.language_code or patient.language_code
    call = FollowUpCall(visit_id=v.id, patient_id=patient.id, simulated=simulate,
                        language=sarvam.language_name(lang_code), status="initiated")
    db.add(call)
    db.commit()

    if simulate:
        background.add_task(pipeline.simulate_call, call.id)
        return ser_call(call)

    questions = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(v.followup_questions))
    variables = {
        "patient_name": patient.name,
        "doctor_name": v.doctor_name or "your doctor",
        "visit_date": v.created_at.strftime("%d %B %Y") if v.created_at else "",
        "visit_summary": v.summary or "",
        "diagnosis": v.diagnosis or "",
        "prescription": v.prescription or "",
        "followup_questions": questions,
        "preferred_language": call.language,
    }
    try:
        call.attempt_id = sarvam.place_outbound_call(
            phone=patient.phone, language_code=lang_code, variables=variables,
            webhook_url=f"{config.PUBLIC_BASE_URL}/api/webhooks/sarvam-call",
            metadata={"call_id": call.id, "visit_id": v.id},
        )
    except Exception as e:  # noqa: BLE001
        call.status, call.failure_reason = "failed", str(e)[:2000]
        db.commit()
        raise HTTPException(502, f"Could not start the call: {e}")
    db.commit()
    return ser_call(call)


@app.post("/api/webhooks/sarvam-call")
async def sarvam_call_webhook(request: Request, background: BackgroundTasks, db: Session = Depends(get_db)):
    payload = await request.json()
    log.info("sarvam webhook: attempt=%s status=%s", payload.get("attempt_id"), payload.get("status"))
    meta = (payload.get("webhook_config") or {}).get("metadata") or {}
    call = None
    if meta.get("call_id"):
        call = db.get(FollowUpCall, int(meta["call_id"]))
    if not call and payload.get("attempt_id"):
        call = db.query(FollowUpCall).filter(FollowUpCall.attempt_id == payload["attempt_id"]).first()
    if not call:
        log.warning("webhook for unknown call: %s", payload)
        return {"ok": True, "matched": False}

    call.raw_payload = payload
    call.status = payload.get("status") or "failed"
    call.failure_reason = payload.get("failure_reason")
    call.duration = int(payload["duration"]) if payload.get("duration") else None
    call.interaction_id = payload.get("interaction_id")

    transcript = [{"role": t.get("role"), "text": t.get("en_text")}
                  for t in payload.get("interaction_transcript") or []]
    if call.interaction_id:
        try:  # prefer the original-language transcript
            original = sarvam.fetch_call_transcript(call.interaction_id)
            if original:
                transcript = [{"role": m.get("role"), "text": m.get("content"),
                               "language": m.get("language_name")} for m in original]
        except Exception as e:  # noqa: BLE001
            log.warning("could not fetch original transcript: %s", e)
    call.transcript = transcript or None
    db.commit()
    background.add_task(pipeline.analyze_call, call.id)
    return {"ok": True, "matched": True}


@app.get("/api/alerts")
def alerts(db: Session = Depends(get_db)):
    calls = (db.query(FollowUpCall)
             .filter(FollowUpCall.has_issues.is_(True), FollowUpCall.acknowledged.is_(False))
             .order_by(FollowUpCall.created_at.desc()).all())
    return [ser_call(c) for c in calls]


@app.post("/api/calls/{cid}/acknowledge")
def acknowledge(cid: int, db: Session = Depends(get_db)):
    c = db.get(FollowUpCall, cid) or _404("Call")
    c.acknowledged = True
    db.commit()
    return ser_call(c)


# ---------------------------------------------------------------- frontend

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        file = DIST / path
        if path and file.is_file():
            return FileResponse(file)
        return FileResponse(DIST / "index.html")
