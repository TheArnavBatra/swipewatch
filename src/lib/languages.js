// The languages a mood can ask for, keyed by the two-letter code TMDB uses for a film's original
// language. The deck's own toggle stays Hindi / English; these are for "something in Tamil tonight".
export const LANGUAGES = {
  hi: 'Hindi',
  en: 'English',
  ta: 'Tamil',
  te: 'Telugu',
  ml: 'Malayalam',
  kn: 'Kannada',
  bn: 'Bengali',
  mr: 'Marathi',
  pa: 'Punjabi',
  gu: 'Gujarati',
  ko: 'Korean',
  ja: 'Japanese',
  zh: 'Chinese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  tr: 'Turkish',
}

let names = null
try {
  names = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })
} catch {
  // A browser without it shows the bare code for the rarer languages.
}

// What to call a title's language on its card. Titles saved before languages were recorded carry
// only the industry they were filed under.
export function languageName(item) {
  const code = item?.lang
  if (!code) return item?.ind === 'bollywood' ? 'Hindi' : 'English'
  if (Object.hasOwn(LANGUAGES, code)) return LANGUAGES[code]
  if (code === 'cn') return 'Cantonese'
  try {
    return names?.of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}
