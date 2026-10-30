export interface PlayerState {
  id: string
  name: string
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  health: number
}

export interface WorldMeta {
  id: string
  name: string
  seed: number
  mode: 'sandbox' | 'adventure'
  hostId: string
  createdAt: number
}

export interface ChatMessage {
  id: string
  sender: string
  text: string
  timestamp: number
}

export type BuildPermission = 'none' | 'request' | 'allowed' | 'denied'
