/**
 * ai.js - IA de supervivientes, IA de zombies, oleadas y torretas
   (logica de comportamiento).
 * Parte del proyecto Survivors VS Zombies 3D.
 * Variables globales definidas en js/config.js.
 */

// ZOMBIES
        // ==========================================================
        function getWaveZombieCount(wave) {
            // Escalado infinito: crece con cada oleada sin límite superior
            return Math.round(45 + wave * 13 + Math.pow(wave, 1.32) * 3);
        }

        function getWaveTypeMix(wave) {
            const total = getWaveZombieCount(wave);
            let mediumRatio = Math.min(0.5, 0.04 + wave * 0.035);
            let largeRatio = Math.min(0.3, Math.max(0, (wave - 1) * 0.028));
            let basicRatio = Math.max(0.12, 1 - mediumRatio - largeRatio);
            const sum = basicRatio + mediumRatio + largeRatio;
            basicRatio /= sum; mediumRatio /= sum; largeRatio /= sum;

            const large = Math.round(total * largeRatio);
            const medium = Math.round(total * mediumRatio);
            const basic = Math.max(1, total - large - medium);
            return { BASIC: basic, MEDIUM: medium, LARGE: large, total: basic + medium + large };
        }

        function spawnZombieHorde(wave) {
            const mix = getWaveTypeMix(wave);
            zombiesToSpawn = mix.total;
            zombiesAliveCount = mix.total;
            updateUI();

            addLogEvent(`¡ALERTA! Horda Zombie Oleada ${wave}: ${mix.BASIC} rastreros, ${mix.MEDIUM} corpulentos, ${mix.LARGE} titanes.`);
            playSound('zombie');

            // Centro de gravedad de todos los refugios activos, para rodear el área defendida
            const centroid = new THREE.Vector3();
            activeShelterKeys.forEach(k => centroid.add(ZONES[k].pos));
            centroid.divideScalar(Math.max(1, activeShelterKeys.length));

            const spawnList = [];
            Object.keys(mix).forEach(typeKey => {
                if (typeKey === 'total') return;
                for (let i = 0; i < mix[typeKey]; i++) spawnList.push(typeKey);
            });
            // Barajar para que los tipos no salgan en bloques
            for (let i = spawnList.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [spawnList[i], spawnList[j]] = [spawnList[j], spawnList[i]];
            }

            spawnList.forEach((typeKey, i) => {
                const angle = Math.random() * Math.PI * 2;
                const dist = 95 + Math.random() * 25;
                const x = centroid.x + Math.cos(angle) * dist;
                const z = centroid.z + Math.sin(angle) * dist;

                setTimeout(() => {
                    createZombieEntity(x, z, typeKey);
                }, (i * 90) / gameSpeed);
            });
        }

        function createZombieEntity(x, z, typeKey) {
            const type = ZOMBIE_TYPES[typeKey] || ZOMBIE_TYPES.BASIC;
            const built = createHumanoidModel(type.bodyColor, type.headColor, type.scale, type.eyeColor);
            built.group.position.set(x, 0, z);
            scene.add(built.group);

            const baseHealth = 40 + (currentWave * 6);
            const zombieData = {
                mesh: built.group,
                limbs: built.limbs,
                animPhase: Math.random() * 10,
                isMoving: false,
                position: built.group.position,
                typeKey: typeKey,
                typeLabel: type.label,
                health: baseHealth * type.healthMult,
                maxHealth: baseHealth * type.healthMult,
                speed: (0.085 + Math.random() * 0.035) * type.speedMult,
                damage: (5 + currentWave * 0.7) * type.damageMult,
                attackCooldown: 0,
                dying: false,
                deathTimer: 0
            };

            zombies.push(zombieData);
        }

        // ==========================================================
        // IA DE SUPERVIVIENTES
        // ==========================================================
        function countNearbyZombies(pos, range) {
            let n = 0;
            zombies.forEach(z => { if (z.health > 0 && !z.dying && pos.distanceTo(z.position) < range) n++; });
            return n;
        }

        function countAliveGarrison(zoneKey) {
            return survivors.filter(s => s.homeZoneKey === zoneKey && s.health > 0).length;
        }

        function pickFleeDestination(currentKey) {
            let bestKey = null;
            let bestScore = -Infinity;
            activeShelterKeys.forEach(k => {
                if (k === currentKey) return;
                const z = ZONES[k];
                if (!z.intact) return;
                const score = z.health - countNearbyZombies(z.pos, z.radius + 10) * 5;
                if (score > bestScore) { bestScore = score; bestKey = k; }
            });
            if (bestKey) return { pos: ZONES[bestKey].pos.clone(), zoneKey: bestKey };

            // No hay otro refugio disponible: huir a campo abierto, lejos de la horda
            const homePos = ZONES[currentKey] ? ZONES[currentKey].pos : new THREE.Vector3();
            let avg = new THREE.Vector3();
            let cnt = 0;
            zombies.forEach(z => {
                if (z.health > 0 && !z.dying && homePos.distanceTo(z.position) < 45) { avg.add(z.position); cnt++; }
            });
            let awayDir = new THREE.Vector3(1, 0, 0.3);
            if (cnt > 0) {
                avg.divideScalar(cnt);
                awayDir.subVectors(homePos, avg);
                if (awayDir.lengthSq() < 0.01) awayDir.set(1, 0, 0);
                awayDir.normalize();
            }
            const fleePos = homePos.clone().addScaledVector(awayDir, 32);
            return { pos: fleePos, zoneKey: null };
        }

        function updateSurvivorAI(delta) {
            survivors.forEach(s => {
                if (s.health <= 0) { updateFallenSurvivor(s, delta); return; }

                s.shootCooldown = Math.max(0, s.shootCooldown - delta);
                s.grenadeCooldown = Math.max(0, (s.grenadeCooldown || 0) - delta * gameSpeed);
                s.craftCooldown = Math.max(0, (s.craftCooldown || 0) - delta * gameSpeed);

                let nearestZombie = null;
                let minDist = 999;

                zombies.forEach(z => {
                    if (z.health > 0 && !z.dying) {
                        const dist = s.position.distanceTo(z.position);
                        if (dist < minDist) { minDist = dist; nearestZombie = z; }
                    }
                });

                const wconf = WEAPONS[s.primary] || WEAPONS.PISTOL;
                if (nearestZombie && minDist < wconf.range && s.aiState !== 'FLEE') {
                    aimTowards(s, nearestZombie.position);
                    // Granada si hay grupo compacto y tiene stock
                    if (s.grenades > 0 && s.grenadeCooldown <= 0 && minDist < 16 && countNearbyZombies(nearestZombie.position, 6) >= 3) {
                        throwGrenade(s, nearestZombie.position);
                        s.thoughtText = `¡Granada fuera! (${s.grenades} restantes)`;
                    } else if (s.shootCooldown <= 0 && s.ammo > 0) {
                        fireSurvivorWeapon(s, nearestZombie);
                    }
                }

                if (isWaveActive) {
                    const homeZone = ZONES[s.homeZoneKey] && ZONES[s.homeZoneKey].intact ? ZONES[s.homeZoneKey] : ZONES[activeShelterKeys[0] || 'MALL'];
                    const nearbyZ = countNearbyZombies(homeZone.pos, homeZone.radius + 14);
                    const garrisonAlive = Math.max(1, countAliveGarrison(s.homeZoneKey));

                    // Decisión de huida: si la horda supera ampliamente a la guarnición local
                    if (s.aiState !== 'FLEE' && nearbyZ >= 5 && nearbyZ > garrisonAlive * 2.6) {
                        s.aiState = 'FLEE';
                        const dest = pickFleeDestination(s.homeZoneKey);
                        s.fleeTarget = dest.pos;
                        s.fleeZoneKey = dest.zoneKey;
                        addLogEvent(`${s.name} se repliega: superado en número en ${homeZone.name}.`);
                    }

                    if (s.aiState === 'FLEE') {
                        s.thoughtText = '¡Replegándonos, nos superan en número!';
                        moveTowards(s, s.fleeTarget, 0.155);
                        const arrived = s.position.distanceTo(s.fleeTarget) < 3;
                        const stillNearbyThreat = countNearbyZombies(s.position, 14) >= 4;

                        if (arrived) {
                            if (s.fleeZoneKey) {
                                s.homeZoneKey = s.fleeZoneKey;
                                s.aiState = 'DEFEND_BASE';
                            } else if (!stillNearbyThreat) {
                                s.aiState = 'DEFEND_BASE';
                            } else {
                                // Sigue amenazado en campo abierto: re-evaluar destino
                                const dest = pickFleeDestination(s.homeZoneKey);
                                s.fleeTarget = dest.pos;
                                s.fleeZoneKey = dest.zoneKey;
                            }
                        }
                    } else {
                        s.aiState = 'DEFEND_BASE';
                        s.thoughtText = `Defendiendo ${homeZone.name}`;
                        const defPos = homeZone.pos.clone().add(new THREE.Vector3(Math.cos(s.id * 1.7) * homeZone.radius * 0.4, 0, Math.sin(s.id * 1.7) * homeZone.radius * 0.4));
                        if (s.position.distanceTo(defPos) > 2) {
                            moveTowards(s, defPos, 0.12);
                        } else {
                            s.isMoving = false;
                        }
                    }
                } else {
                    s.aiState = 'SCAVENGE';
                    const homeZone = ZONES[s.homeZoneKey] || ZONES['MALL'];

                    if (s.carriedCrate) {
                        s.thoughtText = `Transportando ${s.carriedCrate.config.name} a Base`;
                        const distToBase = s.position.distanceTo(homeZone.pos);

                        if (distToBase < 4) {
                            depositCrateAtBase(s);
                        } else {
                            moveTowards(s, homeZone.pos, 0.1);
                        }
                    } else {
                        if (!s.targetCrate || s.targetCrate.isPickedUp) {
                            s.targetCrate = findClosestAvailableCrate(s.position);
                        }

                        if (s.targetCrate) {
                            s.thoughtText = `Recolectando ${s.targetCrate.config.name}`;
                            const distToCrate = s.position.distanceTo(s.targetCrate.position);

                            if (distToCrate < 1.5) {
                                pickupCrate(s, s.targetCrate);
                            } else {
                                moveTowards(s, s.targetCrate.position, 0.11);
                            }
                        } else {
                            // Sin cajas: fabricar con excedente o construir barricada
                            if (maybeCraftSupplyCrate(s)) {
                                // fabricada este frame
                            } else if (updateSurvivorBuild(s, delta, homeZone)) {
                                // construyendo este frame
                            } else {
                                s.thoughtText = "Patrullando perímetro...";
                                const patrolPos = homeZone.pos.clone().add(new THREE.Vector3(Math.cos(s.id + clock.getElapsedTime() * 0.5) * 10, 0, Math.sin(s.id + clock.getElapsedTime() * 0.5) * 10));
                                moveTowards(s, patrolPos, 0.08);
                            }
                        }
                    }
                }

                animateEntityLimbs(s, delta);
            });

            maybeExpandShelters();
        }

        // Intenta abrir un nuevo refugio simultáneo cuando hay recursos y
        // supervivientes suficientes para cubrir más terreno de la ciudad.
        function maybeExpandShelters() {
            if (isWaveActive) return;
            if (activeShelterKeys.length >= Math.min(4, Object.keys(ZONES).length)) return;
            const aliveCount = survivors.filter(s => s.health > 0).length;
            if (aliveCount < 3) return;

            const chance = 0.0009 * gameSpeed * Math.min(3, currentWave); // acumulativo por frame
            if (Math.random() > chance) return;

            const candidateKey = Object.keys(ZONES).find(k => !ZONES[k].isActiveShelter && ZONES[k].intact);
            if (!candidateKey) return;

            activateShelter(candidateKey, false);

            // Redistribuir aproximadamente un tercio de la guarnición más numerosa hacia el nuevo refugio
            const homeCounts = {};
            survivors.forEach(s => { if (s.health > 0) homeCounts[s.homeZoneKey] = (homeCounts[s.homeZoneKey] || 0) + 1; });
            const donorKey = Object.keys(homeCounts).sort((a, b) => homeCounts[b] - homeCounts[a])[0];
            const donors = survivors.filter(s => s.homeZoneKey === donorKey && s.health > 0);
            const moveCount = Math.max(1, Math.floor(donors.length / 3));
            for (let i = 0; i < moveCount; i++) {
                donors[i].homeZoneKey = candidateKey;
            }

            addLogEvent(`¡Nuevo refugio establecido en ${ZONES[candidateKey].name}! El grupo se expande para cubrir más terreno.`);
            showToast(`Refugio adicional fundado: ${ZONES[candidateKey].name}`);
            renderSheltersPanel();
        }

        function updateFallenSurvivor(s, delta) {
            if (!s.collapsed) {
                s.collapseTimer += delta * gameSpeed;
                const t = Math.min(1, s.collapseTimer / 0.5);
                s.mesh.rotation.x = t * (Math.PI / 2.1);
                s.mesh.position.y = 0;
                if (t >= 1) s.collapsed = true;
            }
        }

        function moveTowards(entity, targetPos, speed) {
            const dir = new THREE.Vector3().subVectors(targetPos, entity.position);
            dir.y = 0;
            if (dir.length() > 0.15) {
                dir.normalize();
                entity.position.addScaledVector(dir, speed * gameSpeed);
                aimTowards(entity, targetPos);
                entity.isMoving = true;
            } else {
                entity.isMoving = false;
            }
        }

        function aimTowards(entity, targetPos) {
            const dx = targetPos.x - entity.position.x;
            const dz = targetPos.z - entity.position.z;
            if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) return;
            const desiredYaw = Math.atan2(dx, dz);
            const targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), desiredYaw);
            const smoothing = Math.min(1, frameDelta * 9 * Math.max(1, gameSpeed));
            entity.mesh.quaternion.slerp(targetQuat, smoothing);
        }

        // Anima el balanceo de piernas/brazos para una caminata fluida
        function animateEntityLimbs(entity, delta) {
            if (!entity.limbs) return;
            const l = entity.limbs;
            if (entity.isMoving) {
                entity.animPhase += delta * 9 * Math.max(0.4, gameSpeed);
                const swing = Math.sin(entity.animPhase) * 0.55;
                l.legL.rotation.x = swing;
                l.legR.rotation.x = -swing;
                l.armL.rotation.x = -swing * 0.75;
                l.armR.rotation.x = swing * 0.75;
            } else {
                l.legL.rotation.x *= 0.8;
                l.legR.rotation.x *= 0.8;
                l.armL.rotation.x *= 0.8;
                l.armR.rotation.x *= 0.8;
            }
        }

        function findClosestAvailableCrate(pos) {
            let closest = null;
            let minDist = 999;
            crates.forEach(c => {
                if (!c.isPickedUp) {
                    const d = pos.distanceTo(c.position);
                    if (d < minDist) { minDist = d; closest = c; }
                }
            });
            return closest;
        }

        function pickupCrate(survivor, crate) {
            crate.isPickedUp = true;
            scene.remove(crate.mesh);
            survivor.carriedCrate = crate;
            playSound('pickup');
            addLogEvent(`${survivor.name} recogió ${crate.config.name}.`);
            updateUI();
        }

        function depositCrateAtBase(survivor) {
            if (!survivor.carriedCrate) return;
            const crateType = survivor.carriedCrate.typeKey;

            if (crateType === 'WEAPON') { baseResources.ammo += 2; survivor.ammo = Math.min(250, survivor.ammo + 50); }
            else if (crateType === 'MED') baseResources.meds += 2;
            else if (crateType === 'FOOD') baseResources.food += 2;
            else if (crateType === 'HEAVY') baseResources.heavy += 1;
            // Nuevo arsenal: la caja otorga el arma directamente al portador
            else if (crateType === 'RIFLE') { equipPrimary(survivor, 'RIFLE'); survivor.ammo = Math.min(250, survivor.ammo + 80); baseResources.ammo += 1; }
            else if (crateType === 'SHOTGUN') { equipPrimary(survivor, 'SHOTGUN'); survivor.ammo = Math.min(250, survivor.ammo + 40); baseResources.ammo += 1; }
            else if (crateType === 'SNIPER') { equipPrimary(survivor, 'SNIPER'); survivor.ammo = Math.min(250, survivor.ammo + 30); baseResources.ammo += 1; }
            else if (crateType === 'GRENADE') { survivor.grenades = Math.min(8, survivor.grenades + 3); survivor.heavy = `Granadas (${survivor.grenades})`; baseResources.heavy += 1; }

            addLogEvent(`${survivor.name} entregó ${survivor.carriedCrate.config.name} al Refugio.`);
            survivor.carriedCrate = null;
            survivor.targetCrate = null;

            survivor.health = Math.min(survivor.maxHealth, survivor.health + 20);
            if (crateType === 'MED' || crateType === 'FOOD') survivor.ammo = Math.min(250, survivor.ammo + 50);

            playSound('pickup');
            updateUI();
        }

        function equipPrimary(survivor, weaponKey) {
            const w = WEAPONS[weaponKey];
            if (!w) return;
            survivor.primary = weaponKey;
            survivor.weapon = w.label;
            addLogEvent(`${survivor.name} equipo ${w.label}.`);
        }

        // Si el superviviente tiene exceso, fabrica su propia caja en el refugio
        function maybeCraftSupplyCrate(s) {
            if (s.craftCooldown > 0 || s.carriedCrate || s.health <= 0) return false;
            const hasSpareGun = (s.primary !== 'PISTOL' && s.ammo > 170);
            const hasSpareNades = (s.grenades >= 6);
            if (!hasSpareGun && !hasSpareNades) return false;
            const homeZone = ZONES[s.homeZoneKey];
            if (!homeZone || s.position.distanceTo(homeZone.pos) > 8) return false;

            const type = hasSpareNades ? 'GRENADE' : 'WEAPON';
            const cx = homeZone.pos.x + (Math.random() * 6 - 3);
            const cz = homeZone.pos.z + (Math.random() * 6 - 3);
            spawnCrate(type, cx, cz);
            if (hasSpareNades) { s.grenades -= 3; s.heavy = `Granadas (${s.grenades})`; }
            else { s.ammo -= 60; }
            s.craftCooldown = 25;
            s.thoughtText = `Fabrico ${CRATE_TYPES[type].name} para el refugio`;
            addLogEvent(`${s.name} fabrico una ${CRATE_TYPES[type].name} con su excedente.`);
            updateUI();
            return true;
        }

        // Construccion de barricadas por supervivientes cerca del refugio
        function findBarricadeSpot(zone) {
            const ang = Math.random() * Math.PI * 2;
            const r = zone.radius * 0.55 + 4 + Math.random() * 3;
            return new THREE.Vector3(zone.pos.x + Math.cos(ang) * r, 0, zone.pos.z + Math.sin(ang) * r);
        }

        function updateSurvivorBuild(s, delta, homeZone) {
            // Iniciar construccion: sin oleada, con recurso y cerca de base
            if (!s.buildTarget) {
                if (isWaveActive) return false;
                if (baseResources.ammo < 1) return false;
                if (s.role !== 'Ingeniero' && Math.random() > 0.004 * gameSpeed) return false;
                if (nearestBarricade(s.position, 6)) return false;
                s.buildTarget = findBarricadeSpot(homeZone);
                s.buildProgress = 0;
                s.thoughtText = 'Buscando punto para barricada...';
            }
            const d = s.position.distanceTo(s.buildTarget);
            if (d > 2) {
                s.thoughtText = 'Llevando materiales para barricada...';
                moveTowards(s, s.buildTarget, 0.11);
                return true;
            }
            // Construyendo in-situ (~3s)
            s.isMoving = false;
            aimTowards(s, homeZone.pos);
            s.buildProgress += delta * gameSpeed;
            s.thoughtText = `Construyendo barricada ${Math.min(99, Math.round(s.buildProgress / 3 * 100))}%`;
            if (s.buildProgress >= 3) {
                baseResources.ammo = Math.max(0, baseResources.ammo - 1);
                createSurvivorBarricade(s.buildTarget.x, s.buildTarget.z, false);
                addLogEvent(`${s.name} construyo una barricada cerca de ${homeZone.name}.`);
                s.buildTarget = null;
                s.buildProgress = 0;
                updateUI();
            }
            return true;
        }

        // ==========================================================
        // IA DE ZOMBIES
        // ==========================================================
        function getNearestActiveShelterKey(pos) {
            let bestKey = null;
            let bestDist = Infinity;
            activeShelterKeys.forEach(k => {
                const z = ZONES[k];
                if (!z.intact) return;
                const d = pos.distanceTo(z.pos);
                if (d < bestDist) { bestDist = d; bestKey = k; }
            });
            return bestKey;
        }

        function updateZombieAI(delta) {
            for (let i = zombies.length - 1; i >= 0; i--) {
                const z = zombies[i];
                if (z.dying) { updateDyingZombie(z, delta); continue; }
                if (z.health <= 0) continue;

                z.attackCooldown = Math.max(0, z.attackCooldown - delta);

                // Barricada bloqueando el paso: el zombie la golpea primero
                const block = nearestBarricade(z.position, 2.8);
                if (block && z.attackCooldown <= 0) {
                    block.health -= z.damage * 0.6;
                    z.attackCooldown = 1.2;
                    z.isMoving = false;
                    aimTowards(z, block.position);
                    createMuzzleFlash(block.position, 0x92400e, 0.08);
                    if (block.health <= 0) {
                        scene.remove(block.mesh);
                        const bi = barricades.indexOf(block);
                        if (bi > -1) barricades.splice(bi, 1);
                        addLogEvent('Una barricada ha sido destruida por la horda.');
                    }
                    animateEntityLimbs(z, delta);
                    continue;
                }

                let targetSurvivor = null;
                let minDist = 999;

                survivors.forEach(s => {
                    if (s.health > 0) {
                        const d = z.position.distanceTo(s.position);
                        if (d < minDist) { minDist = d; targetSurvivor = s; }
                    }
                });

                if (targetSurvivor && minDist < 15) {
                    moveTowards(z, targetSurvivor.position, z.speed);

                    if (minDist < 1.5 && z.attackCooldown <= 0) {
                        targetSurvivor.health -= z.damage;
                        z.attackCooldown = 1.2;
                        createBloodParticle(targetSurvivor.position);

                        if (targetSurvivor.health <= 0) {
                            targetSurvivor.health = 0;
                            addLogEvent(`¡${targetSurvivor.name} ha caído en combate!`);
                        }
                        updateUI();
                    }
                } else {
                    const nearestShelterKey = getNearestActiveShelterKey(z.position);
                    if (!nearestShelterKey) { animateEntityLimbs(z, delta); continue; }
                    const targetZone = ZONES[nearestShelterKey];

                    moveTowards(z, targetZone.pos, z.speed);
                    const distToBase = z.position.distanceTo(targetZone.pos);

                    if (distToBase < targetZone.radius && z.attackCooldown <= 0) {
                        targetZone.health = Math.max(0, targetZone.health - 1.5);
                        z.attackCooldown = 1.5;

                        if (targetZone.health <= 0) {
                            overrunShelter(nearestShelterKey);
                        }
                        updateUI();
                    }
                }

                animateEntityLimbs(z, delta);
            }

            updateTurrets(delta);
        }

        function updateDyingZombie(z, delta) {
            z.deathTimer += delta * gameSpeed;
            const t = Math.min(1, z.deathTimer / 0.45);
            z.mesh.rotation.x = t * (Math.PI / 2);
            z.mesh.position.y = -t * 0.15;
            if (t >= 1) {
                scene.remove(z.mesh);
                const idx = zombies.indexOf(z);
                if (idx > -1) zombies.splice(idx, 1);
                const dIdx = dyingZombies.indexOf(z);
                if (dIdx > -1) dyingZombies.splice(dIdx, 1);
            }
        }

        function overrunShelter(zoneKey) {
            const zone = ZONES[zoneKey];
            zone.intact = false;
            zone.isActiveShelter = false;
            destroyTurretAt(zoneKey);
            activeShelterKeys = activeShelterKeys.filter(k => k !== zoneKey);

            addLogEvent(`¡EL REFUGIO EN ${zone.name.toUpperCase()} HA SIDO DESTRUIDO!`);

            if (activeShelterKeys.length === 0) {
                // Todos los refugios cayeron: reconstrucción de emergencia en el Mall
                const fallback = ZONES['MALL'];
                fallback.intact = true;
                fallback.isActiveShelter = true;
                fallback.health = 50;
                activeShelterKeys = ['MALL'];
                buildTurretAt('MALL', true);
                survivors.forEach(s => { if (s.health > 0) { s.homeZoneKey = 'MALL'; s.aiState = 'FLEE'; s.fleeTarget = fallback.pos.clone(); s.fleeZoneKey = 'MALL'; } });
                addLogEvent(`¡Sin refugios en pie! Reconstrucción de emergencia en ${fallback.name}.`);
                createDebrisBarricades(fallback.pos);
            } else {
                // Reasignar la guarnición del refugio caído al más cercano que siga activo
                const survivorsHere = survivors.filter(s => s.homeZoneKey === zoneKey && s.health > 0);
                survivorsHere.forEach(s => {
                    const dest = pickFleeDestination(zoneKey);
                    s.aiState = 'FLEE';
                    s.fleeTarget = dest.pos;
                    s.fleeZoneKey = dest.zoneKey || activeShelterKeys[0];
                });
                addLogEvent(`Los supervivientes de ${zone.name} se repliegan a un refugio aliado.`);
            }

            createDebrisBarricades(zone.pos);
            renderSheltersPanel();
            updateUI();
        }

        function updateTurrets(delta) {
            activeShelterKeys.forEach(key => {
                const zone = ZONES[key];
                if (!zone.turret) return;
                const t = zone.turret;
                t.cooldown = Math.max(0, t.cooldown - delta);

                let nearest = null, minDist = t.range;
                zombies.forEach(z => {
                    if (z.health > 0 && !z.dying) {
                        const d = zone.pos.distanceTo(z.position);
                        if (d < minDist) { minDist = d; nearest = z; }
                    }
                });

                if (nearest) {
                    const dx = nearest.position.x - zone.pos.x;
                    const dz = nearest.position.z - zone.pos.z;
                    const yaw = Math.atan2(dx, dz);
                    t.headGroup.rotation.y += (yaw - t.headGroup.rotation.y) * Math.min(1, frameDelta * 6);

                    if (t.cooldown <= 0 && isWaveActive) {
                        t.cooldown = t.fireRate;
                        const turretWorldPos = zone.turretMesh.position.clone().add(new THREE.Vector3(0, 0.75, 0));
                        spawnProjectile(turretWorldPos, nearest, t.damage, 75, 0x38bdf8);
                        playSound('turret', t.improvised ? 'A2' : 'D2');
                    }
                }
            });
        }

        // ==========================================================
