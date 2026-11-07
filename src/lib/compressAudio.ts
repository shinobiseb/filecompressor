import { fetchFile } from '@ffmpeg/util'
import { ffmpeg, loadFFmpeg } from './ffmpegClient'
import {
  getAudioBitrate,
  readMediaMetadata,
  type CompressionSettings,
} from './compression'

function shouldUseCopyCodec(file: File) {
  const name = file.name.toLowerCase()
  return file.type === 'audio/mpeg' || name.endsWith('.mp3')
}

export async function compressAudio(
  file: File,
  onProgress?: (percent: number) => void,
  settings: CompressionSettings = { discord: false, quality: 50 },
): Promise<Blob> {
  let duration: number | undefined

  try {
    duration = (await readMediaMetadata(file, 'audio')).duration
  } catch {
    // If metadata is not readable, keep going with a safe bitrate estimate.
  }

  const audioBitrate = getAudioBitrate(settings, duration)
  const useCopyCodec = shouldUseCopyCodec(file)

  await loadFFmpeg()
  await ffmpeg.writeFile('audio-input', await fetchFile(file))

  const handleProgress = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(100, Math.round(progress * 100))))
  }

  ffmpeg.on('progress', handleProgress)

  try {
    if (useCopyCodec) {
      await ffmpeg.exec([
        '-i',
        'audio-input',
        '-c:a',
        'copy',
        '-y',
        'compressed.mp3',
      ])
    } else {
      await ffmpeg.exec([
        '-i',
        'audio-input',
        '-vn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        String(audioBitrate),
        '-y',
        'compressed.mp3',
      ])
    }
  } finally {
    ffmpeg.off('progress', handleProgress)
  }

  const data = await ffmpeg.readFile('compressed.mp3')
  if (typeof data === 'string') {
    throw new Error('FFmpeg returned unexpected text output')
  }

  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return new Blob([buffer], { type: 'audio/mpeg' })
}
