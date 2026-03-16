export default function ReportsLoading() {
    return (
        <div className="flex flex-col gap-4 p-4 animate-pulse">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="border-b border-gray-200 pb-4">
                <div className="flex gap-6">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-10 w-32 bg-muted rounded" />
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-28 bg-muted rounded-lg" />
                ))}
            </div>
            <div className="h-64 bg-muted rounded-lg mt-4" />
        </div>
    );
}
