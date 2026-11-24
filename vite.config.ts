import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({
      server: { entry: "server" },
    }),
    {
      name: "vite7-rollup-input-sync",
      enforce: "post",
      configResolved(resolvedConfig) {
        for (const env of Object.values(resolvedConfig.environments || {})) {
          const b = env.build as any;
          if (b?.rolldownOptions?.input && !b?.rollupOptions?.input) {
            b.rollupOptions = b.rollupOptions || {};
            b.rollupOptions.input = b.rolldownOptions.input;
          }
        }
      },
    },
    viteReact(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
