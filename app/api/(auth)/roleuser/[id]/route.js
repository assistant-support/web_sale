import connectDB from '@/config/connectDB';
import { reloadUser } from '@/data/actions/reload';
import PostUser from '@/models/users';
import jsonRes from '@/utils/response';

export async function PATCH(request, { params }) {
    try {
        const { id } = params;
        if (!id) {
            return jsonRes(400, { error: 'Thiếu ID người dùng.' });
        }

        await connectDB();

        const body = await request.json();
        const { name, address, phone, role } = body;

        const updateData = {};
        if (name) updateData.name = name;
        if (address) updateData.address = address;
        if (phone) updateData.phone = phone;
        if (role && typeof role === 'string') {
            updateData.role = [role];
        }

        const updatedUser = await PostUser.findByIdAndUpdate(id, { $set: updateData }, { new: true });

        if (!updatedUser) {
            return jsonRes(404, { error: 'Không tìm thấy người dùng để cập nhật.' });
        }
        reloadUser()
        return jsonRes(200, { message: 'Cập nhật thông tin thành công.', user: updatedUser });

    } catch (err) {
        console.error(err);
        return jsonRes(500, { error: 'Lỗi máy chủ' });
    }
}