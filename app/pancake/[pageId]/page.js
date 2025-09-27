import axios from 'axios';
import { notFound } from 'next/navigation';
import { PANCAKE_API_BASE_URL } from '@/config/pages';
import ChatClient from './ChatClient';
import { getPagesFromAPI } from '@/lib/pancake-api';

// Lấy danh sách hội thoại ban đầu để hiển thị khi người dùng truy cập trang.
async function getInitialConversations(pageId, accessToken) {
    try {
        const response = await axios.get(`${PANCAKE_API_BASE_URL}/public_api/v2/pages/${pageId}/conversations`, {
            params: { page_access_token: accessToken }
        });
        return { data: response.data.conversations || [] };
    } catch (error) {
        console.error('Failed to fetch initial conversations:', error.response?.data || error.message);
        return { error: 'Không thể tải danh sách hội thoại. Vui lòng kiểm tra lại access token.' };
    }
}

export default async function ChatPage({ params }) {
    const { pageId } = await params
    let pageConfig = await getPagesFromAPI()
    pageConfig = pageConfig.find(p => p.id === pageId)
    if (!pageConfig) notFound()
    const { data: initialConversations, error } = await getInitialConversations(pageId, pageConfig.accessToken);
    
    return (
        <ChatClient
            initialConversations={initialConversations}
            initialError={error}
            pageConfig={pageConfig}
        />
    );
}