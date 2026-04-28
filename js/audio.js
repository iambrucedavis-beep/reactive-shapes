// ============================================================
// audio.js — The Ear
// ============================================================
// This file handles everything to do with the microphone.
// It asks for permission, listens to sound, measures how loud
// it is, smooths out the reading so it's not jumpy, and fires
// a callback (onSound) when something is loud enough to trigger
// a cube spawn.
//
// It does NOT know anything about cubes, physics, or Three.js.
// It just measures sound and reports loudness. That separation
// keeps this file simple and easy to debug on its own.
//
// QUICK TROUBLESHOOT:
//   Cubes never spawn? → Check browser console for mic errors.
//   Cubes spawn in silence? → Raise CONFIG.audio.threshold.
//   Meter shows 0 always? → The AudioContext might be suspended.
// ============================================================

import { CONFIG } from './config.js'

export class AudioManager {
  constructor() {
    // --- Internal state -------------------------------------------
    // All of these start as null/false because the mic isn't running yet.
    // They get filled in when start() is called.

    this.analyser = null
    // The Web Audio "analyser node" — the thing that actually measures
    // the sound frequencies. Think of it like the display bars on a
    // stereo equaliser.

    this.dataArray = null
    // A fixed-size array that holds the current frequency readings.
    // Updated every frame by getRawLevel().

    this.stream = null
    // The raw audio stream coming from the microphone hardware.
    // We need to keep a reference to it so we can stop it cleanly.

    this.audioCtx = null
    // The "AudioContext" — the root of the Web Audio API.
    // Everything in Web Audio lives inside a context.

    this.isActive = false
    // True only when the mic is running and we should be checking volume.
    // Guards against calling audio functions when the mic is stopped.

    this.lastTriggerTime = 0
    // The timestamp (in ms) of the most recent cube spawn trigger.
    // Used to enforce the cooldown — prevents triggering 20 times per second.

    this.currentLevel = 0
    // The smoothed volume reading that gets shown in the UI meter.
    // Updated every frame. Range: 0 to ~80 (roughly).

    this.smoothedLevel = 0
    // The internal exponential moving average used to calculate currentLevel.
    // This is kept separate so the math is clear.

    this.onSound = null
    // A callback function set by main.js:
    //   this.audio.onSound = (intensity) => { /* spawn cubes */ }
    // When sound triggers, we call this with a 0–1 intensity value.
    // If null, nothing happens (safe to leave unset during testing).
  }

  // ---------------------------------------------------------------
  // start() — Turn on the microphone
  // ---------------------------------------------------------------
  // This is "async" because asking the user for mic permission takes
  // time — we have to wait for the browser's permission popup.
  // Returns true if successful, false if something went wrong.
  //
  // TROUBLESHOOT:
  //   Returns false → check console for the error message.
  //   Common errors:
  //     "NotAllowedError" → user denied mic permission
  //     "NotFoundError"   → no microphone detected
  //     "SecurityError"   → page must be served over HTTPS or localhost
  // ---------------------------------------------------------------
  async start() {
    try {
      // Ask the browser for access to the microphone.
      // { audio: true, video: false } = we want audio only, no camera.
      // This is what triggers the "allow microphone" popup in the browser.
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })

      // Create the audio processing graph.
      // AudioContext = the engine that processes audio in the browser.
      this.audioCtx = new AudioContext()

      // Wrap the microphone stream so the audio engine can use it.
      const source = this.audioCtx.createMediaStreamSource(this.stream)

      // Create the analyser — this is what measures frequency data.
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = CONFIG.audio.fftSize
      // fftSize controls how many frequency buckets we get.
      // 256 → 128 usable buckets. More buckets = more detail, more CPU.

      this.analyser.smoothingTimeConstant = CONFIG.audio.smoothing
      // Built-in smoothing so the analyser output doesn't jump wildly.
      // 0 = no smoothing, 1 = never changes. 0.85 is a good middle ground.

      // Connect microphone → analyser (but NOT to speakers — no feedback!).
      source.connect(this.analyser)

      // Create the array that will hold frequency readings.
      // frequencyBinCount = fftSize / 2 = 128 slots, each 0–255.
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)

      this.isActive = true
      return true // success!

    } catch (err) {
      // Something went wrong. Log it so the developer can see why.
      // The UI will show "Mic unavailable" if this returns false.
      console.warn('Microphone access failed:', err)
      return false
    }
  }

  // ---------------------------------------------------------------
  // stop() — Turn off the microphone cleanly
  // ---------------------------------------------------------------
  // Important: we must stop each audio track individually.
  // Just closing the context is not enough — the mic light on laptops
  // stays on if we don't call track.stop().
  // ---------------------------------------------------------------
  stop() {
    if (this.stream) {
      // Stop each individual audio track (usually just one: the mic).
      // This is what turns off the "mic active" indicator in the browser.
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
    }

    if (this.audioCtx) {
      // Close the audio engine. Frees up system audio resources.
      this.audioCtx.close()
      this.audioCtx = null
    }

    // Reset everything to null/zero so start() can be called again cleanly.
    this.analyser = null
    this.dataArray = null
    this.isActive = false
    this.currentLevel = 0
    this.smoothedLevel = 0
  }

  // ---------------------------------------------------------------
  // getRawLevel() — Read the current microphone volume (0 to ~255)
  // ---------------------------------------------------------------
  // Fills dataArray with the latest frequency readings from the analyser,
  // then averages all buckets into a single "loudness" number.
  //
  // This is called every frame from update().
  // ---------------------------------------------------------------
  getRawLevel() {
    // Safety check: if the analyser doesn't exist, return silence.
    if (!this.analyser || !this.dataArray) return 0

    // Ask the analyser for the latest frequency data.
    // This fills this.dataArray with 128 values (each 0–255).
    // 0 = that frequency is silent. 255 = that frequency is maxed out.
    this.analyser.getByteFrequencyData(this.dataArray)

    // Average all 128 frequency buckets into one number.
    // We don't care which frequency is loudest — just overall loudness.
    let sum = 0
    for (let i = 0; i < this.dataArray.length; i++) sum += this.dataArray[i]
    return sum / this.dataArray.length
    // Result is typically 0–60 in a normal room.
    // Loud music/clapping might push it to 80–100.
  }

  // ---------------------------------------------------------------
  // update(sensitivity) — Called every frame from main.js
  // ---------------------------------------------------------------
  // This is the main workhorse. It:
  //   1. Gets the raw volume
  //   2. Smooths it for the UI meter
  //   3. Checks if it crossed the threshold
  //   4. Fires onSound() if enough time has passed
  //
  // sensitivity is 0.2–4.0 from the UI slider (default 1.0).
  // Higher sensitivity = lower effective threshold = triggers easier.
  // ---------------------------------------------------------------
  update(sensitivity) {
    // Don't do anything if the mic isn't running.
    if (!this.isActive) return

    // Get the current raw loudness (0–255, usually 0–80 in practice).
    const raw = this.getRawLevel()

    // Smooth the level using an exponential moving average (EMA).
    // Formula: newSmoothed = (old × 0.8) + (new × 0.2)
    // This means: 80% of the previous reading + 20% of the new reading.
    // Effect: the value reacts to changes but doesn't jump around.
    // Imagine a dial that turns slowly toward the real value each frame.
    this.smoothedLevel = this.smoothedLevel * 0.8 + raw * 0.2
    this.currentLevel = this.smoothedLevel // expose for the UI meter

    // Calculate the effective threshold based on sensitivity.
    // sensitivity = 1.0 → threshold stays the same (e.g., 14)
    // sensitivity = 2.0 → threshold is halved (e.g., 7) → triggers easier
    // sensitivity = 0.5 → threshold is doubled (e.g., 28) → harder to trigger
    const threshold = CONFIG.audio.threshold / Math.max(sensitivity, 0.1)
    // Math.max(..., 0.1) prevents divide-by-zero if sensitivity is 0.

    const now = performance.now() // current time in milliseconds

    // Trigger a spawn if:
    //   1. The RAW (unsmoothed) level is above threshold — we use raw here
    //      because smoothedLevel would be too slow to react to a sharp clap.
    //   2. Enough time has passed since the last trigger (cooldown).
    if (raw > threshold && now - this.lastTriggerTime > CONFIG.audio.cooldown) {
      this.lastTriggerTime = now // reset the cooldown timer

      // Convert loudness to a 0–1 intensity value.
      // raw=80 → intensity=1.0 (full intensity, spawn max cubes)
      // raw=14 → intensity=0.175 (quiet, spawn few cubes)
      const intensity = Math.min(raw / 80, 1.0)

      // Fire the callback. main.js uses this to spawn cubes.
      if (this.onSound) this.onSound(intensity)
    }
  }

  // ---------------------------------------------------------------
  // getNormalisedLevel() — Returns 0.0 to 1.0 for the UI sound meter
  // ---------------------------------------------------------------
  // Converts the internal level (0–80 range roughly) to a 0–1 range
  // for easy use by the UI bar: 0 = empty, 1 = full.
  // ---------------------------------------------------------------
  getNormalisedLevel() {
    return Math.min(this.currentLevel / 60, 1.0)
    // Dividing by 60 means "a very loud sound fills the meter."
    // TROUBLESHOOT: Meter always maxed out? Raise 60 to 100.
    // TROUBLESHOOT: Meter barely moves? Lower 60 to 30.
  }
}
