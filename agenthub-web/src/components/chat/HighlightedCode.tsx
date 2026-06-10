import { useState, useEffect, useMemo } from "react";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import darkPlus from "shiki/themes/dark-plus.mjs";
import githubLightDefault from "shiki/themes/github-light-default.mjs";
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

const THEMES = {
  dark: "dark-plus",
  light: "github-light-default",
} as const;

function isDarkMode(): boolean {
  return document.body.getAttribute("theme-mode") === "dark";
}

let highlighter: HighlighterCore | null = null;
let initPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (highlighter) return Promise.resolve(highlighter);
  if (initPromise) return initPromise;

  const engine = createJavaScriptRegexEngine();
  initPromise = createHighlighterCore({
    themes: [darkPlus, githubLightDefault],
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
  const [dark, setDark] = useState(isDarkMode);
  const [folded, setFolded] = useState(true);
  const [copied, setCopied] = useState(false);
  const lineCount = useMemo(() => code.split("\n").length, [code]);
  const shouldFold = maxLines > 0 && lineCount > maxLines;
  const theme = dark ? THEMES.dark : THEMES.light;

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(isDarkMode());
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["theme-mode"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    getHighlighter().then((h) => {
      if (cancelled) return;
      const loaded = h.getLoadedLanguages();
      if (!loaded.includes(language)) {
        setHtml("");
        return;
      }
      const result = h.codeToHtml(code, { lang: language, theme });
      setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language, theme]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bg = dark ? "#1e1e1e" : "#f6f8fa";
  const headerBg = dark ? "#2d2d2d" : "#e8eaed";
  const headerBorder = dark ? "border-gray-700" : "border-gray-300";
  const headerText = dark ? "text-gray-400" : "text-gray-600";
  const badgeBg = dark ? "bg-gray-800" : "bg-gray-200";
  const badgeText = dark ? "text-gray-500" : "text-gray-500";
  const textColor = dark ? "text-gray-200" : "text-gray-800";
  const copyHover = dark ? "hover:text-gray-200" : "hover:text-gray-800";
  const foldBg = dark ? "bg-gray-800/50 hover:bg-gray-800" : "bg-gray-100 hover:bg-gray-200";
  const foldText = dark ? "text-gray-400" : "text-gray-500";
  const foldBorder = dark ? "border-gray-700" : "border-gray-300";

  return (
    <div className="my-2 overflow-hidden rounded-md text-left" style={{ background: bg }}>
      {showHeader && (
        <div className={`flex items-center justify-between px-3 py-1.5 border-b ${headerBorder}`} style={{ background: headerBg }}>
          <span className={`text-xs ${headerText}`}>{fileName || language || "code"}</span>
          <div className="flex items-center gap-2">
            {language && (
              <span className={`text-[10px] uppercase ${badgeText} ${badgeBg} px-1.5 py-0.5 rounded`}>
                {language}
              </span>
            )}
            <button
              className={`text-xs ${headerText} ${copyHover} transition-colors`}
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
            className="shiki-code-block [&_pre]:!bg-transparent [&_pre]:!p-0 [&_code]:!bg-transparent [&_.line]:!min-w-0"
          />
        ) : (
          <pre>
            <code className={`block py-2 ${textColor}`}>{code}</code>
          </pre>
        )}
      </div>
      {shouldFold && (
        <button
          className={`w-full py-1.5 text-xs ${foldText} ${foldBg} transition-colors border-t ${foldBorder}`}
          onClick={() => setFolded(!folded)}
        >
          {folded ? `展开全部 (${lineCount} 行)` : "收起"}
        </button>
      )}
    </div>
  );
}