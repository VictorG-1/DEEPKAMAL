/** Offline queue for partner field actions — flushes when back online */
(function (global) {
  const KEY = 'deepkamal.offlineQueue';

  function read() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch {
      return [];
    }
  }

  function write(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
  }

  function enqueue(action, payload) {
    const items = read();
    items.push({ id: Date.now() + Math.random(), action, payload, at: new Date().toISOString() });
    write(items);
    return items.length;
  }

  async function flush() {
    if (!navigator.onLine || !global.API?.token) return { flushed: 0 };
    const items = read();
    if (!items.length) return { flushed: 0 };
    let flushed = 0;
    const remain = [];
    for (const item of items) {
      try {
        await API.post('/offline/enqueue', {
          action: item.action,
          payload: item.payload,
          deviceId: localStorage.getItem('deepkamal.deviceId') || 'web'
        });
        flushed += 1;
      } catch {
        remain.push(item);
      }
    }
    write(remain);
    if (flushed) {
      try {
        await API.post('/offline/flush', {});
      } catch {
        /* server will keep Pending rows */
      }
    }
    return { flushed, remaining: remain.length };
  }

  if (!localStorage.getItem('deepkamal.deviceId')) {
    localStorage.setItem('deepkamal.deviceId', 'web-' + Math.random().toString(36).slice(2));
  }

  global.addEventListener('online', () => {
    flush().then((r) => {
      if (r.flushed && global.toast) toast(`Synced ${r.flushed} offline action(s)`);
    });
  });

  global.DKOffline = { enqueue, flush, pending: () => read().length };
})(window);
