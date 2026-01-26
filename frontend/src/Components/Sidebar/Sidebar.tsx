import React from 'react';
import { Layers, Plus } from 'lucide-react';
import type { LayoutItem } from '../../types';

interface SidebarProps {
  hasContent: boolean;
  pageCount: number;
  activePageIndex: number;
  setActivePageIndex: (index: number) => void;
  loadingPages: Set<number>;
  layoutImages: LayoutItem[];
  onFileUpload: (file: File, extractFigures?: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  hasContent,
  pageCount,
  activePageIndex,
  setActivePageIndex,
  loadingPages,
  layoutImages,
  onFileUpload,
}) => {
  return (
    <aside className="w-60 bg-white border-r border-zinc-200 flex flex-col z-20 shadow-xl">
      <div className="h-14 flex items-center px-4 border-b border-zinc-100 bg-zinc-50/50 justify-between">
        <div className="flex items-center">
          <Layers size={16} className="text-indigo-600 mr-2" />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Pages ({pageCount})
          </span>
        </div>
      </div>

      <div className="p-4 border-b border-zinc-100 bg-white z-10">
        <div className="relative w-full flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2.5 rounded-lg border border-indigo-200 transition-all cursor-pointer group">
          <Plus
            size={16}
            className="group-hover:scale-110 transition-transform"
          />
          <span className="text-xs font-bold">Add Images / PDF</span>
          <input
            type="file"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => e.target.files && onFileUpload(e.target.files[0])}
          />
        </div>
        
        <div className="mt-2 relative w-full flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 py-2.5 rounded-lg border border-emerald-200 cursor-pointer transition-all">
          Extract Figures from Photo
          <input
            type="file"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => e.target.files && onFileUpload(e.target.files[0], true)}
          />
        </div>
      </div>

      {!hasContent ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-zinc-400">
            <Layers size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-sm">No images uploaded yet</p>
            <p className="text-xs mt-1">Upload images or PDFs to get started</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {Array.from({ length: pageCount }, (_, i) => (
              <div
                key={i + 1}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  activePageIndex === i + 1
                    ? 'bg-indigo-50 border-indigo-200'
                    : 'bg-white border-zinc-200 hover:bg-zinc-50'
                }`}
                onClick={() => setActivePageIndex(i + 1)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Page {i + 1}</span>
                  {loadingPages.has(i + 1) && (
                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {layoutImages.filter(img => img.page === i + 1).length} images
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;