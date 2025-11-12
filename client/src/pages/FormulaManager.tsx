import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, TestTube } from "lucide-react";
import SignalBadge from "@/components/SignalBadge";

//todo: remove mock functionality
const MOCK_FORMULAS = [
  { id: 1, name: "High ROE", scope: "Global", scopeValue: null, condition: "ROE > 20", signal: "BUY" as const, priority: 1, enabled: true },
  { id: 2, name: "Low PEG", scope: "Global", scopeValue: null, condition: "PEG < 1.5", signal: "BUY" as const, priority: 2, enabled: true },
  { id: 3, name: "High Debt", scope: "Global", scopeValue: null, condition: "Debt_to_Equity > 2", signal: "SELL" as const, priority: 3, enabled: true },
  { id: 4, name: "Tech Growth", scope: "Sector", scopeValue: "Technology", condition: "Revenue_Growth > 10", signal: "BUY" as const, priority: 10, enabled: true },
  { id: 5, name: "Overvalued", scope: "Sector", scopeValue: "Technology", condition: "PE > 50", signal: "SELL" as const, priority: 20, enabled: false },
];

export default function FormulaManager() {
  const [formulas, setFormulas] = useState(MOCK_FORMULAS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFormula, setEditingFormula] = useState<typeof MOCK_FORMULAS[0] | null>(null);

  const handleToggle = (id: number) => {
    setFormulas(formulas.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
    console.log("Toggled formula:", id);
  };

  const handleDelete = (id: number) => {
    setFormulas(formulas.filter(f => f.id !== id));
    console.log("Deleted formula:", id);
  };

  const handleEdit = (formula: typeof MOCK_FORMULAS[0]) => {
    setEditingFormula(formula);
    setDialogOpen(true);
  };

  const handleSave = () => {
    console.log("Saving formula:", editingFormula);
    setDialogOpen(false);
    setEditingFormula(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            Formula Manager
          </h1>
          <p className="text-muted-foreground mt-1">Define and manage signal generation formulas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingFormula(null)} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg" data-testid="button-add-formula">
              <Plus className="h-4 w-4 mr-2" />
              Add Formula
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-slate-200 dark:border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-xl">{editingFormula ? "Edit Formula" : "Create New Formula"}</DialogTitle>
              <DialogDescription>Define the conditions for signal generation</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="font-medium">Formula Name</Label>
                <Input id="name" placeholder="e.g., High ROE Stocks" className="h-11" data-testid="input-formula-name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="scope" className="font-medium">Scope</Label>
                  <Select defaultValue="global">
                    <SelectTrigger id="scope" className="h-11" data-testid="select-scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global</SelectItem>
                      <SelectItem value="sector">Sector</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signal" className="font-medium">Signal Type</Label>
                  <Select defaultValue="BUY">
                    <SelectTrigger id="signal" className="h-11" data-testid="select-signal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BUY">BUY</SelectItem>
                      <SelectItem value="SELL">SELL</SelectItem>
                      <SelectItem value="HOLD">HOLD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="condition" className="font-medium">Formula Condition</Label>
                <Textarea
                  id="condition"
                  placeholder="e.g., ROE > 20 AND PE < 15"
                  className="font-mono text-sm min-h-24 bg-slate-50 dark:bg-slate-900/50"
                  rows={4}
                  data-testid="input-condition"
                />
                <p className="text-xs text-muted-foreground">
                  Use metrics like ROE, PE, PEG, Revenue_Growth, Debt_to_Equity, etc.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority" className="font-medium">Priority (lower = higher priority)</Label>
                <Input id="priority" type="number" defaultValue="999" className="h-11" data-testid="input-priority" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700" data-testid="button-save-formula">Save Formula</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/50 border-slate-200 dark:border-slate-800 shadow-lg">
        <CardHeader>
          <CardTitle>Active Formulas</CardTitle>
          <CardDescription>Manage signal generation rules with multi-level scoping</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 dark:border-slate-800">
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">Scope</TableHead>
                  <TableHead className="font-semibold">Condition</TableHead>
                  <TableHead className="font-semibold">Signal</TableHead>
                  <TableHead className="text-center font-semibold">Priority</TableHead>
                  <TableHead className="text-center font-semibold">Enabled</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formulas.map((formula) => (
                  <TableRow key={formula.id} className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`row-formula-${formula.id}`}>
                    <TableCell className="font-medium">{formula.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs bg-slate-100 dark:bg-slate-800">
                        {formula.scope}
                        {formula.scopeValue && `: ${formula.scopeValue}`}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-xs truncate">{formula.condition}</TableCell>
                    <TableCell>
                      <SignalBadge signal={formula.signal} showIcon={false} />
                    </TableCell>
                    <TableCell className="text-center font-mono font-semibold">{formula.priority}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={formula.enabled}
                        onCheckedChange={() => handleToggle(formula.id)}
                        data-testid={`switch-enable-${formula.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`button-test-${formula.id}`}>
                          <TestTube className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(formula)} data-testid={`button-edit-${formula.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => handleDelete(formula.id)} data-testid={`button-delete-${formula.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
