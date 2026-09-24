import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api',
  withCredentials: true, // session is an httpOnly cookie, not a header token
});

export interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  meta?: { page: number; per_page: number; total: number; total_pages: number };
  error?: string;
}

export interface ApiSingleResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
