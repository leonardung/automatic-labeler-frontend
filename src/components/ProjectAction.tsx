import React, { ReactNode } from "react";
import { Button, Tooltip, Box, type ButtonProps } from "@mui/material";
import { Delete, ArrowForward } from "@mui/icons-material";
import type { Project } from "../types";

interface IconButtonWithTextProps {
  title: string;
  color: ButtonProps["color"];
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  children: ReactNode;
}

const IconButtonWithText: React.FC<IconButtonWithTextProps> = ({
  title,
  color,
  icon,
  onClick,
  children,
  href,
}) => {
  const buttonStyles = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 16px",
    minWidth: "auto",
    height: "42px",
    marginTop: "8px",
    marginRight: "12px",
    borderRadius: "12px",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    color: "inherit",
    boxShadow: "none",
    transition: "all 0.2s ease",
    "&:hover": {
      transform: "translateY(-1px)",
      backgroundColor: "rgba(90, 216, 255, 0.12)",
      boxShadow: "0 12px 24px rgba(0,0,0,0.35)",
    },
  };

  return (
    <Tooltip title={title} arrow>
      <Button
        variant="outlined"
        color={color}
        onClick={onClick}
        href={href}
        sx={buttonStyles}
        startIcon={icon}
      >
        {children}
      </Button>
    </Tooltip>
  );
};

interface ProjectActionsProps {
  project: Project;
  handleOpenDeleteDialog: (project: Project) => void;
}

const ProjectActions: React.FC<ProjectActionsProps> = ({ project, handleOpenDeleteDialog }) => {
  return (
    <Box display="flex" alignItems="center">
      <IconButtonWithText
        title="View Project"
        color="primary"
        icon={<ArrowForward />}
        href={`/projects/${project.id}`}
      >
        View Project
      </IconButtonWithText>
      <IconButtonWithText
        title="Delete Project"
        color="error"
        icon={<Delete />}
        onClick={() => handleOpenDeleteDialog(project)}
      >
        Delete Project
      </IconButtonWithText>
    </Box>
  );
};

export default ProjectActions;
