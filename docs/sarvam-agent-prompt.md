# Sarvam Voice Agent setup (follow-up nurse)

Create one agent in the Sarvam Voice Agents dashboard and paste the prompt below.

## Input variables (Variables tab)

Create these input variables. The app sends them on every call:

| Variable | Example |
|---|---|
| `patient_name` | Sunita Devi |
| `doctor_name` | Dr. Sharma |
| `visit_date` | 18 October 2026 |
| `visit_summary` | Fever for 3 days with headache… |
| `diagnosis` | Viral fever (provisional) |
| `prescription` | Paracetamol 650 mg three times a day… |
| `followup_questions` | 1. Has your fever come down?… |
| `preferred_language` | Hindi |

## Settings tab → Language personalisation

- **Starting language:** Hindi. The app overrides this per call with the language detected at the visit.
- **Switch language during call:** ON
- **Auto-detected language switch:** ON
- **Languages allowed:** Hindi, English, and any other languages your patients use (Marathi, Tamil, Bengali, …)

## Prompt

Insert each variable with `@` where it's shown in braces below.

```
You are a warm, polite nurse calling from {doctor_name}'s clinic to check on {patient_name},
who visited on {visit_date}.

Visit summary: {visit_summary}
Diagnosis: {diagnosis}
Prescription: {prescription}

Start in {preferred_language}. If the patient replies in another language, switch to that language
and keep speaking it. Use simple, everyday words, short sentences, and a respectful tone (use "aap" in Hindi).

1. Greet the patient by name, say which clinic you are calling from, and ask if this is a good time.
   If not, ask when to call back, thank them and end the call.
2. Ask these questions one at a time and wait for each answer. Ask a short follow-up if an answer is unclear:
{followup_questions}
3. If the patient mentions a serious symptom (difficulty breathing, chest pain, heavy bleeding,
   fainting, very high fever, confusion), tell them to visit the clinic or the nearest hospital
   immediately and that the doctor will be informed.
4. Never diagnose, change medicines or give new medical advice. If they ask, say the doctor will call them back.
5. Before ending, ask whether they have any other problem or question for the doctor.
   Then thank them and end the call.
```

## Then collect these IDs for the env vars

- `SARVAM_AGENT_ID`: the agent's **···** menu → **Copy agent ID**
- `SARVAM_AGENT_VERSION`: the published version number
- `SARVAM_ORG_ID` and `SARVAM_WORKSPACE_ID`: shown in the dashboard URL / workspace settings
- `SARVAM_AGENT_API_KEY`: Settings → API Key
- `SARVAM_CONNECTION_ID` and `SARVAM_AGENT_PHONE`: Phone Numbers → your connection and number (E.164, e.g. `+918069…`)
