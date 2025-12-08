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
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import type { AlertColor } from "@mui/material";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import PolylineIcon from "@mui/icons-material/Polyline";
import NearMeIcon from "@mui/icons-material/NearMe";

import ImageDisplaySegmentation from "../components/ImageDisplaySegmentation";
import ImageDisplayOCR from "../components/ImageDisplayOCR";
import NavigationButtons from "../components/NavigationButtons";
import Controls from "../components/Controls";
import OCRControls from "../components/OCRControls";
import ThumbnailGrid from "../components/ThumbnailGrid";
import MaskCategoryPanel from "../components/MaskCategoryPanel";
import OCRTextList from "../components/OCRTextList";
import TextPromptMaskForm from "../components/TextPromptMaskForm";
import { AuthContext } from "../AuthContext";
import type {
  ImageModel,
  MaskCategory,
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
  const loading = loadingCounter > 0;

  const [blockingOps, setBlockingOps] = useState(0);
  const [blockingMessage, setBlockingMessage] = useState("Working...");
  const isBlocked = blockingOps > 0;
  const [propagationProgress, setPropagationProgress] = useState(0);
  const [isPropagating, setIsPropagating] = useState(false);
  const progressIntervalRef = useRef<number | null>(null);
  const isPollingProgressRef = useRef(false);

  // OCR State
  const [ocrTool, setOcrTool] = useState<"rect" | "polygon" | "select">("select");
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

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
    setSelectedShapeId(null);
  }, [images.length, isBlocked]);

  const handlePrevImage = useCallback(() => {
    if (isBlocked) return;
    setCurrentIndex((prevIndex) => Math.max(prevIndex - 1, 0));
    setSelectedShapeId(null);
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
            const response = await axiosInstance.post<ImageModel[]>(`images/`, formData, {
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
    setSelectedShapeId(null);
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
        ocr_annotations: [],
      }))
    );
    setProject((prev) =>
      prev
        ? {
            ...prev,
            images: prev.images.map((img) => ({
              ...img,
              masks: [],
              ocr_annotations: [],
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

  const isOcrProject = projectType === "ocr" || projectType === "ocr_kie";

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
          <Button onClick={handleBackToRoot} color="inherit">
            Back to Projects
          </Button>
          <Button onClick={logoutUser} color="error" sx={{ ml: 2 }}>
            Logout
          </Button>
        </Box>
      </Box>

      <Box display="flex" flexGrow={1} overflow="hidden">
        {/* Left Side Panel */}
        <Box
          sx={{
            width: 320,
            minWidth: 320,
            borderRight: "1px solid #1f2a3d",
            display: "flex",
            flexDirection: "column",
            bgcolor: "background.paper",
            zIndex: 10,
          }}
        >
          {isOcrProject ? (
              <OCRTextList
                  image={images[currentIndex] || ({} as ImageModel)}
                  projectType={projectType}
                  selectedShapeId={selectedShapeId}
                  onSelectShape={setSelectedShapeId}
                  onImageUpdated={handleImageUpdated}
                  disabled={isBlocked || images.length === 0}
              />
          ) : (
              <MaskCategoryPanel
                categories={categories}
                activeCategoryId={activeCategoryId}
                onSelectCategory={handleSelectCategory}
                onAddCategory={handleAddCategory}
                onDeleteCategory={handleDeleteCategory}
                onColorChange={handleColorChange}
                disabled={isBlocked}
              />
          )}
        </Box>

        {/* Main Content Area */}
        <Box flexGrow={1} display="flex" flexDirection="column" position="relative" bgcolor="#0d1117">
          {/* Toolbar */}
          <Box
            sx={{
              p: 1,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid #1f2a3d",
              bgcolor: "background.paper",
            }}
          >
            <Box display="flex" gap={2} alignItems="center">
              <NavigationButtons
                onPrev={handlePrevImage}
                onNext={handleNextImage}
                currentIndex={currentIndex}
                total={images.length}
                disabled={isBlocked}
              />
              {isOcrProject ? (
                  <>
                    <ToggleButtonGroup
                        value={ocrTool}
                        exclusive
                        onChange={(e, newTool) => {
                            if (newTool) setOcrTool(newTool);
                        }}
                        size="small"
                    >
                        <ToggleButton value="select" title="Select/Edit">
                            <NearMeIcon />
                        </ToggleButton>
                        <ToggleButton value="rect" title="Rectangle">
                            <CropSquareIcon />
                        </ToggleButton>
                        <ToggleButton value="polygon" title="Polygon">
                            <PolylineIcon />
                        </ToggleButton>
                    </ToggleButtonGroup>
                    <OCRControls
                        image={images[currentIndex] || ({} as ImageModel)}
                        projectType={projectType}
                        onImageUpdated={handleImageUpdated}
                        onStartBlocking={startBlocking}
                        onStopBlocking={stopBlocking}
                        disabled={isBlocked || images.length === 0}
                    />
                  </>
              ) : (
                  <Controls
                    onClearLabels={handleClearLabels}
                    onPropagateMask={handlePropagateMask}
                    disabled={isBlocked}
                    projectType={projectType}
                  />
              )}
            </Box>
            
            {!isOcrProject && (
                <Box>
                  <TextPromptMaskForm
                    onSubmit={handleGenerateFromPrompt}
                    loading={promptLoading}
                    disabled={isBlocked || images.length === 0}
                  />
                </Box>
            )}
          </Box>

          {/* Image Display Area */}
          <Box flexGrow={1} position="relative" overflow="hidden">
            {loading && (
              <Box
                position="absolute"
                top={0}
                left={0}
                width="100%"
                zIndex={10}
              >
                <LinearProgress color="secondary" />
              </Box>
            )}

            {images.length > 0 ? (
              isOcrProject ? (
                  <ImageDisplayOCR
                    image={images[currentIndex]}
                    onImageUpdated={handleImageUpdated}
                    disabled={isBlocked}
                    activeTool={ocrTool}
                    selectedShapeId={selectedShapeId}
                    onSelectShape={setSelectedShapeId}
                    onStartBlocking={startBlocking}
                    onStopBlocking={stopBlocking}
                  />
              ) : (
                  <ImageDisplaySegmentation
                    image={images[currentIndex]}
                    categories={categories}
                    activeCategoryId={activeCategoryId}
                    highlightCategoryId={highlightCategoryId}
                    highlightSignal={highlightSignal}
                    onImageUpdated={handleImageUpdated}
                    onPointsUpdated={handlePointsUpdated}
                    onRequireCategory={() => {
                      setNotification({
                        open: true,
                        message: "Please select or create a category first.",
                        severity: "warning",
                      });
                    }}
                    disabled={isBlocked}
                    onStartBlocking={startBlocking}
                    onStopBlocking={stopBlocking}
                  />
              )
            ) : (
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                height="100%"
                color="text.secondary"
              >
                <Typography variant="h6">
                  No images uploaded. Click "Upload Images" to start.
                </Typography>
              </Box>
            )}
          </Box>

          {/* Thumbnails */}
          <Box sx={{ height: 100, borderTop: "1px solid #1f2a3d", bgcolor: "background.paper" }}>
            <ThumbnailGrid
              images={images}
              currentIndex={currentIndex}
              onThumbnailClick={handleThumbnailClick}
            />
          </Box>
        </Box>
      </Box>

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleNotificationClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={handleNotificationClose} severity={notification.severity} sx={{ width: "100%" }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default ProjectDetailPage;
