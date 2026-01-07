import React, { useEffect, useMemo, useRef, memo, useCallback } from "react";
import {
  Box,
  Typography,
  ListItemButton,
  IconButton,
  Paper,
  Divider,
  InputBase,
  Chip,
  Tooltip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { FixedSizeList as VirtualList } from "react-window";
import type { ListChildComponentProps } from "react-window";
import type { ImageModel, OCRAnnotation, MaskCategory } from "../types";
import axiosInstance from "../axiosInstance";

interface OCRTextListProps {
  image: ImageModel;
  categories: MaskCategory[];
  selectedShapeIds: string[];
  onSelectShapes: (ids: string[]) => void;
  onImageUpdated: (image: ImageModel) => void;
  disabled?: boolean;
  endpointBase: string;
  showCategories: boolean;
  scrollSignal: number;
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

const colorCache = new Map<string, string>();
const getReadableTextColorCached = (bg: string) => {
  if (!colorCache.has(bg)) {
    colorCache.set(bg, readableTextColor(bg));
  }
  return colorCache.get(bg)!;
};

interface CategoryChipProps {
  categoryName: string | null;
  categoryMap: Record<string, MaskCategory>;
}

const CategoryChip = memo<CategoryChipProps>(({ categoryName, categoryMap }) => {
  const category = categoryName ? categoryMap[categoryName] : null;
  const bg = category?.color || "rgba(255,255,255,0.08)";
  const textColor = category ? getReadableTextColorCached(bg) : "#cfd6e4";
  const label = category?.name || "None";

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
});

CategoryChip.displayName = "CategoryChip";

interface OCRListItemProps {
  shape: OCRAnnotation;
  index: number;
  isSelected: boolean;
  disabled: boolean;
  showCategories: boolean;
  categoryMap: Record<string, MaskCategory>;
  onTextChange: (id: string, text: string) => void;
  onTextBlur: (id: string, text: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onSelect: (e: React.MouseEvent, shapeId: string, isSelected: boolean) => void;
  setItemRef: (id: string, el: HTMLDivElement | null) => void;
}

const OCRListItem = memo<OCRListItemProps>(({
  shape,
  index,
  isSelected,
  disabled,
  showCategories,
  categoryMap,
  onTextChange,
  onTextBlur,
  onDelete,
  onSelect,
  setItemRef,
}) => {
  const [localText, setLocalText] = React.useState(shape.text);
  const hasUnsavedChanges = React.useRef(false);

  React.useEffect(() => {
    // Only update local text if we don't have unsaved changes
    if (!hasUnsavedChanges.current) {
      setLocalText(shape.text);
    }
  }, [shape.text]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalText(e.target.value);
    hasUnsavedChanges.current = true;
  };

  const handleBlur = () => {
    if (hasUnsavedChanges.current) {
      hasUnsavedChanges.current = false;
      // Delay the save to allow focus to transfer to the next input
      // We use requestAnimationFrame to wait until after the browser has processed the focus event
      requestAnimationFrame(() => {
        onTextBlur(shape.id, localText);
      });
    }
  };

  return (
    <Box>
      <ListItemButton
        ref={(el) => setItemRef(shape.id, el)}
        onClick={(e) => onSelect(e, shape.id, isSelected)}
        selected={isSelected}
        sx={{
          display: "grid",
          gridTemplateColumns: showCategories
            ? "30px minmax(0, 1fr) auto 24px"
            : "30px minmax(0, 1fr) 24px",
          alignItems: "center",
          gap: 0.6,
          py: 0.7,
          pl: 0.8,
          pr: 1,
          borderLeft: isSelected ? "1px solid #60a5fa" : "2px solid transparent",
          bgcolor: isSelected ? "rgba(96,165,250,0.16)" : "transparent",
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
          value={localText}
          onChange={handleChange}
          onBlur={handleBlur}
          onMouseDown={(e) => e.stopPropagation()}
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
        {showCategories && (
          <Tooltip title={shape.category || "None"} arrow>
            <Box
              sx={{ width: "100%", display: "flex", justifyContent: "flex-end" }}
            >
              <CategoryChip categoryName={shape.category} categoryMap={categoryMap} />
            </Box>
          </Tooltip>
        )}
        <IconButton
          size="small"
          onClick={(e) => onDelete(e, shape.id)}
          disabled={disabled}
          sx={{
            color: "rgba(255,255,255,0.7)",
            "&:hover": { color: "#ff6b6b", backgroundColor: "rgba(255,107,107,0.1)" },
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </ListItemButton>
      <Divider sx={{ borderColor: "#1f2a3d" }} />
    </Box>
  );
});

OCRListItem.displayName = "OCRListItem";

const OCRTextList: React.FC<OCRTextListProps> = ({
  image,
  categories,
  selectedShapeIds,
  onSelectShapes,
  onImageUpdated,
  disabled,
  endpointBase,
  showCategories,
  scrollSignal,
}) => {
  const annotations = image.ocr_annotations || [];
  const listRef = useRef<VirtualList | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const selectionRef = useRef<string[]>([]);
  const [containerHeight, setContainerHeight] = React.useState(600);

  // Use refs to avoid recreating callbacks
  const imageRef = useRef(image);
  const annotationsRef = useRef(annotations);
  const selectedShapeIdsRef = useRef(selectedShapeIds);
  const onImageUpdatedRef = useRef(onImageUpdated);
  const onSelectShapesRef = useRef(onSelectShapes);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  useEffect(() => {
    imageRef.current = image;
    annotationsRef.current = annotations;
    selectedShapeIdsRef.current = selectedShapeIds;
    onImageUpdatedRef.current = onImageUpdated;
    onSelectShapesRef.current = onSelectShapes;
  });

  const categoryMap = useMemo(
    () =>
      categories.reduce<Record<string, MaskCategory>>((acc, cat) => {
        acc[cat.name] = cat;
        return acc;
      }, {}),
    [categories]
  );

  const handleTextChange = useCallback((id: string, newText: string) => {
    const currentAnnotations = annotationsRef.current;
    const shape = currentAnnotations.find((s) => s.id === id);
    if (!shape) return;
    const updatedShape = { ...shape, text: newText };
    const newAnnotations = currentAnnotations.map((s) => (s.id === updatedShape.id ? updatedShape : s));
    onImageUpdatedRef.current({ ...imageRef.current, ocr_annotations: newAnnotations });
  }, []);

  const handleTextBlur = useCallback(async (id: string, newText: string) => {
    const currentAnnotations = annotationsRef.current;
    const shape = currentAnnotations.find((s) => s.id === id);
    if (shape) {
      const updatedShape = { ...shape, text: newText };
      try {
        await axiosInstance.post(`${endpointBase}/${imageRef.current.id}/ocr_annotations/`, {
          shapes: [updatedShape],
        });
        // Update refs silently without triggering a re-render that would lose focus
        const newAnnotations = currentAnnotations.map((s) => (s.id === updatedShape.id ? updatedShape : s));
        annotationsRef.current = newAnnotations;
        imageRef.current = { ...imageRef.current, ocr_annotations: newAnnotations };
      } catch (error) {
        console.error("Error saving shape text:", error);
      }
    }
  }, [endpointBase]);

  const handleDelete = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await axiosInstance.delete(`${endpointBase}/${imageRef.current.id}/ocr_annotations/`, {
        data: { ids: [id] },
      });
      const newAnnotations = annotationsRef.current.filter((s) => s.id !== id);
      onImageUpdatedRef.current({ ...imageRef.current, ocr_annotations: newAnnotations });
      if (selectedShapeIdsRef.current.includes(id)) {
        onSelectShapesRef.current([]);
      }
    } catch (error) {
      console.error("Error deleting shape:", error);
    }
  }, [endpointBase]);

  const handleSelect = useCallback((e: React.MouseEvent, shapeId: string, isSelected: boolean) => {
    const toggle = e.ctrlKey || e.metaKey;
    const currentSelectedIds = selectedShapeIdsRef.current;
    if (toggle) {
      onSelectShapesRef.current(
        isSelected
          ? currentSelectedIds.filter((id) => id !== shapeId)
          : [...currentSelectedIds, shapeId]
      );
    } else {
      onSelectShapesRef.current([shapeId]);
    }
  }, []);

  const setItemRef = useCallback((id: string, el: HTMLDivElement | null) => {
    itemRefs.current[id] = el;
  }, []);

  useEffect(() => {
    selectionRef.current = selectedShapeIds;
  }, [selectedShapeIds]);

  useEffect(() => {
    itemRefs.current = {};
  }, [image.id]);

  useEffect(() => {
    const currentSelection = selectionRef.current;
    if (!scrollSignal || !currentSelection.length) return;
    const firstId = currentSelection[0];
    const index = annotations.findIndex(a => a.id === firstId);
    if (index >= 0 && listRef.current) {
      listRef.current.scrollToItem(index, "smart");
    }
  }, [scrollSignal, image.id, annotations]);

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

      <Box ref={containerRef} sx={{ flexGrow: 1, overflow: "hidden" }}>
        {annotations.length === 0 ? (
          <Box p={2} textAlign="center">
            <Typography variant="body2" color="rgba(255,255,255,0.7)">
              No regions detected.
            </Typography>
          </Box>
        ) : (
          <VirtualList
            ref={listRef}
            height={containerHeight}
            itemCount={annotations.length}
            itemSize={55}
            width="100%"
            overscanCount={5}
          >
            {({ index, style }: ListChildComponentProps) => {
              const shape = annotations[index];
              const isSelected = selectedShapeIds.includes(shape.id);
              return (
                <div style={style}>
                  <OCRListItem
                    shape={shape}
                    index={index}
                    isSelected={isSelected}
                    disabled={disabled || false}
                    showCategories={showCategories}
                    categoryMap={categoryMap}
                    onTextChange={handleTextChange}
                    onTextBlur={handleTextBlur}
                    onDelete={handleDelete}
                    onSelect={handleSelect}
                    setItemRef={setItemRef}
                  />
                </div>
              );
            }}
          </VirtualList>
        )}
      </Box>
    </Paper>
  );
};

export default OCRTextList;
