// Controls.js
import React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ClearIcon from '@mui/icons-material/Clear';

const Controls = ({
  projectType,
  onPropagate,
  onClearLabels,
}) => (
  <Box display="flex" flexDirection="column" alignItems="left" justifyContent="left">
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
