/**
 * Client-side Configuration for Multi-Host Deployment
 * Automatically routes API calls to the Hostinger backend when served from hadhihavath.github.io
 */

const CONFIG = {
  // If served from GitHub Pages (hadhihavath.github.io), point to your Hostinger server backend
  // When running locally or on the same server, empty string uses relative paths (e.g. /api/...)
  DEFAULT_HOSTINGER_API: 'https://api.yourhostingerdomain.com',

  get isGitHubPages() {
    return window.location.hostname.endsWith('github.io');
  },

  get API_BASE_URL() {
    // 1. Check if user configured a custom backend URL in localStorage
    const saved = localStorage.getItem('yt_backend_url');
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }

    // 2. If running on GitHub Pages (hadhihavath.github.io), use configured Hostinger API URL
    if (this.isGitHubPages) {
      return this.DEFAULT_HOSTINGER_API;
    }

    // 3. Otherwise (localhost or served directly from Hostinger), use relative path
    return '';
  },

  setApiBaseUrl(newUrl) {
    if (newUrl) {
      localStorage.setItem('yt_backend_url', newUrl.trim().replace(/\/+$/, ''));
    } else {
      localStorage.removeItem('yt_backend_url');
    }
  },

  getUrl(endpoint) {
    const base = this.API_BASE_URL;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return base ? `${base}${cleanEndpoint}` : cleanEndpoint;
  }
};

window.CONFIG = CONFIG;
