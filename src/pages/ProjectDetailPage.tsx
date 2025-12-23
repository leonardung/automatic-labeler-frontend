import React, { useState, useEffect, useContext, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axiosInstance from "../axiosInstance";
import {
  Button,
  Typography,
  Box,
  CssBaseline,
  Snackbar,
  Alert,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  DialogContentText,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Switch,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import type { AlertColor } from "@mui/material";

import ImageDisplaySegmentation from "../components/ImageDisplaySegmentation";
import ImageDisplayOCR from "../components/ImageDisplayOCR";
import NavigationButtons from "../components/NavigationButtons";
import Controls from "../components/Controls";
import ThumbnailGrid from "../components/ThumbnailGrid";
import MaskCategoryPanel from "../components/MaskCategoryPanel";
import TextPromptMaskForm from "../components/TextPromptMaskForm";
import OCRControls from "../components/OCRControls";
import OCRTextList from "../components/OCRTextList";
import OcrCategoryPanel from "../components/OcrCategoryPanel";
import { AuthContext } from "../AuthContext";
import type {
  ImageModel,
  MaskCategory,
  OCRAnnotation,
  Project,
  ProjectType,
  SegmentationPoint,
  ProjectSnapshot,
} from "../types";

interface NotificationState {
  open: boolean;
  message: string;
  severity: AlertColor;
}

type OCRTool = "rect" | "polygon" | "select";
type OcrHistoryEntry = { past: OCRAnnotation[][]; future: OCRAnnotation[][] };
type ViewportControls = {
  zoomIn: () => void;
  zoomOut: () => void;
  toggleFit: () => void;
  fitMode: "inside" | "outside";
};

const cloneOcrAnnotations = (annotations: OCRAnnotation[] = []) =>
  annotations.map((ann) => ({
    ...ann,
    points: ann.points.map((p) => ({ ...p })),
  }));

const areOcrAnnotationsEqual = (a: OCRAnnotation[] = [], b: OCRAnnotation[] = []) => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x.id.localeCompare(y.id));
  const sortedB = [...b].sort((x, y) => x.id.localeCompare(y.id));

  return sortedA.every((ann, idx) => {
    const other = sortedB[idx];
    if (!other) return false;
    if (
      ann.id !== other.id ||
      ann.type !== other.type ||
      ann.text !== other.text ||
      ann.category !== other.category
    ) {
      return false;
    }
    if (ann.points.length !== other.points.length) return false;
    return ann.points.every((pt, ptIdx) => {
      const otherPt = other.points[ptIdx];
      return Boolean(otherPt) && pt.x === otherPt.x && pt.y === otherPt.y;
    });
  });
};

const normalizeOcrAnnotations = (annotations?: any[]) =>
  (annotations || []).map((a) => ({
    ...a,
    id: typeof a.id === "string" ? a.id : String(a.id ?? ""),
    type: a.type || a.shape_type || "rect",
    points: a.points || [],
  }));

function ProjectDetailPage() {
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
  const currentImage = images[currentIndex];
  const isSegmentationProject =
    projectType === "segmentation" || projectType === "video_tracking_segmentation";
  const isOCRProject = projectType === "ocr" || projectType === "ocr_kie";
  const showOcrCategoryPanel = projectType === "ocr_kie";
  const imageEndpointBase = isOCRProject ? "ocr-images" : "images";
  const [maxOcrCategoryHeight, setMaxOcrCategoryHeight] = useState<number>(320);
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
  const [bulkOcrStatus, setBulkOcrStatus] = useState<Record<
    number,
    { status: "pending" | "detecting" | "recognizing" | "done" | "error"; error?: string }
  >>({});
  const [isBulkOcrRunning, setIsBulkOcrRunning] = useState(false);
  const [showOcrText, setShowOcrText] = useState(true);
  const progressIntervalRef = useRef<number | null>(null);
  const isPollingProgressRef = useRef(false);
  const [segmentationViewportControls, setSegmentationViewportControls] = useState<ViewportControls | null>(null);
  const [ocrViewportControls, setOcrViewportControls] = useState<ViewportControls | null>(null);

  const startLoading = useCallback(() => {
    setLoadingCounter((count) => count + 1);
  }, []);

  const stopLoading = useCallback(() => {
    setLoadingCounter((count) => Math.max(0, count - 1));
  }, []);

  const startBlocking = useCallback((message?: string) => {
    setBlockingMessage(message || "Working...");
    setBlockingOps((count) => count + 1);
  }, []);

  const clearProgressPolling = useCallback(() => {
    if (progressIntervalRef.current !== null) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const recordOcrHistory = useCallback(
    (imageId: number, previous: OCRAnnotation[], next: OCRAnnotation[]) => {
      if (suppressOcrHistoryRef.current) return;
      if (areOcrAnnotationsEqual(previous, next)) return;
      setOcrHistory((prev) => {
        const entry = prev[imageId] || { past: [], future: [] };
        const snapshot = cloneOcrAnnotations(previous);
        const last = entry.past[entry.past.length - 1];
        if (last && areOcrAnnotationsEqual(last, snapshot)) {
          return prev;
        }
        return {
          ...prev,
          [imageId]: { past: [...entry.past, snapshot], future: [] },
        };
      });
    },
    []
  );

  const pollPropagationProgress = useCallback(async () => {
    if (!projectId || isPollingProgressRef.current) return;
    isPollingProgressRef.current = true;
    try {
      const response = await axiosInstance.get<{
        progress?: number;
        status?: string;
        detail?: string;
      }>(`images/propagation_progress/`, { params: { project_id: projectId } });
      const { progress = 0, status: statusText = "idle", detail } = response.data || {};
      const normalizedProgress = Math.min(100, Math.max(0, Math.round(progress)));
      setPropagationProgress(normalizedProgress);

      if (statusText === "failed") {
        setNotification({
          open: true,
          message: detail ? `Propagation failed: ${detail}` : "Propagation failed.",
          severity: "error",
        });
        setIsPropagating(false);
        clearProgressPolling();
      } else if (statusText === "completed" || normalizedProgress >= 100) {
        setIsPropagating(false);
        clearProgressPolling();
      }
    } catch (error) {
      console.error("Error polling propagation progress:", error);
    } finally {
      isPollingProgressRef.current = false;
    }
  }, [clearProgressPolling, projectId]);

  const startProgressPolling = useCallback(() => {
    setPropagationProgress(0);
    clearProgressPolling();
    pollPropagationProgress();
    progressIntervalRef.current = window.setInterval(pollPropagationProgress, 1000);
  }, [clearProgressPolling, pollPropagationProgress]);

  const stopBlocking = useCallback(() => {
    setBlockingOps((count) => Math.max(0, count - 1));
  }, []);

  const handleNextImage = useCallback(() => {
    if (isBlocked) return;
    setCurrentIndex((prevIndex) => Math.min(prevIndex + 1, images.length - 1));
  }, [images.length, isBlocked]);

  const handlePrevImage = useCallback(() => {
    if (isBlocked) return;
    setCurrentIndex((prevIndex) => Math.max(prevIndex - 1, 0));
  }, [isBlocked]);

  const openTrainingPage = useCallback(() => {
    if (!projectId) return;
    navigate(`/projects/${projectId}/training`, { state: { projectName: project?.name } });
  }, [navigate, project?.name, projectId]);

  const handleSelectCategory = (categoryId: number) => {
    if (isBlocked) return;
    setActiveCategoryId(categoryId);
    setHighlightCategoryId(categoryId);
    setHighlightSignal((prev) => prev + 1);
    if (isOCRProject && showOcrCategoryPanel) {
      applyCategoryToSelection(categoryId);
    }
  };

  const bustCache = useCallback((url?: string | null): string | null => {
    return url ? `${url.split("?")[0]}?t=${Date.now()}` : null;
  }, []);

  const decorateImage = useCallback(
    (img: ImageModel): ImageModel => ({
      ...img,
      masks: (img.masks || []).map((m) => ({
        ...m,
        mask: bustCache(m.mask),
      })),
      ocr_annotations: normalizeOcrAnnotations(img.ocr_annotations),
    }),
    [bustCache]
  );

  const applyProjectPayload = useCallback(
    (payload: Project) => {
      const decoratedImages = (payload.images || []).map(decorateImage);
      const categoryList = payload.categories || [];

      setProject({ ...payload, images: decoratedImages });
      setImages(decoratedImages);
      setCategories(categoryList);
      setCurrentIndex((prevIndex) => {
        if (!decoratedImages.length) return 0;
        return Math.min(prevIndex, decoratedImages.length - 1);
      });
      setActiveCategoryId((prev) => {
        const hasPrev = categoryList.some((c) => c.id === prev);
        if (hasPrev) return prev;
        return (
          categoryList[0]?.id ||
          decoratedImages[0]?.masks?.[0]?.category?.id ||
          null
        );
      });
      setHighlightCategoryId((prev) => {
        const hasPrev = prev && categoryList.some((c) => c.id === prev);
        return hasPrev ? prev : null;
      });
      setSelectedShapeIds([]);
      setOcrTool("select");
    },
    [decorateImage]
  );

  const formatSnapshotLabel = useCallback((snapshot: ProjectSnapshot) => {
    const title = (snapshot.name || "").trim();
    if (title) return title;
    return new Date(snapshot.created_at).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  const formatSnapshotDate = useCallback((snapshot: ProjectSnapshot) => {
    return new Date(snapshot.created_at).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  const fetchSnapshots = useCallback(async () => {
    if (!projectId) return;
    try {
      const response = await axiosInstance.get<{ snapshots?: ProjectSnapshot[] }>(
        `projects/${projectId}/snapshots/`
      );
      setSnapshots(response.data.snapshots || []);
    } catch (error) {
      console.error("Error fetching snapshots:", error);
    }
  }, [projectId]);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    try {
      const response = await axiosInstance.get<Project>(`projects/${projectId}/`);

      applyProjectPayload(response.data);
      setTimeout(() => {
        setImages((prev) => prev.map((img) => ({ ...img })));
      }, 0);
    } catch (error) {
      console.error("Error fetching project details:", error);
      setNotification({
        open: true,
        message: "Error fetching project details.",
        severity: "error",
      });
    }
  }, [applyProjectPayload, projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject, projectId]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  useEffect(() => {
    modelLoadedRef.current = false;
    ocrModelLoadedRef.current = false;
  }, [projectId]);

  useEffect(() => {
    setOcrHistory({});
  }, [projectId]);

  useEffect(() => {
    setSelectedShapeIds([]);
    setOcrTool("select");
  }, [currentIndex, projectType]);

  useEffect(() => {
    if (!showOcrCategoryPanel) return;
    const panel = ocrCategoryPanelRef.current;
    if (!panel) return;
    const contentHeight = panel.scrollHeight;
    const bufferedHeight = contentHeight+5;
    setMaxOcrCategoryHeight(Math.max(180, bufferedHeight));
  }, [categories, showOcrCategoryPanel]);

  useEffect(() => () => {
    clearProgressPolling();
  }, [clearProgressPolling]);

  useEffect(() => {
    if (!project || !isSegmentationProject || modelLoadedRef.current) {
      return;
    }

    const loadModel = async () => {
      try {
        startBlocking("Loading model...");
        startLoading();
        await axiosInstance.post(`model/load_model/`);
        modelLoadedRef.current = true;
        setNotification({
          open: true,
          message: "Model loaded and ready.",
          severity: "success",
        });
      } catch (error) {
        console.error("Error loading model:", error);
        setNotification({
          open: true,
          message: "Error loading model.",
          severity: "error",
        });
      } finally {
        stopBlocking();
        stopLoading();
      }
    };

    loadModel();
  }, [project, projectType, projectId, startBlocking, stopBlocking, startLoading, stopLoading, isSegmentationProject]);

  useEffect(() => {
    if (!project || !isOCRProject || ocrModelLoadedRef.current) return;

    const loadOcrModels = async () => {
      try {
        startBlocking("Loading OCR models...");
        await axiosInstance.post(`ocr-images/configure_models/`, {
          detect_model: "PP-OCRv5_mobile_det",
          recognize_model: "PP-OCRv5_server_rec",
        });
        ocrModelLoadedRef.current = true;
      } catch (error) {
        console.error("Error loading OCR models:", error);
      } finally {
        stopBlocking();
      }
    };

    loadOcrModels();
  }, [project, isOCRProject, startBlocking, stopBlocking]);

  const handleSelectFolder = async () => {
    if (isBlocked) return;
    if (projectType === "video_tracking_segmentation") {
      setOpenSettingsDialog(true);
      return;
    }

    selectFiles();
  };

  const handleSettingsSubmit = () => {
    if (isBlocked) return;
    setOpenSettingsDialog(false);
    selectFiles();
  };

  const selectFiles = () => {
    if (!projectId) return;
    const input = document.createElement("input");
    input.type = "file";

    if (projectType === "video_tracking_segmentation") {
      input.multiple = false;
      input.accept = "video/*";
    } else {
      input.multiple = true;
      input.accept = "image/*";
    }

    input.onchange = async (event: Event) => {
      const target = event.target as HTMLInputElement;
      const selectedFiles = Array.from(target.files ?? []);
      const filteredFiles = selectedFiles.filter((file) =>
        projectType === "video_tracking_segmentation"
          ? file.type.startsWith("video/")
          : file.type.startsWith("image/")
      );

      if (images.length === 0) {
        setCurrentIndex(0);
      }
      startLoading();

      try {
        if (projectType === "video_tracking_segmentation" && filteredFiles.length > 0) {
          const formData = new FormData();
          formData.append("project_id", projectId);
          formData.append("video", filteredFiles[0]);
          formData.append("max_frames", String(maxFrames));
          formData.append("stride", String(stride));

          const response = await axiosInstance.post<ImageModel[]>(`video/`, formData, {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          });

          if (response.data) {
            const newFrames = response.data.map(decorateImage);
            setImages((prevImages) => [...prevImages, ...newFrames]);
          }

          return;
        }

        const batchSize = 50;
        for (let i = 0; i < filteredFiles.length; i += batchSize) {
          const batchFiles = filteredFiles.slice(i, i + batchSize);

          const formData = new FormData();
          formData.append("project_id", projectId);

          batchFiles.forEach((file) => {
            formData.append("images", file);
          });

          try {
            const response = await axiosInstance.post<ImageModel[]>(`${imageEndpointBase}/`, formData, {
              headers: {
                "Content-Type": "multipart/form-data",
              },
            });

            if (response.data) {
              const newImages = response.data.map(decorateImage);
              setImages((prevImages) => [...prevImages, ...newImages]);
            }
          } catch (error) {
            console.error("Error uploading batch: ", error);
            setNotification({
              open: true,
              message: "Error uploading batch",
              severity: "error",
            });
          }
        }
      } catch (error) {
        console.error("Error uploading media:", error);
      } finally {
        stopLoading();
      }
    };

    input.click();
  };

  const handleImportOcrDataset = useCallback(() => {
    if (!isOCRProject || !projectId || !project || isBlocked) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.tsv,.json,text/plain";
    input.onchange = async (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("project_id", projectId);
      formData.append("dataset", file);
      startBlocking("Importing OCR dataset...");
      try {
        const response = await axiosInstance.post(`ocr-images/upload_dataset/`, formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
        await fetchProject();
        const updatedImages = response.data?.summary?.updated_images ?? 0;
        const totalBoxes = response.data?.summary?.annotations ?? 0;
        setNotification({
          open: true,
          message: `Imported dataset for ${updatedImages} image(s) with ${totalBoxes} box(es).`,
          severity: "success",
        });
      } catch (error) {
        console.error("Error uploading OCR dataset:", error);
        setNotification({
          open: true,
          message: "Failed to import OCR dataset.",
          severity: "error",
        });
      } finally {
        stopBlocking();
      }
    };
    input.click();
  }, [fetchProject, isBlocked, isOCRProject, project, projectId, startBlocking, stopBlocking]);

  const handleThumbnailClick = (index: number) => {
    if (isBlocked) return;
    setCurrentIndex(index);
  };

  const handlePropagateMask = async () => {
    if (isBlocked) return;
    if (projectType !== "video_tracking_segmentation") {
      setNotification({
        open: true,
        message: "Mask propagation is only available for video projects.",
        severity: "info",
      });
      return;
    }
    if (!activeCategoryId) {
      setNotification({
        open: true,
        message: "Select a category before propagating.",
        severity: "warning",
      });
      return;
    }
    if (!projectId) {
      setNotification({
        open: true,
        message: "Project ID is missing.",
        severity: "warning",
      });
      return;
    }

    try {
      setIsPropagating(true);
      startProgressPolling();
      startBlocking("Propagating masks through video...");
      startLoading();
      const response = await axiosInstance.post<ImageModel[]>(`images/propagate_mask/`, {
        project_id: projectId,
        category_id: activeCategoryId,
      });

      if (response.data) {
        setNotification({
          open: true,
          message: "Mask propagation completed successfully.",
          severity: "success",
        });
        const updatedImages = response.data.map(decorateImage);
        setImages(updatedImages);
        setProject((prev) =>
          prev ? { ...prev, images: updatedImages } : prev
        );
        setPropagationProgress(100);
      }
    } catch (error) {
      console.error("Error propagating mask:", error);
      setNotification({
        open: true,
        message: "Error propagating mask.",
        severity: "error",
      });
    } finally {
      clearProgressPolling();
      setIsPropagating(false);
      stopBlocking();
      stopLoading();
    }
  };

  const handleSaveSnapshot = async (name?: string) => {
    if (isBlocked || !projectId) return;
    startBlocking("Saving project snapshot...");
    startLoading();
    try {
      const response = await axiosInstance.post<{ snapshot: ProjectSnapshot }>(
        `projects/${projectId}/snapshots/`,
        { name: name || "" }
      );
      const savedSnapshot = response.data.snapshot;
      if (savedSnapshot) {
        setSnapshots((prev) => [
          savedSnapshot,
          ...prev.filter((snap) => snap.id !== savedSnapshot.id),
        ]);
        setNotification({
          open: true,
          message: `Saved snapshot (${formatSnapshotLabel(savedSnapshot)}).`,
          severity: "success",
        });
      }
    } catch (error) {
      console.error("Error saving snapshot:", error);
      setNotification({
        open: true,
        message: "Failed to save snapshot.",
        severity: "error",
      });
    } finally {
      stopBlocking();
      stopLoading();
    }
  };

  const handleLoadProjectSnapshot = async (snapshotId: number) => {
    if (!projectId || isBlocked) return;
    startBlocking("Loading project snapshot...");
    startLoading();
    try {
      const response = await axiosInstance.post<{
        project: Project;
        snapshot?: ProjectSnapshot;
      }>(`projects/${projectId}/snapshots/${snapshotId}/load_project/`);
      if (response.data.project) {
        applyProjectPayload(response.data.project);
      }
      if (response.data.snapshot) {
        setNotification({
          open: true,
          message: `Loaded project snapshot (${formatSnapshotLabel(response.data.snapshot)}).`,
          severity: "success",
        });
      }
      setLoadDialogMode(null);
    } catch (error) {
      console.error("Error loading project snapshot:", error);
      setNotification({
        open: true,
        message: "Failed to load project snapshot.",
        severity: "error",
      });
    } finally {
      stopBlocking();
      stopLoading();
    }
  };

  const handleLoadPageSnapshot = async (snapshotId: number) => {
    if (!projectId || !currentImage || isBlocked) return;
    startBlocking("Loading page snapshot...");
    startLoading();
    try {
      const response = await axiosInstance.post<{
        image?: ImageModel;
        categories?: MaskCategory[];
        snapshot?: ProjectSnapshot;
      }>(`projects/${projectId}/snapshots/${snapshotId}/load_page/`, {
        image_id: currentImage.id,
      });
      const updatedCategories = response.data.categories;
      const updatedImage = response.data.image ? decorateImage(response.data.image) : null;

      if (updatedCategories) {
        setCategories(updatedCategories);
      }
      if (updatedImage) {
        setImages((prev) =>
          prev.map((img) => (img.id === updatedImage.id ? { ...img, ...updatedImage } : img))
        );
        setProject((prev) =>
          prev
            ? {
                ...prev,
                images: prev.images.map((img) =>
                  img.id === updatedImage.id ? { ...img, ...updatedImage } : img
                ),
                categories: updatedCategories || prev.categories,
              }
            : prev
        );
        setActiveCategoryId((prev) => {
          const categoryPool = updatedCategories || categories;
          const hasPrev = categoryPool?.some((c) => c.id === prev);
          if (hasPrev) return prev;
          return (
            categoryPool?.[0]?.id ||
            updatedImage.masks?.[0]?.category?.id ||
            null
          );
        });
        setHighlightCategoryId((prev) => {
          const categoryPool = updatedCategories || categories;
          const hasPrev = prev && categoryPool?.some((c) => c.id === prev);
          return hasPrev ? prev : null;
        });
      }
      setSelectedShapeIds([]);
      if (response.data.snapshot) {
        setNotification({
          open: true,
          message: `Loaded page snapshot (${formatSnapshotLabel(response.data.snapshot)}).`,
          severity: "success",
        });
      }
      setLoadDialogMode(null);
    } catch (error) {
      console.error("Error loading page snapshot:", error);
      setNotification({
        open: true,
        message: "Failed to load page snapshot.",
        severity: "error",
      });
    } finally {
      stopBlocking();
      stopLoading();
    }
  };

  const handleLoadSnapshot = (mode: "page" | "project", snapshotId: number) => {
    if (mode === "project") {
      handleLoadProjectSnapshot(snapshotId);
    } else {
      handleLoadPageSnapshot(snapshotId);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: number) => {
    if (!projectId || isBlocked) return;
    startBlocking("Deleting snapshot...");
    startLoading();
    try {
      await axiosInstance.delete(`projects/${projectId}/snapshots/${snapshotId}/`);
      setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
      setNotification({
        open: true,
        message: "Snapshot deleted.",
        severity: "info",
      });
    } catch (error) {
      console.error("Error deleting snapshot:", error);
      setNotification({
        open: true,
        message: "Failed to delete snapshot.",
        severity: "error",
      });
    } finally {
      stopBlocking();
      stopLoading();
    }
  };

  const handleGenerateFromPrompt = async (
    promptText: string,
    maxMasks: number,
    threshold: number
  ) => {
    if (isBlocked) return;
    if (!projectId || images.length === 0) return;
    const targetImage = images[currentIndex];
    setPromptLoading(true);
    startBlocking("Generating masks from text...");
    startLoading();
    try {
      const response = await axiosInstance.post<{
        image: ImageModel;
        categories: MaskCategory[];
        created_categories?: MaskCategory[];
      }>(`images/${targetImage.id}/generate_text_mask/`, {
        prompt: promptText,
        max_masks: maxMasks,
        threshold,
      });

      const { image: updatedImagePayload, categories: updatedCategories, created_categories } =
        response.data;

      const updatedImage = decorateImage(updatedImagePayload);
      const normalizedCategories = updatedCategories || [];

      setCategories(normalizedCategories);
      setImages((prev) =>
        prev.map((img) => (img.id === updatedImage.id ? { ...img, ...updatedImage } : img))
      );
      setProject((prev) =>
        prev
          ? {
              ...prev,
              images: prev.images.map((img) =>
                img.id === updatedImage.id ? { ...img, ...updatedImage } : img
              ),
              categories: normalizedCategories,
            }
          : prev
      );

      const newlyCreatedId = created_categories?.[0]?.id || null;
      const activeStillExists =
        activeCategoryId &&
        normalizedCategories.some((cat) => cat.id === activeCategoryId);
      const fallbackActive = newlyCreatedId
        || (activeStillExists ? activeCategoryId : null)
        || normalizedCategories[0]?.id
        || null;
      if (fallbackActive !== null) {
        setActiveCategoryId(fallbackActive);
      }

      setNotification({
        open: true,
        message: `Created ${created_categories?.length || 1} mask(s) from "${promptText}".`,
        severity: "success",
      });
    } catch (error) {
      console.error("Error generating text mask:", error);
      setNotification({
        open: true,
        message: "Could not generate masks from prompt.",
        severity: "error",
      });
    } finally {
      setPromptLoading(false);
      stopBlocking();
      stopLoading();
    }
  };

  const handleImageUpdated = useCallback(
    (updatedImage: ImageModel) => {
      const normalized = decorateImage(updatedImage);
      let previousAnnotations: OCRAnnotation[] | null = null;
      const nextAnnotations = normalized.ocr_annotations;
      setImages((prev) =>
        prev.map((img) => {
          if (img.id !== normalized.id) return img;
          if (
            isOCRProject &&
            !suppressOcrHistoryRef.current &&
            typeof nextAnnotations !== "undefined"
          ) {
            previousAnnotations = cloneOcrAnnotations(img.ocr_annotations || []);
          }
          return { ...img, ...normalized };
        })
      );
      setProject((prev) =>
        prev
          ? {
              ...prev,
              images: prev.images.map((img) =>
                img.id === normalized.id ? { ...img, ...normalized } : img
              ),
            }
          : prev
      );

      if (
        isOCRProject &&
        !suppressOcrHistoryRef.current &&
        previousAnnotations !== null &&
        typeof nextAnnotations !== "undefined"
      ) {
        recordOcrHistory(normalized.id, previousAnnotations, nextAnnotations || []);
      }
    },
    [decorateImage, isOCRProject, recordOcrHistory]
  );

  const applyOcrAnnotationsForImage = useCallback(
    async (image: ImageModel, targetAnnotations: OCRAnnotation[]) => {
      if (!isOCRProject || !image.id) return;
      const safeAnnotations = cloneOcrAnnotations(targetAnnotations);
      suppressOcrHistoryRef.current = true;
      try {
        handleImageUpdated({ ...image, ocr_annotations: safeAnnotations });
      } finally {
        suppressOcrHistoryRef.current = false;
      }
      setSelectedShapeIds((prev) => {
        const allowed = new Set(safeAnnotations.map((ann) => ann.id));
        return prev.filter((id) => allowed.has(id));
      });
      try {
        const existing = image.ocr_annotations || [];
        const targetIds = new Set(safeAnnotations.map((ann) => ann.id));
        const idsToDelete = existing.filter((ann) => !targetIds.has(ann.id)).map((ann) => ann.id);
        if (idsToDelete.length) {
          await axiosInstance.delete(`${imageEndpointBase}/${image.id}/ocr_annotations/`, {
            data: { ids: idsToDelete },
          });
        }
        if (safeAnnotations.length) {
          await axiosInstance.post(`${imageEndpointBase}/${image.id}/ocr_annotations/`, {
            shapes: safeAnnotations,
          });
        } else {
          await axiosInstance.delete(`${imageEndpointBase}/${image.id}/ocr_annotations/`, {
            data: { ids: [] },
          });
        }
      } catch (error) {
        console.error("Error syncing OCR changes:", error);
        setNotification({
          open: true,
          message: "Failed to sync OCR changes.",
          severity: "error",
        });
      }
    },
    [handleImageUpdated, imageEndpointBase, isOCRProject]
  );

  const handleAddCategory = async (name: string, color: string) => {
    if (isBlocked) return;
    if (!projectId) return;
    try {
      const response = await axiosInstance.post<MaskCategory>("categories/", {
        name,
        color,
        project_id: projectId,
      });
      const newCat = response.data;
      setCategories((prev) => [...prev, newCat]);
      setActiveCategoryId(newCat.id);
    } catch (error) {
      console.error("Error adding category:", error);
      setNotification({
        open: true,
        message: "Failed to add category.",
        severity: "error",
      });
    }
  };

  const handleDeleteCategory = async (categoryId: number) => {
    if (isBlocked) return;
    try {
      await axiosInstance.delete(`categories/${categoryId}/`);
      setCategories((prev) => {
        const filtered = prev.filter((c) => c.id !== categoryId);
        if (activeCategoryId === categoryId) {
          setActiveCategoryId(filtered[0]?.id || null);
        }
        return filtered;
      });
      setImages((prev) =>
        prev.map((img) => ({
          ...img,
          masks: (img.masks || []).filter((m) => m.category?.id !== categoryId),
        }))
      );
    } catch (error) {
      console.error("Error deleting category:", error);
      setNotification({
        open: true,
        message: "Failed to delete category.",
        severity: "error",
      });
    }
  };

  const handleColorChange = async (categoryId: number, color: string) => {
    if (isBlocked) return;
    try {
      const response = await axiosInstance.patch<MaskCategory>(`categories/${categoryId}/`, { color });
      const updated = response.data;
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, color: updated.color } : c))
      );
      setImages((prev) =>
        prev.map((img) => ({
          ...img,
          masks: (img.masks || []).map((m) =>
            m.category?.id === categoryId
              ? { ...m, category: { ...m.category, color: updated.color } }
              : m
          ),
        }))
      );
    } catch (error) {
      console.error("Error updating color:", error);
    }
  };
  const handleRenameCategory = async (categoryId: number, name: string) => {
    if (isBlocked) return;
    const current = categories.find((c) => c.id === categoryId);
    const oldName = current?.name;
    if (!current || !name.trim()) return;
    try {
      const response = await axiosInstance.patch<MaskCategory>(`categories/${categoryId}/`, { name });
      const updated = response.data;
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, name: updated.name } : c))
      );
      setImages((prev) =>
        prev.map((img) => ({
          ...img,
          ocr_annotations: (img.ocr_annotations || []).map((ann) =>
            oldName && ann.category === oldName ? { ...ann, category: updated.name } : ann
          ),
        }))
      );
      setProject((prev) =>
        prev
          ? {
              ...prev,
              images: prev.images.map((img) => ({
                ...img,
                ocr_annotations: (img.ocr_annotations || []).map((ann) =>
                  oldName && ann.category === oldName ? { ...ann, category: updated.name } : ann
                ),
              })),
              categories: prev.categories.map((c) =>
                c.id === categoryId ? { ...c, name: updated.name } : c
              ),
            }
          : prev
      );
    } catch (error) {
      console.error("Error renaming category:", error);
      setNotification({
        open: true,
        message: "Failed to rename category.",
        severity: "error",
      });
    }
  };

  useEffect(() => {
    setImages((prev) =>
      prev.map((img) => ({
        ...img,
        masks: (img.masks || []).map((m) => {
          const cat = categories.find((c) => c.id === m.category?.id);
          return cat ? { ...m, category: cat } : m;
        }),
      }))
    );
  }, [categories]);
  const applyCategoryToSelection = async (categoryId: number) => {
    if (!isOCRProject || !currentImage || !selectedShapeIds.length) return;
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;
    const selectedSet = new Set(selectedShapeIds);
    const updatedAnnotations =
      currentImage.ocr_annotations?.map((s) =>
        selectedSet.has(s.id) ? { ...s, category: category.name } : s
      ) || [];
    const updatedImage: ImageModel = {
      ...currentImage,
      ocr_annotations: updatedAnnotations,
    };
    handleImageUpdated(updatedImage);
    try {
      await axiosInstance.post(`${imageEndpointBase}/${currentImage.id}/ocr_annotations/`, {
        shapes: updatedAnnotations.filter((a) => selectedSet.has(a.id)),
      });
    } catch (error) {
      console.error("Error applying category to annotation:", error);
      setNotification({
        open: true,
        message: "Failed to update category.",
        severity: "error",
      });
    }
  };

  const handleUndo = useCallback(async () => {
    const image = currentImage;
    if (!isOCRProject || !image || isBlocked || isApplyingHistory) return;
    const entry = ocrHistory[image.id] || { past: [], future: [] };
    if (!entry.past.length) return;
    const currentSnapshot = cloneOcrAnnotations(image.ocr_annotations || []);
    let previousSnapshot: OCRAnnotation[] | null = null;
    setOcrHistory((prev) => {
      const state = prev[image.id] || { past: [], future: [] };
      if (!state.past.length) return prev;
      previousSnapshot = state.past[state.past.length - 1];
      return {
        ...prev,
        [image.id]: {
          past: state.past.slice(0, -1),
          future: [...state.future, currentSnapshot],
        },
      };
    });
    if (!previousSnapshot) return;
    setIsApplyingHistory(true);
    try {
      await applyOcrAnnotationsForImage(image, cloneOcrAnnotations(previousSnapshot));
    } finally {
      setIsApplyingHistory(false);
    }
  }, [applyOcrAnnotationsForImage, currentImage, isApplyingHistory, isBlocked, isOCRProject, ocrHistory]);

  const handleRedo = useCallback(async () => {
    const image = currentImage;
    if (!isOCRProject || !image || isBlocked || isApplyingHistory) return;
    const entry = ocrHistory[image.id] || { past: [], future: [] };
    if (!entry.future.length) return;
    const currentSnapshot = cloneOcrAnnotations(image.ocr_annotations || []);
    let nextSnapshot: OCRAnnotation[] | null = null;
    setOcrHistory((prev) => {
      const state = prev[image.id] || { past: [], future: [] };
      if (!state.future.length) return prev;
      nextSnapshot = state.future[state.future.length - 1];
      return {
        ...prev,
        [image.id]: {
          past: [...state.past, currentSnapshot],
          future: state.future.slice(0, -1),
        },
      };
    });
    if (!nextSnapshot) return;
    setIsApplyingHistory(true);
    try {
      await applyOcrAnnotationsForImage(image, cloneOcrAnnotations(nextSnapshot));
    } finally {
      setIsApplyingHistory(false);
    }
  }, [applyOcrAnnotationsForImage, currentImage, isApplyingHistory, isBlocked, isOCRProject, ocrHistory]);

  const handleRecognizeSelected = useCallback(async () => {
    if (isBlocked) return;
    const image = images[currentIndex];
    if (!image || !image.id) return;
    const selected = (image.ocr_annotations || []).filter((shape) =>
      selectedShapeIds.includes(shape.id)
    );
    if (selected.length === 0) return;

    try {
      startBlocking("Recognizing selection...");
      const response = await axiosInstance.post(`${imageEndpointBase}/${image.id}/recognize_text/`, {
        shapes: selected,
      });
      const updatedShapes = response.data.shapes || [];
      const merged = (image.ocr_annotations || []).map((shape) => {
        const replacement = updatedShapes.find((s: any) => s.id === shape.id);
        return replacement ? replacement : shape;
      });
      const newOnes = updatedShapes.filter(
        (s: any) => !(image.ocr_annotations || []).some((shape) => shape.id === s.id)
      );
      const updatedImage = { ...image, ocr_annotations: [...merged, ...newOnes] };
      handleImageUpdated(updatedImage);
    } catch (error) {
      console.error("Error recognizing selected regions:", error);
    } finally {
      stopBlocking();
    }
  }, [
    currentIndex,
    imageEndpointBase,
    images,
    isBlocked,
    selectedShapeIds,
    startBlocking,
    stopBlocking,
    handleImageUpdated,
  ]);

  const handleBulkDetectRecognize = useCallback(async () => {
    if (isBlocked) return;
    const targets = images.filter((img) => img.id);
    if (!targets.length) return;

    setIsBulkOcrRunning(true);
    setBulkOcrStatus(
      targets.reduce(
        (acc, img) => ({ ...acc, [img.id!]: { status: "pending" as const } }),
        {}
      )
    );

    startBlocking("Running OCR on all pages...");

    try {
      for (const img of targets) {
        if (!img.id) continue;
        setBulkOcrStatus((prev) => ({ ...prev, [img.id!]: { status: "detecting" } }));
        let shapes: any[] = [];
        try {
          const detRes = await axiosInstance.post(
            `${imageEndpointBase}/${img.id}/detect_regions/`
          );
          shapes = detRes.data.shapes || [];
        } catch (error) {
          console.error("Bulk detect failed for image", img.id, error);
          setBulkOcrStatus((prev) => ({
            ...prev,
            [img.id!]: { status: "error", error: "detect failed" },
          }));
          continue;
        }

        setBulkOcrStatus((prev) => ({ ...prev, [img.id!]: { status: "recognizing" } }));
        try {
          const recRes = await axiosInstance.post(
            `${imageEndpointBase}/${img.id}/recognize_text/`,
            { shapes }
          );
          const recShapes = recRes.data.shapes || shapes;
          handleImageUpdated({ ...img, ocr_annotations: recShapes });
          setBulkOcrStatus((prev) => ({ ...prev, [img.id!]: { status: "done" } }));
        } catch (error) {
          console.error("Bulk recognize failed for image", img.id, error);
          setBulkOcrStatus((prev) => ({
            ...prev,
            [img.id!]: { status: "error", error: "recognize failed" },
          }));
        }
      }
    } finally {
      setIsBulkOcrRunning(false);
      stopBlocking();
    }
  }, [
    handleImageUpdated,
    imageEndpointBase,
    images,
    isBlocked,
    startBlocking,
    stopBlocking,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isEditable =
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target?.getAttribute("contenteditable") === "true";

      if (isEditable || isBlocked) return;

      const ctrlOrMeta = event.ctrlKey || event.metaKey;
      const keyLower = event.key.toLowerCase();

      if (isOCRProject && ctrlOrMeta && keyLower === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if (isOCRProject && ctrlOrMeta && keyLower === "y") {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (event.key === "a") {
        handlePrevImage();
      } else if (event.key === "d") {
        handleNextImage();
      } else if (isOCRProject) {
        if (keyLower === "s") {
          setOcrTool("select");
        } else if (keyLower === "r") {
          setOcrTool("rect");
        } else if (keyLower === "p") {
          setOcrTool("polygon");
        } else if (keyLower === "g") {
          event.preventDefault();
          handleRecognizeSelected();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    handleNextImage,
    handlePrevImage,
    handleRedo,
    handleRecognizeSelected,
    handleUndo,
    isBlocked,
    isOCRProject,
  ]);

  const handlePointsUpdated = (imageId: number, categoryId: number, points: SegmentationPoint[]) => {
    setImages((prev) =>
      prev.map((img) => {
        if (img.id !== imageId) return img;
        const updatedMasks = (img.masks || []).map((m) =>
          m.category?.id === categoryId ? { ...m, points } : m
        );
        return { ...img, masks: updatedMasks };
      })
    );
    setProject((prev) =>
      prev
        ? {
            ...prev,
            images: prev.images.map((img) => {
              if (img.id !== imageId) return img;
              const updatedMasks = (img.masks || []).map((m) =>
                m.category?.id === categoryId ? { ...m, points } : m
              );
              return { ...img, masks: updatedMasks };
            }),
          }
        : prev
    );
  };

  const handleClearLabels = async () => {
    if (isBlocked) return;
    if (isOCRProject) {
      const targetImage = currentImage;
      if (!targetImage) return;
      recordOcrHistory(
        targetImage.id,
        cloneOcrAnnotations(targetImage.ocr_annotations || []),
        []
      );
      try {
        await axiosInstance.delete(`${imageEndpointBase}/${targetImage.id}/ocr_annotations/`, {
          data: { ids: [] },
        });
        setImages((prev) =>
          prev.map((img) =>
            img.id === targetImage.id ? { ...img, ocr_annotations: [] } : img
          )
        );
        setProject((prev) =>
          prev
            ? {
                ...prev,
                images: prev.images.map((img) =>
                  img.id === targetImage.id ? { ...img, ocr_annotations: [] } : img
                ),
              }
            : prev
        );
        setSelectedShapeIds([]);
        setNotification({
          open: true,
          message: "OCR annotations cleared.",
          severity: "info",
        });
      } catch (error) {
        console.error("Error clearing OCR annotations:", error);
        setNotification({
          open: true,
          message: "Failed to clear OCR annotations.",
          severity: "error",
        });
      }
      return;
    }

    if (!project) return;
    try {
      await axiosInstance.delete(`projects/${project.id}/delete_masks/`);
    } catch (error) {
      console.error("Error deleting masks:", error);
    }
    try {
      await axiosInstance.get(`images/unload_model/`);
    } catch (error) {
      console.error("Error unloading model:", error);
    }
    setImages((prev) =>
      prev.map((img) => ({
        ...img,
        masks: [],
      }))
    );
    setProject((prev) =>
      prev
        ? {
            ...prev,
            images: prev.images.map((img) => ({
              ...img,
              masks: [],
            })),
          }
        : prev
    );
    setNotification({
      open: true,
      message: "Labels cleared.",
      severity: "info",
    });
  };

  const handleNotificationClose = () => {
    setNotification((prev) => ({ ...prev, open: false }));
  };

  const handleBackToRoot = () => {
    navigate("/");
  };

  const renderViewportControls = (controls: ViewportControls | null) => (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Tooltip title="Zoom in">
        <span>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ZoomInIcon />}
            onClick={controls?.zoomIn}
            disabled={!controls || isBlocked}
          >
            Zoom
          </Button>
        </span>
      </Tooltip>
      <Tooltip title="Zoom out">
        <span>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ZoomOutIcon />}
            onClick={controls?.zoomOut}
            disabled={!controls || isBlocked}
          >
            Unzoom
          </Button>
        </span>
      </Tooltip>
      <Tooltip title={`Fit ${controls?.fitMode === "outside" ? "Outside" : "Inside"}`}>
        <span>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FitScreenIcon />}
            onClick={controls?.toggleFit}
            disabled={!controls || isBlocked}
          >
            Fit ({controls?.fitMode === "outside" ? "Out" : "In"})
          </Button>
        </span>
      </Tooltip>
    </Box>
  );

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        color: "text.primary",
        backgroundColor: "background.default",
        position: "relative",
      }}
      aria-busy={isBlocked}
    >
      {isBlocked && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            backgroundColor: "rgba(6, 12, 20, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            color: "white",
            pointerEvents: "auto",
          }}
        >
          <CircularProgress color="inherit" />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {blockingMessage}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            Please wait...
          </Typography>
          {(isPropagating || isBulkOcrRunning) && (
            <Box sx={{ width: 320, display: "flex", flexDirection: "column", gap: 1.25 }}>
              <LinearProgress
                variant={isPropagating ? "determinate" : "indeterminate"}
                value={isPropagating ? propagationProgress : undefined}
                sx={{ width: "100%" }}
              />
              <Typography variant="caption" sx={{ textAlign: "center", color: "rgba(255,255,255,0.9)" }}>
                {isPropagating ? `Propagation ${propagationProgress}% complete` : "Running OCR..."}
              </Typography>
              {isBulkOcrRunning && Object.keys(bulkOcrStatus).length > 0 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
                  {images.map((img) => {
                    if (!img.id || !bulkOcrStatus[img.id]) return null;
                    const status = bulkOcrStatus[img.id];
                    const value =
                      status.status === "pending"
                        ? 0
                        : status.status === "detecting"
                        ? 40
                        : status.status === "recognizing"
                        ? 80
                        : 100;
                    const label =
                      status.status === "done"
                        ? "Done"
                        : status.status === "error"
                        ? status.error || "Error"
                        : status.status === "recognizing"
                        ? "Recognizing..."
                        : status.status === "detecting"
                        ? "Detecting..."
                        : "Pending";
                    const title = img.original_filename || `Image ${img.id}`;
                    return (
                      <Box key={img.id} sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                        <Typography variant="caption" color="rgba(255,255,255,0.85)">
                          {title}: {label}
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={value}
                          color={
                            status.status === "error"
                              ? "error"
                              : status.status === "done"
                              ? "success"
                              : "primary"
                          }
                          sx={{
                            height: 6,
                            borderRadius: 1,
                            backgroundColor: "rgba(255,255,255,0.2)",
                          }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}
      <CssBaseline />
      <Box
        mb={1}
        pt={2}
        pb={2}
        px={3}
        display="flex"
        alignItems="center"
        sx={{
          gap: 2,
          backgroundColor: "rgba(17,24,39,0.78)",
          borderBottom: "1px solid #1f2a3d",
          boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Button
          variant="contained"
          color="primary"
          onClick={handleSelectFolder}
          sx={{ boxShadow: "0 10px 30px rgba(90,216,255,0.25)" }}
        >
          {projectType === "video_tracking_segmentation" ? "Upload Video" : "Upload Images"}
        </Button>
        <Dialog open={openSettingsDialog} onClose={() => setOpenSettingsDialog(false)}>
          <DialogTitle>Video Settings</DialogTitle>
          <DialogContent>
            <TextField
              label="Max Number of Frames"
              type="number"
              fullWidth
              margin="normal"
              value={maxFrames}
              onChange={(e) => setMaxFrames(Number(e.target.value))}
            />
            <TextField
              label="Stride"
              type="number"
              fullWidth
              margin="normal"
              value={stride}
              onChange={(e) => setStride(Number(e.target.value))}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenSettingsDialog(false)}>Cancel</Button>
            <Button onClick={handleSettingsSubmit} variant="contained" color="primary">
              Confirm
            </Button>
          </DialogActions>
        </Dialog>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, ml: 2 }}>
          <Button
            variant="outlined"
            color="secondary"
            onClick={() => setLoadDialogMode("page")}
            disabled={isBlocked || snapshots.length === 0 || !currentImage}
          >
            Load Page
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            onClick={() => setLoadDialogMode("project")}
            disabled={isBlocked || snapshots.length === 0}
          >
            Load Project
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={() => setSaveDialogOpen(true)}
            disabled={isBlocked || !project}
            sx={{ boxShadow: "0 10px 24px rgba(120,202,255,0.2)" }}
          >
            Save Project
          </Button>
        </Box>

        {isOCRProject && (
          <Button
            variant="outlined"
            color="info"
            onClick={handleImportOcrDataset}
            disabled={isBlocked || !project}
          >
            Import OCR Dataset
          </Button>
        )}

        {isOCRProject && (
          <Button
            variant="contained"
            color="success"
            onClick={openTrainingPage}
            disabled={isBlocked || !project}
            sx={{ boxShadow: "0 10px 28px rgba(94,255,180,0.25)" }}
          >
            Models Training
          </Button>
        )}

        <Typography variant="h4" color="primary" fontWeight="bold" sx={{ ml: 4 }}>
          {project ? project.name : "Loading Project..."}
        </Typography>

        <Box sx={{ display: "flex", ml: "auto" }}>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleBackToRoot}
            sx={{ mr: 2 }}
          >
            Back
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={logoutUser}
            sx={{ mr: 2 }}
          >
            Logout
          </Button>
        </Box>
      </Box>
      {loading && <LinearProgress />}
      {images.length > 0 ? (
        isOCRProject ? (
          <Box display="flex" flexDirection="column" flexGrow={1} height="100%" overflow="hidden">
            <Box display="flex" flexGrow={1} overflow="hidden">
              <Box
                sx={{
                  flexShrink: 0,
                  width: 380,
                  minWidth: 300,
                  maxWidth: "50vw",
                  resize: "horizontal",
                  overflow: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.5,
                  height: "100%",
                  p: 2,
                  backgroundColor: "#0f1624",
                  borderRight: "1px solid #1f2a3d",
                  boxShadow: "inset -1px 0 0 rgba(255,255,255,0.04)",
                }}
              >
                {currentImage && (
                  <OCRControls
                    image={currentImage}
                    projectType={projectType}
                    projectId={projectId}
                    endpointBase={imageEndpointBase}
                    onImageUpdated={handleImageUpdated}
                    onStartBlocking={startBlocking}
                    onStopBlocking={stopBlocking}
                    disabled={isBlocked}
                  />
                )}
                {isOCRProject && (
                  <Button
                    variant="outlined"
                    color="secondary"
                    onClick={handleBulkDetectRecognize}
                    disabled={isBlocked || isBulkOcrRunning || images.length === 0}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Detect & Recognize All
                  </Button>
                )}
                {showOcrCategoryPanel && (
                  <Box
                    sx={{
                      minHeight: 180,
                      maxHeight: maxOcrCategoryHeight,
                      resize: "vertical",
                      overflow: "auto",
                      flexShrink: 0,
                    }}
                  >
                    <OcrCategoryPanel
                      ref={ocrCategoryPanelRef}
                      categories={categories}
                      activeCategoryId={activeCategoryId}
                      onSelectCategory={handleSelectCategory}
                      onAddCategory={handleAddCategory}
                      onDeleteCategory={handleDeleteCategory}
                      onColorChange={handleColorChange}
                      onRenameCategory={handleRenameCategory}
                      disabled={isBlocked}
                    />
                  </Box>
                )}
                {currentImage && (
                  <Box
                    sx={{
                      minHeight: 240,
                      maxHeight: "70vh",
                      resize: "vertical",
                      overflow: "hidden",
                      flexGrow: 1,
                      flexShrink: 0,
                      "& > *": { height: "100%" },
                    }}
                  >
                    <OCRTextList
                      image={currentImage}
                      categories={categories}
                      activeCategoryId={activeCategoryId}
                      selectedShapeIds={selectedShapeIds}
                      onSelectShapes={setSelectedShapeIds}
                      onImageUpdated={handleImageUpdated}
                      disabled={isBlocked}
                      endpointBase={imageEndpointBase}
                      showCategories={showOcrCategoryPanel}
                    />
                  </Box>
                )}
              </Box>
              <Box flexGrow={1} display="flex" flexDirection="column" overflow="hidden" p={2}>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  flexWrap="wrap"
                  gap={1}
                  mb={1}
                >
                  <ToggleButtonGroup
                    color="primary"
                    value={ocrTool}
                    exclusive
                    size="small"
                    onChange={(_, value: OCRTool | null) => value && setOcrTool(value)}
                    sx={{ "& .MuiToggleButton-root": { minWidth: 80 } }}
                  >
                    <ToggleButton value="select">Select (S)</ToggleButton>
                    <ToggleButton value="rect">Rect (R)</ToggleButton>
                    <ToggleButton value="polygon">Polygon (P)</ToggleButton>
                  </ToggleButtonGroup>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Switch
                      size="small"
                      checked={showOcrText}
                      onChange={(e) => setShowOcrText(e.target.checked)}
                    />
                    <Typography variant="body2" color="textSecondary">
                      Recognized Text
                    </Typography>
                  </Box>
                  {renderViewportControls(ocrViewportControls)}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Tooltip title="Undo (Ctrl+Z)">
                      <span>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<UndoIcon />}
                          onClick={handleUndo}
                          disabled={!canUndo || isBlocked || isApplyingHistory}
                        >
                          Undo
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip title="Redo (Ctrl+Y / Ctrl+Shift+Z)">
                      <span>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<RedoIcon />}
                          onClick={handleRedo}
                          disabled={!canRedo || isBlocked || isApplyingHistory}
                        >
                          Redo
                        </Button>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>
                <Box display="flex" flexGrow={1} overflow="hidden">
                  <Box flexGrow={1} display="flex" overflow="hidden">
                    {currentImage && (
                      <ImageDisplayOCR
                        image={currentImage}
                        activeTool={ocrTool}
                        categories={categories}
                        selectedShapeIds={selectedShapeIds}
                        onSelectShapes={setSelectedShapeIds}
                        onImageUpdated={handleImageUpdated}
                        disabled={isBlocked}
                        onStartBlocking={startBlocking}
                        onStopBlocking={stopBlocking}
                        endpointBase={imageEndpointBase}
                        showTextLabels={showOcrText}
                        onRegisterViewportControls={setOcrViewportControls}
                      />
                    )}
                  </Box>
                  <Box
                    width={80}
                    display="flex"
                    flexDirection="column"
                    justifyContent="center"
                    alignItems="flex-start"
                  >
                    <NavigationButtons
                      onPrev={handlePrevImage}
                      onNext={handleNextImage}
                      disablePrev={currentIndex === 0}
                      disableNext={currentIndex === images.length - 1}
                      disabled={isBlocked}
                    />
                    <Controls
                      projectType={projectType}
                      onPropagate={handlePropagateMask}
                      onClearLabels={handleClearLabels}
                      disabled={isBlocked}
                    />
                  </Box>
                </Box>
              </Box>
            </Box>
            <ThumbnailGrid
              images={images}
              onThumbnailClick={handleThumbnailClick}
              currentIndex={currentIndex}
            />
          </Box>
        ) : (
          <Box display="flex" flexDirection="column" flexGrow={1} height="100%" overflow="hidden">
            <Box display="flex" flexGrow={1} overflow="hidden">
              <Box
                sx={{
                  flexShrink: 0,
                  width: 380,
                  minWidth: 300,
                  maxWidth: "50vw",
                  resize: "horizontal",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  height: "100%",
                  minHeight: 0,
                  p: 2,
                  backgroundColor: "#0f1624",
                  borderRight: "1px solid #1f2a3d",
                  boxShadow: "inset -1px 0 0 rgba(255,255,255,0.04)",
                }}
              >
                <TextPromptMaskForm
                  disabled={images.length === 0 || isBlocked}
                  loading={promptLoading || loading || isBlocked}
                  onSubmit={handleGenerateFromPrompt}
                />
                <Box
                  sx={{
                    minHeight: 180,
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <MaskCategoryPanel
                    categories={categories}
                    activeCategoryId={activeCategoryId}
                    onSelectCategory={handleSelectCategory}
                    onAddCategory={handleAddCategory}
                    onDeleteCategory={handleDeleteCategory}
                    onColorChange={handleColorChange}
                  />
                </Box>
              </Box>
              <Box flexGrow={1} display="flex" flexDirection="column" overflow="hidden" p={2}>
                <Box display="flex" justifyContent="flex-end" mb={1}>
                  {renderViewportControls(segmentationViewportControls)}
                </Box>
                <Box display="flex" flexGrow={1} overflow="hidden">
                  <Box flexGrow={1} display="flex" overflow="hidden">
                    <ImageDisplaySegmentation
                      image={images[currentIndex]}
                      categories={categories}
                      activeCategoryId={activeCategoryId}
                      highlightCategoryId={highlightCategoryId}
                      highlightSignal={highlightSignal}
                      onImageUpdated={handleImageUpdated}
                      onPointsUpdated={handlePointsUpdated}
                      disabled={isBlocked}
                      onStartBlocking={startBlocking}
                      onStopBlocking={stopBlocking}
                      onRequireCategory={() =>
                        setNotification({
                          open: true,
                          message: "Create/select a category before adding points.",
                          severity: "info",
                        })
                      }
                      onRegisterViewportControls={setSegmentationViewportControls}
                    />
                  </Box>
                  <Box
                    width={80}
                    display="flex"
                    flexDirection="column"
                    justifyContent="center"
                    alignItems="flex-start"
                  >
                    <NavigationButtons
                      onPrev={handlePrevImage}
                      onNext={handleNextImage}
                      disablePrev={currentIndex === 0}
                      disableNext={currentIndex === images.length - 1}
                      disabled={isBlocked}
                    />
                    <Controls
                      projectType={projectType}
                      onPropagate={handlePropagateMask}
                      onClearLabels={handleClearLabels}
                      disabled={isBlocked}
                    />
                  </Box>
                </Box>
              </Box>
            </Box>
            <ThumbnailGrid
              images={images}
              onThumbnailClick={handleThumbnailClick}
              currentIndex={currentIndex}
            />
          </Box>
        )
      ) : (
        <Typography variant="body1" color="text.secondary" align="center">
          No images loaded. Please upload images.
        </Typography>
      )}
      <Dialog
        open={Boolean(loadDialogMode)}
        onClose={() => setLoadDialogMode(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {loadDialogMode === "project" ? "Load Project Snapshot" : "Load Page Snapshot"}
        </DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ mb: 2 }}>
            {loadDialogMode === "project"
              ? "Apply a saved version to every page in this project."
              : "Apply a saved version to the current page."}
          </DialogContentText>
          {snapshots.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No saved snapshots yet. Save a project first to see versions here.
            </Typography>
          ) : (
            <List>
              {snapshots.map((snap) => (
                <ListItem key={snap.id} disablePadding>
                  <ListItemButton
                    onClick={() =>
                      loadDialogMode && handleLoadSnapshot(loadDialogMode, snap.id)
                    }
                    disabled={isBlocked || (loadDialogMode === "page" && !currentImage)}
                  >
                    <ListItemText
                      primary={formatSnapshotLabel(snap)}
                      secondary={(snap.name || "").trim() ? formatSnapshotDate(snap) : undefined}
                    />
                    <Box display="flex" alignItems="center" gap={1}>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          loadDialogMode && handleLoadSnapshot(loadDialogMode, snap.id);
                        }}
                        disabled={isBlocked || (loadDialogMode === "page" && !currentImage)}
                      >
                        Load
                      </Button>
                      <IconButton
                        edge="end"
                        aria-label="delete snapshot"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSnapshot(snap.id);
                        }}
                        disabled={isBlocked}
                        size="small"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoadDialogMode(null)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>Save Project Snapshot</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>
            Optional: add a title for this version. Leave blank to use the timestamp.
          </DialogContentText>
          <TextField
            label="Snapshot Title (optional)"
            fullWidth
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              const name = snapshotName.trim();
              setSaveDialogOpen(false);
              setSnapshotName("");
              handleSaveSnapshot(name);
            }}
            variant="contained"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleNotificationClose}
      >
        <Alert
          onClose={handleNotificationClose}
          severity={notification.severity}
          sx={{ width: "100%" }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default ProjectDetailPage;
