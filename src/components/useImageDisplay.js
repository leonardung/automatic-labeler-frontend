// useImageDisplay.js
import { useRef, useState, useEffect } from "react";

const useImageDisplay = (imageSrc) => {
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  // State variables
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // State to track if the Shift key is pressed
  const [ShiftKeyPress, setShiftKeyPress] = useState(false);

  // State for the toggle to keep or reset zoom and pan
  const [keepZoomPan, setKeepZoomPan] = useState(false);

  const calculateDisplayParams = () => {
    if (!imageRef.current || !containerRef.current) {
      return;
    }

    const img = imageRef.current;
    const imgNaturalWidth = img.naturalWidth;
    const imgNaturalHeight = img.naturalHeight;

    const { videoWidth, videoHeight } = imageRef.current;
    setImgDimensions({ width: imgNaturalWidth, height: imgNaturalHeight });
  };

  // Function to initialize zoomLevel and panOffset
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

    // Initial zoom level to fit the image into the container
    const initialZoomLevel = Math.min(scaleX, scaleY);

    // Center the image in the container
    const initialPanOffsetX =
      (containerWidth - imgNaturalWidth * initialZoomLevel) / 2;
    const initialPanOffsetY =
      (containerHeight - imgNaturalHeight * initialZoomLevel) / 2;

    setZoomLevel(initialZoomLevel);
    setPanOffset({ x: initialPanOffsetX, y: initialPanOffsetY });
  };

  // useEffect to initialize zoomLevel and panOffset when the component mounts or when imageSrc changes
  useEffect(() => {
    if (!keepZoomPan) {
      initializeZoomPan();
    }
  }, [imageSrc, keepZoomPan]);

  useEffect(() => {
    // Recalculate image dimensions when the image source changes
    calculateDisplayParams();

    // Event listeners to track Shift key state
    const handleKeyDown = (event) => {
      if (event.key === "Shift") {
        setShiftKeyPress(true);
      }
    };

    const handleKeyUp = (event) => {
      if (event.key === "Shift") {
        setShiftKeyPress(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Debounced resize handler
    const debouncedResizeHandler = () => {
      calculateDisplayParams();
      if (!keepZoomPan) {
        initializeZoomPan();
      }
    };

    // Create debounced version of the handler
    let timeoutId;
    const debounce = (fn, delay) => {
      return () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(fn, delay);
      };
    };

    // Use ResizeObserver with debouncing and error handling
    let resizeObserver;
    if (containerRef.current) {
      resizeObserver = new ResizeObserver((entries, observer) => {
        try {
          debounce(debouncedResizeHandler, 100)();
        } catch (error) {
          console.warn('ResizeObserver error:', error);
        }
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (resizeObserver && containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [imageSrc, keepZoomPan]);

  // Add an event listener for when the image loads
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

  const handleWheel = (event) => {
    // event.preventDefault(); // Prevent default browser zoom behavior

    if (!containerRef.current) return;

    const { clientX, clientY } = event;

    const containerRect = containerRef.current.getBoundingClientRect();
    const x = clientX - containerRect.left;
    const y = clientY - containerRect.top;

    // Determine the new zoom level
    const delta = event.deltaY;
    let newZoomLevel = zoomLevel * (delta > 0 ? 0.85 : 1.15);
    newZoomLevel = Math.max(0.05, Math.min(newZoomLevel, 5)); // Allow further zoom out

    const zoomFactor = newZoomLevel / zoomLevel;

    // Adjust pan offset to keep the image centered on the cursor
    const newPanOffsetX = x - (x - panOffset.x) * zoomFactor;
    const newPanOffsetY = y - (y - panOffset.y) * zoomFactor;

    setPanOffset({ x: newPanOffsetX, y: newPanOffsetY });
    setZoomLevel(newZoomLevel);
  };

  const handleMouseDown = (event) => {
    if (!event.shiftKey) return; // Only initiate panning when Shift key is pressed
    event.preventDefault();

    setIsPanning(true);
    setPanStart({ x: event.clientX, y: event.clientY });
  };

  const handleMouseMove = (event) => {
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

  // Handler for the toggle
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
    // Additional handlers or state variables if needed
  };
};

export default useImageDisplay;
