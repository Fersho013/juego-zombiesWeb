/**
 * config.js - Configuracion global y estado del juego.
   Edita aqui oleadas, recursos, zonas y tipos de zombie.
 * Parte del proyecto Survivors VS Zombies 3D.
 * Variables globales definidas en js/config.js.
 */

// GLOBAL GAME CONFIGURATION & STATE
        // ==========================================================
        let gameSpeed = 1; // 0=Pausa, 1=1x, 2=2x, 5=5x
        let cameraMode = 'orbit'; // 'orbit', 'base', 'follow'
        let currentWave = 1;
        let isWaveActive = false;
        let waveTimer = 180; // 3 minutos de preparación
        let waveTimerInterval = null;
        let zombiesToSpawn = 0;
        let zombiesAliveCount = 0;
        let frameDelta = 0.016; // delta del último frame, usado para suavizar giros/animaciones
        let camShelterCycleIndex = 0; // para ciclar cámara entre refugios activos

        // Three.js Core Variables
        let scene, camera, renderer, controls;
        let ambientLight, sunLight;
        let clock = new THREE.Clock();

        // ==========================================================
        // CITY MAP ZONES / REFUGIOS (soporta múltiples refugios activos)
        // ==========================================================
        const ZONES = {
            MALL: { key: 'MALL', name: 'Centro Comercial', pos: new THREE.Vector3(0, 0, 0), radius: 22, intact: true, isActiveShelter: false, health: 100, turret: null, turretMesh: null },
            HOUSES: { key: 'HOUSES', name: 'Casas Residenciales', pos: new THREE.Vector3(0, 0, -65), radius: 20, intact: true, isActiveShelter: false, health: 100, turret: null, turretMesh: null },
            PARK: { key: 'PARK', name: 'Parque Central', pos: new THREE.Vector3(-60, 0, 0), radius: 20, intact: true, isActiveShelter: false, health: 100, turret: null, turretMesh: null },
            PARKING: { key: 'PARKING', name: 'Estacionamiento Amplio', pos: new THREE.Vector3(60, 0, 0), radius: 22, intact: true, isActiveShelter: false, health: 100, turret: null, turretMesh: null }
        };

        // Refugios actualmente ocupados/defendidos por los supervivientes (puede ser >1 a la vez)
        let activeShelterKeys = ['MALL'];

        // Stockpile compartido de recursos entre todos los refugios
        const baseResources = {
            ammo: 2,
            meds: 2,
            food: 2,
            heavy: 2
        };

        // ==========================================================
        // ZOMBIE TYPES: básico, mediano y grande
        // ==========================================================
        const ZOMBIE_TYPES = {
            BASIC:  { key: 'BASIC',  label: 'Rastrero',   scale: 1.0,  healthMult: 1.0, speedMult: 1.2,  damageMult: 1.0, bodyColor: 0x166534, headColor: 0x3f6212, eyeColor: 0xef4444, xp: 1 },
            MEDIUM: { key: 'MEDIUM', label: 'Corpulento',  scale: 1.45, healthMult: 2.8, speedMult: 0.82, damageMult: 1.9, bodyColor: 0x374151, headColor: 0x1f2937, eyeColor: 0xf97316, xp: 3 },
            LARGE:  { key: 'LARGE',  label: 'Titán',       scale: 2.1,  healthMult: 6.5, speedMult: 0.55, damageMult: 3.4, bodyColor: 0x450a0a, headColor: 0x1c0a0d, eyeColor: 0xfacc15, xp: 8 }
        };

        // Game Entities Collections
        const survivors = [];
        const zombies = [];
        const dyingZombies = [];
        const crates = [];
        const barricades = [];
        const projectiles = [];
        const particleEffects = [];

        // ==========================================================
        // ARSENAL / APOYO AEREO / COOLDOWNS (cambios serie 2)
        // ==========================================================
        // Catalogo de armas de fuego (dmg = [min,max])
        const WEAPONS = {
            PISTOL:  { key: 'PISTOL',  label: 'Pistola 9mm',      dmg: [12, 22], range: 18, cooldown: 0.38, color: 0xfde68a, sound: 'C3' },
            RIFLE:   { key: 'RIFLE',   label: 'Rifle de Asalto',  dmg: [22, 38], range: 30, cooldown: 0.20, color: 0xfde68a, sound: 'E3' },
            SHOTGUN: { key: 'SHOTGUN', label: 'Escopeta Cal.12',  dmg: [16, 26], range: 13, cooldown: 0.95, color: 0xfb923c, sound: 'A2', pellets: 5 },
            SNIPER:  { key: 'SNIPER',  label: 'Rifle Precision',  dmg: [70, 110], range: 42, cooldown: 1.40, color: 0x38bdf8, sound: 'G3' },
            SMG:     { key: 'SMG',     label: 'Subfusil',         dmg: [14, 24], range: 22, cooldown: 0.13, color: 0xfde68a, sound: 'D3' }
        };

        // Cooldown real (segundos) de intervenciones divinas + timestamps
        const INTERVENTION_COOLDOWN = 10;
        const interventionCooldowns = { airdrop: 0, artillery: 0, adrenaline: 0, barricade: 0 };
        let cooldownTickInterval = null;

        // Unidades aereas animadas (avion / helicoptero) y granadas con mecha
        const airUnits = [];
        const grenades = [];
        const missiles = [];

        // ==========================================================
        // TORRES / LOOT / CURACION (cambios serie 3)
        // ==========================================================
        const FIXED_STEP = 1 / 60; // simulacion a 60 fps fijos
        const TOWER_MAX = Infinity; // legacy global (ahora manda el limite por refugio)
        const TOWERS_PER_SHELTER = 3; // 3 torres alrededor por refugio
        const TOWERS_PER_CUSTOM = 6; // refugio creado desde 0: 3 techo + 3 perimetro
        const MAX_SURVIVORS_HARD = 50;
        const TOWER_WORK_REQUIRED = 400; // segundos-trabajador por torre
        const TOWER_HEIGHT = 8.4; // altura de la plataforma
        const TOWER_HP = 400;
        const BARRICADES_PER_SURVIVOR = 4; // maximo por superviviente
        const LOOT_CHANCE = 0.22; // prob. de que un zombie suelte loot
        const LOOT_DESPAWN = 45; // segundos antes de que el loot caduque
        const towers = []; // {id, mesh, pos, zoneKey, progress, complete, health, occupants[]}
        const loots = []; // pickups dejados por zombies {mesh, kind, payload, position, age}
        const healFX = []; // cruces verdes flotantes
        let towerSeq = 0;

        // ==========================================================
        // REFUGIO PRINCIPAL / MUROS / GAME OVER (cambios serie 4)
        // ==========================================================
        let mainShelterKey = 'MALL'; // refugio principal: obras principales
        const walls = []; // muros de casas-refugio {mesh, health, maxHealth, position, shelterKey}
        let shelterFounder = null; // {zoneKey, progress, required}
        const SHELTER_FOUND_COST = { ammo: 2, food: 1 };
        const SHELTER_FOUND_WORK = 120; // segundos-trabajador para levantar la casa
        const WALL_HP = 150;
        let gameOverActive = false;
        let prevGameSpeed = 1;

        let selectedSurvivorIndex = 0;

        // ==========================================================
        // TAREA GRUPAL / HUIDA EN EQUIPO / SOLICITUDES (serie 5)
        // ==========================================================
        // Todos trabajan en la misma obra hasta terminarla antes de otra.
        // Orden oficial: 1 MAIN > 2 FOUND/TURRET-BASE > 3 COLLECT > 4 REPAIR(1 a la vez 100%) > 5 FIRST-TOWER > 6 REQUEST > 7 MORE-TOWERS
        let groupTask = null; // {kind:'repair'|'found'|'tower'|'turret-base'|'collect', key, siteId}
        let orderPhase = 'MAIN'; // fase actual del plan (solo informativo + bloqueo)
        const ORDER_MIN_SHELTERS = 2; // paso 2: al menos 2 refugios
        const ORDER_MIN_TURRETS = 2; // paso 2: al menos 2 torretas base
        // Huida conjunta: un solo destino compartido + offsets de formacion.
        let groupFlee = null; // {pos:Vector3, zoneKey}
        // Solicitudes del equipo ("El superviviente necesita...").
        const survivorRequests = { supply: false, airstrike: false, reinforce: false };
        const survivorRequestCooldowns = { supply: 0, airstrike: 0, reinforce: 0 };
        const SURVIVOR_REQUEST_COOLDOWN = 60; // segundos entre alertas del mismo tipo

        // ==========================================================
        // COLISIONES / PUERTAS / FORTALEZA (serie 6)
        // ==========================================================
        const colliders = []; // {pos:Vector3, radius, ref, kind:'wall'|'barricade'|'tower'|'env'|'door', destructible:bool, hp}
        const doors = []; // {mesh, position, shelterKey, health, maxHealth}
        const customShelters = {}; // zoneKey -> true si fue creado desde 0
        const shelterLevels = {}; // zoneKey -> 1 mini-casa | 2 casa | 3 fortaleza
        function towerLimitForShelter(zoneKey) {
            return customShelters[zoneKey] ? TOWERS_PER_CUSTOM : TOWERS_PER_SHELTER;
        }
        function countTowersForShelter(zoneKey) {
            return towers.filter(t => t.zoneKey === zoneKey).length;
        }
        function countRoofTowers(zoneKey) {
            return towers.filter(t => t.zoneKey === zoneKey && t.roof).length;
        }
        function getMaxSurvivors() {
            const n = activeShelterKeys.length;
            if (n < 3) return 5;
            return Math.min(MAX_SURVIVORS_HARD, 5 + (n - 2) * 2); // 3->7, 4->9, 5->11...
        }
        function registerCollider(pos, radius, ref, kind, destructible) {
            const c = { pos: pos, radius: radius, ref: ref, kind: kind, destructible: !!destructible };
            colliders.push(c);
            return c;
        }
        function unregisterColliderForRef(ref) {
            for (let i = colliders.length - 1; i >= 0; i--) {
                if (colliders[i].ref === ref) colliders.splice(i, 1);
            }
        }
        // Colision circular simple: empuja fuera de colliders solidos.
        // Las puertas de supervivientes NO bloquean a supervivientes (solo zombies).
        function isColliderSolidFor(c, isSurvivor) {
            if (c.kind === 'door') return !isSurvivor; // supervivientes pasan, zombies no
            return true;
        }
        function resolveEntityCollisions(entity, isSurvivor) {
            if (!entity || !entity.position) return;
            for (const c of colliders) {
                if (!isColliderSolidFor(c, isSurvivor)) continue;
                if (c.ref && c.ref.health !== undefined && c.ref.health <= 0) continue;
                if (c.ref && c.ref.hp !== undefined && c.ref.hp <= 0) continue;
                const dx = entity.position.x - c.pos.x;
                const dz = entity.position.z - c.pos.z;
                const d = Math.hypot(dx, dz);
                const minD = c.radius + 0.5;
                if (d < minD && d > 0.001) {
                    const push = (minD - d);
                    entity.position.x += (dx / d) * push;
                    entity.position.z += (dz / d) * push;
                } else if (d <= 0.001) {
                    entity.position.x += minD;
                }
            }
        }
        // Movimiento con rodeo: si choca de frente, desliza lateral ( elected ).
        // Devuelve true si avanzo.
        function tryMoveWithCollisions(entity, targetPos, step, isSurvivor) {
            const ox = entity.position.x, oz = entity.position.z;
            const dir = new THREE.Vector3().subVectors(targetPos, entity.position);
            dir.y = 0;
            if (dir.length() < 0.15) return false;
            dir.normalize();
            entity.position.x += dir.x * step;
            entity.position.z += dir.z * step;
            resolveEntityCollisions(entity, isSurvivor);
            // Si casi no avanzo (bloqueado), intenta rodear en perpendicular.
            const moved = Math.hypot(entity.position.x - ox, entity.position.z - oz);
            if (moved < step * 0.3) {
                const side = new THREE.Vector3(-dir.z, 0, dir.x);
                entity.position.x = ox + side.x * step;
                entity.position.z = oz + side.z * step;
                resolveEntityCollisions(entity, isSurvivor);
                const moved2 = Math.hypot(entity.position.x - ox, entity.position.z - oz);
                if (moved2 < step * 0.3) {
                    entity.position.x = ox - side.x * step;
                    entity.position.z = oz - side.z * step;
                    resolveEntityCollisions(entity, isSurvivor);
                }
            }
            return true;
        }

        // Hitbox propia por unidad: nadie se apila (mundo + compañeros).
        const ENTITY_RADIUS = 0.55;
        function separateEntities() {
            // Supervivientes entre si + contra zombies vivos.
            for (let i = 0; i < survivors.length; i++) {
                const a = survivors[i];
                if (!a || a.health <= 0 || !a.position) continue;
                for (let j = i + 1; j < survivors.length; j++) {
                    const b = survivors[j];
                    if (!b || b.health <= 0 || !b.position) continue;
                    pushApart(a, b, ENTITY_RADIUS * 2);
                }
                for (const z of zombies) {
                    if (!z || z.health <= 0 || z.dying || !z.position) continue;
                    pushApart(a, z, ENTITY_RADIUS * 2);
                }
            }
            // Zombies entre si (solo vivos, radio segun escala).
            for (let i = 0; i < zombies.length; i++) {
                const a = zombies[i];
                if (!a || a.health <= 0 || a.dying || !a.position) continue;
                const ra = ENTITY_RADIUS * (a.mesh ? a.mesh.scale.x : 1);
                for (let j = i + 1; j < zombies.length; j++) {
                    const b = zombies[j];
                    if (!b || b.health <= 0 || b.dying || !b.position) continue;
                    const rb = ENTITY_RADIUS * (b.mesh ? b.mesh.scale.x : 1);
                    pushApart(a, b, ra + rb);
                }
            }
            // Re-resolver contra el mundo tras separar (escombros incluidos).
            for (const s of survivors) {
                if (s && s.health > 0) resolveEntityCollisions(s, true);
            }
            for (const z of zombies) {
                if (z && z.health > 0 && !z.dying) resolveEntityCollisions(z, false);
            }
        }
        function pushApart(a, b, minD) {
            const dx = b.position.x - a.position.x;
            const dz = b.position.z - a.position.z;
            const d = Math.hypot(dx, dz);
            if (d >= minD || d < 0.001) {
                if (d < 0.001) { b.position.x += minD / 2; b.position.z += minD / 2; a.position.x -= minD / 2; a.position.z -= minD / 2; }
                return;
            }
            const push = (minD - d) / 2;
            const nx = dx / d, nz = dz / d;
            a.position.x -= nx * push; a.position.z -= nz * push;
            b.position.x += nx * push; b.position.z += nz * push;
        }

        // Audio Synthesizer Engine
        let synthGun, synthExplosion, synthPickup, synthZombie, synthTurret;
