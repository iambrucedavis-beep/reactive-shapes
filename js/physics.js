// ============================================================
// physics.js — The Rules of Gravity
// ============================================================
// This file wraps the Cannon-ES physics library.
// Cannon-ES is what makes cubes fall, bounce, stack, and collide
// like real objects. Without it, cubes would just float.
//
// Think of this file as a simplified remote control for Cannon-ES.
// Instead of the rest of the code needing to know all the Cannon-ES
// details, they just call friendly methods like addCube() or
// applyShockwave().
//
// KEY CONCEPT: Every visible cube has TWO parts:
//   - A Three.js mesh  → what you SEE (the colorful box)
//   - A Cannon-ES body → what physics KNOWS ABOUT (invisible box)
//   Each frame, we copy the body's position into the mesh position.
//
// QUICK TROUBLESHOOT:
//   Cubes fall through platform → check that platform body was created.
//   Cubes fly to infinity → force multiplier too high, or NaN in position.
//   App slow with many cubes → sleeping is probably not working; see below.
// ============================================================

import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'

export class PhysicsWorld {

  // ---------------------------------------------------------------
  // constructor — Set up the physics world
  // ---------------------------------------------------------------
  constructor(gravity = CONFIG.physics.gravity) {

    // Create the physics world. Gravity pulls in the -Y direction
    // (downward), so the Y component is negative.
    // Vec3(x, y, z) = x is right, y is up, z is toward you.
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, gravity, 0) })

    // Use SAP (Sweep and Prune) broadphase collision detection.
    // Before checking if two objects are actually touching, broadphase
    // quickly rules out pairs that are obviously too far apart.
    // Without it, every object would be checked against every other object
    // (expensive). SAP makes it much faster when objects are clustered.
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)

    // Allow bodies to "sleep" when they stop moving.
    // A sleeping body does NO physics calculations — huge performance win
    // when many cubes have settled on the platform.
    this.world.allowSleep = true

    // A body can start sleeping when its speed drops below this (units/sec).
    // 0.5 = fairly quick to sleep. Raise if cubes jitter before settling.
    this.world.sleepSpeedLimit = 0.5

    // A body must stay below sleepSpeedLimit for this many seconds
    // before it actually falls asleep.
    // 1.0 second = won't sleep if it has a brief slow moment mid-bounce.
    this.world.sleepTimeLimit = 1.0

    // Our own list of dynamic (moveable) bodies.
    // Cannon-ES has an internal list too, but we keep our own so we can
    // quickly loop over just the cubes (not the platform) for shockwaves.
    this.dynamicBodies = []
  }

  // ---------------------------------------------------------------
  // setGravity(value) — Change gravity while the app is running
  // ---------------------------------------------------------------
  // Called when the user moves the gravity slider.
  // Also wakes all sleeping bodies — otherwise sleeping cubes would
  // ignore the new gravity until something bumped into them.
  // ---------------------------------------------------------------
  setGravity(value) {
    // Only Y changes — gravity always pulls straight down.
    this.world.gravity.set(0, value, 0)

    // Wake up all dynamic bodies so they immediately respond to
    // the new gravity. A sleeping body doesn't process gravity.
    for (const b of this.dynamicBodies) b.wakeUp()
  }

  // ---------------------------------------------------------------
  // addStaticBox(halfExtents, position, quaternion) — Add the platform
  // ---------------------------------------------------------------
  // Creates a box-shaped physics body that NEVER MOVES (mass = 0).
  // Used for the platform in Solid mode.
  //
  // halfExtents: [halfWidth, halfHeight, halfDepth]
  //   — Cannon uses half-sizes. A 12×0.6×8 platform needs [6, 0.3, 4].
  // position: [x, y, z] — where to place the center of the box
  // quaternion: (optional) rotation — if null, body is axis-aligned
  // ---------------------------------------------------------------
  addStaticBox(halfExtents, position, quaternion) {
    // CANNON.Box takes half-extents as a Vec3.
    const shape = new CANNON.Box(new CANNON.Vec3(...halfExtents))

    // mass: 0 = static (immovable). No matter what hits it, it won't budge.
    const body = new CANNON.Body({ mass: 0 })
    body.addShape(shape)
    body.position.set(...position)

    // Apply rotation if provided (used for Heightfield — see platform.js).
    if (quaternion) body.quaternion.copy(quaternion)

    this.world.addBody(body)
    return body
    // Note: static bodies are NOT added to this.dynamicBodies.
    // We don't want shockwaves to affect the platform.
  }

  // ---------------------------------------------------------------
  // addHeightfield(data, elementSize, position, quaternion)
  // ---------------------------------------------------------------
  // Creates a height-map physics body for the malleable surface.
  // A Heightfield is like a grid of hills — each grid point has a height.
  //
  // data: 2D array where data[x][z] = height at that grid point
  // elementSize: spacing between grid points in world units
  // See platform.js for the alignment math that makes this match the mesh.
  //
  // TROUBLESHOOT: Cubes falling through the malleable surface?
  //   The data might be misaligned. Check the k = segZ - iy reversal
  //   in platform.js _buildHeightfieldBody().
  // ---------------------------------------------------------------
  addHeightfield(data, elementSize, position, quaternion) {
    const shape = new CANNON.Heightfield(data, { elementSize })
    const body = new CANNON.Body({ mass: 0 }) // static — platform doesn't move
    body.addShape(shape)
    body.position.set(...position)
    if (quaternion) body.quaternion.copy(quaternion)
    this.world.addBody(body)
    return body
  }

  // ---------------------------------------------------------------
  // addCube(halfSize, position, initialVelocity) — Spawn a physics cube
  // ---------------------------------------------------------------
  // Creates a box-shaped physics body that IS affected by gravity.
  // mass: 1 = one unit of weight. All cubes weigh the same regardless
  //          of visual size (simplification for playability).
  //
  // linearDamping:  Slows down straight-line movement (like air resistance).
  //   0 = no damping (would slide forever). 0.2 = slight resistance.
  // angularDamping: Slows down spinning. 0.3 = spin dies out gradually.
  // ---------------------------------------------------------------
  addCube(halfSize, position, initialVelocity) {
    // A cube has equal half-extents in all 3 directions.
    const shape = new CANNON.Box(new CANNON.Vec3(halfSize, halfSize, halfSize))

    const body = new CANNON.Body({
      mass: 1,
      linearDamping: 0.2,   // slight air resistance so cubes don't slide forever
      angularDamping: 0.3,  // spinning slows down over time
      allowSleep: true,     // can sleep when settled (saves CPU)
    })

    body.addShape(shape)
    body.position.set(...position) // where to place it in the world

    // Give it an initial velocity so it moves right away.
    // Typically: slight random X/Z drift, strong downward Y velocity.
    if (initialVelocity) body.velocity.set(...initialVelocity)

    this.world.addBody(body)

    // Keep track of this body in our own list (for shockwaves and cleanup).
    this.dynamicBodies.push(body)

    return body
  }

  // ---------------------------------------------------------------
  // removeBody(body) — Remove a physics body from the simulation
  // ---------------------------------------------------------------
  // Called when a cube is being deleted.
  // Must be called BEFORE the Three.js mesh is removed — the body
  // and mesh are separate; removing one doesn't remove the other.
  // ---------------------------------------------------------------
  removeBody(body) {
    this.world.removeBody(body) // tell Cannon to stop simulating this body

    // Remove from our own tracking list too.
    const idx = this.dynamicBodies.indexOf(body)
    if (idx !== -1) this.dynamicBodies.splice(idx, 1)
    // splice(idx, 1) removes exactly 1 element at position idx.
  }

  // ---------------------------------------------------------------
  // applyShockwave(worldPos, radius, force) — Push cubes outward
  // ---------------------------------------------------------------
  // Used in click mode: creates a blast wave from a point.
  // Every cube within the radius gets pushed away from worldPos.
  // Cubes closer to the center get pushed harder than those at the edge.
  //
  // worldPos: THREE.Vector3 — where the shockwave originates
  // radius:   how far the shockwave reaches (in world units)
  // force:    how hard it pushes at the center
  //
  // TROUBLESHOOT: Shockwave does nothing?
  //   Bodies might be asleep. wakeUp() is called below — check it's there.
  //   Also verify that this.dynamicBodies is not empty.
  // ---------------------------------------------------------------
  applyShockwave(worldPos, radius, force) {
    const { x: px, y: py, z: pz } = worldPos

    for (const body of this.dynamicBodies) {
      // Vector from shockwave center to this body.
      const dx = body.position.x - px
      const dy = body.position.y - py
      const dz = body.position.z - pz

      // distSq = distance squared. We use squared distance first because
      // Math.sqrt is expensive — only call it if the body is close enough.
      const distSq = dx * dx + dy * dy + dz * dz

      if (distSq < radius * radius && distSq > 0.001) {
        // 0.001 check prevents divide-by-zero if body is exactly at center.

        const dist = Math.sqrt(distSq) // actual distance (now safe to compute)

        // Strength falls off linearly from center (full force) to edge (zero).
        // At dist=0: strength = force
        // At dist=radius: strength = 0
        const strength = (1 - dist / radius) * force

        // Extra upward push so cubes fly up, not just sideways.
        // 0.4 = 40% of strength is added as upward boost.
        const upBias = strength * 0.4

        body.applyImpulse(
          new CANNON.Vec3(
            (dx / dist) * strength,           // push away in X
            (dy / dist) * strength + upBias,  // push away in Y + upward bonus
            (dz / dist) * strength            // push away in Z
          ),
          new CANNON.Vec3(0, 0, 0) // apply force at body's center of mass
        )

        // CRITICAL: sleeping bodies ignore impulses unless woken up first!
        body.wakeUp()
      }
    }
  }

  // ---------------------------------------------------------------
  // step(dt) — Advance the physics simulation by one frame
  // ---------------------------------------------------------------
  // Called once per animation frame from main.js.
  //
  // dt:           real time since last frame (in seconds)
  // fixedTimeStep: the physics runs at this constant speed (1/60 sec)
  // maxSubSteps:  if dt > fixedTimeStep, do up to this many sub-steps
  //               to catch up. Prevents cubes from tunneling through
  //               surfaces on slow frames.
  // ---------------------------------------------------------------
  step(dt) {
    this.world.step(CONFIG.physics.fixedTimeStep, dt, CONFIG.physics.maxSubSteps)
  }
}
