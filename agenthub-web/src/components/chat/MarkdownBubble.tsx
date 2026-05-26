import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { Components } from "react-markdown";
import { HighlightedCode } from "./HighlightedCode";

const components: Components = {
  code({ className, children, ...props }) {
    const inline = !className;
    const code = String(children).replace(/\n$/, "");
    if (inline) {
      return (
        <code
          className="bg-gray-200 text-amber-700 rounded px-1.5 py-0.5 text-[0.8em] font-mono break-all"
          {...props}
        >
          {code}
        </code>
      );
    }
    const match = /language-(\w+)/.exec(className || "");
    const lang = match ? match[1] : "";
    return <HighlightedCode code={code} language={lang} />;
  },
  pre({ children }) {
    return <>{children}</>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-2">
        <table className="min-w-full border-collapse border border-gray-300 text-sm">
          {children}
        </table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border border-gray-300 bg-gray-100 px-3 py-1.5 text-left font-semibold">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border border-gray-300 px-3 py-1.5">{children}</td>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-blue-400 pl-3 my-2 text-gray-600 italic">
        {children}
      </blockquote>
    );
  },
  ul({ children }) {
    return <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>;
  },
  h1({ children }) {
    return <h1 className="text-lg font-bold mt-3 mb-1">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-base font-bold mt-2 mb-1">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>;
  },
  hr() {
    return <hr className="my-3 border-gray-300" />;
  },
  p({ children }) {
    return <p className="my-1 leading-relaxed">{children}</p>;
  },
};

interface MarkdownBubbleProps {
  text: string;
  isStreaming?: boolean;
}

export function MarkdownBubble({ text, isStreaming }: MarkdownBubbleProps) {
  const body = useMemo(() => {
    if (!text) return null;
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    );
  }, [text]);

  return (
    <div className="text-sm leading-relaxed break-words">
      {body}
      {isStreaming && (
        <span className="ml-0.5 inline-block w-1.5 h-4 bg-blue-500 animate-pulse align-text-bottom" />
      )}
    </div>
  );
}
