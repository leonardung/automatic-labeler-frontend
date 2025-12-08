export type ProjectType = "segmentation" | "video_tracking_segmentation" | "ocr" | "ocr_kie";

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

export interface OCRAnnotation {
  id: string;
  type: "rect" | "polygon";
  points: { x: number; y: number }[];
  text: string;
  category: string | null;
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
  ocr_annotations?: OCRAnnotation[];
}

export interface Project {
  id: number;
  name: string;
  type: ProjectType;
  images: ImageModel[];
  categories: MaskCategory[];
}
