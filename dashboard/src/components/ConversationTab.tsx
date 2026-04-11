'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ZigrixConversationData } from '@/types/dashboard';
import styles from './ConversationTab.module.css';

type Props = {
  selectedTaskId: string | null;
  conversation: ZigrixConversationData | null;
};

type ContentPart = { type: 'text' | 'thinking' | 'toolCall' | 'toolResult'; text: string; toolName?: string };

function hashColor(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) hash = (hash << 5) - hash + input.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 45%)`;
}

function asParts(content: unknown, toolName?: string | null): ContentPart[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (!Array.isArray(content)) {
    return [{ type: 'text', text: content == null ? '' : JSON.stringify(content, null, 2) }];
  }

  return content.flatMap<ContentPart>((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const type = String(row.type || 'text');

    if ((type === 'text' || type === 'markdown') && typeof row.text === 'string') {
      return [{ type: 'text', text: row.text }];
    }
    if (type === 'thinking' && typeof row.thinking === 'string') {
      return [{ type: 'thinking', text: row.thinking }];
    }
    if ((type === 'tool_use' || type === 'toolCall') && (typeof row.name === 'string' || typeof row.toolName === 'string')) {
      const name = (row.name as string) || (row.toolName as string) || toolName || 'tool';
      return [{ type: 'toolCall', toolName: name, text: JSON.stringify(row.input ?? row.arguments ?? {}, null, 2) }];
    }
    if (type === 'tool_result' || type === 'toolResult') {
      return [{ type: 'toolResult', toolName: toolName || 'tool', text: typeof row.content === 'string' ? row.content : JSON.stringify(row.content ?? row, null, 2) }];
    }
    if (typeof row.text === 'string') return [{ type: 'text', text: row.text }];
    return [{ type: 'text', text: JSON.stringify(row, null, 2) }];
  });
}

function shouldShowPart(part: ContentPart, role: string | null, debug: boolean) {
  if (part.type === 'text') return role === 'assistant' || role === 'user';
  return debug;
}

export function ConversationTab({ selectedTaskId, conversation }: Props) {
  const [debug, setDebug] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 200) {
      el.scrollTop = el.scrollHeight;
    }
  }, [conversation?.stream.length]);

  const messages = useMemo(() => conversation?.stream || [], [conversation]);

  if (!selectedTaskId) return <div className={styles.empty}>태스크를 선택해 주세요.</div>;

  if (!conversation || conversation.taskId !== selectedTaskId) {
    return <div className={styles.notice}>대화 내역을 불러오는 중...</div>;
  }

  if (!conversation.openclawAvailable) {
    return <div className={styles.notice}>OpenClaw 연동 필요</div>;
  }

  return (
    <div className={styles.wrap}>
      <label className={styles.toggle}>
        <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
        <span>Debug</span>
      </label>

      <div ref={listRef} className={styles.list}>
        {messages.length === 0 ? <div className={styles.notice}>대화 내역이 없습니다.</div> : null}
        {messages.map((msg, idx) => {
          const parts = asParts(msg.content, msg.toolName);
          const agentColor = hashColor(msg.agentId || msg.agentName || 'agent');
          return (
            <article key={`${msg.sessionKey}-${msg.timestamp || idx}`} className={styles.message}>
              <header className={styles.header}>
                <span className={styles.agent} style={{ backgroundColor: agentColor }}>{msg.agentName || msg.agentId}</span>
                <span className={styles.meta}>{msg.role || 'unknown'}</span>
                <span className={styles.meta}>{msg.ts ? new Date(msg.ts).toLocaleTimeString('ko-KR') : '-'}</span>
              </header>

              <div className={styles.body}>
                {parts.filter((p) => shouldShowPart(p, msg.role, debug)).map((part, pidx) => {
                  if (part.type === 'thinking') {
                    return (
                      <details key={pidx} className={styles.thinking}>
                        <summary>thinking</summary>
                        <pre>{part.text}</pre>
                      </details>
                    );
                  }

                  if (part.type === 'toolCall' || part.type === 'toolResult') {
                    return (
                      <div key={pidx} className={styles.toolBox}>
                        <span className={styles.toolName}>{part.type}: {part.toolName}</span>
                        <pre>{part.text}</pre>
                      </div>
                    );
                  }

                  return (
                    <div key={pidx} className={styles.markdown}>
                      <ReactMarkdown>{part.text || ''}</ReactMarkdown>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
