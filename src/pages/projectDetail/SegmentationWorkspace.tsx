import React from "react";
import { Box } from "@mui/material";
import ImageDisplaySegmentation from "../../components/ImageDisplaySegmentation";
import NavigationButtons from "../../components/NavigationButtons";
import Controls from "../../components/Controls";
import PagesPanel from "../../components/PagesPanel";
import ResizablePanel from "../../components/ResizablePanel";
import MaskCategoryPanel from "../../components/MaskCategoryPanel";
import TextPromptMaskForm from "../../components/TextPromptMaskForm";
import ViewportControls from "./ViewportControls";
import type { ImageModel, MaskCategory, ProjectType, SegmentationPoint } from "../../types";
import type { ViewportControls as ViewportControlsType } from "./types";

interface SegmentationWorkspaceProps {
  images: ImageModel[];
  currentIndex: number;
  categories: MaskCategory[];
  activeCategoryId: number | null;
  highlightCategoryId: number | null;
  highlightSignal: number;
  promptLoading: boolean;
  loading: boolean;
  isBlocked: boolean;
  projectType: ProjectType;
  onGenerateFromPrompt: (promptText: string, maxMasks: number, threshold: number) => void;
  onSelectCategory: (categoryId: number) => void;
  onAddCategory: (name: string, color: string) => void;
  onDeleteCategory: (categoryId: number) => void;
  onColorChange: (categoryId: number, color: string) => void;
  onImageUpdated: (image: ImageModel) => void;
  onPointsUpdated: (imageId: number, categoryId: number, points: SegmentationPoint[]) => void;
  onRequireCategory: () => void;
  onStartBlocking: (message?: string) => void;
  onStopBlocking: () => void;
  onPrevImage: () => void;
  onNextImage: () => void;
  onPropagateMask: () => void;
  onClearLabels: () => void;
  onThumbnailClick: (index: number) => void;
  onDeleteImages: (imageIds: number[]) => void;
  onClearAnnotationsForImages: (imageIds: number[]) => void;
  viewportControls: ViewportControlsType | null;
  onRegisterViewportControls: (controls: ViewportControlsType | null) => void;
}

const SegmentationWorkspace = ({
  images,
  currentIndex,
  categories,
  activeCategoryId,
  highlightCategoryId,
  highlightSignal,
  promptLoading,
  loading,
  isBlocked,
  projectType,
  onGenerateFromPrompt,
  onSelectCategory,
  onAddCategory,
  onDeleteCategory,
  onColorChange,
  onImageUpdated,
  onPointsUpdated,
  onRequireCategory,
  onStartBlocking,
  onStopBlocking,
  onPrevImage,
  onNextImage,
  onPropagateMask,
  onClearLabels,
  onThumbnailClick,
  onDeleteImages,
  onClearAnnotationsForImages,
  viewportControls,
  onRegisterViewportControls,
}: SegmentationWorkspaceProps) => (
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
          overflow: "hidden",
          height: "100%",
          minHeight: 0,
          backgroundColor: "#0f1624",
          borderRight: "1px solid #1f2a3d",
          boxShadow: "inset -1px 0 0 rgba(255,255,255,0.04)",
        }}
        contentSx={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100%",
          gap: 1,
          p: 2,
        }}
      >
        <TextPromptMaskForm
          disabled={images.length === 0 || isBlocked}
          loading={promptLoading || loading || isBlocked}
          onSubmit={onGenerateFromPrompt}
        />
        <Box
          sx={{
            minHeight: 180,
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <MaskCategoryPanel
            categories={categories}
            activeCategoryId={activeCategoryId}
            onSelectCategory={onSelectCategory}
            onAddCategory={onAddCategory}
            onDeleteCategory={onDeleteCategory}
            onColorChange={onColorChange}
          />
        </Box>
      </ResizablePanel>
      <Box flexGrow={1} display="flex" flexDirection="column" overflow="hidden" p={2}>
        <Box display="flex" justifyContent="flex-end" mb={1}>
          <ViewportControls controls={viewportControls} disabled={isBlocked} />
        </Box>
        <Box display="flex" flexGrow={1} overflow="hidden">
          <Box flexGrow={1} display="flex" overflow="hidden">
            <ImageDisplaySegmentation
              image={images[currentIndex]}
              categories={categories}
              activeCategoryId={activeCategoryId}
              highlightCategoryId={highlightCategoryId}
              highlightSignal={highlightSignal}
              onImageUpdated={onImageUpdated}
              onPointsUpdated={onPointsUpdated}
              disabled={isBlocked}
              onStartBlocking={onStartBlocking}
              onStopBlocking={onStopBlocking}
              onRequireCategory={onRequireCategory}
              onRegisterViewportControls={onRegisterViewportControls}
            />
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
        onDeleteImages={onDeleteImages}
        onClearAnnotations={onClearAnnotationsForImages}
      />
    </Box>
  </Box>
);

export default SegmentationWorkspace;
