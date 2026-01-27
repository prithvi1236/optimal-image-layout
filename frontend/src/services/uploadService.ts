import axios from 'axios';
import { supabase } from '../Components/supabaseClient';
import type { AssetItem } from '../types';
import { API_URL } from '../constants';

export const uploadFile = async (
  uploadedFile: File, 
  extractFigures = false
): Promise<AssetItem[]> => {
  if (!API_URL) {
    throw new Error('API URL is not configured. Please set VITE_API_URL environment variable.');
  }

  const fd = new FormData();
  fd.append("file", uploadedFile);
  if (extractFigures) fd.append("extract_figures", "1");

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  try {
    const response = await axios.post(`${API_URL}/extract_img`, fd, {
      headers: {
        "Content-Type": "multipart/form-data",
        "Authorization": `Bearer ${token}`
      }
    });

    return response.data.images || [];
  } catch (error: any) {
    console.error('Upload error:', error);
    console.error('API_URL:', API_URL);
    console.error('Full URL:', `${API_URL}/extract_img`);
    if (error.response) {
      // Server responded with error
      throw new Error(`Upload failed: ${error.response.status} ${error.response.statusText}`);
    } else if (error.request) {
      // Request made but no response (network error, CORS, etc.)
      throw new Error(`Network error: Could not reach ${API_URL}. Check CORS settings and ensure the backend is running.`);
    } else {
      throw error;
    }
  }
};