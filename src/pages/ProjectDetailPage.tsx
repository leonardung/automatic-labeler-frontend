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
} from "@mui/material";
import type { AlertColor } from "@mui/material";

import ImageDisplaySegmentation from "../components/ImageDisplaySegmentation";
import NavigationButtons from "../components/NavigationButtons";
import Controls from "../components/Controls";
import ThumbnailGrid from "../components/ThumbnailGrid";
import MaskCategoryPanel from "../components/MaskCategoryPanel";
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
      }
    } catch (error) {
      console.error("Error propagating mask:", error);
      setNotification({
        open: true,
        message: "Error propagating mask.",
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
                onSelectCategory={setActiveCategoryId}
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
