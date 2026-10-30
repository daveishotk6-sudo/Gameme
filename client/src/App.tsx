import { useState } from 'react'
import Game from './game/Game'
import MainMenu from './ui/MainMenu'
import LoadingScreen from './ui/LoadingScreen'

type Screen = 'menu' | 'loading' | 'game'

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [worldSeed, setWorldSeed] = useState(Math.floor(Math.random() * 1000000))
  const [mode, setMode] = useState<'sandbox' | 'adventure'>('sandbox')

  const startGame = (opts?: { seed?: number; mode?: 'sandbox' | 'adventure' }) => {
    setWorldSeed(opts?.seed ?? Math.floor(Math.random() * 1000000))
    setMode(opts?.mode ?? 'sandbox')
    setScreen('loading')
    setTimeout(() => setScreen('game'), 900)
  }

  if (screen === 'menu') {
    return <MainMenu onStart={startGame} />
  }

  if (screen === 'loading') {
    return <LoadingScreen />
  }

  return <Game seed={worldSeed} mode={mode} onExit={() => setScreen('menu')} />
}
