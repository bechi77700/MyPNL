import type { MetadataRoute } from "next";

/** Manifeste PWA : MyPNL s'installe sur l'ecran d'accueil du telephone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyPNL",
    short_name: "MyPNL",
    description: "Profit net, P&L et commandes de tes boutiques Shopify.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0b0d",
    theme_color: "#0a0b0d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
