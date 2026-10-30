import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Sky, Stats } from '@react-three/drei'
import { Suspense } from 'react'
import World from './World'
import Crosshair from '../ui/Crosshair'
import HUD from '../ui/HUD'

interface GameProps {
  seed: number
  onExit: () => void
}

export default function Game({ seed, onExit }: GameProps) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        shadows={false}
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{
          position: [8, 25, 8],
          fov: 75,
          near: 0.1,
          far: 400,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#87CEEB')
        }}
      >
        <Sky distance={450000} sunPosition={[80, 40, 80]} inclination={0.6} azimuth={0.25} />
        <ambientLight intensity={0.55} />
        <directionalLight intensity={1.1} position={[40, 60, 30]} castShadow={false} />

        <Suspense fallback={null}>
          <Physics gravity={[0, -28, 0]} timeStep="vary">
            <World seed={seed} />
          </Physics>
        </Suspense>

        {/* <Stats /> */}
      </Canvas>

      <Crosshair />
      <HUD onExit={onExit} />
    </div>
  )
}
