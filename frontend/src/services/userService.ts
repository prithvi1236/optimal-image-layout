import axios from 'axios';
import { supabase } from '../Components/supabaseClient';
import { API_URL } from '../constants';

export const deleteImage = async (imageId: string): Promise<boolean> => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    await axios.post(`${API_URL}/delete_image`, 
      { image_id: imageId },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      }
    );

    return true;
  } catch (error) {
    console.error('Failed to delete image:', error);
    return false;
  }
};