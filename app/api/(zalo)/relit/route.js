import ZaloAccount from "@/models/zalo";
import connectDB from "@/config/connectDB";

export async function GET() {
    await connectDB();
    await ZaloAccount.updateMany({}, {
        rateLimitPerHour: 30,
        rateLimitPerDay: 200,
    });

    return new Response(null, { status: 204 });
}