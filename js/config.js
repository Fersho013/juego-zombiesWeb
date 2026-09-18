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

        let selectedSurvivorIndex = 0;

        // Audio Synthesizer Engine
        let synthGun, synthExplosion, synthPickup, synthZombie, synthTurret;
