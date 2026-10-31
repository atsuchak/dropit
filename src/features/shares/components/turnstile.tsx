'use client'

import { useEffect, useRef } from 'react'

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string
      appearance: 'interaction-only'
      theme: 'dark'
      callback: (token: string) => void
      'expired-callback': () => void
    },
  ) => string
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | undefined

function loadScript() {
  if (window.turnstile) return Promise.resolve()
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = undefined
      script.remove()
      reject(new Error('Could not load the security check.'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey?: string
  onToken: (token: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!siteKey) {
      if (process.env.NODE_ENV !== 'production') onToken('development')
      return
    }
    let widget: string | undefined
    let cancelled = false
    const render = () => {
      if (cancelled || widget || !container.current || !window.turnstile) return
      widget = window.turnstile.render(container.current, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        theme: 'dark',
        callback: onToken,
        'expired-callback': () => onToken(''),
      })
    }
    void loadScript()
      .then(render)
      .catch(() => onToken(''))
    return () => {
      cancelled = true
      if (widget) window.turnstile?.remove(widget)
    }
  }, [siteKey, onToken])

  if (!siteKey && process.env.NODE_ENV === 'production')
    return <p className="error">Security check is not configured.</p>
  return <div ref={container} className="turnstile" />
}
