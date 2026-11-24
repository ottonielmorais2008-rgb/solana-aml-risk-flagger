import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("api", { recursive: true });

await build({
  entryPoints: {
    explain: "server/explain.ts",
  },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outdir: "api",
  legalComments: "none",
  logLevel: "info",
  packages: "external",
});
