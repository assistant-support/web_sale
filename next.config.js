import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Tránh Turbopack chọn nhầm root (lockfile ở C:\Users\thanh) → giảm RAM compile & lệch module
    turbopack: {
        root: __dirname,
    },
    experimental: {
        serverActions: {
            bodySizeLimit: '500mb',
        },
    },
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
                hostname: 's120-25-ava-talk.zadn.vn',
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
            {
                protocol: 'https',
                hostname: 'scontent.fdad5-1.fna.fbcdn.net',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'scontent.fdad5-1.fna.fbcdn.net',
                port: '',
                pathname: '/**',
            },
        ],
    },
    output: 'standalone',
};

export default nextConfig;
