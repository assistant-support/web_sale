import Link from 'next/link';
import Image from 'next/image';
import { getPagesFromAPI } from '@/lib/pancake-api';
import { PAGES_CONFIG as fallbackPages } from '@/config/pages';
import { Facebook, Phone } from 'lucide-react';

export default async function HomePage() {
    // Lấy dữ liệu trực tiếp trên server
    let pages = await getPagesFromAPI();
    let dataSource = 'Dữ liệu từ API';
    // Nếu gọi API thất bại, sử dụng dữ liệu dự phòng
    if (!pages || pages.length === 0) {
        console.log("Using fallback pages list.");
        pages = fallbackPages;
        dataSource = 'Dữ liệu dự phòng';
    }

    return (
        <div className="w-full h-full bg-gray-100 flex p-4">
            <div className="w-full bg-white rounded-lg shadow-sm border border-gray-200 flex-1 p-6">

                {/* Header */}
                <div className="mb-6 pb-4 border-b border-gray-200">
                    <p className="text-sm text-gray-800">Chọn Trang</p>
                    <h5 className="text-sm text-gray-500 mt-1">
                        {dataSource} - Có tổng cộng {pages.length} trang
                    </h5>
                </div>

                {/* Page List */}
                {pages.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {pages.map((page) => (
                            <Link href={`/pancake/${page.id}`} key={page.id} className="block h-full">
                                <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center space-x-4 cursor-pointer hover:border-blue-500 hover:shadow-md transition-all duration-200 h-full">
                                    <Image
                                        src={page.avatar}
                                        alt={page.name}
                                        width={48}
                                        height={48}
                                        className="rounded-md object-cover"
                                        unoptimized
                                    />
                                    <div className="flex-1 overflow-hidden">
                                        <p className="text-md font-semibold text-gray-900 truncate" title={page.name}>
                                            {page.name}
                                        </p>
                                        <div className="flex items-center space-x-1.5 text-gray-500 mt-1">
                                            {page.id.startsWith('pzl_') ? (
                                                <Phone size={14} />
                                            ) : (
                                                <Facebook size={14} />
                                            )}
                                            <h5 className="text-xs truncate">{page.id.startsWith('pzl_') ? page.id.replace('pzl_', '') : page.id}</h5>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 text-gray-500">
                        Không có trang nào để hiển thị.
                    </div>
                )}
            </div>
        </div>
    );
}