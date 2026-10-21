import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Lets the tests parse the recorder's lines with ZooChattr's own IRC parser.
      "@": fileURLToPath(new URL("../src", import.meta.url)),
      // The Workers runtime's module doesn't exist under Node.
      "cloudflare:workers": fileURLToPath(new URL("./src/test-workers.ts", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"], setupFiles: ["./src/test-setup.ts"] },
});
