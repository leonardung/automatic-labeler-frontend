import { useCallback } from "react";
import axiosInstance from "../../../axiosInstance";
import type { Project, ProjectSnapshot } from "../../../types";
import { decorateImage } from "../utils";
import type { ProjectDetailState } from "../useProjectDetailState";

export const useProjectActions = (state: ProjectDetailState) => {
  const {
    projectId,
    setProject,
    setImages,
    setCategories,
    setCurrentIndex,
    setActiveCategoryId,
    setHighlightCategoryId,
    setSelectedShapeIds,
    setOcrTool,
    setSnapshots,
    setNotification,
  } = state;

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

  return {
    applyProjectPayload,
    fetchSnapshots,
    fetchProject,
  };
};
