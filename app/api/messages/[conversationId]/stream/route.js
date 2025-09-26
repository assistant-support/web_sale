import { getMessagesAction } from '@/app/pancake/[pageId]/actions'; 

export const dynamic = 'force-dynamic'; // Đảm bảo route này không bị cache

export async function GET(request, { params }) {
    const { conversationId } = await params;
    // Lấy pageId và accessToken từ query params hoặc cách khác bạn lưu trữ
    const searchParams = request.nextUrl.searchParams;
    const pageId = searchParams.get('pageId');
    const accessToken = searchParams.get('accessToken');

    if (!pageId || !accessToken) {
        return new Response('Missing pageId or accessToken', { status: 400 });
    }

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    const writeEvent = (data) => {
        writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    };

    let lastMessageTimestamp = new Date(0).toISOString();

    // Hàm thực hiện polling
    const pollForMessages = async () => {
        try {
            const result = await getMessagesAction(pageId, accessToken, conversationId);
            if (result.success && result.data.length > 0) {

                // Lọc ra chỉ những tin nhắn thực sự mới
                const newMessages = result.data.filter(msg => msg.inserted_at > lastMessageTimestamp);

                if (newMessages.length > 0) {
                    console.log(`[POLLING] Found ${newMessages.length} new message(s) for ${conversationId}`);

                    // Gửi từng tin nhắn mới xuống client
                    for (const message of newMessages) {
                        writeEvent({ type: 'new-message', payload: message });
                    }

                    // Cập nhật lại timestamp của tin nhắn cuối cùng
                    lastMessageTimestamp = newMessages[newMessages.length - 1].inserted_at;
                }
            }
        } catch (error) {
            console.error(`[POLLING] Error for ${conversationId}:`, error);
        }
    };
    pollForMessages();
    const intervalId = setInterval(pollForMessages, 1000);
    request.signal.onabort = () => {
        clearInterval(intervalId);
        console.log(`[SSE] Client disconnected, stopping poll for ${conversationId}`);
    };
    return new Response(stream.readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache, no-transform',
        },
    });
}