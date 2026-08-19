import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Application loading state.
 *
 * Deliberately shaped like the dashboard rather than a spinner, so the layout
 * does not jump when the real data arrives.
 */
export default function AppLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-6 w-64" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardContent className="flex items-center gap-5 px-5 py-5">
            <Skeleton className="size-28 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-28" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 px-5 py-5 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-7 w-10" />
                <Skeleton className="h-1.5 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="px-5 py-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-7 w-16" />
              <Skeleton className="mt-3 h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 px-5 py-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
