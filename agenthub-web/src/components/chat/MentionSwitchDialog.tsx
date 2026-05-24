interface MentionSwitchDialogProps {
  currentAgentName: string;
  mentionedAgentNames: string[];
  onSwitchToSingle: () => void;
  onConvertToGroup: () => void;
  onIgnore: () => void;
  onClose: () => void;
}

export function MentionSwitchDialog({
  currentAgentName,
  mentionedAgentNames,
  onSwitchToSingle,
  onConvertToGroup,
  onIgnore,
  onClose,
}: MentionSwitchDialogProps) {
  const mentionedList = mentionedAgentNames.join(", ");
  const isMulti = mentionedAgentNames.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-96 rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-lg font-semibold">检测到 @提及</h2>
        <p className="text-sm text-gray-600">
          你 @ 了 <span className="font-medium text-blue-600">@{mentionedList}</span>，
          但当前对话绑定的 Agent 是 <span className="font-medium">{currentAgentName}</span>。
        </p>
        <p className="mt-1 text-sm text-gray-500">你想怎么处理？</p>

        <div className="mt-4 space-y-2">
          {isMulti ? (
            <button
              onClick={onConvertToGroup}
              className="w-full rounded-md border border-blue-300 bg-blue-50 px-4 py-2.5 text-left text-sm hover:bg-blue-100"
            >
              <span className="font-medium text-blue-700">转为群聊</span>
              <span className="ml-2 text-gray-500">
                — 将 {currentAgentName} 和 {mentionedList} 加入群聊
              </span>
            </button>
          ) : (
            <button
              onClick={onSwitchToSingle}
              className="w-full rounded-md border border-blue-300 bg-blue-50 px-4 py-2.5 text-left text-sm hover:bg-blue-100"
            >
              <span className="font-medium text-blue-700">切换为 @{mentionedAgentNames[0]} 的单聊</span>
              <span className="ml-2 text-gray-500">
                — 创建新对话并发送
              </span>
            </button>
          )}

          {!isMulti && (
            <button
              onClick={onConvertToGroup}
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-left text-sm hover:bg-gray-100"
            >
              <span className="font-medium text-gray-700">转为群聊</span>
              <span className="ml-2 text-gray-500">
                — 将 {currentAgentName} 和 {mentionedList} 加入同一群聊
              </span>
            </button>
          )}

          <button
            onClick={onIgnore}
            className="w-full rounded-md border border-gray-200 bg-white px-4 py-2.5 text-left text-sm hover:bg-gray-50"
          >
            <span className="font-medium text-gray-700">仅发送给 {currentAgentName}</span>
            <span className="ml-2 text-gray-500">
              — 忽略 @提及，保持现有对话
            </span>
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded-md px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
