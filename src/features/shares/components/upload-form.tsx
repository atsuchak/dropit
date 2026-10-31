'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import Image from 'next/image'
import { Turnstile } from './turnstile'

const MAX_BYTES = 100 * 1024 * 1024
const MAX_FILES = 20

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
  const [durationMinutes, setDurationMinutes] = useState(5)
  const [accessLimit, setAccessLimit] = useState(1)
  const [pin, setPin] = useState('')
  const [token, setToken] = useState('')
  const [challengeReset, setChallengeReset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [link, setLink] = useState('')
  const [qr, setQr] = useState('')

  useEffect(() => {
    folderInput.current?.setAttribute('webkitdirectory', '')
  }, [])
  const onToken = useCallback((value: string) => setToken(value), [])

  function addFiles(incoming: File[]) {
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
    if (!files.length || busy) return
    setBusy(true)
    setError('')
    setProgress(0)
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
      for (let index = 0; index < files.length; index++) {
        const upload = prepared.uploads[index]
        const result = await fetch(upload.url, {
          method: 'PUT',
          headers: { 'Content-Type': upload.type },
          body: files[index],
        })
        if (!result.ok)
          throw new Error(`Upload failed for ${files[index].name}.`)
        setProgress(Math.round(((index + 1) / files.length) * 100))
      }
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
      const shareLink = `${window.location.origin}/s/${finished.slug}`
      setLink(shareLink)
      setQr(
        await QRCode.toDataURL(shareLink, {
          margin: 1,
          width: 192,
          color: { dark: '#eeeeee', light: '#202020' },
        }),
      )
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

  return (
    <div className="upload-layout">
      <section className="panel upload-panel">
        <span className="eyebrow">PRIVATE FILE SHARING</span>
        <h1>
          Drop files.
          <br />
          <span>Share simply.</span>
        </h1>
        <p className="subtle">No account. A short link. Your rules.</p>
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
          <span className="drop-icon">↥</span>
          <strong>Drop files or folders here</strong>
          <span>or click to choose files</span>
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
          ref={folderInput}
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
        <p className="hint">
          Any file type. Up to 20 files and 100 MB total. ZIP files are welcome.
        </p>
        {files.length > 0 && (
          <div className="selected-files">
            <div className="list-heading">
              <strong>Selected files</strong>
              <span>
                {files.length} files ·{' '}
                {(
                  files.reduce((sum, file) => sum + file.size, 0) /
                  1024 /
                  1024
                ).toFixed(1)}{' '}
                MB
              </span>
            </div>
            {files.map((file, index) => (
              <div className="file-row" key={`${file.name}-${index}`}>
                <span title={file.name}>{file.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    setFiles((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <aside className="panel options-panel">
        <span className="eyebrow">SHARE SETTINGS</span>
        <h2>Make it yours.</h2>
        <label>
          Expires after
          <select
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
          >
            <option value={0.5}>30 seconds</option>
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
            <option value={1440}>24 hours</option>
          </select>
        </label>
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
        <p className="hint">
          One access opens the whole share. Refreshing in the same browser keeps
          that access until expiry.
        </p>
        <Turnstile key={challengeReset} siteKey={siteKey} onToken={onToken} />
        <button
          className="primary-button"
          type="button"
          disabled={
            !files.length ||
            busy ||
            !token ||
            (pin.length > 0 && !/^\d{4,12}$/.test(pin)) ||
            accessLimit < 1 ||
            accessLimit > 100
          }
          onClick={createShare}
        >
          {busy ? `Uploading ${progress}%` : 'Create share link'} <span>↗</span>
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {link && (
          <div className="result">
            <span className="eyebrow">READY TO SHARE</span>
            <a href={link}>{link}</a>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(link)}
            >
              Copy link
            </button>
            {qr && (
              <a href={qr} download="dropit-qr.png">
                <Image
                  src={qr}
                  unoptimized
                  alt="QR code for the share link"
                  width={192}
                  height={192}
                />
              </a>
            )}
            <p className="hint">
              The QR code opens the same link and stops working when the share
              expires.
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}
