// src/services/api.js
import axios from 'axios';
import { auth } from '../firebase';

const BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({ baseURL: BASE_URL });

// Attach Firebase ID token to every request
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global error normalizer
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = err.response?.data?.error || err.message || 'Network error';
    return Promise.reject(new Error(msg));
  }
);

export default api;
