import { useEffect, useState, type ChangeEvent } from 'react'
import {
  compressVideo,
  estimateCompression,
  type CompressionSettings,
  type CompressionEstimate,
} from './lib/compressVideo'
import './App.css'

function formatFileSize(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(2)} MB`
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [settings, setSettings] = useState<CompressionSettings>({
    discord: false,
    quality: 50,
  })
  const [estimate, setEstimate] = useState<CompressionEstimate | null>(null)
  const [estimateError, setEstimateError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!file) {
      setEstimate(null)
      setEstimateError(null)
      return
    }

    setEstimate(null)
    setEstimateError(null)

    estimateCompression(file, settings)
      .then((result) => {
        if (!cancelled) setEstimate(result)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setEstimateError(
            cause instanceof Error ? cause.message : 'Could not estimate output size',
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [file, settings])

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null)
    setError(null)
    setOutputUrl(null)
  }

  async function handleCompress() {
    if (!file) return

    setLoading(true)
    setError(null)
    setProgress(0)

    try {
      const compressedBlob = await compressVideo(file, setProgress, settings)
      setOutputUrl(URL.createObjectURL(compressedBlob))
    } catch (cause) {
      console.error('Compress failed:', cause)
      setError(cause instanceof Error ? cause.message : 'Compression failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <h1>File Compressor</h1>
      <input type="file" accept="video/*" onChange={handleFileChange} />

      {file && <h2>{file.name}</h2>}

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
            <small>Uses the existing 8 MB preset and overrides the slider.</small>
          </span>
        </label>

        <div className="quality-control">
          <label htmlFor="quality-slider">
            Compression quality
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

        {file && (
          <p className="projection" aria-live="polite">
            {estimate
              ? `Projected size: about ${formatFileSize(estimate.projectedBytes)} · ${estimate.qualityLabel}`
              : estimateError ?? 'Estimating output size…'}
          </p>
        )}
      </section>

      {file && (
        <button onClick={handleCompress} disabled={loading}>
          {loading ? 'Compressing...' : 'Compress'}
        </button>
      )}

      {loading && (
        <div className="compression-status" role="status">
          <span>Compressing video… {progress}%</span>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Compressing video"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className="progress-indicator"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && <p role="alert">{error}</p>}

      {outputUrl && (
        <a href={outputUrl} download="compressed.mp4">
          Download compressed video
        </a>
      )}
    </main>
  )
}

export default App