import os

from dotenv import load_dotenv

load_dotenv()


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


DATABASE_URL = _env("DATABASE_URL", "sqlite:///./healthcare.db")
# Render hands out postgres:// URLs; SQLAlchemy needs postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Public URL of this app, used for the Sarvam post-call webhook.
# On Render this is set automatically as RENDER_EXTERNAL_URL.
PUBLIC_BASE_URL = (_env("PUBLIC_BASE_URL") or _env("RENDER_EXTERNAL_URL")).rstrip("/")

# Sarvam API platform (speech-to-text + LLM)
SARVAM_API_KEY = _env("SARVAM_API_KEY")
SARVAM_STT_MODEL = _env("SARVAM_STT_MODEL", "saaras:v3")
SARVAM_STT_LANGUAGE = _env("SARVAM_STT_LANGUAGE", "unknown")  # "unknown" = auto-detect
SARVAM_LLM_MODEL = _env("SARVAM_LLM_MODEL", "sarvam-105b")
SARVAM_CHAT_URL = _env("SARVAM_CHAT_URL", "https://api.sarvam.ai/v1/chat/completions")

# Sarvam Voice Agents (outbound follow-up calls)
SARVAM_AGENT_API_KEY = _env("SARVAM_AGENT_API_KEY")
SARVAM_ORG_ID = _env("SARVAM_ORG_ID")
SARVAM_WORKSPACE_ID = _env("SARVAM_WORKSPACE_ID")
SARVAM_AGENT_ID = _env("SARVAM_AGENT_ID")
SARVAM_AGENT_VERSION = int(_env("SARVAM_AGENT_VERSION", "1") or 1)
SARVAM_CONNECTION_ID = _env("SARVAM_CONNECTION_ID")
SARVAM_AGENT_PHONE = _env("SARVAM_AGENT_PHONE")

# Mock mode: fake Sarvam responses so the app can be demoed without keys.
MOCK_SARVAM = _env("MOCK_SARVAM", "auto").lower()


def stt_llm_mocked() -> bool:
    if MOCK_SARVAM in ("1", "true", "yes"):
        return True
    if MOCK_SARVAM in ("0", "false", "no"):
        return False
    return not SARVAM_API_KEY


def calling_configured() -> bool:
    return all([SARVAM_AGENT_API_KEY, SARVAM_ORG_ID, SARVAM_WORKSPACE_ID,
                SARVAM_AGENT_ID, SARVAM_CONNECTION_ID, SARVAM_AGENT_PHONE])
