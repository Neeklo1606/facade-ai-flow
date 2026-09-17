import { createFileRoute } from "@tanstack/react-router";
import { AgentChat } from "@/components/agent/AgentChat";

export const Route = createFileRoute("/agent")({
  head: () => ({
    meta: [
      { title: "Ассистент — neeklo FieldOps" },
      {
        name: "description",
        content:
          "Вопросы об объектах, документах и поставках с ответом по данным системы и ссылкой на первоисточник.",
      },
      { property: "og:title", content: "Ассистент — neeklo FieldOps" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AgentChat,
});
