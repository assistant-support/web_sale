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
            {
                protocol: 'https',
                hostname: 'placehold.co',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'pancake.vn',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'scontent.cdninstagram.com',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'content.pancake.vn',
                port: '',
                pathname: '/**',
            },
        ],
    },
    output: 'standalone',
    experimental: {
        serverActions: {
            bodySizeLimit: '5mb',
        },
    },
}

export default nextConfig;