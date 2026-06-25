import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Sortie optimisée pour un déploiement serveur (VPS OVH, Docker)
  output: "standalone",
  // Racine de traçage = ce projet (évite la structure imbriquée du standalone)
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
