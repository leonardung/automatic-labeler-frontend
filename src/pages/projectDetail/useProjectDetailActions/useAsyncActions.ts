import { useCallback } from "react";
import axiosInstance from "../../../axiosInstance";
import type { ProjectDetailState } from "../useProjectDetailState";

export const useAsyncActions = (state: ProjectDetailState) => {
  const {
    projectId,
    setLoadingCounter,
    setBlockingMessage,
    setBlockingOps,
    progressIntervalRef,
    datasetProgressIntervalRef,
    isPollingProgressRef,
    isPollingDatasetProgressRef,
    setPropagationProgress,
    setIsPropagating,
    setNotification,
    setDatasetImportProgress,
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

  return {
    startLoading,
    stopLoading,
    startBlocking,
    stopBlocking,
    clearProgressPolling,
    clearDatasetProgressPolling,
    pollPropagationProgress,
    startProgressPolling,
    pollDatasetImportProgress,
    startDatasetProgressPolling,
  };
};
