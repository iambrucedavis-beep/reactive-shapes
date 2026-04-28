import { CONFIG } from './config.js'

export class AudioManager {
  constructor() {
    this.analyser = null
    this.dataArray = null
    this.stream = null
    this.audioCtx = null
    this.isActive = false
    this.lastTriggerTime = 0
    this.currentLevel = 0
    this.smoothedLevel = 0
    this.onSound = null
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      this.audioCtx = new AudioContext()
      const source = this.audioCtx.createMediaStreamSource(this.stream)
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = CONFIG.audio.fftSize
      this.analyser.smoothingTimeConstant = CONFIG.audio.smoothing
      source.connect(this.analyser)
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
      this.isActive = true
      return true
    } catch (err) {
      console.warn('Microphone access failed:', err)
      return false
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
    }
    if (this.audioCtx) {
      this.audioCtx.close()
      this.audioCtx = null
    }
    this.analyser = null
    this.dataArray = null
    this.isActive = false
    this.currentLevel = 0
    this.smoothedLevel = 0
  }

  getRawLevel() {
    if (!this.analyser || !this.dataArray) return 0
    this.analyser.getByteFrequencyData(this.dataArray)
    let sum = 0
    for (let i = 0; i < this.dataArray.length; i++) sum += this.dataArray[i]
    return sum / this.dataArray.length
  }

  // Called every frame; fires onSound(intensity) when a trigger is detected.
  update(sensitivity) {
    if (!this.isActive) return

    const raw = this.getRawLevel()
    // Exponential moving average for smooth meter display
    this.smoothedLevel = this.smoothedLevel * 0.8 + raw * 0.2
    this.currentLevel = this.smoothedLevel

    const threshold = CONFIG.audio.threshold / Math.max(sensitivity, 0.1)
    const now = performance.now()

    if (raw > threshold && now - this.lastTriggerTime > CONFIG.audio.cooldown) {
      this.lastTriggerTime = now
      const intensity = Math.min(raw / 80, 1.0)
      if (this.onSound) this.onSound(intensity)
    }
  }

  // Normalised 0–1 level for the UI meter
  getNormalisedLevel() {
    return Math.min(this.currentLevel / 60, 1.0)
  }
}
