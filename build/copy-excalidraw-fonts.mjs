import { cp, rm } from "node:fs/promises";

const source = new URL(
  "../node_modules/@excalidraw/excalidraw/dist/prod/fonts/",
  import.meta.url,
);
const destination = new URL("../lib/editor/fonts/", import.meta.url);

await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true, force: true });
