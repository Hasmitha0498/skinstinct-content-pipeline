// Simple line icons (inline SVG, 24px grid, currentColor) so the page needs no icon library.
import type { ReactNode, SVGProps } from 'react';

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const MessageIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 5h16v11H9l-4 3v-3H4z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </Icon>
);
export const MicIcon = (p: P) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Icon>
);
export const GaugeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 16a8 8 0 1 1 16 0" />
    <path d="M12 16l4-5" />
    <circle cx="12" cy="16" r="1" />
  </Icon>
);
export const BranchIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="6" cy="5" r="2" />
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="9" r="2" />
    <path d="M6 7v10M6 13c0-3 3-4 10-4" />
  </Icon>
);
export const NewsIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="5" width="15" height="14" rx="1.5" />
    <path d="M18 9h3v8.5a1.5 1.5 0 0 1-3 0M6.5 9h8M6.5 12.5h8M6.5 16h5" />
  </Icon>
);
export const PenIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 20l1-4L16 5l3 3L8 19z" />
    <path d="M14 7l3 3" />
  </Icon>
);
export const InboxIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 13l2.5-7h11L20 13v6H4z" />
    <path d="M4 13h4.5l1 2h5l1-2H20" />
  </Icon>
);
export const PersonCheckIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 20a6.5 6.5 0 0 1 11.5-4" />
    <path d="M15.5 18l2 2 4-4.5" />
  </Icon>
);
export const DatabaseIcon = (p: P) => (
  <Icon {...p}>
    <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
    <path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
  </Icon>
);
export const SparkIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  </Icon>
);
export const CloudIcon = (p: P) => (
  <Icon {...p}>
    <path d="M7 18h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z" />
  </Icon>
);
export const CodeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13" />
  </Icon>
);
export const ShieldIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z" />
    <path d="M9 12l2 2 4-4.5" />
  </Icon>
);
export const StopIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z" />
    <path d="M8.5 12h7" />
  </Icon>
);
export const ArrowRightIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
export const CheckIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Icon>
);
export const XIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
