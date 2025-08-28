// ** MODIFIED: Thêm thẻ div bao bọc bên ngoài
import styles from "./Display.module.css";

const UserDisplay = ({ name, phone }) => {
  return (
    // ** MODIFIED: Thêm thẻ div này, không cần class
    <div>
      <p className={styles.mainText}>{name || "N/A"}</p>
      {phone && <p className={styles.subText}>{phone}</p>}
    </div>
  );
};

export default UserDisplay;
