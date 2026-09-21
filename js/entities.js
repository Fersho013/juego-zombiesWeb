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
            MATERIAL: { name: 'Caja de materiales', color: 0xa8a29e, icon: 'fa-cubes', type: 'material' },
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
                { type: 'MATERIAL', x: -4, z: -14 },
                { type: 'MATERIAL', x: 52, z: -4 },
                { type: 'MATERIAL', x: -52, z: 4 },
                { type: 'MATERIAL', x: 10, z: -52 },
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
                    debris: 0, // escombros: material para barricadas, torres y dummies
                    dummySite: null, // punto donde arma el dummie bomba
                    dummyProgress: 0,
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

            // Piernas: pivote simple en la cadera.
            // Brazos: dos segmentos (brazo + antebrazo) con CODO flexible,
            // la herramienta se sujeta al extremo del antebrazo.
            function makeLimb(isLeg, xOffset) {
                const pivot = new THREE.Group();
                pivot.position.set(xOffset, isLeg ? 0.75 : 1.5, 0);
                if (isLeg) {
                    const len = 0.75;
                    const limbMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, len, 6), bodyMat);
                    limbMesh.position.y = -len / 2;
                    limbMesh.castShadow = true;
                    pivot.add(limbMesh);
                } else {
                    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.35, 6), bodyMat);
                    upper.position.y = -0.175;
                    upper.castShadow = true;
                    pivot.add(upper);
                    const elbow = new THREE.Group();
                    elbow.position.set(0, -0.35, 0);
                    elbow.rotation.x = -0.25;
                    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.09, 0.35, 6), bodyMat);
                    fore.position.y = -0.175;
                    fore.castShadow = true;
                    elbow.add(fore);
                    pivot.add(elbow);
                    pivot.userData.elbow = elbow;
                }
                return pivot;
            }

            const legL = makeLimb(true, -0.18);
            const legR = makeLimb(true, 0.18);
            const armL = makeLimb(false, -0.42);
            const armR = makeLimb(false, 0.42);
            group.add(legL, legR, armL, armR);

            // Arma en la MANO (extremo del antebrazo: acompaña hombro y codo).
            // Se reemplaza por el modelo fisico del arma equipada con refreshWeaponMesh.
            let gun = null;
            if (withGun) {
                gun = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
                gun.position.set(0, -0.38, 0.08);
                gun.name = 'hand-weapon';
                armR.userData.elbow.add(gun);
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
            // Sin posicion absoluta: el dueño la coloca en la mano (pivote armR)
            return g;
        }

        function refreshWeaponMesh(survivor) {
            if (!survivor || !survivor.mesh || !survivor.limbs) return;
            const elbow = survivor.limbs.armR.userData ? survivor.limbs.armR.userData.elbow : null;
            if (!elbow) return;
            const old = survivor.mesh.getObjectByName('hand-weapon');
            if (old && old.parent) old.parent.remove(old);
            const w = createWeaponMesh(survivor.primary || 'PISTOL');
            w.name = 'hand-weapon';
            w.position.set(0, -0.38, 0.08); // mano, canon al frente
            elbow.add(w);
            survivor.weaponMesh = w;
            survivor.malletOn = false;
        }

        // Mazo de madera como el de referencia: mango dorado largo y cabezal
        // cilindrico gris oscuro con las caras planas al frente/atras.
        // Al martillar, el arco del brazo lleva la cara frontal contra la obra.
        function createMalletMesh() {
            const g = new THREE.Group();
            const gold = new THREE.MeshStandardMaterial({ color: 0xd9a021, roughness: 0.7 });
            const darkWood = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.75 });
            function mpart(geo, mat, x, y, z, rx) {
                const m = new THREE.Mesh(geo, mat);
                m.position.set(x, y, z);
                if (rx) m.rotation.x = rx;
                m.castShadow = true;
                g.add(m);
                return m;
            }
            // Mango dorado: continua el brazo hacia abajo desde el puño (origen = puño)
            mpart(new THREE.CylinderGeometry(0.045, 0.05, 0.55, 8), gold, 0, -0.28, 0);
            // Cabezal: cilindro robusto oscuro, caras planas mirando +z/-z
            mpart(new THREE.CylinderGeometry(0.16, 0.16, 0.30, 12), darkWood, 0, -0.58, 0.04, Math.PI / 2);
            // Collera donde el mango entra al cabezal
            mpart(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), gold, 0, -0.52, 0.01);
            return g;
        }

        // Sincroniza herramienta en mano: mazo al construir, arma al terminar
        function syncHandTool(s) {
            if (!s.mesh || !s.limbs) return;
            const elbow = s.limbs.armR.userData ? s.limbs.armR.userData.elbow : null;
            if (!elbow) return;
            if (s.hammering && !s.malletOn) {
                const old = s.mesh.getObjectByName('hand-weapon');
                if (old && old.parent) old.parent.remove(old);
                const m = createMalletMesh();
                m.name = 'hand-weapon';
                m.position.set(0, -0.38, 0.08);
                elbow.add(m);
                s.malletOn = true;
            } else if (!s.hammering && s.malletOn) {
                refreshWeaponMesh(s); // restaura el arma (y baja malletOn)
            }
        }

        // Mochila de carga: solo visible mientras transporta una caja
        function createBackpackMesh(colorHex) {
            const g = new THREE.Group();
            const packMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex).multiplyScalar(0.7), roughness: 0.8 });
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
            function bpart(geo, mat, x, y, z) {
                const m = new THREE.Mesh(geo, mat);
                m.position.set(x, y, z);
                m.castShadow = true;
                g.add(m);
                return m;
            }
            bpart(new THREE.BoxGeometry(0.45, 0.55, 0.28), packMat, 0, 0, 0); // cuerpo
            bpart(new THREE.BoxGeometry(0.32, 0.26, 0.12), packMat, 0, -0.1, -0.19); // bolsillo trasero
            bpart(new THREE.BoxGeometry(0.1, 0.08, 0.05), darkMat, 0, -0.02, -0.26); // hebilla
            const loop = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8), darkMat);
            loop.rotation.z = Math.PI / 2;
            loop.position.set(0, 0.32, 0);
            g.add(loop);
            bpart(new THREE.BoxGeometry(0.08, 0.5, 0.05), darkMat, -0.15, 0.05, 0.16); // correas
            bpart(new THREE.BoxGeometry(0.08, 0.5, 0.05), darkMat, 0.15, 0.05, 0.16);
            return g;
        }

        function syncBackpack(s) {
            if (!s.mesh) return;
            const has = !!s.mesh.getObjectByName('carry-pack');
            if (!!s.carriedCrate && !has) {
                const p = createBackpackMesh(s.colorHex);
                p.name = 'carry-pack';
                p.position.set(0, 1.3, -0.45); // espalda
                s.mesh.add(p);
            } else if (!s.carriedCrate && has) {
                const p = s.mesh.getObjectByName('carry-pack');
                if (p && p.parent) p.parent.remove(p);
            }
        }

        // ==========================================================
        // GRAN DEPOSITO del refugio (6000 HP): guarda el stock comun.
        // Su HP ES el HP del refugio; al caer, explota y el refugio cae.
        // ==========================================================
        function createDepotMesh() {
            const g = new THREE.Group();
            const olive = new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.7, metalness: 0.3 });
            const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6, roughness: 0.4 });
            const stripe = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.5 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 4), olive);
            body.position.y = 1.3;
            body.castShadow = true;
            body.receiveShadow = true;
            g.add(body);
            const roof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 4.4), darkMetal);
            roof.position.y = 2.75;
            roof.castShadow = true;
            g.add(roof);
            const band = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.4, 4.05), stripe);
            band.position.y = 2.1;
            g.add(band);
            const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.15), darkMetal);
            door.position.set(0, 0.9, 2.02);
            g.add(door);
            return g;
        }

        function createDepot(zoneKey) {
            const zone = ZONES[zoneKey];
            if (!zone || zone.depot) return zone ? zone.depot : null;
            const mesh = createDepotMesh();
            const px = zone.pos.x + 4, pz = zone.pos.z + 4;
            mesh.position.set(px, 0, pz);
            scene.add(mesh);
            zone.depot = {
                mesh: mesh, position: new THREE.Vector3(px, 0, pz),
                health: DEPOT_HP, maxHealth: DEPOT_HP, lastHit: 0, stockMeshes: []
            };
            zone.health = 100;
            addLogEvent(`Gran deposito construido en ${zone.name} (6000 HP): guarda armas, municion y curas.`);
            refreshDepotStockVisual(zoneKey);
            return zone.depot;
        }

        // Cajitas decorativas junto al deposito segun el stock guardado
        function refreshDepotStockVisual(zoneKey) {
            const zone = ZONES[zoneKey];
            const dep = zone && zone.depot;
            if (!dep) return;
            dep.stockMeshes.forEach(m => scene.remove(m));
            dep.stockMeshes.length = 0;
            const total = baseResources.ammo + baseResources.meds + baseResources.food + baseResources.heavy + Math.floor((baseResources.debris || 0) / 10);
            const n = Math.min(8, Math.floor(total / 3));
            const cols = [0xf59e0b, 0x10b981, 0x3b82f6, 0xef4444, 0xa8a29e];
            for (let i = 0; i < n; i++) {
                const mini = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7),
                    new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.6 }));
                mini.position.set(dep.position.x - 3 + (i % 4) * 0.9, 0.35 + Math.floor(i / 4) * 0.75, dep.position.z + 2.8);
                mini.castShadow = true;
                scene.add(mini);
                dep.stockMeshes.push(mini);
            }
        }

        function damageDepot(zoneKey, amount) {
            const zone = ZONES[zoneKey];
            const dep = zone && zone.depot;
            if (!dep || dep.health <= 0) return;
            dep.health -= amount;
            dep.lastHit = Date.now();
            zone.health = Math.max(0, dep.health / dep.maxHealth * 100);
            if (dep.health <= 0) {
                dep.health = 0;
                destroyDepot(zoneKey);
            }
            updateUI();
        }

        function destroyDepot(zoneKey) {
            const zone = ZONES[zoneKey];
            if (!zone || !zone.depot) return;
            const dep = zone.depot;
            zone.depot = null;
            scene.remove(dep.mesh);
            dep.stockMeshes.forEach(m => scene.remove(m));
            explodeAt(dep.position.clone(), 15, 220, null);
            addLogEvent(`¡EL DEPOSITO DE ${zone.name.toUpperCase()} EXPLOTO!`);
            overrunShelter(zoneKey); // sin deposito, el refugio cae
        }

        // Casa-refugio de 4 muros (puertas + ventanas): cada muro es barricada con HP
        function createShelterHouse(zoneKey) {
            const zone = ZONES[zoneKey];
            const group = new THREE.Group();
            group.position.copy(zone.pos);
            const wallMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.8 });
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.4 });
            const H = 7; // medio lado de la casa
            const sides = [
                { x: 0, z: -H, ry: 0 }, { x: 0, z: H, ry: 0 },
                { x: -H, z: 0, ry: Math.PI / 2 }, { x: H, z: 0, ry: Math.PI / 2 }
            ];
            sides.forEach(side => {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(12, 2.6, 0.5), wallMat);
                wall.position.set(zone.pos.x + side.x, 1.3, zone.pos.z + side.z);
                wall.rotation.y = side.ry;
                wall.castShadow = true;
                wall.receiveShadow = true;
                scene.add(wall);
                // Puerta (marco + hueco oscuro)
                const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 0.6), frameMat);
                door.position.set(wall.position.x, 1.0, wall.position.z);
                door.rotation.y = side.ry;
                scene.add(door);
                group.add(door);
                // Ventanas (cristal a cada lado de la puerta)
                [-3.4, 3.4].forEach(off => {
                    const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.6), glassMat);
                    const ox = side.ry === 0 ? off : 0;
                    const oz = side.ry === 0 ? 0 : off;
                    win.position.set(wall.position.x + ox, 1.6, wall.position.z + oz);
                    win.rotation.y = side.ry;
                    scene.add(win);
                    group.add(win);
                });
                walls.push({ mesh: wall, health: WALL_HP, maxHealth: WALL_HP, position: wall.position, shelterKey: zoneKey });
            });
            // Losa de suelo
            const slab = new THREE.Mesh(new THREE.BoxGeometry(15, 0.2, 15),
                new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 }));
            slab.position.set(zone.pos.x, 0.1, zone.pos.z);
            slab.receiveShadow = true;
            scene.add(slab);
            group.add(slab);
            scene.add(group);
            return group;
        }

        function shelterWallCount(zoneKey) {
            return walls.filter(w => w.shelterKey === zoneKey && w.health > 0).length;
        }

        // ==========================================================
