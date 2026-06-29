import { Fruit, Bomb, Particle, Splat } from './entities.js';
import { audio } from './audio.js';

/**
 * Game Core Engine
 * Coordinates physics updates, entity spawners, collision handling, combos,
 * timers, game state transitions, and difficulty scaling.
 */
export class Game {
  constructor(canvasManager, handTracker) {
    this.canvasManager = canvasManager;
    this.handTracker = handTracker;
    
    // Game state
    this.state = 'menu'; // 'menu', 'playing', 'gameover'
    this.mode = 'classic'; // 'classic', 'arcade', 'zen'
    this.controlType = 'webcam'; // 'webcam', 'mouse'
    this.difficulty = 'normal';
    
    // Play stats
    this.score = 0;
    this.fruitsSliced = 0;
    this.lives = 3;
    this.remainingTime = 60; // seconds
    this.gameStartTime = 0;
    this.timeElapsed = 0;
    
    // Lists of active entities
    this.fruits = [];
    this.bombs = [];
    this.particles = [];
    this.splats = [];
    this.floatingTexts = [];
    this.blastRings = [];
    
    // Tracking swipe coordinates
    this.activeTrails = {}; // Key: pointer ID, Value: Array of {x, y, time}
    this.mouseActive = false;
    
    // Spawn timings
    this.spawnTimer = 0;
    this.spawnInterval = 100; // frames between launches
    this.difficultyMultiplier = 1.0;
    
    // Combo detection system
    this.comboBuffer = []; // list of timestamps of slices in the active sweep
    this.comboTimeout = null;
    this.currentComboCount = 0;
    this.maxCombo = 0;
    
    // High Scores list (saved to local storage)
    this.leaderboard = this.loadLeaderboard();
  }

  /**
   * Resets all stats and starts a new game round
   * @param {string} mode - 'classic', 'arcade', 'zen'
   * @param {string} controlType - 'webcam', 'mouse'
   */
  start(mode, controlType) {
    this.state = 'playing';
    this.mode = mode;
    this.controlType = controlType;
    
    // Reset stats
    this.score = 0;
    this.fruitsSliced = 0;
    this.maxCombo = 0;
    this.fruits = [];
    this.bombs = [];
    this.particles = [];
    this.splats = [];
    this.floatingTexts = [];
    this.blastRings = [];
    this.activeTrails = {};
    this.gameStartTime = performance.now();
    this.timeElapsed = 0;
    this.spawnTimer = 0;
    
    // Set parameters based on mode
    if (this.mode === 'classic') {
      this.lives = 3;
      this.remainingTime = 0; // infinite timer (lives count)
      this.spawnInterval = 120;
    } else if (this.mode === 'arcade') {
      this.lives = 0;
      this.remainingTime = 60; // 60s countdown
      this.spawnInterval = 90;
    } else { // zen
      this.lives = 0;
      this.remainingTime = 90; // 90s countdown
      this.spawnInterval = 80;
    }

    // Set starting speed according to settings difficulty
    if (this.difficulty === 'easy') {
      this.difficultyMultiplier = 0.8;
      this.spawnInterval *= 1.3;
    } else if (this.difficulty === 'hard') {
      this.difficultyMultiplier = 1.25;
      this.spawnInterval *= 0.8;
    } else {
      this.difficultyMultiplier = 1.0;
    }

    // UI Updates
    this.updateHud();
    
    // Make sure AudioContext is running
    audio.resume();
  }

  /**
   * Main game loop step, called ~60 times per second
   * @param {number} timestamp - RequestAnimationFrame DOMHighResTimeStamp
   */
  tick(timestamp) {
    if (this.state !== 'playing') return;

    this.timeElapsed = (timestamp - this.gameStartTime) / 1000;
    
    // Update Timer Countdown
    if (this.mode !== 'classic') {
      const timeLeft = Math.max(0, (this.mode === 'arcade' ? 60 : 90) - this.timeElapsed);
      
      // Update local storage / display
      this.remainingTime = Math.ceil(timeLeft);
      this.updateHud();

      if (timeLeft <= 0) {
        this.endGame();
        return;
      }
    }

    // 1. Scale Difficulty dynamically as time goes on
    this.scaleDifficulty();

    // 2. Fetch Hand gestures if webcam mode is enabled
    if (this.controlType === 'webcam') {
      const pointers = this.handTracker.detectHands(timestamp, this.canvasManager.width, this.canvasManager.height);
      
      // Clear stale trail caches
      const activeIds = pointers.map(p => p.id);
      Object.keys(this.activeTrails).forEach(id => {
        if (!activeIds.includes(parseInt(id))) {
          delete this.activeTrails[id];
        }
      });

      // Update trails and run slice calculations
      pointers.forEach(pointer => {
        this.addTrailPoint(pointer.id, pointer.x, pointer.y);
      });
    }

    // 3. Spawning wave management
    this.manageSpawns();

    // 4. Update and Draw physics entities
    this.canvasManager.clear();
    
    this.updateSplats();
    this.updateFruits();
    this.updateBombs();
    this.updateParticles();
    this.updateBlastRings();
    this.updateFloatingTexts();
    this.drawSwipeTrails();
    
    this.canvasManager.restore();
  }

  /**
   * Gradually increases spawn frequencies and speeds as the round progresses
   */
  scaleDifficulty() {
    // Increase difficulty factor by 5% every 10 seconds of gameplay
    const ageFactor = 1.0 + Math.floor(this.timeElapsed / 10) * 0.06;
    
    if (this.mode === 'classic') {
      this.difficultyMultiplier = ageFactor * (this.difficulty === 'hard' ? 1.25 : this.difficulty === 'easy' ? 0.8 : 1.0);
      this.spawnInterval = Math.max(45, 120 / this.difficultyMultiplier);
    } else if (this.mode === 'arcade') {
      this.difficultyMultiplier = ageFactor * (this.difficulty === 'hard' ? 1.25 : this.difficulty === 'easy' ? 0.8 : 1.0);
      this.spawnInterval = Math.max(35, 90 / this.difficultyMultiplier);
    } else { // zen (faster spawns, no bombs)
      this.difficultyMultiplier = ageFactor * (this.difficulty === 'hard' ? 1.25 : this.difficulty === 'easy' ? 0.8 : 1.0);
      this.spawnInterval = Math.max(30, 80 / this.difficultyMultiplier);
    }
  }

  /**
   * Spawns physical fruit/bomb waves at randomized intervals
   */
  manageSpawns() {
    this.spawnTimer++;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      
      // Determine size of spawn group (1 to 3 items)
      const r = Math.random();
      let groupSize = 1;
      if (r > 0.85) groupSize = 3;
      else if (r > 0.55) groupSize = 2;

      // In hard difficulty, increase spawn group sizes
      if (this.difficulty === 'hard' && Math.random() > 0.6) {
        groupSize++;
      }

      for (let i = 0; i < groupSize; i++) {
        // Stagger X coordinates to avoid overlapping clusters
        const xPos = this.canvasManager.width * (0.15 + (i * 0.7) / Math.max(1, groupSize - 1) + (Math.random() - 0.5) * 0.1);
        const yPos = this.canvasManager.height + 60; // Launch from below view

        // Check if bomb should be spawned (only Classic and Arcade modes)
        let isBomb = false;
        if (this.mode !== 'zen') {
          // Base bomb chance: 15%, scales up with time up to 35%
          let bombChance = 0.15 + (this.timeElapsed / 100);
          if (this.difficulty === 'hard') bombChance += 0.08;
          if (this.difficulty === 'easy') bombChance -= 0.06;
          
          isBomb = (Math.random() < Math.max(0.05, Math.min(0.4, bombChance)));
        }

        if (isBomb) {
          this.bombs.push(new Bomb(xPos, yPos, this.difficultyMultiplier));
        } else {
          // Select random fruit type
          const types = ['watermelon', 'orange', 'apple', 'banana', 'coconut', 'pineapple'];
          const type = types[Math.floor(Math.random() * types.length)];
          this.fruits.push(new Fruit(xPos, yPos, type, this.difficultyMultiplier));
        }
      }
    }
  }

  /**
   * Adds coordinate points to the swipe history
   * @param {number|string} id - Pointer ID (or 'mouse')
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  addTrailPoint(id, x, y) {
    if (!this.activeTrails[id]) {
      this.activeTrails[id] = [];
    }

    const trail = this.activeTrails[id];
    trail.push({ x, y, time: performance.now() });

    // Limit history length (keep last 8 points)
    if (trail.length > 8) {
      trail.shift();
    }

    // Play swipe swoosh periodically when velocity is high
    if (trail.length >= 3) {
      const p1 = trail[trail.length - 3];
      const p2 = trail[trail.length - 1];
      const dist = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
      
      // Swoosh sound trigger threshold
      if (dist > 75 && Math.random() > 0.7) {
        audio.playSwipe();
      }
    }

    // Calculate slicing lines against elements
    if (trail.length >= 2) {
      const prev = trail[trail.length - 2];
      const curr = trail[trail.length - 1];
      this.checkCollisions(prev.x, prev.y, curr.x, curr.y);
    }
  }

  /**
   * Triggers collision sweep testing for all active elements along swipe lines
   */
  checkCollisions(x1, y1, x2, y2) {
    // 1. Check fruits
    this.fruits.forEach(fruit => {
      if (!fruit.isSliced) {
        const sliceResult = fruit.checkSlice(x1, y1, x2, y2);
        if (sliceResult.hit) {
          this.handleFruitSlice(fruit, sliceResult.angle);
        }
      }
    });

    // 2. Check bombs
    this.bombs.forEach(bomb => {
      if (!bomb.isSliced) {
        const sliceResult = bomb.checkSlice(x1, y1, x2, y2);
        if (sliceResult.hit) {
          this.handleBombSlice(bomb);
        }
      }
    });
  }

  /**
   * Runs game math when fruit is successfully sliced
   */
  handleFruitSlice(fruit, angle) {
    this.score += 1;
    this.fruitsSliced += 1;

    // Trigger juicy synthesized splat sound
    audio.playSplat();

    // Spawns background splatter mark
    this.splats.push(new Splat(fruit.x, fruit.y, fruit.juiceColor));

    // Spawn physics particles (juice droplets)
    const particleCount = 12 + Math.floor(Math.random() * 8);
    for (let i = 0; i < particleCount; i++) {
      this.particles.push(
        new Particle(
          fruit.x, 
          fruit.y, 
          fruit.vx * 0.4, 
          fruit.vy * 0.4, 
          fruit.juiceColor
        )
      );
    }

    // Floating score popup (+1)
    this.floatingTexts.push({
      x: fruit.x,
      y: fruit.y - 15,
      text: '+1',
      color: '#ffffff',
      size: 24,
      alpha: 1.0,
      vy: -1.2
    });

    // Handle combo tracking (rolling 200ms window)
    this.registerSliceForCombo();
    this.updateHud();
  }

  /**
   * Rolling combo tracker logic
   */
  registerSliceForCombo() {
    const now = performance.now();
    
    // Clear slices older than 200ms
    this.comboBuffer = this.comboBuffer.filter(t => now - t < 220);
    this.comboBuffer.push(now);

    this.currentComboCount = this.comboBuffer.length;

    // Reset scheduled combo payout timer
    if (this.comboTimeout) {
      clearTimeout(this.comboTimeout);
    }

    this.comboTimeout = setTimeout(() => {
      if (this.currentComboCount >= 3) {
        this.payoutCombo(this.currentComboCount);
      }
      this.currentComboCount = 0;
      this.comboBuffer = [];
    }, 220);
  }

  /**
   * Calculates score bonuses and displays aesthetic graphics for combos
   */
  payoutCombo(count) {
    const bonus = count;
    this.score += bonus;
    
    if (count > this.maxCombo) {
      this.maxCombo = count;
    }

    // Play escalating synth musical arpeggio
    audio.playCombo(count);

    // Floating text alert
    const colors = ['#00f0ff', '#ff007f', '#39ff14', '#fff01f'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    this.floatingTexts.push({
      x: this.canvasManager.width / 2,
      y: this.canvasManager.height * 0.35,
      text: `${count}x COMBO! +${bonus}`,
      color: randomColor,
      size: 38 + count * 2,
      alpha: 1.0,
      vy: -0.6
    });

    this.updateHud();
  }

  /**
   * Handles bomb slice penalty logic
   */
  handleBombSlice(bomb) {
    // Screen shake visual shockwave
    this.canvasManager.triggerShake(15, 20);

    // Deep synthesized rumble explosion sound
    audio.playExplosion();

    // Spawns expanding neon circular blast ring
    this.blastRings.push({
      x: bomb.x,
      y: bomb.y,
      radius: 20,
      thickness: 6,
      alpha: 1.0,
      maxRadius: 180,
      decay: 0.04
    });

    // Spawn intense smoke particles
    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
      const smokeColor = Math.random() > 0.4 ? '#ff007f' : '#ffa600';
      this.particles.push(
        new Particle(
          bomb.x, 
          bomb.y, 
          (Math.random() - 0.5) * 12, 
          (Math.random() - 0.5) * 12, 
          smokeColor,
          3 + Math.random() * 6
        )
      );
    }

    // Penalties depend on mode
    if (this.mode === 'classic') {
      // Slicing a bomb in Classic ends the round or removes all lives
      this.lives = 0;
      this.updateHud();
      this.endGame();
    } else if (this.mode === 'arcade') {
      // In Arcade mode, subtracts 10 seconds
      this.score = Math.max(0, this.score - 10);
      
      // Draw "-10s" floating alert
      this.floatingTexts.push({
        x: bomb.x,
        y: bomb.y,
        text: '-10s',
        color: '#ff3131',
        size: 30,
        alpha: 1.0,
        vy: -2.0
      });

      // Shift game starting time backwards to subtract time
      this.gameStartTime -= 10000;
      this.updateHud();
    }
  }

  /**
   * Physics updates for Splatters
   */
  updateSplats() {
    this.splats = this.splats.filter(splat => {
      splat.update();
      this.canvasManager.drawSplat(splat);
      return splat.alpha > 0.01;
    });
  }

  /**
   * Physics updates for Fruits
   */
  updateFruits() {
    this.fruits = this.fruits.filter(fruit => {
      fruit.update();
      this.canvasManager.drawFruit(fruit);
      
      // Sliced halves falling off screen
      if (fruit.isOffScreen(this.canvasManager.width, this.canvasManager.height)) {
        return false;
      }
      
      // In Classic mode, missing a whole fruit drops a life!
      if (!fruit.isSliced && fruit.y > this.canvasManager.height + 50 && fruit.vy > 0) {
        if (this.mode === 'classic') {
          this.lives--;
          audio.playGameOver(); // Play simple sad note
          this.updateHud();
          
          if (this.lives <= 0) {
            this.endGame();
          }
        }
        return false;
      }
      
      return true;
    });
  }

  /**
   * Physics updates for Bombs
   */
  updateBombs() {
    this.bombs = this.bombs.filter(bomb => {
      bomb.update();
      this.canvasManager.drawBomb(bomb);
      return !bomb.isSliced && !bomb.isOffScreen(this.canvasManager.width, this.canvasManager.height);
    });
  }

  /**
   * Physics updates for Particles
   */
  updateParticles() {
    this.particles = this.particles.filter(p => {
      p.update();
      this.canvasManager.drawParticle(p);
      return p.alpha > 0.01;
    });
  }

  /**
   * Physics updates for expanding blast rings
   */
  updateBlastRings() {
    this.blastRings = this.blastRings.filter(ring => {
      ring.radius += 8;
      ring.alpha -= ring.decay;
      this.canvasManager.drawBlastRing(ring);
      return ring.alpha > 0.01;
    });
  }

  /**
   * Physics updates for floating texts
   */
  updateFloatingTexts() {
    this.floatingTexts = this.floatingTexts.filter(text => {
      text.y += text.vy;
      text.alpha -= 0.015;
      this.canvasManager.drawFloatingText(text);
      return text.alpha > 0.01;
    });
  }

  /**
   * Renders active trails for index fingers or mouse swipes
   */
  drawSwipeTrails() {
    const now = performance.now();
    Object.keys(this.activeTrails).forEach(id => {
      // Clear points older than 180ms to make trails decay dynamically
      this.activeTrails[id] = this.activeTrails[id].filter(pt => now - pt.time < 180);
      
      this.canvasManager.drawSwipeTrail(this.activeTrails[id]);
    });
  }

  /**
   * Updates state data in DOM elements
   */
  updateHud() {
    const scoreVal = document.getElementById('scoreText');
    if (scoreVal) {
      // Format score with leading zeros
      scoreVal.textContent = String(this.score).padStart(4, '0');
    }

    // Circular Timer Ring update
    const timerText = document.getElementById('timerText');
    const timerProgress = document.getElementById('timerProgressRing');
    if (timerText && timerProgress) {
      if (this.mode === 'classic') {
        timerText.textContent = '∞';
        timerProgress.style.strokeDashoffset = '0';
      } else {
        timerText.textContent = this.remainingTime;
        
        // Circular progress circle offset calculations
        const maxTime = this.mode === 'arcade' ? 60 : 90;
        const fraction = this.remainingTime / maxTime;
        const circumference = 2 * Math.PI * 34; // r=34 from SVG
        
        timerProgress.style.strokeDashoffset = String(circumference * (1 - fraction));
      }
    }

    // Classic lives update
    const livesDiv = document.getElementById('livesContainer');
    const livesIcons = document.getElementById('livesIcons');
    if (livesDiv) {
      if (this.mode === 'classic') {
        livesDiv.classList.remove('hidden');
        if (livesIcons) {
          livesIcons.innerHTML = '';
          for (let i = 0; i < 3; i++) {
            const heart = document.createElement('i');
            heart.className = 'fa-solid fa-heart';
            if (i < this.lives) {
              heart.classList.add('active-life');
            }
            livesIcons.appendChild(heart);
          }
        }
      } else {
        livesDiv.classList.add('hidden');
      }
    }

    // Mode name indicator
    const modeName = document.getElementById('modeIndicator');
    const modeNameText = document.getElementById('modeNameText');
    if (modeName && modeNameText) {
      if (this.mode !== 'classic') {
        modeName.classList.remove('hidden');
        modeNameText.textContent = this.mode.toUpperCase();
        
        if (this.mode === 'arcade') {
          modeNameText.className = 'hud-value neon-text-pink';
        } else {
          modeNameText.className = 'hud-value neon-text-blue';
        }
      } else {
        modeName.classList.add('hidden');
      }
    }
  }

  /**
   * Finalizes round gameplay and triggers game over screen
   */
  endGame() {
    this.state = 'gameover';
    
    // Stop camera frames and tracking trails
    this.activeTrails = {};
    
    // Play dramatic game over music chord
    audio.playGameOver();

    // Populate game over results
    document.getElementById('finalScoreText').textContent = this.score;
    document.getElementById('fruitsSlicedText').textContent = this.fruitsSliced;
    document.getElementById('maxComboText').textContent = this.maxCombo;

    // Check if score is a personal highscore
    const isNewHighScore = this.checkHighScore(this.score, this.mode);
    const scoreAlert = document.getElementById('newHighScoreAlert');
    if (scoreAlert) {
      if (isNewHighScore) {
        scoreAlert.classList.remove('hidden');
      } else {
        scoreAlert.classList.add('hidden');
      }
    }

    // Display overlay screen
    const hud = document.getElementById('gameplayHud');
    if (hud) hud.classList.add('hidden');
    
    const goScreen = document.getElementById('gameOverScreen');
    if (goScreen) goScreen.classList.remove('hidden');
  }

  /**
   * Leaderboard persistence methods
   */
  loadLeaderboard() {
    try {
      const raw = localStorage.getItem('gesture_ninja_scores');
      return raw ? JSON.parse(raw) : { classic: [], arcade: [], zen: [] };
    } catch {
      return { classic: [], arcade: [], zen: [] };
    }
  }

  saveLeaderboard() {
    try {
      localStorage.setItem('gesture_ninja_scores', JSON.stringify(this.leaderboard));
    } catch (e) {
      console.error("Local storage error:", e);
    }
  }

  checkHighScore(score, mode) {
    if (score <= 0) return false;
    const scores = this.leaderboard[mode] || [];
    if (scores.length < 5) return true;
    return score > scores[scores.length - 1].score;
  }

  submitScore(name, score, mode) {
    if (!name) name = 'AAA';
    name = name.toUpperCase().substring(0, 3);
    
    const list = this.leaderboard[mode] || [];
    list.push({ name, score, date: new Date().toLocaleDateString() });
    
    // Sort descending and keep top 5
    list.sort((a, b) => b.score - a.score);
    this.leaderboard[mode] = list.slice(0, 5);
    
    this.saveLeaderboard();
  }
}
