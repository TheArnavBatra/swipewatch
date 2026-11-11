import Icon from './Icon'
import ServiceMark from './ServiceMark'
import { INDUSTRIES, SERVICES } from '../lib/services'

// The streaming-service and language pickers, shared by the home screen and the Ask AI tab.
// Each use has its own id so the two screens never share a radio group.
export function ServicePicker({ id, services, onChange }) {
  const toggle = (sid) => onChange(services.includes(sid) ? services.filter((s) => s !== sid) : [...services, sid])
  return (
    <section className="field">
      <h2 id={`${id}-services`}>Where do you watch?</h2>
      <div className="svcs" role="group" aria-labelledby={`${id}-services`}>
        {SERVICES.map((s) => (
          <label className="svc" key={s.id} style={{ '--dot': s.dot }}>
            <input type="checkbox" checked={services.includes(s.id)} onChange={() => toggle(s.id)} />
            <span><ServiceMark service={s} />{s.name}<Icon name="check" size={16} strokeWidth="2.6" /></span>
          </label>
        ))}
      </div>
    </section>
  )
}

export function LanguagePicker({ id, ind, onChange }) {
  return (
    <section className="field">
      <h2 id={`${id}-language`}>Language</h2>
      <div className="seg" role="radiogroup" aria-labelledby={`${id}-language`}>
        {INDUSTRIES.map((i) => (
          <label key={i.id}>
            <input type="radio" name={`${id}-ind`} checked={ind === i.id} onChange={() => onChange(i.id)} />
            <span>{i.name}<small>{i.sub}</small></span>
          </label>
        ))}
      </div>
    </section>
  )
}
