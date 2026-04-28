# Reactive Shapes — How It Works (Private Notes)

> Written so that even a 12-year-old could read the code alongside this document
> and understand exactly what every part does and how to fix it when something breaks.

---

## Table of Contents

1. [The Big Picture — What Is This Thing?](#1-the-big-picture)
2. [The Files and What They Do](#2-the-files-and-what-they-do)
3. [config.js — The Settings File](#3-configjs--the-settings-file)
4. [audio.js — The Ear](#4-audiojs--the-ear)
5. [physics.js — The Rules of Gravity](#5-physicsjs--the-rules-of-gravity)
6. [renderer.js — The Camera and Lights](#6-rendererjs--the-camera-and-lights)
7. [platform.js — The Table](#7-platformjs--the-table)
8. [cubes.js — The Cubes](#8-cubesjs--the-cubes)
9. [ui.js — The Control Panel](#9-uijs--the-control-panel)
10. [main.js — The Brain](#10-mainjs--the-brain)
11. [How the Loop Works (The Heartbeat)](#11-how-the-loop-works-the-heartbeat)
12. [Troubleshooting Guide](#12-troubleshooting-guide)

---

## 1. The Big Picture

Imagine you're running a puppet show. You need several things:

- **A stage** with lights and a camera pointing at it (that's `renderer.js`)
- **Gravity and collision rules** so puppets fall and bump into each other (that's `physics.js`)
- **An ear** that listens to sound and tells you when to do something (that's `audio.js`)
- **The actual puppets** — the cubes — that fall and stack up (that's `cubes.js`)
- **The table** the puppets land on (that's `platform.js`)
- **The control board** you use to change settings (that's `ui.js`)
- **A director** who tells everyone what to do and when (that's `main.js`)
- **A rulebook** with all the numbers everyone agrees to use (that's `config.js`)

Every single frame — 60 or more times per second — the director (main.js) runs through this checklist:
1. Did the microphone hear anything? If yes, spawn cubes.
2. Move the physics forward one tiny step.
3. Move every cube's picture to match where physics says it is.
4. Draw everything to the screen.
5. Check if the computer is struggling. If yes, quietly remove the oldest cube.

That's it. Everything else is just details.

---

## 2. The Files and What They Do

```
reactive-shapes/
│
├── index.html        The web page itself. Loads all the JS and CSS.
│                     The importmap inside it tells the browser WHERE to
│                     download Three.js and Cannon-ES from the internet.
│
├── css/style.css     Makes the panel on the right look nice.
│                     Nothing here affects the 3D scene at all.
│
└── js/
    ├── config.js     A single object full of numbers. Change a number
    │                 here and it changes the whole app. Think of it like
    │                 the settings menu hidden inside the code.
    │
    ├── audio.js      Talks to the microphone. Measures how loud things
    │                 are. Tells main.js when a sound is loud enough.
    │
    ├── physics.js    Wraps the Cannon-ES library. Creates a "physics world"
    │                 where gravity exists and things can collide.
    │
    ├── renderer.js   Wraps the Three.js library. Creates the 3D scene,
    │                 the camera, and the lights.
    │
    ├── platform.js   Builds the table. In Solid mode it's a simple box.
    │                 In Malleable mode it's a grid you can squish.
    │
    ├── cubes.js      Creates, tracks, and removes cubes. Each cube is
    │                 actually TWO things: a 3D shape you can see, and an
    │                 invisible physics body the engine uses for collisions.
    │
    ├── ui.js         Listens for button clicks and slider moves in the
    │                 HTML panel, then tells main.js what changed.
    │
    └── main.js       The boss. Creates everything, connects everything,
                      and runs the main loop every frame.
```

**How they depend on each other:**
```
main.js needs ALL the others
platform.js needs renderer.js (the scene) + physics.js (the world)
cubes.js needs renderer.js (the scene) + physics.js (the world)
ui.js only needs main.js (so it can call things on it)
audio.js, physics.js, renderer.js don't need each other at all
config.js is needed by almost everyone
```

The rule is: no file imports from main.js. Data only flows DOWN from main to the others, never back up. Main.js is the only one who connects everything.

---

## 3. config.js — The Settings File

This file is just one big object full of numbers. Nothing complicated here — but it matters a lot because every other file reads from it.

**If the app feels wrong, this is the first place to look.**

```
CONFIG.physics.gravity = -20
```
Negative means downward (in 3D, Y goes up, so down is negative). Make it -5 for floaty cubes. Make it -50 for fast heavy cubes. Max allowed by the slider is -3, min is -50.

```
CONFIG.spawn.height = 14
```
How high above the platform cubes appear. If cubes are spawning inside the platform, this number is too small.

```
CONFIG.spawn.cooldown = 1000
```
How many milliseconds must pass before another group of cubes can spawn. 1000 = 1 second. If cubes spawn too fast and lag the computer, raise this number.

```
CONFIG.cubes.maxCount = 150
```
The maximum number of cubes allowed at once. If the app gets slow, lower this to 80 or 100. If the computer is powerful, you can raise it.

```
CONFIG.audio.threshold = 14
```
How loud the mic needs to be before anything happens. Scale is 0 to 255. Low number = very sensitive (reacts to quiet sounds). High number = less sensitive (only reacts to loud sounds).

```
CONFIG.audio.cooldown = 900
```
After a sound triggers cubes, how long (in ms) before it can trigger again. Prevents one clap from triggering 10 times.

**PALETTES** at the bottom of this file are color themes. Each one has:
- `colors`: the actual color values used by Three.js (hex numbers starting with 0x)
- `preview`: the same colors as CSS strings, used by the UI swatches

---

## 4. audio.js — The Ear

### What It Does

The browser lets JavaScript access the microphone through something called the **Web Audio API**. This file uses it to:
1. Ask the user for permission to use the microphone
2. Listen to the sound constantly
3. Measure how loud it is right now
4. Tell main.js when to spawn cubes

### How Loudness Is Measured

Think of sound as a wave. The Web Audio API can split that wave into 128 different frequency "buckets" (like the bars on an equalizer). Each bucket has a value between 0 and 255 — 0 is silent, 255 is as loud as possible.

We don't care which buckets are loud (we're not analyzing music). We just add all 128 buckets together and divide by 128 to get an average loudness. That single number is what we compare to the threshold.

```
raw volume = average of all 128 frequency buckets (value 0–255)
```

### The Smoothing Trick

If we used the raw volume directly, the number would jump around wildly frame to frame. Even in a quiet room, microphones pick up random noise. So we smooth it with a formula called an **exponential moving average**:

```
smoothedLevel = (smoothedLevel × 0.8) + (rawLevel × 0.2)
```

In plain English: the new smoothed value is 80% what it was before, plus 20% the fresh reading. This means it reacts to changes but doesn't freak out over a single spike. Think of it like turning a steering wheel slowly — you don't jerk from left to right instantly.

### The Trigger

Each frame, if `rawLevel > threshold` AND enough time has passed since the last trigger, we call `onSound(intensity)`. The intensity is how loud it was, scaled to a number between 0 and 1. This gets passed to main.js which uses it to decide how many cubes to spawn.

### Troubleshooting Audio

**"Start Listening" button does nothing:**
The browser blocked microphone access. This usually means:
- The page is not on HTTPS (or localhost). Mic access requires a secure connection.
- The user clicked "Block" when asked for permission. They need to click the lock icon in the browser address bar and re-allow the microphone.

**Cubes never spawn even though sound is loud:**
- Open the browser console (F12 → Console tab). Look for error messages.
- The threshold might be set too high. Temporarily lower `CONFIG.audio.threshold` to 5 and test.
- The sensitivity slider might be at a low position — turn it up.

**Cubes spawn constantly even in a quiet room:**
- The threshold is too low, or the microphone is very sensitive.
- Raise `CONFIG.audio.threshold` to 25 or 30.
- Raise `CONFIG.audio.cooldown` so it can only trigger once every 2 seconds.

---

## 5. physics.js — The Rules of Gravity

### What Is a Physics Engine?

A physics engine is like a rulebook for a video game world. It knows:
- There is gravity pulling everything down
- When two objects touch each other, they push apart
- Objects slow down a little over time (damping)
- Objects that aren't moving can "sleep" to save computer power

This file uses a library called **Cannon-ES** to provide all those rules. We wrap it in our own class so the rest of the code doesn't have to know Cannon-ES details — they just call simple things like `addCube()` or `applyShockwave()`.

### The Two Types of Physics Bodies

**Static bodies** (mass = 0): Never move, no matter what hits them. The platform is static. You could drop a million cubes on it and it wouldn't budge.

**Dynamic bodies** (mass = 1): Move around, fall, bounce. The cubes are dynamic. They respond to gravity and to being hit by other cubes.

Every cube in the game is actually TWO things:
- A **Three.js mesh**: the colorful cube you see on screen
- A **Cannon-ES body**: an invisible box the physics engine thinks about

Each frame, after physics runs, we copy the body's position and rotation into the mesh. That's why the cubes look like they're actually falling and tumbling.

### Broadphase — Checking Collisions Efficiently

If we checked every cube against every other cube for collisions, that would be:
- 10 cubes → 45 checks per frame
- 100 cubes → 4,950 checks per frame
- 150 cubes → 11,175 checks per frame

That's too slow. So we use something called **SAP Broadphase** (Sweep and Prune). It's like organizing books on a shelf by size before searching — it quickly rules out pairs of objects that are obviously too far apart to be touching.

### Sleeping

A cube that has stopped moving is "put to sleep." While asleep, it does zero work — the physics engine completely ignores it. This is why a pile of 80 settled cubes barely costs any performance. As soon as something bumps them (or gravity changes), they wake up automatically.

### The Shockwave

When you click in click mode, the app sends a "shockwave" outward from the click point. For each cube within the radius:
```
strength = (1 - distance / radius) × force
```
This means cubes very close to the click get pushed hard, cubes at the edge get a tiny push. An extra upward push (`strength × 0.4`) is added so cubes pop up into the air rather than just sliding sideways — which looks much more satisfying.

### Troubleshooting Physics

**Cubes fall through the platform:**
- The platform physics body might not have been created. Check the browser console for errors during startup.
- In malleable mode, this can happen if the Heightfield didn't rebuild after deformation. Try clicking "Reset Scene."

**Cubes fly off to infinity:**
- The force multiplier is too high. Lower it in the UI.
- Or a bug caused `NaN` (Not a Number) to get into a position. Check the console — you'll see `NaN` in the error output.

**Physics is very slow with many cubes:**
- Lower `CONFIG.cubes.maxCount` in config.js.
- Raise `CONFIG.performance.targetFPS` so cleanup triggers sooner (e.g., change 30 to 45).

---

## 6. renderer.js — The Camera and Lights

### What Is Three.js?

Three.js is a library that makes 3D graphics in the browser much easier. Without it, you would need to write raw OpenGL shader code — very advanced stuff. Three.js handles all that, so we just say things like "add a cube here" and "put a light there."

### The Scene Graph

Everything visible lives in a `THREE.Scene`. Think of the scene as an empty room. You can add things to the room:
- Lights (so things are visible)
- Meshes (3D shapes with materials/colors)
- Fog (so far-away things fade out)
- A camera (your eye)

### The Three Lights

We use three lights to make things look 3D and interesting:

1. **Ambient light** (soft white, dim): Lights everything equally from all directions. Without it, surfaces pointing away from the sun would be completely black.

2. **Directional light** (bright white, from upper-right): This is the "sun." It casts shadows. It's the most important light. Shadows make cubes look like they're sitting ON the platform rather than floating above it.

3. **Fill light** (blue-tinted, from the left): Softly lights the dark side of cubes. Without this, the shadow side would look flat and lifeless.

4. **Rim light** (dim white, from below-behind): Adds a slight glow to the bottom edges of cubes. A professional lighting trick that adds depth.

### Shadow Maps

Shadows don't happen automatically. Here's how they work:
1. Three.js takes a "photo" of the scene from the sun's point of view, storing depth information in a 2048×2048 image (the shadow map).
2. During the normal render, it checks: is this surface visible from the sun, or is something blocking it?
3. If blocked → shadow. If visible → lit.

A 2048×2048 shadow map gives crisp, clean shadows. Smaller (like 512×512) would make shadows look fuzzy or blocky.

### Fog

Fog makes objects fade toward the background color as they get farther from the camera. We use `FogExp2` (exponential fog), which fades objects more quickly the farther they are — it looks more natural than linear fog. The fog color always matches the background so falling cubes seem to dissolve smoothly instead of abruptly disappearing.

### The Invisible Click Plane

When the user clicks in click mode, we need to know WHERE in 3D space they clicked. We can't just use the 2D screen coordinates. So we have a giant invisible flat plane sitting at the platform's height. We "shoot" a ray from the camera through the mouse position and check where it hits the invisible plane — that gives us the 3D world position of the click.

### Troubleshooting Renderer

**The screen is black:**
- Three.js probably crashed. Open the browser console and look for errors.
- The most common cause is a bad import — check that the importmap URLs in index.html are correct.

**Shadows look jagged/pixelated:**
- Increase the shadow map size: change `2048` to `4096` in renderer.js. (Uses more GPU memory.)
- Decrease `dirLight.shadow.bias` slightly (make it more negative, like `-0.002`).

**The scene is too dark or too bright:**
- Adjust the light intensities in `_buildLights()`. The numbers after the color are the intensity (1.0 = normal, 2.0 = double brightness).

---

## 7. platform.js — The Table

### Two Modes, Two Completely Different Systems

**Solid Mode** is simple:
- Visual: A `BoxGeometry` (a box shape) with a blue-gray material
- Physics: A static `CANNON.Box` body with the same size
- These match exactly with zero math needed

**Malleable Mode** is the hardest part of the whole project:
- Visual: A `PlaneGeometry` (a flat grid of triangles) that can be squished
- Physics: A `CANNON.Heightfield` — a physics shape that matches a bumpy surface
- Getting these two to align perfectly required careful math (explained below)

### Why Malleable Mode Is Tricky

The Three.js plane and the Cannon heightfield live in different coordinate systems. They don't automatically line up. If we just place them both at position (0, 0, 0), the physics collision surface ends up mirrored or offset from what you see.

To fix this, we had to figure out:
- Where to place the Cannon body so its collision surface lines up with the visible mesh
- How to flip one of the grid indices because the two libraries count grid rows in opposite directions

**In plain English:** Three.js numbers its grid rows front-to-back. Cannon-ES numbers its heightfield rows back-to-front (after rotation). So when we copy heights from the visual grid to the physics grid, we flip one of the indices: `k = segZ - iy`. Without this flip, the physics surface would be a mirror image of the visual surface — cubes would collide with empty air and fall through the visible platform.

### How Deformation Works

When you drag in malleable mode:
1. We shoot a ray from the camera through your mouse position to find the exact 3D point you're touching on the platform mesh
2. For every vertex within the brush radius of that point, we calculate how far it is from the center of the brush
3. We push that vertex up (or down for right-click) by an amount that depends on distance — vertices close to the center move a lot, vertices near the edge of the brush move a little
4. We update the Three.js vertex positions so you can see the change immediately
5. We rebuild the Cannon-ES physics body from the new heights (this is expensive, so we throttle it to max 5 times per second while dragging, and immediately when you release)

### Troubleshooting Platform

**Cubes fall through the malleable surface:**
- This is a known limitation when cubes are moving very fast. Try lowering the force multiplier.
- If it happens even with slow cubes, the heightfield rebuild may have failed. Try switching to Solid and back to Malleable.

**The platform disappears when switching modes:**
- This is intentional — we destroy the old mesh and physics body and build new ones.
- If it doesn't come back, check the console for errors in `_buildSolid()` or `_buildMalleable()`.

**Deformation feels laggy:**
- The brush radius or segment count is causing too many vertices to be processed. Lower `CONFIG.platform.elementSize` from 0.5 to 1.0 to use a coarser grid (faster but less detailed).

---

## 8. cubes.js — The Cubes

### Each Cube Is Two Things

As mentioned earlier, every cube is:
- A **Three.js mesh** — the colorful box you see
- A **Cannon-ES body** — the invisible box physics uses for collisions

They're created together, stored together in a `CubeEntry` object, and destroyed together.

### The Geometry Cache

Creating a 3D box shape takes a tiny bit of time because the computer has to calculate all the triangle vertices. If we create a fresh box shape for every cube, that adds up.

So instead we use a **cache** — a saved list. When we need a box of size 0.45, we check: "have I made a 0.45 box before?" If yes, reuse it. If no, make it and save it for next time. This is like keeping a collection of cookie cutters instead of carving a new shape each time you bake.

### The Lifecycle of a Cube

```
1. SPAWN
   → Create Three.js mesh + Cannon body
   → Give it a random downward velocity so it falls
   → Give it random spin so it tumbles
   → Add to entries[] list

2. ALIVE
   → Every frame: copy physics body position/rotation → mesh
   → The mesh follows the physics exactly

3. DEATH TRIGGER (one of two reasons)
   a) The cube fell below Y = -25 (fell off the platform, gone forever)
   b) The performance manager needs to free up space

4. REMOVING (the fade-out phase)
   → Physics body removed immediately (stops computing collisions)
   → Mesh scales from 1.0 → 0.0 over 0.4 seconds (smooth disappear)
   → Once scale = 0: remove from scene, dispose material, delete from list
```

The scale-down animation is important — without it, cubes would just "pop" out of existence which looks jarring. The 0.4 second shrink feels natural.

### Memory Management — Why We Call .dispose()

Three.js sends mesh data (vertex positions, colors) to the graphics card (GPU) memory. When we no longer need a mesh, we have to explicitly tell the GPU to free that memory by calling `material.dispose()`. If we forget, the GPU fills up with garbage data and the app eventually slows down or crashes. This is called a **memory leak**.

We do NOT call `geometry.dispose()` on cubes because the geometry is shared via the cache — other cubes might still be using the same shape. Only materials are unique per cube.

### Troubleshooting Cubes

**Cubes spawn but fly upward instead of falling:**
- The downward force sign is wrong. Check that `vy` in `spawnGroup()` is negative.

**Cubes spawn in the wrong place:**
- Check `CONFIG.spawn.height` (how high they appear) and `CONFIG.spawn.spread` (how spread out they are).

**Cubes never disappear even when they fall off the platform:**
- Check that `FALL_DEATH_Y` (-25) is below the bottom of the visible scene. If the platform Y position changes, this value might need updating too.

**The app is using more and more memory over time:**
- Somewhere, `material.dispose()` is not being called. Open browser dev tools → Memory tab → take a heap snapshot to find leaked materials.

---

## 9. ui.js — The Control Panel

### What It Does

This file reads the HTML panel and connects each control to the app. When you move a slider, it updates a number in `app.state`. When you click a button, it calls a method on `app`. That's it — ui.js doesn't do any 3D graphics or physics itself.

### The _el() Helper

```javascript
_el(id) { return document.getElementById(id) }
```

This is just a shortcut. Instead of writing `document.getElementById('sensitivity')` every time, we write `this._el('sensitivity')`. Saves typing.

### How Palette Swatches Are Built

Instead of writing six buttons in the HTML (which means updating two files every time you add a palette), the swatches are **generated by JavaScript** from the `PALETTES` object in config.js. This means:
- Add a palette to config.js → swatch appears automatically
- Remove a palette from config.js → swatch disappears automatically

### Troubleshooting UI

**A slider doesn't do anything:**
- The slider's `id` in index.html doesn't match what `_el()` is looking for in ui.js. Compare them carefully — they must be identical strings.

**The "Start Listening" button shows "Mic unavailable":**
- Microphone permission was denied, or the page isn't on HTTPS/localhost. See audio.js troubleshooting above.

**The panel toggle works but content doesn't show when expanded:**
- Check that the CSS `transform: translateX(...)` is being removed when the `collapsed` class is removed. Open browser dev tools → Elements tab → find `#ui-panel` → check its CSS.

**Palette swatches don't appear:**
- Look for an error in the console during startup. The `PALETTES` import from config.js might have failed.
- Check that the `id="palette-row"` element exists in index.html.

---

## 10. main.js — The Brain

### What It Does

main.js is the orchestrator. It:
1. Creates all the other systems in the right order
2. Connects them together (e.g., hooks audio's callback to cube spawning)
3. Listens for mouse/touch events
4. Runs the main loop every frame
5. Exposes simple methods (like `setGravity`, `resetScene`) that ui.js can call

### The State Object

```javascript
this.state = {
  mode: 'microphone',   // are we listening to the mic, or waiting for clicks?
  surfaceMode: 'solid', // is the platform solid or malleable?
  sensitivity: 1.0,     // multiplier for mic sensitivity
  forceMultiplier: 1.5, // multiplier for how hard cubes fall
  palette: 'neon',      // which color set to use
  bgColor: '#1a1a2e',   // the scene background color
  gravity: -20,         // current gravity strength
  isListening: false,   // is the microphone currently active?
}
```

This is the single source of truth for what the app is doing. Any code that needs to know the current mode or sensitivity reads from `this.state`.

### Mouse Coordinates (NDC)

Mouse positions from the browser are in pixels — like (847, 392). Three.js expects coordinates in **NDC** (Normalized Device Coordinates) — values between -1 and +1 — where (-1, -1) is the bottom-left and (1, 1) is the top-right.

The conversion is:
```
ndcX = (pixelX / screenWidth)  × 2 - 1     → range: -1 to +1
ndcY = (pixelY / screenHeight) × -2 + 1    → range: +1 to -1 (Y is flipped)
```

The Y is flipped because browser pixel Y starts at the top (0 = top), but NDC Y starts at the bottom (0 = center, 1 = top).

### Troubleshooting main.js

**Nothing happens when the page loads (black screen, no panel):**
- Open the console immediately. There will be an error on the very first line that fails.
- Most likely cause: one of the CDN imports failed (no internet, or esm.sh is down).
- Also check: does the `canvas-container` div exist in index.html with that exact ID?

**Clicking does nothing in Click mode:**
- Check `this.state.mode === 'click'` is being set correctly when the button is pressed.
- Add `console.log(this.state.mode)` inside `_onMouseDown` to see what mode is active.

**Mic triggers cubes even after switching to Click mode:**
- The `setMode()` function should stop the audio. Check if `app.audio.stop()` is being called.

---

## 11. How the Loop Works (The Heartbeat)

The main loop is the heartbeat of the application. It runs like this:

```
┌─────────────────────────────────────────────┐
│  requestAnimationFrame schedules next frame  │ ← happens 60+ times per second
│                                             │
│  1. Calculate delta time (dt)               │ ← "how long since last frame?"
│                                             │
│  2. Check microphone volume                 │ ← fires onSound() if loud enough
│                                             │
│  3. Step physics forward by dt seconds      │ ← cubes move, fall, collide
│                                             │
│  4. Sync all cube meshes → physics bodies   │ ← "follow the physics"
│                                             │
│  5. Draw the scene to the screen            │ ← render!
│                                             │
│  6. Performance check                       │ ← remove oldest cube if needed
│                                             │
│  7. Update FPS display (every 0.5 seconds)  │
└─────────────────────────────────────────────┘
```

### What Is Delta Time?

`dt` is "delta time" — the number of seconds since the last frame. On a smooth 60fps screen, `dt` is about 0.0167 seconds. On a slow computer running at 20fps, `dt` might be 0.05 seconds.

Physics uses `dt` to decide how far to move things. If a cube is falling at 10 units/second and dt = 0.016, it moves 0.16 units this frame. If dt = 0.05 (slow computer), it moves 0.5 units. This keeps the simulation consistent regardless of frame rate.

We cap `dt` at 0.05 seconds (20fps minimum). This prevents a "death spiral" where a slow frame causes a huge physics step that causes an even slower next frame.

### FPS Tracking

We keep a list of the last 60 delta times. The average of those gives us a smooth FPS number:
```
fps = 1 / average(last 60 frame times)
```

If FPS falls below 30, or cube count exceeds 150, we quietly remove the oldest cube. One cube per frame means you won't notice the cleanup — it just feels like the scene gradually lightens.

---

## 12. Troubleshooting Guide

A quick reference for the most common problems. Start with the browser console (F12 → Console tab) — it almost always tells you exactly what's wrong.

### The page loads but it's just a dark background, no panel, no 3D scene

**Check first:** Open the console. Is there a red error? If it says something about `Failed to resolve module` or `404`, the CDN imports failed.

**Fix:** Make sure the computer is connected to the internet. The page downloads Three.js and Cannon-ES from esm.sh every time (unless the browser has it cached).

**Alternative fix:** If you want this to work offline, download the library files and save them locally inside the `js/` folder, then update the importmap in index.html to point to the local files.

---

### The 3D scene appears but cubes never spawn (microphone mode)

**Step 1:** Did you click "Start Listening"? Nothing happens until you grant mic permission.

**Step 2:** Is the site on HTTPS or localhost? If the URL starts with `file://`, mic access is blocked by the browser for security. You must serve it through a web server (like `python3 -m http.server 8080`).

**Step 3:** Look for a yellow warning in the console that says "Microphone access failed." This means the browser denied permission. Click the lock/camera icon in the address bar and re-enable microphone access.

**Step 4:** Lower the threshold. Open the browser console and type: `window.__app.audio.update(5)` — this won't actually trigger anything but you can check `window.__app.audio.currentLevel` to see what level the mic is reading.

---

### Cubes spawn but fall through the platform

**In Solid mode:** The physics body for the platform didn't get created. Open the console — look for an error during startup in `_buildSolid()`.

**In Malleable mode:** This can happen when cubes move very fast. The physics engine is checking for collisions at fixed intervals (1/60 second). A fast-moving cube can "teleport" through a thin surface between checks. Fix: lower the Force multiplier so cubes fall slower.

---

### The app gets slower and slower over time (memory leak)

This means something isn't being cleaned up properly. The most common cause:

1. Open browser dev tools → Memory tab
2. Click "Take snapshot"
3. Play for a minute
4. Click "Take snapshot" again
5. Compare — what's growing?

Usually it's Three.js materials not being disposed. Check that `_executeRemove()` in cubes.js is calling `material.dispose()`.

---

### The malleable surface deformation is super laggy

The deformation loop visits every vertex in the grid — for a 24×16 grid that's 425 vertices per frame during drag. If this is slow:

**Quick fix:** Increase `CONFIG.platform.elementSize` from `0.5` to `1.0`. This halves the grid resolution (from 25×17 to 13×9 = 117 vertices) — much faster, slightly less smooth deformation.

---

### FPS display shows red numbers (below 30)

**Fast fix:** Click "Reset Scene" to clear all cubes. FPS should recover immediately.

**Permanent fix:** Lower `CONFIG.cubes.maxCount` from 150 to 80 or 100. The automatic cleanup will kick in sooner.

**Also try:** Switching from Malleable to Solid surface mode. The Heightfield physics body is slightly more expensive than a simple Box.

---

### You changed a number in config.js but nothing changed in the app

The browser cached the old version of the file. Hard-refresh the page:
- Mac: `Cmd + Shift + R`
- Windows: `Ctrl + Shift + R`

If still not working, open dev tools → Network tab → check "Disable cache" → refresh.
