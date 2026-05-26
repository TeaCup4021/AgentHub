interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

export function Skeleton({ width = "100%", height = 16, borderRadius = "var(--radius-sm)", style }: SkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: "var(--color-bg-hover)",
        animation: "skeleton-pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function ConversationSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Skeleton width={32} height={32} borderRadius="50%" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={10} />
        </div>
      </div>
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px" }}>
      <Skeleton width={32} height={32} borderRadius="50%" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, maxWidth: "60%" }}>
        <Skeleton width={80} height={12} />
        <Skeleton width="100%" height={60} borderRadius="var(--radius-lg)" />
      </div>
    </div>
  );
}
