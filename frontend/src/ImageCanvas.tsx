import { useRef, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Upload, FileImage, Layout as LayoutIcon, Download, Trash2, Loader2 } from "lucide-react";

// Types remains the same
type CanvasImage = {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
};

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;
const HANDLE_SIZE = 10;
type ResizeHandle = "nw" | "ne" | "sw" | "se" | null;

const ImageCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<CanvasImage[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Record<string, HTMLImageElement>>({});
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle>(null);

  // Load images into memory
  useEffect(() => {
    if (images.length === 0) return;
    const map: Record<string, HTMLImageElement> = {};
    let loadedCount = 0;

    images.forEach((img) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.src = img.url;
      im.onload = () => {
        loadedCount++;
        map[img.id] = im;
        if (loadedCount === images.length) setLoadedImages(map);
      };
    });
  }, [images]);

  const uploadAndExtract = async () => {
  if (!file) return;

  const fd = new FormData();
  fd.append("file", file);

  const extract = await axios.post("http://localhost:5000/extract_img", fd);

  const layout = await axios.post("http://localhost:5000/layout", {
    image_ids: extract.data.image_ids,
    margin: 40,
    gap: 20,
    default_scale: 0.5,
  });

  setImages((prevImages) => {
    const existingPages = pageCount;
    const newImages: CanvasImage[] = [];

    Object.entries(layout.data.layout).forEach(([page, items]: any) => {
      items.forEach((it: any) => {
        newImages.push({
          id: `${it.image_id}_${crypto.randomUUID()}`, // 🔥 safest unique ID
          url: it.url,
          x: it.x,
          y: it.y,
          width: it.width,
          height: it.height,
          page: Number(page) + existingPages, // ✅ correct
        });
      });
    });

    return [...prevImages, ...newImages];
  });

  setPageCount(
    (prev) => prev + Object.keys(layout.data.layout).length
  );
};



  const drawLayout = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = A4_WIDTH;
    canvas.height = A4_HEIGHT * pageCount;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Page Dividers
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = "#e5e7eb";
    for (let i = 1; i < pageCount; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * A4_HEIGHT);
      ctx.lineTo(A4_WIDTH, i * A4_HEIGHT);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    images.forEach((img) => {
      const im = loadedImages[img.id];
      if (!im) return;
      const yOffset = (img.page - 1) * A4_HEIGHT;
      
      // Draw Image
      ctx.drawImage(im, img.x, img.y + yOffset, img.width, img.height);

      // Selection UI
      if (img.id === selectedImageId) {
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 3;
        ctx.strokeRect(img.x, img.y + yOffset, img.width, img.height);
        
        // Render Professional Handles
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#3b82f6";
        const handles = [
            [img.x, img.y + yOffset], // nw
            [img.x + img.width, img.y + yOffset], // ne
            [img.x, img.y + img.height + yOffset], // sw
            [img.x + img.width, img.y + img.height + yOffset] // se
        ];
        handles.forEach(([hx, hy]) => {
            ctx.beginPath();
            ctx.arc(hx, hy, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
      }
    });
  }, [images, pageCount, selectedImageId, loadedImages]);

  useEffect(drawLayout, [drawLayout]);

  // Handle Event logic stays similar but UI cursor changes
  const getCursor = () => {
    if (resizeHandle) return "nwse-resize";
    if (isDragging) return "grabbing";
    return "default";
  };

  return (
    <div className="flex h-screen w-full bg-zinc-100 font-sans text-zinc-900 overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-80 bg-white border-r border-zinc-200 flex flex-col p-6 gap-6 z-10 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-blue-600 p-2 rounded-lg">
            <LayoutIcon className="text-white w-5 h-5" />
          </div>
          <h1 className="font-bold text-xl tracking-tight">PrintStudio</h1>
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-medium text-zinc-600">Source Document</label>
          <div className="border-2 border-dashed border-zinc-200 rounded-xl p-6 transition-all hover:border-blue-400 hover:bg-blue-50/50 flex flex-col items-center gap-3 text-center cursor-pointer relative">
            <Upload className="w-8 h-8 text-zinc-400" />
            <div className="text-sm">
              <span className="text-blue-600 font-semibold">Click to upload</span>
              <p className="text-zinc-500 text-xs">PDF or Images (Max 20MB)</p>
            </div>
            <input 
                type="file" 
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => e.target.files && setFile(e.target.files[0])} 
            />
          </div>
          {file && <p className="text-xs text-green-600 font-medium">Selected: {file.name}</p>}

          <button
            onClick={uploadAndExtract}
            disabled={!file || loading}
            className="w-full bg-zinc-900 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-md active:scale-[0.98]"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate Layout"}
          </button>
        </div>

        <hr className="border-zinc-100" />

        <div className="flex-1">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4">Canvas Info</h3>
          <div className="bg-zinc-50 rounded-lg p-4 space-y-3">
             <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Pages</span>
                <span className="font-mono font-bold">{pageCount}</span>
             </div>
             <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Elements</span>
                <span className="font-mono font-bold">{images.length}</span>
             </div>
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* TOP TOOLBAR */}
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8">
           <div className="flex items-center gap-4">
                <span className="text-sm font-medium px-3 py-1 bg-zinc-100 rounded-full text-zinc-600 underline underline-offset-4">A4 Layout Mode</span>
           </div>
           <div className="flex gap-3">
             <button className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-600 transition-colors">
                <Download className="w-5 h-5" />
             </button>
             <button className="p-2 hover:bg-zinc-100 rounded-lg text-red-600 transition-colors" onClick={() => setImages([])}>
                <Trash2 className="w-5 h-5" />
             </button>
           </div>
        </header>

        {/* WORKSPACE AREA */}
        <div className="flex-1 overflow-auto p-12 flex justify-center bg-zinc-200 shadow-inner">
           <div className="relative shadow-2xl transition-all duration-300">
             {loading && (
                <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-sm flex items-center justify-center rounded-sm">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                        <span className="text-sm font-bold text-zinc-700">Analyzing Layout...</span>
                    </div>
                </div>
             )}
             <canvas
                ref={canvasRef}
                onMouseDown={(e) => {/* Use your existing handleMouseDown */}}
                onMouseMove={(e) => {/* Use your existing handleMouseMove */}}
                onMouseUp={() => setIsDragging(false)}
                className="bg-white rounded-[2px]"
                style={{
                    cursor: getCursor(),
                    imageRendering: "pixelated"
                }}
            />
           </div>
        </div>
      </main>
    </div>
  );
};

export default ImageCanvas;