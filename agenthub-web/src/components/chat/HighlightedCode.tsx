import { useState, useEffect, useMemo } from "react";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import darkPlus from "shiki/themes/dark-plus.mjs";
import ts from "shiki/langs/typescript.mjs";
import tsx from "shiki/langs/tsx.mjs";
import js from "shiki/langs/javascript.mjs";
import jsx from "shiki/langs/jsx.mjs";
import python from "shiki/langs/python.mjs";
import rust from "shiki/langs/rust.mjs";
import go from "shiki/langs/go.mjs";
import java from "shiki/langs/java.mjs";
import css from "shiki/langs/css.mjs";
import html from "shiki/langs/html.mjs";
import json from "shiki/langs/json.mjs";
import yaml from "shiki/langs/yaml.mjs";
import bash from "shiki/langs/bash.mjs";
import markdown from "shiki/langs/markdown.mjs";
import sql from "shiki/langs/sql.mjs";
import diff from "shiki/langs/diff.mjs";

import type { HighlighterCore } from "shiki/core";

const LANGS = [
  ts, tsx, js, jsx, python, rust, go, java, css, html,
  json, yaml, bash, markdown, sql, diff,
];

let highlighter: HighlighterCore | null = null;
let initPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (highlighter) return Promise.resolve(highlighter);
  if (initPromise) return initPromise;

  const engine = createJavaScriptRegexEngine();
  initPromise = createHighlighterCore({
    themes: [darkPlus],
    langs: LANGS,
    engine,
  }).then((h) => {
    highlighter = h;
    return h;
  });

  return initPromise;
}

interface HighlightedCodeProps {
  code: string;
  language: string;
  fileName?: string;
  maxLines?: number;
  showHeader?: boolean;
}

export function HighlightedCode({
  code,
  language,
  fileName,
  maxLines = 30,
  showHeader = true,
}: HighlightedCodeProps) {
  const [html, setHtml] = useState("");
  const [folded, setFolded] = useState(true);
  const [copied, setCopied] = useState(false);
  const lineCount = useMemo(() => code.split("\n").length, [code]);
  const shouldFold = maxLines > 0 && lineCount > maxLines;

  useEffect(() => {
    let cancelled = false;
    getHighlighter().then((h) => {
      if (cancelled) return;
      const loaded = h.getLoadedLanguages();
      if (!loaded.includes(language)) {
        setHtml("");
        return;
      }
      const result = h.codeToHtml(code, { lang: language, theme: "dark-plus" });
      setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 overflow-hidden rounded-md bg-[#1e1e1e] text-left">
      {showHeader && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700">
          <span className="text-xs text-gray-400">{fileName || language || "code"}</span>
          <div className="flex items-center gap-2">
            {language && (
              <span className="text-[10px] uppercase text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                {language}
              </span>
            )}
            <button
              className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              onClick={handleCopy}
            >
              {copied ? "已复制" : "复制"}
            </button>
          </div>
        </div>
      )}
      <div
        className={`overflow-x-auto px-3 pb-3 text-xs ${
          shouldFold && folded ? "max-h-[500px] overflow-y-hidden" : ""
        }`}
      >
        {html ? (
          <div
            dangerouslySetInnerHTML={{ __html: html }}
            className="[&_pre]:!bg-transparent [&_pre]:!p-0 [&_code]:!bg-transparent"
          />
        ) : (
          <pre>
            <code className="text-gray-200 block py-2">{code}</code>
          </pre>
        )}
      </div>
      {shouldFold && (
        <button
          className="w-full py-1.5 text-xs text-gray-400 bg-gray-800/50 hover:bg-gray-800 transition-colors border-t border-gray-700"
          onClick={() => setFolded(!folded)}
        >
          {folded ? `展开全部 (${lineCount} 行)` : "收起"}
        </button>
      )}
    </div>
  );
}
