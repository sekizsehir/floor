/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer, webpack }) => {
    // Ignore optional peer dependencies pulled in by wallet / Base Account SDKs
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp:
          /^(@react-native-async-storage\/async-storage|@x402\/.*|pino-pretty|lokijs|encoding)$/,
      }),
    );

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        "@react-native-async-storage/async-storage": false,
      };
    }

    return config;
  },
};

export default nextConfig;
