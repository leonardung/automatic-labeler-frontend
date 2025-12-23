import { useRef, useState, useEffect, useCallback } from "react";
import type { WheelEvent as ReactWheelEvent, MouseEvent as ReactMouseEvent } from "react";

type Point = { x: number; y: number };
type FitMode = "inside" | "outside";

const useImageDisplay = (imageSrc: string | null) => {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  const [ShiftKeyPress, setShiftKeyPress] = useState(false);
  const [keepZoomPan, setKeepZoomPan] = useState(false);
  const [fitMode, setFitMode] = useState<FitMode>("inside");

  const clampZoom = (value: number) => Math.max(0.05, Math.min(value, 5));

  const calculateDisplayParams = () => {
    if (!imageRef.current || !containerRef.current) {
      return;
    }

    const img = imageRef.current;
    const imgNaturalWidth = img.naturalWidth;
    const imgNaturalHeight = img.naturalHeight;

    setImgDimensions({ width: imgNaturalWidth, height: imgNaturalHeight });
  };

  const computeFit = useCallback(
    (mode: FitMode) => {
      if (!imageRef.current || !containerRef.current) {
        return { zoom: 1, pan: { x: 0, y: 0 } };
      }

      const img = imageRef.current;
      const containerRect = containerRef.current.getBoundingClientRect();

      const containerWidth = containerRect.width || 1;
      const containerHeight = containerRect.height || 1;

      const imgNaturalWidth = img.naturalWidth || 1;
      const imgNaturalHeight = img.naturalHeight || 1;

      const scaleX = containerWidth / imgNaturalWidth;
      const scaleY = containerHeight / imgNaturalHeight;

      const targetZoom = mode === "outside" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

      const panX = (containerWidth - imgNaturalWidth * targetZoom) / 2;
      const panY = (containerHeight - imgNaturalHeight * targetZoom) / 2;

      return { zoom: targetZoom, pan: { x: panX, y: panY } };
    },
    []
  );

  const applyFit = useCallback(
    (mode: FitMode) => {
      const params = computeFit(mode);
      setFitMode(mode);
      setZoomLevel(params.zoom);
      setPanOffset(params.pan);
    },
    [computeFit]
  );

  const initializeZoomPan = useCallback(() => {
    applyFit(fitMode);
  }, [applyFit, fitMode]);

  const zoomAtPoint = useCallback(
    (factor: number, origin?: Point) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const originX = origin?.x ?? rect.width / 2;
      const originY = origin?.y ?? rect.height / 2;

      setZoomLevel((prevZoom) => {
        const targetZoom = clampZoom(prevZoom * factor);
        const zoomFactor = targetZoom / prevZoom;
        setPanOffset((prevPan) => ({
          x: originX - (originX - prevPan.x) * zoomFactor,
          y: originY - (originY - prevPan.y) * zoomFactor,
        }));
        return targetZoom;
      });
    },
    []
  );

  const zoomIn = useCallback(() => zoomAtPoint(1.15), [zoomAtPoint]);
  const zoomOut = useCallback(() => zoomAtPoint(1 / 1.15), [zoomAtPoint]);
  const toggleFitMode = useCallback(() => {
    const nextMode: FitMode = fitMode === "inside" ? "outside" : "inside";
    applyFit(nextMode);
  }, [applyFit, fitMode]);
  const fitInside = useCallback(() => applyFit("inside"), [applyFit]);
  const fitOutside = useCallback(() => applyFit("outside"), [applyFit]);

  useEffect(() => {
    if (!keepZoomPan) {
      initializeZoomPan();
    }
  }, [imageSrc, keepZoomPan, initializeZoomPan]);

  useEffect(() => {
    calculateDisplayParams();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftKeyPress(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftKeyPress(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const debouncedResizeHandler = () => {
      calculateDisplayParams();
      if (!keepZoomPan) {
        initializeZoomPan();
      }
    };

    let timeoutId: ReturnType<typeof setTimeout>;
    const debounce = (fn: () => void, delay: number) => {
      return () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(fn, delay);
      };
    };

    const containerEl = containerRef.current;
    let resizeObserver: ResizeObserver | undefined;
    if (containerEl) {
      resizeObserver = new ResizeObserver(() => {
        try {
          debounce(debouncedResizeHandler, 100)();
        } catch (error) {
          console.warn("ResizeObserver error:", error);
        }
      });
      resizeObserver.observe(containerEl);
    }

    return () => {
      if (resizeObserver && containerEl) {
        resizeObserver.unobserve(containerEl);
      }
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [imageSrc, keepZoomPan, initializeZoomPan]);

  useEffect(() => {
    const img = imageRef.current;

    const handleImageLoad = () => {
      calculateDisplayParams();
      if (!keepZoomPan) {
        initializeZoomPan();
      }
    };

    if (img) {
      img.addEventListener("load", handleImageLoad);
    }

    return () => {
      if (img) {
        img.removeEventListener("load", handleImageLoad);
      }
    };
  }, [imageSrc, keepZoomPan, initializeZoomPan]);

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const { clientX, clientY } = event;

    const containerRect = containerRef.current.getBoundingClientRect();
    const x = clientX - containerRect.left;
    const y = clientY - containerRect.top;

    const delta = event.deltaY;
    zoomAtPoint(delta > 0 ? 0.85 : 1.15, { x, y });
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!event.shiftKey) return;
    event.preventDefault();

    setIsPanning(true);
    setPanStart({ x: event.clientX, y: event.clientY });
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;

    const deltaX = event.clientX - panStart.x;
    const deltaY = event.clientY - panStart.y;

    setPanStart({ x: event.clientX, y: event.clientY });

    setPanOffset((prevPanOffset) => ({
      x: prevPanOffset.x + deltaX,
      y: prevPanOffset.y + deltaY,
    }));
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleToggleChange = () => {
    setKeepZoomPan((prevValue) => !prevValue);
  };

  return {
    imageRef,
    containerRef,
    zoomLevel,
    panOffset,
    imgDimensions,
    isPanning,
    ShiftKeyPress,
    keepZoomPan,
    handleToggleChange,
    fitMode,
    zoomIn,
    zoomOut,
    toggleFitMode,
    fitInside,
    fitOutside,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    calculateDisplayParams,
  };
};

export default useImageDisplay;
