import { Modal, Form, Button } from "@douyinfe/semi-ui";
import { useCreateProject } from "@/hooks/useProjects";
import type { CreateProjectParams } from "@/types";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ProjectCreateModal({ visible, onClose }: Props) {
  const createProject = useCreateProject();

  return (
    <Modal
      title="新建项目"
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{ width: 440 }}
    >
      <Form
        onSubmit={async (values) => {
          await createProject.mutateAsync(values as CreateProjectParams);
          onClose();
        }}
      >
        {({ formState }) => (
          <>
            <Form.Input
              field="name"
              label="项目名称"
              rules={[{ required: true, message: "请输入项目名称" }]}
              placeholder="例如：AgentHub 前端开发"
              trigger="blur"
            />
            <Form.TextArea
              field="description"
              label="描述"
              placeholder="简短描述项目用途"
              maxCount={200}
              trigger="blur"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <Button theme="borderless" onClick={onClose} type="tertiary">
                取消
              </Button>
              <Button
                htmlType="submit"
                type="primary"
                disabled={!formState.values.name}
                loading={createProject.isPending}
              >
                创建
              </Button>
            </div>
          </>
        )}
      </Form>
    </Modal>
  );
}
