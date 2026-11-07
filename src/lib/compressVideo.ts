import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

const ffmpeg = new FFmpeg()
let loadPromise: Promise<boolean> | null = null

export type CompressionPreset = {
  targetBytes: number
  crf: number
  audioBitrate: number
}

export const UNDER_8MB_PRESET: CompressionPreset = {
  targetBytes: 8_000_000,
  crf: 28,
  audioBitrate: 96_000,
}

async function loadFFmpeg() {
  loadPromise ??= ffmpeg.load({ coreURL, wasmURL })
  await loadPromise
}

function getVideoMetadata(file: File): Promise<{
  width: number
  height: number
  duration: number
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)

    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      const { videoWidth: width, videoHeight: height, duration } = video

      URL.revokeObjectURL(objectUrl)

      if (!width || !height || !Number.isFinite(duration) || duration <= 0) {
        reject(new Error('Could not read the video resolution or duration'))
        return
      }

      resolve({ width, height, duration })
    }

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read the video metadata'))
    }

    video.src = objectUrl
  })
}

function estimateVideoBitrate(
  width: number,
  height: number,
  duration: number,
  preset: CompressionPreset,
): number {
  // Leave room for audio and MP4 container overhead.
  const usableBits = preset.targetBytes * 8 * 0.94
  const totalBitrate = usableBits / duration
  const availableVideoBitrate = totalBitrate - preset.audioBitrate

  if (availableVideoBitrate <= 0) {
    throw new Error('This video is too long to fit within the selected size limit')
  }

  // Rough quality-based estimate: higher resolution or lower CRF allows more bits.
  // This is a heuristic, not an exact prediction of the final file size.
  const assumedFramesPerSecond = 30
  const referenceBitsPerPixelPerFrame = 0.06
  const crfFactor = 2 ** ((23 - preset.crf) / 6)
  const qualityEstimate =
    width *
    height *
    assumedFramesPerSecond *
    referenceBitsPerPixelPerFrame *
    crfFactor

  // Round down to the nearest 1,000 bits per second.
  return Math.floor(Math.min(qualityEstimate, availableVideoBitrate) / 1_000) * 1_000
}

export async function compressVideo(
  file: File,
  onProgress?: (percent: number) => void,
  preset: CompressionPreset = UNDER_8MB_PRESET,
): Promise<Blob> {
  const { width, height, duration } = await getVideoMetadata(file)
  const videoBitrate = estimateVideoBitrate(width, height, duration, preset)

  if (videoBitrate <= 0) {
    throw new Error('Could not calculate a usable video bitrate for this size limit')
  }

  await loadFFmpeg()

  const inputName = 'input'
  const outputName = 'compressed.mp4'

  await ffmpeg.writeFile(inputName, await fetchFile(file))

  const handleProgress = ({ progress }: { progress: number }) => {
    const percent = Math.max(0, Math.min(100, Math.round(progress * 100)))
    onProgress?.(percent)
  }

  ffmpeg.on('progress', handleProgress)

  try {
    await ffmpeg.exec([
      '-i',
      inputName,
      '-c:v',
      'libx264',
      '-b:v',
      String(videoBitrate),
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      '-b:a',
      String(preset.audioBitrate),
      outputName,
    ])
  } finally {
    ffmpeg.off('progress', handleProgress)
  }

  const data = await ffmpeg.readFile(outputName)
  if (typeof data === 'string') {
    throw new Error('FFmpeg returned unexpected text output')
  }

  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)

  return new Blob([buffer], { type: 'video/mp4' })
}