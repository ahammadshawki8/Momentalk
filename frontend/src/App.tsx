import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Health, type Job, type Prefs, type Scene } from './api'
import { SettingsSheet } from './components/SettingsSheet'
import { TabBar } from './components/TabBar'
import { loadLocalPrefs, saveLocalPrefs, type LocalPrefs } from './localPrefs'
import { Building } from './pages/Building'
import { Moment } from './pages/Moment'
import { Onboarding } from './pages/Onboarding'
import { Poster } from './pages/Poster'
import { HomePage, MomentsPage, TodayPage, WordsPage } from './pages/Tabs'
import { UserMode } from './pages/UserMode'
import { useRouter } from './router'

export default function App() {
  const { route, navigate, back } = useRouter()
  const [scenes, setScenes] = useState<Scene[] | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null)
  const [pendingIsVideo, setPendingIsVideo] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [revealId, setRevealId] = useState<string | null>(null)
  const [local, setLocal] = useState<LocalPrefs>(loadLocalPrefs)
  const fileInput = useRef<HTMLInputElement>(null)

  const PERSON_NAME = local.personName
  const LANGUAGE = local.language

  const applyLocal = useCallback((next: LocalPrefs, shareWithServer: boolean) => {
    setLocal(next)
    saveLocalPrefs(next)
    if (shareWithServer) {
      void api.updatePrefs({ person_name: next.personName, language: next.language }).then(setPrefs).catch(() => undefined)
    }
  }, [])

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
        setRevealId(next.scene_id)
        navigate({ name: 'moment', id: next.scene_id }, { replace: true })
      }
    }, 600)
    return () => window.clearInterval(timer)
  }, [job, refresh, navigate])

  async function handlePhoto(file: File) {
    const isVideo = file.type.startsWith('video/')
    setPendingPhoto(URL.createObjectURL(file))
    setPendingIsVideo(isVideo)
    setJob(null)
    navigate({ name: 'building' })
    try {
      const opts = { language: LANGUAGE, personName: PERSON_NAME }
      setJob(await (isVideo ? api.createVideoScene(file, opts) : api.createPhotoScene(file, opts)))
    } catch (e) {
      const text = e instanceof Error ? e.message : ''
      const message = text.includes('key')
        ? 'Momentalk is not connected to the Meta API yet, so this photo cannot be turned into a moment.'
        : text.includes('per hour')
          ? text
          : 'This photo could not be turned into a moment. Try another one.'
      setJob({ id: 'local', status: 'error', stages: [], scene_id: null, error: message })
    }
  }

  if (loadError) {
    return <div className="flex h-full items-center justify-center p-8 text-center text-muted">Cannot reach the Momentalk server. Start the backend and reload.</div>
  }
  if (!scenes) return <div className="h-full" />

  const posterFormat = new URLSearchParams(window.location.search).get('poster')
  if (posterFormat === '4x3' || posterFormat === '16x9') return <Poster scenes={scenes} format={posterFormat} />

  const openScene = (s: Scene) => navigate({ name: 'moment', id: s.id })
  const play = (id?: string) => navigate({ name: 'play', id })
  const shareWithServer = !!health && !health.public

  /* The file input stays mounted on every page so "Snap" works inside the same tap gesture. */
  const picker = (
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

  if (!local.onboarded) {
    const sample = [...scenes].filter((s) => s.status === 'approved' && s.kind === 'photo')
      .sort((a, b) => b.hotspots.length - a.hotspots.length)[0]
    return (
      <>
        {picker}
        <Onboarding
          initial={local}
          sample={sample}
          onDone={(next, choice) => {
            applyLocal(next, shareWithServer)
            navigate({ name: 'tab', tab: 'home' }, { replace: true })
            if (choice === 'snap') fileInput.current?.click()
          }}
        />
      </>
    )
  }

  let page
  if (route.name === 'play') {
    page = <UserMode scenes={scenes} initialSceneId={route.id} personName={PERSON_NAME} onExit={() => back()} />
  } else if (route.name === 'building' && pendingPhoto) {
    page = <Building photoUrl={pendingPhoto} isVideo={pendingIsVideo} job={job} personName={PERSON_NAME} onCancel={() => back()} />
  } else if (route.name === 'moment' && scenes.some((s) => s.id === route.id)) {
    const scene = scenes.find((s) => s.id === route.id)!
    page = (
      <Moment
        scene={scene}
        personName={PERSON_NAME}
        reveal={revealId === scene.id}
        onBack={() => {
          setRevealId(null)
          back({ name: 'tab', tab: 'moments' })
        }}
        onPlay={(s) => play(s.id)}
        onChanged={refresh}
        language={LANGUAGE}
        onBuildStarted={(started, photoUrl) => {
          setPendingPhoto(photoUrl)
          setPendingIsVideo(false)
          setJob(started)
          navigate({ name: 'building' })
        }}
      />
    )
  }
  if (page) return <>{picker}{page}</>

  /* Tab pages. */
  const tab = route.name === 'tab' ? route.tab : 'home'
  const drafts = scenes.filter((s) => s.status === 'draft').length
  const common = { scenes, personName: PERSON_NAME, onOpen: openScene }
  const goTab = (t: typeof tab) => t !== tab && navigate({ name: 'tab', tab: t }, { replace: true })

  return (
    <>
      {picker}
      {tab === 'home' && (
        <HomePage {...common} health={health} onPlay={() => play()} onSettings={() => setSettingsOpen(true)} onSeeAll={() => goTab('moments')} />
      )}
      {tab === 'moments' && <MomentsPage {...common} />}
      {tab === 'words' && <WordsPage {...common} />}
      {tab === 'today' && <TodayPage {...common} health={health} onScenesChanged={refresh} />}

      <TabBar current={tab} todayBadge={drafts} onTab={goTab} onSnap={() => fileInput.current?.click()} />

      {settingsOpen && (
        <SettingsSheet
          local={local}
          prefs={prefs}
          health={health}
          onClose={() => setSettingsOpen(false)}
          onSaved={(nextLocal, nextPrefs) => {
            applyLocal(nextLocal, false)
            if (nextPrefs) setPrefs(nextPrefs)
            void api.health().then(setHealth)
          }}
          onRestartOnboarding={() => {
            setSettingsOpen(false)
            applyLocal({ ...local, onboarded: false }, false)
          }}
        />
      )}
    </>
  )
}
