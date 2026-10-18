import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { IsoIcon, IsoWave, Logo, useIsoStack } from '../components/Iso.jsx'

const STEPS = [
  { icon: 'mic', title: 'Record the consultation', text: 'The doctor taps record. The whole conversation is captured in the browser, in whatever mix of languages it happens.' },
  { icon: 'transcript', title: 'Diarized transcript', text: 'Sarvam speech-to-text separates doctor and patient, detects the language and timestamps every line.' },
  { icon: 'notes', title: 'Clinical notes drafted', text: 'Diagnosis, prescription and follow-up questions are drafted from the transcript. The doctor edits anything before it counts.' },
  { icon: 'phone', title: 'AI follow-up call', text: 'One click and a voice nurse calls the patient in the language they spoke, switching if they switch.' },
  { icon: 'bell', title: 'Doctor alerted', text: 'Every call is triaged. Red flags land on the dashboard with severity and the full transcript.' },
]

const FEATURES = [
  { icon: 'wave', title: 'Speaker separation', text: 'Doctor and patient lines are split automatically, with timestamps you can click to replay.' },
  { icon: 'globe', title: '11 Indian languages', text: 'Hindi, Tamil, Bengali, Telugu and more, including mid-sentence code-mixing with English.' },
  { icon: 'timeline', title: 'One timeline per patient', text: 'Every visit, recording, note and call is kept under the patient, ready for the next consult.' },
  { icon: 'notes', title: 'Editable by design', text: 'AI drafts, the doctor decides. Diagnosis, prescription and call questions stay fully editable.' },
  { icon: 'phone', title: 'Call now', text: 'No dialer, no scripts. The agent knows the diagnosis, the medicines and what to ask.' },
  { icon: 'bell', title: 'Triage, not noise', text: 'Only calls that need attention raise an alert, ranked low, medium or high.' },
]

const LANGS = ['हिन्दी', 'English', 'தமிழ்', 'বাংলা', 'తెలుగు', 'मराठी', 'ગુજરાતી', 'ಕನ್ನಡ', 'മലയാളം', 'ਪੰਜਾਬੀ', 'ଓଡ଼ିଆ']

function Process() {
  const [active, setActive] = useState(2)
  const pausedUntil = useRef(0)
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() > pausedUntil.current) setActive((a) => (a + 1) % STEPS.length)
    }, 2800)
    return () => clearInterval(t)
  }, [])
  const pick = (i) => { setActive(i); pausedUntil.current = Date.now() + 9000 }
  const { svg, centers } = useIsoStack({ steps: STEPS, active, size: 220 })

  return (
    <div className="process">
      <div className="process-art">{svg}</div>
      {STEPS.map((s, i) => (
        <button
          key={i}
          className={`process-label ${i % 2 ? 'left' : 'right'} ${i === active ? 'is-active' : ''}`}
          style={{ top: `${centers[i]}%` }}
          onMouseEnter={() => pick(i)}
          onFocus={() => pick(i)}
          onClick={() => pick(i)}
        >
          <span className="process-title"><span className="num">{i + 1}</span>{s.title}</span>
          <span className="process-text">{s.text}</span>
        </button>
      ))}
    </div>
  )
}

export default function Landing() {
  return (
    <div className="landing">
      <header className="l-nav">
        <Link to="/" className="brand"><Logo size={30} /><span>VaaniCare</span></Link>
        <nav>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#languages">Languages</a>
        </nav>
        <Link to="/app" className="btn primary">Open dashboard →</Link>
      </header>

      <section className="l-frame l-hero">
        <div className="hero-copy">
          <div className="eyebrow">[ Voice-first clinical assistant ]</div>
          <h1 className="display"><span className="dim">Every consultation,</span><br />heard and followed up.</h1>
          <p className="lead">
            VaaniCare records the conversation in the exam room, turns it into a diarized transcript and clinical notes,
            then calls the patient back in their own language and flags anything the doctor should see.
          </p>
          <div className="hero-cta">
            <Link to="/app" className="btn primary big">Start a consultation</Link>
            <a href="#how" className="btn big">See how it works</a>
          </div>
          <dl className="hero-stats">
            <div><dt>11</dt><dd>Indian languages</dd></div>
            <div><dt>2</dt><dd>speakers separated</dd></div>
            <div><dt>1 click</dt><dd>to call the patient</dd></div>
          </dl>
        </div>
        <div className="hero-art">
          <IsoWave size={300} />
          <span className="tag t1">[ DOCTOR · 00:04 ]</span>
          <span className="tag t2">[ हिन्दी ↔ ENGLISH ]</span>
          <span className="tag t3">[ PATIENT · 00:09 ]</span>
        </div>
      </section>

      <section className="l-frame" id="how">
        <div className="frame-head">
          <div>
            <div className="eyebrow">[ How it works ]</div>
            <h2 className="display sm"><span className="dim">From the exam room</span><br />to the follow-up call</h2>
          </div>
          <p className="lead small">
            Five layers, one pipeline. Speech-to-text, the LLM and the voice agent all run on Sarvam AI,
            built for Indian languages from the ground up.
          </p>
        </div>
        <div className="frame-body"><Process /></div>
      </section>

      <section className="l-frame" id="features">
        <div className="frame-head">
          <div>
            <div className="eyebrow">[ Features ]</div>
            <h2 className="display sm"><span className="dim">Built for the way</span><br />Indian clinics talk</h2>
          </div>
        </div>
        <div className="feature-grid">
          {FEATURES.map((ft, i) => (
            <article key={ft.title} className="feature">
              <IsoIcon icon={ft.icon} size={110} active={i === 1} />
              <div className="mono-num">{String(i + 1).padStart(2, '0')}</div>
              <h3>{ft.title}</h3>
              <p>{ft.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="l-frame" id="languages">
        <div className="frame-head">
          <div>
            <div className="eyebrow">[ Languages ]</div>
            <h2 className="display sm"><span className="dim">Speaks the patient's</span><br />language. Switches with them.</h2>
          </div>
          <p className="lead small">
            The follow-up call starts in the language detected at the visit. If the patient answers in another one,
            the nurse follows.
          </p>
        </div>
        <div className="lang-row">
          {LANGS.map((l, i) => <span key={l} className={`lang ${i === 0 ? 'is-active' : ''}`}>{l}</span>)}
        </div>
      </section>

      <section className="l-frame l-cta">
        <div>
          <div className="eyebrow">[ Built on Sarvam AI ]</div>
          <h2 className="display sm"><span className="dim">Less typing.</span><br />More doctoring.</h2>
        </div>
        <Link to="/app" className="btn primary big">Open the dashboard →</Link>
      </section>

      <footer className="l-foot">
        <span className="brand small"><Logo size={22} /> VaaniCare</span>
        <span className="mono muted">AI drafts are assistive. Clinical decisions stay with the doctor.</span>
      </footer>
    </div>
  )
}
