import React from "react";
import { Box, Typography } from "@mui/material";
import type { ImageModel } from "../types";

interface ThumbnailGridProps {
  images: ImageModel[];
  onThumbnailClick: (index: number) => void;
  currentIndex: number;
}

const MIN_HEIGHT = 120;
const DEFAULT_HEIGHT = 130;
const HANDLE_HEIGHT = 2;
const LABEL_HEIGHT = 20;
const VERTICAL_PADDING = 22;
const ITEM_GAP = 4;
const STACK_GAP = 6;

const getMaxHeight = () => (typeof window !== "undefined" ? window.innerHeight * 0.4 : 320);

const ThumbnailGrid: React.FC<ThumbnailGridProps> = ({
  images,
  onThumbnailClick,
  currentIndex,
}) => {
  const [height, setHeight] = React.useState(DEFAULT_HEIGHT);
  const startYRef = React.useRef(0);
  const startHeightRef = React.useRef(DEFAULT_HEIGHT);
  const draggingRef = React.useRef(false);

  const clampHeight = React.useCallback((nextHeight: number) => {
    return Math.min(Math.max(MIN_HEIGHT, nextHeight), getMaxHeight());
  }, []);

  React.useEffect(() => {
    const handleResize = () => setHeight((prev) => clampHeight(prev));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampHeight]);

  const handleMouseMove = React.useCallback(
    (event: MouseEvent) => {
      if (!draggingRef.current) return;
      const deltaY = startYRef.current - event.clientY;
      setHeight(clampHeight(startHeightRef.current + deltaY));
    },
    [clampHeight],
  );

  const stopDragging = React.useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", stopDragging);
  }, [handleMouseMove]);

  const handleMouseDown = (event: React.MouseEvent) => {
    draggingRef.current = true;
    startYRef.current = event.clientY;
    startHeightRef.current = height;
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDragging);
  };

  React.useEffect(
    () => () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopDragging);
      document.body.style.userSelect = "";
    },
    [handleMouseMove, stopDragging],
  );

  const contentHeight =
    Math.max(MIN_HEIGHT, height) - HANDLE_HEIGHT - VERTICAL_PADDING - STACK_GAP;
  const rawImageSize = contentHeight - LABEL_HEIGHT - ITEM_GAP;
  const thumbnailImageSize = Math.max(40, Math.min(rawImageSize, 220));

  return (
    <Box
      sx={{
        width: "100%",
        height,
        minHeight: MIN_HEIGHT,
        maxHeight: "40vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: `${STACK_GAP}px`,
        px: 1,
        pt: 1,
        pb: 1,
        flexShrink: 0,
        boxSizing: "border-box",
        backgroundColor: "#0f1624",
        borderTop: "0px solid #1f2a3d",
      }}
    >
      <Box
        onMouseDown={handleMouseDown}
        sx={{
          height: HANDLE_HEIGHT,
          cursor: "row-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "text.secondary",
          userSelect: "none",
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 3,
            borderRadius: 999,
            bgcolor: "#1f2a3d",
          }}
        />
      </Box>
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "flex-start",
          gap: 1,
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        {images.map((image, index) => {
          const isValidated = Boolean(image.is_label);
          return (
            <Box
              key={image.id}
              onClick={() => onThumbnailClick(index)}
              sx={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                flexDirection: "column",
                justifyContent: "flex-start",
                gap: 0.5,
                flexShrink: 0,
                minWidth: thumbnailImageSize,
                width: thumbnailImageSize,
              }}
            >
              <Box
                border={index === currentIndex ? 2 : 0}
                borderColor="primary.main"
                sx={{
                  width: "100%",
                  height: thumbnailImageSize,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  overflow: "hidden",
                  borderRadius: 1,
                }}
              >
                <img
                  src={image.thumbnail || image.image}
                  alt={`Thumbnail ${index + 1}`}
                  loading="lazy"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    opacity: 1,
                  }}
                />
                {isValidated && (
                  <Box
                    position="absolute"
                    top={6}
                    right={6}
                    px={0.75}
                    py={0.25}
                    borderRadius={1}
                    bgcolor="rgba(46, 160, 90, 0.85)"
                    border="1px solid rgba(255,255,255,0.2)"
                  >
                    <Typography variant="caption" color="white" fontWeight={600}>
                      Validated
                    </Typography>
                  </Box>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                {index + 1}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default ThumbnailGrid;
