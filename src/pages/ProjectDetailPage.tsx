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
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Paper,
  Stack,
} from "@mui/material";
import type { AlertColor } from "@mui/material";

import ImageDisplaySegmentation from "../components/ImageDisplaySegmentation";
import ImageDisplayOCR from "../components/ImageDisplayOCR";
import NavigationButtons from "../components/NavigationButtons";
import Controls from "../components/Controls";
import ThumbnailGrid from "../components/ThumbnailGrid";
import MaskCategoryPanel from "../components/MaskCategoryPanel";
import TextPromptMaskForm from "../components/TextPromptMaskForm";
import { AuthContext } from "../AuthContext";
import type {
  ImageModel,
  MaskCategory,
  OcrShape,
  Project,
  ProjectType,
  SegmentationPoint,
} from "../types";

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
  const isOcrProject = projectType === "ocr" || projectType === "ocr_kie";
  const imageEndpoint = isOcrProject ? "ocr-images" : "images";
  const loading = loadingCounter > 0;

  const [blockingOps, setBlockingOps] = useState(0);
  const [blockingMessage, setBlockingMessage] = useState("Working...");
  const isBlocked = blockingOps > 0;
  const [propagationProgress, setPropagationProgress] = useState(0);
  const [isPropagating, setIsPropagating] = useState(false);
  const ocrSaveTimeoutRef = useRef<Record<number, number>>({});
  const [ocrShapes, setOcrShapes] = useState<Record<number, OcrShape[]>>({});
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [kieCategories, setKieCategories] = useState<string[]>(["Name", "Date", "Total"]);
  const [newKieCategory, setNewKieCategory] = useState("");
  const progressIntervalRef = useRef<number | null>(null);
  const isPollingProgressRef = useRef(false);

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

  const handleSelectCategory = (categoryId: number) => {
    setActiveCategoryId(categoryId);
    setHighlightCategoryId(categoryId);
    setHighlightSignal((prev) => prev + 1);
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
    }),
    [bustCache]
  );

  useEffect(() => {
    const fetchProject = async () => {
      if (!projectId) return;
      try {
        const response = await axiosInstance.get<Project>(`projects/${projectId}/`);

        const decoratedImages = (response.data.images || []).map(decorateImage);
        setCategories(response.data.categories || []);
        setProject({ ...response.data, images: decoratedImages });
        setImages(decoratedImages);
        setOcrShapes(() => {
          const next: Record<number, OcrShape[]> = {};
          decoratedImages.forEach((img) => {
            next[img.id] = (img as any).ocr_annotations || [];
          });
          return next;
        });
        setSelectedShapeId(null);
        setTimeout(() => {
          setImages((prev) => prev.map((img) => ({ ...img })));
        }, 0);
        const initialCategory =
          response.data.categories?.[0]?.id ||
          decoratedImages[0]?.masks?.[0]?.category?.id ||
          null;
        setActiveCategoryId(initialCategory);
        setHighlightCategoryId(initialCategory);
      } catch (error) {
        console.error("Error fetching project details:", error);
        setNotification({
          open: true,
          message: "Error fetching project details.",
          severity: "error",
        });
      }
    };

    fetchProject();
  }, [projectId, decorateImage]);

  useEffect(() => {
    modelLoadedRef.current = false;
  }, [projectId]);

  useEffect(() => () => {
    clearProgressPolling();
  }, [clearProgressPolling]);

  useEffect(() => {
    setOcrShapes((prev) => {
      const next = { ...prev };
      images.forEach((img) => {
        if (!next[img.id]) {
          next[img.id] = (img as any).ocr_annotations || [];
        }
      });
      return next;
    });
  }, [images]);

  useEffect(() => {
    const img = images[currentIndex];
    if (!img) return;
    const shapesForImage = ocrShapes[img.id] || [];
    const stillExists = shapesForImage.find((s) => s.id === selectedShapeId);
    if (!stillExists) {
      setSelectedShapeId(shapesForImage[0]?.id || null);
    }
  }, [currentIndex, images, ocrShapes, selectedShapeId]);

  useEffect(() => {
    const requiresModel =
      projectType === "segmentation" ||
      projectType === "video_tracking_segmentation";
    if (!project || !requiresModel || modelLoadedRef.current) {
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
  }, [project, projectType, projectId, startBlocking, stopBlocking, startLoading, stopLoading]);

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

      if (event.key === "a") {
        handlePrevImage();
      } else if (event.key === "d") {
        handleNextImage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleNextImage, handlePrevImage, isBlocked]);

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
            const uploadEndpoint = isOcrProject ? "ocr-images" : "images";
            const response = await axiosInstance.post<ImageModel[]>(`${uploadEndpoint}/`, formData, {
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
  const handleThumbnailClick = (index: number) => {
    if (isBlocked) return;
    setCurrentIndex(index);
    const img = images[index];
    if (img) {
      const shapesForImage = ocrShapes[img.id] || [];
      setSelectedShapeId(shapesForImage[0]?.id || null);
    }
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

  const updateOcrShapeState = (imageId: number, shapes: OcrShape[]) => {
    setOcrShapes((prev) => ({ ...prev, [imageId]: shapes }));
  };

  const persistOcrShapes = useCallback(
    async (imageId: number, shapes: OcrShape[]) => {
      try {
        const response = await axiosInstance.post<{ shapes: OcrShape[] }>(
          `${imageEndpoint}/${imageId}/ocr_annotations/`,
          { shapes }
        );
        const saved = response.data?.shapes || shapes;
        updateOcrShapeState(imageId, saved);
        if (imageId === images[currentIndex]?.id) {
          if (!saved.length) {
            setSelectedShapeId(null);
          } else if (!selectedShapeId || !saved.some((s) => s.id === selectedShapeId)) {
            setSelectedShapeId(saved[saved.length - 1].id);
          }
        }
      } catch (error) {
        console.error("Error saving OCR annotations:", error);
        setNotification({
          open: true,
          message: "Failed to save OCR annotations.",
          severity: "error",
        });
      }
    },
    [currentIndex, images, selectedShapeId, imageEndpoint]
  );

  const handleOcrShapesChanged = (imageId: number, updatedShapes: OcrShape[]) => {
    updateOcrShapeState(imageId, updatedShapes);
    if (ocrSaveTimeoutRef.current[imageId]) {
      window.clearTimeout(ocrSaveTimeoutRef.current[imageId]);
    }
    ocrSaveTimeoutRef.current[imageId] = window.setTimeout(() => {
      persistOcrShapes(imageId, updatedShapes);
    }, 180);
    if (images[currentIndex]?.id !== imageId) return;
    if (!updatedShapes.length) {
      setSelectedShapeId(null);
      return;
    }
    if (!selectedShapeId || !updatedShapes.some((s) => s.id === selectedShapeId)) {
      setSelectedShapeId(updatedShapes[updatedShapes.length - 1].id);
    }
  };

  const handleDetectRegions = async () => {
    if (isBlocked || !isOcrProject) return;
    const img = images[currentIndex];
    if (!img) return;
    try {
      startBlocking("Detecting regions...");
      startLoading();
      const response = await axiosInstance.post<{ shapes: OcrShape[] }>(
        `${imageEndpoint}/${img.id}/detect_regions/`,
        { mode: projectType }
      );
      const detectedShapes = response.data?.shapes || [];
      updateOcrShapeState(img.id, detectedShapes);
      setSelectedShapeId(detectedShapes[0]?.id || null);
      setNotification({
        open: true,
        message: `Detected ${detectedShapes.length} region(s).`,
        severity: "success",
      });
    } catch (error) {
      console.error("Error detecting regions:", error);
      setNotification({
        open: true,
        message: "Failed to detect regions.",
        severity: "error",
      });
    } finally {
      stopBlocking();
      stopLoading();
    }
  };

  const handleRecognizeText = async () => {
    if (isBlocked || !isOcrProject) return;
    const img = images[currentIndex];
    if (!img) return;
    const shapesForImage = ocrShapes[img.id] || [];
    if (!shapesForImage.length) {
      setNotification({
        open: true,
        message: "Add or detect a box before running OCR.",
        severity: "info",
      });
      return;
    }
    try {
      startBlocking("Running OCR...");
      startLoading();
      const response = await axiosInstance.post<{ shapes: OcrShape[] }>(
        `${imageEndpoint}/${img.id}/recognize_text/`,
        { shapes: shapesForImage }
      );
      const recognizedShapes = response.data?.shapes || shapesForImage;
      updateOcrShapeState(img.id, recognizedShapes);
      setNotification({
        open: true,
        message: "Recognized text for current boxes.",
        severity: "success",
      });
    } catch (error) {
      console.error("Error recognizing text:", error);
      setNotification({
        open: true,
        message: "Failed to recognize text.",
        severity: "error",
      });
    } finally {
      stopBlocking();
      stopLoading();
    }
  };

  const handleClassifyKie = async () => {
    if (isBlocked || projectType !== "ocr_kie") return;
    const img = images[currentIndex];
    if (!img) return;
    const shapesForImage = ocrShapes[img.id] || [];
    if (!shapesForImage.length) {
      setNotification({
        open: true,
        message: "Add or detect boxes before classification.",
        severity: "info",
      });
      return;
    }
    try {
      startBlocking("Classifying fields...");
      startLoading();
      const response = await axiosInstance.post<{ shapes: OcrShape[]; categories?: string[] }>(
        `${imageEndpoint}/${img.id}/classify_kie/`,
        { shapes: shapesForImage, categories: kieCategories }
      );
      const classifiedShapes = response.data?.shapes || shapesForImage;
      updateOcrShapeState(img.id, classifiedShapes);
      const returnedCategories = response.data?.categories || [];
      if (returnedCategories.length) {
        setKieCategories((prev) => Array.from(new Set([...prev, ...returnedCategories])));
      }
      setNotification({
        open: true,
        message: "Updated categories from KIE model.",
        severity: "success",
      });
    } catch (error) {
      console.error("Error classifying KIE:", error);
      setNotification({
        open: true,
        message: "Failed to classify fields.",
        severity: "error",
      });
    } finally {
      stopBlocking();
      stopLoading();
    }
  };

  const handleImageUpdated = (updatedImage: ImageModel) => {
    const normalized = decorateImage(updatedImage);
    setImages((prev) =>
      prev.map((img) =>
        img.id === normalized.id ? { ...img, ...normalized } : img
      )
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
  };

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
    if (isOcrProject) {
      const img = images[currentIndex];
      if (img) {
        try {
          await axiosInstance.delete(`${imageEndpoint}/${img.id}/ocr_annotations/`, {
            data: { ids: [] },
          });
        } catch (error) {
          console.error("Error clearing OCR annotations:", error);
        }
      }
      setOcrShapes((prev) => {
        const cleared: Record<number, OcrShape[]> = {};
        images.forEach((image) => {
          cleared[image.id] = [];
        });
        return cleared;
      });
      setSelectedShapeId(null);
      setNotification({
        open: true,
        message: "Cleared OCR annotations.",
        severity: "info",
      });
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

  const renderSegmentationWorkspace = () => (
    <Box display="flex" flexDirection="column" flexGrow={1} height="100%" overflow="hidden">
      <Box display="flex" flexGrow={1} overflow="hidden">
        <Box
          sx={{
            flexShrink: 0,
            width: 320,
            minWidth: 260,
            maxWidth: "50vw",
            resize: "horizontal",
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 1,
            height: "100%",
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
          <MaskCategoryPanel
            categories={categories}
            activeCategoryId={activeCategoryId}
            onSelectCategory={handleSelectCategory}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
            onColorChange={handleColorChange}
          />
        </Box>
        <Box flexGrow={1} display="flex" flexDirection="column" overflow="hidden" p={2}>
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
  );

  const renderOcrWorkspace = () => {
    const currentImage = images[currentIndex];
    const shapesForImage = currentImage ? ocrShapes[currentImage.id] || [] : [];
    const selectedShape = shapesForImage.find((s) => s.id === selectedShapeId) || null;

    const updateSelectedShape = (updates: Partial<OcrShape>) => {
      if (!currentImage || !selectedShape) return;
      const updated = shapesForImage.map((s) =>
        s.id === selectedShape.id ? { ...s, ...updates } : s
      );
      handleOcrShapesChanged(currentImage.id, updated);
    };

    const handleApplyCategory = (category: string) => {
      if (!category) return;
      if (!kieCategories.includes(category)) {
        setKieCategories((prev) => [...prev, category]);
      }
      updateSelectedShape({ category });
    };

    return (
      <Box display="flex" flexDirection="column" flexGrow={1} height="100%" overflow="hidden">
        <Box display="flex" flexGrow={1} overflow="hidden">
          <Paper
            elevation={0}
            sx={{
              width: 360,
              minWidth: 280,
              maxWidth: "50vw",
              flexShrink: 0,
              p: 2,
              pr: 1,
              borderRadius: 0,
              borderRight: "1px solid rgba(255,255,255,0.08)",
              background: "linear-gradient(160deg, rgba(15,22,36,0.9), rgba(18,26,42,0.85))",
              color: "white",
            }}
          >
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Box>
                <Typography variant="h6" fontWeight={700}>
                  OCR Workspace
                </Typography>
                <Typography variant="body2" color="rgba(255,255,255,0.7)">
                  Draw boxes, edit text, and map categories.
                </Typography>
              </Box>
              {projectType === "ocr_kie" && <Chip label="KIE" color="secondary" size="small" />}
            </Box>

            <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
              <Button
                variant="contained"
                color="primary"
                onClick={handleDetectRegions}
                disabled={isBlocked}
              >
                Detect Regions
              </Button>
              <Button
                variant="outlined"
                color="primary"
                onClick={handleRecognizeText}
                disabled={isBlocked}
              >
                Recognize Text
              </Button>
              {projectType === "ocr_kie" && (
                <Button variant="outlined" color="secondary" onClick={handleClassifyKie} disabled={isBlocked}>
                  Classify (KIE)
                </Button>
              )}
              <Button variant="text" color="inherit" onClick={handleClearLabels} disabled={isBlocked}>
                Clear All
              </Button>
            </Stack>

            <Paper
              variant="outlined"
              sx={{
                mb: 2,
                p: 1.5,
                backgroundColor: "rgba(255,255,255,0.02)",
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Typography variant="subtitle2" gutterBottom>
                Recognized Text
              </Typography>
              <List dense sx={{ maxHeight: 240, overflow: "auto" }}>
                {shapesForImage.length === 0 && (
                  <Typography variant="body2" color="rgba(255,255,255,0.65)">
                    No boxes yet. Draw one or run detection.
                  </Typography>
                )}
                {shapesForImage.map((shape, idx) => (
                  <ListItemButton
                    key={shape.id}
                    selected={shape.id === selectedShapeId}
                    onClick={() => setSelectedShapeId(shape.id)}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      border: "1px solid rgba(255,255,255,0.08)",
                      backgroundColor:
                        shape.id === selectedShapeId ? "rgba(90,216,255,0.12)" : "transparent",
                    }}
                  >
                    <ListItemText
                      primary={`Box ${idx + 1} • ${shape.type}`}
                      secondary={
                        <span style={{ color: "rgba(255,255,255,0.7)" }}>
                          {shape.text || "No text yet"}
                        </span>
                      }
                    />
                    {shape.category && (
                      <Chip
                        label={shape.category}
                        size="small"
                        color="secondary"
                        sx={{ ml: 1, textTransform: "capitalize" }}
                      />
                    )}
                  </ListItemButton>
                ))}
              </List>
            </Paper>

            {selectedShape && (
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  backgroundColor: "rgba(255,255,255,0.02)",
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <Typography variant="subtitle2" gutterBottom>
                  Selected Box Details
                </Typography>
                <TextField
                  label="Recognized text"
                  value={selectedShape.text}
                  onChange={(e) => updateSelectedShape({ text: e.target.value })}
                  fullWidth
                  margin="dense"
                  multiline
                  minRows={2}
                  InputLabelProps={{ shrink: true }}
                  variant="filled"
                  sx={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderRadius: 1,
                    input: { color: "white" },
                  }}
                />
                {projectType === "ocr_kie" && (
                  <TextField
                    label="Category"
                    value={selectedShape.category ?? ""}
                    onChange={(e) => updateSelectedShape({ category: e.target.value })}
                    fullWidth
                    margin="dense"
                    InputLabelProps={{ shrink: true }}
                    variant="filled"
                    sx={{
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderRadius: 1,
                      input: { color: "white" },
                    }}
                  />
                )}
              </Paper>
            )}

            {projectType === "ocr_kie" && (
              <Paper
                variant="outlined"
                sx={{
                  mt: 2,
                  p: 1.5,
                  backgroundColor: "rgba(255,255,255,0.02)",
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <Typography variant="subtitle2" gutterBottom>
                  Categories
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {kieCategories.map((cat) => (
                    <Chip
                      key={cat}
                      label={cat}
                      onClick={() => handleApplyCategory(cat)}
                      color={selectedShape?.category === cat ? "secondary" : "default"}
                      sx={{ mb: 1, textTransform: "capitalize" }}
                    />
                  ))}
                </Stack>
                <Stack direction="row" spacing={1} mt={1}>
                  <TextField
                    label="Add category"
                    value={newKieCategory}
                    onChange={(e) => setNewKieCategory(e.target.value)}
                    fullWidth
                    size="small"
                    variant="filled"
                    InputLabelProps={{ shrink: true }}
                    sx={{
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderRadius: 1,
                      input: { color: "white" },
                    }}
                  />
                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => {
                      const trimmed = newKieCategory.trim();
                      if (!trimmed) return;
                      setKieCategories((prev) =>
                        prev.includes(trimmed) ? prev : [...prev, trimmed]
                      );
                      updateSelectedShape({ category: trimmed });
                      setNewKieCategory("");
                    }}
                  >
                    Add
                  </Button>
                </Stack>
              </Paper>
            )}
          </Paper>

          <Box flexGrow={1} display="flex" flexDirection="column" overflow="hidden" p={2}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
              <Typography variant="body2" color="text.secondary">
                Click to draw rectangles or polygons. Select to move or resize.
              </Typography>
              <NavigationButtons
                onPrev={handlePrevImage}
                onNext={handleNextImage}
                disablePrev={currentIndex === 0}
                disableNext={currentIndex === images.length - 1}
                disabled={isBlocked}
              />
            </Box>
            <Box display="flex" flexGrow={1} overflow="hidden">
              <Box flexGrow={1} minHeight={0}>
                {currentImage && (
                  <ImageDisplayOCR
                    image={currentImage}
                    shapes={shapesForImage}
                    selectedShapeId={selectedShapeId}
                    onShapesChange={handleOcrShapesChanged}
                    onSelectShape={setSelectedShapeId}
                    projectType={projectType}
                    disabled={isBlocked}
                  />
                )}
              </Box>
              <Box width={110} pl={2} display="flex" flexDirection="column" gap={1}>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={async () => {
                    if (!currentImage || !selectedShape) return;
                    const remaining = shapesForImage.filter((s) => s.id !== selectedShape.id);
                    try {
                      await axiosInstance.delete(`${imageEndpoint}/${currentImage.id}/ocr_annotations/`, {
                        data: { ids: [selectedShape.id] },
                      });
                    } catch (error) {
                      console.error("Error deleting OCR annotation:", error);
                    }
                    handleOcrShapesChanged(currentImage.id, remaining);
                  }}
                  disabled={isBlocked || !selectedShape}
                >
                  Delete Box
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={() => {
                    if (!currentImage || shapesForImage.length === 0) return;
                    setSelectedShapeId(shapesForImage[0].id);
                  }}
                  disabled={isBlocked || shapesForImage.length === 0}
                >
                  First Box
                </Button>
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
    );
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
          {isPropagating && (
            <Box sx={{ width: 260, display: "flex", flexDirection: "column", gap: 1 }}>
              <LinearProgress
                variant="determinate"
                value={propagationProgress}
                sx={{ width: "100%" }}
              />
              <Typography variant="caption" sx={{ textAlign: "center", color: "rgba(255,255,255,0.9)" }}>
                Propagation {propagationProgress}% complete
              </Typography>
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
        isOcrProject ? renderOcrWorkspace() : renderSegmentationWorkspace()
      ) : (
        <Typography variant="body1" color="text.secondary" align="center">
          No images loaded. Please upload images.
        </Typography>
      )}
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
