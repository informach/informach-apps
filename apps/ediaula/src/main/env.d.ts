/// <reference types="electron-vite/node" />

declare module "ffprobe-static" {
  const ffprobe: { path: string };
  export default ffprobe;
}
