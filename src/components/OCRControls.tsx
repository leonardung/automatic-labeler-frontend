import React, { useEffect, useState, useTransition } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import CategoryIcon from "@mui/icons-material/Category";
import type {
  ImageModel,
  OcrModelConfig,
  ProjectType,
  SelectedOcrModels,
  TrainingRun,
  TrainingModelKey,
} from "../types";
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
  selectedModels: SelectedOcrModels;
  onToggleModel: (model: keyof SelectedOcrModels) => void;
  savedConfig?: OcrModelConfig | null;
}

type ModelSource = "pretrained" | "finetuned";

const OCRControls: React.FC<OCRControlsProps> = ({
  image,
  projectType,
  onImageUpdated,
  onStartBlocking,
  onStopBlocking,
  disabled,
  endpointBase,
  projectId,
  selectedModels,
  onToggleModel,
  savedConfig,
}) => {
  const DETECT_MODELS = ["PP-OCRv5_server_det", "PP-OCRv5_mobile_det", "PP-OCRv4_server_det", "PP-OCRv4_mobile_det"];
  const RECOGNIZE_MODELS = ["latin_PP-OCRv5_mobile_rec", "PP-OCRv5_server_rec", "PP-OCRv5_mobile_rec", "PP-OCRv4_server_rec_doc"];
  const DEFAULT_DETECT_MODEL = DETECT_MODELS[0];
  const DEFAULT_RECOGNIZE_MODEL = RECOGNIZE_MODELS[0];
  const DEFAULT_CHECKPOINT_TYPE: "best" | "latest" = "best";
  const DEFAULT_DETECT_TOLERANCE = 0.2;
  const DEFAULT_DETECT_THRESH = 0.3;
  const DEFAULT_DETECT_BOX_THRESH = 0.6;
  const DEFAULT_DETECT_UNCLIP_RATIO = 1.5;

  const [configOpen, setConfigOpen] = useState(false);
  const [activeModelTab, setActiveModelTab] = useState<TrainingModelKey>("det");
  const [detSource, setDetSource] = useState<ModelSource>("pretrained");
  const [recSource, setRecSource] = useState<ModelSource>("pretrained");
  const [detectModel, setDetectModel] = useState(DEFAULT_DETECT_MODEL);
  const [detectTolerance, setDetectTolerance] = useState<number>(DEFAULT_DETECT_TOLERANCE);
  const [detectThresh, setDetectThresh] = useState<number>(DEFAULT_DETECT_THRESH);
  const [detectBoxThresh, setDetectBoxThresh] = useState<number>(DEFAULT_DETECT_BOX_THRESH);
  const [detectUnclipRatio, setDetectUnclipRatio] = useState<number>(DEFAULT_DETECT_UNCLIP_RATIO);
  const [recognizeModel, setRecognizeModel] = useState(DEFAULT_RECOGNIZE_MODEL);
  const [savingConfig, setSavingConfig] = useState(false);
  const [detRunId, setDetRunId] = useState<string>("");
  const [recRunId, setRecRunId] = useState<string>("");
  const [kieRunId, setKieRunId] = useState<string>("");
  const [detCheckpointType, setDetCheckpointType] = useState<"best" | "latest">(DEFAULT_CHECKPOINT_TYPE);
  const [recCheckpointType, setRecCheckpointType] = useState<"best" | "latest">(DEFAULT_CHECKPOINT_TYPE);
  const [kieCheckpointType, setKieCheckpointType] = useState<"best" | "latest">(DEFAULT_CHECKPOINT_TYPE);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [runsByTarget, setRunsByTarget] = useState<Record<TrainingModelKey, TrainingRun[]>>({
    det: [],
    rec: [],
    kie: [],
  });

  useEffect(() => {
    if (projectType !== "ocr_kie" && activeModelTab === "kie") {
      setActiveModelTab("det");
    }
  }, [activeModelTab, projectType]);

  useEffect(() => {
    if (!savedConfig) return;
    if (savedConfig.det?.model) {
      setDetectModel(savedConfig.det.model);
    }
    if (savedConfig.det?.source) {
      setDetSource(savedConfig.det.source as ModelSource);
    }
    if (savedConfig.det?.run_id !== undefined) {
      setDetRunId(savedConfig.det.run_id || "");
    }
    if (savedConfig.det?.checkpoint_type) {
      setDetCheckpointType(savedConfig.det.checkpoint_type);
    }
    if (typeof savedConfig.det?.thresh === "number") {
      setDetectThresh(savedConfig.det.thresh);
    }
    if (typeof savedConfig.det?.box_thresh === "number") {
      setDetectBoxThresh(savedConfig.det.box_thresh);
    }
    if (typeof savedConfig.det?.unclip_ratio === "number") {
      setDetectUnclipRatio(savedConfig.det.unclip_ratio);
    }
    if (typeof savedConfig.tolerance_ratio === "number") {
      setDetectTolerance(savedConfig.tolerance_ratio);
    }
    if (savedConfig.rec?.model) {
      setRecognizeModel(savedConfig.rec.model);
    }
    if (savedConfig.rec?.source) {
      setRecSource(savedConfig.rec.source as ModelSource);
    }
    if (savedConfig.rec?.run_id !== undefined) {
      setRecRunId(savedConfig.rec.run_id || "");
    }
    if (savedConfig.rec?.checkpoint_type) {
      setRecCheckpointType(savedConfig.rec.checkpoint_type);
    }
    if (projectType === "ocr_kie") {
      if (savedConfig.kie?.run_id !== undefined) {
        setKieRunId(savedConfig.kie.run_id || "");
      }
      if (savedConfig.kie?.checkpoint_type) {
        setKieCheckpointType(savedConfig.kie.checkpoint_type);
      }
    }
  }, [projectType, savedConfig]);

  const loadRuns = async () => {
    if (!projectId) return;
    setLoadingRuns(true);
    try {
      const response = await axiosInstance.get<{ runs: TrainingRun[] }>("ocr-training/runs/", {
        params: { project_id: projectId },
      });
      const runs = response.data?.runs || [];
      const grouped: Record<TrainingModelKey, TrainingRun[]> = { det: [], rec: [], kie: [] };
      runs.forEach((run) => {
        if (grouped[run.target]) {
          grouped[run.target].push(run);
        }
      });
      setRunsByTarget(grouped);
    } catch (error) {
      console.error("Failed to load training runs", error);
    } finally {
      setLoadingRuns(false);
    }
  };

  const formatRunLabel = (run: TrainingRun) => {
    const name = run.name?.trim();
    const namePrefix = name ? `${name} | ` : "";
    const created = run.created_at ? new Date(run.created_at).toLocaleString() : "";
    const bestMetricKeys = run.best_metric ? Object.keys(run.best_metric) : [];
    const bestSummary =
      bestMetricKeys.length > 0
        ? `best: ${bestMetricKeys
            .slice(0, 2)
            .map((k) => `${k}=${run.best_metric?.[k]}`)
            .join(", ")}`
        : "best: n/a";
    return `${namePrefix}${run.target.toUpperCase()} | ${created} | ${run.status} | ${bestSummary}`;
  };

  const handleOpenConfig = () => {
    setConfigOpen(true);
    if (!loadingRuns && projectId) {
      void loadRuns();
    }
  };

  const handleResetConfig = () => {
    setDetSource("pretrained");
    setRecSource("pretrained");
    setDetectModel(DEFAULT_DETECT_MODEL);
    setRecognizeModel(DEFAULT_RECOGNIZE_MODEL);
    setDetectTolerance(DEFAULT_DETECT_TOLERANCE);
    setDetectThresh(DEFAULT_DETECT_THRESH);
    setDetectBoxThresh(DEFAULT_DETECT_BOX_THRESH);
    setDetectUnclipRatio(DEFAULT_DETECT_UNCLIP_RATIO);
    setDetRunId("");
    setRecRunId("");
    setKieRunId("");
    setDetCheckpointType(DEFAULT_CHECKPOINT_TYPE);
    setRecCheckpointType(DEFAULT_CHECKPOINT_TYPE);
    setKieCheckpointType(DEFAULT_CHECKPOINT_TYPE);
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      onStartBlocking("Applying OCR models...");
      let nextDetectModel = detectModel;
      let nextRecognizeModel = recognizeModel;
      let nextClassifyModel: string | undefined;

      const targets: TrainingModelKey[] = [];
      const useTrainedDet = detSource === "finetuned";
      const useTrainedRec = recSource === "finetuned";
      const useTrainedKie = projectType === "ocr_kie" && (runsByTarget.kie.length > 0 || kieRunId);
      if (useTrainedDet) targets.push("det");
      if (useTrainedRec) targets.push("rec");
      if (useTrainedKie) targets.push("kie");

      if (targets.length > 0) {
        if (!projectId) {
          throw new Error("Project id is required to load trained models.");
        }
        const runsPayload: Record<string, string> = {};
        const checkpointPayload: Record<string, string> = {};
        if (useTrainedDet) {
          if (detRunId) {
            runsPayload.det = detRunId;
          }
          checkpointPayload.det = detCheckpointType;
        }
        if (useTrainedRec) {
          if (recRunId) {
            runsPayload.rec = recRunId;
          }
          checkpointPayload.rec = recCheckpointType;
        }
        if (useTrainedKie) {
          if (kieRunId) {
            runsPayload.kie = kieRunId;
          }
          checkpointPayload.kie = kieCheckpointType;
        }
        const response = await axiosInstance.post(`${endpointBase}/configure_trained_models/`, {
          project_id: projectId,
          models: targets,
          runs: runsPayload,
          checkpoint_type: checkpointPayload,
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
        if (useTrainedKie && loaded.kie?.model_key) {
          nextClassifyModel = loaded.kie.model_key as string;
        }
      }

      const modelConfig: OcrModelConfig = {
        det: {
          source: detSource,
          model: detectModel,
          run_id: detRunId || undefined,
          checkpoint_type: detCheckpointType,
          thresh: detectThresh,
          box_thresh: detectBoxThresh,
          unclip_ratio: detectUnclipRatio,
        },
        rec: {
          source: recSource,
          model: recognizeModel,
          run_id: recRunId || undefined,
          checkpoint_type: recCheckpointType,
        },
        tolerance_ratio: detectTolerance,
      };
      if (projectType === "ocr_kie") {
        modelConfig.kie = {
          source: "finetuned",
          run_id: kieRunId || undefined,
          checkpoint_type: kieCheckpointType,
        };
      }

      await axiosInstance.post(`${endpointBase}/configure_models/`, {
        project_id: projectId,
        detect_model: nextDetectModel,
        recognize_model: nextRecognizeModel,
        ...(nextClassifyModel ? { classify_model: nextClassifyModel } : {}),
        model_config: modelConfig,
      });
      setConfigOpen(false);
    } catch (error) {
      console.error("Error configuring OCR models:", error);
    } finally {
      setSavingConfig(false);
      onStopBlocking();
    }
  };

  const [localSelected, setLocalSelected] = useState<SelectedOcrModels>(selectedModels);
  useEffect(() => {
    setLocalSelected(selectedModels);
  }, [selectedModels]);

  const [, startTransition] = useTransition();

  const handleToggleLocal = (model: keyof SelectedOcrModels) => {
    setLocalSelected((prev) => ({ ...prev, [model]: !prev[model] }));
    startTransition(() => onToggleModel(model));
  };

  const getModelButtonStyles = (active: boolean) => ({
    flex: 1,
    backgroundColor: active ? undefined : "rgba(255,255,255,0.08)",
    color: active ? undefined : "#9fb4c9",
    boxShadow: active ? undefined : "none",
    transition: "none",
    "&:hover": {
      backgroundColor: active ? "primary.dark" : "rgba(255,255,255,0.16)",
    },
  });

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
          <Tooltip title="Toggle detection for inference" placement="top" sx={{ flex: 1, display: "flex" }}>
            <Button
              disableRipple
              disableFocusRipple
              startIcon={<AutoFixHighIcon />}
              onClick={() => handleToggleLocal("detect")}
              sx={getModelButtonStyles(localSelected.detect)}
              aria-pressed={localSelected.detect}
            >
              Detect
            </Button>
          </Tooltip>
          <Tooltip title="Toggle recognition for inference" placement="top" sx={{ flex: 1, display: "flex" }}>
            <Button
              disableRipple
              disableFocusRipple
              startIcon={<TextFieldsIcon />}
              onClick={() => handleToggleLocal("recognize")}
              sx={getModelButtonStyles(localSelected.recognize)}
              aria-pressed={localSelected.recognize}
            >
              Recognize
            </Button>
          </Tooltip>
          {projectType === "ocr_kie" && (
            <Tooltip title="Toggle classification for inference" placement="top" sx={{ flex: 1, display: "flex" }}>
              <Button
                disableRipple
                disableFocusRipple
                startIcon={<CategoryIcon />}
                onClick={() => handleToggleLocal("classify")}
                sx={getModelButtonStyles(localSelected.classify)}
                aria-pressed={localSelected.classify}
              >
                Classify
              </Button>
            </Tooltip>
          )}
        </ButtonGroup>
        <Button variant="outlined" onClick={handleOpenConfig} disabled={disabled}>
          Configure models
        </Button>
      </Box>

      <Dialog
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        maxWidth={false}
        PaperProps={{
          sx: {
            width: { xs: "92vw", sm: 720 },
            maxWidth: { xs: "92vw", sm: 720 },
            height: { xs: "80vh", sm: 620 },
          },
        }}
      >
        <DialogTitle>Configure OCR models</DialogTitle>
        <DialogContent dividers sx={{ overflowY: "auto" }}>
          <Tabs
            value={activeModelTab}
            onChange={(_, value) => setActiveModelTab(value as TrainingModelKey)}
            variant="fullWidth"
            sx={{ borderBottom: "1px solid", borderColor: "divider" }}
          >
            <Tab label="Detection" value="det" />
            <Tab label="Recognition" value="rec" />
            {projectType === "ocr_kie" && <Tab label="KIE" value="kie" />}
          </Tabs>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
            {activeModelTab === "det" && (
              <>
                <Tabs
                  value={detSource}
                  onChange={(_, value) => setDetSource(value as ModelSource)}
                  variant="fullWidth"
                >
                  <Tab label="Pretrained" value="pretrained" />
                  <Tab label="Finetuned" value="finetuned" />
                </Tabs>
                {detSource === "pretrained" ? (
                  <TextField
                    select
                    fullWidth
                    label="Pretrained detection model"
                    value={detectModel}
                    onChange={(e) => setDetectModel(e.target.value)}
                  >
                    {DETECT_MODELS.map((model) => (
                      <MenuItem key={model} value={model}>
                        {model}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <>
                    <TextField
                      select
                      fullWidth
                      label="Detection run"
                      value={detRunId}
                      onChange={(e) => setDetRunId(e.target.value)}
                      disabled={!projectId || loadingRuns || runsByTarget.det.length === 0}
                      helperText={
                        runsByTarget.det.length === 0
                          ? "No completed detection runs found."
                          : "Leave empty to use the latest run."
                      }
                    >
                      <MenuItem value="">Latest run (default)</MenuItem>
                      {runsByTarget.det.map((run) => (
                        <MenuItem key={run.id} value={run.id}>
                          {formatRunLabel(run)}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      fullWidth
                      label="Detection checkpoint"
                      value={detCheckpointType}
                      onChange={(e) =>
                        setDetCheckpointType((e.target.value as "best" | "latest") || "best")
                      }
                    >
                      <MenuItem value="best">Best</MenuItem>
                      <MenuItem value="latest">Latest</MenuItem>
                    </TextField>
                  </>
                )}
                <TextField
                  label="Detection pixel threshold (thresh)"
                  type="number"
                  inputProps={{ step: 0.05, min: 0 }}
                  value={detectThresh}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (Number.isFinite(val)) {
                      setDetectThresh(val);
                    }
                  }}
                  helperText="Pixels with scores greater than this threshold in the output probability map are considered text pixels."
                />
                <TextField
                  label="Detection box threshold (box_thresh)"
                  type="number"
                  inputProps={{ step: 0.05, min: 0 }}
                  value={detectBoxThresh}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (Number.isFinite(val)) {
                      setDetectBoxThresh(val);
                    }
                  }}
                  helperText="A detection result is considered a text region if the average score of all pixels within the border of the result is greater than this threshold."
                />
                <TextField
                  label="Unclip ratio"
                  type="number"
                  inputProps={{ step: 0.1, min: 0 }}
                  value={detectUnclipRatio}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (Number.isFinite(val)) {
                      setDetectUnclipRatio(val);
                    }
                  }}
                  helperText="Expansion coefficient, which expands the text region using this method. The larger the value, the larger the expansion area."
                />
                <TextField
                  label="Tolerance ratio (polygone to rectange)"
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
              </>
            )}

            {activeModelTab === "rec" && (
              <>
                <Tabs
                  value={recSource}
                  onChange={(_, value) => setRecSource(value as ModelSource)}
                  variant="fullWidth"
                >
                  <Tab label="Pretrained" value="pretrained" />
                  <Tab label="Finetuned" value="finetuned" />
                </Tabs>
                {recSource === "pretrained" ? (
                  <TextField
                    select
                    fullWidth
                    label="Pretrained recognition model"
                    value={recognizeModel}
                    onChange={(e) => setRecognizeModel(e.target.value)}
                  >
                    {RECOGNIZE_MODELS.map((model) => (
                      <MenuItem key={model} value={model}>
                        {model}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <>
                    <TextField
                      select
                      fullWidth
                      label="Recognition run"
                      value={recRunId}
                      onChange={(e) => setRecRunId(e.target.value)}
                      disabled={!projectId || loadingRuns || runsByTarget.rec.length === 0}
                      helperText={
                        runsByTarget.rec.length === 0
                          ? "No completed recognition runs found."
                          : "Leave empty to use the latest run."
                      }
                    >
                      <MenuItem value="">Latest run (default)</MenuItem>
                      {runsByTarget.rec.map((run) => (
                        <MenuItem key={run.id} value={run.id}>
                          {formatRunLabel(run)}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      fullWidth
                      label="Recognition checkpoint"
                      value={recCheckpointType}
                      onChange={(e) =>
                        setRecCheckpointType((e.target.value as "best" | "latest") || "best")
                      }
                    >
                      <MenuItem value="best">Best</MenuItem>
                      <MenuItem value="latest">Latest</MenuItem>
                    </TextField>
                  </>
                )}
              </>
            )}

            {activeModelTab === "kie" && projectType === "ocr_kie" && (
              <>
                <Typography variant="body2" color="text.secondary">
                  KIE uses finetuned models only.
                </Typography>
                <TextField
                  select
                  fullWidth
                  label="KIE run"
                  value={kieRunId}
                  onChange={(e) => setKieRunId(e.target.value)}
                  disabled={!projectId || loadingRuns || runsByTarget.kie.length === 0}
                  helperText={
                    runsByTarget.kie.length === 0
                      ? "No completed KIE runs found."
                      : "Leave empty to use the latest run."
                  }
                >
                  <MenuItem value="">Latest run (default)</MenuItem>
                  {runsByTarget.kie.map((run) => (
                    <MenuItem key={run.id} value={run.id}>
                      {formatRunLabel(run)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  fullWidth
                  label="KIE checkpoint"
                  value={kieCheckpointType}
                  onChange={(e) => setKieCheckpointType((e.target.value as "best" | "latest") || "best")}
                >
                  <MenuItem value="best">Best</MenuItem>
                  <MenuItem value="latest">Latest</MenuItem>
                </TextField>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleResetConfig} disabled={savingConfig}>
            Reset
          </Button>
          <Button onClick={handleSaveConfig} disabled={savingConfig}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default OCRControls;
