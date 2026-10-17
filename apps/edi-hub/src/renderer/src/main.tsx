import React from "react";
import { createRoot } from "react-dom/client";
import { Hub } from "./hub";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/jetbrains-mono";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("Edi Hub root element is missing");
createRoot(root).render(
  <React.StrictMode>
    <Hub />
  </React.StrictMode>,
);
