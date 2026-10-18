import { fmtDate, fmtDuration } from '../api.js'

export function StatusPill({ status }) {
  const map = {
    processing: ['Processing', 'info'], ready: ['Ready', 'ok'], failed: ['Failed', 'danger'],
    initiated: ['Calling…', 'info'], connected: ['Completed', 'ok'], no_answer: ['No answer', 'warn'],
    busy: ['Busy', 'warn'],
  }
  const [label, kind] = map[status] || [status, '']
  return <span className={`pill ${kind}`}>{status === 'processing' || status === 'initiated' ? <span className="spinner" /> : null}{label}</span>
}

export function SeverityPill({ severity }) {
  if (!severity || severity === 'none') return <span className="pill ok">No issues</span>
  const kind = severity === 'high' ? 'danger' : severity === 'medium' ? 'warn' : 'info'
  return <span className={`pill ${kind}`}>{severity} priority</span>
}

export function CallTranscript({ turns }) {
  if (!turns?.length) return null
  return (
    <div className="chat">
      {turns.map((t, i) => {
        const agent = t.role === 'agent' || t.role === 'assistant'
        return (
          <div key={i} className={`bubble ${agent ? 'left' : 'right'}`}>
            <div className="bubble-who">{agent ? 'AI nurse' : 'Patient'}{t.language ? ` · ${t.language}` : ''}</div>
            <div>{t.text}</div>
          </div>
        )
      })}
    </div>
  )
}

export function CallMeta({ call }) {
  return (
    <span className="muted small">
      {fmtDate(call.created_at)}
      {call.language && ` · ${call.language}`}
      {call.duration ? ` · ${fmtDuration(call.duration)}` : ''}
      {call.simulated && ' · simulated'}
    </span>
  )
}
