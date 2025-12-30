/**
 * Hero3D.js - 3D 히어로 씬
 * Three.js를 사용하여 도시 스카이라인을 3D로 렌더링하는 히어로 섹션입니다.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * 히어로 섹션용 3D 도시 스카이라인 씬 클래스
 */
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

    /**
     * 씬을 초기화합니다.
     */
    init() {
        // 컨테이너 생성
        this.createContainer();

        // Three.js 설정
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLights();
        this.setupControls();

        // 3D 도시 스카이라인 생성
        this.createCitySkyline();

        // 애니메이션 시작
        this.animate();

        // 리사이즈 핸들러
        window.addEventListener('resize', () => this.onWindowResize());
    }

    /**
     * 3D 캔버스 컨테이너를 생성합니다.
     */
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

    /**
     * Three.js 씬을 설정합니다.
     */
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = null; // 투명 배경
    }

    /**
     * 카메라를 설정합니다.
     */
    setupCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
        this.camera.position.set(0, 2, 6);
        this.camera.lookAt(0, 1.5, 0);
    }

    /**
     * 렌더러를 설정합니다.
     */
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

    /**
     * 조명 설정을 합니다.
     */
    setupLights() {
        // 주변광
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // 메인 방향광 (키 라이트)
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

        // 액센트 조명
        const accentLight1 = new THREE.PointLight(0x4A90E2, 0.6, 10);
        accentLight1.position.set(-3, 2, 2);
        this.scene.add(accentLight1);

        const accentLight2 = new THREE.PointLight(0x7E57C2, 0.4, 10);
        accentLight2.position.set(3, 2, 2);
        this.scene.add(accentLight2);
    }

    /**
     * 카메라 컨트롤을 설정합니다.
     */
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

    /**
     * 도시 스카이라인을 생성합니다.
     */
    createCitySkyline() {
        this.skyline = new THREE.Group();

        // 현대적인 건물 설정: [너비, 높이, 깊이, x위치, z위치, 색상, 타입]
        const buildings = [
            [0.4, 2.8, 0.4, -1.5, 0, 0x1E88E5, 'glass'],      // 왼쪽 유리 타워 (높음)
            [0.5, 2.0, 0.5, -0.7, 0, 0x5E35B1, 'metallic'],   // 금속 건물 (중간)
            [0.35, 3.5, 0.35, 0.1, 0, 0x0D47A1, 'glass'],     // 중앙 유리 타워 (가장 높음)
            [0.45, 2.5, 0.45, 0.8, 0, 0x512DA8, 'metallic'],  // 금속 건물 (중간-높음)
            [0.38, 1.8, 0.38, 1.5, 0, 0x1976D2, 'glass'],     // 오른쪽 유리 건물
            [0.3, 2.2, 0.3, -1.0, -0.5, 0x283593, 'metallic'], // 뒷줄 금속 건물
            [0.32, 1.6, 0.32, 0.4, -0.5, 0x1565C0, 'glass'],  // 뒷줄 유리 건물
        ];

        buildings.forEach(([width, height, depth, xPos, zPos, color, type]) => {
            const building = this.createModernBuilding(width, height, depth, color, type);
            building.position.set(xPos, 0, zPos);
            this.skyline.add(building);
        });

        // 조명 플랫폼
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

        // 플랫폼 가장자리 조명
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

    /**
     * 현대적인 건물을 생성합니다.
     * @param {number} width - 건물 너비
     * @param {number} height - 건물 높이
     * @param {number} depth - 건물 깊이
     * @param {number} color - 건물 색상
     * @param {string} type - 건물 타입 ('glass' 또는 'metallic')
     * @returns {THREE.Group} 건물 그룹 객체
     */
    createModernBuilding(width, height, depth, color, type) {
        const buildingGroup = new THREE.Group();

        // 타입에 따른 재질 선택
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

        // 메인 건물 본체
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const building = new THREE.Mesh(geometry, material);
        building.position.y = height / 2;
        building.castShadow = true;
        building.receiveShadow = true;
        buildingGroup.add(building);

        // 창문 스트립 (수평 띠)
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

        // 수직 액센트 라인
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

        // 옥상 기능 (높은 건물만)
        if (height > 2.3) {
            // 안테나 구조
            const antennaGroup = new THREE.Group();

            // 메인 안테나 기둥
            const poleGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.6);
            const poleMaterial = new THREE.MeshStandardMaterial({
                color: 0xCFD8DC,
                metalness: 0.9,
                roughness: 0.1
            });
            const pole = new THREE.Mesh(poleGeometry, poleMaterial);
            pole.position.y = height + 0.3;
            antennaGroup.add(pole);

            // 안테나 링
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

            // 상단 조명
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

        // 옥상 가장자리 조명
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

        // 옥상 글로우 스트립
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

    /**
     * 애니메이션 루프를 실행합니다.
     */
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * 창 크기 변경 시 호출됩니다.
     */
    onWindowResize() {
        if (!this.container) return;

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * 씬을 정리하고 제거합니다.
     */
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

// DOM 준비 시 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new Hero3DScene();
    });
} else {
    new Hero3DScene();
}
