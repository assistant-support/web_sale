/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'lh3.googleusercontent.com',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'drive.google.com',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 's75-ava-talk.zadn.vn',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 's240-ava-talk.zadn.vn',
                port: '',
                pathname: '/**',
            },
        ],
    },
    output: 'standalone',
}

export default nextConfig;