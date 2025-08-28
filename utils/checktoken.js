import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

export default async function checkAuthToken() {
    const cookieStore = await cookies();
    const token = cookieStore.get(process.env.token)?.value;
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded;
    } catch (error) {
        console.error('Lỗi xác thực token:', error);
        return null;
    }
}