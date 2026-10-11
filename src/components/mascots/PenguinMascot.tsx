import { cn } from "@/lib/utils";
import type { MascotProps } from "./types";

/** Front-facing penguin, coloured by the active theme's --mascot-* variables. */
export function PenguinMascot({ className, anim = "none", title }: MascotProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("mascot penguin-mascot overflow-visible", className)}
      data-anim={anim}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <g className="mascot-part penguin-body" style={{ transformOrigin: "32px 60px" }}>
        <path
          className="mascot-part penguin-flipper-left"
          style={{ transformOrigin: "20px 31px" }}
          d="M19.5 29 C 12 35, 10.5 45, 13.5 52 C 17 47.5, 20 41.5, 21.5 34.5 Z"
          fill="var(--mascot-body)"
        />
        <path
          className="mascot-part penguin-flipper-right"
          style={{ transformOrigin: "44px 31px" }}
          d="M44.5 29 C 52 35, 53.5 45, 50.5 52 C 47 47.5, 44 41.5, 42.5 34.5 Z"
          fill="var(--mascot-body)"
        />
        <ellipse cx="26.5" cy="58" rx="5" ry="2.2" fill="var(--mascot-accent)" />
        <ellipse cx="37.5" cy="58" rx="5" ry="2.2" fill="var(--mascot-accent)" />
        <ellipse cx="32" cy="35" rx="14.5" ry="22" fill="var(--mascot-body)" />
        <ellipse cx="32" cy="41" rx="9.5" ry="15" fill="var(--mascot-belly)" />
        <path
          d="M25 20 C 25 15.5, 28.5 14, 32 16 C 35.5 14, 39 15.5, 39 20 C 39 24.5, 35.8 27.2, 32 27.2 C 28.2 27.2, 25 24.5, 25 20 Z"
          fill="var(--mascot-belly)"
        />
        <ellipse cx="24.6" cy="21.5" rx="1.4" ry="2.8" transform="rotate(20 24.6 21.5)" fill="var(--mascot-spot)" />
        <ellipse cx="39.4" cy="21.5" rx="1.4" ry="2.8" transform="rotate(-20 39.4 21.5)" fill="var(--mascot-spot)" />
        <circle cx="28.6" cy="19.4" r="1.7" fill="var(--mascot-pupil)" />
        <circle cx="35.4" cy="19.4" r="1.7" fill="var(--mascot-pupil)" />
        <circle cx="28" cy="18.7" r="0.5" fill="#fff" opacity="0.85" />
        <circle cx="34.8" cy="18.7" r="0.5" fill="#fff" opacity="0.85" />
        <path d="M29.5 22 Q32 20.9 34.5 22 L32 25.3 Z" fill="var(--mascot-accent)" />
        <ellipse cx="26.6" cy="23.2" rx="1.5" ry="0.9" fill="#ff8fab" opacity="0.45" />
        <ellipse cx="37.4" cy="23.2" rx="1.5" ry="0.9" fill="#ff8fab" opacity="0.45" />
      </g>
    </svg>
  );
}
