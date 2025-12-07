import React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

interface NavigationButtonsProps {
  onPrev: () => void;
  onNext: () => void;
  disablePrev: boolean;
  disableNext: boolean;
  disabled?: boolean;
}

const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  onPrev,
  onNext,
  disablePrev,
  disableNext,
  disabled,
}) => (
  <Box display="flex" flexDirection="column" alignItems="flex-start" justifyContent="flex-start">
    <Tooltip title="Next Image" placement="left">
      <IconButton onClick={onNext} color="secondary" disabled={disableNext || disabled}>
        <ArrowForwardIcon fontSize="large" />
      </IconButton>
    </Tooltip>
    <Tooltip title="Previous Image" placement="left">
      <IconButton onClick={onPrev} color="secondary" disabled={disablePrev || disabled}>
        <ArrowBackIcon fontSize="large" />
      </IconButton>
    </Tooltip>
  </Box>
);

export default NavigationButtons;
