import React from 'react';
import { Upload } from 'lucide-react';

const EmptyState: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mb-4">
        <Upload className="w-8 h-8 text-zinc-400" />
      </div>
      <h3 className="font-bold text-zinc-800 mb-2">No Images Yet</h3>
      <p className="text-sm text-zinc-500 mb-4">
        Upload images or PDFs to get started with smart layouts
      </p>
      <div className="text-xs text-zinc-400">
        Drag & drop files or use the buttons above
      </div>
    </div>
  );
};

export default EmptyState;