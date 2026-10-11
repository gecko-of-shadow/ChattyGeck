import { cn } from "@/lib/utils";

type Anim = "none" | "idle" | "scurry";

interface Leg {
  className: string;
  hip: [number, number];
  path: string;
  toes: [number, number][];
  foot: [number, number];
}

const LEGS: Leg[] = [
  {
    className: "gecko-leg-a",
    hip: [27.5, 21.5],
    path: "M27.5 21.5 L21 19.5 L17.5 13.5",
    foot: [17.5, 13.5],
    toes: [
      [13.8, 12.6],
      [14.6, 10.2],
      [16.8, 9.2],
      [19.4, 9.9],
    ],
  },
  {
    className: "gecko-leg-b",
    hip: [36.5, 21.5],
    path: "M36.5 21.5 L43 19.5 L46.5 13.5",
    foot: [46.5, 13.5],
    toes: [
      [50.2, 12.6],
      [49.4, 10.2],
      [47.2, 9.2],
      [44.6, 9.9],
    ],
  },
  {
    className: "gecko-leg-b",
    hip: [27.5, 35.5],
    path: "M27.5 35.5 L21 38.5 L18.5 44.5",
    foot: [18.5, 44.5],
    toes: [
      [14.6, 45.6],
      [15.2, 48.2],
      [17.4, 49.6],
      [20, 48.9],
    ],
  },
  {
    className: "gecko-leg-a",
    hip: [36.5, 35.5],
    path: "M36.5 35.5 L43 38.5 L45.5 44.5",
    foot: [45.5, 44.5],
    toes: [
      [49.4, 45.6],
      [48.8, 48.2],
      [46.6, 49.6],
      [44, 48.9],
    ],
  },
];

const SPOTS: [number, number, number][] = [
  [29.6, 25.5, 1.3],
  [34.6, 27.8, 1.1],
  [30.4, 32.4, 1.2],
  [34.2, 22.6, 0.9],
  [33.4, 36.6, 1],
  [29.4, 38.2, 0.8],
];

/** Top-down gecko, coloured by the active skin's --gecko-* variables. */
export function GeckoMascot({
  className,
  anim = "none",
  title,
}: {
  className?: string;
  anim?: Anim;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("mascot gecko-mascot overflow-visible", className)}
      data-anim={anim}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <g className="gecko-tongue">
        <path
          d="M32 5.2 V1.8 M32 2.1 L30.7 0.5 M32 2.1 L33.3 0.5"
          stroke="var(--mascot-accent)"
          strokeWidth="1.1"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      <g className="gecko-tail" fill="none" stroke="var(--mascot-body)" strokeLinecap="round">
        <path d="M32 40 C 32.5 46, 31 50.5, 27 53.5" strokeWidth="5.6" />
        <path d="M27 53.5 C 23 56.5, 17.5 56.5, 16 52.5" strokeWidth="3.8" />
        <path d="M16 52.5 C 14.8 49, 18 46.6, 20.2 48.6" strokeWidth="2.3" />
      </g>

      {LEGS.map((leg) => (
        <g
          key={leg.path}
          className={cn("gecko-leg", leg.className)}
          style={{ transformBox: "view-box", transformOrigin: `${leg.hip[0]}px ${leg.hip[1]}px` }}
        >
          <path
            d={leg.path}
            fill="none"
            stroke="var(--mascot-body)"
            strokeWidth="3.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {leg.toes.map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <line
                x1={leg.foot[0]}
                y1={leg.foot[1]}
                x2={x}
                y2={y}
                stroke="var(--mascot-body)"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <circle cx={x} cy={y} r="1.15" fill="var(--mascot-body)" />
            </g>
          ))}
        </g>
      ))}

      <path
        d="M32 18.5 C 35.5 18.5, 38.6 23, 38.8 29 C 39 35, 36.5 41, 32 42.2 C 27.5 41, 25 35, 25.2 29 C 25.4 23, 28.5 18.5, 32 18.5 Z"
        fill="var(--mascot-body)"
      />
      <ellipse cx="32" cy="30" rx="1.6" ry="9" fill="var(--mascot-belly)" opacity="0.28" />
      {SPOTS.map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="var(--mascot-spot)" />
      ))}

      <path
        d="M32 4.6 C 38.2 4.6, 40.6 9.6, 40 13.6 C 39.4 17.4, 36.2 19.8, 32 19.8 C 27.8 19.8, 24.6 17.4, 24 13.6 C 23.4 9.6, 25.8 4.6, 32 4.6 Z"
        fill="var(--mascot-body)"
      />
      <circle cx="30.6" cy="6.9" r="0.45" fill="var(--mascot-pupil)" opacity="0.6" />
      <circle cx="33.4" cy="6.9" r="0.45" fill="var(--mascot-pupil)" opacity="0.6" />
      <path
        d="M28.6 15.4 Q32 17.6 35.4 15.4"
        stroke="var(--mascot-pupil)"
        strokeOpacity="0.45"
        strokeWidth="0.75"
        strokeLinecap="round"
        fill="none"
      />
      <g className="gecko-eyes">
        <circle cx="26.4" cy="11.2" r="2.5" fill="var(--mascot-eye)" />
        <circle cx="37.6" cy="11.2" r="2.5" fill="var(--mascot-eye)" />
        <ellipse cx="26.4" cy="11.2" rx="0.55" ry="1.8" fill="var(--mascot-pupil)" />
        <ellipse cx="37.6" cy="11.2" rx="0.55" ry="1.8" fill="var(--mascot-pupil)" />
        <circle cx="25.7" cy="10.3" r="0.45" fill="#fff" opacity="0.7" />
        <circle cx="36.9" cy="10.3" r="0.45" fill="#fff" opacity="0.7" />
      </g>
    </svg>
  );
}
