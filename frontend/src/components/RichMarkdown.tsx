import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  className?: string;
}

/** Markdown with @tailwindcss/typography, tuned to the paper/ink palette. */
export function RichMarkdown({ content, className = '' }: Props) {
  return (
    <div
      className={`prose prose-sm max-w-none text-ink-soft prose-headings:font-extrabold prose-headings:text-ink prose-p:my-1.5 prose-p:leading-relaxed prose-a:text-leaf-700 prose-strong:text-ink prose-li:my-0.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-blockquote:border-l-leaf-300 prose-blockquote:text-ink-muted prose-hr:border-line ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="not-prose my-2 w-full overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-paper-2 text-ink">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-line px-3 py-2 font-bold whitespace-nowrap">{children}</th>
          ),
          td: ({ children }) => <td className="border-b border-line/70 px-3 py-2 align-top text-ink-soft">{children}</td>,
          code: ({ children }) => (
            <code className="rounded-md bg-paper-3 px-1.5 py-0.5 text-[0.85em] font-semibold text-clay-700 before:content-none after:content-none">
              {children}
            </code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
