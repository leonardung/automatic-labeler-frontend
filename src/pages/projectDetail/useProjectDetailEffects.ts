import { useEffect } from "react";
import axiosInstance from "../../axiosInstance";
import type { OcrModelConfig, TrainingModelKey } from "../../types";
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
    setOcrModelConfig,
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
        const defaultDetModel = "PP-OCRv5_mobile_det";
        const defaultRecModel = "PP-OCRv5_server_rec";
        let savedConfig: OcrModelConfig | null = null;

        if (projectId) {
          try {
            const configResponse = await axiosInstance.get("ocr-images/model_config/", {
              params: { project_id: projectId },
            });
            const payload = configResponse.data?.config;
            savedConfig = payload && typeof payload === "object" ? payload : null;
            setOcrModelConfig(savedConfig);
          } catch (error) {
            setOcrModelConfig(null);
            console.error("Failed to load saved OCR model config:", error);
          }
        }

        let detectModel = savedConfig?.det?.model || defaultDetModel;
        let recognizeModel = savedConfig?.rec?.model || defaultRecModel;
        let classifyModel: string | undefined;

        const targets: TrainingModelKey[] = [];
        const runsPayload: Record<string, string> = {};
        const checkpointPayload: Record<string, string> = {};

        if (savedConfig?.det?.source === "finetuned") {
          targets.push("det");
          if (savedConfig.det?.run_id) {
            runsPayload.det = savedConfig.det.run_id;
          }
          checkpointPayload.det = savedConfig.det?.checkpoint_type || "best";
        }
        if (savedConfig?.rec?.source === "finetuned") {
          targets.push("rec");
          if (savedConfig.rec?.run_id) {
            runsPayload.rec = savedConfig.rec.run_id;
          }
          checkpointPayload.rec = savedConfig.rec?.checkpoint_type || "best";
        }
        if (projectType === "ocr_kie" && savedConfig?.kie) {
          targets.push("kie");
          if (savedConfig.kie?.run_id) {
            runsPayload.kie = savedConfig.kie.run_id;
          }
          checkpointPayload.kie = savedConfig.kie?.checkpoint_type || "best";
        }

        if (projectId && targets.length > 0) {
          try {
            const trainedResponse = await axiosInstance.post("ocr-images/configure_trained_models/", {
              project_id: projectId,
              models: targets,
              runs: runsPayload,
              checkpoint_type: checkpointPayload,
            });
            const loaded = trainedResponse.data?.loaded || {};
            if (loaded.det?.model_key) {
              detectModel = loaded.det.model_key;
            }
            if (loaded.rec?.model_key) {
              recognizeModel = loaded.rec.model_key;
            }
            if (loaded.kie?.model_key) {
              classifyModel = loaded.kie.model_key;
            }
          } catch (error) {
            console.error("Failed to load finetuned OCR models:", error);
          }
        }

        await axiosInstance.post("ocr-images/configure_models/", {
          project_id: projectId,
          detect_model: detectModel,
          recognize_model: recognizeModel,
          ...(classifyModel ? { classify_model: classifyModel } : {}),
        });
        ocrModelLoadedRef.current = true;
      } catch (error) {
        console.error("Error loading OCR models:", error);
      } finally {
        stopBlocking();
      }
    };

    loadOcrModels();
  }, [
    isOCRProject,
    ocrModelLoadedRef,
    project,
    projectId,
    projectType,
    setOcrModelConfig,
    startBlocking,
    stopBlocking,
  ]);

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
