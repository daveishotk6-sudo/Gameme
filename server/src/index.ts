import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'colyseus'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { GameRoom } from './rooms/GameRoom'

const port = Number(process.env.PORT) || 2567

const app = express()
app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: Date.now() })
})

const httpServer = createServer(app)

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
})

gameServer.define('game', GameRoom)

httpServer.listen(port, () => {
  console.log(`[Gameme Server] listening on :${port}`)
})
