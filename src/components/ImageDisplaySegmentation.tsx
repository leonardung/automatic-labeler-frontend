import React, { useState, useEffect, useRef, useCallback } from "react";
import { Checkbox, FormControlLabel, Box, Typography, Button } from "@mui/material";
import useImageDisplay from "./useImageDisplay";
import axiosInstance from "../axiosInstance";
import type { ImageModel, MaskCategory, SegmentationMask, SegmentationPoint } from "../types";

interface ImageDisplaySegmentationProps {
  image: ImageModel;
  categories: MaskCategory[];
  activeCategoryId: number | null;
  onImageUpdated?: (image: ImageModel) => void;
  onPointsUpdated?: (imageId: number, categoryId: number, points: SegmentationPoint[]) => void;
  onRequireCategory?: () => void;
  disabled?: boolean;
  onStartBlocking?: (message?: string) => void;
  onStopBlocking?: () => void;
}

const ImageDisplaySegmentation: React.FC<ImageDisplaySegmentationProps> = ({
  image,
  categories,
  activeCategoryId,
  onImageUpdated,
  onPointsUpdated,
  onRequireCategory,
  disabled,
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
    keepZoomPan,
    handleToggleChange,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    calculateDisplayParams,
  } = useImageDisplay(image.image);

  const [points, setPoints] = useState<SegmentationPoint[]>([]);

  const activeMask = (image.masks || []).find(
    (m: SegmentationMask) => m.category?.id === activeCategoryId
  );
  const activeCategory = categories.find((c) => c.id === activeCategoryId);
  const [maskVersion, setMaskVersion] = useState(() => Date.now());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const parseTint = (color?: string | null) => {
    if (!color) return { r: 0, g: 200, b: 0, a: 0.4 };
    if (color.startsWith("rgba")) {
      const [r, g, b, a] = color
        .replace("rgba(", "")
        .replace(")", "")
        .split(",")
        .map((v) => v.trim());
      return { r: Number(r), g: Number(g), b: Number(b), a: Number(a ?? 1) };
    }
    const hex = color.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return { r, g, b, a: 0.4 };
  };

  useEffect(() => {
    setPoints(activeMask?.points || []);
  }, [image.id, activeCategoryId, activeMask?.id, activeMask?.points]);

  useEffect(() => {
    setMaskVersion(Date.now());
  }, [image.id, image.masks]);

  const handleImageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    if (isPanning) return;
    if (!containerRef.current || !imageRef.current) return;
    if (!activeCategory) {
      onRequireCategory?.();
      return;
    }

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();

    const clickX = event.clientX - containerRect.left;
    const clickY = event.clientY - containerRect.top;

    const imgX = (clickX - panOffset.x) / zoomLevel;
    const imgY = (clickY - panOffset.y) / zoomLevel;

    if (
      imgX < 0 ||
      imgX > imgDimensions.width ||
      imgY < 0 ||
      imgY > imgDimensions.height
    ) {
      return;
    }

    const isInclude = event.button === 0;

    const updatedPoints: SegmentationPoint[] = [
      ...points,
      { x: imgX, y: imgY, include: isInclude },
    ];
    setPoints(updatedPoints);
    if (activeCategoryId) {
      onPointsUpdated?.(image.id, activeCategoryId, updatedPoints);
      persistMask(updatedPoints);
    }
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const persistMask = async (updatedPoints: SegmentationPoint[]) => {
    if (!activeCategory) {
      return;
    }
    try {
      onStartBlocking?.("Creating mask from points...");
      const response = await axiosInstance.post<ImageModel>(
        `images/${image.id}/generate_mask/`,
        {
          coordinates: updatedPoints,
          category_id: activeCategory.id,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const updatedImage = response.data;
      const updatedActiveMask = updatedImage.masks?.find(
        (m: SegmentationMask) => m.category?.id === activeCategory.id
      );
      setPoints(updatedActiveMask?.points || []);
      onImageUpdated?.(updatedImage);
    } catch (error) {
      console.error("Error generating mask:", error);
    } finally {
      onStopBlocking?.();
    }
  };

  const versionedUrl = useCallback((url?: string | null) => {
    if (!url) return null;
    const base = url.split("?")[0];
    return `${base}?v=${maskVersion}`;
  }, [maskVersion]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || imgDimensions.width === 0 || imgDimensions.height === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const masks = image.masks || [];
    if (!masks.length) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const loaders = masks.map(
      (m) =>
        new Promise<{ img: HTMLImageElement; mask: SegmentationMask }>((resolve, reject) => {
          if (!m.mask) return reject(new Error("Missing mask"));
          const img = new Image();
          img.onload = () => resolve({ img, mask: m });
          img.onerror = reject;
          img.crossOrigin = "anonymous";
          const url = versionedUrl(m.mask);
          if (url) {
            img.src = url;
          } else {
            reject(new Error("Invalid mask url"));
          }
        })
    );

    Promise.all(loaders)
      .then((loaded) => {
        if (cancelled || !loaded.length) return;
        const { img: firstImg } = loaded[0];
        canvas.width = firstImg.width;
        canvas.height = firstImg.height;
        canvas.style.width = `${imgDimensions.width}px`;
        canvas.style.height = `${imgDimensions.height}px`;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        loaded.forEach(({ img, mask }) => {
          const { r, g, b, a } = parseTint(mask.category?.color);
          const off = document.createElement("canvas");
          off.width = img.width;
          off.height = img.height;
          const offCtx = off.getContext("2d");
          if (!offCtx) return;
          offCtx.drawImage(img, 0, 0);
          const imageData = offCtx.getImageData(0, 0, img.width, img.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i];
            if (alpha === 0) {
              data[i + 3] = 0;
              continue;
            }
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = Math.min(255, alpha * a);
          }
          offCtx.putImageData(imageData, 0, 0);
          ctx.drawImage(off, 0, 0);
        });
      })
      .catch(() => {
        if (!cancelled) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [image.masks, imgDimensions.width, imgDimensions.height, maskVersion, versionedUrl]);

  const renderPoints = () => {
    return points.map((point, index) => {
      const x = point.x * zoomLevel + panOffset.x;
      const y = point.y * zoomLevel + panOffset.y;

      return (
        <div
          key={`${point.x}-${point.y}-${index}`}
          style={{
            position: "absolute",
            pointerEvents: "none",
            top: `${y}px`,
            left: `${x}px`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            style={{
              width: "15px",
              height: "15px",
              borderRadius: "50%",
              backgroundColor: point.include ? "green" : "red",
              border: "2px solid white",
            }}
          ></div>
        </div>
      );
    });
  };

  const clearPoints = async () => {
    if (disabled) return;
    if (!activeCategory) {
      onRequireCategory?.();
      return;
    }
    try {
      await axiosInstance.get(`images/unload_model/`);
    } catch (error) {
      console.error("Error unloading model:", error);
    }
    try {
      await axiosInstance.delete(
        `images/${image.id}/delete_mask/?category_id=${activeCategory.id}`
      );
    } catch (error) {
      console.error("Error deleting masks:", error);
    }
    setPoints([]);
    if (activeCategoryId) {
      onPointsUpdated?.(image.id, activeCategoryId, []);
    }
    onImageUpdated?.({
      ...image,
      masks: (image.masks || []).filter((m) => m.category?.id !== activeCategory.id),
    });
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Toggle for keeping zoom and pan */}
      <Box
        sx={{
          position: "absolute",
          top: 60,
          left: 10, // adjust to avoid overlap with the menu button
          zIndex: 1,
          backgroundColor: "rgba(250,250,250, 0.4)",
          paddingLeft: 1,
          borderRadius: 1,
          color: "black",
        }}
      >
        <FormControlLabel
          control={
            <Checkbox
              checked={keepZoomPan}
              onChange={() => handleToggleChange()}
              disabled={disabled}
              color="primary"
            />
          }
          label={<Typography sx={{ fontWeight: "bold" }}>Keep Zoom and Pan</Typography>}
        />
      </Box>

      {/* Button to clear points */}
      <Box
        sx={{
          position: "absolute",
          top: 110,
          left: 10,
          zIndex: 1,
          borderRadius: 1,
          color: "black",
        }}
      >
        <Button variant="contained" color="secondary" onClick={clearPoints} disabled={disabled}>
          Clear Points
        </Button>
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
              : "crosshair",
        }}
        onWheel={disabled ? undefined : handleWheel}
        onMouseDown={(e) => {
          if (disabled) return;
          if (e.shiftKey) {
            handleMouseDown(e); // Start panning
          } else if (e.button === 0 || e.button === 2) {
            handleImageClick(e); // Process click
          }
        }}
        onMouseMove={disabled ? undefined : handleMouseMove}
        onMouseUp={disabled ? undefined : handleMouseUp}
        onMouseLeave={disabled ? undefined : handleMouseUp}
        onContextMenu={handleContextMenu} // Prevent default context menu
      >
        <img
          ref={imageRef}
          src={image.image}
          alt="Segmentation"
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

        {/* Canvas overlay for masks */}
        <canvas
          ref={canvasRef}
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

        {/* Render the points */}
        {renderPoints()}
      </div>
    </div>
  );
}


export default ImageDisplaySegmentation;
