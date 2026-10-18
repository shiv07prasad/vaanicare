"""Background jobs: visit transcription + notes, and follow-up call analysis."""
import logging
import threading
import time
from datetime import datetime, timedelta, timezone
import traceback

from . import sarvam
from .db import FollowUpCall, Patient, SessionLocal, Visit

log = logging.getLogger(__name__)

VISIT_SYSTEM = """You are a clinical documentation assistant for a doctor in India.
You receive a diarized transcript of a consultation between a doctor and a patient.
The conversation may be in Hindi, English, another Indian language, or a mix.
Respond with a single JSON object, written in English, with these keys:
- "speaker_roles": object mapping each speaker id to "Doctor" or "Patient" (or "Attendant" for a relative).
- "line_roles": array with one entry per numbered transcript line, each "Doctor", "Patient" or "Attendant",
  judged from what is said (questions about symptoms and instructions come from the doctor). This matters
  when speaker separation failed and one speaker id covers both people.
- "summary": 2-4 sentence summary of the visit.
- "diagnosis": the doctor's diagnosis or working impression with key symptoms and findings. If not stated, give the most likely impression and mark it "(provisional)".
- "prescription": medicines with dose, frequency and duration, plus tests and advice, one per line. Only include what the doctor actually said.
- "followup_questions": 4-6 short, simple questions an AI nurse should ask the patient on a follow-up phone call to check recovery, medicine adherence, side effects and red-flag symptoms specific to this condition.
Do not invent medicines that were not mentioned."""

CALL_SYSTEM = """You are a triage assistant reviewing a follow-up phone call between an AI nurse and a patient.
Decide if the doctor needs to be notified. Notify for: worsening or new symptoms, red-flag symptoms,
side effects, not taking medicines, not improving as expected, the patient asking to speak to the doctor,
or the call being too unclear to confirm the patient is fine.
Respond with a single JSON object with keys:
- "summary": 2-3 sentence summary of how the patient is doing, in English.
- "has_issues": true or false.
- "severity": "none", "low", "medium" or "high".
- "issues": list of short strings, one per concern (empty list if none)."""

SIMULATE_SYSTEM = """You simulate a realistic follow-up phone call in India between an AI nurse calling
on behalf of a doctor and the patient. The AI nurse greets the patient by name, asks each follow-up question,
and closes politely. The patient answers naturally in the given language (they may mix in English words).
Make the patient report one mild new concern so the triage step has something to evaluate.
Respond with JSON: {"transcript": [{"role": "agent" | "user", "text": "..."}]}"""


def _format_transcript(entries: list[dict]) -> str:
    return "\n".join(f"{i + 1}. Speaker {e['speaker']}: {e['text']}" for i, e in enumerate(entries))


# Visits being processed by *this* server process. A visit stuck in "processing" that isn't in
# here lost its worker (Render redeploy or free-tier spin-down) and is safe to restart.
_active_visits: set[int] = set()
_active_lock = threading.Lock()


def is_processing_here(visit_id: int) -> bool:
    with _active_lock:
        return visit_id in _active_visits


def process_visit(visit_id: int) -> None:
    with _active_lock:
        if visit_id in _active_visits:
            return
        _active_visits.add(visit_id)
    try:
        _process_visit(visit_id)
    finally:
        with _active_lock:
            _active_visits.discard(visit_id)


def resume_stuck_visits() -> None:
    """On startup: restart any visit left in "processing" by a previous server instance."""
    db = SessionLocal()
    ids = [v.id for v in db.query(Visit.id).filter(Visit.status == "processing").all()]
    db.close()
    for vid in ids:
        log.info("resuming visit %s left in processing by a previous instance", vid)
        threading.Thread(target=process_visit, args=(vid,), daemon=True).start()


def _process_visit(visit_id: int) -> None:
    db = SessionLocal()
    try:
        visit = db.get(Visit, visit_id)
        stt = sarvam.transcribe_with_diarization(visit.audio, visit.audio_mime)

        entries = []
        for e in (stt.get("diarized_transcript") or {}).get("entries") or []:
            text = (e.get("transcript") or "").strip()
            if text:
                entries.append({"speaker": str(e.get("speaker_id", "0")), "text": text,
                                "start": e.get("start_time_seconds"), "end": e.get("end_time_seconds")})
        if not entries and stt.get("transcript"):
            entries = [{"speaker": "0", "text": stt["transcript"], "start": 0, "end": None}]
        if not entries:
            raise RuntimeError("No speech was detected in the recording.")

        lang = stt.get("language_code") or None
        notes = sarvam.chat_json(
            VISIT_SYSTEM,
            f"Detected language: {sarvam.language_name(lang)}\n\nTranscript:\n{_format_transcript(entries)}",
            mock={
                "speaker_roles": {"0": "Doctor", "1": "Patient"},
                "summary": "Patient presented with fever (~101°F) for 3 days with headache, mild cough and chills at night. Doctor advised paracetamol and hydration, with blood tests if fever persists beyond 3 days.",
                "diagnosis": "Acute febrile illness, likely viral fever (provisional). Symptoms: fever ~101°F x 3 days, headache, mild cough, chills.",
                "prescription": "Paracetamol 650 mg - three times a day after meals\nPlenty of oral fluids\nBlood test (CBC, dengue/malaria) if fever persists beyond 3 days",
                "followup_questions": [
                    "Has your fever come down since the visit? What was your last temperature?",
                    "Are you taking paracetamol three times a day after meals as advised?",
                    "Is the headache and cough better, same, or worse?",
                    "Have you noticed any rash, bleeding gums, vomiting or severe body pain?",
                    "Are you drinking enough water and able to eat normally?",
                ],
            },
        )
        # The LLM may key roles as "0", "Speaker 0" or "SPEAKER_00"; normalise to the bare id.
        roles = {}
        for k, v in (notes.get("speaker_roles") or {}).items():
            digits = "".join(ch for ch in str(k) if ch.isdigit())
            roles[str(int(digits)) if digits else str(k)] = v
        # Prefer the LLM's per-line roles: on noisy audio, diarization can put both people under one
        # speaker id (or split one person across two), which a per-speaker mapping can't fix.
        line_roles = [str(r) for r in (notes.get("line_roles") or [])]
        use_lines = len(line_roles) == len(entries)
        for i, e in enumerate(entries):
            if use_lines and line_roles[i] in ("Doctor", "Patient", "Attendant"):
                e["role"] = str(line_roles[i])
                continue
            key = str(int(e["speaker"])) if e["speaker"].isdigit() else e["speaker"]
            e["role"] = roles.get(key,f"Speaker {int(e['speaker']) + 1}" if e["speaker"].isdigit() else e["speaker"])

        visit.transcript = entries
        visit.language_code = lang
        visit.summary = notes.get("summary")
        visit.diagnosis = _as_text(notes.get("diagnosis"))
        visit.prescription = _as_text(notes.get("prescription"))
        visit.followup_questions = [str(q) for q in (notes.get("followup_questions") or [])]
        visit.status = "ready"
        visit.error = None
        if lang:
            db.get(Patient, visit.patient_id).language_code = lang
        db.commit()
    except Exception as e:  # noqa: BLE001 - surface any failure on the dashboard
        log.error("visit %s failed: %s", visit_id, traceback.format_exc())
        db.rollback()
        visit = db.get(Visit, visit_id)
        if visit:
            visit.status = "failed"
            visit.error = str(e)[:2000]
            db.commit()
    finally:
        db.close()


def _as_text(value) -> str:
    if isinstance(value, list):
        return "\n".join(str(v) for v in value)
    return str(value or "")


def analyze_call(call_id: int) -> None:
    db = SessionLocal()
    try:
        call = db.get(FollowUpCall, call_id)
        if not call.transcript:
            call.analysis_summary = f"Call {call.status.replace('_', ' ')}" + (
                f": {call.failure_reason}" if call.failure_reason else ".")
            call.has_issues = call.status != "connected"
            call.severity = "low" if call.has_issues else "none"
            call.issues = ["Could not reach the patient for follow-up."] if call.has_issues else []
            db.commit()
            return

        visit = call.visit
        convo = "\n".join(f"{'AI nurse' if t['role'] in ('agent', 'assistant') else 'Patient'}: {t['text']}"
                          for t in call.transcript)
        result = sarvam.chat_json(
            CALL_SYSTEM,
            f"Visit diagnosis: {visit.diagnosis}\nPrescription: {visit.prescription}\n\nCall transcript:\n{convo}",
            mock={
                "summary": "Fever has reduced and the patient is taking paracetamol as advised, but reports a new mild skin rash on the arms since yesterday.",
                "has_issues": True,
                "severity": "medium",
                "issues": ["New rash on arms since yesterday - rule out dengue / drug reaction"],
            },
        )
        call.analysis_summary = result.get("summary")
        call.has_issues = bool(result.get("has_issues"))
        call.severity = result.get("severity") or ("medium" if call.has_issues else "none")
        call.issues = [str(i) for i in (result.get("issues") or [])]
        db.commit()
    except Exception as e:  # noqa: BLE001
        log.error("call %s analysis failed: %s", call_id, traceback.format_exc())
        db.rollback()
        call = db.get(FollowUpCall, call_id)
        if call:
            call.analysis_summary = f"Automatic analysis failed: {e}"[:2000]
            call.has_issues = True
            call.severity = "low"
            db.commit()
    finally:
        db.close()


def simulate_call(call_id: int) -> None:
    """Demo path: generate a plausible call transcript, then run the normal analysis."""
    db = SessionLocal()
    try:
        call = db.get(FollowUpCall, call_id)
        visit = call.visit
        questions = "\n".join(f"- {q}" for q in visit.followup_questions or [])
        result = sarvam.chat_json(
            SIMULATE_SYSTEM,
            f"Patient name: {call.patient.name}\nLanguage: {call.language}\n"
            f"Diagnosis: {visit.diagnosis}\nPrescription: {visit.prescription}\nQuestions:\n{questions}",
            mock={"transcript": [
                {"role": "agent", "text": f"नमस्ते {call.patient.name} जी, मैं डॉक्टर के क्लिनिक से बोल रही हूँ। आपकी तबीयत के बारे में कुछ सवाल पूछने थे, क्या अभी बात कर सकते हैं?"},
                {"role": "user", "text": "हाँ जी, बोलिए।"},
                {"role": "agent", "text": "क्या आपका बुखार कम हुआ है?"},
                {"role": "user", "text": "हाँ, अब 99 के आसपास है।"},
                {"role": "agent", "text": "क्या आप पैरासिटामोल दिन में तीन बार ले रहे हैं?"},
                {"role": "user", "text": "जी, ले रहा हूँ।"},
                {"role": "agent", "text": "क्या कोई रैश, मसूड़ों से खून या उल्टी जैसी कोई समस्या है?"},
                {"role": "user", "text": "कल से हाथों पर थोड़े लाल दाने निकले हैं, actually थोड़ी खुजली भी है।"},
                {"role": "agent", "text": "ठीक है, मैं यह डॉक्टर को बता दूँगी। अपना ध्यान रखिए, धन्यवाद।"},
            ]},
        )
        call.transcript = [{"role": t.get("role", "user"), "text": t.get("text", "")}
                           for t in result.get("transcript") or []]
        call.status = "connected"
        call.duration = 30 * max(1, len(call.transcript) // 2)
        db.commit()
    except Exception as e:  # noqa: BLE001
        log.error("simulate call %s failed: %s", call_id, traceback.format_exc())
        db.rollback()
        call = db.get(FollowUpCall, call_id)
        call.status = "failed"
        call.failure_reason = str(e)[:2000]
        db.commit()
    finally:
        db.close()
    analyze_call(call_id)


# ---------------------------------------------------------------- webhook fallback

_last_check: dict[int, float] = {}
_check_lock = threading.Lock()
STATUS_MAP = {"connected": "connected", "no_answer": "no_answer", "busy": "busy", "failed": "failed"}


def reconcile_call(call_id: int, min_interval: float = 20.0) -> None:
    """Pulls a finished call's result from Sarvam when the webhook hasn't arrived
    (dead tunnel locally, app asleep on Render, or a dropped delivery)."""
    now = time.time()
    with _check_lock:
        if now - _last_check.get(call_id, 0) < min_interval:
            return
        _last_check[call_id] = now
    db = SessionLocal()
    try:
        call = db.get(FollowUpCall, call_id)
        if not call or call.status != "initiated" or not call.attempt_id or call.simulated:
            return
        attempt = sarvam.find_attempt(call.attempt_id, call.created_at)
        age = datetime.now(timezone.utc) - (call.created_at if call.created_at.tzinfo else call.created_at.replace(tzinfo=timezone.utc))
        if attempt is None:
            if age > timedelta(minutes=20):
                call.status, call.failure_reason = "failed", "No result from Sarvam after 20 minutes."
                db.commit()
                analyze_call(call_id)
            return
        status = STATUS_MAP.get(str(attempt.get("connectivity_status") or "").lower())
        if status is None or (status == "connected" and not attempt.get("end_datetime")):
            return  # still ringing or in progress
        call.status = status
        reason = attempt.get("failure_reason")
        call.failure_reason = None if reason in (None, "NO_FAILURE_REASON") else reason
        call.duration = int(attempt["duration_in_seconds"]) if attempt.get("duration_in_seconds") else None
        call.interaction_id = attempt.get("interaction_id")
        call.raw_payload = {"source": "analytics_fallback", "attempt": {k: attempt.get(k) for k in (
            "attempt_id", "connectivity_status", "ended_by", "duration_in_seconds", "language_name", "num_messages")}}
        if call.interaction_id:
            msgs = sarvam.fetch_call_transcript(call.interaction_id)
            call.transcript = [{"role": m.get("role"), "text": m.get("content"),
                                "language": m.get("language_name")} for m in msgs] or None
        db.commit()
        log.info("call %s reconciled from Sarvam analytics: %s", call_id, status)
    except Exception:  # noqa: BLE001 - try again on the next poll
        log.warning("reconcile of call %s failed: %s", call_id, traceback.format_exc())
        return
    finally:
        db.close()
    analyze_call(call_id)
