export type Point = [number, number]

export interface Hotspot {
  id: string
  label: string
  phrase: string
  synonyms: string[]
  kind: string
  sam_phrase: string
  polygons: Point[][]
  confidence: number | null
  order: number
  audio_url?: string
  /** Video scenes only: outline keyframes over time (seconds), sampled by SAM 3.1 tracking. */
  track?: { t: number; poly: Point[] }[]
}

export interface Scene {
  id: string
  kind: 'photo' | 'video' | 'wish'
  title: string
  media_url: string
  video_url?: string
  duration?: number
  width: number
  height: number
  language: string
  status: 'draft' | 'approved'
  created_by: 'caregiver' | 'agent'
  created_at: number
  build_seconds?: number
  models: string[]
  placeholder?: boolean
  agent_note?: string
  hotspots: Hotspot[]
}

export interface JobStage {
  stage: 'understanding' | 'segmenting' | 'voicing' | 'done'
  t: number
  model?: string
  count?: number
  labels?: string[]
  seconds?: number
}

export interface Job {
  id: string
  status: 'running' | 'done' | 'error'
  stages: JobStage[]
  scene_id: string | null
  error: string | null
}

export interface Health {
  ok: boolean
  api_key: boolean
  cost: { cap_usd: number; total_usd: number }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {
      /* body was not JSON */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  health: () => request<Health>('/api/health'),
  scenes: (status?: string) => request<Scene[]>(`/api/scenes${status ? `?status=${status}` : ''}`),
  scene: (id: string) => request<Scene>(`/api/scenes/${id}`),
  deleteScene: (id: string) => request<{ ok: boolean }>(`/api/scenes/${id}`, { method: 'DELETE' }),
  approve: (id: string) => request<Scene>(`/api/scenes/${id}/approve`, { method: 'POST' }),
  createPhotoScene: (photo: File, opts: { language: string; personName: string; narration?: string }) => {
    const form = new FormData()
    form.append('photo', photo)
    form.append('language', opts.language)
    form.append('person_name', opts.personName)
    if (opts.narration) form.append('narration', opts.narration)
    return request<Job>('/api/scenes/photo', { method: 'POST', body: form })
  },
  createVideoScene: (video: File, opts: { language: string; personName: string }) => {
    const form = new FormData()
    form.append('video', video)
    form.append('language', opts.language)
    form.append('person_name', opts.personName)
    return request<Job>('/api/scenes/video', { method: 'POST', body: form })
  },
  job: (id: string) => request<Job>(`/api/jobs/${id}`),
  updateHotspot: (sceneId: string, hotspotId: string, patch: Partial<Pick<Hotspot, 'label' | 'phrase' | 'synonyms'>>) =>
    request<Hotspot>(`/api/scenes/${sceneId}/hotspots/${hotspotId}`, json('PATCH', patch)),
  deleteHotspot: (sceneId: string, hotspotId: string) =>
    request<{ ok: boolean }>(`/api/scenes/${sceneId}/hotspots/${hotspotId}`, { method: 'DELETE' }),
  addHotspotAt: (sceneId: string, x: number, y: number) =>
    request<Hotspot>(`/api/scenes/${sceneId}/hotspots/at-point`, json('POST', { x, y })),
  recordTap: (sceneId: string, hotspotId: string) =>
    request<{ ok: boolean }>(`/api/scenes/${sceneId}/taps`, json('POST', { hotspot_id: hotspotId })),
}
