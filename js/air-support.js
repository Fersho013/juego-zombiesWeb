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
                    killZombie(z, ownerSurvivor || closestKillerTo(z.position, 25));
                    kills++;
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
    const rec = { mesh: bar, health: 120, maxHealth: 120, position: bar.position, owner: null, builtBy: fromAir ? 'Apoyo aereo' : 'Supervivientes' };
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

function nearestWall(pos, range) {
    let best = null, bestD = range;
    for (const w of walls) {
        if (w.health <= 0) continue;
        const d = pos.distanceTo(w.position);
        if (d < bestD) { bestD = d; best = w; }
    }
    return best;
}

function destroyWall(wall) {
    scene.remove(wall.mesh);
    const wi = walls.indexOf(wall);
    if (wi > -1) walls.splice(wi, 1);
    addLogEvent(`Un muro del refugio en ${ZONES[wall.shelterKey].name} fue derribado. Podra reconstruirse tras la oleada.`);
    updateUI();
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
    updateLoot(dt);
    updateHealFX(dt);
    updateTowerTurrets(dt);
}

// ==========================================================
// LOOT DE ZOMBIES (armadura, armas, granadas, bengalas, botiquin)
// ==========================================================
const LOOT_STYLE = {
    ARMOR:   { color: 0x94a3b8, label: 'Blindaje' },
    WEAPON:  { color: 0xfbbf24, label: 'Arma' },
    GRENADE: { color: 0x22c55e, label: 'Granadas' },
    MEDKIT:  { color: 0x10b981, label: 'Botiquin' },
    FLARE:   { color: 0xf472b6, label: 'Bengala' }
};

function rollLootKind() {
    const r = Math.random();
    if (r < 0.25) return 'ARMOR';
    if (r < 0.55) return 'WEAPON';
    if (r < 0.75) return 'GRENADE';
    if (r < 0.90) return 'MEDKIT';
    return 'FLARE';
}

function rollWeaponPayload() {
    const pool = ['RIFLE', 'RIFLE', 'SHOTGUN', 'SHOTGUN', 'SNIPER', 'SMG'];
    return pool[Math.floor(Math.random() * pool.length)];
}

function spawnLootPickup(x, z) {
    if (loots.length >= 30) { // tope: retirar el mas viejo
        const old = loots.shift();
        if (old) scene.remove(old.mesh);
    }
    const kind = rollLootKind();
    const style = LOOT_STYLE[kind];
    const group = new THREE.Group();
    group.position.set(x, 0.7, z);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45),
        new THREE.MeshStandardMaterial({ color: style.color, emissive: style.color, emissiveIntensity: 0.45, roughness: 0.3 }));
    gem.castShadow = true;
    group.add(gem);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 16),
        new THREE.MeshBasicMaterial({ color: style.color, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.6;
    group.add(ring);
    scene.add(group);
    loots.push({
        mesh: group, gem: gem, kind: kind,
        payload: kind === 'WEAPON' ? rollWeaponPayload() : null,
        position: new THREE.Vector3(x, 0, z), age: 0
    });
}

function collectLoot(s, loot) {
    scene.remove(loot.mesh);
    const li = loots.indexOf(loot);
    if (li > -1) loots.splice(li, 1);
    const wlabel = loot.payload && WEAPONS[loot.payload] ? WEAPONS[loot.payload].label : '';
    if (loot.kind === 'ARMOR') {
        s.armor = Math.min(100, s.armor + 30);
        s.thoughtText = 'Blindaje recogido (+30)';
        addLogEvent(`${s.name} recogio blindaje de un zombie (+30).`);
    } else if (loot.kind === 'WEAPON') {
        equipPrimary(s, loot.payload);
        s.ammo = Math.min(250, s.ammo + 40);
        s.thoughtText = `Recogi ${wlabel}`;
    } else if (loot.kind === 'GRENADE') {
        s.grenades = Math.min(8, s.grenades + 2);
        s.heavy = `Granadas (${s.grenades})`;
        s.thoughtText = 'Granadas recogidas (+2)';
        addLogEvent(`${s.name} recogio granadas de un zombie (+2).`);
    } else if (loot.kind === 'MEDKIT') {
        s.medkits = Math.min(5, (s.medkits || 0) + 1);
        s.health = Math.min(s.maxHealth, s.health + 25);
        s.thoughtText = 'Botiquin aplicado (+25 salud)';
        addLogEvent(`${s.name} uso un botiquin saqueado (+25 salud).`);
    } else if (loot.kind === 'FLARE') {
        s.flares = Math.min(3, (s.flares || 0) + 1);
        s.thoughtText = 'Bengala recogida';
        addLogEvent(`${s.name} recogio una pistola de bengalas.`);
    }
    playSound('pickup');
    updateUI();
}

function updateLoot(dt) {
    for (let i = loots.length - 1; i >= 0; i--) {
        const l = loots[i];
        l.age += dt;
        l.gem.rotation.y += dt * 3;
        l.mesh.position.y = 0.7 + Math.sin(l.age * 3) * 0.15;
        if (l.age >= LOOT_DESPAWN) {
            scene.remove(l.mesh);
            loots.splice(i, 1);
        }
    }
}

// ==========================================================
// CRUCES VERDES DE CURACION + LLAMARADAS DE QUEMADO
// ==========================================================
function spawnHealCross(pos) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x22ff55, transparent: true, opacity: 0.95 });
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), mat);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.18), mat);
    g.add(v, h);
    g.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5), 1.6, (Math.random() - 0.5)));
    scene.add(g);
    healFX.push({ mesh: g, mat: mat, t: 0, dur: 1.4 });
}

function updateHealFX(dt) {
    for (let i = healFX.length - 1; i >= 0; i--) {
        const f = healFX[i];
        f.t += dt / f.dur;
        f.mesh.position.y += dt * 1.6;
        f.mat.opacity = Math.max(0, 0.95 * (1 - f.t));
        if (f.t >= 1) {
            scene.remove(f.mesh);
            healFX.splice(i, 1);
        }
    }
}

function createFlamePuff(pos) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6),
        new THREE.MeshBasicMaterial({ color: Math.random() > 0.4 ? 0xfb923c : 0xef4444, transparent: true, opacity: 0.9 }));
    p.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.4, (Math.random() - 0.5) * 0.8));
    scene.add(p);
    setTimeout(() => scene.remove(p), 350);
}

// ==========================================================
// TORRES DE VIGILANCIA (obra + torre completa)
// ==========================================================
function buildTowerScaffoldMesh() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x92600f, roughness: 0.9 });
    [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]].forEach(([x, z]) => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 8, 8), wood);
        pole.position.set(x, 4, z);
        pole.castShadow = true;
        g.add(pole);
    });
    [2, 5].forEach(y => {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.25, 3.8), wood);
        beam.position.y = y;
        g.add(beam);
    });
    return g;
}

function completeTowerMesh(group) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x92600f, roughness: 0.9 });
    const plat = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.4, 4.6), wood);
    plat.position.y = TOWER_HEIGHT;
    plat.castShadow = true;
    group.add(plat);
    // Barandilla
    [[0, -2.2, 4.6, 0.15], [0, 2.2, 4.6, 0.15], [-2.2, 0, 0.15, 4.6], [2.2, 0, 0.15, 4.6]].forEach(([x, z, w, d]) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), wood);
        rail.position.set(x, TOWER_HEIGHT + 0.6, z);
        group.add(rail);
    });
    // Bandera
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
    mast.position.set(1.8, TOWER_HEIGHT + 1.4, 1.8);
    group.add(mast);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7),
        new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide }));
    flag.position.set(1.2, TOWER_HEIGHT + 2.1, 1.8);
    group.add(flag);
}

function createTowerSite(zoneKey, x, z) {
    const mesh = buildTowerScaffoldMesh();
    mesh.position.set(x, 0, z);
    mesh.scale.y = 0.2;
    scene.add(mesh);
    const tower = {
        id: ++towerSeq, mesh: mesh, pos: new THREE.Vector3(x, 0, z),
        zoneKey: zoneKey, progress: 0, complete: false,
        health: 200, maxHealth: 200, occupants: []
    };
    towers.push(tower);
    showAirBanner('Los supervivientes comenzaron a construir', 'fa-solid fa-tower-observation text-amber-300 text-lg');
    addLogEvent(`Los supervivientes comenzaron a construir una torre junto a ${ZONES[zoneKey].name} (0/${TOWER_WORK_REQUIRED}s).`);
    return tower;
}

function finishTower(tower) {
    tower.complete = true;
    tower.health = TOWER_HP;
    tower.maxHealth = TOWER_HP;
    tower.mesh.scale.y = 1;
    completeTowerMesh(tower.mesh);
    // Torreta lanzamisiles sobre la plataforma (daño en area)
    const head = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.5, roughness: 0.4 }));
    head.add(dome);
    [-0.25, 0.25].forEach(x => {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7 }));
        tube.rotation.x = Math.PI / 2 - 0.35;
        tube.position.set(x, 0.25, 0.6);
        head.add(tube);
    });
    head.position.set(0, TOWER_HEIGHT + 0.5, 0);
    tower.mesh.add(head);
    tower.turret = { head: head, cooldown: 0, range: 30, damage: 70, radius: 8, fireRate: 2.5 };
    showToast(`Torre ${tower.id} terminada: torreta de misiles operativa.`);
    addLogEvent(`¡Torre ${tower.id} completada! Torreta lanzamisiles + puesto de francotirador listos.`);
    updateUI();
}

function updateTowerTurrets(dt) {
    towers.forEach(tower => {
        if (!tower.complete || tower.health <= 0 || !tower.turret) return;
        const t = tower.turret;
        t.cooldown = Math.max(0, t.cooldown - dt);
        let nearest = null, minD = t.range;
        zombies.forEach(z => {
            if (z.health > 0 && !z.dying) {
                const d = tower.pos.distanceTo(z.position);
                if (d < minD) { minD = d; nearest = z; }
            }
        });
        if (nearest) {
            const dx = nearest.position.x - tower.pos.x;
            const dz = nearest.position.z - tower.pos.z;
            t.head.rotation.y += (Math.atan2(dx, dz) - t.head.rotation.y) * Math.min(1, dt * 5);
            if (t.cooldown <= 0) {
                t.cooldown = t.fireRate;
                const top = tower.pos.clone().add(new THREE.Vector3(0, TOWER_HEIGHT + 0.5, 0));
                fireMissile(top, nearest.position.clone());
                playSound('turret', 'D2');
            }
        }
    });
}

function destroyTower(tower) {
    scene.remove(tower.mesh);
    tower.occupants.slice().forEach(s => {
        s.onTower = null;
        s.position.y = 0;
        s.health = Math.max(1, s.health - 15);
        s.thoughtText = '¡La torre cayó, a tierra!';
    });
    tower.occupants.length = 0;
    const ti = towers.indexOf(tower);
    if (ti > -1) towers.splice(ti, 1);
    survivors.forEach(s => { if (s.towerSiteId === tower.id) { s.towerSiteId = null; s.towerCommitted = false; } });
    addLogEvent(`¡La torre ${tower.id} fue destruida por la horda! Podran construir otra.`);
    showToast(`Torre ${tower.id} destruida.`);
    updateUI();
}

function nearestTower(pos, range, onlyComplete) {
    let best = null, bestD = range;
    for (const t of towers) {
        if (onlyComplete && !t.complete) continue;
        const d = pos.distanceTo(t.pos);
        if (d < bestD) { bestD = d; best = t; }
    }
    return best;
}

// ==========================================================
// RESCATE: helicoptero deja 5 supervivientes con cuerdas
// ==========================================================
function deliverRescueTeam(onLanded) {
    let key = (ZONES[mainShelterKey] && ZONES[mainShelterKey].isActiveShelter) ? mainShelterKey : activeShelterKeys[0];
    if (!key) {
        const fb = ZONES['MALL'];
        fb.intact = true; fb.isActiveShelter = true; fb.health = 50;
        activeShelterKeys = ['MALL'];
        mainShelterKey = 'MALL';
        buildTurretAt('MALL', true);
        key = 'MALL';
    }
    const hz = ZONES[key];
    showAirBanner('Equipo de rescate en camino', 'fa-solid fa-helicopter text-emerald-300 text-lg');
    addLogEvent('Un helicoptero de rescate trae un nuevo equipo de 5 supervivientes...');
    const start = hz.pos.clone().add(new THREE.Vector3(70, 26, 70));
    const hover = hz.pos.clone().add(new THREE.Vector3(0, 22, 0));
    const built = createHelicopterModel(false);
    built.group.position.copy(start);
    scene.add(built.group);
    const heli = { mesh: built.group, rotor: built.rotor };
    const ropes = [];
    const offs = [[-4, -2], [-2, 2], [0, -3], [2, 2], [4, -2]];
    let phase = 0, t = 0;
    const iv = setInterval(() => {
        t += 0.05;
        heli.rotor.rotation.y += 1.2;
        if (phase === 0) { // aproximacion (~2s, tiempo real: juego en pausa)
            heli.mesh.position.lerpVectors(start, hover, Math.min(1, t / 2));
            if (t >= 2) {
                phase = 1; t = 0;
                initSurvivors();
                survivors.forEach((s, i) => {
                    s.homeZoneKey = key;
                    s.position.set(hz.pos.x + offs[i][0], 20, hz.pos.z + offs[i][1]);
                    s.thoughtText = 'Descolgandose del helicoptero...';
                    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 20, 6),
                        new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
                    rope.position.set(s.position.x, 12, s.position.z);
                    scene.add(rope);
                    ropes.push(rope);
                });
                renderSurvivorTabs(); inspectSurvivor(0); updateUI();
            }
        } else if (phase === 1) { // descenso por las 5 cuerdas (~3s)
            const k = Math.min(1, t / 3);
            survivors.forEach(s => { s.position.y = 20 * (1 - k); });
            if (t >= 3) {
                phase = 2; t = 0;
                survivors.forEach(s => { s.position.y = 0; s.thoughtText = 'Retomando la posicion...'; });
                ropes.forEach(r => scene.remove(r));
            }
        } else { // retirada (~2s)
            heli.mesh.position.y += 0.6;
            heli.mesh.position.x += 1.2;
            if (t >= 2) {
                clearInterval(iv);
                scene.remove(heli.mesh);
                addLogEvent('Nuevo equipo en tierra. ¡A retomar la defensa donde quedaron!');
                showToast('Equipo de rescate desplegado.');
                if (onLanded) onLanded();
            }
        }
    }, 50);
}
