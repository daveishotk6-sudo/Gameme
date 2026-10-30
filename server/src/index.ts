import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { Server } from 'colyseus'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { GameRoom } from './rooms/GameRoom.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT) || 2567

const app = express()
app.use(cors())
app.use(express.json())

// Health check for Railway
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: Date.now() })
})

// Serve the built client (Vite outputs to client/dist)
const clientDist = path.resolve(__dirname, '../../client/dist')
app.use(express.static(clientDist))

// SPA fallback – always return index.html for client routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/colyseus') || req.headers.upgrade === 'websocket') {
    return next()
  }
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Client not built yet. Run the build step.')
  })
})

const httpServer = createServer(app)

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
})

gameServer.define('game', GameRoom)

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`[Gameme] Server + Client ready on port ${port}`)
})
