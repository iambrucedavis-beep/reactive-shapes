# Reactive Shapes — Private Technical Reference

This document is for your own understanding and future reference. It explains how the project actually works under the hood, including the non-obvious decisions, the math, and why things are built the way they are.

---

## Table of Contents

1. [Project Architecture](#1-project-architecture)
2. [How the Modules Fit Together](#2-how-the-modules-fit-together)
3. [The Rendering Engine (Three.js)](#3-the-rendering-engine-threejs)
4. [The Physics Engine (Cannon-ES)](#4-the-physics-engine-cannon-es)
5. [Audio Input (Web Audio API)](#5-audio-input-web-audio-api)
6. [The Platform: Solid vs Malleable](#6-the-platform-solid-vs-malleable)
7. [Cube Spawning and Lifecycle](#7-cube-spawning-and-lifecycle)
8. [Performance Management](#8-performance-management)
9. [The Main Loop](#9-the-main-loop)
10. [UI and State Management](#10-ui-and-state-management)
11. [How CDN Imports Work (No Build Step)](#11-how-cdn-imports-work-no-build-step)
12. [Known Limitations](#12-known-limitations)

---

## 1. Project Architecture

The project is a pure client-side web application — no server, no backend, no database. Everything runs in the user's browser tab. The file structure is:

```
reactive-shapes/
├── index.html          Entry point — loads CSS and the module graph
├── css/
│   └── style.css       All visual styling for the UI panel
└── js/
    ├── config.js       Central constants and palette definitions
    ├── audio.js        Microphone capture and volume analysis
    ├── physics.js      Cannon-ES physics world wrapper
    ├── renderer.js     Three.js scene, camera, lights
    ├── platform.js     The 3D table (solid and malleable modes)
    ├── cubes.js        Cube spawning, tracking, and removal
    ├── ui.js           DOM event bindings for all UI controls
    └── main.js         App orchestrator and the animation loop
```

Each JS file is an ES Module — it explicitly imports what it needs and exports what it provides. There is no bundler (no Webpack, Vite, etc.). The browser handles the module graph natively.

**The dependency graph looks like this:**

```
main.js
  ├── config.js
  ├── audio.js
  ├── physics.js  ──── cannon-es (CDN)
  ├── renderer.js ──── three (CDN)
  ├── platform.js ──── three + cannon-es
  ├── cubes.js    ──── three + cannon-es + config
  └── ui.js       ──── config
```

`main.js` is the only file that instantiates everything and connects the pieces together. All other modules are self-contained classes that receive their dependencies via constructor arguments (this is a form of manual dependency injection).

---

## 2. How the Modules Fit Together

At startup, `main.js` creates instances in this order:

```javascript
this.renderer  = new SceneRenderer(container, bgColor)   // Three.js
this.physics   = new PhysicsWorld(gravity)               // Cannon-ES
this.platform  = new Platform(scene, physics)            // uses both
this.cubes     = new CubeManager(scene, physics)         // uses both
this.audio     = new AudioManager()                      // standalone
this.ui        = new UIManager(this)                     // references app
```

The order matters: `Platform` and `CubeManager` both need the Three.js scene (to add meshes) and the physics world (to add bodies), so those must exist first.

`UIManager` receives a reference to the whole `App` instance so it can call `app.setGravity()`, `app.resetScene()`, etc. — it is essentially a controller that bridges DOM events to app state changes.

The `AudioManager` fires a callback (`app.audio.onSound`) when sound crosses the threshold. That callback is wired in `main.js`:

```javascript
this.audio.onSound = (intensity) => this._onSound(intensity)
```

This keeps `AudioManager` decoupled from everything else — it doesn't know about cubes, physics, or Three.js.

---

## 3. The Rendering Engine (Three.js)

Three.js is a library that wraps the browser's WebGL API into something usable. Without it, you would need to write raw OpenGL shader code.

### Scene Graph

Everything visible lives in a `THREE.Scene`, which is a tree of objects. When you add a mesh to the scene, Three.js draws it every frame. The scene contains:

- A `DirectionalLight` (the main "sun" — casts shadows)
- A fill `DirectionalLight` (blue-tinted, from the opposite side, gives depth to dark faces)
- A rim `DirectionalLight` (from below-behind, adds subtle edge definition)
- An `AmbientLight` (flat base light so nothing is completely black)
- The platform mesh
- All cube meshes (added/removed dynamically)
- An invisible `PlaneGeometry` used only for click raycasting

### Shadow Maps

The `DirectionalLight` has shadow casting enabled. Three.js renders the scene from the light's point of view into a texture (the shadow map, set to 2048×2048 for crispness). Then during the main render it uses that texture to determine which surfaces are in shadow. This is expensive but only done once per frame. Cubes have `castShadow = true`; the platform has `receiveShadow = true`.

### Fog

`FogExp2` makes objects fade toward the background color as they get farther from the camera. This creates the sense of depth and makes falling cubes appear to dissolve rather than abruptly disappear. The fog color always matches the background color.

### Camera

The camera is a `PerspectiveCamera` positioned at `(0, 14, 22)` looking toward `(0, 2, 0)` — slightly above and in front of the platform. This angle was chosen to make the cube stacking readable as a 3D scene rather than looking flat.

### Pixel Ratio

The renderer respects the device's pixel ratio (for Retina/HiDPI screens) but caps it at 2×. Going above 2× gives diminishing visual returns while quadrupling the number of pixels to shade, which tanks performance.

---

## 4. The Physics Engine (Cannon-ES)

Cannon-ES simulates rigid body physics: gravity, collisions, friction, and impulses. Every physics object has two representations — a Three.js mesh (what you see) and a Cannon body (what the physics engine knows about). Every frame, after the physics step, we copy the body's position and rotation into the mesh.

### Fixed Timestep

The physics world does NOT run at the same rate as the render loop. It uses a fixed timestep of 1/60th of a second regardless of how fast the screen refreshes. This keeps physics deterministic. If a frame takes longer than 1/60s (e.g., the computer is under load), Cannon does multiple substeps to catch up (up to 3 in our config).

```javascript
this.world.step(1/60, realDeltaTime, maxSubSteps: 3)
```

### Broadphase

Collision detection is expensive. Checking every object against every other object is O(n²) — with 150 cubes, that's 22,500 checks per frame. The `SAPBroadphase` (Sweep and Prune) reduces this drastically by only checking objects whose axis-aligned bounding boxes overlap. It's the right choice when objects are roughly clustered in space.

### Sleeping

Bodies that haven't moved recently are put to sleep. A sleeping body skips physics updates entirely. This is critical for performance as cubes pile up — a stack of 80 settled cubes consumes almost no CPU. Bodies wake up when hit by an impulse or when gravity changes.

### Shape Types

- **Static platform (solid mode):** `CANNON.Box` — a simple axis-aligned box. Mass = 0 means Cannon never moves it regardless of what hits it.
- **Cubes:** `CANNON.Box` — half-extents equal to half the visual cube size.
- **Malleable platform:** `CANNON.Heightfield` — a grid of height samples. See Section 6.

### Shockwave (Click Mode)

When you click in click mode, a "shockwave" applies an outward impulse from the click point to all nearby dynamic bodies:

```javascript
const strength = (1 - dist / radius) * force   // falls off with distance
body.applyImpulse(directionVector * strength, bodyOrigin)
body.wakeUp()  // must wake sleeping bodies or impulse is ignored
```

The upward bias (`strength * 0.4` added to Y) makes cubes pop upward rather than just scatter sideways, which looks more satisfying.

---

## 5. Audio Input (Web Audio API)

The Web Audio API is the browser's built-in audio processing system. It works as a signal graph: nodes connect together, and audio data flows through them.

### Signal Graph

```
Microphone (MediaStream)
    → MediaStreamAudioSourceNode
    → AnalyserNode
    (never reaches speakers — no output destination)
```

The `AnalyserNode` runs an FFT (Fast Fourier Transform) on the audio signal, splitting it into frequency buckets. We read these buckets as raw byte values (0–255) using `getByteFrequencyData()`.

### Volume Detection

We don't care about which frequencies are present — just the overall loudness. So we average all frequency buckets:

```javascript
const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
```

This gives us a rough volume level between 0 and 255. Then we apply an exponential moving average (EMA) to smooth it — without smoothing, the value bounces around too fast and triggers the spawn callback erratically:

```javascript
smoothedLevel = smoothedLevel * 0.8 + raw * 0.2
```

The 0.8/0.2 weighting means the smoothed value is 80% its previous value plus 20% the new reading. It reacts to changes but isn't jittery.

### Trigger Logic

A spawn event fires when:
1. The smoothed level exceeds the threshold (adjusted by sensitivity)
2. At least `cooldown` milliseconds have passed since the last trigger

```javascript
if (level > threshold / sensitivity && now - lastTrigger > cooldown) {
    lastTrigger = now
    const intensity = Math.min(level / 80, 1.0)  // normalize to 0–1
    onSound(intensity)
}
```

`intensity` (0–1) is passed to the spawn function to determine how many cubes to spawn and how hard they fall.

### AudioContext Autoplay Policy

Browsers block audio from starting without a user gesture (a click, keypress, etc.). That's why the mic doesn't start at page load — the user must click "Start Listening." This triggers `getUserMedia()`, which opens the mic, and creates the `AudioContext`, which the browser allows because it's happening inside a user event handler.

---

## 6. The Platform: Solid vs Malleable

### Solid Mode

A `THREE.BoxGeometry` mesh (gives it visible depth) paired with a `CANNON.Box` static body. Nothing unusual here.

### Malleable Mode — The Hard Part

The malleable surface uses a `THREE.PlaneGeometry` for visuals and a `CANNON.Heightfield` for physics. Making them align precisely required working through coordinate system math.

**The core problem:** Three.js and Cannon-ES have different coordinate conventions. Getting the physics collision surface to match the visual surface exactly requires careful positioning and orientation of the Cannon body.

#### Three.js Plane Vertex Layout

`PlaneGeometry(width, depth, segX, segZ)` creates a flat grid in the local XY plane (Z=0). After we apply `mesh.rotation.x = -Math.PI/2`, the plane becomes horizontal in world space. A vertex at grid position `(ix, iy)` maps to world coordinates:

```
world_x = mesh.position.x + ix * elementSize - width/2
world_z = mesh.position.z - depth/2 + iy * elementSize
world_y = mesh.position.y + deformation_height
```

Deformation is stored in the Z component of each vertex in local space (before rotation). After the -90° X rotation, local Z becomes world Y — so pushing a vertex's Z value up makes it rise in world space.

#### Cannon Heightfield Layout

A Cannon `Heightfield` body, when rotated -PI/2 around X and positioned at `(bx, by, bz)`, places height data as:

```
world_x = bx + ix * elementSize
world_z = bz - k * elementSize        // k is the Cannon column index
world_y = by + data[ix][k]
```

#### The Alignment Solution

Setting Cannon body position and data index to match Three.js vertices:

```
body.position.x = -width/2                   // aligns x origin
body.position.z = +depth/2                   // aligns z origin (reversed)
body.position.y = platform top Y
body.quaternion = Euler(-PI/2, 0, 0)

data[ix][k] = heights[ix][segZ - k]          // reverse k to flip z direction
elementSize = width / segX  (= depth / segZ)  // uniform grid spacing
```

The reversed k index (`segZ - k`) is necessary because the Cannon heightfield's local Y axis runs in the opposite direction to Three.js's iy axis after rotation. Without the reversal, the physics surface would be a mirror image of the visual surface.

#### Deformation Brush

When the user drags, we find the mouse intersection on the mesh via Three.js raycasting, then apply a smooth brush to nearby vertices:

```javascript
// Falloff: quadratic curve gives a smooth "hill" shape
const influence = ((1 - dist / brushRadius) ** 2) * strength
heights[ix][iy] = clamp(heights[ix][iy] + influence, -MAX, +MAX)
```

The physics body is rebuilt from the updated heights array (throttled to max 5 times per second during drag, immediately on mouse-up).

---

## 7. Cube Spawning and Lifecycle

### Spawn Group

When sound triggers (or click mode fires), `CubeManager.spawnGroup()` creates between 3 and 8 cubes (scaled by intensity). Each cube:

- Has a random size between 0.35 and 0.75 units
- Spawns at a random XZ position within the spread area, at height 14
- Gets a random initial downward velocity (scaled by force multiplier)
- Gets a random angular velocity (so it tumbles while falling)
- Gets a color picked randomly from the current palette

### Geometry Cache

Rather than creating a new `BoxGeometry` for each cube, geometries are cached by size:

```javascript
const geoCache = new Map()   // size string → BoxGeometry
```

This matters because `BoxGeometry` creation isn't free — it allocates Float32Arrays for vertex data. With 150 cubes possible, caching saves significant allocation overhead. All cubes of the same size share one geometry object.

### Physics Sync

Every frame, for each active cube:

```javascript
mesh.position.copy(body.position)       // copy x, y, z
mesh.quaternion.copy(body.quaternion)   // copy rotation
```

Cannon uses its own Vec3/Quaternion types, but Three.js accepts `.set(x,y,z,w)` from Cannon's quaternion directly.

### Removal

When a cube's physics body drops below Y = -25 (fallen off the platform), or when the performance manager needs to clear space, the cube enters a "removing" state:

1. The Cannon body is removed from the physics world immediately (no more physics updates)
2. The mesh scales down from 1.0 to 0.0 over 0.4 seconds (visual fade-out)
3. Once scale reaches 0, the mesh is removed from the scene and the material is disposed

Disposing the material is important — if you just remove the mesh without calling `material.dispose()`, the GPU texture memory is never freed. This is one of the most common memory leaks in Three.js applications.

---

## 8. Performance Management

### FPS Tracking

The main loop records the delta time (time since last frame) into a rolling window of the last 60 frames:

```javascript
this._fpsWindow.push(dt)
if (this._fpsWindow.length > 60) this._fpsWindow.shift()
const fps = 1 / average(this._fpsWindow)
```

Using a rolling average rather than a single frame prevents one slow frame (e.g., garbage collection pause) from triggering unnecessary cleanup.

### Automatic Cleanup

Each frame, if FPS drops below 30 OR cube count exceeds 150, `removeOldest(1)` is called. This removes the single oldest cube per frame — slow enough to be invisible to the user, fast enough to recover performance within a few seconds.

Cubes that fall below Y = -25 are also automatically queued for removal, which prevents an infinite accumulation of off-screen physics bodies.

### Why Not Remove Multiple at Once

Removing many cubes in a single frame causes a visible pop — the scene suddenly looks emptier. Removing one per frame at 30 fps means cleanup completes in a few seconds, which the user experiences as "things feel lighter" rather than "stuff disappeared."

---

## 9. The Main Loop

The game loop runs via `requestAnimationFrame`, which the browser calls once per display refresh (typically 60 or 120 times per second):

```javascript
_loop() {
    requestAnimationFrame(() => this._loop())  // schedule next frame first

    const dt = clamp(now - lastTime, 0, 0.05)  // delta time, max 50ms

    audio.update(sensitivity)      // check mic volume, fire onSound if triggered
    physics.step(dt)               // advance simulation by dt seconds
    cubes.update(dt)               // sync mesh positions, handle removals
    renderer.render()              // draw everything to screen
    performanceCheck()             // remove cubes if needed
    ui.updatePerf()                // refresh FPS/count display
}
```

The 50ms cap on `dt` prevents a "spiral of death" where a slow frame causes a huge physics step, which causes an even slower next frame, etc. If a frame takes more than 50ms (20 fps), we just accept the physics will be slightly inaccurate for that frame.

The order is deliberate: physics runs before rendering so you always see the latest positions, not last frame's positions.

---

## 10. UI and State Management

State lives in a plain object on the `App` class:

```javascript
this.state = {
    mode: 'microphone',    // which input mode is active
    surfaceMode: 'solid',  // which platform mode
    sensitivity: 1.0,      // mic sensitivity multiplier
    forceMultiplier: 1.5,  // how hard cubes fall
    palette: 'neon',       // current color palette key
    bgColor: '#1a1a2e',    // background/fog color
    gravity: -20,          // current gravity value
    isListening: false,    // whether mic is active
}
```

`UIManager` directly mutates `app.state` for simple values (sensitivity, palette) or calls methods on `app` for changes that have side effects (gravity → `app.setGravity()` which also updates the Cannon world, surface mode → `app.setSurfaceMode()` which tears down and rebuilds the platform).

There is no reactive state system (no React, Vue, etc.) — DOM elements are updated manually in the UI event handlers. This is appropriate for a project of this scale. A reactive system would add complexity without benefit.

---

## 11. How CDN Imports Work (No Build Step)

The HTML file contains an `importmap`:

```html
<script type="importmap">
{
    "imports": {
        "three":     "https://esm.sh/three@0.158.0",
        "cannon-es": "https://esm.sh/cannon-es@0.20.0"
    }
}
</script>
```

This tells the browser: whenever any ES module does `import * as THREE from 'three'`, fetch it from that URL instead. The browser downloads and caches the library the first time, then uses the cache on subsequent visits.

`esm.sh` is a CDN that takes npm packages and serves them as proper ES modules. It handles conversion from CommonJS format (which many npm packages use internally) to ESM format (which browsers require for native module imports).

**Why no build step is a good choice for portfolio toys:**
- Nothing to install, nothing to configure
- Files are directly readable — no source maps needed
- Deployable by dragging a folder onto Netlify/Vercel
- Zero dependency on Node.js tooling that changes constantly

**The tradeoff:** The browser fetches libraries from a third-party CDN. If `esm.sh` is down, the app doesn't load. For a production application, you would bundle dependencies locally. For a portfolio demo, the tradeoff is worth it.

---

## 12. Known Limitations

**Heightfield physics alignment under extreme deformation**
The Heightfield body is rebuilt from vertex data after deformation. If vertices are deformed very sharply (near the `MAX_DEFORM` limit of 2.2 units), fast-moving cubes can occasionally tunnel through the surface. This is a fundamental limitation of discrete collision detection at high speeds — reducing it would require continuous collision detection (CCD), which Cannon-ES supports but at significant performance cost.

**Microphone sensitivity varies by hardware**
The default threshold (14/255) was tuned for a typical laptop microphone. External microphones, phone speakers playing into the mic, or very quiet environments may need the sensitivity slider adjusted.

**No mobile touch drag for malleable surface**
Touch `touchmove` events are bound but right-click (push-down deformation) has no touch equivalent. A two-finger vs one-finger distinction would be the correct mobile implementation.

**Geometry cache grows indefinitely**
The `geoCache` Map in `cubes.js` caches geometries by size and is never cleared. In practice, the number of distinct sizes is small (~20 possible values given the size range and random distribution), so this is not a real problem. But technically it is a minor leak.

**importmap browser support**
Import maps require a modern browser (Chrome 89+, Firefox 108+, Safari 16.4+). They do not work in Internet Explorer or very old mobile browsers. This is acceptable for a portfolio demo targeting developers and hiring managers.
