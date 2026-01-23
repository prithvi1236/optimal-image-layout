import { useRef, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import { supabase } from "./Components/supabaseClient";
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
} from "lucide-react";
import BuyMeACoffee from "./BuyMeACoffee";
import SidebarCoffeeButton from "./SidebarCoffeeButton";
// import { sessionManager } from "./sessionManager";


type LayoutItem = {
  layoutId: string; // ✅ unique per layout instance
  imageId: string;  // original image id
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
const API_URL = import.meta.env.VITE_API_URL;
const MAX_CONTENT_WIDTH = A4_WIDTH - 80;   // margin * 2
const MAX_CONTENT_HEIGHT = A4_HEIGHT - 80;
const HANDLE_SIZE = 10;

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
  const [isReflowing, setIsReflowing] = useState(false);
  const [loadedImages, setLoadedImages] = useState<
    Record<string, HTMLImageElement>
  >({});
  // const [sessionInfo, setSessionInfo] = useState<{
  //   image_count: number;
  //   max_images: number;
  //   remaining_images: number;
  // } | null>(null);

  // Interaction
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);

  const [interaction, setInteraction] = useState<InteractionState>(null);
  const [viewZoom, setViewZoom] = useState(0.6);
  const [activePageIndex, setActivePageIndex] = useState(1);

  const hasContent = assets.length > 0;

  // ================= SESSION MANAGEMENT =================
  
  // useEffect(() => {
  //   // Initialize session and load session info
  //   const initSession = async () => {
  //     try {
  //       const info = await sessionManager.getSessionInfo();
  //       setSessionInfo(info);
  //     } catch (error) {
  //       console.error('Failed to initialize session:', error);
  //     }
  //   };
    
  //   initSession();
  // }, []);

  // const updateSessionInfo = async () => {
  //   try {
  //     const info = await sessionManager.getSessionInfo();
  //     setSessionInfo(info);
  //   } catch (error) {
  //     console.error('Failed to update session info:', error);
  //   }
  // };

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

    // 1. Get Token
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    // 2. Post to /layout with Auth header
    const response = await axios.post(`${API_URL}/layout`, 
      { items: payloadItems, margin: 40, gap: 20 },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const newLayout: LayoutItem[] = [];
    Object.entries(response.data.layout).forEach(([page, items]: any) => {
      items.forEach((it: any) => {
        newLayout.push({
          layoutId: `${it.image_id}-${page}-${Math.random()}`,
          imageId: it.image_id,
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
    console.error("Layout error:", err);
  } finally {
    setLoading(false);
  }
}, []);

  // 2. DELETE IMAGE (Frontend + Backend)
  // const handleDelete = async (idToDelete: string) => {
  //   if (!idToDelete) return;

  //   // 1. Optimistic UI Update: Remove immediately
  //   const updatedAssets = assets.filter((a) => a.id !== idToDelete);
  //   setAssets(updatedAssets);
  //   setSelectedLayoutId(null); // Deselect

  //   // 2. Trigger Layout Reflow
  //   generateLayout(updatedAssets);

  //   // 3. Call Backend to delete file
  //   try {
  //     await axios.post(`${API_URL}/delete_image`, { image_id: idToDelete });
  //   } catch (err) {
  //     console.error("Failed to delete on server", err);
  //     // Optional: Revert UI if server fails? Usually not needed for simple tools.
  //   }
  // };

  const handleDelete = async (imageIdToDelete: string) => {
  if (!imageIdToDelete) return;

  // Optimistic UI Removal
  const updatedAssets = assets.filter(a => a.id !== imageIdToDelete);
  setAssets(updatedAssets);
  setLayoutImages(prev => prev.filter(li => li.imageId !== imageIdToDelete));
  setSelectedLayoutId(null);

  setIsReflowing(true);
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    // Wait for server to delete
    await axios.post(`${API_URL}/delete_image`, 
      { image_id: imageIdToDelete },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Trigger optimized reflow for remaining items
    await generateLayout(updatedAssets);
  } catch (err) {
    console.error("Deletion sync error:", err);
  } finally {
    setIsReflowing(false);
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

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await axios.post(`${API_URL}/extract_img`, fd, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const newAssets: AssetItem[] = res.data.images.map((img: any) => ({
      id: img.id,
      url: img.url, 
      scale: getFitScale(img.width, img.height),
      origW: img.width,
      origH: img.height,
    }));

    const updatedAll = [...assets, ...newAssets];
    setAssets(updatedAll);
    
    // Always let the server decide the layout for the whole batch
    await generateLayout(updatedAll);
  } catch (err) {
    console.error("Upload error:", err);
  } finally {
    setLoading(false);
  }
};



  // 4. IMAGE LOADING
  useEffect(() => {
  if (layoutImages.length === 0) return;

  layoutImages.forEach(img => {
    if (loadedImages[img.imageId]) return;

    const im = new Image();
    im.crossOrigin = "anonymous";
    im.src = img.url;
    im.onload = () =>
      setLoadedImages(prev => ({ ...prev, [img.imageId]: im }));
  });
}, [layoutImages, loadedImages]);

  // Update layout locally (visual only)
  const updateLocalLayout = (layoutId: string, updates: Partial<LayoutItem>) => {
  setLayoutImages(prev =>
    prev.map(item =>
      item.layoutId === layoutId ? { ...item, ...updates } : item
    )
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
        const im = loadedImages[img.imageId];

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
        const im = loadedImages[img.imageId];

        if (im) ctx.drawImage(im, img.x, img.y, img.width, img.height);

        // Inside PageCanvas render loop
if (selectedLayoutId === img.layoutId) {
    ctx.strokeStyle = "#4f46e5";
    ctx.lineWidth = 2;
    ctx.strokeRect(img.x, img.y, img.width, img.height);

    ctx.fillStyle = "#ffffff";
    const handles = [
        { x: img.x, y: img.y, type: "nw" },             // Top Left
        { x: img.x + img.width / 2, y: img.y, type: "n" }, // Top Center
        { x: img.x + img.width, y: img.y, type: "ne" },    // Top Right
        { x: img.x, y: img.y + img.height / 2, type: "w" }, // Mid Left
        { x: img.x + img.width, y: img.y + img.height / 2, type: "e" }, // Mid Right
        { x: img.x, y: img.y + img.height, type: "sw" },    // Bottom Left
        { x: img.x + img.width / 2, y: img.y + img.height, type: "s" }, // Bottom Center
        { x: img.x + img.width, y: img.y + img.height, type: "se" },    // Bottom Right
    ];
    
    handles.forEach((h) => {
        ctx.beginPath();
        ctx.rect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        ctx.fill();
        ctx.stroke();
    });
}
      });
    }, [pageItems, loadedImages, selectedLayoutId]);

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
    let handleType: string | null = null;
    let clickedItem: LayoutItem | null = null;
    const hw = HANDLE_SIZE + 5;

    // 1. FIRST PRIORITY: Check if a resizing handle of the SELECTED item was clicked
    const selectedItemOnPage = pageItems.find(i => i.layoutId === selectedLayoutId);
    
    if (selectedItemOnPage) {
        const img = selectedItemOnPage;
        // Corner handles
        if (Math.abs(x - img.x) < hw && Math.abs(y - img.y) < hw) handleType = "nw";
        else if (Math.abs(x - (img.x + img.width)) < hw && Math.abs(y - img.y) < hw) handleType = "ne";
        else if (Math.abs(x - img.x) < hw && Math.abs(y - (img.y + img.height)) < hw) handleType = "sw";
        else if (Math.abs(x - (img.x + img.width)) < hw && Math.abs(y - (img.y + img.height)) < hw) handleType = "se";
        // Edge handles (North, South, West, East)
        else if (Math.abs(x - (img.x + img.width / 2)) < hw && Math.abs(y - img.y) < hw) handleType = "n";
        else if (Math.abs(x - (img.x + img.width / 2)) < hw && Math.abs(y - (img.y + img.height)) < hw) handleType = "s";
        else if (Math.abs(x - img.x) < hw && Math.abs(y - (img.y + img.height / 2)) < hw) handleType = "w";
        else if (Math.abs(x - (img.x + img.width)) < hw && Math.abs(y - (img.y + img.height / 2)) < hw) handleType = "e";

        if (handleType) clickedItem = img;
    }

    // 2. SECOND PRIORITY: If no handle was clicked, check if the body of any image was clicked
    if (!handleType) {
        // Search from top to bottom (reverse list) to grab the topmost image
        for (let i = pageItems.length - 1; i >= 0; i--) {
            const img = pageItems[i];
            if (x >= img.x && x <= img.x + img.width && y >= img.y && y <= img.y + img.height) {
                clickedItem = img;
                break;
            }
        }
    }

    // 3. EXECUTION: Set interaction state
    if (clickedItem) {
        setSelectedLayoutId(clickedItem.layoutId);
        setInteraction({
            type: handleType ? "resize" : "move",
            itemId: clickedItem.layoutId,
            startMouse: { x, y },
            initialItem: { ...clickedItem },
            handle: handleType || undefined,
        });
    } else {
        setSelectedLayoutId(null);
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
    let newX = init.x;
    let newY = init.y;
    let newW = init.width;
    let newH = init.height;

    // Handle stretching from the Left/West
    if (interaction.handle?.includes("w")) {
      newX = init.x + dx;
      newW = init.width - dx;
    }
    // Handle stretching from the Right/East
    if (interaction.handle?.includes("e")) {
      newW = init.width + dx;
    }
    // Handle stretching from the Top/North
    if (interaction.handle?.includes("n")) {
      newY = init.y + dy;
      newH = init.height - dy;
    }
    // Handle stretching from the Bottom/South
    if (interaction.handle?.includes("s")) {
      newH = init.height + dy;
    }

    // MINIMUM SIZE SAFETY: Prevent images from disappearing
    if (newW > 20 && newH > 20) {
      updateLocalLayout(interaction.itemId, { 
        x: newX, 
        y: newY, 
        width: newW, 
        height: newH 
      });
    }
  }
};

    const handleMouseUp = () => {
  if (interaction?.type === "resize") {
    const item = layoutImages.find(
      i => i.layoutId === interaction.itemId
    );
    if (!item) return;

    const asset = assets.find(
      a => a.id === item.imageId
    );
    if (!asset) return;

    const newScale = item.width / asset.origW;

    const updatedAssets = assets.map(a =>
      a.id === asset.id ? { ...a, scale: newScale } : a
    );

    setAssets(updatedAssets);
    generateLayout(updatedAssets);
  }

  setInteraction(null);
};


    // 🔹 FIND SELECTED ITEM ON THIS PAGE TO RENDER OVERLAY
    const selectedItemOnPage = pageItems.find(
  i => i.layoutId === selectedLayoutId
);


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
  e.stopPropagation();
  handleDelete(selectedItemOnPage.imageId);
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
          
          <div className="mt-2 relative w-full flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 py-2.5 rounded-lg border border-emerald-200 cursor-pointer transition-all">
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

        {!hasContent ? (
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
        ) : (
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
        )}

        {/* Coffee button at bottom of sidebar */}
        <div className="p-4 border-t border-zinc-200 bg-white">
          <SidebarCoffeeButton />
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
            <BuyMeACoffee className="mr-2" />
            <button
              onClick={async () => {
                await supabase.auth.signOut();
              }}
              className="p-2 hover:bg-zinc-50 text-zinc-400 hover:text-zinc-600 rounded-lg transition-colors"
              title="Sign Out"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16,17 21,12 16,7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
            <button
              onClick={() => {
                setAssets([]);
                setPageCount(1);
                setLayoutImages([]);
              }}
              className="p-2 hover:bg-red-50 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
              title="Clear All & Reset Session"
            >
              <Trash2 size={18} />
            </button>
            {hasContent && (
              <button
                onClick={exportToPDF}
                className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-zinc-800 shadow-md"
              >
                <Download size={14} /> Export
              </button>
            )}
          </div>
        </header>

        {!hasContent ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="absolute top-6 right-6">
              <BuyMeACoffee />
            </div>
            <h1 className="text-4xl font-black mb-6 text-zinc-800">
              Smart Layout Studio
            </h1>
            <div className="border-2 border-dashed border-zinc-300 p-16 rounded-2xl hover:bg-white hover:border-indigo-400 cursor-pointer relative group transition-all max-w-lg">
              <div className="flex flex-col items-center gap-4">
                <Upload className="w-12 h-12 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
                <span className="text-zinc-500 font-medium">
                  Click to Upload Images or PDF
                </span>
                <span className="text-xs text-zinc-400">
                  Or use the sidebar buttons to get started
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
                  <PageCanvas pageIndex={idx + 1} />
                </div>
                <div className="text-center mt-3 text-[10px] font-bold text-zinc-300 uppercase tracking-widest transform scale-[1/viewZoom]">
                  A4 Sheet {idx + 1}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ImageCanvasStudio;