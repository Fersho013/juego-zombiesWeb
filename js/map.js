/**
 * map.js - Construccion de la ciudad, ruinas y modelos de entorno.
   Agrega nuevos edificios/props aqui.
 * Parte del proyecto Survivors VS Zombies 3D.
 * Variables globales definidas en js/config.js.
 */

// CITY MAP CONSTRUCTION
        // ==========================================================
        function buildCityMap() {
            const terrainGeo = new THREE.PlaneGeometry(220, 220);
            const terrainMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.95 });
            const terrain = new THREE.Mesh(terrainGeo, terrainMat);
            terrain.rotation.x = -Math.PI / 2;
            terrain.receiveShadow = true;
            scene.add(terrain);

            const roadMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });

            const roadH = new THREE.Mesh(new THREE.PlaneGeometry(220, 14), roadMat);
            roadH.rotation.x = -Math.PI / 2;
            roadH.position.set(0, 0.02, 0);
            roadH.receiveShadow = true;
            scene.add(roadH);

            const roadV = new THREE.Mesh(new THREE.PlaneGeometry(14, 220), roadMat);
            roadV.rotation.x = -Math.PI / 2;
            roadV.position.set(0, 0.02, 0);
            roadV.receiveShadow = true;
            scene.add(roadV);

            // ==========================================
            // 1. SHOPPING MALL (CENTRO COMERCIAL) - CENTER
            // ==========================================
            const mallGroup = new THREE.Group();
            mallGroup.position.set(0, 0, 0);

            const mallFloor = new THREE.Mesh(new THREE.BoxGeometry(32, 0.15, 28), new THREE.MeshStandardMaterial({ color: 0x374151 }));
            mallFloor.position.y = 0.08;
            mallFloor.receiveShadow = true;
            mallGroup.add(mallFloor);

            const wallMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.5 });

            [[-15, -13], [15, -13], [-15, 13], [15, 13]].forEach(pos => {
                const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 6, 1.5), wallMat);
                pillar.position.set(pos[0], 3, pos[1]);
                pillar.castShadow = true;
                mallGroup.add(pillar);
            });

            const roof = new THREE.Mesh(new THREE.BoxGeometry(33, 0.4, 29), wallMat);
            roof.position.y = 6.2;
            roof.castShadow = true;
            mallGroup.add(roof);

            const signBg = new THREE.Mesh(new THREE.BoxGeometry(16, 2, 0.4), new THREE.MeshStandardMaterial({ color: 0xd97706 }));
            signBg.position.set(0, 7.2, 14.2);
            mallGroup.add(signBg);

            // Escombros de fachada caída junto a la entrada
            const mallRubble = createRubblePile(1.8, 0x334155);
            mallRubble.position.set(-14, 0, 15);
            mallGroup.add(mallRubble);
            scene.add(mallGroup);

            // ==========================================
            // 2. PARKING LOT (ESTACIONAMIENTO) - EAST
            // ==========================================
            const parkingGroup = new THREE.Group();
            parkingGroup.position.set(60, 0, 0);

            const parkingLot = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 }));
            parkingLot.rotation.x = -Math.PI / 2;
            parkingLot.position.y = 0.03;
            parkingLot.receiveShadow = true;
            parkingGroup.add(parkingLot);

            const carColors = [0xef4444, 0x3b82f6, 0x64748b, 0x10b981, 0x7c2d12, 0x475569];
            [[-10, -10], [8, -12], [-8, 10], [10, 8], [-15, 2], [15, -2]].forEach((pos, idx) => {
                const car = createCarModel(carColors[idx % carColors.length], idx % 3 === 0);
                car.position.set(pos[0], 0, pos[1]);
                car.rotation.y = (idx * 1.2);
                parkingGroup.add(car);
            });

            scene.add(parkingGroup);

            // ==========================================
            // 3. CITY PARK (PARQUE) - WEST
            // ==========================================
            const parkGroup = new THREE.Group();
            parkGroup.position.set(-60, 0, 0);

            const parkGrass = new THREE.Mesh(new THREE.PlaneGeometry(38, 38), new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.8 }));
            parkGrass.rotation.x = -Math.PI / 2;
            parkGrass.position.y = 0.03;
            parkGrass.receiveShadow = true;
            parkGroup.add(parkGrass);

            const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.8, 16), new THREE.MeshStandardMaterial({ color: 0x475569 }));
            fountainBase.position.y = 0.4;
            fountainBase.castShadow = true;
            parkGroup.add(fountainBase);

            [[-12, -12], [14, -10], [-10, 12], [12, 14], [0, -14]].forEach(pos => {
                const tree = createTreeModel();
                tree.position.set(pos[0], 0, pos[1]);
                parkGroup.add(tree);
            });

            scene.add(parkGroup);

            // ==========================================
            // 4. GRAN CASA EN RUINAS - NORTH (doble de grande, una sola)
            // En ruinas pero con puerta principal grande garantizada al sur,
            // ventanas abiertas e interior amplio para torretas/suministros.
            // ==========================================
            buildGrandRuinHouse();
            // Colisiones del entorno: nadie atraviesa pilares, autos, arboles, fuente.
            if (typeof registerCollider === 'function') {
                [[-15, -13], [15, -13], [-15, 13], [15, 13]].forEach(p => {
                    registerCollider(new THREE.Vector3(p[0], 0, p[1]), 1.2, { id: `mall-pillar-${p[0]}-${p[1]}` }, 'env', false);
                });
                [[-10, -10], [8, -12], [-8, 10], [10, 8], [-15, 2], [15, -2]].forEach(p => {
                    registerCollider(new THREE.Vector3(60 + p[0], 0, p[1]), 2.2, { id: `car-${p[0]}-${p[1]}`, hp: 60 }, 'env', false);
                });
                registerCollider(new THREE.Vector3(-60, 0, 0), 4.2, { id: 'fountain' }, 'env', false);
                [[-12, -12], [14, -10], [-10, 12], [12, 14], [0, -14]].forEach(p => {
                    registerCollider(new THREE.Vector3(-60 + p[0], 0, p[1]), 1.0, { id: `tree-${p[0]}-${p[1]}` }, 'env', false);
                });
            }
        }

        // Dispersa escombros, autos quemados, muros caídos y ruinas menores
        // por toda la ciudad para transmitir una sensación de caos y abandono.
        function scatterCityRuins() {
            const exclusionZones = Object.values(ZONES).map(z => ({ pos: z.pos, radius: z.radius + 6 }));
            const roadExclusion = (x, z) => (Math.abs(x) < 8 || Math.abs(z) < 8);

            function isFree(x, z) {
                if (roadExclusion(x, z)) return false;
                for (const ex of exclusionZones) {
                    if (Math.hypot(x - ex.pos.x, z - ex.pos.z) < ex.radius) return false;
                }
                return true;
            }

            // Generador pseudo-aleatorio determinista para posiciones consistentes
            let seed = 1337;
            function rnd() {
                seed = (seed * 9301 + 49297) % 233280;
                return seed / 233280;
            }

            let placed = 0;
            let attempts = 0;
            while (placed < 34 && attempts < 400) {
                attempts++;
                const x = (rnd() - 0.5) * 200;
                const z = (rnd() - 0.5) * 200;
                if (!isFree(x, z)) continue;

                const roll = rnd();
                let obj;
                if (roll < 0.28) obj = createRubblePile(1.2 + rnd() * 1.6, 0x334155);
                else if (roll < 0.5) obj = createBrokenWallSegment();
                else if (roll < 0.66) obj = createBurntCarWreck();
                else if (roll < 0.8) obj = createStreetDebris();
                else if (roll < 0.9) obj = createDumpster();
                else obj = createRuinedKiosk();

                obj.position.set(x, 0, z);
                obj.rotation.y = rnd() * Math.PI * 2;
                scene.add(obj);
                // Ruinas destructibles: los zombies las rompen si bloquean el paso.
                if (typeof registerCollider === 'function') {
                    const ref = { id: `ruin-${placed}`, hp: 50, mesh: obj };
                    registerCollider(new THREE.Vector3(x, 0, z), 1.8, ref, 'env', true);
                }
                placed++;
            }

            // Postes de luz caídos / medio derribados a lo largo de las avenidas
            [[-40, 5], [40, -5], [5, -40], [-5, 40], [5, 40], [-5, -40], [-100, 5], [100, -5]].forEach(([x, z]) => {
                if (!isFree(x, z) && Math.abs(x) > 8 === false && Math.abs(z) > 8 === false) return;
                const lamp = createBrokenLamppost();
                lamp.position.set(x, 0, z);
                scene.add(lamp);
            });
        }

        // ==========================================================
        // HELPER 3D MODELS - ENTORNO
        // ==========================================================
        function createCarModel(colorHex, burnt = false) {
            const group = new THREE.Group();
            const bodyColor = burnt ? 0x1c1917 : colorHex;
            const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 4.5), new THREE.MeshStandardMaterial({ color: bodyColor, metalness: burnt ? 0.1 : 0.6, roughness: burnt ? 0.95 : 0.3 }));
            body.position.y = 0.7;
            body.castShadow = true;
            if (burnt) body.rotation.z = 0.12;
            group.add(body);

            const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 2.4), new THREE.MeshStandardMaterial({ color: burnt ? 0x0c0a09 : 0x0f172a }));
            cabin.position.set(0, 1.5, -0.2);
            cabin.castShadow = true;
            if (burnt) cabin.rotation.z = 0.12;
            group.add(cabin);

            return group;
        }

        function createTreeModel() {
            const group = new THREE.Group();
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3), new THREE.MeshStandardMaterial({ color: 0x78350f }));
            trunk.position.y = 1.5;
            trunk.castShadow = true;
            group.add(trunk);

            const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2), new THREE.MeshStandardMaterial({ color: 0x047857, roughness: 0.8 }));
            foliage.position.y = 3.8;
            foliage.castShadow = true;
            group.add(foliage);

            return group;
        }

        // Gran Casa en ruinas: doble de grande, abierta y sin bucles de colision.
        // Losa 30x26 en (0,-65). Muros arruinados bajos (visuales, sin collider)
        // salvo 2 esquinas en pie. Puerta principal grande 6m al SUR garantizada,
        // ventanas abiertas (huecos sin cristal) e interior vacio amplio.
        function buildGrandRuinHouse() {
            const cx = 0, cz = -65;
            const g = new THREE.Group();
            const slab = new THREE.Mesh(new THREE.BoxGeometry(30, 0.15, 26),
                new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.95 }));
            slab.position.set(cx, 0.07, cz);
            slab.receiveShadow = true;
            g.add(slab);
            const ruinMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.95 });
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
            // Muros bajos arruinados (h=1.1, visuales: se pueden pisar/rodear, NO bloquean).
            // Norte (trasero): dos tramos con ventana central abierta de 4m.
            [[-9.5, -13], [9.5, -13]].forEach(([ox, oz]) => {
                const w = new THREE.Mesh(new THREE.BoxGeometry(9, 1.1, 0.6), ruinMat);
                w.position.set(cx + ox, 0.55, cz + oz);
                w.castShadow = true;
                g.add(w);
            });
            // Este y Oeste: tramos bajos con huecos de ventana de 3m (sin collider).
            [[15, -6.5, Math.PI / 2], [15, 6.5, Math.PI / 2], [-15, -6.5, Math.PI / 2], [-15, 6.5, Math.PI / 2]].forEach(([ox, oz, ry]) => {
                const w = new THREE.Mesh(new THREE.BoxGeometry(8, 1.1, 0.6), ruinMat);
                w.position.set(cx + ox, 0.55, cz + oz);
                w.rotation.y = ry;
                w.castShadow = true;
                g.add(w);
            });
            // Sur (frontal): dos tramos dejando PUERTA PRINCIPAL de 6m al centro.
            [[-10.5, 13], [10.5, 13]].forEach(([ox, oz]) => {
                const w = new THREE.Mesh(new THREE.BoxGeometry(9, 1.3, 0.6), ruinMat);
                w.position.set(cx + ox, 0.65, cz + oz);
                w.castShadow = true;
                g.add(w);
            });
            // Marco de puerta principal grande (6m, abierto, sin hoja).
            const lintel = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 0.8), frameMat);
            lintel.position.set(cx, 3.0, cz + 13);
            g.add(lintel);
            [-3.2, 3.2].forEach(off => {
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 0.7), frameMat);
                post.position.set(cx + off, 1.6, cz + 13);
                post.castShadow = true;
                g.add(post);
            });
            // Marcos de ventana rotos (decorativos, elevados, no bloquean paso).
            [[-9.5, -13], [9.5, -13], [0, -13]].forEach(([ox, oz]) => {
                const f = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 0.7), frameMat);
                f.position.set(cx + ox, 1.35, cz + oz);
                f.rotation.z = 0.12;
                g.add(f);
            });
            // Escombros pequeños en esquinas interiores (despejables, con collider).
            const r1 = createRubblePile(1.6, 0x44403c);
            r1.position.set(cx - 11, 0, cz - 9);
            g.add(r1);
            const r2 = createRubblePile(1.6, 0x57534e);
            r2.position.set(cx + 11, 0, cz - 9);
            g.add(r2);
            scene.add(g);
            if (typeof registerCollider === 'function') {
                const ref1 = { id: 'grand-rubble-nw', hp: 60, mesh: r1, residential: true };
                registerCollider(new THREE.Vector3(cx - 11, 0, cz - 9), 1.6, ref1, 'env', true);
                const ref2 = { id: 'grand-rubble-ne', hp: 60, mesh: r2, residential: true };
                registerCollider(new THREE.Vector3(cx + 11, 0, cz - 9), 1.6, ref2, 'env', true);
            }
        }

        function createHouseModel(damaged = false) {
            const group = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(14, 4.5, 12), new THREE.MeshStandardMaterial({ color: damaged ? 0x9ca3af : 0xe2e8f0, roughness: 0.7 }));
            body.position.y = 2.25;
            body.castShadow = true;
            body.receiveShadow = true;
            if (damaged) body.rotation.z = 0.03;
            group.add(body);

            const roof = new THREE.Mesh(new THREE.ConeGeometry(10, 3, 4), new THREE.MeshStandardMaterial({ color: 0x991b1b }));
            roof.position.y = damaged ? 5.6 : 6;
            roof.rotation.y = Math.PI / 4;
            roof.rotation.z = damaged ? 0.18 : 0;
            roof.castShadow = true;
            group.add(roof);

            const door = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.2), new THREE.MeshStandardMaterial({ color: 0x78350f }));
            door.position.set(0, 1.5, 6.05);
            group.add(door);

            if (damaged) {
                // Boquete en la pared - bloque de escombros al pie de la casa
                const rubble = createRubblePile(2.2, 0xcbd5e1);
                rubble.position.set(3, 0, 6);
                group.add(rubble);
            }

            return group;
        }

        function createRubblePile(size = 1.5, color = 0x334155) {
            const group = new THREE.Group();
            const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
            const chunks = 4 + Math.floor(Math.random() * 3);
            for (let i = 0; i < chunks; i++) {
                const s = size * (0.4 + Math.random() * 0.6);
                const chunk = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.7, s), mat);
                chunk.position.set((Math.random() - 0.5) * size * 1.6, s * 0.3, (Math.random() - 0.5) * size * 1.6);
                chunk.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.6);
                chunk.castShadow = true;
                chunk.receiveShadow = true;
                group.add(chunk);
            }
            return group;
        }

        function createBrokenWallSegment() {
            const group = new THREE.Group();
            const mat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.9 });
            const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.6), mat);
            wall.position.y = 1.2;
            wall.rotation.z = (Math.random() - 0.5) * 0.5;
            wall.rotation.y = (Math.random() - 0.5) * 0.3;
            wall.castShadow = true;
            group.add(wall);

            const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2), new THREE.MeshStandardMaterial({ color: 0x78716c, metalness: 0.6 }));
            rebar.position.set(2, 2, 0);
            rebar.rotation.z = 0.4;
            group.add(rebar);

            const baseRubble = createRubblePile(1.6, 0x44403c);
            baseRubble.position.set(-1.5, 0, 0.4);
            group.add(baseRubble);

            return group;
        }

        function createBurntCarWreck() {
            return createCarModel(0x1c1917, true);
        }

        function createStreetDebris() {
            const group = new THREE.Group();
            const matMetal = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5, roughness: 0.6 });

            const sign = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.2), new THREE.MeshStandardMaterial({ color: 0x71717a }));
            sign.position.set(0, 0.15, 0);
            sign.rotation.y = Math.random() * Math.PI;
            group.add(sign);

            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 10), new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.4, roughness: 0.6 }));
            barrel.position.set(1.2, 0.55, 0.6);
            barrel.rotation.z = Math.random() > 0.5 ? 1.4 : 0;
            barrel.position.y = barrel.rotation.z !== 0 ? 0.4 : 0.55;
            barrel.castShadow = true;
            group.add(barrel);

            const plank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0x57493a }));
            plank.position.set(-1.2, 0.1, -0.6);
            plank.rotation.y = Math.random() * Math.PI;
            group.add(plank);

            return group;
        }

        function createDumpster() {
            const group = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 1.4), new THREE.MeshStandardMaterial({ color: 0x14532d, metalness: 0.4, roughness: 0.7 }));
            body.position.y = 0.65;
            body.castShadow = true;
            group.add(body);
            const lid = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.15, 1.5), new THREE.MeshStandardMaterial({ color: 0x0f2e18 }));
            lid.position.set(0.3, 1.35, 0);
            lid.rotation.z = 0.5;
            group.add(lid);
            return group;
        }

        function createRuinedKiosk() {
            const group = new THREE.Group();
            const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.85 }));
            base.position.y = 1.2;
            base.castShadow = true;
            base.receiveShadow = true;
            group.add(base);

            const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x991b1b }));
            roof.position.y = 2.9;
            roof.rotation.z = 0.25;
            group.add(roof);

            const rubble = createRubblePile(1.4, 0x57534e);
            rubble.position.set(1.4, 0, 1.2);
            group.add(rubble);

            return group;
        }

        function createBrokenLamppost() {
            const group = new THREE.Group();
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 8), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 }));
            pole.position.y = 2.25;
            pole.rotation.z = 0.35 + Math.random() * 0.3;
            pole.position.x = Math.sin(pole.rotation.z) * 2.2;
            pole.position.y = Math.cos(pole.rotation.z) * 2.2;
            pole.castShadow = true;
            group.add(pole);
            return group;
        }

        // ==========================================================
