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
  MousePointer2,
  Layers,
  RefreshCw,
  Plus,
  X,
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
const MAX_CONTENT_WIDTH = A4_WIDTH - 80;   // margin * 2
const MAX_CONTENT_HEIGHT = A4_HEIGHT - 80;
const HANDLE_SIZE = 10;
const STORAGE_KEY = "smart_layout_state_v1";

const getFitScale = (w: number, h: number) => {
  const scaleW = MAX_CONTENT_WIDTH / w;
  const scaleH = MAX_CONTENT_HEIGHT / h;
  return Math.min(1, scaleW, scaleH); // never upscale
};
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

  // 2. DELETE IMAGE (Frontend + Backend)
  const handleDelete = async (idToDelete: string) => {
    if (!idToDelete) return;

    // 1. Optimistic UI Update: Remove immediately
    const updatedAssets = assets.filter((a) => a.id !== idToDelete);
    setAssets(updatedAssets);
    setSelectedId(null); // Deselect

    // 2. Trigger Layout Reflow
    generateLayout(updatedAssets);

    // 3. Call Backend to delete file
    try {
      await axios.post(`${API_URL}/delete_image`, { image_id: idToDelete });
    } catch (err) {
      console.error("Failed to delete on server", err);
      // Optional: Revert UI if server fails? Usually not needed for simple tools.
    }
  };

  const MARGIN = 40;
const GAP = 20;

const getLastPageCursor = (page: number) => {
  const items = layoutImages.filter(i => i.page === page);
  let y = MARGIN;
  items.forEach(img => {
    y = Math.max(y, img.y + img.height + GAP);
  });
  return y;
};


  // 3. UPLOAD
 const handleUpload = async (uploadedFile: File, extractFigures = false) => {
  setLoading(true);

  try {
    const fd = new FormData();
    fd.append("file", uploadedFile);
    if (extractFigures) fd.append("extract_figures", "1");

    const res = await axios.post(`${API_URL}/extract_img`, fd);

    const newAssets: AssetItem[] = res.data.images.map((img: any) => ({
      id: img.id,
      url: `${API_URL}/output/${img.id}.png`,
      scale: getFitScale(img.width, img.height),
      origW: img.width,
      origH: img.height,
    }));

    /* ============================
       FIRST UPLOAD → FULL LAYOUT
       ============================ */
    if (assets.length === 0) {
      const updated = [...newAssets];
      setAssets(updated);
      await generateLayout(updated);
      return;
    }

    /* ============================
       SUBSEQUENT UPLOAD → APPEND
       ============================ */
    let currentPage = pageCount;
    let cursorY = getLastPageCursor(currentPage);

    const appendedLayouts: LayoutItem[] = [];

    newAssets.forEach((asset) => {
      const scaledW = asset.origW * asset.scale;
      const scaledH = asset.origH * asset.scale;

      if (cursorY + scaledH > A4_HEIGHT - MARGIN) {
        currentPage += 1;
        cursorY = MARGIN;
      }

      appendedLayouts.push({
        id: asset.id,
        url: asset.url,
        x: MARGIN,
        y: cursorY,
        width: scaledW,
        height: scaledH,
        page: currentPage,
      });

      cursorY += scaledH + GAP;
    });

    setAssets((prev) => [...prev, ...newAssets]);
    setLayoutImages((prev) => [...prev, ...appendedLayouts]);
    setPageCount((prev) => Math.max(prev, currentPage));
  } catch (err) {
    console.error(err);
  } finally {
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

    // Render Loop
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

    // Interaction Handlers
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

    // 🔹 FIND SELECTED ITEM ON THIS PAGE TO RENDER OVERLAY
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

        {/* 🔹 DELETE OVERLAY: Renders HTML button on top of Canvas */}
        {selectedItemOnPage && (
          <div
            className="absolute flex items-center justify-center bg-red-500 text-white rounded-full w-6 h-6 shadow-md cursor-pointer hover:bg-red-600 hover:scale-110 transition-all z-10"
            style={{
              // Position it at the top-right corner of the image
              left: selectedItemOnPage.x + selectedItemOnPage.width - 12, // -12 to center on corner
              top: selectedItemOnPage.y - 12,
            }}
            onClick={(e) => {
              e.stopPropagation(); // Prevent canvas click
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
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <h1 className="text-3xl font-black mb-6 text-zinc-800">
            Smart Layout Studio
          </h1>
          <div className="border-2 border-dashed border-zinc-300 p-16 rounded-2xl hover:bg-white hover:border-indigo-400 cursor-pointer relative group transition-all">
            <div className="flex flex-col items-center gap-4">
              <Upload className="w-12 h-12 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
              <span className="text-zinc-500 font-medium">
                Click to Upload Images or PDF
              </span>
            </div>
            <input
              type="file"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) =>
                e.target.files && handleUpload(e.target.files[0])
              }
            />
          </div>
        </div>
      ) : (
        <>
          {/* SIDEBAR */}
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
                  onChange={(e) =>
                    e.target.files && handleUpload(e.target.files[0])
                  }
                />
              </div>
              <div className="p-4 border-b border-zinc-100 bg-white z-10">
  <div className="relative w-full flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 py-2.5 rounded-lg border border-emerald-200 cursor-pointer transition-all">
    Extract Figures from Photo
    <input
      type="file"
      className="absolute inset-0 opacity-0 cursor-pointer"
      onChange={(e) =>
        e.target.files && handleUpload(e.target.files[0], true)
      }
    />
  </div>
</div>

            </div>

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
            <header className="h-14 bg-white border-b border-zinc-200 px-6 flex items-center justify-between z-10 shadow-sm">
              <div className="flex items-center gap-2">
                {loading ? (
                  <Loader2 size={16} className="animate-spin text-indigo-600" />
                ) : (
                  <RefreshCw size={16} className="text-indigo-600" />
                )}
                <span className="text-xs font-bold text-zinc-500">
                  {loading ? "Optimizing Layout..." : "Smart Reflow Active"}
                </span>
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
                <button
                  onClick={() => {
                    setAssets([]);
                    setPageCount(1);
                  }}
                  className="p-2 hover:bg-red-50 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
                >
                  <Trash2 size={18} />
                </button>
                <button
                  onClick={exportToPDF}
                  className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-zinc-800 shadow-md"
                >
                  <Download size={14} /> Export
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-auto p-12 flex flex-col items-center gap-8 scroll-smooth">
              {Array.from({ length: pageCount }).map((_, idx) => (
                <div
                  key={idx}
                  id={`page-wrapper-${idx + 1}`}
                  className="transition-transform origin-top"
                  style={{
                    transform: `scale(${viewZoom})`,
                    marginBottom: -((1 - viewZoom) * A4_HEIGHT),
                  }}
                >
                  <div className="bg-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] relative">
                    {/* Page Canvas renders the delete overlay internally */}
                    <PageCanvas pageIndex={idx + 1} />
                  </div>
                  <div className="text-center mt-3 text-[10px] font-bold text-zinc-300 uppercase tracking-widest transform scale-[1/viewZoom]">
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
