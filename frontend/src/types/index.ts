// Type definitions for the application

export type LayoutItem = {
  layoutId: string; // unique per layout instance
  imageId: string;  // original image id
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
};

export type AssetItem = {
  id: string;
  url: string;
  scale: number;
  origW: number;
  origH: number;
};

export type InteractionState = {
  type: "move" | "resize";
  itemId: string;
  startMouse: { x: number; y: number };
  initialItem: { x: number; y: number; width: number; height: number };
  handle?: string;
} | null;

export interface UserActivityStatus {
  user_id: string;
  last_activity: string;
  inactive_duration_seconds: number;
  is_inactive: boolean;
}