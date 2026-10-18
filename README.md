# VaaniCare: voice-first clinic assistant

The doctor records the consultation. Sarvam transcribes it with speaker separation, and the AI drafts the diagnosis, prescription and follow-up questions. The doctor clicks **Call now**, a Sarvam voice agent calls the patient in their language, and any issues come back to the doctor as alerts along with the call transcript.

## Flow

1. **Patients → New patient** (name, phone)
2. **Start consultation** records in the browser (or upload an audio file) → Sarvam batch STT (`saaras:v3`, diarization, auto language detection)
3. Sarvam LLM (`sarvam-105b`) labels Doctor/Patient and drafts the summary, diagnosis, prescription and follow-up questions. Everything can be edited on the visit page, and the recording plays there.
4. **Follow-up date** is a reminder on the dashboard only. **Call now** places a Sarvam Voice Agents outbound call in the language detected at the visit, and the agent switches if the patient switches.
5. Sarvam POSTs the result to `/api/webhooks/sarvam-call`. The LLM triages the transcript, and anything worrying shows up under **Alerts**.
6. **Simulate call** runs the same triage on a generated conversation, so you can demo without a phone line.

All visits and calls are stored under the patient. Audio is stored in Postgres, so it survives Render restarts.

## Run locally

```bash
python -m venv .venv
.venv/Scripts/pip install -r backend/requirements.txt   # macOS/Linux: .venv/bin/pip
cd frontend && npm install && npm run build && cd ..
cp .env.example .env    # add SARVAM_API_KEY; leave empty for demo mode
.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --port 8000
```

Open http://localhost:8000. For frontend hot reload, run `npm run dev` in `frontend/` (it proxies `/api` to port 8000).

Real calls during local dev need a public URL for the webhook, e.g. `cloudflared tunnel --url http://localhost:8000`, then set `PUBLIC_BASE_URL`.

## Deploy on Render

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick the repo. `render.yaml` creates the web service and a free Postgres database.
3. Fill in the `SARVAM_*` env vars when prompted. `RENDER_EXTERNAL_URL` is used automatically for the webhook.
4. Free web services sleep after 15 minutes idle. Point a pinger (cron-job.org, UptimeRobot) at `https://<app>.onrender.com/health` every 5 minutes so Sarvam's webhook always reaches an awake server.

## Sarvam voice agent

See [docs/sarvam-agent-prompt.md](docs/sarvam-agent-prompt.md) for the agent prompt, variables and language settings.
