interface MainMenuProps {
  onStart: (opts?: { seed?: number; mode?: 'sandbox' | 'adventure' }) => void
}

export default function MainMenu({ onStart }: MainMenuProps) {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>GAMEME</h1>
        <p style={styles.subtitle}>3D Voxel Sandbox</p>

        <button style={styles.btn} onClick={() => onStart({ mode: 'sandbox' })}>
          Play Sandbox
        </button>

        <button style={{ ...styles.btn, ...styles.secondary }} onClick={() => onStart({ mode: 'adventure', seed: 42 })}>
          Adventure Mode
        </button>

        <button style={{ ...styles.btn, background: '#7b1fa2' }} onClick={() => onStart({ mode: 'sandbox' })}>
          Multiplayer (Local)
        </button>

        <p style={styles.hint}>
          Desktop: Click · WASD · Mouse · LMB break · RMB place · 1-9 hotbar · Esc pause<br />
          Mobile: Left stick move · Right drag look
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
    color: '#fff',
  },
  card: {
    textAlign: 'center',
    padding: '2.5rem',
    borderRadius: '16px',
    background: 'rgba(0,0,0,0.45)',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
    minWidth: '320px',
    maxWidth: '420px',
  },
  title: {
    fontSize: '3.2rem',
    fontWeight: 800,
    letterSpacing: '0.12em',
    marginBottom: '0.25rem',
  },
  subtitle: {
    opacity: 0.7,
    marginBottom: '2rem',
    fontSize: '1.1rem',
  },
  btn: {
    display: 'block',
    width: '100%',
    padding: '0.9rem 1.5rem',
    margin: '0.6rem 0',
    fontSize: '1.05rem',
    fontWeight: 600,
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    background: '#4caf50',
    color: '#fff',
    transition: 'transform 0.15s, background 0.15s',
  },
  secondary: {
    background: '#2196f3',
  },
  hint: {
    marginTop: '1.8rem',
    fontSize: '0.78rem',
    opacity: 0.55,
    lineHeight: 1.5,
  },
}
