import { useCallback } from "react";
import axiosInstance from "../../axiosInstance";
import type {
  ImageModel,
  MaskCategory,
  OCRAnnotation,
  Project,
  ProjectSnapshot,
  SelectedOcrModels,
  SegmentationPoint,
} from "../../types";
import {
  areOcrAnnotationsEqual,
  cloneOcrAnnotations,
  decorateImage,
  formatSnapshotLabel,
} from "./utils";
import type { BulkOcrStage, OCRTool, ViewportControls } from "./types";
import type { ProjectDetailState } from "./useProjectDetailState";

export const useProjectDetailActions = (state: ProjectDetailState) => {
  const {
    projectId,
    navigate,
    project,
    setProject,
    images,
    setImages,
    categories,
    setCategories,
    activeCategoryId,
    setActiveCategoryId,
    setHighlightCategoryId,
    setHighlightSignal,
    currentIndex,
    setCurrentIndex,
    setLoadingCounter,
    setNotification,
    setPromptLoading,
    setOpenSettingsDialog,
    maxFrames,
    setMaxFrames,
    stride,
    setStride,
    projectType,
    setOcrTool,
    selectedShapeIds,
    setSelectedShapeIds,
    setSelectionScrollSignal,
    currentImage,
    isOCRProject,
    showOcrCategoryPanel,
    imageEndpointBase,
    setSnapshots,
    setLoadDialogMode,
    setSaveDialogOpen,
    snapshotName,
    setSnapshotName,
    ocrHistory,
    setOcrHistory,
    suppressOcrHistoryRef,
    isApplyingHistory,
    setIsApplyingHistory,
    setBlockingOps,
    setBlockingMessage,
    isBlocked,
    setPropagationProgress,
    setIsPropagating,
    setDatasetImportProgress,
    setIsImportingDataset,
    setBulkOcrStatus,
    setIsBulkOcrRunning,
    setShowOcrText,
    progressIntervalRef,
    datasetProgressIntervalRef,
    isPollingProgressRef,
    isPollingDatasetProgressRef,
    setSegmentationViewportControls,
    setOcrViewportControls,
    selectedOcrModels,
    setSelectedOcrModels,
  } = state;

  const startLoading = useCallback(() => {
    setLoadingCounter((count) => count + 1);
  }, [setLoadingCounter]);

  const stopLoading = useCallback(() => {
    setLoadingCounter((count) => Math.max(0, count - 1));
  }, [setLoadingCounter]);

  const startBlocking = useCallback(
    (message?: string) => {
      setBlockingMessage(message || "Working...");
      setBlockingOps((count) => count + 1);
    },
    [setBlockingMessage, setBlockingOps]
  );

  const stopBlocking = useCallback(() => {
    setBlockingOps((count) => Math.max(0, count - 1));
  }, [setBlockingOps]);

  const toggleOcrModel = useCallback(
    (model: keyof SelectedOcrModels) => {
      setSelectedOcrModels((prev) => ({ ...prev, [model]: !prev[model] }));
    },
    [setSelectedOcrModels]
  );

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
  }, [progressIntervalRef]);

  const clearDatasetProgressPolling = useCallback(() => {
    if (datasetProgressIntervalRef.current !== null) {
      clearInterval(datasetProgressIntervalRef.current);
      datasetProgressIntervalRef.current = null;
    }
  }, [datasetProgressIntervalRef]);

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
    [setOcrHistory, suppressOcrHistoryRef]
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
  }, [
    clearProgressPolling,
    isPollingProgressRef,
    projectId,
    setIsPropagating,
    setNotification,
    setPropagationProgress,
  ]);

  const startProgressPolling = useCallback(() => {
    setPropagationProgress(0);
    clearProgressPolling();
    pollPropagationProgress();
    progressIntervalRef.current = window.setInterval(pollPropagationProgress, 1000);
  }, [clearProgressPolling, pollPropagationProgress, progressIntervalRef, setPropagationProgress]);

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
  }, [
    clearDatasetProgressPolling,
    isPollingDatasetProgressRef,
    projectId,
    setDatasetImportProgress,
  ]);

  const startDatasetProgressPolling = useCallback(() => {
    clearDatasetProgressPolling();
    pollDatasetImportProgress();
    datasetProgressIntervalRef.current = window.setInterval(pollDatasetImportProgress, 1000);
  }, [
    clearDatasetProgressPolling,
    datasetProgressIntervalRef,
    pollDatasetImportProgress,
  ]);

  const handleNextImage = useCallback(() => {
    if (isBlocked) return;
    setCurrentIndex((prevIndex) => Math.min(prevIndex + 1, images.length - 1));
  }, [images.length, isBlocked, setCurrentIndex]);

  const handlePrevImage = useCallback(() => {
    if (isBlocked) return;
    setCurrentIndex((prevIndex) => Math.max(prevIndex - 1, 0));
  }, [isBlocked, setCurrentIndex]);

  const openTrainingPage = useCallback(() => {
    if (!projectId) return;
    navigate(`/projects/${projectId}/training`, { state: { projectName: project?.name } });
  }, [navigate, project?.name, projectId]);

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
        return categoryList[0]?.id || decoratedImages[0]?.masks?.[0]?.category?.id || null;
      });
      setHighlightCategoryId((prev) => {
        const hasPrev = prev && categoryList.some((c) => c.id === prev);
        return hasPrev ? prev : null;
      });
      setSelectedShapeIds([]);
      setOcrTool("select");
    },
    [
      setActiveCategoryId,
      setCategories,
      setCurrentIndex,
      setHighlightCategoryId,
      setImages,
      setOcrTool,
      setProject,
      setSelectedShapeIds,
    ]
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
  }, [projectId, setSnapshots]);

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
  }, [applyProjectPayload, projectId, setImages, setNotification]);

  const selectFiles = useCallback(() => {
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
  }, [
    imageEndpointBase,
    images.length,
    maxFrames,
    projectId,
    projectType,
    setCurrentIndex,
    setImages,
    setNotification,
    startLoading,
    stopLoading,
    stride,
  ]);

  const handleSelectFolder = useCallback(() => {
    if (isBlocked) return;
    if (projectType === "video_tracking_segmentation") {
      setOpenSettingsDialog(true);
      return;
    }

    selectFiles();
  }, [isBlocked, projectType, selectFiles, setOpenSettingsDialog]);

  const handleSettingsSubmit = useCallback(() => {
    if (isBlocked) return;
    setOpenSettingsDialog(false);
    selectFiles();
  }, [isBlocked, selectFiles, setOpenSettingsDialog]);

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
    setDatasetImportProgress,
    setIsImportingDataset,
    setNotification,
    startBlocking,
    startDatasetProgressPolling,
    stopBlocking,
  ]);

  const handleThumbnailClick = useCallback(
    (index: number) => {
      if (isBlocked) return;
      setCurrentIndex(index);
    },
    [isBlocked, setCurrentIndex]
  );

  const handlePropagateMask = useCallback(async () => {
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
        setProject((prev) => (prev ? { ...prev, images: updatedImages } : prev));
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
  }, [
    activeCategoryId,
    clearProgressPolling,
    isBlocked,
    projectId,
    projectType,
    setImages,
    setIsPropagating,
    setNotification,
    setProject,
    setPropagationProgress,
    startBlocking,
    startLoading,
    startProgressPolling,
    stopBlocking,
    stopLoading,
  ]);

  const handleSaveSnapshot = useCallback(async (name?: string) => {
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
  }, [
    isBlocked,
    projectId,
    setNotification,
    setSnapshots,
    startBlocking,
    startLoading,
    stopBlocking,
    stopLoading,
  ]);

  const handleConfirmSaveSnapshot = useCallback(() => {
    const name = snapshotName.trim();
    setSaveDialogOpen(false);
    setSnapshotName("");
    handleSaveSnapshot(name);
  }, [handleSaveSnapshot, setSaveDialogOpen, setSnapshotName, snapshotName]);

  const handleLoadProjectSnapshot = useCallback(async (snapshotId: number) => {
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
  }, [
    applyProjectPayload,
    isBlocked,
    projectId,
    setLoadDialogMode,
    setNotification,
    startBlocking,
    startLoading,
    stopBlocking,
    stopLoading,
  ]);

  const handleLoadPageSnapshot = useCallback(async (snapshotId: number) => {
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
          return categoryPool?.[0]?.id || updatedImage.masks?.[0]?.category?.id || null;
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
  }, [
    categories,
    currentImage,
    isBlocked,
    projectId,
    setActiveCategoryId,
    setCategories,
    setHighlightCategoryId,
    setImages,
    setLoadDialogMode,
    setNotification,
    setProject,
    setSelectedShapeIds,
    startBlocking,
    startLoading,
    stopBlocking,
    stopLoading,
  ]);

  const handleLoadSnapshot = useCallback(
    (mode: "page" | "project", snapshotId: number) => {
      if (mode === "project") {
        handleLoadProjectSnapshot(snapshotId);
      } else {
        handleLoadPageSnapshot(snapshotId);
      }
    },
    [handleLoadPageSnapshot, handleLoadProjectSnapshot]
  );

  const handleDeleteSnapshot = useCallback(async (snapshotId: number) => {
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
  }, [
    isBlocked,
    projectId,
    setNotification,
    setSnapshots,
    startBlocking,
    startLoading,
    stopBlocking,
    stopLoading,
  ]);

  const handleGenerateFromPrompt = useCallback(
    async (promptText: string, maxMasks: number, threshold: number) => {
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
          activeCategoryId && normalizedCategories.some((cat) => cat.id === activeCategoryId);
        const fallbackActive =
          newlyCreatedId || (activeStillExists ? activeCategoryId : null) || normalizedCategories[0]?.id || null;
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
    },
    [
      activeCategoryId,
      currentIndex,
      images,
      isBlocked,
      projectId,
      setActiveCategoryId,
      setCategories,
      setImages,
      setNotification,
      setProject,
      setPromptLoading,
      startBlocking,
      startLoading,
      stopBlocking,
      stopLoading,
    ]
  );

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
    [isOCRProject, recordOcrHistory, setImages, setProject, suppressOcrHistoryRef]
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
    [handleImageUpdated, imageEndpointBase, isOCRProject, setNotification, setSelectedShapeIds, suppressOcrHistoryRef]
  );

  const handleAddCategory = useCallback(
    async (name: string, color: string) => {
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
    },
    [isBlocked, projectId, setActiveCategoryId, setCategories, setNotification]
  );

  const handleDeleteCategory = useCallback(
    async (categoryId: number) => {
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
    },
    [activeCategoryId, isBlocked, setActiveCategoryId, setCategories, setImages, setNotification]
  );

  const handleColorChange = useCallback(
    async (categoryId: number, color: string) => {
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
    },
    [isBlocked, setCategories, setImages]
  );

  const handleRenameCategory = useCallback(
    async (categoryId: number, name: string) => {
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
    },
    [categories, isBlocked, setCategories, setImages, setNotification, setProject]
  );

  const applyCategoryToSelection = useCallback(
    async (categoryId: number) => {
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
    },
    [
      categories,
      currentImage,
      handleImageUpdated,
      imageEndpointBase,
      isOCRProject,
      selectedShapeIds,
      setNotification,
    ]
  );

  const handleSelectCategory = useCallback(
    (categoryId: number) => {
      if (isBlocked) return;
      setActiveCategoryId(categoryId);
      setHighlightCategoryId(categoryId);
      setHighlightSignal((prev) => prev + 1);
      if (isOCRProject && showOcrCategoryPanel) {
        applyCategoryToSelection(categoryId);
      }
    },
    [
      applyCategoryToSelection,
      isBlocked,
      isOCRProject,
      setActiveCategoryId,
      setHighlightCategoryId,
      setHighlightSignal,
      showOcrCategoryPanel,
    ]
  );

  const handleUndo = useCallback(async () => {
    const image = currentImage;
    if (!isOCRProject || !image || isBlocked || isApplyingHistory) return;
    const entry = ocrHistory[image.id] || { past: [], future: [] };
    if (!entry.past.length) return;
    const currentSnapshot = cloneOcrAnnotations(image.ocr_annotations || []);
    let previousSnapshot: OCRAnnotation[] | null = null;
    setOcrHistory((prev) => {
      const stateEntry = prev[image.id] || { past: [], future: [] };
      if (!stateEntry.past.length) return prev;
      previousSnapshot = stateEntry.past[stateEntry.past.length - 1];
      return {
        ...prev,
        [image.id]: {
          past: stateEntry.past.slice(0, -1),
          future: [...stateEntry.future, currentSnapshot],
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
  }, [
    applyOcrAnnotationsForImage,
    currentImage,
    isApplyingHistory,
    isBlocked,
    isOCRProject,
    ocrHistory,
    setIsApplyingHistory,
    setOcrHistory,
  ]);

  const handleSelectShapesFromImage = useCallback(
    (ids: string[]) => {
      setSelectedShapeIds(ids);
      setSelectionScrollSignal((prev) => prev + 1);
    },
    [setSelectedShapeIds, setSelectionScrollSignal]
  );

  const handleSelectShapesFromList = useCallback(
    (ids: string[]) => {
      setSelectedShapeIds(ids);
    },
    [setSelectedShapeIds]
  );

  const handleRedo = useCallback(async () => {
    const image = currentImage;
    if (!isOCRProject || !image || isBlocked || isApplyingHistory) return;
    const entry = ocrHistory[image.id] || { past: [], future: [] };
    if (!entry.future.length) return;
    const currentSnapshot = cloneOcrAnnotations(image.ocr_annotations || []);
    let nextSnapshot: OCRAnnotation[] | null = null;
    setOcrHistory((prev) => {
      const stateEntry = prev[image.id] || { past: [], future: [] };
      if (!stateEntry.future.length) return prev;
      nextSnapshot = stateEntry.future[stateEntry.future.length - 1];
      return {
        ...prev,
        [image.id]: {
          past: [...stateEntry.past, currentSnapshot],
          future: stateEntry.future.slice(0, -1),
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
  }, [
    applyOcrAnnotationsForImage,
    currentImage,
    isApplyingHistory,
    isBlocked,
    isOCRProject,
    ocrHistory,
    setIsApplyingHistory,
    setOcrHistory,
  ]);

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
        const classRes = await axiosInstance.post(`${imageEndpointBase}/${img.id}/classify_kie/`, {
          shapes,
          categories: categories.map((cat) => cat.name),
        });
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
    hasSelectedOcrModel,
    images,
    isBlocked,
    runFullInferenceForImage,
    selectedOcrModels,
    setNotification,
    startBlocking,
    stopBlocking,
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
    hasSelectedOcrModel,
    images,
    isBlocked,
    runFullInferenceForImage,
    selectedOcrModels,
    setBulkOcrStatus,
    setIsBulkOcrRunning,
    setNotification,
    startBlocking,
    stopBlocking,
  ]);

  const handlePointsUpdated = useCallback(
    (imageId: number, categoryId: number, points: SegmentationPoint[]) => {
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
    },
    [setImages, setProject]
  );

  const handleClearLabels = useCallback(async () => {
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
          prev.map((img) => (img.id === targetImage.id ? { ...img, ocr_annotations: [] } : img))
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
  }, [
    currentImage,
    imageEndpointBase,
    isBlocked,
    isOCRProject,
    project,
    recordOcrHistory,
    setImages,
    setNotification,
    setProject,
    setSelectedShapeIds,
  ]);

  const handleRequireCategory = useCallback(() => {
    setNotification({
      open: true,
      message: "Create/select a category before adding points.",
      severity: "info",
    });
  }, [setNotification]);

  const handleNotificationClose = useCallback(() => {
    setNotification((prev) => ({ ...prev, open: false }));
  }, [setNotification]);

  const handleBackToRoot = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const handleSnapshotNameChange = useCallback(
    (value: string) => {
      setSnapshotName(value);
    },
    [setSnapshotName]
  );

  const handleMaxFramesChange = useCallback(
    (value: number) => {
      setMaxFrames(value);
    },
    [setMaxFrames]
  );

  const handleStrideChange = useCallback(
    (value: number) => {
      setStride(value);
    },
    [setStride]
  );

  const openLoadPageDialog = useCallback(() => {
    setLoadDialogMode("page");
  }, [setLoadDialogMode]);

  const openLoadProjectDialog = useCallback(() => {
    setLoadDialogMode("project");
  }, [setLoadDialogMode]);

  const closeLoadDialog = useCallback(() => {
    setLoadDialogMode(null);
  }, [setLoadDialogMode]);

  const openSaveDialog = useCallback(() => {
    setSaveDialogOpen(true);
  }, [setSaveDialogOpen]);

  const closeSaveDialog = useCallback(() => {
    setSaveDialogOpen(false);
  }, [setSaveDialogOpen]);

  const closeSettingsDialog = useCallback(() => {
    setOpenSettingsDialog(false);
  }, [setOpenSettingsDialog]);

  const handleOcrToolChange = useCallback(
    (tool: OCRTool) => {
      setOcrTool(tool);
    },
    [setOcrTool]
  );

  const handleShowOcrTextChange = useCallback(
    (value: boolean) => {
      setShowOcrText(value);
    },
    [setShowOcrText]
  );

  const registerSegmentationViewportControls = useCallback(
    (controls: ViewportControls | null) => {
      setSegmentationViewportControls(controls);
    },
    [setSegmentationViewportControls]
  );

  const registerOcrViewportControls = useCallback(
    (controls: ViewportControls | null) => {
      setOcrViewportControls(controls);
    },
    [setOcrViewportControls]
  );

  return {
    startLoading,
    stopLoading,
    startBlocking,
    stopBlocking,
    toggleOcrModel,
    hasSelectedOcrModel,
    clearProgressPolling,
    clearDatasetProgressPolling,
    recordOcrHistory,
    pollPropagationProgress,
    startProgressPolling,
    pollDatasetImportProgress,
    startDatasetProgressPolling,
    handleNextImage,
    handlePrevImage,
    openTrainingPage,
    applyProjectPayload,
    fetchSnapshots,
    fetchProject,
    selectFiles,
    handleSelectFolder,
    handleSettingsSubmit,
    handleImportOcrDataset,
    handleThumbnailClick,
    handlePropagateMask,
    handleSaveSnapshot,
    handleConfirmSaveSnapshot,
    handleLoadProjectSnapshot,
    handleLoadPageSnapshot,
    handleLoadSnapshot,
    handleDeleteSnapshot,
    handleGenerateFromPrompt,
    handleImageUpdated,
    applyOcrAnnotationsForImage,
    handleAddCategory,
    handleDeleteCategory,
    handleColorChange,
    handleRenameCategory,
    applyCategoryToSelection,
    handleSelectCategory,
    handleUndo,
    handleSelectShapesFromImage,
    handleSelectShapesFromList,
    handleRedo,
    handleRecognizeSelected,
    runFullInferenceForImage,
    handleFullInference,
    handleBulkDetectRecognize,
    handlePointsUpdated,
    handleClearLabels,
    handleRequireCategory,
    handleNotificationClose,
    handleBackToRoot,
    handleSnapshotNameChange,
    handleMaxFramesChange,
    handleStrideChange,
    openLoadPageDialog,
    openLoadProjectDialog,
    closeLoadDialog,
    openSaveDialog,
    closeSaveDialog,
    closeSettingsDialog,
    handleOcrToolChange,
    handleShowOcrTextChange,
    registerSegmentationViewportControls,
    registerOcrViewportControls,
  };
};

export type ProjectDetailActions = ReturnType<typeof useProjectDetailActions>;
