import { readableTagColor, TAG_TINT } from "@/lib/colors";
import { useResolvedSkin } from "@/lib/useTheme";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";

export function ChannelAvatar({ login, className }: { login: string; className?: string }) {
  // Joined channels carry their picture; Twitch follows that aren't joined have theirs in the follow list.
  const avatarUrl = useChat((s) => s.channels[login]?.avatarUrl ?? s.follows[login]?.avatarUrl);
  if (avatarUrl) {
    // Not draggable: the browser's own image drag would swallow a pointer-up. Lazy: a long follow list only loads
    // the pictures scrolled into view.
    return <img src={avatarUrl} alt="" draggable={false} loading="lazy" decoding="async" className={cn("size-7 shrink-0 rounded-full object-cover", className)} />;
  }
  return <LetterAvatar login={login} className={className} />;
}

/** No picture yet: the first letter. Only this needs the theme, so a list of pictured avatars doesn't watch it. */
function LetterAvatar({ login, className }: { login: string; className?: string }) {
  const skin = useResolvedSkin();
  // Letter colour is nudged per theme to read at 4.5:1 on its disc (tested in themeContrast.test.ts).
  const color = readableTagColor(login, skin);
  return (
    <span
      aria-hidden
      className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold uppercase", className)}
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} ${TAG_TINT * 100}%, var(--zc-surface))` }}
    >
      {login[0]}
    </span>
  );
}
