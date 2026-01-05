import React from "react";
import {
  Box,
  Button,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import {
  PlayArrow,
} from "@mui/icons-material";
import ImageDisplayOCR from "../../components/ImageDisplayOCR";
import NavigationButtons from "../../components/NavigationButtons";
import Controls from "../../components/Controls";
import PagesPanel from "../../components/PagesPanel";
import ResizablePanel from "../../components/ResizablePanel";
import OCRControls from "../../components/OCRControls";
import OCRTextList from "../../components/OCRTextList";
import OcrCategoryPanel from "../../components/OcrCategoryPanel";
import ViewportControls from "./ViewportControls";
import type { ImageModel, MaskCategory, OcrModelConfig, ProjectType, SelectedOcrModels } from "../../types";
import type { OCRTool, ViewportControls as ViewportControlsType } from "./types";

interface OcrWorkspaceProps {
  images: ImageModel[];
  currentIndex: number;
  currentImage?: ImageModel;
  projectType: ProjectType;
  projectId?: string;
  imageEndpointBase: string;
  categories: MaskCategory[];
  activeCategoryId: number | null;
  showOcrCategoryPanel: boolean;
  maxOcrCategoryHeight: number;
  ocrCategoryPanelRef: React.RefObject<HTMLDivElement>;
  selectedShapeIds: string[];
  selectionScrollSignal: number;
  ocrTool: OCRTool;
  showOcrText: boolean;
  isBlocked: boolean;
  isBulkOcrRunning: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isApplyingHistory: boolean;
  selectedOcrModels: SelectedOcrModels;
  ocrModelConfig: OcrModelConfig | null;
  onToggleOcrModel: (model: keyof SelectedOcrModels) => void;
  onSelectCategory: (categoryId: number) => void;
  onAddCategory: (name: string, color: string) => void;
  onDeleteCategory: (categoryId: number) => void;
  onColorChange: (categoryId: number, color: string) => void;
  onRenameCategory: (categoryId: number, name: string) => void;
  onSelectShapesFromList: (ids: string[]) => void;
  onSelectShapesFromImage: (ids: string[]) => void;
  onOcrToolChange: (tool: OCRTool) => void;
  onToggleShowOcrText: (next: boolean) => void;
  onImageUpdated: (image: ImageModel) => void;
  onStartBlocking: (message?: string) => void;
  onStopBlocking: () => void;
  onRunInference: () => void;
  onRunInferenceAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPrevImage: () => void;
  onNextImage: () => void;
  onThumbnailClick: (index: number) => void;
  onDeleteImages: (imageIds: number[]) => void;
  onClearAnnotationsForImages: (imageIds: number[]) => void;
  onSetValidationForImages: (imageIds: number[], nextValidated: boolean) => void;
  onRunInferenceForImages: (imageIds: number[]) => void;
  onPropagateMask: () => void;
  onClearLabels: () => void;
  viewportControls: ViewportControlsType | null;
  onRegisterViewportControls: (controls: ViewportControlsType | null) => void;
  onSetValidation: (nextValidated: boolean) => void;
}

const OcrWorkspace = ({
  images,
  currentIndex,
  currentImage,
  projectType,
  projectId,
  imageEndpointBase,
  categories,
  activeCategoryId,
  showOcrCategoryPanel,
  maxOcrCategoryHeight,
  ocrCategoryPanelRef,
  selectedShapeIds,
  selectionScrollSignal,
  ocrTool,
  showOcrText,
  isBlocked,
  isBulkOcrRunning,
  canUndo,
  canRedo,
  isApplyingHistory,
  selectedOcrModels,
  ocrModelConfig,
  onToggleOcrModel,
  onSelectCategory,
  onAddCategory,
  onDeleteCategory,
  onColorChange,
  onRenameCategory,
  onSelectShapesFromList,
  onSelectShapesFromImage,
  onOcrToolChange,
  onToggleShowOcrText,
  onImageUpdated,
  onStartBlocking,
  onStopBlocking,
  onRunInference,
  onRunInferenceAll,
  onUndo,
  onRedo,
  onPrevImage,
  onNextImage,
  onThumbnailClick,
  onDeleteImages,
  onClearAnnotationsForImages,
  onSetValidationForImages,
  onRunInferenceForImages,
  onPropagateMask,
  onClearLabels,
  viewportControls,
  onRegisterViewportControls,
  onSetValidation,
}: OcrWorkspaceProps) => {
  const isValidated = Boolean(currentImage?.is_label);
  const hasUnvalidatedImages = images.some((image) => !image.is_label);

  return (
    <Box display="flex" flexDirection="column" flexGrow={1} height="100%" overflow="hidden">
      <Box display="flex" flexGrow={1} overflow="hidden">
        <ResizablePanel
          axis="horizontal"
          resizeFrom="right"
          defaultSize={380}
          minSize={300}
          maxSize={({ width }) => width * 0.5}
          sx={{
            flexShrink: 0,
            overflow: "auto",
            height: "100%",
            backgroundColor: "#0f1624",
            borderRight: "1px solid #1f2a3d",
            boxShadow: "inset -1px 0 0 rgba(255,255,255,0.04)",
          }}
          contentSx={{
            display: "flex",
            flexDirection: "column",
            minHeight: "100%",
            gap: 1.5,
            p: 2,
          }}
        >
          {currentImage && (
            <OCRControls
              image={currentImage}
              projectType={projectType}
              projectId={projectId}
              endpointBase={imageEndpointBase}
              onImageUpdated={onImageUpdated}
              onStartBlocking={onStartBlocking}
              onStopBlocking={onStopBlocking}
              selectedModels={selectedOcrModels}
              savedConfig={ocrModelConfig}
              onToggleModel={onToggleOcrModel}
              disabled={isBlocked}
            />
          )}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Button
              variant={isValidated ? "outlined" : "contained"}
              color="success"
              onClick={() => onSetValidation(!isValidated)}
              disabled={isBlocked || !currentImage}
              fullWidth
            >
              {isValidated ? "Unvalidate Page" : "Validate Page"}
            </Button>
            <Button
              variant="contained"
              startIcon={<PlayArrow />}
              color="secondary"
              onClick={onRunInference}
              disabled={isBlocked || !currentImage || isValidated}
              fullWidth
            >
              Run Inference
            </Button>
            <Button
              variant="outlined"
              startIcon={<PlayArrow />}
              color="secondary"
              onClick={onRunInferenceAll}
              disabled={isBlocked || isBulkOcrRunning || images.length === 0 || !hasUnvalidatedImages}
              fullWidth
            >
              Run Inference On All Pages
            </Button>
          </Box>
          {showOcrCategoryPanel && (
            <ResizablePanel
              axis="vertical"
              handlePosition="bottom-right"
              resizeFrom="bottom"
              defaultSize={maxOcrCategoryHeight}
              minSize={100}
              maxSize={maxOcrCategoryHeight}
              sx={{
                overflow: "auto",
                flexShrink: 0,
              }}
            >
              <OcrCategoryPanel
                ref={ocrCategoryPanelRef}
                categories={categories}
                activeCategoryId={activeCategoryId}
                onSelectCategory={onSelectCategory}
                onAddCategory={onAddCategory}
                onDeleteCategory={onDeleteCategory}
                onColorChange={onColorChange}
                onRenameCategory={onRenameCategory}
                disabled={isBlocked}
              />
            </ResizablePanel>
          )}
          {currentImage && (
            <ResizablePanel
              axis="vertical"
              resizeFrom="bottom"
              handlePosition="bottom-right"
              minSize={240}
              maxSize={({ height }) => height * 0.7}
              lockFlexOnResize
              sx={{
                overflow: "hidden",
                flexGrow: 1,
                flexShrink: 0,
                "& > *": { height: "100%" },
              }}
            >
              <OCRTextList
                image={currentImage}
                categories={categories}
                selectedShapeIds={selectedShapeIds}
                onSelectShapes={onSelectShapesFromList}
                onImageUpdated={onImageUpdated}
                disabled={isBlocked}
                endpointBase={imageEndpointBase}
                showCategories={showOcrCategoryPanel}
                scrollSignal={selectionScrollSignal}
              />
            </ResizablePanel>
          )}
        </ResizablePanel>
        <Box flexGrow={1} display="flex" flexDirection="column" overflow="hidden" p={2}>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            gap={1}
            mb={1}
          >
            <ToggleButtonGroup
              color="primary"
              value={ocrTool}
              exclusive
              size="small"
              onChange={(_, value: OCRTool | null) => value && onOcrToolChange(value)}
              sx={{ "& .MuiToggleButton-root": { minWidth: 80 } }}
            >
              <ToggleButton value="select">Select (S)</ToggleButton>
              <ToggleButton value="rect">Rect (R)</ToggleButton>
              <ToggleButton value="polygon">Polygon (P)</ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Switch
                size="small"
                checked={showOcrText}
                onChange={(e) => onToggleShowOcrText(e.target.checked)}
              />
              <Typography variant="body2" color="textSecondary">
                Show Recognized Text
              </Typography>
            </Box>
            <ViewportControls controls={viewportControls} disabled={isBlocked} />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Tooltip title="Undo (Ctrl+Z)">
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<UndoIcon />}
                    onClick={onUndo}
                    disabled={!canUndo || isBlocked || isApplyingHistory}
                  >
                    Undo
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="Redo (Ctrl+Y / Ctrl+Shift+Z)">
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RedoIcon />}
                    onClick={onRedo}
                    disabled={!canRedo || isBlocked || isApplyingHistory}
                  >
                    Redo
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Box>
          <Box display="flex" flexGrow={1} overflow="hidden">
            <Box flexGrow={1} display="flex" overflow="hidden">
              {currentImage && (
                <ImageDisplayOCR
                  image={currentImage}
                  activeTool={ocrTool}
                  categories={categories}
                  selectedShapeIds={selectedShapeIds}
                  onSelectShapes={onSelectShapesFromImage}
                  onImageUpdated={onImageUpdated}
                  disabled={isBlocked}
                  onStartBlocking={onStartBlocking}
                  onStopBlocking={onStopBlocking}
                  endpointBase={imageEndpointBase}
                  showTextLabels={showOcrText}
                  onRegisterViewportControls={onRegisterViewportControls}
                />
              )}
            </Box>
            <Box
              width={80}
              display="flex"
              flexDirection="column"
              justifyContent="center"
              alignItems="flex-start"
            >
              <NavigationButtons
                onPrev={onPrevImage}
                onNext={onNextImage}
                disablePrev={currentIndex === 0}
                disableNext={currentIndex === images.length - 1}
                disabled={isBlocked}
              />
              <Controls
                projectType={projectType}
                onPropagate={onPropagateMask}
                onClearLabels={onClearLabels}
                disabled={isBlocked}
              />
            </Box>
          </Box>
        </Box>
        <PagesPanel
          images={images}
          currentIndex={currentIndex}
          onSelectImage={onThumbnailClick}
          isBlocked={isBlocked}
          showOcrActions
          onDeleteImages={onDeleteImages}
          onClearAnnotations={onClearAnnotationsForImages}
          onValidateImages={onSetValidationForImages}
          onRunInference={onRunInferenceForImages}
        />
      </Box>
    </Box>
  );
};

export default OcrWorkspace;
