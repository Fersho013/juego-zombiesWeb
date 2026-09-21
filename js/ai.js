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

        // ==========================================================
        // DOCTRINA DE COMBATE POR ARMA
        // RIFLE (cadencia alta, medio): chicos/medianos primero, grandes despues.
        // SNIPER (alto DMG, baja cadencia): grandes a distancia, luego medianos, luego chicos.
        // Resto (escopeta en tierra, etc.): el mas cercano.
        // ==========================================================
        function nearestZombieOfClass(pos, range, classes, filter) {
            let best = null, bestD = range;
            zombies.forEach(z => {
                if (z.health <= 0 || z.dying || !classes.includes(z.typeKey)) return;
                if (filter && !filter(z)) return;
                const d = pos.distanceTo(z.position);
                if (d < bestD) { bestD = d; best = z; }
            });
            return best;
        }

        function nearLiveDummy(pos, range) {
            for (const d of dummies) {
                if (d.health > 0 && pos.distanceTo(d.position) < range) return true;
            }
            return false;
        }

        function pickCombatTarget(s, range) {
            const ALL = ['BASIC', 'MEDIUM', 'LARGE'];
            // 1) Proteger aliados acosados (zombie pegado a un compañero)
            let guard = nearestZombieOfClass(s.position, range, ALL, z => z.threatAlly);
            if (guard) return guard;
            // 2) Proteger estructuras (nunca dummies: esos se aprovechan, no se defienden)
            guard = nearestZombieOfClass(s.position, range, ALL, z => z.threatStruct);
            if (guard) return guard;
            // 3) Festin: zombies entretenidos con un dummie (tiro facil a distancia)
            guard = nearestZombieOfClass(s.position, range, ALL, z => nearLiveDummy(z.position, 6));
            if (guard) return guard;
            if (s.primary === 'SNIPER') {
                return nearestZombieOfClass(s.position, range, ['LARGE'])
                    || nearestZombieOfClass(s.position, range, ['MEDIUM'])
                    || nearestZombieOfClass(s.position, range, ['BASIC']);
            }
            if (s.primary === 'RIFLE') {
                return nearestZombieOfClass(s.position, range, ['BASIC', 'MEDIUM'])
                    || nearestZombieOfClass(s.position, range, ['LARGE']);
            }
            return nearestZombieOfClass(s.position, range, ['BASIC', 'MEDIUM', 'LARGE']);
        }

        // Rol de torre: hueco libre u obra en curso. Suelo-escopeta: torres llenas.
        function towerRoomFree() {
            return towers.some(t => t.complete && t.occupants.length < 2);
        }

        // Que cajas de arma busca cada uno segun su rol:
        // - aspirante a torre sin RIFLE/SNIPER -> RIFLE o SNIPER (alta cadencia/alcance arriba)
        // - resto en tierra con torres llenas -> SHOTGUN (5 perdigones de cerca)
        // - sin torres -> libre eleccion
        const CRATE_WEAPON_MAP = { RIFLE: 'RIFLE', SNIPER: 'SNIPER', SHOTGUN: 'SHOTGUN' };

        function desiredCrateWeapons(s) {
            const hasTowerGun = (s.primary === 'RIFLE' || s.primary === 'SNIPER');
            if (!hasTowerGun && (towerRoomFree() || findTowerSite())) return ['RIFLE', 'SNIPER'];
            if (!hasTowerGun && s.primary !== 'SHOTGUN' && towers.some(t => t.complete)) return ['SHOTGUN'];
            return null;
        }

        function updateSurvivorAI(delta) {
            // Marcas tacticas del paso (una vez por frame, no por superviviente):
            // que zombie acosa a un aliado o a una estructura (dummies excluidos).
            zombies.forEach(z => {
                z.threatAlly = false;
                z.threatStruct = false;
                if (z.health <= 0 || z.dying) return;
                for (const o of survivors) {
                    if (o.health > 0 && o.position.distanceTo(z.position) < 5) { z.threatAlly = true; break; }
                }
                for (const t of towers) {
                    if (t.pos.distanceTo(z.position) < 4.5) { z.threatStruct = true; break; }
                }
                if (!z.threatStruct) {
                    for (const b of barricades) {
                        if (b.health > 0 && b.position.distanceTo(z.position) < 4.5) { z.threatStruct = true; break; }
                    }
                }
                if (!z.threatStruct) {
                    for (const w of walls) {
                        if (w.health > 0 && w.position.distanceTo(z.position) < 4.5) { z.threatStruct = true; break; }
                    }
                }
                // Deposito amenazado: defensa total
                if (!z.threatStruct) {
                    for (const k of activeShelterKeys) {
                        const zz = ZONES[k];
                        if (zz.depot && zz.depot.health > 0 && zz.depot.position.distanceTo(z.position) < 5) { z.threatStruct = true; break; }
                    }
                }
            });

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

                const wconf = WEAPONS[s.primary] || WEAPONS.PISTOL;
                const effRange = wconf.range * (s.onTower ? 1.3 : 1); // bonus de altura
                // Blanco segun doctrina del arma (rifle/sniper priorizan por tamaño)
                const target = (s.aiState !== 'FLEE') ? pickCombatTarget(s, effRange) : null;
                if (target) {
                    const tDist = s.position.distanceTo(target.position);
                    aimTowards(s, target.position);
                    // Granada si hay grupo compacto (con deposito en peligro: todo el arsenal)
                    if (s.grenades > 0 && s.grenadeCooldown <= 0 && tDist < 16 && countNearbyZombies(target.position, 6) >= (depotUnderAttack() ? 2 : 3)) {
                        throwGrenade(s, target.position);
                        s.thoughtText = `¡Granada fuera! (${s.grenades} restantes)`;
                    } else if (s.shootCooldown <= 0 && s.ammo > 0) {
                        fireSurvivorWeapon(s, target);
                    }
                }
                s.combatTarget = target; // para kiteo/caza en la fase de movimiento
                s.combatRange = effRange;

                // PRIORIDAD 1 (global): curar aliados heridos con botiquin
                // (los francotiradores en torre no abandonan su puesto para curar)
                let healBusy = false;
                if (s.aiState !== 'FLEE' && !s.onTower) healBusy = updateSurvivorHeal(s, delta);
                if (healBusy) s.task = 'curar'; // individual prioritaria

                if (isWaveActive) {
                    const homeZone = ZONES[s.homeZoneKey] && ZONES[s.homeZoneKey].intact ? ZONES[s.homeZoneKey] : ZONES[activeShelterKeys[0] || 'MALL'];
                    const nearbyZ = countNearbyZombies(homeZone.pos, homeZone.radius + 14);
                    const garrisonAlive = Math.max(1, countAliveGarrison(s.homeZoneKey));

                    // Decisión de huida: en torre aguantan el puesto hasta el fin de la horda
                    if (!s.onTower && s.aiState !== 'FLEE' && nearbyZ >= 5 && nearbyZ > garrisonAlive * 2.6) {
                        s.aiState = 'FLEE';
                        const dest = pickFleeDestination(s.homeZoneKey);
                        s.fleeTarget = dest.pos;
                        s.fleeZoneKey = dest.zoneKey;
                        addLogEvent(`${s.name} se repliega: superado en número en ${homeZone.name}.`);
                    }

                    if (s.aiState === 'FLEE') {
                        if (s.onTower) dismountTower(s); // abandona la torre para huir
                        s.task = 'huir';
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
                    } else if (!healBusy) {
                        // Puesto de francotirador en torre si hay sitio libre
                        if (!updateTowerOccupy(s, homeZone)) {
                            s.aiState = 'DEFEND_BASE';
                            s.task = 'defender';
                            // En tierra y enzarzado: tactica de distancia antes que el puesto fijo
                            if (s.combatTarget && !s.onTower && updateCombatSpacing(s, s.combatTarget, homeZone)) {
                                s.task = 'kitear';
                            } else {
                                s.thoughtText = `Defendiendo ${homeZone.name}`;
                                const defPos = homeZone.pos.clone().add(new THREE.Vector3(Math.cos(s.id * 1.7) * homeZone.radius * 0.4, 0, Math.sin(s.id * 1.7) * homeZone.radius * 0.4));
                                if (s.position.distanceTo(defPos) > 2) {
                                    moveTowards(s, defPos, 0.12);
                                } else {
                                    s.isMoving = false;
                                }
                            }
                        } else {
                            s.aiState = 'DEFEND_BASE';
                            s.task = s.onTower ? 'vigilar' : 'defender';
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
                    } else if (depotUnderAttack() && !s.carriedCrate && !s.onTower) {
                        // ¡Al deposito, lo atacan! Todo el arsenal contra la amenaza
                        s.task = 'defender';
                        s.aiState = 'SCAVENGE';
                        const dz = ZONES[mainShelterKey];
                        const dp = dz && dz.depot ? dz.depot.position : homeZone.pos;
                        s.thoughtText = '¡Al deposito, lo atacan!';
                        const dd = s.position.distanceTo(dp);
                        if (s.combatTarget && updateCombatSpacing(s, s.combatTarget, homeZone)) {}
                        else if (dd > 7) moveTowards(s, dp, 0.14);
                        else s.isMoving = false;
                    } else if (s.carriedCrate) {
                        s.task = 'transportar';
                        s.thoughtText = `Transportando ${s.carriedCrate.config.name} a Base`;
                        const distToBase = s.position.distanceTo(homeZone.pos);

                        if (distToBase < 4) {
                            depositCrateAtBase(s);
                        } else if (s.combatTarget && s.position.distanceTo(s.combatTarget.position) < 10 && updateCombatSpacing(s, s.combatTarget, homeZone)) {
                            s.task = 'kitear'; // cautela: primero sobrevivir, la caja espera
                        } else {
                            moveTowards(s, homeZone.pos, 0.1);
                        }
                    } else {
                        if (!s.targetCrate || s.targetCrate.isPickedUp) {
                            s.targetCrate = findClosestAvailableCrate(s.position, s);
                        }

                        if (s.targetCrate) {
                            s.task = 'recolectar'; // individual
                            s.thoughtText = `Recolectando ${s.targetCrate.config.name}`;
                            const distToCrate = s.position.distanceTo(s.targetCrate.position);

                            if (distToCrate < 1.5) {
                                pickupCrate(s, s.targetCrate);
                            } else if (s.combatTarget && s.position.distanceTo(s.combatTarget.position) < 10 && updateCombatSpacing(s, s.combatTarget, homeZone)) {
                                s.task = 'kitear'; // cautela ante amenaza cercana
                            } else {
                                moveTowards(s, s.targetCrate.position, 0.11);
                            }
                        } else {
                            let handled = false;
                            // 1) Compromiso grupal vigente: continuar la obra sin abandonar
                            // (solo horda/cura/huida interrumpen, fuera de esta rama)
                            if (s.towerCommitted) {
                                if (updateTowerWork(s, delta, homeZone)) { s.task = 'torre'; handled = true; }
                                else s.towerCommitted = false;
                            } else if (s.foundCommitted) {
                                if (updateShelterFound(s, delta)) { s.task = 'fundar'; handled = true; }
                                else s.foundCommitted = false;
                            }
                            // 2) Rally: obra activa y sin recoleccion urgente -> todos se suman
                            if (!handled && groupTaskActive() && !anyFreeCrate(s)) {
                                if (shelterFounder && updateShelterFound(s, delta)) { s.task = 'fundar'; handled = true; }
                                else if (findTowerSite() && updateTowerWork(s, delta, homeZone)) { s.task = 'torre'; handled = true; }
                            }
                            // 3) Individuales y luego nuevas obras grupales
                            if (!handled) {
                                if (maybeCraftSupplyCrate(s)) {
                                    s.task = 'fabricar';
                                } else if (updateSurvivorBuild(s, delta, homeZone)) {
                                    s.task = 'barricada'; // individual (tramo del perimetro)
                                } else if (updateDummyTask(s, delta)) {
                                    s.task = 'dummie'; // individual (señuelo explosivo)
                                } else if (updateShelterRepair(s, delta)) {
                                    s.task = 'reparar'; // individual (mejorar refugio)
                                } else if (updateShelterFound(s, delta)) {
                                    s.task = 'fundar'; // grupal
                                } else if (updateTowerWork(s, delta, homeZone)) {
                                    s.task = 'torre'; // grupal
                                } else {
                                    // Agresividad con correa: cazar rezagados cerca del refugio
                                    const prey = nearestZombieOfClass(s.position, 45, ['BASIC', 'MEDIUM', 'LARGE']);
                                    if (prey && homeZone.pos.distanceTo(prey.position) < homeZone.radius + 30) {
                                        s.task = 'cazar';
                                        s.thoughtText = 'Cazando rezagados...';
                                        moveTowards(s, prey.position, 0.11);
                                    } else {
                                        s.task = 'patrullar';
                                        s.thoughtText = "Patrullando perímetro...";
                                        const patrolPos = homeZone.pos.clone().add(new THREE.Vector3(Math.cos(s.id + clock.getElapsedTime() * 0.5) * 10, 0, Math.sin(s.id + clock.getElapsedTime() * 0.5) * 10));
                                        moveTowards(s, patrolPos, 0.08);
                                    }
                                }
                            }
                        }
                    }
                }

                if (typeof syncHandTool === 'function') syncHandTool(s); // mazo <=> arma
                if (typeof syncBackpack === 'function') syncBackpack(s); // mochila solo con caja
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

        // Espaciado tactico (cautela + agresividad): kitear al que se acerca,
        // acosar al lejano hasta distancia optima, y apartarse del dummie
        // a punto de estallar. homeZone = correa de equipo (+30). True si se movio.
        function updateCombatSpacing(s, target, homeZone) {
            if (!target || target.health <= 0 || target.dying) return false;
            const leash = homeZone ? homeZone.radius + 30 : 9999;
            const refuge = homeZone ? homeZone.pos : null;
            // 1) Prudencia anti-explosion: dummie caliente cerca
            const hot = nearestDummy(s.position, 12);
            if (hot && hot.health < hot.maxHealth * 0.4) {
                const away = s.position.clone().sub(hot.position); away.y = 0;
                if (away.lengthSq() > 0.01) {
                    away.normalize();
                    const np = s.position.clone().addScaledVector(away, 0.13 * gameSpeed);
                    if (!refuge || np.distanceTo(refuge) < leash) {
                        s.position.copy(np);
                        s.isMoving = true;
                        aimTowards(s, target.position);
                        s.thoughtText = '¡Apartandose del dummie!';
                        return true;
                    }
                }
            }
            // 2) Kiteo y acoso segun alcance del arma
            const w = WEAPONS[s.primary] || WEAPONS.PISTOL;
            const range = w.range * (s.onTower ? 1.3 : 1);
            const d = s.position.distanceTo(target.position);
            if (d < range * 0.45) {
                const away = s.position.clone().sub(target.position); away.y = 0;
                if (away.lengthSq() < 0.01) away.set(1, 0, 0);
                away.normalize();
                const np = s.position.clone().addScaledVector(away, 0.13 * gameSpeed);
                if (!refuge || np.distanceTo(refuge) < leash) {
                    s.position.copy(np);
                    s.isMoving = true;
                    aimTowards(s, target.position);
                    s.thoughtText = 'Kiteando al zombie...';
                    return true;
                }
            } else if (d > range * 0.85 && d < range + 14) {
                if (!refuge || target.position.distanceTo(refuge) < leash || s.position.distanceTo(refuge) < leash) {
                    moveTowards(s, target.position, 0.12);
                    s.thoughtText = 'Acosando al zombie...';
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

        // Anima balanceo y FLEXION DE CODOS: al caminar braceo con codo
        // semiflexionado; al martillar, hombro arriba y codo flexionando el golpe.
        function animateEntityLimbs(entity, delta) {
            if (!entity.limbs) return;
            const l = entity.limbs;
            const elbowL = l.armL.userData ? l.armL.userData.elbow : null;
            const elbowR = l.armR.userData ? l.armR.userData.elbow : null;
            if (entity.hammering && entity.health > 0) {
                entity.animPhase += delta * 11 * Math.max(0.5, gameSpeed);
                const hammer = Math.sin(entity.animPhase);
                l.armR.rotation.x = -1.3 + hammer * 0.85; // mazo arriba-adelante
                if (elbowR) elbowR.rotation.x = -1.0 + Math.cos(entity.animPhase) * 0.45; // flexion de codo
                l.armL.rotation.x *= 0.8;
                if (elbowL) elbowL.rotation.x += (-0.3 - elbowL.rotation.x) * Math.min(1, delta * 8);
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
                if (elbowL) elbowL.rotation.x = -0.35 + swing * 0.3;
                if (elbowR) elbowR.rotation.x = -0.35 - swing * 0.3;
            } else {
                l.legL.rotation.x *= 0.8;
                l.legR.rotation.x *= 0.8;
                l.armL.rotation.x *= 0.8;
                l.armR.rotation.x *= 0.8;
                if (elbowL) elbowL.rotation.x += (-0.25 - elbowL.rotation.x) * Math.min(1, delta * 8);
                if (elbowR) elbowR.rotation.x += (-0.25 - elbowR.rotation.x) * Math.min(1, delta * 8);
            }
        }

        // Caja libre = no recogida Y no reservada por otro vivo.
        // Asi cada superviviente va por una caja distinta y no pierden tiempo.
        function isCrateReserved(c, self) {
            for (const o of survivors) {
                if (o === self || o.health <= 0) continue;
                if (o.targetCrate === c || o.carriedCrate === c) return true;
            }
            return false;
        }

        function findClosestAvailableCrate(pos, self) {
            let closest = null;
            let minDist = 999;
            const want = desiredCrateWeapons(self);
            // 1) Preferencia de rol (arma de torre o escopeta de tierra)
            if (want) {
                crates.forEach(c => {
                    if (c.isPickedUp || isCrateReserved(c, self)) return;
                    if (!want.includes(CRATE_WEAPON_MAP[c.typeKey])) return;
                    const d = pos.distanceTo(c.position);
                    if (d < minDist) { minDist = d; closest = c; }
                });
                if (closest) return closest;
            }
            // 2) La libre mas cercana (o rol sin preferencia)
            crates.forEach(c => {
                if (c.isPickedUp || isCrateReserved(c, self)) return;
                const d = pos.distanceTo(c.position);
                if (d < minDist) { minDist = d; closest = c; }
            });
            return closest;
        }

        // ==========================================================
        // ARBITRO DE TAREAS
        // Individuales: recolectar, barricada/perimetro, reparar.
        // Grupales (rally de todos, sin abandonar): fundar refugio, construir torre.
        // Regla: la recoleccion urgente va primero al UNIRSE a una obra;
        // comprometido a obra grupal no la abandona (solo horda/cura/huida).
        // ==========================================================
        function anyFreeCrate(self) {
            for (const c of crates) {
                if (!c.isPickedUp && !isCrateReserved(c, self)) return true;
            }
            return false;
        }

        function groupTaskActive() {
            return !!(findTowerSite() || shelterFounder);
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
            else if (crateType === 'MATERIAL') { baseResources.debris = Math.min(DEPOT_DEBRIS_CAP, (baseResources.debris || 0) + 60); baseResources.ammo += 1; }
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
            if (typeof refreshDepotStockVisual === 'function') refreshDepotStockVisual(survivor.homeZoneKey);
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

        // ==========================================================
        // PERIMETRO COMPARTIDO: cuadrado de barricadas alrededor del refugio.
        // Los 5 colaboran por tramos: si uno empezo un tramo, otro lo continua
        // (progreso compartido por tramo; varios martillando aceleran).
        // ==========================================================
        const PERIMETER_SPOTS_PER_SIDE = 4;
        const PERIMETER_BUILD_TIME = 3;

        function getPerimeter(zoneKey) {
            const zone = ZONES[zoneKey];
            if (!zone || !zone.isActiveShelter) return null;
            let P = shelterPerimeters[zoneKey];
            if (!P) {
                const half = Math.max(10, zone.radius * 0.55);
                P = { zoneKey: zoneKey, half: half, sides: [] };
                for (let side = 0; side < 4; side++) {
                    const spots = [];
                    for (let i = 0; i < PERIMETER_SPOTS_PER_SIDE; i++) {
                        const f = (i + 0.5) / PERIMETER_SPOTS_PER_SIDE - 0.5;
                        let px, pz, ry;
                        if (side === 0) { px = zone.pos.x + f * half * 2; pz = zone.pos.z - half; ry = 0; }
                        else if (side === 1) { px = zone.pos.x + half; pz = zone.pos.z + f * half * 2; ry = Math.PI / 2; }
                        else if (side === 2) { px = zone.pos.x - f * half * 2; pz = zone.pos.z + half; ry = 0; }
                        else { px = zone.pos.x - half; pz = zone.pos.z - f * half * 2; ry = Math.PI / 2; }
                        spots.push({ pos: new THREE.Vector3(px, 0, pz), ry: ry, progress: 0, built: false });
                    }
                    P.sides.push({ spots: spots });
                }
                shelterPerimeters[zoneKey] = P;
            }
            return P;
        }

        function resolveBuildSpot(ref) {
            if (!ref) return null;
            const P = shelterPerimeters[ref.key];
            if (!P || !P.sides[ref.side]) return null;
            const spot = P.sides[ref.side].spots[ref.idx];
            return (spot && !spot.built) ? spot : null;
        }

        // Tramo libre: primero continuar los empezados, luego el mas cercano
        function findPerimeterSpot(key, pos) {
            const P = getPerimeter(key);
            if (!P) return null;
            let best = null, bestScore = Infinity;
            P.sides.forEach((sideObj, side) => {
                sideObj.spots.forEach((spot, idx) => {
                    if (spot.built) return;
                    const d = pos.distanceTo(spot.pos);
                    const score = (spot.progress > 0 ? 0 : 1000) + d;
                    if (score < bestScore) { bestScore = score; best = { key: key, side: side, idx: idx }; }
                });
            });
            return best;
        }

        function perimeterHasFreeSpot(key) {
            const P = getPerimeter(key);
            if (!P) return false;
            for (const sideObj of P.sides) for (const spot of sideObj.spots) if (!spot.built) return true;
            return false;
        }

        function updateSurvivorBuild(s, delta, homeZone) {
            if (isWaveActive) return false;
            const key = s.homeZoneKey;
            const zone = ZONES[key];
            if (!zone || !zone.isActiveShelter) return false;
            let spot = resolveBuildSpot(s.buildSpot);
            if (!spot) {
                if ((baseResources.debris || 0) < PERIMETER_DEBRIS_COST) return false; // tramo del deposito comun
                if (s.role !== 'Ingeniero' && Math.random() > 0.004 * gameSpeed) return false;
                s.buildSpot = findPerimeterSpot(key, s.position);
                if (!s.buildSpot) return false; // perimetro completo
                baseResources.debris -= PERIMETER_DEBRIS_COST; // el tramo se paga del deposito
                spot = resolveBuildSpot(s.buildSpot);
                s.thoughtText = 'Buscando tramo del perimetro...';
            }
            const d = s.position.distanceTo(spot.pos);
            if (d > 2) {
                s.thoughtText = spot.progress > 0 ? 'Continuando el tramo del compañero...' : 'Llevando materiales al perimetro...';
                moveTowards(s, spot.pos, 0.11);
                return true;
            }
            // Martillando el tramo (progreso compartido: varios aceleran)
            s.isMoving = false;
            s.hammering = true;
            aimTowards(s, zone.pos);
            spot.progress += delta * gameSpeed;
            s.thoughtText = `Levantando perimetro ${Math.min(99, Math.round(spot.progress / PERIMETER_BUILD_TIME * 100))}%`;
            if (spot.progress >= PERIMETER_BUILD_TIME && !spot.built) {
                spot.built = true;
                const rec = createSurvivorBarricade(spot.pos.x, spot.pos.z, false);
                rec.mesh.rotation.y = spot.ry;
                rec.owner = null; // tramo del perimetro comun
                s.buildSpot = null;
                addLogEvent(`${s.name} levanto un tramo del perimetro en ${zone.name}.`);
                updateUI();
            }
            return true;
        }

        // ==========================================================
        // DUMMIE BOMBA (tarea individual): 20 escombro + 1 granada, 200 HP, explota
        // ==========================================================
        // Trampa: el dummie se planta en la ruta de ataque (hacia la horda),
        // para que los zombies se entretengan y el equipo los fusile.
        function pickDummySpot(homeZone) {
            const c = new THREE.Vector3();
            let n = 0;
            zombies.forEach(z => { if (z.health > 0 && !z.dying) { c.add(z.position); n++; } });
            let ang;
            if (n > 0) {
                c.divideScalar(n);
                ang = Math.atan2(c.x - homeZone.pos.x, c.z - homeZone.pos.z);
            } else {
                ang = Math.random() * Math.PI * 2;
            }
            const r = homeZone.radius + 10;
            return new THREE.Vector3(homeZone.pos.x + Math.sin(ang) * r, 0, homeZone.pos.z + Math.cos(ang) * r);
        }

        function updateDummyTask(s, delta) {
            if (isWaveActive) return false;
            if (dummies.length >= DUMMY_CAP) return false;
            if ((baseResources.debris || 0) < DUMMY_DEBRIS_COST || (s.grenades || 0) < 1) return false;
            const homeZone = ZONES[s.homeZoneKey];
            if (!homeZone || !homeZone.isActiveShelter) return false;
            if (!s.dummySite) {
                s.dummySite = pickDummySpot(homeZone);
                s.dummyProgress = 0;
                baseResources.debris -= DUMMY_DEBRIS_COST; // del deposito comun
                s.grenades -= 1;
                s.heavy = `Granadas (${s.grenades})`;
                s.thoughtText = 'Llevando el dummie bomba...';
                addLogEvent(`${s.name} prepara un dummie bomba (-${DUMMY_DEBRIS_COST} escombro, -1 granada).`);
                updateUI();
            }
            const d = s.position.distanceTo(s.dummySite);
            if (d > 2) {
                moveTowards(s, s.dummySite, 0.11);
                return true;
            }
            s.isMoving = false;
            s.hammering = true;
            aimTowards(s, s.dummySite);
            s.dummyProgress += delta * gameSpeed;
            s.thoughtText = `Armando dummie ${Math.min(99, Math.round(s.dummyProgress / DUMMY_BUILD_TIME * 100))}%`;
            if (s.dummyProgress >= DUMMY_BUILD_TIME) {
                spawnDummy(s.dummySite.x, s.dummySite.z);
                s.dummySite = null;
                s.dummyProgress = 0;
            }
            return true;
        }

        // Deposito bajo ataque (ultimos 5s reales): defensa desesperada total
        function depotUnderAttack() {
            const dz = ZONES[mainShelterKey];
            const dep = dz && dz.depot;
            return !!(dep && dep.health > 0 && Date.now() - (dep.lastHit || 0) < 5000);
        }

        function nearestDepotKey(pos) {
            let best = null, bestD = Infinity;
            activeShelterKeys.forEach(k => {
                const zz = ZONES[k];
                if (!zz.depot || zz.depot.health <= 0) return;
                const d = pos.distanceTo(zz.depot.position);
                if (d < bestD) { bestD = d; best = k; }
            });
            return best;
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
            // Doctrina de torre: solo suben fusil de asalto y francotirador.
            // El resto queda en tierra (escopeta de cerca). Sin ese arma, a buscarla.
            if (s.primary !== 'RIFLE' && s.primary !== 'SNIPER') return false;
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

        // Fuera de oleada y sin nada que hacer: aportar 1s por segundo a la obra.
        // Las torres son obra del refugio PRINCIPAL.
        function updateTowerWork(s, delta, homeZone) {
            if (isWaveActive) return false;
            const mainZone = (ZONES[mainShelterKey] && ZONES[mainShelterKey].isActiveShelter) ? ZONES[mainShelterKey] : homeZone;
            const mainKey = mainZone.key;
            if (countCompleteTowers() + (findTowerSite() ? 1 : 0) >= TOWER_MAX && !findTowerSite()) return false;
            let site = towers.find(t => !t.complete && t.id === s.towerSiteId) || findTowerSite();
            if (!site) {
                if (s.towerCommitted) { s.towerCommitted = false; return false; } // la obra ya no existe
                if (anyFreeCrate(s)) return false; // recoleccion urgente primero al abrir tajo
                if (countCompleteTowers() >= TOWER_MAX) return false;
                // Fundar obra junto al refugio principal (15 escombro del deposito)
                if ((baseResources.debris || 0) < TOWER_DEBRIS_COST) return false;
                const ang = Math.random() * Math.PI * 2;
                const r = mainZone.radius + 10;
                site = createTowerSite(mainKey, mainZone.pos.x + Math.cos(ang) * r, mainZone.pos.z + Math.sin(ang) * r);
                baseResources.debris -= TOWER_DEBRIS_COST;
            } else {
                // Nuevo en la obra: recoleccion urgente primero; comprometido: no abandona
                if (!s.towerCommitted && anyFreeCrate(s)) return false;
            }
            s.towerCommitted = true;
            s.towerSiteId = site.id;
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
                survivors.forEach(o => { if (o.towerSiteId === site.id) { o.towerSiteId = null; o.towerCommitted = false; } });
            }
            return true;
        }

        // ==========================================================
        // FUNDAR NUEVOS REFUGIOS (casa de 4 muros con puertas/ventanas)
        // ==========================================================
        function mostDamagedShelter() {
            let best = null;
            activeShelterKeys.forEach(k => {
                const z = ZONES[k];
                let score = (100 - z.health) / 100;
                const totalWalls = walls.filter(w => w.shelterKey === k).length;
                if (totalWalls > 0) {
                    score += (totalWalls - shelterWallCount(k)) / totalWalls;
                    walls.forEach(w => {
                        if (w.shelterKey === k) score += (w.maxHealth - Math.max(0, w.health)) / w.maxHealth * 0.25;
                    });
                }
                if (score > 0.02 && (!best || score > best.score)) best = { key: k, zone: z, score: score };
            });
            return best;
        }

        // Tras la oleada: reconstruir salud y muros con barra "Reconstruyendo"
        function updateShelterRepair(s, delta) {
            if (isWaveActive) return false;
            const target = mostDamagedShelter();
            if (!target) return false;
            const d = s.position.distanceTo(target.zone.pos);
            if (d > target.zone.radius * 0.7) {
                s.thoughtText = `Yendo a reconstruir ${target.zone.name}...`;
                moveTowards(s, target.zone.pos, 0.11);
                return true;
            }
            s.isMoving = false;
            s.hammering = true;
            aimTowards(s, target.zone.pos);
            // Reparar: deposito a 150/s, refugio clasico a 4/s
            if (target.zone.depot && target.zone.depot.health > 0) {
                const dep = target.zone.depot;
                dep.health = Math.min(dep.maxHealth, dep.health + 150 * delta * gameSpeed);
                target.zone.health = Math.max(0, dep.health / dep.maxHealth * 100);
            } else if (target.zone.health < 100) {
                target.zone.health = Math.min(100, target.zone.health + 4 * delta * gameSpeed);
            }
            // Reparar muros dañados y re-levantar caidos (6s por muro, solo si la casa existe)
            const existingWalls = walls.filter(w => w.shelterKey === target.key).length;
            const deadSides = existingWalls > 0 ? 4 - existingWalls : 0;
            let repaired = false;
            walls.forEach(w => {
                if (w.shelterKey === target.key && w.health < w.maxHealth) {
                    w.health = Math.min(w.maxHealth, w.health + 10 * delta * gameSpeed);
                    repaired = true;
                }
            });
            if (!repaired && deadSides > 0) {
                s.repairWallTimer = (s.repairWallTimer || 0) + delta * gameSpeed;
                if (s.repairWallTimer >= 6) {
                    s.repairWallTimer = 0;
                    rebuildShelterWall(target.key);
                    addLogEvent(`${s.name} re-levanto un muro en ${target.zone.name}.`);
                }
            }
            const pct = shelterRepairPct(target.key);
            s.thoughtText = `Reconstruyendo ${target.zone.name} ${pct}%`;
            s.repairKey = target.key;
            return true;
        }

        function shelterRepairPct(key) {
            const z = ZONES[key];
            const total = walls.filter(w => w.shelterKey === key);
            let sum = z.health;
            let max = 100;
            total.forEach(w => { sum += Math.max(0, w.health); max += w.maxHealth; });
            // Muros faltantes cuentan como 0 (solo en casas fundadas)
            if (total.length > 0) max += (4 - total.length) * WALL_HP;
            return Math.round(sum / Math.max(1, max) * 100);
        }

        function rebuildShelterWall(zoneKey) {
            const zone = ZONES[zoneKey];
            const H = 7;
            const existing = walls.filter(w => w.shelterKey === zoneKey).length;
            // Re-crea el lado faltante rotando segun cuantos haya
            const sideIdx = existing % 4;
            const ang = sideIdx * Math.PI / 2;
            const wx = zone.pos.x + Math.cos(ang) * H;
            const wz = zone.pos.z + Math.sin(ang) * H;
            const wall = new THREE.Mesh(new THREE.BoxGeometry(12, 2.6, 0.5),
                new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.8 }));
            wall.position.set(wx, 1.3, wz);
            wall.rotation.y = (sideIdx % 2 === 0) ? 0 : Math.PI / 2;
            wall.castShadow = true;
            scene.add(wall);
            walls.push({ mesh: wall, health: WALL_HP * 0.5, maxHealth: WALL_HP, position: wall.position, shelterKey: zoneKey });
            updateUI();
        }

        // Fundar refugio en la zona libre que mejor venga (recursos + obra 120s)
        function updateShelterFound(s, delta) {
            if (isWaveActive) return false;
            if (!shelterFounder && anyFreeCrate(s)) return false; // cajas primero al abrir tajo
            if (shelterFounder && !s.foundCommitted && anyFreeCrate(s)) return false; // nuevo: cajas primero
            const aliveCount = survivors.filter(o => o.health > 0).length;
            if (aliveCount < 3 || activeShelterKeys.length >= 4) return false;
            if (!shelterFounder) {
                if ((baseResources.debris || 0) < SHELTER_DEBRIS_COST) return false; // fundar cuesta escombro comun
                if (s.role !== 'Ingeniero' && s.role !== 'Líder' && Math.random() > 0.002 * gameSpeed) return false;
                const candidateKey = Object.keys(ZONES).find(k => !ZONES[k].isActiveShelter && ZONES[k].intact);
                if (!candidateKey) return false;
                baseResources.debris -= SHELTER_DEBRIS_COST;
                shelterFounder = { zoneKey: candidateKey, progress: 0, required: SHELTER_FOUND_WORK };
                showAirBanner(`Nuevo refugio en construccion: ${ZONES[candidateKey].name}`, 'fa-solid fa-house-chimney text-amber-300 text-lg');
                addLogEvent(`${s.name} inicio la fundacion de un refugio en ${ZONES[candidateKey].name}.`);
                updateUI();
            }
            const zone = ZONES[shelterFounder.zoneKey];
            s.foundCommitted = true; // comprometido: no abandona la fundacion
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
                survivors.forEach(o => o.foundCommitted = false);
                activateShelter(key, false);
                createShelterHouse(key);
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

        // Colision fisica: los zombies no atraviesan torres, barricadas,
        // muros, dummies ni el nucleo del refugio (los supervivientes si pasan)
        function buildZombieColliders() {
            const cols = [];
            towers.forEach(t => cols.push({ x: t.pos.x, z: t.pos.z, r: 2.6 }));
            barricades.forEach(b => { if (b.health > 0) cols.push({ x: b.position.x, z: b.position.z, r: 1.5 }); });
            walls.forEach(w => {
                if (w.health <= 0) return;
                const ry = (w.mesh && w.mesh.rotation) ? w.mesh.rotation.y : 0;
                const dx = Math.cos(ry), dz = -Math.sin(ry); // eje largo del muro
                [-4, 0, 4].forEach(off => cols.push({ x: w.position.x + dx * off, z: w.position.z + dz * off, r: 2.0 }));
            });
            dummies.forEach(d => { if (d.health > 0) cols.push({ x: d.position.x, z: d.position.z, r: 0.9 }); });
            activeShelterKeys.forEach(k => {
                const zz = ZONES[k];
                cols.push({ x: zz.pos.x, z: zz.pos.z, r: 4 });
                if (zz.depot && zz.depot.health > 0) cols.push({ x: zz.depot.position.x, z: zz.depot.position.z, r: 3 });
            });
            return cols;
        }

        function resolveZombieCollisions() {
            const cols = buildZombieColliders();
            if (!cols.length) return;
            zombies.forEach(z => {
                if (z.health <= 0 || z.dying) return;
                for (const c of cols) {
                    const dx = z.position.x - c.x, dz = z.position.z - c.z;
                    const min = c.r + 0.5;
                    if (Math.abs(dx) >= min || Math.abs(dz) >= min) continue; // rechazo rapido
                    const d = Math.hypot(dx, dz);
                    if (d < min && d > 0.001) {
                        const push = min - d;
                        z.position.x += dx / d * push;
                        z.position.z += dz / d * push;
                    }
                }
            });
        }

        function updateZombieAI(delta) {
            for (let i = zombies.length - 1; i >= 0; i--) {
                const z = zombies[i];
                if (z.dying) { updateDyingZombie(z, delta); continue; }
                if (z.health <= 0) continue;

                z.attackCooldown = Math.max(0, z.attackCooldown - delta);

                // P1 DUMMIE BOMBA: el señuelo favorito, lo huelen a distancia
                const dum = nearestDummy(z.position, 25);
                if (dum) {
                    moveTowards(z, dum.position, z.speed);
                    const ddx = z.position.x - dum.position.x, ddz = z.position.z - dum.position.z;
                    if (Math.hypot(ddx, ddz) < 2.0 && z.attackCooldown <= 0) {
                        dum.health -= z.damage;
                        z.attackCooldown = 1.2;
                        aimTowards(z, dum.position);
                        createMuzzleFlash(dum.position, 0x92400e, 0.08);
                        if (dum.health <= 0) detonateDummy(dum);
                    }
                    animateEntityLimbs(z, delta);
                    continue;
                }

                // P2 BARRICADAS Y MUROS en el camino (los mastican al pasar)
                const block = nearestBarricade(z.position, 10) || nearestWall(z.position, 10);
                if (block) {
                    moveTowards(z, block.position, z.speed);
                    const bdx = z.position.x - block.position.x, bdz = z.position.z - block.position.z;
                    if (Math.hypot(bdx, bdz) < 2.6 && z.attackCooldown <= 0) {
                        block.health -= z.damage * 0.6;
                        z.attackCooldown = 1.2;
                        aimTowards(z, block.position);
                        createMuzzleFlash(block.position, 0x92400e, 0.08);
                        if (block.health <= 0) {
                            if (block.shelterKey) destroyWall(block);
                            else {
                                scene.remove(block.mesh);
                                const bi = barricades.indexOf(block);
                                if (bi > -1) barricades.splice(bi, 1);
                                addLogEvent('Una barricada ha sido destruida por la horda.');
                            }
                        }
                    }
                    animateEntityLimbs(z, delta);
                    continue;
                }

                let targetSurvivor = null;
                let minDist = 999;

                survivors.forEach(s => {
                    if (s.health > 0 && !s.onTower) { // en torre estan fuera de alcance
                        const d = z.position.distanceTo(s.position);
                        if (d < minDist) { minDist = d; targetSurvivor = s; }
                    }
                });

                // P3 TORRES: asedio a distancia cuando no hay señuelo ni obstaculo
                const siegeTower = nearestTower(z.position, 30, false);
                if (siegeTower) {
                    moveTowards(z, siegeTower.pos, z.speed);
                    const hdx = z.position.x - siegeTower.pos.x, hdz = z.position.z - siegeTower.pos.z;
                    if (Math.hypot(hdx, hdz) < 4.0 && z.attackCooldown <= 0) {
                        siegeTower.health -= z.damage * 0.8;
                        z.attackCooldown = 1.4;
                        aimTowards(z, siegeTower.pos);
                        createMuzzleFlash(siegeTower.pos, 0x92400e, 0.08);
                        if (siegeTower.health <= 0) destroyTower(siegeTower);
                    }
                    animateEntityLimbs(z, delta);
                    continue;
                }

                // P4 DEPOSITO (reemplaza al refugio: misma funcion): demolerlo de cerca
                const nearestShelterKey = getNearestActiveShelterKey(z.position);
                const targetZone = nearestShelterKey ? ZONES[nearestShelterKey] : null;
                const depKey = nearestDepotKey(z.position);
                const depZone = depKey ? ZONES[depKey] : null;
                const dep = depZone ? depZone.depot : null;
                const distToDep = dep ? z.position.distanceTo(dep.position) : Infinity;
                if (dep && distToDep < 7) {
                    moveTowards(z, dep.position, z.speed);
                    if (z.attackCooldown <= 0) {
                        damageDepot(depKey, z.damage);
                        z.attackCooldown = 1.2;
                    }
                    animateEntityLimbs(z, delta);
                    continue;
                }

                // P5 SUPERVIVIENTES (si acabo con todo, van por ellos)
                if (targetSurvivor && minDist < 15) {
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
                        }
                        updateUI();
                    }
                } else if (targetZone) {
                    // P6 Marcha: al deposito si hay, si no al centro (drenaje clasico solo sin deposito)
                    const marchDep = targetZone.depot && targetZone.depot.health > 0 ? targetZone.depot : null;
                    const marchPos = marchDep ? marchDep.position : targetZone.pos;
                    moveTowards(z, marchPos, z.speed);
                    if (!marchDep && z.position.distanceTo(targetZone.pos) < targetZone.radius && z.attackCooldown <= 0) {
                        targetZone.health = Math.max(0, targetZone.health - 1.5);
                        z.attackCooldown = 1.5;
                        if (targetZone.health <= 0) overrunShelter(nearestShelterKey);
                        updateUI();
                    }
                } else {
                    animateEntityLimbs(z, delta);
                    continue;
                }

                animateEntityLimbs(z, delta);
            }

            resolveZombieCollisions();
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
            delete shelterPerimeters[zoneKey]; // el perimetro cae con el refugio
            survivors.forEach(s => { if (s.buildSpot && s.buildSpot.key === zoneKey) s.buildSpot = null; });
            if (zone.depot) { // resto del deposito si quedo en pie
                scene.remove(zone.depot.mesh);
                zone.depot.stockMeshes.forEach(m => scene.remove(m));
                zone.depot = null;
            }

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
                if (!fallback.depot) createDepot('MALL'); // nuevo deposito de emergencia
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
