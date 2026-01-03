import React from "react";
import { Alert, Box, CssBaseline, LinearProgress, Snackbar, Typography } from "@mui/material";

import ProjectDetailBlockingOverlay from "./projectDetail/ProjectDetailBlockingOverlay";
import ProjectDetailHeader from "./projectDetail/ProjectDetailHeader";
import ProjectDetailSnapshotDialogs from "./projectDetail/ProjectDetailSnapshotDialogs";
import OcrWorkspace from "./projectDetail/OcrWorkspace";
import SegmentationWorkspace from "./projectDetail/SegmentationWorkspace";
import { useProjectDetailController } from "./projectDetail/useProjectDetailController";

function ProjectDetailPage() {
  const {
    overlayProps,
    headerProps,
    ocrWorkspaceProps,
    segmentationWorkspaceProps,
    snapshotDialogProps,
    notification,
    onNotificationClose,
    hasImages,
    loading,
    isOCRProject,
    isBlocked,
  } = useProjectDetailController();

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        color: "text.primary",
        backgroundColor: "background.default",
        position: "relative",
      }}
      aria-busy={isBlocked}
    >
      <ProjectDetailBlockingOverlay {...overlayProps} />
      <CssBaseline />
      <ProjectDetailHeader {...headerProps} />
      {loading && <LinearProgress />}
      {hasImages ? (
        isOCRProject ? (
          <OcrWorkspace {...ocrWorkspaceProps} />
        ) : (
          <SegmentationWorkspace {...segmentationWorkspaceProps} />
        )
      ) : (
        <Typography variant="body1" color="text.secondary" align="center">
          No images loaded. Please upload images.
        </Typography>
      )}
      <ProjectDetailSnapshotDialogs {...snapshotDialogProps} />
      <Snackbar open={notification.open} autoHideDuration={6000} onClose={onNotificationClose}>
        <Alert onClose={onNotificationClose} severity={notification.severity} sx={{ width: "100%" }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default ProjectDetailPage;
