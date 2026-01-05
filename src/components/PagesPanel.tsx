import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CancelOutlined,
  CheckCircleOutline,
  ChevronLeft,
  ChevronRight,
  DeleteOutline,
  DeleteSweep,
  PlayArrow,
} from "@mui/icons-material";
import type { ImageModel } from "../types";

type SortMode = "id" | "name";

interface PagesPanelProps {
  images: ImageModel[];
  currentIndex: number;
  isBlocked?: boolean;
  showOcrActions?: boolean;
  onSelectImage: (index: number) => void;
  onDeleteImages?: (imageIds: number[]) => Promise<void> | void;
  onClearAnnotations?: (imageIds: number[]) => Promise<void> | void;
  onValidateImages?: (imageIds: number[], nextValidated: boolean) => Promise<void> | void;
  onRunInference?: (imageIds: number[]) => Promise<void> | void;
}

const getImageLabel = (image: ImageModel) => {
  const original = (image.original_filename || "").trim();
  if (original) return original;
  const url = (image.image || "").split("?")[0];
  const base = url.split("/").pop() || `Image ${image.id}`;
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
};

const PagesPanel: React.FC<PagesPanelProps> = ({
  images,
  currentIndex,
  isBlocked,
  showOcrActions,
  onSelectImage,
  onDeleteImages,
  onClearAnnotations,
  onValidateImages,
  onRunInference,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>("id");
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const lastSelectedIndexRef = useRef<number | null>(null);

  const items = useMemo(() => {
    const withNames = images.map((image, index) => ({
      image,
      index,
      name: getImageLabel(image),
    }));
    const compareByName = (a: typeof withNames[number], b: typeof withNames[number]) => {
      const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (nameCompare !== 0) return nameCompare;
      return (a.image.id || 0) - (b.image.id || 0);
    };
    const compareById = (a: typeof withNames[number], b: typeof withNames[number]) =>
      (a.image.id || 0) - (b.image.id || 0);
    return withNames.sort(sortBy === "name" ? compareByName : compareById);
  }, [images, sortBy]);

  useEffect(() => {
    const validIds = new Set(images.map((image) => image.id));
    setSelectedIds((prev) => {
      const filtered = prev.filter((id) => validIds.has(id));
      const currentId = images[currentIndex]?.id;
      if (currentId && filtered.length <= 1) {
        return [currentId];
      }
      return filtered.length ? filtered : currentId ? [currentId] : filtered;
    });
  }, [currentIndex, images]);

  useEffect(() => {
    if (!items.length) {
      lastSelectedIndexRef.current = null;
      return;
    }
    if (selectedIds.length === 1) {
      const idx = items.findIndex((item) => item.image.id === selectedIds[0]);
      if (idx >= 0) {
        lastSelectedIndexRef.current = idx;
      }
    }
  }, [items, selectedIds]);

  const handleRowClick = (event: React.MouseEvent, itemIndex: number) => {
    const item = items[itemIndex];
    if (!item) return;
    const targetId = item.image.id;
    const isMultiToggle = event.ctrlKey || event.metaKey;

    if (event.shiftKey && lastSelectedIndexRef.current !== null) {
      const start = Math.min(lastSelectedIndexRef.current, itemIndex);
      const end = Math.max(lastSelectedIndexRef.current, itemIndex);
      const rangeIds = items.slice(start, end + 1).map((entry) => entry.image.id);
      setSelectedIds((prev) => {
        const base = isMultiToggle ? new Set(prev) : new Set<number>();
        rangeIds.forEach((id) => base.add(id));
        return Array.from(base);
      });
    } else if (isMultiToggle) {
      setSelectedIds((prev) =>
        prev.includes(targetId) ? prev.filter((id) => id !== targetId) : [...prev, targetId]
      );
    } else {
      setSelectedIds([targetId]);
    }

    lastSelectedIndexRef.current = itemIndex;
    onSelectImage(item.index);
  };

  const handleBulkAction = async (
    action?: (ids: number[]) => Promise<void> | void,
    idsOverride?: number[]
  ) => {
    if (!action || isBlocked) return;
    const targetIds = idsOverride ?? selectedIds;
    if (!targetIds.length) return;
    await action(targetIds);
  };

  const handleValidationAction = async (nextValidated: boolean) => {
    if (!onValidateImages || isBlocked) return;
    if (!selectedIds.length) return;
    await onValidateImages(selectedIds, nextValidated);
  };

  if (isCollapsed) {
    return (
      <Box
        sx={{
          width: 36,
          minWidth: 36,
          height: "100%",
          flexShrink: 0,
          backgroundColor: "#0f1624",
          borderLeft: "1px solid #1f2a3d",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Tooltip title="Show pages">
          <IconButton size="small" onClick={() => setIsCollapsed(false)}>
            <ChevronLeft fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  const rowHeight = showThumbnails ? 72 : 44;

  return (
    <Box
      sx={{
        flexShrink: 0,
        width: 320,
        minWidth: 240,
        maxWidth: "40vw",
        resize: "horizontal",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        p: 1.5,
        backgroundColor: "#0f1624",
        borderLeft: "1px solid #1f2a3d",
        boxShadow: "inset 1px 0 0 rgba(255,255,255,0.04)",
        gap: 1.25,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            Pages
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {selectedIds.length ? `${selectedIds.length} selected` : `${images.length} total`}
          </Typography>
        </Box>
        <Tooltip title="Hide pages panel">
          <IconButton size="small" onClick={() => setIsCollapsed(true)}>
            <ChevronRight fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
        <ToggleButtonGroup
          size="small"
          value={sortBy}
          exclusive
          onChange={(_, value: SortMode | null) => value && setSortBy(value)}
          sx={{ "& .MuiToggleButton-root": { px: 1.25 } }}
        >
          <ToggleButton value="id">ID</ToggleButton>
          <ToggleButton value="name">Name</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Switch
            size="small"
            checked={showThumbnails}
            onChange={(event) => setShowThumbnails(event.target.checked)}
          />
          <Typography variant="caption" color="text.secondary">
            Thumbnails
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          color="error"
          startIcon={<DeleteOutline />}
          disabled={isBlocked || selectedIds.length === 0}
          onClick={() => handleBulkAction(onDeleteImages)}
        >
          Delete
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<DeleteSweep />}
          disabled={isBlocked || selectedIds.length === 0}
          onClick={() => handleBulkAction(onClearAnnotations)}
        >
          Clear Annotations
        </Button>
        {showOcrActions && (
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CheckCircleOutline />}
              disabled={isBlocked || selectedIds.length === 0}
              onClick={() => handleValidationAction(true)}
            >
              Validate
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CancelOutlined />}
              disabled={isBlocked || selectedIds.length === 0}
              onClick={() => handleValidationAction(false)}
            >
              Unvalidate
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<PlayArrow />}
              disabled={isBlocked || selectedIds.length === 0}
              onClick={() => handleBulkAction(onRunInference)}
            >
              Run Inference
            </Button>
          </>
        )}
      </Box>

      <Divider sx={{ opacity: 0.5 }} />

      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: "auto" }}>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No pages uploaded yet.
          </Typography>
        ) : (
          <List disablePadding sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {items.map((item, itemIndex) => {
              const { image, index, name } = item;
              const isSelected = selectedIds.includes(image.id);
              const isCurrent = index === currentIndex;
              return (
                <ListItem key={image.id} disablePadding>
                  <ListItemButton
                    selected={isSelected}
                    onClick={(event) => handleRowClick(event, itemIndex)}
                    sx={{
                      minHeight: rowHeight,
                      borderRadius: 1,
                      gap: 1,
                      alignItems: "center",
                      borderLeft: isCurrent ? "3px solid #4ea8ff" : "3px solid transparent",
                    }}
                  >
                    {showThumbnails && (
                      <Box
                        sx={{
                          width: 54,
                          height: 54,
                          borderRadius: 1,
                          overflow: "hidden",
                          flexShrink: 0,
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <img
                          src={image.thumbnail || image.image}
                          alt={name}
                          loading="lazy"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </Box>
                    )}
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {`ID ${image.id} - Page ${index + 1}`}
                      </Typography>
                    </Box>
                    {showOcrActions && image.is_label && (
                      <Chip
                        size="small"
                        label="Validated"
                        color="success"
                        sx={{ height: 22 }}
                      />
                    )}
                    <Tooltip title="Delete page">
                      <span>
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleBulkAction(onDeleteImages, [image.id]);
                          }}
                          disabled={isBlocked}
                        >
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>
    </Box>
  );
};

export default PagesPanel;
