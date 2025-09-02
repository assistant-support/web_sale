// app/test/page.js

import { Button } from "@/components/ui/button";

export default function TestPage() {
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-8">
            <h1 className="text-2xl font-bold text-foreground">
                Trang Test cho Shadcn UI
            </h1>
            <p className="text-muted-foreground">
                Nếu các button dưới đây hiển thị đúng style, vấn đề là do xung đột với MUI.
            </p>

            <div className="flex gap-4">
                <Button>Nút Mặc Định</Button>
                <Button variant="destructive">Nút Hủy</Button>
                <Button variant="outline">Nút Outline</Button>
                <Button variant="secondary">Nút Phụ</Button>
                <Button variant="ghost">Nút Ghost</Button>
                <Button variant="link">Nút Link</Button>
            </div>
        </div>
    );
}