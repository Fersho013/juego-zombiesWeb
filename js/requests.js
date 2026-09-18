/**
 * requests.js - Solicitudes del equipo ("El superviviente necesita...") y
 * refuerzos post-oleada en helicoptero segun bajas.
 * Parte del proyecto Survivors VS Zombies 3D.
 */

// Paso 6 del plan: si faltan materiales para obra, el equipo los solicita.
function requestSupplyHelp(reason) {
    const now = Date.now() / 1000;
    if (now < (survivorRequestCooldowns.supply || 0)) return;
    survivorRequestCooldowns.supply = now + SURVIVOR_REQUEST_COOLDOWN;
    survivorRequests.supply = true;
    showAirBanner('El grupo de supervivientes necesita suministros', 'fa-solid fa-box-open text-amber-300 text-lg');
    addLogEvent(`El grupo de supervivientes necesita suministros: faltan ${reason}.`);
    showToast('El grupo de supervivientes necesita suministros.');
    if (typeof renderTeamRequests === 'function') renderTeamRequests();
    if (typeof updateUI === 'function') updateUI();
}

// El equipo evalua sus necesidades y "presiona botones" de solicitud.
// Muestra alerta "El grupo de supervivientes necesita X" y habilita ayudas.
function updateSurvivorRequests(s, nearestZombie, minDist) {
    if (!s || s.health <= 0) return;
    const now = Date.now() / 1000;

    // 1) SUMINISTROS: municion baja o reserva vacia (fuera y dentro de oleada).
    const teamAmmoAvg = survivors.length
        ? survivors.filter(o => o.health > 0).reduce((a, o) => a + (o.ammo || 0), 0) / Math.max(1, survivors.filter(o => o.health > 0).length)
        : 999;
    if ((s.ammo < 30 || teamAmmoAvg < 50 || baseResources.ammo < 1) &&
        now >= (survivorRequestCooldowns.supply || 0)) {
        survivorRequestCooldowns.supply = now + SURVIVOR_REQUEST_COOLDOWN;
        survivorRequests.supply = true;
        s.thoughtText = '¡Necesitamos suministros!';
        showAirBanner('El grupo de supervivientes necesita suministros', 'fa-solid fa-box-open text-amber-300 text-lg');
        addLogEvent(`¡${s.name} solicita SUMINISTROS! El grupo necesita municion y cajas.`);
        showToast('El grupo de supervivientes necesita suministros.');
        updateUI();
    }

    // 2) ATAQUE AEREO: horda compacta durante el combate.
    if (isWaveActive && nearestZombie && minDist < 20 &&
        countNearbyZombies(s.position, 18) >= 8 &&
        now >= (survivorRequestCooldowns.airstrike || 0)) {
        survivorRequestCooldowns.airstrike = now + SURVIVOR_REQUEST_COOLDOWN;
        survivorRequests.airstrike = true;
        s.thoughtText = '¡Pedimos ataque aéreo, nos rodean!';
        showAirBanner('El grupo de supervivientes necesita ataque aéreo', 'fa-solid fa-helicopter text-red-300 text-lg');
        addLogEvent(`¡${s.name} solicita ATAQUE AÉREO! El grupo está siendo rodeado.`);
        showToast('El grupo de supervivientes necesita ataque aéreo.');
        updateUI();
    }

    // 3) REFUERZOS: hay caidos en el equipo.
    const deadCount = survivors.filter(o => o.health <= 0).length;
    if (deadCount > 0 && now >= (survivorRequestCooldowns.reinforce || 0)) {
        survivorRequestCooldowns.reinforce = now + SURVIVOR_REQUEST_COOLDOWN;
        survivorRequests.reinforce = true;
        s.thoughtText = `¡Necesitamos refuerzos (${deadCount} caídos)!`;
        showAirBanner('El grupo de supervivientes necesita refuerzos', 'fa-solid fa-people-group text-emerald-300 text-lg');
        addLogEvent(`¡${s.name} solicita REFUERZOS! Faltan ${deadCount} supervivientes. Opción "Mandar refuerzos" habilitada.`);
        showToast('El grupo de supervivientes necesita refuerzos.');
        if (typeof updateReinforceButton === 'function') updateReinforceButton();
        updateUI();
    }
}

// Desde 3 refugios: el equipo puede llamar 2 reclutas extra (hasta el tope).
function recruitExtraSurvivors() {
    const maxA = (typeof getMaxSurvivors === 'function') ? getMaxSurvivors() : 5;
    const alive = survivors.filter(o => o.health > 0).length;
    if (activeShelterKeys.length < 3) {
        showToast('Se requieren 3 refugios para llamar reclutas.');
        return;
    }
    if (alive >= maxA) {
        showToast(`Cupo lleno (${alive}/${maxA}).`);
        return;
    }
    const n = Math.min(2, maxA - alive);
    addLogEvent(`El equipo llama a ${n} recluta(s) extra (${alive}->${alive + n}/${maxA}).`);
    deliverReinforcements(n);
}

// Habilita/deshabilita el boton "Mandar refuerzos" segun solicitud y bajas.
function updateReinforceButton() {
    const btn = document.getElementById('btn-reinforce');
    const label = document.getElementById('reinforce-status');
    const btn2 = document.getElementById('btn-recruit');
    if (!btn) return;
    const deadCount = typeof survivors !== 'undefined' ? survivors.filter(o => o.health <= 0).length : 0;
    const alive = typeof survivors !== 'undefined' ? survivors.filter(o => o.health > 0).length : 0;
    const maxA = (typeof getMaxSurvivors === 'function') ? getMaxSurvivors() : 5;
    const canReinforce = deadCount > 0;
    if (canReinforce) {
        btn.classList.remove('opacity-50', 'pointer-events-none');
        btn.removeAttribute('disabled');
        if (label) label.innerText = `${deadCount} por rescatar`;
    } else {
        btn.classList.add('opacity-50', 'pointer-events-none');
        btn.setAttribute('disabled', 'true');
        if (label) label.innerText = `${alive}/${maxA}`;
    }
    if (btn2) {
        const canRecruit = activeShelterKeys.length >= 3 && alive < maxA;
        if (canRecruit) {
            btn2.classList.remove('opacity-50', 'pointer-events-none');
            btn2.removeAttribute('disabled');
        } else {
            btn2.classList.add('opacity-50', 'pointer-events-none');
            btn2.setAttribute('disabled', 'true');
        }
        const l2 = document.getElementById('recruit-status');
        if (l2) l2.innerText = `${alive}/${maxA}`;
    }
}

// Boton del espectador: manda helicoptero con los faltantes (1-4).
// Si hay oleada activa, se encola al final de la oleada.
let reinforceQueued = false;
function triggerReinforcement() {
    const deadCount = survivors.filter(o => o.health <= 0).length;
    if (deadCount <= 0) {
        // Sin bajas pero con 3+ refugios: ofrecer reclutas.
        if (activeShelterKeys.length >= 3) { recruitExtraSurvivors(); return; }
        showToast('No hay bajas que reforzar.');
        return;
    }
    if (isWaveActive) {
        reinforceQueued = true;
        survivorRequests.reinforce = true;
        addLogEvent(`Refuerzos programados: al terminar la oleada llegarán ${deadCount} supervivientes en helicóptero.`);
        showToast(`Refuerzos en camino al final de la oleada (${deadCount}).`);
        showAirBanner('Refuerzos programados para el fin de la oleada', 'fa-solid fa-helicopter text-emerald-300 text-lg');
    } else {
        deliverReinforcements(deadCount);
    }
    updateReinforceButton();
}

// Helicoptero deja N supervivientes: repone bajas y, desde 3 refugios,
// suma reclutas hasta el tope dinámico (7/9/11...50). Si cae a <3, tope 5.
function deliverReinforcements(count) {
    const maxAlive = (typeof getMaxSurvivors === 'function') ? getMaxSurvivors() : 5;
    const alive = survivors.filter(o => o.health > 0).length;
    const dead = survivors.filter(o => o.health <= 0);
    // Primero reponer bajas, luego reclutas extra si hay cupo.
    const wanted = Math.max(count || 0, 0);
    const toReplace = Math.min(dead.length, wanted || dead.length);
    const freeSlots = Math.max(0, maxAlive - alive);
    const extra = Math.min(Math.max(0, (count || 0) - toReplace), freeSlots);
    // Si se pide sin bajas pero hay cupo (llamado desde 3 refugios), trae hasta 2.
    let recruitExtra = 0;
    if (dead.length === 0 && alive < maxAlive && (count || 0) > 0) {
        recruitExtra = Math.min(count, freeSlots, 2);
    }
    const n = toReplace + extra + recruitExtra;
    if (n <= 0) return;
    // Retira los cuerpos caidos antes del aterrizaje.
    dead.slice(0, n).forEach(d => {
        if (d.mesh) scene.remove(d.mesh);
        const idx = survivors.indexOf(d);
        if (idx > -1) survivors.splice(idx, 1);
    });
    // Reasigna IDs continuos para formacion de huida.
    survivors.forEach((s, i) => { s.id = i; });
    const key = (typeof mainShelterKey !== 'undefined' && ZONES[mainShelterKey] && ZONES[mainShelterKey].isActiveShelter)
        ? mainShelterKey : activeShelterKeys[0] || 'MALL';
    const hz = ZONES[key];
    showAirBanner(`Refuerzos en camino: ${n} superviviente(s)`, 'fa-solid fa-helicopter text-emerald-300 text-lg');
    addLogEvent(`Helicóptero de refuerzos trae ${n} superviviente(s) hacia ${hz.name}...`);
    playSound('zombie', 'A1');

    const start = hz.pos.clone().add(new THREE.Vector3(70, 26, 70));
    const hover = hz.pos.clone().add(new THREE.Vector3(0, 22, 0));
    const built = createHelicopterModel(false);
    built.group.position.copy(start);
    scene.add(built.group);
    const heli = { mesh: built.group, rotor: built.rotor };
    const ropes = [];
    const offs = [[-4, -2], [-2, 2], [0, -3], [2, 2]];
    let phase = 0, t = 0;
    const newcomers = [];
    const iv = setInterval(() => {
        t += 0.05;
        heli.rotor.rotation.y += 1.2;
        if (phase === 0) {
            heli.mesh.position.lerpVectors(start, hover, Math.min(1, t / 2));
            if (t >= 2) {
                phase = 1; t = 0;
                for (let i = 0; i < n; i++) {
                    const s = spawnSingleSurvivor(key, hz.pos.x + offs[i % offs.length][0], 20, hz.pos.z + offs[i % offs.length][1]);
                    if (s) {
                        newcomers.push(s);
                        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 20, 6),
                            new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
                        rope.position.set(s.position.x, 12, s.position.z);
                        scene.add(rope);
                        ropes.push(rope);
                    }
                }
                if (typeof renderSurvivorTabs === 'function') renderSurvivorTabs();
                updateUI();
            }
        } else if (phase === 1) {
            const k = Math.min(1, t / 3);
            newcomers.forEach(s => { s.position.y = 20 * (1 - k); });
            if (t >= 3) {
                phase = 2; t = 0;
                newcomers.forEach(s => { s.position.y = 0; s.thoughtText = 'Refuerzo en posición...'; });
                ropes.forEach(r => scene.remove(r));
            }
        } else {
            heli.mesh.position.y += 0.6;
            heli.mesh.position.x += 1.2;
            if (t >= 2) {
                clearInterval(iv);
                scene.remove(heli.mesh);
                survivorRequests.reinforce = false;
                reinforceQueued = false;
                groupFlee = null;
                const maxA = (typeof getMaxSurvivors === 'function') ? getMaxSurvivors() : 5;
                addLogEvent(`Refuerzos en tierra: ${newcomers.length} superviviente(s) se unen (${survivors.filter(o => o.health > 0).length}/${maxA} en pie).`);
                showToast(`Refuerzos desplegados: +${newcomers.length}.`);
                if (typeof renderSurvivorTabs === 'function') renderSurvivorTabs();
                updateReinforceButton();
                updateUI();
            }
        }
    }, 50);
}
