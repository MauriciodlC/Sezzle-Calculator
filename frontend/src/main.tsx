import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Calculator } from "./components/Calculator";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <Calculator />
  </StrictMode>,
);
