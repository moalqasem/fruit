/**
 * Game entities module
 * Defines physical properties, collision mathematics, and rendering guidelines for:
 * - Fruit (physics, procedural drawing, half-splitting)
 * - Bomb (fuse sparkle, explosion blast)
 * - Particle (slicing juice droplets)
 * - Splat (background juice spills)
 */

export class Fruit {
  constructor(x, y, type, speedMultiplier = 1.0) {
    this.x = x;
    this.y = y;
    this.type = type; // 'watermelon', 'orange', 'apple', 'banana', 'coconut', 'pineapple'
    this.isSliced = false;
    
    // Set base dimensions & colors
    this.initProperties();
    
    // Physics
    const angleRange = Math.PI / 6; // +/- 30 degrees from vertical
    const angle = -Math.PI / 2 + (Math.random() * angleRange - angleRange / 2);
    const speed = (12 + Math.random() * 4) * speedMultiplier;
    
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.gravity = 0.28;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.08;
    
    // Halves physics (populated when sliced)
    this.half1 = null;
    this.half2 = null;
    this.sliceAngle = 0;
  }

  /**
   * Sets up dimensions, interior/exterior colors based on fruit type
   */
  initProperties() {
    switch (this.type) {
      case 'watermelon':
        this.radius = 48;
        this.colorOuter = '#1a5c1a'; // Dark green rind
        this.colorInner = '#ff2c55'; // Neon red flesh
        this.colorSeed = '#000000';
        this.juiceColor = '#ff2c55';
        break;
      case 'orange':
        this.radius = 38;
        this.colorOuter = '#ff6c00'; // Dark neon orange
        this.colorInner = '#ffa600'; // Light bright orange
        this.juiceColor = '#ff8800';
        break;
      case 'apple':
        this.radius = 36;
        this.colorOuter = '#ff0033'; // Hot red
        this.colorInner = '#fffae0'; // Cream core
        this.juiceColor = '#ff2a00';
        break;
      case 'banana':
        this.radius = 30; // treated as bounding sphere radius
        this.colorOuter = '#ffe500'; // Bright neon yellow
        this.colorInner = '#fff7b0'; // Pale banana flesh
        this.juiceColor = '#ffe500';
        break;
      case 'coconut':
        this.radius = 40;
        this.colorOuter = '#5c4033'; // Dark brown husk
        this.colorInner = '#ffffff'; // White coconut meat
        this.juiceColor = '#ffffff';
        break;
      case 'pineapple':
        this.radius = 45;
        this.colorOuter = '#ffcc00'; // Neon golden yellow
        this.colorInner = '#33cc33'; // Green leaves
        this.juiceColor = '#ffd000';
        break;
      default:
        this.radius = 35;
        this.colorOuter = '#ffffff';
        this.colorInner = '#dddddd';
        this.juiceColor = '#ffffff';
    }
  }

  /**
   * Updates coordinates based on velocity and gravity
   */
  update() {
    if (!this.isSliced) {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += this.gravity;
      this.rotation += this.rotationSpeed;
    } else {
      // Update the two halves separately
      this.updateHalf(this.half1);
      this.updateHalf(this.half2);
    }
  }

  updateHalf(half) {
    if (half) {
      half.x += half.vx;
      half.y += half.vy;
      half.vy += half.gravity;
      half.rotation += half.rotationSpeed;
    }
  }

  /**
   * Checks if a line segment intersects with this fruit's bounding circle
   * @param {number} x1 - Swipe start X
   * @param {number} y1 - Swipe start Y
   * @param {number} x2 - Swipe end X
   * @param {number} y2 - Swipe end Y
   * @returns {object} Hit status and slice angle if hit
   */
  checkSlice(x1, y1, x2, y2) {
    if (this.isSliced) return { hit: false };

    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      // Single point check
      const distSq = (this.x - x1) * (this.x - x1) + (this.y - y1) * (this.y - y1);
      if (distSq < this.radius * this.radius) {
        return { hit: true, angle: Math.random() * Math.PI * 2 };
      }
      return { hit: false };
    }

    // Project center onto line segment: t clamping to [0, 1]
    const t = Math.max(0, Math.min(1, ((this.x - x1) * dx + (this.y - y1) * dy) / lenSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;

    const distSq = (this.x - projX) * (this.x - projX) + (this.y - projY) * (this.y - projY);
    
    if (distSq < this.radius * this.radius) {
      const sliceAngle = Math.atan2(dy, dx);
      this.slice(sliceAngle);
      return { hit: true, angle: sliceAngle };
    }

    return { hit: false };
  }

  /**
   * Splice the fruit into two physical half entities
   * @param {number} angle - Swipe angle in radians
   */
  slice(angle) {
    this.isSliced = true;
    this.sliceAngle = angle;
    
    // Perpendicular angle of impulse
    const perpAngle = angle + Math.PI / 2;
    const impulseSpeed = 3.5 + Math.random() * 2;
    
    // Half 1 moves left-perpendicular to slice
    this.half1 = {
      x: this.x,
      y: this.y,
      vx: this.vx + Math.cos(perpAngle) * impulseSpeed,
      vy: this.vy + Math.sin(perpAngle) * impulseSpeed - 1.5, // minor upward bounce
      gravity: this.gravity * 0.95,
      rotation: this.rotation,
      rotationSpeed: -Math.abs(this.rotationSpeed) * 2 - 0.05
    };

    // Half 2 moves right-perpendicular to slice
    this.half2 = {
      x: this.x,
      y: this.y,
      vx: this.vx - Math.cos(perpAngle) * impulseSpeed,
      vy: this.vy - Math.sin(perpAngle) * impulseSpeed - 1.5,
      gravity: this.gravity * 0.95,
      rotation: this.rotation,
      rotationSpeed: Math.abs(this.rotationSpeed) * 2 + 0.05
    };
  }

  /**
   * Checks if the fruit (or both halves) is completely off the screen
   */
  isOffScreen(width, height) {
    const padding = 150;
    if (!this.isSliced) {
      return (
        this.y > height + padding ||
        this.x < -padding ||
        this.x > width + padding
      );
    } else {
      return (
        (!this.half1 || this.half1.y > height + padding) &&
        (!this.half2 || this.half2.y > height + padding)
      );
    }
  }
}

export class Bomb {
  constructor(x, y, speedMultiplier = 1.0) {
    this.x = x;
    this.y = y;
    this.radius = 42;
    this.isSliced = false;
    
    // Physics
    const angleRange = Math.PI / 8; // Narrower vertical arch
    const angle = -Math.PI / 2 + (Math.random() * angleRange - angleRange / 2);
    const speed = (11 + Math.random() * 3) * speedMultiplier;
    
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.gravity = 0.28;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.12;

    this.sparkTimer = 0;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.rotation += this.rotationSpeed;
    this.sparkTimer++;
  }

  /**
   * Checks slice intersection with the bomb
   */
  checkSlice(x1, y1, x2, y2) {
    if (this.isSliced) return { hit: false };

    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      const distSq = (this.x - x1) * (this.x - x1) + (this.y - y1) * (this.y - y1);
      if (distSq < this.radius * this.radius) {
        this.isSliced = true;
        return { hit: true, angle: 0 };
      }
      return { hit: false };
    }

    const t = Math.max(0, Math.min(1, ((this.x - x1) * dx + (this.y - y1) * dy) / lenSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;

    const distSq = (this.x - projX) * (this.x - projX) + (this.y - projY) * (this.y - projY);
    
    if (distSq < this.radius * this.radius) {
      this.isSliced = true;
      return { hit: true, angle: Math.atan2(dy, dx) };
    }

    return { hit: false };
  }

  isOffScreen(width, height) {
    const padding = 150;
    return (
      this.y > height + padding ||
      this.x < -padding ||
      this.x > width + padding
    );
  }
}

export class Particle {
  constructor(x, y, vx, vy, color, size = null) {
    this.x = x;
    this.y = y;
    this.vx = vx + (Math.random() - 0.5) * 6;
    this.vy = vy + (Math.random() - 0.5) * 6 - 2; // slight upward drift
    this.color = color;
    this.size = size || (2 + Math.random() * 4);
    
    this.gravity = 0.22;
    this.alpha = 1.0;
    this.decay = 0.015 + Math.random() * 0.02;
    this.shape = Math.random() > 0.5 ? 'circle' : 'square';
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.alpha -= this.decay;
  }
}

export class Splat {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = 35 + Math.random() * 30;
    this.alpha = 0.85;
    
    // Generate static drop patterns so we don't recalculate randomly during drawing
    this.droplets = [];
    const count = 4 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = (0.3 + Math.random() * 0.8) * this.size;
      this.droplets.push({
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        radius: (0.1 + Math.random() * 0.25) * this.size
      });
    }

    this.decay = 0.006 + Math.random() * 0.004; // Fades out slowly (2-3 seconds)
  }

  update() {
    this.alpha -= this.decay;
  }
}
