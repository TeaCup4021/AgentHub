import { Nav } from "@douyinfe/semi-ui";
import { IconComment, IconUserGroup, IconSetting } from "@douyinfe/semi-icons";
import { useNavigate, useLocation } from "react-router-dom";

export function IconSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isSettings = location.pathname === "/settings";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      width: "var(--icon-nav-width)",
      flexShrink: 0,
      background: "var(--color-bg-sidebar)",
      borderRight: "1px solid var(--color-border-light)",
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
            if (data.itemKey === "settings") navigate("/settings");
          }}
          footer={{ collapseButton: false }}
        />
      </div>
    </div>
  );
}
