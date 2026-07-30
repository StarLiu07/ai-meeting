import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function apiProxy() {
  return {
    name: 'ai-meeting-api-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      const baseUrl = env.AI_MEETING_BASE_URL || 'https://downstream.jbbtoken.cn/v1'
      const apiKey = env.AI_MEETING_API_KEY

      server.middlewares.use('/api', async (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (!apiKey) {
          response.statusCode = 503
          response.end(JSON.stringify({ error: '缺少 AI_MEETING_API_KEY。请在 .env.local 中配置 API Key。' }))
          return
        }

        const upstreamPath = request.url === '/models' ? '/models' : '/chat/completions'
        try {
          let body
          if (request.method !== 'GET') {
            body = await new Promise((resolve, reject) => {
              let raw = ''
              request.on('data', (chunk) => { raw += chunk })
              request.on('end', () => resolve(raw))
              request.on('error', reject)
            })
          }
          const upstream = await fetch(`${baseUrl}${upstreamPath}`, {
            method: request.method === 'GET' ? 'GET' : 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: request.method === 'GET' ? undefined : body,
          })
          response.statusCode = upstream.status
          response.end(await upstream.text())
        } catch (error) {
          response.statusCode = 502
          response.end(JSON.stringify({ error: `上游模型服务不可用：${error.message}` }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiProxy()],
})
