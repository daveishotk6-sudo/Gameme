import { useGameStore } from '../game/store'

interface PauseMenuProps {
  onExit: () => void
}

export default function PauseMenu({ onExit }: PauseMenuProps) {
  const setPaused = useGameStore((s) => s.setPaused)

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      pointerEvents: 'auto',
    }}>
      <div style={{
        background: 'rgba(20,20,25,0.95)',
        padding: '2rem 2.5rem',
        borderRadius: 16,
        textAlign: 'center',
        color: '#fff',
        minWidth: 280,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.6rem' }}>Paused</h2>

        <button style={btnStyle} onClick={() => setPaused(false)}>Resume</button>
        <button style={{ ...btnStyle, background: '#2196f3' }} onClick={() => setPaused(false)}>
          Settings
        </button>
        <button style={{ ...btnStyle, background: '#f44336' }} onClick={onExit}>
          Exit to Menu
        </button>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.75rem',
  margin: '0.5rem 0',
  border: 'none',
  borderRadius: 8,
  background: '#4caf50',
  color: '#fff',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
}
