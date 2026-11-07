import { useState, type ChangeEvent } from 'react'
import { compressVideo } from './lib/compressVideo'
import './App.css'

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outputUrl, setOutputUrl] = useState<string | null>(null)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null)
    setError(null)
    setOutputUrl(null)
  }

  async function handleCompress() {
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const compressedBlob = await compressVideo(file)
      setOutputUrl(URL.createObjectURL(compressedBlob))
    } catch (error) {
      console.error('Compress failed:', error)
      setError(error instanceof Error ? error.message : 'Compression failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <h1>File Compressor</h1>
      <input type="file" accept="video/*" onChange={handleFileChange} />

      {file && (
        <div>
          <h2>{file.name}</h2>
          <button onClick={handleCompress} disabled={loading}>
            {loading ? 'Compressing...' : 'Compress'}
          </button>
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