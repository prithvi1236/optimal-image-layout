import React from 'react';
import { Loader2, RefreshCw, ZoomIn, ZoomOut, Download } from 'lucide-react';
import BuyMeACoffee from '../../BuyMeACoffee';
import { cleanupService } from '../../cleanupService';

interface HeaderProps {
  sessionRestoring: boolean;
  loading: boolean;
  loadingPages: Set<number>;
  pageCount: number;
  viewZoom: number;
  setViewZoom: (zoom: number | ((prev: number) => number)) => void;
  hasContent: boolean;
  onExportPDF: () => void;
  onDeleteAllData: () => Promise<void>;
}

const Header: React.FC<HeaderProps> = ({
  sessionRestoring,
  loading,
  loadingPages,
  pageCount,
  viewZoom,
  setViewZoom,
  hasContent,
  onExportPDF,
  onDeleteAllData,
}) => {
  return (
    <header className="h-14 bg-white border-b border-zinc-200 px-6 flex items-center justify-between z-10 shadow-sm">
      <div className="flex items-center gap-2">
        {sessionRestoring ? (
          <>
            <Loader2 size={16} className="animate-spin text-emerald-600" />
            <span className="text-xs font-bold text-zinc-500">
              Restoring Session...
            </span>
          </>
        ) : loading || loadingPages.size > 0 ? (
          <>
            <Loader2 size={16} className="animate-spin text-indigo-600" />
            <span className="text-xs font-bold text-zinc-500">
              {loadingPages.size > 0 
                ? `Generating Page ${Math.min(...loadingPages)}...` 
                : "Processing Images..."}
            </span>
            {pageCount > 0 && (
              <span className="text-xs text-zinc-400">
                ({pageCount} pages ready)
              </span>
            )}
          </>
        ) : (
          <>
            <RefreshCw size={16} className="text-indigo-600" />
            <span className="text-xs font-bold text-zinc-500">
              Layout Complete ({pageCount} pages)
            </span>
          </>
        )}
      </div>
      
      <div className="flex items-center gap-3 bg-zinc-100 rounded-full px-4 py-1.5 border border-zinc-200">
        <ZoomOut
          size={14}
          onClick={() => setViewZoom((z) => Math.max(0.2, z - 0.1))}
          className="cursor-pointer text-zinc-500 hover:text-black"
        />
        <span className="text-xs font-mono min-w-[32px] text-center">
          {Math.round(viewZoom * 100)}%
        </span>
        <ZoomIn
          size={14}
          onClick={() => setViewZoom((z) => Math.min(1.5, z + 0.1))}
          className="cursor-pointer text-zinc-500 hover:text-black"
        />
      </div>
      
      <div className="flex gap-2">
        <BuyMeACoffee className="mr-2" />
        <button
          onClick={async () => {
            await cleanupService.handleLogout();
          }}
          className="p-2 hover:bg-zinc-50 text-zinc-400 hover:text-zinc-600 rounded-lg transition-colors"
          title="Logout & Delete Data"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16,17 21,12 16,7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
        <button
          onClick={onDeleteAllData}
          className="p-2 hover:bg-red-50 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
          title="Delete All Data"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3,6 5,6 21,6"/>
            <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </button>
        {hasContent && (
          <button
            onClick={onExportPDF}
            className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-zinc-800 shadow-md"
          >
            <Download size={14} /> Export
          </button>
        )}
        <div className="ml-2 pl-2 border-l border-zinc-200">
    <div className="w-9 h-9 rounded-full overflow-hidden border border-zinc-200 shadow-sm">
      <img 
        src="/logo.png" 
        alt="Logo" 
        className="w-full h-full object-cover" 
      />
    </div>
  </div>
      </div>
    </header>
  );
};

export default Header;
