"""
Layout generation service using rectpack algorithm
"""
import json
from typing import Dict, Any, List, Generator
from rectpack import newPacker, PackingMode, MaxRectsBssf, SORT_DIFF, SORT_NONE
from database import get_supabase_client
from services.storage_service import get_public_url
from config import A4_WIDTH, A4_HEIGHT

class LayoutService:
    def __init__(self):
        self.supabase = get_supabase_client()

    def generate_streaming_layout(self, items: List[Dict[str, Any]], margin: int = 40, gap: int = 20) -> Generator[str, None, None]:
        """Generate layout using streaming response"""
        if not items:
            yield f"data: {json.dumps({'type': 'complete', 'total_pages': 0})}\n\n"
            return

        # Fetch images from database
        item_ids = [item["id"] for item in items]
        db_imgs = self.supabase.table("images").select("*").in_("id", item_ids).execute()
        img_map = {img["id"]: img for img in db_imgs.data}

        usable_w = A4_WIDTH - 2 * margin
        usable_h = A4_HEIGHT - 2 * margin

        # Prepare rectangles
        remaining = []
        for item in items:
            img = img_map.get(item["id"])
            if not img:
                continue

            scale = float(item.get("scale", 1.0))
            w = int(img["width"] * scale)
            h = int(img["height"] * scale)

            if w > usable_w or h > usable_h:
                ratio = min(usable_w / w, usable_h / h)
                w = int(w * ratio)
                h = int(h * ratio)

            remaining.append({
                "id": item["id"],
                "w": w,
                "h": h,
                "path": img["storage_path"]
            })

        page_num = 1

        while remaining:
            packer = newPacker(
                mode=PackingMode.Offline,
                pack_algo=MaxRectsBssf,
                sort_algo=SORT_DIFF
            )

            packer.add_bin(usable_w, usable_h)

            for r in remaining:
                packer.add_rect(r["w"], r["h"], r["id"])

            packer.pack()

            placed_ids = set()
            page_items = []

            for b, x, y, w, h, rid in packer.rect_list():
                if b != 0:
                    continue

                r = next(r for r in remaining if r["id"] == rid)

                page_items.append({
                    "image_id": rid,
                    "x": x + margin + gap // 2,
                    "y": y + margin + gap // 2,
                    "width": w - gap,
                    "height": h - gap,
                    "url": get_public_url(r["path"])
                })

                placed_ids.add(rid)

            if not page_items:
                break

            yield f"data: {json.dumps({'type': 'page', 'page': page_num, 'items': page_items})}\n\n"

            remaining = [r for r in remaining if r["id"] not in placed_ids]
            page_num += 1

        yield f"data: {json.dumps({'type': 'complete', 'total_pages': page_num - 1})}\n\n"