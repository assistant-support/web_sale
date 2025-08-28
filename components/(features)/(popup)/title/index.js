import styles from './index.module.css'

export default function Title({ content, click }) {
    return (
        <div className={styles.header}>
            <div className='text_4'>{content}</div>
            <button className={styles.closeBtn} onClick={click}>&times;</button>
        </div>
    )
}