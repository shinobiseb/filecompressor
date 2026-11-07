import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const ffmpeg = new FFmpeg()
let loadPromise: Promise<void> | null = null

async function loadFFmpeg() {
  if (loadPromise) {
    await loadPromise
    return
  }

  loadPromise = (async () => {
    const baseURL = `${import.meta.env.BASE_URL}ffmpeg/`

    const coreURL = await toBlobURL(
      `${baseURL}ffmpeg-core.js`,
      'text/javascript',
    )
    const wasmURL = await toBlobURL(
      `${baseURL}ffmpeg-core.wasm`,
      'application/wasm',
    )

    console.log('FFmpeg core URL:', coreURL)
    console.log('FFmpeg wasm URL:', wasmURL)

    await ffmpeg.load({ coreURL, wasmURL })
  })()

  await loadPromise
}

export async function compressVideo(file: File): Promise<Blob> {
  await loadFFmpeg()

  const inputName = 'input'
  const outputName = 'compressed.mp4'

  await ffmpeg.writeFile(inputName, await fetchFile(file))
  await ffmpeg.exec([
    '-i', inputName,
    '-vcodec', 'libx264',
    '-crf', '28',
    '-preset', 'ultrafast',
    '-acodec', 'aac',
    outputName,
  ])

  const data = await ffmpeg.readFile(outputName)
  if (typeof data === 'string') {
    throw new Error('FFmpeg returned unexpected text output')
  }

  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)

  return new Blob([buffer], { type: 'video/mp4' })
}