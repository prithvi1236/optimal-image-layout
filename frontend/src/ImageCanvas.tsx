import { useRef, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { jsPDF } from "jspdf"; // Required for export
import { 
  Upload, FileText, Download, Trash2, Loader2, 
  ChevronRight, Layers, ZoomIn, ZoomOut 
} from "lucide-react";

// Types
type CanvasImage = {
  id: string; url: string; x: number; y: number;
  width: number; height: number; page: number;
};

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;
const MARGIN = 40;
const GAP = 20;


const ImageCanvasStudio: React.FC = () => {
  const canvasRefs = useRef<{ [key: number]: HTMLCanvasElement | null }>({});
  const thumbRefs = useRef<{ [key: number]: HTMLCanvasElement | null }>({});
  
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<CanvasImage[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Record<string, HTMLImageElement>>({});
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.7);

  const hasContent = images.length > 0;

  /* ================================
     EXPORT LOGIC (PDF)
     ================================ */
  const exportToPDF = () => {
    const pdf = new jsPDF("p", "mm", "a4");
    
    for (let p = 1; p <= pageCount; p++) {
      const canvas = canvasRefs.current[p];
      if (!canvas) continue;

      // Convert canvas to high-quality JPEG
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      
      // Add page to PDF (skip adding page for the first iteration as jsPDF starts with one)
      if (p > 1) pdf.addPage();
      
      // A4 dimensions in mm are 210 x 297
      pdf.addImage(imgData, "JPEG", 0, 0, 210, 297);
    }

    pdf.save("document_layout.pdf");
  };

  /* ================================
     DRAWING & ASSET LOGIC
     ================================ */
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

  const renderAll = useCallback(() => {
    for (let p = 1; p <= pageCount; p++) {
      const mainCanvas = canvasRefs.current[p];
      const thumbCanvas = thumbRefs.current[p];
      const pageImages = images.filter(img => img.page === p);

      const drawToCanvas = (canvas: HTMLCanvasElement | null, isThumb: boolean) => {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const scale = isThumb ? 0.15 : 1;
        ctx.save();
        ctx.scale(scale, scale);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

        pageImages.forEach((img) => {
          const im = loadedImages[img.id];
          if (!im) return;
          ctx.drawImage(im, img.x, img.y, img.width, img.height);
          if (!isThumb && img.id === selectedImageId) {
            ctx.strokeStyle = "#4f46e5";
            ctx.lineWidth = 3;
            ctx.strokeRect(img.x, img.y, img.width, img.height);
          }
        });
        ctx.restore();
      };
      drawToCanvas(mainCanvas, false);
      drawToCanvas(thumbCanvas, true);
    }
  }, [images, pageCount, selectedImageId, loadedImages]);

  useEffect(renderAll, [renderAll]);

  const uploadAndExtract = async (selectedFile?: File) => {
  const targetFile = selectedFile || file;
  if (!targetFile) return;

  setLoading(true);

  try {
    const fd = new FormData();
    fd.append("file", targetFile);

    const extract = await axios.post("http://localhost:5000/extract_img", fd);
    const layout = await axios.post("http://localhost:5000/layout", {
      image_ids: extract.data.image_ids,
      margin: MARGIN,
      gap: GAP,
      default_scale: 0.5,
    });

    setImages(prevImages => {
      /** ================================
       * FIRST UPLOAD → USE BACKEND AS-IS
       * ================================ */
      if (prevImages.length === 0) {
        const initialImages: CanvasImage[] = [];

        Object.entries(layout.data.layout).forEach(([page, items]: any) => {
          items.forEach((it: any) => {
            initialImages.push({
              id: it.image_id,
              url: it.url,
              x: it.x,
              y: it.y,
              width: it.width,
              height: it.height,
              page: Number(page),
            });
          });
        });

        setPageCount(
          Math.max(...initialImages.map(i => i.page), 1)
        );

        return initialImages;
      }

      /** ================================
       * NEXT UPLOADS → APPEND ONLY
       * ================================ */
      const updatedImages = [...prevImages];

      let lastPage = Math.max(...prevImages.map(i => i.page));
      const lastPageImages = prevImages.filter(i => i.page === lastPage);

      // find vertical cursor on last page
      let cursorY = MARGIN;
      lastPageImages.forEach(img => {
        cursorY = Math.max(cursorY, img.y + img.height + GAP);
      });

      // flatten backend output
      const newItems = Object.values(layout.data.layout).flat() as any[];

      newItems.forEach(it => {
        // if doesn't fit → new page
        if (cursorY + it.height > A4_HEIGHT - MARGIN) {
          lastPage += 1;
          cursorY = MARGIN;
        }

        updatedImages.push({
          id: `${it.image_id}_${crypto.randomUUID()}`,
          url: it.url,
          x: MARGIN,              // ⬅️ simple left-aligned append
          y: cursorY,
          width: it.width,
          height: it.height,
          page: lastPage,
        });

        cursorY += it.height + GAP;
      });

      setPageCount(lastPage);
      return updatedImages;
    });

  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
};



  const UploadZone = ({ centered }: { centered?: boolean }) => (
    <div className={`group relative border-2 border-dashed border-zinc-200 rounded-2xl transition-all hover:border-indigo-400 hover:bg-indigo-50/50 cursor-pointer flex flex-col items-center justify-center
      ${centered ? "w-full max-w-lg p-16 bg-white shadow-xl" : "p-6 bg-zinc-50/50"}`}>
      <div className={`bg-white shadow-sm border border-zinc-100 text-indigo-600 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110 ${centered ? "w-16 h-16" : "w-10 h-10"}`}>
        <Upload size={centered ? 28 : 18} />
      </div>
      <h3 className={`font-bold text-zinc-800 ${centered ? "text-xl" : "text-[11px]"}`}>
        {centered ? "Upload your document" : "Add more source"}
      </h3>
      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => {
        if (e.target.files?.[0]) {
          setFile(e.target.files[0]);
          if (!centered) uploadAndExtract(e.target.files[0]);
        }
      }} />
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-zinc-50 overflow-hidden font-sans text-zinc-900">
      
      {!hasContent && !loading ? (
        /* CENTERED INITIAL STATE */
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px]">
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-indigo-600 p-3 rounded-2xl shadow-indigo-200 shadow-2xl animate-bounce-subtle">
              <FileText className="text-white w-8 h-8" />
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-zinc-800">LayoutStudio</h1>
          </div>
          <UploadZone centered />
          {file && (
            <button onClick={() => uploadAndExtract()} className="mt-8 px-12 py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 hover:-translate-y-1 transition-all active:scale-95">
              Generate Smart Layout
            </button>
          )}
        </div>
      ) : (
        <>
          {/* SIDEBAR: ACTIVE CONTROLS */}
          <aside className="w-64 bg-white border-r border-zinc-200 flex flex-col p-5 z-30 shadow-sm animate-in slide-in-from-left duration-300">
            <div className="flex items-center gap-2 mb-8">
              <div className="bg-indigo-600 p-1.5 rounded-lg"><FileText className="text-white w-4 h-4" /></div>
              <h1 className="font-bold text-sm tracking-tight">LayoutStudio</h1>
            </div>
            <div className="space-y-4">
              <UploadZone />
              <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-2">
                <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-widest">Document Info</div>
                <div className="flex justify-between text-[11px] font-medium text-zinc-500"><span>Pages</span><span className="text-zinc-900">{pageCount}</span></div>
                <div className="flex justify-between text-[11px] font-medium text-zinc-500"><span>Assets</span><span className="text-zinc-900">{images.length}</span></div>
              </div>
            </div>
          </aside>

          {/* MAIN VIEWPORT */}
          <main className="flex-1 flex flex-col min-w-0 bg-zinc-200/50 relative">
            {loading && (
              <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-md flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                  <span className="text-sm font-bold text-zinc-700 tracking-tight">Processing Layout...</span>
                </div>
              </div>
            )}

            <header className="h-14 bg-white border-b border-zinc-200 flex items-center justify-between px-6 z-20">
              <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                <span>Editor</span> <ChevronRight size={12} /> <span className="text-zinc-900 underline underline-offset-4">A4 Sheets</span>
              </div>

              {/* ZOOM CONTROLS */}
              <div className="flex items-center gap-3 bg-zinc-100 px-4 py-1.5 rounded-full border border-zinc-200">
                 <ZoomOut size={14} className="text-zinc-400 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} />
                 <input type="range" min="0.2" max="1.2" step="0.05" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-20 accent-indigo-600 cursor-pointer" />
                 <ZoomIn size={14} className="text-zinc-400 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => setZoom(z => Math.min(1.2, z + 0.1))} />
                 <span className="text-[10px] font-black w-8 text-zinc-500">{Math.round(zoom * 100)}%</span>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={exportToPDF}
                  className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900 text-white rounded-lg text-xs font-bold hover:bg-zinc-800 transition-all shadow-md active:scale-95"
                >
                  <Download size={14} /> Export PDF
                </button>
                <button onClick={() => {setImages([]); setPageCount(1);}} className="p-2 hover:bg-red-50 rounded-lg text-red-400 transition-colors"><Trash2 size={18} /></button>
              </div>
            </header>

            {/* PAGE VIEWPORT - GAPS REDUCED */}
            <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center gap-6 scroll-smooth shadow-inner">
              {Array.from({ length: pageCount }).map((_, idx) => (
                <div 
                  key={idx + 1} 
                  id={`page-container-${idx + 1}`} 
                  className="flex flex-col items-center transition-all duration-300 ease-out" 
                  style={{ 
                    transform: `scale(${zoom})`, 
                    transformOrigin: 'top center',
                    // This height calculation prevents huge gaps between scaled pages
                    marginBottom: zoom < 1 ? `-${(1 - zoom) * A4_HEIGHT}px` : '0px'
                  }}
                >
                  <div className="bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-zinc-200 rounded-[1px]">
                    <canvas
                      ref={(el) => { canvasRefs.current[idx + 1] = el; }}
                      width={A4_WIDTH} height={A4_HEIGHT}
                    />
                  </div>
                  <span className="mt-3 text-[9px] font-black text-zinc-300 uppercase tracking-widest">Page {idx + 1}</span>
                </div>
              ))}
            </div>
          </main>

          {/* NAVIGATION SIDEBAR */}
          <aside className="w-44 bg-white border-l border-zinc-200 flex flex-col z-30 shadow-sm">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/30">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Navigation</span>
              <Layers size={12} className="text-zinc-300" />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {Array.from({ length: pageCount }).map((_, idx) => (
                <div key={idx} onClick={() => {
                   document.getElementById(`page-container-${idx + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }} className="group cursor-pointer">
                  <div className="aspect-[1/1.41] bg-white border border-zinc-200 rounded shadow-sm group-hover:border-indigo-400 group-hover:ring-4 group-hover:ring-indigo-50 transition-all overflow-hidden relative">
                    <canvas
                      ref={(el) => { thumbRefs.current[idx + 1] = el; }}
                      width={A4_WIDTH * 0.15}
                      height={A4_HEIGHT * 0.15}
                      className="w-full h-full object-contain pointer-events-none"
                    />
                  </div>
                  <p className="text-[9px] mt-1.5 text-center font-bold text-zinc-400 group-hover:text-indigo-600">PAGE {idx + 1}</p>
                </div>
              ))}
            </div>
          </aside>
        </>
      )}
    </div>
  );
};

export default ImageCanvasStudio;