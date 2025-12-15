import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  LinearProgress,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import axiosInstance from "../axiosInstance";
import type {
  TrainingDefaults,
  TrainingJob,
  TrainingModelConfigSummary,
  TrainingModelKey,
} from "../types";

interface ModelTrainingDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: number | null;
  projectName?: string;
  disabled?: boolean;
  onNotify?: (message: string, severity?: "success" | "info" | "warning" | "error") => void;
}

type ModelOverrides = Partial<Record<TrainingModelKey, TrainingModelConfigSummary & { epoch_num?: number }>>;

const modelLabels: Record<TrainingModelKey, string> = {
  det: "Detection",
  rec: "Recognition",
  kie: "KIE",
};

const statusColor: Record<string, "default" | "primary" | "success" | "warning" | "error"> = {
  pending: "default",
  running: "primary",
  completed: "success",
  failed: "error",
};

const numberOrNull = (value: string) => {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function ModelTrainingDialog({
  open,
  onClose,
  projectId,
  projectName,
  disabled,
  onNotify,
}: ModelTrainingDialogProps) {
  const [defaults, setDefaults] = useState<TrainingDefaults | null>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedModels, setSelectedModels] = useState<TrainingModelKey[]>(["det", "rec", "kie"]);
  const [useGpu, setUseGpu] = useState(true);
  const [testRatio, setTestRatio] = useState<string>("0.05");
  const [trainSeed, setTrainSeed] = useState<string>("");
  const [splitSeed, setSplitSeed] = useState<string>("");
  const [modelOverrides, setModelOverrides] = useState<ModelOverrides>({
    det: {},
    rec: {},
    kie: {},
  });
  const [activeJob, setActiveJob] = useState<TrainingJob | null>(null);
  const [pollingId, setPollingId] = useState<number | null>(null);
  const [requestedDefaults, setRequestedDefaults] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setActiveJob(null);
      setRequestedDefaults(false);
      if (pollingId) {
        window.clearInterval(pollingId);
        setPollingId(null);
      }
      return;
    }
    if (requestedDefaults) {
      return;
    }
    setRequestedDefaults(true);
    setLoadingDefaults(true);
    axiosInstance
      .get<{ defaults: TrainingDefaults }>("ocr-training/defaults/")
      .then((response) => {
        const nextDefaults = response.data.defaults;
        setDefaults(nextDefaults);
        setUseGpu(Boolean(nextDefaults?.use_gpu));
        setTestRatio(String(nextDefaults?.test_ratio ?? "0.1"));
        setTrainSeed(
          nextDefaults?.train_seed !== undefined && nextDefaults?.train_seed !== null
            ? String(nextDefaults.train_seed)
            : ""
        );
        setSplitSeed(
          nextDefaults?.split_seed !== undefined && nextDefaults?.split_seed !== null
            ? String(nextDefaults.split_seed)
            : ""
        );
        const models = nextDefaults?.models || {};
        setModelOverrides({
          det: { ...(models.det || {}) },
          rec: { ...(models.rec || {}) },
          kie: { ...(models.kie || {}) },
        });
      })
      .catch((error) => {
        console.error("Failed to load training defaults", error);
        onNotify?.("Unable to load training defaults.", "error");
      })
      .finally(() => setLoadingDefaults(false));
  }, [open, onNotify, pollingId, requestedDefaults]);

  useEffect(() => {
    return () => {
      if (pollingId) {
        window.clearInterval(pollingId);
      }
    };
  }, [pollingId]);

  const handleLogScroll = () => {
    const el = logContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
    setAutoScroll(atBottom);
  };

  useEffect(() => {
    if (!activeJob?.logs) return;
    const el = logContainerRef.current;
    if (!el) return;
    if (autoScroll) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activeJob?.logs, autoScroll]);

  const startPolling = (jobId: string) => {
    if (pollingId) {
      window.clearInterval(pollingId);
    }
    const tick = async () => {
      try {
        const response = await axiosInstance.get<{ job: TrainingJob }>(`ocr-training/jobs/${jobId}/`);
        const job = response.data.job;
        setActiveJob(job);
        if (job.status === "completed" || job.status === "failed") {
          setPollingId((prev) => {
            if (prev) window.clearInterval(prev);
            return null;
          });
          onNotify?.(
            job.status === "completed" ? "Training completed." : job.error || "Training failed.",
            job.status === "completed" ? "success" : "error"
          );
        }
      } catch (error) {
        console.error("Failed to poll training job", error);
      }
    };
    tick();
    const id = window.setInterval(tick, 5000);
    setPollingId(id);
  };

  const handleStart = async () => {
    if (!projectId) {
      onNotify?.("A project must be loaded before training.", "warning");
      return;
    }
    if (!selectedModels.length) {
      onNotify?.("Select at least one model to train.", "warning");
      return;
    }
    setSaving(true);
    try {
      const allowedKeys: (keyof TrainingModelConfigSummary)[] = [
        "epoch_num",
        "print_batch_step",
        "save_epoch_step",
        "eval_batch_step",
      ];
      const filteredModels = (key: TrainingModelKey) =>
        Object.fromEntries(
          Object.entries(modelOverrides[key] || {}).filter(
            ([field, value]) => allowedKeys.includes(field as keyof TrainingModelConfigSummary) && value !== undefined
          )
        );

      const payload = {
        project_id: projectId,
        models: selectedModels,
        config: {
          use_gpu: useGpu,
          test_ratio: Number(testRatio) || defaults?.test_ratio || 0.1,
          train_seed: numberOrNull(trainSeed),
          split_seed: numberOrNull(splitSeed),
          models: {
            det: filteredModels("det"),
            rec: filteredModels("rec"),
            kie: filteredModels("kie"),
          },
        },
      };
      const response = await axiosInstance.post<{ job: TrainingJob }>("ocr-training/start/", payload);
      const job = response.data.job;
      setActiveJob(job);
      setAutoScroll(true);
      onNotify?.("Training started.", "success");
      startPolling(job.id);
    } catch (error) {
      console.error("Training failed to start", error);
      onNotify?.("Could not start training run.", "error");
    } finally {
      setSaving(false);
    }
  };

  const updateModelOverride = (key: TrainingModelKey, field: keyof TrainingModelConfigSummary, value: any) => {
    setModelOverrides((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: value },
    }));
  };

  const renderModelFields = (key: TrainingModelKey) => {
    const defaultsForModel = defaults?.models[key] || {};
    const override = modelOverrides[key] || {};
    return (
      <Box
        key={key}
        sx={{
          background:
            "linear-gradient(135deg, rgba(47,72,88,0.6) 0%, rgba(26,35,54,0.9) 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 2,
          p: 2,
          width: "100%",
        }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="subtitle1" fontWeight={700}>
            {modelLabels[key]} Model
          </Typography>
          <Chip label="Advanced" size="small" color="primary" variant="outlined" />
        </Box>
        <Stack spacing={1.5}>
          <TextField
            label="Epochs"
            type="number"
            size="small"
            value={override.epoch_num ?? ""}
            placeholder={defaultsForModel.epoch_num ? String(defaultsForModel.epoch_num) : "10"}
            onChange={(e) =>
              updateModelOverride(key, "epoch_num", numberOrNull(e.target.value) as number | undefined)
            }
          />
          <TextField
            label="Print Batch Step"
            type="number"
            size="small"
            value={override.print_batch_step ?? ""}
            placeholder={defaultsForModel.print_batch_step ? String(defaultsForModel.print_batch_step) : "10"}
            onChange={(e) =>
              updateModelOverride(key, "print_batch_step", numberOrNull(e.target.value) as number | undefined)
            }
          />
          <TextField
            label="Save Epoch Step"
            type="number"
            size="small"
            value={override.save_epoch_step ?? ""}
            placeholder={defaultsForModel.save_epoch_step ? String(defaultsForModel.save_epoch_step) : "10"}
            onChange={(e) =>
              updateModelOverride(key, "save_epoch_step", numberOrNull(e.target.value) as number | undefined)
            }
          />
          <TextField
            label="Eval Batch Step"
            type="number"
            size="small"
            value={
              Array.isArray(override.eval_batch_step)
                ? override.eval_batch_step.join(",")
                : override.eval_batch_step ?? ""
            }
            placeholder={
              defaultsForModel.eval_batch_step
                ? Array.isArray(defaultsForModel.eval_batch_step)
                  ? defaultsForModel.eval_batch_step.join(",")
                  : String(defaultsForModel.eval_batch_step)
                : "200"
            }
            onChange={(e) => {
              const raw = e.target.value;
              if (raw.includes(",")) {
                const parsed = raw
                  .split(",")
                  .map((v) => numberOrNull(v))
                  .filter((v): v is number => v !== undefined);
                updateModelOverride(key, "eval_batch_step", parsed.length ? parsed : undefined);
              } else {
                updateModelOverride(
                  key,
                  "eval_batch_step",
                  numberOrNull(raw) as number | undefined
                );
              }
            }}
          />
        </Stack>
      </Box>
    );
  };

  const datasetInfo = activeJob?.dataset;
  const statusChip = useMemo(() => {
    if (!activeJob) return <Chip label="Idle" variant="outlined" />;
    return (
      <Chip
        label={activeJob.status.toUpperCase()}
        color={statusColor[activeJob.status] || "default"}
        variant="filled"
        sx={{ fontWeight: 700 }}
      />
    );
  }, [activeJob]);

  const busy = loadingDefaults || saving;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        Train OCR / KIE Models
        <Typography variant="body2" color="text.secondary">
          {projectName || "Current project"}
        </Typography>
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          backgroundColor: "#0f1624",
          position: "relative",
          overflowX: "hidden",
        }}
      >
        {busy && <LinearProgress sx={{ mb: 2 }} />}
        <Box
          sx={{
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            alignItems: "stretch",
          }}
        >
          <Box
            sx={{
              minWidth: 280,
              flex: 1,
              background:
                "linear-gradient(145deg, rgba(30,44,68,0.8) 0%, rgba(21,28,45,0.95) 100%)",
              borderRadius: 2,
              p: 2,
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            }}
          >
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="subtitle1" fontWeight={700}>
                Global Settings
              </Typography>
              {statusChip}
            </Box>
            <Stack spacing={1.25}>
              <FormControlLabel
                control={<Switch checked={useGpu} onChange={(e) => setUseGpu(e.target.checked)} />}
                label="Use GPU"
              />
              <TextField
                label="Test Ratio"
                size="small"
                value={testRatio}
                onChange={(e) => setTestRatio(e.target.value)}
              />
              <TextField
                label="Train Seed"
                size="small"
                value={trainSeed}
                onChange={(e) => setTrainSeed(e.target.value)}
              />
              <TextField
                label="Split Seed"
                size="small"
                value={splitSeed}
                onChange={(e) => setSplitSeed(e.target.value)}
              />
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Models to train
                </Typography>
                <ToggleButtonGroup
                  color="primary"
                  value={selectedModels}
                  onChange={(_, value) => setSelectedModels(value || [])}
                  aria-label="models to train"
                >
                  {(["det", "rec", "kie"] as TrainingModelKey[]).map((model) => (
                    <ToggleButton key={model} value={model} aria-label={modelLabels[model]}>
                      {modelLabels[model]}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
              <Divider />
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Dataset snapshot
                </Typography>
                {datasetInfo ? (
                  <Typography variant="body2">
                    Pages: {datasetInfo.samples ?? 0} | Annotations: {datasetInfo.annotations ?? 0}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Will be generated from current OCR annotations.
                  </Typography>
                )}
              </Box>
            </Stack>
          </Box>
          <Box
            sx={{
              flex: 2,
              minWidth: 360,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 1.5,
            }}
          >
            {selectedModels.map((model) => renderModelFields(model))}
          </Box>
        </Box>
        {activeJob && (
          <Box mt={2} p={2} sx={{ borderRadius: 2, backgroundColor: "rgba(255,255,255,0.02)" }}>
          <Typography variant="subtitle2" gutterBottom>
              Logs
          </Typography>
            {activeJob.error && (
              <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
                {activeJob.error}
              </Typography>
            )}
            {activeJob.logs && (
              <Box
                mt={1.5}
                sx={{
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 1,
                  maxHeight: 260,
                  overflow: "auto",
                  backgroundColor: "rgba(0,0,0,0.35)",
                  p: 1,
                  fontFamily: "monospace",
                  fontSize: "0.82rem",
                  whiteSpace: "pre-wrap",
                }}
                ref={logContainerRef}
                onScroll={handleLogScroll}
              >
                {activeJob.logs}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          onClick={handleStart}
          variant="contained"
          disabled={saving || disabled || !projectId}
        >
          {activeJob ? "Restart" : "Start Training"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ModelTrainingDialog;
