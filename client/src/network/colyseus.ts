/**
 * Colyseus client – auto-detects Railway / local URL
 */
import { Client, Room } from 'colyseus.js'

let client: Client | null = null
let room: Room | null = null

function getServerUrl() {
  // On Railway the client and server share the same origin
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}`
  }
  return import.meta.env.VITE_SERVER_URL || 'ws://localhost:2567'
}

export async function connectToRoom(options: {
  name?: string
  seed?: number
  mode?: string
}) {
  const url = getServerUrl()
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
