import React from "react";
import { Box, CircularProgress, LinearProgress, Typography } from "@mui/material";
import type { ImageModel } from "../../types";
import type { BulkOcrStage } from "./types";

interface ProjectDetailBlockingOverlayProps {
  isBlocked: boolean;
  blockingMessage: string;
  isPropagating: boolean;
  propagationProgress: number;
  isBulkOcrRunning: boolean;
  bulkOcrStatus: Record<number, { status: BulkOcrStage; error?: string }>;
  images: ImageModel[];
  isImportingDataset: boolean;
  datasetImportProgress: {
    status: string;
    percent: number;
    processed: number;
    total: number;
  };
}

const ProjectDetailBlockingOverlay = ({
  isBlocked,
  blockingMessage,
  isPropagating,
  propagationProgress,
  isBulkOcrRunning,
  bulkOcrStatus,
  images,
  isImportingDataset,
  datasetImportProgress,
}: ProjectDetailBlockingOverlayProps) => {
  if (!isBlocked) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        backgroundColor: "rgba(6, 12, 20, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        color: "white",
        pointerEvents: "auto",
      }}
    >
      <CircularProgress color="inherit" />
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        {blockingMessage}
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.8 }}>
        Please wait...
      </Typography>
      {(isPropagating || isBulkOcrRunning || isImportingDataset) && (
        <Box sx={{ width: 360, display: "flex", flexDirection: "column", gap: 1.25 }}>
          {isImportingDataset && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              <LinearProgress
                variant="determinate"
                value={datasetImportProgress.percent}
                sx={{ width: "100%" }}
              />
              <Typography
                variant="caption"
                sx={{ textAlign: "center", color: "rgba(255,255,255,0.9)" }}
              >
                {`Dataset import ${datasetImportProgress.percent}%`}
                {datasetImportProgress.total > 0
                  ? ` (${datasetImportProgress.processed}/${datasetImportProgress.total} lines)`
                  : datasetImportProgress.processed
                  ? ` (${datasetImportProgress.processed} lines processed)`
                  : ""}
              </Typography>
            </Box>
          )}
          {(isPropagating || isBulkOcrRunning) && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
              <LinearProgress
                variant={isPropagating ? "determinate" : "indeterminate"}
                value={isPropagating ? propagationProgress : undefined}
                sx={{ width: "100%" }}
              />
              <Typography
                variant="caption"
                sx={{ textAlign: "center", color: "rgba(255,255,255,0.9)" }}
              >
                {isPropagating
                  ? `Propagation ${propagationProgress}% complete`
                  : "Running OCR..."}
              </Typography>
            </Box>
          )}
          {isBulkOcrRunning && Object.keys(bulkOcrStatus).length > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
              {images.map((img) => {
                if (!img.id || !bulkOcrStatus[img.id]) return null;
                const status = bulkOcrStatus[img.id];
                const value =
                  status.status === "pending"
                    ? 0
                    : status.status === "detecting"
                    ? 40
                    : status.status === "recognizing"
                    ? 80
                    : 100;
                const label =
                  status.status === "done"
                    ? "Done"
                    : status.status === "error"
                    ? status.error || "Error"
                    : status.status === "recognizing"
                    ? "Recognizing..."
                    : status.status === "detecting"
                    ? "Detecting..."
                    : "Pending";
                const title = img.original_filename || `Image ${img.id}`;
                return (
                  <Box key={img.id} sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                    <Typography variant="caption" color="rgba(255,255,255,0.85)">
                      {title}: {label}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={value}
                      color={
                        status.status === "error"
                          ? "error"
                          : status.status === "done"
                          ? "success"
                          : "primary"
                      }
                      sx={{
                        height: 6,
                        borderRadius: 1,
                        backgroundColor: "rgba(255,255,255,0.2)",
                      }}
                    />
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default ProjectDetailBlockingOverlay;
