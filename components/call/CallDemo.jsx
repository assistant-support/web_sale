"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, User } from 'lucide-react';
import CallPopup from './CallPopup';

// Mock data for testing
const mockCustomer = {
    _id: "68f6043040626e88f39ab008",
    name: "Lưu Tính",
    phone: "0915182174",
    email: "thanhthanh203203@gmail.com",
    avatar: null
};

const mockUser = {
    _id: "68d15abdbe64c8353cc74522",
    name: "Admin",
    email: "admin@example.com",
    role: ["Admin"]
};

export default function CallDemo() {
    const [isPopupOpen, setIsPopupOpen] = useState(false);

    const openPopup = () => {
        setIsPopupOpen(true);
    };

    const closePopup = () => {
        setIsPopupOpen(false);
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Phone className="h-5 w-5" />
                        Demo Chức năng Gọi điện & Nghe Ghi âm
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h3 className="font-semibold text-blue-800 mb-2">Hướng dẫn sử dụng:</h3>
                        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                            <li>Chọn khách hàng từ danh sách (mỗi khách hàng có ID riêng biệt)</li>
                            <li>Nhấn vào tab "Cuộc gọi" để mở popup gọi điện</li>
                            <li>Trong popup, chọn tab "Lịch sử cuộc gọi"</li>
                            <li>Hệ thống sẽ tải về tất cả file ghi âm liên quan đến khách hàng đó</li>
                            <li>Bạn có thể nghe trực tiếp từng file hoặc tải về tất cả</li>
                        </ol>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Khách hàng mẫu</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-gray-500" />
                                        <span className="font-medium">{mockCustomer.name}</span>
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        ID: {mockCustomer._id}
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        SĐT: {mockCustomer.phone}
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        Email: {mockCustomer.email}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Tính năng chính</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="text-sm space-y-1">
                                    <li>✅ Lọc ghi âm theo khách hàng</li>
                                    <li>✅ Nghe trực tiếp từng file</li>
                                    <li>✅ Tải về tất cả file ghi âm</li>
                                    <li>✅ Giao diện popup hiện đại</li>
                                    <li>✅ Tích hợp OMI Call SDK</li>
                                </ul>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="text-center">
                        <Button onClick={openPopup} size="lg" className="w-full md:w-auto">
                            <Phone className="mr-2 h-4 w-4" />
                            Mở popup gọi điện cho khách hàng "{mockCustomer.name}"
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Call Popup */}
            <CallPopup
                customer={mockCustomer}
                user={mockUser}
                isOpen={isPopupOpen}
                onClose={closePopup}
            />
        </div>
    );
}
