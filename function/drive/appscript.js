const SCRIPT_URL_SEND_MESSAGE = 'https://script.google.com/macros/s/AKfycbzhEEvakm6VzGRpNNORT9jZ3A8gYya2Bd5zjuTbpAgr8ZYaHO-0LB_DKibXyEHuo3ROfw/exec';
const SCRIPT_URL_GET_UID = 'https://script.google.com/macros/s/AKfycbxMMwrvLEuqhsyK__QRCU0Xi6-qu-HkUBx6fDHDRAYfpqM9d4SUq4YKVxpPnZtpJ_b6wg/exec';
const SCRIPT_URL_ACTION = 'https://script.google.com/macros/s/AKfycbzD_BSTMoywu5KaUSmOAgiYTVjgaP5I1yBirYs1Cb5wBFgNq9wTTojydB4S8vjzafX5sA/exec';
const SCRIPT_URL_GP = 'https://script.google.com/macros/s/AKfycbxzGI_oehcqBAzWiVgauUaQaU8G6VBv0V6LTXVWj6n_4ko-GUMNeHekJauYuHGidQxOQQ/exec';

export async function senMesByPhone({ message, uid, phone }) {
    const url = new URL(SCRIPT_URL_SEND_MESSAGE);
    url.searchParams.set('mes', message);
    if (uid) {
        url.searchParams.set('uid', uid)
    }
    else if (phone) {
        url.searchParams.set('phone', phone);
    } else {
        throw new Error('Cần cung cấp Uid hoặc Số điện thoại để gọi Google Script.');
    }
    const response = await fetch(url.toString());
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Script (gửi tin) trả về lỗi HTTP: ${response.status} - ${errorText}`);
    }
    return response.json();
}

export async function getZaloUid(phone) {
    if (!phone) {
        return { uid: null, success: false, message: 'Yêu cầu số điện thoại.' };
    }
    try {
        const url = `${SCRIPT_URL_GET_UID}?phone=${encodeURIComponent(phone)}`;
        const response = await fetch(url);
        if (!response.ok) {
            return { uid: null, success: false, message: 'Dịch vụ lấy Zalo UID không khả dụng.' };
        }
        const result = await response.json();
        if (result.status === 2 && result.data?.uid) {
            return { uid: result.data.uid, success: true, message: result.mes };
        }
        return { uid: null, success: false, message: result.mes || 'Không tìm thấy UID, vui lòng kiểm tra lại số điện thoại.' };
    } catch (error) {
        return { uid: null, success: false, message: 'Đã xảy ra lỗi trong quá trình lấy Zalo UID.' };
    }
}

export async function sendGP(mes) {
    console.log('Gửi GP', mes, !mes);
    if (!mes) return false
    const encodedMessage = encodeURIComponent(mes);
    const url = `${SCRIPT_URL_GP}?mes=${encodedMessage}`;
    const response = await fetch(url);
    const result = await response.json();
    console.log(result, 1);
    if (response.ok) {
        return true
    }
    
    return false
}

export async function actionZalo({ phone, uidPerson = '', actionType, message = '', uid }) {
    let formattedPhone
    if (phone) {
        formattedPhone = phone.toString().trim();
        if (formattedPhone.startsWith('+84')) {
        } else if (formattedPhone.startsWith('0')) {
            formattedPhone = `+84${formattedPhone.substring(1)}`;
        } else {
            formattedPhone = `+84${formattedPhone}`;
        }
    }
    if (!uid && !actionType) {
        return { status: false, message: 'Cần cung cấp UID hoặc actionType để thực hiện hành động.', content: '' };
    }
    console.log({
        uid: uid,
        phone: formattedPhone,
        uidPerson: uidPerson,
        actionType: actionType,
        message: ml(message),
    });
    try {
        const response = await fetch(SCRIPT_URL_ACTION, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                uid: uid,
                phone: formattedPhone,
                uidPerson: uidPerson,
                actionType: actionType,
                message: ml(message),
            }),
            cache: "no-store",
        });
        if (!response.ok) return { status: false, message: 'Lỗi trước khi thực hiện hành động (lỗi gọi appscript)', content: '' };
        const result = await response.json();
        console.log(result);

        return result
    } catch (error) {
        return { status: false, message: `${error}`, content: '' };
    }
}

const ml = (strings, ...values) => {
    let s;
    if (Array.isArray(strings)) {                 // gọi dạng tag: ml`...`
        s = strings.reduce((out, str, i) => out + str + (values[i] ?? ''), '');
    } else {                                      // gọi dạng hàm: ml(mes)
        s = String(strings);
    }
    return s
        .replace(/\r\n?/g, '\n')  // chuẩn hoá xuống dòng về \n
        .replace(/^\n/, '')
        .replace(/\n$/, '');
};