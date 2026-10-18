import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, fmtDate } from '../api.js'
import PatientForm from '../components/PatientForm.jsx'

export default function Patients() {
  const [patients, setPatients] = useState(null)
  const [q, setQ] = useState('')
  const [showForm, setShowForm] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => api.patients(q).then(setPatients).catch(() => setPatients([])), 200)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Patients</h1>
          <p className="muted">Every clinic visit and follow-up call, organised by patient.</p>
        </div>
        <button className="btn primary" onClick={() => setShowForm(true)}>+ New patient</button>
      </div>

      <input className="search" placeholder="Search by name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />

      {patients === null ? (
        <p className="muted">Loading…</p>
      ) : patients.length === 0 ? (
        <div className="empty card">
          <h3>No patients yet</h3>
          <p className="muted">Add a patient to start recording a consultation.</p>
          <button className="btn primary" onClick={() => setShowForm(true)}>+ New patient</button>
        </div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Language</th><th>Visits</th><th>Last visit</th><th></th></tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/patients/${p.id}`)}>
                  <td>
                    <Link to={`/patients/${p.id}`} className="strong">{p.name}</Link>
                    <div className="muted small">{[p.age && `${p.age} yrs`, p.gender].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td>{p.phone}</td>
                  <td>{p.language || <span className="muted">—</span>}</td>
                  <td>{p.visit_count}</td>
                  <td>{fmtDate(p.last_visit, false)}</td>
                  <td>{p.open_issues > 0 && <span className="pill danger">{p.open_issues} alert{p.open_issues > 1 ? 's' : ''}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <PatientForm
          onClose={() => setShowForm(false)}
          onSaved={(p) => navigate(`/patients/${p.id}`)}
        />
      )}
    </div>
  )
}
