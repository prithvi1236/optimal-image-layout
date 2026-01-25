// Application constants

export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;
export const API_URL = import.meta.env.VITE_API_URL;
export const MAX_CONTENT_WIDTH = A4_WIDTH - 80;   // margin * 2
export const MAX_CONTENT_HEIGHT = A4_HEIGHT - 80;
export const HANDLE_SIZE = 10;

// Utility functions
export const getFitScale = (w: number, h: number) => {
  const scaleW = MAX_CONTENT_WIDTH / w;
  const scaleH = MAX_CONTENT_HEIGHT / h;
  return Math.min(1, scaleW, scaleH); // never upscale
};