import { CanvasManager } from './canvas.js';

export let canvasManagerInstance = null;

/**
 * Dynamically queries the DOM and creates the CanvasManager instance.
 * Avoids errors caused by scripts evaluating before the DOM is fully constructed.
 */
export function initCanvasManager() {
  if (!canvasManagerInstance) {
    canvasManagerInstance = new CanvasManager(document.getElementById('gameCanvas'));
  }
  return canvasManagerInstance;
}

export default canvasManagerInstance;
