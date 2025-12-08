import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Typography } from "@mui/material";
import useImageDisplay from "./useImageDisplay";
import type { ImageModel, OCRAnnotation } from "../types";
import axiosInstance from "../axiosInstance";

type OCRTool = "rect" | "polygon" | "select";

interface ImageDisplayOCRProps {
  image: ImageModel;
  onImageUpdated?: (image: ImageModel) => void;
  disabled?: boolean;
  activeTool: OCRTool;
  endpointBase: string;
  selectedShapeId: string | null;
  onSelectShape: (id: string | null) => void;
  onStartBlocking?: (message?: string) => void;
  onStopBlocking?: () => void;
}

const ImageDisplayOCR: React.FC<ImageDisplayOCRProps> = ({
  image,
  onImageUpdated,
  disabled,
  activeTool,
  selectedShapeId,
  onSelectShape,
  onStartBlocking,
  onStopBlocking,
  endpointBase,
}) => {
  const {
    imageRef,
    containerRef,
    zoomLevel,
    panOffset,
    imgDimensions,
    isPanning,
    ShiftKeyPress,
    handleWheel,
    handleMouseDown: handlePanMouseDown,
    handleMouseMove: handlePanMouseMove,
    handleMouseUp: handlePanMouseUp,
    calculateDisplayParams,
  } = useImageDisplay(image.image);

  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);
  const [draggedShapeId, setDraggedShapeId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [didMove, setDidMove] = useState(false);
  const [rectPreviewPoint, setRectPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  const [polygonPreviewPoint, setPolygonPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  const clearDraftShape = useCallback(() => {
    setCurrentPoints([]);
    setRectPreviewPoint(null);
    setPolygonPreviewPoint(null);
    setDraggedPointIndex(null);
    setDraggedShapeId(null);
    setDragStart(null);
    setDidMove(false);
  }, []);

  const svgRef = useRef<SVGSVGElement | null>(null);

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
    if (!onImageUpdated) return;
    const newAnnotations = image.ocr_annotations?.map((s) => (s.id === id ? { ...s, ...updates } : s)) || [];
    onImageUpdated({ ...image, ocr_annotations: newAnnotations });
  };

  const saveShape = async (shape: Partial<OCRAnnotation>) => {
    if (!image.id) return;
    try {
      const payload = { shapes: [shape] };
      const response = await axiosInstance.post(`${endpointBase}/${image.id}/ocr_annotations/`, payload);
      const savedShapes = (response.data.shapes as OCRAnnotation[]) || [];
      const savedShape = savedShapes[0];

      const newAnnotations = [...(image.ocr_annotations || [])];
      const existingIndex = newAnnotations.findIndex((s) => s.id === savedShape.id);
      if (existingIndex >= 0) {
        newAnnotations[existingIndex] = savedShape;
      } else {
        newAnnotations.push(savedShape);
      }

      onImageUpdated?.({ ...image, ocr_annotations: newAnnotations });
      onSelectShape(savedShape?.id || null);
    } catch (error) {
      console.error("Error saving shape:", error);
    }
  };

  const deleteShape = useCallback(
    async (id: string) => {
      try {
        await axiosInstance.delete(`${endpointBase}/${image.id}/ocr_annotations/`, { data: { ids: [id] } });
        const newAnnotations = image.ocr_annotations?.filter((s) => s.id !== id) || [];
        onImageUpdated?.({ ...image, ocr_annotations: newAnnotations });
        if (selectedShapeId === id) {
          onSelectShape(null);
        }
      } catch (error) {
        console.error("Error deleting shape:", error);
      }
    },
    [image.id, image.ocr_annotations, onImageUpdated, onSelectShape, selectedShapeId]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    if (ShiftKeyPress) {
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
        onSelectShape(null);
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

    if (draggedPointIndex !== null && selectedShapeId) {
      const shape = image.ocr_annotations?.find((s) => s.id === selectedShapeId);
      if (shape) {
        const newPoints =
          shape.type === "rect"
            ? adjustRectPoints(shape as OCRAnnotation, draggedPointIndex, x, y)
            : shape.points.map((p, idx) => (idx === draggedPointIndex ? { x, y } : p));
        updateLocalShape(selectedShapeId, { points: newPoints });
        setDidMove(true);
      }
    } else if (draggedShapeId && dragStart) {
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;
      const shape = image.ocr_annotations?.find((s) => s.id === draggedShapeId);
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

    if ((draggedPointIndex !== null || draggedShapeId) && didMove) {
      const id = selectedShapeId || draggedShapeId;
      if (id) {
        const shape = image.ocr_annotations?.find((s) => s.id === id);
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

  useEffect(() => {
    if (activeTool !== "rect") {
      setRectPreviewPoint(null);
    }
    if (activeTool !== "polygon") {
      setPolygonPreviewPoint(null);
    }
  }, [activeTool]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearDraftShape();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedShapeId) {
          deleteShape(selectedShapeId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedShapeId, deleteShape, clearDraftShape]);

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
    return "Click to select. Drag to move. Drag corners to resize. Del to delete.";
  };

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
      onWheel={handleWheel}
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

      <svg
        ref={svgRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`}>
          {image.ocr_annotations?.map((shape) => {
            const isSelected = shape.id === selectedShapeId;
            const pointsStr = shape.points.map((p) => `${p.x},${p.y}`).join(" ");
            return (
              <g key={shape.id} style={{ pointerEvents: "all" }}>
                <polygon
                  points={pointsStr}
                  fill={isSelected ? "rgba(0, 255, 0, 0.2)" : "rgba(0, 0, 255, 0.1)"}
                  stroke={isSelected ? "green" : "blue"}
                  strokeWidth={2 / zoomLevel}
                  onMouseDown={(e) => {
                    if (activeTool === "select") {
                      e.stopPropagation();
                      onSelectShape(shape.id);
                      setDraggedShapeId(shape.id);
                      const { x, y } = screenToImage(e.clientX, e.clientY);
                      setDragStart({ x, y });
                      setDidMove(false);
                    }
                  }}
                />
                {isSelected &&
                  shape.points.map((p, idx) => (
                    <circle
                      key={idx}
                      cx={p.x}
                      cy={p.y}
                      r={4 / zoomLevel}
                      fill="white"
                      stroke="black"
                      strokeWidth={1 / zoomLevel}
                      style={{ cursor: "pointer" }}
                      onMouseDown={(e) => {
                        if (activeTool === "select") {
                          e.stopPropagation();
                          setDraggedPointIndex(idx);
                          setDraggedShapeId(shape.id);
                          setDidMove(false);
                        }
                      }}
                    />
                  ))}
              </g>
            );
          })}

          {currentPoints.length > 0 && (
            <g style={{ pointerEvents: "none" }}>
              {activeTool === "rect" && currentPoints.length === 1 && (
                <>
                  {rectPreviewPoint && (
                    <polygon
                      points={`${currentPoints[0].x},${currentPoints[0].y} ${rectPreviewPoint.x},${currentPoints[0].y} ${rectPreviewPoint.x},${rectPreviewPoint.y} ${currentPoints[0].x},${rectPreviewPoint.y}`}
                      fill="rgba(255,0,0,0.12)"
                      stroke="red"
                      strokeWidth={2 / zoomLevel}
                    />
                  )}
                  <circle cx={currentPoints[0].x} cy={currentPoints[0].y} r={3 / zoomLevel} fill="red" />
                </>
              )}
              {activeTool === "polygon" && (
                <>
                  <polyline
                    points={[...currentPoints, ...(polygonPreviewPoint ? [polygonPreviewPoint] : [])]
                      .map((p) => `${p.x},${p.y}`)
                      .join(" ")}
                    fill="none"
                    stroke="red"
                    strokeWidth={2 / zoomLevel}
                  />
                  {[...currentPoints, ...(polygonPreviewPoint ? [polygonPreviewPoint] : [])].map((p, idx) => (
                    <circle key={idx} cx={p.x} cy={p.y} r={3 / zoomLevel} fill="red" />
                  ))}
                </>
              )}
            </g>
          )}
        </g>
      </svg>

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
