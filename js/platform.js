// ============================================================
// platform.js — The Table
// ============================================================
// This file builds and manages the floating platform that cubes
// land on. It has two completely different modes:
//
//   SOLID MODE:
//     - Visual: a BoxGeometry (a solid 3D box with visible depth)
//     - Physics: a simple static Box body
//     - Simple and fast. Cubes land on it and stack up.
//
//   MALLEABLE MODE:
//     - Visual: a PlaneGeometry with many grid points you can push
//     - Physics: a Heightfield (a bumpy terrain shape)
//     - More complex. Dragging sculpts the surface.
//     - The hard part: making the physics bumps match the visual bumps exactly.
//
// QUICK TROUBLESHOOT:
//   Platform invisible → check scene.add(this.mesh) is called in _buildSolid/_buildMalleable
//   Cubes fall through malleable surface → Heightfield alignment issue; see notes below
//   Deformation is laggy → raise CONFIG.platform.elementSize to 1.0
//   Switching modes crashes → check _destroySolid/_destroyMalleable dispose geometry
// ============================================================

import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'

// ============================================================
// HEIGHTFIELD ALIGNMENT — The Hardest Part of This Whole Project
// ============================================================
// Three.js PlaneGeometry and Cannon-ES Heightfield use different
// coordinate conventions. Here's what we figured out:
//
// Three.js PlaneGeometry(W, D, segX, segZ) after mesh.rotation.x = -PI/2:
//   Vertex at grid point (ix, iy) is at WORLD position:
//     world_x = ix * elementSize - width/2
//     world_z = -depth/2 + iy * elementSize
//     world_y = local_z (the deformation height we store)
//
// Cannon-ES Heightfield after body.quaternion.setFromEuler(-PI/2, 0, 0):
//   data[ix][k] corresponds to WORLD position:
//     world_x = body.position.x + ix * elementSize
//     world_z = body.position.z - k * elementSize  ← NOTE: k goes BACKWARDS
//
// To make them match, we need:
//   body.position.x = -width/2
//   body.position.z = +depth/2
//   data[ix][k] = heights[ix][segZ - k]   ← REVERSED INDEX (k → segZ-k)
//
// WHY REVERSED? Three.js iy=0 is the far edge (negative Z).
//              Cannon k=0 is the far edge too — but after rotation,
//              Cannon's local Y flips, so the direction is opposite.
//              Reversing k corrects for this.
//              Without the reversal, the physics terrain is a mirror of the visual.
// ============================================================

// Brush settings for malleable mode.
const BRUSH_RADIUS = 1.8     // how wide the deformation brush is (world units)
const BRUSH_STRENGTH_UP = 0.06    // how much to push up per frame (left click)
const BRUSH_STRENGTH_DOWN = -0.06 // how much to push down per frame (right click)
const MAX_DEFORM = 2.2       // maximum height above or below flat (prevents extreme spikes)

export class Platform {

  // ---------------------------------------------------------------
  // constructor(scene, physicsWorld)
  // ---------------------------------------------------------------
  constructor(scene, physicsWorld) {
    this.scene = scene         // the Three.js scene to add the mesh to
    this.phys = physicsWorld   // the PhysicsWorld wrapper to add the body to

    this.mode = 'solid'    // current mode: 'solid' or 'malleable'
    this.mesh = null       // the Three.js mesh (what you see)
    this.body = null       // the Cannon-ES physics body (invisible collision shape)

    this.isDeforming = false  // true while the user is dragging in malleable mode
    this.lastRebuild = 0      // timestamp of the last physics body rebuild (for throttling)

    // Pull platform dimensions from config for easy reference throughout the class.
    const { width, depth, elementSize } = CONFIG.platform
    this.width = width
    this.depth = depth
    this.elementSize = elementSize

    // Calculate grid size from dimensions and element size.
    // segX = how many grid columns (left-right)
    // segZ = how many grid rows    (front-back)
    // Math.round handles any floating point imprecision in the division.
    this.segX = Math.round(width / elementSize)   // e.g., 12 / 0.5 = 24
    this.segZ = Math.round(depth / elementSize)   // e.g.,  8 / 0.5 = 16

    // centerY = the Y position of the CENTER of the box (for solid mode).
    // topY is the surface (0). The box center is half a thickness below the surface.
    this.centerY = CONFIG.platform.topY - CONFIG.platform.thickness / 2
    // e.g., topY=0, thickness=0.6 → centerY = 0 - 0.3 = -0.3

    // heights[ix][iy] = the deformation amount at grid point (ix, iy).
    // All zeros initially = flat surface.
    // Used only in malleable mode; solid mode ignores this.
    this.heights = this._makeHeights()

    // Build the initial solid platform.
    this._buildSolid()
  }

  // ---------------------------------------------------------------
  // _makeHeights() — Create a flat 2D grid of height values (all zero)
  // ---------------------------------------------------------------
  // Returns a 2D array: heights[ix][iy] for every grid point.
  // Float32Array stores 32-bit floating point numbers — more memory
  // efficient than a regular JavaScript array for this use case.
  // ---------------------------------------------------------------
  _makeHeights() {
    const h = []
    for (let ix = 0; ix <= this.segX; ix++) {
      // +1 because segX is the number of SEGMENTS, but we need segX+1 POINTS.
      // (Like a fence: 3 gaps between posts need 4 posts.)
      h[ix] = new Float32Array(this.segZ + 1)
      // Float32Array initializes to all zeros automatically — perfect for a flat surface.
    }
    return h
  }

  // ==============================================================
  // SOLID MODE
  // ==============================================================

  // ---------------------------------------------------------------
  // _buildSolid() — Create the solid box platform
  // ---------------------------------------------------------------
  _buildSolid() {
    const { width, depth } = this
    const thick = CONFIG.platform.thickness  // how tall the box is
    const cy = this.centerY                  // Y position of the box center

    // --- Visual mesh ---
    // BoxGeometry gives the platform visible depth (you can see the sides).
    const geo = new THREE.BoxGeometry(width, thick, depth)

    const mat = new THREE.MeshPhongMaterial({
      color: 0x2d4a7a,   // dark slate blue
      shininess: 90,     // fairly shiny top surface
      specular: new THREE.Color(0x334466),  // the color of the shine highlight
    })

    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.position.set(0, cy, 0) // center it at (0, centerY, 0)
    this.mesh.receiveShadow = true   // cubes cast shadows onto the platform
    this.scene.add(this.mesh)        // add to scene so it's drawn

    // --- Physics body ---
    // halfExtents = half the size in each direction (Cannon's convention).
    // mass = 0 → static body, never moves.
    this.body = this.phys.addStaticBox(
      [width / 2, thick / 2, depth / 2],  // half-extents
      [0, cy, 0]                           // position matches the mesh
    )
  }

  // ---------------------------------------------------------------
  // _destroySolid() — Remove the solid platform (before switching modes)
  // ---------------------------------------------------------------
  // Always call dispose() when removing Three.js objects to free GPU memory.
  // ---------------------------------------------------------------
  _destroySolid() {
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.geometry.dispose() // free GPU vertex data
      this.mesh.material.dispose() // free GPU material data
      this.mesh = null
    }
    if (this.body) {
      this.phys.world.removeBody(this.body) // remove from physics simulation
      this.body = null
    }
  }

  // ==============================================================
  // MALLEABLE MODE
  // ==============================================================

  // ---------------------------------------------------------------
  // _buildMalleable() — Create the deformable surface
  // ---------------------------------------------------------------
  // Uses a PlaneGeometry with many grid points. The user can push
  // individual grid points up or down to sculpt the surface.
  // ---------------------------------------------------------------
  _buildMalleable() {
    const { width, depth, segX, segZ } = this

    // PlaneGeometry creates a flat grid in the local XY plane.
    // Parameters: (width, height, widthSegments, heightSegments)
    // "height" here is depth (front-to-back) — we rotate it horizontal below.
    const geo = new THREE.PlaneGeometry(width, depth, segX, segZ)

    const mat = new THREE.MeshPhongMaterial({
      color: 0x2d4a7a,  // same blue as solid mode
      shininess: 40,    // less shiny (bumpy surface diffuses light)
      specular: new THREE.Color(0x222244),
      side: THREE.DoubleSide,
      // DoubleSide = visible from both top AND bottom of the surface.
      // Needed because deformation can create overhangs where you see the underside.
    })

    this.mesh = new THREE.Mesh(geo, mat)

    // Rotate the plane from vertical (default) to horizontal (flat).
    // -PI/2 radians = -90 degrees around the X axis.
    // After rotation: local Z (depth) becomes world Y (height/deformation).
    this.mesh.rotation.x = -Math.PI / 2

    this.mesh.position.set(0, CONFIG.platform.topY, 0) // flat at Y=0
    this.mesh.receiveShadow = true
    this.scene.add(this.mesh)

    // Apply any existing heights (relevant after a mode switch if heights were saved).
    this._applyHeightsToGeometry()

    // Create the matching physics body.
    this.body = this._buildHeightfieldBody()
  }

  // ---------------------------------------------------------------
  // _applyHeightsToGeometry() — Write this.heights into the mesh vertices
  // ---------------------------------------------------------------
  // The PlaneGeometry has a "position" buffer attribute — an array of
  // (x, y, z) for every vertex. For deformation, we modify the Z
  // component (which becomes world Y after the -90° rotation).
  // ---------------------------------------------------------------
  _applyHeightsToGeometry() {
    const positions = this.mesh.geometry.attributes.position
    // positions is a BufferAttribute — a flat array of numbers managed by Three.js.
    // Use .setZ(index, value) to set the Z component of a specific vertex.

    const { segX, segZ } = this

    for (let iy = 0; iy <= segZ; iy++) {
      for (let ix = 0; ix <= segX; ix++) {
        // Calculate the flat index in the position buffer.
        // Three.js stores vertices row by row, left to right.
        // Row iy, column ix → index = iy * (segX+1) + ix
        const idx = iy * (segX + 1) + ix

        // Set the Z component (= deformation height, becomes world Y after rotation).
        positions.setZ(idx, this.heights[ix][iy])
      }
    }

    // Tell Three.js we changed the position data — it must re-upload to GPU.
    positions.needsUpdate = true

    // Recalculate normals so lighting looks correct on the bumpy surface.
    // Normals are the "which way does this face point" vectors used for lighting.
    // Without this, the deformed surface still looks lit like a flat plane.
    this.mesh.geometry.computeVertexNormals()
  }

  // ---------------------------------------------------------------
  // _buildHeightfieldBody() — Create the physics collision body
  // ---------------------------------------------------------------
  // Builds a CANNON.Heightfield that matches the visual mesh.
  // See the alignment notes at the top of this file for the math.
  // ---------------------------------------------------------------
  _buildHeightfieldBody() {
    const { segX, segZ, elementSize, width, depth } = this

    // Build the data matrix for Cannon's Heightfield.
    // data[ix][k] = height at that grid point.
    // k is REVERSED relative to Three.js iy (see alignment notes above).
    const data = []
    for (let ix = 0; ix <= segX; ix++) {
      data[ix] = []
      for (let k = 0; k <= segZ; k++) {
        const iy = segZ - k    // ← THE REVERSAL: k=0 maps to iy=segZ, k=segZ maps to iy=0
        data[ix][k] = this.heights[ix][iy]
      }
    }

    // Create a quaternion (rotation) of -90° around the X axis.
    // This tilts the Heightfield from its default vertical orientation to horizontal.
    const quat = new CANNON.Quaternion()
    quat.setFromEuler(-Math.PI / 2, 0, 0)

    // Position: (-width/2, topY, +depth/2) — see alignment notes for why.
    // The leftward and forward offsets align the cannon grid with the three.js grid.
    return this.phys.addHeightfield(
      data,
      elementSize,
      [-width / 2, CONFIG.platform.topY, depth / 2],
      quat
    )
  }

  // ---------------------------------------------------------------
  // _destroyMalleable() — Remove the malleable platform
  // ---------------------------------------------------------------
  _destroyMalleable() {
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.geometry.dispose() // free the many vertices of the plane grid
      this.mesh.material.dispose()
      this.mesh = null
    }
    if (this.body) {
      this.phys.world.removeBody(this.body)
      this.body = null
    }
  }

  // ==============================================================
  // PUBLIC API — methods called from main.js and ui.js
  // ==============================================================

  // ---------------------------------------------------------------
  // setMode(mode) — Switch between 'solid' and 'malleable'
  // ---------------------------------------------------------------
  // Destroys the current platform and builds the new one from scratch.
  // This is safe to call at any time.
  // ---------------------------------------------------------------
  setMode(mode) {
    if (mode === this.mode) return // already in this mode, nothing to do

    // Tear down the current platform.
    if (this.mode === 'solid') this._destroySolid()
    else this._destroyMalleable()

    this.mode = mode

    // Build the new one.
    if (mode === 'solid') this._buildSolid()
    else this._buildMalleable()
  }

  // ---------------------------------------------------------------
  // startDeform() / stopDeform() — Mouse button down/up for sculpting
  // ---------------------------------------------------------------
  startDeform() {
    this.isDeforming = true
    // isDeforming tells main.js's _onMouseMove to keep calling deformAt().
  }

  stopDeform() {
    this.isDeforming = false
    // Rebuild physics immediately on mouse release so cubes respond
    // to the final shape (during drag we only rebuild every 200ms).
    this._rebuildPhysics()
  }

  // ---------------------------------------------------------------
  // deformAt(worldPoint, button) — Push the surface at a world position
  // ---------------------------------------------------------------
  // worldPoint: THREE.Vector3 — where the user is touching the surface
  // button:     0 = left click (push up), 2 = right click (push down)
  //
  // Algorithm:
  //   For every grid vertex within BRUSH_RADIUS of worldPoint,
  //   push it up or down by an amount that falls off with distance.
  //   Vertices at the center of the brush move the most.
  //   Vertices at the edge of the brush move the least.
  // ---------------------------------------------------------------
  deformAt(worldPoint, button = 0) {
    if (this.mode !== 'malleable' || !this.mesh) return

    // strength is positive (push up) or negative (push down).
    const strength = button === 2 ? BRUSH_STRENGTH_DOWN : BRUSH_STRENGTH_UP

    const { segX, segZ, elementSize, width, depth } = this
    const positions = this.mesh.geometry.attributes.position

    const changed = [] // track which vertices changed (for the needsUpdate check)

    for (let iy = 0; iy <= segZ; iy++) {
      for (let ix = 0; ix <= segX; ix++) {

        // Calculate the WORLD position of this vertex.
        // (After mesh.rotation.x = -PI/2, local x→world x, local y→world -z)
        const vx = ix * elementSize - width / 2        // world X of this vertex
        const vz = -depth / 2 + iy * elementSize       // world Z of this vertex

        // Horizontal distance from the brush center to this vertex.
        const dx = worldPoint.x - vx
        const dz = worldPoint.z - vz
        const distSq = dx * dx + dz * dz  // squared distance (faster than sqrt)

        // Only affect vertices within the brush radius.
        if (distSq < BRUSH_RADIUS * BRUSH_RADIUS) {
          const dist = Math.sqrt(distSq) // actual distance (safe to compute now)

          // Quadratic falloff: center gets full influence, edge gets zero.
          // (1 - dist/radius)² creates a smooth dome-shaped brush.
          // Linear falloff (no ²) would feel harsh and create ridges.
          const influence = ((1 - dist / BRUSH_RADIUS) ** 2) * strength

          // Clamp height to prevent extreme spikes or pits.
          const newH = Math.max(-MAX_DEFORM, Math.min(MAX_DEFORM, this.heights[ix][iy] + influence))

          this.heights[ix][iy] = newH    // save in our heights array
          const idx = iy * (segX + 1) + ix
          positions.setZ(idx, newH)      // update the vertex in the geometry
          changed.push(idx)
        }
      }
    }

    if (changed.length > 0) {
      positions.needsUpdate = true               // tell Three.js to re-upload to GPU
      this.mesh.geometry.computeVertexNormals()  // recalculate lighting normals

      // Throttle physics rebuild: max 5 rebuilds per second during drag.
      // Rebuilding every frame would be ~60 times per second — too expensive.
      // 200ms between rebuilds = 5 rebuilds/sec = physics feels responsive enough.
      // TROUBLESHOOT: Physics lags behind visual? Lower this to 100.
      // TROUBLESHOOT: Deformation is choppy? Raise this to 500.
      if (performance.now() - this.lastRebuild > 200) this._rebuildPhysics()
    }
  }

  // ---------------------------------------------------------------
  // _rebuildPhysics() — Recreate the Heightfield body from current heights
  // ---------------------------------------------------------------
  // Called after deformation stops (stopDeform) or periodically during drag.
  // We must remove the old body and create a new one — Cannon doesn't support
  // modifying a Heightfield shape in place.
  // ---------------------------------------------------------------
  _rebuildPhysics() {
    if (this.mode !== 'malleable') return

    if (this.body) this.phys.world.removeBody(this.body) // remove old body

    this.body = this._buildHeightfieldBody() // create new one from current heights

    this.lastRebuild = performance.now() // record when we last rebuilt
  }

  // ---------------------------------------------------------------
  // reset() — Flatten the surface back to zero (called by Reset Scene)
  // ---------------------------------------------------------------
  reset() {
    this.heights = this._makeHeights() // reset all heights to zero

    if (this.mode === 'malleable') {
      // Rebuild the visual and physics from the now-flat heights.
      this._destroyMalleable()
      this._buildMalleable()
    }
    // In solid mode there's nothing to reset — the box is always flat.
  }

  // ---------------------------------------------------------------
  // raycast(raycaster) — Find where the mouse ray hits the platform
  // ---------------------------------------------------------------
  // Returns: THREE.Vector3 (world position of the hit), or null if no hit.
  // Used by main.js to find where to deform or where a click landed.
  // ---------------------------------------------------------------
  raycast(raycaster) {
    if (!this.mesh) return null

    // intersectObject sends the ray through the scene and checks if it
    // hits this.mesh. Returns an array of hits, sorted closest first.
    const hits = raycaster.intersectObject(this.mesh)

    // hits[0].point = the exact 3D world position where the ray touched the mesh.
    return hits.length > 0 ? hits[0].point : null
  }
}
