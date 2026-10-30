interface HUDProps {
  onExit: () => void
}

export default function HUD({ onExit }: HUDProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
      {/* Top bar */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        pointerEvents: 'auto',
      }}>
        <div style={{
          background: 'rgba(0,0,0,0.45)',
          padding: '6px 14px',
          borderRadius: 8,
          color: '#fff',
          fontSize: 13,
        }}>
          Gameme · Sandbox
        </div>
        <button
          onClick={onExit}
          style={{
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Exit
        </button>
      </div>

      {/* Hotbar placeholder */}
      <div style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        background: 'rgba(0,0,0,0.55)',
        padding: 6,
        borderRadius: 10,
      }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 44,
              height: 44,
              border: i === 0 ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.08)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
