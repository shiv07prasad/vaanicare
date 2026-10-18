import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { fmtDuration } from '../api.js'

// Custom controls: the native player shades the *buffered* part of the file, which looks like
// it has already been played. Here the bar only fills with actual playback.
const AudioPlayer = forwardRef(function AudioPlayer({ src }, ref) {
  const el = useRef(null)
  const bar = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  useImperativeHandle(ref, () => el.current)

  useEffect(() => {
    const a = el.current
    if (!a) return
    setPlaying(false)
    setTime(0)
    setDuration(0)
    // Browser-recorded WebM has no duration in its header (reports Infinity). Seeking far past
    // the end once makes the browser scan the file for the real length; then jump back.
    let fixing = false
    const onMeta = () => {
      if (a.duration === Infinity || Number.isNaN(a.duration)) {
        fixing = true
        a.currentTime = 1e101
      } else {
        setDuration(a.duration)
      }
    }
    const onDuration = () => {
      if (!Number.isFinite(a.duration)) return
      if (fixing) {
        fixing = false
        a.currentTime = 0
      }
      setDuration(a.duration)
    }
    const onTime = () => { if (!fixing) setTime(a.currentTime) }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const events = { loadedmetadata: onMeta, durationchange: onDuration, timeupdate: onTime, play: onPlay, pause: onPause, ended: onPause }
    Object.entries(events).forEach(([e, fn]) => a.addEventListener(e, fn))
    return () => Object.entries(events).forEach(([e, fn]) => a.removeEventListener(e, fn))
  }, [src])

  const toggle = () => {
    const a = el.current
    if (a.paused) a.play()
    else a.pause()
  }

  const seekTo = (clientX) => {
    const a = el.current
    if (!duration) return
    const r = bar.current.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration
    a.currentTime = t
    setTime(t)
  }

  const onPointerDown = (e) => {
    seekTo(e.clientX)
    const move = (ev) => seekTo(ev.clientX)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onKey = (e) => {
    const a = el.current
    if (e.key === 'ArrowRight') a.currentTime = Math.min(duration, a.currentTime + 5)
    else if (e.key === 'ArrowLeft') a.currentTime = Math.max(0, a.currentTime - 5)
    else if (e.key === ' ' || e.key === 'Enter') toggle()
    else return
    e.preventDefault()
  }

  const pct = duration ? (time / duration) * 100 : 0

  return (
    <div className="player">
      <audio ref={el} preload="metadata" src={src} />
      <button type="button" className={`player-btn ${playing ? 'is-playing' : ''}`} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing
          ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>}
      </button>
      <span className="player-time">{fmtDuration(time)}</span>
      <div
        ref={bar}
        className="player-bar"
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        onPointerDown={onPointerDown}
        onKeyDown={onKey}
      >
        <div className="player-track"><div className="player-fill" style={{ width: `${pct}%` }} /></div>
        <div className="player-thumb" style={{ left: `${pct}%` }} />
      </div>
      <span className="player-time muted">{duration ? fmtDuration(duration) : '–:––'}</span>
    </div>
  )
})

export default AudioPlayer
