/**
 * Canvas Drawing Manager
 * Handles all high-performance vector rendering, retro cyberpunk styling,
 * screen-shakes, neon trails, floating texts, and procedurally drawn fruits/bombs.
 */

export class CanvasManager {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    
    // Pixel scale calibration
    this.dpr = window.devicePixelRatio || 1;
    this.width = 0;
    this.height = 0;
    
    // Visual settings
    this.neonGlowActive = true;
    this.gridOffset = 0;
    
    // Screen shake state
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
  }

  /**
   * Resizes the canvas mapping to screen width/height while scaling for DPR
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
    
    // Set display size in CSS pixels
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    
    // Set actual buffer size scaled by device pixel ratio
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    
    // Scale drawings context to handle retina displays transparently
    this.ctx.scale(this.dpr, this.dpr);
  }

  /**
   * Triggers a screen-shake translation modifier
   */
  triggerShake(intensity = 12, duration = 15) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
  }

  /**
   * Clears screen and draws background overlays
   */
  clear() {
    const ctx = this.ctx;
    ctx.save();
    
    // Apply screen shake if active
    if (this.shakeDuration > 0) {
      const dx = (Math.random() - 0.5) * this.shakeIntensity;
      const dy = (Math.random() - 0.5) * this.shakeIntensity;
      ctx.translate(dx, dy);
      this.shakeDuration--;
    }

    // 1. Draw solid dark background with dark blue radial glow
    const bgGrad = ctx.createRadialGradient(
      this.width / 2, this.height / 2, 50,
      this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.7
    );
    bgGrad.addColorStop(0, '#121420'); // Cyber dark slate blue
    bgGrad.addColorStop(1, '#06070a'); // absolute black
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. Draw subtle scrolling cyberpunk grid lines
    this.drawBackgroundGrid();
  }

  /**
   * Restores context transforms (after screen shake / translations)
   */
  restore() {
    this.ctx.restore();
  }

  /**
   * Renders background neon grids
   */
  drawBackgroundGrid() {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)'; // Faint neon blue
    ctx.lineWidth = 1;
    
    // Scroll speed
    this.gridOffset = (this.gridOffset + 0.4) % 40;
    
    // Vertical grid lines
    const gridSpacing = 40;
    for (let x = 0; x < this.width; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    
    // Horizontal lines scrolling downward
    for (let y = this.gridOffset; y < this.height; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Renders a physical splat mark on the background
   */
  drawSplat(splat) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = splat.color;
    ctx.globalAlpha = splat.alpha;
    
    // Draw central blob
    ctx.beginPath();
    ctx.arc(splat.x, splat.y, splat.size * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Draw satellite drop splatters
    splat.droplets.forEach(drop => {
      ctx.beginPath();
      ctx.arc(splat.x + drop.dx, splat.y + drop.dy, drop.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  /**
   * Renders single physics particle
   */
  drawParticle(particle) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = particle.alpha;
    
    if (this.neonGlowActive) {
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 8;
    }

    ctx.beginPath();
    if (particle.shape === 'circle') {
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    } else {
      ctx.rect(particle.x - particle.size, particle.y - particle.size, particle.size * 2, particle.size * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draws a fruit - handles sliced halves or whole state
   */
  drawFruit(fruit) {
    const ctx = this.ctx;
    if (!fruit.isSliced) {
      ctx.save();
      ctx.translate(fruit.x, fruit.y);
      ctx.rotate(fruit.rotation);
      this.drawFruitShape(ctx, fruit.type, fruit.radius, fruit.colorOuter, fruit.colorInner, fruit.colorSeed);
      ctx.restore();
    } else {
      // Draw Half 1
      if (fruit.half1) {
        ctx.save();
        ctx.translate(fruit.half1.x, fruit.half1.y);
        ctx.rotate(fruit.half1.rotation);
        // Translate slightly away from cut line to show separation
        ctx.translate(0, -10);
        this.drawFruitHalfShape(ctx, fruit.type, fruit.radius, fruit.colorOuter, fruit.colorInner, fruit.colorSeed, 1);
        ctx.restore();
      }

      // Draw Half 2
      if (fruit.half2) {
        ctx.save();
        ctx.translate(fruit.half2.x, fruit.half2.y);
        ctx.rotate(fruit.half2.rotation);
        // Translate opposite direction
        ctx.translate(0, 10);
        this.drawFruitHalfShape(ctx, fruit.type, fruit.radius, fruit.colorOuter, fruit.colorInner, fruit.colorSeed, 2);
        ctx.restore();
      }
    }
  }

  /**
   * Helper to draw a complete vector fruit centered at (0,0)
   */
  drawFruitShape(ctx, type, r, colOut, colIn, colSeed) {
    if (this.neonGlowActive) {
      ctx.shadowColor = colOut;
      ctx.shadowBlur = 12;
    }

    // Outer shell / rind
    ctx.fillStyle = colOut;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Specific detailing
    switch (type) {
      case 'watermelon':
        // Inner red flesh
        ctx.fillStyle = colIn;
        ctx.beginPath();
        ctx.arc(0, 0, r - 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Watermelon seeds
        ctx.fillStyle = '#111';
        ctx.shadowBlur = 0; // disable glow for seeds
        const seedAngles = [0.2, 1.1, 2.0, 2.9, 3.8, 4.7, 5.6];
        seedAngles.forEach(ang => {
          ctx.save();
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.ellipse(r * 0.45, 0, 4, 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
        break;

      case 'orange':
        // Inner white/orange ring
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, r - 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Segments (wedges)
        ctx.fillStyle = colIn;
        const segmentCount = 8;
        for (let i = 0; i < segmentCount; i++) {
          ctx.save();
          ctx.rotate((i * Math.PI * 2) / segmentCount);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, r - 7, 0.08, (Math.PI * 2) / segmentCount - 0.08);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        break;

      case 'apple':
        // Cream color core
        ctx.fillStyle = colIn;
        ctx.beginPath();
        ctx.arc(0, 0, r - 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Tiny brown seeds
        ctx.fillStyle = '#4a2c11';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(-5, 0, 2, 0, Math.PI * 2);
        ctx.arc(5, 0, 2, 0, Math.PI * 2);
        ctx.fill();

        // Stem
        ctx.strokeStyle = '#4a2c11';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -r + 3);
        ctx.quadraticCurveTo(5, -r - 10, 10, -r - 8);
        ctx.stroke();
        break;

      case 'banana':
        // Banana body (crescent shape)
        ctx.fillStyle = colOut;
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI * 0.15, Math.PI * 1.05); // banana curve outer
        ctx.quadraticCurveTo(-r * 0.8, -r * 0.5, r * 0.85, r * 0.35); // inner curve
        ctx.closePath();
        ctx.fill();

        // Details (brown tip)
        ctx.fillStyle = '#4a3319';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(r * 0.95, r * 0.3, 3, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'coconut':
        // Coconut meat (white)
        ctx.fillStyle = colIn;
        ctx.beginPath();
        ctx.arc(0, 0, r - 7, 0, Math.PI * 2);
        ctx.fill();
        
        // Coconut hollow (dark grey)
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(0, 0, r - 15, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'pineapple':
        // Cross hatching patterns
        ctx.strokeStyle = '#e69500';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 0;
        const spacing = 10;
        for (let x = -r; x < r; x += spacing) {
          ctx.beginPath();
          ctx.moveTo(x, -Math.sqrt(r*r - x*x));
          ctx.lineTo(x + r, Math.sqrt(r*r - (x + r)*(x + r)) || r);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x, -Math.sqrt(r*r - x*x));
          ctx.lineTo(x - r, Math.sqrt(r*r - (x - r)*(x - r)) || r);
          ctx.stroke();
        }

        // Crown leaves at the top
        ctx.fillStyle = colIn;
        if (this.neonGlowActive) {
          ctx.shadowColor = colIn;
          ctx.shadowBlur = 8;
        }
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(-15, -r - 18, -12, -r - 28);
        ctx.quadraticCurveTo(0, -r - 18, 0, -r);
        ctx.quadraticCurveTo(15, -r - 18, 12, -r - 28);
        ctx.quadraticCurveTo(0, -r - 18, 0, -r);
        // Center taller leaf
        ctx.quadraticCurveTo(0, -r - 22, 0, -r - 35);
        ctx.quadraticCurveTo(5, -r - 22, 0, -r);
        ctx.fill();
        break;
    }
  }

  /**
   * Helper to draw a single halved fruit (top or bottom half)
   */
  drawFruitHalfShape(ctx, type, r, colOut, colIn, colSeed, halfIndex) {
    ctx.save();
    
    // Draw clipping path depending on halfIndex
    ctx.beginPath();
    if (halfIndex === 1) {
      // Top half clipping area
      ctx.rect(-r - 10, -r - 10, r * 2 + 20, r + 10);
    } else {
      // Bottom half clipping area
      ctx.rect(-r - 10, 0, r * 2 + 20, r + 10);
    }
    ctx.clip();
    
    // Draw the full shape; the clip mask cuts it perfectly!
    this.drawFruitShape(ctx, type, r, colOut, colIn, colSeed);

    // Draw flat cut edge highlight (glowing neon line along the sliced center line)
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Renders a glowing bomb with active sparkling fuse
   */
  drawBomb(bomb) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(bomb.x, bomb.y);
    ctx.rotate(bomb.rotation);

    if (this.neonGlowActive) {
      ctx.shadowColor = '#393b45';
      ctx.shadowBlur = 10;
    }

    // 1. Draw Bomb metallic sphere
    const metalGrad = ctx.createRadialGradient(
      -bomb.radius * 0.2, -bomb.radius * 0.2, 5,
      0, 0, bomb.radius
    );
    metalGrad.addColorStop(0, '#4a4d5c'); // brighter highlights
    metalGrad.addColorStop(0.7, '#1b1d24'); // deep metal
    metalGrad.addColorStop(1, '#090a0d'); // shadow edges
    
    ctx.fillStyle = metalGrad;
    ctx.beginPath();
    ctx.arc(0, 0, bomb.radius, 0, Math.PI * 2);
    ctx.fill();

    // 2. Draw bomb fuse collar
    ctx.fillStyle = '#3a3d4a';
    ctx.fillRect(-8, -bomb.radius - 3, 16, 6);

    // 3. Danger warning symbol on center face (Skull or Hazard grid)
    ctx.save();
    ctx.rotate(-bomb.rotation); // Keep hazard symbol upright
    ctx.strokeStyle = '#ff3131';
    ctx.lineWidth = 3;
    if (this.neonGlowActive) {
      ctx.shadowColor = '#ff3131';
      ctx.shadowBlur = 10;
    }
    // Draw neon triangle danger icon
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(16, 12);
    ctx.lineTo(-16, 12);
    ctx.closePath();
    ctx.stroke();
    // Exclamation point in triangle
    ctx.fillStyle = '#ff3131';
    ctx.fillRect(-2, -6, 4, 9);
    ctx.fillRect(-2, 6, 4, 3);
    ctx.restore();

    // 4. Draw burning fuse (sweeping arc curve)
    ctx.restore();
    ctx.save();
    ctx.translate(bomb.x, bomb.y);
    // Draw fuse from top of bomb collar (0, -r)
    ctx.strokeStyle = '#a68c72';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 0;
    
    const collarY = -bomb.radius;
    const fuseEndX = 25;
    const fuseEndY = -bomb.radius - 20;
    
    ctx.beginPath();
    ctx.moveTo(0, collarY);
    ctx.quadraticCurveTo(15, collarY - 5, fuseEndX, fuseEndY);
    ctx.stroke();

    // 5. Draw active fuse spark (animated particles)
    if (this.neonGlowActive) {
      ctx.shadowColor = '#fff01f';
      ctx.shadowBlur = 15;
    }
    
    // Spark core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(fuseEndX, fuseEndY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Spiky spark vectors
    ctx.strokeStyle = '#ffa600';
    ctx.lineWidth = 1.5;
    const lines = 6;
    const timeFactor = bomb.sparkTimer * 0.3;
    for (let i = 0; i < lines; i++) {
      const ang = (i * Math.PI * 2) / lines + timeFactor;
      const len = 8 + Math.sin(timeFactor * 2 + i) * 5;
      ctx.beginPath();
      ctx.moveTo(fuseEndX, fuseEndY);
      ctx.lineTo(fuseEndX + Math.cos(ang) * len, fuseEndY + Math.sin(ang) * len);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Renders the player's swipe trail
   */
  drawSwipeTrail(trailPoints) {
    if (trailPoints.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    
    // 1. Draw glowing blue shadow line
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = '#00f0ff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(trailPoints[0].x, trailPoints[0].y);
    for (let i = 1; i < trailPoints.length; i++) {
      ctx.lineTo(trailPoints[i].x, trailPoints[i].y);
    }
    
    // Set width decay towards the tail
    ctx.lineWidth = 7;
    ctx.stroke();

    // 2. Draw core white-hot thin line
    ctx.shadowBlur = 0; // disable shadow for white core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw visual score popups (+3 Combo, Double Slice!)
   */
  drawFloatingText(textObj) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `900 ${textObj.size}px 'Orbitron'`;
    ctx.fillStyle = textObj.color;
    ctx.globalAlpha = textObj.alpha;
    ctx.textAlign = 'center';
    
    if (this.neonGlowActive) {
      ctx.shadowColor = textObj.color;
      ctx.shadowBlur = 12;
    }

    ctx.fillText(textObj.text, textObj.x, textObj.y);
    ctx.restore();
  }

  /**
   * Draws a giant neon explosion blast rings
   */
  drawBlastRing(ring) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = ring.alpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = ring.thickness;
    
    if (this.neonGlowActive) {
      ctx.shadowColor = '#ff007f';
      ctx.shadowBlur = ring.radius * 0.4;
    }

    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
