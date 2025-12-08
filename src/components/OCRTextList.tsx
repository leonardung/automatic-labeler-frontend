import React, { useMemo } from "react";
import {
  Box,
  Typography,
  List,
  ListItemButton,
  IconButton,
  Paper,
  Divider,
  InputBase,
  Chip,
  Tooltip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { ImageModel, OCRAnnotation, MaskCategory } from "../types";
import axiosInstance from "../axiosInstance";

interface OCRTextListProps {
  image: ImageModel;
  categories: MaskCategory[];
  selectedShapeId: string | null;
  activeCategoryId: number | null;
  onSelectShape: (id: string | null) => void;
  onImageUpdated: (image: ImageModel) => void;
  disabled?: boolean;
  endpointBase: string;
}

const getRgbFromColor = (color: string) => {
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    const bigint = parseInt(hex.length === 3 ? hex.repeat(2) : hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
  }
  if (color.startsWith("rgba") || color.startsWith("rgb")) {
    const [r, g, b] = color
      .replace(/[rgba()]/g, "")
      .split(",")
      .map((v) => parseInt(v.trim(), 10))
      .filter((v) => !Number.isNaN(v));
    return { r: r || 0, g: g || 0, b: b || 0 };
  }
  return { r: 0, g: 0, b: 0 };
};

const readableTextColor = (bg: string) => {
  const { r, g, b } = getRgbFromColor(bg);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111826" : "#ffffff";
};

const OCRTextList: React.FC<OCRTextListProps> = ({
  image,
  categories,
  selectedShapeId,
  activeCategoryId,
  onSelectShape,
  onImageUpdated,
  disabled,
  endpointBase,
}) => {
  const annotations = image.ocr_annotations || [];

  const categoryMap = useMemo(
    () =>
      categories.reduce<Record<string, MaskCategory>>((acc, cat) => {
        acc[cat.name] = cat;
        return acc;
      }, {}),
    [categories]
  );

  const handleTextChange = (id: string, newText: string) => {
    const shape = annotations.find((s) => s.id === id);
    if (!shape) return;
    updateLocal({ ...shape, text: newText });
  };

  const handleTextBlur = async (id: string) => {
    const shape = annotations.find((s) => s.id === id);
    if (shape) {
      await saveShape(shape);
    }
  };

  const updateLocal = (updatedShape: OCRAnnotation) => {
    const newAnnotations = annotations.map((s) => (s.id === updatedShape.id ? updatedShape : s));
    onImageUpdated({ ...image, ocr_annotations: newAnnotations });
  };

  const saveShape = async (shape: OCRAnnotation) => {
    try {
      await axiosInstance.post(`${endpointBase}/${image.id}/ocr_annotations/`, {
        shapes: [shape],
      });
    } catch (error) {
      console.error("Error saving shape text:", error);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await axiosInstance.delete(`${endpointBase}/${image.id}/ocr_annotations/`, {
        data: { ids: [id] },
      });
      const newAnnotations = annotations.filter((s) => s.id !== id);
      onImageUpdated({ ...image, ocr_annotations: newAnnotations });
      if (selectedShapeId === id) {
        onSelectShape(null);
      }
    } catch (error) {
      console.error("Error deleting shape:", error);
    }
  };

  const renderCategoryChip = (categoryName: string | null) => {
    const category = categoryName ? categoryMap[categoryName] : null;
    const bg = category?.color || "rgba(255,255,255,0.08)";
    const textColor = category ? readableTextColor(bg) : "#cfd6e4";
    const label = category?.name || "Unlabeled";
    return (
      <Chip
        label={label}
        size="small"
        sx={{
          bgcolor: bg,
          color: textColor,
          fontWeight: 700,
          height: 22,
          minWidth: 35,
          "& .MuiChip-label": {
            overflow: "hidden",
            textOverflow: "ellipsis",
            px: 1,
            maxWidth: "14ch",
          },
          border: category ? "none" : "1px solid rgba(255,255,255,0.16)",
        }}
      />
    );
  };

  return (
    <Paper
      elevation={3}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "#0b1220",
        border: "1px solid #1f2a3d",
        overflow: "hidden",
      }}
    >
      <Box px={2} py={1.5} borderBottom={1} borderColor="#1f2a3d">
        <Typography variant="h6" sx={{ color: "white", fontWeight: 800 }}>
          Recognized Text
        </Typography>
        <Typography variant="caption" color="rgba(255,255,255,0.7)">
          {annotations.length} regions
        </Typography>
      </Box>

      <List sx={{ flexGrow: 1, overflowY: "auto", p: 0 }}>
        {annotations.map((shape, index) => {
          const isSelected = shape.id === selectedShapeId;
          const matchesActiveCategory =
            activeCategoryId !== null &&
            categories.find((c) => c.id === activeCategoryId)?.name === shape.category;

          return (
            <React.Fragment key={shape.id}>
              <ListItemButton
                onClick={() => onSelectShape(shape.id)}
                selected={isSelected}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "24px minmax(0, 1fr) auto 36px",
                  alignItems: "center",
                  gap: 0.6,
                  py: 0.7,
                  px: 1.5,
                  borderLeft: isSelected ? "4px solid #60a5fa" : "4px solid transparent",
                  bgcolor: isSelected
                    ? "rgba(96,165,250,0.16)"
                    : matchesActiveCategory
                    ? "rgba(90,216,255,0.07)"
                    : "transparent",
                  "&:hover": {
                    bgcolor: "rgba(255,255,255,0.04)",
                  },
                }}
              >
                <Tooltip title={`ID: ${shape.id}`} placement="top" arrow>
                  <Typography
                    variant="caption"
                    color="rgba(255,255,255,0.85)"
                    sx={{ fontWeight: 800 }}
                    noWrap
                  >
                    #{index + 1}
                  </Typography>
                </Tooltip>
                <InputBase
                  value={shape.text}
                  onChange={(e) => handleTextChange(shape.id, e.target.value)}
                  onBlur={() => handleTextBlur(shape.id)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={disabled}
                  sx={{
                    px: 1,
                    py: 0.45,
                    borderRadius: 1,
                    backgroundColor: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "white",
                    fontSize: 12.5,
                    "& .MuiInputBase-input": {
                      textOverflow: "ellipsis",
                    },
                  }}
                  fullWidth
                  inputProps={{ "aria-label": "recognized text" }}
                />
                <Tooltip title={shape.category || "Unlabeled"} arrow>
                  <Box
                    onClick={(e) => e.stopPropagation()}
                    sx={{ width: "100%", display: "flex", justifyContent: "flex-end" }}
                  >
                    {renderCategoryChip(shape.category)}
                  </Box>
                </Tooltip>
                <IconButton
                  size="small"
                  onClick={(e) => handleDelete(e, shape.id)}
                  disabled={disabled}
                  sx={{
                    color: "rgba(255,255,255,0.7)",
                    "&:hover": { color: "#ff6b6b", backgroundColor: "rgba(255,107,107,0.1)" },
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemButton>
              <Divider component="li" sx={{ borderColor: "#1f2a3d" }} />
            </React.Fragment>
          );
        })}
        {annotations.length === 0 && (
          <Box p={2} textAlign="center">
            <Typography variant="body2" color="rgba(255,255,255,0.7)">
              No regions detected.
            </Typography>
          </Box>
        )}
      </List>
    </Paper>
  );
};

export default OCRTextList;
