import { THEMES, type Skin } from "@/lib/themes";
import { useResolvedSkin } from "@/lib/useTheme";
import { ElephantMascot } from "./ElephantMascot";
import { GeckoMascot } from "./GeckoMascot";
import { PenguinMascot } from "./PenguinMascot";
import { TurtleMascot } from "./TurtleMascot";
import type { MascotProps } from "./types";

/** The current theme's animal. Pass `skin` to draw a specific theme's animal (e.g. in previews). */
export function Mascot({ skin, ...props }: MascotProps & { skin?: Skin }) {
  const current = useResolvedSkin();
  switch (THEMES[skin ?? current]?.animal) {
    case "penguin":
      return <PenguinMascot {...props} />;
    case "turtle":
      return <TurtleMascot {...props} />;
    case "elephant":
      return <ElephantMascot {...props} />;
    default:
      return <GeckoMascot {...props} />;
  }
}
