// lib/service.db.js

import Service from '@/models/services.model';
import connectDB from '@/config/connectDB';
import { cacheData } from '@/lib/cache';

async function dataService(id) {
  try {
    await connectDB();
    const aggregationPipeline = [
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'leads',
          localField: '_id',
          foreignField: 'serviceId', // Giả sử field trong Lead ref đến Service
          as: 'leads'
        }
      },
      {
        $addFields: {
          leadCount: { $size: '$leads' },
        }
      },
      { $project: { leads: 0 } }
    ];
    let services;
    if (id) {
      services = await Service.findById(id).lean();
    } else {
      services = await Service.aggregate(aggregationPipeline);
    }
    return JSON.parse(JSON.stringify(services));
  } catch (error) {
    console.error('Lỗi trong dataService:', error);
    throw new Error('Không thể lấy dữ liệu dịch vụ.');
  }
}

export async function getServiceAll() {
  try {
    const cachedFunction = cacheData(() => dataService(), ['services']);
    return await cachedFunction();
  } catch (error) {
    console.error('Lỗi trong getServiceAll:', error);
    throw new Error('Không thể lấy dữ liệu dịch vụ.');
  }
}

export async function getServiceOne(id) {
  try {
    const cachedFunction = cacheData(() => dataService(id), ['services', id]);
    return await cachedFunction();
  } catch (error) {
    console.error('Lỗi trong getServiceOne:', error);
    throw new Error('Không thể lấy dữ liệu dịch vụ.');
  }
}