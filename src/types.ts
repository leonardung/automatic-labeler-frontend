export type ProjectType = "segmentation" | "video_tracking_segmentation";

export interface MaskCategory {
  id: number;
  name: string;
  color: string;
}

export interface SegmentationPoint {
  x: number;
  y: number;
  include: boolean;
}

export interface Coordinate {
  id: number;
  x: number;
  y: number;
  include: boolean;
  image_id: number;
}

export interface SegmentationMask {
  id: number;
  mask: string | null;
  points: SegmentationPoint[];
  category: MaskCategory | null;
}

export interface ImageModel {
  id: number;
  image: string;
  thumbnail: string | null;
  uploaded_at: string;
  coordinates: Coordinate[];
  is_label: boolean;
  original_filename: string;
  masks: SegmentationMask[];
}

export interface Project {
  id: number;
  name: string;
  type: ProjectType;
  images: ImageModel[];
  categories: MaskCategory[];
}
