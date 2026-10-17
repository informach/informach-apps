import type { ReactNode } from "react";

type IconProps = { size?: number; strokeWidth?: number };

function Stroke({ size = 20, strokeWidth = 2, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={2.6} {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Stroke>
  );
}
export function MinusIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={2.4} {...props}>
      <path d="M6 12h12" />
    </Stroke>
  );
}
export function PlusIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={2.4} {...props}>
      <path d="M5 12h14M12 5v14" />
    </Stroke>
  );
}
export function CloseIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={2.6} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Stroke>
  );
}
export function DownloadIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={2.4} {...props}>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </Stroke>
  );
}
export function ExternalIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={2.2} {...props}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </Stroke>
  );
}
export function MonitorIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={1.8} {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </Stroke>
  );
}
export function ShieldIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={1.8} {...props}>
      <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </Stroke>
  );
}
export function RefreshIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={1.8} {...props}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </Stroke>
  );
}
export function OfflineIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={1.8} {...props}>
      <path d="M2 8.5a15 15 0 0 1 20 0" />
      <path d="M5.5 12a10 10 0 0 1 13 0" />
      <path d="M9 15.5a5 5 0 0 1 6 0" />
      <path d="M12 19h.01" />
      <path d="M3 3l18 18" />
    </Stroke>
  );
}
export function AlertIcon(props: IconProps) {
  return (
    <Stroke strokeWidth={2.2} {...props}>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </Stroke>
  );
}
export function FileIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7z" />
      <path d="M14 3v4h4" />
    </Stroke>
  );
}
