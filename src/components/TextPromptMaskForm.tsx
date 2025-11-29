import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  InputAdornment,
  Slider,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LightbulbIcon from "@mui/icons-material/Lightbulb";

interface TextPromptMaskFormProps {
  disabled?: boolean;
  loading?: boolean;
  onSubmit: (prompt: string, maxMasks: number) => void;
}

const suggestionPool = [
  "car",
  "person",
  "tree line",
  "road",
  "building",
  "sky reflection",
  "window lights",
  "license plate",
];

const TextPromptMaskForm: React.FC<TextPromptMaskFormProps> = ({
  disabled,
  loading,
  onSubmit,
}) => {
  const [prompt, setPrompt] = useState("");
  const [maxMasks, setMaxMasks] = useState(2);

  const chips = useMemo(
    () => [...suggestionPool].sort(() => 0.5 - Math.random()).slice(0, 4),
    []
  );

  const handleSubmit = () => {
    const clean = prompt.trim();
    if (!clean) return;
    onSubmit(clean, maxMasks);
  };

  return (
    <Box
      sx={{
        width: 260,
        p: 2,
        background: "linear-gradient(180deg, rgba(12,19,35,0.95), rgba(10,14,26,0.9))",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 2,
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      }}
    >
      <Box display="flex" alignItems="center" gap={1} mb={1}>
        <Typography variant="subtitle1" sx={{ color: "white", fontWeight: 700 }}>
          Text → Mask
        </Typography>
        <LightbulbIcon sx={{ color: "#f9d65c" }} fontSize="small" />
      </Box>
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
      <Box mt={1} mb={1.5}>
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.6)" }}>
          Max masks to create
        </Typography>
        <Slider
          size="small"
          min={1}
          max={5}
          step={1}
          value={maxMasks}
          disabled={disabled || loading}
          onChange={(_, value) => setMaxMasks(value as number)}
          sx={{ mt: 0.5 }}
        />
      </Box>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={1.5}>
        {chips.map((chip) => (
          <Chip
            key={chip}
            label={chip}
            size="small"
            onClick={() => setPrompt(chip)}
            disabled={disabled || loading}
            sx={{
              backgroundColor: "rgba(255,255,255,0.08)",
              color: "white",
              "&:hover": { backgroundColor: "rgba(255,255,255,0.14)" },
            }}
          />
        ))}
      </Stack>
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
