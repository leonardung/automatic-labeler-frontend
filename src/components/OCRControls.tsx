import React, { useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Tooltip,
} from "@mui/material";
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
  endpointBase: string;
}

const OCRControls: React.FC<OCRControlsProps> = ({
  image,
  projectType,
  onImageUpdated,
  onStartBlocking,
  onStopBlocking,
  disabled,
  endpointBase,
}) => {
  const DETECT_MODELS = ["PP-OCRv5_server_det", "PP-OCRv5_mobile_det", "PP-OCRv4_server_det", "PP-OCRv4_mobile_det"];
  const RECOGNIZE_MODELS = ["PP-OCRv5_server_rec", "PP-OCRv5_mobile_rec", "PP-OCRv4_server_rec_doc"];
  const CLASSIFY_MODELS: string[] = [];

  const [configOpen, setConfigOpen] = useState(false);
  const [detectModel, setDetectModel] = useState(DETECT_MODELS[0]);
  const [detectTolerance, setDetectTolerance] = useState<number>(0.2);
  const [recognizeModel, setRecognizeModel] = useState(RECOGNIZE_MODELS[0]);
  const [classifyModel, setClassifyModel] = useState<string>("");
  const [savingConfig, setSavingConfig] = useState(false);

  const handleDetectRegions = async () => {
    if (disabled || !image.id) return;
    try {
      onStartBlocking("Detecting regions...");
      const payload = { model_name: detectModel, tolerance_ratio: detectTolerance };
      const response = await axiosInstance.post(`${endpointBase}/${image.id}/detect_regions/`, payload);
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
      const payload = { shapes: image.ocr_annotations || [], model_name: recognizeModel };
      const response = await axiosInstance.post(`${endpointBase}/${image.id}/recognize_text/`, payload);
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
      const payload = { shapes: image.ocr_annotations || [], model_name: classifyModel };
      const response = await axiosInstance.post(`${endpointBase}/${image.id}/classify_kie/`, payload);
      const shapes = response.data.shapes;
      onImageUpdated({ ...image, ocr_annotations: shapes });
    } catch (error) {
      console.error("Error classifying:", error);
    } finally {
      onStopBlocking();
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      onStartBlocking("Applying OCR models...");
      await axiosInstance.post(`${endpointBase}/configure_models/`, {
        detect_model: detectModel,
        recognize_model: recognizeModel,
        classify_model: classifyModel || undefined,
      });
      setConfigOpen(false);
    } catch (error) {
      console.error("Error configuring OCR models:", error);
    } finally {
      setSavingConfig(false);
      onStopBlocking();
    }
  };

  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 1 }}>
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
        <Button variant="outlined" onClick={() => setConfigOpen(true)} disabled={disabled}>
          Configure models
        </Button>
      </Box>

      <Dialog open={configOpen} onClose={() => setConfigOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Configure OCR models</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <TextField
              select
              fullWidth
              label="Detect model"
              value={detectModel}
              onChange={(e) => setDetectModel(e.target.value)}
            >
              {DETECT_MODELS.map((model) => (
                <MenuItem key={model} value={model}>
                  {model}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Tolerance ratio (rect merge)"
              type="number"
              inputProps={{ step: 0.05, min: 0, max: 1 }}
              value={detectTolerance}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (Number.isFinite(val)) {
                  setDetectTolerance(val);
                }
              }}
              helperText="Higher tolerance turns near-rect polygons into rectangles."
            />
            <TextField
              select
              fullWidth
              label="Recognize model"
              value={recognizeModel}
              onChange={(e) => setRecognizeModel(e.target.value)}
            >
              {RECOGNIZE_MODELS.map((model) => (
                <MenuItem key={model} value={model}>
                  {model}
                </MenuItem>
              ))}
            </TextField>
            {projectType === "ocr_kie" && (
              <TextField
                select
                fullWidth
                label="Classify model"
                value={classifyModel}
                onChange={(e) => setClassifyModel(e.target.value)}
                helperText={CLASSIFY_MODELS.length === 0 ? "No classification models uploaded yet." : ""}
                disabled={CLASSIFY_MODELS.length === 0}
              >
                {CLASSIFY_MODELS.map((model) => (
                  <MenuItem key={model} value={model}>
                    {model}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSaveConfig} disabled={savingConfig}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default OCRControls;
