import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource-variable/source-serif-4/wght.css";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "@fontsource-variable/noto-serif-sc/wght.css";
import "./styles.css";
import "./control-states.css";
import "./fonts.css";
import "./color-scheme.css";
import { startColorScheme } from "./lib/color-scheme";

// Apply the saved appearance before the first render so a dark reader does not flash light.
startColorScheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
