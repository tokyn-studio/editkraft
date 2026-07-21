import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsup";

const external = ["react", "react-dom", "next", "@supabase/supabase-js", "@editkraft/schema"];

// Eigene Paketversion zur Build-Zeit einspeisen — die Preview meldet sie ans
// Studio (ek:runtime-info), damit das Studio auf eine veraltete Runtime hinweisen
// kann. `define` ersetzt das Token im Bundle durch das String-Literal.
const RUNTIME_VERSION = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string })
  .version;
const define = { __EK_RUNTIME_VERSION__: JSON.stringify(RUNTIME_VERSION) };

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
    define,
    onSuccess: async () => ensureUseClient(),
  },
]);
