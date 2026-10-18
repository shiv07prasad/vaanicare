import { useEffect, useState } from 'react'
import { NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { api } from './api.js'
import { Logo } from './components/Iso.jsx'
import Landing from './pages/Landing.jsx'
import Patients from './pages/Patients.jsx'
import PatientDetail from './pages/PatientDetail.jsx'
import VisitPage from './pages/VisitPage.jsx'
import Alerts from './pages/Alerts.jsx'

function Shell({ status, alertCount }) {
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <Logo size={28} />
          <span>VaaniCare</span>
          <span className="brand-sub">[ Clinic dashboard ]</span>
        </NavLink>
        <nav>
          <NavLink to="/app" end>Patients</NavLink>
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
      <main className="content"><Outlet /></main>
    </div>
  )
}

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
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<Shell status={status} alertCount={alertCount} />}>
        <Route path="/app" element={<Patients />} />
        <Route path="/patients/:id" element={<PatientDetail />} />
        <Route path="/visits/:id" element={<VisitPage status={status} onAlertsChange={setAlertCount} />} />
        <Route path="/alerts" element={<Alerts onChange={setAlertCount} />} />
      </Route>
    </Routes>
  )
}
