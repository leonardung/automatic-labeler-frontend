import { useCallback } from "react";
import axiosInstance from "../../../axiosInstance";
import type { ImageModel, MaskCategory, OCRAnnotation, SegmentationPoint } from "../../../types";
import { cloneOcrAnnotations, decorateImage } from "../utils";
import type { ProjectDetailState } from "../useProjectDetailState";

type LabelDependencies = {
  startLoading: () => void;
  stopLoading: () => void;
  startBlocking: (message?: string) => void;
  stopBlocking: () => void;
  clearProgressPolling: () => void;
  startProgressPolling: () => void;
  recordOcrHistory: (imageId: number, previous: OCRAnnotation[], next: OCRAnnotation[]) => void;
};

export const useLabelActions = (state: ProjectDetailState, deps: LabelDependencies) => {
  const {
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
    projectType,
    setIsPropagating,
    setPropagationProgress,
    project,
    currentImage,
    imageEndpointBase,
    isOCRProject,
    setSelectedShapeIds,
  } = state;
  const {
    startLoading,
    stopLoading,
    startBlocking,
    stopBlocking,
    clearProgressPolling,
    startProgressPolling,
    recordOcrHistory,
  } = deps;

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
          newlyCreatedId ||
          (activeStillExists ? activeCategoryId : null) ||
          normalizedCategories[0]?.id ||
          null;
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

  return {
    handleGenerateFromPrompt,
    handlePropagateMask,
    handlePointsUpdated,
    handleClearLabels,
  };
};
