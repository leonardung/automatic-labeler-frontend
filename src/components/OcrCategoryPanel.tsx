import React, { forwardRef, useEffect, useState, memo, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  Chip,
  IconButton,
  TextField,
  Button,
  Tooltip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import type { MaskCategory } from "../types";

interface OcrCategoryPanelProps {
  categories: MaskCategory[];
  activeCategoryId: number | null;
  onSelectCategory: (categoryId: number) => void;
  onAddCategory: (name: string, color: string) => void;
  onDeleteCategory: (categoryId: number) => void;
  onColorChange: (categoryId: number, color: string) => void;
  onRenameCategory: (categoryId: number, name: string) => void;
  disabled?: boolean;
}

const GOLDEN_RATIO = 0.61803398875;

const hsvToRgb = (h: number, s: number, v: number) => {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const mod = i % 6;
  const r = [v, q, p, p, t, v][mod];
  const g = [t, v, v, q, p, p][mod];
  const b = [p, p, t, v, v, q][mod];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

const colorForIndex = (index: number) => {
  const hue = (index * GOLDEN_RATIO) % 1;
  const [r, g, b] = hsvToRgb(hue, 0.65, 0.95);
  return `rgba(${r},${g},${b},0.6)`;
};

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

const toHex = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const comp = (n: number) => {
    const v = Math.max(0, Math.min(255, Math.round(n)));
    return v.toString(16).padStart(2, "0");
  };
  return `#${comp(r)}${comp(g)}${comp(b)}`;
};

const hexToRgba = (hex: string, alpha = 0.6) => {
  const { r, g, b } = parseToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
};

const contrastTextCache = new Map<string, string>();
const contrastText = (bg: string) => {
  if (!contrastTextCache.has(bg)) {
    const { r, g, b } = parseToRgb(bg);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    contrastTextCache.set(bg, luminance > 0.6 ? "#0b1220" : "#ffffff");
  }
  return contrastTextCache.get(bg)!;
};

interface CategoryItemProps {
  cat: MaskCategory;
  isActive: boolean;
  disabled: boolean;
  onSelectCategory: (categoryId: number) => void;
  onColorChange: (categoryId: number, color: string) => void;
  onRenameCategory: (categoryId: number, name: string) => void;
  onDeleteCategory: (categoryId: number) => void;
}

const CategoryItem = memo<CategoryItemProps>(({
  cat,
  isActive,
  disabled,
  onSelectCategory,
  onColorChange,
  onRenameCategory,
  onDeleteCategory,
}) => {
  const hexColor = useMemo(() => toHex(parseToRgb(cat.color)), [cat.color]);
  const textColor = useMemo(() => contrastText(cat.color), [cat.color]);

  const handleRename = useCallback(() => {
    const next = window.prompt("Rename category", cat.name);
    if (next && next.trim() && next.trim() !== cat.name) {
      onRenameCategory(cat.id, next.trim());
    }
  }, [cat.name, cat.id, onRenameCategory]);

  const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onColorChange(cat.id, hexToRgba(e.target.value, 0.6));
  }, [cat.id, onColorChange]);

  const handleSelect = useCallback(() => {
    onSelectCategory(cat.id);
  }, [cat.id, onSelectCategory]);

  const handleDelete = useCallback(() => {
    onDeleteCategory(cat.id);
  }, [cat.id, onDeleteCategory]);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "30px 1fr 28px 28px",
        alignItems: "center",
        gap: 0.5,
        px: 0.75,
        py: 0.4,
        borderRadius: 1,
        border: isActive ? "1px solid rgba(90,216,255,0.6)" : "1px solid transparent",
        backgroundColor: isActive ? "rgba(90,216,255,0.1)" : "rgba(255,255,255,0.03)",
        width: "100%",
      }}
    >
      <Box
        component="input"
        type="color"
        value={hexColor}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={handleColorChange}
        style={{
          width: 24,
          height: 24,
          border: "none",
          borderRadius: 6,
          padding: 0,
          background: "transparent",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      />
      <Chip
        label={cat.name}
        onClick={handleSelect}
        clickable
        sx={{
          bgcolor: cat.color,
          color: textColor,
          fontWeight: 700,
          height: 24,
          width: "100%",
          "& .MuiChip-label": {
            width: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
          },
          "&:hover": { opacity: 0.9 },
        }}
      />
      <Tooltip title="Rename category">
        <IconButton
          size="small"
          onClick={handleRename}
          disabled={disabled}
          sx={{ color: "rgba(255,255,255,0.7)" }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete category">
        <IconButton
          size="small"
          onClick={handleDelete}
          disabled={disabled}
          sx={{ color: "rgba(255,255,255,0.7)" }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
});

CategoryItem.displayName = "CategoryItem";

const OcrCategoryPanel = forwardRef<HTMLDivElement, OcrCategoryPanelProps>(({
  categories,
  activeCategoryId,
  onSelectCategory,
  onAddCategory,
  onDeleteCategory,
  onColorChange,
  onRenameCategory,
  disabled,
}, ref) => {
  const [name, setName] = useState("");
  const [color, setColor] = useState(colorForIndex(categories.length || 0));

  useEffect(() => {
    setColor(colorForIndex(categories.length || 0));
  }, [categories.length]);

  const handleAdd = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddCategory(trimmed, color);
    setName("");
    setColor(colorForIndex(categories.length + 1));
  }, [name, color, onAddCategory, categories.length]);

  return (
    <Box
      ref={ref}
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
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.6, mb: 1 }}>
        {categories.map((cat) => (
          <CategoryItem
            key={cat.id}
            cat={cat}
            isActive={activeCategoryId === cat.id}
            disabled={disabled || false}
            onSelectCategory={onSelectCategory}
            onColorChange={onColorChange}
            onRenameCategory={onRenameCategory}
            onDeleteCategory={onDeleteCategory}
          />
        ))}
        {categories.length === 0 && (
          <Typography variant="body2" color="rgba(255,255,255,0.7)">
            No categories yet.
          </Typography>
        )}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "30px 1fr 72px", gap: 0.75, alignItems: "center" }}>
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.12)",
            background: color,
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
          sx={{ width: "100%", minWidth: "auto", whiteSpace: "nowrap" }}
        >
          Add
        </Button>
      </Box>
    </Box>
  );
});

OcrCategoryPanel.displayName = "OcrCategoryPanel";

export default OcrCategoryPanel;
