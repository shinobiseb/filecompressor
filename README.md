# File Compressor

A browser-based audio, video, and photo compressor powered by FFmpeg WebAssembly. Files are processed locally in your browser.

## Supported files

- **Audio:** common audio formats supported by the browser and FFmpeg; output is MP3.
- **Video:** common video formats supported by the browser and FFmpeg; output is MP4.
- **Photos:** JPEG, PNG, and WebP; the output stays in the original format.

Compressed files are named `COMPRESSED_{originalName}.{outputExtension}`. For example, `vacation.png` becomes `COMPRESSED_vacation.png`.

## Compression options

After choosing a supported file, adjust the compression quality with the slider or enable **Discord compression** for an approximate 8 MB target. The target and projected size are estimates, not guarantees.

For PNG photos, compression is lossless: the quality slider changes encoding effort rather than visual quality.

## Requirements

- Node.js 16 or newer
- npm

## Run locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

## Available scripts

```bash
npm run dev      # Start the Vite development server
npm run build    # Type-check and build for production
npm run lint     # Run ESLint
npm run preview  # Preview the production build
```

## How it works

The app uses `@ffmpeg/ffmpeg` with `@ffmpeg/core` to run FFmpeg in WebAssembly. The shared FFmpeg instance is loaded in the browser and used by the audio, video, and photo compression modules.