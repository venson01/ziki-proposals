import { BUG_ICON_PATH } from "@/lib/bug-flight";

/** A sparkle, for feature and improvement types (same path as the real list). */
const FEATURE_ICON_PATH =
  "m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z";
const SHIELD_PATH = "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z";

type IconProps = { className?: string; size?: number };

function Svg({ children, className, size = 16, strokeWidth = 2 }: IconProps & { children: React.ReactNode; strokeWidth?: number }) {
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
      className={className}
    >
      {children}
    </svg>
  );
}

export const BugIcon = (p: IconProps) => <Svg {...p}><path d={BUG_ICON_PATH} /></Svg>;
export const FeatureIcon = (p: IconProps) => <Svg {...p}><path d={FEATURE_ICON_PATH} /></Svg>;
export const ShieldIcon = (p: IconProps) => <Svg {...p}><path d={SHIELD_PATH} /></Svg>;
export const CheckIcon = (p: IconProps) => <Svg {...p}><path className="zk-check-path" d="m5 12 4.5 4.5L19 7" /></Svg>;
export const BotIcon = (p: IconProps) => <Svg {...p}><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4M9 14h.01M15 14h.01" /></Svg>;
export const CommentIcon = (p: IconProps) => <Svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Svg>;
export const ChevronUpIcon = (p: IconProps) => <Svg {...p}><path d="m6 15 6-6 6 6" /></Svg>;
export const PauseIcon = (p: IconProps) => <Svg {...p}><path d="M9 5v14M15 5v14" /></Svg>;
export const PlayIcon = (p: IconProps) => <Svg {...p}><path d="M7 4.5v15l12-7.5-12-7.5Z" /></Svg>;
export const SteerIcon = (p: IconProps) => <Svg {...p}><path d="M3 12h13M12 7l5 5-5 5M21 5v14" /></Svg>;
export const FlagIcon = (p: IconProps) => <Svg {...p}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></Svg>;
export const ReadIcon = (p: IconProps) => <Svg {...p}><path d="M2 6s3-2 10-2 10 2 10 2v14s-3-2-10-2-10 2-10 2Z" /><path d="M12 4v14" /></Svg>;
export const SearchIcon = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
export const PlanIcon = (p: IconProps) => <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></Svg>;
export const EditIcon = (p: IconProps) => <Svg {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></Svg>;
export const TestIcon = (p: IconProps) => <Svg {...p}><path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3" /></Svg>;
export const PrIcon = (p: IconProps) => <Svg {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-4M13 3.5 10.5 6 13 8.5" /></Svg>;
export const UserIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>;

export function TypeIcon({ type, ...p }: IconProps & { type: "bug" | "feature" | "security" }) {
  if (type === "security") return <ShieldIcon {...p} />;
  if (type === "feature") return <FeatureIcon {...p} />;
  return <BugIcon {...p} />;
}

/** A hammer that taps while an agent works. Still under reduced motion. */
export function HammeringIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="zk-hammering">
      <g className="zk-hammering-head">
        <path d="m15 12-8.4 8.4a2.1 2.1 0 1 1-3-3L12 9" />
        <path d="M17.6 15 22 10.6M20.9 11.7 12.3 3.1a1 1 0 0 0-1.4 0L9.6 4.4a1 1 0 0 0 0 1.4l8.6 8.6a1 1 0 0 0 1.4 0l1.3-1.3a1 1 0 0 0 0-1.4Z" />
      </g>
    </svg>
  );
}

/** The Ziki mark: a lowercase z with an up-vote arrow above its slope. */
export function ZikiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 32" fill="none" className={className} aria-hidden="true" width="22" height="25">
      <path d="M5 13h16L5 27.5h16" stroke="currentColor" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 2.5 21 9h-9Z" fill="#38A3FF" stroke="#38A3FF" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
