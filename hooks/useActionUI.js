'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Loading from '@/components/(ui)/(loading)/loading'
import Noti from '@/components/(features)/(noti)/noti'
import '@/styles/all.css'

/**
 * Hook UI cho mọi action server:
 * - Quản lý overlay Loading + Noti (trả về <UI /> để render ngang hàng với nội dung).
 * - run(fn, options): chạy action với loading/noti; cho phép silentOnSuccess & router.refresh().
 */
export default function useActionUI() {
    const router = useRouter()

    const [loading, setLoading] = useState(null) // string | null
    const [notiOpen, setNotiOpen] = useState(false)
    const [notiStatus, setNotiStatus] = useState(true)
    const [notiMes, setNotiMes] = useState('')

    const showNoti = useCallback((ok, mes) => {
        setNotiStatus(!!ok)
        setNotiMes(mes || (ok ? 'Thành công' : 'Thất bại'))
        setNotiOpen(true)
    }, [])
    const hideNoti = useCallback(() => setNotiOpen(false), [])

    const UI = useMemo(() => {
        return function ActionUIFragment() {
            return (
                <>
                    {loading && <div className='loadingOverlay'>
                        <Loading content={<h5 style={{ color: 'white' }}>{loading}</h5>} />
                    </div>}
                    <Noti open={notiOpen} onClose={hideNoti} status={notiStatus} mes={notiMes} />
                </>
            )
        }
    }, [loading, notiOpen, notiStatus, notiMes, hideNoti])

    /**
     * Chạy 1 action server với overlay + noti.
     * @param {() => Promise<any>} fn - hàm async gọi action server (không nhận tham số).
     * @param {object} options
     *  - loadingText?: string
     *  - successMessage?: string
     *  - errorMessage?: string
     *  - silentOnSuccess?: boolean (mặc định true)
     *  - refreshOnSuccess?: boolean (mặc định false)
     *  - onSuccess?: (res) => void (callback tuỳ chọn)
     */
    const run = useCallback(
        async (
            fn,
            {
                loadingText = 'Đang xử lý…',
                successMessage = 'Thành công',
                errorMessage = 'Có lỗi xảy ra',
                silentOnSuccess = true,
                refreshOnSuccess = false,
                onSuccess,
            } = {}
        ) => {
            try {
                setLoading(loadingText)
                const res = await fn()
                setLoading(null)

                if (!res?.ok) {
                    showNoti(false, res?.message || errorMessage)
                } else {
                    if (typeof onSuccess === 'function') {
                        try { onSuccess(res) } catch { }
                    }
                    if (refreshOnSuccess) router.refresh()
                    if (!silentOnSuccess) showNoti(true, res?.message || successMessage)
                }
                return res
            } catch (e) {
                setLoading(null)
                showNoti(false, errorMessage)
                return { ok: false, message: errorMessage }
            }
        },
        [router, showNoti]
    )

    return {
        UI,
        run,
        setLoading,
        showNoti,
        hideNoti,
    }
}
