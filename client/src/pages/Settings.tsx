import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Settings as SettingsIcon, Save, RotateCcw, Search, CheckCircle2, Building2, GripVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface DefaultMetricsResponse {
  metrics: Record<string, boolean>;
  visibleMetrics: string[];
  bankingMetrics?: Record<string, boolean>;
  visibleBankingMetrics?: string[];
  metricsOrder?: string[];
  bankingMetricsOrder?: string[];
  orderedVisibleMetrics?: string[];
  orderedVisibleBankingMetrics?: string[];
}

// Sortable Item Component
interface SortableItemProps {
  id: string;
  metricName: string;
  isSelected: boolean;
  onToggle: () => void;
  isBanking?: boolean;
}

function SortableItem({ id, metricName, isSelected, onToggle, isBanking }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 ${isDragging ? 'bg-muted shadow-lg' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
        type="button"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <Checkbox
        id={isBanking ? `banking-${metricName}` : metricName}
        checked={isSelected}
        onCheckedChange={onToggle}
      />
      <Label
        htmlFor={isBanking ? `banking-${metricName}` : metricName}
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
  );
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

// Default banking metrics configuration (must match backend)
// Includes all default metrics plus banking-specific ones
const DEFAULT_BANKING_METRICS: Record<string, boolean> = {
  "Sales": true,
  "Sales Growth(YoY) %": true,
  "Sales Growth(QoQ) %": true,
  "Expenses": false,
  "Operating Profit": false,
  "OPM %": true,
  "Financing Profit": true,
  "Financing Margin %": true,
  "Other Income": false,
  "Interest": false,
  "Depreciation": false,
  "Profit before tax": false,
  "Tax %": false,
  "Net Profit": false,
  "EPS in Rs": true,
  "EPS Growth(YoY) %": true,
  "EPS Growth(QoQ) %": true,
  "Gross NPA %": true,
};

// Default metric orders
const DEFAULT_METRICS_ORDER: string[] = [
  "Sales",
  "Sales Growth(YoY) %",
  "Sales Growth(QoQ) %",
  "Expenses",
  "Operating Profit",
  "OPM %",
  "Financing Profit",
  "Financing Margin %",
  "Other Income",
  "Interest",
  "Depreciation",
  "Profit before tax",
  "Tax %",
  "Net Profit",
  "EPS in Rs",
  "EPS Growth(YoY) %",
  "EPS Growth(QoQ) %",
  "Gross NPA %"
];

const DEFAULT_BANKING_METRICS_ORDER: string[] = [
  "Sales",
  "Sales Growth(YoY) %",
  "Sales Growth(QoQ) %",
  "Expenses",
  "Operating Profit",
  "OPM %",
  "Financing Profit",
  "Financing Margin %",
  "Other Income",
  "Interest",
  "Depreciation",
  "Profit before tax",
  "Tax %",
  "Net Profit",
  "EPS in Rs",
  "EPS Growth(YoY) %",
  "EPS Growth(QoQ) %",
  "Gross NPA %"
];

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [bankingSearchTerm, setBankingSearchTerm] = useState("");
  const [localMetrics, setLocalMetrics] = useState<Record<string, boolean>>(DEFAULT_METRICS);
  const [localBankingMetrics, setLocalBankingMetrics] = useState<Record<string, boolean>>(DEFAULT_BANKING_METRICS);
  const [localMetricsOrder, setLocalMetricsOrder] = useState<string[]>(DEFAULT_METRICS_ORDER);
  const [localBankingMetricsOrder, setLocalBankingMetricsOrder] = useState<string[]>(DEFAULT_BANKING_METRICS_ORDER);
  const [activeTab, setActiveTab] = useState<"default" | "banking">("default");

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
    
    // Update banking metrics
    if (metricsData?.bankingMetrics) {
      const bankingMetrics = metricsData.bankingMetrics;
      if (Object.keys(bankingMetrics).length > 0) {
        setLocalBankingMetrics(bankingMetrics);
      }
    } else if (!isLoading) {
      setLocalBankingMetrics(prev => {
        if (Object.keys(prev).length === 0) {
          return { ...DEFAULT_BANKING_METRICS };
        }
        return prev;
      });
    }
    
    // Update metric orders
    if (metricsData?.metricsOrder && metricsData.metricsOrder.length > 0) {
      setLocalMetricsOrder(metricsData.metricsOrder);
    }
    if (metricsData?.bankingMetricsOrder && metricsData.bankingMetricsOrder.length > 0) {
      setLocalBankingMetricsOrder(metricsData.bankingMetricsOrder);
    }
  }, [metricsData, isLoading]);

  // Save metrics mutation
  const saveMutation = useMutation({
    mutationFn: async ({ 
      metrics, 
      bankingMetrics, 
      metricsOrder, 
      bankingMetricsOrder 
    }: { 
      metrics?: Record<string, boolean>; 
      bankingMetrics?: Record<string, boolean>;
      metricsOrder?: string[];
      bankingMetricsOrder?: string[];
    }) => {
      const res = await apiRequest("PUT", "/api/settings/default-metrics", { 
        metrics, 
        bankingMetrics, 
        metricsOrder, 
        bankingMetricsOrder 
      });
      return res.json();
    },
    onSuccess: (data) => {
      // Update local state with saved metrics to ensure consistency
      if (data.metrics) {
        setLocalMetrics(data.metrics);
      }
      if (data.bankingMetrics) {
        setLocalBankingMetrics(data.bankingMetrics);
      }
      if (data.metricsOrder) {
        setLocalMetricsOrder(data.metricsOrder);
      }
      if (data.bankingMetricsOrder) {
        setLocalBankingMetricsOrder(data.bankingMetricsOrder);
      }
      toast({
        title: "Settings saved",
        description: "Metrics configuration has been updated successfully.",
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
    if (activeTab === "default") {
      setLocalMetrics({ ...DEFAULT_METRICS });
      setLocalMetricsOrder([...DEFAULT_METRICS_ORDER]);
    } else {
      setLocalBankingMetrics({ ...DEFAULT_BANKING_METRICS });
      setLocalBankingMetricsOrder([...DEFAULT_BANKING_METRICS_ORDER]);
    }
  };

  const handleSave = () => {
    if (activeTab === "default") {
      saveMutation.mutate({ metrics: localMetrics, metricsOrder: localMetricsOrder });
    } else {
      saveMutation.mutate({ bankingMetrics: localBankingMetrics, bankingMetricsOrder: localBankingMetricsOrder });
    }
  };

  // Handle drag end for reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      if (activeTab === "default") {
        setLocalMetricsOrder((items) => {
          const oldIndex = items.indexOf(active.id as string);
          const newIndex = items.indexOf(over.id as string);
          return arrayMove(items, oldIndex, newIndex);
        });
      } else {
        setLocalBankingMetricsOrder((items) => {
          const oldIndex = items.indexOf(active.id as string);
          const newIndex = items.indexOf(over.id as string);
          return arrayMove(items, oldIndex, newIndex);
        });
      }
    }
  };

  const handleToggleMetric = (metricName: string) => {
    if (activeTab === "default") {
      setLocalMetrics((prev) => ({
        ...prev,
        [metricName]: !prev[metricName],
      }));
    } else {
      setLocalBankingMetrics((prev) => ({
        ...prev,
        [metricName]: !prev[metricName],
      }));
    }
  };

  const handleSelectAll = () => {
    if (activeTab === "default") {
      const allSelected: Record<string, boolean> = {};
      Object.keys(localMetrics).forEach((key) => {
        allSelected[key] = true;
      });
      setLocalMetrics(allSelected);
      toast({
        title: "All metrics selected",
        description: `Selected all ${Object.keys(localMetrics).length} metrics`,
      });
    } else {
      const allSelected: Record<string, boolean> = {};
      Object.keys(localBankingMetrics).forEach((key) => {
        allSelected[key] = true;
      });
      setLocalBankingMetrics(allSelected);
      toast({
        title: "All metrics selected",
        description: `Selected all ${Object.keys(localBankingMetrics).length} banking metrics`,
      });
    }
  };

  const handleDeselectAll = () => {
    if (activeTab === "default") {
      const allDeselected: Record<string, boolean> = {};
      Object.keys(localMetrics).forEach((key) => {
        allDeselected[key] = false;
      });
      setLocalMetrics(allDeselected);
      toast({
        title: "All metrics deselected",
        description: `Deselected all ${Object.keys(localMetrics).length} metrics`,
      });
    } else {
      const allDeselected: Record<string, boolean> = {};
      Object.keys(localBankingMetrics).forEach((key) => {
        allDeselected[key] = false;
      });
      setLocalBankingMetrics(allDeselected);
      toast({
        title: "All metrics deselected",
        description: `Deselected all ${Object.keys(localBankingMetrics).length} banking metrics`,
      });
    }
  };

  // Get ordered metrics for display
  const currentOrder = activeTab === "default" ? localMetricsOrder : localBankingMetricsOrder;
  const currentMetrics = activeTab === "default" ? localMetrics : localBankingMetrics;
  const currentSearchTerm = activeTab === "default" ? searchTerm : bankingSearchTerm;
  
  // Create ordered list of metrics that includes all metrics
  const orderedMetricsList = useMemo(() => {
    const metricsInOrder = [...currentOrder];
    // Add any metrics not in the order array
    Object.keys(currentMetrics).forEach(metric => {
      if (!metricsInOrder.includes(metric)) {
        metricsInOrder.push(metric);
      }
    });
    return metricsInOrder;
  }, [currentOrder, currentMetrics]);
  
  // Filter metrics based on search term while maintaining order
  const filteredMetrics = useMemo(() => {
    return orderedMetricsList
      .filter(metricName => metricName.toLowerCase().includes(currentSearchTerm.toLowerCase()))
      .map(metricName => [metricName, currentMetrics[metricName] ?? false] as [string, boolean]);
  }, [orderedMetricsList, currentSearchTerm, currentMetrics]);

  const selectedCount = Object.values(activeTab === "default" ? localMetrics : localBankingMetrics).filter(Boolean).length;
  const totalCount = Object.keys(activeTab === "default" ? localMetrics : localBankingMetrics).length;
  
  // Compare with loaded data or empty object if not loaded yet (including order)
  const hasChanges = activeTab === "default"
    ? (metricsData?.metrics 
        ? (JSON.stringify(localMetrics) !== JSON.stringify(metricsData.metrics) ||
           JSON.stringify(localMetricsOrder) !== JSON.stringify(metricsData.metricsOrder || []))
        : Object.keys(localMetrics).length > 0)
    : (metricsData?.bankingMetrics
        ? (JSON.stringify(localBankingMetrics) !== JSON.stringify(metricsData.bankingMetrics) ||
           JSON.stringify(localBankingMetricsOrder) !== JSON.stringify(metricsData.bankingMetricsOrder || []))
        : Object.keys(localBankingMetrics).length > 0);

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
                Metrics Settings
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
              Configure default metrics for regular companies and banking companies separately.
              Banking companies are automatically detected based on their sector name (bank, banking, financial).
              Users can still manually select/deselect metrics on individual pages.
            </AlertDescription>
          </Alert>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "default" | "banking")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="default">
                <SettingsIcon className="h-4 w-4 mr-2" />
                Default Metrics
              </TabsTrigger>
              <TabsTrigger value="banking">
                <Building2 className="h-4 w-4 mr-2" />
                Banking Metrics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="default" className="space-y-4 mt-4">
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
                <Button variant="outline" size="sm" onClick={handleSelectAll} className="font-medium">
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeselectAll} className="font-medium">
                  Deselect All
                </Button>
                <Button variant="outline" size="sm" onClick={resetToDefault}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              </div>

              <Alert>
                <GripVertical className="h-4 w-4" />
                <AlertDescription>
                  Drag and drop metrics to reorder. The order determines how metrics are displayed in quarterly data views and Excel exports.
                </AlertDescription>
              </Alert>

              {/* Metrics List with Drag and Drop */}
              <ScrollArea className="h-[500px] rounded-md border p-4">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={filteredMetrics.map(([name]) => name)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1">
                  {filteredMetrics.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No metrics found matching "{searchTerm}"
                    </div>
                  ) : (
                    filteredMetrics.map(([metricName, isSelected]) => (
                          <SortableItem
                            key={metricName}
                          id={metricName}
                            metricName={metricName}
                            isSelected={isSelected}
                            onToggle={() => handleToggleMetric(metricName)}
                        />
                    ))
                  )}
                </div>
                  </SortableContext>
                </DndContext>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="banking" className="space-y-4 mt-4">
              {/* Search and Actions */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search banking metrics..."
                    value={bankingSearchTerm}
                    onChange={(e) => setBankingSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={handleSelectAll} className="font-medium">
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeselectAll} className="font-medium">
                  Deselect All
                </Button>
                <Button variant="outline" size="sm" onClick={resetToDefault}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              </div>

              <Alert>
                <GripVertical className="h-4 w-4" />
                <AlertDescription>
                  Drag and drop metrics to reorder. The order determines how metrics are displayed in quarterly data views and Excel exports for banking companies.
                </AlertDescription>
              </Alert>

              {/* Banking Metrics List with Drag and Drop */}
              <ScrollArea className="h-[500px] rounded-md border p-4">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={filteredMetrics.map(([name]) => name)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1">
                  {filteredMetrics.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No metrics found matching "{bankingSearchTerm}"
                    </div>
                  ) : (
                    filteredMetrics.map(([metricName, isSelected]) => (
                          <SortableItem
                            key={metricName}
                            id={metricName}
                            metricName={metricName}
                            isSelected={isSelected}
                            onToggle={() => handleToggleMetric(metricName)}
                            isBanking
                          />
                    ))
                  )}
                </div>
                  </SortableContext>
                </DndContext>
              </ScrollArea>
            </TabsContent>
          </Tabs>

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

