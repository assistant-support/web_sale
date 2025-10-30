import mongoose from 'mongoose';
import Customer from '@/models/customer.model';
import Service from '@/models/services.model';
import User from '@/models/users';
import Setting from '@/models/setting.model';
import { revalidateData } from '@/app/actions/customer.actions';

async function pickNextUserByGroup(group) {
    console.log(`[AutoAssign] Looking for users in group: ${group}`);
    // Ưu tiên những người có role chính xác là 'Sale'
    let candidates = await User.find({ 
        role: 'Sale', 
        group: group 
    }).sort({ _id: 1 }).lean();
    // Nếu không có, fallback sang bất kỳ role chứa "Sale"
    if (!candidates?.length) {
        candidates = await User.find({ role: { $in: [/Sale/i] }, group }).sort({ _id: 1 }).lean();
    }
    
    console.log(`[AutoAssign] Found ${candidates.length} candidates (prioritizing exact 'Sale'):`, candidates.map(c => ({
        id: c._id,
        name: c.name,
        role: c.role,
        group: c.group
    })));
    
    if (!candidates?.length) return null;
    const key = `auto_rr_${group}`;
    const rec = await Setting.findOne({ key });
    const last = rec ? Number(rec.value) : -1;
    const nextIndex = (last + 1) % candidates.length;
    await Setting.updateOne({ key }, { $set: { value: String(nextIndex) } }, { upsert: true });
    const selected = candidates[nextIndex];
    console.log(`[AutoAssign] Selected user at index ${nextIndex}:`, selected ? {
        id: selected._id,
        name: selected.name,
        role: selected.role,
        group: selected.group
    } : 'NONE');
    return selected;
}

async function findAnySale() {
    // Tìm bất kỳ nhân sự nào có role chứa "Sale"
    const user = await User.findOne({ role: { $in: [/Sale/i] } }).sort({ _id: 1 }).lean();
    return user || null;
}

function isValidObjectId(id) {
    try { return mongoose.Types.ObjectId.isValid(id); } catch { return false; }
}

export async function autoAssignForCustomer(customerId, options = {}) {
    // console.log('🚩Đi qua hàm autoAssignForCustomer');
    // console.log(`🚩[DEBUG] CustomerId: ${customerId}`);
    // console.log(`🚩[DEBUG] Options:`, JSON.stringify(options, null, 2));
    // console.log(`[AutoAssign] Starting for customer ${customerId}, options:`, options);
    
    let customer;
    try {
        customer = await Customer.findById(customerId);
        // console.log('🚩[DEBUG] Customer lookup result:', customer ? 'FOUND' : 'NOT FOUND');
    } catch (error) {
        // console.error('🚩[ERROR] Lỗi khi tìm customer:', error?.message || error);
        return { ok: false, reason: 'db_error', error: error?.message };
    }
    
    if (!customer) {
        // console.log(`🚩[SKIP] Customer not found: ${customerId}`);
        return { ok: false, reason: 'not_found' };
    }
    
    console.log('🚩[DEBUG] Customer assignees check:', {
        hasAssignees: !!customer.assignees?.length,
        assigneesCount: customer.assignees?.length || 0,
        assignees: customer.assignees
    });
    
    if (customer.assignees?.length) {
        // console.log(`🚩[SKIP] Customer already has assignees:`, customer.assignees);
        return { ok: false, reason: 'already_assigned' };
    }

    // If static assignment is requested, short-circuit and assign Ngọc Cúc
    if (options?.forceStaticAssign) {
        const staticUser = await User.findOne({ email: 'noikhoa@gmail.com' }).lean();
        if (staticUser) {
            customer.assignees.push({
                user: new mongoose.Types.ObjectId(staticUser._id),
                group: staticUser.group,
                assignedAt: new Date()
            });
            const newStatus = staticUser.group === 'noi_khoa' ? 'noikhoa_3' : (staticUser.group === 'ngoai_khoa' ? 'ngoaikhoa_3' : 'undetermined_3');
            customer.pipelineStatus[0] = newStatus;
            customer.pipelineStatus[3] = newStatus;
            customer.care.push({
                content: `Hệ thống tự động gán Sale phụ trách ${staticUser.name} (gán tĩnh).`,
                createBy: staticUser._id,
                step: 3,
                createAt: new Date()
            });
            await customer.save();
            try { await revalidateData(); } catch {}
            return { ok: true, user: staticUser, service: null, static: true };
        }
    }

    const serviceRef = options.serviceId || customer.tags?.[0];
    // console.log(`🚩[DEBUG] Service reference:`, serviceRef);
    // console.log(`🚩[DEBUG] Options.serviceId:`, options.serviceId);
    // console.log(`🚩[DEBUG] Customer.tags[0]:`, customer.tags?.[0]);
    // console.log(`[AutoAssign] Service reference:`, serviceRef);
    
    if (!serviceRef) {
        // console.log(`🚩[FALLBACK] No service reference found -> try default group / any sale`);
        // Fallback 1: dùng group mặc định trong Setting nếu có
        let defaultGroup = null;
        try {
            const rec = await Setting.findOne({ key: 'defaultAllocationGroup' }).lean();
            defaultGroup = rec?.value || null;
        } catch (_) {}

        let fallbackUser = null;
        if (defaultGroup) {
            fallbackUser = await pickNextUserByGroup(defaultGroup);
        }
        // Fallback 2: nếu chưa có, lấy bất kỳ Sale nào
        if (!fallbackUser) {
            fallbackUser = await findAnySale();
        }
        if (!fallbackUser) {
            console.log(`[AutoAssign] No Sale found in system`);
            return { ok: false, reason: 'no_mapping' };
        }

        customer.assignees.push({
            user: new mongoose.Types.ObjectId(fallbackUser._id),
            group: fallbackUser.group,
            assignedAt: new Date()
        });
        const fbStatus = fallbackUser.group === 'noi_khoa' ? 'noikhoa_3' : (fallbackUser.group === 'ngoai_khoa' ? 'ngoaikhoa_3' : 'undetermined_3');
        customer.pipelineStatus[0] = fbStatus;
        customer.pipelineStatus[3] = fbStatus;
        customer.care.push({
            content: `Hệ thống tự động gán Sale phụ trách (fallback): ${fallbackUser.name}.`,
            createBy: fallbackUser._id,
            step: 3,
            createAt: new Date()
        });
        await customer.save();
        try { await revalidateData(); } catch {}
        return { ok: true, user: fallbackUser, service: null, fallback: true };
    }

    let service = null;
    if (isValidObjectId(serviceRef)) {
        service = await Service.findById(serviceRef).lean();
    } else {
        // Thử tìm theo slug hoặc name nếu không phải ObjectId
        service = await Service.findOne({ $or: [ { slug: String(serviceRef) }, { name: String(serviceRef) } ] }).lean();
    }
    console.log(`[AutoAssign] Service found:`, service ? {
        id: service._id,
        name: service.name,
        type: service.type,
        saleGroup: service.saleGroup,
        defaultSale: service.defaultSale
    } : 'NOT FOUND');
    
    if (!service) return { ok: false, reason: 'service_not_found' };

    const targetGroup = service.saleGroup || service.type || null; // fallback to type
    console.log(`[AutoAssign] Target group:`, targetGroup);
    
    let assignedUser = null;
    // Ưu tiên 1: Nếu có defaultSale, kiểm tra xem có role chứa "Sale" và cùng group không
    if (service.defaultSale) {
        const defaultSaleUser = await User.findById(service.defaultSale).lean();
        console.log(`[AutoAssign] Default sale found:`, defaultSaleUser ? {
            id: defaultSaleUser._id,
            name: defaultSaleUser.name,
            role: defaultSaleUser.role,
            group: defaultSaleUser.group,
            targetGroup: targetGroup
        } : 'NOT FOUND');
        
        if (defaultSaleUser) {
            // Kiểm tra role: ưu tiên đúng 'Sale', nếu không thì chấp nhận role chứa 'Sale'
            const hasExactSaleRole = Array.isArray(defaultSaleUser.role)
                ? defaultSaleUser.role.includes('Sale')
                : defaultSaleUser.role === 'Sale';
            const hasSaleRole = hasExactSaleRole || (Array.isArray(defaultSaleUser.role)
                ? defaultSaleUser.role.some(r => /Sale/i.test(String(r)))
                : /Sale/i.test(String(defaultSaleUser.role)));

            // Kiểm tra group có khớp với targetGroup không
            const hasMatchingGroup = targetGroup && defaultSaleUser.group === targetGroup;

            if (hasExactSaleRole && hasMatchingGroup) {
                assignedUser = defaultSaleUser;
                console.log(`[AutoAssign] ✅ DefaultSale hợp lệ: role 'Sale' và cùng group "${targetGroup}"`);
            } else {
                console.log(`[AutoAssign] ⚠️ DefaultSale không hợp lệ hoặc không phải role 'Sale' đúng nghĩa:`, {
                    hasSaleRole,
                    hasExactSaleRole,
                    hasMatchingGroup,
                    userGroup: defaultSaleUser.group,
                    targetGroup
                });
                console.log(`[AutoAssign] → Sẽ dùng round-robin theo group "${targetGroup}"`);
            }
        }
    }
    
    // Ưu tiên 2: Nếu không có defaultSale hợp lệ, dùng round-robin theo group
    if (!assignedUser && targetGroup) {
        assignedUser = await pickNextUserByGroup(targetGroup);
        console.log(`[AutoAssign] Round-robin user found:`, assignedUser ? {
            id: assignedUser._id,
            name: assignedUser.name,
            role: assignedUser.role,
            group: assignedUser.group
        } : 'NOT FOUND');
    }
    if (!assignedUser) {
        console.log(`[AutoAssign] No user found for assignment`);
        return { ok: false, reason: 'no_mapping' };
    }

    customer.assignees.push({
        user: new mongoose.Types.ObjectId(assignedUser._id),
        group: assignedUser.group,
        assignedAt: new Date()
    });

    const newStatus = assignedUser.group === 'noi_khoa' ? 'noikhoa_3' : (assignedUser.group === 'ngoai_khoa' ? 'ngoaikhoa_3' : 'undetermined_3');
    customer.pipelineStatus[0] = newStatus;
    customer.pipelineStatus[3] = newStatus;

    customer.care.push({
        content: `Hệ thống tự động gán Sale phụ trách ${assignedUser.name} theo dịch vụ ${service.name}.`,
        createBy: assignedUser._id,
        step: 3,
        createAt: new Date()
    });

    // Đồng bộ lại tags nếu người gọi truyền slug/name
    try {
        if (service && (!customer.tags?.length || String(customer.tags[0]) !== String(service._id))) {
            customer.tags = [service._id];
        }
    } catch (_) {}

    await customer.save();
    try { await revalidateData(); } catch (e) { /* ignore */ }
    
    console.log(`[AutoAssign] Successfully assigned ${assignedUser.name} to customer ${customerId}`);
    return { ok: true, user: assignedUser, service };
}

export default autoAssignForCustomer;


