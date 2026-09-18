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
            const aliveSurvivors = survivors.filter(s => s.health > 0).length;
            const extraLarge = Math.max(0, aliveSurvivors - 5) * 0.02; // mas supervivientes = mas titanes
            let mediumRatio = Math.min(0.5, 0.04 + wave * 0.035);
            let largeRatio = Math.min(0.45, Math.max(0, (wave - 1) * 0.028) + extraLarge);
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

            // Rodeo multidireccional: reparte la horda en grupos angulares
            // uniformes por refugio para encerrar a los supervivientes.
            const shelterList = activeShelterKeys.length ? activeShelterKeys.slice() : ['MALL'];
            const numGroups = Math.max(4, Math.min(8, shelterList.length * 2));
            spawnList.forEach((typeKey, i) => {
                const targetShelterKey = shelterList[i % shelterList.length];
                const sz = ZONES[targetShelterKey] ? ZONES[targetShelterKey].pos : centroid;
                const groupIdx = i % numGroups;
                const baseAngle = (groupIdx / numGroups) * Math.PI * 2;
                const angle = baseAngle + (Math.random() - 0.5) * 0.5;
                const dist = 95 + Math.random() * 25;
                const x = sz.x + Math.cos(angle) * dist;
                const z = sz.z + Math.sin(angle) * dist;

                setTimeout(() => {
                    createZombieEntity(x, z, typeKey);
                }, (i * 90) / Math.max(0.5, gameSpeed));
            });
        }

        function createZombieEntity(x, z, typeKey) {
            const type = ZOMBIE_TYPES[typeKey] || ZOMBIE_TYPES.BASIC;
            const built = createHumanoidModel(type.bodyColor, type.headColor, type.scale, type.eyeColor, false);
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
            // Compatibilidad: delega al destino grupal compartido.
            const g = pickGroupFleeDestination();
            return { pos: g.pos.clone(), zoneKey: g.zoneKey };
        }

        // Destino unico para todo el equipo: refugio mas seguro o salida
        // conjunta lejos del centroide de la horda (evita dispersion).
        function pickGroupFleeDestination() {
            if (typeof groupFlee !== 'undefined' && groupFlee && groupFlee.pos) {
                // Revalidar que siga siendo seguro; si no, recalcular abajo.
                if (countNearbyZombies(groupFlee.pos, 16) < 6) return groupFlee;
            }
            // Centroide del equipo vivo
            const team = new THREE.Vector3();
            let tn = 0;
            survivors.forEach(s => { if (s.health > 0) { team.add(s.position); tn++; } });
            if (tn > 0) team.divideScalar(tn);
            // Refugio activo mas seguro (vida - zombies*5)
            let bestKey = null;
            let bestScore = -Infinity;
            activeShelterKeys.forEach(k => {
                const z = ZONES[k];
                if (!z || !z.intact) return;
                const score = z.health - countNearbyZombies(z.pos, z.radius + 12) * 5;
                if (score > bestScore) { bestScore = score; bestKey = k; }
            });
            if (bestKey && countNearbyZombies(ZONES[bestKey].pos, ZONES[bestKey].radius + 12) < 8) {
                groupFlee = { pos: ZONES[bestKey].pos.clone(), zoneKey: bestKey };
                return groupFlee;
            }
            // Salida conjunta: direccion opuesta al centroide zombie
            let zAvg = new THREE.Vector3();
            let zc = 0;
            zombies.forEach(z => {
                if (z.health > 0 && !z.dying && team.distanceTo(z.position) < 55) { zAvg.add(z.position); zc++; }
            });
            let awayDir = new THREE.Vector3(1, 0, 0.3);
            if (zc > 0) {
                zAvg.divideScalar(zc);
                awayDir.subVectors(team, zAvg);
                if (awayDir.lengthSq() < 0.01) awayDir.set(1, 0, 0);
                awayDir.normalize();
            }
            const fleePos = team.clone().addScaledVector(awayDir, 34);
            groupFlee = { pos: fleePos, zoneKey: null };
            return groupFlee;
        }

        // Movimiento de huida con repulsion: no tocar infectados ni dejarse rodear.
        function moveFleeing(s, targetPos, baseSpeed) {
            const dir = new THREE.Vector3().subVectors(targetPos, s.position);
            dir.y = 0;
            if (dir.length() > 0.01) dir.normalize();
            // Repulsion de zombies cercanos (<9u): prioriza la vida sobre la ruta.
            const repel = new THREE.Vector3();
            zombies.forEach(z => {
                if (z.health <= 0 || z.dying) return;
                const d = s.position.distanceTo(z.position);
                if (d < 9) {
                    const away = new THREE.Vector3().subVectors(s.position, z.position);
                    away.y = 0;
                    const w = (9 - d) / 9; // mas cerca = mas empuje
                    away.normalize().multiplyScalar(w * 1.6);
                    repel.add(away);
                }
            });
            dir.add(repel);
            if (dir.lengthSq() < 0.001) dir.set(1, 0, 0);
            dir.normalize();
            // Formacion: offset por id para no apilarse y cubrirse entre si.
            const fx = Math.cos(s.id * 2.4) * 2.2;
            const fz = Math.sin(s.id * 2.4) * 2.2;
            const finalTarget = targetPos.clone().add(new THREE.Vector3(fx, 0, fz));
            const toFinal = new THREE.Vector3().subVectors(finalTarget, s.position);
            toFinal.y = 0;
            // Si hay repulsion fuerte, moverse en la direccion segura directamente.
            const useDir = repel.length() > 0.7 ? dir : toFinal.normalize();
            const step = baseSpeed * gameSpeed;
            const tmpTarget = s.position.clone().addScaledVector(useDir, 2);
            if (typeof tryMoveWithCollisions === 'function') tryMoveWithCollisions(s, tmpTarget, step, true);
            else s.position.addScaledVector(useDir, step);
            aimTowards(s, s.position.clone().add(useDir));
            s.isMoving = true;
        }

        function updateSurvivorAI(delta) {
            survivors.forEach(s => {
                if (s.health <= 0) { updateFallenSurvivor(s, delta); return; }
                s.hammering = false; // se activa al martillar obra este frame

                s.shootCooldown = Math.max(0, s.shootCooldown - delta);
                s.grenadeCooldown = Math.max(0, (s.grenadeCooldown || 0) - delta * gameSpeed);
                s.craftCooldown = Math.max(0, (s.craftCooldown || 0) - delta * gameSpeed);
                s.flareCooldown = Math.max(0, (s.flareCooldown || 0) - delta * gameSpeed);
                s.healFXTimer = Math.max(0, (s.healFXTimer || 0) - delta * gameSpeed);

                // Recoger loot cercano dejado por zombies
                for (let li = loots.length - 1; li >= 0; li--) {
                    if (s.position.distanceTo(loots[li].position) < 1.6) {
                        collectLoot(s, loots[li]);
                        break;
                    }
                }

                // Bengala automatica si esta bajo de municion
                if (s.flares > 0 && s.ammo < 40 && s.flareCooldown <= 0 && !isWaveActive) {
                    const hz = ZONES[s.homeZoneKey];
                    if (hz) {
                        s.flares--;
                        s.flareCooldown = 90;
                        planeSupplyDrop(s.homeZoneKey, ['WEAPON', 'MED']);
                        showAirBanner('Bengala lanzada: apoyo en camino', 'fa-solid fa-fire text-pink-300 text-lg');
                        addLogEvent(`${s.name} lanzo una bengala y pidio suministros.`);
                    }
                }

                let nearestZombie = null;
                let minDist = 999;

                zombies.forEach(z => {
                    if (z.health > 0 && !z.dying) {
                        const dist = s.position.distanceTo(z.position);
                        if (dist < minDist) { minDist = dist; nearestZombie = z; }
                    }
                });

                const wconf = WEAPONS[s.primary] || WEAPONS.PISTOL;
                const effRange = wconf.range * (s.onTower ? 1.3 : 1); // bonus de altura
                // En huida tambien disparan cubriendose entre si (proteccion mutua),
                // pero priorizan moverse: el disparo no detiene la huida.
                if (nearestZombie && minDist < effRange) {
                    aimTowards(s, nearestZombie.position);
                    // Granada si hay grupo compacto y tiene stock (no en huida: prioriza correr)
                    if (s.aiState !== 'FLEE' && s.grenades > 0 && s.grenadeCooldown <= 0 && minDist < 16 && countNearbyZombies(nearestZombie.position, 6) >= 3) {
                        throwGrenade(s, nearestZombie.position);
                        s.thoughtText = `¡Granada fuera! (${s.grenades} restantes)`;
                    } else if (s.shootCooldown <= 0 && s.ammo > 0) {
                        fireSurvivorWeapon(s, nearestZombie);
                    }
                }
                // Solicitudes automaticas del equipo ("El superviviente necesita...")
                if (typeof updateSurvivorRequests === 'function') updateSurvivorRequests(s, nearestZombie, minDist);

                // PRIORIDAD 1 (global): curar aliados heridos con botiquin
                // (los francotiradores en torre no abandonan su puesto para curar)
                let healBusy = false;
                if (s.aiState !== 'FLEE' && !s.onTower) healBusy = updateSurvivorHeal(s, delta);

                if (isWaveActive) {
                    const homeZone = ZONES[s.homeZoneKey] && ZONES[s.homeZoneKey].intact ? ZONES[s.homeZoneKey] : ZONES[activeShelterKeys[0] || 'MALL'];
                    const nearbyZ = countNearbyZombies(homeZone.pos, homeZone.radius + 14);
                    const garrisonAlive = Math.max(1, countAliveGarrison(s.homeZoneKey));

                    // Decisión de huida EN EQUIPO: si la horda supera a la guarnicion,
                    // todo el grupo huye junto al mismo destino (no dispersion).
                    if (s.aiState !== 'FLEE' && nearbyZ >= 5 && nearbyZ > garrisonAlive * 2.6) {
                        const dest = pickGroupFleeDestination();
                        survivors.forEach(o => {
                            if (o.health <= 0) return;
                            if (o.aiState !== 'FLEE') {
                                o.aiState = 'FLEE';
                                o.fleeTarget = dest.pos;
                                o.fleeZoneKey = dest.zoneKey;
                            }
                        });
                        groupFlee = dest;
                        addLogEvent(`¡Repliegue en equipo! El grupo se retira junto desde ${homeZone.name}, cubriéndose entre sí.`);
                    }

                    if (s.aiState === 'FLEE') {
                        if (s.onTower) dismountTower(s); // abandona la torre para huir
                        // Destino compartido: si no tiene, usa el grupal.
                        if ((!s.fleeTarget || !s.fleeZoneKey) && typeof groupFlee !== 'undefined' && groupFlee) {
                            s.fleeTarget = groupFlee.pos;
                            s.fleeZoneKey = groupFlee.zoneKey;
                        }
                        if (!s.fleeTarget) {
                            const dest = pickGroupFleeDestination();
                            s.fleeTarget = dest.pos;
                            s.fleeZoneKey = dest.zoneKey;
                        }
                        s.thoughtText = '¡Replegándonos juntos, cubranse!';
                        moveFleeing(s, s.fleeTarget, 0.165);
                        const arrived = s.position.distanceTo(s.fleeTarget) < 4;
                        const stillNearbyThreat = countNearbyZombies(s.position, 14) >= 4;

                        if (arrived) {
                            if (s.fleeZoneKey) {
                                s.homeZoneKey = s.fleeZoneKey;
                                // Solo vuelve a defender cuando TODO el equipo llego.
                                const teamArrived = survivors.every(o => o.health <= 0 || o.aiState !== 'FLEE' || o.position.distanceTo(o.fleeTarget || s.fleeTarget) < 6);
                                if (teamArrived) {
                                    survivors.forEach(o => { if (o.health > 0 && o.aiState === 'FLEE') o.aiState = 'DEFEND_BASE'; });
                                    groupFlee = null;
                                }
                            } else if (!stillNearbyThreat) {
                                const teamSafe = survivors.every(o => o.health <= 0 || o.aiState !== 'FLEE' || countNearbyZombies(o.position, 14) < 4);
                                if (teamSafe) {
                                    survivors.forEach(o => { if (o.health > 0 && o.aiState === 'FLEE') o.aiState = 'DEFEND_BASE'; });
                                    groupFlee = null;
                                }
                            } else {
                                // Sigue amenazado: todo el equipo re-evalua junto un nuevo destino.
                                const dest = pickGroupFleeDestination();
                                survivors.forEach(o => {
                                    if (o.health > 0 && o.aiState === 'FLEE') {
                                        o.fleeTarget = dest.pos;
                                        o.fleeZoneKey = dest.zoneKey;
                                    }
                                });
                            }
                        }
                    } else if (!healBusy) {
                        // Puesto de francotirador en torre si hay sitio libre
                        if (!updateTowerOccupy(s, homeZone)) {
                            s.aiState = 'DEFEND_BASE';
                            s.thoughtText = `Defendiendo ${homeZone.name}`;
                            const defPos = homeZone.pos.clone().add(new THREE.Vector3(Math.cos(s.id * 1.7) * homeZone.radius * 0.4, 0, Math.sin(s.id * 1.7) * homeZone.radius * 0.4));
                            if (s.position.distanceTo(defPos) > 2) {
                                moveTowards(s, defPos, 0.12);
                            } else {
                                s.isMoving = false;
                            }
                        } else {
                            s.aiState = 'DEFEND_BASE';
                        }
                    } else {
                        s.aiState = 'DEFEND_BASE';
                    }
                } else {
                    s.aiState = 'SCAVENGE';
                    const homeZone = ZONES[s.homeZoneKey] || ZONES['MALL'];
                    if (s.onTower) dismountTower(s); // de dia se baja a trabajar

                    if (healBusy) {
                        // Curando a un aliado: sin otras tareas este frame
                    } else if (s.carriedCrate) {
                        s.thoughtText = `Transportando ${s.carriedCrate.config.name} a Base`;
                        const distToBase = s.position.distanceTo(homeZone.pos);

                        if (distToBase < 4) {
                            depositCrateAtBase(s);
                        } else {
                            moveTowards(s, homeZone.pos, 0.1);
                        }
                    } else {
                        // ORDEN 1-7: una sola tarea grupal; se termina al 100%
                        // antes de la siguiente (paso 3 = recolectar todo).
                        const directive = getGroupDirective();
                        if (directive && directive.kind === 'repair') {
                            updateShelterRepair(s, delta);
                        } else if (directive && directive.kind === 'found') {
                            updateShelterFound(s, delta);
                        } else if (directive && directive.kind === 'tower') {
                            updateTowerWork(s, delta, homeZone);
                        } else if (directive && directive.kind === 'turret-base') {
                            updateBaseTurretTask(s);
                        } else if (directive && directive.kind === 'collect') {
                            // Paso 3: todos a recolectar, cada quien su caja.
                            if (!s.targetCrate || s.targetCrate.isPickedUp || isCrateClaimed(s.targetCrate, s)) {
                                s.targetCrate = findClosestAvailableCrate(s.position, s);
                                s.targetLoot = null;
                            }
                            if (s.targetCrate) {
                                s.thoughtText = `Recolectando ${s.targetCrate.config.name} (paso 3)`;
                                const distToCrate = s.position.distanceTo(s.targetCrate.position);
                                if (distToCrate < 1.5) {
                                    pickupCrate(s, s.targetCrate);
                                    s.targetCrate = null;
                                    if (countAvailableCrates() === 0 && groupTask && groupTask.kind === 'collect') groupTask = null;
                                } else {
                                    moveTowards(s, s.targetCrate.position, 0.11);
                                }
                            } else {
                                // Sin caja libre: loot exclusivo o llevar lo cargado.
                                if (!s.targetLoot || !loots.includes(s.targetLoot) || isLootClaimed(s.targetLoot, s)) {
                                    s.targetLoot = findClosestAvailableLoot(s.position, s);
                                }
                                if (s.targetLoot) {
                                    const dL = s.position.distanceTo(s.targetLoot.position);
                                    s.thoughtText = `Recogiendo suministro (paso 3)...`;
                                    if (dL < 1.6) { collectLoot(s, s.targetLoot); s.targetLoot = null; }
                                    else moveTowards(s, s.targetLoot.position, 0.11);
                                } else {
                                    s.thoughtText = 'Buscando materiales...';
                                    moveTowards(s, homeZone.pos, 0.08);
                                }
                            }
                        } else {
                            // Sin obra grupal: cada quien su propia caja (reserva exclusiva).
                            if (!s.targetCrate || s.targetCrate.isPickedUp || isCrateClaimed(s.targetCrate, s)) {
                                s.targetCrate = findClosestAvailableCrate(s.position, s);
                                // Si no hay caja libre, reclamar loot exclusivo.
                                if (!s.targetCrate) {
                                    if (!s.targetLoot || !loots.includes(s.targetLoot) || isLootClaimed(s.targetLoot, s)) {
                                        s.targetLoot = findClosestAvailableLoot(s.position, s);
                                    }
                                } else {
                                    s.targetLoot = null;
                                }
                            }

                            if (s.targetCrate) {
                                s.thoughtText = `Recolectando ${s.targetCrate.config.name}`;
                                const distToCrate = s.position.distanceTo(s.targetCrate.position);

                                if (distToCrate < 1.5) {
                                    pickupCrate(s, s.targetCrate);
                                    s.targetCrate = null;
                                } else {
                                    moveTowards(s, s.targetCrate.position, 0.11);
                                }
                            } else if (s.targetLoot && loots.includes(s.targetLoot)) {
                                s.thoughtText = `Recogiendo suministro...`;
                                const dL = s.position.distanceTo(s.targetLoot.position);
                                if (dL < 1.6) {
                                    collectLoot(s, s.targetLoot);
                                    s.targetLoot = null;
                                } else {
                                    moveTowards(s, s.targetLoot.position, 0.11);
                                }
                            } else {
                                // Sin cajas ni loot: barricada individual y patrulla.
                                if (maybeCraftSupplyCrate(s)) {
                                    // fabricada este frame
                                } else if (updateSurvivorBuild(s, delta, homeZone)) {
                                    // construyendo barricada este frame
                                } else {
                                    s.thoughtText = "Patrullando perímetro...";
                                    const patrolPos = homeZone.pos.clone().add(new THREE.Vector3(Math.cos(s.id + clock.getElapsedTime() * 0.5) * 10, 0, Math.sin(s.id + clock.getElapsedTime() * 0.5) * 10));
                                    moveTowards(s, patrolPos, 0.08);
                                }
                            }
                        }
                    }
                }

                animateEntityLimbs(s, delta);
            });

            maybeExpandShelters();
        }

        // Expansión aleatoria DESACTIVADA: el orden oficial (paso 2) controla
        // la fundación para evitar obras simultáneas y el limbo.
        function maybeExpandShelters() {
            return; // fundar solo vía getGroupDirective() paso FOUND
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
                const isSurvivor = !entity.typeKey; // zombies tienen typeKey
                const step = speed * gameSpeed;
                if (typeof tryMoveWithCollisions === 'function') {
                    const ox = entity.position.x, oz = entity.position.z;
                    tryMoveWithCollisions(entity, targetPos, step, isSurvivor);
                    const moved = Math.hypot(entity.position.x - ox, entity.position.z - oz);
                    // Bloqueado: si no puede acceder, destruye el muro/escombro de enfrente.
                    if (moved < step * 0.25) {
                        if (!isSurvivor && typeof damageBlockingEnv === 'function') damageBlockingEnv(entity);
                        if (isSurvivor && typeof damageBlockingAsSurvivor === 'function') damageBlockingAsSurvivor(entity);
                    }
                } else {
                    dir.normalize();
                    entity.position.addScaledVector(dir, step);
                }
                aimTowards(entity, targetPos);
                entity.isMoving = true;
            } else {
                entity.isMoving = false;
            }
        }
        // Superviviente bloqueado: demuele el muro/escombro que impide acceder
        // (no toca sus propias puertas: esas las cruza).
        function damageBlockingAsSurvivor(s) {
            if (!s || s.health <= 0) return false;
            s.demoCooldown = Math.max(0, (s.demoCooldown || 0) - 1);
            if (s.demoCooldown > 0) return false;
            // 1) Muro de refugio ajeno/bloqueante a <2.5u.
            const wb = (typeof nearestWall === 'function') ? nearestWall(s.position, 2.5) : null;
            if (wb && wb.shelterKey !== s.homeZoneKey) {
                wb.health -= 25;
                s.demoCooldown = 30;
                s.hammering = true;
                s.thoughtText = 'Derribando muro que bloquea el paso...';
                if (wb.health <= 0 && typeof destroyWall === 'function') {
                    destroyWall(wb);
                    addLogEvent(`${s.name} demolió un muro que bloqueaba el acceso.`);
                }
                return true;
            }
            // 2) Escombro residencial o ruina destructible a <2.5u.
            for (const c of colliders) {
                if (c.kind !== 'env' || !c.destructible) continue;
                if (c.kind === 'door') continue;
                const d = Math.hypot(s.position.x - c.pos.x, s.position.z - c.pos.z);
                if (d < c.radius + 1.5) {
                    c.ref.hp -= 25;
                    s.demoCooldown = 30;
                    s.hammering = true;
                    s.thoughtText = 'Despejando escombros para re-armar la casa...';
                    if (c.ref.hp <= 0) {
                        if (c.ref.mesh) scene.remove(c.ref.mesh);
                        unregisterColliderForRef(c.ref);
                        addLogEvent(`${s.name} despejó escombros residenciales. Lote listo para refugio custom.`);
                    }
                    return true;
                }
            }
            return false;
        }
        // Si un zombie choca con entorno destructible, lo golpea para abrir paso.
        function damageBlockingEnv(z) {
            if (!z || z.attackCooldown > 0) return false;
            for (const c of colliders) {
                if (c.kind !== 'env' || !c.destructible) continue;
                const d = Math.hypot(z.position.x - c.pos.x, z.position.z - c.pos.z);
                if (d < c.radius + 1.2) {
                    c.ref.hp -= z.damage * 0.5;
                    z.attackCooldown = 1.2;
                    z.isMoving = false;
                    if (c.ref.hp <= 0) {
                        if (c.ref.mesh) scene.remove(c.ref.mesh);
                        unregisterColliderForRef(c.ref);
                        addLogEvent(c.ref.residential
                            ? 'La horda arrasó escombros residenciales para abrirse paso.'
                            : 'La horda destruyó un obstáculo del entorno para abrirse paso.');
                    }
                    return true;
                }
            }
            return false;
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

        // Anima el balanceo de piernas/brazos para una caminata fluida.
        // Si esta martillando una obra, el brazo derecho golpea como martillo.
        function animateEntityLimbs(entity, delta) {
            if (!entity.limbs) return;
            const l = entity.limbs;
            if (entity.hammering && entity.health > 0) {
                entity.animPhase += delta * 11 * Math.max(0.5, gameSpeed);
                const hammer = Math.sin(entity.animPhase) * 0.85;
                l.armR.rotation.x = -1.3 + hammer; // martillazos
                l.armL.rotation.x *= 0.8;
                l.legL.rotation.x *= 0.8;
                l.legR.rotation.x *= 0.8;
                return;
            }
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

        // Reserva exclusiva: si un superviviente ya va por una caja/loot,
        // los demas eligen otro objetivo (uno por caja).
        function isCrateClaimed(crate, self) {
            return survivors.some(o => o !== self && o.health > 0 && o.targetCrate === crate);
        }

        function isLootClaimed(loot, self) {
            return survivors.some(o => o !== self && o.health > 0 && o.targetLoot === loot);
        }

        function findClosestAvailableCrate(pos, self) {
            let closest = null;
            let minDist = 999;
            crates.forEach(c => {
                if (c.isPickedUp) return;
                if (self && isCrateClaimed(c, self)) return; // ya la persigue otro
                const d = pos.distanceTo(c.position);
                if (d < minDist) { minDist = d; closest = c; }
            });
            return closest;
        }

        function findClosestAvailableLoot(pos, self) {
            let closest = null;
            let minDist = 999;
            loots.forEach(l => {
                if (self && isLootClaimed(l, self)) return;
                const d = pos.distanceTo(l.position);
                if (d < minDist) { minDist = d; closest = l; }
            });
            return closest;
        }

        // ==========================================================
        // ORDEN OFICIAL DEL EQUIPO (pasos 1-7, sin limbo):
        // 1 MAIN > 2 FOUND + 2 TURRETAS BASE > 3 COLLECT TODO > 4 REPAIR
        // (1 a la vez al 100%) > 5 FIRST-TOWER > 6 REQUEST > 7 MORE-TOWERS.
        // Una sola obra grupal activa; se termina al 100% antes de otra.
        // ==========================================================
        function ensureMainShelter() {
            if (typeof mainShelterKey === 'undefined') return 'MALL';
            const mz = ZONES[mainShelterKey];
            if (mz && mz.isActiveShelter && mz.intact) return mainShelterKey;
            const fallback = activeShelterKeys[0] || 'MALL';
            if (mainShelterKey !== fallback) {
                mainShelterKey = fallback;
                addLogEvent(`Refugio principal definido: ${ZONES[fallback].name} (paso 1 del plan).`);
                if (typeof renderSheltersPanel === 'function') renderSheltersPanel();
            }
            return mainShelterKey;
        }

        function countBaseTurrets() {
            return activeShelterKeys.filter(k => ZONES[k] && ZONES[k].turret).length;
        }

        function countAvailableCrates() {
            return crates.filter(c => !c.isPickedUp).length;
        }

        function setOrderPhase(p) {
            if (typeof orderPhase === 'undefined') return;
            if (orderPhase !== p) {
                orderPhase = p;
                if (typeof updateUI === 'function') updateUI();
            }
        }

        function getGroupDirective() {
            if (isWaveActive) return null;
            ensureMainShelter(); // paso 1 siempre garantizado
            setOrderPhase('MAIN');

            // Validar bloqueo actual: solo sigue si su objetivo sigue vigente.
            if (typeof groupTask !== 'undefined' && groupTask) {
                if (groupTask.kind === 'repair') {
                    // Sigue solo si ese refugio aun no esta al 100%.
                    if (typeof shelterRepairPct === 'function' && shelterRepairPct(groupTask.key) >= 100) groupTask = null;
                    else if (!activeShelterKeys.includes(groupTask.key)) groupTask = null;
                    else { setOrderPhase('REPAIR'); return groupTask; }
                } else if (groupTask.kind === 'found') {
                    if (typeof shelterFounder === 'undefined' || !shelterFounder) groupTask = null;
                    else { setOrderPhase('FOUND'); return groupTask; }
                } else if (groupTask.kind === 'tower') {
                    const site = towers.find(t => !t.complete && t.id === groupTask.siteId);
                    if (!site) groupTask = null;
                    else { setOrderPhase(towers.some(t => t.complete) ? 'MORE-TOWERS' : 'FIRST-TOWER'); return groupTask; }
                } else if (groupTask.kind === 'turret-base') {
                    if (countBaseTurrets() >= ORDER_MIN_TURRETS) groupTask = null;
                    else { setOrderPhase('TURRETS'); return groupTask; }
                } else if (groupTask.kind === 'collect') {
                    if (countAvailableCrates() === 0) groupTask = null;
                    else { setOrderPhase('COLLECT'); return groupTask; }
                } else {
                    groupTask = null;
                }
            }

            // PASO 2a: fundar hasta tener minimo 2 refugios (o terminar fundacion en curso).
            if (typeof shelterFounder !== 'undefined' && shelterFounder) {
                groupTask = { kind: 'found', key: shelterFounder.zoneKey };
                setOrderPhase('FOUND');
                return groupTask;
            }
            const aliveN = survivors.filter(o => o.health > 0).length;
            const canFound = aliveN >= 3 && activeShelterKeys.length < ORDER_MIN_SHELTERS &&
                baseResources.ammo >= SHELTER_FOUND_COST.ammo && baseResources.food >= SHELTER_FOUND_COST.food &&
                Object.keys(ZONES).some(k => !ZONES[k].isActiveShelter && ZONES[k].intact);
            if (canFound) {
                groupTask = { kind: 'found', key: null };
                setOrderPhase('FOUND');
                return groupTask;
            }

            // PASO 2b: al menos 2 torretas base (una por refugio idealmente).
            if (countBaseTurrets() < Math.min(ORDER_MIN_TURRETS, activeShelterKeys.length)) {
                groupTask = { kind: 'turret-base', key: null };
                setOrderPhase('TURRETS');
                return groupTask;
            }

            // PASO 3: recolectar TODOS los materiales del mapa antes de obra.
            if (countAvailableCrates() > 0) {
                groupTask = { kind: 'collect', key: null };
                setOrderPhase('COLLECT');
                return groupTask;
            }

            // PASO 4: reparar UN refugio a la vez hasta el 100% (bloqueo anti-limbo).
            if (typeof mostDamagedShelter === 'function' && mostDamagedShelter()) {
                const t = mostDamagedShelter();
                groupTask = { kind: 'repair', key: t.key };
                setOrderPhase('REPAIR');
                return groupTask;
            }

            // PASO 5 y 7: 3 torres por refugio (6 si es custom: 3 techo + 3 fuera).
            const site = towers.find(t => !t.complete) || null;
            if (site) {
                groupTask = { kind: 'tower', siteId: site.id, key: site.zoneKey };
                setOrderPhase(towers.some(t => t.complete) ? 'MORE-TOWERS' : 'FIRST-TOWER');
                return groupTask;
            }
            const completeN = towers.filter(t => t.complete).length;
            // Buscar refugio con cupo libre (respeta limite por refugio).
            const shelterWithSlot = activeShelterKeys.find(k => {
                if (typeof countTowersForShelter === 'function' && typeof towerLimitForShelter === 'function') {
                    return countTowersForShelter(k) < towerLimitForShelter(k);
                }
                return true;
            });
            if (shelterWithSlot && baseResources.ammo >= 1) {
                groupTask = { kind: 'tower', siteId: null, key: shelterWithSlot };
                setOrderPhase(completeN < 1 ? 'FIRST-TOWER' : 'MORE-TOWERS');
                return groupTask;
            }

            // PASO 6: sin materiales ni obra posible -> solicitar ayuda.
            if (typeof requestSupplyHelp === 'function') requestSupplyHelp('materiales para seguir construyendo');
            setOrderPhase('REQUEST');
            return null;
        }

        // Paso 2b: construir la torreta base faltante (consume 1 heavy si hay).
        function updateBaseTurretTask(s) {
            if (isWaveActive) return false;
            const missing = activeShelterKeys.find(k => ZONES[k] && !ZONES[k].turret);
            if (!missing) {
                if (typeof groupTask !== 'undefined' && groupTask && groupTask.kind === 'turret-base') groupTask = null;
                return false;
            }
            const zone = ZONES[missing];
            const d = s.position.distanceTo(zone.pos);
            if (d > 5) {
                s.thoughtText = `Yendo a instalar torreta en ${zone.name} (paso 2)...`;
                moveTowards(s, zone.pos, 0.11);
                return true;
            }
            s.isMoving = false;
            s.hammering = true;
            aimTowards(s, zone.pos);
            s.thoughtText = `Instalando torreta en ${zone.name}...`;
            // Requiere 1 heavy como materiales; si no hay, pide suministros.
            if (!zone.turret) {
                if (baseResources.heavy >= 1) {
                    buildTurretAt(missing, false);
                    addLogEvent(`${s.name} instaló torreta base en ${zone.name} (${countBaseTurrets()}/${ORDER_MIN_TURRETS}).`);
                    if (countBaseTurrets() >= ORDER_MIN_TURRETS && groupTask && groupTask.kind === 'turret-base') groupTask = null;
                    updateUI();
                } else {
                    if (typeof requestSupplyHelp === 'function') requestSupplyHelp('pesadas para torretas');
                    s.thoughtText = `Esperando materiales para torreta...`;
                }
            }
            return true;
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
            else if (crateType === 'MED') { baseResources.meds += 2; survivor.medkits = Math.min(5, (survivor.medkits || 0) + 2); survivor.health = Math.min(survivor.maxHealth, survivor.health + 20); }
            else if (crateType === 'FOOD') baseResources.food += 2;
            else if (crateType === 'ARMOR') { survivor.armor = Math.min(100, survivor.armor + 40); baseResources.ammo += 1; }
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
            refreshWeaponMesh(survivor); // cambia el modelo 3D del arma en mano
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

        // Barricadas en cuadrado defensivo (max 4 vivas por superviviente)
        const BARRICADE_SQUARE = [[-7, -7], [7, -7], [7, 7], [-7, 7]];

        function countOwnBarricades(s) {
            let n = 0;
            barricades.forEach(b => { if (b.owner === s && b.health > 0) n++; });
            return n;
        }

        function findBarricadeSpot(s, zone) {
            // Esquina libre del cuadrado centrada en su puesto de defensa
            const cx = zone.pos.x + Math.cos(s.id * 1.7) * zone.radius * 0.4;
            const cz = zone.pos.z + Math.sin(s.id * 1.7) * zone.radius * 0.4;
            for (let k = 0; k < 4; k++) {
                const slot = (s.buildSlot + k) % 4;
                const px = cx + BARRICADE_SQUARE[slot][0];
                const pz = cz + BARRICADE_SQUARE[slot][1];
                let occupied = false;
                barricades.forEach(b => {
                    if (b.health > 0 && Math.hypot(b.position.x - px, b.position.z - pz) < 2.5) occupied = true;
                });
                if (!occupied) { s.buildSlot = slot; return new THREE.Vector3(px, 0, pz); }
            }
            return null;
        }

        // --- Refuerzo INDIVIDUAL: cada pieza la construye UN solo superviviente.
        // Tipos: muro nuevo, puerta nueva, ventana nueva, barricada con pinchos.
        // Solo torre y reforzar refugio (repair) son grupales; esto siempre es 1x1.
        function isFortifySpotClaimed(pos, self) {
            return survivors.some(o => o !== self && o.health > 0 && o.fortify && o.fortify.target &&
                Math.hypot(o.fortify.target.x - pos.x, o.fortify.target.z - pos.z) < 3);
        }
        function findFortifySpot(s, zone, type) {
            const spots = [];
            if (type === 'spike') {
                const cx = zone.pos.x + Math.cos(s.id * 1.7) * zone.radius * 0.4;
                const cz = zone.pos.z + Math.sin(s.id * 1.7) * zone.radius * 0.4;
                for (let k = 0; k < 4; k++) {
                    const slot = (s.buildSlot + k) % 4;
                    spots.push(new THREE.Vector3(cx + BARRICADE_SQUARE[slot][0], 0, cz + BARRICADE_SQUARE[slot][1]));
                }
            } else {
                // Anillo perimetral: 8 puntos a radio+6 (muros/puertas/ventanas).
                for (let k = 0; k < 8; k++) {
                    const ang = (k / 8) * Math.PI * 2 + s.id * 0.2;
                    spots.push(new THREE.Vector3(zone.pos.x + Math.cos(ang) * (zone.radius + 6), 0, zone.pos.z + Math.sin(ang) * (zone.radius + 6)));
                }
            }
            for (const p of spots) {
                let occupied = false;
                barricades.forEach(b => { if (b.health > 0 && Math.hypot(b.position.x - p.x, b.position.z - p.z) < 2.5) occupied = true; });
                walls.forEach(w => { if (w.health > 0 && Math.hypot(w.position.x - p.x, w.position.z - p.z) < 3) occupied = true; });
                if (typeof doors !== 'undefined') doors.forEach(d => { if (d.health > 0 && Math.hypot(d.position.x - p.x, d.position.z - p.z) < 3) occupied = true; });
                if (occupied || isFortifySpotClaimed(p, s)) continue;
                return p;
            }
            return null;
        }
        function updateIndividualFortify(s, delta, homeZone) {
            if (isWaveActive) return false;
            // Continuar pieza propia en curso.
            if (s.fortify && s.fortify.target) {
                const f = s.fortify;
                const d = s.position.distanceTo(f.target);
                if (d > 2) {
                    s.thoughtText = `Llevando materiales (${f.type})...`;
                    moveTowards(s, f.target, 0.11);
                    return true;
                }
                s.isMoving = false;
                s.hammering = true;
                aimTowards(s, homeZone.pos);
                f.progress += delta * gameSpeed;
                const pct = Math.min(99, Math.round(f.progress / f.required * 100));
                s.thoughtText = `Construyendo ${f.type} ${pct}% (individual)`;
                if (f.progress >= f.required) {
                    if (baseResources.ammo < 1) { s.fortify = null; return false; }
                    baseResources.ammo = Math.max(0, baseResources.ammo - 1);
                    if (f.type === 'muro') {
                        if (typeof buildFortifyWall === 'function') buildFortifyWall(homeZone.key, f.target.x, f.target.z, 0);
                    } else if (f.type === 'puerta') {
                        if (typeof createSurvivorDoor === 'function') createSurvivorDoor(homeZone.key, f.target.x, f.target.z, 0);
                    } else if (f.type === 'ventana') {
                        if (typeof buildFortifyWindow === 'function') buildFortifyWindow(homeZone.key, f.target.x, f.target.z, 0);
                    } else if (f.type === 'pinchos') {
                        if (typeof createSpikeBarricade === 'function') { const r = createSpikeBarricade(f.target.x, f.target.z, s); }
                    }
                    addLogEvent(`${s.name} construyó ${f.type} (individual) en ${homeZone.name}.`);
                    s.fortify = null;
                    s.buildSlot = ((s.buildSlot || 0) + 1) % 4;
                    updateUI();
                }
                return true;
            }
            // Nueva pieza propia (round-robin por superviviente, con topes).
            if (baseResources.ammo < 1) return false;
            if (s.role !== 'Ingeniero' && Math.random() > 0.006 * gameSpeed) return false;
            const order = ['muro', 'puerta', 'ventana', 'pinchos'];
            s.fortifyCycle = ((s.fortifyCycle || 0) + 1) % order.length;
            for (let n = 0; n < order.length; n++) {
                const type = order[(s.fortifyCycle + n) % order.length];
                if (type === 'pinchos' && countOwnBarricades(s) >= BARRICADES_PER_SURVIVOR) continue;
                if (type === 'puerta' && typeof doors !== 'undefined' && doors.filter(dd => dd.shelterKey === homeZone.key).length >= 8) continue;
                const spot = findFortifySpot(s, homeZone, type === 'pinchos' ? 'spike' : 'wall');
                if (!spot) continue;
                s.fortify = { type: type, target: spot, progress: 0, required: type === 'muro' ? 4 : 3 };
                s.thoughtText = `Iniciando ${type} (individual)...`;
                return true;
            }
            return false;
        }
        function updateSurvivorBuild(s, delta, homeZone) {
            // Compat: ahora todo el refuerzo es individual (1x1).
            return updateIndividualFortify(s, delta, homeZone);
        }

        // ==========================================================
        // CURACION DE ALIADOS (PRIORIDAD 1)
        // ==========================================================
        function findWoundedAlly(s) {
            let best = null, bestD = 14;
            survivors.forEach(o => {
                if (o === s || o.health <= 0 || o.onTower) return; // en torre estan a salvo e inalcanzables
                if (o.health >= o.maxHealth * 0.65) return;
                const d = s.position.distanceTo(o.position);
                if (d < bestD) { bestD = d; best = o; }
            });
            return best;
        }

        function updateSurvivorHeal(s, delta) {
            if ((s.medkits || 0) <= 0) { s.healTarget = null; return false; }
            let ally = s.healTarget;
            if (!ally || ally.health <= 0 || ally.onTower || ally.health >= ally.maxHealth * 0.95) {
                ally = findWoundedAlly(s);
                s.healTarget = ally;
            }
            if (!ally) return false;
            const d = s.position.distanceTo(ally.position);
            if (d > 2.2) {
                s.thoughtText = `Corriendo a curar a ${ally.name}...`;
                moveTowards(s, ally.position, 0.13);
                return true;
            }
            // Canalizando cura: 25/s (Elena 35/s), consume 1 botiquin por aliado
            s.isMoving = false;
            aimTowards(s, ally.position);
            const rate = s.role === 'Médico' ? 35 : 25;
            ally.health = Math.min(ally.maxHealth, ally.health + rate * delta * gameSpeed);
            s.thoughtText = `Curando a ${ally.name}...`;
            ally.thoughtText = `${s.name} me esta curando...`;
            if (s.healFXTimer <= 0) {
                spawnHealCross(ally.position);
                s.healFXTimer = 0.4;
            }
            if (ally.health >= ally.maxHealth * 0.95) {
                s.medkits--;
                addLogEvent(`${s.name} curo a ${ally.name} con un botiquin.`);
                s.healTarget = null;
                updateUI();
            }
            return true;
        }

        // ==========================================================
        // TORRES DE VIGILANCIA (ULTIMA PRIORIDAD)
        // ==========================================================
        function countCompleteTowers() {
            return towers.filter(t => t.complete).length;
        }

        function findTowerSite() {
            return towers.find(t => !t.complete) || null;
        }

        // Durante la oleada: subir a una torre completa con sitio libre
        function updateTowerOccupy(s, homeZone) {
            if (s.onTower) {
                s.isMoving = false;
                s.thoughtText = `Cubriendo desde torre ${s.onTower.id}`;
                // Mantener posicion de plataforma
                const slot = s.onTower.occupants.indexOf(s);
                const ox = s.onTower.pos.x + (slot === 0 ? -1 : 1);
                s.position.set(ox, TOWER_HEIGHT + 0.4, s.onTower.pos.z);
                return true;
            }
            const tower = nearestTower(s.position, 60, true);
            if (!tower || tower.occupants.length >= 2) return false;
            if (s.position.distanceTo(tower.pos) > 3) {
                s.thoughtText = `Subiendo a torre ${tower.id}...`;
                const base = tower.pos.clone();
                if (s.position.distanceTo(base) > 1.5) moveTowards(s, base, 0.13);
                else {
                    tower.occupants.push(s);
                    s.onTower = tower;
                    s.isMoving = false;
                    addLogEvent(`${s.name} subio a la torre ${tower.id} como vigia.`);
                }
                return true;
            }
            tower.occupants.push(s);
            s.onTower = tower;
            s.isMoving = false;
            return true;
        }

        function dismountTower(s) {
            if (!s.onTower) return;
            const t = s.onTower;
            const oi = t.occupants.indexOf(s);
            if (oi > -1) t.occupants.splice(oi, 1);
            s.onTower = null;
            s.position.y = 0;
            s.position.x += 3;
        }

        // Fuera de oleada: TORRES ILIMITADAS, una sola obra activa y todo el
        // equipo trabaja en la misma hasta terminarla (tarea grupal).
        function updateTowerWork(s, delta, homeZone) {
            if (isWaveActive) return false;
            // Solo una obra incompleta a la vez; respeta cupo 3/refugio (6 custom).
            let site = findTowerSite();
            if (site && s.towerSiteId && s.towerSiteId !== site.id) s.towerSiteId = site.id;
            if (!site) {
                if (baseResources.ammo < 1) {
                    if (typeof requestSupplyHelp === 'function') requestSupplyHelp('munición para torres');
                    return false;
                }
                // Elegir refugio con cupo: groupTask.key o el primero con hueco.
                let targetKey = (typeof groupTask !== 'undefined' && groupTask && groupTask.kind === 'tower' && groupTask.key) ? groupTask.key : null;
                if (!targetKey || countTowersForShelter(targetKey) >= towerLimitForShelter(targetKey)) {
                    targetKey = activeShelterKeys.find(k => countTowersForShelter(k) < towerLimitForShelter(k)) || null;
                }
                if (!targetKey) return false; // todos los refugios al tope
                const tZone = ZONES[targetKey];
                const isCustom = !!(typeof customShelters !== 'undefined' && customShelters[targetKey]);
                const roofCount = countRoofTowers(targetKey);
                let wx, wz, roof = false;
                // Custom: 3 en techo + 3 fuera. Primeras 3 van al techo.
                if (isCustom && roofCount < 3) {
                    roof = true;
                    const ang = (roofCount / 3) * Math.PI * 2;
                    wx = tZone.pos.x + Math.cos(ang) * 4;
                    wz = tZone.pos.z + Math.sin(ang) * 4;
                } else {
                    const ang = Math.random() * Math.PI * 2;
                    const r = tZone.radius + 10;
                    wx = tZone.pos.x + Math.cos(ang) * r;
                    wz = tZone.pos.z + Math.sin(ang) * r;
                }
                site = createTowerSite(targetKey, wx, wz, roof);
                baseResources.ammo = Math.max(0, baseResources.ammo - 1);
            }
            s.towerSiteId = site.id;
            const d = s.position.distanceTo(site.pos);
            if (d > 2.5) {
                s.thoughtText = `Yendo a la obra de la torre...`;
                moveTowards(s, site.pos, 0.11);
                return true;
            }
            s.isMoving = false;
            s.hammering = true; // animacion de martillar la torre
            aimTowards(s, site.pos);
            site.progress += delta * gameSpeed; // 1s aportado por segundo trabajado
            site.mesh.scale.y = Math.min(1, 0.2 + 0.8 * (site.progress / TOWER_WORK_REQUIRED));
            s.thoughtText = `Construyendo torre ${Math.floor(site.progress)}/${TOWER_WORK_REQUIRED}s`;
            if (site.progress >= TOWER_WORK_REQUIRED) {
                finishTower(site);
                survivors.forEach(o => { if (o.towerSiteId === site.id) o.towerSiteId = null; });
                if (typeof groupTask !== 'undefined' && groupTask && groupTask.kind === 'tower') groupTask = null;
            }
            return true;
        }

        // ==========================================================
        // FUNDAR NUEVOS REFUGIOS (casa de 4 muros con puertas/ventanas)
        // ==========================================================
        function expectedWallSegments(key) {
            const lv = (typeof shelterLevels !== 'undefined' && shelterLevels[key]) || 2;
            return lv >= 3 ? 12 : 8; // 8 segmentos + 4 refuerzo en fortaleza
        }
        function mostDamagedShelter() {
            let best = null;
            activeShelterKeys.forEach(k => {
                const z = ZONES[k];
                let score = (100 - z.health) / 100;
                const expected = expectedWallSegments(k);
                const totalWalls = walls.filter(w => w.shelterKey === k).length;
                const hasHouse = totalWalls > 0 || (typeof shelterLevels !== 'undefined' && shelterLevels[k]);
                if (hasHouse) {
                    score += Math.max(0, (expected - totalWalls)) / expected;
                    walls.forEach(w => {
                        if (w.shelterKey === k) score += (w.maxHealth - Math.max(0, w.health)) / w.maxHealth * 0.25;
                    });
                    // Puertas dañadas tambien ponderan.
                    if (typeof doors !== 'undefined') {
                        doors.forEach(d => {
                            if (d.shelterKey === k) score += (d.maxHealth - Math.max(0, d.health)) / d.maxHealth * 0.2;
                        });
                    }
                }
                if (score > 0.02 && (!best || score > best.score)) best = { key: k, zone: z, score: score };
            });
            return best;
        }

        // Paso 4: UN refugio a la vez hasta el 100% (bloqueo anti-limbo:
        // se respeta groupTask.key aunque otro parezca mas dañado).
        function updateShelterRepair(s, delta) {
            if (isWaveActive) return false;
            let target = null;
            if (typeof groupTask !== 'undefined' && groupTask && groupTask.kind === 'repair' && ZONES[groupTask.key]) {
                target = { key: groupTask.key, zone: ZONES[groupTask.key] };
                // Si ya llego al 100%, liberar bloqueo y no trabajar mas aqui.
                if (typeof shelterRepairPct === 'function' && shelterRepairPct(target.key) >= 100) {
                    groupTask = null;
                    return false;
                }
                if (!activeShelterKeys.includes(target.key)) { groupTask = null; return false; }
            } else {
                target = mostDamagedShelter();
            }
            if (!target) {
                if (typeof groupTask !== 'undefined' && groupTask && groupTask.kind === 'repair') groupTask = null;
                return false;
            }
            const d = s.position.distanceTo(target.zone.pos);
            if (d > target.zone.radius * 0.7) {
                s.thoughtText = `Yendo a reconstruir ${target.zone.name}...`;
                moveTowards(s, target.zone.pos, 0.11);
                return true;
            }
            s.isMoving = false;
            s.hammering = true;
            aimTowards(s, target.zone.pos);
            // Reparar salud del refugio (~25s del 0 al 100)
            if (target.zone.health < 100) {
                target.zone.health = Math.min(100, target.zone.health + 4 * delta * gameSpeed);
            }
            // Reparar muros/puertas y re-levantar caidos (6s por segmento).
            const expected = expectedWallSegments(target.key);
            const existingWalls = walls.filter(w => w.shelterKey === target.key).length;
            const deadSides = Math.max(0, expected - existingWalls - 4); // 4 huecos son puertas
            let repaired = false;
            walls.forEach(w => {
                if (w.shelterKey === target.key && w.health < w.maxHealth) {
                    w.health = Math.min(w.maxHealth, w.health + 10 * delta * gameSpeed);
                    repaired = true;
                }
            });
            if (typeof doors !== 'undefined') {
                doors.forEach(d => {
                    if (d.shelterKey === target.key && d.health < d.maxHealth) {
                        d.health = Math.min(d.maxHealth, d.health + 12 * delta * gameSpeed);
                        repaired = true;
                    }
                });
            }
            // Si falta puerta, reconstruirla primero (acceso propio).
            const expectedDoors = 4;
            const existingDoors = (typeof doors !== 'undefined') ? doors.filter(d => d.shelterKey === target.key).length : 4;
            if (!repaired && existingDoors < expectedDoors) {
                s.repairWallTimer = (s.repairWallTimer || 0) + delta * gameSpeed;
                if (s.repairWallTimer >= 4) {
                    s.repairWallTimer = 0;
                    if (typeof rebuildShelterDoor === 'function') rebuildShelterDoor(target.key);
                    else rebuildShelterWall(target.key);
                    addLogEvent(`${s.name} colocó puerta en ${target.zone.name} (solo supervivientes).`);
                }
            } else if (!repaired && deadSides > 0) {
                s.repairWallTimer = (s.repairWallTimer || 0) + delta * gameSpeed;
                if (s.repairWallTimer >= 6) {
                    s.repairWallTimer = 0;
                    rebuildShelterWall(target.key);
                    addLogEvent(`${s.name} re-levanto un muro en ${target.zone.name}.`);
                }
            }
            // Al 100% y con materiales de sobra: subir a fortaleza (mini->casa->fortaleza).
            if (shelterRepairPct(target.key) >= 100) {
                const lv = (typeof shelterLevels !== 'undefined' && shelterLevels[target.key]) || 2;
                if (lv < 3 && baseResources.ammo >= 1 && baseResources.food >= 1) {
                    baseResources.ammo -= 1; baseResources.food -= 1;
                    if (typeof upgradeShelterLevel === 'function') upgradeShelterLevel(target.key);
                    if (typeof groupTask !== 'undefined' && groupTask && groupTask.kind === 'repair') groupTask = null;
                    return true;
                }
            }
            const pct = shelterRepairPct(target.key);
            s.thoughtText = `Reconstruyendo ${target.zone.name} ${pct}% (paso 4)`;
            s.repairKey = target.key;
            if (pct >= 100 && typeof groupTask !== 'undefined' && groupTask && groupTask.kind === 'repair' && groupTask.key === target.key) {
                groupTask = null; // 100% completado: liberar para la siguiente tarea
                addLogEvent(`${target.zone.name} reconstruido al 100%. Pasando a la siguiente tarea del plan.`);
            }
            return true;
        }

        function shelterRepairPct(key) {
            const z = ZONES[key];
            const total = walls.filter(w => w.shelterKey === key);
            const expected = (typeof expectedWallSegments === 'function') ? expectedWallSegments(key) : 8;
            let sum = z.health;
            let max = 100 + expected * WALL_HP;
            total.forEach(w => { sum += Math.max(0, w.health); });
            if (typeof doors !== 'undefined') {
                doors.filter(d => d.shelterKey === key).forEach(d => { sum += Math.max(0, d.health) * 0.5; max += d.maxHealth * 0.5; });
            }
            return Math.round(sum / Math.max(1, max) * 100);
        }
        function rebuildShelterDoor(zoneKey) {
            const zone = ZONES[zoneKey];
            const H = 7;
            const existing = (typeof doors !== 'undefined') ? doors.filter(d => d.shelterKey === zoneKey).length : 0;
            const sideIdx = existing % 4;
            const offs = [{ x: 0, z: -H, ry: 0 }, { x: 0, z: H, ry: 0 }, { x: -H, z: 0, ry: Math.PI / 2 }, { x: H, z: 0, ry: Math.PI / 2 }];
            const sd = offs[sideIdx];
            if (typeof createSurvivorDoor === 'function') createSurvivorDoor(zoneKey, zone.pos.x + sd.x, zone.pos.z + sd.z, sd.ry);
            updateUI();
        }

        function rebuildShelterWall(zoneKey) {
            const zone = ZONES[zoneKey];
            const H = 7;
            // Reconstruye un segmento de 5m junto a una puerta (no tapa accesos).
            const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 0.5),
                new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.8 }));
            const sideIdx = walls.filter(w => w.shelterKey === zoneKey).length % 4;
            const offs = [{ x: 0, z: -H, ry: 0 }, { x: 0, z: H, ry: 0 }, { x: -H, z: 0, ry: Math.PI / 2 }, { x: H, z: 0, ry: Math.PI / 2 }];
            const sd = offs[sideIdx];
            const along = (sideIdx % 2 === 0) ? 3.5 : 0;
            const across = (sideIdx % 2 === 0) ? 0 : 3.5;
            wall.position.set(zone.pos.x + sd.x + (sd.ry === 0 ? along : across * 0), 1.3, zone.pos.z + sd.z + (sd.ry === 0 ? 0 : along));
            wall.rotation.y = sd.ry;
            wall.castShadow = true;
            scene.add(wall);
            const rec = { mesh: wall, health: WALL_HP * 0.5, maxHealth: WALL_HP, position: wall.position, shelterKey: zoneKey };
            walls.push(rec);
            if (typeof registerCollider === 'function') registerCollider(rec.position, 2.2, rec, 'wall', false);
            updateUI();
        }

        // Fundar refugio en la zona libre que mejor venga (recursos + obra 120s)
        function updateShelterFound(s, delta) {
            if (isWaveActive) return false;
            const aliveCount = survivors.filter(o => o.health > 0).length;
            if (aliveCount < 3 || activeShelterKeys.length >= 4) return false;
            if (!shelterFounder) {
                if (baseResources.ammo < SHELTER_FOUND_COST.ammo || baseResources.food < SHELTER_FOUND_COST.food) return false;
                if (s.role !== 'Ingeniero' && s.role !== 'Líder' && Math.random() > 0.002 * gameSpeed) return false;
                // Prioridad: re-armar las casas residenciales destruidas como refugio custom.
                let candidateKey = null;
                if (ZONES.HOUSES && !ZONES.HOUSES.isActiveShelter && ZONES.HOUSES.intact) candidateKey = 'HOUSES';
                if (!candidateKey) candidateKey = Object.keys(ZONES).find(k => !ZONES[k].isActiveShelter && ZONES[k].intact);
                if (!candidateKey) return false;
                baseResources.ammo -= SHELTER_FOUND_COST.ammo;
                baseResources.food -= SHELTER_FOUND_COST.food;
                shelterFounder = { zoneKey: candidateKey, progress: 0, required: SHELTER_FOUND_WORK };
                showAirBanner(`Nuevo refugio en construccion: ${ZONES[candidateKey].name}`, 'fa-solid fa-house-chimney text-amber-300 text-lg');
                addLogEvent(`${s.name} inicio la fundacion de un refugio en ${ZONES[candidateKey].name}.`);
                updateUI();
            }
            const zone = ZONES[shelterFounder.zoneKey];
            const d = s.position.distanceTo(zone.pos);
            if (d > 4) {
                s.thoughtText = `Yendo a fundar refugio en ${zone.name}...`;
                moveTowards(s, zone.pos, 0.11);
                return true;
            }
            s.isMoving = false;
            s.hammering = true;
            aimTowards(s, zone.pos);
            shelterFounder.progress += delta * gameSpeed;
            s.thoughtText = `Levantando refugio ${Math.floor(shelterFounder.progress)}/${shelterFounder.required}s`;
            if (shelterFounder.progress >= shelterFounder.required) {
                const key = shelterFounder.zoneKey;
                shelterFounder = null;
                if (typeof groupTask !== 'undefined' && groupTask && groupTask.kind === 'found') groupTask = null;
                activateShelter(key, false);
                // Refugio desde 0: mini-casa nivel 1 (crece a fortaleza con reparaciones).
                if (typeof createMiniShelter === 'function') createMiniShelter(key);
                else createShelterHouse(key);
                if (baseResources.heavy >= 1) buildTurretAt(key, false);
                // Repartir un obrero de la guarnicion mas numerosa
                const homeCounts = {};
                survivors.forEach(o => { if (o.health > 0) homeCounts[o.homeZoneKey] = (homeCounts[o.homeZoneKey] || 0) + 1; });
                const donorKey = Object.keys(homeCounts).sort((a, b) => homeCounts[b] - homeCounts[a])[0];
                const donor = survivors.find(o => o.homeZoneKey === donorKey && o.health > 0);
                if (donor) donor.homeZoneKey = key;
                showAirBanner(`Refugio fundado: ${ZONES[key].name}`, 'fa-solid fa-house-chimney text-emerald-300 text-lg');
                addLogEvent(`¡Nuevo refugio fundado por supervivientes en ${ZONES[key].name}! Casa, torreta y reserva listas.`);
                showToast(`Refugio fundado: ${ZONES[key].name}`);
            }
            return true;
        }

        // ==========================================================
        // MUERTE CENTRALIZADA: baja + loot
        // ==========================================================
        function killZombie(z, ownerSurvivor) {
            if (!z || z.health > 0 || z.dying) return;
            z.health = 0;
            z.dying = true;
            z.deathTimer = 0;
            z.burned = false;
            dyingZombies.push(z);
            zombiesAliveCount = Math.max(0, zombiesAliveCount - 1);
            if (ownerSurvivor && ownerSurvivor.health > 0) ownerSurvivor.kills++;
            // Loot en el punto de caida
            if (Math.random() < LOOT_CHANCE) {
                spawnLootPickup(z.position.x, z.position.z);
            }
            if (zombiesAliveCount === 0 && isWaveActive) endWaveSuccess();
            updateUI();
        }

        function closestKillerTo(pos, range) {
            let best = null, bestD = range;
            survivors.forEach(s => {
                if (s.health <= 0) return;
                const d = s.position.distanceTo(pos);
                if (d < bestD) { bestD = d; best = s; }
            });
            return best;
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
                // (pinchos devuelven daño al atacante).
                const block = nearestBarricade(z.position, 2.8);
                if (block && z.attackCooldown <= 0) {
                    block.health -= z.damage * 0.6;
                    z.attackCooldown = 1.2;
                    z.isMoving = false;
                    aimTowards(z, block.position);
                    createMuzzleFlash(block.position, 0x92400e, 0.08);
                    if (block.spiked) {
                        z.health -= 6;
                        if (z.health <= 0 && !z.dying && typeof killZombie === 'function') {
                            killZombie(z, block.owner && block.owner.health > 0 ? block.owner : closestKillerTo(z.position, 25));
                            animateEntityLimbs(z, delta);
                            continue;
                        }
                    }
                    if (block.health <= 0) {
                        scene.remove(block.mesh);
                        if (typeof unregisterColliderForRef === 'function') unregisterColliderForRef(block);
                        const bi = barricades.indexOf(block);
                        if (bi > -1) barricades.splice(bi, 1);
                        addLogEvent('Una barricada ha sido destruida por la horda.');
                    }
                    animateEntityLimbs(z, delta);
                    continue;
                }

                // Muro de casa-refugio en el camino: tambien lo golpea
                const wallBlock = nearestWall(z.position, 2.8);
                if (wallBlock && z.attackCooldown <= 0) {
                    wallBlock.health -= z.damage * 0.6;
                    z.attackCooldown = 1.2;
                    z.isMoving = false;
                    aimTowards(z, wallBlock.position);
                    createMuzzleFlash(wallBlock.position, 0x92400e, 0.08);
                    if (wallBlock.health <= 0) destroyWall(wallBlock);
                    animateEntityLimbs(z, delta);
                    continue;
                }

                // Puerta de supervivientes: los zombies no pueden abrirla, la destruyen.
                if (typeof nearestDoor === 'function') {
                    const doorBlock = nearestDoor(z.position, 2.8);
                    if (doorBlock && z.attackCooldown <= 0) {
                        doorBlock.health -= z.damage * 0.7;
                        z.attackCooldown = 1.2;
                        z.isMoving = false;
                        aimTowards(z, doorBlock.position);
                        createMuzzleFlash(doorBlock.position, 0x92400e, 0.08);
                        if (doorBlock.health <= 0 && typeof destroyDoor === 'function') destroyDoor(doorBlock);
                        animateEntityLimbs(z, delta);
                        continue;
                    }
                }

                // PRIORIDAD: primero destruir el refugio, luego a los supervivientes.
                // Solo se desvia a un superviviente si esta a contacto (<6u).
                let targetSurvivor = null;
                let minDist = 999;

                survivors.forEach(s => {
                    if (s.health > 0 && !s.onTower) { // en torre estan fuera de alcance
                        const d = z.position.distanceTo(s.position);
                        if (d < minDist) { minDist = d; targetSurvivor = s; }
                    }
                });

                // Contacto cercano: defensa propia contra el superviviente.
                if (targetSurvivor && minDist < 6) {
                    moveTowards(z, targetSurvivor.position, z.speed);

                    if (minDist < 1.5 && z.attackCooldown <= 0) {
                        let dmg = z.damage;
                        if (targetSurvivor.armor > 0) { // el blindaje absorbe la mitad
                            const absorbed = Math.min(targetSurvivor.armor, dmg * 0.5);
                            targetSurvivor.armor -= absorbed;
                            dmg -= absorbed;
                        }
                        targetSurvivor.health -= dmg;
                        z.attackCooldown = 1.2;
                        createBloodParticle(targetSurvivor.position);

                        if (targetSurvivor.health <= 0) {
                            targetSurvivor.health = 0;
                            addLogEvent(`¡${targetSurvivor.name} ha caído en combate!`);
                            if (typeof updateReinforceButton === 'function') updateReinforceButton();
                        }
                        updateUI();
                    }
                } else {
                    // Torre en el camino: la horda la golpea
                    const tw = nearestTower(z.position, 3.5, false);
                    if (tw && z.attackCooldown <= 0) {
                        tw.health -= z.damage * 0.8;
                        z.attackCooldown = 1.4;
                        z.isMoving = false;
                        aimTowards(z, tw.pos);
                        createMuzzleFlash(tw.pos, 0x92400e, 0.08);
                        if (tw.health <= 0) destroyTower(tw);
                        animateEntityLimbs(z, delta);
                        continue;
                    }
                    const nearestShelterKey = getNearestActiveShelterKey(z.position);
                    if (!nearestShelterKey) {
                        // Sin refugio: ahora si persigue supervivientes.
                        if (targetSurvivor) moveTowards(z, targetSurvivor.position, z.speed);
                        else { animateEntityLimbs(z, delta); continue; }
                    } else {
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
                }

                animateEntityLimbs(z, delta);
            }

            updateTurrets(delta);
        }

        function updateDyingZombie(z, delta) {
            z.deathTimer += delta * gameSpeed;
            // Fase 1: caida (0.45s)
            const t = Math.min(1, z.deathTimer / 0.45);
            z.mesh.rotation.x = t * (Math.PI / 2);
            z.mesh.position.y = -t * 0.15;
            // Fase 2: cuerpo tendido 5s. Fase 3: quemado leve ~1.2s y desaparece
            if (z.deathTimer > 5 && !z.burned) {
                z.burned = true;
                z.mesh.traverse(o => {
                    if (o.isMesh && o.material && o.material.emissive) {
                        o.material.emissive.setHex(0xcc3300);
                        o.material.emissiveIntensity = 0.7;
                    }
                });
            }
            if (z.burned && z.deathTimer < 6.2 && Math.random() < 0.35) {
                createFlamePuff(z.position);
            }
            if (z.deathTimer >= 6.2) {
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
            // Limpieza fortaleza: muros/puertas/torres del refugio caido + nivel.
            for (let i = walls.length - 1; i >= 0; i--) {
                if (walls[i].shelterKey === zoneKey) {
                    scene.remove(walls[i].mesh);
                    if (typeof unregisterColliderForRef === 'function') unregisterColliderForRef(walls[i]);
                    walls.splice(i, 1);
                }
            }
            if (typeof doors !== 'undefined') {
                for (let i = doors.length - 1; i >= 0; i--) {
                    if (doors[i].shelterKey === zoneKey) {
                        scene.remove(doors[i].mesh);
                        if (typeof unregisterColliderForRef === 'function') unregisterColliderForRef(doors[i]);
                        doors.splice(i, 1);
                    }
                }
            }
            for (let i = towers.length - 1; i >= 0; i--) {
                if (towers[i].zoneKey === zoneKey) {
                    scene.remove(towers[i].mesh);
                    if (typeof unregisterColliderForRef === 'function') unregisterColliderForRef(towers[i]);
                    towers.splice(i, 1);
                }
            }
            if (typeof shelterLevels !== 'undefined') delete shelterLevels[zoneKey];
            if (typeof customShelters !== 'undefined') delete customShelters[zoneKey];
            if (typeof groupTask !== 'undefined' && groupTask && groupTask.key === zoneKey) groupTask = null;
            addLogEvent(`Capacidad máxima ahora ${typeof getMaxSurvivors === 'function' ? getMaxSurvivors() : 5} supervivientes.`);

            addLogEvent(`¡EL REFUGIO EN ${zone.name.toUpperCase()} HA SIDO DESTRUIDO!`);
            if (zoneKey === mainShelterKey) {
                mainShelterKey = activeShelterKeys[0] || 'MALL';
                addLogEvent(`El refugio principal ahora es ${ZONES[mainShelterKey].name}.`);
            }

            if (activeShelterKeys.length === 0) {
                // Todos los refugios cayeron: reconstrucción de emergencia en el Mall
                const fallback = ZONES['MALL'];
                fallback.intact = true;
                fallback.isActiveShelter = true;
                fallback.health = 50;
                activeShelterKeys = ['MALL'];
                mainShelterKey = 'MALL'; // el principal vuelve a ser el Mall
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
