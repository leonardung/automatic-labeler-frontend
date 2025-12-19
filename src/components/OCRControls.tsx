import React, { useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Switch,
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
  projectId?: number | string | null;
}

const OCRControls: React.FC<OCRControlsProps> = ({
  image,
  projectType,
  onImageUpdated,
  onStartBlocking,
  onStopBlocking,
  disabled,
  endpointBase,
  projectId,
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
  const [useTrainedDet, setUseTrainedDet] = useState(false);
  const [useTrainedRec, setUseTrainedRec] = useState(false);

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
      let nextDetectModel = detectModel;
      let nextRecognizeModel = recognizeModel;

      const targets: ("det" | "rec")[] = [];
      if (useTrainedDet) targets.push("det");
      if (useTrainedRec) targets.push("rec");

      if (targets.length > 0) {
        if (!projectId) {
          throw new Error("Project id is required to load trained models.");
        }
        const response = await axiosInstance.post(`${endpointBase}/configure_trained_models/`, {
          project_id: projectId,
          models: targets,
        });
        const loaded = response.data?.loaded || {};
        if (useTrainedDet && loaded.det?.model_key) {
          nextDetectModel = loaded.det.model_key as string;
          setDetectModel(nextDetectModel);
        }
        if (useTrainedRec && loaded.rec?.model_key) {
          nextRecognizeModel = loaded.rec.model_key as string;
          setRecognizeModel(nextRecognizeModel);
        }
      }

      await axiosInstance.post(`${endpointBase}/configure_models/`, {
        detect_model: nextDetectModel,
        recognize_model: nextRecognizeModel,
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
        <ButtonGroup
          variant="contained"
          aria-label="OCR actions"
          disabled={disabled}
          fullWidth
          sx={{ "& .MuiButton-root": { flex: 1 } }}
        >
          <Tooltip title="Detect text regions" placement="top" sx={{ flex: 1, display: "flex" }}>
            <Button startIcon={<AutoFixHighIcon />} onClick={handleDetectRegions} sx={{ flex: 1 }}>
              Detect
            </Button>
          </Tooltip>
          <Tooltip title="Recognize text in regions" placement="top" sx={{ flex: 1, display: "flex" }}>
            <Button startIcon={<TextFieldsIcon />} onClick={handleRecognizeText} sx={{ flex: 1 }}>
              Recognize
            </Button>
          </Tooltip>
          {projectType === "ocr_kie" && (
            <Tooltip title="Classify regions (KIE)" placement="top" sx={{ flex: 1, display: "flex" }}>
              <Button startIcon={<CategoryIcon />} onClick={handleClassify} sx={{ flex: 1 }}>
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
            <FormControlLabel
              control={
                <Switch
                  checked={useTrainedDet}
                  onChange={(e) => setUseTrainedDet(e.target.checked)}
                  disabled={!projectId}
                />
              }
              label="Use trained detection model for this project"
            />
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
            <FormControlLabel
              control={
                <Switch
                  checked={useTrainedRec}
                  onChange={(e) => setUseTrainedRec(e.target.checked)}
                  disabled={!projectId}
                />
              }
              label="Use trained recognition model for this project"
            />
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
