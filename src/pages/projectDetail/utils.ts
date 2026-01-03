import type { ImageModel, OCRAnnotation, ProjectSnapshot } from "../../types";

const bustCache = (url?: string | null): string | null => {
  return url ? `${url.split("?")[0]}?t=${Date.now()}` : null;
};

export const cloneOcrAnnotations = (annotations: OCRAnnotation[] = []) =>
  annotations.map((ann) => ({
    ...ann,
    points: ann.points.map((p) => ({ ...p })),
  }));

export const areOcrAnnotationsEqual = (
  a: OCRAnnotation[] = [],
  b: OCRAnnotation[] = []
) => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x.id.localeCompare(y.id));
  const sortedB = [...b].sort((x, y) => x.id.localeCompare(y.id));

  return sortedA.every((ann, idx) => {
    const other = sortedB[idx];
    if (!other) return false;
    if (
      ann.id !== other.id ||
      ann.type !== other.type ||
      ann.text !== other.text ||
      ann.category !== other.category
    ) {
      return false;
    }
    if (ann.points.length !== other.points.length) return false;
    return ann.points.every((pt, ptIdx) => {
      const otherPt = other.points[ptIdx];
      return Boolean(otherPt) && pt.x === otherPt.x && pt.y === otherPt.y;
    });
  });
};

export const normalizeOcrAnnotations = (annotations?: any[]) =>
  (annotations || []).map((a) => ({
    ...a,
    id: typeof a.id === "string" ? a.id : String(a.id ?? ""),
    type: a.type || a.shape_type || "rect",
    points: a.points || [],
  }));

export const decorateImage = (img: ImageModel): ImageModel => ({
  ...img,
  masks: (img.masks || []).map((m) => ({
    ...m,
    mask: bustCache(m.mask),
  })),
  ocr_annotations: normalizeOcrAnnotations(img.ocr_annotations),
});

export const formatSnapshotLabel = (snapshot: ProjectSnapshot) => {
  const title = (snapshot.name || "").trim();
  if (title) return title;
  return new Date(snapshot.created_at).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatSnapshotDate = (snapshot: ProjectSnapshot) => {
  return new Date(snapshot.created_at).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};
