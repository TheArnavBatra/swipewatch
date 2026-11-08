// tmdbId is the TMDB watch-provider id for the India region.
export const SERVICES = [
  { id: 'netflix', name: 'Netflix', dot: '#e50914', tmdbId: 8 },
  { id: 'prime', name: 'Prime Video', dot: '#00a8e1', tmdbId: 119 },
  { id: 'hotstar', name: 'Disney+ Hotstar', dot: '#1f4fd8', tmdbId: 122 },
  { id: 'zee5', name: 'ZEE5', dot: '#8a2be2', tmdbId: 232 },
  { id: 'sony', name: 'SonyLIV', dot: '#e0a100', tmdbId: 237 },
]

export const INDUSTRIES = [
  { id: 'bollywood', name: 'Hindi', sub: 'Bollywood', lang: 'hi' },
  { id: 'hollywood', name: 'English', sub: 'Hollywood', lang: 'en' },
  { id: 'both', name: 'Both', sub: 'Mix it up' },
]

export const serviceName = (id) => SERVICES.find((s) => s.id === id)?.name ?? id
