// ============================================================
// ui.js — The Control Panel
// ============================================================
// This file connects the HTML panel on the right side of the screen
// to the rest of the app. When you move a slider or press a button,
// this file detects it and tells main.js what changed.
//
// ui.js does NOT:
//   - Know anything about Three.js or Cannon-ES
//   - Create any 3D objects
//   - Run any physics
//
// ui.js ONLY:
//   - Reads HTML element values (sliders, checkboxes, color pickers)
//   - Calls methods on the App object (like app.setGravity())
//   - Updates text labels to show current values
//   - Builds the color palette swatches from config data
//
// QUICK TROUBLESHOOT:
//   Slider does nothing → id in HTML doesn't match _el('id') below
//   Button does nothing → event listener not wired, or app method missing
//   Swatches don't appear → PALETTES import failed, or palette-row id missing
//   Panel toggle broken → check CSS transition and collapsed class
// ============================================================

import { PALETTES } from './config.js'

export class UIManager {

  // ---------------------------------------------------------------
  // constructor(app) — Set up all event listeners
  // ---------------------------------------------------------------
  // app: the main App instance — we call methods on it when things change
  // ---------------------------------------------------------------
  constructor(app) {
    this.app = app
    this._collapsed = false  // tracks whether the side panel is collapsed

    this._bind()              // connect all controls to their handlers
    this._buildPaletteSwatches()  // generate color theme buttons from config
  }

  // ---------------------------------------------------------------
  // _el(id) — Shortcut to get an HTML element by its id
  // ---------------------------------------------------------------
  // Instead of writing document.getElementById('sensitivity') everywhere,
  // we write this._el('sensitivity'). Saves a lot of typing.
  //
  // TROUBLESHOOT: If a control doesn't work, add console.log(this._el('id'))
  // here temporarily to check if the element is being found.
  // ---------------------------------------------------------------
  _el(id) { return document.getElementById(id) }

  // ---------------------------------------------------------------
  // _bind() — Connect every control to a handler function
  // ---------------------------------------------------------------
  // Each "addEventListener" call says: "when THIS event happens on
  // THIS element, run THIS function."
  // ---------------------------------------------------------------
  _bind() {
    const app = this.app // shortcut reference

    // --- Panel Collapse Toggle -----------------------------------
    // The ▶/◀ button that hides/shows the panel.
    this._el('panel-toggle').addEventListener('click', () => this._togglePanel())

    // --- Input Mode Buttons (Mic / Click) -----------------------
    // When you click the mode buttons, switch the app's input mode.
    this._el('mic-mode-btn').addEventListener('click', () => this._setMode('microphone'))
    this._el('click-mode-btn').addEventListener('click', () => this._setMode('click'))

    // --- Microphone Start/Stop Button ---------------------------
    // This is "async" because starting the microphone takes time
    // (it has to wait for the user's permission popup).
    this._el('mic-toggle').addEventListener('click', async () => {
      if (!app.state.isListening) {
        // --- Turn mic ON ---
        // Call audio.start() and wait for it to finish.
        const ok = await app.audio.start()

        if (ok) {
          // Microphone started successfully.
          app.state.isListening = true
          this._el('mic-toggle').textContent = 'Stop Listening'
          this._el('mic-toggle').classList.add('active') // turns button green
        } else {
          // Permission denied or no microphone found.
          // The console will have the specific error from audio.js.
          this._el('mic-toggle').textContent = 'Mic unavailable'
        }
      } else {
        // --- Turn mic OFF ---
        app.audio.stop()         // stop the mic stream and clean up
        app.state.isListening = false
        this._el('mic-toggle').textContent = 'Start Listening'
        this._el('mic-toggle').classList.remove('active')
      }
    })

    // --- Sensitivity Slider ------------------------------------
    // Controls how loud a sound needs to be to trigger cube spawning.
    // Higher sensitivity = easier to trigger.
    const sensitivitySlider = this._el('sensitivity')
    const sensitivityVal = this._el('sensitivity-val')  // the number label next to slider

    sensitivitySlider.addEventListener('input', () => {
      const v = parseFloat(sensitivitySlider.value)  // read slider as decimal number
      app.state.sensitivity = v                       // update app state
      sensitivityVal.textContent = v.toFixed(1)       // show "1.0" not "1.000000"
    })
    // 'input' fires while dragging. 'change' only fires when you let go.
    // We use 'input' for live feedback.

    // --- Force Multiplier Slider --------------------------------
    // Controls how hard cubes fall. Higher = faster, more energetic drops.
    const forceSlider = this._el('force-mult')
    const forceVal = this._el('force-val')

    forceSlider.addEventListener('input', () => {
      const v = parseFloat(forceSlider.value)
      app.state.forceMultiplier = v
      forceVal.textContent = v.toFixed(1)
    })

    // --- Gravity Slider -----------------------------------------
    // Changes how strong gravity is for all physics bodies.
    // Also wakes up sleeping cubes so they respond immediately.
    const gravSlider = this._el('gravity')
    const gravVal = this._el('gravity-val')

    gravSlider.addEventListener('input', () => {
      const v = parseInt(gravSlider.value)  // gravity is always a whole number
      app.setGravity(v)     // calls PhysicsWorld.setGravity() + wakes bodies
      gravVal.textContent = v
    })

    // --- Surface Mode Buttons (Solid / Malleable) ---------------
    this._el('solid-btn').addEventListener('click', () => this._setSurface('solid'))
    this._el('malleable-btn').addEventListener('click', () => this._setSurface('malleable'))

    // --- Background Color Picker --------------------------------
    // An HTML color input (<input type="color">) fires 'input' as you drag
    // the color wheel — gives live preview of the background changing.
    this._el('bg-color').addEventListener('input', (e) => {
      app.setBackground(e.target.value)  // e.target.value = '#1a1a2e' format
    })

    // --- Reset Scene Button -------------------------------------
    // Removes all cubes and resets the platform to flat.
    this._el('reset-btn').addEventListener('click', () => app.resetScene())
  }

  // ---------------------------------------------------------------
  // _setMode(mode) — Switch between Microphone and Click mode
  // ---------------------------------------------------------------
  // Updates the app state AND updates the button visual (active = highlighted).
  // Also shows/hides the microphone controls section.
  // ---------------------------------------------------------------
  _setMode(mode) {
    app.setMode(mode)  // tell the app (stops mic if switching away from mic mode)

    // Toggle the 'active' CSS class on both buttons.
    // classList.toggle('active', condition) adds the class if condition is true,
    // removes it if condition is false.
    this._el('mic-mode-btn').classList.toggle('active', mode === 'microphone')
    this._el('click-mode-btn').classList.toggle('active', mode === 'click')

    // Show the mic controls section only in microphone mode.
    // 'block' = visible, 'none' = hidden.
    this._el('mic-controls').style.display = mode === 'microphone' ? 'block' : 'none'
  }

  // ---------------------------------------------------------------
  // _setSurface(mode) — Switch between Solid and Malleable surface
  // ---------------------------------------------------------------
  _setSurface(mode) {
    this.app.setSurfaceMode(mode)  // tell the app to rebuild the platform

    this._el('solid-btn').classList.toggle('active', mode === 'solid')
    this._el('malleable-btn').classList.toggle('active', mode === 'malleable')

    // Show the "drag to sculpt" hint only in malleable mode.
    const hint = this._el('malleable-hint')
    if (hint) hint.classList.toggle('hidden', mode !== 'malleable')
    // 'hidden' is a CSS class in style.css that sets display:none.
  }

  // ---------------------------------------------------------------
  // _buildPaletteSwatches() — Generate color theme buttons from config
  // ---------------------------------------------------------------
  // Instead of hardcoding buttons in HTML (which would need updating
  // every time a palette is added/removed), we generate them from
  // the PALETTES object in config.js.
  //
  // This is "data-driven UI" — the UI is generated from data.
  // To add a new palette, just add it to config.js. Done!
  // ---------------------------------------------------------------
  _buildPaletteSwatches() {
    const row = this._el('palette-row')  // the container div in HTML
    if (!row) return  // safety check — if element not found, skip silently

    // Object.entries(PALETTES) gives us [['neon', {...}], ['pastel', {...}], ...]
    // We loop through each palette and create one button for it.
    Object.entries(PALETTES).forEach(([key, pal]) => {

      // Create the outer button element.
      const btn = document.createElement('button')
      btn.className = 'swatch-btn'   // styled in style.css
      btn.title = pal.name           // tooltip on hover
      btn.dataset.palette = key      // stores 'neon', 'pastel', etc.

      // Create colored dots — one per color in the palette (up to 5).
      const dots = pal.preview.slice(0, 5).map(c => {
        const d = document.createElement('span')
        d.className = 'swatch-dot'   // small circle, styled in style.css
        d.style.background = c       // set dot color directly
        return d
      })
      dots.forEach(d => btn.appendChild(d))  // add dots inside the button

      // When clicked, tell the app to use this palette.
      btn.addEventListener('click', () => {
        this.app.setPalette(key)   // update app state (new cubes use this palette)

        // Visually deselect all other swatches, select this one.
        row.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('selected'))
        btn.classList.add('selected')
      })

      // If this palette is the current one, start it as selected.
      if (key === this.app.state.palette) btn.classList.add('selected')

      row.appendChild(btn)  // add this button to the palette row in the HTML
    })
  }

  // ---------------------------------------------------------------
  // _togglePanel() — Collapse or expand the side panel
  // ---------------------------------------------------------------
  // The panel slides right to collapse, revealing only the ▶ button.
  // Clicking ▶ slides it back left to expand.
  //
  // The animation is handled purely by CSS:
  //   #ui-panel { transition: transform 0.25s ease; }
  //   #ui-panel.collapsed { transform: translateX(calc(290px - 48px)); }
  //
  // TROUBLESHOOT: Button disappears when collapsed?
  //   The button must be first in the HTML (left edge of panel) so it
  //   stays visible when the panel slides right. See index.html panel-header.
  // ---------------------------------------------------------------
  _togglePanel() {
    this._collapsed = !this._collapsed  // flip the flag

    const panel = document.getElementById('ui-panel')
    const btn = this._el('panel-toggle')

    // Add or remove the 'collapsed' CSS class. CSS does the slide animation.
    panel.classList.toggle('collapsed', this._collapsed)

    // Update the arrow direction:
    // ▶ when expanded (click to collapse, which slides it rightward)
    // ◀ when collapsed (click to expand, which slides it leftward)
    btn.textContent = this._collapsed ? '◀' : '▶'
  }

  // ---------------------------------------------------------------
  // updatePerf(fps, cubeCount) — Refresh the performance display
  // ---------------------------------------------------------------
  // Called by main.js every 0.5 seconds (not every frame — the display
  // doesn't need to update 60 times per second to be useful).
  //
  // fps:       frames per second (calculated in main.js)
  // cubeCount: number of active cubes right now
  // ---------------------------------------------------------------
  updatePerf(fps, cubeCount) {
    const fpsEl = this._el('fps-display')
    const cubeEl = this._el('cube-count')

    if (fpsEl) {
      fpsEl.textContent = `FPS: ${fps}`

      // Color-code the FPS number based on how healthy it is:
      // Red    = struggling (< 30 fps)
      // Orange = OK but not great (30–44 fps)
      // Green  = smooth (45+ fps)
      fpsEl.style.color = fps < 30 ? '#ef5350' : fps < 45 ? '#ffb74d' : '#66bb6a'
    }

    if (cubeEl) cubeEl.textContent = `Cubes: ${cubeCount}`
  }

  // ---------------------------------------------------------------
  // updateSoundMeter(normLevel) — Update the sound level bar in the UI
  // ---------------------------------------------------------------
  // Called by main.js every ~33ms (about 30 times per second).
  // normLevel: 0.0 (silent) to 1.0 (very loud)
  //
  // Updates the width and color of the meter bar.
  // ---------------------------------------------------------------
  updateSoundMeter(normLevel) {
    const meter = this._el('sound-meter')
    if (!meter) return  // safety check

    // Convert 0–1 to a CSS percentage width (0% to 100%).
    const pct = Math.round(normLevel * 100)
    meter.style.width = pct + '%'

    // Color the bar based on level:
    // Green  = quiet sound
    // Orange = medium sound
    // Red    = very loud (near-trigger or triggered)
    meter.style.background = normLevel > 0.8
      ? '#ef5350'   // red — very loud
      : normLevel > 0.5
      ? '#ffb74d'   // orange — medium
      : '#66bb6a'   // green — quiet
  }
}
