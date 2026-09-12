// Background failures must never revoke camera access or expose a raw frame.
const appleMobile = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const unavailable = () => new Error('Background effects could not start. Tap Retry preview, or explicitly select None. Your camera permission does not need to be changed.')

export default class BackgroundProcessor {
  async init () {
    this.closed = false
    // iOS browser apps share platform-specific capture/WebGL constraints. Use a
    // DOM canvas here rather than relying on worker OffscreenCanvas support.
    if (appleMobile()) return this.initMain()
    try {
      this.worker = new Worker('/assets/discuss-it/segmenter-worker.js')
      await this.request({ type: 'init' }, [], 45000)
    } catch (error) {
      this.stopWorker()
      if (this.closed) throw error
      await this.initMain()
    }
  }

  async initMain () {
    if (this.closed) throw unavailable()
    let timeout
    try {
      const load = async () => {
        const vision = await import(/* webpackIgnore: true */ '/assets/discuss-it/vision_module.js')
        if (this.closed) throw unavailable()
        const files = await vision.FilesetResolver.forVisionTasks('/assets/discuss-it/wasm')
        if (this.closed) throw unavailable()
        const model = await vision.ImageSegmenter.createFromOptions(files, {
          canvas: document.createElement('canvas'),
          baseOptions: { modelAssetPath: '/assets/discuss-it/selfie_segmenter.tflite', delegate: 'CPU' },
          runningMode: 'VIDEO',
          outputCategoryMask: false,
          outputConfidenceMasks: true
        })
        if (this.closed) { model.close(); throw unavailable() }
        this.model = model
      }
      await Promise.race([load(), new Promise((resolve, reject) => { timeout = setTimeout(() => reject(unavailable()), 45000) })])
    } catch (error) { this.close(); throw unavailable() } finally { clearTimeout(timeout) }
  }

  request (data, transfer, milliseconds) {
    return new Promise((resolve, reject) => {
      const finish = (error, result) => {
        clearTimeout(timeout)
        this.cancelRequest = null
        if (error) reject(error); else resolve(result)
      }
      const timeout = setTimeout(() => finish(unavailable()), milliseconds)
      this.cancelRequest = () => finish(unavailable())
      this.worker.onmessage = ({ data }) => finish(data.error ? unavailable() : null, data)
      this.worker.onerror = () => finish(unavailable())
      try { this.worker.postMessage(data, transfer) } catch (error) { finish(unavailable()) }
    })
  }

  async mask (canvas, timestamp) {
    if (this.closed) throw unavailable()
    if (this.worker) {
      let frame
      try {
        frame = await createImageBitmap(canvas)
        if (this.closed) { frame.close(); throw unavailable() }
        return await this.request({ type: 'frame', frame, timestamp }, [frame], 10000)
      } catch (error) {
        if (frame) frame.close()
        this.stopWorker()
        if (this.closed) throw error
        await this.initMain()
      }
    }
    if (!this.model || this.closed) throw unavailable()
    let mask
    this.model.segmentForVideo(canvas, timestamp, result => {
      const confidence = result.confidenceMasks[0]
      mask = { width: confidence.width, height: confidence.height, values: confidence.getAsFloat32Array().slice().buffer }
    })
    return mask
  }

  stopWorker () {
    if (this.cancelRequest) this.cancelRequest()
    if (this.worker) this.worker.terminate()
    this.worker = null
  }

  close () {
    this.closed = true
    this.stopWorker()
    if (this.model) this.model.close()
    this.model = null
  }
}
