import React from 'react';
import { Upload, Layers, Plus } from 'lucide-react';
import { AssetItem, LayoutItem } from '../../types';
import PageThumbnails from './PageThumbnails';
import EmptyState from './EmptyState';

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
        <EmptyState />
      ) : (
        <PageThumbnails
          pageCount={pageCount}
          activePageIndex={activePageIndex}
          setActivePageIndex={setActivePageIndex}
          loadingPages={loadingPages}
          layoutImages={layoutImages}
        />
      )}
    </aside>
  );
};

export default Sidebar;