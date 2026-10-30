export default function Crosshair() {
  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      <div style={{
        width: '18px',
        height: '2px',
        background: 'rgba(255,255,255,0.85)',
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }} />
      <div style={{
        width: '2px',
        height: '18px',
        background: 'rgba(255,255,255,0.85)',
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }} />
    </div>
  )
}
