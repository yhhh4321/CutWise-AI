import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, RefreshCw, Pencil } from 'lucide-react';

interface Message {
  id: number;
  role: string;
  content: string;
  model_name?: string | null;
}

interface Props {
  msg: Message;
  onCopy: (text: string) => void;
  onEdit?: (messageId: number, currentContent: string) => void;
  onRegenerate?: (messageId: number) => void;
  isLastAssistant?: boolean;
  streaming?: boolean;
}

export default function MessageBubble({ msg, onCopy, onEdit, onRegenerate, isLastAssistant, streaming }: Props) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex gap-3 px-5 py-4 group relative ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-apple-blue to-purple-500 flex items-center justify-center shrink-0 text-xs font-bold text-white">
          AI
        </div>
      )}
      <div className={`max-w-[72%] ${isUser ? 'order-first' : ''}`}>
        {isUser ? (
          <div className="relative bg-apple-blue text-white rounded-2xl rounded-tr-md px-4 py-3 text-sm leading-relaxed shadow-lg shadow-apple-blue/10">
            {msg.content}
            <button
              onClick={() => onEdit?.(msg.id, msg.content)}
              className="absolute -bottom-1 -right-1 opacity-0 group-hover:opacity-100 bg-apple-card border border-apple-border rounded-full p-1.5 text-apple-text-secondary hover:text-white transition-all shadow-md"
              title="编辑重发"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="bg-apple-card/50 backdrop-blur-sm rounded-2xl rounded-tl-md border border-apple-border/50 px-4 py-3 shadow-sm">
            <div className="markdown-body text-sm leading-relaxed text-apple-text">
              <ReactMarkdown
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeStr = String(children).replace(/\n$/, '');
                    if (match) {
                      return (
                        <div className="relative group/code">
                          <button
                            onClick={() => onCopy(codeStr)}
                            className="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100 text-apple-text-secondary hover:text-white p-1.5 rounded transition-all z-10"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <SyntaxHighlighter
                            style={oneDark}
                            language={match[1]}
                            PreTag="div"
                          >
                            {codeStr}
                          </SyntaxHighlighter>
                        </div>
                      );
                    }
                    return <code className="bg-apple-secondary px-1.5 py-0.5 rounded text-sm" {...props}>{children}</code>;
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              {msg.content && (
                <button
                  onClick={() => onCopy(msg.content)}
                  className="text-[11px] text-apple-text-secondary hover:text-apple-text transition-colors flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> 复制
                </button>
              )}
              {isLastAssistant && !streaming && onRegenerate && (
                <button
                  onClick={() => onRegenerate(msg.id)}
                  className="text-[11px] text-apple-text-secondary hover:text-apple-blue transition-colors flex items-center gap-1 ml-2"
                >
                  <RefreshCw className="w-3 h-3" /> 重新生成
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
