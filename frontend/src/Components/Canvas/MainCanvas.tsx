import React, { useState, useCallback } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { A4_WIDTH, A4_HEIGHT } from '../../constants';
import type { LayoutItem, InteractionState } from '../../types';

interface MainCanvasProps {
  hasContent: boolean;
  pageCount: number;
  viewZoom: number;
  layoutImages: LayoutItem[];
  onFileUpload: (file: File) => void;
  onImageUpdate?: (imageId: string, updates: Partial<LayoutItem>) => void;
  onImageDelete?: (imageId: string) => void;
  generateLayoutStreaming?: (assets: any[]) => Promise<void>;
  pendingLayoutUpdate?: React.MutableRefObject<any>;
  onImageLoad?: (imageId: string, imageElement: HTMLImageElement) => void;
}

const MainCanvas = React.forwardRef<HTMLDivElement, MainCanvasProps>(({
  hasContent,
  pageCount,
  viewZoom,
  layoutImages,
  onFileUpload,
  onImageUpdate,
  onImageDelete,
  generateLayoutStreaming,
  pendingLayoutUpdate,
  onImageLoad,
}, ref) => {
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [interactionState, setInteractionState] = useState<InteractionState>(null);

  const handleImageClick = useCallback((layoutItem: LayoutItem, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedImageId(layoutItem.layoutId);
  }, []);

  const handleCanvasClick = useCallback(() => {
    setSelectedImageId(null);
  }, []);

  const handleDeleteImage = useCallback((imageId: string) => {
    if (onImageDelete) {
      onImageDelete(imageId);
    }
    setSelectedImageId(null);
  }, [onImageDelete]);

  const handleMouseDown = useCallback((e: React.MouseEvent, layoutItem: LayoutItem, handle?: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startMouse = { x: e.clientX, y: e.clientY };
    
    setInteractionState({
      type: handle ? "resize" : "move",
      itemId: layoutItem.layoutId,
      startMouse,
      initialItem: {
        x: layoutItem.x,
        y: layoutItem.y,
        width: layoutItem.width,
        height: layoutItem.height,
      },
      handle,
    });
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!interactionState || !onImageUpdate) return;

    const deltaX = (e.clientX - interactionState.startMouse.x) / viewZoom;
    const deltaY = (e.clientY - interactionState.startMouse.y) / viewZoom;

    const layoutItem = layoutImages.find(img => img.layoutId === interactionState.itemId);
    if (!layoutItem) return;

    let updates: Partial<LayoutItem> = {};

    if (interactionState.type === "move") {
      updates = {
        x: Math.max(0, Math.min(A4_WIDTH - layoutItem.width, interactionState.initialItem.x + deltaX)),
        y: Math.max(0, Math.min(A4_HEIGHT - layoutItem.height, interactionState.initialItem.y + deltaY)),
      };
    } else if (interactionState.type === "resize" && interactionState.handle) {
      const { handle } = interactionState;
      const { initialItem } = interactionState;

      if (handle === "se") {
        // Calculate new dimensions
        const newWidth = Math.max(20, initialItem.width + deltaX);
        const newHeight = Math.max(20, initialItem.height + deltaY);
        
        // Maintain aspect ratio
        const aspectRatio = initialItem.width / initialItem.height;
        let finalWidth = newWidth;
        let finalHeight = newHeight;
        
        if (newWidth / newHeight > aspectRatio) {
          finalWidth = newHeight * aspectRatio;
        } else {
          finalHeight = newWidth / aspectRatio;
        }
        
        // Ensure it fits within the page bounds
        finalWidth = Math.min(finalWidth, A4_WIDTH - layoutItem.x);
        finalHeight = Math.min(finalHeight, A4_HEIGHT - layoutItem.y);
        
        updates = {
          width: finalWidth,
          height: finalHeight,
        };
      }
    }

    onImageUpdate(layoutItem.imageId, updates);
  }, [interactionState, layoutImages, onImageUpdate, viewZoom]);

  const handleMouseUp = useCallback(() => {
    // If we were resizing and there's a pending layout update, trigger it immediately
    if (interactionState?.type === "resize" && pendingLayoutUpdate?.current && generateLayoutStreaming) {
      generateLayoutStreaming(pendingLayoutUpdate.current);
      pendingLayoutUpdate.current = null;
    }
    setInteractionState(null);
  }, [interactionState, generateLayoutStreaming, pendingLayoutUpdate]);

  React.useEffect(() => {
    if (interactionState) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [interactionState, handleMouseMove, handleMouseUp]);
  if (!hasContent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <h1 className="text-4xl font-black mb-6 text-zinc-800">
          Smart Layout Studio
        </h1>
        <div className="border-2 border-dashed border-zinc-300 p-16 rounded-2xl hover:bg-white hover:border-indigo-400 cursor-pointer relative group transition-all max-w-lg">
          <div className="flex flex-col items-center gap-4">
            <Upload className="w-12 h-12 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
            <span className="text-zinc-500 font-medium">
              Click to Upload Images or PDF
            </span>
            <span className="text-xs text-zinc-400">
              Or use the sidebar buttons to get started
            </span>
          </div>
          <input
            type="file"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => e.target.files && onFileUpload(e.target.files[0])}
          />
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={ref}
      className="flex-1 overflow-auto p-12 flex flex-col items-center gap-8 scroll-smooth" 
      onClick={handleCanvasClick}
    >
      {Array.from({ length: pageCount }).map((_, idx) => {
        const pageNumber = idx + 1;
        const pageImages = layoutImages.filter(img => img.page === pageNumber);
        
        return (
          <div
            key={idx}
            id={`page-wrapper-${pageNumber}`}
            className="transition-transform origin-top"
            style={{
              transform: `scale(${viewZoom})`,
              marginBottom: -((1 - viewZoom) * A4_HEIGHT),
            }}
          >
            <div className="bg-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] relative">
              <div 
                className="bg-white border border-zinc-200 relative overflow-hidden"
                style={{ width: A4_WIDTH, height: A4_HEIGHT }}
              >
                {pageImages.map((layoutItem) => {
                  const isSelected = selectedImageId === layoutItem.layoutId;
                  
                  return (
                    <div
                      key={layoutItem.layoutId}
                      className={`absolute group cursor-pointer ${isSelected ? 'z-10' : ''}`}
                      style={{
                        left: layoutItem.x,
                        top: layoutItem.y,
                        width: layoutItem.width,
                        height: layoutItem.height,
                      }}
                      onClick={(e) => handleImageClick(layoutItem, e)}
                      onMouseDown={(e) => handleMouseDown(e, layoutItem)}
                    >
                      <img
                        src={layoutItem.url}
                        alt={`Image ${layoutItem.imageId}`}
                        className="w-full h-full object-contain pointer-events-none"
                        onLoad={(e) => {
                          if (onImageLoad) {
                            onImageLoad(layoutItem.imageId, e.currentTarget);
                          }
                        }}
                        onError={(e) => {
                          console.error('Image failed to load:', layoutItem.url);
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      
                      {/* Selection border and controls */}
                      {isSelected && (
                        <>
                          <div className="absolute inset-0 border-2 border-indigo-500 pointer-events-none" />
                          
                          {/* Resize handle */}
                          <div
                            className="absolute -bottom-1 -right-1 w-3 h-3 bg-indigo-500 border border-white cursor-se-resize hover:bg-indigo-600 transition-colors"
                            onMouseDown={(e) => handleMouseDown(e, layoutItem, "se")}
                          />
                          
                          {/* Delete button */}
                          <button
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteImage(layoutItem.imageId);
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                          
                          {/* Resize indicator */}
                          {interactionState?.type === "resize" && interactionState.itemId === layoutItem.layoutId && (
                            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded pointer-events-none">
                              {Math.round(layoutItem.width)} × {Math.round(layoutItem.height)}
                            </div>
                          )}
                        </>
                      )}
                      
                      {/* Hover border */}
                      {!isSelected && (
                        <div className="absolute inset-0 border-2 border-transparent group-hover:border-indigo-300 pointer-events-none transition-colors" />
                      )}
                    </div>
                  );
                })}
                
                {pageImages.length === 0 && (
                  <div className="p-8 text-center text-zinc-400">
                    Page {pageNumber} Content
                  </div>
                )}
              </div>
            </div>
            <div className="text-center mt-3 text-[10px] font-bold text-zinc-300 uppercase tracking-widest transform scale-[1/viewZoom]">
              A4 Sheet {pageNumber}
            </div>
          </div>
        );
      })}
    </div>
  );
});

MainCanvas.displayName = 'MainCanvas';

export default MainCanvas;