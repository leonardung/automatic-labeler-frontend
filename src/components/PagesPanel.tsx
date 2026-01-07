import React, { useEffect, useMemo, useRef, useState, memo, useCallback } from "react";
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
import { FixedSizeList as VirtualList } from "react-window";
import type { ListChildComponentProps } from "react-window";
import type { ImageModel } from "../types";
import ResizablePanel from "./ResizablePanel";

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
  const base = url.split("/").pop() || "Image";
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
};

const hasBoxesWithoutCategories = (image: ImageModel) => {
  if (!image.ocr_annotations || image.ocr_annotations.length === 0) {
    return false;
  }
  return image.ocr_annotations.every(
    (annotation) => !annotation.category || annotation.category === "None"
  );
};

interface PageItemProps {
  image: ImageModel;
  index: number;
  name: string;
  itemIndex: number;
  isCurrent: boolean;
  isSelected: boolean;
  isBlocked: boolean;
  showThumbnails: boolean;
  showOcrActions: boolean;
  rowHeight: number;
  onRowClick: (event: React.MouseEvent, itemIndex: number) => void;
  onDeleteSingle: (event: React.MouseEvent, imageId: number) => void;
}

const PageItem = memo<PageItemProps>(({
  image,
  index,
  name,
  itemIndex,
  isCurrent,
  isSelected,
  isBlocked,
  showThumbnails,
  showOcrActions,
  rowHeight,
  onRowClick,
  onDeleteSingle,
}) => {
  return (
    <ListItem disablePadding>
      <ListItemButton
        selected={isSelected}
        onClick={(event) => onRowClick(event, itemIndex)}
        sx={{
          minHeight: rowHeight,
          borderRadius: 1.5,
          gap: 1,
          alignItems: "center",
          borderLeft: isCurrent ? "3px solid #4ea8ff" : "3px solid transparent",
          backgroundColor: "rgba(255,255,255,0.02)",
          transition: "background-color 150ms ease, box-shadow 150ms ease",
          "&:hover": {
            backgroundColor: "rgba(255,255,255,0.06)",
          },
          "&.Mui-selected": {
            backgroundColor: "rgba(78,168,255,0.16)",
            boxShadow: "0 0 0 1px rgba(78,168,255,0.2)",
          },
          "&.Mui-selected:hover": {
            backgroundColor: "rgba(78,168,255,0.22)",
          },
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
            <Box
              component="span"
              sx={{
                mr: 0.75,
                color: "text.secondary",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              # {index + 1} -
            </Box>
            {name}
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
        {showOcrActions && (!image.ocr_annotations || image.ocr_annotations.length === 0) && (
          <Chip
            size="small"
            label="No boxes"
            color="warning"
            sx={{ height: 22 }}
          />
        )}
        {showOcrActions && hasBoxesWithoutCategories(image) && (
          <Chip
            size="small"
            label="No category"
            color="error"
            sx={{ height: 22 }}
          />
        )}
        <Tooltip title="Delete page">
          <span>
            <IconButton
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteSingle(event, image.id);
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
});

PageItem.displayName = "PageItem";

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 240;

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
  const listRef = useRef<VirtualList | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerHeight, setContainerHeight] = useState(600);

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

  // Scroll to current page when it changes
  useEffect(() => {
    if (listRef.current && images.length > 0) {
      const currentImageId = images[currentIndex]?.id;
      if (currentImageId) {
        const idx = items.findIndex((item) => item.image.id === currentImageId);
        if (idx >= 0) {
          listRef.current.scrollToItem(idx, "smart");
        }
      }
    }
  }, [currentIndex, items, images]);

  const handleRowClick = useCallback((event: React.MouseEvent, itemIndex: number) => {
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
  }, [items, onSelectImage]);

  const handleBulkAction = useCallback(async (
    action?: (ids: number[]) => Promise<void> | void,
    idsOverride?: number[]
  ) => {
    if (!action || isBlocked) return;
    const targetIds = idsOverride ?? selectedIds;
    if (!targetIds.length) return;
    await action(targetIds);
  }, [isBlocked, selectedIds]);

  const handleValidationAction = useCallback(async (nextValidated: boolean) => {
    if (!onValidateImages || isBlocked) return;
    if (!selectedIds.length) return;
    await onValidateImages(selectedIds, nextValidated);
  }, [onValidateImages, isBlocked, selectedIds]);

  const handleDeleteSingle = useCallback((event: React.MouseEvent, imageId: number) => {
    handleBulkAction(onDeleteImages, [imageId]);
  }, [handleBulkAction, onDeleteImages]);

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
    <ResizablePanel
      axis="horizontal"
      resizeFrom="left"
      defaultSize={DEFAULT_WIDTH}
      minSize={MIN_WIDTH}
      maxSize={({ width }) => width * 0.4}
      sx={{
        flexShrink: 0,
        overflow: "hidden",
        height: "100%",
        backgroundColor: "#0f1624",
        borderLeft: "1px solid #1f2a3d",
        boxShadow: "inset 1px 0 0 rgba(255,255,255,0.04)",
      }}
      contentSx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        p: 1.5,
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

      <Box sx={{ display: "grid", gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          Sort
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ToggleButtonGroup
            size="small"
            value={sortBy}
            exclusive
            onChange={(_, value: SortMode | null) => value && setSortBy(value)}
            sx={{
              flex: 1,
              minWidth: 0,
              p: 0.25,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              "& .MuiToggleButtonGroup-grouped": {
                border: "none",
              },
              "& .MuiToggleButton-root": {
                border: "none",
                borderRadius: 999,
                textTransform: "none",
                fontWeight: 600,
                flex: 1,
                minWidth: 0,
                color: "text.secondary",
                "&.Mui-selected": {
                  backgroundColor: "rgba(78,168,255,0.2)",
                  color: "primary.main",
                },
                "&.Mui-selected:hover": {
                  backgroundColor: "rgba(78,168,255,0.28)",
                },
              },
            }}
          >
            <ToggleButton value="id">Order</ToggleButton>
            <ToggleButton value="name">Name</ToggleButton>
          </ToggleButtonGroup>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 1,
              py: 0.5,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Thumbnails
            </Typography>
            <Switch
              size="small"
              checked={showThumbnails}
              onChange={(event) => setShowThumbnails(event.target.checked)}
            />
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 0.75,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        }}
      >
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteOutline />}
          disabled={isBlocked || selectedIds.length === 0}
          onClick={() => handleBulkAction(onDeleteImages)}
          fullWidth
        >
          Delete
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          disabled={isBlocked || selectedIds.length === 0}
          onClick={() => handleBulkAction(onClearAnnotations)}
          fullWidth
        >
          Clear Annotations
        </Button>
        {showOcrActions && (
          <>
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleOutline />}
              disabled={isBlocked || selectedIds.length === 0}
              onClick={() => handleValidationAction(true)}
              fullWidth
            >
              Validate
            </Button>
            <Button
              variant="outlined"
              color="success"
              startIcon={<CancelOutlined />}
              disabled={isBlocked || selectedIds.length === 0}
              onClick={() => handleValidationAction(false)}
              fullWidth
            >
              Unvalidate
            </Button>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<PlayArrow />}
              disabled={isBlocked || selectedIds.length === 0}
              onClick={() => handleBulkAction(onRunInference)}
              fullWidth
              sx={{ gridColumn: "1 / -1" }}
            >
              Run Inference On Selected Pages
            </Button>
          </>
        )}
      </Box>

      <Divider sx={{ opacity: 0.5 }} />

      <Box
        ref={containerRef}
        sx={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, overflow: "hidden" }}
      >
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No pages uploaded yet.
          </Typography>
        ) : (
          <VirtualList
            ref={listRef}
            height={containerHeight}
            itemCount={items.length}
            itemSize={rowHeight}
            width="100%"
            overscanCount={5}
          >
            {({ index: itemIndex, style }: ListChildComponentProps) => {
              const item = items[itemIndex];
              if (!item) {
                return <div style={style} />;
              }
              const { image, index, name } = item;
              const isSelected = selectedIds.includes(image.id);
              const isCurrent = index === currentIndex;
              return (
                <div style={style}>
                  <PageItem
                    image={image}
                    index={index}
                    name={name}
                    itemIndex={itemIndex}
                    isCurrent={isCurrent}
                    isSelected={isSelected}
                    isBlocked={isBlocked || false}
                    showThumbnails={showThumbnails}
                    showOcrActions={showOcrActions || false}
                    rowHeight={rowHeight}
                    onRowClick={handleRowClick}
                    onDeleteSingle={handleDeleteSingle}
                  />
                </div>
              );
            }}
          </VirtualList>
        )}
      </Box>
    </ResizablePanel>
  );
};

export default PagesPanel;
