import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Vendor chunk groups. Matching is done on the package directory so pnpm's
// nested node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/ layout works too.
const VENDOR_CHUNKS: Record<string, RegExp> = {
  "vendor-react": /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/,
  "vendor-charts": /[\\/]node_modules[\\/](recharts|recharts-scale|victory-vendor|d3-[^\\/]+|internmap|decimal\.js-light|eventemitter3|lodash)[\\/]/,
  "vendor-ui": /[\\/]node_modules[\\/](radix-ui|@radix-ui[\\/][^\\/]+|@floating-ui[\\/][^\\/]+|lucide-react|sonner|next-themes|cmdk|react-remove-scroll[^\\/]*|aria-hidden)[\\/]/,
  "vendor-data": /[\\/]node_modules[\\/](@tanstack[\\/][^\\/]+|i18next[^\\/]*|react-i18next|zod|react-hook-form|@hookform[\\/][^\\/]+)[\\/]/,
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined
          for (const [name, re] of Object.entries(VENDOR_CHUNKS)) {
            if (re.test(id)) return name
          }
          return undefined
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/sub": "http://127.0.0.1:8080",
      "/install": "http://127.0.0.1:8080",
      "/ws": {
        target: "ws://127.0.0.1:8080",
        ws: true,
      },
    },
  },
})
