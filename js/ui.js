import { PALETTES } from './config.js'

export class UIManager {
  constructor(app) {
    this.app = app
    this._collapsed = false
    this._bind()
    this._buildPaletteSwatches()
  }

  _el(id) { return document.getElementById(id) }

  _bind() {
    const app = this.app

    // Panel collapse toggle
    this._el('panel-toggle').addEventListener('click', () => this._togglePanel())

    // Mode buttons
    this._el('mic-mode-btn').addEventListener('click', () => this._setMode('microphone'))
    this._el('click-mode-btn').addEventListener('click', () => this._setMode('click'))

    // Mic start/stop
    this._el('mic-toggle').addEventListener('click', async () => {
      if (!app.state.isListening) {
        const ok = await app.audio.start()
        if (ok) {
          app.state.isListening = true
          this._el('mic-toggle').textContent = 'Stop Listening'
          this._el('mic-toggle').classList.add('active')
        } else {
          this._el('mic-toggle').textContent = 'Mic unavailable'
        }
      } else {
        app.audio.stop()
        app.state.isListening = false
        this._el('mic-toggle').textContent = 'Start Listening'
        this._el('mic-toggle').classList.remove('active')
      }
    })

    // Sensitivity slider
    const sensitivitySlider = this._el('sensitivity')
    const sensitivityVal = this._el('sensitivity-val')
    sensitivitySlider.addEventListener('input', () => {
      const v = parseFloat(sensitivitySlider.value)
      app.state.sensitivity = v
      sensitivityVal.textContent = v.toFixed(1)
    })

    // Force multiplier
    const forceSlider = this._el('force-mult')
    const forceVal = this._el('force-val')
    forceSlider.addEventListener('input', () => {
      const v = parseFloat(forceSlider.value)
      app.state.forceMultiplier = v
      forceVal.textContent = v.toFixed(1)
    })

    // Gravity
    const gravSlider = this._el('gravity')
    const gravVal = this._el('gravity-val')
    gravSlider.addEventListener('input', () => {
      const v = parseInt(gravSlider.value)
      app.setGravity(v)
      gravVal.textContent = v
    })

    // Surface buttons
    this._el('solid-btn').addEventListener('click', () => this._setSurface('solid'))
    this._el('malleable-btn').addEventListener('click', () => this._setSurface('malleable'))

    // Background color
    this._el('bg-color').addEventListener('input', (e) => {
      app.setBackground(e.target.value)
    })

    // Reset
    this._el('reset-btn').addEventListener('click', () => app.resetScene())
  }

  _setMode(mode) {
    this.app.setMode(mode)
    this._el('mic-mode-btn').classList.toggle('active', mode === 'microphone')
    this._el('click-mode-btn').classList.toggle('active', mode === 'click')
    this._el('mic-controls').style.display = mode === 'microphone' ? 'block' : 'none'
  }

  _setSurface(mode) {
    this.app.setSurfaceMode(mode)
    this._el('solid-btn').classList.toggle('active', mode === 'solid')
    this._el('malleable-btn').classList.toggle('active', mode === 'malleable')
    const hint = this._el('malleable-hint')
    if (hint) hint.classList.toggle('hidden', mode !== 'malleable')
  }

  _buildPaletteSwatches() {
    const row = this._el('palette-row')
    if (!row) return
    Object.entries(PALETTES).forEach(([key, pal]) => {
      const btn = document.createElement('button')
      btn.className = 'swatch-btn'
      btn.title = pal.name
      btn.dataset.palette = key
      const dots = pal.preview.slice(0, 5).map(c => {
        const d = document.createElement('span')
        d.className = 'swatch-dot'
        d.style.background = c
        return d
      })
      dots.forEach(d => btn.appendChild(d))
      btn.addEventListener('click', () => {
        this.app.setPalette(key)
        row.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('selected'))
        btn.classList.add('selected')
      })
      if (key === this.app.state.palette) btn.classList.add('selected')
      row.appendChild(btn)
    })
  }

  _togglePanel() {
    this._collapsed = !this._collapsed
    const panel = document.getElementById('ui-panel')
    const btn = this._el('panel-toggle')
    panel.classList.toggle('collapsed', this._collapsed)
    btn.textContent = this._collapsed ? '▶' : '◀'
  }

  // Called from main loop at ~2 fps
  updatePerf(fps, cubeCount) {
    const fpsEl = this._el('fps-display')
    const cubeEl = this._el('cube-count')
    if (fpsEl) {
      fpsEl.textContent = `FPS: ${fps}`
      fpsEl.style.color = fps < 30 ? '#ef5350' : fps < 45 ? '#ffb74d' : '#66bb6a'
    }
    if (cubeEl) cubeEl.textContent = `Cubes: ${cubeCount}`
  }

  // Called from main loop every frame for the meter
  updateSoundMeter(normLevel) {
    const meter = this._el('sound-meter')
    if (!meter) return
    const pct = Math.round(normLevel * 100)
    meter.style.width = pct + '%'
    meter.style.background = normLevel > 0.8
      ? '#ef5350'
      : normLevel > 0.5
      ? '#ffb74d'
      : '#66bb6a'
  }
}
