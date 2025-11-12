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
          <h1 className="text-2xl font-semibold">Formula Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">Define and manage signal generation formulas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingFormula(null)} data-testid="button-add-formula">
              <Plus className="h-4 w-4 mr-2" />
              Add Formula
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingFormula ? "Edit Formula" : "Create New Formula"}</DialogTitle>
              <DialogDescription>Define the conditions for signal generation</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Formula Name</Label>
                <Input id="name" placeholder="e.g., High ROE Stocks" data-testid="input-formula-name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="scope">Scope</Label>
                  <Select defaultValue="global">
                    <SelectTrigger id="scope" data-testid="select-scope">
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
                  <Label htmlFor="signal">Signal Type</Label>
                  <Select defaultValue="BUY">
                    <SelectTrigger id="signal" data-testid="select-signal">
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
                <Label htmlFor="condition">Formula Condition</Label>
                <Textarea
                  id="condition"
                  placeholder="e.g., ROE > 20 AND PE < 15"
                  className="font-mono text-sm"
                  rows={4}
                  data-testid="input-condition"
                />
                <p className="text-xs text-muted-foreground">
                  Use metrics like ROE, PE, PEG, Revenue_Growth, Debt_to_Equity, etc.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority (lower = higher priority)</Label>
                <Input id="priority" type="number" defaultValue="999" data-testid="input-priority" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} data-testid="button-save-formula">Save Formula</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Formulas</CardTitle>
          <CardDescription>Manage signal generation rules with multi-level scoping</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead className="text-center">Priority</TableHead>
                <TableHead className="text-center">Enabled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formulas.map((formula) => (
                <TableRow key={formula.id} data-testid={`row-formula-${formula.id}`}>
                  <TableCell className="font-medium">{formula.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {formula.scope}
                      {formula.scopeValue && `: ${formula.scopeValue}`}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-xs truncate">{formula.condition}</TableCell>
                  <TableCell>
                    <SignalBadge signal={formula.signal} showIcon={false} />
                  </TableCell>
                  <TableCell className="text-center font-mono">{formula.priority}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={formula.enabled}
                      onCheckedChange={() => handleToggle(formula.id)}
                      data-testid={`switch-enable-${formula.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="icon" variant="ghost" data-testid={`button-test-${formula.id}`}>
                        <TestTube className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(formula)} data-testid={`button-edit-${formula.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(formula.id)} data-testid={`button-delete-${formula.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
