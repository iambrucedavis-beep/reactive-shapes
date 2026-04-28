import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'

// ─── Cannon-es Heightfield alignment notes ────────────────────────────────
// PlaneGeometry(W, D, segX, segZ) with mesh.rotation.x = -PI/2:
//   vertex (ix, iy) → world (ix*el - W/2, h, -D/2 + iy*el)
// Heightfield data[ix][k] after body.quaternion.setFromEuler(-PI/2,0,0):
//   → world (body.x + ix*el, h, body.z - k*el)
// Match by: body.x = -W/2, body.z = D/2, k = segZ - iy
// ─────────────────────────────────────────────────────────────────────────

const BRUSH_RADIUS = 1.8
const BRUSH_STRENGTH_UP = 0.06
const BRUSH_STRENGTH_DOWN = -0.06
const MAX_DEFORM = 2.2

export class Platform {
  constructor(scene, physicsWorld) {
    this.scene = scene
    this.phys = physicsWorld
    this.mode = 'solid'
    this.mesh = null
    this.body = null
    this.isDeforming = false
    this.lastRebuild = 0

    const { width, depth, elementSize } = CONFIG.platform
    this.width = width
    this.depth = depth
    this.elementSize = elementSize
    this.segX = Math.round(width / elementSize)
    this.segZ = Math.round(depth / elementSize)
    this.centerY = CONFIG.platform.topY - CONFIG.platform.thickness / 2

    // Flat 2D array of height values [ix][iy]
    this.heights = this._makeHeights()

    this._buildSolid()
  }

  _makeHeights() {
    const h = []
    for (let ix = 0; ix <= this.segX; ix++) {
      h[ix] = new Float32Array(this.segZ + 1)
    }
    return h
  }

  // ── Solid mode ──────────────────────────────────────────────────────────

  _buildSolid() {
    const { width, depth } = this
    const thick = CONFIG.platform.thickness
    const cy = this.centerY

    const geo = new THREE.BoxGeometry(width, thick, depth)
    const mat = new THREE.MeshPhongMaterial({
      color: 0x2d4a7a,
      shininess: 90,
      specular: new THREE.Color(0x334466),
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.position.set(0, cy, 0)
    this.mesh.receiveShadow = true
    this.scene.add(this.mesh)

    // BoxGeometry half-extents
    this.body = this.phys.addStaticBox(
      [width / 2, thick / 2, depth / 2],
      [0, cy, 0]
    )
  }

  _destroySolid() {
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh.material.dispose()
      this.mesh = null
    }
    if (this.body) {
      this.phys.world.removeBody(this.body)
      this.body = null
    }
  }

  // ── Malleable mode ──────────────────────────────────────────────────────

  _buildMalleable() {
    const { width, depth, segX, segZ } = this

    const geo = new THREE.PlaneGeometry(width, depth, segX, segZ)
    const mat = new THREE.MeshPhongMaterial({
      color: 0x2d4a7a,
      shininess: 40,
      specular: new THREE.Color(0x222244),
      side: THREE.DoubleSide,
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.set(0, CONFIG.platform.topY, 0)
    this.mesh.receiveShadow = true
    this.scene.add(this.mesh)

    this._applyHeightsToGeometry()
    this.body = this._buildHeightfieldBody()
  }

  _applyHeightsToGeometry() {
    const positions = this.mesh.geometry.attributes.position
    const { segX, segZ } = this
    for (let iy = 0; iy <= segZ; iy++) {
      for (let ix = 0; ix <= segX; ix++) {
        const idx = iy * (segX + 1) + ix
        positions.setZ(idx, this.heights[ix][iy])
      }
    }
    positions.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
  }

  _buildHeightfieldBody() {
    const { segX, segZ, elementSize, width, depth } = this

    // Build data matrix aligned to Three.js PlaneGeometry vertices
    const data = []
    for (let ix = 0; ix <= segX; ix++) {
      data[ix] = []
      for (let k = 0; k <= segZ; k++) {
        const iy = segZ - k
        data[ix][k] = this.heights[ix][iy]
      }
    }

    const quat = new CANNON.Quaternion()
    quat.setFromEuler(-Math.PI / 2, 0, 0)

    return this.phys.addHeightfield(
      data,
      elementSize,
      [-width / 2, CONFIG.platform.topY, depth / 2],
      quat
    )
  }

  _destroyMalleable() {
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh.material.dispose()
      this.mesh = null
    }
    if (this.body) {
      this.phys.world.removeBody(this.body)
      this.body = null
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  setMode(mode) {
    if (mode === this.mode) return
    if (this.mode === 'solid') this._destroySolid()
    else this._destroyMalleable()
    this.mode = mode
    if (mode === 'solid') this._buildSolid()
    else this._buildMalleable()
  }

  // Called from App on mouse events when mode === 'malleable'
  startDeform() { this.isDeforming = true }
  stopDeform() {
    this.isDeforming = false
    this._rebuildPhysics()
  }

  deformAt(worldPoint, button = 0) {
    if (this.mode !== 'malleable' || !this.mesh) return

    const strength = button === 2 ? BRUSH_STRENGTH_DOWN : BRUSH_STRENGTH_UP
    const { segX, segZ, elementSize, width, depth } = this
    const positions = this.mesh.geometry.attributes.position

    // mesh.position is (0, topY, 0), rotation is -PI/2 around X
    // vertex (ix, iy) world x = ix*el - width/2, world z = -depth/2 + iy*el
    const changed = []

    for (let iy = 0; iy <= segZ; iy++) {
      for (let ix = 0; ix <= segX; ix++) {
        const vx = ix * elementSize - width / 2
        const vz = -depth / 2 + iy * elementSize

        const dx = worldPoint.x - vx
        const dz = worldPoint.z - vz
        const distSq = dx * dx + dz * dz

        if (distSq < BRUSH_RADIUS * BRUSH_RADIUS) {
          const dist = Math.sqrt(distSq)
          const influence = ((1 - dist / BRUSH_RADIUS) ** 2) * strength
          const newH = Math.max(-MAX_DEFORM, Math.min(MAX_DEFORM, this.heights[ix][iy] + influence))
          this.heights[ix][iy] = newH
          const idx = iy * (segX + 1) + ix
          positions.setZ(idx, newH)
          changed.push(idx)
        }
      }
    }

    if (changed.length > 0) {
      positions.needsUpdate = true
      this.mesh.geometry.computeVertexNormals()
      // Throttle physics rebuild to max 5 fps during drag
      if (performance.now() - this.lastRebuild > 200) this._rebuildPhysics()
    }
  }

  _rebuildPhysics() {
    if (this.mode !== 'malleable') return
    if (this.body) this.phys.world.removeBody(this.body)
    this.body = this._buildHeightfieldBody()
    this.lastRebuild = performance.now()
  }

  reset() {
    const m = this.mode
    this.heights = this._makeHeights()
    if (m === 'solid') {
      // Nothing to reset visually for solid
    } else {
      this._destroyMalleable()
      this._buildMalleable()
    }
  }

  // Raycasting helper — returns intersection point on the platform mesh or null
  raycast(raycaster) {
    if (!this.mesh) return null
    const hits = raycaster.intersectObject(this.mesh)
    return hits.length > 0 ? hits[0].point : null
  }
}
