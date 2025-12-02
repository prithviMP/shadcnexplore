import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Settings as SettingsIcon, Save, RotateCcw, Search, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DefaultMetricsResponse {
  metrics: Record<string, boolean>;
  visibleMetrics: string[];
}

// Default metrics configuration (must match backend)
const DEFAULT_METRICS: Record<string, boolean> = {
  "Sales": true,
  "Sales Growth(YoY) %": true,
  "Sales Growth(QoQ) %": true,
  "Expenses": false,
  "Operating Profit": false,
  "OPM %": true,
  "Financing Profit": false,
  "Financing Margin %": false,
  "Other Income": false,
  "Interest": false,
  "Depreciation": false,
  "Profit before tax": false,
  "Tax %": false,
  "Net Profit": false,
  "EPS in Rs": true,
  "EPS Growth(YoY) %": true,
  "EPS Growth(QoQ) %": true,
  "Gross NPA %": false,
};

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [localMetrics, setLocalMetrics] = useState<Record<string, boolean>>(DEFAULT_METRICS);

  // Fetch default metrics configuration
  const { data: metricsData, isLoading } = useQuery<DefaultMetricsResponse>({
    queryKey: ["/api/settings/default-metrics"],
  });

  // Update localMetrics when data loads
  useEffect(() => {
    if (metricsData?.metrics) {
      const metrics = metricsData.metrics;
      // Only update if we have metrics
      if (Object.keys(metrics).length > 0) {
        setLocalMetrics(metrics);
      }
    } else if (!isLoading) {
      // If query finished loading but no data, ensure we have defaults
      setLocalMetrics(prev => {
        // Only set defaults if current state is empty
        if (Object.keys(prev).length === 0) {
          return { ...DEFAULT_METRICS };
        }
        return prev;
      });
    }
  }, [metricsData, isLoading]);

  // Save metrics mutation
  const saveMutation = useMutation({
    mutationFn: async (metrics: Record<string, boolean>) => {
      const res = await apiRequest("PUT", "/api/settings/default-metrics", { metrics });
      return res.json();
    },
    onSuccess: (data) => {
      // Update local state with saved metrics to ensure consistency
      if (data.metrics) {
        setLocalMetrics(data.metrics);
      }
      toast({
        title: "Settings saved",
        description: "Default metrics configuration has been updated successfully.",
      });
      // Refetch to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: ["/api/settings/default-metrics"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error saving settings",
        description: error.message || "Failed to save metrics configuration.",
        variant: "destructive",
      });
    },
  });

  // Reset to default metrics
  const resetToDefault = () => {
    setLocalMetrics({ ...DEFAULT_METRICS });
  };

  const handleSave = () => {
    saveMutation.mutate(localMetrics);
  };

  const handleToggleMetric = (metricName: string) => {
    setLocalMetrics((prev) => ({
      ...prev,
      [metricName]: !prev[metricName],
    }));
  };

  const handleSelectAll = () => {
    const allSelected: Record<string, boolean> = {};
    Object.keys(localMetrics).forEach((key) => {
      allSelected[key] = true;
    });
    setLocalMetrics(allSelected);
  };

  const handleDeselectAll = () => {
    const allDeselected: Record<string, boolean> = {};
    Object.keys(localMetrics).forEach((key) => {
      allDeselected[key] = false;
    });
    setLocalMetrics(allDeselected);
  };

  // Filter metrics based on search term
  const filteredMetrics = Object.entries(localMetrics).filter(([metricName]) =>
    metricName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedCount = Object.values(localMetrics).filter(Boolean).length;
  const totalCount = Object.keys(localMetrics).length;
  // Compare with loaded data or empty object if not loaded yet
  const hasChanges = metricsData?.metrics 
    ? JSON.stringify(localMetrics) !== JSON.stringify(metricsData.metrics)
    : Object.keys(localMetrics).length > 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>Loading settings...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                Default Metrics Settings
              </CardTitle>
              <CardDescription>
                Configure which metrics are displayed by default in quarterly data views
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-sm">
              {selectedCount} of {totalCount} selected
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              These settings determine which metrics are automatically selected when viewing quarterly data
              in the Company Detail and Sectors List pages. Users can still manually select/deselect metrics
              on those pages, but these will be the defaults.
            </AlertDescription>
          </Alert>

          {/* Search and Actions */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search metrics..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeselectAll}>
              Deselect All
            </Button>
            <Button variant="outline" size="sm" onClick={resetToDefault}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Default
            </Button>
          </div>

          {/* Metrics List */}
          <ScrollArea className="h-[500px] rounded-md border p-4">
            <div className="space-y-3">
              {filteredMetrics.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No metrics found matching "{searchTerm}"
                </div>
              ) : (
                filteredMetrics.map(([metricName, isSelected]) => (
                  <div key={metricName} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50">
                    <Checkbox
                      id={metricName}
                      checked={isSelected}
                      onCheckedChange={() => handleToggleMetric(metricName)}
                    />
                    <Label
                      htmlFor={metricName}
                      className="flex-1 cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {metricName}
                    </Label>
                    {isSelected && (
                      <Badge variant="secondary" className="text-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Save Button */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {hasChanges ? (
                <span className="text-amber-600">You have unsaved changes</span>
              ) : (
                <span>All changes saved</span>
              )}
            </div>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

