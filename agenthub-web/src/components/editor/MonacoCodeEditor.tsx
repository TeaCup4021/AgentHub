import { useState, useCallback, useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Button } from "@douyinfe/semi-ui";
import { useUIStore } from "@/stores/uiStore";

interface MonacoCodeEditorProps {
  code: string;
  language: string;
  fileName?: string;
  readOnly?: boolean;
  onChange?: (value: string | undefined) => void;
  onSave?: (code: string) => void;
}

export function MonacoCodeEditor({ code, language, fileName, readOnly = false, onChange, onSave }: MonacoCodeEditorProps) {
  const theme = useUIStore((s) => s.theme);
  const resolvedTheme = theme === "system"
    ? (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "vs-dark" : "vs")
    : theme === "dark" ? "vs-dark" : "vs";
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [localCode, setLocalCode] = useState(code);

  useEffect(() => { setLocalCode(code); }, [code]);

  const handleMount: OnMount = useCallback((ed) => {
    editorRef.current = ed;
    if (onSave) {
      ed.addCommand(2048 /* CtrlCmd */ | 49 /* KeyS */, () => {
        const value = ed.getValue();
        setLocalCode(value);
        onSave(value);
      });
    }
  }, [onSave]);

  const handleSave = useCallback(() => {
    if (onSave && editorRef.current) {
      const value = editorRef.current.getValue();
      setLocalCode(value);
      onSave(value);
    }
  }, [onSave]);

  return (
    <div style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
      {(fileName || onSave) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 12px", background: "var(--color-bg-hover)",
          borderBottom: "1px solid var(--color-border-light)",
          fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)",
        }}>
          <span>{fileName || `code.${language || "txt"}`}</span>
          {!readOnly && onSave && (
            <Button size="small" theme="solid" type="primary" onClick={handleSave}>保存</Button>
          )}
        </div>
      )}
      <Editor
        height={readOnly ? 300 : Math.max(200, Math.min(600, localCode.split("\n").length * 20 + 40))}
        language={language || "text"}
        value={localCode}
        theme={resolvedTheme}
        onChange={(v) => { setLocalCode(v ?? ""); onChange?.(v); }}
        options={{ readOnly, minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 13, lineNumbers: "on", tabSize: 2 }}
        onMount={handleMount}
      />
    </div>
  );
}
