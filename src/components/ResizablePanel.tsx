import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box } from "@mui/material";
import type { BoxProps } from "@mui/material";

type ResizeAxis = "horizontal" | "vertical";
type ResizeFrom = "left" | "right" | "top" | "bottom";
type HandlePosition = "bottom-left" | "bottom-right";

interface ResizablePanelProps extends BoxProps {
  axis: ResizeAxis;
  resizeFrom?: ResizeFrom;
  defaultSize?: number;
  size?: number;
  minSize?: number;
  maxSize?: number | ((viewport: { width: number; height: number }) => number);
  onSizeChange?: (nextSize: number) => void;
  handlePosition?: HandlePosition;
  handleOffset?: number;
  handleSize?: number;
  disabled?: boolean;
  lockFlexOnResize?: boolean;
}

const ResizablePanel: React.FC<ResizablePanelProps> = ({
  axis,
  resizeFrom,
  defaultSize,
  size,
  minSize = 0,
  maxSize,
  onSizeChange,
  handlePosition,
  handleOffset = 4,
  handleSize = 8,
  disabled,
  lockFlexOnResize,
  sx,
  children,
  ...rest
}) => {
  const isControlled = typeof size === "number";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(0);
  const draggingRef = useRef(false);
  const [hasUserResized, setHasUserResized] = useState(false);

  const resolveMaxSize = useCallback(() => {
    if (typeof maxSize === "function") {
      if (typeof window === "undefined") {
        return Number.POSITIVE_INFINITY;
      }
      return maxSize({ width: window.innerWidth, height: window.innerHeight });
    }
    if (typeof maxSize === "number") return maxSize;
    return Number.POSITIVE_INFINITY;
  }, [maxSize]);

  const clamp = useCallback(
    (next: number) => {
      const max = resolveMaxSize();
      return Math.min(Math.max(next, minSize), max);
    },
    [minSize, resolveMaxSize]
  );

  const [internalSize, setInternalSize] = useState<number | null>(() => {
    if (typeof defaultSize !== "number") return null;
    return clamp(defaultSize);
  });

  const resolvedSize = useMemo(() => {
    if (isControlled) return clamp(size);
    return internalSize;
  }, [clamp, internalSize, isControlled, size]);

  const updateSize = useCallback(
    (next: number) => {
      const clamped = clamp(next);
      if (!isControlled) {
        setInternalSize(clamped);
      }
      onSizeChange?.(clamped);
    },
    [clamp, isControlled, onSizeChange]
  );

  const resolveCurrentSize = useCallback(() => {
    if (resolvedSize !== null && typeof resolvedSize === "number") {
      return resolvedSize;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      return clamp(axis === "horizontal" ? rect.width : rect.height);
    }
    if (typeof defaultSize === "number") {
      return clamp(defaultSize);
    }
    return clamp(minSize);
  }, [axis, clamp, defaultSize, minSize, resolvedSize]);

  useLayoutEffect(() => {
    if (isControlled || internalSize !== null) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const measured = axis === "horizontal" ? rect.width : rect.height;
    setInternalSize(clamp(measured));
  }, [axis, clamp, internalSize, isControlled]);

  useEffect(() => {
    if (isControlled || internalSize === null) return;
    setInternalSize((prev) => (prev === null ? prev : clamp(prev)));
  }, [clamp, internalSize, isControlled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      if (isControlled) return;
      setInternalSize((prev) => (prev === null ? prev : clamp(prev)));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clamp, isControlled]);

  const resolvedResizeFrom =
    resizeFrom ?? (axis === "horizontal" ? "right" : "bottom");

  const resolvedHandlePosition: HandlePosition =
    handlePosition ??
    (resolvedResizeFrom === "left"
      ? "bottom-left"
      : resolvedResizeFrom === "right"
      ? "bottom-right"
      : "bottom-left");

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!draggingRef.current) return;
      let delta = 0;
      if (axis === "horizontal") {
        delta =
          resolvedResizeFrom === "left"
            ? startPosRef.current - event.clientX
            : event.clientX - startPosRef.current;
      } else {
        delta =
          resolvedResizeFrom === "top"
            ? startPosRef.current - event.clientY
            : event.clientY - startPosRef.current;
      }
      updateSize(startSizeRef.current + delta);
    },
    [axis, resolvedResizeFrom, updateSize]
  );

  const stopDragging = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", stopDragging);
  }, [handleMouseMove]);

  const handleMouseDown = (event: React.MouseEvent) => {
    if (disabled) return;
    draggingRef.current = true;
    setHasUserResized(true);
    startPosRef.current = axis === "horizontal" ? event.clientX : event.clientY;
    startSizeRef.current = resolveCurrentSize();
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDragging);
  };

  useEffect(
    () => () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopDragging);
      document.body.style.userSelect = "";
    },
    [handleMouseMove, stopDragging]
  );

  const maxResolved = resolveMaxSize();

  const sizeStyles =
    axis === "horizontal"
      ? {
          width: resolvedSize ?? undefined,
          minWidth: minSize,
          maxWidth: Number.isFinite(maxResolved) ? maxResolved : undefined,
        }
      : {
          height: resolvedSize ?? undefined,
          minHeight: minSize,
          maxHeight: Number.isFinite(maxResolved) ? maxResolved : undefined,
        };

  const lockFlexStyles =
    lockFlexOnResize && hasUserResized
      ? {
          flexGrow: 0,
          flexShrink: 0,
        }
      : {};

  const baseSx = useMemo(
    () => ({
      position: "relative",
      ...sizeStyles,
      ...lockFlexStyles,
    }),
    [lockFlexStyles, sizeStyles]
  );

  const mergedSx = useMemo(() => {
    if (!sx) return [baseSx];
    return Array.isArray(sx) ? [...sx, baseSx] : [sx, baseSx];
  }, [baseSx, sx]);

  const handleSideStyles =
    resolvedHandlePosition === "bottom-left"
      ? {
          left: handleOffset,
          borderLeft: "2px solid currentColor",
          borderBottomLeftRadius: 2,
          justifyContent: "flex-start",
        }
      : {
          right: handleOffset,
          borderRight: "2px solid currentColor",
          borderBottomRightRadius: 2,
          justifyContent: "flex-end",
        };

  const cursor = axis === "horizontal" ? "col-resize" : "row-resize";

  return (
    <Box ref={containerRef} sx={mergedSx} {...rest}>
      {children}
      <Box
        role="separator"
        aria-orientation={axis}
        onMouseDown={handleMouseDown}
        sx={{
          position: "absolute",
          left: handleOffset,
          bottom: handleOffset,
          width: handleSize + 10,
          height: handleSize + 10,
          display: "flex",
          alignItems: "flex-end",
          cursor,
          color: "rgba(255,255,255,0.4)",
          "&:hover": { color: "rgba(255,255,255,0.7)" },
          ...handleSideStyles,
        }}
      >
        <Box
          sx={{
            width: handleSize,
            height: handleSize,
            borderLeft: "2px solid currentColor",
            borderBottom: "2px solid currentColor",
            borderBottomLeftRadius: 2,
          }}
        />
      </Box>
    </Box>
  );
};

export default ResizablePanel;
