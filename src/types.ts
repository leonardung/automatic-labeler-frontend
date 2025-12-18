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

export type OCRShapeType = "rect" | "polygon";

export interface OCRPoint {
  x: number;
  y: number;
}

export interface OCRAnnotation {
  id: string;
  type: OCRShapeType;
  points: OCRPoint[];
  text: string;
  category: string | null;
}

export interface ImageModel {
  id: number;
  image: string;
  thumbnail: string | null;
  uploaded_at: string;
  coordinates?: Coordinate[];
  is_label: boolean;
  original_filename: string;
  masks?: SegmentationMask[];
  ocr_annotations?: OCRAnnotation[];
}

export interface Project {
  id: number;
  name: string;
  type: ProjectType;
  images: ImageModel[];
  categories: MaskCategory[];
}

export interface ProjectSnapshot {
  id: number;
  created_at: string;
  name?: string;
  label?: string;
}

export type TrainingModelKey = "det" | "rec" | "kie";

export interface TrainingModelConfigSummary {
  epoch_num?: number;
  print_batch_step?: number;
  save_epoch_step?: number;
  eval_batch_step?: number | number[];
}

export interface TrainingDefaults {
  use_gpu: boolean;
  test_ratio: number;
  train_seed?: number | null;
  split_seed?: number | null;
  models: Partial<Record<TrainingModelKey, TrainingModelConfigSummary>>;
}

export type TrainingJobStatus = "pending" | "waiting" | "running" | "completed" | "failed" | "stopped";

export interface TrainingDatasetInfo {
  samples?: number;
  annotations?: number;
  train_samples?: number;
  test_samples?: number;
  train_annotations?: number;
  test_annotations?: number;
  images?: number;
  total_images?: number;
  boxes?: number;
  categories?: { label: string; count: number }[];
  category_total?: number;
}

export interface TrainingProgress {
  current?: number | null;
  total?: number | null;
  percent?: number | null;
  label?: string | null;
}

export interface TrainingJob {
  id: string;
  status: TrainingJobStatus;
  message: string;
  error?: string | null;
  logs?: string;
  targets: TrainingModelKey[];
  queue_position?: number | null;
  started_at?: string;
  finished_at?: string | null;
  created_at?: string | null;
  log_available?: boolean;
  dataset?: TrainingDatasetInfo;
  progress?: TrainingProgress;
  config?: {
    global?: {
      use_gpu?: boolean;
      test_ratio?: number;
      train_seed?: number | null;
      split_seed?: number | null;
      raw_dataset_file?: string;
    };
    models?: Partial<Record<TrainingModelKey, TrainingModelConfigSummary>>;
  };
}
