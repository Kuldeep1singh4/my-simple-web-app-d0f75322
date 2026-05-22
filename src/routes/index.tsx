import { createFileRoute } from "@tanstack/react-router";
import { CodeVisualizer } from "@/components/CodeVisualizer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Code Visualizer — Trace Your Code Step by Step" },
      {
        name: "description",
        content:
          "Visualize JavaScript execution line by line with AI-powered tracing. Watch variables update in real time.",
      },
    ],
  }),
  component: () => <CodeVisualizer />,
});
