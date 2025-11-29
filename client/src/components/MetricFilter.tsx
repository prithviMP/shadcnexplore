import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MetricFilter {
  metric: string;
  min: string;
  max: string;
}

interface MetricFilterProps {
  filters: MetricFilter[];
  onFiltersChange: (filters: MetricFilter[]) => void;
}

export default function MetricFilter({ filters, onFiltersChange }: MetricFilterProps) {
  const { data: metricsData } = useQuery<{ metrics: string[] }>({
    queryKey: ["/api/metrics/all"],
  });

  const availableMetrics = metricsData?.metrics || [];

  const addFilter = () => {
    onFiltersChange([
      ...filters,
      { metric: "", min: "", max: "" }
    ]);
  };

  const removeFilter = (index: number) => {
    onFiltersChange(filters.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, field: keyof MetricFilter, value: string) => {
    const updated = [...filters];
    updated[index] = { ...updated[index], [field]: value };
    onFiltersChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Metric Filters</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addFilter}
          disabled={filters.length >= 5}
        >
          Add Filter
        </Button>
      </div>
      
      {filters.length === 0 ? (
        <p className="text-sm text-muted-foreground">No metric filters applied</p>
      ) : (
        <div className="space-y-3">
          {filters.map((filter, index) => (
            <div key={index} className="flex items-end gap-2 p-3 border rounded-lg bg-muted/30">
              <div className="flex-1 space-y-2">
                <Label className="text-xs">Metric</Label>
                <Select
                  value={filter.metric}
                  onValueChange={(value) => updateFilter(index, "metric", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select metric" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMetrics.map((metric) => (
                      <SelectItem key={metric} value={metric}>
                        {metric}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-xs">Min</Label>
                <Input
                  type="number"
                  placeholder="Min"
                  value={filter.min}
                  onChange={(e) => updateFilter(index, "min", e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label className="text-xs">Max</Label>
                <Input
                  type="number"
                  placeholder="Max"
                  value={filter.max}
                  onChange={(e) => updateFilter(index, "max", e.target.value)}
                  className="w-full"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeFilter(index)}
                className="h-9 w-9"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters
            .filter(f => f.metric)
            .map((filter, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {filter.metric}
                {filter.min && ` ≥ ${filter.min}`}
                {filter.max && ` ≤ ${filter.max}`}
              </Badge>
            ))}
        </div>
      )}
    </div>
  );
}

