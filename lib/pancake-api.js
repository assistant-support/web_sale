// The access token for your main Pancake account
export const PANCAKE_USER_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiRGV2IFN1cHBvcnQiLCJleHAiOjE3Njg5ODgwMzAsImFwcGxpY2F0aW9uIjoxLCJ1aWQiOiIwNzUzNDE2YS01NzBlLTRmODItOWI0Ny05ZmUzNTVjOGYzMTgiLCJzZXNzaW9uX2lkIjoiM2U0NDE4ZjMtODFkOS00ZjI0LWEzNzItMTMwMTdmY2YyYWZjIiwiaWF0IjoxNzYxMjEyMDMwLCJmYl9pZCI6IjEyMjE0NzQyMTMzMjY5MDU2MSIsImxvZ2luX3Nlc3Npb24iOm51bGwsImZiX25hbWUiOiJEZXYgU3VwcG9ydCJ9.2lhI8yVn_cpKMmCwTuq7zXFChgvvqFj74KmpH-R0CpU';

/**
 * Fetches the list of pages from the Pancake API.
 * @returns {Promise<Array|null>} A promise that resolves to an array of pages or null if an error occurs.
 */
export async function getPagesFromAPI() {
    try {
        let response = await fetch(`https://pancake.vn/api/v1/pages?access_token=${PANCAKE_USER_ACCESS_TOKEN}`);
        response = await response.json();
        if (response?.success && response?.categorized?.activated) {
            return response.categorized.activated.map((page, index) => ({
                accessToken: PANCAKE_USER_ACCESS_TOKEN,
                id: page.id,
                name: page.name,
                platform: page.platform,
                avatar: `https://pancake.vn/api/v1/pages/${page.id}/avatar?access_token=${PANCAKE_USER_ACCESS_TOKEN}`,
            })).filter(page => page.platform == 'facebook' || page.platform == 'instagram_official' || page.platform == 'tiktok_business_messaging');
        }
        return null; // Return null if the data structure is not as expected
    } catch (error) {
        console.error("Failed to fetch pages from Pancake API:", error.message);
        return null; // Return null on API call failure
    }
}
