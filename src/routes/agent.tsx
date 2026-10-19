import { completePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { AgentChat } from "@/components/agent/AgentChat";

export const Route = createFileRoute("/agent")({
  head: () =>
    completePageHead(
      {
        meta: [
          { title: "Ассистент — гайка" },
          {
            name: "description",
            content:
              "Вопросы об объектах, документах и поставках с ответом по данным системы и ссылкой на первоисточник.",
          },
          { property: "og:title", content: "Ассистент — гайка" },
          { property: "og:type", content: "website" },
        ],
      },
      "Ассистент — гайка",
      "Ответы по данным объекта со ссылками на источники.",
    ),
  component: AgentChat,
});
