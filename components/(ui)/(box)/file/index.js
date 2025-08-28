import React from 'react';
import styles from './index.module.css';

const ICONS = {
    Image: 'https://assets.minimals.cc/public/assets/icons/files/ic-img.svg',
    Ppt: 'https://assets.minimals.cc/public/assets/icons/files/ic-power_point.svg',
    Video: 'https://assets.minimals.cc/public/assets/icons/files/ic-video.svg',
    default: 'https://assets.minimals.cc/public/assets/icons/files/ic-zip.svg',
};

export default function BoxFile({ type, name, href }) {
    const iconSrc = ICONS[type] || ICONS.default;

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.container}
        >
            <img
                src={iconSrc}
                alt={`${type} icon`}
                loading="lazy"
                className={styles.icon}
            />
            <div className={styles.name}>{name}</div>
        </a>
    );
}
