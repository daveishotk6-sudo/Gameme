import { useGameStore } from '../game/store'
import { BLOCKS, BlockType } from '../game/BlockTypes'

interface HUDProps {
  onExit: () => void
}

export default function HUD({ onExit }: HUDProps) {
  const hotbar = useGameStore((s) => s.hotbar)
  const selectedSlot = useGameStore((s) => s.selectedSlot)
  const setSelectedSlot = useGameStore((s) => s.setSelectedSlot)
  const timeOfDay = useGameStore((s) => s.timeOfDay)

  const hour = Math.floor(timeOfDay * 24)
  const timeLabel = `${hour.toString().padStart(2, '0')}:00`

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
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
          background: 'rgba(0,0,0,0.5)',
          padding: '6px 14px',
          borderRadius: 8,
          color: '#fff',
          fontSize: 13,
          display: 'flex',
          gap: 12,
        }}>
          <span>Gameme</span>
          <span style={{ opacity: 0.7 }}>{timeLabel}</span>
        </div>
        <button
          onClick={() => useGameStore.getState().setPaused(true)}
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
          Menu
        </button>
      </div>

      {/* Hotbar */}
      <div style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        background: 'rgba(0,0,0,0.6)',
        padding: 6,
        borderRadius: 10,
        pointerEvents: 'auto',
      }}>
        {hotbar.map((slot, i) => {
          const def = BLOCKS[slot.type]
          const selected = i === selectedSlot
          return (
            <div
              key={i}
              onClick={() => setSelectedSlot(i)}
              style={{
                width: 48,
                height: 48,
                border: selected ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                borderRadius: 6,
                background: slot.count > 0 && slot.type !== BlockType.Air
                  ? def.color
                  : 'rgba(255,255,255,0.06)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'flex-end',
                padding: 3,
                cursor: 'pointer',
                position: 'relative',
                boxShadow: selected ? '0 0 8px rgba(255,255,255,0.4)' : 'none',
              }}
              title={def?.name}
            >
              {slot.count > 0 && slot.type !== BlockType.Air && (
                <span style={{
                  fontSize: 11,
                  color: '#fff',
                  textShadow: '0 1px 2px #000',
                  fontWeight: 600,
                }}>
                  {slot.count}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
