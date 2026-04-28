import * as CANNON from 'cannon-es'
import { CONFIG } from './config.js'

export class PhysicsWorld {
  constructor(gravity = CONFIG.physics.gravity) {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, gravity, 0) })
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.allowSleep = true
    this.world.sleepSpeedLimit = 0.5
    this.world.sleepTimeLimit = 1.0
    this.dynamicBodies = []
  }

  setGravity(value) {
    this.world.gravity.set(0, value, 0)
    // Wake all bodies so new gravity takes effect immediately
    for (const b of this.dynamicBodies) b.wakeUp()
  }

  // Static box (platform)
  addStaticBox(halfExtents, position, quaternion) {
    const shape = new CANNON.Box(new CANNON.Vec3(...halfExtents))
    const body = new CANNON.Body({ mass: 0 })
    body.addShape(shape)
    body.position.set(...position)
    if (quaternion) body.quaternion.copy(quaternion)
    this.world.addBody(body)
    return body
  }

  // Heightfield for malleable surface
  addHeightfield(data, elementSize, position, quaternion) {
    const shape = new CANNON.Heightfield(data, { elementSize })
    const body = new CANNON.Body({ mass: 0 })
    body.addShape(shape)
    body.position.set(...position)
    if (quaternion) body.quaternion.copy(quaternion)
    this.world.addBody(body)
    return body
  }

  // Dynamic cube
  addCube(halfSize, position, initialVelocity) {
    const shape = new CANNON.Box(new CANNON.Vec3(halfSize, halfSize, halfSize))
    const body = new CANNON.Body({
      mass: 1,
      linearDamping: 0.2,
      angularDamping: 0.3,
      allowSleep: true,
    })
    body.addShape(shape)
    body.position.set(...position)
    if (initialVelocity) body.velocity.set(...initialVelocity)
    this.world.addBody(body)
    this.dynamicBodies.push(body)
    return body
  }

  removeBody(body) {
    this.world.removeBody(body)
    const idx = this.dynamicBodies.indexOf(body)
    if (idx !== -1) this.dynamicBodies.splice(idx, 1)
  }

  // Radial shockwave impulse from worldPos
  applyShockwave(worldPos, radius, force) {
    const { x: px, y: py, z: pz } = worldPos
    for (const body of this.dynamicBodies) {
      const dx = body.position.x - px
      const dy = body.position.y - py
      const dz = body.position.z - pz
      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq < radius * radius && distSq > 0.001) {
        const dist = Math.sqrt(distSq)
        const strength = (1 - dist / radius) * force
        const upBias = strength * 0.4
        body.applyImpulse(
          new CANNON.Vec3(
            (dx / dist) * strength,
            (dy / dist) * strength + upBias,
            (dz / dist) * strength
          ),
          new CANNON.Vec3(0, 0, 0)
        )
        body.wakeUp()
      }
    }
  }

  step(dt) {
    this.world.step(CONFIG.physics.fixedTimeStep, dt, CONFIG.physics.maxSubSteps)
  }
}
