"""Thin wrappers around the Sarvam APIs we use (batch STT, chat LLM, outbound calls)."""
import glob
import json
import logging
import os
import re
import tempfile
import time

import requests

from . import config

log = logging.getLogger(__name__)

# Sarvam's outbound API takes language names, STT returns BCP-47 codes.
LANG_CODE_TO_NAME = {
    "hi-IN": "Hindi", "en-IN": "English", "bn-IN": "Bengali", "gu-IN": "Gujarati",
    "kn-IN": "Kannada", "ml-IN": "Malayalam", "ta-IN": "Tamil", "te-IN": "Telugu",
    "pa-IN": "Punjabi", "od-IN": "Odia", "mr-IN": "Marathi", "as-IN": "Assamese",
    "sa-IN": "Sanskrit",
}
MIME_EXT = {
    "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/wav": ".wav", "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a",
    "audio/aac": ".aac", "audio/flac": ".flac",
}


def language_name(code: str | None) -> str:
    return LANG_CODE_TO_NAME.get(code or "", "English")


# ---------------------------------------------------------------- speech to text

def transcribe_with_diarization(audio: bytes, mime: str) -> dict:
    """Runs a Sarvam batch STT job with diarization. Returns the output JSON for the file."""
    if config.stt_llm_mocked():
        return _mock_transcript()

    from sarvamai import SarvamAI

    client = SarvamAI(api_subscription_key=config.SARVAM_API_KEY)
    ext = MIME_EXT.get((mime or "").split(";")[0].strip(), ".webm")
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, f"visit{ext}")
        with open(path, "wb") as f:
            f.write(audio)

        job = client.speech_to_text_job.create_job(
            model=config.SARVAM_STT_MODEL,
            mode="transcribe",
            language_code=config.SARVAM_STT_LANGUAGE,
            with_diarization=True,
            num_speakers=2,
        )
        job.upload_files(file_paths=[path], timeout=300)
        job.start()
        job.wait_until_complete(poll_interval=5, timeout=1800)

        results = job.get_file_results()
        if not results.get("successful"):
            failed = results.get("failed") or [{}]
            raise RuntimeError(f"Sarvam STT failed: {failed[0].get('error_message', 'unknown error')}")

        out_dir = os.path.join(tmp, "out")
        os.makedirs(out_dir, exist_ok=True)
        job.download_outputs(output_dir=out_dir)
        files = glob.glob(os.path.join(out_dir, "**", "*.json"), recursive=True)
        if not files:
            raise RuntimeError("Sarvam STT returned no output file")
        with open(files[0], encoding="utf-8") as f:
            return json.load(f)


def _mock_transcript() -> dict:
    time.sleep(2)
    entries = [
        ("0", "नमस्ते, बताइए क्या तकलीफ है?"),
        ("1", "डॉक्टर साहब, तीन दिन से बुखार है और सिर में बहुत दर्द है।"),
        ("0", "बुखार कितना रहता है? खांसी या जुकाम भी है?"),
        ("1", "101 के आसपास रहता है, थोड़ी खांसी भी है। रात को ठंड लगती है।"),
        ("0", "ठीक है, मैं पैरासिटामोल 650 दे रहा हूँ, दिन में तीन बार खाने के बाद। खूब पानी पीजिए। अगर तीन दिन में बुखार नहीं उतरा तो ब्लड टेस्ट करवाएँगे।"),
        ("1", "ठीक है डॉक्टर साहब, धन्यवाद।"),
    ]
    t = 0.0
    out = []
    for spk, text in entries:
        out.append({"speaker_id": spk, "transcript": text, "start_time_seconds": t,
                    "end_time_seconds": t + 4})
        t += 4.5
    return {"transcript": " ".join(e[1] for e in entries), "language_code": "hi-IN",
            "diarized_transcript": {"entries": out}}


# ---------------------------------------------------------------- LLM

def chat_json(system: str, user: str, mock: dict | None = None) -> dict:
    """Calls the Sarvam chat LLM and parses a JSON object out of the reply."""
    if config.stt_llm_mocked():
        return mock or {}

    payload = {
        "model": config.SARVAM_LLM_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": 0.2,
        "max_tokens": 4096,
        "reasoning_effort": "low",
        "response_format": {"type": "json_object"},
    }
    headers = {
        "api-subscription-key": config.SARVAM_API_KEY,
        "Authorization": f"Bearer {config.SARVAM_API_KEY}",
        "Content-Type": "application/json",
    }
    last_err = None
    for attempt in range(3):
        try:
            r = requests.post(config.SARVAM_CHAT_URL, json=payload, headers=headers, timeout=180)
            if r.status_code in (429, 502, 503):
                last_err = RuntimeError(f"Sarvam LLM {r.status_code}: {r.text[:300]}")
                time.sleep(2 * (attempt + 1))
                continue
            if r.status_code >= 400:
                raise RuntimeError(f"Sarvam LLM {r.status_code}: {r.text[:500]}")
            content = r.json()["choices"][0]["message"].get("content") or ""
            return _parse_json(content)
        except (requests.RequestException, ValueError) as e:
            last_err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Sarvam LLM call failed: {last_err}")


def _parse_json(text: str) -> dict:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()
    try:
        return json.loads(text)
    except ValueError:
        m = re.search(r"\{.*\}", text, flags=re.S)
        if m:
            return json.loads(m.group(0))
        raise


# ---------------------------------------------------------------- outbound calls

def _agent_headers() -> dict:
    return {"X-API-Key": config.SARVAM_AGENT_API_KEY, "Content-Type": "application/json"}


def place_outbound_call(phone: str, language_code: str | None, variables: dict,
                        webhook_url: str, metadata: dict) -> str:
    """Starts a Sarvam Voice Agent outbound call. Returns the attempt_id."""
    url = (f"https://apps.sarvam.ai/api/outbounds/v1/orgs/{config.SARVAM_ORG_ID}"
           f"/workspaces/{config.SARVAM_WORKSPACE_ID}/outbounds")
    body = {
        "app_config": {
            "app_id": config.SARVAM_AGENT_ID,
            "app_version": config.SARVAM_AGENT_VERSION,
            "connection_config": {
                "connection_id": config.SARVAM_CONNECTION_ID,
                "agent_phone_number": config.SARVAM_AGENT_PHONE,
            },
            "agent_variables": variables,
            "app_overrides": {"initial_language_name": language_name(language_code)},
        },
        "user_config": {"user_phone_number": phone},
        "webhook_config": {"url": webhook_url, "metadata": metadata},
    }
    r = requests.post(url, json=body, headers=_agent_headers(), timeout=30)
    if r.status_code >= 400:
        raise RuntimeError(f"Sarvam outbound {r.status_code}: {r.text[:500]}")
    return r.json()["attempt_id"]


def fetch_call_transcript(interaction_id: str) -> list[dict]:
    """Original-language transcript of a finished call (the webhook only carries English)."""
    url = (f"https://apps.sarvam.ai/api/analytics/v1/{config.SARVAM_ORG_ID}/{config.SARVAM_WORKSPACE_ID}"
           f"/{config.SARVAM_AGENT_ID}/transcripts/{interaction_id}")
    r = requests.get(url, headers=_agent_headers(), timeout=30)
    r.raise_for_status()
    return r.json().get("messages") or []
