// ** MODIFIED: Refactor để sử dụng CSS Modules
import Image from "next/image";
import styles from "./Display.module.css"; // ++ ADDED: Import file style mới

const ZaloDisplay = ({ name, phone, avatar }) => {
  return (
    // ** MODIFIED: Sử dụng className từ file CSS module
    <div className={styles.container}>
      <Image
        src={avatar || "/default-avatar.png"} // Sử dụng một ảnh placeholder mặc định
        alt={name || "Zalo Avatar"}
        width={32}
        height={32}
        className={styles.avatar} // Class để bo tròn ảnh
      />
      <div>
        <p className={styles.mainText}>{name || "N/A"}</p>
        {phone && <p className={styles.subText}>{phone}</p>}
      </div>
    </div>
  );
};

export default ZaloDisplay;
