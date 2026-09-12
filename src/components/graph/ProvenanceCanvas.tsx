import { useCallback, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileAudio,
  FileText,
  Layers3,
  ScanLine,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FieldEvent, Risk } from "@/types";

type GraphKind = "source" | "agent" | "fact" | "risk" | "action" | "group";

type GraphData = {
  kind: GraphKind;
  typeLabel: string;
  title: string;
  time: string;
  status: string;
  confidence: number;
  detail: string;
  source: string;
  critical?: boolean;
};

type GraphNode = Node<GraphData, "provenance">;

const iconByKind = {
  source: FileAudio,
  agent: Bot,
  fact: ShieldCheck,
  risk: AlertTriangle,
  action: CheckCircle2,
  group: Layers3,
};

function ProvenanceNode({ data, selected }: NodeProps<GraphNode>) {
  const Icon = iconByKind[data.kind];
  return (
    <article className={cn("provenance-node", data.critical && "provenance-node-critical", selected && "provenance-node-active")}>
      <Handle type="target" position={Position.Left} className="provenance-handle" />
      <header className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-text-muted" aria-hidden />
        <span className="text-micro uppercase text-text-muted">{data.typeLabel}</span>
        <time className="mono ml-auto text-micro text-text-muted">{data.time}</time>
      </header>
      <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-[1.35] text-text-primary">{data.title}</p>
      <footer className="mt-auto flex items-center gap-1.5 text-micro text-text-muted">
        <span className={cn("size-1.5 rounded-full", data.critical ? "bg-danger" : data.confidence >= 0.85 ? "bg-ok" : "bg-warn")} />
        <span>{data.status}</span>
        <span className="mono ml-auto">{Math.round(data.confidence * 100)}%</span>
      </footer>
      <Handle type="source" position={Position.Right} className="provenance-handle" />
    </article>
  );
}

const nodeTypes = { provenance: ProvenanceNode };

function fitNodeLimit(nodes: GraphNode[], limit = 40): GraphNode[] {
  if (nodes.length <= limit) return nodes;
  const visible = nodes.slice(0, limit - 1);
  const last = visible.at(-1);
  return [
    ...visible,
    {
      id: "collapsed-events",
      type: "provenance",
      position: { x: (last?.position.x ?? 0) + 280, y: last?.position.y ?? 0 },
      data: {
        kind: "group",
        typeLabel: "Группа",
        title: `+${nodes.length - limit + 1} событий`,
        time: "",
        status: "Свёрнуто",
        confidence: 1,
        detail: "Дополнительные события свёрнуты для сохранения читаемости графа.",
        source: "Журнал проекта",
      },
    },
  ];
}

export function ProvenanceCanvas({ risk, source, siteName }: { risk: Risk; source?: FieldEvent; siteName: string }) {
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const rawNodes = useMemo<GraphNode[]>(() => [
    {
      id: "source",
      type: "provenance",
      position: { x: 40, y: 20 },
      data: {
        kind: "source",
        typeLabel: "Источник",
        title: source?.original.kind === "audio" ? "Голосовой отчёт с площадки" : source?.original.kind === "file" ? "Загруженный документ" : "Сообщение с объекта",
        time: source?.at.slice(11, 16) ?? "08:42",
        status: "Получено",
        confidence: 1,
        detail: source?.preview ?? risk.sourceLabel,
        source: source?.authorName ?? risk.sourceLabel,
      },
    },
    {
      id: "agent",
      type: "provenance",
      position: { x: 320, y: 140 },
      data: {
        kind: "agent",
        typeLabel: "AI-обработка",
        title: "Распознаны факты и связи",
        time: "08:43",
        status: "Обработано",
        confidence: source?.confidence ?? 0.88,
        detail: source ? `Извлечено полей: ${source.fields.length}. Событие сопоставлено с объектом и графиком работ.` : "Сигнал сопоставлен с планом работ и журналом объекта.",
        source: "Агент контроля фактов",
      },
    },
    {
      id: "fact",
      type: "provenance",
      position: { x: 600, y: 260 },
      data: {
        kind: "fact",
        typeLabel: "Факт",
        title: risk.cause,
        time: "08:43",
        status: "Подтверждено",
        confidence: 0.91,
        detail: `Факт зафиксирован на объекте «${siteName}» и проверен по исходному сообщению.`,
        source: siteName,
      },
    },
    {
      id: "risk",
      type: "provenance",
      position: { x: 880, y: 380 },
      data: {
        kind: "risk",
        typeLabel: "Риск",
        title: risk.risk,
        time: "08:44",
        status: "Критично",
        confidence: 0.87,
        detail: risk.cause,
        source: risk.id.toUpperCase(),
        critical: true,
      },
    },
    {
      id: "action",
      type: "provenance",
      position: { x: 1160, y: 500 },
      data: {
        kind: "action",
        typeLabel: "Действие",
        title: risk.action,
        time: "08:45",
        status: "Назначено",
        confidence: 1,
        detail: `Контрольный срок: ${risk.dueDate}. Ответственный назначен в проекте.`,
        source: "Решение РП",
      },
    },
  ], [risk, siteName, source]);

  const nodes = useMemo(() => fitNodeLimit(rawNodes), [rawNodes]);
  const edges = useMemo<Edge[]>(() => [
    { id: "source-agent", source: "source", target: "agent", className: "edge-assumed", markerEnd: { type: MarkerType.ArrowClosed, width: 6, height: 6 } },
    { id: "agent-fact", source: "agent", target: "fact", className: "edge-assumed", markerEnd: { type: MarkerType.ArrowClosed, width: 6, height: 6 } },
    { id: "fact-risk", source: "fact", target: "risk", className: "edge-confirmed", markerEnd: { type: MarkerType.ArrowClosed, width: 6, height: 6 } },
    { id: "risk-action", source: "risk", target: "action", className: "edge-critical", markerEnd: { type: MarkerType.ArrowClosed, width: 6, height: 6 } },
  ], []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: GraphNode) => setSelected(node), []);

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden bg-[var(--void)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.35}
        maxZoom={2}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        aria-label="Граф происхождения решения"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--graph-dot)" />
        <MiniMap className="provenance-minimap" nodeColor="var(--border-strong)" maskColor="var(--minimap-mask)" pannable zoomable />
        <Controls className="provenance-controls" showZoom={false} showInteractive={false} position="bottom-right" />
      </ReactFlow>

      {selected && (
        <aside className="provenance-drawer" aria-label="Детали узла">
          <div className="flex items-start gap-3 border-b border-border p-4">
            <div className="min-w-0 flex-1">
              <p className="terminal-label text-accent">{selected.data.typeLabel}</p>
              <h3 className="mt-1 text-heading">{selected.data.title}</h3>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelected(null)} aria-label="Закрыть детали"><X /></Button>
          </div>
          <dl className="space-y-4 p-4 text-dense">
            <div><dt className="terminal-label">Статус</dt><dd className="mt-1 text-text-primary">{selected.data.status}</dd></div>
            <div><dt className="terminal-label">Уверенность</dt><dd className="mono mt-1 text-text-primary">{Math.round(selected.data.confidence * 100)}%</dd></div>
            <div><dt className="terminal-label">Детали</dt><dd className="mt-1 leading-relaxed text-text-secondary">{selected.data.detail}</dd></div>
            <div><dt className="terminal-label">Источник</dt><dd className="mt-1 text-text-secondary">{selected.data.source}</dd></div>
          </dl>
        </aside>
      )}
    </div>
  );
}