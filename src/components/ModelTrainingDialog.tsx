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
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
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
  waiting: "warning",
  running: "primary",
  completed: "success",
  failed: "error",
  stopped: "warning",
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
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<TrainingJob | null>(null);
  const [jobsPollingId, setJobsPollingId] = useState<number | null>(null);
  const [jobPollingId, setJobPollingId] = useState<number | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingJobDetail, setLoadingJobDetail] = useState(false);
  const [requestedDefaults, setRequestedDefaults] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [tab, setTab] = useState<"configure" | "runs">("configure");
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const selectedJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedJob(null);
      setSelectedJobId(null);
      setRequestedDefaults(false);
      if (jobsPollingId) {
        window.clearInterval(jobsPollingId);
        setJobsPollingId(null);
      }
      if (jobPollingId) {
        window.clearInterval(jobPollingId);
        setJobPollingId(null);
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
  }, [open, onNotify, requestedDefaults, jobsPollingId, jobPollingId]);

  useEffect(() => {
    selectedJobIdRef.current = selectedJobId;
  }, [selectedJobId]);

  useEffect(() => {
    return () => {
      if (jobsPollingId) {
        window.clearInterval(jobsPollingId);
      }
      if (jobPollingId) {
        window.clearInterval(jobPollingId);
      }
    };
  }, [jobsPollingId, jobPollingId]);

  const isTerminalStatus = (status?: string | null) =>
    status === "completed" || status === "failed" || status === "stopped";

  const loadJobs = async (selectLatest = false) => {
    if (selectLatest) {
      setLoadingJobs(true);
    }
    try {
      const response = await axiosInstance.get<{ jobs: TrainingJob[] }>("ocr-training/jobs/");
      const fetched = response.data.jobs || [];
      setJobs(fetched);
      const currentSelectedId = selectedJobIdRef.current;
      if ((selectLatest || !currentSelectedId) && fetched.length > 0) {
        const nextId = fetched[0].id;
        setSelectedJobId((prev) => prev || nextId);
      }
      if (currentSelectedId) {
        const match = fetched.find((job) => job.id === currentSelectedId);
        if (match) {
          setSelectedJob((prev) =>
            prev ? { ...match, logs: prev.logs } : { ...match, logs: undefined }
          );
        }
      }
    } catch (error) {
      console.error("Failed to load training jobs", error);
    } finally {
      if (selectLatest) {
        setLoadingJobs(false);
      }
    }
  };

  const startJobsPolling = (selectLatest = false) => {
    loadJobs(selectLatest);
    setJobsPollingId((existing) => {
      if (existing) {
        window.clearInterval(existing);
      }
      return existing;
    });
    const id = window.setInterval(() => loadJobs(false), 5000);
    setJobsPollingId(id);
  };

  const startJobDetailPolling = (jobId: string) => {
    setLoadingJobDetail(true);
    const tick = async () => {
      try {
        const response = await axiosInstance.get<{ job: TrainingJob }>(`ocr-training/jobs/${jobId}/`);
        const job = response.data.job;
        setSelectedJob(job);
        setSelectedJobId(jobId);
        setJobs((prev) =>
          prev.map((existing) => (existing.id === jobId ? { ...existing, ...job, logs: undefined } : existing))
        );
        if (isTerminalStatus(job.status)) {
          setJobPollingId((existing) => {
            if (existing) {
              window.clearInterval(existing);
            }
            return null;
          });
        }
      } catch (error) {
        console.error("Failed to poll training job", error);
      } finally {
        setLoadingJobDetail(false);
      }
    };
    tick();
    setJobPollingId((existing) => {
      if (existing) {
        window.clearInterval(existing);
      }
      return existing;
    });
    const id = window.setInterval(tick, 4000);
    setJobPollingId(id);
  };

  const handleSelectJob = (jobId: string) => {
    const job = jobs.find((item) => item.id === jobId);
    if (job) {
      setSelectedJob(job);
    }
    setSelectedJobId(jobId);
    startJobDetailPolling(jobId);
    setTab("runs");
  };

  const handleStopJob = async (jobId: string) => {
    try {
      const response = await axiosInstance.post<{ job: TrainingJob }>(`ocr-training/jobs/${jobId}/stop/`);
      const job = response.data.job;
      setSelectedJob((prev) => (prev?.id === jobId ? job : prev));
      setJobs((prev) => prev.map((existing) => (existing.id === jobId ? { ...existing, ...job } : existing)));
      onNotify?.("Stop requested for this training run.", "info");
      if (!isTerminalStatus(job.status)) {
        startJobDetailPolling(jobId);
      }
      startJobsPolling();
    } catch (error) {
      console.error("Failed to stop training job", error);
      onNotify?.("Could not stop this training run.", "error");
    }
  };

  const handleDownloadLogs = async (jobId: string) => {
    try {
      const response = await axiosInstance.get(`ocr-training/jobs/${jobId}/logs/`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const disposition = response.headers?.["content-disposition"] || "";
      const fileNameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = fileNameMatch ? fileNameMatch[1] : `${jobId}.log`;
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download logs", error);
      onNotify?.("Could not download logs for this run.", "error");
    }
  };

  useEffect(() => {
    if (!open) return;
    startJobsPolling(true);
  }, [open]);

  useEffect(() => {
    if (!open || !selectedJobId || selectedJob) return;
    startJobDetailPolling(selectedJobId);
  }, [open, selectedJob, selectedJobId]);

  const handleLogScroll = () => {
    const el = logContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
    setAutoScroll(atBottom);
  };

  useEffect(() => {
    if (!selectedJob?.logs) return;
    const el = logContainerRef.current;
    if (!el) return;
    if (autoScroll) {
      el.scrollTop = el.scrollHeight;
    }
  }, [selectedJob?.logs, autoScroll]);

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
      setSelectedJob(job);
      setSelectedJobId(job.id);
      setAutoScroll(true);
      setTab("runs");
      onNotify?.("Training queued.", "success");
      startJobsPolling(true);
      startJobDetailPolling(job.id);
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

  const currentJob = selectedJob || jobs[0] || null;
  const datasetInfo = currentJob?.dataset;
  const statusChip = useMemo(() => {
    if (!currentJob) return <Chip label="Idle" variant="outlined" />;
    return (
      <Chip
        label={(currentJob.status || "unknown").toUpperCase()}
        color={statusColor[currentJob.status] || "default"}
        variant="filled"
        sx={{ fontWeight: 700 }}
      />
    );
  }, [currentJob]);
  const formatTime = (value?: string | null) =>
    value ? new Date(value).toLocaleString() : "Not started";

  const busy = loadingDefaults || saving;
  const runsBusy = loadingJobs || loadingJobDetail;

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
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          sx={{ mb: 2, borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Tab label="Configure" value="configure" />
          <Tab label="Runs" value="runs" />
        </Tabs>
        {tab === "configure" && (
          <>
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
          </>
        )}
        {tab === "runs" && (
          <Box>
            {runsBusy && <LinearProgress sx={{ mb: 2 }} />}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "320px 1fr" },
                gap: 2,
                alignItems: "stretch",
              }}
            >
              <Box
                sx={{
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: 2,
                  p: 2,
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Training Runs
                  </Typography>
                  <Button size="small" onClick={() => startJobsPolling(true)}>
                    Refresh
                  </Button>
                </Box>
                <Stack spacing={1.25}>
                  {jobs.length === 0 && (
                    <Typography color="text.secondary" variant="body2">
                      No training runs yet. Start one from the Configure tab.
                    </Typography>
                  )}
                  {jobs.map((job) => {
                    const selected = selectedJobId === job.id;
                    const queueLabel =
                      job.queue_position === 0
                        ? "Running now"
                        : job.queue_position
                        ? `In queue (#${job.queue_position})`
                        : null;
                    return (
                      <Box
                        key={job.id}
                        onClick={() => handleSelectJob(job.id)}
                        sx={{
                          border: "1px solid",
                          borderColor: selected ? "primary.main" : "rgba(255,255,255,0.08)",
                          borderRadius: 1,
                          p: 1.25,
                          cursor: "pointer",
                          backgroundColor: selected ? "rgba(33,150,243,0.08)" : "transparent",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <Box display="flex" alignItems="center" justifyContent="space-between">
                          <Typography variant="subtitle1" fontWeight={700}>
                            Run {job.id.slice(0, 8)}
                          </Typography>
                          <Chip
                            label={(job.status || "pending").toUpperCase()}
                            color={statusColor[job.status] || "default"}
                            size="small"
                          />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {queueLabel ? `${queueLabel} • ` : ""}
                          Created: {formatTime(job.created_at || job.started_at)}
                        </Typography>
                        <Stack direction="row" spacing={1} mt={1}>
                          <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStopJob(job.id);
                            }}
                            disabled={isTerminalStatus(job.status)}
                          >
                            Stop
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadLogs(job.id);
                            }}
                            disabled={!job.log_available}
                          >
                            Download Logs
                          </Button>
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
              <Box
                sx={{
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: 2,
                  p: 2,
                  border: "1px solid rgba(255,255,255,0.08)",
                  minHeight: 320,
                }}
              >
                {selectedJob ? (
                  <>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                      <Box>
                        <Typography variant="subtitle1" fontWeight={700}>
                          Run {selectedJob.id.slice(0, 8)}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip
                            label={(selectedJob.status || "pending").toUpperCase()}
                            color={statusColor[selectedJob.status] || "default"}
                            size="small"
                          />
                          {selectedJob.queue_position !== null &&
                            selectedJob.queue_position !== undefined &&
                            !isTerminalStatus(selectedJob.status) && (
                              <Chip
                                label={
                                  selectedJob.queue_position === 0
                                    ? "Running now"
                                    : `In queue (#${selectedJob.queue_position})`
                                }
                                size="small"
                                variant="outlined"
                              />
                            )}
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleDownloadLogs(selectedJob.id)}
                          disabled={!selectedJob.log_available}
                        >
                          Download Logs
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          color="warning"
                          onClick={() => handleStopJob(selectedJob.id)}
                          disabled={isTerminalStatus(selectedJob.status)}
                        >
                          Stop
                        </Button>
                      </Stack>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      Targets: {selectedJob.targets.join(", ")}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Created: {formatTime(selectedJob.created_at)} • Started: {formatTime(selectedJob.started_at)} •
                      Finished: {selectedJob.finished_at ? formatTime(selectedJob.finished_at) : "In progress"}
                    </Typography>
                    {selectedJob.dataset && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        Pages: {selectedJob.dataset.samples ?? 0} | Annotations:{" "}
                        {selectedJob.dataset.annotations ?? 0}
                      </Typography>
                    )}
                    <Divider sx={{ my: 1.5 }} />
                    <Typography variant="subtitle2" gutterBottom>
                      Logs
                    </Typography>
                    {selectedJob.error && (
                      <Typography variant="body2" color="error" sx={{ mb: 0.5 }}>
                        {selectedJob.error}
                      </Typography>
                    )}
                    <Box
                      sx={{
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 1,
                        maxHeight: 320,
                        minHeight: 200,
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
                      {selectedJob.logs ? selectedJob.logs : "Logs will appear here as the run progresses."}
                    </Box>
                  </>
                ) : (
                  <Typography color="text.secondary" variant="body2">
                    Select a run to view its status and logs.
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {tab === "configure" && (
          <Button
            onClick={handleStart}
            variant="contained"
            disabled={saving || disabled || !projectId}
          >
            Start Training
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default ModelTrainingDialog;
