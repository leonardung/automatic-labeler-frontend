import type { OCRAnnotation } from "../../types";

export type OCRTool = "rect" | "polygon" | "select";

export type OcrHistoryEntry = {
  past: OCRAnnotation[][];
  future: OCRAnnotation[][];
};

export type ViewportControls = {
  zoomIn: () => void;
  zoomOut: () => void;
  toggleFit: () => void;
  fitMode: "inside" | "outside";
};

export type BulkOcrStage =
  | "pending"
  | "detecting"
  | "recognizing"
  | "classifying"
  | "done"
  | "error";
