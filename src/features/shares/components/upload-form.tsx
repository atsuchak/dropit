'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import Image from 'next/image'
import { formatSize } from '../format-size'
import { isValidCustomSlug, isValidSlug } from '../slug'
import { Turnstile } from './turnstile'

const MAX_BYTES = 100 * 1024 * 1024
const MAX_FILES = 20
const DURATION_PRESETS = ['1m', '5m', '30m', '1h', '6h', '12h'] as const
const SAVED_SHARE_KEY = 'dropit-current-share'

type SavedFile = {
  key: string
  name: string
  size: number
  type: string
  previewUrl?: string
}
type SelectedFile = File | SavedFile
type Owner = { slug: string; token: string }
type SavedShare = Owner & {
  expiresAt: string
  durationInput: string
  accessLimit: number
  pin: string
}

function parseDuration(value: string) {
  const match = /^(\d+)\s*([smh])$/i.exec(value.trim())
  if (!match) return null
  const unit = match[2].toLowerCase() as 's' | 'm' | 'h'
  const minutes = Number(match[1]) * { s: 1 / 60, m: 1, h: 60 }[unit]
  return minutes >= 1 && minutes <= 720 ? minutes : null
}

function SelectedFilePreview({ file }: { file: SelectedFile }) {
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (!file.type.startsWith('image/')) return
    const url =
      file instanceof File ? URL.createObjectURL(file) : file.previewUrl
    if (image.current && url) image.current.src = url
    return () => {
      if (file instanceof File && url) URL.revokeObjectURL(url)
    }
  }, [file])

  return (
    <div className="file-preview">
      <span>
        {file.name.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE'}
      </span>
      {file.type.startsWith('image/') && (
        // Local blob previews stay in the browser.
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={image} alt={`${file.name} preview`} />
      )}
    </div>
  )
}

type Entry = {
  isFile: boolean
  isDirectory: boolean
  name: string
  file?: (callback: (file: File) => void, error: (error: Error) => void) => void
  createReader?: () => {
    readEntries: (
      callback: (entries: Entry[]) => void,
      error: (error: Error) => void,
    ) => void
  }
}

async function filesFromEntry(entry: Entry): Promise<File[]> {
  if (entry.isFile && entry.file)
    return [
      await new Promise<File>((resolve, reject) =>
        entry.file!(resolve, reject),
      ),
    ]
  if (!entry.isDirectory || !entry.createReader) return []
  const reader = entry.createReader()
  const files: File[] = []
  while (true) {
    const entries = await new Promise<Entry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    )
    if (!entries.length) break
    for (const child of entries) files.push(...(await filesFromEntry(child)))
  }
  return files
}

export function UploadForm({ siteKey }: { siteKey?: string }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<SelectedFile[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<
    { file: SelectedFile; key: string }[]
  >([])
  const [durationInput, setDurationInput] = useState('5m')
  const [accessLimit, setAccessLimit] = useState(1)
  const [customSlug, setCustomSlug] = useState('')
  const [pin, setPin] = useState('')
  const [token, setToken] = useState('')
  const [challengeReset, setChallengeReset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [link, setLink] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [owner, setOwner] = useState<Owner | null>(null)
  const [editing, setEditing] = useState(false)
  const [expired, setExpired] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [notice, setNotice] = useState('')
  const [savedSettings, setSavedSettings] = useState({
    durationInput: '5m',
    accessLimit: 1,
    pin: '',
  })
  const resultRef = useRef<HTMLDivElement>(null)

  const onToken = useCallback((value: string) => setToken(value), [])
  const durationMinutes = parseDuration(durationInput)

  useEffect(() => {
    const restore = async () => {
      await Promise.resolve()
      const raw = sessionStorage.getItem(SAVED_SHARE_KEY)
      if (!raw) {
        setRestoring(false)
        return
      }
      let saved: SavedShare
      try {
        saved = JSON.parse(raw) as SavedShare
      } catch {
        sessionStorage.removeItem(SAVED_SHARE_KEY)
        setRestoring(false)
        return
      }
      if (
        !isValidSlug(saved.slug) ||
        !/^[A-Za-z0-9_-]{32}$/.test(saved.token)
      ) {
        sessionStorage.removeItem(SAVED_SHARE_KEY)
        setRestoring(false)
        return
      }
      if (new Date(saved.expiresAt).getTime() <= Date.now()) {
        sessionStorage.removeItem(SAVED_SHARE_KEY)
        setRestoring(false)
        return
      }
      const shareLink = `${window.location.origin}/${saved.slug}`
      setOwner({ slug: saved.slug, token: saved.token })
      setLink(shareLink)
      setExpiresAt(saved.expiresAt)
      setDurationInput(saved.durationInput)
      setAccessLimit(saved.accessLimit)
      setPin(saved.pin)
      setSavedSettings({
        durationInput: saved.durationInput,
        accessLimit: saved.accessLimit,
        pin: saved.pin,
      })
      try {
        const response = await fetch(`/api/shares/${saved.slug}/manage`, {
          headers: { Authorization: `Bearer ${saved.token}` },
          cache: 'no-store',
        })
        if (response.status === 410 || response.status === 404) {
          resetHome()
          return
        }
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        const restored = (data.files as SavedFile[]).map((file) => ({
          file,
          key: file.key,
        }))
        setUploadedFiles(restored)
        setFiles(restored.map(({ file }) => file))
        setExpiresAt(data.expiresAt)
        setExpired(false)
        setAccessLimit(data.accessLimit)
        setSavedSettings((current) => ({
          ...current,
          accessLimit: data.accessLimit,
        }))
        setQr(
          await QRCode.toDataURL(shareLink, {
            margin: 2,
            width: 220,
            color: { dark: '#111915', light: '#ffffff' },
          }),
        )
      } catch {
        setError('Could not restore this share. Try reloading.')
      } finally {
        setRestoring(false)
      }
    }
    void restore()
  }, [])

  useEffect(() => {
    if (!owner || expired || !expiresAt) return
    const markExpired = () => {
      setExpired(true)
      setQr('')
    }
    const checkStatus = async (expireOnFailure = false) => {
      try {
        const response = await fetch(`/api/shares/${owner.slug}/status`, {
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('Status unavailable.')
        const data = await response.json()
        if (!data.active || new Date(data.expiresAt).getTime() <= Date.now()) {
          markExpired()
        } else if (data.expiresAt !== expiresAt) {
          setExpiresAt(data.expiresAt)
        }
      } catch {
        if (expireOnFailure) markExpired()
      }
    }
    const timer = window.setTimeout(
      () => void checkStatus(true),
      Math.max(0, new Date(expiresAt).getTime() - Date.now()),
    )
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkStatus()
    }
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(() => void checkStatus(), 20_000)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [owner, expiresAt, expired])

  useEffect(() => {
    if (link)
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [link])

  function addFiles(incoming: File[]) {
    if (busy) return
    const next = [...files, ...incoming]
    if (next.length > MAX_FILES)
      return setError(`Choose up to ${MAX_FILES} files.`)
    if (next.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES)
      return setError('The total share size cannot exceed 100 MB.')
    if (!incoming.length)
      return setError('No files found. Try a ZIP archive instead.')
    setError('')
    setFiles(next)
  }

  async function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const items = [...event.dataTransfer.items]
    const entries: Entry[] = items.flatMap((item) => {
      const entry = item.webkitGetAsEntry?.()
      return entry ? [entry as unknown as Entry] : []
    })
    if (!entries.length) return addFiles([...event.dataTransfer.files])
    try {
      const found = (await Promise.all(entries.map(filesFromEntry))).flat()
      addFiles(found)
    } catch {
      setError(
        'This browser could not read the folder. Please upload it as a ZIP file.',
      )
    }
  }

  async function createShare() {
    if (!files.length || busy || durationMinutes === null) return
    const newFiles = files.filter((file): file is File => file instanceof File)
    if (newFiles.length !== files.length) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/shares/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: newFiles.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.type,
          })),
          durationMinutes,
          accessLimit,
          customSlug: customSlug.trim() || undefined,
          pin: pin || undefined,
          turnstileToken: token,
        }),
      })
      const prepared = await response.json()
      if (!response.ok) throw new Error(prepared.error)
      const shareLink = `${window.location.origin}/${prepared.slug}`
      const qrPromise = QRCode.toDataURL(shareLink, {
        margin: 2,
        width: 220,
        color: { dark: '#111915', light: '#ffffff' },
      }).catch(() => '')
      await Promise.all(
        newFiles.map(async (file, index) => {
          const upload = prepared.uploads[index]
          const result = await fetch(upload.url, {
            method: 'PUT',
            headers: { 'Content-Type': upload.type },
            body: file,
          })
          if (!result.ok) throw new Error(`Could not add ${file.name}.`)
        }),
      )
      const finishedResponse = await fetch('/api/shares/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: prepared.uploadId,
          uploadToken: prepared.uploadToken,
        }),
      })
      const finished = await finishedResponse.json()
      if (!finishedResponse.ok) throw new Error(finished.error)
      setCopied(false)
      setSavedSettings({ durationInput, accessLimit, pin })
      setUploadedFiles(
        newFiles.map((file, index) => ({
          file,
          key: prepared.uploads[index].key,
        })),
      )
      setOwner({ slug: finished.slug, token: prepared.uploadToken })
      setExpiresAt(finished.expiresAt)
      setLink(shareLink)
      sessionStorage.setItem(
        SAVED_SHARE_KEY,
        JSON.stringify({
          slug: finished.slug,
          token: prepared.uploadToken,
          expiresAt: finished.expiresAt,
          durationInput,
          accessLimit,
          pin,
        } satisfies SavedShare),
      )
      const readyQr = await qrPromise
      setQr(readyQr)
      if (!readyQr)
        setError('Link is ready, but the QR code could not be created.')
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not create share.',
      )
      setToken('')
      setChallengeReset((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  async function saveChanges() {
    if (!owner || busy || durationMinutes === null || !files.length) return
    setBusy(true)
    setError('')
    try {
      const kept = uploadedFiles.filter(({ file }) => files.includes(file))
      const added = files.filter(
        (file): file is File =>
          file instanceof File &&
          !uploadedFiles.some((uploaded) => uploaded.file === file),
      )
      let uploads: { key: string; url: string; type: string }[] = []
      if (added.length) {
        const preparedResponse = await fetch(
          `/api/shares/${owner.slug}/manage`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${owner.token}`,
            },
            body: JSON.stringify({
              keepKeys: kept.map(({ key }) => key),
              files: added.map((file) => ({
                name: file.name,
                size: file.size,
                type: file.type,
              })),
            }),
          },
        )
        const prepared = await preparedResponse.json()
        if (!preparedResponse.ok) throw new Error(prepared.error)
        uploads = prepared.uploads
        await Promise.all(
          added.map(async (file, index) => {
            const result = await fetch(uploads[index].url, {
              method: 'PUT',
              headers: { 'Content-Type': uploads[index].type },
              body: file,
            })
            if (!result.ok) throw new Error(`Could not add ${file.name}.`)
          }),
        )
      }
      const response = await fetch(`/api/shares/${owner.slug}/manage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${owner.token}`,
        },
        body: JSON.stringify({
          durationMinutes,
          accessLimit,
          pin,
          keepKeys: kept.map(({ key }) => key),
          newKeys: uploads.map(({ key }) => key),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setUploadedFiles([
        ...kept,
        ...added.map((file, index) => ({ file, key: uploads[index].key })),
      ])
      setSavedSettings({ durationInput, accessLimit, pin })
      setExpiresAt(data.expiresAt)
      sessionStorage.setItem(
        SAVED_SHARE_KEY,
        JSON.stringify({
          ...owner,
          expiresAt: data.expiresAt,
          durationInput,
          accessLimit,
          pin,
        } satisfies SavedShare),
      )
      setNotice(
        data.pendingCleanup
          ? 'Saved. File cleanup is pending.'
          : 'Saved. Link unchanged.',
      )
      setEditing(false)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not update share.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function deleteShare() {
    if (
      !owner ||
      busy ||
      !window.confirm('Delete this link and its files now?')
    )
      return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/shares/${owner.slug}/manage`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${owner.token}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      resetHome()
      setToken('')
      setChallengeReset((value) => value + 1)
      setNotice(
        data.pendingCleanup
          ? 'Link disabled. File cleanup is pending.'
          : 'Link deleted.',
      )
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not delete share.',
      )
    } finally {
      setBusy(false)
    }
  }

  function resetHome() {
    sessionStorage.removeItem(SAVED_SHARE_KEY)
    setFiles([])
    setCustomSlug('')
    setUploadedFiles([])
    setLink('')
    setExpiresAt('')
    setQr('')
    setOwner(null)
    setEditing(false)
    setExpired(false)
    setError('')
    setNotice('')
    setToken('')
    setChallengeReset((value) => value + 1)
  }

  if (restoring)
    return (
      <div className="panel options-panel" role="status">
        Opening your share…
      </div>
    )

  return (
    <div className="upload-layout">
      <section className="panel upload-panel">
        <span className="eyebrow">PRIVATE FILE SHARING</span>
        <h1>
          {expired ? (
            'Link expired.'
          ) : editing ? (
            'Update your files.'
          ) : link ? (
            'Files ready.'
          ) : (
            <>
              <span className="desktop-only">Drop files. Get a link.</span>
              <span className="mobile-only">Choose files. Get a link.</span>
            </>
          )}
        </h1>
        {(!link || editing) && (
          <>
            <div
              className="drop-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              onClick={() => fileInput.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  fileInput.current?.click()
                }
              }}
            >
              <span className="drop-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 13v8" />
                  <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                  <path d="m8 17 4-4 4 4" />
                </svg>
              </span>
              <strong>
                <span className="desktop-only">Drop files here</span>
                <span className="mobile-only">Choose files</span>
              </strong>
              <span className="desktop-only">or click to browse</span>
            </div>
            <input
              ref={fileInput}
              hidden
              multiple
              type="file"
              onChange={(event) => {
                addFiles([...(event.target.files ?? [])])
                event.target.value = ''
              }}
            />
            <input
              ref={(element) => {
                folderInput.current = element
                element?.setAttribute('webkitdirectory', '')
              }}
              hidden
              multiple
              type="file"
              onChange={(event) => {
                addFiles([...(event.target.files ?? [])])
                event.target.value = ''
              }}
            />
            <button
              className="text-button"
              type="button"
              onClick={() => folderInput.current?.click()}
            >
              Choose a folder
            </button>
            <p className="hint">Up to 20 files · 100 MB total</p>
          </>
        )}
        {files.length > 0 && !expired && (
          <div className="selected-files">
            <div className="list-heading">
              <strong>{link ? 'Shared files' : 'Your files'}</strong>
              <span>
                {files.length} {files.length === 1 ? 'file' : 'files'} ·{' '}
                {formatSize(files.reduce((sum, file) => sum + file.size, 0))}
              </span>
            </div>
            <div className="file-grid">
              {files.map((file, index) => (
                <div className="file-row" key={`${file.name}-${index}`}>
                  <SelectedFilePreview file={file} />
                  <div className="file-details">
                    <strong title={file.name}>{file.name}</strong>
                    <span>{formatSize(file.size)}</span>
                  </div>
                  {(!link || editing) && (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        setFiles((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <aside className="panel options-panel">
        {link && expired ? (
          <div className="result" ref={resultRef}>
            <span className="eyebrow">SHARE ENDED</span>
            <h2>Link expired.</h2>
            <p className="subtle">
              This link and QR code are no longer available.
            </p>
            <button
              className="primary-button expired-share-button"
              type="button"
              onClick={resetHome}
            >
              Share more
            </button>
          </div>
        ) : link && !editing ? (
          <div className="result" ref={resultRef}>
            <span className="eyebrow">READY TO SHARE</span>
            <h2>Your link is ready.</h2>
            <a className="result-link" href={link} title={link}>
              {link.replace(/^https?:\/\//, '')}
            </a>
            {expiresAt && (
              <p className="result-expiry">
                Expires {new Date(expiresAt).toLocaleString()}
              </p>
            )}
            <div className="share-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(link)
                    .then(() => setCopied(true))
                    .catch(() => setError('Could not copy the link.'))
                }
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button
                className="share-more-button"
                type="button"
                disabled={busy}
                onClick={resetHome}
              >
                Share more
              </button>
            </div>
            {qr && (
              <div className="qr-block">
                <div className="qr-image">
                  <Image
                    src={qr}
                    unoptimized
                    alt="QR code for the share link"
                    width={220}
                    height={220}
                  />
                </div>
                <a
                  className="qr-download-button"
                  href={qr}
                  download="dropit-qr.png"
                >
                  Download QR
                </a>
              </div>
            )}
            {notice && (
              <p className="success" role="status">
                {notice}
              </p>
            )}
            <div className="manage-actions">
              <button
                className="result-action"
                type="button"
                disabled={busy}
                aria-label="Edit share"
                onClick={() => {
                  setError('')
                  setNotice('')
                  setEditing(true)
                }}
              >
                Edit share
              </button>
              <button
                className="result-action danger"
                type="button"
                aria-label="Delete share"
                disabled={busy}
                onClick={() => void deleteShare()}
              >
                Delete share
              </button>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        ) : (
          <>
            <span className="eyebrow">
              {editing ? 'EDIT SETTINGS' : 'SHARE SETTINGS'}
            </span>
            <h2>{editing ? 'Update this link.' : 'Set your rules.'}</h2>
            {notice && (
              <p className="success" role="status">
                {notice}
              </p>
            )}
            <label>
              Expires after
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={durationInput}
                onChange={(event) => setDurationInput(event.target.value)}
                placeholder="5m"
                aria-describedby="duration-hint"
              />
              <span className="hint" id="duration-hint">
                Type 90s, 5m or 2h. Min 1m, max 12h.
              </span>
            </label>
            <div className="preset-list" aria-label="Common expiry times">
              {DURATION_PRESETS.map((preset) => (
                <button
                  className={durationInput === preset ? 'active' : ''}
                  type="button"
                  key={preset}
                  onClick={() => setDurationInput(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            {durationInput && durationMinutes === null && (
              <p className="error">Use a time between 1m and 12h.</p>
            )}
            <div className={`share-settings-row${editing ? ' single' : ''}`}>
              <label>
                Access limit
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={accessLimit}
                  onChange={(event) =>
                    setAccessLimit(Number(event.target.value))
                  }
                />
              </label>
              {!editing && (
                <label>
                  Custom URL <span className="optional">optional</span>
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={customSlug}
                    onChange={(event) =>
                      setCustomSlug(event.target.value.toLowerCase())
                    }
                    placeholder="3–30 letters, numbers or hyphens"
                  />
                </label>
              )}
            </div>
            {customSlug.trim() && !isValidCustomSlug(customSlug.trim()) && (
              <p className="error">
                {customSlug.trim() === 'api'
                  ? 'This URL is reserved.'
                  : 'Use 3–30 letters or digits; hyphens inside.'}
              </p>
            )}
            <label>
              PIN <span className="optional">optional</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                placeholder="4 to 12 digits"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
              />
            </label>
            {!editing && (
              <Turnstile
                key={challengeReset}
                siteKey={siteKey}
                onToken={onToken}
              />
            )}
            <button
              className="primary-button"
              type="button"
              disabled={
                !files.length ||
                busy ||
                (!editing && !token) ||
                durationMinutes === null ||
                (pin.length > 0 && !/^\d{4,12}$/.test(pin)) ||
                (!editing &&
                  !!customSlug.trim() &&
                  !isValidCustomSlug(customSlug.trim())) ||
                accessLimit < 1 ||
                accessLimit > 100
              }
              onClick={() => void (editing ? saveChanges() : createShare())}
            >
              {busy
                ? editing
                  ? 'Saving…'
                  : 'Creating link…'
                : editing
                  ? 'Save changes'
                  : 'Create link'}{' '}
              <span>↗</span>
            </button>
            {editing && (
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setFiles(uploadedFiles.map(({ file }) => file))
                  setDurationInput(savedSettings.durationInput)
                  setAccessLimit(savedSettings.accessLimit)
                  setPin(savedSettings.pin)
                  setEditing(false)
                  setError('')
                }}
              >
                Cancel
              </button>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
