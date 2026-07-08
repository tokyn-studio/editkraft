import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsup";

const external = ["react", "react-dom", "next", "@supabase/supabase-js", "@editkraft/schema"];

/** Stellt sicher, dass die Client-Bundles mit "use client" beginnen. */
function ensureUseClient() {
  for (const file of ["dist/preview.js", "dist/preview.cjs"]) {
    const code = readFileSync(file, "utf8");
    if (!code.startsWith('"use client"')) {
      writeFileSync(file, `"use client";\n${code}`);
    }
  }
}

// Zwei Configs: Server-Exports (index) ohne Direktive; Client-Komponente
// (preview) mit "use client" (per onSuccess prepended, da Treeshake das
// alleinstehende Direktiv-Statement sonst entfernt).
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    external,
  },
  {
    entry: { preview: "src/preview.tsx" },
    format: ["esm", "cjs"],
    dts: true,
    clean: false,
    sourcemap: true,
    treeshake: true,
    external,
    onSuccess: async () => ensureUseClient(),
  },
]);
