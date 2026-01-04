import { useRef, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import { 
  Upload, Download, Trash2, Loader2, 
  ZoomIn, ZoomOut, MousePointer2, Layers
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================
type LayoutItem = {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
};

type AssetItem = {
  id: string;
  url: string;
  scale: number;
};

type InteractionState = {
  type: "move" | "resize";
  itemId: string;
  startMouse: { x: number; y: number };
  initialItem: { x: number; y: number; width: number; height: number };
  handle?: string;
} | null;

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;
const API_URL = "http://localhost:5001";
const HANDLE_SIZE = 8;

const ImageCanvasStudio: React.FC = () => {
  // ================= STATE =================
  const [file, setFile] = useState<File | null>(null);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [layoutImages, setLayoutImages] = useState<LayoutItem[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Record<string, HTMLImageElement>>({});
  
  // Interaction
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<InteractionState>(null);
  const [viewZoom, setViewZoom] = useState(0.6);
  const [activePageIndex, setActivePageIndex] = useState(1); // Track visible page

  const hasContent = assets.length > 0;

  // ================= API =================
  const generateLayout = useCallback(async (currentAssets: AssetItem[]) => {
    if (currentAssets.length === 0) return;
    setLoading(true);
    try {
      const payloadItems = currentAssets.map(a => ({ id: a.id, scale: a.scale }));
      const response = await axios.post(`${API_URL}/layout`, {
        items: payloadItems, margin: 40, gap: 20
      });

      const newLayout: LayoutItem[] = [];
      Object.entries(response.data.layout).forEach(([page, items]: any) => {
        items.forEach((it: any) => {
          newLayout.push({
            id: it.image_id, url: it.url, x: it.x, y: it.y,
            width: it.width, height: it.height, page: Number(page),
          });
        });
      });
      setLayoutImages(newLayout);
      setPageCount(response.data.page_count || 1);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  const handleUpload = async (uploadedFile: File) => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadedFile);
      const res = await axios.post(`${API_URL}/extract_img`, fd);
      const newAssets: AssetItem[] = res.data.image_ids.map((id: string) => ({
        id, url: `${API_URL}/output/${id}.png`, scale: 1.0
      }));
      
      const updated = [...assets, ...newAssets];
      setAssets(updated);
      setFile(uploadedFile);
      await generateLayout(updated);
    } catch (err) { console.error(err); setLoading(false); }
  };

  // ================= IMAGE LOADING =================
  useEffect(() => {
    if (layoutImages.length === 0) return;
    layoutImages.forEach((img) => {
      if (loadedImages[img.id]) return;
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.src = img.url;
      im.onload = () => setLoadedImages(prev => ({ ...prev, [img.id]: im }));
      im.onerror = () => { im.src = img.url.replace(".png", ".jpg"); };
    });
  }, [layoutImages]);

  // Update layout locally during drag/resize
  const updateLocalLayout = (id: string, updates: Partial<LayoutItem>) => {
    setLayoutImages(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const exportToPDF = () => {
    const pdf = new jsPDF("p", "mm", "a4");
    for (let p = 1; p <= pageCount; p++) {
      const canvas = document.getElementById(`canvas-page-${p}`) as HTMLCanvasElement;
      if (canvas) {
        if (p > 1) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 1.0), "JPEG", 0, 0, 210, 297);
      }
    }
    pdf.save("layout.pdf");
  };

  // Scroll Helper
  const scrollToPage = (pageNum: number) => {
    setActivePageIndex(pageNum);
    const el = document.getElementById(`page-wrapper-${pageNum}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ================= COMPONENT: THUMBNAIL CANVAS =================
  const ThumbnailCanvas = ({ pageIndex }: { pageIndex: number }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pageItems = layoutImages.filter(img => img.page === pageIndex);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Scale down (e.g., 0.15x)
      const scale = 0.2; 
      const w = A4_WIDTH * scale;
      const h = A4_HEIGHT * scale;
      
      // Reset transform & clear
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      
      // Apply scale
      ctx.scale(scale, scale);
      
      // White background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

      // Draw Items
      pageItems.forEach(img => {
        const im = loadedImages[img.id];
        if (im) ctx.drawImage(im, img.x, img.y, img.width, img.height);
      });
      
      // Draw border around the page
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 2 / scale;
      ctx.strokeRect(0, 0, A4_WIDTH, A4_HEIGHT);

    }, [pageItems, loadedImages]);

    return (
      <canvas
        ref={canvasRef}
        width={A4_WIDTH * 0.2}
        height={A4_HEIGHT * 0.2}
        className="block"
      />
    );
  };

  // ================= COMPONENT: MAIN CANVAS =================
  const PageCanvas = ({ pageIndex }: { pageIndex: number }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pageItems = layoutImages.filter(img => img.page === pageIndex);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, A4_WIDTH, A4_HEIGHT);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

      pageItems.forEach(img => {
        const im = loadedImages[img.id];
        if (im) ctx.drawImage(im, img.x, img.y, img.width, img.height);

        if (selectedId === img.id) {
          ctx.strokeStyle = "#4f46e5";
          ctx.lineWidth = 2;
          ctx.strokeRect(img.x, img.y, img.width, img.height);
          
          ctx.fillStyle = "#ffffff";
          const handles = [
            { x: img.x, y: img.y }, { x: img.x + img.width, y: img.y },
            { x: img.x, y: img.y + img.height }, { x: img.x + img.width, y: img.y + img.height },
          ];
          handles.forEach(h => {
            ctx.beginPath();
            ctx.rect(h.x - HANDLE_SIZE/2, h.y - HANDLE_SIZE/2, HANDLE_SIZE, HANDLE_SIZE);
            ctx.fill();
            ctx.stroke();
          });
        }
      });
    }, [pageItems, loadedImages, selectedId]);

    // Interaction handlers (MouseDown, MouseMove, MouseUp) same as before...
    const getMousePos = (e: React.MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: (e.clientX - rect.left) / viewZoom, y: (e.clientY - rect.top) / viewZoom };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      const { x, y } = getMousePos(e);
      let clickedItem = null;
      let handleType = null;

      for (let i = pageItems.length - 1; i >= 0; i--) {
        const img = pageItems[i];
        if (selectedId === img.id) {
            const hw = HANDLE_SIZE + 5;
            if (Math.abs(x - img.x) < hw && Math.abs(y - img.y) < hw) handleType = "nw";
            else if (Math.abs(x - (img.x + img.width)) < hw && Math.abs(y - img.y) < hw) handleType = "ne";
            else if (Math.abs(x - img.x) < hw && Math.abs(y - (img.y + img.height)) < hw) handleType = "sw";
            else if (Math.abs(x - (img.x + img.width)) < hw && Math.abs(y - (img.y + img.height)) < hw) handleType = "se";
        }
        if (handleType) { clickedItem = img; break; }
        if (x >= img.x && x <= img.x + img.width && y >= img.y && y <= img.y + img.height) {
          clickedItem = img; break;
        }
      }

      if (clickedItem) {
        setSelectedId(clickedItem.id);
        setInteraction({
          type: handleType ? "resize" : "move",
          itemId: clickedItem.id,
          startMouse: { x, y },
          initialItem: { ...clickedItem },
          handle: handleType || undefined
        });
      } else {
        setSelectedId(null);
      }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      const { x, y } = getMousePos(e);
      if (interaction) {
        const dx = x - interaction.startMouse.x;
        const dy = y - interaction.startMouse.y;
        const init = interaction.initialItem;

        if (interaction.type === "move") {
          updateLocalLayout(interaction.itemId, { x: init.x + dx, y: init.y + dy });
        } else if (interaction.type === "resize") {
            let newX = init.x, newY = init.y, newW = init.width, newH = init.height;
            if (interaction.handle?.includes("e")) newW = Math.max(20, init.width + dx);
            if (interaction.handle?.includes("s")) newH = Math.max(20, init.height + dy);
            if (interaction.handle?.includes("w")) { newW = Math.max(20, init.width - dx); newX = init.x + dx; }
            if (interaction.handle?.includes("n")) { newH = Math.max(20, init.height - dy); newY = init.y + dy; }
            updateLocalLayout(interaction.itemId, { x: newX, y: newY, width: newW, height: newH });
        }
      }
      
      // Cursor Logic
      const hoverItem = pageItems.find(img => x >= img.x && x <= img.x + img.width && y >= img.y && y <= img.y + img.height);
      if (canvasRef.current) canvasRef.current.style.cursor = interaction ? (interaction.type === "move" ? "grabbing" : "nwse-resize") : (hoverItem ? "grab" : "default");
    };

    return (
      <canvas
        id={`canvas-page-${pageIndex}`}
        ref={canvasRef}
        width={A4_WIDTH}
        height={A4_HEIGHT}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setInteraction(null)}
        onMouseLeave={() => setInteraction(null)}
      />
    );
  };

  // ================= UI RENDER =================
  return (
    <div className="flex h-screen w-full bg-zinc-100 text-zinc-900 font-sans overflow-hidden">
      {!hasContent && (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
            <h1 className="text-3xl font-black mb-6 text-zinc-800">LayoutStudio</h1>
            <div className="border-2 border-dashed border-zinc-300 p-16 rounded-2xl hover:bg-white hover:border-indigo-400 cursor-pointer relative transition-all group">
               <div className="flex flex-col items-center gap-4">
                 <Upload className="w-12 h-12 text-zinc-400 group-hover:text-indigo-500 transition-colors"/>
                 <span className="text-zinc-500 font-medium">Click to Upload Images or PDF</span>
               </div>
               <input type="file" className="absolute inset-0 opacity-0" onChange={(e) => e.target.files && handleUpload(e.target.files[0])} />
            </div>
        </div>
      )}

      {hasContent && (
        <>
          {/* THUMBNAIL SIDEBAR */}
          <aside className="w-56 bg-white border-r border-zinc-200 flex flex-col z-20 shadow-xl">
             <div className="h-14 flex items-center px-4 border-b border-zinc-100 bg-zinc-50/50">
               <Layers size={16} className="text-indigo-600 mr-2"/>
               <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Pages</span>
               <span className="ml-auto bg-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{pageCount}</span>
             </div>
             
             <div className="flex-1 overflow-y-auto p-4 space-y-4">
               {Array.from({ length: pageCount }).map((_, idx) => {
                 const pageNum = idx + 1;
                 const isActive = activePageIndex === pageNum;
                 return (
                   <div 
                     key={pageNum}
                     onClick={() => scrollToPage(pageNum)}
                     className={`group cursor-pointer flex flex-col items-center gap-2 transition-all duration-200 ${isActive ? 'scale-105' : 'opacity-70 hover:opacity-100'}`}
                   >
                     <div className={`relative rounded-md overflow-hidden border-2 shadow-sm transition-colors ${isActive ? 'border-indigo-600 ring-2 ring-indigo-100' : 'border-zinc-200 group-hover:border-indigo-300'}`}>
                        <ThumbnailCanvas pageIndex={pageNum} />
                     </div>
                     <span className={`text-[10px] font-bold ${isActive ? 'text-indigo-600' : 'text-zinc-400'}`}>
                       Page {pageNum}
                     </span>
                   </div>
                 );
               })}
             </div>
             
             {/* Mini Upload Button at bottom of sidebar */}
             <div className="p-4 border-t border-zinc-100">
                <div className="relative flex items-center justify-center gap-2 p-3 border border-dashed border-zinc-300 rounded-lg hover:bg-zinc-50 cursor-pointer text-zinc-500 hover:text-indigo-600 transition-colors">
                  <Upload size={14} />
                  <span className="text-xs font-bold">Add Pages</span>
                  <input type="file" className="absolute inset-0 opacity-0" onChange={(e) => e.target.files && handleUpload(e.target.files[0])} />
                </div>
             </div>
          </aside>

          {/* MAIN CANVAS AREA */}
          <main className="flex-1 flex flex-col bg-zinc-200/50 overflow-hidden relative">
             <header className="h-14 bg-white border-b border-zinc-200 px-6 flex items-center justify-between z-10 shadow-sm">
                <div className="flex items-center gap-2">
                   <MousePointer2 size={16} className="text-indigo-600" />
                   <span className="text-xs font-bold text-zinc-500">Interactive Mode</span>
                </div>
                <div className="flex items-center gap-3 bg-zinc-100 rounded-full px-4 py-1.5 border border-zinc-200">
                    <ZoomOut size={14} onClick={() => setViewZoom(z => Math.max(0.2, z-0.1))} className="cursor-pointer text-zinc-500 hover:text-zinc-900"/>
                    <span className="text-[10px] font-black min-w-[30px] text-center">{Math.round(viewZoom*100)}%</span>
                    <ZoomIn size={14} onClick={() => setViewZoom(z => Math.min(1.5, z+0.1))} className="cursor-pointer text-zinc-500 hover:text-zinc-900"/>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setAssets([]); setPageCount(1); }} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                     <Trash2 size={18} />
                  </button>
                  <button onClick={exportToPDF} className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-zinc-800 transition-colors shadow-lg shadow-zinc-200">
                     <Download size={14}/> Export PDF
                  </button>
                </div>
             </header>

             <div className="flex-1 overflow-auto p-12 flex flex-col items-center gap-8 scroll-smooth">
                {Array.from({ length: pageCount }).map((_, idx) => (
                   <div 
                      key={idx} 
                      id={`page-wrapper-${idx + 1}`}
                      className="transition-transform duration-200 origin-top"
                      style={{ transform: `scale(${viewZoom})`, width: A4_WIDTH, height: A4_HEIGHT, marginBottom: -((1-viewZoom)*A4_HEIGHT) }}
                   >
                      <div className="bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)]">
                        <PageCanvas pageIndex={idx + 1} />
                      </div>
                      <div className="text-center mt-4 opacity-50 text-xs font-bold uppercase tracking-widest pointer-events-none transform scale-[1/viewZoom]">
                        Page {idx + 1}
                      </div>
                   </div>
                ))}
             </div>
          </main>
        </>
      )}
    </div>
  );
};

export default ImageCanvasStudio;