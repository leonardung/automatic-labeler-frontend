import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CssBaseline,
  Divider,
  FormControlLabel,
  LinearProgress,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
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
  TrainingDatasetInfo,
} from "../types";

/* eslint-disable react-hooks/exhaustive-deps */

type ModelOverrides = Partial<Record<TrainingModelKey, TrainingModelConfigSummary & { epoch_num?: number }>>;

type ModelTabView = "configure" | "runs";

interface SnackState {
  open: boolean;
  message: string;
  severity: "success" | "info" | "warning" | "error";
}

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

const initialPanelTabs: Record<TrainingModelKey, ModelTabView> = {
  det: "configure",
  rec: "configure",
  kie: "configure",
};

function ModelTrainingPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const projectNameFromState = (location.state as { projectName?: string } | undefined)?.projectName;

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
  const [activeModel, setActiveModel] = useState<TrainingModelKey>("det");
  const [panelTabs, setPanelTabs] = useState<Record<TrainingModelKey, ModelTabView>>(initialPanelTabs);
  const [datasetSummary, setDatasetSummary] = useState<TrainingDatasetInfo | null>(null);
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [notification, setNotification] = useState<SnackState | null>(null);

  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const selectedJobIdRef = useRef<string | null>(null);

  const projectNumericId = projectId ? Number(projectId) : null;
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

  const notify = (message: string, severity: SnackState["severity"] = "info") => {
    setNotification({ open: true, message, severity });
  };

  const isTerminalStatus = (status?: string | null) =>
    status === "completed" || status === "failed" || status === "stopped";

  const loadDefaults = () => {
    if (requestedDefaults) return;
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
        notify("Unable to load training defaults.", "error");
      })
      .finally(() => setLoadingDefaults(false));
  };

  const loadDatasetSummary = async () => {
    if (!projectNumericId) return;
    setLoadingDataset(true);
    try {
      const response = await axiosInstance.get<{ dataset: TrainingDatasetInfo }>("ocr-training/dataset/", {
        params: { project_id: projectNumericId },
      });
      setDatasetSummary(response.data.dataset || null);
    } catch (error) {
      console.error("Failed to load dataset summary", error);
      notify("Unable to fetch dataset snapshot.", "warning");
    } finally {
      setLoadingDataset(false);
    }
  };

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
        const nextForModel = fetched.find((job) => job.targets.includes(activeModel)) || fetched[0];
        if (nextForModel) {
          setSelectedJobId(nextForModel.id);
          setSelectedJob((prev) =>
            prev ? { ...nextForModel, logs: prev.logs } : { ...nextForModel, logs: undefined }
          );
        }
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
      if (job.targets.length && !job.targets.includes(activeModel)) {
        setActiveModel(job.targets[0]);
      }
    }
    setSelectedJobId(jobId);
    startJobDetailPolling(jobId);
    setPanelTabs((prev) => ({ ...prev, [activeModel]: "runs" }));
  };

  const handleStopJob = async (jobId: string) => {
    try {
      const response = await axiosInstance.post<{ job: TrainingJob }>(`ocr-training/jobs/${jobId}/stop/`);
      const job = response.data.job;
      setSelectedJob((prev) => (prev?.id === jobId ? job : prev));
      setJobs((prev) => prev.map((existing) => (existing.id === jobId ? { ...existing, ...job } : existing)));
      notify("Stop requested for this training run.", "info");
      if (!isTerminalStatus(job.status)) {
        startJobDetailPolling(jobId);
      }
      startJobsPolling();
    } catch (error) {
      console.error("Failed to stop training job", error);
      notify("Could not stop this training run.", "error");
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
      notify("Could not download logs for this run.", "error");
    }
  };

  // Intentional single-run bootstrap
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadDefaults();
    loadDatasetSummary();
    startJobsPolling(true);
  }, []);

  // Keep initial job details in sync without rerunning bootstrap helpers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedJobId || selectedJob) return;
    startJobDetailPolling(selectedJobId);
  }, [selectedJob, selectedJobId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const filtered = jobs.filter((job) => job.targets.includes(activeModel));
    if (filtered.length === 0) return;
    const foundInFiltered = filtered.find((job) => job.id === selectedJobId);
    if (!foundInFiltered) {
      const next = filtered[0];
      setSelectedJob(next);
      setSelectedJobId(next.id);
      startJobDetailPolling(next.id);
    }
  }, [activeModel, jobs]);

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
    if (!projectNumericId) {
      notify("A project must be loaded before training.", "warning");
      return;
    }
    if (!selectedModels.length) {
      notify("Select at least one model to train.", "warning");
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
        project_id: projectNumericId,
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
      setActiveModel(job.targets[0] || "det");
      setPanelTabs((prev) => ({ ...prev, [job.targets[0] || "det"]: "runs" }));
      notify("Training queued.", "success");
      startJobsPolling(true);
      startJobDetailPolling(job.id);
    } catch (error) {
      console.error("Training failed to start", error);
      notify("Could not start training run.", "error");
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
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        <TextField
          label="Epochs"
          type="number"
          size="small"
          value={override.epoch_num ?? ""}
          placeholder={defaultsForModel.epoch_num ? String(defaultsForModel.epoch_num) : "10"}
          onChange={(e) => updateModelOverride(key, "epoch_num", numberOrNull(e.target.value) as number | undefined)}
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
              updateModelOverride(key, "eval_batch_step", numberOrNull(raw) as number | undefined);
            }
          }}
        />
      </Stack>
    );
  };

  const currentJob =
    selectedJob || jobs.find((job) => job.targets.includes(activeModel)) || jobs[0] || null;
  const datasetInfo = datasetSummary || currentJob?.dataset;
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
  const formatTime = (value?: string | null) => (value ? new Date(value).toLocaleString() : "Not started");

  const busy = loadingDefaults || saving;
  const runsBusy = loadingJobs || loadingJobDetail;
  const filteredRuns = jobs.filter((job) => job.targets.includes(activeModel));
  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#0f1624", color: "#e5f1ff" }}>
      <CssBaseline />
      {(busy || runsBusy || loadingDataset) && <LinearProgress />}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 3,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          position: "sticky",
          top: 0,
          background: "linear-gradient(135deg, #0f1624 0%, #10192b 100%)",
          zIndex: 2,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={800} color="primary">
            Models Training
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            {projectNameFromState || `Project #${projectNumericId ?? "N/A"}`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button variant="outlined" color="secondary" onClick={() => navigate(`/projects/${projectId}`)}>
            Back to Project
          </Button>
          <Button variant="contained" color="success" disabled={saving || !projectNumericId} onClick={handleStart}>
            Start Training
          </Button>
        </Stack>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "360px 1fr" },
          gap: 2,
          p: 3,
        }}
      >
        <Stack spacing={2}>
          <Box
            sx={{
              background: "rgba(255,255,255,0.03)",
              borderRadius: 2,
              p: 2,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle1" fontWeight={700}>
                Dataset Overview
              </Typography>
              <Tooltip title="Refresh dataset stats">
                <Button size="small" onClick={loadDatasetSummary}>
                  Refresh
                </Button>
              </Tooltip>
            </Box>
            {datasetInfo ? (
              <Stack spacing={1}>
                <Typography variant="body2">
                  Images: {datasetInfo.images ?? datasetInfo.samples ?? 0} / {datasetInfo.total_images ?? "—"}
                </Typography>
                <Typography variant="body2">Boxes: {datasetInfo.boxes ?? datasetInfo.annotations ?? 0}</Typography>
                <Typography variant="body2">
                  Categories: {datasetInfo.category_total ?? datasetInfo.categories?.length ?? 0}
                </Typography>
                {datasetInfo.categories && datasetInfo.categories.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Boxes per category
                    </Typography>
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      {datasetInfo.categories.slice(0, 5).map((cat) => (
                        <Box
                          key={cat.label}
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.9rem",
                            color: "#dfe9ff",
                          }}
                        >
                          <span>{cat.label}</span>
                          <span>{cat.count}</span>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No dataset snapshot yet. Start a training run to generate one.
              </Typography>
            )}
          </Box>

          <Box
            sx={{
              background: "rgba(255,255,255,0.03)",
              borderRadius: 2,
              p: 2,
              border: "1px solid rgba(255,255,255,0.08)",
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
              <TextField label="Test Ratio" size="small" value={testRatio} onChange={(e) => setTestRatio(e.target.value)} />
              <TextField label="Train Seed" size="small" value={trainSeed} onChange={(e) => setTrainSeed(e.target.value)} />
              <TextField label="Split Seed" size="small" value={splitSeed} onChange={(e) => setSplitSeed(e.target.value)} />
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Models to train
                </Typography>
                <ToggleButtonGroup
                  color="primary"
                  value={selectedModels}
                  onChange={(_, value) => setSelectedModels(value || [])}
                  aria-label="models to train"
                  fullWidth
                >
                  {(["det", "rec", "kie"] as TrainingModelKey[]).map((model) => (
                    <ToggleButton key={model} value={model} aria-label={modelLabels[model]} sx={{ flex: 1 }}>
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
              background: "rgba(255,255,255,0.03)",
              borderRadius: 2,
              p: 2,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="subtitle1" fontWeight={700}>
                Recent Runs
              </Typography>
              <Button size="small" onClick={() => startJobsPolling(true)}>
                Refresh
              </Button>
            </Box>
            <Stack spacing={1}>
              {jobs.slice(0, 4).map((job) => (
                <Box key={job.id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Box>
                    <Typography variant="body2" fontWeight={700}>
                      Run {job.id.slice(0, 6)} ({job.targets.join(", ")})
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatTime(job.created_at || job.started_at)}
                    </Typography>
                  </Box>
                  <Chip label={(job.status || "pending").toUpperCase()} color={statusColor[job.status] || "default"} size="small" />
                </Box>
              ))}
              {jobs.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No training runs yet.
                </Typography>
              )}
            </Stack>
          </Box>
        </Stack>

        <Box
          sx={{
            background: "rgba(255,255,255,0.02)",
            borderRadius: 2,
            p: 2,
            border: "1px solid rgba(255,255,255,0.08)",
            minHeight: 560,
          }}
        >
          <Tabs
            value={activeModel}
            onChange={(_, value) => setActiveModel(value)}
            sx={{ mb: 2, borderBottom: "1px solid rgba(255,255,255,0.08)" }}
          >
            {(["det", "rec", "kie"] as TrainingModelKey[]).map((model) => (
              <Tab key={model} label={modelLabels[model]} value={model} />
            ))}
          </Tabs>

          {(["det", "rec", "kie"] as TrainingModelKey[]).map((model) => {
            if (model !== activeModel) return null;
            const view = panelTabs[model];
            const jobsForModel = filteredRuns;
            const displayedJob =
              selectedJob && selectedJob.targets.includes(model)
                ? selectedJob
                : jobsForModel.length
                ? jobsForModel[0]
                : null;
            return (
              <Box key={model}>
                <Tabs
                  value={view}
                  onChange={(_, value) => setPanelTabs((prev) => ({ ...prev, [model]: value }))}
                  sx={{ mb: 2 }}
                >
                  <Tab label="Configure" value="configure" />
                  <Tab label="Runs & Logs" value="runs" />
                </Tabs>
                {view === "configure" && (
                  <Box
                    sx={{
                      background:
                        "linear-gradient(135deg, rgba(47,72,88,0.35) 0%, rgba(26,35,54,0.85) 100%)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 2,
                      p: 2,
                    }}
                  >
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {modelLabels[model]} Model
                      </Typography>
                      <Chip label="Advanced" size="small" color="primary" variant="outlined" />
                    </Box>
                    {renderModelFields(model)}
                  </Box>
                )}
                {view === "runs" && (
                  <Box>
                    {runsBusy && <LinearProgress sx={{ mb: 1 }} />}
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
                            {modelLabels[model]} Runs
                          </Typography>
                          <Button size="small" onClick={() => startJobsPolling(true)}>
                            Refresh
                          </Button>
                        </Box>
                        <Stack spacing={1.25}>
                          {jobsForModel.length === 0 && (
                            <Typography color="text.secondary" variant="body2">
                              No training runs yet. Start one from Configure.
                            </Typography>
                          )}
                          {jobsForModel.map((job) => {
                            const selected = displayedJob?.id === job.id;
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
                        {displayedJob ? (
                          <>
                            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                              <Box>
                                <Typography variant="subtitle1" fontWeight={700}>
                                  Run {displayedJob.id.slice(0, 8)}
                                </Typography>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Chip
                                    label={(displayedJob.status || "pending").toUpperCase()}
                                    color={statusColor[displayedJob.status] || "default"}
                                    size="small"
                                  />
                                  {displayedJob.queue_position !== null &&
                                    displayedJob.queue_position !== undefined &&
                                    !isTerminalStatus(displayedJob.status) && (
                                      <Chip
                                        label={
                                          displayedJob.queue_position === 0
                                            ? "Running now"
                                            : `In queue (#${displayedJob.queue_position})`
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
                                  onClick={() => handleDownloadLogs(displayedJob.id)}
                                  disabled={!displayedJob.log_available}
                                >
                                  Download Logs
                                </Button>
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="warning"
                                  onClick={() => handleStopJob(displayedJob.id)}
                                  disabled={isTerminalStatus(displayedJob.status)}
                                >
                                  Stop
                                </Button>
                              </Stack>
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              Targets: {displayedJob.targets.join(", ")}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Created: {formatTime(displayedJob.created_at)} • Started: {formatTime(displayedJob.started_at)} •
                              Finished: {displayedJob.finished_at ? formatTime(displayedJob.finished_at) : "In progress"}
                            </Typography>
                            {displayedJob.dataset && (
                              <Typography variant="body2" sx={{ mt: 0.5 }}>
                                Pages: {displayedJob.dataset.samples ?? 0} | Annotations: {displayedJob.dataset.annotations ?? 0}
                              </Typography>
                            )}
                            <Divider sx={{ my: 1.5 }} />
                            <Typography variant="subtitle2" gutterBottom>
                              Logs
                            </Typography>
                            {displayedJob.error && (
                              <Typography variant="body2" color="error" sx={{ mb: 0.5 }}>
                                {displayedJob.error}
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
                              {displayedJob.logs ? displayedJob.logs : "Logs will appear here as the run progresses."}
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
              </Box>
            );
          })}
        </Box>
      </Box>

      <Snackbar
        open={Boolean(notification?.open)}
        autoHideDuration={3000}
        onClose={() => setNotification(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {notification ? (
          <Alert severity={notification.severity} onClose={() => setNotification(null)} sx={{ width: "100%" }}>
            {notification.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

export default ModelTrainingPage;
