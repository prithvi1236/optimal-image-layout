import React from 'react';
import { Loader2 } from 'lucide-react';
import type { LayoutItem } from '../../types';

interface PageThumbnailsProps {
  pageCount: number;
  activePageIndex: number;
  setActivePageIndex: (index: number) => void;
  loadingPages: Set<number>;
  layoutImages: LayoutItem[];
}

const PageThumbnails: React.FC<PageThumbnailsProps> = ({
  pageCount,
  activePageIndex,
  setActivePageIndex,
  loadingPages,
  layoutImages,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-zinc-50/30">
      {/* Render existing pages */}
      {Array.from({ length: pageCount }).map((_, idx) => {
        const pageNumber = idx + 1;
        const pageImages = layoutImages.filter(img => img.page === pageNumber);
        
        return (
          <div
            key={idx}
            onClick={() => {
              setActivePageIndex(pageNumber);
              document
                .getElementById(`page-wrapper-${pageNumber}`)
                ?.scrollIntoView({ behavior: "smooth" });
            }}
            className={`group cursor-pointer flex flex-col items-center gap-2 transition-opacity duration-200 ${
              activePageIndex === pageNumber
                ? "opacity-100"
                : "opacity-60 hover:opacity-100"
            }`}
          >
            <div
              className={`relative border-2 rounded bg-white overflow-hidden shadow-sm transition-all ${
                activePageIndex === pageNumber
                  ? "border-indigo-600 ring-2 ring-indigo-50 scale-105"
                  : "border-zinc-200 group-hover:border-indigo-300"
              }`}
            >
              <div className="w-[119px] h-[168px] bg-zinc-100 relative overflow-hidden">
                {pageImages.length > 0 ? (
                  <>
                    {pageImages.map((layoutItem, imgIdx) => (
                      <img
                        key={layoutItem.layoutId}
                        src={layoutItem.url}
                        alt={`Page ${pageNumber} Image ${imgIdx + 1}`}
                        className="absolute object-contain"
                        style={{
                          left: (layoutItem.x / 794) * 119,
                          top: (layoutItem.y / 1123) * 168,
                          width: (layoutItem.width / 794) * 119,
                          height: (layoutItem.height / 1123) * 168,
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ))}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-xs text-zinc-400">Page {pageNumber}</span>
                  </div>
                )}
              </div>
            </div>
            <span
              className={`text-[10px] font-bold ${
                activePageIndex === pageNumber
                  ? "text-indigo-600"
                  : "text-zinc-400"
              }`}
            >
              Page {pageNumber}
            </span>
          </div>
        );
      })}
      
      {/* Render loading pages */}
      {Array.from(loadingPages).map((pageNum) => (
        <div
          key={`loading-${pageNum}`}
          className="group flex flex-col items-center gap-2 opacity-50"
        >
          <div className="relative border-2 border-dashed border-zinc-300 rounded bg-zinc-50 overflow-hidden shadow-sm w-[119px] h-[168px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={20} className="animate-spin text-indigo-500" />
              <span className="text-xs text-zinc-500">Generating...</span>
            </div>
          </div>
          <span className="text-[10px] font-bold text-zinc-400">
            Page {pageNum}
          </span>
        </div>
      ))}
    </div>
  );
};

export default PageThumbnails;