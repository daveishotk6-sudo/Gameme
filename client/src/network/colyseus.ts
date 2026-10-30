/**
 * Colyseus client wrapper.
 * Connects to the game server when multiplayer is enabled.
 */
import { Client, Room } from 'colyseus.js'

let client: Client | null = null
let room: Room | null = null

export async function connectToRoom(options: {
  serverUrl?: string
  name?: string
  seed?: number
  mode?: string
}) {
  const url = options.serverUrl || import.meta.env.VITE_SERVER_URL || 'ws://localhost:2567'
  client = new Client(url)

  room = await client.joinOrCreate('game', {
    name: options.name || 'Player',
    seed: options.seed,
    mode: options.mode || 'sandbox',
  })

  return room
}

export function getRoom() {
  return room
}

export function sendMove(data: { x: number; y: number; z: number; yaw: number; pitch: number }) {
  room?.send('move', data)
}

export function sendChat(text: string) {
  room?.send('chat', { text })
}

export function disconnect() {
  room?.leave()
  room = null
  client = null
}
