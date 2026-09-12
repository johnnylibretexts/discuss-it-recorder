// Decode selected photos locally using the browser's native image formats.
// Keep only a video-sized canvas while segmentation/recording is running.
export function validateBackgroundImage (file) {
  if (!file || !file.size) throw new Error('Choose a background photo first.')
  const type = (file.type || '').toLowerCase()
  const supported = /^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(type)
  const unnamedType = !type || type === 'application/octet-stream'
  if (!supported && !(unnamedType && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || ''))) {
    throw new Error('Choose a JPG, PNG, WebP, or HEIC photo for the background.')
  }
  if (file.size > 20000000) throw new Error('This background photo is over 20 MB. Choose a smaller photo or a screenshot.')
}

export default async function loadBackgroundImage (file, signal) {
  validateBackgroundImage(file)
  const image = new Image()
  image.decoding = 'async'
  const url = URL.createObjectURL(file)
  let timeout
  let abort
  try {
    await new Promise((resolve, reject) => {
      abort = () => reject(new DOMException('Background image loading cancelled.', 'AbortError'))
      const unreadable = () => reject(new Error('This browser could not open that background photo. Choose a JPG/PNG copy or a screenshot instead.'))
      // Wait for decoded pixels, not just completed file loading, before drawing.
      image.onload = () => { image.decode().then(resolve, unreadable) }
      image.onerror = unreadable
      if (signal) {
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) { abort(); return }
      }
      timeout = setTimeout(() => reject(new Error('The background photo did not finish loading. Choose a smaller photo or a screenshot.')), 15000)
      image.src = url
    })
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!width || !height || width * height > 50000000) throw new Error('Choose a background photo no larger than 50 megapixels, or use a screenshot.')
    const scale = Math.min(1, 640 / Math.max(width, height))
    const source = document.createElement('canvas')
    source.width = Math.max(1, Math.round(width * scale))
    source.height = Math.max(1, Math.round(height * scale))
    source.getContext('2d').drawImage(image, 0, 0, source.width, source.height)
    return { source, width: source.width, height: source.height, close: () => { source.width = 1; source.height = 1 } }
  } finally {
    clearTimeout(timeout)
    if (signal && abort) signal.removeEventListener('abort', abort)
    image.onload = null; image.onerror = null
    image.removeAttribute('src')
    URL.revokeObjectURL(url)
  }
}
