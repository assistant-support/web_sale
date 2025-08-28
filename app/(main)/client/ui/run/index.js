'use client'

import React, {
    useState,
    useMemo,
    useCallback,
    useEffect,
    useTransition,
} from 'react'
import styles from './index.module.css'
import FlexiblePopup from '@/components/(features)/(popup)/popup_right'
import { useRouter } from 'next/navigation'
import { Re_user } from '@/data/users'

// ---------- helper ----------
const calcTimeLeft = (until) => {
    if (!until) return ''
    const diff = +new Date(until) - +new Date()
    if (diff <= 0) return 'Hoàn thành'
    const h = Math.floor((diff / 3_600_000) % 24)
    const m = Math.floor((diff / 60_000) % 60)
    return h > 0 ? `~ ${h}h ${m}m` : `~ ${m} phút`
}

// ---------- small render blocks ----------
const RecipientList = ({ job, removedIds, onToggle }) => (
    <div className={styles.taskList}>
        {job.tasks.map((t) => {
            const removed = removedIds.has(t._id)
            const processed = t.status !== 'pending'
            return (
                <div
                    key={t._id}
                    className={`${styles.taskItem} ${removed ? styles.removed : ''
                        } ${processed ? styles.processed : ''}`}
                >
                    <div className={styles.taskInfo}>
                        <span className={styles.taskName}>{t.person.name}</span>
                        <span className={styles.taskStatus}>
                            {processed ? `Đã ${t.status}` : 'Đang chờ'}
                        </span>
                    </div>
                    <button
                        onClick={() => onToggle(t._id)}
                        className={`${styles.toggleTaskBtn} ${removed ? styles.reAdd : styles.remove
                            }`}
                        disabled={processed}
                    >
                        {removed ? 'Thêm lại' : 'Bỏ'}
                    </button>
                </div>
            )
        })}
    </div>
)

const DetailContent = ({
    job,
    onEditRecipients,
    onSave,
    onStop,
    isSubmitting,
    timeLeft,
}) => {
    const st = job.statistics || { total: 0, completed: 0, failed: 0 }
    const success = st.total ? (st.completed / st.total) * 100 : 0
    const failure = st.total ? (st.failed / st.total) * 100 : 0

    return (
        <div className={styles.popupContainer}>
            <div className={styles.popupGroup}>
                <p className={styles.popupLabel}>Tên lịch trình</p>
                <p className={styles.popupValue}>{job.jobName}</p>
            </div>

            <div className={styles.popupGroup}>
                <p className={styles.popupLabel}>Thông tin chung</p>
                <div className={styles.statGrid}>
                    <div>
                        <span className={styles.statTitle}>Trạng thái</span>
                        <span
                            className={`${styles.statValue} ${styles.statusProcessing}`}
                        >
                            {job.status}
                        </span>
                    </div>
                    <div>
                        <span className={styles.statTitle}>Hành động</span>
                        <span className={styles.statValue}>{job.actionType}</span>
                    </div>
                    <div>
                        <span className={styles.statTitle}>Tốc độ</span>
                        <span className={styles.statValue}>
                            {job.config?.actionsPerHour || 0} / giờ
                        </span>
                    </div>
                </div>
            </div>

            <div className={styles.popupGroup}>
                <p className={styles.popupLabel}>Tiến độ & Tỉ lệ</p>
                <div className={styles.statGrid}>
                    <div>
                        <span className={styles.statTitle}>Hoàn thành</span>
                        <span className={styles.statValue}>
                            {st.completed} / {st.total}
                        </span>
                    </div>
                    <div>
                        <span className={styles.statTitle}>Thất bại</span>
                        <span className={styles.statValue}>{st.failed}</span>
                    </div>
                    <div>
                        <span className={styles.statTitle}>Thành công</span>
                        <span
                            className={`${styles.statValue} ${styles.successRate}`}
                        >
                            {success.toFixed(1)}%
                        </span>
                    </div>
                    <div>
                        <span className={styles.statTitle}>Thất bại</span>
                        <span
                            className={`${styles.statValue} ${styles.failureRate}`}
                        >
                            {failure.toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>

            <div className={styles.popupGroup}>
                <p className={styles.popupLabel}>Thời gian</p>
                <div className={styles.statGrid}>
                    <div>
                        <span className={styles.statTitle}>Bắt đầu</span>
                        <span className={styles.statValue}>
                            {new Date(job.createdAt).toLocaleString('vi-VN')}
                        </span>
                    </div>
                    <div>
                        <span className={styles.statTitle}>Dự kiến xong</span>
                        <span className={styles.statValue}>
                            {new Date(job.estimatedCompletionTime).toLocaleString('vi-VN')}
                        </span>
                    </div>
                    <div>
                        <span className={styles.statTitle}>Còn lại</span>
                        <span className={styles.statValue}>{timeLeft}</span>
                    </div>
                </div>
            </div>

            <div className={styles.popupGroup}>
                <div className={styles.recipientSummary}>
                    <p className={styles.popupLabel}>Danh sách người nhận</p>
                    <button
                        className={styles.editRecipientsBtn}
                        onClick={onEditRecipients}
                    >
                        Chỉnh sửa
                    </button>
                </div>
            </div>

            <div className={styles.popupActions}>
                <button
                    onClick={onStop}
                    className={`${styles.actionButton} ${styles.stopButton}`}
                    disabled={isSubmitting}
                >
                    Dừng & Hủy
                </button>
                <button
                    onClick={onSave}
                    className='btn'
                    disabled={isSubmitting}
                    style={{ borderRadius: 5, margin: 0, transform: 'none' }}
                >
                    {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
            </div>
        </div>
    )
}

// ---------- main ----------
export default function Run({ data }) {
    const router = useRouter()
    const [isSubmitting, startTransition] = useTransition()

    // danh sách job đang chạy (mỗi phần tử = job object thực thụ)
    const runningJobs = useMemo(
        () => data?.zalo?.runningJobs?.map((r) => r.job) || [],
        [data],
    )

    // refresh 10 s
    useEffect(() => {
        const id = setInterval(() => startTransition(() => router.refresh()), 10_000)
        return () => clearInterval(id)
    }, [router])

    // ------------- popup state -------------
    const [selectedJob, setSelectedJob] = useState(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)
    const [isRecipientOpen, setIsRecipientOpen] = useState(false)
    const [removedTaskIds, setRemovedTaskIds] = useState(new Set())
    const [timeLeft, setTimeLeft] = useState('')

    // đếm ngược cho popup
    useEffect(() => {
        if (!selectedJob?.estimatedCompletionTime) return
        const timer = setInterval(
            () => setTimeLeft(calcTimeLeft(selectedJob.estimatedCompletionTime)),
            1_000,
        )
        return () => clearInterval(timer)
    }, [selectedJob])

    // ----- handlers -----
    const openDetail = useCallback((job) => {
        setSelectedJob(job)
        setRemovedTaskIds(new Set())
        setIsDetailOpen(true)
    }, [])

    const toggleTask = useCallback((id) => {
        setRemovedTaskIds((prev) => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }, [])

    const saveJob = useCallback(async () => {
        if (!selectedJob) return
        startTransition(async () => {
            // TODO: call API với selectedJob._id & removedTaskIds
            await new Promise((r) => setTimeout(r, 1_000))
            setIsDetailOpen(false)
            router.refresh()
        })
    }, [selectedJob, removedTaskIds, router])

    const stopJob = useCallback(async () => {
        if (!selectedJob) return
        startTransition(async () => {
            // TODO: call API stop selectedJob._id
            await new Promise((r) => setTimeout(r, 1_000))
            setIsDetailOpen(false)
            router.refresh()
        })
    }, [selectedJob, router])

    // ------------- UI -------------
    if (runningJobs.length === 0) return null

    return (
        <>
            {runningJobs.map((job) => {
                const truncatedName =
                    job.jobName.length > 15 ? `${job.jobName.slice(0, 15)}...` : job.jobName
                const stats = job.statistics || { completed: 0, total: 0 }
                const left = calcTimeLeft(job.estimatedCompletionTime)

                return (
                    <div key={job._id} style={{ display: 'flex' }}>
                        <div className={styles.container}>
                            <div className={styles.loadingContainer}>
                                <div className={styles.spinner} />
                            </div>
                            <div className={styles.jobInfo}>
                                <span className={styles.jobName} title={job.jobName}>
                                    {truncatedName}
                                </span>
                                <span className={styles.progressText}>
                                    ({stats.completed}/{stats.total})
                                </span>
                            </div>
                            <div className={styles.timeLeft}>{left}</div>
                        </div>
                        <button
                            className={styles.updateButton}
                            onClick={() => openDetail(job)}
                        >
                            <p className='text_6_400'>Chi tiết</p>
                        </button>
                    </div>
                )
            })}

            {/* popup dùng lại cho mọi job */}
            <FlexiblePopup
                open={isDetailOpen}
                onClose={() => setIsDetailOpen(false)}
                title='Chi tiết lịch trình'
                width={450}
                renderItemList={() =>
                    selectedJob && (
                        <DetailContent
                            job={selectedJob}
                            onEditRecipients={() => setIsRecipientOpen(true)}
                            onSave={saveJob}
                            onStop={stopJob}
                            isSubmitting={isSubmitting}
                            timeLeft={timeLeft}
                        />
                    )
                }
                secondaryOpen={isRecipientOpen}
                onCloseSecondary={() => setIsRecipientOpen(false)}
                secondaryTitle='Chỉnh sửa danh sách người nhận'
                renderSecondaryList={() =>
                    selectedJob && (
                        <RecipientList
                            job={selectedJob}
                            removedIds={removedTaskIds}
                            onToggle={toggleTask}
                        />
                    )
                }
            />
        </>
    )
}
