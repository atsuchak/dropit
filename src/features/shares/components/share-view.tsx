'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Zip, ZipPassThrough } from 'fflate'
import Link from 'next/link'
import Image from 'next/image'
import { Turnstile } from './turnstile'
import { formatSize } from '../format-size'

type SharedFile = { name: string; size: number; type: string; url: string }
type ShareInfo = { hasPin: boolean; expiresAt: string }

async function downloadZip(
  files: SharedFile[],
  refreshUrls: () => Promise<SharedFile[] | null>,
) {
  const chunks: Uint8Array[] = []
  const archiveBlob = new Promise<Blob>((resolve, reject) => {
    const archive = new Zip((error, data, final) => {
      if (error) return reject(error)
      chunks.push(data)
      if (final)
        resolve(new Blob(chunks as BlobPart[], { type: 'application/zip' }))
    })
    ;(async () => {
      try {
        for (const [index, file] of files.entries()) {
          const current = await refreshUrls()
          if (!current?.[index]) throw new Error('The share has expired.')
          const response = await fetch(current[index].url)
          if (!response.ok || !response.body)
            throw new Error(`Could not download ${file.name}.`)
          const entry = new ZipPassThrough(
            `${String(index + 1).padStart(2, '0')}-${file.name}`,
          )
          archive.add(entry)
          const reader = response.body.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            entry.push(value)
          }
          entry.push(new Uint8Array(), true)
        }
        archive.end()
      } catch (error) {
        archive.terminate()
        reject(error)
      }
    })()
  })
  const blob = await archiveBlob
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'dropit-files.zip'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function ShareView({
  slug,
  siteKey,
}: {
  slug: string
  siteKey?: string
}) {
  const [info, setInfo] = useState<ShareInfo | null>(null)
  const [files, setFiles] = useState<SharedFile[]>([])
  const [pin, setPin] = useState('')
  const [token, setToken] = useState('')
  const [challengeReset, setChallengeReset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const attempted = useRef(false)
  const onToken = useCallback((value: string) => setToken(value), [])

  useEffect(() => {
    fetch(`/api/shares/${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        setInfo(data)
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : 'Could not load share.',
        ),
      )
  }, [slug])

  useEffect(() => {
    if (!info) return
    const check = () => {
      if (new Date(info.expiresAt).getTime() <= Date.now()) {
        setExpired(true)
        setFiles([])
      }
    }
    check()
    const interval = setInterval(check, 1000)
    return () => clearInterval(interval)
  }, [info])

  const openShare = useCallback(
    async (enteredPin = pin, challenge = token) => {
      setBusy(true)
      setError('')
      try {
        const response = await fetch(
          `/api/shares/${encodeURIComponent(slug)}/access`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pin: enteredPin,
              turnstileToken: challenge,
            }),
          },
        )
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        setFiles(data.files)
        return data.files as SharedFile[]
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not open share.',
        )
        setToken('')
        setChallengeReset((value) => value + 1)
        return null
      } finally {
        setBusy(false)
      }
    },
    [pin, slug, token],
  )

  useEffect(() => {
    if (info && !info.hasPin && token && !attempted.current && !expired) {
      attempted.current = true
      void openShare('', token)
    }
  }, [info, token, expired, openShare])

  async function getOne(index: number) {
    const current = await openShare()
    if (!current) return
    setBusy(true)
    try {
      const response = await fetch(current[index].url)
      if (!response.ok) throw new Error('Could not download file.')
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = current[index].name
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not download file.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function getAll() {
    const current = await openShare()
    if (!current) return
    setBusy(true)
    try {
      await downloadZip(current, () => openShare())
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not prepare ZIP file.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="recipient-shell">
      <header className="recipient-header">
        <Link className="brand" href="/">
          DROPIT<span>●</span>
        </Link>
      </header>
      <section className="panel recipient-panel">
        <span className="eyebrow">PRIVATE SHARE</span>
        <h1>
          {expired
            ? 'This share expired.'
            : error && !info
              ? 'Share unavailable.'
              : files.length
                ? 'Your files are ready.'
                : 'Opening your files.'}
        </h1>
        {info && !expired && (
          <p className="subtle">
            Available until {new Date(info.expiresAt).toLocaleString()}.
          </p>
        )}
        {!info && !error && <p className="subtle">Checking share…</p>}
        {info && !expired && !files.length && (
          <div className="access-form">
            {info.hasPin && (
              <label>
                Enter PIN
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  placeholder="PIN"
                />
              </label>
            )}
            <Turnstile
              key={challengeReset}
              siteKey={siteKey}
              onToken={onToken}
            />
            {info.hasPin && (
              <button
                className="primary-button"
                disabled={busy || !token || !pin}
                onClick={() => void openShare()}
              >
                {busy ? 'Opening…' : 'Open share'}
              </button>
            )}
            {!info.hasPin && <p className="hint">Checking access…</p>}
            {!info.hasPin && error && (
              <button
                className="text-button"
                disabled={busy || !token}
                onClick={() => void openShare()}
              >
                Retry opening
              </button>
            )}
          </div>
        )}
        {files.length > 0 && !expired && (
          <div className="download-list">
            {files.map((file, index) => (
              <div className="download-row" key={`${file.name}-${index}`}>
                <div className="recipient-preview">
                  {file.type.startsWith('image/') ? (
                    <Image
                      src={file.url}
                      unoptimized
                      alt={`${file.name} preview`}
                      width={76}
                      height={76}
                    />
                  ) : (
                    <span>
                      {file.name.split('.').pop()?.slice(0, 4).toUpperCase() ||
                        'FILE'}
                    </span>
                  )}
                </div>
                <div className="download-meta">
                  <strong>{file.name}</strong>
                  <span>{formatSize(file.size)}</span>
                </div>
                <button
                  aria-label={`Download ${file.name}`}
                  disabled={busy}
                  onClick={() => void getOne(index)}
                >
                  Download
                </button>
              </div>
            ))}
            {files.length > 1 && (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void getAll()}
              >
                {busy ? 'Preparing…' : 'Download all as ZIP'}
              </button>
            )}
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {expired && (
          <p className="subtle">
            The link and QR code can no longer open these files.
          </p>
        )}
      </section>
    </main>
  )
}
