// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright index.mjs.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = process.cwd()
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width"><canvas id="preview"></canvas>'); return }
  const source = ['/Recorder.js', '/BackgroundProcessor.js', '/BackgroundImage.js'].includes(req.url) ? path.join(root, 'resources/js/media/recording', req.url.slice(1)) : path.join(root, 'public', req.url)
  if (!source.startsWith(root) || !fs.existsSync(source)) { res.writeHead(404); res.end(); return }
  res.setHeader('Content-Type', /\.m?js$/.test(source) ? 'application/javascript' : source.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
  fs.createReadStream(source).pipe(res)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = process.env.BROWSER === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const watchdog = setTimeout(async () => { console.error('Browser test timed out'); await browser.close() }, 90000)
const backgrounds = process.env.BACKGROUND ? [process.env.BACKGROUND] : ['none', 'color', 'blur', 'image']
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    ...(process.env.IPHONE === '1' ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : {}) })
  const errors = []
  page.on('console', message => console.log('browser:', message.text()))
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  if (process.env.FAIL_WORKER === '1') await page.evaluate(() => { window.Worker = class { constructor () { throw new Error('Injected worker-unavailable condition') } } })
  if (process.env.FAIL_ENUMERATION === '1') await page.evaluate(() => { navigator.mediaDevices.enumerateDevices = async () => { throw new Error('Injected enumeration denial') } })
  if (process.env.BROWSER === 'webkit') {
    await page.evaluate(() => {
      const source = document.createElement('canvas'); source.width = 640; source.height = 480; document.body.appendChild(source)
      const draw = () => { const ctx = source.getContext('2d'); ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 320, 480); ctx.fillStyle = 'blue'; ctx.fillRect(320, 0, 320, 480) }
      draw(); setInterval(draw, 30)
      const video = source.captureStream(15)
      const audio = new AudioContext(); const oscillator = audio.createOscillator(); const destination = audio.createMediaStreamDestination(); oscillator.connect(destination); oscillator.start(); audio.resume()
      navigator.mediaDevices.getUserMedia = async constraints => new MediaStream([
        ...(constraints.video ? video.getVideoTracks().map(track => track.clone()) : []), ...destination.stream.getAudioTracks().map(track => track.clone())
      ])
      navigator.mediaDevices.enumerateDevices = async () => []
    })
  }
  const result = await page.evaluate(async ({ backgrounds, skipAudioOnly }) => {
    const { default: Recorder, extensionFor, recordingFormat } = await import('/Recorder.js')
    const prepareWorker = Recorder.prototype.prepareWorker
    Recorder.prototype.prepareWorker = async function () { console.log('loading segmenter'); await prepareWorker.call(this); console.log('segmenter loaded') }
    if (extensionFor('video/mp4') !== 'mp4' || extensionFor('audio/mp4') !== 'm4a') throw Error('Format mapping failed')
    const canvas = document.querySelector('canvas')
    const states = []
    const errors = []
    let recorder
    const tests = []
    const backgroundCanvas = document.createElement('canvas'); backgroundCanvas.width = 640; backgroundCanvas.height = 480
    const backgroundContext = backgroundCanvas.getContext('2d'); backgroundContext.fillStyle = '#ff0080'; backgroundContext.fillRect(0, 0, 640, 480)
    const image = await new Promise(resolve => backgroundCanvas.toBlob(resolve, 'image/png'))
    for (const background of backgrounds) {
      console.log('preparing', background)
      recorder = new Recorder(canvas, state => states.push(state), error => errors.push(error.message))
      await recorder.prepare({ background, mirror: true, image })
      console.log('preview', background)
      if (recorder.state !== 'preview') throw Error('No preview')
      const complete = recorder.start()
      await new Promise(resolve => setTimeout(resolve, 2200))
      recorder.stop()
      const clip = await complete
      console.log('recorded', background)
      recorder.dispose()
      if (clip.blob.size < 1000 || clip.durationMs < 2000) throw Error('Invalid clip')
      const player = document.createElement('video')
      player.src = URL.createObjectURL(clip.blob); player.muted = true
      await Promise.race([player.play(), new Promise((resolve, reject) => setTimeout(() => reject(Error('Playback timed out')), 10000))])
      if (!player.videoWidth) throw Error('Recorded clip cannot play')
      if (skipAudioOnly && background === 'none') {
        // Inspect encoded playback, not the preview: synthetic input is red-left,
        // blue-right, so a saved mirrored clip must be blue-left, red-right.
        const pixels = document.createElement('canvas'); pixels.width = 640; pixels.height = 480
        const context = pixels.getContext('2d'); context.drawImage(player, 0, 0, 640, 480)
        const left = context.getImageData(100, 240, 1, 1).data
        const right = context.getImageData(540, 240, 1, 1).data
        if (!(left[2] > left[0] + 100 && right[0] > right[2] + 100)) throw Error('Saved video is not mirrored')
        console.log('PASS encoded video pixels are mirrored')
      }
      player.pause(); URL.revokeObjectURL(player.src)
      tests.push({ background, bytes: clip.blob.size, type: clip.mimeType, width: player.videoWidth })
    }
    let audioBytes = null
    if (!skipAudioOnly) {
      recorder = new Recorder(canvas, state => states.push(state), error => errors.push(error.message))
      await recorder.prepare({ audioOnly: true })
      const audioDone = recorder.start(); await new Promise(resolve => setTimeout(resolve, 1100)); recorder.stop()
      const audio = await audioDone
      if (!audio.mimeType.startsWith('audio/')) throw Error('Audio mislabeled')
      audioBytes = audio.blob.size
    }
    recorder.dispose(); recorder.dispose()
    if (recorder.state !== 'disposed' || recorder.stream) throw Error('Resource leak')
    return { states, errors, tests, format: recordingFormat(), audioBytes, skipAudioOnly }
  }, { backgrounds, skipAudioOnly: process.env.BROWSER === 'webkit' })
  assert.deepEqual(errors, [])
  assert.deepEqual(result.errors, [])
  assert.equal(result.tests.length, backgrounds.length)
  console.log(JSON.stringify(result, null, 2))
} finally { clearTimeout(watchdog); await browser.close(); server.close() }
