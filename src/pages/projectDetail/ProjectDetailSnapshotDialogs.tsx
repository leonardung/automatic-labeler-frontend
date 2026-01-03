import React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
  Box,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { ImageModel, ProjectSnapshot } from "../../types";
import { formatSnapshotDate, formatSnapshotLabel } from "./utils";

interface ProjectDetailSnapshotDialogsProps {
  loadDialogMode: "page" | "project" | null;
  snapshots: ProjectSnapshot[];
  currentImage?: ImageModel;
  isBlocked: boolean;
  onCloseLoadDialog: () => void;
  onLoadSnapshot: (mode: "page" | "project", snapshotId: number) => void;
  onDeleteSnapshot: (snapshotId: number) => void;
  saveDialogOpen: boolean;
  snapshotName: string;
  onSnapshotNameChange: (value: string) => void;
  onCloseSaveDialog: () => void;
  onConfirmSaveSnapshot: () => void;
}

const ProjectDetailSnapshotDialogs = ({
  loadDialogMode,
  snapshots,
  currentImage,
  isBlocked,
  onCloseLoadDialog,
  onLoadSnapshot,
  onDeleteSnapshot,
  saveDialogOpen,
  snapshotName,
  onSnapshotNameChange,
  onCloseSaveDialog,
  onConfirmSaveSnapshot,
}: ProjectDetailSnapshotDialogsProps) => (
  <>
    <Dialog
      open={Boolean(loadDialogMode)}
      onClose={onCloseLoadDialog}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>
        {loadDialogMode === "project" ? "Load Project Snapshot" : "Load Page Snapshot"}
      </DialogTitle>
      <DialogContent dividers>
        <DialogContentText sx={{ mb: 2 }}>
          {loadDialogMode === "project"
            ? "Apply a saved version to every page in this project."
            : "Apply a saved version to the current page."}
        </DialogContentText>
        {snapshots.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No saved snapshots yet. Save a project first to see versions here.
          </Typography>
        ) : (
          <List>
            {snapshots.map((snap) => (
              <ListItem key={snap.id} disablePadding>
                <ListItemButton
                  onClick={() => loadDialogMode && onLoadSnapshot(loadDialogMode, snap.id)}
                  disabled={isBlocked || (loadDialogMode === "page" && !currentImage)}
                >
                  <ListItemText
                    primary={formatSnapshotLabel(snap)}
                    secondary={(snap.name || "").trim() ? formatSnapshotDate(snap) : undefined}
                  />
                  <Box display="flex" alignItems="center" gap={1}>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        loadDialogMode && onLoadSnapshot(loadDialogMode, snap.id);
                      }}
                      disabled={isBlocked || (loadDialogMode === "page" && !currentImage)}
                    >
                      Load
                    </Button>
                    <IconButton
                      edge="end"
                      aria-label="delete snapshot"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSnapshot(snap.id);
                      }}
                      disabled={isBlocked}
                      size="small"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCloseLoadDialog}>Close</Button>
      </DialogActions>
    </Dialog>
    <Dialog open={saveDialogOpen} onClose={onCloseSaveDialog}>
      <DialogTitle>Save Project Snapshot</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>
          Optional: add a title for this version. Leave blank to use the timestamp.
        </DialogContentText>
        <TextField
          label="Snapshot Title (optional)"
          fullWidth
          value={snapshotName}
          onChange={(e) => onSnapshotNameChange(e.target.value)}
          autoFocus
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCloseSaveDialog}>Cancel</Button>
        <Button onClick={onConfirmSaveSnapshot} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  </>
);

export default ProjectDetailSnapshotDialogs;
