export const CONFIG = {
  physics: {
    gravity: -20,
    fixedTimeStep: 1 / 60,
    maxSubSteps: 3,
  },
  spawn: {
    height: 14,
    groupSizeMin: 3,
    groupSizeMax: 8,
    cooldown: 1000,
    spread: 4,
  },
  cubes: {
    sizeMin: 0.35,
    sizeMax: 0.75,
    maxCount: 150,
    cleanupThreshold: 130,
  },
  platform: {
    width: 12,
    depth: 8,
    thickness: 0.6,
    topY: 0,
    elementSize: 0.5,
  },
  performance: {
    targetFPS: 30,
    fpsWindowSize: 60,
  },
  audio: {
    fftSize: 256,
    smoothing: 0.85,
    threshold: 14,
    cooldown: 900,
  },
  camera: {
    fov: 55,
    position: { x: 0, y: 14, z: 22 },
    target: { x: 0, y: 2, z: 0 },
  },
}

export const PALETTES = {
  neon: {
    name: 'Neon',
    colors: [0xff006e, 0xfb5607, 0xffbe0b, 0x3a86ff, 0x8338ec],
    preview: ['#ff006e', '#fb5607', '#ffbe0b', '#3a86ff', '#8338ec'],
  },
  pastel: {
    name: 'Pastel',
    colors: [0xffd6e7, 0xc8b6ff, 0xbde0fe, 0xcaffbf, 0xfdffb6],
    preview: ['#ffd6e7', '#c8b6ff', '#bde0fe', '#caffbf', '#fdffb6'],
  },
  earth: {
    name: 'Earth',
    colors: [0x8b5e3c, 0xa67c52, 0xd4b896, 0x7a9e7e, 0x4a7c59],
    preview: ['#8b5e3c', '#a67c52', '#d4b896', '#7a9e7e', '#4a7c59'],
  },
  fire: {
    name: 'Fire',
    colors: [0xef233c, 0xd62828, 0xf77f00, 0xfcbf49, 0xeae2b7],
    preview: ['#ef233c', '#d62828', '#f77f00', '#fcbf49', '#eae2b7'],
  },
  ice: {
    name: 'Ice',
    colors: [0xa8dadc, 0x457b9d, 0xe0fbfc, 0x98c1d9, 0x3d5a80],
    preview: ['#a8dadc', '#457b9d', '#e0fbfc', '#98c1d9', '#3d5a80'],
  },
  mono: {
    name: 'Mono',
    colors: [0xffffff, 0xcccccc, 0x888888, 0x555555, 0x222222],
    preview: ['#ffffff', '#cccccc', '#888888', '#555555', '#222222'],
  },
}
