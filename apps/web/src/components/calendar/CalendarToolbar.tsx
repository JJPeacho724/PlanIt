import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  view: "month" | "week" | "day";
  onViewChange: (v: Props["view"]) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
};

export function CalendarToolbar({ view, onViewChange, onPrev, onNext, onToday }: Props) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onPrev} className="p-1.5">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} className="p-1.5">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday} className="px-3 py-1.5">Today</Button>
      </div>

      <SegmentedControl
        value={view}
        onChange={(v) => onViewChange(v as Props["view"])}
        size="sm"
        options={[
          { value: "month", label: "Month" },
          { value: "week", label: "Week" },
          { value: "day", label: "Day" },
        ]}
      />
    </div>
  );
}
