import React, { useState, useEffect, useContext, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axiosInstance from "../axiosInstance";
import { Alert, Box, CssBaseline, LinearProgress, Snackbar, Typography } from "@mui/material";
import type { AlertColor } from "@mui/material";

import ProjectDetailBlockingOverlay from "./projectDetail/ProjectDetailBlockingOverlay";
import ProjectDetailHeader from "./projectDetail/ProjectDetailHeader";
import ProjectDetailSnapshotDialogs from "./projectDetail/ProjectDetailSnapshotDialogs";
import OcrWorkspace from "./projectDetail/OcrWorkspace";
import SegmentationWorkspace from "./projectDetail/SegmentationWorkspace";
import { AuthContext } from "../AuthContext";
import type {
  ImageModel,
  MaskCategory,
  OCRAnnotation,
  Project,
  ProjectType,
  SelectedOcrModels,
  SegmentationPoint,
  ProjectSnapshot,
} from "../types";
import {
  areOcrAnnotationsEqual,
  cloneOcrAnnotations,
  decorateImage,
  formatSnapshotLabel,
} from "./projectDetail/utils";
import type { BulkOcrStage, OCRTool, OcrHistoryEntry, ViewportControls } from "./projectDetail/types";

interface NotificationState {
  open: boolean;
  message: string;
  severity: AlertColor;
}

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
  const [datasetImportProgress, setDatasetImportProgress] = useState<{
    status: string;
    percent: number;
    processed: number;
    total: number;
  }>({
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
  const [showOcrText, setShowOcrText] = useState(false);
  const progressIntervalRef = useRef<number | null>(null);
  const datasetProgressIntervalRef = useRef<number | null>(null);
  const isPollingProgressRef = useRef(false);
  const isPollingDatasetProgressRef = useRef(false);
  const [segmentationViewportControls, setSegmentationViewportControls] = useState<ViewportControls | null>(null);
  const [ocrViewportControls, setOcrViewportControls] = useState<ViewportControls | null>(null);
  const [selectedOcrModels, setSelectedOcrModels] = useState<SelectedOcrModels>({
    detect: true,
    recognize: true,
    classify: true,
  });

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

  const toggleOcrModel = useCallback((model: keyof SelectedOcrModels) => {
    setSelectedOcrModels((prev) => ({ ...prev, [model]: !prev[model] }));
  }, []);

  const hasSelectedOcrModel = useCallback(() => {
    return (
      selectedOcrModels.detect ||
      selectedOcrModels.recognize ||
      (projectType === "ocr_kie" && selectedOcrModels.classify)
    );
  }, [projectType, selectedOcrModels]);

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

  const clearDatasetProgressPolling = useCallback(() => {
    if (datasetProgressIntervalRef.current !== null) {
      clearInterval(datasetProgressIntervalRef.current);
      datasetProgressIntervalRef.current = null;
    }
  }, []);

  const pollDatasetImportProgress = useCallback(async () => {
    if (!projectId || isPollingDatasetProgressRef.current) return;
    isPollingDatasetProgressRef.current = true;
    try {
      const response = await axiosInstance.get<{
        project_id?: number;
        progress?: { status?: string; percent?: number; processed?: number; total?: number };
      }>(`ocr-images/dataset_progress/`, { params: { project_id: projectId } });
      const progress = response.data?.progress || {};
      const statusText = String(progress.status || "idle");
      const rawPercent = Number(progress.percent ?? 0);
      const percent = Math.min(100, Math.max(0, Math.round(rawPercent)));
      setDatasetImportProgress({
        status: statusText,
        percent,
        processed: Number(progress.processed ?? 0),
        total: Number(progress.total ?? 0),
      });
      if (statusText === "completed" || percent >= 100) {
        clearDatasetProgressPolling();
      }
    } catch (error) {
      console.error("Error polling dataset import progress:", error);
    } finally {
      isPollingDatasetProgressRef.current = false;
    }
  }, [clearDatasetProgressPolling, projectId]);

  const startDatasetProgressPolling = useCallback(() => {
    clearDatasetProgressPolling();
    pollDatasetImportProgress();
    datasetProgressIntervalRef.current = window.setInterval(
      pollDatasetImportProgress,
      1000
    );
  }, [clearDatasetProgressPolling, pollDatasetImportProgress]);

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
    const bufferedHeight = contentHeight + 5;
    setMaxOcrCategoryHeight((prev) => {
      const desired = Math.max(100, bufferedHeight);
      // Only shrink to fit small lists; never auto-expand to avoid taking over the sidebar.
      return desired < prev ? desired : prev;
    });
  }, [categories, showOcrCategoryPanel]);

  useEffect(() => () => {
    clearProgressPolling();
    clearDatasetProgressPolling();
  }, [clearDatasetProgressPolling, clearProgressPolling]);

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
      setDatasetImportProgress({
        status: "running",
        percent: 0,
        processed: 0,
        total: 0,
      });
      setIsImportingDataset(true);
      try {
        await axiosInstance.get(`ocr-images/dataset_progress/`, {
          params: { project_id: projectId, reset: true },
        });
      } catch (error) {
        console.error("Error resetting dataset progress:", error);
      }
      startDatasetProgressPolling();
      startBlocking("Importing OCR dataset...");
      try {
        const response = await axiosInstance.post(`ocr-images/upload_dataset/`, formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
        setDatasetImportProgress((prev) => ({
          ...prev,
          status: "completed",
          percent: 100,
        }));
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
        clearDatasetProgressPolling();
        setIsImportingDataset(false);
        stopBlocking();
      }
    };
    input.click();
  }, [
    clearDatasetProgressPolling,
    fetchProject,
    isBlocked,
    isOCRProject,
    project,
    projectId,
    startBlocking,
    startDatasetProgressPolling,
    stopBlocking,
  ]);

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

  const handleConfirmSaveSnapshot = () => {
    const name = snapshotName.trim();
    setSaveDialogOpen(false);
    setSnapshotName("");
    handleSaveSnapshot(name);
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

  const handleSelectShapesFromImage = useCallback((ids: string[]) => {
    setSelectedShapeIds(ids);
    setSelectionScrollSignal((prev) => prev + 1);
  }, []);

  const handleSelectShapesFromList = useCallback((ids: string[]) => {
    setSelectedShapeIds(ids);
  }, []);

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

  const runFullInferenceForImage = useCallback(
    async (
      img: ImageModel,
      selectedModels: SelectedOcrModels,
      onStatusChange?: (status: BulkOcrStage) => void
    ): Promise<{ shapes: any[]; categories?: string[] }> => {
      if (!img.id) {
        throw new Error("Image is missing an id.");
      }

      let shapes = img.ocr_annotations || [];
      let categoriesPayload: string[] | undefined;

      if (selectedModels.detect) {
        onStatusChange?.("detecting");
        const detRes = await axiosInstance.post(`${imageEndpointBase}/${img.id}/detect_regions/`);
        shapes = detRes.data.shapes || [];
      }

      if (selectedModels.recognize) {
        onStatusChange?.("recognizing");
        const recRes = await axiosInstance.post(`${imageEndpointBase}/${img.id}/recognize_text/`, {
          shapes,
        });
        shapes = recRes.data.shapes || shapes;
        categoriesPayload = recRes.data.categories;
      }

      const shouldClassify =
        projectType === "ocr_kie" && selectedModels.classify && shapes.length > 0;
      if (shouldClassify) {
        onStatusChange?.("classifying");
        const classRes = await axiosInstance.post(
          `${imageEndpointBase}/${img.id}/classify_kie/`,
          { shapes, categories: categories.map((cat) => cat.name) }
        );
        shapes = classRes.data.shapes || shapes;
        categoriesPayload = classRes.data.categories || categoriesPayload;
      }

      return { shapes, categories: categoriesPayload };
    },
    [categories, imageEndpointBase, projectType]
  );

  const handleFullInference = useCallback(async () => {
    if (isBlocked) return;
    const image = images[currentIndex];
    if (!image || !image.id) return;
    if (!hasSelectedOcrModel()) {
      setNotification({
        open: true,
        message: "Select at least one model before running inference.",
        severity: "warning",
      });
      return;
    }

    try {
      startBlocking("Running inference...");
      const result = await runFullInferenceForImage(image, selectedOcrModels);
      handleImageUpdated({ ...image, ocr_annotations: result.shapes || [] });
    } catch (error) {
      console.error("Error running inference:", error);
      setNotification({
        open: true,
        message: "Inference failed for this page.",
        severity: "error",
      });
    } finally {
      stopBlocking();
    }
  }, [
    currentIndex,
    handleImageUpdated,
    images,
    isBlocked,
    hasSelectedOcrModel,
    runFullInferenceForImage,
    selectedOcrModels,
    startBlocking,
    stopBlocking,
    setNotification,
  ]);

  const handleBulkDetectRecognize = useCallback(async () => {
    if (isBlocked) return;
    const targets = images.filter((img) => img.id);
    if (!targets.length) return;
    if (!hasSelectedOcrModel()) {
      setNotification({
        open: true,
        message: "Select at least one model before running inference.",
        severity: "warning",
      });
      return;
    }

    const firstStage: BulkOcrStage = selectedOcrModels.detect
      ? "detecting"
      : selectedOcrModels.recognize
      ? "recognizing"
      : "classifying";

    setIsBulkOcrRunning(true);
    setBulkOcrStatus(
      targets.reduce(
        (acc, img) => ({ ...acc, [img.id!]: { status: "pending" as const } }),
        {}
      )
    );

    startBlocking("Running inference on all pages...");

    try {
      for (const img of targets) {
        if (!img.id) continue;
        setBulkOcrStatus((prev) => ({ ...prev, [img.id!]: { status: firstStage } }));
        try {
          const result = await runFullInferenceForImage(img, selectedOcrModels, (status) =>
            setBulkOcrStatus((prev) => ({ ...prev, [img.id!]: { status } }))
          );
          if (result?.shapes) {
            handleImageUpdated({ ...img, ocr_annotations: result.shapes });
          }
          setBulkOcrStatus((prev) => ({ ...prev, [img.id!]: { status: "done" } }));
        } catch (error) {
          console.error("Bulk inference failed for image", img.id, error);
          setBulkOcrStatus((prev) => ({
            ...prev,
            [img.id!]: { status: "error", error: "inference failed" },
          }));
        }
      }
    } finally {
      setIsBulkOcrRunning(false);
      stopBlocking();
    }
  }, [
    handleImageUpdated,
    images,
    isBlocked,
    hasSelectedOcrModel,
    runFullInferenceForImage,
    selectedOcrModels,
    startBlocking,
    stopBlocking,
    setNotification,
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

  const handleRequireCategory = useCallback(() => {
    setNotification({
      open: true,
      message: "Create/select a category before adding points.",
      severity: "info",
    });
  }, [setNotification]);

  const handleNotificationClose = () => {
    setNotification((prev) => ({ ...prev, open: false }));
  };

  const handleBackToRoot = () => {
    navigate("/");
  };

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
      <ProjectDetailBlockingOverlay
        isBlocked={isBlocked}
        blockingMessage={blockingMessage}
        isPropagating={isPropagating}
        propagationProgress={propagationProgress}
        isBulkOcrRunning={isBulkOcrRunning}
        bulkOcrStatus={bulkOcrStatus}
        images={images}
        isImportingDataset={isImportingDataset}
        datasetImportProgress={datasetImportProgress}
      />
      <CssBaseline />
      <ProjectDetailHeader
        projectType={projectType}
        project={project}
        isBlocked={isBlocked}
        snapshotsCount={snapshots.length}
        hasCurrentImage={Boolean(currentImage)}
        onSelectFolder={handleSelectFolder}
        onOpenLoadPage={() => setLoadDialogMode("page")}
        onOpenLoadProject={() => setLoadDialogMode("project")}
        onOpenSaveDialog={() => setSaveDialogOpen(true)}
        onImportOcrDataset={handleImportOcrDataset}
        onOpenTraining={openTrainingPage}
        onBack={handleBackToRoot}
        onLogout={logoutUser}
        openSettingsDialog={openSettingsDialog}
        maxFrames={maxFrames}
        stride={stride}
        onSettingsClose={() => setOpenSettingsDialog(false)}
        onSettingsSubmit={handleSettingsSubmit}
        onMaxFramesChange={(value) => setMaxFrames(value)}
        onStrideChange={(value) => setStride(value)}
        showOcrActions={isOCRProject}
      />
      {loading && <LinearProgress />}
      {images.length > 0 ? (
        isOCRProject ? (
          <OcrWorkspace
            images={images}
            currentIndex={currentIndex}
            currentImage={currentImage}
            projectType={projectType}
            projectId={projectId}
            imageEndpointBase={imageEndpointBase}
            categories={categories}
            activeCategoryId={activeCategoryId}
            showOcrCategoryPanel={showOcrCategoryPanel}
            maxOcrCategoryHeight={maxOcrCategoryHeight}
            ocrCategoryPanelRef={ocrCategoryPanelRef}
            selectedShapeIds={selectedShapeIds}
            selectionScrollSignal={selectionScrollSignal}
            ocrTool={ocrTool}
            showOcrText={showOcrText}
            isBlocked={isBlocked}
            isBulkOcrRunning={isBulkOcrRunning}
            canUndo={canUndo}
            canRedo={canRedo}
            isApplyingHistory={isApplyingHistory}
            selectedOcrModels={selectedOcrModels}
            onToggleOcrModel={toggleOcrModel}
            onSelectCategory={handleSelectCategory}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
            onColorChange={handleColorChange}
            onRenameCategory={handleRenameCategory}
            onSelectShapesFromList={handleSelectShapesFromList}
            onSelectShapesFromImage={handleSelectShapesFromImage}
            onOcrToolChange={(tool) => setOcrTool(tool)}
            onToggleShowOcrText={(value) => setShowOcrText(value)}
            onImageUpdated={handleImageUpdated}
            onStartBlocking={startBlocking}
            onStopBlocking={stopBlocking}
            onRunInference={handleFullInference}
            onRunInferenceAll={handleBulkDetectRecognize}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onPrevImage={handlePrevImage}
            onNextImage={handleNextImage}
            onThumbnailClick={handleThumbnailClick}
            onPropagateMask={handlePropagateMask}
            onClearLabels={handleClearLabels}
            viewportControls={ocrViewportControls}
            onRegisterViewportControls={(controls) => setOcrViewportControls(controls)}
          />
        ) : (
          <SegmentationWorkspace
            images={images}
            currentIndex={currentIndex}
            categories={categories}
            activeCategoryId={activeCategoryId}
            highlightCategoryId={highlightCategoryId}
            highlightSignal={highlightSignal}
            promptLoading={promptLoading}
            loading={loading}
            isBlocked={isBlocked}
            projectType={projectType}
            onGenerateFromPrompt={handleGenerateFromPrompt}
            onSelectCategory={handleSelectCategory}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
            onColorChange={handleColorChange}
            onImageUpdated={handleImageUpdated}
            onPointsUpdated={handlePointsUpdated}
            onRequireCategory={handleRequireCategory}
            onStartBlocking={startBlocking}
            onStopBlocking={stopBlocking}
            onPrevImage={handlePrevImage}
            onNextImage={handleNextImage}
            onPropagateMask={handlePropagateMask}
            onClearLabels={handleClearLabels}
            onThumbnailClick={handleThumbnailClick}
            viewportControls={segmentationViewportControls}
            onRegisterViewportControls={(controls) =>
              setSegmentationViewportControls(controls)
            }
          />
        )
      ) : (
        <Typography variant="body1" color="text.secondary" align="center">
          No images loaded. Please upload images.
        </Typography>
      )}
      <ProjectDetailSnapshotDialogs
        loadDialogMode={loadDialogMode}
        snapshots={snapshots}
        currentImage={currentImage}
        isBlocked={isBlocked}
        onCloseLoadDialog={() => setLoadDialogMode(null)}
        onLoadSnapshot={handleLoadSnapshot}
        onDeleteSnapshot={handleDeleteSnapshot}
        saveDialogOpen={saveDialogOpen}
        snapshotName={snapshotName}
        onSnapshotNameChange={(value) => setSnapshotName(value)}
        onCloseSaveDialog={() => setSaveDialogOpen(false)}
        onConfirmSaveSnapshot={handleConfirmSaveSnapshot}
      />
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
