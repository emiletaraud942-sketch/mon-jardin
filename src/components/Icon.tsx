// Icônes au trait (24×24, trait 1,7) : celles de la maquette Leafora ; les autres sont inspirées de Lucide (licence ISC).
const PATHS: Record<string, string> = {
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2ZM9 4v14M15 6v14',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9ZM4 7.5L12 12l8-4.5M12 12v9',
  leaf: 'M12 21V11M12 13C12 9 9 6.5 5 6.5c0 4 2.5 6.5 7 6.5ZM12 11c0-3.5 2.5-6 6.5-6 0 3.5-2.5 6-6.5 6Z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  sprout: 'M12 21V11M12 13C12 9 9 6.5 5 6.5c0 4 2.5 6.5 7 6.5ZM12 11c0-3.5 2.5-6 6.5-6 0 3.5-2.5 6-6.5 6Z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4ZM8.5 13a3.5 3.5 0 1 0 7.0 0a3.5 3.5 0 1 0 -7.0 0',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  sun: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
  pin: 'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11ZM9.6 10a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  menu: 'M4 6h16M4 12h16M4 18h16',
  chevron: 'M6 9l6 6 6-6',
  users: 'M5.5 8a3.5 3.5 0 1 0 7.0 0a3.5 3.5 0 1 0 -7.0 0M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M14.5 9a2.5 2.5 0 1 0 5.0 0a2.5 2.5 0 1 0 -5.0 0M17 14c2.5 0 4.5 1.8 4.5 5',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  user: 'M8 8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7',
  'arrow-left': 'M19 12H5M12 19l-7-7 7-7',
  home: 'M3 11 12 3l9 8M5 9.5V21h14V9.5M10 21v-6h4v6',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8.5 12a3.5 3.5 0 1 0 7.0 0a3.5 3.5 0 1 0 -7.0 0',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  calendar: 'M7 5h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3ZM4 10h16M8 3v4M16 3v4',
  snow: 'M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
}

export function Icon({ name, size = 20, weight = 1.7 }: { name: keyof typeof PATHS | string; size?: number; weight?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
    </svg>
  )
}
