import { Room, Client } from 'colyseus'
import { Schema, type, MapSchema } from '@colyseus/schema'

class Player extends Schema {
  @type('string') id = ''
  @type('string') name = 'Player'
  @type('number') x = 8
  @type('number') y = 30
  @type('number') z = 8
  @type('number') yaw = 0
  @type('number') pitch = 0
  @type('boolean') canBuild = false
}

class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>()
  @type('number') seed = 0
  @type('string') hostId = ''
  @type('string') mode = 'sandbox'
}

export class GameRoom extends Room<GameState> {
  maxClients = 16

  onCreate(options: any) {
    this.setState(new GameState())
    this.state.seed = options.seed ?? Math.floor(Math.random() * 1e6)
    this.state.mode = options.mode ?? 'sandbox'

    this.onMessage('move', (client, data) => {
      const player = this.state.players.get(client.sessionId)
      if (!player) return
      player.x = data.x
      player.y = data.y
      player.z = data.z
      player.yaw = data.yaw
      player.pitch = data.pitch
    })

    this.onMessage('chat', (client, data) => {
      const player = this.state.players.get(client.sessionId)
      if (!player) return
      this.broadcast('chat', {
        id: Date.now().toString(),
        sender: player.name,
        text: String(data.text).slice(0, 200),
        timestamp: Date.now(),
      })
    })

    this.onMessage('requestBuild', (client) => {
      // Host can later approve
      this.broadcast('buildRequest', { playerId: client.sessionId })
    })

    this.onMessage('setBuildPermission', (client, data) => {
      if (client.sessionId !== this.state.hostId) return
      const target = this.state.players.get(data.playerId)
      if (target) target.canBuild = !!data.allowed
    })
  }

  onJoin(client: Client, options: any) {
    const player = new Player()
    player.id = client.sessionId
    player.name = options.name ?? `Player_${client.sessionId.slice(0, 4)}`

    if (this.state.players.size === 0) {
      this.state.hostId = client.sessionId
      player.canBuild = true
    }

    this.state.players.set(client.sessionId, player)
    console.log(`[Room] ${player.name} joined`)
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId)
    if (client.sessionId === this.state.hostId) {
      // Transfer host to next player
      const next = this.state.players.keys().next()
      if (!next.done) this.state.hostId = next.value
    }
  }
}
