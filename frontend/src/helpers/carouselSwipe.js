export function carouselSwipeDirection(start, end, width) {
  if (!start || !end || end.at - start.at > 1200) return 0;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const threshold = Math.max(45, Math.min(90, width * 0.15));
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
