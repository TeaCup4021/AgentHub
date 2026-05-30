import { useState } from "react";
import { Nav, Avatar, Dropdown } from "@douyinfe/semi-ui";
import { IconComment, IconUserGroup, IconSetting, IconUser, IconExit, IconPlus } from "@douyinfe/semi-icons";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useProjects } from "@/hooks/useProjects";
import { useUIStore } from "@/stores/uiStore";
import { ProjectCreateModal } from "@/components/project/ProjectCreateModal";

export function IconSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { data: projects } = useProjects();
  const selectedProjectId = useUIStore((s) => s.selectedProjectId);
  const setSelectedProjectId = useUIStore((s) => s.setSelectedProjectId);
  const [createOpen, setCreateOpen] = useState(false);

  const isSettings = location.pathname === "/settings";
  const isMock = import.meta.env.VITE_USE_MOCK !== "false";

  const selectedProject = selectedProjectId
    ? projects?.find((p) => p.id === selectedProjectId)
    : null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      width: "var(--icon-nav-width)",
      flexShrink: 0,
      background: "var(--color-bg-sidebar)",
      borderRadius: "var(--radius-card)",
      boxShadow: "var(--shadow-card)",
      overflow: "hidden",
    }}>
      <Nav
        mode="vertical"
        isCollapsed
        defaultSelectedKeys={[isSettings ? "" : "chat"]}
        style={{ height: "auto" }}
        onClick={(data) => {
          if (data.itemKey === "chat") navigate("/");
          if (data.itemKey === "agents") navigate("/agents");
        }}
        items={[
          { itemKey: "chat", text: "聊天", icon: <IconComment /> },
          { itemKey: "agents", text: "Agent 市场", icon: <IconUserGroup /> },
        ]}
        footer={{ collapseButton: false }}
      />

      {/* 分隔线 */}
      <div style={{
        margin: "4px 12px",
        height: 1,
        background: "var(--color-border-light)",
        flexShrink: 0,
      }} />

      {/* 项目区域 */}
      <Dropdown
        trigger="click"
        position="right"
        menu={[
          {
            node: "item",
            name: "全部项目",
            icon: <IconComment />,
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
          justifyContent: "center",
          padding: "8px 0",
          cursor: "pointer",
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-md)",
            background: selectedProject ? "var(--color-primary)" : "var(--color-fill-2)",
            color: selectedProject ? "#fff" : "var(--color-text-tertiary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            transition: "background 0.15s, color 0.15s",
            flexShrink: 0,
          }}>
            {selectedProject
              ? selectedProject.name.charAt(0).toUpperCase()
              : <IconPlus size="small" />
            }
          </div>
        </div>
      </Dropdown>

      <div style={{ marginTop: "auto" }}>
        <Nav
          mode="vertical"
          isCollapsed
          defaultSelectedKeys={[isSettings ? "settings" : ""]}
          style={{ height: "auto" }}
          items={[
            { itemKey: "settings", text: "设置", icon: <IconSetting /> },
          ]}
          onClick={(data) => {
            if (data.itemKey === "settings") {
              navigate("/settings");
            }
          }}
          footer={{ collapseButton: false }}
        />
        {user && (
          <Dropdown
            trigger="click"
            position="rightBottom"
            menu={[
              {
                node: "item",
                name: user.email,
                icon: <IconUser />,
                disabled: true,
              },
              { node: "divider" },
              {
                node: "item",
                name: "退出登录",
                icon: <IconExit />,
                onClick: () => {
                  logout();
                  navigate("/login");
                },
              },
            ]}
          >
            <div style={{
              display: "flex",
              justifyContent: "center",
              padding: "12px 0",
              cursor: "pointer",
            }}>
              <Avatar
                size="extra-extra-small"
                alt={user.name}
                src={user.avatarUrl || undefined}
                style={{ flexShrink: 0 }}
              >
                {user.name?.charAt(0)?.toUpperCase() || "U"}
              </Avatar>
            </div>
          </Dropdown>
        )}
        <div
          title={isMock ? "Mock 模式" : "真实 API 模式"}
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "8px 0 12px",
          }}
        >
          <div style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isMock ? "var(--color-warning)" : "var(--color-success)",
            boxShadow: `0 0 6px ${isMock ? "var(--color-warning)" : "var(--color-success)"}`,
          }} />
        </div>
      </div>

      <ProjectCreateModal visible={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
