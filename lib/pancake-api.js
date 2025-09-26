import axios from 'axios';

// The access token for your main Pancake account
const PANCAKE_USER_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiTmd1eeG7hW4gVGhhbmgiLCJleHAiOjE3NjY0NzY0MzUsImFwcGxpY2F0aW9uIjoxLCJ1aWQiOiI1YmI1YjI2NC0wOWY4LTQ4NjMtODQxOC04ZDM2ZGU0N2VkMjUiLCJzZXNzaW9uX2lkIjoid3FZYTVRd0FmZFYxb1AzWUNYOUozYmpsREZ0YkRJZUNZNUVSZWVua3F5byIsImlhdCI6MTc1ODcwMDQzNSwiZmJfaWQiOiIzOTAwNjExMjI5NzI5NzMiLCJsb2dpbl9zZXNzaW9uIjpudWxsLCJmYl9uYW1lIjoiTmd1eeG7hW4gVGhhbmgifQ.qlY5TrGCIu6Ye-c6e_CNC6QKZzu8lNTXDGeQx44tIY0';

/**
 * Fetches the list of pages from the Pancake API.
 * @returns {Promise<Array|null>} A promise that resolves to an array of pages or null if an error occurs.
 */
export async function getPagesFromAPI() {
    try {
        const response = await axios.get('https://pages.fm/api/v1/pages', {
            params: {
                access_token: PANCAKE_USER_ACCESS_TOKEN,
            },
        });
        if (response.data?.success && response.data?.categorized?.activated) {
            return response.data.categorized.activated.map(page => ({
                id: page.id,
                name: page.name,
                platform: page.platform,
                accessToken: page.settings?.page_access_token,
                avatar: page.avatar_url || `https://pancake.vn/api/v1/pages/${page.id}/avatar?access_token=${PANCAKE_USER_ACCESS_TOKEN}`,
            })).filter(page => page.accessToken && (page.platform == 'facebook' || page.platform == 'instagram_official' || page.platform == 'tiktok_business_messaging'));
        }
        return null; // Return null if the data structure is not as expected
    } catch (error) {
        console.error("Failed to fetch pages from Pancake API:", error.message);
        return null; // Return null on API call failure
    }
}
