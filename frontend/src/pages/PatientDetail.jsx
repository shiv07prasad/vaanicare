import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fmtDate } from '../api.js'
import PatientForm from '../components/PatientForm.jsx'
import Recorder from '../components/Recorder.jsx'
import { StatusPill } from '../components/bits.jsx'

export default function PatientDetail() {
  const { id } = useParams()
  const [patient, setPatient] = useState(null)
  const [error, setError] = useState('')
  const [recording, setRecording] = useState(false)
  const [editing, setEditing] = useState(false)
  const navigate = useNavigate()

  const load = useCallback(() => api.patient(id).then(setPatient).catch((e) => setError(e.message)), [id])
  useEffect(() => { load() }, [load])

  // keep polling while any visit is still processing
  useEffect(() => {
    if (!patient?.visits?.some((v) => v.status === 'processing')) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [patient, load])

  if (error) return <p className="error">{error}</p>
  if (!patient) return <p className="muted">Loading…</p>

  return (
    <div>
      <Link to="/" className="back">← All patients</Link>
      <div className="page-head">
        <div className="patient-head">
          <div className="avatar">{patient.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</div>
          <div>
            <h1>{patient.name}</h1>
            <p className="muted">
              {[patient.age && `${patient.age} yrs`, patient.gender, patient.phone, patient.language && `Speaks ${patient.language}`]
                .filter(Boolean).join(' · ')}
              {' · '}<button className="link-btn inline" onClick={() => setEditing(true)}>Edit</button>
            </p>
          </div>
        </div>
        <button className="btn primary" onClick={() => setRecording(true)}>● Start consultation</button>
      </div>

      <h2 className="section-title">Sessions <span className="muted">({patient.visits.length})</span></h2>
      {patient.visits.length === 0 ? (
        <div className="empty card">
          <h3>No sessions yet</h3>
          <p className="muted">Start a consultation to record and transcribe the conversation.</p>
        </div>
      ) : (
        <div className="timeline">
          {patient.visits.map((v, i) => (
            <Link to={`/visits/${v.id}`} key={v.id} className="card visit-card">
              <div className="visit-card-top">
                <div>
                  <div className="strong">Visit {patient.visits.length - i} · {fmtDate(v.created_at)}</div>
                  <div className="muted small">{[v.doctor_name, v.language].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="pills">
                  {v.open_issues > 0 && <span className="pill danger">{v.open_issues} alert{v.open_issues > 1 ? 's' : ''}</span>}
                  <StatusPill status={v.status} />
                </div>
              </div>
              {v.status === 'ready' && <p className="visit-dx">{v.diagnosis}</p>}
              {v.status === 'processing' && <p className="muted">Transcribing with Sarvam and drafting notes…</p>}
              {v.status === 'failed' && <p className="error small">{v.error}</p>}
              <div className="muted small">
                {v.followup_date ? `Follow-up: ${fmtDate(v.followup_date, false)}` : 'No follow-up scheduled'}
                {v.call_count > 0 && ` · ${v.call_count} call${v.call_count > 1 ? 's' : ''}`}
              </div>
            </Link>
          ))}
        </div>
      )}

      {recording && (
        <Recorder patient={patient} onClose={() => setRecording(false)}
          onUploaded={(v) => navigate(`/visits/${v.id}`)} />
      )}
      {editing && <PatientForm patient={patient} onClose={() => setEditing(false)} onSaved={load} />}
    </div>
  )
}
