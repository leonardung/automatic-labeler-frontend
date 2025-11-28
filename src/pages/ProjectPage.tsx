import React, { useState, useEffect, useContext } from "react";
import axiosInstance from "../axiosInstance";
import ProjectActions from "../components/ProjectAction";
import {
  Container, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Box, Card, CardContent, Divider, Stack
} from "@mui/material";
import { AuthContext } from "../AuthContext";
import { useNavigate } from "react-router-dom";
import type { Project, ProjectType } from "../types";

interface NewProjectPayload {
  name: string;
  type: ProjectType;
}

const projectTypes: { value: ProjectType; label: string }[] = [
  { value: "segmentation", label: "Segmentation" },
  { value: "video_tracking_segmentation", label: "Video Tracking Segmentation" },
];

const ProjectPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [newProject, setNewProject] = useState<NewProjectPayload>({ name: "", type: "segmentation" });
  const { logoutUser } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleLogout = () => {
    logoutUser();
    navigate("/login");
  };

  const fetchProjects = async () => {
    const response = await axiosInstance.get<Project[]>("projects/");
    setProjects(response.data);
  };

  const handleCreateProject = async () => {
    try {
      const response = await axiosInstance.post<Project>("projects/", newProject);
      const projectId = response.data.id;
      setOpenCreateDialog(false);
      fetchProjects();
      navigate(`/projects/${projectId}`);
    } catch (error) {
      console.error("Error creating project:", error);
    }
  };

  const handleOpenDeleteDialog = (project: Project) => {
    setSelectedProject(project);
    setOpenDeleteDialog(true);
    setDeleteConfirmation("");
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    if (deleteConfirmation === selectedProject.name) {
      await axiosInstance.delete(`projects/${selectedProject.id}/`);
      setOpenDeleteDialog(false);
      fetchProjects();
    } else {
      alert("Project name doesn't match. Please enter it correctly.");
    }
  };

  return (
    <Container maxWidth="lg" sx={{ pt: 6, pb: 5 }}>
      <Box
        sx={{
          border: "1px solid #1f2a3d",
          borderRadius: 3,
          p: 3,
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
          background: "linear-gradient(140deg, rgba(255,255,255,0.02), rgba(17,24,39,0.65))",
          backdropFilter: "blur(8px)",
        }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h4" sx={{ mb: 0.5 }}>
              Projects
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage your datasets and jump back into labeling.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            color="secondary"
            onClick={handleLogout}
            sx={{ borderColor: "rgba(255,255,255,0.25)" }}
          >
            Logout
          </Button>
        </Box>
        <Divider sx={{ my: 3, borderColor: "rgba(255,255,255,0.08)" }} />
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Your projects
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={() => setOpenCreateDialog(true)}
            sx={{ boxShadow: "0 12px 30px rgba(90,216,255,0.25)" }}
          >
            Create New Project
          </Button>
        </Box>
        <Box mt={3}>
          {projects.map((project) => (
            <Card
              key={project.id}
              variant="outlined"
              sx={{
                mb: 2.5,
                position: "relative",
                overflow: "hidden",
                "&:before": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(120deg, rgba(90,216,255,0.06), transparent 60%)",
                  pointerEvents: "none",
                },
                "&:hover": {
                  borderColor: "rgba(90,216,255,0.5)",
                  boxShadow: "0 16px 45px rgba(0,0,0,0.5)",
                },
              }}
            >
              <CardContent sx={{ position: "relative" }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                  <Typography variant="h6" fontWeight="bold">
                    {project.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {projectTypes.find((type) => type.value === project.type)?.label || "Unknown Type"}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={3} mt={1.5} mb={1} flexWrap="wrap">
                  <Typography color="text.secondary">
                    Uploaded: <Typography component="span" color="text.primary" fontWeight={600}>{project.images.length}</Typography>
                  </Typography>
                  <Typography color="text.secondary">
                    Labeled: <Typography component="span" color="text.primary" fontWeight={600}>{project.images.filter((img) => img.is_label).length}</Typography>
                  </Typography>
                </Stack>
                <ProjectActions
                  project={project}
                  handleOpenDeleteDialog={handleOpenDeleteDialog}
                />
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>

      <Dialog
        open={openCreateDialog}
        onClose={() => setOpenCreateDialog(false)}
        sx={{ "& .MuiDialog-paper": { width: "400px", maxWidth: "400px" } }}
      >
        <DialogTitle>Create New Project</DialogTitle>
        <DialogContent>
          <TextField
            label="Project Name"
            fullWidth
            margin="normal"
            value={newProject.name}
            onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
          />
          <TextField
            label="Project Type"
            select
            fullWidth
            margin="normal"
            value={newProject.type}
            onChange={(e) => setNewProject({ ...newProject, type: e.target.value as ProjectType })}
          >
            {projectTypes.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreateDialog(false)}>Cancel</Button>
          <Button onClick={handleCreateProject} variant="contained" color="primary">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openDeleteDialog} onClose={() => setOpenDeleteDialog(false)}>
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the project <strong>{selectedProject?.name}</strong>?
            Please enter the project name to confirm.
          </Typography>
          <TextField
            label="Enter Project Name"
            fullWidth
            margin="normal"
            value={deleteConfirmation}
            onChange={(e) => setDeleteConfirmation(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)}>Cancel</Button>
          <Button onClick={handleDeleteProject} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ProjectPage;
