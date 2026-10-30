export default function LoadingScreen() {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0a',
      color: '#fff',
      gap: '1.5rem',
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '4px solid rgba(255,255,255,0.15)',
        borderTopColor: '#4caf50',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ fontSize: '1.1rem', opacity: 0.8 }}>Generating world...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
