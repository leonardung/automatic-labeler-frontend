import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Typography } from "@mui/material";
import useImageDisplay from "./useImageDisplay";
import type { ImageModel, OCRAnnotation } from "../types";
import axiosInstance from "../axiosInstance";

interface ImageDisplayOCRProps {
  image: ImageModel;
  onImageUpdated?: (image: ImageModel) => void;
  disabled?: boolean;
  activeTool: "rect" | "polygon" | "select";
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

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Helper to convert screen coordinates to image coordinates
  const screenToImage = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - panOffset.x) / zoomLevel;
    const y = (clientY - rect.top - panOffset.y) / zoomLevel;
    return { x, y };
  };

  const updateLocalShape = (id: string, updates: Partial<OCRAnnotation>) => {
      if (!onImageUpdated) return;
      const newAnnotations = image.ocr_annotations?.map(s => s.id === id ? { ...s, ...updates } : s) || [];
      onImageUpdated({ ...image, ocr_annotations: newAnnotations });
  };

  const saveShape = async (shape: Partial<OCRAnnotation>) => {
    if (!image.id) return;
    try {
        // onStartBlocking?.("Saving annotation..."); // Optional: blocking might be too intrusive for every edit
        const payload = {
            shapes: [shape]
        };
        const response = await axiosInstance.post(`images/${image.id}/ocr_annotations/`, payload);
        // The backend returns the saved shapes. We should merge them.
        // However, for a single shape save, we might just want to append or update.
        // Let's assume the backend returns the full list or we handle the merge.
        // Actually, the view returns { shapes: [saved_shape] }
        
        const savedShapes = response.data.shapes as OCRAnnotation[];
        const savedShape = savedShapes[0];
        
        let newAnnotations = [...(image.ocr_annotations || [])];
        const existingIndex = newAnnotations.findIndex(s => s.id === savedShape.id);
        if (existingIndex >= 0) {
            newAnnotations[existingIndex] = savedShape;
        } else {
            newAnnotations.push(savedShape);
        }
        
        if (onImageUpdated) {
            onImageUpdated({ ...image, ocr_annotations: newAnnotations });
        }
        onSelectShape(savedShape.id);

    } catch (error) {
        console.error("Error saving shape:", error);
    } finally {
        // onStopBlocking?.();
    }
  };

  const deleteShape = useCallback(async (id: string) => {
      try {
          await axiosInstance.delete(`images/${image.id}/delete_ocr_annotations/`, { data: { ids: [id] } });
          const newAnnotations = image.ocr_annotations?.filter(s => s.id !== id) || [];
          if (onImageUpdated) {
              onImageUpdated({ ...image, ocr_annotations: newAnnotations });
          }
          if (selectedShapeId === id) {
              onSelectShape(null);
          }
      } catch (error) {
          console.error("Error deleting shape:", error);
      }
  }, [image.id, image.ocr_annotations, onImageUpdated, selectedShapeId, onSelectShape]);

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
      } else {
        // Finish rect
        const start = currentPoints[0];
        const newShape: Partial<OCRAnnotation> = {
          type: "rect",
          points: [
            { x: start.x, y: start.y },
            { x: x, y: start.y },
            { x: x, y: y },
            { x: start.x, y: y },
          ],
          text: "",
          category: null,
        };
        saveShape(newShape);
        setCurrentPoints([]);
      }
    } else if (activeTool === "polygon") {
      setCurrentPoints((prev) => [...prev, { x, y }]);
    } else if (activeTool === "select") {
      // Selection logic handled by SVG elements' onMouseDown
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

    if (draggedPointIndex !== null && selectedShapeId) {
      // Resizing/Moving point
      const shape = image.ocr_annotations?.find((s) => s.id === selectedShapeId);
      if (shape) {
        const newPoints = [...shape.points];
        newPoints[draggedPointIndex] = { x, y };
        
        updateLocalShape(selectedShapeId, { points: newPoints });
      }
    } else if (draggedShapeId && dragStart) {
      // Moving entire shape
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;
      const shape = image.ocr_annotations?.find((s) => s.id === draggedShapeId);
      if (shape) {
        const newPoints = shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        updateLocalShape(draggedShapeId, { points: newPoints });
        setDragStart({ x, y });
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (disabled) return;
    if (isPanning) {
      handlePanMouseUp();
      return;
    }

    if (draggedPointIndex !== null || draggedShapeId) {
       // Commit changes to backend
       const id = selectedShapeId || draggedShapeId;
       if (id) {
           const shape = image.ocr_annotations?.find(s => s.id === id);
           if (shape) {
               saveShape(shape);
           }
       }
    }

    setDraggedPointIndex(null);
    setDraggedShapeId(null);
    setDragStart(null);
  };
  
  const handleDoubleClick = (e: React.MouseEvent) => {
      if (activeTool === "polygon" && currentPoints.length > 2) {
          // Finish polygon
          const newShape: Partial<OCRAnnotation> = {
              type: "polygon",
              points: currentPoints,
              text: "",
              category: null
          };
          saveShape(newShape);
          setCurrentPoints([]);
      }
  };

  // Keyboard support for delete
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === "Delete" || e.key === "Backspace") {
              if (selectedShapeId) {
                  deleteShape(selectedShapeId);
              }
          }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedShapeId]);


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
            pointerEvents: "none", // Let clicks pass through to container for creation, but enable for shapes
        }}
      >
          <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`}>
              {/* Render existing shapes */}
              {image.ocr_annotations?.map((shape) => {
                  const isSelected = shape.id === selectedShapeId;
                  const pointsStr = shape.points.map(p => `${p.x},${p.y}`).join(" ");
                  
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
                                }
                            }}
                          />
                          {/* Render handles if selected */}
                          {isSelected && shape.points.map((p, idx) => (
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
                                        setDraggedShapeId(shape.id); // Also set this to know which shape we are editing
                                    }
                                }}
                              />
                          ))}
                      </g>
                  );
              })}

              {/* Render current drawing */}
              {currentPoints.length > 0 && (
                  <g style={{ pointerEvents: "none" }}>
                      {activeTool === "rect" && currentPoints.length === 1 && (
                          // We don't have the mouse position here easily without state, 
                          // but usually we want to see the rect being drawn.
                          // For simplicity, we might skip the live preview or add a mouse move listener for it.
                          // Let's skip live preview for now or implement it if needed.
                          // Actually, let's just show the points.
                          <circle cx={currentPoints[0].x} cy={currentPoints[0].y} r={3 / zoomLevel} fill="red" />
                      )}
                      {activeTool === "polygon" && (
                          <>
                            <polyline
                                points={currentPoints.map(p => `${p.x},${p.y}`).join(" ")}
                                fill="none"
                                stroke="red"
                                strokeWidth={2 / zoomLevel}
                            />
                            {currentPoints.map((p, idx) => (
                                <circle key={idx} cx={p.x} cy={p.y} r={3 / zoomLevel} fill="red" />
                            ))}
                          </>
                      )}
                  </g>
              )}
          </g>
      </svg>
      
      {/* Helper text */}
      <Box sx={{ position: "absolute", bottom: 10, left: 10, bgcolor: "rgba(0,0,0,0.5)", color: "white", p: 1, borderRadius: 1 }}>
          <Typography variant="caption">
              {activeTool === "rect" && "Click start and end points for rectangle."}
              {activeTool === "polygon" && "Click points. Double click to finish."}
              {activeTool === "select" && "Click to select. Drag to move. Drag corners to resize. Del to delete."}
          </Typography>
      </Box>
    </div>
  );
};

export default ImageDisplayOCR;
