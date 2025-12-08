import React from "react";
import { Box, Button, ButtonGroup, Tooltip } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import CategoryIcon from "@mui/icons-material/Category";
import type { ImageModel, ProjectType } from "../types";
import axiosInstance from "../axiosInstance";

interface OCRControlsProps {
  image: ImageModel;
  projectType: ProjectType;
  onImageUpdated: (image: ImageModel) => void;
  onStartBlocking: (message?: string) => void;
  onStopBlocking: () => void;
  disabled?: boolean;
}

const OCRControls: React.FC<OCRControlsProps> = ({
  image,
  projectType,
  onImageUpdated,
  onStartBlocking,
  onStopBlocking,
  disabled,
}) => {
  const handleDetectRegions = async () => {
    if (disabled || !image.id) return;
    try {
      onStartBlocking("Detecting regions...");
      const response = await axiosInstance.post(`images/${image.id}/detect_regions/`);
      const shapes = response.data.shapes;
      onImageUpdated({ ...image, ocr_annotations: shapes });
    } catch (error) {
      console.error("Error detecting regions:", error);
    } finally {
      onStopBlocking();
    }
  };

  const handleRecognizeText = async () => {
    if (disabled || !image.id) return;
    try {
      onStartBlocking("Recognizing text...");
      const payload = { shapes: image.ocr_annotations || [] };
      const response = await axiosInstance.post(`images/${image.id}/recognize_text/`, payload);
      const shapes = response.data.shapes;
      onImageUpdated({ ...image, ocr_annotations: shapes });
    } catch (error) {
      console.error("Error recognizing text:", error);
    } finally {
      onStopBlocking();
    }
  };

  const handleClassify = async () => {
    if (disabled || !image.id) return;
    try {
      onStartBlocking("Classifying...");
      const payload = { shapes: image.ocr_annotations || [] };
      const response = await axiosInstance.post(`images/${image.id}/classify_kie/`, payload);
      const shapes = response.data.shapes;
      // The backend might also return categories, but for now we just update shapes
      onImageUpdated({ ...image, ocr_annotations: shapes });
    } catch (error) {
      console.error("Error classifying:", error);
    } finally {
      onStopBlocking();
    }
  };

  return (
    <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
      <ButtonGroup variant="contained" aria-label="OCR actions" disabled={disabled}>
        <Tooltip title="Detect text regions">
          <Button startIcon={<AutoFixHighIcon />} onClick={handleDetectRegions}>
            Detect
          </Button>
        </Tooltip>
        <Tooltip title="Recognize text in regions">
          <Button startIcon={<TextFieldsIcon />} onClick={handleRecognizeText}>
            Recognize
          </Button>
        </Tooltip>
        {projectType === "ocr_kie" && (
          <Tooltip title="Classify regions (KIE)">
            <Button startIcon={<CategoryIcon />} onClick={handleClassify}>
              Classify
            </Button>
          </Tooltip>
        )}
      </ButtonGroup>
    </Box>
  );
};

export default OCRControls;
