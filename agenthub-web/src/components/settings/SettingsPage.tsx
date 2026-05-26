import { LLMConfigSection } from "./LLMConfigSection";
import { TokenUsagePanel } from "./TokenUsagePanel";

export function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-900">设置</h1>
      </div>
      <LLMConfigSection />
      <TokenUsagePanel />
    </div>
  );
}
