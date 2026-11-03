import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Fills its parent and renders children at the largest size that keeps the given aspect ratio. */
export function FitBox({ aspect, children }: { aspect: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  useLayoutEffect(() => {
    const el = outer.current
    if (!el) return
    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      const w = Math.min(width, height * aspect)
      setSize({ w, h: w / aspect })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [aspect])

  return (
    <div ref={outer} className="flex h-full w-full items-center justify-center">
      {size && <div style={{ width: size.w, height: size.h }}>{children}</div>}
    </div>
  )
}
