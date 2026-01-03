import { useCallback } from "react";
import type { ProjectDetailState } from "../useProjectDetailState";
import type { ViewportControls } from "../types";

export const useMiscActions = (state: ProjectDetailState) => {
  const {
    projectId,
    navigate,
    project,
    images,
    setCurrentIndex,
    isBlocked,
    setNotification,
    setMaxFrames,
    setStride,
    setOpenSettingsDialog,
    setSegmentationViewportControls,
    setOcrViewportControls,
  } = state;

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

  const handleThumbnailClick = useCallback(
    (index: number) => {
      if (isBlocked) return;
      setCurrentIndex(index);
    },
    [isBlocked, setCurrentIndex]
  );

  const handleBackToRoot = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const handleNotificationClose = useCallback(() => {
    setNotification((prev) => ({ ...prev, open: false }));
  }, [setNotification]);

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

  const closeSettingsDialog = useCallback(() => {
    setOpenSettingsDialog(false);
  }, [setOpenSettingsDialog]);

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
    handleNextImage,
    handlePrevImage,
    openTrainingPage,
    handleThumbnailClick,
    handleBackToRoot,
    handleNotificationClose,
    handleMaxFramesChange,
    handleStrideChange,
    closeSettingsDialog,
    registerSegmentationViewportControls,
    registerOcrViewportControls,
  };
};
