import Loading from "@/components/(ui)/(loading)/loading";

export default function Load() {
    return (
        <div style={{ width: '100%', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Loading content={'Chờ tải dữ liệu'} />
        </div>
    );
}