import { useRef, useState, useEffect } from "react";
import axios from "axios";

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
const HANDLE_SIZE = 8;

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

  /* ---------------------------------- */
  /* Load images once                   */
  /* ---------------------------------- */
  useEffect(() => {
    const map: Record<string, HTMLImageElement> = {};
    images.forEach((img) => {
      const im = new Image();
      im.src = img.url;
      map[img.id] = im;
    });
    setLoadedImages(map);
  }, [images]);

  /* ---------------------------------- */
  /* Upload & Layout                    */
  /* ---------------------------------- */
  const drawArrow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number
) => {
  const length = 14;
  const head = 6;

  // Main line
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx * length, y + dy * length);
  ctx.stroke();

  // Arrow head
  ctx.beginPath();
  ctx.moveTo(x + dx * length, y + dy * length);
  ctx.lineTo(
    x + dx * (length - head) - dy * head,
    y + dy * (length - head) + dx * head
  );
  ctx.lineTo(
    x + dx * (length - head) + dy * head,
    y + dy * (length - head) - dx * head
  );
  ctx.closePath();
  ctx.fill();
};

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

  const newImages: CanvasImage[] = [];

  Object.entries(layout.data.layout).forEach(([page, items]: any) => {
    items.forEach((it: any) => {
      newImages.push({
        id: `${it.image_id}_${crypto.randomUUID()}`,
        url: it.url,
        x: it.x,
        y: it.y,
        width: it.width,
        height: it.height,
        page: Number(page), // ✅ keeps the layout on same pages
      });
    });
  });

  setImages((prev) => [...prev, ...newImages]);
  setPageCount(Math.max(pageCount, Object.keys(layout.data.layout).length));
};




  /* ---------------------------------- */
  /* Draw Canvas                        */
  /* ---------------------------------- */
  const drawLayout = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = A4_WIDTH;
    canvas.height = A4_HEIGHT * pageCount;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Page breaks
    ctx.setLineDash([6, 6]);
    for (let i = 1; i < pageCount; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * A4_HEIGHT);
      ctx.lineTo(A4_WIDTH, i * A4_HEIGHT);
      ctx.strokeStyle = "#aaa";
      ctx.stroke();
    }
    ctx.setLineDash([]);

    images.forEach((img) => {
      const im = loadedImages[img.id];
      if (!im) return;

      const yOffset = (img.page - 1) * A4_HEIGHT;
      ctx.drawImage(im, img.x, img.y + yOffset, img.width, img.height);

      if (img.id === selectedImageId) {
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.strokeRect(img.x, img.y + yOffset, img.width, img.height);

        drawHandles(ctx, img, yOffset);
      }
    });
  };

  const drawHandles = (
  ctx: CanvasRenderingContext2D,
  img: CanvasImage,
  yOffset: number
) => {
  ctx.strokeStyle = "#222";
  ctx.fillStyle = "#222";
  ctx.lineWidth = 2;

  const left = img.x;
  const right = img.x + img.width;
  const top = img.y + yOffset;
  const bottom = img.y + img.height + yOffset;

  // ↖ NW
  drawArrow(ctx, left, top, -1, -1);

  // ↗ NE
  drawArrow(ctx, right, top, 1, -1);

  // ↙ SW
  drawArrow(ctx, left, bottom, -1, 1);

  // ↘ SE
  drawArrow(ctx, right, bottom, 1, 1);
};

const getCursorForHandle = (handle: ResizeHandle) => {
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  return "move";
};



  useEffect(drawLayout, [images, pageCount, selectedImageId, loadedImages]);
  const lastusedpage=pageCount;

  /* ---------------------------------- */
  /* Resize Handle Detection            */
  /* ---------------------------------- */
  const getResizeHandle = (x: number, y: number, img: CanvasImage): ResizeHandle => {
  const yOffset = (img.page - 1) * A4_HEIGHT;
  const map = {
    nw: [img.x, img.y + yOffset],
    ne: [img.x + img.width, img.y + yOffset],
    sw: [img.x, img.y + img.height + yOffset],
    se: [img.x + img.width, img.y + img.height + yOffset],
  };

  for (const k of Object.keys(map) as (keyof typeof map)[]) {
    const [hx, hy] = map[k];
    if (Math.abs(x - hx) < HANDLE_SIZE && Math.abs(y - hy) < HANDLE_SIZE) {
      return k as ResizeHandle;
    }
  }
  return null;
};

  /* ---------------------------------- */
  /* Mouse Events                       */
  /* ---------------------------------- */
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (let i = images.length - 1; i >= 0; i--) {
      const img = images[i];
      const yOffset = (img.page - 1) * A4_HEIGHT;

      const handle = getResizeHandle(x, y, img);
      if (handle) {
        setSelectedImageId(img.id);
        setResizeHandle(handle);
        setIsDragging(true);
        return;
      }

      if (
        x >= img.x &&
        x <= img.x + img.width &&
        y >= img.y + yOffset &&
        y <= img.y + img.height + yOffset
      ) {
        setSelectedImageId(img.id);
        setResizeHandle(null);
        setDragOffset({ x: x - img.x, y: y - (img.y + yOffset) });
        setIsDragging(true);
        return;
      }
    }
    setSelectedImageId(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !selectedImageId) return;

    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setImages((prev) =>
      prev.map((img) => {
        if (img.id !== selectedImageId) return img;

        const yOffset = (img.page - 1) * A4_HEIGHT;
        const copy = { ...img };

        if (resizeHandle === "se") {
          copy.width = Math.max(30, x - img.x);
          copy.height = Math.max(30, y - yOffset - img.y);
        } else if (resizeHandle === "nw") {
          const dx = img.x - x;
          const dy = img.y - (y - yOffset);
          copy.x = x;
          copy.y = y - yOffset;
          copy.width += dx;
          copy.height += dy;
        } else {
          copy.x = x - dragOffset.x;
          copy.y = y - dragOffset.y - yOffset;
        }
        return copy;
      })
    );
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setResizeHandle(null);
  };

  /* ---------------------------------- */
  /* UI                                 */
  /* ---------------------------------- */
  return (
    <div>
      <input
  type="file"
  multiple
  onChange={(e) => e.target.files && setFile(e.target.files[0])}
/>

      <button onClick={uploadAndExtract} style={{ marginLeft: 10 }}>
        Generate Layout
      </button>

      <canvas
  ref={canvasRef}
  onMouseDown={handleMouseDown}
  onMouseMove={handleMouseMove}
  onMouseUp={handleMouseUp}
  style={{
    border: "1px solid #ccc",
    marginTop: 10,
    cursor: resizeHandle ? getCursorForHandle(resizeHandle) : "move",
  }}
/>

    </div>
  );
};

export default ImageCanvas;
