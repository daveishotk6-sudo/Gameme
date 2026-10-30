import { Canvas, useFrame } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Sky, Fog } from '@react-three/drei'
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
    let t = state.timeOfDay + delta * 0.005
    if (t > 1) t -= 1
    setTimeOfDay(t)

    const angle = t * Math.PI * 2 - Math.PI / 2
    const sunY = Math.sin(angle) * 55

    if (sunRef.current) {
      sunRef.current.position.set(Math.cos(angle) * 70, Math.max(10, sunY), 25)
      sunRef.current.intensity = Math.max(0.25, Math.min(1.0, sunY / 45))
    }
  })

  return (
    <>
      <Sky distance={300000} sunPosition={[50, 35, 50]} inclination={0.5} azimuth={0.25} />
      <fog attach="fog" args={['#a0c4e8', 35, 85]} />
      <ambientLight intensity={0.55} />
      <directionalLight ref={sunRef} intensity={0.85} position={[40, 45, 20]} />
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
        gl={{
          antialias: false,
          powerPreference: 'low-power',
          alpha: false,
          stencil: false,
        }}
        camera={{
          position: [8, 22, 8],
          fov: 70,
          near: 0.1,
          far: 120,
        }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor('#a0c4e8')
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
