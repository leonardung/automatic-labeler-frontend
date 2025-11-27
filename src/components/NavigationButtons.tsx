import React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

interface NavigationButtonsProps {
  onPrev: () => void;
  onNext: () => void;
  disablePrev: boolean;
  disableNext: boolean;
}

const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  onPrev,
  onNext,
  disablePrev,
  disableNext,
}) => (
  <Box display="flex" flexDirection="column" alignItems="flex-start" justifyContent="flex-start">
    <Tooltip title="Next Image" placement="left">
      <IconButton onClick={onNext} color="secondary" disabled={disableNext}>
        <ArrowForwardIcon fontSize="large" />
      </IconButton>
    </Tooltip>
    <Tooltip title="Previous Image" placement="left">
      <IconButton onClick={onPrev} color="secondary" disabled={disablePrev}>
        <ArrowBackIcon fontSize="large" />
      </IconButton>
    </Tooltip>
  </Box>
);

export default NavigationButtons;
