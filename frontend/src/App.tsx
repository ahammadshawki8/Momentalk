import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Health, type Job, type Prefs, type Scene } from './api'
import { Album } from './pages/Album'
import { Building } from './pages/Building'
import { Moment } from './pages/Moment'
import { Poster } from './pages/Poster'
import { UserMode } from './pages/UserMode'
import { withTransition } from './transition'

type View =
  | { name: 'album' }
  | { name: 'moment'; sceneId: string; reveal?: boolean }
  | { name: 'building' }
  | { name: 'user'; sceneId?: string }


export default function App() {
  const [view, setView] = useState<View>({ name: 'album' })
  const [scenes, setScenes] = useState<Scene[] | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null)
  const [pendingIsVideo, setPendingIsVideo] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const PERSON_NAME = prefs?.person_name ?? 'Maya'
  const LANGUAGE = prefs?.language ?? 'en'

  const go = useCallback((next: View) => withTransition(() => setView(next)), [])

  const refresh = useCallback(async () => {
    try {
      setScenes(await api.scenes())
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
    void api.health().then(setHealth).catch(() => undefined)
    void api.prefs().then(setPrefs).catch(() => undefined)
  }, [refresh])

  useEffect(() => {
    if (!job || job.status !== 'running') return
    const timer = window.setInterval(async () => {
      const next = await api.job(job.id)
      setJob(next)
      if (next.status === 'done' && next.scene_id) {
        await refresh()
        go({ name: 'moment', sceneId: next.scene_id, reveal: true })
      }
    }, 600)
    return () => window.clearInterval(timer)
  }, [job, refresh, go])

  async function handlePhoto(file: File) {
    const url = URL.createObjectURL(file)
    const isVideo = file.type.startsWith('video/')
    setPendingPhoto(url)
    setPendingIsVideo(isVideo)
    setJob(null)
    go({ name: 'building' })
    try {
      const opts = { language: LANGUAGE, personName: PERSON_NAME }
      setJob(await (isVideo ? api.createVideoScene(file, opts) : api.createPhotoScene(file, opts)))
    } catch (e) {
      const message = e instanceof Error && e.message.includes('key')
        ? 'Momentalk is not connected to the Meta API yet, so this photo cannot be turned into a moment.'
        : 'This photo could not be turned into a moment. Try another one.'
      setJob({ id: 'local', status: 'error', stages: [], scene_id: null, error: message })
    }
  }

  const fileField = (
    <input
      ref={fileInput}
      type="file"
      accept="image/*,video/mp4,video/quicktime"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) void handlePhoto(file)
        e.target.value = ''
      }}
    />
  )

  if (loadError) {
    return <div className="flex h-full items-center justify-center p-8 text-center text-muted">Cannot reach the Momentalk server. Start the backend and reload.</div>
  }
  if (!scenes) return <div className="h-full" />

  const posterFormat = new URLSearchParams(window.location.search).get('poster')
  if (posterFormat === '4x3' || posterFormat === '16x9') {
    return <Poster scenes={scenes} format={posterFormat} />
  }

  if (view.name === 'user') {
    return <UserMode scenes={scenes} initialSceneId={view.sceneId} personName={PERSON_NAME} onExit={() => go({ name: 'album' })} />
  }

  if (view.name === 'building' && pendingPhoto) {
    return <Building photoUrl={pendingPhoto} isVideo={pendingIsVideo} job={job} onCancel={() => go({ name: 'album' })} />
  }

  if (view.name === 'moment') {
    const scene = scenes.find((s) => s.id === view.sceneId)
    if (scene) {
      return (
        <Moment
          scene={scene}
          personName={PERSON_NAME}
          reveal={!!view.reveal}
          onBack={() => go({ name: 'album' })}
          onPlay={(s) => go({ name: 'user', sceneId: s.id })}
          onChanged={refresh}
        />
      )
    }
  }

  return (
    <>
      {fileField}
      <Album
        scenes={scenes}
        health={health}
        personName={PERSON_NAME}
        onOpen={(s) => go({ name: 'moment', sceneId: s.id })}
        onSnap={() => fileInput.current?.click()}
        onPlay={() => go({ name: 'user' })}
        onScenesChanged={refresh}
        prefs={prefs}
        onPrefs={(p) => {
          setPrefs(p)
          void api.health().then(setHealth)
        }}
      />
    </>
  )
}
