import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Sky } from "@react-three/drei";
import World from "./World";

export default function Game() {
    return (
        <Canvas
            shadows={false}
            dpr={[1, 1.5]}
            camera={{
                position: [8, 20, 8],
                fov: 75,
                near: 0.1,
                far: 300
            }}
        >
            <Sky
                distance={450000}
                sunPosition={[100, 50, 100]}
            />

            <ambientLight intensity={2} />

            <directionalLight
                intensity={1.2}
                position={[25, 40, 25]}
            />

            <Physics gravity={[0, -25, 0]}>
                <World />
            </Physics>
        </Canvas>
    );
}
