// Three.js 3D City Skyline Scene for Hero Section
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class Hero3DScene {
    constructor() {
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.skyline = null;
        this.animationId = null;

        this.init();
    }

    init() {
        // Create container
        this.createContainer();

        // Setup Three.js
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLights();
        this.setupControls();

        // Create 3D skyline
        this.createCitySkyline();

        // Start animation
        this.animate();

        // Handle resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    createContainer() {
        const heroSection = document.querySelector('.lr-hero');
        if (!heroSection) return;

        this.container = document.createElement('div');
        this.container.id = 'hero-3d-canvas';
        this.container.style.cssText = `
      position: absolute;
      top: 0;
      right: 0;
      width: 50%;
      height: 100%;
      pointer-events: auto;
      z-index: 1;
    `;

        heroSection.appendChild(this.container);
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = null; // Transparent background
    }

    setupCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
        this.camera.position.set(0, 2, 6);
        this.camera.lookAt(0, 1.5, 0);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);
    }

    setupLights() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Main directional light (key light)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.left = -5;
        directionalLight.shadow.camera.right = 5;
        directionalLight.shadow.camera.top = 5;
        directionalLight.shadow.camera.bottom = -5;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        this.scene.add(directionalLight);

        // Accent lights for modern feel
        const accentLight1 = new THREE.PointLight(0x4A90E2, 0.6, 10);
        accentLight1.position.set(-3, 2, 2);
        this.scene.add(accentLight1);

        const accentLight2 = new THREE.PointLight(0x7E57C2, 0.4, 10);
        accentLight2.position.set(3, 2, 2);
        this.scene.add(accentLight2);
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 4;
        this.controls.maxDistance = 12;
        this.controls.maxPolarAngle = Math.PI / 2;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 1.0;
        this.controls.enablePan = false;
    }

    createCitySkyline() {
        this.skyline = new THREE.Group();

        // Building configurations: [width, height, depth, x-position, z-position, color]
        const buildings = [
            [0.4, 2.8, 0.4, -1.5, 0, 0x4A90E2],   // Tall blue building (left)
            [0.5, 2.0, 0.5, -0.7, 0, 0x5C6BC0],   // Medium purple building
            [0.35, 3.5, 0.35, 0.1, 0, 0x42A5F5],  // Tallest light blue (center)
            [0.45, 2.5, 0.45, 0.8, 0, 0x7E57C2],  // Medium-tall purple
            [0.38, 1.8, 0.38, 1.5, 0, 0x5E35B1],  // Short purple building (right)
            [0.3, 2.2, 0.3, -1.0, -0.5, 0x3F51B5], // Back row building
            [0.32, 1.6, 0.32, 0.4, -0.5, 0x5C6BC0], // Back row building
        ];

        buildings.forEach(([width, height, depth, xPos, zPos, color]) => {
            const building = this.createBuilding(width, height, depth, color);
            building.position.set(xPos, 0, zPos);
            this.skyline.add(building);
        });

        // Ground platform
        const platformGeometry = new THREE.BoxGeometry(5, 0.1, 2);
        const platformMaterial = new THREE.MeshStandardMaterial({
            color: 0x2C3E50,
            metalness: 0.3,
            roughness: 0.7
        });
        const platform = new THREE.Mesh(platformGeometry, platformMaterial);
        platform.position.y = -0.05;
        platform.receiveShadow = true;
        this.skyline.add(platform);

        this.scene.add(this.skyline);
    }

    createBuilding(width, height, depth, color) {
        const buildingGroup = new THREE.Group();

        // Main building body
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshStandardMaterial({
            color: color,
            metalness: 0.4,
            roughness: 0.3
        });
        const building = new THREE.Mesh(geometry, material);
        building.position.y = height / 2;
        building.castShadow = true;
        building.receiveShadow = true;
        buildingGroup.add(building);

        // Windows (grid pattern)
        const windowGeometry = new THREE.BoxGeometry(width * 0.15, height * 0.06, 0.02);
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFACD,
            emissive: 0xFFFF88,
            emissiveIntensity: 0.5
        });

        const windowsPerRow = Math.max(2, Math.floor(width / 0.15));
        const windowsPerColumn = Math.max(3, Math.floor(height / 0.25));

        for (let row = 0; row < windowsPerColumn; row++) {
            for (let col = 0; col < windowsPerRow; col++) {
                // Front face windows
                const windowFront = new THREE.Mesh(windowGeometry, windowMaterial);
                const xOffset = (col - (windowsPerRow - 1) / 2) * width / windowsPerRow * 0.8;
                const yOffset = (row - (windowsPerColumn - 1) / 2) * height / windowsPerColumn * 0.9 + height / 2;

                windowFront.position.set(xOffset, yOffset, depth / 2 + 0.01);
                buildingGroup.add(windowFront);

                // Back face windows
                const windowBack = windowFront.clone();
                windowBack.position.set(xOffset, yOffset, -depth / 2 - 0.01);
                buildingGroup.add(windowBack);

                // Side windows
                if (col === 0 || col === windowsPerRow - 1) {
                    const windowSide = new THREE.Mesh(
                        new THREE.BoxGeometry(0.02, height * 0.06, depth * 0.15),
                        windowMaterial
                    );
                    const sideX = col === 0 ? -width / 2 - 0.01 : width / 2 + 0.01;
                    windowSide.position.set(sideX, yOffset, 0);
                    buildingGroup.add(windowSide);
                }
            }
        }

        // Rooftop detail (antenna/spire on taller buildings)
        if (height > 2.3) {
            const antennaGeometry = new THREE.CylinderGeometry(0.015, 0.015, 0.5);
            const antennaMaterial = new THREE.MeshStandardMaterial({
                color: 0xFF6B6B,
                emissive: 0xFF0000,
                emissiveIntensity: 0.3
            });
            const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
            antenna.position.y = height + 0.25;
            buildingGroup.add(antenna);

            // Blinking light on top
            const lightGeometry = new THREE.SphereGeometry(0.03, 8, 8);
            const lightMaterial = new THREE.MeshStandardMaterial({
                color: 0xFF0000,
                emissive: 0xFF0000,
                emissiveIntensity: 1.0
            });
            const light = new THREE.Mesh(lightGeometry, lightMaterial);
            light.position.y = height + 0.5;
            buildingGroup.add(light);
        }

        // Rooftop edge detail
        const edgeGeometry = new THREE.BoxGeometry(width + 0.02, 0.05, depth + 0.02);
        const edgeMaterial = new THREE.MeshStandardMaterial({
            color: 0x34495E,
            metalness: 0.6,
            roughness: 0.4
        });
        const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        edge.position.y = height;
        buildingGroup.add(edge);

        return buildingGroup;
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        if (!this.container) return;

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }

        window.removeEventListener('resize', () => this.onWindowResize());
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new Hero3DScene();
    });
} else {
    new Hero3DScene();
}
