/**
 * ui.js - HUD, paneles, bitacora, camara y velocidad.
   Agrega aqui nuevos controles de interfaz.
 * Parte del proyecto Survivors VS Zombies 3D.
 * Variables globales definidas en js/config.js.
 */

// UI / HUD
        // ==========================================================
        function renderSurvivorTabs() {
            const container = document.getElementById('survivor-selector-list');
            container.innerHTML = '';

            survivors.forEach((s, idx) => {
                const btn = document.createElement('button');
                btn.onclick = () => inspectSurvivor(idx);
                btn.className = `p-2 rounded-2xl flex flex-col items-center justify-center transition border ${selectedSurvivorIndex === idx ? 'bg-red-600/30 border-red-500 text-white' : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800'} ${s.health <= 0 ? 'opacity-40' : ''}`;
                btn.innerHTML = `
                    <div class="w-7 h-7 rounded-xl flex items-center justify-center font-extrabold text-xs text-slate-950 mb-1" style="background-color: #${s.colorHex.toString(16)}">
                        ${s.name.charAt(0)}
                    </div>
                    <span class="text-[9px] font-bold truncate max-w-full">${s.name}</span>
                `;
                container.appendChild(btn);
            });
        }

        function inspectSurvivor(index) {
            selectedSurvivorIndex = index;
            renderSurvivorTabs();
            updateUI();

            if (cameraMode === 'follow') {
                const s = survivors[selectedSurvivorIndex];
                if (s) controls.target.copy(s.position);
            }
        }

        function renderSheltersPanel() {
            const container = document.getElementById('shelters-panel-container');
            if (!container) return;
            container.innerHTML = '';

            const badge = document.getElementById('shelters-count-badge');
            if (badge) badge.innerText = activeShelterKeys.length;

            activeShelterKeys.forEach(key => {
                const zone = ZONES[key];
                const garrison = countAliveGarrison(key);
                const turretLabel = zone.turret ? (zone.turret.improvised ? 'Improvisada' : 'Pesada') : 'Sin torreta';
                const healthColor = zone.health > 50 ? 'bg-emerald-500' : zone.health > 20 ? 'bg-amber-500' : 'bg-rose-600';

                const card = document.createElement('div');
                card.className = 'space-y-1 text-xs bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800';
                card.innerHTML = `
                    <div class="flex justify-between items-center text-[10px]">
                        <span class="text-cyan-300 font-bold truncate">${zone.name}</span>
                        <span class="text-slate-400">${garrison} <i class="fa-solid fa-user-shield"></i></span>
                    </div>
                    <div class="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div class="h-full ${healthColor} transition-all duration-300" style="width: ${Math.max(0, zone.health)}%"></div>
                    </div>
                    <div class="flex justify-between text-[9px] text-slate-400">
                        <span><i class="fa-solid fa-tower-observation mr-1"></i>${turretLabel}</span>
                        <span>${Math.round(zone.health)}%</span>
                    </div>
                `;
                container.appendChild(card);
            });
        }

        function updateUI() {
            document.getElementById('wave-number-display').innerText = currentWave;
            document.getElementById('zombie-count-display').innerText = `${zombiesAliveCount} / ${zombiesToSpawn}`;

            if (!isWaveActive) {
                const mins = Math.floor(waveTimer / 60);
                const secs = Math.floor(waveTimer % 60);
                document.getElementById('phase-text').innerText = `Búsqueda (${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')})`;
            }

            // Recursos compartidos de la reserva
            document.getElementById('res-ammo-val').innerText = baseResources.ammo;
            document.getElementById('res-med-val').innerText = baseResources.meds;
            document.getElementById('res-food-val').innerText = baseResources.food;
            document.getElementById('res-heavy-val').innerText = baseResources.heavy;

            renderSheltersPanel();

            const s = survivors[selectedSurvivorIndex];
            if (s) {
                document.getElementById('survivor-name-display').innerText = s.name;
                document.getElementById('survivor-role-badge').innerText = s.role;
                document.getElementById('survivor-weapon-display').innerText = `Arma: ${s.weapon}`;
                document.getElementById('survivor-state-display').innerText = s.health <= 0 ? 'Caído en combate' : s.thoughtText;

                document.getElementById('val-health').innerText = `${Math.round(s.health)} / ${s.maxHealth}`;
                document.getElementById('bar-health').style.width = `${Math.max(0, (s.health / s.maxHealth) * 100)}%`;

                document.getElementById('val-stamina').innerText = `${Math.round(s.stamina)}%`;
                document.getElementById('bar-stamina').style.width = `${s.stamina}%`;

                document.getElementById('val-ammo').innerText = `${s.ammo} rds`;
                document.getElementById('bar-ammo').style.width = `${Math.min(100, (s.ammo / 120) * 100)}%`;

                document.getElementById('survivor-melee-val').innerText = s.melee;
                document.getElementById('survivor-heavy-val').innerText = s.heavy;
                document.getElementById('survivor-crate-val').innerText = s.carriedCrate ? s.carriedCrate.config.name : 'Ninguna (Manos Libres)';
                document.getElementById('survivor-kills-val').innerText = s.kills;

                document.getElementById('survivor-avatar-icon').style.backgroundColor = `#${s.colorHex.toString(16)}`;
            }

            updateFloatingThoughtBubbles();
        }

        function updateFloatingThoughtBubbles() {
            const container = document.getElementById('thought-bubbles-container');
            container.innerHTML = '';

            survivors.forEach(s => {
                if (s.health <= 0) return;

                const tempV = s.position.clone().add(new THREE.Vector3(0, 2.5, 0));
                tempV.project(camera);

                const x = (tempV.x * .5 + .5) * window.innerWidth;
                const y = (-(tempV.y * .5) + .5) * window.innerHeight;

                if (tempV.z < 1) {
                    const bubble = document.createElement('div');
                    bubble.className = 'thought-bubble glass-panel px-2.5 py-1 rounded-xl text-[10px] font-bold text-slate-200 border border-slate-700 shadow-xl flex items-center gap-1.5';
                    bubble.style.left = `${x}px`;
                    bubble.style.top = `${y}px`;
                    bubble.innerHTML = `
                        <div class="w-2 h-2 rounded-full" style="background-color: #${s.colorHex.toString(16)}"></div>
                        <span>${s.name}: ${s.thoughtText}</span>
                    `;
                    container.appendChild(bubble);
                }
            });
        }

        function setSpeed(speed) {
            gameSpeed = speed;
            [0, 1, 2, 5].forEach(sp => {
                const btn = document.getElementById(`btn-speed-${sp}`);
                if (btn) {
                    if (sp === speed) btn.className = 'w-8 h-8 rounded-xl bg-red-600 text-white font-bold text-xs flex items-center justify-center';
                    else btn.className = 'w-8 h-8 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold text-xs flex items-center justify-center';
                }
            });
        }

        function setCameraMode(mode) {
            if (mode === 'base' && cameraMode === 'base') {
                // Ciclar entre los refugios activos en clics sucesivos
                camShelterCycleIndex = (camShelterCycleIndex + 1) % Math.max(1, activeShelterKeys.length);
            } else {
                camShelterCycleIndex = 0;
            }
            cameraMode = mode;

            if (mode === 'base') {
                const key = activeShelterKeys[camShelterCycleIndex] || 'MALL';
                const zone = ZONES[key];
                controls.target.copy(zone.pos);
                camera.position.set(zone.pos.x, 35, zone.pos.z + 45);
            } else if (mode === 'follow') {
                const s = survivors[selectedSurvivorIndex];
                if (s) controls.target.copy(s.position);
            }
        }

        function addLogEvent(msg) {
            const container = document.getElementById('sim-log-container');
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const item = document.createElement('div');
            item.innerHTML = `<span class="text-red-400 font-bold">[${timeStr}]</span> ${msg}`;
            container.appendChild(item);
            container.scrollTop = container.scrollHeight;
        }

        function showToast(text) {
            const toast = document.getElementById('toast-message');
            document.getElementById('toast-text').innerText = text;
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 3500);
        }
