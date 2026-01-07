import { useContext, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../AuthContext";
import type {
  ImageModel,
  MaskCategory,
  OcrModelConfig,
  Project,
  ProjectSnapshot,
  ProjectType,
  SelectedOcrModels,
} from "../../types";
import type { BulkOcrStage, OCRTool, OcrHistoryEntry, ViewportControls } from "./types";

interface NotificationState {
  open: boolean;
  message: string;
  severity: "error" | "info" | "success" | "warning";
}

interface DatasetImportProgress {
  status: string;
  percent: number;
  processed: number;
  total: number;
}

export const useProjectDetailState = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { logoutUser } = useContext(AuthContext);

  const [project, setProject] = useState<Project | null>(null);
  const [images, setImages] = useState<ImageModel[]>([]);
  const [categories, setCategories] = useState<MaskCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [highlightCategoryId, setHighlightCategoryId] = useState<number | null>(null);
  const [highlightSignal, setHighlightSignal] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadingCounter, setLoadingCounter] = useState(0);
  const [notification, setNotification] = useState<NotificationState>({
    open: false,
    message: "",
    severity: "info",
  });
  const [promptLoading, setPromptLoading] = useState(false);
  const [openSettingsDialog, setOpenSettingsDialog] = useState(false);
  const [maxFrames, setMaxFrames] = useState<number>(500);
  const [stride, setStride] = useState<number>(1);
  const modelLoadedRef = useRef(false);
  const projectType: ProjectType = project?.type || "segmentation";
  const [ocrTool, setOcrTool] = useState<OCRTool>("select");
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [selectionScrollSignal, setSelectionScrollSignal] = useState(0);
  const currentImage = images[currentIndex];
  const isSegmentationProject =
    projectType === "segmentation" || projectType === "video_tracking_segmentation";
  const isOCRProject = projectType === "ocr" || projectType === "ocr_kie";
  const showOcrCategoryPanel = projectType === "ocr_kie";
  const imageEndpointBase = isOCRProject ? "ocr-images" : "images";
  const [maxOcrCategoryHeight, setMaxOcrCategoryHeight] = useState<number>(290);
  const ocrCategoryPanelRef = useRef<HTMLDivElement | null>(null);
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([]);
  const [loadDialogMode, setLoadDialogMode] = useState<"page" | "project" | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const loading = loadingCounter > 0;
  const ocrModelLoadedRef = useRef(false);
  const [ocrHistory, setOcrHistory] = useState<Record<number, OcrHistoryEntry>>({});
  const suppressOcrHistoryRef = useRef(false);
  const [isApplyingHistory, setIsApplyingHistory] = useState(false);
  const currentHistory = currentImage ? ocrHistory[currentImage.id] : undefined;
  const canUndo = Boolean(currentHistory?.past.length);
  const canRedo = Boolean(currentHistory?.future.length);

  const [blockingOps, setBlockingOps] = useState(0);
  const [blockingMessage, setBlockingMessage] = useState("Working...");
  const isBlocked = blockingOps > 0;
  const [propagationProgress, setPropagationProgress] = useState(0);
  const [isPropagating, setIsPropagating] = useState(false);
  const [datasetImportProgress, setDatasetImportProgress] = useState<DatasetImportProgress>({
    status: "idle",
    percent: 0,
    processed: 0,
    total: 0,
  });
  const [isImportingDataset, setIsImportingDataset] = useState(false);
  const [bulkOcrStatus, setBulkOcrStatus] = useState<Record<
    number,
    { status: BulkOcrStage; error?: string }
  >>({});
  const [isBulkOcrRunning, setIsBulkOcrRunning] = useState(false);
  const bulkOcrAbortControllerRef = useRef<AbortController | null>(null);
  const [showOcrText, setShowOcrText] = useState(false);
  const progressIntervalRef = useRef<number | null>(null);
  const datasetProgressIntervalRef = useRef<number | null>(null);
  const isPollingProgressRef = useRef(false);
  const isPollingDatasetProgressRef = useRef(false);
  const [segmentationViewportControls, setSegmentationViewportControls] =
    useState<ViewportControls | null>(null);
  const [ocrViewportControls, setOcrViewportControls] = useState<ViewportControls | null>(null);
  const [selectedOcrModels, setSelectedOcrModels] = useState<SelectedOcrModels>({
    detect: true,
    recognize: true,
    classify: true,
  });
  const [ocrModelConfig, setOcrModelConfig] = useState<OcrModelConfig | null>(null);

  return {
    projectId,
    navigate,
    logoutUser,
    project,
    setProject,
    images,
    setImages,
    categories,
    setCategories,
    activeCategoryId,
    setActiveCategoryId,
    highlightCategoryId,
    setHighlightCategoryId,
    highlightSignal,
    setHighlightSignal,
    currentIndex,
    setCurrentIndex,
    loadingCounter,
    setLoadingCounter,
    notification,
    setNotification,
    promptLoading,
    setPromptLoading,
    openSettingsDialog,
    setOpenSettingsDialog,
    maxFrames,
    setMaxFrames,
    stride,
    setStride,
    modelLoadedRef,
    projectType,
    ocrTool,
    setOcrTool,
    selectedShapeIds,
    setSelectedShapeIds,
    selectionScrollSignal,
    setSelectionScrollSignal,
    currentImage,
    isSegmentationProject,
    isOCRProject,
    showOcrCategoryPanel,
    imageEndpointBase,
    maxOcrCategoryHeight,
    setMaxOcrCategoryHeight,
    ocrCategoryPanelRef,
    snapshots,
    setSnapshots,
    loadDialogMode,
    setLoadDialogMode,
    saveDialogOpen,
    setSaveDialogOpen,
    snapshotName,
    setSnapshotName,
    loading,
    ocrModelLoadedRef,
    ocrHistory,
    setOcrHistory,
    suppressOcrHistoryRef,
    isApplyingHistory,
    setIsApplyingHistory,
    currentHistory,
    canUndo,
    canRedo,
    blockingOps,
    setBlockingOps,
    blockingMessage,
    setBlockingMessage,
    isBlocked,
    propagationProgress,
    setPropagationProgress,
    isPropagating,
    setIsPropagating,
    datasetImportProgress,
    setDatasetImportProgress,
    isImportingDataset,
    setIsImportingDataset,
    bulkOcrStatus,
    setBulkOcrStatus,
    isBulkOcrRunning,
    setIsBulkOcrRunning,
    bulkOcrAbortControllerRef,
    showOcrText,
    setShowOcrText,
    progressIntervalRef,
    datasetProgressIntervalRef,
    isPollingProgressRef,
    isPollingDatasetProgressRef,
    segmentationViewportControls,
    setSegmentationViewportControls,
    ocrViewportControls,
    setOcrViewportControls,
    selectedOcrModels,
    setSelectedOcrModels,
    ocrModelConfig,
    setOcrModelConfig,
  };
};

export type ProjectDetailState = ReturnType<typeof useProjectDetailState>;
