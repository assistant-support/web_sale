import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import mongoose from 'mongoose'
import PostCourse from '@/models/course'
import TrialCourse from '@/models/coursetry'
import connectDB from '@/config/connectDB'
import jsonRes, { corsHeaders } from '@/utils/response'

const CORS_HEADERS = corsHeaders

export async function POST(req) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return jsonRes(500, { status: false, mes: 'GEMINI_API_KEY is not configured.', data: null })

        const { data, prompt, courseId, studentId, lessonId } = await req.json()
        if (data === undefined || !prompt) return jsonRes(400, { status: false, mes: "Request body must include 'data' and 'prompt'.", data: null })

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const contextData = JSON.stringify(data, null, 2);

        const finalPrompt = `
            ${prompt}
            DỮ LIỆU:
            \`\`\`json
            ${contextData}
            \`\`\`
        `;

        const result = await model.generateContent(finalPrompt);
        const output = result.response.text();

        if (courseId && studentId && lessonId) {
            await connectDB();

            let result = await PostCourse.updateOne(
                { _id: courseId },
                { $set: { 'Student.$[stu].Learn.$[les].CmtFn': output } },
                {
                    arrayFilters: [
                        { 'stu.ID': studentId },
                        { 'les.Lesson': new mongoose.Types.ObjectId(lessonId) }
                    ]
                }
            );
            if (result.matchedCount === 0) {
                result = await TrialCourse.updateOne(
                    { _id: courseId },
                    { $set: { 'sessions.$[ses].students.$[stu].cmt': output } },
                    { arrayFilters: [{ 'ses._id': new mongoose.Types.ObjectId(lessonId) }, { 'stu.studentId': studentId }] }
                );
                if (result.matchedCount === 0) console.warn('Database update skipped: Course or student not found.')
                else if (result.modifiedCount === 0) console.warn(`Database update skipped: Lesson with _id ${lessonId} not found for student ${studentId}.`)
            } else if (result.modifiedCount === 0) {
                console.warn(`Database update skipped: Lesson with _id ${lessonId} not found for student ${studentId}.`)
            }
        }
        return jsonRes(200, { status: true, mes: 'success', data: output })

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return jsonRes(500, { status: false, mes: errorMessage, data: null })
    }
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}