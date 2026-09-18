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
            ARMOR: { name: 'Caja de Blindaje', color: 0x64748b, icon: 'fa-shield-halved', type: 'armor' },
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
                { type: 'ARMOR', x: 4, z: 14 },
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
                { name: 'Alex', role: 'Líder', color: 0xef4444, weapon: 'Rifle de Asalto', primary: 'RIFLE', melee: 'Machete Tactico', heavy: 'Granadas (3)', grenades: 3, medkits: 1 },
                { name: 'Elena', role: 'Médico', color: 0x10b981, weapon: 'Escopeta Calibre 12', primary: 'SHOTGUN', melee: 'Cuchillo Caza', heavy: 'Ninguna', grenades: 1, medkits: 3 },
                { name: 'Marcus', role: 'Pesado', color: 0xf59e0b, weapon: 'Ametralladora', primary: 'SMG', melee: 'Hacha de Mano', heavy: 'Bazuka RP3', grenades: 4, medkits: 1 },
                { name: 'Sarah', role: 'Tiradora', color: 0x3b82f6, weapon: 'Rifle Precisión', primary: 'SNIPER', melee: 'Machete', heavy: 'Granadas (2)', grenades: 2, medkits: 1 },
                { name: 'Carlos', role: 'Ingeniero', color: 0x8b5cf6, weapon: 'Pistola 9mm', primary: 'PISTOL', melee: 'Bate Reforzado', heavy: 'Lanza Granadas', grenades: 2, medkits: 1 }
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
                    armor: 0, // blindaje: absorbe 50% hasta agotarse
                    medkits: cfg.medkits || 1, // botiquines para curar aliados
                    healTarget: null,
                    healFXTimer: 0,
                    flares: 0, // bengalas: piden avion de suministros
                    flareCooldown: 0,
                    onTower: null, // torre ocupada (plataforma de francotirador)
                    buildProgress: 0,
                    buildTarget: null,
                    buildSlot: 0, // esquina del cuadrado de barricadas 0..3
                    craftCooldown: 0,
                    towerSiteId: null, // obra en la que trabaja
                    melee: cfg.melee,
                    heavy: cfg.heavy,
                    carriedCrate: null,
                    kills: 0,
                    homeZoneKey: 'MALL',
                    aiState: 'SCAVENGE', // 'SCAVENGE', 'DEFEND_BASE', 'FLEE'
                    fleeTarget: null,
                    fleeZoneKey: null,
                    targetCrate: null,
                    targetLoot: null, // loot exclusivo reclamado (uno por superviviente)
                    thoughtText: 'Explorando zona...',
                    shootCooldown: 0,
                    collapsed: false,
                    collapseTimer: 0
                };

                survivors.push(survivorData);
                refreshWeaponMesh(survivorData); // arma 3D fisica segun su primary
            });

            renderSurvivorTabs();
            inspectSurvivor(0);
        }

        // Refuerzo individual: crea 1 superviviente (plantilla rotativa) en la zona dada.
        // Usado por deliverReinforcements() para reponer exactamente los faltantes.
        function spawnSingleSurvivor(homeKey, x, y, z) {
            const templates = [
                { name: 'Alex', role: 'Líder', color: 0xef4444, weapon: 'Rifle de Asalto', primary: 'RIFLE', melee: 'Machete Tactico', heavy: 'Granadas (3)', grenades: 3, medkits: 1 },
                { name: 'Elena', role: 'Médico', color: 0x10b981, weapon: 'Escopeta Calibre 12', primary: 'SHOTGUN', melee: 'Cuchillo Caza', heavy: 'Ninguna', grenades: 1, medkits: 3 },
                { name: 'Marcus', role: 'Pesado', color: 0xf59e0b, weapon: 'Ametralladora', primary: 'SMG', melee: 'Hacha de Mano', heavy: 'Bazuka RP3', grenades: 4, medkits: 1 },
                { name: 'Sarah', role: 'Tiradora', color: 0x3b82f6, weapon: 'Rifle Precisión', primary: 'SNIPER', melee: 'Machete', heavy: 'Granadas (2)', grenades: 2, medkits: 1 },
                { name: 'Carlos', role: 'Ingeniero', color: 0x8b5cf6, weapon: 'Pistola 9mm', primary: 'PISTOL', melee: 'Bate Reforzado', heavy: 'Lanza Granadas', grenades: 2, medkits: 1 }
            ];
            const usedNames = new Set(survivors.map(o => o.name));
            let cfg = templates.find(t => !usedNames.has(t.name));
            if (!cfg) {
                // Más allá de 5: reclutas adicionales (hasta 50).
                const n = survivors.length + 1;
                const base = templates[(n - 1) % templates.length];
                cfg = { ...base, name: `Recluta-${n}` };
            }
            const built = createHumanoidModel(cfg.color, 0xfde047, 1.0);
            const group = built.group;
            group.position.set(x, y || 0, z);
            scene.add(group);
            const s = {
                id: survivors.length,
                name: cfg.name, role: cfg.role, colorHex: cfg.color,
                mesh: group, limbs: built.limbs, animPhase: Math.random() * 10,
                isMoving: false, position: group.position,
                targetPos: new THREE.Vector3(x, 0, z),
                health: 100, maxHealth: 100, stamina: 100, ammo: 120,
                weapon: cfg.weapon, primary: cfg.primary || 'PISTOL',
                grenades: cfg.grenades || 0, grenadeCooldown: 0,
                armor: 0, medkits: cfg.medkits || 1, healTarget: null, healFXTimer: 0,
                flares: 0, flareCooldown: 0, onTower: null,
                buildProgress: 0, buildTarget: null, buildSlot: 0, craftCooldown: 0,
                towerSiteId: null, melee: cfg.melee, heavy: cfg.heavy,
                carriedCrate: null, kills: 0, homeZoneKey: homeKey,
                aiState: 'DEFEND_BASE', fleeTarget: null, fleeZoneKey: null,
                targetCrate: null, targetLoot: null,
                thoughtText: 'Refuerzo listo...', shootCooldown: 0,
                collapsed: false, collapseTimer: 0
            };
            survivors.push(s);
            refreshWeaponMesh(s);
            addLogEvent(`${s.name} (${s.role}) se une como refuerzo en ${ZONES[homeKey] ? ZONES[homeKey].name : homeKey}.`);
            return s;
        }

        // Crea un modelo humanoide (usado por supervivientes y zombies) con
        // extremidades articuladas para permitir animación de caminata fluida.
        // withGun=false para zombies (ellos no usan armas de fuego).
        function createHumanoidModel(bodyColor, headColor, scale = 1.0, eyeColor = null, withGun = true) {
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

            // Arma visible en el brazo derecho (solo supervivientes; se reemplaza
            // por el modelo fisico del arma equipada con refreshWeaponMesh)
            let gun = null;
            if (withGun) {
                gun = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
                gun.position.set(0.22, 1.1, 0.35);
                gun.name = 'hand-weapon';
                group.add(gun);
            }

            return { group, limbs: { legL, legR, armL, armR }, head, torso };
        }

        // Modelo 3D fisico segun el arma equipada (pistola, rifle, escopeta...)
        function createWeaponMesh(weaponKey) {
            const g = new THREE.Group();
            const dark = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.4 });
            const wood = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
            function part(geo, mat, x, y, z, rx) {
                const m = new THREE.Mesh(geo, mat);
                m.position.set(x, y, z);
                if (rx) m.rotation.x = rx;
                m.castShadow = true;
                g.add(m);
                return m;
            }
            if (weaponKey === 'SHOTGUN') { // canon grueso + guardamano de madera
                part(new THREE.CylinderGeometry(0.09, 0.09, 1.0, 8), dark, 0, 0, 0.3, Math.PI / 2);
                part(new THREE.BoxGeometry(0.14, 0.14, 0.4), wood, 0, -0.05, 0.15);
                part(new THREE.BoxGeometry(0.12, 0.16, 0.25), dark, 0, 0, -0.35);
            } else if (weaponKey === 'SNIPER') { // canon largo fino + mira
                part(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8), dark, 0, 0, 0.4, Math.PI / 2);
                part(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), dark, 0, 0.14, -0.1, Math.PI / 2);
                part(new THREE.BoxGeometry(0.12, 0.18, 0.35), wood, 0, -0.02, -0.4);
            } else if (weaponKey === 'RIFLE') { // fusil + cargador
                part(new THREE.BoxGeometry(0.12, 0.14, 0.9), dark, 0, 0, 0.1);
                part(new THREE.BoxGeometry(0.09, 0.25, 0.14), dark, 0, -0.16, 0.05);
                part(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), dark, 0, 0.02, 0.6, Math.PI / 2);
            } else if (weaponKey === 'SMG') { // compacto + silenciador
                part(new THREE.BoxGeometry(0.12, 0.14, 0.55), dark, 0, 0, 0);
                part(new THREE.CylinderGeometry(0.055, 0.055, 0.35, 8), dark, 0, 0, 0.42, Math.PI / 2);
            } else { // PISTOL por defecto
                part(new THREE.BoxGeometry(0.11, 0.13, 0.4), dark, 0, 0, 0);
                part(new THREE.BoxGeometry(0.09, 0.2, 0.1), dark, 0, -0.13, -0.12);
            }
            g.position.set(0.22, 1.1, 0.35);
            return g;
        }

        function refreshWeaponMesh(survivor) {
            if (!survivor || !survivor.mesh) return;
            const old = survivor.mesh.getObjectByName('hand-weapon');
            if (old) survivor.mesh.remove(old);
            const w = createWeaponMesh(survivor.primary || 'PISTOL');
            w.name = 'hand-weapon';
            survivor.mesh.add(w);
            survivor.weaponMesh = w;
        }

        // Puerta de supervivientes: ellos pasan, los zombies no (la deben destruir).
        function createSurvivorDoor(shelterKey, x, z, ry) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.2, 0.3),
                new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.7 }));
            mesh.position.set(x, 1.1, z);
            mesh.rotation.y = ry || 0;
            mesh.castShadow = true;
            scene.add(mesh);
            const rec = { mesh: mesh, position: mesh.position, shelterKey: shelterKey, health: 150, maxHealth: 150 };
            doors.push(rec);
            if (typeof registerCollider === 'function') registerCollider(rec.position, 1.1, rec, 'door', false);
            return rec;
        }
        function nearestDoor(pos, range) {
            let best = null, bestD = range;
            for (const d of doors) {
                if (d.health <= 0) continue;
                const dd = pos.distanceTo(d.position);
                if (dd < bestD) { bestD = dd; best = d; }
            }
            return best;
        }
        function destroyDoor(d) {
            scene.remove(d.mesh);
            if (typeof unregisterColliderForRef === 'function') unregisterColliderForRef(d);
            const i = doors.indexOf(d);
            if (i > -1) doors.splice(i, 1);
            addLogEvent('Una puerta de supervivientes fue destruida por la horda.');
        }
        // --- Refuerzo INDIVIDUAL (un superviviente por pieza) ---
        // Muro nuevo (5m, HP completo) en la posicion dada.
        function buildFortifyWall(shelterKey, x, z, ry) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 0.5),
                new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.8 }));
            mesh.position.set(x, 1.3, z);
            mesh.rotation.y = ry || 0;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);
            const rec = { mesh: mesh, health: WALL_HP, maxHealth: WALL_HP, position: mesh.position, shelterKey: shelterKey };
            walls.push(rec);
            if (typeof registerCollider === 'function') registerCollider(rec.position, 2.2, rec, 'wall', false);
            return rec;
        }
        // Ventana nueva (marco + tabla, HP 100): tapa parcial sin cerrar paso principal.
        function buildFortifyWindow(shelterKey, x, z, ry) {
            const grp = new THREE.Group();
            grp.position.set(x, 0, z);
            grp.rotation.y = ry || 0;
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
            const boardMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.9 });
            const sill = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.5), frameMat);
            sill.position.y = 1.1;
            grp.add(sill);
            const boards = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.25), boardMat);
            boards.position.y = 1.8;
            boards.rotation.z = 0.08;
            boards.castShadow = true;
            grp.add(boards);
            scene.add(grp);
            const rec = { mesh: grp, health: 100, maxHealth: 100, position: grp.position, shelterKey: shelterKey, isWindow: true };
            walls.push(rec);
            if (typeof registerCollider === 'function') registerCollider(rec.position, 1.2, rec, 'wall', false);
            return rec;
        }
        // Casa-refugio con PUERTA ABIERTA por lado (hueco 2m) y ventanas destruidas
        // (marcos rotos, sin cristal: acceso libre). Niveles: 1 mini / 2 casa / 3 fortaleza.
        function createShelterHouse(zoneKey, level) {
            const zone = ZONES[zoneKey];
            const lv = level || shelterLevels[zoneKey] || 2;
            shelterLevels[zoneKey] = lv;
            const group = new THREE.Group();
            group.position.copy(zone.pos);
            const wallMat = new THREE.MeshStandardMaterial({ color: lv >= 3 ? 0x64748b : 0xcbd5e1, roughness: 0.8 });
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
            const H = lv === 1 ? 5 : 7; // mini-casa mas chica
            const wallH = lv === 1 ? 1.6 : (lv >= 3 ? 3.2 : 2.6);
            const wallLen = lv === 1 ? 8 : 12;
            const segLen = (wallLen - 2) / 2; // hueco central 2m para puerta
            const sides = [
                { x: 0, z: -H, ry: 0 }, { x: 0, z: H, ry: 0 },
                { x: -H, z: 0, ry: Math.PI / 2 }, { x: H, z: 0, ry: Math.PI / 2 }
            ];
            sides.forEach(side => {
                // Dos segmentos por lado dejando puerta central libre.
                [-1, 1].forEach(sgn => {
                    const seg = new THREE.Mesh(new THREE.BoxGeometry(segLen, wallH, 0.5), wallMat);
                    const offAlong = sgn * (1 + segLen / 2);
                    const ox = side.ry === 0 ? offAlong : 0;
                    const oz = side.ry === 0 ? 0 : offAlong;
                    seg.position.set(zone.pos.x + side.x + ox, wallH / 2, zone.pos.z + side.z + oz);
                    seg.rotation.y = side.ry;
                    seg.castShadow = true;
                    seg.receiveShadow = true;
                    scene.add(seg);
                    group.add(seg);
                    const wrec = { mesh: seg, health: WALL_HP, maxHealth: WALL_HP, position: seg.position, shelterKey: zoneKey };
                    walls.push(wrec);
                    if (typeof registerCollider === 'function') registerCollider(wrec.position, segLen / 2 * 0.9, wrec, 'wall', false);
                });
                // Marco de puerta destruido/abierto + puerta de supervivientes.
                const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 0.7), frameMat);
                frame.position.set(zone.pos.x + side.x, wallH + 0.2, zone.pos.z + side.z);
                frame.rotation.y = side.ry;
                scene.add(frame);
                group.add(frame);
                createSurvivorDoor(zoneKey, zone.pos.x + side.x, zone.pos.z + side.z, side.ry);
                // Ventanas destruidas: solo marco roto arriba, sin cristal que bloquee.
                [-3.4, 3.4].forEach(off => {
                    const broken = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.6), frameMat);
                    const ox = side.ry === 0 ? off : 0;
                    const oz = side.ry === 0 ? 0 : off;
                    broken.position.set(zone.pos.x + side.x + ox, wallH + 0.1, zone.pos.z + side.z + oz);
                    broken.rotation.y = side.ry;
                    broken.rotation.z = 0.2;
                    scene.add(broken);
                    group.add(broken);
                });
                // Fortaleza nv3: segunda linea de muros bajos (refuerzo perimetral).
                if (lv >= 3) {
                    const outer = new THREE.Mesh(new THREE.BoxGeometry(segLen, 1.4, 0.4), wallMat);
                    const ox2 = side.ry === 0 ? 0 : side.x * 0.4;
                    const oz2 = side.ry === 0 ? side.z * 0.4 : 0;
                    outer.position.set(zone.pos.x + side.x + ox2, 0.7, zone.pos.z + side.z + oz2);
                    outer.rotation.y = side.ry;
                    scene.add(outer);
                    const orec = { mesh: outer, health: WALL_HP, maxHealth: WALL_HP, position: outer.position, shelterKey: zoneKey };
                    walls.push(orec);
                    if (typeof registerCollider === 'function') registerCollider(orec.position, segLen / 2 * 0.9, orec, 'wall', false);
                }
            });
            // Losa de suelo (mas grande con nivel)
            const slabSize = lv === 1 ? 11 : 15;
            const slab = new THREE.Mesh(new THREE.BoxGeometry(slabSize, 0.2, slabSize),
                new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 }));
            slab.position.set(zone.pos.x, 0.1, zone.pos.z);
            slab.receiveShadow = true;
            scene.add(slab);
            group.add(slab);
            scene.add(group);
            return group;
        }
        // Mini-casa desde 0 (nivel 1) para hacerla crecer a fortaleza.
        function createMiniShelter(zoneKey) {
            customShelters[zoneKey] = true;
            return createShelterHouse(zoneKey, 1);
        }
        // Mejora 1->2->3 con trabajo colectivo (exceso de materiales queda dentro).
        function upgradeShelterLevel(zoneKey) {
            const cur = shelterLevels[zoneKey] || 1;
            if (cur >= 3) return false;
            // Retira muros viejos de ese refugio para reconstruir mas grande.
            for (let i = walls.length - 1; i >= 0; i--) {
                if (walls[i].shelterKey === zoneKey) {
                    scene.remove(walls[i].mesh);
                    if (typeof unregisterColliderForRef === 'function') unregisterColliderForRef(walls[i]);
                    walls.splice(i, 1);
                }
            }
            for (let i = doors.length - 1; i >= 0; i--) {
                if (doors[i].shelterKey === zoneKey) {
                    scene.remove(doors[i].mesh);
                    if (typeof unregisterColliderForRef === 'function') unregisterColliderForRef(doors[i]);
                    doors.splice(i, 1);
                }
            }
            createShelterHouse(zoneKey, cur + 1);
            addLogEvent(`${ZONES[zoneKey].name} mejorado a nivel ${cur + 1}/3 (${cur + 1 === 3 ? 'fortaleza impenetrable' : 'casa reforzada'}). Exceso almacenado dentro.`);
            showToast(`Refugio nivel ${cur + 1}/3.`);
            updateUI();
            return true;
        }

        function shelterWallCount(zoneKey) {
            return walls.filter(w => w.shelterKey === zoneKey && w.health > 0).length;
        }

        // ==========================================================
