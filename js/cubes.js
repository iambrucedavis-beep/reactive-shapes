import * as THREE from 'three'
import { CONFIG, PALETTES } from './config.js'

const REMOVE_DURATION = 0.4  // seconds for scale-down animation
const FALL_DEATH_Y = -25     // cubes below this are queued for removal

// Reusable geometry cache keyed by size (rounded to 2dp)
const geoCache = new Map()
function getCubeGeo(size) {
  const key = size.toFixed(2)
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(size, size, size))
  return geoCache.get(key)
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min)
}

function pickColor(paletteName) {
  const pal = PALETTES[paletteName] || PALETTES.neon
  return pal.colors[Math.floor(Math.random() * pal.colors.length)]
}

class CubeEntry {
  constructor(mesh, body, size) {
    this.mesh = mesh
    this.body = body
    this.size = size
    this.createdAt = performance.now()
    this.removing = false
    this.removeTimer = 0
  }
}

export class CubeManager {
  constructor(scene, physicsWorld) {
    this.scene = scene
    this.phys = physicsWorld
    this.entries = []
    this.lastSpawnTime = 0
  }

  get count() { return this.entries.length }

  spawnGroup(count, xOffset = 0, paletteName = 'neon', downwardForce = 10) {
    const now = performance.now()
    if (now - this.lastSpawnTime < CONFIG.spawn.cooldown) return
    this.lastSpawnTime = now

    const spread = CONFIG.spawn.spread
    const spawnY = CONFIG.spawn.height

    for (let i = 0; i < count; i++) {
      const size = randomInRange(CONFIG.cubes.sizeMin, CONFIG.cubes.sizeMax)
      const px = xOffset + randomInRange(-spread / 2, spread / 2)
      const py = spawnY + randomInRange(0, count * 0.3)
      const pz = randomInRange(-2, 2)

      const vx = randomInRange(-1, 1)
      const vy = -Math.abs(downwardForce) * randomInRange(0.6, 1.0)
      const vz = randomInRange(-0.5, 0.5)

      const color = pickColor(paletteName)
      this._spawnOne(size, [px, py, pz], [vx, vy, vz], color)
    }
  }

  _spawnOne(size, position, velocity, color) {
    const geo = getCubeGeo(size)
    const mat = new THREE.MeshPhongMaterial({
      color,
      shininess: 60 + Math.random() * 60,
      specular: new THREE.Color(0x444444),
      emissive: new THREE.Color(color).multiplyScalar(0.08),
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    // Random initial rotation
    mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    )
    this.scene.add(mesh)

    const body = this.phys.addCube(size / 2, position, velocity)
    // Give the cube a slight random angular velocity for visual interest
    body.angularVelocity.set(
      randomInRange(-2, 2),
      randomInRange(-2, 2),
      randomInRange(-2, 2)
    )

    this.entries.push(new CubeEntry(mesh, body, size))
  }

  update(dt) {
    const toRemove = []

    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]

      if (e.removing) {
        e.removeTimer += dt
        const t = Math.min(e.removeTimer / REMOVE_DURATION, 1)
        const scale = 1 - t
        e.mesh.scale.setScalar(scale)
        if (t >= 1) toRemove.push(i)
        continue
      }

      // Sync Three.js mesh with Cannon body
      const { position: bp, quaternion: bq } = e.body
      e.mesh.position.set(bp.x, bp.y, bp.z)
      e.mesh.quaternion.set(bq.x, bq.y, bq.z, bq.w)

      // Mark fallen cubes for removal
      if (bp.y < FALL_DEATH_Y) this._queueRemove(i)
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      this._executeRemove(toRemove[i])
    }
  }

  _queueRemove(index) {
    const e = this.entries[index]
    if (!e || e.removing) return
    e.removing = true
    e.removeTimer = 0
    this.phys.removeBody(e.body)
  }

  _executeRemove(index) {
    const e = this.entries[index]
    if (!e) return
    this.scene.remove(e.mesh)
    e.mesh.material.dispose()
    this.entries.splice(index, 1)
  }

  // Remove the oldest non-removing cube (for performance management)
  removeOldest(n = 1) {
    let removed = 0
    for (let i = 0; i < this.entries.length && removed < n; i++) {
      if (!this.entries[i].removing) {
        this._queueRemove(i)
        removed++
      }
    }
  }

  removeAll() {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]
      if (!e.removing) this.phys.removeBody(e.body)
      this.scene.remove(e.mesh)
      e.mesh.material.dispose()
    }
    this.entries = []
  }

  recolor(paletteName) {
    for (const e of this.entries) {
      e.mesh.material.color.set(pickColor(paletteName))
    }
  }
}
