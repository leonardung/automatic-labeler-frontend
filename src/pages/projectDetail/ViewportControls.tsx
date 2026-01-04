import React from "react";
import { Box, Button, Tooltip } from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import type { ViewportControls as ViewportControlsType } from "./types";

interface ViewportControlsProps {
  controls: ViewportControlsType | null;
  disabled?: boolean;
}

const ViewportControls = ({ controls, disabled }: ViewportControlsProps) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
    <Tooltip title="Zoom in">
      <span>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ZoomInIcon />}
          onClick={controls?.zoomIn}
          disabled={!controls || disabled}
        >
          Zoom
        </Button>
      </span>
    </Tooltip>
    <Tooltip title="Zoom out">
      <span>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ZoomOutIcon />}
          onClick={controls?.zoomOut}
          disabled={!controls || disabled}
        >
          Unzoom
        </Button>
      </span>
    </Tooltip>
    <Tooltip title={`Fit ${controls?.fitMode === "outside" ? "Outside" : "Inside"}`}>
      <span>
        <Button
          variant="outlined"
          size="small"
          startIcon={<FitScreenIcon />}
          sx={{ minWidth: 98 }}
          onClick={controls?.toggleFit}
          disabled={!controls || disabled}
        >
          Fit ({controls?.fitMode === "outside" ? "Out" : "In"})
        </Button>
      </span>
    </Tooltip>
  </Box>
);

export default ViewportControls;
