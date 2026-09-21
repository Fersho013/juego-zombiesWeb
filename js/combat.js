/**
 * combat.js - Combate: proyectiles, oleadas, intervenciones del
   espectador y particulas.
 * Parte del proyecto Survivors VS Zombies 3D.
 * Variables globales definidas en js/config.js.
 */

// COMBATE: PROYECTILES CON TRAYECTORIA FLUIDA
        // ==========================================================
        function fireSurvivorWeapon(survivor, targetZombie) {
            const w = WEAPONS[survivor.primary] || WEAPONS.PISTOL;
            if (survivor.ammo <= 0) return;
            survivor.ammo--;
            survivor.shootCooldown = w.cooldown;

            playSound('gun', w.sound);
            createMuzzleFlash(survivor.position);
            const origin = survivor.position.clone().add(new THREE.Vector3(0, 1.1, 0));

            if (w.pellets) {
                // Escopeta: N perdigones al objetivo + salpicadura a cercanos
                for (let i = 0; i < w.pellets; i++) {
                    const dmg = w.dmg[0] + Math.floor(Math.random() * (w.dmg[1] - w.dmg[0]));
                    spawnProjectile(origin, targetZombie, dmg, 55, w.color);
                }
                zombies.forEach(z => {
                    if (z !== targetZombie && z.health > 0 && !z.dying && z.position.distanceTo(targetZombie.position) < 3) {
                        const dmg = Math.round((w.dmg[0] + Math.random() * (w.dmg[1] - w.dmg[0])) * 0.5);
                        spawnProjectile(origin, z, dmg, 55, w.color);
                    }
                });
            } else {
                const dmg = w.dmg[0] + Math.floor(Math.random() * (w.dmg[1] - w.dmg[0]));
                spawnProjectile(origin, targetZombie, dmg, 62, w.color);
            }
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
                // Baja acreditada al superviviente vivo mas cercano (aprox. quien disparo)
                killZombie(targetZombie, closestKillerTo(targetZombie.position, 30));
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
                barricades.push({ mesh: bar, health: 80, maxHealth: 80, position: bar.position, owner: null, builtBy: 'Escombros' });
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
            if (typeof mostDamagedShelter === 'function' && mostDamagedShelter()) {
                addLogEvent('Hay daños en refugios: los supervivientes comenzaran a reconstruir.');
            }

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

        function canUseIntervention(type) {
            const now = Date.now() / 1000;
            return (interventionCooldowns[type] || 0) <= now;
        }

        function setInterventionCooldown(type) {
            interventionCooldowns[type] = Date.now() / 1000 + INTERVENTION_COOLDOWN;
            startCooldownTick();
            updateCooldownButtons();
        }

        function cooldownRemaining(type) {
            return Math.max(0, Math.ceil((interventionCooldowns[type] || 0) - Date.now() / 1000));
        }

        function startCooldownTick() {
            if (cooldownTickInterval) return;
            cooldownTickInterval = setInterval(() => {
                updateCooldownButtons();
                const anyLeft = ['airdrop', 'artillery', 'adrenaline', 'barricade', 'materials'].some(t => cooldownRemaining(t) > 0);
                if (!anyLeft) { clearInterval(cooldownTickInterval); cooldownTickInterval = null; }
            }, 250);
        }

        function triggerIntervention(type) {
            initAudioEngine();
            if (!canUseIntervention(type)) {
                showToast(`Espera ${cooldownRemaining(type)}s para reutilizar esta ayuda.`);
                return;
            }
            setInterventionCooldown(type);

            if (type === 'airdrop') {
                // Avion deja 1 caja de arma + 1 pesada por refugio con animacion
                activeShelterKeys.forEach(key => {
                    planeSupplyDrop(key, ['RIFLE', 'GRENADE']);
                });
                addLogEvent("¡Suministros aéreos en camino a todos los Refugios!");
                showToast("Avion de suministros en camino.");
            } else if (type === 'materials') {
                // Avion deja 2 cajas de materiales por refugio con animacion
                activeShelterKeys.forEach(key => {
                    planeSupplyDrop(key, ['MATERIAL', 'MATERIAL']);
                });
                showAirBanner('Materiales de construccion en camino', 'fa-solid fa-cubes text-stone-300 text-lg');
                addLogEvent("¡Avion con materiales de construccion en camino a los Refugios!");
                showToast("Materiales de construccion en camino.");
            } else if (type === 'artillery') {
                // Helicoptero dispara misil AoE y se retira (daño aplicado al impactar)
                heliMissileStrike();
                addLogEvent("¡Helicoptero de ataque llamado sobre la horda!");
                showToast("Helicoptero de ataque en camino.");
            } else if (type === 'adrenaline') {
                // Avion medico: banner + cura tras sobrevuelo corto
                showAirBanner('Apoyo medico en camino', 'fa-solid fa-plane text-emerald-300 text-lg');
                const key = activeShelterKeys[0];
                if (key) planeSupplyDrop(key, ['MED', 'FOOD']);
                survivors.forEach(s => {
                    if (s.health > 0) {
                        s.health = s.maxHealth;
                        s.ammo = Math.min(250, s.ammo + 60);
                    }
                });
                addLogEvent("¡Chute de Adrenalina! Supervivientes curados al 100%.");
                showToast("Adrenalina aplicada a todos los supervivientes.");
            } else if (type === 'barricade') {
                // Helicoptero trae una barricada por refugio y la suelta
                activeShelterKeys.forEach(key => heliBarricadeDrop(key));
                addLogEvent("Helicoptero de carga con barricadas en camino.");
                showToast("Helicoptero con barricada en camino.");
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
