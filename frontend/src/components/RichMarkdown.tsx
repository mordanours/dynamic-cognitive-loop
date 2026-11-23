import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  className?: string;
}

export function RichMarkdown({ content, className = '' }: Props) {
  return (
    <div className={`prose prose-invert prose-xs max-w-none text-slate-200 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-2 w-full overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-900 text-slate-300">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-slate-800 px-2.5 py-1.5 font-semibold whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-slate-800/60 px-2.5 py-1.5 align-top">{children}</td>
          ),
          ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-4">{children}</ol>,
          p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
          code: ({ children }) => (
            <code className="rounded bg-slate-800 px-1 py-0.5 text-[11px] text-indigo-200">
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
