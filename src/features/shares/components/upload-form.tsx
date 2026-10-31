'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import Image from 'next/image'
import { formatSize } from '../format-size'
import { Turnstile } from './turnstile'

const MAX_BYTES = 100 * 1024 * 1024
const MAX_FILES = 20
const DURATION_PRESETS = ['1m', '5m', '30m', '1h', '6h', '12h'] as const

function parseDuration(value: string) {
  const match = /^(\d+)\s*([smh])$/i.exec(value.trim())
  if (!match) return null
  const unit = match[2].toLowerCase() as 's' | 'm' | 'h'
  const minutes = Number(match[1]) * { s: 1 / 60, m: 1, h: 60 }[unit]
  return minutes >= 1 && minutes <= 720 ? minutes : null
}

function SelectedFilePreview({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (!file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    if (image.current) image.current.src = url
    return () => URL.revokeObjectURL(url)
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
  const [files, setFiles] = useState<File[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<
    { file: File; key: string }[]
  >([])
  const [durationInput, setDurationInput] = useState('5m')
  const [accessLimit, setAccessLimit] = useState(1)
  const [pin, setPin] = useState('')
  const [token, setToken] = useState('')
  const [challengeReset, setChallengeReset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [link, setLink] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [owner, setOwner] = useState<{ slug: string; token: string } | null>(
    null,
  )
  const [editing, setEditing] = useState(false)
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
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/shares/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.type,
          })),
          durationMinutes,
          accessLimit,
          pin: pin || undefined,
          turnstileToken: token,
        }),
      })
      const prepared = await response.json()
      if (!response.ok) throw new Error(prepared.error)
      await Promise.all(
        files.map(async (file, index) => {
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
      const shareLink = `${window.location.origin}/${finished.slug}`
      setCopied(false)
      setSavedSettings({ durationInput, accessLimit, pin })
      setUploadedFiles(
        files.map((file, index) => ({
          file,
          key: prepared.uploads[index].key,
        })),
      )
      setOwner({ slug: finished.slug, token: prepared.uploadToken })
      setExpiresAt(finished.expiresAt)
      setLink(shareLink)
      try {
        setQr(
          await QRCode.toDataURL(shareLink, {
            margin: 2,
            width: 220,
            color: { dark: '#111915', light: '#ffffff' },
          }),
        )
      } catch {
        setError('Link is ready, but the QR code could not be created.')
      }
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
        (file) => !uploadedFiles.some((uploaded) => uploaded.file === file),
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
      setFiles([])
      setUploadedFiles([])
      setLink('')
      setExpiresAt('')
      setQr('')
      setOwner(null)
      setEditing(false)
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

  return (
    <div className="upload-layout">
      <section className="panel upload-panel">
        <span className="eyebrow">PRIVATE FILE SHARING</span>
        <h1>
          {editing
            ? 'Update your files.'
            : link
              ? 'Files ready.'
              : 'Drop files. Get a link.'}
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
              <span className="drop-icon">↑</span>
              <strong>Drop files here</strong>
              <span>or click to browse</span>
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
        {files.length > 0 && (
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
        {link && !editing ? (
          <div className="result" ref={resultRef}>
            <span className="eyebrow">READY TO SHARE</span>
            <h2>Your link is ready.</h2>
            <a className="result-link" href={link} title={link}>
              {link}
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
                onClick={() => {
                  setFiles([])
                  setUploadedFiles([])
                  setLink('')
                  setExpiresAt('')
                  setQr('')
                  setOwner(null)
                  setError('')
                  setNotice('')
                  setToken('')
                  setChallengeReset((value) => value + 1)
                }}
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
            <label>
              Access limit
              <input
                type="number"
                min="1"
                max="100"
                value={accessLimit}
                onChange={(event) => setAccessLimit(Number(event.target.value))}
              />
            </label>
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
