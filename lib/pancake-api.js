// The access token for your main Pancake account
export const PANCAKE_USER_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiRGV2IFN1cHBvcnQiLCJleHAiOjE3Njc2ODY2NzksImFwcGxpY2F0aW9uIjoxLCJ1aWQiOiIwNzUzNDE2YS01NzBlLTRmODItOWI0Ny05ZmUzNTVjOGYzMTgiLCJzZXNzaW9uX2lkIjoibGtlMTltRTUwZWx2a3VKL0FsZ0s1TjhoM0FnMC9JMUZRK29FMkRSL3R4MCIsImlhdCI6MTc1OTkxMDY3OSwiZmJfaWQiOiIxMjIxNDc0MjEzMzI2OTA1NjEiLCJsb2dpbl9zZXNzaW9uIjpudWxsLCJmYl9uYW1lIjoiRGV2IFN1cHBvcnQifQ.2GybMzOImT5DLo2dktr3PJPTWPVpefiYo7mk6cq-P0M';

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
