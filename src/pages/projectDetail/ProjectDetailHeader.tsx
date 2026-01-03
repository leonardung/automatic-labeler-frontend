import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import type { Project, ProjectType } from "../../types";

interface ProjectDetailHeaderProps {
  projectType: ProjectType;
  project: Project | null;
  isBlocked: boolean;
  snapshotsCount: number;
  hasCurrentImage: boolean;
  onSelectFolder: () => void;
  onOpenLoadPage: () => void;
  onOpenLoadProject: () => void;
  onOpenSaveDialog: () => void;
  onImportOcrDataset: () => void;
  onOpenTraining: () => void;
  onBack: () => void;
  onLogout: () => void;
  openSettingsDialog: boolean;
  maxFrames: number;
  stride: number;
  onSettingsClose: () => void;
  onSettingsSubmit: () => void;
  onMaxFramesChange: (value: number) => void;
  onStrideChange: (value: number) => void;
  showOcrActions: boolean;
}

const ProjectDetailHeader = ({
  projectType,
  project,
  isBlocked,
  snapshotsCount,
  hasCurrentImage,
  onSelectFolder,
  onOpenLoadPage,
  onOpenLoadProject,
  onOpenSaveDialog,
  onImportOcrDataset,
  onOpenTraining,
  onBack,
  onLogout,
  openSettingsDialog,
  maxFrames,
  stride,
  onSettingsClose,
  onSettingsSubmit,
  onMaxFramesChange,
  onStrideChange,
  showOcrActions,
}: ProjectDetailHeaderProps) => {
  const hasSnapshots = snapshotsCount > 0;

  return (
    <Box
      mb={1}
      pt={2}
      pb={2}
      px={3}
      display="flex"
      alignItems="center"
      sx={{
        gap: 2,
        backgroundColor: "rgba(17,24,39,0.78)",
        borderBottom: "1px solid #1f2a3d",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
        backdropFilter: "blur(8px)",
      }}
    >
      <Button
        variant="contained"
        color="primary"
        onClick={onSelectFolder}
        sx={{ boxShadow: "0 10px 30px rgba(90,216,255,0.25)" }}
      >
        {projectType === "video_tracking_segmentation" ? "Upload Video" : "Upload Images"}
      </Button>
      <Dialog open={openSettingsDialog} onClose={onSettingsClose}>
        <DialogTitle>Video Settings</DialogTitle>
        <DialogContent>
          <TextField
            label="Max Number of Frames"
            type="number"
            fullWidth
            margin="normal"
            value={maxFrames}
            onChange={(e) => onMaxFramesChange(Number(e.target.value))}
          />
          <TextField
            label="Stride"
            type="number"
            fullWidth
            margin="normal"
            value={stride}
            onChange={(e) => onStrideChange(Number(e.target.value))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onSettingsClose}>Cancel</Button>
          <Button onClick={onSettingsSubmit} variant="contained" color="primary">
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, ml: 2 }}>
        <Button
          variant="outlined"
          color="secondary"
          onClick={onOpenLoadPage}
          disabled={isBlocked || !hasSnapshots || !hasCurrentImage}
        >
          Load Page
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          onClick={onOpenLoadProject}
          disabled={isBlocked || !hasSnapshots}
        >
          Load Project
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={onOpenSaveDialog}
          disabled={isBlocked || !project}
          sx={{ boxShadow: "0 10px 24px rgba(120,202,255,0.2)" }}
        >
          Save Project
        </Button>
      </Box>

      {showOcrActions && (
        <Button
          variant="outlined"
          color="info"
          onClick={onImportOcrDataset}
          disabled={isBlocked || !project}
        >
          Import OCR Dataset
        </Button>
      )}

      {showOcrActions && (
        <Button
          variant="contained"
          color="success"
          onClick={onOpenTraining}
          disabled={isBlocked || !project}
          sx={{ boxShadow: "0 10px 28px rgba(94,255,180,0.25)" }}
        >
          Models Training
        </Button>
      )}

      <Typography variant="h4" color="primary" fontWeight="bold" sx={{ ml: 4 }}>
        {project ? project.name : "Loading Project..."}
      </Typography>

      <Box sx={{ display: "flex", ml: "auto" }}>
        <Button variant="contained" color="secondary" onClick={onBack} sx={{ mr: 2 }}>
          Back
        </Button>
        <Button variant="contained" color="secondary" onClick={onLogout} sx={{ mr: 2 }}>
          Logout
        </Button>
      </Box>
    </Box>
  );
};

export default ProjectDetailHeader;
