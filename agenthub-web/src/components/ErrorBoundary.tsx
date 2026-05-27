import { Component } from "react";
import { Button } from "@douyinfe/semi-ui";
import { IconRefresh } from "@douyinfe/semi-icons";

interface Props {
  children: React.ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          gap: 12,
          borderRadius: "var(--radius-lg)",
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border-light)",
          margin: 16,
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "var(--color-bg-hover)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
          }}>
            !
          </div>
          <p style={{
            fontSize: "var(--font-size-md)",
            fontWeight: 500,
            color: "var(--color-text-primary)",
            margin: 0,
          }}>
            出错了
          </p>
          <p style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--color-text-tertiary)",
            margin: 0,
            textAlign: "center",
            maxWidth: 320,
          }}>
            {this.state.error?.message || "渲染时发生未知错误"}
          </p>
          <Button
            icon={<IconRefresh />}
            onClick={this.handleRetry}
            style={{ marginTop: 4 }}
          >
            重试
          </Button>
        </div>
      );
    }

    return <>{this.props.children}</>;
  }
}
