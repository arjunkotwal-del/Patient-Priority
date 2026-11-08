/** Poll while visible and catch up immediately when a tab becomes visible again. */
export function subscribeToRefresh(refresh: () => void, intervalMs = 60_000): () => void {
  const visible = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  const timer = window.setInterval(visible, intervalMs);
  document.addEventListener('visibilitychange', visible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', visible);
  };
}
