import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { api } from './api.js'
import Patients from './pages/Patients.jsx'
import PatientDetail from './pages/PatientDetail.jsx'
import VisitPage from './pages/VisitPage.jsx'
import Alerts from './pages/Alerts.jsx'

export default function App() {
  const [status, setStatus] = useState(null)
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    api.status().then(setStatus).catch(() => {})
    const load = () => api.alerts().then((a) => setAlertCount(a.length)).catch(() => {})
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">+</span>
          <span>VaaniCare</span>
          <span className="brand-sub">Voice clinic assistant</span>
        </NavLink>
        <nav>
          <NavLink to="/" end>Patients</NavLink>
          <NavLink to="/alerts">
            Alerts {alertCount > 0 && <span className="badge-count">{alertCount}</span>}
          </NavLink>
        </nav>
      </header>
      {status?.mock_mode && (
        <div className="banner">
          Demo mode: no <code>SARVAM_API_KEY</code> is set, so transcription and AI notes return sample data.
        </div>
      )}
      <main className="content">
        <Routes>
          <Route path="/" element={<Patients />} />
          <Route path="/patients/:id" element={<PatientDetail />} />
          <Route path="/visits/:id" element={<VisitPage status={status} onAlertsChange={setAlertCount} />} />
          <Route path="/alerts" element={<Alerts onChange={setAlertCount} />} />
        </Routes>
      </main>
    </div>
  )
}
