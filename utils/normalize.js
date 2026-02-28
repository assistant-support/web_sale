/**
 * Hàm normalize để bỏ dấu tiếng Việt
 * Chuyển đổi chuỗi thành chữ thường, bỏ dấu, thay đ/Đ thành d
 */
export function normalize(str = "") {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .trim();
}

