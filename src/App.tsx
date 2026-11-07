import { useEffect, useState, type ChangeEvent } from 'react'
import { compressAudio } from './lib/compressAudio'
import {
  estimateCompression,
  type CompressionEstimate,
  type CompressionSettings,
  type MediaKind,
} from './lib/compression'
import { compressVideo } from './lib/compressVideo'
import './App.css'

function detectMediaKind(file: File): MediaKind | null {
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('video/')) return 'video'

  const extension = file.name.split('.').pop()?.toLowerCase()
  const audioExtensions = new Set([
    'aac', 'aif', 'aiff', 'alac', 'amr', 'ape', 'flac', 'm4a', 'm4b',
    'mid', 'midi', 'mka', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'wma',
  ])
  const videoExtensions = new Set([
    '3gp', 'avi', 'm2ts', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg',
    'mts', 'webm', 'wmv',
  ])

  if (extension && audioExtensions.has(extension)) return 'audio'
  if (extension && videoExtensions.has(extension)) return 'video'
  return null
}

function formatFileSize(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(2)} MB`
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [fileType, setFileType] = useState<MediaKind | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [estimate, setEstimate] = useState<CompressionEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [settings, setSettings] = useState<CompressionSettings>({
    discord: false,
    quality: 50,
  })

  useEffect(() => {
    let cancelled = false

    if (!file || !fileType) {
      setEstimate(null)
      setEstimating(false)
      return
    }

    setEstimate(null)
    setEstimating(true)

    estimateCompression(file, fileType, settings)
      .then((result) => {
        if (!cancelled) setEstimate(result)
      })
      .finally(() => {
        if (!cancelled) setEstimating(false)
      })

    return () => {
      cancelled = true
    }
  }, [file, fileType, settings])

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null
    setFile(nextFile)
    setFileType(nextFile ? detectMediaKind(nextFile) : null)
    setError(null)
    setEstimate(null)
    setProgress(0)
    setOutputUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl)
      return null
    })
  }

  async function handleCompress() {
    if (!file || !fileType) return

    setLoading(true)
    setError(null)
    setProgress(0)

    try {
      const onProgress = (value: number) => setProgress(value)
      const compressedBlob =
        fileType === 'audio'
          ? await compressAudio(file, onProgress, settings)
          : await compressVideo(file, onProgress, settings)

      setOutputUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl)
        return URL.createObjectURL(compressedBlob)
      })
    } catch (cause) {
      console.error('Compression failed:', cause)
      setError(cause instanceof Error ? cause.message : 'Compression failed')
    } finally {
      setLoading(false)
    }
  }

  const outputName = fileType === 'audio' ? 'compressed.mp3' : 'compressed.mp4'

  return (
    <main>
      <h1>File Compressor</h1>
      <p>Compress audio and video files in your browser.</p>
      <input
        type="file"
        accept="audio/*,video/*"
        onChange={handleFileChange}
        disabled={loading}
        aria-label="Choose an audio or video file"
      />

      {file && (
        <p className="selected-file">
          {file.name} · {fileType ? `${fileType} file` : 'unsupported file type'}
        </p>
      )}

      {file && fileType && (
        <section className="compression-menu" aria-labelledby="compression-heading">
          <h2 id="compression-heading">Compression settings</h2>

          <label className="discord-option">
            <input
              type="checkbox"
              checked={settings.discord}
              disabled={loading}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  discord: event.target.checked,
                }))
              }
            />
            <span>
              Discord compression
              <small>Targets an 8 MB output. This is an estimate, not a guarantee.</small>
            </span>
          </label>

          <div className="quality-control">
            <label htmlFor="quality-slider">
              <span>Compression quality</span>
              <strong>{settings.quality}/100</strong>
            </label>
            <input
              id="quality-slider"
              type="range"
              min="0"
              max="100"
              step="5"
              value={settings.quality}
              disabled={settings.discord || loading}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  quality: Number(event.target.value),
                }))
              }
            />
            <div className="quality-scale" aria-hidden="true">
              <span>Smaller file</span>
              <span>Higher quality</span>
            </div>
          </div>

          <p className="projection" aria-live="polite">
            {estimate
              ? `Projected size: about ${formatFileSize(estimate.projectedBytes)} · ${estimate.qualityLabel}`
              : estimating
                ? 'Estimating output size…'
                : 'Size projection unavailable; compression will still be attempted.'}
          </p>
        </section>
      )}

      {file && fileType && (
        <button onClick={handleCompress} disabled={loading}>
          {loading ? 'Compressing…' : `Compress ${fileType}`}
        </button>
      )}

      {file && !fileType && (
        <p role="alert">Choose a supported audio or video file.</p>
      )}

      {loading && (
        <div className="compression-status" role="status">
          <span>Compressing {fileType}… {progress}%</span>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={`Compressing ${fileType ?? 'media'}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="progress-indicator" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && <p role="alert">{error}</p>}

      {outputUrl && (
        <a href={outputUrl} download={outputName}>
          Download compressed {fileType}
        </a>
      )}
    </main>
  )
}

export default App
