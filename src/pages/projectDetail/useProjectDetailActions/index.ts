import type { ProjectDetailState } from "../useProjectDetailState";
import { useAsyncActions } from "./useAsyncActions";
import { useCategoryActions } from "./useCategoryActions";
import { useLabelActions } from "./useLabelActions";
import { useMediaActions } from "./useMediaActions";
import { useMiscActions } from "./useMiscActions";
import { useOcrActions } from "./useOcrActions";
import { useProjectActions } from "./useProjectActions";
import { useSnapshotActions } from "./useSnapshotActions";

export const useProjectDetailActions = (state: ProjectDetailState) => {
  const asyncActions = useAsyncActions(state);
  const projectActions = useProjectActions(state);

  const ocrActions = useOcrActions(state, {
    startBlocking: asyncActions.startBlocking,
    stopBlocking: asyncActions.stopBlocking,
  });

  const categoryActions = useCategoryActions(state, {
    handleImageUpdated: ocrActions.handleImageUpdated,
  });

  const labelActions = useLabelActions(state, {
    startLoading: asyncActions.startLoading,
    stopLoading: asyncActions.stopLoading,
    startBlocking: asyncActions.startBlocking,
    stopBlocking: asyncActions.stopBlocking,
    clearProgressPolling: asyncActions.clearProgressPolling,
    startProgressPolling: asyncActions.startProgressPolling,
    recordOcrHistory: ocrActions.recordOcrHistory,
  });

  const snapshotActions = useSnapshotActions(state, {
    startLoading: asyncActions.startLoading,
    stopLoading: asyncActions.stopLoading,
    startBlocking: asyncActions.startBlocking,
    stopBlocking: asyncActions.stopBlocking,
    applyProjectPayload: projectActions.applyProjectPayload,
  });

  const mediaActions = useMediaActions(state, {
    startLoading: asyncActions.startLoading,
    stopLoading: asyncActions.stopLoading,
    startBlocking: asyncActions.startBlocking,
    stopBlocking: asyncActions.stopBlocking,
    startDatasetProgressPolling: asyncActions.startDatasetProgressPolling,
    clearDatasetProgressPolling: asyncActions.clearDatasetProgressPolling,
    fetchProject: projectActions.fetchProject,
  });

  const miscActions = useMiscActions(state);

  return {
    ...asyncActions,
    ...projectActions,
    ...mediaActions,
    ...snapshotActions,
    ...ocrActions,
    ...categoryActions,
    ...labelActions,
    ...miscActions,
  };
};

export type ProjectDetailActions = ReturnType<typeof useProjectDetailActions>;
