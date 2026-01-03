import { useCallback } from "react";
import axiosInstance from "../../../axiosInstance";
import type { ImageModel } from "../../../types";
import { decorateImage } from "../utils";
import type { ProjectDetailState } from "../useProjectDetailState";

type MediaDependencies = {
  startLoading: () => void;
  stopLoading: () => void;
  startBlocking: (message?: string) => void;
  stopBlocking: () => void;
  startDatasetProgressPolling: () => void;
  clearDatasetProgressPolling: () => void;
  fetchProject: () => Promise<void>;
};

export const useMediaActions = (state: ProjectDetailState, deps: MediaDependencies) => {
  const {
    projectId,
    projectType,
    images,
    setImages,
    setCurrentIndex,
    maxFrames,
    stride,
    imageEndpointBase,
    setNotification,
    setOpenSettingsDialog,
    isBlocked,
    isOCRProject,
    project,
    setDatasetImportProgress,
    setIsImportingDataset,
  } = state;
  const {
    startLoading,
    stopLoading,
    startBlocking,
    stopBlocking,
    startDatasetProgressPolling,
    clearDatasetProgressPolling,
    fetchProject,
  } = deps;

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

  return {
    selectFiles,
    handleSelectFolder,
    handleSettingsSubmit,
    handleImportOcrDataset,
  };
};
