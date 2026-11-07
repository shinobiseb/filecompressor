import { fetchFile } from '@ffmpeg/util'
import { ffmpeg, loadFFmpeg } from './ffmpegClient'
import {
  getAudioBitrate,
  getVideoBitrates,
  readMediaMetadata,
  type CompressionSettings,
  type MediaMetadata,
} from './compression'

function shouldUseCopyCodec(file: File) {
  const name = file.name.toLowerCase()
  return (
    file.type === 'audio/mpeg' ||
    name.endsWith('.mp3') ||
    file.type === 'video/mp4' ||
    name.endsWith('.mp4')
  )
}

export async function compressVideo(
  file: File,
  onProgress?: (percent: number) => void,
  settings: CompressionSettings = { discord: false, quality: 50 },
): Promise<Blob> {
  let metadata: MediaMetadata | undefined

  try {
    metadata = await readMediaMetadata(file, 'video')
  } catch {
    // If browser metadata cannot be read, continue with a conservative default.
  }

  const { videoBitrate, audioBitrate } = getVideoBitrates(metadata, settings)
  const useCopyCodec = shouldUseCopyCodec(file)

  await loadFFmpeg()
  await ffmpeg.writeFile('video-input', await fetchFile(file))

  const handleProgress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(100, Math.round(progress * 100))))
  }

  ffmpeg.on('progress', handleProgress)

  try {
    if (useCopyCodec) {
      await ffmpeg.exec([
        '-i',
        'video-input',
        '-c:v',
        'copy',
        '-c:a',
        'copy',
        '-movflags',
        '+faststart',
        '-y',
        'compressed.mp4',
      ])
    } else {
      await ffmpeg.exec([
        '-i',
        'video-input',
        '-c:v',
        'libx264',
        '-b:v',
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
        String(audioBitrate),
        '-movflags',
        '+faststart',
        '-y',
        'compressed.mp4',
      ])
    }
  } finally {
    ffmpeg.off('progress', handleProgress)
  }

  const data = await ffmpeg.readFile('compressed.mp4')
  if (typeof data === 'string') {
    throw new Error('FFmpeg returned unexpected text output')
  }

  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return new Blob([buffer], { type: 'video/mp4' })
}
