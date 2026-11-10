import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StackSummary } from "../../../shared/types";
import { StackFolderSection } from "./StackFolderSection";
import { buildStackFolderTree } from "./folder-utils";

describe("StackFolderSection component", () => {
  const folder = {
    id: "f-prod",
    name: "Produção",
    parentId: null,
    color: "emerald" as const,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const stack: StackSummary = {
    id: "s-api",
    name: "checkout-api",
    type: "compose",
    status: "deployed",
    folderId: "f-prod",
    composeYaml: "services:\n  api:\n    image: node:22\n",
    env: [],
    webhookToken: "tok",
    autoDeploy: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    containersCount: 1,
    runningContainersCount: 1,
    containers: [
      {
        id: "c1",
        name: "checkout-api-1",
        state: "running",
        status: "Up 1h",
        image: "node:22",
        ports: [],
      },
    ],
  };

  const stoppedStack: StackSummary = {
    ...stack,
    id: "s-worker",
    name: "checkout-worker",
    status: "stopped",
    runningContainersCount: 0,
    containers: [
      {
        id: "c2",
        name: "checkout-worker-1",
        state: "exited",
        status: "Exited (0)",
        image: "node:22",
        ports: [],
      },
    ],
  };

  it("renders binder health, toggles expand, and auto-expands on beforematch", () => {
    const { rootNodes } = buildStackFolderTree({
      folders: [folder],
      stacks: [stack, stoppedStack],
      statusFilter: "all",
      search: "",
    });
    const node = rootNodes[0]!;
    const onToggleExpand = vi.fn();
    const onEnsureExpanded = vi.fn();
    const onBatchStart = vi.fn();
    const onRequestBatchStop = vi.fn();

    render(
      <StackFolderSection
        node={node}
        isExpanded={() => false}
        onToggleExpand={onToggleExpand}
        onEnsureExpanded={onEnsureExpanded}
        isOperator={true}
        batchPending={null}
        onBatchStart={onBatchStart}
        onRequestBatchStop={onRequestBatchStop}
        onCreateStackInFolder={vi.fn()}
        onCreateSubfolder={vi.fn()}
        onEditFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
        renderStackCard={(s) => <div key={s.id}>{s.name}</div>}
      />,
    );

    const toggleBtn = screen.getByRole("button", { name: /^Produção/i });
    expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("1/2 rodando")).toBeInTheDocument();

    const controlsId = toggleBtn.getAttribute("aria-controls")!;
    const panelEl = document.getElementById(controlsId)!;
    // Em browsers com suporte a hidden="until-found", preserva o valor; no jsdom booleano, mantém hidden presente
    expect(panelEl).toHaveAttribute("hidden");

    // Simulate browser Find-in-Page beforematch event
    fireEvent(panelEl, new Event("beforematch", { bubbles: true }));
    expect(onEnsureExpanded).toHaveBeenCalledWith("f-prod");

    fireEvent.click(toggleBtn);
    expect(onToggleExpand).toHaveBeenCalledWith("f-prod");

    // Trigger batch actions
    fireEvent.click(screen.getByRole("button", { name: /Iniciar todas as stacks da pasta Produção/i }));
    expect(onBatchStart).toHaveBeenCalledWith("f-prod");

    fireEvent.click(screen.getByRole("button", { name: /Parar todas as stacks da pasta Produção/i }));
    expect(onRequestBatchStop).toHaveBeenCalledWith(node);
  });
});
