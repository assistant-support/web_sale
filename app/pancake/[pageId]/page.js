import { notFound } from 'next/navigation';
import ChatClient from './ChatClient';
import { getPagesFromAPI, PANCAKE_USER_ACCESS_TOKEN } from '@/lib/pancake-api';
import { getLabelData } from '@/app/(setting)/label/page';

export default async function ChatPage({ params }) {
    const { pageId } = await params;

    let pageConfig = await getPagesFromAPI();
    pageConfig = pageConfig.find(p => p.id === pageId);
    if (!pageConfig) notFound();

    const label = await getLabelData();

    return (
        <ChatClient
            pageConfig={pageConfig}
            label={label}
            token={PANCAKE_USER_ACCESS_TOKEN}
        />
    );
}
