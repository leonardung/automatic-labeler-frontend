import React, { useState } from "react";
import {
  List,
  ListItemButton,
  ListItemText,
  IconButton,
  Button,
  Popover,
  TextField,
  Typography,
  Box,
  Input,
  Slider,
  Tooltip,
} from "@mui/material";
import { Delete } from "@mui/icons-material";
import type { MaskCategory } from "../types";

const toHex = (value: string | number) => {
  const hex = Number(value).toString(16);
  return hex.length === 1 ? "0" + hex : hex;
};

const rgbaFrom = (hex: string, alpha = 1) => {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const parseColor = (color?: string | null) => {
  if (!color) return { hex: "#00c800", alpha: 0.5 };
  if (color.startsWith("rgba")) {
    const parts = color
      .replace("rgba(", "")
      .replace(")", "")
      .split(",")
      .map((p) => p.trim());
    const [r, g, b, a] = parts;
    return {
      hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
      alpha: Number(a ?? 1),
    };
  }
  return { hex: color, alpha: 1 };
};

const colorSwatchStyle: React.CSSProperties = {
  width: 20,
  height: 23,
  minWidth: 20,
  minHeight: 23,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  borderRadius: 6,
  padding: 0,
  display: "inline-block",
  flexShrink: 0,
  appearance: "none",
};

interface MaskCategoryPanelProps {
  categories: MaskCategory[];
  activeCategoryId: number | null;
  onAddCategory: (name: string, color: string) => void;
  onSelectCategory: (categoryId: number) => void;
  onDeleteCategory: (categoryId: number) => void;
  onColorChange: (categoryId: number, color: string) => void;
}

function MaskCategoryPanel({
  categories,
  activeCategoryId,
  onAddCategory,
  onSelectCategory,
  onDeleteCategory,
  onColorChange,
}: MaskCategoryPanelProps) {
  const [newCategory, setNewCategory] = useState("");
  const [newColor, setNewColor] = useState("#00c800");
  const [newOpacity, setNewOpacity] = useState(0.5);
  const [opacityAnchors, setOpacityAnchors] = useState<Record<number, HTMLElement | null>>({});
  const [localAlpha, setLocalAlpha] = useState<Record<number, number>>({});

  const handleAdd = () => {
    if (newCategory.trim() !== "") {
      onAddCategory(newCategory, rgbaFrom(newColor, newOpacity));
      setNewCategory("");
    }
  };

  React.useEffect(() => {
    setLocalAlpha((prev) => {
      const next: Record<number, number> = {};
      categories.forEach((c) => {
        const { alpha } = parseColor(c.color);
        next[c.id] = prev[c.id] ?? alpha;
      });
      return next;
    });
  }, [categories]);

  const handleOpenOpacity = (categoryId: number, event: React.MouseEvent<HTMLElement>) => {
    setOpacityAnchors((prev) => ({ ...prev, [categoryId]: event.currentTarget }));
  };

  const handleCloseOpacity = (categoryId: number) => {
    setOpacityAnchors((prev) => ({ ...prev, [categoryId]: null }));
  };

  const renderCategory = (category: MaskCategory) => {
    const { hex, alpha } = parseColor(category.color);
    const alphaValue = localAlpha[category.id] ?? alpha;
    const anchor = opacityAnchors[category.id] ?? null;
    return (
      <ListItemButton
        key={category.id}
        selected={activeCategoryId === category.id}
        onClick={() => onSelectCategory(category.id)}
        sx={{
          cursor: "pointer",
          color: "white",
          borderRadius: 2,
          mb: 1,
          border: "1px solid transparent",
          "&.Mui-selected": {
            backgroundColor: "rgba(90,216,255,0.14)",
            borderColor: "rgba(90,216,255,0.35)",
          },
          "&:hover": {
            backgroundColor: "rgba(255,255,255,0.04)",
          },
        }}
      >
        <Tooltip title="Change color" arrow>
          <Box
            component="input"
            type="color"
            value={hex}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              onColorChange(category.id, rgbaFrom(e.target.value, alpha))
            }
            style={{ ...colorSwatchStyle, marginRight: 5 }}
          />
        </Tooltip>
        <Tooltip title="Adjust opacity" arrow>
          <IconButton
            size="small"
            sx={{ color: "white", mr: 1 }}
            onClick={(e) => {
              e.stopPropagation();
              handleOpenOpacity(category.id, e);
            }}
          >
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: `linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.6))`,
                border: "1px solid rgba(255,255,255,0.4)",
              }}
            />
          </IconButton>
        </Tooltip>
        <Popover
          open={Boolean(anchor)}
          anchorEl={anchor}
          onClose={() => handleCloseOpacity(category.id)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
          PaperProps={{
            sx: {
              p: 2,
              backgroundColor: "#0f1624",
              border: "1px solid #1f2a3d",
              borderRadius: 2,
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            },
          }}
        >
          <Typography variant="body2" sx={{ mb: 1.5, color: "white", fontWeight: 600 }}>
            Opacity
          </Typography>
          <Slider
            size="small"
            min={0}
            max={1}
            step={0.05}
            value={alphaValue}
            onChange={(_, value) => {
              setLocalAlpha((prev) => ({ ...prev, [category.id]: value as number }));
            }}
            onChangeCommitted={(_, value) => {
              onColorChange(category.id, rgbaFrom(hex, value as number));
            }}
            sx={{ width: 180 }}
          />
        </Popover>
        <ListItemText
          primary={category.name}
          primaryTypographyProps={{ color: "white", fontWeight: 800, fontSize: "1rem" }}
        />
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            onDeleteCategory(category.id);
          }}
          edge="end"
          size="small"
          sx={{ color: "white" }}
        >
          <Delete fontSize="small" />
        </IconButton>
      </ListItemButton>
    );
  };

  return (
    <Box
      sx={{
        width: 260,
        p: 2.5,
        borderRight: "1px solid #1f2a3d",
        height: "100%",
        boxSizing: "border-box",
        backgroundColor: "#0f1624",
        color: "white",
        boxShadow: "inset -1px 0 0 rgba(255,255,255,0.04)",
      }}
    >
      <Typography variant="h6" sx={{ mb: 1, color: "white" }}>Mask Categories</Typography>
      <List dense sx={{ maxHeight: "60vh", overflowY: "auto", pr: 1 }}>
        {categories.map((category) => renderCategory(category))}
      </List>
      <TextField
        label="New Category"
        value={newCategory}
        onChange={(e) => setNewCategory(e.target.value)}
        fullWidth
        margin="dense"
        InputLabelProps={{ style: { color: "white" } }}
        InputProps={{ style: { color: "white" } }}
      />
      <Box display="flex" alignItems="center" mt={1} mb={1}>
        <Typography variant="body2" sx={{ mr: 1, color: "white" }}>Color</Typography>
        <Tooltip title="New category color" arrow>
          <Box
            component="input"
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            style={{ ...colorSwatchStyle, marginRight: 5 }}
          />
        </Tooltip>
        <Box sx={{ flexGrow: 1, ml: 1 }}>
          <Slider
            size="small"
            min={0}
            max={1}
            step={0.05}
            value={newOpacity}
            onChange={(_, value) => setNewOpacity(value as number)}
          />
        </Box>
      </Box>
      <Button variant="contained" fullWidth onClick={handleAdd}>
        Add Category
      </Button>
    </Box>
  );
}

export default MaskCategoryPanel;
