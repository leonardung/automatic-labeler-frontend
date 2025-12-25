import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Typography } from "@mui/material";
import { Stage, Layer, Group, Line, Rect, Circle, Label as KonvaLabel, Tag, Text as KonvaText } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import useImageDisplay from "./useImageDisplay";
import type { ImageModel, OCRAnnotation, MaskCategory } from "../types";
import axiosInstance from "../axiosInstance";

type OCRTool = "rect" | "polygon" | "select";

interface ImageDisplayOCRProps {
  image: ImageModel;
  onImageUpdated?: (image: ImageModel) => void;
  disabled?: boolean;
  activeTool: OCRTool;
  showTextLabels?: boolean;
  endpointBase: string;
  categories: MaskCategory[];
  selectedShapeIds: string[];
  onSelectShapes: (ids: string[]) => void;
  onStartBlocking?: (message?: string) => void;
  onStopBlocking?: () => void;
  onRegisterViewportControls?: (controls: {
    zoomIn: () => void;
    zoomOut: () => void;
    toggleFit: () => void;
    fitMode: "inside" | "outside";
  }) => void;
}

const ImageDisplayOCR: React.FC<ImageDisplayOCRProps> = ({
  image,
  onImageUpdated,
  disabled,
  activeTool,
  selectedShapeIds,
  onSelectShapes,
  onStartBlocking,
  onStopBlocking,
  endpointBase,
  categories,
  showTextLabels = true,
  onRegisterViewportControls,
}) => {
  const {
    imageRef,
    containerRef,
    zoomLevel,
    panOffset,
    imgDimensions,
    isPanning,
    panKeyPressed,
    fitMode,
    zoomIn,
    zoomOut,
    toggleFitMode,
    handleMouseDown: handlePanMouseDown,
    handleMouseMove: handlePanMouseMove,
    handleMouseUp: handlePanMouseUp,
    calculateDisplayParams,
  } = useImageDisplay(image.image, {
    panModifierKey: "ctrl",
    wheelBehavior: "scrollPanCtrlZoom",
    wheelEnabled: !disabled,
  });

  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);
  const [draggedShapeId, setDraggedShapeId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [didMove, setDidMove] = useState(false);
  const [rectPreviewPoint, setRectPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  const [polygonPreviewPoint, setPolygonPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionPoint, setSelectionPoint] = useState<{ x: number; y: number } | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [localAnnotations, setLocalAnnotations] = useState<OCRAnnotation[]>(image.ocr_annotations || []);
  const clearDraftShape = useCallback(() => {
    setCurrentPoints([]);
    setRectPreviewPoint(null);
    setPolygonPreviewPoint(null);
    setDraggedPointIndex(null);
    setDraggedShapeId(null);
    setDragStart(null);
    setDidMove(false);
  }, []);

  const primarySelectedId = selectedShapeIds[0] || null;
  const categoryColorMap = useRef<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    categories.forEach((c) => {
      next[c.name] = c.color;
    });
    categoryColorMap.current = next;
  }, [categories]);

  useEffect(() => {
    setLocalAnnotations(image.ocr_annotations || []);
  }, [image.id, image.ocr_annotations]);

  useEffect(() => {
    const updateStageSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setStageSize({ width: rect.width, height: rect.height });
    };

    updateStageSize();

    const resizeObserver = new ResizeObserver(updateStageSize);

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    onRegisterViewportControls?.({
      zoomIn,
      zoomOut,
      toggleFit: toggleFitMode,
      fitMode,
    });
  }, [fitMode, onRegisterViewportControls, toggleFitMode, zoomIn, zoomOut]);

  const parseColor = (color?: string) => {
    if (!color) return { r: 128, g: 135, b: 148, a: 1 };
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      const val = parseInt(hex.length === 3 ? hex.repeat(2) : hex, 16);
      const r = (val >> 16) & 255;
      const g = (val >> 8) & 255;
      const b = val & 255;
      return { r, g, b, a: 1 };
    }
    const match = color.match(/rgba?\(([^)]+)\)/i);
    if (match) {
      const parts = match[1].split(",").map((p) => p.trim());
      const [r, g, b, a] = parts.map((v) => Number(v));
      return { r: r || 0, g: g || 0, b: b || 0, a: a ?? 1 };
    }
    return { r: 128, g: 135, b: 148, a: 1 };
  };

  const withAlpha = (color?: string, alpha = 0.25) => {
    const { r, g, b } = parseColor(color);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const flattenPoints = (points: { x: number; y: number }[]) => points.flatMap((p) => [p.x, p.y]);

  const getBounds = (points: { x: number; y: number }[]) => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  };

  const adjustRectPoints = (shape: OCRAnnotation, newCornerIndex: number, x: number, y: number) => {
    const oppositeIndex = (newCornerIndex + 2) % 4;
    const opposite = shape.points[oppositeIndex] || { x, y };

    const leftX = Math.min(x, opposite.x);
    const rightX = Math.max(x, opposite.x);
    const topY = Math.min(y, opposite.y);
    const bottomY = Math.max(y, opposite.y);

    const draggedIsLeft = x <= opposite.x;
    const draggedIsTop = y <= opposite.y;

    const corners = {
      tl: { x: leftX, y: topY },
      tr: { x: rightX, y: topY },
      br: { x: rightX, y: bottomY },
      bl: { x: leftX, y: bottomY },
    };

    const rolesOrder = ["tl", "tr", "br", "bl"] as const;
    const draggedRole = draggedIsLeft ? (draggedIsTop ? "tl" : "bl") : draggedIsTop ? "tr" : "br";
    const oppositeRole =
      draggedRole === "tl" ? "br" : draggedRole === "tr" ? "bl" : draggedRole === "br" ? "tl" : "tr";
    const remainingRoles = rolesOrder.filter((r) => r !== draggedRole && r !== oppositeRole);

    const roleAssignments: (typeof rolesOrder[number])[] = new Array(4);
    roleAssignments[newCornerIndex] = draggedRole;
    roleAssignments[oppositeIndex] = oppositeRole;

    let remIdx = 0;
    for (let i = 0; i < 4; i += 1) {
      if (!roleAssignments[i]) {
        roleAssignments[i] = remainingRoles[remIdx];
        remIdx += 1;
      }
    }

    return roleAssignments.map((role) => corners[role]);
  };

  const screenToImage = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - panOffset.x) / zoomLevel;
    const y = (clientY - rect.top - panOffset.y) / zoomLevel;
    return { x, y };
  };

  const updateLocalShape = (id: string, updates: Partial<OCRAnnotation>) => {
    setLocalAnnotations((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const saveShape = async (shape: Partial<OCRAnnotation>) => {
    if (!image.id) return;
    try {
      const payload = { shapes: [shape] };
      const response = await axiosInstance.post(`${endpointBase}/${image.id}/ocr_annotations/`, payload);
      const savedShapes = (response.data.shapes as OCRAnnotation[]) || [];
      const savedShape = savedShapes[0];

      if (!savedShape) return;

      setLocalAnnotations((prev) => {
        const next = [...prev];
        const existingIndex = next.findIndex((s) => s.id === savedShape.id);
        if (existingIndex >= 0) {
          next[existingIndex] = savedShape;
        } else {
          next.push(savedShape);
        }
        onImageUpdated?.({ ...image, ocr_annotations: next });
        return next;
      });
      onSelectShapes(savedShape.id ? [savedShape.id] : []);
    } catch (error) {
      console.error("Error saving shape:", error);
    }
  };

  const deleteShape = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      try {
        await axiosInstance.delete(`${endpointBase}/${image.id}/ocr_annotations/`, { data: { ids } });
        const toDelete = new Set(ids);
        setLocalAnnotations((prev) => {
          const next = prev.filter((s) => !toDelete.has(s.id));
          onImageUpdated?.({ ...image, ocr_annotations: next });
          return next;
        });
        onSelectShapes([]);
      } catch (error) {
        console.error("Error deleting shape:", error);
      }
    },
    [endpointBase, image.id, onImageUpdated, onSelectShapes]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    if (panKeyPressed || e.ctrlKey || e.metaKey) {
      handlePanMouseDown(e as any);
      return;
    }

    const { x, y } = screenToImage(e.clientX, e.clientY);

    if (activeTool === "rect") {
      if (currentPoints.length === 0) {
        setCurrentPoints([{ x, y }]);
        setRectPreviewPoint({ x, y });
      } else {
        const start = currentPoints[0];
        const newShape: Partial<OCRAnnotation> = {
          type: "rect",
          points: [
            { x: start.x, y: start.y },
            { x, y: start.y },
            { x, y },
            { x: start.x, y },
          ],
          text: "",
          category: null,
        };
        saveShape(newShape);
        setCurrentPoints([]);
        setRectPreviewPoint(null);
      }
    } else if (activeTool === "polygon") {
      setCurrentPoints((prev) => [...prev, { x, y }]);
    } else if (activeTool === "select") {
      if (!draggedShapeId && !draggedPointIndex) {
        if (e.ctrlKey || e.metaKey) {
          return;
        }
        setSelectionStart({ x, y });
        setSelectionPoint({ x, y });
        onSelectShapes([]);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (disabled) return;
    if (isPanning) {
      handlePanMouseMove(e as any);
      return;
    }

    const { x, y } = screenToImage(e.clientX, e.clientY);

    if (activeTool === "select" && selectionStart) {
      setSelectionPoint({ x, y });
    }

    if (activeTool === "rect" && currentPoints.length === 1) {
      setRectPreviewPoint({ x, y });
    }
    if (
      activeTool === "polygon" &&
      currentPoints.length > 0 &&
      draggedPointIndex === null &&
      !draggedShapeId
    ) {
      setPolygonPreviewPoint({ x, y });
    }

    if (draggedPointIndex !== null && primarySelectedId) {
      const shape = localAnnotations.find((s) => s.id === primarySelectedId);
      if (shape) {
        const newPoints =
          shape.type === "rect"
            ? adjustRectPoints(shape as OCRAnnotation, draggedPointIndex, x, y)
            : shape.points.map((p, idx) => (idx === draggedPointIndex ? { x, y } : p));
        updateLocalShape(primarySelectedId, { points: newPoints });
        setDidMove(true);
      }
    } else if (draggedShapeId && dragStart) {
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;
      const shape = localAnnotations.find((s) => s.id === draggedShapeId);
      if (shape) {
        const newPoints = shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        updateLocalShape(draggedShapeId, { points: newPoints });
        setDragStart({ x, y });
        setDidMove(true);
      }
    }
  };

  const handleMouseUp = () => {
    if (disabled) return;
    if (isPanning) {
      handlePanMouseUp();
      return;
    }

    if (activeTool === "select" && selectionStart && selectionPoint) {
      const selMinX = Math.min(selectionStart.x, selectionPoint.x);
      const selMaxX = Math.max(selectionStart.x, selectionPoint.x);
      const selMinY = Math.min(selectionStart.y, selectionPoint.y);
      const selMaxY = Math.max(selectionStart.y, selectionPoint.y);
      const ids =
        localAnnotations
          ?.filter((shape) => {
            const xs = shape.points.map((p) => p.x);
            const ys = shape.points.map((p) => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const intersects =
              selMaxX >= minX && selMinX <= maxX && selMaxY >= minY && selMinY <= maxY;
            return intersects;
          })
          .map((s) => s.id) || [];
      onSelectShapes(ids);
    }

    if ((draggedPointIndex !== null || draggedShapeId) && didMove) {
      const id = primarySelectedId || draggedShapeId;
      if (id) {
        const shape = localAnnotations.find((s) => s.id === id);
        if (shape) {
          saveShape(shape);
        }
      }
    }

    setDraggedPointIndex(null);
    setDraggedShapeId(null);
    setDragStart(null);
    setDidMove(false);
    if (activeTool !== "rect" || currentPoints.length === 0) {
      setRectPreviewPoint(null);
    }
    if (activeTool !== "polygon") {
      setPolygonPreviewPoint(null);
    }
    setSelectionStart(null);
    setSelectionPoint(null);
  };

  const handleDoubleClick = () => {
    if (activeTool === "polygon" && currentPoints.length > 2) {
      const newShape: Partial<OCRAnnotation> = {
        type: "polygon",
        points: currentPoints,
        text: "",
        category: null,
      };
      saveShape(newShape);
      setCurrentPoints([]);
      setPolygonPreviewPoint(null);
    }
  };

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (disabled) return;
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isEditable =
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target?.getAttribute("contenteditable") === "true";

      if (isEditable) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteShape(selectedShapeIds);
      }
    },
    [deleteShape, disabled, selectedShapeIds]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const handleDocMouseDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      if (currentPoints.length > 0) {
        clearDraftShape();
      }
    };
    document.addEventListener("mousedown", handleDocMouseDown, true);
    return () => document.removeEventListener("mousedown", handleDocMouseDown, true);
  }, [currentPoints.length, clearDraftShape]);

  const renderHelperText = () => {
    if (activeTool === "rect") return "Click start and end points for rectangle.";
    if (activeTool === "polygon") return "Click points. Double click to finish.";
    return "Click or drag to select. Ctrl + Drag to move. Drag corners to resize. Del to delete.";
  };

  const stageWidth = Math.max(stageSize.width, 1);
  const stageHeight = Math.max(stageSize.height, 1);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: activeTool === "select" ? "default" : "crosshair",
        userSelect: "none",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
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
          pointerEvents: "none",
        }}
      />

      <Stage
        width={stageWidth}
        height={stageHeight}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        <Layer
          scaleX={zoomLevel}
          scaleY={zoomLevel}
          x={panOffset.x}
          y={panOffset.y}
          listening={!disabled}
        >
          {localAnnotations.map((shape) => {
            const isSelected = selectedShapeIds.includes(shape.id);
            const bounds = getBounds(shape.points);
            const rawColor = categoryColorMap.current[shape.category || ""] || null;
            const hasCategory = Boolean(rawColor);
            const baseColor = hasCategory && rawColor ? rawColor : undefined;
            const fillColor = isSelected
              ? "rgba(0,255,0,0.50)"
              : withAlpha(baseColor || "rgba(128,135,148,1)", hasCategory ? 0.32 : 0.08);
            const strokeColor = isSelected ? "rgba(0,128,0,0.85)" : withAlpha(baseColor, 0.9);
            const labelColor = strokeColor || "rgba(64,70,80,0.85)";
            const handleShapeMouseDown = (evt: KonvaEventObject<MouseEvent>) => {
              if (disabled || activeTool !== "select") return;
              evt.cancelBubble = true;
              evt.evt.stopPropagation();
              const toggle = evt.evt.ctrlKey || evt.evt.metaKey;
              let nextIds = selectedShapeIds;
              if (toggle) {
                nextIds = selectedShapeIds.includes(shape.id)
                  ? selectedShapeIds.filter((id) => id !== shape.id)
                  : [...selectedShapeIds, shape.id];
              } else {
                nextIds = [shape.id];
              }
              onSelectShapes(nextIds);
              setDraggedShapeId(shape.id);
              const { x, y } = screenToImage(evt.evt.clientX, evt.evt.clientY);
              setDragStart({ x, y });
              setDidMove(false);
            };
            const shapePoints = flattenPoints(shape.points);

            return (
              <Group key={shape.id}>
                {shape.type === "rect" ? (
                  <Rect
                    x={bounds.minX}
                    y={bounds.minY}
                    width={bounds.width}
                    height={bounds.height}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={2 / zoomLevel}
                    onMouseDown={handleShapeMouseDown}
                    perfectDrawEnabled={false}
                  />
                ) : (
                  <Line
                    points={shapePoints}
                    closed
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={2 / zoomLevel}
                    onMouseDown={handleShapeMouseDown}
                    perfectDrawEnabled={false}
                  />
                )}
                {showTextLabels && shape.text && (
                  <Group
                    x={bounds.minX}
                    y={bounds.minY - 22 / zoomLevel}
                    scaleX={1 / zoomLevel}
                    scaleY={1 / zoomLevel}
                    listening={false}
                  >
                    <KonvaLabel>
                      <Tag fill={labelColor} cornerRadius={4} />
                      <KonvaText text={shape.text} fontSize={13} padding={6} fill="#fff" />
                    </KonvaLabel>
                  </Group>
                )}
                {isSelected &&
                  shape.points.map((p, idx) => (
                    <Circle
                      key={idx}
                      x={p.x}
                      y={p.y}
                      radius={4 / zoomLevel}
                      fill="white"
                      stroke="black"
                      strokeWidth={1 / zoomLevel}
                      onMouseDown={(evt) => {
                        if (activeTool === "select") {
                          evt.cancelBubble = true;
                          evt.evt.stopPropagation();
                          setDraggedPointIndex(idx);
                          setDraggedShapeId(shape.id);
                          setDidMove(false);
                        }
                      }}
                    />
                  ))}
              </Group>
            );
          })}

          {currentPoints.length > 0 && (
            <Group listening={false}>
              {activeTool === "rect" && currentPoints.length === 1 && (
                <>
                  {rectPreviewPoint && (
                    <Rect
                      x={Math.min(currentPoints[0].x, rectPreviewPoint.x)}
                      y={Math.min(currentPoints[0].y, rectPreviewPoint.y)}
                      width={Math.abs(currentPoints[0].x - rectPreviewPoint.x)}
                      height={Math.abs(currentPoints[0].y - rectPreviewPoint.y)}
                      fill="rgba(255,0,0,0.12)"
                      stroke="red"
                      strokeWidth={2 / zoomLevel}
                      perfectDrawEnabled={false}
                    />
                  )}
                  <Circle x={currentPoints[0].x} y={currentPoints[0].y} radius={3 / zoomLevel} fill="red" />
                </>
              )}
              {activeTool === "polygon" && (
                <>
                  <Line
                    points={flattenPoints([...currentPoints, ...(polygonPreviewPoint ? [polygonPreviewPoint] : [])])}
                    closed={false}
                    fillEnabled={false}
                    stroke="red"
                    strokeWidth={2 / zoomLevel}
                    perfectDrawEnabled={false}
                  />
                  {[...currentPoints, ...(polygonPreviewPoint ? [polygonPreviewPoint] : [])].map((p, idx) => (
                    <Circle key={idx} x={p.x} y={p.y} radius={3 / zoomLevel} fill="red" />
                  ))}
                </>
              )}
            </Group>
          )}
          {activeTool === "select" && selectionStart && selectionPoint && (
            <Rect
              x={Math.min(selectionStart.x, selectionPoint.x)}
              y={Math.min(selectionStart.y, selectionPoint.y)}
              width={Math.abs(selectionStart.x - selectionPoint.x)}
              height={Math.abs(selectionStart.y - selectionPoint.y)}
              fill="rgba(96,165,250,0.15)"
              stroke="rgba(96,165,250,0.8)"
              strokeWidth={1 / zoomLevel}
              dash={[4, 3]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      <Box
        sx={{
          position: "absolute",
          bottom: 10,
          left: 10,
          bgcolor: "rgba(0,0,0,0.55)",
          color: "white",
          p: 1,
          borderRadius: 1,
        }}
      >
        <Typography variant="caption">{renderHelperText()}</Typography>
      </Box>
    </div>
  );
};

export default ImageDisplayOCR;
