import { useEffect, useState } from 'react'

export default function MobileControls() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 800)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (!isMobile) return null

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 8 }}>
      {/* Joystick zone hint */}
      <div style={{
        position: 'absolute',
        bottom: 100,
        left: 30,
        width: 120,
        height: 120,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.25)',
        background: 'rgba(255,255,255,0.06)',
      }} />
      {/* Look zone hint */}
      <div style={{
        position: 'absolute',
        bottom: 100,
        right: 30,
        width: 120,
        height: 120,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.15)',
        background: 'rgba(255,255,255,0.04)',
      }} />
      <div style={{
        position: 'absolute',
        bottom: 40,
        left: '50%',
        transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        textAlign: 'center',
      }}>
        Left: Move · Right: Look · Tap center to place/break
      </div>
    </div>
  )
}
