import React, { useState } from "react";
import {
    Drawer,
    List,
    ListItem,
    ListItemText,
    IconButton,
    Button,
    TextField,
    Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { Delete } from "@mui/icons-material";

function MaskCategoryPanel({
    categories,
    onAddCategory,
    onSelectCategory,
    onDeleteCategory,
}) {
    const [open, setOpen] = useState(false);
    const [newCategory, setNewCategory] = useState("");
    const [selectedCategory, setSelectedCategory] = useState(null);

    const handleAdd = () => {
        if (newCategory.trim() !== "") {
            onAddCategory(newCategory);
            setNewCategory("");
        }
    };

    const handleCategoryClick = (category) => {
        setSelectedCategory(category);
        onSelectCategory(category);
    };

    const handleDelete = (e, category) => {
        // Prevent the click from also selecting the category
        e.stopPropagation();
        // Clear selection if the deleted category is currently selected
        if (category === selectedCategory) {
            setSelectedCategory(null);
        }
        onDeleteCategory(category);
    };

    return (
        <>
            <IconButton
                onClick={() => setOpen(true)}
                sx={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    zIndex: 2,
                    backgroundColor: "rgba(250,250,250, 0.4)",
                }}
            >
                <MenuIcon />
            </IconButton>
            <Drawer anchor="left" open={open} onClose={() => setOpen(false)}>
                <div style={{ width: 350, padding: 16 }}>
                    <Typography variant="h6">Mask Categories</Typography>
                    <List                    >
                        {categories.map((category, idx) => (
                            <ListItem
                                button
                                key={idx}
                                selected={selectedCategory === category}
                                onClick={() => handleCategoryClick(category)}
                            >
                                <IconButton
                                    onClick={(e) => handleDelete(e, category)}
                                    edge="start"
                                    size="small"
                                >
                                    <Delete fontSize="small" />
                                </IconButton>
                                <ListItemText primary={category} />
                            </ListItem>
                        ))}
                    </List>
                    <TextField
                        label="New Category"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        fullWidth
                        margin="dense"
                    />
                    <Button variant="contained" fullWidth onClick={handleAdd}>
                        Add Category
                    </Button>
                </div>
            </Drawer >
        </>
    );
}

export default MaskCategoryPanel;
