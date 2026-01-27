import { useState, useEffect, useCallback,useRef } from 'react';
import { supabase } from '../Components/supabaseClient';
import type { AssetItem, LayoutItem } from '../types';
import { API_URL } from '../constants';

export const useSessionPersistence = (
  setAssets: (assets: AssetItem[]) => void,
  setLayoutImages: (images: LayoutItem[]) => void,
  setPageCount: (count: number) => void,
  generateLayoutStreaming: (assets: AssetItem[]) => Promise<void>
) => {
  const [sessionRestoring, setSessionRestoring] = useState(true);
  const [showRecoveryToast, setShowRecoveryToast] = useState(false);
  const isRestored = useRef(false);

  const clearCorruptedData = useCallback(() => {
    localStorage.removeItem('layout-assets');
    localStorage.removeItem('layout-images');
    localStorage.removeItem('layout-page-count');
    setAssets([]);
    setLayoutImages([]);
    setPageCount(1);
  }, [setAssets, setLayoutImages, setPageCount]);

  const preloadImages = useCallback((layout: LayoutItem[]) => {
    layout.forEach(img => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = img.url;
    });
  }, []);

  const restoreFromLocalStorage = useCallback((
    savedAssets: string, 
    savedLayout: string | null, 
    savedPageCount: string | null
  ) => {
    const parsedAssets = JSON.parse(savedAssets);
    setAssets(parsedAssets);
    setShowRecoveryToast(true);
    setTimeout(() => setShowRecoveryToast(false), 3000);
    
    if (savedLayout && savedPageCount) {
      const parsedLayout = JSON.parse(savedLayout);
      setLayoutImages(parsedLayout);
      setPageCount(parseInt(savedPageCount));
      preloadImages(parsedLayout);
    } else {
      generateLayoutStreaming(parsedAssets);
    }
  }, [setAssets, setLayoutImages, setPageCount, generateLayoutStreaming, preloadImages]);

  const restoreSession = useCallback(async () => {
    try {
      const savedAssets = localStorage.getItem('layout-assets');
      const savedLayout = localStorage.getItem('layout-images');
      const savedPageCount = localStorage.getItem('layout-page-count');

      // Get server images
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const response = await fetch(`${API_URL}/user_images`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const serverData = await response.json();
        const serverImages = serverData.images || [];

        if (serverImages.length > 0) {
          console.log('🔄 Server has images, using server data');
          setAssets(serverImages);

          if (savedLayout && savedPageCount && savedAssets) {
            const parsedLayout = JSON.parse(savedLayout);
            const parsedAssets = JSON.parse(savedAssets);
            
            if (parsedAssets.length === serverImages.length) {
              console.log('📱 Layout matches, restoring from localStorage');
              setLayoutImages(parsedLayout);
              setPageCount(parseInt(savedPageCount));
              preloadImages(parsedLayout);
            } else {
              console.log('🔄 Asset count mismatch, generating fresh layout');
              await generateLayoutStreaming(serverImages);
            }
          } else {
            console.log('🔄 No saved layout, generating fresh');
            await generateLayoutStreaming(serverImages);
          }
        } else if (savedAssets) {
          console.log('📱 Restoring from localStorage (server empty)');
          restoreFromLocalStorage(savedAssets, savedLayout, savedPageCount);
        }
      }
    } catch (error) {
      console.error('Failed to restore session:', error);
      clearCorruptedData();
    } finally {
      setSessionRestoring(false);
    }
  }, [setAssets, setLayoutImages, setPageCount, generateLayoutStreaming, preloadImages, restoreFromLocalStorage, clearCorruptedData]);

  

useEffect(() => {
  if (!isRestored.current) {
    isRestored.current = true;
    restoreSession();
  }
}, [restoreSession]);

  return {
    sessionRestoring,
    showRecoveryToast,
    clearCorruptedData,
  };
};