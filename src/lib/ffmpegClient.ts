import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import { FFmpeg } from '@ffmpeg/ffmpeg'

export const ffmpeg = new FFmpeg()

let loadPromise: Promise<boolean> | null = null

export async function loadFFmpeg() {
  loadPromise ??= ffmpeg.load({ coreURL, wasmURL })
  await loadPromise
}
