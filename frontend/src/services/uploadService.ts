import axios from 'axios';
import { supabase } from '../Components/supabaseClient';
import type { AssetItem } from '../types';
import { API_URL } from '../constants';

export const uploadFile = async (
  uploadedFile: File, 
  extractFigures = false
): Promise<AssetItem[]> => {
  const fd = new FormData();
  fd.append("file", uploadedFile);
  if (extractFigures) fd.append("extract_figures", "1");

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const response = await axios.post(`${API_URL}/extract_img`, fd, {
    headers: {
      "Content-Type": "multipart/form-data",
      "Authorization": `Bearer ${token}`
    }
  });

  return response.data.images || [];
};