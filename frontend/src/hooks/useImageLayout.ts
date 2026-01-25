import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../Components/supabaseClient';
import { AssetItem, LayoutItem } from '../types';
import { API_URL } from '../constants';

export const useImageLayout = () => {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [layoutImages, setLayoutImages] = useState<LayoutItem[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set());
  const [loadedImages, setLoadedImages] = useState<Record<string, HTMLImageElement>>({});

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (assets.length > 0) {
      localStorage.setItem('layout-assets', JSON.stringify(assets));
    }
  }, [assets]);

  useEffect(() => {
    if (layoutImages.length > 0) {
      localStorage.setItem('layout-images', JSON.stringify(layoutImages));
    }
  }, [layoutImages]);

  useEffect(() => {
    if (pageCount > 1) {
      localStorage.setItem('layout-page-count', pageCount.toString());
    }
  }, [pageCount]);

  const generateLayoutStreaming = useCallback(async (currentAssets: AssetItem[]) => {
    if (currentAssets.length === 0) {
      setLayoutImages([]);
      setPageCount(1);
      return;
    }

    setLoading(true);
    
    try {
      const payloadItems = currentAssets.map((a) => ({
        id: a.id,
        scale: a.scale,
      }));

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const response = await fetch(`${API_URL}/layout_stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ items: payloadItems, margin: 40, gap: 20 })
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let newLayout: LayoutItem[] = [];
      let finalPageCount = 1;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'page') {
                const pageItems = data.items.map((item: any) => ({
                  layoutId: `${item.image_id}-${data.page}-${Math.random()}`,
                  imageId: item.image_id,
                  url: item.url,
                  x: item.x,
                  y: item.y,
                  width: item.width,
                  height: item.height,
                  page: data.page,
                }));

                newLayout = [...newLayout, ...pageItems];
                setLayoutImages([...newLayout]);
                setLoadingPages(prev => new Set([...prev, data.page]));
              } else if (data.type === 'complete') {
                finalPageCount = data.total_pages;
                setPageCount(finalPageCount);
                setLoadingPages(new Set());
                setLoading(false);
              }
            } catch (e) {
              console.error('Error parsing streaming data:', e);
            }
          }
        }
      }
    } catch (err) {
      console.error("Streaming layout error:", err);
      setLoading(false);
    }
  }, [loadedImages]);

  return {
    assets,
    setAssets,
    layoutImages,
    setLayoutImages,
    pageCount,
    setPageCount,
    loading,
    setLoading,
    loadingPages,
    setLoadingPages,
    loadedImages,
    setLoadedImages,
    generateLayoutStreaming,
  };
};