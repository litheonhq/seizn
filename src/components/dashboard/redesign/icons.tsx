import type { CSSProperties, ReactNode } from 'react';

export interface IconProps {
  size?: number;
  stroke?: number;
  fill?: string;
  style?: CSSProperties;
  'aria-hidden'?: boolean;
}

interface BaseIconProps extends IconProps {
  children: ReactNode;
}

function BaseIcon({
  size = 16,
  stroke = 1.6,
  fill = 'none',
  style,
  'aria-hidden': ariaHidden = true,
  children,
}: BaseIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden={ariaHidden}
    >
      {children}
    </svg>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </BaseIcon>
  );
}

export function ReviewIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </BaseIcon>
  );
}

export function CharactersIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 21c.5-3.5 3.4-6 7-6s6.5 2.5 7 6" />
      <circle cx="17" cy="6" r="2.5" />
      <path d="M21 14c-.3-2-1.8-3.5-4-3.5" />
    </BaseIcon>
  );
}

export function GraphIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <circle cx="18" cy="14" r="1.6" />
      <path d="M7.5 7.5 10.5 16.5M16.5 7.5 13.5 16.5M8 6h8M17 8v4" />
    </BaseIcon>
  );
}

export function TimelineIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 12h18" />
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
      <path d="M6 12V6M12 12v6M18 12V8" />
    </BaseIcon>
  );
}

export function ConflictIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </BaseIcon>
  );
}

export function SimulateIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <polygon points="6 4 20 12 6 20 6 4" />
    </BaseIcon>
  );
}

export function AuditIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6M9 9h2" />
    </BaseIcon>
  );
}

export function BrainIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08A3 3 0 0 1 2.5 12a3 3 0 0 1 1.58-2.86A2.5 2.5 0 0 1 7.04 6.06 2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08A3 3 0 0 0 21.5 12a3 3 0 0 0-1.58-2.86 2.5 2.5 0 0 0-2.96-3.08A2.5 2.5 0 0 0 14.5 2Z" />
    </BaseIcon>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
    </BaseIcon>
  );
}

export function MapIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6" />
      <path d="M8 3v15M16 6v15" />
    </BaseIcon>
  );
}

export function ReplayIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5" />
    </BaseIcon>
  );
}

export function UsageIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M21 21H3V3" />
      <path d="M7 14l4-4 3 3 5-5" />
    </BaseIcon>
  );
}

export function ByokIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="8" cy="14" r="4" />
      <path d="M11 11l9-9M16 6l3 3M14 8l3 3" />
    </BaseIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </BaseIcon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </BaseIcon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 5v14M5 12h14" />
    </BaseIcon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </BaseIcon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m9 6 6 6-6 6" />
    </BaseIcon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m15 6-6 6 6 6" />
    </BaseIcon>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m18 15-6-6-6 6" />
    </BaseIcon>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </BaseIcon>
  );
}

export function CommandIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3Z" />
    </BaseIcon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </BaseIcon>
  );
}

export function FeatherIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
      <path d="M16 8 2 22M17.5 15H9" />
    </BaseIcon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </BaseIcon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </BaseIcon>
  );
}

export function XIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </BaseIcon>
  );
}

export function BookmarkIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </BaseIcon>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />
    </BaseIcon>
  );
}

export function SortIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 4v16" />
    </BaseIcon>
  );
}

export function PanelIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </BaseIcon>
  );
}

export function PanelRightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
    </BaseIcon>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 17v5M9 8V3h6v5l3 5H6l3-5Z" />
    </BaseIcon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </BaseIcon>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 17 17 7M7 7h10v10" />
    </BaseIcon>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </BaseIcon>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
      <path d="M19 14l.7 1.9 1.8.7-1.8.6L19 19l-.7-1.8-1.8-.6 1.8-.7z" />
    </BaseIcon>
  );
}

export function ActsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 4h4v16H4zM10 4h4v16h-4zM16 4h4v16h-4z" />
    </BaseIcon>
  );
}
