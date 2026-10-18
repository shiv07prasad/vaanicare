import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

// Browser-recorded WebM (MediaRecorder) has no duration in its header, so <audio> reports
// Infinity and the progress bar can't size or seek. Seeking far past the end once makes the
// browser scan the file and learn the real duration; then we jump back to the start.
const AudioPlayer = forwardRef(function AudioPlayer({ src, className = 'audio' }, ref) {
  const el = useRef(null)
  useImperativeHandle(ref, () => el.current)

  useEffect(() => {
    const a = el.current
    if (!a) return
    let fixing = false
    const onMeta = () => {
      if (a.duration === Infinity || Number.isNaN(a.duration)) {
        fixing = true
        a.currentTime = 1e101
      }
    }
    const onDuration = () => {
      if (fixing && Number.isFinite(a.duration)) {
        fixing = false
        a.currentTime = 0
      }
    }
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('durationchange', onDuration)
    a.addEventListener('timeupdate', onDuration)
    return () => {
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('durationchange', onDuration)
      a.removeEventListener('timeupdate', onDuration)
    }
  }, [src])

  return <audio ref={el} controls preload="metadata" src={src} className={className} />
})

export default AudioPlayer
