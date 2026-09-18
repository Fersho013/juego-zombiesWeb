/**
 * entities.js - Torretas, cajas de suministros y supervivientes
   (creacion de modelos y refugios).
 * Parte del proyecto Survivors VS Zombies 3D.
 * Variables globales definidas en js/config.js.
 */

// TORRETAS DE DEFENSA
        // ==========================================================
        function createTurretModel(improvised) {
            const group = new THREE.Group();
            const baseMat = new THREE.MeshStandardMaterial({ color: improvised ? 0x57534e : 0x1e293b, metalness: 0.6, roughness: 0.4 });
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.6, 10), baseMat);
            base.position.y = 0.3;
            base.castShadow = true;
            group.add(base);

            const turretHead = new THREE.Group();
            turretHead.position.y = 0.75;
            const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: improvised ? 0x78350f : 0xef4444, metalness: 0.5, roughness: 0.4 }));
            turretHead.add(headBox);

            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7 }));
            barrel.rotation.x = Math.PI / 2;
            barrel.position.z = 0.9;
            turretHead.add(barrel);

            group.add(turretHead);

            return { mesh: group, headGroup: turretHead };
        }

        function activateShelter(zoneKey, free = false) {
            const zone = ZONES[zoneKey];
            if (!zone || zone.isActiveShelter) return;
            zone.isActiveShelter = true;
            zone.intact = true;
            zone.health = Math.max(zone.health, 70);
            if (!activeShelterKeys.includes(zoneKey)) activeShelterKeys.push(zoneKey);
            buildTurretAt(zoneKey, free);
        }

        function buildTurretAt(zoneKey, free = false) {
            const zone = ZONES[zoneKey];
            if (zone.turretMesh) return; // ya tiene torreta

            let improvised = true;
            if (free || baseResources.heavy >= 1) {
                if (!free) baseResources.heavy -= 1;
                improvised = false;
            }

            const turretObj = createTurretModel(improvised);
            turretObj.mesh.position.copy(zone.pos).add(new THREE.Vector3(0, 0, -zone.radius * 0.45));
            scene.add(turretObj.mesh);

            zone.turretMesh = turretObj.mesh;
            zone.turret = {
                headGroup: turretObj.headGroup,
                damage: improvised ? 16 : 42,
                range: improvised ? 17 : 24,
                fireRate: improvised ? 1.1 : 0.55,
                cooldown: 0,
                improvised: improvised
            };
        }

        function destroyTurretAt(zoneKey) {
            const zone = ZONES[zoneKey];
            if (zone.turretMesh) {
                scene.remove(zone.turretMesh);
                zone.turretMesh = null;
                zone.turret = null;
            }
        }

        // ==========================================================
        // CAJAS DE SUMINISTROS
        // ==========================================================
        const CRATE_TYPES = {
            WEAPON: { name: 'Caja de Armas de Fuego', color: 0xf59e0b, icon: 'fa-gun', type: 'weapon' },
            MELEE: { name: 'Caja Armas Melee', color: 0xd97706, icon: 'fa-shield-cat', type: 'melee' },
            HEAVY: { name: 'Caja Armas Pesadas', color: 0xef4444, icon: 'fa-bomb', type: 'heavy' },
            MED: { name: 'Caja de Curaciones', color: 0x10b981, icon: 'fa-kit-medical', type: 'med' },
            FOOD: { name: 'Caja de Comida', color: 0x3b82f6, icon: 'fa-utensils', type: 'food' },
            RIFLE: { name: 'Caja Rifle de Asalto', color: 0xfbbf24, icon: 'fa-gun', type: 'rifle' },
            SHOTGUN: { name: 'Caja Escopeta', color: 0xfb923c, icon: 'fa-burst', type: 'shotgun' },
            SNIPER: { name: 'Caja Francotirador', color: 0x38bdf8, icon: 'fa-crosshairs', type: 'sniper' },
            GRENADE: { name: 'Caja de Granadas', color: 0x22c55e, icon: 'fa-bomb', type: 'grenade' }
        };

        function spawnCrate(typeKey, x, z) {
            const config = CRATE_TYPES[typeKey];
            const group = new THREE.Group();
            group.position.set(x, 0, z);

            const boxGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
            const boxMat = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.4, metalness: 0.2 });
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.y = 0.6;
            box.castShadow = true;
            group.add(box);

            const ringGeo = new THREE.RingGeometry(0.8, 1.2, 16);
            const ringMat = new THREE.MeshBasicMaterial({ color: config.color, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.04;
            group.add(ring);

            scene.add(group);

            const crateData = {
                mesh: group,
                typeKey: typeKey,
                config: config,
                position: new THREE.Vector3(x, 0, z),
                isPickedUp: false
            };

            crates.push(crateData);
            return crateData;
        }

        function spawnInitialCrates() {
            crates.forEach(c => scene.remove(c.mesh));
            crates.length = 0;

            const locations = [
                { type: 'WEAPON', x: -8, z: -5 },
                { type: 'MED', x: 8, z: 5 },
                { type: 'MELEE', x: -5, z: 8 },
                { type: 'FOOD', x: 6, z: -8 },
                { type: 'HEAVY', x: 0, z: -10 },

                { type: 'WEAPON', x: 55, z: -10 },
                { type: 'FOOD', x: 65, z: 12 },
                { type: 'MED', x: 50, z: 15 },
                { type: 'HEAVY', x: 62, z: -18 },

                { type: 'HEAVY', x: -55, z: -8 },
                { type: 'MELEE', x: -65, z: 10 },
                { type: 'MED', x: -50, z: 14 },

                { type: 'WEAPON', x: -22, z: -60 },
                { type: 'HEAVY', x: 22, z: -60 },
                { type: 'FOOD', x: 0, z: -58 },
                { type: 'RIFLE', x: 12, z: -12 },
                { type: 'SHOTGUN', x: -12, z: 12 },
                { type: 'GRENADE', x: 58, z: 6 },
                { type: 'SNIPER', x: -58, z: -14 },
                { type: 'RIFLE', x: 0, z: -52 }
            ];

            locations.forEach(loc => spawnCrate(loc.type, loc.x, loc.z));
            addLogEvent("Se han desplegado nuevas cajas de suministros en la ciudad.");
        }

        // ==========================================================
        // SUPERVIVIENTES
        // ==========================================================
        function initSurvivors() {
            const survivorConfigs = [
                { name: 'Alex', role: 'Líder', color: 0xef4444, weapon: 'Rifle de Asalto', primary: 'RIFLE', melee: 'Machete Tactico', heavy: 'Granadas (3)', grenades: 3 },
                { name: 'Elena', role: 'Médico', color: 0x10b981, weapon: 'Escopeta Calibre 12', primary: 'SHOTGUN', melee: 'Cuchillo Caza', heavy: 'Ninguna', grenades: 1 },
                { name: 'Marcus', role: 'Pesado', color: 0xf59e0b, weapon: 'Ametralladora', primary: 'SMG', melee: 'Hacha de Mano', heavy: 'Bazuka RP3', grenades: 4 },
                { name: 'Sarah', role: 'Tiradora', color: 0x3b82f6, weapon: 'Rifle Precisión', primary: 'SNIPER', melee: 'Machete', heavy: 'Granadas (2)', grenades: 2 },
                { name: 'Carlos', role: 'Ingeniero', color: 0x8b5cf6, weapon: 'Pistola 9mm', primary: 'PISTOL', melee: 'Bate Reforzado', heavy: 'Lanza Granadas', grenades: 2 }
            ];

            survivors.length = 0;
            const activeZone = ZONES['MALL'];

            survivorConfigs.forEach((cfg, idx) => {
                const built = createHumanoidModel(cfg.color, 0xfde047, 1.0);
                const group = built.group;
                const spawnX = activeZone.pos.x + (idx * 2 - 4);
                const spawnZ = activeZone.pos.z + (idx % 2 * 2 - 2);
                group.position.set(spawnX, 0, spawnZ);
                scene.add(group);

                const survivorData = {
                    id: idx,
                    name: cfg.name,
                    role: cfg.role,
                    colorHex: cfg.color,
                    mesh: group,
                    limbs: built.limbs,
                    animPhase: Math.random() * 10,
                    isMoving: false,
                    position: group.position,
                    targetPos: new THREE.Vector3(spawnX, 0, spawnZ),
                    health: 100,
                    maxHealth: 100,
                    stamina: 100,
                    ammo: 120,
                    weapon: cfg.weapon,
                    primary: cfg.primary || 'PISTOL',
                    grenades: cfg.grenades || 0,
                    grenadeCooldown: 0,
                    buildProgress: 0,
                    buildTarget: null,
                    craftCooldown: 0,
                    melee: cfg.melee,
                    heavy: cfg.heavy,
                    carriedCrate: null,
                    kills: 0,
                    homeZoneKey: 'MALL',
                    aiState: 'SCAVENGE', // 'SCAVENGE', 'DEFEND_BASE', 'FLEE'
                    fleeTarget: null,
                    fleeZoneKey: null,
                    targetCrate: null,
                    thoughtText: 'Explorando zona...',
                    shootCooldown: 0,
                    collapsed: false,
                    collapseTimer: 0
                };

                survivors.push(survivorData);
            });

            renderSurvivorTabs();
            inspectSurvivor(0);
        }

        // Crea un modelo humanoide (usado por supervivientes y zombies) con
        // extremidades articuladas para permitir animación de caminata fluida.
        function createHumanoidModel(bodyColor, headColor, scale = 1.0, eyeColor = null) {
            const group = new THREE.Group();
            group.scale.setScalar(scale);

            const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6 });

            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.9, 8), bodyMat);
            torso.position.y = 1.15;
            torso.castShadow = true;
            group.add(torso);

            const headGeo = new THREE.SphereGeometry(0.32, 10, 10);
            const headMat = new THREE.MeshStandardMaterial({ color: headColor });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.y = 1.78;
            head.castShadow = true;
            group.add(head);

            if (eyeColor) {
                const eyeGeo = new THREE.SphereGeometry(0.07, 8, 8);
                const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
                const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
                eyeL.position.set(-0.12, 1.8, 0.26);
                const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
                eyeR.position.set(0.12, 1.8, 0.26);
                group.add(eyeL);
                group.add(eyeR);
            }

            // Piernas: pivote en la cadera para poder rotarlas al caminar
            function makeLimb(isLeg, xOffset) {
                const pivot = new THREE.Group();
                pivot.position.set(xOffset, isLeg ? 0.75 : 1.5, 0);
                const len = isLeg ? 0.75 : 0.65;
                const limbMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, len, 6), bodyMat);
                limbMesh.position.y = -len / 2;
                limbMesh.castShadow = true;
                pivot.add(limbMesh);
                return pivot;
            }

            const legL = makeLimb(true, -0.18);
            const legR = makeLimb(true, 0.18);
            const armL = makeLimb(false, -0.42);
            const armR = makeLimb(false, 0.42);
            group.add(legL, legR, armL, armR);

            // Arma visible en el brazo derecho (para supervivientes)
            const gun = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
            gun.position.set(0.22, 1.1, 0.35);
            group.add(gun);

            return { group, limbs: { legL, legR, armL, armR }, head, torso };
        }

        // ==========================================================
