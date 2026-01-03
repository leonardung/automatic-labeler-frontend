import { useEffect } from "react";
import axiosInstance from "../../axiosInstance";
import type { ProjectDetailActions } from "./useProjectDetailActions";
import type { ProjectDetailState } from "./useProjectDetailState";

export const useProjectDetailEffects = (
  state: ProjectDetailState,
  actions: ProjectDetailActions
) => {
  const {
    projectId,
    project,
    projectType,
    categories,
    showOcrCategoryPanel,
    ocrCategoryPanelRef,
    modelLoadedRef,
    ocrModelLoadedRef,
    isSegmentationProject,
    isOCRProject,
    isBlocked,
    currentIndex,
    setMaxOcrCategoryHeight,
    setSelectedShapeIds,
    setOcrTool,
    setOcrHistory,
    setImages,
    setNotification,
  } = state;

  const {
    fetchProject,
    fetchSnapshots,
    clearProgressPolling,
    clearDatasetProgressPolling,
    startBlocking,
    stopBlocking,
    startLoading,
    stopLoading,
    handleUndo,
    handleRedo,
    handleRecognizeSelected,
    handlePrevImage,
    handleNextImage,
  } = actions;

  useEffect(() => {
    fetchProject();
  }, [fetchProject, projectId]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  useEffect(() => {
    modelLoadedRef.current = false;
    ocrModelLoadedRef.current = false;
  }, [modelLoadedRef, ocrModelLoadedRef, projectId]);

  useEffect(() => {
    setOcrHistory({});
  }, [projectId, setOcrHistory]);

  useEffect(() => {
    setSelectedShapeIds([]);
    setOcrTool("select");
  }, [currentIndex, projectType, setOcrTool, setSelectedShapeIds]);

  useEffect(() => {
    if (!showOcrCategoryPanel) return;
    const panel = ocrCategoryPanelRef.current;
    if (!panel) return;
    const contentHeight = panel.scrollHeight;
    const bufferedHeight = contentHeight + 5;
    setMaxOcrCategoryHeight((prev) => {
      const desired = Math.max(100, bufferedHeight);
      return desired < prev ? desired : prev;
    });
  }, [categories, ocrCategoryPanelRef, setMaxOcrCategoryHeight, showOcrCategoryPanel]);

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
  }, [
    isSegmentationProject,
    modelLoadedRef,
    project,
    projectType,
    projectId,
    setNotification,
    startBlocking,
    startLoading,
    stopBlocking,
    stopLoading,
  ]);

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
  }, [isOCRProject, ocrModelLoadedRef, project, startBlocking, stopBlocking]);

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
  }, [categories, setImages]);

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
    setOcrTool,
  ]);
};
