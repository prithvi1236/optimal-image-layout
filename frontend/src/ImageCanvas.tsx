import { useRef, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import {
  Upload,
  Download,
  Trash2,
  Loader2,
  ZoomIn,
  ZoomOut,
  Layers,
  RefreshCw,
  Plus,
  X,
  LayoutTemplate,
} from "lucide-react";

// ================= TYPES =================
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
  origW: number;
  origH: number;
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
const HANDLE_SIZE = 10;

const ImageCanvasStudio: React.FC = () => {
  // ================= STATE =================
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [layoutImages, setLayoutImages] = useState<LayoutItem[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadedImages, setLoadedImages] = useState<
    Record<string, HTMLImageElement>
  >({});

  // Interaction
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<InteractionState>(null);
  const [viewZoom, setViewZoom] = useState(0.6);
  const [activePageIndex, setActivePageIndex] = useState(1);

  const hasContent = assets.length > 0;

  // ================= API =================

  // 1. GENERATE LAYOUT
  const generateLayout = useCallback(async (currentAssets: AssetItem[]) => {
    if (currentAssets.length === 0) {
      setLayoutImages([]);
      setPageCount(1);
      return;
    }
    setLoading(true);
    try {
      const payloadItems = currentAssets.map((a) => ({
        id: a.id,
        scale: a.scale,
      }));
      const response = await axios.post(`${API_URL}/layout`, {
        items: payloadItems,
        margin: 40,
        gap: 20,
      });

      const newLayout: LayoutItem[] = [];
      Object.entries(response.data.layout).forEach(([page, items]: any) => {
        items.forEach((it: any) => {
          newLayout.push({
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
      setLayoutImages(newLayout);
      setPageCount(response.data.page_count || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. DELETE IMAGE
  const handleDelete = async (idToDelete: string) => {
    if (!idToDelete) return;
    const updatedAssets = assets.filter((a) => a.id !== idToDelete);
    setAssets(updatedAssets);
    setSelectedId(null);
    generateLayout(updatedAssets);
    try {
      await axios.post(`${API_URL}/delete_image`, { image_id: idToDelete });
    } catch (err) {}
  };

  // 3. UPLOAD (MULTIPLE FILES)
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setLoading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((file) => {
        fd.append("files", file);
      });

      const res = await axios.post(`${API_URL}/extract_img`, fd);

      const newAssets: AssetItem[] = res.data.images.map((img: any) => ({
        id: img.id,
        url: `${API_URL}/output/${img.id}.png`,
        scale: 1.0,
        origW: img.width,
        origH: img.height,
      }));

      const updated = [...assets, ...newAssets];
      setAssets(updated);
      await generateLayout(updated);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  // 4. IMAGE LOADING
  useEffect(() => {
    if (layoutImages.length === 0) return;
    layoutImages.forEach((img) => {
      if (loadedImages[img.id]) return;
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.src = img.url;
      im.onload = () => setLoadedImages((prev) => ({ ...prev, [img.id]: im }));
    });
  }, [layoutImages]);

  // Update layout locally (visual only)
  const updateLocalLayout = (id: string, updates: Partial<LayoutItem>) => {
    setLayoutImages((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const exportToPDF = () => {
    const pdf = new jsPDF("p", "mm", "a4");
    for (let p = 1; p <= pageCount; p++) {
      const canvas = document.getElementById(
        `canvas-page-${p}`
      ) as HTMLCanvasElement;
      if (canvas) {
        if (p > 1) pdf.addPage();
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 1.0),
          "JPEG",
          0,
          0,
          210,
          297
        );
      }
    }
    pdf.save("smart_layout.pdf");
  };

  // ================= SUB-COMPONENTS =================

  const ThumbnailCanvas = ({ pageIndex }: { pageIndex: number }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pageItems = layoutImages.filter((img) => img.page === pageIndex);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const SCALE = 0.15;
      ctx.clearRect(0, 0, A4_WIDTH * SCALE, A4_HEIGHT * SCALE);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, A4_WIDTH * SCALE, A4_HEIGHT * SCALE);
      ctx.save();
      ctx.scale(SCALE, SCALE);
      pageItems.forEach((img) => {
        const im = loadedImages[img.id];
        if (im) ctx.drawImage(im, img.x, img.y, img.width, img.height);
        else {
          ctx.fillStyle = "#e5e7eb";
          ctx.fillRect(img.x, img.y, img.width, img.height);
        }
      });
      ctx.restore();
    }, [pageItems, loadedImages]);

    return (
      <canvas
        ref={canvasRef}
        width={A4_WIDTH * 0.15}
        height={A4_HEIGHT * 0.15}
        className="block"
      />
    );
  };

  const PageCanvas = ({ pageIndex }: { pageIndex: number }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pageItems = layoutImages.filter((img) => img.page === pageIndex);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, A4_WIDTH, A4_HEIGHT);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

      pageItems.forEach((img) => {
        const im = loadedImages[img.id];
        if (im) ctx.drawImage(im, img.x, img.y, img.width, img.height);

        if (selectedId === img.id) {
          ctx.strokeStyle = "#4f46e5";
          ctx.lineWidth = 2;
          ctx.strokeRect(img.x, img.y, img.width, img.height);

          ctx.fillStyle = "#ffffff";
          const handles = [
            { x: img.x, y: img.y },
            { x: img.x + img.width, y: img.y },
            { x: img.x, y: img.y + img.height },
            { x: img.x + img.width, y: img.y + img.height },
          ];
          handles.forEach((h) => {
            ctx.beginPath();
            ctx.rect(
              h.x - HANDLE_SIZE / 2,
              h.y - HANDLE_SIZE / 2,
              HANDLE_SIZE,
              HANDLE_SIZE
            );
            ctx.fill();
            ctx.stroke();
          });
        }
      });
    }, [pageItems, loadedImages, selectedId]);

    const getMousePos = (e: React.MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / viewZoom,
        y: (e.clientY - rect.top) / viewZoom,
      };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      const { x, y } = getMousePos(e);
      let clickedItem = null;
      let handleType = null;

      for (let i = pageItems.length - 1; i >= 0; i--) {
        const img = pageItems[i];
        if (selectedId === img.id) {
          const hw = HANDLE_SIZE + 5;
          if (Math.abs(x - img.x) < hw && Math.abs(y - img.y) < hw)
            handleType = "nw";
          else if (
            Math.abs(x - (img.x + img.width)) < hw &&
            Math.abs(y - img.y) < hw
          )
            handleType = "ne";
          else if (
            Math.abs(x - img.x) < hw &&
            Math.abs(y - (img.y + img.height)) < hw
          )
            handleType = "sw";
          else if (
            Math.abs(x - (img.x + img.width)) < hw &&
            Math.abs(y - (img.y + img.height)) < hw
          )
            handleType = "se";
        }
        if (handleType) {
          clickedItem = img;
          break;
        }
        if (
          x >= img.x &&
          x <= img.x + img.width &&
          y >= img.y &&
          y <= img.y + img.height
        ) {
          clickedItem = img;
          break;
        }
      }

      if (clickedItem) {
        setSelectedId(clickedItem.id);
        setInteraction({
          type: handleType ? "resize" : "move",
          itemId: clickedItem.id,
          startMouse: { x, y },
          initialItem: { ...clickedItem },
          handle: handleType || undefined,
        });
      } else {
        setSelectedId(null);
      }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      const { x, y } = getMousePos(e);
      const hoverItem = pageItems.find(
        (img) =>
          x >= img.x &&
          x <= img.x + img.width &&
          y >= img.y &&
          y <= img.y + img.height
      );
      if (canvasRef.current)
        canvasRef.current.style.cursor = interaction
          ? interaction.type === "move"
            ? "grabbing"
            : "nwse-resize"
          : hoverItem
          ? "grab"
          : "default";

      if (!interaction) return;
      const dx = x - interaction.startMouse.x;
      const dy = y - interaction.startMouse.y;
      const init = interaction.initialItem;

      if (interaction.type === "move") {
        updateLocalLayout(interaction.itemId, {
          x: init.x + dx,
          y: init.y + dy,
        });
      } else if (interaction.type === "resize") {
        let newW = init.width,
          newH = init.height;
        if (interaction.handle?.includes("e"))
          newW = Math.max(50, init.width + dx);
        if (interaction.handle?.includes("s"))
          newH = Math.max(50, init.height + dy);
        const ratio = init.width / init.height;
        if (interaction.handle?.includes("e")) newH = newW / ratio;
        if (interaction.handle?.includes("s")) newW = newH * ratio;
        updateLocalLayout(interaction.itemId, { width: newW, height: newH });
      }
    };

    const handleMouseUp = () => {
      if (interaction?.type === "resize") {
        const item = layoutImages.find((i) => i.id === interaction.itemId);
        const asset = assets.find((a) => a.id === interaction.itemId);
        if (item && asset) {
          const newScale = item.width / asset.origW;
          const updatedAssets = assets.map((a) =>
            a.id === asset.id ? { ...a, scale: newScale } : a
          );
          setAssets(updatedAssets);
          generateLayout(updatedAssets);
        }
      }
      setInteraction(null);
    };

    const selectedItemOnPage = pageItems.find((i) => i.id === selectedId);

    return (
      <div className="relative w-full h-full">
        <canvas
          id={`canvas-page-${pageIndex}`}
          ref={canvasRef}
          width={A4_WIDTH}
          height={A4_HEIGHT}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setInteraction(null)}
          className="block"
        />
        {selectedItemOnPage && (
          <div
            className="absolute flex items-center justify-center bg-red-500 text-white rounded-full w-6 h-6 shadow-md cursor-pointer hover:bg-red-600 hover:scale-110 transition-all z-10"
            style={{
              left: selectedItemOnPage.x + selectedItemOnPage.width - 12,
              top: selectedItemOnPage.y - 12,
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(selectedItemOnPage.id);
            }}
            title="Delete Image"
          >
            <X size={14} strokeWidth={3} />
          </div>
        )}
      </div>
    );
  };

  // ================= UI RENDER =================
  return (
    <div className="flex h-screen w-full bg-zinc-100 text-zinc-900 font-sans overflow-hidden">
      {!hasContent ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50/50 relative overflow-hidden">
          {/* 1. DECORATIVE BACKGROUND GRID */}
          <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
            <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-indigo-500 opacity-20 blur-[100px]"></div>
          </div>

          {/* 2. MAIN CONTENT WRAPPER */}
          <div className="relative z-10 max-w-2xl w-full flex flex-col items-center">
            {/* 3. HERO TITLE SECTION */}
            <div className="text-center mb-10 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-zinc-900">
                Smart Layout{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500">
                  Studio
                </span>
              </h1>

              <p className="text-zinc-500 text-lg max-w-md mx-auto leading-relaxed">
                Drag, drop, and let AI organize your chaos. Turn scattered
                images and PDFs into perfect A4 sheets in seconds.
              </p>
            </div>

            {/* 4. CREATIVE UPLOAD CARD */}
            <div className="relative group w-full max-w-md perspective-1000">
              {/* Floating Decorative Elements (Abstract 'Files') */}
              <div className="absolute -left-12 top-10 w-24 h-32 bg-white rounded-lg shadow-xl border border-zinc-100 -rotate-12 z-0 opacity-0 group-hover:opacity-100 group-hover:-translate-x-4 transition-all duration-500 delay-75"></div>
              <div className="absolute -right-12 top-20 w-24 h-32 bg-white rounded-lg shadow-xl border border-zinc-100 rotate-12 z-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-4 transition-all duration-500 delay-100"></div>

              {/* The Glow Effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl blur opacity-20 group-hover:opacity-60 transition duration-500 group-hover:duration-200"></div>

              {/* The Main Dropzone */}
              <div className="relative bg-white/80 backdrop-blur-xl border border-zinc-200 p-12 rounded-xl shadow-2xl flex flex-col items-center text-center gap-6 transition-transform duration-300 group-hover:-translate-y-1">
                <div className="relative">
                  <div className="absolute inset-0 bg-indigo-100 rounded-full scale-150 opacity-0 group-hover:scale-125 group-hover:opacity-100 transition-all duration-500"></div>
                  <div className="relative bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 group-hover:border-indigo-100 transition-colors">
                    <Upload className="w-8 h-8 text-zinc-400 group-hover:text-indigo-600 transition-colors duration-300" />
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-zinc-800 group-hover:text-indigo-600 transition-colors">
                    Drop your assets here
                  </h3>
                  <p className="text-sm font-medium text-zinc-400">
                    or click to browse local files
                  </p>
                </div>

                {/* Supported Formats Badge */}
                <div className="flex gap-2 justify-center mt-2">
                  {["JPG", "PNG", "PDF"].map((fmt) => (
                    <span
                      key={fmt}
                      className="px-2 py-1 bg-zinc-50 border border-zinc-100 rounded text-[10px] font-bold text-zinc-400"
                    >
                      {fmt}
                    </span>
                  ))}
                </div>

                {/* The Actual Input */}
                <input
                  type="file"
                  multiple
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"
                  onChange={(e) => handleUpload(e.target.files)}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* SIDEBAR */}
          <aside className="w-64 bg-white border-r border-zinc-200 flex flex-col z-20 shadow-xl">
            {/* APP NAME HEADER */}
            <div className="h-16 flex items-center px-5 border-b border-zinc-100 bg-white">
              <div className="bg-indigo-600 p-1.5 rounded-lg mr-3 shadow-indigo-100 shadow-md">
                <LayoutTemplate className="text-white w-5 h-5" />
              </div>
              <span className="font-bold text-lg text-zinc-800 tracking-tight">
                Smart Layout Tool
              </span>
            </div>

            {/* PAGES HEADER */}
            <div className="flex items-center justify-between px-5 py-3 bg-zinc-50 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-zinc-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Pages
                </span>
              </div>
              <span className="bg-zinc-200 text-zinc-700 px-2 py-0.5 rounded-md text-[10px] font-bold min-w-[24px] text-center">
                {pageCount}
              </span>
            </div>

            {/* ADD MORE BUTTON */}
            <div className="p-4 bg-white">
              <div className="relative w-full flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-3 rounded-xl border border-indigo-200 transition-all cursor-pointer group shadow-sm">
                <Plus
                  size={16}
                  className="group-hover:scale-110 transition-transform"
                />
                <span className="text-xs font-bold">Add Images / PDF</span>
                <input
                  type="file"
                  multiple
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => handleUpload(e.target.files)}
                />
              </div>
            </div>

            {/* THUMBNAILS LIST */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-zinc-50/30">
              {Array.from({ length: pageCount }).map((_, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setActivePageIndex(idx + 1);
                    document
                      .getElementById(`page-wrapper-${idx + 1}`)
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={`group cursor-pointer flex flex-col items-center gap-2 transition-opacity duration-200 ${
                    activePageIndex === idx + 1
                      ? "opacity-100"
                      : "opacity-60 hover:opacity-100"
                  }`}
                >
                  <div
                    className={`relative border-2 rounded bg-white overflow-hidden shadow-sm transition-all ${
                      activePageIndex === idx + 1
                        ? "border-indigo-600 ring-2 ring-indigo-50 scale-105"
                        : "border-zinc-200 group-hover:border-indigo-300"
                    }`}
                  >
                    <ThumbnailCanvas pageIndex={idx + 1} />
                  </div>
                  <span
                    className={`text-[10px] font-bold ${
                      activePageIndex === idx + 1
                        ? "text-indigo-600"
                        : "text-zinc-400"
                    }`}
                  >
                    Page {idx + 1}
                  </span>
                </div>
              ))}
            </div>
          </aside>

          {/* MAIN AREA */}
          <main className="flex-1 flex flex-col bg-zinc-200/50 overflow-hidden relative">
            <header className="h-16 bg-white border-b border-zinc-200 px-8 flex items-center justify-between z-10 shadow-sm">
              {/* Status */}
              <div className="flex items-center gap-3">
                {loading ? (
                  <Loader2 size={18} className="animate-spin text-indigo-600" />
                ) : (
                  <RefreshCw size={18} className="text-indigo-600" />
                )}
                <div>
                  <div className="text-xs font-bold text-zinc-900">
                    {loading ? "Optimizing Layout..." : "Smart Reflow Active"}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-medium">
                    Auto-packing enabled
                  </div>
                </div>
              </div>

              {/* Zoom */}
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 bg-zinc-100 rounded-full px-4 py-1.5 border border-zinc-200 shadow-inner">
                <ZoomOut
                  size={16}
                  onClick={() => setViewZoom((z) => Math.max(0.2, z - 0.1))}
                  className="cursor-pointer text-zinc-500 hover:text-black transition-colors"
                />
                <span className="text-xs font-mono min-w-[36px] text-center font-bold text-zinc-700">
                  {Math.round(viewZoom * 100)}%
                </span>
                <ZoomIn
                  size={16}
                  onClick={() => setViewZoom((z) => Math.min(1.5, z + 0.1))}
                  className="cursor-pointer text-zinc-500 hover:text-black transition-colors"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setAssets([]);
                    setPageCount(1);
                  }}
                  className="p-2.5 hover:bg-red-50 text-zinc-400 hover:text-red-500 rounded-lg transition-colors border border-transparent hover:border-red-100"
                >
                  <Trash2 size={18} />
                </button>
                <button
                  onClick={exportToPDF}
                  className="bg-zinc-900 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-zinc-800 shadow-lg shadow-zinc-200 active:scale-95 transition-all"
                >
                  <Download size={16} /> Export PDF
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-auto p-12 flex flex-col items-center gap-10 scroll-smooth">
              {Array.from({ length: pageCount }).map((_, idx) => (
                <div
                  key={idx}
                  id={`page-wrapper-${idx + 1}`}
                  className="transition-transform origin-top duration-300"
                  style={{
                    transform: `scale(${viewZoom})`,
                    marginBottom: -((1 - viewZoom) * A4_HEIGHT),
                  }}
                >
                  <div className="bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] relative rounded-sm overflow-hidden border border-zinc-100">
                    <PageCanvas pageIndex={idx + 1} />
                  </div>
                  <div className="text-center mt-4 text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em] transform scale-[1/viewZoom]">
                    A4 Sheet {idx + 1}
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
