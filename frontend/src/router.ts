import { useCallback, useEffect, useState } from 'react'
import { withTransition } from './transition'

export type Tab = 'home' | 'moments' | 'words' | 'today'

export type Route =
  | { name: 'tab'; tab: Tab }
  | { name: 'moment'; id: string; reveal?: boolean }
  | { name: 'play'; id?: string }
  | { name: 'building' }

const TABS: Tab[] = ['home', 'moments', 'words', 'today']

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'moment' && parts[1]) return { name: 'moment', id: decodeURIComponent(parts[1]) }
  if (parts[0] === 'play') return { name: 'play', id: parts[1] ? decodeURIComponent(parts[1]) : undefined }
  if (parts[0] === 'building') return { name: 'building' }
  const tab = (parts[0] ?? 'home') as Tab
  return { name: 'tab', tab: TABS.includes(tab) ? tab : 'home' }
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'tab':
      return route.tab === 'home' ? '#/' : `#/${route.tab}`
    case 'moment':
      return `#/moment/${encodeURIComponent(route.id)}`
    case 'play':
      return route.id ? `#/play/${encodeURIComponent(route.id)}` : '#/play'
    case 'building':
      return '#/building'
  }
}

/**
 * Hash routes so every page has its own address and the phone's back button and back
 * gesture work. Navigation runs inside a View Transition for the shared photo animation.
 */
export function useRouter() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onPop = () => withTransition(() => setRoute(parseHash(window.location.hash)))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((next: Route, options: { replace?: boolean } = {}) => {
    withTransition(() => {
      const url = routeToHash(next)
      // Mark entries we create so back() knows it can safely step back inside the app.
      if (options.replace) window.history.replaceState({ momentalk: true }, '', url)
      else window.history.pushState({ momentalk: true }, '', url)
      setRoute(next)
      window.scrollTo(0, 0)
    })
  }, [])

  const back = useCallback((fallback: Route = { name: 'tab', tab: 'home' }) => {
    if ((window.history.state as { momentalk?: boolean } | null)?.momentalk) window.history.back()
    else navigate(fallback, { replace: true })
  }, [navigate])

  return { route, navigate, back }
}
