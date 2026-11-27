import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Güfi OS",
    short_name: "Güfi OS",
    start_url: "/",
    display: "standalone",
    background_color: "#fffafc",
    theme_color: "#ff3f76",
    icons: [{ src: "/brand/gufi-mark.png", sizes: "256x256", type: "image/png" }],
  };
}
