import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody, CapsuleCollider } from '@react-three/rapier'
import * as THREE from 'three'
import {
  PLAYER_SPEED,
  JUMP_FORCE,
  MOUSE_SENSITIVITY,
  SPRINT_MULTIPLIER,
  LOOK_SENSITIVITY_MOBILE,
} from './Constants'
import { useGameStore } from './store'
import { BlockType } from './BlockTypes'
import { raycastVoxel } from './Raycast'
import { getHeight } from './Noise'
import type { ChunkData } from './Terrain'

interface PlayerProps {
  onMove?: (x: number, z: number) => void
  chunksRef: React.MutableRefObject<Map<string, ChunkData>>
  seed: number
}

export default function Player({ onMove, chunksRef, seed }: PlayerProps) {
  const body = useRef<any>(null)
  const { camera, gl } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  const yaw = useRef(0)
  const pitch = useRef(0)
  const isLocked = useRef(false)
  const touchLook = useRef({ active: false, lastX: 0, lastY: 0 })
  const joystick = useRef({ active: false, dx: 0, dy: 0 })
  const ready = useRef(false)

  const selectedSlot = useGameStore((s) => s.selectedSlot)
  const setSelectedSlot = useGameStore((s) => s.setSelectedSlot)
  const hotbar = useGameStore((s) => s.hotbar)
  const removeItem = useGameStore((s) => s.removeItem)
  const addItem = useGameStore((s) => s.addItem)
  const setBlock = useGameStore((s) => s.setBlock)
  const edits = useGameStore((s) => s.edits)
  const isPaused = useGameStore((s) => s.isPaused)

  // Spawn well above terrain so we never start inside blocks
  const groundY = getHeight(8, 8, seed)
  const spawnY = groundY + 5

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.replace('Digit', ''), 10)
        if (n >= 1 && n <= 9) setSelectedSlot(n - 1)
      }
      if (e.code === 'Escape') useGameStore.getState().setPaused(!useGameStore.getState().isPaused)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current || isPaused) return
      yaw.current -= e.movementX * MOUSE_SENSITIVITY
      pitch.current -= e.movementY * MOUSE_SENSITIVITY
      pitch.current = Math.max(-1.4, Math.min(1.4, pitch.current))
    }

    const onClick = (e: MouseEvent) => {
      if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock()
        return
      }
      if (isPaused) return
      handleInteract(e.button === 2 ? 'place' : 'break')
    }

    const onContextMenu = (e: Event) => e.preventDefault()
    const onLockChange = () => {
      isLocked.current = document.pointerLockElement === document.body
    }

    const onTouchStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < window.innerWidth * 0.42) {
          joystick.current = { active: true, dx: 0, dy: 0 }
          ;(joystick.current as any).id = t.identifier
          ;(joystick.current as any).startX = t.clientX
          ;(joystick.current as any).startY = t.clientY
        } else {
          touchLook.current = { active: true, lastX: t.clientX, lastY: t.clientY }
          ;(touchLook.current as any).id = t.identifier
        }
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      for (const t of Array.from(e.touches)) {
        if ((joystick.current as any).id === t.identifier) {
          const dx = (t.clientX - (joystick.current as any).startX) / 55
          const dy = (t.clientY - (joystick.current as any).startY) / 55
          joystick.current.dx = Math.max(-1, Math.min(1, dx))
          joystick.current.dy = Math.max(-1, Math.min(1, dy))
        }
        if ((touchLook.current as any).id === t.identifier) {
          const dx = t.clientX - touchLook.current.lastX
          const dy = t.clientY - touchLook.current.lastY
          yaw.current -= dx * LOOK_SENSITIVITY_MOBILE
          pitch.current -= dy * LOOK_SENSITIVITY_MOBILE
          pitch.current = Math.max(-1.4, Math.min(1.4, pitch.current))
          touchLook.current.lastX = t.clientX
          touchLook.current.lastY = t.clientY
        }
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if ((joystick.current as any).id === t.identifier) {
          joystick.current = { active: false, dx: 0, dy: 0 }
        }
        if ((touchLook.current as any).id === t.identifier) {
          touchLook.current.active = false
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mousedown', onClick)
    window.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('pointerlockchange', onLockChange)
    gl.domElement.addEventListener('touchstart', onTouchStart, { passive: false })
    gl.domElement.addEventListener('touchmove', onTouchMove, { passive: false })
    gl.domElement.addEventListener('touchend', onTouchEnd)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('pointerlockchange', onLockChange)
      gl.domElement.removeEventListener('touchstart', onTouchStart)
      gl.domElement.removeEventListener('touchmove', onTouchMove)
      gl.domElement.removeEventListener('touchend', onTouchEnd)
    }
  }, [gl, isPaused, setSelectedSlot])

  function handleInteract(action: 'break' | 'place') {
    const origin = camera.position.clone()
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const hit = raycastVoxel(origin, dir, chunksRef.current, edits)
    if (!hit) return

    if (action === 'break') {
      setBlock(hit.x, hit.y, hit.z, BlockType.Air)
      addItem(BlockType.Stone, 1)
    } else {
      const slot = hotbar[selectedSlot]
      if (!slot || slot.count <= 0 || slot.type === BlockType.Air) return
      const px = hit.x + hit.face.x
      const py = hit.y + hit.face.y
      const pz = hit.z + hit.face.z
      if (py < 0 || py >= 36) return
      const pos = body.current?.translation()
      if (
        pos &&
        Math.abs(pos.x - px - 0.5) < 0.7 &&
        Math.abs(pos.z - pz - 0.5) < 0.7 &&
        Math.abs(pos.y - py) < 1.8
      )
        return
      if (removeItem(slot.type, 1)) {
        setBlock(px, py, pz, slot.type)
      }
    }
  }

  useFrame(() => {
    if (!body.current || isPaused) return

    const pos = body.current.translation()

    // If somehow inside/under ground, snap above surface
    if (pos.y < groundY - 1 || pos.y < -2) {
      body.current.setTranslation({ x: 8, y: spawnY, z: 8 }, true)
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
    }

    // Body origin is near the feet of the capsule setup
    // Capsule center at +0.8, half-height 0.5 + radius 0.3 → top ~1.6
    // Eyes slightly below top of head
    camera.position.set(pos.x, pos.y + 1.45, pos.z)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current

    const speed = keys.current['ShiftLeft'] ? PLAYER_SPEED * SPRINT_MULTIPLIER : PLAYER_SPEED
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    const move = new THREE.Vector3()
    if (keys.current['KeyW']) move.add(forward)
    if (keys.current['KeyS']) move.sub(forward)
    if (keys.current['KeyA']) move.sub(right)
    if (keys.current['KeyD']) move.add(right)

    if (joystick.current.active) {
      move.add(forward.clone().multiplyScalar(-joystick.current.dy))
      move.add(right.clone().multiplyScalar(joystick.current.dx))
    }

    const vel = body.current.linvel()
    if (move.length() > 0) {
      move.normalize().multiplyScalar(speed)
      body.current.setLinvel({ x: move.x, y: vel.y, z: move.z }, true)
    } else {
      body.current.setLinvel({ x: 0, y: vel.y, z: 0 }, true)
    }

    if (keys.current['Space'] && Math.abs(vel.y) < 0.3) {
      body.current.setLinvel({ x: vel.x, y: JUMP_FORCE, z: vel.z }, true)
    }

    onMove?.(pos.x, pos.z)
  })

  return (
    <RigidBody
      ref={body}
      position={[8, spawnY, 8]}
      enabledRotations={[false, false, false]}
      colliders={false}
      mass={1}
      linearDamping={0.2}
      lockRotations
    >
      {/*
        Capsule: half-height 0.5, radius 0.3
        Placed so bottom of capsule is near body origin (feet)
      */}
      <CapsuleCollider args={[0.5, 0.3]} position={[0, 0.8, 0]} />
    </RigidBody>
  )
}
