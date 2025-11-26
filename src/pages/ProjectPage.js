import React, { useState, useEffect, useContext } from 'react';
import axiosInstance from '../axiosInstance';
import ProjectActions from '../components/ProjectAction'
import {
    Container, Typography, Button, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, MenuItem, Box, Card, CardContent
} from '@mui/material';
import { AuthContext } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
const ProjectPage = () => {
    const [projects, setProjects] = useState([]);
    const [openCreateDialog, setOpenCreateDialog] = useState(false);
    const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
    const [selectedProject, setSelectedProject] = useState(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [newProject, setNewProject] = useState({ name: '', type: 'segmentation' });
    const { logoutUser } = useContext(AuthContext);
    const navigate = useNavigate();
    const projectTypes = [
        { value: 'segmentation', label: 'Segmentation' },
        { value: 'video_tracking_segmentation', label: 'Video Tracking Segmentation' },
    ];

    useEffect(() => {
        fetchProjects();
    }, []);
    const handleLogout = () => {
        logoutUser();
        navigate('/login');
    };
    const fetchProjects = async () => {
        const response = await axiosInstance.get('projects/');
        setProjects(response.data);
    };

    const handleCreateProject = async () => {
        try {
            const response = await axiosInstance.post('projects/', newProject);
            const projectId = response.data.id;
            setOpenCreateDialog(false);
            fetchProjects();
            navigate(`/projects/${projectId}`);
        } catch (error) {
            console.error('Error creating project:', error);
        }
    };

    const handleOpenDeleteDialog = (project) => {
        setSelectedProject(project);
        setOpenDeleteDialog(true);
        setDeleteConfirmation('');
    };

    const handleDeleteProject = async () => {
        if (deleteConfirmation === selectedProject.name) {
            await axiosInstance.delete(`projects/${selectedProject.id}/`);
            setOpenDeleteDialog(false);
            fetchProjects();
        } else {
            alert("Project name doesn't match. Please enter it correctly.");
        }
    };

    return (
        <Container>
            <Box mt={5}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h4">Projects</Typography>
                    <Button variant="outlined" color="secondary" onClick={handleLogout}>
                        Logout
                    </Button>
                </Box>
                <Box mt={2}>
                    <Button variant="contained" color="primary" onClick={() => setOpenCreateDialog(true)}>
                        Create New Project
                    </Button>
                </Box>
                <Box mt={2}>
                    {projects.map((project) => (
                        <Card key={project.id} variant="outlined" sx={{ mb: 2 }}>
                            <CardContent>
                                <Typography variant="h6" fontWeight="bold">{project.name}</Typography>
                                <Typography>Type: {projectTypes.find((type) => type.value === project.type)?.label || 'Unknown Type'}</Typography>
                                <Typography>
                                    Number of Uploaded Images: {project.images.length}
                                </Typography>
                                <Typography>
                                    Number of Labeled Images: {
                                        project.images.filter((img) => img.is_label).length
                                    }
                                </Typography>
                                <ProjectActions
                                    project={project}
                                    handleOpenDeleteDialog={handleOpenDeleteDialog}
                                />
                            </CardContent>
                        </Card>
                    ))}
                </Box>
            </Box>

            {/* Create Project Dialog */}
            <Dialog
                open={openCreateDialog}
                onClose={() => setOpenCreateDialog(false)}
                sx={{ '& .MuiDialog-paper': { width: '400px', maxWidth: '400px' } }}
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
                        onChange={(e) => setNewProject({ ...newProject, type: e.target.value })}
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


            {/* Delete Project Dialog */}
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
