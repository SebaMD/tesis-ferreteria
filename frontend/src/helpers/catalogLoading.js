// Background refreshes never supersede a blocking request. Foreground changes cancel
// the old request, and only the current generation may publish data or release loading.
export function createCatalogLoader({ request, start, success, failure, finish, timeoutMs = 15000 }) {
  let generation = 0, pending = null, disposed = false;
  return {
    async load({ blocking = false, notifyError = false } = {}) {
      if ((!blocking && disposed) || (!blocking && pending)) return;
      disposed = false;
      pending?.abort();
      const controller = new AbortController(), current = ++generation;
      pending = controller;
      if (blocking) start();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        const result = await request(controller.signal);
        if (!disposed && current === generation) success(result);
      } catch (error) {
        if (!disposed && current === generation) failure(error, { timedOut, notifyError });
      } finally {
        clearTimeout(timer);
        if (!disposed && current === generation) { pending = null; finish(); }
      }
    },
    dispose() { disposed = true; generation++; pending?.abort(); pending = null; },
  };
}
