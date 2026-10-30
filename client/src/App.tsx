import { useState } from 'react'
import Game from './game/Game'
import MainMenu from './ui/MainMenu'
import LoadingScreen from './ui/LoadingScreen'

type Screen = 'menu' | 'loading' | 'game'

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [worldSeed, setWorldSeed] = useState(Math.floor(Math.random() * 1000000))

  const startGame = (seed?: number) => {
    setWorldSeed(seed ?? Math.floor(Math.random() * 1000000))
    setScreen('loading')
    // Simulate short load then enter game
    setTimeout(() => setScreen('game'), 800)
  }

  if (screen === 'menu') {
    return <MainMenu onStart={startGame} />
  }

  if (screen === 'loading') {
    return <LoadingScreen />
  }

  return <Game seed={worldSeed} onExit={() => setScreen('menu')} />
}
