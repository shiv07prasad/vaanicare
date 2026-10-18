import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, fmtDate, fmtDuration } from '../api.js'
import { CallMeta, CallTranscript, SeverityPill, StatusPill } from '../components/bits.jsx'

const ROLE_CLASS = { Doctor: 'doctor', Patient: 'patient' }

export default function VisitPage({ status, onAlertsChange }) {
  const { id } = useParams()
  const [visit, setVisit] = useState(null)
  const [error, setError] = useState('')
  const audioRef = useRef(null)

  const load = useCallback(() => api.visit(id).then(setVisit).catch((e) => setError(e.message)), [id])
  useEffect(() => { load() }, [load])

  const busy = visit && (visit.status === 'processing' ||
    visit.calls.some((c) => c.status === 'initiated' || !c.analyzed))
  useEffect(() => {
    if (!busy) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [busy, load])

  // refresh the alert badge once calls finish analysis
  useEffect(() => {
    if (visit && !busy) api.alerts().then((a) => onAlertsChange?.(a.length)).catch(() => {})
  }, [busy, visit?.calls?.length])

  if (error) return <p className="error">{error}</p>
  if (!visit) return <p className="muted">Loading…</p>

  const seek = (t) => {
    if (audioRef.current && t != null) { audioRef.current.currentTime = t; audioRef.current.play() }
  }

  return (
    <div>
      <Link to={`/patients/${visit.patient_id}`} className="back">← {visit.patient.name}</Link>
      <div className="page-head">
        <div>
          <h1>Visit · {fmtDate(visit.created_at)}</h1>
          <p className="muted">
            {[visit.patient.name, visit.patient.phone, visit.doctor_name, visit.language && `Spoken in ${visit.language}`]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        <StatusPill status={visit.status} />
      </div>

      <div className="card audio-card">
        <div className="card-label">Consultation recording</div>
        <audio ref={audioRef} controls preload="metadata" src={visit.audio_url} className="audio" />
      </div>

      {visit.status === 'processing' && (
        <div className="card processing">
          <span className="spinner big" />
          <div>
            <div className="strong">Transcribing with Sarvam…</div>
            <div className="muted">Speaker-separated transcription can take a minute for longer recordings. Notes are drafted right after.</div>
          </div>
        </div>
      )}
      {visit.status === 'failed' && (
        <div className="card error-card">
          <div className="strong">Processing failed</div>
          <p className="error">{visit.error}</p>
          <button className="btn" onClick={() => api.retryVisit(visit.id).then(setVisit)}>Retry</button>
        </div>
      )}

      {visit.status === 'ready' && (
        <div className="grid-2">
          <section className="card">
            <div className="card-label">Transcript</div>
            {visit.summary && <p className="summary">{visit.summary}</p>}
            <div className="transcript">
              {visit.transcript.map((t, i) => (
                <div key={i} className={`line ${ROLE_CLASS[t.role] || 'other'}`}>
                  <button className="ts" onClick={() => seek(t.start)} title="Play from here">
                    {t.start != null ? fmtDuration(t.start) : ''}
                  </button>
                  <div>
                    <div className="who">{t.role}</div>
                    <div className="said">{t.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="stack">
            <EditableText title="Diagnosis" value={visit.diagnosis}
              onSave={(v) => api.updateVisit(visit.id, { diagnosis: v }).then(setVisit)} />
            <EditableText title="Prescription" value={visit.prescription} mono
              onSave={(v) => api.updateVisit(visit.id, { prescription: v }).then(setVisit)} />
            <FollowUp visit={visit} setVisit={setVisit} status={status} reload={load} />
          </div>
        </div>
      )}
    </div>
  )
}

function EditableText({ title, value, onSave, mono }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (!editing) setDraft(value || '') }, [value, editing])

  async function save() {
    setSaving(true)
    try { await onSave(draft); setEditing(false) } finally { setSaving(false) }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-label">{title}</div>
        {!editing && <button className="link-btn" onClick={() => setEditing(true)}>Edit</button>}
      </div>
      {editing ? (
        <>
          <textarea rows={Math.max(4, draft.split('\n').length + 1)} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <div className="actions">
            <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </>
      ) : (
        <div className={`prose ${mono ? 'rx' : ''}`}>{value || <span className="muted">Nothing recorded.</span>}</div>
      )}
    </section>
  )
}

function FollowUp({ visit, setVisit, status, reload }) {
  const [questions, setQuestions] = useState(visit.followup_questions)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [calling, setCalling] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { if (!dirty) setQuestions(visit.followup_questions) }, [visit.followup_questions, dirty])

  const update = (i, v) => { const q = [...questions]; q[i] = v; setQuestions(q); setDirty(true) }
  const remove = (i) => { setQuestions(questions.filter((_, j) => j !== i)); setDirty(true) }
  const add = () => { setQuestions([...questions, '']); setDirty(true) }

  async function saveQuestions() {
    setSaving(true)
    try { setVisit(await api.updateVisit(visit.id, { followup_questions: questions })); setDirty(false) }
    finally { setSaving(false) }
  }

  async function setDate(value) {
    setVisit(await api.updateVisit(visit.id, value ? { followup_date: value } : { clear_followup_date: true }))
  }

  async function call(simulate) {
    setMsg('')
    setCalling(true)
    try {
      if (dirty) await saveQuestions()
      await api.callNow(visit.id, simulate)
      await reload()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setCalling(false)
    }
  }

  const activeCall = visit.calls.some((c) => c.status === 'initiated')

  return (
    <section className="card followup">
      <div className="card-label">Follow-up</div>

      <div className="followup-row">
        <label className="form-inline">Follow-up date
          <input type="date" value={visit.followup_date || ''} onChange={(e) => setDate(e.target.value)} />
        </label>
        <span className="hint">Shown on the dashboard as a reminder. Use “Call now” to place the call.</span>
      </div>

      <div className="card-head">
        <div className="sub-label">Questions the AI will ask {visit.language && <span className="muted">· call language: {visit.language}</span>}</div>
      </div>
      <ol className="questions">
        {questions.map((q, i) => (
          <li key={i}>
            <AutoGrow value={q} onChange={(e) => update(i, e.target.value)} />
            <button className="icon-btn" onClick={() => remove(i)} aria-label="Remove question">×</button>
          </li>
        ))}
      </ol>
      <div className="actions spread">
        <button className="link-btn" onClick={add}>+ Add question</button>
        {dirty && <button className="btn" disabled={saving} onClick={saveQuestions}>{saving ? 'Saving…' : 'Save questions'}</button>}
      </div>

      <div className="call-bar">
        <button className="btn primary" disabled={calling || activeCall || !status?.calling_configured}
          title={status?.calling_configured ? '' : 'Configure Sarvam calling env vars to enable'}
          onClick={() => call(false)}>
          📞 {activeCall ? 'Call in progress…' : calling ? 'Starting call…' : `Call ${visit.patient.name.split(' ')[0]} now`}
        </button>
        <button className="btn" disabled={calling || activeCall} onClick={() => call(true)}>Simulate call</button>
      </div>
      {!status?.calling_configured && (
        <p className="hint">Real calls are off until the Sarvam Voice Agent settings are added. “Simulate call” runs the same analysis on a generated conversation.</p>
      )}
      {msg && <p className="error">{msg}</p>}

      {visit.calls.length > 0 && (
        <div className="calls">
          <div className="sub-label">Call history</div>
          {visit.calls.map((c) => <CallCard key={c.id} call={c} onAck={async () => { await api.acknowledge(c.id); reload() }} />)}
        </div>
      )}
    </section>
  )
}

function AutoGrow(props) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 2 + 'px'
  }, [props.value])
  return <textarea ref={ref} rows={1} {...props} />
}

export function CallCard({ call, onAck, showPatient }) {
  const [open, setOpen] = useState(call.has_issues && !call.acknowledged)
  const [english, setEnglish] = useState(false)
  const turns = english && call.transcript_en ? call.transcript_en : call.transcript

  return (
    <div className={`call-card ${call.has_issues && !call.acknowledged ? 'flagged' : ''}`}>
      <div className="call-top">
        <div>
          {showPatient && <div className="strong">{call.patient_name}</div>}
          <CallMeta call={call} />
        </div>
        <div className="pills">
          <StatusPill status={call.status} />
          {call.analyzed && call.status !== 'initiated' && <SeverityPill severity={call.severity} />}
        </div>
      </div>
      {call.status === 'initiated' && <p className="muted small">Waiting for the call to finish. The result comes back from Sarvam automatically.</p>}
      {call.analysis_summary && <p>{call.analysis_summary}</p>}
      {call.issues?.length > 0 && (
        <ul className="issues">{call.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
      )}
      {call.failure_reason && call.status === 'failed' && <p className="error small">{call.failure_reason}</p>}
      <div className="actions spread">
        {call.transcript?.length ? (
          <button className="link-btn" onClick={() => setOpen(!open)}>{open ? 'Hide transcript' : 'Show transcript'}</button>
        ) : <span />}
        <div className="actions">
          {open && call.transcript_en && (
            <button className="link-btn" onClick={() => setEnglish(!english)}>{english ? 'Original language' : 'English'}</button>
          )}
          {call.has_issues && !call.acknowledged && onAck && <button className="btn small" onClick={onAck}>Mark reviewed</button>}
          {call.acknowledged && <span className="muted small">Reviewed ✓</span>}
        </div>
      </div>
      {open && <CallTranscript turns={turns} patientName={call.patient_name} />}
    </div>
  )
}
