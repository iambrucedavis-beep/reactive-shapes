// ============================================================
// cubes.js — The Cubes
// ============================================================
// This file handles everything about the falling cubes:
//   - Creating them (each cube = a visible mesh + invisible physics body)
//   - Tracking them in a list
//   - Syncing the mesh position to the physics body every frame
//   - Removing them smoothly when they fall off or need to be cleaned up
//
// KEY CONCEPT: Each cube is TWO separate objects that live in sync:
//   THREE.Mesh  → what you see on screen (the colorful box)
//   CANNON.Body → what the physics engine simulates (invisible box)
//   Every frame, we copy the body's position/rotation into the mesh.
//
// QUICK TROUBLESHOOT:
//   Cubes don't fall → physics body might not have been created.
//   Cubes float → initial velocity direction might be wrong (check vy sign).
//   Cubes never disappear → FALL_DEATH_Y might be too low, or _queueRemove broken.
//   App gets slower over time → material.dispose() might not be called.
// ============================================================

import * as THREE from 'three'
import { CONFIG, PALETTES } from './config.js'

// How long the "shrink and disappear" animation takes (in seconds).
// 0.4 = cubes shrink to nothing over 0.4 seconds. Feels smooth and natural.
// Too fast = jarring pop. Too slow = cubes linger on screen too long.
const REMOVE_DURATION = 0.4

// Cubes below this Y position are considered "fallen off" and get deleted.
// Y = 0 is the platform surface, so -25 is well below where the player
// can see. Cubes fall here after sliding off the platform edge.
// TROUBLESHOOT: Cubes disappear while still on platform? Raise this to -50.
const FALL_DEATH_Y = -25

// ---------------------------------------------------------------
// Geometry Cache — Reuse box shapes instead of recreating them
// ---------------------------------------------------------------
// Creating a BoxGeometry allocates memory for all its triangle vertices.
// If we spawned 150 cubes and each had a unique geometry, we'd allocate
// 150 separate sets of vertices on the GPU.
//
// Instead, cubes of the same size share one geometry object.
// The cache maps size (as a string like "0.45") to a BoxGeometry.
//
// Think of it like a cookie cutter: make one, use it for every cookie
// of that size. You don't carve a new cutter for each cookie.
// ---------------------------------------------------------------
const geoCache = new Map()

function getCubeGeo(size) {
  // Round to 2 decimal places to create consistent cache keys.
  // 0.4499999 and 0.45 would otherwise create two different cache entries.
  const key = size.toFixed(2)

  if (!geoCache.has(key)) {
    // First time we've needed this size — create and store it.
    geoCache.set(key, new THREE.BoxGeometry(size, size, size))
  }

  return geoCache.get(key)
}

// ---------------------------------------------------------------
// Helper: pick a random number between min and max
// ---------------------------------------------------------------
function randomInRange(min, max) {
  return min + Math.random() * (max - min)
  // Math.random() gives 0.0–1.0, so multiplying by (max-min) gives 0–range,
  // then adding min shifts it into the correct range.
}

// ---------------------------------------------------------------
// Helper: pick a random color from the named palette
// ---------------------------------------------------------------
function pickColor(paletteName) {
  const pal = PALETTES[paletteName] || PALETTES.neon
  // If the palette name is invalid (e.g., a typo), fall back to neon.
  return pal.colors[Math.floor(Math.random() * pal.colors.length)]
  // Math.floor(...) converts a decimal index to a whole number.
}

// ---------------------------------------------------------------
// CubeEntry — Data bundle for one cube
// ---------------------------------------------------------------
// Instead of keeping two separate arrays (one for meshes, one for bodies),
// we bundle everything about one cube into a single CubeEntry object.
// This makes the code cleaner and less error-prone.
// ---------------------------------------------------------------
class CubeEntry {
  constructor(mesh, body, size) {
    this.mesh = mesh          // the Three.js visible shape
    this.body = body          // the Cannon-ES physics body
    this.size = size          // the cube's side length (for reference)
    this.createdAt = performance.now()  // timestamp — used to find "oldest" cube
    this.removing = false     // true when the cube is in the shrink-and-delete phase
    this.removeTimer = 0      // counts up during removal (0 → REMOVE_DURATION)
  }
}

// ---------------------------------------------------------------
// CubeManager — The main class
// ---------------------------------------------------------------
export class CubeManager {
  constructor(scene, physicsWorld) {
    this.scene = scene          // reference to the Three.js scene
    this.phys = physicsWorld    // reference to our PhysicsWorld wrapper
    this.entries = []           // array of CubeEntry objects (our cube list)
    this.lastSpawnTime = 0      // timestamp of the last spawn (for cooldown)
  }

  // Shortcut: get current cube count from the entries array length.
  get count() { return this.entries.length }

  // ---------------------------------------------------------------
  // spawnGroup(...) — Create a batch of cubes at once
  // ---------------------------------------------------------------
  // count:         how many cubes to create in this group
  // xOffset:       horizontal offset for click-mode (0 = center)
  // paletteName:   which color palette to pick colors from
  // downwardForce: how fast cubes fall (higher = harder drop)
  //
  // The cooldown check prevents two groups from spawning in the same
  // instant (e.g., if the mic triggers twice very quickly).
  // ---------------------------------------------------------------
  spawnGroup(count, xOffset = 0, paletteName = 'neon', downwardForce = 10) {
    const now = performance.now()

    // Enforce cooldown — don't spawn if too soon after the last group.
    if (now - this.lastSpawnTime < CONFIG.spawn.cooldown) return
    this.lastSpawnTime = now

    const spread = CONFIG.spawn.spread       // how wide the spawn area is
    const spawnY = CONFIG.spawn.height       // how high up cubes appear

    for (let i = 0; i < count; i++) {

      // Random size for each cube in the group.
      const size = randomInRange(CONFIG.cubes.sizeMin, CONFIG.cubes.sizeMax)

      // Random starting position within the spawn area.
      const px = xOffset + randomInRange(-spread / 2, spread / 2) // left-right
      const py = spawnY + randomInRange(0, count * 0.3)            // slight height variation
      const pz = randomInRange(-2, 2)                              // front-back

      // Random initial velocity so cubes don't all fall straight down.
      const vx = randomInRange(-1, 1)   // slight left-right drift
      const vy = -Math.abs(downwardForce) * randomInRange(0.6, 1.0)
      // vy is NEGATIVE because Y is up — falling = negative Y velocity.
      // Math.abs ensures it's always downward even if the force slider is misused.
      const vz = randomInRange(-0.5, 0.5)  // slight front-back drift

      const color = pickColor(paletteName)
      this._spawnOne(size, [px, py, pz], [vx, vy, vz], color)
    }
  }

  // ---------------------------------------------------------------
  // _spawnOne(...) — Create a single cube
  // ---------------------------------------------------------------
  // Internal method called by spawnGroup for each individual cube.
  // Creates both the visual mesh AND the physics body.
  // ---------------------------------------------------------------
  _spawnOne(size, position, velocity, color) {

    // --- Visual side (Three.js) ---

    // Get or create the geometry for this size (see geoCache above).
    const geo = getCubeGeo(size)

    // Create a unique material for each cube so they can have different colors.
    // (We do NOT cache materials — they must be unique per cube for individual color.)
    const mat = new THREE.MeshPhongMaterial({
      color,                                       // the main color of the cube
      shininess: 60 + Math.random() * 60,          // random amount of shine (60–120)
      specular: new THREE.Color(0x444444),         // the color of the shine highlight
      emissive: new THREE.Color(color).multiplyScalar(0.08),
      // emissive = the cube glows slightly in its own color.
      // multiplyScalar(0.08) = 8% brightness — subtle, not neon-glow level.
    })

    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true      // this cube casts shadows onto other surfaces
    mesh.receiveShadow = true   // this cube receives shadows from other cubes

    // Give the cube a random starting rotation so it looks like it was
    // tossed into the air rather than neatly aligned to the grid.
    mesh.rotation.set(
      Math.random() * Math.PI, // random X rotation (0 to 180°)
      Math.random() * Math.PI, // random Y rotation
      Math.random() * Math.PI  // random Z rotation
    )

    // Add the mesh to the 3D scene so it appears on screen.
    this.scene.add(mesh)

    // --- Physics side (Cannon-ES) ---

    // Create the invisible physics body using our PhysicsWorld wrapper.
    // halfSize = size / 2 because Cannon uses half-extents.
    const body = this.phys.addCube(size / 2, position, velocity)

    // Add random spin so the cube tumbles while falling.
    // Without this, cubes would fall perfectly upright — looks unnatural.
    body.angularVelocity.set(
      randomInRange(-2, 2), // spin around X axis (tumble forward/back)
      randomInRange(-2, 2), // spin around Y axis (rotate left/right)
      randomInRange(-2, 2)  // spin around Z axis (roll sideways)
    )

    // Bundle mesh + body together and add to our tracking list.
    this.entries.push(new CubeEntry(mesh, body, size))
  }

  // ---------------------------------------------------------------
  // update(dt) — Called every frame from main.js
  // ---------------------------------------------------------------
  // dt = delta time (seconds since last frame)
  //
  // This method does two things for each cube:
  //   ALIVE: Copy physics body position/rotation → mesh (keep them in sync)
  //   REMOVING: Shrink the mesh toward zero scale until it's gone
  // ---------------------------------------------------------------
  update(dt) {
    const toRemove = []
    // We collect indices of fully-gone cubes and remove them AFTER the loop.
    // Never remove items from an array while looping through it — it
    // causes items to be skipped. Collect first, remove second.

    // Loop backwards so that if we splice (remove) items, the remaining
    // indices stay correct. Looping forward while splicing causes skips.
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]

      if (e.removing) {
        // --- REMOVING phase: shrink and disappear ---

        // Count up toward REMOVE_DURATION (0.4 seconds).
        e.removeTimer += dt

        // t goes from 0 (just started) to 1 (fully gone).
        const t = Math.min(e.removeTimer / REMOVE_DURATION, 1)

        // Scale goes from 1 (full size) to 0 (invisible).
        const scale = 1 - t
        e.mesh.scale.setScalar(scale) // sets X, Y, Z scale all at once

        // When t reaches 1, the cube is invisible — mark for final removal.
        if (t >= 1) toRemove.push(i)

        continue // skip the sync code below — body was already removed
      }

      // --- ALIVE phase: sync visual mesh to physics body ---

      const { position: bp, quaternion: bq } = e.body
      // bp = body position (Cannon Vec3)
      // bq = body quaternion/rotation (Cannon Quaternion)

      // Copy position from physics body to the visible mesh.
      // This is why cubes appear to fall and collide — the physics engine
      // is doing all the math; we just copy the result into the visual.
      e.mesh.position.set(bp.x, bp.y, bp.z)

      // Copy rotation. A quaternion is a compact way to represent 3D rotation.
      // x, y, z, w are the four components — we just copy them across.
      e.mesh.quaternion.set(bq.x, bq.y, bq.z, bq.w)

      // If this cube has fallen below the "death floor", start removing it.
      if (bp.y < FALL_DEATH_Y) this._queueRemove(i)
    }

    // Now safely remove the cubes that finished their shrink animation.
    // Loop backwards so earlier indices aren't shifted by removals.
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this._executeRemove(toRemove[i])
    }
  }

  // ---------------------------------------------------------------
  // _queueRemove(index) — Start the removal animation for one cube
  // ---------------------------------------------------------------
  // This BEGINS the removal process. The physics body is removed
  // immediately (so it stops participating in collisions), but the
  // mesh stays visible for REMOVE_DURATION seconds while it shrinks.
  // ---------------------------------------------------------------
  _queueRemove(index) {
    const e = this.entries[index]
    if (!e || e.removing) return // guard: don't queue the same cube twice

    e.removing = true   // mark as "in the process of being removed"
    e.removeTimer = 0   // reset the shrink timer

    // Remove the physics body NOW. No need to wait — we don't want it
    // participating in collisions while it's visually shrinking.
    this.phys.removeBody(e.body)
  }

  // ---------------------------------------------------------------
  // _executeRemove(index) — Final cleanup: remove mesh and free memory
  // ---------------------------------------------------------------
  // Called after the shrink animation completes (scale = 0).
  // Removes the mesh from the scene and frees GPU memory.
  //
  // WHY dispose()? Three.js sends mesh data to the GPU (graphics card).
  // If you just remove the mesh without calling dispose(), the GPU keeps
  // that data forever — this is called a memory leak. Over time it fills
  // the GPU memory and the app slows down or crashes.
  // ---------------------------------------------------------------
  _executeRemove(index) {
    const e = this.entries[index]
    if (!e) return

    // Remove the mesh from the 3D scene (stops it being drawn).
    this.scene.remove(e.mesh)

    // Free the GPU memory used by this cube's material (colors, shine settings).
    // Note: we do NOT dispose the geometry because it's shared via geoCache!
    // Other cubes of the same size are still using it.
    e.mesh.material.dispose()

    // Remove the CubeEntry from our tracking array.
    // splice(index, 1) = "remove 1 item at position index"
    this.entries.splice(index, 1)
  }

  // ---------------------------------------------------------------
  // removeOldest(n) — Remove the n oldest cubes (performance cleanup)
  // ---------------------------------------------------------------
  // Called by main.js when FPS drops or cube count exceeds the limit.
  // Removes from the front of the list (oldest = lowest index = created first).
  // Removing one per frame at 60fps takes several seconds — the user
  // won't notice, it just feels like the scene "lightens" gradually.
  // ---------------------------------------------------------------
  removeOldest(n = 1) {
    let removed = 0
    for (let i = 0; i < this.entries.length && removed < n; i++) {
      if (!this.entries[i].removing) {
        this._queueRemove(i)
        removed++
      }
    }
  }

  // ---------------------------------------------------------------
  // removeAll() — Delete every cube instantly (for Reset Scene)
  // ---------------------------------------------------------------
  // Unlike the gradual removal above, this skips the animation and
  // cleans up everything immediately. Used when the user hits Reset.
  // ---------------------------------------------------------------
  removeAll() {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]
      // Only remove body if it hasn't been removed already (removing=true means body is gone).
      if (!e.removing) this.phys.removeBody(e.body)
      this.scene.remove(e.mesh)
      e.mesh.material.dispose() // free GPU memory
    }
    this.entries = [] // reset to empty array
  }

  // ---------------------------------------------------------------
  // recolor(paletteName) — Change all existing cubes to a new palette
  // ---------------------------------------------------------------
  // Called when the user picks a new color theme while cubes are present.
  // Each cube gets a new random color from the new palette.
  // ---------------------------------------------------------------
  recolor(paletteName) {
    for (const e of this.entries) {
      e.mesh.material.color.set(pickColor(paletteName))
    }
  }
}
