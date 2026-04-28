// ============================================================
// main.js — The Brain (App Orchestrator)
// ============================================================
// This is the most important file. It:
//   1. Creates every other system (renderer, physics, audio, etc.)
//   2. Connects them together (wires audio → spawning, UI → state)
//   3. Handles mouse/touch input from the canvas
//   4. Runs the main loop — the heartbeat that makes everything move
//   5. Manages performance by removing cubes when things slow down
//
// Think of main.js as the "director" of a play. The other files are
// specialists (lighting, sound, physics) who only do their own job.
// The director coordinates everyone.
//
// READING ORDER: Start at the bottom (new App()) and work upward.
// The app creates itself, then the constructor calls _init(),
// which creates everything, which then starts the loop.
//
// QUICK TROUBLESHOOT:
//   Black screen on load → check console for import errors
//   Nothing responds to input → check _bindCanvasEvents was called
//   Cubes not spawning from mic → check audio.onSound callback is set
//   FPS drops → check performance management in _loop()
// ============================================================

import * as THREE from 'three'
import { CONFIG } from './config.js'
import { AudioManager } from './audio.js'
import { PhysicsWorld } from './physics.js'
import { SceneRenderer } from './renderer.js'
import { Platform } from './platform.js'
import { CubeManager } from './cubes.js'
import { UIManager } from './ui.js'

class App {

  // ---------------------------------------------------------------
  // constructor — Initialize all state, then kick everything off
  // ---------------------------------------------------------------
  constructor() {

    // --- App State -----------------------------------------------
    // One central object that holds everything the app "currently is."
    // Any part of the app that needs to know the current mode,
    // sensitivity, etc., reads from this.state.
    //
    // WHY ONE STATE OBJECT? It's easy to log for debugging:
    //   console.log(window.__app.state)
    // shows you the full picture of what the app thinks is happening.
    this.state = {
      mode: 'microphone',    // 'microphone' = mic triggers cubes
                             // 'click'      = mouse click triggers cubes
      surfaceMode: 'solid',  // 'solid'     = rigid box platform
                             // 'malleable' = deformable terrain platform
      sensitivity: 1.0,      // 0.2–4.0: how easily the mic triggers (from slider)
      forceMultiplier: 1.5,  // 0.5–5.0: how hard cubes fall (from slider)
      palette: 'neon',       // which color theme to use for new cubes
      bgColor: '#1a1a2e',    // dark navy — starting background color
      gravity: CONFIG.physics.gravity,  // starts at -20 (from config)
      isListening: false,    // true only when mic permission was granted and running
    }

    // --- Loop Timing Variables -----------------------------------
    this._lastTime = performance.now()
    // Used to calculate delta time (how long since last frame).
    // performance.now() gives time in milliseconds with sub-ms precision.

    this._fpsWindow = []
    // Rolling list of recent frame times (up to fpsWindowSize entries).
    // We average these to get a smooth FPS reading.

    this._perfUpdateTimer = 0
    // Counts up each frame. When it passes 0.5 seconds, we update the
    // FPS display in the UI (no need to update it 60 times per second).

    this._meterUpdateTimer = 0
    // Same idea for the sound level meter. Updates ~30 times per second.

    // --- Raycasting Tools ----------------------------------------
    // Used to convert mouse screen position → 3D world position.
    // See _updateMouseNDC() and _getRayHitOnPlatformPlane() below.
    this._raycaster = new THREE.Raycaster()
    // A raycaster shoots an invisible ray into the 3D scene and finds what it hits.

    this._mouse = new THREE.Vector2()
    // Stores the current mouse position in Normalized Device Coordinates (NDC).
    // NDC: (-1,-1) = bottom-left of screen, (+1,+1) = top-right.

    // --- Start Everything ----------------------------------------
    this._init()
  }

  // ---------------------------------------------------------------
  // _init() — Create all systems and connect them together
  // ---------------------------------------------------------------
  // ORDER MATTERS HERE:
  //   renderer must exist before platform or cubes (they add to its scene)
  //   physics must exist before platform or cubes (they add bodies to it)
  //   platform and cubes need both renderer and physics
  //   audio and ui are independent of each other
  // ---------------------------------------------------------------
  _init() {
    // Find the <div id="canvas-container"> in the HTML.
    // This is where the Three.js canvas will be inserted.
    const container = document.getElementById('canvas-container')
    // TROUBLESHOOT: If container is null, the id in index.html is wrong.

    // Create the 3D scene, camera, lights, and renderer.
    this.renderer = new SceneRenderer(container, this.state.bgColor)

    // Create the physics simulation world with starting gravity.
    this.physics = new PhysicsWorld(this.state.gravity)

    // Create the platform (adds itself to the scene and physics world).
    this.platform = new Platform(this.renderer.scene, this.physics)

    // Create the cube manager (manages spawning, tracking, and removing cubes).
    this.cubes = new CubeManager(this.renderer.scene, this.physics)

    // Create the audio manager (handles the microphone).
    this.audio = new AudioManager()

    // Connect audio events to cube spawning.
    // When AudioManager detects a sound, it calls this callback with intensity (0–1).
    this.audio.onSound = (intensity) => this._onSound(intensity)
    // The arrow function is needed so 'this' inside _onSound refers to App,
    // not to the AudioManager that called it.

    // Create the UI manager (connects HTML controls to app state).
    this.ui = new UIManager(this)

    // Start listening for mouse and touch events on the canvas.
    this._bindCanvasEvents()

    // Start the main loop — this runs forever until the page is closed.
    this._loop()
  }

  // ==============================================================
  // EVENT HANDLING — Mouse, Touch, and Click
  // ==============================================================

  // ---------------------------------------------------------------
  // _bindCanvasEvents() — Attach mouse and touch listeners to the canvas
  // ---------------------------------------------------------------
  // We listen on the renderer's canvas element (the <canvas> tag),
  // NOT on the whole document. This way clicks on the UI panel
  // don't accidentally trigger cube spawning.
  // ---------------------------------------------------------------
  _bindCanvasEvents() {
    const el = this.renderer.domElement  // the actual <canvas> HTML element

    el.addEventListener('mousedown', (e) => this._onMouseDown(e))
    el.addEventListener('mousemove', (e) => this._onMouseMove(e))
    el.addEventListener('mouseup',   (e) => this._onMouseUp(e))

    // Prevent the right-click context menu so right-drag can push surface down.
    el.addEventListener('contextmenu', (e) => e.preventDefault())

    // Touch events (mobile support). We fake them as mouse events with button=0.
    // touches[0] = the first finger touching the screen.
    el.addEventListener('touchstart', (e) => {
      const t = e.touches[0]
      this._onMouseDown({ clientX: t.clientX, clientY: t.clientY, button: 0 })
    }, { passive: true })
    // passive: true tells the browser we won't call preventDefault() here,
    // which lets it handle scrolling faster.

    el.addEventListener('touchmove', (e) => {
      const t = e.touches[0]
      this._onMouseMove({ clientX: t.clientX, clientY: t.clientY })
    }, { passive: true })

    el.addEventListener('touchend', () => this._onMouseUp({ button: 0 }))
  }

  // ---------------------------------------------------------------
  // _updateMouseNDC(clientX, clientY) — Convert pixels to NDC
  // ---------------------------------------------------------------
  // The browser gives mouse positions in pixels (e.g., x=847, y=392).
  // Three.js raycasting needs Normalized Device Coordinates (NDC):
  //   X: -1 (left edge) to +1 (right edge)
  //   Y: -1 (bottom) to +1 (top) — NOTE: Y is FLIPPED from pixels!
  //
  // Formula:
  //   ndcX = (pixelX / screenWidth)  × 2 - 1     → -1 to +1
  //   ndcY = (pixelY / screenHeight) × -2 + 1    → +1 to -1 (flipped)
  //
  // WHY FLIPPED? Browser pixels start at top-left (y=0 at top).
  //              NDC starts at bottom-left (y=0 at center, y=1 at top).
  // ---------------------------------------------------------------
  _updateMouseNDC(clientX, clientY) {
    this._mouse.set(
      (clientX / window.innerWidth)  *  2 - 1,   // X: pixels → NDC
      (clientY / window.innerHeight) * -2 + 1    // Y: pixels → NDC (flipped)
    )
  }

  // ---------------------------------------------------------------
  // _getRayHitOnPlatformPlane() — Find where the mouse ray hits the platform level
  // ---------------------------------------------------------------
  // Sends a ray from the camera through the mouse position.
  // Checks where it hits the invisible click plane (a flat surface at Y=0).
  // Returns a THREE.Vector3 (3D world position) or null if missed.
  //
  // This is how we convert a 2D screen click into a 3D world position.
  // ---------------------------------------------------------------
  _getRayHitOnPlatformPlane() {
    // Set the raycaster direction based on current mouse position.
    this._raycaster.setFromCamera(this._mouse, this.renderer.camera)

    // Check for intersection with the invisible horizontal plane.
    const hits = this._raycaster.intersectObject(this.renderer.clickPlane)

    // hits[0].point is the exact 3D world coordinate of the intersection.
    return hits.length > 0 ? hits[0].point : null
  }

  // ---------------------------------------------------------------
  // _onMouseDown(e) — Handle click / drag start
  // ---------------------------------------------------------------
  // Two different behaviors depending on current mode:
  //   MALLEABLE surface → start sculpting
  //   CLICK mode        → spawn cubes + shockwave
  // ---------------------------------------------------------------
  _onMouseDown(e) {
    this._updateMouseNDC(e.clientX, e.clientY)  // update NDC mouse position first

    if (this.state.surfaceMode === 'malleable') {
      // --- Sculpt mode: start deforming the surface ---
      this.platform.startDeform()  // set isDeforming = true

      // Find where on the platform surface the user clicked.
      // Try the actual mesh first (more accurate), fall back to the flat plane.
      this._raycaster.setFromCamera(this._mouse, this.renderer.camera)
      const pt = this.platform.raycast(this._raycaster)
        ?? this._getRayHitOnPlatformPlane()
      // The ?? is the "nullish coalescing" operator: if left side is null, use right side.

      if (pt) this.platform.deformAt(pt, e.button)
      // e.button: 0 = left mouse (push up), 2 = right mouse (push down)

      return  // don't fall through to click mode spawning
    }

    if (this.state.mode === 'click') {
      // --- Click mode: spawn cubes and shockwave ---
      const pt = this._getRayHitOnPlatformPlane()
      const xOff = pt ? pt.x : 0  // horizontal offset for spawn position
      this._triggerClickSpawn(xOff, pt)
    }
  }

  // ---------------------------------------------------------------
  // _onMouseMove(e) — Handle mouse drag
  // ---------------------------------------------------------------
  // In malleable mode, dragging continues to deform the surface.
  // isDeforming is set to true by startDeform() and false by stopDeform().
  // ---------------------------------------------------------------
  _onMouseMove(e) {
    this._updateMouseNDC(e.clientX, e.clientY)

    if (this.state.surfaceMode === 'malleable' && this.platform.isDeforming) {
      this._raycaster.setFromCamera(this._mouse, this.renderer.camera)
      const pt = this.platform.raycast(this._raycaster)
        ?? this._getRayHitOnPlatformPlane()
      if (pt) this.platform.deformAt(pt, 0)  // 0 = left mouse (push up) during drag
    }
  }

  // ---------------------------------------------------------------
  // _onMouseUp(e) — Handle mouse button release
  // ---------------------------------------------------------------
  _onMouseUp(e) {
    if (this.state.surfaceMode === 'malleable' && this.platform.isDeforming) {
      // Stop deforming. This also triggers an immediate physics body rebuild
      // so the collision surface matches the final visual shape.
      this.platform.stopDeform()
    }
  }

  // ---------------------------------------------------------------
  // _triggerClickSpawn(xOff, hitPoint) — Spawn cubes from a click
  // ---------------------------------------------------------------
  // xOff:     horizontal offset for spawn position (where you clicked)
  // hitPoint: 3D world position of the click (for the shockwave)
  // ---------------------------------------------------------------
  _triggerClickSpawn(xOff, hitPoint) {
    const intensity = 0.75  // clicks always trigger a "medium-loud" spawn
    this._spawnGroup(intensity, xOff)

    if (hitPoint) {
      // Apply a shockwave outward from the click point.
      // radius = 8 world units, force = forceMultiplier × 14
      this.physics.applyShockwave(hitPoint, 8, this.state.forceMultiplier * 14)
    }
  }

  // ---------------------------------------------------------------
  // _onSound(intensity) — Called by AudioManager when a sound triggers
  // ---------------------------------------------------------------
  // intensity: 0.0 (quiet) to 1.0 (loud)
  // Only spawns if we're actually in microphone mode (guard check).
  // ---------------------------------------------------------------
  _onSound(intensity) {
    if (this.state.mode !== 'microphone') return  // ignore if in click mode
    this._spawnGroup(intensity, 0)  // xOff=0: spawn at center
  }

  // ---------------------------------------------------------------
  // _spawnGroup(intensity, xOff) — Calculate and trigger a cube group
  // ---------------------------------------------------------------
  // Converts 0–1 intensity into a cube count and fall force,
  // then passes those to CubeManager.
  // ---------------------------------------------------------------
  _spawnGroup(intensity, xOff = 0) {
    const { groupSizeMin, groupSizeMax } = CONFIG.spawn

    // Map intensity (0–1) to a cube count (groupSizeMin to groupSizeMax).
    // intensity=0 → groupSizeMin cubes (e.g., 3)
    // intensity=1 → groupSizeMax cubes (e.g., 8)
    const count = Math.max(1, Math.round(groupSizeMin + (groupSizeMax - groupSizeMin) * intensity))

    // Map intensity + forceMultiplier to a downward speed.
    // Math.max(4, ...) ensures a minimum force so cubes always actually fall.
    const force = Math.max(4, intensity * this.state.forceMultiplier * 14)

    this.cubes.spawnGroup(count, xOff, this.state.palette, force)
  }

  // ==============================================================
  // PUBLIC API — Methods called by UIManager
  // ==============================================================
  // These exist so ui.js can trigger app changes without needing to
  // know the internal details of each system.

  // ---------------------------------------------------------------
  // setMode(mode) — Switch between microphone and click input modes
  // ---------------------------------------------------------------
  setMode(mode) {
    // If switching away from microphone mode while the mic is on, stop it.
    if (mode !== 'microphone' && this.state.isListening) {
      this.audio.stop()
      this.state.isListening = false
      // Also update the button text so it doesn't say "Stop Listening"
      // when the mic is no longer active.
      document.getElementById('mic-toggle').textContent = 'Start Listening'
      document.getElementById('mic-toggle').classList.remove('active')
    }
    this.state.mode = mode
  }

  // ---------------------------------------------------------------
  // setSurfaceMode(mode) — Switch between solid and malleable platform
  // ---------------------------------------------------------------
  setSurfaceMode(mode) {
    this.state.surfaceMode = mode
    this.platform.setMode(mode)  // Platform class handles the actual rebuild
  }

  // ---------------------------------------------------------------
  // setGravity(value) — Change gravity strength
  // ---------------------------------------------------------------
  setGravity(value) {
    this.state.gravity = value
    this.physics.setGravity(value)  // PhysicsWorld handles the Cannon update + wakeup
  }

  // ---------------------------------------------------------------
  // setBackground(color) — Change the scene background and fog color
  // ---------------------------------------------------------------
  setBackground(color) {
    this.state.bgColor = color
    this.renderer.setBackground(color)  // SceneRenderer handles the Three.js update
  }

  // ---------------------------------------------------------------
  // setPalette(name) — Set the color palette for new cubes
  // ---------------------------------------------------------------
  setPalette(name) {
    this.state.palette = name
    // Existing cubes keep their colors. Only NEW cubes use the new palette.
    // If you want to recolor existing cubes: call this.cubes.recolor(name)
  }

  // ---------------------------------------------------------------
  // resetScene() — Remove all cubes and flatten the platform
  // ---------------------------------------------------------------
  resetScene() {
    this.cubes.removeAll()    // delete every cube instantly
    this.platform.reset()    // flatten the surface back to zero
  }

  // ==============================================================
  // THE MAIN LOOP — The Heartbeat of the Application
  // ==============================================================

  // ---------------------------------------------------------------
  // _loop() — Runs once per screen refresh (60–120 times per second)
  // ---------------------------------------------------------------
  // requestAnimationFrame() tells the browser "call this function
  // before drawing the next screen frame." The browser handles the
  // timing — we don't use setInterval or setTimeout for animation.
  //
  // ORDER IS IMPORTANT:
  //   1. Calculate dt (time since last frame)
  //   2. Check microphone (may trigger spawn)
  //   3. Step physics (moves all bodies)
  //   4. Sync meshes to bodies (update what you see)
  //   5. Render (draw to screen)
  //   6. Performance check (remove cubes if needed)
  //   7. Update UI displays (fps, cube count, sound meter)
  //
  // Physics runs BEFORE render so you always see the latest positions.
  // ---------------------------------------------------------------
  _loop() {
    // Schedule the next call FIRST, at the top of the function.
    // This way even if an error occurs below, the loop keeps running.
    requestAnimationFrame(() => this._loop())

    // --- 1. Calculate Delta Time ---------------------------------
    const now = performance.now()
    let dt = (now - this._lastTime) / 1000  // convert ms → seconds
    this._lastTime = now

    // Cap dt at 50ms (0.05 seconds = 20fps minimum).
    // If a frame takes longer (e.g., tab was in background), don't try to
    // "catch up" all at once — that would cause a huge physics jump.
    // This is called preventing the "spiral of death."
    dt = Math.min(dt, 0.05)

    // Track recent frame times for FPS calculation.
    this._fpsWindow.push(dt)
    // Remove the oldest entry if we have more than fpsWindowSize entries.
    if (this._fpsWindow.length > CONFIG.performance.fpsWindowSize) this._fpsWindow.shift()
    // .shift() removes and returns the first (oldest) element.

    // --- 2. Check Microphone ------------------------------------
    // Only process audio if mic mode is active AND the mic is running.
    if (this.state.mode === 'microphone' && this.state.isListening) {
      // This reads the mic volume and fires onSound() if loud enough.
      this.audio.update(this.state.sensitivity)
    }

    // --- 3. Step Physics ----------------------------------------
    // Move all physics bodies forward by dt seconds.
    // Cubes fall, collide, rotate, and settle during this call.
    this.physics.step(dt)

    // --- 4. Sync Meshes to Physics Bodies -----------------------
    // Copy each body's position/rotation into its matching Three.js mesh.
    // Also handles the removal animation (shrink to zero) for dying cubes.
    this.cubes.update(dt)

    // --- 5. Render to Screen ------------------------------------
    // Draw everything in the scene from the camera's point of view.
    this.renderer.render()

    // --- 6. Performance Management ------------------------------
    // Calculate current FPS from the rolling window of frame times.
    const avgDt = this._fpsWindow.reduce((a, b) => a + b, 0) / this._fpsWindow.length
    // .reduce adds all values in the array together, then divide by count = average.
    const fps = 1 / avgDt  // FPS = 1 / average seconds per frame

    // If performance drops OR we have too many cubes, remove the oldest one.
    // We check BOTH conditions: fps check alone would let cubes pile up
    // on a fast computer; count check alone would remove cubes even on 120fps.
    if (
      (fps < CONFIG.performance.targetFPS && this.cubes.count > 10) ||
      this.cubes.count > CONFIG.cubes.maxCount
    ) {
      this.cubes.removeOldest(1)  // remove one cube per frame — gradual, invisible
    }

    // --- 7. Update UI (throttled) --------------------------------
    // FPS and cube count: update every 0.5 seconds.
    this._perfUpdateTimer += dt
    if (this._perfUpdateTimer > 0.5) {
      this._perfUpdateTimer = 0
      this.ui.updatePerf(Math.round(fps), this.cubes.count)
    }

    // Sound meter: update every ~33ms (about 30 times per second).
    // The meter doesn't need to update as fast as the frame rate.
    this._meterUpdateTimer += dt
    if (this._meterUpdateTimer > 0.033) {
      this._meterUpdateTimer = 0
      this.ui.updateSoundMeter(this.audio.getNormalisedLevel())
    }
  }
}

// ============================================================
// START THE APP
// ============================================================
// Create one instance of App. Everything starts from here.
// The constructor calls _init() which creates all systems and
// starts the loop.
//
// window.__app makes the app accessible from the browser console:
//   window.__app.state        → see current state
//   window.__app.cubes.count  → see cube count
//   window.__app._spawnGroup(1, 0) → manually spawn cubes
//   window.__app.resetScene() → reset from console
//
// This is incredibly useful for debugging without changing the code!
// ============================================================
window.__app = new App()
