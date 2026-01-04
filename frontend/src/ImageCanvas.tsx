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

const ImageCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<CanvasImage[]>([]);
  const [pageCount, setPageCount] = useState<number>(1);
  const [loadedImages, setLoadedImages] = useState<{ [id: string]: HTMLImageElement }>({});

  useEffect(() => {
  const newLoadedImages: { [id: string]: HTMLImageElement } = {};
  images.forEach((img) => {
    const image = new Image();
    image.src = img.url;
    newLoadedImages[img.id] = image;
  });
  setLoadedImages(newLoadedImages);
}, [images]);


  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  /* 🔹 Upload & extract */
  const uploadAndExtract = async (): Promise<void> => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const extractRes = await axios.post<{ image_ids: string[] }>(
        "http://localhost:5000/extract_img",
        formData
      );

      const layoutRes = await axios.post("http://localhost:5000/layout", {
        image_ids: extractRes.data.image_ids,
        margin: 40,
        gap: 20,
        default_scale: 0.5,
      });

      const layoutData = layoutRes.data.layout;
      const newImages: CanvasImage[] = [];

      Object.entries(layoutData).forEach(([pageNum, items]: any) => {
        items.forEach((item: any) => {
          newImages.push({
            id: item.image_id,
            url: item.url,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            page: Number(pageNum),
          });
        });
      });

      setImages(newImages);
      setPageCount(Object.keys(layoutData).length);
    } catch (err: any) {
      console.error("Error uploading/extracting:", err);
    }
  };

  /* 🔹 Draw images with page breaks */
  const drawLayout = () => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = 794;
  canvas.height = 1123 * pageCount;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Page breaks
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1;
  for (let i = 1; i < pageCount; i++) {
    const y = i * 1123;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  images.forEach((item) => {
    const img = loadedImages[item.id];
    if (!img) return; // skip if not loaded yet

    ctx.drawImage(
      img,
      item.x,
      item.y + (item.page - 1) * 1123,
      item.width,
      item.height
    );

    if (item.id === selectedImageId) {
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        item.x,
        item.y + (item.page - 1) * 1123,
        item.width,
        item.height
      );
    }
  });
};


  useEffect(() => {
  drawLayout();
}, [images, pageCount, selectedImageId, loadedImages]);


  /* 🔹 Mouse Events */
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (let i = images.length - 1; i >= 0; i--) {
      const img = images[i];
      const imgY = img.y + (img.page - 1) * 1123;
      if (
        x >= img.x &&
        x <= img.x + img.width &&
        y >= imgY &&
        y <= imgY + img.height
      ) {
        setSelectedImageId(img.id);
        setDragOffset({ x: x - img.x, y: y - imgY });
        setIsDragging(true);
        return;
      }
    }
    setSelectedImageId(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    if (!isDragging || !selectedImageId) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setImages((prev) =>
      prev.map((img) =>
        img.id === selectedImageId
          ? { ...img, x: x - dragOffset.x, y: y - dragOffset.y - (img.page - 1) * 1123 }
          : img
      )
    );
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  /* 🔹 Resize selected image */
  const handleResize = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedImageId) return;
    const size = Number(e.target.value);
    setImages((prev) =>
      prev.map((img) =>
        img.id === selectedImageId ? { ...img, width: size, height: size } : img
      )
    );
  };

  return (
    <div>
      <input
        type="file"
        accept=".pdf,image/*"
        onChange={(e) => e.target.files && setFile(e.target.files[0])}
      />
      <button onClick={uploadAndExtract} style={{ marginLeft: "10px" }}>
        Generate Layout
      </button>

      {/* 🔹 Resize above canvas */}
      {selectedImageId && (
        <div style={{ margin: "10px 0" }}>
          <label>Resize Selected Image: </label>
          <input
            type="range"
            min={50}
            max={600}
            value={
              images.find((img) => img.id === selectedImageId)?.width || 50
            }
            onChange={handleResize}
          />
        </div>
      )}

      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ border: "1px solid #ccc", cursor: "move" }}
      />
    </div>
  );
};

export default ImageCanvas;
