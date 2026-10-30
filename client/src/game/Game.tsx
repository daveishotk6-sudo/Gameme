import { Canvas, useFrame } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Sky } from '@react-three/drei'
import { Suspense, useRef } from 'react'
import * as THREE from 'three'
import World from './World'
import Crosshair from '../ui/Crosshair'
import HUD from '../ui/HUD'
import PauseMenu from '../ui/PauseMenu'
import MobileControls from '../ui/MobileControls'
import Chat from '../ui/Chat'
import { useGameStore } from './store'

interface GameProps {
  seed: number
  mode?: 'sandbox' | 'adventure'
  onExit: () => void
}

function DayNightCycle() {
  const setTimeOfDay = useGameStore((s) => s.setTimeOfDay)
  const sunRef = useRef<THREE.DirectionalLight>(null)

  useFrame((_, delta) => {
    const state = useGameStore.getState()
    let t = state.timeOfDay + delta * 0.006
    if (t > 1) t -= 1
    setTimeOfDay(t)

    const angle = t * Math.PI * 2 - Math.PI / 2
    const sunY = Math.sin(angle) * 60

    if (sunRef.current) {
      sunRef.current.position.set(Math.cos(angle) * 80, Math.max(8, sunY), 30)
      sunRef.current.intensity = Math.max(0.2, Math.min(1.0, sunY / 50))
    }
  })

  return (
    <>
      <Sky distance={300000} sunPosition={[60, 30, 60]} inclination={0.55} azimuth={0.25} />
      <ambientLight intensity={0.45} />
      <directionalLight ref={sunRef} intensity={0.9} position={[40, 50, 20]} />
    </>
  )
}

export default function Game({ seed, onExit }: GameProps) {
  const isPaused = useGameStore((s) => s.isPaused)

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        shadows={false}
        dpr={1}
        frameloop="always"
        gl={{
          antialias: false,
          powerPreference: 'low-power',
          alpha: false,
          stencil: false,
          depth: true,
        }}
        camera={{
          position: [8, 25, 8],
          fov: 70,
          near: 0.15,
          far: 120,
        }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor('#87CEEB')
          gl.setPixelRatio(1)
          camera.rotation.order = 'YXZ'
        }}
      >
        <DayNightCycle />

        <Suspense fallback={null}>
          <Physics gravity={[0, -26, 0]} timeStep={1 / 30} maxSteps={1}>
            <World seed={seed} />
          </Physics>
        </Suspense>
      </Canvas>

      <Crosshair />
      <HUD onExit={onExit} />
      <MobileControls />
      <Chat />
      {isPaused && <PauseMenu onExit={onExit} />}
    </div>
  )
}
