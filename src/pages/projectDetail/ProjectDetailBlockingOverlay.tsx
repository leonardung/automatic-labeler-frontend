import React, { useEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, LinearProgress, Typography } from "@mui/material";
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
  onCancelBulkInference: () => void;
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
  onCancelBulkInference,
}: ProjectDetailBlockingOverlayProps) => {
  const progressListRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const lastScrollTopRef = useRef<number>(0);
  const userScrollTimeoutRef = useRef<number | null>(null);

  // Auto-scroll to center the currently processing image
  useEffect(() => {
    if (!isBulkOcrRunning || isUserScrolling || !progressListRef.current) return;

    // First, try to find the currently processing image (detecting, recognizing, classifying)
    let targetIndex = images.findIndex((img) => {
      if (!img.id || !bulkOcrStatus[img.id]) return false;
      const status = bulkOcrStatus[img.id].status;
      return status === "detecting" || status === "recognizing" || status === "classifying";
    });

    // If no processing image, find the first pending one
    if (targetIndex < 0) {
      targetIndex = images.findIndex((img) => {
        if (!img.id || !bulkOcrStatus[img.id]) return false;
        return bulkOcrStatus[img.id].status === "pending";
      });
    }

    if (targetIndex >= 0 && progressListRef.current) {
      const listElement = progressListRef.current;
      const children = listElement.children;
      if (children[targetIndex]) {
        const targetElement = children[targetIndex] as HTMLElement;
        const containerHeight = listElement.clientHeight;
        const targetTop = targetElement.offsetTop;
        const targetHeight = targetElement.offsetHeight;

        // Scroll to center the element in the middle of the viewport
        const scrollTo = targetTop - containerHeight - targetHeight;
        listElement.scrollTop = scrollTo;
      }
    }
  }, [bulkOcrStatus, images, isBulkOcrRunning, isUserScrolling]);

  // Handle manual scrolling detection
  useEffect(() => {
    const listElement = progressListRef.current;
    if (!listElement || !isBulkOcrRunning) return;

    const handleScroll = () => {
      const currentScrollTop = listElement.scrollTop;

      // Check if user scrolled (not programmatic scroll)
      if (Math.abs(currentScrollTop - lastScrollTopRef.current) > 5) {
        setIsUserScrolling(true);

        // Clear existing timeout
        if (userScrollTimeoutRef.current) {
          window.clearTimeout(userScrollTimeoutRef.current);
        }

        // Resume auto-scroll after 3 seconds of no manual scrolling
        userScrollTimeoutRef.current = window.setTimeout(() => {
          setIsUserScrolling(false);
        }, 3000);
      }

      lastScrollTopRef.current = currentScrollTop;
    };

    listElement.addEventListener("scroll", handleScroll);
    return () => {
      listElement.removeEventListener("scroll", handleScroll);
      if (userScrollTimeoutRef.current) {
        window.clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, [isBulkOcrRunning]);

  // Reset user scrolling state when bulk OCR stops
  useEffect(() => {
    if (!isBulkOcrRunning) {
      setIsUserScrolling(false);
    }
  }, [isBulkOcrRunning]);

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
      {isBulkOcrRunning && (
        <Button
          variant="contained"
          color="error"
          onClick={onCancelBulkInference}
          sx={{ mt: 1 }}
        >
          Cancel
        </Button>
      )}
      {(isPropagating || isBulkOcrRunning || isImportingDataset) && (
        <Box sx={{ width: 360, maxHeight: "60vh", display: "flex", flexDirection: "column", gap: 1.25 }}>
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
                variant={isPropagating || isBulkOcrRunning ? "determinate" : "indeterminate"}
                value={
                  isPropagating
                    ? propagationProgress
                    : isBulkOcrRunning
                      ? (() => {
                        const totalImages = Object.keys(bulkOcrStatus).length;
                        const completedImages = Object.values(bulkOcrStatus).filter(
                          (s) => s.status === "done" || s.status === "error"
                        ).length;
                        return totalImages > 0 ? (completedImages / totalImages) * 100 : 0;
                      })()
                      : undefined
                }
                sx={{ width: "100%" }}
              />
              <Typography
                variant="caption"
                sx={{ textAlign: "center", color: "rgba(255,255,255,0.9)" }}
              >
                {isPropagating
                  ? `Propagation ${propagationProgress}% complete`
                  : isBulkOcrRunning
                    ? (() => {
                      const totalImages = Object.keys(bulkOcrStatus).length;
                      const completedImages = Object.values(bulkOcrStatus).filter(
                        (s) => s.status === "done" || s.status === "error"
                      ).length;
                      return `Processing ${completedImages}/${totalImages} pages (${Math.round(
                        (completedImages / totalImages) * 100
                      )}%)`;
                    })()
                    : "Running OCR..."}
              </Typography>
            </Box>
          )}
          {isBulkOcrRunning && Object.keys(bulkOcrStatus).length > 0 && (
            <Box
              ref={progressListRef}
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
                mt: 0.5,
                maxHeight: "40vh",
                overflowY: "auto",
                paddingRight: 1,
                "&::-webkit-scrollbar": {
                  width: "8px",
                },
                "&::-webkit-scrollbar-track": {
                  backgroundColor: "rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                },
                "&::-webkit-scrollbar-thumb": {
                  backgroundColor: "rgba(255,255,255,0.3)",
                  borderRadius: "4px",
                  "&:hover": {
                    backgroundColor: "rgba(255,255,255,0.5)",
                  },
                },
              }}
            >
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
