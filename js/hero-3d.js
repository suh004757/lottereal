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

        // Modern building configurations: [width, height, depth, x-position, z-position, color, type]
        const buildings = [
            [0.4, 2.8, 0.4, -1.5, 0, 0x1E88E5, 'glass'],      // Tall glass tower (left)
            [0.5, 2.0, 0.5, -0.7, 0, 0x5E35B1, 'metallic'],   // Medium metallic building
            [0.35, 3.5, 0.35, 0.1, 0, 0x0D47A1, 'glass'],     // Tallest glass tower (center)
            [0.45, 2.5, 0.45, 0.8, 0, 0x512DA8, 'metallic'],  // Medium-tall metallic
            [0.38, 1.8, 0.38, 1.5, 0, 0x1976D2, 'glass'],     // Glass building (right)
            [0.3, 2.2, 0.3, -1.0, -0.5, 0x283593, 'metallic'], // Back row metallic
            [0.32, 1.6, 0.32, 0.4, -0.5, 0x1565C0, 'glass'],  // Back row glass
        ];

        buildings.forEach(([width, height, depth, xPos, zPos, color, type]) => {
            const building = this.createModernBuilding(width, height, depth, color, type);
            building.position.set(xPos, 0, zPos);
            this.skyline.add(building);
        });

        // Modern platform with lighting
        const platformGeometry = new THREE.BoxGeometry(5, 0.15, 2);
        const platformMaterial = new THREE.MeshStandardMaterial({
            color: 0x1A237E,
            metalness: 0.7,
            roughness: 0.3,
            emissive: 0x0D47A1,
            emissiveIntensity: 0.1
        });
        const platform = new THREE.Mesh(platformGeometry, platformMaterial);
        platform.position.y = -0.075;
        platform.receiveShadow = true;
        this.skyline.add(platform);

        // Add edge lighting to platform
        const edgeGeometry = new THREE.BoxGeometry(5.1, 0.02, 2.1);
        const edgeMaterial = new THREE.MeshStandardMaterial({
            color: 0x64B5F6,
            emissive: 0x2196F3,
            emissiveIntensity: 0.5
        });
        const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        edge.position.y = 0;
        this.skyline.add(edge);

        this.scene.add(this.skyline);
    }

    createModernBuilding(width, height, depth, color, type) {
        const buildingGroup = new THREE.Group();

        // Choose material based on type
        let material;
        if (type === 'glass') {
            material = new THREE.MeshPhysicalMaterial({
                color: color,
                metalness: 0.1,
                roughness: 0.05,
                transparent: true,
                opacity: 0.4,
                transmission: 0.9,
                thickness: 0.5,
                envMapIntensity: 1.5,
                clearcoat: 1.0,
                clearcoatRoughness: 0.1
            });
        } else {
            material = new THREE.MeshStandardMaterial({
                color: color,
                metalness: 0.8,
                roughness: 0.2,
                emissive: color,
                emissiveIntensity: 0.1
            });
        }

        // Main building body
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const building = new THREE.Mesh(geometry, material);
        building.position.y = height / 2;
        building.castShadow = true;
        building.receiveShadow = true;
        buildingGroup.add(building);

        // Modern window strips (horizontal bands)
        const stripCount = Math.floor(height / 0.3);
        for (let i = 0; i < stripCount; i++) {
            const stripGeometry = new THREE.BoxGeometry(width * 0.95, 0.02, depth * 0.95);
            const stripMaterial = new THREE.MeshStandardMaterial({
                color: 0x90CAF9,
                emissive: 0x64B5F6,
                emissiveIntensity: 0.6,
                metalness: 0.9,
                roughness: 0.1
            });
            const strip = new THREE.Mesh(stripGeometry, stripMaterial);
            strip.position.y = (i / stripCount) * height + 0.1;
            buildingGroup.add(strip);
        }

        // Vertical accent lines
        const accentPositions = [
            [-width / 3, 0],
            [width / 3, 0],
            [0, -depth / 3],
            [0, depth / 3]
        ];

        accentPositions.forEach(([x, z]) => {
            const accentGeometry = new THREE.BoxGeometry(
                x !== 0 ? 0.015 : depth * 0.95,
                height,
                z !== 0 ? 0.015 : width * 0.95
            );
            const accentMaterial = new THREE.MeshStandardMaterial({
                color: 0xE3F2FD,
                emissive: 0x2196F3,
                emissiveIntensity: 0.3,
                metalness: 0.9,
                roughness: 0.1
            });
            const accent = new THREE.Mesh(accentGeometry, accentMaterial);
            accent.position.set(x, height / 2, z);
            buildingGroup.add(accent);
        });

        // Rooftop features
        if (height > 2.3) {
            // Modern antenna structure
            const antennaGroup = new THREE.Group();

            // Main antenna pole
            const poleGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.6);
            const poleMaterial = new THREE.MeshStandardMaterial({
                color: 0xCFD8DC,
                metalness: 0.9,
                roughness: 0.1
            });
            const pole = new THREE.Mesh(poleGeometry, poleMaterial);
            pole.position.y = height + 0.3;
            antennaGroup.add(pole);

            // Antenna rings
            for (let i = 0; i < 3; i++) {
                const ringGeometry = new THREE.TorusGeometry(0.08 - i * 0.02, 0.008, 8, 16);
                const ringMaterial = new THREE.MeshStandardMaterial({
                    color: 0xFF5252,
                    emissive: 0xFF1744,
                    emissiveIntensity: 0.8,
                    metalness: 0.8,
                    roughness: 0.2
                });
                const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                ring.position.y = height + 0.15 + i * 0.15;
                ring.rotation.x = Math.PI / 2;
                antennaGroup.add(ring);
            }

            // Top light
            const lightGeometry = new THREE.SphereGeometry(0.04, 16, 16);
            const lightMaterial = new THREE.MeshStandardMaterial({
                color: 0xFF1744,
                emissive: 0xFF1744,
                emissiveIntensity: 2.0,
                metalness: 0.5,
                roughness: 0.2
            });
            const light = new THREE.Mesh(lightGeometry, lightMaterial);
            light.position.y = height + 0.6;
            antennaGroup.add(light);

            buildingGroup.add(antennaGroup);
        }

        // Modern rooftop edge with lighting
        const roofEdgeGeometry = new THREE.BoxGeometry(width + 0.03, 0.08, depth + 0.03);
        const roofEdgeMaterial = new THREE.MeshStandardMaterial({
            color: 0x37474F,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0x546E7A,
            emissiveIntensity: 0.2
        });
        const roofEdge = new THREE.Mesh(roofEdgeGeometry, roofEdgeMaterial);
        roofEdge.position.y = height;
        buildingGroup.add(roofEdge);

        // Rooftop glow strip
        const glowStripGeometry = new THREE.BoxGeometry(width + 0.04, 0.01, depth + 0.04);
        const glowStripMaterial = new THREE.MeshStandardMaterial({
            color: 0x00BCD4,
            emissive: 0x00BCD4,
            emissiveIntensity: 1.0
        });
        const glowStrip = new THREE.Mesh(glowStripGeometry, glowStripMaterial);
        glowStrip.position.y = height + 0.04;
        buildingGroup.add(glowStrip);

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
