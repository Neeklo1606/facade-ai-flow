import { getSnapshot } from "@/adapters/gas-ops/state";
import { entryView } from "@/domain/gas-ops/view";
const s = getSnapshot() as any;
for (const e of s.entries) {
  const n = Number(e.number.slice(3));
  if (n < 94) continue;
  const v = entryView(s, e);
  console.log(e.number, e.day, e.brigadeId, v.brigade?.name, e.objectId, v.object?.label, e.start ?? e.startMinutes, e.endMinutes, e.amountRub, e.source, v.amountOrigin, v.estimate ? `${v.estimate.status}/${v.estimate.origin}/v${v.estimate.version}/${v.estimate.amountRub ?? v.estimate.costRub}` : "-", v.flags.join(","));
}
