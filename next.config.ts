import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les onglets ont ete renommes en anglais : on garde les anciennes adresses
  // vivantes pour les liens et onglets deja ouverts.
  async redirects() {
    return [
      { source: "/dashboard/:slug/produits", destination: "/dashboard/:slug/cost-of-goods", permanent: true },
      { source: "/dashboard/:slug/shipping", destination: "/dashboard/:slug/shipping-costs", permanent: true },
      { source: "/dashboard/:slug/charges", destination: "/dashboard/:slug/custom-costs", permanent: true },
      { source: "/dashboard/:slug/couts", destination: "/dashboard/:slug/cost-of-goods", permanent: true },
      { source: "/dashboard/:slug/sources", destination: "/dashboard/:slug/integrations", permanent: true },
    ];
  },
};

export default nextConfig;
