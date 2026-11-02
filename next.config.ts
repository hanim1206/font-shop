import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // harfbuzz wasm 을 번들하지 않고 node_modules 에서 그대로 읽게 한다
  serverExternalPackages: ["subset-font", "harfbuzzjs"],
};

export default nextConfig;
