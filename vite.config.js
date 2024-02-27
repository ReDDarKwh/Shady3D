import { defineConfig } from "vite";

export default defineConfig({
  // config options
  base: "/Shady3D/",
  esbuild: {
    supported: {
      'top-level-await': true //browsers can handle top-level-await features
    },
  }
});
