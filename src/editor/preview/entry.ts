import { bootstrapPreview } from "./main.ts";

const root = document.getElementById("root");
if (root === null) throw new Error("diagram preview root is missing");

void bootstrapPreview(root, globalThis.location.search);
