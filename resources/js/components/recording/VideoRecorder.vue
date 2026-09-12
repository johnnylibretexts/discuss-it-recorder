<template>
  <section class="discuss-recorder" aria-label="Record your response">
    <p>Choose your camera and look, record, then review before submitting. Keep this page open while recording.</p>
    <div v-if="error" role="alert" class="alert alert-warning">{{ error }}</div>
    <fieldset :disabled="locked">
      <legend class="h6">Recording settings</legend>
      <label v-if="!audioOnly">Camera
        <select v-model="deviceId" @change="changed">
          <option value="">{{ facingMode === 'user' ? 'Front camera' : 'Rear camera' }}</option>
          <option v-for="(device, index) in devices" :key="device.deviceId" :value="device.deviceId">{{ device.label || `Camera ${index + 1}` }}</option>
        </select>
      </label>
      <button v-if="!audioOnly" type="button" class="btn btn-outline-primary" @click="switchCamera">Switch front / rear</button>
      <label v-if="!audioOnly" class="mirror"><input v-model="mirror" type="checkbox" @change="changed"> Mirror video (also mirrors saved text)</label>
      <label v-if="!audioOnly">Background
        <select v-model="background" @change="changed">
          <option value="none">None</option><option value="blur">Blur</option><option value="color">Neutral color</option><option value="image">My image</option>
        </select>
      </label>
      <label v-if="background === 'image' && !audioOnly">Choose background photo (up to 20 MB)
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" @change="selectImage">
        <span v-if="image" class="small">Selected: {{ image.name }}</span>
      </label>
    </fieldset>
    <p v-if="background !== 'none' && !audioOnly" class="small">Background effects run on your device. Check the preview: edges may not be perfect.</p>
    <canvas v-show="!audioOnly && ['preview','recording','finalizing'].includes(state)" ref="canvas" aria-label="Preview of the video that will be saved" />
    <video v-if="result && !audioOnly" :src="reviewUrl" controls playsinline preload="metadata" aria-label="Review recording" />
    <audio v-if="result && audioOnly" :src="reviewUrl" controls aria-label="Review recording" />
    <p role="status">{{ statusText }} <span v-if="state === 'recording'" aria-hidden="true">{{ seconds }} / 300 seconds</span></p>
    <div class="recorder-actions">
      <button v-if="state === 'idle'" type="button" class="btn btn-primary" @click="prepare">{{ audioOnly ? 'Enable microphone' : 'Enable camera & microphone' }}</button>
      <button v-if="state === 'setup-error'" type="button" class="btn btn-primary" @click="prepare">Retry preview</button>
      <button v-if="state === 'preview'" type="button" class="btn btn-danger" @click="start">Start recording</button>
      <button v-if="state === 'recording'" type="button" class="btn btn-danger" @click="stop">Stop & review</button>
      <button v-if="state === 'review'" type="button" class="btn btn-outline-primary" @click="retake">Retake</button>
      <a v-if="result" class="btn btn-outline-secondary" :href="reviewUrl" :download="`my-recording.${result.extension}`">Download a copy</a>
      <button v-if="!['idle','review','disposed'].includes(state)" type="button" class="btn btn-outline-secondary" @click="cancel">Cancel</button>
    </div>
  </section>
</template>

<script>
import Recorder from '../../media/recording/Recorder'
import { validateBackgroundImage } from '../../media/recording/BackgroundImage.js'
export default {
  props: { audioOnly: { type: Boolean, default: false } },
  data: () => ({ state: 'idle', error: '', devices: [], deviceId: '', facingMode: 'user', mirror: false, background: 'none', image: null, result: null, reviewUrl: '', seconds: 0 }),
  computed: {
    locked () { return ['preparing', 'recording', 'finalizing', 'review'].includes(this.state) },
    statusText () { return ({ idle: 'Ready to prepare.', preparing: 'Preparing… First-time effects may take a moment to download.', 'setup-error': 'Camera access is retained. Retry the preview or change the background. Cancel releases the camera.', preview: 'Preview ready. Settings are applied to the saved recording.', recording: 'Recording.', finalizing: 'Finishing your recording…', review: 'Review your clip, then submit your response below.' })[this.state] || '' }
  },
  mounted () { this.makeRecorder() },
  beforeDestroy () { this.recorder.dispose(); clearInterval(this.ticker); this.clearResult() },
  methods: {
    makeRecorder () { this.recorder = new Recorder(this.$refs.canvas, state => { this.state = state; this.$emit('busy', ['preparing', 'preview', 'setup-error', 'recording', 'finalizing'].includes(state)) }, error => { this.error = error.message }) },
    clearResult () { if (this.reviewUrl) URL.revokeObjectURL(this.reviewUrl); this.reviewUrl = ''; this.result = null; this.$emit('recorded', null) },
    async prepare () {
      this.error = ''
      try { this.devices = (await this.recorder.prepare({ deviceId: this.deviceId, facingMode: this.facingMode, mirror: this.mirror, background: this.background, image: this.image, audioOnly: this.audioOnly })) || this.devices } catch (error) { this.error = error.name === 'NotAllowedError' ? 'Camera or microphone permission was denied. Allow access in browser settings, then try again.' : error.message }
    },
    changed () { if (['preview', 'setup-error'].includes(this.state)) this.prepare() },
    switchCamera () { this.facingMode = this.facingMode === 'user' ? 'environment' : 'user'; this.deviceId = ''; this.changed() },
    selectImage (event) {
      const file = event.target.files[0]
      if (!file) return
      try { validateBackgroundImage(file) } catch (error) {
        this.image = null; this.error = error.message
        if (['preview', 'setup-error'].includes(this.state)) this.recorder.fail(error)
        event.target.value = ''
        return
      }
      this.error = ''; this.image = file; this.changed()
    },
    async start () {
      this.error = ''; this.seconds = 0
      try {
        const promise = this.recorder.start()
        this.ticker = setInterval(() => { this.seconds++ }, 1000)
        const result = await promise
        if (this.recorder.state === 'disposed') return
        this.result = result; this.reviewUrl = URL.createObjectURL(result.blob); this.$emit('recorded', result)
      } catch (error) { this.error = error.message } finally { clearInterval(this.ticker) }
    },
    stop () { this.recorder.stop() },
    cancel () { this.recorder.dispose(); clearInterval(this.ticker); this.clearResult(); this.makeRecorder(); this.state = 'idle'; this.$emit('busy', false) },
    retake () { if (window.confirm('Discard this take and record again?')) { this.cancel(); this.prepare() } }
  }
}
</script>

<style scoped>
.discuss-recorder { box-sizing: border-box; width: 100%; min-width: 0; max-width: 680px; padding: 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; overflow-wrap: anywhere; }
fieldset { min-width: 0; }
canvas, video { display: block; width: 100%; max-height: 60vh; object-fit: contain; background: #0f172a; border-radius: 8px; }
audio { width: 100%; }
label { display: block; margin: 10px 0; }
select, input[type=file] { box-sizing: border-box; display: block; width: 100%; min-width: 0; max-width: 100%; min-height: 44px; font-size: 16px; }
select { font: 16px system-ui; border: 1px solid #64748b; padding: 8px; }
.mirror { padding: 10px 0; }.mirror input { width: 20px; height: 20px; vertical-align: middle; }
.btn { min-height: 44px; margin: 4px 4px 4px 0; white-space: normal; }
.recorder-actions { display: flex; flex-wrap: wrap; }
</style>
