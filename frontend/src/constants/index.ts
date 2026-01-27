// Application constants

export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

// API URL validation - must be set in environment variables
const apiUrl = import.meta.env.VITE_API_URL;
if (!apiUrl) {
  console.error('VITE_API_URL is not set! Please configure it in your environment variables.');
  console.error('For Vercel: Set VITE_API_URL in Project Settings → Environment Variables');
}
export const API_URL = apiUrl || '';
export const MAX_CONTENT_WIDTH = A4_WIDTH - 80;   // margin * 2
export const MAX_CONTENT_HEIGHT = A4_HEIGHT - 80;
export const HANDLE_SIZE = 10;

// Utility functions
export const getFitScale = (w: number, h: number) => {
  const scaleW = MAX_CONTENT_WIDTH / w;
  const scaleH = MAX_CONTENT_HEIGHT / h;
  return Math.min(1, scaleW, scaleH); // never upscale
};