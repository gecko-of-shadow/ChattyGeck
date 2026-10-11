import { cn } from "@/lib/utils";

/** A gecko foot with sticky toe pads. Used for "stick to live chat". */
export function GeckoFootIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4", className)} aria-hidden>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M12 15 L5.6 9.6" />
        <path d="M12 15 L8.4 5.8" />
        <path d="M12 15 L12 4.2" />
        <path d="M12 15 L15.6 5.8" />
        <path d="M12 15 L18.4 9.6" />
      </g>
      <g fill="currentColor">
        <ellipse cx="12" cy="17" rx="3.6" ry="3.2" />
        <circle cx="5.2" cy="9.2" r="1.9" />
        <circle cx="8.1" cy="5.2" r="1.9" />
        <circle cx="12" cy="3.6" r="1.9" />
        <circle cx="15.9" cy="5.2" r="1.9" />
        <circle cx="18.8" cy="9.2" r="1.9" />
      </g>
    </svg>
  );
}

/** Slit-pupil gecko eye, used to flag mentions. */
export function GeckoEyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-3.5", className)} aria-hidden>
      <circle cx="8" cy="8" r="6.4" fill="var(--mention)" />
      <ellipse cx="8" cy="8" rx="1.25" ry="4.8" fill="#0b0b0b" />
      <circle cx="6.2" cy="5.6" r="1" fill="#fff" opacity="0.75" />
    </svg>
  );
}

/** Speckled gecko egg, used for first-time chatters. */
export function GeckoEggIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-3.5", className)} aria-hidden>
      <path
        d="M8 1.4 C 11 1.4, 13.2 6, 13.2 9.3 C 13.2 12.5, 10.9 14.6, 8 14.6 C 5.1 14.6, 2.8 12.5, 2.8 9.3 C 2.8 6, 5 1.4, 8 1.4 Z"
        fill="var(--gecko-belly)"
      />
      <path d="M4.2 8.4 L5.8 7.2 L7.2 8.6 L8.8 7.1 L10.2 8.5 L11.8 7.4" stroke="#3b3326" strokeWidth="0.9" fill="none" strokeLinejoin="round" />
      <circle cx="6.2" cy="11" r="0.8" fill="var(--gecko-spot)" />
      <circle cx="9.6" cy="11.8" r="0.6" fill="var(--gecko-spot)" />
      <circle cx="9.2" cy="4.6" r="0.6" fill="var(--gecko-spot)" />
    </svg>
  );
}

/** A dropped gecko tail, for lost connections. */
export function GeckoTailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4", className)} aria-hidden>
      <path
        d="M4 6 C 9 6, 13 8, 15 12 C 17 16, 16 20, 12.5 20 C 10 20, 9.5 17, 11.5 16.2"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M3 4.2 L5 7.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1.6 1.6" />
    </svg>
  );
}
