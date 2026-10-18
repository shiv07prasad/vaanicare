import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtDate } from '../api.js'
import { CallTranscript } from '../components/bits.jsx'
import { IsoIcon, IsoWave } from '../components/Iso.jsx'

const METRIC_ORDER = ['Question coverage', 'Language handling', 'Safety & escalation', 'Role adherence']
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const tone = (v) => (v == null ? '' : v >= 0.8 ? 'ok' : v >= 0.6 ? 'warn' : 'danger')

export default function Evals() {
  const [info, setInfo] = useState(null)
  const [data, setData] = useState(null)
  const [runs, setRuns] = useState([])
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [i, d, r] = await Promise.all([api.evalsInfo(), api.evalCalls(), api.evalRuns()])
    setInfo(i)
    setData(d)
    setRuns(r)
  }, [])

  useEffect(() => { load().catch(() => {}) }, [load])

  const running = info?.running
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => load().catch(() => {}), 4000)
    return () => clearInterval(t)
  }, [running?.id, load])

  async function start() {
    setError('')
    setStarting(true)
    try {
      await api.startEval()
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setStarting(false)
    }
  }

  const pending = info?.pending_calls ?? 0
  const metrics = data?.summary?.metrics || {}

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">[ Evaluations ]</div>
          <h1><span className="dim">Voice agent</span> evals</h1>
          <p className="muted">
            Real follow-up calls scored by <strong>{info?.judge_model || 'Gemma 4'}</strong> with DeepEval. Each call is
            evaluated once; new calls are picked up the next time you run evals.
          </p>
        </div>
      </div>

      <section className="card eval-control">
        <div className="eval-control-main">
          <div className="card-label">Run evals</div>
          <div className="eval-counts">
            <div><span className="big-num">{info?.evaluated_calls ?? '—'}</span><span className="mono muted">calls evaluated</span></div>
            <div><span className={`big-num ${pending ? 'accent' : ''}`}>{info ? pending : '—'}</span><span className="mono muted">new calls waiting</span></div>
          </div>
          {running && (
            <>
              <div className="progress"><div style={{ width: `${(running.completed / Math.max(1, running.total)) * 100}%` }} /></div>
              <p className="hint">Scoring {running.completed}/{running.total} calls… this takes a few minutes per batch.</p>
            </>
          )}
          <div className="actions">
            <button className="btn primary big" onClick={start} disabled={starting || !!running || !pending || !info?.judge_ready}>
              {running ? 'Evaluating…' : starting ? 'Starting…' : pending ? `▶ Run evals on ${pending} new call${pending > 1 ? 's' : ''}` : '✓ All calls evaluated'}
            </button>
            {info && !info.judge_ready && <span className="error small">Set GEMINI_API_KEY to enable the Gemma 4 judge.</span>}
          </div>
          {error && <p className="error">{error}</p>}
        </div>
        <div className="eval-control-art"><IsoWave size={220} live={!!running} /></div>
      </section>

      {data && data.results.length > 0 ? (
        <>
          <div className="eval-run-head">
            <div>
              <div className="eyebrow">[ Across all evaluated calls ]</div>
              <h2>Scorecard</h2>
            </div>
          </div>
          <div className="scorecard">
            {METRIC_ORDER.map((m) => (
              <div key={m} className={`score-tile ${tone(metrics[m])}`}>
                <div className="score-name">{m}</div>
                <div className="score-value">{pct(metrics[m])}</div>
                <div className="score-bar"><div style={{ width: `${(metrics[m] || 0) * 100}%` }} /></div>
              </div>
            ))}
            <div className="score-tile accent">
              <div className="score-name">Calls passed</div>
              <div className="score-value">{data.summary.passed}<span className="dim">/{data.summary.total}</span></div>
              <div className="score-bar"><div style={{ width: `${(data.summary.passed / Math.max(1, data.summary.total)) * 100}%` }} /></div>
            </div>
          </div>

          <div className="eval-results">
            {data.results.map((r) => <ResultRow key={r.id} r={r} />)}
          </div>
        </>
      ) : (
        data && (
          <div className="empty card">
            <IsoIcon icon="check" size={120} active />
            <h3>No calls evaluated yet</h3>
            <p className="muted">Place a follow-up call with “Call now”, then come back and run evals.</p>
          </div>
        )
      )}

      {runs.length > 0 && (
        <section className="eval-history">
          <div className="eyebrow">[ Run history ]</div>
          <div className="card table-card">
            <table className="table">
              <thead><tr><th>Run</th><th>Calls</th><th>Passed</th><th>Judge</th><th>Status</th></tr></thead>
              <tbody>
                {runs.map((x) => (
                  <tr key={x.id} className="no-click">
                    <td><span className="strong">#{x.id}</span> <span className="muted small">{fmtDate(x.created_at)}</span></td>
                    <td>{x.completed}/{x.total}</td>
                    <td>{pct(x.summary?.pass_rate)}</td>
                    <td className="mono">{x.judge_model}</td>
                    <td><RunStatus run={x} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function RunStatus({ run }) {
  if (run.status === 'running') return <span className="pill info"><span className="spinner" />{run.completed}/{run.total}</span>
  if (run.status === 'failed') return <span className="pill danger">Failed</span>
  return <span className="pill ok">Done</span>
}

function ResultRow({ r }) {
  const [open, setOpen] = useState(false)
  const byName = Object.fromEntries((r.metrics || []).map((m) => [m.name, m]))
  return (
    <div className={`eval-row ${open ? 'is-open' : ''} ${r.passed ? '' : 'is-fail'}`}>
      <button className="eval-row-head" onClick={() => setOpen(!open)}>
        <span className={`pill ${r.passed ? 'ok' : 'danger'}`}>{r.passed ? 'Pass' : 'Fail'}</span>
        <span className="eval-title">{r.title}</span>
        <span className="eval-chips">
          {METRIC_ORDER.filter((m) => byName[m]).map((m) => (
            <span key={m} className={`chip ${tone(byName[m].score)}`} title={m}>{m.split(' ')[0]} {pct(byName[m].score)}</span>
          ))}
        </span>
        <span className="chev">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="eval-detail">
          <div>
            <div className="card-label">Call transcript</div>
            <CallTranscript turns={r.transcript} patientName={r.context?.patient} />
            {r.context?.visit_id && <Link className="link-btn small" to={`/visits/${r.context.visit_id}`}>Open the visit →</Link>}
          </div>
          <div>
            <div className="card-label">Judge reasoning</div>
            {(r.metrics || []).map((m) => (
              <div key={m.name} className="reason">
                <div className="reason-head">
                  <span className="strong">{m.name}</span>
                  <span className={`pill ${tone(m.score)}`}>{pct(m.score)}</span>
                </div>
                <p>{m.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
