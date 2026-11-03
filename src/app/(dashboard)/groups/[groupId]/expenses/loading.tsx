import { Card, CardContent } from "@/components/ui/card";

export default function ExpensesLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading expenses">
      <div className="space-y-3">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="h-8 w-40 rounded bg-muted" />
        <div className="h-4 w-64 max-w-full rounded bg-muted" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} size="sm">
            <CardContent className="space-y-3">
              <div className="h-4 w-1/2 rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
              <div className="h-3 w-1/3 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
