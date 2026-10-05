/**
 * outpost.js - Refugio nuevo con perimetro definible + patio del tanque +
 *              torre ametralladora y torretas manuales usables por jugador/NPC.
 * Las construcciones quedan FIJAS donde se fundan (pos fija, no se mueven).
 */

// ---------- Anillo de perímetro visible ----------
function drawPerimeterRing(center, radius, color) {
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.5, radius + 0.5, 48),
        new THREE.MeshBasicMaterial({ color: color || 0x22d3ee, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(center.x, 0.06, center.z);
    scene.add(ring);
    return ring;
}

// ---------- REFUGIO NUEVO: fundar + perímetro a elegir ----------
// Se funda donde está el jugador (FIJO) y el jugador elige radio S/M/L.
// Dentro organiza: almacén, torres, paredes, trampas y torretas.
function foundOutpostAt(playerPos, radiusKey) {
    const r = OUTPOST_RADIUS[radiusKey] || OUTPOST_RADIUS.M;
    const freeKey = Object.keys(ZONES).find(k => !ZONES[k].isActiveShelter);
    const center = playerPos.clone(); center.y = 0;
    const ring = drawPerimeterRing(center, r, 0x22d3ee);
    const op = {
        id: ++outpostSeq, zoneKey: freeKey || null, center: center.clone(), radius: r,
        ring: ring, fixed: true,
        plots: { depot: null, towers: [], walls: 0, traps: 0, turrets: 0 }
    };
    outposts.push(op);
    // Si había zona libre, activarla como refugio vinculado al outpost
    if (freeKey) {
        if (typeof activateShelter === 'function') { try { activateShelter(freeKey, true); } catch (e) {} }
        if (typeof createDepot === 'function' && !ZONES[freeKey].depot) { try { createDepot(freeKey); } catch (e) {} }
    }
    addLogEvent(`Refugio nuevo #${op.id} fundado (radio ${r}m, FIJO). Usa el diseñador para colocar almacén, torres, paredes, trampas y torretas.`);
    showToast(`Refugio #${op.id}: define su interior con el diseñador.`);
    renderOutpostMenu();
    updateUI();
    return op;
}

function nearestOutpost(pos, maxD) {
    let best = null, bestD = maxD || 1e9;
    outposts.forEach(o => {
        const d = pos.distanceTo(o.center);
        if (d < bestD) { bestD = d; best = o; }
    });
    return best;
}

function insideAnyOutpost(pos) {
    return outposts.find(o => pos.distanceTo(o.center) <= o.radius) || null;
}

// Colocar módulo del outpost en la posición del jugador (si está dentro del perímetro)
function placeOutpostModule(kind) {
    const p = (typeof getPlayer === 'function') ? getPlayer() : null;
    if (!p) { showToast('Solo en participante.'); return; }
    const op = insideAnyOutpost(p.position);
    if (!op) { showToast('Entra dentro del anillo del refugio para colocar.'); return; }
    const costs = { depot: 20, tower: 15, wall: 8, trap: 5, turret_rapid: 40, turret_mg: 60, turret_missiles: 55 };
    const cost = costs[kind] || 10;
    if ((baseResources.debris || 0) < cost) { showToast('Falta escombro en el depósito (E en cajas material).'); return; }
    const px = p.position.x, pz = p.position.z;
    if (kind === 'depot') {
        if (op.plots.depot) { showToast('Este refugio ya tiene almacén.'); return; }
        baseResources.debris -= cost;
        const mesh = (typeof createDepotMesh === 'function') ? createDepotMesh() : new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 4), new THREE.MeshStandardMaterial({ color: 0x556b2f }));
        mesh.position.set(px, 0, pz);
        scene.add(mesh);
        op.plots.depot = { mesh: mesh, pos: new THREE.Vector3(px, 0, pz) };
        addLogEvent(`Almacén del refugio #${op.id} colocado (FIJO).`);
    } else if (kind === 'tower') {
        if (op.plots.towers.length >= 2) { showToast('Máximo 2 torres por refugio.'); return; }
        baseResources.debris -= cost;
        const site = createTowerSite(op.zoneKey || mainShelterKey, px, pz);
        site.outpostId = op.id; site.fixed = true;
        op.plots.towers.push(site.id);
        addLogEvent(`Obra de torre del refugio #${op.id} (FIJA en su sitio). Martilla + X para ayuda.`);
    } else if (kind === 'wall') {
        baseResources.debris -= cost;
        if (typeof createSurvivorBarricade === 'function') {
            const b = createSurvivorBarricade(px, pz, false);
            b.health = 300; b.maxHealth = 300; // pared de refugio: dura
        }
        op.plots.walls++;
        addLogEvent(`Pared del refugio #${op.id} colocada (FIJA).`);
    } else if (kind === 'trap') {
        baseResources.debris -= cost;
        placeTrapAt(px, pz);
        op.plots.traps++;
        addLogEvent(`Trampa del refugio #${op.id} colocada (FIJA).`);
    } else if (kind.indexOf('turret_') === 0) {
        const tk = kind.replace('turret_', '').toUpperCase();
        baseResources.debris -= cost;
        placeTurretPost(tk, px, pz);
        op.plots.turrets++;
        addLogEvent(`${TURRET_POST_STATS[tk].label} del refugio #${op.id} colocada (FIJA).`);
    }
    renderOutpostMenu();
    updateUI();
}

// ---------- PATIO DEL TANQUE: perímetro donde van torretas/ruedas/todo ----------
function ensureTankYard() {
    if (tank.yard) return tank.yard;
    const p = (typeof getPlayer === 'function') ? getPlayer() : null;
    const mainZone = ZONES[mainShelterKey] || ZONES['MALL'];
    const c = p ? p.position.clone() : mainZone.pos.clone().add(new THREE.Vector3(14, 0, 0));
    c.y = 0;
    tank.yard = c;
    tank.yardRing = drawPerimeterRing(c, 12, 0xf59e0b);
    tank.yardPlots = { turrets: 0, wheels: 0 };
    addLogEvent('Patio del tanque definido (FIJO, anillo ámbar 12m): ahí van torretas, ruedas y ensamblaje.');
    return tank.yard;
}

function placeTankModule(kind) {
    ensureTankYard();
    const p = (typeof getPlayer === 'function') ? getPlayer() : null;
    const y = tank.yard;
    if (!p || p.position.distanceTo(y) > 14) { showToast('Ve al patio del tanque (anillo ámbar) para colocar.'); return; }
    if (kind === 'turret') {
        if ((tank.yardPlots.turrets || 0) >= 3) { showToast('Patio lleno: 3 torretas máx.'); return; }
        if (typeof deployEmplacement === 'function') {
            const def = (typeof TANK_PARTS !== 'undefined' && TANK_PARTS[tank.parts.length]) ? TANK_PARTS[tank.parts.length].key : 'RAPID';
            deployEmplacement(def, p.position.x, p.position.z);
            tank.yardPlots.turrets++;
            addLogEvent('Torreta del tanque colocada en su patio (FIJA).');
        }
    } else if (kind === 'wheels') {
        if ((tank.yardPlots.wheels || 0) >= 2) { showToast('Ruedas listas.'); return; }
        tank.yardPlots.wheels++;
        addLogEvent(`Ruedas del tanque en patio (${tank.yardPlots.wheels}/2, FIJO).`);
        showToast('Módulo de ruedas registrado en el patio.');
    }
    updateUI();
}

// ---------- TORRE AMETRALLADORA (usable por jugador o NPC) ----------
function createMGTowerSite(zoneKey, x, z) {
    const site = createTowerSite(zoneKey, x, z);
    site.mg = true; site.fixed = true;
    addLogEvent(`Obra de TORRE AMETRALLADORA #${site.id} (FIJA): alta cadencia al terminar.`);
    return site;
}

function finishMGTower(tower) {
    // Estructura igual que la normal pero con MG en vez de misiles
    tower.complete = true;
    tower.health = TOWER_HP; tower.maxHealth = TOWER_HP;
    tower.mesh.scale.y = 1;
    if (typeof completeTowerMesh === 'function') completeTowerMesh(tower.mesh);
    const head = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6, roughness: 0.4 }));
    head.add(base);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7 });
    [-0.15, 0.15].forEach(x => {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 8), barrelMat);
        barrel.rotation.x = Math.PI / 2 - 0.1;
        barrel.position.set(x, 0.35, 0.8);
        head.add(barrel);
    });
    const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x4d7c0f }));
    ammoBox.position.set(0.55, 0.2, -0.2);
    head.add(ammoBox);
    head.position.set(0, TOWER_HEIGHT + 0.5, 0);
    tower.mesh.add(head);
    tower.turret = { head: head, cooldown: 0, range: MG_TOWER_STATS.range, damage: 24, radius: 0, fireRate: 0.35, mg: true };
    tower.mg = { cooldown: 0 };
    showToast(`Torre ametralladora ${tower.id}: ¡súbete (Z) y dispara con ClickI!`);
    addLogEvent(`¡Torre ametralladora ${tower.id} lista! Jugador o NPC pueden operarla (alta cadencia + DMG).`);
    updateUI();
}

// Disparo de la MG operada: el que está arriba dirige el fuego
function mgTowerShoot(tower, shooter) {
    const m = tower.mg;
    if (!m || m.cooldown > 0) return false;
    let target = null;
    if (shooter && shooter.isPlayer && typeof playerAimPoint === 'function') {
        const aim = playerAimPoint(MG_TOWER_STATS.range);
        target = aim.zombie;
    } else {
        let bestD = MG_TOWER_STATS.range;
        zombies.forEach(z => {
            if (z.health <= 0 || z.dying) return;
            const d = tower.pos.distanceTo(z.position);
            if (d < bestD) { bestD = d; target = z; }
        });
        // NPC montado prioriza lo que amenaza a su operador
        if (shooter && !shooter.isPlayer && shooter.combatTarget && shooter.combatTarget.health > 0) {
            target = shooter.combatTarget;
        }
    }
    if (!target) return false;
    m.cooldown = MG_TOWER_STATS.cooldown;
    tower.turret.cooldown = 0.35; // frena el fuego auto mientras hay operador
    const top = tower.pos.clone().add(new THREE.Vector3(0, TOWER_HEIGHT + 0.6, 0));
    const dmg = MG_TOWER_STATS.dmg[0] + Math.floor(Math.random() * (MG_TOWER_STATS.dmg[1] - MG_TOWER_STATS.dmg[0]));
    spawnProjectile(top, target, dmg, 90, MG_TOWER_STATS.color);
    if (typeof createMuzzleFlash === 'function') createMuzzleFlash(top, MG_TOWER_STATS.color, 0.05);
    if (typeof playSound === 'function') playSound('gun', 'E3');
    const dx = target.position.x - tower.pos.x, dz = target.position.z - tower.pos.z;
    tower.turret.head.rotation.y = Math.atan2(dx, dz);
    return true;
}

// Tick de torres MG: operador (jugador/NPC) o auto-fuego lento si vacía
function updateMGTowers(dt) {
    const g = dt * Math.max(0.001, gameSpeed);
    towers.forEach(tower => {
        if (!tower.complete || tower.health <= 0 || !tower.mg) return;
        tower.mg.cooldown = Math.max(0, tower.mg.cooldown - g);
        const op = tower.occupants.find(s => s.health > 0);
        if (op) {
            if (op.isPlayer) {
                // El jugador dispara la MG con ClickI (playerShoot la llama)
            } else {
                // NPC operando: ráfagas automáticas con su puntería
                if (tower.mg.cooldown <= 0) mgTowerShoot(tower, op);
            }
        } else {
            // Vacía: auto-fuego lento de vigilancia
            if (tower.mg.cooldown <= 0) {
                let best = null, bestD = MG_TOWER_STATS.range;
                zombies.forEach(z => {
                    if (z.health <= 0 || z.dying) return;
                    const d = tower.pos.distanceTo(z.position);
                    if (d < bestD) { bestD = d; best = z; }
                });
                if (best) {
                    tower.mg.cooldown = MG_TOWER_STATS.cooldown * 6;
                    const top = tower.pos.clone().add(new THREE.Vector3(0, TOWER_HEIGHT + 0.6, 0));
                    const dmg = MG_TOWER_STATS.dmg[0] + Math.floor(Math.random() * (MG_TOWER_STATS.dmg[1] - MG_TOWER_STATS.dmg[0]));
                    spawnProjectile(top, best, dmg, 90, MG_TOWER_STATS.color);
                }
            }
        }
    });
}

// ---------- TORRETAS SUELTAS + TRAMPAS + MUROS ----------
function placeTurretPost(kind, x, z) {
    const st = TURRET_POST_STATS[kind] || TURRET_POST_STATS.RAPID;
    const built = createTurretModel(false);
    built.mesh.scale.setScalar(1.4);
    built.mesh.position.set(x, 0, z);
    scene.add(built.mesh);
    turretPosts.push({ mesh: built.mesh, head: built.headGroup, pos: new THREE.Vector3(x, 0, z), kind: kind, cooldown: 0, range: st.range, damage: st.dmg, fireRate: st.cooldown, color: st.color });
    return turretPosts[turretPosts.length - 1];
}

function updateTurretPosts(dt) {
    const g = dt * Math.max(0.001, gameSpeed);
    turretPosts.forEach(e => {
        e.cooldown = Math.max(0, e.cooldown - g);
        let best = null, bestD = e.range;
        zombies.forEach(z => {
            if (z.health <= 0 || z.dying) return;
            const d = e.pos.distanceTo(z.position);
            if (d < bestD) { bestD = d; best = z; }
        });
        if (!best) return;
        const dx = best.position.x - e.pos.x, dz = best.position.z - e.pos.z;
        e.head.rotation.y += (Math.atan2(dx, dz) - e.head.rotation.y) * Math.min(1, g * 5);
        if (e.cooldown > 0) return;
        e.cooldown = e.fireRate;
        const top = e.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
        if (e.kind === 'MISSILES') {
            if (typeof fireMissile === 'function') fireMissile(top, best.position.clone(), 110, 6);
        } else {
            const dmg = e.damage[0] + Math.floor(Math.random() * (e.damage[1] - e.damage[0]));
            spawnProjectile(top, best, dmg, 85, e.color);
            if (typeof createMuzzleFlash === 'function') createMuzzleFlash(e.pos, e.color, 0.05);
        }
        if (typeof playSound === 'function') playSound('turret', 'G3');
    });
}

function placeTrapAt(x, z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 2.2),
        new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.9 }));
    base.position.y = 0.15;
    g.add(base);
    for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 6),
            new THREE.MeshStandardMaterial({ color: 0xa8a29e, metalness: 0.6 }));
        spike.position.set((Math.random() - 0.5) * 1.6, 0.6, (Math.random() - 0.5) * 1.6);
        g.add(spike);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    traps.push({ mesh: g, pos: new THREE.Vector3(x, 0, z), cooldown: 0, range: 3, damage: 25 });
}

function updateTraps(dt) {
    const g = dt * Math.max(0.001, gameSpeed);
    traps.forEach(t => {
        t.cooldown = Math.max(0, t.cooldown - g);
        if (t.cooldown > 0) return;
        let hit = false;
        zombies.forEach(z => {
            if (z.health <= 0 || z.dying) return;
            if (z.position.distanceTo(t.pos) < t.range) {
                z.health -= t.damage;
                hit = true;
                if (z.health <= 0 && !z.dying && typeof killZombie === 'function') {
                    killZombie(z, (typeof closestKillerTo === 'function') ? closestKillerTo(z.position, 30) : null);
                }
            }
        });
        if (hit) { t.cooldown = 1.0; if (typeof playSound === 'function') playSound('pickup'); }
    });
}

function updateOutpostSystems(dt) {
    updateMGTowers(dt);
    updateTurretPosts(dt);
    updateTraps(dt);
}
