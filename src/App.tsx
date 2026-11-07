import { useState, type ChangeEvent } from 'react'
import { compressVideo } from './lib/compressVideo'
import './App.css'

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null
    setFile(nextFile)
    setError(null)
    setOutputUrl(null)
    setProgress(0)
  }

  async function handleCompress() {
    if (!file) return

    setLoading(true)
    setError(null)
    setProgress(0)

    try {
      const compressedBlob = await compressVideo(file, (value) => {
        setProgress(value)
      })

      setOutputUrl(URL.createObjectURL(compressedBlob))
    } catch (error) {
      console.error('Compress failed:', error)
      setError(error instanceof Error ? error.message : 'Compression failed')
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  return (
    <main>
      <h1>File Compressor</h1>
      <input type="file" accept="video/*" onChange={handleFileChange} />

      {file && (
        <div>
          <button onClick={handleCompress} disabled={loading}>
            {loading ? 'Compressing...' : 'Compress'}
          </button>
        </div>
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