export type MediaKind = 'audio' | 'video' | 'photo'

export type CompressionSettings = {
  discord: boolean
  quality: number
}

export type MediaMetadata = {
  duration: number
  width: number
  height: number
}

export type CompressionEstimate = {
  projectedBytes: number
  qualityLabel: string
}

export type PhotoFormat = 'jpeg' | 'png' | 'webp'

export const DISCORD_TARGET_BYTES = 8_000_000
export const AUDIO_BITRATE = 96_000

export function getPhotoFormat(file: File): PhotoFormat | null {
  const mimeType = file.type.toLowerCase()
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg' || extension === 'jpg' || extension === 'jpeg') return 'jpeg'
  if (mimeType === 'image/png' || extension === 'png') return 'png'
  if (mimeType === 'image/webp' || extension === 'webp') return 'webp'
  return null
}

export function getCompressedFileName(file: File, kind: MediaKind): string {
  const originalName = file.name.split(/[\\/]/).pop() ?? file.name
  const extensionIndex = originalName.lastIndexOf('.')
  const baseName = extensionIndex > 0 ? originalName.slice(0, extensionIndex) : originalName
  const outputExtension = kind === 'audio' ? 'mp3' : kind === 'video' ? 'mp4' : getPhotoFormat(file) === 'jpeg' ? 'jpg' : getPhotoFormat(file)

  if (!outputExtension) {
    throw new Error('Supported image formats are JPEG, PNG, and WebP')
  }

  return `COMPRESSED_${baseName}.${outputExtension}`
}

export function readMediaMetadata(
  file: File,
  kind: 'audio' | 'video',
): Promise<MediaMetadata> {
  return new Promise((resolve, reject) => {
    const media = document.createElement(kind)
    const objectUrl = URL.createObjectURL(file)

    media.preload = 'metadata'

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
      media.removeAttribute('src')
      media.load()
    }

    media.onloadedmetadata = () => {
      const metadata: MediaMetadata = {
        duration: media.duration,
        width: kind === 'video' ? (media as HTMLVideoElement).videoWidth : 0,
        height: kind === 'video' ? (media as HTMLVideoElement).videoHeight : 0,
      }

      cleanup()

      if (!Number.isFinite(metadata.duration) || metadata.duration <= 0) {
        reject(new Error('The browser could not determine the media duration'))
        return
      }

      resolve(metadata)
    }

    media.onerror = () => {
      cleanup()
      reject(new Error('The browser could not read this file’s metadata'))
    }

    media.src = objectUrl
  })
}

export function readPhotoDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = image
      URL.revokeObjectURL(objectUrl)
      if (!width || !height) reject(new Error('Could not read photo dimensions'))
      else resolve({ width, height })
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('The browser could not read this photo metadata'))
    }

    image.src = objectUrl
  })
}

function clampQuality(quality: number) {
  return Math.min(100, Math.max(0, quality))
}

export function getAudioBitrate(settings: CompressionSettings, duration?: number): number {
  if (settings.discord) {
    if (!duration || !Number.isFinite(duration)) return 64_000
    const targetBitrate = (DISCORD_TARGET_BYTES * 8 * 0.94) / duration
    return Math.max(16_000, Math.min(320_000, Math.floor(targetBitrate / 1_000) * 1_000))
  }

  const ratio = clampQuality(settings.quality) / 100
  return Math.round((48_000 * (320_000 / 48_000) ** ratio) / 1_000) * 1_000
}

export function getVideoBitrates(
  metadata: MediaMetadata | undefined,
  settings: CompressionSettings,
): { videoBitrate: number; audioBitrate: number } {
  const width = metadata?.width || 1280
  const height = metadata?.height || 720
  const duration = metadata?.duration
  const audioBitrate = AUDIO_BITRATE
  const qualityFactor = 0.25 + (clampQuality(settings.quality) / 100) * 1.5
  const qualityBitrate = width * height * 30 * 0.06 * qualityFactor

  if (settings.discord && duration && Number.isFinite(duration)) {
    const totalTargetBitrate = (DISCORD_TARGET_BYTES * 8 * 0.94) / duration
    const availableVideoBitrate = Math.max(64_000, totalTargetBitrate - audioBitrate)
    const crf28Estimate = width * height * 30 * 0.06 * 2 ** ((23 - 28) / 6)
    return {
      videoBitrate: Math.floor(Math.min(crf28Estimate, availableVideoBitrate) / 1_000) * 1_000,
      audioBitrate,
    }
  }

  return {
    videoBitrate: Math.max(64_000, Math.round(qualityBitrate / 1_000) * 1_000),
    audioBitrate,
  }
}

export function qualityLabel(quality: number) {
  if (quality <= 20) return 'Smallest file'
  if (quality <= 40) return 'High compression'
  if (quality <= 60) return 'Balanced'
  if (quality <= 80) return 'Higher quality'
  return 'Highest quality'
}

export async function estimateCompression(
  file: File,
  kind: MediaKind,
  settings: CompressionSettings,
): Promise<CompressionEstimate | null> {
  if (kind === 'photo') {
    try {
      await readPhotoDimensions(file)
    } catch {
      return null
    }

    const format = getPhotoFormat(file)
    const quality = settings.discord ? 30 : clampQuality(settings.quality)
    // Approximate only: output depends on image content and encoder behavior.
    const estimatedRatio = format === 'png' ? 0.95 : 0.18 + (quality / 100) * 0.62

    return {
      projectedBytes: Math.ceil(file.size * estimatedRatio),
      qualityLabel: settings.discord ? 'Discord 8 MB target' : qualityLabel(settings.quality),
    }
  }

  let metadata: MediaMetadata
  try {
    metadata = await readMediaMetadata(file, kind)
  } catch {
    return null
  }

  const totalBitrate = kind === 'audio'
    ? getAudioBitrate(settings, metadata.duration)
    : (() => {
        const rates = getVideoBitrates(metadata, settings)
        return rates.videoBitrate + rates.audioBitrate
      })()
  const projectedBytes = Math.ceil((totalBitrate * metadata.duration * 1.06) / 8)

  return {
    projectedBytes,
    qualityLabel: settings.discord ? 'Discord 8 MB target' : qualityLabel(settings.quality),
  }
}
