import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody, CapsuleCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { PLAYER_SPEED, JUMP_FORCE, MOUSE_SENSITIVITY, SPRINT_MULTIPLIER } from './Constants'

interface PlayerProps {
  onMove?: (x: number, z: number) => void
}

export default function Player({ onMove }: PlayerProps) {
  const body = useRef<any>(null)
  const { camera } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  const yaw = useRef(0)
  const pitch = useRef(0)
  const isLocked = useRef(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { keys.current[e.code] = true }
    const onKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false }

    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current) return
      yaw.current -= e.movementX * MOUSE_SENSITIVITY
      pitch.current -= e.movementY * MOUSE_SENSITIVITY
      pitch.current = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch.current))
    }

    const onClick = () => {
      document.body.requestPointerLock()
    }

    const onLockChange = () => {
      isLocked.current = document.pointerLockElement === document.body
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('click', onClick)
    document.addEventListener('pointerlockchange', onLockChange)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('click', onClick)
      document.removeEventListener('pointerlockchange', onLockChange)
    }
  }, [])

  useFrame((_, delta) => {
    if (!body.current) return

    // Camera rotation
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current

    const speed = keys.current['ShiftLeft'] ? PLAYER_SPEED * SPRINT_MULTIPLIER : PLAYER_SPEED
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()

    const right = new THREE.Vector3()
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    const move = new THREE.Vector3()
    if (keys.current['KeyW']) move.add(forward)
    if (keys.current['KeyS']) move.sub(forward)
    if (keys.current['KeyA']) move.sub(right)
    if (keys.current['KeyD']) move.add(right)

    if (move.length() > 0) {
      move.normalize().multiplyScalar(speed)
      const vel = body.current.linvel()
      body.current.setLinvel({ x: move.x, y: vel.y, z: move.z }, true)
    } else {
      const vel = body.current.linvel()
      body.current.setLinvel({ x: 0, y: vel.y, z: 0 }, true)
    }

    if (keys.current['Space']) {
      const vel = body.current.linvel()
      if (Math.abs(vel.y) < 0.1) {
        body.current.setLinvel({ x: vel.x, y: JUMP_FORCE, z: vel.z }, true)
      }
    }

    // Sync camera to body
    const pos = body.current.translation()
    camera.position.set(pos.x, pos.y + 0.7, pos.z)

    onMove?.(pos.x, pos.z)
  })

  return (
    <RigidBody
      ref={body}
      position={[8, 30, 8]}
      enabledRotations={[false, false, false]}
      colliders={false}
      mass={1}
      linearDamping={0.1}
    >
      <CapsuleCollider args={[0.5, 0.35]} position={[0, 0.85, 0]} />
    </RigidBody>
  )
}
