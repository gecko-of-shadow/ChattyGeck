import { cn } from "@/lib/utils";
import type { MascotProps } from "./types";

const FLIPPERS = [
  { className: "turtle-flipper-a", origin: "23px 24px", cx: 17, cy: 20, rx: 7, ry: 3.4, rotate: -35 },
  { className: "turtle-flipper-b", origin: "41px 24px", cx: 47, cy: 20, rx: 7, ry: 3.4, rotate: 35 },
  { className: "turtle-flipper-b", origin: "24px 43px", cx: 19.5, cy: 46, rx: 5, ry: 2.8, rotate: 32 },
  { className: "turtle-flipper-a", origin: "40px 43px", cx: 44.5, cy: 46, rx: 5, ry: 2.8, rotate: -32 },
];

/** Top-down sea turtle, coloured by the active theme's --mascot-* variables. */
export function TurtleMascot({ className, anim = "none", title }: MascotProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("mascot turtle-mascot overflow-visible", className)}
      data-anim={anim}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {FLIPPERS.map((f) => (
        <g
          key={`${f.cx}-${f.cy}`}
          className={cn("mascot-part", f.className)}
          style={{ transformOrigin: f.origin }}
        >
          <ellipse
            cx={f.cx}
            cy={f.cy}
            rx={f.rx}
            ry={f.ry}
            transform={`rotate(${f.rotate} ${f.cx} ${f.cy})`}
            fill="var(--mascot-belly)"
          />
        </g>
      ))}
      <path d="M30.4 48.5 L32 55.5 L33.6 48.5 Z" fill="var(--mascot-belly)" />
      <g className="mascot-part turtle-head">
        <ellipse cx="32" cy="12.5" rx="5.6" ry="6.4" fill="var(--mascot-belly)" />
        <circle cx="29.6" cy="11" r="1.15" fill="var(--mascot-pupil)" />
        <circle cx="34.4" cy="11" r="1.15" fill="var(--mascot-pupil)" />
        <path
          d="M30.2 14.8 Q32 16 33.8 14.8"
          stroke="var(--mascot-pupil)"
          strokeOpacity="0.5"
          strokeWidth="0.7"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <ellipse cx="32" cy="33" rx="15.5" ry="17" fill="var(--mascot-body)" />
      <ellipse cx="32" cy="33" rx="15.5" ry="17" fill="none" stroke="var(--mascot-accent)" strokeWidth="1.6" />
      <g stroke="var(--mascot-spot)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M32 23.5 L38 27 L38 34 L32 37.5 L26 34 L26 27 Z" />
        <path d="M32 23.5 L32 17.5 M38 27 L44.5 23.5 M38 34 L45 37.5 M32 37.5 L32 48.5 M26 34 L19 37.5 M26 27 L19.5 23.5" />
      </g>
    </svg>
  );
}
