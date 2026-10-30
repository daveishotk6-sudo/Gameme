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
import { useGameStore } from './store'

interface GameProps {
  seed: number
  onExit: () => void
}

function DayNightCycle() {
  const setTimeOfDay = useGameStore((s) => s.setTimeOfDay)
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const skyRef = useRef<any>(null)

  useFrame((_, delta) => {
    const state = useGameStore.getState()
    let t = state.timeOfDay + delta * 0.008 // ~2 min full cycle
    if (t > 1) t -= 1
    setTimeOfDay(t)

    // Sun position: circle over the day
    const angle = t * Math.PI * 2 - Math.PI / 2
    const sunX = Math.cos(angle) * 100
    const sunY = Math.sin(angle) * 80
    const sunZ = 40

    if (sunRef.current) {
      sunRef.current.position.set(sunX, Math.max(5, sunY), sunZ)
      sunRef.current.intensity = Math.max(0.15, sunY / 80)
    }
  })

  return (
    <>
      <Sky
        ref={skyRef}
        distance={450000}
        sunPosition={[80, 40, 80]}
        inclination={0.6}
        azimuth={0.25}
      />
      <ambientLight intensity={0.35} />
      <directionalLight ref={sunRef} intensity={1.1} position={[40, 60, 30]} />
    </>
  )
}

export default function Game({ seed, onExit }: GameProps) {
  const isPaused = useGameStore((s) => s.isPaused)

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        shadows={false}
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{
          position: [8, 32, 8],
          fov: 75,
          near: 0.1,
          far: 400,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#87CEEB')
        }}
      >
        <DayNightCycle />

        <Suspense fallback={null}>
          <Physics gravity={[0, -28, 0]} timeStep="vary">
            <World seed={seed} />
          </Physics>
        </Suspense>
      </Canvas>

      <Crosshair />
      <HUD onExit={onExit} />
      <MobileControls />
      {isPaused && <PauseMenu onExit={onExit} />}
    </div>
  )
}
