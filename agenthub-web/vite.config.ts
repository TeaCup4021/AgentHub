import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import type { ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

// recharts 3.8.1 imports es-toolkit/compat/* (CJS wrappers).
// Compat .js stubs use CJS require() patterns whose variable names
// (require_isUnsafeProperty) collide with the pre-bundler's CJS→ESM
// converter, which also generates require_* functions.
//
// This plugin works at two levels:
// 1. resolveId + load → intercepts bare imports in source transformations
// 2. configureServer middleware → intercepts pre-resolved HTTP requests
//    from pre-bundled deps (optimizeDeps.exclude leaves them as external refs)
function esToolkitCompatPlugin() {
  const compatDir = path.resolve(__dirname, 'node_modules/es-toolkit/compat')

  function resolveEsm(name: string): { relative: string; absolute: string } | null {
    const stubPath = path.resolve(compatDir, `${name}.js`)
    if (!fs.existsSync(stubPath)) return null
    const stubContent = fs.readFileSync(stubPath, 'utf-8')
    // module.exports = require('../dist/compat/{dir}/{name}.js').{name};
    const match = stubContent.match(/require\('(\.\.\/dist\/compat\/.+?)\.js'\)/)
    if (!match) return null
    const relative = match[1] + '.mjs'
    const absolute = path.resolve(compatDir, `${match[1]}.mjs`).replace(/\\/g, '/')
    return { relative, absolute }
  }

  function esmWrapper(name: string, esmPath: string) {
    return `export { ${name} as default, ${name} } from '${esmPath}';`
  }

  return {
    name: 'es-toolkit-compat',
    enforce: 'pre',
    resolveId(id: string) {
      if (id.startsWith('es-toolkit/compat/')) {
        const name = id.slice('es-toolkit/compat/'.length).replace(/\.js$/, '')
        if (resolveEsm(name)) return '\0es-toolkit-compat:' + name
      }
      return null
    },
    load(id: string) {
      if (!id.startsWith('\0es-toolkit-compat:')) return null
      const name = id.slice('\0es-toolkit-compat:'.length)
      const resolved = resolveEsm(name)
      if (!resolved) return null
      return esmWrapper(name, resolved.absolute)
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url || ''
        if (!url.includes('/es-toolkit/compat/')) return next()
        const m = url.match(/es-toolkit\/compat\/([^/?]+)/)
        if (!m) return next()
        const name = m[1].replace(/\.js$/, '')
        const resolved = resolveEsm(name)
        if (!resolved) return next()
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.end(esmWrapper(name, resolved.relative))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), esToolkitCompatPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ["recharts"],
    exclude: ["es-toolkit"],
  },
})
