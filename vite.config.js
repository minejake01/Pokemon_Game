import { defineConfig } from 'vite'

// Mounts the game server's API inside the Vite dev/preview server, so one command runs everything.
const gameServer = () => ({
  name: 'poke-arena-server',
  async configureServer(server) {
    const { handleApi } = await import('./server/api.js')
    server.middlewares.use(handleApi)
  },
  async configurePreviewServer(server) {
    const { handleApi } = await import('./server/api.js')
    server.middlewares.use(handleApi)
  },
})

export default defineConfig({
  plugins: [gameServer()],
  server: { watch: { ignored: ['**/server/saves/**'] } },
  build: { chunkSizeWarningLimit: 1600 }, // Phaser alone is ~1.2 MB
})
