// ============================================================
// config.js — The Settings File
// ============================================================
// Think of this file as the "cheat sheet" for the whole app.
// Every important number lives here in one place.
// If something feels wrong (cubes too fast, mic too sensitive,
// too many cubes on screen), THIS is the first file to adjust.
//
// HOW TO USE IT:
//   Change a number → save → hard-refresh the browser (Cmd+Shift+R).
//   The whole app will immediately use the new value.
// ============================================================

export const CONFIG = {

  // --- PHYSICS ---------------------------------------------------
  // Rules for how the "gravity simulator" behaves.
  physics: {
    gravity: -20,
    // Negative = downward (Y-axis points up in 3D, so down is negative).
    // -5  = floaty, slow fall (like the moon)
    // -20 = normal (like Earth, roughly)
    // -50 = very heavy, fast crash (like Jupiter)
    // The slider in the UI lets users change this while running.

    fixedTimeStep: 1 / 60,
    // Physics always runs at this speed: 1/60th of a second per step.
    // This keeps the simulation consistent even if the screen is slow.
    // Do NOT change this unless you really know what you're doing —
    // it affects how collisions are calculated internally.

    maxSubSteps: 3,
    // If a frame takes too long, physics catches up by running up to
    // 3 mini-steps. This prevents cubes from "teleporting" through
    // the platform when the computer is under heavy load.
    // TROUBLESHOOT: If cubes fall through the platform on slow machines,
    // try raising this to 5 or 8.
  },

  // --- SPAWN -----------------------------------------------------
  // Controls when and where groups of cubes appear.
  spawn: {
    height: 14,
    // How high above the platform cubes appear (in world units).
    // The platform top is at Y=0, so cubes appear at Y=14.
    // TROUBLESHOOT: If cubes spawn inside the platform, raise this number.

    groupSizeMin: 3,
    groupSizeMax: 8,
    // A quiet sound spawns groupSizeMin cubes.
    // A loud sound spawns groupSizeMax cubes.
    // Values in between are chosen based on sound intensity.

    cooldown: 1000,
    // Minimum milliseconds between spawns (1000ms = 1 second).
    // Even if the mic is constantly loud, cubes only spawn once per second.
    // TROUBLESHOOT: If the app lags from too many cubes spawning at once,
    // raise this to 1500 or 2000.

    spread: 4,
    // How wide the spawn area is (in world units).
    // 4 means cubes can appear anywhere within 2 units left or right
    // of center (or the click position).
  },

  // --- CUBES -----------------------------------------------------
  // Controls how individual cubes look and when they get cleaned up.
  cubes: {
    sizeMin: 0.35,
    sizeMax: 0.75,
    // Each cube gets a random size between these two values.
    // 1.0 = one world unit, which is roughly the size of a large block.
    // Smaller cubes look more chaotic; larger cubes look more dramatic.

    maxCount: 150,
    // Maximum number of cubes allowed at the same time.
    // When this limit is hit, the oldest cube is removed each frame.
    // TROUBLESHOOT: App running slow? Lower this to 80 or 100.
    // Powerful computer? You can try raising it to 200 or 250.

    cleanupThreshold: 130,
    // Not currently used directly in the loop — kept for future use.
    // The active cleanup logic in main.js uses maxCount directly.
  },

  // --- PLATFORM --------------------------------------------------
  // Size and position of the floating table.
  platform: {
    width: 12,
    // How wide the platform is (left to right, X axis).

    depth: 8,
    // How deep the platform is (front to back, Z axis).

    thickness: 0.6,
    // How tall the solid-mode box is (how thick the table is).
    // This is only visible in Solid mode — Malleable mode is a flat plane.

    topY: 0,
    // The Y position of the TOP surface of the platform.
    // 0 means the surface is at the center of the world.
    // Cubes spawn at Y=14 (CONFIG.spawn.height) and fall down to Y=0.

    elementSize: 0.5,
    // Only used in Malleable mode. The spacing between grid points (in world units).
    // 0.5 = one grid square is 0.5×0.5 world units.
    // Smaller = more detailed surface, but slower deformation.
    // Larger = less detailed but faster.
    // TROUBLESHOOT: Malleable mode is laggy? Change this to 1.0.
  },

  // --- PERFORMANCE -----------------------------------------------
  // Controls when the app starts removing cubes to stay smooth.
  performance: {
    targetFPS: 30,
    // If the frame rate drops below this, start removing the oldest cube.
    // 30 = only clean up when things are already struggling.
    // 45 = more aggressive cleanup, keeps things smoother on weak machines.

    fpsWindowSize: 60,
    // How many recent frames to average when calculating FPS.
    // 60 frames = roughly 1 second of history.
    // More frames = smoother FPS reading but slower to react to changes.
  },

  // --- AUDIO -----------------------------------------------------
  // Controls how the microphone is used.
  audio: {
    fftSize: 256,
    // How many frequency "buckets" the analyser uses.
    // 256 means 128 usable frequency buckets (half of fftSize).
    // Larger = more detail, but we only need an average, so 256 is plenty.
    // Must be a power of 2: 128, 256, 512, 1024, etc.

    smoothing: 0.85,
    // Built-in smoothing in the Web Audio analyser (0 to 1).
    // 0 = no smoothing, values jump around wildly.
    // 0.85 = heavily smoothed, reacts slowly but steadily.
    // 1.0 = frozen, never changes.

    threshold: 14,
    // How loud the mic must be before cubes spawn (scale: 0 to 255).
    // 14 = reacts to normal speech and moderate sounds.
    // TROUBLESHOOT: Cubes spawn constantly in silence? Raise to 25 or 30.
    // TROUBLESHOOT: Cubes never spawn even when loud? Lower to 5 or 8.

    cooldown: 900,
    // Milliseconds between allowed triggers.
    // 900ms = can trigger at most about once per second.
    // Prevents one loud sound from spawning 20 groups of cubes.
  },

  // --- CAMERA ----------------------------------------------------
  // Where the viewer's "eye" is in the 3D world.
  camera: {
    fov: 55,
    // Field of view in degrees. Like the zoom on a camera lens.
    // Lower = zoomed in (narrow angle).
    // Higher = zoomed out / fish-eye feel (wide angle).
    // 55 is a natural, comfortable viewing angle.

    position: { x: 0, y: 14, z: 22 },
    // Where the camera sits in 3D space.
    // x=0: centered left-right
    // y=14: 14 units above the platform
    // z=22: 22 units in front of the scene (toward the viewer)

    target: { x: 0, y: 2, z: 0 },
    // Where the camera points. Slightly above the platform center
    // so the stacking area is nicely framed.
  },
}

// ============================================================
// PALETTES — Color Themes
// ============================================================
// Each palette has:
//   name:    What appears in the UI tooltip
//   colors:  Hex color values for Three.js (format: 0xRRGGBB)
//   preview: The same colors as CSS strings (format: '#RRGGBB')
//            Used to render the colored dots in the UI panel.
//
// HOW TO ADD A NEW PALETTE:
//   1. Add a new entry here with a unique key (like 'ocean').
//   2. Provide 5 colors in both formats.
//   3. The UI swatch will appear automatically — no HTML needed!
// ============================================================

export const PALETTES = {
  neon: {
    name: 'Neon',
    // Hot pink, orange, yellow, blue, purple — bold and vivid.
    colors: [0xff006e, 0xfb5607, 0xffbe0b, 0x3a86ff, 0x8338ec],
    preview: ['#ff006e', '#fb5607', '#ffbe0b', '#3a86ff', '#8338ec'],
  },
  pastel: {
    name: 'Pastel',
    // Soft pink, lavender, light blue, mint, cream — gentle and dreamy.
    colors: [0xffd6e7, 0xc8b6ff, 0xbde0fe, 0xcaffbf, 0xfdffb6],
    preview: ['#ffd6e7', '#c8b6ff', '#bde0fe', '#caffbf', '#fdffb6'],
  },
  earth: {
    name: 'Earth',
    // Browns, tans, and greens — natural, grounded tones.
    colors: [0x8b5e3c, 0xa67c52, 0xd4b896, 0x7a9e7e, 0x4a7c59],
    preview: ['#8b5e3c', '#a67c52', '#d4b896', '#7a9e7e', '#4a7c59'],
  },
  fire: {
    name: 'Fire',
    // Reds, oranges, yellows — like flames.
    colors: [0xef233c, 0xd62828, 0xf77f00, 0xfcbf49, 0xeae2b7],
    preview: ['#ef233c', '#d62828', '#f77f00', '#fcbf49', '#eae2b7'],
  },
  ice: {
    name: 'Ice',
    // Cool teals, slate blues — cold and crisp.
    colors: [0xa8dadc, 0x457b9d, 0xe0fbfc, 0x98c1d9, 0x3d5a80],
    preview: ['#a8dadc', '#457b9d', '#e0fbfc', '#98c1d9', '#3d5a80'],
  },
  mono: {
    name: 'Mono',
    // White to black — classic grayscale.
    colors: [0xffffff, 0xcccccc, 0x888888, 0x555555, 0x222222],
    preview: ['#ffffff', '#cccccc', '#888888', '#555555', '#222222'],
  },
}
