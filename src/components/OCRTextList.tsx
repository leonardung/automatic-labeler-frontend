import React from "react";
import {
  Box,
  Typography,
  List,
  ListItemButton,
  TextField,
  IconButton,
  Paper,
  Divider,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { ImageModel, OCRAnnotation, ProjectType } from "../types";
import axiosInstance from "../axiosInstance";

interface OCRTextListProps {
  image: ImageModel;
  projectType: ProjectType;
  selectedShapeId: string | null;
  onSelectShape: (id: string | null) => void;
  onImageUpdated: (image: ImageModel) => void;
  disabled?: boolean;
}

const OCRTextList: React.FC<OCRTextListProps> = ({
  image,
  projectType,
  selectedShapeId,
  onSelectShape,
  onImageUpdated,
  disabled,
}) => {
  const annotations = image.ocr_annotations || [];

  const handleTextChange = async (id: string, newText: string) => {
    const shape = annotations.find((s) => s.id === id);
    if (!shape) return;
    const updatedShape = { ...shape, text: newText };
    updateLocal(updatedShape);
  };

  const handleTextBlur = async (id: string) => {
      const shape = annotations.find((s) => s.id === id);
      if (shape) {
          await saveShape(shape);
      }
  };

  const handleCategoryChange = async (id: string, newCategory: string) => {
    const shape = annotations.find((s) => s.id === id);
    if (!shape) return;
    const updatedShape = { ...shape, category: newCategory };
    updateLocal(updatedShape);
  };
  
  const handleCategoryBlur = async (id: string) => {
      const shape = annotations.find((s) => s.id === id);
      if (shape) {
          await saveShape(shape);
      }
  };

  const updateLocal = (updatedShape: OCRAnnotation) => {
    const newAnnotations = annotations.map((s) =>
      s.id === updatedShape.id ? updatedShape : s
    );
    onImageUpdated({ ...image, ocr_annotations: newAnnotations });
  };

  const saveShape = async (shape: OCRAnnotation) => {
    try {
      await axiosInstance.post(`images/${image.id}/ocr_annotations/`, {
        shapes: [shape],
      });
    } catch (error) {
      console.error("Error saving shape text/category:", error);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await axiosInstance.delete(`images/${image.id}/delete_ocr_annotations/`, {
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

  return (
    <Paper
      elevation={3}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        overflow: "hidden",
      }}
    >
      <Box p={2} borderBottom={1} borderColor="divider">
        <Typography variant="h6">Recognized Text</Typography>
        <Typography variant="caption" color="text.secondary">
          {annotations.length} regions
        </Typography>
      </Box>

      <List sx={{ flexGrow: 1, overflowY: "auto", p: 0 }}>
        {annotations.map((shape, index) => {
          const isSelected = shape.id === selectedShapeId;
          return (
            <React.Fragment key={shape.id}>
              <ListItemButton
                alignItems="flex-start"
                selected={isSelected}
                onClick={() => onSelectShape(shape.id)}
                sx={{
                  flexDirection: "column",
                  alignItems: "stretch",
                  borderLeft: isSelected ? "4px solid #1976d2" : "4px solid transparent",
                  bgcolor: isSelected ? "action.selected" : "inherit",
                }}
              >
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="caption" color="text.secondary">
                    #{index + 1} ({shape.type})
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDelete(e, shape.id)}
                    disabled={disabled}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>

                <TextField
                  label="Text"
                  fullWidth
                  size="small"
                  multiline
                  maxRows={3}
                  value={shape.text}
                  onChange={(e) => handleTextChange(shape.id, e.target.value)}
                  onBlur={() => handleTextBlur(shape.id)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={disabled}
                  variant="outlined"
                  margin="dense"
                />

                {projectType === "ocr_kie" && (
                  <TextField
                    label="Category"
                    fullWidth
                    size="small"
                    value={shape.category || ""}
                    onChange={(e) => handleCategoryChange(shape.id, e.target.value)}
                    onBlur={() => handleCategoryBlur(shape.id)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={disabled}
                    variant="outlined"
                    margin="dense"
                  />
                )}
              </ListItemButton>
              <Divider component="li" />
            </React.Fragment>
          );
        })}
        {annotations.length === 0 && (
            <Box p={2} textAlign="center">
                <Typography variant="body2" color="text.secondary">
                    No regions detected.
                </Typography>
            </Box>
        )}
      </List>
    </Paper>
  );
};

export default OCRTextList;
