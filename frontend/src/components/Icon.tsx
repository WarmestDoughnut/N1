import type { ReactNode } from 'react'

export type IconName =
  | 'activity' | 'bell' | 'chevron' | 'clipboard' | 'flask' | 'grid' | 'heart' | 'help' | 'moon'
  | 'more' | 'people' | 'plus' | 'search' | 'sparkles' | 'logout' | 'check' | 'x' | 'pause'
  | 'play' | 'stop' | 'calendar' | 'watch' | 'phone' | 'user' | 'shield' | 'steps' | 'pulse'
  | 'shuffle' | 'arrowLeft' | 'pencil' | 'stethoscope' | 'fastForward' | 'info'

const paths: Record<IconName, ReactNode> = {
  grid: (<><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>),
  people: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  flask: (<><path d="M9 3h6M10 3v6l-5.3 9.3A1.8 1.8 0 0 0 6.3 21h11.4a1.8 1.8 0 0 0 1.6-2.7L14 9V3" /><path d="M7.5 16h9" /></>),
  clipboard: (<><rect x="4" y="4" width="16" height="18" rx="2" /><path d="M9 4V2h6v2M8 11h8M8 16h6" /></>),
  activity: <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />,
  bell: (<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>),
  chevron: <path d="m9 18 6-6-6-6" />,
  arrowLeft: <path d="M19 12H5m6-6-6 6 6 6" />,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
  moon: <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  help: (<><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.4 2c-.8.5-1.2 1-1.2 2M12 17h.01" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></>),
  more: (<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>),
  sparkles: (<><path d="m12 3 1.1 3.2L16 7.5l-2.9 1.3L12 12l-1.1-3.2L8 7.5l2.9-1.3L12 3Z" /><path d="m18.5 13 .7 2 1.8.8-1.8.8-.7 2-.7-2-1.8-.8 1.8-.8.7-2ZM5.5 13l.7 2 1.8.8-1.8.8-.7 2-.7-2-1.8-.8 1.8-.8.7-2Z" /></>),
  logout: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>),
  check: <path d="m5 12 5 5L20 7" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  pause: (<><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>),
  play: <path d="M7 4.5v15l12-7.5-12-7.5Z" />,
  stop: <rect x="5.5" y="5.5" width="13" height="13" rx="2" />,
  fastForward: (<><path d="M3 5v14l9-7-9-7ZM12 5v14l9-7-9-7Z" /></>),
  calendar: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>),
  watch: (<><rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9 6V2h6v4M9 18v4h6v-4M12 10v2l1.5 1.5" /></>),
  phone: (<><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>),
  shield: (<><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>),
  steps: (<><path d="M7 16c-1.7 0-3-1.6-3-4.5S5 6 7 6s3 2.7 3 5.5S8.7 16 7 16ZM17 20c-1.7 0-3-1.6-3-4.5S15 10 17 10s3 2.7 3 5.5-1.3 4.5-3 4.5Z" /></>),
  pulse: <path d="M3 12h3l2-4 3 9 3-12 2 7h5" />,
  shuffle: (<><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></>),
  pencil: <path d="M4 20h4L19 9l-4-4L4 16v4Z" />,
  stethoscope: (<><path d="M6 3v6a5 5 0 0 0 10 0V3" /><path d="M11 14v2a5 5 0 0 0 10 0v-2" /><circle cx="21" cy="12" r="2" /></>),
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      {paths[name]}
    </svg>
  )
}

export const SIGNAL_ICON: Record<string, IconName> = {
  sleep_min: 'moon', resting_hr: 'heart', hrv: 'pulse', steps: 'steps', episode: 'calendar',
}
export const SIGNAL_COLOR: Record<string, string> = {
  sleep_min: '#6258df', resting_hr: '#e9566b', hrv: '#ef796b', steps: '#19a583', episode: '#ad7c28',
}
export const DEVICE_ICON: Record<string, IconName> = { iphone: 'phone', apple_watch: 'watch', fitbit: 'watch' }
