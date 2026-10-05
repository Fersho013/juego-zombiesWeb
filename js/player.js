/**
 * player.js - Menu inicial + modo participante (jugador manual).
 * - Menu: plataforma PC/movil, modo espectador/participante/custom, vista FPS/TPS.
 * - Participante: 6º superviviente "Jugador" con WASD, B, E, ClickD/I, G, T, Q, V.
 * - Construccion manual con todos los recipes + llamada de NPCs.
 * - Movil: horizontal + pantalla completa + joystick tactil.
 */

// ============================================================
// MENU INICIAL
// ============================================================
let menuPlatform = 'pc';
let menuMode = 'spectator';
let menuView = 'tps';

function menuMarkActive(prefix, value) {
    ['pc', 'mobile', 'spectator', 'participant', 'custom', 'fps', 'tps'].forEach(v => {
        const b = document.getElementById('menu-btn-' + v);
        if (b) b.classList.remove('menu-active');
    });
    const p = document.getElementById('menu-btn-' + menuPlatform);
    if (p) p.classList.add('menu-active');
    const m = document.getElementById('menu-btn-' + menuMode);
    if (m) m.classList.add('menu-active');
    const vw = document.getElementById('menu-btn-' + menuView);
    if (vw) vw.classList.add('menu-active');
}

function menuSelectPlatform(p) {
    menuPlatform = (p === 'mobile') ? 'mobile' : 'pc';
    menuMarkActive();
    const hint = document.getElementById('menu-hint');
    if (hint) hint.innerText = menuPlatform === 'mobile'
        ? 'Móvil: al pulsar JUGAR se pedirá pantalla completa horizontal.'
        : 'PC seleccionado. Elige modo y pulsa JUGAR.';
}

function menuSelectMode(m) {
    menuMode = (['spectator', 'participant', 'custom'].includes(m)) ? m : 'spectator';
    const cw = document.getElementById('custom-picker-wrap');
    if (cw) cw.classList.toggle('hidden', menuMode !== 'custom');
    const vw = document.getElementById('view-picker-wrap');
    if (vw) vw.style.opacity = (menuMode === 'spectator') ? '0.4' : '1';
    menuMarkActive();
}

function menuSelectView(v) {
    menuView = (v === 'fps') ? 'fps' : 'tps';
    menuMarkActive();
}

function menuCustomChanged() {
    const b = document.getElementById('custom-base');
    const z = document.getElementById('custom-zombies');
    const r = document.getElementById('custom-res');
    const pr = document.getElementById('custom-prep');
    if (b) customBaseMode = (b.value === 'participant') ? 'participant' : 'spectator';
    if (z) customSettings.zombieMult = parseFloat(z.value) || 1;
    if (r) customSettings.startResources = parseInt(r.value, 10) || 0;
    if (pr) customSettings.prepTime = parseInt(pr.value, 10) || 180;
}

// Pantalla completa + bloqueo horizontal en movil
function requestMobileFullscreen() {
    try {
        const el = document.documentElement;
        if (el.requestFullscreen && !document.fullscreenElement) {
            el.requestFullscreen().catch(() => {});
        } else if (el.webkitRequestFullscreen && !document.webkitFullscreenElement) {
            el.webkitRequestFullscreen();
        }
    } catch (e) {}
    try {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
    } catch (e) {}
}

function menuStartGame() {
    menuCustomChanged();
    gameMode = menuMode;
    if (gameMode === 'custom') {
        // custom hereda vista elegida si su base es participante
        viewMode = menuView;
    } else {
        viewMode = menuView;
        customBaseMode = (gameMode === 'participant') ? 'participant' : 'spectator';
        if (gameMode === 'spectator') {
            customSettings.zombieMult = 1;
            customSettings.prepTime = 180;
        }
    }
    const effectiveParticipant = (gameMode === 'participant') ||
        (gameMode === 'custom' && customBaseMode === 'participant');

    // Aplicar recursos custom antes de arrancar
    if (gameMode === 'custom') {
        baseResources.ammo = customSettings.startResources;
        baseResources.meds = customSettings.startResources;
        baseResources.food = customSettings.startResources;
        baseResources.heavy = customSettings.startResources;
        waveTimer = customSettings.prepTime;
    }

    // Plataforma (reutiliza setPlatform existente + fullscreen movil)
    if (typeof setPlatform === 'function') setPlatform(menuPlatform);
    else { uiMode = menuPlatform; document.body.classList.toggle('mobile-mode', menuPlatform === 'mobile'); }
    if (menuPlatform === 'mobile') {
        requestMobileFullscreen();
        document.body.classList.add('force-landscape');
    }

    // Cerrar menu y arrancar
    const menu = document.getElementById('platform-menu');
    if (menu) { menu.classList.add('hidden'); menu.classList.remove('flex'); }
    gameStarted = true;
    if (gameSpeed === 0) setSpeed(1);

    if (effectiveParticipant) {
        spawnPlayerSurvivor();
        const help = document.getElementById('player-help');
        if (help) help.classList.remove('hidden');
        const ch = document.getElementById('player-crosshair');
        if (ch) ch.classList.remove('hidden');
        if (uiMode === 'mobile') {
            const tc = document.getElementById('touch-controls');
            if (tc) tc.classList.remove('hidden');
        }
        initPlayerInput();
        addLogEvent('Modo PARTICIPANTE: controlas a Jugador (WASD + ratón). Pulsa B para construir.');
        showToast('Eres el Jugador: WASD moverse, B construir, E recoger.');
    } else {
        addLogEvent('Modo ESPECTADOR: los 5 NPC juegan solos.');
    }
    if (typeof updateUI === 'function') updateUI();
}

// Compat: el menu antiguo llamaba setPlatform directo; ahora solo preselecciona
// (se mantiene setPlatform original en ui.js para aplicar el modo).

// ============================================================
// SPAWN JUGADOR (6º superviviente manual)
// ============================================================
function spawnPlayerSurvivor() {
    if (playerIndex >= 0 && survivors[playerIndex]) return survivors[playerIndex];
    const zone = ZONES[mainShelterKey] || ZONES['MALL'];
    const built = createHumanoidModel(0x22d3ee, 0xfde047, 1.0);
    built.group.position.set(zone.pos.x + 2, 0, zone.pos.z + 6);
    scene.add(built.group);
    const p = {
        id: survivors.length, name: 'Jugador (Tú)', role: 'Participante',
        colorHex: 0x22d3ee, mesh: built.group, limbs: built.limbs,
        animPhase: 0, isMoving: false, position: built.group.position,
        targetPos: built.group.position.clone(),
        health: 100, maxHealth: 100, stamina: 100, ammo: 120,
        weapon: 'Rifle de Asalto', primary: 'RIFLE', grenades: 3, grenadeCooldown: 0,
        armor: 0, debris: 0, medkits: 2, flares: 0, flareCooldown: 0,
        onTower: null, buildProgress: 0, buildTarget: null, melee: 'Machete Tactico',
        heavy: 'Granadas (3)', carriedCrate: null, kills: 0,
        homeZoneKey: mainShelterKey, aiState: 'DEFEND_BASE',
        targetCrate: null, thoughtText: 'Control manual', shootCooldown: 0,
        collapsed: false, collapseTimer: 0, isPlayer: true,
        playerBuildSite: null // obra que el jugador martilla con B
    };
    survivors.push(p);
    playerIndex = survivors.length - 1;
    selectedSurvivorIndex = playerIndex;
    if (typeof refreshWeaponMesh === 'function') refreshWeaponMesh(p);
    if (typeof renderSurvivorTabs === 'function') renderSurvivorTabs();
    return p;
}

function getPlayer() {
    if (playerIndex < 0 || !survivors[playerIndex]) return null;
    return survivors[playerIndex];
}

function isParticipantActive() {
    const p = getPlayer();
    return !!(gameStarted && p && p.health > 0);
}

// ============================================================
// INPUT PC (WASD + ratón + teclas)
// ============================================================
let playerInputBound = false;
const BUILD_RECIPES = [
    { key: 'tower',     label: 'Torre vigía',        cost: 15,  work: 400, desc: 'Plataforma francotirador (400s)' },
    { key: 'perimeter', label: 'Tramo perímetro',    cost: 10,  work: 40,  desc: 'Barricada del refugio (rápida)' },
    { key: 'shelter',   label: 'Fundar refugio',     cost: 30,  work: 120, desc: 'Nueva casa-refugio (120s)' },
    { key: 'cart',      label: 'Pieza de carro',     cost: 100, work: 120, desc: 'Carro 4x100 (transporte)' },
    { key: 'tank',      label: 'Pieza de tanque',    cost: 500, work: 300, desc: 'Tanque 5x500 (arma final)' },
    { key: 'dummy',     label: 'Dummie bomba',       cost: 20,  work: 4,   desc: 'Señuelo explosivo (+1 granada)' }
];

function initPlayerInput() {
    if (playerInputBound) return;
    playerInputBound = true;
    window.addEventListener('keydown', (e) => {
        const p = getPlayer();
        if (!p) return;
        const k = e.key.toLowerCase();
        if (k === 'w') playerInput.fwd = true;
        if (k === 's') playerInput.back = true;
        if (k === 'a') playerInput.left = true;
        if (k === 'd') playerInput.right = true;
        if (k === 'b') toggleBuildMenu();
        if (k === 'e') playerInteract();
        if (k === 'g') toggleWeaponMenu();
        if (k === 't') playerRally();
        if (k === 'q') playerHealAlly();
        if (k === 'v') { viewMode = (viewMode === 'fps') ? 'tps' : 'fps'; showToast(viewMode === 'fps' ? 'Vista: 1ª persona' : 'Vista: 3ª persona'); }
        if (['w', 'a', 's', 'd'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (k === 'w') playerInput.fwd = false;
        if (k === 's') playerInput.back = false;
        if (k === 'a') playerInput.left = false;
        if (k === 'd') playerInput.right = false;
    });
    // Ratón: Click DERECHO dispara, Click IZQUIERDO granada (según spec)
    window.addEventListener('mousedown', (e) => {
        const p = getPlayer();
        if (!p || !gameStarted) return;
        if (!isBuildMenuOpen() && !isWeaponMenuOpen() && e.target.closest('#build-menu,#weapon-menu,#platform-menu')) return;
        if (e.button === 2) playerShoot();
        if (e.button === 0 && e.target.tagName === 'CANVAS') playerThrowGrenade();
    });
    window.addEventListener('contextmenu', (e) => {
        if (gameStarted && getPlayer()) e.preventDefault();
    });
    // Mirar con el ratón (yaw/pitch) al mover sobre el canvas en participante
    window.addEventListener('mousemove', (e) => {
        if (!isParticipantActive()) return;
        if (e.buttons !== 0 && e.target && e.target.tagName === 'CANVAS') {
            playerInput.yaw -= e.movementX * 0.003;
            playerInput.pitch = Math.max(-1, Math.min(0.6, playerInput.pitch - e.movementY * 0.002));
        }
    });
    initTouchControls();
    renderBuildMenu();
    renderWeaponMenu();
}

// ============================================================
// ACCIONES PARTICIPANTE
// ============================================================
function playerForwardDir() {
    return new THREE.Vector3(Math.sin(playerInput.yaw), 0, Math.cos(playerInput.yaw)).multiplyScalar(-1);
}

function updatePlayer(delta) {
    const p = getPlayer();
    if (!p) return;
    if (p.health <= 0) {
        // Muerto: salir de FPS, mostrar cuerpo y ceder cámara a orbit
        p.mesh.visible = true;
        if (controls) controls.enabled = true;
        return;
    }
    p.shootCooldown = Math.max(0, p.shootCooldown - delta);
    p.grenadeCooldown = Math.max(0, (p.grenadeCooldown || 0) - delta * Math.max(1, gameSpeed));
    // Movimiento WASD relativo a la cámara
    const speed = 0.14 * (p.stamina > 10 ? 1 : 0.6);
    const fwd = playerForwardDir();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = new THREE.Vector3();
    if (playerInput.fwd) move.add(fwd);
    if (playerInput.back) move.sub(fwd);
    if (playerInput.right) move.add(right);
    if (playerInput.left) move.sub(right);
    if (move.lengthSq() > 0) {
        move.normalize();
        p.position.x += move.x * speed * Math.max(1, gameSpeed);
        p.position.z += move.z * speed * Math.max(1, gameSpeed);
        p.position.x = Math.max(-95, Math.min(95, p.position.x));
        p.position.z = Math.max(-95, Math.min(95, p.position.z));
        p.isMoving = true;
        p.stamina = Math.max(0, p.stamina - delta * 4);
        // Orientar cuerpo hacia el movimiento si no hay enemigo fijado
        const ang = Math.atan2(move.x, move.z);
        p.mesh.rotation.y = ang;
    } else {
        p.isMoving = false;
        p.stamina = Math.min(100, p.stamina + delta * 8);
    }
    // Martilleo de obra propia (B -> construir): aporta como un NPC
    if (p.playerBuildSite) updatePlayerBuildTick(p, delta);
    if (typeof syncHandTool === 'function') syncHandTool(p);
    if (typeof syncBackpack === 'function') syncBackpack(p);
    if (typeof animateEntityLimbs === 'function') animateEntityLimbs(p, delta);
    updatePlayerCamera();
}

function playerAimPoint(maxRange) {
    const p = getPlayer();
    const dir = playerForwardDir();
    const origin = p.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    let best = null, bestD = maxRange || 40;
    zombies.forEach(z => {
        if (z.health <= 0 || z.dying) return;
        const to = z.position.clone().sub(p.position); to.y = 0;
        const d = to.length();
        if (d > bestD) return;
        to.normalize();
        const dot = to.dot(dir.clone().normalize());
        if (dot > 0.86 && d < bestD) { bestD = d; best = z; }
    });
    if (best) return { zombie: best, point: best.position.clone() };
    return { zombie: null, point: origin.add(dir.multiplyScalar(14)) };
}

function playerShoot() {
    const p = getPlayer();
    if (!p || p.health <= 0 || p.shootCooldown > 0 || p.ammo <= 0) return;
    const w = (typeof WEAPONS !== 'undefined' && WEAPONS[p.primary]) ? WEAPONS[p.primary] : null;
    const range = w ? w.range : 24;
    const aim = playerAimPoint(range);
    if (aim.zombie) {
        if (typeof fireSurvivorWeapon === 'function') fireSurvivorWeapon(p, aim.zombie);
        p.mesh.rotation.y = Math.atan2(aim.zombie.position.x - p.position.x, aim.zombie.position.z - p.position.z);
        p.thoughtText = 'Disparando...';
    } else {
        // Disparo al aire: gasta munición y muestra fogonazo
        p.ammo = Math.max(0, p.ammo - 1);
        p.shootCooldown = w ? w.cooldown : 0.3;
        if (typeof createMuzzleFlash === 'function') createMuzzleFlash(p.position);
        if (typeof playSound === 'function' && w) playSound('gun', w.sound);
    }
    if (typeof updateUI === 'function') updateUI();
}

function playerThrowGrenade() {
    const p = getPlayer();
    if (!p || p.health <= 0 || (p.grenades || 0) <= 0 || (p.grenadeCooldown || 0) > 0) {
        if (p && (p.grenades || 0) <= 0) showToast('Sin granadas: recoge caja de granadas.');
        return;
    }
    const aim = playerAimPoint(18);
    if (typeof throwGrenade === 'function') throwGrenade(p, aim.point);
    p.thoughtText = '¡Granada fuera!';
    if (typeof updateUI === 'function') updateUI();
}

// E: recoger caja cercana / entregar material al depósito-obra
function playerInteract() {
    const p = getPlayer();
    if (!p || p.health <= 0) return;
    // 1) Si lleva caja y está cerca del refugio -> entregar
    const home = ZONES[p.homeZoneKey] || ZONES['MALL'];
    if (p.carriedCrate && p.position.distanceTo(home.pos) < 6) {
        if (typeof depositCrateAtBase === 'function') depositCrateAtBase(p);
        else { p.carriedCrate = null; }
        showToast('Material entregado al refugio.');
        updateUI();
        return;
    }
    // 2) Caja cercana -> recoger
    let best = null, bestD = 2.6;
    crates.forEach(c => {
        if (c.isPickedUp) return;
        const d = p.position.distanceTo(c.position);
        if (d < bestD) { bestD = d; best = c; }
    });
    if (best) {
        if (typeof pickupCrate === 'function') pickupCrate(p, best);
        else { best.isPickedUp = true; }
        showToast('Caja recogida: ' + best.config.name);
        updateUI();
        return;
    }
    // 3) Loot de zombie cercano
    for (let i = loots.length - 1; i >= 0; i--) {
        if (p.position.distanceTo(loots[i].position) < 2.2) {
            if (typeof collectLoot === 'function') collectLoot(p, loots[i]);
            showToast('Loot recogido.');
            updateUI();
            return;
        }
    }
    showToast('Nada que recoger aquí. Acércate a una caja.');
}

// T: reagrupar aliados en mi posición
function playerRally() {
    const p = getPlayer();
    if (!p) return;
    let n = 0;
    survivors.forEach(o => {
        if (o === p || o.health <= 0 || o.isPlayer) return;
        o.targetCrate = null; o.healTarget = null;
        o.towerCommitted = false; o.foundCommitted = false; o.tankCommitted = false; o.cartCommitted = false;
        o.targetPos = p.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
        o.thoughtText = '¡Reagrupando con el líder!';
        // Forzar movimiento inmediato hacia el jugador
        if (typeof moveTowards === 'function') moveTowards(o, o.targetPos, 0.13);
        n++;
    });
    addLogEvent(`Jugador reagrupa a ${n} aliados en su posición.`);
    showToast(`Reagrupando a ${n} aliados.`);
}

// Q: curar aliado cercano (solo si está cerca)
function playerHealAlly() {
    const p = getPlayer();
    if (!p || (p.medkits || 0) <= 0) { showToast('Sin botiquines.'); return; }
    let best = null, bestD = 3.0;
    survivors.forEach(o => {
        if (o === p || o.health <= 0 || o.isPlayer) return;
        if (o.health >= o.maxHealth * 0.95) return;
        const d = p.position.distanceTo(o.position);
        if (d < bestD) { bestD = d; best = o; }
    });
    if (!best) { showToast('Sin aliados heridos cerca (3m).'); return; }
    best.health = Math.min(best.maxHealth, best.health + 40);
    if (typeof spawnHealCross === 'function') spawnHealCross(best.position);
    if (best.health >= best.maxHealth * 0.95) {
        p.medkits--;
        addLogEvent(`Jugador curó a ${best.name}.`);
    }
    p.thoughtText = `Curando a ${best.name}...`;
    updateUI();
}

// G: selector de armas (usa inventario del jugador)
function toggleWeaponMenu() {
    const m = document.getElementById('weapon-menu');
    if (!m) return;
    m.classList.toggle('hidden');
    if (!m.classList.contains('hidden')) renderWeaponMenu();
}
function isWeaponMenuOpen() {
    const m = document.getElementById('weapon-menu');
    return !!(m && !m.classList.contains('hidden'));
}
function renderWeaponMenu() {
    const wrap = document.getElementById('weapon-list');
    if (!wrap) return;
    const p = getPlayer();
    wrap.innerHTML = '';
    Object.keys(WEAPONS).forEach(k => {
        const w = WEAPONS[k];
        const row = document.createElement('div');
        row.className = 'weapon-item';
        const owned = p && p.primary === k ? '✔ equipada' : 'equipar';
        row.innerHTML = `<span><b>${w.label}</b> <span class="text-slate-400">(${w.dmg[0]}-${w.dmg[1]} · ${w.range}m)</span></span>`;
        const btn = document.createElement('button');
        btn.innerText = owned;
        btn.onclick = () => {
            if (p) {
                p.primary = k;
                p.weapon = w.label;
                if (typeof refreshWeaponMesh === 'function') refreshWeaponMesh(p);
                if (typeof equipPrimary === 'function') { try { equipPrimary(p, k); } catch (e) {} }
                addLogEvent(`Jugador equipa ${w.label}.`);
                updateUI();
                renderWeaponMenu();
            }
        };
        row.appendChild(btn);
        wrap.appendChild(row);
    });
}

// ============================================================
// CONSTRUCCIÓN MANUAL (B) + LLAMAR NPCs
// ============================================================
function isBuildMenuOpen() {
    const m = document.getElementById('build-menu');
    return !!(m && !m.classList.contains('hidden'));
}
function toggleBuildMenu() {
    const m = document.getElementById('build-menu');
    if (!m) return;
    m.classList.toggle('hidden');
    if (!m.classList.contains('hidden')) renderBuildMenu();
}
function renderBuildMenu() {
    const wrap = document.getElementById('build-list');
    if (!wrap) return;
    wrap.innerHTML = '';
    const p = getPlayer();
    BUILD_RECIPES.forEach(r => {
        const row = document.createElement('div');
        row.className = 'build-item';
        const can = (baseResources.debris || 0) >= r.cost && (r.key !== 'dummy' || (p && (p.grenades || 0) > 0));
        row.innerHTML = `<span><b>${r.label}</b><br><span class="text-slate-400">${r.desc} · ${r.cost} escombro</span></span>`;
        const btn = document.createElement('button');
        btn.innerText = 'Construir';
        btn.disabled = !can;
        btn.title = can ? 'Colocar obra junto a ti' : 'Falta escombro' + (r.key === 'dummy' ? ' o granada' : '');
        btn.onclick = () => playerStartBuild(r.key);
        row.appendChild(btn);
        wrap.appendChild(row);
    });
}

// Inicia obra manual junto al jugador (sin el orden estricto de la IA)
function playerStartBuild(key) {
    const p = getPlayer();
    if (!p) return;
    const recipe = BUILD_RECIPES.find(r => r.key === key);
    if (!recipe) return;
    if ((baseResources.debris || 0) < recipe.cost) { showToast('Falta escombro en el depósito. Pulsa E en cajas de material.'); return; }
    if (key === 'dummy' && (p.grenades || 0) <= 0) { showToast('El dummie necesita 1 granada.'); return; }
    const mainZone = ZONES[mainShelterKey] || ZONES['MALL'];
    const ang = playerInput.yaw || Math.random() * Math.PI * 2;

    if (key === 'tower') {
        if (typeof countCompleteTowers === 'function' && countCompleteTowers() >= TOWER_MAX) { showToast('Máximo de torres alcanzado.'); return; }
        baseResources.debris -= recipe.cost;
        const site = createTowerSite(mainZone.key, p.position.x + Math.cos(ang) * 8, p.position.z + Math.sin(ang) * 8);
        p.playerBuildSite = { kind: 'tower', ref: site };
        addLogEvent('Jugador funda obra de torre. ¡Martilla cerca + llama NPCs!');
    } else if (key === 'perimeter') {
        baseResources.debris -= recipe.cost;
        if (typeof createSurvivorBarricade === 'function') createSurvivorBarricade(p.position.x + 3, p.position.z + 3, false);
        addLogEvent('Jugador levanta un tramo del perímetro.');
    } else if (key === 'shelter') {
        const freeKey = Object.keys(ZONES).find(k => !ZONES[k].isActiveShelter);
        if (!freeKey) { showToast('No quedan zonas libres para refugio.'); baseResources.debris += recipe.cost; return; }
        baseResources.debris -= recipe.cost;
        shelterFounder = { zoneKey: freeKey, progress: 0, required: SHELTER_FOUND_WORK };
        p.playerBuildSite = { kind: 'shelter', ref: shelterFounder };
        addLogEvent(`Jugador funda refugio en ${ZONES[freeKey].name}. ¡Ayuda a construir!`);
    } else if (key === 'cart') {
        if (carts.length >= CART_MAX) { showToast('Máximo de carros alcanzado.'); return; }
        baseResources.debris -= recipe.cost;
        // Obra simplificada: el jugador + NPCs aportan, al completar aparece el carro
        p.playerBuildSite = { kind: 'cart', progress: 0, required: CART_PART_WORK };
        addLogEvent('Jugador inicia pieza de carro. ¡Martilla + llama NPCs!');
    } else if (key === 'tank') {
        baseResources.debris -= recipe.cost;
        p.playerBuildSite = { kind: 'tank', progress: 0, required: TANK_PART_WORK };
        addLogEvent('Jugador inicia pieza de tanque. ¡Obra mayor!');
    } else if (key === 'dummy') {
        baseResources.debris -= recipe.cost;
        p.grenades--;
        if (typeof spawnDummy === 'function') spawnDummy(p.position.x + 2, p.position.z + 2);
        addLogEvent('Jugador coloca un dummie bomba.');
    }
    renderBuildMenu();
    updateUI();
}

// El jugador martilla su obra estando cerca (aporta 2s por segundo)
function updatePlayerBuildTick(p, delta) {
    const site = p.playerBuildSite;
    if (!site) return;
    if (site.kind === 'tower' && site.ref) {
        const d = p.position.distanceTo(site.ref.pos);
        if (d > 3) { p.thoughtText = 'Ve a la obra para martillar (B) + llama NPCs (botón)'; return; }
        p.hammering = true;
        site.ref.progress += delta * 2 * Math.max(1, gameSpeed);
        p.thoughtText = `Martillando torre ${Math.floor(site.ref.progress)}/${TOWER_WORK_REQUIRED}s`;
        if (site.ref.progress >= TOWER_WORK_REQUIRED) {
            if (typeof finishTower === 'function') finishTower(site.ref);
            p.playerBuildSite = null;
            p.hammering = false;
        }
        return;
    }
    if (site.kind === 'shelter') {
        const z = ZONES[shelterFounder ? shelterFounder.zoneKey : ''];
        const target = z ? z.pos : p.position;
        if (p.position.distanceTo(target) > 12) { p.thoughtText = 'Acércate al nuevo refugio para construir'; return; }
        p.hammering = true;
        if (shelterFounder) {
            shelterFounder.progress += delta * 2 * Math.max(1, gameSpeed);
            p.thoughtText = `Levantando refugio ${Math.floor(shelterFounder.progress)}/${shelterFounder.required}s`;
        }
        return;
    }
    // cart / tank simplificados junto al jugador
    const d0 = 4;
    p.hammering = true;
    site.progress += delta * 2 * Math.max(1, gameSpeed);
    p.thoughtText = `Construyendo ${site.kind} ${Math.floor(site.progress)}/${site.required}s (NPCs ayudan x2)`;
    if (site.progress >= site.required) {
        if (site.kind === 'cart' && typeof assembleCart === 'function') {
            try { assembleCart(); } catch (e) { addLogEvent('Pieza de carro del jugador lista.'); }
        } else {
            addLogEvent(`Pieza de ${site.kind} del jugador terminada.`);
            showToast(`¡Pieza de ${site.kind} lista!`);
        }
        p.playerBuildSite = null;
        p.hammering = false;
    }
}

// Llamar NPCs a la obra del jugador: acelera xN
function playerCallHelpers() {
    const p = getPlayer();
    if (!p || !p.playerBuildSite) { showToast('Primero inicia una obra con Construir.'); return; }
    const site = p.playerBuildSite;
    let targetPos = p.position.clone();
    if (site.kind === 'tower' && site.ref) targetPos = site.ref.pos.clone();
    if (site.kind === 'shelter' && shelterFounder) targetPos = ZONES[shelterFounder.zoneKey].pos.clone();
    let n = 0;
    survivors.forEach(o => {
        if (o === p || o.health <= 0 || o.isPlayer) return;
        o.targetCrate = null;
        if (site.kind === 'tower' && site.ref) { o.towerSiteId = site.ref.id; o.towerCommitted = true; }
        if (site.kind === 'shelter') { o.foundCommitted = true; }
        if (site.kind === 'cart') { o.cartCommitted = true; }
        if (site.kind === 'tank') { o.tankCommitted = true; }
        o.targetPos = targetPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
        o.thoughtText = '¡Ayudando al Jugador en su obra!';
        n++;
    });
    addLogEvent(`Jugador llama a ${n} NPCs a su obra (${site.kind}). ¡Construcción acelerada!`);
    showToast(`${n} NPCs vienen a ayudar.`);
}

// ============================================================
// CÁMARA FPS / TPS + TÁCTIL
// ============================================================
function updatePlayerCamera() {
    const p = getPlayer();
    if (!p) return;
    cameraMode = 'follow';
    selectedSurvivorIndex = playerIndex;
    const dir = playerForwardDir();
    if (viewMode === 'fps') {
        // Primera persona estilo CoD: ojos del jugador
        const eye = p.position.clone().add(new THREE.Vector3(0, 1.7, 0));
        camera.position.copy(eye);
        const look = eye.clone().add(new THREE.Vector3(dir.x, playerInput.pitch, dir.z).multiplyScalar(10));
        camera.lookAt(look);
        p.mesh.visible = false;
        if (controls) controls.enabled = false;
    } else {
        // Tercera persona estilo Fortnite: hombro
        p.mesh.visible = true;
        if (controls) controls.enabled = true;
        const back = dir.clone().multiplyScalar(-7);
        const desired = p.position.clone().add(back).add(new THREE.Vector3(2.2, 4.2 + playerInput.pitch * -4, 0));
        camera.position.lerp(desired, 0.12);
        if (controls) {
            controls.target.lerp(p.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0.25);
        } else {
            camera.lookAt(p.position.clone().add(new THREE.Vector3(0, 1.6, 0)));
        }
    }
}

function initTouchControls() {
    const joy = document.getElementById('touch-joystick');
    const stick = document.getElementById('touch-stick');
    if (!joy || !stick) return;
    let joyActive = false, joyCX = 0, joyCY = 0;
    joy.addEventListener('touchstart', (e) => {
        joyActive = true;
        const r = joy.getBoundingClientRect();
        joyCX = r.left + r.width / 2; joyCY = r.top + r.height / 2;
        e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
        if (!joyActive) return;
        const t = e.touches[0];
        const dx = t.clientX - joyCX, dy = t.clientY - joyCY;
        const len = Math.max(1, Math.hypot(dx, dy));
        const cl = Math.min(40, len);
        stick.style.left = (31 + dx / len * cl) + 'px';
        stick.style.top = (31 + dy / len * cl) + 'px';
        // joystick -> WASD + giro
        playerInput.fwd = dy < -12; playerInput.back = dy > 12;
        playerInput.left = dx < -12; playerInput.right = dx > 12;
        if (Math.abs(dx) > 20) playerInput.yaw -= dx * 0.0006;
    }, { passive: true });
    window.addEventListener('touchend', () => {
        joyActive = false;
        stick.style.left = '31px'; stick.style.top = '31px';
        playerInput.fwd = playerInput.back = playerInput.left = playerInput.right = false;
    });
    document.querySelectorAll('#touch-buttons button').forEach(b => {
        b.addEventListener('touchstart', (e) => {
            const a = b.getAttribute('data-act');
            if (a === 'fire') playerShoot();
            if (a === 'grenade') playerThrowGrenade();
            if (a === 'interact') playerInteract();
            if (a === 'build') toggleBuildMenu();
            if (a === 'heal') playerHealAlly();
            if (a === 'rally') playerRally();
            e.preventDefault();
        }, { passive: false });
    });
    // Deslizar para girar cámara en movil
    let lastTX = 0;
    const cv = document.getElementById('canvas-container');
    if (cv) {
        cv.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && isParticipantActive()) {
                const t = e.touches[0];
                if (lastTX) playerInput.yaw -= (t.clientX - lastTX) * 0.005;
                lastTX = t.clientX;
            }
        }, { passive: true });
        cv.addEventListener('touchend', () => { lastTX = 0; }, { passive: true });
    }
}

// Refresca menú al abrir el juego
try { window.addEventListener('load', () => { menuMarkActive(); }); } catch (e) {}
