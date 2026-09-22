import { defineConfig } from "vite";
export default defineConfig({
  root: ".",
  server: { host: "127.0.0.1", port: 56920, strictPort: true },
  resolve: { dedupe: ["react", "react-dom"] },
});
