"""Generate the sample consultation recordings offered in the recorder.

Each sample is a short doctor/patient conversation voiced with Sarvam text-to-speech
(two different speakers), saved as 16 kHz mono WAV in frontend/public/samples/.

Run from the project root:  .venv/Scripts/python scripts/make_samples.py
"""
import base64
import io
import os
import sys
import wave

from dotenv import load_dotenv
from sarvamai import SarvamAI

load_dotenv(".env")
OUT = os.path.join("frontend", "public", "samples")
DOCTOR, PATIENT = "rahul", "priya"

SAMPLES = {
    "hindi": ("hi-IN", [
        (DOCTOR, "नमस्ते, आइए बैठिए। बताइए क्या तकलीफ है?"),
        (PATIENT, "डॉक्टर साहब, चार दिन से पेट में दर्द है और खाना खाने के बाद जलन होती है।"),
        (DOCTOR, "उल्टी या बुखार तो नहीं है? और आप बाहर का तला हुआ खाना ज़्यादा खाती हैं?"),
        (PATIENT, "बुखार नहीं है, बस कभी कभी खट्टी डकार आती है। हाँ, ऑफिस में चाय और समोसा रोज़ होता है।"),
        (DOCTOR, "ठीक है, यह एसिडिटी लग रही है। पैंटोप्राज़ोल चालीस एम जी सुबह खाली पेट, चौदह दिन तक लीजिए। चाय कम कीजिए और तला हुआ खाना बंद। अगर दर्द बढ़े या काला मल आए तो तुरंत आइए।"),
        (PATIENT, "ठीक है डॉक्टर साहब, धन्यवाद।"),
    ]),
    "english": ("en-IN", [
        (DOCTOR, "Good morning, please have a seat. What brings you in today?"),
        (PATIENT, "Doctor, I've had a fever and sore throat for three days, and since yesterday a dry cough."),
        (DOCTOR, "Any difficulty breathing, chest pain or body ache? Have you taken any medicine?"),
        (PATIENT, "No breathing trouble, just body ache. I took one paracetamol last night."),
        (DOCTOR, "Your throat looks red. This looks like a viral throat infection. Take paracetamol five hundred milligrams three times a day after food for three days, do warm salt water gargles twice a day, and drink plenty of fluids. If the fever goes above one hundred and two or you feel breathless, come back immediately."),
        (PATIENT, "Okay doctor, thank you."),
    ]),
    "kannada": ("kn-IN", [
        (DOCTOR, "ನಮಸ್ಕಾರ, ಕುಳಿತುಕೊಳ್ಳಿ. ಏನು ತೊಂದರೆ ಆಗ್ತಿದೆ?"),
        (PATIENT, "ಡಾಕ್ಟರ್, ಒಂದು ವಾರದಿಂದ ತಲೆನೋವು ಇದೆ, ಬೆಳಿಗ್ಗೆ ತಲೆ ಸುತ್ತುತ್ತದೆ."),
        (DOCTOR, "ನಿಮ್ಮ ಬಿಪಿ ನೂರ ಐವತ್ತು ಬೈ ತೊಂಬತ್ತೈದು ಇದೆ. ಉಪ್ಪು ಜಾಸ್ತಿ ತಿನ್ನುತ್ತೀರಾ? ಮನೆಯಲ್ಲಿ ಯಾರಿಗಾದರೂ ಬಿಪಿ ಇದೆಯಾ?"),
        (PATIENT, "ಹೌದು, ಉಪ್ಪಿನಕಾಯಿ ಜಾಸ್ತಿ ತಿನ್ನುತ್ತೇನೆ. ನನ್ನ ಅಪ್ಪನಿಗೂ ಬಿಪಿ ಇದೆ."),
        (DOCTOR, "ಇದು ಹೈ ಬ್ಲಡ್ ಪ್ರೆಶರ್. ಆಮ್ಲೋಡಿಪಿನ್ ಐದು ಎಂಜಿ ದಿನಕ್ಕೆ ಒಂದು ಬಾರಿ ಬೆಳಿಗ್ಗೆ ತೆಗೆದುಕೊಳ್ಳಿ. ಉಪ್ಪು ಕಡಿಮೆ ಮಾಡಿ, ದಿನಾ ಮೂವತ್ತು ನಿಮಿಷ ನಡೆಯಿರಿ. ಎದೆನೋವು ಅಥವಾ ಕಣ್ಣು ಮಂಜಾದರೆ ತಕ್ಷಣ ಬನ್ನಿ."),
        (PATIENT, "ಸರಿ ಡಾಕ್ಟರ್, ಧನ್ಯವಾದಗಳು."),
    ]),
    "tamil": ("ta-IN", [
        (DOCTOR, "வணக்கம், உட்காருங்க. என்ன பிரச்சனை?"),
        (PATIENT, "டாக்டர், ஒரு மாசமா ரொம்ப தாகமா இருக்கு, அடிக்கடி சிறுநீர் போகுது, சோர்வா இருக்கு."),
        (DOCTOR, "உங்க சர்க்கரை அளவு இருநூற்று முப்பது இருக்கு. இனிப்பு அதிகமா சாப்பிடுவீங்களா?"),
        (PATIENT, "ஆமா டாக்டர், காபியில நிறைய சர்க்கரை போடுவேன்."),
        (DOCTOR, "இது சர்க்கரை நோய். மெட்ஃபார்மின் ஐநூறு எம்ஜி காலையும் இரவும் சாப்பாட்டுக்கு அப்புறம் எடுத்துக்கோங்க. இனிப்பு குறைங்க, தினமும் நடங்க. இரண்டு வாரம் கழிச்சு சர்க்கரை டெஸ்ட் பண்ணுங்க. மயக்கம் வந்தா உடனே வாங்க."),
        (PATIENT, "சரி டாக்டர், நன்றி."),
    ]),
}


def main() -> None:
    key = os.getenv("SARVAM_API_KEY", "").strip()
    if not key:
        sys.exit("SARVAM_API_KEY is not set in .env")
    client = SarvamAI(api_subscription_key=key)
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[1:])
    for name, (lang, lines) in SAMPLES.items():
        if only and name not in only:
            continue
        frames, params = [], None
        for speaker, text in lines:
            r = client.text_to_speech.convert(text=text, language_code=lang, speaker=speaker,
                                              model="bulbul:v3", speech_sample_rate=16000)
            for chunk in r.audios:
                w = wave.open(io.BytesIO(base64.b64decode(chunk)))
                params = params or w.getparams()
                frames.append(w.readframes(w.getnframes()))
            frames.append(b"\x00\x00" * 9600)  # 0.6 s pause between turns
        path = os.path.join(OUT, f"{name}.wav")
        with wave.open(path, "wb") as out:
            out.setparams(params)
            out.writeframes(b"".join(frames))
        secs = sum(len(f) for f in frames) / 2 / params.framerate
        print(f"{path}: {secs:.0f}s, {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()
