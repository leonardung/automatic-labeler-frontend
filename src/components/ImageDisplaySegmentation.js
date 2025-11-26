import React, { useState, useEffect, useRef } from "react";
import useImageDisplay from "./useImageDisplay";
import axiosInstance from "../axiosInstance";
import MaskCategoryPanel from "./MaskCategoryPanel";

import { Checkbox, FormControlLabel, Box, Typography, Button } from "@mui/material";

const ImageDisplaySegmentation = ({
  image,
  onImageUpdated,
  onPointsUpdated,
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

  const [points, setPoints] = useState([]);
  const [maskUrl, setMaskUrl] = useState(image.mask || null);
  const canvasRef = useRef(null);
  const [categories, setCategories] = useState(["Category 1", "Category 2"]);

  useEffect(() => {
    setPoints(image.coordinates || []);
    setMaskUrl(image.mask ? `${image.mask.split("?")[0]}?t=${Date.now()}` : null);
  }, [image.id, image.coordinates, image.mask]);


  const handleImageClick = (event) => {
    event.preventDefault();
    if (isPanning) return;
    if (!containerRef.current || !imageRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();

    const clickX = event.clientX - containerRect.left;
    const clickY = event.clientY - containerRect.top;

    // Convert click position to image coordinates
    const imgX = (clickX - panOffset.x) / zoomLevel;
    const imgY = (clickY - panOffset.y) / zoomLevel;

    // Check if click is within the image bounds
    if (
      imgX < 0 ||
      imgX > imgDimensions.width ||
      imgY < 0 ||
      imgY > imgDimensions.height
    ) {
      return;
    }

    // Determine if inclusion or exclusion point
    const isInclude = event.button === 0; // Left-click for include, right-click for exclude

    const updatedPoints = [
      ...points,
      { x: imgX, y: imgY, include: isInclude },
    ];
    setPoints(updatedPoints);
    if (onPointsUpdated) {
      onPointsUpdated(image.id, updatedPoints);
    }
    persistMask(updatedPoints);
  };

  // Prevent default context menu on right-click
  const handleContextMenu = (event) => {
    event.preventDefault();
  };

  const persistMask = async (updatedPoints) => {
    try {
      const response = await axiosInstance.post(
        `images/${image.id}/generate_mask/`,
        {
          coordinates: updatedPoints,
          mask_input: maskUrl ? maskUrl.split("?")[0] : null,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const nextMask = response.data.mask
        ? `${response.data.mask.split("?")[0]}?t=${Date.now()}`
        : null;

      setMaskUrl(nextMask);
      if (response.data.coordinates) {
        setPoints(response.data.coordinates);
        onPointsUpdated?.(image.id, response.data.coordinates);
      }
      onImageUpdated?.({ ...response.data, mask: nextMask });
    } catch (error) {
      console.error("Error generating mask:", error);
    }
  };


  // Draw the mask onto the canvas whenever it changes
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    if (!maskUrl) {
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Create a new Image to load the mask PNG.
    const maskImg = new Image();
    // Setting crossOrigin allows reading the image data if your backend supports CORS.
    maskImg.crossOrigin = "anonymous";
    maskImg.src = maskUrl;

    maskImg.onload = () => {
      const maskWidth = maskImg.width;
      const maskHeight = maskImg.height;

      canvas.width = maskWidth;
      canvas.height = maskHeight;

      // Scale the canvas to match the image dimensions
      canvas.style.width = `${imgDimensions.width}px`;
      canvas.style.height = `${imgDimensions.height}px`;

      // Clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw the mask image to an offscreen canvas so we can read its pixel data.
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = maskWidth;
      offscreenCanvas.height = maskHeight;
      const offscreenCtx = offscreenCanvas.getContext("2d");
      offscreenCtx.drawImage(maskImg, 0, 0);

      // Retrieve the pixel data from the offscreen canvas.
      const imageData = offscreenCtx.getImageData(0, 0, maskWidth, maskHeight);
      const data = imageData.data;

      // Process each pixel:
      // For a binary PNG mask, we assume that white pixels (or those above a threshold) indicate the mask region.
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 128) {
          data[i] = 0;       // Red
          data[i + 1] = 255; // Green
          data[i + 2] = 0;   // Blue
          data[i + 3] = 128; // Alpha (transparency)
        } else {
          data[i + 3] = 0;
        }
      }

      // Draw the modified mask onto the main canvas.
      ctx.putImageData(imageData, 0, 0);
    };

    maskImg.onerror = (error) => {
      console.warn("Mask image not accessible; displaying empty mask.", error);

      canvas.width = 1;
      canvas.height = 1;
      canvas.style.width = `${imgDimensions.width}px`;
      canvas.style.height = `${imgDimensions.height}px`;

      // Clear the canvas (resulting in an empty/transparent mask).
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [maskUrl, imgDimensions.width, imgDimensions.height]);

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
          {/* Circle to represent the point */}
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

  // Function to clear points and unload model
  const clearPoints = async () => {
    try {
      await axiosInstance.get(`images/unload_model/`);
    } catch (error) {
      console.error('Error unloading model:', error);
    }
    try {
      await axiosInstance.delete(`images/${image.id}/delete_mask/`);
    } catch (error) {
      console.error('Error deleting masks:', error);
    }
    try {
      await axiosInstance.delete(`images/${image.id}/delete_coordinates/`);
    } catch (error) {
      console.error('Error deleting coordinates:', error);
    }
    setPoints([]);
    setMaskUrl(null);
    onPointsUpdated?.(image.id, []);
    onImageUpdated?.({ ...image, mask: null, coordinates: [] });
  };

  const handleAddCategory = (newCat) => {
    setCategories((prev) => [...prev, newCat]);
  };

  const handleSelectCategory = (cat) => {
    console.log("Selected category:", cat);
    // handle selection logic here
  };


  const handleDeleteCategory = (categoryToDelete) => {
    setCategories((prev) => prev.filter((cat) => cat !== categoryToDelete));
    console.log("Deleted category:", categoryToDelete);
  };


  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Expandable Left Panel for Mask Categories */}
      <MaskCategoryPanel
        categories={categories}
        onAddCategory={handleAddCategory}
        onSelectCategory={handleSelectCategory}
        onDeleteCategory={handleDeleteCategory}
      />

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
              onChange={handleToggleChange}
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
        <Button variant="contained" color="secondary" onClick={clearPoints}>
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
          cursor: ShiftKeyPress
            ? isPanning
              ? "grabbing"
              : "grab"
            : "crosshair",
        }}
        onWheel={handleWheel}
        onMouseDown={(e) => {
          if (e.shiftKey) {
            handleMouseDown(e); // Start panning
          } else if (e.button === 0 || e.button === 2) {
            handleImageClick(e); // Process click
          }
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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

        {/* Render the mask overlay */}
        {maskUrl && (
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
        )}

        {/* Render the points */}
        {renderPoints()}
      </div>
    </div>
  );
}


export default ImageDisplaySegmentation;
