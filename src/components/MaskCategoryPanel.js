import React, { useMemo, useState } from "react";
import {
    List,
    ListItem,
    ListItemText,
    IconButton,
    Button,
    TextField,
    Typography,
    Box,
    Input,
    Slider,
} from "@mui/material";
import { Delete } from "@mui/icons-material";

const toHex = (value) => {
    const hex = Number(value).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
};

const rgbaFrom = (hex, alpha = 1) => {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const parseColor = (color) => {
    if (!color) return { hex: "#00c800", alpha: 0.5 };
    if (color.startsWith("rgba")) {
        const parts = color
            .replace("rgba(", "")
            .replace(")", "")
            .split(",")
            .map((p) => p.trim());
        const [r, g, b, a] = parts;
        return {
            hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
            alpha: Number(a ?? 1),
        };
    }
    return { hex: color, alpha: 1 };
};

function MaskCategoryPanel({
    categories,
    activeCategoryId,
    onAddCategory,
    onSelectCategory,
    onDeleteCategory,
    onColorChange,
}) {
    const [newCategory, setNewCategory] = useState("");
    const [newColor, setNewColor] = useState("#00c800");
    const [newOpacity, setNewOpacity] = useState(0.5);

    const handleAdd = () => {
        if (newCategory.trim() !== "") {
            onAddCategory(newCategory, rgbaFrom(newColor, newOpacity));
            setNewCategory("");
        }
    };

    const renderCategory = (category) => {
        const { hex, alpha } = parseColor(category.color);
        return (
            <ListItem
                key={category.id}
                selected={activeCategoryId === category.id}
                onClick={() => onSelectCategory(category.id)}
                sx={{ cursor: "pointer", color: "white" }}
            >
                <Box
                    component="input"
                    type="color"
                    value={hex}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                        onColorChange(category.id, rgbaFrom(e.target.value, alpha))
                    }
                    style={{ width: 32, height: 24, border: "none", background: "transparent", marginRight: 8 }}
                />
                <Box sx={{ width: 90, mr: 1 }}>
                    <Slider
                        size="small"
                        min={0}
                        max={1}
                        step={0.05}
                        value={alpha}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(_, value) =>
                            onColorChange(category.id, rgbaFrom(hex, value))
                        }
                    />
                </Box>
                <ListItemText primary={category.name} primaryTypographyProps={{ color: "white" }} />
                <IconButton
                    onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCategory(category.id);
                    }}
                    edge="end"
                    size="small"
                    sx={{ color: "white" }}
                >
                    <Delete fontSize="small" />
                </IconButton>
            </ListItem>
        );
    };

    return (
        <Box sx={{ width: 260, p: 2, borderRight: "1px solid #333", height: "100%", boxSizing: "border-box", backgroundColor: "#1e1e1e", color: "white" }}>
            <Typography variant="h6" sx={{ mb: 1, color: "white" }}>Mask Categories</Typography>
            <List dense sx={{ maxHeight: "60vh", overflowY: "auto" }}>
                {categories.map((category) => renderCategory(category))}
            </List>
            <TextField
                label="New Category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                fullWidth
                margin="dense"
                InputLabelProps={{ style: { color: "white" } }}
                InputProps={{ style: { color: "white" } }}
            />
            <Box display="flex" alignItems="center" mt={1} mb={1}>
                <Typography variant="body2" sx={{ mr: 1, color: "white" }}>Color</Typography>
                <Input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    inputProps={{ style: { padding: 0, width: 40, height: 30 } }}
                />
                <Box sx={{ flexGrow: 1, ml: 1 }}>
                    <Slider
                        size="small"
                        min={0}
                        max={1}
                        step={0.05}
                        value={newOpacity}
                        onChange={(_, value) => setNewOpacity(value)}
                    />
                </Box>
            </Box>
            <Button variant="contained" fullWidth onClick={handleAdd}>
                Add Category
            </Button>
        </Box>
    );
}

export default MaskCategoryPanel;
