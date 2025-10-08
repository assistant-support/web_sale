'use server'

export async function emitToAll(event, payload) {
    const url = process.env.INTERNAL_REALTIME_API_URL
    const key = process.env.ADMIN_API_KEY // nếu socket server yêu cầu

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(key ? { 'x-api-key': key } : {}),
        },
        body: JSON.stringify({ event, payload }) // KHÔNG dùng room
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Emit failed: ${res.status} ${text}`)
    }
}
