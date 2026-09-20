/**
 * audio.js - Motor de sonido (Tone.js). Agrega nuevos efectos aqui.
 * Parte del proyecto Survivors VS Zombies 3D.
 * Variables globales definidas en js/config.js.
 */

function initAudioEngine() {
            if (window.Tone && !synthGun) {
                try {
                    Tone.start();
                    synthGun = new Tone.PolySynth(Tone.Synth, {
                        oscillator: { type: 'triangle' },
                        envelope: { attack: 0.005, decay: 0.05, sustain: 0, release: 0.05 }
                    }).toDestination();
                    synthGun.volume.value = -12;

                    synthExplosion = new Tone.NoiseSynth({
                        noise: { type: 'brown' },
                        envelope: { attack: 0.01, decay: 0.4, sustain: 0 }
                    }).toDestination();
                    synthExplosion.volume.value = -6;

                    synthPickup = new Tone.Synth({
                        oscillator: { type: 'sine' },
                        envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.2 }
                    }).toDestination();
                    synthPickup.volume.value = -10;

                    synthZombie = new Tone.Synth({
                        oscillator: { type: 'sawtooth' },
                        envelope: { attack: 0.1, decay: 0.3, sustain: 0.2, release: 0.3 }
                    }).toDestination();
                    synthZombie.volume.value = -18;

                    synthTurret = new Tone.Synth({
                        oscillator: { type: 'square' },
                        envelope: { attack: 0.002, decay: 0.04, sustain: 0, release: 0.03 }
                    }).toDestination();
                    synthTurret.volume.value = -16;
                } catch(e) {}
            }
        }

        function playSound(type, pitch = 'C3') {
            if (!window.Tone) return;
            try {
                if (!synthGun) initAudioEngine();
                if (type === 'gun') synthGun.triggerAttackRelease(pitch, '16n');
                else if (type === 'turret') synthTurret.triggerAttackRelease(pitch, '32n');
                else if (type === 'explosion') synthExplosion.triggerAttackRelease('8n');
                else if (type === 'pickup') synthPickup.triggerAttackRelease('E5', '8n');
                else if (type === 'zombie') synthZombie.triggerAttackRelease('G2', '4n');
            } catch(e) {}
        }
