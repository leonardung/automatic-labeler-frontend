import React, { useState } from "react";
import {
  Box,
  Typography,
  Stack,
  Chip,
  IconButton,
  TextField,
  Button,
  Tooltip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { MaskCategory } from "../types";

interface OcrCategoryPanelProps {
  categories: MaskCategory[];
  activeCategoryId: number | null;
  onSelectCategory: (categoryId: number) => void;
  onAddCategory: (name: string, color: string) => void;
  onDeleteCategory: (categoryId: number) => void;
  onColorChange: (categoryId: number, color: string) => void;
  disabled?: boolean;
}

const defaultColor = "#5ad8ff";

const parseToRgb = (color: string) => {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const value = parseInt(hex.length === 3 ? hex.repeat(2) : hex, 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  }
  if (color.startsWith("rgb")) {
    const [r, g, b] = color
      .replace(/[rgba()]/g, "")
      .split(",")
      .map((v) => parseInt(v.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    return { r: r || 0, g: g || 0, b: b || 0 };
  }
  return { r: 0, g: 0, b: 0 };
};

const contrastText = (bg: string) => {
  const { r, g, b } = parseToRgb(bg);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0b1220" : "#ffffff";
};

const OcrCategoryPanel: React.FC<OcrCategoryPanelProps> = ({
  categories,
  activeCategoryId,
  onSelectCategory,
  onAddCategory,
  onDeleteCategory,
  onColorChange,
  disabled,
}) => {
  const [name, setName] = useState("");
  const [color, setColor] = useState(defaultColor);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddCategory(trimmed, color);
    setName("");
  };

  const renderCategory = (cat: MaskCategory) => {
    const isActive = activeCategoryId === cat.id;
    return (
      <Box
        key={cat.id}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 0.5,
          py: 0.25,
          borderRadius: 1,
          border: isActive ? "1px solid rgba(90,216,255,0.6)" : "1px solid transparent",
          backgroundColor: isActive ? "rgba(90,216,255,0.1)" : "rgba(255,255,255,0.03)",
        }}
      >
        <Box
          component="input"
          type="color"
          value={cat.color}
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onColorChange(cat.id, e.target.value)}
          style={{
            width: 28,
            height: 28,
            border: "none",
            borderRadius: 6,
            padding: 0,
            background: "transparent",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        />
        <Chip
          label={cat.name}
          onClick={() => onSelectCategory(cat.id)}
          clickable
          sx={{
            bgcolor: cat.color,
            color: contrastText(cat.color),
            fontWeight: 700,
            "&:hover": { opacity: 0.9 },
          }}
        />
        <Tooltip title="Delete category">
          <IconButton
            size="small"
            onClick={() => onDeleteCategory(cat.id)}
            disabled={disabled}
            sx={{ color: "rgba(255,255,255,0.7)" }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: "1px solid #1f2a3d",
        backgroundColor: "#0b1220",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
        color: "white",
      }}
    >
      <Typography variant="h6" sx={{ mb: 1, color: "white", fontWeight: 800 }}>
        Categories
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1} mb={1}>
        {categories.map((cat) => renderCategory(cat))}
        {categories.length === 0 && (
          <Typography variant="body2" color="rgba(255,255,255,0.7)">
            No categories yet.
          </Typography>
        )}
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box
          component="input"
          type="color"
          value={color}
          disabled={disabled}
          onChange={(e) => setColor(e.target.value)}
          style={{
            width: 36,
            height: 36,
            border: "none",
            borderRadius: 8,
            padding: 0,
            background: "transparent",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        />
        <TextField
          label="New category"
          size="small"
          value={name}
          disabled={disabled}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          fullWidth
          InputLabelProps={{ style: { color: "rgba(255,255,255,0.7)" } }}
          InputProps={{
            style: { color: "white" },
            sx: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 1 },
          }}
        />
        <Button
          variant="contained"
          onClick={handleAdd}
          disabled={disabled}
          sx={{ minWidth: 90, whiteSpace: "nowrap" }}
        >
          Add
        </Button>
      </Stack>
    </Box>
  );
};

export default OcrCategoryPanel;
