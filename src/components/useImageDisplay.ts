import { useRef, useState, useEffect } from "react";
import type { WheelEvent as ReactWheelEvent, MouseEvent as ReactMouseEvent } from "react";

type Point = { x: number; y: number };

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

  const calculateDisplayParams = () => {
    if (!imageRef.current || !containerRef.current) {
      return;
    }

    const img = imageRef.current;
    const imgNaturalWidth = img.naturalWidth;
    const imgNaturalHeight = img.naturalHeight;

    setImgDimensions({ width: imgNaturalWidth, height: imgNaturalHeight });
  };

  const initializeZoomPan = () => {
    if (!imageRef.current || !containerRef.current) {
      return;
    }

    const img = imageRef.current;
    const container = containerRef.current;

    const containerRect = container.getBoundingClientRect();

    const imgNaturalWidth = img.naturalWidth;
    const imgNaturalHeight = img.naturalHeight;

    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    const scaleX = containerWidth / imgNaturalWidth;
    const scaleY = containerHeight / imgNaturalHeight;

    const initialZoomLevel = Math.min(scaleX, scaleY);

    const initialPanOffsetX =
      (containerWidth - imgNaturalWidth * initialZoomLevel) / 2;
    const initialPanOffsetY =
      (containerHeight - imgNaturalHeight * initialZoomLevel) / 2;

    setZoomLevel(initialZoomLevel);
    setPanOffset({ x: initialPanOffsetX, y: initialPanOffsetY });
  };

  useEffect(() => {
    if (!keepZoomPan) {
      initializeZoomPan();
    }
  }, [imageSrc, keepZoomPan]);

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
  }, [imageSrc, keepZoomPan]);

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
  }, [imageSrc, keepZoomPan]);

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const { clientX, clientY } = event;

    const containerRect = containerRef.current.getBoundingClientRect();
    const x = clientX - containerRect.left;
    const y = clientY - containerRect.top;

    const delta = event.deltaY;
    let newZoomLevel = zoomLevel * (delta > 0 ? 0.85 : 1.15);
    newZoomLevel = Math.max(0.05, Math.min(newZoomLevel, 5));

    const zoomFactor = newZoomLevel / zoomLevel;

    const newPanOffsetX = x - (x - panOffset.x) * zoomFactor;
    const newPanOffsetY = y - (y - panOffset.y) * zoomFactor;

    setPanOffset({ x: newPanOffsetX, y: newPanOffsetY });
    setZoomLevel(newZoomLevel);
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
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    calculateDisplayParams,
  };
};

export default useImageDisplay;
