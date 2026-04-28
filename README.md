# Reactive Shapes

An interactive browser-based art toy that responds to sound. Speak, clap, or play music — and watch groups of 3D cubes fall from above, stack on a floating platform, and react to your world in real time.

**[▶ Live Demo](https://your-url-here.vercel.app)**

---

## What It Does

Reactive Shapes listens to your microphone. When it hears a sound, it spawns a group of colorful cubes above the scene. Those cubes fall under gravity, land on a 3D platform, and pile up — tumbling and colliding with each other like real physical objects.

Over time the platform fills up, cubes get pushed off the edges, and the scene resets itself naturally. The result is something between a physics sandbox and a music visualizer.

---

## How to Use It

### Input Modes

**Microphone Mode** (default)
1. Click **Start Listening** to grant mic access
2. Make noise — talk, clap, play music
3. Louder sounds spawn more cubes that fall faster

**Click Mode**
- Switch to Click mode with the toggle at the top of the panel
- Click anywhere in the scene to spawn cubes
- Each click also sends a shockwave that pushes nearby cubes outward

### Controls

| Control | What it does |
|---|---|
| **Sensitivity** | How loud the mic needs to be before cubes spawn |
| **Force** | How hard cubes fall when spawned |
| **Gravity** | The strength of gravity — drag left for floaty, right for fast |
| **Surface: Solid** | The platform behaves like a normal rigid table |
| **Surface: Malleable** | Click and drag on the platform to sculpt it — push cubes off ledges you create |
| **Color Palette** | Choose from Neon, Pastel, Earth, Fire, Ice, or Mono themes |
| **Background** | Change the scene background and fog color |
| **Reset Scene** | Remove all cubes and restore the platform |

---

## What Makes It Interesting

**It's genuinely physics-based.** The cubes aren't animated on rails — they fall, rotate, bounce, and stack according to a real physics simulation running in your browser. Every session looks different.

**It responds to actual sound.** The app measures the volume of your microphone dozens of times per second. The louder the sound, the more cubes spawn and the faster they fall. A quiet room produces trickles; a clap produces an avalanche.

**It manages itself.** If too many cubes accumulate and performance starts to drop, the oldest cubes are automatically and gradually removed so the experience stays smooth.

**No installation.** It runs entirely in the browser — nothing to download, nothing to install. Open the link and it works.

---

## Tech Stack

| Technology | Role |
|---|---|
| **Three.js** | 3D rendering — draws everything you see using WebGL |
| **Cannon-ES** | Physics simulation — gravity, collisions, stacking |
| **Web Audio API** | Microphone input and volume analysis |
| **Vanilla JavaScript** | All app logic — no React, no framework |

The entire project is plain HTML, CSS, and JavaScript files. There is no build process — the browser loads the files directly. Libraries are pulled from a public CDN, so nothing needs to be installed locally.

---

## Running Locally

No server needed for Click mode. For Microphone mode, browsers require a local server (mic access is blocked on `file://` URLs for security reasons).

```bash
# If you have Python installed:
python3 -m http.server 8080
# Then open http://localhost:8080
```

---

## Browser Support

Works in any modern browser — Chrome, Firefox, Safari, or Edge. Microphone access requires HTTPS (or localhost). Does not work in Internet Explorer.

---

*Built with Three.js · Cannon-ES · Web Audio API*
