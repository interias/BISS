import type { MetadataRoute } from "next";

// Lets the phone install BISS to the home screen and open it without the browser bars.
// The colours are the brand colour of the icon and --biss-bg of globals.css.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BISS",
    short_name: "BISS",
    description: "Barcode · Image · Scan · Save",
    lang: "de",
    start_url: "/",
    display: "standalone",
    background_color: "#edf0ea",
    theme_color: "#B3245F",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
