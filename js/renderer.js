import * as THREE from 'three'
import { CONFIG } from './config.js'

export class SceneRenderer {
  constructor(container, bgColor = '#1a1a2e') {
    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    )
    const { x, y, z } = CONFIG.camera.position
    this.camera.position.set(x, y, z)
    this.camera.lookAt(CONFIG.camera.target.x, CONFIG.camera.target.y, CONFIG.camera.target.z)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    this.setBackground(bgColor)
    this._buildLights()
    this._buildInvisibleClickPlane()

    window.addEventListener('resize', this._onResize.bind(this))
  }

  _buildLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.4)
    this.scene.add(ambient)

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
    this.dirLight.position.set(12, 24, 10)
    this.dirLight.castShadow = true
    this.dirLight.shadow.mapSize.set(2048, 2048)
    this.dirLight.shadow.camera.near = 0.5
    this.dirLight.shadow.camera.far = 120
    this.dirLight.shadow.camera.left = -24
    this.dirLight.shadow.camera.right = 24
    this.dirLight.shadow.camera.top = 24
    this.dirLight.shadow.camera.bottom = -24
    this.dirLight.shadow.bias = -0.001
    this.scene.add(this.dirLight)

    const fill = new THREE.DirectionalLight(0x88aaff, 0.35)
    fill.position.set(-8, 6, -6)
    this.scene.add(fill)

    const rim = new THREE.DirectionalLight(0xffffff, 0.2)
    rim.position.set(0, -5, -10)
    this.scene.add(rim)
  }

  // Invisible horizontal plane used for click-mode raycasting
  _buildInvisibleClickPlane() {
    const geo = new THREE.PlaneGeometry(200, 200)
    const mat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    this.clickPlane = new THREE.Mesh(geo, mat)
    this.clickPlane.rotation.x = -Math.PI / 2
    this.clickPlane.position.y = CONFIG.platform.topY
    this.scene.add(this.clickPlane)
  }

  setBackground(color) {
    const c = new THREE.Color(color)
    this.scene.background = c
    this.scene.fog = new THREE.FogExp2(c, 0.018)
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  get domElement() {
    return this.renderer.domElement
  }
}
