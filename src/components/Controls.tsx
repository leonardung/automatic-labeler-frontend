import React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ClearIcon from "@mui/icons-material/Clear";
import type { ProjectType } from "../types";

interface ControlsProps {
  projectType: ProjectType;
  onPropagate: () => void;
  onClearLabels: () => void;
}

const Controls: React.FC<ControlsProps> = ({ projectType, onPropagate, onClearLabels }) => (
  <Box display="flex" flexDirection="column" alignItems="flex-start" justifyContent="flex-start">
    {projectType === "video_tracking_segmentation" && (
      <Tooltip title="Propagate masks through video" placement="left">
        <IconButton onClick={onPropagate} color="secondary">
          <AutoAwesomeIcon fontSize="large" />
        </IconButton>
      </Tooltip>
    )}
    <Tooltip title="Clear masks and points" placement="left">
      <IconButton onClick={onClearLabels} color="secondary">
        <ClearIcon fontSize="large" />
      </IconButton>
    </Tooltip>
  </Box>
);

export default Controls;
