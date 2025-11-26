import React, { useRef, useEffect } from "react";
import { FixedSizeGrid } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { Box, Typography } from "@mui/material";
import { styled } from "@mui/system";

// Create a styled version of FixedSizeGrid to apply custom scrollbar styles
const StyledGrid = styled(FixedSizeGrid)(({ theme }) => ({
  '&::-webkit-scrollbar': {
    width: '10px',
  },
  '&::-webkit-scrollbar-track': {
    background: '#f1f1f1',
    borderRadius: '5px',
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: '#888',
    borderRadius: '5px',
  },
  '&::-webkit-scrollbar-thumb:hover': {
    background: '#555',
  },
}));

function ThumbnailGrid({ images, onThumbnailClick, currentIndex, coordinates = {} }) {
  const gridRef = useRef(null);
  const columnCount = 4;
  const rowCount = Math.ceil(images.length / columnCount);

  const Cell = ({ columnIndex, rowIndex, style }) => {
    const index = rowIndex * columnCount + columnIndex;
    if (index >= images.length) return null;

    const image = images[index];
    const hasLabel = image.mask || (coordinates[images[index].id] && coordinates[images[index].id].length > 0);

    return (
      <Box
        style={style}
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
            opacity: hasLabel ? 1 : 0.9,
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
  };

  useEffect(() => {
    if (gridRef.current) {
      const rowIndex = Math.floor(currentIndex / columnCount);
      const columnIndex = currentIndex % columnCount;
      gridRef.current.scrollToItem({ rowIndex, columnIndex, align: "smart" });
    }
  }, [currentIndex]);

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <AutoSizer>
        {({ height, width }) => (
          <StyledGrid
            ref={gridRef}
            columnCount={columnCount}
            rowCount={rowCount}
            columnWidth={width / columnCount * 0.95} // Adjusted to fit within the parent width
            rowHeight={70}
            height={height}
            width={width}
          >
            {Cell}
          </StyledGrid>
        )}
      </AutoSizer>
    </Box>
  );
}

export default ThumbnailGrid;

