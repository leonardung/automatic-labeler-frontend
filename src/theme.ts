import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#5ad8ff",
    },
    secondary: {
      main: "#ff6fb1",
    },
    background: {
      default: "#0b1020",
      paper: "#111827",
    },
    text: {
      primary: "#e8eff7",
      secondary: "#9fb4c9",
    },
  },
  typography: {
    fontFamily: '"Nunito", "Segoe UI", system-ui, -apple-system, sans-serif',
    h4: {
      fontWeight: 800,
      letterSpacing: "0.02em",
    },
    h6: {
      fontWeight: 700,
    },
    button: {
      fontWeight: 700,
      letterSpacing: "0.01em",
      textTransform: "none",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(circle at 20% 20%, rgba(90,216,255,0.08), transparent 25%), radial-gradient(circle at 80% 0%, rgba(255,111,177,0.1), transparent 22%), #0b1020",
          color: "#e8eff7",
          minHeight: "100vh",
        },
        "*, *::before, *::after": {
          boxSizing: "border-box",
        },
        "*": {
          scrollbarColor: "#1f2a3d #0b1020",
          scrollbarWidth: "thin",
        },
        "*::-webkit-scrollbar": {
          width: 10,
          height: 10,
        },
        "*::-webkit-scrollbar-track": {
          backgroundColor: "#0b1020",
        },
        "*::-webkit-scrollbar-thumb": {
          backgroundColor: "#1f2a3d",
          borderRadius: 999,
          border: "2px solid #0b1020",
        },
        "*::-webkit-scrollbar-thumb:hover": {
          backgroundColor: "#2b3a53",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: "1px solid #1f2a3d",
          background: "linear-gradient(145deg, #111827, #0c1324)",
          boxShadow: "0 20px 45px rgba(0, 0, 0, 0.45)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          fontWeight: 700,
        },
        containedPrimary: {
          boxShadow: "0 10px 30px rgba(90, 216, 255, 0.3)",
        },
        containedSecondary: {
          boxShadow: "0 10px 30px rgba(255, 111, 177, 0.25)",
        },
        outlinedSecondary: {
          borderColor: "rgba(255, 255, 255, 0.25)",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          border: "1px solid #1f2a3d",
          background: "#0f172a",
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderRadius: 12,
        },
      },
    },
  },
});

export default theme;
