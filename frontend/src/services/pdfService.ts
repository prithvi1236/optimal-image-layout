import { jsPDF } from 'jspdf';
import { LayoutItem } from '../types';
import { A4_WIDTH, A4_HEIGHT } from '../constants';
import { API_URL } from '../constants';
import { supabase } from '../Components/supabaseClient';

const loadImageAsDataURL = (url: string, useProxy = false): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    let imageUrl = url;
    
    // If using proxy, get the proxied URL
    if (useProxy) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        imageUrl = `${API_URL}/image_proxy?url=${encodeURIComponent(url)}`;
        
        if (token) {
          // For proxy requests, we'll handle auth differently
          // The proxy endpoint will validate the token
        }
      } catch (error) {
        reject(new Error(`Failed to setup proxy: ${error}`));
        return;
      }
    }
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      ctx.drawImage(img, 0, 0);
      
      try {
        const dataURL = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataURL);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
    img.src = imageUrl;
  });
};

export const exportToPDF = async (
  layoutImages: LayoutItem[],
  loadedImages: Record<string, HTMLImageElement>,
  pageCount: number
): Promise<void> => {
  console.log('PDF Export Debug:');
  console.log('- Layout images:', layoutImages);
  console.log('- Loaded images keys:', Object.keys(loadedImages));
  console.log('- Page count:', pageCount);

  if (layoutImages.length === 0) {
    throw new Error('No images to export');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [A4_WIDTH, A4_HEIGHT]
  });

  let hasAddedAnyImage = false;

  for (let page = 1; page <= pageCount; page++) {
    if (page > 1) pdf.addPage();

    const pageItems = layoutImages.filter(item => item.page === page);
    console.log(`Page ${page} items:`, pageItems);
    
    for (const item of pageItems) {
      let imageAdded = false;
      
      // Try direct loading first
      try {
        console.log(`Processing image ${item.imageId} with URL: ${item.url}`);
        
        const dataURL = await loadImageAsDataURL(item.url, false);
        
        pdf.addImage(
          dataURL,
          'JPEG',
          item.x,
          item.y,
          item.width,
          item.height
        );
        
        hasAddedAnyImage = true;
        imageAdded = true;
        console.log(`Successfully added image ${item.imageId} to PDF`);
      } catch (error) {
        console.warn(`Direct loading failed for image ${item.imageId}:`, error);
      }
      
      // Try proxy loading if direct failed
      if (!imageAdded) {
        try {
          console.log(`Trying proxy for image ${item.imageId}`);
          
          const dataURL = await loadImageAsDataURL(item.url, true);
          
          pdf.addImage(
            dataURL,
            'JPEG',
            item.x,
            item.y,
            item.width,
            item.height
          );
          
          hasAddedAnyImage = true;
          imageAdded = true;
          console.log(`Successfully added image ${item.imageId} to PDF using proxy`);
        } catch (error) {
          console.warn(`Proxy loading failed for image ${item.imageId}:`, error);
        }
      }
      
      // Final fallback: try using the loaded image element
      if (!imageAdded) {
        const img = loadedImages[item.imageId];
        if (img && img.complete) {
          try {
            pdf.addImage(
              img,
              'JPEG',
              item.x,
              item.y,
              item.width,
              item.height
            );
            hasAddedAnyImage = true;
            console.log(`Successfully added image ${item.imageId} to PDF using fallback`);
          } catch (fallbackError) {
            console.warn(`All methods failed for image ${item.imageId}:`, fallbackError);
          }
        } else {
          console.warn(`No loaded image found for ${item.imageId}`);
        }
      }
    }
  }

  if (!hasAddedAnyImage) {
    throw new Error('No images could be added to the PDF');
  }

  pdf.save('layout.pdf');
  console.log('PDF saved successfully');
};