import React, { useState } from "react";
import { Box, Button, InputAdornment, TextField, Tooltip, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

interface TextPromptMaskFormProps {
  disabled?: boolean;
  loading?: boolean;
  onSubmit: (prompt: string, maxMasks: number, threshold: number) => void;
}

const TextPromptMaskForm: React.FC<TextPromptMaskFormProps> = ({
  disabled,
  loading,
  onSubmit,
}) => {
  const [prompt, setPrompt] = useState("");
  const [maxMasks, setMaxMasks] = useState(10);
  const [threshold, setThreshold] = useState(0.5);

  const handleSubmit = () => {
    const clean = prompt.trim();
    if (!clean) return;
    const safeMax = Math.min(99, Math.max(1, Math.round(maxMasks || 10)));
    const safeThreshold = Math.min(1, Math.max(0.01, Number(threshold) || 0.5));
    onSubmit(clean, safeMax, safeThreshold);
  };

  return (
    <Box
      sx={{
        width: "100%",
        p: 1.5,
      }}
    >
      <Typography variant="subtitle1" sx={{ color: "white", fontWeight: 700, mb: 0.5 }}>
        Text → Mask
      </Typography>
      <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.75)", mb: 1 }}>
        Describe what you want segmented. We will create categories named &lt;prompt&gt;_&lt;id&gt;.
      </Typography>
      <TextField
        fullWidth
        size="small"
        value={prompt}
        disabled={disabled || loading}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="e.g. sports car, neon light"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <AutoAwesomeIcon sx={{ color: "rgba(255,255,255,0.7)" }} />
            </InputAdornment>
          ),
          sx: {
            backgroundColor: "rgba(255,255,255,0.05)",
            borderRadius: 1,
            color: "white",
          },
        }}
        InputLabelProps={{ style: { color: "rgba(255,255,255,0.6)" } }}
      />
      <Box display="flex" gap={1} mt={1.5} mb={1}>
        <TextField
          label="Max masks"
          type="number"
          size="small"
          fullWidth
          value={maxMasks}
          disabled={disabled || loading}
          onChange={(e) => setMaxMasks(Number(e.target.value) || 0)}
          inputProps={{ min: 1, max: 99 }}
          InputLabelProps={{ style: { color: "rgba(255,255,255,0.6)" } }}
          InputProps={{
            sx: {
              backgroundColor: "rgba(255,255,255,0.05)",
              color: "white",
              borderRadius: 1,
            },
          }}
        />
        <TextField
          label="Threshold"
          type="number"
          size="small"
          fullWidth
          value={threshold}
          disabled={disabled || loading}
          onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
          inputProps={{ min: 0.01, max: 1, step: 0.05 }}
          InputLabelProps={{ style: { color: "rgba(255,255,255,0.6)" } }}
          InputProps={{
            sx: {
              backgroundColor: "rgba(255,255,255,0.05)",
              color: "white",
              borderRadius: 1,
            },
          }}
        />
      </Box>
      <Tooltip title="Create masks using the text prompt" arrow>
        <span>
          <Button
            variant="contained"
            fullWidth
            onClick={handleSubmit}
            disabled={disabled || loading || !prompt.trim()}
            startIcon={<AutoAwesomeIcon />}
          >
            {loading ? "Generating..." : "Generate Masks"}
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
};

export default TextPromptMaskForm;
