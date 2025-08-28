// ++ ADDED: Component mới để hiển thị thông tin Customer
import styles from "./Display.module.css";

const CustomerDisplay = ({ name, phone }) => {
  return (
    <div>
      <p className={styles.mainText}>{name || "N/A"}</p>
      {phone && <p className={styles.subText}>{phone}</p>}
    </div>
  );
};

export default CustomerDisplay;
