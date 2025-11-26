import React, { useState, useEffect, useContext, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axiosInstance from "../axiosInstance";
import {
    Button,
    Typography,
    Box,
    CssBaseline,
    Snackbar,
    Alert,
    LinearProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
} from "@mui/material";

import ImageDisplaySegmentation from "../components/ImageDisplaySegmentation";
import NavigationButtons from "../components/NavigationButtons";
import Controls from "../components/Controls";
import ThumbnailGrid from "../components/ThumbnailGrid";
import { AuthContext } from "../AuthContext";

function ProjectDetailPage() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { logoutUser } = useContext(AuthContext);

    const [project, setProject] = useState(null);
    const [images, setImages] = useState([]);
    const [coordinates, setCoordinates] = useState({});
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState({
        open: false,
        message: "",
        severity: "info",
    });
    const [openSettingsDialog, setOpenSettingsDialog] = useState(false);
    const [maxFrames, setMaxFrames] = useState(500);
    const [stride, setStride] = useState(1);
    const modelLoadedRef = useRef(false);
    const projectType = project?.type || "segmentation";

    const bustCache = (maskUrl) =>
        maskUrl ? `${maskUrl.split("?")[0]}?t=${Date.now()}` : null;

    const decorateImage = (img) => ({
        ...img,
        mask: bustCache(img.mask),
        coordinates: img.coordinates || [],
    });

    useEffect(() => {
        const fetchProject = async () => {
            try {
                const response = await axiosInstance.get(`projects/${projectId}/`);

                const decoratedImages = response.data.images.map(decorateImage);
                const coordinatesMap = {};
                decoratedImages.forEach((image) => {
                    if (image.coordinates && image.coordinates.length > 0) {
                        coordinatesMap[image.id] = image.coordinates.map((coord) => ({
                            x: coord.x,
                            y: coord.y,
                            include: coord.include,
                        }));
                    }
                });

                setCoordinates(coordinatesMap);
                setProject({ ...response.data, images: decoratedImages });
                setImages(decoratedImages);
            } catch (error) {
                console.error("Error fetching project details:", error);
                setNotification({
                    open: true,
                    message: "Error fetching project details.",
                    severity: "error",
                });
            }
        };

        fetchProject();
    }, [projectId]);

    useEffect(() => {
        modelLoadedRef.current = false;
    }, [projectId]);

    useEffect(() => {
        const requiresModel =
            projectType === "segmentation" ||
            projectType === "video_tracking_segmentation";
        if (!project || !requiresModel || modelLoadedRef.current) {
            return;
        }

        const loadModel = async () => {
            try {
                await axiosInstance.post(`model/load_model/`);
                modelLoadedRef.current = true;
                setNotification({
                    open: true,
                    message: "Model loaded and ready.",
                    severity: "success",
                });
            } catch (error) {
                console.error("Error loading model:", error);
                setNotification({
                    open: true,
                    message: "Error loading model.",
                    severity: "error",
                });
            }
        };

        loadModel();
    }, [projectType, projectId]);


    useEffect(() => {
    }, [images]);
    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === "a") {
                handlePrevImage();
            } else if (event.key === "d") {
                handleNextImage();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [currentIndex, images]);

    // Function to select and upload images
    const handleSelectFolder = async () => {
        if (projectType === "video_tracking_segmentation") {
            setOpenSettingsDialog(true); // Open the settings dialog
            return;
        }

        selectFiles();
    };

    const handleSettingsSubmit = () => {
        setOpenSettingsDialog(false);
        selectFiles(); // Proceed to file selection after getting maxFrames and stride
    };

    const selectFiles = async () => {
        const input = document.createElement("input");
        input.type = "file";

        if (projectType === "video_tracking_segmentation") {
            input.multiple = false;
            input.accept = "video/*";
        } else {
            input.multiple = true;
            input.accept = "image/*";
        }

        input.onchange = async (event) => {
            const selectedFiles = Array.from(event.target.files);
            const filteredFiles = selectedFiles.filter((file) =>
                projectType === "video_tracking_segmentation"
                    ? file.type.startsWith("video/")
                    : file.type.startsWith("image/")
            );

            if (images.length === 0) {
                setCurrentIndex(0);
            }
            setLoading(true);

            if (projectType === "video_tracking_segmentation" && filteredFiles.length > 0) {
                const formData = new FormData();
                formData.append("project_id", projectId);
                formData.append("video", filteredFiles[0]);
                formData.append("max_frames", maxFrames);
                formData.append("stride", stride);

                try {
                    const response = await axiosInstance.post(`video/`, formData, {
                        headers: {
                            "Content-Type": "multipart/form-data",
                        },
                    });

                    if (response.data) {
                        const newFrames = response.data.map(decorateImage);
                        setImages((prevImages) => [...prevImages, ...newFrames]);
                    }
                } catch (error) {
                    console.error("Error uploading video: ", error);
                    setNotification({
                        open: true,
                        message: "Error uploading video",
                        severity: "error",
                    });
                } finally {
                    setLoading(false);
                }

                return;
            }

            const batchSize = 50;
            for (let i = 0; i < filteredFiles.length; i += batchSize) {
                const batchFiles = filteredFiles.slice(i, i + batchSize);

                const formData = new FormData();
                formData.append("project_id", projectId);

                batchFiles.forEach((file) => {
                    formData.append("images", file);
                });

                try {
                    const response = await axiosInstance.post(`images/`, formData, {
                        headers: {
                            "Content-Type": "multipart/form-data",
                        },
                    });

                    if (response.data) {
                        const newImages = response.data.map(decorateImage);
                        setImages((prevImages) => [...prevImages, ...newImages]);
                    }
                } catch (error) {
                    console.error("Error uploading batch: ", error);
                    setNotification({
                        open: true,
                        message: "Error uploading batch",
                        severity: "error",
                    });
                }
            }

            setLoading(false);
        };

        input.click();
    };


    // Navigation functions
    const handleNextImage = () => {
        if (currentIndex < images.length - 1) {
            setCurrentIndex((prevIndex) => prevIndex + 1);
        }
    };

    const handlePrevImage = () => {
        if (currentIndex > 0) {
            setCurrentIndex((prevIndex) => prevIndex - 1);
        }
    };

    const handleThumbnailClick = (index) => {
        setCurrentIndex(index);
    };

    const handlePropagateMask = async () => {
        if (projectType !== "video_tracking_segmentation") {
            setNotification({
                open: true,
                message: "Mask propagation is only available for video projects.",
                severity: "info",
            });
            return;
        }
        if (!projectId) {
            setNotification({
                open: true,
                message: "Project ID is missing.",
                severity: "warning",
            });
            return;
        }

        try {
            setLoading(true);
            const response = await axiosInstance.post(`images/propagate_mask/`, {
                project_id: projectId
            });

            if (response.data) {
                setNotification({
                    open: true,
                    message: "Mask propagation completed successfully.",
                    severity: "success",
                });
                const updatedImages = response.data.map(decorateImage);
                const updatedCoordinates = {};
                updatedImages.forEach((img) => {
                    if (img.coordinates?.length) {
                        updatedCoordinates[img.id] = img.coordinates;
                    }
                });
                if (Object.keys(updatedCoordinates).length > 0) {
                    setCoordinates(updatedCoordinates);
                }
                setImages(updatedImages);
                setProject((prev) =>
                    prev ? { ...prev, images: updatedImages } : prev
                );
            }
        } catch (error) {
            console.error("Error propagating mask:", error);
            setNotification({
                open: true,
                message: "Error propagating mask.",
                severity: "error",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpdated = (updatedImage) => {
        const normalized = decorateImage(updatedImage);
        setImages((prev) =>
            prev.map((img) =>
                img.id === normalized.id ? { ...img, ...normalized } : img
            )
        );
        setProject((prev) =>
            prev
                ? {
                    ...prev,
                    images: prev.images.map((img) =>
                        img.id === normalized.id ? { ...img, ...normalized } : img
                    ),
                }
                : prev
        );
        if (normalized.coordinates) {
            setCoordinates((prev) => ({
                ...prev,
                [normalized.id]: normalized.coordinates.map((coord) => ({
                    x: coord.x,
                    y: coord.y,
                    include: coord.include,
                })),
            }));
        }
    };

    const handlePointsUpdated = (imageId, points) => {
        setCoordinates((prev) => ({
            ...prev,
            [imageId]: points,
        }));
        setImages((prev) =>
            prev.map((img) =>
                img.id === imageId ? { ...img, coordinates: points } : img
            )
        );
        setProject((prev) =>
            prev
                ? {
                    ...prev,
                    images: prev.images.map((img) =>
                        img.id === imageId ? { ...img, coordinates: points } : img
                    ),
                }
                : prev
        );
    };

    // Function to clear labels
    const handleClearLabels = async () => {
        if (!project) return;
        try {
            await axiosInstance.delete(`projects/${project.id}/delete_masks/`);
        } catch (error) {
            console.error('Error deleting masks:', error);
        }
        try {
            await axiosInstance.delete(`projects/${project.id}/delete_coordinates/`);
        } catch (error) {
            console.error('Error deleting coordinates:', error);
        }
        try {
            await axiosInstance.get(`images/unload_model/`);
        } catch (error) {
            console.error('Error unloading model:', error);
        }
        setCoordinates({});
        setImages((prev) =>
            prev.map((img) => ({
                ...img,
                mask: null,
                coordinates: [],
            }))
        );
        setProject((prev) =>
            prev
                ? {
                    ...prev,
                    images: prev.images.map((img) => ({
                        ...img,
                        mask: null,
                        coordinates: [],
                    })),
                }
                : prev
        );
        setNotification({
            open: true,
            message: "Labels cleared.",
            severity: "info",
        });
    };

    // Handle notification close
    const handleNotificationClose = () => {
        setNotification((prev) => ({ ...prev, open: false }));
    };

    const handleBackToRoot = () => {
        navigate("/");
    };

    return (
        <Box
            sx={{
                height: "100vh",
                display: "flex",
                flexDirection: "column",
                color: "white",
            }}
        >
            <CssBaseline />
            <Box mb={1} pt={2} pl={2} display="flex" alignItems="center">
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSelectFolder}
                >
                    {projectType === "video_tracking_segmentation" ? "Upload Video" : "Upload Images"}
                </Button>
                {/* Dialog for maxFrames and stride */}
                <Dialog open={openSettingsDialog} onClose={() => setOpenSettingsDialog(false)}>
                    <DialogTitle>Video Settings</DialogTitle>
                    <DialogContent>
                        <TextField
                            label="Max Number of Frames"
                            type="number"
                            fullWidth
                            margin="normal"
                            value={maxFrames}
                            onChange={(e) => setMaxFrames(Number(e.target.value))}
                        />
                        <TextField
                            label="Stride"
                            type="number"
                            fullWidth
                            margin="normal"
                            value={stride}
                            onChange={(e) => setStride(Number(e.target.value))}
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenSettingsDialog(false)}>Cancel</Button>
                        <Button onClick={handleSettingsSubmit} variant="contained" color="primary">
                            Confirm
                        </Button>
                    </DialogActions>
                </Dialog>

                {/* Project name */}
                <Typography variant="h4" color="primary" fontWeight="bold" sx={{ ml: 4 }}>
                    {project ? project.name : "Loading Project..."}
                </Typography>

                {/* New 'Back' button to go to root */}
                <Box sx={{ display: "flex", ml: "auto" }}>
                    <Button
                        variant="contained"
                        color="secondary"
                        onClick={handleBackToRoot}
                        sx={{ mr: 2 }}
                    >
                        Back
                    </Button>
                    <Button
                        variant="contained"
                        color="secondary"
                        onClick={logoutUser}
                        sx={{ mr: 2 }}
                    >
                        Logout
                    </Button>
                </Box>
            </Box>
            {loading && <LinearProgress />}
            {images.length > 0 ? (
                <Box
                    display="flex"
                    flexGrow={1}
                    p={2}
                    height="100vh"
                    overflow="auto"
                >
                    <Box width="350px" overflow="auto">
                        <ThumbnailGrid
                            images={images}
                            onThumbnailClick={handleThumbnailClick}
                            currentIndex={currentIndex}
                            coordinates={coordinates}
                        />
                    </Box>
                    <Box
                        flexGrow={1}
                        ml={2}
                        display="flex"
                        flexDirection="column"
                        overflow="hidden"
                    >
                        <Box
                            display="flex"
                            flexDirection="row"
                            flexGrow={1}
                            overflow="auto"
                        >
                            <Box
                                display="flex"
                                flexDirection="column"
                                flexGrow={1}
                                overflow="auto"
                            >
                                <Box flexGrow={1} display="flex" overflow="hidden">
                                    <ImageDisplaySegmentation
                                        image={images[currentIndex]}
                                        onImageUpdated={handleImageUpdated}
                                        onPointsUpdated={handlePointsUpdated}
                                    />
                                </Box>

                                <Box mr={1}>
                                    <Typography
                                        variant="body1"
                                        color="textSecondary"
                                        fontWeight="bold"
                                    >
                                        {coordinates[images[currentIndex].id]?.length
                                            ? `${coordinates[images[currentIndex].id].length} point(s)`
                                            : "No points saved"}
                                    </Typography>
                                </Box>
                            </Box>
                            <Box
                                width={60}
                                display="flex"
                                flexDirection="column"
                                justifyContent="center"
                                alignItems="flex-start"
                            >
                                <NavigationButtons
                                    onPrev={handlePrevImage}
                                    onNext={handleNextImage}
                                    disablePrev={currentIndex === 0}
                                    disableNext={currentIndex === images.length - 1}
                                />
                                <Controls
                                    projectType={projectType}
                                    onPropagate={handlePropagateMask}
                                    onClearLabels={handleClearLabels}
                                />
                            </Box>
                        </Box>
                    </Box>
                </Box>
            ) : (
                <Typography variant="body1" color="textSecondary" align="center">
                    No images loaded. Please upload images.
                </Typography>
            )}
            <Snackbar
                open={notification.open}
                autoHideDuration={6000}
                onClose={handleNotificationClose}
            >
                <Alert
                    onClose={handleNotificationClose}
                    severity={notification.severity}
                    sx={{ width: "100%" }}
                >
                    {notification.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}

export default ProjectDetailPage;
