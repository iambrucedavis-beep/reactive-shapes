// ============================================================
// renderer.js — The Camera and Lights
// ============================================================
// This file sets up everything you can SEE:
//   - The Three.js renderer (converts 3D data into pixels on screen)
//   - The scene (the "room" that holds all 3D objects)
//   - The camera (your viewpoint into the scene)
//   - The lights (without these, everything would be black)
//   - Fog (makes far objects fade into the background)
//   - An invisible plane used for click raycasting
//
// This file does NOT create cubes or the platform — those files
// add their own meshes into this.scene when they're created.
//
// QUICK TROUBLESHOOT:
//   Black screen     → Check browser console. Import or WebGL error.
//   No shadows       → Make sure mesh.castShadow/receiveShadow = true.
//   Scene too dark   → Raise ambient light intensity (currently 0.4).
//   Scene too bright → Lower dirLight intensity (currently 1.2).
// ============================================================

import * as THREE from 'three'
import { CONFIG } from './config.js'

export class SceneRenderer {

  // ---------------------------------------------------------------
  // constructor(container, bgColor)
  // ---------------------------------------------------------------
  // container: the HTML <div> element that will hold the canvas
  // bgColor:   starting background color as a CSS hex string '#1a1a2e'
  // ---------------------------------------------------------------
  constructor(container, bgColor = '#1a1a2e') {

    // --- The Scene -----------------------------------------------
    // The scene is like an empty room. Everything visible must be
    // added to it. Three.js walks through the scene each frame and
    // draws everything it finds.
    this.scene = new THREE.Scene()

    // --- The Camera ----------------------------------------------
    // PerspectiveCamera = things far away look smaller (like real life).
    // Alternative: OrthographicCamera = no perspective (flat look).
    // Parameters: (fieldOfView, aspectRatio, nearClip, farClip)
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov,                         // how wide the view is (degrees)
      window.innerWidth / window.innerHeight,     // screen width ÷ height
      0.1,   // nearClip: don't draw anything closer than 0.1 units
      500    // farClip:  don't draw anything farther than 500 units
    )

    // Position the camera in 3D space.
    const { x, y, z } = CONFIG.camera.position
    this.camera.position.set(x, y, z)
    // x=0: center, y=14: above the platform, z=22: in front of the scene.

    // Aim the camera at a point just above the platform center.
    this.camera.lookAt(
      CONFIG.camera.target.x,
      CONFIG.camera.target.y,
      CONFIG.camera.target.z
    )

    // --- The Renderer --------------------------------------------
    // The renderer takes the 3D scene + camera and produces a 2D image.
    // It uses WebGL (your graphics card) to do this very fast.
    // antialias: true = smooth edges (costs a small amount of GPU power)
    this.renderer = new THREE.WebGLRenderer({ antialias: true })

    // devicePixelRatio handles Retina/HiDPI screens (like MacBook displays).
    // A Retina screen has 2x as many pixels. We cap at 2 because going
    // higher (3x on some phones) gives tiny visual gains at huge GPU cost.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Make the canvas fill the entire browser window.
    this.renderer.setSize(window.innerWidth, window.innerHeight)

    // Enable shadow rendering. Without this line, no shadows appear at all.
    this.renderer.shadowMap.enabled = true

    // PCFSoftShadowMap = blurry, realistic shadow edges.
    // Alternative: THREE.BasicShadowMap = hard, pixel-looking edges (faster).
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Tell Three.js that colors are in sRGB color space (standard for screens).
    // Without this, colors can look washed out or too vivid.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    // Add the renderer's canvas element to the page so it appears on screen.
    container.appendChild(this.renderer.domElement)

    // Set background color and fog.
    this.setBackground(bgColor)

    // Add lights to the scene.
    this._buildLights()

    // Add the invisible click detection plane.
    this._buildInvisibleClickPlane()

    // Listen for window resize and adjust camera + renderer automatically.
    window.addEventListener('resize', this._onResize.bind(this))
    // .bind(this) is needed so that inside _onResize, 'this' still refers
    // to the SceneRenderer instance, not the window object.
  }

  // ---------------------------------------------------------------
  // _buildLights() — Add all lights to the scene
  // ---------------------------------------------------------------
  // We use 4 lights in total for a professional-looking result:
  //   1. Ambient   — fills in dark areas so nothing is pitch black
  //   2. Directional (main/sun) — creates shadows, main illumination
  //   3. Fill      — softly lights the shadow side of objects
  //   4. Rim       — adds subtle edge glow from behind/below
  // ---------------------------------------------------------------
  _buildLights() {

    // 1. AMBIENT LIGHT
    // Illuminates all surfaces equally from all directions.
    // Without this, faces pointing away from the sun would be pure black.
    // Intensity 0.4 = dim (intentionally — we want the sun to do most work).
    const ambient = new THREE.AmbientLight(0xffffff, 0.4)
    this.scene.add(ambient)

    // 2. DIRECTIONAL LIGHT (the "sun")
    // Casts parallel rays from a direction, like sunlight.
    // This is the main light source and is the only one that casts shadows.
    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
    this.dirLight.position.set(12, 24, 10)
    // Position doesn't matter for directional lights — only the DIRECTION
    // from position to origin matters. This creates light from upper-right-front.

    this.dirLight.castShadow = true // this light casts shadows onto objects

    // Shadow map size: higher = sharper, but uses more GPU memory.
    // 2048×2048 is a good balance for a medium-scale scene.
    // TROUBLESHOOT: Shadows look fuzzy? Try 4096×4096.
    this.dirLight.shadow.mapSize.set(2048, 2048)

    // The shadow camera defines the area that shadows are calculated for.
    // Think of it as "how much of the scene gets shadows."
    // These bounds must be large enough to cover the whole platform + cubes.
    this.dirLight.shadow.camera.near = 0.5
    this.dirLight.shadow.camera.far = 120
    this.dirLight.shadow.camera.left = -24
    this.dirLight.shadow.camera.right = 24
    this.dirLight.shadow.camera.top = 24
    this.dirLight.shadow.camera.bottom = -24
    // TROUBLESHOOT: Shadows appear cut off? Make these bounds larger.

    // Shadow bias corrects a common artifact called "shadow acne" —
    // a surface incorrectly casting a shadow on itself.
    // Small negative values fix this. Too negative = shadows float/detach.
    this.dirLight.shadow.bias = -0.001

    this.scene.add(this.dirLight)

    // 3. FILL LIGHT
    // Blue-tinted, comes from the left-back-below.
    // Softly illuminates the dark side of cubes so they don't look flat.
    // Intensity 0.35 = subtle (that's intentional — it's a fill, not a feature).
    const fill = new THREE.DirectionalLight(0x88aaff, 0.35)
    fill.position.set(-8, 6, -6)
    this.scene.add(fill)

    // 4. RIM LIGHT
    // Comes from below-behind. Creates a subtle bright edge on the bottom
    // of objects, helping them "pop" from the dark background.
    // Professional photographers use this trick with physical lights.
    const rim = new THREE.DirectionalLight(0xffffff, 0.2)
    rim.position.set(0, -5, -10)
    this.scene.add(rim)
  }

  // ---------------------------------------------------------------
  // _buildInvisibleClickPlane() — Hidden surface for click detection
  // ---------------------------------------------------------------
  // When the user clicks in click mode, we need a 3D world position.
  // We can't get that from screen coordinates alone — we need to
  // "shoot a ray" from the camera through the mouse position and find
  // where it hits something.
  //
  // This creates a giant invisible flat surface at the platform height.
  // The ray hits it and we get the exact 3D world coordinates of the click.
  //
  // TROUBLESHOOT: Click mode spawns cubes at wrong positions?
  //   Check that this plane's Y position matches CONFIG.platform.topY.
  // ---------------------------------------------------------------
  _buildInvisibleClickPlane() {
    // 200×200 world units — large enough that any click will hit it.
    const geo = new THREE.PlaneGeometry(200, 200)

    // visible: false makes it invisible but still raycastable.
    // DoubleSide means the ray hits it from above OR below.
    const mat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })

    this.clickPlane = new THREE.Mesh(geo, mat)

    // Rotate -90° around X so the plane lies flat (horizontal).
    // By default, PlaneGeometry faces toward the camera (vertical).
    this.clickPlane.rotation.x = -Math.PI / 2

    // Place it at the exact height of the platform top surface.
    this.clickPlane.position.y = CONFIG.platform.topY

    this.scene.add(this.clickPlane)
  }

  // ---------------------------------------------------------------
  // setBackground(color) — Change background and fog color
  // ---------------------------------------------------------------
  // Called at startup and when the user picks a new background color.
  // We always match the fog color to the background so distant cubes
  // fade into the background instead of into a wrong color.
  // ---------------------------------------------------------------
  setBackground(color) {
    const c = new THREE.Color(color) // converts '#1a1a2e' to an RGB object

    this.scene.background = c // the solid background behind everything

    // FogExp2 = exponential fog. Objects get hazier the farther they are.
    // 0.018 = fog density. Higher = thicker fog, objects disappear sooner.
    // TROUBLESHOOT: Cubes disappear too soon? Lower to 0.010.
    // TROUBLESHOOT: Scene looks hazy even up close? Lower to 0.005.
    this.scene.fog = new THREE.FogExp2(c, 0.018)
  }

  // ---------------------------------------------------------------
  // render() — Draw everything to the screen. Called every frame.
  // ---------------------------------------------------------------
  render() {
    // This single call does everything:
    //   - Clears the previous frame
    //   - Calculates what the camera can see
    //   - Draws every mesh with its material and lights
    //   - Applies shadows
    //   - Outputs pixels to the canvas
    this.renderer.render(this.scene, this.camera)
  }

  // ---------------------------------------------------------------
  // _onResize() — Handle browser window resize
  // ---------------------------------------------------------------
  // When the window is resized, the canvas and camera both need to
  // update or the image will look stretched.
  // ---------------------------------------------------------------
  _onResize() {
    // Update the camera's aspect ratio to match the new window shape.
    this.camera.aspect = window.innerWidth / window.innerHeight
    // Must call this after changing camera properties or Three.js won't
    // recalculate the projection matrix (the math that creates perspective).
    this.camera.updateProjectionMatrix()

    // Resize the canvas to match the new window size.
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  // ---------------------------------------------------------------
  // domElement (getter) — Returns the actual <canvas> HTML element
  // ---------------------------------------------------------------
  // Used by main.js to attach mouse/touch event listeners to the canvas.
  get domElement() {
    return this.renderer.domElement
  }
}
