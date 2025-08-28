import { NextResponse } from 'next/server'
import PostCourse from '@/models/course'
import TrialCourse from '@/models/coursetry'
import connectDB from '@/config/connectDB'
import mongoose from 'mongoose'
import jsonRes, { corsHeaders } from '@/utils/response'

const CORS_HEADERS = corsHeaders

export async function POST(req) {
    try {
        const { courseId, studentId, lessonId, commentText } = await req.json()
        if (!courseId || !studentId || !lessonId || commentText === undefined) {
            return jsonRes(400, { status: false, mes: "Request body must include 'courseId', 'studentId', 'lessonId', and 'commentText'.", data: null })
        }

        await connectDB()

        let result = await PostCourse.updateOne(
            { _id: courseId },
            { $set: { 'Student.$[stu].Learn.$[les].CmtFn': commentText } },
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
                { $set: { 'sessions.$[ses].students.$[stu].cmt': commentText } },
                { arrayFilters: [{ 'ses._id': new mongoose.Types.ObjectId(lessonId) }, { 'stu.studentId': studentId }] }
            );
            if (result.matchedCount === 0)
                return jsonRes(404, { status: false, mes: 'Course or student not found.', data: null })
            if (result.modifiedCount === 0)
                return jsonRes(404, { status: false, mes: 'Lesson not found for given student.', data: null })
        } else if (result.modifiedCount === 0) {
            return jsonRes(404, { status: false, mes: 'Lesson not found for given student.', data: null })
        }
        Re_coursetry();
        return jsonRes(200, { status: true, mes: 'Comment updated successfully.', data: null })

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return jsonRes(500, { status: false, mes: errorMessage, data: null })
    }
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}