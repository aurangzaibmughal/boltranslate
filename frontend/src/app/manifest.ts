import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BolTranslate | Urdu Voice to English",
    short_name: "BolTranslate",
    description: "Real-time Urdu voice to English translation powered by AI",
    start_url: "/",
    display: "standalone",
    background_color: "#090b10",
    theme_color: "#090b10",
    orientation: "portrait",
    icons: [
      {
        src: "/logo.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
