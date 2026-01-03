import { useCallback } from "react";
import axiosInstance from "../../../axiosInstance";
import type { ImageModel, MaskCategory, Project, ProjectSnapshot } from "../../../types";
import { decorateImage, formatSnapshotLabel } from "../utils";
import type { ProjectDetailState } from "../useProjectDetailState";

type SnapshotDependencies = {
  startLoading: () => void;
  stopLoading: () => void;
  startBlocking: (message?: string) => void;
  stopBlocking: () => void;
  applyProjectPayload: (payload: Project) => void;
};

export const useSnapshotActions = (state: ProjectDetailState, deps: SnapshotDependencies) => {
  const {
    projectId,
    isBlocked,
    currentImage,
    categories,
    snapshotName,
    setSnapshots,
    setNotification,
    setLoadDialogMode,
    setSaveDialogOpen,
    setSnapshotName,
    setCategories,
    setImages,
    setProject,
    setActiveCategoryId,
    setHighlightCategoryId,
    setSelectedShapeIds,
  } = state;
  const { startLoading, stopLoading, startBlocking, stopBlocking, applyProjectPayload } = deps;

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

  const handleSnapshotNameChange = useCallback(
    (value: string) => {
      setSnapshotName(value);
    },
    [setSnapshotName]
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

  return {
    handleSaveSnapshot,
    handleConfirmSaveSnapshot,
    handleLoadProjectSnapshot,
    handleLoadPageSnapshot,
    handleLoadSnapshot,
    handleDeleteSnapshot,
    handleSnapshotNameChange,
    openLoadPageDialog,
    openLoadProjectDialog,
    closeLoadDialog,
    openSaveDialog,
    closeSaveDialog,
  };
};
