import { useCallback } from "react";
import axiosInstance from "../../../axiosInstance";
import type { ImageModel, MaskCategory } from "../../../types";
import type { ProjectDetailState } from "../useProjectDetailState";

type CategoryDependencies = {
  handleImageUpdated: (updatedImage: ImageModel) => void;
};

export const useCategoryActions = (state: ProjectDetailState, deps: CategoryDependencies) => {
  const {
    projectId,
    isBlocked,
    setActiveCategoryId,
    setCategories,
    setImages,
    setNotification,
    activeCategoryId,
    categories,
    currentImage,
    imageEndpointBase,
    isOCRProject,
    selectedShapeIds,
    setHighlightCategoryId,
    setHighlightSignal,
    showOcrCategoryPanel,
    setProject,
  } = state;
  const { handleImageUpdated } = deps;

  const handleAddCategory = useCallback(
    async (name: string, color: string) => {
      if (isBlocked) return;
      if (!projectId) return;
      try {
        const response = await axiosInstance.post<MaskCategory>("categories/", {
          name,
          color,
          project_id: projectId,
        });
        const newCat = response.data;
        setCategories((prev) => [...prev, newCat]);
        setActiveCategoryId(newCat.id);
      } catch (error) {
        console.error("Error adding category:", error);
        setNotification({
          open: true,
          message: "Failed to add category.",
          severity: "error",
        });
      }
    },
    [isBlocked, projectId, setActiveCategoryId, setCategories, setNotification]
  );

  const handleDeleteCategory = useCallback(
    async (categoryId: number) => {
      if (isBlocked) return;
      try {
        await axiosInstance.delete(`categories/${categoryId}/`);
        setCategories((prev) => {
          const filtered = prev.filter((c) => c.id !== categoryId);
          if (activeCategoryId === categoryId) {
            setActiveCategoryId(filtered[0]?.id || null);
          }
          return filtered;
        });
        setImages((prev) =>
          prev.map((img) => ({
            ...img,
            masks: (img.masks || []).filter((m) => m.category?.id !== categoryId),
          }))
        );
      } catch (error) {
        console.error("Error deleting category:", error);
        setNotification({
          open: true,
          message: "Failed to delete category.",
          severity: "error",
        });
      }
    },
    [activeCategoryId, isBlocked, setActiveCategoryId, setCategories, setImages, setNotification]
  );

  const handleColorChange = useCallback(
    async (categoryId: number, color: string) => {
      if (isBlocked) return;
      try {
        const response = await axiosInstance.patch<MaskCategory>(`categories/${categoryId}/`, { color });
        const updated = response.data;
        setCategories((prev) =>
          prev.map((c) => (c.id === categoryId ? { ...c, color: updated.color } : c))
        );
        setImages((prev) =>
          prev.map((img) => ({
            ...img,
            masks: (img.masks || []).map((m) =>
              m.category?.id === categoryId
                ? { ...m, category: { ...m.category, color: updated.color } }
                : m
            ),
          }))
        );
      } catch (error) {
        console.error("Error updating color:", error);
      }
    },
    [isBlocked, setCategories, setImages]
  );

  const handleRenameCategory = useCallback(
    async (categoryId: number, name: string) => {
      if (isBlocked) return;
      const current = categories.find((c) => c.id === categoryId);
      const oldName = current?.name;
      if (!current || !name.trim()) return;
      try {
        const response = await axiosInstance.patch<MaskCategory>(`categories/${categoryId}/`, { name });
        const updated = response.data;
        setCategories((prev) =>
          prev.map((c) => (c.id === categoryId ? { ...c, name: updated.name } : c))
        );
        setImages((prev) =>
          prev.map((img) => ({
            ...img,
            ocr_annotations: (img.ocr_annotations || []).map((ann) =>
              oldName && ann.category === oldName ? { ...ann, category: updated.name } : ann
            ),
          }))
        );
        setProject((prev) =>
          prev
            ? {
                ...prev,
                images: prev.images.map((img) => ({
                  ...img,
                  ocr_annotations: (img.ocr_annotations || []).map((ann) =>
                    oldName && ann.category === oldName ? { ...ann, category: updated.name } : ann
                  ),
                })),
                categories: prev.categories.map((c) =>
                  c.id === categoryId ? { ...c, name: updated.name } : c
                ),
              }
            : prev
        );
      } catch (error) {
        console.error("Error renaming category:", error);
        setNotification({
          open: true,
          message: "Failed to rename category.",
          severity: "error",
        });
      }
    },
    [categories, isBlocked, setCategories, setImages, setNotification, setProject]
  );

  const applyCategoryToSelection = useCallback(
    async (categoryId: number) => {
      if (!isOCRProject || !currentImage || !selectedShapeIds.length) return;
      const category = categories.find((c) => c.id === categoryId);
      if (!category) return;
      const selectedSet = new Set(selectedShapeIds);
      const updatedAnnotations =
        currentImage.ocr_annotations?.map((s) =>
          selectedSet.has(s.id) ? { ...s, category: category.name } : s
        ) || [];
      const updatedImage: ImageModel = {
        ...currentImage,
        ocr_annotations: updatedAnnotations,
      };
      handleImageUpdated(updatedImage);
      try {
        await axiosInstance.post(`${imageEndpointBase}/${currentImage.id}/ocr_annotations/`, {
          shapes: updatedAnnotations.filter((a) => selectedSet.has(a.id)),
        });
      } catch (error) {
        console.error("Error applying category to annotation:", error);
        setNotification({
          open: true,
          message: "Failed to update category.",
          severity: "error",
        });
      }
    },
    [
      categories,
      currentImage,
      handleImageUpdated,
      imageEndpointBase,
      isOCRProject,
      selectedShapeIds,
      setNotification,
    ]
  );

  const handleSelectCategory = useCallback(
    (categoryId: number) => {
      if (isBlocked) return;
      setActiveCategoryId(categoryId);
      setHighlightCategoryId(categoryId);
      setHighlightSignal((prev) => prev + 1);
      if (isOCRProject && showOcrCategoryPanel) {
        applyCategoryToSelection(categoryId);
      }
    },
    [
      applyCategoryToSelection,
      isBlocked,
      isOCRProject,
      setActiveCategoryId,
      setHighlightCategoryId,
      setHighlightSignal,
      showOcrCategoryPanel,
    ]
  );

  const handleRequireCategory = useCallback(() => {
    setNotification({
      open: true,
      message: "Create/select a category before adding points.",
      severity: "info",
    });
  }, [setNotification]);

  return {
    handleAddCategory,
    handleDeleteCategory,
    handleColorChange,
    handleRenameCategory,
    applyCategoryToSelection,
    handleSelectCategory,
    handleRequireCategory,
  };
};
