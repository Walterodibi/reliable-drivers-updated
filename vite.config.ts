
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Define global variables that are normally available in Node.js
  define: {
    // Provide proper process.env object for client-side code
    'process.env': JSON.stringify({
      NODE_ENV: mode,
    }),
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
}));
