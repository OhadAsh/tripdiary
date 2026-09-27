/**
 * Horizontal swipe between days on the day panel.
 * @param {HTMLElement} target
 * @param {{ onPrev: () => void, onNext: () => void }} handlers
 * @returns {() => void} cleanup
 */
export function attachDaySwipe(target, handlers) {
  const THRESHOLD = 56;
  /** @type {{ x: number, y: number } | null} */
  let start = null;
  let locked = false;

  /** @param {TouchEvent} event */
  function onStart(event) {
    if (event.touches.length !== 1) return;
    const t = event.touches[0];
    start = { x: t.clientX, y: t.clientY };
    locked = false;
  }

  /** @param {TouchEvent} event */
  function onMove(event) {
    if (!start || event.touches.length !== 1) return;
    const t = event.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (!locked && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      locked = true;
    }
  }

  /** @param {TouchEvent} event */
  function onEnd(event) {
    if (!start) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    start = null;

    if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;

    // RTL: swipe finger to the left (dx < 0) → previous day visually feels like "back"
    // Finger moves left → show next day; finger moves right → previous day
    if (dx < 0) handlers.onNext();
    else handlers.onPrev();
  }

  target.addEventListener("touchstart", onStart, { passive: true });
  target.addEventListener("touchmove", onMove, { passive: true });
  target.addEventListener("touchend", onEnd, { passive: true });

  return () => {
    target.removeEventListener("touchstart", onStart);
    target.removeEventListener("touchmove", onMove);
    target.removeEventListener("touchend", onEnd);
  };
}
