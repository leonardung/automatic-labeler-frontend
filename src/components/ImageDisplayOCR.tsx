import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import GestureIcon from "@mui/icons-material/Gesture";
import PanToolAltIcon from "@mui/icons-material/PanToolAlt";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import useImageDisplay from "./useImageDisplay";
import type { ImageModel, OcrPoint, OcrShape, ProjectType } from "../types";

type InteractionMode = "select" | "rect" | "polygon";

interface ImageDisplayOCRProps {
  image: ImageModel;
  shapes: OcrShape[];
  selectedShapeId: string | null;
  projectType: ProjectType;
  disabled?: boolean;
  onShapesChange: (imageId: number, shapes: OcrShape[]) => void;
  onSelectShape?: (shapeId: string | null) => void;
}

const shapeColor = "#5ad8ff";
const selectedColor = "#ffaf45";

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `shape-${Date.now()}-${Math.random().toString(16).slice(2)}`);

const normalizeRectPoints = (start: OcrPoint, end: OcrPoint): OcrPoint[] => {
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxX = Math.max(start.x, end.x);
  const maxY = Math.max(start.y, end.y);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
};

const pointInPolygon = (points: OcrPoint[], x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const ImageDisplayOCR: React.FC<ImageDisplayOCRProps> = ({
  image,
  shapes,
  selectedShapeId,
  projectType,
  disabled,
  onShapesChange,
  onSelectShape,
}) => {
  const {
    imageRef,
    containerRef,
    zoomLevel,
    panOffset,
    imgDimensions,
    isPanning,
    ShiftKeyPress,
    keepZoomPan,
    handleToggleChange,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    calculateDisplayParams,
  } = useImageDisplay(image.image);

  const [mode, setMode] = useState<InteractionMode>("select");
  const [draftRect, setDraftRect] = useState<{ start: OcrPoint; end: OcrPoint } | null>(null);
  const [draftPolygon, setDraftPolygon] = useState<OcrPoint[]>([]);
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null);
  const [draggingVertex, setDraggingVertex] = useState<{ shapeId: string; index: number } | null>(
    null
  );
  const dragStartRef = useRef<OcrPoint | null>(null);

  const currentSelection = useMemo(
    () => shapes.find((s) => s.id === selectedShapeId) || null,
    [selectedShapeId, shapes]
  );

  useEffect(() => {
    setMode("select");
    setDraftRect(null);
    setDraftPolygon([]);
    setDraggingShapeId(null);
    setDraggingVertex(null);
  }, [image.id]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (disabled) return;
      if (event.key === "Escape") {
        setDraftRect(null);
        setDraftPolygon([]);
        setDraggingShapeId(null);
        setDraggingVertex(null);
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (currentSelection) {
          const updated = shapes.filter((s) => s.id !== currentSelection.id);
          onShapesChange(image.id, updated);
          onSelectShape?.(null);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentSelection, disabled, image.id, onSelectShape, onShapesChange, shapes]);

  const toImageCoords = (clientX: number, clientY: number): OcrPoint | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - panOffset.x) / zoomLevel;
    const y = (clientY - rect.top - panOffset.y) / zoomLevel;
    if (x < 0 || y < 0 || x > imgDimensions.width || y > imgDimensions.height) return null;
    return { x, y };
  };

  const toDisplayCoords = (pt: OcrPoint) => ({
    x: pt.x * zoomLevel + panOffset.x,
    y: pt.y * zoomLevel + panOffset.y,
  });

  const handleShapeSelect = (shapeId: string | null) => {
    onSelectShape?.(shapeId);
    setDraggingShapeId(null);
    setDraggingVertex(null);
  };

  const finalizeRect = () => {
    if (!draftRect) return;
    const rectPoints = normalizeRectPoints(draftRect.start, draftRect.end);
    const shape: OcrShape = {
      id: newId(),
      type: "rect",
      points: rectPoints,
      text: "",
      category: null,
    };
    onShapesChange(image.id, [...shapes, shape]);
    handleShapeSelect(shape.id);
    setDraftRect(null);
  };

  const finalizePolygon = () => {
    if (draftPolygon.length < 3) {
      setDraftPolygon([]);
      return;
    }
    const shape: OcrShape = {
      id: newId(),
      type: "polygon",
      points: draftPolygon,
      text: "",
      category: null,
    };
    onShapesChange(image.id, [...shapes, shape]);
    handleShapeSelect(shape.id);
    setDraftPolygon([]);
  };

  const hitTest = (imgX: number, imgY: number): OcrShape | null => {
    for (let i = shapes.length - 1; i >= 0; i -= 1) {
      const shape = shapes[i];
      if (pointInPolygon(shape.points, imgX, imgY)) {
        return shape;
      }
    }
    return null;
  };

  const startVertexDrag = (shapeId: string, index: number) => {
    setDraggingVertex({ shapeId, index });
  };

  const updateVertex = (coords: OcrPoint) => {
    if (!draggingVertex) return;
    const { shapeId, index } = draggingVertex;
    const target = shapes.find((s) => s.id === shapeId);
    if (!target) return;
    const updated = shapes.map((s) => {
      if (s.id !== shapeId) return s;
      if (s.type === "rect") {
        const oppositeIndex = (index + 2) % 4;
        const opposite = s.points[oppositeIndex];
        const rectPoints = normalizeRectPoints(coords, opposite);
        return { ...s, points: rectPoints };
      }
      const points = s.points.map((pt, i) => (i === index ? coords : pt));
      return { ...s, points };
    });
    onShapesChange(image.id, updated);
  };

  const startShapeDrag = (shapeId: string, coords: OcrPoint) => {
    setDraggingShapeId(shapeId);
    dragStartRef.current = coords;
  };

  const updateShapeDrag = (coords: OcrPoint) => {
    if (!draggingShapeId || !dragStartRef.current) return;
    const deltaX = coords.x - dragStartRef.current.x;
    const deltaY = coords.y - dragStartRef.current.y;
    dragStartRef.current = coords;
    const updated = shapes.map((s) =>
      s.id !== draggingShapeId
        ? s
        : {
            ...s,
            points: s.points.map((pt) => ({ x: pt.x + deltaX, y: pt.y + deltaY })),
          }
    );
    onShapesChange(image.id, updated);
  };

  const handleContainerMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.shiftKey) {
      handleMouseDown(event);
      return;
    }
    const coords = toImageCoords(event.clientX, event.clientY);
    if (!coords) return;

    if (mode === "rect" && event.button === 0) {
      setDraftRect({ start: coords, end: coords });
      handleShapeSelect(null);
      return;
    }

    if (mode === "polygon" && event.button === 0) {
      if (event.detail >= 2 && draftPolygon.length >= 2) {
        finalizePolygon();
        return;
      }
      if (draftPolygon.length >= 3) {
        const first = draftPolygon[0];
        const closeEnough =
          Math.hypot(first.x - coords.x, first.y - coords.y) <
          Math.max(6 / zoomLevel, 4);
        if (closeEnough) {
          finalizePolygon();
          return;
        }
      }
      setDraftPolygon((prev) => [...prev, coords]);
      return;
    }

    const hit = hitTest(coords.x, coords.y);
    if (hit) {
      handleShapeSelect(hit.id);
      startShapeDrag(hit.id, coords);
    } else {
      handleShapeSelect(null);
    }
  };

  const handleContainerMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (isPanning) {
      handleMouseMove(event);
      return;
    }
    const coords = toImageCoords(event.clientX, event.clientY);
    if (!coords) return;

    if (draftRect) {
      setDraftRect({ start: draftRect.start, end: coords });
      return;
    }

    if (draggingVertex) {
      updateVertex(coords);
      return;
    }

    if (draggingShapeId) {
      updateShapeDrag(coords);
    }
  };

  const handleContainerMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (isPanning) {
      handleMouseUp();
      return;
    }
    if (draftRect && event.button === 0) {
      finalizeRect();
    }
    setDraggingShapeId(null);
    setDraggingVertex(null);
  };

  const renderShapeLabel = (shape: OcrShape) => {
    const centroid = shape.points.reduce(
      (acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }),
      { x: 0, y: 0 }
    );
    const cx = centroid.x / shape.points.length;
    const cy = centroid.y / shape.points.length;
    const { x, y } = toDisplayCoords({ x: cx, y: cy });
    const text = shape.text || "No text";
    return (
      <Box
        key={`label-${shape.id}`}
        sx={{
          position: "absolute",
          left: x,
          top: y,
          transform: "translate(-50%, -50%)",
          backgroundColor: "rgba(3,7,18,0.7)",
          color: "white",
          borderRadius: "8px",
          px: 1,
          py: 0.5,
          fontSize: 12,
          pointerEvents: "none",
          border: `1px solid ${shape.id === selectedShapeId ? selectedColor : "rgba(255,255,255,0.2)"}`,
        }}
      >
        {text}
      </Box>
    );
  };

  const renderHandles = (shape: OcrShape) => {
    if (selectedShapeId !== shape.id) return null;
    return shape.points.map((pt, idx) => {
      const { x, y } = toDisplayCoords(pt);
      return (
        <circle
          key={`${shape.id}-handle-${idx}`}
          cx={x}
          cy={y}
          r={6}
          fill={selectedColor}
          stroke="#0b1022"
          strokeWidth={2}
          style={{ cursor: "grab" }}
          onMouseDown={(e) => {
            e.stopPropagation();
            if (disabled) return;
            const coords = toImageCoords(e.clientX, e.clientY);
            if (!coords) return;
            startVertexDrag(shape.id, idx);
          }}
        />
      );
    });
  };

  return (
    <Box position="relative" width="100%" height="100%">
      <Box
        sx={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 3,
          display: "flex",
          gap: 1,
          alignItems: "center",
          backgroundColor: "rgba(9,13,26,0.7)",
          borderRadius: 2,
          padding: "6px 10px",
          border: "1px solid rgba(90,216,255,0.35)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
        }}
      >
        <ButtonGroup size="small" variant="outlined">
          <Button
            startIcon={<PanToolAltIcon />}
            onClick={() => setMode("select")}
            color={mode === "select" ? "primary" : "inherit"}
            disabled={disabled}
          >
            Select/Move
          </Button>
          <Button
            startIcon={<CropSquareIcon />}
            onClick={() => setMode("rect")}
            color={mode === "rect" ? "primary" : "inherit"}
            disabled={disabled}
          >
            Rectangle
          </Button>
          <Button
            startIcon={<GestureIcon />}
            onClick={() => setMode("polygon")}
            color={mode === "polygon" ? "primary" : "inherit"}
            disabled={disabled}
          >
            Polygon
          </Button>
        </ButtonGroup>
        <Chip
          size="small"
          color={keepZoomPan ? "success" : "default"}
          label={keepZoomPan ? "Zoom/Pan locked" : "Zoom resets on change"}
          onClick={handleToggleChange}
          sx={{ cursor: "pointer" }}
        />
        {currentSelection && (
          <Tooltip title="Delete selected shape">
            <IconButton
              size="small"
              color="secondary"
              onClick={() => {
                const updated = shapes.filter((s) => s.id !== currentSelection.id);
                onShapesChange(image.id, updated);
                handleShapeSelect(null);
              }}
              disabled={disabled}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {draftPolygon.length > 0 && (
          <Tooltip title="Finish polygon">
            <IconButton size="small" color="primary" onClick={finalizePolygon} disabled={disabled}>
              <CheckCircleIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          cursor: disabled
            ? "not-allowed"
            : ShiftKeyPress
              ? isPanning
                ? "grabbing"
                : "grab"
              : mode === "rect" || mode === "polygon"
                ? "crosshair"
                : "default",
        }}
        onWheel={disabled ? undefined : handleWheel}
        onMouseDown={handleContainerMouseDown}
        onMouseMove={handleContainerMouseMove}
        onMouseUp={handleContainerMouseUp}
        onMouseLeave={() => {
          setDraftRect(null);
          setDraggingShapeId(null);
          setDraggingVertex(null);
          handleMouseUp();
        }}
      >
        <img
          ref={imageRef}
          src={image.image}
          alt="OCR"
          onLoad={calculateDisplayParams}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${imgDimensions.width}px`,
            height: `${imgDimensions.height}px`,
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
            transformOrigin: "0 0",
            userSelect: "none",
            pointerEvents: "none",
          }}
        />

        <svg
          width={imgDimensions.width}
          height={imgDimensions.height}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
            transformOrigin: "0 0",
            pointerEvents: "auto",
          }}
        >
          {shapes.map((shape) => (
            <g key={shape.id}>
              <polygon
                points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={shape.id === selectedShapeId ? "rgba(255,175,69,0.18)" : "rgba(90,216,255,0.18)"}
                stroke={shape.id === selectedShapeId ? selectedColor : shapeColor}
                strokeWidth={shape.id === selectedShapeId ? 2.2 : 1.5}
                onMouseDown={(e) => {
                  if (disabled) return;
                  e.stopPropagation();
                  const coords = toImageCoords(e.clientX, e.clientY);
                  if (!coords) return;
                  handleShapeSelect(shape.id);
                  startShapeDrag(shape.id, coords);
                }}
                style={{ cursor: "grab", pointerEvents: "all" }}
              />
              {renderHandles(shape)}
            </g>
          ))}
          {draftRect && (
            <polygon
              points={normalizeRectPoints(draftRect.start, draftRect.end)
                .map((p) => `${p.x},${p.y}`)
                .join(" ")}
              fill="rgba(255,255,255,0.08)"
              stroke={shapeColor}
              strokeDasharray="6 4"
              strokeWidth={1.4}
            />
          )}
          {draftPolygon.length > 0 && (
            <>
              <polyline
                points={draftPolygon.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgba(90,216,255,0.12)"
                stroke={shapeColor}
                strokeDasharray="6 4"
                strokeWidth={1.4}
              />
              {draftPolygon.map((pt, idx) => {
                const { x, y } = toDisplayCoords(pt);
                return (
                  <circle
                    key={`draft-${idx}`}
                    cx={x}
                    cy={y}
                    r={4.5}
                    fill={shapeColor}
                    stroke="#0b1022"
                    strokeWidth={1.5}
                    style={{ pointerEvents: "none" }}
                  />
                );
              })}
            </>
          )}
        </svg>

        {shapes.map((shape) => renderShapeLabel(shape))}
      </div>

      <Box
        sx={{
          position: "absolute",
          bottom: 12,
          left: 16,
          zIndex: 3,
          px: 1.5,
          py: 1,
          borderRadius: 1.5,
          backgroundColor: "rgba(15,22,36,0.7)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.8)",
          display: "flex",
          alignItems: "center",
          gap: 2,
          fontSize: 12,
        }}
      >
        <Typography variant="caption" sx={{ letterSpacing: 0.4 }}>
          Shift + drag to pan • Scroll to zoom • Double click to finish polygon
        </Typography>
        {projectType === "ocr_kie" && (
          <Chip size="small" color="secondary" label="KIE mode" sx={{ fontWeight: 600 }} />
        )}
      </Box>
    </Box>
  );
};

export default ImageDisplayOCR;
