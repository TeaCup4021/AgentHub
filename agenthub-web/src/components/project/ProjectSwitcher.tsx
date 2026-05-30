import { useState } from "react";
import { Dropdown } from "@douyinfe/semi-ui";
import { IconChevronDown, IconPlus } from "@douyinfe/semi-icons";
import { useProjects } from "@/hooks/useProjects";
import { useUIStore } from "@/stores/uiStore";
import { ProjectCreateModal } from "./ProjectCreateModal";

export function ProjectSwitcher() {
  const { data: projects } = useProjects();
  const selectedProjectId = useUIStore((s) => s.selectedProjectId);
  const setSelectedProjectId = useUIStore((s) => s.setSelectedProjectId);
  const [createOpen, setCreateOpen] = useState(false);

  const selectedProject = selectedProjectId
    ? projects?.find((p) => p.id === selectedProjectId)
    : null;

  return (
    <>
      <Dropdown
        trigger="click"
        position="right"
        menu={[
          {
            node: "item",
            name: "全部项目",
            active: !selectedProjectId,
            onClick: () => setSelectedProjectId(null),
          },
          { node: "divider" },
          ...(projects || []).map((p) => ({
            node: "item" as const,
            name: p.name,
            active: selectedProjectId === p.id,
            onClick: () => setSelectedProjectId(p.id),
          })),
          { node: "divider" },
          {
            node: "item",
            name: "新建项目",
            icon: <IconPlus />,
            onClick: () => setCreateOpen(true),
          },
        ]}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 12px 8px",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-text-primary)",
          userSelect: "none",
        }}>
          <span style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}>
            {selectedProject ? selectedProject.name : "全部项目"}
          </span>
          <IconChevronDown size="small" style={{ flexShrink: 0 }} />
        </div>
      </Dropdown>
      <ProjectCreateModal visible={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
