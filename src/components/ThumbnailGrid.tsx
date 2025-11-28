import React from "react";
import { Box, Typography } from "@mui/material";
import type { ImageModel } from "../types";

interface ThumbnailGridProps {
  images: ImageModel[];
  onThumbnailClick: (index: number) => void;
  currentIndex: number;
}

const ThumbnailGrid: React.FC<ThumbnailGridProps> = ({
  images,
  onThumbnailClick,
  currentIndex,
}) => {
  return (
    <Box
      sx={{
        width: "100%",
        height: "120px",
        overflowX: "auto",
        overflowY: "hidden",
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1,
        boxSizing: "border-box",
        backgroundColor: "#0f1624",
        borderTop: "1px solid #1f2a3d",
      }}
    >
      {images.map((image, index) => {
        const hasLabel = !!(image.masks && image.masks.length > 0);
        return (
          <Box
            key={image.id}
            onClick={() => onThumbnailClick(index)}
            border={index === currentIndex ? 2 : 0}
            borderColor="primary.main"
            sx={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
              minWidth: 100,
              height: 100,
            }}
          >
            <img
              src={image.thumbnail || image.image}
              alt={`Thumbnail ${index}`}
              loading="lazy"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: hasLabel ? 1 : 0.85,
              }}
            />
            {!hasLabel && (
              <Box
                position="absolute"
                top={0}
                left={0}
                width="100%"
                height="100%"
                display="flex"
                justifyContent="center"
                alignItems="center"
                bgcolor="rgba(0,0,0,0.4)"
              >
                <Typography variant="overline" color="white">
                  No labels
                </Typography>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

export default ThumbnailGrid;

