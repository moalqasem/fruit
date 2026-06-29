import { canvasManagerInstance, initCanvasManager } from './canvas-instance.js';
import { handTracker } from './hand-tracker.js';
import { Game } from './game.js';
import { audio } from './audio.js';

// Setup Game Instance
let game = null;

// State variables
let animationFrameId = null;

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  initApp();
});

/**
 * Initializes DOM bindings, configures viewport sizes, and loads settings
 */
function initApp() {
  // Initialize canvas manager instance dynamically
  initCanvasManager();

  // Setup Game Instance
  game = new Game(canvasManagerInstance, handTracker);

  // 1. Calibrate canvas dimensions
  canvasManagerInstance.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () => {
    canvasManagerInstance.resize(window.innerWidth, window.innerHeight);
  });

  // 2. Load settings from localStorage
  loadSavedSettings();

  // 3. Bind UI interactions
  setupMenuBindings();
  setupSettingsBindings();
  setupGameplayBindings();
  setupGameOverBindings();

  // 4. Render main menu
  showScreen('mainMenuScreen');
  renderLeaderboardMini();

  // 5. Hide initial loader screen
  const initialLoader = document.getElementById('loadingScreen');
  if (initialLoader) {
    initialLoader.classList.add('hidden');
    initialLoader.classList.remove('active');
  }
}

/**
 * Helper to display a specific overlay screen and hide others
 */
function showScreen(screenId) {
  const screens = ['loadingScreen', 'mainMenuScreen', 'settingsScreen', 'gameOverScreen'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === screenId) {
        el.classList.remove('hidden');
        el.classList.add('active');
      } else {
        el.classList.add('hidden');
        el.classList.remove('active');
      }
    }
  });

  // Show/Hide gameplay HUD
  const hud = document.getElementById('gameplayHud');
  if (hud) {
    if (screenId === 'playing') {
      hud.classList.remove('hidden');
    } else {
      hud.classList.add('hidden');
    }
  }
}

/**
 * Loads cached values from localStorage
 */
function loadSavedSettings() {
  try {
    const volume = localStorage.getItem('gesture_ninja_vol');
    if (volume !== null) {
      const volVal = parseInt(volume);
      document.getElementById('volumeSlider').value = volVal;
      audio.setVolume(volVal / 100);
    }

    const music = localStorage.getItem('gesture_ninja_bgm');
    if (music !== null) {
      const isMusic = music === 'true';
      document.getElementById('musicToggle').checked = isMusic;
      audio.setMusicEnabled(isMusic);
    }

    const mirror = localStorage.getItem('gesture_ninja_mirror');
    if (mirror !== null) {
      const isMirrored = mirror === 'true';
      document.getElementById('mirrorWebcamToggle').checked = isMirrored;
      handTracker.mirror = isMirrored;
      
      const mainVid = document.getElementById('webcamVideo');
      const prevVid = document.getElementById('previewVideo');
      if (mainVid) {
        if (isMirrored) mainVid.classList.add('mirrored');
        else mainVid.classList.remove('mirrored');
      }
      if (prevVid) {
        if (isMirrored) prevVid.classList.add('mirrored');
        else prevVid.classList.remove('mirrored');
      }
    }

    const difficulty = localStorage.getItem('gesture_ninja_difficulty');
    if (difficulty !== null) {
      document.getElementById('difficultySelect').value = difficulty;
      game.difficulty = difficulty;
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
}

/**
 * Binds Start Menu events
 */
function setupMenuBindings() {
  // Mode cards selection
  const modeCards = document.querySelectorAll('.mode-card');
  modeCards.forEach(card => {
    card.addEventListener('click', () => {
      modeCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      game.mode = card.getAttribute('data-mode');
      
      // Update BGM tone loop pattern based on mode if music is running
      audio.resume();
      
      // Refresh leaderboard mini preview for selected mode
      renderLeaderboardMini();
    });
  });

  // Control toggle group buttons
  const ctrlWebcamBtn = document.getElementById('ctrlWebcamBtn');
  const ctrlMouseBtn = document.getElementById('ctrlMouseBtn');

  ctrlWebcamBtn.addEventListener('click', () => {
    ctrlWebcamBtn.classList.add('active');
    ctrlMouseBtn.classList.remove('active');
    game.controlType = 'webcam';
  });

  ctrlMouseBtn.addEventListener('click', () => {
    ctrlMouseBtn.classList.add('active');
    ctrlWebcamBtn.classList.remove('active');
    game.controlType = 'mouse';
  });

  // Settings trigger button
  document.getElementById('menuSettingsBtn').addEventListener('click', () => {
    audio.resume();
    document.getElementById('settingsScreen').classList.remove('hidden');
    document.getElementById('settingsScreen').classList.add('active');
  });

  // Start game trigger button
  document.getElementById('startGameBtn').addEventListener('click', () => {
    startGameSession();
  });
}

/**
 * Handles initialization process of starting the game (webcam vs mouse)
 */
async function startGameSession() {
  audio.resume();
  
  if (game.controlType === 'webcam') {
    // Show Loading model screen
    showScreen('loadingScreen');
    const statusText = document.getElementById('loadingStatusText');

    try {
      // 1. Initialize Hand Tracking
      await handTracker.init((statusMsg) => {
        statusText.textContent = statusMsg;
      });

      // 2. Start webcam camera feed
      statusText.textContent = "Connecting to webcam video...";
      const mainVid = document.getElementById('webcamVideo');
      const prevVid = document.getElementById('previewVideo');
      const overlayCanvas = document.getElementById('previewOverlayCanvas');

      await handTracker.startCamera(mainVid, prevVid, overlayCanvas);

      // Mirror settings class toggle and activate background video
      if (mainVid) {
        if (handTracker.mirror) mainVid.classList.add('mirrored');
        else mainVid.classList.remove('mirrored');
        mainVid.classList.add('active'); // Fade in fullscreen background!
      }
      if (prevVid) {
        if (handTracker.mirror) prevVid.classList.add('mirrored');
        else prevVid.classList.remove('mirrored');
      }

      // Show minimized corner camera box
      const camContainer = document.getElementById('cameraPreviewContainer');
      if (camContainer) {
        camContainer.classList.remove('hidden');
        document.getElementById('cameraStatusText').textContent = "CONNECTED";
        document.getElementById('cameraStatusText').className = "neon-text-green";
      }

    } catch (err) {
      console.warn("Hand tracking webcam setup failed:", err);
      alert("Could not access webcam. Falling back to mouse controls instead.");
      
      // Force fallback to Mouse
      game.controlType = 'mouse';
      const ctrlWebcamBtn = document.getElementById('ctrlWebcamBtn');
      const ctrlMouseBtn = document.getElementById('ctrlMouseBtn');
      if (ctrlWebcamBtn && ctrlMouseBtn) {
        ctrlWebcamBtn.classList.remove('active');
        ctrlMouseBtn.classList.add('active');
      }
    }
  }

  // Hide modal overlays and trigger game loop
  showScreen('playing');
  
  // Start game
  game.start(game.mode, game.controlType);
  
  // Kick off requestAnimationFrame tick
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  
  const gameLoopTick = (timestamp) => {
    game.tick(timestamp);
    animationFrameId = requestAnimationFrame(gameLoopTick);
  };
  animationFrameId = requestAnimationFrame(gameLoopTick);
}

/**
 * Binds settings modal events
 */
function setupSettingsBindings() {
  const saveBtn = document.getElementById('saveSettingsBtn');
  const volSlider = document.getElementById('volumeSlider');
  const musicToggle = document.getElementById('musicToggle');
  const mirrorToggle = document.getElementById('mirrorWebcamToggle');
  const difficultySel = document.getElementById('difficultySelect');

  saveBtn.addEventListener('click', () => {
    // Read and save settings values
    const volVal = parseInt(volSlider.value);
    audio.setVolume(volVal / 100);
    localStorage.setItem('gesture_ninja_vol', volVal);

    const musicVal = musicToggle.checked;
    audio.setMusicEnabled(musicVal);
    localStorage.setItem('gesture_ninja_bgm', musicVal);

    const mirrorVal = mirrorToggle.checked;
    handTracker.mirror = mirrorVal;
    localStorage.setItem('gesture_ninja_mirror', mirrorVal);

    const mainVid = document.getElementById('webcamVideo');
    const prevVid = document.getElementById('previewVideo');
    if (mainVid) {
      if (mirrorVal) mainVid.classList.add('mirrored');
      else mainVid.classList.remove('mirrored');
    }
    if (prevVid) {
      if (mirrorVal) prevVid.classList.add('mirrored');
      else prevVid.classList.remove('mirrored');
    }

    const diffVal = difficultySel.value;
    game.difficulty = diffVal;
    localStorage.setItem('gesture_ninja_difficulty', diffVal);

    // Hide Modal Screen
    document.getElementById('settingsScreen').classList.add('hidden');
    document.getElementById('settingsScreen').classList.remove('active');
  });
}

/**
 * Binds mouse fallback controllers to the canvas viewport
 */
function setupGameplayBindings() {
  const canvas = document.getElementById('gameCanvas');
  
  // Mouse listeners
  canvas.addEventListener('mousedown', (e) => {
    if (game.state !== 'playing' || game.controlType !== 'mouse') return;
    game.mouseActive = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    game.addTrailPoint('mouse', x, y);
  });

  canvas.addEventListener('mousemove', (e) => {
    if (game.state !== 'playing' || game.controlType !== 'mouse' || !game.mouseActive) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    game.addTrailPoint('mouse', x, y);
  });

  window.addEventListener('mouseup', () => {
    game.mouseActive = false;
    // Clear trail when mouse is lifted
    if (game.activeTrails['mouse']) {
      delete game.activeTrails['mouse'];
    }
  });

  // Touch listener supports for mobile/tablets
  canvas.addEventListener('touchstart', (e) => {
    if (game.state !== 'playing' || game.controlType !== 'mouse') return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    game.addTrailPoint('mouse', x, y);
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (game.state !== 'playing' || game.controlType !== 'mouse') return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    game.addTrailPoint('mouse', x, y);
  }, { passive: true });

  canvas.addEventListener('touchend', () => {
    if (game.activeTrails['mouse']) {
      delete game.activeTrails['mouse'];
    }
  });
}

/**
 * Binds Game Over Screen actions
 */
function setupGameOverBindings() {
  const submitBtn = document.getElementById('submitScoreBtn');
  const nameInput = document.getElementById('playerNameInput');
  
  // Submit initials
  submitBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || 'AAA';
    game.submitScore(name, game.score, game.mode);
    
    // Hide form container
    const entryForm = document.querySelector('.highscore-entry-container');
    if (entryForm) {
      entryForm.style.display = 'none';
    }
    
    // Return focus or visual confirmation
    alert("Score submitted!");
    renderLeaderboardMini();
  });

  // Restart game session
  document.getElementById('restartGameBtn').addEventListener('click', () => {
    // Reset highscore entry panel
    const entryForm = document.querySelector('.highscore-entry-container');
    if (entryForm) {
      entryForm.style.display = 'flex';
    }
    nameInput.value = '';
    
    startGameSession();
  });

  // Return to main menu
  document.getElementById('exitToMenuBtn').addEventListener('click', () => {
    // Stop camera feed to save laptop battery and resources
    handTracker.stopCamera();
    
    // Hide fullscreen background video
    const mainVid = document.getElementById('webcamVideo');
    if (mainVid) {
      mainVid.classList.remove('active');
    }

    // Hide preview camera container
    const camContainer = document.getElementById('cameraPreviewContainer');
    if (camContainer) {
      camContainer.classList.add('hidden');
    }

    // Stop animation frame tick
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // Reset highscore entry panel visibility
    const entryForm = document.querySelector('.highscore-entry-container');
    if (entryForm) {
      entryForm.style.display = 'flex';
    }
    nameInput.value = '';

    // Show menu
    game.state = 'menu';
    showScreen('mainMenuScreen');
    renderLeaderboardMini();
  });
}

/**
 * Populates mini leaderboard scores on the start screen
 */
function renderLeaderboardMini() {
  const listDiv = document.getElementById('leaderboardMiniList');
  if (!listDiv) return;

  listDiv.innerHTML = '';
  const scores = game.leaderboard[game.mode] || [];

  if (scores.length === 0) {
    const emptyRow = document.createElement('div');
    emptyRow.className = 'leaderboard-row text-center';
    emptyRow.style.justifyContent = 'center';
    emptyRow.textContent = 'NO HIGH SCORES YET';
    listDiv.appendChild(emptyRow);
    return;
  }

  scores.forEach((entry, idx) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    
    const rankSpan = document.createElement('span');
    rankSpan.className = 'leaderboard-rank';
    rankSpan.textContent = `#${idx + 1}`;
    
    // Rank medal aesthetics
    if (idx === 0) rankSpan.style.color = 'var(--neon-yellow)';
    else if (idx === 1) rankSpan.style.color = '#8f9cae'; // silver
    else if (idx === 2) rankSpan.style.color = '#cd7f32'; // bronze
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'leaderboard-name';
    nameSpan.textContent = entry.name.toUpperCase();
    
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'leaderboard-score';
    scoreSpan.textContent = entry.score;

    row.appendChild(rankSpan);
    row.appendChild(nameSpan);
    row.appendChild(scoreSpan);
    listDiv.appendChild(row);
  });
}
