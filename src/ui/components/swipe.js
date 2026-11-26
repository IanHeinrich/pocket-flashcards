// @ts-check

/**
 * @typedef {object} SwipeOptions
 * @property {() => boolean} enabled Checked when a gesture starts.
 * @property {() => void} onLeft
 * @property {() => void} onRight
 * @property {{ left: string, right: string }} labels Shown on the element once a swipe is far
 *   enough to count, such as "Missed it" and "Got it".
 */

const DECIDE_DISTANCE = 10;
const MAX_THRESHOLD = 110;

/**
 * Horizontal swipes on touch and pen. The element follows the finger with a slight
 * tilt; a vertical gesture is left to the browser so the page still scrolls.
 * The element needs `touch-action: pan-y`.
 * @param {HTMLElement} el
 * @param {SwipeOptions} options
 * @returns {() => void} Removes the listeners.
 */
export function attachSwipe(el, { enabled, onLeft, onRight, labels }) {
  /** @type {{ id: number, x: number, y: number, horizontal: boolean | null, dx: number } | null} */
  let gesture = null;

  const threshold = () => Math.min(MAX_THRESHOLD, el.offsetWidth * 0.25);

  const reset = () => {
    el.classList.remove('is-dragging');
    el.style.transform = '';
    delete el.dataset.swipe;
    delete el.dataset.swipeLabel;
    gesture = null;
  };

  /** @param {PointerEvent} event */
  const onDown = (event) => {
    if (event.pointerType === 'mouse' || !event.isPrimary || !enabled()) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: null, dx: 0 };
  };

  /** @param {PointerEvent} event */
  const onMove = (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.horizontal === null) {
      if (Math.abs(dx) < DECIDE_DISTANCE && Math.abs(dy) < DECIDE_DISTANCE) return;
      gesture.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (!gesture.horizontal) {
        gesture = null;
        return;
      }
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        // The pointer is already gone; the gesture still ends on pointerup or cancel.
      }
      el.classList.add('is-dragging');
    }
    gesture.dx = dx;
    el.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`;
    if (Math.abs(dx) >= threshold()) {
      el.dataset.swipe = dx < 0 ? 'left' : 'right';
      el.dataset.swipeLabel = dx < 0 ? labels.left : labels.right;
    } else {
      delete el.dataset.swipe;
      delete el.dataset.swipeLabel;
    }
  };

  /** @param {PointerEvent} event */
  const onUp = (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const { horizontal, dx } = gesture;
    reset();
    if (!horizontal || Math.abs(dx) < threshold()) return;
    if (dx < 0) onLeft();
    else onRight();
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', reset);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', reset);
  };
}
