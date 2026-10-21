import { timingSafeEqual } from "node:crypto";

// Cloudflare Workers add crypto.subtle.timingSafeEqual; Node keeps the same check in node:crypto.
Object.assign(crypto.subtle, {
  timingSafeEqual: (a: ArrayBufferView, b: ArrayBufferView) => timingSafeEqual(a, b),
});
