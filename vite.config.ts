import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds one self-contained HTML file (three.js, the dog rigs and the styles are all inlined),
// so the meadow runs offline from a single file.
//   vite build               -> dist/index.html, the wallpaper build: no menu, no input, orbit camera
//   vite build --mode pages  -> dist-pages/index.html, the shareable build: full menu and interaction
export default defineConfig(({ command, mode }) => ({
  plugins: [viteSingleFile()],
  define: { __WALLPAPER__: JSON.stringify(command === 'build' && mode !== 'pages') },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000, outDir: mode === 'pages' ? 'dist-pages' : 'dist' },
}));
