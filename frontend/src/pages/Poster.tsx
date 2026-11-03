import type { CSSProperties } from 'react'
import type { Scene } from '../api'
import { accentStyle, useMomentColor } from '../color'
import { FitBox } from '../components/FitBox'
import { Logo } from '../components/Logo'
import { SceneCanvas } from '../components/SceneCanvas'

const CREDIT = 'Built with Meta SAM 3.1, Muse Spark, Muse Voice Transcribe and Muse Wonder'

/**
 * Marketing poster rendered from real app components and real scene data, so the
 * outlines shown are genuine SAM 3.1 output. Open /?poster=4x3 or /?poster=16x9.
 */
export function Poster({ scenes, format }: { scenes: Scene[]; format: '4x3' | '16x9' }) {
  const hero = scenes.find((s) => s.id === 's_demo_toys') ?? scenes[0]
  const others = scenes.filter((s) => s.id !== hero?.id).slice(0, 3)
  const color = useMomentColor(hero?.media_url)
  const wide = format === '16x9'
  const size = wide ? { width: 1920, height: 1080 } : { width: 1600, height: 1200 }
  if (!hero) return null
  const sticker = hero.hotspots.find((h) => /monkey|stripes/i.test(h.label))?.phrase ?? 'I love Mr. Stripes!'

  const photo = (
    <FitBox aspect={hero.width / hero.height}>
      <div className="relative h-full w-full">
        <img src={hero.media_url} alt="" aria-hidden="true"
             className="absolute inset-0 h-full w-full scale-105 rounded-[36px] object-cover opacity-60 blur-3xl saturate-150" />
        <SceneCanvas scene={hero} mode="speak" showLabels rounded="rounded-[36px]"
                     className="relative h-full w-full shadow-[0_40px_90px_rgba(21,23,26,0.28)]" />
        <div
          className="absolute -translate-x-1/2 -translate-y-[70%] rotate-[-3deg] whitespace-nowrap rounded-[22px] border-[4px] border-ink bg-white px-7 py-3 font-toy text-[46px] font-extrabold text-ink shadow-[0_7px_0_var(--color-ink)]"
          style={{ left: '76%', top: '4%' }}
        >
          {sticker}
        </div>
      </div>
    </FitBox>
  )

  return (
    <div className="relative overflow-hidden bg-canvas" style={{ ...size, ...accentStyle(color) } as CSSProperties}>
      <div className="absolute rounded-full opacity-55 blur-[140px]"
           style={{ width: 1000, height: 1000, right: -260, top: -320, background: 'var(--accent)' }} aria-hidden="true" />

      {wide ? (
        <div className="relative grid h-full grid-cols-[820px_1fr] gap-16 px-24 py-20">
          <div className="flex flex-col">
            <Logo className="[&_svg]:h-14 [&_svg]:w-14 [&_span]:text-4xl" />
            <h1 className="mt-16 whitespace-nowrap text-[116px] font-bold leading-[0.98] tracking-[-0.03em]">Every moment<br />has a story.</h1>
            <p className="mt-8 max-w-[700px] text-[34px] leading-[1.3] text-muted">
              Momentalk turns everyday photos into a voice for people who cannot rely on speech.
            </p>
            <div className="mt-auto flex gap-5">
              {others.map((s) => (
                <img key={s.id} src={s.media_url} alt="" className="h-32 w-44 rounded-[22px] object-cover shadow-[0_14px_30px_rgba(21,23,26,0.18)]" />
              ))}
            </div>
            <p className="mt-7 text-[21px] text-muted">{CREDIT}</p>
          </div>
          <div className="min-h-0 py-10">{photo}</div>
        </div>
      ) : (
        <div className="relative flex h-full flex-col px-20 pb-14 pt-16">
          <div className="flex items-end justify-between gap-12">
            <div>
              <Logo className="[&_svg]:h-12 [&_svg]:w-12 [&_span]:text-3xl" />
              <h1 className="mt-10 text-[104px] font-bold leading-[0.98] tracking-[-0.03em]">Every moment<br />has a story.</h1>
            </div>
            <p className="mb-3 max-w-[470px] text-[30px] leading-[1.3] text-muted">
              Momentalk turns everyday photos into a voice for people who cannot rely on speech.
            </p>
          </div>
          <div className="mt-16 min-h-0 flex-1">{photo}</div>
          <p className="mt-8 text-[21px] text-muted">{CREDIT}</p>
        </div>
      )}
    </div>
  )
}
