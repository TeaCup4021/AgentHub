import { useMemo } from "react";
import { useTokenUsageStore } from "@/stores/tokenUsageStore";

export function TokenUsagePanel() {
  const usageMap = useTokenUsageStore((s) => s.usageMap);
  const usages = useMemo(() => Object.values(usageMap), [usageMap]);

  const { totalInput, totalOutput, totalCost } = useMemo(() => {
    let input = 0;
    let output = 0;
    let cost = 0;
    for (const u of usages) {
      input += u.inputTokens;
      output += u.outputTokens;
      cost += u.estimatedCost;
    }
    return { totalInput: input, totalOutput: output, totalCost: cost };
  }, [usages]);

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Token 用量</h2>
      <p className="text-xs text-gray-500 mb-4">
        统计各会话的 Token 消耗和预估成本。数据从每次会话完成后累积。
      </p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">输入 Token</p>
          <p className="text-lg font-semibold text-gray-800">
            {(totalInput / 1000).toFixed(1)}k
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">输出 Token</p>
          <p className="text-lg font-semibold text-gray-800">
            {(totalOutput / 1000).toFixed(1)}k
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">预估成本</p>
          <p className="text-lg font-semibold text-gray-800">
            ${totalCost.toFixed(4)}
          </p>
        </div>
      </div>

      {usages.length > 0 ? (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-gray-50 text-[10px] font-medium text-gray-500">
            <span>会话</span>
            <span className="text-right">输入</span>
            <span className="text-right">输出</span>
            <span className="text-right">成本</span>
          </div>
          {usages
            .slice()
            .sort((a, b) => b.totalTokens - a.totalTokens)
            .map((u) => (
              <div
                key={u.conversationId}
                className="grid grid-cols-4 gap-2 px-3 py-2 border-t border-gray-100 text-xs"
              >
                <span className="text-gray-800 truncate">{u.conversationTitle}</span>
                <span className="text-right text-gray-500">
                  {(u.inputTokens / 1000).toFixed(1)}k
                </span>
                <span className="text-right text-gray-500">
                  {(u.outputTokens / 1000).toFixed(1)}k
                </span>
                <span className="text-right text-gray-600">
                  ${u.estimatedCost.toFixed(4)}
                </span>
              </div>
            ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 py-4 text-center">
          暂无用量数据，完成对话后自动统计
        </p>
      )}
    </section>
  );
}
