import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

const ffmpeg = new FFmpeg()
let loadPromise: Promise<boolean> | null = null

const DISCORD_TARGET_BYTES = 8_000_000
const AUDIO_BITRATE = 96_000

export type CompressionSettings = {
  discord: boolean
  /** Quality slider value, from 0 to 100. Higher values use more bitrate. */
  quality: number
}

export type CompressionEstimate = {
  projectedBytes: number
  qualityLabel: string
}

type VideoMetadata = {
  width: number
  height: number
  duration: number
}

async function loadFFmpeg() {
  loadPromise ??= ffmpeg.load({ coreURL, wasmURL })
  await loadPromise
}

function getVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)

    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      const metadata = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      }

      URL.revokeObjectURL(objectUrl)

      if (
        !metadata.width ||
        !metadata.height ||
        !Number.isFinite(metadata.duration) ||
        metadata.duration <= 0
      ) {
        reject(new Error('Could not read the video resolution or duration'))
        return
      }

      resolve(metadata)
    }

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read the video metadata'))
    }

    video.src = objectUrl
  })
}

function getQualityLabel(quality: number) {
  if (quality <= 20) return 'Very small file'
  if (quality <= 40) return 'High compression'
  if (quality <= 60) return 'Balanced'
  if (quality <= 80) return 'Higher quality'
  return 'Highest quality'
}

function getVideoBitrate(
  { width, height, duration }: VideoMetadata,
  settings: CompressionSettings,
) {
  if (settings.discord) {
    // Preserve the existing 8 MB preset behavior, reserving room for audio
    // and MP4 container overhead.
    const usableBits = DISCORD_TARGET_BYTES * 8 * 0.94
    const totalBitrate = usableBits / duration
    const availableVideoBitrate = totalBitrate - AUDIO_BITRATE

    // Approximate the existing CRF 28 quality estimate.
    const assumedFramesPerSecond = 30
    const referenceBitsPerPixelPerFrame = 0.06
    const crfFactor = 2 ** ((23 - 28) / 6)
    const qualityEstimate =
      width *
      height *
      assumedFramesPerSecond *
      referenceBitsPerPixelPerFrame *
      crfFactor

    return Math.floor(
      Math.min(qualityEstimate, availableVideoBitrate) / 1_000,
    ) * 1_000
  }

  // Map the arbitrary 0–100 slider to a bitrate multiplier from 0.25× to 1.75×.
  const quality = Math.min(100, Math.max(0, settings.quality))
  const bitrateFactor = 0.25 + (quality / 100) * 1.5
  const baselineBitrate = width * height * 30 * 0.06

  return Math.max(
    64_000,
    Math.round((baselineBitrate * bitrateFactor) / 1_000) * 1_000,
  )
}

export async function estimateCompression(
  file: File,
  settings: CompressionSettings,
): Promise<CompressionEstimate> {
  const metadata = await getVideoMetadata(file)
  const videoBitrate = getVideoBitrate(metadata, settings)

  if (videoBitrate <= 0) {
    throw new Error(
      'This video is too long to fit within the selected 8 MB size limit',
    )
  }

  // Estimate video + audio data and add a small allowance for the MP4 container.
  const projectedBytes = Math.ceil(
    ((videoBitrate + AUDIO_BITRATE) * metadata.duration * 1.06) / 8,
  )

  return {
    projectedBytes,
    qualityLabel: settings.discord
      ? 'Discord 8 MB preset'
      : getQualityLabel(settings.quality),
  }
}

export async function compressVideo(
  file: File,
  onProgress?: (percent: number) => void,
  settings: CompressionSettings = { discord: false, quality: 50 },
): Promise<Blob> {
  const metadata = await getVideoMetadata(file)
  const videoBitrate = getVideoBitrate(metadata, settings)

  if (videoBitrate <= 0) {
    throw new Error(
      'This video is too long to fit within the selected 8 MB size limit',
    )
  }

  await loadFFmpeg()

  const inputName = 'input'
  const outputName = 'compressed.mp4'

  await ffmpeg.writeFile(inputName, await fetchFile(file))

  const handleProgress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(100, Math.round(progress * 100))))
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
      '-minrate',
      String(videoBitrate),
      '-maxrate',
      String(videoBitrate),
      '-bufsize',
      String(videoBitrate * 2),
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      '-b:a',
      String(AUDIO_BITRATE),
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