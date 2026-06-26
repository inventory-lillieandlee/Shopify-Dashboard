import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InventoryRow } from "@/lib/data/types";
import { CATEGORY_LABELS } from "@/lib/dashboard";
import { deriveThresholds } from "@/lib/projections/engine";

// Read-only per-SKU configuration. Thresholds are DERIVED at render via the
// engine's deriveThresholds() — never duplicated, never stored. No forms, no writes.
export function SettingsTable({ rows }: { rows: InventoryRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent [&>th]:h-9 [&>th]:text-xs [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-muted-foreground">
          <TableHead>Product</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Lead time</TableHead>
          <TableHead className="text-right">Safety stock</TableHead>
          <TableHead className="text-right">Critical ≤</TableHead>
          <TableHead className="text-right">Red ≤</TableHead>
          <TableHead className="text-right">Yellow ≤</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
              No active SKUs.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((r) => {
            const t = deriveThresholds(r.leadTimeDays, r.safetyStockDays);
            return (
              <TableRow key={r.productId}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{CATEGORY_LABELS[r.category]}</TableCell>
                <TableCell className="text-right tabular-nums">{r.leadTimeDays}d</TableCell>
                <TableCell className="text-right tabular-nums">{r.safetyStockDays}d</TableCell>
                <TableCell className="text-right tabular-nums">{t.critical}d</TableCell>
                <TableCell className="text-right tabular-nums">{t.red}d</TableCell>
                <TableCell className="text-right tabular-nums">{t.yellow}d</TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
