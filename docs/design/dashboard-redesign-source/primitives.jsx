// Seizn Author — shared primitives, icons, and mock data (English master)

const Icon = ({ d, size = 16, stroke = 1.6, fill = 'none', style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {d}
  </svg>
);

const I = {
  inbox: <Icon d={<><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></>}/>,
  review: <Icon d={<><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></>}/>,
  characters: <Icon d={<><circle cx="9" cy="8" r="3.5"/><path d="M2 21c.5-3.5 3.4-6 7-6s6.5 2.5 7 6"/><circle cx="17" cy="6" r="2.5"/><path d="M21 14c-.3-2-1.8-3.5-4-3.5"/></>}/>,
  graph: <Icon d={<><circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><circle cx="18" cy="14" r="1.6"/><path d="M7.5 7.5 10.5 16.5M16.5 7.5 13.5 16.5M8 6h8M17 8v4"/></>}/>,
  timeline: <Icon d={<><path d="M3 12h18"/><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/><path d="M6 12V6M12 12v6M18 12V8"/></>}/>,
  conflict: <Icon d={<><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></>}/>,
  simulate: <Icon d={<><polygon points="6 4 20 12 6 20 6 4"/></>}/>,
  audit: <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6M9 9h2"/></>}/>,
  brain: <Icon d={<><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 12a3 3 0 0 1 1.58-2.86A2.5 2.5 0 0 1 7.04 6.06 2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 12a3 3 0 0 0-1.58-2.86 2.5 2.5 0 0 0-2.96-3.08A2.5 2.5 0 0 0 14.5 2Z"/></>}/>,
  edit: <Icon d={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></>}/>,
  map: <Icon d={<><polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6"/><path d="M8 3v15M16 6v15"/></>}/>,
  replay: <Icon d={<><path d="M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5"/></>}/>,
  usage: <Icon d={<><path d="M21 21H3V3"/><path d="M7 14l4-4 3 3 5-5"/></>}/>,
  byok: <Icon d={<><circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M16 6l3 3M14 8l3 3"/></>}/>,
  settings: <Icon d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></>}/>,
  search: <Icon d={<><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>}/>,
  plus: <Icon d={<><path d="M12 5v14M5 12h14"/></>}/>,
  chevDown: <Icon d={<><path d="m6 9 6 6 6-6"/></>}/>,
  chevRight: <Icon d={<><path d="m9 6 6 6-6 6"/></>}/>,
  chevLeft: <Icon d={<><path d="m15 6-6 6 6 6"/></>}/>,
  chevUp: <Icon d={<><path d="m18 15-6-6-6 6"/></>}/>,
  more: <Icon d={<><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></>}/>,
  command: <Icon d={<><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3Z"/></>}/>,
  bell: <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>}/>,
  feather: <Icon d={<><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><path d="M16 8 2 22M17.5 15H9"/></>}/>,
  link: <Icon d={<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>}/>,
  check: <Icon d={<><path d="M20 6 9 17l-5-5"/></>}/>,
  x: <Icon d={<><path d="M18 6 6 18M6 6l18 18"/></>}/>,
  bookmark: <Icon d={<><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></>}/>,
  filter: <Icon d={<><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z"/></>}/>,
  sort: <Icon d={<><path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 4v16"/></>}/>,
  panel: <Icon d={<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></>}/>,
  panelRight: <Icon d={<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></>}/>,
  pin: <Icon d={<><path d="M12 17v5M9 8V3h6v5l3 5H6l3-5Z"/></>}/>,
  arrowRight: <Icon d={<><path d="M5 12h14M13 5l7 7-7 7"/></>}/>,
  arrowUpRight: <Icon d={<><path d="M7 17 17 7M7 7h10v10"/></>}/>,
  book: <Icon d={<><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></>}/>,
  spark: <Icon d={<><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M19 14l.7 1.9 1.8.7-1.8.6L19 19l-.7-1.8-1.8-.6 1.8-.7z"/></>}/>,
  acts: <Icon d={<><path d="M4 4h4v16H4zM10 4h4v16h-4zM16 4h4v16h-4z"/></>}/>,
};

// ─────────────────────────────────────────────────────────────
// Mock data — English master, IP "Midnight City"
// ─────────────────────────────────────────────────────────────
const MOCK = {
  workspace: { name: 'Midnight City', plan: 'Studio', episodes: 7, words: 84_320 },
  inbox: [
    { id: 1, kind: 'Character',  title: 'Seoyun is a journalist in Ch. 4 but a detective in Ch. 7', episode: 'Ch. 7', author: 'Memory v3', time: '2m ago',  priority: 'P1', unread: true },
    { id: 2, kind: 'Conflict',   title: 'Doyoon ↔ Seoyun trust line — recovery in Ch. 6 lacks setup', episode: 'Ch. 7', author: 'You',       time: '12m ago', priority: 'P2', unread: true },
    { id: 3, kind: 'Canon',      title: '“Midnight bells” ritual — order conflicts between Ch. 4 and Ch. 6', episode: 'Ch. 6', author: 'Memory v3', time: '1h ago',  priority: 'P1', unread: false },
    { id: 4, kind: 'Timeline',   title: 'Minho recovery: 12 days in draft, but medical reference says 4–6 weeks', episode: 'Ch. 5', author: 'Editor Jin', time: '3h ago', priority: 'P2', unread: false },
    { id: 5, kind: 'Character',  title: 'Yeonsu’s mother appears — she was set as “absent” in Ch. 1', episode: 'Ch. 8 draft', author: 'Memory v3', time: 'yesterday', priority: 'P1', unread: false },
    { id: 6, kind: 'Review',     title: 'Tone consistency check on Jin → Seoyun flashback', episode: 'Ch. 7', author: 'Editor Jin', time: 'yesterday', priority: 'P3', unread: false },
    { id: 7, kind: 'Note',       title: 'Ch. 8 opener candidate — Seoyun-POV prologue', episode: 'Ch. 8 draft', author: 'You', time: '2 days ago', priority: 'P3', unread: false },
  ],
  characters: [
    { id: 'seoyun', name: 'Seoyun', role: 'Lead',      aka: 'City reporter',     episodes: 7, relations: 8, conflicts: 2, color: '#c96442' },
    { id: 'doyoon', name: 'Doyoon', role: 'Lead',      aka: 'Major crimes det.', episodes: 7, relations: 6, conflicts: 2, color: '#7a5c3a' },
    { id: 'jin',    name: 'Jin',    role: 'Supporting',aka: 'Editor-in-chief',   episodes: 5, relations: 4, conflicts: 0, color: '#8a6818' },
    { id: 'minho',  name: 'Minho',  role: 'Supporting',aka: 'Seoyun’s brother',  episodes: 6, relations: 5, conflicts: 1, color: '#4a4338' },
    { id: 'yeonsu', name: 'Yeonsu', role: 'Supporting',aka: 'Doyoon’s partner',  episodes: 4, relations: 3, conflicts: 0, color: '#a94e2f' },
    { id: 'mother', name: 'Mrs. Han', role: 'Minor',   aka: 'Yeonsu’s mother',   episodes: 1, relations: 1, conflicts: 1, color: '#bfb39a' },
    { id: 'sunwoo', name: 'Sunwoo', role: 'Minor',     aka: 'Anonymous source',  episodes: 2, relations: 2, conflicts: 0, color: '#948872' },
  ],
  graphNodes: [
    { id: 'seoyun', x: 140, y: 140, r: 36, label: 'Seoyun', role: 'Lead' },
    { id: 'doyoon', x: 340, y: 120, r: 34, label: 'Doyoon', role: 'Lead' },
    { id: 'jin',    x: 70,  y: 280, r: 24, label: 'Jin',    role: 'Supporting' },
    { id: 'minho',  x: 230, y: 270, r: 24, label: 'Minho',  role: 'Supporting' },
    { id: 'yeonsu', x: 430, y: 230, r: 22, label: 'Yeonsu', role: 'Supporting' },
    { id: 'mother', x: 500, y: 320, r: 16, label: 'Mrs. Han', role: 'Minor' },
    { id: 'sunwoo', x: 400, y: 30,  r: 16, label: 'Sunwoo', role: 'Minor' },
  ],
  graphEdges: [
    { a: 'seoyun', b: 'doyoon', kind: 'Trust',     strength: 0.55, conflict: true },
    { a: 'seoyun', b: 'jin',    kind: 'Mentor',    strength: 0.85, conflict: false },
    { a: 'seoyun', b: 'minho',  kind: 'Family',    strength: 0.95, conflict: false },
    { a: 'doyoon', b: 'yeonsu', kind: 'Partner',   strength: 0.80, conflict: false },
    { a: 'doyoon', b: 'minho',  kind: 'Rivalry',   strength: 0.40, conflict: true },
    { a: 'yeonsu', b: 'mother', kind: 'Family',    strength: 0.90, conflict: false },
    { a: 'seoyun', b: 'sunwoo', kind: 'Source',    strength: 0.60, conflict: false },
  ],
};

// ─────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────
const Tag = ({ children, tone = 'ink', size = 'sm', style }) => {
  const tones = {
    ink:        { bg: 'var(--ink-50)',         fg: 'var(--ink-500)',     bd: 'var(--border-subtle)' },
    terracotta: { bg: 'var(--terracotta-50)',  fg: 'var(--terracotta-700)', bd: 'rgba(201,100,66,.25)' },
    dawn:       { bg: 'var(--dawn-50)',        fg: 'var(--dawn-700)',    bd: 'rgba(217,168,71,.30)' },
    cream:      { bg: 'var(--ink-25)',         fg: 'var(--ink-500)',     bd: 'var(--border-subtle)' },
    solid:      { bg: 'var(--ink-900)',        fg: 'var(--ink-25)',      bd: 'var(--ink-900)' },
  }[tone];
  const pad = size === 'xs' ? '1px 6px' : '2px 8px';
  const fs  = size === 'xs' ? 10.5 : 11.5;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: pad,
      fontSize: fs, fontWeight: 500, lineHeight: 1.4, borderRadius: 999,
      background: tones.bg, color: tones.fg, border: `1px solid ${tones.bd}`,
      whiteSpace: 'nowrap', ...style,
    }}>{children}</span>
  );
};

const Avatar = ({ name, color = '#c96442', size = 28, ring = false }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', background: color,
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.42, fontWeight: 600, fontFamily: 'var(--font-serif)',
    boxShadow: ring ? `0 0 0 2px var(--ink-25), 0 0 0 3.5px ${color}` : 'none',
    flexShrink: 0,
  }}>{name.charAt(0)}</div>
);

const KBD = ({ children, style }) => (
  <kbd className="mono" style={{
    fontSize: 10.5, padding: '1px 5px', borderRadius: 4,
    background: 'var(--ink-25)', border: '1px solid var(--border-subtle)',
    color: 'var(--text-tertiary)', fontWeight: 500, ...style,
  }}>{children}</kbd>
);

const Skel = ({ w = '100%', h = 12, r = 4, style }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: 'linear-gradient(90deg, rgba(74,67,56,.06), rgba(74,67,56,.10), rgba(74,67,56,.06))',
    backgroundSize: '200% 100%', animation: 'sk 1.6s ease-in-out infinite', ...style,
  }}/>
);

if (typeof document !== 'undefined' && !document.getElementById('seizn-anim')) {
  const s = document.createElement('style'); s.id = 'seizn-anim';
  s.textContent = `
    @keyframes sk { 0%{background-position: 100% 0} 100%{background-position: -100% 0} }
    @keyframes pulse-dot { 0%,100%{opacity:.6} 50%{opacity:1} }
    .seizn .dot-live { animation: pulse-dot 1.6s ease-in-out infinite; }
  `;
  document.head.appendChild(s);
}

Object.assign(window, { Icon, I, MOCK, Tag, Avatar, KBD, Skel });
