import { useState } from 'react'

// A streaming service's logo, or its coloured dot when the logo is missing or does not load.
export default function ServiceMark({ service, size = 24 }) {
  const [failed, setFailed] = useState(false)
  if (!service.logo || failed) return <i className="mark dot" />
  return (
    <img
      className="mark" src={service.logo} alt="" width={size} height={size} loading="lazy" decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
