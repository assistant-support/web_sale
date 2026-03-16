'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import OverviewReportClient from './overview-client';

const INITIAL_PAGE_SIZE = 10;
const SECOND_PAGE_SIZE = 20;

/**
 * Mở trang: load giao diện (light) → load 10 khách + 10 lịch hẹn → load tiếp 20+20 (dừng).
 * Kéo thanh trượt quá nửa thì load tiếp. Thẻ tổng số lấy số lượng thật từ DB (counts API).
 */
export default function OverviewReportWrapper() {
    const [lightData, setLightData] = useState(null);
    const [loadingLight, setLoadingLight] = useState(true);
    const [errorLight, setErrorLight] = useState(null);

    const [counts, setCounts] = useState(null);
    const [loadingCounts, setLoadingCounts] = useState(true);

    const [customers, setCustomers] = useState([]);
    const [customersTotal, setCustomersTotal] = useState(0);
    const [loadingCustomers, setLoadingCustomers] = useState(true);
    const [loadingMoreCustomers, setLoadingMoreCustomers] = useState(false);
    const [errorCustomers, setErrorCustomers] = useState(null);
    const initialLoadDoneCustomers = useRef(false);

    const [appointments, setAppointments] = useState([]);
    const [appointmentsTotal, setAppointmentsTotal] = useState(0);
    const [loadingAppointments, setLoadingAppointments] = useState(true);
    const [loadingMoreAppointments, setLoadingMoreAppointments] = useState(false);
    const [errorAppointments, setErrorAppointments] = useState(null);
    const initialLoadDoneAppointments = useRef(false);

    useEffect(() => {
        let cancelled = false;
        const loadLight = async () => {
            try {
                const res = await fetch('/api/reports/overview/light');
                const json = await res.json();
                if (cancelled) return;
                if (!res.ok || !json?.success) {
                    setErrorLight(json?.error || 'Không tải được dữ liệu.');
                    setLightData({ services: [], sources: [], messageSources: [], conversations: [] });
                } else {
                    setErrorLight(null);
                    setLightData(json.data || {});
                }
            } catch (e) {
                if (!cancelled) {
                    setErrorLight(e?.message || 'Lỗi kết nối.');
                    setLightData({ services: [], sources: [], messageSources: [], conversations: [] });
                }
            } finally {
                if (!cancelled) setLoadingLight(false);
            }
        };
        loadLight();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const loadCounts = async () => {
            try {
                const res = await fetch('/api/reports/overview/counts');
                const json = await res.json();
                if (cancelled) return;
                if (res.ok && json?.success && json.data) {
                    setCounts(json.data);
                    setCustomersTotal(json.data.customersTotal ?? 0);
                    setAppointmentsTotal(json.data.appointmentsTotal ?? 0);
                }
            } catch (_e) {}
            finally {
                if (!cancelled) setLoadingCounts(false);
            }
        };
        loadCounts();
        return () => { cancelled = true; };
    }, []);

    const loadCustomers = useCallback(async (offset, limit = INITIAL_PAGE_SIZE) => {
        if (offset === 0) setLoadingCustomers(true);
        else setLoadingMoreCustomers(true);
        setErrorCustomers(null);
        try {
            const res = await fetch(`/api/reports/overview/customers?limit=${limit}&offset=${offset}`);
            const json = await res.json();
            if (!res.ok || !json?.success) {
                setErrorCustomers(json?.error || 'Không tải được khách hàng.');
                if (offset === 0) setCustomers([]);
            } else {
                const { customers: next, total } = json.data || {};
                if (counts == null) setCustomersTotal(total ?? 0);
                if (offset === 0) {
                    setCustomers(next || []);
                } else {
                    setCustomers((prev) => [...prev, ...(next || [])]);
                }
            }
        } catch (e) {
            setErrorCustomers(e?.message || 'Lỗi kết nối.');
            if (offset === 0) setCustomers([]);
        } finally {
            setLoadingCustomers(false);
            setLoadingMoreCustomers(false);
        }
    }, [counts]);

    const loadAppointments = useCallback(async (offset, limit = INITIAL_PAGE_SIZE) => {
        if (offset === 0) setLoadingAppointments(true);
        else setLoadingMoreAppointments(true);
        setErrorAppointments(null);
        try {
            const res = await fetch(`/api/reports/overview/appointments?limit=${limit}&offset=${offset}`);
            const json = await res.json();
            if (!res.ok || !json?.success) {
                setErrorAppointments(json?.error || 'Không tải được lịch hẹn.');
                if (offset === 0) setAppointments([]);
            } else {
                const { appointments: next, total } = json.data || {};
                if (counts == null) setAppointmentsTotal(total ?? 0);
                if (offset === 0) {
                    setAppointments(next || []);
                } else {
                    setAppointments((prev) => [...prev, ...(next || [])]);
                }
            }
        } catch (e) {
            setErrorAppointments(e?.message || 'Lỗi kết nối.');
            if (offset === 0) setAppointments([]);
        } finally {
            setLoadingAppointments(false);
            setLoadingMoreAppointments(false);
        }
    }, [counts]);

    useEffect(() => {
        if (loadingLight || !lightData) return;
        loadCustomers(0, INITIAL_PAGE_SIZE);
        loadAppointments(0, INITIAL_PAGE_SIZE);
    }, [loadingLight, lightData]);

    useEffect(() => {
        if (!lightData || loadingCustomers || loadingAppointments) return;
        const cLen = customers.length;
        const aLen = appointments.length;
        if (cLen !== INITIAL_PAGE_SIZE || aLen !== INITIAL_PAGE_SIZE) return;
        if (initialLoadDoneCustomers.current && initialLoadDoneAppointments.current) return;
        initialLoadDoneCustomers.current = true;
        initialLoadDoneAppointments.current = true;
        loadCustomers(INITIAL_PAGE_SIZE, SECOND_PAGE_SIZE);
        loadAppointments(INITIAL_PAGE_SIZE, SECOND_PAGE_SIZE);
    }, [lightData, loadingCustomers, loadingAppointments, customers.length, appointments.length]);

    const onLoadMoreCustomers = useCallback(() => {
        if (loadingMoreCustomers || customers.length >= customersTotal) return;
        loadCustomers(customers.length, SECOND_PAGE_SIZE);
    }, [loadingMoreCustomers, customers.length, customersTotal, loadCustomers]);

    const onLoadMoreAppointments = useCallback(() => {
        if (loadingMoreAppointments || appointments.length >= appointmentsTotal) return;
        loadAppointments(appointments.length, SECOND_PAGE_SIZE);
    }, [loadingMoreAppointments, appointments.length, appointmentsTotal, loadAppointments]);

    const services = lightData?.services ?? [];
    const sources = lightData?.sources ?? [];
    const messageSources = lightData?.messageSources ?? [];
    const conversations = lightData?.conversations ?? [];

    const loadingHeavy = loadingCustomers || loadingAppointments;
    const countsReady = counts != null || !loadingCounts;

    if (loadingLight && !lightData) {
        return (
            <div className="flex flex-col gap-6 p-4 animate-pulse">
                <div className="h-24 w-full rounded-lg bg-muted/50" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="h-28 rounded-lg bg-muted/50" />
                    <div className="h-28 rounded-lg bg-muted/50" />
                </div>
                <div className="h-64 rounded-lg bg-muted/50" />
            </div>
        );
    }

    return (
        <>
            {errorLight && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                    Dữ liệu nguồn/dịch vụ: {errorLight}
                </div>
            )}
            {errorCustomers && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                    Khách hàng: {errorCustomers}
                </div>
            )}
            {errorAppointments && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                    Lịch hẹn: {errorAppointments}
                </div>
            )}
            <OverviewReportClient
                customers={customers}
                appointments={appointments}
                services={services}
                sources={sources}
                messageSources={messageSources}
                conversations={conversations}
                loadingHeavy={loadingHeavy}
                customersTotal={customersTotal}
                appointmentsTotal={appointmentsTotal}
                countsLoading={loadingCounts && counts == null}
                hasMoreCustomers={customers.length < customersTotal}
                hasMoreAppointments={appointments.length < appointmentsTotal}
                loadingMoreCustomers={loadingMoreCustomers}
                loadingMoreAppointments={loadingMoreAppointments}
                onLoadMoreCustomers={onLoadMoreCustomers}
                onLoadMoreAppointments={onLoadMoreAppointments}
            />
        </>
    );
}
