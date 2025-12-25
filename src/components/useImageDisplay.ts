import { useRef, useState, useEffect, useCallback } from "react";
import type { WheelEvent as ReactWheelEvent, MouseEvent as ReactMouseEvent } from "react";

type Point = { x: number; y: number };
type FitMode = "inside" | "outside";
type ModifierKey = "shift" | "ctrl";
type WheelBehavior = "zoom" | "scrollPanCtrlZoom";

interface UseImageDisplayOptions {
  panModifierKey?: ModifierKey;
  wheelBehavior?: WheelBehavior;
  wheelEnabled?: boolean;
}

const useImageDisplay = (imageSrc: string | null, options: UseImageDisplayOptions = {}) => {
  const { panModifierKey = "shift", wheelBehavior = "zoom", wheelEnabled = true } = options;
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Refs keep the latest values handy inside callbacks.
  const zoomRef = useRef<number>(1);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const panStartRef = useRef<Point | null>(null);
  const panOriginRef = useRef<Point>({ x: 0, y: 0 });

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [isPanning, setIsPanning] = useState(false);
  const [panKeyPressed, setPanKeyPressed] = useState(false);
  const [keepZoomPan, setKeepZoomPan] = useState(false);
  const [fitMode, setFitMode] = useState<FitMode>("inside");

  const clampZoom = (value: number) => Math.max(0.05, Math.min(value, 5));
  const isPanModifierActive = (event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) =>
    panModifierKey === "shift" ? event.shiftKey : event.ctrlKey || event.metaKey;
  const applyPanDelta = useCallback((deltaX: number, deltaY: number) => {
    setPanOffset((prevPanOffset) => {
      const nextPan = {
        x: prevPanOffset.x + deltaX,
        y: prevPanOffset.y + deltaY,
      };
      panRef.current = nextPan;
      return nextPan;
    });
  }, []);

  useEffect(() => {
    zoomRef.current = zoomLevel;
  }, [zoomLevel]);

  useEffect(() => {
    panRef.current = panOffset;
  }, [panOffset]);

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
      zoomRef.current = params.zoom;
      panRef.current = params.pan;
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

      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      const targetZoom = clampZoom(currentZoom * factor);

      const imgX = (originX - currentPan.x) / currentZoom;
      const imgY = (originY - currentPan.y) / currentZoom;
      const nextPan = {
        x: originX - imgX * targetZoom,
        y: originY - imgY * targetZoom,
      };

      zoomRef.current = targetZoom;
      panRef.current = nextPan;
      setZoomLevel(targetZoom);
      setPanOffset(nextPan);
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
      const isPanKey =
        panModifierKey === "shift" ? event.key === "Shift" : event.key === "Control" || event.key === "Meta";
      if (isPanKey) {
        setPanKeyPressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const isPanKey =
        panModifierKey === "shift" ? event.key === "Shift" : event.key === "Control" || event.key === "Meta";
      if (isPanKey) {
        setPanKeyPressed(false);
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
  }, [imageSrc, keepZoomPan, initializeZoomPan, panModifierKey]);

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

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement> | WheelEvent) => {
      if (!containerRef.current) return;
      if (event.cancelable) {
        try {
          event.preventDefault();
        } catch {
          // Some environments attach wheel listeners as passive; ignore if preventDefault is disallowed.
        }
      }

      const { clientX, clientY, deltaY, deltaX, ctrlKey, metaKey } = event;

      if (wheelBehavior === "scrollPanCtrlZoom" && !(ctrlKey || metaKey)) {
        applyPanDelta(-deltaX, -deltaY);
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      const x = clientX - containerRect.left;
      const y = clientY - containerRect.top;

      zoomAtPoint(deltaY > 0 ? 0.85 : 1.15, { x, y });
    },
    [applyPanDelta, wheelBehavior, zoomAtPoint]
  );

  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl || !wheelEnabled) return;

    const listener = (e: WheelEvent) => handleWheel(e);
    containerEl.addEventListener("wheel", listener, { passive: false });

    return () => {
      containerEl.removeEventListener("wheel", listener);
    };
  }, [handleWheel, wheelEnabled]);

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isPanModifierActive(event)) return;
    if (event.cancelable) {
      event.preventDefault();
    }

    setIsPanning(true);
    panStartRef.current = { x: event.clientX, y: event.clientY };
    panOriginRef.current = panRef.current;
  };

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    if (!panStartRef.current) return;

    const deltaX = event.clientX - panStartRef.current.x;
    const deltaY = event.clientY - panStartRef.current.y;

    const nextPan = {
      x: panOriginRef.current.x + deltaX,
      y: panOriginRef.current.y + deltaY,
    };

    panRef.current = nextPan;
    setPanOffset(nextPan);
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    panStartRef.current = null;
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
    panKeyPressed,
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
