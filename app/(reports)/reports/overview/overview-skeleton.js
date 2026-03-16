export default function OverviewSkeleton() {
    return (
        <div className="flex flex-col gap-6 p-4 animate-pulse">
            <div className="flex flex-wrap gap-4 items-end">
                <div className="h-10 w-28 bg-muted rounded" />
                <div className="h-10 w-28 bg-muted rounded" />
                <div className="h-10 w-36 bg-muted rounded" />
                <div className="h-10 w-32 bg-muted rounded" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-28 border rounded-lg bg-muted/50" />
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="h-72 bg-muted/50 rounded-lg" />
                <div className="h-72 bg-muted/50 rounded-lg" />
            </div>
        </div>
    );
}
