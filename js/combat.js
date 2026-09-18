/**
 * combat.js - Combate: proyectiles, oleadas, intervenciones del
   espectador y particulas.
 * Parte del proyecto Survivors VS Zombies 3D.
 * Variables globales definidas en js/config.js.
 */

// COMBATE: PROYECTILES CON TRAYECTORIA FLUIDA
        // ==========================================================
        function fireSurvivorWeapon(survivor, targetZombie) {
            survivor.ammo--;
            survivor.shootCooldown = 0.22;

            const dmg = 25 + Math.floor(Math.random() * 15);

            playSound('gun');
            createMuzzleFlash(survivor.position);
            spawnProjectile(survivor.position.clone().add(new THREE.Vector3(0, 1.1, 0)), targetZombie, dmg, 62, 0xfde68a);
        }

        function spawnProjectile(originPos, targetEntity, damage, speed, color) {
            const geo = new THREE.SphereGeometry(0.09, 6, 6);
            const mat = new THREE.MeshBasicMaterial({ color: color });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(originPos);
            scene.add(mesh);

            projectiles.push({ mesh, targetEntity, damage, speed, color });
        }

        function updateProjectiles(delta) {
            for (let i = projectiles.length - 1; i >= 0; i--) {
                const p = projectiles[i];
                if (!p.targetEntity || p.targetEntity.health <= 0 || p.targetEntity.dying) {
                    scene.remove(p.mesh);
                    projectiles.splice(i, 1);
                    continue;
                }

                const targetPos = p.targetEntity.position.clone().add(new THREE.Vector3(0, 1, 0));
                const toTarget = new THREE.Vector3().subVectors(targetPos, p.mesh.position);
                const dist = toTarget.length();
                const step = p.speed * delta * Math.max(0.001, gameSpeed);

                if (dist <= step) {
                    applyProjectileImpact(p);
                    scene.remove(p.mesh);
                    projectiles.splice(i, 1);
                } else {
                    toTarget.normalize();
                    p.mesh.position.addScaledVector(toTarget, step);
                }
            }
        }

        function applyProjectileImpact(p) {
            const targetZombie = p.targetEntity;
            targetZombie.health -= p.damage;
            createMuzzleFlash(targetZombie.position, 0xffffff, 0.15);

            if (targetZombie.health <= 0 && !targetZombie.dying) {
                targetZombie.health = 0;
                targetZombie.dying = true;
                targetZombie.deathTimer = 0;
                dyingZombies.push(targetZombie);

                zombiesAliveCount = Math.max(0, zombiesAliveCount - 1);

                // Otorgar la baja al superviviente más cercano vivo (aprox. quien disparó)
                let closestSurvivor = null, minD = 6;
                survivors.forEach(s => {
                    if (s.health > 0) {
                        const d = s.position.distanceTo(targetZombie.position);
                        if (d < minD) { minD = d; closestSurvivor = s; }
                    }
                });
                if (closestSurvivor) closestSurvivor.kills++;

                if (zombiesAliveCount === 0 && isWaveActive) {
                    endWaveSuccess();
                }
            }

            updateUI();
        }

        // ==========================================================
        // INTERVENCIONES DEL ESPECTADOR
        // ==========================================================
        function createDebrisBarricades(centerPos) {
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const bx = centerPos.x + Math.cos(angle) * 8;
                const bz = centerPos.z + Math.sin(angle) * 8;

                const barGeo = new THREE.BoxGeometry(3, 1.2, 0.8);
                const barMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
                const bar = new THREE.Mesh(barGeo, barMat);
                bar.position.set(bx, 0.6, bz);
                bar.rotation.y = angle;
                bar.castShadow = true;
                scene.add(bar);
                barricades.push(bar);
            }
        }

        function startWaveTimer() {
            if (waveTimerInterval) clearInterval(waveTimerInterval);
            waveTimer = 180;

            waveTimerInterval = setInterval(() => {
                if (gameSpeed === 0) return;

                if (!isWaveActive) {
                    waveTimer -= gameSpeed;
                    if (waveTimer <= 0) {
                        triggerZombieWave();
                    }
                    updateUI();
                }
            }, 1000);
        }

        function forceStartWave() {
            if (!isWaveActive) {
                waveTimer = 0;
                triggerZombieWave();
            }
        }

        function triggerZombieWave() {
            isWaveActive = true;
            spawnZombieHorde(currentWave);

            const badge = document.getElementById('phase-badge');
            badge.className = 'flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-xl border bg-rose-500/20 text-rose-300 border-rose-500/40 pulse-alert';
            document.getElementById('phase-icon').className = 'fa-solid fa-biohazard text-rose-400';
            document.getElementById('phase-text').innerText = `¡COMBATE OLEADA ${currentWave}!`;
        }

        function endWaveSuccess() {
            isWaveActive = false;
            addLogEvent(`¡OLEADA ${currentWave} SUPERADA! Reponiendo suministros...`);
            currentWave++;
            spawnInitialCrates();
            waveTimer = 180;

            // Reparación parcial de todos los refugios activos tras la oleada
            activeShelterKeys.forEach(k => {
                ZONES[k].health = Math.min(100, ZONES[k].health + 18);
            });

            // Reasignar a la defensa (por si quedaron en huida) a los supervivientes vivos
            survivors.forEach(s => {
                if (s.health > 0 && s.aiState === 'FLEE') {
                    s.aiState = 'DEFEND_BASE';
                }
            });

            const badge = document.getElementById('phase-badge');
            badge.className = 'flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-xl border bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
            document.getElementById('phase-icon').className = 'fa-solid fa-clock text-cyan-400';

            renderSheltersPanel();
            updateUI();
        }

        function triggerIntervention(type) {
            initAudioEngine();

            if (type === 'airdrop') {
                // Cae un suministro en cada refugio activo (cubre todo el territorio ocupado)
                activeShelterKeys.forEach(key => {
                    const zone = ZONES[key];
                    spawnCrate('HEAVY', zone.pos.x + (Math.random() * 6 - 3), zone.pos.z + (Math.random() * 6 - 3));
                    spawnCrate('WEAPON', zone.pos.x + (Math.random() * 6 - 3), zone.pos.z + (Math.random() * 6 - 3));
                });
                addLogEvent("¡Suministros aéreos lanzados en todos los Refugios activos!");
                showToast("Cajas de armas lanzadas desde el aire.");
            } else if (type === 'artillery') {
                let killed = 0;
                zombies.forEach(z => {
                    if (z.health > 0 && !z.dying) {
                        z.health -= 120;
                        if (z.health <= 0) {
                            z.health = 0;
                            z.dying = true;
                            z.deathTimer = 0;
                            dyingZombies.push(z);
                            killed++;
                        }
                    }
                });
                zombiesAliveCount = Math.max(0, zombiesAliveCount - killed);
                playSound('explosion');
                addLogEvent(`¡Ataque de Artillería destruyó ${killed} zombies!`);
                showToast(`Bombardeo orbital ejecutado: -${killed} zombies.`);
                if (zombiesAliveCount === 0 && isWaveActive) endWaveSuccess();
            } else if (type === 'adrenaline') {
                survivors.forEach(s => {
                    if (s.health > 0) {
                        s.health = s.maxHealth;
                        s.ammo += 60;
                    }
                });
                addLogEvent("¡Chute de Adrenalina! Supervivientes curados al 100%.");
                showToast("Adrenalina aplicada a todos los supervivientes.");
            } else if (type === 'barricade') {
                activeShelterKeys.forEach(key => {
                    const zone = ZONES[key];
                    zone.health = Math.min(100, zone.health + 30);
                    createDebrisBarricades(zone.pos);
                });
                addLogEvent("Barricadas de contención reforzadas en todos los refugios.");
                showToast("Estructuras de refugio reparadas +30%.");
            }
            updateUI();
        }

        function createMuzzleFlash(pos, color = 0xfef08a, life = 0.06) {
            const p = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({ color }));
            p.position.copy(pos).add(new THREE.Vector3(0, 1.1, 0));
            scene.add(p);
            setTimeout(() => scene.remove(p), life * 1000);
        }

        function createBloodParticle(pos) {
            const p = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), new THREE.MeshBasicMaterial({ color: 0xdc2626 }));
            p.position.copy(pos).add(new THREE.Vector3(0, 1.0, 0));
            scene.add(p);
            setTimeout(() => scene.remove(p), 120);
        }

        // ==========================================================
