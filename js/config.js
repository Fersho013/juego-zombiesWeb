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
        const TOWER_MAX = Infinity; // torres ilimitadas: construyen todas las que puedan
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

        // Audio Synthesizer Engine
        let synthGun, synthExplosion, synthPickup, synthZombie, synthTurret;
