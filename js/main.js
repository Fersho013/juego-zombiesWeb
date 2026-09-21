/**
 * main.js - Punto de entrada. Inicializa el mundo 3D y el bucle principal.
 * Carga el ultimo: depende de todos los modulos anteriores.
 */

// Superficie de errores en pantalla: cualquier excepcion no capturada
// queda escrita en la bitacora en vez de dejar el canvas negro en silencio.
window.addEventListener('error', function (ev) {
    try {
        const box = document.getElementById('sim-log-container');
        if (box) {
            const item = document.createElement('div');
            item.innerHTML = '<span class="text-red-400 font-bold">[ERROR]</span> ' + (ev.message || 'fallo desconocido');
            box.appendChild(item);
            box.scrollTop = box.scrollHeight;
        }
    } catch (e) {}
});

function init3DWorld() {
            const container = document.getElementById('canvas-container');

            // Scene Setup
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0a0e1a);
            scene.fog = new THREE.FogExp2(0x0a0e1a, 0.006);

            // Camera Setup
            camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 55, 80);

            // WebGL Renderer Setup
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 0.9;
            container.appendChild(renderer.domElement);

            // Orbit Controls
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.maxPolarAngle = Math.PI / 2 - 0.02;
            controls.minDistance = 8;
            controls.maxDistance = 180;
            controls.target.set(0, 2, 0);

            // Lighting Setup
            ambientLight = new THREE.AmbientLight(0x384152, 0.8);
            scene.add(ambientLight);

            sunLight = new THREE.DirectionalLight(0xffecd1, 1.1);
            sunLight.position.set(40, 80, 50);
            sunLight.castShadow = true;
            sunLight.shadow.mapSize.width = 2048;
            sunLight.shadow.mapSize.height = 2048;
            sunLight.shadow.camera.near = 0.5;
            sunLight.shadow.camera.far = 300;
            const d = 90;
            sunLight.shadow.camera.left = -d;
            sunLight.shadow.camera.right = d;
            sunLight.shadow.camera.top = d;
            sunLight.shadow.camera.bottom = -d;
            scene.add(sunLight);

            const emergencyLight = new THREE.PointLight(0xef4444, 0.5, 120);
            emergencyLight.position.set(0, 25, 0);
            scene.add(emergencyLight);

            // Build Map Environment
            buildCityMap();
            scatterCityRuins();
            spawnInitialCrates();
            initSurvivors();
            activateShelter('MALL', true); // Refugio inicial gratuito
            if (typeof createDepot === 'function') createDepot('MALL'); // gran deposito del spawn

            // Resize listener
            window.addEventListener('resize', onWindowResize);

            // Start wave prep timer loop
            startWaveTimer();
            renderSheltersPanel();
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        // ==========================================================

        // Bucle a 60 fps fijos: acumulador + pasos de 1/60 (independiente del monitor)
        let lastFrameTime = performance.now();
        let stepAccumulator = 0;

        // Bucle blindado: si un subsistema falla, se reporta una vez en bitacora
        // y el frame CONTINUA hasta renderer.render (nunca mas canvas negro).
        const subsystemFailed = {};
        function safeStep(name, fn, arg) {
            try { fn(arg); }
            catch (e) {
                if (!subsystemFailed[name]) {
                    subsystemFailed[name] = true;
                    try { addLogEvent(`ERROR en ${name}: ${e.message}`); } catch (_) {}
                    if (typeof console !== 'undefined' && console.error) console.error('[stepGame:' + name + ']', e);
                }
            }
        }

        function stepGame(fixedDelta) {
            frameDelta = Math.min(0.1, fixedDelta);
            safeStep('supervivientes', updateSurvivorAI, fixedDelta);
            safeStep('zombies', updateZombieAI, fixedDelta);
            safeStep('proyectiles', updateProjectiles, fixedDelta);
            safeStep('apoyo-aereo', function (d) { if (typeof updateAirSupport === 'function') updateAirSupport(d); }, fixedDelta);
            safeStep('barras-estructuras', function () { if (typeof updateTowerBars === 'function') updateTowerBars(); });
            // Game over: equipo completo caido
            try {
                if (!gameOverActive && survivors.length > 0 && survivors.every(s => s.health <= 0)) {
                    if (typeof showGameOver === 'function') showGameOver();
                }
            } catch (e) {}
        }

function animate() {
            requestAnimationFrame(animate);

            const now = performance.now();
            const frameTime = Math.min(0.25, (now - lastFrameTime) / 1000);
            lastFrameTime = now;

            if (gameSpeed > 0) {
                stepAccumulator += frameTime;
                let steps = 0;
                while (stepAccumulator >= FIXED_STEP && steps < 4) {
                    stepGame(FIXED_STEP);
                    stepAccumulator -= FIXED_STEP;
                    steps++;
                }
                if (steps === 4) stepAccumulator = 0; // anti-espiral si el tab se congela
            } else {
                stepAccumulator = 0;
            }

            if (cameraMode === 'follow' && survivors[selectedSurvivorIndex]) {
                const s = survivors[selectedSurvivorIndex];
                controls.target.lerp(s.position, 0.05);
            }

            controls.update();
            renderer.render(scene, camera);
        }

        // Start 3D World on window load
        window.onload = function() {
            init3DWorld();
            animate();
        };
