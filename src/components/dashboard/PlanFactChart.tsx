import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { planFact30d } from "@/mock/dashboard";
import { fmtDateShort, fmtNum } from "@/lib/format";

export function PlanFactChart() {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={planFact30d} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => fmtDateShort(v)}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            contentStyle={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "var(--shadow-overlay)",
              fontSize: 13,
              color: "var(--text-primary)",
            }}
            labelFormatter={(v) => fmtDateShort(v as string)}
            formatter={(value: number, name) => [
              `${fmtNum(value)} м²`,
              name === "plan" ? "План" : "Факт",
            ]}
          />
          <Line
            type="monotone"
            dataKey="plan"
            stroke="var(--info)"
            strokeWidth={2}
            dot={false}
            strokeDasharray="4 3"
          />
          <Line type="monotone" dataKey="fact" stroke="var(--accent)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
