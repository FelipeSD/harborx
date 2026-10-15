import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["server/index.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist/server",
  clean: true,
  banner: {
    js: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);`,
  },
  external: ["better-sqlite3", "@node-rs/argon2", "dockerode"],
});
