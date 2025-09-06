import { service_data } from '@/data/services/wraperdata.db';
import ServiceManager from './ui/ServiceManager';

export default async function ServicesPage() {
    const services = await service_data();
    console.log(services);
    
    return <ServiceManager initialServices={services} />;
}