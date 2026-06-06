import { useEffect } from "react";
import { Modal } from "@douyinfe/semi-ui";

interface FullscreenModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function FullscreenModal({ visible, onClose, title, children }: FullscreenModalProps) {
  useEffect(() => {
    if (!visible) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [visible, onClose]);

  return (
    <Modal
      visible={visible}
      fullScreen
      onCancel={onClose}
      footer={null}
      title={title}
      bodyStyle={{ padding: 0, height: "calc(100% - 48px)" }}
    >
      {children}
    </Modal>
  );
}
