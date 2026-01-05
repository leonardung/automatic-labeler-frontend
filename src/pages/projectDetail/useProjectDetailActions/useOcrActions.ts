import { useCallback } from "react";
import axiosInstance from "../../../axiosInstance";
import type { ImageModel, OCRAnnotation, SelectedOcrModels } from "../../../types";
import { areOcrAnnotationsEqual, cloneOcrAnnotations, decorateImage } from "../utils";
import type { BulkOcrStage, OCRTool } from "../types";
import type { ProjectDetailState } from "../useProjectDetailState";

type OcrDependencies = {
  startBlocking: (message?: string) => void;
  stopBlocking: () => void;
};

export const useOcrActions = (state: ProjectDetailState, deps: OcrDependencies) => {
  const {
    projectType,
    selectedOcrModels,
    setSelectedOcrModels,
    isOCRProject,
    suppressOcrHistoryRef,
    setOcrHistory,
    setImages,
    setProject,
    setSelectedShapeIds,
    setSelectionScrollSignal,
    currentImage,
    ocrHistory,
    isApplyingHistory,
    setIsApplyingHistory,
    selectedShapeIds,
    images,
    currentIndex,
    imageEndpointBase,
    setNotification,
    setBulkOcrStatus,
    setIsBulkOcrRunning,
    categories,
    setOcrTool,
    setShowOcrText,
    isBlocked,
  } = state;
  const { startBlocking, stopBlocking } = deps;

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
    [
      handleImageUpdated,
      imageEndpointBase,
      isOCRProject,
      setNotification,
      setSelectedShapeIds,
      suppressOcrHistoryRef,
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
    if (image.is_label) {
      setNotification({
        open: true,
        message: "This page is validated. Unvalidate it to run inference.",
        severity: "info",
      });
      return;
    }
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
    handleImageUpdated,
    imageEndpointBase,
    images,
    isBlocked,
    selectedShapeIds,
    setNotification,
    startBlocking,
    stopBlocking,
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

  const handleSetValidation = useCallback(
    async (nextValidated: boolean) => {
      if (isBlocked) return;
      const image = currentImage;
      if (!image || !image.id) return;

      try {
        const response = await axiosInstance.patch<ImageModel>(
          `${imageEndpointBase}/${image.id}/`,
          { is_label: nextValidated }
        );
        handleImageUpdated(response.data || { ...image, is_label: nextValidated });
        setNotification({
          open: true,
          message: nextValidated ? "Page marked as validated." : "Page marked as unvalidated.",
          severity: "success",
        });
      } catch (error) {
        console.error("Error updating validation state:", error);
        setNotification({
          open: true,
          message: "Failed to update validation state.",
          severity: "error",
        });
      }
    },
    [currentImage, handleImageUpdated, imageEndpointBase, isBlocked, setNotification]
  );

  const handleSetValidationForImages = useCallback(
    async (imageIds: number[], nextValidated: boolean) => {
      if (!isOCRProject || isBlocked) return;
      const uniqueIds = Array.from(new Set(imageIds));
      if (!uniqueIds.length) return;
      const targets = images.filter(
        (img) => uniqueIds.includes(img.id) && img.id && img.is_label !== nextValidated
      );
      if (!targets.length) {
        setNotification({
          open: true,
          message: nextValidated
            ? "Selected pages are already validated."
            : "Selected pages are already unvalidated.",
          severity: "info",
        });
        return;
      }

      try {
        const results = await Promise.allSettled(
          targets.map((img) =>
            axiosInstance.patch<ImageModel>(`${imageEndpointBase}/${img.id}/`, {
              is_label: nextValidated,
            })
          )
        );
        const updatedImages: ImageModel[] = [];
        let failed = 0;
        results.forEach((result, idx) => {
          if (result.status === "fulfilled") {
            const payload = result.value.data || { ...targets[idx], is_label: nextValidated };
            updatedImages.push(decorateImage(payload));
          } else {
            failed += 1;
          }
        });
        if (updatedImages.length) {
          const updatesById = new Map(updatedImages.map((img) => [img.id, img]));
          setImages((prev) =>
            prev.map((img) => (updatesById.has(img.id) ? { ...img, ...updatesById.get(img.id)! } : img))
          );
          setProject((prev) =>
            prev
              ? {
                  ...prev,
                  images: prev.images.map((img) =>
                    updatesById.has(img.id) ? { ...img, ...updatesById.get(img.id)! } : img
                  ),
                }
              : prev
          );
        }
        if (failed) {
          setNotification({
            open: true,
            message: `${failed} page(s) failed to update validation.`,
            severity: "error",
          });
        } else {
          setNotification({
            open: true,
            message: nextValidated
              ? `Validated ${updatedImages.length} page(s).`
              : `Unvalidated ${updatedImages.length} page(s).`,
            severity: "success",
          });
        }
      } catch (error) {
        console.error("Error updating validation for selected pages:", error);
        setNotification({
          open: true,
          message: "Failed to update validation for selected pages.",
          severity: "error",
        });
      }
    },
    [imageEndpointBase, images, isBlocked, isOCRProject, setImages, setNotification, setProject]
  );

  const handleFullInference = useCallback(async () => {
    if (isBlocked) return;
    const image = images[currentIndex];
    if (!image || !image.id) return;
    if (image.is_label) {
      setNotification({
        open: true,
        message: "This page is validated. Unvalidate it to run inference.",
        severity: "info",
      });
      return;
    }
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

  const handleRunInferenceForImages = useCallback(
    async (imageIds: number[]) => {
      if (!isOCRProject || isBlocked) return;
      if (!hasSelectedOcrModel()) {
        setNotification({
          open: true,
          message: "Select at least one model before running inference.",
          severity: "warning",
        });
        return;
      }
      const uniqueIds = Array.from(new Set(imageIds));
      if (!uniqueIds.length) return;
      const targets = images.filter((img) => uniqueIds.includes(img.id) && img.id);
      const runnable = targets.filter((img) => !img.is_label);
      const skipped = targets.length - runnable.length;

      if (!runnable.length) {
        setNotification({
          open: true,
          message: "Selected pages are validated. Unvalidate to run inference.",
          severity: "info",
        });
        return;
      }

      startBlocking(`Running inference on ${runnable.length} page(s)...`);
      let successCount = 0;
      let failureCount = 0;
      try {
        for (const img of runnable) {
          try {
            const result = await runFullInferenceForImage(img, selectedOcrModels);
            handleImageUpdated({ ...img, ocr_annotations: result.shapes || [] });
            successCount += 1;
          } catch (error) {
            console.error("Inference failed for image", img.id, error);
            failureCount += 1;
          }
        }
      } finally {
        stopBlocking();
      }

      const messageParts = [];
      if (successCount) {
        messageParts.push(`Inference completed for ${successCount} page(s).`);
      }
      if (skipped) {
        messageParts.push(`${skipped} skipped (validated).`);
      }
      if (failureCount) {
        messageParts.push(`${failureCount} failed.`);
      }
      const severity =
        failureCount > 0 && successCount > 0
          ? "warning"
          : failureCount > 0
          ? "error"
          : "success";

      setNotification({
        open: true,
        message: messageParts.join(" "),
        severity,
      });
    },
    [
      handleImageUpdated,
      hasSelectedOcrModel,
      images,
      isBlocked,
      isOCRProject,
      runFullInferenceForImage,
      selectedOcrModels,
      setNotification,
      startBlocking,
      stopBlocking,
    ]
  );

  const handleBulkDetectRecognize = useCallback(async () => {
    if (isBlocked) return;
    const targets = images.filter((img) => img.id && !img.is_label);
    if (!targets.length) {
      setNotification({
        open: true,
        message: "All pages are validated. Unvalidate pages to run inference.",
        severity: "info",
      });
      return;
    }
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

    startBlocking("Running inference on unvalidated pages...");

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

  return {
    toggleOcrModel,
    hasSelectedOcrModel,
    recordOcrHistory,
    handleImageUpdated,
    applyOcrAnnotationsForImage,
    handleUndo,
    handleSelectShapesFromImage,
    handleSelectShapesFromList,
    handleRedo,
    handleRecognizeSelected,
    runFullInferenceForImage,
    handleSetValidation,
    handleSetValidationForImages,
    handleFullInference,
    handleRunInferenceForImages,
    handleBulkDetectRecognize,
    handleOcrToolChange,
    handleShowOcrTextChange,
  };
};
