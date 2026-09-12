// Native image decoding tests. HEIC fixture generation uses macOS sips; no user photos.
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
const { webkit, chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const server = http.createServer((req, res) => {
  if (req.url === '/BackgroundImage.js') {
    res.setHeader('Content-Type', 'application/javascript')
    res.end(fs.readFileSync('resources/js/media/recording/BackgroundImage.js')); return
  }
  res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Local background image tests</title>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await (process.env.BROWSER === 'chromium' ? chromium : webkit).launch({ headless: true })
let fixtureDirectory
try {
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const result = await page.evaluate(async () => {
    const { default: load, validateBackgroundImage: validate } = await import('/BackgroundImage.js')
    const activeUrls = new Set()
    const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = file => { const url = create(file); activeUrls.add(url); return url }
    URL.revokeObjectURL = url => { activeUrls.delete(url); revoke(url) }
    const assert = (value, message) => { if (!value) throw Error(message) }
    const canvas = document.createElement('canvas'); canvas.width = 4032; canvas.height = 3024
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#26804c'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    let png
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, type))
      if (type === 'image/png') png = blob
      const image = await load(blob)
      assert(image.width === 640 && image.height === 480, 'Large photos must be normalized before segmentation')
      const pixel = image.source.getContext('2d').getImageData(10, 10, 1, 1).data
      assert(pixel[1] > 100 && pixel[0] < 60, `Normalized ${type} photo pixels are preserved (${Array.from(pixel)})`)
      image.close(); assert(image.source.width === 1, 'Closed image releases full canvas storage')
    }
    for (const type of ['', 'application/octet-stream']) {
      const image = await load(new File([png], 'photo.PNG', { type })); image.close()
    }
    for (const file of [new File(['bad'], 'photo.svg', { type: 'image/svg+xml' }), new File([], 'empty.jpg', { type: 'image/jpeg' }), { size: 20000001, type: 'image/jpeg' }]) {
      let rejected = false
      try { validate(file) } catch { rejected = true }
      assert(rejected, 'Reject unsupported, empty, or oversized files')
    }
    let corruptRejected = false
    try { await load(new File(['broken'], 'photo.jpg', { type: 'image/jpeg' })) } catch (error) { corruptRejected = error.message.includes('JPG/PNG copy') }
    assert(corruptRejected, 'Unreadable images must offer a specific recovery action')
    const controller = new AbortController()
    const pending = load(png, controller.signal); controller.abort()
    let cancelled = false
    try { await pending } catch (error) { cancelled = error.name === 'AbortError' }
    assert(cancelled, 'Cancel interrupts image loading')
    assert(activeUrls.size === 0, 'Success, error and cancellation revoke all object URLs')
    canvas.width = 64; canvas.height = 64; ctx.fillStyle = '#26804c'; ctx.fillRect(0, 0, 64, 64)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  console.log('PASS JPG/PNG/WebP resizing, missing MIME, validation, corrupt-photo error, cancellation and URL cleanup')
  if (process.platform === 'darwin' && process.env.BROWSER !== 'chromium') {
    fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'discuss-it-photo-test-'))
    const input = path.join(fixtureDirectory, 'synthetic.png'); const output = path.join(fixtureDirectory, 'synthetic.heic')
    fs.writeFileSync(input, Buffer.from(result, 'base64'))
    execFileSync('sips', ['-s', 'format', 'heic', input, '--out', output], { stdio: 'pipe' })
    const heic = fs.readFileSync(output)
    assert.ok(heic.includes(Buffer.from('ftyp')), 'Fixture is an actual HEIC container')
    await page.evaluate(async data => {
      const { default: load } = await import('/BackgroundImage.js')
      const file = new File([Uint8Array.from(atob(data), c => c.charCodeAt(0))], 'synthetic.heic', { type: 'image/heic' })
      const image = await load(file)
      const pixel = image.source.getContext('2d').getImageData(10, 10, 1, 1).data
      if (image.width !== 64 || pixel[1] < 100 || pixel[0] > 60) throw Error('Native HEIC pixels did not decode correctly')
      image.close()
    }, heic.toString('base64'))
    console.log('PASS actual HEIC photo decodes through native WebKit image loading')
  }
} finally {
  await browser.close(); server.close()
  if (fixtureDirectory) fs.rmSync(fixtureDirectory, { recursive: true })
}
