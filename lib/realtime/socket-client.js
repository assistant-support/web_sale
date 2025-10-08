import { io } from 'socket.io-client'

let socket = null

export function getSocket() {
    if (socket) return socket
    const url = process.env.NEXT_PUBLIC_REALTIME_URL
    socket = io(url, {
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 3000,
    })
    socket.on('connect', () => console.log('[socket] connected', socket.id))
    socket.on('disconnect', (r) => console.warn('[socket] disconnected:', r))
    socket.on('connect_error', (e) => console.error('[socket] error:', e?.message || e))
    return socket
}

export function disconnectSocket() {
    if (socket) socket.disconnect()
    socket = null
}
