/**
 * air-support.js - Avion de suministros, helicoptero de ataque/transporte,
 * misiles, granadas con explosion AoE y barricadas con HP.
 * Parte del proyecto Survivors VS Zombies 3D.
 */

// ---------- Modelos low-poly ----------
function createPlaneModel() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.4 });
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 7, 10), mat);
    fus.rotation.z = Math.PI / 2;
    fus.castShadow = true;
    g.add(fus);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 9), new THREE.MeshStandardMaterial({ color: 0x475569 }));
    wing.castShadow = true;
    g.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.15), mat);
    tail.position.set(-3.4, 0.8, 0);
    g.add(tail);
    // Luces de navegacion
    const lightL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), new THREE.MeshBasicMaterial({ color: 0x22ff88 }));
    lightL.position.set(0, 0, 4.5);
    const lightR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    lightR.position.set(0, 0, -4.5);
    g.add(lightL, lightR);
    return g;
}

function createHelicopterModel(withBarricade) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 10), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.5, roughness: 0.4 }));
    body.scale.set(1.6, 0.9, 1);
    body.position.y = 0.4;
    body.castShadow = true;
    g.add(body);
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2 }));
    cockpit.position.set(1.6, 0.5, 0);
    g.add(cockpit);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 9), new THREE.MeshStandardMaterial({ color: 0x111827 }));
    rotor.position.y = 1.5;
    rotor.name = 'rotor';
    g.add(rotor);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 4, 8), new THREE.MeshStandardMaterial({ color: 0x374151 }));
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-2.8, 0.5, 0);
    g.add(tail);
    let slung = null;
    if (withBarricade) {
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
        cable.position.y = -1.2;
        g.add(cable);
        slung = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 }));
        slung.position.y = -2.6;
        slung.castShadow = true;
        g.add(slung);
    }
    return { group: g, rotor: rotor, slung: slung };
}

// ---------- Banner superior ----------
function showAirBanner(text, iconClass) {
    const banner = document.getElementById('air-banner');
    if (!banner) return;
    document.getElementById('air-banner-text').innerText = text;
    const icon = document.getElementById('air-banner-icon');
    if (icon && iconClass) icon.className = iconClass;
    banner.classList.remove('hidden');
    banner.classList.add('flex');
    clearTimeout(banner._hideT);
    banner._hideT = setTimeout(() => {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
    }, 4500);
}

// ---------- Avion: deja cajas cerca del refugio ----------
function planeSupplyDrop(zoneKey, crateTypes) {
    const zone = ZONES[zoneKey];
    if (!zone) return;
    showAirBanner('Entrega de suministros en camino', 'fa-solid fa-plane text-amber-300 text-lg');
    addLogEvent(`Avion de apoyo en ruta hacia ${zone.name}...`);
    playSound('pickup');

    const start = zone.pos.clone().add(new THREE.Vector3(-95, 30, -20));
    const end = zone.pos.clone().add(new THREE.Vector3(95, 30, -20));
    const mesh = createPlaneModel();
    mesh.position.copy(start);
    // Orientar hacia direccion de vuelo
    mesh.rotation.y = Math.atan2(end.x - start.x, end.z - start.z) + Math.PI / 2;
    scene.add(mesh);

    airUnits.push({
        kind: 'plane', mesh: mesh, t: 0, dur: 7,
        from: start, to: end, dropped: false, zoneKey: zoneKey, crateTypes: crateTypes
    });
}

function planeDropStep(u) {
    if (!u.dropped && u.t >= 0.45) {
        u.dropped = true;
        const zone = ZONES[u.zoneKey];
        (u.crateTypes || ['WEAPON', 'HEAVY']).forEach((ct, i) => {
            const ox = (Math.random() * 8 - 4) + i * 1.5;
            const oz = (Math.random() * 8 - 4);
            spawnFallingCrate(ct, zone.pos.x + ox, zone.pos.z + oz);
        });
        addLogEvent(`Suministros lanzados sobre ${zone.name}.`);
    }
}

// Caja que cae con paracaidas simplificado y aterriza como crate normal
function spawnFallingCrate(typeKey, x, z) {
    const config = CRATE_TYPES[typeKey] || CRATE_TYPES.WEAPON;
    const group = new THREE.Group();
    group.position.set(x, 18, z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2),
        new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.4, metalness: 0.2 }));
    box.castShadow = true;
    group.add(box);
    // Paracaidas
    const chute = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    chute.position.y = 1.6;
    group.add(chute);
    scene.add(group);
    airUnits.push({ kind: 'falling-crate', mesh: group, chute: chute, t: 0, dur: 2.6, x: x, z: z, typeKey: typeKey });
}

function fallingCrateStep(u, delta) {
    u.t += delta / u.dur;
    u.mesh.position.y = Math.max(0, 18 * (1 - u.t));
    u.mesh.position.x += Math.sin(u.t * 9) * delta * 1.2; // deriva
    if (u.t >= 1) {
        scene.remove(u.mesh);
        spawnCrate(u.typeKey, u.x, u.z);
        playSound('pickup');
        return true; // retirar
    }
    return false;
}

// ---------- Helicoptero artilleria: dispara misil y se retira ----------
function heliMissileStrike() {
    // Punto caliente: centroide de zombies vivos, o del refugio si no hay
    let target = new THREE.Vector3();
    let n = 0;
    zombies.forEach(z => { if (z.health > 0 && !z.dying) { target.add(z.position); n++; } });
    if (n > 0) target.divideScalar(n);
    else if (activeShelterKeys.length) target.copy(ZONES[activeShelterKeys[0]].pos);
    else return;

    showAirBanner('Ataque de artilleria en camino', 'fa-solid fa-helicopter text-red-300 text-lg');
    addLogEvent('Helicoptero de ataque en aproximacion...');
    playSound('zombie', 'A1');

    const start = target.clone().add(new THREE.Vector3(-80, 24, 40));
    const hover = target.clone().add(new THREE.Vector3(-14, 20, 10));
    const built = createHelicopterModel(false);
    built.group.position.copy(start);
    scene.add(built.group);
    airUnits.push({ kind: 'heli-attack', mesh: built.group, rotor: built.rotor, t: 0, dur: 4.5, from: start, to: hover, fired: false, target: target.clone() });
}

function heliAttackStep(u, delta) {
    if (!u.fired && u.t >= 0.75) {
        u.fired = true;
        fireMissile(u.mesh.position.clone(), u.target.clone());
        playSound('explosion');
    }
    if (u.fired && u.t >= 0.9) {
        // Retirada: sigue subiendo y alejandose
        u.mesh.position.y += delta * 8;
        u.mesh.position.x -= delta * 30;
    }
}

function fireMissile(from, targetPos) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 8),
        new THREE.MeshBasicMaterial({ color: 0xf97316 }));
    mesh.position.copy(from);
    scene.add(mesh);
    missiles.push({ mesh: mesh, from: from.clone(), to: targetPos.clone().add(new THREE.Vector3(0, 0.5, 0)), t: 0, dur: 1.1 });
}

function updateMissiles(delta) {
    for (let i = missiles.length - 1; i >= 0; i--) {
        const m = missiles[i];
        m.t += delta / m.dur;
        if (m.t >= 1) {
            scene.remove(m.mesh);
            missiles.splice(i, 1);
            explodeAt(m.to, 13, 130, null); // mismo daño que artilleria anterior
            if (zombiesAliveCount === 0 && isWaveActive) endWaveSuccess();
            updateUI();
        } else {
            // Trayectoria recta + estela
            m.mesh.position.lerpVectors(m.from, m.to, m.t);
            m.mesh.position.y += Math.sin(m.t * Math.PI) * 4;
            m.mesh.lookAt(m.to);
            if (Math.random() < 0.6) createMuzzleFlash(m.mesh.position, 0xfb923c, 0.08);
        }
    }
}

// ---------- Helicoptero transporte: lleva barricada y la suelta ----------
function heliBarricadeDrop(zoneKey) {
    const zone = ZONES[zoneKey];
    if (!zone) return;
    showAirBanner('Refuerzo de barricada en camino', 'fa-solid fa-helicopter text-sky-300 text-lg');
    addLogEvent(`Helicoptero de carga rumbo a ${zone.name} con barricada...`);

    const start = zone.pos.clone().add(new THREE.Vector3(80, 26, 50));
    const hover = zone.pos.clone().add(new THREE.Vector3(6, 14, 6));
    const built = createHelicopterModel(true);
    built.group.position.copy(start);
    scene.add(built.group);
    airUnits.push({ kind: 'heli-carry', mesh: built.group, rotor: built.rotor, slung: built.slung, t: 0, dur: 6, from: start, to: hover, dropped: false, zoneKey: zoneKey });
}

function heliCarryStep(u) {
    if (!u.dropped && u.t >= 0.7) {
        u.dropped = true;
        const zone = ZONES[u.zoneKey];
        if (u.slung) u.mesh.remove(u.slung);
        zone.health = Math.min(100, zone.health + 30);
        const ang = Math.random() * Math.PI * 2;
        createSurvivorBarricade(zone.pos.x + Math.cos(ang) * 9, zone.pos.z + Math.sin(ang) * 9, true);
        addLogEvent(`Barricada aerotransportada instalada en ${zone.name}.`);
        showToast('Barricada entregada por helicoptero.');
        renderSheltersPanel();
        updateUI();
    }
}

// ---------- Explosion AoE (misiles y granadas) ----------
function explodeAt(pos, radius, damage, ownerSurvivor) {
    createExplosionFX(pos, radius);
    playSound('explosion');
    let kills = 0;
    zombies.forEach(z => {
        if (z.health > 0 && !z.dying) {
            const d = z.position.distanceTo(pos);
            if (d < radius) {
                const falloff = 1 - (d / radius) * 0.5;
                z.health -= damage * falloff;
                if (z.health <= 0) {
                    z.health = 0; z.dying = true; z.deathTimer = 0;
                    dyingZombies.push(z);
                    zombiesAliveCount = Math.max(0, zombiesAliveCount - 1);
                    kills++;
                    if (ownerSurvivor && ownerSurvivor.health > 0) ownerSurvivor.kills++;
                }
            }
        }
    });
    if (kills > 0) addLogEvent(`Explosion: ${kills} zombies destruidos.`);
    return kills;
}

function createExplosionFX(pos, radius) {
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xfdba74, transparent: true, opacity: 0.95 }));
    flash.position.copy(pos).add(new THREE.Vector3(0, 1, 0));
    scene.add(flash);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, radius, 24),
        new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos).add(new THREE.Vector3(0, 0.15, 0));
    scene.add(ring);
    let t = 0;
    const iv = setInterval(() => {
        t += 0.05;
        flash.scale.multiplyScalar(1.25);
        flash.material.opacity = Math.max(0, 0.95 - t);
        ring.scale.multiplyScalar(1.06);
        ring.material.opacity = Math.max(0, 0.7 - t);
        if (t >= 0.9) { clearInterval(iv); scene.remove(flash); scene.remove(ring); }
    }, 50);
}

// ---------- Granadas de supervivientes ----------
function throwGrenade(owner, targetPos) {
    if (owner.grenades <= 0) return false;
    owner.grenades--;
    owner.grenadeCooldown = 4;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x166534 }));
    mesh.position.copy(owner.position).add(new THREE.Vector3(0, 1.3, 0));
    scene.add(mesh);
    grenades.push({ mesh: mesh, from: mesh.position.clone(), to: targetPos.clone(), t: 0, dur: 1.1, owner: owner });
    playSound('gun', 'A2');
    return true;
}

function updateGrenades(delta) {
    for (let i = grenades.length - 1; i >= 0; i--) {
        const g = grenades[i];
        g.t += (delta * Math.max(0.001, gameSpeed)) / g.dur;
        if (g.t >= 1) {
            scene.remove(g.mesh);
            grenades.splice(i, 1);
            explodeAt(g.to, 8, 85, g.owner);
            updateUI();
        } else {
            g.mesh.position.lerpVectors(g.from, g.to, g.t);
            g.mesh.position.y += Math.sin(g.t * Math.PI) * 5;
        }
    }
}

// ---------- Barricadas con HP (bloquean zombies) ----------
function createSurvivorBarricade(x, z, fromAir) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 0.8),
        new THREE.MeshStandardMaterial({ color: fromAir ? 0x0ea5e9 : 0x78350f, roughness: 0.9 }));
    bar.position.set(x, 0.6, z);
    bar.rotation.y = Math.random() * Math.PI;
    bar.castShadow = true;
    scene.add(bar);
    const rec = { mesh: bar, health: 120, maxHealth: 120, position: bar.position, builtBy: fromAir ? 'Apoyo aereo' : 'Supervivientes' };
    barricades.push(rec);
    return rec;
}

function nearestBarricade(pos, range) {
    let best = null, bestD = range;
    for (const b of barricades) {
        if (b.health <= 0) continue;
        const d = pos.distanceTo(b.position);
        if (d < bestD) { bestD = d; best = b; }
    }
    return best;
}

// ---------- Loop principal de apoyo aereo ----------
function updateAirSupport(delta) {
    const dt = delta * Math.max(0.001, gameSpeed);
    for (let i = airUnits.length - 1; i >= 0; i--) {
        const u = airUnits[i];
        if (u.kind === 'falling-crate') {
            if (fallingCrateStep(u, dt)) { airUnits.splice(i, 1); }
            continue;
        }
        u.t += dt / u.dur;
        if (u.rotor) u.rotor.rotation.y += delta * 25;
        if (u.kind === 'plane') planeDropStep(u);
        else if (u.kind === 'heli-attack') heliAttackStep(u, dt);
        else if (u.kind === 'heli-carry') heliCarryStep(u);
        // Movimiento base
        if (u.kind === 'plane' || (u.kind.indexOf('heli') === 0 && !(u.fired && u.t >= 0.9))) {
            if (u.mesh.position && u.from && u.to) {
                u.mesh.position.lerpVectors(u.from, u.to, Math.min(1, u.t));
            }
        }
        if (u.t >= 1.15) {
            scene.remove(u.mesh);
            airUnits.splice(i, 1);
        }
    }
    updateMissiles(dt);
    updateGrenades(delta);
}
