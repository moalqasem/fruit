import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

/**
 * HandTracker class
 * Integrates Google MediaPipe Tasks-Vision HandLandmarker to track finger movements via Webcam.
 */
class HandTracker {
  constructor() {
    this.handLandmarker = null;
    this.stream = null;
    this.video = null;
    this.previewVideo = null;
    this.overlayCanvas = null;
    this.overlayCtx = null;
    this.active = false;
    this.isModelLoaded = false;
    this.mirror = true;

    // Smoothed landmarks history to reduce jitter (Exponential Moving Average)
    this.smoothedPositions = {}; // Key: hand index, Value: {x, y}
    this.smoothingFactor = 0.35; // Lower is smoother, higher is more responsive
  }

  /**
   * Loads WASM files and model task file
   * @param {function} statusCallback - Callback to notify loading progress
   */
  async init(statusCallback = () => {}) {
    if (this.isModelLoaded) return;

    try {
      statusCallback("Fetching neural WASM runtime...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );

      statusCallback("Loading hand tracker neural network (5.6MB)...");
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55
      });

      this.isModelLoaded = true;
      statusCallback("Neural tracker ready!");
    } catch (error) {
      console.error("Error initializing MediaPipe HandLandmarker:", error);
      statusCallback("Failed to initialize hand tracker. Using mouse fallback.");
      throw error;
    }
  }

  /**
   * Requests webcam permissions and starts streaming
   * @param {HTMLVideoElement} videoElement - Main hidden video node
   * @param {HTMLVideoElement} previewVideoElement - Corner camera preview video
   * @param {HTMLCanvasElement} overlayCanvasElement - Overlay canvas for hand skeleton
   */
  async startCamera(videoElement, previewVideoElement, overlayCanvasElement) {
    this.video = videoElement;
    this.previewVideo = previewVideoElement;
    this.overlayCanvas = overlayCanvasElement;
    
    if (this.overlayCanvas) {
      this.overlayCtx = this.overlayCanvas.getContext('2d');
    }

    try {
      // Get constraints
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Hook up streams
      this.video.srcObject = this.stream;
      this.video.addEventListener('loadedmetadata', () => {
        this.video.play();
      });

      if (this.previewVideo) {
        this.previewVideo.srcObject = this.stream;
        this.previewVideo.addEventListener('loadedmetadata', () => {
          this.previewVideo.play();
          // Match overlay canvas dimensions to video aspect
          if (this.overlayCanvas) {
            this.overlayCanvas.width = this.previewVideo.videoWidth || 640;
            this.overlayCanvas.height = this.previewVideo.videoHeight || 480;
          }
        });
      }

      this.active = true;
      return true;
    } catch (error) {
      console.error("Error accessing camera:", error);
      this.active = false;
      throw new Error("Webcam access denied. Please allow camera permissions or switch to mouse mode.");
    }
  }

  /**
   * Stop camera stream and reset webcam parameters
   */
  stopCamera() {
    this.active = false;
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
    if (this.previewVideo) {
      this.previewVideo.srcObject = null;
    }
    this.smoothedPositions = {};
  }

  /**
   * Updates tracking on the current frame
   * @param {number} timestamp - Current game timestamp
   * @param {number} renderWidth - Target canvas width to map coordinates to
   * @param {number} renderHeight - Target canvas height to map coordinates to
   * @returns {Array} List of active hand tip coordinates mapping to game canvas
   */
  detectHands(timestamp, renderWidth, renderHeight) {
    if (!this.active || !this.isModelLoaded || !this.video || this.video.readyState < 2) {
      return [];
    }

    // Run prediction on video frame
    const results = this.handLandmarker.detectForVideo(this.video, timestamp);
    
    // Clear preview canvas overlay
    if (this.overlayCtx && this.overlayCanvas) {
      this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }

    const detectedPointers = [];

    if (results && results.landmarks && results.landmarks.length > 0) {
      results.landmarks.forEach((landmarks, handIndex) => {
        // Draw hand outline on overlay canvas for cool retro/cyber effect
        if (this.overlayCtx && this.overlayCanvas) {
          this.drawSkeleton(landmarks);
        }

        // Landmark 8 is INDEX_FINGER_TIP
        const indexTip = landmarks[8];
        
        // Horizontal coordinate needs flipping if camera mirroring is active
        let targetX = indexTip.x;
        if (this.mirror) {
          targetX = 1 - targetX;
        }
        
        let targetY = indexTip.y; // [0, 1] relative

        // Apply Exponential Moving Average smoothing
        if (!this.smoothedPositions[handIndex]) {
          this.smoothedPositions[handIndex] = { x: targetX, y: targetY };
        } else {
          this.smoothedPositions[handIndex].x += (targetX - this.smoothedPositions[handIndex].x) * this.smoothingFactor;
          this.smoothedPositions[handIndex].y += (targetY - this.smoothedPositions[handIndex].y) * this.smoothingFactor;
        }

        const smoothed = this.smoothedPositions[handIndex];

        // Map normalized coordinates [0, 1] to target canvas space
        detectedPointers.push({
          x: smoothed.x * renderWidth,
          y: smoothed.y * renderHeight,
          id: handIndex,
          handType: results.handedness?.[handIndex]?.[0]?.categoryName || 'Unknown'
        });
      });
    }

    // Clean up cached hands that are no longer detected
    if (!results.landmarks || results.landmarks.length === 0) {
      this.smoothedPositions = {};
    } else {
      // Remove stale hands from cache
      Object.keys(this.smoothedPositions).forEach(key => {
        if (parseInt(key) >= results.landmarks.length) {
          delete this.smoothedPositions[key];
        }
      });
    }

    return detectedPointers;
  }

  /**
   * Helper to draw glowing skeleton connection lines of hand
   */
  drawSkeleton(landmarks) {
    const ctx = this.overlayCtx;
    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;

    ctx.save();
    
    // Mirror drawing if webcam is mirrored
    if (this.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }

    // Style parameters
    ctx.strokeStyle = "rgba(0, 240, 255, 0.7)";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(0, 240, 255, 1)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#ff007f";

    // 1. Draw connections
    const connections = [
      // Thumb
      [0, 1], [1, 2], [2, 3], [3, 4],
      // Index finger
      [0, 5], [5, 6], [6, 7], [7, 8],
      // Middle finger
      [9, 10], [10, 11], [11, 12],
      // Ring finger
      [13, 14], [14, 15], [15, 16],
      // Pinky
      [0, 17], [17, 18], [18, 19], [19, 20],
      // Palm base knuckles
      [5, 9], [9, 13], [13, 17]
    ];

    ctx.beginPath();
    connections.forEach(([start, end]) => {
      const ptStart = landmarks[start];
      const ptEnd = landmarks[end];
      ctx.moveTo(ptStart.x * w, ptStart.y * h);
      ctx.lineTo(ptEnd.x * w, ptEnd.y * h);
    });
    ctx.stroke();

    // 2. Draw knuckles joints
    ctx.shadowBlur = 4;
    landmarks.forEach((landmark, index) => {
      ctx.beginPath();
      // Draw index finger tip larger
      const radius = (index === 8) ? 6 : 3;
      ctx.arc(landmark.x * w, landmark.y * h, radius, 0, 2 * Math.PI);
      ctx.fillStyle = (index === 8) ? "#fff01f" : "#ff007f";
      ctx.shadowColor = (index === 8) ? "#fff01f" : "#ff007f";
      ctx.fill();
    });

    ctx.restore();
  }
}

// Export single instance
export const handTracker = new HandTracker();
export default handTracker;
