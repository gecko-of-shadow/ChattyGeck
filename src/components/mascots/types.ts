export type MascotAnim = "none" | "idle" | "scurry";

export interface MascotProps {
  className?: string;
  anim?: MascotAnim;
  title?: string;
}
