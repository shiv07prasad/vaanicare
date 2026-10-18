import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { CallCard } from './VisitPage.jsx'

export default function Alerts({ onChange }) {
  const [alerts, setAlerts] = useState(null)

  const load = () => api.alerts().then((a) => { setAlerts(a); onChange?.(a.length) }).catch(() => setAlerts([]))
  useEffect(() => {
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [])

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Alerts</h1>
          <p className="muted">Follow-up calls where the AI found something the doctor should look at.</p>
        </div>
      </div>
      {alerts === null ? <p className="muted">Loading…</p> : alerts.length === 0 ? (
        <div className="empty card"><h3>All clear</h3><p className="muted">No follow-up calls need your attention.</p></div>
      ) : (
        <div className="stack">
          {alerts.map((c) => (
            <div key={c.id}>
              <CallCard call={c} showPatient onAck={async () => { await api.acknowledge(c.id); load() }} />
              <Link className="link-btn small" to={`/visits/${c.visit_id}`}>Open visit →</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
