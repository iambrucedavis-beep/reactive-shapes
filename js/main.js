import * as THREE from 'three'
import { CONFIG } from './config.js'
import { AudioManager } from './audio.js'
import { PhysicsWorld } from './physics.js'
import { SceneRenderer } from './renderer.js'
import { Platform } from './platform.js'
import { CubeManager } from './cubes.js'
import { UIManager } from './ui.js'

class App {
  constructor() {
    this.state = {
      mode: 'microphone',       // 'microphone' | 'click'
      surfaceMode: 'solid',     // 'solid' | 'malleable'
      sensitivity: 1.0,
      forceMultiplier: 1.5,
      palette: 'neon',
      bgColor: '#1a1a2e',
      gravity: CONFIG.physics.gravity,
      isListening: false,
    }

    this._lastTime = performance.now()
    this._fpsWindow = []
    this._perfUpdateTimer = 0
    this._meterUpdateTimer = 0

    this._raycaster = new THREE.Raycaster()
    this._mouse = new THREE.Vector2()

    this._init()
  }

  _init() {
    const container = document.getElementById('canvas-container')

    this.renderer = new SceneRenderer(container, this.state.bgColor)
    this.physics = new PhysicsWorld(this.state.gravity)
    this.platform = new Platform(this.renderer.scene, this.physics)
    this.cubes = new CubeManager(this.renderer.scene, this.physics)
    this.audio = new AudioManager()
    this.audio.onSound = (intensity) => this._onSound(intensity)

    this.ui = new UIManager(this)

    this._bindCanvasEvents()
    this._loop()
  }

  // ── Event handling ─────────────────────────────────────────────────────

  _bindCanvasEvents() {
    const el = this.renderer.domElement

    el.addEventListener('mousedown', (e) => this._onMouseDown(e))
    el.addEventListener('mousemove', (e) => this._onMouseMove(e))
    el.addEventListener('mouseup', (e) => this._onMouseUp(e))
    el.addEventListener('contextmenu', (e) => e.preventDefault())

    el.addEventListener('touchstart', (e) => {
      const t = e.touches[0]
      this._onMouseDown({ clientX: t.clientX, clientY: t.clientY, button: 0 })
    }, { passive: true })
    el.addEventListener('touchmove', (e) => {
      const t = e.touches[0]
      this._onMouseMove({ clientX: t.clientX, clientY: t.clientY })
    }, { passive: true })
    el.addEventListener('touchend', () => this._onMouseUp({ button: 0 }))
  }

  _updateMouseNDC(clientX, clientY) {
    this._mouse.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    )
  }

  _getRayHitOnPlatformPlane(y = CONFIG.platform.topY) {
    this._raycaster.setFromCamera(this._mouse, this.renderer.camera)
    const hits = this._raycaster.intersectObject(this.renderer.clickPlane)
    return hits.length > 0 ? hits[0].point : null
  }

  _onMouseDown(e) {
    this._updateMouseNDC(e.clientX, e.clientY)

    if (this.state.surfaceMode === 'malleable') {
      this.platform.startDeform()
      this._raycaster.setFromCamera(this._mouse, this.renderer.camera)
      const pt = this.platform.raycast(this._raycaster)
        ?? this._getRayHitOnPlatformPlane()
      if (pt) this.platform.deformAt(pt, e.button)
      return
    }

    if (this.state.mode === 'click') {
      const pt = this._getRayHitOnPlatformPlane()
      const xOff = pt ? pt.x : 0
      this._triggerClickSpawn(xOff, pt)
    }
  }

  _onMouseMove(e) {
    this._updateMouseNDC(e.clientX, e.clientY)

    if (this.state.surfaceMode === 'malleable' && this.platform.isDeforming) {
      this._raycaster.setFromCamera(this._mouse, this.renderer.camera)
      const pt = this.platform.raycast(this._raycaster)
        ?? this._getRayHitOnPlatformPlane()
      if (pt) this.platform.deformAt(pt, 0)
    }
  }

  _onMouseUp(e) {
    if (this.state.surfaceMode === 'malleable' && this.platform.isDeforming) {
      this.platform.stopDeform()
    }
  }

  _triggerClickSpawn(xOff, hitPoint) {
    const intensity = 0.75
    this._spawnGroup(intensity, xOff)
    if (hitPoint) {
      this.physics.applyShockwave(hitPoint, 8, this.state.forceMultiplier * 14)
    }
  }

  _onSound(intensity) {
    if (this.state.mode !== 'microphone') return
    this._spawnGroup(intensity, 0)
  }

  _spawnGroup(intensity, xOff = 0) {
    const { groupSizeMin, groupSizeMax } = CONFIG.spawn
    const count = Math.max(1, Math.round(groupSizeMin + (groupSizeMax - groupSizeMin) * intensity))
    const force = Math.max(4, intensity * this.state.forceMultiplier * 14)
    this.cubes.spawnGroup(count, xOff, this.state.palette, force)
  }

  // ── Public API called by UIManager ────────────────────────────────────

  setMode(mode) {
    if (mode !== 'microphone' && this.state.isListening) {
      this.audio.stop()
      this.state.isListening = false
      document.getElementById('mic-toggle').textContent = 'Start Listening'
      document.getElementById('mic-toggle').classList.remove('active')
    }
    this.state.mode = mode
  }

  setSurfaceMode(mode) {
    this.state.surfaceMode = mode
    this.platform.setMode(mode)
  }

  setGravity(value) {
    this.state.gravity = value
    this.physics.setGravity(value)
  }

  setBackground(color) {
    this.state.bgColor = color
    this.renderer.setBackground(color)
  }

  setPalette(name) {
    this.state.palette = name
  }

  resetScene() {
    this.cubes.removeAll()
    this.platform.reset()
  }

  // ── Main loop ─────────────────────────────────────────────────────────

  _loop() {
    requestAnimationFrame(() => this._loop())

    const now = performance.now()
    const dt = Math.min((now - this._lastTime) / 1000, 0.05)
    this._lastTime = now

    // FPS tracking
    this._fpsWindow.push(dt)
    if (this._fpsWindow.length > CONFIG.performance.fpsWindowSize) this._fpsWindow.shift()

    // Audio
    if (this.state.mode === 'microphone' && this.state.isListening) {
      this.audio.update(this.state.sensitivity)
    }

    // Physics step
    this.physics.step(dt)

    // Sync meshes
    this.cubes.update(dt)

    // Render
    this.renderer.render()

    // Performance management: remove oldest cube if over budget
    const avgDt = this._fpsWindow.reduce((a, b) => a + b, 0) / this._fpsWindow.length
    const fps = 1 / avgDt
    if (
      (fps < CONFIG.performance.targetFPS && this.cubes.count > 10) ||
      this.cubes.count > CONFIG.cubes.maxCount
    ) {
      this.cubes.removeOldest(1)
    }

    // UI updates (throttled)
    this._perfUpdateTimer += dt
    if (this._perfUpdateTimer > 0.5) {
      this._perfUpdateTimer = 0
      this.ui.updatePerf(Math.round(fps), this.cubes.count)
    }
    this._meterUpdateTimer += dt
    if (this._meterUpdateTimer > 0.033) {
      this._meterUpdateTimer = 0
      this.ui.updateSoundMeter(this.audio.getNormalisedLevel())
    }
  }
}

// Expose for dev console debugging
window.__app = new App()
