import axios from 'axios';

// The access token for your main Pancake account
export const PANCAKE_USER_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiRGV2IFN1cHBvcnQiLCJleHAiOjE3NjcxNDM0MTgsImFwcGxpY2F0aW9uIjoxLCJ1aWQiOiIwNzUzNDE2YS01NzBlLTRmODItOWI0Ny05ZmUzNTVjOGYzMTgiLCJzZXNzaW9uX2lkIjoiU2g1ZHNXbzJ2S1NOSFMrYndhbzFmV05FT25HTmxaenk3bHM3K2tmOVQrcyIsImlhdCI6MTc1OTM2NzQxOCwiZmJfaWQiOiIxMjIxNDc0MjEzMzI2OTA1NjEiLCJsb2dpbl9zZXNzaW9uIjpudWxsLCJmYl9uYW1lIjoiRGV2IFN1cHBvcnQifQ.j511Eca8jPKI6MRi2ADb_kqLS_9yefeKOkvLwlS3rgk';

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
                avatar: page.avatar_url || `https://pancake.vn/api/v1/pages/${page.id}/avatar?access_token=${PANCAKE_USER_ACCESS_TOKEN}`,
            })).filter(page => page.platform == 'facebook' || page.platform == 'instagram_official' || page.platform == 'tiktok_business_messaging');
        }
        return null; // Return null if the data structure is not as expected
    } catch (error) {
        console.error("Failed to fetch pages from Pancake API:", error.message);
        return null; // Return null on API call failure
    }
}
