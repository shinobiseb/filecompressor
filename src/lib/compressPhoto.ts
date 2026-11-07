import { fetchFile } from '@ffmpeg/util'
import { ffmpeg, loadFFmpeg } from './ffmpegClient'
import {
  getCompressedFileName,
  getPhotoFormat,
  type CompressionSettings,
} from './compression'

export async function compressPhoto(
  file: File,
  onProgress?: (percent: number) => void,
  settings: CompressionSettings = { discord: false, quality: 50 },
): Promise<Blob> {
  const format = getPhotoFormat(file)
  if (!format) {
    throw new Error('Supported image formats are JPEG, PNG, and WebP')
  }

  const outputName = getCompressedFileName(file, 'photo')
  const inputName = `photo-input.${format === 'jpeg' ? 'jpg' : format}`
  const quality = settings.discord ? 30 : Math.max(0, Math.min(100, settings.quality))
  const ffmpegQuality = Math.round(31 - (quality / 100) * 29)

  await loadFFmpeg()
  await ffmpeg.writeFile(inputName, await fetchFile(file))

  const handleProgress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(100, Math.round(progress * 100))))
  }
  ffmpeg.on('progress', handleProgress)

  try {
    const args = ['-i', inputName, '-frames:v', '1']
    if (format === 'jpeg') {
      args.push('-q:v', String(ffmpegQuality))
    } else if (format === 'webp') {
      args.push('-c:v', 'libwebp', '-quality', String(quality))
    } else {
      // PNG is lossless: compression_level affects encoding effort, not image quality.
      args.push('-compression_level', settings.discord ? '9' : String(Math.round(1 + (quality / 100) * 8)))
    }
    args.push('-y', outputName)
    await ffmpeg.exec(args)
  } finally {
    ffmpeg.off('progress', handleProgress)
  }

  const data = await ffmpeg.readFile(outputName)
  if (typeof data === 'string') {
    throw new Error('FFmpeg returned unexpected text output')
  }
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  const mimeType = format === 'jpeg' ? 'image/jpeg' : `image/${format}`
  return new Blob([buffer], { type: mimeType })
}
