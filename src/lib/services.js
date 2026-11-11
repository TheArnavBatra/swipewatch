// tmdbId is the TMDB watch-provider id for the India region. logo is the provider's logo on TMDB's
// image server; the coloured dot stands in when it cannot be loaded.
const LOGOS = 'https://image.tmdb.org/t/p/w92'
export const SERVICES = [
  { logo: `${LOGOS}/rK1KljqmbvO9HQa1PBFLILWah72.png`, id: 'netflix', name: 'Netflix', dot: '#e50914', tmdbId: 8 },
  { logo: `${LOGOS}/gMZdpavHmxFNnLpMHwVxfqeux2g.png`, id: 'prime', name: 'Prime Video', dot: '#00a8e1', tmdbId: 119 },
  { logo: `${LOGOS}/ledoS6EgdjTNq8F1e6wubUQer18.png`, id: 'hotstar', name: 'JioHotstar', dot: '#1f4fd8', tmdbId: 2336 },
  { logo: `${LOGOS}/uQvhdtB8skccsGHmvKi3y5bqBsX.png`, id: 'zee5', name: 'ZEE5', dot: '#8a2be2', tmdbId: 232 },
  { logo: `${LOGOS}/coM4QWbmIOa0xJ5cGR9BRmoV25B.png`, id: 'sony', name: 'SonyLIV', dot: '#e0a100', tmdbId: 237 },
]

export const INDUSTRIES = [
  { id: 'bollywood', name: 'Hindi', sub: 'Bollywood', lang: 'hi' },
  { id: 'hollywood', name: 'English', sub: 'Hollywood', lang: 'en' },
  { id: 'both', name: 'Both', sub: 'Mix it up' },
]

export const serviceOf = (id) => SERVICES.find((s) => s.id === id) ?? { id, name: id, dot: '#888' }
export const serviceName = (id) => serviceOf(id).name
