'use client'
import { redirect } from "next/navigation";

export default function TestPage() {
    redirect("/client");
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-8">
        </div>
    );
}