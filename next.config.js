/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      // ++ ADDED: Thêm cấu hình cho tên miền của Zalo
      {
        protocol: "https",
        hostname: "s75-ava-talk.zadn.vn",
      },
    ],
  },
  output: "standalone",
};

module.exports = nextConfig;
