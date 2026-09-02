import { useCallback, useEffect, useRef, useState } from 'react'

const API_URL =
    import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes
  let unit = 'B'
  for (const next of units) {
    if (value < 1024) break
    value /= 1024
    unit = next
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${unit}`
}

async function compressImage(file, maxSize = 2000, quality = 0.9) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load image'))
    }

    img.src = url
  })

  const { naturalWidth: width, naturalHeight: height } = image

  // Small files in backend-supported formats pass through untouched;
  // everything else (e.g. GIF) gets re-encoded to WebP below
  const passthroughTypes = ['image/jpeg', 'image/png', 'image/webp']

  if (
    width <= maxSize &&
    height <= maxSize &&
    passthroughTypes.includes(file.type)
  ) {
    return file
  }

  const scale = Math.min(maxSize / width, maxSize / height)

  const newWidth = Math.round(width * scale)
  const newHeight = Math.round(height * scale)

  const canvas = document.createElement('canvas')

  canvas.width = newWidth
  canvas.height = newHeight

  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Could not create canvas context')
  }

  ctx.drawImage(image, 0, 0, newWidth, newHeight)

  const blob = await new Promise((resolve) => {
    canvas.toBlob(
        resolve,
        'image/webp',
        quality
    )
  })

  if (!blob) {
    throw new Error('Image compression failed')
  }

  return new File(
      [blob],
      `${file.name.replace(/\.[^/.]+$/, '')}.webp`,
      {
        type: 'image/webp',
        lastModified: Date.now(),
      }
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable (e.g. insecure context) — ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`shrink-0 border px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
        copied
          ? 'border-signal-green text-signal-green'
          : 'border-hairline text-mist hover:border-mist hover:text-chalk'
      }`}
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  )
}

export default function App() {
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [dimensions, setDimensions] = useState(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('idle') // idle | uploading | uploaded
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [resultFa, setResultFa] = useState(null)
  const [lang, setLang] = useState('en') // en | fa
  const [translating, setTranslating] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)
  const previewRef = useRef(null)

  // Revoke the previous object URL when a new one replaces it
  useEffect(() => {
    const url = previewRef.current
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [previewUrl])

  const acceptFile = useCallback((candidate) => {
    if (!candidate) return
    if (!candidate.type.startsWith('image/')) {
      setError('That file is not an image. Pick a JPG, PNG, WebP, or GIF.')
      return
    }
    if (candidate.size > MAX_FILE_SIZE) {
      setError(
        `"${candidate.name}" is ${formatBytes(candidate.size)} — over the 10 MB limit.`,
      )
      return
    }
    setError(null)
    setDimensions(null)
    setResult(null)
    setResultFa(null)
    setLang('en')
    setFile(candidate)
    setStatus('idle')
    setProgress(0)
    // Create the object URL here, in the event path, not in an effect
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    const url = URL.createObjectURL(candidate)
    previewRef.current = url
    setPreviewUrl(url)
  }, [])

  // Allow pasting an image straight from the clipboard
  useEffect(() => {
    function onPaste(event) {
      const pasted = event.clipboardData?.files?.[0]
      if (pasted) acceptFile(pasted)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [acceptFile])

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)
    const files = event.dataTransfer.files
    if (files.length > 1) {
      setError('You can upload one image at a time.')
      return
    }
    acceptFile(files[0])
  }

  // Compress, upload to the backend, and store the analysis result
  async function handleUpload() {
    if (!file || status === 'uploading') return

    try {
      setStatus('uploading')
      setProgress(10)
      setError(null)

      // Compress image in browser
      const compressedFile = await compressImage(
          file,
          2000,
          0.9
      )

      setProgress(30)

      // Send the compressed image to the backend for analysis
      const formData = new FormData()
      formData.append('file', compressedFile)

      const response = await fetch(API_URL+'/api/analyze', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
            body?.detail ?? `Analysis failed (${response.status})`
        )
      }

      setResult(await response.json())
      setLang('en')

      setProgress(100)
      setStatus('uploaded')

    } catch (error) {
      console.error(error)

      setStatus('idle')
      setProgress(0)
      setError(
          error instanceof TypeError
              ? 'Could not reach the analysis server — is the backend running?'
              : error instanceof Error
                  ? error.message
                  : 'Something went wrong while processing the image.'
      )
    }
  }

  // Fetch the Persian translation once, then switch freely
  async function handleShowFa() {
    if (translating || lang === 'fa') return

    if (resultFa) {
      setLang('fa')
      return
    }

    try {
      setTranslating(true)
      setError(null)

      const response = await fetch(API_URL+'/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
            body?.detail ?? `Translation failed (${response.status})`
        )
      }

      setResultFa(await response.json())
      setLang('fa')

    } catch (error) {
      console.error(error)
      setError(
          error instanceof TypeError
              ? 'Could not reach the analysis server — is the backend running?'
              : error instanceof Error
                  ? error.message
                  : 'Translation failed.'
      )
    } finally {
      setTranslating(false)
    }
  }
  function handleReset() {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }
    setFile(null)
    setPreviewUrl(null)
    setError(null)
    setDimensions(null)
    setResult(null)
    setResultFa(null)
    setLang('en')
    setStatus('idle')
    setProgress(0)
    if (inputRef.current) inputRef.current.value = ''
  }

  const focusRing =
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-safelight focus-visible:ring-offset-2 focus-visible:ring-offset-night'

  const isFa = lang === 'fa' && resultFa !== null
  const view = isFa ? resultFa : result

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-mist">
            Panel Analysis
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-chalk">
            Upload an image
          </h1>
          <p className="mt-2 text-sm text-mist">
            One image at a time — JPG, PNG, WebP, up to 10&nbsp;MB.
          </p>
        </header>

        {!file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`group flex w-full flex-col items-center justify-center gap-3 border border-dashed bg-panel px-6 py-16 text-center transition-colors ${
              isDragging
                ? 'border-safelight bg-panel-2'
                : 'border-hairline hover:border-mist hover:bg-panel-2'
            } ${focusRing}`}
            aria-describedby="upload-hint"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-10 w-10 text-mist transition-colors group-hover:text-safelight"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16V4m0 0L8 8m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"
              />
            </svg>
            <span className="font-medium text-chalk">Drop an image here</span>
            <span id="upload-hint" className="text-sm text-mist">
              or click to browse — you can also paste from the clipboard
            </span>
          </button>
        ) : (
          <div>
            <div className="border border-hairline bg-panel">
              <div className="relative flex min-h-64 items-center justify-center p-3">
                <img
                  src={previewUrl}
                  alt={`Preview of ${file.name}`}
                  onLoad={(event) =>
                    setDimensions(
                      `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`,
                    )
                  }
                  className="max-h-96 w-auto object-contain"
                />
                {/* Safelight viewfinder frame */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-3 opacity-70"
                >
                  <span className="absolute left-0 top-0 h-4 w-px bg-safelight" />
                  <span className="absolute left-0 top-0 h-px w-4 bg-safelight" />
                  <span className="absolute right-0 top-0 h-4 w-px bg-safelight" />
                  <span className="absolute right-0 top-0 h-px w-4 bg-safelight" />
                  <span className="absolute bottom-0 left-0 h-4 w-px bg-safelight" />
                  <span className="absolute bottom-0 left-0 h-px w-4 bg-safelight" />
                  <span className="absolute bottom-0 right-0 h-4 w-px bg-safelight" />
                  <span className="absolute bottom-0 right-0 h-px w-4 bg-safelight" />
                  <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-safelight/80" />
                  <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-safelight/80" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-hairline px-4 py-3 font-mono text-xs text-mist">
                <span className="truncate text-chalk">{file.name}</span>
                <span className="whitespace-nowrap">
                  {dimensions ? `${dimensions} · ` : ''}
                  {formatBytes(file.size)}
                </span>
              </div>
            </div>

            {status === 'uploading' && (
              <div
                className="mt-4 h-1 overflow-hidden bg-panel-2"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-safelight transition-[width] duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            <div className="mt-4 flex gap-3">
              {status !== 'uploaded' && (
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={status === 'uploading'}
                  className={`flex-1 bg-safelight px-4 py-2.5 font-medium text-night transition-colors hover:bg-safelight-bright disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                >
                  {status === 'uploading'
                      ? progress >= 60
                          ? 'Analyzing…'
                          : `Processing… ${progress}%`
                      : 'Analyze image'}
                </button>
              )}
              <button
                type="button"
                onClick={handleReset}
                disabled={status === 'uploading'}
                className={`border border-hairline px-4 py-2.5 text-chalk transition-colors hover:border-mist hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
              >
                {status === 'uploaded' ? 'Upload another' : 'Choose different'}
              </button>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => acceptFile(event.target.files[0])}
        />

        <div className="mt-4 min-h-6 text-sm">
          {error ? (
            <p role="alert" className="text-signal-red">
              {error}
            </p>
          ) : status === 'uploaded' ? (
            <p role="status" className="flex items-center gap-2 text-signal-green">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Analysis complete.
            </p>
          ) : null}
        </div>

        {result && (
          <section aria-label="Analysis result" className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-widest text-mist">
                Result
              </p>
              <div
                role="group"
                aria-label="Result language"
                className="flex border border-hairline"
              >
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  aria-pressed={lang === 'en'}
                  className={`px-3 py-1 font-mono text-xs transition-colors ${
                    lang === 'en'
                        ? 'bg-safelight text-night'
                        : 'text-mist hover:text-chalk'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={handleShowFa}
                  disabled={translating}
                  aria-pressed={lang === 'fa'}
                  className={`border-l border-hairline px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    lang === 'fa'
                        ? 'bg-safelight text-night'
                        : 'text-mist hover:text-chalk'
                  }`}
                >
                  {translating ? '…' : 'فا'}
                </button>
              </div>
            </div>

            {/* Scene */}
            <div className="border border-hairline bg-panel p-4">
              <h2 className="font-mono text-xs uppercase tracking-widest text-mist">
                Scene
              </h2>
              <p
                dir={isFa ? 'rtl' : 'ltr'}
                className={`mt-2 text-sm leading-relaxed text-chalk ${isFa ? 'font-fa' : ''}`}
              >
                {view.scene}
              </p>
            </div>

            {/* Characters */}
            {view.characters.length > 0 && (
              <div className="border border-hairline bg-panel p-4">
                <h2 className="font-mono text-xs uppercase tracking-widest text-mist">
                  Characters
                </h2>
                <ul className="mt-3 space-y-3">
                  {view.characters.map((character) => (
                    <li
                      key={character.id}
                      dir={isFa ? 'rtl' : 'ltr'}
                      className="border-s-2 border-safelight/40 ps-3"
                    >
                      <p className={`text-sm font-medium text-chalk ${isFa ? 'font-fa' : ''}`}>
                        <span className="me-2 font-mono text-xs text-mist">
                          {character.id}
                        </span>
                        {character.name}
                      </p>
                      <p className={`mt-1 text-sm leading-relaxed text-mist ${isFa ? 'font-fa' : ''}`}>
                        {character.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Emotions */}
            {view.emotions.length > 0 && (
              <div className="border border-hairline bg-panel p-4">
                <h2 className="font-mono text-xs uppercase tracking-widest text-mist">
                  Emotions
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {view.emotions.map((emotion) => (
                    <span
                      key={emotion}
                      dir={isFa ? 'rtl' : 'ltr'}
                      className={`border border-hairline px-2 py-1 text-xs text-safelight ${
                        isFa ? 'font-fa' : 'font-mono uppercase tracking-wider'
                      }`}
                    >
                      {emotion}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* YouTube */}
            <div className="border border-hairline bg-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-mono text-xs uppercase tracking-widest text-mist">
                  YouTube
                </h2>
                <CopyButton text={view.youtube_title} />
              </div>
              <p
                dir={isFa ? 'rtl' : 'ltr'}
                className={`mt-3 text-base font-semibold text-chalk ${isFa ? 'font-fa' : ''}`}
              >
                {view.youtube_title}
              </p>
              <p
                dir={isFa ? 'rtl' : 'ltr'}
                className={`mt-2 border-s-2 border-safelight/40 ps-3 text-sm leading-relaxed text-mist ${isFa ? 'font-fa' : 'italic'}`}
              >
                “{view.youtube_hook}”
              </p>
            </div>

            {/* Animation prompt */}
            <div className="border border-hairline bg-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-mono text-xs uppercase tracking-widest text-mist">
                  Animation prompt
                </h2>
                <CopyButton text={view.animation_prompt} />
              </div>
              <p
                dir={isFa ? 'rtl' : 'ltr'}
                className={`mt-3 whitespace-pre-wrap text-xs leading-relaxed text-chalk ${
                  isFa ? 'font-fa' : 'font-mono'
                }`}
              >
                {view.animation_prompt}
              </p>
            </div>
          </section>
        )}

        <footer className="mt-10 border-t border-hairline pt-4 text-center font-mono text-xs text-mist">
          Connected to Manga Analyzer API · POST /api/analyze
        </footer>
      </div>
    </main>
  )
}
