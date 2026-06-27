import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.FURMARK_RELATIVE_BASE === "true" ? "./" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
  },
});
