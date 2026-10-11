import { cn } from "@/lib/utils";
import type { MascotProps } from "./types";

/** Front-facing elephant, coloured by the active theme's --mascot-* variables. */
export function ElephantMascot({ className, anim = "none", title }: MascotProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("mascot elephant-mascot overflow-visible", className)}
      data-anim={anim}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <g className="mascot-part elephant-ear" style={{ transformOrigin: "22px 28px" }}>
        <path d="M22 17.5 C 10 13.5, 3 22, 5 32 C 7 41, 15 45.5, 22.5 40 Z" fill="var(--mascot-body)" />
        <path d="M20 21 C 12.5 19, 8.5 25, 10 32 C 11.5 38, 16 40, 20 37 Z" fill="var(--mascot-accent)" opacity="0.5" />
      </g>
      <g className="mascot-part elephant-ear" style={{ transformOrigin: "42px 28px" }}>
        <path d="M42 17.5 C 54 13.5, 61 22, 59 32 C 57 41, 49 45.5, 41.5 40 Z" fill="var(--mascot-body)" />
        <path d="M44 21 C 51.5 19, 55.5 25, 54 32 C 52.5 38, 48 40, 44 37 Z" fill="var(--mascot-accent)" opacity="0.5" />
      </g>
      <path
        d="M32 12 C 42.5 12, 46 19.5, 45.5 27 C 45 34, 40.5 38.5, 32 38.5 C 23.5 38.5, 19 34, 18.5 27 C 18 19.5, 21.5 12, 32 12 Z"
        fill="var(--mascot-body)"
      />
      <path
        d="M26 17.5 Q32 15.5 38 17.5"
        stroke="var(--mascot-belly)"
        strokeOpacity="0.55"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />
      <g stroke="#f8f5ee" strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d="M27.4 33.5 C 25.9 37, 26.4 40, 28.4 41.5" />
        <path d="M36.6 33.5 C 38.1 37, 37.6 40, 35.6 41.5" />
      </g>
      <g className="mascot-part elephant-trunk" style={{ transformOrigin: "32px 33px" }}>
        <path
          d="M32 31 C 32 38, 31.5 45, 29 50 C 27.5 53, 28.5 56, 31.5 55.5"
          stroke="var(--mascot-body)"
          strokeWidth="6.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M29.6 40 H33.8 M28.9 44 H33.1 M27.8 48 H31.8"
          stroke="var(--mascot-spot)"
          strokeWidth="0.8"
          strokeLinecap="round"
          opacity="0.75"
        />
      </g>
      <circle cx="26.5" cy="25" r="1.8" fill="var(--mascot-pupil)" />
      <circle cx="37.5" cy="25" r="1.8" fill="var(--mascot-pupil)" />
      <circle cx="25.9" cy="24.3" r="0.55" fill="#fff" opacity="0.85" />
      <circle cx="36.9" cy="24.3" r="0.55" fill="#fff" opacity="0.85" />
      <ellipse cx="23.8" cy="30" rx="2" ry="1.2" fill="var(--mascot-accent)" opacity="0.45" />
      <ellipse cx="40.2" cy="30" rx="2" ry="1.2" fill="var(--mascot-accent)" opacity="0.45" />
    </svg>
  );
}
