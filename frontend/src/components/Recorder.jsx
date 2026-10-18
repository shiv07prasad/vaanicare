import { useEffect, useMemo, useRef, useState } from 'react'
import { api, fmtDuration } from '../api.js'
import Modal from './Modal.jsx'
import { IsoWave } from './Iso.jsx'

function pickMime() {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return options.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || ''
}

export default function Recorder({ patient, onClose, onUploaded }) {
  const [state, setState] = useState('idle') // idle | recording | paused | done | uploading
  const [elapsed, setElapsed] = useState(0)
  const [blob, setBlob] = useState(null)
  const [error, setError] = useState('')
  const [level, setLevel] = useState(0)
  const [doctor, setDoctor] = useState(() => localStorage.getItem('doctorName') || '')
  const rec = useRef(null)
  const chunks = useRef([])
  const stream = useRef(null)
  const timer = useRef(null)
  const raf = useRef(null)
  const audioCtx = useRef(null)

  useEffect(() => () => cleanup(), [])

  function cleanup() {
    clearInterval(timer.current)
    cancelAnimationFrame(raf.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    audioCtx.current?.close().catch(() => {})
  }

  async function start() {
    setError('')
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
    } catch {
      setError('Microphone access was blocked. Allow the microphone in your browser and try again.')
      return
    }
    const mimeType = pickMime()
    const r = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined)
    chunks.current = []
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    r.onstop = () => {
      setBlob(new Blob(chunks.current, { type: r.mimeType || 'audio/webm' }))
      setState('done')
      cleanup()
    }
    r.start(1000)
    rec.current = r
    setState('recording')
    setElapsed(0)
    timer.current = setInterval(() => rec.current?.state === 'recording' && setElapsed((s) => s + 1), 1000)

    // input level meter
    audioCtx.current = new AudioContext()
    const analyser = audioCtx.current.createAnalyser()
    analyser.fftSize = 512
    audioCtx.current.createMediaStreamSource(stream.current).connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let peak = 0
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
      setLevel(Math.min(1, peak / 64))
      raf.current = requestAnimationFrame(tick)
    }
    tick()
  }

  function pause() {
    if (rec.current.state === 'recording') { rec.current.pause(); setState('paused') }
    else { rec.current.resume(); setState('recording') }
  }

  function onFile(e) {
    const f = e.target.files?.[0]
    if (f) { setBlob(f); setState('done'); setElapsed(0) }
  }

  async function upload() {
    setState('uploading')
    setError('')
    localStorage.setItem('doctorName', doctor)
    try {
      const ext = blob.name?.split('.').pop() || (blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm')
      const visit = await api.uploadVisit(patient.id, blob, doctor, `visit.${ext}`)
      onUploaded(visit)
    } catch (err) {
      setError(err.message)
      setState('done')
    }
  }

  const recording = state === 'recording' || state === 'paused'
  const blobUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])

  return (
    <Modal title={`Consultation · ${patient.name}`} onClose={recording ? null : onClose}>
      <div className="recorder">
        <label className="form-inline">Doctor
          <input value={doctor} onChange={(e) => setDoctor(e.target.value)} placeholder="Dr. Sharma" disabled={recording} />
        </label>

        <div className={`rec-orb ${state}`}>
          <IsoWave size={240} level={state === 'recording' ? level : 0.05} live={state === 'recording'} />
          <div className="rec-time">{fmtDuration(elapsed)}</div>
          <div className="rec-label">
            {state === 'idle' && 'Ready to record'}
            {state === 'recording' && 'Recording…'}
            {state === 'paused' && 'Paused'}
            {state === 'done' && 'Recording ready'}
            {state === 'uploading' && 'Uploading…'}
          </div>
        </div>

        {state === 'idle' && (
          <>
            <button className="btn primary big" onClick={start}>● Start recording</button>
            <label className="link-btn">or upload an audio file
              <input type="file" accept="audio/*" hidden onChange={onFile} />
            </label>
          </>
        )}
        {recording && (
          <div className="actions center">
            <button className="btn" onClick={pause}>{state === 'paused' ? 'Resume' : 'Pause'}</button>
            <button className="btn danger" onClick={() => rec.current.stop()}>■ Stop</button>
          </div>
        )}
        {(state === 'done' || state === 'uploading') && blob && (
          <>
            <audio controls src={blobUrl} className="audio" />
            <div className="actions center">
              <button className="btn" disabled={state === 'uploading'} onClick={() => { setBlob(null); setState('idle') }}>Discard</button>
              <button className="btn primary" disabled={state === 'uploading'} onClick={upload}>
                {state === 'uploading' ? 'Uploading…' : 'Save & transcribe'}
              </button>
            </div>
          </>
        )}
        <p className="hint center">The recording is sent to Sarvam for transcription with speaker separation. Diagnosis, prescription and follow-up questions are drafted automatically.</p>
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  )
}
