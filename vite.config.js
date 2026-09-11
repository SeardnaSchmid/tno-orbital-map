import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteSingleFile } from "vite-plugin-singlefile";

// Der Build erzeugt bewusst eine einzelne HTML-Datei: das Blatt soll sich
// per Doppelklick öffnen lassen, ohne Server und ohne Netz.
export default defineConfig({
  base: "./",
  plugins: [vue(), viteSingleFile()],
  server: { port: 30020, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000
  }
});
