import React, { useState, useCallback, useEffect, useRef } from 'react';
import { cleanupService } from '../cleanupService';
import { useImageLayout } from '../hooks/useImageLayout';
import { useSessionPersistence } from '../hooks/useSessionPersistence';
import { uploadFile } from '../services/uploadService';
import { deleteImage } from '../services/userService';
import { exportToPDF } from '../services/pdfService';
import Sidebar from './Sidebar/Sidebar';
import Header from './Header/Header';
import MainCanvas from './Canvas/MainCanvas';
import Notifications from './Notifications/Notifications';
import type { LayoutItem } from '../types';

const ImageCanvasStudio: React.FC = () => {
  const {
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
  } = useImageLayout();

  const {
    sessionRestoring,
    showRecoveryToast,
    clearCorruptedData,
  } = useSessionPersistence(setAssets, setLayoutImages, setPageCount, generateLayoutStreaming);

  const [viewZoom, setViewZoom] = useState(0.6);
  const [activePageIndex, setActivePageIndex] = useState(1);
  const [showScaleSavedIndicator, setShowScaleSavedIndicator] = useState(false);
  const mainCanvasRef = useRef<HTMLDivElement>(null);
  const pendingLayoutUpdate = useRef<any>(null);
  const debounceTimeout = useRef<number | null>(null);

  const hasContent = assets.length > 0;

  // Sync active page with scroll position
  useEffect(() => {
    const handleScroll = () => {
      if (!mainCanvasRef.current) return;
      
      const scrollTop = mainCanvasRef.current.scrollTop;
      const pageHeight = 1123 * viewZoom + 64; // A4_HEIGHT * zoom + gap
      const currentPage = Math.floor(scrollTop / pageHeight) + 1;
      
      if (currentPage !== activePageIndex && currentPage <= pageCount) {
        setActivePageIndex(currentPage);
      }
    };

    const mainCanvas = mainCanvasRef.current;
    if (mainCanvas) {
      mainCanvas.addEventListener('scroll', handleScroll);
      return () => mainCanvas.removeEventListener('scroll', handleScroll);
    }
  }, [activePageIndex, pageCount, viewZoom]);

  const handleUpload = useCallback(async (uploadedFile: File, extractFigures = false) => {
    setLoading(true);
    try {
      const newAssets = await uploadFile(uploadedFile, extractFigures);
      const updatedAll = [...assets, ...newAssets];
      setAssets(updatedAll);
      
      // Always let the server decide the layout for the whole batch
      await generateLayoutStreaming(updatedAll);
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setLoading(false);
    }
  }, [assets, setAssets, setLoading, generateLayoutStreaming]);

  const handleExportPDF = useCallback(async () => {
    try {
      console.log('Starting PDF export...');
      console.log('Layout images:', layoutImages.length);
      console.log('Loaded images:', Object.keys(loadedImages).length);
      console.log('Page count:', pageCount);
      
      if (layoutImages.length === 0) {
        alert('No images to export. Please upload some images first.');
        return;
      }
      
      await exportToPDF(layoutImages, loadedImages, pageCount);
      console.log('PDF export completed successfully');
    } catch (error) {
      console.error('PDF export failed:', error);
      alert('Failed to export PDF. Please try again.');
    }
  }, [layoutImages, loadedImages, pageCount]);

  const handleDeleteAllData = useCallback(async () => {
    const success = await cleanupService.deleteAllData();
    if (success) {
      // Clear local state
      setAssets([]);
      setPageCount(1);
      setLayoutImages([]);
      // Clear localStorage
      localStorage.removeItem('layout-assets');
      localStorage.removeItem('layout-images');
      localStorage.removeItem('layout-page-count');
    }
  }, [setAssets, setPageCount, setLayoutImages]);

  const handleImageUpdate = useCallback(async (imageId: string, updates: Partial<LayoutItem>) => {
    // For immediate visual feedback, update the layout images first
    setLayoutImages(prev => 
      prev.map(img => 
        img.imageId === imageId ? { ...img, ...updates } : img
      )
    );

    // If width or height changed, we need to update the asset scale and regenerate layout
    if (updates.width !== undefined || updates.height !== undefined) {
      const layoutItem = layoutImages.find(img => img.imageId === imageId);
      const asset = assets.find(a => a.id === imageId);
      
      if (layoutItem && asset && (updates.width || updates.height)) {
        // Calculate new scale based on the resize
        const newWidth = updates.width || layoutItem.width;
        const newHeight = updates.height || layoutItem.height;
        
        // Calculate scale based on original dimensions
        const scaleX = newWidth / asset.origW;
        const scaleY = newHeight / asset.origH;
        const newScale = Math.min(scaleX, scaleY); // Use the smaller scale to maintain aspect ratio
        
        // Update the asset with new scale
        const updatedAssets = assets.map(a => 
          a.id === imageId ? { ...a, scale: newScale } : a
        );
        setAssets(updatedAssets);
        
        // Store the pending update and debounce the layout regeneration
        pendingLayoutUpdate.current = updatedAssets;
        
        // Clear existing timeout and set new one
        if (debounceTimeout.current) {
          clearTimeout(debounceTimeout.current);
        }
        debounceTimeout.current = window.setTimeout(async () => {
          await generateLayoutStreaming(updatedAssets);
        }, 500);
      }
    }
  }, [layoutImages, assets, setAssets, setLayoutImages, generateLayoutStreaming]);

  const handleImageLoad = useCallback((imageId: string, imageElement: HTMLImageElement) => {
    setLoadedImages(prev => ({
      ...prev,
      [imageId]: imageElement
    }));
  }, [setLoadedImages]);

  const handleImageDelete = useCallback(async (imageId: string) => {
    try {
      // Delete from backend
      const success = await deleteImage(imageId);
      if (!success) {
        console.error('Failed to delete image from backend');
        return;
      }

      // Remove from layout
      setLayoutImages(prev => prev.filter(img => img.imageId !== imageId));
      
      // Remove from assets
      const updatedAssets = assets.filter(asset => asset.id !== imageId);
      setAssets(updatedAssets);
      
      // Remove from loaded images
      setLoadedImages(prev => {
        const updated = { ...prev };
        delete updated[imageId];
        return updated;
      });
      
      // Regenerate layout with remaining assets
      if (updatedAssets.length > 0) {
        await generateLayoutStreaming(updatedAssets);
      } else {
        setPageCount(1);
      }
    } catch (error) {
      console.error('Error deleting image:', error);
    }
  }, [assets, setAssets, setLayoutImages, setLoadedImages, setPageCount, generateLayoutStreaming]);

  return (
    <div className="flex h-screen w-full bg-zinc-100 text-zinc-900 font-sans overflow-hidden">
      <Sidebar
        hasContent={hasContent}
        pageCount={pageCount}
        activePageIndex={activePageIndex}
        setActivePageIndex={setActivePageIndex}
        loadingPages={loadingPages}
        layoutImages={layoutImages}
        onFileUpload={handleUpload}
      />

      <main className="flex-1 flex flex-col bg-zinc-200/50 overflow-hidden relative">
        <Notifications
          showRecoveryToast={showRecoveryToast}
          showScaleSavedIndicator={showScaleSavedIndicator}
        />

        <Header
          sessionRestoring={sessionRestoring}
          loading={loading}
          loadingPages={loadingPages}
          pageCount={pageCount}
          viewZoom={viewZoom}
          setViewZoom={setViewZoom}
          hasContent={hasContent}
          onExportPDF={handleExportPDF}
          onDeleteAllData={handleDeleteAllData}
        />

        <MainCanvas
          ref={mainCanvasRef}
          hasContent={hasContent}
          pageCount={pageCount}
          viewZoom={viewZoom}
          layoutImages={layoutImages}
          onFileUpload={handleUpload}
          onImageUpdate={handleImageUpdate}
          onImageDelete={handleImageDelete}
          onImageLoad={handleImageLoad}
          generateLayoutStreaming={generateLayoutStreaming}
          pendingLayoutUpdate={pendingLayoutUpdate}
        />
      </main>
    </div>
  );
};

export default ImageCanvasStudio;