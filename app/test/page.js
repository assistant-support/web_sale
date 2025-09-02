import { Zalo } from "zca-js";

async function xyz() {
    const zalo = new Zalo({
        selfListen: false, // mặc định false, lắng nghe sự kiện của bản thân
        checkUpdate: true, // mặc định true, kiểm tra update
        logging: true // mặc định true, bật/tắt log mặc định của thư viện
    });

    // đọc cookie đã lưu ở bước 5
    const cookie = [{ "domain": ".zalo.me", "expirationDate": 1790944303.756298, "hostOnly": false, "httpOnly": false, "name": "_ga", "path": "/", "sameSite": "unspecified", "secure": false, "session": false, "storeId": "0", "value": "GA1.2.1736189593.1745149601" }, { "domain": ".zalo.me", "expirationDate": 1791346877.712144, "hostOnly": false, "httpOnly": false, "name": "__zi", "path": "/", "sameSite": "no_restriction", "secure": true, "session": false, "storeId": "0", "value": "3000.SSZzejyD6zOgdh2mtnLQWYQN_RAG01ICFjIXe9fEM8yuaUcacqHUY7EIxA3IH5s5Svhlgpap.1" }, { "domain": ".zalo.me", "expirationDate": 1791346877.7123, "hostOnly": false, "httpOnly": false, "name": "__zi-legacy", "path": "/", "sameSite": "unspecified", "secure": false, "session": false, "storeId": "0", "value": "3000.SSZzejyD6zOgdh2mtnLQWYQN_RAG01ICFjIXe9fEM8yuaUcacqHUY7EIxA3IH5s5Svhlgpap.1" }, { "domain": ".zalo.me", "expirationDate": 1779709629.469576, "hostOnly": false, "httpOnly": false, "name": "ozi", "path": "/", "sameSite": "unspecified", "secure": false, "session": false, "storeId": "0", "value": "2000.QOBlzDCV2uGerkFzm09Gs6FJuV360bNTBjJdzOy2Lj0ktEJ-EJC.1" }, { "domain": ".zalo.me", "expirationDate": 1787920338.359135, "hostOnly": false, "httpOnly": true, "name": "zpsid", "path": "/", "sameSite": "no_restriction", "secure": true, "session": false, "storeId": "0", "value": "Ii2o.368477220.81.SkM1jg-ryl-BCGJgexNo_zh6WCoPZSR8c8V0pww0PK4efhQmhkQ-JyUryly" }, { "domain": ".chat.zalo.me", "expirationDate": 1757991768.638876, "hostOnly": false, "httpOnly": true, "name": "zpw_sek", "path": "/", "sameSite": "lax", "secure": true, "session": false, "storeId": "0", "value": "8z_P.368477220.a0.i0fm5SoyaUheE6V_xRoHwhUUz87kXhF1kEJ4tgJ6eOogzDUGWSJskvJlkhkhWQp8iRsaVN8xWgw3lSMcVDIHwW" }, { "domain": ".zalo.me", "expirationDate": 1757360623.562933, "hostOnly": false, "httpOnly": true, "name": "zoaw_sek", "path": "/", "sameSite": "no_restriction", "secure": true, "session": false, "storeId": "0", "value": "pVO2.1438426725.2.3WPlQr9b3oytmxDwKcKFBr9b3ozIPGylKnNucZfb3oy" }, { "domain": ".zalo.me", "expirationDate": 1757360623.563039, "hostOnly": false, "httpOnly": false, "name": "zoaw_type", "path": "/", "sameSite": "no_restriction", "secure": true, "session": false, "storeId": "0", "value": "0" }, { "domain": ".zalo.me", "expirationDate": 1756873275.481752, "hostOnly": false, "httpOnly": false, "name": "_zlang", "path": "/", "sameSite": "unspecified", "secure": true, "session": false, "storeId": "0", "value": "vn" }, { "domain": ".zalo.me", "expirationDate": 1756959677.802878, "hostOnly": false, "httpOnly": true, "name": "app.event.zalo.me", "path": "/", "sameSite": "unspecified", "secure": false, "session": false, "storeId": "0", "value": "1790618359489358928" }];
    const api = await zalo.login({
        cookie: cookie,
        imei: "d9ba1025-d3e6-4b06-93df-dd4c1b8af04f-33d0f257a817d1ca4c4381b87f8ad83f", // điền giá trị đã lấy ở bước 3
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36", // điền giá trị đã lấy ở bước 4
    });
    let messages = "";
    api.listener.on("message", (message) => {
        messages = messages + "\n" + JSON.stringify(message, null, 2);
        console.log(message);
    });

    api.listener.start();
    return messages
}

export default async function Page() {
    let data = await xyz();
    return <pre>{data}</pre>
}