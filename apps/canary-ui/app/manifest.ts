import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f9f9f9",
    description:
      "Local web viewer for canary sessions — browse, organize, and search recorded sessions.",
    display: "standalone",
    icons: [
      { sizes: "any", src: "/icon.svg", type: "image/svg+xml" },
      { sizes: "180x180", src: "/apple-icon", type: "image/png" },
    ],
    name: "Canary",
    short_name: "Canary",
    start_url: "/",
    theme_color: "#f9f9f9",
  };
}
