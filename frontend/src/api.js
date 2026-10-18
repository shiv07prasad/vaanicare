async function request(path, options = {}) {
  const res = await fetch(path, options)
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = await res.json()
      msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail || body)
    } catch {}
    throw new Error(msg)
  }
  return res.json()
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  status: () => request('/api/status'),
  patients: (q = '') => request(`/api/patients?q=${encodeURIComponent(q)}`),
  patient: (id) => request(`/api/patients/${id}`),
  createPatient: (data) => request('/api/patients', json('POST', data)),
  updatePatient: (id, data) => request(`/api/patients/${id}`, json('PATCH', data)),
  visit: (id) => request(`/api/visits/${id}`),
  updateVisit: (id, data) => request(`/api/visits/${id}`, json('PATCH', data)),
  retryVisit: (id) => request(`/api/visits/${id}/retry`, { method: 'POST' }),
  uploadVisit: (patientId, blob, doctorName, filename = 'visit.webm') => {
    const fd = new FormData()
    fd.append('audio', blob, filename)
    fd.append('doctor_name', doctorName || '')
    return request(`/api/patients/${patientId}/visits`, { method: 'POST', body: fd })
  },
  callNow: (visitId, simulate = false) =>
    request(`/api/visits/${visitId}/call?simulate=${simulate}`, { method: 'POST' }),
  alerts: () => request('/api/alerts'),
  acknowledge: (callId) => request(`/api/calls/${callId}/acknowledge`, { method: 'POST' }),
  evalsInfo: () => request('/api/evals/info'),
  evalRuns: () => request('/api/evals/runs'),
  evalRun: (id) => request(`/api/evals/runs/${id}`),
  evalCalls: () => request('/api/evals/calls'),
  startEval: () => request('/api/evals/run', { method: 'POST' }),
}

// SQLite drops the timezone; the server always stores UTC.
export function parseDate(value) {
  if (!value) return null
  const s = String(value)
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) || s.length <= 10 ? s : s + 'Z')
}

export function fmtDate(value, withTime = true) {
  const d = parseDate(value)
  if (!d) return '—'
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}

export function fmtDuration(sec) {
  if (sec == null) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
