const API = {
  token: localStorage.getItem('deepkamal.token') || null,
  user: JSON.parse(localStorage.getItem('deepkamal.user') || 'null'),

  setSession(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('deepkamal.token', token);
    localStorage.setItem('deepkamal.user', JSON.stringify(user));
  },

  clearSession() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('deepkamal.token');
    localStorage.removeItem('deepkamal.user');
  },

  async request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (!isForm && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(`/api${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  get(path) {
    return this.request(path);
  },

  post(path, body) {
    return this.request(path, { method: 'POST', body: JSON.stringify(body) });
  },

  postForm(path, formData) {
    return this.request(path, { method: 'POST', body: formData });
  },

  patch(path, body) {
    return this.request(path, { method: 'PATCH', body: JSON.stringify(body) });
  },

  put(path, body) {
    return this.request(path, { method: 'PUT', body: JSON.stringify(body) });
  }
};

window.API = API;
