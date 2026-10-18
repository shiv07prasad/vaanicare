import { useState } from 'react'
import { api } from '../api.js'
import Modal from './Modal.jsx'

export default function PatientForm({ patient, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: patient?.name || '',
    phone: patient?.phone || '',
    age: patient?.age ?? '',
    gender: patient?.gender || '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const data = { ...form, age: form.age === '' ? null : Number(form.age), gender: form.gender || null }
      const saved = patient ? await api.updatePatient(patient.id, data) : await api.createPatient(data)
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={patient ? 'Edit patient' : 'New patient'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label>Full name<input value={form.name} onChange={set('name')} required autoFocus /></label>
        <label>Phone number<input value={form.phone} onChange={set('phone')} placeholder="98765 43210" required />
          <span className="hint">The AI follow-up call goes to this number. 10-digit numbers get +91 added.</span>
        </label>
        <div className="row">
          <label>Age<input type="number" min="0" max="130" value={form.age} onChange={set('age')} /></label>
          <label>Gender
            <select value={form.gender} onChange={set('gender')}>
              <option value="">—</option><option>Female</option><option>Male</option><option>Other</option>
            </select>
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
