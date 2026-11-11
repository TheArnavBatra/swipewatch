// One small icon set, drawn on a 24px grid, so the app never leans on text glyphs or emoji.
const PATHS = {
  x: <path d="M6 6l12 12M18 6 6 18" />,
  heart: <path d="M12 20.3 4.6 13a4.9 4.9 0 0 1 7-6.9l.4.4.4-.4a4.9 4.9 0 0 1 7 6.9z" />,
  undo: <path d="M9 5 4 10l5 5M4 10h10a5 5 0 0 1 0 10h-3" />,
  check: <path d="M5 12.5 9.5 17 19 7.5" />,
  ban: <><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  info: <path d="M12 10.5v7M12 6.5h.01" />,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  bookmark: <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  play: <path d="M8 5.5v13l11-6.5z" />,
  external: <path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />,
  shuffle: <path d="M4 7h3l10 10h3M4 17h3l3.2-3.2M13.8 10.2 17 7h3M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5" />,
  star: <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />,
  rotate: <path d="M4.5 4.5v4h4M5.3 8.5A7.5 7.5 0 1 1 4.5 12" />,
  chat: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7.5L7 19.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
}
const FILLED = new Set(['heart', 'play', 'star'])

export default function Icon({ name, size = 20, ...rest }) {
  return (
    <svg
      className="icon" width={size} height={size} viewBox="0 0 24 24"
      fill={FILLED.has(name) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
