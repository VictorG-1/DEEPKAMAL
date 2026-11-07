/** Field + ops polish helpers: geo attendance, ticket chat, print share, map */
window.DKField = {
  getGeo(timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('This device has no GPS'));
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          }),
        (err) => reject(new Error(err.message || 'GPS denied — allow location to mark Present')),
        { enableHighAccuracy: true, timeout, maximumAge: 15000 }
      );
    });
  },

  async markAttendance(userId, status) {
    const needsGeo = status === 'Present' || status === 'Half day';
    let geo = null;
    if (needsGeo && API.user.role === 'resource') {
      toast('Capturing GPS…');
      geo = await this.getGeo();
    }
    const body = { userId: Number(userId) || API.user.id, status };
    if (geo) Object.assign(body, geo);
    return API.post('/attendance', body);
  },

  async openTicketChat(ticketId) {
    const data = await API.get(`/tickets/${ticketId}/messages`);
    const t = data.ticket || {};
    openSheet(`
      <h2>Job notes · ${esc(t.code || '')}</h2>
      <p class="meta">${esc(t.title || '')}</p>
      <div id="chatList" class="chat-list">${(data.messages || [])
        .map(
          (m) =>
            `<div class="chat-bubble ${m.role === API.user.role ? 'mine' : ''}">
              <strong>${esc(m.userName)}</strong> <span class="muted">${esc(m.role)} · ${esc(m.createdAt || '')}</span>
              <p>${esc(m.body)}</p>
            </div>`
        )
        .join('') || '<p class="muted">No notes yet — start the thread.</p>'}</div>
      <form id="chatForm" style="display:grid;gap:8px;margin-top:12px">
        <textarea name="body" rows="3" required placeholder="Update for office / partner / customer"></textarea>
        <button class="btn-primary" type="submit">Send</button>
      </form>`);
    const list = document.getElementById('chatList');
    list.scrollTop = list.scrollHeight;
    document.getElementById('chatForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await API.post(`/tickets/${ticketId}/messages`, { body: fd.get('body') });
      toast('Note posted');
      this.openTicketChat(ticketId);
    };
  },

  async sharePrint(entityType, entityId, phone) {
    const data = await API.post('/print/token', { entityType, entityId });
    const text = data.whatsappText;
    if (phone) {
      const wa = `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
      window.open(wa, '_blank');
    } else {
      window.open(data.url, '_blank');
    }
    try {
      await navigator.clipboard.writeText(data.url);
      toast('Print/PDF link copied');
    } catch {
      toast('Print/PDF link ready');
    }
    return data;
  },

  renderDispatchMap(jobs, hq, partners) {
    const el = document.getElementById('dispatchMap');
    if (!el || !window.L) return;
    if (el._map) {
      el._map.remove();
      el._map = null;
    }
    const map = L.map(el).setView([hq?.lat || 28.46, hq?.lng || 77.03], 11);
    el._map = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18
    }).addTo(map);
    if (hq) {
      L.circleMarker([hq.lat, hq.lng], { radius: 9, color: '#0b1f33', fillColor: '#f97316', fillOpacity: 1 })
        .addTo(map)
        .bindPopup('DeepKamal HQ');
    }
    (jobs || []).forEach((j) => {
      if (!j.map) return;
      const color = j.priority === 'Critical' ? '#b91c1c' : j.priority === 'High' ? '#c2410c' : '#0369a1';
      L.circleMarker([j.map.lat, j.map.lng], { radius: 8, color, fillColor: color, fillOpacity: 0.85 })
        .addTo(map)
        .bindPopup(
          `<strong>${esc(j.code)}</strong><br/>${esc(j.title)}<br/>ETA ${esc(j.map.etaLabel)} · ${j.map.kmFromHq} km<br/>${esc(j.status)}`
        );
    });
    (partners || []).forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      L.circleMarker([p.lat, p.lng], { radius: 6, color: '#15803d', fillColor: '#86efac', fillOpacity: 1 })
        .addTo(map)
        .bindPopup(`Partner · ${esc(p.name)}`);
    });
    setTimeout(() => map.invalidateSize(), 80);
  }
};
