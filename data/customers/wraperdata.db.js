import { getCustomersAll } from './handledata.db';
import { revalidateTag } from 'next/cache';

export async function customer_data(params = {}) {
    return await getCustomersAll();
}

export async function reloadCustomers() {
    revalidateTag('customers');
}